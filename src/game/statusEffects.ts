import type {
  ActiveStatusEffects,
  EnemyArchetype,
  StatusEffectId,
  WeaponKind,
  WeatherMode,
} from './types';

export interface StatusEffectSpec {
  id: StatusEffectId;
  label: string;
  duration: number;
  tickInterval: number;
}

export const STATUS_EFFECT_CONFIG: Record<StatusEffectId, StatusEffectSpec> = {
  poison: {
    id: 'poison',
    label: 'Poison',
    duration: 12,
    tickInterval: 1.0,
  },
  frost: {
    id: 'frost',
    label: 'Frost',
    duration: 10,
    tickInterval: 0,
  },
  bleed: {
    id: 'bleed',
    label: 'Bleed',
    duration: 8,
    tickInterval: 0,
  },
};

export interface StatusEffectTracker {
  durations: Record<StatusEffectId, number>;
  poisonTickAccum: number;
}

export interface CompoundingModifiers {
  activeEffects: StatusEffectId[];
  poisonTickMult: number;
  staminaRegenMult: number;
  moveSpeedMult: number;
  incomingDamageMult: number;
  bleedBurstMult: number;
  compoundLabel: string | null;
}

const ORDERED_STATUSES: readonly StatusEffectId[] = ['poison', 'frost', 'bleed'];

export function createStatusTracker(
  initialEffects: readonly StatusEffectId[] = []
): StatusEffectTracker {
  return {
    durations: {
      poison: initialEffects.includes('poison') ? STATUS_EFFECT_CONFIG.poison.duration : 0,
      frost: initialEffects.includes('frost') ? STATUS_EFFECT_CONFIG.frost.duration : 0,
      bleed: initialEffects.includes('bleed') ? STATUS_EFFECT_CONFIG.bleed.duration : 0,
    },
    poisonTickAccum: 0,
  };
}

export function getActiveStatusList(tracker: StatusEffectTracker): StatusEffectId[] {
  return ORDERED_STATUSES.filter((id) => tracker.durations[id] > 0);
}

export function statusEffectsToFlags(effects: readonly StatusEffectId[]): ActiveStatusEffects {
  return {
    poison: effects.includes('poison'),
    frost: effects.includes('frost'),
    bleed: effects.includes('bleed'),
  };
}

export function getCompoundingModifiers(
  effects: readonly StatusEffectId[]
): CompoundingModifiers {
  const hasPoison = effects.includes('poison');
  const hasFrost = effects.includes('frost');
  const hasBleed = effects.includes('bleed');

  let poisonTickMult = 1.0;
  let staminaRegenMult = hasFrost ? 0.72 : 1.0;
  let moveSpeedMult = hasFrost ? 0.78 : 1.0;
  let incomingDamageMult = 1.0;
  let bleedBurstMult = 1.0;
  let compoundLabel: string | null = null;

  if (hasPoison && hasFrost && hasBleed) {
    poisonTickMult = 1.65;
    staminaRegenMult = 0.6;
    moveSpeedMult = 0.72;
    incomingDamageMult = 1.2;
    bleedBurstMult = 1.5;
    compoundLabel = 'Tri-Calamity';
  } else if (hasPoison && hasBleed) {
    poisonTickMult = 1.45;
    bleedBurstMult = 1.25;
    compoundLabel = 'Septic Wound';
  } else if (hasFrost && hasBleed) {
    incomingDamageMult = 1.15;
    bleedBurstMult = 1.35;
    compoundLabel = 'Brittle Shatter';
  } else if (hasPoison && hasFrost) {
    poisonTickMult = 1.25;
    staminaRegenMult = 0.65;
    incomingDamageMult = 1.08;
    compoundLabel = 'Blighted Chill';
  }

  return {
    activeEffects: ORDERED_STATUSES.filter((id) => effects.includes(id)),
    poisonTickMult,
    staminaRegenMult,
    moveSpeedMult,
    incomingDamageMult,
    bleedBurstMult,
    compoundLabel,
  };
}

