/* How a blow is drawn, before and as decided (docs/moves-plan-6.md §2.6): two columns, the same exchange frame for frame.
   "전" is the blow as it was drawn before, kept on this page alone: its sparks thrown from where the glove met him, and the
   struck man white for 0.07 s (his palette made white for so long: the renderer has no flash any more). "확정" is the blow as
   the game now draws it (render/blow.mjs): the same sparks from where the line of the blow comes out of his far side, along
   the way the glove was going, never seen over him (an fx of his own drawn `outside` his silhouette), and a ripple through
   him from where it landed in place of the white. Every card is a real bout from the catalogue (src/defense.mjs,
   src/ladder.mjs, src/bodyshots.mjs), looped; the two cards of a row are the same exchange, frame for frame. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, met, rippleOf, rippleRow, FX } from './render/blow.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';
import { freshBout, drive } from './footwork.mjs';
import { DEFENSE } from './defense.mjs';
import { LADDER } from './ladder.mjs';
import { BODYSHOTS } from './bodyshots.mjs';

const DT = 1 / 60;
const VERSIONS = [
  { id: 'before', name: '전', note: '접촉점에서 튀는 색 입자와, 맞은 선수의 흰 번쩍임(0.07초).' },
  { id: 'final', name: '확정', note: '같은 색 입자(수·색·속도·수명 그대로)가 타격선이 맞은 몸을 빠져나가는 반대쪽 면에서 시작해, 주먹이 가던 방향(위아래 포함)으로 날아갑니다. 맞은 선수의 윤곽 안에서는 보이지 않아 윤곽에서 처음 나타납니다. 흰 번쩍임 대신 닿은 점에서 파문이 빛 없이 몸(머리 포함)에 퍼집니다: 초속 3 m, 0.4초(다운은 0.55초, 흔들림 1.3배). 막음과 패리의 불꽃은 닿은 점 그대로입니다.' }
];
/* The rows: a light blow, the two hard ones, an uppercut under the chin (the inside uppercut of the skill ladder, the one
   that comes straight up: there it is the other man who is struck), a hook to the liver, and a knockdown. */
