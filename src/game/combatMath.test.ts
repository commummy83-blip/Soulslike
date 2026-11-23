import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceQuestProgress,
  calculateActiveStatusEffects,
  calculateAttackDamage,
  calculateIncomingDamage,
  canUnlockSkill,
  computeDerivedStats,
  generateProceduralQuest,
  getBleedBurstDamage,
  getLevelUpSoulCost,
  getPoisonTickPerSecond,
  getStatusStaminaMultiplier,
  getWeaponUpgradeCost,
  getZoneNameAt,
  groundHeightAt,
  resolveCircleCollisions,
  statusEffectsToFlags,
} from './combatMath';
import { createInitialSaveState } from './data';
import {
  applyStatusAffliction,
  cleanseStatusEffects,
  createStatusTracker,
  getCompoundingModifiers,
  resolvePlayerWeaponStatus,
  stepStatusTracker,
} from './statusEffects';

test('computeDerivedStats scales with weapon upgrades, rings, and skill tree nodes', () => {
  const baseSave = createInitialSaveState();
  const baseStats = computeDerivedStats(baseSave);

  const upgraded = {
    ...baseSave,
    attributes: { ...baseSave.attributes, vigor: 16, strength: 18 },
    weaponLevels: { iron_broadsword: 3 },
    unlockedSkills: ['van_1', 'bas_1'],
    equippedRingId: 'ember_band',
  };
  const nextStats = computeDerivedStats(upgraded);

  assert.ok(nextStats.maxHp > baseStats.maxHp, 'Vigor + Bas_1 + Ember Band increases Max HP');
  assert.ok(nextStats.lightDamage > baseStats.lightDamage, 'Strength + Weapon Upgrade + Van_1 increases damage');
  assert.ok(nextStats.heavyDamage > nextStats.lightDamage, 'Heavy damage exceeds light damage');
});

test('calculateAttackDamage applies combo multiplier, ember buff, and critical riposte', () => {
  const step1 = calculateAttackDamage({
    baseDamage: 40,
    comboStep: 1,
    isHeavy: false,
    isCrit: false,
    critMultiplier: 2.0,
    emberBuffActive: false,
    targetDefense: 10,
  });
  const step3BuffedCrit = calculateAttackDamage({
    baseDamage: 40,
    comboStep: 3,
    isHeavy: false,
    isCrit: true,
    critMultiplier: 2.0,
    emberBuffActive: true,
    targetDefense: 10,
  });

  assert.ok(step3BuffedCrit > step1 * 2.5);
});

test('calculateIncomingDamage handles dodge i-frames, parry, blocking, and guard break', () => {
  const evaded = calculateIncomingDamage({
    rawDamage: 45,
    playerDefense: 15,
    isDodgingInvulnerable: true,
    isBlocking: false,
    isParryWindow: false,
    guardStability: 0.7,
    currentStamina: 50,
  });
  assert.equal(evaded.outcome, 'evaded');
  assert.equal(evaded.hpDamage, 0);

  const parried = calculateIncomingDamage({
    rawDamage: 45,
    playerDefense: 15,
    isDodgingInvulnerable: false,
    isBlocking: true,
    isParryWindow: true,
    guardStability: 0.7,
    currentStamina: 50,
  });
  assert.equal(parried.outcome, 'parried');
  assert.equal(parried.hpDamage, 0);

  const blocked = calculateIncomingDamage({
    rawDamage: 40,
    playerDefense: 15,
    isDodgingInvulnerable: false,
    isBlocking: true,
    isParryWindow: false,
    guardStability: 0.75,
    currentStamina: 60,
  });
  assert.equal(blocked.outcome, 'blocked');
  assert.ok(blocked.hpDamage < 10);
  assert.equal(blocked.staminaLost, 10);

  const broken = calculateIncomingDamage({
    rawDamage: 50,
    playerDefense: 15,
    isDodgingInvulnerable: false,
    isBlocking: true,
    isParryWindow: false,
    guardStability: 0.5,
    currentStamina: 5,
  });
  assert.equal(broken.outcome, 'guard_broken');
  assert.ok(broken.hpDamage > blocked.hpDamage);
});

