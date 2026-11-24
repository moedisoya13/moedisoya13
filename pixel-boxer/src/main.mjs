/* The page: loads the baked splats, steps the bout sixty times a second (the bout solves the boxers' bodies itself: they are
   part of its physics), and draws it at whatever rate the screen runs, each boxer placed between his last two steps. A
   knockdown (docs/moves-plan-6.md §2.4D) is shown live at the true speed from the ordinary camera, all the way down; then,
   once everything the blow and the landing threw has gone out and he lies all but still, the picture cuts to a closer
   camera, from above or from the side the blow is seen best from, and replays it slowly and briefly, from the press of the
   punch that did it to him falling away, ending before he comes down (src/replay.mjs), the tag "리플레이" in the corner;
   the bout is not stepped meanwhile, any key, tap or button skips it, and it cuts back; the result comes after it. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow, quietOf, ringsOn, FX } from './render/blow.mjs';
import { createGuard, styleOf } from './render/guard.mjs';
import { captureBout, blend, createReplay, distOf, backOf, FALL } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import * as M from './rig/m3.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { dress } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { MOVES } from './anim/moves.mjs';
import { createBout, step, RULES } from './game/bout.mjs';
import { RING } from './world/ring.mjs';
import { createRival, think } from './game/ai.mjs';
import { createInput } from './game/input.mjs';
import { createAudio } from './game/audio.mjs';

const DT = 1 / 60;
const query = new URLSearchParams(location.search);
const SPEED = Number(query.get('speed')) || 1; // ?speed=0.25 for slow motion
/* what each corner wears (rig/boxer.mjs WEAR): ?wear=training (both men; training-up: the hood up), ?wear=training,none (each
   corner his own, the player's first); none, or no parameter, as they are. Only what is worn is fetched. */
const WEARS = (() => {
  const w = (query.get('wear') || '').split(',').map(x => (x.trim() === 'none' ? '' : x.trim()));
  return [w[0], w.length > 1 ? w[1] : w[0]];
})();
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
/* A knockdown's replay camera is not to look at them through the ropes (src/replay.mjs viewOf, distOf): it has room where,
   as far off as it is drawn, it is inside them, or high enough over them (EYE metres up) that they lie under the picture;
   and if none has, it comes in no further off what it frames than a little inside them (inside). */
const ROPES = RING.apron - 0.32,
  EYE = 2.4;
// (how far from `at` the way Z the ropes are, less a little)
function inside(at, Z) {
  let far = Infinity;
  for (const i of [0, 2]) if (Math.abs(Z[i]) > 1e-6) far = Math.min(far, ((Math.sign(Z[i]) * ROPES - at[i]) / Z[i]));
  return far - 0.2;
}
const roomFor = (at, Z, d) => {
  const eye = [0, 1, 2].map(i => at[i] + Z[i] * d);
  return (Math.abs(eye[0]) < ROPES && Math.abs(eye[2]) < ROPES) || eye[1] >= EYE;
};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const splats = async part => unpack(fromBase64(await (await fetch('assets/' + part.file)).text()), part);
  // (the boxer as he is, or in an outfit: '' is as he is)
  const worn = [...new Set(WEARS)],
    partOf = w => (!w ? manifest.boxer : manifest.wear && Object.hasOwn(manifest.wear, w) ? manifest.wear[w] : null);
  for (const w of worn) if (!partOf(w)) throw new Error(`no outfit called ${w}`);
  const [ring, ...boxers] = await Promise.all([splats(manifest.ring), ...worn.map(w => splats(partOf(w)))]);
  return { manifest, ring, boxers: Object.fromEntries(worn.map((w, i) => [w, { rows: boxers[i], count: partOf(w).count }])) };
}

