// 2-2: a 'draw' result that names a winner (one judge for a side, two even). Usage: node 2-2.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, finish } = await import(root + '/src/game/match.mjs');
let bad = 0;
for (const seed of [7, 20, 33, 36]) {
  const m = createMatch({ seed, rounds: 1, roundTime: 8 });
  const r = finish(m);
  const contradictory = r.how === 'draw' && r.winner !== null;
  if (contradictory) bad++;
  console.log(`seed ${seed}: how=${r.how} winner=${r.winner} cards=${JSON.stringify(r.cards[0])} bout.over=${m.bout.over}${contradictory ? '  <- draw with a winner' : ''}`);
}
console.log(bad ? `REPRO: yes ${bad}/4 matches end how='draw' with winner set (bout.over set: the "winner" cheers)` : 'REPRO: no all draws have winner null');
