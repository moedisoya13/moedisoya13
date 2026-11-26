/* sfx-8: the numbers the sound cards quote for the impact (open card `sound-hit`, src/open.data.mjs:105, and docs/pending.md
   "잰 값": "J 40 / 85 / 140 N·s -> -14.9 / -12.5 / -9.8 dBFS, 102 / 340 / 455 ms") do not match the impact the audition plays
   now: rendered alone (pan 0, the page's own mix chain, 48 kHz offline), the head blow at J 40 peaks 13 dB lower, and neither
   the head nor the body matches the quoted levels or lengths.  node sfx-8.mjs <pixel-boxer root> */
import { open, measure, f1 } from './sfx-lib.mjs';
import fs from 'node:fs';
const root = process.argv[2];
const quoted = { 40: [-14.9, 102], 85: [-12.5, 340], 140: [-9.8, 455] };
const src = fs.readFileSync(root + '/src/open.data.mjs', 'utf8');
console.log('open card says:', src.includes('J 40 / 85 / 140') ? src.slice(src.indexOf('J 40 / 85 / 140'), src.indexOf('J 40 / 85 / 140') + 70) : '(text not found)');
const h = await open(root);
const got = {};
for (const where of ['head', 'body']) for (const J of [40, 85, 140]) {
  const r = await h.call(`s => s.audio.play('impact', { J: ${J}, where: '${where}', pan: 0 })`, 2);
  const m = measure(r.L, r.R), dur = JSON.parse(r.played).dur;
  got[where + J] = m.peak;
  console.log(`${where} J ${String(J).padStart(3)}: peak ${f1(m.peak)} dBFS (quoted ${quoted[J][0]}), audible ${Math.round(m.span * 1000)} ms / reported ${Math.round(dur * 1000)} ms (quoted ${quoted[J][1]})`);
}
await h.close();
const off = Math.min(...['head', 'body'].map(w => Math.abs(got[w + 40] - quoted[40][0])));
console.log(off > 6 ? `REPRO: yes at J 40 the impact peaks ${f1(got.head40)} (head) / ${f1(got.body40)} (body) dBFS, the cards quote ${quoted[40][0]}` : 'REPRO: no');
