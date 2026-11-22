import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  MessageSquarePlus,
  Scale,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { formatDateTime, formatINR } from '../lib/api';
import type { ReviewItem, ReviewScheduleMeta } from '../types';

interface FeedEvent {
  id: string;
  kind: 'withdrawal' | 'deposit';
  maskedMobile: string;
  city: string;
  amount: number;
  bonusAmount?: number;
  method: string;
  timeLabel: string;
}

const MASKED_PREFIXES = ['98', '97', '99', '96', '91', '88', '84', '70', '93', '95'];
const CITIES = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Pune',
  'Ahmedabad',
  'Jaipur',
  'Hyderabad',
  'Surat',
  'Lucknow',
  'Indore',
];
const WITHDRAW_METHODS = ['UPI Instant', 'IMPS Bank', 'NEFT Bank', 'HDFC UPI'];
const DEPOSIT_METHODS = ['PhonePe UPI', 'Google Pay', 'Paytm UPI', 'UPI QR Scan'];
const DEPOSIT_AMOUNTS = [
  { amount: 300, bonus: 210 },
  { amount: 500, bonus: 325 },
  { amount: 1000, bonus: 600 },
  { amount: 2000, bonus: 1100 },
  { amount: 3000, bonus: 1500 },
  { amount: 5000, bonus: 2250 },
  { amount: 10000, bonus: 4000 },
];

function randomMaskedMobile(): string {
  const prefix = MASKED_PREFIXES[Math.floor(Math.random() * MASKED_PREFIXES.length)];
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `+91 ${prefix}****${suffix}`;
}

function generateFeedEvent(index: number): FeedEvent {
  const isWithdrawal = index % 2 === 0;
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];

  if (isWithdrawal) {
    // Strictly minimum ₹5,000 up to ₹45,000 in clean ₹250 increments
    const steps = Math.floor(Math.random() * 160);
    const amount = 5000 + steps * 250;
    return {
      id: `evt-w-${Date.now()}-${index}`,
      kind: 'withdrawal',
      maskedMobile: randomMaskedMobile(),
      city,
      amount,
      method: WITHDRAW_METHODS[Math.floor(Math.random() * WITHDRAW_METHODS.length)],
      timeLabel: 'Just now',
    };
  }

  const tier = DEPOSIT_AMOUNTS[Math.floor(Math.random() * DEPOSIT_AMOUNTS.length)];
  return {
    id: `evt-d-${Date.now()}-${index}`,
    kind: 'deposit',
    maskedMobile: randomMaskedMobile(),
    city,
    amount: tier.amount,
    bonusAmount: tier.bonus,
    method: DEPOSIT_METHODS[Math.floor(Math.random() * DEPOSIT_METHODS.length)],
    timeLabel: 'Just now',
  };
}

