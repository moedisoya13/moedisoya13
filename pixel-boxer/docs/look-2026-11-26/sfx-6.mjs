/* sfx-6: the page's only readout (#log, "<name> 크기 <level> · <ms> · 좌우 <pan>") prints the cue's gain parameter as 크기
   (size / loudness), but that number does not rank how loud the cards are: 쳐내기 shows 1.60 and 글러브로 막기 1.10 while the
   parry measures 8 LU quieter; 발걸음 shows 0.80 and the head blow 0.68 while the step measures 36 LU quieter.
   node sfx-6.mjs <pixel-boxer root> */
import { open, measure, f1 } from './sfx-lib.mjs';
const root = process.argv[2];
const h = await open(root);
const rows = [];
for (const c of ['쳐내기', '글러브로 막기', '숄더 롤', '발걸음', '머리', '몸통', '대시', '공: 시작', '잽 "츳"']) {
  const r = await h.render({ card: c, dur: 2.5 });
  const m = measure(r.L, r.R), first = r.log.at(-1).split('  /  ')[0], lv = Number((first.match(/크기 ([\d.]+)/) || [])[1]);
  rows.push({ c, lv, lufs: m.lufsMom, ms: Number((first.match(/· (\d+) ms/) || [])[1]), span: Math.round(m.span * 1000), log: first });
}
await h.close();
for (const x of rows) console.log(`${x.c.padEnd(10)} log "${x.log}"  | measured ${f1(x.lufs)} LUFS mom, audible span ${x.span} ms`);
// pairs ranked one way by the log and the other way by measurement
let inv = 0, pairs = 0;
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  pairs++;
  if (Math.sign(rows[i].lv - rows[j].lv) * Math.sign(rows[i].lufs - rows[j].lufs) < 0) inv++;
}
const p = rows.find(x => x.c === '쳐내기'), b = rows.find(x => x.c === '글러브로 막기');
console.log(inv > 0 ? `REPRO: yes the log's 크기 ranks ${inv} of ${pairs} card pairs opposite to their measured loudness (쳐내기 ${p.lv} vs 막기 ${b.lv}, measured ${f1(p.lufs)} vs ${f1(b.lufs)} LUFS)` : 'REPRO: no');
