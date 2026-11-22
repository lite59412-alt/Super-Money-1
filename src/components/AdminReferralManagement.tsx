import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Gift,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  adminGetReferralsOverviewFirestore,
  adminReverseReferralRewardFirestore,
  adminSaveReferralSettingsFirestore,
  formatDateTime,
  formatINR,
} from '../lib/api';
import type {
  AdminReferralOverviewData,
  AdminReferralRewardView,
  ReferralStatus,
} from '../types';

interface AdminReferralManagementProps {
  onActionSuccess: (msg: string) => void;
  onActionError: (msg: string) => void;
  onParentRefresh?: () => void;
}

export const AdminReferralManagement: React.FC<AdminReferralManagementProps> = ({
  onActionSuccess,
  onActionError,
  onParentRefresh,
}) => {
  const [data, setData] = useState<AdminReferralOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'rewards' | 'relationships'>('rewards');

  // Configurable referral promotion settings
  const [promoEnabled, setPromoEnabled] = useState(true);
  const [signupBonus, setSignupBonus] = useState('50');
  const [referralPercentage, setReferralPercentage] = useState('10');
  const [minQualifyingDeposit, setMinQualifyingDeposit] = useState('100');
  const [savingSettings, setSavingSettings] = useState(false);

  // Reversal confirmation state (no window.confirm)
  const [reversingReward, setReversingReward] = useState<AdminReferralRewardView | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversingBusy, setReversingBusy] = useState(false);

  const loadData = useCallback(
    async (query = '', silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await adminGetReferralsOverviewFirestore(query.trim());
        setData(res);
        setPromoEnabled(res.settings.promotion_enabled);
        setSignupBonus(String(res.settings.signup_bonus));
        setReferralPercentage(String(res.settings.referral_percentage));
        setMinQualifyingDeposit(String(res.settings.minimum_qualifying_deposit));
      } catch (err) {
        onActionError(err instanceof Error ? err.message : 'Unable to load referral data.');
      } finally {
        setLoading(false);
      }
    },
    [onActionError]
  );

  useEffect(() => {
    loadData('', false);
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(searchQuery, true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSignup = Number(signupBonus);
    const parsedPct = Number(referralPercentage);
    const parsedMinDep = Number(minQualifyingDeposit);

    if (!Number.isFinite(parsedSignup) || parsedSignup < 0 || parsedSignup > 10000) {
      onActionError('Signup bonus must be between ₹0 and ₹10,000.');
      return;
    }
    if (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 50) {
      onActionError('Referral percentage must be between 0% and 50%.');
      return;
    }
    if (!Number.isFinite(parsedMinDep) || parsedMinDep < 1 || parsedMinDep > 100000) {
      onActionError('Minimum qualifying deposit must be between ₹1 and ₹1,00,000.');
      return;
    }

    setSavingSettings(true);
    try {
      const res = await adminSaveReferralSettingsFirestore({
        promotion_enabled: promoEnabled,
        signup_bonus: parsedSignup,
        referral_percentage: parsedPct,
        minimum_qualifying_deposit: parsedMinDep,
      });
      setData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      onActionSuccess(res.message);
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to save referral settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleConfirmReverse = async () => {
    if (!reversingReward) return;
    if (reversalReason.trim().length < 4) {
      onActionError('Enter a clear reversal reason (at least 4 characters).');
      return;
    }
    setReversingBusy(true);
    try {
      const res = await adminReverseReferralRewardFirestore(
        reversingReward.id,
        reversalReason.trim()
      );
      setReversingReward(null);
      setReversalReason('');
      onActionSuccess(res.message);
      await loadData(searchQuery, true);
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to reverse referral reward.');
    } finally {
      setReversingBusy(false);
    }
  };

  const renderStatusPill = (status: ReferralStatus) => {
    if (status === 'Reward Credited') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[11px] font-semibold whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3" />
          Reward Credited
        </span>
      );
    }
    if (status === 'Qualified') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/15 border border-blue-500/35 text-blue-300 text-[11px] font-semibold whitespace-nowrap">
          <UserCheck className="w-3 h-3" />
          Qualified
        </span>
      );
    }
    if (status === 'Reversed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/35 text-rose-300 text-[11px] font-semibold whitespace-nowrap">
          <XCircle className="w-3 h-3" />
          Reversed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-semibold whitespace-nowrap">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  };

  const previewPct = Math.max(0, Number(referralPercentage) || 0);
  const previewExampleReward = Math.round(((500 * previewPct) / 100) * 100) / 100;

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-10 text-center text-sm text-slate-400">
        Loading Referral Management...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-400" />
            <span>Referral Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor referral activity, configure signup &amp; deposit reward rules, and audit
            reward payouts
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData(searchQuery, true)}
          className="min-h-[38px] px-3.5 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* 4 Admin Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Referrals</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono-num mt-1.5">
            {data?.stats.totalReferrals ?? 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">All linked invite pairs</p>
        </div>

        <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Successful Referrals</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono-num mt-1.5">
            {data?.stats.successfulReferrals ?? 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Qualified or Reward Credited
          </p>
        </div>

        <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pending Referrals</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300 font-mono-num mt-1.5">
            {data?.stats.pendingReferrals ?? 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Reversed: {data?.stats.reversedReferrals ?? 0}
          </p>
        </div>

        <div className="rounded-2xl bg-[#0D1B38] border border-emerald-500/25 p-4">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Total Referral Rewards</span>
            <Gift className="w-4 h-4 text-amber-300" />
          </div>
          <p className="text-2xl font-bold text-amber-300 font-mono-num mt-1.5">
            {formatINR(data?.stats.totalReferralRewards ?? 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono-num">
            Signup {formatINR(data?.stats.totalSignupRewards ?? 0)} · Deposit{' '}
            {formatINR(data?.stats.totalDepositRewards ?? 0)}
          </p>
        </div>
      </div>

      {/* Promotion Configuration Form */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Referral Promotion Settings</h3>
              <p className="text-xs text-slate-400">
                All reward calculations execute automatically on the backend using these rules
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPromoEnabled((v) => !v)}
            className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition-colors ${
              promoEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                promoEnabled ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <span>{promoEnabled ? 'Promotions Enabled' : 'Promotions Disabled'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Signup Bonus (₹ Virtual Credits)
            </label>
            <input
              type="number"
              min={0}
              max={10000}
              step="1"
              value={signupBonus}
              onChange={(e) => setSignupBonus(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-400"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">Default: ₹50 per verified signup</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Referral Percentage (%)
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step="0.5"
              value={referralPercentage}
              onChange={(e) => setReferralPercentage(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-400"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Example: ₹500 deposit → {formatINR(previewExampleReward)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Min Qualifying Virtual Deposit (₹)
            </label>
            <input
              type="number"
              min={1}
              max={100000}
              step="1"
              value={minQualifyingDeposit}
              onChange={(e) => setMinQualifyingDeposit(e.target.value)}
              className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-400"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">Default: ₹100 verified deposit</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-slate-400">
            Last updated:{' '}
            <span className="font-mono-num text-slate-300">
              {data?.settings.updated_at ? formatDateTime(data.settings.updated_at) : 'Default'}
            </span>
          </p>
          <button
            type="submit"
            disabled={savingSettings}
            className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{savingSettings ? 'Saving Settings...' : 'Save Referral Settings'}</span>
          </button>
        </div>
      </form>

      {/* Search & Records Explorer */}
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-[#071126] border border-blue-900/60 self-start">
            <button
              type="button"
              onClick={() => setActiveSubTab('rewards')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'rewards'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Reward Transactions ({data?.rewards.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('relationships')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'relationships'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Referral Links ({data?.relationships.length ?? 0})
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 md:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by User ID, Referral Code, or Ref ID..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#071126] border border-blue-800/70 text-xs text-white focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shrink-0"
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  loadData('', true);
                }}
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 shrink-0"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {activeSubTab === 'rewards' ? (
          (data?.rewards || []).length === 0 ? (
            <div className="rounded-xl bg-[#071126] border border-blue-900/40 p-8 text-center text-xs text-slate-400">
              No referral reward transactions found.
            </div>
          ) : (
            <div className="space-y-2.5">
              {(data?.rewards || []).map((rw) => (
                <div
                  key={rw.id}
                  className="rounded-2xl bg-[#071126] border border-blue-900/50 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {rw.referrer_name}{' '}
                        <span className="font-mono-num text-blue-300">({rw.referrer_user_id})</span>
                      </span>
                      <span className="text-[11px] text-slate-400">invited</span>
                      <span className="text-xs font-bold text-slate-100">
                        {rw.referred_name}{' '}
                        <span className="font-mono-num text-slate-300">
                          ({rw.referred_user_id})
                        </span>
                      </span>
                      {rw.referral_code && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono-num font-bold">
                          {rw.referral_code}
                        </span>
                      )}
                      {renderStatusPill(rw.reward_status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span className="font-mono-num">
                        Ref: <strong className="text-slate-200">{rw.qualifying_transaction_id}</strong>
                      </span>
                      <span>
                        Calculation:{' '}
                        <strong className="text-blue-200 font-mono-num">
                          {rw.reward_type === 'deposit'
                            ? `${formatINR(rw.qualifying_amount)} × ${rw.reward_percentage}% = ${formatINR(rw.reward_amount)}`
                            : `Signup Bonus = ${formatINR(rw.reward_amount)}`}
                        </strong>
                      </span>
                      <span className="font-mono-num">{formatDateTime(rw.created_at)}</span>
                    </div>

                    {rw.reversal_reason && (
                      <p className="text-[11px] text-rose-300">
                        Reversed: {rw.reversal_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase">Reward</p>
                      <p
                        className={`text-sm font-extrabold font-mono-num ${
                          rw.reward_status === 'Reversed'
                            ? 'text-rose-400 line-through'
                            : 'text-emerald-400'
                        }`}
                      >
                        +{formatINR(rw.reward_amount)}
                      </p>
                    </div>

                    {rw.reward_status === 'Reward Credited' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReversingReward(rw);
                          setReversalReason('');
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reverse</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (data?.relationships || []).length === 0 ? (
          <div className="rounded-xl bg-[#071126] border border-blue-900/40 p-8 text-center text-xs text-slate-400">
            No referral relationships found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {(data?.relationships || []).map((rel) => (
              <div
                key={rel.id}
                className="rounded-2xl bg-[#071126] border border-blue-900/50 p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {rel.referrer_name}{' '}
                      <span className="font-mono-num text-blue-300">({rel.referrer_user_id})</span>
                    </span>
                    <span className="text-[11px] text-slate-400">→</span>
                    <span className="text-xs font-bold text-slate-100">
                      {rel.referred_name}{' '}
                      <span className="font-mono-num text-slate-300">({rel.referred_user_id})</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono-num font-bold">
                      {rel.referral_code}
                    </span>
                    {renderStatusPill(rel.status)}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono-num">
                    ID: {rel.id} · Registered {formatDateTime(rel.registration_date)}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-right text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400">Qualifying Deposits</p>
                    <p className="font-bold text-white font-mono-num">
                      {formatINR(rel.total_qualifying_deposits)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Total Rewards Paid</p>
                    <p className="font-bold text-emerald-400 font-mono-num">
                      {formatINR(rel.total_rewards_earned)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Modal for Reversing a Referral Reward */}
      {reversingReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0D1B38] border border-rose-500/40 p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-300">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Reverse Referral Reward</h3>
            </div>
            <p className="text-xs text-slate-300">
              Reversing <span className="font-mono-num text-white">{reversingReward.id}</span> will
              deduct{' '}
              <strong className="text-rose-300 font-mono-num">
                {formatINR(reversingReward.reward_amount)}
              </strong>{' '}
              from{' '}
              <strong className="text-white">
                {reversingReward.referrer_name} ({reversingReward.referrer_user_id})
              </strong>
              &apos;s bonus wallet and log an admin audit entry.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Reversal Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Qualifying deposit was reversed / chargeback detected"
                className="w-full p-3 rounded-xl bg-[#071126] border border-blue-800/70 text-xs text-white focus:outline-none focus:border-rose-400 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={reversingBusy || reversalReason.trim().length < 4}
                onClick={handleConfirmReverse}
                className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-45 text-white text-xs font-bold transition-colors"
              >
                {reversingBusy ? 'Reversing...' : 'Confirm Reversal'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReversingReward(null);
                  setReversalReason('');
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
