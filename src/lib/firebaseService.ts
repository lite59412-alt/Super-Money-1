import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  computeDepositBonusForAmount,
  DAILY_BONUS_LADDER,
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_APP_RELEASE,
  DEFAULT_BONUS_CAMPAIGNS,
  DEFAULT_GAMES,
  DEFAULT_HINGLISH_REVIEWS,
  DEFAULT_MERCHANT_CONFIG,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_WELCOME_CONFIG,
  DEFAULT_WITHDRAWAL_CONFIG,
  FIRST_DEPOSIT_TIERS,
  MIN_WITHDRAWAL_LIMIT,
  PROHIBITED_STATES,
  RELOAD_DEPOSIT_TIERS,
} from './defaultData';
import type {
  AdminAnalytics,
  AdminDepositPaymentMethod,
  AdminReferralOverviewData,
  AdminReferralRelationshipView,
  AdminReferralRewardView,
  AppAnnouncementConfig,
  AppAnnouncementHistoryItem,
  AppAnnouncementTone,
  AppReleaseConfig,
  AuditLogEntry,
  AuthorizedAdminEmail,
  BonusCampaign,
  DepositBonusOfferMeta,
  DepositPaymentMethod,
  DepositRecord,
  DepositStatus,
  GameCategory,
  GameEngineType,
  GameItem,
  GameSessionRecord,
  IndividualUserWithdrawalSetting,
  LeaderboardEntry,
  LedgerTransaction,
  MerchantPaymentConfig,
  NotificationItem,
  PaymentMethod,
  ReferralSettings,
  ReferralStatus,
  ReviewItem,
  UserProfile,
  UserReferralDashboardData,
  UserReferralHistoryItem,
  WalletSummary,
  WithdrawalConfig,
  WithdrawalRecord,
  WithdrawalStatus,
} from '../types';

// ============================================================================
// INTERNAL HELPERS & FIRESTORE DOC MAPPERS
// ============================================================================

