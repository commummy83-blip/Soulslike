import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../game/audio';
import {
  advanceQuestProgress,
  calculateAttackDamage,
  calculateIncomingDamage,
  calculateIncomingPoiseDamage,
  computeDerivedStats,
  getAttackHitstopSeconds,
  getZoneNameAt,
  groundHeightAt,
  resolveCircleCollisions,
  STAGGER_FLASH_DURATION,
} from '../game/combatMath';
import { ENEMY_CATALOG, WEAPONS } from '../game/data';
import {
  applyStatusAffliction,
  cleanseStatusEffects,
  createStatusTracker,
  getActiveStatusList,
  getCompoundingModifiers,
  resolveEnemyAttackStatus,
  resolveEnvironmentalStatus,
  resolvePlayerWeaponStatus,
  statusEffectsToFlags,
  stepStatusTracker,
  type StatusEffectTracker,
} from '../game/statusEffects';
import type {
  EnemyArchetype,
  EndRunSnapshot,
  GameSettings,
  GameShellState,
  LiveHudSnapshot,
  SaveState,
  StatusEffectId,
  WeatherMode,
} from '../game/types';
import { CameraShakeSystem } from './cameraShake';
import {
  DodgePostProcessor,
  PLAYER_MESH_LAYER,
  markPlayerMeshLayer,
} from './dodgePostProcess';
import { ControllerHaptics } from './haptics';
import {
  buildEnemyRig,
  buildPlayerRig,
  buildWeaponMesh,
  type ArticulatedRig,
} from './models';
import { PlayerStatusParticleSystem } from './statusParticles';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { buildWorld, type WorldData } from './world';

interface EnemyRuntime {
  id: string;
  archetype: EnemyArchetype;
  name: string;
  subtitle?: string;
  rig: ArticulatedRig;
  position: THREE.Vector3;
  spawnPos: THREE.Vector3;
  rotationY: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  damage: number;
  moveSpeed: number;
  attackRange: number;
  aggroRange: number;
  windupSeconds: number;
  activeSeconds: number;
  recoverySeconds: number;
  soulReward: number;
  isBoss: boolean;
  isElite: boolean;
  state:
    | 'idle'
    | 'chase'
    | 'strafe'
    | 'windup'
    | 'attack'
    | 'recover'
    | 'staggered'
    | 'dead';
  stateTimer: number;
  hasHitThisSwing: boolean;
  hitFlashTimer: number;
  deathTimer: number;
  phase: 1 | 2;
  attackKind: 'cleave' | 'slam' | 'lunge' | 'bolt';
  orbitDir: number;
  gaitPhase: number;
  aggroed: boolean;
  knockbackVel: THREE.Vector3;
  statusTracker: StatusEffectTracker;
}

interface ProjectileRuntime {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  sourceArchetype?: EnemyArchetype;
  mesh: THREE.Mesh;
}

interface ParticleSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

export interface VirtualInputState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  blockHeld: boolean;
  sprintHeld: boolean;
  lightPressed: boolean;
  heavyPressed: boolean;
  dodgePressed: boolean;
  estusPressed: boolean;
  lockOnPressed: boolean;
  interactPressed: boolean;
}

export interface EngineCallbacks {
  getSave: () => SaveState;
  updateSave: (updater: (prev: SaveState) => SaveState) => void;
  getSettings: () => GameSettings;
  getShellState: () => GameShellState;
  onHudUpdate: (hud: LiveHudSnapshot) => void;
  onInteract: (id: string, kind: 'bonfire' | 'npc' | 'merchant' | 'chest' | 'fog_gate') => void;
  onEndRun: (snapshot: EndRunSnapshot) => void;
  onPauseRequest: () => void;
}

// Pre-allocated scratch objects (Zero GC inside render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _raycaster = new THREE.Raycaster();

