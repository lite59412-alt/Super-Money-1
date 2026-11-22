import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AdminAnalytics,
  AdminDepositPaymentMethod,
  AdminReferralOverviewData,
  AdminReferralRelationshipView,
  AdminReferralRewardView,
  AppAnnouncementConfig,
  AppAnnouncementHistoryItem,
  AppReleaseConfig,
  AuditLogEntry,
  AuthorizedAdminEmail,
  BonusCampaign,
  DepositRecord,
  DepositTier,
  GameItem,
  GameSessionRecord,
  IndividualUserWithdrawalSetting,
  LedgerTransaction,
  MerchantPaymentConfig,
  NotificationItem,
  ReferralCodeRecord,
  ReferralRelationshipRecord,
  ReferralRewardRecord,
  ReferralSettings,
  ReviewItem,
  UserProfile,
  UserReferralDashboardData,
  UserReferralHistoryItem,
  WalletSummary,
  WithdrawalConfig,
  WithdrawalRecord,
} from '../src/types';

export interface StoredUser extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
  deviceFingerprints: string[];
}

export interface DatabaseSchema {
  schemaVersion: number;
  users: StoredUser[];
  transactions: LedgerTransaction[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  games: GameItem[];
  gameSessions: GameSessionRecord[];
  notifications: NotificationItem[];
  reviews: ReviewItem[];
  bonusCampaigns: BonusCampaign[];
  auditLogs: AuditLogEntry[];
  processedIdempotencyKeys: string[];
  welcomeBonusConfig: {
    amount: number;
    expiryDays: number;
    enabled: boolean;
    terms: string;
  };
  merchantPaymentConfig: MerchantPaymentConfig;
  depositPaymentMethods: AdminDepositPaymentMethod[];
  withdrawalConfig: WithdrawalConfig;
  individual_user_withdrawal_settings: IndividualUserWithdrawalSetting[];
  authorizedAdminEmails: AuthorizedAdminEmail[];
  referral_codes: ReferralCodeRecord[];
  referral_relationships: ReferralRelationshipRecord[];
  referral_rewards: ReferralRewardRecord[];
  referral_settings: ReferralSettings;
  appReleaseConfig: {
    enabled: boolean;
    appName: string;
    version: string;
    fileName: string | null;
    storedFileName: string | null;
    fileSizeBytes: number;
    mimeType: string;
    releaseNotes: string;
    shareMessageTemplate: string;
    uploadedAt: string | null;
    uploadedBy: string | null;
  };
  appAnnouncementConfig: AppAnnouncementConfig;
  appAnnouncementHistory: AppAnnouncementHistoryItem[];
  reviewScheduler: {
    lastAutoReviewAt: string;
    nextPoolIndex: number;
    intervalMs: number;
    reviewPoolVersion?: number;
    usedReviewComments?: string[];
  };
}

export const PRIMARY_OWNER_ADMIN_EMAIL = 'lite59412@gmail.com';

export const REVIEW_INTERVAL_MS = 150 * 60 * 1000; // Auto-add 1 fresh review every 2.5 hours (2–3 hours)
const REVIEW_POOL_VERSION = 2;

export const SCHEDULED_REVIEW_POOL: Array<{
  userName: string;
  city: string;
  rating: number;
  comment: string;
  badge: string;
}> = [
  {
    userName: 'Rahul Sharma',
    city: 'Jaipur, RJ',
    rating: 5,
    comment: 'App bohot acha hai, mujhe 100% withdrawal mila direct UPI me!',
    badge: 'Verified Payout',
  },
  {
    userName: 'Amit Verma',
    city: 'Lucknow, UP',
    rating: 5,
    comment: 'Mujhe bohot acha laga ye app, games bilkul smooth chalte hain.',
    badge: 'Verified Member',
  },
  {
    userName: 'Pooja Patel',
    city: 'Surat, GJ',
    rating: 4,
    comment: 'Acha app hai, PhonePe se deposit jaldi add ho gaya. Thoda aur games add karo!',
    badge: 'Verified Deposit',
  },
  {
    userName: 'Vikas Yadav',
    city: 'Indore, MP',
    rating: 5,
    comment: '100% real withdrawal mila bhai, mere GPay pe paisa aa gaya.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Neha Singh',
    city: 'Delhi NCR',
    rating: 5,
    comment: 'Best gaming app hai, daily bonus aur refer reward dono milte hain.',
    badge: 'KYC Verified',
  },
  {
    userName: 'Suresh Nair',
    city: 'Kochi, KL',
    rating: 4,
    comment: 'App mast hai, KYC ke baad withdrawal time par mil gaya.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Deepak Kumar',
    city: 'Patna, BR',
    rating: 5,
    comment: 'Bohot badiya app hai, Aviator aur Mines khelne me full maza aata hai.',
    badge: 'Regular Player',
  },
  {
    userName: 'Anjali Deshmukh',
    city: 'Pune, MH',
    rating: 5,
    comment: 'Mujhe first deposit bonus bhi mila aur withdrawal bhi 100% safe hai.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Karan Malhotra',
    city: 'Chandigarh',
    rating: 4,
    comment: 'Nice app hai yaar, UI clean hai aur koi lag nahi hota.',
    badge: 'Verified Member',
  },
  {
    userName: 'Ritu Joshi',
    city: 'Mumbai, MH',
    rating: 5,
    comment: 'Trusted app hai, maine ₹5,500 withdraw kiya aur turant aa gaya.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Manish Tiwari',
    city: 'Bhopal, MP',
    rating: 5,
    comment: 'Ye app bohot pasand aaya, 100% genuine withdrawal deta hai.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Kavita Rao',
    city: 'Bengaluru, KA',
    rating: 5,
    comment: 'Deposit UTR verify jaldi hota hai aur wallet history ekdum clear hai.',
    badge: 'Verified Deposit',
  },
  {
    userName: 'Nikhil Gupta',
    city: 'Kanpur, UP',
    rating: 4,
    comment: 'Acha gaming app hai, Wheel aur Dice game mujhe sabse zyada pasand hai.',
    badge: 'Regular Player',
  },
  {
    userName: 'Sandeep Chauhan',
    city: 'Noida, UP',
    rating: 5,
    comment: 'Bhai mast app hai, doston ko refer karke bhi acha bonus mila.',
    badge: 'Verified Member',
  },
  {
    userName: 'Priyanka Meena',
    city: 'Udaipur, RJ',
    rating: 5,
    comment: '100% withdrawal mila mujhe, bilkul tension free app hai.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Rohit Kulkarni',
    city: 'Nagpur, MH',
    rating: 4,
    comment: 'Games ka animation super smooth hai, khelne me maza aa raha hai.',
    badge: 'Regular Player',
  },
  {
    userName: 'Ashish Mishra',
    city: 'Varanasi, UP',
    rating: 5,
    comment: 'Pehli baar koi aisa app mila jahan payout bina issue ke milta hai.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Simran Kaur',
    city: 'Ludhiana, PB',
    rating: 5,
    comment: 'Bohot acha laga app, simple design hai aur chalane me easy hai.',
    badge: 'KYC Verified',
  },
  {
    userName: 'Gaurav Bansal',
    city: 'Ahmedabad, GJ',
    rating: 4,
    comment: 'Deposit fast hai aur support bhi acha hai, 4 star meri taraf se.',
    badge: 'Verified Deposit',
  },
  {
    userName: 'Swati Agarwal',
    city: 'Kolkata, WB',
    rating: 5,
    comment: 'UPI pe 100% withdrawal receive hua, sabko recommend karungi!',
    badge: 'Verified Payout',
  },
  {
    userName: 'Harshvardhan Patil',
    city: 'Nashik, MH',
    rating: 5,
    comment: 'Ek number app hai bhai, Slot 777 aur Money Rolling full entertaining hain.',
    badge: 'Regular Player',
  },
  {
    userName: 'Divya Soni',
    city: 'Raipur, CG',
    rating: 5,
    comment: 'Mujhe bohot pasand aaya, roz daily check-in bonus milta hai.',
    badge: 'Verified Member',
  },
  {
    userName: 'Arvind Thakur',
    city: 'Dehradun, UK',
    rating: 4,
    comment: 'Sahi app hai, bank transfer se withdrawal aa gaya bina dikkat ke.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Meenakshi Iyer',
    city: 'Chennai, TN',
    rating: 5,
    comment: 'App bilkul genuine hai, 100% payout milta hai time par.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Pankaj Saxena',
    city: 'Agra, UP',
    rating: 5,
    comment: 'Khelne me maza aata hai aur withdrawal bhi fast aata hai.',
    badge: 'KYC Verified',
  },
  {
    userName: 'Shreya Kapoor',
    city: 'Gurugram, HR',
    rating: 4,
    comment: 'Acha experience raha ab tak, refer & earn feature bohot useful hai.',
    badge: 'Verified Member',
  },
  {
    userName: 'Tarun Rajput',
    city: 'Jodhpur, RJ',
    rating: 5,
    comment: '100% trusted gaming app hai, mujhe ab tak 2 baar withdrawal mil chuka hai.',
    badge: 'Verified Payout',
  },
  {
    userName: 'Komal Shinde',
    city: 'Thane, MH',
    rating: 5,
    comment: 'App bohot acha banaya hai, har transaction ka record clear dikhta hai.',
    badge: 'Verified Deposit',
  },
  {
    userName: 'Vivek Pandey',
    city: 'Prayagraj, UP',
    rating: 4,
    comment: 'Smooth gameplay aur quick QR deposit, overall bohot badhiya app hai.',
    badge: 'Verified Deposit',
  },
  {
    userName: 'Sunita Choudhary',
    city: 'Bikaner, RJ',
    rating: 5,
    comment: 'Mujhe ye app bohot acha laga, withdrawal 100% account me aaya.',
    badge: 'Verified Payout',
  },
];

const EXTRA_REVIEW_FIRST_NAMES = [
  'Aakash', 'Rakesh', 'Pradeep', 'Nitin', 'Hemant', 'Yogesh', 'Lokesh', 'Dinesh',
  'Bhavesh', 'Mayank', 'Ankur', 'Varun', 'Tushar', 'Abhishek', 'Rishabh', 'Kunal',
  'Nidhi', 'Sakshi', 'Aarti', 'Kajal', 'Pallavi', 'Roshni', 'Payal', 'Monika',
];
const EXTRA_REVIEW_LAST_NAMES = [
  'Verma', 'Sharma', 'Patel', 'Singh', 'Joshi', 'Gupta', 'Yadav', 'Mehta',
  'Tiwari', 'Chauhan', 'Nair', 'Patil', 'Rathore', 'Soni', 'Mishra', 'Bansal',
];
const EXTRA_REVIEW_CITIES = [
  'Mumbai, MH', 'Delhi NCR', 'Pune, MH', 'Jaipur, RJ', 'Surat, GJ',
  'Lucknow, UP', 'Indore, MP', 'Bengaluru, KA', 'Ahmedabad, GJ', 'Bhopal, MP',
  'Chandigarh', 'Nagpur, MH', 'Noida, UP', 'Patna, BR', 'Kochi, KL',
];
const EXTRA_REVIEW_OPENERS = [
  'App bohot acha hai,',
  'Mujhe bohot acha laga ye app,',
  'Bhai ekdum genuine app hai,',
  'Kafi badiya app hai,',
  'Dil khush ho gaya is app se,',
  'Mast gaming app hai,',
  'Super trusted app hai,',
  'Sach me kamaal ka app hai,',
];
const EXTRA_REVIEW_CLOSERS = [
  'mujhe 100% withdrawal mila UPI me.',
  'withdrawal seedha PhonePe pe aa gaya.',
  'deposit aur payout dono super fast hain.',
  'games bilkul smooth aur bina lag chalte hain.',
  'GPay pe 100% payment receive ho gaya.',
  'daily bonus aur referral reward dono milte hain.',
  'KYC ke baad turant payout mil gaya.',
  'Wallet record clear hai aur withdrawal 100% milta hai.',
  'Aviator, Mines aur Wheel khelne me full maza aata hai.',
  'ab tak koi problem nahi aayi, full trusted hai.',
];
const EXTRA_REVIEW_BADGES = [
  'Verified Payout',
  'Verified Member',
  'KYC Verified',
  'Verified Deposit',
  'Regular Player',
];

function buildDynamicUniqueReview(
  sequenceIndex: number,
  usedComments: Set<string>
): { userName: string; city: string; rating: number; comment: string; badge: string } {
  const rating = [2, 5, 8].includes(sequenceIndex % 10) ? 4 : 5;
  const first = EXTRA_REVIEW_FIRST_NAMES[sequenceIndex % EXTRA_REVIEW_FIRST_NAMES.length];
  const last =
    EXTRA_REVIEW_LAST_NAMES[
      Math.floor(sequenceIndex / EXTRA_REVIEW_FIRST_NAMES.length + sequenceIndex * 3) %
        EXTRA_REVIEW_LAST_NAMES.length
    ];
  const city = EXTRA_REVIEW_CITIES[(sequenceIndex * 5) % EXTRA_REVIEW_CITIES.length];
  const badge = EXTRA_REVIEW_BADGES[sequenceIndex % EXTRA_REVIEW_BADGES.length];

  // Try unique opener + closer combinations without ever repeating a prior comment
  for (let offset = 0; offset < EXTRA_REVIEW_OPENERS.length * EXTRA_REVIEW_CLOSERS.length; offset++) {
    const idx = sequenceIndex + offset;
    const opener = EXTRA_REVIEW_OPENERS[idx % EXTRA_REVIEW_OPENERS.length];
    const closer =
      EXTRA_REVIEW_CLOSERS[
        Math.floor(idx / EXTRA_REVIEW_OPENERS.length + offset) % EXTRA_REVIEW_CLOSERS.length
      ];
    const candidate = `${opener} ${closer}`;
    if (!usedComments.has(candidate.toLowerCase())) {
      return { userName: `${first} ${last}`, city, rating, comment: candidate, badge };
    }
  }

  const fallbackComment = `App bohot pasand aaya, ${city.split(',')[0]} se khel raha hoon — 100% genuine payout (#${sequenceIndex + 1}).`;
  return { userName: `${first} ${last}`, city, rating, comment: fallbackComment, badge };
}

function buildStarterShowcaseReviews(nowMs: number): ReviewItem[] {
  const starterCount = 10; // 7 five-star + 3 four-star = exact 4.7 average
  return SCHEDULED_REVIEW_POOL.slice(0, starterCount)
    .map((tpl, idx) => {
      const ts = new Date(nowMs - (starterCount - idx) * REVIEW_INTERVAL_MS).toISOString();
      return {
        id: `REV-SHW-${String(idx + 1).padStart(3, '0')}`,
        userId: `GR-SHOWCASE-${idx + 1}`,
        userName: tpl.userName,
        city: tpl.city,
        badge: tpl.badge,
        rating: tpl.rating,
        comment: tpl.comment,
        isPromotional: false,
        isScheduledShowcase: true,
        reportedBy: [],
        createdAt: ts,
        updatedAt: ts,
      };
    })
    .reverse();
}

const SCHEMA_VERSION = 2;
const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'gamereward-db.json');