function start({ manifest, ring, boxers }) {
  const R = createRenderer(canvas),
    audio = createAudio(),
    input = createInput($('controls')),
    bind = fk(guardPose());
  /* three sets of loose splats: sparks and shadows in the ring's colours, and each boxer's glove streaks in his own; and what
     a blow throws off each of them, apart from the rest, to be kept off his own silhouette (render/blow.mjs) */
  const fx = [createFx(), createFx(), createFx()],
    motes = [createFx(), createFx()];
  /* what a defence draws (a block, a parry, a miss, a brilliant defence), in the style ?defence= asks for (render/guard.mjs
     styleOf: ?defence=lines-sparks,wind-line,line), today's if it asks for none. (Not the brilliant defence's slow motion:
     the picture here plays at the true speed, as tests/fx.test.mjs holds it; the pending catalogue's cards show it.) */
  let guard = createGuard(styleOf(query.get('defence')));
  const meshes = { ring: R.mesh(ring, manifest.ring.count), fx: fx.map(f => R.mesh(f.rows, 0, true)), motes: motes.map(f => R.mesh(f.rows, 0, true)) };
  for (const w in boxers) meshes[w ? 'boxer-' + w : 'boxer'] = R.mesh(boxers[w].rows, boxers[w].count);
  const palettes = [0, 1].map(i => paletteArray(dress(manifest.palette, i)));
  // (each man as he is dressed: his mesh, and his colours with the suit's in place of the trunks'; a glove's streak is in his own colours either way)
  const men = WEARS.map(w => meshes[w ? 'boxer-' + w : 'boxer']),
    worn = WEARS.map((w, i) => (w ? paletteArray(dress(manifest.palette, i, w)) : palettes[i]));
  const hall = new Float32Array(HALL.flatMap(rgb)),
    ink = new Float32Array(rgb(manifest.palette[0]));
  const bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    mats = new Float32Array(NAMES.length * 12);
  // both boxers as they were at the last step and the one before (src/replay.mjs captureBout): what is drawn lies between them
  let posed = null;

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
    dim = 0,
    ripples = [null, null], // the ripple going through each man, if one is (render/blow.mjs)
    falls = [null, null], // a man knocked down, until he comes down on the canvas (render/blow.mjs: fallOf)
    ground = null, // the ring through the canvas from where he came down
    again = null, // what a knockdown's replay throws again, in its own time, apart from what the live bout threw
    replayEnd = -Infinity; // the bout's time when the last replay was over (or skipped)
  const cam = { target: [0, 0.8, 0], yaw: 0, pitch: 0.5, dist: 8 },
    shake = { amp: 0 },
    stats = { frames: 0, ms: 0, drawn: 0 },
    // (a knockdown's replay, and no other: every step kept, src/replay.mjs; the side the men are seen from, the live camera's)
    replay = createReplay({ brilliant: false, yaw: () => cam.yaw, room: (at, Z, size) => roomFor(at, Z, distOf({ size, closer: FALL.view.closer, push: 0 }, cam.dist, R.target.w / R.target.h, 0)) });

  function reset() {
    bout = createBout(Number(query.get('seed')) || (Date.now() & 0xffff) || 1, { vary: true });
    rival = createRival(STAGES[stage].level);
    pose(true);
    dim = 0;
    ripples = [null, null];
    falls = [null, null];
    ground = again = null;
    guard = createGuard(guard.style);
    replayEnd = -Infinity;
    replay.reset();
    show('replay', false);
    $('stage').textContent = STAGES[stage].name;
    hud();
  }
  const show = (id, on) => $(id).classList.toggle('on', on);
  function hud() {
    bout.fighters.forEach((f, i) => ($('hp' + i).style.transform = `scaleX(${f.hp / RULES.hp})`));
    $('counter').classList.toggle('on', phase === 'fight' && bout.fighters[0].counter > 0);
  }
  function begin() {
    audio.unlock();
    if (phase === 'title' || (phase === 'over' && $('result').classList.contains('on'))) {
      if (phase === 'over') {
        if (bout.over === 0) stage = Math.min(STAGES.length - 1, stage + 1);
        reset();
      }
      phase = 'fight';
      show('title', false);
      show('result', false);
    }
  }
  // (a knockdown's replay is skipped by any key, tap or button: and that is all the press does)
  const skip = () => replay.playing && (replay.skip(), (replayEnd = bout.t), show('replay', false), true);
  addEventListener('pointerdown', e => {
    if (skip()) return;
    if (phase === 'title') spar = spar || !!(e.target.closest && e.target.closest('[data-spar]'));
    begin();
  });
  addEventListener('keydown', e => skip() || ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') && begin()));

  // after a step: both boxers as they are now for the picture, and the streak of a glove that is travelling
  function pose(fresh) {
    const now = captureBout(bout);
    posed = { was: fresh ? now : posed.now, now };
    bout.fighters.forEach((f, i) => {
      const hand = f.action && MOVES[f.action.name].punch ? MOVES[f.action.name].hand : null;
      if (!fresh && hand && f.before) {
        const a = f.before[hand],
          b = f.points[hand],
          far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (far * 60 > 5.5 && far < 0.6) fx[1 + i].trail(a, b, 0.105, TRAIL, 0.1);
      }
    });
  }
  // (a defence drawn: its ripple, if it has one, put through the man defending as a hit's is) -> what it asks for
  const defend = e => {
    const d = guard.meet(e, bout.fighters, fx[0], motes);
    if (d.ripple) ripples[d.ripple.on] = d.ripple.ripple;
    return d;
  };
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
      // (sparks off the far side of what it struck, never seen over him, and a ripple through him from where it landed)
      blow(motes[e.on], e, f[e.on]);
      ripples[e.on] = rippleOf(e, f[e.on]);
      // (a knockdown: watched until he comes down on the canvas)
      if (fallOf(e)) falls[e.on] = fallOf(e);
      shake.amp = e.down ? 7 : 1.5 + 3.5 * k;
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
      defend(e);
      shake.amp = 1.2;
    } else if (e.type === 'parry') {
      audio.play('deflect');
      white = defend(e).white;
      shake.amp = 2.5;
      if (e.who === 0) setTimeout(() => audio.play('chance'), 100);
    } else if (e.type === 'whiff' || e.type === 'graze' || e.type === 'brilliant') defend(e);
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
    // (a knockdown's replay, while it plays: the bout stands still; the press of a button only skips it)
    if (replay.playing) input.read();
    else if (phase !== 'title') {
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
        guard.see(bout.fighters);
        if (spar) bout.fighters[1].hp = Math.max(bout.fighters[1].hp, 25); // a sparring partner does not go down
        for (const e of bout.events) react(e);
        // (where a knocked-down man first comes down on the canvas: a second ripple through him, and a ring through the canvas)
        falls.forEach((fall, i) => {
          const at = landed(fall, bout.fighters[i]);
          if (at) (ripples[i] = landRipple(fall, bout.fighters[i], at)), (ground = groundOf(fall, at));
          ringsOn(ground, fall, bout.fighters[i]); // (the ring of shaken pixels: his trunk's and his head's, each as it comes down)
        });
        if (bout.stop <= 0 || bout.events.length) pose();
        // (the step kept for a replay; a knockdown's starts once all of what it threw has gone out, and the bout stops here)
        if (replay.watch(bout, DT, quietOf(motes, ripples, ground))) {
          acc = 0;
          show('replay', true);
          break;
        }
      }
      hud();
    } else input.read();
    // (the result once the fall has been shown, and its replay, and a moment after it)
    if (phase === 'over' && bout.t - bout.overAt > 1.6 && !replay.pending && !replay.playing && bout.t - replayEnd >= 0.6 && !$('result').classList.contains('on')) {
      const won = bout.over === 0;
      audio.play(won ? 'win' : 'lose');
      $('verdict').textContent = won ? 'K.O. 승' : 'K.O. 패';
      $('next').textContent = won ? (stage < STAGES.length - 1 ? '다음 상대' : '다시 한 판') : '재도전';
      show('result', true);
    }

    // ---- a knockdown's replay: what it shows now, and what it throws again as it comes to the steps that threw it
    const played = replay.playing ? replay.next(elapsed) : null;
    if (played) {
      if (replay.started || !again) {
        const set = () => createFx();
        again = { motes: [set(), set()], trails: [set(), set()], ripples: [null, null], was: null };
      }
      for (const k of replay.crossed) {
        for (const e of k.events) if (e.type === 'hit') (blow(again.motes[e.on], e, k.men[e.on]), (again.ripples[e.on] = rippleOf(e, k.men[e.on])));
        // (the streak of the glove that put him down, as the live picture left it)
        const v = replay.view;
        if (again.was && k.t <= v.blow + 1e-9) {
          const a = again.was.men[v.hit.who].points[v.hit.hand],
            b = k.men[v.hit.who].points[v.hit.hand],
            far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          if (far * 60 > 5.5 && far < 0.6) again.trails[v.hit.who].trail(a, b, 0.105, TRAIL, 0.1);
        }
        again.was = k;
      }
      if (!replay.playing) (replayEnd = bout.t), show('replay', false);
    }
    // ---- each boxer, between his last two steps (and held where he is through the moment of a blow)
    const held = !played && bout.stop > 0,
      between = held ? 1 : Math.min(1, acc / DT),
      shown = played ? played.men : blend(posed.was, posed.now, between).men,
      // (what is in the air goes on slowly through the moment of a blow; in a replay, what it threw again in its time)
      fade = played ? 0 : held ? elapsed * 0.2 : elapsed,
      moved = played ? replay.moved : fade,
      waves = played ? again.ripples : ripples,
      mote = played ? again.motes : motes;
    stopped = held ? Math.max(stopped, bout.stop) : 0;
    if (ground) ground.age += fade;
    const ring = played ? null : groundRow(ground),
      shadows = [],
      layers = [{ mesh: meshes.ring, palette: palettes[0], mask: 0.5, ground: ring }];
    bout.fighters.forEach((f, i) => {
      const m = shown[i];
      boneMatrices(m.pose, bind, m.place, mats, 0);
      if (held && f.sinceHit < 0.2) {
        // a boxer who has just been hit shudders through it
        const shudder = 0.022 * (bout.stop / stopped) * Math.sin(time * 2 * Math.PI * 27);
        for (let k = 0; k < NAMES.length; k++) (mats[k * 12 + 9] += shudder * Math.cos(f.yaw)), (mats[k * 12 + 11] -= shudder * Math.sin(f.yaw));
      }
      R.packBones(mats, bones[i]);
      layers.push({ mesh: men[i], bones: bones[i], palette: worn[i], mask: 1, wave: rippleRow(waves[i], m), silhouette: i + 1 });
      shadows.push({ x: m.x + m.pose.at.Hips[2] * Math.sin(m.yaw), z: m.z + m.pose.at.Hips[2] * Math.cos(m.yaw), yaw: m.yaw, long: f.down ? 0.5 : 0.3, wide: f.down ? 0.32 : 0.24 });
    });
    meshes.fx[0].update(fx[0].rows, fx[0].update(fade, shadows, 22));
    for (const i of [1, 2]) (played ? meshes.fx[i].update(again.trails[i - 1].rows, again.trails[i - 1].update(moved)) : meshes.fx[i].update(fx[i].rows, fx[i].update(fade)));
    mote.forEach((m, i) => meshes.motes[i].update(m.rows, m.update(moved)));
    // (a ripple goes on in the same time as the sparks)
    for (const r of waves) if (r) r.age += moved;
    // (the shadows and the dust on the canvas ride the ring through it, never lit by it)
    layers.splice(1, 0, { mesh: meshes.fx[0], palette: palettes[0], mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] });
    layers.push({ mesh: meshes.fx[1], palette: palettes[0], mask: 0.6 }, { mesh: meshes.fx[2], palette: palettes[1], mask: 0.6 });
    // (what a blow threw off each man is never seen over him, in front of him or behind: it shows first at his outline)
    layers.push(...meshes.motes.map((mesh, i) => ({ mesh, palette: palettes[0], mask: 0.6, outside: i + 1 })));

    // ---- camera: above and to one side of the line between them, swinging round slowly as they circle (and, in a knockdown's
    // replay, cut to the replay's own, closer, pushed in a little as it goes: the live one waits as it was)
    const view = played && replay.view,
      [a, b] = shown,
      ease = k => 1 - Math.exp(-elapsed * k),
      axis = Math.atan2(b.x - a.x, b.z - a.z),
      sideA = axis - Math.PI / 2,
      sideB = axis + Math.PI / 2,
      want = Math.abs(wrap(sideA - cam.yaw)) <= Math.abs(wrap(sideB - cam.yaw)) ? sideA : sideB,
      apart = Math.hypot(b.x - a.x, b.z - a.z),
      over = phase === 'over' ? Math.min(1, (bout.t - bout.overAt) / 2) : 0,
      dist = Math.max(5.6, Math.min(11, R.distFor(apart + 3.6))) * (1 - 0.18 * over);
    // (it turns at most a third of a turn in four seconds, however fast they circle: the stick's directions go with it)
    if (!view) {
      cam.yaw = wrap(cam.yaw + Math.max(-0.55 * elapsed, Math.min(0.55 * elapsed, wrap(want - cam.yaw) * ease(2.2))));
      cam.dist += (dist - cam.dist) * ease(3);
      for (const [k, v] of [[0, (a.x + b.x) / 2], [2, (a.z + b.z) / 2]]) cam.target[k] += (v * 0.85 - cam.target[k]) * ease(4);
      shake.amp *= Math.exp(-elapsed * 14);
      white *= Math.exp(-elapsed * 16);
    }
    // (the picture darkens for the result only once the fall and its replay have been shown)
    if (phase === 'over') dim = replay.pending || view ? 0 : Math.min(0.4, Math.max(0, Math.min(bout.t - bout.overAt - 1.2, bout.t - replayEnd - 0.2)) * 0.4);
    const drawn = R.draw({
      camera: view ? { target: view.target, yaw: view.yaw, pitch: view.pitch, dist: distOf(view, cam.dist, R.target.w / R.target.h, replay.progress, inside(view.target, backOf(view.yaw, view.pitch))) } : cam,
      shake: !view && shake.amp > 0.4 ? [(Math.random() * 2 - 1) * shake.amp, (Math.random() * 2 - 1) * shake.amp * 0.6] : null,
      white: !view && white > 0.02 ? white : 0,
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
  globalThis.__bout = { shown: [], get bout() { return bout; }, get phase() { return phase; }, get replay() { return replay; }, get ground() { return ground; }, stats, renderer: R, cam, RULES };
  $('loading').remove();
  requestAnimationFrame(frame);
}

// (?ring=shake: the ring through the canvas as shaken pixels, the prototype beside the confirmed ring: render/blow.mjs)
if (query.get('ring') === 'shake') FX.ground.kind = 'shake';
load().then(start).catch(error => {
  console.error(error);
  $('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
