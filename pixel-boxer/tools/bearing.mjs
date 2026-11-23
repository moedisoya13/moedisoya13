#!/usr/bin/env node
/* The eight bearings, measured (docs/bearing-system-plan.md §2, §5, §9.2; the cells and bands: src/game/bearing.mjs): what
   every move that takes a man round the other does today, in cells, each fought the way the catalogue fights its card.
     node tools/bearing.mjs              each move at each grade: the degrees he went round from the line the other man faced
                                         him on as it started, and in cells (over 45), how long it took, the distance and its
                                         band at the start and the end, the bearing the other man let him get to at the most
                                         (signed: + round to his lead hand), the window (seconds that bearing was more than a
                                         cell round, past 22.5 degrees; and past 67.5, the side), and his own facing error at
                                         the most; a move that goes round and round, how many degrees a second as well
     node tools/bearing.mjs --reface     how long a man standing (or with his guard up, just pressing a straight or a jab, or
                                         stunned for 0.5 s) takes to face again a man put suddenly 45, 90, 135 or 180 degrees
                                         round him: to within a cell (22.5) and to within 5 degrees, grade by grade
     node tools/bearing.mjs --worth [--step 7.5] [--levels 3,4m,5m]
                                         what each bearing is worth with nobody turning (the bout's turnRate held at 0): his
                                         punch at a man standing there (5.1), and that man's punch at him, his guard up (5.2);
                                         every 22.5 degrees and pros on both sides unless told otherwise
     node tools/bearing.mjs --walk       walking round him with the stick all the way: every grade, at 1.0 and 1.25 m, the
                                         guard down and up: how fast round (m/s, degrees a second, seconds a cell), degrees a
                                         step, and how far round the other man let him get
     node tools/bearing.mjs --write      the moves (with each path), the refacing times and the worth (every 22.5 degrees,
                                         pros), written to src/bearing.data.mjs, which the catalogue draws from
     node tools/bearing.mjs --json       everything, as JSON
   Every number is the bout's: a fixed step of a sixtieth of a second, the same script the same bout every time. Seconds are
   on the bout's clock (a moment held at a blow is not counted). */
import { writeFileSync } from 'node:fs';
import { step, createBout, settle, RULES } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { FOOTWORK, ENTRY, WAVING, SHIFTING, walkRound, WALK_HOLD } from '../src/ladder.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import { sole, UP, DOWN } from '../src/measure.mjs';
import { createTracker, track, begin, bearingOf, cellOf, bandOf, BANDS } from '../src/game/bearing.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const r1 = x => Math.round(x * 10) / 10,
  r2 = x => Math.round(x * 100) / 100,
  r3 = x => Math.round(x * 1000) / 1000;

/* ---- the moves: each a card's script, which man goes round which, and the step it starts and ends on. ctx: { bout, a (the man
   going round), b (the other), t (the loop's clock), events, tick, own (what the row keeps) }. `mark`: the moment its numbers
   are taken at, if not the end (the shift: as the step comes down); `tail`: seconds after the end that are still watched (the
   other man still turning). `rate`: a move that goes round and round, measured in degrees a second (from `skip` seconds in). */
