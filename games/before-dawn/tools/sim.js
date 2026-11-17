#!/usr/bin/env node
// Headless runner. Examples:
//   node tools/sim.js --seed 1 --bot
//   node tools/sim.js --seeds 1-20 --bot --hand pierce,chain_slash
//   node tools/sim.js --seed 3 --gen          (print the generated floors)
'use strict';
const { load } = require('./load');

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
const H = BD.harness();
let seeds = [Number(o.seed || 1)];
if (o.seeds) { const [a, b] = String(o.seeds).split('-').map(Number); seeds = []; for (let s = a; s <= (b || a); s++) seeds.push(s); }

if (o.gen) {
  for (const s of seeds) {
    const g = H.gen(s, Number(o.tier || 0));
    console.log(`seed ${s} dom order ${g.domOrder.join(' ')}${g.reduced ? ' (reduced: ' + g.reduced + ')' : ''} hand ${g.hand.join(',')}`);
    for (let n = 1; n <= 6; n++) {
      const f = g.floors[n];
      console.log(`  ${n}F ${f.domType} ${f.w}x${f.h} ${f.shape}/${f.pattern} tries=${f.attempts} waves=${f.spawns.w1.length}/${f.spawns.w2.length}/${f.spawns.w3.length} guardian=${f.spawns.guardian || f.spawns.boss}`);
      if (o.grid) for (let y = 0; y < f.h; y++) console.log('     ' + f.cells.slice(y * f.w, (y + 1) * f.w));
    }
  }
  process.exit(0);
}

const results = [];
const t0 = Date.now();
for (const s of seeds) {
  const r = H.sim({ seed: s, tier: Number(o.tier || 0), hand: o.hand, maxSec: Number(o.maxSec || 1500), bot: o.bot !== undefined || true, trial: !!o.trial });
  results.push(r);
  console.log(`seed ${s}: ${r.result} floor ${r.floor} t=${r.sec.toFixed(1)}s kills ${r.kills} cards ${r.cards.join(',')} events ${r.events}${r.cause ? ' cause ' + r.cause : ''}`);
}
if (seeds.length > 1) {
  const wins = results.filter((r) => r.result === 'win').length;
  const floors = results.map((r) => r.floor).sort((a, b) => a - b);
  console.log(`${seeds.length} runs: ${wins} wins, median floor ${floors[Math.floor(floors.length / 2)]}, ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
}