export class GameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;
  private world: WorldData;
  private keyLight: THREE.DirectionalLight;
  private bonfireLight: THREE.PointLight;
  private bossLight: THREE.PointLight;
  private playerRig: ArticulatedRig;
  private dodgePostProcess: DodgePostProcessor;
  private enemies: EnemyRuntime[] = [];
  private projectiles: ProjectileRuntime[] = [];

  // Pooled particle InstancedMesh
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private statusParticles: PlayerStatusParticleSystem;

  // Weather ash InstancedMesh
  private weatherMesh: THREE.InstancedMesh;
  private weatherPositions: Float32Array;
  private weatherCount = 180;
  private weatherMode: WeatherMode = 'ash';
  private weatherTimer = 0;

  // Timing & pacing
  private frameId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private hitstopTimer = 0;
  private hudEmitTimer = 0;
  private disposed = false;

  // Player state
  private playerPos = new THREE.Vector3(-1.4, 0, 17.2);
  private playerRotY = Math.PI; // Facing -Z (north toward bonfire & keep)
  private playerHp = 138;
  private playerHpGhost = 138;
  private playerStamina = 99;
  private playerPoise = 48;
  private playerAction:
    | 'idle'
    | 'move'
    | 'light_windup'
    | 'light_active'
    | 'light_recover'
    | 'heavy_windup'
    | 'heavy_active'
    | 'heavy_recover'
    | 'dodge'
    | 'estus'
    | 'staggered'
    | 'dead' = 'idle';
  private actionTimer = 0;
  private comboStep = 0;
  private comboWindowTimer = 0;
  private hasHitTargetIds = new Set<string>();
  private dodgeDir = new THREE.Vector3(0, 0, -1);
  private invulnTimer = 0;
  private parryTimer = 0;
  private wasBlocking = false;
  private emberBuffTimer = 0;
  private hitFlashTimer = 0;
  private staggerFlashTimer = 0;
  private poiseRegenDelayTimer = 0;
  private gaitPhase = 0;
  private squashY = 1;
  private statusBanner: string | null = null;
  private statusBannerTimer = 0;
  private bossArenaEntered = false;
  private deathEndTriggered = false;
  private playerStatusTracker: StatusEffectTracker = createStatusTracker([]);
  private dodgeGhostAccum = 0;
  private haptics = new ControllerHaptics();

  // Camera state
  private camYaw = 0;
  private camPitch = 0.28;
  private camDist = 6.2;
  private camCurrentPos = new THREE.Vector3(0, 4, 24);
  private camCurrentLook = new THREE.Vector3(0, 1.5, 14);
  private cameraShake = new CameraShakeSystem();

  // Lock-on
  private lockedEnemyId: string | null = null;

  // Input state
  private keysHeld = new Set<string>();
  private justPressed = new Set<string>();
  private bufferedAction: 'light' | 'heavy' | 'dodge' | null = null;
  private bufferTimer = 0;
  private mouseLeftJustPressed = false;
  private mouseRightHeld = false;
  private pointerLocked = false;
  private prevGamepadButtons: boolean[] = [];

  public virtualInput: VirtualInputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    blockHeld: false,
    sprintHeld: false,
    lightPressed: false,
    heavyPressed: false,
    dodgePressed: false,
    estusPressed: false,
    lockOnPressed: false,
    interactPressed: false,
  };

  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color('#14171d');
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2('#14171d', 0.0175);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.2, 160);

    // Studio Environment Reflections on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm/cool contrast lighting rig (1 shadow caster; enable player mask layer on lights)
    const hemi = new THREE.HemisphereLight('#7f94b8', '#2c2219', 0.88);
    hemi.layers.enable(PLAYER_MESH_LAYER);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight('#ffd7a8', 1.65);
    this.keyLight.position.set(22, 34, 18);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = 26;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 85;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.layers.enable(PLAYER_MESH_LAYER);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight('#6b85b3', 0.55);
    rimLight.position.set(-20, 14, -35);
    rimLight.layers.enable(PLAYER_MESH_LAYER);
    this.scene.add(rimLight);

    // Local Sanctum Bonfire & Cathedral PointLights (max 2 unshadowed)
    this.bonfireLight = new THREE.PointLight('#ff7722', 4.5, 19, 1.5);
    this.bonfireLight.position.set(0, 1.4, 11);
    this.bonfireLight.layers.enable(PLAYER_MESH_LAYER);
    this.scene.add(this.bonfireLight);

    this.bossLight = new THREE.PointLight('#ff4d1a', 5.0, 28, 1.4);
    this.bossLight.position.set(0, 3.2, -62);
    this.bossLight.layers.enable(PLAYER_MESH_LAYER);
    this.scene.add(this.bossLight);

    // Procedural Textures & World
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    const save = callbacks.getSave();
    this.world = buildWorld(this.scene, this.textures, save.openedChests);

    // Player Rig
    const weapon = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
    this.playerRig = buildPlayerRig(
      save.appearance,
      weapon.kind,
      weapon.bladeColor,
      this.textures.contactShadowMap
    );
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    markPlayerMeshLayer(this.playerRig.root);
    this.scene.add(this.playerRig.root);

    this.dodgePostProcess = new DodgePostProcessor(
      this.renderer,
      this.scene,
      this.camera,
      width,
      height
    );

    const derived = computeDerivedStats(save);
    this.playerHp = derived.maxHp;
    this.playerHpGhost = derived.maxHp;
    this.playerStamina = derived.maxStamina;
    this.playerPoise = derived.maxPoise;
    const initialEffects: StatusEffectId[] =
      save.statusEffects && save.statusEffects.length > 0
        ? save.statusEffects
        : (['poison', 'frost', 'bleed'] as const).filter((id) => save.activeStatuses?.[id]);
    this.playerStatusTracker = createStatusTracker(initialEffects);

    // Enemies
    this.spawnEnemies(save);

    // Projectile Pool (for Ash Pyromancer & Boss Phase 2 cinder orbs)
    const projGeo = new THREE.SphereGeometry(0.24, 8, 8);
    const projMat = new THREE.MeshBasicMaterial({ color: '#ff6622' });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(projGeo, projMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        damage: 20,
        mesh,
      });
    }

    // Pooled Impact/Ember Particle InstancedMesh (140 slots)
    const partCount = 140;
    const partGeo = new THREE.OctahedronGeometry(0.08, 0);
    const partMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, partCount);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < partCount; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -50, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color('#ffaa44'),
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, this.particles[i].color);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    this.statusParticles = new PlayerStatusParticleSystem(this.scene);
    for (const effect of initialEffects) {
      this.statusParticles.burstEffect(effect, 10);
    }

    // Weather Ash InstancedMesh
    const ashGeo = new THREE.PlaneGeometry(0.08, 0.08);
    const ashMat = new THREE.MeshBasicMaterial({
      color: '#a3998b',
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.weatherMesh = new THREE.InstancedMesh(ashGeo, ashMat, this.weatherCount);
    this.weatherMesh.frustumCulled = false;
    this.weatherPositions = new Float32Array(this.weatherCount * 3);
    for (let i = 0; i < this.weatherCount; i++) {
      this.weatherPositions[i * 3] = (Math.random() - 0.5) * 44;
      this.weatherPositions[i * 3 + 1] = Math.random() * 14;
      this.weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    this.scene.add(this.weatherMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.lastTime = performance.now();
    this.scheduleNextTick();
  }

  private spawnEnemies(save: SaveState): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.rig.root);
    }
    this.enemies = [];

    for (const def of this.world.enemySpawns) {
      if (def.archetype === 'cinder_warden' && save.bossDefeated) continue;
      if (def.archetype === 'iron_bulwark' && save.miniBossDefeated) continue;

      const stats = ENEMY_CATALOG[def.archetype];
      const rig = buildEnemyRig(def.archetype, this.textures.contactShadowMap);
      rig.root.position.copy(def.position);
      this.scene.add(rig.root);

      this.enemies.push({
        id: def.id,
        archetype: def.archetype,
        name: stats.name,
        subtitle: stats.subtitle,
        rig,
        position: def.position.clone(),
        spawnPos: def.position.clone(),
        rotationY: 0,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        poise: stats.maxPoise,
        maxPoise: stats.maxPoise,
        damage: stats.damage,
        moveSpeed: stats.moveSpeed,
        attackRange: stats.attackRange,
        aggroRange: stats.aggroRange,
        windupSeconds: stats.windupSeconds,
        activeSeconds: stats.activeSeconds,
        recoverySeconds: stats.recoverySeconds,
        soulReward: stats.soulReward,
        isBoss: Boolean(stats.isBoss),
        isElite: Boolean(stats.isElite),
        state: 'idle',
        stateTimer: 0,
        hasHitThisSwing: false,
        hitFlashTimer: 0,
        deathTimer: 0,
        phase: 1,
        attackKind: 'cleave',
        orbitDir: Math.random() > 0.5 ? 1 : -1,
        gaitPhase: Math.random() * Math.PI * 2,
        aggroed: false,
        knockbackVel: new THREE.Vector3(),
        statusTracker: createStatusTracker([]),
      });
    }
  }

  public rebuildPlayerAppearance(save: SaveState): void {
    const weapon = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
    this.scene.remove(this.playerRig.root);
    this.playerRig = buildPlayerRig(
      save.appearance,
      weapon.kind,
      weapon.bladeColor,
      this.textures.contactShadowMap
    );
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    markPlayerMeshLayer(this.playerRig.root);
    this.scene.add(this.playerRig.root);

    const derived = computeDerivedStats(save);
    this.playerHp = Math.min(this.playerHp, derived.maxHp);
    this.playerStamina = Math.min(this.playerStamina, derived.maxStamina);
  }

  public equipWeaponMesh(save: SaveState): void {
    if (!this.playerRig.weaponPivot) return;
    while (this.playerRig.weaponPivot.children.length > 0) {
      this.playerRig.weaponPivot.remove(this.playerRig.weaponPivot.children[0]);
    }
    const w = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
    this.playerRig.weaponPivot.add(buildWeaponMesh(w.kind, w.bladeColor));
    markPlayerMeshLayer(this.playerRig.weaponPivot);
  }

  public restAtBonfire(fullRespawn = true): void {
    const save = this.callbacks.getSave();
    const derived = computeDerivedStats(save);
    this.playerHp = derived.maxHp;
    this.playerHpGhost = derived.maxHp;
    this.playerStamina = derived.maxStamina;
    this.playerPoise = derived.maxPoise;
    this.playerAction = 'idle';
    this.deathEndTriggered = false;
    this.lockedEnemyId = null;
    this.bossArenaEntered = false;
    this.playerPos.set(-1.4, 0, 15.5);
    this.playerRotY = Math.PI;
    this.camYaw = 0;
    this.camCurrentPos.set(-1.4, 3.6, 21.5);
    this.camCurrentLook.set(-1.4, 1.5, 15.5);
    this.cameraShake.reset();
    this.staggerFlashTimer = 0;
    this.poiseRegenDelayTimer = 0;

    this.playerStatusTracker = cleanseStatusEffects(this.playerStatusTracker, 'all').tracker;
    this.statusParticles.reset();

    this.callbacks.updateSave((prev) => ({
      ...prev,
      estusCharges: computeDerivedStats(prev).estusMax,
      activeStatuses: { poison: false, frost: false, bleed: false },
      statusEffects: [],
    }));

    if (fullRespawn) {
      this.spawnEnemies(this.callbacks.getSave());
    }
    this.showBanner('BONFIRE LIT · VITALITY RESTORED');
    soundEngine.estus();
    this.emitHudSnapshot();
  }

  public enterBossArena(): void {
    this.playerPos.set(0, 0, -53.5);
    this.playerRotY = Math.PI;
    this.camYaw = 0;
    this.camCurrentPos.set(0, 3.6, -47.5);
    this.camCurrentLook.set(0, 1.5, -53.5);
    this.bossArenaEntered = true;
    const boss = this.enemies.find((e) => e.isBoss && e.state !== 'dead');
    if (boss) {
      boss.aggroed = true;
      this.showBanner('LORD MALAKOR, WARDEN OF THE CINDER CATHEDRAL');
      soundEngine.bossTelegraph();
    }
    this.emitHudSnapshot();
  }

  public useQuickConsumable(id: 'ash_resin' | 'green_blossom'): void {
    const save = this.callbacks.getSave();
    const count = save.consumables[id] ?? 0;
    if (count <= 0) return;

    const derived = computeDerivedStats(save);
    if (id === 'ash_resin') {
      this.emberBuffTimer = 25;
      const cleansed = cleanseStatusEffects(this.playerStatusTracker, ['frost']);
      this.playerStatusTracker = cleansed.tracker;
      this.showBanner('CINDER PINE RESIN APPLIED');
      this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.2, this.playerPos.z, '#ff6d1f', 14);
    } else {
      this.playerStamina = Math.min(derived.maxStamina, this.playerStamina + 65);
      const cleansed = cleanseStatusEffects(this.playerStatusTracker, ['poison', 'bleed']);
      this.playerStatusTracker = cleansed.tracker;
      this.showBanner('STAMINA RESTORED · AILMENTS CLEANSED');
      this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, '#64c466', 10);
    }
    soundEngine.estus();
    const activeEffects = getActiveStatusList(this.playerStatusTracker);
    this.callbacks.updateSave((prev) => ({
      ...prev,
      activeStatuses: statusEffectsToFlags(activeEffects),
      statusEffects: activeEffects,
      consumables: {
        ...prev.consumables,
        [id]: Math.max(0, (prev.consumables[id] ?? 0) - 1),
      },
    }));
    this.emitHudSnapshot();
  }

  public showBanner(msg: string): void {
    this.statusBanner = msg;
    this.statusBannerTimer = 2.6;
  }

  public clearInputs(): void {
    this.keysHeld.clear();
    this.justPressed.clear();
    this.mouseRightHeld = false;
    this.mouseLeftJustPressed = false;
    this.bufferedAction = null;
    this.virtualInput.moveX = 0;
    this.virtualInput.moveY = 0;
    this.virtualInput.lookDeltaX = 0;
    this.virtualInput.lookDeltaY = 0;
    this.virtualInput.blockHeld = false;
    this.virtualInput.sprintHeld = false;
    this.virtualInput.lightPressed = false;
    this.virtualInput.heavyPressed = false;
    this.virtualInput.dodgePressed = false;
    this.virtualInput.estusPressed = false;
    this.virtualInput.lockOnPressed = false;
    this.virtualInput.interactPressed = false;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onBlur = () => {
    this.clearInputs();
  };

  private onVisibilityChange = () => {
    if (document.hidden) this.clearInputs();
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.callbacks.getShellState() !== 'playing') return;
    if (document.body.dataset.modalOpen === '1') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.keysHeld.has(e.code)) {
      this.justPressed.add(e.code);
    }
    this.keysHeld.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.callbacks.getShellState() !== 'playing') return;
    if (e.button === 0) {
      this.mouseLeftJustPressed = true;
      const isMobileViewport =
        typeof window !== 'undefined' &&
        (window.innerWidth < 820 || window.innerHeight < 500 || 'ontouchstart' in window);
      if (
        this.callbacks.getSettings().controlScheme !== 'touch' &&
        !isMobileViewport &&
        !this.pointerLocked &&
        document.body.dataset.modalOpen !== '1'
      ) {
        try {
          this.renderer.domElement.requestPointerLock?.();
        } catch {
          // Ignore pointer lock rejection in automated browsers
        }
      }
    } else if (e.button === 2) {
      this.mouseRightHeld = true;
    } else if (e.button === 1) {
      e.preventDefault();
      this.justPressed.add(this.callbacks.getSettings().keybinds.lockOn);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      this.mouseRightHeld = false;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.callbacks.getShellState() !== 'playing') return;
    if (!this.pointerLocked && (e.buttons & 1) === 0) return;
    const settings = this.callbacks.getSettings();
    const sens = 0.0028 * settings.cameraSensitivity;
    this.camYaw -= e.movementX * sens;
    const ySign = settings.invertY ? -1 : 1;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + e.movementY * sens * ySign,
      0.06,
      1.08
    );
  };

  private handleResize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.dodgePostProcess.setSize(w, h);
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        this.frameId = requestAnimationFrame(this.tick);
      });
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    const shell = this.callbacks.getShellState();
    const settings = this.callbacks.getSettings();
    soundEngine.configure(settings.masterVolume, settings.muted);

    // Animate bonfire & torches even on title screen
    this.animateWorldProps(dt, settings);

    if (shell === 'title') {
      this.updateTitleCamera(dt);
      this.animatePlayerRig(dt, 0, false);
    } else if (shell === 'playing') {
      const modalOpen = document.body.dataset.modalOpen === '1';
      if (!modalOpen) {
        this.stepGameplay(dt);
      } else {
        this.justPressed.clear();
        this.mouseLeftJustPressed = false;
      }
    }

    // Update particles & camera shake in real dt (continues smoothly during hitstop)
    this.updateParticles(dt);
    if (shell === 'playing') {
      this.statusParticles.update(
        dt,
        this.elapsed,
        this.playerPos,
        this.playerRotY,
        getActiveStatusList(this.playerStatusTracker),
        this.playerAction !== 'dead'
      );
    } else {
      this.statusParticles.reset();
    }
    this.dodgePostProcess.renderWithDodgeEffect(
      dt,
      this.elapsed,
      shell === 'playing' ? this.invulnTimer : 0,
      this.playerPos,
      this.dodgeDir
    );

    if (shell === 'playing') {
      this.hudEmitTimer += dt;
      const cadence = this.invulnTimer > 0 || this.staggerFlashTimer > 0 ? 0.035 : 0.09;
      if (this.hudEmitTimer >= cadence) {
        this.hudEmitTimer = 0;
        this.emitHudSnapshot();
      }
    }

    this.scheduleNextTick();
  };

  private updateTitleCamera(dt: number): void {
    const orbit = this.elapsed * 0.16;
    const targetX = Math.sin(orbit) * 7.5;
    const targetZ = 15.5 + Math.cos(orbit) * 4.5;
    _camGoal.set(targetX, 3.6 + Math.sin(this.elapsed * 0.4) * 0.25, targetZ);
    this.camCurrentPos.lerp(_camGoal, 1 - Math.exp(-3 * dt));
    _lookTarget.set(0, 1.5, 4);
    this.camCurrentLook.lerp(_lookTarget, 1 - Math.exp(-3 * dt));
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);
  }

  private pollGamepad(dt: number, settings: GameSettings) {
    const pads = navigator.getGamepads?.();
    const gp = pads?.[0];
    if (!gp) return null;

    const deadzone = 0.18;
    const ax0 = Math.abs(gp.axes[0] ?? 0) > deadzone ? gp.axes[0] : 0;
    const ax1 = Math.abs(gp.axes[1] ?? 0) > deadzone ? gp.axes[1] : 0;
    const ax2 = Math.abs(gp.axes[2] ?? 0) > deadzone ? gp.axes[2] : 0;
    const ax3 = Math.abs(gp.axes[3] ?? 0) > deadzone ? gp.axes[3] : 0;

    this.camYaw -= ax2 * 2.4 * settings.cameraSensitivity * dt;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + ax3 * 1.6 * settings.cameraSensitivity * dt * (settings.invertY ? -1 : 1),
      0.06,
      1.08
    );

    const btn = (idx: number) => Boolean(gp.buttons[idx]?.pressed);
    const edge = (idx: number) => btn(idx) && !this.prevGamepadButtons[idx];

    const res = {
      moveX: ax0,
      moveY: ax1,
      light: edge(5) || edge(2),  // RB or X
      heavy: edge(7),             // RT
      dodge: edge(1),             // B
      block: btn(4) || btn(6),    // LB or LT
      estus: edge(3),             // Y
      interact: edge(0),          // A
      lockOn: edge(11),           // R3
      sprint: btn(1),
    };
    this.prevGamepadButtons = gp.buttons.map((b) => b.pressed);
    return res;
  }

  private stepGameplay(dt: number): void {
    const save = this.callbacks.getSave();
    const derived = computeDerivedStats(save);
    const weapon = WEAPONS[save.equippedWeaponId] ?? WEAPONS.iron_broadsword;
    const settings = this.callbacks.getSettings();

    // Update ghost HP decay smoothly
    if (this.playerHpGhost > this.playerHp) {
      this.playerHpGhost = Math.max(this.playerHp, this.playerHpGhost - 36 * dt);
    } else {
      this.playerHpGhost = this.playerHp;
    }

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer -= dt;
      if (this.statusBannerTimer <= 0) this.statusBanner = null;
    }
    if (this.emberBuffTimer > 0) this.emberBuffTimer -= dt;
    if (this.poiseRegenDelayTimer > 0) {
      this.poiseRegenDelayTimer = Math.max(0, this.poiseRegenDelayTimer - dt);
    }
    if (this.staggerFlashTimer > 0) {
      this.staggerFlashTimer = Math.max(0, this.staggerFlashTimer - dt);
      if (this.staggerFlashTimer <= 0) {
        this.emitHudSnapshot();
      }
    }

    const wasInvuln = this.invulnTimer > 0;
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
      this.dodgeGhostAccum += dt;
      if (this.dodgeGhostAccum >= 0.032) {
        this.dodgeGhostAccum = 0;
        this.spawnDodgeGhost(4);
      }
      if (this.hitFlashTimer <= 0) {
        const glow = 0.34 * (this.invulnTimer / 0.3);
        for (const m of this.playerRig.flashMaterials) {
          m.emissive.setHex(0x3882f6);
          m.emissiveIntensity = glow;
        }
      }
    }
    if (wasInvuln && this.invulnTimer <= 0) {
      if (this.hitFlashTimer <= 0) {
        for (const m of this.playerRig.flashMaterials) {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
      }
      this.emitHudSnapshot();
    }

    if (this.parryTimer > 0) this.parryTimer -= dt;
    if (this.comboWindowTimer > 0) this.comboWindowTimer -= dt;
    if (this.bufferTimer > 0) {
      this.bufferTimer -= dt;
      if (this.bufferTimer <= 0) this.bufferedAction = null;
    }

    // Calculate environment-driven active status effects & step durations/ticks/compounding
    const envStatus = resolveEnvironmentalStatus(
      getZoneNameAt(this.playerPos.x, this.playerPos.z),
      this.weatherMode
    );
    if (envStatus && this.playerStatusTracker.durations[envStatus] <= 0) {
      this.applyPlayerStatusEffect(envStatus, derived.maxHp);
    }

    const playerStatusStep = stepStatusTracker(this.playerStatusTracker, dt, derived.maxHp);
    this.playerStatusTracker = playerStatusStep.tracker;
    if (playerStatusStep.tickDamage > 0 && this.playerAction !== 'dead') {
      this.playerHp = Math.max(0, this.playerHp - playerStatusStep.tickDamage);
      this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, '#34d399', 5);
      if (this.playerHp <= 0) {
        this.playerAction = 'dead';
        this.actionTimer = 0.7;
        this.callbacks.updateSave((prev) => ({ ...prev, deaths: prev.deaths + 1 }));
        soundEngine.defeat();
        this.showBanner('YOU DIED');
      }
    }
    if (playerStatusStep.changed) {
      this.syncSaveStatusEffects(playerStatusStep.activeEffects);
    }
    const playerModifiers = playerStatusStep.modifiers;

    // Hit flash recovery
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        for (const m of this.playerRig.flashMaterials) {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
      }
    }

    // Hitstop freeze (camera shake & particles continue, simulation pauses briefly on heavy hits)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateCamera(dt, settings);
      return;
    }

    // Read unified inputs (Keyboard + Mouse + Gamepad + Virtual Touch)
    const kb = settings.keybinds;
    const gp = this.pollGamepad(dt, settings);

    if (this.justPressed.has('Escape') || this.justPressed.has('KeyP')) {
      this.justPressed.clear();
      this.callbacks.onPauseRequest();
      return;
    }

    // Virtual touch look delta
    if (this.virtualInput.lookDeltaX !== 0 || this.virtualInput.lookDeltaY !== 0) {
      const sens = 0.005 * settings.cameraSensitivity;
      this.camYaw -= this.virtualInput.lookDeltaX * sens;
      this.camPitch = THREE.MathUtils.clamp(
        this.camPitch + this.virtualInput.lookDeltaY * sens * (settings.invertY ? -1 : 1),
        0.06,
        1.08
      );
      this.virtualInput.lookDeltaX = 0;
      this.virtualInput.lookDeltaY = 0;
    }

    // Camera arrow key rotation fallback
    if (this.keysHeld.has('ArrowLeft')) this.camYaw += 2.1 * dt;
    if (this.keysHeld.has('ArrowRight')) this.camYaw -= 2.1 * dt;

    // Quick consumables
    if (this.justPressed.has('Digit1')) this.useQuickConsumable('ash_resin');
    if (this.justPressed.has('Digit2')) this.useQuickConsumable('green_blossom');

    // Lock-on toggle
    if (this.justPressed.has(kb.lockOn) || gp?.lockOn || this.virtualInput.lockOnPressed) {
      this.virtualInput.lockOnPressed = false;
      this.toggleLockOn();
    }

    // Interact
    if (this.justPressed.has(kb.interact) || gp?.interact || this.virtualInput.interactPressed) {
      this.virtualInput.interactPressed = false;
      const near = this.findNearestInteractable();
      if (near) {
        if (near.kind === 'chest' && !near.opened) {
          this.openChest(near);
        } else if (near.kind === 'fog_gate') {
          this.enterBossArena();
        } else {
          this.callbacks.onInteract(near.id, near.kind);
        }
      }
    }

    // Movement vector
    let ix = (this.keysHeld.has('KeyD') ? 1 : 0) - (this.keysHeld.has('KeyA') ? 1 : 0);
    let iz = (this.keysHeld.has('KeyS') ? 1 : 0) - (this.keysHeld.has('KeyW') ? 1 : 0);
    if (Math.abs(this.virtualInput.moveX) > 0.08 || Math.abs(this.virtualInput.moveY) > 0.08) {
      ix += this.virtualInput.moveX;
      iz += this.virtualInput.moveY;
    }
    if (gp && (Math.abs(gp.moveX) > 0.1 || Math.abs(gp.moveY) > 0.1)) {
      ix += gp.moveX;
      iz += gp.moveY;
    }
    const inputLen = Math.hypot(ix, iz);
    if (inputLen > 1) {
      ix /= inputLen;
      iz /= inputLen;
    }

    const wantLight =
      this.justPressed.has(kb.lightAttack) ||
      (this.mouseLeftJustPressed && !this.keysHeld.has('ShiftLeft')) ||
      Boolean(gp?.light) ||
      this.virtualInput.lightPressed;
    const wantHeavy =
      this.justPressed.has(kb.heavyAttack) ||
      (this.mouseLeftJustPressed && this.keysHeld.has('ShiftLeft')) ||
      Boolean(gp?.heavy) ||
      this.virtualInput.heavyPressed;
    const wantDodge =
      this.justPressed.has(kb.dodge) || Boolean(gp?.dodge) || this.virtualInput.dodgePressed;
    const wantEstus =
      this.justPressed.has(kb.estus) || Boolean(gp?.estus) || this.virtualInput.estusPressed;
    const isBlocking =
      this.keysHeld.has(kb.block) ||
      this.mouseRightHeld ||
      Boolean(gp?.block) ||
      this.virtualInput.blockHeld;
    const isSprinting =
      (this.keysHeld.has('ShiftLeft') || Boolean(gp?.sprint) || this.virtualInput.sprintHeld) &&
      inputLen > 0.25 &&
      this.playerStamina > 4 &&
      !isBlocking;

    this.virtualInput.lightPressed = false;
    this.virtualInput.heavyPressed = false;
    this.virtualInput.dodgePressed = false;
    this.virtualInput.estusPressed = false;
    this.justPressed.clear();
    this.mouseLeftJustPressed = false;

    // Trigger timed parry window on block edge
    if (isBlocking && !this.wasBlocking && (this.playerAction === 'idle' || this.playerAction === 'move')) {
      this.parryTimer = 0.2;
    }
    this.wasBlocking = isBlocking;

    // Input buffering for responsive Soulslike combos
    if (wantDodge) {
      this.bufferedAction = 'dodge';
      this.bufferTimer = 0.14;
    } else if (wantHeavy) {
      this.bufferedAction = 'heavy';
      this.bufferTimer = 0.14;
    } else if (wantLight) {
      this.bufferedAction = 'light';
      this.bufferTimer = 0.14;
    }

    // Player Action State Machine
    if (this.playerAction === 'dead') {
      this.actionTimer -= dt;
      this.playerRig.bodyPivot.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyPivot.rotation.x,
        -Math.PI / 2,
        7,
        dt
      );
      if (this.actionTimer <= 0 && !this.deathEndTriggered) {
        this.deathEndTriggered = true;
        const boss = this.enemies.find((e) => e.isBoss);
        const bossPct = boss ? Math.round((boss.hp / boss.maxHp) * 100) : 0;
        this.callbacks.onEndRun({
          outcome: 'defeat',
          clearTimeSeconds: Math.round(save.playTimeSeconds),
          enemiesSlain: save.enemiesSlain,
          soulsHeld: save.souls,
          bossHpRemainingPercent: bossPct,
          level: save.level,
        });
      }
      this.updateCamera(dt, settings);
      return;
    }

    const canAct = this.playerAction === 'idle' || this.playerAction === 'move';
    const canComboChain =
      (this.playerAction === 'light_recover' || this.playerAction === 'heavy_recover') &&
      this.actionTimer < 0.14;

    if (wantEstus && canAct && save.estusCharges > 0 && this.playerHp < derived.maxHp) {
      this.playerAction = 'estus';
      this.actionTimer = 0.55;
      this.playerHp = Math.min(derived.maxHp, this.playerHp + Math.round(derived.maxHp * 0.45));
      this.callbacks.updateSave((prev) => ({
        ...prev,
        estusCharges: Math.max(0, prev.estusCharges - 1),
      }));
      soundEngine.estus();
      this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, '#f59e0b', 16);
    } else if (this.bufferedAction === 'dodge' && (canAct || canComboChain) && this.playerStamina >= 18) {
      this.bufferedAction = null;
      this.playerStamina -= 18;
      this.playerAction = 'dodge';
      this.actionTimer = 0.38;
      const enteredIframes = this.invulnTimer <= 0;
      this.invulnTimer = 0.3;
      this.dodgeGhostAccum = 0;
      this.squashY = 0.84;
      this.faceOrComputeMoveDir(ix, iz, this.dodgeDir);
      if (inputLen < 0.15) {
        this.dodgeDir.set(Math.sin(this.playerRotY), 0, Math.cos(this.playerRotY));
      }
      this.spawnDodgeGhost(10);
      soundEngine.dodge();
      if (enteredIframes) {
        soundEngine.dodgeIframe();
      }
      this.emitHudSnapshot();
    } else if (
      this.bufferedAction === 'light' &&
      (canAct || canComboChain) &&
      this.playerStamina >= weapon.staminaCostLight
    ) {
      this.bufferedAction = null;
      this.playerStamina -= weapon.staminaCostLight;
      this.comboStep = this.comboWindowTimer > 0 ? (this.comboStep % 3) + 1 : 1;
      this.comboWindowTimer = 0.85;
      this.playerAction = 'light_windup';
      this.actionTimer = 0.16 / weapon.attackSpeed;
      this.hasHitTargetIds.clear();
      this.faceTargetOrInput(ix, iz);
      soundEngine.swing(false);
    } else if (
      this.bufferedAction === 'heavy' &&
      (canAct || canComboChain) &&
      this.playerStamina >= weapon.staminaCostHeavy
    ) {
      this.bufferedAction = null;
      this.playerStamina -= weapon.staminaCostHeavy;
      this.comboStep = 1;
      this.playerAction = 'heavy_windup';
      this.actionTimer = 0.34 / weapon.attackSpeed;
      this.hasHitTargetIds.clear();
      this.faceTargetOrInput(ix, iz);
      soundEngine.swing(true);
    }

    // Step player movement & combat phases
    let moveSpeedNow = 0;
    if (this.playerAction === 'idle' || this.playerAction === 'move') {
      const baseSpd = isBlocking ? 2.6 : isSprinting ? 7.6 : 5.0;
      if (inputLen > 0.08) {
        this.playerAction = 'move';
        moveSpeedNow = baseSpd * inputLen;
        if (isSprinting) {
          this.playerStamina = Math.max(0, this.playerStamina - 16 * dt);
        }
        this.faceOrComputeMoveDir(ix, iz, _v1);
        this.playerPos.x += _v1.x * moveSpeedNow * dt;
        this.playerPos.z += _v1.z * moveSpeedNow * dt;

        // Rotate character toward lock-on target or movement vector
        const locked = this.getLockedEnemy();
        const targetYaw = locked
          ? Math.atan2(locked.position.x - this.playerPos.x, locked.position.z - this.playerPos.z)
          : Math.atan2(_v1.x, _v1.z);
        this.playerRotY = this.lerpAngle(this.playerRotY, targetYaw, 1 - Math.exp(-12 * dt));
      } else {
        this.playerAction = 'idle';
        const locked = this.getLockedEnemy();
        if (locked) {
          const targetYaw = Math.atan2(
            locked.position.x - this.playerPos.x,
            locked.position.z - this.playerPos.z
          );
          this.playerRotY = this.lerpAngle(this.playerRotY, targetYaw, 1 - Math.exp(-10 * dt));
        }
      }

      // Regenerate stamina & poise when idle/moving (frost & compounding ailments slow stamina regen)
      const regenScale = (isBlocking ? 0.32 : 1.0) * playerModifiers.staminaRegenMult;
      if (!isSprinting) {
        this.playerStamina = Math.min(
          derived.maxStamina,
          this.playerStamina + derived.staminaRegenPerSec * regenScale * dt
        );
      }
      if (this.poiseRegenDelayTimer <= 0) {
        this.playerPoise = Math.min(derived.maxPoise, this.playerPoise + 14 * dt);
      }
    } else {
      this.actionTimer -= dt;
      if (this.playerAction === 'dodge') {
        const rollSpeed = 10.2;
        this.playerPos.x += this.dodgeDir.x * rollSpeed * dt;
        this.playerPos.z += this.dodgeDir.z * rollSpeed * dt;
        this.playerRotY = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
        if (this.actionTimer <= 0) {
          this.playerAction = 'idle';
          this.squashY = 1.08;
        }
      } else if (this.playerAction === 'light_windup' && this.actionTimer <= 0) {
        this.playerAction = 'light_active';
        this.actionTimer = 0.16 / weapon.attackSpeed;
      } else if (this.playerAction === 'light_active') {
        this.playerPos.x += Math.sin(this.playerRotY) * 2.2 * dt;
        this.playerPos.z += Math.cos(this.playerRotY) * 2.2 * dt;
        this.checkPlayerMeleeHits(false, derived, weapon);
        if (this.actionTimer <= 0) {
          this.playerAction = 'light_recover';
          this.actionTimer = 0.22 / weapon.attackSpeed;
        }
      } else if (this.playerAction === 'light_recover' && this.actionTimer <= 0) {
        this.playerAction = 'idle';
      } else if (this.playerAction === 'heavy_windup' && this.actionTimer <= 0) {
        this.playerAction = 'heavy_active';
        this.actionTimer = 0.22 / weapon.attackSpeed;
        this.cameraShake.trigger(
          'heavy_swing',
          Math.sin(this.playerRotY),
          -0.25,
          Math.cos(this.playerRotY)
        );
      } else if (this.playerAction === 'heavy_active') {
        this.playerPos.x += Math.sin(this.playerRotY) * 3.4 * dt;
        this.playerPos.z += Math.cos(this.playerRotY) * 3.4 * dt;
        this.checkPlayerMeleeHits(true, derived, weapon);
        if (this.actionTimer <= 0) {
          this.playerAction = 'heavy_recover';
          this.actionTimer = 0.34 / weapon.attackSpeed;
        }
      } else if (this.playerAction === 'heavy_recover' && this.actionTimer <= 0) {
        this.playerAction = 'idle';
      } else if (this.playerAction === 'estus' && this.actionTimer <= 0) {
        this.playerAction = 'idle';
      } else if (this.playerAction === 'staggered' && this.actionTimer <= 0) {
        this.playerAction = 'idle';
        this.poiseRegenDelayTimer = 0;
        this.playerPoise = Math.max(this.playerPoise, Math.round(derived.maxPoise * 0.6));
        this.emitHudSnapshot();
      }
    }

    // Resolve terrain height & obstacles for player
    const resolved = resolveCircleCollisions(
      this.playerPos.x,
      this.playerPos.z,
      0.56,
      this.world.obstacles
    );
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;
    this.playerPos.y = groundHeightAt(this.playerPos.x, this.playerPos.z);

    // Boss fog gate automatic trigger when walking close inside cathedral doorway
    if (!this.bossArenaEntered && this.playerPos.z < -47.5 && !save.bossDefeated) {
      this.enterBossArena();
    }

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    this.animatePlayerRig(dt, moveSpeedNow, isBlocking);

    // Update Enemies & Projectiles
    this.updateEnemies(dt, derived, isBlocking);
    this.updateProjectiles(dt, derived, isBlocking);

    // Update playTime occasionally
    save.playTimeSeconds += dt;

    // Follow key light shadow frustum tightly around player
    this.keyLight.position.set(this.playerPos.x + 18, this.playerPos.y + 30, this.playerPos.z + 16);
    this.keyLight.target.position.copy(this.playerPos);
    this.keyLight.target.updateMatrixWorld();

    this.updateCamera(dt, settings);
  }

  private faceOrComputeMoveDir(ix: number, iz: number, out: THREE.Vector3): void {
    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    // Forward is (-sinY, -cosY), Right is (cosY, -sinY)
    out.set(ix * cosY + iz * sinY, 0, -ix * sinY + iz * cosY);
    if (out.lengthSq() > 0.0001) out.normalize();
  }

  private faceTargetOrInput(ix: number, iz: number): void {
    const locked = this.getLockedEnemy();
    if (locked) {
      this.playerRotY = Math.atan2(
        locked.position.x - this.playerPos.x,
        locked.position.z - this.playerPos.z
      );
      return;
    }
    if (Math.hypot(ix, iz) > 0.1) {
      this.faceOrComputeMoveDir(ix, iz, _v1);
      this.playerRotY = Math.atan2(_v1.x, _v1.z);
    }
  }

  private checkPlayerMeleeHits(
    isHeavy: boolean,
    derived: ReturnType<typeof computeDerivedStats>,
    weapon: (typeof WEAPONS)[string]
  ): void {
    const fwdX = Math.sin(this.playerRotY);
    const fwdZ = Math.cos(this.playerRotY);
    const reach = weapon.reach + (isHeavy ? 0.55 : 0);

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead' || this.hasHitTargetIds.has(enemy.id)) continue;
      const dx = enemy.position.x - this.playerPos.x;
      const dz = enemy.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      const hitRadius = enemy.isBoss ? 1.5 : enemy.isElite ? 0.95 : 0.65;
      if (dist > reach + hitRadius) continue;

      const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
      if (dot < 0.25 && dist > 1.25) continue;

      this.hasHitTargetIds.add(enemy.id);
      const isCrit = enemy.state === 'staggered';
      const enemyModifiers = getCompoundingModifiers(getActiveStatusList(enemy.statusTracker));
      const baseAttackDmg = calculateAttackDamage({
        baseDamage: isHeavy ? derived.heavyDamage : derived.lightDamage,
        comboStep: this.comboStep,
        isHeavy,
        isCrit,
        critMultiplier: weapon.critMultiplier + derived.critBonus,
        emberBuffActive: this.emberBuffTimer > 0,
        targetDefense: enemy.isBoss ? 16 : enemy.isElite ? 12 : 4,
      });
      let totalDmg = Math.round(baseAttackDmg * enemyModifiers.incomingDamageMult);

      // Apply weapon status afflictions & compounding bleed burst onto enemy
      const weaponStatus = resolvePlayerWeaponStatus(
        weapon.kind,
        isHeavy,
        this.emberBuffTimer > 0
      );
      if (weaponStatus) {
        const res = applyStatusAffliction(enemy.statusTracker, weaponStatus, enemy.maxHp);
        enemy.statusTracker = res.tracker;
        if (res.triggeredBurstDamage > 0) {
          totalDmg += res.triggeredBurstDamage;
          this.spawnBurst(enemy.position.x, enemy.position.y + 1.2, enemy.position.z, '#e02424', 16);
        }
        if (res.banner) {
          this.showBanner(`${enemy.name.toUpperCase()}: ${res.banner}`);
        }
        this.syncSaveStatusEffects(getActiveStatusList(this.playerStatusTracker));
      }

      enemy.hp = Math.max(0, enemy.hp - totalDmg);
      enemy.aggroed = true;
      enemy.hitFlashTimer = 0.08;
      for (const m of enemy.rig.flashMaterials) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = 0.85;
      }

      const poiseDmg = weapon.poiseDamage * (isHeavy ? 1.65 : 1.0);
      enemy.poise -= poiseDmg;
      if (enemy.poise <= 0 && enemy.hp > 0 && enemy.state !== 'staggered') {
        enemy.state = 'staggered';
        enemy.stateTimer = 1.65;
        enemy.poise = enemy.maxPoise;
        this.showBanner(`${enemy.name.toUpperCase()} STAGGERED · RIPOSTE!`);
      }

      // Knockback, 50ms heavy hit-stop & kinetic camera shake
      const kbMag = isHeavy || isCrit ? 6.5 : 3.2;
      enemy.knockbackVel.set((dx / (dist || 1)) * kbMag, 0, (dz / (dist || 1)) * kbMag);
      this.triggerHitstop(
        getAttackHitstopSeconds({ source: 'player', isHeavy, isCrit })
      );
      this.cameraShake.trigger(
        isHeavy || isCrit ? 'heavy_hit' : 'light_hit',
        dx,
        isHeavy || isCrit ? -0.35 : 0,
        dz
      );
      soundEngine.hit(isHeavy || isCrit);
      this.spawnBurst(
        enemy.position.x,
        enemy.position.y + (enemy.isBoss ? 1.8 : 1.1),
        enemy.position.z,
        isCrit ? '#fbbf24' : '#ff6b2b',
        isHeavy || isCrit ? 22 : 11
      );

      if (enemy.hp <= 0) {
        this.onEnemyKilled(enemy);
      }
    }
  }

  private onEnemyKilled(enemy: EnemyRuntime): void {
    enemy.state = 'dead';
    enemy.deathTimer = 0.55;
    if (enemy.rig.telegraphRing) {
      (enemy.rig.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    if (this.lockedEnemyId === enemy.id) this.lockedEnemyId = null;
    soundEngine.enemyDefeat();
    this.spawnBurst(enemy.position.x, enemy.position.y + 1.2, enemy.position.z, '#f59e0b', 24);

    this.callbacks.updateSave((prev) => {
      const questRes = advanceQuestProgress(prev.quests, enemy.archetype);
      const completedNames = questRes.newlyCompleted.map((q) => q.title).join(', ');
      if (completedNames) {
        this.showBanner(`QUEST COMPLETE: ${completedNames.toUpperCase()}`);
      }
      return {
        ...prev,
        souls: prev.souls + enemy.soulReward,
        enemiesSlain: prev.enemiesSlain + 1,
        bossDefeated: prev.bossDefeated || enemy.isBoss,
        miniBossDefeated: prev.miniBossDefeated || enemy.isElite,
        quests: questRes.quests,
      };
    });

    if (enemy.isBoss) {
      this.showBanner('HEIR OF ASH FELLED');
      soundEngine.victory();
      const snap = this.callbacks.getSave();
      setTimeout(() => {
        if (this.disposed) return;
        this.callbacks.onEndRun({
          outcome: 'victory',
          clearTimeSeconds: Math.round(snap.playTimeSeconds),
          enemiesSlain: snap.enemiesSlain,
          soulsHeld: snap.souls,
          bossHpRemainingPercent: 0,
          level: snap.level,
        });
      }, 950);
    }
  }

  private updateEnemies(
    dt: number,
    derived: ReturnType<typeof computeDerivedStats>,
    playerBlocking: boolean
  ): void {
    // Attack token pool: max 2 simultaneous non-boss melee attackers
    let activeAttackers = this.enemies.filter(
      (e) => !e.isBoss && (e.state === 'windup' || e.state === 'attack')
    ).length;

    for (const e of this.enemies) {
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          for (const m of e.rig.flashMaterials) {
            m.emissive.setHex(0x000000);
            m.emissiveIntensity = 0;
          }
        }
      }

      if (e.state === 'dead') {
        e.deathTimer = Math.max(0, e.deathTimer - dt);
        e.rig.bodyPivot.rotation.x = THREE.MathUtils.damp(
          e.rig.bodyPivot.rotation.x,
          -Math.PI / 2,
          8,
          dt
        );
        e.rig.root.scale.setScalar(Math.max(0.01, e.deathTimer / 0.55));
        if (e.deathTimer <= 0.01) e.rig.root.visible = false;
        continue;
      }

      // Step enemy status effect durations, poison DoT & compounding speed slow
      const enemyStatusStep = stepStatusTracker(e.statusTracker, dt, e.maxHp);
      e.statusTracker = enemyStatusStep.tracker;
      if (enemyStatusStep.tickDamage > 0) {
        e.hp = Math.max(0, e.hp - enemyStatusStep.tickDamage);
        this.spawnBurst(e.position.x, e.position.y + 1.1, e.position.z, '#34d399', 4);
        if (e.hp <= 0) {
          this.onEnemyKilled(e);
          continue;
        }
      }
      const enemySpeedScale = enemyStatusStep.modifiers.moveSpeedMult;

      // Apply decaying knockback
      if (e.knockbackVel.lengthSq() > 0.02) {
        e.position.x += e.knockbackVel.x * dt;
        e.position.z += e.knockbackVel.z * dt;
        e.knockbackVel.multiplyScalar(Math.exp(-10 * dt));
      }

      const toPlayerX = this.playerPos.x - e.position.x;
      const toPlayerZ = this.playerPos.z - e.position.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);
      const targetAngle = Math.atan2(toPlayerX, toPlayerZ);

      // Boss phase 2 transition at < 55% HP
      if (e.isBoss && e.phase === 1 && e.hp < e.maxHp * 0.55) {
        e.phase = 2;
        e.moveSpeed *= 1.18;
        this.showBanner('MALAKOR KINDLES THE CINDER FLAME');
        soundEngine.bossTelegraph();
        this.spawnBurst(e.position.x, e.position.y + 2.0, e.position.z, '#ff4800', 28);
      }

      if (!e.aggroed && dist <= e.aggroRange) {
        e.aggroed = true;
      }

      // Telegraph ring visibility
      if (e.rig.telegraphRing) {
        const ringMat = e.rig.telegraphRing.material as THREE.MeshBasicMaterial;
        ringMat.opacity = e.state === 'windup' ? 0.55 + Math.sin(this.elapsed * 22) * 0.25 : 0;
      }

      if (e.state === 'staggered') {
        e.stateTimer -= dt;
        e.rig.bodyPivot.rotation.x = 0.28;
        if (e.stateTimer <= 0) {
          e.rig.bodyPivot.rotation.x = 0;
          e.state = 'chase';
        }
      } else if (!e.aggroed) {
        // Gentle idle/patrol around spawn
        const patrolAngle = this.elapsed * 0.45 + e.spawnPos.x;
        const goalX = e.spawnPos.x + Math.cos(patrolAngle) * 1.4;
        const goalZ = e.spawnPos.z + Math.sin(patrolAngle) * 1.4;
        e.position.x = THREE.MathUtils.damp(e.position.x, goalX, 2, dt);
        e.position.z = THREE.MathUtils.damp(e.position.z, goalZ, 2, dt);
      } else if (e.state === 'idle' || e.state === 'chase' || e.state === 'strafe') {
        e.rotationY = this.lerpAngle(e.rotationY, targetAngle, 1 - Math.exp(-8 * dt));

        // Distinct Archetype Movement Policies:
        if (e.archetype === 'ash_caster') {
          // Kiter/Ranged: keeps optimal distance (6.5m - 10.5m)
          const spd = e.moveSpeed * enemySpeedScale;
          if (dist < 5.5) {
            e.position.x -= (toPlayerX / (dist || 1)) * spd * dt;
            e.position.z -= (toPlayerZ / (dist || 1)) * spd * dt;
          } else if (dist > 10.5) {
            e.position.x += (toPlayerX / (dist || 1)) * spd * dt;
            e.position.z += (toPlayerZ / (dist || 1)) * spd * dt;
          } else {
            // Strafe laterally
            e.position.x += (-toPlayerZ / (dist || 1)) * e.orbitDir * 1.6 * enemySpeedScale * dt;
            e.position.z += (toPlayerX / (dist || 1)) * e.orbitDir * 1.6 * enemySpeedScale * dt;
          }
          if (dist <= e.attackRange && activeAttackers < 2) {
            e.state = 'windup';
            e.stateTimer = e.windupSeconds;
            e.attackKind = 'bolt';
            e.hasHitThisSwing = false;
            activeAttackers++;
          }
        } else if (e.archetype === 'grave_hound') {
          // Fast Flanker/Charger: circles briefly then lunges
          const spd = (dist < 6.5 ? e.moveSpeed * 1.25 : e.moveSpeed) * enemySpeedScale;
          e.position.x += ((toPlayerX / (dist || 1)) * 0.85 + (-toPlayerZ / (dist || 1)) * 0.35 * e.orbitDir) * spd * dt;
          e.position.z += ((toPlayerZ / (dist || 1)) * 0.85 + (toPlayerX / (dist || 1)) * 0.35 * e.orbitDir) * spd * dt;
          e.gaitPhase += spd * dt * 2.8;
          if (dist <= e.attackRange + 0.8 && activeAttackers < 2) {
            e.state = 'windup';
            e.stateTimer = e.windupSeconds;
            e.attackKind = 'lunge';
            e.hasHitThisSwing = false;
            activeAttackers++;
          }
        } else {
          // Footman / Iron Bulwark / Boss
          const spd = e.moveSpeed * enemySpeedScale;
          if (dist > e.attackRange * 0.85) {
            e.position.x += (toPlayerX / (dist || 1)) * spd * dt;
            e.position.z += (toPlayerZ / (dist || 1)) * spd * dt;
            e.gaitPhase += spd * dt * 2.4;
          } else if (e.isBoss || activeAttackers < 2) {
            e.state = 'windup';
            e.stateTimer = e.isBoss && e.phase === 2 ? e.windupSeconds * 0.85 : e.windupSeconds;
            if (e.isBoss) {
              const roll = Math.random();
              e.attackKind = e.phase === 2 && roll > 0.62 ? 'bolt' : roll > 0.35 ? 'slam' : 'cleave';
              soundEngine.bossTelegraph();
            } else {
              e.attackKind = 'cleave';
            }
            e.hasHitThisSwing = false;
            if (!e.isBoss) activeAttackers++;
          }
        }
      } else if (e.state === 'windup') {
        e.rotationY = this.lerpAngle(e.rotationY, targetAngle, 1 - Math.exp(-5 * dt));
        e.stateTimer -= dt;
        e.rig.armR.rotation.x = THREE.MathUtils.damp(e.rig.armR.rotation.x, -2.15, 10, dt);
        if (e.stateTimer <= 0) {
          e.state = 'attack';
          e.stateTimer = e.activeSeconds;
        }
      } else if (e.state === 'attack') {
        e.stateTimer -= dt;
        e.rig.armR.rotation.x = THREE.MathUtils.damp(e.rig.armR.rotation.x, 0.85, 22, dt);

        if (e.attackKind === 'lunge') {
          e.position.x += Math.sin(e.rotationY) * 8.5 * dt;
          e.position.z += Math.cos(e.rotationY) * 8.5 * dt;
        }

        if (!e.hasHitThisSwing) {
          e.hasHitThisSwing = true;
          if (e.attackKind === 'bolt') {
            this.fireProjectile(e);
            if (e.isBoss) {
              this.fireProjectile(e, -0.35);
              this.fireProjectile(e, 0.35);
            }
          } else {
            const reach = e.attackRange + (e.attackKind === 'slam' ? 1.15 : 0.45);
            const isBossHeavy =
              e.isBoss &&
              (e.attackKind === 'slam' || e.attackKind === 'lunge' || e.phase === 2);
            if (dist <= reach) {
              this.applyHitToPlayer(
                e.damage * (e.attackKind === 'slam' ? 1.25 : 1),
                e,
                derived,
                playerBlocking,
                undefined,
                isBossHeavy
              );
            }
            if (e.attackKind === 'slam') {
              this.spawnBurst(e.position.x, e.position.y + 0.3, e.position.z, '#ff5511', 20);
              this.cameraShake.trigger('boss_slam', 0, -1, 0);
            }
          }
        }

        if (e.stateTimer <= 0) {
          e.state = 'recover';
          e.stateTimer = e.recoverySeconds;
        }
      } else if (e.state === 'recover') {
        e.stateTimer -= dt;
        e.rig.armR.rotation.x = THREE.MathUtils.damp(e.rig.armR.rotation.x, 0, 8, dt);
        if (e.stateTimer <= 0) {
          e.state = 'chase';
        }
      }

      // Resolve obstacles & ground height
      const obsRes = resolveCircleCollisions(e.position.x, e.position.z, 0.55, this.world.obstacles);
      e.position.x = obsRes.x;
      e.position.z = obsRes.z;
      e.position.y = groundHeightAt(e.position.x, e.position.z);

      e.rig.root.position.copy(e.position);
      e.rig.root.rotation.y = e.rotationY;

      // Leg gait animation
      if (e.state === 'chase' || e.state === 'strafe') {
        e.rig.legL.rotation.x = Math.sin(e.gaitPhase) * 0.45;
        e.rig.legR.rotation.x = -Math.sin(e.gaitPhase) * 0.45;
      } else {
        e.rig.legL.rotation.x = THREE.MathUtils.damp(e.rig.legL.rotation.x, 0, 8, dt);
        e.rig.legR.rotation.x = THREE.MathUtils.damp(e.rig.legR.rotation.x, 0, 8, dt);
      }
    }
  }

  private fireProjectile(e: EnemyRuntime, angleOffset = 0): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.life = 2.6;
    slot.damage = e.damage;
    slot.sourceArchetype = e.archetype;
    slot.position.set(e.position.x, e.position.y + (e.isBoss ? 2.1 : 1.35), e.position.z);
    const dirX = this.playerPos.x - slot.position.x;
    const dirZ = this.playerPos.z - slot.position.z;
    const baseAng = Math.atan2(dirX, dirZ) + angleOffset;
    const speed = e.isBoss ? 14.5 : 11.5;
    slot.velocity.set(Math.sin(baseAng) * speed, 0, Math.cos(baseAng) * speed);
    slot.mesh.position.copy(slot.position);
    slot.mesh.visible = true;
  }

  private updateProjectiles(
    dt: number,
    derived: ReturnType<typeof computeDerivedStats>,
    playerBlocking: boolean
  ): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);
      const dist = Math.hypot(p.position.x - this.playerPos.x, p.position.z - this.playerPos.z);
      if (dist < 0.85) {
        p.active = false;
        p.mesh.visible = false;
        this.applyHitToPlayer(p.damage, null, derived, playerBlocking, p.sourceArchetype);
        this.spawnBurst(p.position.x, p.position.y, p.position.z, '#ff5912', 12);
      } else if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  private triggerHitstop(durationSeconds: number): void {
    if (durationSeconds > 0) {
      this.hitstopTimer = Math.max(this.hitstopTimer, durationSeconds);
    }
  }

  private applyHitToPlayer(
    rawDamage: number,
    attacker: EnemyRuntime | null,
    derived: ReturnType<typeof computeDerivedStats>,
    playerBlocking: boolean,
    projectileArchetype?: EnemyArchetype,
    isHeavyAttack = false
  ): void {
    if (this.playerAction === 'dead') return;
    const res = calculateIncomingDamage({
      rawDamage,
      playerDefense: derived.defense,
      isDodgingInvulnerable: this.invulnTimer > 0,
      isBlocking: playerBlocking && (this.playerAction === 'idle' || this.playerAction === 'move'),
      isParryWindow: this.parryTimer > 0 && playerBlocking,
      guardStability: derived.guardStability,
      currentStamina: this.playerStamina,
    });

    if (res.outcome === 'evaded') {
      return;
    }

    const hitstopSeconds = getAttackHitstopSeconds({
      source: attacker?.isBoss ? 'boss' : 'enemy',
      isHeavy: isHeavyAttack,
      outcome: res.outcome,
    });

    if (res.outcome === 'parried') {
      soundEngine.parry();
      this.triggerHitstop(hitstopSeconds);
      const parryDirX = attacker ? attacker.position.x - this.playerPos.x : Math.sin(this.playerRotY);
      const parryDirZ = attacker ? attacker.position.z - this.playerPos.z : Math.cos(this.playerRotY);
      this.cameraShake.trigger('parry', parryDirX, 0.25, parryDirZ);
      this.showBanner('PARRY! COUNTER OPPORTUNITY');
      if (attacker) {
        attacker.state = 'staggered';
        attacker.stateTimer = 2.0;
        this.spawnBurst(attacker.position.x, attacker.position.y + 1.2, attacker.position.z, '#fbbf24', 18);
      }
      return;
    }

    const activeModifiers = getCompoundingModifiers(
      getActiveStatusList(this.playerStatusTracker)
    );
    const effectiveHpDamage =
      res.outcome === 'blocked'
        ? res.hpDamage
        : Math.max(1, Math.round(res.hpDamage * activeModifiers.incomingDamageMult));

    this.playerStamina = Math.max(0, this.playerStamina - res.staminaLost);
    this.playerHp = Math.max(0, this.playerHp - effectiveHpDamage);

    const hitDirX = attacker ? this.playerPos.x - attacker.position.x : -Math.sin(this.playerRotY);
    const hitDirZ = attacker ? this.playerPos.z - attacker.position.z : -Math.cos(this.playerRotY);

    if (res.outcome === 'blocked') {
      soundEngine.block();
      this.triggerHitstop(hitstopSeconds);
      this.cameraShake.trigger(isHeavyAttack ? 'boss_heavy_hit' : 'block', hitDirX, -0.2, hitDirZ);
      this.spawnBurst(
        this.playerPos.x,
        this.playerPos.y + 1.2,
        this.playerPos.z,
        '#f59e0b',
        isHeavyAttack ? 14 : 8
      );
    } else {
      soundEngine.playerHurt();
      this.triggerHitstop(hitstopSeconds);
      this.cameraShake.trigger(isHeavyAttack ? 'boss_heavy_hit' : 'hurt', hitDirX, -0.3, hitDirZ);
      this.hitFlashTimer = 0.1;
      for (const m of this.playerRig.flashMaterials) {
        m.emissive.setHex(0xaa1818);
        m.emissiveIntensity = 0.7;
      }
      const poiseDmg = calculateIncomingPoiseDamage(rawDamage, isHeavyAttack);
      this.playerPoise = Math.max(0, this.playerPoise - poiseDmg);
      this.poiseRegenDelayTimer = 2.4;

      if (this.playerHp > 0 && (res.outcome === 'guard_broken' || this.playerPoise <= 0)) {
        this.triggerPlayerPoiseBreak(res.outcome === 'guard_broken');
      }

      // Apply elemental / status afflictions on unblocked hits using StatusEffectManager
      const sourceType = attacker?.archetype ?? projectileArchetype;
      const incomingEffect = sourceType ? resolveEnemyAttackStatus(sourceType) : null;
      if (incomingEffect) {
        this.applyPlayerStatusEffect(incomingEffect, derived.maxHp);
      }
    }

    if (this.playerHp <= 0) {
      this.playerAction = 'dead';
      this.actionTimer = 0.7;
      this.callbacks.updateSave((prev) => ({ ...prev, deaths: prev.deaths + 1 }));
      soundEngine.defeat();
      this.showBanner('YOU DIED');
    }
  }

  private triggerPlayerPoiseBreak(wasGuardBreak: boolean): void {
    this.playerPoise = 0;
    this.playerAction = 'staggered';
    this.actionTimer = 0.52;
    this.staggerFlashTimer = STAGGER_FLASH_DURATION;
    this.bufferedAction = null;
    this.squashY = 0.78;
    this.haptics.triggerPoiseBreak();
    this.cameraShake.trigger('heavy_hit', 0, -0.45, 0);
    this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.2, this.playerPos.z, '#ef4444', 16);
    this.showBanner(wasGuardBreak ? 'GUARD BROKEN · STAGGERED' : 'POISE BROKEN · STAGGERED');
    this.emitHudSnapshot();
  }

  private applyPlayerStatusEffect(effect: StatusEffectId, maxHp: number): void {
    const res = applyStatusAffliction(this.playerStatusTracker, effect, maxHp);
    this.playerStatusTracker = res.tracker;

    if (res.triggeredBurstDamage > 0) {
      this.playerHp = Math.max(0, this.playerHp - res.triggeredBurstDamage);
      this.spawnBurst(this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, '#e02424', 18);
    }
    if (res.newlyApplied) {
      this.statusParticles.burstEffect(effect, 8);
    }
    if (res.banner) {
      this.showBanner(res.banner);
    }
    this.syncSaveStatusEffects(res.activeEffects);
  }

  private syncSaveStatusEffects(activeEffects: StatusEffectId[]): void {
    const prevEffects = this.callbacks.getSave().statusEffects ?? [];
    const same =
      prevEffects.length === activeEffects.length &&
      prevEffects.every((e, i) => e === activeEffects[i]);
    if (!same) {
      this.callbacks.updateSave((prev) => ({
        ...prev,
        statusEffects: activeEffects,
        activeStatuses: statusEffectsToFlags(activeEffects),
      }));
    }
    this.emitHudSnapshot();
  }

  public updateActiveStatusEffects(
    incomingAttackArchetype: EnemyArchetype | null = null,
    isBlockedOrEvaded = false
  ): StatusEffectId[] {
    const derived = computeDerivedStats(this.callbacks.getSave());
    const envStatus = resolveEnvironmentalStatus(
      getZoneNameAt(this.playerPos.x, this.playerPos.z),
      this.weatherMode
    );
    if (envStatus) {
      this.applyPlayerStatusEffect(envStatus, derived.maxHp);
    }
    if (incomingAttackArchetype && !isBlockedOrEvaded) {
      const atkStatus = resolveEnemyAttackStatus(incomingAttackArchetype);
      if (atkStatus) {
        this.applyPlayerStatusEffect(atkStatus, derived.maxHp);
      }
    }
    return getActiveStatusList(this.playerStatusTracker);
  }

  private animatePlayerRig(dt: number, speed: number, blocking: boolean): void {
    const rig = this.playerRig;
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 10, dt);
    rig.bodyPivot.scale.set(1 / Math.sqrt(this.squashY), this.squashY, 1 / Math.sqrt(this.squashY));

    if (this.playerAction === 'dodge') {
      rig.bodyPivot.rotation.x += 12.5 * dt;
    } else if (this.playerAction === 'staggered') {
      rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, -0.26, 16, dt);
    } else {
      rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, 0, 12, dt);
    }

    if (speed > 0.25 && this.playerAction === 'move') {
      this.gaitPhase += speed * dt * 2.1;
      rig.legL.rotation.x = Math.sin(this.gaitPhase) * 0.52;
      rig.legR.rotation.x = -Math.sin(this.gaitPhase) * 0.52;
      rig.bodyPivot.position.y = Math.abs(Math.sin(this.gaitPhase)) * 0.06;
    } else {
      rig.legL.rotation.x = THREE.MathUtils.damp(rig.legL.rotation.x, 0, 10, dt);
      rig.legR.rotation.x = THREE.MathUtils.damp(rig.legR.rotation.x, 0, 10, dt);
      rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0, 10, dt);
    }

    // Shield arm pose
    const targetArmLX = blocking ? -0.95 : -0.1;
    const targetArmLZ = blocking ? -0.45 : 0.05;
    rig.armL.rotation.x = THREE.MathUtils.damp(rig.armL.rotation.x, targetArmLX, 14, dt);
    rig.armL.rotation.z = THREE.MathUtils.damp(rig.armL.rotation.z, targetArmLZ, 14, dt);

    // Weapon arm swing poses
    let targetArmRX = 0.05;
    let targetArmRY = 0;
    if (this.playerAction === 'light_windup') {
      targetArmRX = -1.65;
      targetArmRY = this.comboStep % 2 === 0 ? 0.6 : -0.6;
    } else if (this.playerAction === 'light_active') {
      targetArmRX = 0.95;
      targetArmRY = this.comboStep % 2 === 0 ? -0.75 : 0.75;
    } else if (this.playerAction === 'heavy_windup') {
      targetArmRX = -2.3;
    } else if (this.playerAction === 'heavy_active') {
      targetArmRX = 1.15;
    } else if (this.playerAction === 'estus') {
      targetArmRX = -1.1;
    }

    rig.armR.rotation.x = THREE.MathUtils.damp(rig.armR.rotation.x, targetArmRX, 18, dt);
    rig.armR.rotation.y = THREE.MathUtils.damp(rig.armR.rotation.y, targetArmRY, 18, dt);

    if (rig.cape) {
      rig.cape.rotation.x = 0.1 + Math.min(0.45, speed * 0.05) + Math.sin(this.elapsed * 3.2) * 0.04;
    }
  }

  private updateCamera(dt: number, settings: GameSettings): void {
    const locked = this.getLockedEnemy();
    if (locked) {
      const dx = locked.position.x - this.playerPos.x;
      const dz = locked.position.z - this.playerPos.z;
      const desiredYaw = Math.atan2(-dx, -dz);
      this.camYaw = this.lerpAngle(this.camYaw, desiredYaw, 1 - Math.exp(-6.5 * dt));
    }

    const horiz = Math.cos(this.camPitch) * this.camDist;
    const vert = Math.sin(this.camPitch) * this.camDist + 1.9;
    const targetPosX = this.playerPos.x + Math.sin(this.camYaw) * horiz;
    const targetPosZ = this.playerPos.z + Math.cos(this.camYaw) * horiz;
    const targetPosY = this.playerPos.y + vert;

    _v2.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
    _camGoal.set(targetPosX, targetPosY, targetPosZ);

    // Wall pull-in raycast
    _v3.copy(_camGoal).sub(_v2);
    const fullDist = _v3.length();
    if (fullDist > 0.1) {
      _v3.divideScalar(fullDist);
      _raycaster.set(_v2, _v3);
      _raycaster.far = fullDist;
      const hits = _raycaster.intersectObjects(this.world.cameraObstacles, false);
      if (hits.length > 0 && hits[0].distance < fullDist) {
        _camGoal.copy(_v2).addScaledVector(_v3, Math.max(1.4, hits[0].distance - 0.35));
      }
    }

    const dampK = 1 - Math.exp(-11 * dt);
    this.camCurrentPos.lerp(_camGoal, dampK);

    if (locked) {
      _lookTarget.set(
        (this.playerPos.x + locked.position.x) * 0.5,
        this.playerPos.y + 1.45,
        (this.playerPos.z + locked.position.z) * 0.5
      );
    } else {
      _lookTarget.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
    }
    this.camCurrentLook.lerp(_lookTarget, dampK);

    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    // Multi-axis trauma + directional recoil + FOV kick camera shake
    const shakeFovOffset = this.cameraShake.applyToCamera(this.camera, dt, this.elapsed);

    // Subtle FOV kick during dodge + heavy attack / parry impact punch
    const baseFov = this.playerAction === 'dodge' ? 62 : settings.graphicsQuality === 'low' ? 56 : 58;
    const targetFov = baseFov + shakeFovOffset;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private animateWorldProps(dt: number, settings: GameSettings): void {
    const flicker = 0.88 + Math.sin(this.elapsed * 11) * 0.12 + Math.cos(this.elapsed * 19) * 0.08;
    this.world.bonfireFlame.scale.set(flicker, 0.95 + Math.sin(this.elapsed * 15) * 0.15, flicker);
    this.bonfireLight.intensity = 4.2 * flicker;

    for (let i = 0; i < this.world.torchFlames.length; i++) {
      const f = this.world.torchFlames[i];
      f.scale.set(1, 0.9 + Math.sin(this.elapsed * 12 + i) * 0.18, 1);
    }

    const fogMat = this.world.fogGateMesh.material as THREE.MeshBasicMaterial;
    fogMat.opacity = this.callbacks.getSave().bossDefeated ? 0.06 : 0.24 + Math.sin(this.elapsed * 2.5) * 0.08;

    // Dynamic weather cycle (ash -> ash_storm -> mist)
    this.weatherTimer += dt;
    if (this.weatherTimer > 32) {
      this.weatherTimer = 0;
      const modes: WeatherMode[] = ['ash', 'ash_storm', 'mist'];
      this.weatherMode = modes[(modes.indexOf(this.weatherMode) + 1) % modes.length];
    }

    this.weatherMesh.visible = settings.weatherEnabled && settings.graphicsQuality !== 'low';
    if (this.weatherMesh.visible) {
      const fallSpd = this.weatherMode === 'ash_storm' ? 3.2 : 1.1;
      const windX = this.weatherMode === 'ash_storm' ? 2.8 : 0.6;
      for (let i = 0; i < this.weatherCount; i++) {
        const idx = i * 3;
        this.weatherPositions[idx] += windX * dt;
        this.weatherPositions[idx + 1] -= fallSpd * dt;
        if (this.weatherPositions[idx + 1] < 0) {
          this.weatherPositions[idx] = this.playerPos.x + (Math.random() - 0.5) * 38;
          this.weatherPositions[idx + 1] = 12 + Math.random() * 3;
          this.weatherPositions[idx + 2] = this.playerPos.z + (Math.random() - 0.5) * 38;
        }
        _dummy.position.set(
          this.weatherPositions[idx],
          this.weatherPositions[idx + 1],
          this.weatherPositions[idx + 2]
        );
        _dummy.rotation.set(this.elapsed + i, this.elapsed * 0.7, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        this.weatherMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.weatherMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private spawnDodgeGhost(count: number): void {
    const cap = this.particles.length;
    for (let i = 0; i < count; i++) {
      this.particleCursor = (this.particleCursor + 1) % cap;
      const slot = this.particles[this.particleCursor];
      slot.active = true;
      slot.pos.set(
        this.playerPos.x + (Math.random() - 0.5) * 0.55,
        this.playerPos.y + 0.35 + Math.random() * 1.25,
        this.playerPos.z + (Math.random() - 0.5) * 0.55
      );
      slot.vel.set(
        -this.dodgeDir.x * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.6,
        0.5 + Math.random() * 0.9,
        -this.dodgeDir.z * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.6
      );
      slot.maxLife = 0.24 + Math.random() * 0.14;
      slot.life = slot.maxLife;
      slot.scale = 1.15 + Math.random() * 0.85;
      slot.color.set(i % 2 === 0 ? '#60a5fa' : '#93c5fd');
      this.particleMesh.setColorAt(this.particleCursor, slot.color);
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private spawnBurst(x: number, y: number, z: number, hexColor: string, count: number): void {
    const cap = this.particles.length;
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % cap;
      slot.active = true;
      slot.pos.set(x, y, z);
      slot.vel.set((Math.random() - 0.5) * 7, 1.5 + Math.random() * 5, (Math.random() - 0.5) * 7);
      slot.maxLife = 0.28 + Math.random() * 0.35;
      slot.life = slot.maxLife;
      slot.scale = 0.7 + Math.random() * 1.1;
      slot.color.set(hexColor);
      this.particleMesh.setColorAt(this.particleCursor, slot.color);
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0);
      } else {
        p.vel.y -= 9.8 * dt;
        p.pos.addScaledVector(p.vel, dt);
        _dummy.position.copy(p.pos);
        _dummy.scale.setScalar(p.scale * (p.life / p.maxLife));
      }
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private toggleLockOn(): void {
    if (this.lockedEnemyId) {
      this.lockedEnemyId = null;
      return;
    }
    let bestId: string | null = null;
    let bestDist = 18;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.position.x - this.playerPos.x, e.position.z - this.playerPos.z);
      if (d < bestDist) {
        bestDist = d;
        bestId = e.id;
      }
    }
    this.lockedEnemyId = bestId;
  }

  private getLockedEnemy(): EnemyRuntime | null {
    if (!this.lockedEnemyId) return null;
    const found = this.enemies.find((e) => e.id === this.lockedEnemyId && e.state !== 'dead');
    if (!found) {
      this.lockedEnemyId = null;
      return null;
    }
    const d = Math.hypot(found.position.x - this.playerPos.x, found.position.z - this.playerPos.z);
    if (d > 24) {
      this.lockedEnemyId = null;
      return null;
    }
    return found;
  }

  private findNearestInteractable() {
    let best: (typeof this.world.interactables)[number] | null = null;
    let bestDist = Infinity;
    for (const item of this.world.interactables) {
      const d = Math.hypot(item.position.x - this.playerPos.x, item.position.z - this.playerPos.z);
      if (d <= item.radius && d < bestDist) {
        best = item;
        bestDist = d;
      }
    }
    return best;
  }

  private openChest(item: (typeof this.world.interactables)[number]): void {
    item.opened = true;
    if (item.chestLid) item.chestLid.rotation.x = -1.75;
    item.sublabel = 'Already Looted';
    soundEngine.estus();
    this.spawnBurst(item.position.x, item.position.y + 0.7, item.position.z, '#fbbf24', 18);
    this.showBanner('FOUND +2 FORGED ASH SHARDS & +180 SOULS');

    this.callbacks.updateSave((prev) => {
      const questRes = advanceQuestProgress(prev.quests, 'chest');
      return {
        ...prev,
        souls: prev.souls + 180,
        upgradeShards: prev.upgradeShards + 2,
        openedChests: prev.openedChests.includes(item.id)
          ? prev.openedChests
          : [...prev.openedChests, item.id],
        quests: questRes.quests,
      };
    });
  }

  private emitHudSnapshot(): void {
    const save = this.callbacks.getSave();
    const derived = computeDerivedStats(save);
    const locked = this.getLockedEnemy();
    let lockedData: LiveHudSnapshot['lockedTarget'] = null;

    if (locked) {
      _v1.set(locked.position.x, locked.position.y + (locked.isBoss ? 2.05 : 1.15), locked.position.z);
      _v1.project(this.camera);
      const visible = _v1.z >= -1 && _v1.z <= 1;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      lockedData = {
        id: locked.id,
        name: locked.name,
        hp: locked.hp,
        maxHp: locked.maxHp,
        staggered: locked.state === 'staggered',
        screenX: ((_v1.x + 1) / 2) * w,
        screenY: ((-_v1.y + 1) / 2) * h,
        visible,
        statusEffects: getActiveStatusList(locked.statusTracker),
      };
    }

    const boss = this.enemies.find((e) => e.isBoss && e.state !== 'dead' && e.aggroed);
    const near = this.findNearestInteractable();

    this.callbacks.onHudUpdate({
      hp: Math.round(this.playerHp),
      maxHp: derived.maxHp,
      hpGhost: Math.round(this.playerHpGhost),
      stamina: Math.round(this.playerStamina),
      maxStamina: derived.maxStamina,
      poise: Math.round(this.playerPoise),
      maxPoise: derived.maxPoise,
      estusCharges: save.estusCharges,
      estusMax: derived.estusMax,
      souls: save.souls,
      level: save.level,
      comboStep: this.comboStep,
      activeBuffTimer: Math.max(0, this.emberBuffTimer),
      guarding: this.wasBlocking,
      lockedTarget: lockedData,
      bossTarget: boss
        ? {
            name: boss.name,
            subtitle: boss.subtitle ?? '',
            hp: Math.round(boss.hp),
            maxHp: boss.maxHp,
            phase: boss.phase,
            staggered: boss.state === 'staggered',
            statusEffects: getActiveStatusList(boss.statusTracker),
          }
        : null,
      interactionPrompt: near
        ? {
            id: near.id,
            label: near.label,
            sublabel: near.sublabel,
            kind: near.kind,
          }
        : null,
      zoneName: getZoneNameAt(this.playerPos.x, this.playerPos.z),
      weather: this.weatherMode,
      statusBanner: this.statusBanner,
      statusEffects: getActiveStatusList(this.playerStatusTracker),
      iframeIntensity: Math.max(0, Math.min(1, this.invulnTimer / 0.3)),
      staggerFlashIntensity: Math.max(
        0,
        Math.min(1, this.staggerFlashTimer / STAGGER_FLASH_DURATION)
      ),
      isStaggered: this.playerAction === 'staggered',
    });
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.haptics.dispose();
    this.statusParticles.dispose();
    this.dodgePostProcess.dispose();
    this.world.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