const byId = id => [...FOOTWORK, ...ENTRY, ...WAVING, ...SHIFTING].find(e => e.id === id);
const doing = (name, ctx) => !!ctx.a.action && ctx.a.action.name === name;
const actionRow = (id, name, en) => ({
  id,
  name,
  en,
  levels: LEVELS,
  entry: lv => byId(`${id}@${lv}`),
  start: ctx => doing(id, ctx),
  end: ctx => !doing(id, ctx)
});
export const ROWS = [
  {
    id: 'side',
    name: '사이드 스텝',
    en: 'Lateral step',
    levels: LEVELS,
    entry: lv => byId(`side@${lv}`),
    // (the script asks for a place 0.5 m to his right at 0.2 s: done once he is there and has stopped)
    start: ctx => ctx.t >= 0.2 - 1e-9,
    end: ctx => Math.hypot(ctx.a.z - 0.5, ctx.a.x) < 0.03 && Math.hypot(ctx.a.x - ctx.a.px, ctx.a.z - ctx.a.pz) / DT < 0.1,
    tail: 0.4
  },
  {
    id: 'circle',
    name: '서클링',
    en: 'Circling',
    levels: LEVELS,
    entry: lv => byId(`circle@${lv}`),
    // (the script takes him round to 43 degrees and back over five seconds: the first quarter, out to the far end)
    start: () => true,
    end: ctx => ctx.t >= 1.25 - 1e-9,
    time: 'end',
    tail: 0.3
  },
  {
    id: 'walk',
    name: '걸어서 돌기',
    en: 'Walking round him',
    levels: LEVELS,
    entry: lv => walkRound(lv),
    start: ctx => ctx.t >= WALK_HOLD[0] - 1e-9,
    end: ctx => ctx.t >= WALK_HOLD[1] - 1e-9,
    tail: 0.5,
    rate: { skip: 0.3 }
  },
  {
    id: 'dashSide',
    name: '측면 대시',
    en: 'Dash to the side',
    levels: LEVELS,
    entry: lv => byId(`dashSide@${lv}`),
    start: ctx => ctx.events.some(e => e.type === 'dash' && e.who === 0),
    end: ctx => !doing('dash', ctx),
    tail: 0.5
  },
  {
    id: 'turn',
    name: '따라 돌기',
    en: 'Turning to face',
    levels: LEVELS,
    entry: lv => byId(`turn@${lv}`),
    // (here the other man goes round him, and it is his facing that is measured: the bearing the other man gets to is his error)
    mover: 1,
    start: () => true,
    end: ctx => ctx.t >= 5 - 1e-9,
    time: 'end',
    tail: 0
  },
  actionRow('hopPivot', '피봇 아웃', 'Pivot out'),
  actionRow('hopCircle', '서클 아웃', 'Circle out'),
  actionRow('duckIn', '더킹 대시', 'Duck in'),
  {
    id: 'shift',
    name: '타이슨 시프트',
    en: 'The Tyson shift',
    levels: ['4m', '5m'],
    entry: lv => byId(`shift@${lv}`),
    start: ctx => ctx.events.some(e => e.type === 'shift' && e.who === 0),
    // (its numbers as the step comes down; and it is over once he is back in his stance)
    mark: ctx => !!ctx.a.shift && ctx.a.shift.landed,
    end: ctx => !ctx.a.shift,
    tail: 0.3
  },
  {
    id: 'wave',
    name: '파도',
    en: 'The wave',
    levels: ['4m', '5m'],
    entry: lv => byId(`wave@${lv}`),
    start: ctx => doing('wave', ctx),
    end: ctx => !doing('wave', ctx),
    tail: 0.3,
    rate: { skip: 0.5 }
  },
  {
    id: 'slick',
    name: '파도 · 슬릭백',
    en: 'The wave, slick back',
    levels: ['4m', '5m'],
    entry: lv => byId(`slick@${lv}`),
    start: ctx => doing('wave', ctx),
    end: ctx => !doing('wave', ctx),
    tail: 0.3,
    rate: { skip: 0.5 }
  }
];

/* One move at one grade, fought as the catalogue fights the card (the other man kept standing; the boxer too). -> the numbers
   (see the head of this file) and what was seen: the man's centre in the frame of the line the other man faced him on as it
   started ([t, x, y]: x metres round to that man's lead hand, y ahead of him), where each of his feet came down, and which way
   the other man was facing ([t, degrees off that line, + to his left]). */
