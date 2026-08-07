import '../styles.css';
import { createWorld } from './scene/world.js';
import { createStadium } from './scene/stadium.js';
import { createCast } from './scene/players.js';
import { createBall } from './scene/ball.js';
import { createCameraRig } from './cameraRig.js';
import { createSubtitles } from './ui/subtitles.js';
import { createHud } from './ui/hud.js';
import { createFx } from './ui/fx.js';
import { createControls } from './ui/controls.js';
import { createAudio } from './audio/index.js';
import { createDirector } from './director.js';

const canvas = document.getElementById('stage');
const world = createWorld(canvas);

const stadium = createStadium(world.scene);
const cast = createCast(world.scene);
const ball = createBall(world.scene);
const rig = createCameraRig(world.camera);

const subtitles = createSubtitles(document.getElementById('subtitles'));
const hud = createHud();
const fx = createFx();
const audio = createAudio();

const stage = { stadium, cast, ball, rig, subtitles, hud, fx, audio, world };
const director = createDirector(stage);

createControls(director, { subtitles, audio });

/* ------------------------------------------------------------------ */
/*  루프                                                                */
/* ------------------------------------------------------------------ */

let last = performance.now();
let elapsed = 0;
let wasPlayingBeforeHide = false;

function frame(now) {
  // 탭 전환 등으로 큰 간격이 생기면 잘라 낸다 (한 프레임에 타임라인이 튀지 않도록).
  // 10fps까지는 실시간으로 재생되고, 그보다 느린 기기에서는 프레임을 건너뛰는 대신
  // 슬로모션으로 재생된다.
  const dt = Math.min((now - last) / 1000, 1 / 10);
  last = now;
  elapsed += dt;

  director.update(dt, elapsed);
  stadium.update(elapsed);
  cast.breathe(elapsed);
  ball.faceCamera(world.camera);
  ball.updateProjection(world.camera, world.renderer.domElement.clientHeight || window.innerHeight);

  world.render(elapsed);
}

world.renderer.setAnimationLoop(frame);

/* ------------------------------------------------------------------ */
/*  라이프사이클                                                         */
/* ------------------------------------------------------------------ */

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => world.resize());
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    wasPlayingBeforeHide = director.playing;
    if (director.playing) director.pause();
  } else {
    last = performance.now();
    if (wasPlayingBeforeHide && !director.finished) director.play();
  }
});

window.addEventListener('beforeunload', () => {
  world.renderer.setAnimationLoop(null);
  audio.dispose();
  ball.dispose();
  cast.dispose();
  stadium.dispose();
  world.dispose();
});

/* 첫 프레임을 즉시 구성해 두면 자동 재생 시작이 매끄럽다 */
director.seek(0, { keepPlaying: false });
director.play();

/* 검증 스크립트(tools/verify.mjs)가 쓰는 진입점 */
window.__director = director;
window.__stage = stage;
