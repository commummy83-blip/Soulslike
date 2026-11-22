import { useEffect, useRef, useState } from 'react';
import type { LiveHudSnapshot } from '../game/types';
import { StatusEffectIcons } from './StatusEffectIcons';

type BossData = NonNullable<LiveHudSnapshot['bossTarget']>;

interface BossHealthBarProps {
  boss: BossData;
  isTouchActive?: boolean;
}

export function BossHealthBar({ boss, isTouchActive = false }: BossHealthBarProps) {
  const pct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100));
  const [ghostPct, setGhostPct] = useState(pct);
  const [damageFlash, setDamageFlash] = useState(false);
  const prevHpRef = useRef(boss.hp);

  useEffect(() => {
    if (boss.hp < prevHpRef.current) {
      setDamageFlash(true);
      const flashTimer = window.setTimeout(() => setDamageFlash(false), 180);
      const trailTimer = window.setTimeout(() => setGhostPct(pct), 240);
      prevHpRef.current = boss.hp;
      return () => {
        clearTimeout(flashTimer);
        clearTimeout(trailTimer);
      };
    }
    prevHpRef.current = boss.hp;
    setGhostPct(pct);
    setDamageFlash(false);
  }, [boss.hp, pct]);

  const isPhase2 = boss.phase === 2;

  return (
    <div
      data-testid="boss-health-bar"
      className={`fixed left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none ${
        isTouchActive
          ? 'w-[min(680px,92vw)] [@media(max-height:500px)]:w-[min(420px,46vw)] bottom-[176px] sm:bottom-[190px] [@media(max-height:500px)]:bottom-3'
          : 'w-[min(680px,92vw)] bottom-6 sm:bottom-8'
      }`}
    >
      {/* Boss Nameplate & Phase Badge */}
      <div className="flex items-end justify-between gap-3 mb-1.5 px-1">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-sm sm:text-base tracking-[0.18em] uppercase text-[#f5dfb8] hud-text-stroke">
              {boss.name}
            </span>
            {isPhase2 && (
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] bg-[#36110a]/95 border border-[#d4622a] text-[#ffb27d]">
                Phase II · Cinder Awakened
              </span>
            )}
            {boss.staggered && (
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] bg-[#36260b]/95 border border-[#e8b349] text-[#ffe19c]">
                Staggered · Riposte
              </span>
            )}
            {boss.statusEffects && boss.statusEffects.length > 0 && (
              <StatusEffectIcons
                effects={boss.statusEffects}
                testId="boss-status-effects"
                compact
              />
            )}
          </div>
          {boss.subtitle && (
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#a89882] hud-text-stroke">
              {boss.subtitle}
            </span>
          )}
        </div>

        <div className="text-xs sm:text-sm font-semibold tabular-nums text-[#e8d9c0] hud-text-stroke shrink-0">
          {boss.hp} <span className="text-[#8f7f69]">/ {boss.maxHp}</span>
        </div>
      </div>

      {/* Ornate Forged-Iron & Tarnished-Gold Boss Bar Frame */}
      <div className="relative flex items-center">
        {/* Left Filigree Wing */}
        <svg viewBox="0 0 22 24" className="w-4 h-5 shrink-0 -mr-0.5">
          <polygon
            points="22,3 10,3 2,12 10,21 22,21"
            fill="#14100d"
            stroke={isPhase2 ? '#d96b2b' : '#b58d4d'}
            strokeWidth="2"
          />
          <polygon points="15,8 8,12 15,16" fill={isPhase2 ? '#ff7c38' : '#c99c57'} />
        </svg>

        {/* Main Bar Track */}
        <div
          className={`relative flex-1 h-4 sm:h-[18px] bg-[#0b0908]/95 border-y-2 transition-colors duration-200 overflow-hidden ${
            damageFlash
              ? 'border-[#ffcf70]'
              : isPhase2
                ? 'border-[#d4622a]'
                : 'border-[#a67e46]'
          }`}
          style={{
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.92), inset 0 2px 5px rgba(0, 0, 0, 0.95)',
          }}
        >
          {/* Smooth-Sliding Health Depletion Sub-Bar */}
          <div
            data-testid="boss-health-depletion"
            className="absolute inset-y-0 left-0 bg-[#f0a843]/85 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(pct, ghostPct)}%` }}
          />

          {/* Primary Crimson / Cinder Fill */}
          <div
            data-testid="boss-health-fill"
            className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out"
            style={{
              width: `${pct}%`,
              background: isPhase2
                ? 'linear-gradient(180deg, #e04f24 0%, #9c1f16 55%, #66100b 100%)'
                : 'linear-gradient(180deg, #bd2f28 0%, #871a16 58%, #570d0b 100%)',
            }}
          />

          {/* Subtle Top Sheen */}
          <div
            className="absolute inset-x-0 top-0 h-[35%] pointer-events-none"
            style={{ background: 'rgba(255, 224, 180, 0.14)' }}
          />

          {/* Phase II Threshold Marker at 55% */}
          <div
            className="absolute inset-y-0 w-[2px] bg-[#e6c483]/55"
            style={{ left: '55%' }}
            aria-hidden="true"
          />
        </div>

        {/* Right Filigree Wing */}
        <svg viewBox="0 0 22 24" className="w-4 h-5 shrink-0 -ml-0.5">
          <polygon
            points="0,3 12,3 20,12 12,21 0,21"
            fill="#14100d"
            stroke={isPhase2 ? '#d96b2b' : '#b58d4d'}
            strokeWidth="2"
          />
          <polygon points="7,8 14,12 7,16" fill={isPhase2 ? '#ff7c38' : '#c99c57'} />
        </svg>
      </div>
    </div>
  );
}
