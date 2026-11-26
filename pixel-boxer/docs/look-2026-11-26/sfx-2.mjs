/* sfx-2: the 세기 slider (20..140 N·s, "타격·막기·신음") does nothing over parts of its range, and the voice cards play at
   strengths where the game never voices a man.  Renders are deterministic (seeded random), so "nothing" is sample-exact.
     카운터: J x COUNTER_GAIN(1.8) is clamped at s = 2 (170 N·s) in impact and at 1.6 (136) in gasp -> identical above ~95
     머리 "헉" (gasp): s clamped at 0.5 -> identical below 42.5;   몸통 "욱" (grunt): clamped at 0.4 -> identical below 34
     and cuesOf voices a body blow only from 45 N·s, a head blow from 70 (the cards' own text), but the cards play at any J.
   node sfx-2.mjs <pixel-boxer root> */
import { open, measure, f1 } from './sfx-lib.mjs';
const root = process.argv[2];
const { cuesOf } = await import(root + '/src/game/audio.mjs');
const h = await open(root);
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.L.length; i++) d = Math.max(d, Math.abs(a.L[i] - b.L[i]), Math.abs(a.R[i] - b.R[i]));
  return d;
};
const out = [];
for (const [card, Js] of [['카운터', [95, 120, 140]], ['머리 "헉"', [20, 30, 42]], ['몸통 "욱"', [20, 27, 34]], ['머리', [95, 120, 140]]]) {
  const r = [];
  for (const J of Js) r.push(await h.render({ card, J, dur: 3 }));
  const d = Math.max(...r.slice(1).map(x => diff(r[0], x)));
  out.push([card, Js, d, r.map(x => f1(measure(x.L, x.R).lufsMom)).join(' / ')]);
}
await h.close();
for (const [card, Js, d, l] of out) console.log(`${card.padEnd(10)} J ${Js.join(', ').padEnd(12)} max sample difference ${d.toExponential(2)}   LUFS mom ${l}`);
// what the game plays for the same strengths
for (const [J, part] of [[30, 'body'], [44, 'body'], [45, 'body'], [40, 'glove'], [69, 'glove'], [70, 'glove']]) console.log(`game cuesOf hit ${part} J ${J}: ${cuesOf({ type: 'hit', who: 1, on: 0, J, part }, {}).map(c => c.name).join(' + ')}`);
const dead = out.filter(o => o[2] < 1e-5).map(o => `${o[0]} ${o[1][0]}-${o[1].at(-1)}`);
console.log(dead.length ? `REPRO: yes slider moves change nothing (max sample difference under 1e-5) for ${dead.join('; ')}` : 'REPRO: no');
