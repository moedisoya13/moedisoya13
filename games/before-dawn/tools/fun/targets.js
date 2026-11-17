// The fun measurements of docs/GDD-V2.md §10.1: one row per number, with the v1 value measured on
// commit 5e12273 (`node tools/fun/measure.js --seeds 1-40`: dealt hands, human-like pilot, median
// over runs) and the v2 target. `get` reads the number from a run summary of lib.js; `ok` judges
// the median over runs. A row whose `get` returns NaN for a run (e.g. a floor it never reached)
// leaves that run out.
'use strict';

const floorOf = (r, n) => r.floors.find((f) => f.floor === n);
const ratio = (x, y) => (x === undefined || y === undefined || !y ? NaN : Math.round((100 * x) / y) / 100);
const perMin = (n, r) => Math.round((10 * n) / Math.max(1e-9, r.sec / 60)) / 10;
const between = (a, b) => (v) => v >= a && v <= b;
const atLeast = (a) => (v) => v >= a;
const atMost = (a) => (v) => v <= a;

const ROWS = [
  // density and killing
  { id: 'kpm', name: 'kills per minute', get: (r) => r.total.killsPerMin, v1: 15, target: '≥ 60', ok: atLeast(60) },
  { id: 'onScreen', name: 'enemies on screen, mean', get: (r) => r.total.onScreenMean, v1: 3.7, target: '14–40', ok: between(14, 40) },
  { id: 'sparse', name: 'time with < 3 enemies on screen (%)', get: (r) => r.total.sparsePct, v1: 35.4, target: '≤ 15', ok: atMost(15) },
  { id: 'stk', name: 'swings to kill a regular enemy', get: (r) => r.swingsToKillAll, v1: 4.3, target: '≤ 1.8', ok: atMost(1.8) },
  { id: 'multi', name: 'swings that hit 2+ enemies (%)', get: (r) => r.total.multiSwingPct, v1: 16.9, target: '≥ 50', ok: atLeast(50) },
  { id: 'reach3', name: 'swings with 3+ enemies in reach (%)', get: (r) => r.inReachAtSwing.threePlus, v1: 4.6, target: '≥ 30', ok: atLeast(30) },
  // chasing and waiting
  { id: 'chase', name: 'enemies alive but none in reach (% of time)', get: (r) => r.total.chasePct, v1: 27.1, target: '≤ 20', ok: atMost(20) },
  { id: 'lastChase', name: 'chasing the last 1–2 enemies (% of time)', get: (r) => r.total.lastChasePct, v1: 11.2, target: '≤ 2', ok: atMost(2) },
  { id: 'movedPerEvent', name: 'distance walked per kill/pickup/choice (u)', get: (r) => r.movedPerEvent, v1: 13.2, target: '≤ 3', ok: atMost(3) },
  // rewards and choices
  { id: 'pickups', name: 'pickups per minute', get: (r) => perMin(r.total.pickups, r), v1: 1.2, target: '≥ 45', ok: atLeast(45) },
  { id: 'choiceGap', name: 'median seconds between choices', get: (r) => r.choiceGap.median, v1: 73.3, target: '15–40', ok: between(15, 40) },
  { id: 'choiceGapMax', name: 'longest wait for a choice (s)', get: (r) => r.choiceGap.max, v1: 106.6, target: '≤ 75', ok: atMost(75) },
  { id: 'firstChoice', name: 'first choice at (s)', get: (r) => (r.first.choice === undefined ? r.sec : r.first.choice), v1: 47.5, target: '≤ 25', ok: atMost(25) },
  // the first minute
  { id: 'f60kills', name: 'first 60 s: kills', get: (r) => r.first60.kills, v1: 22, target: '≥ 40', ok: atLeast(40) },
  { id: 'f60choices', name: 'first 60 s: choices', get: (r) => r.first60.choices, v1: 1, target: '≥ 2', ok: atLeast(2) },
  { id: 'f60hurts', name: 'first 60 s: hits taken', get: (r) => r.first60.hurts, v1: 5, target: '≤ 3', ok: atMost(3) },
  // pain
  { id: 'hurts', name: 'hits taken per minute', get: (r) => r.total.hurtsPerMin, v1: 6.2, target: '1.5–4', ok: between(1.5, 4) },
  { id: 'killsPerHurt', name: 'kills per hit taken', get: (r) => r.killsPerHurt, v1: 2.6, target: "≥ 20", ok: atLeast(20) },
  // floors differ
  { id: 'f1f4kpm', name: '4F ÷ 1F kills per minute', get: (r) => ratio((floorOf(r, 4) || {}).killsPerMin, (floorOf(r, 1) || {}).killsPerMin), v1: 0.92, target: '≥ 1.6', ok: atLeast(1.6) },
  { id: 'f1f4screen', name: '4F ÷ 1F enemies on screen', get: (r) => ratio((floorOf(r, 4) || {}).onScreenMean, (floorOf(r, 1) || {}).onScreenMean), v1: 1.24, target: '≥ 1.5', ok: atLeast(1.5) },
  { id: 'tasks', name: 'different tasks done (runs that reach the roof)', get: (r) => (r.floor >= 6 ? new Set(r.tasks).size : NaN), v1: 0, target: '5', ok: atLeast(5) },
  // length
  { id: 'floorSec', name: 'seconds on 3F', get: (r) => (floorOf(r, 4) ? floorOf(r, 3).sec : NaN), v1: 73.7, target: '110–170', ok: between(110, 170) },
  { id: 'winMin', name: 'length of a winning run (min)', get: (r) => (r.result === 'win' ? Math.round(r.sec / 6) / 10 : NaN), v1: 6.7, target: '12.5–15.5', ok: between(12.5, 15.5) },
  { id: 'level', name: 'hero level at the end of a winning run', get: (r) => (r.result === 'win' && r.level !== null ? r.level : NaN), v1: '—', target: '21–27', ok: between(21, 27) },
  // fairness
  { id: 'unseen', name: 'hits from attacks that began off screen (max)', get: (r) => (r.unseenHits === null ? NaN : r.unseenHits), v1: '—', target: '0', ok: atMost(0), agg: 'max' },
];

module.exports = { rows: () => ROWS };