export function measure(row, lv) {
  const entry = row.entry(lv),
    mover = row.mover || 0,
    bout = freshBout(entry),
    a = bout.fighters[mover],
    b = bout.fighters[1 - mover],
    tr = createTracker(),
    loop = Math.round(entry.loop / DT),
    seen = [],
    feet = [],
    up = { Left: false, Right: false };
  let mv = null,
    started = null,
    marked = null,
    ended = null,
    line = 0;
  const frame = (x, z) => {
    // (a point on the canvas in the frame of the line he faced: round to his lead hand, ahead of him)
    const dx = x - b.x,
      dz = z - b.z;
    return [dx * Math.cos(line) - dz * Math.sin(line), dx * Math.sin(line) + dz * Math.cos(line)];
  };
  const snap = () => ({ t: bout.t - started, turned: mv.turned, d: Math.hypot(a.x - b.x, a.z - b.z), peak: mv.peak, window: mv.window, side: mv.side, error: mv.error });
  for (let tick = 0; tick < loop; tick++) {
    const t = ((tick + 1) % loop) * DT;
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 1000);
    track(tr, bout);
    const ctx = { bout, a, b, t: t || entry.loop, tick, events: bout.events };
    if (!mv && row.start(ctx)) (mv = begin(tr, bout, mover)), (started = bout.t), (line = b.yaw);
    if (!mv) continue;
    if (!marked && row.mark && row.mark(ctx)) marked = snap();
    if (!ended && bout.t - started > 1e-9 && row.end(ctx)) ended = snap();
    const [x, y] = frame(a.x, a.z);
    seen.push([bout.t - started, x, y, wrap(b.yaw - line) * DEG, mv.turned]);
    // (a foot that has left the canvas and comes back down on it: where its ball came down)
    for (const side of ['Left', 'Right']) {
      const h = sole(a.pose.at, side);
      if (h > UP) up[side] = true;
      else if (up[side] && h < DOWN) {
        up[side] = false;
        const p = toWorld(a.place, a.pose.at[side + 'ToeBase'], a.pose.stretch);
        feet.push([bout.t - started, ...frame(p[0], p[2]), side === 'Left' ? 'L' : 'R']);
      }
    }
    if (ended && bout.t - started >= ended.t + (row.tail || 0) - 1e-9) break;
  }
  if (!mv) throw new Error(`${row.id}@${lv}: the move never started`);
  if (!ended) ended = snap();
  const after = snap(),
    at = marked || ended,
    going = seen.filter(s => s[0] <= at.t + 1e-9),
    // (how long it took him there: until he was within a degree of where its numbers are taken; or the whole of it)
    there = row.time === 'end' || row.rate ? at.t : (going.find(s => Math.abs(s[4] - at.turned) < 1) || going[going.length - 1])[0],
    out = {
      id: row.id,
      level: lv,
      turned: r1(at.turned),
      cells: r2(at.turned / 45),
      most: r1(seen.filter(s => s[0] <= ended.t + 1e-9).reduce((m, s) => (Math.abs(s[4]) > Math.abs(m) ? s[4] : m), 0)),
      time: r3(there),
      over: r3(ended.t),
      d: [r2(mv.from.d), r2(at.d)],
      band: [bandOf(mv.from.d), bandOf(at.d)],
      peak: r1(after.peak),
      window: r2(after.window),
      side: r2(after.side),
      error: r1(after.error),
      end: r1(seen[seen.length - 1][3])
    };
  // (round and round: degrees a second, fitted from `skip` seconds in to the end, and the fastest over a tenth of a second)
  const un = seen.filter(s => s[0] <= ended.t + 1e-9).map(s => [s[0], s[4]]);
  if (row.rate) {
    const fit = un.filter(([t]) => t >= row.rate.skip),
      n = fit.length,
      mt = fit.reduce((s, p) => s + p[0], 0) / n,
      ma = fit.reduce((s, p) => s + p[1], 0) / n,
      slope = fit.reduce((s, p) => s + (p[0] - mt) * (p[1] - ma), 0) / fit.reduce((s, p) => s + (p[0] - mt) ** 2, 0);
    out.rate = r1(slope);
    out.perCell = r2(45 / Math.abs(slope));
    out.speed = r2((Math.abs(slope) / DEG) * mv.from.d);
  }
  let fastest = 0;
  for (let i = 6; i < un.length; i++) fastest = Math.max(fastest, Math.abs(un[i][1] - un[i - 6][1]) / (un[i][0] - un[i - 6][0] || 1));
  out.fastest = Math.round(fastest);
  out.steps = feet.filter(f => f[0] <= ended.t + 1e-9).length;
  return Object.assign(out, { seen, feet, mark: r3(at.t) });
}

export const table = (rows = ROWS) => rows.flatMap(row => row.levels.map(lv => measure(row, lv)));

/* ---- facing again: a man standing in his guard, the other man put down suddenly `beta` degrees round him (+: to his lead hand)
   at 1.25 m, and how long until the other man is back within a cell of his front (22.5 degrees) and within 5. state: 'stand',
   'guard' (his guard held up), 'cross' or 'jab' (pressed on that step), 'stun' (stunned 0.5 s, as an 85 N·s blow does). */
