import { Coins, ScrollText, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { generateProceduralQuest } from '../game/combatMath';
import { ARMORS, CONSUMABLES, RINGS, WEAPONS } from '../game/data';
import type { QuestState, SaveState } from '../game/types';

interface NpcOverlayProps {
  mode: 'npc' | 'merchant';
  save: SaveState;
  onUpdateSave: (updater: (prev: SaveState) => SaveState) => void;
  onClose: () => void;
}

export function NpcOverlay({ mode, save, onUpdateSave, onClose }: NpcOverlayProps) {
  const claimQuest = (q: QuestState) => {
    if (!q.completed || q.claimed) return;
    soundEngine.estus();
    onUpdateSave((prev) => ({
      ...prev,
      souls: prev.souls + q.rewardSouls,
      upgradeShards: prev.upgradeShards + q.rewardShards,
      quests: prev.quests.map((item) =>
        item.id === q.id ? { ...item, claimed: true } : item
      ),
    }));
  };

  const acceptNewBounty = () => {
    soundEngine.uiClick();
    const seed = save.quests.length + save.enemiesSlain + save.level * 3;
    const newQ = generateProceduralQuest(
      seed,
      save.level,
      save.quests.map((q) => q.id)
    );
    onUpdateSave((prev) => ({
      ...prev,
      quests: [newQ, ...prev.quests],
    }));
  };

  const buyWeapon = (id: string) => {
    const w = WEAPONS[id];
    if (!w || save.ownedWeapons.includes(id) || save.souls < w.price) return;
    soundEngine.parry();
    onUpdateSave((prev) => ({
      ...prev,
      souls: prev.souls - w.price,
      ownedWeapons: [...prev.ownedWeapons, id],
      weaponLevels: { ...prev.weaponLevels, [id]: 0 },
    }));
  };

  const buyArmor = (id: string) => {
    const a = ARMORS[id];
    if (!a || save.ownedArmors.includes(id) || save.souls < a.price) return;
    soundEngine.parry();
    onUpdateSave((prev) => ({
      ...prev,
      souls: prev.souls - a.price,
      ownedArmors: [...prev.ownedArmors, id],
    }));
  };

  const buyRing = (id: string) => {
    const r = RINGS[id];
    if (!r || save.ownedRings.includes(id) || save.souls < r.price) return;
    soundEngine.parry();
    onUpdateSave((prev) => ({
      ...prev,
      souls: prev.souls - r.price,
      ownedRings: [...prev.ownedRings, id],
    }));
  };

  const buyConsumable = (id: string) => {
    const c = CONSUMABLES[id];
    if (!c || save.souls < c.price) return;
    soundEngine.uiClick();
    onUpdateSave((prev) => {
      if (c.effect === 'upgrade_shard') {
        return {
          ...prev,
          souls: prev.souls - c.price,
          upgradeShards: prev.upgradeShards + 1,
        };
      }
      return {
        ...prev,
        souls: prev.souls - c.price,
        consumables: {
          ...prev.consumables,
          [id]: (prev.consumables[id] ?? 0) + 1,
        },
      };
    });
  };

  const activeBounties = save.quests.filter((q) => q.kind !== 'main' && !q.claimed).length;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#090807]/85 p-3 md:p-6">
      <div
        role="dialog"
        aria-label={mode === 'npc' ? 'Aldric the Oathkeeper' : 'Vaelen Ash Merchant'}
        className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-[#14110f] border border-[#8c6e43] shadow-[0_24px_60px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#4d3e2b] bg-[#1a1612]">
          <div className="flex items-center gap-3">
            {mode === 'npc' ? (
              <ScrollText className="w-5 h-5 text-[#c79d58]" />
            ) : (
              <Coins className="w-5 h-5 text-[#f2cf88]" />
            )}
            <div>
              <h2 className="font-display text-lg tracking-[0.16em] text-[#f2d6a2] uppercase">
                {mode === 'npc' ? 'Aldric the Oathkeeper' : 'Vaelen, Ash Merchant'}
              </h2>
              <div className="text-xs text-[#a89a84] tabular-nums">
                Held Souls: {save.souls} · Ash Shards: {save.upgradeShards}
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Dialogue"
            onClick={onClose}
            className="p-2 bg-[#1e1915] hover:bg-[#2c251f] border border-[#614e36] text-[#dfd1ba] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto dark-scroll p-5 flex flex-col gap-5">
          {mode === 'npc' ? (
            <>
              <div className="p-4 bg-[#191512] border-l-2 border-[#b58b4c] text-sm text-[#e0d3be] leading-relaxed">
                “The bell of Ashenveil has long fallen silent, traveler. Lord Malakor keeps vigil
                beyond the Shattered Bridge, bound to the dying cinder. Thin his patrols, reclaim
                our scattered shards, and bring down the Warden.”
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.15em] text-[#c79d58]">
                  Active & Completed Quests
                </span>
                <button
                  type="button"
                  disabled={activeBounties >= 3}
                  onClick={acceptNewBounty}
                  className="px-3.5 py-1.5 text-xs uppercase tracking-[0.13em] bg-[#2a2117] hover:bg-[#3a2d1f] disabled:opacity-40 border border-[#b58b4c] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                >
                  {activeBounties >= 3 ? 'Max Bounties Active' : 'Request New Bounty'}
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {save.quests.map((q) => (
                  <div
                    key={q.id}
                    className="p-3.5 bg-[#181411] border border-[#3e3223] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <div className="text-sm font-semibold text-[#f2e2c6]">
                        {q.title}{' '}
                        <span className="text-xs text-[#c79d58] tabular-nums">
                          ({q.progress}/{q.targetCount})
                        </span>
                      </div>
                      <div className="text-xs text-[#9c8e78]">{q.description}</div>
                      <div className="text-[11px] text-[#857762] tabular-nums mt-1">
                        Reward: {q.rewardSouls} Souls · {q.rewardShards} Shard(s)
                      </div>
                    </div>
                    {q.claimed ? (
                      <span className="text-xs uppercase tracking-[0.14em] text-[#7a6d5a]">
                        Claimed
                      </span>
                    ) : q.completed ? (
                      <button
                        type="button"
                        onClick={() => claimQuest(q)}
                        className="px-4 py-2 text-xs uppercase tracking-[0.14em] bg-[#362614] hover:bg-[#4a341b] border border-[#d4a359] text-[#ffe1a8] cursor-pointer"
                      >
                        Claim Reward
                      </button>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.14em] text-[#a3947d]">
                        In Progress
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-[#191512] border-l-2 border-[#b58b4c] text-sm text-[#e0d3be]">
                “Everything has a price in ash and iron. Spend your souls wisely before crossing
                the Shattered Bridge.”
              </div>

              {/* Weapons & Armors */}
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-2">
                  Weapons & Armor
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {Object.values(WEAPONS)
                    .filter((w) => w.price > 0)
                    .map((w) => {
                      const owned = save.ownedWeapons.includes(w.id);
                      return (
                        <div
                          key={w.id}
                          className="p-3 bg-[#181411] border border-[#3e3223] flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#f2e2c6]">{w.name}</div>
                            <div className="text-[11px] text-[#9c8e78]">{w.description}</div>
                          </div>
                          <button
                            type="button"
                            disabled={owned || save.souls < w.price}
                            onClick={() => buyWeapon(w.id)}
                            className="px-3 py-1.5 text-xs uppercase tabular-nums bg-[#282016] hover:bg-[#382d1e] disabled:opacity-40 border border-[#a88248] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                          >
                            {owned ? 'Owned' : `${w.price}`}
                          </button>
                        </div>
                      );
                    })}

                  {Object.values(ARMORS)
                    .filter((a) => a.price > 0)
                    .map((a) => {
                      const owned = save.ownedArmors.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className="p-3 bg-[#181411] border border-[#3e3223] flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#f2e2c6]">{a.name}</div>
                            <div className="text-[11px] text-[#9c8e78]">{a.description}</div>
                          </div>
                          <button
                            type="button"
                            disabled={owned || save.souls < a.price}
                            onClick={() => buyArmor(a.id)}
                            className="px-3 py-1.5 text-xs uppercase tabular-nums bg-[#282016] hover:bg-[#382d1e] disabled:opacity-40 border border-[#a88248] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                          >
                            {owned ? 'Owned' : `${a.price}`}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Rings & Consumables */}
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-[#c79d58] mb-2">
                  Talismans, Resins & Ash Shards
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {Object.values(RINGS)
                    .filter((r) => r.price > 0)
                    .map((r) => {
                      const owned = save.ownedRings.includes(r.id);
                      return (
                        <div
                          key={r.id}
                          className="p-3 bg-[#181411] border border-[#3e3223] flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#f2e2c6]">{r.name}</div>
                            <div className="text-[11px] text-[#9c8e78]">{r.description}</div>
                          </div>
                          <button
                            type="button"
                            disabled={owned || save.souls < r.price}
                            onClick={() => buyRing(r.id)}
                            className="px-3 py-1.5 text-xs uppercase tabular-nums bg-[#282016] hover:bg-[#382d1e] disabled:opacity-40 border border-[#a88248] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                          >
                            {owned ? 'Owned' : `${r.price}`}
                          </button>
                        </div>
                      );
                    })}

                  {Object.values(CONSUMABLES).map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-[#181411] border border-[#3e3223] flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[#f2e2c6]">{c.name}</div>
                        <div className="text-[11px] text-[#9c8e78]">{c.description}</div>
                      </div>
                      <button
                        type="button"
                        disabled={save.souls < c.price}
                        onClick={() => buyConsumable(c.id)}
                        className="px-3 py-1.5 text-xs uppercase tabular-nums bg-[#282016] hover:bg-[#382d1e] disabled:opacity-40 border border-[#a88248] text-[#f5dfb3] cursor-pointer disabled:cursor-not-allowed"
                      >
                        Buy ({c.price})
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
