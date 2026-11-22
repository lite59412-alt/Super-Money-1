import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  ADMIN_2FA_CODE,
  DAILY_BONUS_LADDER,
  FIRST_DEPOSIT_TIERS,
  MIN_WITHDRAWAL_LIMIT,
  PRIMARY_OWNER_ADMIN_EMAIL,
  PROHIBITED_STATES,
  RELOAD_DEPOSIT_TIERS,
  REVIEW_INTERVAL_MS,
  UPLOADS_DIR,
  computeDepositBonusForAmount,
  createId,
  hashPassword,
  signToken,
  signWebhookPayload,
  store,
  verifyPassword,
  verifyToken,
  verifyWebhookSignature,
} from './server/store';
import type {
  AppAnnouncementTone,
  DepositPaymentMethod,
  GameCategory,
  GameEngineType,
  GameSessionRecord,
  LeaderboardEntry,
  WithdrawalStatus,
} from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

const QR_IMAGE_DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_QR_DATA_URL_LENGTH = 2_800_000; // ~2MB binary image

function validateQrImageDataUrl(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Invalid QR image format.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > MAX_QR_DATA_URL_LENGTH) {
    return { ok: false, error: 'QR code image is too large. Please upload an image under 2MB.' };
  }
  if (!QR_IMAGE_DATA_URL_REGEX.test(trimmed)) {
    return { ok: false, error: 'Only PNG, JPG, or WebP QR code images are allowed.' };
  }
  return { ok: true, value: trimmed };
}

// Transient in-memory OTP store (never persisted to disk; hashed before storage)
interface OtpRecord {
  otpHash: string;
  expiresAt: number;
  attempts: number;
  requestedTimestamps: number[];
}
const otpStore = new Map<string, OtpRecord>();

interface AuthedRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-session-token'] as string | undefined);

  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || typeof payload.userId !== 'string') {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }
  const user = store.data.users.find((u) => u.id === payload.userId);
  if (!user) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Account is suspended. Contact support for assistance.' });
    return;
  }
  req.userId = user.id;
  next();
}

const SESSION_TTL_MS = 365 * 86400 * 1000; // Persistent 1-year session until explicit logout
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueAdminToken(userId: string, email?: string): string {
  return signToken({
    userId,
    email: email ? email.trim().toLowerCase() : undefined,
    role: 'admin',
    twoFactorVerified: true,
    exp: Date.now() + SESSION_TTL_MS,
  });
}

