// 3-2: a boxer put in a corner by the other man stays in it: the head (brain.mjs think, footwork) backs straight away from
// him and circles at random, with nothing about the ropes, so a man pressed into a corner mostly stays there.
// Part A: 10 seeds, man 0 (pro, default loadout, steady plan, stamina at 25%) set in a corner at (-2.2,-2.2), man 1 (pro,
// pressure plan) 0.95 m in front of him toward the centre; the share of the next 12 s man 0 spends in the corner (within 0.5 m
// of both ropes).
// Part B: two whole rounds from full matches where it happened by itself (grade 1 default loadout seed 2; 4암 full loadout seed 2).
// Usage: node 3-2.mjs <pixel-boxer root>
const root = process.argv[2];
const M = await import(root + '/src/game/match.mjs');
const B = await import(root + '/src/game/brain.mjs');
const { settle } = await import(root + '/src/game/bout.mjs');
const { RING } = await import(root + '/src/world/ring.mjs');
const { TECHNIQUES } = await import(root + '/src/game/techniques.mjs');
const DT = 1 / 60, half = RING.half;
const inCorner = f => Math.abs(f.x) > half - 0.5 && Math.abs(f.z) > half - 0.5;

console.log('A: man 0 (stamina at 25%: tired) set in the corner at (-2.2, -2.2), man 1 (fresh, pressure plan) 0.95 m in front');
const shares = [], ropeShares = [];
for (let s = 1; s <= 10; s++) {
  const m = M.createMatch({ seed: 500 + s * 101, plans: [B.PLANS.steady, B.PLANS.pressure], rounds: 1, roundTime: 60 });
  const [a, b] = m.bout.fighters, d = 0.95 / Math.SQRT2;
  a.x = -2.2; a.z = -2.2; b.x = -2.2 + d; b.z = -2.2 + d;
  a.yaw = Math.atan2(b.x - a.x, b.z - a.z); b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
  a.stamina = 0.25 * a.k.staminaMax;
  settle(m.bout);
  let t = 0, hits = 0, inside = 0, steps = 0, onRopes = 0;
  while (t < 12 && m.phase === 'fight') {
    M.stepMatch(m, DT);
    t += DT; steps++;
    for (const e of m.bout.events) if (e.type === 'hit' && e.on === 0) hits++;
    if (inCorner(a)) inside++;
    if (half - Math.max(Math.abs(a.x), Math.abs(a.z)) < 0.4) onRopes++;
  }
  const share = inside / steps;
  shares.push(share); ropeShares.push(onRopes / steps);
  console.log(`  seed ${500 + s * 101}: in the corner ${(100 * share).toFixed(0)}%, on the ropes (within 0.4 m) ${(100 * onRopes / steps).toFixed(0)}% of ${t.toFixed(1)} s, hits taken ${hits}, hp ${a.hp.toFixed(0)}, ends at (${a.x.toFixed(2)}, ${a.z.toFixed(2)}), phase ${m.phase}`);
}
const stuck = shares.filter(x => x >= 0.8).length, mean = shares.reduce((a, b) => a + b, 0) / shares.length;
const ropeMean = ropeShares.reduce((a, b) => a + b, 0) / 10;
console.log(`  ${stuck} of 10 spend 80% or more of the 12 s in the corner; mean share in the corner ${(100 * mean).toFixed(0)}%, on the ropes ${(100 * ropeMean).toFixed(0)}%`);

console.log('B: whole rounds (both corners boxed by brains, steady plan, 1 round of 60 s), longest stretch a man spends in a corner');
const ids = Object.keys(TECHNIQUES).filter(id => TECHNIQUES[id].ready);
let longest = 0;
for (const [grade, techniques, seed] of [['1', undefined, 2], ['4a', [ids, ids], 2]]) {
  const m = M.createMatch({ seed: 1000 + seed * 7919, skills: [{ all: grade }, { all: grade }], techniques, rounds: 1, roundTime: 60 });
  const run = [0, 0], best = [0, 0], hits = [0, 0], hitsBest = [0, 0];
  let k = 0;
  while (m.phase !== 'over' && m.phase !== 'break' && k++ < 60 * 200) {
    M.stepMatch(m, DT);
    m.bout.fighters.forEach((f, i) => {
      if (m.phase === 'fight' && inCorner(f)) {
        run[i] += DT;
        for (const e of m.bout.events) if (e.type === 'hit' && e.on === i) hits[i]++;
        if (run[i] > best[i]) (best[i] = run[i]), (hitsBest[i] = hits[i]);
      } else (run[i] = 0), (hits[i] = 0);
    });
  }
  const i = best[0] >= best[1] ? 0 : 1;
  longest = Math.max(longest, best[i]);
  console.log(`  grade ${grade}, ${techniques ? 'full' : 'default'} loadout, seed ${1000 + seed * 7919}: man ${i} ${best[i].toFixed(1)} s in a corner without a break, ${hitsBest[i]} hits taken there (loadout ${JSON.stringify(m.bout.fighters[i].techniques)})`);
}
console.log(longest >= 10 ? `REPRO: yes no ring sense: in whole rounds a man stays up to ${longest.toFixed(1)} s in a corner taking hits; a tired man started in a corner is on the ropes ${(100 * ropeMean).toFixed(0)}% of the next 12 s (in the corner ${(100 * mean).toFixed(0)}%)` : `REPRO: no longest ${longest.toFixed(1)} s`);
