#!/usr/bin/env node
// Card balance in hordes (not a test file: tools/test.js runs only *.test.js). The same human-like
// pilot and metrics as tools/fun/measure.js (tools/fun/lib.js), run over many seeds in parallel.
//
//   node tests/cards/balance.js --seeds 1-30 --jobs 4                 each card alone vs no card
//   node tests/cards/balance.js --seeds 1-60 --jobs 4 --mode dealt    dealt hands (all 18 unlocked):
//                                                                     per card, the runs that held it
//   --only flame,whirl   just these cards (alone mode)   --json out.json   every run's numbers
//
// Columns: runs, wins (win share = wins / runs), median floor reached, median kills per minute,
// swings per kill (all swings / all kills, pooled), the card's share of the damage dealt (every hit
// whose source is not the bare blade or the dash), hits taken per minute, median seconds on 1F.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);

if (argv[0] === '--worker') {
  const { load } = require(path.join(ROOT, 'tools', 'load'));
  const L = require(path.join(ROOT, 'tools', 'fun', 'lib'));
  const BD = load();
  const jobs = JSON.parse(Buffer.from(argv[1], 'base64').toString());
  for (const j of jobs) {
    const r = L.runNode(BD, { seed: j.seed, hand: j.hand, altar: 'mixed', tier: 0 });
    const f1 = r.floors.find((x) => x.floor === 1);
    process.stdout.write(JSON.stringify({
      key: j.key, seed: j.seed, hand: r.hand, result: r.result, floor: r.floor, sec: r.sec, level: r.level,
      kpm: r.total.killsPerMin, kills: r.total.kills, swings: r.total.swings, cardDmg: r.cardDamagePct,
      hpm: r.total.hurtsPerMin, f1: f1 ? f1.sec : null, multi: r.total.multiSwingPct,
    }) + '\n');
  }
  process.exit(0);
}

const o = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; }
const [s0, s1] = String(o.seeds || '1-20').split('-').map(Number);
const seeds = []; for (let s = s0; s <= (s1 || s0); s++) seeds.push(s);
const nJobs = Number(o.jobs || 4);
const { load } = require(path.join(ROOT, 'tools', 'load'));
const BD = load();
const ALL = BD.cards.ids();

const tasks = [];
if (o.mode === 'dealt') {
  for (const s of seeds) tasks.push({ key: 'dealt', seed: s, hand: BD.cardRt.dealHand(s, ALL, 0) });
} else {
  const ids = o.only ? String(o.only).split(',') : ALL;
  for (const s of seeds) tasks.push({ key: '(no card)', seed: s, hand: [] });
  for (const id of ids) for (const s of seeds) tasks.push({ key: id, seed: s, hand: [id] });
}
// longest first: interleave so every worker gets a mix
const chunks = Array.from({ length: nJobs }, () => []);
tasks.forEach((t, i) => chunks[i % nJobs].push(t));

const t0 = Date.now();
const out = [];
Promise.all(chunks.filter((c) => c.length).map((c) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [__filename, '--worker', Buffer.from(JSON.stringify(c)).toString('base64')], { cwd: ROOT });
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { out.push(JSON.parse(buf.slice(0, k))); buf = buf.slice(k + 1); if (o.verbose) process.stderr.write('.'); } });
  p.stderr.on('data', (d) => process.stderr.write(d));
  p.on('close', (code) => (code ? rej(new Error('worker exit ' + code)) : res()));
}))).then(() => {
  const q = (a, p) => { const s = a.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const groups = {};
  if (o.mode === 'dealt') { for (const r of out) for (const id of r.hand) (groups[id] = groups[id] || []).push(r); groups['(all)'] = out; }
  else for (const r of out) (groups[r.key] = groups[r.key] || []).push(r);
  const row = (name, rs) => {
    const wins = rs.filter((r) => r.result === 'win').length;
    const sw = rs.reduce((s, r) => s + r.swings, 0), k = rs.reduce((s, r) => s + r.kills, 0);
    return { name, runs: rs.length, wins, winPct: Math.round((100 * wins) / rs.length), floor: q(rs.map((r) => r.floor), 0.5), kpm: q(rs.map((r) => r.kpm), 0.5),
      spk: Math.round((100 * sw) / Math.max(1, k)) / 100, cardDmg: q(rs.map((r) => r.cardDmg), 0.5), hpm: q(rs.map((r) => r.hpm), 0.5), f1: q(rs.map((r) => r.f1), 0.5), multi: q(rs.map((r) => r.multi), 0.5), level: q(rs.map((r) => r.level), 0.5) };
  };
  const rows = Object.keys(groups).sort().map((k) => row(k, groups[k]));
  const head = ['card', 'runs', 'wins', 'win %', 'floor', 'kills/min', 'swings/kill', 'card dmg %', 'hits/min', '1F sec', 'multi %', 'level'];
  console.log(`${o.mode === 'dealt' ? 'dealt hands (all 18 unlocked), per card held' : 'each card alone vs no card'}, seeds ${s0}-${s1 || s0}, human-like pilot, ${((Date.now() - t0) / 1000).toFixed(0)} s wall\n`);
  console.log(head.map((h, i) => (i ? h.padStart(11) : h.padEnd(16))).join(''));
  for (const r of rows) console.log([r.name.padEnd(16), r.runs, r.wins, r.winPct, r.floor, r.kpm, r.spk, r.cardDmg, r.hpm, r.f1, r.multi, r.level].map((v, i) => (i ? String(v).padStart(11) : v)).join(''));
  if (o.json) fs.writeFileSync(path.resolve(String(o.json)), JSON.stringify({ rows, runs: out }, null, 1));
}).catch((e) => { console.error(e); process.exit(1); });
