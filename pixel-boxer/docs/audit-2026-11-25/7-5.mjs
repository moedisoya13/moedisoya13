// eye 7, finding 7-5: the game page never quiets its sound when the page is hidden: no visibilitychange/pagehide handler in
// src/main.mjs or src/spar.mjs, the AudioContext stays 'running' and the pit's crowd murmur (a loop) goes on.
// The page is served as it is, except that main.mjs's `audio = createAudio(),` is given a global name (in flight, nothing
// on disk changes) so its context can be read. usage: node 7-5.mjs <pixel-boxer root>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.argv[2];
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    let body = await readFile(join(root, path.endsWith('/') ? path + 'index.html' : path));
    if (path.endsWith('src/main.mjs')) body = String(body).replace('audio = createAudio(),', 'audio = (globalThis.__audio = createAudio()),');
    if (path.endsWith('src/game/audio.mjs')) body = String(body).replace('    get context() {', '    get murmur() { return murmur; },\n    get context() {');
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
// (the handlers the pages have for being hidden)
const src = (await readFile(join(root, 'src/main.mjs'), 'utf8')) + (await readFile(join(root, 'src/spar.mjs'), 'utf8'));
const handlers = (src.match(/visibilitychange|pagehide|freeze|document\.hidden|visibilityState/g) || []).length;
console.log(`visibility/pagehide handlers in src/main.mjs + src/spar.mjs: ${handlers}`);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${url}/index.html?arena=underground&seed=5`);
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 150000 });
await page.mouse.click(200, 300); // the first touch: unlocks the sound, rings the bell, starts the murmur
await page.waitForTimeout(2500);
const state = () => page.evaluate(() => ({ visibility: document.visibilityState, ctx: __audio.context && __audio.context.state, clock: __audio.context && +__audio.context.currentTime.toFixed(2), murmur: !!__audio.murmur, boutT: +__bout.bout.t.toFixed(2) }));
const a = await state();
// (the page hidden: another tab brought to the front; and, as headless Chromium may keep every page 'visible', the event too)
const other = await context.newPage();
await other.goto('about:blank');
await other.bringToFront();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  dispatchEvent(new Event('pagehide'));
});
await page.waitForTimeout(3000);
const b = await state();
console.log('before hidden:', JSON.stringify(a));
console.log('3 s after hidden:', JSON.stringify(b), 'errors', errors.length);
const going = b.ctx === 'running' && b.murmur && b.clock > a.clock + 2;
console.log(going ? `REPRO: yes hidden page keeps its AudioContext running (clock ${a.clock} -> ${b.clock} s) with the pit murmur loop on; ${handlers} visibility handlers` : `REPRO: no ctx ${b.ctx} murmur ${b.murmur}`);
await browser.close();
server.close();
