import * as THREE from 'three';
import { groundHeightAt, type CircleObstacle } from '../game/combatMath';
import type { EnemyArchetype } from '../game/types';
import { buildBonfire, buildChest, buildNpc } from './models';
import type { ProceduralTextureSet } from './textures';

export interface WorldInteractable {
  id: string;
  kind: 'bonfire' | 'npc' | 'merchant' | 'chest' | 'fog_gate';
  label: string;
  sublabel: string;
  position: THREE.Vector3;
  radius: number;
  chestLid?: THREE.Group;
  opened?: boolean;
}

export interface EnemySpawnDef {
  id: string;
  archetype: EnemyArchetype;
  position: THREE.Vector3;
  patrolRadius: number;
}

export interface WorldData {
  obstacles: CircleObstacle[];
  cameraObstacles: THREE.Object3D[];
  interactables: WorldInteractable[];
  enemySpawns: EnemySpawnDef[];
  bonfireFlame: THREE.Mesh;
  torchFlames: THREE.Mesh[];
  fogGateMesh: THREE.Mesh;
  dispose: () => void;
}

function addArchway(
  parent: THREE.Group,
  x: number,
  z: number,
  width: number,
  height: number,
  stoneMat: THREE.Material,
  obstacles: CircleObstacle[],
  cameraObstacles: THREE.Object3D[]
) {
  const y = groundHeightAt(x, z);
  const pillarW = 1.6;
  const pillarGeo = new THREE.BoxGeometry(pillarW, height, 1.8);

  const left = new THREE.Mesh(pillarGeo, stoneMat);
  left.position.set(x - width / 2, y + height / 2, z);
  const right = new THREE.Mesh(pillarGeo, stoneMat);
  right.position.set(x + width / 2, y + height / 2, z);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + pillarW * 1.4, 1.45, 2.2), stoneMat);
  lintel.position.set(x, y + height + 0.65, z);

  const crest = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), stoneMat);
  crest.rotation.y = Math.PI / 4;
  crest.position.set(x, y + height + 2.4, z);

  left.castShadow = right.castShadow = lintel.castShadow = true;
  left.receiveShadow = right.receiveShadow = lintel.receiveShadow = true;
  parent.add(left, right, lintel, crest);

  obstacles.push({ x: x - width / 2, z, radius: 1.05 });
  obstacles.push({ x: x + width / 2, z, radius: 1.05 });
  cameraObstacles.push(left, right, lintel);
}

function addShack(
  parent: THREE.Group,
  x: number,
  z: number,
  rotY: number,
  stoneMat: THREE.Material,
  woodMat: THREE.Material,
  obstacles: CircleObstacle[],
  cameraObstacles: THREE.Object3D[]
) {
  const y = groundHeightAt(x, z);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 3.8), stoneMat);
  walls.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.2, 4), woodMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 4.0;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 0.3), woodMat);
  beam.position.set(0, 2.95, 1.92);

  walls.castShadow = roof.castShadow = true;
  walls.receiveShadow = roof.receiveShadow = true;
  grp.add(walls, roof, beam);
  parent.add(grp);

  obstacles.push({ x, z, radius: 2.55 });
  cameraObstacles.push(walls, roof);
}

