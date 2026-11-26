/* sfx-4: the 어퍼컷 card says "훅처럼 길게, 더 낮게 · 올려 치는 바람" and the 강타 "흡" card says "뒷손 훅: 숨 아래 짧은 목소리",
   but every uppercut in the game is rear-handed (anim/moves.mjs: upper, upperIn, upperBody all hand R), so punchOf makes it
   a power blow: the 어퍼컷 card plays the same voiced "흡" and the power swing, and sounds nearer to the 강타 card than the
   훅 card does.  node sfx-4.mjs <pixel-boxer root> */
import { open, measure, f1, profileDist } from './sfx-lib.mjs';
const root = process.argv[2];
const { MOVES } = await import(root + '/src/anim/moves.mjs');
const { punchOf } = await import(root + '/src/game/audio.mjs');
const ups = Object.keys(MOVES).filter(n => MOVES[n].kind === 'upper');
console.log('uppercuts in MOVES:', ups.map(n => `${n}(${MOVES[n].hand}, power ${punchOf(n).power})`).join(' '));
const h = await open(root);
const m = {};
for (const c of ['훅', '어퍼컷', '강타 "흡"']) {
  const r = await h.render({ card: c, dur: 2 });
  m[c] = measure(r.L, r.R);
  // the voiced share: energy 90..700 Hz (the "흡": a saw at 132 Hz through formants 640 / 1150 Hz)
  let v = 0, t = 0;
  for (let k = 1; k < m[c].spec.length; k++) {
    const f = (k * 48000) / m[c].N;
    t += m[c].spec[k];
    if (f >= 90 && f <= 700) v += m[c].spec[k];
  }
  m[c].voiced = v / t;
  console.log(`${c.padEnd(8)} cues ${r.log.at(-1)} | LUFS mom ${f1(m[c].lufsMom)} | 90-700 Hz ${(100 * m[c].voiced).toFixed(1)}%`);
}
await h.close();
const dUP = profileDist(m['어퍼컷'], m['강타 "흡"']), dHK = profileDist(m['훅'], m['강타 "흡"']), dUH = profileDist(m['어퍼컷'], m['훅']);
console.log(`spectral distance (0 same .. 1 disjoint): 어퍼컷-강타 ${dUP.toFixed(3)}, 훅-강타 ${dHK.toFixed(3)}, 어퍼컷-훅 ${dUH.toFixed(3)}`);
console.log(ups.every(n => punchOf(n).power) && dUP < dHK / 2 ? `REPRO: yes all ${ups.length} uppercuts are power blows; the 어퍼컷 card plays the "흡" its text does not mention and is ${(dHK / dUP).toFixed(1)}x nearer the 강타 card (${dUP.toFixed(3)}) than the 훅 card is (${dHK.toFixed(3)})` : 'REPRO: no');
