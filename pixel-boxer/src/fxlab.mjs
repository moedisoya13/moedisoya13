/* How a blow is drawn, before and as decided (docs/moves-plan-6.md §2.6): two columns, the same exchange frame for frame.
   "전" is the blow as it was drawn before, kept on this page alone: its sparks thrown from where the glove met him, and the
   struck man white for 0.07 s (his palette made white for so long: the renderer has no flash any more). "확정" is the blow as
   the game now draws it (render/blow.mjs): the same sparks from where the line of the blow comes out of his far side, along
   the way the glove was going, never seen over him (an fx of his own drawn `outside` his silhouette), and a ripple through
   him from where it landed in place of the white; the motes in their own colours, as they always were. A knockdown's blow is
   its own (docs/moves-plan-6.md §2.4B, §2.4C, §2.4D): lava in place of its motes (globs of it, each in three colours of heat,
   hottest at its head, cooling as they fall and lying cooling where they come down on the canvas, and flickering embers),
   and where he comes down on the canvas a second ripple through him and a ring through the canvas; all of it live, at the
   true speed, and then, once it has all gone out, the replay the game shows (src/replay.mjs): cut to a closer camera, slowly
   from the press of the punch to him falling away, and cut back. Every card is a real bout from the catalogue
   (src/defense.mjs, src/ladder.mjs, src/bodyshots.mjs), looped; the two cards of a row are the same exchange, frame for
   frame (one that has played its loop waits for the other, held in its replay, so that they start again together). A card
   is drawn between its last two steps, and a replay between the steps it kept, so neither shows a picture twice running. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, met, lavaOf, rippleOf, rippleRow, scaleOf, FX, fallOf, landed, landRipple, groundOf, groundRow, quietOf } from './render/blow.mjs';
import { captureBout, blend, createReplay, distOf } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { floor } from './render/floor.mjs';
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
  { id: 'final', name: '확정', note: '같은 색 입자(색은 그대로, 속도는 5% 빠르게, 수·굵기·수명은 데미지에 비례)가 타격선이 맞은 몸을 빠져나가는 반대쪽 면에서 시작해, 주먹이 가던 방향(위아래 포함)으로 날아갑니다. 맞은 선수의 윤곽 안에서는 보이지 않아 윤곽에서 처음 나타납니다. 흰 번쩍임 대신 닿은 점에서 파문이 빛 없이 몸(머리 포함)에 퍼집니다: 초속 3 m, 0.4초(다운은 0.55초, 흔들림 1.3배), 흔들림과 폭은 데미지에 비례. 다운은 제 속도로 끝까지 쓰러지고, 입자 대신 용암 덩이와 불티를 빠르게 두 번 잇달아(0.1초 간격; 덩이는 머리가 가장 뜨겁고 몸과 꼬리가 한 단계씩 식은 세 색, 떨어지며 숯빛 껍질이 불씨를 감싸 검게 식고 캔버스에 닿으면 붙어서 식음; 불티는 깜빡이며 떠다니다 주황에서 꺼짐), 착지의 두 번째 파문과 바닥의 고리 파문; 이펙트가 다 꺼진 뒤 조감 또는 옆에서 다가간 슬로 리플레이(주먹을 누른 때부터 쓰러지기 전까지). 막음과 패리의 불꽃은 닿은 점 그대로입니다.' }
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
        `<article class="card" data-entry="${entry.id}" data-version="${v.id}"><div class="stage"></div><div class="info"><h3>${v.name}</h3><div class="stats">충격량 <b data-blow>–</b> N·s · 데미지 <b data-dmg>–</b></div><div class="stats">${v.id === 'final' && entry.fall ? '용암 덩이 <b data-globs>–</b>개 · 불티 <b data-embers>–</b>개씩 두 번(<b data-gap>–</b> s 뒤) · 덩이 굵기 <b data-thick>–</b> cm' : `입자 <b data-beads>–</b>${v.id === 'final' ? '개 · 굵기 <b data-thick>–</b> cm' : '개 · 굵기 <b>2.4</b> cm'}`}</div><div class="stats">${v.id === 'final' ? '파문 <b data-head>–</b> s · 흔들림 <b data-sway>–</b> cm · 폭 <b data-wide>–</b> cm' : '흰 번쩍임 <b data-head>–</b> s'}</div></div></article>`
      );
    lab.append(section);
  }
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
      cell = { entry, version, el, stage: el.querySelector('.stage'), blow: el.querySelector('[data-blow]'), beads: el.querySelector('[data-beads]'), head: el.querySelector('[data-head]'), fx, mesh: R.mesh(fx.rows, 0, true), motes, bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)], seed, rnd: dice(seed), bout: null, t: 0, acc: 0, shake: 0, ripples: [null, null], whites: [0, 0], falls: [null, null], ground: null, replay: null, again: null, shown: null, was: null, now: null, struck: entry.id.includes('@') ? 1 : 0, cam: { target: [entry.id.includes('@') ? 1.2 : -0.45, 1.3, 0], yaw: entry.view.yaw, pitch: 0.14, dist: 2.9 } };
    cell.bout = freshBout(entry);
    cell.was = cell.now = captureBout(cell.bout);
    // (a knockdown's, as the game shows it: its replay once everything has gone out, src/replay.mjs)
    if (version === 'final' && entry.fall) cell.replay = createReplay({ yaw: () => cell.cam.yaw });
    return cell;
  });

  // a card from the start of its loop: a fresh bout, the same dice, nothing in the air
  function restart(cell) {
    cell.bout = freshBout(cell.entry);
    cell.t = 0;
    cell.rnd = dice(cell.seed);
    cell.ripples = [null, null];
    cell.whites = [0, 0];
    cell.falls = [null, null];
    cell.ground = cell.shown = cell.again = null;
    if (cell.replay) cell.replay.reset();
    cell.was = cell.now = captureBout(cell.bout);
  }
  /* May a card take a step? Not at the end of its loop until the other card of its row is there too (it may be behind, in
     a slow motion the other has not got): then the two start again together. */
  function due(cell) {
    if (cell.t < cell.entry.loop - 1e-9) return true;
    const row = cells.filter(c => c.entry === cell.entry);
    if (row.some(c => c.t < c.entry.loop - 1e-9)) return false;
    row.forEach(restart);
    return true;
  }
  function tick(cell) {
    const { entry, version } = cell,
      bout = cell.bout,
      [a, b] = bout.fighters;
    step(bout, drive(entry, bout, cell.t, DT), DT);
    cell.t += DT;
    // (the step before and this one: what is drawn lies between them)
    cell.was = cell.now;
    cell.now = captureBout(bout);
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
          const r = cell.ripples[e.on];
          // (a knockdown's lava: how many globs and embers, and how thick a glob)
          const lava = lavaOf(e);
          cell.el.querySelector('[data-thick]').textContent = ((lava ? lava.width : Math.max(FX.motes.thin, FX.motes.width * scaleOf(e))) * 100).toFixed(1);
          // (each volley's, and how long after the first the second leaves)
          if (lava && cell.el.querySelector('[data-globs]')) (cell.el.querySelector('[data-globs]').textContent = String(lava.volleys[0].globs)), (cell.el.querySelector('[data-embers]').textContent = String(lava.volleys[0].embers)), (cell.el.querySelector('[data-gap]').textContent = lava.gap.toFixed(2));
          cell.el.querySelector('[data-sway]').textContent = (r.strength * r.sway * 100).toFixed(1);
          cell.el.querySelector('[data-wide]').textContent = (r.width * 100).toFixed(0);
          // (a knockdown: watched until he comes down on the canvas)
          if (fallOf(e)) cell.falls[e.on] = fallOf(e);
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
        cell.el.querySelector('[data-dmg]').textContent = (e.damage ?? e.J * 0.035).toFixed(1);
        if (cell.beads) cell.beads.textContent = String(n);
      } else if (e.type === 'block' || e.type === 'parry') (met(cell.fx, e), (cell.shake = e.type === 'parry' ? 2 : 1));
    }
    // (where a knocked-down man first comes down on the canvas: a second ripple through him, and a ring through the canvas)
    cell.falls.forEach((fall, i) => {
      const at = landed(fall, bout.fighters[i]);
      if (at) (cell.ripples[i] = landRipple(fall, bout.fighters[i], at)), (cell.ground = groundOf(fall, at));
    });
    // (the step kept for its replay, and whether that starts: once all of this has gone out)
    if (cell.replay) cell.replay.watch(bout, DT, quietOf(cell.motes.map(m => m.fx), cell.ripples, cell.ground));
    cell.shake *= 0.82;
  }
  /* A card's replay as it plays (src/replay.mjs): the picture it shows `elapsed` seconds of real time on, what its steps
     threw thrown again as it comes to them into a set of its own, in its own time; from the camera it cut to. */
  function replayScene(cell, elapsed, rect) {
    const r = cell.replay,
      shown = r.next(elapsed);
    if (!cell.again || r.started) {
      const set = () => {
        const f = createFx(dice(cell.seed + 99));
        return { fx: f, mesh: R.mesh(f.rows, 0, true) };
      };
      cell.again = { motes: [set(), set()], ripples: [null, null] };
    }
    const A = cell.again,
      time = r.moved;
    for (const k of r.crossed) for (const e of k.events) if (e.type === 'hit') (blow(A.motes[e.on].fx, e, k.men[e.on]), (A.ripples[e.on] = rippleOf(e, k.men[e.on])));
    const layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
      shadows = [];
    shown.men.forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(0, shadows, 22));
    for (const m of A.motes) m.mesh.update(m.fx.rows, m.fx.update(time));
    const waves = shown.men.map((f, i) => {
      const w = A.ripples[i];
      if (!w) return null;
      w.age += time;
      return rippleRow(w, f) || (A.ripples[i] = null);
    });
    layers.push(
      { mesh: cell.mesh, palette: palettes[0], mask: 0.6 },
      { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1, wave: waves[0], silhouette: 1 },
      { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, wave: waves[1], silhouette: 2 },
      ...A.motes.map((m, i) => ({ mesh: m.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
    );
    const v = r.view;
    return { camera: { target: v.target, yaw: v.yaw, pitch: v.pitch, dist: distOf(v, cell.cam.dist, rect.w / rect.h, r.progress) }, layers };
  }

  function theme() {
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  }
  /* A card's picture as its bout stands (drawn k of the way from its step before the last to its last), what is in the air
     moved on by `elapsed` seconds: the frame R.cell takes. */
  function scene(cell, elapsed, k = 1) {
    const [a, b] = blend(cell.was, cell.now, k).men,
      shadows = [];
    if (cell.ground) cell.ground.age += elapsed;
    const ring = groundRow(cell.ground) || (cell.ground = null),
      layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5, ground: ring }];
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
      // (the shadows on the canvas ride the ring through it, never lit by it)
      { mesh: cell.mesh, palette: palettes[0], mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] },
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
    // (and a knockdown's followed down to the canvas, between his head and his hips, for where he comes down on it)
    if (cell.entry.fall) cell.cam.target[1] += (Math.min(1.3, (hit.points.head[1] + hit.points.hips[1]) / 2 + 0.15) - cell.cam.target[1]) * ease;
    const jolt = cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
    return { camera: cell.cam, layers, shake: jolt };
  }
  function frame(now) {
    draw(globalThis.__lab.hold ? 0 : Math.min(0.1, (now - last) / 1000 || 0) * speed, now);
    last = now;
    requestAnimationFrame(frame);
  }
  // one picture of every card on screen, `elapsed` seconds on
  function draw(elapsed, now) {
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
      const rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) };
      // (a knockdown's replay, while it plays: its bout is not stepped, and what is in the air live waits as it was)
      if (cell.replay && cell.replay.playing) {
        R.cell(rect, replayScene(cell, elapsed, rect));
        continue;
      }
      // (its own time: the real time, as it happens)
      cell.acc += elapsed;
      let steps = 0;
      while (cell.acc >= DT && steps++ < 6) {
        if (!due(cell)) {
          cell.acc = 0;
          break;
        }
        cell.acc -= DT;
        tick(cell);
        if (cell.replay && cell.replay.playing) break;
      }
      if (steps > 6) cell.acc = 0;
      // (held through the moment of a blow where it is; else between its last two steps, by how far it is to the next)
      R.cell(rect, scene(cell, elapsed, cell.bout.stop > 0 ? 1 : Math.min(1, cell.acc / DT)));
    }
    R.end({ hall: ground, ink });
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  /* (for looking at the page from a script: every card stepped on by so many seconds at once, the effects with it; one
     picture drawn so many seconds on, frame(sec), as the page draws them (with hold set, the page's own pictures stand
     still between); and the renderer and a card's frame, scene(cell, 0), to draw it apart and measure it) */
  globalThis.__lab = {
    cells,
    hold: false,
    reset: () => cells.forEach(cell => (restart(cell), (cell.acc = 0))),
    advance: sec => cells.forEach(cell => { for (let i = 0; i < Math.round(sec / DT); i++) if (due(cell) && !(cell.replay && cell.replay.playing)) (tick(cell), cell.fx.update(DT, [], 22), cell.motes.forEach(m => m.fx.update(DT)), cell.ripples.forEach(r => r && (r.age += DT)), cell.ground && (cell.ground.age += DT)); }),
    frame: sec => draw(sec, performance.now()),
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
