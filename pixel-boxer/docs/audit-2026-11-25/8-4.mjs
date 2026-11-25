// 8-4: docs/spar.md's 숫자 (seeds 1-50, "2026-11-25") no longer match the code at this commit: e.g. #43 goes down at 34.1 s
// (docs: the earliest of 50 is 36.8 s) and #35 ends in a 실신 (knock-out) hook, a kind the docs' knockdown list does not have.
// usage: node 8-4.mjs <pixel-boxer root> [seeds]
const root = process.argv[2];
const seeds = (process.argv[3] || '43,35').split(',').map(Number);
const { planOf } = await import(root + '/src/spar/plan.mjs');
let off = 0;
for (const seed of seeds) {
  const p = planOf(seed), ko = p.ko;
  const early = ko.at < 36.8, out = !!ko.out;
  off += early || out;
  console.log(`#${seed}: KO at ${ko.at} s${early ? ' (docs: earliest of seeds 1-50 is 36.8 s)' : ''}, ${ko.name} ${ko.worth} N·s${out ? ` 실신 (${ko.out}) (docs list no 실신 knockdowns)` : ''}`);
}
console.log(off ? `REPRO: yes ${off} of ${seeds.length} seeds contradict docs/spar.md 숫자 (seeds 1-50)` : 'REPRO: no');
