/* Measuring the boxer as the bout moves him: the numbers the catalogue's cards show and the tests hold the grades to, taken
   off a real bout sixty times a second. Nothing here draws; the page, tools/ladder.mjs and the tests all measure the same way.
     run(entry, seconds)   a scripted bout (footwork.mjs's form) and a frame a step of the boxer: his joints, his head across
                           the line to the other man, his hip and shoulder lines, his rhythm, what happened, where the two
                           stand and how far his facing is off the line between them, his gloves and head
     guardOf(level)        his own guard, as his grade holds it with his head still: where the head and the lines are
     rung(id)              a rung of the skill ladder: the blow, when it landed after the press, how far the head was off the
                           line then, the most the hips turned and the shoulders were held back behind them, where the hips were
     stance(level, s)      a grade's footwork standing: hips and head travel, feet a minute, the beat, the flourishes
     across(f, other, p)   where a point is across the line from boxer f to the other man (+ to his left), metres
     lineAngle(pose, a, b) the line through two joints as an angle about the vertical, in his own space
     sole(at, Side)        how far the lowest of a foot's ball and heel is off the canvas, from his joints (a heel risen off a
                           ball still on the canvas is a foot on the canvas): UP and DOWN are the heights a foot counts as
                           having left the canvas and come back down at */
import { step } from './game/bout.mjs';
import { freshBout, drive } from './footwork.mjs';
import { LADDER, STANCES } from './ladder.mjs';
import { LEVELS, LEVEL } from './anim/skill.mjs';
import { MOVES } from './anim/moves.mjs';
import { NAMES } from './rig/skeleton.mjs';
import { toWorld } from './anim/pose.mjs';

const DT = 1 / 60;
const deg = r => (r * 180) / Math.PI;
export const sole = (at, Side) => Math.min(at[Side + 'ToeBase'][1] - 0.03, at[Side + 'Foot'][1] - 0.09);
export const UP = 0.009,
  DOWN = 0.004;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/* Where a point of him is across the line to the other man (+ to his left), and the line of a pair of joints (hips, shoulders)
   as an angle about the vertical, in his own space. */
export function across(f, other, p) {
  const ax = other.x - f.x,
    az = other.z - f.z,
    l = Math.hypot(ax, az) || 1;
  // his left, looking down the line: the line turned a quarter to the left (x across, z ahead on the canvas)
  return ((p[0] - f.x) * az - (p[2] - f.z) * ax) / l;
}
export const lineAngle = (pose, a, b) => Math.atan2(pose.at[a][2] - pose.at[b][2], pose.at[a][0] - pose.at[b][0]);

/* Run an entry for `seconds` (its own loop if left out) and keep a frame a step: the boxer's joints on the canvas, his head
   across the line, his hip and shoulder lines, his rhythm, and what happened. */
export function run(entry, seconds) {
  const bout = freshBout(entry),
    frames = [],
    [a, b] = bout.fighters;
  let blow = -9,
    chain = null; // the last punch's kinetic chain
  for (let tick = 0; tick < Math.round((seconds || entry.loop) / DT); tick++) {
    // (a step taken inside the held moment of a blow moves nothing: that frame is the one before, held)
    const held = bout.stop > 0;
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    b.hp = 1000;
    if (!entry.hurt) a.hp = Math.max(a.hp, 1000);
    const events = bout.events.map(e => ({ ...e }));
    for (const e of events) if (['hit', 'block', 'parry'].includes(e.type)) blow = tick;
    if (bout.stop > 0 && tick - blow < 30) blow = tick;
    const r = a.animator.rhythm;
    if (a.action && a.action.chain) chain = a.action.chain;
    frames.push({
      tick,
      events,
      held,
      struck: tick - blow <= 2,
      joints: Object.fromEntries(NAMES.map(n => [n, toWorld(a.place, a.pose.at[n], a.pose.stretch)])),
      head: across(a, b, a.points.head),
      headY: a.points.head[1],
      hipsY: a.pose.at.Hips[1] * a.pose.stretch,
      hips: lineAngle(a.pose, 'LeftLeg', 'RightLeg'),
      shoulders: lineAngle(a.pose, 'LeftArm', 'RightArm'),
      halves: r.halves,
      landed: r.landed,
      flourish: r.flourish,
      action: a.action ? a.action.name : null,
      // (where the two of them stand, and how far his facing is off the line to the other man, radians)
      at: [a.x, a.z],
      yaw: a.yaw,
      him: [b.x, b.z],
      face: Math.atan2(Math.sin(Math.atan2(b.x - a.x, b.z - a.z) - a.yaw), Math.cos(Math.atan2(b.x - a.x, b.z - a.z) - a.yaw)),
      cover: a.cover,
      gloves: { L: a.points.L.slice(), R: a.points.R.slice(), head: a.points.head.slice() },
      foot: { L: a.pose.at.LeftToeBase.slice(), R: a.pose.at.RightToeBase.slice() },
      // and the other man: his lead foot on the canvas, whether it is stood on, what he is doing
      foe: { foot: toWorld(b.place, b.pose.at.LeftToeBase, b.pose.stretch), pinned: b.pinned > 0, action: b.action ? b.action.id : null }
    });
  }
  return { frames, bout, chain };
}

