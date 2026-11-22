import * as THREE from 'three';
import type { AppearanceConfig, EnemyArchetype, WeaponKind } from '../game/types';

export interface ArticulatedRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Group;
  cape?: THREE.Mesh;
  weaponPivot?: THREE.Group;
  telegraphRing?: THREE.Mesh;
  flashMaterials: THREE.MeshStandardMaterial[];
}

function makeMat(
  color: string | number,
  roughness: number,
  metalness: number,
  emissive?: string | number,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive: emissive ?? 0x000000,
    emissiveIntensity,
  });
}

export function createContactShadow(
  shadowTex: THREE.CanvasTexture,
  radius: number
): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

export function buildWeaponMesh(kind: WeaponKind, bladeColor: string): THREE.Group {
  const grp = new THREE.Group();
  const metalMat = makeMat(bladeColor, 0.24, 0.88);
  const hiltMat = makeMat('#2b211a', 0.82, 0.12);
  const guardMat = makeMat('#9c7b43', 0.34, 0.82);

  if (kind === 'sword') {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.26, 8), hiltMat);
    grip.position.y = 0.12;
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), guardMat);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.07), guardMat);
    guard.position.y = 0.26;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 1.05, 0.025), metalMat);
    blade.position.y = 0.8;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 4), metalMat);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 1.41;
    grp.add(grip, pommel, guard, blade, tip);
  } else if (kind === 'greatsword') {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.4, 8), hiltMat);
    grip.position.y = 0.18;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.09), guardMat);
    guard.position.y = 0.4;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.48, 0.036), metalMat);
    blade.position.y = 1.15;
    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 1.15, 0.044),
      makeMat('#281f1b', 0.55, 0.45)
    );
    fuller.position.y = 1.08;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.28, 4), metalMat);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 2.02;
    grp.add(grip, guard, blade, fuller, tip);
  } else if (kind === 'daggers') {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.2, 8), hiltMat);
    grip.position.y = 0.1;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.05), guardMat);
    guard.position.y = 0.21;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.018), metalMat);
    blade.position.y = 0.52;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.14, 4), metalMat);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 0.88;
    grp.add(grip, guard, blade, tip);
  } else {
    // Halberd
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 2.05, 8), hiltMat);
    shaft.position.y = 0.88;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), guardMat);
    collar.position.y = 1.78;
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 4), metalMat);
    spearTip.rotation.y = Math.PI / 4;
    spearTip.position.y = 2.1;
    const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.025), metalMat);
    axeBlade.position.set(0.16, 1.76, 0);
    grp.add(shaft, collar, spearTip, axeBlade);
  }

  grp.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
    }
  });
  return grp;
}