function nowIso(): string {
  return new Date().toISOString();
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${ts}${rand}`;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Please sign in to continue.');
  }
  return uid;
}

export interface FirestoreUserDoc {
  uid: string;
  id?: string;
  name: string;
  email: string;
  mobile: string;
  state: string;
  walletBalance: number;
  bonusBalance: number;
  pendingWithdrawalBalance?: number;
  totalEarnings?: number;
  totalWithdrawals?: number;
  totalDeposits?: number;
  earnedToday?: number;
  earnedTodayDate?: string;
  referralCode: string;
  referredBy?: string | null;
  referredByUid?: string | null;
  role: 'user' | 'admin';
  isBanned: boolean;
  status?: 'active' | 'suspended';
  kycStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  kycSubmittedAt?: string;
  kycDocumentType?: string;
  kycDocumentLast4?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusExpiresAt?: string;
  firstDepositOfferUsed?: boolean;
  dailyStreak?: number;
  lastCheckInDate?: string;
  paymentMethods?: PaymentMethod[];
  customWinRatio?: number | null;
  individualWithdrawalSetting?: IndividualUserWithdrawalSetting | null;
  createdAt: string;
}

export interface FirestoreTransactionDoc {
  id: string;
  userId: string;
  userName: string;
  userMobile?: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  creditedAmount?: number;
  bonusAmount?: number;
  status: 'pending' | 'approved' | 'rejected';
  displayStatus?: string;
  utrNumber?: string;
  upiId?: string;
  screenshotBase64?: string | null;
  paymentMethod?: DepositPaymentMethod | 'Google Pay' | 'QR Code';
  methodType?: 'upi' | 'bank';
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  rejectionReason?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreReferralDoc {
  id: string;
  referrerUserId: string;
  referrerName: string;
  referredUserId: string;
  referredUserName: string;
  referralCode: string;
  rewardType: 'invitation' | 'signup' | 'deposit';
  qualifyingTransactionId: string;
  qualifyingAmount: number;
  rewardPercentage: number;
  rewardAmount: number;
  status: ReferralStatus;
  registrationDate: string;
  createdAt: string;
  reversedAt?: string;
  reversalReason?: string;
}

function mapUserDocToProfile(docData: FirestoreUserDoc): UserProfile {
  const isBanned = Boolean(docData.isBanned) || docData.status === 'suspended';
  return {
    id: docData.uid || docData.id || '',
    uid: docData.uid || docData.id || '',
    name: docData.name || 'Player',
    mobile: docData.mobile || '',
    email: docData.email || '',
    state: docData.state || 'Maharashtra',
    role: docData.role === 'admin' ? 'admin' : 'user',
    status: isBanned ? 'suspended' : 'active',
    isBanned,
    walletBalance: round2(docData.walletBalance ?? 0),
    bonusBalance: round2(docData.bonusBalance ?? 0),
    kycStatus: docData.kycStatus || 'unverified',
    kycSubmittedAt: docData.kycSubmittedAt,
    kycDocumentType: docData.kycDocumentType,
    kycDocumentLast4: docData.kycDocumentLast4,
    referralCode: docData.referralCode || 'GRUSER',
    referredBy: docData.referredBy || undefined,
    welcomeBonusClaimed: Boolean(docData.welcomeBonusClaimed),
    welcomeBonusExpiresAt: docData.welcomeBonusExpiresAt,
    firstDepositOfferUsed: Boolean(docData.firstDepositOfferUsed),
    dailyStreak: Number(docData.dailyStreak || 0),
    lastCheckInDate: docData.lastCheckInDate || undefined,
    customWinRatio:
      typeof docData.customWinRatio === 'number' && Number.isFinite(docData.customWinRatio)
        ? Math.max(0, Math.min(100, Math.round(docData.customWinRatio)))
        : null,
    paymentMethods: Array.isArray(docData.paymentMethods) ? docData.paymentMethods : [],
    createdAt: docData.createdAt || nowIso(),
  };
}

export function buildWalletSummary(
  userDoc: FirestoreUserDoc,
  withdrawalConfig: WithdrawalConfig = DEFAULT_WITHDRAWAL_CONFIG
): WalletSummary {
  const available = round2(userDoc.walletBalance ?? 0);
  const bonus = round2(userDoc.bonusBalance ?? 0);
  const customSetting = userDoc.individualWithdrawalSetting || null;
  const minLimit =
    customSetting && typeof customSetting.custom_minimum_withdrawal === 'number'
      ? customSetting.custom_minimum_withdrawal
      : withdrawalConfig.minWithdrawalLimit || MIN_WITHDRAWAL_LIMIT;

  const hasCustomNotice = Boolean(customSetting?.custom_withdrawal_notice?.trim());
  const withdrawalNoticeBanner = hasCustomNotice
    ? {
        enabled: true,
        title: 'Account Withdrawal Notice',
        message: customSetting!.custom_withdrawal_notice!.trim(),
        isCustom: true,
      }
    : {
        enabled: Boolean(withdrawalConfig.noticeBannerEnabled),
        title: withdrawalConfig.noticeBannerTitle || 'Withdrawal Notice',
        message: withdrawalConfig.noticeBannerMessage || '',
        isCustom: false,
      };

  const earnedToday =
    userDoc.earnedTodayDate === todayDateKey() ? round2(userDoc.earnedToday ?? 0) : 0;

  return {
    totalBalance: round2(available + bonus),
    availableBalance: available,
    bonusBalance: bonus,
    totalEarnings: round2(userDoc.totalEarnings ?? 0),
    totalWithdrawals: round2(userDoc.totalWithdrawals ?? 0),
    totalDeposits: round2(userDoc.totalDeposits ?? 0),
    earnedToday,
    minWithdrawalLimit: minLimit,
    withdrawalNoticeBanner,
  };
}

function mapTxToDeposit(tx: FirestoreTransactionDoc): DepositRecord {
  const mappedStatus: DepositStatus =
    tx.status === 'approved'
      ? 'Successful'
      : tx.status === 'rejected'
      ? 'Failed'
      : 'Pending';
  return {
    id: tx.id,
    transactionId: tx.id,
    userId: tx.userId,
    userName: tx.userName || 'Player',
    userMobile: tx.userMobile || '',
    amount: round2(tx.amount),
    creditedAmount: tx.creditedAmount != null ? round2(tx.creditedAmount) : undefined,
    bonusAmount: round2(tx.bonusAmount ?? 0),
    gateway: (tx.paymentMethod as DepositPaymentMethod) || 'UPI Direct',
    paymentMethod: tx.paymentMethod || 'PhonePe',
    utrNumber: tx.utrNumber || '',
    upiId: tx.upiId || '',
    screenshotBase64: tx.screenshotBase64 || null,
    userTransactionRef: tx.utrNumber || '',
    utrSubmittedAt: tx.createdAt,
    gatewayOrderId: tx.id,
    status: mappedStatus,
    webhookVerified: tx.status === 'approved',
    adminNote: tx.adminNote,
    failureReason: tx.rejectionReason,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt || tx.createdAt,
  };
}

function mapTxToWithdrawal(tx: FirestoreTransactionDoc): WithdrawalRecord {
  let mappedStatus: WithdrawalStatus = 'Pending';
  if (
    tx.displayStatus &&
    ['Pending', 'Under Review', 'Approved', 'Processing', 'Completed', 'Rejected'].includes(
      tx.displayStatus
    )
  ) {
    mappedStatus = tx.displayStatus as WithdrawalStatus;
  } else if (tx.status === 'approved') {
    mappedStatus = 'Completed';
  } else if (tx.status === 'rejected') {
    mappedStatus = 'Rejected';
  }

  return {
    id: tx.id,
    transactionId: tx.id,
    userId: tx.userId,
    userName: tx.userName || 'Player',
    userMobile: tx.userMobile || '',
    amount: round2(tx.amount),
    methodType: tx.methodType || 'upi',
    upiId: tx.upiId || '',
    accountHolderName: tx.accountHolderName || '',
    accountNumber: tx.accountNumber || '',
    ifscCode: tx.ifscCode || '',
    status: mappedStatus,
    rejectionReason: tx.rejectionReason,
    utrNumber: tx.utrNumber,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt || tx.createdAt,
  };
}

async function safeGetConfigDoc<T>(docId: string, fallback: T): Promise<T> {
  try {
    const snap = await getDoc(doc(db, 'app_config', docId));
    if (snap.exists()) {
      return { ...fallback, ...(snap.data() as Partial<T>) };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function addAuditLog(
  actorId: string,
  actorRole: 'user' | 'admin' | 'system',
  action: string,
  details: string,
  targetId?: string
): Promise<void> {
  try {
    const id = makeId('AUD');
    await setDoc(doc(db, 'audit_logs', id), {
      id,
      actorId,
      actorRole,
      action,
      targetId: targetId || null,
      details,
      createdAt: nowIso(),
    });
  } catch {
    // Non-blocking audit log
  }
}

async function addNotification(
  userId: string,
  category: NotificationItem['category'],
  title: string,
  message: string
): Promise<void> {
  try {
    const id = makeId('NTF');
    await setDoc(doc(db, 'notifications', id), {
      id,
      userId,
      category,
      title,
      message,
      read: false,
      createdAt: nowIso(),
    });
  } catch {
    // Non-blocking notification
  }
}

async function addLedgerEntry(entry: Omit<LedgerTransaction, 'id' | 'createdAt'>): Promise<void> {
  try {
    const id = makeId('TXN');
    await setDoc(doc(db, 'ledger', id), {
      id,
      ...entry,
      createdAt: nowIso(),
    });
  } catch {
    // Non-blocking ledger entry
  }
}

async function requireAdminUser(): Promise<FirestoreUserDoc> {
  const uid = requireUid();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    throw new Error('Admin profile not found.');
  }
  const userDoc = snap.data() as FirestoreUserDoc;
  if (userDoc.role !== 'admin') {
    throw new Error('Unauthorized: Admin role required in Firestore.');
  }
  return userDoc;
}

// ============================================================================
// 1. AUTHENTICATION (Firebase Auth + Firestore users/{uid})
// ============================================================================

export async function firebaseSignUp(params: {
  name: string;
  email: string;
  mobile: string;
  password: string;
  state: string;
  referralCode?: string;
}): Promise<{ user: UserProfile; wallet: WalletSummary }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim() || 'Player';
  const cleanMobile = params.mobile.replace(/\D/g, '');
  const cleanState = params.state.trim() || 'Maharashtra';
  const cleanRefInput = (params.referralCode || '').trim().toUpperCase();

  if (PROHIBITED_STATES.includes(cleanState)) {
    throw new Error(`Real-money skill gaming is restricted in ${cleanState}.`);
  }

  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      throw new Error('This Email ID is already registered. Please log in instead.');
    }
    if (code === 'auth/weak-password') {
      throw new Error('Password is too weak. Use at least 8 characters.');
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Please enter a valid Email / Gmail address.');
    }
    throw new Error(err instanceof Error ? err.message : 'Unable to create account.');
  }

  const uid = credential.user.uid;
  try {
    await updateProfile(credential.user, { displayName: cleanName });
  } catch {
    // Non-critical displayName sync
  }

  // Generate unique 6-char referral code & verify uniqueness via non-PII referral_codes collection
  let myReferralCode = generateReferralCode();
  try {
    const existingCodeSnap = await getDoc(doc(db, 'referral_codes', myReferralCode));
    if (existingCodeSnap.exists()) {
      myReferralCode = generateReferralCode();
    }
  } catch {
    // Keep generated 6-char code
  }

  // Check if referral code matches an existing referrer via non-PII referral_codes/{code} (prevent self-referral)
  let referrerUid: string | null = null;
  let referrerName = '';
  let validatedRefCode: string | null = null;
  if (cleanRefInput && cleanRefInput !== myReferralCode) {
    try {
      const codeSnap = await getDoc(doc(db, 'referral_codes', cleanRefInput));
      if (codeSnap.exists()) {
        const refMap = codeSnap.data() as { uid?: string; name?: string };
        if (refMap.uid && refMap.uid !== uid) {
          referrerUid = refMap.uid;
          referrerName = refMap.name || 'Friend';
          validatedRefCode = cleanRefInput;
        }
      } else {
        validatedRefCode = cleanRefInput;
      }
    } catch {
      validatedRefCode = cleanRefInput;
    }
  }

  const createdAt = nowIso();
  const newUserDoc: FirestoreUserDoc = {
    uid,
    id: uid,
    name: cleanName,
    email: cleanEmail,
    mobile: cleanMobile,
    state: cleanState,
    walletBalance: 0,
    bonusBalance: 0,
    pendingWithdrawalBalance: 0,
    totalEarnings: 0,
    totalWithdrawals: 0,
    totalDeposits: 0,
    earnedToday: 0,
    earnedTodayDate: todayDateKey(),
    referralCode: myReferralCode,
    referredBy: validatedRefCode,
    referredByUid: referrerUid,
    role: 'user',
    isBanned: false,
    status: 'active',
    kycStatus: 'unverified',
    welcomeBonusClaimed: false,
    firstDepositOfferUsed: false,
    dailyStreak: 0,
    paymentMethods: [],
    individualWithdrawalSetting: null,
    createdAt,
  };

  try {
    await setDoc(doc(db, 'users', uid), newUserDoc);
    await setDoc(doc(db, 'referral_codes', myReferralCode), {
      code: myReferralCode,
      uid,
      name: cleanName,
    }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
  }

  await addNotification(
    uid,
    'bonus',
    'Welcome to GameReward!',
    'Your account is ready. Claim your Welcome Bonus and Daily Check-In rewards!'
  );

  // Process referral relationship & signup bonus if referrer found
  if (referrerUid && validatedRefCode) {
    try {
      const refSettings = await safeGetConfigDoc<ReferralSettings>(
        'referral_settings',
        DEFAULT_REFERRAL_SETTINGS
      );
      const signupBonus = refSettings.promotion_enabled ? round2(refSettings.signup_bonus) : 0;
      const refId = makeId('REF');
      const refRecord: FirestoreReferralDoc = {
        id: refId,
        referrerUserId: referrerUid,
        referrerName,
        referredUserId: uid,
        referredUserName: cleanName,
        referralCode: validatedRefCode,
        rewardType: signupBonus > 0 ? 'signup' : 'invitation',
        qualifyingTransactionId: `SIGNUP-${uid.slice(0, 8)}`,
        qualifyingAmount: 0,
        rewardPercentage: 0,
        rewardAmount: signupBonus,
        status: signupBonus > 0 ? 'Reward Credited' : 'Qualified',
        registrationDate: createdAt,
        createdAt,
      };
      await setDoc(doc(db, 'referrals', refId), refRecord);

      if (signupBonus > 0) {
        await runTransaction(db, async (tx) => {
          const refUserRef = doc(db, 'users', referrerUid!);
          const refSnap = await tx.get(refUserRef);
          if (!refSnap.exists()) return;
          const rData = refSnap.data() as FirestoreUserDoc;
          tx.update(refUserRef, {
            bonusBalance: round2((rData.bonusBalance ?? 0) + signupBonus),
            totalEarnings: round2((rData.totalEarnings ?? 0) + signupBonus),
          });
        });

        await addLedgerEntry({
          userId: referrerUid,
          type: 'referral_bonus',
          bucket: 'bonus',
          amount: signupBonus,
          status: 'Credited',
          title: `Referral Signup Bonus (${cleanName})`,
          description: `Earned ₹${signupBonus} when ${cleanName} joined with your code ${validatedRefCode}`,
          referenceId: refId,
        });

        await addNotification(
          referrerUid,
          'reward',
          'Referral Signup Reward Credited!',
          `${cleanName} joined using your referral code ${validatedRefCode}. ₹${signupBonus} credited to your Bonus Balance!`
        );
      }
    } catch {
      // Do not block signup if referral bonus transaction is restricted
    }
  }

  const withdrawalCfg = await safeGetConfigDoc<WithdrawalConfig>(
    'withdrawal_config',
    DEFAULT_WITHDRAWAL_CONFIG
  );

  return {
    user: mapUserDocToProfile(newUserDoc),
    wallet: buildWalletSummary(newUserDoc, withdrawalCfg),
  };
}

export async function firebaseLogin(params: {
  identifier: string;
  password: string;
}): Promise<{ user: UserProfile; wallet: WalletSummary }> {
  const rawIdentifier = params.identifier.trim();
  let emailToUse = rawIdentifier.toLowerCase();

  if (!emailToUse.includes('@')) {
    // Allow looking up email by 10-digit mobile if rules permit
    const digits = rawIdentifier.replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('mobile', '==', digits), limit(1))
        );
        if (!snap.empty) {
          const found = snap.docs[0].data() as FirestoreUserDoc;
          if (found.email) {
            emailToUse = found.email.toLowerCase();
          }
        }
      } catch {
        throw new Error('Please log in with your registered Email / Gmail ID.');
      }
    }
    if (!emailToUse.includes('@')) {
      throw new Error('Please enter your registered Email / Gmail ID to log in.');
    }
  }

  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, emailToUse, params.password);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      throw new Error('Invalid Email ID or Password. Please try again.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please wait a minute and try again.');
    }
    throw new Error(err instanceof Error ? err.message : 'Unable to sign in.');
  }

  const uid = credential.user.uid;
  const userRef = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  let userDoc: FirestoreUserDoc;
  if (!snap.exists()) {
    // Auto-bootstrap profile if account existed in Firebase Auth before Firestore doc
    userDoc = {
      uid,
      id: uid,
      name: credential.user.displayName || emailToUse.split('@')[0] || 'Player',
      email: credential.user.email || emailToUse,
      mobile: '',
      state: 'Maharashtra',
      walletBalance: 0,
      bonusBalance: 0,
      pendingWithdrawalBalance: 0,
      totalEarnings: 0,
      totalWithdrawals: 0,
      totalDeposits: 0,
      earnedToday: 0,
      earnedTodayDate: todayDateKey(),
      referralCode: generateReferralCode(),
      referredBy: null,
      referredByUid: null,
      role: 'user',
      isBanned: false,
      status: 'active',
      kycStatus: 'unverified',
      welcomeBonusClaimed: false,
      firstDepositOfferUsed: false,
      dailyStreak: 0,
      paymentMethods: [],
      individualWithdrawalSetting: null,
      createdAt: nowIso(),
    };
    try {
      await setDoc(userRef, userDoc);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }
  } else {
    userDoc = snap.data() as FirestoreUserDoc;
  }

  if (userDoc.isBanned || userDoc.status === 'suspended') {
    await signOut(auth);
    throw new Error('Your account has been suspended by Admin.');
  }

  const withdrawalCfg = await safeGetConfigDoc<WithdrawalConfig>(
    'withdrawal_config',
    DEFAULT_WITHDRAWAL_CONFIG
  );

  return {
    user: mapUserDocToProfile(userDoc),
    wallet: buildWalletSummary(userDoc, withdrawalCfg),
  };
}

export async function firebaseForgotPassword(email: string): Promise<{ message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter your registered Email / Gmail ID.');
  }
  await sendPasswordResetEmail(auth, cleanEmail);
  return {
    message: `Password reset link sent to ${cleanEmail}. Check your inbox or spam folder.`,
  };
}

export async function firebaseLogout(): Promise<void> {
  await signOut(auth);
}

// ============================================================================
// 2. REAL-TIME SUBSCRIPTIONS & INITIAL USER DATA LOADERS
// ============================================================================

export function subscribeUserProfile(
  uid: string,
  onUpdate: (data: {
    user: UserProfile;
    wallet: WalletSummary;
    rawDoc: FirestoreUserDoc;
  }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let cachedWithdrawalConfig = DEFAULT_WITHDRAWAL_CONFIG;
  safeGetConfigDoc<WithdrawalConfig>('withdrawal_config', DEFAULT_WITHDRAWAL_CONFIG).then((cfg) => {
    cachedWithdrawalConfig = cfg;
  });

  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return;
      const raw = snap.data() as FirestoreUserDoc;
      onUpdate({
        user: mapUserDocToProfile(raw),
        wallet: buildWalletSummary(raw, cachedWithdrawalConfig),
        rawDoc: raw,
      });
    },
    (error) => {
      console.error('User profile snapshot error:', error);
      onError?.(error);
    }
  );
}

export function subscribeUserTransactions(
  uid: string,
  onUpdate: (data: { deposits: DepositRecord[]; withdrawals: WithdrawalRecord[] }) => void
): Unsubscribe {
  const q = query(collection(db, 'transactions'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs
        .map((d) => ({ ...(d.data() as FirestoreTransactionDoc), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const deposits = all.filter((t) => t.type === 'deposit').map(mapTxToDeposit);
      const withdrawals = all.filter((t) => t.type === 'withdraw').map(mapTxToWithdrawal);
      onUpdate({ deposits, withdrawals });
    },
    (error) => {
      console.error('Transactions snapshot error:', error);
    }
  );
}

export function subscribeUserNotifications(
  uid: string,
  onUpdate: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ ...(d.data() as NotificationItem), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 40);
      onUpdate(items);
    },
    (error) => {
      console.error('Notifications snapshot error:', error);
    }
  );
}

export function subscribeAppAnnouncement(
  onUpdate: (announcement: AppAnnouncementConfig) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'app_config', 'announcements'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_ANNOUNCEMENT);
        return;
      }
      const data = snap.data() as { announcement?: AppAnnouncementConfig };
      onUpdate(data.announcement ? { ...DEFAULT_ANNOUNCEMENT, ...data.announcement } : DEFAULT_ANNOUNCEMENT);
    },
    () => {
      onUpdate(DEFAULT_ANNOUNCEMENT);
    }
  );
}

export async function getUserFullStateFirestore(uid: string): Promise<{
  user: UserProfile;
  wallet: WalletSummary;
  welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
  prohibitedStates: string[];
  games: GameItem[];
  history: GameSessionRecord[];
  leaderboards: Record<string, LeaderboardEntry[]>;
  transactions: LedgerTransaction[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  campaigns: BonusCampaign[];
  canCheckInToday: boolean;
  dailyBonusLadder: number[];
  nextDayNumber: number;
  nextRewardAmount: number;
  depositBonusOffers: DepositBonusOfferMeta;
  notifications: NotificationItem[];
  reviews: ReviewItem[];
  announcement: AppAnnouncementConfig;
}> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  let userDoc: FirestoreUserDoc;
  if (userSnap.exists()) {
    userDoc = userSnap.data() as FirestoreUserDoc;
  } else {
    const curr = auth.currentUser;
    userDoc = {
      uid,
      id: uid,
      name: curr?.displayName || curr?.email?.split('@')[0] || 'Player',
      email: curr?.email || '',
      mobile: '',
      state: 'Maharashtra',
      walletBalance: 0,
      bonusBalance: 0,
      pendingWithdrawalBalance: 0,
      totalEarnings: 0,
      totalWithdrawals: 0,
      totalDeposits: 0,
      earnedToday: 0,
      earnedTodayDate: todayDateKey(),
      referralCode: generateReferralCode(),
      referredBy: null,
      referredByUid: null,
      role: 'user',
      isBanned: false,
      status: 'active',
      kycStatus: 'unverified',
      welcomeBonusClaimed: false,
      firstDepositOfferUsed: false,
      dailyStreak: 0,
      paymentMethods: [],
      individualWithdrawalSetting: null,
      createdAt: nowIso(),
    };
    await setDoc(doc(db, 'users', uid), userDoc);
  }

  const [
    withdrawalCfg,
    gamesCfg,
    bonusesCfg,
    announcementCfg,
    txSnap,
    historySnap,
    ledgerSnap,
    notifSnap,
    reviewsSnap,
  ] = await Promise.all([
    safeGetConfigDoc<WithdrawalConfig>('withdrawal_config', DEFAULT_WITHDRAWAL_CONFIG),
    safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES }),
    safeGetConfigDoc<{
      welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
      bonusCampaigns: BonusCampaign[];
    }>('bonuses', {
      welcomeBonusConfig: DEFAULT_WELCOME_CONFIG,
      bonusCampaigns: DEFAULT_BONUS_CAMPAIGNS,
    }),
    safeGetConfigDoc<{ announcement: AppAnnouncementConfig }>('announcements', {
      announcement: DEFAULT_ANNOUNCEMENT,
    }),
    getDocs(query(collection(db, 'transactions'), where('userId', '==', uid))).catch(() => null),
    getDocs(query(collection(db, 'game_history'), where('userId', '==', uid))).catch(() => null),
    getDocs(query(collection(db, 'ledger'), where('userId', '==', uid))).catch(() => null),
    getDocs(query(collection(db, 'notifications'), where('userId', '==', uid))).catch(() => null),
    getDocs(collection(db, 'reviews')).catch(() => null),
  ]);

  const games =
    Array.isArray(gamesCfg.games) && gamesCfg.games.length > 0 ? gamesCfg.games : DEFAULT_GAMES;

  const allTx = txSnap
    ? txSnap.docs
        .map((d) => ({ ...(d.data() as FirestoreTransactionDoc), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const deposits = allTx.filter((t) => t.type === 'deposit').map(mapTxToDeposit);
  const withdrawals = allTx.filter((t) => t.type === 'withdraw').map(mapTxToWithdrawal);

  const history: GameSessionRecord[] = historySnap
    ? historySnap.docs
        .map((d) => d.data() as GameSessionRecord)
        .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
        .slice(0, 50)
    : [];

  const transactions: LedgerTransaction[] = ledgerSnap
    ? ledgerSnap.docs
        .map((d) => ({ ...(d.data() as LedgerTransaction), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 250)
    : [];

  const notifications: NotificationItem[] = notifSnap
    ? notifSnap.docs
        .map((d) => ({ ...(d.data() as NotificationItem), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 40)
    : [];

  const dbReviews: ReviewItem[] = reviewsSnap
    ? reviewsSnap.docs.map((d) => ({ ...(d.data() as ReviewItem), id: d.id }))
    : [];
  const reviews = [...dbReviews, ...DEFAULT_HINGLISH_REVIEWS]
    .filter((rev, idx, arr) => arr.findIndex((x) => x.id === rev.id) === idx)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const today = todayDateKey();
  const canCheckInToday = userDoc.lastCheckInDate !== today;
  const streak = Number(userDoc.dailyStreak || 0);
  const nextDayIdx = streak % 30;
  const nextDayNumber = nextDayIdx + 1;
  const nextRewardAmount = DAILY_BONUS_LADDER[nextDayIdx] ?? 2;

  const isFirstOfferAvailable = !userDoc.firstDepositOfferUsed;

  // Build simple leaderboard per game from user history
  const leaderboards: Record<string, LeaderboardEntry[]> = {};
  for (const g of games) {
    const sessions = history.filter((h) => h.gameId === g.id);
    if (sessions.length > 0) {
      const totalReward = round2(sessions.reduce((s, r) => s + (r.rewardEarned || 0), 0));
      const bestScore = Math.max(...sessions.map((s) => s.score || 0));
      leaderboards[g.id] = [
        {
          rank: 1,
          userId: uid,
          userName: userDoc.name || 'Player',
          bestScore,
          gamesPlayed: sessions.length,
          totalReward,
        },
      ];
    } else {
      leaderboards[g.id] = [];
    }
  }

  return {
    user: mapUserDocToProfile(userDoc),
    wallet: buildWalletSummary(userDoc, withdrawalCfg),
    welcomeBonusConfig: bonusesCfg.welcomeBonusConfig || DEFAULT_WELCOME_CONFIG,
    prohibitedStates: PROHIBITED_STATES,
    games,
    history,
    leaderboards,
    transactions,
    deposits,
    withdrawals,
    campaigns: bonusesCfg.bonusCampaigns || DEFAULT_BONUS_CAMPAIGNS,
    canCheckInToday,
    dailyBonusLadder: DAILY_BONUS_LADDER,
    nextDayNumber,
    nextRewardAmount,
    depositBonusOffers: {
      isFirstOfferAvailable,
      firstDepositTiers: FIRST_DEPOSIT_TIERS,
      reloadTiers: RELOAD_DEPOSIT_TIERS,
    },
    notifications,
    reviews,
    announcement: announcementCfg.announcement || DEFAULT_ANNOUNCEMENT,
  };
}

// ============================================================================
// 3. GAMES & WALLET TRANSACTIONS (Firestore runTransaction + game_history)
// ============================================================================

export async function arcadeWagerFirestore(
  gameId: string,
  gameName: string,
  amount: number
): Promise<WalletSummary> {
  const uid = requireUid();
  const stake = round2(amount);
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error('Invalid bet amount.');
  }

  const withdrawalCfg = await safeGetConfigDoc<WithdrawalConfig>(
    'withdrawal_config',
    DEFAULT_WITHDRAWAL_CONFIG
  );

  let updatedUserDoc!: FirestoreUserDoc;
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User account not found.');
      const u = snap.data() as FirestoreUserDoc;
      if (u.isBanned || u.status === 'suspended') {
        throw new Error('Your account is suspended.');
      }

      const avail = round2(u.walletBalance ?? 0);
      const bonus = round2(u.bonusBalance ?? 0);
      if (round2(avail + bonus) < stake) {
        throw new Error('Insufficient balance. Please add money to continue.');
      }

      let nextAvail = avail;
      let nextBonus = bonus;
      if (avail >= stake) {
        nextAvail = round2(avail - stake);
      } else {
        const remainder = round2(stake - avail);
        nextAvail = 0;
        nextBonus = round2(Math.max(0, bonus - remainder));
      }

      tx.update(userRef, {
        walletBalance: nextAvail,
        bonusBalance: nextBonus,
      });

      updatedUserDoc = {
        ...u,
        walletBalance: nextAvail,
        bonusBalance: nextBonus,
      };
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Insufficient') || err.message.includes('suspended'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  await addLedgerEntry({
    userId: uid,
    type: 'game_entry',
    bucket: 'available',
    amount: -stake,
    status: 'Completed',
    title: `${gameName} Bet`,
    description: `Placed stake of ₹${stake} in ${gameName}`,
    referenceId: gameId,
  });

  return buildWalletSummary(updatedUserDoc, withdrawalCfg);
}

export async function arcadePayoutFirestore(
  gameId: string,
  gameName: string,
  betAmount: number,
  winAmount: number,
  detail: string
): Promise<WalletSummary> {
  const uid = requireUid();
  const stake = round2(betAmount);
  const payout = round2(Math.max(0, winAmount));
  const today = todayDateKey();

  const withdrawalCfg = await safeGetConfigDoc<WithdrawalConfig>(
    'withdrawal_config',
    DEFAULT_WITHDRAWAL_CONFIG
  );

  let updatedUserDoc!: FirestoreUserDoc;
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User account not found.');
      const u = snap.data() as FirestoreUserDoc;

      const nextAvail = round2((u.walletBalance ?? 0) + payout);
      const nextTotalEarnings = round2((u.totalEarnings ?? 0) + payout);
      const prevToday = u.earnedTodayDate === today ? round2(u.earnedToday ?? 0) : 0;
      const nextEarnedToday = round2(prevToday + payout);

      if (payout > 0) {
        tx.update(userRef, {
          walletBalance: nextAvail,
          totalEarnings: nextTotalEarnings,
          earnedToday: nextEarnedToday,
          earnedTodayDate: today,
        });
      }

      updatedUserDoc = {
        ...u,
        walletBalance: nextAvail,
        totalEarnings: nextTotalEarnings,
        earnedToday: nextEarnedToday,
        earnedTodayDate: today,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  const roundId = makeId('RND');
  const playedAt = nowIso();
  const sessionRecord: GameSessionRecord = {
    id: roundId,
    gameId,
    gameName,
    userId: uid,
    userName: updatedUserDoc.name || 'Player',
    entryFee: stake,
    winRatioUsed: 55,
    outcome: payout > 0 ? 'win' : 'loss',
    score: Math.round(payout * 10),
    durationSec: 6,
    rewardEarned: payout,
    status: 'completed',
    playedAt,
  };

  try {
    await setDoc(doc(db, 'game_history', roundId), {
      ...sessionRecord,
      betAmount: stake,
      payout,
      detail,
      createdAt: playedAt,
    });
  } catch {
    // Non-blocking history write
  }

  if (payout > 0) {
    await addLedgerEntry({
      userId: uid,
      type: 'game_reward',
      bucket: 'available',
      amount: payout,
      status: 'Credited',
      title: `${gameName} Win`,
      description: detail || `Won ₹${payout} in ${gameName}`,
      referenceId: roundId,
    });
  }

  return buildWalletSummary(updatedUserDoc, withdrawalCfg);
}

export async function playCasinoGameFirestore(
  gameId: string,
  entryFee: number,
  choice: string
): Promise<{ session: GameSessionRecord; wallet: WalletSummary }> {
  const uid = requireUid();
  const stake = round2(entryFee);
  if (!Number.isFinite(stake) || stake < 10) {
    throw new Error('Minimum stake is ₹10.');
  }

  const [gamesCfg, withdrawalCfg] = await Promise.all([
    safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES }),
    safeGetConfigDoc<WithdrawalConfig>('withdrawal_config', DEFAULT_WITHDRAWAL_CONFIG),
  ]);
  const games = gamesCfg.games?.length ? gamesCfg.games : DEFAULT_GAMES;
  const game = games.find((g) => g.id === gameId) || DEFAULT_GAMES.find((g) => g.id === gameId);
  if (!game) {
    throw new Error('Selected game not found.');
  }

  const minR = Math.max(5, Math.min(95, game.minWinRatio ?? 50));
  const maxR = Math.max(minR, Math.min(95, game.maxWinRatio ?? 60));
  const defaultGameRatio = Math.round(minR + Math.random() * (maxR - minR));
  const mult = game.engine === 'slots' ? 2.5 : game.engine === 'mines' ? 2.2 : 1.95;
  const today = todayDateKey();

  let updatedUserDoc!: FirestoreUserDoc;
  let winRatioUsed = defaultGameRatio;
  let isWin = false;
  let rewardEarned = 0;

  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User account not found.');
      const u = snap.data() as FirestoreUserDoc;
      if (u.isBanned || u.status === 'suspended') {
        throw new Error('Your account is suspended.');
      }

      const avail = round2(u.walletBalance ?? 0);
      const bonus = round2(u.bonusBalance ?? 0);
      if (round2(avail + bonus) < stake) {
        throw new Error('Insufficient balance. Please deposit funds to continue.');
      }

      // Respect Admin per-user customWinRatio override if configured
      winRatioUsed =
        typeof u.customWinRatio === 'number' && Number.isFinite(u.customWinRatio)
          ? Math.max(0, Math.min(100, Math.round(u.customWinRatio)))
          : defaultGameRatio;
      isWin = Math.random() * 100 < winRatioUsed;
      rewardEarned = isWin ? round2(stake * mult) : 0;

      let nextAvail = avail;
      let nextBonus = bonus;
      if (avail >= stake) {
        nextAvail = round2(avail - stake);
      } else {
        const remainder = round2(stake - avail);
        nextAvail = 0;
        nextBonus = round2(Math.max(0, bonus - remainder));
      }

      nextAvail = round2(nextAvail + rewardEarned);
      const nextTotalEarnings = round2((u.totalEarnings ?? 0) + rewardEarned);
      const prevToday = u.earnedTodayDate === today ? round2(u.earnedToday ?? 0) : 0;
      const nextEarnedToday = round2(prevToday + rewardEarned);

      tx.update(userRef, {
        walletBalance: nextAvail,
        bonusBalance: nextBonus,
        totalEarnings: nextTotalEarnings,
        earnedToday: nextEarnedToday,
        earnedTodayDate: today,
      });

      updatedUserDoc = {
        ...u,
        walletBalance: nextAvail,
        bonusBalance: nextBonus,
        totalEarnings: nextTotalEarnings,
        earnedToday: nextEarnedToday,
        earnedTodayDate: today,
      };
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Insufficient') || err.message.includes('suspended'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  const roundId = makeId('RND');
  const playedAt = nowIso();
  const session: GameSessionRecord = {
    id: roundId,
    gameId: game.id,
    gameName: game.name,
    userId: uid,
    userName: updatedUserDoc.name || 'Player',
    entryFee: stake,
    winRatioUsed,
    outcome: isWin ? 'win' : 'loss',
    score: isWin ? Math.round(rewardEarned * 10) : Math.round(stake * 2),
    durationSec: 4,
    rewardEarned,
    status: 'completed',
    playedAt,
  };

  try {
    await setDoc(doc(db, 'game_history', roundId), {
      ...session,
      betAmount: stake,
      payout: rewardEarned,
      choice,
      createdAt: playedAt,
    });
  } catch {
    // Non-blocking history write
  }

  await addLedgerEntry({
    userId: uid,
    type: isWin ? 'game_reward' : 'game_entry',
    bucket: 'available',
    amount: isWin ? round2(rewardEarned - stake) : -stake,
    status: 'Completed',
    title: isWin ? `${game.name} Win` : `${game.name} Play`,
    description: isWin
      ? `Won ₹${rewardEarned} (Entry ₹${stake} · Choice: ${choice})`
      : `Entry ₹${stake} · Choice: ${choice}`,
    referenceId: roundId,
  });

  return {
    session,
    wallet: buildWalletSummary(updatedUserDoc, withdrawalCfg),
  };
}

// ============================================================================
// 4. DEPOSITS, WITHDRAWALS & PAYMENT OFFERS (Firestore `transactions`)
// ============================================================================

export async function getDepositOffersFirestore(): Promise<{
  isFirstDepositOffer: boolean;
  tiers: typeof FIRST_DEPOSIT_TIERS;
  merchantPaymentConfig: MerchantPaymentConfig;
  depositPaymentMethods: AdminDepositPaymentMethod[];
}> {
  const uid = auth.currentUser?.uid;
  let isFirstDepositOffer = true;
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        isFirstDepositOffer = !(snap.data() as FirestoreUserDoc).firstDepositOfferUsed;
      }
    } catch {
      // default true
    }
  }

  const pmCfg = await safeGetConfigDoc<{
    methods: AdminDepositPaymentMethod[];
    merchantPaymentConfig: MerchantPaymentConfig;
  }>('payment_methods', {
    methods: DEFAULT_PAYMENT_METHODS,
    merchantPaymentConfig: DEFAULT_MERCHANT_CONFIG,
  });

  const activeMethods = (pmCfg.methods || DEFAULT_PAYMENT_METHODS).filter((m) => m.isActive);
  return {
    isFirstDepositOffer,
    tiers: isFirstDepositOffer ? FIRST_DEPOSIT_TIERS : RELOAD_DEPOSIT_TIERS,
    merchantPaymentConfig: pmCfg.merchantPaymentConfig || DEFAULT_MERCHANT_CONFIG,
    depositPaymentMethods: activeMethods.length > 0 ? activeMethods : DEFAULT_PAYMENT_METHODS,
  };
}

export async function submitDepositRequestFirestore(params: {
  amount: number;
  paymentMethod: DepositPaymentMethod;
  utrNumber: string;
  upiId?: string;
  screenshotBase64?: string | null;
}): Promise<{ deposit: DepositRecord }> {
  const uid = requireUid();
  const amount = Math.round(Number(params.amount));
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) {
    throw new Error('Deposit amount must be between ₹100 and ₹50,000.');
  }
  const cleanUtr = params.utrNumber.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{8,28}$/.test(cleanUtr)) {
    throw new Error('Enter a valid 8–28 character UTR / Transaction ID.');
  }

  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) throw new Error('User account not found.');
  const u = userSnap.data() as FirestoreUserDoc;
  if (u.isBanned || u.status === 'suspended') {
    throw new Error('Your account is suspended.');
  }

  // Prevent duplicate UTR submissions by the same user
  try {
    const dupSnap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('userId', '==', uid),
        where('utrNumber', '==', cleanUtr),
        limit(1)
      )
    );
    if (!dupSnap.empty) {
      throw new Error('This UTR / Transaction ID has already been submitted.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already been submitted')) {
      throw err;
    }
  }

  const bonusCalc = computeDepositBonusForAmount(amount, !u.firstDepositOfferUsed);
  const id = makeId('DEP');
  const createdAt = nowIso();

  const txDoc: FirestoreTransactionDoc = {
    id,
    userId: uid,
    userName: u.name || 'Player',
    userMobile: u.mobile || '',
    type: 'deposit',
    amount,
    bonusAmount: bonusCalc.bonusAmount,
    status: 'pending',
    utrNumber: cleanUtr,
    upiId: params.upiId || '',
    paymentMethod: params.paymentMethod || 'PhonePe',
    screenshotBase64: params.screenshotBase64 || null,
    createdAt,
    updatedAt: createdAt,
  };

  try {
    await setDoc(doc(db, 'transactions', id), txDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `transactions/${id}`);
  }

  await addNotification(
    uid,
    'deposit',
    'Deposit Request Submitted',
    `Your deposit of ₹${amount} (UTR: ${cleanUtr}) is pending admin verification.`
  );

  return { deposit: mapTxToDeposit(txDoc) };
}

export async function getUserWithdrawalSettingsFirestore(): Promise<{
  minWithdrawalLimit: number;
  withdrawalNoticeBanner: {
    enabled: boolean;
    title: string;
    message: string;
    isCustom?: boolean;
  };
  hasCustomSettings: boolean;
}> {
  const uid = requireUid();
  const [userSnap, cfg] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    safeGetConfigDoc<WithdrawalConfig>('withdrawal_config', DEFAULT_WITHDRAWAL_CONFIG),
  ]);
  const userDoc = (userSnap.exists() ? userSnap.data() : {}) as FirestoreUserDoc;
  const wallet = buildWalletSummary(userDoc, cfg);
  return {
    minWithdrawalLimit: wallet.minWithdrawalLimit,
    withdrawalNoticeBanner: wallet.withdrawalNoticeBanner || {
      enabled: false,
      title: 'Withdrawal Notice',
      message: '',
    },
    hasCustomSettings: Boolean(userDoc.individualWithdrawalSetting),
  };
}

export async function submitWithdrawalRequestFirestore(params: {
  amount: number;
  methodType: 'upi' | 'bank';
  upiId?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
}): Promise<{ withdrawal: WithdrawalRecord }> {
  const uid = requireUid();
  const amount = round2(params.amount);
  const cfg = await safeGetConfigDoc<WithdrawalConfig>(
    'withdrawal_config',
    DEFAULT_WITHDRAWAL_CONFIG
  );

  if (params.methodType === 'upi') {
    const cleanUpi = (params.upiId || '').trim();
    if (!/^[\w.-]+@[\w.-]+$/.test(cleanUpi)) {
      throw new Error('Enter a valid UPI ID (e.g., yourname@okaxis).');
    }
  } else {
    if (
      !(params.accountHolderName || '').trim() ||
      !(params.accountNumber || '').trim() ||
      !(params.ifscCode || '').trim()
    ) {
      throw new Error('Enter complete bank account holder name, account number, and IFSC code.');
    }
  }

  const id = makeId('WDR');
  const createdAt = nowIso();
  let createdTx!: FirestoreTransactionDoc;

  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('User account not found.');
      const u = snap.data() as FirestoreUserDoc;
      if (u.isBanned || u.status === 'suspended') {
        throw new Error('Your account is suspended.');
      }

      const wallet = buildWalletSummary(u, cfg);
      if (amount < wallet.minWithdrawalLimit) {
        throw new Error(`Minimum withdrawal limit is ₹${wallet.minWithdrawalLimit}.`);
      }
      if (wallet.availableBalance < amount) {
        throw new Error(
          `Insufficient withdrawable balance (₹${wallet.availableBalance}). Bonus credits cannot be withdrawn directly.`
        );
      }

      tx.update(userRef, {
        walletBalance: round2(wallet.availableBalance - amount),
        pendingWithdrawalBalance: round2((u.pendingWithdrawalBalance ?? 0) + amount),
      });

      createdTx = {
        id,
        userId: uid,
        userName: u.name || 'Player',
        userMobile: u.mobile || '',
        type: 'withdraw',
        amount,
        status: 'pending',
        displayStatus: 'Pending',
        methodType: params.methodType,
        upiId: params.methodType === 'upi' ? (params.upiId || '').trim() : '',
        accountHolderName:
          params.methodType === 'bank' ? (params.accountHolderName || '').trim() : '',
        accountNumber: params.methodType === 'bank' ? (params.accountNumber || '').trim() : '',
        ifscCode: params.methodType === 'bank' ? (params.ifscCode || '').trim().toUpperCase() : '',
        utrNumber: '',
        screenshotBase64: null,
        createdAt,
        updatedAt: createdAt,
      };

      tx.set(doc(db, 'transactions', id), createdTx);
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('Minimum') ||
        err.message.includes('Insufficient') ||
        err.message.includes('suspended'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `transactions/${id}`);
  }

  await addLedgerEntry({
    userId: uid,
    type: 'withdrawal',
    bucket: 'available',
    amount: -amount,
    status: 'Pending',
    title: 'Withdrawal Request Submitted',
    description:
      params.methodType === 'upi'
        ? `UPI Payout to ${params.upiId}`
        : `Bank Payout to A/C ****${(params.accountNumber || '').slice(-4)}`,
    referenceId: id,
  });

  await addNotification(
    uid,
    'withdrawal',
    'Withdrawal Request Placed',
    `Your withdrawal request of ₹${amount} has been submitted for processing.`
  );

  return { withdrawal: mapTxToWithdrawal(createdTx) };
}

// ============================================================================
// 5. REWARDS, PROFILE, KYC, PAYMENT METHODS, REVIEWS
// ============================================================================

export async function claimDailyCheckInFirestore(): Promise<{
  rewardAmount: number;
  dailyStreak: number;
}> {
  const uid = requireUid();
  const today = todayDateKey();
  let rewardAmount = 2;
  let nextStreak = 1;

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('User not found.');
    const u = snap.data() as FirestoreUserDoc;
    if (u.lastCheckInDate === today) {
      throw new Error('Daily check-in bonus already claimed today.');
    }
    const prevStreak = Number(u.dailyStreak || 0);
    const idx = prevStreak % 30;
    rewardAmount = DAILY_BONUS_LADDER[idx] ?? 2;
    nextStreak = prevStreak + 1;

    tx.update(userRef, {
      bonusBalance: round2((u.bonusBalance ?? 0) + rewardAmount),
      totalEarnings: round2((u.totalEarnings ?? 0) + rewardAmount),
      dailyStreak: nextStreak,
      lastCheckInDate: today,
    });
  });

  await addLedgerEntry({
    userId: uid,
    type: 'daily_bonus',
    bucket: 'bonus',
    amount: rewardAmount,
    status: 'Credited',
    title: `Day ${nextStreak} Daily Check-In Bonus`,
    description: `Claimed ₹${rewardAmount} daily streak reward`,
  });

  return { rewardAmount, dailyStreak: nextStreak };
}

export async function claimWelcomeBonusFirestore(): Promise<{ amount: number }> {
  const uid = requireUid();
  const bonusesCfg = await safeGetConfigDoc<{
    welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
  }>('bonuses', { welcomeBonusConfig: DEFAULT_WELCOME_CONFIG });
  const wbCfg = bonusesCfg.welcomeBonusConfig || DEFAULT_WELCOME_CONFIG;
  if (!wbCfg.enabled) {
    throw new Error('Welcome bonus is currently paused.');
  }

  const amount = round2(wbCfg.amount || 100);
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('User not found.');
    const u = snap.data() as FirestoreUserDoc;
    if (u.welcomeBonusClaimed) {
      throw new Error('Welcome bonus has already been claimed.');
    }
    const expiresAt = new Date(Date.now() + (wbCfg.expiryDays || 30) * 86400_000).toISOString();
    tx.update(userRef, {
      bonusBalance: round2((u.bonusBalance ?? 0) + amount),
      welcomeBonusClaimed: true,
      welcomeBonusExpiresAt: expiresAt,
    });
  });

  await addLedgerEntry({
    userId: uid,
    type: 'welcome_bonus',
    bucket: 'bonus',
    amount,
    status: 'Credited',
    title: 'Welcome Bonus Claimed',
    description: `Credited ₹${amount} Welcome Bonus to Bonus Balance`,
  });

  return { amount };
}

export async function updateUserProfileFirestore(params: {
  name?: string;
  email?: string;
}): Promise<void> {
  const uid = requireUid();
  const updates: Record<string, unknown> = {};
  if (params.name?.trim()) updates.name = params.name.trim();
  if (params.email?.trim()) updates.email = params.email.trim().toLowerCase();
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, 'users', uid), updates);
  }
}

export async function markAllNotificationsReadFirestore(): Promise<void> {
  const uid = requireUid();
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', uid), where('read', '==', false))
  );
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
}

export async function submitKycFirestore(params: {
  documentType: string;
  documentNumber: string;
  fullName: string;
}): Promise<void> {
  const uid = requireUid();
  const last4 = params.documentNumber.replace(/\s+/g, '').slice(-4);
  await updateDoc(doc(db, 'users', uid), {
    kycStatus: 'pending',
    kycSubmittedAt: nowIso(),
    kycDocumentType: params.documentType,
    kycDocumentLast4: last4,
    name: params.fullName.trim() || undefined,
  });
  await addNotification(
    uid,
    'security',
    'KYC Submitted for Review',
    `Your ${params.documentType} (ending ${last4}) is under verification.`
  );
}

export async function addUserPaymentMethodFirestore(
  method: Omit<PaymentMethod, 'id' | 'createdAt'>
): Promise<void> {
  const uid = requireUid();
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('User not found.');
    const u = snap.data() as FirestoreUserDoc;
    const existing = Array.isArray(u.paymentMethods) ? u.paymentMethods : [];
    const nextItem: PaymentMethod = {
      ...method,
      id: makeId('PM'),
      accountNumberMasked: method.accountNumber
        ? `****${method.accountNumber.slice(-4)}`
        : undefined,
      createdAt: nowIso(),
    };
    tx.update(userRef, { paymentMethods: [...existing, nextItem] });
  });
}

export async function deleteUserPaymentMethodFirestore(methodId: string): Promise<void> {
  const uid = requireUid();
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', uid);
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('User not found.');
    const u = snap.data() as FirestoreUserDoc;
    const existing = Array.isArray(u.paymentMethods) ? u.paymentMethods : [];
    tx.update(userRef, { paymentMethods: existing.filter((m) => m.id !== methodId) });
  });
}

export async function submitOrUpdateReviewFirestore(params: {
  id?: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const uid = requireUid();
  const userSnap = await getDoc(doc(db, 'users', uid));
  const u = (userSnap.exists() ? userSnap.data() : {}) as FirestoreUserDoc;
  const now = nowIso();
  const id = params.id || makeId('REV');
  await setDoc(
    doc(db, 'reviews', id),
    {
      id,
      userId: uid,
      userName: u.name || 'Player',
      city: u.state || 'India',
      badge: 'Verified Player',
      rating: Math.max(1, Math.min(5, Math.round(params.rating))),
      comment: params.comment.trim().slice(0, 400),
      isPromotional: false,
      reportedBy: [],
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function reportReviewFirestore(reviewId: string): Promise<void> {
  const uid = requireUid();
  const ref = doc(db, 'reviews', reviewId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const existing = (snap.data() as ReviewItem).reportedBy || [];
  if (!existing.includes(uid)) {
    await updateDoc(ref, { reportedBy: [...existing, uid] });
  }
}

// ============================================================================
// 6. REFERRAL SYSTEM & APP RELEASE (Users + Admin)
// ============================================================================

export async function getUserReferralDashboardFirestore(): Promise<UserReferralDashboardData> {
  const uid = requireUid();
  const [userSnap, refSettings, refSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    safeGetConfigDoc<ReferralSettings>('referral_settings', DEFAULT_REFERRAL_SETTINGS),
    getDocs(query(collection(db, 'referrals'), where('referrerUserId', '==', uid))).catch(
      () => null
    ),
  ]);

  const userDoc = (userSnap.exists() ? userSnap.data() : {}) as FirestoreUserDoc;
  const rows: FirestoreReferralDoc[] = refSnap
    ? refSnap.docs
        .map((d) => ({ ...(d.data() as FirestoreReferralDoc), id: d.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const uniqueReferredIds = new Set(rows.map((r) => r.referredUserId));
  const creditedRows = rows.filter((r) => r.status === 'Reward Credited');
  const pendingRows = rows.filter((r) => r.status === 'Pending');
  const successfulReferredIds = new Set(
    rows
      .filter((r) => r.status === 'Reward Credited' || r.status === 'Qualified')
      .map((r) => r.referredUserId)
  );

  const signupRewardsTotal = round2(
    creditedRows
      .filter((r) => r.rewardType === 'signup')
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0)
  );
  const depositRewardsTotal = round2(
    creditedRows
      .filter((r) => r.rewardType === 'deposit')
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0)
  );

  const history: UserReferralHistoryItem[] = rows.map((r) => ({
    id: r.id,
    referredUserId: r.referredUserId.slice(0, 10).toUpperCase(),
    referredUserName: r.referredUserName || 'Friend',
    registrationDate: r.registrationDate || r.createdAt,
    depositAmount: round2(r.qualifyingAmount || 0),
    referralRewardAmount: round2(r.rewardAmount || 0),
    rewardType: r.rewardType,
    rewardPercentage: r.rewardPercentage || 0,
    rewardStatus: r.status,
    transactionReferenceId: r.qualifyingTransactionId || r.id,
    createdAt: r.createdAt,
  }));

  return {
    referralCode: userDoc.referralCode || 'GRUSER',
    settings: refSettings,
    stats: {
      totalInvitedFriends: uniqueReferredIds.size,
      successfulReferrals: successfulReferredIds.size,
      pendingReferrals: pendingRows.length,
      totalReferralRewards: round2(signupRewardsTotal + depositRewardsTotal),
      signupRewardsTotal,
      depositRewardsTotal,
    },
    history,
  };
}

export async function getPublicAppReleaseFirestore(): Promise<AppReleaseConfig> {
  return safeGetConfigDoc<AppReleaseConfig>('app_release', DEFAULT_APP_RELEASE);
}

export async function getPublicAppAnnouncementFirestore(): Promise<AppAnnouncementConfig> {
  const docData = await safeGetConfigDoc<{ announcement: AppAnnouncementConfig }>('announcements', {
    announcement: DEFAULT_ANNOUNCEMENT,
  });
  return docData.announcement || DEFAULT_ANNOUNCEMENT;
}

// ============================================================================
// 7. ADMIN DASHBOARD OPERATIONS (100% Firestore — requires role === 'admin')
// ============================================================================

export async function getAdminOverviewFirestore(): Promise<{
  analytics: AdminAnalytics;
  users: (UserProfile & {
    wallet: WalletSummary;
    gamesPlayed: number;
    gamesWon: number;
    totalGameWinnings: number;
    totalGameStaked: number;
    approvedDepositsCount: number;
    approvedDepositsTotal: number;
    individualWithdrawalSetting?: IndividualUserWithdrawalSetting | null;
  })[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  games: GameItem[];
  bonusCampaigns: BonusCampaign[];
  welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
  merchantPaymentConfig: MerchantPaymentConfig;
  withdrawalConfig: WithdrawalConfig;
  authorizedAdminEmails: AuthorizedAdminEmail[];
  auditLogs: AuditLogEntry[];
}> {
  await requireAdminUser();

  const [
    usersSnap,
    txSnap,
    historySnap,
    gamesCfg,
    pmCfg,
    withdrawalCfg,
    bonusesCfg,
    adminsCfg,
    auditSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'transactions')),
    getDocs(collection(db, 'game_history')).catch(() => null),
    safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES }),
    safeGetConfigDoc<{
      methods: AdminDepositPaymentMethod[];
      merchantPaymentConfig: MerchantPaymentConfig;
    }>('payment_methods', {
      methods: DEFAULT_PAYMENT_METHODS,
      merchantPaymentConfig: DEFAULT_MERCHANT_CONFIG,
    }),
    safeGetConfigDoc<WithdrawalConfig>('withdrawal_config', DEFAULT_WITHDRAWAL_CONFIG),
    safeGetConfigDoc<{
      welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
      bonusCampaigns: BonusCampaign[];
    }>('bonuses', {
      welcomeBonusConfig: DEFAULT_WELCOME_CONFIG,
      bonusCampaigns: DEFAULT_BONUS_CAMPAIGNS,
    }),
    safeGetConfigDoc<{ emails: AuthorizedAdminEmail[] }>('admin_emails', { emails: [] }),
    getDocs(collection(db, 'audit_logs')).catch(() => null),
  ]);

  const rawUsers = usersSnap.docs.map((d) => ({ ...(d.data() as FirestoreUserDoc), uid: d.id }));
  const rawTxs = txSnap.docs
    .map((d) => ({ ...(d.data() as FirestoreTransactionDoc), id: d.id }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const rawHistory = historySnap ? historySnap.docs.map((d) => d.data() as GameSessionRecord) : [];

  const deposits = rawTxs.filter((t) => t.type === 'deposit').map(mapTxToDeposit);
  const withdrawals = rawTxs.filter((t) => t.type === 'withdraw').map(mapTxToWithdrawal);

  const playsByUser = new Map<string, number>();
  const winsCountByUser = new Map<string, number>();
  const winningsByUser = new Map<string, number>();
  const stakedByUser = new Map<string, number>();
  for (const h of rawHistory) {
    playsByUser.set(h.userId, (playsByUser.get(h.userId) || 0) + 1);
    const rew = Number(h.rewardEarned || 0);
    const fee = Number(h.entryFee || 0);
    if (h.outcome === 'win' || rew > 0) {
      winsCountByUser.set(h.userId, (winsCountByUser.get(h.userId) || 0) + 1);
    }
    winningsByUser.set(h.userId, round2((winningsByUser.get(h.userId) || 0) + rew));
    stakedByUser.set(h.userId, round2((stakedByUser.get(h.userId) || 0) + fee));
  }

  const depCountByUser = new Map<string, number>();
  const depTotalByUser = new Map<string, number>();
  for (const d of deposits) {
    if (d.status === 'Successful') {
      depCountByUser.set(d.userId, (depCountByUser.get(d.userId) || 0) + 1);
      depTotalByUser.set(
        d.userId,
        round2((depTotalByUser.get(d.userId) || 0) + (d.creditedAmount ?? d.amount))
      );
    }
  }

  const users = rawUsers
    .map((u) => {
      const wallet = buildWalletSummary(u, withdrawalCfg);
      const historyWinnings = winningsByUser.get(u.uid) || 0;
      const verifiedDeposits = depTotalByUser.get(u.uid) || 0;
      return {
        ...mapUserDocToProfile(u),
        wallet,
        gamesPlayed: playsByUser.get(u.uid) || 0,
        gamesWon: winsCountByUser.get(u.uid) || 0,
        totalGameWinnings: round2(Math.max(historyWinnings, wallet.totalEarnings || 0)),
        totalGameStaked: stakedByUser.get(u.uid) || 0,
        approvedDepositsCount: depCountByUser.get(u.uid) || 0,
        approvedDepositsTotal: round2(Math.max(verifiedDeposits, wallet.totalDeposits || 0)),
        individualWithdrawalSetting: u.individualWithdrawalSetting || null,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const now = Date.now();
  const calcPeriod = (ms: number) => {
    const cutoff = now - ms;
    const pDeps = deposits
      .filter((d) => d.status === 'Successful' && new Date(d.createdAt).getTime() >= cutoff)
      .reduce((s, d) => s + (d.creditedAmount ?? d.amount), 0);
    const pWdrs = withdrawals
      .filter((w) => w.status === 'Completed' && new Date(w.createdAt).getTime() >= cutoff)
      .reduce((s, w) => s + w.amount, 0);
    const pHist = rawHistory.filter((h) => new Date(h.playedAt).getTime() >= cutoff);
    const pRew = pHist.reduce((s, h) => s + (h.rewardEarned || 0), 0);
    return {
      deposits: round2(pDeps),
      rewards: round2(pRew),
      withdrawals: round2(pWdrs),
      plays: pHist.length,
    };
  };

  const pendingWdrs = withdrawals.filter(
    (w) => w.status !== 'Completed' && w.status !== 'Rejected'
  );

  const analytics: AdminAnalytics = {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === 'active').length,
    suspendedUsers: users.filter((u) => u.status === 'suspended').length,
    verifiedKycUsers: users.filter((u) => u.kycStatus === 'verified').length,
    totalDeposits: round2(
      deposits
        .filter((d) => d.status === 'Successful')
        .reduce((s, d) => s + (d.creditedAmount ?? d.amount), 0)
    ),
    totalRewardsDistributed: round2(rawHistory.reduce((s, h) => s + (h.rewardEarned || 0), 0)),
    totalWithdrawalsCompleted: round2(
      withdrawals.filter((w) => w.status === 'Completed').reduce((s, w) => s + w.amount, 0)
    ),
    pendingDepositsCount: deposits.filter((d) => d.status === 'Pending').length,
    pendingWithdrawalsCount: pendingWdrs.length,
    pendingWithdrawalsAmount: round2(pendingWdrs.reduce((s, w) => s + w.amount, 0)),
    periodStats: {
      daily: calcPeriod(24 * 3600_000),
      weekly: calcPeriod(7 * 24 * 3600_000),
      monthly: calcPeriod(30 * 24 * 3600_000),
    },
  };

  const auditLogs: AuditLogEntry[] = auditSnap
    ? auditSnap.docs
        .map((d) => d.data() as AuditLogEntry)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 80)
    : [];

  // Enrich admin emails list with registered user info + any users with role==='admin'
  const adminEmailsMap = new Map<string, AuthorizedAdminEmail>();
  for (const item of adminsCfg.emails || []) {
    const key = item.email.toLowerCase();
    const matched = users.find((u) => u.email.toLowerCase() === key);
    adminEmailsMap.set(key, {
      ...item,
      registeredUser: matched
        ? { id: matched.id, name: matched.name, mobile: matched.mobile, status: matched.status }
        : null,
    });
  }
  for (const u of users.filter((usr) => usr.role === 'admin')) {
    const key = u.email.toLowerCase();
    if (!adminEmailsMap.has(key)) {
      adminEmailsMap.set(key, {
        email: u.email,
        addedBy: 'Firestore Admin',
        addedAt: u.createdAt,
        isOwner: key === 'lite59412@gmail.com',
        registeredUser: { id: u.id, name: u.name, mobile: u.mobile, status: u.status },
      });
    }
  }

  return {
    analytics,
    users,
    deposits,
    withdrawals,
    games: gamesCfg.games?.length ? gamesCfg.games : DEFAULT_GAMES,
    bonusCampaigns: bonusesCfg.bonusCampaigns || DEFAULT_BONUS_CAMPAIGNS,
    welcomeBonusConfig: bonusesCfg.welcomeBonusConfig || DEFAULT_WELCOME_CONFIG,
    merchantPaymentConfig: pmCfg.merchantPaymentConfig || DEFAULT_MERCHANT_CONFIG,
    withdrawalConfig: withdrawalCfg,
    authorizedAdminEmails: Array.from(adminEmailsMap.values()),
    auditLogs,
  };
}

export async function adminReviewDepositFirestore(params: {
  depositId: string;
  status: 'Successful' | 'Failed';
  creditedAmount?: number;
  includeBonus?: boolean;
  reason?: string;
}): Promise<void> {
  const admin = await requireAdminUser();
  const refSettings = await safeGetConfigDoc<ReferralSettings>(
    'referral_settings',
    DEFAULT_REFERRAL_SETTINGS
  );

  let depositUserId = '';
  let depositUserName = '';
  let finalCredit = 0;
  let bonusCredited = 0;
  let referrerUid: string | null = null;
  let referredCode: string | null = null;

  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', params.depositId);
    const txSnap = await tx.get(txRef);
    if (!txSnap.exists()) throw new Error('Deposit request not found.');
    const dep = txSnap.data() as FirestoreTransactionDoc;
    if (dep.status !== 'pending') {
      throw new Error('This deposit request has already been processed.');
    }

    depositUserId = dep.userId;
    depositUserName = dep.userName;
    const now = nowIso();

    if (params.status === 'Failed') {
      tx.update(txRef, {
        status: 'rejected',
        rejectionReason: params.reason || 'UTR could not be verified',
        updatedAt: now,
      });
      return;
    }

    const userRef = doc(db, 'users', dep.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('Target user not found.');
    const u = userSnap.data() as FirestoreUserDoc;

    finalCredit = round2(params.creditedAmount ?? dep.amount);
    bonusCredited = params.includeBonus !== false ? round2(dep.bonusAmount ?? 0) : 0;
    referrerUid = u.referredByUid || null;
    referredCode = u.referredBy || null;

    tx.update(txRef, {
      status: 'approved',
      creditedAmount: finalCredit,
      bonusAmount: bonusCredited,
      updatedAt: now,
    });

    tx.update(userRef, {
      walletBalance: round2((u.walletBalance ?? 0) + finalCredit),
      bonusBalance: round2((u.bonusBalance ?? 0) + bonusCredited),
      totalDeposits: round2((u.totalDeposits ?? 0) + finalCredit),
      firstDepositOfferUsed: true,
    });
  });

  if (params.status === 'Successful') {
    await addLedgerEntry({
      userId: depositUserId,
      type: 'deposit',
      bucket: 'available',
      amount: finalCredit,
      status: 'Successful',
      title: 'UPI Deposit Approved',
      description: `Credited ₹${finalCredit} to Wallet Balance`,
      referenceId: params.depositId,
    });
    if (bonusCredited > 0) {
      await addLedgerEntry({
        userId: depositUserId,
        type: 'deposit_bonus',
        bucket: 'bonus',
        amount: bonusCredited,
        status: 'Credited',
        title: 'Deposit Bonus Credited',
        description: `Extra ₹${bonusCredited} bonus on verified deposit`,
        referenceId: params.depositId,
      });
    }
    await addNotification(
      depositUserId,
      'deposit',
      'Deposit Approved!',
      `₹${finalCredit} has been added to your wallet${
        bonusCredited > 0 ? ` + ₹${bonusCredited} Bonus!` : '.'
      }`
    );

    // Automatic Referral Activity Reward (10% of verified deposit >= min)
    if (
      referrerUid &&
      referrerUid !== depositUserId &&
      refSettings.promotion_enabled &&
      finalCredit >= refSettings.minimum_qualifying_deposit &&
      refSettings.referral_percentage > 0
    ) {
      const rewardAmount = round2((finalCredit * refSettings.referral_percentage) / 100);
      if (rewardAmount > 0) {
        try {
          let referrerName = 'Referrer';
          await runTransaction(db, async (tx) => {
            const rRef = doc(db, 'users', referrerUid!);
            const rSnap = await tx.get(rRef);
            if (!rSnap.exists()) return;
            const rData = rSnap.data() as FirestoreUserDoc;
            referrerName = rData.name || 'Referrer';
            tx.update(rRef, {
              walletBalance: round2((rData.walletBalance ?? 0) + rewardAmount),
              totalEarnings: round2((rData.totalEarnings ?? 0) + rewardAmount),
            });
          });

          const refId = makeId('REFRWD');
          const refDoc: FirestoreReferralDoc = {
            id: refId,
            referrerUserId: referrerUid,
            referrerName,
            referredUserId: depositUserId,
            referredUserName: depositUserName,
            referralCode: referredCode || '',
            rewardType: 'deposit',
            qualifyingTransactionId: params.depositId,
            qualifyingAmount: finalCredit,
            rewardPercentage: refSettings.referral_percentage,
            rewardAmount,
            status: 'Reward Credited',
            registrationDate: nowIso(),
            createdAt: nowIso(),
          };
          await setDoc(doc(db, 'referrals', refId), refDoc);
          await addNotification(
            referrerUid,
            'reward',
            'Referral Deposit Commission Credited!',
            `You earned ₹${rewardAmount} (${refSettings.referral_percentage}% of ${depositUserName}'s ₹${finalCredit} deposit).`
          );
        } catch {
          // Non-blocking referral credit
        }
      }
    }

    await addAuditLog(
      admin.email,
      'admin',
      'DEPOSIT_APPROVED',
      `Approved deposit ${params.depositId} (₹${finalCredit} + ₹${bonusCredited} bonus) for ${depositUserName}`,
      params.depositId
    );
  } else {
    await addNotification(
      depositUserId,
      'deposit',
      'Deposit Rejected',
      `Deposit ${params.depositId} was rejected: ${params.reason || 'UTR mismatch'}`
    );
    await addAuditLog(
      admin.email,
      'admin',
      'DEPOSIT_REJECTED',
      `Rejected deposit ${params.depositId}: ${params.reason || 'UTR mismatch'}`,
      params.depositId
    );
  }
}

