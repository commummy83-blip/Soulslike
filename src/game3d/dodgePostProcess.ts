import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PLAYER_MESH_LAYER = 1;
export const DODGE_IFRAME_DURATION = 0.3;

const _prevClearColor = new THREE.Color();
const _projStart = new THREE.Vector3();
const _projEnd = new THREE.Vector3();

export function computeIframeIntensity(invulnTimer: number): number {
  if (invulnTimer <= 0) return 0;
  const normalized = Math.max(0, Math.min(1, invulnTimer / DODGE_IFRAME_DURATION));
  // Crisp ramp-in at dodge start and smooth ease-out as i-frames expire
  return Math.sin(normalized * Math.PI * 0.5) * 0.35 + normalized * 0.65;
}

export function markPlayerMeshLayer(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    const isShadowPlane = Array.isArray(mat)
      ? mat.every((m) => m.depthWrite === false)
      : mat.depthWrite === false;
    if (isShadowPlane) {
      obj.layers.disable(PLAYER_MESH_LAYER);
    } else {
      obj.layers.enable(PLAYER_MESH_LAYER);
    }
  });
}

const TrailAccumShader = {
  uniforms: {
    tCurrentMask: { value: null as THREE.Texture | null },
    tPrevTrail: { value: null as THREE.Texture | null },
    uDecay: { value: 0.78 },
    uDrift: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tCurrentMask;
    uniform sampler2D tPrevTrail;
    uniform float uDecay;
    uniform vec2 uDrift;
    varying vec2 vUv;

    void main() {
      vec4 cur = texture2D(tCurrentMask, vUv);
      vec2 prevUv = clamp(vUv + uDrift, 0.001, 0.999);
      vec4 prev = texture2D(tPrevTrail, prevUv) * uDecay;
      vec3 blendedRgb = cur.a > prev.a ? cur.rgb : mix(prev.rgb, cur.rgb, cur.a * 0.5);
      float blendedAlpha = max(cur.a, prev.a);
      gl_FragColor = vec4(blendedRgb, blendedAlpha);
    }
  `,
};

export const DodgeIframeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tPlayerMask: { value: null as THREE.Texture | null },
    tTrailMask: { value: null as THREE.Texture | null },
    uIntensity: { value: 0.0 },
    uDodgeDirScreen: { value: new THREE.Vector2(0, -1) },
    uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tPlayerMask;
    uniform sampler2D tTrailMask;
    uniform float uIntensity;
    uniform vec2 uDodgeDirScreen;
    uniform vec2 uTexelSize;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      if (uIntensity <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 fromCenter = vUv - 0.5;
      float radial = length(fromCenter);
      vec2 radialDir = radial > 0.0001 ? fromCenter / radial : vec2(0.0, 1.0);
      float dirLen = length(uDodgeDirScreen);
      vec2 motionDir = dirLen > 0.0001 ? uDodgeDirScreen / dirLen : vec2(0.0, -1.0);

      // 1. Subtle screen-space + player-silhouette chromatic aberration
      vec4 selfMask = texture2D(tPlayerMask, vUv);
      vec2 edgeStep = uTexelSize * 2.5;
      float aL = texture2D(tPlayerMask, clamp(vUv - vec2(edgeStep.x, 0.0), 0.001, 0.999)).a;
      float aR = texture2D(tPlayerMask, clamp(vUv + vec2(edgeStep.x, 0.0), 0.001, 0.999)).a;
      float aD = texture2D(tPlayerMask, clamp(vUv - vec2(0.0, edgeStep.y), 0.001, 0.999)).a;
      float aU = texture2D(tPlayerMask, clamp(vUv + vec2(0.0, edgeStep.y), 0.001, 0.999)).a;
      float silhouetteEdge = clamp((abs(aR - aL) + abs(aU - aD)) * 1.4, 0.0, 1.0);

      vec2 aberOffset = (
        radialDir * (0.0008 + 0.0026 * radial) +
        motionDir * (0.0014 + silhouetteEdge * 0.0028)
      ) * uIntensity;

      float r = texture2D(tDiffuse, clamp(vUv + aberOffset, 0.001, 0.999)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, clamp(vUv - aberOffset, 0.001, 0.999)).b;
      vec3 sceneRgb = vec3(r, g, b);

      // 2. Player-mesh ghosting trail (directional silhouette echoes behind player + temporal accumulation)
      vec3 ghostAccum = vec3(0.0);
      float ghostWeightSum = 0.0;

      for (int i = 1; i <= 5; i++) {
        float fi = float(i);
        // Sample forward along +motionDir so trailing echoes render behind (-motionDir) the moving player
        vec2 ghostUv = vUv + motionDir * (fi * 0.0145 * (0.45 + 0.55 * uIntensity));
        ghostUv.x += sin(vUv.y * 44.0 + uTime * 20.0 + fi) * 0.0009 * uIntensity;
        ghostUv = clamp(ghostUv, 0.001, 0.999);

        // Subtle RGB dispersion on each ghosted silhouette echo
        vec2 ghostSplit = motionDir * (0.0022 * uIntensity);
        float gr = texture2D(tPlayerMask, clamp(ghostUv + ghostSplit, 0.001, 0.999)).r;
        vec4 gc = texture2D(tPlayerMask, ghostUv);
        float gb = texture2D(tPlayerMask, clamp(ghostUv - ghostSplit, 0.001, 0.999)).b;
        float ga = max(gc.a, max(
          texture2D(tPlayerMask, clamp(ghostUv + ghostSplit, 0.001, 0.999)).a,
          texture2D(tPlayerMask, clamp(ghostUv - ghostSplit, 0.001, 0.999)).a
        ) * 0.65);

        vec3 splitColor = vec3(gr, gc.g, gb);
        vec3 spectralTint = mix(vec3(0.32, 0.72, 1.0), vec3(0.34, 0.4, 0.95), fi / 5.0);
        float w = exp(-fi * 0.42) * ga;
        ghostAccum += mix(splitColor, spectralTint, 0.72) * w;
        ghostWeightSum += w;
      }

      vec4 prevTrail = texture2D(tTrailMask, vUv);
      float outsidePlayer = 1.0 - smoothstep(0.15, 0.85, selfMask.a);

      vec3 dirGhostColor = ghostWeightSum > 0.001
        ? ghostAccum / ghostWeightSum
        : vec3(0.34, 0.72, 1.0);
      vec3 temporalGhostColor = mix(prevTrail.rgb, vec3(0.3, 0.62, 1.0), 0.78);
      float temporalStrength = prevTrail.a * 0.42;
      float dirStrength = clamp(ghostWeightSum * 0.48, 0.0, 0.72);

      vec3 combinedGhost = mix(
        temporalGhostColor,
        dirGhostColor,
        clamp(dirStrength / max(dirStrength + temporalStrength, 0.001), 0.0, 1.0)
      );
      float trailMask = clamp((dirStrength + temporalStrength * 0.68) * uIntensity, 0.0, 0.62);
      float blendFactor = trailMask * mix(0.12, 1.0, outsidePlayer);

      sceneRgb = mix(sceneRgb, max(sceneRgb, combinedGhost * 1.04), blendFactor);
      sceneRgb += combinedGhost * (blendFactor * 0.16);

      // Subtle spectral chromatic outline rim on the player mesh during i-frames
      vec3 rimChroma = mix(vec3(0.28, 0.76, 1.0), vec3(0.84, 0.46, 0.96), clamp(vUv.x, 0.0, 1.0));
      sceneRgb += rimChroma * (silhouetteEdge * 0.16 * uIntensity);

      gl_FragColor = vec4(sceneRgb, 1.0);
    }
  `,
};

export class DodgePostProcessor {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private dodgePass: ShaderPass;
  private outputPass: OutputPass;

  private playerMaskTarget: THREE.WebGLRenderTarget;
  private trailTargetA: THREE.WebGLRenderTarget;
  private trailTargetB: THREE.WebGLRenderTarget;
  private trailRead: THREE.WebGLRenderTarget;
  private trailWrite: THREE.WebGLRenderTarget;

  private trailScene: THREE.Scene;
  private trailCamera: THREE.OrthographicCamera;
  private trailMaterial: THREE.ShaderMaterial;
  private trailQuad: THREE.Mesh;
  private trailNeedsClear = true;
  private dodgeScreenDir = new THREE.Vector2(0, -1);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const maskW = Math.max(1, Math.floor(width * 0.7));
    const maskH = Math.max(1, Math.floor(height * 0.7));
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.playerMaskTarget = new THREE.WebGLRenderTarget(maskW, maskH, {
      ...rtOpts,
      depthBuffer: true,
    });
    this.trailTargetA = new THREE.WebGLRenderTarget(maskW, maskH, rtOpts);
    this.trailTargetB = new THREE.WebGLRenderTarget(maskW, maskH, rtOpts);
    this.trailRead = this.trailTargetA;
    this.trailWrite = this.trailTargetB;

    this.trailScene = new THREE.Scene();
    this.trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.trailMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(TrailAccumShader.uniforms),
      vertexShader: TrailAccumShader.vertexShader,
      fragmentShader: TrailAccumShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.trailQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trailMaterial);
    this.trailScene.add(this.trailQuad);

    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);
    this.renderPass = new RenderPass(scene, camera);
    this.dodgePass = new ShaderPass(DodgeIframeShader);
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.dodgePass);
    this.composer.addPass(this.outputPass);

    this.dodgePass.uniforms.uTexelSize.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  public setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.composer.setSize(w, h);
    const maskW = Math.max(1, Math.floor(w * 0.7));
    const maskH = Math.max(1, Math.floor(h * 0.7));
    this.playerMaskTarget.setSize(maskW, maskH);
    this.trailTargetA.setSize(maskW, maskH);
    this.trailTargetB.setSize(maskW, maskH);
    this.dodgePass.uniforms.uTexelSize.value.set(1 / w, 1 / h);
    this.trailNeedsClear = true;
  }

  public resetTrail(): void {
    if (this.trailNeedsClear) return;
    this.trailNeedsClear = true;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.getClearColor(_prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.trailTargetA);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(this.trailTargetB);
    this.renderer.clear(true, false, false);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(_prevClearColor, prevClearAlpha);
  }

  public renderWithDodgeEffect(
    dt: number,
    elapsed: number,
    invulnTimer: number,
    playerPos: THREE.Vector3,
    dodgeDir: THREE.Vector3
  ): void {
    const intensity = computeIframeIntensity(invulnTimer);
    if (intensity <= 0.001) {
      this.resetTrail();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Project 3D dodge vector into 2D screen UV direction
    _projStart.copy(playerPos).addScaledVector(THREE.Object3D.DEFAULT_UP, 1.0).project(this.camera);
    _projEnd
      .copy(playerPos)
      .addScaledVector(THREE.Object3D.DEFAULT_UP, 1.0)
      .addScaledVector(dodgeDir, 1.5)
      .project(this.camera);
    const dx = (_projEnd.x - _projStart.x) * 0.5;
    const dy = (_projEnd.y - _projStart.y) * 0.5;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      this.dodgeScreenDir.set(dx / len, dy / len);
    } else {
      this.dodgeScreenDir.set(0, -1);
    }

    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevLayersMask = this.camera.layers.mask;
    const prevShadowAuto = this.renderer.shadowMap.autoUpdate;
    this.renderer.getClearColor(_prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();

    // 1. Render isolated player mesh into offscreen alpha mask target
    this.scene.background = null;
    this.scene.fog = null;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera.layers.set(PLAYER_MESH_LAYER);
    this.renderer.setRenderTarget(this.playerMaskTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.renderer.shadowMap.autoUpdate = prevShadowAuto;

    // 2. Accumulate decaying temporal ghost silhouette trail
    if (this.trailNeedsClear) {
      this.renderer.setRenderTarget(this.trailRead);
      this.renderer.clear(true, false, false);
      this.trailNeedsClear = false;
    }
    this.trailMaterial.uniforms.tCurrentMask.value = this.playerMaskTarget.texture;
    this.trailMaterial.uniforms.tPrevTrail.value = this.trailRead.texture;
    this.trailMaterial.uniforms.uDecay.value = Math.exp(-dt * 7.2);
    this.trailMaterial.uniforms.uDrift.value
      .copy(this.dodgeScreenDir)
      .multiplyScalar(dt * 0.045);

    this.renderer.setRenderTarget(this.trailWrite);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.trailScene, this.trailCamera);

    // Swap ping-pong trail targets
    const tmp = this.trailRead;
    this.trailRead = this.trailWrite;
    this.trailWrite = tmp;

    // Restore scene & renderer state before running EffectComposer
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    this.camera.layers.mask = prevLayersMask;
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(_prevClearColor, prevClearAlpha);

    // 3. Configure ShaderPass uniforms & run EffectComposer (RenderPass -> DodgeIframeShader -> OutputPass)
    this.dodgePass.uniforms.tPlayerMask.value = this.playerMaskTarget.texture;
    this.dodgePass.uniforms.tTrailMask.value = this.trailRead.texture;
    this.dodgePass.uniforms.uIntensity.value = intensity;
    this.dodgePass.uniforms.uDodgeDirScreen.value.copy(this.dodgeScreenDir);
    this.dodgePass.uniforms.uTime.value = elapsed;

    this.composer.render(dt);
  }

  public dispose(): void {
    this.playerMaskTarget.dispose();
    this.trailTargetA.dispose();
    this.trailTargetB.dispose();
    this.trailMaterial.dispose();
    this.trailQuad.geometry.dispose();
    this.renderPass.dispose();
    this.dodgePass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
