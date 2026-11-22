import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Edit3,
  Gamepad2,
  Gift,
  IndianRupee,
  Lock,
  Mail,
  Megaphone,
  Percent,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  adminAddAdminEmailFirestore,
  adminAddGameFirestore,
  adminCreateCampaignFirestore,
  adminCreditUserFirestore,
  adminDeleteGameFirestore,
  adminGetUserHistoryFirestore,
  adminRemoveAdminEmailFirestore,
  adminReviewDepositFirestore,
  adminReviewKycFirestore,
  adminSaveQuickMerchantConfigFirestore,
  adminSaveUserWinRatioFirestore,
  adminSaveUserWithdrawalSettingsFirestore,
  adminSaveWelcomeBonusFirestore,
  adminSaveWithdrawalConfigFirestore,
  adminToggleUserStatusFirestore,
  adminUpdateGameWinRatioFirestore,
  adminUpdateWithdrawalStatusFirestore,
  db,
  formatDateTime,
  formatINR,
  getAdminOverviewFirestore,
} from '../lib/api';
import { registerBackHandler } from '../lib/androidBridge';
import { AdminAnnouncementSection } from './AdminAnnouncementSection';
import { AdminAppReleaseSection } from './AdminAppReleaseSection';
import { AdminDirectPayoutModal } from './AdminDirectPayoutModal';
import { AdminPaymentMethodsSection } from './AdminPaymentMethodsSection';
import { AdminReferralManagement } from './AdminReferralManagement';
import type {
  AdminAnalytics,
  AuditLogEntry,
  AuthorizedAdminEmail,
  BonusCampaign,
  DepositRecord,
  GameCategory,
  GameEngineType,
  GameItem,
  GameSessionRecord,
  IndividualUserWithdrawalSetting,
  LedgerTransaction,
  MerchantPaymentConfig,
  UserProfile,
  WalletSummary,
  WithdrawalConfig,
  WithdrawalRecord,
  WithdrawalStatus,
} from '../types';

interface AdminUserRow extends UserProfile {
  wallet: WalletSummary;
  gamesPlayed: number;
  gamesWon: number;
  totalGameWinnings: number;
  totalGameStaked: number;
  approvedDepositsCount: number;
  approvedDepositsTotal: number;
  individualWithdrawalSetting?: IndividualUserWithdrawalSetting | null;
}

interface AdminOverviewData {
  analytics: AdminAnalytics;
  users: AdminUserRow[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  games: GameItem[];
  bonusCampaigns: BonusCampaign[];
  welcomeBonusConfig: {
    amount: number;
    expiryDays: number;
    enabled: boolean;
    terms: string;
  };
  merchantPaymentConfig: MerchantPaymentConfig;
  withdrawalConfig?: WithdrawalConfig;
  authorizedAdminEmails?: AuthorizedAdminEmail[];
  auditLogs: AuditLogEntry[];
}

type AdminSection =
  | 'analytics'
  | 'users'
  | 'deposits'
  | 'payment_methods'
  | 'withdrawals'
  | 'games'
  | 'referrals'
  | 'app_release'
  | 'announcements'
  | 'bonuses'
  | 'admins'
  | 'audit';

export const AdminDashboard: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [authError, setAuthError] = useState('');
  const [section, setSection] = useState<AdminSection>('analytics');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [userTriageFilter, setUserTriageFilter] = useState<
    'all' | 'pending_withdrawal' | 'pending_deposit'
  >('all');
  const [recentUserAlerts, setRecentUserAlerts] = useState<
    Record<string, { type: 'withdrawal' | 'deposit'; at: number }>
  >({});
  const [withdrawalFilter, setWithdrawalFilter] = useState<string>('ALL');
  const [selectedUserHistory, setSelectedUserHistory] = useState<{
    user: AdminUserRow;
    gameSessions: GameSessionRecord[];
    transactions: LedgerTransaction[];
  } | null>(null);

  // Merchant UPI & QR config form
  const [merchantUpi, setMerchantUpi] = useState('gamereward.pay@okaxis');
  const [merchantName, setMerchantName] = useState('GameReward Official');
  const [savingConfig, setSavingConfig] = useState(false);