export async function adminUpdateWithdrawalStatusFirestore(params: {
  withdrawalId: string;
  status: WithdrawalStatus;
  rejectionReason?: string;
}): Promise<void> {
  const admin = await requireAdminUser();
  let targetUserId = '';
  let amount = 0;

  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', params.withdrawalId);
    const txSnap = await tx.get(txRef);
    if (!txSnap.exists()) throw new Error('Withdrawal request not found.');
    const wdr = txSnap.data() as FirestoreTransactionDoc;
    if (wdr.displayStatus === 'Completed' || wdr.displayStatus === 'Rejected') {
      throw new Error('This withdrawal has already been finalized.');
    }

    targetUserId = wdr.userId;
    amount = round2(wdr.amount);
    const userRef = doc(db, 'users', wdr.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('Target user not found.');
    const u = userSnap.data() as FirestoreUserDoc;

    const mappedCoreStatus: 'pending' | 'approved' | 'rejected' =
      params.status === 'Completed'
        ? 'approved'
        : params.status === 'Rejected'
        ? 'rejected'
        : 'pending';

    tx.update(txRef, {
      status: mappedCoreStatus,
      displayStatus: params.status,
      rejectionReason: params.status === 'Rejected' ? params.rejectionReason || 'Rejected by admin' : null,
      updatedAt: nowIso(),
    });

    if (params.status === 'Rejected') {
      tx.update(userRef, {
        walletBalance: round2((u.walletBalance ?? 0) + amount),
        pendingWithdrawalBalance: round2(Math.max(0, (u.pendingWithdrawalBalance ?? 0) - amount)),
      });
    } else if (params.status === 'Completed') {
      tx.update(userRef, {
        pendingWithdrawalBalance: round2(Math.max(0, (u.pendingWithdrawalBalance ?? 0) - amount)),
        totalWithdrawals: round2((u.totalWithdrawals ?? 0) + amount),
      });
    }
  });

  if (params.status === 'Rejected') {
    await addLedgerEntry({
      userId: targetUserId,
      type: 'withdrawal_refund',
      bucket: 'available',
      amount,
      status: 'Refunded',
      title: 'Withdrawal Refunded',
      description: params.rejectionReason || 'Withdrawal rejected and refunded to Wallet Balance',
      referenceId: params.withdrawalId,
    });
    await addNotification(
      targetUserId,
      'withdrawal',
      'Withdrawal Rejected & Refunded',
      `₹${amount} has been refunded to your Wallet Balance. Reason: ${
        params.rejectionReason || 'Verification issue'
      }`
    );
  } else if (params.status === 'Completed') {
    await addNotification(
      targetUserId,
      'withdrawal',
      'Withdrawal Completed!',
      `Your payout of ₹${amount} (${params.withdrawalId}) has been sent successfully.`
    );
  }

  await addAuditLog(
    admin.email,
    'admin',
    'WITHDRAWAL_UPDATED',
    `Withdrawal ${params.withdrawalId} (₹${amount}) set to ${params.status}`,
    params.withdrawalId
  );
}

