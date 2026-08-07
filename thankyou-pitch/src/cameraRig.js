import * as THREE from 'three';
import { clamp, resolveEase, smoothNoise } from './utils/easing.js';

/**
 * 카메라 샷 보간 + 흔들림.
 *
 * 모든 값이 타임라인 시각의 함수라서 스크럽해도 같은 프레임이 나온다.
 * (프레임 누적 스무딩을 쓰지 않는 이유)
 */

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** 샷 정의: { pos:[x,y,z], look:[x,y,z], fov } */
export function mixShot(from, to, p, ease = 'easeInOutCubic') {
  const e = resolveEase(ease)(clamp(p));
  return {
    pos: [
      from.pos[0] + (to.pos[0] - from.pos[0]) * e,
      from.pos[1] + (to.pos[1] - from.pos[1]) * e,
      from.pos[2] + (to.pos[2] - from.pos[2]) * e,
    ],
    look: [
      from.look[0] + (to.look[0] - from.look[0]) * e,
      from.look[1] + (to.look[1] - from.look[1]) * e,
      from.look[2] + (to.look[2] - from.look[2]) * e,
    ],
    fov: (from.fov ?? 38) + ((to.fov ?? from.fov ?? 38) - (from.fov ?? 38)) * e,
  };
}

/** 샷을 설계한 기준 화면비 — 이보다 좁은 화면에서는 수직 화각을 넓혀 보정한다 */
const DESIGN_ASPECT = 16 / 9;

/**
 * PerspectiveCamera.fov는 수직 화각이라, 세로로 긴 화면에서는 수평 화각이
 * 급격히 좁아져 구도가 통째로 잘린다. 기준 화면비에서의 수평 화각을 유지하도록
 * 수직 화각을 다시 계산한다.
 */
function fitFov(fovDeg, aspect) {
  if (!aspect || aspect >= DESIGN_ASPECT) return fovDeg;
  const vRad = (fovDeg * Math.PI) / 180;
  const hRad = 2 * Math.atan(Math.tan(vRad / 2) * DESIGN_ASPECT);
  const fitted = (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
  return Math.min(fitted, 105);
}

export function createCameraRig(camera) {
  let shakeAmount = 0;
  let shakeSeed = 0;
  let fovPunch = 0;
  let rollAmount = 0;

  return {
    camera,

    /** 이번 프레임의 흔들림 세기 (0..1). 챕터가 매 프레임 지정한다. */
    setShake(amount, seed = 0) {
      shakeAmount = clamp(amount, 0, 3);
      shakeSeed = seed;
    },
    setFovPunch(v) {
      fovPunch = v;
    },
    setRoll(v) {
      rollAmount = v;
    },

    /**
     * @param {{pos:number[]|THREE.Vector3, look:number[]|THREE.Vector3, fov:number}} s
     * @param {number} t 타임라인 시각 (흔들림 노이즈 시드)
     */
    apply(s, t) {
      if (Array.isArray(s.pos)) _pos.set(s.pos[0], s.pos[1], s.pos[2]);
      else _pos.copy(s.pos);
      if (Array.isArray(s.look)) _look.set(s.look[0], s.look[1], s.look[2]);
      else _look.copy(s.look);

      const fov = fitFov((s.fov ?? 38) + fovPunch, camera.aspect);

      if (shakeAmount > 0.0001) {
        const n = t * 26 + shakeSeed * 100;
        // 카메라 로컬 축 기준으로 흔든다 (월드축으로 흔들면 어색하다)
        _fwd.copy(_look).sub(_pos).normalize();
        _up.set(0, 1, 0);
        _right.crossVectors(_fwd, _up).normalize();
        _up.crossVectors(_right, _fwd).normalize();

        const sx = smoothNoise(n) * shakeAmount;
        const sy = smoothNoise(n + 31.7) * shakeAmount;
        const lx = smoothNoise(n + 57.3) * shakeAmount;
        const ly = smoothNoise(n + 83.1) * shakeAmount;

        _tmp.copy(_right).multiplyScalar(sx * 0.14);
        _pos.add(_tmp);
        _tmp.copy(_up).multiplyScalar(sy * 0.11);
        _pos.add(_tmp);

        _tmp.copy(_right).multiplyScalar(lx * 0.2);
        _look.add(_tmp);
        _tmp.copy(_up).multiplyScalar(ly * 0.16);
        _look.add(_tmp);
      }

      camera.position.copy(_pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(_look);
      if (rollAmount !== 0) camera.rotateZ(rollAmount);

      if (Math.abs(camera.fov - fov) > 0.001) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },

    reset() {
      shakeAmount = 0;
      fovPunch = 0;
      rollAmount = 0;
    },
  };
}

/**
 * 대상(공)을 화면에 두면서 지정한 오프셋 위치에서 따라가는 샷.
 * @param {THREE.Vector3} target
 * @param {number[]} offset  대상 기준 오프셋
 */
export function followShot(target, offset, fov = 34, lookAhead = null) {
  return {
    pos: [target.x + offset[0], target.y + offset[1], target.z + offset[2]],
    look: lookAhead
      ? [target.x + lookAhead[0], target.y + lookAhead[1], target.z + lookAhead[2]]
      : [target.x, target.y, target.z],
    fov,
  };
}
