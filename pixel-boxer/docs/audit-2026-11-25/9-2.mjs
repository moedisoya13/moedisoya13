// 9-2: the game (index.html) and the sparring page do not survive a WebGL context loss: nothing listens for
// webglcontextlost / webglcontextrestored, so the page never calls preventDefault() on the loss: the browser refuses to restore the context
// ("context restoration not allowed") and the picture stays a blank white canvas for good while the bout runs on unseen. Context loss is simulated with the standard WEBGL_lose_context extension.
// usage: node 9-2.mjs <pixel-boxer root>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(process.argv[2]);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SHOTS = '/tmp/pixel-boxer-audit/audit/shots';
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root)) return r.writeHead(403).end();
  fs.readFile(f, (e, d) => (e ? r.writeHead(404).end() : r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(d)));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
// share of the canvas that is blank white (every channel over 235 of 255): measured on a screenshot, decoded in a 2D canvas
async function lit(page, tag) {
  const box = await page.locator('#view').boundingBox();
  const png = await page.screenshot({ path: `${SHOTS}/9-2-${tag}.png`, clip: box });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) > 235) n++;
    return +(n / (d.length / 4)).toFixed(3);
  }, png.toString('base64'));
}
let bad = 0;
for (const [name, file, ready] of [['game', 'index.html?seed=3&auto=1', () => globalThis.__bout && !document.getElementById('loading')], ['spar', 'spar.html', () => globalThis.__spar && !document.getElementById('loading')]]) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const msgs = [];
  page.on('console', m => /error|warning/.test(m.type()) && !/AudioContext|ReadPixels/.test(m.text()) && msgs.push(m.text()));
  page.on('pageerror', e => msgs.push('pageerror: ' + e.message));
  await page.goto(base + file);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  const before = await lit(page, name + '-before');
  const listened = await page.evaluate(() => {
    const gl = document.getElementById('view').getContext('webgl2');
    window.__ext = gl.getExtension('WEBGL_lose_context');
    window.__lost = 0; window.__restored = 0;
    const cv = document.getElementById('view');
    cv.addEventListener('webglcontextlost', () => window.__lost++);
    cv.addEventListener('webglcontextrestored', () => window.__restored++);
    window.__ext.loseContext();
    return !!window.__ext;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => ({ lost: window.__lost, restored: window.__restored, contextLost: document.getElementById('view').getContext('webgl2').isContextLost() }));
  const after = await lit(page, name + '-after');
  const t = await page.evaluate(() => (globalThis.__bout ? globalThis.__bout.bout.t : globalThis.__spar.bout.t));
  const blank = st.contextLost && after > 0.8 && before < 0.1;
  if (blank) bad++;
  console.log(`${name}: blank-white share of the canvas before ${before}, 5 s after lose+restore ${after} (events lost ${st.lost}, restored ${st.restored}, isContextLost ${st.contextLost}); bout time now ${t.toFixed(2)} s; console ${msgs.length}: ${msgs.slice(0, 3).join(' | ')} -> ${blank ? 'BLANK' : 'drawn'}`);
  await page.close();
}
await browser.close();
server.close();
console.log(bad ? `REPRO: yes ${bad} of 2 pages stay a blank white canvas after a WebGL context loss (restore refused: no preventDefault on webglcontextlost, no rebuild on webglcontextrestored)` : 'REPRO: no both pages draw again after a context loss');
