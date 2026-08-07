import * as THREE from 'three';

/**
 * 필드 좌표계 (미터, Y-up)
 *
 *   홈플레이트 = 원점, 마운드 = +Z 방향 18.44m
 *   타자석에서 마운드를 바라볼 때 1루는 -X, 3루는 +X 쪽이다.
 *   따라서 우타자(코보리)와 우완 투수(키리야마)의 릴리스는 모두 +X 쪽.
 */

export const PITCH_DISTANCE = 18.44;

export const PLATE = new THREE.Vector3(0, 0, 0);
export const MOUND = new THREE.Vector3(0, 0, PITCH_DISTANCE);
export const MOUND_HEIGHT = 0.25;
export const MOUND_RADIUS = 2.75;

/**
 * 우완 오버스로 릴리스 포인트.
 * 리그(players.js)가 릴리스 포즈에서 실제로 손을 놓는 위치에 맞춰 둔 값이다.
 */
export const RELEASE = new THREE.Vector3(0.58, 2.12, PITCH_DISTANCE - 0.99);

/** 세 구질이 공유하는 "직선 터널" 도착점 = 스트라이크존 상단. */
export const TUNNEL_TARGET = new THREE.Vector3(0.02, 1.06, -0.86);

export const BATTER_POS = new THREE.Vector3(0.94, 0, 0.12);
export const CATCHER_POS = new THREE.Vector3(0.02, 0, -1.32);
export const UMPIRE_POS = new THREE.Vector3(0.05, 0, -2.35);
export const CAPTAIN_POS = new THREE.Vector3(2.6, 0, -0.9);

/** 스트라이크존 (우타자 기준, 대략치) */
export const ZONE = {
  top: 1.12,
  bottom: 0.52,
  halfWidth: 0.216,
  z: -0.2,
};

export const BASES = {
  first: new THREE.Vector3(-19.4, 0, 19.4),
  second: new THREE.Vector3(0, 0, 38.8),
  third: new THREE.Vector3(19.4, 0, 19.4),
};

/** 조명탑 4기 — [x, z, 조준점] */
export const LIGHT_TOWERS = [
  { pos: new THREE.Vector3(-40, 0, -2), aim: new THREE.Vector3(-2, 0, 12) },
  { pos: new THREE.Vector3(40, 0, -2), aim: new THREE.Vector3(2, 0, 12) },
  { pos: new THREE.Vector3(-36, 0, 56), aim: new THREE.Vector3(-4, 0, 16) },
  { pos: new THREE.Vector3(36, 0, 56), aim: new THREE.Vector3(4, 0, 16) },
];

export const TOWER_HEIGHT = 24;
export const FENCE_RADIUS = 96;