export async function adminCreditUserFirestore(params: {
  userId: string;
  amount: number;
  bucket: 'available' | 'bonus';
  note: string;
}): Promise<void> {
  const admin = await requireAdminUser();
  const delta = round2(params.amount);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a valid non-zero amount.');
  }

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', params.userId);
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error('User not found.');
    const u = snap.data() as FirestoreUserDoc;
    if (params.bucket === 'bonus') {
      tx.update(userRef, { bonusBalance: round2(Math.max(0, (u.bonusBalance ?? 0) + delta)) });
    } else {
      tx.update(userRef, { walletBalance: round2(Math.max(0, (u.walletBalance ?? 0) + delta)) });
    }
  });

  await addLedgerEntry({
    userId: params.userId,
    type: delta > 0 ? 'deposit' : 'withdrawal',
    bucket: params.bucket,
    amount: delta,
    status: 'Credited',
    title: params.note || 'Admin Balance Adjustment',
    description: `Admin adjusted ${params.bucket} balance by ₹${delta}`,
  });

  await addNotification(
    params.userId,
    'deposit',
    delta > 0 ? 'Wallet Credited by Admin' : 'Wallet Updated by Admin',
    `${delta > 0 ? '+' : ''}₹${delta} updated in your ${
      params.bucket === 'bonus' ? 'Bonus' : 'Wallet'
    } Balance (${params.note || 'Admin adjustment'}).`
  );

  await addAuditLog(
    admin.email,
    'admin',
    'USER_WALLET_CREDIT',
    `Adjusted ${params.userId} ${params.bucket} balance by ₹${delta} (${params.note})`,
    params.userId
  );
}

