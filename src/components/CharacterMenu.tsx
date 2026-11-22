import { useState } from 'react';
import { Flame, Shield, Sparkles, Sword, X } from 'lucide-react';
import {
  applyAttributeUpgrade,
  canUnlockSkill,
  computeDerivedStats,
  getLevelUpSoulCost,
  getWeaponUpgradeCost,
} from '../game/combatMath';
import { ARMORS, RINGS, SKILL_TREE, WEAPONS } from '../game/data';
import type { PlayerAttributes, SaveState, SkillBranch } from '../game/types';
import { soundEngine } from '../game/audio';

interface CharacterMenuProps {
  save: SaveState;
  atBonfire: boolean;
  onUpdateSave: (updater: (prev: SaveState) => SaveState) => void;
  onEquipmentChanged: (save: SaveState) => void;
  onAppearanceChanged: (save: SaveState) => void;
  onRestBonfire: () => void;
  onClose: () => void;
}

type TabKey = 'attributes' | 'skills' | 'equipment' | 'appearance' | 'quests';

const ATTR_INFO: { key: keyof PlayerAttributes; label: string; desc: string }[] = [
  { key: 'vigor', label: 'Vigor', desc: 'Increases Max Health & Defense' },
  { key: 'endurance', label: 'Endurance', desc: 'Increases Max Stamina & Poise' },
  { key: 'strength', label: 'Strength', desc: 'Scales Broadsword, Greatsword & Halberd' },
  { key: 'dexterity', label: 'Dexterity', desc: 'Scales Twin Blades & Broadsword' },
  { key: 'arcane', label: 'Arcane', desc: 'Enhances criticals & cinder damage' },
];

