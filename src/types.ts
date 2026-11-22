export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type GameCategory = 'Casino' | 'Luck' | 'Slots' | 'Cards' | 'Dice';

export type GameEngineType =
  | 'money_rolling'
  | 'hot_volcano'
  | 'aviator'
  | 'mines_grid'
  | 'twist'
  | 'wheel'
  | 'dice'
  | 'coin'
  | 'cards'
  | 'mines'
  | 'slots';

export type WithdrawalStatus =
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Processing'
  | 'Completed'
  | 'Rejected';

export type DepositStatus = 'Pending' | 'Successful' | 'Failed';

export type DepositPaymentMethod = 'PhonePe' | 'GPay' | 'Paytm' | 'UPI QR';

export interface MerchantPaymentConfig {
  upiId: string;
  merchantName: string;
  qrImageDataUrl?: string | null;
  instructions?: string;
  updatedAt: string;
}

export interface AdminDepositPaymentMethod {
  id: string;
  label: string;
  merchantName: string;
  upiId: string;
  qrImageDataUrl?: string | null;
  instructions?: string;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType =
  | 'welcome_bonus'
  | 'daily_bonus'
  | 'promo_bonus'
  | 'referral_bonus'
  | 'referral_reversal'
  | 'deposit_bonus'
  | 'game_entry'
  | 'game_reward'
  | 'deposit'
  | 'withdrawal'
  | 'withdrawal_refund';

export interface WithdrawalConfig {
  minWithdrawalLimit: number;
  noticeBannerEnabled?: boolean;
  noticeBannerTitle?: string;
  noticeBannerMessage?: string;
  updatedAt: string;
}

export interface IndividualUserWithdrawalSetting {
  id: string;
  user_id: string;
  custom_minimum_withdrawal: number | null;
  custom_withdrawal_notice: string | null;
  updated_at: string;
  updated_by_admin_id: string;
}

export interface DepositBonusOfferMeta {
  isFirstOfferAvailable: boolean;
  firstDepositTiers: DepositTier[];
  reloadTiers: DepositTier[];
}

export interface DepositTier {
  amount: number;
  bonusPercent: number;
  bonusAmount: number;
  totalValue: number;
  totalPercentLabel: string;
}

export interface PaymentMethod {
  id: string;
  type: 'upi' | 'bank';
  label: string;
  upiId?: string;
  accountHolderName?: string;
  accountNumberMasked?: string;
  accountNumber?: string;
  ifscCode?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  uid?: string;
  name: string;
  mobile: string;
  email: string;
  state: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  isBanned?: boolean;
  walletBalance?: number;
  bonusBalance?: number;
  kycStatus: KycStatus;
  kycSubmittedAt?: string;
  kycDocumentType?: string;
  kycDocumentLast4?: string;
  referralCode: string;
  referredBy?: string;
  welcomeBonusClaimed: boolean;
  welcomeBonusExpiresAt?: string;
  firstDepositOfferUsed: boolean;
  dailyStreak: number;
  lastCheckInDate?: string;
  customWinRatio?: number | null;
  paymentMethods: PaymentMethod[];
  createdAt: string;
}

export interface AuthorizedAdminEmail {
  email: string;
  addedBy: string;
  addedAt: string;
  isOwner?: boolean;
  registeredUser?: {
    id: string;
    name: string;
    mobile: string;
    status: 'active' | 'suspended';
  } | null;
}

export interface WalletSummary {
  totalBalance: number;
  availableBalance: number;
  bonusBalance: number;
  totalEarnings: number;
  totalWithdrawals: number;
  totalDeposits: number;
  earnedToday: number;
  minWithdrawalLimit: number;
  withdrawalNoticeBanner?: {
    enabled: boolean;
    title: string;
    message: string;
    isCustom?: boolean;
  };
}

export interface LedgerTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  bucket: 'available' | 'bonus';
  amount: number;
  status: string;
  title: string;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface DepositRecord {
  id: string;
  transactionId: string;
  userId: string;
  userName: string;
  userMobile: string;
  amount: number;
  creditedAmount?: number;
  bonusAmount: number;
  gateway: 'Razorpay' | 'Cashfree' | 'PayU' | 'UPI Direct' | DepositPaymentMethod;
  paymentMethod?: DepositPaymentMethod | 'Google Pay' | 'QR Code';
  utrNumber?: string;
  upiId?: string;
  screenshotBase64?: string | null;
  userTransactionRef?: string;
  utrSubmittedAt?: string;
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  status: DepositStatus;
  webhookVerified: boolean;
  adminNote?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalRecord {
  id: string;
  transactionId: string;
  userId: string;
  userName: string;
  userMobile: string;
  amount: number;
  methodType: 'upi' | 'bank';
  upiId?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  status: WithdrawalStatus;
  rejectionReason?: string;
  utrNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameItem {
  id: string;
  name: string;
  category: GameCategory;
  engine: GameEngineType;
  thumbnail: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  instructions: string;
  rewardRuleText: string;
  entryFeeOptions: number[];
  winMultiplier: number;
  minWinRatio: number; // 50
  maxWinRatio: number; // 60
  isTournament: boolean;
  active: boolean;
  totalPlays: number;
  totalRewardsPaid: number;
}

export interface GameSessionRecord {
  id: string;
  gameId: string;
  gameName: string;
  userId: string;
  userName: string;
  entryFee: number;
  winRatioUsed: number;
  outcome: 'win' | 'loss';
  score: number;
  durationSec: number;
  rewardEarned: number;
  status: 'completed';
  playedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  bestScore: number;
  gamesPlayed: number;
  totalReward: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  category: 'bonus' | 'reward' | 'deposit' | 'withdrawal' | 'game' | 'promo' | 'security';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  userId: string;
  userName: string;
  city?: string;
  badge?: string;
  rating: number;
  comment: string;
  isPromotional: boolean;
  isScheduledShowcase?: boolean;
  reportedBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewScheduleMeta {
  intervalHours: number;
  nextReviewAt: string;
  userCooldownEndsAt?: string | null;
}

export interface BonusCampaign {
  id: string;
  title: string;
  description: string;
  type: 'welcome' | 'daily_streak' | 'referral' | 'promo';
  rewardAmount: number;
  eligibilityRules: string;
  expiryDays: number;
  active: boolean;
  totalClaimedCount: number;
  totalDistributedAmount: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: 'user' | 'admin' | 'system';
  action: string;
  targetId?: string;
  details: string;
  createdAt: string;
}

export interface AdminAnalytics {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  verifiedKycUsers: number;
  totalDeposits: number;
  totalRewardsDistributed: number;
  totalWithdrawalsCompleted: number;
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  periodStats: {
    daily: { deposits: number; rewards: number; withdrawals: number; plays: number };
    weekly: { deposits: number; rewards: number; withdrawals: number; plays: number };
    monthly: { deposits: number; rewards: number; withdrawals: number; plays: number };
  };
}

export type ReferralStatus = 'Pending' | 'Qualified' | 'Reward Credited' | 'Reversed';

export type ReferralRewardType = 'signup' | 'deposit';

export interface ReferralCodeRecord {
  id: string;
  user_id: string;
  referral_code: string;
  created_at: string;
}

export interface ReferralRelationshipRecord {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  registration_date: string;
  status: ReferralStatus;
}

export interface ReferralRewardRecord {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  reward_type: ReferralRewardType;
  qualifying_transaction_id: string;
  qualifying_amount: number;
  reward_percentage: number;
  reward_amount: number;
  reward_status: ReferralStatus;
  created_at: string;
  reversed_at?: string;
  reversal_reason?: string;
}

export interface ReferralSettings {
  signup_bonus: number;
  referral_percentage: number;
  minimum_qualifying_deposit: number;
  promotion_enabled: boolean;
  updated_at: string;
}

export interface UserReferralHistoryItem {
  id: string;
  referredUserId: string;
  referredUserName: string;
  registrationDate: string;
  depositAmount: number;
  referralRewardAmount: number;
  rewardType: ReferralRewardType | 'invitation';
  rewardPercentage: number;
  rewardStatus: ReferralStatus;
  transactionReferenceId: string;
  createdAt: string;
}

export interface UserReferralDashboardData {
  referralCode: string;
  settings: ReferralSettings;
  stats: {
    totalInvitedFriends: number;
    successfulReferrals: number;
    pendingReferrals: number;
    totalReferralRewards: number;
    signupRewardsTotal: number;
    depositRewardsTotal: number;
  };
  history: UserReferralHistoryItem[];
}

export interface AdminReferralRelationshipView extends ReferralRelationshipRecord {
  referrer_name: string;
  referred_name: string;
  total_qualifying_deposits: number;
  total_rewards_earned: number;
}

export interface AdminReferralRewardView extends ReferralRewardRecord {
  referrer_name: string;
  referred_name: string;
  referral_code: string;
}

export interface AdminReferralOverviewData {
  stats: {
    totalReferrals: number;
    successfulReferrals: number;
    pendingReferrals: number;
    reversedReferrals: number;
    totalReferralRewards: number;
    totalSignupRewards: number;
    totalDepositRewards: number;
    totalQualifyingDeposits: number;
  };
  settings: ReferralSettings;
  relationships: AdminReferralRelationshipView[];
  rewards: AdminReferralRewardView[];
}

export interface AppReleaseConfig {
  enabled: boolean;
  appName: string;
  version: string;
  fileName: string | null;
  fileSizeBytes: number;
  mimeType: string;
  releaseNotes: string;
  shareMessageTemplate: string;
  downloadUrl: string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

export type AppAnnouncementTone = 'info' | 'offer' | 'success' | 'alert';

export interface AppAnnouncementConfig {
  enabled: boolean;
  title: string;
  message: string;
  tone: AppAnnouncementTone;
  buttonLabel: string;
  showMode: 'every_open' | 'once_per_update';
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AppAnnouncementHistoryItem {
  id: string;
  title: string;
  message: string;
  tone: AppAnnouncementTone;
  buttonLabel: string;
  showMode: 'every_open' | 'once_per_update';
  publishedAt: string;
  publishedBy: string;
}


