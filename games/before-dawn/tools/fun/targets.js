// The fun measurements of docs/GDD-V2.md §10: one row per number, with the v1 value measured on
// commit 5e12273 (seeds 1–40, dealt hands, human-like pilot, median over runs) and the v2 target.
// `get` reads the number from a run summary of lib.js; `ok` judges the median over runs.
'use strict';

const floorOf = (r, n) => r.floors.find((f) => f.floor === n);
const ratio = (x, y) => (x === undefined || y === undefined || !y ? NaN : Math.round((100 * x) / y) / 100);

const ROWS = [
  { id: 'kpm', name: 'kills per minute', get: (r) => r.total.killsPerMin, v1: '?', target: '≥ 60', ok: (v) => v >= 60 },
  { id: 'choiceGap', name: 'median seconds between choices', get: (r) => r.choiceGap.median, v1: '?', target: '20–45', ok: (v) => v >= 20 && v <= 45 },
  { id: 'choiceGapMax', name: 'longest wait for a choice (s)', get: (r) => r.choiceGap.max, v1: '?', target: '≤ 90', ok: (v) => v <= 90 },
  { id: 'firstChoice', name: 'first choice at (s)', get: (r) => (r.first.choice === undefined ? r.sec : r.first.choice), v1: '?', target: '≤ 35', ok: (v) => v <= 35 },
  { id: 'sparse', name: 'time with < 3 enemies on screen (%)', get: (r) => r.total.sparsePct, v1: '?', target: '≤ 15', ok: (v) => v <= 15 },
  { id: 'empty', name: 'time with 0 enemies on screen (%)', get: (r) => r.total.emptyPct, v1: '?', target: '≤ 8', ok: (v) => v <= 8 },
  { id: 'onScreen', name: 'enemies on screen, mean', get: (r) => r.total.onScreenMean, v1: '?', target: '12–30', ok: (v) => v >= 12 && v <= 30 },
  { id: 'lastChase', name: 'chasing the last 1–2 enemies (% of time)', get: (r) => r.total.lastChasePct, v1: '?', target: '≤ 3', ok: (v) => v <= 3 },
  { id: 'attack', name: 'time with a target in reach (%)', get: (r) => r.total.attackPct, v1: '?', target: '55–85', ok: (v) => v >= 55 && v <= 85 },
  { id: 'stk', name: 'swings to kill a regular enemy', get: (r) => r.swingsToKillAll, v1: '?', target: '≤ 2.0', ok: (v) => v <= 2.0 },
  { id: 'multi', name: 'swings that hit 2+ enemies (%)', get: (r) => r.total.multiSwingPct, v1: '?', target: '≥ 45', ok: (v) => v >= 45 },
  { id: 'pickups', name: 'pickups per minute', get: (r) => Math.round((10 * r.total.pickups) / Math.max(1e-9, r.sec / 60)) / 10, v1: '?', target: '≥ 40', ok: (v) => v >= 40 },
  { id: 'gainGap', name: 'median seconds between gains', get: (r) => r.gainGap.median, v1: '?', target: '≤ 40', ok: (v) => v <= 40 },
  { id: 'movedPerEvent', name: 'distance walked per event (u)', get: (r) => r.movedPerEvent, v1: '?', target: '≤ 4', ok: (v) => v <= 4 },
  { id: 'cardEv', name: 'card events per minute', get: (r) => r.cardEventsPerMin, v1: '?', target: '≥ 30', ok: (v) => v >= 30 },
  { id: 'f60kills', name: 'first 60 s: kills', get: (r) => r.first60.kills, v1: '?', target: '≥ 40', ok: (v) => v >= 40 },
  { id: 'f60choices', name: 'first 60 s: choices', get: (r) => r.first60.choices, v1: '?', target: '≥ 2', ok: (v) => v >= 2 },
  { id: 'f1f4kpm', name: '4F ÷ 1F kills per minute', get: (r) => ratio((floorOf(r, 4) || {}).killsPerMin, (floorOf(r, 1) || {}).killsPerMin), v1: '?', target: '≥ 1.5', ok: (v) => !(v < 1.5) },
  { id: 'f1f4screen', name: '4F ÷ 1F enemies on screen', get: (r) => ratio((floorOf(r, 4) || {}).onScreenMean, (floorOf(r, 1) || {}).onScreenMean), v1: '?', target: '≥ 1.4', ok: (v) => !(v < 1.4) },
  { id: 'hurts', name: 'hits taken per minute', get: (r) => r.total.hurtsPerMin, v1: '?', target: '1.5–4', ok: (v) => v >= 1.5 && v <= 4 },
];

module.exports = { rows: () => ROWS };
