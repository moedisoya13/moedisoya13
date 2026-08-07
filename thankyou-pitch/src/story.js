import * as THREE from 'three';
import { PITCHES, mittPosition, pitchPosition } from './pitches.js';
import { BATTER_POS, MOUND, MOUND_HEIGHT } from './layout.js';
import { followShot, mixShot } from './cameraRig.js';
import { clamp, lerp, smoothstep } from './utils/easing.js';

/**
 * 「땡큐 피치」 1부의 줄거리를 62초 8챕터로 압축한 대본.
 *
 * 각 챕터의 apply(ctx)는 "시각 t에서의 화면 상태"를 통째로 세팅하는 함수다.
 * 프레임 간 누적 상태를 쓰지 않기 때문에 어느 시점으로 스크럽해도 결과가 같다.
 * 사운드처럼 되돌릴 수 없는 것만 cues[]로 분리해 디렉터가 전진 재생 중에만 쏜다.
 */

const [FASTBALL, NIAGARA, MOON] = PITCHES;

const _v = new THREE.Vector3();
const _mitt = new THREE.Vector3();

/* ------------------------------------------------------------------ */
/*  공통 유틸                                                           */
/* ------------------------------------------------------------------ */

/** local이 [a,b] 구간에서 갖는 0..1 진행률 */
const seg = (local, a, b) => clamp((local - a) / (b - a || 1));

/** 자막 페이드 인/아웃 envelope */
function capAlpha(local, at, until, fadeIn = 0.38, fadeOut = 0.42) {
  if (local <= at - fadeIn || local >= until + fadeOut) return 0;
  return Math.min(clamp((local - at) / fadeIn), clamp((until - local) / fadeOut));
}

/** 수은등이 켜질 때의 특유한 깜빡임 */
function ignite(local, at, ramp = 0.55) {
  const d = local - at;
  if (d < 0) return 0;
  if (d < 0.1) return 0.7;
  if (d < 0.18) return 0.08;
  if (d < 0.29) return 0.95;
  if (d < 0.35) return 0.22;
  return Math.min(1, 0.35 + (d - 0.35) / ramp);
}

/** 충격 순간의 감쇠 흔들림 */
const shakeEnv = (local, at, dur = 0.7) => {
  const d = local - at;
  if (d < 0 || d > dur) return 0;
  return Math.pow(1 - d / dur, 2.2);
};

function setStageLights(stage, level, { key = 0, stars = 1, ambient = level } = {}) {
  stage.stadium.setAllTowers(level);
  stage.stadium.setKeyLight(key);
  stage.stadium.setAmbientLevel(ambient);
  stage.stadium.setStarOpacity(stars);
}

/* ------------------------------------------------------------------ */
/*  투구 챕터 공용 로직                                                  */
/* ------------------------------------------------------------------ */

const RELEASE_PHASE = 0.76;

/**
 * 와인드업 → 릴리스 → 비행 → 포구까지의 무대 상태를 한 번에 세팅한다.
 * 카메라가 쓸 수 있도록 주요 시각과 진행률을 돌려준다.
 */
