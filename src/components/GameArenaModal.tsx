import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { GameItem, GameSessionRecord, LeaderboardEntry, WalletSummary } from '../types';
import { formatINR, playCasinoGameFirestore } from '../lib/api';
import { casinoAudio } from '../lib/casinoAudio';
import { Casino3DStage, Casino3DStageHandle } from './three/Casino3DStage';
import { GameOutcomeEvent, GameOutcomeOverlay } from './arcade/GameOutcomeOverlay';

interface GameArenaModalProps {
  game: GameItem;
  wallet: WalletSummary;
  leaderboard: LeaderboardEntry[];
  onClose: () => void;
  onOpenDeposit: () => void;
  onCompleted: (session: GameSessionRecord, wallet: WalletSummary) => Promise<void> | void;
}

const CHOICE_OPTIONS: Record<string, string[]> = {
  wheel: ['Sapphire', 'Gold'],
  dice: ['High (7-12)', 'Low (2-6)'],
  coin: ['Heads', 'Tails'],
  cards: ['High (8-A)', 'Low (2-7)'],
  mines: ['Chest #1', 'Chest #4', 'Chest #7', 'Chest #9'],
  slots: ['Spin 777'],
};

const SETTLE_WAIT_MS: Record<string, number> = {
  wheel: 2450,
  dice: 1700,
  coin: 1800,
  cards: 1500,
  mines: 1100,
  slots: 2050,
};

const ENGINE_ACTION_LABEL: Record<string, { idle: string; busy: string }> = {
  wheel: { idle: 'Spin 3D Wheel', busy: 'Wheel Spinning...' },
  dice: { idle: 'Throw 3D Dice', busy: 'Dice Rolling...' },
  coin: { idle: 'Flip 3D Coin', busy: 'Coin Flipping...' },
  cards: { idle: 'Deal & Flip Card', busy: 'Dealing Card...' },
  mines: { idle: 'Open 3D Chest', busy: 'Opening Chest...' },
  slots: { idle: 'Pull 3D Lever', busy: 'Reels Spinning...' },
};

