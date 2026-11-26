/* sfx-p1 (evidence): how the sounds sit on a phone's own speaker. A phone speaker gives almost nothing below a few hundred
   Hz; as a stand-in, a 4th-order Butterworth high-pass at 300 Hz (a proxy, not a measured phone). For each card: momentary
   loudness (400 ms, K-weighted, LUFS-ish) full band and through the proxy, and the share of energy below 40 Hz (inaudible on
   any small speaker or earbud). Also the slowed (¼) versions, whose thumps go an octave lower.
   node sfx-p1.mjs <pixel-boxer root> */
import { open, measure, f1, SR } from './sfx-lib.mjs';
const root = process.argv[2];
// RBJ high-pass biquad
const hp = (x, f, q) => {
  const w = (2 * Math.PI * f) / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = (1 + c) / 2 / a0, a1 = (-2 * c) / a0, a2 = (1 - a) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
};
const phone = x => hp(hp(x, 300, 0.5412), 300, 1.3066);
const below = (m, f) => {
  let s = 0, t = 0;
  for (let k = 1; k < m.spec.length; k++) (t += m.spec[k]), (k * SR) / m.N < f && (s += m.spec[k]);
  return s / t;
};
const h = await open(root);
const rows = [];
for (const [card, slow] of [['잽 "츳"', 0], ['스트레이트 "쉭"', 0], ['강타 "흡"', 0], ['머리', 0], ['몸통', 0], ['카운터', 0], ['쓰러짐', 0], ['글러브로 막기', 0], ['쳐내기', 0], ['발걸음', 0], ['몸통 "욱"', 0], ['머리 "헉"', 0], ['공: 시작', 0], ['머리', 1], ['몸통', 1], ['쓰러짐', 1], ['카운터', 1]]) {
  const r = await h.render({ card, slow, dur: slow ? 5 : 3 });
  const m = measure(r.L, r.R), p = measure(phone(r.L), phone(r.R));
  rows.push({ card: card + (slow ? ' (¼)' : ''), full: m.lufsMom, phone: p.lufsMom, drop: m.lufsMom - p.lufsMom, sub40: below(m, 40), sub150: below(m, 150) });
}
await h.close();
console.log('card'.padEnd(16), 'LUFS full', ' phone', '  drop', '  <40Hz', ' <150Hz');
for (const x of rows) console.log(x.card.padEnd(16), f1(x.full).padStart(9), f1(x.phone).padStart(6), f1(x.drop).padStart(6), `${(100 * x.sub40).toFixed(0)}%`.padStart(7), `${(100 * x.sub150).toFixed(0)}%`.padStart(7));
const g = n => rows.find(x => x.card === n);
console.log(`EVIDENCE: through a 300 Hz phone-speaker proxy the floor thud drops ${f1(g('쓰러짐').drop)} dB to ${f1(g('쓰러짐').phone)} (below the jab's breath, ${f1(g('잽 "츳"').phone)}), the body blow ${f1(g('몸통').drop)} dB to ${f1(g('몸통').phone)} (the straight's breath ${f1(g('스트레이트 "쉭"').phone)}, the start bell ${f1(g('공: 시작').phone)}); breaths and bell lose 0 dB; slowed (¼), ${(100 * g('몸통 (¼)').sub40).toFixed(0)}% of the body blow's and ${(100 * g('쓰러짐 (¼)').sub40).toFixed(0)}% of the floor's energy is below 40 Hz (1x: ${(100 * g('몸통').sub40).toFixed(0)}% / ${(100 * g('쓰러짐').sub40).toFixed(0)}%)`);
