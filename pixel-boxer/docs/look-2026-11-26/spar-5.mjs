// spar-5: the rails and the whole list name a punch "(크로스 카운터)" whenever the press was meant as one (tech: 'crossCounter',
// src/spar/plan.mjs:464 presses { power: true, tech }), but the engine throws its cross-over (anim id crossOver) only some
// of the time; otherwise a plain straight, a hook or an uppercut goes out wearing the name ("훅 (크로스 카운터)"), and the
// real one reads "크로스 카운터 (크로스 카운터)". Usage: node spar-2.mjs <pixel-boxer root> [seeds, comma]
const root = process.argv[2], seeds = (process.argv[3] || '15,20').split(',').map(Number);
const { planOf } = await import(root + '/src/spar/plan.mjs');
const { labelOf, saidOf } = await import(root + '/src/spar/names.mjs');
let n = 0, real = 0, other = 0, doubled = 0;
for (const s of seeds) {
  const plan = planOf(s);
  for (const r of plan.rails) for (const b of r) if (b.tech === 'crossCounter') {
    n++;
    const label = labelOf(b);
    if (b.name === 'crossOver') real++; else other++;
    if (/크로스 카운터 \(크로스 카운터\)/.test(label)) doubled++;
    console.log(`#${s} ${(b.from / 60).toFixed(1)} s ${b.who ? '파랑' : '빨강'}: motion ${b.name} -> shown "${label}" ${saidOf(b)}`);
  }
}
console.log(`REPRO: ${other ? 'yes' : 'no'} ${other} of ${n} punches named "(크로스 카운터)" are not the cross-over motion (${real} are; ${doubled} read "크로스 카운터 (크로스 카운터)")`);
