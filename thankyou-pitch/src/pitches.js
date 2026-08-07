import * as THREE from 'three';
import { RELEASE, TUNNEL_TARGET } from './layout.js';
import { clamp, easeInCubic, easeOutCubic, easeOutQuad } from './utils/easing.js';

/**
 * 키리야마 후세츠의 3구.
 *
 * 세 구질 모두 같은 릴리스 포인트에서 같은 직선(TUNNEL_TARGET)을 향해 출발하고,
 * 궤도 후반에만 어긋난다 — 원작에서 타자가 속는 이유가 그 "터널"이기 때문이다.
 *
 * path(u)는 u∈[0,1]에 대한 순수 함수라서 카메라·트레일·사운드·시크가
 * 전부 같은 값을 공유한다. (스크럽해도 화면이 튀지 않는다)
 */

const _straight = new THREE.Vector3();

/** 재생 시간(t) → 궤적 파라미터(u). 뒤로 갈수록 느려지는 슬로모 커브. */
function slowMo(strength) {
  return (t) => {
    const x = clamp(t);
    return x * (1 - strength) + easeOutCubic(x) * strength;
  };
}

export const PITCHES = [
  {
    id: 'fastball',
    labelKo: '스트레이트',
    labelEn: 'STRAIGHT',
    speedKmh: 163,
    /** 릴리스→포구까지의 화면상 재생 시간 (실제 0.40초를 늘린 값) */
    duration: 1.15,
    warp: slowMo(0.55),
    trailColor: 0xfff0c4,
    result: 'strike',
    resultKo: '스트라이크',
    swings: false,
    /** 직선 대비 편차 */
    offset(u) {
      // 백스핀으로 거의 떨어지지 않는 대신 살짝 arm-side로 흐른다.
      return {
        x: 0.07 * u * u,
        y: -0.07 * u * u + 0.03 * Math.sin(Math.PI * u),
      };
    },
  },
  {
    id: 'niagara',
    labelKo: '나이아가라 포크',
    labelEn: 'NIAGARA FORK',
    speedKmh: 141,
    duration: 1.55,
    warp: slowMo(0.72),
    trailColor: 0x8fd6ff,
    result: 'swing-miss',
    resultKo: '헛스윙',
    swings: true,
    /** 스윙이 시작되는 u (배트가 지나가는 시점) */
    swingAt: 0.78,
    breakAt: 0.58,
    offset(u) {
      // 0.58까지는 직구와 완전히 같은 궤도 → 그 뒤 절벽처럼 떨어진다.
      // 4제곱이라 낙차 자체(-0.88m)보다 "언제 꺾이는가"가 더 극적으로 보인다.
      const b = clamp((u - 0.58) / 0.42);
      return {
        x: 0.09 * u * u,
        y: -0.05 * u * u - 0.88 * b * b * b * b,
      };
    },
  },
  {
    id: 'moon',
    labelKo: '문 임팩트',
    labelEn: 'MOON IMPACT',
    speedKmh: 128,
    duration: 1.9,
    warp: slowMo(0.82),
    trailColor: 0xc9b6ff,
    result: 'strikeout',
    resultKo: '삼진',
    swings: true,
    swingAt: 0.8,
    breakAt: 0.5,
    offset(u) {
      // 느린 체인지업 → 중력으로 가라앉는 듯하다가 백스핀으로 떠오른다.
      const b = clamp((u - 0.5) / 0.5);
      return {
        x: -0.11 * u * u,
        y: -0.2 * easeOutQuad(clamp(u / 0.55)) + 0.66 * easeOutCubic(b),
      };
    },
  },
];

/**
 * u(궤적 파라미터)에서의 공 위치를 out에 쓴다.
 */
export function pitchPosition(pitch, u, out = new THREE.Vector3()) {
  const t = clamp(u);
  _straight.lerpVectors(RELEASE, TUNNEL_TARGET, t);
  const off = pitch.offset(t);
  out.set(_straight.x + off.x, _straight.y + off.y, _straight.z);
  return out;
}

/** 포수가 미트를 대야 하는 최종 위치. */
export function mittPosition(pitch, out = new THREE.Vector3()) {
  return pitchPosition(pitch, 1, out);
}

