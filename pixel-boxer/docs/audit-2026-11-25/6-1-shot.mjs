// 6-1 (picture): the game page in the pit, the player's man put 0.55 m off the -x wall with 1 health; the rival puts him down;
// screenshots of him lying (saved to <scratch>/audit/shots/6-1-*.png) and where his head lies.
// node 6-1-shot.mjs <pixel-boxer root>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.argv[2];
const SHOTS = '/tmp/pixel-boxer-audit/audit/shots';
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav' };
const server = http.createServer(async (req, res) => {
  try {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;
const browser = await chromium.launch();
const out = { errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  page.on('pageerror', e => out.errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && out.errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/index.html?arena=underground&seed=5&auto=1`);
  await page.waitForFunction(() => globalThis.__bout && globalThis.__bout.phase === 'fight', null, { timeout: 120000 });
  await page.evaluate(() => {
    const B = globalThis.__bout.bout, [a, b] = B.fighters;
    Object.assign(a, { x: -2.0, z: 0, yaw: Math.PI / 2, hp: 1, vx: 0, vz: 0, kx: 0, kz: 0 });
    Object.assign(b, { x: -1.05, z: 0, yaw: -Math.PI / 2, vx: 0, vz: 0, kx: 0, kz: 0 });
  });
  await page.waitForFunction(() => globalThis.__bout.bout.over !== null, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/6-1-falling.png` });
  // (after the replay: the result is shown once it has played)
  await page.waitForFunction(() => document.getElementById('result').classList.contains('on'), null, { timeout: 120000 }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/6-1-lying.png` });
  Object.assign(out, await page.evaluate(() => {
    const f = globalThis.__bout.bout.fighters[0], p = f.points;
    return { centre: [f.x, f.z].map(v => +v.toFixed(2)), head: p.head.map(v => +v.toFixed(2)), chest: p.chest.map(v => +v.toFixed(2)), hips: p.hips.map(v => +v.toFixed(2)), camYaw: +globalThis.__bout.cam.yaw.toFixed(2) };
  }));
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(out));
console.log(`screenshots: ${SHOTS}/6-1-falling.png, ${SHOTS}/6-1-lying.png (headless Chromium, software GL)`);
const past = Math.max(Math.abs(out.head[0]), Math.abs(out.head[2]));
console.log(past > 2.76 ? `REPRO: yes on the game page the knocked-down man's head lies ${past.toFixed(2)} m out, past the pit wall's inner face (2.76 m; outer face 3.0 m)` : `REPRO: no head lies ${past.toFixed(2)} m out`);