function resolveAdminFromRequest(
  req: Request,
  queryToken?: string
): { ok: true; userId: string } | { ok: false; error: string } {
  const adminTokenHeader = (req.headers['x-admin-token'] as string | undefined) || queryToken;
  if (adminTokenHeader) {
    const payload = verifyToken(adminTokenHeader);
    if (payload && payload.role === 'admin' && payload.twoFactorVerified === true) {
      const uid = String(payload.userId || 'GR-ADM-0001');
      if (uid === 'GR-ADM-0001') {
        return { ok: true, userId: uid };
      }
      const user = store.data.users.find((u) => u.id === uid);
      if (user && user.status !== 'suspended' && store.isAdminUser(user)) {
        return { ok: true, userId: user.id };
      }
    }
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-session-token'] as string | undefined) || queryToken;

  if (bearerToken) {
    const payload = verifyToken(bearerToken);
    if (payload && typeof payload.userId === 'string') {
      const user = store.data.users.find((u) => u.id === payload.userId);
      if (user && user.status !== 'suspended' && store.isAdminUser(user)) {
        return { ok: true, userId: user.id };
      }
    }
  }

  return { ok: false, error: 'Admin access denied. Authorized admin Gmail login required.' };
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const check = resolveAdminFromRequest(req);
  if (!check.ok) {
    res.status(403).json({ error: check.error });
    return;
  }
  req.isAdmin = true;
  req.userId = check.userId;
  next();
}

// Real-time Server-Sent Events (SSE) broadcaster for authenticated Admin sessions
type AdminRealtimeEventType =
  | 'deposit:utr_submitted'
  | 'deposit:updated'
  | 'withdrawal:created'
  | 'withdrawal:updated';

interface AdminRealtimeEventPayload {
  userId: string;
  userName: string;
  recordId: string;
  amount: number;
  status: string;
  utrNumber?: string;
  paymentMethod?: string;
  createdAt: string;
}

const adminSseClients = new Set<Response>();

function broadcastAdminEvent(
  type: AdminRealtimeEventType,
  payload: AdminRealtimeEventPayload
): void {
  if (adminSseClients.size === 0) return;
  const serialized = `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const client of adminSseClients) {
    try {
      client.write(serialized);
    } catch {
      adminSseClients.delete(client);
    }
  }
}

// ============================================================================
// AUTH & SESSION ROUTES (Real account credentials required)
// ============================================================================

app.get('/api/auth/auto-session', (_req, res) => {
  res.status(403).json({
    error: 'Test login is disabled. Please log in or sign up with a real account.',
  });
});

app.post('/api/auth/request-otp', (req, res) => {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
    return;
  }

  const now = Date.now();
  const existing = otpStore.get(mobile);
  const recent = (existing?.requestedTimestamps || []).filter((ts) => now - ts < 5 * 60 * 1000);
  if (recent.length >= 3) {
    res.status(429).json({
      error: 'OTP rate limit reached (max 3 requests per 5 minutes). Please wait before retrying.',
    });
    return;
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = crypto.createHash('sha256').update(`${mobile}:${otp}`).digest('hex');

  otpStore.set(mobile, {
    otpHash,
    expiresAt: now + 5 * 60 * 1000,
    attempts: 0,
    requestedTimestamps: [...recent, now],
  });

  store.addAudit('SYSTEM', 'system', 'OTP_ISSUED', `Rate-limited OTP issued for mobile ending ${mobile.slice(-4)}`);
  store.save();

  res.json({
    message: 'OTP generated and valid for 5 minutes.',
    expiresInSeconds: 300,
    // Provided strictly for local testing without an external SMS gateway
    devOtpPreview: otp,
  });
});

function verifyOtpInternal(mobile: string, otp: string): { ok: boolean; error?: string } {
  const rec = otpStore.get(mobile);
  if (!rec) return { ok: false, error: 'Please request an OTP first.' };
  if (Date.now() > rec.expiresAt) {
    otpStore.delete(mobile);
    return { ok: false, error: 'OTP has expired. Request a new one.' };
  }
  if (rec.attempts >= 5) {
    otpStore.delete(mobile);
    return { ok: false, error: 'Too many invalid OTP attempts. Request a new OTP.' };
  }
  rec.attempts += 1;
  const candidateHash = crypto.createHash('sha256').update(`${mobile}:${otp}`).digest('hex');
  if (candidateHash !== rec.otpHash) {
    return { ok: false, error: 'Invalid OTP code.' };
  }
  otpStore.delete(mobile);
  return { ok: true };
}

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const state = String(req.body?.state || 'Maharashtra').trim();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  const referralCode = String(req.body?.referralCode || '').trim().toUpperCase();
  const deviceFingerprint = String(req.body?.deviceFingerprint || 'web-client');

  if (name.length < 2) {
    res.status(400).json({ error: 'Enter your full name (at least 2 characters).' });
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Enter a valid Gmail / Email ID.' });
    return;
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Password and Confirm Password do not match.' });
    return;
  }

  if (store.data.users.some((u) => u.mobile === mobile)) {
    res.status(409).json({ error: 'An account with this mobile number already exists. Please login instead.' });
    return;
  }
  if (store.data.users.some((u) => (u.email || '').trim().toLowerCase() === email)) {
    res.status(409).json({ error: 'An account with this Gmail / Email ID already exists. Please login instead.' });
    return;
  }

  const { hash, salt } = hashPassword(password);
  const nextNumber = 1001 + store.data.users.length;
  const userId = `GR-USR-${nextNumber}`;
  const ownRefCode = store.generateUniqueReferralCode(name, String(nextNumber));
  const isAdmin = store.isAuthorizedAdminEmail(email);

  // Prevent explicit self-referral at registration
  if (referralCode) {
    if (referralCode === ownRefCode) {
      res.status(400).json({ error: 'You cannot use your own referral code.' });
      return;
    }
    const prospectiveReferrer = store.findReferrerByCode(referralCode);
    if (
      prospectiveReferrer &&
      (prospectiveReferrer.user.mobile === mobile ||
        (prospectiveReferrer.user.email || '').trim().toLowerCase() === email)
    ) {
      res.status(400).json({ error: 'Self-referrals are not permitted.' });
      return;
    }
  }

  // Anti-multi-account check for welcome bonus
  const deviceAlreadyClaimed = store.data.users.some(
    (u) => u.welcomeBonusClaimed && u.deviceFingerprints.includes(deviceFingerprint)
  );
  const cfg = store.data.welcomeBonusConfig;
  const grantWelcome = cfg.enabled && !deviceAlreadyClaimed;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + cfg.expiryDays * 86400 * 1000).toISOString();

  const newUser = {
    id: userId,
    name,
    mobile,
    email,
    state,
    role: (isAdmin ? 'admin' : 'user') as 'admin' | 'user',
    status: 'active' as const,
    kycStatus: 'unverified' as const,
    referralCode: ownRefCode,
    referredBy: undefined as string | undefined,
    welcomeBonusClaimed: grantWelcome,
    welcomeBonusExpiresAt: grantWelcome ? expiresIso : undefined,
    firstDepositOfferUsed: false,
    dailyStreak: 0,
    paymentMethods: [],
    passwordHash: hash,
    passwordSalt: salt,
    deviceFingerprints: [deviceFingerprint],
    createdAt: nowIso,
  };

  store.data.users.push(newUser);
  store.ensureUserReferralCode(newUser);

  if (grantWelcome) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId,
      type: 'welcome_bonus',
      bucket: 'bonus',
      amount: cfg.amount,
      status: 'Credited',
      title: 'Welcome Bonus Credited',
      description: `New account bonus (valid ${cfg.expiryDays} days; non-withdrawable)`,
      createdAt: nowIso,
    });
    const welcomeCamp = store.data.bonusCampaigns.find((c) => c.type === 'welcome');
    if (welcomeCamp) {
      welcomeCamp.totalClaimedCount += 1;
      welcomeCamp.totalDistributedAmount += cfg.amount;
    }
    store.addNotification(
      userId,
      'bonus',
      'Welcome Bonus Received',
      `₹${cfg.amount} welcome bonus has been added to your Bonus Balance. Valid for ${cfg.expiryDays} days.`
    );
  }

  // Process referral relationship & ₹50 virtual signup bonus on the backend
  if (referralCode) {
    store.processSignupReferral(newUser, referralCode, deviceFingerprint, nowIso);
  }

  store.addAudit(
    userId,
    newUser.role,
    'USER_REGISTERED',
    `Registered ${email} / mobile ending ${mobile.slice(-4)}${isAdmin ? ' (Authorized Admin)' : ''}`
  );
  store.save();

  const token = signToken({
    userId,
    role: newUser.role,
    exp: Date.now() + SESSION_TTL_MS,
  });

  res.status(201).json({
    token,
    adminToken: isAdmin ? issueAdminToken(userId, email) : undefined,
    user: store.sanitizeUser(newUser),
    wallet: store.computeWallet(userId),
    welcomeBonusGranted: grantWelcome,
    welcomeBonusNote: grantWelcome
      ? `₹${cfg.amount} welcome bonus credited to Bonus Balance.`
      : 'Welcome bonus skipped because this device already claimed a welcome promotion.',
  });
});

app.post('/api/auth/login', (req, res) => {
  const rawIdentifier = String(
    req.body?.identifier || req.body?.email || req.body?.mobile || ''
  ).trim();
  const password = String(req.body?.password || '');

  if (!rawIdentifier || !password) {
    res.status(400).json({ error: 'Enter your Email / Mobile Number and Password.' });
    return;
  }

  const lowerId = rawIdentifier.toLowerCase();
  const digitsOnly = rawIdentifier.replace(/\D/g, '');

  const user = rawIdentifier.includes('@')
    ? store.data.users.find((u) => (u.email || '').trim().toLowerCase() === lowerId)
    : store.data.users.find(
        (u) =>
          (digitsOnly.length >= 10 && u.mobile === digitsOnly) ||
          (u.email || '').trim().toLowerCase() === lowerId
      );

  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    res.status(401).json({ error: 'Invalid Email / Mobile Number or Password.' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Your account is currently suspended.' });
    return;
  }

  const isAdmin = store.isAdminUser(user);
  user.role = isAdmin ? 'admin' : 'user';

  const token = signToken({
    userId: user.id,
    role: user.role,
    exp: Date.now() + SESSION_TTL_MS,
  });
  store.addAudit(
    user.id,
    user.role,
    'USER_LOGIN',
    `Authenticated via ${rawIdentifier.includes('@') ? 'email' : 'mobile'} and password`
  );
  store.save();

  res.json({
    token,
    adminToken: isAdmin ? issueAdminToken(user.id, user.email) : undefined,
    user: store.sanitizeUser(user),
    wallet: store.computeWallet(user.id),
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const otp = String(req.body?.otp || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }
  const otpCheck = verifyOtpInternal(mobile, otp);
  if (!otpCheck.ok) {
    res.status(400).json({ error: otpCheck.error });
    return;
  }

  const user = store.data.users.find((u) => u.mobile === mobile);
  if (!user) {
    res.status(404).json({ error: 'No account found with this mobile number.' });
    return;
  }

  const { hash, salt } = hashPassword(newPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  store.addAudit(user.id, 'user', 'PASSWORD_RESET', 'Password reset completed after OTP verification');
  store.save();

  res.json({ message: 'Password updated successfully. You can now sign in with your new password.' });
});

// ============================================================================
// USER PROFILE, KYC & PAYMENT METHODS
// ============================================================================

app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const isAdmin = store.isAdminUser(user);
  user.role = isAdmin ? 'admin' : 'user';
  const unreadNotifications = store.data.notifications.filter(
    (n) => n.userId === user.id && !n.read
  ).length;

  res.json({
    user: store.sanitizeUser(user),
    adminToken: isAdmin ? issueAdminToken(user.id, user.email) : null,
    wallet: store.computeWallet(user.id),
    unreadNotifications,
    welcomeBonusConfig: store.data.welcomeBonusConfig,
    prohibitedStates: PROHIBITED_STATES,
  });
});

app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const name = String(req.body?.name || user.name).trim();
  const nextEmail = String(req.body?.email ?? user.email).trim().toLowerCase();
  const state = String(req.body?.state || user.state).trim();

  if (name.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }
  if (nextEmail !== (user.email || '').trim().toLowerCase()) {
    if (!EMAIL_REGEX.test(nextEmail)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (
      store.data.users.some(
        (u) => u.id !== user.id && (u.email || '').trim().toLowerCase() === nextEmail
      )
    ) {
      res.status(409).json({ error: 'This email address is already registered to another account.' });
      return;
    }
    if (!store.isAdminUser(user) && store.isAuthorizedAdminEmail(nextEmail)) {
      res.status(403).json({
        error: 'This email is reserved for an authorized admin. Please sign up or login directly with that Gmail ID.',
      });
      return;
    }
  }
  user.name = name;
  user.email = nextEmail;
  user.state = state;
  store.addAudit(user.id, user.role, 'PROFILE_UPDATED', `Updated profile details (State: ${state})`);
  store.save();

  res.json({ user: store.sanitizeUser(user) });
});

app.post('/api/kyc/submit', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const documentType = String(req.body?.documentType || 'PAN Card').trim();
  const documentNumber = String(req.body?.documentNumber || '').trim().toUpperCase();
  const ageConfirmed = Boolean(req.body?.ageConfirmed);

  if (!ageConfirmed) {
    res.status(400).json({ error: 'You must confirm that you are 18 years or older.' });
    return;
  }
  if (documentNumber.length < 6) {
    res.status(400).json({ error: 'Enter a valid document identifier.' });
    return;
  }

  user.kycStatus = 'pending';
  user.kycSubmittedAt = new Date().toISOString();
  user.kycDocumentType = documentType;
  user.kycDocumentLast4 = documentNumber.slice(-4);

  store.addNotification(
    user.id,
    'security',
    'KYC Submitted for Verification',
    `Your ${documentType} ending in ${user.kycDocumentLast4} has been submitted. An admin will review it shortly.`
  );
  store.addAudit(user.id, 'user', 'KYC_SUBMITTED', `Submitted ${documentType} ending ${user.kycDocumentLast4}`);
  store.save();

  res.json({ user: store.sanitizeUser(user) });
});

app.post('/api/payment-methods', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const type = req.body?.type === 'bank' ? 'bank' : 'upi';
  const label = String(req.body?.label || (type === 'upi' ? 'UPI Account' : 'Bank Account')).trim();

  if (type === 'upi') {
    const upiId = String(req.body?.upiId || '').trim().toLowerCase();
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@okaxis).' });
      return;
    }
    user.paymentMethods.push({
      id: createId('PM'),
      type: 'upi',
      label,
      upiId,
      createdAt: new Date().toISOString(),
    });
  } else {
    const accountHolderName = String(req.body?.accountHolderName || '').trim();
    const accountNumber = String(req.body?.accountNumber || '').replace(/\D/g, '');
    const ifscCode = String(req.body?.ifscCode || '').trim().toUpperCase();
    if (accountHolderName.length < 2) {
      res.status(400).json({ error: 'Enter the bank account holder name.' });
      return;
    }
    if (accountNumber.length < 9 || accountNumber.length > 18) {
      res.status(400).json({ error: 'Enter a valid bank account number (9–18 digits).' });
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      res.status(400).json({ error: 'Enter a valid 11-character IFSC code (e.g. HDFC0001245).' });
      return;
    }
    user.paymentMethods.push({
      id: createId('PM'),
      type: 'bank',
      label,
      accountHolderName,
      accountNumber,
      accountNumberMasked: `XXXXXX${accountNumber.slice(-4)}`,
      ifscCode,
      createdAt: new Date().toISOString(),
    });
  }

  store.addAudit(user.id, 'user', 'PAYMENT_METHOD_ADDED', `Added ${type.toUpperCase()} payout method`);
  store.save();

  res.status(201).json({ paymentMethods: user.paymentMethods });
});

app.delete('/api/payment-methods/:id', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  user.paymentMethods = user.paymentMethods.filter((pm) => pm.id !== req.params.id);
  store.save();
  res.json({ paymentMethods: user.paymentMethods });
});

// ============================================================================
// GAMES, SESSIONS & LEADERBOARD
// ============================================================================

app.get('/api/games', requireAuth, (req: AuthedRequest, res) => {
  const activeGames = store.data.games.filter((g) => g.active);
  const userHistory = store.data.gameSessions
    .filter((s) => s.userId === req.userId)
    .slice(0, 30);

  // Build real leaderboard from actual recorded sessions
  const leaderboards: Record<string, LeaderboardEntry[]> = {};
  for (const game of activeGames) {
    const sessions = store.data.gameSessions.filter((s) => s.gameId === game.id);
    const byUser = new Map<string, LeaderboardEntry>();
    for (const s of sessions) {
      const prev = byUser.get(s.userId);
      if (!prev) {
        byUser.set(s.userId, {
          rank: 0,
          userId: s.userId,
          userName: s.userName,
          bestScore: s.score,
          gamesPlayed: 1,
          totalReward: s.rewardEarned,
        });
      } else {
        prev.bestScore = Math.max(prev.bestScore, s.score);
        prev.gamesPlayed += 1;
        prev.totalReward += s.rewardEarned;
      }
    }
    const sorted = Array.from(byUser.values())
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, 10)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    leaderboards[game.id] = sorted;
  }

  res.json({
    games: activeGames,
    history: userHistory,
    leaderboards,
  });
});

app.post('/api/games/:gameId/play', requireAuth, (req: AuthedRequest, res) => {
  const game = store.data.games.find((g) => g.id === req.params.gameId && g.active);
  const user = store.data.users.find((u) => u.id === req.userId)!;
  if (!game) {
    res.status(404).json({ error: 'Game not found or currently inactive.' });
    return;
  }

  const entryFee = Math.round(Number(req.body?.entryFee || 0));
  const choice = String(req.body?.choice || 'default');
  if (!Number.isFinite(entryFee) || entryFee < 1 || entryFee > 50000) {
    res.status(400).json({ error: 'Bet amount must be between ₹1 and ₹50,000.' });
    return;
  }

  const wallet = store.computeWallet(user.id);
  if (wallet.availableBalance + wallet.bonusBalance < entryFee) {
    res.status(400).json({
      error: `Insufficient balance (₹${wallet.totalBalance}). Add money to play ₹${entryFee} entry.`,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const sessionId = createId('SES');

  // Deduct entry fee from Available Balance first, then Bonus Balance if needed
  const fromAvailable = Math.min(wallet.availableBalance, entryFee);
  const fromBonus = entryFee - fromAvailable;

  if (fromAvailable > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_entry',
      bucket: 'available',
      amount: -fromAvailable,
      status: 'Debited',
      title: `${game.name} Entry Fee`,
      description: `Entry stake ₹${entryFee} (${choice})`,
      referenceId: sessionId,
      createdAt: nowIso,
    });
  }
  if (fromBonus > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_entry',
      bucket: 'bonus',
      amount: -fromBonus,
      status: 'Debited',
      title: `${game.name} Bonus Entry`,
      description: `Bonus balance stake portion for ₹${entryFee} entry`,
      referenceId: sessionId,
      createdAt: nowIso,
    });
  }

  // Server-authoritative random win ratio driven by Admin per-game configuration (5%–95%)
  const minR = Math.max(5, Math.min(95, Math.round(game.minWinRatio ?? 50)));
  const maxR = Math.max(minR, Math.min(95, Math.round(game.maxWinRatio ?? minR)));
  const winRatioUsed = minR === maxR ? minR : minR + crypto.randomInt(0, maxR - minR + 1);
  const roll = crypto.randomInt(0, 100);
  const isWin = roll < winRatioUsed;

  const rewardEarned = isWin ? Math.round(entryFee * game.winMultiplier) : 0;
  const score = isWin ? Math.round(650 + crypto.randomInt(50, 350)) : Math.round(120 + crypto.randomInt(0, 220));

  const sessionRecord = {
    id: sessionId,
    gameId: game.id,
    gameName: game.name,
    userId: user.id,
    userName: user.name,
    entryFee,
    winRatioUsed,
    outcome: (isWin ? 'win' : 'loss') as 'win' | 'loss',
    score,
    durationSec: 4,
    rewardEarned,
    status: 'completed' as const,
    playedAt: nowIso,
  };

  store.data.gameSessions.unshift(sessionRecord);
  game.totalPlays += 1;
  game.totalRewardsPaid += rewardEarned;

  if (isWin && rewardEarned > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_reward',
      bucket: 'available',
      amount: rewardEarned,
      status: 'Credited',
      title: `${game.name} Win Prize`,
      description: `Won ₹${rewardEarned} on ₹${entryFee} entry (${winRatioUsed}% fair RNG)`,
      referenceId: sessionRecord.id,
      createdAt: nowIso,
    });
    store.addNotification(
      user.id,
      'reward',
      'Casino Round Won',
      `You won ₹${rewardEarned} in ${game.name} (Entry ₹${entryFee})!`
    );
  }

  store.addAudit(
    user.id,
    'user',
    isWin ? 'CASINO_ROUND_WON' : 'CASINO_ROUND_LOST',
    `${game.name}: entry=₹${entryFee}, winRatio=${winRatioUsed}%, outcome=${sessionRecord.outcome}, prize=₹${rewardEarned}`,
    sessionRecord.id
  );
  store.save();

  res.json({
    session: sessionRecord,
    wallet: store.computeWallet(user.id),
    isWin,
    winRatioUsed,
    rewardEarned,
  });
});

// ============================================================================
// REAL ACTIVE SESSION PRESENCE & ARCADE WAGER / PAYOUT / REFILL ENDPOINTS
// ============================================================================
const activePresenceSessions = new Map<string, number>();

app.post('/api/presence/heartbeat', (req, res) => {
  const clientId = String(req.body?.clientId || req.ip || 'anon').slice(0, 64);
  const now = Date.now();
  activePresenceSessions.set(clientId, now);
  for (const [id, lastSeen] of activePresenceSessions.entries()) {
    if (now - lastSeen > 25000) {
      activePresenceSessions.delete(id);
    }
  }
  res.json({ onlinePlayers: Math.max(1, activePresenceSessions.size) });
});

app.post('/api/arcade/wager', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const gameId = String(req.body?.gameId || 'ARCADE');
  const gameName = String(req.body?.gameName || 'Arcade Game');
  const amount = Math.round(Number(req.body?.amount || 0) * 100) / 100;
  // Regular bets cap at ₹50,000; 25× Bonus Buy can reach ₹1,250,000
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1250000) {
    res.status(400).json({ error: 'Invalid bet amount.' });
    return;
  }

  const walletBefore = store.computeWallet(user.id);
  const playable = Math.round((walletBefore.availableBalance + walletBefore.bonusBalance) * 100) / 100;
  if (playable + 0.001 < amount) {
    res.status(400).json({ error: 'Insufficient balance. Refill free coins or deposit to play.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const availDeduct = Math.round(Math.min(Math.max(0, walletBefore.availableBalance), amount) * 100) / 100;
  const bonusDeduct = Math.round(Math.max(0, amount - availDeduct) * 100) / 100;

  if (availDeduct > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_entry',
      bucket: 'available',
      amount: -availDeduct,
      status: 'Debited',
      title: `${gameName} Bet`,
      description: `Round stake for ${gameName}`,
      referenceId: gameId,
      createdAt: nowIso,
    });
  }
  if (bonusDeduct > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_entry',
      bucket: 'bonus',
      amount: -bonusDeduct,
      status: 'Debited',
      title: `${gameName} Bet (Bonus)`,
      description: `Bonus stake for ${gameName}`,
      referenceId: gameId,
      createdAt: nowIso,
    });
  }

  const game = store.data.games.find((g) => g.id === gameId);
  if (game) game.totalPlays += 1;

  store.save();
  res.json({ wallet: store.computeWallet(user.id) });
});

app.post('/api/arcade/payout', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const gameId = String(req.body?.gameId || 'ARCADE');
  const gameName = String(req.body?.gameName || 'Arcade Game');
  const rawBet = Math.round(Number(req.body?.betAmount || 0) * 100) / 100;
  const betAmount = Number.isFinite(rawBet) && rawBet >= 0 ? Math.min(rawBet, 1250000) : 0;
  const winAmount = Math.round(Number(req.body?.winAmount || 0) * 100) / 100;
  const detail = String(req.body?.detail || 'Round settled').slice(0, 220);

  if (!Number.isFinite(winAmount) || winAmount < 0 || winAmount > 50000000) {
    res.status(400).json({ error: 'Invalid payout amount.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const isWin = winAmount > 0;
  const game = store.data.games.find((g) => g.id === gameId);
  const effectiveWinRatio = game ? Math.round((game.minWinRatio + game.maxWinRatio) / 2) : 55;

  const sessionRecord: GameSessionRecord = {
    id: createId('SES'),
    gameId,
    gameName,
    userId: user.id,
    userName: user.name,
    entryFee: betAmount,
    winRatioUsed: effectiveWinRatio,
    outcome: isWin ? 'win' : 'loss',
    score: isWin ? Math.round(winAmount * 10) : 0,
    durationSec: 5,
    rewardEarned: winAmount,
    status: 'completed',
    playedAt: nowIso,
  };
  store.data.gameSessions.unshift(sessionRecord);

  if (game && winAmount > 0) {
    game.totalRewardsPaid = Math.round((game.totalRewardsPaid + winAmount) * 100) / 100;
  }

  if (winAmount > 0) {
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: user.id,
      type: 'game_reward',
      bucket: 'available',
      amount: winAmount,
      status: 'Credited',
      title: `${gameName} Win`,
      description: detail,
      referenceId: sessionRecord.id,
      createdAt: nowIso,
    });
  }

  store.save();
  res.json({ wallet: store.computeWallet(user.id), session: sessionRecord });
});

app.post('/api/wallet/refill', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const wallet = store.computeWallet(user.id);
  const playable = wallet.availableBalance + wallet.bonusBalance;
  if (playable >= 10) {
    res.status(400).json({ error: 'Free coin refill is available when your balance drops below 10.' });
    return;
  }

  const refillAmount = 1000;
  const nowIso = new Date().toISOString();
  store.data.transactions.unshift({
    id: createId('TXN'),
    userId: user.id,
    type: 'promo_bonus',
    bucket: 'available',
    amount: refillAmount,
    status: 'Credited',
    title: 'Free Virtual Coins Refill',
    description: '1,000 free virtual coins added so you can keep playing arcade games.',
    createdAt: nowIso,
  });
  store.addNotification(
    user.id,
    'bonus',
    'Free Coins Refilled',
    '1,000 free virtual play coins have been added to your balance!'
  );
  store.save();
  res.json({ wallet: store.computeWallet(user.id), refilled: refillAmount });
});

// ============================================================================
// WALLET, DEPOSITS (WITH WEBHOOK VERIFICATION) & WITHDRAWALS
// ============================================================================

app.get('/api/wallet', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  res.json({
    wallet: store.computeWallet(userId),
    transactions: store.data.transactions.filter((t) => t.userId === userId).slice(0, 100),
    deposits: store.data.deposits.filter((d) => d.userId === userId).slice(0, 50),
    withdrawals: store.data.withdrawals.filter((w) => w.userId === userId).slice(0, 50),
  });
});

app.get('/api/deposits/offers', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const isFirstDepositOffer = !user.firstDepositOfferUsed;
  const activeMethods = store.getActiveDepositPaymentMethods();
  res.json({
    isFirstDepositOffer,
    tiers: isFirstDepositOffer ? FIRST_DEPOSIT_TIERS : RELOAD_DEPOSIT_TIERS,
    wallet: store.computeWallet(user.id),
    merchantPaymentConfig: store.data.merchantPaymentConfig,
    depositPaymentMethods: activeMethods,
  });
});

app.post('/api/deposits/submit-utr', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const amount = Math.round(Number(req.body?.amount || 0));
  const allowedMethods: DepositPaymentMethod[] = ['PhonePe', 'GPay', 'Paytm', 'UPI QR'];
  const paymentMethod = allowedMethods.includes(req.body?.paymentMethod)
    ? (req.body.paymentMethod as DepositPaymentMethod)
    : 'UPI QR';
  const utrRaw = String(req.body?.utrNumber || req.body?.transactionRef || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (PROHIBITED_STATES.includes(user.state)) {
    res.status(403).json({
      error: `Real-money deposits are restricted in ${user.state} under state compliance rules.`,
    });
    return;
  }
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) {
    res.status(400).json({ error: 'Deposit amount must be between ₹100 and ₹50,000.' });
    return;
  }
  if (!/^[A-Z0-9]{8,28}$/.test(utrRaw)) {
    res.status(400).json({
      error: 'Enter a valid Transaction ID / UTR Number (8 to 28 letters or numbers).',
    });
    return;
  }

  const duplicateUtr = store.data.deposits.find(
    (d) =>
      d.status !== 'Failed' &&
      ((d.utrNumber && d.utrNumber.toUpperCase() === utrRaw) ||
        (d.userTransactionRef && d.userTransactionRef.toUpperCase() === utrRaw))
  );
  if (duplicateUtr) {
    res.status(409).json({
      error: 'This Transaction ID / UTR has already been submitted. Please check your payment receipt.',
    });
    return;
  }

  const bonusCalc = computeDepositBonusForAmount(amount, !user.firstDepositOfferUsed);
  const nowIso = new Date().toISOString();
  const depositId = createId('DEP');
  const transactionId = createId('TXN');
  const gatewayOrderId = createId('UPI');

  const deposit = {
    id: depositId,
    transactionId,
    userId: user.id,
    userName: user.name,
    userMobile: user.mobile,
    amount,
    bonusAmount: bonusCalc.bonusAmount,
    gateway: paymentMethod,
    paymentMethod,
    utrNumber: utrRaw,
    userTransactionRef: utrRaw,
    utrSubmittedAt: nowIso,
    gatewayOrderId,
    status: 'Pending' as const,
    webhookVerified: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.data.deposits.unshift(deposit);
  store.addNotification(
    user.id,
    'deposit',
    'Deposit Request Sent to Admin',
    `Your ₹${amount} deposit via ${paymentMethod} (UTR: ${utrRaw}) is pending admin verification.`
  );
  store.addAudit(
    user.id,
    'user',
    'DEPOSIT_UTR_SUBMITTED',
    `Submitted ₹${amount} via ${paymentMethod} with UTR ${utrRaw} (expected bonus ₹${bonusCalc.bonusAmount})`,
    depositId
  );
  store.save();

  broadcastAdminEvent('deposit:utr_submitted', {
    userId: user.id,
    userName: user.name,
    recordId: deposit.id,
    amount: deposit.amount,
    status: deposit.status,
    utrNumber: deposit.utrNumber,
    paymentMethod: deposit.paymentMethod,
    createdAt: deposit.createdAt,
  });

  res.status(201).json({
    deposit,
    wallet: store.computeWallet(user.id),
  });
});

app.post('/api/deposits/initiate', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const amount = Math.round(Number(req.body?.amount || 0));
  const gateway = (['Razorpay', 'Cashfree', 'PayU'].includes(req.body?.gateway)
    ? req.body.gateway
    : 'Razorpay') as 'Razorpay' | 'Cashfree' | 'PayU';
  const idempotencyKey = String(req.body?.idempotencyKey || createId('IDEM'));

  if (PROHIBITED_STATES.includes(user.state)) {
    res.status(403).json({
      error: `Real-money deposits are restricted in ${user.state} under state compliance rules.`,
    });
    return;
  }
  if (amount < 100 || amount > 50000) {
    res.status(400).json({ error: 'Deposit amount must be between ₹100 and ₹50,000.' });
    return;
  }
  if (store.data.processedIdempotencyKeys.includes(idempotencyKey)) {
    res.status(409).json({ error: 'Duplicate deposit request blocked.' });
    return;
  }
  store.data.processedIdempotencyKeys.push(idempotencyKey);

  const bonusCalc = computeDepositBonusForAmount(amount, !user.firstDepositOfferUsed);
  const nowIso = new Date().toISOString();
  const depositId = createId('DEP');
  const transactionId = createId('TXN');
  const gatewayOrderId = createId('ORD');

  const deposit = {
    id: depositId,
    transactionId,
    userId: user.id,
    userName: user.name,
    userMobile: user.mobile,
    amount,
    bonusAmount: bonusCalc.bonusAmount,
    gateway,
    gatewayOrderId,
    status: 'Pending' as const,
    webhookVerified: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.data.deposits.unshift(deposit);
  store.addAudit(
    user.id,
    'user',
    'DEPOSIT_INITIATED',
    `Initiated ₹${amount} (+₹${bonusCalc.bonusAmount} bonus) via ${gateway} (${gatewayOrderId})`,
    depositId
  );
  store.save();

  broadcastAdminEvent('deposit:utr_submitted', {
    userId: user.id,
    userName: user.name,
    recordId: deposit.id,
    amount: deposit.amount,
    status: deposit.status,
    paymentMethod: deposit.gateway,
    createdAt: deposit.createdAt,
  });

  const successPayload = JSON.stringify({
    gatewayOrderId,
    gatewayPaymentId: `pay_${crypto.randomBytes(6).toString('hex')}`,
    status: 'Successful',
  });
  const failPayload = JSON.stringify({
    gatewayOrderId,
    gatewayPaymentId: `pay_${crypto.randomBytes(6).toString('hex')}`,
    status: 'Failed',
    failureReason: 'Payment declined by issuing bank',
  });

  res.status(201).json({
    deposit,
    webhookTestPayloads: {
      success: {
        payload: JSON.parse(successPayload),
        signature: signWebhookPayload(successPayload),
      },
      failed: {
        payload: JSON.parse(failPayload),
        signature: signWebhookPayload(failPayload),
      },
    },
  });
});

// Server-side Payment Gateway Webhook Endpoint (HMAC-SHA256 verified)
app.post('/api/webhooks/payment-gateway', (req, res) => {
  const signature = String(req.headers['x-gateway-signature'] || '');
  const rawBody = JSON.stringify(req.body || {});

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid payment gateway webhook signature.' });
    return;
  }

  const gatewayOrderId = String(req.body?.gatewayOrderId || '');
  const gatewayPaymentId = String(req.body?.gatewayPaymentId || '');
  const status = req.body?.status === 'Successful' ? 'Successful' : 'Failed';
  const failureReason = req.body?.failureReason ? String(req.body.failureReason) : undefined;

  const deposit = store.data.deposits.find((d) => d.gatewayOrderId === gatewayOrderId);
  if (!deposit) {
    res.status(404).json({ error: 'Deposit order not found.' });
    return;
  }
  if (deposit.status !== 'Pending') {
    res.json({ message: 'Deposit already finalized.', deposit });
    return;
  }

  const nowIso = new Date().toISOString();
  deposit.status = status;
  deposit.gatewayPaymentId = gatewayPaymentId;
  deposit.webhookVerified = true;
  deposit.failureReason = failureReason;
  deposit.updatedAt = nowIso;

  if (status === 'Successful') {
    const depUser = store.data.users.find((u) => u.id === deposit.userId);
    if (depUser) {
      depUser.firstDepositOfferUsed = true;
    }

    store.data.transactions.unshift({
      id: deposit.transactionId,
      userId: deposit.userId,
      type: 'deposit',
      bucket: 'available',
      amount: deposit.amount,
      status: 'Successful',
      title: `Deposit via ${deposit.gateway}`,
      description: `Webhook-verified payment ${gatewayPaymentId} (Order ${gatewayOrderId})`,
      referenceId: deposit.id,
      createdAt: nowIso,
    });

    if (deposit.bonusAmount > 0) {
      store.data.transactions.unshift({
        id: createId('TXN'),
        userId: deposit.userId,
        type: 'deposit_bonus',
        bucket: 'bonus',
        amount: deposit.bonusAmount,
        status: 'Credited',
        title: 'Deposit Tier Bonus Credited',
        description: `Bonus for ₹${deposit.amount} verified deposit (${deposit.id})`,
        referenceId: deposit.id,
        createdAt: nowIso,
      });
      const camp = store.data.bonusCampaigns.find((c) => c.id === 'CMP-FIRSTDEP');
      if (camp) {
        camp.totalClaimedCount += 1;
        camp.totalDistributedAmount += deposit.bonusAmount;
      }
    }

    store.addNotification(
      deposit.userId,
      'deposit',
      'Deposit & Bonus Credited',
      `₹${deposit.amount} added to Available Balance + ₹${deposit.bonusAmount} Deposit Bonus added to Bonus Balance (${deposit.transactionId}).`
    );

    // Automatic backend Referral Activity Reward (e.g. 10% for verified deposits >= ₹100)
    store.processDepositReferralReward(deposit, deposit.amount, nowIso);
  } else {
    store.addNotification(
      deposit.userId,
      'deposit',
      'Deposit Failed',
      `Your ₹${deposit.amount} deposit (${deposit.gatewayOrderId}) failed: ${failureReason || 'Gateway declined'}.`
    );
  }

  store.addAudit(
    'GATEWAY_WEBHOOK',
    'system',
    `DEPOSIT_${status.toUpperCase()}`,
    `Webhook verified ${deposit.id} for ₹${deposit.amount} (+₹${deposit.bonusAmount} bonus)`,
    deposit.id
  );
  store.save();

  broadcastAdminEvent('deposit:updated', {
    userId: deposit.userId,
    userName: deposit.userName,
    recordId: deposit.id,
    amount: deposit.amount,
    status: deposit.status,
    createdAt: deposit.updatedAt,
  });

  res.json({
    deposit,
    wallet: store.computeWallet(deposit.userId),
  });
});

app.get('/api/withdrawal-settings/me', requireAuth, (req: AuthedRequest, res) => {
  const effective = store.getEffectiveWithdrawalSettings(req.userId!);
  res.json(effective);
});

app.post('/api/withdrawals', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const amount = Math.round(Number(req.body?.amount || 0));
  const methodType = req.body?.methodType === 'bank' ? 'bank' : 'upi';
  const idempotencyKey = String(req.body?.idempotencyKey || createId('WIDEM'));

  if (store.data.processedIdempotencyKeys.includes(idempotencyKey)) {
    res.status(409).json({ error: 'Duplicate withdrawal request prevented.' });
    return;
  }
  if (PROHIBITED_STATES.includes(user.state)) {
    res.status(403).json({
      error: `Withdrawals are restricted in ${user.state} under compliance rules.`,
    });
    return;
  }
  if (user.kycStatus !== 'verified') {
    res.status(400).json({
      error: 'KYC verification is required before submitting a withdrawal request.',
    });
    return;
  }
  const effectiveSettings = store.getEffectiveWithdrawalSettings(user.id);
  const minLimit = effectiveSettings.minWithdrawalLimit;
  if (amount < minLimit) {
    res.status(400).json({
      error: `Minimum withdrawal limit is ₹${minLimit}.`,
    });
    return;
  }

  const wallet = store.computeWallet(user.id);
  if (amount > wallet.availableBalance) {
    res.status(400).json({
      error: `Insufficient Available Balance (₹${wallet.availableBalance}). Bonus Balance cannot be withdrawn.`,
    });
    return;
  }

  let upiId: string | undefined;
  let accountHolderName: string | undefined;
  let accountNumber: string | undefined;
  let ifscCode: string | undefined;

  if (methodType === 'upi') {
    upiId = String(req.body?.upiId || '').trim().toLowerCase();
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@okaxis).' });
      return;
    }
  } else {
    accountHolderName = String(req.body?.accountHolderName || '').trim();
    accountNumber = String(req.body?.accountNumber || '').replace(/\D/g, '');
    ifscCode = String(req.body?.ifscCode || '').trim().toUpperCase();
    if (accountHolderName.length < 2) {
      res.status(400).json({ error: 'Account Holder Name is required.' });
      return;
    }
    if (accountNumber.length < 9 || accountNumber.length > 18) {
      res.status(400).json({ error: 'Enter a valid Bank Account Number (9–18 digits).' });
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      res.status(400).json({ error: 'Enter a valid 11-character IFSC Code.' });
      return;
    }
  }

  store.data.processedIdempotencyKeys.push(idempotencyKey);
  const nowIso = new Date().toISOString();
  const withdrawalId = createId('WDR');
  const transactionId = createId('TXN');

  const record = {
    id: withdrawalId,
    transactionId,
    userId: user.id,
    userName: user.name,
    userMobile: user.mobile,
    amount,
    methodType: methodType as 'upi' | 'bank',
    upiId,
    accountHolderName,
    accountNumber,
    ifscCode,
    status: 'Pending' as WithdrawalStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.data.withdrawals.unshift(record);
  store.data.transactions.unshift({
    id: transactionId,
    userId: user.id,
    type: 'withdrawal',
    bucket: 'available',
    amount: -amount,
    status: 'Pending',
    title: `Withdrawal via ${methodType === 'upi' ? 'UPI' : 'Bank Transfer'}`,
    description:
      methodType === 'upi'
        ? `Destination UPI: ${upiId}`
        : `Destination Bank: ${accountHolderName} (XXXX${accountNumber!.slice(-4)} · ${ifscCode})`,
    referenceId: withdrawalId,
    createdAt: nowIso,
  });

  store.addNotification(
    user.id,
    'withdrawal',
    'Withdrawal Request Submitted',
    `Your withdrawal request of ₹${amount} (${transactionId}) is Pending review. No additional deposit is ever required.`
  );
  store.addAudit(
    user.id,
    'user',
    'WITHDRAWAL_REQUESTED',
    `Requested ₹${amount} via ${methodType.toUpperCase()}`,
    withdrawalId
  );
  store.save();

  broadcastAdminEvent('withdrawal:created', {
    userId: user.id,
    userName: user.name,
    recordId: record.id,
    amount: record.amount,
    status: record.status,
    paymentMethod: record.methodType,
    createdAt: record.createdAt,
  });

  res.status(201).json({
    withdrawal: record,
    wallet: store.computeWallet(user.id),
  });
});

// ============================================================================
// REWARDS, WELCOME BONUS & DAILY STREAK
// ============================================================================

app.get('/api/rewards', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const todayStr = new Date().toISOString().slice(0, 10);
  const canCheckInToday = user.lastCheckInDate !== todayStr;
  const nextDayNumber = (user.dailyStreak % DAILY_BONUS_LADDER.length) + 1;
  const nextRewardAmount = DAILY_BONUS_LADDER[nextDayNumber - 1] ?? 2;

  res.json({
    campaigns: store.data.bonusCampaigns.filter((c) => c.active),
    welcomeBonusConfig: store.data.welcomeBonusConfig,
    userWelcomeClaimed: user.welcomeBonusClaimed,
    userWelcomeExpiresAt: user.welcomeBonusExpiresAt,
    dailyStreak: user.dailyStreak,
    canCheckInToday,
    dailyBonusLadder: DAILY_BONUS_LADDER,
    nextDayNumber,
    nextRewardAmount,
    depositBonusOffers: {
      isFirstOfferAvailable: !user.firstDepositOfferUsed,
      firstDepositTiers: FIRST_DEPOSIT_TIERS,
      reloadTiers: RELOAD_DEPOSIT_TIERS,
    },
    referralCode: user.referralCode,
  });
});

app.post('/api/rewards/claim-welcome', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const cfg = store.data.welcomeBonusConfig;
  if (!cfg.enabled) {
    res.status(400).json({ error: 'Welcome bonus promotion is currently paused.' });
    return;
  }
  if (user.welcomeBonusClaimed) {
    res.status(400).json({ error: 'Welcome bonus has already been claimed on this account.' });
    return;
  }

  const nowIso = new Date().toISOString();
  user.welcomeBonusClaimed = true;
  user.welcomeBonusExpiresAt = new Date(Date.now() + cfg.expiryDays * 86400 * 1000).toISOString();

  store.data.transactions.unshift({
    id: createId('TXN'),
    userId: user.id,
    type: 'welcome_bonus',
    bucket: 'bonus',
    amount: cfg.amount,
    status: 'Credited',
    title: 'Welcome Bonus Credited',
    description: `Valid for ${cfg.expiryDays} days (non-withdrawable bonus balance)`,
    createdAt: nowIso,
  });

  const camp = store.data.bonusCampaigns.find((c) => c.type === 'welcome');
  if (camp) {
    camp.totalClaimedCount += 1;
    camp.totalDistributedAmount += cfg.amount;
  }

  store.addNotification(
    user.id,
    'bonus',
    'Welcome Bonus Received',
    `₹${cfg.amount} welcome bonus credited to your Bonus Balance. Expires in ${cfg.expiryDays} days.`
  );
  store.save();

  res.json({
    user: store.sanitizeUser(user),
    wallet: store.computeWallet(user.id),
  });
});

app.post('/api/rewards/daily-checkin', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (user.lastCheckInDate === todayStr) {
    res.status(400).json({ error: 'You have already claimed today’s daily check-in bonus.' });
    return;
  }

  const streakCamp = store.data.bonusCampaigns.find((c) => c.type === 'daily_streak' && c.active);
  const nextStreak = (user.dailyStreak % DAILY_BONUS_LADDER.length) + 1;
  const rewardAmount = DAILY_BONUS_LADDER[nextStreak - 1] ?? 2;
  const nowIso = new Date().toISOString();

  user.dailyStreak = nextStreak;
  user.lastCheckInDate = todayStr;

  store.data.transactions.unshift({
    id: createId('TXN'),
    userId: user.id,
    type: 'daily_bonus',
    bucket: 'bonus',
    amount: rewardAmount,
    status: 'Credited',
    title: `Day ${nextStreak} Daily Bonus`,
    description: `Day ${nextStreak} of 30 daily check-in reward credited to Bonus Balance`,
    createdAt: nowIso,
  });

  if (streakCamp) {
    streakCamp.totalClaimedCount += 1;
    streakCamp.totalDistributedAmount += rewardAmount;
  }

  store.addNotification(
    user.id,
    'bonus',
    `Day ${nextStreak} Daily Bonus Claimed`,
    `₹${rewardAmount} has been added to your Bonus Balance.`
  );
  store.addAudit(user.id, 'user', 'DAILY_CHECKIN', `Day ${nextStreak} daily bonus ₹${rewardAmount}`);
  store.save();

  res.json({
    rewardAmount,
    dailyStreak: nextStreak,
    wallet: store.computeWallet(user.id),
  });
});

// ============================================================================
// NOTIFICATIONS & GENUINE REVIEWS
// ============================================================================

app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const list = store.data.notifications.filter((n) => n.userId === req.userId).slice(0, 50);
  res.json({ notifications: list });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  for (const n of store.data.notifications) {
    if (n.userId === req.userId) n.read = true;
  }
  store.save();
  res.json({ ok: true });
});

app.get('/api/reviews', (req, res) => {
  const { nextReviewAt } = store.syncScheduledReviews();

  // Check optional user auth token to report personal 3-hour review cooldown
  let userCooldownEndsAt: string | null = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload && typeof payload.userId === 'string') {
      const latestMine = store.data.reviews.find((r) => r.userId === payload.userId);
      if (latestMine) {
        const nextAllowedMs = new Date(latestMine.createdAt).getTime() + REVIEW_INTERVAL_MS;
        if (nextAllowedMs > Date.now()) {
          userCooldownEndsAt = new Date(nextAllowedMs).toISOString();
        }
      }
    }
  }

  res.json({
    reviews: store.data.reviews,
    schedule: {
      intervalHours: 3,
      nextReviewAt,
      userCooldownEndsAt,
    },
  });
});

app.post('/api/reviews', requireAuth, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.userId)!;
  const rating = Math.max(1, Math.min(5, Math.round(Number(req.body?.rating || 5))));
  const comment = String(req.body?.comment || '').trim();

  if (comment.length < 8) {
    res.status(400).json({ error: 'Please write a genuine review (at least 8 characters).' });
    return;
  }

  // Strictly enforce 1 review per 3 hours per user
  const latestUserReview = store.data.reviews.find((r) => r.userId === user.id);
  if (latestUserReview) {
    const elapsedMs = Date.now() - new Date(latestUserReview.createdAt).getTime();
    if (elapsedMs < REVIEW_INTERVAL_MS) {
      const remainingMin = Math.ceil((REVIEW_INTERVAL_MS - elapsedMs) / 60000);
      const hrs = Math.floor(remainingMin / 60);
      const mins = remainingMin % 60;
      const waitStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      res.status(429).json({
        error: `Only 1 review can be added every 3 hours. You can post another review in ${waitStr}.`,
      });
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const review = {
    id: createId('REV'),
    userId: user.id,
    userName: user.name,
    city: user.state || 'Verified Account',
    badge: user.kycStatus === 'verified' ? 'KYC Verified' : 'Verified Member',
    rating,
    comment,
    isPromotional: false,
    isScheduledShowcase: false,
    reportedBy: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.data.reviews.unshift(review);
  store.addAudit(user.id, 'user', 'REVIEW_SUBMITTED', `Submitted ${rating}-star review`, review.id);
  store.save();

  res.status(201).json({ review });
});

app.patch('/api/reviews/:id', requireAuth, (req: AuthedRequest, res) => {
  const review = store.data.reviews.find((r) => r.id === req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found.' });
    return;
  }
  if (review.userId !== req.userId) {
    res.status(403).json({ error: 'You can only edit your own reviews.' });
    return;
  }
  const rating = Math.max(1, Math.min(5, Math.round(Number(req.body?.rating || review.rating))));
  const comment = String(req.body?.comment || review.comment).trim();
  if (comment.length < 8) {
    res.status(400).json({ error: 'Review must be at least 8 characters.' });
    return;
  }
  review.rating = rating;
  review.comment = comment;
  review.updatedAt = new Date().toISOString();
  store.save();

  res.json({ review });
});

app.post('/api/reviews/:id/report', requireAuth, (req: AuthedRequest, res) => {
  const review = store.data.reviews.find((r) => r.id === req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found.' });
    return;
  }
  if (!review.reportedBy.includes(req.userId!)) {
    review.reportedBy.push(req.userId!);
    store.addAudit(req.userId!, 'user', 'REVIEW_REPORTED', `Reported review ${review.id}`, review.id);
    store.save();
  }
  res.json({ review });
});

// ============================================================================
// OWNER-ONLY PRIVATE ADMIN API (2FA + RBAC PROTECTED)
// ============================================================================

app.post('/api/admin/verify-2fa', (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (code !== ADMIN_2FA_CODE) {
    res.status(401).json({ error: 'Invalid 2FA verification code.' });
    return;
  }
  const adminToken = signToken({
    userId: 'GR-ADM-0001',
    role: 'admin',
    twoFactorVerified: true,
    exp: Date.now() + 4 * 3600 * 1000,
  });
  store.addAudit('GR-ADM-0001', 'admin', 'ADMIN_2FA_VERIFIED', 'Owner verified 2FA access to admin console');
  store.save();

  res.json({ adminToken });
});

app.get('/api/admin/events', (req, res) => {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const check = resolveAdminFromRequest(req, queryToken);
  if (!check.ok) {
    res.status(403).json({ error: check.error });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  adminSseClients.add(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      adminSseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminSseClients.delete(res);
  });
});

function buildAuthorizedAdminsList() {
  return (store.data.authorizedAdminEmails || []).map((entry) => {
    const normalized = entry.email.trim().toLowerCase();
    const matched = store.data.users.find(
      (u) => u.id !== 'GR-ADM-0001' && (u.email || '').trim().toLowerCase() === normalized
    );
    return {
      ...entry,
      email: normalized,
      isOwner: Boolean(entry.isOwner || normalized === PRIMARY_OWNER_ADMIN_EMAIL),
      registeredUser: matched
        ? {
            id: matched.id,
            name: matched.name,
            mobile: matched.mobile,
            status: matched.status,
          }
        : null,
    };
  });
}

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const users = store.data.users
    .filter((u) => u.id !== 'GR-ADM-0001')
    .map((u) => ({
      ...store.sanitizeUser(u),
      wallet: store.computeWallet(u.id),
      gamesPlayed: store.data.gameSessions.filter((s) => s.userId === u.id).length,
      individualWithdrawalSetting: store.getUserWithdrawalSetting(u.id),
    }));

  res.json({
    analytics: store.computeAdminAnalytics(),
    users,
    deposits: store.data.deposits,
    withdrawals: store.data.withdrawals,
    games: store.data.games,
    bonusCampaigns: store.data.bonusCampaigns,
    welcomeBonusConfig: store.data.welcomeBonusConfig,
    merchantPaymentConfig: store.syncMerchantPaymentConfigFromMethods(),
    depositPaymentMethods: store.data.depositPaymentMethods,
    withdrawalConfig: store.data.withdrawalConfig,
    authorizedAdminEmails: buildAuthorizedAdminsList(),
    auditLogs: store.data.auditLogs.slice(0, 100),
  });
});

app.post('/api/admin/admins', requireAdmin, (req: AuthedRequest, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Enter a valid Gmail / Email ID.' });
    return;
  }
  if (!Array.isArray(store.data.authorizedAdminEmails)) {
    store.data.authorizedAdminEmails = [];
  }
  if (store.isAuthorizedAdminEmail(email)) {
    res.status(409).json({ error: `${email} already has Admin access.` });
    return;
  }

  const nowIso = new Date().toISOString();
  store.data.authorizedAdminEmails.push({
    email,
    addedBy: req.userId || 'GR-ADM-0001',
    addedAt: nowIso,
    isOwner: false,
  });

  // Upgrade any already-registered user matching this Gmail immediately
  const existingUser = store.data.users.find(
    (u) => u.id !== 'GR-ADM-0001' && (u.email || '').trim().toLowerCase() === email
  );
  if (existingUser) {
    existingUser.role = 'admin';
  }

  store.addAudit(
    req.userId || 'GR-ADM-0001',
    'admin',
    'ADMIN_EMAIL_ADDED',
    `Granted Admin Panel access to ${email}`,
    email
  );
  store.save();

  res.status(201).json({
    message: `Admin access granted to ${email}. Anyone logging in with this Gmail ID can now access the Admin Panel.`,
    authorizedAdminEmails: buildAuthorizedAdminsList(),
  });
});

app.delete('/api/admin/admins/:email', requireAdmin, (req: AuthedRequest, res) => {
  const targetEmail = decodeURIComponent(String(req.params.email || ''))
    .trim()
    .toLowerCase();
  if (!targetEmail) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }
  const idx = (store.data.authorizedAdminEmails || []).findIndex(
    (entry) => entry.email.trim().toLowerCase() === targetEmail
  );
  if (idx === -1) {
    res.status(404).json({ error: 'Admin email not found.' });
    return;
  }
  const entry = store.data.authorizedAdminEmails[idx];
  if (entry.isOwner || targetEmail === PRIMARY_OWNER_ADMIN_EMAIL) {
    res.status(400).json({ error: 'Primary owner admin email cannot be removed.' });
    return;
  }

  store.data.authorizedAdminEmails.splice(idx, 1);

  const existingUser = store.data.users.find(
    (u) => u.id !== 'GR-ADM-0001' && (u.email || '').trim().toLowerCase() === targetEmail
  );
  if (existingUser) {
    existingUser.role = 'user';
  }

  store.addAudit(
    req.userId || 'GR-ADM-0001',
    'admin',
    'ADMIN_EMAIL_REMOVED',
    `Revoked Admin Panel access for ${targetEmail}`,
    targetEmail
  );
  store.save();

  res.json({
    message: `Admin access revoked for ${targetEmail}.`,
    authorizedAdminEmails: buildAuthorizedAdminsList(),
  });
});

app.patch('/api/admin/settings/withdrawal', requireAdmin, (req: AuthedRequest, res) => {
  const existing = store.data.withdrawalConfig || {
    minWithdrawalLimit: MIN_WITHDRAWAL_LIMIT,
    noticeBannerEnabled: true,
    noticeBannerTitle: 'Withdrawal Notice',
    noticeBannerMessage: '',
    updatedAt: new Date().toISOString(),
  };

  const minWithdrawalLimit =
    req.body?.minWithdrawalLimit !== undefined
      ? Math.round(Number(req.body.minWithdrawalLimit || 0))
      : existing.minWithdrawalLimit;

  if (!Number.isFinite(minWithdrawalLimit) || minWithdrawalLimit < 100 || minWithdrawalLimit > 100000) {
    res.status(400).json({ error: 'Minimum withdrawal limit must be between ₹100 and ₹1,00,000.' });
    return;
  }

  const noticeBannerEnabled =
    typeof req.body?.noticeBannerEnabled === 'boolean'
      ? req.body.noticeBannerEnabled
      : Boolean(existing.noticeBannerEnabled);

  const noticeBannerTitle =
    typeof req.body?.noticeBannerTitle === 'string'
      ? req.body.noticeBannerTitle.trim().slice(0, 80) || 'Withdrawal Notice'
      : existing.noticeBannerTitle || 'Withdrawal Notice';

  const noticeBannerMessage =
    typeof req.body?.noticeBannerMessage === 'string'
      ? req.body.noticeBannerMessage.trim().slice(0, 500)
      : existing.noticeBannerMessage || '';

  store.data.withdrawalConfig = {
    minWithdrawalLimit,
    noticeBannerEnabled,
    noticeBannerTitle,
    noticeBannerMessage,
    updatedAt: new Date().toISOString(),
  };
  store.addAudit(
    req.userId!,
    'admin',
    'WITHDRAWAL_CONFIG_UPDATED',
    `Updated withdrawal settings (Min: ₹${minWithdrawalLimit}, Banner: ${noticeBannerEnabled ? 'ON' : 'OFF'})`
  );
  store.save();
  res.json({ withdrawalConfig: store.data.withdrawalConfig });
});

app.patch('/api/admin/payment-config', requireAdmin, (req: AuthedRequest, res) => {
  const upiId = String(req.body?.upiId || '').trim().toLowerCase();
  const merchantName = String(req.body?.merchantName || 'GameReward Official').trim();
  const instructions =
    typeof req.body?.instructions === 'string'
      ? req.body.instructions.trim().slice(0, 300)
      : store.data.merchantPaymentConfig?.instructions || '';
  if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
    res.status(400).json({ error: 'Enter a valid merchant UPI ID (e.g. merchant@okaxis).' });
    return;
  }
  if (merchantName.length < 2) {
    res.status(400).json({ error: 'Enter a valid merchant payee name.' });
    return;
  }
  let qrValue = store.data.merchantPaymentConfig?.qrImageDataUrl ?? null;
  if (req.body?.qrImageDataUrl !== undefined) {
    const validatedQr = validateQrImageDataUrl(req.body.qrImageDataUrl);
    if (!validatedQr.ok) {
      res.status(400).json({ error: validatedQr.error });
      return;
    }
    qrValue = validatedQr.value;
  }

  const nowIso = new Date().toISOString();
  store.syncMerchantPaymentConfigFromMethods();
  const primary =
    store.data.depositPaymentMethods.find((m) => m.isPrimary) ||
    store.data.depositPaymentMethods[0];
  if (primary) {
    primary.upiId = upiId;
    primary.merchantName = merchantName;
    primary.qrImageDataUrl = qrValue;
    primary.instructions = instructions;
    primary.updatedAt = nowIso;
  }
  const synced = store.syncMerchantPaymentConfigFromMethods();
  store.addAudit(
    req.userId!,
    'admin',
    'MERCHANT_UPI_UPDATED',
    `Updated primary deposit UPI ID to ${upiId} (${merchantName})${qrValue ? ' with custom QR' : ''}`
  );
  store.save();
  res.json({
    merchantPaymentConfig: synced,
    depositPaymentMethods: store.data.depositPaymentMethods,
  });
});

app.get('/api/admin/deposit-payment-methods', requireAdmin, (_req: AuthedRequest, res) => {
  const synced = store.syncMerchantPaymentConfigFromMethods();
  res.json({
    methods: store.data.depositPaymentMethods,
    merchantPaymentConfig: synced,
  });
});

app.post('/api/admin/deposit-payment-methods', requireAdmin, (req: AuthedRequest, res) => {
  const label = String(req.body?.label || '').trim().slice(0, 60);
  const merchantName = String(req.body?.merchantName || '').trim().slice(0, 80);
  const upiId = String(req.body?.upiId || '').trim().toLowerCase();
  const instructions = String(req.body?.instructions || '').trim().slice(0, 300);
  const isActive = req.body?.isActive !== false;
  const isPrimary = req.body?.isPrimary === true;

  if (label.length < 2) {
    res.status(400).json({ error: 'Enter a payment method label (e.g. PhonePe Business QR).' });
    return;
  }
  if (merchantName.length < 2) {
    res.status(400).json({ error: 'Enter a valid payee / merchant display name.' });
    return;
  }
  if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
    res.status(400).json({ error: 'Enter a valid UPI ID (e.g. yourname@okaxis or 9876543210@ybl).' });
    return;
  }

  const validatedQr = validateQrImageDataUrl(req.body?.qrImageDataUrl);
  if (!validatedQr.ok) {
    res.status(400).json({ error: validatedQr.error });
    return;
  }

  if (!Array.isArray(store.data.depositPaymentMethods)) {
    store.data.depositPaymentMethods = [];
  }
  if (store.data.depositPaymentMethods.length >= 20) {
    res.status(400).json({ error: 'Maximum 20 deposit payment methods can be stored.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const makePrimary = isPrimary || store.data.depositPaymentMethods.length === 0;
  if (makePrimary) {
    for (const m of store.data.depositPaymentMethods) {
      m.isPrimary = false;
    }
  }

  const method = {
    id: createId('DPM'),
    label,
    merchantName,
    upiId,
    qrImageDataUrl: validatedQr.value,
    instructions,
    isActive: makePrimary ? true : isActive,
    isPrimary: makePrimary,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.data.depositPaymentMethods.unshift(method);
  const synced = store.syncMerchantPaymentConfigFromMethods();

  store.addAudit(
    req.userId!,
    'admin',
    'DEPOSIT_PAYMENT_METHOD_ADDED',
    `Added deposit method "${label}" (${upiId}, ${merchantName})${validatedQr.value ? ' with custom QR image' : ''}`,
    method.id
  );
  store.save();

  res.status(201).json({
    method,
    methods: store.data.depositPaymentMethods,
    merchantPaymentConfig: synced,
    message: `Payment method "${label}" added successfully.`,
  });
});

app.patch('/api/admin/deposit-payment-methods/:id', requireAdmin, (req: AuthedRequest, res) => {
  store.syncMerchantPaymentConfigFromMethods();
  const method = store.data.depositPaymentMethods.find((m) => m.id === req.params.id);
  if (!method) {
    res.status(404).json({ error: 'Deposit payment method not found.' });
    return;
  }

  if (req.body?.label !== undefined) {
    const label = String(req.body.label).trim().slice(0, 60);
    if (label.length < 2) {
      res.status(400).json({ error: 'Payment method label must be at least 2 characters.' });
      return;
    }
    method.label = label;
  }
  if (req.body?.merchantName !== undefined) {
    const merchantName = String(req.body.merchantName).trim().slice(0, 80);
    if (merchantName.length < 2) {
      res.status(400).json({ error: 'Payee display name must be at least 2 characters.' });
      return;
    }
    method.merchantName = merchantName;
  }
  if (req.body?.upiId !== undefined) {
    const upiId = String(req.body.upiId).trim().toLowerCase();
    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      res.status(400).json({ error: 'Enter a valid UPI ID (e.g. yourname@okaxis).' });
      return;
    }
    method.upiId = upiId;
  }
  if (req.body?.instructions !== undefined) {
    method.instructions = String(req.body.instructions || '').trim().slice(0, 300);
  }
  if (req.body?.qrImageDataUrl !== undefined) {
    const validatedQr = validateQrImageDataUrl(req.body.qrImageDataUrl);
    if (!validatedQr.ok) {
      res.status(400).json({ error: validatedQr.error });
      return;
    }
    method.qrImageDataUrl = validatedQr.value;
  }
  if (typeof req.body?.isActive === 'boolean') {
    const otherActive = store.data.depositPaymentMethods.some(
      (m) => m.id !== method.id && m.isActive
    );
    if (!req.body.isActive && !otherActive) {
      res.status(400).json({
        error: 'At least one active deposit payment method is required so users can deposit.',
      });
      return;
    }
    method.isActive = req.body.isActive;
  }
  if (req.body?.isPrimary === true) {
    for (const m of store.data.depositPaymentMethods) {
      m.isPrimary = m.id === method.id;
    }
    method.isActive = true;
  }

  method.updatedAt = new Date().toISOString();
  const synced = store.syncMerchantPaymentConfigFromMethods();

  store.addAudit(
    req.userId!,
    'admin',
    'DEPOSIT_PAYMENT_METHOD_UPDATED',
    `Updated deposit method "${method.label}" (${method.upiId}, active=${method.isActive}, primary=${method.isPrimary})`,
    method.id
  );
  store.save();

  res.json({
    method,
    methods: store.data.depositPaymentMethods,
    merchantPaymentConfig: synced,
    message: `Payment method "${method.label}" updated successfully.`,
  });
});

app.delete('/api/admin/deposit-payment-methods/:id', requireAdmin, (req: AuthedRequest, res) => {
  store.syncMerchantPaymentConfigFromMethods();
  if (store.data.depositPaymentMethods.length <= 1) {
    res.status(400).json({
      error: 'You must keep at least one deposit payment method. Edit this one or add another first.',
    });
    return;
  }
  const idx = store.data.depositPaymentMethods.findIndex((m) => m.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Deposit payment method not found.' });
    return;
  }
  const [removed] = store.data.depositPaymentMethods.splice(idx, 1);
  const synced = store.syncMerchantPaymentConfigFromMethods();

  store.addAudit(
    req.userId!,
    'admin',
    'DEPOSIT_PAYMENT_METHOD_DELETED',
    `Deleted deposit method "${removed.label}" (${removed.upiId})`,
    removed.id
  );
  store.save();

  res.json({
    methods: store.data.depositPaymentMethods,
    merchantPaymentConfig: synced,
    message: `Payment method "${removed.label}" removed.`,
  });
});

app.post('/api/admin/users/:id/credit', requireAdmin, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.params.id && u.role !== 'admin');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const amount = Math.round(Number(req.body?.amount || 0));
  const bucket = req.body?.bucket === 'bonus' ? 'bonus' : 'available';
  const note = String(req.body?.note || 'Admin direct wallet credit').trim();
  if (!Number.isFinite(amount) || amount < 1 || amount > 500000) {
    res.status(400).json({ error: 'Credit amount must be between ₹1 and ₹5,00,000.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const txnId = createId('TXN');
  store.data.transactions.unshift({
    id: txnId,
    userId: user.id,
    type: bucket === 'bonus' ? 'promo_bonus' : 'deposit',
    bucket,
    amount,
    status: 'Credited',
    title: bucket === 'bonus' ? 'Admin Bonus Credit' : 'Admin Wallet Credit',
    description: note,
    createdAt: nowIso,
  });

  store.addNotification(
    user.id,
    bucket === 'bonus' ? 'bonus' : 'deposit',
    bucket === 'bonus' ? 'Bonus Credited by Admin' : 'Money Added to Your Account',
    `₹${amount} has been added to your ${bucket === 'bonus' ? 'Bonus' : 'Available'} Balance (${note}). Ref: ${txnId}`
  );
  store.addAudit(
    req.userId!,
    'admin',
    'ADMIN_USER_CREDITED',
    `Credited ₹${amount} to ${user.id} (${bucket}): ${note}`,
    user.id
  );
  store.save();

  res.json({ wallet: store.computeWallet(user.id), transactionId: txnId });
});

app.get('/api/admin/users/:id/history', requireAdmin, (req, res) => {
  const userId = req.params.id;
  res.json({
    gameSessions: store.data.gameSessions.filter((s) => s.userId === userId),
    transactions: store.data.transactions.filter((t) => t.userId === userId),
  });
});

app.put('/api/admin/users/:id/withdrawal-settings', requireAdmin, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.params.id && u.role !== 'admin');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const rawMin = req.body?.custom_minimum_withdrawal;
  let customMin: number | null = null;
  if (rawMin !== null && rawMin !== undefined && String(rawMin).trim() !== '') {
    const parsedMin = Math.round(Number(rawMin));
    if (!Number.isFinite(parsedMin) || parsedMin < 100 || parsedMin > 500000) {
      res.status(400).json({
        error: 'Custom minimum withdrawal amount must be between ₹100 and ₹5,00,000.',
      });
      return;
    }
    customMin = parsedMin;
  }

  const rawNotice = req.body?.custom_withdrawal_notice;
  const trimmedNotice =
    typeof rawNotice === 'string' ? rawNotice.trim().slice(0, 500) : '';
  const customNotice: string | null = trimmedNotice.length > 0 ? trimmedNotice : null;

  if (!Array.isArray(store.data.individual_user_withdrawal_settings)) {
    store.data.individual_user_withdrawal_settings = [];
  }

  const existingIdx = store.data.individual_user_withdrawal_settings.findIndex(
    (s) => s.user_id === user.id
  );

  // If both custom values are cleared, remove override so global defaults apply
  if (customMin === null && customNotice === null) {
    if (existingIdx !== -1) {
      store.data.individual_user_withdrawal_settings.splice(existingIdx, 1);
    }
    store.addAudit(
      req.userId!,
      'admin',
      'INDIVIDUAL_WITHDRAWAL_SETTINGS_RESET',
      `Cleared individual withdrawal settings for ${user.id} (restored global defaults)`,
      user.id
    );
    store.save();
    res.json({
      setting: null,
      effective: store.getEffectiveWithdrawalSettings(user.id),
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const nextRecord = {
    id:
      existingIdx !== -1
        ? store.data.individual_user_withdrawal_settings[existingIdx].id
        : createId('IWS'),
    user_id: user.id,
    custom_minimum_withdrawal: customMin,
    custom_withdrawal_notice: customNotice,
    updated_at: nowIso,
    updated_by_admin_id: req.userId!,
  };

  if (existingIdx !== -1) {
    store.data.individual_user_withdrawal_settings[existingIdx] = nextRecord;
  } else {
    store.data.individual_user_withdrawal_settings.push(nextRecord);
  }

  store.addAudit(
    req.userId!,
    'admin',
    'INDIVIDUAL_WITHDRAWAL_SETTINGS_UPDATED',
    `Updated individual withdrawal settings for ${user.id} (Min: ${
      customMin !== null ? `₹${customMin}` : 'Default'
    }, Notice: ${customNotice ? 'Custom set' : 'Default'})`,
    user.id
  );
  store.save();

  res.json({
    setting: nextRecord,
    effective: store.getEffectiveWithdrawalSettings(user.id),
  });
});

app.delete('/api/admin/users/:id/withdrawal-settings', requireAdmin, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.params.id && u.role !== 'admin');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (Array.isArray(store.data.individual_user_withdrawal_settings)) {
    store.data.individual_user_withdrawal_settings =
      store.data.individual_user_withdrawal_settings.filter((s) => s.user_id !== user.id);
  }

  store.addAudit(
    req.userId!,
    'admin',
    'INDIVIDUAL_WITHDRAWAL_SETTINGS_RESET',
    `Reset individual withdrawal settings to global defaults for ${user.id}`,
    user.id
  );
  store.save();

  res.json({
    setting: null,
    effective: store.getEffectiveWithdrawalSettings(user.id),
  });
});

app.patch('/api/admin/users/:id/status', requireAdmin, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.params.id && u.role !== 'admin');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const nextStatus = req.body?.status === 'suspended' ? 'suspended' : 'active';
  user.status = nextStatus;
  store.addAudit(
    req.userId!,
    'admin',
    `USER_${nextStatus.toUpperCase()}`,
    `Changed account ${user.id} status to ${nextStatus}`,
    user.id
  );
  store.save();
  res.json({ user: store.sanitizeUser(user) });
});

app.patch('/api/admin/users/:id/kyc', requireAdmin, (req: AuthedRequest, res) => {
  const user = store.data.users.find((u) => u.id === req.params.id && u.role !== 'admin');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const nextKyc = req.body?.kycStatus === 'verified' ? 'verified' : 'rejected';
  user.kycStatus = nextKyc;
  store.addNotification(
    user.id,
    'security',
    nextKyc === 'verified' ? 'KYC Verified' : 'KYC Rejected',
    nextKyc === 'verified'
      ? 'Your identity verification is complete. Withdrawals are now enabled.'
      : 'Your KYC submission was rejected. Please resubmit valid documents.'
  );
  store.addAudit(req.userId!, 'admin', 'KYC_REVIEWED', `Set ${user.id} KYC to ${nextKyc}`, user.id);
  store.save();
  res.json({ user: store.sanitizeUser(user) });
});

app.patch('/api/admin/deposits/:id', requireAdmin, (req: AuthedRequest, res) => {
  const deposit = store.data.deposits.find((d) => d.id === req.params.id);
  if (!deposit) {
    res.status(404).json({ error: 'Deposit not found.' });
    return;
  }
  if (deposit.status !== 'Pending') {
    res.status(400).json({ error: 'Only Pending deposits can be updated.' });
    return;
  }
  const nextStatus = req.body?.status === 'Successful' ? 'Successful' : 'Failed';
  const nowIso = new Date().toISOString();
  deposit.status = nextStatus;
  deposit.updatedAt = nowIso;

  if (nextStatus === 'Failed') {
    const reason = String(req.body?.reason || 'Transaction ID could not be verified by admin').trim();
    deposit.failureReason = reason;
    deposit.adminNote = reason;
    store.addNotification(
      deposit.userId,
      'deposit',
      'Deposit Request Rejected',
      `Your ₹${deposit.amount} deposit request (UTR: ${deposit.utrNumber || deposit.gatewayOrderId}) was rejected: ${reason}`
    );
  } else {
    const requestedCredit =
      req.body?.creditedAmount !== undefined ? Math.round(Number(req.body.creditedAmount)) : deposit.amount;
    if (!Number.isFinite(requestedCredit) || requestedCredit < 1 || requestedCredit > 500000) {
      res.status(400).json({ error: 'Credited amount must be between ₹1 and ₹5,00,000.' });
      return;
    }

    const includeBonus = req.body?.includeBonus !== false;
    const depUser = store.data.users.find((u) => u.id === deposit.userId);
    const recalculatedBonus = includeBonus
      ? requestedCredit === deposit.amount
        ? deposit.bonusAmount
        : computeDepositBonusForAmount(requestedCredit, depUser ? !depUser.firstDepositOfferUsed : false)
            .bonusAmount
      : 0;

    deposit.creditedAmount = requestedCredit;
    deposit.bonusAmount = recalculatedBonus;
    deposit.webhookVerified = true;
    deposit.gatewayPaymentId = deposit.utrNumber || deposit.gatewayPaymentId || `adm_ver_${Date.now().toString(36)}`;
    deposit.adminNote = String(req.body?.adminNote || `Credited ₹${requestedCredit} by Admin`).trim();

    if (depUser) depUser.firstDepositOfferUsed = true;

    const methodLabel = deposit.paymentMethod || deposit.gateway;
    const utrLabel = deposit.utrNumber || deposit.userTransactionRef || deposit.gatewayOrderId;

    store.data.transactions.unshift({
      id: deposit.transactionId,
      userId: deposit.userId,
      type: 'deposit',
      bucket: 'available',
      amount: requestedCredit,
      status: 'Successful',
      title: `Deposit via ${methodLabel}`,
      description: `Admin verified UTR ${utrLabel}`,
      referenceId: deposit.id,
      createdAt: nowIso,
    });

    if (recalculatedBonus > 0) {
      store.data.transactions.unshift({
        id: createId('TXN'),
        userId: deposit.userId,
        type: 'deposit_bonus',
        bucket: 'bonus',
        amount: recalculatedBonus,
        status: 'Credited',
        title: 'Deposit Tier Bonus Credited',
        description: `Bonus for ₹${requestedCredit} verified deposit (${deposit.id})`,
        referenceId: deposit.id,
        createdAt: nowIso,
      });
    }

    store.addNotification(
      deposit.userId,
      'deposit',
      'Money Added to Your Account',
      `₹${requestedCredit}${recalculatedBonus > 0 ? ` + ₹${recalculatedBonus} bonus` : ''} has been added to your wallet (UTR: ${utrLabel}).`
    );

    // Automatic backend Referral Activity Reward (e.g. 10% for verified deposits >= ₹100)
    store.processDepositReferralReward(deposit, requestedCredit, nowIso);
  }
  store.addAudit(
    req.userId!,
    'admin',
    `DEPOSIT_${nextStatus.toUpperCase()}`,
    nextStatus === 'Successful'
      ? `Admin credited ₹${deposit.creditedAmount ?? deposit.amount} (+₹${deposit.bonusAmount} bonus) for ${deposit.id} (UTR: ${deposit.utrNumber || 'N/A'})`
      : `Admin rejected ${deposit.id}: ${deposit.failureReason}`,
    deposit.id
  );
  store.save();
  broadcastAdminEvent('deposit:updated', {
    userId: deposit.userId,
    userName: deposit.userName,
    recordId: deposit.id,
    amount: deposit.creditedAmount ?? deposit.amount,
    status: deposit.status,
    utrNumber: deposit.utrNumber,
    createdAt: deposit.updatedAt,
  });
  res.json({ deposit, userWallet: store.computeWallet(deposit.userId) });
});

app.patch('/api/admin/withdrawals/:id', requireAdmin, (req: AuthedRequest, res) => {
  const withdrawal = store.data.withdrawals.find((w) => w.id === req.params.id);
  if (!withdrawal) {
    res.status(404).json({ error: 'Withdrawal request not found.' });
    return;
  }
  if (withdrawal.status === 'Completed' || withdrawal.status === 'Rejected') {
    res.status(400).json({ error: 'Finalized withdrawals cannot be modified.' });
    return;
  }

  const allowedStatuses: WithdrawalStatus[] = [
    'Pending',
    'Under Review',
    'Approved',
    'Processing',
    'Completed',
    'Rejected',
  ];
  const nextStatus = req.body?.status as WithdrawalStatus;
  if (!allowedStatuses.includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid withdrawal status.' });
    return;
  }

  const nowIso = new Date().toISOString();

  if (nextStatus === 'Rejected') {
    const reason = String(req.body?.rejectionReason || '').trim();
    if (reason.length < 4) {
      res.status(400).json({ error: 'A clear rejection reason is required.' });
      return;
    }
    withdrawal.status = 'Rejected';
    withdrawal.rejectionReason = reason;
    withdrawal.updatedAt = nowIso;

    // Refund the debited amount back to user's available balance
    store.data.transactions.unshift({
      id: createId('TXN'),
      userId: withdrawal.userId,
      type: 'withdrawal_refund',
      bucket: 'available',
      amount: withdrawal.amount,
      status: 'Refunded',
      title: 'Withdrawal Refunded',
      description: `Refund for rejected withdrawal ${withdrawal.id}: ${reason}`,
      referenceId: withdrawal.id,
      createdAt: nowIso,
    });
    store.addNotification(
      withdrawal.userId,
      'withdrawal',
      'Withdrawal Rejected & Refunded',
      `Your withdrawal of ₹${withdrawal.amount} was rejected (${reason}). ₹${withdrawal.amount} has been returned to your Available Balance.`
    );
  } else {
    withdrawal.status = nextStatus;
    withdrawal.updatedAt = nowIso;
    if (nextStatus === 'Completed') {
      withdrawal.utrNumber = String(req.body?.utrNumber || `UTR${Date.now().toString().slice(-10)}`);
      store.addNotification(
        withdrawal.userId,
        'withdrawal',
        'Withdrawal Completed',
        `Your withdrawal of ₹${withdrawal.amount} has been paid (Ref: ${withdrawal.utrNumber}).`
      );
    } else if (nextStatus === 'Approved') {
      store.addNotification(
        withdrawal.userId,
        'withdrawal',
        'Withdrawal Approved',
        `Your withdrawal of ₹${withdrawal.amount} (${withdrawal.transactionId}) has been approved for payout processing.`
      );
    }
  }

  // Sync status label on the original withdrawal ledger entry
  const origTxn = store.data.transactions.find((t) => t.id === withdrawal.transactionId);
  if (origTxn) {
    origTxn.status = withdrawal.status;
  }

  store.addAudit(
    req.userId!,
    'admin',
    `WITHDRAWAL_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
    `Updated ${withdrawal.id} (₹${withdrawal.amount}) to ${nextStatus}`,
    withdrawal.id
  );
  store.save();

  broadcastAdminEvent('withdrawal:updated', {
    userId: withdrawal.userId,
    userName: withdrawal.userName,
    recordId: withdrawal.id,
    amount: withdrawal.amount,
    status: withdrawal.status,
    createdAt: withdrawal.updatedAt,
  });

  res.json({ withdrawal });
});

