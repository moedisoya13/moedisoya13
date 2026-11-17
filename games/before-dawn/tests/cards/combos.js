#!/usr/bin/env node
// GDD-V2 §10.4 V8 at mixed levels (not a test file: tools/test.js runs only *.test.js). All 816
// three-card hands from the 18 cards, each started on 3F, each card set to its own level 1–5 (the
// levels rotate with the hand's index so every card meets every level in many hands), quest cards
// awakened in half the hands, combo cards at a stack in between, two boons; then the bot plays
// 20 s. Any exception or a non-finite number in the state dump fails the hand.
//
//   node tests/cards/combos.js [--sec 20] [--jobs 4]       exit 1 on a failure
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const SEC = Number(opt('sec', 20));

function nanFree(o) {
  let ok = true;
  JSON.stringify(o, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) ok = false; return v; });
  return ok;
}

function runOne(BD, ids, n) {
  const r = BD.simRun({ seed: 1000 + n, hand: ids, floor: 3, level: 1, maxSec: 0.02, unlocked: BD.cards.ids() });
  const app = r.app, w = app.world;
  ids.forEach((id, slot) => {
    const c = BD.cardRt.get(w, id), L = ((n + 2 * slot) % 5) + 1;
    while (c.level < L) BD.cardRt.levelUp(w, c);
    if (c.def.family === 'quest' && n % 2) BD.cardRt.awaken(w, c);
    if (c.def.family === 'combo') BD.cardRt.setStack(w, c, Math.floor(BD.cardRt.maxStack(c) * ((n % 4) / 3)), 'gain');
  });
  const levels = ids.map((id) => BD.cardRt.get(w, id).level); // the levels the hand starts at
  const boons = BD.boons.ids();
  BD.growth.giveBoon(w, boons[n % boons.length]); BD.growth.giveBoon(w, boons[(n * 3 + 1) % boons.length]);
  app.botOn = true;
  let k = 0;
  while (app.mode === 'play' && w.t < SEC && k++ < SEC * 60 * 3) app.step();
  return { ok: nanFree(BD.dump(app)), levels, t: w.t, kills: w.stats.kills };
}

if (argv[0] === '--worker') {
  const { load } = require(path.join(ROOT, 'tools', 'load'));
  const BD = load();
  for (const [n, ids] of JSON.parse(argv[1])) {
    let res;
    try { const r = runOne(BD, ids, n); res = { n, ids, ok: r.ok, why: r.ok ? '' : 'NaN in the dump', levels: r.levels, kills: r.kills }; } catch (e) { res = { n, ids, ok: false, why: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }; }
    process.stdout.write(JSON.stringify(res) + '\n');
  }
  process.exit(0);
}

const { load } = require(path.join(ROOT, 'tools', 'load'));
const BD = load();
const ids = BD.cards.ids().filter((id) => !id.startsWith('test_'));
const hands = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) hands.push([hands.length, [ids[i], ids[j], ids[k]]]);
const J = Number(opt('jobs', 4));
const chunks = Array.from({ length: J }, () => []);
hands.forEach((h, i) => chunks[i % J].push(h));
const t0 = Date.now(), out = [];
Promise.all(chunks.map((c) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [__filename, '--worker', JSON.stringify(c), '--sec', String(SEC)], { cwd: ROOT });
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; let x; while ((x = buf.indexOf('\n')) >= 0) { out.push(JSON.parse(buf.slice(0, x))); buf = buf.slice(x + 1); } });
  p.stderr.on('data', (d) => process.stderr.write(d));
  p.on('close', (code) => (code ? rej(new Error('worker exit ' + code)) : res()));
}))).then(() => {
  const bad = out.filter((r) => !r.ok);
  const perLevel = {};
  for (const r of out) if (r.levels) r.ids.forEach((id, s) => { const k = id + ':' + r.levels[s]; perLevel[k] = (perLevel[k] || 0) + 1; });
  const minCover = Math.min(...ids.map((id) => Math.min(...[1, 2, 3, 4, 5].map((L) => perLevel[id + ':' + L] || 0))));
  console.log(`${out.length} hands × ${SEC} s on 3F at mixed levels (every card at every level in ≥ ${minCover} hands), ${((Date.now() - t0) / 1000).toFixed(0)} s wall: ${bad.length ? bad.length + ' failed' : 'no exceptions, no NaN'}`);
  for (const b of bad.slice(0, 10)) console.log('  ' + b.ids.join(',') + ': ' + b.why);
  process.exit(bad.length || out.length !== 816 ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