export function buildPlayerRig(
  appearance: AppearanceConfig,
  weaponKind: WeaponKind,
  bladeColor: string,
  shadowTex: THREE.CanvasTexture
): ArticulatedRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const plateMat = makeMat(appearance.armorTint, 0.34, 0.85);
  const chainMat = makeMat('#24272c', 0.54, 0.72);
  const leatherMat = makeMat('#3a2a1f', 0.84, 0.08);
  const cloakMat = makeMat(appearance.cloakTint, 0.9, 0.04);
  const bronzeMat = makeMat('#9c7f4d', 0.35, 0.84);
  const darkRecessMat = makeMat('#111418', 0.85, 0.15);
  const visorMat =
    appearance.visorGlow.toLowerCase() === '#11151a'
      ? darkRecessMat
      : makeMat(appearance.visorGlow, 0.35, 0.2, appearance.visorGlow, 0.9);
  const flashMaterials = [plateMat, chainMat, leatherMat, cloakMat, bronzeMat];

  // Legs: Chainmail hips, cuisses, sculpted knee poleyns, strapped greaves & pointed sabatons
  const makeLeg = (xOff: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOff, 0.88, 0);

    const thighMail = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.38, 8), chainMat);
    thighMail.position.y = -0.19;
    const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.122, 0.26, 8), plateMat);
    cuisse.position.set(0, -0.22, 0.015);
    const kneePoleyn = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6), plateMat);
    kneePoleyn.position.set(0, -0.4, 0.055);
    kneePoleyn.scale.set(1.0, 1.1, 0.85);

    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.092, 0.44, 8), plateMat);
    greave.position.y = -0.62;
    const ankleStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.108, 0.05, 8), leatherMat);
    ankleStrap.position.y = -0.52;

    const sabaton = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.1, 0.28), plateMat);
    sabaton.position.set(0, -0.82, 0.04);
    const toePoint = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.14, 4), plateMat);
    toePoint.rotation.x = Math.PI / 2;
    toePoint.rotation.y = Math.PI / 4;
    toePoint.position.set(0, -0.83, 0.22);

    leg.add(thighMail, cuisse, kneePoleyn, greave, ankleStrap, sabaton, toePoint);
    return leg;
  };
  const legL = makeLeg(-0.18);
  const legR = makeLeg(0.18);
  bodyPivot.add(legL, legR);

  // Pelvis, Chainmail Skirt, Cobalt Surcoat, Leather Cross-Strap & Bronze Waist Buckle
  const pelvisMail = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.26, 10), chainMat);
  pelvisMail.position.y = 0.88;

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.36), plateMat);
  chestPlate.position.y = 1.28;

  const surcoat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.38), cloakMat);
  surcoat.position.y = 1.27;

  // Diagonal leather baldric strap across chest (recessed behind cape in back)
  const baldric = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.7, 0.36), leatherMat);
  baldric.position.set(0, 1.3, 0.02);
  baldric.rotation.z = -0.58;
  const strapBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.06), bronzeMat);
  strapBuckle.position.set(0.08, 1.38, 0.19);
  strapBuckle.rotation.z = -0.58;

  // Waist belt + central circular bronze medallion buckle
  const waistBelt = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.095, 0.4), leatherMat);
  waistBelt.position.y = 1.01;
  const beltBuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), bronzeMat);
  beltBuckle.rotation.x = Math.PI / 2;
  beltBuckle.position.set(0, 1.01, 0.2);

  // Side armored hip tassets
  const tassetL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.28), plateMat);
  tassetL.position.set(-0.29, 0.87, 0);
  tassetL.rotation.z = 0.16;
  const tassetR = tassetL.clone();
  tassetR.position.x = 0.29;
  tassetR.rotation.z = -0.16;

  // Front tattered cobalt tabard hanging between legs
  const frontTabard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.48, 0.03), cloakMat);
  frontTabard.position.set(0, 0.74, 0.18);
  frontTabard.rotation.x = -0.05;
  const tabardTailL = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 4), cloakMat);
  tabardTailL.rotation.x = Math.PI;
  tabardTailL.scale.set(1, 1, 0.22);
  tabardTailL.position.set(-0.07, -0.32, 0);
  const tabardTailR = tabardTailL.clone();
  tabardTailR.position.x = 0.07;
  frontTabard.add(tabardTailL, tabardTailR);

  // Hip Scabbard (wearer's right hip matching front/side turnarounds)
  const scabbard = new THREE.Group();
  scabbard.position.set(0.29, 0.92, -0.04);
  scabbard.rotation.set(0.38, 0, -0.18);
  const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.78, 0.09), leatherMat);
  sheath.position.y = -0.34;
  const sheathTip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), plateMat);
  sheathTip.rotation.x = Math.PI;
  sheathTip.position.y = -0.78;
  const hiltStub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), leatherMat);
  hiltStub.position.y = 0.12;
  const hiltGuard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.18), plateMat);
  hiltGuard.position.y = 0.04;
  scabbard.add(sheath, sheathTip, hiltStub, hiltGuard);

  bodyPivot.add(
    pelvisMail,
    chestPlate,
    surcoat,
    baldric,
    strapBuckle,
    waistBelt,
    beltBuckle,
    tassetL,
    tassetR,
    frontTabard,
    scabbard
  );

  // Wrapped Cobalt Neck Cowl / Scarf & Asymmetric Tattered Flowing Cape
  const cowlRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.085, 8, 14), cloakMat);
  cowlRing.rotation.x = Math.PI / 2;
  cowlRing.position.set(0, 1.59, -0.01);
  const cowlFrontFold = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.12), cloakMat);
  cowlFrontFold.position.set(0.06, 1.52, 0.18);
  cowlFrontFold.rotation.z = -0.25;
  bodyPivot.add(cowlRing, cowlFrontFold);

  // Multi-layered tattered cobalt cape (flat cloth tails parented so they drape cleanly)
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.02, 0.04), cloakMat);
  cape.position.set(-0.04, 1.04, -0.24);
  cape.rotation.set(0.11, 0, -0.06);
  const capeTailL = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.46, 4), cloakMat);
  capeTailL.rotation.x = Math.PI;
  capeTailL.scale.set(1.05, 1, 0.16);
  capeTailL.position.set(-0.18, -0.68, 0);
  capeTailL.rotation.z = -0.08;
  const capeTailM = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 4), cloakMat);
  capeTailM.rotation.x = Math.PI;
  capeTailM.scale.set(1, 1, 0.16);
  capeTailM.position.set(0.01, -0.62, 0);
  const capeTailR = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 4), cloakMat);
  capeTailR.rotation.x = Math.PI;
  capeTailR.scale.set(1, 1, 0.16);
  capeTailR.position.set(0.18, -0.64, 0);
  capeTailR.rotation.z = 0.08;
  cape.add(capeTailL, capeTailM, capeTailR);
  bodyPivot.add(cape);

  // Head & Pointed Sallet Visor Helm (matching Head Front & Profile views)
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);

  const helmSkull = new THREE.Mesh(new THREE.SphereGeometry(0.195, 12, 10), plateMat);
  helmSkull.position.set(0, 0.19, -0.01);
  helmSkull.scale.set(0.95, 1.08, 1.04);

  // Central sagittal steel ridge fin on crown
  const helmCrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.34), plateMat);
  helmCrest.position.set(0, 0.37, -0.02);

  // Tapered chin / faceplate mask
  const faceplate = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.125, 0.24, 8), plateMat);
  faceplate.position.set(0, 0.08, 0.03);

  // Forward-jutting pointed sallet brow/beak visor
  const visorBeak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 4), plateMat);
  visorBeak.rotation.x = Math.PI / 2 + 0.18;
  visorBeak.rotation.y = Math.PI / 4;
  visorBeak.scale.set(1.15, 1.0, 0.45);
  visorBeak.position.set(0, 0.18, 0.22);

  // Eye slit under brow beak
  const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.036, 0.06), visorMat);
  visorSlit.position.set(0, 0.135, 0.175);

  // Vertical breathing grille slots on lower faceplate
  for (let i = -2; i <= 2; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.03), darkRecessMat);
    slot.position.set(i * 0.036, 0.045, 0.168 - Math.abs(i) * 0.012);
    head.add(slot);
  }

  // Cobalt cloth wrap hugging back of helmet neck
  const backCloth = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.21, 0.22, 9), cloakMat);
  backCloth.position.set(0, 0.04, -0.05);
  head.add(helmSkull, helmCrest, faceplate, visorBeak, visorSlit, backCloth);

  if (appearance.crestStyle === 'horned') {
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 6), bronzeMat);
    hornL.position.set(-0.17, 0.31, 0.01);
    hornL.rotation.z = 0.48;
    const hornR = hornL.clone();
    hornR.position.x = 0.17;
    hornR.rotation.z = -0.48;
    head.add(hornL, hornR);
  } else if (appearance.crestStyle === 'crowned') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.075, 8), bronzeMat);
    crown.position.y = 0.33;
    head.add(crown);
  } else if (appearance.crestStyle === 'hooded') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.36, 8), cloakMat);
    hood.position.set(0, 0.24, -0.05);
    hood.rotation.x = -0.25;
    head.add(hood);
  }
  bodyPivot.add(head);

  // Left Arm: Layered Engraved Pauldron + Chainmail Sleeve + Flanged Vambrace + Kite Shield
  const armL = new THREE.Group();
  armL.position.set(-0.37, 1.48, 0);
  const pauldronL1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.65), plateMat);
  pauldronL1.rotation.z = 0.35;
  const pauldronL2 = new THREE.Mesh(new THREE.SphereGeometry(0.145, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), plateMat);
  pauldronL2.position.set(-0.02, -0.08, 0);
  pauldronL2.rotation.z = 0.45;
  const pauldronTrimL = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 12), bronzeMat);
  pauldronTrimL.rotation.x = Math.PI / 2;
  pauldronTrimL.position.set(0.02, 0.05, 0);

  const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.28, 8), chainMat);
  upperArmL.position.y = -0.18;
  const vambraceL = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.28, 8), plateMat);
  vambraceL.position.y = -0.44;
  const elbowFinL = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), plateMat);
  elbowFinL.position.set(-0.07, -0.32, -0.04);
  elbowFinL.rotation.z = 0.7;

  const shield = new THREE.Group();
  shield.position.set(-0.12, -0.34, 0.14);
  shield.rotation.y = Math.PI / 2;
  const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.05), plateMat);
  const shieldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.03), bronzeMat);
  shieldTrim.position.z = -0.01;
  const shieldCrest = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.055), cloakMat);
  const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), bronzeMat);
  shieldBoss.position.z = 0.03;
  shield.add(shieldFace, shieldTrim, shieldCrest, shieldBoss);
  armL.add(pauldronL1, pauldronL2, pauldronTrimL, upperArmL, vambraceL, elbowFinL, shield);
  bodyPivot.add(armL);

  // Right Arm: Layered Pauldron + Chainmail Sleeve + Flanged Vambrace + Active Weapon
  const armR = new THREE.Group();
  armR.position.set(0.37, 1.48, 0);
  const pauldronR1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.65), plateMat);
  pauldronR1.rotation.z = -0.35;
  const pauldronR2 = new THREE.Mesh(new THREE.SphereGeometry(0.145, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), plateMat);
  pauldronR2.position.set(0.02, -0.08, 0);
  pauldronR2.rotation.z = -0.45;
  const pauldronTrimR = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 12), bronzeMat);
  pauldronTrimR.rotation.x = Math.PI / 2;
  pauldronTrimR.position.set(-0.02, 0.05, 0);

  const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.28, 8), chainMat);
  upperArmR.position.y = -0.18;
  const vambraceR = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.28, 8), plateMat);
  vambraceR.position.y = -0.44;
  const elbowFinR = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), plateMat);
  elbowFinR.position.set(0.07, -0.32, -0.04);
  elbowFinR.rotation.z = -0.7;

  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0, -0.56, 0.06);
  weaponPivot.rotation.x = Math.PI / 2 - 0.18;
  weaponPivot.add(buildWeaponMesh(weaponKind, bladeColor));
  armR.add(pauldronR1, pauldronR2, pauldronTrimR, upperArmR, vambraceR, elbowFinR, weaponPivot);
  bodyPivot.add(armR);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  root.add(createContactShadow(shadowTex, 0.74));

  return {
    root,
    bodyPivot,
    armR,
    armL,
    legL,
    legR,
    head,
    cape,
    weaponPivot,
    flashMaterials,
  };
}

