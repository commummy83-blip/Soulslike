import {
  ARMORS,
  QUEST_TEMPLATES,
  RINGS,
  SKILL_TREE,
  WEAPONS,
} from './data';
import type {
  EnemyArchetype,
  PlayerAttributes,
  QuestState,
  SaveState,
} from './types';
export {
  calculateActiveStatusEffects,
  getBleedBurstDamage,
  getPoisonTickPerSecond,
  getStatusStaminaMultiplier,
  statusEffectsToFlags,
} from './statusEffects';

export interface DerivedPlayerStats {
  maxHp: number;
  maxStamina: number;
  staminaRegenPerSec: number;
  maxPoise: number;
  defense: number;
  guardStability: number;
  estusMax: number;
  critBonus: number;
  damageMultiplier: number;
  lightDamage: number;
  heavyDamage: number;
}

export function getSkillBonuses(unlockedSkills: string[]) {
  let hpPercent = 0;
  let staminaPercent = 0;
  let damagePercent = 0;
  let critBonus = 0;
  let guardStability = 0;
  let estusBonus = 0;

  for (const id of unlockedSkills) {
    const node = SKILL_TREE.find((s) => s.id === id);
    if (!node) continue;
    hpPercent += node.bonuses.hpPercent ?? 0;
    staminaPercent += node.bonuses.staminaPercent ?? 0;
    damagePercent += node.bonuses.damagePercent ?? 0;
    critBonus += node.bonuses.critBonus ?? 0;
    guardStability += node.bonuses.guardStability ?? 0;
    estusBonus += node.bonuses.estusBonus ?? 0;
  }

  return {
    hpPercent,
    staminaPercent,
    damagePercent,
    critBonus,
    guardStability,
    estusBonus,
  };
}

export function computeDerivedStats(save: SaveState): DerivedPlayerStats {
  const weapon = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
  const weaponLevel = save.weaponLevels[weapon.id] ?? 0;
  const armor = ARMORS[save.equippedArmorId] ?? ARMORS.ashen_plate;
  const ring = RINGS[save.equippedRingId] ?? RINGS.none;
  const skills = getSkillBonuses(save.unlockedSkills);

  const baseHp = 110 + (save.attributes.vigor - 10) * 14 + ring.hpBonus;
  const maxHp = Math.round(baseHp * (1 + skills.hpPercent));

  const baseStamina = 85 + (save.attributes.endurance - 10) * 7 + ring.staminaBonus;
  const maxStamina = Math.round(baseStamina * (1 + skills.staminaPercent));

  const staminaRegenPerSec = Math.round(28 * armor.staminaRegenMod);
  const maxPoise = 30 + armor.poiseBonus + Math.floor((save.attributes.endurance - 10) * 1.5);
  const defense = armor.defense + ring.defenseBonus + Math.floor((save.attributes.vigor - 10) * 0.6);

  const upgradeMult = 1 + weaponLevel * 0.14;
  const attrBonus =
    (save.attributes.strength - 10) * weapon.strScaling * 2.4 +
    (save.attributes.dexterity - 10) * weapon.dexScaling * 2.4 +
    (save.attributes.arcane - 10) * 0.9;

  const totalDamageMult = ring.damageMultiplier * (1 + skills.damagePercent);
  const rawBase = (weapon.baseDamage * upgradeMult + attrBonus) * totalDamageMult;

  return {
    maxHp,
    maxStamina,
    staminaRegenPerSec,
    maxPoise,
    defense,
    guardStability: Math.min(0.88, 0.58 + skills.guardStability),
    estusMax: save.estusMax + skills.estusBonus,
    critBonus: skills.critBonus,
    damageMultiplier: totalDamageMult,
    lightDamage: Math.max(10, Math.round(rawBase)),
    heavyDamage: Math.max(16, Math.round(rawBase * 1.58)),
  };
}

export interface AttackCalculationInput {
  baseDamage: number;
  comboStep: number; // 1, 2, 3
  isHeavy: boolean;
  isCrit: boolean;
  critMultiplier: number;
  emberBuffActive: boolean;
  targetDefense?: number;
}

export const HEAVY_HITSTOP_SECONDS = 0.05;
export const LIGHT_HITSTOP_SECONDS = 0.025;
export const PARRY_HITSTOP_SECONDS = 0.07;
export const STAGGER_FLASH_DURATION = 0.48;

export function calculateIncomingPoiseDamage(
  rawDamage: number,
  isHeavyAttack: boolean
): number {
  return Math.max(10, Math.round(rawDamage * (isHeavyAttack ? 0.95 : 0.65)));
}