app.post('/api/admin/games', requireAdmin, (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || 'Casino') as GameCategory;
  const engine = String(req.body?.engine || 'wheel') as GameEngineType;
  const difficulty = (['Easy', 'Medium', 'Hard'].includes(req.body?.difficulty)
    ? req.body.difficulty
    : 'Easy') as 'Easy' | 'Medium' | 'Hard';
  const winMultiplier = Math.max(1.2, Math.min(5, Number(req.body?.winMultiplier || 2.5)));
  const instructions = String(
    req.body?.instructions || 'Select your entry fee, place your prediction, and play the round.'
  ).trim();
  const rewardRuleText = String(
    req.body?.rewardRuleText ||
      `Entry fee ₹10 wins ₹${Math.round(10 * winMultiplier)} (${winMultiplier}×). Server win ratio: 50%–60% random.`
  ).trim();
  const isTournament = Boolean(req.body?.isTournament);

  if (name.length < 2) {
    res.status(400).json({ error: 'Game name is required.' });
    return;
  }

  const engineThumbs: Record<GameEngineType, string> = {
    money_rolling: '/assets/aistudio/Screenshot_20261119-163122.777CCZ.COM_7bec12cc.png',
    hot_volcano: '/assets/aistudio/Screenshot_20261119-163014.777CCZ.COM_6e488a7d.png',
    aviator: '/assets/aistudio/Screenshot_20261119-162534.777CCZ.COM_ef93a099.png',
    mines_grid: '/assets/aistudio/Screenshot_20261119-162125.777CCZ.COM_b90c0421.png',
    twist: '/assets/aistudio/Screenshot_20261119-161541.777CCZ.COM_fbeed72a.png',
    wheel: '/src/assets/images/casino_spin_wheel_1795010267797.jpg',
    dice: '/src/assets/images/casino_dice_duel_1795010267327.jpg',
    coin: '/src/assets/images/casino_coin_flip_1795010266946.jpg',
    cards: '/src/assets/images/casino_lucky_cards_1795010267201.jpg',
    mines: '/src/assets/images/casino_treasure_mines_1795010268436.jpg',
    slots: '/src/assets/images/casino_slot_777_1795010268434.jpg',
  };

  const rawMinRatio =
    req.body?.minWinRatio !== undefined
      ? Number(req.body.minWinRatio)
      : req.body?.winRatio !== undefined
      ? Number(req.body.winRatio)
      : 50;
  const rawMaxRatio =
    req.body?.maxWinRatio !== undefined
      ? Number(req.body.maxWinRatio)
      : req.body?.winRatio !== undefined
      ? Number(req.body.winRatio)
      : Math.min(95, rawMinRatio + 10);
  const minWinRatio = Math.max(5, Math.min(95, Math.round(rawMinRatio || 50)));
  const maxWinRatio = Math.max(minWinRatio, Math.min(95, Math.round(rawMaxRatio || minWinRatio)));

  const game = {
    id: createId('GM'),
    name,
    category,
    engine,
    thumbnail: engineThumbs[engine] || engineThumbs.wheel,
    difficulty,
    instructions,
    rewardRuleText,
    entryFeeOptions: [10, 20, 50, 100, 250, 500],
    winMultiplier,
    minWinRatio,
    maxWinRatio,
    isTournament,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  };

  store.data.games.unshift(game);
  for (const u of store.data.users.filter((usr) => usr.role === 'user' && usr.status === 'active')) {
    store.addNotification(
      u.id,
      'game',
      'New Casino Game Available',
      `${game.name} (${game.category}) is live. ₹10 entry wins ₹${Math.round(10 * winMultiplier)}.`
    );
  }
  store.addAudit(req.userId!, 'admin', 'GAME_CREATED', `Added casino game ${game.name}`, game.id);
  store.save();

  res.status(201).json({ game });
});

