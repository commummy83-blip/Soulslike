import type { StatusEffectId } from '../game/types';

export const STATUS_ICON_META: Record<
  StatusEffectId,
  { label: string; title: string; ringClass: string }
> = {
  poison: {
    label: 'Poison',
    title: 'Poisoned — losing vitality over time',
    ringClass:
      'bg-[#0f1c14]/95 border-[#3d8c52] shadow-[0_0_8px_rgba(46,184,92,0.35)]',
  },
  frost: {
    label: 'Frost',
    title: 'Frostbitten — stamina recovery and movement slowed',
    ringClass:
      'bg-[#0e1722]/95 border-[#4987bd] shadow-[0_0_8px_rgba(73,135,189,0.35)]',
  },
  bleed: {
    label: 'Bleed',
    title: 'Bleeding — vulnerable to hemorrhage burst',
    ringClass:
      'bg-[#220d0e]/95 border-[#a83232] shadow-[0_0_8px_rgba(201,42,42,0.35)]',
  },
};

function renderStatusGlyph(effect: StatusEffectId, compact: boolean) {
  const glyphClass = compact ? 'w-2.5 h-2.5' : 'w-3 h-3 sm:w-3.5 sm:h-3.5';
  if (effect === 'poison') {
    return (
      <svg viewBox="0 0 16 16" className={glyphClass} aria-hidden="true">
        <path
          d="M8 1.5 C10.4 5.1 12.5 7.4 12.5 10 A4.5 4.5 0 0 1 3.5 10 C3.5 7.4 5.6 5.1 8 1.5 Z"
          fill="#2eb85c"
          stroke="#9cf5b4"
          strokeWidth="1.1"
        />
        <circle cx="6.7" cy="9.8" r="1.1" fill="#d9ffe4" />
      </svg>
    );
  }
  if (effect === 'frost') {
    return (
      <svg viewBox="0 0 16 16" className={glyphClass} aria-hidden="true">
        <path
          d="M8 1.5 L8 14.5 M2.4 4.75 L13.6 11.25 M13.6 4.75 L2.4 11.25"
          stroke="#8ed0ff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="8" r="2" fill="#d9f0ff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className={glyphClass} aria-hidden="true">
      <path
        d="M8 1.5 C10.6 5.4 12.6 7.8 12.6 10.3 A4.6 4.6 0 0 1 3.4 10.3 C3.4 7.8 5.4 5.4 8 1.5 Z"
        fill="#c92a2a"
        stroke="#ff9c9c"
        strokeWidth="1.1"
      />
      <path d="M5.2 12.2 L10.8 6.6" stroke="#ffe0e0" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface StatusEffectIconsProps {
  effects: readonly StatusEffectId[];
  testId?: string;
  compact?: boolean;
}

export function StatusEffectIcons({
  effects,
  testId,
  compact = false,
}: StatusEffectIconsProps) {
  if (!effects || effects.length === 0) return null;
  const sizeClass = compact ? 'w-4 h-4' : 'w-5 h-5 sm:w-7 sm:h-7';

  return (
    <div
      data-testid={testId}
      className="flex items-center gap-1 sm:gap-1.5 self-center"
    >
      {effects.map((effect) => {
        const meta = STATUS_ICON_META[effect];
        if (!meta) return null;
        return (
          <div
            key={effect}
            data-testid={testId === 'status-effects' ? `status-${effect}` : undefined}
            title={meta.title}
            aria-label={meta.label}
            className={`${sizeClass} rounded-full border flex items-center justify-center shrink-0 ${meta.ringClass}`}
          >
            {renderStatusGlyph(effect, compact)}
          </div>
        );
      })}
    </div>
  );
}
