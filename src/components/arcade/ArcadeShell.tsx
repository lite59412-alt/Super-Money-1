import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  Coins,
  PlusCircle,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import {
  arcadePayoutFirestore,
  arcadeWagerFirestore,
  formatINR,
} from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import type { WalletSummary } from '../../types';
import { GameOutcomeOverlay, type GameOutcomeEvent } from './GameOutcomeOverlay';
import { LivePlayingBadge } from './LivePlayingBadge';

export interface ArcadeGameCommonProps {
  gameId: string;
  gameName: string;
  wallet: WalletSummary;
  onlinePlayers: number;
  winRatio?: number;
  onBack: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onWalletUpdated: (wallet: WalletSummary) => void;
}

export async function arcadeWager(
  gameId: string,
  gameName: string,
  amount: number
): Promise<WalletSummary> {
  return arcadeWagerFirestore(gameId, gameName, amount);
}

type ArcadeOutcomeListener = (event: GameOutcomeEvent & { gameId: string }) => void;
const outcomeListeners = new Set<ArcadeOutcomeListener>();
let nextOutcomeId = 1;

function emitArcadeOutcome(
  gameId: string,
  type: 'win' | 'lose',
  amount: number,
  betAmount: number
): void {
  const payload = {
    id: nextOutcomeId++,
    gameId,
    type,
    amount,
    betAmount,
  };
  for (const listener of outcomeListeners) {
    listener(payload);
  }
}

export async function arcadePayout(
  gameId: string,
  gameName: string,
  betAmount: number,
  winAmount: number,
  detail: string
): Promise<WalletSummary> {
  // Trigger celebratory win or 1-second loss animation immediately without network lag
  emitArcadeOutcome(gameId, winAmount > 0 ? 'win' : 'lose', winAmount, betAmount);

  return arcadePayoutFirestore(gameId, gameName, betAmount, winAmount, detail);
}

export const ArcadeShell: React.FC<{
  gameId: string;
  title: string;
  wallet: WalletSummary;
  onlinePlayers: number;
  onBack: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onWalletUpdated: (wallet: WalletSummary) => void;
  children: React.ReactNode;
}> = ({
  gameId,
  title,
  wallet,
  onBack,
  onOpenDeposit,
  onOpenWithdraw,
  children,
}) => {
  const [muted, setMuted] = useState<boolean>(() => casinoAudio.isMuted());
  const [activeOutcome, setActiveOutcome] = useState<GameOutcomeEvent | null>(null);

  useEffect(() => {
    const listener: ArcadeOutcomeListener = (ev) => {
      if (ev.gameId !== gameId) return;
      setActiveOutcome({
        id: ev.id,
        type: ev.type,
        amount: ev.amount,
        betAmount: ev.betAmount,
      });
    };
    outcomeListeners.add(listener);
    return () => {
      outcomeListeners.delete(listener);
    };
  }, [gameId]);

  const handleClearOutcome = useCallback(() => {
    setActiveOutcome(null);
  }, []);

  const playableBalance = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    casinoAudio.setMuted(next);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080A10] text-white flex flex-col overflow-hidden select-none">
      {/* Top Dark Header with Android Status-Bar Safe Area, Back, Title & Balance */}
      <header className="pt-safe-top shrink-0 bg-gradient-to-b from-[#240B0A] to-[#130607] border-b border-amber-500/20 px-2 sm:px-4 z-30">
        <div className="h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              casinoAudio.playButtonClick();
              onBack();
            }}
            aria-label="Back to Lobby"
            className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white truncate">
                {title}
              </h1>
              <LivePlayingBadge gameId={gameId} compact />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono-num text-amber-300 font-bold">
              <span>Balance {formatINR(playableBalance)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="min-h-[38px] min-w-[38px] rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-amber-200"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              casinoAudio.playButtonClick();
              onOpenWithdraw();
            }}
            className="hidden sm:inline-flex items-center gap-1 min-h-[38px] px-2.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 text-amber-200 text-xs font-bold"
          >
            <Wallet className="w-3.5 h-3.5 text-amber-300" />
            <span>Withdraw</span>
          </button>

          <button
            type="button"
            onClick={() => {
              casinoAudio.playButtonClick();
              onOpenDeposit();
            }}
            className="inline-flex items-center gap-1 min-h-[38px] px-2.5 rounded-xl bg-gradient-to-b from-amber-400 to-orange-500 text-slate-950 text-xs font-extrabold shadow active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Add</span>
            <Coins className="w-3.5 h-3.5 xs:hidden" />
          </button>
        </div>
        </div>
      </header>

      {/* Main Responsive Full-Viewport Stage */}
      <div className="flex-1 min-h-0 overflow-y-auto flex justify-center bg-[#07090F] pb-safe">
        <div className="w-full max-w-[520px] min-h-full flex flex-col relative shadow-2xl">
          {children}
        </div>
      </div>

      {/* Celebratory Win Amount & 1-Second Loss Overlay */}
      <GameOutcomeOverlay outcome={activeOutcome} onDone={handleClearOutcome} />
    </div>
  );
};
