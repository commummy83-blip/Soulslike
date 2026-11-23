import type { EndRunSnapshot } from '../game/types';

interface EndModalProps {
  mode: 'paused' | 'gameover';
  endSnapshot: EndRunSnapshot | null;
  deaths: number;
  onResume: () => void;
  onRespawnAtBonfire: () => void;
  onOpenCharacter: () => void;
  onOpenSettings: () => void;
  onReturnTitle: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function EndModal({
  mode,
  endSnapshot,
  deaths,
  onResume,
  onRespawnAtBonfire,
  onOpenCharacter,
  onOpenSettings,
  onReturnTitle,
}: EndModalProps) {
  if (mode === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090807]/82 p-4">
        <div
          role="dialog"
          aria-label="Game Paused"
          className="w-full max-w-sm bg-[#14110f] border border-[#8a6c42] p-7 shadow-[0_18px_48px_rgba(0,0,0,0.9)]"
        >
          <h2 className="font-display text-2xl tracking-[0.22em] text-center text-[#eed4a5] uppercase mb-6">
            Pilgrimage Paused
          </h2>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-4 font-display text-sm tracking-[0.16em] uppercase bg-[#261f17] hover:bg-[#362b1f] text-[#f5e1be] border border-[#b58b4c] cursor-pointer"
            >
              Resume [Esc]
            </button>
            <button
              type="button"
              onClick={onOpenCharacter}
              className="w-full py-2.5 px-4 text-xs tracking-[0.15em] uppercase bg-[#1a1613] hover:bg-[#241e19] text-[#d6c7b2] border border-[#594833] cursor-pointer"
            >
              Character · Gear · Quests
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full py-2.5 px-4 text-xs tracking-[0.15em] uppercase bg-[#1a1613] hover:bg-[#241e19] text-[#d6c7b2] border border-[#594833] cursor-pointer"
            >
              Settings & Controls
            </button>
            <button
              type="button"
              onClick={onRespawnAtBonfire}
              className="w-full py-2.5 px-4 text-xs tracking-[0.15em] uppercase bg-[#1a1613] hover:bg-[#241e19] text-[#d6c7b2] border border-[#594833] cursor-pointer"
            >
              Return to Sanctum Bonfire
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 px-4 text-xs tracking-[0.15em] uppercase bg-[#120f0d] hover:bg-[#1c1714] text-[#9e8f7a] border border-[#3d3224] cursor-pointer"
            >
              Save & Exit to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVictory = endSnapshot?.outcome === 'victory';
  const totalAttempts = isVictory ? deaths + 1 : Math.max(1, deaths);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#080706]/86 p-4">
      <div
        role="dialog"
        aria-label={isVictory ? 'Victory' : 'You Died'}
        className="w-full max-w-lg bg-[#14110f] border border-[#8c6d41] p-7 sm:p-8 text-center shadow-[0_20px_54px_rgba(0,0,0,0.92)]"
      >
        <h2
          className={`font-display text-3xl tracking-[0.24em] uppercase mb-2 ${
            isVictory ? 'text-[#f2cf88]' : 'text-[#b5332d]'
          }`}
        >
          {isVictory ? 'Heir of Ash Felled' : 'You Died'}
        </h2>
        <p className="text-xs uppercase tracking-[0.16em] text-[#9e907b] mb-6">
          {isVictory
            ? 'The Cinder Cathedral falls silent beneath your blade.'
            : 'Your embers fade, yet the Sanctum Bonfire calls you back.'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7 text-left">
          {endSnapshot && (
            <>
              <div className="p-3 bg-[#1b1714] border border-[#4a3c2a]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#968772]">Time</div>
                <div className="text-lg font-bold tabular-nums text-[#efe0c6]">
                  {formatDuration(endSnapshot.clearTimeSeconds)}
                </div>
              </div>
              <div className="p-3 bg-[#1b1714] border border-[#4a3c2a]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#968772]">Slain</div>
                <div className="text-lg font-bold tabular-nums text-[#efe0c6]">
                  {endSnapshot.enemiesSlain}
                </div>
              </div>
              <div className="p-3 bg-[#1b1714] border border-[#4a3c2a]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#968772]">
                  {isVictory ? 'Souls' : 'Boss HP'}
                </div>
                <div className="text-lg font-bold tabular-nums text-[#f2cf88]">
                  {isVictory ? endSnapshot.soulsHeld : `${endSnapshot.bossHpRemainingPercent}%`}
                </div>
              </div>
            </>
          )}
          <div
            data-testid="death-counter"
            className={`p-3 bg-[#1b1714] border border-[#4a3c2a] ${
              endSnapshot ? '' : 'col-span-2 sm:col-span-4'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#968772]">Deaths</div>
            <div
              data-testid="death-count-value"
              className={`text-lg font-bold tabular-nums ${
                isVictory ? 'text-[#efe0c6]' : 'text-[#e05a52]'
              }`}
            >
              {deaths}
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[#8a7c68] mt-0.5">
              Attempt #{totalAttempts}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onRespawnAtBonfire}
            className="w-full py-3.5 px-5 font-display text-sm tracking-[0.18em] uppercase bg-[#261f17] hover:bg-[#362b1f] text-[#f5e1be] border border-[#b58b4c] cursor-pointer"
          >
            {isVictory ? 'Continue Exploring Ashenveil' : 'Awaken at Bonfire'}
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2.5 px-5 text-xs tracking-[0.16em] uppercase bg-[#13100e] hover:bg-[#1d1814] text-[#a3947d] border border-[#45392a] cursor-pointer"
          >
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
}