test('skill tree prerequisites and upgrade costs enforce progression rules', () => {
  assert.equal(canUnlockSkill('van_2', [], 3), false);
  assert.equal(canUnlockSkill('van_1', [], 1), true);
  assert.equal(canUnlockSkill('van_2', ['van_1'], 1), true);
  assert.equal(canUnlockSkill('van_1', ['van_1'], 2), false);

  assert.ok(getLevelUpSoulCost(2) > getLevelUpSoulCost(1));
  assert.equal(getWeaponUpgradeCost(5).canUpgrade, false);
  assert.equal(getWeaponUpgradeCost(0).canUpgrade, true);
});

test('procedural quest generation and quest progress tracking behave deterministically', () => {
  const q1 = generateProceduralQuest(1, 3, []);
  const q2 = generateProceduralQuest(1, 3, [q1.id]);
  assert.notEqual(q1.id, q2.id);
  assert.ok(q1.targetCount >= 1 && q1.rewardSouls > 0);

  const step = advanceQuestProgress([q1], q1.targetType);
  assert.equal(step.quests[0].progress, 1);
});

test('world height, zone names, and bridge/obstacle collision constraints remain consistent', () => {
  assert.equal(groundHeightAt(0, 14), 0);
  assert.equal(groundHeightAt(0, -35), 0.6);
  assert.equal(groundHeightAt(0, -58), 0);

  assert.equal(getZoneNameAt(0, 14), 'Ashfall Sanctum');
  assert.equal(getZoneNameAt(4, -10), 'Forsaken Village');
  assert.equal(getZoneNameAt(-18, -10), 'Hollow Woods');
  assert.equal(getZoneNameAt(0, -35), 'Shattered Bridge');
  assert.equal(getZoneNameAt(0, -60), 'Cinder Cathedral');

  const pushed = resolveCircleCollisions(0.2, 0.2, 0.55, [{ x: 0, z: 0, radius: 0.8 }]);
  const dist = Math.hypot(pushed.x, pushed.z);
  assert.ok(dist >= 1.34, 'Actor is pushed cleanly outside obstacle radius');

  const bridgeClamped = resolveCircleCollisions(12, -35, 0.55, []);
  assert.ok(bridgeClamped.x <= 4.1, 'Bridge chasm constrains lateral position');
});

test('status effects math, environment/attack calculation, and save state defaults behave consistently', () => {
  const initial = createInitialSaveState();
  assert.equal(initial.appearance.crestStyle, 'sallet');
  assert.equal(initial.appearance.cloakTint, '#26538f');
  assert.equal(initial.appearance.armorTint, '#6f7780');
  assert.deepEqual(initial.activeStatuses, { poison: false, frost: false, bleed: false });
  assert.deepEqual(initial.statusEffects, []);

  const envPoison = calculateActiveStatusEffects({
    currentEffects: [],
    zoneName: 'Hollow Woods',
    weather: 'mist',
  });
  assert.deepEqual(envPoison, ['poison']);

  const stormFrost = calculateActiveStatusEffects({
    currentEffects: envPoison,
    zoneName: 'Shattered Bridge',
    weather: 'ash_storm',
  });
  assert.deepEqual(stormFrost, ['poison', 'frost']);

  const houndBleed = calculateActiveStatusEffects({
    currentEffects: stormFrost,
    zoneName: 'Forsaken Village',
    weather: 'ash',
    incomingAttackArchetype: 'grave_hound',
    isBlockedOrEvaded: false,
  });
  assert.deepEqual(houndBleed, ['poison', 'frost', 'bleed']);
  assert.deepEqual(statusEffectsToFlags(houndBleed), {
    poison: true,
    frost: true,
    bleed: true,
  });

  assert.equal(getStatusStaminaMultiplier([]), 1.0);
  assert.ok(getStatusStaminaMultiplier(['frost']) < 1.0);
  assert.ok(getPoisonTickPerSecond(140) >= 2);
  assert.ok(getBleedBurstDamage(140) >= 12);
});