export function buildWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  openedChests: string[]
): WorldData {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const obstacles: CircleObstacle[] = [];
  const cameraObstacles: THREE.Object3D[] = [];
  const interactables: WorldInteractable[] = [];
  const torchFlames: THREE.Mesh[] = [];

  // Shared PBR Materials
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.earthMap,
    bumpMap: textures.earthBump,
    bumpScale: 0.14,
    roughness: 0.94,
    metalness: 0.04,
  });

  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.cobbleMap,
    bumpMap: textures.cobbleBump,
    bumpScale: 0.1,
    roughness: 0.82,
    metalness: 0.08,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.12,
    roughness: 0.84,
    metalness: 0.1,
  });

  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: '#393735',
    bumpMap: textures.stoneBump,
    bumpScale: 0.1,
    roughness: 0.88,
    metalness: 0.12,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    color: '#3c2b1e',
    roughness: 0.92,
    metalness: 0.04,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#9e7c44',
    roughness: 0.34,
    metalness: 0.84,
  });

  const flameMat = new THREE.MeshStandardMaterial({
    color: '#ff8a2a',
    emissive: '#ff5500',
    emissiveIntensity: 2.0,
    roughness: 0.25,
  });

  // 1. Extended Displaced Ground Terrain (surrounds entire world -> no floating edges)
  const terrainGeo = new THREE.PlaneGeometry(180, 190, 64, 64);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i) - 25; // shift to cover z: -120 .. +70
    posAttr.setZ(i, vz);
    let h = groundHeightAt(vx, vz);
    // Raise outer natural valley cliffs past playable boundaries
    if (Math.abs(vx) > 46 || vz > 28 || vz < -82) {
      const edge = Math.max(
        Math.max(0, Math.abs(vx) - 46),
        Math.max(0, vz - 28),
        Math.max(0, -82 - vz)
      );
      h += Math.min(18, edge * 0.45 + Math.sin(vx * 0.22) * Math.cos(vz * 0.2) * 1.4);
    }
    // Carve chasm depression under Shattered Bridge (z: -43 .. -27, |x| > 5.5)
    if (vz < -26 && vz > -44) {
      h -= 5.2;
    }
    posAttr.setY(i, h);
  }
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo, earthMat);
  terrain.receiveShadow = true;
  worldGroup.add(terrain);

  // 2. Sanctum Courtyard Terrace (z: 4..24) - offset +0.025 to avoid z-fighting
  const sanctumFloor = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 16.2, 0.32, 24), cobbleMat);
  sanctumFloor.position.set(0, -0.14, 13);
  sanctumFloor.receiveShadow = true;
  worldGroup.add(sanctumFloor);

  // Main Causeway Road linking Sanctum -> Village -> Bridge
  const causeway = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 30), cobbleMat);
  causeway.position.set(0, -0.05, -10);
  causeway.receiveShadow = true;
  worldGroup.add(causeway);

  // Shattered Bridge Span (y = 0.6)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.2, 20), stoneMat);
  bridge.position.set(0, 0.0, -35);
  bridge.receiveShadow = true;
  bridge.castShadow = true;
  worldGroup.add(bridge);
  cameraObstacles.push(bridge);

  // Bridge parapet battlements
  for (let bz = -43; bz <= -27; bz += 4) {
    for (const side of [-4.45, 4.45]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.25, 1.6), darkStoneMat);
      merlon.position.set(side, 1.22, bz);
      merlon.castShadow = true;
      worldGroup.add(merlon);
    }
  }

  // 3. Cinder Cathedral Boss Arena (z: -48 .. -74)
  const arenaFloor = new THREE.Mesh(new THREE.CylinderGeometry(22, 22.8, 0.34, 32), cobbleMat);
  arenaFloor.position.set(0, -0.15, -60);
  arenaFloor.receiveShadow = true;
  worldGroup.add(arenaFloor);

  // Towering Cathedral Ruins & Pillars (Framing Boss Arena & Visible from Spawn!)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.35;
    // Leave entry gap at front (+Z side of arena)
    if (Math.sin(ang) > 0.72 && Math.abs(Math.cos(ang)) < 0.45) continue;
    const px = Math.cos(ang) * 20.5;
    const pz = -60 + Math.sin(ang) * 20.5;
    const h = 10 + (i % 3) * 2.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, h, 8), stoneMat);
    col.position.set(px, h / 2, pz);
    col.castShadow = true;
    col.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 2.8), darkStoneMat);
    cap.position.set(px, h + 0.35, pz);
    worldGroup.add(col, cap);
    obstacles.push({ x: px, z: pz, radius: 1.35 });
    cameraObstacles.push(col);
  }

  // Cathedral Altar Spire at far north end (z = -75) — tall landmark silhouette visible at spawn!
  const spireBase = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 4), darkStoneMat);
  spireBase.position.set(0, 7, -75);
  const spirePeak = new THREE.Mesh(new THREE.ConeGeometry(4.5, 11, 4), stoneMat);
  spirePeak.rotation.y = Math.PI / 4;
  spirePeak.position.set(0, 19.5, -75);
  const spireSeal = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 8, 24), goldTrimMat);
  spireSeal.position.set(0, 9.5, -72.8);
  spireBase.castShadow = spirePeak.castShadow = true;
  worldGroup.add(spireBase, spirePeak, spireSeal);
  cameraObstacles.push(spireBase);

  // Archways & Fog Gate
  addArchway(worldGroup, 0, 2.5, 6.2, 5.2, stoneMat, obstacles, cameraObstacles);
  addArchway(worldGroup, 0, -24.5, 6.4, 5.4, stoneMat, obstacles, cameraObstacles);
  addArchway(worldGroup, 0, -45.5, 6.6, 5.8, stoneMat, obstacles, cameraObstacles);

  const fogGateGeo = new THREE.PlaneGeometry(5.2, 5.4);
  const fogGateMat = new THREE.MeshBasicMaterial({
    color: '#d99a4e',
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fogGateMesh = new THREE.Mesh(fogGateGeo, fogGateMat);
  fogGateMesh.position.set(0, 2.7, -45.5);
  worldGroup.add(fogGateMesh);

  interactables.push({
    id: 'cathedral_fog_gate',
    kind: 'fog_gate',
    label: 'Traverse the Cinder Mist',
    sublabel: 'Enter Cinder Cathedral Boss Arena',
    position: new THREE.Vector3(0, 0, -44.2),
    radius: 2.8,
  });

  // 4. Forsaken Village Ruins (East & West flanks of Causeway)
  addShack(worldGroup, 12, -6, -0.45, stoneMat, woodMat, obstacles, cameraObstacles);
  addShack(worldGroup, 14, -17, 0.35, stoneMat, woodMat, obstacles, cameraObstacles);
  addShack(worldGroup, -13, -15, 0.72, stoneMat, woodMat, obstacles, cameraObstacles);

  // Crate/Barrel Micro-Vignette Clusters anchored near buildings/pillars
  const crateGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
  const cratePositions: [number, number][] = [
    [9.4, -4.6],
    [10.4, -5.2],
    [-9.8, -13.5],
    [4.4, 4.2],
    [-4.5, 4.4],
  ];
  for (const [cx, cz] of cratePositions) {
    const cy = groundHeightAt(cx, cz);
    const crate = new THREE.Mesh(crateGeo, woodMat);
    crate.position.set(cx, cy + 0.475, cz);
    crate.rotation.y = cx * 0.4;
    crate.castShadow = true;
    crate.receiveShadow = true;
    worldGroup.add(crate);
    obstacles.push({ x: cx, z: cz, radius: 0.65 });
  }

  // 5. Instanced Gnarled Deadwood Trees & Natural Rock Outcrops
  const treeCount = 34;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.56, 5.2, 7);
  trunkGeo.translate(0, 2.6, 0);
  const canopyGeo = new THREE.DodecahedronGeometry(1.85, 0);
  canopyGeo.translate(0, 5.2, 0);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, woodMat, treeCount);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: '#2d3328',
    roughness: 0.92,
    metalness: 0.02,
  });
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  trunkInst.castShadow = true;
  canopyInst.castShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const treeCoords: [number, number][] = [
    [-16, 12], [-22, 6], [-26, -2], [-20, -6], [-28, -14], [-22, -21],
    [-34, -8], [-32, 4], [-30, 16], [-18, 22], [18, 18], [24, 11],
    [22, 2], [28, -4], [24, -12], [29, -20], [19, -22], [35, -10],
    [-34, -30], [-28, -40], [-30, -55], [-29, -68], [29, -32], [32, -46],
    [30, -62], [26, -72], [-18, -74], [18, -75], [-38, 12], [37, 6],
    [-12, 25], [14, 24], [-36, -20], [36, -22],
  ];

  for (let i = 0; i < treeCount; i++) {
    const [tx, tz] = treeCoords[i];
    const ty = groundHeightAt(tx, tz);
    const scale = 0.85 + ((i * 37) % 30) / 100; // ±15%
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, i * 1.17, ((i % 5) - 2) * 0.04);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    canopyInst.setMatrixAt(i, dummy.matrix);

    const tone = 0.78 + ((i * 19) % 35) / 100;
    tint.setRGB(0.18 * tone, 0.21 * tone, 0.16 * tone);
    canopyInst.setColorAt(i, tint);

    if (Math.abs(tx) < 34 && tz > -74 && tz < 24) {
      obstacles.push({ x: tx, z: tz, radius: 0.75 * scale });
    }
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInst.instanceMatrix.needsUpdate = true;
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  worldGroup.add(trunkInst, canopyInst);

  // Instanced Perimeter Boulders
  const rockCount = 28;
  const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);
  const rockInst = new THREE.InstancedMesh(rockGeo, darkStoneMat, rockCount);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2;
    const rx = Math.cos(ang) * (36 + (i % 3) * 5);
    const rz = -22 + Math.sin(ang) * (48 + (i % 4) * 3);
    const ry = groundHeightAt(rx, rz);
    dummy.position.set(rx, ry + 0.6, rz);
    dummy.rotation.set(i * 0.4, i * 0.9, i * 0.2);
    const s = 0.85 + (i % 4) * 0.25;
    dummy.scale.set(s * 1.3, s * 0.9, s);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  rockInst.computeBoundingSphere();
  worldGroup.add(rockInst);

  // 6. Sanctum Bonfire & Torch Braziers
  const bonfire = buildBonfire();
  bonfire.group.position.set(0, 0, 11);
  worldGroup.add(bonfire.group);
  obstacles.push({ x: 0, z: 11, radius: 1.05 });

  interactables.push({
    id: 'sanctum_bonfire',
    kind: 'bonfire',
    label: 'Rest at Sanctum Bonfire',
    sublabel: 'Restore Flasks · Level Up · Upgrade Gear',
    position: new THREE.Vector3(0, 0, 11),
    radius: 3.0,
  });

  const torchSpots: [number, number][] = [
    [-3.6, 2.5], [3.6, 2.5],
    [-3.8, -24.5], [3.8, -24.5],
    [-3.8, -45.5], [3.8, -45.5],
  ];
  const brazierPoleGeo = new THREE.CylinderGeometry(0.1, 0.14, 2.2, 6);
  const flameGeo = new THREE.ConeGeometry(0.22, 0.55, 6);
  for (const [bx, bz] of torchSpots) {
    const by = groundHeightAt(bx, bz);
    const pole = new THREE.Mesh(brazierPoleGeo, darkStoneMat);
    pole.position.set(bx, by + 1.1, bz);
    const tFlame = new THREE.Mesh(flameGeo, flameMat);
    tFlame.position.set(bx, by + 2.42, bz);
    worldGroup.add(pole, tFlame);
    torchFlames.push(tFlame);
  }

  // 7. NPCs in Ashfall Sanctum
  const aldric = buildNpc('oathkeeper', textures.contactShadowMap);
  aldric.position.set(-4.8, 0, 13.4);
  aldric.rotation.y = 0.85;
  worldGroup.add(aldric);
  obstacles.push({ x: -4.8, z: 13.4, radius: 0.65 });
  interactables.push({
    id: 'npc_aldric',
    kind: 'npc',
    label: 'Speak with Aldric the Oathkeeper',
    sublabel: 'Quests & Ashenveil Lore',
    position: new THREE.Vector3(-4.8, 0, 13.4),
    radius: 2.6,
  });

  const vaelen = buildNpc('merchant', textures.contactShadowMap);
  vaelen.position.set(5.2, 0, 12.6);
  vaelen.rotation.y = -0.9;
  worldGroup.add(vaelen);
  obstacles.push({ x: 5.2, z: 12.6, radius: 0.65 });
  interactables.push({
    id: 'npc_vaelen',
    kind: 'merchant',
    label: 'Trade with Vaelen, Ash Merchant',
    sublabel: 'Weapons · Armor · Resins · Shards',
    position: new THREE.Vector3(5.2, 0, 12.6),
    radius: 2.6,
  });

  // 8. Hidden Treasure Chests
  const chestDefs: { id: string; x: number; z: number; rotY: number; label: string }[] = [
    { id: 'chest_village', x: 15.6, z: -10.5, rotY: -1.4, label: 'Open Village Relic Chest' },
    { id: 'chest_woods', x: -18.5, z: -18.5, rotY: 0.65, label: 'Open Hollow Woods Chest' },
    { id: 'chest_sanctum_secret', x: -11.5, z: 18.5, rotY: 2.4, label: 'Open Sanctum Cache' },
  ];

  for (const cd of chestDefs) {
    const chest = buildChest();
    const cy = groundHeightAt(cd.x, cd.z);
    chest.group.position.set(cd.x, cy, cd.z);
    chest.group.rotation.y = cd.rotY;
    const isOpened = openedChests.includes(cd.id);
    if (isOpened) {
      chest.lid.rotation.x = -1.75;
    }
    worldGroup.add(chest.group);
    obstacles.push({ x: cd.x, z: cd.z, radius: 0.72 });
    interactables.push({
      id: cd.id,
      kind: 'chest',
      label: cd.label,
      sublabel: isOpened ? 'Already Looted' : 'Claim Forged Shards & Souls',
      position: new THREE.Vector3(cd.x, cy, cd.z),
      radius: 2.35,
      chestLid: chest.lid,
      opened: isOpened,
    });
  }

  // 9. Enemy Spawns across interconnected zones
  const enemySpawns: EnemySpawnDef[] = [
    {
      id: 'footman_1',
      archetype: 'hollow_footman',
      position: new THREE.Vector3(-2.4, groundHeightAt(-2.4, -4), -4),
      patrolRadius: 3.5,
    },
    {
      id: 'footman_2',
      archetype: 'hollow_footman',
      position: new THREE.Vector3(6.8, groundHeightAt(6.8, -11), -11),
      patrolRadius: 4.0,
    },
    {
      id: 'hound_1',
      archetype: 'grave_hound',
      position: new THREE.Vector3(-9.5, groundHeightAt(-9.5, -9), -9),
      patrolRadius: 4.5,
    },
    {
      id: 'hound_2',
      archetype: 'grave_hound',
      position: new THREE.Vector3(-16.5, groundHeightAt(-16.5, -14), -14),
      patrolRadius: 4.0,
    },
    {
      id: 'caster_1',
      archetype: 'ash_caster',
      position: new THREE.Vector3(-12.5, groundHeightAt(-12.5, -20), -20),
      patrolRadius: 3.0,
    },
    {
      id: 'caster_2',
      archetype: 'ash_caster',
      position: new THREE.Vector3(8.5, groundHeightAt(8.5, -18), -18),
      patrolRadius: 3.0,
    },
    {
      id: 'elite_bulwark',
      archetype: 'iron_bulwark',
      position: new THREE.Vector3(0, groundHeightAt(0, -35), -35),
      patrolRadius: 2.2,
    },
    {
      id: 'boss_malakor',
      archetype: 'cinder_warden',
      position: new THREE.Vector3(0, groundHeightAt(0, -64), -64),
      patrolRadius: 2.5,
    },
  ];

  return {
    obstacles,
    cameraObstacles,
    interactables,
    enemySpawns,
    bonfireFlame: bonfire.flame,
    torchFlames,
    fogGateMesh,
    dispose: () => {
      worldGroup.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
          else m.material.dispose();
        }
      });
      scene.remove(worldGroup);
    },
  };
}