export const GameArenaModal: React.FC<GameArenaModalProps> = ({
  game,
  wallet,
  leaderboard,
  onClose,
  onOpenDeposit,
  onCompleted,
}) => {
  const defaultOptions = CHOICE_OPTIONS[game.engine] || ['Play'];
  const defaultStake = game.entryFeeOptions?.[0] ?? 20;
  const [entryFee, setEntryFee] = useState<number>(Math.max(10, defaultStake));
  const [choice, setChoice] = useState<string>(defaultOptions[0]);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<GameSessionRecord | null>(null);
  const [visualDetail, setVisualDetail] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => casinoAudio.isMuted());
  const [outcomeAnim, setOutcomeAnim] = useState<GameOutcomeEvent | null>(null);

  const stageRef = useRef<Casino3DStageHandle | null>(null);
  const mountedRef = useRef(true);
  const spinningRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const waitSafe = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const id = window.setTimeout(() => {
        timersRef.current = timersRef.current.filter((t) => t !== id);
        resolve(mountedRef.current);
      }, ms);
      timersRef.current.push(id);
    });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  // Cleanly reset local round state if game changes
  useEffect(() => {
    const opts = CHOICE_OPTIONS[game.engine] || ['Play'];
    setChoice(opts[0]);
    setEntryFee(Math.max(10, game.entryFeeOptions?.[0] ?? 20));
    setLastResult(null);
    setVisualDetail('');
    setError(null);
    setOutcomeAnim(null);
    spinningRef.current = false;
    setSpinning(false);
  }, [game.id, game.engine, game.entryFeeOptions]);

  const playableBalance = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;
  const maxAllowedFee = Math.min(50000, Math.max(10, Math.floor(playableBalance)));
  const quickStakes = [10, 20, 50, 100, 250, 500];

  const potentialWin = useMemo(() => {
    const mult = game.engine === 'slots' ? 2.5 : game.engine === 'mines' ? 2.2 : 1.95;
    return Math.round(entryFee * mult * 100) / 100;
  }, [entryFee, game.engine]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    casinoAudio.setMuted(next);
  };

  const handlePlay = async (overrideChoice?: string) => {
    if (spinningRef.current) return;
    const activeChoice = overrideChoice || choice;
    if (overrideChoice) setChoice(overrideChoice);

    if (entryFee < 10) {
      setError('Minimum stake is ₹10.');
      return;
    }
    if (playableBalance < entryFee) {
      setError('Insufficient balance. Please deposit funds to continue playing.');
      return;
    }

    casinoAudio.unlock();
    spinningRef.current = true;
    setError(null);
    setLastResult(null);
    setVisualDetail('');
    setSpinning(true);

    stageRef.current?.startSpin();

    try {
      const apiPromise = playCasinoGameFirestore(game.id, entryFee, activeChoice);

      // Build suspense with 3D spin before settling to Firestore-transacted outcome
      const [res, stillMounted] = await Promise.all([apiPromise, waitSafe(540)]);
      if (!stillMounted || !mountedRef.current) return;

      const isWin = res.session.outcome === 'win';
      stageRef.current?.settleOutcome(isWin, activeChoice);

      const settleMs = SETTLE_WAIT_MS[game.engine] ?? 1800;
      const aliveAfterSettle = await waitSafe(settleMs);
      if (!aliveAfterSettle || !mountedRef.current) return;

      const detail = stageRef.current?.getVisualDetail() || '';
      setVisualDetail(detail);
      setLastResult(res.session);
      setOutcomeAnim({
        id: Date.now(),
        type: isWin ? 'win' : 'lose',
        amount: res.session.rewardEarned,
        betAmount: res.session.entryFee,
      });

      if (isWin) {
        casinoAudio.playWinFanfare();
      } else {
        casinoAudio.playLossThud();
      }

      await onCompletedRef.current(res.session, res.wallet);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to complete round.');
      }
    } finally {
      spinningRef.current = false;
      if (mountedRef.current) {
        setSpinning(false);
      }
    }
  };

  const actionLabels = ENGINE_ACTION_LABEL[game.engine] || {
    idle: 'Play 3D Round',
    busy: 'Playing...',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pt-safe-top pb-safe overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#0D1B38] border border-blue-500/30 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-[#132957] to-[#0A1630] border-b border-blue-900/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30">
                3D Casino
              </span>
              <span className="text-xs text-slate-300 font-mono-num">
                Balance: {formatINR(playableBalance)}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white truncate mt-0.5">
              {game.name}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? 'Unmute casino sound' : 'Mute casino sound'}
              aria-label={muted ? 'Unmute casino sound' : 'Mute casino sound'}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#071126] hover:bg-blue-950 border border-blue-800/60 flex items-center justify-center text-slate-200 transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-300" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close game"
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#071126] hover:bg-blue-950 border border-blue-800/60 flex items-center justify-center text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Interactive Three.js 3D Casino Stage */}
          <div className="relative">
            <Casino3DStage
              ref={stageRef}
              engine={game.engine}
              onSelectMinesChest={
                game.engine === 'mines'
                  ? (pickedLabel) => {
                      if (!spinningRef.current) {
                        void handlePlay(pickedLabel);
                      }
                    }
                  : undefined
              }
            />

            {/* Floating Result Status Banner over bottom of 3D stage */}
            {lastResult && !spinning && (
              <div
                className={`mt-3 rounded-2xl px-4 py-3 border flex items-center justify-between gap-3 transition-all duration-300 ${
                  lastResult.outcome === 'win'
                    ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-100'
                    : 'bg-rose-500/15 border-rose-400/40 text-rose-100'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {lastResult.outcome === 'win' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold truncate">
                      {lastResult.outcome === 'win'
                        ? `YOU WON ${formatINR(lastResult.rewardEarned)}!`
                        : `Not this round · Stake ${formatINR(lastResult.entryFee)}`}
                    </p>
                    {visualDetail && (
                      <p className="text-xs opacity-90 truncate">{visualDetail}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono-num font-bold shrink-0 px-2.5 py-1 rounded-lg bg-black/25">
                  {lastResult.outcome === 'win'
                    ? `+${formatINR(lastResult.rewardEarned)}`
                    : `-${formatINR(lastResult.entryFee)}`}
                </span>
              </div>
            )}
          </div>

          {/* Choice Selector */}
          {defaultOptions.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold">
                  {game.engine === 'mines'
                    ? 'Pick a Chest (or tap directly in 3D above)'
                    : 'Choose Your Prediction'}
                </span>
                <span className="text-amber-300 font-semibold font-mono-num">
                  Est. Win {formatINR(potentialWin)}
                </span>
              </div>
              <div
                className={`grid gap-2 ${
                  defaultOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-4'
                }`}
              >
                {defaultOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      casinoAudio.unlock();
                      setChoice(opt);
                    }}
                    className={`min-h-[42px] px-2.5 rounded-xl text-xs font-bold border transition-all ${
                      choice === opt
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-inner shadow-amber-500/20'
                        : 'bg-[#071126] border-blue-900/60 text-slate-300 hover:border-blue-500/60'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stake Selector */}
          <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Stake Amount (INR)</span>
              <span className="text-emerald-300 font-bold font-mono-num">
                Payout up to {formatINR(potentialWin)}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {quickStakes.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={spinning}
                  onClick={() => setEntryFee(amt)}
                  className={`min-h-[36px] rounded-xl text-xs font-bold font-mono-num border transition-colors ${
                    entryFee === amt
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-[#0D1B38] border-blue-900/60 text-slate-300 hover:border-blue-500/60'
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  min={10}
                  max={Math.max(10, maxAllowedFee)}
                  step={10}
                  disabled={spinning}
                  value={entryFee}
                  onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value)))}
                  className="w-full min-h-[44px] pl-8 pr-3 rounded-xl bg-[#0D1B38] border border-blue-900/60 text-white font-mono-num font-bold text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <button
                type="button"
                disabled={spinning}
                onClick={() => void handlePlay()}
                className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 shrink-0 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>{spinning ? actionLabels.busy : actionLabels.idle}</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
              <span>{error}</span>
              {playableBalance < entryFee && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDeposit();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold shrink-0"
                >
                  Add Money
                </button>
              )}
            </div>
          )}

          {/* Compact Recent Winners Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="rounded-2xl bg-[#071126] border border-blue-900/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Top Winners · {game.name}
                </span>
                <span className="text-[11px] text-slate-400">Server Verified</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {leaderboard.slice(0, 3).map((row) => (
                  <div
                    key={`${row.rank}-${row.userName}`}
                    className="rounded-xl bg-[#0D1B38] border border-blue-900/40 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Crown
                        className={`w-3.5 h-3.5 shrink-0 ${
                          row.rank === 1
                            ? 'text-amber-400'
                            : row.rank === 2
                              ? 'text-slate-300'
                              : 'text-orange-400'
                        }`}
                      />
                      <span className="text-xs font-semibold text-white truncate">
                        {row.userName}
                      </span>
                    </div>
                    <span className="text-xs font-bold font-mono-num text-emerald-300 shrink-0">
                      {formatINR(row.totalReward)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Win (2.5s) / Loss (1s) Celebration Overlay */}
      <GameOutcomeOverlay
        outcome={outcomeAnim}
        onDone={() => setOutcomeAnim(null)}
      />
    </div>
  );
};
