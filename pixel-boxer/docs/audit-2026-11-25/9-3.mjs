// 9-3: the pit's crowd murmur (a looping Web Audio source) keeps playing while the page is hidden: neither the game nor the
// sparring page listens for visibilitychange, and the browser keeps a running AudioContext going in a background tab, so the
// bout freezes (requestAnimationFrame stops) but the crowd murmurs on in the background for as long as the tab stays hidden.
// Headless Chromium does not hide tabs, so hiding is simulated the way a browser does it: document.hidden / visibilityState
// turn 'hidden', a visibilitychange event fires, and requestAnimationFrame callbacks are held until the page is shown again.
// usage: node 9-3.mjs <pixel-boxer root>
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
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.addInitScript(() => {
  // every AudioContext made, and every looping source started / stopped (the murmur is the only looping source that lasts)
  const AC = window.AudioContext;
  window.__acs = [];
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acs.push(this); } };
  window.__loops = new Set();
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop) (this.__startAt = this.context.currentTime), window.__loops.add(this); return start.apply(this, a); };
  AudioBufferSourceNode.prototype.stop = function (when, ...a) { if (this.loop) this.__stopAt = when ?? this.context.currentTime; return stop.call(this, when, ...a); };
  // a page that can be hidden: rAF callbacks are held while hidden, as a browser does in a background tab
  let hidden = false, held = [];
  Object.defineProperty(Document.prototype, 'hidden', { get: () => hidden, configurable: true });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => (hidden ? (held.push(cb), 0) : raf(cb));
  window.__hide = on => {
    hidden = on;
    document.dispatchEvent(new Event('visibilitychange'));
    if (!on) { const h = held; held = []; h.forEach(cb => raf(cb)); }
  };
  window.__sounding = () => {
    const ctx = window.__acs[0];
    if (!ctx) return { state: 'none', loops: 0 };
    const now = ctx.currentTime;
    const loops = [...window.__loops].filter(s => s.__stopAt === undefined || s.__stopAt > now).length;
    return { state: ctx.state, time: +now.toFixed(2), loops };
  };
});
await page.goto(base + 'index.html?seed=3&arena=underground');
await page.waitForFunction(() => globalThis.__bout && !document.getElementById('loading'), null, { timeout: 90000 });
await page.mouse.click(195, 200); // the first tap: starts the bout, unlocks the sound, starts the pit's murmur
await page.waitForFunction(() => globalThis.__bout.phase === 'fight' && window.__sounding().loops > 0, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const shown = await page.evaluate(() => ({ t: +globalThis.__bout.bout.t.toFixed(2), ...window.__sounding() }));
await page.evaluate(() => window.__hide(true));
await page.waitForTimeout(8000);
const hidden = await page.evaluate(() => ({ t: +globalThis.__bout.bout.t.toFixed(2), ...window.__sounding() }));
await page.evaluate(() => window.__hide(false));
await page.waitForTimeout(2000);
const back = await page.evaluate(() => ({ t: +globalThis.__bout.bout.t.toFixed(2), ...window.__sounding() }));
console.log('shown  ', JSON.stringify(shown));
console.log('hidden 8 s later', JSON.stringify(hidden));
console.log('shown again', JSON.stringify(back));
console.log('page errors', errs);
await browser.close();
server.close();
const frozen = Math.abs(hidden.t - shown.t) < 0.25, sounding = hidden.state === 'running' && hidden.loops > 0 && hidden.time - shown.time > 5;
console.log(`bout frozen while hidden: ${frozen} (bout time ${shown.t} -> ${hidden.t} s); audio while hidden: context ${hidden.state}, audio clock ${shown.time} -> ${hidden.time} s, looping crowd sources still playing ${hidden.loops}`);
console.log(sounding ? `REPRO: yes the pit's crowd murmur keeps playing while the page is hidden (context running, ${hidden.loops} loop live, ${(hidden.time - shown.time).toFixed(1)} s of audio clock with the bout frozen)` : 'REPRO: no the sound stops while the page is hidden');