export function getAttackHitstopSeconds(params: {
  source: 'player' | 'boss' | 'enemy';
  isHeavy: boolean;
  isCrit?: boolean;
  outcome?: 'hit' | 'blocked' | 'guard_broken' | 'parried' | 'evaded';
}): number {
  if (params.outcome === 'evaded') return 0;
  if (params.outcome === 'parried') return PARRY_HITSTOP_SECONDS;
  if (params.source === 'player') {
    return params.isHeavy || params.isCrit ? HEAVY_HITSTOP_SECONDS : LIGHT_HITSTOP_SECONDS;
  }
  if (params.source === 'boss') {
    if (params.isHeavy) return HEAVY_HITSTOP_SECONDS;
    return params.outcome === 'blocked' ? 0 : 0.035;
  }
  return params.outcome === 'blocked' ? 0 : 0.03;
}

export function calculateAttackDamage(input: AttackCalculationInput): number {
  const comboMult = input.comboStep <= 1 ? 1.0 : input.comboStep === 2 ? 1.12 : 1.28;
  const buffMult = input.emberBuffActive ? 1.22 : 1.0;
  const critMult = input.isCrit ? input.critMultiplier : 1.0;
  const raw = input.baseDamage * comboMult * buffMult * critMult;
  const def = input.targetDefense ?? 0;
  // Smooth Soulslike defense curve so armor mitigates without zeroing hits
  const mitigated = raw * (100 / (100 + def * 2.2));
  return Math.max(4, Math.round(mitigated));
}

export function calculateIncomingDamage(params: {
  rawDamage: number;
  playerDefense: number;
  isDodgingInvulnerable: boolean;
  isBlocking: boolean;
  isParryWindow: boolean;
  guardStability: number;
  currentStamina: number;
}): {
  hpDamage: number;
  staminaLost: number;
  outcome: 'evaded' | 'parried' | 'blocked' | 'guard_broken' | 'hit';
} {
  if (params.isDodgingInvulnerable) {
    return { hpDamage: 0, staminaLost: 0, outcome: 'evaded' };
  }
  if (params.isParryWindow) {
    return { hpDamage: 0, staminaLost: 4, outcome: 'parried' };
  }
  if (params.isBlocking) {
    const staminaCost = Math.max(8, Math.round(params.rawDamage * (1 - params.guardStability)));
    if (params.currentStamina >= staminaCost) {
      const chip = Math.max(1, Math.round(params.rawDamage * 0.14));
      return { hpDamage: chip, staminaLost: staminaCost, outcome: 'blocked' };
    }
    const brokenDmg = Math.max(4, Math.round(params.rawDamage * 0.65 * (100 / (100 + params.playerDefense * 1.5))));
    return { hpDamage: brokenDmg, staminaLost: params.currentStamina, outcome: 'guard_broken' };
  }

  const mitigated = params.rawDamage * (100 / (100 + params.playerDefense * 2.4));
  return {
    hpDamage: Math.max(4, Math.round(mitigated)),
    staminaLost: 0,
    outcome: 'hit',
  };
}

export function getLevelUpSoulCost(currentLevel: number): number {
  return Math.round(120 + (currentLevel - 1) * 85 + Math.pow(currentLevel - 1, 1.45) * 24);
}

export function getWeaponUpgradeCost(currentUpgradeLevel: number): {
  shards: number;
  souls: number;
  canUpgrade: boolean;
} {
  if (currentUpgradeLevel >= 5) {
    return { shards: 0, souls: 0, canUpgrade: false };
  }
  return {
    shards: currentUpgradeLevel < 2 ? 1 : 2,
    souls: 110 + currentUpgradeLevel * 95,
    canUpgrade: true,
  };
}

export function canUnlockSkill(
  skillId: string,
  unlockedSkills: string[],
  skillPoints: number
): boolean {
  if (unlockedSkills.includes(skillId)) return false;
  const node = SKILL_TREE.find((s) => s.id === skillId);
  if (!node) return false;
  if (skillPoints < node.cost) return false;
  if (node.requires && !unlockedSkills.includes(node.requires)) return false;
  return true;
}