app.patch('/api/admin/games/:id', requireAdmin, (req: AuthedRequest, res) => {
  const game = store.data.games.find((g) => g.id === req.params.id);
  if (!game) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  if (req.body?.name) game.name = String(req.body.name).trim();
  if (req.body?.difficulty) game.difficulty = req.body.difficulty;
  if (req.body?.instructions) game.instructions = String(req.body.instructions).trim();
  if (req.body?.rewardRuleText) game.rewardRuleText = String(req.body.rewardRuleText).trim();
  if (typeof req.body?.winMultiplier === 'number') {
    game.winMultiplier = Math.max(1.2, Math.min(10, req.body.winMultiplier));
  }
  if (typeof req.body?.winRatio === 'number') {
    const ratio = Math.max(5, Math.min(95, Math.round(req.body.winRatio)));
    game.minWinRatio = ratio;
    game.maxWinRatio = ratio;
  } else {
    if (typeof req.body?.minWinRatio === 'number') {
      game.minWinRatio = Math.max(5, Math.min(95, Math.round(req.body.minWinRatio)));
    }
    if (typeof req.body?.maxWinRatio === 'number') {
      game.maxWinRatio = Math.max(game.minWinRatio, Math.min(95, Math.round(req.body.maxWinRatio)));
    }
    if (game.maxWinRatio < game.minWinRatio) {
      game.maxWinRatio = game.minWinRatio;
    }
  }
  if (typeof req.body?.isTournament === 'boolean') {
    game.isTournament = req.body.isTournament;
  }
  if (typeof req.body?.active === 'boolean') {
    game.active = req.body.active;
  }
  store.addAudit(
    req.userId!,
    'admin',
    'GAME_UPDATED',
    `Updated ${game.name} (Win Ratio: ${game.minWinRatio}%–${game.maxWinRatio}%, Mult: ${game.winMultiplier}x)`,
    game.id
  );
  store.save();
  res.json({ game });
});

