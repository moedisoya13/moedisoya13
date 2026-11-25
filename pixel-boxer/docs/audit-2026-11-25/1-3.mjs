// 1-3: a whole round in which nobody throws a punch. Both corners tell their men to breathe (match.mjs cornerAdvice: fatigue < 0.5
// -> PLANS.breathe), the breathe plan wants 1.65 m and more (brain.mjs), beyond jab reach, so neither ever starts a combination
// and the round is scored 10-10 on every card.
// Match: seed 48514, grade 1 vs grade 2, even sheets, default loadouts, finish()'s own corner advice (as tools/balance.mjs fights).
// usage: node 1-3.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const { fatigue } = await import(root + '/src/game/profile.mjs');
const { MOVES } = await import(root + '/src/anim/moves.mjs');
const m = createMatch({ seed: 48514, skills: [{ all: '1' }, { all: '2' }], rounds: 3, roundTime: 60 });
const rounds = [];
let cur = null;
const open = () => {
  cur = { round: m.round, plans: m.brains.map(b => b.plan.id), fresh: m.bout.fighters.map(f => +fatigue(f).toFixed(2)), minGap: 9, inJab: 0, frames: 0 };
  rounds.push(cur);
};
open();
let guard = 0;
while (m.phase !== 'over' && guard++ < 60 * 60 * 30) {
  if (m.phase === 'break') { nextRound(m, [cornerAdvice(m, 0), cornerAdvice(m, 1)]); open(); continue; }
  stepMatch(m, 1 / 60);
  const [a, b] = m.bout.fighters, gap = Math.hypot(a.x - b.x, a.z - b.z);
  cur.frames++;
  cur.minGap = Math.min(cur.minGap, gap);
  if (gap < MOVES.jab.reach - 0.05) cur.inJab++;
}
rounds.forEach((r, i) => {
  const st = m.stats[i];
  console.log(`round ${r.round}: plans ${r.plans.join(' / ')}, freshness at the bell ${r.fresh.join(' / ')}, thrown ${st[0].thrown} : ${st[1].thrown}, landed ${st[0].landed} : ${st[1].landed}, nearest ${r.minGap.toFixed(2)} m, inside jab reach ${(r.inJab / 60).toFixed(1)} s of ${(r.frames / 60).toFixed(1)} s, cards ${JSON.stringify(m.cards[i] || null)}`);
});
console.log('result', JSON.stringify({ winner: m.result.winner, how: m.result.how, round: m.result.round }));
const empty = m.stats.findIndex(st => st[0].thrown + st[1].thrown === 0);
console.log(`REPRO: ${empty >= 0 ? 'yes' : 'no'} ${empty >= 0 ? `round ${empty + 1} (plans ${rounds[empty].plans.join('/')}): 0 punches thrown in ${(rounds[empty].frames / 60).toFixed(0)} s, nearest ${rounds[empty].minGap.toFixed(2)} m (jab reach ${MOVES.jab.reach} m)` : 'every round had a punch'}`);