test('statusEffects manager handles durations, poison ticks, compounding effects, and cleansing', () => {
  let tracker = createStatusTracker([]);
  const poisonApplied = applyStatusAffliction(tracker, 'poison', 200);
  tracker = poisonApplied.tracker;
  assert.deepEqual(poisonApplied.activeEffects, ['poison']);

  // Single poison tick after 1.0s
  const tick1 = stepStatusTracker(tracker, 1.0, 200);
  tracker = tick1.tracker;
  assert.equal(tick1.tickDamage, getPoisonTickPerSecond(200, 1.0));

  // Compounding poison + frost -> Blighted Chill amplifies poison tick & slows stamina
  const frostApplied = applyStatusAffliction(tracker, 'frost', 200);
  tracker = frostApplied.tracker;
  const compound = getCompoundingModifiers(frostApplied.activeEffects);
  assert.equal(compound.compoundLabel, 'Blighted Chill');
  assert.ok(compound.poisonTickMult > 1.0);
  assert.ok(compound.staminaRegenMult < 0.72);

  // Applying bleed twice triggers hemorrhage burst amplified by frost (Brittle Shatter / Tri-Calamity)
  const bleed1 = applyStatusAffliction(tracker, 'bleed', 200);
  tracker = bleed1.tracker;
  assert.equal(getCompoundingModifiers(bleed1.activeEffects).compoundLabel, 'Tri-Calamity');
  const bleed2 = applyStatusAffliction(tracker, 'bleed', 200);
  tracker = bleed2.tracker;
  assert.ok(bleed2.triggeredBurstDamage > 20, 'Compounded bleed burst exceeds base hemorrhage');
  assert.equal(bleed2.activeEffects.includes('bleed'), false, 'Bleed clears after burst');

  // Duration expiry after 12s clears poison & frost
  const expired = stepStatusTracker(tracker, 15, 200);
  assert.deepEqual(expired.activeEffects, []);
  assert.equal(expired.changed, true);

  // Cleansing & player weapon status resolution
  const dirty = createStatusTracker(['poison', 'frost', 'bleed']);
  const cleansed = cleanseStatusEffects(dirty, ['poison', 'bleed']);
  assert.deepEqual(cleansed.activeEffects, ['frost']);
  assert.equal(resolvePlayerWeaponStatus('daggers', false, false), 'bleed');
  assert.equal(resolvePlayerWeaponStatus('halberd', true, false), 'frost');
});

test('dodge post-processing shader uniforms and i-frame intensity curve behave cleanly', async () => {
  const { computeIframeIntensity, DodgeIframeShader, DODGE_IFRAME_DURATION } = await import(
    '../game3d/dodgePostProcess'
  );
  assert.equal(computeIframeIntensity(0), 0);
  assert.equal(computeIframeIntensity(-0.1), 0);
  const peak = computeIframeIntensity(DODGE_IFRAME_DURATION);
  const mid = computeIframeIntensity(DODGE_IFRAME_DURATION * 0.5);
  assert.ok(peak > 0.99 && peak <= 1.01, 'Intensity peaks cleanly at dodge start');
  assert.ok(mid > 0.45 && mid < peak, 'Intensity tapers smoothly across active i-frame window');
  assert.ok('tPlayerMask' in DodgeIframeShader.uniforms);
  assert.ok('tTrailMask' in DodgeIframeShader.uniforms);
  assert.ok('uDodgeDirScreen' in DodgeIframeShader.uniforms);
  assert.ok('uIntensity' in DodgeIframeShader.uniforms);
});

test('getAttackHitstopSeconds triggers 50ms hit-stop on player and boss heavy attacks', async () => {
  const { getAttackHitstopSeconds, HEAVY_HITSTOP_SECONDS } = await import('./combatMath');
  assert.equal(HEAVY_HITSTOP_SECONDS, 0.05);
  assert.equal(getAttackHitstopSeconds({ source: 'player', isHeavy: true }), 0.05);
  assert.equal(getAttackHitstopSeconds({ source: 'player', isHeavy: false, isCrit: true }), 0.05);
  assert.ok(getAttackHitstopSeconds({ source: 'player', isHeavy: false }) < 0.05);
  assert.equal(getAttackHitstopSeconds({ source: 'boss', isHeavy: true, outcome: 'hit' }), 0.05);
  assert.equal(getAttackHitstopSeconds({ source: 'boss', isHeavy: true, outcome: 'blocked' }), 0.05);
  assert.equal(getAttackHitstopSeconds({ source: 'boss', isHeavy: true, outcome: 'evaded' }), 0);
});

