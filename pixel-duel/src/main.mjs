/* The page: loads the baked splats, runs the duel at sixty steps a second, and turns what happened into picture, sound and
   the shaking of the camera. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx, bladeOf } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { BIND } from './rig/poses.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { CLIPS } from './anim/clips.mjs';
import { createDuel, step, poseOf, drawingOf, RULES } from './game/duel.mjs';
import { createAlive } from './anim/alive.mjs';
import { createDangle } from './anim/dangle.mjs';
import { createRival, think } from './game/ai.mjs';
import { createInput } from './game/input.mjs';
import { createAudio } from './game/audio.mjs';

const DT = 1 / 60;
const query = new URLSearchParams(location.search);
const SPEED = Number(query.get('speed')) || 1; // ?speed=0.25 plays in slow motion, for looking at single drawings
const $ = id => document.getElementById(id);
const canvas = $('view');

// the rival wears the same clothes in other colours: palette entries swapped, nothing re-sculpted
const RIVAL_COLOURS = {
  5: 0x1c0f14, 6: 0x3a1620, 7: 0x6e1f2b, 8: 0xa5303a, 9: 0xd9605a, // coat: oxblood
  10: 0x15161d, 11: 0x23263a, 12: 0x363c58, 13: 0x545c80, // trousers: slate
  14: 0x15131a, 15: 0x2a2630, 16: 0x45404e, 17: 0x6a6474, // hat: lacquer black
  18: 0x0e2a33, 19: 0x14505c, 20: 0x1f8a8a, 21: 0x5fd0c0 // scarf: teal
};
// a blade's sweep cools as it ages: white, lamplight, orange, ember
const SMEAR = [25, 41, 41, 40, 33, 31];
const SKY = [0x2a2d55, 0x1d2148, 0x151a3a, 0x10142d, 0x0c0f22, 0x090b18];
const STAGES = [
  { level: 'calm', name: '첫째 밤' },
  { level: 'keen', name: '둘째 밤' },
  { level: 'fierce', name: '셋째 밤' }
];
// which way each fighter's own space lies in the world: +Z (ahead) along the way he faces, +X (his chest side) to the camera
const PLACE = { 1: [0, 0, 1, 0, 1, 0, 1, 0, 0], '-1': [0, 0, -1, 0, 1, 0, 1, 0, 0] };

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const splats = async part => unpack(fromBase64(await (await fetch('assets/' + part.file)).text()), part);
  const [fighter, arena] = await Promise.all([splats(manifest.fighter), splats(manifest.arena)]);
  return { manifest, fighter, arena };
}

function start({ manifest, fighter, arena }) {
  const R = createRenderer(canvas),
    audio = createAudio(),
    input = createInput($('controls')),
    fx = createFx(),
    bind = fk(BIND);
  const meshes = { arena: R.mesh(arena, manifest.arena.count), fighter: R.mesh(fighter, manifest.fighter.count), fx: R.mesh(fx.rows, 0, true) };
  const palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL_COLOURS[i] ?? hex))];
  const sky = new Float32Array(SKY.flatMap(rgb)),
    ink = new Float32Array(rgb(manifest.palette[0]));
  const bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    mats = new Float32Array(NAMES.length * 12),
    blades = [null, null],
    // what moves between and after the drawings: the settle and breath of each fighter, and his hair and scarf
    alive = [createAlive(0), createAlive(1)],
    dangles = [createDangle(bind), createDangle(bind)];
  let stopped = 0; // how long the current hit stop was when it began

  let stage = 0,
    wins = 0,
    duel,
    rival,
    phase = 'title',
    overAt = 0,
    acc = 0,
    last = 0,
    time = 0;
  const cam = { x: 0, y: 1.12, dist: 5.7, pitch: 0.07 },
    shake = { amp: 0, x: 0, y: 0 },
    stats = { frames: 0, ms: 0, drawn: 0, steps: 0 };
  let white = 0,
    dim = 0;

  function reset() {
    duel = createDuel(Number(query.get('seed')) || (Date.now() & 0xffff) || 1);
    rival = createRival(STAGES[stage].level);
    blades[0] = blades[1] = null;
    alive.forEach(a => a.reset());
    overAt = 0;
    dim = 0;
    $('stage').textContent = STAGES[stage].name;
    hud();
  }
  function hud() {
    for (const [i, id] of [[0, 'hp0'], [1, 'hp1']]) {
      const el = $(id);
      if (el.children.length !== RULES.hp) el.replaceChildren(...Array.from({ length: RULES.hp }, () => document.createElement('i')));
      [...el.children].forEach((pip, k) => pip.classList.toggle('lost', k >= duel.fighters[i].hp));
    }
    $('chance').classList.toggle('on', phase === 'fight' && duel.fighters[0].chance > 0);
  }
  function show(id, on) {
    $(id).classList.toggle('on', on);
  }
  function begin() {
    audio.unlock();
    if (phase === 'title' || (phase === 'over' && time - overAt > 0.9)) {
      if (phase === 'over') {
        if (duel.over === 0) stage = Math.min(STAGES.length - 1, stage + 1);
        reset();
      }
      phase = 'fight';
      show('title', false);
      show('result', false);
    }
  }
  addEventListener('pointerdown', begin);
  addEventListener('keydown', e => (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') && begin());

  function react(e) {
    const f = duel.fighters;
    if (e.type === 'swing') audio.play('swing');
    else if (e.type === 'dodge') {
      audio.play('dodge');
      fx.dust([f[e.who].x, 0, 0.1], 7, [39, 38, 29], f[e.who].face);
    } else if (e.type === 'hit') {
      const heavy = e.clip === 'thrust' || e.down;
      audio.play(heavy ? 'heavy' : 'hit');
      fx.sparks([e.at, 1.15, 0.25], heavy ? 22 : 12, [25, 41, 40, 33], heavy ? 6 : 4);
      fx.dust([f[e.on].x, 0, 0.1], 5, [39, 38, 29], -f[e.on].face);
      shake.amp = heavy ? 6 : 3.5;
      if (heavy) white = 0.55;
      try {
        if (navigator.vibrate && e.on === 0) navigator.vibrate(heavy ? 60 : 30);
      } catch {
        // an embedded page may be refused the motor: the hit reads without it
      }
      if (e.down) {
        overAt = time;
        phase = 'over';
        wins += e.who === 0 ? 1 : 0;
      }
    } else if (e.type === 'deflect') {
      audio.play('deflect');
      fx.sparks([e.at, 1.35, 0.25], 16, [25, 25, 41, 40], 5);
      shake.amp = 2.5;
      white = 0.25;
      if (e.by === 0) setTimeout(() => audio.play('chance'), 120);
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
        const away = duel.fighters[0].x <= duel.fighters[1].x ? -1 : 1,
          mine = first && phase === 'fight' ? input.read(away) : { move: 0 };
        first = false;
        step(duel, [mine, think(rival, duel, DT)], DT);
        stats.steps++;
        for (const e of duel.events) react(e);
      }
      hud();
    } else input.read(-1);
    if (phase === 'over' && time - overAt > 0.9 && !$('result').classList.contains('on')) {
      const won = duel.over === 0;
      audio.play(won ? 'win' : 'lose');
      $('verdict').textContent = won ? '승리' : '패배';
      $('next').textContent = won ? (stage < STAGES.length - 1 ? '다음 상대와 겨루기' : '다시 겨루기') : '다시 도전';
      show('result', true);
    }

    // ---- poses to bones, and the blade's sweep when it jumped a drawing
    const layers = [{ mesh: meshes.arena, palette: palettes[0], mask: 0.5 }];
    // a hit stop holds the drawings, but not dead: time creeps, and the struck fighter shudders under the blow
    const held = duel.stop > 0,
      live = held ? elapsed * 0.15 : elapsed;
    stopped = held ? Math.max(stopped, duel.stop) : 0;
    duel.fighters.forEach((f, i) => {
      const d = drawingOf(f);
      d.still = f.clip === 'down' && f.ct > 0.6;
      const pose = alive[i].update(poseOf(f), d.token, live, d),
        struck = held && f.ct === 0 && (f.clip === 'hurt' || f.clip === 'down' || f.clip === 'stagger'),
        shudder = struck ? 0.028 * (duel.stop / stopped) * Math.sin(time * 2 * Math.PI * 26) : 0,
        place = { R: PLACE[f.face], p: [f.x + shudder, 0, 0] };
      boneMatrices(pose, bind, place, mats, 0);
      dangles[i].apply(mats, live);
      R.packBones(mats, bones[i]);
      const blade = bladeOf(pose, place),
        clip = CLIPS[f.clip],
        was = blades[i];
      if (was && clip.swing && f.ct >= clip.marks.hit - 1e-6 && Math.hypot(blade.tip[0] - was.tip[0], blade.tip[1] - was.tip[1]) > 0.4)
        fx.smear(was, blade, SMEAR);
      blades[i] = blade;
      layers.push({ mesh: meshes.fighter, bones: bones[i], palette: palettes[i], mask: 1, flash: f.flash > 0 ? 1 : 0 });
    });
    meshes.fx.update(fx.rows, fx.update(duel.stop > 0 ? elapsed * 0.25 : elapsed));
    layers.push({ mesh: meshes.fx, palette: palettes[0], mask: 0.6 });

    // ---- camera: both fighters in the picture with room either side, moved in whole art pixels
    const [a, b] = duel.fighters,
      want = R.distFor(Math.max(7.2, Math.abs(b.x - a.x) + 4.6)),
      dist = Math.max(5.2, Math.min(10, want)),
      ease = 1 - Math.exp(-elapsed * 5);
    cam.dist += (dist - cam.dist) * ease;
    const room = Math.max(0, 6.4 - R.widthAt(cam.dist) / 2),
      mid = Math.max(-room, Math.min(room, (a.x + b.x) / 2)),
      px = R.pixelSize(cam.dist);
    cam.x += (mid - cam.x) * ease;
    cam.y = 1.12 + (cam.dist - 5.7) * 0.07;
    shake.amp *= Math.exp(-elapsed * 14);
    white *= Math.exp(-elapsed * 16);
    if (phase === 'over') dim = Math.min(0.45, (time - overAt) * 0.35);
    const drawn = R.draw({
      camera: { x: Math.round(cam.x / px) * px, y: cam.y, dist: cam.dist, pitch: cam.pitch },
      shake: shake.amp > 0.4 ? [(Math.random() * 2 - 1) * shake.amp, (Math.random() * 2 - 1) * shake.amp * 0.6] : null,
      time,
      white: white > 0.02 ? white : 0,
      dim,
      sky,
      ink,
      layers
    });
    stats.frames++;
    stats.drawn = drawn;
    stats.ms += (performance.now() - t0 - stats.ms) * 0.05;
    if (stats.frames % 30 === 0 && query.has('fps')) $('fps').textContent = `${stats.ms.toFixed(1)} ms · ${drawn} splats · ${R.target.w}×${R.target.h}`;
    requestAnimationFrame(frame);
  }

  reset();
  if (query.has('auto')) begin();
  globalThis.__duel = { get duel() { return duel; }, get phase() { return phase; }, stats, renderer: R, cam, RULES };
  $('loading').remove();
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  $('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