app.delete('/api/admin/games/:id', requireAdmin, (req: AuthedRequest, res) => {
  const idx = store.data.games.findIndex((g) => g.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }
  const [removed] = store.data.games.splice(idx, 1);
  store.addAudit(req.userId!, 'admin', 'GAME_DELETED', `Removed game ${removed.name}`, removed.id);
  store.save();
  res.json({ ok: true });
});

app.patch('/api/admin/welcome-bonus', requireAdmin, (req: AuthedRequest, res) => {
  const cfg = store.data.welcomeBonusConfig;
  if (typeof req.body?.amount === 'number') cfg.amount = Math.max(0, Math.round(req.body.amount));
  if (typeof req.body?.expiryDays === 'number') cfg.expiryDays = Math.max(1, Math.round(req.body.expiryDays));
  if (typeof req.body?.enabled === 'boolean') cfg.enabled = req.body.enabled;
  if (typeof req.body?.terms === 'string' && req.body.terms.trim()) cfg.terms = req.body.terms.trim();

  const welcomeCamp = store.data.bonusCampaigns.find((c) => c.type === 'welcome');
  if (welcomeCamp) {
    welcomeCamp.rewardAmount = cfg.amount;
    welcomeCamp.expiryDays = cfg.expiryDays;
    welcomeCamp.active = cfg.enabled;
  }

  store.addAudit(
    req.userId!,
    'admin',
    'WELCOME_BONUS_UPDATED',
    `Configured welcome bonus: ₹${cfg.amount}, ${cfg.expiryDays}d, enabled=${cfg.enabled}`
  );
  store.save();
  res.json({ welcomeBonusConfig: cfg });
});