const ROWS = [
  ['hit-jab', '잽 · 가벼운 타격'],
  ['hit-cross', '스트레이트'],
  ['hit-hook', '훅', -1.05], // (seen from behind the man it lands on, so that the way it goes is across the picture)
  ['upperIn@3', '어퍼컷 · 턱'],
  ['body-liver', '리버 훅 · 몸통', 2.4], // (from his open side: from the catalogue's 1.3, close on him, the other man's back is in the way of what comes off him)
  ['down-back', '다운']
].map(([id, name, yaw]) => {
  const entry = [...DEFENSE, ...LADDER, ...BODYSHOTS].find(e => e.id === id);
  return Object.assign({}, entry, { name, view: { yaw: yaw ?? entry.view.yaw, pitch: entry.view.pitch } });
});

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
        `<article class="card" data-entry="${entry.id}" data-version="${v.id}"><div class="stage"></div><div class="info"><h3>${v.name}</h3><div class="stats">충격량 <b data-blow>–</b> N·s · 입자 <b data-beads>–</b></div><div class="stats">${v.id === 'final' ? '파문 <b data-head>–</b> s' : '흰 번쩍임 <b data-head>–</b> s'}</div></div></article>`
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
    // (the struck man in white, as the blow was drawn before)
    white = paletteArray(manifest.palette.map(() => 0xffffff)),
    mats = new Float32Array(NAMES.length * 12),
    ink = new Float32Array(rgb(manifest.palette[0]));
  let speed = 1,
    last = 0,
    ground = new Float32Array(12);

  const cells = [...document.querySelectorAll('.card')].map(el => {
    const entry = ROWS.find(e => e.id === el.dataset.entry),
      version = el.dataset.version,
      seed = 7 + ROWS.indexOf(entry),
      fx = createFx(() => cell.rnd()),
      // (what a blow throws off each man, apart from the rest: it is kept off his own silhouette, and only his)
      motes = [0, 1].map(() => {
        const m = createFx(() => cell.rnd());
        return { fx: m, mesh: R.mesh(m.rows, 0, true) };
      }),
      cell = { entry, version, el, stage: el.querySelector('.stage'), blow: el.querySelector('[data-blow]'), beads: el.querySelector('[data-beads]'), head: el.querySelector('[data-head]'), fx, mesh: R.mesh(fx.rows, 0, true), motes, bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)], seed, rnd: dice(seed), bout: null, t: 0, acc: 0, shake: 0, ripples: [null, null], whites: [0, 0], struck: entry.id.includes('@') ? 1 : 0, cam: { target: [entry.id.includes('@') ? 1.2 : -0.45, 1.3, 0], yaw: entry.view.yaw, pitch: 0.14, dist: 2.9 } };
    cell.bout = freshBout(entry);
    return cell;
  });

  function tick(cell) {
    const { entry, version } = cell;
    if (cell.t > 0 && Math.round(cell.t / DT) % Math.round(entry.loop / DT) === 0) (cell.bout = freshBout(entry)), (cell.t = 0), (cell.rnd = dice(cell.seed)), (cell.ripples = [null, null]), (cell.whites = [0, 0]);
    const bout = cell.bout,
      [a, b] = bout.fighters;
    step(bout, drive(entry, bout, cell.t, DT), DT);
    cell.t += DT;
    b.hp = 1000;
    if (!entry.hurt) a.hp = 1000;
    // (the white of before went off on the bout's own clock, as the bout kept it)
    cell.whites = cell.whites.map(w => Math.max(0, w - DT));
    for (const e of bout.events) {
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85),
          struck = bout.fighters[e.on];
        let n;
        if (version === 'final') {
          // as the game draws it: from the far side of what it struck, and a ripple through him from where it landed
          n = blow(cell.motes[e.on].fx, e, struck);
          cell.ripples[e.on] = rippleOf(e, struck);
          cell.head.textContent = cell.ripples[e.on].last.toFixed(2);
        } else {
          // as it was drawn before: the sparks where the glove met him, and he goes white
          cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
          cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
          n = Math.round(5 + 12 * k) + Math.round(3 + 8 * k);
          cell.whites[e.on] = 0.07;
          cell.head.textContent = '0.07';
        }
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
        cell.blow.textContent = String(Math.round(e.J));
        cell.beads.textContent = String(n);
      } else if (e.type === 'block' || e.type === 'parry') (met(cell.fx, e), (cell.shake = e.type === 'parry' ? 2 : 1));
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
    for (const m of cell.motes) m.mesh.update(m.fx.rows, m.fx.update(elapsed));
    // each man's ripple, if one is going through him: held to the part it landed on, wherever that is now
    const waves = [a, b].map((f, i) => {
      const r = cell.ripples[i];
      if (!r) return null;
      r.age += elapsed;
      return rippleRow(r, f) || (cell.ripples[i] = null);
    });
    layers.push(
      { mesh: cell.mesh, palette: palettes[0], mask: 0.6 },
      { mesh: meshes.boxer, bones: cell.bones[0], palette: cell.whites[0] > 0 ? white : palettes[0], mask: 1, wave: waves[0], silhouette: 1 },
      { mesh: meshes.boxer, bones: cell.bones[1], palette: cell.whites[1] > 0 ? white : palettes[1], mask: 1, wave: waves[1], silhouette: 2 },
      /* what a blow throws off each man is never seen over him, in front of him or behind: where it crosses his own outline
         it is not there, so the first of it to be seen is at his edge, as if it came out from behind him */
      ...cell.motes.map((m, i) => ({ mesh: m.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
    );
    const ease = 1 - Math.exp(-elapsed * 4),
      [hit, other] = cell.struck ? [b, a] : [a, b];
    // framed on the man who is hit, a little behind him: the room is on the far side of him, for what the blow throws off
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
    reset: () => cells.forEach(cell => ((cell.bout = freshBout(cell.entry)), (cell.t = 0), (cell.acc = 0), (cell.ripples = [null, null]), (cell.whites = [0, 0]), (cell.rnd = dice(cell.seed)))),
    advance: sec => cells.forEach(cell => { for (let i = 0; i < Math.round(sec / DT); i++) (tick(cell), cell.fx.update(DT, [], 22), cell.motes.forEach(m => m.fx.update(DT)), cell.ripples.forEach(r => r && (r.age += DT))); }),
    renderer: R,
    scene,
    FX
  };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
