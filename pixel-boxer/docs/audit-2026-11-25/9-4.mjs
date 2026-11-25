// 9-4: the game's frame-time readout (#fps / ?fps=1, __bout.stats.ms; also the README's "1.5~1.9 ms" frame time) times only
// the JavaScript that queues a picture, not the drawing: the GPU's work is left out. Measured here three ways, ring and
// underground, same seed: stats.ms (what the page shows), the same frame with a one-pixel readPixels after it (which waits for the GPU) (the draw really done),
// and the interval between pictures (requestAnimationFrame). Headless Chromium draws with software GL (SwiftShader) on a
// shared CPU, so the absolute numbers are pessimistic; the point is the ratio between the readout and the real frame.
// usage: node 9-4.mjs <pixel-boxer root>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(process.argv[2]);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root)) return r.writeHead(403).end();
  fs.readFile(f, (e, d) => (e ? r.writeHead(404).end() : r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(d)));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const med = a => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : NaN);
const res = {};
for (const arena of ['ring', 'underground']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__dt = [];
    let last = 0;
    const f = t => { if (last) window.__dt.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.goto(base + `index.html?seed=3&auto=1&fps=1${arena === 'ring' ? '' : '&arena=underground'}`);
  await page.waitForFunction(() => globalThis.__bout && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  // phase 1: as it is (the readout and the rAF interval)
  await page.evaluate(() => { window.__dt.length = 0; window.__ms = []; const s = globalThis.__bout.stats; window.__pull = setInterval(() => window.__ms.push(s.ms), 250); });
  await page.waitForTimeout(12000);
  const p1 = await page.evaluate(() => (clearInterval(window.__pull), { dt: window.__dt.splice(0), ms: window.__ms, shown: document.getElementById('fps').textContent }));
  // phase 2: the same draw with a 1-pixel readPixels after it, timed (wraps the renderer's draw)
  await page.evaluate(() => {
    const R = globalThis.__bout.renderer, gl = R.gl, draw = R.draw, px = new Uint8Array(4);
    window.__fin = [];
    R.draw = (...a) => { const t = performance.now(); const n = draw(...a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__fin.push(performance.now() - t); return n; };
  });
  await page.waitForTimeout(12000);
  const fin = await page.evaluate(() => window.__fin);
  res[arena] = { readout: med(p1.ms), shown: p1.shown, interval: med(p1.dt), frames: p1.dt.length, drawFinished: med(fin), finSamples: fin.length };
  console.log(arena, JSON.stringify(res[arena]));
  await page.close();
}
await browser.close();
server.close();
const ratio = Math.min(res.ring.drawFinished / res.ring.readout, res.underground.drawFinished / res.underground.readout);
console.log(`underground / ring: readout ${(res.underground.readout / res.ring.readout).toFixed(2)}x, finished draw ${(res.underground.drawFinished / res.ring.drawFinished).toFixed(2)}x, frame interval ${(res.underground.interval / res.ring.interval).toFixed(2)}x`);
console.log(ratio > 3 ? `REPRO: yes the frame-time readout leaves out the drawing: readout ring ${res.ring.readout.toFixed(1)} ms vs draw-until-finished ${res.ring.drawFinished.toFixed(0)} ms and frame interval ${res.ring.interval.toFixed(0)} ms (software GL)` : `REPRO: no the readout is within 3x of the finished draw (${ratio.toFixed(1)}x)`);
