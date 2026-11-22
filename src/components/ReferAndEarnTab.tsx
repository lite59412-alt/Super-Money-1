import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileArchive,
  Gift,
  History,
  Link2,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  formatDateTime,
  formatINR,
  getPublicAppReleaseFirestore,
  getUserReferralDashboardFirestore,
  normalizeDirectApkUrl,
} from '../lib/api';
import type { AppReleaseConfig, ReferralStatus, UserReferralDashboardData } from '../types';

function formatAppFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ReferAndEarnTabProps {
  fallbackReferralCode: string;
  onNotify: (msg: string) => void;
  onRefreshApp?: () => void;
}

type ReferSubView = 'overview' | 'history';
type StatusFilter = 'All' | ReferralStatus;

export const ReferAndEarnTab: React.FC<ReferAndEarnTabProps> = ({
  fallbackReferralCode,
  onNotify,
  onRefreshApp,
}) => {
  const [data, setData] = useState<UserReferralDashboardData | null>(null);
  const [appRelease, setAppRelease] = useState<AppReleaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingApp, setSharingApp] = useState(false);
  const [error, setError] = useState('');
  const [subView, setSubView] = useState<ReferSubView>('overview');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [copiedType, setCopiedType] = useState<'code' | 'message' | 'link' | null>(null);

  const loadReferralData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [refRes, releaseRes] = await Promise.all([
        getUserReferralDashboardFirestore(),
        getPublicAppReleaseFirestore().catch(() => null),
      ]);
      setData(refRes);
      if (releaseRes) {
        setAppRelease(releaseRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load referral dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReferralData(false);
  }, [loadReferralData]);

  const referralCode = data?.referralCode || fallbackReferralCode;

  const settings = data?.settings || {
    signup_bonus: 50,
    referral_percentage: 10,
    minimum_qualifying_deposit: 100,
    promotion_enabled: true,
    updated_at: '',
  };

  const stats = data?.stats || {
    totalInvitedFriends: 0,
    successfulReferrals: 0,
    pendingReferrals: 0,
    totalReferralRewards: 0,
    signupRewardsTotal: 0,
    depositRewardsTotal: 0,
  };

  const directApkUrl = useMemo(() => {
    if (!appRelease?.downloadUrl) return '';
    return normalizeDirectApkUrl(appRelease.downloadUrl);
  }, [appRelease?.downloadUrl]);

  const isAppShareReady = Boolean(
    appRelease && appRelease.enabled && directApkUrl
  );

  // Public no-login download page fallback if direct APK link is not yet set
  const publicDownloadPageUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (!origin || !/^https?:\/\//i.test(origin)) return '';
    return `${origin}/?download=apk&ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  const shareDownloadUrl = directApkUrl || publicDownloadPageUrl;

  const shareText = useMemo(() => {
    const template =
      appRelease?.shareMessageTemplate?.trim() ||
      'Install GameReward App & use my Referral Code {CODE} while signing up to earn bonus rewards!';
    const replaced = template.includes('{CODE}')
      ? template.replace(/\{CODE\}/g, referralCode)
      : `${template}\nMy Referral Code: ${referralCode}`;
    return replaced;
  }, [appRelease?.shareMessageTemplate, referralCode]);

  const shareMessageWithApk = useMemo(() => {
    if (!shareDownloadUrl) return shareText;
    return `${shareText}\n\nDirect App APK Download (No Login):\n${shareDownloadUrl}`;
  }, [shareText, shareDownloadUrl]);

  const whatsappUrl = useMemo(
    () => `https://wa.me/?text=${encodeURIComponent(shareMessageWithApk)}`,
    [shareMessageWithApk]
  );

  const telegramUrl = useMemo(
    () =>
      `https://t.me/share/url?url=${encodeURIComponent(shareDownloadUrl || '')}&text=${encodeURIComponent(shareText)}`,
    [shareDownloadUrl, shareText]
  );

  const copyValue = async (value: string, type: 'code' | 'message' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedType(type);
      onNotify(
        type === 'code'
          ? `Referral code ${referralCode} copied!`
          : type === 'link'
          ? 'Direct no-login APK download link copied!'
          : 'Direct APK link & referral invite copied!'
      );
      window.setTimeout(() => setCopiedType(null), 2200);
    } catch {
      onNotify(type === 'code' ? `Your code: ${referralCode}` : value);
    }
  };

  const handleShareAppDirectly = async () => {
    if (!isAppShareReady || !directApkUrl || !appRelease) {
      onNotify('App APK link is not configured yet. Ask Admin to add the latest APK link in Admin Panel.');
      return;
    }
    if (sharingApp) return;
    setSharingApp(true);

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    const apkFileName = appRelease.fileName || 'GameReward.apk';
    const mimeType = appRelease.mimeType || 'application/vnd.android.package-archive';

    try {
      // Step 1: Try sharing the actual .apk file directly when Web Share Files API + CORS support it (5s timeout)
      if (
        typeof nav !== 'undefined' &&
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function'
      ) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(directApkUrl, {
            cache: 'no-store',
            signal: controller.signal,
          });
          window.clearTimeout(timeoutId);
          if (response.ok) {
            const blob = await response.blob();
            // Only attach as APK if response looks like binary/apk and not an HTML redirect page
            const isHtml = (blob.type || '').toLowerCase().includes('text/html');
            if (!isHtml && blob.size > 0) {
              const appFile = new File([blob], apkFileName, { type: mimeType });
              if (nav.canShare({ files: [appFile] })) {
                await nav.share({
                  files: [appFile],
                  title: appRelease.appName || 'GameReward App',
                  text: shareText,
                });
                onNotify('APK file shared directly! Friend can install immediately & enter your referral code.');
                return;
              }
            }
          }
        } catch (fetchErr) {
          window.clearTimeout(timeoutId);
          // User cancelled native share sheet
          if (fetchErr instanceof Error && fetchErr.name === 'AbortError' && !controller.signal.aborted) {
            return;
          }
          // Otherwise CORS/timeout — fall through instantly to direct no-login APK link share
        }
      }

      // Step 2: Native Android / Mobile Share Sheet with direct no-login APK link + referral code
      if (typeof nav !== 'undefined' && typeof nav.share === 'function') {
        try {
          await nav.share({
            title: appRelease.appName || 'GameReward App',
            text: shareMessageWithApk,
            url: directApkUrl,
          });
          onNotify('Direct APK download link & referral code shared!');
          return;
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') {
            return;
          }
        }
      }

      // Step 3: Desktop / fallback — copy direct no-login APK link + referral invite message
      try {
        await navigator.clipboard.writeText(shareMessageWithApk);
        setCopiedType('message');
        window.setTimeout(() => setCopiedType(null), 2400);
        onNotify(
          'Direct APK download link & referral code copied! Paste on WhatsApp or Telegram — friends can download without login.'
        );
      } catch {
        onNotify(`Share this direct APK link: ${directApkUrl}`);
      }
    } finally {
      setSharingApp(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const rows = data?.history || [];
    if (statusFilter === 'All') return rows;
    return rows.filter((item) => item.rewardStatus === statusFilter);
  }, [data?.history, statusFilter]);

  const rewardExamples = useMemo(() => {
    const baseAmounts = [
      Math.max(100, settings.minimum_qualifying_deposit),
      500,
      1000,
    ];
    const uniqueAmounts = Array.from(new Set(baseAmounts)).sort((a, b) => a - b);
    return uniqueAmounts.map((amt) => ({
      deposit: amt,
      reward: Math.round(((amt * settings.referral_percentage) / 100) * 100) / 100,
    }));
  }, [settings.minimum_qualifying_deposit, settings.referral_percentage]);

  const renderStatusBadge = (status: ReferralStatus) => {
    if (status === 'Reward Credited') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3" />
          Reward Credited
        </span>
      );
    }
    if (status === 'Qualified') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-400/30 text-blue-300 text-[11px] font-semibold whitespace-nowrap">
          <UserCheck className="w-3 h-3" />
          Qualified
        </span>
      );
    }
    if (status === 'Reversed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-300 text-[11px] font-semibold whitespace-nowrap">
          <XCircle className="w-3 h-3" />
          Reversed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-semibold whitespace-nowrap">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-10 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
        <p className="text-sm text-slate-300">Loading your Refer &amp; Earn dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sub-view Switcher: Dashboard vs Dedicated Referral History */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-2xl bg-[#0D1B38] border border-blue-900/50">
          <button
            type="button"
            onClick={() => setSubView('overview')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              subView === 'overview'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Referral Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              subView === 'history'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Referral History</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono-num">
              {(data?.history || []).length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            loadReferralData(true);
            onRefreshApp?.();
          }}
          disabled={refreshing}
          className="min-h-[40px] px-3.5 rounded-xl bg-[#0D1B38] hover:bg-[#13264F] border border-blue-900/50 text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {subView === 'overview' ? (
        <>
          {/* Hero Referral Banner */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#122B63] via-[#1B3A7A] to-[#0E204B] border border-blue-500/30 p-5 sm:p-6 shadow-xl shadow-blue-950/50">
            <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-amber-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-10 w-52 h-52 rounded-full bg-emerald-400/15 blur-3xl" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-2.5 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/35 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    Refer &amp; Earn Program
                  </span>
                  {!settings.promotion_enabled && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[11px] font-semibold">
                      Promotions Temporarily Paused
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
                  Invite Friends &amp; Earn{' '}
                  <span className="text-amber-300">{formatINR(settings.signup_bonus)}</span> +{' '}
                  <span className="text-emerald-300">{settings.referral_percentage}%</span> Deposit
                  Rewards
                </h2>

                <p className="text-xs sm:text-sm text-blue-100/85 leading-relaxed">
                  Share the official app directly with friends along with your referral code. Earn{' '}
                  <strong className="text-white">{formatINR(settings.signup_bonus)}</strong> virtual
                  credits when a friend signs up with your code, plus{' '}
                  <strong className="text-white">{settings.referral_percentage}%</strong> automatic
                  rewards on every verified deposit of{' '}
                  <strong className="text-white">
                    {formatINR(settings.minimum_qualifying_deposit)}
                  </strong>{' '}
                  or more.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 shrink-0">
                <div className="rounded-2xl bg-[#071126]/65 border border-amber-400/25 px-4 py-3 text-center">
                  <p className="text-[11px] text-amber-200/80 font-medium">Signup Bonus</p>
                  <p className="text-xl font-extrabold text-amber-300 font-mono-num mt-0.5">
                    {formatINR(settings.signup_bonus)}
                  </p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Per verified friend</p>
                </div>
                <div className="rounded-2xl bg-[#071126]/65 border border-emerald-400/25 px-4 py-3 text-center">
                  <p className="text-[11px] text-emerald-200/80 font-medium">Activity Reward</p>
                  <p className="text-xl font-extrabold text-emerald-300 font-mono-num mt-0.5">
                    {settings.referral_percentage}%
                  </p>
                  <p className="text-[10px] text-slate-300 mt-0.5">
                    Min {formatINR(settings.minimum_qualifying_deposit)} deposit
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 4 Core Referral Statistics Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Total Invited Friends</span>
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-extrabold text-white font-mono-num mt-2">
                {stats.totalInvitedFriends}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Joined with your code</p>
            </div>

            <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Successful Referrals</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono-num mt-2">
                {stats.successfulReferrals}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Verified &amp; rewarded</p>
            </div>

            <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Pending Referrals</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-extrabold text-amber-300 font-mono-num mt-2">
                {stats.pendingReferrals}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting qualification</p>
            </div>

            <div className="rounded-2xl bg-[#0D1B38] border border-emerald-500/25 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">Total Referral Rewards</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-extrabold text-amber-300 font-mono-num mt-2">
                {formatINR(stats.totalReferralRewards)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono-num">
                Signup {formatINR(stats.signupRewardsTotal)} · Activity{' '}
                {formatINR(stats.depositRewardsTotal)}
              </p>
            </div>
          </section>

          {/* My Referral Code & Direct App Share Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">Share Direct APK &amp; Referral Code</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Share the direct APK file or zero-login APK download link so friends install instantly without logging in
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
              </div>

              {/* Unique Code Box */}
              <div className="rounded-2xl bg-[#071126] border border-blue-800/60 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    My Referral Code
                  </p>
                  <p className="text-2xl font-extrabold tracking-[0.18em] text-amber-300 font-mono-num mt-1">
                    {referralCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(referralCode, 'code')}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-bold inline-flex items-center gap-2 transition-all shadow-lg shadow-blue-600/25"
                >
                  {copiedType === 'code' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Code Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Referral Code</span>
                    </>
                  )}
                </button>
              </div>

              {/* Uploaded App Package Info & Primary Direct Share CTA */}
              <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-4 space-y-3">
                {isAppShareReady && appRelease ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-blue-600/25 border border-emerald-400/35 text-emerald-300 flex items-center justify-center shrink-0">
                          <FileArchive className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-bold text-white truncate">
                              {appRelease.appName}
                            </p>
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-200 text-[10px] font-mono-num font-bold">
                              v{appRelease.version}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono-num truncate mt-0.5">
                            {appRelease.fileName || 'GameReward.apk'}
                            {appRelease.fileSizeBytes > 0 ? ` · ${formatAppFileSize(appRelease.fileSizeBytes)}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold shrink-0">
                        NO LOGIN APK
                      </span>
                    </div>

                    {appRelease.releaseNotes && (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {appRelease.releaseNotes}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={sharingApp}
                      onClick={handleShareAppDirectly}
                      className="w-full min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 hover:brightness-110 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition"
                    >
                      {sharingApp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Preparing Direct APK...</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          <span>Share APK Directly</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="py-2 text-center space-y-1.5">
                    <Smartphone className="w-6 h-6 text-slate-500 mx-auto" />
                    <p className="text-xs font-semibold text-slate-200">
                      Official App File Coming Soon
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Admin hasn&apos;t added the Android APK link yet. Meanwhile, copy your referral code or invite message below.
                    </p>
                  </div>
                )}
              </div>

              {/* Secondary Actions: WhatsApp, Telegram, Direct APK Link, Download APK */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>WhatsApp</span>
                </a>

                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Send className="w-4 h-4 shrink-0" />
                  <span>Telegram</span>
                </a>

                <button
                  type="button"
                  onClick={() => copyValue(shareDownloadUrl || shareMessageWithApk, shareDownloadUrl ? 'link' : 'message')}
                  className="min-h-[44px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-800/60 text-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedType === 'link' || copiedType === 'message' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 shrink-0" />
                      <span>Copy APK Link</span>
                    </>
                  )}
                </button>

                {isAppShareReady && directApkUrl ? (
                  <a
                    href={directApkUrl}
                    download={appRelease?.fileName || 'GameReward.apk'}
                    className="min-h-[44px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-700/60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-300 shrink-0" />
                    <span>Download APK</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => copyValue(shareMessageWithApk, 'message')}
                    className="min-h-[44px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-800/60 text-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>Copy Invite</span>
                  </button>
                )}
              </div>
            </section>

            {/* How Rewards Are Calculated */}
            <section className="lg:col-span-5 rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">How Referral Rewards Work</h3>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="rounded-xl bg-[#071126] border border-blue-900/40 p-3 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <p className="font-semibold text-white">
                        Signup Bonus — {formatINR(settings.signup_bonus)} Virtual Credits
                      </p>
                      <p className="text-slate-400 mt-0.5">
                        Credited automatically once your friend installs the shared app and signs up
                        using your referral code.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#071126] border border-blue-900/40 p-3 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      <p className="font-semibold text-white">
                        Activity Reward — {settings.referral_percentage}% on Verified Deposits
                      </p>
                      <p className="text-slate-400 mt-0.5">
                        Applies automatically to completed &amp; verified deposits of{' '}
                        {formatINR(settings.minimum_qualifying_deposit)} or more. Pending, failed,
                        or reversed deposits do not qualify.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Live Commission Examples */}
                <div className="rounded-2xl bg-[#0A1630] border border-blue-900/50 p-3.5 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                    Deposit Reward Examples ({settings.referral_percentage}%)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {rewardExamples.map((ex) => (
                      <div
                        key={ex.deposit}
                        className="rounded-xl bg-[#071126] border border-blue-900/40 p-2.5 text-center"
                      >
                        <p className="text-[11px] text-slate-400 font-mono-num">
                          {formatINR(ex.deposit)}
                        </p>
                        <p className="text-xs font-extrabold text-emerald-400 font-mono-num mt-0.5">
                          +{formatINR(ex.reward)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-blue-950/50 border border-blue-800/40 px-3 py-2.5 flex items-center gap-2 text-[11px] text-slate-300">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Self-referrals and duplicate accounts are automatically blocked. One account can
                  only be referred once.
                </span>
              </div>
            </section>
          </div>

          {/* Recent Referral History Preview */}
          <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">Recent Referral Activity</h3>
                <p className="text-xs text-slate-400">
                  Latest invited friends, qualifying deposits, and credited rewards
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubView('history')}
                className="text-xs font-semibold text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                <span>Full History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {(data?.history || []).length === 0 ? (
              <div className="rounded-2xl bg-[#071126] border border-blue-900/40 p-6 text-center space-y-2">
                <Users className="w-7 h-7 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-200">No referrals yet</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Tap &ldquo;Share App Directly&rdquo; or copy your referral code to send the app to
                  friends and earn {formatINR(settings.signup_bonus)} per verified signup plus{' '}
                  {settings.referral_percentage}% on qualifying deposits.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {(data?.history || []).slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-[#071126] border border-blue-900/40 p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {item.referredUserName}
                        </span>
                        <span className="text-[11px] font-mono-num text-blue-300 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-md">
                          {item.referredUserId}
                        </span>
                        <span className="text-[11px] text-slate-400 capitalize">
                          {item.rewardType === 'signup'
                            ? 'Signup Bonus'
                            : item.rewardType === 'deposit'
                            ? `${item.rewardPercentage}% Deposit Reward`
                            : 'Invited Signup'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono-num">
                        Ref: {item.transactionReferenceId} · Joined{' '}
                        {formatDateTime(item.registrationDate)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {item.depositAmount > 0 && (
                          <p className="text-[11px] text-slate-400 font-mono-num">
                            Deposit: {formatINR(item.depositAmount)}
                          </p>
                        )}
                        <p
                          className={`text-sm font-extrabold font-mono-num ${
                            item.rewardStatus === 'Reversed'
                              ? 'text-rose-400 line-through'
                              : item.referralRewardAmount > 0
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.referralRewardAmount > 0
                            ? `+${formatINR(item.referralRewardAmount)}`
                            : formatINR(0)}
                        </p>
                      </div>
                      {renderStatusBadge(item.rewardStatus)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        /* DEDICATED REFERRAL HISTORY VIEW */
        <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Referral History</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete audit trail of invited friends, qualifying deposits, and referral rewards
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Pending', 'Qualified', 'Reward Credited', 'Reversed'] as StatusFilter[]).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#071126] text-slate-300 hover:bg-[#13264F]'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="rounded-xl bg-blue-950/40 border border-blue-800/40 px-3.5 py-2.5 flex items-center gap-2 text-[11px] text-blue-200/90">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              Privacy Protection: Referred users&apos; mobile numbers, email addresses, and bank/UPI
              details are never shared.
            </span>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl bg-[#071126] border border-blue-900/40 p-10 text-center space-y-2">
              <History className="w-7 h-7 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                No referral records match this filter
              </p>
              <p className="text-xs text-slate-400">
                Invite friends with your code <span className="font-mono-num text-amber-300">{referralCode}</span> to
                see their referral rewards here.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-blue-900/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#071126] text-slate-400 uppercase text-[11px]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Referred User</th>
                      <th className="px-4 py-3 font-semibold">Registration Date</th>
                      <th className="px-4 py-3 font-semibold">Deposit Amount</th>
                      <th className="px-4 py-3 font-semibold">Referral Reward</th>
                      <th className="px-4 py-3 font-semibold">Reward Status</th>
                      <th className="px-4 py-3 font-semibold">Transaction Reference ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-900/40 bg-[#0A1630]/60">
                    {filteredHistory.map((row) => (
                      <tr key={row.id} className="hover:bg-[#13264F]/40 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-white">{row.referredUserName}</p>
                          <p className="text-[11px] font-mono-num text-blue-300">
                            {row.referredUserId}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-mono-num text-slate-300 whitespace-nowrap">
                          {formatDateTime(row.registrationDate)}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-slate-200 whitespace-nowrap">
                          {row.depositAmount > 0 ? formatINR(row.depositAmount) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p
                            className={`font-bold font-mono-num ${
                              row.rewardStatus === 'Reversed'
                                ? 'text-rose-400 line-through'
                                : row.referralRewardAmount > 0
                                ? 'text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.referralRewardAmount > 0
                              ? `+${formatINR(row.referralRewardAmount)}`
                              : formatINR(0)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {row.rewardType === 'signup'
                              ? 'Signup Bonus'
                              : row.rewardType === 'deposit'
                              ? `${row.rewardPercentage}% Activity`
                              : 'Referral Invite'}
                          </p>
                        </td>
                        <td className="px-4 py-3">{renderStatusBadge(row.rewardStatus)}</td>
                        <td className="px-4 py-3 font-mono-num text-[11px] text-slate-300">
                          {row.transactionReferenceId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Responsive Cards */}
              <div className="md:hidden space-y-2.5">
                {filteredHistory.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl bg-[#071126] border border-blue-900/50 p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-white">{row.referredUserName}</p>
                        <p className="text-[11px] font-mono-num text-blue-300">
                          {row.referredUserId}
                        </p>
                      </div>
                      {renderStatusBadge(row.rewardStatus)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-blue-900/40">
                      <div>
                        <p className="text-[10px] text-slate-400">Registration Date</p>
                        <p className="font-mono-num text-slate-200 mt-0.5">
                          {formatDateTime(row.registrationDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Deposit Amount</p>
                        <p className="font-mono-num text-slate-200 mt-0.5">
                          {row.depositAmount > 0 ? formatINR(row.depositAmount) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Referral Reward</p>
                        <p
                          className={`font-bold font-mono-num mt-0.5 ${
                            row.rewardStatus === 'Reversed'
                              ? 'text-rose-400 line-through'
                              : row.referralRewardAmount > 0
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.referralRewardAmount > 0
                            ? `+${formatINR(row.referralRewardAmount)}`
                            : formatINR(0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Transaction Ref ID</p>
                        <p className="font-mono-num text-slate-300 text-[11px] truncate mt-0.5">
                          {row.transactionReferenceId}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
};