export const STATES = ['stand', 'guard', 'cross', 'jab', 'stun'];
export function reface(lv, state, beta) {
  const entry = { id: 'reface', loop: 9, me: () => HOME, setup: b => (b.fighters[0].skills = { all: lv }) },
    bout = freshBout(entry),
    [f, other] = bout.fighters,
    controls = () => [{ move: [0, 0], cover: state === 'guard' }, { move: [0, 0] }];
  // (stood a while first, in front of each other, so his feet and his guard are settled)
  for (let i = 0; i < 36; i++) step(bout, controls(), DT), (other.hp = f.hp = 1000);
  const th = f.yaw + (beta * Math.PI) / 180;
  other.x = f.x + 1.25 * Math.sin(th);
  other.z = f.z + 1.25 * Math.cos(th);
  other.yaw = Math.atan2(f.x - other.x, f.z - other.z);
  if (state === 'stun') f.stun = 0.5;
  const t0 = bout.t,
    out = { cell: null, five: null };
  for (let i = 0; i < 180 && out.five === null; i++) {
    const c = controls();
    if (i === 0 && state === 'cross') c[0].power = true;
    if (i === 0 && state === 'jab') c[0].jab = true;
    step(bout, c, DT);
    other.hp = f.hp = 1000;
    const off = Math.abs(bearingOf(other, f));
    if (out.cell === null && off < 22.5) out.cell = r2(bout.t - t0);
    if (off < 5) out.five = r2(bout.t - t0);
  }
  return out;
}
export const refaceTable = (levels = LEVELS, states = STATES, angles = [45, 90, 135, 180]) =>
  Object.fromEntries(states.map(s => [s, Object.fromEntries(levels.map(lv => [lv, Object.fromEntries(angles.map(be => [be, reface(lv, s, be)]))]))]));

/* ---- what a bearing is worth, with nobody turning (§5): the bout's turnRate held at 0 while it is fought. by 'him': the man
   whose frame it is throws `punch` at a man standing `beta` degrees round him (5.1: does it reach him?); by 'me': the man
   standing there throws it at him, his guard up (5.2: does it get past it?). Each from the punch's own distance, pros on both
   sides (or `level`). -> { type: hit | graze | block | whiff | none, J, part, margin } */
export const WORTH_PUNCHES = ['jab', 'cross', 'hook', 'upper', 'hookR', 'hookBody', 'crossBody'];
export const WORTH_RANGE = { jab: 0.95, cross: 0.95, hook: 0.85, upper: 0.8, hookR: 0.8, hookBody: 0.76, crossBody: 0.95 };
export function worth(punch, by, beta, o = {}) {
  const level = o.level || '3',
    bout = createBout(7, { skills: [{ all: level }, { all: level }] }),
    // (the man throwing is the first; the man whose frame it is stands at the middle facing +x)
    [thrower, target] = bout.fighters,
    frameMan = by === 'him' ? thrower : target,
    other = by === 'him' ? target : thrower,
    psi = Math.PI / 2,
    th = psi + (beta * Math.PI) / 180,
    d = WORTH_RANGE[punch];
  frameMan.x = 0;
  frameMan.z = 0;
  frameMan.yaw = psi;
  other.x = d * Math.sin(th);
  other.z = d * Math.cos(th);
  other.yaw = Math.atan2(-other.x, -other.z);
  for (const f of bout.fighters) f.stands = true;
  settle(bout);
  const turn = RULES.turnRate;
  RULES.turnRate = 0;
  try {
    for (let i = 0; i < 100; i++) {
      const c = [{ move: [0, 0] }, { move: [0, 0], cover: by === 'me' }];
      if (i === 30) punch === 'jab' ? (c[0].jab = true) : (c[0].power = punch);
      step(bout, c, DT);
      for (const f of bout.fighters) f.hp = 1000;
      const e = bout.events.find(e => e.who === 0 && ['hit', 'graze', 'block', 'whiff'].includes(e.type));
      if (e) return { type: e.type, J: e.J === undefined ? null : r1(e.J), part: e.part || null, margin: e.margin === undefined ? null : r3(e.margin) };
    }
    return { type: 'none', J: null, part: null, margin: null };
  } finally {
    RULES.turnRate = turn;
  }
}
export function worthTable(o = {}) {
  const stepDeg = o.step || 22.5,
    angles = [];
  for (let be = -180 + stepDeg; be <= 180 + 1e-9; be += stepDeg) angles.push(r1(be));
  // (each level: the bearings, and for each of the two, each punch's outcome at each of them, in that order)
  return Object.fromEntries((o.levels || ['3']).map(lv => [lv, Object.assign({ angles }, Object.fromEntries(['him', 'me'].map(by => [by, Object.fromEntries(WORTH_PUNCHES.map(p => [p, angles.map(be => worth(p, by, be, { level: lv }))]))])))]));
}

