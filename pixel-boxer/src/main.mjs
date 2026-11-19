/* The page: loads the baked splats, steps the bout sixty times a second (the bout solves the boxers' bodies itself: they are
   part of its physics), and draws it at whatever rate the screen runs, each boxer placed between his last two steps. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import * as M from './rig/m3.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { MOVES } from './anim/moves.mjs';
import { createBout, step, RULES } from './game/bout.mjs';
import { createRival, think } from './game/ai.mjs';
import { createInput } from './game/input.mjs';
import { createAudio } from './game/audio.mjs';

const DT = 1 / 60;
const query = new URLSearchParams(location.search);
const SPEED = Number(query.get('speed')) || 1; // ?speed=0.25 for slow motion
const $ = id => document.getElementById(id);
const canvas = $('view');
const HALL = [0x171a2c, 0x11131f, 0x0c0d16, 0x090a11];
const STAGES = [
  { level: 'novice', name: '1회전 · 신예' },
  { level: 'contender', name: '2회전 · 도전자' },
  { level: 'champion', name: '3회전 · 챔피언' }
];
// a glove's streak cools from white through its own colours; drawn with each corner's palette, so it matches his gloves
const TRAIL = [38, 18, 18, 17, 16];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const splats = async part => unpack(fromBase64(await (await fetch('assets/' + part.file)).text()), part);
  const [boxer, ring] = await Promise.all([splats(manifest.boxer), splats(manifest.ring)]);
  return { manifest, boxer, ring };
}

function start({ manifest, boxer, ring }) {
  const R = createRenderer(canvas),
    audio = createAudio(),
    input = createInput($('controls')),
    bind = fk(guardPose());
  // three sets of loose splats: sparks and shadows in the ring's colours, and each boxer's glove streaks in his own
  const fx = [createFx(), createFx(), createFx()];
  const meshes = { ring: R.mesh(ring, manifest.ring.count), boxer: R.mesh(boxer, manifest.boxer.count), fx: fx.map(f => R.mesh(f.rows, 0, true)) };
  const palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))];
  const hall = new Float32Array(HALL.flatMap(rgb)),
    ink = new Float32Array(rgb(manifest.palette[0]));
  const bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    mats = new Float32Array(NAMES.length * 12),
    // each boxer's bone matrices at the last step and the one before: what is drawn lies between them
    posed = [0, 1].map(() => ({ now: new Float32Array(NAMES.length * 12), was: new Float32Array(NAMES.length * 12) }));

  let stage = 0,
    bout,
    rival,
    phase = 'title',
    acc = 0,
    last = 0,
    time = 0,
    stopped = 0,
    spar = query.has('spar'), // the other corner only stands there: for looking at the motion
    white = 0,
    dim = 0;
  const cam = { target: [0, 0.8, 0], yaw: 0, pitch: 0.5, dist: 8 },
    shake = { amp: 0 },
    stats = { frames: 0, ms: 0, drawn: 0 };

  function reset() {
    bout = createBout(Number(query.get('seed')) || (Date.now() & 0xffff) || 1);
    rival = createRival(STAGES[stage].level);
    pose(true);
    dim = 0;
    $('stage').textContent = STAGES[stage].name;
    hud();
  }
  function hud() {
    bout.fighters.forEach((f, i) => ($('hp' + i).style.transform = `scaleX(${f.hp / RULES.hp})`));
    $('counter').classList.toggle('on', phase === 'fight' && bout.fighters[0].counter > 0);
  }
  const show = (id, on) => $(id).classList.toggle('on', on);
  function begin() {
    audio.unlock();
    if (phase === 'title' || (phase === 'over' && bout.t - bout.overAt > 1.6)) {
      if (phase === 'over') {
        if (bout.over === 0) stage = Math.min(STAGES.length - 1, stage + 1);
        reset();
      }
      phase = 'fight';
      show('title', false);
      show('result', false);
    }
  }
  addEventListener('pointerdown', e => {
    if (phase === 'title') spar = spar || !!(e.target.closest && e.target.closest('[data-spar]'));
    begin();
  });
  addEventListener('keydown', e => (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') && begin());

  // after a step: each boxer's bones for the picture, and the streak of a glove that is travelling
  function pose(fresh) {
    bout.fighters.forEach((f, i) => {
      posed[i].was.set(fresh ? boneMatrices(f.pose, bind, f.place, mats, 0) : posed[i].now);
      posed[i].now.set(boneMatrices(f.pose, bind, f.place, mats, 0));
      const hand = f.action && MOVES[f.action.name].punch ? MOVES[f.action.name].hand : null;
      if (!fresh && hand && f.before) {
        const a = f.before[hand],
          b = f.points[hand],
          far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (far * 60 > 5.5 && far < 0.6) fx[1 + i].trail(a, b, 0.105, TRAIL, 0.1);
      }
    });
  }
  function react(e) {
    const f = bout.fighters;
    if (e.type === 'punch') audio.play('swing');
    else if (e.type === 'dash') {
      audio.play('dodge');
      fx[0].dust([f[e.who].x, 0, f[e.who].z], 6, [25, 24, 23]);
    } else if (e.type === 'hit') {
      // everything about a blow is sized by its impulse: a clean cross is about 85 newton-seconds
      const k = Math.min(1.6, (e.J * (e.counter ? RULES.counterGain : 1)) / 85),
        heavy = k > 0.75 || e.down;
      audio.play(heavy ? 'heavy' : 'hit');
      fx[0].sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
      fx[0].sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir); // sweat
      shake.amp = e.down ? 7 : 1.5 + 3.5 * k;
      if (e.counter || e.down) white = 0.5;
      try {
        if (navigator.vibrate && e.on === 0) navigator.vibrate(Math.round(15 + 40 * k));
      } catch {
        // an embedded page may be refused the motor
      }
      $('blow').textContent = `${Math.round(e.J)} N·s`;
      $('blow').classList.remove('on');
      void $('blow').offsetWidth;
      $('blow').classList.add('on');
      if (e.down) phase = 'over';
    } else if (e.type === 'block') {
      audio.play('whiff');
      fx[0].sparks(e.at, 4, [38, 25, 24], 2.5, e.dir);
      shake.amp = 1.2;
    } else if (e.type === 'parry') {
      audio.play('deflect');
      fx[0].sparks(e.at, 14, [38, 38, 39, 40], 5);
      shake.amp = 2.5;
      white = 0.25;
      if (e.who === 0) setTimeout(() => audio.play('chance'), 100);
    }
  }

  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    R.resize(Number(query.get('rows')) || 216);
  }

  function frame(now) {
    const t0 = performance.now(),
      elapsed = Math.min(0.1, (now - last) / 1000 || 0) * SPEED;
    last = now;
    time += elapsed;
    fit();
    if (phase !== 'title') {
      acc += elapsed;
      let first = true;
      while (acc >= DT) {
        acc -= DT;
        let mine = { move: [0, 0] };
        if (first && phase === 'fight') {
          // the stick is the screen's: up the picture is away from the camera
          const raw = input.read(),
            c = Math.cos(cam.yaw),
            s = Math.sin(cam.yaw),
            turn = v => [v[0] * c - v[1] * s, -v[0] * s - v[1] * c];
          mine = { move: turn(raw.move), jab: raw.jab, power: raw.power, cover: raw.cover, dash: raw.dash === true ? true : raw.dash ? turn(raw.dash) : null };
        }
        first = false;
        step(bout, [mine, spar ? {} : think(rival, bout, DT)], DT);
        if (spar) bout.fighters[1].hp = Math.max(bout.fighters[1].hp, 25); // a sparring partner does not go down
        for (const e of bout.events) react(e);
        if (bout.stop <= 0 || bout.events.length) pose();
      }
      hud();
    } else input.read();
    if (phase === 'over' && bout.t - bout.overAt > 1.6 && !$('result').classList.contains('on')) {
      const won = bout.over === 0;
      audio.play(won ? 'win' : 'lose');
      $('verdict').textContent = won ? 'K.O. 승' : 'K.O. 패';
      $('next').textContent = won ? (stage < STAGES.length - 1 ? '다음 상대' : '다시 한 판') : '재도전';
      show('result', true);
    }

    // ---- each boxer, between his last two steps (and held where he is through the moment of a blow)
    const held = bout.stop > 0,
      between = held ? 1 : Math.min(1, acc / DT);
    stopped = held ? Math.max(stopped, bout.stop) : 0;
    const shadows = [],
      layers = [{ mesh: meshes.ring, palette: palettes[0], mask: 0.5 }];
    bout.fighters.forEach((f, i) => {
      const { was, now } = posed[i];
      for (let k = 0; k < mats.length; k++) mats[k] = was[k] + (now[k] - was[k]) * between;
      if (held && f.sinceHit < 0.2) {
        // a boxer who has just been hit shudders through it
        const shudder = 0.022 * (bout.stop / stopped) * Math.sin(time * 2 * Math.PI * 27);
        for (let k = 0; k < NAMES.length; k++) (mats[k * 12 + 9] += shudder * Math.cos(f.yaw)), (mats[k * 12 + 11] -= shudder * Math.sin(f.yaw));
      }
      R.packBones(mats, bones[i]);
      layers.push({ mesh: meshes.boxer, bones: bones[i], palette: palettes[i], mask: 1, flash: f.flash > 0 ? 1 : 0 });
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: f.down ? 0.5 : 0.3, wide: f.down ? 0.32 : 0.24 });
    });
    meshes.fx[0].update(fx[0].rows, fx[0].update(held ? elapsed * 0.2 : elapsed, shadows, 22));
    for (const i of [1, 2]) meshes.fx[i].update(fx[i].rows, fx[i].update(held ? elapsed * 0.2 : elapsed));
    layers.splice(1, 0, { mesh: meshes.fx[0], palette: palettes[0], mask: 0.6 });
    layers.push({ mesh: meshes.fx[1], palette: palettes[0], mask: 0.6 }, { mesh: meshes.fx[2], palette: palettes[1], mask: 0.6 });

    // ---- camera: above and to one side of the line between them, swinging round slowly as they circle
    const [a, b] = bout.fighters,
      ease = k => 1 - Math.exp(-elapsed * k),
      axis = Math.atan2(b.x - a.x, b.z - a.z),
      sideA = axis - Math.PI / 2,
      sideB = axis + Math.PI / 2,
      want = Math.abs(wrap(sideA - cam.yaw)) <= Math.abs(wrap(sideB - cam.yaw)) ? sideA : sideB,
      apart = Math.hypot(b.x - a.x, b.z - a.z),
      over = phase === 'over' ? Math.min(1, (bout.t - bout.overAt) / 2) : 0,
      dist = Math.max(5.6, Math.min(11, R.distFor(apart + 3.6))) * (1 - 0.18 * over);
    // (it turns at most a third of a turn in four seconds, however fast they circle: the stick's directions go with it)
    cam.yaw = wrap(cam.yaw + Math.max(-0.55 * elapsed, Math.min(0.55 * elapsed, wrap(want - cam.yaw) * ease(2.2))));
    cam.dist += (dist - cam.dist) * ease(3);
    for (const [k, v] of [[0, (a.x + b.x) / 2], [2, (a.z + b.z) / 2]]) cam.target[k] += (v * 0.85 - cam.target[k]) * ease(4);
    shake.amp *= Math.exp(-elapsed * 14);
    white *= Math.exp(-elapsed * 16);
    if (phase === 'over') dim = Math.min(0.4, Math.max(0, bout.t - bout.overAt - 1.2) * 0.4);
    const drawn = R.draw({
      camera: cam,
      shake: shake.amp > 0.4 ? [(Math.random() * 2 - 1) * shake.amp, (Math.random() * 2 - 1) * shake.amp * 0.6] : null,
      white: white > 0.02 ? white : 0,
      dim,
      hall,
      ink,
      layers
    });
    stats.frames++;
    stats.drawn = drawn;
    stats.ms += (performance.now() - t0 - stats.ms) * 0.05;
    if (stats.frames % 30 === 0 && (query.has('fps') || location.hash === '#fps')) $('fps').textContent = `${stats.ms.toFixed(1)} ms · ${drawn} splats · ${R.target.w}×${R.target.h}`;
    requestAnimationFrame(frame);
  }

  reset();
  if (query.has('auto')) begin();
  globalThis.__bout = { shown: [], get bout() { return bout; }, get phase() { return phase; }, stats, renderer: R, cam, RULES };
  $('loading').remove();
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  $('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
