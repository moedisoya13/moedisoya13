// 3-3: within a round the head does not know he is hurt. brain.mjs think (and ai.mjs think) read his stamina and his stun,
// never his health: a man on 15 health of 100 decides exactly what the same man on 100 decides. Method: 3 seeds, pros,
// default loadout, steady plan, 30 s of each fight; at every step the head is asked twice more on copies (the brain
// structuredClone'd, the bout and man 0 seen through a prototype so nothing real is touched): once with man 0's health set
// to 15, once to 100. The two answers are compared. As a check that the method can see a difference, the same is done with
// his stamina at 20% instead. The real bout steps on as normal. Usage: node 3-3.mjs <pixel-boxer root>
const root = process.argv[2];
const M = await import(root + '/src/game/match.mjs');
const B = await import(root + '/src/game/brain.mjs');
const A = await import(root + '/src/game/ai.mjs');
const DT = 1 / 60;
const key = c => JSON.stringify(c);
function ask(m, who, patch, rival) {
  const bout = m.bout, f = bout.fighters[who], me = Object.assign(Object.create(f), patch);
  const fighters = bout.fighters.slice();
  fighters[who] = me;
  const view = Object.assign(Object.create(bout), { fighters, seed: bout.seed });
  if (rival) return key(A.think(structuredClone(rival), view, DT));
  return key(B.think(structuredClone(m.brains[who]), view, DT === DT ? who : who, DT));
}
let n = 0, sameHp = 0, sameSt = 0, nR = 0, sameHpR = 0, sameStR = 0;
for (const seed of [11, 22, 33]) {
  const m = M.createMatch({ seed, rounds: 1, roundTime: 60 });
  const rival = A.createRival('contender');
  let k = 0;
  while (k++ < 60 * 30 && m.phase !== 'over') {
    if (m.phase === 'fight' && !m.bout.fighters[0].down && !m.bout.fighters[1].down) {
      n++;
      const hurt = ask(m, 0, { hp: 15 }), fit = ask(m, 0, { hp: 100 }), tired = ask(m, 0, { hp: 100, stamina: 0.2 * m.bout.fighters[0].k.staminaMax });
      if (hurt === fit) sameHp++;
      if (tired === fit) sameSt++;
      // (the rival's head, ai.mjs, asked about the same moment as boxer 1)
      nR++;
      const rh = ask(m, 1, { hp: 15 }, rival), rf = ask(m, 1, { hp: 100 }, rival), rt = ask(m, 1, { hp: 100, stamina: 0.2 * m.bout.fighters[1].k.staminaMax }, rival);
      if (rh === rf) sameHpR++;
      if (rt === rf) sameStR++;
    }
    M.stepMatch(m, DT);
  }
}
console.log(`brain.mjs: asked ${n} times; health 15 vs 100 gave the same controls ${sameHp} times (${(100 * sameHp / n).toFixed(1)}%); stamina 20% vs full gave the same ${sameSt} times (${(100 * sameSt / n).toFixed(1)}%)`);
console.log(`ai.mjs (rival): asked ${nR} times; health 15 vs 100 the same ${sameHpR} times (${(100 * sameHpR / nR).toFixed(1)}%); stamina 20% vs full the same ${sameStR} (${(100 * sameStR / nR).toFixed(1)}%)`);
console.log(sameHp === n && sameSt < n ? `REPRO: yes the head ignores his health: on ${n} of ${n} steps a man on 15 health decides exactly as on 100 (stamina, by contrast, changes ${n - sameSt} decisions)` : `REPRO: no ${sameHp}/${n}`);