function runPitch(ctx, cfg) {
  const { local, stage } = ctx;
  const { pitch, windup0, windup1, swingDur = 1.1, impactDur = 0.8 } = cfg;

  const windupLen = windup1 - windup0;
  const releaseLocal = windup0 + RELEASE_PHASE * windupLen;
  const flightEnd = releaseLocal + pitch.duration;

  /* 투수 모션 */
  stage.cast.setPitchPhase(clamp((local - windup0) / windupLen));

  /* 공 */
  let u = 0;
  if (local < releaseLocal) {
    stage.ball.setVisible(false);
  } else if (local <= flightEnd) {
    const linear = (local - releaseLocal) / pitch.duration;
    u = pitch.warp(linear);
    stage.ball.setVisible(true);
    stage.ball.setPitchState(pitch, u, 1);
  } else {
    u = 1;
    stage.ball.setVisible(true);
    // 포구 후에는 미트 안에 머문다
    stage.ball.setPitchState(pitch, 1, Math.max(0, 1 - (local - flightEnd) / 0.35));
  }

  /* 포수 미트 — 구질에 맞는 위치로 미리 이동 */
  mittPosition(pitch, _mitt);
  const settle = clamp((local - (windup0 + windupLen * 0.3)) / 0.8);
  _v.set(0.06, 1.0, -0.9).lerp(_mitt, settle);
  stage.cast.setMittTarget(_v);

  /* 타자 */
  if (pitch.swings) {
    const swingLocal = releaseLocal + pitch.swingAt * pitch.duration;
    const swingStart = swingLocal - 0.66 * swingDur;
    if (local < swingStart) {
      stage.cast.setBatterStance();
    } else {
      stage.cast.setSwingPhase((local - swingStart) / swingDur);
    }
  } else {
    stage.cast.setBatterStance();
  }

  /* 임팩트 */
  const impactP = local >= flightEnd ? (local - flightEnd) / impactDur : 0;
  if (impactP > 0 && impactP < 1) {
    pitchPosition(pitch, 1, _v);
    stage.ball.setImpact(_v, impactP, { color: pitch.trailColor, scale: 1 });
  } else {
    stage.ball.setImpact(_v, 0);
  }

  return { releaseLocal, flightEnd, u, impactP, pitch };
}

/* ------------------------------------------------------------------ */
/*  챕터                                                                */
/* ------------------------------------------------------------------ */

