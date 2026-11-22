import * as THREE from 'three';

export type CameraShakeKind =
  | 'light_hit'
  | 'heavy_swing'
  | 'heavy_hit'
  | 'parry'
  | 'boss_slam'
  | 'boss_heavy_hit'
  | 'block'
  | 'hurt';

export interface CameraShakePreset {
  trauma: number;
  decayRate: number;
  frequency: number;
  maxAngle: number;
  maxOffset: number;
  fovPunch: number;
}

export const SHAKE_PRESETS: Record<CameraShakeKind, CameraShakePreset> = {
  light_hit: {
    trauma: 0.26,
    decayRate: 2.5,
    frequency: 28,
    maxAngle: 0.055,
    maxOffset: 0.08,
    fovPunch: -0.5,
  },
  heavy_swing: {
    trauma: 0.22,
    decayRate: 2.8,
    frequency: 24,
    maxAngle: 0.045,
    maxOffset: 0.075,
    fovPunch: -0.9,
  },
  heavy_hit: {
    trauma: 0.64,
    decayRate: 2.0,
    frequency: 34,
    maxAngle: 0.105,
    maxOffset: 0.2,
    fovPunch: -2.4,
  },
  parry: {
    trauma: 0.72,
    decayRate: 2.25,
    frequency: 44,
    maxAngle: 0.125,
    maxOffset: 0.22,
    fovPunch: -2.8,
  },
  boss_slam: {
    trauma: 0.56,
    decayRate: 1.75,
    frequency: 22,
    maxAngle: 0.095,
    maxOffset: 0.24,
    fovPunch: -1.8,
  },
  boss_heavy_hit: {
    trauma: 0.68,
    decayRate: 1.9,
    frequency: 30,
    maxAngle: 0.115,
    maxOffset: 0.25,
    fovPunch: -2.2,
  },
  block: {
    trauma: 0.24,
    decayRate: 2.6,
    frequency: 32,
    maxAngle: 0.05,
    maxOffset: 0.07,
    fovPunch: -0.4,
  },
  hurt: {
    trauma: 0.48,
    decayRate: 2.1,
    frequency: 32,
    maxAngle: 0.085,
    maxOffset: 0.15,
    fovPunch: -1.2,
  },
};

export interface CameraShakeSample {
  active: boolean;
  offsetX: number;
  offsetY: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  fovOffset: number;
}

const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();

export class CameraShakeSystem {
  private trauma = 0;
  private activeDecay = 2.1;
  private activeFreq = 30;
  private activeMaxAngle = 0.1;
  private activeMaxOffset = 0.16;
  private fovPunch = 0;
  private kickImpulse = new THREE.Vector3();
  private seedOffset = 0;

  private sampleOut: CameraShakeSample = {
    active: false,
    offsetX: 0,
    offsetY: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    fovOffset: 0,
  };

  public trigger(kind: CameraShakeKind, dirX = 0, dirY = 0, dirZ = 0): void {
    const preset = SHAKE_PRESETS[kind];
    const prevTrauma = this.trauma;
    this.trauma = Math.min(1, this.trauma + preset.trauma);

    if (preset.trauma >= prevTrauma * 0.65) {
      this.activeDecay = preset.decayRate;
      this.activeFreq = preset.frequency;
      this.activeMaxAngle = Math.max(this.activeMaxAngle, preset.maxAngle);
      this.activeMaxOffset = Math.max(this.activeMaxOffset, preset.maxOffset);
    }

    this.fovPunch = Math.max(-4.5, this.fovPunch + preset.fovPunch);
    this.seedOffset += 1.37;

    const len = Math.hypot(dirX, dirY, dirZ);
    if (len > 0.001) {
      const mag = preset.maxOffset * 1.1;
      this.kickImpulse.x += (dirX / len) * mag;
      this.kickImpulse.y += (dirY / len) * mag;
      this.kickImpulse.z += (dirZ / len) * mag;
    }
  }

  public getTrauma(): number {
    return this.trauma;
  }

  public reset(): void {
    this.trauma = 0;
    this.fovPunch = 0;
    this.kickImpulse.set(0, 0, 0);
  }

  public stepAndSample(dt: number, elapsed: number): CameraShakeSample {
    const hasImpulse = this.kickImpulse.lengthSq() > 0.00001;
    const hasFov = Math.abs(this.fovPunch) > 0.01;
    if (this.trauma <= 0.001 && !hasImpulse && !hasFov) {
      this.trauma = 0;
      this.fovPunch = 0;
      this.activeMaxAngle = 0.06;
      this.activeMaxOffset = 0.08;
      this.sampleOut.active = false;
      this.sampleOut.offsetX = 0;
      this.sampleOut.offsetY = 0;
      this.sampleOut.rotX = 0;
      this.sampleOut.rotY = 0;
      this.sampleOut.rotZ = 0;
      this.sampleOut.fovOffset = 0;
      return this.sampleOut;
    }

    const mag = this.trauma * this.trauma;
    const t = elapsed * this.activeFreq + this.seedOffset;

    const nX = Math.sin(t) * 0.65 + Math.cos(t * 1.73) * 0.35;
    const nY = Math.cos(t * 1.31) * 0.65 + Math.sin(t * 2.11) * 0.35;
    const nZ = Math.sin(t * 1.57 + 0.8) * 0.7 + Math.cos(t * 2.33) * 0.3;

    this.sampleOut.active = true;
    this.sampleOut.offsetX = nX * mag * this.activeMaxOffset;
    this.sampleOut.offsetY = nY * mag * this.activeMaxOffset * 0.85;
    this.sampleOut.rotX = nY * mag * this.activeMaxAngle * 0.65;
    this.sampleOut.rotY = nX * mag * this.activeMaxAngle * 0.45;
    this.sampleOut.rotZ = nZ * mag * this.activeMaxAngle;
    this.sampleOut.fovOffset = this.fovPunch;

    this.trauma = Math.max(0, this.trauma - this.activeDecay * dt);
    this.fovPunch = THREE.MathUtils.damp(this.fovPunch, 0, 14, dt);
    this.kickImpulse.multiplyScalar(Math.exp(-16 * dt));
    if (this.trauma <= 0.001) {
      this.activeMaxAngle = 0.06;
      this.activeMaxOffset = 0.08;
    }

    return this.sampleOut;
  }

  public applyToCamera(camera: THREE.PerspectiveCamera, dt: number, elapsed: number): number {
    const sample = this.stepAndSample(dt, elapsed);
    if (!sample.active) return 0;

    camera.position.add(this.kickImpulse);
    _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(_camRight, sample.offsetX);
    camera.position.addScaledVector(_camUp, sample.offsetY);

    camera.rotation.x += sample.rotX;
    camera.rotation.y += sample.rotY;
    camera.rotation.z += sample.rotZ;

    return sample.fovOffset;
  }
}