  // Withdrawal limit & notification banner config form
  const [minWithdrawalInput, setMinWithdrawalInput] = useState('5000');
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerTitle, setBannerTitle] = useState('Withdrawal Notice');
  const [bannerMessage, setBannerMessage] = useState('');
  const [savingWithdrawalCfg, setSavingWithdrawalCfg] = useState(false);

  // Per-deposit admin verification overrides
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [includeBonuses, setIncludeBonuses] = useState<Record<string, boolean>>({});
  const [depositRejectReasons, setDepositRejectReasons] = useState<Record<string, string>>({});
  const [copiedUtrId, setCopiedUtrId] = useState<string | null>(null);

  // Per-user direct wallet credit inline form
  const [creditingUserId, setCreditingUserId] = useState<string | null>(null);
  const [directCreditAmt, setDirectCreditAmt] = useState('500');
  const [directCreditBucket, setDirectCreditBucket] = useState<'available' | 'bonus'>('available');
  const [directCreditNote, setDirectCreditNote] = useState('Manual UPI deposit credit');
  const [creditingBusy, setCreditingBusy] = useState(false);

  // User Management profile selection & direct UPI payout modal
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const [directPayoutWithdrawal, setDirectPayoutWithdrawal] = useState<WithdrawalRecord | null>(null);

  // Per-user Individual Withdrawal Settings inline form
  const [editingUserWithdrawalSettings, setEditingUserWithdrawalSettings] = useState(false);
  const [userMinWithdrawalInput, setUserMinWithdrawalInput] = useState('');
  const [userCustomNoticeInput, setUserCustomNoticeInput] = useState('');
  const [savingUserWithdrawalSettings, setSavingUserWithdrawalSettings] = useState(false);

  // Per-user Custom Game Win Ratio control
  const [userWinRatioInput, setUserWinRatioInput] = useState<number>(50);
  const [savingUserWinRatio, setSavingUserWinRatio] = useState(false);

  // Rejection modal state
  const [rejectingWithdrawal, setRejectingWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  // New game form
  const [newGameName, setNewGameName] = useState('');
  const [newGameCategory, setNewGameCategory] = useState<GameCategory>('Casino');
  const [newGameEngine, setNewGameEngine] = useState<GameEngineType>('wheel');
  const [newGameMultiplier, setNewGameMultiplier] = useState('2.5');
  const [newGameWinRatio, setNewGameWinRatio] = useState('50');
  const [newGameTournament, setNewGameTournament] = useState(false);

  // Per-game Win Ratio % controls
  const [gameRatioEdits, setGameRatioEdits] = useState<Record<string, number>>({});
  const [savingGameId, setSavingGameId] = useState<string | null>(null);

  // New campaign form
  const [campTitle, setCampTitle] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [campAmount, setCampAmount] = useState('50');

  // Welcome bonus form
  const [wbAmount, setWbAmount] = useState('100');
  const [wbExpiry, setWbExpiry] = useState('30');
  const [wbEnabled, setWbEnabled] = useState(true);

  // Authorized Admin Gmail management form
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [savingAdminEmail, setSavingAdminEmail] = useState(false);
  const [removingAdminEmail, setRemovingAdminEmail] = useState<string | null>(null);

  const loadOverview = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getAdminOverviewFirestore();
      setAuthError('');
      setData(res);
      if (!silent) {
        setWbAmount(String(res.welcomeBonusConfig.amount));
        setWbExpiry(String(res.welcomeBonusConfig.expiryDays));
        setWbEnabled(res.welcomeBonusConfig.enabled);
        if (res.merchantPaymentConfig) {
          setMerchantUpi(res.merchantPaymentConfig.upiId);
          setMerchantName(res.merchantPaymentConfig.merchantName);
        }
        if (res.withdrawalConfig) {
          setMinWithdrawalInput(String(res.withdrawalConfig.minWithdrawalLimit));
          setBannerEnabled(Boolean(res.withdrawalConfig.noticeBannerEnabled));
          setBannerTitle(res.withdrawalConfig.noticeBannerTitle || 'Withdrawal Notice');
          setBannerMessage(res.withdrawalConfig.noticeBannerMessage || '');
        }
      }
      setCreditAmounts((prev) => {
        const next = { ...prev };
        for (const d of res.deposits) {
          if (d.status === 'Pending' && next[d.id] === undefined) {
            next[d.id] = String(d.amount);
          }
        }
        return next;
      });
      setIncludeBonuses((prev) => {
        const next = { ...prev };
        for (const d of res.deposits) {
          if (d.status === 'Pending' && next[d.id] === undefined) {
            next[d.id] = true;
          }
        }
        return next;
      });
      setGameRatioEdits((prev) => {
        const next = { ...prev };
        for (const g of res.games) {
          if (next[g.id] === undefined) {
            next[g.id] = Math.round(((g.minWinRatio ?? 50) + (g.maxWinRatio ?? 50)) / 2);
          }
        }
        return next;
      });
    } catch (err) {
      if (!silent) {
        setAuthError(err instanceof Error ? err.message : 'Admin access denied.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview(false);

    // Real-time Firestore listener on `transactions` for instant deposit & withdrawal alerts
    let isInitialSnap = true;
    const unsubTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        if (isInitialSnap) {
          isInitialSnap = false;
          return;
        }
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const txData = change.doc.data() as Record<string, unknown>;
            const kind = txData.type === 'withdraw' ? 'withdrawal' : 'deposit';
            const uid = String(txData.userId || '');
            const userName = String(txData.userName || 'Player');
            const amount = Number(txData.amount || 0);
            if (uid) {
              const stampedAt = Date.now();
              setRecentUserAlerts((prev) => ({
                ...prev,
                [uid]: { type: kind, at: stampedAt },
              }));
              window.setTimeout(() => {
                setRecentUserAlerts((prev) => {
                  if (!prev[uid] || prev[uid].at !== stampedAt) return prev;
                  const copy = { ...prev };
                  delete copy[uid];
                  return copy;
                });
              }, 25000);
            }
            if (txData.status === 'pending' && amount > 0) {
              notifyAction(
                kind === 'withdrawal'
                  ? `New withdrawal request of ${formatINR(amount)} from ${userName}`
                  : `New deposit request (${formatINR(amount)}) from ${userName}`
              );
            }
          }
        });
        loadOverview(true);
      },
      () => {
        // Ignore transient Firestore listener errors
      }
    );

    return () => {
      unsubTx();
    };
  }, []);

  const notifyAction = (msg: string) => {
    setActionError('');
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const notifyError = (msg: string) => {
    setActionMsg('');
    setActionError(msg);
    setTimeout(() => setActionError(''), 4500);
  };

  const handleSaveMerchantConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await adminSaveQuickMerchantConfigFirestore(merchantUpi, merchantName);
      notifyAction(`Merchant UPI updated to ${merchantUpi}. User QR codes updated immediately.`);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to save merchant UPI settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveWithdrawalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const minVal = Math.round(Number(minWithdrawalInput || 0));
    if (!Number.isFinite(minVal) || minVal < 100 || minVal > 100000) {
      notifyError('Minimum withdrawal limit must be between ₹100 and ₹1,00,000.');
      return;
    }
    setSavingWithdrawalCfg(true);
    try {
      await adminSaveWithdrawalConfigFirestore({
        minWithdrawalLimit: minVal,
        noticeBannerEnabled: bannerEnabled,
        noticeBannerTitle: bannerTitle.trim() || 'Withdrawal Notice',
        noticeBannerMessage: bannerMessage.trim(),
        updatedAt: new Date().toISOString(),
      });
      notifyAction(
        `Withdrawal settings saved (Min: ${formatINR(minVal)} · Notice Banner: ${bannerEnabled ? 'ON' : 'OFF'}).`
      );
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to save withdrawal settings.');
    } finally {
      setSavingWithdrawalCfg(false);
    }
  };

  const handleDirectUserCredit = async (e: React.FormEvent, user: AdminUserRow) => {
    e.preventDefault();
    const amount = Math.round(Number(directCreditAmt));
    if (!Number.isFinite(amount) || amount === 0) {
      notifyError('Enter a valid non-zero amount.');
      return;
    }
    setCreditingBusy(true);
    try {
      await adminCreditUserFirestore({
        userId: user.id,
        amount,
        bucket: directCreditBucket,
        note: directCreditNote.trim() || 'Admin wallet credit',
      });
      setCreditingUserId(null);
      notifyAction(
        `Updated ${user.name} (${user.id}) ${
          directCreditBucket === 'bonus' ? 'Bonus' : 'Available'
        } Balance by ${formatINR(amount)}.`
      );
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to credit user account.');
    } finally {
      setCreditingBusy(false);
    }
  };

  const openUserProfile = (user: AdminUserRow) => {
    const existing = user.individualWithdrawalSetting;
    setSelectedProfileUserId(user.id);
    setCreditingUserId(null);
    setRecentUserAlerts((prev) => {
      if (!prev[user.id]) return prev;
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
    setUserMinWithdrawalInput(
      existing && typeof existing.custom_minimum_withdrawal === 'number'
        ? String(existing.custom_minimum_withdrawal)
        : ''
    );
    setUserCustomNoticeInput(existing?.custom_withdrawal_notice || '');
    setEditingUserWithdrawalSettings(!existing);
    setUserWinRatioInput(
      typeof user.customWinRatio === 'number' && Number.isFinite(user.customWinRatio)
        ? user.customWinRatio
        : 50
    );
  };

  const handleSaveUserWinRatio = async (user: AdminUserRow, ratioValue: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(ratioValue))));
    if (!Number.isFinite(clamped)) {
      notifyError('Enter a valid win ratio between 0% and 100%.');
      return;
    }
    setSavingUserWinRatio(true);
    try {
      await adminSaveUserWinRatioFirestore(user.id, clamped);
      setUserWinRatioInput(clamped);
      notifyAction(
        `Game win ratio for ${user.name} set to ${clamped}%. Active immediately across all games.`
      );
      await loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to update user game win ratio.');
    } finally {
      setSavingUserWinRatio(false);
    }
  };

  const handleResetUserWinRatio = async (user: AdminUserRow) => {
    setSavingUserWinRatio(true);
    try {
      await adminSaveUserWinRatioFirestore(user.id, null);
      setUserWinRatioInput(50);
      notifyAction(`Reset ${user.name}'s game win ratio to Global Game Default.`);
      await loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to reset user game win ratio.');
    } finally {
      setSavingUserWinRatio(false);
    }
  };

  const handleSaveUserWithdrawalSettings = async (e: React.FormEvent, user: AdminUserRow) => {
    e.preventDefault();
    const trimmedMin = userMinWithdrawalInput.trim();
    let parsedMin: number | null = null;
    if (trimmedMin !== '') {
      const val = Math.round(Number(trimmedMin));
      if (!Number.isFinite(val) || val < 100 || val > 500000) {
        notifyError('Minimum withdrawal amount must be between ₹100 and ₹5,00,000.');
        return;
      }
      parsedMin = val;
    }
    const trimmedNotice = userCustomNoticeInput.trim();
    if (trimmedNotice.length > 500) {
      notifyError('Custom withdrawal notice cannot exceed 500 characters.');
      return;
    }

    setSavingUserWithdrawalSettings(true);
    try {
      await adminSaveUserWithdrawalSettingsFirestore(
        user.id,
        parsedMin,
        trimmedNotice.length > 0 ? trimmedNotice : null
      );
      setEditingUserWithdrawalSettings(false);
      notifyAction(
        parsedMin === null && trimmedNotice.length === 0
          ? `Restored global default withdrawal settings for ${user.name} (${user.id}).`
          : `Saved individual withdrawal settings for ${user.name} (${user.id}).`
      );
      await loadOverview(true);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : 'Failed to save individual withdrawal settings.'
      );
    } finally {
      setSavingUserWithdrawalSettings(false);
    }
  };

  const handleResetUserWithdrawalSettings = async (user: AdminUserRow) => {
    setSavingUserWithdrawalSettings(true);
    try {
      await adminSaveUserWithdrawalSettingsFirestore(user.id, null, null);
      setUserMinWithdrawalInput('');
      setUserCustomNoticeInput('');
      setEditingUserWithdrawalSettings(false);
      notifyAction(
        `Reset ${user.name} (${user.id}) to global default withdrawal settings.`
      );
      await loadOverview(true);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : 'Failed to reset individual withdrawal settings.'
      );
    } finally {
      setSavingUserWithdrawalSettings(false);
    }
  };

  const handleCopyUtr = (id: string, utr: string) => {
    navigator.clipboard?.writeText(utr).catch(() => {});
    setCopiedUtrId(id);
    setTimeout(() => setCopiedUtrId((curr) => (curr === id ? null : curr)), 2000);
  };

  const handleToggleUserStatus = async (user: AdminUserRow) => {
    const next = user.status === 'active' ? 'suspended' : 'active';
    try {
      await adminToggleUserStatusFirestore(user.id, next);
      notifyAction(`User ${user.name} marked ${next}.`);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to update user status.');
    }
  };

  const handleReviewKyc = async (userId: string, kycStatus: 'verified' | 'rejected') => {
    try {
      await adminReviewKycFirestore(userId, kycStatus);
      notifyAction(`KYC for ${userId} set to ${kycStatus}.`);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to review KYC.');
    }
  };

  const handleViewUserHistory = async (user: AdminUserRow) => {
    try {
      const res = await adminGetUserHistoryFirestore(user.id);
      setSelectedUserHistory({ user, ...res });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to load user history.');
    }
  };

  const handleDepositAction = async (deposit: DepositRecord, status: 'Successful' | 'Failed') => {
    try {
      if (status === 'Successful') {
        const creditVal = Math.round(Number(creditAmounts[deposit.id] ?? deposit.amount));
        if (!Number.isFinite(creditVal) || creditVal < 1) {
          notifyError('Enter a valid credit amount of at least ₹1.');
          return;
        }
        const includeBonus = includeBonuses[deposit.id] !== false;
        await adminReviewDepositFirestore({
          depositId: deposit.id,
          status: 'Successful',
          creditedAmount: creditVal,
          includeBonus,
        });
        notifyAction(
          `Added ${formatINR(creditVal)} to ${deposit.userName} (${deposit.userId}) wallet.`
        );
      } else {
        const reason =
          (depositRejectReasons[deposit.id] || '').trim() ||
          'Transaction ID / UTR could not be verified';
        await adminReviewDepositFirestore({
          depositId: deposit.id,
          status: 'Failed',
          reason,
        });
        notifyAction(`Deposit ${deposit.id} rejected.`);
      }
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to update deposit.');
    }
  };

  const handleWithdrawalStatus = async (
    id: string,
    status: WithdrawalStatus,
    reason?: string
  ) => {
    const trimmedReason = (reason || '').trim();
    if (status === 'Rejected' && trimmedReason.length < 4) {
      setRejectionError('Please enter a clear rejection reason (at least 4 characters).');
      return;
    }
    setRejectionError('');
    try {
      await adminUpdateWithdrawalStatusFirestore({
        withdrawalId: id,
        status,
        rejectionReason: trimmedReason || undefined,
      });
      setRejectingWithdrawal(null);
      setRejectionReason('');
      setRejectionError('');
      notifyAction(`Withdrawal ${id} updated to ${status}.`);
      loadOverview(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update withdrawal status.';
      if (status === 'Rejected') {
        setRejectionError(msg);
      } else {
        notifyError(msg);
      }
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const ratioVal = Math.max(5, Math.min(95, Math.round(Number(newGameWinRatio || 50))));
    try {
      await adminAddGameFirestore({
        name: newGameName,
        category: newGameCategory,
        engine: newGameEngine,
        winMultiplier: Number(newGameMultiplier),
        winRatio: ratioVal,
        isTournament: newGameTournament,
      });
      setNewGameName('');
      notifyAction(`New game published with ${ratioVal}% win ratio.`);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to add game.');
    }
  };

  const handleSaveGameWinRatio = async (game: GameItem) => {
    const ratio = Math.max(
      5,
      Math.min(
        95,
        Math.round(
          gameRatioEdits[game.id] ?? Math.round((game.minWinRatio + game.maxWinRatio) / 2)
        )
      )
    );
    setSavingGameId(game.id);
    try {
      await adminUpdateGameWinRatioFirestore(game.id, ratio);
      notifyAction(`Updated ${game.name} win ratio to ${ratio}%.`);
      await loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to update game win ratio.');
    } finally {
      setSavingGameId(null);
    }
  };

  const handleDeleteGame = async (id: string) => {
    try {
      await adminDeleteGameFirestore(id);
      notifyAction('Game removed.');
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to delete game.');
    }
  };

  const handleSaveWelcomeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminSaveWelcomeBonusFirestore({
        amount: Number(wbAmount),
        expiryDays: Number(wbExpiry),
        enabled: wbEnabled,
      });
      notifyAction('Welcome bonus configuration saved.');
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to save welcome bonus config.');
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateCampaignFirestore({
        title: campTitle,
        description: campDesc,
        rewardAmount: Number(campAmount),
      });
      setCampTitle('');
      setCampDesc('');
      notifyAction('Promotional campaign launched.');
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to create campaign.');
    }
  };

  const handleAddAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newAdminEmail.trim().toLowerCase();
    if (!cleaned) return;
    setSavingAdminEmail(true);
    try {
      const res = await adminAddAdminEmailFirestore(cleaned);
      setNewAdminEmail('');
      setData((prev) =>
        prev ? { ...prev, authorizedAdminEmails: res.authorizedAdminEmails } : prev
      );
      notifyAction(res.message);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to add admin Email ID.');
    } finally {
      setSavingAdminEmail(false);
    }
  };

  const handleRemoveAdminEmail = async (email: string) => {
    setRemovingAdminEmail(email);
    try {
      const res = await adminRemoveAdminEmailFirestore(email);
      setData((prev) =>
        prev ? { ...prev, authorizedAdminEmails: res.authorizedAdminEmails } : prev
      );
      notifyAction(res.message);
      loadOverview(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Unable to remove admin access.');
    } finally {
      setRemovingAdminEmail(null);
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-[#071126] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-[#0D1B38] border border-rose-500/40 p-6 space-y-4 shadow-2xl text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/15 text-rose-300 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-white">Admin Access Restricted</h1>
          <p className="text-xs text-slate-300 leading-relaxed">{authError}</p>
          <button
            type="button"
            onClick={onExit}
            className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm"
          >
            Back to User App
          </button>
        </div>
      </div>
    );
  }

  const filteredUsers = (data?.users || []).filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.mobile.includes(userSearch) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredWithdrawals = (data?.withdrawals || []).filter(
    (w) => withdrawalFilter === 'ALL' || w.status === withdrawalFilter
  );

  const adminBackStateRef = React.useRef({
    previewScreenshot,
    rejectingWithdrawal,
    directPayoutWithdrawal,
    selectedUserHistory,
    selectedProfileUserId,
    section,
    onExit,
  });
  adminBackStateRef.current = {
    previewScreenshot,
    rejectingWithdrawal,
    directPayoutWithdrawal,
    selectedUserHistory,
    selectedProfileUserId,
    section,
    onExit,
  };

  useEffect(() => {
    return registerBackHandler(() => {
      const s = adminBackStateRef.current;
      if (s.previewScreenshot) {
        setPreviewScreenshot(null);
        return true;
      }
      if (s.rejectingWithdrawal) {
        setRejectingWithdrawal(null);
        setRejectionReason('');
        setRejectionError('');
        return true;
      }
      if (s.directPayoutWithdrawal) {
        setDirectPayoutWithdrawal(null);
        return true;
      }
      if (s.selectedUserHistory) {
        setSelectedUserHistory(null);
        return true;
      }
      if (s.selectedProfileUserId) {
        setSelectedProfileUserId(null);
        setCreditingUserId(null);
        return true;
      }
      if (s.section !== 'analytics') {
        setSection('analytics');
        return true;
      }
      s.onExit();
      return true;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#071126] text-slate-100 pb-safe">
      {/* Admin Top Header with Android Status-Bar Safe Area */}
      <header className="sticky top-0 z-30 pt-safe-top bg-[#0A1630]/95 backdrop-blur border-b border-blue-900/50 px-4 lg:px-8">
        <div className="py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="min-h-[40px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-slate-200 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>User App</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-white">GameReward Owner Admin</h1>
            <p className="text-xs text-slate-400">Firebase Firestore · Real-time Admin Console</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadOverview(false)}
            className="min-h-[38px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-blue-200 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onExit}
            className="min-h-[38px] px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold"
          >
            Exit Admin
          </button>
        </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 space-y-1.5">
          {([
            ['analytics', 'Analytics', BarChart3],
            ['users', 'User Management', Users],
            ['deposits', 'Deposits', CreditCard],
            ['payment_methods', 'Payment Methods', QrCode],
            ['withdrawals', 'Withdrawals', Wallet],
            ['games', 'Game Management', Gamepad2],
            ['referrals', 'Referral Management', Share2],
            ['app_release', 'App Upload & Share', Smartphone],
            ['announcements', 'App Notices / Info', Megaphone],
            ['bonuses', 'Bonuses & Promos', Gift],
            ['admins', 'Admin Access', ShieldCheck],
            ['audit', 'Audit Logs', Activity],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => {
                setSection(key);
                if (key === 'users') {
                  setSelectedProfileUserId(null);
                }
              }}
              className={`w-full min-h-[44px] px-4 rounded-xl flex items-center justify-between gap-2 text-sm font-medium transition-colors ${
                section === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0D1B38] text-slate-300 hover:bg-[#13264F] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </span>
              {key === 'users' &&
                (() => {
                  const usersNeedingTriage = (data?.users || []).filter((usr) => {
                    const hasPendingWdr = (data?.withdrawals || []).some(
                      (w) =>
                        w.userId === usr.id &&
                        w.status !== 'Completed' &&
                        w.status !== 'Rejected'
                    );
                    const hasPendingDep = (data?.deposits || []).some(
                      (d) => d.userId === usr.id && d.status === 'Pending'
                    );
                    return hasPendingWdr || hasPendingDep;
                  }).length;
                  if (usersNeedingTriage === 0) return null;
                  return (
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-sky-400 text-[#071126] font-mono-num text-[11px] font-extrabold flex items-center justify-center">
                      {usersNeedingTriage}
                    </span>
                  );
                })()}
              {key === 'deposits' && (data?.analytics.pendingDepositsCount ?? 0) > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-400 text-[#071126] font-mono-num text-[11px] font-extrabold flex items-center justify-center">
                  {data?.analytics.pendingDepositsCount}
                </span>
              )}
              {key === 'withdrawals' && (data?.analytics.pendingWithdrawalsCount ?? 0) > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-300 text-[#071126] font-mono-num text-[11px] font-extrabold flex items-center justify-center">
                  {data?.analytics.pendingWithdrawalsCount}
                </span>
              )}
            </button>
          ))}
        </aside>

        {/* Main Admin Workspace */}
        <main className="lg:col-span-9 space-y-5">
          {actionMsg && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionMsg}</span>
            </div>
          )}
          {actionError && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {loading || !data ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading admin data...</div>
          ) : (
            <>
              {/* ANALYTICS */}
              {section === 'analytics' && (
                <div className="space-y-5">
                  {data.analytics.pendingDepositsCount > 0 && (
                    <div className="rounded-2xl bg-amber-500/15 border border-amber-400/50 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-amber-200">
                          {data.analytics.pendingDepositsCount} Pending Deposit Request
                          {data.analytics.pendingDepositsCount > 1 ? 's' : ''} Waiting for UTR Verification
                        </p>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Review user Transaction IDs and add money directly to their account balance.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSection('deposits')}
                        className="min-h-[42px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071126] text-xs font-extrabold whitespace-nowrap"
                      >
                        Open Deposit Requests
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Registered Users" value={String(data.analytics.totalUsers)} sub={`${data.analytics.activeUsers} active · ${data.analytics.verifiedKycUsers} KYC`} />
                    <StatCard label="Verified Deposits" value={formatINR(data.analytics.totalDeposits)} sub={`${data.analytics.pendingDepositsCount} pending`} />
                    <StatCard label="Rewards Paid" value={formatINR(data.analytics.totalRewardsDistributed)} sub="Skill-based verified" />
                    <StatCard label="Completed Payouts" value={formatINR(data.analytics.totalWithdrawalsCompleted)} sub={`${data.analytics.pendingWithdrawalsCount} pending (${formatINR(data.analytics.pendingWithdrawalsAmount)})`} />
                  </div>

                  <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5">
                    <h2 className="text-base font-bold text-white mb-4">Daily, Weekly & Monthly Breakdown</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-blue-900/50 text-xs text-slate-400">
                            <th className="py-2.5 pr-4">Period</th>
                            <th className="py-2.5 px-4">Deposits</th>
                            <th className="py-2.5 px-4">Game Rewards</th>
                            <th className="py-2.5 px-4">Withdrawals</th>
                            <th className="py-2.5 pl-4">Games Played</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-900/30 font-mono-num">
                          {(['daily', 'weekly', 'monthly'] as const).map((p) => {
                            const row = data.analytics.periodStats[p];
                            return (
                              <tr key={p}>
                                <td className="py-3 pr-4 font-sans capitalize font-medium text-white">{p}</td>
                                <td className="py-3 px-4 text-emerald-400">{formatINR(row.deposits)}</td>
                                <td className="py-3 px-4 text-blue-300">{formatINR(row.rewards)}</td>
                                <td className="py-3 px-4 text-amber-300">{formatINR(row.withdrawals)}</td>
                                <td className="py-3 pl-4 text-slate-200">{row.plays}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* USER MANAGEMENT */}
              {section === 'users' && (() => {
                const selectedProfileUser = selectedProfileUserId
                  ? data.users.find((u) => u.id === selectedProfileUserId) || null
                  : null;

                if (selectedProfileUser) {
                  const u = selectedProfileUser;
                  const customSetting = u.individualWithdrawalSetting || null;
                  const globalMinLimit = data.withdrawalConfig?.minWithdrawalLimit ?? 5000;
                  const activeMinLimit = u.wallet.minWithdrawalLimit ?? globalMinLimit;
                  const hasCustomMin =
                    customSetting !== null &&
                    typeof customSetting.custom_minimum_withdrawal === 'number';
                  const hasCustomNotice =
                    customSetting !== null &&
                    Boolean(customSetting.custom_withdrawal_notice?.trim());

                  const userWithdrawals = data.withdrawals
                    .filter((w) => w.userId === u.id)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  const activeWithdrawals = userWithdrawals.filter(
                    (w) => w.status !== 'Completed' && w.status !== 'Rejected'
                  );
                  const pastWithdrawals = userWithdrawals.filter(
                    (w) => w.status === 'Completed' || w.status === 'Rejected'
                  );
                  const pendingDeposits = data.deposits
                    .filter((d) => d.userId === u.id && d.status === 'Pending')
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                  return (
                    <div className="space-y-4">
                      {/* Back to User List */}
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProfileUserId(null);
                            setCreditingUserId(null);
                          }}
                          className="min-h-[40px] px-3.5 rounded-xl bg-[#0D1B38] hover:bg-[#152954] border border-blue-900/60 text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>Back to User List</span>
                        </button>
                        <span className="text-xs font-mono-num text-slate-400">
                          User Profile · {u.id}
                        </span>
                      </div>

                      {/* Full User Profile Card */}
                      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-bold text-white">{u.name}</h2>
                              <span className="text-xs font-mono-num text-blue-300">{u.id}</span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                  u.status === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {u.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300">
                              +91 {u.mobile}
                              {u.email ? ` · ${u.email}` : ''} · {u.state} · KYC:{' '}
                              <span className="capitalize font-semibold text-amber-300">
                                {u.kycStatus}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Joined {formatDateTime(u.createdAt)} · Games Played:{' '}
                              <span className="font-mono-num text-slate-200">{u.gamesPlayed}</span> · Min Withdrawal:{' '}
                              <span
                                className={`font-mono-num font-semibold ${
                                  hasCustomMin ? 'text-sky-300' : 'text-slate-200'
                                }`}
                              >
                                {formatINR(activeMinLimit)}
                              </span>{' '}
                              ({hasCustomMin ? 'Custom' : 'Default'})
                              {hasCustomNotice && (
                                <span className="text-sky-300 font-medium"> · Custom Notice Active</span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Highlighted User Performance & Financial Metrics */}
                        {(() => {
                          const totalWon = u.totalGameWinnings ?? u.wallet.totalEarnings ?? 0;
                          const totalDep = u.approvedDepositsTotal ?? u.wallet.totalDeposits ?? 0;
                          const actualWinPct =
                            u.gamesPlayed > 0
                              ? Math.round((u.gamesWon / u.gamesPlayed) * 100)
                              : 0;
                          const hasCustomWinRatio =
                            typeof u.customWinRatio === 'number' &&
                            Number.isFinite(u.customWinRatio);

                          return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                              <div className="rounded-xl bg-gradient-to-br from-emerald-500/15 to-[#071126] border border-emerald-500/40 p-3">
                                <p className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                                  <Trophy className="w-3.5 h-3.5" />
                                  <span>Total Won</span>
                                </p>
                                <p className="text-base font-extrabold font-mono-num text-emerald-400 mt-0.5">
                                  {formatINR(totalWon)}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono-num mt-0.5">
                                  {u.gamesWon}/{u.gamesPlayed} wins ({actualWinPct}%)
                                </p>
                              </div>

                              <div className="rounded-xl bg-gradient-to-br from-sky-500/15 to-[#071126] border border-sky-500/40 p-3">
                                <p className="text-[11px] font-semibold text-sky-300 flex items-center gap-1">
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>Total Deposited</span>
                                </p>
                                <p className="text-base font-extrabold font-mono-num text-white mt-0.5">
                                  {formatINR(totalDep)}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono-num mt-0.5">
                                  {u.approvedDepositsCount} approved deposit{u.approvedDepositsCount === 1 ? '' : 's'}
                                </p>
                              </div>

                              <div className="rounded-xl bg-[#071126] border border-blue-900/50 p-3">
                                <p className="text-[11px] text-slate-400">Available Balance</p>
                                <p className="text-base font-bold font-mono-num text-emerald-300 mt-0.5">
                                  {formatINR(u.wallet.availableBalance)}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Withdrawable</p>
                              </div>

                              <div className="rounded-xl bg-[#071126] border border-blue-900/50 p-3">
                                <p className="text-[11px] text-slate-400">Bonus Balance</p>
                                <p className="text-base font-bold font-mono-num text-blue-300 mt-0.5">
                                  {formatINR(u.wallet.bonusBalance)}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Promo / Referral</p>
                              </div>

                              <div className="rounded-xl bg-[#071126] border border-blue-900/50 p-3">
                                <p className="text-[11px] text-slate-400">Total Withdrawn</p>
                                <p className="text-base font-bold font-mono-num text-amber-300 mt-0.5">
                                  {formatINR(u.wallet.totalWithdrawals)}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono-num mt-0.5">
                                  Staked: {formatINR(u.totalGameStaked ?? 0)}
                                </p>
                              </div>

                              <div
                                className={`rounded-xl bg-[#071126] border p-3 ${
                                  hasCustomWinRatio
                                    ? 'border-amber-400/50'
                                    : 'border-blue-900/50'
                                }`}
                              >
                                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <Percent className="w-3 h-3 text-amber-300" />
                                  <span>Game Win Ratio</span>
                                </p>
                                <p
                                  className={`text-base font-extrabold font-mono-num mt-0.5 ${
                                    hasCustomWinRatio ? 'text-amber-300' : 'text-slate-200'
                                  }`}
                                >
                                  {hasCustomWinRatio ? `${u.customWinRatio}%` : 'Default'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {hasCustomWinRatio ? 'Custom Override' : 'Global Game Ratio'}
                                </p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Account Controls */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (creditingUserId === u.id) {
                                setCreditingUserId(null);
                              } else {
                                setCreditingUserId(u.id);
                                setDirectCreditAmt('500');
                                setDirectCreditBucket('available');
                                setDirectCreditNote('Admin verified payment credit');
                              }
                            }}
                            className="min-h-[40px] px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5"
                          >
                            <IndianRupee className="w-3.5 h-3.5" />
                            <span>{creditingUserId === u.id ? 'Close Credit Form' : 'Add Money'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewUserHistory(u)}
                            className="min-h-[40px] px-3.5 rounded-lg bg-[#152954] hover:bg-[#1E3B75] text-xs font-semibold text-white"
                          >
                            View Full History
                          </button>
                          {u.kycStatus === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReviewKyc(u.id, 'verified')}
                                className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                              >
                                Approve KYC
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewKyc(u.id, 'rejected')}
                                className="min-h-[40px] px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white"
                              >
                                Reject KYC
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(u)}
                            className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold ${
                              u.status === 'active'
                                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            }`}
                          >
                            {u.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                          </button>
                        </div>

                        {/* Inline Add Money Form */}
                        {creditingUserId === u.id && (
                          <form
                            onSubmit={(e) => handleDirectUserCredit(e, u)}
                            className="rounded-xl bg-[#071126] border border-emerald-500/40 p-3.5 space-y-3"
                          >
                            <p className="text-xs font-semibold text-emerald-300">
                              Direct Wallet Credit to {u.name} ({u.id})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                  Amount (₹)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={500000}
                                  value={directCreditAmt}
                                  onChange={(e) => setDirectCreditAmt(e.target.value)}
                                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#0D1B38] border border-blue-800/70 text-white font-mono-num text-sm"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                  Wallet Bucket
                                </label>
                                <select
                                  value={directCreditBucket}
                                  onChange={(e) =>
                                    setDirectCreditBucket(
                                      e.target.value === 'bonus' ? 'bonus' : 'available'
                                    )
                                  }
                                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#0D1B38] border border-blue-800/70 text-white text-sm"
                                >
                                  <option value="available">Available Balance (Withdrawable)</option>
                                  <option value="bonus">Bonus Balance</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                  Reference / Note
                                </label>
                                <input
                                  type="text"
                                  value={directCreditNote}
                                  onChange={(e) => setDirectCreditNote(e.target.value)}
                                  placeholder="e.g. Verified PhonePe transfer"
                                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#0D1B38] border border-blue-800/70 text-white text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                disabled={creditingBusy}
                                className="min-h-[42px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                              >
                                {creditingBusy
                                  ? 'Crediting...'
                                  : `Add ${formatINR(Math.max(0, Number(directCreditAmt) || 0))} to User Account`}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreditingUserId(null)}
                                className="min-h-[42px] px-3.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>

                      {/* User Withdrawal Requests & Direct UPI / PhonePe / GPay Payout */}
                      {(activeWithdrawals.length > 0 || pastWithdrawals.length > 0) && (
                        <div className="rounded-2xl bg-[#0D1B38] border border-sky-500/40 p-4 sm:p-5 space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <Wallet className="w-4 h-4 text-sky-400" />
                              <span>Withdrawal Requests &amp; Direct Payout</span>
                            </h3>
                            {activeWithdrawals.length > 0 && (
                              <span className="px-2.5 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/40 text-[11px] font-bold text-sky-200">
                                {activeWithdrawals.length} Pending Action
                              </span>
                            )}
                          </div>

                          {activeWithdrawals.length > 0 ? (
                            <div className="space-y-3">
                              {activeWithdrawals.map((w) => (
                                <div
                                  key={w.id}
                                  className="rounded-xl bg-[#071126] border border-sky-500/35 p-3.5 space-y-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="space-y-1">
                                      <p className="text-base font-bold font-mono-num text-white">
                                        {formatINR(w.amount)}{' '}
                                        <span className="text-xs font-sans font-semibold text-amber-300 ml-1">
                                          · {w.status}
                                        </span>
                                      </p>
                                      <p className="text-xs text-sky-300 font-mono-num">
                                        {w.methodType === 'upi'
                                          ? `UPI: ${w.upiId}`
                                          : `Bank: ${w.accountHolderName} · A/C ${w.accountNumber} · IFSC ${w.ifscCode}`}
                                      </p>
                                      <p className="text-[11px] text-slate-400 font-mono-num">
                                        {w.transactionId} · {formatDateTime(w.createdAt)} · Mobile: +91 {u.mobile}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setDirectPayoutWithdrawal(w)}
                                      className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 hover:brightness-110 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-md shadow-blue-950/50 transition-all"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      <span>Pay via UPI / PhonePe / GPay</span>
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap gap-2 pt-1 border-t border-blue-900/50">
                                    <button
                                      type="button"
                                      onClick={() => handleWithdrawalStatus(w.id, 'Processing')}
                                      className="min-h-[36px] px-3 rounded-lg bg-[#152954] hover:bg-blue-600 text-xs font-semibold text-slate-200"
                                    >
                                      Mark Processing
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleWithdrawalStatus(w.id, 'Completed')}
                                      className="min-h-[36px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                                    >
                                      Mark Paid (Completed)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingWithdrawal(w)}
                                      className="min-h-[36px] px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white"
                                    >
                                      Reject &amp; Refund
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">
                              No pending withdrawal requests for this user.
                            </p>
                          )}

                          {pastWithdrawals.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Recent Withdrawal History
                              </p>
                              {pastWithdrawals.slice(0, 5).map((w) => (
                                <div
                                  key={w.id}
                                  className="rounded-lg bg-[#071126] border border-blue-900/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                                >
                                  <span className="font-mono-num text-slate-200">
                                    {formatINR(w.amount)} ·{' '}
                                    {w.methodType === 'upi' ? w.upiId : `${w.accountHolderName} (${w.ifscCode})`}
                                  </span>
                                  <span
                                    className={`font-semibold ${
                                      w.status === 'Completed' ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {w.status} · {formatDateTime(w.createdAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Deposit Requests for this user */}
                      {pendingDeposits.length > 0 && (
                        <div className="rounded-2xl bg-[#0D1B38] border border-amber-400/50 p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-amber-300" />
                              <span>Pending Deposit Requests</span>
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-[11px] font-bold text-amber-200">
                              {pendingDeposits.length} Waiting Verification
                            </span>
                          </div>

                          <div className="space-y-3">
                            {pendingDeposits.map((d) => {
                              const utrDisplay = d.utrNumber || d.userTransactionRef || d.gatewayOrderId;
                              const editedAmtStr = creditAmounts[d.id] ?? String(d.amount);
                              const editedAmtNum = Math.max(0, Math.round(Number(editedAmtStr) || 0));
                              const methodLabel = d.paymentMethod || d.gateway;

                              return (
                                <div
                                  key={d.id}
                                  className="rounded-xl bg-[#071126] border border-amber-400/35 p-3.5 space-y-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-bold text-white font-mono-num">
                                        {formatINR(d.amount)}{' '}
                                        <span className="text-xs font-sans font-normal text-slate-300">
                                          via {methodLabel}
                                        </span>
                                      </p>
                                      <p className="text-[11px] text-slate-400 font-mono-num">
                                        UTR: <span className="text-amber-300 font-semibold">{utrDisplay}</span> ·{' '}
                                        {formatDateTime(d.createdAt)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyUtr(d.id, utrDisplay)}
                                      className="min-h-[34px] px-3 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-blue-200 inline-flex items-center gap-1"
                                    >
                                      {copiedUtrId === d.id ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                          <span className="text-emerald-300">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>Copy UTR</span>
                                        </>
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={500000}
                                      value={editedAmtStr}
                                      onChange={(e) =>
                                        setCreditAmounts((prev) => ({
                                          ...prev,
                                          [d.id]: e.target.value,
                                        }))
                                      }
                                      className="w-32 min-h-[38px] px-3 rounded-lg bg-[#0D1B38] border border-emerald-500/40 text-white font-mono-num text-xs font-bold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleDepositAction(d, 'Successful')}
                                      className="min-h-[38px] px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                                    >
                                      Approve &amp; Add {formatINR(editedAmtNum)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDepositAction(d, 'Failed')}
                                      className="min-h-[38px] px-3.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white"
                                    >
                                      Reject Deposit
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Per-User Game Win Ratio Control */}
                      {(() => {
                        const hasCustomRatio =
                          typeof u.customWinRatio === 'number' &&
                          Number.isFinite(u.customWinRatio);
                        const ratioLabel =
                          userWinRatioInput <= 25
                            ? 'Low Win Chance (House Favor)'
                            : userWinRatioInput <= 55
                            ? 'Balanced Win Chance'
                            : 'High Win Chance (Player Favor)';
                        const ratioTone =
                          userWinRatioInput <= 25
                            ? 'text-rose-300'
                            : userWinRatioInput <= 55
                            ? 'text-amber-300'
                            : 'text-emerald-300';

                        return (
                          <div className="rounded-2xl bg-[#0D1B38] border border-amber-400/45 p-4 sm:p-5 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                  <Gamepad2 className="w-4 h-4 text-amber-400" />
                                  <span>User Game Win Ratio Control</span>
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Change win probability specifically for{' '}
                                  <span className="text-white font-semibold">{u.name}</span> across all Arcade &amp; Casino games. Updates sync in real time.
                                </p>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono-num border ${
                                  hasCustomRatio
                                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                                }`}
                              >
                                {hasCustomRatio
                                  ? `Active Custom: ${u.customWinRatio}%`
                                  : 'Using Global Game Default'}
                              </span>
                            </div>

                            <div className="rounded-xl bg-[#071126] border border-blue-900/50 p-3.5 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={`text-xs font-semibold ${ratioTone}`}>
                                  {ratioLabel}
                                </span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={userWinRatioInput}
                                    disabled={savingUserWinRatio}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      if (!Number.isNaN(v)) {
                                        setUserWinRatioInput(Math.max(0, Math.min(100, Math.round(v))));
                                      }
                                    }}
                                    className="w-20 min-h-[38px] px-2.5 rounded-lg bg-[#0D1B38] border border-amber-400/45 text-center text-white font-mono-num text-sm font-extrabold focus:outline-none focus:border-amber-300"
                                  />
                                  <span className="text-sm font-bold text-amber-300 font-mono-num">%</span>
                                </div>
                              </div>

                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={userWinRatioInput}
                                disabled={savingUserWinRatio}
                                onChange={(e) => setUserWinRatioInput(Number(e.target.value))}
                                className="w-full accent-amber-400 cursor-pointer"
                              />

                              <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
                                <span>0% (No Win)</span>
                                <span>25%</span>
                                <span>50%</span>
                                <span>75%</span>
                                <span>100% (Always Win)</span>
                              </div>

                              {/* Quick Presets */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[11px] text-slate-400 mr-1">Quick Set:</span>
                                {[10, 25, 40, 50, 70, 85].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    disabled={savingUserWinRatio}
                                    onClick={() => setUserWinRatioInput(preset)}
                                    className={`min-h-[32px] px-2.5 rounded-lg text-xs font-mono-num font-bold border transition-colors ${
                                      userWinRatioInput === preset
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#0D1B38] text-slate-200 border-blue-900/60 hover:border-amber-400/50'
                                    }`}
                                  >
                                    {preset}%
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={savingUserWinRatio}
                                onClick={() => handleSaveUserWinRatio(u, userWinRatioInput)}
                                className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-xs font-extrabold text-slate-950 inline-flex items-center gap-1.5 transition-colors"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>
                                  {savingUserWinRatio
                                    ? 'Saving Ratio...'
                                    : `Save ${userWinRatioInput}% Win Ratio`}
                                </span>
                              </button>
                              {hasCustomRatio && (
                                <button
                                  type="button"
                                  disabled={savingUserWinRatio}
                                  onClick={() => handleResetUserWinRatio(u)}
                                  className="min-h-[42px] px-4 rounded-xl bg-[#152954] hover:bg-[#1E3B75] border border-blue-800/70 disabled:opacity-45 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reset to Global Default</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Individual Withdrawal Settings (ONLY 2 configurable fields + 3 controls) */}
                      <form
                        onSubmit={(e) => handleSaveUserWithdrawalSettings(e, u)}
                        className="rounded-2xl bg-[#0D1B38] border border-sky-500/45 p-4 sm:p-5 space-y-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                              <span>Individual Withdrawal Settings</span>
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Applies only to <span className="text-white font-semibold">{u.name}</span> ({u.id}). Leave a field blank to use the global default ({formatINR(globalMinLimit)}).
                            </p>
                          </div>
                          {customSetting?.updated_at && (
                            <span className="text-[11px] text-slate-400">
                              Updated {formatDateTime(customSetting.updated_at)}
                            </span>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-200 mb-1">
                              Minimum Withdrawal Amount (₹)
                            </label>
                            <input
                              type="number"
                              min={100}
                              max={500000}
                              step={1}
                              disabled={!editingUserWithdrawalSettings || savingUserWithdrawalSettings}
                              value={userMinWithdrawalInput}
                              onChange={(e) => setUserMinWithdrawalInput(e.target.value)}
                              placeholder={`Global default: ₹${globalMinLimit}`}
                              className="w-full sm:max-w-xs min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm disabled:opacity-65 disabled:cursor-not-allowed focus:outline-none focus:border-sky-400"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-semibold text-slate-200">
                                Custom Withdrawal Notice
                              </label>
                              <span className="text-[11px] font-mono-num text-slate-400">
                                {userCustomNoticeInput.length}/500
                              </span>
                            </div>
                            <textarea
                              rows={3}
                              maxLength={500}
                              disabled={!editingUserWithdrawalSettings || savingUserWithdrawalSettings}
                              value={userCustomNoticeInput}
                              onChange={(e) => setUserCustomNoticeInput(e.target.value)}
                              placeholder="Enter a custom withdrawal notice visible only to this user (leave blank to use global notice)..."
                              className="w-full px-3.5 py-2.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm resize-y disabled:opacity-65 disabled:cursor-not-allowed focus:outline-none focus:border-sky-400"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={!editingUserWithdrawalSettings || savingUserWithdrawalSettings}
                            className="min-h-[42px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingUserWithdrawalSettings ? 'Saving...' : 'Save Settings'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={editingUserWithdrawalSettings || savingUserWithdrawalSettings}
                            onClick={() => setEditingUserWithdrawalSettings(true)}
                            className="min-h-[42px] px-4 rounded-xl bg-[#152954] hover:bg-[#1E3B75] disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Settings</span>
                          </button>
                          <button
                            type="button"
                            disabled={savingUserWithdrawalSettings}
                            onClick={() => handleResetUserWithdrawalSettings(u)}
                            className="min-h-[42px] px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 disabled:opacity-45 text-xs font-semibold text-amber-200 inline-flex items-center gap-1.5 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset to Default</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  );
                }

                // Simplified User Management List View (click any user to open full profile)
                const pendingWithdrawalUserCount = filteredUsers.filter((usr) =>
                  data.withdrawals.some(
                    (w) =>
                      w.userId === usr.id &&
                      w.status !== 'Completed' &&
                      w.status !== 'Rejected'
                  )
                ).length;
                const pendingDepositUserCount = filteredUsers.filter((usr) =>
                  data.deposits.some((d) => d.userId === usr.id && d.status === 'Pending')
                ).length;

                const triagedUsers = filteredUsers.filter((usr) => {
                  if (userTriageFilter === 'pending_withdrawal') {
                    return data.withdrawals.some(
                      (w) =>
                        w.userId === usr.id &&
                        w.status !== 'Completed' &&
                        w.status !== 'Rejected'
                    );
                  }
                  if (userTriageFilter === 'pending_deposit') {
                    return data.deposits.some(
                      (d) => d.userId === usr.id && d.status === 'Pending'
                    );
                  }
                  return true;
                });

                const sortedUsers = [...triagedUsers].sort((a, b) => {
                  const aFresh = recentUserAlerts[a.id]?.at ?? 0;
                  const bFresh = recentUserAlerts[b.id]?.at ?? 0;
                  if (bFresh !== aFresh) return bFresh - aFresh;

                  const aAlerts =
                    data.withdrawals.filter(
                      (w) => w.userId === a.id && w.status !== 'Completed' && w.status !== 'Rejected'
                    ).length +
                    data.deposits.filter((d) => d.userId === a.id && d.status === 'Pending').length;
                  const bAlerts =
                    data.withdrawals.filter(
                      (w) => w.userId === b.id && w.status !== 'Completed' && w.status !== 'Rejected'
                    ).length +
                    data.deposits.filter((d) => d.userId === b.id && d.status === 'Pending').length;
                  if (bAlerts !== aAlerts) return bAlerts - aAlerts;
                  return a.name.localeCompare(b.name);
                });

                return (
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search by User ID, mobile number, or name..."
                          className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#0D1B38] border border-blue-900/50 text-sm text-white focus:outline-none focus:border-sky-400"
                        />
                      </div>

                      {/* Quick Triage Filter Tabs */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setUserTriageFilter('all')}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                            userTriageFilter === 'all'
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#0D1B38] border border-blue-900/50 text-slate-300 hover:text-white'
                          }`}
                        >
                          All Users ({filteredUsers.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserTriageFilter('pending_withdrawal')}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                            userTriageFilter === 'pending_withdrawal'
                              ? 'bg-sky-600 text-white'
                              : 'bg-[#0D1B38] border border-blue-900/50 text-slate-300 hover:text-white'
                          }`}
                        >
                          {pendingWithdrawalUserCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-sky-300 animate-pulse" />
                          )}
                          <span>Pending Withdrawals ({pendingWithdrawalUserCount})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserTriageFilter('pending_deposit')}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                            userTriageFilter === 'pending_deposit'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-[#0D1B38] border border-blue-900/50 text-slate-300 hover:text-white'
                          }`}
                        >
                          {pendingDepositUserCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                          )}
                          <span>Pending Deposit UTR ({pendingDepositUserCount})</span>
                        </button>
                      </div>
                    </div>

                    {sortedUsers.length === 0 ? (
                      <p className="text-sm text-slate-400 py-10 text-center">
                        No users match this filter.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {sortedUsers.map((u) => {
                          const pendingWdrs = data.withdrawals.filter(
                            (w) =>
                              w.userId === u.id &&
                              w.status !== 'Completed' &&
                              w.status !== 'Rejected'
                          );
                          const pendingDeps = data.deposits.filter(
                            (d) => d.userId === u.id && d.status === 'Pending'
                          );
                          const pendingWdrTotal = pendingWdrs.reduce((s, w) => s + w.amount, 0);
                          const pendingDepTotal = pendingDeps.reduce((s, d) => s + d.amount, 0);
                          const hasAlert = pendingWdrs.length > 0 || pendingDeps.length > 0;
                          const freshAlert = recentUserAlerts[u.id];

                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => openUserProfile(u)}
                              className={`w-full text-left rounded-2xl bg-[#0D1B38] hover:bg-[#12244A] border p-4 transition-all space-y-2.5 ${
                                freshAlert
                                  ? 'border-sky-400 ring-1 ring-sky-400/40 bg-[#102247]'
                                  : hasAlert
                                  ? 'border-sky-400/50'
                                  : 'border-blue-900/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-xl bg-[#152954] border border-blue-700/50 text-sky-300 font-bold text-sm flex items-center justify-center">
                                      {(u.name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    {hasAlert && (
                                      <span
                                        aria-label="Pending request notification"
                                        className="absolute -top-1 -right-1 flex h-3 w-3"
                                      >
                                        <span
                                          className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                                            pendingWdrs.length > 0 ? 'bg-sky-400' : 'bg-amber-400'
                                          }`}
                                        />
                                        <span
                                          className={`relative inline-flex rounded-full h-3 w-3 border-2 border-[#0D1B38] ${
                                            pendingWdrs.length > 0 ? 'bg-sky-400' : 'bg-amber-400'
                                          }`}
                                        />
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <p className="text-sm sm:text-base font-bold text-white truncate">
                                        {u.name}
                                      </p>
                                      <span className="text-xs font-mono-num font-normal text-blue-300 shrink-0">
                                        {u.id}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 truncate">
                                      +91 {u.mobile} ·{' '}
                                      <span
                                        className={
                                          u.status === 'active'
                                            ? 'text-emerald-400'
                                            : 'text-rose-400'
                                        }
                                      >
                                        {u.status}
                                      </span>{' '}
                                      · KYC:{' '}
                                      <span className="capitalize text-amber-300">
                                        {u.kycStatus}
                                      </span>
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono-num mt-1">
                                      <span className="text-emerald-300">
                                        Won: {formatINR(u.totalGameWinnings ?? u.wallet.totalEarnings)}
                                      </span>
                                      <span className="text-sky-300">
                                        Dep: {formatINR(u.approvedDepositsTotal ?? u.wallet.totalDeposits)}
                                      </span>
                                      {typeof u.customWinRatio === 'number' && (
                                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold">
                                          Win Ratio: {u.customWinRatio}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right font-mono-num">
                                    <p className="text-sm font-bold text-white">
                                      {formatINR(u.wallet.availableBalance)}
                                    </p>
                                    <p className="text-[11px] text-slate-400">Available</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                </div>
                              </div>

                              {/* Small Real-Time Pending Badges for Quick Triage */}
                              {hasAlert && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-blue-900/40">
                                  {pendingWdrs.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/20 border border-sky-400/50 text-[11px] font-semibold text-sky-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-pulse" />
                                      <span>
                                        Withdrawal Pending: {formatINR(pendingWdrTotal)}
                                        {pendingWdrs.length > 1 ? ` (${pendingWdrs.length})` : ''}
                                      </span>
                                      {freshAlert?.type === 'withdrawal' && (
                                        <span className="ml-0.5 px-1.5 py-0.2 rounded bg-sky-400 text-[#071126] text-[9px] font-extrabold uppercase">
                                          New
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {pendingDeps.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-400/50 text-[11px] font-semibold text-amber-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                                      <span>
                                        Deposit UTR Pending: {formatINR(pendingDepTotal)}
                                        {pendingDeps.length > 1 ? ` (${pendingDeps.length})` : ''}
                                      </span>
                                      {freshAlert?.type === 'deposit' && (
                                        <span className="ml-0.5 px-1.5 py-0.2 rounded bg-amber-400 text-[#071126] text-[9px] font-extrabold uppercase">
                                          New
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* DEPOSIT MANAGEMENT */}
              {section === 'deposits' && (
                <div className="space-y-4">
                  {/* Merchant UPI & QR Receiver Configuration */}
                  <form
                    onSubmit={handleSaveMerchantConfig}
                    className="rounded-2xl bg-[#0D1B38] border border-blue-800/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-blue-400" />
                        <h3 className="text-sm font-bold text-white">
                          Merchant UPI &amp; QR Receiver Settings
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSection('payment_methods')}
                        className="text-xs font-semibold text-sky-300 hover:text-sky-200 inline-flex items-center gap-1"
                      >
                        <span>Upload QR &amp; Manage Payment Methods</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Merchant UPI ID (PhonePe / GPay / Paytm / QR)
                        </label>
                        <input
                          type="text"
                          value={merchantUpi}
                          onChange={(e) => setMerchantUpi(e.target.value)}
                          placeholder="merchant@okaxis"
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Payee Display Name
                        </label>
                        <input
                          type="text"
                          value={merchantName}
                          onChange={(e) => setMerchantName(e.target.value)}
                          placeholder="GameReward Official"
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingConfig}
                      className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingConfig ? 'Saving...' : 'Save UPI Settings'}</span>
                    </button>
                  </form>

                  {/* Deposit Requests Queue (Pending first) */}
                  {data.deposits.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">No deposit records yet.</p>
                  ) : (
                    [...data.deposits]
                      .sort((a, b) => {
                        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
                        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                      })
                      .map((d) => {
                      const utrDisplay = d.utrNumber || d.userTransactionRef || d.gatewayOrderId;
                      const editedAmtStr = creditAmounts[d.id] ?? String(d.amount);
                      const editedAmtNum = Math.max(0, Math.round(Number(editedAmtStr) || 0));
                      const bonusOn = includeBonuses[d.id] !== false;
                      const methodLabel = d.paymentMethod || d.gateway;

                      return (
                        <div
                          key={d.id}
                          className={`rounded-2xl bg-[#0D1B38] border p-4 space-y-3 ${
                            d.status === 'Pending'
                              ? 'border-amber-400/50'
                              : 'border-blue-900/50'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <p className="text-base font-bold text-white">
                                {d.userName}{' '}
                                <span className="font-mono-num text-xs text-blue-300 ml-1">
                                  ({d.userId})
                                </span>
                              </p>
                              <p className="text-xs text-slate-300 font-mono-num">
                                Requested {formatINR(d.amount)} · via {methodLabel}
                                {d.status === 'Successful' && d.creditedAmount !== undefined
                                  ? ` · Credited ${formatINR(d.creditedAmount)}`
                                  : ''}
                                {d.bonusAmount > 0 ? ` · Bonus +${formatINR(d.bonusAmount)}` : ''}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono-num">
                                {d.transactionId} · {formatDateTime(d.createdAt)}
                              </p>
                            </div>
                            <span
                              className={`text-xs font-bold shrink-0 ${
                                d.status === 'Successful'
                                  ? 'text-emerald-400'
                                  : d.status === 'Failed'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                              }`}
                            >
                              {d.status === 'Pending' ? 'Pending Verification' : d.status}
                            </span>
                          </div>

                          {/* Highlighted UTR / Transaction ID Box */}
                          <div className="rounded-xl bg-[#071126] border border-blue-900/60 px-3.5 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400">
                                User Submitted Transaction ID / UTR ({methodLabel})
                              </p>
                              <p className="text-sm font-bold text-amber-300 font-mono-num tracking-wide truncate">
                                {utrDisplay}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyUtr(d.id, utrDisplay)}
                              className="min-h-[38px] px-3 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5 shrink-0"
                            >
                              {copiedUtrId === d.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy UTR</span>
                                </>
                              )}
                            </button>
                          </div>

                          {d.screenshotBase64 && (
                            <div className="rounded-xl bg-[#071126] border border-emerald-500/30 p-2.5 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewScreenshot(d.screenshotBase64 || null)}
                                  className="shrink-0 rounded-lg overflow-hidden border border-blue-800/70 hover:border-sky-400 transition-colors"
                                >
                                  <img
                                    src={d.screenshotBase64}
                                    alt="User payment screenshot"
                                    className="w-14 h-14 object-cover"
                                  />
                                </button>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-emerald-300">
                                    Payment Screenshot Attached
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    Tap thumbnail to inspect full receipt
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewScreenshot(d.screenshotBase64 || null)}
                                className="min-h-[34px] px-3 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-sky-200 shrink-0"
                              >
                                View Receipt
                              </button>
                            </div>
                          )}

                          {d.adminNote && d.status !== 'Pending' && (
                            <p className="text-xs text-slate-300">Admin note: {d.adminNote}</p>
                          )}

                          {d.status === 'Pending' && (
                            <div className="rounded-xl bg-[#0A1630] border border-blue-900/50 p-3.5 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                    Amount to Add to User Account (₹)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={500000}
                                    value={editedAmtStr}
                                    onChange={(e) =>
                                      setCreditAmounts((prev) => ({
                                        ...prev,
                                        [d.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-emerald-500/40 text-white font-mono-num font-bold text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                                    Rejection Reason (only if rejecting)
                                  </label>
                                  <input
                                    type="text"
                                    value={depositRejectReasons[d.id] || ''}
                                    onChange={(e) =>
                                      setDepositRejectReasons((prev) => ({
                                        ...prev,
                                        [d.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. UTR not found in UPI statement"
                                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-xs"
                                  />
                                </div>
                              </div>

                              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={bonusOn}
                                  onChange={(e) =>
                                    setIncludeBonuses((prev) => ({
                                      ...prev,
                                      [d.id]: e.target.checked,
                                    }))
                                  }
                                />
                                <span>
                                  Include Deposit Tier Bonus{' '}
                                  {editedAmtNum === d.amount && d.bonusAmount > 0
                                    ? `(+${formatINR(d.bonusAmount)} bonus)`
                                    : '(auto-calculated for credit amount)'}
                                </span>
                              </label>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDepositAction(d, 'Successful')}
                                  className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                                >
                                  Add {formatINR(editedAmtNum)} to User Account
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDepositAction(d, 'Failed')}
                                  className="min-h-[44px] px-4 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white"
                                >
                                  Reject Deposit
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* WITHDRAWAL MANAGEMENT */}
              {section === 'withdrawals' && (
                <div className="space-y-4">
                  {/* Withdrawal Policy & Notification Banner Control Card */}
                  <form
                    onSubmit={handleSaveWithdrawalConfig}
                    className="rounded-2xl bg-[#0D1B38] border border-blue-800/60 p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">
                          Withdrawal Policy &amp; Notification Banner
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono-num">
                        Active Min: {formatINR(data.withdrawalConfig?.minWithdrawalLimit ?? 5000)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Minimum Withdrawal Limit (₹100 – ₹1,00,000)
                        </label>
                        <input
                          type="number"
                          min={100}
                          max={100000}
                          value={minWithdrawalInput}
                          onChange={(e) => setMinWithdrawalInput(e.target.value)}
                          className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num font-bold text-sm"
                          required
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => setBannerEnabled((prev) => !prev)}
                          className={`w-full min-h-[44px] px-4 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                            bannerEnabled
                              ? 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                              : 'bg-[#071126] border-blue-900/70 text-slate-400'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Bell className="w-4 h-4" />
                            <span>Withdrawal Notification Banner</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                              bannerEnabled
                                ? 'bg-sky-400 text-slate-950'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {bannerEnabled ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#071126] border border-blue-900/60 p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                          <Bell className="w-3.5 h-3.5" />
                          <span>Edit Withdrawal Notice Banner</span>
                        </p>
                        <span className="text-[11px] text-slate-400">
                          Shown in Withdraw modal &amp; Wallet → Withdrawals
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Banner Title
                        </label>
                        <input
                          type="text"
                          maxLength={80}
                          value={bannerTitle}
                          onChange={(e) => setBannerTitle(e.target.value)}
                          placeholder="e.g. Withdrawal Notice"
                          className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D1B38] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-sky-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Banner Notice Message (max 500 characters)
                        </label>
                        <textarea
                          rows={3}
                          maxLength={500}
                          value={bannerMessage}
                          onChange={(e) => setBannerMessage(e.target.value)}
                          placeholder="Write the notice message you want users to see in the Withdrawal section..."
                          className="w-full p-3 rounded-xl bg-[#0D1B38] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-sky-400 resize-none"
                        />
                      </div>

                      {/* Live Preview */}
                      {bannerEnabled && bannerMessage.trim() && (
                        <div className="rounded-xl bg-gradient-to-r from-blue-600/20 via-sky-500/12 to-[#0D1B38] border border-sky-400/40 px-3.5 py-2.5 flex items-start gap-2.5">
                          <Bell className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300">
                              Preview · {bannerTitle.trim() || 'Withdrawal Notice'}
                            </p>
                            <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                              {bannerMessage.trim()}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingWithdrawalCfg}
                        className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-bold text-white inline-flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingWithdrawalCfg ? 'Saving...' : 'Save Withdrawal Settings'}</span>
                      </button>
                    </div>
                  </form>

                  <div className="flex flex-wrap gap-1.5">
                    {['ALL', 'Pending', 'Under Review', 'Approved', 'Processing', 'Completed', 'Rejected'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setWithdrawalFilter(st)}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                          withdrawalFilter === st
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#0D1B38] text-slate-300 hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {filteredWithdrawals.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">No withdrawal requests match this filter.</p>
                  ) : (
                    filteredWithdrawals.map((w) => {
                      const userDeposits = data.deposits.filter((d) => d.userId === w.userId);
                      const successfulDeposits = userDeposits.filter((d) => d.status === 'Successful');
                      const totalDeposited = successfulDeposits.reduce(
                        (sum, d) => sum + (d.creditedAmount ?? d.amount),
                        0
                      );
                      const pendingDepositCount = userDeposits.filter((d) => d.status === 'Pending').length;
                      return (
                        <div key={w.id} className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-base font-bold text-white">
                                {formatINR(w.amount)} · {w.userName}{' '}
                                <span className="text-xs font-mono-num text-slate-400">({w.userId})</span>
                              </p>
                              <p className="text-xs text-slate-300 font-mono-num">
                                {w.methodType === 'upi'
                                  ? `UPI: ${w.upiId}`
                                  : `Bank: ${w.accountHolderName} · A/C ${w.accountNumber} · IFSC ${w.ifscCode}`}
                              </p>
                              <p className="text-xs text-slate-400 font-mono-num">
                                {w.transactionId} · {formatDateTime(w.createdAt)}
                                {w.utrNumber ? ` · UTR: ${w.utrNumber}` : ''}
                              </p>
                              {w.rejectionReason && (
                                <p className="text-xs text-rose-300">Rejection reason: {w.rejectionReason}</p>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-amber-300">{w.status}</span>
                          </div>

                          {/* User Deposit History Summary */}
                          <div className="rounded-xl bg-[#071126] border border-blue-900/50 px-3.5 py-2.5 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-blue-300">
                                User Deposit History
                              </span>
                              <div className="flex flex-wrap items-center gap-3 font-mono-num">
                                <span className="text-emerald-400 font-bold">
                                  Total Deposited: {formatINR(totalDeposited)}
                                </span>
                                <span className="text-slate-400">
                                  ({successfulDeposits.length} verified
                                  {pendingDepositCount > 0 ? `, ${pendingDepositCount} pending` : ''})
                                </span>
                              </div>
                            </div>
                            {successfulDeposits.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {successfulDeposits.slice(0, 4).map((dep) => (
                                  <span
                                    key={dep.id}
                                    className="px-2 py-0.5 rounded-md bg-[#11234A] border border-blue-800/60 text-[11px] font-mono-num text-slate-200"
                                  >
                                    {formatINR(dep.creditedAmount ?? dep.amount)} · {formatDateTime(dep.createdAt)}
                                  </span>
                                ))}
                                {successfulDeposits.length > 4 && (
                                  <span className="text-[11px] text-slate-400 self-center">
                                    +{successfulDeposits.length - 4} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400">
                                No verified deposits recorded for this user yet.
                              </p>
                            )}
                          </div>

                          {w.status !== 'Completed' && w.status !== 'Rejected' && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setDirectPayoutWithdrawal(w)}
                                className="min-h-[36px] px-3.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:brightness-110 text-xs font-bold text-white inline-flex items-center gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Pay via UPI / PhonePe / GPay</span>
                              </button>
                              {(['Under Review', 'Approved', 'Processing', 'Completed'] as WithdrawalStatus[]).map((st) => (
                                <button
                                  key={st}
                                  onClick={() => handleWithdrawalStatus(w.id, st)}
                                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
                                    st === 'Completed'
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                      : 'bg-[#152954] hover:bg-blue-600 text-slate-200'
                                  }`}
                                >
                                  Mark {st}
                                </button>
                              ))}
                              <button
                                onClick={() => setRejectingWithdrawal(w)}
                                className="min-h-[36px] px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white"
                              >
                                Reject & Refund
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* GAME MANAGEMENT */}
              {section === 'games' && (
                <div className="space-y-5">
                  <form onSubmit={handleAddGame} className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Plus className="w-4 h-4 text-blue-400" />
                      Add New Casino / Luck Game
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={newGameName}
                        onChange={(e) => setNewGameName(e.target.value)}
                        placeholder="Game Name"
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                        required
                      />
                      <select
                        value={newGameCategory}
                        onChange={(e) => setNewGameCategory(e.target.value as GameCategory)}
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                      >
                        {['Casino', 'Luck', 'Slots', 'Cards', 'Dice'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        value={newGameEngine}
                        onChange={(e) => setNewGameEngine(e.target.value as GameEngineType)}
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                      >
                        <option value="money_rolling">Money Rolling Slot + Wheel</option>
                        <option value="hot_volcano">Hot Volcano Bonus Buy</option>
                        <option value="aviator">Aviator Pro Crash</option>
                        <option value="mines_grid">Mines 5x5 Strategy</option>
                        <option value="twist">Twist / Symbol Wheel</option>
                        <option value="wheel">Spin Wheel 3D Engine</option>
                        <option value="dice">Dice Roll 3D Engine</option>
                        <option value="coin">Coin Flip 3D Engine</option>
                        <option value="cards">Lucky Cards 3D Engine</option>
                        <option value="mines">Treasure Mines 3D Engine</option>
                        <option value="slots">Slot 777 3D Engine</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Payout Multiplier
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1.2"
                          max="10"
                          value={newGameMultiplier}
                          onChange={(e) => setNewGameMultiplier(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Initial Win Ratio (5%–95%)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={95}
                          value={newGameWinRatio}
                          onChange={(e) => setNewGameWinRatio(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-300 pt-4">
                        <input
                          type="checkbox"
                          checked={newGameTournament}
                          onChange={(e) => setNewGameTournament(e.target.checked)}
                        />
                        Featured Event
                      </label>
                    </div>
                    <button type="submit" className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">
                      Publish Game
                    </button>
                  </form>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">
                        Per-Game Win Ratio Controls ({data.games.length} Games)
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        Changes apply live to every game
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {data.games.map((g) => {
                        const savedRatio = Math.round((g.minWinRatio + g.maxWinRatio) / 2);
                        const editRatio = gameRatioEdits[g.id] ?? savedRatio;
                        const isDirty = editRatio !== savedRatio;

                        return (
                          <div
                            key={g.id}
                            className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{g.name}</p>
                                <p className="text-xs text-slate-400">
                                  {g.category} · {g.winMultiplier}× · Plays: {g.totalPlays}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-xs font-extrabold font-mono-num text-emerald-300">
                                  {editRatio}% Win
                                </span>
                                <button
                                  onClick={() => handleDeleteGame(g.id)}
                                  aria-label={`Delete ${g.name}`}
                                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Win Ratio Slider + Numeric Input */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="range"
                                  min={5}
                                  max={95}
                                  step={1}
                                  value={editRatio}
                                  onChange={(e) =>
                                    setGameRatioEdits((prev) => ({
                                      ...prev,
                                      [g.id]: Number(e.target.value),
                                    }))
                                  }
                                  className="flex-1 accent-emerald-500 cursor-pointer"
                                />
                                <input
                                  type="number"
                                  min={5}
                                  max={95}
                                  value={editRatio}
                                  onChange={(e) =>
                                    setGameRatioEdits((prev) => ({
                                      ...prev,
                                      [g.id]: Math.max(
                                        5,
                                        Math.min(95, Number(e.target.value) || 5)
                                      ),
                                    }))
                                  }
                                  className="w-16 min-h-[36px] px-2 rounded-lg bg-[#071126] border border-blue-800/70 text-center text-xs font-mono-num font-bold text-white"
                                />
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {[20, 35, 50, 65, 80].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() =>
                                        setGameRatioEdits((prev) => ({
                                          ...prev,
                                          [g.id]: preset,
                                        }))
                                      }
                                      className={`px-2 py-1 rounded-md text-[10px] font-mono-num font-bold transition ${
                                        editRatio === preset
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-[#071126] text-slate-300 hover:text-white border border-blue-900/60'
                                      }`}
                                    >
                                      {preset}%
                                    </button>
                                  ))}
                                </div>

                                <button
                                  type="button"
                                  disabled={savingGameId === g.id}
                                  onClick={() => handleSaveGameWinRatio(g)}
                                  className={`min-h-[34px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition shrink-0 ${
                                    isDirty
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25'
                                      : 'bg-[#152954] hover:bg-blue-600 text-blue-100'
                                  }`}
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>{savingGameId === g.id ? 'Saving...' : 'Save Ratio'}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* BONUS & CAMPAIGN MANAGEMENT */}
              {section === 'bonuses' && (
                <div className="space-y-5">
                  <form onSubmit={handleSaveWelcomeConfig} className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-white">Welcome Bonus Configuration</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Bonus Amount (₹)</label>
                        <input
                          type="number"
                          value={wbAmount}
                          onChange={(e) => setWbAmount(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Expiry (Days)</label>
                        <input
                          type="number"
                          value={wbExpiry}
                          onChange={(e) => setWbExpiry(e.target.value)}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-200 pt-4">
                        <input type="checkbox" checked={wbEnabled} onChange={(e) => setWbEnabled(e.target.checked)} />
                        Promotion Enabled
                      </label>
                    </div>
                    <button type="submit" className="min-h-[40px] px-4 rounded-xl bg-blue-600 text-xs font-semibold text-white">
                      Save Welcome Config
                    </button>
                  </form>

                  <form onSubmit={handleCreateCampaign} className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-white">Create Promotional Campaign</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={campTitle}
                        onChange={(e) => setCampTitle(e.target.value)}
                        placeholder="Campaign Title"
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                        required
                      />
                      <input
                        type="text"
                        value={campDesc}
                        onChange={(e) => setCampDesc(e.target.value)}
                        placeholder="Short transparent description"
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                        required
                      />
                      <input
                        type="number"
                        value={campAmount}
                        onChange={(e) => setCampAmount(e.target.value)}
                        placeholder="Bonus ₹"
                        className="min-h-[42px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num"
                      />
                    </div>
                    <button type="submit" className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-xs font-semibold text-white">
                      Launch Campaign
                    </button>
                  </form>

                  <div className="space-y-2.5">
                    {data.bonusCampaigns.map((c) => (
                      <div key={c.id} className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{c.title}</p>
                          <p className="text-xs text-slate-400">
                            Reward {formatINR(c.rewardAmount)} · Claimed {c.totalClaimedCount}× · Distributed {formatINR(c.totalDistributedAmount)}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold ${c.active ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {c.active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ADMIN ACCESS MANAGEMENT */}
              {section === 'admins' && (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">Add New Admin (Gmail ID)</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Enter a Gmail / Email ID below. Anyone who signs up or logs in with an authorized Gmail ID automatically receives full Admin Panel access. Normal users never see Admin controls.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleAddAdminEmail} className="flex flex-col sm:flex-row gap-2.5">
                      <div className="relative flex-1">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          placeholder="Enter Gmail ID (e.g. partner@gmail.com)"
                          className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-400"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingAdminEmail}
                        className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-bold text-white inline-flex items-center justify-center gap-2 shrink-0"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{savingAdminEmail ? 'Adding...' : 'Grant Admin Access'}</span>
                      </button>
                    </form>
                  </div>

                  <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-blue-900/40 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white">Authorized Admin Emails</h3>
                      <span className="text-xs text-slate-400 font-mono-num">
                        {(data.authorizedAdminEmails || []).length} total
                      </span>
                    </div>

                    <div className="divide-y divide-blue-900/40">
                      {(data.authorizedAdminEmails || []).map((entry) => (
                        <div
                          key={entry.email}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-white break-all">
                                {entry.email}
                              </span>
                              {entry.isOwner ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/40 text-[11px] font-bold text-amber-300">
                                  Primary Owner
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-400/40 text-[11px] font-bold text-blue-300">
                                  Admin
                                </span>
                              )}
                            </div>

                            {entry.registeredUser ? (
                              <p className="text-xs text-emerald-300">
                                Active Account: {entry.registeredUser.name} ({entry.registeredUser.mobile}) · {entry.registeredUser.id}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">
                                Ready — Admin access activates automatically when this Gmail signs up or logs in
                              </p>
                            )}

                            <p className="text-[11px] text-slate-500 font-mono-num">
                              Added {formatDateTime(entry.addedAt)} · by {entry.addedBy}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {entry.isOwner ? (
                              <span className="text-[11px] font-semibold text-slate-400 px-3 py-1.5 rounded-lg bg-slate-800/70 inline-block">
                                Protected
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={removingAdminEmail === entry.email}
                                onClick={() => handleRemoveAdminEmail(entry.email)}
                                className="min-h-[38px] px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-300 inline-flex items-center gap-1.5 disabled:opacity-60"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>
                                  {removingAdminEmail === entry.email ? 'Removing...' : 'Remove Access'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DEPOSIT PAYMENT METHODS (QR & UPI) */}
              {section === 'payment_methods' && (
                <AdminPaymentMethodsSection
                  onActionSuccess={notifyAction}
                  onActionError={notifyError}
                  onParentRefresh={() => loadOverview(true)}
                />
              )}

              {/* REFERRAL MANAGEMENT */}
              {section === 'referrals' && (
                <AdminReferralManagement
                  onActionSuccess={notifyAction}
                  onActionError={notifyError}
                  onParentRefresh={() => loadOverview(true)}
                />
              )}

              {/* APP UPLOAD & DIRECT SHARE */}
              {section === 'app_release' && (
                <AdminAppReleaseSection onNotify={notifyAction} onError={notifyError} />
              )}

              {/* APP STARTUP NOTICES / INFORMATION */}
              {section === 'announcements' && (
                <AdminAnnouncementSection onNotify={notifyAction} onError={notifyError} />
              )}

              {/* AUDIT LOGS */}
              {section === 'audit' && (
                <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 divide-y divide-blue-900/40">
                  {data.auditLogs.map((log) => (
                    <div key={log.id} className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-mono-num font-bold text-blue-300">{log.action}</span>
                        <span className="text-slate-400 ml-2">by {log.actorId}</span>
                        <p className="text-slate-200 mt-0.5">{log.details}</p>
                      </div>
                      <span className="text-slate-400 font-mono-num">{formatDateTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* User History Modal */}
      {selectedUserHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {selectedUserHistory.user.name} ({selectedUserHistory.user.id})
              </h3>
              <button onClick={() => setSelectedUserHistory(null)} className="text-xs text-slate-400 hover:text-white">Close</button>
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-300 mb-2">Gaming History</p>
              {selectedUserHistory.gameSessions.length === 0 ? (
                <p className="text-xs text-slate-400">No games played.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedUserHistory.gameSessions.map((s) => (
                    <div key={s.id} className="flex justify-between text-xs bg-[#0A1630] p-2.5 rounded-xl">
                      <span>{s.gameName} · Entry {formatINR(s.entryFee)} · {s.outcome.toUpperCase()} ({s.winRatioUsed}%)</span>
                      <span className={`font-mono-num ${s.rewardEarned > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                        +{formatINR(s.rewardEarned)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-300 mb-2">Ledger Transactions</p>
              <div className="space-y-1.5">
                {selectedUserHistory.transactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex justify-between text-xs bg-[#0A1630] p-2.5 rounded-xl">
                    <span>{t.title} ({t.id})</span>
                    <span className={`font-mono-num ${t.amount >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                      {t.amount >= 0 ? '+' : ''}{formatINR(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectingWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0D1B38] border border-blue-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-300">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Reject &amp; Refund Withdrawal</h3>
            </div>
            <p className="text-xs text-slate-300">
              Rejecting {rejectingWithdrawal.id} ({formatINR(rejectingWithdrawal.amount)}) will automatically refund the amount to the user&apos;s Available Balance.
            </p>
            {rejectionError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-xs text-rose-200">
                {rejectionError}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[
                'Invalid UPI ID',
                'Bank IFSC / Account mismatch',
                'KYC name mismatch',
                'Duplicate payout request',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRejectionReason(preset);
                    setRejectionError('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#071126] hover:bg-[#13264F] border border-blue-800/60 text-[11px] text-slate-200"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300">
                Rejection Notice for User
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (rejectionError) setRejectionError('');
                }}
                placeholder="Write a clear notice explaining why this withdrawal was rejected (e.g. IFSC code mismatch — please update bank details and resubmit)"
                className="w-full p-3 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-rose-400 resize-none"
              />
              <p className="text-[11px] text-slate-400">
                This notice will appear prominently to the user as a popup, in their Wallet, and in Notifications.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  handleWithdrawalStatus(rejectingWithdrawal.id, 'Rejected', rejectionReason)
                }
                disabled={rejectionReason.trim().length < 4}
                className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-45 text-white text-xs font-semibold transition"
              >
                Confirm Rejection
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectingWithdrawal(null);
                  setRejectionReason('');
                  setRejectionError('');
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Admin Payout Modal (UPI / PhonePe / GPay / Mobile Number / QR) */}
      {directPayoutWithdrawal && (
        <AdminDirectPayoutModal
          withdrawal={directPayoutWithdrawal}
          user={data?.users.find((u) => u.id === directPayoutWithdrawal.userId) || null}
          onClose={() => setDirectPayoutWithdrawal(null)}
          onMarkStatus={async (id, st) => {
            await handleWithdrawalStatus(id, st);
          }}
        />
      )}

      {/* Payment Screenshot Lightbox */}
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setPreviewScreenshot(null)}
        >
          <div
            className="relative max-w-lg w-full rounded-3xl bg-[#0D1B38] border border-blue-800/70 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">User Payment Receipt</h3>
              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewScreenshot}
              alt="Full payment receipt"
              className="w-full max-h-[75vh] object-contain rounded-2xl bg-[#071126]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4">
    <p className="text-xs text-slate-400">{label}</p>
    <p className="text-xl font-bold text-white font-mono-num mt-1">{value}</p>
    <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
  </div>
);