export const PROHIBITED_STATES = [
  'Andhra Pradesh',
  'Assam',
  'Nagaland',
  'Odisha',
  'Sikkim',
  'Telangana',
];

export const MIN_WITHDRAWAL_LIMIT = 5000;

export const DAILY_BONUS_LADDER: number[] = [
  2, 4, 6, 10, 15, 20, 25, 32, 40, 50,
  58, 66, 75, 85, 95, 105, 115, 125, 135, 150,
  165, 180, 195, 210, 225, 240, 255, 270, 285, 300,
];

export const WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET || 'gr_whsec_local_dev_verify_9f8e7d6c';
export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'gr_sess_secret_local_dev_2a3b4c5d';
export const ADMIN_2FA_CODE = process.env.ADMIN_2FA_CODE || '246810';

export const FIRST_DEPOSIT_TIERS: DepositTier[] = [
  { amount: 100, bonusPercent: 40, bonusAmount: 40, totalValue: 140, totalPercentLabel: '+140%' },
  { amount: 200, bonusPercent: 40, bonusAmount: 80, totalValue: 280, totalPercentLabel: '+140%' },
  { amount: 300, bonusPercent: 40, bonusAmount: 120, totalValue: 420, totalPercentLabel: '+140%' },
  { amount: 500, bonusPercent: 65, bonusAmount: 325, totalValue: 825, totalPercentLabel: '+165%' },
  { amount: 1000, bonusPercent: 60, bonusAmount: 600, totalValue: 1600, totalPercentLabel: '+160%' },
  { amount: 2000, bonusPercent: 55, bonusAmount: 1100, totalValue: 3100, totalPercentLabel: '+155%' },
  { amount: 3000, bonusPercent: 50, bonusAmount: 1500, totalValue: 4500, totalPercentLabel: '+150%' },
  { amount: 5000, bonusPercent: 45, bonusAmount: 2250, totalValue: 7250, totalPercentLabel: '+145%' },
  { amount: 10000, bonusPercent: 40, bonusAmount: 4000, totalValue: 14000, totalPercentLabel: '+140%' },
  { amount: 20000, bonusPercent: 35, bonusAmount: 7000, totalValue: 27000, totalPercentLabel: '+135%' },
];

export const RELOAD_DEPOSIT_TIERS: DepositTier[] = [
  { amount: 100, bonusPercent: 10, bonusAmount: 10, totalValue: 110, totalPercentLabel: '+110%' },
  { amount: 200, bonusPercent: 12, bonusAmount: 24, totalValue: 224, totalPercentLabel: '+112%' },
  { amount: 300, bonusPercent: 15, bonusAmount: 45, totalValue: 345, totalPercentLabel: '+115%' },
  { amount: 500, bonusPercent: 15, bonusAmount: 75, totalValue: 575, totalPercentLabel: '+115%' },
  { amount: 1000, bonusPercent: 18, bonusAmount: 180, totalValue: 1180, totalPercentLabel: '+118%' },
  { amount: 2000, bonusPercent: 20, bonusAmount: 400, totalValue: 2400, totalPercentLabel: '+120%' },
  { amount: 3000, bonusPercent: 20, bonusAmount: 600, totalValue: 3600, totalPercentLabel: '+120%' },
  { amount: 5000, bonusPercent: 22, bonusAmount: 1100, totalValue: 6100, totalPercentLabel: '+122%' },
  { amount: 10000, bonusPercent: 25, bonusAmount: 2500, totalValue: 12500, totalPercentLabel: '+125%' },
  { amount: 20000, bonusPercent: 25, bonusAmount: 5000, totalValue: 25000, totalPercentLabel: '+125%' },
];

