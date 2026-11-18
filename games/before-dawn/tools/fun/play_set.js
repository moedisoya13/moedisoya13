#!/usr/bin/env node
// The fixed set of real-browser runs behind docs/GDD-V2.md §1 (seven runs, varied hands and
// altar habits), three at a time. Re-run it on v2 to compare frame by frame.
//
//   node build.js && node tools/fun/play_set.js --out DIR [--jobs 3] [--only 21,9]
//
// Each run writes DIR/<name>/run.json and frames (see play_browser.js); DIR/set.json collects
// the summaries.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const SET = [
  { name: 's21-dealt', seed: 21 },                                                             // the lead's seed
  { name: 's9-dealt', seed: 9 },
  { name: 's1-dealt', seed: 1 },
  { name: 's43-whirl-flame-leech-trials', seed: 43, hand: 'whirl,flame,leech', altar: 'card', trial: true },
  { name: 's44-wave-tide-oneflash', seed: 44, hand: 'sword_wave,tide,one_flash', altar: 'card' },
  { name: 's45-pierce-drawcut-chain', seed: 45, hand: 'pierce,drawcut,chain_slash', altar: 'mixed' },
  { name: 's49-pilgrim-backlash-hunt-pray', seed: 49, hand: 'fire_pilgrimage,mana_backlash,kings_hunt', altar: 'pray' },
];

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const OUT = path.resolve(String(o.out || path.join(__dirname, '..', '..', 'dist', 'fun')));
const jobs = Number(o.jobs || 3);
const only = o.only ? String(o.only).split(',').map(Number) : null;
const todo = SET.filter((r) => !only || only.includes(r.seed));
fs.mkdirSync(OUT, { recursive: true });

function one(r) {
  return new Promise((res) => {
    const args = [path.join(__dirname, 'play_browser.js'), '--seed', String(r.seed), '--out', path.join(OUT, r.name)];
    if (r.hand !== undefined) args.push('--hand', r.hand);
    if (r.altar) args.push('--altar', r.altar);
    if (r.trial) args.push('--trial');
    if (o.every) args.push('--every', String(o.every));
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let txt = '';
    p.stdout.on('data', (d) => { txt += d; });
    p.stderr.on('data', (d) => { txt += d; });
    p.on('close', (code) => { console.log(`[${r.name}] ${code ? 'FAILED ' : ''}${txt.trim()}`); res(code); });
  });
}

(async () => {
  const q = todo.slice();
  await Promise.all(Array.from({ length: jobs }, async () => { while (q.length) await one(q.shift()); }));
  const all = [];
  for (const r of todo) {
    const f = path.join(OUT, r.name, 'run.json');
    if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); delete j.timeline; all.push(Object.assign({ name: r.name }, j)); }
  }
  fs.writeFileSync(path.join(OUT, 'set.json'), JSON.stringify(all, null, 1));
  console.log(`${all.length}/${todo.length} runs written to ${OUT}`);
})();