export async function adminToggleUserStatusFirestore(
  userId: string,
  status: 'active' | 'suspended'
): Promise<void> {
  const admin = await requireAdminUser();
  const isBanned = status === 'suspended';
  await updateDoc(doc(db, 'users', userId), { status, isBanned });
  await addAuditLog(
    admin.email,
    'admin',
    isBanned ? 'USER_BANNED' : 'USER_UNBANNED',
    `Set user ${userId} status to ${status}`,
    userId
  );
}

export async function adminReviewKycFirestore(
  userId: string,
  kycStatus: 'verified' | 'rejected'
): Promise<void> {
  const admin = await requireAdminUser();
  await updateDoc(doc(db, 'users', userId), { kycStatus });
  await addNotification(
    userId,
    'security',
    `KYC ${kycStatus === 'verified' ? 'Verified' : 'Rejected'}`,
    kycStatus === 'verified'
      ? 'Your KYC verification is approved!'
      : 'Your KYC verification was rejected. Please resubmit clear details.'
  );
  await addAuditLog(admin.email, 'admin', 'KYC_REVIEW', `Set KYC for ${userId} to ${kycStatus}`, userId);
}

export async function adminGetUserHistoryFirestore(userId: string): Promise<{
  gameSessions: GameSessionRecord[];
  transactions: LedgerTransaction[];
}> {
  await requireAdminUser();
  const [histSnap, ledgerSnap] = await Promise.all([
    getDocs(query(collection(db, 'game_history'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'ledger'), where('userId', '==', userId))),
  ]);
  return {
    gameSessions: histSnap.docs
      .map((d) => d.data() as GameSessionRecord)
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
      .slice(0, 40),
    transactions: ledgerSnap.docs
      .map((d) => d.data() as LedgerTransaction)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 40),
  };
}

