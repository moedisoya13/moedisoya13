#!/usr/bin/env node
/* Many matches, unwatched, between two kinds of boxer: who wins, and how.
     node tools/balance.mjs                       even fighters, both sides: is the ring fair?
     node tools/balance.mjs power=70              one attribute raised on one side, against an even fighter
     node tools/balance.mjs --n 40 --rounds 3 --time 60
   Each pairing is fought with the boxers both ways round, so that a side of the ring cannot pass for an attribute. */
import { createMatch, finish } from '../src/game/match.mjs';
import { blank } from '../src/game/profile.mjs';

const args = process.argv.slice(2),
  opt = (name, d) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? Number(args[i + 1]) : d;
  },
  N = opt('n', 24),
  rounds = opt('rounds', 3),
  roundTime = opt('time', 60),
  change = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('=')).map(([k, v]) => [k, Number(v)]));

export function series(a, b, n, o) {
  o = o || {};
  const out = { n, wins: [0, 0], draws: 0, how: {}, sides: [0, 0], rounds: 0, landed: [0, 0], thrown: [0, 0], downs: [0, 0] };
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1,
      m = createMatch({ seed: 1000 + i * 7919, sheets: swap ? [b, a] : [a, b], rounds: o.rounds || 3, roundTime: o.roundTime || 60 }),
      r = finish(m),
      as = swap ? 1 : 0; // which side `a` was on
    if (r.winner === null) out.draws++;
    else {
      out.wins[r.winner === as ? 0 : 1]++;
      out.sides[r.winner]++;
    }
    out.how[r.how] = (out.how[r.how] || 0) + 1;
    out.rounds += r.round;
    for (const round of m.stats)
      for (const side of [0, 1]) {
        const who = side === as ? 0 : 1;
        out.landed[who] += round[side].landed;
        out.thrown[who] += round[side].thrown;
        out.downs[who] += round[side].downs;
      }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = Object.assign(blank(), change),
    b = blank(),
    t0 = performance.now(),
    r = series(a, b, N, { rounds, roundTime }),
    pct = (x, y) => (y ? Math.round((100 * x) / y) + '%' : '-');
  console.log(`${JSON.stringify(change) === '{}' ? 'even' : JSON.stringify(change)} vs even, ${N} matches of ${rounds} x ${roundTime}s (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`  wins ${r.wins[0]} : ${r.wins[1]}, draws ${r.draws}   by side of the ring ${r.sides[0]} : ${r.sides[1]}`);
  console.log(`  how ${JSON.stringify(r.how)}, average length ${(r.rounds / N).toFixed(1)} rounds`);
  console.log(`  landed ${r.landed[0]}/${r.thrown[0]} (${pct(r.landed[0], r.thrown[0])}) vs ${r.landed[1]}/${r.thrown[1]} (${pct(r.landed[1], r.thrown[1])}), knockdowns ${r.downs[0]} : ${r.downs[1]}`);
}
