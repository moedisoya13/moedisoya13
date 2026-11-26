// open-p4 (evidence): the arm-way comparison on a phone. Where the three clips sit at 390 px (the ★ B and "지금" are the
// pair that differs only at the forearm), how wide each is drawn, and how much of the picture differs between them.
// Usage: node open-p4.mjs <pixel-boxer root>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { serve } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-serve.mjs'));
const root = path.resolve(process.argv[2] || '.');
const { GROUPS } = await import(path.join(root, 'src/open.clips.mjs'));
const g = GROUPS.arm;
const frames = (f) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(root, f), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 }); return Array.from({ length: b.length / (g.w * g.h) }, (_, i) => b.subarray(i * g.w * g.h, (i + 1) * g.w * g.h)); };
const [now, , b] = g.clips.map((c) => frames(c.file));
let diff = 0, tot = 0, box = [g.w, g.h, 0, 0];
for (let i = 0; i < now.length; i++) for (let p = 0; p < now[i].length; p++) { tot++; if (Math.abs(now[i][p] - b[i][p]) > 24) { diff++; const x = p % g.w, y = (p / g.w) | 0; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; } }
console.log(`arm-now vs arm-b: ${((diff / tot) * 100).toFixed(2)}% of pixels differ (>24 of 255) over ${now.length} frames, i.e. ${Math.round(diff / now.length)} px a frame of ${g.w}x${g.h}`);
const srv = await serve(root);
const browser = await chromium.launch();
for (const w of [390, 800]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort());
  await page.goto(srv.url + '/open.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => [...document.querySelectorAll('#i-arm-way .clip')].map((f) => { const v = f.querySelector('video').getBoundingClientRect(); return [f.dataset.id, Math.round(v.left), Math.round(v.top + scrollY), Math.round(v.width)]; }));
  const at = Object.fromEntries(r.map((x) => [x[0], x]));
  const sameRow = at['arm-now'][2] === at['arm-b'][2];
  console.log(`width ${w}: ${r.map((x) => `${x[0]} at x=${x[1]} y=${x[2]} drawn ${x[3]} px wide (${(x[3] / g.w).toFixed(2)}x)`).join('; ')} → 지금 and B ${sameRow ? 'side by side' : 'on different rows (B under 지금, A beside 지금)'}`);
  if (w === 390) var phone = { sameRow, scale: at['arm-b'][3] / g.w };
}
await browser.close();
srv.close();
console.log(`EVIDENCE: at 390 지금 and the ★ B are ${phone.sameRow ? 'side by side' : 'not side by side'}; each drawn at ${phone.scale.toFixed(2)}x; they differ in ${((diff / tot) * 100).toFixed(2)}% of pixels (${Math.round((diff / now.length) * phone.scale * phone.scale)} screen px a frame)`);
