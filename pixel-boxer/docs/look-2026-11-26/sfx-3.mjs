/* sfx-3: 느리게(¼) is the speed of the game's slowed replay (README 소리: "다운의 리플레이는 ... 관중·공 없이 ... 낮고 길게"),
   but the page's slowed knockdown still rings the KO bell (and, 지하, the roar) that the replay never plays: the page's
   `heard()` has no `replay: true`. And the 다운 타격 card's line ("가장 무겁게, 다른 소리를 잠깐 누름") does not say that
   most of what it plays is that bell.  node sfx-3.mjs <pixel-boxer root> */
import { open, measure, f1, SR } from './sfx-lib.mjs';
const root = process.argv[2];
const { cuesOf } = await import(root + '/src/game/audio.mjs');
const h = await open(root);
const win = (r, a, b) => {
  const s = Math.round(a * SR), e = Math.min(r.L.length, Math.round(b * SR));
  return measure(r.L.slice(s, e), r.R.slice(s, e));
};
const rows = [];
for (const [slow, pit] of [[0, 0], [1, 0], [1, 1]]) {
  const r = await h.render({ card: '다운 타격', slow, pit, dur: slow ? 9 : 5 });
  const bellAt = slow ? 1.1 / 0.5 : 1.1; // (delay / sqrt(rate))
  const imp = win(r, 0, bellAt - 0.05), bell = win(r, bellAt, r.L.length / SR);
  rows.push({ slow, pit, names: r.log.join(' / ').match(/\b(impact|exhale|bell|roar|cheer)\b/g), imp: imp.lufsMom, bell: bell.lufsMom, bellPeak: bell.peak });
}
await h.close();
for (const x of rows) console.log(`다운 타격 ${x.slow ? '느리게' : '1x'} ${x.pit ? '지하' : '링'}: cues ${[...new Set(x.names)].join(', ')} | impact part LUFS mom ${f1(x.imp)}, bell part ${f1(x.bell)} (peak ${f1(x.bellPeak)} dBFS)`);
const e = { type: 'hit', who: 1, on: 0, J: 85, part: 'glove', down: true };
console.log('game cuesOf live   :', cuesOf(e, { pit: true }).map(c => c.name).join(', '));
console.log('game cuesOf replay :', cuesOf(e, { pit: true, replay: true }).map(c => c.name).join(', '));
const s = rows[1];
console.log(s.names.includes('bell') ? `REPRO: yes the slowed 다운 타격 rings the KO bell (${f1(s.bell)} LUFS mom, impact ${f1(s.imp)}); the game's replay plays only impact + exhale` : 'REPRO: no');
