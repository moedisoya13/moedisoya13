/* A study of one effect: the spray of sweat off the far side of a head when it is hit (render/fx.mjs: spray), in place of
   the sparks the blow is drawn with now. Every card is a real bout from the defence catalogue (src/defense.mjs), looped; the
   cards of a row are the same exchange, frame for frame, and differ only in what the blow throws off. */
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

const DT = 1 / 60;
/* What a mote goes through as it hangs, one run taken for each: the colours of the blow's sparks as they are now (white,
   the pale yellow, the gold, the pale blue), going to the greys as the mist thins. Palette indices (assets/manifest.json). */
const MIST = [[38, 38, 41, 25], [38, 39, 40, 25], [38, 41, 41, 24], [39, 40, 40, 25], [38, 39, 41, 24]];
/* The versions. n: motes, for a blow of nothing and for one of 85 newton-seconds more (fewer under 6 m/s); o is fx.spray's. The fan leaves at
   the speed the glove was closing on the head at (a cross: 11 m/s), so how far it gets is that over the air's drag. */
const VERSIONS = [
  { id: 'now', name: '지금', note: '지금의 색 입자. 비교 기준입니다.' },
  { id: 'mist', name: 'A · 안개', note: '색 입자를 없애고, 같은 색의 훨씬 고운 입자가 머리 반대편에서 부채꼴로 터집니다. 0.1초 안에 80 cm쯤 뻗고 그 자리에 떠서 흩어집니다.', n: [60, 90], o: { size: 0.008, cone: 0.28, reach: 1, drag: 12, life: 0.42 } },
  { id: 'drops', name: 'B · 안개 + 방울', note: 'A에 굵은 방울을 열에 하나쯤 섞습니다. 방울은 안개를 뚫고 더 멀리 나가 포물선으로 떨어집니다.', n: [60, 90], o: { size: 0.008, cone: 0.28, reach: 1, drag: 12, life: 0.42, beads: 0.12 } },
  { id: 'streak', name: 'C · 긴 줄기', note: '부채를 좁히고 더 멀리 보냅니다. 주먹이 가던 선이 1 m 넘는 줄기로 남습니다.', n: [70, 100], o: { size: 0.008, cone: 0.17, reach: 1.25, drag: 10, life: 0.48, lift: 0.08 } },
  { id: 'cloud', name: 'D · 짙은 구름', note: '입자를 더 많이, 더 넓게 터뜨립니다. 짧게 뻗고 머리 뒤에 구름처럼 오래 남습니다.', n: [110, 150], o: { size: 0.01, cone: 0.42, reach: 0.9, drag: 15, life: 0.55 } }
];
const ROWS = ['hit-cross', 'hit-hook', 'hit-upper', 'down-back'].map(id => DEFENSE.find(e => e.id === id));

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
        `<article class="card" data-entry="${entry.id}" data-version="${v.id}"><div class="stage"></div><div class="info"><h3>${v.name}</h3><div class="stats">충격량 <b data-blow>–</b> N·s · 입자 <b data-beads>–</b></div><div class="stats">주먹 <b data-head>–</b> m/s</div></div></article>`
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
      cell = { entry, version, el, stage: el.querySelector('.stage'), blow: el.querySelector('[data-blow]'), beads: el.querySelector('[data-beads]'), head: el.querySelector('[data-head]'), fx, mesh: R.mesh(fx.rows, 0, true), bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)], seed, rnd: dice(seed), bout: null, t: 0, acc: 0, shake: 0, was: null, top: 0, cam: { target: [-0.45, 1.3, 0], yaw: entry.view.yaw, pitch: 0.14, dist: 2.9 } };
    cell.bout = freshBout(entry);
    return cell;
  });

  function tick(cell) {
    const { entry, version } = cell;
    if (cell.t > 0 && Math.round(cell.t / DT) % Math.round(entry.loop / DT) === 0) (cell.bout = freshBout(entry)), (cell.t = 0), (cell.was = null), (cell.rnd = dice(cell.seed));
    const bout = cell.bout,
      [a, b] = bout.fighters;
    step(bout, drive(entry, bout, cell.t, DT), DT);
    cell.t += DT;
    b.hp = 1000;
    for (const e of bout.events) {
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85),
          struck = bout.fighters[e.on],
          // (as many motes as the blow is hard, and fewer for a glove that was hardly moving: there is little to throw)
          n = version.n ? Math.round((version.n[0] + version.n[1] * k) * Math.max(0.25, Math.min(1, e.speed / 6))) : 0;
        if (n) cell.fx.spray(struck.points.head, e.at, e.speed, n, MIST, version.o);
        else {
          // the blow as the game draws it now
          cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
          cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
        }
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
        cell.blow.textContent = String(Math.round(e.J));
        cell.beads.textContent = String(n || Math.round(5 + 12 * k) + Math.round(3 + 8 * k));
        cell.head.textContent = e.speed.toFixed(1);
      } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
    }
    cell.shake *= 0.82;
  }

  function theme() {
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
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
      const [a, b] = cell.bout.fighters,
        layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
        shadows = [];
      [a, b].forEach((f, i) => {
        R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
        shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
      });
      cell.mesh.update(cell.fx.rows, cell.fx.update(elapsed, shadows, 22));
      layers.push({ mesh: cell.mesh, palette: palettes[0], mask: 0.6 }, { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1 }, { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, flash: b.flash > 0 ? 1 : 0 });
      const rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
        ease = 1 - Math.exp(-elapsed * 4);
      // framed on the man who is hit, a little behind him: the room is on the far side of his head, for what the blow throws off it
      cell.cam.target[0] += (a.x * 1.45 - b.x * 0.45 - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (a.z * 1.45 - b.z * 0.45 - cell.cam.target[2]) * ease;
      const jolt = cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
      R.cell(rect, { camera: cell.cam, layers, shake: jolt });
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  // (for looking at the page from a script: every card stepped on by so many seconds at once, the effects with it)
  globalThis.__lab = {
    cells,
    hold: false,
    reset: () => cells.forEach(cell => ((cell.bout = freshBout(cell.entry)), (cell.t = 0), (cell.acc = 0), (cell.was = null), (cell.rnd = dice(cell.seed)))),
    advance: sec => cells.forEach(cell => { for (let i = 0; i < Math.round(sec / DT); i++) (tick(cell), cell.fx.update(DT, [], 22)); })
  };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
