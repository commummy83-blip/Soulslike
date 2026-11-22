import * as THREE from 'three';

export interface ProceduralTextureSet {
  cobbleMap: THREE.CanvasTexture;
  cobbleBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  earthMap: THREE.CanvasTexture;
  earthBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const rand = seededRand(4219);

  // 1. Cobblestone causeway & courtyard flagstone (512x512)
  const [cobbleC, cobbleCtx] = makeCanvas(512);
  const [cobbleBC, cobbleBCtx] = makeCanvas(512);
  cobbleCtx.fillStyle = '#23211f';
  cobbleCtx.fillRect(0, 0, 512, 512);
  cobbleBCtx.fillStyle = '#141414';
  cobbleBCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 8;
  const cellW = 512 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset + 3;
      const y = r * cellH + 3;
      const w = cellW - 6;
      const h = cellH - 6;
      const shade = 48 + Math.floor(rand() * 26);
      const warm = Math.floor(rand() * 10);
      cobbleCtx.fillStyle = `rgb(${shade + warm}, ${shade + 2}, ${shade - 3})`;
      cobbleCtx.fillRect(x, y, w, h);

      // Subtle bevel & moss speckles
      const bVal = 155 + Math.floor(rand() * 75);
      cobbleBCtx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
      cobbleBCtx.fillRect(x + 2, y + 2, w - 4, h - 4);
      if (rand() < 0.35) {
        cobbleCtx.fillStyle = 'rgba(54, 66, 44, 0.25)';
        cobbleCtx.fillRect(x, y, w * 0.4, h * 0.3);
      }
    }
  }
  for (let i = 0; i < 1800; i++) {
    const px = rand() * 512;
    const py = rand() * 512;
    const v = 28 + Math.floor(rand() * 48);
    cobbleCtx.fillStyle = `rgba(${v},${v},${v},0.18)`;
    cobbleCtx.fillRect(px, py, 3, 3);
  }

  // 2. Weathered Cathedral / Keep Stone (512x512)
  const [stoneC, stoneCtx] = makeCanvas(512);
  const [stoneBC, stoneBCtx] = makeCanvas(512);
  stoneCtx.fillStyle = '#2d2b2a';
  stoneCtx.fillRect(0, 0, 512, 512);
  stoneBCtx.fillStyle = '#202020';
  stoneBCtx.fillRect(0, 0, 512, 512);

  for (let r = 0; r < 10; r++) {
    const y = r * 51.2;
    const rowOff = (r % 2) * 32;
    for (let c = -1; c < 9; c++) {
      const x = c * 64 + rowOff;
      const v = 52 + Math.floor(rand() * 24);
      stoneCtx.fillStyle = `rgb(${v + 4}, ${v + 1}, ${v - 2})`;
      stoneCtx.fillRect(x + 2, y + 2, 60, 47);

      const bv = 140 + Math.floor(rand() * 80);
      stoneBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      stoneBCtx.fillRect(x + 3, y + 3, 58, 45);
    }
  }

  // 3. Ashen Forest Earth (512x512)
  const [earthC, earthCtx] = makeCanvas(512);
  const [earthBC, earthBCtx] = makeCanvas(512);
  earthCtx.fillStyle = '#24231e';
  earthCtx.fillRect(0, 0, 512, 512);
  earthBCtx.fillStyle = '#707070';
  earthBCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 3200; i++) {
    const px = rand() * 512;
    const py = rand() * 512;
    const sz = 2 + rand() * 7;
    const pick = rand();
    if (pick < 0.45) {
      earthCtx.fillStyle = 'rgba(46, 42, 34, 0.35)';
    } else if (pick < 0.8) {
      earthCtx.fillStyle = 'rgba(34, 44, 29, 0.28)';
    } else {
      earthCtx.fillStyle = 'rgba(72, 69, 64, 0.22)';
    }
    earthCtx.fillRect(px, py, sz, sz);
    const bv = 90 + Math.floor(rand() * 120);
    earthBCtx.fillStyle = `rgba(${bv},${bv},${bv},0.3)`;
    earthBCtx.fillRect(px, py, sz, sz);
  }

  // 4. Soft Radial Contact Shadow Disc (128x128)
  const [shadC, shadCtx] = makeCanvas(128);
  const grad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = grad;
  shadCtx.fillRect(0, 0, 128, 128);

  const setup = (
    canvas: HTMLCanvasElement,
    isColor: boolean,
    repX: number,
    repY: number
  ) => {
    const tex = new THREE.CanvasTexture(canvas);
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  const cobbleMap = setup(cobbleC, true, 5, 10);
  const cobbleBump = setup(cobbleBC, false, 5, 10);
  const stoneMap = setup(stoneC, true, 3, 3);
  const stoneBump = setup(stoneBC, false, 3, 3);
  const earthMap = setup(earthC, true, 16, 16);
  const earthBump = setup(earthBC, false, 16, 16);

  const contactShadowMap = new THREE.CanvasTexture(shadC);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  contactShadowMap.needsUpdate = true;

  return {
    cobbleMap,
    cobbleBump,
    stoneMap,
    stoneBump,
    earthMap,
    earthBump,
    contactShadowMap,
    dispose: () => {
      cobbleMap.dispose();
      cobbleBump.dispose();
      stoneMap.dispose();
      stoneBump.dispose();
      earthMap.dispose();
      earthBump.dispose();
      contactShadowMap.dispose();
    },
  };
}
