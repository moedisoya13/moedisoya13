// 9-1: spar.html — changing the arena (or the outfit) and changing it back before the first choice has loaded leaves the
// page in the FIRST choice while the <select> shows the second (async load resolves last and wins; no "latest choice" check).
// usage: node 9-1.mjs <pixel-boxer root>
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
// (once a page is up, what it asks for next comes 1.5 s late, as over a phone's network: the window in which a change of mind races the load)
let slow = 0;
const server = http.createServer(async (q, r) => {
  if (slow) await new Promise(res => setTimeout(res, slow));
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root)) return r.writeHead(403).end();
  fs.readFile(f, (e, d) => (e ? r.writeHead(404).end() : r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(d)));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
let bad = 0;
const out = [];
for (const [sel, first, second, key] of [['#arena', 'underground', 'ring', 'spar.arena'], ['#wear', 'training', '', 'spar.wear']]) {
  for (const gap of [0, 400]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + 'spar.html');
    await page.waitForFunction(() => globalThis.__spar && !document.getElementById('loading'), null, { timeout: 90000 });
    slow = 1500;
    // the user picks `first`, then changes their mind `gap` ms later (before `first` has finished loading)
    await page.evaluate(([sel, first, second, gap]) => {
      const s = document.querySelector(sel);
      s.value = first; s.dispatchEvent(new Event('change'));
      setTimeout(() => { s.value = second; s.dispatchEvent(new Event('change')); }, gap);
    }, [sel, first, second, gap]);
    // wait until whatever was asked has loaded (both loads have settled)
    await page.waitForTimeout(gap + 1000);
    await page.waitForFunction(k => localStorage.getItem(k) !== null, key, { timeout: 90000 });
    // (both loads settled: the slow first one has come in, or 20 s have gone by)
    await page.waitForFunction(([k, v]) => localStorage.getItem(k) === v, [key, first], { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    slow = 0;
    let arranged = null;
    if (sel === '#arena') {
      await page.click('#startbtn');
      await page.waitForFunction(() => globalThis.__spar.plan, null, { timeout: 30000 });
      arranged = await page.evaluate(() => globalThis.__spar.plan.arena);
    }
    const r = await page.evaluate(([sel, key]) => ({ select: document.querySelector(sel).value, remembered: localStorage.getItem(key) }), [sel, key]);
    const wrong = r.select !== r.remembered || (arranged !== null && arranged !== r.select);
    if (wrong) bad++;
    const shot = `${SHOTS}/9-1-${sel.slice(1)}-${gap}.png`;
    await page.screenshot({ path: shot });
    out.push(`${sel} ${JSON.stringify(first)} then ${JSON.stringify(second)} after ${gap} ms: select shows ${JSON.stringify(r.select)}, page uses/remembers ${JSON.stringify(r.remembered)}${arranged !== null ? `, round arranged in ${arranged}` : ''}${errs.length ? ' errors ' + errs.join(' | ') : ''} -> ${wrong ? 'MISMATCH' : 'ok'}  (${shot})`);
    console.log(out.at(-1));
    await ctx.close();
    slow = 0;
  }
}
await browser.close();
server.close();
console.log(bad ? `REPRO: yes ${bad} of 4 quick change-backs leave the spar page in the first choice while the select shows the second` : 'REPRO: no all 4 change-backs ended in the shown choice');
