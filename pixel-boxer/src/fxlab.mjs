/* A study of how a blow is drawn: the spray of sweat off the shadowed side of what was struck (render/fx.mjs: spray) in
   place of the blow's sparks, never seen over the man it came off (a layer of its own drawn `outside` his silhouette:
   render/renderer.mjs), and a ripple through the struck man from where it landed (render/renderer.mjs: a layer's
   wave: he sways as it passes, with no light) in place of his flash of white. Every card is a real bout from the catalogue (src/defense.mjs, src/ladder.mjs),
   looped; the cards of a row are the same exchange, frame for frame, and differ only in how the blow is drawn. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';
import { freshBout, drive } from './footwork.mjs';
import { DEFENSE } from './defense.mjs';
import { LADDER } from './ladder.mjs';

const DT = 1 / 60;
/* What a mote goes through as it hangs, one run taken for each: the colours of the blow's sparks as they are now (white,
   the pale yellow, the gold, the pale blue), staying light as the mist thins: a mote gone grey over his face would read as a speck of dirt on it. Palette indices (assets/manifest.json). */
const MIST = [[39, 39, 40, 40], [40, 40, 39, 41], [41, 41, 41, 25], [38, 39, 40, 40], [41, 38, 41, 41]];
/* The versions. spray is fx.spray's o (n motes and range metres for a blow of 85 N s, both in proportion to the impulse;
   size is a mote's, metres). wave: the ripple: speed (m/s its front travels), last (seconds), width (metres of the train
   of waves riding the front), sway (metres it carries what it passes to either side, at the start of a blow of 60 N s
   or more: a weaker one sways less). There is no light in it. */
const VERSIONS = [
  { id: 'now', name: '지금', note: '지금의 색 입자와 흰 번쩍임. 비교 기준입니다.' },
  { id: 'base', name: 'A · 기본', note: '입자는 타격이 가는 쪽, 맞은 부위의 그늘진 면 전체에서 나옵니다. 파문은 빛 없이 몸이 일렁이며 초속 3 m로 0.4초 동안 퍼집니다.', spray: { n: 130, range: 0.8, flare: 0.5 }, wave: { speed: 3, last: 0.4, width: 0.14, sway: 0.034 } },
  { id: 'wide', name: 'B · 크고 느리게', note: '입자가 더 많고 굵으며 가장자리에서 더 벌어집니다. 파문은 느리고 크게 일렁입니다.', spray: { n: 180, range: 0.65, flare: 0.9, life: 0.5, size: 0.018 }, wave: { speed: 2.2, last: 0.55, width: 0.2, sway: 0.05 } },
  { id: 'long', name: 'C · 잘고 빠르게', note: '입자가 덜 벌어지고 1 m 넘게 뻗어 타격의 선이 남습니다. 파문은 잘게 떨며 빠르게 지나갑니다.', spray: { n: 120, range: 1.05, flare: 0.28 }, wave: { speed: 4.2, last: 0.3, width: 0.1, sway: 0.024 } }
];
/* The rows: a light blow, the two hard ones, an uppercut under the chin (the inside uppercut of the skill ladder, the one
   that comes straight up: there it is the other man who is struck), and a knockdown. */
const ROWS = [
  ['hit-jab', '잽 · 가벼운 타격'],
  ['hit-cross', '스트레이트'],
  ['hit-hook', '훅', -1.05], // (seen from behind the man it lands on, so that the way it goes is across the picture)
  ['upperIn@3', '어퍼컷 · 턱'],
  ['down-back', '다운']
].map(([id, name, yaw]) => {
  const entry = [...DEFENSE, ...LADDER].find(e => e.id === id);
  return Object.assign({}, entry, { name, view: { yaw: yaw ?? entry.view.yaw, pitch: entry.view.pitch } });
});
const HEAD = 0.115; // the head, as a ball, for the spray: metres

