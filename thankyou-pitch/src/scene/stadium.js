import * as THREE from 'three';
import {
  BASES,
  FENCE_RADIUS,
  LIGHT_TOWERS,
  MOUND,
  MOUND_HEIGHT,
  MOUND_RADIUS,
  TOWER_HEIGHT,
} from '../layout.js';
import {
  canvasTexture,
  dirtTexture,
  glowTexture,
  grassTexture,
  netTexture,
  textPanelTexture,
} from '../utils/textTexture.js';
import { clamp } from '../utils/easing.js';

const LINE_COLOR = 0xe8e4d8;

/* ------------------------------------------------------------------ */
/*  하늘 / 별 / 달                                                      */
/* ------------------------------------------------------------------ */

function createSky() {
  const geo = new THREE.SphereGeometry(300, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x01020a) },
      uMid: { value: new THREE.Color(0x0a1428) },
      uBottom: { value: new THREE.Color(0x1d2e4e) },
    },
    vertexShader: /* glsl */ `
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vH = normalize(wp.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom;
      varying float vH;
      void main() {
        float h = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(uBottom, uMid, smoothstep(0.42, 0.56, h));
        c = mix(c, uTop, smoothstep(0.55, 0.92, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

function createStars(count = 1200) {
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 지평선 위쪽에만 뿌린다
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.92 + 0.04);
    const r = 240;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) + 20;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = Math.random() * 1.6 + 0.4;
    tint.setHSL(0.58 + Math.random() * 0.08, 0.35, 0.72 + Math.random() * 0.28);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      void main() {
        vColor = color;
        vTwinkle = 0.65 + 0.35 * sin(uTime * 1.6 + position.x * 0.12 + position.z * 0.07);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // 별은 거리 감쇠 없이 고정 픽셀 크기가 자연스럽다
        gl_PointSize = aSize * 1.9;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vColor, a * vTwinkle * uOpacity);
      }
    `,
    vertexColors: true,
  });

  const stars = new THREE.Points(geo, mat);
  stars.name = 'stars';
  return stars;
}

function createMoon() {
  const tex = canvasTexture(glowTexture(256, '#fdf6e0', 'rgba(253,246,224,0)'));
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
    fog: false,
  });
  const moon = new THREE.Sprite(mat);
  moon.scale.set(23, 23, 1);
  moon.position.set(-96, 96, 168);
  moon.name = 'moon';
  return moon;
}

/* ------------------------------------------------------------------ */
/*  그라운드                                                            */
/* ------------------------------------------------------------------ */

