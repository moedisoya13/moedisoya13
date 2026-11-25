// usage: node 5-4.mjs <pixel-boxer root>
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2] || '.');
const SH = '/tmp/pixel-boxer-audit/audit/shots/';
fs.mkdirSync(SH, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const server = await new Promise(res => {
  const s = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => (e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }), r.end(d))));
  });
  s.listen(0, '127.0.0.1', () => res(s));
});
// manual frames: rAF taken over, Math.random seeded, the draw skipped except on the frames measured
const INIT = () => {
  let seed = 12345;
  Math.random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const q = [];
  let t = 1000;
  window.requestAnimationFrame = cb => (q.push(cb), q.length);
  window.__tick = (n, draw) => {
    for (let i = 0; i < n; i++) {
      window.__drawOn = !!draw && i === n - 1;
      t += 1000 / 60;
      for (const cb of q.splice(0)) cb(t);
    }
    window.__drawOn = false;
  };
  window.__gate = () => {
    const R = globalThis.__bout && globalThis.__bout.renderer;
    if (!R || R.__gated) return !!R;
    const real = R.draw;
    R.draw = f => ((window.__lastFrame = f), window.__drawOn ? real(f) : 0);
    return (R.__gated = true);
  };
};
// 5-4: with the hood up (?wear=training-up) the face is gone in the game's picture: the game camera sees the men side-on, and
// the hood's sides and peak cover the face, so each head is a plain grey ball. Counted on the art grid: pixels of each man's
// skin (his palette's 1-4; with the suit on, skin is only the face, and the neck with the hood down), seed 3, 30 frames
// 1/3 s apart, hood down vs hood up (the bout is the same: what is worn changes only the drawing).
const browser = await chromium.launch();
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const res = {};
for (const wear of ['training', 'training-up']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?auto=1&seed=3&wear=${wear}`);
  for (let i = 0; i < 600 && !(await page.evaluate(() => (window.__tick(1), window.__gate()))); i++) await page.waitForTimeout(100);
  const rows = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 30; k++) {
      window.__tick(20, true);
      const R = globalThis.__bout.renderer, gl = R.gl, { w, h } = R.target, px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.target.fbo);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const men = window.__lastFrame.layers.filter(l => l.silhouette && l.mask === 1);
      const skin = men.map(l => [1, 2, 3, 4].map(i => [0, 1, 2].map(c => Math.round(l.palette[i * 3 + c] * 255)).join(',')));
      const n = [0, 0];
      for (let i = 0; i < w * h; i++) {
        if (px[i * 4 + 3] < 250) continue;
        const c = px[i * 4] + ',' + px[i * 4 + 1] + ',' + px[i * 4 + 2];
        for (const m of [0, 1]) if (skin[m].includes(c)) n[m]++;
      }
      const B = globalThis.__bout;
      out.push({ n, side: B.bout.fighters.map(f => +Math.abs(Math.cos(f.yaw - B.cam.yaw)).toFixed(2)) });
    }
    return out;
  });
  await page.screenshot({ path: `${SH}5-4-${wear}.png` });
  res[wear] = rows;
  const all = rows.flatMap(r => r.n);
  console.log(wear, 'skin px per man per frame:', JSON.stringify(rows.map(r => r.n)));
  console.log(`  median ${med(all)}, max ${Math.max(...all)}, frames where both men show <= 3 skin px: ${rows.filter(r => r.n[0] <= 3 && r.n[1] <= 3).length}/30; |cos(man yaw - camera yaw)| median ${med(rows.flatMap(r => r.side))} (0 = seen side-on)`);
  await ctx.close();
}
await browser.close();
server.close();
const up = res['training-up'].flatMap(r => r.n), down = res.training.flatMap(r => r.n);
console.log(med(up) <= 3 ? `REPRO: yes hood up: median ${med(up)} face pixels per man (hood down ${med(down)}); ${res['training-up'].filter(r => r.n[0] <= 3 && r.n[1] <= 3).length}/30 frames with both faces <= 3 px` : `REPRO: no median ${med(up)}`);
