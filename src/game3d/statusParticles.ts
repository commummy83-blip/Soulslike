import * as THREE from 'three';
import type { StatusEffectId } from '../game/types';

export type StatusParticleShape = 'bubble_sphere' | 'crystal_shard' | 'crimson_droplet';

export interface StatusParticleProfile {
  id: StatusEffectId;
  shape: StatusParticleShape;
  aspectRatio: readonly [number, number, number];
  spawnRate: number;
  maxInstances: number;
  lifeRange: readonly [number, number];
  sizeRange: readonly [number, number];
  palette: readonly string[];
}

export const STATUS_PARTICLE_PROFILES: Record<StatusEffectId, StatusParticleProfile> = {
  poison: {
    id: 'poison',
    shape: 'bubble_sphere',
    aspectRatio: [1, 1, 1],
    spawnRate: 28,
    maxInstances: 56,
    lifeRange: [0.72, 1.15],
    sizeRange: [0.72, 1.48],
    palette: ['#34d399', '#22c55e', '#4ade80', '#10b981'],
  },
  frost: {
    id: 'frost',
    shape: 'crystal_shard',
    aspectRatio: [0.68, 2.05, 0.68],
    spawnRate: 30,
    maxInstances: 56,
    lifeRange: [0.76, 1.22],
    sizeRange: [0.78, 1.42],
    palette: ['#ffffff', '#e0f2fe', '#7dd3fc', '#bae6fd'],
  },
  bleed: {
    id: 'bleed',
    shape: 'crimson_droplet',
    aspectRatio: [0.68, 1.55, 0.68],
    spawnRate: 18,
    maxInstances: 36,
    lifeRange: [0.48, 0.76],
    sizeRange: [0.65, 1.15],
    palette: ['#ef4444', '#dc2626', '#f87171'],
  },
};

export function evaluateBubbleScale(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0;
  // Swell steadily to full tension before popping sharply at end of life
  if (progress < 0.14) {
    return 0.35 + (progress / 0.14) * 0.45;
  }
  if (progress < 0.82) {
    const t = (progress - 0.14) / 0.68;
    return 0.8 + t * 0.38;
  }
  const popT = (progress - 0.82) / 0.18;
  return 1.18 * (1 - popT * popT);
}

export function evaluateCrystalScale(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0;
  // Snap cleanly into sharp crystal facets, shimmer, then sublimate
  if (progress < 0.16) {
    const t = progress / 0.16;
    return 0.2 + Math.sin(t * Math.PI * 0.5) * 0.88;
  }
  if (progress < 0.76) {
    return 1.0 + Math.sin((progress - 0.16) * Math.PI * 3) * 0.08;
  }
  const meltT = (progress - 0.76) / 0.24;
  return 1.0 * (1 - meltT);
}

export function evaluateBleedScale(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0;
  if (progress < 0.15) return 0.35 + (progress / 0.15) * 0.65;
  if (progress < 0.7) return 1.0;
  return Math.max(0, 1 - (progress - 0.7) / 0.3);
}

export function computeStatusSpawnPoint(
  effect: StatusEffectId,
  playerPos: { x: number; y: number; z: number },
  playerRotY: number,
  angleSeed: number,
  heightNorm: number,
  radiusNorm: number
): { x: number; y: number; z: number } {
  const h = Math.max(0, Math.min(1, heightNorm));
  const r = Math.max(0, Math.min(1, radiusNorm));
  const localRadius =
    effect === 'frost'
      ? 0.4 + r * 0.28
      : effect === 'poison'
        ? 0.36 + r * 0.28
        : 0.32 + r * 0.24;
  const localHeight =
    effect === 'frost'
      ? 0.25 + h * 1.52
      : effect === 'poison'
        ? 0.28 + h * 1.28
        : 0.55 + h * 0.9;

  const lx = Math.cos(angleSeed) * localRadius;
  const lz = Math.sin(angleSeed) * localRadius;
  const cosR = Math.cos(playerRotY);
  const sinR = Math.sin(playerRotY);

  return {
    x: playerPos.x + lx * cosR + lz * sinR,
    y: playerPos.y + localHeight,
    z: playerPos.z - lx * sinR + lz * cosR,
  };
}

