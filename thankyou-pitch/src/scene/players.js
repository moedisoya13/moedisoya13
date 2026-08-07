import * as THREE from 'three';
import { BATTER_POS, CATCHER_POS, MOUND, MOUND_HEIGHT } from '../layout.js';
import { clamp, lerp } from '../utils/easing.js';

/**
 * GLTF를 받을 수 없는 환경이라 인물은 전부 캡슐/박스로 조립한 로우폴리 리그다.
 * 기본 정면(forward)은 로컬 -Z. 관절은 Object3D 계층으로 두고 포즈(오일러 각)를
 * 보간한다.
 */

const DOWN = new THREE.Vector3(0, -1, 0);

const BASE_JOINTS = [
  'hips',
  'chest',
  'neck',
  'shL',
  'elL',
  'shR',
  'elR',
  'hipL',
  'knL',
  'hipR',
  'knR',
];

function limb(length, radius, mat, { taper = 1 } = {}) {
  const body = Math.max(length - radius * 2, 0.02);
  const geo = new THREE.CapsuleGeometry(radius, body, 3, 8);
  if (taper !== 1) geo.scale(1, 1, taper);
  geo.translate(0, -length / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function joint(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function makeCap(colorPrimary, colorBrim) {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.126, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: colorPrimary, roughness: 0.85 })
  );
  crown.castShadow = true;
  g.add(crown);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.132, 0.132, 0.016, 16, 1, false, Math.PI * 1.1, Math.PI * 0.8),
    new THREE.MeshStandardMaterial({ color: colorBrim ?? colorPrimary, roughness: 0.8 })
  );
  brim.position.set(0, 0.004, -0.075);
  brim.scale.set(1, 1, 1.5);
  brim.castShadow = true;
  g.add(brim);
  return g;
}

/**
 * 인물 리그 생성.
 */