export function buildEnemyRig(
  archetype: EnemyArchetype,
  shadowTex: THREE.CanvasTexture
): ArticulatedRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const reg = (m: THREE.MeshStandardMaterial) => {
    flashMaterials.push(m);
    return m;
  };

  let armL = new THREE.Group();
  let armR = new THREE.Group();
  let legL = new THREE.Group();
  let legR = new THREE.Group();
  let head = new THREE.Group();
  let weaponPivot: THREE.Group | undefined;

  if (archetype === 'hollow_footman') {
    const cloth = reg(makeMat('#3b352f', 0.9, 0.05));
    const rust = reg(makeMat('#594c42', 0.52, 0.65));
    const eyeMat = reg(makeMat('#e87b35', 0.3, 0.1, '#e87b35', 0.9));

    legL.position.set(-0.15, 0.8, 0);
    legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.78, 7), cloth));
    legL.children[0].position.y = -0.39;
    legR.position.set(0.15, 0.8, 0);
    legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.78, 7), cloth));
    legR.children[0].position.y = -0.39;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.3), cloth);
    torso.position.y = 1.12;
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.33), rust);
    chestPlate.position.y = 1.24;

    head.position.set(0, 1.54, 0.04);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), rust);
    skull.position.y = 0.1;
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.06), eyeMat);
    eyes.position.set(0, 0.1, 0.14);
    head.add(skull, eyes);

    armL.position.set(-0.3, 1.38, 0);
    const lMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.54, 7), cloth);
    lMesh.position.y = -0.26;
    armL.add(lMesh);

    armR.position.set(0.3, 1.38, 0);
    const rMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.54, 7), cloth);
    rMesh.position.y = -0.26;
    weaponPivot = new THREE.Group();
    weaponPivot.position.set(0, -0.5, 0.05);
    weaponPivot.rotation.x = Math.PI / 2 - 0.15;
    weaponPivot.add(buildWeaponMesh('sword', '#7c756d'));
    armR.add(rMesh, weaponPivot);

    bodyPivot.add(legL, legR, torso, chestPlate, head, armL, armR);
    root.add(createContactShadow(shadowTex, 0.64));
  } else if (archetype === 'ash_caster') {
    const robe = reg(makeMat('#281c24', 0.92, 0.04));
    const trim = reg(makeMat('#8f5932', 0.45, 0.55));
    const ember = reg(makeMat('#ff6a2b', 0.25, 0.1, '#ff5412', 1.4));

    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 10), robe);
    skirt.position.y = 0.48;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.68, 8), robe);
    torso.position.y = 1.18;
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), trim);
    sash.position.y = 0.96;

    head.position.set(0, 1.56, 0);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.44, 8), robe);
    hood.position.y = 0.16;
    const faceGlow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), ember);
    faceGlow.position.set(0, 0.09, 0.11);
    head.add(hood, faceGlow);

    armL.position.set(-0.28, 1.38, 0);
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 7), robe);
    lArm.position.y = -0.24;
    armL.add(lArm);

    armR.position.set(0.28, 1.38, 0);
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 7), robe);
    rArm.position.y = -0.24;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.025, 1.85, 7), trim);
    staff.position.set(0, -0.1, 0.15);
    staff.rotation.x = 0.25;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), ember);
    orb.position.set(0, 0.85, 0.38);
    armR.add(rArm, staff, orb);

    bodyPivot.add(skirt, torso, sash, head, armL, armR);
    root.add(createContactShadow(shadowTex, 0.64));
  } else if (archetype === 'grave_hound') {
    const hide = reg(makeMat('#272426', 0.88, 0.12));
    const bone = reg(makeMat('#8f8474', 0.58, 0.15));
    const eye = reg(makeMat('#ff4824', 0.2, 0.1, '#ff3a14', 1.2));

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.96), hide);
    body.position.y = 0.62;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.78), bone);
    spine.position.set(0, 0.86, -0.04);

    head.position.set(0, 0.72, 0.56);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.42), bone);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eye);
    eyeL.position.set(-0.09, 0.05, 0.12);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    head.add(snout, eyeL, eyeR);

    legL.position.set(-0.2, 0.52, 0.34);
    legL.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.11), hide));
    legL.children[0].position.y = -0.26;
    legR.position.set(0.2, 0.52, 0.34);
    legR.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.11), hide));
    legR.children[0].position.y = -0.26;

    const backL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.14), hide);
    backL.position.set(-0.2, 0.26, -0.34);
    const backR = backL.clone();
    backR.position.x = 0.2;

    bodyPivot.add(body, spine, head, legL, legR, backL, backR);
    root.add(createContactShadow(shadowTex, 0.75));
  } else if (archetype === 'iron_bulwark') {
    const steel = reg(makeMat('#3d4248', 0.34, 0.84));
    const brass = reg(makeMat('#a38348', 0.32, 0.82));
    const visor = reg(makeMat('#e89938', 0.3, 0.2, '#e89938', 1.0));

    legL.position.set(-0.22, 0.96, 0);
    legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.96, 8), steel));
    legL.children[0].position.y = -0.48;
    legR.position.set(0.22, 0.96, 0);
    legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.96, 8), steel));
    legR.children[0].position.y = -0.48;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.78, 0.48), steel);
    torso.position.y = 1.4;
    const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 0.5), brass);
    chestBand.position.y = 1.5;

    head.position.set(0, 1.88, 0);
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.4, 8), steel);
    helm.position.y = 0.16;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), visor);
    slit.position.set(0, 0.16, 0.22);
    head.add(helm, slit);

    armL.position.set(-0.52, 1.66, 0);
    const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), brass);
    const towerShield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.72), steel);
    towerShield.position.set(-0.14, -0.45, 0.22);
    armL.add(pauldronL, towerShield);

    armR.position.set(0.52, 1.66, 0);
    const pauldronR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), brass);
    const maceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 8), brass);
    maceShaft.position.set(0, -0.45, 0.45);
    maceShaft.rotation.x = Math.PI / 2 - 0.1;
    const maceHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), steel);
    maceHead.position.set(0, -0.55, 1.12);
    armR.add(pauldronR, maceShaft, maceHead);

    bodyPivot.add(legL, legR, torso, chestBand, head, armL, armR);
    root.add(createContactShadow(shadowTex, 1.0));
  } else {
    // Main Boss: Lord Malakor, The Cinder Warden
    const obsidian = reg(makeMat('#252124', 0.34, 0.85));
    const cinderGold = reg(makeMat('#b88940', 0.28, 0.86));
    const emberCore = reg(makeMat('#ff5c1a', 0.2, 0.15, '#ff4800', 1.8));
    const capeMat = reg(makeMat('#3e1312', 0.92, 0.05));

    legL.position.set(-0.34, 1.38, 0);
    legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 1.36, 9), obsidian));
    legL.children[0].position.y = -0.68;
    legR.position.set(0.34, 1.38, 0);
    legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 1.36, 9), obsidian));
    legR.children[0].position.y = -0.68;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.14, 0.68), obsidian);
    torso.position.y = 2.02;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), emberCore);
    core.position.set(0, 2.08, 0.28);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.05, 0.08), capeMat);
    cape.position.set(0, 1.5, -0.44);
    cape.rotation.x = 0.12;

    head.position.set(0, 2.7, 0);
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.48, 8), obsidian);
    helm.position.y = 0.2;
    const crownHornL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.54, 6), cinderGold);
    crownHornL.position.set(-0.28, 0.48, 0);
    crownHornL.rotation.z = 0.42;
    const crownHornR = crownHornL.clone();
    crownHornR.position.x = 0.28;
    crownHornR.rotation.z = -0.42;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.12), emberCore);
    visor.position.set(0, 0.2, 0.24);
    head.add(helm, crownHornL, crownHornR, visor);

    armL.position.set(-0.76, 2.42, 0);
    const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), cinderGold);
    const armMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.96, 8), obsidian);
    armMeshL.position.y = -0.48;
    armL.add(pauldronL, armMeshL);

    armR.position.set(0.76, 2.42, 0);
    const pauldronR = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), cinderGold);
    const armMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.96, 8), obsidian);
    armMeshR.position.y = -0.48;

    const bossHalberd = buildWeaponMesh('halberd', '#ff7b33');
    bossHalberd.scale.setScalar(1.55);
    bossHalberd.position.set(0, -0.82, 0.1);
    bossHalberd.rotation.x = Math.PI / 2 - 0.12;
    armR.add(pauldronR, armMeshR, bossHalberd);

    bodyPivot.add(legL, legR, torso, core, cape, head, armL, armR);
    root.add(createContactShadow(shadowTex, 1.45));
  }

  // Telegraph ring on ground for readable heavy/boss windups
  const ringGeo = new THREE.RingGeometry(0.85, 1.08, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: archetype === 'cinder_warden' ? 0xff4c1a : 0xf59e0b,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const telegraphRing = new THREE.Mesh(ringGeo, ringMat);
  telegraphRing.position.y = 0.04;
  telegraphRing.scale.setScalar(archetype === 'cinder_warden' ? 3.4 : 1.55);
  root.add(telegraphRing);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj !== telegraphRing) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return {
    root,
    bodyPivot,
    armR,
    armL,
    legL,
    legR,
    head,
    weaponPivot,
    telegraphRing,
    flashMaterials,
  };
}