export const CHAPTERS = [
  /* ---------------------------------------------------------------- */
  {
    no: 1,
    id: 'rumor',
    title: '소문',
    t0: 0,
    t1: 7,
    captions: [
      { at: 0.7, until: 3.2, text: '6월, 가나가와.', cls: 'sub--note' },
      { at: 3.3, until: 6.7, text: '고교 야구부 사이에 이상한 소문이 돌았다' },
    ],
    cues: [{ at: 0.2, sfx: 'night' }],
    camera(ctx) {
      // 백네트(반지름 17) 바깥에서 시작해 안쪽으로 내려온다
      return mixShot(
        { pos: [12, 26, -28], look: [0, 3.2, 17], fov: 44 },
        { pos: [6.2, 7.2, -13.2], look: [0, 2.4, 16], fov: 38 },
        ctx.p,
        'easeInOutCubic'
      );
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 0, { key: 0, stars: 1, ambient: 0 });
      stage.stadium.setMoonlight(1.8);
      stage.cast.setVisible({ pitcher: false, batter: false, catcher: false });
      stage.ball.setVisible(false);
      stage.hud.setChapterVisible(local > 0.5);
      stage.hud.setVisible(false);
      stage.rig.setShake(0.06);
      stage.fx.setFlash(0);
      stage.fx.setTitle(0);
      stage.audio.setTension(0.08);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 2,
    id: 'hunter',
    title: '야구부 사냥꾼',
    t0: 7,
    t1: 14,
    captions: [
      { at: 0.5, until: 3.4, text: '밤마다 나타나 「3구 승부」를 청하는 남자' },
      { at: 3.7, until: 6.7, text: '「야구부 사냥꾼」 — 아직 한 번도 진 적이 없다' },
    ],
    cues: [
      { at: 1.1, sfx: 'lampOn' },
      { at: 1.95, sfx: 'lampOn' },
      { at: 2.8, sfx: 'lampOn' },
      { at: 3.65, sfx: 'lampOn' },
      { at: 4.2, sfx: 'crowdRise' },
    ],
    camera(ctx) {
      // 홈에서 외야를 향한 광각 — 좌우 조명탑이 하나씩 켜지며 구장이 드러난다
      const a = mixShot(
        { pos: [1.0, 1.6, -5.0], look: [0, 8.5, 36], fov: 60 },
        { pos: [0.9, 2.1, -4.0], look: [0, 5.6, 30], fov: 53 },
        seg(ctx.local, 0, 3.6),
        'easeOutCubic'
      );
      const b = mixShot(
        { pos: [0.9, 2.1, -4.0], look: [0, 5.6, 30], fov: 53 },
        { pos: [3.4, 2.35, 2.6], look: [0.55, 1.85, 17.5], fov: 38 },
        seg(ctx.local, 3.6, 6.9),
        'easeInOutCubic'
      );
      return ctx.local < 3.6 ? a : b;
    },
    apply(ctx) {
      const { stage, local } = ctx;
      // 화면에 보이는 외야 쪽 두 기(인덱스 2,3)를 먼저 켜야 점등이 눈에 들어온다.
      // 홈 쪽 두 기는 카메라 뒤에 있어 나중에 켜지며 그라운드를 덮는다.
      const levels = [
        ignite(local, 2.8),
        ignite(local, 3.65),
        ignite(local, 1.1),
        ignite(local, 1.95),
      ];
      levels.forEach((v, i) => stage.stadium.setTowerLevel(i, v));
      const avg = levels.reduce((a, b) => a + b, 0) / 4;
      stage.stadium.setAmbientLevel(avg);
      stage.stadium.setStarOpacity(1 - avg * 0.55);
      stage.stadium.setMoonlight(1.8 - avg * 1.15);
      stage.stadium.setKeyLight(0);

      // 조명이 켜지면 마운드 위 실루엣이 드러난다
      const revealed = local > 3.9;
      stage.cast.setVisible({ pitcher: revealed, batter: false, catcher: false });
      stage.cast.setPitcherIdle(ctx.t);
      stage.ball.setVisible(false);

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(false);
      // 점등 순간마다 살짝 흔들린다
      const s = Math.max(
        shakeEnv(local, 1.1, 0.35),
        shakeEnv(local, 1.95, 0.35),
        shakeEnv(local, 2.8, 0.35),
        shakeEnv(local, 3.65, 0.35)
      );
      stage.rig.setShake(0.06 + s * 0.28);
      stage.fx.setFlash(0);
      stage.audio.setTension(0.2 + avg * 0.15);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 3,
    id: 'bait',
    title: '미끼',
    t0: 14,
    t1: 21,
    captions: [
      { at: 0.4, until: 3.5, text: '하마소 주장 코보리 헤이타는 스스로 미끼가 되었다' },
      { at: 3.8, until: 6.7, text: '고시엔이라는 숙원을 위해' },
    ],
    cues: [
      { at: 0.5, sfx: 'footsteps' },
      { at: 2.9, sfx: 'batTap' },
      { at: 5.2, sfx: 'hudOn' },
    ],
    camera(ctx) {
      // 코보리의 어깨 너머로 마운드를 본다. 오버숄더가 성립하려면 카메라가
      // 타자–마운드 축에 거의 올라타 있어야 한다.
      return mixShot(
        { pos: [2.9, 2.2, -4.6], look: [0.5, 1.35, 8], fov: 46 },
        { pos: [1.62, 1.78, -2.05], look: [0.45, 1.5, 16.5], fov: 38 },
        ctx.p,
        'easeInOutCubic'
      );
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: seg(local, 0.6, 2.2), stars: 0.45, ambient: 1 });
      stage.stadium.setMoonlight(0.65);

      stage.cast.setVisible({ pitcher: true, batter: true, catcher: local > 2.2 });
      stage.cast.setPitcherIdle(ctx.t);
      stage.cast.setBatterPosition(BATTER_POS.x, 0, BATTER_POS.z, Math.PI / 2);
      stage.cast.setBatVisible(true);
      stage.cast.setOfferedCapVisible(false);
      stage.cast.setStepIn(seg(local, 0.4, 3.0));
      stage.cast.setCatcherCrouch();
      stage.cast.setMittTarget(_v.set(0.06, 1.0, -0.9));
      stage.ball.setVisible(false);

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(local > 5.1);
      stage.hud.setPips(3);
      stage.hud.setSpeed(null);
      stage.hud.setStrikes(null);
      stage.rig.setShake(0.05);
      stage.fx.setFlash(0);
      stage.audio.setTension(0.35);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 4,
    id: 'pitch-1',
    title: '1구 — 스트레이트',
    t0: 21,
    t1: 29,
    windup0: 0.5,
    windup1: 3.0,
    captions: [
      { at: 0.3, until: 2.1, text: '“3구면 된다.”', cls: 'sub--quote' },
      { at: 3.7, until: 5.0, text: '163 km/h', cls: 'sub--shout' },
      { at: 5.2, until: 7.6, text: '스트라이크 — 배트는 나오지도 못했다' },
    ],
    cues: [
      { at: 2.4, sfx: 'release' },
      { at: 2.5, sfx: 'whoosh', opts: { dur: 1.05 } },
      { at: 3.55, sfx: 'mitt', opts: { power: 1 } },
      { at: 3.6, sfx: 'crowdGasp' },
    ],
    camera(ctx) {
      const { local } = ctx;
      const st = runtime(ctx);
      if (local < st.releaseLocal) {
        // 3루 쪽 로우 앵글 — 다리를 크게 드는 폼을 올려다본다
        return mixShot(
          { pos: [5.8, 0.85, 20.9], look: [0.5, 1.5, 18.3], fov: 44 },
          { pos: [4.0, 1.55, 19.5], look: [0.45, 1.75, 18.2], fov: 35 },
          seg(local, 0, st.releaseLocal),
          'easeInOutCubic'
        );
      }
      if (local <= st.flightEnd) {
        // 공과 나란히 달린다. 타자가 +X(3루)쪽이라 카메라는 1루쪽(-X)에 둬야
        // 렌즈가 막히지 않고, 타자가 공 너머 배경으로 들어온다.
        const u = st.u;
        return followShot(
          ctx.stage.ball.position,
          [lerp(-2.4, -1.5, u), lerp(0.5, 0.28, u), lerp(1.3, 0.8, u)],
          lerp(36, 30, u)
        );
      }
      // 포구 클로즈업 → 뒤로 빠짐 (비행 샷과 같은 1루쪽을 유지해 컷이 튀지 않게)
      return mixShot(
        { pos: [-2.5, 1.34, -2.6], look: [0.12, 0.99, -0.88], fov: 31 },
        { pos: [-4.0, 2.5, -5.4], look: [0.4, 1.35, 5.5], fov: 42 },
        seg(local, st.flightEnd + 0.55, ctx.chapter.t1 - ctx.chapter.t0),
        'easeInOutCubic'
      );
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: 1, stars: 0.4, ambient: 1 });
      stage.stadium.setMoonlight(0.65);
      stage.cast.setVisible({ pitcher: true, batter: true, catcher: true });
      stage.cast.setBatterPosition(BATTER_POS.x, 0, BATTER_POS.z, Math.PI / 2);
      stage.cast.setBatVisible(true);
      stage.cast.setOfferedCapVisible(false);

      const st = runPitch(ctx, { pitch: FASTBALL, windup0: 0.5, windup1: 3.0 });
      ctx.runtime = st;

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(true);
      stage.hud.setPips(local >= st.releaseLocal ? 2 : 3);
      stage.hud.setSpeed(
        local >= st.releaseLocal && local < st.flightEnd + 1.9
          ? { kmh: FASTBALL.speedKmh, name: FASTBALL.labelKo, reveal: seg(local, st.releaseLocal, st.flightEnd) }
          : null
      );
      stage.hud.setStrikes(local >= st.flightEnd ? 1 : 0);

      stage.rig.setShake(0.05 + shakeEnv(local, st.flightEnd, 0.65) * 0.9);
      stage.fx.setFlash(shakeEnv(local, st.flightEnd, 0.28) * 0.35);
      stage.fx.setTitle(0);
      stage.audio.setTension(0.55);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 5,
    id: 'pitch-2',
    title: '2구 — 나이아가라 포크',
    t0: 29,
    t1: 37,
    windup0: 0.3,
    windup1: 2.3,
    captions: [
      { at: 0.2, until: 1.7, text: '같은 팔, 같은 궤도.', cls: 'sub--note' },
      { at: 3.5, until: 5.0, text: '나이아가라 포크', cls: 'sub--shout' },
      { at: 5.2, until: 7.6, text: '폭포처럼 떨어진다 — 헛스윙' },
    ],
    cues: [
      { at: 1.82, sfx: 'release' },
      { at: 1.9, sfx: 'whoosh', opts: { dur: 1.4 } },
      { at: 3.03, sfx: 'batWhiff' },
      { at: 3.37, sfx: 'mitt', opts: { power: 0.7 } },
      { at: 3.45, sfx: 'crowdGasp' },
    ],
    camera(ctx) {
      const { local } = ctx;
      const st = runtime(ctx);
      if (local < st.releaseLocal) {
        // 손끝 클로즈업 — 포크 그립
        return mixShot(
          { pos: [3.1, 2.35, 20.2], look: [0.6, 2.0, 17.9], fov: 31 },
          { pos: [2.35, 2.24, 19.0], look: [0.58, 2.06, 17.7], fov: 25 },
          seg(local, 0, st.releaseLocal),
          'easeInOutCubic'
        );
      }
      if (local <= st.flightEnd) {
        // 완전한 측면(1루쪽) — 수직 낙차가 가장 잘 보이는 각도
        const u = st.u;
        return followShot(
          ctx.stage.ball.position,
          [lerp(-3.2, -2.5, u), lerp(0.1, 0.38, u), lerp(0.5, -0.4, u)],
          lerp(34, 30, u)
        );
      }
      return mixShot(
        { pos: [-2.9, 1.4, -3.2], look: [0.7, 0.55, 0.1], fov: 36 },
        { pos: [-5.0, 2.6, -6.2], look: [0.5, 1.2, 4.5], fov: 42 },
        seg(local, st.flightEnd + 0.5, ctx.chapter.t1 - ctx.chapter.t0),
        'easeInOutCubic'
      );
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: 1, stars: 0.4, ambient: 1 });
      stage.stadium.setMoonlight(0.65);
      stage.cast.setVisible({ pitcher: true, batter: true, catcher: true });
      stage.cast.setBatterPosition(BATTER_POS.x, 0, BATTER_POS.z, Math.PI / 2);
      stage.cast.setBatVisible(true);
      stage.cast.setOfferedCapVisible(false);

      const st = runPitch(ctx, { pitch: NIAGARA, windup0: 0.3, windup1: 2.3 });
      ctx.runtime = st;

      const swingLocal = st.releaseLocal + NIAGARA.swingAt * NIAGARA.duration;

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(true);
      stage.hud.setPips(local >= st.releaseLocal ? 1 : 2);
      stage.hud.setSpeed(
        local >= st.releaseLocal && local < st.flightEnd + 1.9
          ? { kmh: NIAGARA.speedKmh, name: NIAGARA.labelKo, reveal: seg(local, st.releaseLocal, st.flightEnd) }
          : null
      );
      stage.hud.setStrikes(local >= swingLocal ? 2 : 1);

      stage.rig.setShake(
        0.05 + shakeEnv(local, swingLocal, 0.45) * 0.7 + shakeEnv(local, st.flightEnd, 0.5) * 0.45
      );
      stage.fx.setFlash(shakeEnv(local, swingLocal, 0.22) * 0.28);
      stage.fx.setTitle(0);
      stage.audio.setTension(0.7);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 6,
    id: 'pitch-3',
    title: '3구 — 문 임팩트',
    t0: 37,
    t1: 46,
    windup0: 0.4,
    windup1: 2.4,
    captions: [
      { at: 0.2, until: 1.9, text: '마지막 한 구.', cls: 'sub--note' },
      { at: 3.6, until: 5.1, text: '문 임팩트', cls: 'sub--shout' },
      { at: 5.4, until: 8.6, text: '배트 위를 스쳐 떠오른다 — 삼진. 3구 승부, 끝.' },
    ],
    cues: [
      { at: 1.92, sfx: 'release' },
      { at: 2.0, sfx: 'whoosh', opts: { dur: 1.8 } },
      { at: 3.44, sfx: 'batWhiff' },
      { at: 3.5, sfx: 'strikeout' },
      { at: 3.82, sfx: 'mitt', opts: { power: 0.85 } },
      { at: 3.95, sfx: 'crowdRoar' },
    ],
    camera(ctx) {
      const { local } = ctx;
      const st = runtime(ctx);
      const swingLocal = st.releaseLocal + MOON.swingAt * MOON.duration;

      if (local < st.releaseLocal) {
        // 타자 어깨 너머 — 타자가 보는 마운드
        return mixShot(
          { pos: [2.15, 1.86, -1.35], look: [0.5, 1.5, 13], fov: 40 },
          { pos: [1.72, 1.78, -0.55], look: [0.52, 1.72, 17.4], fov: 31 },
          seg(local, 0, st.releaseLocal),
          'easeInOutCubic'
        );
      }
      if (local <= st.flightEnd + 0.4) {
        // 승부의 마지막 한 구는 고정 앵글로 받는다. 포수 뒤 로우앵글이라
        // 「공이 배트 위로 떠오른다」는 높이 차가 그대로 읽힌다.
        return mixShot(
          { pos: [-1.5, 1.16, -3.9], look: [0.75, 1.3, 0.9], fov: 41 },
          { pos: [-1.22, 1.04, -2.95], look: [0.82, 1.26, 0.25], fov: 34 },
          seg(local, st.releaseLocal, st.flightEnd + 0.4),
          'easeInOutCubic'
        );
      }
      // 마운드로 스냅
      return mixShot(
        { pos: [2.4, 2.4, 12.8], look: [0.5, 1.62, 17.8], fov: 30 },
        { pos: [1.8, 2.15, 14.8], look: [0.5, 1.6, 17.85], fov: 26 },
        seg(local, st.flightEnd + 0.6, ctx.chapter.t1 - ctx.chapter.t0),
        'easeOutCubic'
      );
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: 1, stars: 0.4, ambient: 1 });
      stage.stadium.setMoonlight(0.65);
      stage.cast.setVisible({ pitcher: true, batter: true, catcher: true });
      stage.cast.setBatterPosition(BATTER_POS.x, 0, BATTER_POS.z, Math.PI / 2);
      stage.cast.setBatVisible(true);
      stage.cast.setOfferedCapVisible(false);

      const st = runPitch(ctx, { pitch: MOON, windup0: 0.4, windup1: 2.4, swingDur: 1.25 });
      ctx.runtime = st;

      const swingLocal = st.releaseLocal + MOON.swingAt * MOON.duration;

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(local < 6.4);
      stage.hud.setPips(local >= st.releaseLocal ? 0 : 1);
      stage.hud.setSpeed(
        local >= st.releaseLocal && local < st.flightEnd + 2.0
          ? { kmh: MOON.speedKmh, name: MOON.labelKo, reveal: seg(local, st.releaseLocal, st.flightEnd) }
          : null
      );
      stage.hud.setStrikes(local >= swingLocal ? 3 : 2);

      stage.rig.setShake(
        0.05 + shakeEnv(local, swingLocal, 0.55) * 1.15 + shakeEnv(local, st.flightEnd, 0.6) * 0.6
      );
      // 삼진 순간 화면 전체가 하얗게 탄다
      stage.fx.setFlash(shakeEnv(local, swingLocal, 0.38) * 0.85);
      stage.fx.setTitle(0);
      stage.audio.setTension(1);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 7,
    id: 'identity',
    title: '정체',
    t0: 46,
    t1: 54,
    captions: [
      { at: 0.4, until: 3.4, text: '키리야마 후세츠 — 「야구의 신에게 사랑받은 아이」' },
      { at: 3.7, until: 7.6, text: '사고로 얻은 입스. 전력으로 던질 수 있는 공은 하루 세 개뿐이다.' },
    ],
    cues: [{ at: 0.3, sfx: 'heartbeat' }],
    camera(ctx) {
      const { local } = ctx;
      const a = mixShot(
        { pos: [2.75, 2.3, 13.6], look: [0.35, 1.85, 17.8], fov: 35 },
        { pos: [1.35, 2.0, 16.1], look: [0.42, 1.82, 17.9], fov: 27 },
        seg(local, 0, 4.6),
        'easeInOutCubic'
      );
      const b = mixShot(
        { pos: [1.35, 2.0, 16.1], look: [0.42, 1.82, 17.9], fov: 27 },
        { pos: [-0.9, 1.86, 16.4], look: [0.42, 1.78, 17.95], fov: 25 },
        seg(local, 4.6, 8),
        'easeInOutCubic'
      );
      return local < 4.6 ? a : b;
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: 0.45, stars: 0.4, ambient: 0.85 });
      stage.stadium.setMoonlight(0.7);

      stage.cast.setVisible({ pitcher: true, batter: true, catcher: true });
      stage.cast.setBatterPosition(BATTER_POS.x, 0, BATTER_POS.z, Math.PI / 2);
      stage.cast.setBatVisible(true);
      stage.cast.setOfferedCapVisible(false);
      // 던진 뒤의 정적 — 팔로스루에서 천천히 몸을 세운다
      stage.cast.setPitchPhase(1 - smoothstep(seg(local, 0, 2.6)) * 1);
      stage.cast.setBatterStance();
      stage.cast.setCatcherCrouch();
      stage.cast.setMittTarget(_v.set(0.06, 1.0, -0.9));
      stage.ball.setVisible(false);
      stage.ball.setImpact(_v, 0);

      stage.hud.setChapterVisible(true);
      stage.hud.setVisible(local > 3.4);
      stage.hud.setPips(0);
      stage.hud.setSpeed(null);
      stage.hud.setStrikes(null);
      stage.rig.setShake(0.05 + Math.sin(ctx.t * 3.1) * 0.012);
      stage.fx.setFlash(0);
      stage.fx.setTitle(0);
      stage.audio.setTension(0.4);
    },
  },

  /* ---------------------------------------------------------------- */
  {
    no: 8,
    id: 'scout',
    title: '스카우트',
    t0: 54,
    t1: 62,
    captions: [
      { at: 0.6, until: 3.3, text: '“그 3구, 우리 팀에 빌려줘.”', cls: 'sub--quote' },
      { at: 3.6, until: 5.6, text: '여름 대회까지 3주. 던질 수 있는 공은, 3구.' },
    ],
    cues: [
      { at: 0.4, sfx: 'footsteps' },
      { at: 3.3, sfx: 'swell' },
      { at: 5.6, sfx: 'crowdRoar' },
    ],
    camera(ctx) {
      const { local } = ctx;
      const a = mixShot(
        { pos: [5.8, 2.05, 14.2], look: [1.0, 1.55, 17.2], fov: 42 },
        { pos: [4.5, 1.82, 15.4], look: [1.0, 1.45, 17.4], fov: 36 },
        seg(local, 0, 3.4),
        'easeInOutCubic'
      );
      const b = mixShot(
        { pos: [4.5, 1.82, 15.4], look: [1.0, 1.45, 17.4], fov: 36 },
        { pos: [10, 9.5, 2.0], look: [0.6, 3.0, 17], fov: 46 },
        seg(local, 3.4, 6.2),
        'easeInOutCubic'
      );
      // 마지막은 하늘과 조명탑이 함께 들어오는 와이드 — 타이틀 카드의 배경이 된다
      const c = mixShot(
        { pos: [10, 9.5, 2.0], look: [0.6, 3.0, 17], fov: 46 },
        { pos: [9.5, 14, -22], look: [0, 8.0, 26], fov: 52 },
        seg(local, 6.2, 8),
        'easeInOutCubic'
      );
      if (local < 3.4) return a;
      if (local < 6.2) return b;
      return c;
    },
    apply(ctx) {
      const { stage, local } = ctx;
      setStageLights(stage, 1, { key: 0.8, stars: 0.35, ambient: 1.25 });
      stage.stadium.setMoonlight(0.7);

      stage.cast.setVisible({ pitcher: true, batter: true, catcher: local < 2.5 });
      stage.cast.setPitcherIdle(ctx.t);
      stage.ball.setVisible(false);
      stage.ball.setImpact(_v, 0);

      // 코보리가 타석에서 마운드 앞까지 걸어와 모자를 내민다
      const walk = smoothstep(seg(local, 0.3, 3.0));
      stage.cast.setBatterPosition(
        lerp(BATTER_POS.x, 0.95, walk),
        lerp(0, MOUND_HEIGHT * 0.55, walk),
        lerp(BATTER_POS.z, MOUND.z - 2.15, walk),
        lerp(Math.PI / 2, Math.PI, walk)
      );
      stage.cast.setBatVisible(walk < 0.35);
      stage.cast.setOfferedCapVisible(walk > 0.55);
      stage.cast.setOffer(seg(local, 2.4, 3.9));
      stage.cast.setCatcherCrouch();
      stage.cast.setMittTarget(_v.set(0.06, 1.0, -0.9));

      stage.hud.setChapterVisible(local < 3.2);
      stage.hud.setVisible(false);
      stage.rig.setShake(0.05);
      stage.fx.setFlash(0);
      // 마지막 2.4초에 타이틀 카드
      stage.fx.setTitle(seg(local, 5.6, 6.6));
      stage.audio.setTension(0.55 + seg(local, 3.3, 6) * 0.4);
    },
  },
];

