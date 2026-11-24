/* A contact sheet of one scripted exchange, drawn by the game's own renderer: both boxers, a frame a cell, for looking at a
   move a sixtieth of a second at a time.
     review.html?entry=slip&from=0.7&to=1.1&n=12&cols=6      (and yaw, pitch, dist, y: the camera; focus=0 or 1: on that man
   alone; px: screen pixels to an art pixel; fx=1: a blow drawn as the game draws it (render/blow.mjs: the sparks off the far
   side of what it struck, kept off the struck man's silhouette, and the ripple through him; a block's and a parry's sparks;
   a knockdown's own: its lava in place of the sparks, thrown twice in quick succession, the second ripple where he comes
   down and the ring through the canvas, which is then drawn under them), left out by default so that the pose is what is looked at; turn=1: the camera's yaw is taken from
   where the man in focus faces, so a man going round is seen from the same side all the way; solo=1: the other man is not
   drawn; defence=lines-sparks,wind-line (with fx=1: a block, a parry, a miss drawn in that style, render/guard.mjs styleOf;
   today's by default); replay=1: the first replay the script makes (src/replay.mjs: a knockdown's, or a brilliant defence's), as the
   motion catalogue draws it, with the effects: from and to are then seconds of real time into it, a picture every sixtieth
   of a second, so that from=1&to=1.1&n=7 is seven pictures running; a knockdown's from the camera it cuts to (its view:
   dist is then the live distance it is drawn closer than, and vyaw, vpitch put it somewhere else, to compare; live=1 draws
   it from the sheet's own camera), started when it starts in the catalogue: the live bout's effects run, and waited for,
   on the bout's own clock); bearing=1: the eight bearings laid on the canvas round
   one man (of=1, the other man, by default; game/bearing.mjs, docs/bearing-system-plan.md §8.2): the edges of the eight cells
   as he faces in that picture, his front marked, the rings of the distance bands, the path the other man's centre has taken
   since the first picture, and in the corner of each picture the cell the other man is in (with the margin the cells change
   by), the band and the bearing in degrees; wear=training (or training-up, the hood up): both men in the training suit, as
   the game has it (rig/boxer.mjs WEAR; wear=training,none or none,training-up: each corner his own, the first man's first). It is read from above: unless told otherwise the camera looks almost straight down,
   at 1.45 (the plan's 0.95 leaves the men standing over the rings), from behind the man in the middle as he faced in the first picture
   (turn=1: as he faces in each), on his feet and far enough back for the path)
   The bout is run once from the start of the script and the chosen moments are kept; nothing moves on the page after that.
   Under each cell: the time (in a replay, its time and the bout's), and what the bout said happened in that step.
   globalThis.__review.ready when it is drawn. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow, quietOf, ringsOn, FX } from './render/blow.mjs';
import { createGuard, styleOf } from './render/guard.mjs';
import { floor } from './render/floor.mjs';
import { createReplay, distOf } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { dress } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';
import { createTracker, track, cellName, cellSaid, BANDS } from './game/bearing.mjs';
import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, PARRY_DOWN, CROSS_ARM, CROSS_BODY, ROLLING, PULL_COUNTER, BLOCK_FIRE, SHELL } from './defense.mjs';
import { LADDER, STANCES, DIRTY, FOOTWORK, ENTRY, SHOWOFF, TAUNTING, BODY_LADDER, REAR_LADDER, WAVING, SHIFTING, WALKING } from './ladder.mjs';
import { BODYSHOTS, LIVER_BLOCK } from './bodyshots.mjs';
import { COMBINATIONS } from './combos.mjs';

const DT = 1 / 60,
  q = new URLSearchParams(location.search),
  num = (name, d) => (q.has(name) ? Number(q.get(name)) : d),
  all = [...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING, ...BODYSHOTS, ...LIVER_BLOCK, ...BODY_LADDER, ...REAR_LADDER, ...PARRY_DOWN, ...WAVING, ...CROSS_ARM, ...CROSS_BODY, ...ROLLING, ...PULL_COUNTER, ...BLOCK_FIRE, ...SHELL, ...SHIFTING, ...WALKING, ...COMBINATIONS],
  entry = all.find(e => e.id === q.get('entry')) || all[0],
  n = num('n', 12),
  from = num('from', 0),
  to = num('to', entry.loop),
  cols = num('cols', Math.min(n, 6)),
  rows = Math.ceil(n / cols),
  replay = q.get('replay') === '1',
  effects = q.get('fx') === '1' || replay,
  // (the bearings round one man: the other man's by default)
  bearing = q.get('bearing') === '1' && !replay,
  of = num('of', 1),
  // (what each man wears: '' as he is)
  wears = (w => [w[0], w.length > 1 ? w[1] : w[0]])((q.get('wear') || '').split(',').map(x => (x.trim() === 'none' ? '' : x.trim())));

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
  // (and the defences, in the style ?defence= asks for: render/guard.mjs; today's if it asks for none)
  const E = { sparks: createFx(rnd), motes: [createFx(rnd), createFx(rnd)], ripples: [null, null], falls: [null, null], ground: null, guard: createGuard(styleOf(q.get('defence'))) };
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
      E.guard.see(men);
      for (const e of events) {
        if (e.type === 'hit') (blow(E.motes[e.on], e, men[e.on]), (E.ripples[e.on] = rippleOf(e, men[e.on])), fallOf(e) && (E.falls[e.on] = fallOf(e)));
        else {
          const d = E.guard.meet(e, men, E.sparks, E.motes);
          if (d.ripple) E.ripples[d.ripple.on] = d.ripple.ripple;
        }
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
          ringsOn(E.ground, fall, men[i]);
        });
    },
    keep: () => ({ sparks: keep(E.sparks), motes: E.motes.map(keep), ground: groundRow(E.ground) }),
    // (has everything a blow threw gone out?)
    quiet: () => quietOf(E.motes, E.ripples, E.ground)
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
    E = effects ? effectsOf(dice(7)) : null,
    tr = bearing ? createTracker() : null,
    trail = [];
  for (let tick = 0; tick <= want[want.length - 1]; tick++) {
    // (what is in the air goes on a step, and then the step's blows are added where they start)
    if (E) E.age(DT);
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    for (const e of bout.events) if (!['cover', 'punch'].includes(e.type)) said.push([tick, e.type + (e.name ? ' ' + e.name : '')]);
    if (E) E.blows(bout.events, bout.fighters), E.land(bout.fighters);
    // (the other man's centre, from the first picture on; and where he is round the man in the middle)
    if (tr) track(tr, bout), tick >= want[0] && trail.push([bout.fighters[1 - of].x, bout.fighters[1 - of].z]);
    while (want[frames.length] === tick) {
      const m = tr && tr.men[1 - of];
      frames.push({
        tick,
        label: (tick * DT).toFixed(3),
        men: momentOf(bout.fighters, bind, mats, E),
        fx: E ? E.keep() : null,
        bearing: tr ? { trail: trail.slice(), at: [bout.fighters[of].x, bout.fighters[of].z], yaw: bout.fighters[of].yaw, beta: m.beta, cell: m.cell, band: m.band, d: m.d } : null,
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
    r = createReplay({ yaw: () => num('yaw', entry.view.yaw) }),
    want = Array.from({ length: n }, (_, i) => Math.round((from + (n > 1 ? ((to - from) * i) / (n - 1) : 0)) / DT)),
    frames = [],
    // (the live bout's effects, a step at a time, for the replay to wait for; and those it throws again, in its own time)
    live = effectsOf(dice(7)),
    E = effectsOf(dice(7));
  let tick = 0;
  for (; tick < Math.round(entry.loop / DT) && !r.playing; tick++) {
    live.age(DT);
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    live.blows(bout.events, bout.fighters), live.land(bout.fighters);
    r.watch(bout, DT, live.quiet());
  }
  if (!r.playing) throw new Error(`${entry.id}: no replay in its loop`);
  const kind = r.kind,
    started = bout.t;
  let view = null;
  for (let i = 0; r.playing && i <= want[want.length - 1]; i++) {
    const shown = r.next(DT);
    // (a knockdown's camera, with its first picture)
    view = view || r.view;
    // (what it threw again goes on by the bout's time the picture moved on: none at the first)
    E.age(i > 0 ? r.moved : 0);
    for (const k of r.crossed) E.blows(k.events, k.men), k.landed && E.land(k.men, k.landed);
    while (want[frames.length] === i) frames.push({ tick: i, label: `${(i * DT).toFixed(3)} · ${shown.t.toFixed(3)}`, men: momentOf(shown.men, bind, mats, E), fx: E.keep(), said: [], progress: r.progress });
  }
  frames.kind = kind;
  frames.on = r.on;
  frames.view = view;
  frames.started = started;
  return frames;
}

async function start() {
  const manifest = await (await fetch('assets/manifest.json')).json(),
    partOf = w => (!w ? manifest.boxer : manifest.wear && Object.hasOwn(manifest.wear, w) ? manifest.wear[w] : null),
    canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    meshOf = {};
  for (const w of new Set(wears)) {
    if (!partOf(w)) throw new Error(`no outfit called ${w}`);
    meshOf[w] = R.mesh(unpack(fromBase64(await (await fetch('assets/' + partOf(w).file)).text()), partOf(w)), partOf(w).count);
  }
  const meshes = wears.map(w => meshOf[w]),
    palettes = [0, 1].map(i => paletteArray(dress(manifest.palette, i))),
    worn = [0, 1].map(i => paletteArray(dress(manifest.palette, i, wears[i]))),
    frames = replay ? runReplay(bind) : run(bind),
    // (a ring through the canvas needs a canvas to go through: the catalogue's tiles, under any sheet with the effects)
    tiles = effects ? (q.get('canvas') === 'ring' ? { rows: unpack(fromBase64(await (await fetch('assets/' + manifest.ring.file)).text()), manifest.ring), count: manifest.ring.count } : floor(3.2, [0.6, 0])) : null,
    ground = tiles ? R.mesh(tiles.rows, tiles.count) : null,
    sheet = document.getElementById('sheet'),
    gap = 6,
    w = Math.floor((innerWidth - gap * (cols + 1)) / cols),
    h = Math.round(w * num('aspect', 0.8)),
    dpr = Math.min(devicePixelRatio || 1, 3);
  const V = frames.view,
    deg = a => Math.round((a * 180) / Math.PI);
  document.getElementById('title').textContent = `${entry.name} · ${entry.id} · ${replay ? `리플레이(${frames.kind}${V ? `, 타격 뒤 ${(frames.started - V.blow).toFixed(3)} s에 시작, ${V.name === 'above' ? '조감' : '옆'} ${deg(V.yaw)}° · ${deg(V.pitch)}°` : ''}) ` : ''}${from}–${to}s${wears.some(Boolean) ? ' · ' + wears.map(w => w || 'none').join(', ') : ''}`;
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
      // (a knockdown's replay from the camera it cuts to, as the catalogue draws it: closer, pushed in as it goes)
      V = replay && frames.view && q.get('live') !== '1' ? frames.view : null,
      cam = f.bearing
        ? bearingCamera(f.bearing, frames)
        : V
          ? { target: V.target, yaw: num('vyaw', V.yaw), pitch: num('vpitch', V.pitch), dist: distOf(V, num('dist', 3.4), box.width / box.height, f.progress) }
          : { target: [(on[0].x + on[1].x) / 2, num('y', 0.95), (on[0].z + on[1].z) / 2], yaw: num('yaw', entry.view.yaw) + (q.get('turn') === '1' ? on[0].yaw - Math.PI / 2 : 0), pitch: num('pitch', entry.view.pitch), dist: num('dist', 3.4) };
    const ring = f.fx && f.fx.ground,
      layers = [{ mesh: shadows, palette: palettes[0], mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] }];
    if (ground) layers.unshift({ mesh: ground, palette: palettes[0], mask: 0.5, ground: ring });
    f.men.forEach((m, i) => {
      if (q.get('solo') === '1' && q.has('focus') && i !== num('focus', 0)) return;
      R.packBones(m.bones, bones[i]);
      layers.push({ mesh: meshes[i], bones: bones[i].slice(), palette: worn[i], mask: 1, wave: m.wave, silhouette: i + 1 });
    });
    // (what a blow threw off each man is never seen over him: render/blow.mjs)
    if (sparks) layers.push({ mesh: sparks, palette: palettes[0], mask: 0.6 }, ...motes.map((m, i) => ({ mesh: m, palette: palettes[0], mask: 0.6, outside: i + 1 })));
    R.cell(rect, { camera: cam, layers });
    if (f.bearing) laid(el.querySelector('.stage'), f.bearing, cam, box);
  }
  R.end({ hall, ink: new Float32Array(rgb(manifest.palette[0])) });
  globalThis.__review = { ready: true, view: frames.view || null, started: frames.started, frames: frames.map(f => ({ t: f.tick * DT, label: f.label, said: f.said, ground: f.fx && f.fx.ground, waves: f.men.map(m => m.wave) })) };
}

/* ---- the bearings laid on the canvas (bearing=1): seen from above and behind the man in the middle, far enough back that the
   whole of the other man's path is in every picture */
