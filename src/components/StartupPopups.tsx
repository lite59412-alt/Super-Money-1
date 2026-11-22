import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  Gift,
  Info,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { formatINR } from '../lib/api';
import type { AppAnnouncementConfig, AppAnnouncementTone, DepositBonusOfferMeta } from '../types';

const DEFAULT_LADDER = [
  2, 4, 6, 10, 15, 20, 25, 32, 40, 50,
  58, 66, 75, 85, 95, 105, 115, 125, 135, 150,
  165, 180, 195, 210, 225, 240, 255, 270, 285, 300,
];

interface DailyBonusPopupProps {
  dailyStreak: number;
  canCheckInToday: boolean;
  ladder: number[];
  onClaim: () => Promise<boolean>;
  onClose: () => void;
}

export const DailyBonusPopup: React.FC<DailyBonusPopupProps> = ({
  dailyStreak,
  canCheckInToday,
  ladder,
  onClaim,
  onClose,
}) => {
  const [claiming, setClaiming] = useState(false);
  const [justClaimedAmt, setJustClaimedAmt] = useState<number | null>(null);

  const days = ladder.length === 30 ? ladder : DEFAULT_LADDER;
  const completedInCycle = dailyStreak % 30;
  const nextDayIndex = canCheckInToday ? completedInCycle : Math.max(0, completedInCycle - 1);
  const nextDayNumber = nextDayIndex + 1;
  const todayReward = days[nextDayIndex] ?? 2;

  const handleCollect = async () => {
    if (!canCheckInToday || claiming) return;
    setClaiming(true);
    try {
      const ok = await onClaim();
      if (ok) {
        setJustClaimedAmt(todayReward);
        window.setTimeout(() => {
          onClose();
        }, 900);
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3.5">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-gradient-to-b from-[#13295A] via-[#0C1B3B] to-[#081229] border border-amber-400/35 shadow-[0_24px_60px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-blue-800/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                30-Day Daily Bonus
              </h2>
              <p className="text-xs text-amber-200/90">
                Day 1 ₹2 · Day 10 ₹50 · Day 30 ₹300
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily bonus popup"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Highlight Banner */}
        <div className="px-5 pt-3.5">
          <div className="rounded-2xl bg-gradient-to-r from-amber-500/18 via-orange-500/12 to-emerald-500/15 border border-amber-400/35 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                {canCheckInToday ? `Today's Reward · Day ${nextDayNumber}` : `Streak Active · Day ${dailyStreak}`}
              </p>
              <p className="text-2xl font-black text-white font-mono-num">
                +{formatINR(todayReward)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-300">Day 30 Grand</p>
              <p className="text-base font-extrabold text-emerald-400 font-mono-num">₹300</p>
            </div>
          </div>
        </div>

        {/* 30-Day Scrollable Calendar Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          <div className="grid grid-cols-5 gap-2">
            {days.map((amt, idx) => {
              const dayNum = idx + 1;
              const isClaimed = idx < completedInCycle;
              const isToday = canCheckInToday && idx === completedInCycle;
              const isMilestone = dayNum === 10 || dayNum === 20 || dayNum === 30;

              return (
                <div
                  key={dayNum}
                  className={`relative rounded-xl p-2 text-center border transition-all ${
                    isToday
                      ? 'bg-gradient-to-b from-amber-400/30 to-orange-600/25 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.35)] scale-[1.03]'
                      : isClaimed
                      ? 'bg-emerald-500/15 border-emerald-500/40'
                      : isMilestone
                      ? 'bg-indigo-900/50 border-amber-400/45'
                      : 'bg-[#0D1E42]/90 border-blue-900/50'
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold ${
                      isToday
                        ? 'text-amber-200'
                        : isClaimed
                        ? 'text-emerald-300'
                        : isMilestone
                        ? 'text-amber-300'
                        : 'text-slate-400'
                    }`}
                  >
                    Day {dayNum}
                  </p>
                  <p
                    className={`text-xs font-extrabold font-mono-num mt-0.5 ${
                      isToday
                        ? 'text-white'
                        : isClaimed
                        ? 'text-emerald-300'
                        : isMilestone
                        ? 'text-amber-200'
                        : 'text-slate-200'
                    }`}
                  >
                    ₹{amt}
                  </p>
                  {isClaimed && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-5 py-4 border-t border-blue-900/50 bg-[#081229]/90 space-y-2">
          {justClaimedAmt !== null ? (
            <div className="w-full min-h-[48px] rounded-2xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              <span>Collected +{formatINR(justClaimedAmt)} Daily Bonus!</span>
            </div>
          ) : canCheckInToday ? (
            <button
              type="button"
              disabled={claiming}
              onClick={handleCollect}
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 hover:brightness-105 active:scale-[0.98] disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition"
            >
              <Gift className="w-4 h-4" />
              <span>
                {claiming ? 'Collecting...' : `Collect Day ${nextDayNumber} Bonus (${formatINR(todayReward)})`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[46px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm"
            >
              Today&apos;s Bonus Collected — Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface DepositBonusPopupProps {
  offers: DepositBonusOfferMeta | null;
  onGoToDeposit: () => void;
  onClose: () => void;
}

export const DepositBonusPopup: React.FC<DepositBonusPopupProps> = ({
  offers,
  onGoToDeposit,
  onClose,
}) => {
  const isFirst = offers?.isFirstOfferAvailable ?? true;
  const tiers = isFirst
    ? offers?.firstDepositTiers || []
    : offers?.reloadTiers || [];

  const featuredTiers = tiers.length > 0
    ? [tiers[0], tiers[2], tiers[3], tiers[4], tiers[7], tiers[9]].filter(Boolean)
    : [
        { amount: 100, bonusPercent: 40, bonusAmount: 40, totalValue: 140, totalPercentLabel: '+140%' },
        { amount: 300, bonusPercent: 40, bonusAmount: 120, totalValue: 420, totalPercentLabel: '+140%' },
        { amount: 500, bonusPercent: 65, bonusAmount: 325, totalValue: 825, totalPercentLabel: '+165%' },
        { amount: 1000, bonusPercent: 60, bonusAmount: 600, totalValue: 1600, totalPercentLabel: '+160%' },
        { amount: 5000, bonusPercent: 45, bonusAmount: 2250, totalValue: 7250, totalPercentLabel: '+145%' },
        { amount: 20000, bonusPercent: 35, bonusAmount: 7000, totalValue: 27000, totalPercentLabel: '+135%' },
      ];

  const maxPct = Math.max(...featuredTiers.map((t) => t.bonusPercent), 40);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3.5">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-gradient-to-b from-[#132E6B] via-[#0B1C42] to-[#07122B] border border-sky-400/35 shadow-[0_24px_60px_rgba(7,17,38,0.92)] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 bg-gradient-to-r from-blue-600/20 via-sky-500/10 to-transparent border-b border-blue-700/45 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 text-slate-950 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                {isFirst ? 'First Deposit Bonus Tiers' : 'Deposit Reload Bonus'}
              </h2>
              <p className="text-xs text-sky-300 font-semibold">
                Up to +{maxPct}% Extra Bonus on UPI Deposit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close deposit bonus popup"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/20 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tier Offer Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <p className="text-xs text-blue-100/80 leading-relaxed">
            Add money via PhonePe, GPay, Paytm, or UPI QR and receive instant tiered bonus credits once verified:
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {featuredTiers.map((tier) => (
              <div
                key={tier.amount}
                className="rounded-2xl bg-gradient-to-b from-[#102657] to-[#0A1838] border border-blue-500/35 hover:border-sky-400/60 p-3 flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] text-blue-200/75 font-medium">Deposit</span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/25 border border-sky-400/35 text-sky-200 text-[10px] font-extrabold font-mono-num">
                    {tier.totalPercentLabel}
                  </span>
                </div>
                <p className="text-lg font-black text-white font-mono-num mt-1">
                  {formatINR(tier.amount)}
                </p>
                <div className="mt-2 pt-1.5 border-t border-blue-800/60 flex items-center justify-between text-[11px] font-mono-num">
                  <span className="text-sky-300 font-bold">+{formatINR(tier.bonusAmount)}</span>
                  <span className="text-blue-100/85">Total {formatINR(tier.totalValue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-5 py-4 border-t border-blue-800/50 bg-[#07122B]/95 space-y-2">
          <button
            type="button"
            onClick={onGoToDeposit}
            className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:brightness-110 active:scale-[0.98] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition"
          >
            <Wallet className="w-4 h-4" />
            <span>Add Money &amp; Claim Bonus</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] rounded-xl text-xs font-semibold text-blue-200/70 hover:text-white transition"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

interface AppAnnouncementPopupProps {
  announcement: AppAnnouncementConfig;
  onClose: () => void;
}

const ANNOUNCEMENT_TONE_STYLES: Record<
  AppAnnouncementTone,
  {
    border: string;
    headerBg: string;
    iconBg: string;
    badge: string;
    btn: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  info: {
    border: 'border-sky-400/45',
    headerBg: 'from-blue-600/25 via-sky-500/10 to-transparent',
    iconBg: 'from-blue-500 to-sky-400 text-slate-950 shadow-sky-500/30',
    badge: 'bg-sky-500/20 border-sky-400/35 text-sky-200',
    btn: 'from-blue-600 via-blue-500 to-sky-500 text-white shadow-blue-600/30',
    Icon: Info,
  },
  offer: {
    border: 'border-amber-400/45',
    headerBg: 'from-amber-500/25 via-orange-500/10 to-transparent',
    iconBg: 'from-amber-400 to-orange-500 text-slate-950 shadow-amber-500/30',
    badge: 'bg-amber-500/20 border-amber-400/35 text-amber-200',
    btn: 'from-amber-400 via-yellow-400 to-orange-500 text-slate-950 shadow-amber-500/30',
    Icon: Gift,
  },
  success: {
    border: 'border-emerald-400/45',
    headerBg: 'from-emerald-500/25 via-teal-500/10 to-transparent',
    iconBg: 'from-emerald-400 to-teal-500 text-slate-950 shadow-emerald-500/30',
    badge: 'bg-emerald-500/20 border-emerald-400/35 text-emerald-200',
    btn: 'from-emerald-500 to-teal-500 text-slate-950 shadow-emerald-500/30',
    Icon: CheckCircle2,
  },
  alert: {
    border: 'border-rose-400/50',
    headerBg: 'from-rose-600/25 via-orange-500/10 to-transparent',
    iconBg: 'from-rose-500 to-orange-500 text-white shadow-rose-500/30',
    badge: 'bg-rose-500/20 border-rose-400/35 text-rose-200',
    btn: 'from-rose-600 to-orange-500 text-white shadow-rose-600/30',
    Icon: AlertTriangle,
  },
};

export const AppAnnouncementPopup: React.FC<AppAnnouncementPopupProps> = ({
  announcement,
  onClose,
}) => {
  const toneStyle = ANNOUNCEMENT_TONE_STYLES[announcement.tone] || ANNOUNCEMENT_TONE_STYLES.info;
  const ToneIcon = toneStyle.Icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3.5">
      <div
        className={`w-full max-w-md max-h-[88vh] flex flex-col rounded-3xl bg-gradient-to-b from-[#13295A] via-[#0C1B3B] to-[#081229] border ${toneStyle.border} shadow-[0_24px_60px_rgba(0,0,0,0.9)] overflow-hidden`}
      >
        {/* Header */}
        <div
          className={`px-5 pt-4 pb-3.5 bg-gradient-to-r ${toneStyle.headerBg} border-b border-blue-800/50 flex items-start justify-between gap-3`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${toneStyle.iconBg} flex items-center justify-center shadow-lg shrink-0 mt-0.5`}
            >
              <ToneIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-wider ${toneStyle.badge}`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                Official Notice
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-white mt-1 break-words leading-snug">
                {announcement.title || 'Important Information'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close notice popup"
            className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plain-text Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="rounded-2xl bg-[#071126]/80 border border-blue-900/60 p-4">
            <p className="text-sm text-blue-50/95 whitespace-pre-line leading-relaxed break-words">
              {announcement.message}
            </p>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-5 py-4 border-t border-blue-900/50 bg-[#081229]/95">
          <button
            type="button"
            onClick={onClose}
            className={`w-full min-h-[48px] rounded-2xl bg-gradient-to-r ${toneStyle.btn} hover:brightness-110 active:scale-[0.98] font-extrabold text-sm flex items-center justify-center shadow-lg transition`}
          >
            {announcement.buttonLabel || 'Got It'}
          </button>
        </div>
      </div>
    </div>
  );
};