// ---- the page, written from the rows and the versions
{
  const lab = document.getElementById('lab'),
    key = document.getElementById('key');
  for (const v of VERSIONS) key.insertAdjacentHTML('beforeend', `<dt>${v.name}</dt><dd>${v.note}</dd>`);
  for (const entry of ROWS) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${entry.name}</h2><div class="grid"></div>`;
    for (const v of VERSIONS)
      section.lastChild.insertAdjacentHTML(
        'beforeend',
        `<article class="card" data-entry="${entry.id}" data-version="${v.id}"><div class="stage"></div><div class="info"><h3>${v.name}</h3><div class="stats">충격량 <b data-blow>–</b> N·s · 입자 <b data-beads>–</b></div><div class="stats">뻗는 거리 <b data-head>–</b> cm</div></div></article>`
      );
    lab.append(section);
  }
}

function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap,
        tile = 0.5,
        fx = Math.abs((((x / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        fz = Math.abs((((z / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        dark = (Math.floor(x / tile + 100) + Math.floor(z / tile + 100)) % 2;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, fx < 0.03 || fz < 0.03 ? 22 : dark ? 23 : 24, 0, 3], k);
      k += 12;
    }
  return { rows, count: n * n };
}

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const boxer = unpack(fromBase64(await (await fetch('assets/' + manifest.boxer.file)).text()), manifest.boxer);
  return { manifest, boxer };
}

// the dice of a row: the same for every card of it and thrown again from the start every loop, so its cards can be compared
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function start({ manifest, boxer }) {
  const canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    tiles = floor(3.2, [0.6, 0]),
    meshes = { boxer: R.mesh(boxer, manifest.boxer.count), floor: R.mesh(tiles.rows, tiles.count) },
    palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))],
    mats = new Float32Array(NAMES.length * 12),
    ink = new Float32Array(rgb(manifest.palette[0]));
  let speed = 1,
    last = 0,
    ground = new Float32Array(12);

  const cells = [...document.querySelectorAll('.card')].map((el, i) => {
    const entry = ROWS.find(e => e.id === el.dataset.entry),
      version = VERSIONS.find(v => v.id === el.dataset.version),
      seed = 7 + ROWS.indexOf(entry),
      fx = createFx(() => cell.rnd()),
      // (the spray off each man apart from the rest: it is kept off his own silhouette, and only his)
      sprays = [0, 1].map(() => {
        const spray = createFx(() => cell.rnd());
        return { fx: spray, mesh: R.mesh(spray.rows, 0, true) };
      }),
      cell = { entry, version, el, stage: el.querySelector('.stage'), blow: el.querySelector('[data-blow]'), beads: el.querySelector('[data-beads]'), head: el.querySelector('[data-head]'), fx, mesh: R.mesh(fx.rows, 0, true), sprays, bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)], seed, rnd: dice(seed), bout: null, t: 0, acc: 0, shake: 0, waves: [null, null], struck: entry.id.includes('@') ? 1 : 0, cam: { target: [entry.id.includes('@') ? 1.2 : -0.45, 1.3, 0], yaw: entry.view.yaw, pitch: 0.14, dist: 2.9 } };
    cell.bout = freshBout(entry);
    return cell;
  });

  function tick(cell) {
    const { entry, version } = cell;
    if (cell.t > 0 && Math.round(cell.t / DT) % Math.round(entry.loop / DT) === 0) (cell.bout = freshBout(entry)), (cell.t = 0), (cell.rnd = dice(cell.seed));
    const bout = cell.bout,
      [a, b] = bout.fighters;
    step(bout, drive(entry, bout, cell.t, DT), DT);
    cell.t += DT;
    b.hp = 1000;
    if (!entry.hurt) a.hp = 1000;
    for (const e of bout.events) {
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85),
          struck = bout.fighters[e.on];
        let n;
        if (version.spray) {
          // the sweat off the shadowed side of his head, and a ripple through him from where the glove met it
          n = cell.sprays[e.on].fx.spray({ at: struck.points.head, r: HEAD }, e.vec, e.J, MIST, version.spray);
          cell.waves[e.on] = { off: [e.at[0] - struck.points.head[0], e.at[1] - struck.points.head[1], e.at[2] - struck.points.head[2]], age: 0, strength: Math.min(1, e.J / 60) };
          cell.head.textContent = String(Math.round(version.spray.range * Math.min(1.7, e.J / 85) * 100));
        } else {
          // the blow as the game draws it now
          cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
          cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
          n = Math.round(5 + 12 * k) + Math.round(3 + 8 * k);
          cell.head.textContent = '–';
        }
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
        cell.blow.textContent = String(Math.round(e.J));
        cell.beads.textContent = String(n);
      } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
    }
    cell.shake *= 0.82;
  }

  function theme() {
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  }
  /* A card's picture as its bout stands, what is in the air moved on by `elapsed` seconds: the frame R.cell takes. */
  function scene(cell, elapsed) {
    const [a, b] = cell.bout.fighters,
      layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
      shadows = [];
    [a, b].forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(elapsed, shadows, 22));
    for (const s of cell.sprays) s.mesh.update(s.fx.rows, s.fx.update(elapsed));
    // each man's ripple, if one is going through him: from where the glove met his head, wherever his head is now
    const waves = [a, b].map((f, i) => {
      const w = cell.waves[i],
        set = cell.version.wave;
      if (!w || !set) return null;
      w.age += elapsed;
      if (w.age >= set.last) return (cell.waves[i] = null);
      const h = f.points.head;
      return [h[0] + w.off[0], h[1] + w.off[1], h[2] + w.off[2], set.speed * w.age, set.width, w.strength * (1 - w.age / set.last) ** 1.2, set.sway];
    });
    layers.push(
      { mesh: cell.mesh, palette: palettes[0], mask: 0.6 },
      { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1, wave: waves[0], flash: !cell.version.wave && a.flash > 0 ? 1 : 0, silhouette: 1 },
      { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, wave: waves[1], flash: !cell.version.wave && b.flash > 0 ? 1 : 0, silhouette: 2 },
      /* the spray off each man is never seen over him, in front of him or behind: where it crosses his own outline it is
         not there, so the first of it to be seen is at his edge, as if it came out from behind him */
      ...cell.sprays.map((s, i) => ({ mesh: s.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
    );
    const ease = 1 - Math.exp(-elapsed * 4),
      [hit, other] = cell.struck ? [b, a] : [a, b];
    // framed on the man who is hit, a little behind him: the room is on the far side of his head, for what the blow throws off it
    cell.cam.target[0] += (hit.x * 1.45 - other.x * 0.45 - cell.cam.target[0]) * ease;
    cell.cam.target[2] += (hit.z * 1.45 - other.z * 0.45 - cell.cam.target[2]) * ease;
    const jolt = cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
    return { camera: cell.cam, layers, shake: jolt };
  }
  function frame(now) {
    const elapsed = globalThis.__lab.hold ? 0 : Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    const grid = R.resize(h / Math.max(2, Math.round(dpr * 2.5)));
    if (Math.round(now / 500) !== Math.round((now - 17) / 500)) theme();
    R.begin();
    for (const cell of cells) {
      const box = cell.stage.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight || box.width < 8) continue;
      cell.acc += elapsed;
      let steps = 0;
      while (cell.acc >= DT && steps++ < 6) (cell.acc -= DT), tick(cell);
      if (steps > 6) cell.acc = 0;
      const rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) };
      R.cell(rect, scene(cell, elapsed));
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  /* (for looking at the page from a script: every card stepped on by so many seconds at once, the effects with it; and the
     renderer and a card's frame, scene(cell, 0), to draw it apart and measure it) */
  globalThis.__lab = {
    cells,
    hold: false,
    reset: () => cells.forEach(cell => ((cell.bout = freshBout(cell.entry)), (cell.t = 0), (cell.acc = 0), (cell.waves = [null, null]), (cell.rnd = dice(cell.seed)))),
    advance: sec => cells.forEach(cell => { for (let i = 0; i < Math.round(sec / DT); i++) (tick(cell), cell.fx.update(DT, [], 22), cell.sprays.forEach(s => s.fx.update(DT)), cell.waves.forEach(w => w && (w.age += DT))); }),
    renderer: R,
    scene
  };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