export function computeDepositBonusForAmount(
  amount: number,
  isFirstOfferAvailable: boolean
): { bonusAmount: number; bonusPercent: number; totalValue: number } {
  const tiers = isFirstOfferAvailable ? FIRST_DEPOSIT_TIERS : RELOAD_DEPOSIT_TIERS;
  const exact = tiers.find((t) => t.amount === amount);
  if (exact) {
    return {
      bonusAmount: exact.bonusAmount,
      bonusPercent: exact.bonusPercent,
      totalValue: exact.totalValue,
    };
  }
  // For custom amounts, apply the nearest lower tier's percentage
  const sorted = [...tiers].sort((a, b) => b.amount - a.amount);
  const matched = sorted.find((t) => amount >= t.amount) || tiers[0];
  const bonusAmount = Math.round((amount * matched.bonusPercent) / 100);
  return {
    bonusAmount,
    bonusPercent: matched.bonusPercent,
    totalValue: amount + bonusAmount,
  };
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function createId(prefix: string): string {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${ts}${rand}`;
}

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function verifyWebhookSignature(payloadString: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payloadString)
    .digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function signWebhookPayload(payloadString: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex');
}

const FEATURED_ARCADE_GAMES: GameItem[] = [
  {
    id: 'GM-MONEY-ROLLING',
    name: 'Money Rolling',
    category: 'Slots',
    engine: 'money_rolling',
    thumbnail: '/assets/aistudio/Screenshot_20261119-163122.777CCZ.COM_7bec12cc.png',
    difficulty: 'Easy',
    instructions:
      'Spin the 3 classic reels + multiplier reel. Unlock x2 (Bet 1) and x5 (Bet 5) bars, and trigger the top chained Prize Wheel (500 / 2,500 / 10,000)!',
    rewardRuleText: '3-reel slot + Half-Circle Bonus Wheel up to 10,000 · Auto & Turbo spin.',
    entryFeeOptions: [1, 5, 10, 25, 50, 100],
    winMultiplier: 5.0,
    minWinRatio: 50,
    maxWinRatio: 60,
    isTournament: true,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  },
  {
    id: 'GM-HOT-VOLCANO',
    name: 'Hot Volcano Bonus Buy',
    category: 'Slots',
    engine: 'hot_volcano',
    thumbnail: '/assets/aistudio/Screenshot_20261119-163014.777CCZ.COM_6e488a7d.png',
    difficulty: 'Medium',
    instructions:
      'Match 3 fiery fruits across the 3×3 volcano cabinet paylines. Land 3 FREE SPINS scatters or tap BONUS BUY for 10 Free Spins with x7 multiplier!',
    rewardRuleText: '3×3 Fiery Fruit Slot · Wild x500 · Bonus Buy 10 Free Spins with x7.',
    entryFeeOptions: [2, 6, 10, 20, 50, 100],
    winMultiplier: 15.0,
    minWinRatio: 50,
    maxWinRatio: 60,
    isTournament: true,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  },
  {
    id: 'GM-AVIATOR-PRO',
    name: 'Aviator Pro',
    category: 'Casino',
    engine: 'aviator',
    thumbnail: '/assets/aistudio/Screenshot_20261119-162534.777CCZ.COM_ef93a099.png',
    difficulty: 'Medium',
    instructions:
      'Place 1 or 2 independent bets before takeoff. Watch the red plane climb and tap Cashout before it flies away to lock Bet × Multiplier!',
    rewardRuleText: 'Dual Bet & Auto-Cashout Panels · Live Multiplier Curve from 1.00x.',
    entryFeeOptions: [1, 10, 50, 100, 250, 500],
    winMultiplier: 4.8,
    minWinRatio: 50,
    maxWinRatio: 60,
    isTournament: true,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  },
  {
    id: 'GM-MINES-PRO',
    name: 'Mines',
    category: 'Luck',
    engine: 'mines_grid',
    thumbnail: '/assets/aistudio/Screenshot_20261119-162125.777CCZ.COM_b90c0421.png',
    difficulty: 'Easy',
    instructions:
      'Choose 1–24 mines, hit Start, and tap tiles on the 5×5 grid to uncover gold star coins. Cashout anytime before hitting a bomb!',
    rewardRuleText: '5×5 Grid Strategy · Escalating Multipliers (1.26x, 1.45x, 1.68x+) · Instant Cashout.',
    entryFeeOptions: [1, 5, 10, 25, 50, 100],
    winMultiplier: 3.5,
    minWinRatio: 50,
    maxWinRatio: 60,
    isTournament: false,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  },
  {
    id: 'GM-TWIST-WHEEL',
    name: 'Twist / Symbol Wheel',
    category: 'Casino',
    engine: 'twist',
    thumbnail: '/assets/aistudio/Screenshot_20261119-161541.777CCZ.COM_fbeed72a.png',
    difficulty: 'Medium',
    instructions:
      'Spin to light up segments across the 3 concentric rings (1.55x up to 200x & BONUS). Tap PART CASHOUT or CASHOUT before landing on a reset!',
    rewardRuleText: '3 Concentric Rings (Elemental & Symbol Themes) · Hold to Autoplay · Part Cashout.',
    entryFeeOptions: [2, 4, 10, 20, 50, 100],
    winMultiplier: 10.0,
    minWinRatio: 50,
    maxWinRatio: 60,
    isTournament: true,
    active: true,
    totalPlays: 0,
    totalRewardsPaid: 0,
  },
];

function createInitialData(): DatabaseSchema {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400 * 1000).toISOString();

  const demoPass = hashPassword('Demo@1234');
  const adminPass = hashPassword('Admin@2026');

  const demoUser: StoredUser = {
    id: 'GR-USR-1001',
    name: 'Rahul Sharma',
    mobile: '9876543210',
    email: 'rahul.sharma@example.com',
    state: 'Maharashtra',
    role: 'user',
    status: 'active',
    kycStatus: 'verified',
    kycSubmittedAt: hoursAgo(72),
    kycDocumentType: 'PAN Card',
    kycDocumentLast4: '4821',
    referralCode: 'RAHUL100',
    welcomeBonusClaimed: true,
    welcomeBonusExpiresAt: daysFromNow(27),
    firstDepositOfferUsed: false,
    dailyStreak: 4,
    lastCheckInDate: undefined,
    paymentMethods: [
      {
        id: 'PM-01',
        type: 'upi',
        label: 'Primary UPI',
        upiId: 'rahul.sharma@okaxis',
        createdAt: hoursAgo(70),
      },
      {
        id: 'PM-02',
        type: 'bank',
        label: 'HDFC Savings',
        accountHolderName: 'Rahul Sharma',
        accountNumber: '50100293847561',
        accountNumberMasked: 'XXXXXX7561',
        ifscCode: 'HDFC0001245',
        createdAt: hoursAgo(68),
      },
    ],
    passwordHash: demoPass.hash,
    passwordSalt: demoPass.salt,
    deviceFingerprints: ['dev-seed-1001'],
    createdAt: hoursAgo(96),
  };

  const adminUser: StoredUser = {
    id: 'GR-ADM-0001',
    name: 'Platform Owner',
    mobile: '9000000001',
    email: 'owner@gamereward.local',
    state: 'Karnataka',
    role: 'admin',
    status: 'active',
    kycStatus: 'verified',
    referralCode: 'OWNER01',
    welcomeBonusClaimed: false,
    firstDepositOfferUsed: false,
    dailyStreak: 0,
    paymentMethods: [],
    passwordHash: adminPass.hash,
    passwordSalt: adminPass.salt,
    deviceFingerprints: ['admin-console'],
    createdAt: hoursAgo(240),
  };

  // Strictly Casino & Luck-Based Games with Entry Fee Tiers & 50–60% Server RNG Win Ratio
  const games: GameItem[] = [
    ...FEATURED_ARCADE_GAMES.map((g) => ({ ...g })),
    {
      id: 'GM-WHEEL',
      name: 'Lucky Spin Wheel',
      category: 'Casino',
      engine: 'wheel',
      thumbnail: '/src/assets/images/casino_spin_wheel_1795010267797.jpg',
      difficulty: 'Easy',
      instructions:
        'Select your entry fee (₹10 to ₹500), choose your lucky color segment (Sapphire or Gold), and spin the wheel.',
      rewardRuleText:
        'Entry fee ₹10 wins ₹30 (3.0×). Higher entry fees scale winnings proportionally. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 3.0,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: false,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
    {
      id: 'GM-DICE',
      name: 'Dice Roll Duel',
      category: 'Dice',
      engine: 'dice',
      thumbnail: '/src/assets/images/casino_dice_duel_1795010267327.jpg',
      difficulty: 'Easy',
      instructions:
        'Pick your entry fee and predict whether the two rolled dice will land Low (2–6) or High (7–12).',
      rewardRuleText:
        'Entry fee ₹10 wins ₹22 (2.2×). Win prize grows linearly with entry fee. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 2.2,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: false,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
    {
      id: 'GM-COIN',
      name: 'Coin Flip Royale',
      category: 'Luck',
      engine: 'coin',
      thumbnail: '/src/assets/images/casino_coin_flip_1795010266946.jpg',
      difficulty: 'Easy',
      instructions:
        'Choose Heads or Tails, lock your entry fee, and flip the golden casino coin for an instant result.',
      rewardRuleText:
        'Entry fee ₹10 wins ₹19 (1.9×). Higher entry tiers unlock higher instant payouts. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 1.9,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: false,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
    {
      id: 'GM-CARDS',
      name: 'Lucky 7 Cards',
      category: 'Cards',
      engine: 'cards',
      thumbnail: '/src/assets/images/casino_lucky_cards_1795010267201.jpg',
      difficulty: 'Medium',
      instructions:
        'Select your entry fee and call whether the drawn royal card is Low (2–7) or High (8–Ace).',
      rewardRuleText:
        'Entry fee ₹10 wins ₹25 (2.5×). Payout scales directly with entry amount. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 2.5,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: false,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
    {
      id: 'GM-MINES',
      name: 'Treasure Mines',
      category: 'Luck',
      engine: 'mines',
      thumbnail: '/src/assets/images/casino_treasure_mines_1795010268436.jpg',
      difficulty: 'Medium',
      instructions:
        'Set your entry fee and tap a mystery chest on the 3×3 vault grid to uncover gems and avoid hidden mines.',
      rewardRuleText:
        'Entry fee ₹10 wins ₹28 (2.8×). Higher entry stakes yield proportionally larger rewards. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 2.8,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: false,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
    {
      id: 'GM-SLOTS',
      name: 'Slot Jackpot 777',
      category: 'Slots',
      engine: 'slots',
      thumbnail: '/src/assets/images/casino_slot_777_1795010268434.jpg',
      difficulty: 'Easy',
      instructions:
        'Choose your entry fee and pull the lever to spin all 3 sapphire-and-gold reels for a winning match.',
      rewardRuleText:
        'Entry fee ₹10 wins ₹30 (3.0×). Entry ₹100 wins ₹300. Server win ratio: 50%–60% random.',
      entryFeeOptions: [10, 20, 50, 100, 250, 500],
      winMultiplier: 3.0,
      minWinRatio: 50,
      maxWinRatio: 60,
      isTournament: true,
      active: true,
      totalPlays: 0,
      totalRewardsPaid: 0,
    },
  ];

  const transactions: LedgerTransaction[] = [
    {
      id: 'TXN-SEED1001',
      userId: 'GR-USR-1001',
      type: 'welcome_bonus',
      bucket: 'bonus',
      amount: 100,
      status: 'Credited',
      title: 'Welcome Bonus Credited',
      description: 'New verified account welcome bonus (non-withdrawable; valid 30 days)',
      createdAt: hoursAgo(48),
    },
    {
      id: 'TXN-SEED1002',
      userId: 'GR-USR-1001',
      type: 'deposit',
      bucket: 'available',
      amount: 250,
      status: 'Successful',
      title: 'Initial Test Balance',
      description: 'Available play & withdrawal balance for testing',
      createdAt: hoursAgo(24),
    },
  ];

  const deposits: DepositRecord[] = [];
  const withdrawals: WithdrawalRecord[] = [];
  const gameSessions: GameSessionRecord[] = [];

  const notifications: NotificationItem[] = [
    {
      id: 'NTF-SEED01',
      userId: 'GR-USR-1001',
      category: 'bonus',
      title: 'Welcome Bonus Received',
      message: '₹100 welcome bonus has been credited to your Bonus Balance. Valid for 30 days.',
      read: false,
      createdAt: hoursAgo(48),
    },
    {
      id: 'NTF-SEED02',
      userId: 'GR-USR-1001',
      category: 'promo',
      title: 'First Deposit Offer Active',
      message: 'Get up to +70% extra Deposit Bonus on your first deposit starting from ₹100!',
      read: false,
      createdAt: hoursAgo(12),
    },
  ];

  const bonusCampaigns: BonusCampaign[] = [
    {
      id: 'CMP-FIRSTDEP',
      title: 'First Deposit Tiered Bonus (Up to +70%)',
      description: 'Deposit ₹100–₹20,000 and receive tiered bonus credits directly on gateway verification.',
      type: 'promo',
      rewardAmount: 210,
      eligibilityRules: 'Limited to 1 First Deposit Offer per account. Bonus credited to Bonus Balance.',
      expiryDays: 30,
      active: true,
      totalClaimedCount: 0,
      totalDistributedAmount: 0,
    },
    {
      id: 'CMP-WELCOME',
      title: '₹100 New User Welcome Bonus',
      description: 'Credited once to newly verified mobile accounts into the separate Bonus Balance.',
      type: 'welcome',
      rewardAmount: 100,
      eligibilityRules: 'One claim per unique mobile number and device. Expires in 30 days.',
      expiryDays: 30,
      active: true,
      totalClaimedCount: 1,
      totalDistributedAmount: 100,
    },
    {
      id: 'CMP-STREAK',
      title: 'Daily Check-In Streak Bonus',
      description: 'Check in once every 24 hours to earn ₹15–₹35 in Bonus Balance.',
      type: 'daily_streak',
      rewardAmount: 20,
      eligibilityRules: 'Available once per calendar day for active accounts.',
      expiryDays: 14,
      active: true,
      totalClaimedCount: 4,
      totalDistributedAmount: 80,
    },
    {
      id: 'CMP-REFERRAL',
      title: 'Refer a Friend Program',
      description: 'Share your referral code. Receive ₹50 Bonus Balance when a friend verifies.',
      type: 'referral',
      rewardAmount: 50,
      eligibilityRules: 'Valid only for new unique mobile registrations.',
      expiryDays: 30,
      active: true,
      totalClaimedCount: 0,
      totalDistributedAmount: 0,
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'AUD-SEED01',
      actorId: 'SYSTEM',
      actorRole: 'system',
      action: 'LEDGER_INITIALIZED',
      details: 'Initialized Casino & Luck lobby (50-60% RNG), tiered Deposit Bonus system, and test account GR-USR-1001.',
      createdAt: hoursAgo(48),
    },
  ];

  const initialReviews: ReviewItem[] = buildStarterShowcaseReviews(now.getTime());

  return {
    schemaVersion: SCHEMA_VERSION,
    users: [demoUser, adminUser],
    transactions,
    deposits,
    withdrawals,
    games,
    gameSessions,
    notifications,
    reviews: initialReviews,
    bonusCampaigns,
    auditLogs,
    processedIdempotencyKeys: [],
    welcomeBonusConfig: {
      amount: 100,
      expiryDays: 30,
      enabled: true,
      terms:
        'Credited to Bonus Balance only. Valid for 30 days from credit date. Strictly one welcome bonus per unique mobile number and device.',
    },
    merchantPaymentConfig: {
      upiId: 'gamereward.pay@okaxis',
      merchantName: 'GameReward Official',
      qrImageDataUrl: null,
      instructions: 'Scan QR or pay to our official UPI ID and submit your 12-digit UTR number.',
      updatedAt: now.toISOString(),
    },
    depositPaymentMethods: [
      {
        id: 'DPM-PRIMARY-01',
        label: 'Primary UPI & QR',
        merchantName: 'GameReward Official',
        upiId: 'gamereward.pay@okaxis',
        qrImageDataUrl: null,
        instructions: 'Scan QR or pay to our official UPI ID and submit your 12-digit UTR number.',
        isActive: true,
        isPrimary: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    withdrawalConfig: {
      minWithdrawalLimit: MIN_WITHDRAWAL_LIMIT,
      noticeBannerEnabled: true,
      noticeBannerTitle: 'Withdrawal Notice',
      noticeBannerMessage:
        'Payouts are verified and processed daily. Please ensure your UPI ID or bank IFSC details match your verified KYC account.',
      updatedAt: now.toISOString(),
    },
    individual_user_withdrawal_settings: [],
    authorizedAdminEmails: [
      {
        email: PRIMARY_OWNER_ADMIN_EMAIL,
        addedBy: 'SYSTEM',
        addedAt: now.toISOString(),
        isOwner: true,
      },
    ],
    referral_codes: [
      {
        id: createId('RFC'),
        user_id: demoUser.id,
        referral_code: demoUser.referralCode,
        created_at: demoUser.createdAt,
      },
      {
        id: createId('RFC'),
        user_id: adminUser.id,
        referral_code: adminUser.referralCode,
        created_at: adminUser.createdAt,
      },
    ],
    referral_relationships: [],
    referral_rewards: [],
    referral_settings: {
      signup_bonus: 50,
      referral_percentage: 10,
      minimum_qualifying_deposit: 100,
      promotion_enabled: true,
      updated_at: now.toISOString(),
    },
    appReleaseConfig: {
      enabled: true,
      appName: 'GameReward',
      version: '1.0.0',
      fileName: null,
      storedFileName: null,
      fileSizeBytes: 0,
      mimeType: 'application/vnd.android.package-archive',
      releaseNotes: 'Official Android App — Play games & earn instant rewards.',
      shareMessageTemplate:
        'Ye GameReward app install karo aur signup ke time mera referral code {CODE} use karo!',
      uploadedAt: null,
      uploadedBy: null,
    },
    appAnnouncementConfig: {
      enabled: false,
      title: 'Important Information',
      message: '',
      tone: 'info',
      buttonLabel: 'Got It',
      showMode: 'every_open',
      revision: 1,
      updatedAt: now.toISOString(),
      updatedBy: 'SYSTEM',
    },
    appAnnouncementHistory: [],
    reviewScheduler: {
      lastAutoReviewAt: now.toISOString(),
      nextPoolIndex: 10,
      intervalMs: REVIEW_INTERVAL_MS,
      reviewPoolVersion: REVIEW_POOL_VERSION,
      usedReviewComments: initialReviews.map((r) => r.comment.toLowerCase()),
    },
  };
}

class Store {
  public data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (parsed.schemaVersion === SCHEMA_VERSION) {
          let dirty = false;
          if (!parsed.merchantPaymentConfig) {
            parsed.merchantPaymentConfig = {
              upiId: 'gamereward.pay@okaxis',
              merchantName: 'GameReward Official',
              qrImageDataUrl: null,
              instructions:
                'Scan QR or pay to our official UPI ID and submit your 12-digit UTR number.',
              updatedAt: new Date().toISOString(),
            };
            dirty = true;
          }
          if (!Array.isArray(parsed.depositPaymentMethods) || parsed.depositPaymentMethods.length === 0) {
            const nowStr = parsed.merchantPaymentConfig.updatedAt || new Date().toISOString();
            parsed.depositPaymentMethods = [
              {
                id: 'DPM-PRIMARY-01',
                label: 'Primary UPI & QR',
                merchantName: parsed.merchantPaymentConfig.merchantName || 'GameReward Official',
                upiId: parsed.merchantPaymentConfig.upiId || 'gamereward.pay@okaxis',
                qrImageDataUrl: parsed.merchantPaymentConfig.qrImageDataUrl ?? null,
                instructions:
                  parsed.merchantPaymentConfig.instructions ||
                  'Scan QR or pay to our official UPI ID and submit your 12-digit UTR number.',
                isActive: true,
                isPrimary: true,
                createdAt: nowStr,
                updatedAt: nowStr,
              },
            ];
            dirty = true;
          }
          if (!parsed.withdrawalConfig) {
            parsed.withdrawalConfig = {
              minWithdrawalLimit: MIN_WITHDRAWAL_LIMIT,
              noticeBannerEnabled: true,
              noticeBannerTitle: 'Withdrawal Notice',
              noticeBannerMessage:
                'Payouts are verified and processed daily. Please ensure your UPI ID or bank IFSC details match your verified KYC account.',
              updatedAt: new Date().toISOString(),
            };
            dirty = true;
          } else {
            if (typeof parsed.withdrawalConfig.noticeBannerEnabled !== 'boolean') {
              parsed.withdrawalConfig.noticeBannerEnabled = true;
              dirty = true;
            }
            if (typeof parsed.withdrawalConfig.noticeBannerTitle !== 'string') {
              parsed.withdrawalConfig.noticeBannerTitle = 'Withdrawal Notice';
              dirty = true;
            }
            if (typeof parsed.withdrawalConfig.noticeBannerMessage !== 'string') {
              parsed.withdrawalConfig.noticeBannerMessage =
                'Payouts are verified and processed daily. Please ensure your UPI ID or bank IFSC details match your verified KYC account.';
              dirty = true;
            }
          }
          if (!Array.isArray(parsed.individual_user_withdrawal_settings)) {
            parsed.individual_user_withdrawal_settings = [];
            dirty = true;
          }
          if (!Array.isArray(parsed.authorizedAdminEmails)) {
            parsed.authorizedAdminEmails = [
              {
                email: PRIMARY_OWNER_ADMIN_EMAIL,
                addedBy: 'SYSTEM',
                addedAt: new Date().toISOString(),
                isOwner: true,
              },
            ];
            dirty = true;
          } else {
            const hasPrimaryOwner = parsed.authorizedAdminEmails.some(
              (entry) => entry.email.trim().toLowerCase() === PRIMARY_OWNER_ADMIN_EMAIL
            );
            if (!hasPrimaryOwner) {
              parsed.authorizedAdminEmails.unshift({
                email: PRIMARY_OWNER_ADMIN_EMAIL,
                addedBy: 'SYSTEM',
                addedAt: new Date().toISOString(),
                isOwner: true,
              });
              dirty = true;
            }
          }
          // Sync user roles with authorizedAdminEmails
          if (Array.isArray(parsed.users)) {
            const adminSet = new Set(
              parsed.authorizedAdminEmails.map((e) => e.email.trim().toLowerCase())
            );
            for (const u of parsed.users) {
              const shouldBeAdmin =
                u.id === 'GR-ADM-0001' || adminSet.has((u.email || '').trim().toLowerCase());
              const nextRole = shouldBeAdmin ? 'admin' : 'user';
              if (u.role !== nextRole) {
                u.role = nextRole;
                dirty = true;
              }
            }
          }
          if (!Array.isArray(parsed.referral_codes)) {
            parsed.referral_codes = [];
            dirty = true;
          }
          if (!Array.isArray(parsed.referral_relationships)) {
            parsed.referral_relationships = [];
            dirty = true;
          }
          if (!Array.isArray(parsed.referral_rewards)) {
            parsed.referral_rewards = [];
            dirty = true;
          }
          if (!parsed.referral_settings || typeof parsed.referral_settings !== 'object') {
            parsed.referral_settings = {
              signup_bonus: 50,
              referral_percentage: 10,
              minimum_qualifying_deposit: 100,
              promotion_enabled: true,
              updated_at: new Date().toISOString(),
            };
            dirty = true;
          } else {
            if (typeof parsed.referral_settings.signup_bonus !== 'number') {
              parsed.referral_settings.signup_bonus = 50;
              dirty = true;
            }
            if (typeof parsed.referral_settings.referral_percentage !== 'number') {
              parsed.referral_settings.referral_percentage = 10;
              dirty = true;
            }
            if (typeof parsed.referral_settings.minimum_qualifying_deposit !== 'number') {
              parsed.referral_settings.minimum_qualifying_deposit = 100;
              dirty = true;
            }
            if (typeof parsed.referral_settings.promotion_enabled !== 'boolean') {
              parsed.referral_settings.promotion_enabled = true;
              dirty = true;
            }
            if (!parsed.referral_settings.updated_at) {
              parsed.referral_settings.updated_at = new Date().toISOString();
              dirty = true;
            }
          }
          // Backfill referral_codes for all existing users
          if (Array.isArray(parsed.users)) {
            const existingCodeUserIds = new Set(parsed.referral_codes.map((c) => c.user_id));
            const usedCodes = new Set(
              parsed.referral_codes.map((c) => c.referral_code.toUpperCase())
            );
            for (const u of parsed.users) {
              if (!existingCodeUserIds.has(u.id)) {
                let code = String(u.referralCode || '')
                  .trim()
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '');
                if (!code || usedCodes.has(code)) {
                  const base =
                    (u.name || 'USER')
                      .replace(/[^A-Za-z]/g, '')
                      .slice(0, 5)
                      .toUpperCase() || 'USER';
                  do {
                    code = `${base}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
                  } while (usedCodes.has(code));
                }
                u.referralCode = code;
                usedCodes.add(code);
                existingCodeUserIds.add(u.id);
                parsed.referral_codes.push({
                  id: createId('RFC'),
                  user_id: u.id,
                  referral_code: code,
                  created_at: u.createdAt || new Date().toISOString(),
                });
                dirty = true;
              }
            }
          }
          if (!parsed.appReleaseConfig || typeof parsed.appReleaseConfig !== 'object') {
            parsed.appReleaseConfig = {
              enabled: true,
              appName: 'GameReward',
              version: '1.0.0',
              fileName: null,
              storedFileName: null,
              fileSizeBytes: 0,
              mimeType: 'application/vnd.android.package-archive',
              releaseNotes: 'Official Android App — Play games & earn instant rewards.',
              shareMessageTemplate:
                'Ye GameReward app install karo aur signup ke time mera referral code {CODE} use karo!',
              uploadedAt: null,
              uploadedBy: null,
            };
            dirty = true;
          }
          if (!parsed.appAnnouncementConfig || typeof parsed.appAnnouncementConfig !== 'object') {
            parsed.appAnnouncementConfig = {
              enabled: false,
              title: 'Important Information',
              message: '',
              tone: 'info',
              buttonLabel: 'Got It',
              showMode: 'every_open',
              revision: 1,
              updatedAt: new Date().toISOString(),
              updatedBy: 'SYSTEM',
            };
            dirty = true;
          }
          if (!Array.isArray(parsed.appAnnouncementHistory)) {
            parsed.appAnnouncementHistory = [];
            dirty = true;
          }
          if (!parsed.reviewScheduler || (parsed.reviewScheduler.reviewPoolVersion ?? 0) < REVIEW_POOL_VERSION) {
            const nowMs = Date.now();
            const userSubmitted = Array.isArray(parsed.reviews)
              ? parsed.reviews.filter((r) => !r.isScheduledShowcase)
              : [];
            const freshShowcase = buildStarterShowcaseReviews(nowMs);
            parsed.reviews = [...userSubmitted, ...freshShowcase].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            parsed.reviewScheduler = {
              lastAutoReviewAt: new Date(nowMs).toISOString(),
              nextPoolIndex: 10,
              intervalMs: REVIEW_INTERVAL_MS,
              reviewPoolVersion: REVIEW_POOL_VERSION,
              usedReviewComments: freshShowcase.map((r) => r.comment.toLowerCase()),
            };
            dirty = true;
          } else if (!Array.isArray(parsed.reviews) || parsed.reviews.length === 0) {
            const nowMs = Date.now();
            const freshShowcase = buildStarterShowcaseReviews(nowMs);
            parsed.reviews = freshShowcase;
            parsed.reviewScheduler.nextPoolIndex = 10;
            parsed.reviewScheduler.lastAutoReviewAt = new Date(nowMs).toISOString();
            parsed.reviewScheduler.usedReviewComments = freshShowcase.map((r) =>
              r.comment.toLowerCase()
            );
            dirty = true;
          }
          const existingIds = new Set((parsed.games || []).map((g) => g.id));
          const missingFeatured = FEATURED_ARCADE_GAMES.filter((g) => !existingIds.has(g.id)).map(
            (g) => ({ ...g })
          );
          if (missingFeatured.length > 0) {
            parsed.games = [...missingFeatured, ...(parsed.games || [])];
            dirty = true;
          }
          if (dirty) {
            this.save(parsed);
          }
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load DB file, reinitializing:', err);
    }
    const initial = createInitialData();
    this.save(initial);
    return initial;
  }

  public syncScheduledReviews(): { nextReviewAt: string } {
    if (!this.data.reviewScheduler) {
      this.data.reviewScheduler = {
        lastAutoReviewAt: new Date().toISOString(),
        nextPoolIndex: 10,
        intervalMs: REVIEW_INTERVAL_MS,
        reviewPoolVersion: REVIEW_POOL_VERSION,
        usedReviewComments: this.data.reviews.map((r) => r.comment.toLowerCase()),
      };
    }

    const sched = this.data.reviewScheduler;
    const interval = sched.intervalMs || REVIEW_INTERVAL_MS;
    const nowMs = Date.now();
    const lastMs = new Date(sched.lastAutoReviewAt || nowMs).getTime();
    const elapsed = nowMs - lastMs;

    if (Number.isFinite(lastMs) && elapsed >= interval) {
      const stepsDue = Math.min(3, Math.floor(elapsed / interval));
      const usedSet = new Set<string>([
        ...(sched.usedReviewComments || []).map((c) => c.toLowerCase()),
        ...(this.data.reviews || []).map((r) => r.comment.toLowerCase()),
      ]);

      let added = 0;
      for (let i = 1; i <= stepsDue; i++) {
        let candidate: {
          userName: string;
          city: string;
          rating: number;
          comment: string;
          badge: string;
        } | null = null;

        // First draw unused curated Hinglish reviews from SCHEDULED_REVIEW_POOL
        while (sched.nextPoolIndex < SCHEDULED_REVIEW_POOL.length) {
          const item = SCHEDULED_REVIEW_POOL[sched.nextPoolIndex];
          sched.nextPoolIndex += 1;
          if (!usedSet.has(item.comment.toLowerCase())) {
            candidate = item;
            break;
          }
        }

        // Once curated pool is exhausted, generate fresh non-repeating Hinglish reviews
        if (!candidate) {
          const dynamicIdx = sched.nextPoolIndex - SCHEDULED_REVIEW_POOL.length;
          candidate = buildDynamicUniqueReview(dynamicIdx, usedSet);
          sched.nextPoolIndex += 1;
        }

        const reviewTimeIso = new Date(
          Math.min(nowMs, lastMs + i * interval)
        ).toISOString();

        const newReview: ReviewItem = {
          id: createId('REV'),
          userId: `GR-SHOWCASE-${sched.nextPoolIndex}`,
          userName: candidate.userName,
          city: candidate.city,
          badge: candidate.badge,
          rating: candidate.rating,
          comment: candidate.comment,
          isPromotional: false,
          isScheduledShowcase: true,
          reportedBy: [],
          createdAt: reviewTimeIso,
          updatedAt: reviewTimeIso,
        };

        this.data.reviews.unshift(newReview);
        usedSet.add(candidate.comment.toLowerCase());
        added += 1;
      }

      if (added > 0) {
        sched.lastAutoReviewAt = new Date(nowMs).toISOString();
        sched.usedReviewComments = Array.from(usedSet).slice(-500);
        // Keep feed crisp: preserve all real user reviews + latest 60 showcase reviews
        const realReviews = this.data.reviews.filter((r) => !r.isScheduledShowcase);
        const showcaseReviews = this.data.reviews
          .filter((r) => r.isScheduledShowcase)
          .slice(0, 60);
        this.data.reviews = [...realReviews, ...showcaseReviews].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.save();
      }
    }

    const updatedLastMs = new Date(sched.lastAutoReviewAt || nowMs).getTime();
    return { nextReviewAt: new Date(updatedLastMs + interval).toISOString() };
  }

  public save(nextData?: DatabaseSchema): void {
    const target = nextData || this.data;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(target, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  }

  public isAuthorizedAdminEmail(email?: string): boolean {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;
    return (this.data.authorizedAdminEmails || []).some(
      (entry) => entry.email.trim().toLowerCase() === normalized
    );
  }

  public isAdminUser(user?: Pick<StoredUser, 'id' | 'email'> | null): boolean {
    if (!user) return false;
    return user.id === 'GR-ADM-0001' || this.isAuthorizedAdminEmail(user.email);
  }

  public sanitizeUser(u: StoredUser): UserProfile {
    const { passwordHash: _ph, passwordSalt: _ps, deviceFingerprints: _df, ...safe } = u;
    return {
      ...safe,
      role: this.isAdminUser(u) ? 'admin' : 'user',
    };
  }

  public computeWallet(userId: string): WalletSummary {
    const userTxns = this.data.transactions.filter((t) => t.userId === userId);
    let availableBalance = 0;
    let bonusBalance = 0;
    let totalEarnings = 0;
    let totalDeposits = 0;
    let earnedToday = 0;

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const txn of userTxns) {
      if (txn.bucket === 'available') {
        availableBalance += txn.amount;
      } else {
        bonusBalance += txn.amount;
      }
      if (txn.type === 'game_reward' && txn.amount > 0) {
        totalEarnings += txn.amount;
        if (txn.createdAt.slice(0, 10) === todayStr) {
          earnedToday += txn.amount;
        }
      }
      if (txn.type === 'deposit' && txn.amount > 0) {
        totalDeposits += txn.amount;
      }
    }

    const totalWithdrawals = this.data.withdrawals
      .filter((w) => w.userId === userId && w.status === 'Completed')
      .reduce((acc, w) => acc + w.amount, 0);

    availableBalance = Math.max(0, Math.round(availableBalance * 100) / 100);
    bonusBalance = Math.max(0, Math.round(bonusBalance * 100) / 100);

    const effectiveWithdrawal = this.getEffectiveWithdrawalSettings(userId);

    return {
      totalBalance: Math.round((availableBalance + bonusBalance) * 100) / 100,
      availableBalance,
      bonusBalance,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      earnedToday: Math.round(earnedToday * 100) / 100,
      minWithdrawalLimit: effectiveWithdrawal.minWithdrawalLimit,
      withdrawalNoticeBanner: effectiveWithdrawal.withdrawalNoticeBanner,
    };
  }

  public getUserWithdrawalSetting(userId: string): IndividualUserWithdrawalSetting | null {
    const list = this.data.individual_user_withdrawal_settings || [];
    return list.find((s) => s.user_id === userId) || null;
  }

  public getEffectiveWithdrawalSettings(userId: string): {
    minWithdrawalLimit: number;
    withdrawalNoticeBanner: {
      enabled: boolean;
      title: string;
      message: string;
      isCustom: boolean;
    };
    hasCustomSettings: boolean;
  } {
    const globalMin = this.data.withdrawalConfig?.minWithdrawalLimit ?? MIN_WITHDRAWAL_LIMIT;
    const globalEnabled = Boolean(this.data.withdrawalConfig?.noticeBannerEnabled);
    const globalTitle = this.data.withdrawalConfig?.noticeBannerTitle || 'Withdrawal Notice';
    const globalMessage = this.data.withdrawalConfig?.noticeBannerMessage || '';

    const custom = this.getUserWithdrawalSetting(userId);
    const minWithdrawalLimit =
      custom && typeof custom.custom_minimum_withdrawal === 'number'
        ? custom.custom_minimum_withdrawal
        : globalMin;

    const customNoticeText =
      custom && typeof custom.custom_withdrawal_notice === 'string'
        ? custom.custom_withdrawal_notice.trim()
        : '';

    const withdrawalNoticeBanner = customNoticeText
      ? {
          enabled: true,
          title: 'Withdrawal Notice',
          message: customNoticeText,
          isCustom: true,
        }
      : {
          enabled: globalEnabled,
          title: globalTitle,
          message: globalMessage,
          isCustom: false,
        };

    return {
      minWithdrawalLimit,
      withdrawalNoticeBanner,
      hasCustomSettings: Boolean(custom),
    };
  }

  public addAudit(
    actorId: string,
    actorRole: 'user' | 'admin' | 'system',
    action: string,
    details: string,
    targetId?: string
  ): void {
    this.data.auditLogs.unshift({
      id: createId('AUD'),
      actorId,
      actorRole,
      action,
      targetId,
      details,
      createdAt: new Date().toISOString(),
    });
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
  }

  public addNotification(
    userId: string,
    category: NotificationItem['category'],
    title: string,
    message: string
  ): NotificationItem {
    const item: NotificationItem = {
      id: createId('NTF'),
      userId,
      category,
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.data.notifications.unshift(item);
    return item;
  }

  public computeAdminAnalytics(): AdminAnalytics {
    const now = Date.now();
    const dayMs = 86400 * 1000;
    const regularUsers = this.data.users.filter((u) => u.role !== 'admin');

    const sumWindow = (ms: number) => {
      const cutoff = now - ms;
      const deposits = this.data.deposits
        .filter((d) => d.status === 'Successful' && new Date(d.createdAt).getTime() >= cutoff)
        .reduce((s, d) => s + (d.creditedAmount ?? d.amount), 0);
      const rewards = this.data.gameSessions
        .filter((g) => new Date(g.playedAt).getTime() >= cutoff)
        .reduce((s, g) => s + g.rewardEarned, 0);
      const withdrawals = this.data.withdrawals
        .filter((w) => w.status === 'Completed' && new Date(w.updatedAt).getTime() >= cutoff)
        .reduce((s, w) => s + w.amount, 0);
      const plays = this.data.gameSessions.filter(
        (g) => new Date(g.playedAt).getTime() >= cutoff
      ).length;
      return { deposits, rewards, withdrawals, plays };
    };

    const pendingWithdrawals = this.data.withdrawals.filter((w) =>
      ['Pending', 'Under Review', 'Approved', 'Processing'].includes(w.status)
    );

    return {
      totalUsers: regularUsers.length,
      activeUsers: regularUsers.filter((u) => u.status === 'active').length,
      suspendedUsers: regularUsers.filter((u) => u.status === 'suspended').length,
      verifiedKycUsers: regularUsers.filter((u) => u.kycStatus === 'verified').length,
      totalDeposits: this.data.deposits
        .filter((d) => d.status === 'Successful')
        .reduce((s, d) => s + (d.creditedAmount ?? d.amount), 0),
      totalRewardsDistributed: this.data.gameSessions.reduce((s, g) => s + g.rewardEarned, 0),
      totalWithdrawalsCompleted: this.data.withdrawals
        .filter((w) => w.status === 'Completed')
        .reduce((s, w) => s + w.amount, 0),
      pendingDepositsCount: this.data.deposits.filter((d) => d.status === 'Pending').length,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      pendingWithdrawalsAmount: pendingWithdrawals.reduce((s, w) => s + w.amount, 0),
      periodStats: {
        daily: sumWindow(dayMs),
        weekly: sumWindow(7 * dayMs),
        monthly: sumWindow(30 * dayMs),
      },
    };
  }

  public syncMerchantPaymentConfigFromMethods(): MerchantPaymentConfig {
    if (!Array.isArray(this.data.depositPaymentMethods) || this.data.depositPaymentMethods.length === 0) {
      const fallbackNow = new Date().toISOString();
      this.data.depositPaymentMethods = [
        {
          id: 'DPM-PRIMARY-01',
          label: 'Primary UPI & QR',
          merchantName: this.data.merchantPaymentConfig?.merchantName || 'GameReward Official',
          upiId: this.data.merchantPaymentConfig?.upiId || 'gamereward.pay@okaxis',
          qrImageDataUrl: this.data.merchantPaymentConfig?.qrImageDataUrl ?? null,
          instructions: this.data.merchantPaymentConfig?.instructions || '',
          isActive: true,
          isPrimary: true,
          createdAt: fallbackNow,
          updatedAt: fallbackNow,
        },
      ];
    }

    const methods = this.data.depositPaymentMethods;
    let primary = methods.find((m) => m.isPrimary && m.isActive);
    if (!primary) {
      primary = methods.find((m) => m.isActive) || methods[0];
      primary.isActive = true;
      methods.forEach((m) => {
        m.isPrimary = m.id === primary!.id;
      });
    }

    this.data.merchantPaymentConfig = {
      upiId: primary.upiId,
      merchantName: primary.merchantName,
      qrImageDataUrl: primary.qrImageDataUrl ?? null,
      instructions: primary.instructions || '',
      updatedAt: primary.updatedAt || new Date().toISOString(),
    };
    return this.data.merchantPaymentConfig;
  }

  public getActiveDepositPaymentMethods(): AdminDepositPaymentMethod[] {
    this.syncMerchantPaymentConfigFromMethods();
    return [...(this.data.depositPaymentMethods || [])]
      .filter((m) => m.isActive)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }

  public getPublicAppRelease(): AppReleaseConfig {
    const cfg = this.data.appReleaseConfig || {
      enabled: true,
      appName: 'GameReward',
      version: '1.0.0',
      fileName: null,
      storedFileName: null,
      fileSizeBytes: 0,
      mimeType: 'application/vnd.android.package-archive',
      releaseNotes: '',
      shareMessageTemplate:
        'Ye GameReward app install karo aur signup ke time mera referral code {CODE} use karo!',
      uploadedAt: null,
      uploadedBy: null,
    };

    let hasValidFile = false;
    if (cfg.storedFileName) {
      const safeBase = path.basename(cfg.storedFileName);
      const resolved = path.resolve(UPLOADS_DIR, safeBase);
      if (resolved.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(resolved)) {
        hasValidFile = true;
      }
    }

    return {
      enabled: cfg.enabled,
      appName: cfg.appName,
      version: cfg.version,
      fileName: hasValidFile ? cfg.fileName : null,
      fileSizeBytes: hasValidFile ? cfg.fileSizeBytes : 0,
      mimeType: cfg.mimeType || 'application/vnd.android.package-archive',
      releaseNotes: cfg.releaseNotes || '',
      shareMessageTemplate:
        cfg.shareMessageTemplate ||
        'Ye GameReward app install karo aur signup ke time mera referral code {CODE} use karo!',
      downloadUrl: hasValidFile && cfg.enabled ? '/api/app-release/download' : null,
      uploadedAt: hasValidFile ? cfg.uploadedAt : null,
      uploadedBy: hasValidFile ? cfg.uploadedBy : null,
    };
  }

  // ==========================================================================
  // REFERRAL & REWARDS SYSTEM METHODS
  // ==========================================================================

  public getReferralSettings(): ReferralSettings {
    if (!this.data.referral_settings) {
      this.data.referral_settings = {
        signup_bonus: 50,
        referral_percentage: 10,
        minimum_qualifying_deposit: 100,
        promotion_enabled: true,
        updated_at: new Date().toISOString(),
      };
    }
    return this.data.referral_settings;
  }

  public generateUniqueReferralCode(name: string, seedSuffix?: string): string {
    const usedCodes = new Set<string>([
      ...(this.data.referral_codes || []).map((c) => c.referral_code.toUpperCase()),
      ...(this.data.users || []).map((u) => String(u.referralCode || '').toUpperCase()),
    ]);
    const prefix =
      String(name || 'USER')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 5)
        .toUpperCase() || 'USER';

    if (seedSuffix) {
      const candidate = `${prefix}${seedSuffix}`.toUpperCase();
      if (!usedCodes.has(candidate)) {
        return candidate;
      }
    }

    let code = '';
    do {
      code = `${prefix}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    } while (usedCodes.has(code));
    return code;
  }

  public ensureUserReferralCode(user: StoredUser): ReferralCodeRecord {
    if (!Array.isArray(this.data.referral_codes)) {
      this.data.referral_codes = [];
    }
    const existing = this.data.referral_codes.find((c) => c.user_id === user.id);
    if (existing) {
      if (user.referralCode !== existing.referral_code) {
        user.referralCode = existing.referral_code;
      }
      return existing;
    }

    const usedCodes = new Set(
      this.data.referral_codes.map((c) => c.referral_code.toUpperCase())
    );
    let code = String(user.referralCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!code || usedCodes.has(code)) {
      code = this.generateUniqueReferralCode(user.name);
    }
    user.referralCode = code;
    const record: ReferralCodeRecord = {
      id: createId('RFC'),
      user_id: user.id,
      referral_code: code,
      created_at: user.createdAt || new Date().toISOString(),
    };
    this.data.referral_codes.push(record);
    return record;
  }

  public findReferrerByCode(rawCode: string): { user: StoredUser; codeRecord: ReferralCodeRecord } | null {
    const normalized = String(rawCode || '').trim().toUpperCase();
    if (!normalized) return null;
    const codeRecord = (this.data.referral_codes || []).find(
      (c) => c.referral_code.toUpperCase() === normalized
    );
    if (codeRecord) {
      const user = this.data.users.find((u) => u.id === codeRecord.user_id);
      if (user) return { user, codeRecord };
    }
    const fallbackUser = this.data.users.find(
      (u) => String(u.referralCode || '').toUpperCase() === normalized
    );
    if (fallbackUser) {
      const ensured = this.ensureUserReferralCode(fallbackUser);
      return { user: fallbackUser, codeRecord: ensured };
    }
    return null;
  }

  public processSignupReferral(
    newUser: StoredUser,
    rawReferralCode: string,
    deviceFingerprint: string,
    nowIso: string
  ): {
    applied: boolean;
    reason?: string;
    relationship?: ReferralRelationshipRecord;
    reward?: ReferralRewardRecord;
  } {
    const normalizedCode = String(rawReferralCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      return { applied: false, reason: 'No referral code provided' };
    }

    if (!Array.isArray(this.data.referral_relationships)) {
      this.data.referral_relationships = [];
    }
    if (!Array.isArray(this.data.referral_rewards)) {
      this.data.referral_rewards = [];
    }

    // One account can only be referred by one referral code
    const existingRelationship = this.data.referral_relationships.find(
      (r) => r.referred_user_id === newUser.id
    );
    if (existingRelationship) {
      return { applied: false, reason: 'Account already has a referral relationship' };
    }

    const found = this.findReferrerByCode(normalizedCode);
    if (!found) {
      return { applied: false, reason: 'Invalid referral code' };
    }

    const referrer = found.user;
    // Prevent self-referrals (by user_id, mobile, or email)
    if (
      referrer.id === newUser.id ||
      referrer.mobile === newUser.mobile ||
      (referrer.email && newUser.email && referrer.email.toLowerCase() === newUser.email.toLowerCase())
    ) {
      return { applied: false, reason: 'Self-referrals are not permitted' };
    }

    if (referrer.status !== 'active') {
      return { applied: false, reason: 'Referrer account is not active' };
    }

    // Fraud prevention: check if device fingerprint matches the referrer or another already-referred account
    const fp = String(deviceFingerprint || '').trim();
    const isGenericFp = !fp || fp === 'web-client';
    const matchesReferrerDevice =
      !isGenericFp && (referrer.deviceFingerprints || []).includes(fp);
    const duplicateDeviceAccount =
      !isGenericFp &&
      this.data.users.some(
        (u) => u.id !== newUser.id && (u.deviceFingerprints || []).includes(fp)
      );

    const mobileVerified = /^[6-9]\d{9}$/.test(newUser.mobile);
    const settings = this.getReferralSettings();

    const relationship: ReferralRelationshipRecord = {
      id: createId('RFL'),
      referrer_user_id: referrer.id,
      referred_user_id: newUser.id,
      referral_code: found.codeRecord.referral_code,
      registration_date: nowIso,
      status: 'Pending',
    };
    this.data.referral_relationships.unshift(relationship);
    newUser.referredBy = found.codeRecord.referral_code;

    // Duplicate signup reward prevention
    const alreadyRewardedSignup = this.data.referral_rewards.some(
      (rw) => rw.referred_user_id === newUser.id && rw.reward_type === 'signup'
    );
    if (alreadyRewardedSignup) {
      return { applied: true, relationship, reason: 'Signup reward already processed' };
    }

    // Verify legitimacy & active promotion before crediting ₹50 signup bonus
    const isLegitimateNewAccount =
      mobileVerified && !matchesReferrerDevice && !duplicateDeviceAccount;

    if (!settings.promotion_enabled) {
      this.addAudit(
        'SYSTEM',
        'system',
        'REFERRAL_SIGNUP_TRACKED_PAUSED',
        `Tracked referral ${relationship.id}: ${referrer.id} -> ${newUser.id} (code ${found.codeRecord.referral_code}), signup bonus skipped because promotions are disabled.`,
        relationship.id
      );
      return { applied: true, relationship, reason: 'Referral promotion is currently paused' };
    }

    if (!isLegitimateNewAccount) {
      this.addAudit(
        'SYSTEM',
        'system',
        'REFERRAL_SIGNUP_HELD_PENDING',
        `Held referral ${relationship.id}: ${referrer.id} -> ${newUser.id} as Pending due to duplicate device/verification check.`,
        relationship.id
      );
      return { applied: true, relationship, reason: 'Held pending account verification' };
    }

    const signupBonusAmount = Math.max(0, Math.round(settings.signup_bonus * 100) / 100);
    if (signupBonusAmount <= 0) {
      relationship.status = 'Qualified';
      return { applied: true, relationship };
    }

    const qualifyingTxnId = `REF-SGN-${newUser.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const reward: ReferralRewardRecord = {
      id: createId('RRW'),
      referrer_user_id: referrer.id,
      referred_user_id: newUser.id,
      reward_type: 'signup',
      qualifying_transaction_id: qualifyingTxnId,
      qualifying_amount: 0,
      reward_percentage: 0,
      reward_amount: signupBonusAmount,
      reward_status: 'Reward Credited',
      created_at: nowIso,
    };
    this.data.referral_rewards.unshift(reward);
    relationship.status = 'Reward Credited';

    // Atomic wallet credit via ledger transaction
    this.data.transactions.unshift({
      id: qualifyingTxnId,
      userId: referrer.id,
      type: 'referral_bonus',
      bucket: 'bonus',
      amount: signupBonusAmount,
      status: 'Reward Credited',
      title: 'Referral Signup Reward',
      description: `Signup reward for inviting ${newUser.name} (${newUser.id})`,
      referenceId: reward.id,
      createdAt: nowIso,
    });

    const refCamp = this.data.bonusCampaigns.find((c) => c.type === 'referral');
    if (refCamp) {
      refCamp.totalClaimedCount += 1;
      refCamp.totalDistributedAmount =
        Math.round((refCamp.totalDistributedAmount + signupBonusAmount) * 100) / 100;
    }

    this.addNotification(
      referrer.id,
      'reward',
      'Referral Signup Reward Credited',
      `Congratulations! ₹${signupBonusAmount} virtual referral reward has been credited because ${newUser.name} joined using your referral code (${found.codeRecord.referral_code}).`
    );

    this.addAudit(
      'SYSTEM',
      'system',
      'REFERRAL_SIGNUP_REWARD_CREDITED',
      `Credited ₹${signupBonusAmount} signup reward (${reward.id}, ref ${qualifyingTxnId}) to ${referrer.id} for referred user ${newUser.id}.`,
      reward.id
    );

    return { applied: true, relationship, reward };
  }

  public processDepositReferralReward(
    deposit: DepositRecord,
    creditedAmount: number,
    nowIso: string
  ): ReferralRewardRecord | null {
    // Only count completed & verified deposit transactions
    if (deposit.status !== 'Successful' || !deposit.webhookVerified) {
      return null;
    }

    const settings = this.getReferralSettings();
    if (!settings.promotion_enabled) {
      return null;
    }

    const qualifyingAmount = Math.round(Number(creditedAmount) * 100) / 100;
    if (!Number.isFinite(qualifyingAmount) || qualifyingAmount < settings.minimum_qualifying_deposit) {
      return null;
    }

    if (!Array.isArray(this.data.referral_relationships)) {
      this.data.referral_relationships = [];
    }
    if (!Array.isArray(this.data.referral_rewards)) {
      this.data.referral_rewards = [];
    }

    const relationship = this.data.referral_relationships.find(
      (r) => r.referred_user_id === deposit.userId
    );
    if (!relationship) {
      return null;
    }

    // Prevent self-referral and ensure active referrer
    if (relationship.referrer_user_id === deposit.userId) {
      return null;
    }
    const referrer = this.data.users.find((u) => u.id === relationship.referrer_user_id);
    if (!referrer || referrer.status !== 'active') {
      return null;
    }

    // Prevent duplicate deposit referral reward for the same transaction
    const txRef = deposit.transactionId || deposit.id;
    const duplicate = this.data.referral_rewards.some(
      (rw) =>
        rw.reward_type === 'deposit' &&
        (rw.qualifying_transaction_id === txRef || rw.qualifying_transaction_id === deposit.id)
    );
    if (duplicate) {
      return null;
    }

    const pct = Math.max(0, Number(settings.referral_percentage) || 0);
    const rewardAmount = Math.round(((qualifyingAmount * pct) / 100) * 100) / 100;
    if (rewardAmount <= 0) {
      return null;
    }

    const reward: ReferralRewardRecord = {
      id: createId('RRW'),
      referrer_user_id: referrer.id,
      referred_user_id: deposit.userId,
      reward_type: 'deposit',
      qualifying_transaction_id: txRef,
      qualifying_amount: qualifyingAmount,
      reward_percentage: pct,
      reward_amount: rewardAmount,
      reward_status: 'Reward Credited',
      created_at: nowIso,
    };
    this.data.referral_rewards.unshift(reward);
    relationship.status = 'Reward Credited';

    const ledgerRef = `REF-DEP-${deposit.transactionId}`;
    this.data.transactions.unshift({
      id: createId('TXN'),
      userId: referrer.id,
      type: 'referral_bonus',
      bucket: 'bonus',
      amount: rewardAmount,
      status: 'Reward Credited',
      title: `Referral Deposit Reward (${pct}%)`,
      description: `${pct}% reward on ₹${qualifyingAmount} verified deposit by ${deposit.userName} (${deposit.userId})`,
      referenceId: ledgerRef,
      createdAt: nowIso,
    });

    const refCamp = this.data.bonusCampaigns.find((c) => c.type === 'referral');
    if (refCamp) {
      refCamp.totalClaimedCount += 1;
      refCamp.totalDistributedAmount =
        Math.round((refCamp.totalDistributedAmount + rewardAmount) * 100) / 100;
    }

    this.addNotification(
      referrer.id,
      'reward',
      'Referral Deposit Reward Credited',
      `You earned ₹${rewardAmount} (${pct}% of ₹${qualifyingAmount}) from your invited friend ${deposit.userName}'s verified deposit (Ref: ${txRef}).`
    );

    this.addAudit(
      'SYSTEM',
      'system',
      'REFERRAL_DEPOSIT_REWARD_CREDITED',
      `Auto-credited ₹${rewardAmount} (${pct}% of ₹${qualifyingAmount}) to ${referrer.id} for ${deposit.userId} deposit ${txRef} (${reward.id}).`,
      reward.id
    );

    return reward;
  }

  public reverseReferralReward(
    rewardId: string,
    adminId: string,
    reason: string
  ): { ok: boolean; error?: string; reward?: ReferralRewardRecord } {
    const reward = (this.data.referral_rewards || []).find((r) => r.id === rewardId);
    if (!reward) {
      return { ok: false, error: 'Referral reward record not found.' };
    }
    if (reward.reward_status === 'Reversed') {
      return { ok: false, error: 'This referral reward has already been reversed.' };
    }

    const nowIso = new Date().toISOString();
    const cleanReason =
      String(reason || 'Qualifying transaction reversed by admin').trim() ||
      'Qualifying transaction reversed by admin';

    reward.reward_status = 'Reversed';
    reward.reversed_at = nowIso;
    reward.reversal_reason = cleanReason;

    // Reverse wallet balance atomically with a compensating negative ledger entry
    const reversalTxnId = `REF-REV-${reward.id}`;
    const alreadyReversedInLedger = this.data.transactions.some((t) => t.id === reversalTxnId);
    if (!alreadyReversedInLedger && reward.reward_amount > 0) {
      this.data.transactions.unshift({
        id: reversalTxnId,
        userId: reward.referrer_user_id,
        type: 'referral_reversal',
        bucket: 'bonus',
        amount: -reward.reward_amount,
        status: 'Reversed',
        title: 'Referral Reward Reversed',
        description: `Reversed ₹${reward.reward_amount} (${reward.reward_type} reward ${reward.id}): ${cleanReason}`,
        referenceId: reward.qualifying_transaction_id,
        createdAt: nowIso,
      });
    }

    // Update relationship status to Reversed if no active credited rewards remain for that pair
    const pairRewards = (this.data.referral_rewards || []).filter(
      (r) =>
        r.referrer_user_id === reward.referrer_user_id &&
        r.referred_user_id === reward.referred_user_id
    );
    const hasRemainingCredited = pairRewards.some((r) => r.reward_status === 'Reward Credited');
    const rel = (this.data.referral_relationships || []).find(
      (r) =>
        r.referrer_user_id === reward.referrer_user_id &&
        r.referred_user_id === reward.referred_user_id
    );
    if (rel && !hasRemainingCredited) {
      rel.status = 'Reversed';
    }

    this.addNotification(
      reward.referrer_user_id,
      'reward',
      'Referral Reward Reversed',
      `₹${reward.reward_amount} referral reward (${reward.qualifying_transaction_id}) was reversed: ${cleanReason}`
    );

    this.addAudit(
      adminId,
      'admin',
      'REFERRAL_REWARD_REVERSED',
      `Reversed referral reward ${reward.id} (₹${reward.reward_amount}) from ${reward.referrer_user_id} (Ref ${reward.qualifying_transaction_id}): ${cleanReason}`,
      reward.id
    );

    return { ok: true, reward };
  }

  public getUserReferralDashboard(userId: string): UserReferralDashboardData | null {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return null;

    const codeRecord = this.ensureUserReferralCode(user);
    const settings = this.getReferralSettings();
    const userMap = new Map(this.data.users.map((u) => [u.id, u]));

    const relationships = (this.data.referral_relationships || []).filter(
      (r) => r.referrer_user_id === userId
    );
    const rewards = (this.data.referral_rewards || []).filter(
      (r) => r.referrer_user_id === userId
    );

    const relByReferredId = new Map(relationships.map((r) => [r.referred_user_id, r]));

    const totalInvitedFriends = relationships.length;
    const successfulReferrals = relationships.filter(
      (r) => r.status === 'Reward Credited' || r.status === 'Qualified'
    ).length;
    const pendingReferrals = relationships.filter((r) => r.status === 'Pending').length;

    const creditedRewards = rewards.filter((r) => r.reward_status === 'Reward Credited');
    const signupRewardsTotal =
      Math.round(
        creditedRewards
          .filter((r) => r.reward_type === 'signup')
          .reduce((sum, r) => sum + r.reward_amount, 0) * 100
      ) / 100;
    const depositRewardsTotal =
      Math.round(
        creditedRewards
          .filter((r) => r.reward_type === 'deposit')
          .reduce((sum, r) => sum + r.reward_amount, 0) * 100
      ) / 100;
    const totalReferralRewards = Math.round((signupRewardsTotal + depositRewardsTotal) * 100) / 100;

    // Build privacy-safe referral history (NEVER expose mobile, email, or bank details)
    const history: UserReferralHistoryItem[] = [];
    const referredIdsWithRewards = new Set<string>();

    for (const rw of rewards) {
      referredIdsWithRewards.add(rw.referred_user_id);
      const referredUser = userMap.get(rw.referred_user_id);
      const rel = relByReferredId.get(rw.referred_user_id);
      history.push({
        id: rw.id,
        referredUserId: rw.referred_user_id,
        referredUserName: referredUser?.name || 'Player',
        registrationDate: rel?.registration_date || referredUser?.createdAt || rw.created_at,
        depositAmount: rw.reward_type === 'deposit' ? rw.qualifying_amount : 0,
        referralRewardAmount: rw.reward_amount,
        rewardType: rw.reward_type,
        rewardPercentage: rw.reward_percentage,
        rewardStatus: rw.reward_status,
        transactionReferenceId: rw.qualifying_transaction_id,
        createdAt: rw.created_at,
      });
    }

    // Also include pending/qualified invitations that have no reward entries yet
    for (const rel of relationships) {
      if (!referredIdsWithRewards.has(rel.referred_user_id)) {
        const referredUser = userMap.get(rel.referred_user_id);
        history.push({
          id: rel.id,
          referredUserId: rel.referred_user_id,
          referredUserName: referredUser?.name || 'Player',
          registrationDate: rel.registration_date,
          depositAmount: 0,
          referralRewardAmount: 0,
          rewardType: 'invitation',
          rewardPercentage: 0,
          rewardStatus: rel.status,
          transactionReferenceId: rel.id,
          createdAt: rel.registration_date,
        });
      }
    }

    history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      referralCode: codeRecord.referral_code,
      settings,
      stats: {
        totalInvitedFriends,
        successfulReferrals,
        pendingReferrals,
        totalReferralRewards,
        signupRewardsTotal,
        depositRewardsTotal,
      },
      history,
    };
  }

  public getAdminReferralOverview(searchQuery?: string): AdminReferralOverviewData {
    const q = String(searchQuery || '').trim().toLowerCase();
    const userMap = new Map(this.data.users.map((u) => [u.id, u]));
    const codeByUserId = new Map(
      (this.data.referral_codes || []).map((c) => [c.user_id, c.referral_code])
    );

    const allRelationships = this.data.referral_relationships || [];
    const allRewards = this.data.referral_rewards || [];

    const creditedRewards = allRewards.filter((r) => r.reward_status === 'Reward Credited');
    const totalSignupRewards =
      Math.round(
        creditedRewards
          .filter((r) => r.reward_type === 'signup')
          .reduce((sum, r) => sum + r.reward_amount, 0) * 100
      ) / 100;
    const totalDepositRewards =
      Math.round(
        creditedRewards
          .filter((r) => r.reward_type === 'deposit')
          .reduce((sum, r) => sum + r.reward_amount, 0) * 100
      ) / 100;
    const totalQualifyingDeposits =
      Math.round(
        creditedRewards
          .filter((r) => r.reward_type === 'deposit')
          .reduce((sum, r) => sum + r.qualifying_amount, 0) * 100
      ) / 100;

    const relationships: AdminReferralRelationshipView[] = allRelationships
      .map((rel) => {
        const pairRewards = allRewards.filter(
          (rw) =>
            rw.referrer_user_id === rel.referrer_user_id &&
            rw.referred_user_id === rel.referred_user_id &&
            rw.reward_status === 'Reward Credited'
        );
        return {
          ...rel,
          referrer_name: userMap.get(rel.referrer_user_id)?.name || rel.referrer_user_id,
          referred_name: userMap.get(rel.referred_user_id)?.name || rel.referred_user_id,
          total_qualifying_deposits:
            Math.round(
              pairRewards
                .filter((rw) => rw.reward_type === 'deposit')
                .reduce((s, rw) => s + rw.qualifying_amount, 0) * 100
            ) / 100,
          total_rewards_earned:
            Math.round(pairRewards.reduce((s, rw) => s + rw.reward_amount, 0) * 100) / 100,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.referrer_user_id.toLowerCase().includes(q) ||
          row.referred_user_id.toLowerCase().includes(q) ||
          row.referral_code.toLowerCase().includes(q) ||
          row.referrer_name.toLowerCase().includes(q) ||
          row.referred_name.toLowerCase().includes(q)
        );
      });

    const rewards: AdminReferralRewardView[] = allRewards
      .map((rw) => ({
        ...rw,
        referrer_name: userMap.get(rw.referrer_user_id)?.name || rw.referrer_user_id,
        referred_name: userMap.get(rw.referred_user_id)?.name || rw.referred_user_id,
        referral_code:
          codeByUserId.get(rw.referrer_user_id) ||
          userMap.get(rw.referrer_user_id)?.referralCode ||
          '',
      }))
      .filter((row) => {
        if (!q) return true;
        return (
          row.referrer_user_id.toLowerCase().includes(q) ||
          row.referred_user_id.toLowerCase().includes(q) ||
          row.referral_code.toLowerCase().includes(q) ||
          row.qualifying_transaction_id.toLowerCase().includes(q) ||
          row.referrer_name.toLowerCase().includes(q) ||
          row.referred_name.toLowerCase().includes(q)
        );
      });

    return {
      stats: {
        totalReferrals: allRelationships.length,
        successfulReferrals: allRelationships.filter(
          (r) => r.status === 'Reward Credited' || r.status === 'Qualified'
        ).length,
        pendingReferrals: allRelationships.filter((r) => r.status === 'Pending').length,
        reversedReferrals: allRelationships.filter((r) => r.status === 'Reversed').length,
        totalReferralRewards: Math.round((totalSignupRewards + totalDepositRewards) * 100) / 100,
        totalSignupRewards,
        totalDepositRewards,
        totalQualifyingDeposits,
      },
      settings: this.getReferralSettings(),
      relationships,
      rewards,
    };
  }
}

export const store = new Store();