export function generateProceduralQuest(
  seed: number,
  playerLevel: number,
  existingIds: string[]
): QuestState {
  const safeIdx = Math.abs(Math.floor(seed)) % QUEST_TEMPLATES.length;
  const tpl = QUEST_TEMPLATES[safeIdx];
  const span = tpl.maxCount - tpl.minCount + 1;
  const count = tpl.minCount + (Math.abs(Math.floor(seed * 7 + 3)) % span);
  const levelScale = 1 + Math.max(0, playerLevel - 1) * 0.18;

  let suffix = Math.abs(Math.floor(seed * 13)) % 1000;
  let id = `${tpl.idPrefix}_${suffix}`;
  while (existingIds.includes(id)) {
    suffix += 1;
    id = `${tpl.idPrefix}_${suffix}`;
  }

  return {
    id,
    title: tpl.title,
    kind: tpl.kind,
    giver: tpl.giver,
    locationName: tpl.locationName,
    description: `${tpl.description} (Target: ${count})`,
    targetType: tpl.targetType,
    targetCount: count,
    progress: 0,
    rewardSouls: Math.round(tpl.baseSouls * count * 0.6 * levelScale),
    rewardShards: tpl.baseShards + (count >= 3 ? 1 : 0),
    completed: false,
    claimed: false,
  };
}

export function advanceQuestProgress(
  quests: QuestState[],
  eventType: EnemyArchetype | 'chest'
): { quests: QuestState[]; newlyCompleted: QuestState[] } {
  const newlyCompleted: QuestState[] = [];
  const next = quests.map((q) => {
    if (q.completed || q.targetType !== eventType) return q;
    const progress = Math.min(q.targetCount, q.progress + 1);
    const completed = progress >= q.targetCount;
    const updated = { ...q, progress, completed };
    if (completed) newlyCompleted.push(updated);
    return updated;
  });
  return { quests: next, newlyCompleted };
}

// World terrain & obstacle math (shared by Three.js world and unit tests)
export interface CircleObstacle {
  x: number;
  z: number;
  radius: number;
}

export const WORLD_BOUNDS = {
  minX: -48,
  maxX: 48,
  minZ: -78,
  maxZ: 28,
};

export function groundHeightAt(x: number, z: number): number {
  // Sanctum Courtyard (z from 4 to 24): flat stone terrace at y = 0
  if (z >= 4) return 0;
  // Causeway & Village (z from -24 to 4): gentle descent into village basin & slight rise to bridge
  if (z >= -24) {
    const t = (4 - z) / 28;
    const ridge = Math.sin(x * 0.09) * Math.cos(z * 0.08) * 0.25;
    // Keep central road flat for smooth combat footing
    const roadBlend = Math.min(1, Math.max(0, (Math.abs(x) - 4.5) / 8));
    return -0.35 * Math.sin(t * Math.PI) + ridge * roadBlend;
  }
  // Shattered Bridge (z from -46 to -24): elevated stone span at y = 0.6
  if (z >= -46) {
    const ramp = z > -28 ? ( -24 - z ) / 4 * 0.6 : z < -42 ? (z + 46) / 4 * 0.6 : 0.6;
    return ramp;
  }
  // Cinder Cathedral Boss Arena (z < -46): grand flat flagstone floor at y = 0
  return 0;
}

export function getZoneNameAt(x: number, z: number): string {
  if (z >= 2) return 'Ashfall Sanctum';
  if (z >= -24) return x < -10 ? 'Hollow Woods' : 'Forsaken Village';
  if (z >= -46) return 'Shattered Bridge';
  return 'Cinder Cathedral';
}

export function resolveCircleCollisions(
  x: number,
  z: number,
  actorRadius: number,
  obstacles: CircleObstacle[]
): { x: number; z: number } {
  let nx = Math.max(WORLD_BOUNDS.minX + actorRadius, Math.min(WORLD_BOUNDS.maxX - actorRadius, x));
  let nz = Math.max(WORLD_BOUNDS.minZ + actorRadius, Math.min(WORLD_BOUNDS.maxZ - actorRadius, z));

  // Keep player on bridge span when crossing chasm (z between -43 and -27)
  if (nz < -27 && nz > -43) {
    const bridgeHalfWidth = 4.6 - actorRadius;
    if (nx < -bridgeHalfWidth) nx = -bridgeHalfWidth;
    if (nx > bridgeHalfWidth) nx = bridgeHalfWidth;
  }

  for (const obs of obstacles) {
    const dx = nx - obs.x;
    const dz = nz - obs.z;
    const minDist = actorRadius + obs.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = minDist - dist;
      nx += (dx / dist) * push;
      nz += (dz / dist) * push;
    }
  }

  return { x: nx, z: nz };
}

export function applyAttributeUpgrade(
  attrs: PlayerAttributes,
  key: keyof PlayerAttributes
): PlayerAttributes {
  return {
    ...attrs,
    [key]: attrs[key] + 1,
  };
}