function createGround() {
  const group = new THREE.Group();
  group.name = 'ground';

  // 잔디
  const grass = canvasTexture(grassTexture(512, 12));
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(16, 16);
  const grassMat = new THREE.MeshStandardMaterial({
    map: grass,
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
  });
  const field = new THREE.Mesh(new THREE.CircleGeometry(FENCE_RADIUS + 26, 72), grassMat);
  field.rotation.x = -Math.PI / 2;
  field.position.z = 26;
  field.receiveShadow = true;
  group.add(field);

  // 내야 흙
  const dirt = canvasTexture(dirtTexture(512));
  dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping;
  dirt.repeat.set(6, 6);
  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirt,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });

  // 홈플레이트 주변 스킨
  const homeSkin = new THREE.Mesh(new THREE.CircleGeometry(7.9, 48), dirtMat);
  homeSkin.rotation.x = -Math.PI / 2;
  homeSkin.position.set(0, 0.006, 0.4);
  homeSkin.receiveShadow = true;
  group.add(homeSkin);

  // 내야 아크
  const arc = new THREE.Mesh(new THREE.RingGeometry(0, 29, 64, 1, Math.PI * 0.18, Math.PI * 0.64), dirtMat);
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.004, 0.2);
  arc.receiveShadow = true;
  group.add(arc);

  // 내야 잔디 (다이아몬드 안쪽)
  const innerGrass = new THREE.Mesh(new THREE.CircleGeometry(20.2, 48), grassMat.clone());
  innerGrass.material.color.set(0xd6e2d8);
  innerGrass.rotation.x = -Math.PI / 2;
  innerGrass.position.set(0, 0.012, 19.4);
  innerGrass.receiveShadow = true;
  group.add(innerGrass);

  // 마운드
  const moundMat = dirtMat.clone();
  moundMat.color.set(0xf0d8c4);
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(MOUND_RADIUS, MOUND_RADIUS + 0.45, MOUND_HEIGHT, 40),
    moundMat
  );
  mound.position.set(MOUND.x, MOUND_HEIGHT / 2 + 0.014, MOUND.z);
  mound.receiveShadow = true;
  mound.castShadow = true;
  group.add(mound);

  // 투수판
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(0.61, 0.03, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.65 })
  );
  rubber.position.set(MOUND.x, MOUND_HEIGHT + 0.03, MOUND.z + 0.2);
  group.add(rubber);

  // 홈플레이트 (오각형)
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.216, 0.216);
  plateShape.lineTo(0.216, 0.216);
  plateShape.lineTo(0.216, -0.04);
  plateShape.lineTo(0, -0.256);
  plateShape.lineTo(-0.216, -0.04);
  plateShape.closePath();
  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(plateShape),
    new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.55 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.02, 0);
  group.add(plate);

  // 라인 (타자석 · 포수석 · 파울라인)
  const lineMat = new THREE.MeshBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.72 });
  const addLine = (w, d, x, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = ry;
    m.position.set(x, 0.018, z);
    group.add(m);
    return m;
  };
  const boxOutline = (cx, cz, w = 1.22, d = 1.83) => {
    const t = 0.06;
    addLine(w, t, cx, cz + d / 2);
    addLine(w, t, cx, cz - d / 2);
    addLine(t, d, cx - w / 2, cz);
    addLine(t, d, cx + w / 2, cz);
  };
  boxOutline(0.94, 0.05); // 우타석
  boxOutline(-0.94, 0.05); // 좌타석
  // 포수석
  addLine(2.46, 0.06, 0, -1.05);
  addLine(0.06, 2.44, -1.23, -2.25);
  addLine(0.06, 2.44, 1.23, -2.25);

  // 파울라인 (홈 → 1루/3루 방향으로 길게)
  const foulLen = 92;
  const foulGeo = new THREE.PlaneGeometry(0.1, foulLen);
  [BASES.first, BASES.third].forEach((base) => {
    const dir = base.clone().normalize();
    const line = new THREE.Mesh(foulGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(dir.x, dir.z);
    line.position.set(dir.x * (foulLen / 2), 0.016, dir.z * (foulLen / 2));
    group.add(line);
  });

  // 베이스
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.6 });
  const baseGeo = new THREE.BoxGeometry(0.46, 0.07, 0.46);
  Object.values(BASES).forEach((p) => {
    const b = new THREE.Mesh(baseGeo, baseMat);
    b.position.set(p.x, 0.035, p.z);
    b.rotation.y = Math.PI / 4;
    b.castShadow = true;
    group.add(b);
  });

  return group;
}

/* ------------------------------------------------------------------ */
/*  백네트 · 관중석 · 외야 펜스                                          */
/* ------------------------------------------------------------------ */

function createSurroundings() {
  const group = new THREE.Group();
  group.name = 'surroundings';

  // 백네트 (홈 뒤쪽 곡면)
  const net = canvasTexture(netTexture(256, 15), { srgb: false });
  net.wrapS = net.wrapT = THREE.RepeatWrapping;
  net.repeat.set(26, 7);
  const netMat = new THREE.MeshBasicMaterial({
    map: net,
    alphaMap: net,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0x9fb4c8,
  });
  const backstop = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17, 9, 40, 1, true, Math.PI * 0.66, Math.PI * 0.68),
    netMat
  );
  backstop.position.set(0, 4.5, 0.4);
  group.add(backstop);

  // 관중석 (실루엣용 계단 박스)
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1b2231, roughness: 0.95 });
  for (let i = 0; i < 7; i++) {
    const r = 20.5 + i * 2.1;
    const h = 1.1 + i * 1.05;
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 44, 1, true, Math.PI * 0.6, Math.PI * 0.8),
      standMat
    );
    tier.position.set(0, h / 2, 0.4);
    group.add(tier);
  }

  // 외야 펜스
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x14301f, roughness: 0.9 });
  const fence = new THREE.Mesh(
    new THREE.CylinderGeometry(FENCE_RADIUS, FENCE_RADIUS, 3.1, 90, 1, true, Math.PI * 0.06, Math.PI * 0.88),
    fenceMat
  );
  fence.position.set(0, 1.55, 4);
  fence.material.side = THREE.DoubleSide;
  group.add(fence);

  // 펜스 상단 노란 라인
  const topLine = new THREE.Mesh(
    new THREE.CylinderGeometry(FENCE_RADIUS + 0.02, FENCE_RADIUS + 0.02, 0.16, 90, 1, true, Math.PI * 0.06, Math.PI * 0.88),
    new THREE.MeshBasicMaterial({ color: 0xd9c341, side: THREE.DoubleSide })
  );
  topLine.position.set(0, 3.12, 4);
  group.add(topLine);

  return group;
}