test('CameraShakeSystem produces multi-axis trauma, FOV punch, and decay on heavy attacks and parries', async () => {
  const { CameraShakeSystem, SHAKE_PRESETS } = await import('../game3d/cameraShake');
  const shake = new CameraShakeSystem();

  const idle = shake.stepAndSample(0.016, 1.0);
  assert.equal(idle.active, false);

  shake.trigger('heavy_hit', 1, -0.3, 0);
  assert.equal(shake.getTrauma(), SHAKE_PRESETS.heavy_hit.trauma);
  const heavySample = shake.stepAndSample(0.016, 1.02);
  assert.equal(heavySample.active, true);
  assert.ok(heavySample.fovOffset < -1.5, 'Heavy hit kicks FOV inward for impact punch');
  assert.ok(
    Math.abs(heavySample.rotZ) > 0 || Math.abs(heavySample.offsetX) > 0,
    'Heavy hit produces rotational and positional shake'
  );

  shake.reset();
  assert.equal(shake.getTrauma(), 0);
  shake.trigger('parry', 0, 0.25, -1);
  const parrySample = shake.stepAndSample(0.016, 2.0);
  assert.equal(parrySample.active, true);
  assert.ok(parrySample.fovOffset < -2.0, 'Successful parry delivers sharp FOV kick');

  // Settles cleanly to inactive after decay
  for (let i = 0; i < 60; i++) {
    shake.stepAndSample(0.05, 2.0 + i * 0.05);
  }
  const settled = shake.stepAndSample(0.05, 5.5);
  assert.equal(settled.active, false);
});

test('calculateIncomingPoiseDamage and ControllerHaptics deliver a two-pulse stagger vibration pattern', async () => {
  const { calculateIncomingPoiseDamage, STAGGER_FLASH_DURATION } = await import('./combatMath');
  const { ControllerHaptics, POISE_BREAK_VIBRATION_PATTERN } = await import(
    '../game3d/haptics'
  );

  assert.ok(STAGGER_FLASH_DURATION >= 0.4 && STAGGER_FLASH_DURATION <= 0.65);
  const lightPoiseDmg = calculateIncomingPoiseDamage(28, false);
  const heavyPoiseDmg = calculateIncomingPoiseDamage(38, true);
  assert.ok(lightPoiseDmg >= 10);
  assert.ok(heavyPoiseDmg > lightPoiseDmg);
  assert.equal(POISE_BREAK_VIBRATION_PATTERN.length, 2);
  assert.equal(POISE_BREAK_VIBRATION_PATTERN[0].delayMs, 0);
  assert.ok(POISE_BREAK_VIBRATION_PATTERN[1].delayMs > 0);

  const recordedEffects: Array<{ type: string; duration: number; strongMagnitude: number }> = [];
  const mockPad = {
    vibrationActuator: {
      playEffect: async (
        type: string,
        params: { startDelay?: number; duration?: number; weakMagnitude?: number; strongMagnitude?: number } = {}
      ) => {
        recordedEffects.push({
          type,
          duration: params.duration ?? 0,
          strongMagnitude: params.strongMagnitude ?? 0,
        });
      },
    },
  };

  const haptics = new ControllerHaptics();
  const fired = haptics.triggerPoiseBreak(() => [mockPad]);
  assert.equal(fired, true);
  assert.equal(recordedEffects.length, 1, 'First dual-rumble pulse fires immediately');
  assert.equal(recordedEffects[0].type, 'dual-rumble');
  assert.equal(recordedEffects[0].strongMagnitude, POISE_BREAK_VIBRATION_PATTERN[0].strongMagnitude);

  await new Promise((resolve) => setTimeout(resolve, POISE_BREAK_VIBRATION_PATTERN[1].delayMs + 45));
  assert.equal(recordedEffects.length, 2, 'Second follow-up pulse fires after delayMs');
  assert.equal(recordedEffects[1].strongMagnitude, POISE_BREAK_VIBRATION_PATTERN[1].strongMagnitude);

  // Disposing cancels any queued delayed pulse safely
  const hapticsCancelled = new ControllerHaptics();
  hapticsCancelled.triggerPoiseBreak(() => [mockPad]);
  const countBeforeDispose = recordedEffects.length;
  hapticsCancelled.dispose();
  await new Promise((resolve) => setTimeout(resolve, POISE_BREAK_VIBRATION_PATTERN[1].delayMs + 45));
  assert.equal(recordedEffects.length, countBeforeDispose, 'dispose cancels queued second pulse');
});