/* ------------------------------------------------------------------ */

export const TOTAL_DURATION = CHAPTERS[CHAPTERS.length - 1].t1;

/**
 * camera()가 apply()보다 먼저 불릴 수도 있으므로, 투구 챕터의 파생 시각은
 * ctx.runtime에 없으면 그 자리에서 다시 계산한다. (순수 함수라 비용이 없다)
 */
function runtime(ctx) {
  if (ctx.runtime) return ctx.runtime;
  const ch = ctx.chapter;
  const pitch = { 'pitch-1': FASTBALL, 'pitch-2': NIAGARA, 'pitch-3': MOON }[ch.id];
  const windupLen = ch.windup1 - ch.windup0;
  const releaseLocal = ch.windup0 + RELEASE_PHASE * windupLen;
  const flightEnd = releaseLocal + pitch.duration;
  const u =
    ctx.local <= releaseLocal
      ? 0
      : ctx.local >= flightEnd
        ? 1
        : pitch.warp((ctx.local - releaseLocal) / pitch.duration);
  return { releaseLocal, flightEnd, u, pitch };
}

/** 시각 t에 보여야 할 자막 줄 목록 */
export function captionsAt(chapter, local) {
  const out = [];
  for (const c of chapter.captions || []) {
    const a = capAlpha(local, c.at, c.until);
    if (a > 0.001) {
      out.push({ key: `${chapter.id}:${c.at}`, text: c.text, cls: c.cls || '', alpha: a });
    }
  }
  return out;
}

export function chapterAt(t) {
  const time = clamp(t, 0, TOTAL_DURATION - 0.0001);
  for (const ch of CHAPTERS) {
    if (time >= ch.t0 && time < ch.t1) return ch;
  }
  return CHAPTERS[CHAPTERS.length - 1];
}

export { capAlpha, seg, ignite, shakeEnv };
