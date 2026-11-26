/* sfx-p3 (evidence): sounds whose measured level or shape goes against what their code and card say, and pairs that
   should differ but measure alike. Loudness = momentary max (400 ms, K-weighted, LUFS-ish); distance = total variation of
   the 1/3-octave energy profiles (0 same .. 1 disjoint).  node sfx-p3.mjs <pixel-boxer root> */
import { open, measure, f1, profileDist, SR } from './sfx-lib.mjs';
const root = process.argv[2];
const h = await open(root);
const M = {};
const card = async (c, o = {}) => {
  const r = await h.render(Object.assign({ card: c, dur: 2 }, o));
  return (M[c + JSON.stringify(o)] = Object.assign(measure(r.L, r.R), { log: r.log.at(-1), r }));
};
const band = (m, lo, hi) => {
  let s = 0, t = 0;
  for (let k = 1; k < m.spec.length; k++) {
    const f = (k * SR) / m.N;
    t += m.spec[k];
    if (f >= lo && f < hi) s += m.spec[k];
  }
  return s / t;
};
const glove = await card('글러브로 막기'), fore = await card('팔뚝으로 막기'), roll = await card('숄더 롤'), parry = await card('쳐내기');
console.log(`글러브 막기 ${f1(glove.lufsMom)} LUFS ${Math.round(glove.span * 1000)} ms | 팔뚝 ${f1(fore.lufsMom)} ${Math.round(fore.span * 1000)} ms | 숄더 롤 ${f1(roll.lufsMom)} ${Math.round(roll.span * 1000)} ms | 쳐내기 ${f1(parry.lufsMom)} ${Math.round(parry.span * 1000)} ms`);
console.log(`  code levels (log): ${glove.log} | ${roll.log} | ${parry.log}`);
console.log(`  glove block: ${(100 * band(glove, 120, 260)).toFixed(0)}% of its energy at 120-260 Hz (the triangle 210->140 Hz), spectral flatness ${glove.flat.toFixed(3)} (0 tonal .. 1 noise); the "slap" noise band 650-1000 Hz ${(100 * band(glove, 650, 1000)).toFixed(1)}%`);
console.log(`  distance glove-forearm ${profileDist(glove, fore).toFixed(3)}, glove-parry ${profileDist(glove, parry).toFixed(3)}, glove-roll ${profileDist(glove, roll).toFixed(3)}`);
const dash = await card('대시');
console.log(`대시: ${(100 * band(dash, 2000, 6000)).toFixed(0)}% at 2-6 kHz (the triangle squeak 2.4->2.9 kHz), flatness ${dash.flat.toFixed(3)}; the scuff band 200-500 Hz ${(100 * band(dash, 200, 500)).toFixed(1)}%`);
// voices: red vs blue (the same card, the voice control)
for (const c of ['몸통 "욱"', '머리 "헉"', '다운의 숨', '잽 "츳"']) {
  const a = await card(c), b = await card(c, { who: 1 });
  console.log(`${c} red vs blue: distance ${profileDist(a, b).toFixed(3)}, centroid ${Math.round(a.centroid)} / ${Math.round(b.centroid)} Hz`);
}
const jab = await card('잽 "츳"'), str = await card('스트레이트 "쉭"'), tired = await card('지친 숨');
console.log(`breaths: jab-straight ${profileDist(jab, str).toFixed(3)}, straight-tired ${profileDist(str, tired).toFixed(3)}; head-body hit ${profileDist(await card('머리'), await card('몸통')).toFixed(3)}`);
// the counter's crack: the impact alone, J 85 x 1.8, with and without counter (the crack is the last layer made, so the
// layers before it draw the same random numbers: the difference of the two renders is the crack)
const a = await h.call("s => s.audio.play('impact', { J: 153, where: 'head', counter: true, pan: 0 })", 2);
const b = await h.call("s => s.audio.play('impact', { J: 153, where: 'head', counter: false, pan: 0 })", 2);
let ea = 0, ed = 0, pk = 0, pd = 0;
for (let i = 0; i < a.L.length; i++) {
  const d = a.L[i] - b.L[i];
  ea += a.L[i] * a.L[i]; ed += d * d; pk = Math.max(pk, Math.abs(a.L[i])); pd = Math.max(pd, Math.abs(d));
}
const crack = 10 * Math.log10(ed / ea);
console.log(`counter crack: ${f1(crack)} dB of the counter impact's energy, its peak ${f1(20 * Math.log10(pd / pk))} dB under the impact's peak`);
await h.close();
console.log(`EVIDENCE: parry ${f1(parry.lufsMom - glove.lufsMom)} LU vs glove block (code level 1.6 vs 1.1), shoulder roll ${f1(roll.lufsMom - glove.lufsMom)} LU vs glove block (code: x0.8, "softer"), glove-forearm distance ${profileDist(glove, fore).toFixed(3)} with ${f1(fore.lufsMom - glove.lufsMom)} LU and the same length, glove block ${(100 * band(glove, 120, 260)).toFixed(0)}% a 120-260 Hz tone, counter crack ${f1(crack)} dB of its impact`);
