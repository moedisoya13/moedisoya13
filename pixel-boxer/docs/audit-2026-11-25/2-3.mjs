// 2-3: the referee's count goes on to ten while a man who "beat the count" is still getting up off the canvas (his rise
// is a floor move of 1.15-2.4 s, the count 0.6 s a number), and he is not counted out. Usage: node 2-3.mjs <root>
const root = process.argv[2];
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const { MOVES } = await import(root + '/src/anim/moves.mjs');
const DT = 1 / 60;
let downs = 0, risen = 0, tenStanding = 0;
for (const [seed, skills] of [[1000, [{}, {}]], [40595, [{}, {}]], [1000, [{ all: '5a' }, { all: '5a' }]], [16838, [{ all: '5a' }, { all: '5a' }]]]) {
  const m = createMatch({ seed, skills, rounds: 3, roundTime: 60 });
  let cur = null;
  while (m.phase !== 'over') {
    if (m.phase === 'break') { nextRound(m, [cornerAdvice(m, 0), cornerAdvice(m, 1)]); continue; }
    const was = m.phase;
    stepMatch(m, DT);
    for (const e of m.events) {
      if (e.type === 'down') (downs++, (cur = { who: e.who, up: null, max: 0, t0: m.bout.t, floorAt10: null }));
      if (e.type === 'up' && cur) (risen++, (cur.up = e.n), (cur.upT = m.bout.t - cur.t0));
      if (e.type === 'count' && cur) {
        cur.max = e.n;
        if (e.n === 10 && cur.up) { const f = m.bout.fighters[cur.who]; cur.floorAt10 = f.action ? f.action.name : null; }
      }
    }
    if (was === 'count' && m.phase !== 'count' && cur) {
      const ok = !(cur.up && cur.max >= 10);
      if (!ok) tenStanding++;
      console.log(`seed ${seed} ${JSON.stringify(skills[0])}: down (fighter ${cur.who}), up called at ${cur.up}, count reached ${cur.max}${cur.floorAt10 ? ` with him still in '${cur.floorAt10}' (a floor move)` : ''}, back to fighting ${(m.bout.t - cur.t0).toFixed(2)} s after the down -> ${m.phase === 'over' ? m.result.how : 'fights on'}`);
      cur = null;
    }
  }
}
console.log(tenStanding ? `REPRO: yes ${tenStanding}/${risen} men who beat the count were counted to 10 while still on the canvas, and fought on` : `REPRO: no (${risen} rises, none counted to 10)`);