app.post('/api/admin/campaigns', requireAdmin, (req: AuthedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const rewardAmount = Math.max(5, Math.round(Number(req.body?.rewardAmount || 25)));
  const eligibilityRules = String(req.body?.eligibilityRules || 'Active verified users only.').trim();
  const expiryDays = Math.max(1, Math.round(Number(req.body?.expiryDays || 14)));

  if (title.length < 3) {
    res.status(400).json({ error: 'Campaign title is required.' });
    return;
  }

  const campaign = {
    id: createId('CMP'),
    title,
    description: description || 'Promotional bonus campaign.',
    type: 'promo' as const,
    rewardAmount,
    eligibilityRules,
    expiryDays,
    active: true,
    totalClaimedCount: 0,
    totalDistributedAmount: 0,
  };
  store.data.bonusCampaigns.unshift(campaign);

  for (const u of store.data.users.filter((usr) => usr.role === 'user' && usr.status === 'active')) {
    store.addNotification(u.id, 'promo', 'New Promotional Offer', `${campaign.title}: ${campaign.description}`);
  }
  store.addAudit(req.userId!, 'admin', 'CAMPAIGN_CREATED', `Created campaign ${campaign.title}`, campaign.id);
  store.save();

  res.status(201).json({ campaign });
});

app.patch('/api/admin/campaigns/:id', requireAdmin, (req: AuthedRequest, res) => {
  const campaign = store.data.bonusCampaigns.find((c) => c.id === req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') campaign.active = req.body.active;
  store.save();
  res.json({ campaign });
});

// ============================================================================
// REFERRAL & REWARDS SYSTEM ROUTES (USER + PRIVATE ADMIN)
// ============================================================================

app.get('/api/referrals/me', requireAuth, (req: AuthedRequest, res) => {
  const beforeCodesCount = (store.data.referral_codes || []).length;
  const dashboard = store.getUserReferralDashboard(req.userId!);
  if (!dashboard) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }
  if ((store.data.referral_codes || []).length !== beforeCodesCount) {
    store.save();
  }
  res.json(dashboard);
});