export function CharacterMenu({
  save,
  atBonfire,
  onUpdateSave,
  onEquipmentChanged,
  onAppearanceChanged,
  onRestBonfire,
  onClose,
}: CharacterMenuProps) {
  const [tab, setTab] = useState<TabKey>('attributes');
  const derived = computeDerivedStats(save);
  const levelCost = getLevelUpSoulCost(save.level);

  const handleUpgradeAttr = (key: keyof PlayerAttributes) => {
    if (save.souls < levelCost) return;
    soundEngine.uiClick();
    onUpdateSave((prev) => ({
      ...prev,
      level: prev.level + 1,
      souls: prev.souls - getLevelUpSoulCost(prev.level),
      skillPoints: prev.skillPoints + 1,
      attributes: applyAttributeUpgrade(prev.attributes, key),
    }));
  };

  const handleUnlockSkill = (skillId: string) => {
    const node = SKILL_TREE.find((s) => s.id === skillId);
    if (!node || !canUnlockSkill(skillId, save.unlockedSkills, save.skillPoints)) return;
    soundEngine.estus();
    onUpdateSave((prev) => ({
      ...prev,
      skillPoints: prev.skillPoints - node.cost,
      unlockedSkills: [...prev.unlockedSkills, skillId],
    }));
  };

  const handleEquipWeapon = (id: string) => {
    if (!save.ownedWeapons.includes(id)) return;
    soundEngine.uiClick();
    onUpdateSave((prev) => ({ ...prev, equippedWeaponId: id }));
  };

  const handleReinforceWeapon = (id: string) => {
    const lvl = save.weaponLevels[id] ?? 0;
    const cost = getWeaponUpgradeCost(lvl);
    if (!cost.canUpgrade || save.upgradeShards < cost.shards || save.souls < cost.souls) return;
    soundEngine.parry();
    onUpdateSave((prev) => ({
      ...prev,
      souls: prev.souls - cost.souls,
      upgradeShards: prev.upgradeShards - cost.shards,
      weaponLevels: {
        ...prev.weaponLevels,
        [id]: (prev.weaponLevels[id] ?? 0) + 1,
      },
    }));
  };

  const handleEquipArmor = (id: string) => {
    if (!save.ownedArmors.includes(id)) return;
    soundEngine.uiClick();
    const armor = ARMORS[id];
    onUpdateSave((prev) => ({
      ...prev,
      equippedArmorId: id,
      appearance: { ...prev.appearance, armorTint: armor?.tint ?? prev.appearance.armorTint },
    }));
  };

  const handleEquipRing = (id: string) => {
    if (!save.ownedRings.includes(id)) return;
    soundEngine.uiClick();
    onUpdateSave((prev) => ({ ...prev, equippedRingId: id }));
  };

  const updateAppearance = (patch: Partial<SaveState['appearance']>) => {
    soundEngine.uiClick();
    onUpdateSave((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, ...patch },
    }));
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090807]/85 p-3 md:p-6">
      <div
        role="dialog"
        aria-label={atBonfire ? 'Sanctum Bonfire Menu' : 'Character & Journal'}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#14110f] border border-[#8c6e43] shadow-[0_24px_60px_rgba(0,0,0,0.95)]"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#4d3e2b] bg-[#1a1612]">
          <div className="flex items-center gap-3">
            {atBonfire && <Flame className="w-5 h-5 text-[#eb8c2d]" />}
            <div>
              <h2 className="font-display text-lg md:text-xl tracking-[0.18em] text-[#f2d6a2] uppercase">
                {atBonfire ? 'Sanctum Bonfire' : 'Covenant Ledger'}
              </h2>
              <div className="text-xs text-[#a89a84] tabular-nums">
                Level {save.level} · Souls {save.souls} · Ash Shards {save.upgradeShards} · Skill Points {save.skillPoints}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {atBonfire && (
              <button
                type="button"
                onClick={() => {
                  onRestBonfire();
                }}
                className="px-3.5 py-1.5 text-xs uppercase tracking-[0.14em] bg-[#2e1e10] hover:bg-[#3f2915] border border-[#c98438] text-[#ffd79e] cursor-pointer"
              >
                Kindle & Respawn Foes
              </button>
            )}
            <button
              type="button"
              aria-label="Close Menu"
              onClick={onClose}
              className="p-2 bg-[#1e1915] hover:bg-[#2c251f] border border-[#614e36] text-[#dfd1ba] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b border-[#3d3122] bg-[#110e0c] px-4">
          {(
            [
              ['attributes', 'Attributes'],
              ['skills', 'Skill Tree'],
              ['equipment', 'Gear & Forge'],
              ['appearance', 'Appearance'],
              ['quests', 'Quest Log'],
            ] as [TabKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                soundEngine.uiClick();
                setTab(k);
              }}
              className={`px-4 py-2.5 text-xs uppercase tracking-[0.15em] border-b-2 transition-colors cursor-pointer ${
                tab === k
                  ? 'border-[#d4a359] text-[#f5dfb3] bg-[#1b1713]'
                  : 'border-transparent text-[#968772] hover:text-[#d6c8b2]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto dark-scroll p-5">
          {tab === 'attributes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-[0.15em] text-[#c79d58]">
                    Level Up Attributes
                  </span>
                  <span className="text-xs tabular-nums text-[#dfd1ba]">
                    Cost: {levelCost} Souls
                  </span>
                </div>
                {ATTR_INFO.map((attr) => (
                  <div
                    key={attr.key}
                    className="flex items-center justify-between p-3 bg-[#1a1613] border border-[#3f3324]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#ede0cb]">
                        {attr.label}{' '}
                        <span className="ml-1.5 text-[#f2cf88] tabular-nums">
                          {save.attributes[attr.key]}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#948672]">{attr.desc}</div>
                    </div>
                    <button
                      type="button"
                      disabled={save.souls < levelCost}
                      onClick={() => handleUpgradeAttr(attr.key)}
                      className="px-3 py-1.5 text-xs uppercase tracking-[0.12em] bg-[#2a2117] hover:bg-[#3a2d1f] disabled:opacity-35 border border-[#a88248] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                    >
                      +1
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-[#181411] border border-[#3d3122] flex flex-col gap-2.5">
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-1">
                  Derived Combat Statistics
                </div>
                {[
                  ['Max Health', derived.maxHp],
                  ['Max Stamina', derived.maxStamina],
                  ['Stamina Regen /s', derived.staminaRegenPerSec],
                  ['Poise', derived.maxPoise],
                  ['Physical Defense', derived.defense],
                  ['Guard Stability', `${Math.round(derived.guardStability * 100)}%`],
                  ['Light Attack', derived.lightDamage],
                  ['Heavy Attack', derived.heavyDamage],
                  ['Sanctum Flasks', derived.estusMax],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between text-xs border-b border-[#292118] pb-1.5"
                  >
                    <span className="text-[#a89a84]">{label}</span>
                    <span className="font-semibold tabular-nums text-[#f2e2c6]">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'skills' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  ['vanguard', 'Vanguard (Strength)', Sword],
                  ['shadow', 'Shadow (Agility)', Sparkles],
                  ['bastion', 'Bastion (Defense)', Shield],
                ] as [SkillBranch, string, typeof Sword][]
              ).map(([branch, title, Icon]) => (
                <div key={branch} className="p-3.5 bg-[#181411] border border-[#423525] flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[#e0b872]">
                    <Icon className="w-4 h-4" />
                    <span>{title}</span>
                  </div>
                  {SKILL_TREE.filter((n) => n.branch === branch).map((node) => {
                    const unlocked = save.unlockedSkills.includes(node.id);
                    const available = canUnlockSkill(
                      node.id,
                      save.unlockedSkills,
                      save.skillPoints
                    );
                    return (
                      <div
                        key={node.id}
                        className={`p-3 border ${
                          unlocked
                            ? 'bg-[#261f15] border-[#c4944e]'
                            : 'bg-[#120f0d] border-[#382d20]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-[#f0e1c6]">{node.name}</span>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[#c79d58] tabular-nums">
                            {unlocked ? 'Active' : `${node.cost} SP`}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9e907b] mb-2">{node.description}</p>
                        {!unlocked && (
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => handleUnlockSkill(node.id)}
                            className="w-full py-1.5 text-[11px] uppercase tracking-[0.14em] bg-[#2a2117] hover:bg-[#3b2e1f] disabled:opacity-35 border border-[#9c7a44] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                          >
                            Unlock Node
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === 'equipment' && (
            <div className="flex flex-col gap-6">
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-2.5">
                  Owned Weapons & Forging
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {save.ownedWeapons.map((wid) => {
                    const w = WEAPONS[wid];
                    if (!w) return null;
                    const lvl = save.weaponLevels[wid] ?? 0;
                    const cost = getWeaponUpgradeCost(lvl);
                    const equipped = save.equippedWeaponId === wid;
                    const canForge =
                      cost.canUpgrade &&
                      save.upgradeShards >= cost.shards &&
                      save.souls >= cost.souls;

                    return (
                      <div
                        key={wid}
                        className={`p-3.5 border ${
                          equipped
                            ? 'bg-[#241d15] border-[#c79a52]'
                            : 'bg-[#181411] border-[#3e3223]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-[#f2e2c6]">
                            {w.name} {lvl > 0 ? `+${lvl}` : ''}
                          </span>
                          <span className="text-[11px] uppercase text-[#c79d58] tabular-nums">
                            Base {w.baseDamage} · {w.kind}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9c8e78] mb-3">{w.description}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={equipped}
                            onClick={() => handleEquipWeapon(wid)}
                            className="flex-1 py-1.5 text-[11px] uppercase tracking-[0.13em] bg-[#241c14] hover:bg-[#33271c] disabled:opacity-50 border border-[#8c6e43] text-[#f5dfb3] cursor-pointer"
                          >
                            {equipped ? 'Equipped' : 'Equip'}
                          </button>
                          <button
                            type="button"
                            disabled={!canForge}
                            onClick={() => handleReinforceWeapon(wid)}
                            className="flex-1 py-1.5 text-[11px] uppercase tracking-[0.12em] bg-[#1e1812] hover:bg-[#2d231a] disabled:opacity-35 border border-[#b07f3f] text-[#ffd89e] tabular-nums cursor-pointer disabled:cursor-not-allowed"
                          >
                            {cost.canUpgrade
                              ? `Forge +${lvl + 1} (${cost.shards}S · ${cost.souls})`
                              : 'Max Forged'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-2">
                    Armor Sets
                  </div>
                  <div className="flex flex-col gap-2">
                    {save.ownedArmors.map((aid) => {
                      const a = ARMORS[aid];
                      if (!a) return null;
                      const eq = save.equippedArmorId === aid;
                      return (
                        <div
                          key={aid}
                          className={`p-3 border flex items-center justify-between gap-3 ${
                            eq ? 'bg-[#241d15] border-[#c79a52]' : 'bg-[#181411] border-[#3e3223]'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#f0e1c6]">{a.name}</div>
                            <div className="text-[11px] text-[#9c8e78] tabular-nums">
                              DEF {a.defense} · Poise +{a.poiseBonus}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={eq}
                            onClick={() => handleEquipArmor(aid)}
                            className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] bg-[#241c14] border border-[#8c6e43] text-[#f5dfb3] disabled:opacity-50 cursor-pointer"
                          >
                            {eq ? 'Equipped' : 'Equip'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-2">
                    Rings & Talismans
                  </div>
                  <div className="flex flex-col gap-2">
                    {save.ownedRings.map((rid) => {
                      const r = RINGS[rid];
                      if (!r) return null;
                      const eq = save.equippedRingId === rid;
                      return (
                        <div
                          key={rid}
                          className={`p-3 border flex items-center justify-between gap-3 ${
                            eq ? 'bg-[#241d15] border-[#c79a52]' : 'bg-[#181411] border-[#3e3223]'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#f0e1c6]">{r.name}</div>
                            <div className="text-[11px] text-[#9c8e78]">{r.description}</div>
                          </div>
                          <button
                            type="button"
                            disabled={eq}
                            onClick={() => handleEquipRing(rid)}
                            className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] bg-[#241c14] border border-[#8c6e43] text-[#f5dfb3] disabled:opacity-50 cursor-pointer"
                          >
                            {eq ? 'Equipped' : 'Equip'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-4 bg-[#181411] border border-[#3e3223]">
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-3">
                  Helm Crest Style
                </div>
                <div className="flex flex-col gap-2">
                  {(['sallet', 'horned', 'crowned', 'hooded'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => updateAppearance({ crestStyle: style })}
                      className={`py-2 px-3 text-xs uppercase tracking-[0.14em] border text-left cursor-pointer ${
                        save.appearance.crestStyle === style
                          ? 'bg-[#2b2217] border-[#d4a359] text-[#f5dfb3]'
                          : 'bg-[#120f0d] border-[#3d3122] text-[#a3947d]'
                      }`}
                    >
                      {style === 'sallet' ? 'Knight Sallet' : style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#181411] border border-[#3e3223]">
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-3">
                  Armor Steel Finish
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['#6f7780', 'Weathered Steel'],
                    ['#2d3138', 'Obsidian'],
                    ['#756248', 'Gilded Bronze'],
                    ['#8c959e', 'Silvered Steel'],
                  ].map(([hex, label]) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateAppearance({ armorTint: hex })}
                      className={`p-2 text-xs border flex items-center gap-2 cursor-pointer ${
                        save.appearance.armorTint === hex
                          ? 'border-[#d4a359] bg-[#261f16]'
                          : 'border-[#3d3122] bg-[#120f0d]'
                      }`}
                    >
                      <span className="w-4 h-4 border border-black/50" style={{ background: hex }} />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-[#181411] border border-[#3e3223]">
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-3">
                  Surcoat, Cloak & Visor
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    ['#26538f', 'Cobalt Knight'],
                    ['#5c1f1c', 'Crimson'],
                    ['#2f3b28', 'Hollow Moss'],
                    ['#3b3531', 'Charred Ash'],
                  ].map(([hex, label]) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateAppearance({ cloakTint: hex })}
                      className={`p-2 text-xs border flex items-center gap-2 cursor-pointer ${
                        save.appearance.cloakTint === hex
                          ? 'border-[#d4a359] bg-[#261f16]'
                          : 'border-[#3d3122] bg-[#120f0d]'
                      }`}
                    >
                      <span className="w-4 h-4 border border-black/50" style={{ background: hex }} />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {[
                    ['#11151a', 'Shadowed'],
                    ['#e8a849', 'Amber'],
                    ['#7cc4e8', 'Frost'],
                  ].map(([hex, label]) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateAppearance({ visorGlow: hex })}
                      className={`flex-1 py-1.5 text-[11px] border cursor-pointer ${
                        save.appearance.visorGlow === hex
                          ? 'border-[#d4a359] bg-[#261f16] text-[#f5dfb3]'
                          : 'border-[#3d3122] bg-[#120f0d] text-[#a3947d]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'quests' && (
            <div className="flex flex-col gap-3">
              {save.quests.map((q) => (
                <div
                  key={q.id}
                  className={`p-4 border ${
                    q.claimed
                      ? 'bg-[#12100d]/70 border-[#2e261c] opacity-65'
                      : q.completed
                        ? 'bg-[#221c13] border-[#c99b56]'
                        : 'bg-[#181411] border-[#3e3223]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] bg-[#261f17] border border-[#6e573a] text-[#e0b872]">
                        {q.kind}
                      </span>
                      <span className="text-sm font-semibold text-[#f2e2c6]">{q.title}</span>
                    </div>
                    <span className="text-xs tabular-nums text-[#c79d58]">
                      {q.claimed
                        ? 'Claimed'
                        : q.completed
                          ? 'Complete — Speak to Aldric'
                          : `${q.progress} / ${q.targetCount}`}
                    </span>
                  </div>
                  <p className="text-xs text-[#a89a84] mb-1.5">{q.description}</p>
                  <div className="text-[11px] text-[#8a7d68] tabular-nums">
                    Giver: {q.giver} · Region: {q.locationName} · Reward: {q.rewardSouls} Souls,{' '}
                    {q.rewardShards} Ash Shard(s)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