test('computeAnalogStickOutput enforces deadzone, clamps knob travel, and triggers sprint at outer rim', async () => {
  const { computeAnalogStickOutput } = await import('./virtualStick');

  const center = computeAnalogStickOutput(0, 0, 44);
  assert.equal(center.isActive, false);
  assert.equal(center.moveX, 0);
  assert.equal(center.moveY, 0);

  const insideDeadzone = computeAnalogStickOutput(3, 2, 44);
  assert.equal(insideDeadzone.isActive, false);
  assert.equal(insideDeadzone.magnitude, 0);
  assert.equal(insideDeadzone.isSprinting, false);

  const halfWalk = computeAnalogStickOutput(24, 0, 44);
  assert.equal(halfWalk.isActive, true);
  assert.ok(halfWalk.moveX > 0.4 && halfWalk.moveX < 0.7);
  assert.equal(halfWalk.moveY, 0);
  assert.equal(halfWalk.isSprinting, false);

  const clampedSprint = computeAnalogStickOutput(-80, -80, 44);
  assert.equal(clampedSprint.isActive, true);
  assert.equal(clampedSprint.isSprinting, true);
  assert.ok(Math.abs(Math.hypot(clampedSprint.knobX, clampedSprint.knobY) - 44) < 0.001);
  assert.ok(Math.abs(clampedSprint.magnitude - 1) < 0.001);
  assert.ok(clampedSprint.moveX < -0.69 && clampedSprint.moveY < -0.69);
});

test('statusParticles configures green poison bubbles, crystalline frost shards, and updates/cleans up cleanly', async () => {
  const THREE = await import('three');
  const {
    STATUS_PARTICLE_PROFILES,
    evaluateBubbleScale,
    evaluateCrystalScale,
    computeStatusSpawnPoint,
    PlayerStatusParticleSystem,
  } = await import('../game3d/statusParticles');

  assert.equal(STATUS_PARTICLE_PROFILES.poison.shape, 'bubble_sphere');
  assert.deepEqual(STATUS_PARTICLE_PROFILES.poison.aspectRatio, [1, 1, 1]);
  assert.equal(STATUS_PARTICLE_PROFILES.frost.shape, 'crystal_shard');
  assert.ok(
    STATUS_PARTICLE_PROFILES.frost.aspectRatio[1] > STATUS_PARTICLE_PROFILES.frost.aspectRatio[0] * 2,
    'Frost shards elongate along Y into crystalline needles'
  );

  // Poison bubbles swell before popping sharply at end of life
  assert.equal(evaluateBubbleScale(0), 0);
  assert.ok(evaluateBubbleScale(0.75) > evaluateBubbleScale(0.15));
  assert.ok(evaluateBubbleScale(0.95) < evaluateBubbleScale(0.75));
  assert.equal(evaluateBubbleScale(1), 0);

  // Frost crystals snap in quickly and sublimate smoothly
  assert.equal(evaluateCrystalScale(0), 0);
  assert.ok(evaluateCrystalScale(0.2) > 0.8);
  assert.ok(evaluateCrystalScale(0.92) < evaluateCrystalScale(0.5));
  assert.equal(evaluateCrystalScale(1), 0);

  const pt = computeStatusSpawnPoint('poison', { x: 2, y: 0, z: -4 }, 0, 0, 0.5, 0.5);
  assert.ok(pt.y > 0.5 && pt.y < 1.5);
  assert.ok(Math.hypot(pt.x - 2, pt.z + 4) > 0.15);

  const scene = new THREE.Scene();
  const sys = new PlayerStatusParticleSystem(scene);
  const pos = new THREE.Vector3(1, 0, -2);

  sys.burstEffect('poison', 6);
  sys.update(0.05, 0.1, pos, 0, ['poison'], true);
  assert.ok(sys.getActiveCounts().poison >= 6, 'Poison burst activates bubble slots immediately');
  assert.equal(sys.getActiveCounts().frost, 0, 'Inactive frost emits zero crystals');

  sys.burstEffect('frost', 5);
  sys.update(0.05, 0.2, pos, 0, ['poison', 'frost'], true);
  assert.ok(sys.getActiveCounts().frost >= 5, 'Frost burst activates crystal shard slots');

  sys.reset();
  assert.deepEqual(sys.getActiveCounts(), { poison: 0, frost: 0, bleed: 0 });

  sys.dispose();
  assert.equal(scene.children.length, 0, 'dispose removes all status particle meshes from scene');
});