export function getPoisonTickPerSecond(maxHp: number, poisonTickMult = 1.0): number {
  return Math.max(2, Math.round(maxHp * 0.018 * poisonTickMult));
}

export function getBleedBurstDamage(maxHp: number, bleedBurstMult = 1.0): number {
  return Math.max(8, Math.round(maxHp * 0.1 * bleedBurstMult));
}

export function getStatusStaminaMultiplier(
  statuses: ActiveStatusEffects | readonly StatusEffectId[]
): number {
  if (Array.isArray(statuses)) {
    return getCompoundingModifiers(statuses).staminaRegenMult;
  }
  const list: StatusEffectId[] = [];
  const flags = statuses as ActiveStatusEffects;
  if (flags.poison) list.push('poison');
  if (flags.frost) list.push('frost');
  if (flags.bleed) list.push('bleed');
  return getCompoundingModifiers(list).staminaRegenMult;
}

export function applyStatusAffliction(
  tracker: StatusEffectTracker,
  effect: StatusEffectId,
  maxHp: number
): {
  tracker: StatusEffectTracker;
  activeEffects: StatusEffectId[];
  triggeredBurstDamage: number;
  newlyApplied: boolean;
  banner: string | null;
} {
  const nextDurations = { ...tracker.durations };
  const currentEffects = getActiveStatusList(tracker);
  const modifiers = getCompoundingModifiers(currentEffects);

  if (effect === 'bleed' && nextDurations.bleed > 0) {
    const burst = getBleedBurstDamage(maxHp, modifiers.bleedBurstMult);
    nextDurations.bleed = 0;
    const nextTracker: StatusEffectTracker = {
      durations: nextDurations,
      poisonTickAccum: tracker.poisonTickAccum,
    };
    const nextActive = getActiveStatusList(nextTracker);
    return {
      tracker: nextTracker,
      activeEffects: nextActive,
      triggeredBurstDamage: burst,
      newlyApplied: false,
      banner: currentEffects.includes('frost') ? 'SHATTERING HEMORRHAGE!' : 'HEMORRHAGE BURST!',
    };
  }

  const wasActive = nextDurations[effect] > 0;
  nextDurations[effect] = STATUS_EFFECT_CONFIG[effect].duration;
  const nextTracker: StatusEffectTracker = {
    durations: nextDurations,
    poisonTickAccum: tracker.poisonTickAccum,
  };
  const nextActive = getActiveStatusList(nextTracker);
  const nextCompound = getCompoundingModifiers(nextActive).compoundLabel;

  let banner: string | null = null;
  if (!wasActive) {
    banner = nextCompound
      ? `${STATUS_EFFECT_CONFIG[effect].label.toUpperCase()} · ${nextCompound.toUpperCase()}`
      : null;
  }

  return {
    tracker: nextTracker,
    activeEffects: nextActive,
    triggeredBurstDamage: 0,
    newlyApplied: !wasActive,
    banner,
  };
}

