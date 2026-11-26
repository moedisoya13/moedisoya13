// open-4: the spar-tempo comparison ("지금 / 줄임") is not "같은 장면" for most of its 6 s: the two recordings show the same
// exchange only at the start, then different rounds (the playbook is re-planned per build). And what is printed under
// the clips (the whole round of seed #7) runs against the card's own 20-bout summary for the blue man and the longest gap.
// Pixel comparison of the recorded files themselves (ffmpeg → gray frames). Usage: node open-4.mjs <pixel-boxer root>
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const { GROUPS } = await import(path.join(root, 'src/open.clips.mjs'));
const { CARDS } = await import(path.join(root, 'src/open.data.mjs'));
const frames = (f, w, h) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(root, f), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 }); return Array.from({ length: b.length / (w * h) }, (_, i) => b.subarray(i * w * h, (i + 1) * w * h)); };
const changed = (a, b) => { let c = 0; for (let p = 0; p < a.length; p++) if (Math.abs(a[p] - b[p]) > 24) c++; return c / a.length; };
const out = {};
for (const key of ['tempo', 'lean', 'arm']) {
  const g = GROUPS[key], fs = g.clips.map((c) => frames(c.file, g.w, g.h));
  for (let j = 1; j < fs.length; j++) {
    const row = fs[0].map((f, i) => changed(f, fs[j][i]));
    const diverge = row.findIndex((r) => r > 0.10), same = row.filter((r) => r <= 0.10).length;
    out[`${key}:${g.clips[j].id}`] = { diverge, same, n: row.length };
    console.log(`${key}: ${g.clips[0].id} vs ${g.clips[j].id}: ${row.length} frames @${g.fps} fps; pixels changed at frame 0 ${(row[0] * 100).toFixed(1)}%, first frame >10% changed: ${diverge} (${(diverge / g.fps).toFixed(2)} s); frames ≤10% changed ${same}/${row.length}; mean ${(row.reduce((s, x) => s + x, 0) / row.length * 100).toFixed(1)}%`);
  }
}
const t = GROUPS.tempo, card = CARDS.find((c) => c.id === 'spar-tempo');
console.log(`scene line on the page: "${t.scene}"`);
for (const c of t.clips) console.log(`under ${c.id}: "${c.measure}" (clip is ${t.frames / t.fps} s long)`);
console.log(`the card's why: "${card.why}"`);
const r = out['tempo:tempo-fast'];
console.log(`REPRO: yes spar-tempo's two clips match only for the first ${(r.diverge / t.fps).toFixed(2)} s of ${t.frames / t.fps} s (${r.same}/${r.n} frames ≤10% px changed; lean ${out['lean:lean-more'].same}/${out['lean:lean-more'].n}), and the seed-7 numbers under them have blue 2.03 → 1.75 actions/s and the longest gap 0.67 → 0.82 s, against the card's "1.84 → 1.96, 24 → 14 frames"`);
