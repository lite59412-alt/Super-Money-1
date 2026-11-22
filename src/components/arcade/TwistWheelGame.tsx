import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Menu, Play, Square, X } from 'lucide-react';
import { WalletSummary } from '../../types';
import { formatINR } from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import { ArcadeShell, arcadePayout, arcadeWager } from './ArcadeShell';

interface TwistWheelGameProps {
  gameId: string;
  gameName: string;
  wallet: WalletSummary;
  onlinePlayers: number;
  winRatio: number;
  onBack: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onWalletUpdated: (w: WalletSummary) => void;
}

type RingKey = 'fire' | 'leaf' | 'water';
type SpinOutcome = 'fire' | 'leaf' | 'water' | 'skull';

interface RingConfig {
  key: RingKey;
  name: string;
  radius: number;
  strokeWidth: number;
  arcColorStart: string;
  arcColorEnd: string;
  glowColor: string;
  segments: string[];
  mults: number[]; // index 0 = uncharged (0), index 1..N = cumulative ring multiplier
}

// Exact rings, multipliers, and segment labels from Twist reference
const RINGS: RingConfig[] = [
  {
    key: 'fire',
    name: 'Fire Ring',
    radius: 138,
    strokeWidth: 27,
    arcColorStart: '#f43fd6',
    arcColorEnd: '#d946ef',
    glowColor: 'rgba(244, 63, 214, 0.65)',
    segments: ['3.9X', '12.5X', '28X', '52X', '85X', '133X', '200X', 'BONUS'],
    mults: [0, 3.9, 12.5, 28, 52, 85, 133, 200, 300],
  },
  {
    key: 'leaf',
    name: 'Clover Ring',
    radius: 106,
    strokeWidth: 26,
    arcColorStart: '#22c55e',
    arcColorEnd: '#4ade80',
    glowColor: 'rgba(34, 197, 94, 0.65)',
    segments: ['2.5X', '7.7X', '16X', '27.5X', '44X', '+20.5X'],
    mults: [0, 2.5, 7.7, 16, 27.5, 44, 64.5],
  },
  {
    key: 'water',
    name: 'Water Ring',
    radius: 75,
    strokeWidth: 25,
    arcColorStart: '#38bdf8',
    arcColorEnd: '#0ea5e9',
    glowColor: 'rgba(56, 189, 248, 0.7)',
    segments: ['1.55X', '4.85X', '10X', '+7X'],
    mults: [0, 1.55, 4.85, 10, 17],
  },
];

const RING_MAP: Record<RingKey, RingConfig> = {
  fire: RINGS[0],
  leaf: RINGS[1],
  water: RINGS[2],
};

const BET_LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000];
const OUTCOME_POOL: SpinOutcome[] = ['water', 'leaf', 'fire', 'skull'];

// Crisp vector icons matching the Twist screenshot emblems
const FireEmblem: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path
      d="M16.8 3.5C17.2 8.2 13.4 10.6 12.2 13.6C11.4 15.6 12 17.8 13.4 19.1C12.7 17.4 13.4 15.5 14.8 14.3C14.7 16.9 17.3 18 17.6 20.8C17.8 22.8 16.5 24.7 14.7 25.4C18.9 25.6 23.4 22.6 23.8 17.3C24.2 12.2 20.5 7.4 16.8 3.5Z"
      fill="url(#fireGradOuter)"
    />
    <path
      d="M12.2 13.6C9.5 15.2 8.1 18.2 8.6 21.1C9.2 24.4 12.1 26.8 15.6 27C12.8 25.9 11.4 23.2 12.1 20.4C12.5 18.9 13.6 17.6 14.5 16.5C13.1 15.9 12.4 14.8 12.2 13.6Z"
      fill="url(#fireGradInner)"
    />
    <path
      d="M16.1 18.5C14.8 20.2 14.4 22.1 15.3 23.8C16.2 25.4 18.6 25.3 19.6 23.6C20.5 22.1 19.8 19.9 16.1 18.5Z"
      fill="#fef08a"
    />
    <defs>
      <linearGradient id="fireGradOuter" x1="16" y1="3.5" x2="16" y2="26.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fde047" />
        <stop offset="0.55" stopColor="#f97316" />
        <stop offset="1" stopColor="#e11d48" />
      </linearGradient>
      <linearGradient id="fireGradInner" x1="11" y1="13.5" x2="14" y2="27" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fb923c" />
        <stop offset="1" stopColor="#dc2626" />
      </linearGradient>
    </defs>
  </svg>
);