function createScoreboard() {
  const group = new THREE.Group();
  group.name = 'scoreboard';

  // 마운드 정중앙 뒤에 두면 투수를 가리므로 좌중간 쪽으로 비켜 세운다
  const cx = -30;
  const cz = FENCE_RADIUS - 6;
  const cy = 9.5;

  const tex = textPanelTexture({
    width: 1024,
    height: 384,
    background: '#080b11',
    border: 'rgba(255,212,94,0.3)',
    lines: [
      { text: '神奈川県立 横浜霜葩高等学校', size: 42, color: '#4d5b6b', weight: 500 },
      { text: '요코하마 소하고 야구부', size: 70, color: '#c8a34a', gap: 8 },
      { text: '夏の大会まで 3週間', size: 40, color: '#576677', weight: 500 },
    ],
  });

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(17, 6.4),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  panel.position.set(cx, cy, cz);
  panel.lookAt(0, cy, 0);
  group.add(panel);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(18.2, 7.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x0d1119, roughness: 0.85 })
  );
  frame.position.copy(panel.position).add(
    new THREE.Vector3(cx, 0, cz).normalize().multiplyScalar(0.45)
  );
  frame.quaternion.copy(panel.quaternion);
  group.add(frame);

  // 지지대
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.9 });
  const side = new THREE.Vector3(cz, 0, -cx).normalize().multiplyScalar(6.5);
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 11, 0.7), legMat);
    leg.position.set(cx + side.x * s, 5.5, cz + side.z * s);
    group.add(leg);
  });

  return group;
}

/* ------------------------------------------------------------------ */
/*  조명탑                                                              */
/* ------------------------------------------------------------------ */

const CONE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CONE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // vUv.y : 0 = 지면, 1 = 램프
    float along = smoothstep(0.0, 0.82, vUv.y);
    float fade = pow(along, 2.6) * (1.0 - smoothstep(0.88, 1.0, vUv.y) * 0.45);
    // 원통 가장자리에서 살짝 밝아지는 림
    float rim = 0.45 + 0.55 * pow(abs(sin(vUv.x * 3.14159)), 1.2);
    gl_FragColor = vec4(uColor, fade * rim * uOpacity);
  }