export function buildBonfire(): { group: THREE.Group; flame: THREE.Mesh } {
  const group = new THREE.Group();
  const ashMat = makeMat('#332c27', 0.96, 0.02);
  const emberBedMat = makeMat('#cf4a15', 0.4, 0.05, '#ff4800', 1.2);
  const stoneMat = makeMat('#4d4741', 0.85, 0.08);
  const ironMat = makeMat('#8b939c', 0.3, 0.85);
  const flameMat = makeMat('#ff8c29', 0.2, 0, '#ff5900', 2.4);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.24, 0.28, 12), ashMat);
  mound.position.y = 0.14;
  const emberCore = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.68, 0.3, 10), emberBedMat);
  emberCore.position.y = 0.16;
  group.add(mound, emberCore);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
    rock.position.set(Math.cos(ang) * 1.05, 0.14, Math.sin(ang) * 1.05);
    rock.rotation.set(ang, i, 0);
    group.add(rock);
  }

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.03), ironMat);
  blade.position.y = 0.78;
  blade.rotation.z = 0.09;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.07), ironMat);
  guard.position.y = 1.32;
  guard.rotation.z = 0.09;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.96, 7), flameMat);
  flame.position.y = 0.62;
  group.add(blade, guard, flame);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== flame && o !== emberCore) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group, flame };
}

