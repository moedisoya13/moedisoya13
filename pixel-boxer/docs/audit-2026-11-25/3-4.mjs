// 3-4: the heads stand still a third of the time. In brain.mjs think the feet go to his range (no drift inside a band of
// -0.16..+0.1 m round it) and round him only when brain.circle, drawn from [-1, 0, 0, 1] every 0.8-2.4 s, is not 0 (half the
// draws), at plan.circle 0.2 of full speed for the steady plan. 3 seeds, pros, default loadout, steady plan, one round of
// 60 s: the share of the fighting time each man is doing nothing at all (no action, guard down, speed under 5 cm/s), the
// longest such stretch, and the share and longest stretch with BOTH men doing nothing at once (what the picture shows as
// a standstill). Usage: node 3-4.mjs <pixel-boxer root>
const root = process.argv[2];
const M = await import(root + '/src/game/match.mjs');
const DT = 1 / 60;
let tot = 0, idle = [0, 0], both = 0, longest = 0, longestBoth = 0, rows = [];
for (const seed of [1000 + 7919, 1000 + 2 * 7919, 1000 + 3 * 7919]) {
  const m = M.createMatch({ seed, rounds: 1, roundTime: 60 });
  const run = [0, 0];
  let runB = 0, n = 0, id = [0, 0], bo = 0, lo = 0, loB = 0, loAt = 0;
  while (m.phase !== 'over' && m.phase !== 'break') {
    M.stepMatch(m, DT);
    if (m.phase !== 'fight' || m.bout.fighters.some(f => f.down)) { run[0] = run[1] = runB = 0; continue; }
    n++;
    const still = m.bout.fighters.map(f => !f.action && !f.cover && Math.hypot(f.vx, f.vz) < 0.05);
    still.forEach((s, i) => { run[i] = s ? run[i] + DT : 0; if (s) id[i]++; if (run[i] > lo) (lo = run[i]), (loAt = m.bout.t); });
    runB = still[0] && still[1] ? runB + DT : 0;
    if (still[0] && still[1]) bo++;
    loB = Math.max(loB, runB);
  }
  tot += n; idle[0] += id[0]; idle[1] += id[1]; both += bo; longest = Math.max(longest, lo); longestBoth = Math.max(longestBoth, loB);
  rows.push(`  seed ${seed}: ${(n / 60).toFixed(1)} s of fighting; doing nothing: man 0 ${(100 * id[0] / n).toFixed(0)}%, man 1 ${(100 * id[1] / n).toFixed(0)}%, longest ${lo.toFixed(2)} s (ending t=${loAt.toFixed(1)}); both at once ${(100 * bo / n).toFixed(0)}%, longest ${loB.toFixed(2)} s`);
}
console.log(rows.join('\n'));
const share = (idle[0] + idle[1]) / (2 * tot), shareB = both / tot;
console.log(`over ${(tot / 60).toFixed(0)} s: each man does nothing ${(100 * share).toFixed(0)}% of the time (longest ${longest.toFixed(2)} s); both at once ${(100 * shareB).toFixed(0)}% (longest ${longestBoth.toFixed(2)} s)`);
console.log(share > 0.2 ? `REPRO: yes each man stands doing nothing ${(100 * share).toFixed(0)}% of the fighting time, up to ${longest.toFixed(1)} s at a stretch; both at once ${(100 * shareB).toFixed(0)}% (up to ${longestBoth.toFixed(1)} s)` : `REPRO: no idle ${(100 * share).toFixed(0)}%`);
