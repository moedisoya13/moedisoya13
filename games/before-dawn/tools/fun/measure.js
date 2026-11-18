#!/usr/bin/env node
// Fun measurements over many seeds, headless (Node), human-like pilot. docs/GDD-V2.md §10.
//
//   node tools/fun/measure.js --seeds 1-40                    dealt hands, mixed altar policy
//   node tools/fun/measure.js --seeds 1-40 --hand whirl,flame,leech --altar card --trial
//   node tools/fun/measure.js --seeds 1-40 --json out.json    also write every run's summary
//   node tools/fun/measure.js --seeds 1-40 --check            compare with the v2 targets, exit 1 on a miss
//   node tools/fun/measure.js --seeds 1-30 --cards            each of the cards alone vs an empty hand
//   node tools/fun/measure.js --seeds 1-10 --task seals --floors 1   1F's task (GDD-V2 V10), stop after 1F
// The table "task by task" gives, per floor task, how often it was finished and the guardian brought
// down, and the times from floor entry (task done, guardian down, floor left).
//
// The numbers are per run; the table shows the median over runs (and the 10th–90th percentile).
'use strict';
const path = require('path');
const fs = require('fs');
const { load } = require(path.join(__dirname, '..', 'load'));
const L = require('./lib');
const T = require('./targets');

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
const o = args();
const BD = load();
const [a, b] = String(o.seeds || '1-20').split('-').map(Number);
const seeds = []; for (let s = a; s <= (b || a); s++) seeds.push(s);
const q = (arr, p) => { const s = arr.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

function runAll(hand, quiet) {
  const out = [];
  const t0 = Date.now();
  for (const s of seeds) {
    const r = L.runNode(BD, { seed: s, hand, altar: o.altar || 'mixed', trial: !!o.trial, tier: Number(o.tier || 0), task: o.task || undefined, maxFloor: o.floors ? Number(o.floors) : undefined });
    out.push(r);
    if (!quiet && o.verbose) console.log(`seed ${s}: ${r.result} ${r.floor}F ${r.sec}s kills/min ${r.total.killsPerMin} sparse ${r.total.sparsePct}% choices ${r.choiceGap.n} hand ${r.hand.join(',')}`);
  }
  if (!quiet) console.log(`${seeds.length} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s wall`);
  return out;
}

function table(runs) {
  const rows = T.rows(runs);
  const wins = runs.filter((r) => r.result === 'win').length;
  console.log(`\nruns ${runs.length}: wins ${wins} (${Math.round((100 * wins) / runs.length)} %), median length ${(q(runs.map((r) => r.sec), 0.5) / 60).toFixed(1)} min, median floor ${q(runs.map((r) => r.floor), 0.5)}`);
  console.log('\n' + ['metric'.padEnd(46), 'median'.padStart(8), 'p10–p90'.padStart(14), 'v1'.padStart(8), 'v2 target'.padStart(12), ''].join(' '));
  let miss = 0;
  for (const row of rows) {
    const vals = runs.map(row.get).filter((x) => typeof x === 'number' && isFinite(x));
    const med = !vals.length ? NaN : row.agg === 'max' ? Math.max.apply(null, vals) : q(vals, 0.5);
    const ok = !vals.length ? false : row.ok(med); // a number the build cannot report counts as a miss
    if (!ok) miss++;
    console.log([row.name.padEnd(46), (vals.length ? String(med) : 'n/a').padStart(8), (vals.length ? q(vals, 0.1) + '–' + q(vals, 0.9) : '').padStart(14), String(row.v1).padStart(8), String(row.target).padStart(12), ok ? 'ok' : 'MISS'].join(' '));
  }
  // floor 1 vs floor 4: the same list of numbers side by side
  const f = (n, k) => q(runs.map((r) => { const x = r.floors.find((y) => y.floor === n); return x ? x[k] : NaN; }), 0.5);
  console.log('\nfloor by floor (median of the runs that got there):');
  console.log(['floor', 'sec', 'kills/min', 'on screen', 'sparse %', 'attack %', 'hurts/min', 'moved u', 'choices', 'gains'].map((s) => s.padStart(10)).join(''));
  for (let n = 1; n <= 6; n++) {
    if (!runs.some((r) => r.floors.some((y) => y.floor === n))) continue;
    console.log([n + 'F', f(n, 'sec'), f(n, 'killsPerMin'), f(n, 'onScreenMean'), f(n, 'sparsePct'), f(n, 'attackPct'), f(n, 'hurtsPerMin'), f(n, 'moved'), f(n, 'choices'), f(n, 'gains')].map((s) => String(s).padStart(10)).join(''));
  }
  // task by task: every floor entered with that task (GDD-V2 §5.4; V10: guardian down within budget × 1.5)
  const tasks = {};
  for (const r of runs) for (const x of r.floors) {
    if (!x.taskKind || x.sec < 1) continue; // a floor only just entered when the run stopped
    const k = tasks[x.taskKind] || (tasks[x.taskKind] = { n: 0, done: 0, down: 0, inBudget: 0, taskSec: [], clearSec: [], sec: [], floors: {} });
    const budget = BD.C.DIRECTOR.floors[x.floor] ? BD.C.DIRECTOR.floors[x.floor].budget : 150;
    k.n++; k.floors[x.floor] = (k.floors[x.floor] || 0) + 1;
    if (x.taskSec !== undefined) { k.done++; k.taskSec.push(x.taskSec); }
    if (x.clearSec !== undefined) { k.down++; k.clearSec.push(x.clearSec); if (x.clearSec <= budget * 1.5) k.inBudget++; }
    k.sec.push(x.sec);
  }
  if (Object.keys(tasks).length) {
    console.log('\ntask by task (floors entered with it; seconds from floor entry, median):');
    console.log(['task', 'floors', 'task done', 'guard down', '≤ budget×1.5', 'task s', 'guard s', 'floor s', 'on floors'].map((s, i) => (i ? s.padStart(13) : s.padEnd(7))).join(''));
    for (const id of Object.keys(tasks).sort()) {
      const k = tasks[id], pc = (a) => Math.round((100 * a) / k.n) + ' %';
      console.log([id.padEnd(7), k.n, pc(k.done), pc(k.down), pc(k.inBudget), q(k.taskSec, 0.5), q(k.clearSec, 0.5), q(k.sec, 0.5), Object.keys(k.floors).map((f) => f + 'F×' + k.floors[f]).join(' ')].map((s, i) => (i ? String(s).padStart(13) : s)).join(''));
    }
  }
  const ttk = {};
  for (const r of runs) for (const k of Object.keys(r.ttk)) { const x = ttk[k] || (ttk[k] = { n: 0, hits: 0, sec: 0 }); x.n += r.ttk[k].n; x.hits += r.ttk[k].swingsToKill * r.ttk[k].n; x.sec += r.ttk[k].secToKill * r.ttk[k].n; }
  console.log('\nswings to kill (direct hits on a regular enemy, pooled):');
  for (const k of Object.keys(ttk).sort()) console.log(`  ${k.padEnd(12)} n ${String(ttk[k].n).padStart(5)}  swings ${(ttk[k].hits / ttk[k].n).toFixed(1).padStart(5)}  seconds from first hit ${(ttk[k].sec / ttk[k].n).toFixed(1).padStart(5)}`);
  const hb = {};
  for (const r of runs) for (const k of Object.keys(r.hurtBy)) hb[k] = (hb[k] || 0) + r.hurtBy[k];
  console.log('\ndamage taken by cause (sum): ' + Object.entries(hb).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', '));
  return miss;
}

