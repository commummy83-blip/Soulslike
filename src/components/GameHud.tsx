import { Backpack, Pause, Volume2, VolumeX } from 'lucide-react';
import { WEAPONS } from '../game/data';
import type {
  GameSettings,
  LiveHudSnapshot,
  QuestState,
  SaveState,
} from '../game/types';
import type { VirtualInputState } from '../game3d/GameEngine';
import { BossHealthBar } from './BossHealthBar';
import { LockOnReticle } from './LockOnReticle';
import { MobileControls } from './MobileControls';
import { StatusEffectIcons } from './StatusEffectIcons';

interface GameHudProps {
  hud: LiveHudSnapshot;
  save: SaveState;
  settings: GameSettings;
  isTouchActive: boolean;
  virtualInputRef: React.MutableRefObject<VirtualInputState | null>;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onOpenCharacterMenu: () => void;
  onUseConsumable: (id: 'ash_resin' | 'green_blossom') => void;
}

export function GameHud({
  hud,
  save,
  settings,
  isTouchActive,
  virtualInputRef,
  onToggleMute,
  onOpenPause,
  onOpenCharacterMenu,
  onUseConsumable,
}: GameHudProps) {
  const weapon = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
  const weaponLvl = save.weaponLevels[weapon.id] ?? 0;
  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const hpGhostPct = Math.max(hpPct, Math.min(100, (hud.hpGhost / Math.max(1, hud.maxHp)) * 100));
  const stamPct = Math.max(0, Math.min(100, (hud.stamina / Math.max(1, hud.maxStamina)) * 100));

  const activeQuest: QuestState | undefined = save.quests.find((q) => !q.claimed);
  const statusEffects = hud.statusEffects ?? [];
  const iframeIntensity = Math.max(0, Math.min(1, hud.iframeIntensity ?? 0));
  const staggerIntensity = Math.max(0, Math.min(1, hud.staggerFlashIntensity ?? 0));
  const staggerCurve = Math.pow(staggerIntensity, 0.72);

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none"
      data-iframe-fx={iframeIntensity > 0.02 ? 'active' : 'idle'}
      data-staggered={hud.isStaggered ? '1' : '0'}
    >
      {/* Low-HP crimson peripheral edge vignette */}
      {hpPct <= 30 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 110px rgba(155, 24, 24, 0.62)',
          }}
        />
      )}

      {/* Poise-break / stagger screen-space perimeter vignette flash */}
      {staggerIntensity > 0.02 && (
        <div
          data-testid="poise-break-vignette"
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: staggerCurve,
            background:
              'radial-gradient(ellipse at center, transparent 42%, rgba(153, 27, 27, 0.42) 76%, rgba(234, 88, 12, 0.68) 100%)',
            boxShadow: `inset 0 0 ${Math.round(95 + 75 * staggerIntensity)}px rgba(220, 38, 38, ${(
              0.78 * staggerCurve
            ).toFixed(3)})`,
          }}
        />
      )}

      {/* TOP PERIMETER HUD BAR (Zero overlap at 390px mobile and 1440px desktop) */}
      <div className="absolute top-3 left-3 right-3 sm:top-5 sm:left-6 sm:right-6 flex items-start justify-between gap-2">
        {/* TOP-LEFT CORNER: Vitality, Stamina, Flask & Weapon Cluster */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Code-Authored Sanctum Flask SVG Emblem */}
            <div className="relative w-10 h-12 sm:w-12 sm:h-14 shrink-0 flex items-center justify-center bg-[#12100e]/90 border border-[#735938] shadow-[0_3px_10px_rgba(0,0,0,0.85)]">
              <svg viewBox="0 0 36 44" className="w-7 h-9 sm:w-8 sm:h-10">
                <path
                  d="M14 4 L22 4 L21 11 L29 19 L27 38 L9 38 L7 19 L15 11 Z"
                  fill="#1a1714"
                  stroke="#b0894f"
                  strokeWidth="2"
                />
                {hud.estusCharges > 0 && (
                  <path
                    d="M10 23 L26 23 L25 36 L11 36 Z"
                    fill="#eb8c2d"
                  />
                )}
                <rect x="13" y="2" width="10" height="4" fill="#8f6c3a" />
              </svg>
              <span className="absolute bottom-0.5 right-1 text-[11px] sm:text-xs font-bold tabular-nums text-[#f7dca8] hud-text-stroke">
                {hud.estusCharges}
              </span>
            </div>

            {/* HP & Stamina Bars with Delayed Ghost Trail */}
            <div className="w-[126px] sm:w-[235px] flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-1 text-[10px] sm:text-[11px] uppercase tracking-[0.1em] sm:tracking-[0.14em] text-[#cfc2ad] hud-text-stroke">
                <span className="truncate">{hud.zoneName}</span>
                <span className="tabular-nums font-semibold shrink-0">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
              {/* Health Bar */}
              <div className="h-3 sm:h-3.5 w-full bg-[#131110]/95 border border-[#6e5638] relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[#d98c3f]/75 transition-all duration-150"
                  style={{ width: `${hpGhostPct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-[#9e2424]"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              {/* Stamina Bar */}
              <div className="h-2 sm:h-2.5 w-[86%] bg-[#131110]/95 border border-[#4c4232] relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[#4b7d42]"
                  style={{ width: `${stamPct}%` }}
                />
              </div>
            </div>

            {/* Circular Status Effect Icons Next to Health Bar */}
            <StatusEffectIcons effects={statusEffects} testId="status-effects" />
          </div>

          {/* Equipped Weapon & Quick Resin/Moss Badges */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px] tracking-[0.06em] sm:tracking-[0.08em] uppercase pointer-events-auto">
            <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 whitespace-nowrap bg-[#12100e]/90 border border-[#544430] text-[#dfd1ba]">
              {weapon.name} {weaponLvl > 0 ? `+${weaponLvl}` : ''}
              {hud.activeBuffTimer > 0 && (
                <span className="ml-1.5 text-[#f59e0b] tabular-nums">
                  ({Math.ceil(hud.activeBuffTimer)}s)
                </span>
              )}
            </div>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onUseConsumable('ash_resin');
              }}
              className="px-2 py-0.5 sm:py-1 whitespace-nowrap bg-[#14110f]/90 hover:bg-[#261f18] border border-[#5e472d] text-[#e5a95e] tabular-nums cursor-pointer"
              title="Use Cinder Pine Resin [1]"
            >
              [1] Resin x{save.consumables.ash_resin ?? 0}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onUseConsumable('green_blossom');
              }}
              className="px-2 py-0.5 sm:py-1 whitespace-nowrap bg-[#14110f]/90 hover:bg-[#261f18] border border-[#46593d] text-[#97c986] tabular-nums cursor-pointer"
              title="Use Pale Moss Draught [2]"
            >
              [2] Moss x{save.consumables.green_blossom ?? 0}
            </button>
          </div>
        </div>

        {/* TOP-RIGHT CORNER: Souls Counter, Active Quest Clue & Utility Buttons */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex flex-col-reverse sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <div className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-[#12100e]/90 border border-[#6e5638] flex items-center gap-2 whitespace-nowrap">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#9e8e74]">
                LVL <strong className="text-[#e6d5b8] tabular-nums">{hud.level}</strong>
              </span>
              <span className="text-[#5e4c36]">|</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#9e8e74]">
                SOULS{' '}
                <strong className="text-xs sm:text-sm text-[#f2cf88] tabular-nums">{hud.souls}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                tabIndex={-1}
                aria-label="Character & Inventory [Tab]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenCharacterMenu();
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-[#12100e]/90 hover:bg-[#251f18] border border-[#6e5638] text-[#e6d5b8] cursor-pointer"
              >
                <Backpack className="w-4 h-4" />
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-[#12100e]/90 hover:bg-[#251f18] border border-[#6e5638] text-[#e6d5b8] cursor-pointer"
              >
                {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Menu [Esc]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenPause();
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-[#12100e]/90 hover:bg-[#251f18] border border-[#6e5638] text-[#e6d5b8] cursor-pointer"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Minimal Active Objective Tracker */}
          {activeQuest && (
            <div className="hidden sm:block [@media(max-height:500px)]:hidden max-w-[250px] px-3 py-1.5 bg-[#110f0d]/85 border-r-2 border-[#b0894f] text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#c79d58]">
                {activeQuest.completed ? 'Quest Ready to Claim' : activeQuest.locationName}
              </div>
              <div className="text-xs text-[#e2d7c5] font-medium truncate">{activeQuest.title}</div>
              <div className="text-[11px] text-[#9c8e78] tabular-nums">
                Progress {activeQuest.progress}/{activeQuest.targetCount}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LOCK-ON DIAMOND BRACKET RETICLE & MINI BAR */}
      {hud.lockedTarget && hud.lockedTarget.visible && (
        <LockOnReticle
          key={hud.lockedTarget.id ?? hud.lockedTarget.name}
          target={hud.lockedTarget}
        />
      )}

      {/* TRANSIENT BANNER (Boss / Quest / Stagger / Bonfire) */}
      {hud.statusBanner && (
        <div className="absolute top-[22%] [@media(max-height:500px)]:top-[106px] left-1/2 -translate-x-1/2 max-w-[88vw] [@media(max-height:500px)]:max-w-[54vw] px-4 sm:px-8 [@media(max-height:500px)]:py-1 py-1.5 sm:py-2.5 bg-[#0e0c0a]/88 border-y border-[#b88b4a] text-center">
          <div className="font-display text-xs sm:text-sm md:text-lg [@media(max-height:500px)]:text-xs tracking-[0.16em] sm:tracking-[0.22em] text-[#f2d69f] uppercase hud-text-stroke">
            {hud.statusBanner}
          </div>
        </div>
      )}

      {/* INTERACTION PROMPT (Desktop Keyboard Hint) */}
      {!isTouchActive && hud.interactionPrompt && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 px-5 py-2 bg-[#14110e]/92 border border-[#a88248] text-center">
          <div className="text-xs font-semibold tracking-[0.14em] uppercase text-[#f5dfb3]">
            [E] {hud.interactionPrompt.label}
          </div>
          <div className="text-[11px] text-[#a3947e]">{hud.interactionPrompt.sublabel}</div>
        </div>
      )}

      {/* SPECIALIZED BOSS HEALTH BAR (Bottom Center) */}
      {hud.bossTarget && <BossHealthBar boss={hud.bossTarget} isTouchActive={isTouchActive} />}

      {/* MOBILE / TOUCHSCREEN ONSCREEN ANALOG CONTROLLER & COMBAT DECK */}
      {isTouchActive && <MobileControls hud={hud} virtualInputRef={virtualInputRef} />}
    </div>
  );
}