const LeafEmblem: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path
      d="M16 14.5C16 10.5 13 6.5 9.2 7.2C6.8 7.6 6.8 11.2 9.2 13.2C11 14.7 13.6 15.1 16 14.5Z"
      fill="#4ade80"
      stroke="#bbf7d0"
      strokeWidth="1.1"
    />
    <path
      d="M16 14.5C16 10.5 19 6.5 22.8 7.2C25.2 7.6 25.2 11.2 22.8 13.2C21 14.7 18.4 15.1 16 14.5Z"
      fill="#22c55e"
      stroke="#bbf7d0"
      strokeWidth="1.1"
    />
    <path
      d="M16 17.5C16 21.5 13 25.5 9.2 24.8C6.8 24.4 6.8 20.8 9.2 18.8C11 17.3 13.6 16.9 16 17.5Z"
      fill="#22c55e"
      stroke="#bbf7d0"
      strokeWidth="1.1"
    />
    <path
      d="M16 17.5C16 21.5 19 25.5 22.8 24.8C25.2 24.4 25.2 20.8 22.8 18.8C21 17.3 18.4 16.9 16 17.5Z"
      fill="#4ade80"
      stroke="#bbf7d0"
      strokeWidth="1.1"
    />
    <circle cx="16" cy="16" r="2.2" fill="#dcfce7" />
  </svg>
);

const WaterEmblem: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path
      d="M16 4.2C16 4.2 8 13.1 8 19C8 23.5 11.6 27.2 16 27.2C20.4 27.2 24 23.5 24 19C24 13.1 16 4.2 16 4.2Z"
      fill="url(#waterDropGrad)"
      stroke="#bae6fd"
      strokeWidth="1.2"
    />
    <path
      d="M10.5 19.6C11.8 17.5 14.6 17.2 16.2 19.1C17.4 20.5 19.4 20.7 21 19.4C20.6 22.6 18.2 24.7 15.4 24.7C12.7 24.7 10.7 22.6 10.5 19.6Z"
      fill="#0284c7"
      opacity="0.72"
    />
    <circle cx="13.5" cy="14.2" r="1.4" fill="#e0f2fe" />
    <defs>
      <linearGradient id="waterDropGrad" x1="16" y1="4.2" x2="16" y2="27.2" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7dd3fc" />
        <stop offset="0.55" stopColor="#38bdf8" />
        <stop offset="1" stopColor="#0284c7" />
      </linearGradient>
    </defs>
  </svg>
);

const SkullEmblem: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path
      d="M16 5C10.5 5 6.8 8.9 6.8 14.1C6.8 17.2 8.2 19.6 10.4 21V24.2C10.4 25.3 11.3 26.2 12.4 26.2H19.6C20.7 26.2 21.6 25.3 21.6 24.2V21C23.8 19.6 25.2 17.2 25.2 14.1C25.2 8.9 21.5 5 16 5Z"
      fill="#e2e8f0"
      stroke="#94a3b8"
      strokeWidth="1.2"
    />
    <circle cx="12.5" cy="14.5" r="2.4" fill="#0f172a" />
    <circle cx="19.5" cy="14.5" r="2.4" fill="#0f172a" />
    <path d="M16 17.4L14.8 19.8H17.2L16 17.4Z" fill="#0f172a" />
    <path d="M13.5 23V26M16 23V26M18.5 23V26" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CenterDisc: React.FC<{ outcome: SpinOutcome }> = ({ outcome }) => {
  if (outcome === 'water') {
    return (
      <div className="w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full bg-gradient-to-b from-[#0ea5e9] via-[#0369a1] to-[#0c4a6e] border-[3px] border-sky-300/80 shadow-[inset_0_2px_10px_rgba(255,255,255,0.45),0_0_22px_rgba(56,189,248,0.55)] flex items-center justify-center">
        <WaterEmblem className="w-11 h-11 drop-shadow-[0_2px_8px_rgba(125,211,252,0.85)]" />
      </div>
    );
  }
  if (outcome === 'leaf') {
    return (
      <div className="w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full bg-gradient-to-b from-[#22c55e] via-[#15803d] to-[#14532d] border-[3px] border-emerald-300/80 shadow-[inset_0_2px_10px_rgba(255,255,255,0.45),0_0_22px_rgba(34,197,94,0.55)] flex items-center justify-center">
        <LeafEmblem className="w-11 h-11 drop-shadow-[0_2px_8px_rgba(134,239,172,0.85)]" />
      </div>
    );
  }
  if (outcome === 'fire') {
    return (
      <div className="w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full bg-gradient-to-b from-[#e879f9] via-[#a21caf] to-[#581c87] border-[3px] border-fuchsia-300/80 shadow-[inset_0_2px_10px_rgba(255,255,255,0.45),0_0_22px_rgba(232,121,249,0.55)] flex items-center justify-center">
        <FireEmblem className="w-11 h-11 drop-shadow-[0_2px_8px_rgba(253,224,71,0.85)]" />
      </div>
    );
  }
  return (
    <div className="w-[74px] h-[74px] sm:w-[82px] sm:h-[82px] rounded-full bg-gradient-to-b from-[#334155] via-[#1e293b] to-[#0f172a] border-[3px] border-rose-400/80 shadow-[inset_0_2px_10px_rgba(255,255,255,0.2),0_0_22px_rgba(244,63,94,0.55)] flex items-center justify-center">
      <SkullEmblem className="w-10 h-10 drop-shadow-[0_2px_8px_rgba(244,63,94,0.7)]" />
    </div>
  );
};