if (o.cards) {
  // How much does one card change the outcome? Each card alone against the same seeds with no card.
  const base = runAll([], true);
  const key = (rs) => ({
    win: rs.filter((r) => r.result === 'win').length, floor: q(rs.map((r) => r.floor), 0.5),
    f1: q(rs.map((r) => (r.floors[0] ? r.floors[0].sec : NaN)), 0.5), kpm: q(rs.map((r) => r.total.killsPerMin), 0.5),
    multi: q(rs.map((r) => r.total.multiSwingPct), 0.5), cardDmg: q(rs.map((r) => r.cardDamagePct), 0.5), ev: q(rs.map((r) => r.cardEventsPerMin), 0.5),
  });
  const b0 = key(base);
  console.log(`one card alone, seeds ${a}-${b || a}, human-like pilot (card-blind steering)\n`);
  console.log(['card'.padEnd(16), 'wins', 'med floor', '1F sec', 'kills/min', 'multi-hit %', 'card dmg %', 'card ev/min'].map((s, i) => (i ? s.padStart(12) : s)).join(''));
  const line = (name, k) => console.log([name.padEnd(16), k.win, k.floor, k.f1, k.kpm, k.multi, k.cardDmg, k.ev].map((s, i) => (i ? String(s).padStart(12) : s)).join(''));
  line('(no card)', b0);
  for (const id of BD.cards.ids()) line(id, key(runAll([id], true)));
  process.exit(0);
}

const runs = runAll(o.hand !== undefined ? String(o.hand === true ? '' : o.hand).split(',').filter(Boolean) : undefined);
const miss = table(runs);
if (o.json) fs.writeFileSync(path.resolve(String(o.json)), JSON.stringify(runs.map((r) => Object.assign({}, r, { timeline: undefined })), null, 1));
if (o.check) { console.log(miss ? `\n${miss} target(s) missed` : '\nall v2 targets met'); process.exit(miss ? 1 : 0); }