const FOV = (38 * Math.PI) / 180; // (the renderer's own: render/renderer.mjs)
function bearingCamera(B, frames) {
  const far = Math.max(1.2, ...frames.flatMap(f => f.bearing.trail.map(p => Math.hypot(p[0] - f.bearing.at[0], p[1] - f.bearing.at[1]))));
  return {
    target: [B.at[0], num('y', 0), B.at[1]],
    yaw: q.has('yaw') ? num('yaw', 0) : (q.get('turn') === '1' ? B.yaw : frames[0].bearing.yaw) + Math.PI,
    pitch: num('pitch', 1.45),
    dist: num('dist', Math.max(4.5, (far + 0.7) / 0.34))
  };
}
// a point on the canvas (or above it) where the renderer puts it in a picture of this size: CSS pixels from its top left
function projector(cam, w, h) {
  const cp = Math.cos(cam.pitch),
    sp = Math.sin(cam.pitch),
    cy = Math.cos(cam.yaw),
    sy = Math.sin(cam.yaw),
    X = [cy, 0, -sy],
    Z = [cp * sy, sp, cp * cy],
    Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]],
    e = cam.target.map((v, i) => v + Z[i] * cam.dist),
    focal = h / 2 / Math.tan(FOV / 2),
    dot = (a, p) => a[0] * (p[0] - e[0]) + a[1] * (p[1] - e[1]) + a[2] * (p[2] - e[2]);
  return (x, z, y = 0) => {
    const p = [x, y, z],
      depth = -dot(Z, p);
    return depth > 0.05 ? [w / 2 + (dot(X, p) * focal) / depth, h / 2 - (dot(Y, p) * focal) / depth] : null;
  };
}
/* Over a picture: the edges of the eight cells round the man in the middle as he faces in it (each cell's number at its
   middle, his front drawn longer), the rings of the bands (their edges), the other man's path since the first picture and
   where he is now; in the corner, his cell, its name, the band and the bearing. */