// the landings in a run of frames: the tick each foot came down on, and which
export const landings = frames => frames.filter((f, i) => i > 0 && f.halves !== frames[i - 1].halves).map(f => ({ tick: f.tick, foot: f.landed }));

/* The head over each step he takes while he travels (docs/moves-plan-4.md §12): for every foot that comes down while he is
   going faster than `fast` metres a second, the window from halfway back to the landing before to halfway on to the next,
   and in it how far the head went from side to side of his hips (in his own terms, across), how far it went up and down
   (its height on the canvas: what his knees do to it moves his hips with it), and how many frames from the landing it was
   lowest (+ after). -> [{ tick, foot, speed, side, up, low, back }] (cm, frames; back: the most the head went back of his
   hips, less the least) */
export function steps(frames, fast = 0.5) {
  const land = landings(frames),
    rel = f => {
      const h = f.gloves.head,
        p = f.joints.Hips,
        d = [h[0] - p[0], h[2] - p[2]];
      // (his left, and ahead of him, on the canvas: bout.mjs, local)
      return [d[0] * Math.cos(f.yaw) - d[1] * Math.sin(f.yaw), d[0] * Math.sin(f.yaw) + d[1] * Math.cos(f.yaw)];
    },
    out = [];
  for (let k = 1; k + 1 < land.length; k++) {
    const i = frames.findIndex(f => f.tick === land[k].tick),
      a = frames.findIndex(f => f.tick === Math.round((land[k - 1].tick + land[k].tick) / 2)),
      b = frames.findIndex(f => f.tick === Math.round((land[k].tick + land[k + 1].tick) / 2));
    if (a < 1 || b < 0) continue;
    const speed = Math.hypot(frames[b].at[0] - frames[a].at[0], frames[b].at[1] - frames[a].at[1]) / ((b - a) * DT);
    if (speed < fast) continue;
    const win = frames.slice(a, b + 1),
      side = win.map(f => rel(f)[0]),
      ahead = win.map(f => rel(f)[1]),
      up = win.map(f => f.gloves.head[1]),
      low = up.indexOf(Math.min(...up));
    out.push({
      tick: land[k].tick,
      foot: land[k].foot,
      speed: +speed.toFixed(2),
      side: +((Math.max(...side) - Math.min(...side)) * 100).toFixed(1),
      up: +((Math.max(...up) - Math.min(...up)) * 100).toFixed(1),
      low: a + low - i,
      back: +((Math.max(...ahead) - Math.min(...ahead)) * 100).toFixed(1)
    });
  }
  return out;
}

/* His own guard, as his grade holds it: where his head is across the line, and his hip and shoulder lines, standing in his
   grade's posture with his head held still (no head movement, no flourishes), over six seconds of it. */
const guards = {};
export function guardOf(level) {
  if (guards[level]) return guards[level];
  const still = Object.assign({}, LEVEL[level], { stance: Object.assign({}, LEVEL[level].stance, { head: null, flourish: null, paw: 0 }) });
  const base = STANCES.find(e => e.id === `stance@${level}`),
    { frames } = run(Object.assign({}, base, { setup: b => (b.fighters[0].skills = { all: still }) }), 6),
    mean = k => frames.reduce((s, f) => s + f[k], 0) / frames.length;
  return (guards[level] = { head: mean('head'), hips: mean('hips'), shoulders: mean('shoulders'), hipsY: mean('hipsY'), headY: mean('headY') });
}

