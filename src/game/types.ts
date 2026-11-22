export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

export type WeaponKind = 'sword' | 'greatsword' | 'daggers' | 'halberd';

export type EnemyArchetype =
  | 'hollow_footman'
  | 'ash_caster'
  | 'grave_hound'
  | 'iron_bulwark'
  | 'cinder_warden';

export type SkillBranch = 'vanguard' | 'shadow' | 'bastion';

export type WeatherMode = 'ash' | 'ash_storm' | 'mist';

export interface PlayerAttributes {
  vigor: number;      // Max HP
  endurance: number;  // Max Stamina & equip poise
  strength: number;   // Heavy/Sword/Halberd scaling
  dexterity: number;  // Dagger/Sword scaling & dodge efficiency
  arcane: number;     // Crit/riposte & elemental ash damage
}

export interface AppearanceConfig {
  armorTint: string;
  cloakTint: string;
  crestStyle: 'sallet' | 'horned' | 'crowned' | 'hooded';
  visorGlow: string;
}

export type StatusEffectId = 'poison' | 'frost' | 'bleed';

export interface ActiveStatusEffects {
  poison: boolean;
  frost: boolean;
  bleed: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  description: string;
  baseDamage: number;
  strScaling: number;
  dexScaling: number;
  staminaCostLight: number;
  staminaCostHeavy: number;
  attackSpeed: number;
  reach: number;
  poiseDamage: number;
  critMultiplier: number;
  price: number;
  bladeColor: string;
}

export interface ArmorDef {
  id: string;
  name: string;
  description: string;
  defense: number;
  poiseBonus: number;
  staminaRegenMod: number;
  price: number;
  tint: string;
}

export interface RingDef {
  id: string;
  name: string;
  description: string;
  hpBonus: number;
  staminaBonus: number;
  damageMultiplier: number;
  defenseBonus: number;
  price: number;
}

export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  effect: 'heal' | 'stamina_burst' | 'ember_buff' | 'upgrade_shard' | 'souls_pack';
  value: number;
  price: number;
}

export interface SkillNodeDef {
  id: string;
  name: string;
  branch: SkillBranch;
  tier: 1 | 2 | 3;
  cost: number;
  description: string;
  requires?: string;
  bonuses: {
    hpPercent?: number;
    staminaPercent?: number;
    damagePercent?: number;
    critBonus?: number;
    guardStability?: number;
    estusBonus?: number;
  };
}

export type QuestKind = 'main' | 'bounty' | 'relic';

export interface QuestState {
  id: string;
  title: string;
  kind: QuestKind;
  giver: string;
  locationName: string;
  description: string;
  targetType: EnemyArchetype | 'chest';
  targetCount: number;
  progress: number;
  rewardSouls: number;
  rewardShards: number;
  completed: boolean;
  claimed: boolean;
}

export interface GameSettings {
  masterVolume: number;
  muted: boolean;
  cameraSensitivity: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  weatherEnabled: boolean;
  controlScheme: 'auto' | 'desktop' | 'touch';
  invertY: boolean;
  keybinds: {
    lightAttack: string;
    heavyAttack: string;
    dodge: string;
    block: string;
    estus: string;
    lockOn: string;
    interact: string;
  };
}

export interface SaveState {
  version: number;
  level: number;
  souls: number;
  upgradeShards: number;
  skillPoints: number;
  attributes: PlayerAttributes;
  unlockedSkills: string[];
  ownedWeapons: string[];
  weaponLevels: Record<string, number>;
  equippedWeaponId: string;
  ownedArmors: string[];
  equippedArmorId: string;
  ownedRings: string[];
  equippedRingId: string;
  consumables: Record<string, number>;
  estusMax: number;
  estusCharges: number;
  appearance: AppearanceConfig;
  activeStatuses: ActiveStatusEffects;
  statusEffects: StatusEffectId[];
  quests: QuestState[];
  openedChests: string[];
  bossDefeated: boolean;
  miniBossDefeated: boolean;
  enemiesSlain: number;
  deaths: number;
  playTimeSeconds: number;
}

export interface LiveHudSnapshot {
  hp: number;
  maxHp: number;
  hpGhost: number;
  stamina: number;
  maxStamina: number;
  poise: number;
  maxPoise: number;
  estusCharges: number;
  estusMax: number;
  souls: number;
  level: number;
  comboStep: number;
  activeBuffTimer: number;
  guarding: boolean;
  lockedTarget: {
    id?: string;
    name: string;
    hp: number;
    maxHp: number;
    staggered: boolean;
    screenX: number;
    screenY: number;
    visible: boolean;
    statusEffects?: StatusEffectId[];
  } | null;
  bossTarget: {
    name: string;
    subtitle: string;
    hp: number;
    maxHp: number;
    phase: 1 | 2;
    staggered: boolean;
    statusEffects?: StatusEffectId[];
  } | null;
  interactionPrompt: {
    id: string;
    label: string;
    sublabel: string;
    kind: 'bonfire' | 'npc' | 'merchant' | 'chest' | 'fog_gate';
  } | null;
  zoneName: string;
  weather: WeatherMode;
  statusBanner: string | null;
  statusEffects: StatusEffectId[];
  iframeIntensity: number;
  staggerFlashIntensity: number;
  isStaggered: boolean;
}

export interface EndRunSnapshot {
  outcome: 'victory' | 'defeat';
  clearTimeSeconds: number;
  enemiesSlain: number;
  soulsHeld: number;
  bossHpRemainingPercent: number;
  level: number;
}
