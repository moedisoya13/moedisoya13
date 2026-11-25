// 2-1: whole rounds where nobody throws a punch: the corner plans 'breathe' (range 1.65 m) and 'defend' (1.3 m) want to
// stand beyond jab reach (a burst starts only inside jab.reach - 0.05 = 1.10 m), so two such men never start anything.
// Usage: node 2-1.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const DT = 1 / 60;
function round(plans, seed, time) {
  const m = createMatch({ seed, plans, rounds: 1, roundTime: time });
  let thrown = 0, landed = 0, minFar = 9, sum = 0, n = 0;
  while (m.phase !== 'over') {
    stepMatch(m, DT);
    for (const e of m.events) (e.type === 'punch' && thrown++), (e.type === 'hit' && landed++);
    const [a, b] = m.bout.fighters, far = Math.hypot(a.x - b.x, a.z - b.z);
    minFar = Math.min(minFar, far); sum += far; n++;
  }
  return { thrown, landed, minFar: +minFar.toFixed(2), meanFar: +(sum / n).toFixed(2), cards: JSON.stringify(m.result.cards[0]), how: m.result.how };
}
let dead = 0, tried = 0;
for (const [p, q] of [['steady', 'steady'], ['breathe', 'breathe'], ['defend', 'defend'], ['defend', 'breathe']])
  for (const seed of [1, 2]) {
    const r = round([PLANS[p], PLANS[q]], seed, 30);
    if (p !== 'steady') (tried++, r.thrown === 0 && dead++);
    console.log(`${p} vs ${q} seed ${seed}, one 30 s round: thrown ${r.thrown}, landed ${r.landed}, closest ${r.minFar} m, mean ${r.meanFar} m, cards ${r.cards} -> ${r.how}`);
  }
// the same thing reached naturally: pro vs pro, seed 1000 (tools/balance.mjs's first match), corners advise between rounds
{
  const m = createMatch({ seed: 1000, rounds: 3, roundTime: 60 });
  let thrown = [0, 0, 0], plans = [];
  while (m.phase !== 'over') {
    if (m.phase === 'break') { const pl = [cornerAdvice(m, 0), cornerAdvice(m, 1)]; plans.push(pl.map(x => x.id).join('/')); nextRound(m, pl); continue; }
    stepMatch(m, DT);
    for (const e of m.events) if (e.type === 'punch') thrown[m.round - 1]++;
  }
  console.log(`natural: seed 1000 pro vs pro, punches thrown by round ${thrown.join(', ')}; corner plans for rounds 2,3: ${plans.join(', ')}; round-3 cards ${JSON.stringify(m.result.cards[2])}`);
  if (thrown[2] === 0) dead++, tried++;
}
console.log(dead ? `REPRO: yes ${dead}/${tried} rounds with 0 punches thrown (breathe/defend plans stand off beyond jab reach; natural case seed 1000 round 3)` : 'REPRO: no');
