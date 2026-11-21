/* A contact sheet of one scripted exchange, drawn by the game's own renderer: both boxers, a frame a cell, for looking at a
   move a sixtieth of a second at a time.
     review.html?entry=slip&from=0.7&to=1.1&n=12&cols=6      (and yaw, pitch, dist, y: the camera; focus=0 or 1: on that man
   alone; px: screen pixels to an art pixel; flash=1: the white of a hit, left out by default so that the pose under it can
   be seen; turn=1: the camera's yaw is taken from where the man in focus faces, so a man going round is seen from the same
   side all the way; solo=1: the other man is not drawn)
   The bout is run once from the start of the script and the chosen moments are kept; nothing moves on the page after that.
   Under each cell: the time, and what the bout said happened in that step. globalThis.__review.ready when it is drawn. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';
import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE } from './defense.mjs';
import { LADDER, STANCES, DIRTY, FOOTWORK, ENTRY, SHOWOFF, TAUNTING } from './ladder.mjs';

const DT = 1 / 60,
  q = new URLSearchParams(location.search),
  num = (name, d) => (q.has(name) ? Number(q.get(name)) : d),
  all = [...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING],
  entry = all.find(e => e.id === q.get('entry')) || all[0],
  n = num('n', 12),
  from = num('from', 0),
  to = num('to', entry.loop),
  cols = num('cols', Math.min(n, 6)),
  rows = Math.ceil(n / cols);

// ---- the exchange, run once: the bones of both men at each moment asked for
function run(bind) {
  const bout = freshBout(entry),
    mats = new Float32Array(NAMES.length * 12),
    want = Array.from({ length: n }, (_, i) => Math.round((from + (n > 1 ? ((to - from) * i) / (n - 1) : 0)) / DT)),
    frames = [],
    said = [];
  for (let tick = 0; tick <= want[want.length - 1]; tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    for (const e of bout.events) if (!['cover', 'punch'].includes(e.type)) said.push([tick, e.type + (e.name ? ' ' + e.name : '')]);
    while (want[frames.length] === tick) {
      frames.push({
        tick,
        men: bout.fighters.map(f => ({
          bones: (() => {
            boneMatrices(f.pose, bind, f.place, mats, 0);
            return mats.slice();
          })(),
          x: f.x,
          z: f.z,
          yaw: f.yaw,
          hips: f.pose.at.Hips[2],
          flash: f.flash > 0
        })),
        said: said.filter(([t]) => t > (frames.length ? frames[frames.length - 1].tick : -1) && t <= tick).map(([, s]) => s)
      });
    }
  }
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
    frames = run(bind),
    sheet = document.getElementById('sheet'),
    gap = 6,
    w = Math.floor((innerWidth - gap * (cols + 1)) / cols),
    h = Math.round(w * num('aspect', 0.8)),
    dpr = Math.min(devicePixelRatio || 1, 3);
  document.getElementById('title').textContent = `${entry.name} · ${entry.id} · ${from}–${to}s`;
  sheet.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`;
  const cells = frames.map(f => {
    const el = document.createElement('figure');
    el.innerHTML = `<div class="stage" style="height:${h}px"></div><figcaption><b>${(f.tick * DT).toFixed(3)}</b> ${f.said.join(', ')}</figcaption>`;
    sheet.append(el);
    // each moment's shadows, from where its two men stand
    const fx = createFx(() => 0.5),
      count = fx.update(0, f.men.map(m => ({ x: m.x + m.hips * Math.sin(m.yaw), z: m.z + m.hips * Math.cos(m.yaw), yaw: m.yaw, long: 0.3, wide: 0.24 })), 22);
    return { f, el, shadows: R.mesh(fx.rows, count) };
  });
  canvas.style.height = document.documentElement.scrollHeight + 'px';
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(document.documentElement.scrollHeight * dpr);
  const grid = R.resize(canvas.height / Math.max(2, Math.round(dpr * num('px', 2.5)))),
    bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number),
    hall = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  R.begin();
  for (const { f, el, shadows } of cells) {
    const box = el.querySelector('.stage').getBoundingClientRect(),
      top = box.top + scrollY,
      rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((canvas.height / dpr - top - box.height) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      [a, b] = f.men,
      // (on the two of them, or on one: focus=0 or 1)
      on = q.has('focus') ? [f.men[num('focus', 0)], f.men[num('focus', 0)]] : [a, b],
      cam = { target: [(on[0].x + on[1].x) / 2, num('y', 0.95), (on[0].z + on[1].z) / 2], yaw: num('yaw', entry.view.yaw) + (q.get('turn') === '1' ? on[0].yaw - Math.PI / 2 : 0), pitch: num('pitch', entry.view.pitch), dist: num('dist', 3.4) };
    const layers = [{ mesh: shadows, palette: palettes[0], mask: 0.6 }];
    f.men.forEach((m, i) => {
      if (q.get('solo') === '1' && q.has('focus') && i !== num('focus', 0)) return;
      R.packBones(m.bones, bones[i]);
      layers.push({ mesh, bones: bones[i].slice(), palette: palettes[i], mask: 1, flash: m.flash && q.get('flash') === '1' ? 1 : 0 });
    });
    R.cell(rect, { camera: cam, layers });
  }
  R.end({ hall, ink: new Float32Array(rgb(manifest.palette[0])) });
  globalThis.__review = { ready: true, frames: frames.map(f => ({ t: f.tick * DT, said: f.said })) };
}

start().catch(error => {
  console.error(error);
  document.getElementById('title').textContent = 'failed: ' + error.message;
});