export const LiveActivityBanner: React.FC = () => {
  const [counter, setCounter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<FeedEvent>(() => generateFeedEvent(0));

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setCounter((prev) => {
        const next = prev + 1;
        setCurrentEvent(generateFeedEvent(next));
        return next;
      });
    }, 3200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const isWithdraw = currentEvent.kind === 'withdrawal';

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="rounded-2xl bg-gradient-to-r from-[#0F244D] via-[#0D1E42] to-[#132959] border border-blue-500/35 px-3.5 py-2.5 shadow-lg shadow-blue-950/40"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold text-emerald-300 truncate">
            Live Payout & Deposit Feed
          </span>
          <span className="text-slate-400 hidden sm:inline">
            · Min Payout ₹5,000+
          </span>
        </div>
        <span className="font-mono-num text-blue-300 shrink-0">
          #{counter + 1} · {currentEvent.timeLabel}
        </span>
      </div>

      <div className="relative min-h-[44px] flex items-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentEvent.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  isWithdraw
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                }`}
              >
                {isWithdraw ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownLeft className="w-4 h-4" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-white truncate">
                  <span className="font-mono-num text-blue-200">{currentEvent.maskedMobile}</span>{' '}
                  <span className="text-slate-400 font-normal">({currentEvent.city})</span>{' '}
                  {isWithdraw ? (
                    <span className="text-emerald-300">
                      withdrew <strong className="font-mono-num">{formatINR(currentEvent.amount)}</strong>
                    </span>
                  ) : (
                    <span className="text-amber-300">
                      added <strong className="font-mono-num">{formatINR(currentEvent.amount)}</strong>
                      {currentEvent.bonusAmount ? ` (+${formatINR(currentEvent.bonusAmount)} Bonus)` : ''}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  via {currentEvent.method} · {isWithdraw ? 'Payout Completed' : 'Payment Credited'}
                </p>
              </div>
            </div>

            <span
              className={`text-[11px] font-bold font-mono-num shrink-0 ${
                isWithdraw ? 'text-emerald-300' : 'text-blue-300'
              }`}
            >
              {isWithdraw ? 'PAID' : 'ADDED'}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FRONT PAGE REVIEWS & TRUST PANEL
// ---------------------------------------------------------------------------
export const FrontReviewsAndTrustPanel: React.FC<{
  userReviews: ReviewItem[];
  reviewSchedule: ReviewScheduleMeta | null;
  onOpenWriteReview: () => void;
  onOpenLegal: () => void;
}> = ({ userReviews, onOpenWriteReview, onOpenLegal }) => {
  const [showAll, setShowAll] = useState(false);

  const averageRating = useMemo(() => {
    if (userReviews.length === 0) return '—';
    const avg =
      userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length;
    return avg.toFixed(1);
  }, [userReviews]);

  const displayedReviews = showAll ? userReviews.slice(0, 9) : userReviews.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Legal & Genuine Security Trust Panel */}
      <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Licensed Standards & Verified Security</span>
            </h2>
            <p className="text-xs text-slate-400">
              Audited ledger integrity · KYC/AML identity protection · UTR-verified UPI credits
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLegal}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#13264F] hover:bg-[#1B356D] border border-blue-700/50 text-xs font-semibold text-blue-200 flex items-center gap-1.5"
          >
            <Scale className="w-3.5 h-3.5 text-amber-300" />
            <span>Legal Charter</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[#12244A] border border-blue-800/40 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300">KYC & AML</span>
            </div>
            <p className="text-sm font-bold text-white">RBI-Aligned Payout Rules</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              PAN/Aadhaar KYC verification & state-law compliance enforced before bank or UPI payouts.
            </p>
          </div>

          <div className="rounded-2xl bg-[#12244A] border border-blue-800/40 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
              <span className="text-[11px] font-bold text-amber-300 font-mono-num">
                {averageRating} / 5.0 Rated
              </span>
            </div>
            <p className="text-sm font-bold text-white">Trusted Player Community</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Transparent 50%–60% server RNG win ratios and full Transaction ID receipts on every round.
            </p>
          </div>

          <div className="rounded-2xl bg-[#12244A] border border-blue-800/40 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <Lock className="w-6 h-6 text-blue-400" />
              <span className="text-[11px] font-bold text-blue-300">256-Bit SSL</span>
            </div>
            <p className="text-sm font-bold text-white">Verified UTR & Ledger Audit</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every PhonePe, GPay, and QR deposit is verified against your UTR with zero deposit traps.
            </p>
          </div>
        </div>
      </section>

      {/* Minimal Player Reviews Panel */}
      <section className="rounded-3xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-400/35 flex flex-col items-center justify-center shrink-0">
              <span className="text-sm font-extrabold text-amber-300 font-mono-num leading-none">
                {averageRating}
              </span>
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 mt-0.5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Player Reviews</h2>
              <p className="text-xs text-slate-400">Community feedback</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {userReviews.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#13264F] hover:bg-[#1B356D] border border-blue-800/60 text-xs font-semibold text-blue-200 whitespace-nowrap"
              >
                {showAll ? 'Show Less' : 'View All'}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenWriteReview}
              className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-blue-600/25 whitespace-nowrap"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Rate App</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {displayedReviews.map((rev) => (
            <article
              key={rev.id}
              className="rounded-2xl bg-[#112246] border border-blue-800/40 p-4 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                      {rev.userName
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{rev.userName}</p>
                      {rev.city && (
                        <p className="text-[11px] text-slate-400 truncate">{rev.city}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${
                          i < rev.rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed">{rev.comment}</p>
              </div>

              <div className="pt-1.5 border-t border-blue-900/40 flex items-center justify-end text-[11px] text-slate-400 font-mono-num">
                <span>{formatDateTime(rev.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
