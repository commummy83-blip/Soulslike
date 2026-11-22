import type { GameSettings } from '../game/types';

interface TitleScreenProps {
  hasSave: boolean;
  onStartNew: () => void;
  onContinue: () => void;
  onOpenSettings: () => void;
  settings: GameSettings;
  isTouchActive?: boolean;
}

export function TitleScreen({
  hasSave,
  onStartNew,
  onContinue,
  onOpenSettings,
  isTouchActive = false,
}: TitleScreenProps) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-12 pointer-events-none">
      {/* Subtle left-side readability vignette over live 3D Sanctum vista */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(10,9,8,0.86) 0%, rgba(10,9,8,0.48) 44%, rgba(10,9,8,0.12) 100%)',
        }}
      />

      {/* Top-Left Title Emblem & Menu Actions */}
      <div className="relative z-10 max-w-md pt-4 md:pt-8 pointer-events-auto">
        {/* Bespoke Forged Iron & Cinder Gold Title Crest SVG */}
        <svg
          viewBox="0 0 420 118"
          className="w-full max-w-[380px] mb-5 drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]"
          role="img"
          aria-label="Ashenveil — Cinder of the Shattered Keep"
        >
          <defs>
            <linearGradient id="cinderGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f3d299" />
              <stop offset="55%" stopColor="#c4944e" />
              <stop offset="100%" stopColor="#7a5323" />
            </linearGradient>
          </defs>
          {/* Coiled Sword & Crest Sigil */}
          <g transform="translate(22, 16)">
            <polygon
              points="18,0 36,24 18,86 0,24"
              fill="#191614"
              stroke="#9c7a44"
              strokeWidth="2"
            />
            <path d="M18 8 L18 76" stroke="url(#cinderGold)" strokeWidth="2.5" />
            <path d="M9 26 L27 26" stroke="url(#cinderGold)" strokeWidth="2.5" />
            <circle cx="18" cy="26" r="4" fill="#e06d2b" />
          </g>
          {/* Title Lettering */}
          <text
            x="76"
            y="62"
            fill="url(#cinderGold)"
            fontFamily="Palatino Linotype, Book Antiqua, Georgia, serif"
            fontSize="44"
            fontWeight="700"
            letterSpacing="6"
          >
            ASHENVEIL
          </text>
          <line x1="76" y1="74" x2="398" y2="74" stroke="#856537" strokeWidth="1.2" />
          <text
            x="78"
            y="95"
            fill="#bfb29f"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="600"
            letterSpacing="3.8"
          >
            CHRONICLES OF THE SHATTERED KEEP
          </text>
        </svg>

        <div className="flex flex-col gap-3 max-w-[290px]">
          {hasSave ? (
            <>
              <button
                type="button"
                data-start="true"
                onClick={onContinue}
                className="w-full py-3.5 px-6 text-left font-display text-base tracking-[0.18em] uppercase bg-[#1a1612]/95 hover:bg-[#2a2219] text-[#f2dec0] border border-[#b58b4c] transition-colors cursor-pointer shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
              >
                Continue Pilgrimage
              </button>
              <button
                type="button"
                onClick={onStartNew}
                className="w-full py-3 px-6 text-left font-display text-sm tracking-[0.16em] uppercase bg-[#12100e]/90 hover:bg-[#1e1a16] text-[#c7baa5] border border-[#5e4d37] transition-colors cursor-pointer"
              >
                New Covenant
              </button>
            </>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onStartNew}
              className="w-full py-3.5 px-6 text-left font-display text-base tracking-[0.18em] uppercase bg-[#1a1612]/95 hover:bg-[#2a2219] text-[#f2dec0] border border-[#b58b4c] transition-colors cursor-pointer shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
            >
              Enter the Veil
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full py-2.5 px-6 text-left font-display text-xs tracking-[0.18em] uppercase bg-[#100e0c]/85 hover:bg-[#1b1714] text-[#9e917d] border border-[#3e3427] transition-colors cursor-pointer"
          >
            Settings & Controls
          </button>
        </div>
      </div>

      {/* Bottom Safe-Margin Single Flat Control Hint Line */}
      <div className="relative z-10 text-[11px] sm:text-xs tracking-[0.12em] sm:tracking-[0.14em] uppercase text-[#a89a84] hud-text-stroke">
        {isTouchActive
          ? 'Left Analog Stick Move (Rim = Sprint) · Drag Right Camera · Tap Action Cluster'
          : 'WASD Move · LMB / J Light · Shift+LMB / K Heavy · RMB / L Guard & Parry · Space Roll · Q Lock-On · F Flask · E Interact'}
      </div>
    </div>
  );
}
