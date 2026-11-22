import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Bell,
  Building2,
  CalendarCheck,
  ChevronRight,
  Copy,
  CreditCard,
  Gamepad2,
  Gift,
  HelpCircle,
  Home,
  KeyRound,
  Lock,
  LogOut,
  Play,
  Scale,
  Share2,
  Shield,
  ShieldCheck,
  Trophy,
  User,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthLandingPage } from './components/AuthLandingPage';
import { AviatorProGame } from './components/arcade/AviatorProGame';
import { HotVolcanoGame } from './components/arcade/HotVolcanoGame';
import { LivePlayingBadge } from './components/arcade/LivePlayingBadge';
import { MinesGame } from './components/arcade/MinesGame';
import { MoneyRollingGame } from './components/arcade/MoneyRollingGame';
import { TwistWheelGame } from './components/arcade/TwistWheelGame';
import { DepositPage } from './components/DepositPage';
import {
  FrontReviewsAndTrustPanel,
  LiveActivityBanner,
} from './components/FrontPageHighlights';
import { GameArenaModal } from './components/GameArenaModal';
import {
  AccountAuthModal,
  KycModal,
  LegalComplianceModal,
  NotificationsDrawer,
  PaymentMethodsModal,
  ReviewsModal,
} from './components/ProfileModals';
import { AppAnnouncementPopup, DailyBonusPopup, DepositBonusPopup } from './components/StartupPopups';
import { PublicApkDownloadPage } from './components/PublicApkDownloadPage';
import { ReferAndEarnTab } from './components/ReferAndEarnTab';
import { WithdrawalRejectionModal, WithdrawModal } from './components/WalletModals';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  claimDailyCheckInFirestore,
  claimWelcomeBonusFirestore,
  firebaseLogout,
  formatDateTime,
  formatINR,
  getUserFullStateFirestore,
  markAllNotificationsReadFirestore,
  subscribeAppAnnouncement,
  subscribeUserNotifications,
  subscribeUserProfile,
  subscribeUserTransactions,
  testConnection,
  updateUserProfileFirestore,
} from './lib/api';
import {
  initAndroidShell,
  registerBackHandler,
  setAndroidRootBackNotice,
} from './lib/androidBridge';
import type {
  AppAnnouncementConfig,
  BonusCampaign,
  DepositBonusOfferMeta,
  DepositRecord,
  GameCategory,
  GameItem,
  GameSessionRecord,
  LeaderboardEntry,
  LedgerTransaction,
  NotificationItem,
  ReviewItem,
  ReviewScheduleMeta,
  UserProfile,
  WalletSummary,
  WithdrawalRecord,
} from './types';

type MainTab = 'home' | 'games' | 'wallet' | 'refer' | 'rewards' | 'profile';
type WalletSubTab = 'all' | 'deposits' | 'withdrawals' | 'rewards';

const GAME_CATEGORIES: ('All' | GameCategory)[] = [
  'All',
  'Casino',
  'Luck',
  'Slots',
  'Cards',
  'Dice',
];