app.get('/api/admin/referrals', requireAdmin, (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(store.getAdminReferralOverview(q));
});

app.patch('/api/admin/referrals/settings', requireAdmin, (req: AuthedRequest, res) => {
  const settings = store.getReferralSettings();
  const nextSignupBonus =
    req.body?.signup_bonus !== undefined ? Number(req.body.signup_bonus) : settings.signup_bonus;
  const nextPercentage =
    req.body?.referral_percentage !== undefined
      ? Number(req.body.referral_percentage)
      : settings.referral_percentage;
  const nextMinDeposit =
    req.body?.minimum_qualifying_deposit !== undefined
      ? Number(req.body.minimum_qualifying_deposit)
      : settings.minimum_qualifying_deposit;
  const nextEnabled =
    typeof req.body?.promotion_enabled === 'boolean'
      ? req.body.promotion_enabled
      : settings.promotion_enabled;

  if (!Number.isFinite(nextSignupBonus) || nextSignupBonus < 0 || nextSignupBonus > 10000) {
    res.status(400).json({ error: 'Signup bonus must be between ₹0 and ₹10,000.' });
    return;
  }
  if (!Number.isFinite(nextPercentage) || nextPercentage < 0 || nextPercentage > 50) {
    res.status(400).json({ error: 'Referral percentage must be between 0% and 50%.' });
    return;
  }
  if (!Number.isFinite(nextMinDeposit) || nextMinDeposit < 1 || nextMinDeposit > 100000) {
    res.status(400).json({ error: 'Minimum qualifying deposit must be between ₹1 and ₹1,00,000.' });
    return;
  }

  settings.signup_bonus = Math.round(nextSignupBonus * 100) / 100;
  settings.referral_percentage = Math.round(nextPercentage * 100) / 100;
  settings.minimum_qualifying_deposit = Math.round(nextMinDeposit * 100) / 100;
  settings.promotion_enabled = nextEnabled;
  settings.updated_at = new Date().toISOString();

  const refCamp = store.data.bonusCampaigns.find((c) => c.type === 'referral');
  if (refCamp) {
    refCamp.rewardAmount = settings.signup_bonus;
    refCamp.active = settings.promotion_enabled;
    refCamp.description = `Earn ₹${settings.signup_bonus} signup bonus + ${settings.referral_percentage}% on verified deposits ≥ ₹${settings.minimum_qualifying_deposit}.`;
  }

  store.addAudit(
    req.userId!,
    'admin',
    'REFERRAL_SETTINGS_UPDATED',
    `Updated referral settings: enabled=${settings.promotion_enabled}, signup_bonus=₹${settings.signup_bonus}, percentage=${settings.referral_percentage}%, min_deposit=₹${settings.minimum_qualifying_deposit}`
  );
  store.save();

  res.json({
    settings,
    message: 'Referral settings saved successfully.',
  });
});