export async function adminSaveUserWithdrawalSettingsFirestore(
  userId: string,
  customMin: number | null,
  customNotice: string | null
): Promise<void> {
  const admin = await requireAdminUser();
  const setting: IndividualUserWithdrawalSetting | null =
    customMin === null && !customNotice
      ? null
      : {
          id: `UWS-${userId}`,
          user_id: userId,
          custom_minimum_withdrawal: customMin,
          custom_withdrawal_notice: customNotice,
          updated_at: nowIso(),
          updated_by_admin_id: admin.email,
        };
  await updateDoc(doc(db, 'users', userId), { individualWithdrawalSetting: setting });
  await addAuditLog(
    admin.email,
    'admin',
    'USER_WITHDRAWAL_SETTINGS',
    `Updated withdrawal settings for ${userId}`,
    userId
  );
}

export async function adminSaveUserWinRatioFirestore(
  userId: string,
  customWinRatio: number | null
): Promise<void> {
  const admin = await requireAdminUser();
  let normalized: number | null = null;
  if (customWinRatio !== null) {
    const rounded = Math.round(Number(customWinRatio));
    if (!Number.isFinite(rounded) || rounded < 0 || rounded > 100) {
      throw new Error('Win ratio must be between 0% and 100%.');
    }
    normalized = rounded;
  }
  await updateDoc(doc(db, 'users', userId), { customWinRatio: normalized });
  await addAuditLog(
    admin.email,
    'admin',
    'USER_WIN_RATIO',
    normalized === null
      ? `Reset game win ratio for ${userId} to global game default`
      : `Set custom game win ratio for ${userId} to ${normalized}%`,
    userId
  );
}

