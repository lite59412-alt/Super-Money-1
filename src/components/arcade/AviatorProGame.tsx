import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flame, Plane, TrendingUp } from 'lucide-react';
import { WalletSummary } from '../../types';
import { formatINR } from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import { ArcadeShell, arcadePayout, arcadeWager } from './ArcadeShell';
import { BetAmountControl } from './BetAmountControl';
import { Aviator3DStage, AviatorTelemetry } from './Aviator3DStage';

type Phase = 'waiting' | 'flying' | 'crashed';
type BetStatus = 'none' | 'queued' | 'active' | 'cashed' | 'lost';

interface AviatorProGameProps {
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

const WAIT_MS = 3400;
const CRASH_PAUSE_MS = 2300;

function sampleCrashPoint(winRatio: number): number {
  const r = Math.random();
  const houseFactor = Math.max(0.42, Math.min(0.92, winRatio / 100));
  if (r < 0.08 * (1 - houseFactor + 0.3)) {
    return 1.0 + Math.round(Math.random() * 14) / 100;
  }
  const raw = Math.max(1.06, (0.97 / Math.max(0.015, 1 - r)) * (0.85 + houseFactor * 0.35));
  return Math.min(48.5, Math.round(raw * 100) / 100);
}

export const AviatorProGame: React.FC<AviatorProGameProps> = ({
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
  const [phase, setPhase] = useState<Phase>('waiting');
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [history, setHistory] = useState<number[]>([
    2.41, 1.38, 6.84, 1.12, 3.25, 14.6, 1.94, 2.08, 4.17, 1.52,
  ]);
  const [betAmount, setBetAmount] = useState<number>(50);
  const [betStatus, setBetStatus] = useState<BetStatus>('none');
  const [queuedNextRound, setQueuedNextRound] = useState<boolean>(false);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutTarget, setAutoCashoutTarget] = useState<number>(2.0);
  const [cashedMultiplier, setCashedMultiplier] = useState<number | null>(null);
  const [winToast, setWinToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playable = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;

  // Mutable 60fps telemetry ref consumed directly by Aviator3DStage (zero React re-render overhead)
  const telemetryRef = useRef<AviatorTelemetry>({
    phase: 'waiting',
    multiplier: 1.0,
    flightElapsedSec: 0,
    crashElapsedSec: 0,
  });
  const waitBarRef = useRef<HTMLDivElement | null>(null);

  // Live refs so the flight engine NEVER tears down or reads stale closures
  const mountedRef = useRef(true);
  const onWalletUpdatedRef = useRef(onWalletUpdated);
  onWalletUpdatedRef.current = onWalletUpdated;

  const winRatioRef = useRef(winRatio);
  winRatioRef.current = winRatio;

  const playableRef = useRef(playable);
  playableRef.current = playable;

  const betAmountRef = useRef(betAmount);
  betAmountRef.current = betAmount;

  const activeStakeRef = useRef(0);
  const queuedNextRoundRef = useRef(false);
  const phaseRef = useRef<Phase>('waiting');
  const betStatusRef = useRef<BetStatus>('none');
  const multiplierRef = useRef(1.0);
  const autoCashoutRef = useRef({ enabled: false, target: 2.0 });
  const wagerInFlightRef = useRef(false);
  const cashoutInFlightRef = useRef(false);
  const pendingCashoutMultRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    autoCashoutRef.current = { enabled: autoCashoutEnabled, target: autoCashoutTarget };
  }, [autoCashoutEnabled, autoCashoutTarget]);

