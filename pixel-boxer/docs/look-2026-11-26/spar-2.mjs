// spar-2: the fixed camera (yaw 0, looks across x) shows one man behind the other: the line between them turns far past
// SPAR.tilt (36 deg), which docs/spar.md says it is held to ("둘 사이 선이 36°까지 틀어짐"). Measures, per round, the share of
// frames up to the knockdown where the line lies > 36 deg and > 60 deg off the picture's width, the most, and the frames
// where the two men are less than 0.30 m apart across the picture (their bodies, ~0.45 m wide, overlap on screen).
// Usage: node spar-2.mjs <pixel-boxer root> [seeds, comma]
const root = process.argv[2], seeds = (process.argv[3] || '5,10,23').split(',').map(Number);
const { planOf, replayOf, SPAR } = await import(root + '/src/spar/plan.mjs');
let worst = 0, worstSeed = 0, tot = 0, over60 = 0, over36 = 0, overlap = 0;
for (const s of seeds) {
  const plan = planOf(s), end = plan.ko.step;
  let n = 0, a36 = 0, a60 = 0, most = 0, ov = 0, run = 0, longest = 0;
  replayOf(plan, (bout, k) => {
    if (k >= end) return;
    const [a, b] = bout.fighters, dx = b.x - a.x, dz = b.z - a.z, t = Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI;
    n++; if (t > SPAR.tilt) a36++; if (t > 60) (a60++, run++, longest = Math.max(longest, run)); else run = 0; most = Math.max(most, t); if (Math.abs(dx) < 0.3) ov++;
  });
  console.log(`#${s}: frames ${n}; line > ${SPAR.tilt} deg ${(100 * a36 / n).toFixed(1)}%, > 60 deg ${(100 * a60 / n).toFixed(1)}% (longest ${(longest / 60).toFixed(2)} s), most ${most.toFixed(1)} deg; across-picture gap < 0.30 m ${(100 * ov / n).toFixed(1)}%`);
  if (most > worst) (worst = most), (worstSeed = s);
  tot += n; over60 += a60; over36 += a36; overlap += ov;
}
const yes = worst > 60;
console.log(`all ${seeds.length}: > 36 deg ${(100 * over36 / tot).toFixed(1)}%, > 60 deg ${(100 * over60 / tot).toFixed(1)}%, overlap on screen ${(100 * overlap / tot).toFixed(1)}%`);
console.log(`REPRO: ${yes ? 'yes' : 'no'} the line between the men reaches ${worst.toFixed(0)} deg (#${worstSeed}) against the documented 36; > 60 deg in ${(100 * over60 / tot).toFixed(1)}% of frames, bodies overlapping across the picture in ${(100 * overlap / tot).toFixed(1)}%`);