// ============================================================================
// 8. ADMIN APP_CONFIG MANAGERS (`app_config/*`)
// ============================================================================

export async function adminGetPaymentMethodsFirestore(): Promise<{
  methods: AdminDepositPaymentMethod[];
  merchantPaymentConfig: MerchantPaymentConfig;
}> {
  await requireAdminUser();
  return safeGetConfigDoc('payment_methods', {
    methods: DEFAULT_PAYMENT_METHODS,
    merchantPaymentConfig: DEFAULT_MERCHANT_CONFIG,
  });
}

async function persistPaymentMethods(
  methods: AdminDepositPaymentMethod[],
  adminEmail: string
): Promise<{ methods: AdminDepositPaymentMethod[]; merchantPaymentConfig: MerchantPaymentConfig }> {
  const primary = methods.find((m) => m.isPrimary && m.isActive) || methods.find((m) => m.isActive) || methods[0];
  const merchantPaymentConfig: MerchantPaymentConfig = primary
    ? {
        upiId: primary.upiId,
        merchantName: primary.merchantName,
        qrImageDataUrl: primary.qrImageDataUrl ?? null,
        instructions: primary.instructions || '',
        updatedAt: nowIso(),
      }
    : DEFAULT_MERCHANT_CONFIG;

  await setDoc(doc(db, 'app_config', 'payment_methods'), {
    methods,
    merchantPaymentConfig,
    updatedAt: nowIso(),
    updatedBy: adminEmail,
  });
  return { methods, merchantPaymentConfig };
}

export async function adminAddPaymentMethodFirestore(
  payload: Omit<AdminDepositPaymentMethod, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ methods: AdminDepositPaymentMethod[]; message: string }> {
  const admin = await requireAdminUser();
  const current = await adminGetPaymentMethodsFirestore();
  const now = nowIso();
  const newMethod: AdminDepositPaymentMethod = {
    ...payload,
    id: makeId('DPM'),
    createdAt: now,
    updatedAt: now,
  };
  let next = [...current.methods];
  if (newMethod.isPrimary || next.length === 0) {
    newMethod.isPrimary = true;
    next = next.map((m) => ({ ...m, isPrimary: false }));
  }
  next.push(newMethod);
  const saved = await persistPaymentMethods(next, admin.email);
  await addAuditLog(admin.email, 'admin', 'PAYMENT_METHOD_ADDED', `Added ${newMethod.label} (${newMethod.upiId})`);
  return { methods: saved.methods, message: `Added deposit payment method "${newMethod.label}".` };
}

export async function adminUpdatePaymentMethodFirestore(
  id: string,
  payload: Partial<AdminDepositPaymentMethod>
): Promise<{ methods: AdminDepositPaymentMethod[]; message: string }> {
  const admin = await requireAdminUser();
  const current = await adminGetPaymentMethodsFirestore();
  let next = current.methods.map((m) =>
    m.id === id ? { ...m, ...payload, updatedAt: nowIso() } : m
  );
  if (payload.isPrimary) {
    next = next.map((m) => ({ ...m, isPrimary: m.id === id }));
  }
  const saved = await persistPaymentMethods(next, admin.email);
  await addAuditLog(admin.email, 'admin', 'PAYMENT_METHOD_UPDATED', `Updated payment method ${id}`);
  return { methods: saved.methods, message: 'Deposit payment method updated.' };
}

export async function adminDeletePaymentMethodFirestore(
  id: string
): Promise<{ methods: AdminDepositPaymentMethod[]; message: string }> {
  const admin = await requireAdminUser();
  const current = await adminGetPaymentMethodsFirestore();
  let next = current.methods.filter((m) => m.id !== id);
  if (next.length > 0 && !next.some((m) => m.isPrimary)) {
    next[0] = { ...next[0], isPrimary: true };
  }
  const saved = await persistPaymentMethods(next, admin.email);
  await addAuditLog(admin.email, 'admin', 'PAYMENT_METHOD_DELETED', `Deleted payment method ${id}`);
  return { methods: saved.methods, message: 'Payment method deleted.' };
}

export async function adminSaveQuickMerchantConfigFirestore(
  upiId: string,
  merchantName: string
): Promise<void> {
  const admin = await requireAdminUser();
  const current = await adminGetPaymentMethodsFirestore();
  let next = [...current.methods];
  if (next.length === 0) {
    next = [
      {
        ...DEFAULT_PAYMENT_METHODS[0],
        upiId: upiId.trim(),
        merchantName: merchantName.trim(),
        updatedAt: nowIso(),
      },
    ];
  } else {
    const primaryIdx = Math.max(0, next.findIndex((m) => m.isPrimary));
    next[primaryIdx] = {
      ...next[primaryIdx],
      upiId: upiId.trim(),
      merchantName: merchantName.trim(),
      updatedAt: nowIso(),
    };
  }
  await persistPaymentMethods(next, admin.email);
}

export async function adminSaveWithdrawalConfigFirestore(cfg: WithdrawalConfig): Promise<void> {
  const admin = await requireAdminUser();
  await setDoc(doc(db, 'app_config', 'withdrawal_config'), {
    ...cfg,
    updatedAt: nowIso(),
    updatedBy: admin.email,
  });
  await addAuditLog(admin.email, 'admin', 'WITHDRAWAL_CONFIG_SAVED', `Min withdrawal set to ₹${cfg.minWithdrawalLimit}`);
}

export async function adminGetAnnouncementFirestore(): Promise<{
  announcement: AppAnnouncementConfig;
  history: AppAnnouncementHistoryItem[];
}> {
  await requireAdminUser();
  return safeGetConfigDoc('announcements', {
    announcement: DEFAULT_ANNOUNCEMENT,
    history: [],
  });
}

export async function adminSaveAnnouncementFirestore(params: {
  enabled: boolean;
  title: string;
  message: string;
  tone: AppAnnouncementTone;
  buttonLabel: string;
  showMode: 'every_open' | 'once_per_update';
}): Promise<{ announcement: AppAnnouncementConfig; history: AppAnnouncementHistoryItem[] }> {
  const admin = await requireAdminUser();
  const current = await adminGetAnnouncementFirestore();
  const now = nowIso();
  const nextAnnouncement: AppAnnouncementConfig = {
    enabled: params.enabled,
    title: params.title.trim(),
    message: params.message.trim(),
    tone: params.tone,
    buttonLabel: params.buttonLabel.trim() || 'Got It',
    showMode: params.showMode,
    revision: (current.announcement?.revision || 0) + 1,
    updatedAt: now,
    updatedBy: admin.email,
  };

  let nextHistory = [...(current.history || [])];
  if (nextAnnouncement.enabled && (nextAnnouncement.title || nextAnnouncement.message)) {
    nextHistory = [
      {
        id: makeId('ANN'),
        title: nextAnnouncement.title,
        message: nextAnnouncement.message,
        tone: nextAnnouncement.tone,
        buttonLabel: nextAnnouncement.buttonLabel,
        showMode: nextAnnouncement.showMode,
        publishedAt: now,
        publishedBy: admin.email,
      },
      ...nextHistory,
    ].slice(0, 20);
  }

  await setDoc(doc(db, 'app_config', 'announcements'), {
    announcement: nextAnnouncement,
    history: nextHistory,
  });
  await addAuditLog(
    admin.email,
    'admin',
    'ANNOUNCEMENT_UPDATED',
    `Startup notice ${nextAnnouncement.enabled ? 'PUBLISHED' : 'DISABLED'}: ${nextAnnouncement.title}`
  );
  return { announcement: nextAnnouncement, history: nextHistory };
}

export async function adminGetAppReleaseFirestore(): Promise<AppReleaseConfig> {
  await requireAdminUser();
  return safeGetConfigDoc<AppReleaseConfig>('app_release', DEFAULT_APP_RELEASE);
}

export async function adminSaveAppReleaseFirestore(
  patch: Partial<AppReleaseConfig>
): Promise<AppReleaseConfig> {
  const admin = await requireAdminUser();
  const current = await adminGetAppReleaseFirestore();
  const next: AppReleaseConfig = {
    ...current,
    ...patch,
    uploadedAt: patch.downloadUrl !== undefined ? (patch.downloadUrl ? nowIso() : null) : current.uploadedAt,
    uploadedBy: patch.downloadUrl !== undefined ? (patch.downloadUrl ? admin.email : null) : current.uploadedBy,
  };
  await setDoc(doc(db, 'app_config', 'app_release'), next);
  await addAuditLog(admin.email, 'admin', 'APP_RELEASE_UPDATED', `Updated app release v${next.version}`);
  return next;
}