// one rung: the blow and how the body was used to throw it
export function rung(id) {
  const entry = LADDER.find(e => e.id === id),
    move = MOVES[entry.punch],
    { frames, chain } = run(entry),
    guard = guardOf(entry.level),
    press = frames.findIndex(f => f.events.some(e => e.type === 'punch' && e.who === 0 && e.name === entry.punch)),
    hit = frames.findIndex(f => f.events.some(e => e.who === 0 && ['hit', 'graze', 'whiff', 'block'].includes(e.type))),
    blow = hit >= 0 ? frames[hit].events.find(e => e.who === 0 && ['hit', 'graze', 'whiff', 'block'].includes(e.type)) : null,
    turn = Math.sign(move.links.hips.yaw),
    sg = Math.sign(move.links.trunk.twist),
    side = move.hand === 'R' ? 1 : -1,
    during = frames.slice(press, (hit >= 0 ? hit : frames.length - 1) + 1);
  let hips = 0,
    sep = 0;
  // (the lines' angles are taken with his left as +x and ahead as +z, so a turn to his left is a fall in the angle)
  for (const f of during) {
    hips = Math.max(hips, deg(-turn * wrap(f.hips - guard.hips)));
    sep = Math.max(sep, deg(sg * wrap(f.shoulders - f.hips - (guard.shoulders - guard.hips))));
  }
  return {
    id,
    punch: entry.punch,
    level: entry.level,
    type: blow ? blow.type : 'none',
    J: blow && blow.J !== undefined ? blow.J : 0,
    // (the press is read on the step before the one the punch starts on, as the bout reads every button)
    ms: hit >= 0 && press >= 0 ? Math.round((hit - press) * DT * 1000) : null,
    speed: blow ? blow.speed : 0,
    mass: blow ? blow.mass : 0,
    pressTick: press,
    hitTick: hit,
    off: hit >= 0 ? +((side * (frames[hit].head - guard.head)) * 100).toFixed(1) : null,
    hipTurn: +hips.toFixed(1),
    sep: +sep.toFixed(1),
    rise: hit >= 0 && press >= 0 ? +((frames[hit].hipsY - frames[press].hipsY) * 100).toFixed(1) : null,
    fired: chain ? chain.fired.slice() : null, // when each joint of it fired, seconds after the press
    // (and from where he carries them, standing in his own guard)
    sunk: hit >= 0 ? +((frames[hit].hipsY - guard.hipsY) * 100).toFixed(1) : null,
    frames
  };
}

/* The footwork of a grade, standing: `seconds` of it. */
export function stance(level, seconds) {
  const { frames } = run(STANCES.find(e => e.id === `stance@${level}`), seconds || 20),
    settled = frames.slice(60),
    span = k => Math.max(...settled.map(f => f[k])) - Math.min(...settled.map(f => f[k])),
    land = landings(settled),
    gaps = land.slice(1).map((l, i) => (l.tick - land[i].tick) * DT),
    mean = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1),
    sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length || 1)),
    /* the squash at each landing, by which foot came down: how far the hips dip below a straight line drawn from where they
       are as the foot lands to where they are as the squash ends (the bounce's contact, 0.38 of the half beat), so that
       anything slower going on under it (the head's U, a change of level) is left out */
    squash = { L: [], R: [] };
  land.forEach((l, k) => {
    const i = settled.findIndex(f => f.tick === l.tick),
      next = land[k + 1] ? settled.findIndex(f => f.tick === land[k + 1].tick) : -1;
    if (!l.foot || next < 0) return;
    const j = i + Math.max(2, Math.round((next - i) * 0.38));
    let deep = 0;
    for (let n = i; n <= j && n < settled.length; n++) deep = Math.max(deep, settled[i].hipsY + ((settled[j].hipsY - settled[i].hipsY) * (n - i)) / (j - i) - settled[n].hipsY);
    squash[l.foot].push(deep);
  });
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1),
    // swung: of each pair of half beats, the share the one that starts on the lead foot takes
    pairs = [];
  for (let i = 0; i + 1 < gaps.length; i++) if (land[i].foot === 'L' && land[i + 1].foot === 'R') pairs.push(gaps[i] / (gaps[i] + gaps[i + 1]));
  // feet a minute, as the catalogue counts them: a foot off the canvas and back down on it
  const up = { L: false, R: false };
  let plants = 0,
    lifted = 0;
  for (const f of settled)
    for (const side of ['L', 'R']) {
      const y = sole(f.joints, side === 'L' ? 'Left' : 'Right');
      lifted = Math.max(lifted, y);
      if (y > UP) up[side] = true;
      else if (up[side] && y < DOWN) (up[side] = false), plants++;
    }
  const seen = [...new Set(settled.map(f => f.flourish).filter(Boolean))];
  return {
    level,
    hips: +(span('hipsY') * 100).toFixed(1),
    head: +(span('head') * 100).toFixed(1),
    headY: +(span('headY') * 100).toFixed(1),
    lifted: +(lifted * 100).toFixed(1),
    steps: Math.round((plants / (settled.length * DT)) * 60),
    landings: Math.round((land.length / (settled.length * DT)) * 60),
    beat: { cv: +(sd / mean).toFixed(3), strong: +(avg(squash.L) / (avg(squash.R) || 1)).toFixed(2), swing: +(avg(pairs) || 0.5).toFixed(3) },
    flourishes: seen,
    frames: settled
  };
}