function makeFigure({
  skin = 0xd8a889,
  shirt = 0xf2eee2,
  pants = 0xece7d9,
  accent = 0x1c2e5a,
  shoes = 0x14161c,
  cap = null,
  height = 1.0,
} = {}) {
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.88 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.75 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoes, roughness: 0.55 });

  const root = new THREE.Group();
  root.scale.setScalar(height);

  const hips = joint(root, 0, 0.94, 0);

  // 골반
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.1, 3, 10), pantsMat);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.72);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const chest = joint(hips, 0, 0.06, 0);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.175, 0.3, 3, 12), shirtMat);
  torso.position.y = 0.23;
  torso.scale.set(1.06, 1, 0.68);
  torso.castShadow = true;
  chest.add(torso);

  // 어깨 라인 (유니폼 트림)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 6, 14), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.44;
  collar.scale.set(1, 0.72, 1);
  chest.add(collar);

  const neck = joint(chest, 0, 0.46, 0);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.09, 8), skinMat);
  neckMesh.position.y = 0.045;
  neck.add(neckMesh);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skinMat);
  head.position.y = 0.19;
  head.scale.set(0.92, 1.06, 1);
  head.castShadow = true;
  neck.add(head);

  // 눈 — 이게 없으면 로우폴리 머리는 앞뒤 구분이 안 된다
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35 });
  const eyeGeo = new THREE.SphereGeometry(0.019, 8, 6);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.042 * s, 0.012, -0.101);
    eye.scale.set(1, 1.15, 0.6);
    head.add(eye);
  });

  let capNode = null;
  if (cap) {
    capNode = makeCap(cap.color, cap.brim);
    capNode.position.y = 0.235;
    neck.add(capNode);
  }

  // 팔 (L = 왼쪽, R = 오른쪽 / 로컬 +X가 오른쪽)
  const buildArm = (sign) => {
    const shoulder = joint(chest, 0.2 * sign, 0.4, 0);
    const upper = limb(0.3, 0.062, shirtMat);
    shoulder.add(upper);
    const elbow = joint(shoulder, 0, -0.3, 0);
    const fore = limb(0.28, 0.052, skinMat);
    elbow.add(fore);
    const hand = joint(elbow, 0, -0.28, 0);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
    palm.castShadow = true;
    hand.add(palm);
    return { shoulder, elbow, hand };
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // 다리
  const buildLeg = (sign) => {
    const hip = joint(hips, 0.115 * sign, -0.04, 0);
    const thigh = limb(0.46, 0.082, pantsMat);
    hip.add(thigh);
    const knee = joint(hip, 0, -0.46, 0);
    const shin = limb(0.44, 0.064, pantsMat);
    knee.add(shin);
    const ankle = joint(knee, 0, -0.44, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoeMat);
    foot.position.set(0, -0.03, -0.05);
    foot.castShadow = true;
    ankle.add(foot);
    // 스타킹 트림
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.16, 8), accentMat);
    sock.position.y = -0.34;
    knee.add(sock);
    return { hip, knee, ankle };
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  const joints = {
    hips,
    chest,
    neck,
    shL: armL.shoulder,
    elL: armL.elbow,
    shR: armR.shoulder,
    elR: armR.elbow,
    hipL: legL.hip,
    knL: legL.knee,
    hipR: legR.hip,
    knR: legR.knee,
  };

  return {
    root,
    joints,
    jointNames: [...BASE_JOINTS],
    handL: armL.hand,
    handR: armR.hand,
    head,
    cap: capNode,
    materials: { skinMat, shirtMat, pantsMat, accentMat, shoeMat },
    basePos: new THREE.Vector3(0, 0, 0),
    baseYaw: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  포즈 유틸                                                           */
/* ------------------------------------------------------------------ */

const ZERO = [0, 0, 0];

function applyPose(figure, pose) {
  for (const name of figure.jointNames) {
    const r = pose[name] || ZERO;
    figure.joints[name].rotation.set(r[0], r[1], r[2]);
  }
  const p = pose.rootPos || ZERO;
  figure.root.position.set(
    figure.basePos.x + p[0],
    figure.basePos.y + p[1],
    figure.basePos.z + p[2]
  );
  figure.root.rotation.y = figure.baseYaw + (pose.rootYaw || 0);
}

function blendPose(figure, a, b, t) {
  const k = clamp(t);
  for (const name of figure.jointNames) {
    const ra = a[name] || ZERO;
    const rb = b[name] || ZERO;
    figure.joints[name].rotation.set(
      lerp(ra[0], rb[0], k),
      lerp(ra[1], rb[1], k),
      lerp(ra[2], rb[2], k)
    );
  }
  const pa = a.rootPos || ZERO;
  const pb = b.rootPos || ZERO;
  figure.root.position.set(
    figure.basePos.x + lerp(pa[0], pb[0], k),
    figure.basePos.y + lerp(pa[1], pb[1], k),
    figure.basePos.z + lerp(pa[2], pb[2], k)
  );
  figure.root.rotation.y =
    figure.baseYaw + lerp(a.rootYaw || 0, b.rootYaw || 0, k);
}

/** keys: [{ at, pose }] 를 0..1 진행률로 샘플링 */
function samplePoseTrack(figure, keys, t) {
  const u = clamp(t);
  if (u <= keys[0].at) return applyPose(figure, keys[0].pose);
  const last = keys[keys.length - 1];
  if (u >= last.at) return applyPose(figure, last.pose);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (u >= a.at && u <= b.at) {
      const k = (u - a.at) / (b.at - a.at || 1);
      return blendPose(figure, a.pose, b.pose, k);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  포즈 데이터                                                          */
/* ------------------------------------------------------------------ */

/** 키리야마의 투구 — 다리를 크게 드는 오버스로 (원작의 상징적인 폼) */
export const PITCH_POSES = [
  {
    at: 0,
    pose: {
      hips: [0, 0.12, 0],
      chest: [-0.06, 0.16, 0],
      neck: [0.05, -0.2, 0],
      shL: [1.05, 0, 0.42],
      elL: [1.85, 0, 0],
      shR: [1.0, 0, -0.4],
      elR: [1.9, 0, 0],
      hipL: [0.04, 0, -0.05],
      knL: [-0.1, 0, 0],
      hipR: [-0.02, 0, 0.05],
      knR: [-0.08, 0, 0],
    },
  },
  {
    at: 0.34,
    pose: {
      rootPos: [0, 0.04, 0],
      hips: [0, 0.5, 0],
      chest: [-0.14, 0.42, 0.05],
      neck: [0.08, -0.55, 0],
      shL: [0.95, 0, 0.5],
      elL: [2.0, 0, 0],
      shR: [0.8, 0, -0.55],
      elR: [2.0, 0, 0],
      hipL: [2.25, 0, -0.18],
      knL: [-1.95, 0, 0],
      hipR: [0.06, 0, 0.06],
      knR: [-0.22, 0, 0],
    },
  },
  {
    at: 0.58,
    pose: {
      rootPos: [0, -0.02, -0.18],
      hips: [0, 0.34, 0],
      chest: [-0.16, 0.3, 0.04],
      neck: [0.1, -0.45, 0],
      shL: [1.85, 0, -0.35],
      elL: [0.45, 0, 0],
      shR: [-0.5, 0, 1.85],
      elR: [-1.45, 0, 0],
      hipL: [1.0, 0, -0.12],
      knL: [-0.42, 0, 0],
      hipR: [-0.42, 0, 0.08],
      knR: [-0.62, 0, 0],
    },
  },
  {
    at: 0.76,
    pose: {
      rootPos: [0.03, -0.09, -0.42],
      hips: [0, -0.22, 0],
      chest: [0.4, -0.42, -0.06],
      neck: [-0.14, 0.18, 0],
      shL: [0.15, 0, -0.95],
      elL: [1.5, 0, 0],
      shR: [2.62, 0, 0.32],
      elR: [0.2, 0, 0],
      hipL: [0.55, 0, -0.08],
      knL: [-0.14, 0, 0],
      hipR: [-0.95, 0, 0.12],
      knR: [-1.15, 0, 0],
    },
  },
  {
    at: 1,
    pose: {
      rootPos: [0.07, -0.13, -0.58],
      hips: [0, -0.55, 0],
      chest: [0.78, -0.72, -0.12],
      neck: [-0.3, 0.35, 0],
      shL: [-0.45, 0, -1.25],
      elL: [1.05, 0, 0],
      shR: [3.05, 0, -0.55],
      elR: [0.95, 0, 0],
      hipL: [0.42, 0, -0.06],
      knL: [-0.24, 0, 0],
      hipR: [-1.5, 0, 0.22],
      knR: [-1.9, 0, 0],
    },
  },
];

/**
 * 코보리의 스윙 — 로드 → 스트라이드 → 스윙 → 헛스윙 후 균형 잃음.
 *
 * 우타자는 baseYaw = +π/2 로 세우므로 로컬 축이 이렇게 대응한다:
 *   로컬 -Z (정면) = 월드 -X = 홈플레이트 쪽
 *   로컬 +X (뒤쪽) = 월드 -Z = 포수 쪽  → 오른쪽(뒷) 어깨
 *   로컬 -X (앞쪽) = 월드 +Z = 투수 쪽  → 왼쪽(리드) 어깨
 * 따라서 배트를 뒤(+X)에서 앞(-Z)으로 돌리려면 몸통의 Y 회전이 **양수**여야 한다.
 */
export const SWING_POSES = [
  {
    at: 0,
    pose: {
      hips: [0, -0.24, 0],
      chest: [-0.05, -0.44, 0],
      neck: [0.02, 1.15, 0], // 고개는 투수를 본다
      shR: [0.15, 0, 2.0],
      elR: [1.35, 0, 0],
      shL: [0.2, 0, 2.3],
      elL: [1.4, 0, 0],
      hipL: [0.06, 0, -0.16],
      knL: [-0.3, 0, 0],
      hipR: [-0.04, 0, 0.16],
      knR: [-0.28, 0, 0],
      bat: [0.4, 0, -0.5],
    },
  },
  {
    at: 0.34,
    pose: {
      hips: [0, -0.46, 0],
      chest: [-0.08, -0.7, 0],
      neck: [0.04, 1.3, 0],
      shR: [0.1, 0, 2.15],
      elR: [1.45, 0, 0],
      shL: [0.15, 0, 2.45],
      elL: [1.5, 0, 0],
      hipL: [0.5, 0, -0.2],
      knL: [-0.85, 0, 0],
      hipR: [-0.08, 0, 0.18],
      knR: [-0.26, 0, 0],
      bat: [0.56, 0, -0.56],
    },
  },
  {
    at: 0.66,
    pose: {
      rootPos: [0, -0.03, 0.1],
      hips: [0, 0.76, 0],
      chest: [0.14, 1.16, 0],
      neck: [0.1, -0.42, 0],
      shR: [1.3, 0, 0.34],
      elR: [0.3, 0, 0],
      shL: [1.36, 0, -0.2],
      elL: [0.28, 0, 0],
      hipL: [0.2, 0, -0.1],
      knL: [-0.18, 0, 0],
      hipR: [-0.2, 0, 0.22],
      knR: [-0.62, 0, 0],
      bat: [-1.78, 0, -0.06],
    },
  },
  {
    at: 1,
    pose: {
      rootPos: [0, -0.11, 0.13],
      hips: [0, 1.18, 0],
      chest: [0.44, 1.5, 0.18],
      neck: [0.3, -0.6, 0],
      shR: [2.0, 0, -0.46],
      elR: [1.3, 0, 0],
      shL: [2.1, 0, 0.5],
      elL: [1.25, 0, 0],
      hipL: [0.05, 0, -0.05],
      knL: [-0.5, 0, 0],
      hipR: [-0.35, 0, 0.3],
      knR: [-1.0, 0, 0],
      bat: [-2.62, 0, 0.4],
    },
  },
];

/** 코보리가 타석에 걸어 들어와 자세를 잡는 동작 (배트를 어깨에 걸치고 온다) */
export const STEP_IN_POSES = [
  {
    at: 0,
    pose: {
      rootPos: [1.6, 0, -2.1],
      rootYaw: -0.6,
      hips: [0, 0.05, 0],
      chest: [0.05, 0.08, 0],
      neck: [0.02, 0.5, 0],
      shR: [0.3, 0, 1.3],
      elR: [1.55, 0, 0],
      shL: [0.35, 0, 0.4],
      elL: [0.85, 0, 0],
      hipL: [0.55, 0, -0.06],
      knL: [-0.65, 0, 0],
      hipR: [-0.5, 0, 0.06],
      knR: [-0.3, 0, 0],
      bat: [0.95, 0, -0.9],
    },
  },
  {
    at: 0.55,
    pose: {
      rootPos: [0.6, 0, -0.8],
      rootYaw: -0.24,
      hips: [0, -0.05, 0],
      chest: [0.02, -0.12, 0],
      neck: [0.02, 0.85, 0],
      shR: [0.28, 0, 1.6],
      elR: [1.5, 0, 0],
      shL: [0.4, 0, 1.5],
      elL: [1.2, 0, 0],
      hipL: [-0.45, 0, -0.06],
      knL: [-0.35, 0, 0],
      hipR: [0.5, 0, 0.06],
      knR: [-0.6, 0, 0],
      bat: [0.7, 0, -0.72],
    },
  },
  { at: 1, pose: SWING_POSES[0].pose },
];

/** 8장 — 코보리가 모자를 내미는 포즈 (마운드 앞, 투수를 마주 본다) */
export const OFFER_POSES = [
  {
    at: 0,
    pose: {
      hips: [0, 0.05, 0],
      chest: [0.04, 0.08, 0],
      shL: [0.25, 0, 0.22],
      elL: [0.55, 0, 0],
      shR: [0.3, 0, -0.24],
      elR: [0.6, 0, 0],
      hipL: [0.05, 0, -0.05],
      knL: [-0.12, 0, 0],
      hipR: [-0.05, 0, 0.05],
      knR: [-0.12, 0, 0],
      bat: [0.4, 0, -0.5],
    },
  },
  {
    at: 1,
    pose: {
      hips: [0, 0.02, 0],
      chest: [-0.1, 0.04, 0],
      neck: [0.06, 0, 0],
      // 왼팔을 앞으로 쭉 뻗어 모자를 내민다 (모자는 왼손에 붙어 있다)
      shL: [1.66, 0, 0.14],
      elL: [0.12, 0, 0],
      shR: [0.28, 0, -0.2],
      elR: [0.55, 0, 0],
      hipL: [0.12, 0, -0.05],
      knL: [-0.2, 0, 0],
      hipR: [-0.1, 0, 0.05],
      knR: [-0.14, 0, 0],
      bat: [0.4, 0, -0.5],
    },
  },
];

const CROUCH_POSE = {
  rootPos: [0, -0.42, 0],
  hips: [0, 0, 0],
  chest: [0.24, 0, 0],
  neck: [-0.2, 0, 0],
  shL: [1.3, 0, 0.35],
  elL: [0.55, 0, 0],
  shR: [0.75, 0, -0.5],
  elR: [1.15, 0, 0],
  hipL: [1.42, 0, -0.62],
  knL: [-2.15, 0, 0],
  hipR: [1.42, 0, 0.62],
  knR: [-2.15, 0, 0],
};

/* ------------------------------------------------------------------ */
/*  캐스트 조립                                                          */
/* ------------------------------------------------------------------ */

export function createCast(scene) {
  const group = new THREE.Group();
  group.name = 'cast';
  scene.add(group);

  /* --- 키리야마 후세츠 (야구부 사냥꾼) — 팀이 없으니 검은 트레이닝복 --- */
  const pitcher = makeFigure({
    skin: 0xd9ab8b,
    shirt: 0x14161d,
    pants: 0x1b1f28,
    accent: 0x2b303c,
    shoes: 0x0b0d11,
    cap: { color: 0x101218, brim: 0x0a0c10 },
    height: 1.02,
  });
  pitcher.basePos.set(MOUND.x, MOUND_HEIGHT + 0.01, MOUND.z - 0.15);
  pitcher.baseYaw = 0; // 홈(-Z)을 본다
  applyPose(pitcher, PITCH_POSES[0].pose);
  group.add(pitcher.root);

  // 오른손에 공을 쥐고 있다가 릴리스 시점에 숨긴다
  const heldBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.037, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.62 })
  );
  heldBall.position.set(0, -0.045, 0);
  pitcher.handR.add(heldBall);
  pitcher.heldBall = heldBall;

  /* --- 코보리 헤이타 (하마소 주장) — 크림색 유니폼 + 네이비 --- */
  const batter = makeFigure({
    skin: 0xe0b393,
    shirt: 0xf0ece0,
    pants: 0xe8e3d5,
    accent: 0x1b2c56,
    shoes: 0x171a20,
    cap: { color: 0x1b2c56, brim: 0x142040 },
    height: 0.99,
  });
  batter.basePos.copy(BATTER_POS);
  batter.baseYaw = Math.PI / 2; // 플레이트(-X)를 본다
  applyPose(batter, SWING_POSES[0].pose);
  group.add(batter.root);

  // 배트 — 손에 붙이면 팔 포즈 오차가 그대로 드러나서 배트가 화면 밖으로
  // 튀어 나간다. 흉부에 매달고 각도를 포즈('bat' 관절)로 직접 제어하면
  // 두 손 그립 근처에 안정적으로 붙어 있는다.
  const batPivot = new THREE.Object3D();
  batPivot.position.set(0.17, 0.42, -0.03);
  batter.joints.chest.add(batPivot);
  batter.joints.bat = batPivot;
  batter.jointNames.push('bat');

  const batMat = new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.62 });
  const batGeo = new THREE.CylinderGeometry(0.034, 0.017, 0.84, 12);
  batGeo.translate(0, 0.42, 0);
  const bat = new THREE.Mesh(batGeo, batMat);
  bat.castShadow = true;
  batPivot.add(bat);
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.032, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.7 })
  );
  knob.position.y = -0.02;
  batPivot.add(knob);
  batter.batPivot = batPivot;
  batter.bat = bat;

  // 8장에서 내미는 하마소 모자
  const offeredCap = makeCap(0x1b2c56, 0x142040);
  offeredCap.scale.setScalar(0.95);
  offeredCap.position.set(0, -0.1, 0);
  offeredCap.rotation.x = -1.2;
  offeredCap.visible = false;
  batter.handL.add(offeredCap);
  batter.offeredCap = offeredCap;

  /* --- 히로세 (포수) --- */
  const catcher = makeFigure({
    skin: 0xd6a582,
    shirt: 0x22335e,
    pants: 0xe6e1d3,
    accent: 0x121c36,
    shoes: 0x14161c,
    cap: { color: 0x121c36, brim: 0x0d1526 },
    height: 0.98,
  });
  catcher.basePos.copy(CATCHER_POS);
  catcher.baseYaw = Math.PI; // 마운드(+Z)를 본다
  applyPose(catcher, CROUCH_POSE);
  group.add(catcher.root);

  // 미트 — 팔에 매달지 않고 자유 오브젝트로 두어 공과 정확히 만나게 한다
  const mitt = new THREE.Group();
  const mittPad = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.82 })
  );
  mittPad.rotation.x = -Math.PI / 2;
  mittPad.scale.set(1, 1.18, 0.62);
  mittPad.castShadow = true;
  mitt.add(mittPad);
  const mittRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.112, 0.016, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x5e3417, roughness: 0.8 })
  );
  mittRim.rotation.y = Math.PI / 2;
  mitt.add(mittRim);
  mitt.position.set(0.05, 1.0, -0.9);
  group.add(mitt);

  // 포수 보호구 느낌의 가슴판
  const chestGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.4, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x101a33, roughness: 0.7 })
  );
  chestGuard.position.set(0, 0.22, -0.13);
  catcher.joints.chest.add(chestGuard);

  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _m = new THREE.Matrix4();

  /** 팔 길이 (상완 + 전완, 스케일 반영) */
  const ARM_REACH = (0.3 + 0.28) * 0.98;
  const _rot = new THREE.Matrix4();

  /**
   * 포수 왼팔이 미트를 향하도록 어깨를 회전시킨다 (간이 IK).
   * 팔이 닿지 않는 곳(포크가 원바운드로 떨어지는 지점 등)은 미트를 사정거리
   * 안으로 당겨 둔다 — 그러면 손과 미트가 떨어져 보이지 않는다.
   */
  function aimCatcherArm() {
    const shoulder = catcher.joints.shL;
    shoulder.updateWorldMatrix(true, false);
    shoulder.getWorldPosition(_v);

    const toMitt = mitt.position.clone().sub(_v);
    const dist = toMitt.length() || 1e-4;
    if (dist > ARM_REACH) {
      mitt.position.copy(_v).add(toMitt.multiplyScalar(ARM_REACH / dist));
      toMitt.copy(mitt.position).sub(_v);
    }

    const dirWorld = toMitt.normalize();
    _rot.extractRotation(_m.copy(shoulder.parent.matrixWorld).invert());
    const dirLocal = dirWorld.applyMatrix4(_rot).normalize();
    _q.setFromUnitVectors(DOWN, dirLocal);
    shoulder.quaternion.copy(_q);
    catcher.joints.elL.rotation.set(0.12, 0, 0);
  }

  return {
    group,
    pitcher,
    batter,
    catcher,
    mitt,

    /** 투구 모션 (0..1) */
    setPitchPhase(t) {
      samplePoseTrack(pitcher, PITCH_POSES, t);
      // 릴리스 직전에 손안의 공을 감춘다
      pitcher.heldBall.visible = t < 0.73;
    },
    setPitcherIdle(t = 0) {
      applyPose(pitcher, PITCH_POSES[0].pose);
      pitcher.heldBall.visible = true;
      pitcher.root.position.y =
        pitcher.basePos.y + Math.sin(t * 1.4) * 0.008;
    },

    /** 스윙 모션 (0..1) */
    setSwingPhase(t) {
      samplePoseTrack(batter, SWING_POSES, t);
    },
    setBatterStance() {
      applyPose(batter, SWING_POSES[0].pose);
    },
    /** 타석으로 걸어 들어오는 동작 (0..1) */
    setStepIn(t) {
      samplePoseTrack(batter, STEP_IN_POSES, t);
    },
    /** 8장 — 모자를 내미는 동작 */
    setOffer(t) {
      samplePoseTrack(batter, OFFER_POSES, t);
    },
    setBatterPosition(x, y, z, yaw) {
      batter.basePos.set(x, y, z);
      if (yaw !== undefined) batter.baseYaw = yaw;
    },
    setBatVisible(v) {
      bat.visible = v;
      knob.visible = v;
    },
    setOfferedCapVisible(v) {
      offeredCap.visible = v;
    },

    setMittTarget(vec) {
      mitt.position.copy(vec);
      aimCatcherArm();
    },
    setCatcherCrouch() {
      applyPose(catcher, CROUCH_POSE);
      aimCatcherArm();
    },
    setVisible({ pitcher: p, batter: b, catcher: c } = {}) {
      if (p !== undefined) pitcher.root.visible = p;
      if (b !== undefined) batter.root.visible = b;
      if (c !== undefined) {
        catcher.root.visible = c;
        mitt.visible = c;
      }
    },
    /** 미묘한 호흡/흔들림 — 정지 화면이 죽지 않게 */
    breathe(elapsed) {
      catcher.joints.chest.rotation.x = CROUCH_POSE.chest[0] + Math.sin(elapsed * 1.7) * 0.02;
    },

    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      scene.remove(group);
    },
  };
}

export { CROUCH_POSE, applyPose, blendPose, samplePoseTrack };