function laid(stage, B, cam, box) {
  const w = box.width,
    h = box.height,
    at = projector(cam, w, h),
    round = (deg, r) => at(B.at[0] + r * Math.sin(B.yaw + (deg * Math.PI) / 180), B.at[1] + r * Math.cos(B.yaw + (deg * Math.PI) / 180)),
    pts = list => list.filter(Boolean).map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    rings = BANDS.slice(0, 5).map(b => `<polygon points="${pts(Array.from({ length: 72 }, (_, i) => round(i * 5, b.to)))}" class="ring"/>`),
    edges = Array.from({ length: 8 }, (_, k) => `<polyline points="${pts([round(22.5 + 45 * k, 0.3), round(22.5 + 45 * k, BANDS[4].to)])}" class="edge"/>`),
    front = `<polyline points="${pts([round(0, 0.3), round(0, BANDS[4].to + 0.15)])}" class="front"/>`,
    numbers = [0, 1, 2, 3, 4, -3, -2, -1].map(k => {
      const p = round(45 * k, 1.75);
      return p ? `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" class="k${k === B.cell ? ' on' : ''}">${cellSaid(k)}</text>` : '';
    }),
    path = B.trail.map(p => at(p[0], p[1])),
    now = path[path.length - 1];
  stage.style.position = 'relative';
  stage.insertAdjacentHTML(
    'beforeend',
    `<svg class="bearing" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${rings.join('')}${edges.join('')}${front}${numbers.join('')}<polyline points="${pts(path)}" class="path"/>${now ? `<circle cx="${now[0].toFixed(1)}" cy="${now[1].toFixed(1)}" r="4" class="now"/>` : ''}</svg>` +
      `<span class="cell">${cellSaid(B.cell)} ${cellName(B.cell)} · ${BANDS[B.band].name} · ${Math.round(B.beta) < 0 ? '−' : '+'}${Math.abs(Math.round(B.beta))}°</span>`
  );
}

/* ring=shake: the ring through the canvas (fx=1) as shaken pixels, the prototype beside the confirmed ring (render/blow.mjs
   FX.ground.kind); canvas=ring: drawn on the game's own ring canvas, in place of the catalogue's tiles */
if (q.get('ring') === 'shake') FX.ground.kind = 'shake';
start().catch(error => {
  console.error(error);
  document.getElementById('title').textContent = 'failed: ' + error.message;
});
