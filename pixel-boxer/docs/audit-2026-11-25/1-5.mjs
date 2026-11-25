// 1-5: grade 1 cannot beat grade 2, whatever his attributes: a grade 1 with every attribute at 80 against a grade 2 at 50
// loses, is knocked down (to the body) and never knocks the grade 2 down; his punches land with about half the impulse.
// Two full matches (seeds 1000, 8919; sides swapped on the second), default loadouts, finish()'s corner advice.
// usage: node 1-5.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const { blank } = await import(root + '/src/game/profile.mjs');
const SEEDS = [1000, 8919];
const t = { wins: 0, losses: 0, draws: 0, downs: [0, 0], body: [0, 0], landed: [0, 0], J: [0, 0] };
SEEDS.forEach((seed, i) => {
  const me = i % 2, sheets = [blank(), blank()], skills = [{ all: '2' }, { all: '2' }];
  sheets[me] = blank(80);
  skills[me] = { all: '1' };
  const m = createMatch({ seed, sheets, skills, rounds: 3, roundTime: 60 });
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
    if (m.phase === 'break') { nextRound(m, [cornerAdvice(m, 0), cornerAdvice(m, 1)]); continue; }
    stepMatch(m, 1 / 60);
    for (const e of m.bout.events)
      if (e.type === 'hit') {
        const k = e.who === me ? 0 : 1;
        t.landed[k]++;
        t.J[k] += e.J;
        if (e.down) (t.downs[1 - k]++, e.part === 'body' && t.body[1 - k]++);
      }
  }
  const r = m.result;
  r.winner === null ? t.draws++ : r.winner === me ? t.wins++ : t.losses++;
  console.log(`seed ${seed}: grade 1 @80 on side ${me}: ${r.winner === me ? 'won' : r.winner === null ? 'drew' : 'lost'} (${r.how}, round ${r.round})`);
});
console.log(`grade 1 @80: W-L-D ${t.wins}-${t.losses}-${t.draws}; knocked down ${t.downs[0]} (${t.body[0]} to the body), knocked the grade 2 down ${t.downs[1]}; landed ${t.landed[0]} at ${(t.J[0] / t.landed[0]).toFixed(1)} N·s each vs ${t.landed[1]} at ${(t.J[1] / t.landed[1]).toFixed(1)}`);
console.log(`REPRO: ${t.wins === 0 && t.downs[1] === 0 ? 'yes' : 'no'} grade 1 with all attributes 80 vs grade 2 at 50: W-L-D ${t.wins}-${t.losses}-${t.draws}, downs taken ${t.downs[0]} vs given ${t.downs[1]}, ${(t.J[0] / t.landed[0]).toFixed(0)} vs ${(t.J[1] / t.landed[1]).toFixed(0)} N·s a landed punch`);