export function App() {
  const [booting, setBooting] = useState(true);
  const [adminMode, setAdminMode] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('home');

  // Core server-backed state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [prohibitedStates, setProhibitedStates] = useState<string[]>([]);
  const [welcomeConfig, setWelcomeConfig] = useState<{
    amount: number;
    expiryDays: number;
    enabled: boolean;
    terms: string;
  } | null>(null);

  const [games, setGames] = useState<GameItem[]>([]);
  const [gameHistory, setGameHistory] = useState<GameSessionRecord[]>([]);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});

  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);

  const [campaigns, setCampaigns] = useState<BonusCampaign[]>([]);
  const [canCheckInToday, setCanCheckInToday] = useState(false);
  const [dailyBonusLadder, setDailyBonusLadder] = useState<number[]>([]);
  const [nextDayNumber, setNextDayNumber] = useState<number>(1);
  const [nextRewardAmount, setNextRewardAmount] = useState<number>(2);
  const [depositBonusOffers, setDepositBonusOffers] = useState<DepositBonusOfferMeta | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewSchedule, setReviewSchedule] = useState<ReviewScheduleMeta | null>(null);

  // Public no-login APK download route (?download=apk&ref=CODE)
  const [showPublicApkDownload, setShowPublicApkDownload] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('download') === 'apk';
  });
  const [publicDownloadRef] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('ref') || '').trim();
  });

  // UI filters & modals
  const [selectedCategory, setSelectedCategory] = useState<'All' | GameCategory>('All');
  const [walletSubTab, setWalletSubTab] = useState<WalletSubTab>('all');
  const [showAllLedger, setShowAllLedger] = useState<boolean>(false);
  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [appAnnouncement, setAppAnnouncement] = useState<AppAnnouncementConfig | null>(null);
  const [startupModal, setStartupModal] = useState<'none' | 'announcement' | 'daily' | 'deposit'>('none');
  const [pendingStartupAfterNotice, setPendingStartupAfterNotice] = useState(false);
  const [pendingDepositOfferAfterDaily, setPendingDepositOfferAfterDaily] = useState(false);
  const startupTriggeredRef = useRef(false);
  const lastLiveAnnouncementRevRef = useRef<number>(0);
  const [activeRejectionNotice, setActiveRejectionNotice] = useState<WithdrawalRecord | null>(null);
  const [seenRejectionIds, setSeenRejectionIds] = useState<string[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [toast, setToast] = useState<string>('');
  const [onlinePlayers, setOnlinePlayers] = useState<number>(1);
  const tabHistoryRef = useRef<MainTab[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const navigateTab = useCallback((nextTab: MainTab) => {
    setActiveTab((prevTab) => {
      if (prevTab !== nextTab) {
        const nextHist = [...tabHistoryRef.current, prevTab].slice(-12);
        tabHistoryRef.current = nextHist;
      }
      return nextTab;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const applyFullState = useCallback(
    (state: Awaited<ReturnType<typeof getUserFullStateFirestore>>) => {
      setUser(state.user);
      setEditName(state.user.name || '');
      setEditEmail(state.user.email || '');
      if (state.user.role !== 'admin') {
        setAdminMode(false);
      }
      setWallet(state.wallet);
      setWelcomeConfig(state.welcomeBonusConfig);
      setProhibitedStates(state.prohibitedStates);
      setGames(state.games);
      setGameHistory(state.history);
      setLeaderboards(state.leaderboards);
      setTransactions(state.transactions);
      setDeposits(state.deposits);
      setWithdrawals(state.withdrawals);
      setCampaigns(state.campaigns);
      setCanCheckInToday(state.canCheckInToday);
      setDailyBonusLadder(state.dailyBonusLadder);
      setNextDayNumber(state.nextDayNumber);
      setNextRewardAmount(state.nextRewardAmount);
      setDepositBonusOffers(state.depositBonusOffers);
      setNotifications(state.notifications);
      setReviews(state.reviews);
      setReviewSchedule(null);
      if (state.announcement) {
        setAppAnnouncement(state.announcement);
        lastLiveAnnouncementRevRef.current = state.announcement.revision || 0;
      }
    },
    []
  );

  const refreshAllData = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const state = await getUserFullStateFirestore(uid);
    applyFullState(state);
  }, [applyFullState]);

  // Initialize Android status-bar safe area & hardware Back button trap once on boot
  useEffect(() => {
    initAndroidShell();
    setAndroidRootBackNotice(showToast);
    return () => setAndroidRootBackNotice(null);
  }, [showToast]);

  // Verify Firestore connection once on boot & subscribe to Firebase Auth state (browserLocalPersistence)
  useEffect(() => {
    let mounted = true;
    void testConnection();

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!mounted) return;
      if (!fbUser) {
        setUser(null);
        setWallet(null);
        setAdminMode(false);
        setBooting(false);
        return;
      }
      try {
        const state = await getUserFullStateFirestore(fbUser.uid);
        if (!mounted) return;
        applyFullState(state);
      } catch (err) {
        if (mounted) {
          showToast(
            err instanceof Error ? err.message : 'Unable to load account from Firestore.'
          );
        }
      } finally {
        if (mounted) setBooting(false);
      }
    });

    return () => {
      mounted = false;
      unsubAuth();
    };
  }, [applyFullState, showToast]);

  // Real-time Firestore onSnapshot listeners for user profile/wallet, transactions, notifications, and announcements
  useEffect(() => {
    const uid = user?.uid || user?.id;
    if (booting || !uid) return;

    const unsubProfile = subscribeUserProfile(uid, ({ user: profile, wallet: nextWallet }) => {
      setUser(profile);
      if (profile.role !== 'admin') {
        setAdminMode(false);
      }
      setWallet(nextWallet);
    });

    const unsubTx = subscribeUserTransactions(uid, ({ deposits: nextDeps, withdrawals: nextWdrs }) => {
      setDeposits(nextDeps);
      setWithdrawals(nextWdrs);
    });

    const unsubNotif = subscribeUserNotifications(uid, (nextNotifs) => {
      setNotifications(nextNotifs);
    });

    const unsubNotice = subscribeAppAnnouncement((nextNotice) => {
      setAppAnnouncement(nextNotice);
      if (
        nextNotice.enabled &&
        (nextNotice.title.trim() || nextNotice.message.trim()) &&
        nextNotice.revision > lastLiveAnnouncementRevRef.current
      ) {
        lastLiveAnnouncementRevRef.current = nextNotice.revision;
        setPendingStartupAfterNotice(false);
        setStartupModal((curr) => (curr === 'none' ? 'announcement' : curr));
      } else {
        lastLiveAnnouncementRevRef.current = nextNotice.revision;
      }
    });

    return () => {
      unsubProfile();
      unsubTx();
      unsubNotif();
      unsubNotice();
    };
  }, [booting, user?.uid, user?.id]);

  // Show Admin Startup Information Popup first (when enabled), followed by Daily Bonus and Deposit Bonus
  useEffect(() => {
    if (booting || !user || !wallet || adminMode || startupTriggeredRef.current) return;
    startupTriggeredRef.current = true;

    const hasActiveAnnouncement = Boolean(
      appAnnouncement &&
        appAnnouncement.enabled &&
        (appAnnouncement.title.trim() || appAnnouncement.message.trim())
    );
    let shouldShowAnnouncement = false;
    if (hasActiveAnnouncement && appAnnouncement) {
      if (appAnnouncement.showMode === 'once_per_update') {
        try {
          const seenRev = window.localStorage?.getItem('gr_seen_announcement_rev');
          shouldShowAnnouncement = seenRev !== String(appAnnouncement.revision);
        } catch {
          shouldShowAnnouncement = true;
        }
      } else {
        shouldShowAnnouncement = true;
      }
    }

    if (shouldShowAnnouncement) {
      setPendingStartupAfterNotice(true);
      setStartupModal('announcement');
      return;
    }

    if (canCheckInToday) {
      setPendingDepositOfferAfterDaily(true);
      setStartupModal('daily');
    } else {
      setStartupModal('deposit');
    }
  }, [booting, user, wallet, adminMode, canCheckInToday, appAnnouncement]);

  // Lightweight client-side live online players indicator (100% serverless, no backend heartbeat needed)
  useEffect(() => {
    const baseOnline = 148 + Math.floor(Math.random() * 64);
    setOnlinePlayers(baseOnline);
    const timer = window.setInterval(() => {
      setOnlinePlayers((prev) => {
        const drift = Math.floor(Math.random() * 9) - 4;
        return Math.max(92, Math.min(340, prev + drift));
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const unreadCount = useMemo(
    () => (Array.isArray(notifications) ? notifications.filter((n) => !n.read).length : 0),
    [notifications]
  );

  // Load seen withdrawal rejection notice IDs per user
  useEffect(() => {
    if (!user) {
      setSeenRejectionIds([]);
      setActiveRejectionNotice(null);
      return;
    }
    try {
      const raw = window.localStorage?.getItem(`gr_seen_rejected_wdr_${user.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setSeenRejectionIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSeenRejectionIds([]);
    }
  }, [user?.id]);

  const latestRejectedWithdrawal = useMemo(
    () => (Array.isArray(withdrawals) ? withdrawals.find((w) => w.status === 'Rejected') || null : null),
    [withdrawals]
  );

  const acknowledgeRejectionNotice = useCallback(
    (withdrawalId: string) => {
      setActiveRejectionNotice(null);
      if (!user) return;
      setSeenRejectionIds((prev) => {
        if (prev.includes(withdrawalId)) return prev;
        const next = [...prev, withdrawalId];
        try {
          window.localStorage?.setItem(
            `gr_seen_rejected_wdr_${user.id}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore storage quota errors
        }
        return next;
      });
    },
    [user]
  );

  // Automatically pop up prominent Withdrawal Rejection Notice when admin rejects a user's withdrawal
  useEffect(() => {
    if (
      booting ||
      !user ||
      adminMode ||
      activeGame ||
      showDeposit ||
      startupModal !== 'none' ||
      activeRejectionNotice ||
      !Array.isArray(withdrawals)
    ) {
      return;
    }
    const unseenRejected = withdrawals.find(
      (w) => w.status === 'Rejected' && !seenRejectionIds.includes(w.id)
    );
    if (unseenRejected) {
      setActiveRejectionNotice(unseenRejected);
    }
  }, [
    booting,
    user,
    adminMode,
    activeGame,
    showDeposit,
    startupModal,
    activeRejectionNotice,
    withdrawals,
    seenRejectionIds,
  ]);

  const filteredGames = useMemo(() => {
    const safeGames = Array.isArray(games) ? games : [];
    return selectedCategory === 'All'
      ? safeGames
      : safeGames.filter((g) => g.category === selectedCategory);
  }, [games, selectedCategory]);

  const handleDailyCheckIn = async (): Promise<boolean> => {
    try {
      const res = await claimDailyCheckInFirestore();
      showToast(
        `Day ${res.dailyStreak} Daily Bonus collected! +${formatINR(res.rewardAmount)} added to Bonus Balance.`
      );
      await refreshAllData();
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to claim daily bonus.');
      return false;
    }
  };

  const handleClaimWelcome = async () => {
    try {
      await claimWelcomeBonusFirestore();
      showToast('Welcome bonus credited to your Bonus Balance.');
      await refreshAllData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to claim welcome bonus.');
    }
  };

  const handleCopyReferral = () => {
    if (!user) return;
    navigator.clipboard?.writeText(user.referralCode).catch(() => {});
    showToast(`Referral code ${user.referralCode} copied.`);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUserProfileFirestore({ name: editName, email: editEmail });
      setEditingProfile(false);
      showToast('Profile details updated.');
      await refreshAllData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadFirestore();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore transient error
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseLogout();
    } catch {
      // ignore signOut errors
    }
    setAdminMode(false);
    setUser(null);
    setWallet(null);
    setActiveGame(null);
    setShowDeposit(false);
    setShowWithdraw(false);
    setStartupModal('none');
    startupTriggeredRef.current = false;
    tabHistoryRef.current = [];
    setActiveTab('home');
  };

  // Process-by-process Android hardware Back button handler (never closes app on Back press)
  const backStateRef = useRef({
    adminMode,
    activeRejectionNotice,
    showLegal,
    showReviews,
    showAuthModal,
    showPaymentMethods,
    showKyc,
    showNotifications,
    showWithdraw,
    startupModal,
    activeGame,
    showDeposit,
    editingProfile,
    activeTab,
  });
  backStateRef.current = {
    adminMode,
    activeRejectionNotice,
    showLegal,
    showReviews,
    showAuthModal,
    showPaymentMethods,
    showKyc,
    showNotifications,
    showWithdraw,
    startupModal,
    activeGame,
    showDeposit,
    editingProfile,
    activeTab,
  };

  useEffect(() => {
    return registerBackHandler(() => {
      const s = backStateRef.current;
      // 1. Close topmost popups & modals first
      if (s.activeRejectionNotice) {
        acknowledgeRejectionNotice(s.activeRejectionNotice.id);
        return true;
      }
      if (s.showLegal) {
        setShowLegal(false);
        return true;
      }
      if (s.showReviews) {
        setShowReviews(false);
        return true;
      }
      if (s.showAuthModal) {
        setShowAuthModal(false);
        return true;
      }
      if (s.showPaymentMethods) {
        setShowPaymentMethods(false);
        return true;
      }
      if (s.showKyc) {
        setShowKyc(false);
        return true;
      }
      if (s.showNotifications) {
        setShowNotifications(false);
        return true;
      }
      if (s.showWithdraw) {
        setShowWithdraw(false);
        return true;
      }
      if (s.startupModal !== 'none') {
        setStartupModal('none');
        return true;
      }
      // 2. Exit active full-screen game back to lobby
      if (s.activeGame) {
        setActiveGame(null);
        void refreshAllData();
        return true;
      }
      // 3. Close Deposit page back to main app
      if (s.showDeposit) {
        setShowDeposit(false);
        return true;
      }
      // 4. Exit Admin console if active (AdminDashboard handles its own inner steps first)
      if (s.adminMode) {
        setAdminMode(false);
        if (auth.currentUser) {
          void refreshAllData();
        }
        return true;
      }
      // 5. Close inline profile editor
      if (s.editingProfile) {
        setEditingProfile(false);
        return true;
      }
      // 6. Step back through visited tabs until reaching Home
      if (tabHistoryRef.current.length > 0) {
        const prev = tabHistoryRef.current.pop()!;
        setActiveTab(prev);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      if (s.activeTab !== 'home') {
        setActiveTab('home');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      // Already on Home screen — let bridge show Home notice & keep app open
      return false;
    });
  }, [acknowledgeRejectionNotice, refreshAllData]);

  const isAdminUser = user?.role === 'admin';

  if (adminMode && user && isAdminUser) {
    return (
      <AdminDashboard
        onExit={() => {
          setAdminMode(false);
          if (auth.currentUser) {
            void refreshAllData();
          }
        }}
      />
    );
  }

  if (showPublicApkDownload) {
    return (
      <PublicApkDownloadPage
        referralCode={publicDownloadRef}
        onContinueToApp={() => {
          setShowPublicApkDownload(false);
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('download');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          } catch {
            // ignore URL history error
          }
        }}
      />
    );
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-[#071126] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-blue-400 animate-pulse" />
          </div>
          <p className="text-sm text-slate-300 font-medium">Loading GameReward ledger...</p>
        </div>
      </div>
    );
  }

  if (!user || !wallet) {
    return (
      <AuthLandingPage
        onAuthenticated={async () => {
          startupTriggeredRef.current = false;
          await refreshAllData();
        }}
      />
    );
  }

  if (showDeposit) {
    return (
      <>
        <DepositPage
          wallet={wallet}
          onBack={() => setShowDeposit(false)}
          onOpenHistory={() => {
            setShowDeposit(false);
            navigateTab('wallet');
            setWalletSubTab('deposits');
          }}
          onOpenLegal={() => setShowLegal(true)}
          onSuccess={() => refreshAllData()}
        />
        {showLegal && (
          <LegalComplianceModal
            prohibitedStates={prohibitedStates}
            onClose={() => setShowLegal(false)}
          />
        )}
      </>
    );
  }

  const navItems: { key: MainTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'games', label: 'Games', icon: Gamepad2 },
    { key: 'wallet', label: 'Wallet', icon: Wallet },
    { key: 'refer', label: 'Refer & Earn', icon: Share2 },
    { key: 'rewards', label: 'Rewards', icon: Gift },
    { key: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#071126] text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Left Navigation Sidebar (expands cleanly on >= 1024px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-[#0A1630] border-r border-blue-900/40 p-5 justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap">
              GameReward
            </span>
          </div>

          <nav className="space-y-1.5">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => navigateTab(key)}
                className={`w-full min-h-[46px] px-4 rounded-2xl flex items-center gap-3 text-sm font-semibold transition-all ${
                  activeTab === key
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-300 hover:bg-[#13264F] hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-2.5 pt-4 border-t border-blue-900/40">
          {isAdminUser && (
            <button
              onClick={() => setAdminMode(true)}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#13264F] hover:bg-[#1C366E] border border-blue-800/60 text-xs font-semibold text-blue-200 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" />
                Owner Admin Console
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowLegal(true)}
            className="w-full px-2 py-1.5 text-left text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Terms & Responsible Gaming</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top App Bar (extends cleanly behind Android status bar via pt-safe-top) */}
        <header className="sticky top-0 z-30 pt-safe-top bg-[#071126]/95 backdrop-blur-md border-b border-blue-900/40 px-4 lg:px-8">
          <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-md shadow-blue-600/30 shrink-0">
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
              {activeTab === 'home'
                ? 'GameReward'
                : activeTab === 'games'
                ? 'Browse Games'
                : activeTab === 'wallet'
                ? 'My Wallet'
                : activeTab === 'refer'
                ? 'Refer & Earn'
                : activeTab === 'rewards'
                ? 'Rewards & Bonuses'
                : 'Profile'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              title="Active online players"
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-xl bg-emerald-500/12 border border-emerald-400/30 text-emerald-300 text-xs font-semibold font-mono-num whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{onlinePlayers} Online</span>
            </div>
            {isAdminUser && (
              <button
                onClick={() => setAdminMode(true)}
                className="lg:hidden min-h-[40px] px-3 rounded-xl bg-[#13264F] border border-blue-800/60 text-xs font-semibold text-blue-200 whitespace-nowrap"
              >
                Admin
              </button>
            )}
            <button
              onClick={() => setShowNotifications(true)}
              aria-label="Open notifications"
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#13264F] text-slate-200 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center font-mono-num">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigateTab('profile')}
              aria-label="Open profile"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 border-2 border-blue-400/70 flex items-center justify-center text-xs font-bold text-white">
                {user.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            </button>
          </div>
          </div>
        </header>

        {/* Toast Feedback */}
        {toast && (
          <div className="fixed top-safe-toast right-4 left-4 sm:left-auto z-50 sm:max-w-sm rounded-2xl bg-[#13264F] border border-blue-400/50 px-4 py-3 text-sm text-white shadow-xl">
            {toast}
          </div>
        )}

        {/* Main Scrollable Content */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 pt-5 pb-safe-nav lg:pb-10 space-y-6">
          {/* ============================================================== */}
          {/* TAB 1: HOME DASHBOARD (Faithfully mirrors reference mockup #1) */}
          {/* ============================================================== */}
          {activeTab === 'home' && (
            <div className="space-y-5">
              {/* Top Continuous Live Withdrawal (₹5,000+) & Deposit Notification Banner */}
              <LiveActivityBanner />

              {/* Prominent Admin Rejection Notice Banner on Home if latest withdrawal was rejected */}
              {latestRejectedWithdrawal && withdrawals[0]?.id === latestRejectedWithdrawal.id && (
                <div className="rounded-2xl bg-gradient-to-r from-rose-600/20 via-rose-500/12 to-[#0D1B38] border border-rose-500/45 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-rose-950/30">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Withdrawal Rejected Notice · {formatINR(latestRejectedWithdrawal.amount)} Refunded
                      </p>
                      <p className="text-sm font-semibold text-white leading-snug break-words">
                        {latestRejectedWithdrawal.rejectionReason || 'Your withdrawal request was rejected by Admin.'}
                      </p>
                      <p className="text-[11px] text-slate-300 font-mono-num">
                        {latestRejectedWithdrawal.id} · {formatDateTime(latestRejectedWithdrawal.updatedAt || latestRejectedWithdrawal.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRejectionNotice(latestRejectedWithdrawal)}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 transition-colors"
                  >
                    View Notice
                  </button>
                </div>
              )}

              {/* Subtle transparent security strip */}
              <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    18+ Compliant Ledger · KYC {user.kycStatus === 'verified' ? 'Verified' : 'Required for Payouts'} · 256-Bit SSL & UPI Gateway
                  </span>
                </div>
                <button
                  onClick={() => setShowLegal(true)}
                  className="text-blue-300 hover:text-blue-200 font-medium whitespace-nowrap"
                >
                  Compliance Info
                </button>
              </div>

              {/* Hero Balance Card + Quick Actions Grid (2-col on desktop, stacked on mobile) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Balance Hero Card */}
                <section className="lg:col-span-6 rounded-3xl bg-gradient-to-br from-[#163470] via-[#102552] to-[#0B1938] border border-blue-400/25 p-5 sm:p-6 flex flex-col justify-between shadow-xl shadow-blue-950/50">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-100/80">Total Balance</span>
                      <span className="text-xs font-mono-num text-blue-200/80">{user.id}</span>
                    </div>

                    <div className="text-4xl sm:text-5xl font-extrabold text-white font-mono-num tracking-tight">
                      {formatINR(wallet.totalBalance)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-emerald-300 font-semibold font-mono-num">
                        +{formatINR(wallet.earnedToday)} Earned Today
                      </span>
                      <span className="text-slate-300 font-mono-num">
                        Withdrawable: {formatINR(wallet.availableBalance)}
                      </span>
                      <span className="text-amber-300 font-mono-num">
                        Bonus: {formatINR(wallet.bonusBalance)}
                      </span>
                    </div>

                    <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-200/80">
                      <span className="flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-blue-300" />
                        Cloud Firestore Wallet
                      </span>
                      <span className="flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-blue-300" />
                        Firebase Auth Secured
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-6">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowDeposit(true)}
                        className="min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all"
                      >
                        <Wallet className="w-4 h-4" />
                        <span>Add Money</span>
                      </button>
                      <button
                        onClick={() => setShowWithdraw(true)}
                        className="min-h-[48px] rounded-2xl bg-[#11244D]/90 hover:bg-[#193369] active:scale-[0.98] border border-blue-400/35 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Building2 className="w-4 h-4" />
                        <span>Withdraw</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Quick Actions 2x2 Vibrant Cards (exact layout from reference image) */}
                <section className="lg:col-span-6 rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 flex flex-col justify-between">
                  <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <button
                      onClick={() => navigateTab('games')}
                      className="rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 hover:brightness-110 active:scale-[0.98] p-4 text-left flex items-center gap-3 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Gamepad2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">Play Games</p>
                        <p className="text-xs text-blue-100/90 truncate">{games.length} casino & luck games</p>
                      </div>
                    </button>

                    <button
                      onClick={() => navigateTab('refer')}
                      className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 hover:brightness-110 active:scale-[0.98] p-4 text-left flex items-center gap-3 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Award className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">Refer &amp; Earn</p>
                        <p className="text-xs text-amber-50/90 truncate">₹50 + 10% rewards</p>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setPendingDepositOfferAfterDaily(false);
                        setStartupModal('daily');
                      }}
                      className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 active:scale-[0.98] p-4 text-left flex items-center gap-3 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Gift className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">Daily Bonus</p>
                        <p className="text-xs text-emerald-50/90 truncate">
                          {canCheckInToday
                            ? `Day ${nextDayNumber}: Collect ₹${nextRewardAmount}`
                            : `Day ${user.dailyStreak}/30 claimed`}
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => setShowKyc(true)}
                      className="rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 hover:brightness-110 active:scale-[0.98] p-4 text-left flex items-center gap-3 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {user.kycStatus === 'verified' ? 'KYC Verified' : 'KYC Now'}
                        </p>
                        <p className="text-xs text-teal-50/90 truncate">
                          {user.kycStatus === 'verified' ? 'Payouts unlocked' : 'Required to withdraw'}
                        </p>
                      </div>
                    </button>
                  </div>
                </section>
              </div>

              {/* Front-Page Licensed Standards + Positive Player Reviews Panel */}
              <FrontReviewsAndTrustPanel
                userReviews={reviews}
                reviewSchedule={reviewSchedule}
                onOpenWriteReview={() => setShowReviews(true)}
                onOpenLegal={() => setShowLegal(true)}
              />

              {/* Recent Verified Ledger Activity (Strictly real backend events, zero fake winners) */}
              <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Your Recent Verified Activity</h2>
                    <p className="text-xs text-slate-400">Real-time synced Firestore ledger</p>
                  </div>
                  <button
                    onClick={() => navigateTab('wallet')}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300"
                  >
                    Full History
                  </button>
                </div>

                {transactions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    No activity yet. Play a skill game or explore Rewards to get started.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {transactions.slice(0, 4).map((txn) => (
                      <div
                        key={txn.id}
                        className="rounded-2xl bg-[#12244A] border border-blue-900/40 px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              txn.amount >= 0
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {txn.amount >= 0 ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{txn.title}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {txn.id} · {formatDateTime(txn.createdAt)} · {txn.status}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-bold font-mono-num ${
                              txn.amount >= 0 ? 'text-emerald-400' : 'text-rose-300'
                            }`}
                          >
                            {txn.amount >= 0 ? '+' : ''}
                            {formatINR(txn.amount)}
                          </p>
                          <p className="text-[11px] text-slate-400 capitalize">{txn.bucket}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SIMPLE & CLASSIC GAMES LOBBY                            */}
          {/* ============================================================== */}
          {activeTab === 'games' && (
            <div className="space-y-5">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight">Games</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pick any game to play · Bet ₹1 to ₹50,000
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono-num">
                  {filteredGames.length} games
                </span>
              </div>

              {/* Clean Classic Category Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {GAME_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-[#0D1B38] border border-blue-900/50 text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Classic Clean Game Cards Grid (Simple, Zero Clutter) */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {filteredGames.map((game) => (
                  <div
                    key={game.id}
                    onClick={() => setActiveGame(game)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveGame(game);
                      }
                    }}
                    className="group cursor-pointer rounded-2xl bg-[#0D1B38] border border-blue-900/50 hover:border-blue-500/70 overflow-hidden flex flex-col justify-between shadow-lg transition-all active:scale-[0.98]"
                  >
                    <div>
                      <div className="relative aspect-[16/10] bg-[#13264F] overflow-hidden">
                        <img
                          src={game.thumbnail}
                          alt={game.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B38] via-black/15 to-transparent" />
                        <div className="absolute top-2 left-2">
                          <LivePlayingBadge gameId={game.id} compact />
                        </div>
                      </div>
                      <div className="p-3 sm:p-4 space-y-1">
                        <h3 className="text-sm sm:text-base font-bold text-white leading-snug truncate">
                          {game.name}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-400">
                          {game.category} · Bet ₹1 – ₹50,000
                        </p>
                      </div>
                    </div>
                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveGame(game);
                        }}
                        className="w-full min-h-[40px] sm:min-h-[44px] rounded-xl bg-blue-600 group-hover:bg-blue-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Game History */}
              <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-3">
                <h2 className="text-base font-bold text-white">Your Game History</h2>
                {gameHistory.length === 0 ? (
                  <p className="text-sm text-slate-400">Play any casino or luck game above to record your first round.</p>
                ) : (
                  <div className="divide-y divide-blue-900/40">
                    {gameHistory.slice(0, 8).map((s) => (
                      <div key={s.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="font-semibold text-white">{s.gameName}</p>
                          <p className="text-xs text-slate-400">
                            Entry {formatINR(s.entryFee)} · {s.outcome === 'win' ? 'Won' : 'Lost'} ({s.winRatioUsed}% RNG) · {formatDateTime(s.playedAt)}
                          </p>
                        </div>
                        <span
                          className={`font-mono-num font-bold ${
                            s.rewardEarned > 0 ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {s.rewardEarned > 0 ? `+${formatINR(s.rewardEarned)}` : formatINR(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: WALLET DASHBOARD (Matches reference mockup #2 bottom-left) */}
          {/* ============================================================== */}
          {activeTab === 'wallet' && (
            <div className="space-y-5">
              {/* Wallet Summary Hero */}
              <section className="rounded-3xl bg-gradient-to-br from-[#163470] via-[#102552] to-[#0B1938] border border-blue-400/25 p-5 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-6 space-y-1.5">
                    <p className="text-xs text-blue-200/80">Total Balance</p>
                    <p className="text-4xl font-extrabold text-white font-mono-num">
                      {formatINR(wallet.totalBalance)}
                    </p>
                    <p className="text-xs text-emerald-300 font-mono-num">
                      +{formatINR(wallet.earnedToday)} Earned Today · Min Withdrawal {formatINR(wallet.minWithdrawalLimit)}
                    </p>
                  </div>
                  <div className="md:col-span-6 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-2.5">
                    <div className="rounded-2xl bg-[#0A1836]/80 border border-blue-400/20 p-3">
                      <p className="text-[11px] text-slate-300">Available (Withdrawable)</p>
                      <p className="text-base font-bold text-emerald-400 font-mono-num mt-0.5">
                        {formatINR(wallet.availableBalance)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#0A1836]/80 border border-blue-400/20 p-3">
                      <p className="text-[11px] text-slate-300">Bonus Balance</p>
                      <p className="text-base font-bold text-amber-300 font-mono-num mt-0.5">
                        {formatINR(wallet.bonusBalance)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#0A1836]/80 border border-blue-400/20 p-3">
                      <p className="text-[11px] text-slate-300">Total Earnings</p>
                      <p className="text-base font-bold text-white font-mono-num mt-0.5">
                        {formatINR(wallet.totalEarnings)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#0A1836]/80 border border-blue-400/20 p-3">
                      <p className="text-[11px] text-slate-300">Total Withdrawals</p>
                      <p className="text-base font-bold text-blue-300 font-mono-num mt-0.5">
                        {formatINR(wallet.totalWithdrawals)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowDeposit(true)}
                      className="min-h-[48px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Add Money</span>
                    </button>
                    <button
                      onClick={() => setShowWithdraw(true)}
                      className="min-h-[48px] rounded-2xl bg-[#0D1E42] hover:bg-[#163063] border border-blue-400/35 text-white font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Withdraw</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Prominent Admin Withdrawal Rejection Notice Banner in Wallet */}
              {latestRejectedWithdrawal && (
                <section className="rounded-3xl bg-gradient-to-r from-rose-600/20 via-rose-500/10 to-[#0D1B38] border border-rose-500/45 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-rose-950/30">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                          Admin Withdrawal Notice
                        </span>
                        <span className="text-[11px] font-mono-num text-emerald-300 font-semibold">
                          · {formatINR(latestRejectedWithdrawal.amount)} Refunded
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-white leading-snug break-words">
                        {latestRejectedWithdrawal.rejectionReason || 'Your withdrawal request was rejected.'}
                      </p>
                      <p className="text-xs text-slate-300 font-mono-num">
                        Ref {latestRejectedWithdrawal.transactionId} · {formatDateTime(latestRejectedWithdrawal.updatedAt || latestRejectedWithdrawal.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRejectionNotice(latestRejectedWithdrawal)}
                    className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 transition-colors"
                  >
                    View Full Notice
                  </button>
                </section>
              )}

              {/* Wallet History Tabs (Shows latest 15 by default with View All toggle) */}
              <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white">Transaction Ledger</h2>
                    <p className="text-[11px] text-slate-400">
                      Showing latest {showAllLedger ? 'all' : '15'} entries
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#071126]">
                    {([
                      ['all', 'All'],
                      ['deposits', 'Deposits'],
                      ['withdrawals', 'Withdrawals'],
                      ['rewards', 'Game Rewards'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setWalletSubTab(key);
                          setShowAllLedger(false);
                        }}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                          walletSubTab === key
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {walletSubTab === 'deposits' ? (
                  deposits.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">No deposits recorded yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {(showAllLedger ? deposits : deposits.slice(0, 15)).map((d) => {
                        const methodLabel = d.paymentMethod || d.gateway;
                        const utrDisplay = d.utrNumber || d.userTransactionRef;
                        const displayAmt = d.status === 'Successful' ? (d.creditedAmount ?? d.amount) : d.amount;
                        return (
                          <div key={d.id} className="rounded-2xl bg-[#12244A] px-4 py-3.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-sm font-semibold text-white">
                                {methodLabel} · {formatINR(displayAmt)}
                                {d.bonusAmount > 0 && d.status !== 'Failed' && (
                                  <span className="text-xs font-mono-num text-amber-300 ml-1.5">
                                    +{formatINR(d.bonusAmount)} bonus
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400 font-mono-num truncate">
                                {utrDisplay ? `UTR ${utrDisplay}` : `Order ${d.gatewayOrderId}`} · {d.transactionId} · {formatDateTime(d.createdAt)}
                              </p>
                              {d.status === 'Pending' && (
                                <p className="text-[11px] text-amber-300/90">
                                  Sent to Admin for UTR verification &amp; wallet credit
                                </p>
                              )}
                              {d.failureReason && (
                                <p className="text-xs text-rose-300 mt-0.5">{d.failureReason}</p>
                              )}
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
                              {d.status}
                            </span>
                          </div>
                        );
                      })}
                      {deposits.length > 15 && (
                        <button
                          type="button"
                          onClick={() => setShowAllLedger((prev) => !prev)}
                          className="w-full min-h-[44px] rounded-2xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-700/60 text-xs font-bold text-blue-200 transition-colors"
                        >
                          {showAllLedger ? 'Show Latest 15' : `View All (${deposits.length})`}
                        </button>
                      )}
                    </div>
                  )
                ) : walletSubTab === 'withdrawals' ? (
                  <div className="space-y-3">
                    {wallet.withdrawalNoticeBanner?.enabled &&
                      wallet.withdrawalNoticeBanner.message.trim().length > 0 && (
                        <div className="rounded-2xl bg-gradient-to-r from-blue-600/20 via-sky-500/12 to-[#0A1630] border border-sky-400/45 px-4 py-3.5 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/35 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                              {wallet.withdrawalNoticeBanner.title || 'Withdrawal Notice'}
                            </p>
                            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                              {wallet.withdrawalNoticeBanner.message}
                            </p>
                          </div>
                        </div>
                      )}
                    {withdrawals.length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">
                        No withdrawal requests yet. Once submitted, track live status here.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {(showAllLedger ? withdrawals : withdrawals.slice(0, 15)).map((w) => (
                          <div
                            key={w.id}
                            className={`rounded-2xl px-4 py-3.5 space-y-2.5 border ${
                              w.status === 'Rejected'
                                ? 'bg-[#171633] border-rose-500/40'
                                : 'bg-[#12244A] border-blue-900/40'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white">
                                {formatINR(w.amount)} via {w.methodType === 'upi' ? w.upiId : `${w.accountHolderName} (${w.ifscCode})`}
                              </p>
                              <span
                                className={`text-xs font-bold shrink-0 px-2.5 py-0.5 rounded-lg ${
                                  w.status === 'Completed'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : w.status === 'Rejected'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400/35'
                                    : 'bg-amber-500/15 text-amber-300'
                                }`}
                              >
                                {w.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-mono-num">
                              {w.id} · {w.transactionId} · {formatDateTime(w.createdAt)}
                              {w.utrNumber ? ` · UTR ${w.utrNumber}` : ''}
                            </p>
                            {w.status === 'Rejected' && (
                              <div className="rounded-xl bg-rose-500/12 border border-rose-400/40 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-300">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Admin Rejection Notice
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveRejectionNotice(w)}
                                    className="text-[11px] font-bold text-rose-200 hover:text-white underline underline-offset-2"
                                  >
                                    View Full Notice
                                  </button>
                                </div>
                                <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed whitespace-pre-wrap break-words">
                                  {w.rejectionReason || 'Withdrawal request was rejected by Admin.'}
                                </p>
                                <p className="text-[11px] text-emerald-300 font-medium">
                                  {formatINR(w.amount)} automatically refunded to your Available Balance.
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                        {withdrawals.length > 15 && (
                          <button
                            type="button"
                            onClick={() => setShowAllLedger((prev) => !prev)}
                            className="w-full min-h-[44px] rounded-2xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-700/60 text-xs font-bold text-blue-200 transition-colors"
                          >
                            {showAllLedger ? 'Show Latest 15' : `View All (${withdrawals.length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (() => {
                  const filteredTx = transactions.filter(
                    (t) => walletSubTab === 'all' || t.type === 'game_reward'
                  );
                  const visibleTx = showAllLedger ? filteredTx : filteredTx.slice(0, 15);
                  if (filteredTx.length === 0) {
                    return (
                      <p className="text-sm text-slate-400 py-6 text-center">
                        No transactions recorded yet.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2.5">
                      {visibleTx.map((t) => (
                        <div key={t.id} className="rounded-2xl bg-[#12244A] px-4 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                            <p className="text-xs text-slate-300 truncate">{t.description}</p>
                            <p className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                              {t.id} · {formatDateTime(t.createdAt)} · {t.status}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold font-mono-num ${t.amount >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                              {t.amount >= 0 ? '+' : ''}
                              {formatINR(t.amount)}
                            </p>
                            <p className="text-[11px] text-slate-400 capitalize">{t.bucket}</p>
                          </div>
                        </div>
                      ))}
                      {filteredTx.length > 15 && (
                        <button
                          type="button"
                          onClick={() => setShowAllLedger((prev) => !prev)}
                          className="w-full min-h-[44px] rounded-2xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-700/60 text-xs font-bold text-blue-200 transition-colors"
                        >
                          {showAllLedger ? 'Show Latest 15' : `View All (${filteredTx.length})`}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: REFER & EARN                                               */}
          {/* ============================================================== */}
          {activeTab === 'refer' && (
            <ReferAndEarnTab
              fallbackReferralCode={user.referralCode}
              onNotify={showToast}
              onRefreshApp={refreshAllData}
            />
          )}

          {/* ============================================================== */}
          {/* TAB 4: REWARDS & BONUSES (Matches reference mockup #2 top-right) */}
          {/* ============================================================== */}
          {activeTab === 'rewards' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-white">Rewards & Bonuses</h1>
                <p className="text-xs text-slate-400">
                  Bonus Balance ({formatINR(wallet.bonusBalance)}) is tracked separately from Withdrawable Balance ({formatINR(wallet.availableBalance)}).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Daily Streak Check-In Card (30-Day Ladder: Day 1 ₹2 -> Day 10 ₹50 -> Day 30 ₹300) */}
                <div className="rounded-3xl bg-gradient-to-br from-[#163470] to-[#0E2046] border border-blue-500/30 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-white">
                        30-Day Daily Bonus (Day {user.dailyStreak}/30)
                      </p>
                      <p className="text-xs text-slate-300">
                        Day 1 ₹2, Day 2 ₹4, Day 10 ₹50 up to Day 30 ₹300 in Bonus Balance.
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CalendarCheck className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!canCheckInToday}
                      onClick={handleDailyCheckIn}
                      className="flex-1 min-h-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-bold text-sm transition-colors"
                    >
                      {canCheckInToday
                        ? `Collect Day ${nextDayNumber} (₹${nextRewardAmount})`
                        : 'Claimed Today — Return Tomorrow'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDepositOfferAfterDaily(false);
                        setStartupModal('daily');
                      }}
                      className="min-h-[46px] px-3.5 rounded-xl bg-blue-600/25 border border-blue-400/35 text-blue-200 hover:text-white text-xs font-semibold shrink-0"
                    >
                      30 Days
                    </button>
                  </div>
                </div>

                {/* Welcome Bonus ₹100 Card */}
                <div className="rounded-3xl bg-gradient-to-br from-[#0F3F4D] to-[#0B2239] border border-teal-500/30 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-white">
                        ₹{welcomeConfig?.amount ?? 100} Welcome Bonus
                      </p>
                      <p className="text-xs text-teal-200/90 mt-0.5">
                        {user.welcomeBonusClaimed
                          ? `Credited · Expires ${user.welcomeBonusExpiresAt ? formatDateTime(user.welcomeBonusExpiresAt) : 'in 30 days'}`
                          : 'Eligible for newly verified accounts'}
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-teal-400/20 text-teal-300 flex items-center justify-center shrink-0">
                      <Gift className="w-6 h-6" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {welcomeConfig?.terms}
                  </p>
                  {!user.welcomeBonusClaimed ? (
                    <button
                      onClick={handleClaimWelcome}
                      className="w-full min-h-[44px] rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm"
                    >
                      Claim Welcome Bonus
                    </button>
                  ) : (
                    <div className="text-xs font-semibold text-emerald-300">
                      Welcome Bonus Active in Bonus Balance
                    </div>
                  )}
                </div>

                {/* Refer & Earn Card */}
                <div className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-3">
                  <p className="text-base font-bold text-white">Refer Friends & Earn ₹50 Bonus</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Share your unique referral code. When a new verified user registers with your code, ₹50 is credited to your Bonus Balance.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 flex items-center justify-between font-mono-num text-sm font-bold text-blue-300">
                      <span>{user.referralCode}</span>
                    </div>
                    <button
                      onClick={handleCopyReferral}
                      className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                {/* Active Promotional Campaigns */}
                <div className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-white">Promotional Campaigns</p>
                    <span className="text-[11px] text-amber-300 font-medium">Promotional Terms Apply</span>
                  </div>
                  <div className="space-y-2.5">
                    {campaigns.map((c) => (
                      <div key={c.id} className="rounded-2xl bg-[#12244A] p-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{c.title}</p>
                          <span className="font-mono-num text-xs font-bold text-emerald-400">
                            {formatINR(c.rewardAmount)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{c.description}</p>
                        <p className="text-[11px] text-slate-400">{c.eligibilityRules}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: PROFILE & ACCOUNT (Matches reference mockup #2 bottom-right) */}
          {/* ============================================================== */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Profile Hero Card */}
              <section className="rounded-3xl bg-gradient-to-b from-[#132B5E] to-[#0D1B38] border border-blue-900/50 p-6 text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-400 to-indigo-700 border-2 border-blue-300 flex items-center justify-center text-2xl font-extrabold text-white shadow-lg">
                  {user.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">{user.name}</h1>
                  <p className="text-xs text-blue-300 font-mono-num mt-0.5">
                    {user.id} · +91 {user.mobile} · {user.state}
                  </p>
                </div>

                {/* 3-Stat Row from Mockup */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-2xl bg-[#0A1630]/80 border border-blue-900/50 p-3.5">
                    <p className="text-base font-bold text-white font-mono-num">
                      {formatINR(wallet.totalBalance)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Balance</p>
                  </div>
                  <div className="rounded-2xl bg-[#0A1630]/80 border border-blue-900/50 p-3.5">
                    <p className="text-base font-bold text-white font-mono-num">
                      {gameHistory.length}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Games Played</p>
                  </div>
                  <div className="rounded-2xl bg-[#0A1630]/80 border border-blue-900/50 p-3.5">
                    <p className="text-base font-bold text-emerald-400 font-mono-num">
                      {formatINR(wallet.totalEarnings)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Total Earned</p>
                  </div>
                </div>
              </section>

              {/* Inline Edit Profile Drawer */}
              {editingProfile && (
                <form
                  onSubmit={handleSaveProfile}
                  className="rounded-2xl bg-[#0D1B38] border border-blue-800/60 p-4 space-y-3"
                >
                  <p className="text-sm font-bold text-white">Edit Personal Information</p>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                    required
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email Address"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 min-h-[42px] rounded-xl bg-blue-600 text-white text-xs font-semibold">
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(false)}
                      className="flex-1 min-h-[42px] rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Interactive Menu Rows (Matching Mockup #2 bottom-right) */}
              <div className="space-y-2.5">
                <ProfileMenuRow
                  icon={UserCheck}
                  title="Personal Information"
                  meta={user.email}
                  onClick={() => setEditingProfile((v) => !v)}
                />
                <ProfileMenuRow
                  icon={ShieldCheck}
                  title="KYC Verification"
                  meta={user.kycStatus === 'verified' ? 'Verified' : user.kycStatus}
                  metaColor={user.kycStatus === 'verified' ? 'text-emerald-400' : 'text-amber-300'}
                  onClick={() => setShowKyc(true)}
                />
                <ProfileMenuRow
                  icon={CreditCard}
                  title="Payment Methods"
                  meta={`${user.paymentMethods.length} saved`}
                  onClick={() => setShowPaymentMethods(true)}
                />
                <ProfileMenuRow
                  icon={KeyRound}
                  title="Switch Account / Sign Up"
                  meta="Email / Mobile"
                  onClick={() => setShowAuthModal(true)}
                />
                <ProfileMenuRow
                  icon={HelpCircle}
                  title="Legal, Terms & Responsible Gaming"
                  meta="18+ Policy"
                  onClick={() => setShowLegal(true)}
                />
                {isAdminUser && (
                  <ProfileMenuRow
                    icon={Lock}
                    title="Owner Admin Dashboard"
                    meta="Admin Access"
                    metaColor="text-blue-300"
                    onClick={() => setAdminMode(true)}
                  />
                )}
                <ProfileMenuRow
                  icon={LogOut}
                  title="Sign Out to Login Page"
                  meta="Logout"
                  metaColor="text-rose-300"
                  onClick={handleLogout}
                />
              </div>
            </div>
          )}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0A1630]/95 backdrop-blur-md border-t border-blue-900/50 pb-safe">
          <div className="grid grid-cols-6 h-16 items-center">
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => navigateTab(key)}
                  className={`h-full px-0.5 flex flex-col items-center justify-center gap-1 transition-colors ${
                    active ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-semibold tracking-tight leading-none truncate max-w-full">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Modals & Full-Screen Arcade Games */}
      {(() => {
        if (!activeGame) return null;
        const effectiveWinRatio =
          typeof user.customWinRatio === 'number' && Number.isFinite(user.customWinRatio)
            ? Math.max(0, Math.min(100, Math.round(user.customWinRatio)))
            : Math.round((activeGame.minWinRatio + activeGame.maxWinRatio) / 2);

        if (activeGame.engine === 'money_rolling') {
          return (
            <MoneyRollingGame
              gameId={activeGame.id}
              gameName={activeGame.name}
              wallet={wallet}
              onlinePlayers={onlinePlayers}
              winRatio={effectiveWinRatio}
              onBack={() => {
                setActiveGame(null);
                refreshAllData();
              }}
              onOpenDeposit={() => {
                setActiveGame(null);
                setShowDeposit(true);
              }}
              onOpenWithdraw={() => {
                setActiveGame(null);
                setShowWithdraw(true);
              }}
              onWalletUpdated={setWallet}
            />
          );
        }

        if (activeGame.engine === 'hot_volcano') {
          return (
            <HotVolcanoGame
              gameId={activeGame.id}
              gameName={activeGame.name}
              wallet={wallet}
              onlinePlayers={onlinePlayers}
              winRatio={effectiveWinRatio}
              onBack={() => {
                setActiveGame(null);
                refreshAllData();
              }}
              onOpenDeposit={() => {
                setActiveGame(null);
                setShowDeposit(true);
              }}
              onOpenWithdraw={() => {
                setActiveGame(null);
                setShowWithdraw(true);
              }}
              onWalletUpdated={setWallet}
            />
          );
        }

        if (activeGame.engine === 'aviator') {
          return (
            <AviatorProGame
              gameId={activeGame.id}
              gameName={activeGame.name}
              wallet={wallet}
              onlinePlayers={onlinePlayers}
              winRatio={effectiveWinRatio}
              onBack={() => {
                setActiveGame(null);
                refreshAllData();
              }}
              onOpenDeposit={() => {
                setActiveGame(null);
                setShowDeposit(true);
              }}
              onOpenWithdraw={() => {
                setActiveGame(null);
                setShowWithdraw(true);
              }}
              onWalletUpdated={setWallet}
            />
          );
        }

        if (activeGame.engine === 'mines_grid') {
          return (
            <MinesGame
              gameId={activeGame.id}
              gameName={activeGame.name}
              wallet={wallet}
              onlinePlayers={onlinePlayers}
              winRatio={effectiveWinRatio}
              onBack={() => {
                setActiveGame(null);
                refreshAllData();
              }}
              onOpenDeposit={() => {
                setActiveGame(null);
                setShowDeposit(true);
              }}
              onOpenWithdraw={() => {
                setActiveGame(null);
                setShowWithdraw(true);
              }}
              onWalletUpdated={setWallet}
            />
          );
        }

        if (activeGame.engine === 'twist') {
          return (
            <TwistWheelGame
              gameId={activeGame.id}
              gameName={activeGame.name}
              wallet={wallet}
              onlinePlayers={onlinePlayers}
              winRatio={effectiveWinRatio}
              onBack={() => {
                setActiveGame(null);
                refreshAllData();
              }}
              onOpenDeposit={() => {
                setActiveGame(null);
                setShowDeposit(true);
              }}
              onOpenWithdraw={() => {
                setActiveGame(null);
                setShowWithdraw(true);
              }}
              onWalletUpdated={setWallet}
            />
          );
        }

        return null;
      })()}

      {activeGame &&
        !['money_rolling', 'hot_volcano', 'aviator', 'mines_grid', 'twist'].includes(
          activeGame.engine
        ) && (
          <GameArenaModal
            game={activeGame}
            wallet={wallet}
            leaderboard={leaderboards[activeGame.id] || []}
            onClose={() => setActiveGame(null)}
            onOpenDeposit={() => setShowDeposit(true)}
            onCompleted={async (session, nextWallet) => {
              setWallet(nextWallet);
              showToast(
                session.rewardEarned > 0
                  ? `Won ${formatINR(session.rewardEarned)} in ${session.gameName}!`
                  : `Round complete (${formatINR(session.entryFee)} entry).`
              );
              await refreshAllData();
            }}
          />
        )}

      {showWithdraw && (
        <WithdrawModal
          user={user}
          wallet={wallet}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => refreshAllData()}
          onOpenKyc={() => setShowKyc(true)}
        />
      )}

      {activeRejectionNotice && !activeGame && (
        <WithdrawalRejectionModal
          withdrawal={activeRejectionNotice}
          onAcknowledge={() => acknowledgeRejectionNotice(activeRejectionNotice.id)}
          onViewWallet={() => {
            acknowledgeRejectionNotice(activeRejectionNotice.id);
            navigateTab('wallet');
            setWalletSubTab('withdrawals');
          }}
        />
      )}

      {showNotifications && (
        <NotificationsDrawer
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={handleMarkAllRead}
        />
      )}

      {showKyc && (
        <KycModal
          user={user}
          onClose={() => setShowKyc(false)}
          onUpdated={() => {
            showToast('KYC verification submitted.');
            refreshAllData();
          }}
        />
      )}

      {showPaymentMethods && (
        <PaymentMethodsModal
          methods={user.paymentMethods}
          onClose={() => setShowPaymentMethods(false)}
          onUpdated={() => refreshAllData()}
        />
      )}

      {showAuthModal && (
        <AccountAuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={() => {
            showToast('Account session updated.');
            refreshAllData();
          }}
        />
      )}

      {showReviews && (
        <ReviewsModal
          currentUserId={user.id}
          reviews={reviews}
          reviewSchedule={reviewSchedule}
          onClose={() => setShowReviews(false)}
          onUpdated={() => refreshAllData()}
        />
      )}

      {showLegal && (
        <LegalComplianceModal
          prohibitedStates={prohibitedStates}
          onClose={() => setShowLegal(false)}
        />
      )}

      {startupModal === 'announcement' && appAnnouncement && !activeGame && (
        <AppAnnouncementPopup
          announcement={appAnnouncement}
          onClose={() => {
            try {
              window.localStorage?.setItem(
                'gr_seen_announcement_rev',
                String(appAnnouncement.revision)
              );
            } catch {
              // ignore storage error
            }
            if (pendingStartupAfterNotice) {
              setPendingStartupAfterNotice(false);
              if (canCheckInToday) {
                setPendingDepositOfferAfterDaily(true);
                setStartupModal('daily');
              } else {
                setStartupModal('deposit');
              }
            } else {
              setStartupModal('none');
            }
          }}
        />
      )}

      {startupModal === 'daily' && !activeGame && (
        <DailyBonusPopup
          dailyStreak={user.dailyStreak}
          canCheckInToday={canCheckInToday}
          ladder={dailyBonusLadder}
          onClaim={handleDailyCheckIn}
          onClose={() => {
            if (pendingDepositOfferAfterDaily) {
              setPendingDepositOfferAfterDaily(false);
              setStartupModal('deposit');
            } else {
              setStartupModal('none');
            }
          }}
        />
      )}

      {startupModal === 'deposit' && !activeGame && (
        <DepositBonusPopup
          offers={depositBonusOffers}
          onGoToDeposit={() => {
            setStartupModal('none');
            setShowDeposit(true);
          }}
          onClose={() => setStartupModal('none')}
        />
      )}
    </div>
  );
}

const ProfileMenuRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta?: string;
  metaColor?: string;
  onClick: () => void;
}> = ({ icon: Icon, title, meta, metaColor = 'text-slate-400', onClick }) => (
  <button
    onClick={onClick}
    className="w-full min-h-[58px] px-4 rounded-2xl bg-[#0D1B38] hover:bg-[#13264F] border border-blue-900/50 flex items-center justify-between gap-3 transition-colors text-left"
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-semibold text-white truncate">{title}</span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {meta && <span className={`text-xs font-medium capitalize ${metaColor}`}>{meta}</span>}
      <ChevronRight className="w-4 h-4 text-slate-500" />
    </div>
  </button>
);

export default App;