app.post('/api/admin/referrals/rewards/:id/reverse', requireAdmin, (req: AuthedRequest, res) => {
  const rewardId = String(req.params.id || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!rewardId) {
    res.status(400).json({ error: 'Reward ID is required.' });
    return;
  }
  if (reason.length < 4) {
    res.status(400).json({ error: 'Enter a brief reversal reason (at least 4 characters).' });
    return;
  }
  const result = store.reverseReferralReward(rewardId, req.userId!, reason);
  if (!result.ok) {
    res.status(400).json({ error: result.error || 'Unable to reverse referral reward.' });
    return;
  }
  store.save();
  res.json({
    reward: result.reward,
    message: `Referral reward ${rewardId} reversed and deducted from referrer bonus wallet.`,
  });
});

// ============================================================================
// APP RELEASE UPLOAD & DIRECT APP SHARING ROUTES
// ============================================================================

const ALLOWED_APP_EXTENSIONS = new Set(['.apk', '.aab', '.zip']);

function sanitizeDownloadFilename(rawName: string): string {
  const base = path.basename(String(rawName || 'GameReward.apk')).trim();
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_');
  const ext = path.extname(cleaned).toLowerCase();
  if (!ALLOWED_APP_EXTENSIONS.has(ext)) {
    return 'GameReward.apk';
  }
  return cleaned.slice(0, 80) || 'GameReward.apk';
}

function getSafeUploadPath(storedFileName?: string | null): string | null {
  if (!storedFileName) return null;
  const safeBase = path.basename(storedFileName);
  const resolved = path.resolve(UPLOADS_DIR, safeBase);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
  return resolved;
}

app.get('/api/app-release', (_req, res) => {
  res.json({ appRelease: store.getPublicAppRelease() });
});

app.get('/api/app-release/download', (_req, res) => {
  const cfg = store.data.appReleaseConfig;
  if (!cfg || !cfg.enabled || !cfg.storedFileName) {
    res.status(404).json({ error: 'App file has not been uploaded by Admin yet.' });
    return;
  }
  const filePath = getSafeUploadPath(cfg.storedFileName);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Uploaded app file not found on server.' });
    return;
  }
  const downloadName = sanitizeDownloadFilename(cfg.fileName || `${cfg.appName || 'GameReward'}.apk`);
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', cfg.mimeType || 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
});

app.get('/api/admin/app-release', requireAdmin, (_req: AuthedRequest, res) => {
  res.json({ appRelease: store.getPublicAppRelease() });
});

app.post(
  '/api/admin/app-release/upload',
  requireAdmin,
  express.raw({ type: ['application/octet-stream', 'application/vnd.android.package-archive', 'application/zip'], limit: '150mb' }),
  (req: AuthedRequest, res) => {
    const fileBuf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!fileBuf || fileBuf.length === 0) {
      res.status(400).json({ error: 'Please select a valid Android App (.apk / .aab / .zip) file to upload.' });
      return;
    }

    const rawFileNameHeader = String(req.headers['x-file-name'] || 'GameReward.apk');
    let decodedName = rawFileNameHeader;
    try {
      decodedName = decodeURIComponent(rawFileNameHeader);
    } catch {
      decodedName = rawFileNameHeader;
    }
    const ext = path.extname(path.basename(decodedName)).toLowerCase();
    if (!ALLOWED_APP_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'Only .apk, .aab, or .zip Android app files are supported.' });
      return;
    }

    const displayName = sanitizeDownloadFilename(decodedName);
    const storedName = `app-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const targetPath = getSafeUploadPath(storedName);
    if (!targetPath) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    // Remove previous uploaded file cleanly after writing the new one
    const prevStored = store.data.appReleaseConfig?.storedFileName;
    const tmpPath = `${targetPath}.tmp`;
    fs.writeFileSync(tmpPath, fileBuf);
    fs.renameSync(tmpPath, targetPath);

    if (prevStored && prevStored !== storedName) {
      const prevPath = getSafeUploadPath(prevStored);
      if (prevPath && fs.existsSync(prevPath)) {
        try {
          fs.unlinkSync(prevPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }

    const nowIso = new Date().toISOString();
    const versionHeader = String(req.headers['x-app-version'] || '').trim().slice(0, 30);
    const appNameHeader = String(req.headers['x-app-name'] || '').trim().slice(0, 60);

    const cfg = store.data.appReleaseConfig;
    if (appNameHeader) cfg.appName = appNameHeader;
    if (versionHeader) cfg.version = versionHeader;
    cfg.fileName = displayName;
    cfg.storedFileName = storedName;
    cfg.fileSizeBytes = fileBuf.length;
    cfg.mimeType =
      ext === '.apk'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream';
    cfg.enabled = true;
    cfg.uploadedAt = nowIso;
    cfg.uploadedBy = req.userId || 'ADMIN';

    store.addAudit(
      req.userId!,
      'admin',
      'APP_RELEASE_UPLOADED',
      `Uploaded app file "${displayName}" (${(fileBuf.length / (1024 * 1024)).toFixed(2)} MB, v${cfg.version})`
    );
    store.save();

    res.status(201).json({
      appRelease: store.getPublicAppRelease(),
      message: `${displayName} uploaded successfully! Users can now share this app directly in Refer & Earn.`,
    });
  }
);

app.patch('/api/admin/app-release', requireAdmin, (req: AuthedRequest, res) => {
  const cfg = store.data.appReleaseConfig;
  if (typeof req.body?.appName === 'string' && req.body.appName.trim().length >= 2) {
    cfg.appName = req.body.appName.trim().slice(0, 60);
  }
  if (typeof req.body?.version === 'string' && req.body.version.trim().length >= 1) {
    cfg.version = req.body.version.trim().slice(0, 30);
  }
  if (typeof req.body?.releaseNotes === 'string') {
    cfg.releaseNotes = req.body.releaseNotes.trim().slice(0, 400);
  }
  if (typeof req.body?.shareMessageTemplate === 'string' && req.body.shareMessageTemplate.trim().length >= 4) {
    cfg.shareMessageTemplate = req.body.shareMessageTemplate.trim().slice(0, 400);
  }
  if (typeof req.body?.enabled === 'boolean') {
    cfg.enabled = req.body.enabled;
  }

  store.addAudit(
    req.userId!,
    'admin',
    'APP_RELEASE_SETTINGS_UPDATED',
    `Updated App Release settings (${cfg.appName} v${cfg.version}, enabled=${cfg.enabled})`
  );
  store.save();

  res.json({
    appRelease: store.getPublicAppRelease(),
    message: 'App share settings saved successfully.',
  });
});

app.delete('/api/admin/app-release/file', requireAdmin, (req: AuthedRequest, res) => {
  const cfg = store.data.appReleaseConfig;
  const prevPath = getSafeUploadPath(cfg.storedFileName);
  if (prevPath && fs.existsSync(prevPath)) {
    try {
      fs.unlinkSync(prevPath);
    } catch {
      // ignore
    }
  }
  const removedName = cfg.fileName || 'App file';
  cfg.fileName = null;
  cfg.storedFileName = null;
  cfg.fileSizeBytes = 0;
  cfg.uploadedAt = null;
  cfg.uploadedBy = null;

  store.addAudit(
    req.userId!,
    'admin',
    'APP_RELEASE_FILE_DELETED',
    `Removed uploaded app file (${removedName})`
  );
  store.save();

  res.json({
    appRelease: store.getPublicAppRelease(),
    message: 'Uploaded app file removed.',
  });
});

// ============================================================================
// APP STARTUP INFORMATION / ANNOUNCEMENT POPUP ROUTES
// ============================================================================

const VALID_ANNOUNCEMENT_TONES: AppAnnouncementTone[] = ['info', 'offer', 'success', 'alert'];

app.get('/api/app-announcement', (_req, res) => {
  res.json({ announcement: store.data.appAnnouncementConfig });
});

app.get('/api/admin/announcement', requireAdmin, (_req: AuthedRequest, res) => {
  res.json({
    announcement: store.data.appAnnouncementConfig,
    history: store.data.appAnnouncementHistory || [],
  });
});

app.patch('/api/admin/announcement', requireAdmin, (req: AuthedRequest, res) => {
  const enabled = Boolean(req.body?.enabled);
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const message = String(req.body?.message || '').trim().slice(0, 1500);
  const toneRaw = String(req.body?.tone || 'info') as AppAnnouncementTone;
  const tone: AppAnnouncementTone = VALID_ANNOUNCEMENT_TONES.includes(toneRaw) ? toneRaw : 'info';
  const buttonLabel = String(req.body?.buttonLabel || 'Got It').trim().slice(0, 40) || 'Got It';
  const showMode = req.body?.showMode === 'once_per_update' ? 'once_per_update' : 'every_open';

  if (enabled && title.length < 2 && message.length < 2) {
    res.status(400).json({ error: 'Enter a notice title or message before enabling the startup popup.' });
    return;
  }

  const prev = store.data.appAnnouncementConfig;
  const nowIso = new Date().toISOString();
  const nextRevision = (prev?.revision || 0) + 1;

  store.data.appAnnouncementConfig = {
    enabled,
    title: title || 'Important Information',
    message,
    tone,
    buttonLabel,
    showMode,
    revision: nextRevision,
    updatedAt: nowIso,
    updatedBy: req.userId || 'ADMIN',
  };

  if (title || message) {
    if (!Array.isArray(store.data.appAnnouncementHistory)) {
      store.data.appAnnouncementHistory = [];
    }
    store.data.appAnnouncementHistory.unshift({
      id: createId('ANN'),
      title: store.data.appAnnouncementConfig.title,
      message,
      tone,
      buttonLabel,
      showMode,
      publishedAt: nowIso,
      publishedBy: req.userId || 'ADMIN',
    });
    store.data.appAnnouncementHistory = store.data.appAnnouncementHistory.slice(0, 15);
  }

  store.addAudit(
    req.userId!,
    'admin',
    'APP_ANNOUNCEMENT_UPDATED',
    `Updated App Startup Notice (enabled=${enabled}, mode=${showMode}, title="${store.data.appAnnouncementConfig.title}")`
  );
  store.save();

  res.json({
    announcement: store.data.appAnnouncementConfig,
    history: store.data.appAnnouncementHistory,
    message: enabled
      ? 'Startup information notice published! Users will see it as soon as they open the app.'
      : 'Startup information popup turned off.',
  });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GameReward full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
