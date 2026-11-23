/* A contact sheet of one scripted exchange, drawn by the game's own renderer: both boxers, a frame a cell, for looking at a
   move a sixtieth of a second at a time.
     review.html?entry=slip&from=0.7&to=1.1&n=12&cols=6      (and yaw, pitch, dist, y: the camera; focus=0 or 1: on that man
   alone; px: screen pixels to an art pixel; fx=1: a blow drawn as the game draws it (render/blow.mjs: the sparks off the far
   side of what it struck, kept off the struck man's silhouette, and the ripple through him; a block's and a parry's sparks;
   a knockdown's own: its lava in place of the sparks, the second ripple where he comes down and the ring through the
   canvas, which is then drawn under them), left out by default so that the pose is what is looked at; turn=1: the camera's yaw is taken from
   where the man in focus faces, so a man going round is seen from the same side all the way; solo=1: the other man is not
   drawn; replay=1: the first replay the script makes (src/replay.mjs: a knockdown's, or a brilliant defence's), as the
   motion catalogue draws it, with the effects: from and to are then seconds of real time into it, a picture every sixtieth
   of a second, so that from=1&to=1.1&n=7 is seven pictures running)
   The bout is run once from the start of the script and the chosen moments are kept; nothing moves on the page after that.
   Under each cell: the time (in a replay, its time and the bout's), and what the bout said happened in that step.
   globalThis.__review.ready when it is drawn. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, met, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow } from './render/blow.mjs';
import { floor } from './render/floor.mjs';
import { createReplay } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';
import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, PARRY_DOWN, CROSS_ARM, CROSS_BODY, ROLLING, PULL_COUNTER, BLOCK_FIRE, SHELL } from './defense.mjs';
import { LADDER, STANCES, DIRTY, FOOTWORK, ENTRY, SHOWOFF, TAUNTING, BODY_LADDER, REAR_LADDER, WAVING, SHIFTING } from './ladder.mjs';
import { BODYSHOTS, LIVER_BLOCK } from './bodyshots.mjs';

const DT = 1 / 60,
  q = new URLSearchParams(location.search),
  num = (name, d) => (q.has(name) ? Number(q.get(name)) : d),
  all = [...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING, ...BODYSHOTS, ...LIVER_BLOCK, ...BODY_LADDER, ...REAR_LADDER, ...PARRY_DOWN, ...WAVING, ...CROSS_ARM, ...CROSS_BODY, ...ROLLING, ...PULL_COUNTER, ...BLOCK_FIRE, ...SHELL, ...SHIFTING],
  entry = all.find(e => e.id === q.get('entry')) || all[0],
  n = num('n', 12),
  from = num('from', 0),
  to = num('to', entry.loop),
  cols = num('cols', Math.min(n, 6)),
  rows = Math.ceil(n / cols),
  replay = q.get('replay') === '1',
  effects = q.get('fx') === '1' || replay;

// (the effects' dice: the same sheet every time it is drawn)
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* What a blow throws, as the game draws it (render/blow.mjs): the sparks where gloves met, what a blow throws off each man,
   the ripple through each, a knocked-down man watched until he comes down, and the ring through the canvas from there. */
