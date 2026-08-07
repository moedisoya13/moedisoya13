import * as THREE from 'three';
import { pitchPosition } from '../pitches.js';
import { canvasTexture, baseballTexture, glowTexture } from '../utils/textTexture.js';
import { clamp, easeOutCubic, easeOutQuad } from '../utils/easing.js';

const TRAIL_SEGMENTS = 44;
/** 트레일이 덮는 궤적 길이 (u 단위) */
const TRAIL_SPAN = 0.2;
const SPARK_COUNT = 42;

/**
 * 공·트레일·임팩트 이펙트.
 *
 * 모든 상태는 (pitch, u) 또는 (progress)의 순수 함수로 갱신된다.
 * 프레임 누적을 쓰지 않기 때문에 타임라인을 스크럽해도 잔상이 어긋나지 않는다.
 */
export function createBall(scene) {
  const group = new THREE.Group();
  group.name = 'ball';
  scene.add(group);

  /* --- 공 --- */
  const tex = canvasTexture(baseballTexture(256));
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.037, 22, 16),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 })
  );
  ball.castShadow = true;
  group.add(ball);

  /* --- 공 주변 글로우 --- */
  const glowTex = canvasTexture(glowTexture(128, '#ffffff', 'rgba(255,255,255,0)'));
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
  glow.scale.set(0.16, 0.16, 1);
  group.add(glow);

  /* --- 트레일 (궤적을 되짚어 그린다) --- */
  const trailPos = new Float32Array(TRAIL_SEGMENTS * 3);
  const trailAlpha = new Float32Array(TRAIL_SEGMENTS);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1));

  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xfff0c4) },
      uOpacity: { value: 0 },
      uSize: { value: 1 },
      // 뷰포트 높이 / (2·tan(fov/2)) — 월드 반지름을 픽셀로 바꾸는 계수.
      // 이걸 빼먹으면 카메라가 공에 붙었을 때 점 하나가 화면을 다 덮는다.
      uPixelScale: { value: 900 },
    },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      uniform float uSize;
      uniform float uPixelScale;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // 꼬리로 갈수록 가늘어지는 월드 반지름 (m)
        float radius = (0.010 + aAlpha * 0.052) * uSize;
        gl_PointSize = clamp(radius * uPixelScale / -mv.z, 1.0, 96.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.02, d);
        gl_FragColor = vec4(uColor, a * vAlpha * vAlpha * uOpacity);
      }
    `,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  group.add(trail);

  /* --- 임팩트 링 --- */
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff3d4,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.15, 40), ringMat);
  ring.visible = false;
  group.add(ring);

  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.135, 40), ringMat.clone());
  ring2.visible = false;
  group.add(ring2);

  /* --- 스파크 --- */
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkDir = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const a = (i / SPARK_COUNT) * Math.PI * 2 + (i % 3) * 0.4;
    const r = 0.5 + ((i * 37) % 11) / 11;
    sparkDir.push(
      new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.85 + 0.25, (((i * 17) % 7) / 7 - 0.5) * 0.7)
    );
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.032,
    map: glowTex,
    color: 0xffe6b0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);

  const _p = new THREE.Vector3();
  const _c = new THREE.Vector3();

  return {
    group,
    ball,
    mesh: ball,
    position: ball.position,

    setVisible(v) {
      ball.visible = v;
      glow.visible = v;
      trail.visible = v;
      if (!v) {
        trailMat.uniforms.uOpacity.value = 0;
        glow.material.opacity = 0;
      }
    },

    /** 공을 임의 위치에 둔다 (투구 전 손안 등) */
    setPosition(v) {
      ball.position.copy(v);
      glow.position.copy(v);
    },

    /**
     * 궤적 위 u 지점으로 공과 트레일을 갱신한다.
     * @param {object} pitch  PITCHES 항목
     * @param {number} u      0..1
     * @param {number} intensity 트레일/글로우 세기 (0..1)
     */
    setPitchState(pitch, u, intensity = 1) {
      const t = clamp(u);
      pitchPosition(pitch, t, _p);
      ball.position.copy(_p);
      glow.position.copy(_p);

      // 회전 — 백스핀이 보이도록 X축 위주로 돌린다
      ball.rotation.set(t * 46, t * 7, t * 3.5);

      trailMat.uniforms.uColor.value.setHex(pitch.trailColor);
      ringMat.color.setHex(pitch.trailColor);

      const span = TRAIL_SPAN;
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const f = i / (TRAIL_SEGMENTS - 1);
        const uu = t - f * span;
        if (uu < 0) {
          // 아직 릴리스 전 구간 — 릴리스 포인트에 겹쳐 두고 투명 처리
          pitchPosition(pitch, 0, _c);
          trailAlpha[i] = 0;
        } else {
          pitchPosition(pitch, uu, _c);
          trailAlpha[i] = (1 - f) * clamp(t / 0.06);
        }
        trailPos[i * 3] = _c.x;
        trailPos[i * 3 + 1] = _c.y;
        trailPos[i * 3 + 2] = _c.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.aAlpha.needsUpdate = true;

      trailMat.uniforms.uOpacity.value = intensity * 0.9;
      trailMat.uniforms.uSize.value = 0.8 + intensity * 0.35;
      glow.material.opacity = intensity * 0.34;
      glow.scale.setScalar(0.1 + intensity * 0.05);
    },

    /** 매 프레임 카메라 화각/뷰포트에 맞춰 트레일의 픽셀 환산 계수를 갱신 */
    updateProjection(camera, viewportHeight) {
      trailMat.uniforms.uPixelScale.value =
        viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },

    /**
     * 포구/헛스윙 임팩트. progress 0..1 (시간의 함수 → 시크 안전)
     */
    setImpact(position, progress, { color = 0xfff3d4, scale = 1 } = {}) {
      const p = clamp(progress);
      const on = p > 0 && p < 1;
      ring.visible = ring2.visible = sparks.visible = on;
      if (!on) {
        ringMat.opacity = 0;
        sparkMat.opacity = 0;
        return;
      }

      ring.position.copy(position);
      ring2.position.copy(position);
      sparks.position.copy(position);

      ringMat.color.setHex(color);
      ring2.material.color.setHex(color);

      const e = easeOutCubic(p);
      // 미트 포구음 정도의 파문 — 바깥 지름 약 0.6m
      const s = (0.6 + e * 1.4) * scale;
      ring.scale.setScalar(s);
      ring2.scale.setScalar(s * 0.55);
      ringMat.opacity = (1 - p) * 0.9;
      ring2.material.opacity = (1 - p) * 0.65;

      // 링은 항상 카메라를 향하게 (billboard) — update()에서 처리
      const spread = easeOutQuad(p) * 0.42 * scale;
      for (let i = 0; i < SPARK_COUNT; i++) {
        const d = sparkDir[i];
        sparkPos[i * 3] = d.x * spread;
        sparkPos[i * 3 + 1] = d.y * spread - p * p * 0.12;
        sparkPos[i * 3 + 2] = d.z * spread;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = (1 - p) * 0.9;
      sparkMat.color.setHex(color);
    },

    /** 링을 카메라 쪽으로 돌린다 */
    faceCamera(camera) {
      ring.quaternion.copy(camera.quaternion);
      ring2.quaternion.copy(camera.quaternion);
    },

    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      scene.remove(group);
    },
  };
}