interface StatusParticleSlot {
  active: boolean;
  localOffset: THREE.Vector3;
  worldDrift: THREE.Vector3;
  velY: number;
  velOut: number;
  life: number;
  maxLife: number;
  baseScale: number;
  wobblePhase: number;
  wobbleFreq: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

interface StatusPool {
  effect: StatusEffectId;
  profile: StatusParticleProfile;
  mesh: THREE.InstancedMesh;
  slots: StatusParticleSlot[];
  cursor: number;
  spawnAccum: number;
  pendingBurst: number;
  dirty: boolean;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class PlayerStatusParticleSystem {
  private scene: THREE.Scene;
  private pools: Record<StatusEffectId, StatusPool>;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const poisonGeo = new THREE.SphereGeometry(0.082, 10, 8);
    const poisonMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#16a34a',
      emissiveIntensity: 0.72,
      roughness: 0.14,
      metalness: 0.06,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    const frostGeo = new THREE.OctahedronGeometry(0.092, 0);
    const frostMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#7dd3fc',
      emissiveIntensity: 0.76,
      roughness: 0.1,
      metalness: 0.28,
      flatShading: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });

    const bleedGeo = new THREE.OctahedronGeometry(0.058, 0);
    const bleedMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#b91c1c',
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });

    this.geometries.push(poisonGeo, frostGeo, bleedGeo);
    this.materials.push(poisonMat, frostMat, bleedMat);

    this.pools = {
      poison: this.createPool('poison', poisonGeo, poisonMat),
      frost: this.createPool('frost', frostGeo, frostMat),
      bleed: this.createPool('bleed', bleedGeo, bleedMat),
    };
  }

  private createPool(
    effect: StatusEffectId,
    geo: THREE.BufferGeometry,
    mat: THREE.Material
  ): StatusPool {
    const profile = STATUS_PARTICLE_PROFILES[effect];
    const mesh = new THREE.InstancedMesh(geo, mat, profile.maxInstances);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;

    const slots: StatusParticleSlot[] = [];
    for (let i = 0; i < profile.maxInstances; i++) {
      slots.push({
        active: false,
        localOffset: new THREE.Vector3(),
        worldDrift: new THREE.Vector3(),
        velY: 0,
        velOut: 0,
        life: 0,
        maxLife: 1,
        baseScale: 1,
        wobblePhase: 0,
        wobbleFreq: 4,
        rotSpeedX: 0,
        rotSpeedY: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _color.set(profile.palette[i % profile.palette.length]);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);

    return {
      effect,
      profile,
      mesh,
      slots,
      cursor: 0,
      spawnAccum: 0,
      pendingBurst: 0,
      dirty: false,
    };
  }

  public burstEffect(effect: StatusEffectId, count = 6): void {
    this.pools[effect].pendingBurst = Math.min(
      this.pools[effect].profile.maxInstances,
      this.pools[effect].pendingBurst + Math.max(0, Math.round(count))
    );
  }

  private emitSlot(pool: StatusPool): void {
    const { profile, slots } = pool;
    const idx = pool.cursor;
    pool.cursor = (pool.cursor + 1) % profile.maxInstances;
    const slot = slots[idx];

    const angle = Math.random() * Math.PI * 2;
    const heightNorm = Math.random();
    const radiusNorm = Math.random();
    const origin = computeStatusSpawnPoint(
      pool.effect,
      { x: 0, y: 0, z: 0 },
      0,
      angle,
      heightNorm,
      radiusNorm
    );

    slot.active = true;
    slot.localOffset.set(origin.x, origin.y, origin.z);
    slot.worldDrift.set(0, 0, 0);
    slot.maxLife =
      profile.lifeRange[0] + Math.random() * (profile.lifeRange[1] - profile.lifeRange[0]);
    slot.life = slot.maxLife;
    slot.baseScale =
      profile.sizeRange[0] + Math.random() * (profile.sizeRange[1] - profile.sizeRange[0]);
    slot.wobblePhase = Math.random() * Math.PI * 2;

    if (pool.effect === 'poison') {
      slot.velY = 0.7 + Math.random() * 0.65;
      slot.velOut = 0.08 + Math.random() * 0.14;
      slot.wobbleFreq = 4.5 + Math.random() * 3.0;
      slot.rotSpeedX = 0;
      slot.rotSpeedY = 0;
      slot.rotX = 0;
      slot.rotY = 0;
      slot.rotZ = 0;
    } else if (pool.effect === 'frost') {
      slot.velY = -0.22 + Math.random() * 0.18;
      slot.velOut = 0.05 + Math.random() * 0.12;
      slot.wobbleFreq = 1.8 + Math.random() * 1.4;
      slot.rotSpeedX = (Math.random() - 0.5) * 2.2;
      slot.rotSpeedY = (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 2.4);
      slot.rotX = (Math.random() - 0.5) * 0.8;
      slot.rotY = Math.random() * Math.PI * 2;
      slot.rotZ = (Math.random() - 0.5) * 0.7;
    } else {
      slot.velY = -1.1 - Math.random() * 0.7;
      slot.velOut = 0.15 + Math.random() * 0.22;
      slot.wobbleFreq = 2.0;
      slot.rotSpeedX = 0;
      slot.rotSpeedY = 2.0;
      slot.rotX = 0;
      slot.rotY = Math.random() * Math.PI;
      slot.rotZ = 0;
    }

    _color.set(profile.palette[Math.floor(Math.random() * profile.palette.length)]);
    pool.mesh.setColorAt(idx, _color);
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    pool.dirty = true;
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerRotY: number,
    activeEffects: readonly StatusEffectId[],
    emitEnabled = true
  ): void {
    const cosR = Math.cos(playerRotY);
    const sinR = Math.sin(playerRotY);

    (['poison', 'frost', 'bleed'] as const).forEach((effect) => {
      const pool = this.pools[effect];
      const isAfflicted = emitEnabled && activeEffects.includes(effect);

      if (isAfflicted && pool.pendingBurst > 0) {
        while (pool.pendingBurst > 0) {
          pool.pendingBurst--;
          this.emitSlot(pool);
        }
      } else if (!isAfflicted) {
        pool.pendingBurst = 0;
      }

      if (isAfflicted) {
        pool.spawnAccum += dt * pool.profile.spawnRate;
        const burstCap = 4;
        let emitted = 0;
        while (pool.spawnAccum >= 1 && emitted < burstCap) {
          pool.spawnAccum -= 1;
          this.emitSlot(pool);
          emitted++;
        }
      } else {
        pool.spawnAccum = 0;
      }

      const [ax, ay, az] = pool.profile.aspectRatio;
      let anyUpdated = pool.dirty;
      pool.dirty = false;

      for (let i = 0; i < pool.slots.length; i++) {
        const s = pool.slots[i];
        if (!s.active) continue;
        anyUpdated = true;
        s.life -= dt;
        if (s.life <= 0) {
          s.active = false;
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          pool.mesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }

        const progress = 1 - s.life / s.maxLife;
        s.worldDrift.y += s.velY * dt;
        const radialLen = Math.hypot(s.localOffset.x, s.localOffset.z) || 1;
        const radialX = s.localOffset.x / radialLen;
        const radialZ = s.localOffset.z / radialLen;

        let wobbleX = 0;
        let wobbleZ = 0;
        let scalar = 1;

        if (effect === 'poison') {
          const sway = Math.sin(elapsed * s.wobbleFreq + s.wobblePhase) * 0.08;
          wobbleX = -radialZ * sway + radialX * s.velOut * (1 - s.life / s.maxLife);
          wobbleZ = radialX * sway + radialZ * s.velOut * (1 - s.life / s.maxLife);
          scalar = evaluateBubbleScale(progress) * s.baseScale;
        } else if (effect === 'frost') {
          const orbit = elapsed * 0.55 + s.wobblePhase;
          wobbleX = Math.cos(orbit) * 0.045 + radialX * s.velOut * progress;
          wobbleZ = Math.sin(orbit) * 0.045 + radialZ * s.velOut * progress;
          s.rotX += s.rotSpeedX * dt;
          s.rotY += s.rotSpeedY * dt;
          scalar = evaluateCrystalScale(progress) * s.baseScale;
        } else {
          wobbleX = radialX * s.velOut * progress;
          wobbleZ = radialZ * s.velOut * progress;
          s.rotY += s.rotSpeedY * dt;
          scalar = evaluateBleedScale(progress) * s.baseScale;
        }

        const lx = s.localOffset.x + wobbleX;
        const lz = s.localOffset.z + wobbleZ;
        const wx = playerPos.x + lx * cosR + lz * sinR;
        const wy = playerPos.y + s.localOffset.y + s.worldDrift.y;
        const wz = playerPos.z - lx * sinR + lz * cosR;

        _dummy.position.set(wx, wy, wz);
        _dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
        _dummy.scale.set(scalar * ax, scalar * ay, scalar * az);
        _dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, _dummy.matrix);
      }

      if (anyUpdated) {
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  public getActiveCounts(): Record<StatusEffectId, number> {
    return {
      poison: this.pools.poison.slots.filter((s) => s.active).length,
      frost: this.pools.frost.slots.filter((s) => s.active).length,
      bleed: this.pools.bleed.slots.filter((s) => s.active).length,
    };
  }

  public reset(): void {
    (['poison', 'frost', 'bleed'] as const).forEach((effect) => {
      const pool = this.pools[effect];
      pool.spawnAccum = 0;
      let changed = false;
      for (let i = 0; i < pool.slots.length; i++) {
        if (pool.slots[i].active) {
          pool.slots[i].active = false;
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          pool.mesh.setMatrixAt(i, _dummy.matrix);
          changed = true;
        }
      }
      if (changed) {
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  public dispose(): void {
    (['poison', 'frost', 'bleed'] as const).forEach((effect) => {
      this.scene.remove(this.pools[effect].mesh);
    });
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
  }
}