test('soundEngine.dodgeIframe triggers dual lowpass BiquadFilterNode frequency sweeps and respects mute state', async () => {
  const { soundEngine, DODGE_IFRAME_AUDIO_CONFIG } = await import('./audio');

  assert.equal(DODGE_IFRAME_AUDIO_CONFIG.filterType, 'lowpass');
  assert.ok(DODGE_IFRAME_AUDIO_CONFIG.cutoffStartHz > DODGE_IFRAME_AUDIO_CONFIG.cutoffEndHz);

  const createdFilters: Array<{
    type: string;
    freqStart: number | null;
    freqEnd: number | null;
    q: number | null;
  }> = [];

  const makeParam = () => {
    let start: number | null = null;
    let end: number | null = null;
    return {
      value: 0,
      setValueAtTime: (v: number) => {
        start = v;
      },
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: (v: number) => {
        end = v;
      },
      getStart: () => start,
      getEnd: () => end,
    };
  };

  const mockCtx = {
    currentTime: 1.5,
    sampleRate: 44100,
    state: 'running',
    destination: {},
    createBuffer: (_ch: number, len: number) => ({
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      start: () => {},
    }),
    createBiquadFilter: () => {
      const freq = makeParam();
      const q = makeParam();
      const node = {
        type: 'lowpass',
        frequency: freq,
        Q: q,
        connect: () => {},
      };
      // Defer snapshot capture via getters
      Object.defineProperty(node, 'type', {
        get: () => filterRecord.type,
        set: (v: string) => {
          filterRecord.type = v;
        },
      });
      const filterRecord = {
        type: 'lowpass',
        get freqStart() {
          return freq.getStart();
        },
        get freqEnd() {
          return freq.getEnd();
        },
        get q() {
          return q.getStart();
        },
      };
      createdFilters.push(filterRecord);
      return node;
    },
    createGain: () => ({
      gain: makeParam(),
      connect: () => {},
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: makeParam(),
      connect: () => {},
      start: () => {},
      stop: () => {},
    }),
  };

  soundEngine.configure(0.8, false);
  soundEngine.setAudioContextForTest(mockCtx as unknown as AudioContext);
  soundEngine.dodgeIframe();

  assert.equal(createdFilters.length, 2, 'Creates two lowpass filters (noise sweep + sub-harmonic)');
  for (const f of createdFilters) {
    assert.equal(f.type, 'lowpass');
    assert.ok((f.freqStart ?? 0) > (f.freqEnd ?? 0), 'Low-pass cutoff sweeps downward');
    assert.ok((f.q ?? 0) > 1.5, 'Low-pass Q adds resonant phase warmth');
  }

  // Respects muted mode without creating nodes
  const countBeforeMute = createdFilters.length;
  soundEngine.configure(0.8, true);
  soundEngine.dodgeIframe();
  assert.equal(createdFilters.length, countBeforeMute);

  soundEngine.setAudioContextForTest(null);
  soundEngine.configure(0.7, false);
});

test('SaveState persists non-negative death counts across localStorage reloads', async () => {
  const { createInitialSaveState } = await import('./data');
  const { loadSaveState, persistSaveState } = await import('./storage');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  };

  try {
    const initial = createInitialSaveState();
    assert.equal(initial.deaths, 0);
    persistSaveState({ ...initial, deaths: 4 });
    const reloaded = loadSaveState();
    assert.equal(reloaded.deaths, 4);

    // Sanitizes invalid/negative death counts safely
    store.set('ashenveil_save_v1', JSON.stringify({ deaths: -3 }));
    assert.equal(loadSaveState().deaths, 0);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = prevWindow;
    }
  }
});
