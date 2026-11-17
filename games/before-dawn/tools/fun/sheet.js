#!/usr/bin/env node
// Contact sheet of the frames play_browser.js wrote: a grid with the game time on each frame.
//
//   node tools/fun/sheet.js --dir RUN_DIR --from 0 --to 60 --step 4 --cols 4 --out sheet.jpg
//   node tools/fun/sheet.js --dir RUN_DIR --times 120,125,130,135 --cols 2 --w 640 --out sheet.jpg
'use strict';
const path = require('path');
const fs = require('fs');
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const dir = path.resolve(String(o.dir));
const files = fs.readdirSync(dir).filter((f) => /^t\d+\.jpg$/.test(f)).sort();
const tOf = (f) => Number(f.slice(1, 5));
let pick;
if (o.times) {
  const want = String(o.times).split(',').map(Number);
  pick = want.map((t) => files.reduce((best, f) => (Math.abs(tOf(f) - t) < Math.abs(tOf(best) - t) ? f : best), files[0]));
} else {
  const from = Number(o.from || 0), to = Number(o.to === undefined ? 1e9 : o.to), step = Number(o.step || 1);
  pick = []; let next = from;
  for (const f of files) { const t = tOf(f); if (t >= next && t <= to) { pick.push(f); next = t + step; } }
}
const cols = Number(o.cols || 4), w = Number(o.w || 320), h = Math.round((w * 9) / 16);
const rows = Math.ceil(pick.length / cols);
const out = path.resolve(String(o.out || path.join(dir, 'sheet.jpg')));
const mm = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const html = `<body style="margin:0;background:#111;font:700 ${Math.max(12, Math.round(w / 22))}px sans-serif;color:#fff">
<div style="display:grid;grid-template-columns:repeat(${cols},${w}px)">${pick.map((f) => `<div style="position:relative;width:${w}px;height:${h}px"><img src="file://${path.join(dir, f)}" style="width:${w}px;height:${h}px;display:block"><span style="position:absolute;left:4px;bottom:3px;background:#000a;padding:1px 5px">${mm(tOf(f))}</span></div>`).join('')}</div></body>`;
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: cols * w, height: rows * h } });
  const tmp = path.join(dir, '_sheet.html');
  fs.writeFileSync(tmp, html);
  await p.goto('file://' + tmp);
  await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await p.screenshot({ path: out, type: 'jpeg', quality: Number(o.q || 72) });
  await b.close();
  fs.unlinkSync(tmp);
  console.log(`${pick.length} frames → ${out}`);
})();