/* ---- walking round him: every grade, at 1.0 and 1.25 m, the guard down and up */
export function walk(lv, r, cover) {
  const row = Object.assign({}, ROWS.find(x => x.id === 'walk'), { entry: l => walkRound(l, { r, cover }) }),
    m = measure(row, lv);
  return { level: lv, r, cover: !!cover, speed: m.speed, rate: m.rate, perCell: m.perCell, perStep: r1(m.turned / Math.max(1, m.steps)), steps: m.steps, peak: m.peak, error: m.error, d: m.d };
}
export const walkTable = (levels = LEVELS) => levels.flatMap(lv => [1.0, 1.25].flatMap(r => [false, true].map(c => walk(lv, r, c))));

// ---- printed
const label = lv => LEVEL[lv].label;
const sign = x => (x > 0 ? '+' : '') + x;
const bandName = k => BANDS[k].name;
function printMoves(rows) {
  console.log('move          grade  turned (deg)  cells   time s  over s  m: start -> end (band)        his peak  window  side   my error  deg/s (fitted, fastest)');
  for (const m of rows) {
    const row = ROWS.find(r => r.id === m.id);
    console.log(
      `${row.name.padEnd(10)}  ${label(m.level).padEnd(4)}  ${sign(m.turned).padStart(7)} (${sign(m.most)})`.padEnd(38) +
        `${sign(m.cells).padStart(6)}  ${m.time.toFixed(2).padStart(6)}  ${m.over.toFixed(2).padStart(6)}  ${m.d[0].toFixed(2)} -> ${m.d[1].toFixed(2)} (${bandName(m.band[0])} -> ${bandName(m.band[1])})`.padEnd(46) +
        `${sign(m.peak).padStart(8)}  ${m.window.toFixed(2).padStart(6)}  ${m.side.toFixed(2).padStart(4)}  ${String(m.error).padStart(8)}  ${m.rate !== undefined ? `${sign(m.rate)} (${m.fastest}), a cell ${m.perCell} s` : m.fastest}`
    );
  }
  console.log('(turned: at the end of the move, the shift as the step comes down; in brackets the furthest round on the way. Bearings + round to his lead hand.)');
}
function printReface(t) {
  for (const [state, byLevel] of Object.entries(t)) {
    console.log(`\n${state}: seconds until he is within 22.5 / 5 degrees of facing a man put down suddenly so far round him`);
    console.log('grade   ' + Object.keys(Object.values(byLevel)[0]).map(a => `${a} deg`.padEnd(14)).join(''));
    for (const [lv, row] of Object.entries(byLevel)) console.log(label(lv).padEnd(8) + Object.values(row).map(x => `${x.cell ?? '-'} / ${x.five ?? '-'}`.padEnd(14)).join(''));
  }
}
const said = w => (w.type === 'hit' || w.type === 'graze' ? String(Math.round(w.J)) : w.type === 'block' ? (w.part && w.part !== 'glove' ? `blk-${w.part.slice(0, 2)}` : 'blk') : w.type === 'whiff' ? `- ${Math.round(w.margin * 100)}cm` : '?');
function printWorth(t) {
  for (const [lv, both] of Object.entries(t))
    for (const by of ['him', 'me']) {
      console.log(`\n${by === 'him' ? `5.1 his punch, not turning, at a man standing at each bearing (${label(lv)})` : `5.2 the punch of the man standing at each bearing, at him with his guard up (${label(lv)})`}: N·s, blk blocked (on what), - missed by`);
      console.log('punch     ' + both.angles.map(a => String(a).padStart(7)).join(''));
      for (const [p, row] of Object.entries(both[by])) console.log(p.padEnd(10) + row.map(w => said(w).padStart(7)).join(''));
    }
}
function printWalk(t) {
  console.log('grade  r m   guard  m/s round  deg/s   s a cell  deg a step  his peak  my error');
  for (const w of t) console.log(`${label(w.level).padEnd(5)}  ${w.r.toFixed(2)}  ${(w.cover ? 'up' : 'down').padEnd(5)}  ${String(w.speed).padStart(9)}  ${String(w.rate).padStart(6)}  ${String(w.perCell).padStart(8)}  ${String(w.perStep).padStart(10)}  ${String(w.peak).padStart(8)}  ${String(w.error).padStart(8)}`);
}