`;

function createTower(spec, index) {
  const group = new THREE.Group();
  group.name = `tower-${index}`;
  group.position.copy(spec.pos);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3140,
    roughness: 0.72,
    metalness: 0.55,
  });

  // 기둥 + 보강 트러스
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.62, TOWER_HEIGHT, 10),
    steelMat
  );
  pole.position.y = TOWER_HEIGHT / 2;
  pole.castShadow = true;
  group.add(pole);

  for (let i = 1; i <= 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55 + (4 - i) * 0.05, 0.05, 6, 14),
      steelMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = (TOWER_HEIGHT / 5) * i;
    group.add(ring);
  }

  // 램프 랙
  const rack = new THREE.Group();
  rack.position.y = TOWER_HEIGHT;
  group.add(rack);

  const rackBar = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 0.3), steelMat);
  rack.add(rackBar);

  const aimDir = spec.aim.clone().sub(spec.pos).setY(0).normalize();
  rack.rotation.y = Math.atan2(aimDir.x, aimDir.z);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    emissive: new THREE.Color(0xfff3d0),
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0.3,
  });

  const glowTex = canvasTexture(glowTexture(128, '#fffaf0', 'rgba(255,250,240,0)'));
  const glows = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      const x = (col - 2.5) * 1.25;
      const y = 0.72 + row * 1.05;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.82, 0.42), lampMat);
      lamp.position.set(x, y, 0.16);
      rack.add(lamp);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
          fog: false,
        })
      );
      glow.scale.set(1.7, 1.7, 1);
      glow.position.set(x, y, 0.5);
      rack.add(glow);
      glows.push(glow);
    }
  }

  // 볼륨광 콘
  const lampWorld = spec.pos.clone().setY(TOWER_HEIGHT);
  const aimPoint = spec.aim.clone();
  const dist = lampWorld.distanceTo(aimPoint);
  const coneGeo = new THREE.ConeGeometry(10.5, dist, 26, 1, true);
  const coneMat = new THREE.ShaderMaterial({
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0xfff0cc) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(lampWorld.clone().add(aimPoint).multiplyScalar(0.5)).sub(spec.pos);
  cone.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    lampWorld.clone().sub(aimPoint).normalize()
  );
  cone.renderOrder = 2;
  group.add(cone);

  // 실제 조명. three r155+ 는 물리 단위(칸델라)라 decay=2가 기본이어야 한다.
  // decay를 낮추면 40m 밖에서 조도가 수십 배로 뻥튀기되어 화면이 하얗게 탄다.
  const spot = new THREE.SpotLight(0xfff1d4, 0, 210, Math.PI / 7.2, 0.5, 2);
  spot.position.copy(lampWorld).sub(spec.pos);
  spot.target.position.copy(aimPoint).sub(spec.pos);
  group.add(spot);
  group.add(spot.target);

  return {
    group,
    lampMat,
    glows,
    coneMat,
    spot,
    /** 0..1 */
    setLevel(v) {
      const k = clamp(v);
      lampMat.emissiveIntensity = k * 1.35;
      glows.forEach((g) => (g.material.opacity = k * 0.3));
      coneMat.uniforms.uOpacity.value = k * 0.042;
      // 램프에서 내야까지 약 46m → E ≈ 3400/46² ≈ 1.6 lx-ish, 4기 합쳐 적정 노출
      spot.intensity = k * 3400;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  조립                                                                */
/* ------------------------------------------------------------------ */

export function createStadium(scene) {
  const group = new THREE.Group();
  group.name = 'stadium';
  scene.add(group);

  const sky = createSky();
  const stars = createStars();
  const moon = createMoon();
  group.add(sky, stars, moon);

  group.add(createGround());
  group.add(createSurroundings());
  group.add(createScoreboard());

  const towers = LIGHT_TOWERS.map((spec, i) => {
    const t = createTower(spec, i);
    group.add(t.group);
    return t;
  });
  // 홈 쪽 두 기만 그림자를 만든다 (4기 전부는 과하다)
  [0, 1].forEach((i) => {
    const spot = towers[i].spot;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 6;
    spot.shadow.camera.far = 120;
    spot.shadow.bias = -0.0012;
    spot.shadow.normalBias = 0.03;
  });

  // 달빛 (조명이 꺼진 1~2장에서 실루엣을 만들어 주는 유일한 광원)
  const moonlight = new THREE.DirectionalLight(0x9fc0ff, 1.8);
  moonlight.position.set(-60, 62, 96);
  moonlight.target.position.set(0, 0, 8);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(1024, 1024);
  moonlight.shadow.camera.near = 20;
  moonlight.shadow.camera.far = 220;
  moonlight.shadow.camera.left = -34;
  moonlight.shadow.camera.right = 34;
  moonlight.shadow.camera.top = 34;
  moonlight.shadow.camera.bottom = -34;
  moonlight.shadow.bias = -0.0016;
  group.add(moonlight, moonlight.target);

  const hemi = new THREE.HemisphereLight(0x3d5480, 0x0a0f14, 0.14);
  group.add(hemi);

  const ambient = new THREE.AmbientLight(0x27334d, 0.1);
  group.add(ambient);

  /** 홈플레이트 주변만 비추는 극적인 스포트 (3장에서 켜진다) */
  const keySpot = new THREE.SpotLight(0xffe6b8, 0, 46, Math.PI / 8, 0.55, 2);
  keySpot.position.set(4.5, 14, -7.5);
  keySpot.target.position.set(0.5, 0.9, 0.2);
  group.add(keySpot, keySpot.target);

  return {
    group,
    towers,
    moonlight,
    hemi,
    ambient,
    keySpot,
    stars,
    moon,

    /** 조명탑 개별 점등 (0..1) */
    setTowerLevel(i, v) {
      towers[i]?.setLevel(v);
    },
    setAllTowers(v) {
      towers.forEach((t) => t.setLevel(v));
    },
    setKeyLight(v) {
      // 램프까지 약 15.7m → E ≈ 420/15.7² ≈ 1.7
      keySpot.intensity = clamp(v) * 420;
    },
    setAmbientLevel(v) {
      const k = clamp(v, 0, 2);
      hemi.intensity = 0.14 + k * 0.24;
      ambient.intensity = 0.1 + k * 0.16;
    },
    setMoonlight(v) {
      moonlight.intensity = v;
    },
    setStarOpacity(v) {
      stars.material.uniforms.uOpacity.value = clamp(v);
      moon.material.opacity = clamp(v) * 0.9;
    },

    update(elapsed) {
      stars.material.uniforms.uTime.value = elapsed;
    },

    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.alphaMap) m.alphaMap.dispose();
            m.dispose();
          });
        }
      });
      scene.remove(group);
    },
  };
}