  const showToast = useCallback((msg: string, durationMs = 2600) => {
    setWinToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setWinToast(null);
    }, durationMs);
  }, []);

  const performCashout = useCallback(
    async (atMult: number) => {
      if (betStatusRef.current !== 'active' || cashoutInFlightRef.current) return;
      if (wagerInFlightRef.current) {
        // Wager API is still confirming; remember target multiplier to cash out right after
        pendingCashoutMultRef.current = atMult;
        return;
      }
      cashoutInFlightRef.current = true;
      betStatusRef.current = 'cashed';
      setBetStatus('cashed');
      setCashedMultiplier(atMult);

      const stake = activeStakeRef.current;
      const winAmount = Math.round(stake * atMult * 100) / 100;
      casinoAudio.playCashout();
      showToast(`Cashed out @ ${atMult.toFixed(2)}x · +${formatINR(winAmount)}`);

      try {
        const w = await arcadePayout(
          gameId,
          gameName,
          stake,
          winAmount,
          `Aviator cashout at ${atMult.toFixed(2)}x`
        );
        if (mountedRef.current) {
          onWalletUpdatedRef.current(w);
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrorMsg(err instanceof Error ? err.message : 'Cashout sync failed.');
        }
      } finally {
        cashoutInFlightRef.current = false;
      }
    },
    [gameId, gameName, showToast]
  );

  const performCashoutRef = useRef(performCashout);
  performCashoutRef.current = performCashout;

  // Main Continuous Flight Lifecycle — ONLY depends on [gameId, gameName] so wallet updates NEVER reset the round!
  useEffect(() => {
    mountedRef.current = true;
    let rafId = 0;
    let timerId = 0;
    let roundToken = 0;

    const clearScheduled = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = 0;
      }
    };

    const startWaiting = () => {
      if (!mountedRef.current) return;
      clearScheduled();
      roundToken += 1;

      phaseRef.current = 'waiting';
      setPhase('waiting');
      multiplierRef.current = 1.0;
      setMultiplier(1.0);
      setCashedMultiplier(null);
      pendingCashoutMultRef.current = null;
      wagerInFlightRef.current = false;
      cashoutInFlightRef.current = false;

      telemetryRef.current.phase = 'waiting';
      telemetryRef.current.multiplier = 1.0;
      telemetryRef.current.flightElapsedSec = 0;
      telemetryRef.current.crashElapsedSec = 0;

      // Carry over a next-round queued bet cleanly
      if (queuedNextRoundRef.current) {
        queuedNextRoundRef.current = false;
        setQueuedNextRound(false);
        betStatusRef.current = 'queued';
        setBetStatus('queued');
      } else if (betStatusRef.current === 'cashed' || betStatusRef.current === 'lost') {
        betStatusRef.current = 'none';
        setBetStatus('none');
      }

      const waitStart = performance.now();
      const tickWait = (now: number) => {
        if (!mountedRef.current) return;
        const p = Math.min(1, (now - waitStart) / WAIT_MS);
        if (waitBarRef.current) {
          waitBarRef.current.style.transform = `scaleX(${Math.max(0, 1 - p)})`;
        }
        if (p < 1) {
          rafId = requestAnimationFrame(tickWait);
        } else {
          startFlight(roundToken);
        }
      };
      rafId = requestAnimationFrame(tickWait);
    };

    const startFlight = (token: number) => {
      if (!mountedRef.current || token !== roundToken) return;
      clearScheduled();

      const crashAt = sampleCrashPoint(winRatioRef.current);
      phaseRef.current = 'flying';
      setPhase('flying');
      multiplierRef.current = 1.0;
      setMultiplier(1.0);
      telemetryRef.current.phase = 'flying';
      telemetryRef.current.multiplier = 1.0;
      telemetryRef.current.flightElapsedSec = 0;
      telemetryRef.current.crashElapsedSec = 0;

      // Deduct queued bet cleanly on takeoff with race protection
      if (betStatusRef.current === 'queued') {
        const stake = betAmountRef.current;
        if (playableRef.current >= stake) {
          activeStakeRef.current = stake;
          wagerInFlightRef.current = true;
          betStatusRef.current = 'active';
          setBetStatus('active');
          setErrorMsg(null);
          casinoAudio.playPlaneTakeoff();

          void arcadeWager(gameId, gameName, stake)
            .then((wAfter) => {
              wagerInFlightRef.current = false;
              if (!mountedRef.current) return;
              onWalletUpdatedRef.current(wAfter);

              if (token !== roundToken) return;

              // If the user clicked Cashout while wager was in flight and plane hasn't crashed
              const pendingMult = pendingCashoutMultRef.current;
              pendingCashoutMultRef.current = null;
              if (pendingMult !== null && phaseRef.current === 'flying' && betStatusRef.current === 'active') {
                void performCashoutRef.current(pendingMult);
              } else if (phaseRef.current === 'crashed' && betStatusRef.current === 'lost') {
                // Plane crashed before wager finished — settle loss record now
                void arcadePayout(gameId, gameName, stake, 0, `Plane flew away at ${crashAt.toFixed(2)}x`)
                  .then((wLoss) => {
                    if (mountedRef.current) onWalletUpdatedRef.current(wLoss);
                  })
                  .catch(() => {});
              }
            })
            .catch((err) => {
              wagerInFlightRef.current = false;
              pendingCashoutMultRef.current = null;
              if (!mountedRef.current) return;
              betStatusRef.current = 'none';
              setBetStatus('none');
              setErrorMsg(err instanceof Error ? err.message : 'Bet failed.');
            });
        } else {
          betStatusRef.current = 'none';
          setBetStatus('none');
          setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
        }
      }

      const startTs = performance.now();
      let lastRenderedHundredths = 100;

      const tickFlight = (now: number) => {
        if (!mountedRef.current || token !== roundToken) return;
        const elapsedSec = (now - startTs) / 1000;
        const nextMult = Math.floor(Math.exp(elapsedSec * 0.165) * 100) / 100;

        telemetryRef.current.flightElapsedSec = elapsedSec;
        telemetryRef.current.multiplier = nextMult;

        if (nextMult >= crashAt) {
          multiplierRef.current = crashAt;
          telemetryRef.current.multiplier = crashAt;
          setMultiplier(crashAt);
          triggerCrash(crashAt, token);
          return;
        }

        multiplierRef.current = nextMult;
        const hundredths = Math.round(nextMult * 100);
        if (hundredths !== lastRenderedHundredths) {
          lastRenderedHundredths = hundredths;
          setMultiplier(nextMult);
        }

        // Auto-cashout check
        if (
          betStatusRef.current === 'active' &&
          autoCashoutRef.current.enabled &&
          nextMult >= autoCashoutRef.current.target
        ) {
          void performCashoutRef.current(autoCashoutRef.current.target);
        }

        rafId = requestAnimationFrame(tickFlight);
      };

      rafId = requestAnimationFrame(tickFlight);
    };

    const triggerCrash = (crashAt: number, token: number) => {
      if (!mountedRef.current || token !== roundToken) return;
      clearScheduled();

      phaseRef.current = 'crashed';
      setPhase('crashed');
      telemetryRef.current.phase = 'crashed';
      telemetryRef.current.crashElapsedSec = 0;

      setHistory((prev) => [crashAt, ...prev.slice(0, 13)]);
      casinoAudio.playPlaneCrash();

      if (betStatusRef.current === 'active') {
        betStatusRef.current = 'lost';
        setBetStatus('lost');
        // If wager is still in flight, its .then() will call arcadePayout cleanly
        if (!wagerInFlightRef.current) {
          const stake = activeStakeRef.current;
          void arcadePayout(gameId, gameName, stake, 0, `Plane flew away at ${crashAt.toFixed(2)}x`)
            .then((w) => {
              if (mountedRef.current) onWalletUpdatedRef.current(w);
            })
            .catch(() => {});
        }
      }

      const crashStart = performance.now();
      const tickCrash = (now: number) => {
        if (!mountedRef.current || token !== roundToken) return;
        const ce = (now - crashStart) / 1000;
        telemetryRef.current.crashElapsedSec = ce;
        if (ce * 1000 < CRASH_PAUSE_MS) {
          rafId = requestAnimationFrame(tickCrash);
        } else {
          startWaiting();
        }
      };
      rafId = requestAnimationFrame(tickCrash);
    };

    startWaiting();

    return () => {
      mountedRef.current = false;
      clearScheduled();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [gameId, gameName]);

  const handleMainAction = () => {
    casinoAudio.unlock();
    setErrorMsg(null);

    if (phase === 'flying' && betStatus === 'active') {
      void performCashout(multiplierRef.current);
      return;
    }

    if (phase === 'waiting') {
      if (betStatus === 'queued') {
        betStatusRef.current = 'none';
        setBetStatus('none');
        casinoAudio.playButtonClick();
        return;
      }
      if (playable < betAmount) {
        setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
        return;
      }
      betStatusRef.current = 'queued';
      setBetStatus('queued');
      casinoAudio.playButtonClick();
      return;
    }

    // Flying (not currently active) or crashed -> toggle queue for next round
    if (queuedNextRoundRef.current) {
      queuedNextRoundRef.current = false;
      setQueuedNextRound(false);
      casinoAudio.playButtonClick();
      return;
    }
    if (playable < betAmount) {
      setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
      return;
    }
    queuedNextRoundRef.current = true;
    setQueuedNextRound(true);
    casinoAudio.playButtonClick();
  };

  const potentialCashout = Math.round(activeStakeRef.current * multiplier * 100) / 100;
  const isWaitingQueued = phase === 'waiting' && betStatus === 'queued';
  const isNextRoundQueued = phase !== 'waiting' && queuedNextRound;
  const isAnyQueued = isWaitingQueued || isNextRoundQueued;

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
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-3 py-2.5 gap-2.5 overflow-y-auto">
        {/* Recent Crash Multiplier Pills Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {history.map((m, idx) => {
            const pillClass =
              m >= 10
                ? 'bg-pink-500/20 border-pink-400/50 text-pink-300'
                : m >= 2
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                : 'bg-sky-500/15 border-sky-400/40 text-sky-300';
            return (
              <span
                key={`${idx}-${m}`}
                className={`px-2.5 py-0.5 rounded-full border text-xs font-extrabold font-mono-num shrink-0 transition-transform duration-300 ${pillClass}`}
              >
                {m.toFixed(2)}x
              </span>
            );
          })}
        </div>

        {/* 3D Interactive Aviator Stage */}
        <div className="relative flex-1 min-h-[290px] sm:min-h-[340px] rounded-3xl overflow-hidden bg-gradient-to-b from-[#160A16] via-[#0F0B18] to-[#090B12] border border-rose-500/30 shadow-2xl shadow-rose-950/40 flex flex-col items-center justify-center">
          {/* Smooth Three.js 3D Stunt Plane & Flight Trail */}
          <Aviator3DStage telemetryRef={telemetryRef} />

          {/* Subtle vignette for crisp HUD contrast */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(6,8,15,0.68)_100%)]" />

          {/* Live HUD Overlay */}
          <div className="relative z-10 text-center px-4 select-none pointer-events-none">
            {phase === 'waiting' && (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-400/40 text-rose-300 text-xs font-extrabold uppercase tracking-wider">
                  <Plane className="w-3.5 h-3.5" />
                  <span>Preparing Takeoff</span>
                </div>
                <p className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  WAITING FOR NEXT ROUND
                </p>
                <div className="w-56 h-2.5 mx-auto rounded-full bg-white/10 overflow-hidden">
                  <div
                    ref={waitBarRef}
                    className="h-full w-full origin-left bg-gradient-to-r from-rose-500 to-amber-400 will-change-transform"
                    style={{ transform: 'scaleX(1)' }}
                  />
                </div>
              </div>
            )}

            {phase === 'flying' && (
              <div className="space-y-1">
                <p
                  className="text-6xl sm:text-7xl font-black font-mono-num tracking-tight drop-shadow-[0_4px_24px_rgba(244,63,94,0.45)] transition-colors duration-300"
                  style={{
                    color: multiplier >= 5 ? '#f472b6' : multiplier >= 2 ? '#fbbf24' : '#ffffff',
                  }}
                >
                  {multiplier.toFixed(2)}x
                </p>
                {betStatus === 'cashed' && cashedMultiplier && (
                  <p className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-bold">
                    Secured at {cashedMultiplier.toFixed(2)}x!
                  </p>
                )}
              </div>
            )}

            {phase === 'crashed' && (
              <div className="space-y-1.5">
                <p className="text-lg sm:text-xl font-black uppercase tracking-widest text-rose-400">
                  FLEW AWAY!
                </p>
                <p className="text-6xl sm:text-7xl font-black font-mono-num text-rose-500 drop-shadow-[0_4px_24px_rgba(225,29,72,0.6)]">
                  {multiplier.toFixed(2)}x
                </p>
              </div>
            )}
          </div>

          {/* Win Toast Banner */}
          {winToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-xs shadow-xl shadow-emerald-500/40 whitespace-nowrap">
              {winToast}
            </div>
          )}

          {/* Subtle status badge bottom-left */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 text-[11px] font-bold text-slate-300 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10">
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
            <span>3D Live Flight Engine</span>
          </div>
        </div>

        {/* Error Strip */}
        {errorMsg && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* Bet & Cashout Console */}
        <div className="rounded-2xl bg-[#121622] border border-white/10 p-3 space-y-3">
          {/* Auto Cashout Row */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-300">
              <input
                type="checkbox"
                checked={autoCashoutEnabled}
                onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                className="accent-emerald-500 w-4 h-4 rounded"
              />
              <span>Auto Cash Out</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="number"
                step="0.1"
                min="1.1"
                max="50"
                value={autoCashoutTarget}
                onChange={(e) =>
                  setAutoCashoutTarget(Math.max(1.1, Math.min(50, Number(e.target.value) || 2)))
                }
                disabled={!autoCashoutEnabled}
                className="w-20 px-2 py-1 rounded-lg bg-[#080B12] border border-white/15 text-right font-mono-num font-bold text-amber-300 disabled:opacity-40"
              />
              <span className="text-slate-400 font-bold">x</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
            {/* Bet Amount Selector */}
            <div className="sm:col-span-6">
              <BetAmountControl
                value={betAmount}
                onChange={setBetAmount}
                disabled={betStatus === 'active' || isAnyQueued}
              />
            </div>

            {/* Primary BET / CASHOUT Button */}
            <button
              type="button"
              onClick={handleMainAction}
              className={`sm:col-span-6 min-h-[74px] rounded-2xl font-black text-lg tracking-wide flex flex-col items-center justify-center shadow-xl active:scale-[0.98] transition-all ${
                phase === 'flying' && betStatus === 'active'
                  ? 'bg-gradient-to-b from-amber-400 to-orange-500 text-slate-950 shadow-amber-500/35'
                  : isAnyQueued
                  ? 'bg-gradient-to-b from-rose-500 to-red-700 text-white shadow-rose-600/30'
                  : 'bg-gradient-to-b from-emerald-400 to-green-600 text-slate-950 shadow-emerald-500/30'
              }`}
            >
              {phase === 'flying' && betStatus === 'active' ? (
                <>
                  <span className="text-xs uppercase tracking-wider font-extrabold opacity-80">
                    CASH OUT NOW
                  </span>
                  <span className="text-xl font-mono-num">{formatINR(potentialCashout)}</span>
                </>
              ) : isAnyQueued ? (
                <>
                  <span className="text-sm uppercase">CANCEL BET</span>
                  <span className="text-[11px] font-semibold opacity-90">
                    {phase === 'waiting'
                      ? `Launching ${formatINR(betAmount)}`
                      : `Queued ${formatINR(betAmount)} for next round`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-base uppercase">
                    {phase === 'waiting' ? 'BET' : 'BET NEXT ROUND'}
                  </span>
                  <span className="text-sm font-mono-num opacity-90">{formatINR(betAmount)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
};