function effectsOf(rnd) {
  const E = { sparks: createFx(rnd), motes: [createFx(rnd), createFx(rnd)], ripples: [null, null], falls: [null, null], ground: null };
  const keep = f => {
    const k = f.update(0);
    return { rows: f.rows.slice(0, k * 12), count: k };
  };
  return Object.assign(E, {
    // (what is in the air goes on by dt)
    age(dt) {
      [E.sparks, ...E.motes].forEach(f => f.update(dt));
      E.ripples.forEach(r => r && (r.age += dt));
      if (E.ground) E.ground.age += dt;
    },
    blows(events, men) {
      for (const e of events) {
        if (e.type === 'hit') (blow(E.motes[e.on], e, men[e.on]), (E.ripples[e.on] = rippleOf(e, men[e.on])), fallOf(e) && (E.falls[e.on] = fallOf(e)));
        else if (e.type === 'block' || e.type === 'parry') met(E.sparks, e);
      }
    },
    // (where a man knocked down comes down: found on the step, or kept with the step by a replay)
    land(men, kept) {
      const at = kept ? [kept.fall.on, kept.landing, kept.fall] : null;
      if (at) (E.ripples[at[0]] = landRipple(at[2], men[at[0]], at[1])), (E.ground = groundOf(at[2], at[1]));
      else
        E.falls.forEach((fall, i) => {
          const l = landed(fall, men[i]);
          if (l) (E.ripples[i] = landRipple(fall, men[i], l)), (E.ground = groundOf(fall, l));
        });
    },
    keep: () => ({ sparks: keep(E.sparks), motes: E.motes.map(keep), ground: groundRow(E.ground) })
  });
}
// one moment of both men, for a cell
const momentOf = (men, bind, mats, E) =>
  men.map((f, i) => ({
    bones: (() => {
      boneMatrices(f.pose, bind, f.place, mats, 0);
      return mats.slice();
    })(),
    x: f.x,
    z: f.z,
    yaw: f.yaw,
    hips: f.pose.at.Hips[2],
    wave: E ? rippleRow(E.ripples[i], f) : null
  }));

// ---- the exchange, run once: the bones of both men at each moment asked for (and, with fx=1, what is in the air then)
function run(bind) {
  const bout = freshBout(entry),
    mats = new Float32Array(NAMES.length * 12),
    want = Array.from({ length: n }, (_, i) => Math.round((from + (n > 1 ? ((to - from) * i) / (n - 1) : 0)) / DT)),
    frames = [],
    said = [],
    E = effects ? effectsOf(dice(7)) : null;
  for (let tick = 0; tick <= want[want.length - 1]; tick++) {
    // (what is in the air goes on a step, and then the step's blows are added where they start)
    if (E) E.age(DT);
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    for (const e of bout.events) if (!['cover', 'punch'].includes(e.type)) said.push([tick, e.type + (e.name ? ' ' + e.name : '')]);
    if (E) E.blows(bout.events, bout.fighters), E.land(bout.fighters);
    while (want[frames.length] === tick) {
      frames.push({
        tick,
        label: (tick * DT).toFixed(3),
        men: momentOf(bout.fighters, bind, mats, E),
        fx: E ? E.keep() : null,
        said: said.filter(([t]) => t > (frames.length ? frames[frames.length - 1].tick : -1) && t <= tick).map(([, s]) => s)
      });
    }
  }
  return frames;
}
/* The first replay the script makes, as the catalogue draws it: the bout run until a replay starts, and then the replay
   played a sixtieth of a second of real time at a time, what its steps threw thrown again as it comes to them. */
function runReplay(bind) {
  const bout = freshBout(entry),
    mats = new Float32Array(NAMES.length * 12),
    r = createReplay(),
    want = Array.from({ length: n }, (_, i) => Math.round((from + (n > 1 ? ((to - from) * i) / (n - 1) : 0)) / DT)),
    frames = [],
    E = effectsOf(dice(7));
  let tick = 0;
  for (; tick < Math.round(entry.loop / DT) && !r.playing; tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    r.watch(bout, DT);
  }
  if (!r.playing) throw new Error(`${entry.id}: no replay in its loop`);
  const kind = r.kind;
  for (let i = 0; r.playing && i <= want[want.length - 1]; i++) {
    E.age((DT * r.slow) * (i > 0));
    const shown = r.next(DT);
    for (const k of r.crossed) E.blows(k.events, k.men), k.landed && E.land(k.men, k.landed);
    while (want[frames.length] === i) frames.push({ tick: i, label: `${(i * DT).toFixed(3)} · ${shown.t.toFixed(3)}`, men: momentOf(shown.men, bind, mats, E), fx: E.keep(), said: [] });
  }
  frames.kind = kind;
  frames.on = r.on;
  return frames;
}