const DISC_STEP = 96; // vertical center-to-center spacing so top/bottom neighbor discs peek out realistically

function buildDiscStrip(prev: SpinOutcome, target: SpinOutcome): SpinOutcome[] {
  const arr: SpinOutcome[] = ['fire', prev]; // index 0 = top peeking disc, index 1 = previous center
  for (let i = 0; i < 9; i++) {
    arr.push(OUTCOME_POOL[Math.floor(Math.random() * OUTCOME_POOL.length)]);
  }
  arr.push(target); // final landed center disc
  // Add bottom peeking disc different from target so aperture matches screenshot
  const peekBottom: SpinOutcome = target === 'leaf' ? 'water' : 'leaf';
  arr.push(peekBottom);
  return arr;
}

// Helper to draw SVG arc path clockwise from 12 o'clock (-90deg)
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const startRad = ((startDeg - 90) * Math.PI) / 180;
  const endRad = ((endDeg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export const TwistWheelGame: React.FC<TwistWheelGameProps> = ({
  gameId,
  gameName,
  wallet,
  onlinePlayers,
  winRatio,
  onBack,
  onOpenDeposit,
  onOpenWithdraw,
  onWalletUpdated,
}) => {
  const [bet, setBet] = useState<number>(20);
  const [lockedBet, setLockedBet] = useState<number>(20);
  const [levels, setLevels] = useState<Record<RingKey, number>>({ fire: 0, leaf: 0, water: 0 });
  const [spinning, setSpinning] = useState(false);
  const [discStrip, setDiscStrip] = useState<SpinOutcome[]>(['fire', 'water', 'leaf']);
  const [spinKey, setSpinKey] = useState<number>(0);
  const [lastRingCharged, setLastRingCharged] = useState<RingKey | null>(null);
  const [chargePulseKey, setChargePulseKey] = useState<number>(0);
  const [skullHit, setSkullHit] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playable = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;

  // Live refs prevent stale closures & double-tap / long-press races
  const mountedRef = useRef(true);
  const spinningRef = useRef(false);
  const cashoutBusyRef = useRef(false);
  const autoRef = useRef(false);
  const didLongPressRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const levelsRef = useRef<Record<RingKey, number>>(levels);
  const lockedBetRef = useRef<number>(lockedBet);
  const betRef = useRef<number>(bet);
  betRef.current = bet;
  const playableRef = useRef<number>(playable);
  playableRef.current = playable;
  const winRatioRef = useRef<number>(winRatio);
  winRatioRef.current = winRatio;
  const lastOutcomeRef = useRef<SpinOutcome>('water');
  const onWalletUpdatedRef = useRef(onWalletUpdated);
  onWalletUpdatedRef.current = onWalletUpdated;

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      autoRef.current = false;
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    autoRef.current = autoplay;
  }, [autoplay]);

  const computeTotalMult = (lv: Record<RingKey, number>) =>
    Math.round(
      (RING_MAP.fire.mults[lv.fire] +
        RING_MAP.leaf.mults[lv.leaf] +
        RING_MAP.water.mults[lv.water]) *
        100
    ) / 100;

  const totalMult = computeTotalMult(levels);
  const cashoutAmount = Math.round(lockedBet * totalMult * 100) / 100;
  const hasProgress = levels.fire > 0 || levels.leaf > 0 || levels.water > 0;
  const canPartCashout = hasProgress && levels.fire + levels.leaf + levels.water >= 2;

  const handleSpinRef = useRef<() => Promise<void>>(async () => {});

  const handleSpin = useCallback(async () => {
    if (spinningRef.current || cashoutBusyRef.current) return;
    casinoAudio.unlock();
    setErrorMsg(null);

    const curLevels = levelsRef.current;
    const currentlyHasProgress = curLevels.fire > 0 || curLevels.leaf > 0 || curLevels.water > 0;
    const wagerAmt = currentlyHasProgress ? lockedBetRef.current : betRef.current;

    if (playableRef.current < wagerAmt) {
      setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
      setAutoplay(false);
      autoRef.current = false;
      return;
    }

    spinningRef.current = true;
    setSpinning(true);
    setSkullHit(false);

    if (!currentlyHasProgress) {
      lockedBetRef.current = wagerAmt;
      setLockedBet(wagerAmt);
    }

    try {
      const wAfter = await arcadeWager(gameId, gameName, wagerAmt);
      if (!mountedRef.current) return;
      onWalletUpdatedRef.current(wAfter);
    } catch (err) {
      spinningRef.current = false;
      if (mountedRef.current) {
        setSpinning(false);
        setAutoplay(false);
        autoRef.current = false;
        setErrorMsg(err instanceof Error ? err.message : 'Spin failed.');
      }
      return;
    }

    casinoAudio.playLeverPull();

    const totalProgress = curLevels.fire + curLevels.leaf + curLevels.water;
    const safeChance = Math.max(46, Math.min(84, winRatioRef.current + 18 - totalProgress * 3.5));
    const isSafe = Math.random() * 100 < safeChance;

    let outcome: SpinOutcome;
    if (!isSafe) {
      outcome = 'skull';
    } else {
      const r = Math.random();
      if (r < 0.48) outcome = 'water';
      else if (r < 0.80) outcome = 'leaf';
      else outcome = 'fire';
    }

    setDiscStrip(buildDiscStrip(lastOutcomeRef.current, outcome));
    lastOutcomeRef.current = outcome;
    setSpinKey((k) => k + 1);

    schedule(async () => {
      if (outcome === 'skull') {
        casinoAudio.playTwistReset();
        const zeroed: Record<RingKey, number> = { fire: 0, leaf: 0, water: 0 };
        levelsRef.current = zeroed;
        setLevels(zeroed);
        setLastRingCharged(null);
        setSkullHit(true);
        try {
          const w = await arcadePayout(gameId, gameName, wagerAmt, 0, 'Twist Skull reset');
          if (mountedRef.current) onWalletUpdatedRef.current(w);
        } catch {
          // ignore
        }
      } else {
        const ring = RING_MAP[outcome];
        const maxLv = ring.mults.length - 1;
        const nextLevel = Math.min(maxLv, curLevels[outcome] + 1);
        const nextLevels: Record<RingKey, number> = { ...curLevels, [outcome]: nextLevel };
        levelsRef.current = nextLevels;
        setLevels(nextLevels);
        setLastRingCharged(outcome);
        setChargePulseKey((k) => k + 1);
        const ringIdx = outcome === 'water' ? 0 : outcome === 'leaf' ? 1 : 2;
        casinoAudio.playTwistStep(ringIdx);
      }

      spinningRef.current = false;
      if (!mountedRef.current) return;
      setSpinning(false);

      if (autoRef.current) {
        schedule(() => {
          if (autoRef.current && !spinningRef.current && !cashoutBusyRef.current) {
            void handleSpinRef.current();
          }
        }, 720);
      }
    }, 820);
  }, [gameId, gameName, schedule]);

  handleSpinRef.current = handleSpin;

  const handleCashout = async (partial = false) => {
    const curLv = levelsRef.current;
    const curMult = computeTotalMult(curLv);
    if (spinningRef.current || cashoutBusyRef.current || curMult <= 0) return;

    cashoutBusyRef.current = true;
    setAutoplay(false);
    autoRef.current = false;
    casinoAudio.playCashout();

    const stake = lockedBetRef.current;
    let payout = 0;

    if (partial) {
      // Step each charged ring down by 1 level and pay the difference immediately
      const stepped: Record<RingKey, number> = {
        fire: Math.max(0, curLv.fire - 1),
        leaf: Math.max(0, curLv.leaf - 1),
        water: Math.max(0, curLv.water - 1),
      };
      const remainingMult = computeTotalMult(stepped);
      const cashedMult = Math.max(0.1, Math.round((curMult - remainingMult) * 100) / 100);
      payout = Math.round(stake * cashedMult * 100) / 100;
      levelsRef.current = stepped;
      setLevels(stepped);
    } else {
      payout = Math.round(stake * curMult * 100) / 100;
      const zeroed: Record<RingKey, number> = { fire: 0, leaf: 0, water: 0 };
      levelsRef.current = zeroed;
      setLevels(zeroed);
      setLastRingCharged(null);
    }

    setLastWin(payout);

    try {
      const w = await arcadePayout(
        gameId,
        gameName,
        stake,
        payout,
        partial ? `Twist Part Cashout (${formatINR(payout)})` : `Twist Cashout at ${curMult}x`
      );
      if (mountedRef.current) onWalletUpdatedRef.current(w);
    } catch (err) {
      if (mountedRef.current) {
        setErrorMsg(err instanceof Error ? err.message : 'Cashout failed.');
      }
    } finally {
      cashoutBusyRef.current = false;
    }
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const startHold = () => {
    didLongPressRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      didLongPressRef.current = true;
      casinoAudio.playButtonClick();
      setAutoplay((a) => {
        const next = !a;
        autoRef.current = next;
        if (next && !spinningRef.current) {
          void handleSpinRef.current();
        }
        return next;
      });
    }, 520);
  };

  const stepBet = (dir: 1 | -1) => {
    if (spinning || hasProgress || autoplay) return;
    casinoAudio.playButtonClick();
    if (dir === 1) {
      const next = BET_LADDER.find((v) => v > bet) ?? 50000;
      setBet(next);
    } else {
      const prev = [...BET_LADDER].reverse().find((v) => v < bet) ?? 1;
      setBet(prev);
    }
  };

  // Initial state has 3 items: [topPeek, centerDisc, bottomPeek] -> center index is 1.
  // After spin, strip has N items where index N-2 is landed center disc and N-1 is bottom peek.
  const centerIndex = spinKey === 0 ? 1 : discStrip.length - 2;
  const apertureH = 122;
  const centerTopPad = (apertureH - DISC_STEP) / 2;
  const initialY = spinKey === 0 ? -(1 * DISC_STEP) : -(1 * DISC_STEP);
  const targetY = -(centerIndex * DISC_STEP);

  return (
    <ArcadeShell
      gameId={gameId}
      title={gameName}
      wallet={wallet}
      onlinePlayers={onlinePlayers}
      onBack={onBack}
      onOpenDeposit={onOpenDeposit}
      onOpenWithdraw={onOpenWithdraw}
      onWalletUpdated={onWalletUpdated}
    >
      <div className="flex-1 flex flex-col justify-between max-w-md w-full mx-auto px-3 py-2 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#2a343d_0%,#1c2329_48%,#13181d_100%)]">
        {/* In-Game Top Header: TWIST Logo + Menu Button */}
        <div className="flex items-center justify-between pt-0.5 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#1a2229] border border-white/15 flex items-center justify-center shadow-md">
              <FireEmblem className="w-6 h-6" />
            </div>
            <div className="relative flex items-center">
              <span className="text-xl font-black tracking-[0.06em] text-slate-100 leading-none">
                TW<span className="relative inline-block">I<span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]">🔥</span></span>ST
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              casinoAudio.playButtonClick();
              setShowRules((r) => !r);
            }}
            aria-label="Game rules"
            className="w-9 h-9 rounded-full bg-[#1a222a] hover:bg-[#24303a] border border-white/10 flex items-center justify-center text-slate-300 transition"
          >
            {showRules ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Optional Rules Drawer */}
        {showRules && (
          <div className="mt-1.5 rounded-2xl bg-[#182026]/95 border border-white/10 p-3 text-[11px] text-slate-300 space-y-1.5 shadow-xl">
            <p className="font-extrabold text-white text-xs">How to Play Twist</p>
            <p>
              • Tap <strong className="text-emerald-400">Play</strong> to spin the center element disc.
              Landing on <strong className="text-sky-300">Water</strong>,{' '}
              <strong className="text-emerald-400">Clover</strong>, or{' '}
              <strong className="text-fuchsia-400">Fire</strong> advances that ring&apos;s multiplier!
            </p>
            <p>
              • Tap <strong className="text-amber-300">CASHOUT</strong> anytime to collect your total
              multiplier, or <strong className="text-slate-100">PART CASHOUT</strong> to lock partial profits.
            </p>
            <p>
              • Watch out for the <strong className="text-rose-400">Skull</strong> — it resets charged rings to zero.
            </p>
          </div>
        )}

        {/* CENTERPIECE: Exact 3 Concentric Matte-Dark Multiplier Rings + Center Disc Aperture */}
        <div className="relative flex-1 flex items-center justify-center py-2 min-h-[330px]">
          <div
            className={`relative w-[328px] h-[328px] sm:w-[356px] sm:h-[356px] flex items-center justify-center ${
              skullHit ? 'animate-board-shake' : ''
            }`}
          >
            {/* Glowing Shockwave Pulse when a ring charges */}
            {chargePulseKey > 0 && lastRingCharged && (
              <span
                key={chargePulseKey}
                className="pointer-events-none absolute inset-4 rounded-full border-2 animate-ring-charge"
                style={{ borderColor: RING_MAP[lastRingCharged].arcColorStart }}
              />
            )}

            <svg
              viewBox="0 0 340 340"
              className="w-full h-full drop-shadow-[0_18px_36px_rgba(0,0,0,0.68)]"
            >
              <defs>
                <radialGradient id="twistWheelBody" cx="50%" cy="45%" r="54%">
                  <stop offset="0%" stopColor="#262f37" />
                  <stop offset="68%" stopColor="#1b2228" />
                  <stop offset="100%" stopColor="#11161b" />
                </radialGradient>
                <linearGradient id="fireArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43fd6" />
                  <stop offset="100%" stopColor="#c026d3" />
                </linearGradient>
                <linearGradient id="leafArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#4ade80" />
                </linearGradient>
                <linearGradient id="waterArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Outer Raised Charcoal Wheel Housing */}
              <circle
                cx="170"
                cy="170"
                r="160"
                fill="url(#twistWheelBody)"
                stroke="#323d47"
                strokeWidth="2.5"
              />

              {/* Subtle Ring Channel Grooves */}
              <circle cx="170" cy="170" r="154" fill="none" stroke="#0d1216" strokeWidth="2.5" />
              <circle cx="170" cy="170" r="122" fill="none" stroke="#0b0f13" strokeWidth="3.5" />
              <circle cx="170" cy="170" r="90" fill="none" stroke="#0b0f13" strokeWidth="3.5" />
              <circle cx="170" cy="170" r="60" fill="#0d1217" stroke="#2d3842" strokeWidth="2" />

              {/* Render Each of the 3 Concentric Rings (Track + Neon Progress Arc + Ticks + Labels) */}
              {RINGS.map((ring) => {
                const segCount = ring.segments.length;
                const stepDeg = 360 / segCount;
                const lv = levels[ring.key];
                const circumference = 2 * Math.PI * ring.radius;
                const progressRatio = Math.min(1, lv / segCount);
                const dashOffset = circumference * (1 - progressRatio);
                const gradId =
                  ring.key === 'fire'
                    ? 'url(#fireArcGrad)'
                    : ring.key === 'leaf'
                    ? 'url(#leafArcGrad)'
                    : 'url(#waterArcGrad)';

                return (
                  <g key={ring.key}>
                    {/* Dark recessed ring track */}
                    <circle
                      cx="170"
                      cy="170"
                      r={ring.radius}
                      fill="none"
                      stroke="#182026"
                      strokeWidth={ring.strokeWidth}
                    />

                    {/* Smooth Glowing Neon Progress Arc (starts at 12 o'clock clockwise) */}
                    <circle
                      cx="170"
                      cy="170"
                      r={ring.radius}
                      fill="none"
                      stroke={gradId}
                      strokeWidth={ring.strokeWidth - 4}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 170 170)"
                      filter={lv > 0 ? 'url(#neonGlow)' : undefined}
                      style={{
                        transition:
                          'stroke-dashoffset 0.58s cubic-bezier(0.22, 1, 0.36, 1)',
                        opacity: lv > 0 ? 1 : 0,
                      }}
                    />

                    {/* Segment Dividers & Curved Multiplier Labels */}
                    {ring.segments.map((label, idx) => {
                      const dividerDeg = idx * stepDeg;
                      const divRad = ((dividerDeg - 90) * Math.PI) / 180;
                      const innerR = ring.radius - ring.strokeWidth * 0.34;
                      const outerR = ring.radius + ring.strokeWidth * 0.34;
                      const x1 = 170 + innerR * Math.cos(divRad);
                      const y1 = 170 + innerR * Math.sin(divRad);
                      const x2 = 170 + outerR * Math.cos(divRad);
                      const y2 = 170 + outerR * Math.sin(divRad);

                      const midDeg = idx * stepDeg + stepDeg * 0.5;
                      const midRad = ((midDeg - 90) * Math.PI) / 180;
                      const tx = 170 + ring.radius * Math.cos(midRad);
                      const ty = 170 + ring.radius * Math.sin(midRad);

                      // Flip text upright on bottom half for natural readability matching screenshot
                      const textRot =
                        midDeg > 105 && midDeg < 255 ? midDeg + 180 : midDeg;
                      const isLit = idx < lv;

                      return (
                        <g key={`${ring.key}-${label}`}>
                          {idx > 0 && (
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={isLit ? 'rgba(15,23,42,0.5)' : 'rgba(148,163,184,0.22)'}
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          )}
                          <text
                            x={tx}
                            y={ty}
                            textAnchor="middle"
                            dominantBaseline="central"
                            transform={`rotate(${textRot}, ${tx}, ${ty})`}
                            fill={isLit ? '#0f172a' : '#7b8794'}
                            fontSize={ring.key === 'fire' ? '12.5' : ring.key === 'leaf' ? '12' : '11.8'}
                            fontWeight="900"
                            style={{
                              letterSpacing: '0.02em',
                              transition: 'fill 0.35s ease',
                            }}
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Subtle inner highlight rim on charged arc */}
                    {lv > 0 && lv < segCount && (
                      <path
                        d={describeArc(170, 170, ring.radius, 0, Math.max(4, lv * stepDeg - 2))}
                        fill="none"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* 3 Vertically Stacked Element Medallions at Exact 12 O'Clock */}
            <div className="pointer-events-none absolute top-[12px] sm:top-[15px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[5px] sm:gap-[6px] z-20">
              <div
                className={`w-[26px] h-[26px] sm:w-[28px] sm:h-[28px] rounded-full bg-[#1c242c] border-2 flex items-center justify-center shadow-lg transition-all duration-300 ${
                  levels.fire > 0
                    ? 'border-fuchsia-400 shadow-fuchsia-500/50 scale-105'
                    : 'border-slate-500/70'
                }`}
              >
                <FireEmblem className="w-4 h-4" />
              </div>
              <div
                className={`w-[26px] h-[26px] sm:w-[28px] sm:h-[28px] rounded-full bg-[#1c242c] border-2 flex items-center justify-center shadow-lg transition-all duration-300 ${
                  levels.leaf > 0
                    ? 'border-emerald-400 shadow-emerald-500/50 scale-105'
                    : 'border-slate-500/70'
                }`}
              >
                <LeafEmblem className="w-4 h-4" />
              </div>
              <div
                className={`w-[26px] h-[26px] sm:w-[28px] sm:h-[28px] rounded-full bg-[#1c242c] border-2 flex items-center justify-center shadow-lg transition-all duration-300 ${
                  levels.water > 0
                    ? 'border-sky-400 shadow-sky-500/50 scale-105'
                    : 'border-slate-500/70'
                }`}
              >
                <WaterEmblem className="w-4 h-4" />
              </div>
            </div>

            {/* Center Recessed Circular Reel Window with Peeking Top/Bottom Discs */}
            <div
              style={{ width: apertureH, height: apertureH }}
              className="absolute rounded-full bg-[#0c1116] border-[3px] border-[#29343e] shadow-[inset_0_10px_24px_rgba(0,0,0,0.92)] overflow-hidden z-10 flex items-start justify-center"
            >
              <motion.div
                key={spinKey}
                initial={{ y: initialY + centerTopPad }}
                animate={{ y: targetY + centerTopPad }}
                transition={
                  spinKey === 0
                    ? { duration: 0 }
                    : { duration: 0.78, ease: [0.14, 0.88, 0.22, 1.04] }
                }
                className="w-full flex flex-col items-center will-change-transform"
              >
                {discStrip.map((item, idx) => (
                  <div
                    key={idx}
                    style={{ height: DISC_STEP }}
                    className="w-full shrink-0 flex items-center justify-center"
                  >
                    <CenterDisc outcome={item} />
                  </div>
                ))}
              </motion.div>

              {/* Soft Top/Bottom Cylindrical Aperture Shadow */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-black/80 via-black/35 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
            </div>
          </div>
        </div>

        {/* Error Strip if insufficient balance */}
        {errorMsg && (
          <div className="mb-2 rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* EXACT BOTTOM CONTROL DECK MATCHING SCREENSHOT */}
        <div className="space-y-2.5 pb-1">
          {/* Row 1: BALANCE Card + PART CASHOUT Button */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-11 rounded-xl bg-[#181f26] border border-white/10 px-3 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                BALANCE
              </span>
              <span className="text-sm font-extrabold font-mono-num text-white flex items-center gap-1">
                {playable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                <span className="w-4 h-4 rounded-full bg-white text-[#13181d] text-[10px] font-black inline-flex items-center justify-center">
                  ₹
                </span>
              </span>
            </div>

            <button
              type="button"
              disabled={!canPartCashout || spinning}
              onClick={() => void handleCashout(true)}
              className={`h-11 rounded-xl border text-xs font-extrabold tracking-wider uppercase transition-all ${
                canPartCashout && !spinning
                  ? 'bg-[#24303b] hover:bg-[#2c3a47] border-amber-400/45 text-amber-200 active:scale-[0.98]'
                  : 'bg-[#181f26] border-white/10 text-slate-500 cursor-not-allowed'
              }`}
            >
              PART CASHOUT
            </button>
          </div>

          {/* Row 2: BET Box + Iconic Glowing Green HOLD-TO-AUTOPLAY Circle + Golden CASHOUT Button */}
          <div className="relative grid grid-cols-12 items-center gap-0">
            {/* Left BET Selector */}
            <div className="col-span-5 h-[62px] rounded-l-2xl rounded-r-lg bg-[#181f26] border border-white/10 pl-3 pr-5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase leading-none">
                  BET
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-4 h-4 rounded-full bg-slate-500/40 text-slate-200 text-[10px] font-black inline-flex items-center justify-center shrink-0">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    disabled={spinning || hasProgress || autoplay}
                    value={hasProgress ? lockedBet : bet}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(50000, Math.floor(Number(e.target.value) || 1)));
                      setBet(v);
                    }}
                    className="w-full bg-transparent text-sm font-extrabold font-mono-num text-white focus:outline-none disabled:opacity-75"
                  />
                </div>
              </div>

              {/* Up / Down Bet Steppers */}
              <div className="flex flex-col gap-1 shrink-0 mr-1">
                <button
                  type="button"
                  disabled={spinning || hasProgress || autoplay}
                  onClick={() => stepBet(1)}
                  aria-label="Increase bet"
                  className="w-6 h-5 rounded bg-[#222b34] hover:bg-[#2d3844] border border-white/10 flex items-center justify-center text-slate-300 disabled:opacity-40 transition"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={spinning || hasProgress || autoplay}
                  onClick={() => stepBet(-1)}
                  aria-label="Decrease bet"
                  className="w-6 h-5 rounded bg-[#222b34] hover:bg-[#2d3844] border border-white/10 flex items-center justify-center text-slate-300 disabled:opacity-40 transition"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Center Spacer for Overlapping Circular Play Button */}
            <div className="col-span-2 flex items-center justify-center relative z-20">
              <button
                type="button"
                disabled={spinning && !autoplay}
                onPointerDown={startHold}
                onPointerUp={clearHoldTimer}
                onPointerLeave={clearHoldTimer}
                onPointerCancel={clearHoldTimer}
                onClick={() => {
                  if (didLongPressRef.current) {
                    didLongPressRef.current = false;
                    return;
                  }
                  if (autoplay) {
                    setAutoplay(false);
                    autoRef.current = false;
                  } else {
                    void handleSpin();
                  }
                }}
                aria-label={autoplay ? 'Stop Autoplay' : 'Spin Wheel'}
                className={`relative w-[84px] h-[84px] -my-3 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.65)] active:scale-95 transition-all select-none ${
                  autoplay
                    ? 'bg-[radial-gradient(circle_at_35%_30%,#fb7185_0%,#e11d48_65%,#881337_100%)] border-[3px] border-rose-300/80 shadow-rose-600/40'
                    : 'bg-[radial-gradient(circle_at_35%_30%,#4ade80_0%,#16a34a_68%,#14532d_100%)] border-[3px] border-emerald-300/80 shadow-emerald-500/40'
                }`}
              >
                {/* Curved HOLD / TO AUTOPLAY SVG Label */}
                <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 w-full h-full">
                  <defs>
                    <path id="twistTopArc" d="M 20,50 A 30,30 0 0,1 80,50" />
                    <path id="twistBotArc" d="M 16,52 A 34,34 0 0,0 84,52" />
                  </defs>
                  <text
                    fill="#ecfdf5"
                    fontSize="9.2"
                    fontWeight="800"
                    letterSpacing="1.2"
                  >
                    <textPath href="#twistTopArc" startOffset="50%" textAnchor="middle">
                      {autoplay ? 'AUTO' : 'HOLD'}
                    </textPath>
                  </text>
                  <text
                    fill="#ecfdf5"
                    fontSize="8.2"
                    fontWeight="800"
                    letterSpacing="0.8"
                  >
                    <textPath href="#twistBotArc" startOffset="50%" textAnchor="middle">
                      {autoplay ? 'TAP TO STOP' : 'TO AUTOPLAY'}
                    </textPath>
                  </text>
                </svg>

                {autoplay ? (
                  <Square className="w-6 h-6 text-white fill-white" />
                ) : (
                  <Play
                    className={`w-7 h-7 text-white fill-white ml-0.5 transition-transform ${
                      spinning ? 'scale-90 opacity-75' : ''
                    }`}
                  />
                )}
              </button>
            </div>

            {/* Right Vibrant Yellow CASHOUT Button */}
            <button
              type="button"
              disabled={!hasProgress || spinning}
              onClick={() => void handleCashout(false)}
              className={`col-span-5 h-[62px] rounded-r-2xl rounded-l-lg pl-5 pr-3 flex flex-col items-center justify-center transition-all ${
                hasProgress && !spinning
                  ? 'bg-gradient-to-b from-[#facc15] to-[#eab308] hover:brightness-105 active:scale-[0.98] text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'bg-[#2a2716] border border-amber-500/20 text-amber-200/45 cursor-not-allowed'
              }`}
            >
              <span className="text-xs font-black tracking-wider uppercase leading-tight">
                CASHOUT
              </span>
              <span className="text-base font-black font-mono-num flex items-center gap-1 leading-tight mt-0.5">
                {hasProgress ? cashoutAmount.toFixed(2) : '0.00'}
                <span
                  className={`w-4 h-4 rounded-full text-[10px] font-black inline-flex items-center justify-center ${
                    hasProgress && !spinning
                      ? 'bg-slate-950 text-amber-300'
                      : 'bg-amber-200/20 text-amber-200/50'
                  }`}
                >
                  ₹
                </span>
              </span>
            </button>
          </div>

          {/* Bottom Footer Strip: LAST WIN */}
          <div className="pt-1 text-center text-[11px] font-bold tracking-wider text-slate-300 uppercase font-mono-num">
            LAST WIN:{' '}
            <span className={lastWin && lastWin > 0 ? 'text-emerald-400' : 'text-slate-400'}>
              {lastWin && lastWin > 0 ? formatINR(lastWin) : '-'}
            </span>
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
};
