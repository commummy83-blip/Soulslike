import type { LiveHudSnapshot } from '../game/types';
import { StatusEffectIcons } from './StatusEffectIcons';

type LockedTarget = NonNullable<LiveHudSnapshot['lockedTarget']>;

interface LockOnReticleProps {
  target: LockedTarget;
}

export function LockOnReticle({ target }: LockOnReticleProps) {
  const hpPct = Math.max(0, Math.min(100, (target.hp / Math.max(1, target.maxHp)) * 100));
  const bracketColor = target.staggered ? '#fbbf24' : '#f5efe6';
  const coreColor = target.staggered ? '#fbbf24' : '#e0533c';

  return (
    <div
      data-testid="lock-on-reticle"
      data-target-name={target.name}
      data-staggered={target.staggered ? '1' : '0'}
      className="fixed -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
      style={{
        left: `${target.screenX}px`,
        top: `${target.screenY}px`,
      }}
    >
      {/* Target Name, Health Bar & Status Icons Anchored Above Diamond Bracket */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 flex flex-col items-center gap-1 whitespace-nowrap">
        <div
          className={`text-[10px] uppercase tracking-[0.14em] hud-text-stroke ${
            target.staggered ? 'text-[#fbbf24] font-semibold' : 'text-[#f2e4cc]'
          }`}
        >
          {target.name}
          {target.staggered ? ' · RIPOSTE' : ''}
        </div>
        <div className="w-24 h-1.5 bg-[#12100e]/95 border border-[#735c3e]">
          <div
            className="h-full bg-[#b83227] transition-[width] duration-100"
            style={{ width: `${hpPct}%` }}
          />
        </div>
        {target.statusEffects && target.statusEffects.length > 0 && (
          <StatusEffectIcons effects={target.statusEffects} compact />
        )}
      </div>

      {/* Diamond Bracket with Initial Engage Snap & Subtle Engagement Scale Animation */}
      <div className="animate-lockon-engage flex items-center justify-center">
        <div
          className={
            target.staggered ? 'animate-lockon-breathe-fast' : 'animate-lockon-breathe'
          }
        >
          <svg
            viewBox="0 0 40 40"
            className="w-10 h-10 overflow-visible"
            aria-hidden="true"
          >
            {/* Dark backing stroke for contrast over bright combat particles */}
            <g
              fill="none"
              stroke="#090807"
              strokeWidth="4.2"
              strokeLinecap="square"
              strokeLinejoin="miter"
              opacity="0.9"
            >
              <path d="M 14 9 L 20 3 L 26 9" />
              <path d="M 31 14 L 37 20 L 31 26" />
              <path d="M 26 31 L 20 37 L 14 31" />
              <path d="M 9 26 L 3 20 L 9 14" />
            </g>

            {/* Primary 4-corner diamond bracket */}
            <g
              fill="none"
              stroke={bracketColor}
              strokeWidth="2.1"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <path d="M 14 9 L 20 3 L 26 9" />
              <path d="M 31 14 L 37 20 L 31 26" />
              <path d="M 26 31 L 20 37 L 14 31" />
              <path d="M 9 26 L 3 20 L 9 14" />
            </g>

            {/* Center engagement diamond pip */}
            <polygon
              points="20,15.5 24.5,20 20,24.5 15.5,20"
              fill={coreColor}
              stroke="#090807"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
