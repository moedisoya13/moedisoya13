// 8-3: knockdown blows weaker than docs/spar.md and the card spar-finish say is the floor ("15 of 50 under 45 N·s, the
// lowest 9.8"): seeds 12 and 44 go down to a 7.6 and a 9.2 N·s straight, and the victim's health just before it.
// usage: node 8-3.mjs <pixel-boxer root> [seeds]
const root = process.argv[2];
const seeds = (process.argv[3] || '12,44').split(',').map(Number);
const { planOf, replayOf } = await import(root + '/src/spar/plan.mjs');
let lowest = Infinity, at = null;
for (const seed of seeds) {
  const p = planOf(seed), ko = p.ko;
  let hpBefore = null;
  replayOf(p, (bout, k) => k === ko.step - 2 && (hpBefore = bout.fighters[ko.on].hp));
  console.log(`#${seed} ${p.men.map(m => m.grade).join(' v ')} hp ${p.hp}: KO at ${ko.at} s by ${['red', 'blue'][ko.by]} ${ko.name} ${ko.worth} N·s${ko.counter ? ' counter' : ''}; the man down had ${hpBefore && hpBefore.toFixed(2)} health the step before`);
  if (ko.worth < lowest) (lowest = ko.worth), (at = seed);
}
console.log(lowest < 9.8 ? `REPRO: yes #${at} goes down to a ${lowest} N·s blow, under the documented floor of 9.8 N·s (docs/spar.md, card spar-finish)` : `REPRO: no lowest ${lowest} N·s`);