async function start() {
  const manifest = await (await fetch('assets/manifest.json')).json(),
    boxer = unpack(fromBase64(await (await fetch('assets/' + manifest.boxer.file)).text()), manifest.boxer),
    canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    mesh = R.mesh(boxer, manifest.boxer.count),
    palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))],
    frames = replay ? runReplay(bind) : run(bind),
    // (a ring through the canvas needs a canvas to go through: the catalogue's tiles, under any sheet with the effects)
    tiles = effects ? floor(3.2, [0.6, 0]) : null,
    ground = tiles ? R.mesh(tiles.rows, tiles.count) : null,
    sheet = document.getElementById('sheet'),
    gap = 6,
    w = Math.floor((innerWidth - gap * (cols + 1)) / cols),
    h = Math.round(w * num('aspect', 0.8)),
    dpr = Math.min(devicePixelRatio || 1, 3);
  document.getElementById('title').textContent = `${entry.name} · ${entry.id} · ${replay ? `리플레이(${frames.kind}) ` : ''}${from}–${to}s`;
  sheet.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`;
  const cells = frames.map(f => {
    const el = document.createElement('figure');
    el.innerHTML = `<div class="stage" style="height:${h}px"></div><figcaption><b>${f.label}</b> ${f.said.join(', ')}</figcaption>`;
    sheet.append(el);
    // each moment's shadows, from where its two men stand
    const fx = createFx(() => 0.5),
      count = fx.update(0, f.men.map(m => ({ x: m.x + m.hips * Math.sin(m.yaw), z: m.z + m.hips * Math.cos(m.yaw), yaw: m.yaw, long: 0.3, wide: 0.24 })), 22);
    return { f, el, shadows: R.mesh(fx.rows, count), sparks: f.fx ? R.mesh(f.fx.sparks.rows, f.fx.sparks.count) : null, motes: f.fx ? f.fx.motes.map(m => R.mesh(m.rows, m.count)) : [] };
  });
  canvas.style.height = document.documentElement.scrollHeight + 'px';
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(document.documentElement.scrollHeight * dpr);
  const grid = R.resize(canvas.height / Math.max(2, Math.round(dpr * num('px', 2.5)))),
    bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number),
    hall = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  R.begin();
  for (const { f, el, shadows, sparks, motes } of cells) {
    const box = el.querySelector('.stage').getBoundingClientRect(),
      top = box.top + scrollY,
      rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((canvas.height / dpr - top - box.height) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      [a, b] = f.men,
      // (on the two of them, or on one: focus=0 or 1)
      on = q.has('focus') ? [f.men[num('focus', 0)], f.men[num('focus', 0)]] : [a, b],
      cam = { target: [(on[0].x + on[1].x) / 2, num('y', 0.95), (on[0].z + on[1].z) / 2], yaw: num('yaw', entry.view.yaw) + (q.get('turn') === '1' ? on[0].yaw - Math.PI / 2 : 0), pitch: num('pitch', entry.view.pitch), dist: num('dist', 3.4) };
    const ring = f.fx && f.fx.ground,
      layers = [{ mesh: shadows, palette: palettes[0], mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] }];
    if (ground) layers.unshift({ mesh: ground, palette: palettes[0], mask: 0.5, ground: ring });
    f.men.forEach((m, i) => {
      if (q.get('solo') === '1' && q.has('focus') && i !== num('focus', 0)) return;
      R.packBones(m.bones, bones[i]);
      layers.push({ mesh, bones: bones[i].slice(), palette: palettes[i], mask: 1, wave: m.wave, silhouette: i + 1 });
    });
    // (what a blow threw off each man is never seen over him: render/blow.mjs)
    if (sparks) layers.push({ mesh: sparks, palette: palettes[0], mask: 0.6 }, ...motes.map((m, i) => ({ mesh: m, palette: palettes[0], mask: 0.6, outside: i + 1 })));
    R.cell(rect, { camera: cam, layers });
  }
  R.end({ hall, ink: new Float32Array(rgb(manifest.palette[0])) });
  globalThis.__review = { ready: true, frames: frames.map(f => ({ t: f.tick * DT, label: f.label, said: f.said, ground: f.fx && f.fx.ground, waves: f.men.map(m => m.wave) })) };
}

start().catch(error => {
  console.error(error);
  document.getElementById('title').textContent = 'failed: ' + error.message;
});