export function stepStatusTracker(
  tracker: StatusEffectTracker,
  dt: number,
  maxHp: number
): {
  tracker: StatusEffectTracker;
  activeEffects: StatusEffectId[];
  tickDamage: number;
  expiredEffects: StatusEffectId[];
  changed: boolean;
  modifiers: CompoundingModifiers;
} {
  const nextDurations = { ...tracker.durations };
  let poisonTickAccum = tracker.poisonTickAccum;
  let tickDamage = 0;
  const expiredEffects: StatusEffectId[] = [];
  const activeBefore = getActiveStatusList(tracker);
  const modifiers = getCompoundingModifiers(activeBefore);

  if (nextDurations.poison > 0) {
    poisonTickAccum += dt;
    while (poisonTickAccum >= STATUS_EFFECT_CONFIG.poison.tickInterval) {
      poisonTickAccum -= STATUS_EFFECT_CONFIG.poison.tickInterval;
      tickDamage += getPoisonTickPerSecond(maxHp, modifiers.poisonTickMult);
    }
  } else {
    poisonTickAccum = 0;
  }

  for (const id of ORDERED_STATUSES) {
    if (nextDurations[id] > 0) {
      nextDurations[id] = Math.max(0, nextDurations[id] - dt);
      if (nextDurations[id] <= 0) {
        expiredEffects.push(id);
        if (id === 'poison') poisonTickAccum = 0;
      }
    }
  }

  const nextTracker: StatusEffectTracker = {
    durations: nextDurations,
    poisonTickAccum,
  };
  const activeEffects = getActiveStatusList(nextTracker);

  return {
    tracker: nextTracker,
    activeEffects,
    tickDamage,
    expiredEffects,
    changed: expiredEffects.length > 0,
    modifiers: getCompoundingModifiers(activeEffects),
  };
}

export function cleanseStatusEffects(
  tracker: StatusEffectTracker,
  toCleanse: 'all' | readonly StatusEffectId[]
): {
  tracker: StatusEffectTracker;
  activeEffects: StatusEffectId[];
  changed: boolean;
} {
  const before = getActiveStatusList(tracker);
  const nextDurations = { ...tracker.durations };
  let poisonTickAccum = tracker.poisonTickAccum;

  if (toCleanse === 'all') {
    nextDurations.poison = 0;
    nextDurations.frost = 0;
    nextDurations.bleed = 0;
    poisonTickAccum = 0;
  } else {
    for (const id of toCleanse) {
      nextDurations[id] = 0;
      if (id === 'poison') poisonTickAccum = 0;
    }
  }

  const nextTracker: StatusEffectTracker = { durations: nextDurations, poisonTickAccum };
  const activeEffects = getActiveStatusList(nextTracker);
  return {
    tracker: nextTracker,
    activeEffects,
    changed: activeEffects.length !== before.length,
  };
}

export function resolveEnvironmentalStatus(
  zoneName: string,
  weather: WeatherMode
): StatusEffectId | null {
  if (zoneName === 'Hollow Woods' && weather === 'mist') {
    return 'poison';
  }
  if (zoneName === 'Shattered Bridge' && weather === 'ash_storm') {
    return 'frost';
  }
  return null;
}

export function resolveEnemyAttackStatus(archetype: EnemyArchetype): StatusEffectId | null {
  if (archetype === 'grave_hound') return 'bleed';
  if (archetype === 'ash_caster' || archetype === 'hollow_footman') return 'poison';
  if (archetype === 'iron_bulwark' || archetype === 'cinder_warden') return 'frost';
  return null;
}

export function resolvePlayerWeaponStatus(
  weaponKind: WeaponKind,
  isHeavy: boolean,
  emberBuffActive: boolean
): StatusEffectId | null {
  if (weaponKind === 'daggers') return 'bleed';
  if (weaponKind === 'halberd' && isHeavy) return 'frost';
  if (emberBuffActive && isHeavy) return 'poison';
  return null;
}

export function calculateActiveStatusEffects(params: {
  currentEffects: readonly StatusEffectId[];
  zoneName: string;
  weather: WeatherMode;
  incomingAttackArchetype?: EnemyArchetype | null;
  isBlockedOrEvaded?: boolean;
}): StatusEffectId[] {
  const next = new Set<StatusEffectId>(params.currentEffects);

  const envStatus = resolveEnvironmentalStatus(params.zoneName, params.weather);
  if (envStatus) next.add(envStatus);

  if (params.incomingAttackArchetype && !params.isBlockedOrEvaded) {
    const atkStatus = resolveEnemyAttackStatus(params.incomingAttackArchetype);
    if (atkStatus) next.add(atkStatus);
  }

  return ORDERED_STATUSES.filter((id) => next.has(id));
}