export function buildNpc(role: 'oathkeeper' | 'merchant', shadowTex: THREE.CanvasTexture): THREE.Group {
  const grp = new THREE.Group();
  const cloakColor = role === 'oathkeeper' ? '#36414d' : '#4a3525';
  const accentColor = role === 'oathkeeper' ? '#8c7244' : '#735b41';

  const cloak = makeMat(cloakColor, 0.88, 0.06);
  const armor = makeMat(accentColor, 0.42, 0.68);
  const hood = makeMat('#1f1c1a', 0.9, 0.05);
  const lanternGlow = makeMat('#ffb44c', 0.25, 0.1, '#ff8811', 1.5);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.0, 9), cloak);
  base.position.y = 0.5;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.32), armor);
  chest.position.y = 1.22;
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), armor);
  shoulderL.position.set(-0.3, 1.4, 0);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.3;

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.46, 7), cloak);
  armL.position.set(-0.3, 1.16, 0.06);
  const armR = armL.clone();
  armR.position.x = 0.3;

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), hood);
  head.position.y = 1.66;

  if (role === 'merchant') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.54, 0.34), makeMat('#5c422a', 0.88, 0.05));
    pack.position.set(0, 1.2, -0.26);
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), lanternGlow);
    lantern.position.set(-0.32, 0.94, 0.22);
    grp.add(pack, lantern);
  } else {
    const sword = buildWeaponMesh('greatsword', '#969da6');
    sword.scale.setScalar(0.85);
    sword.position.set(0.36, 0.02, 0.14);
    grp.add(sword);
  }

  grp.add(base, chest, shoulderL, shoulderR, armL, armR, head, createContactShadow(shadowTex, 0.68));
  grp.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return grp;
}

export function buildChest(): { group: THREE.Group; lid: THREE.Group } {
  const group = new THREE.Group();
  const wood = makeMat('#422b1c', 0.86, 0.08);
  const iron = makeMat('#8d7444', 0.34, 0.82);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 0.72), wood);
  base.position.y = 0.25;
  const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.76), iron);
  bandL.position.set(-0.36, 0.26, 0);
  const bandR = bandL.clone();
  bandR.position.x = 0.36;

  const lid = new THREE.Group();
  lid.position.set(0, 0.5, -0.36);
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.05, 8, 1, false, 0, Math.PI), wood);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.position.set(0, 0, 0.36);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.08), iron);
  lock.position.set(0, 0.02, 0.74);
  lid.add(lidMesh, lock);

  group.add(base, bandL, bandR, lid);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group, lid };
}