export async function adminGetReferralsOverviewFirestore(
  searchQuery = ''
): Promise<AdminReferralOverviewData> {
  await requireAdminUser();
  const [refSettings, refSnap, usersSnap] = await Promise.all([
    safeGetConfigDoc<ReferralSettings>('referral_settings', DEFAULT_REFERRAL_SETTINGS),
    getDocs(collection(db, 'referrals')),
    getDocs(collection(db, 'users')),
  ]);

  const usersMap = new Map<string, FirestoreUserDoc>();
  usersSnap.docs.forEach((d) => {
    const u = d.data() as FirestoreUserDoc;
    usersMap.set(d.id, { ...u, uid: d.id });
  });

  const q = searchQuery.trim().toLowerCase();
  const allRefs = refSnap.docs
    .map((d) => ({ ...(d.data() as FirestoreReferralDoc), id: d.id }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filteredRefs = q
    ? allRefs.filter(
        (r) =>
          r.referrerUserId.toLowerCase().includes(q) ||
          r.referredUserId.toLowerCase().includes(q) ||
          r.referralCode.toLowerCase().includes(q) ||
          r.referrerName.toLowerCase().includes(q) ||
          r.referredUserName.toLowerCase().includes(q)
      )
    : allRefs;

  const rewards: AdminReferralRewardView[] = filteredRefs.map((r) => ({
    id: r.id,
    referrer_user_id: r.referrerUserId,
    referred_user_id: r.referredUserId,
    reward_type: r.rewardType === 'deposit' ? 'deposit' : 'signup',
    qualifying_transaction_id: r.qualifyingTransactionId,
    qualifying_amount: round2(r.qualifyingAmount),
    reward_percentage: r.rewardPercentage,
    reward_amount: round2(r.rewardAmount),
    reward_status: r.status,
    created_at: r.createdAt,
    reversed_at: r.reversedAt,
    reversal_reason: r.reversalReason,
    referrer_name: usersMap.get(r.referrerUserId)?.name || r.referrerName || 'User',
    referred_name: usersMap.get(r.referredUserId)?.name || r.referredUserName || 'Friend',
    referral_code: r.referralCode,
  }));

  const relMap = new Map<string, AdminReferralRelationshipView>();
  for (const r of filteredRefs) {
    const key = `${r.referrerUserId}_${r.referredUserId}`;
    const existing = relMap.get(key);
    const activeReward = r.status === 'Reward Credited' ? r.rewardAmount : 0;
    if (!existing) {
      relMap.set(key, {
        id: key,
        referrer_user_id: r.referrerUserId,
        referred_user_id: r.referredUserId,
        referral_code: r.referralCode,
        registration_date: r.registrationDate || r.createdAt,
        status: r.status,
        referrer_name: usersMap.get(r.referrerUserId)?.name || r.referrerName || 'User',
        referred_name: usersMap.get(r.referredUserId)?.name || r.referredUserName || 'Friend',
        total_qualifying_deposits: r.rewardType === 'deposit' ? round2(r.qualifyingAmount) : 0,
        total_rewards_earned: round2(activeReward),
      });
    } else {
      if (r.rewardType === 'deposit') {
        existing.total_qualifying_deposits = round2(
          existing.total_qualifying_deposits + r.qualifyingAmount
        );
      }
      existing.total_rewards_earned = round2(existing.total_rewards_earned + activeReward);
    }
  }

  const credited = allRefs.filter((r) => r.status === 'Reward Credited');
  return {
    stats: {
      totalReferrals: new Set(allRefs.map((r) => `${r.referrerUserId}_${r.referredUserId}`)).size,
      successfulReferrals: new Set(
        allRefs
          .filter((r) => r.status === 'Reward Credited' || r.status === 'Qualified')
          .map((r) => `${r.referrerUserId}_${r.referredUserId}`)
      ).size,
      pendingReferrals: allRefs.filter((r) => r.status === 'Pending').length,
      reversedReferrals: allRefs.filter((r) => r.status === 'Reversed').length,
      totalReferralRewards: round2(credited.reduce((s, r) => s + r.rewardAmount, 0)),
      totalSignupRewards: round2(
        credited.filter((r) => r.rewardType === 'signup').reduce((s, r) => s + r.rewardAmount, 0)
      ),
      totalDepositRewards: round2(
        credited.filter((r) => r.rewardType === 'deposit').reduce((s, r) => s + r.rewardAmount, 0)
      ),
      totalQualifyingDeposits: round2(
        credited.filter((r) => r.rewardType === 'deposit').reduce((s, r) => s + r.qualifyingAmount, 0)
      ),
    },
    settings: refSettings,
    relationships: Array.from(relMap.values()),
    rewards,
  };
}

export async function adminSaveReferralSettingsFirestore(
  settings: Omit<ReferralSettings, 'updated_at'>
): Promise<{ settings: ReferralSettings; message: string }> {
  const admin = await requireAdminUser();
  const next: ReferralSettings = {
    ...settings,
    updated_at: nowIso(),
  };
  await setDoc(doc(db, 'app_config', 'referral_settings'), next);
  await addAuditLog(admin.email, 'admin', 'REFERRAL_SETTINGS_SAVED', `Signup ₹${next.signup_bonus}, Activity ${next.referral_percentage}%`);
  return { settings: next, message: 'Referral promotion settings saved.' };
}

export async function adminReverseReferralRewardFirestore(
  rewardId: string,
  reason: string
): Promise<{ message: string }> {
  const admin = await requireAdminUser();
  await runTransaction(db, async (tx) => {
    const refDocRef = doc(db, 'referrals', rewardId);
    const snap = await tx.get(refDocRef);
    if (!snap.exists()) throw new Error('Referral reward record not found.');
    const r = snap.data() as FirestoreReferralDoc;
    if (r.status === 'Reversed') throw new Error('Reward is already reversed.');

    tx.update(refDocRef, {
      status: 'Reversed',
      reversedAt: nowIso(),
      reversalReason: reason,
    });

    if (r.rewardAmount > 0) {
      const userRef = doc(db, 'users', r.referrerUserId);
      const uSnap = await tx.get(userRef);
      if (uSnap.exists()) {
        const u = uSnap.data() as FirestoreUserDoc;
        if (r.rewardType === 'signup') {
          tx.update(userRef, {
            bonusBalance: round2(Math.max(0, (u.bonusBalance ?? 0) - r.rewardAmount)),
          });
        } else {
          tx.update(userRef, {
            walletBalance: round2(Math.max(0, (u.walletBalance ?? 0) - r.rewardAmount)),
          });
        }
      }
    }
  });
  await addAuditLog(admin.email, 'admin', 'REFERRAL_REVERSED', `Reversed ${rewardId}: ${reason}`, rewardId);
  return { message: `Referral reward ${rewardId} reversed.` };
}

export async function adminSaveGamesFirestore(games: GameItem[]): Promise<void> {
  const admin = await requireAdminUser();
  await setDoc(doc(db, 'app_config', 'games'), { games, updatedAt: nowIso(), updatedBy: admin.email });
}

export async function adminAddGameFirestore(params: {
  name: string;
  category: GameCategory;
  engine: GameEngineType;
  winMultiplier: number;
  winRatio: number;
  isTournament: boolean;
}): Promise<void> {
  const cfg = await safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES });
  const list = cfg.games?.length ? [...cfg.games] : [...DEFAULT_GAMES];
  const ratio = Math.max(5, Math.min(95, Math.round(params.winRatio || 50)));
  list.push({
    id: makeId('GM'),
    name: params.name.trim(),
    category: params.category,
    engine: params.engine,
    thumbnail: DEFAULT_GAMES[0].thumbnail,
    difficulty: 'Medium',
    instructions: `Play ${params.name.trim()} and win up to ${params.winMultiplier}x your stake!`,
    rewardRuleText: `Win multiplier: ${params.winMultiplier}x · Win ratio: ${ratio}%`,
    entryFeeOptions: [10, 20, 50, 100, 250, 500],
    winMultiplier: params.winMultiplier,
    minWinRatio: ratio,
    maxWinRatio: ratio,
    isTournament: params.isTournament,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  });
  await adminSaveGamesFirestore(list);
}

export async function adminUpdateGameWinRatioFirestore(gameId: string, winRatio: number): Promise<void> {
  const cfg = await safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES });
  const ratio = Math.max(5, Math.min(95, Math.round(winRatio)));
  const next = (cfg.games?.length ? cfg.games : DEFAULT_GAMES).map((g) =>
    g.id === gameId ? { ...g, minWinRatio: ratio, maxWinRatio: ratio } : g
  );
  await adminSaveGamesFirestore(next);
}

export async function adminDeleteGameFirestore(gameId: string): Promise<void> {
  const cfg = await safeGetConfigDoc<{ games: GameItem[] }>('games', { games: DEFAULT_GAMES });
  const next = (cfg.games?.length ? cfg.games : DEFAULT_GAMES).filter((g) => g.id !== gameId);
  await adminSaveGamesFirestore(next);
}

export async function adminSaveWelcomeBonusFirestore(params: {
  amount: number;
  expiryDays: number;
  enabled: boolean;
}): Promise<void> {
  const admin = await requireAdminUser();
  const cfg = await safeGetConfigDoc<{
    welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
    bonusCampaigns: BonusCampaign[];
  }>('bonuses', {
    welcomeBonusConfig: DEFAULT_WELCOME_CONFIG,
    bonusCampaigns: DEFAULT_BONUS_CAMPAIGNS,
  });
  await setDoc(doc(db, 'app_config', 'bonuses'), {
    welcomeBonusConfig: {
      ...cfg.welcomeBonusConfig,
      amount: round2(params.amount),
      expiryDays: Math.max(1, Math.round(params.expiryDays)),
      enabled: params.enabled,
    },
    bonusCampaigns: cfg.bonusCampaigns || DEFAULT_BONUS_CAMPAIGNS,
    updatedAt: nowIso(),
    updatedBy: admin.email,
  });
}

export async function adminCreateCampaignFirestore(params: {
  title: string;
  description: string;
  rewardAmount: number;
}): Promise<void> {
  const admin = await requireAdminUser();
  const cfg = await safeGetConfigDoc<{
    welcomeBonusConfig: typeof DEFAULT_WELCOME_CONFIG;
    bonusCampaigns: BonusCampaign[];
  }>('bonuses', {
    welcomeBonusConfig: DEFAULT_WELCOME_CONFIG,
    bonusCampaigns: DEFAULT_BONUS_CAMPAIGNS,
  });
  const next: BonusCampaign[] = [
    ...(cfg.bonusCampaigns || DEFAULT_BONUS_CAMPAIGNS),
    {
      id: makeId('CMP'),
      title: params.title.trim(),
      description: params.description.trim(),
      type: 'promo',
      rewardAmount: round2(params.rewardAmount),
      eligibilityRules: 'All active players',
      expiryDays: 14,
      active: true,
      totalClaimedCount: 0,
      totalDistributedAmount: 0,
    },
  ];
  await setDoc(doc(db, 'app_config', 'bonuses'), {
    welcomeBonusConfig: cfg.welcomeBonusConfig || DEFAULT_WELCOME_CONFIG,
    bonusCampaigns: next,
    updatedAt: nowIso(),
    updatedBy: admin.email,
  });
}

export async function adminAddAdminEmailFirestore(email: string): Promise<{
  message: string;
  authorizedAdminEmails: AuthorizedAdminEmail[];
}> {
  const admin = await requireAdminUser();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Enter a valid Gmail / Email address.');
  }

  // Promote existing user document in Firestore if registered
  const userSnap = await getDocs(
    query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1))
  );
  let matchedUser: AuthorizedAdminEmail['registeredUser'] = null;
  if (!userSnap.empty) {
    const docSnap = userSnap.docs[0];
    const u = docSnap.data() as FirestoreUserDoc;
    await updateDoc(docSnap.ref, { role: 'admin' });
    matchedUser = {
      id: docSnap.id,
      name: u.name || 'Admin',
      mobile: u.mobile || '',
      status: u.isBanned ? 'suspended' : 'active',
    };
  }

  const cfg = await safeGetConfigDoc<{ emails: AuthorizedAdminEmail[] }>('admin_emails', {
    emails: [],
  });
  const existing = (cfg.emails || []).filter((e) => e.email.toLowerCase() !== cleanEmail);
  const next: AuthorizedAdminEmail[] = [
    ...existing,
    {
      email: cleanEmail,
      addedBy: admin.email,
      addedAt: nowIso(),
      registeredUser: matchedUser,
    },
  ];
  await setDoc(doc(db, 'app_config', 'admin_emails'), { emails: next });
  await addAuditLog(admin.email, 'admin', 'ADMIN_ADDED', `Granted admin role to ${cleanEmail}`);
  return {
    message: matchedUser
      ? `Admin role granted immediately to ${cleanEmail}!`
      : `${cleanEmail} saved to admin list. Once they sign up, promote them or re-save to activate.`,
    authorizedAdminEmails: next,
  };
}

export async function adminRemoveAdminEmailFirestore(email: string): Promise<{
  message: string;
  authorizedAdminEmails: AuthorizedAdminEmail[];
}> {
  const admin = await requireAdminUser();
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === admin.email.toLowerCase()) {
    throw new Error('You cannot remove your own admin access.');
  }

  const userSnap = await getDocs(
    query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1))
  );
  if (!userSnap.empty) {
    await updateDoc(userSnap.docs[0].ref, { role: 'user' });
  }

  const cfg = await safeGetConfigDoc<{ emails: AuthorizedAdminEmail[] }>('admin_emails', {
    emails: [],
  });
  const next = (cfg.emails || []).filter((e) => e.email.toLowerCase() !== cleanEmail);
  await setDoc(doc(db, 'app_config', 'admin_emails'), { emails: next });
  await addAuditLog(admin.email, 'admin', 'ADMIN_REMOVED', `Revoked admin role for ${cleanEmail}`);
  return { message: `Revoked admin access for ${cleanEmail}.`, authorizedAdminEmails: next };
}

export async function adminDeleteReviewFirestore(reviewId: string): Promise<void> {
  await requireAdminUser();
  await deleteDoc(doc(db, 'reviews', reviewId));
}