/* ---- the data the catalogue draws from: each move's numbers and its path, thinned to a point every few frames (so that every
   tenth of a second falls on one), the feet, the other man's facing; the refacing times; the worth every 22.5 degrees */
const thin = seen => {
  const n = seen.length,
    stride = [1, 2, 3, 6].find(s => n / s <= 64) || 6;
  return seen.filter((s, i) => i % stride === 0 || i === n - 1).map(s => [r3(s[0]), r3(s[1]), r3(s[2]), r1(s[3])]);
};
export function data(moves, refacing, worthOf) {
  return {
    moves: Object.fromEntries(
      ROWS.map(row => [
        row.id,
        {
          name: row.name,
          en: row.en,
          mover: row.mover || 0,
          levels: Object.fromEntries(
            moves
              .filter(m => m.id === row.id)
              .map(m => {
                const { seen, feet, ...num } = m;
                return [m.level, Object.assign(num, { path: thin(seen), feet: feet.map(f => [r3(f[0]), r3(f[1]), r3(f[2]), f[3]]) })];
              })
          )
        }
      ])
    ),
    reface: refacing,
    worth: worthOf
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2),
    flag = n => args.includes('--' + n),
    opt = n => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null),
    json = flag('json');
  if (flag('write') || (json && !flag('reface') && !flag('worth') && !flag('walk'))) {
    const moves = table(),
      refacing = refaceTable(),
      worthOf = worthTable();
    const d = data(moves, refacing, worthOf);
    if (json) console.log(JSON.stringify(Object.assign({ walk: walkTable() }, d)));
    else (printMoves(moves), printReface(refacing), printWorth(worthOf));
    if (flag('write')) {
      writeFileSync(
        new URL('../src/bearing.data.mjs', import.meta.url),
        `/* Written by node tools/bearing.mjs --write (docs/bearing-system-plan.md §2, §5, §8.1): for every move that takes a man round
   the other, at each grade, what it does in the eight bearings (src/game/bearing.mjs), fought as the catalogue fights its card:
   turned (degrees round from the line the other man faced him on as it started; cells: over 45), time (seconds to then; over:
   to the end of the move), d and band (at the start and then), peak (the bearing the other man let him get to, signed: + round
   to his lead hand), window and side (seconds past 22.5 and past 67.5 degrees), error (the most his own facing was off), rate
   and perCell (a move that goes round and round), and the path: [t, x, y, his facing] every few frames, x metres round to
   the other man's lead hand and y ahead of him in that line's frame, his facing in degrees off it (+ to his left), and the
   feet as they came down [t, x, y, foot]. reface: seconds until a man faces again within 22.5 / 5 degrees a man put down
   suddenly so far round him, by state and grade. worth: what each bearing is worth with nobody turning, pros on both sides,
   every 22.5 degrees (him: his punch at a man standing there; me: that man's punch at him, his guard up). Measured, not
   written by hand: run the tool again after changing anything that moves a man round another. */
export const BEARING = ${JSON.stringify(d)};\n`
      );
      console.log('wrote src/bearing.data.mjs');
    }
  } else if (flag('reface')) {
    const t = refaceTable();
    json ? console.log(JSON.stringify(t)) : printReface(t);
  } else if (flag('worth')) {
    const t = worthTable({ step: opt('step') ? Number(opt('step')) : 22.5, levels: opt('levels') ? opt('levels').split(',') : ['3'] });
    json ? console.log(JSON.stringify(t)) : printWorth(t);
  } else if (flag('walk')) {
    const t = walkTable();
    json ? console.log(JSON.stringify(t)) : printWalk(t);
  } else printMoves(table());
}
