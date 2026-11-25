// 6-5: an auto-battled match (game/match.mjs, both corners boxed by brains, each corner's own advice between rounds): how much
// of each round each man spends on the ropes or in a corner, the plan he was on, and the longest he stays there at a time.
// node 6-5.mjs <pixel-boxer root> [seeds, e.g. 1-3]
const root = process.argv[2];
const [s0, s1] = (process.argv[3] || '1-3').split('-').map(Number);
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { RULES } = await import(root + '/src/game/bout.mjs');
const DT = 1 / 60;
const planName = p => Object.keys(PLANS).find(k => PLANS[k] === p) || '?';
let man = 0, onRopes = 0, inCorner = 0, longest = 0, worstRound = '';
for (let s = s0; s <= s1; s++) {
  const m = createMatch({ seed: s });
  let r = null;
  const flush = () => {
    if (!r || !r.frames) return;
    const pc = (v) => ((v / r.frames) * 100).toFixed(0) + '%';
    console.log(`seed ${s} round ${r.round}: plans red ${r.plans[0]}, blue ${r.plans[1]}; within 10 cm of the ropes red ${pc(r.edge[0])}, blue ${pc(r.edge[1])}; in a corner red ${pc(r.corner[0])}, blue ${pc(r.corner[1])}; longest stay on the ropes ${(Math.max(...r.most) / 60).toFixed(1)} s`);
    man += 2 * r.frames; onRopes += r.edge[0] + r.edge[1]; inCorner += r.corner[0] + r.corner[1];
    if (Math.max(...r.most) > longest) (longest = Math.max(...r.most)), (worstRound = `seed ${s} round ${r.round}`);
  };
  while (m.phase !== 'over') {
    if (!r || r.round !== m.round) flush(), (r = { round: m.round, plans: m.brains.map(b => planName(b.plan)), frames: 0, edge: [0, 0], corner: [0, 0], run: [0, 0], most: [0, 0] });
    if (m.phase === 'break') { nextRound(m, [cornerAdvice(m, 0), cornerAdvice(m, 1)]); continue; }
    stepMatch(m, DT);
    if (m.phase !== 'fight') continue;
    r.frames++;
    m.bout.fighters.forEach((f, i) => {
      const out = Math.max(Math.abs(f.x), Math.abs(f.z)), inn = Math.min(Math.abs(f.x), Math.abs(f.z));
      if (out > RULES.half - 0.1) (r.edge[i]++, r.run[i]++, (r.most[i] = Math.max(r.most[i], r.run[i])));
      else r.run[i] = 0;
      if (inn > RULES.half - 0.3) r.corner[i]++;
    });
  }
  flush();
  console.log(`seed ${s}: ${JSON.stringify(m.result && { winner: m.result.winner, how: m.result.how })}`);
}
console.log(`seeds ${s0}-${s1}: man-time within 10 cm of the ropes ${(onRopes / man * 100).toFixed(1)}%, in a corner ${(inCorner / man * 100).toFixed(1)}%; longest single stay ${(longest / 60).toFixed(1)} s (${worstRound})`);
console.log(longest / 60 > 5 ? `REPRO: yes a man stays on the ropes up to ${(longest / 60).toFixed(1)} s at a time (${worstRound}); ${(onRopes / man * 100).toFixed(0)}% of all man-time on the ropes, ${(inCorner / man * 100).toFixed(0)}% in a corner` : `REPRO: no longest stay ${(longest / 60).toFixed(1)} s`);
