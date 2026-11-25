// Eye 10, finding 10-1: the motion catalogue scrolls sideways on a 390 px phone: one row title's English name is
// white-space: nowrap (catalog.html `h3 .en`) and runs 60 px past the screen.  node 10-1.mjs <pixel-boxer root>
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(process.argv[2]);
const SHOTS = '/tmp/pixel-boxer-audit/audit/shots';
mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.webm': 'video/webm' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) return r.writeHead(404), r.end();
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }), r.end(readFileSync(f));
});
await new Promise(res => server.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route(u => !u.href.startsWith(base), r => r.abort()); // (the web fonts: offline)
await page.goto(base + '/catalog.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForSelector('#row-out-counter', { timeout: 150000 });
// (open the folded rows too: the control at the top that shows everything)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '모두'); if (b) b.click(); });
await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const W = window.innerWidth, wide = [];
  for (const el of document.querySelectorAll('h3 .en')) { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1) wide.push({ text: el.textContent.trim(), right: Math.round(r.right), row: (el.closest('[id]') || {}).id }); }
  const el = document.querySelector('#row-out-counter');
  el.scrollIntoView();
  return { scrollW: document.documentElement.scrollWidth, W, wide };
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/10-1-catalog-out-counter.png` });
console.log(`document scrollWidth ${m.scrollW} px at a ${m.W} px viewport`);
for (const w of m.wide) console.log(`  h3 .en "${w.text}" ends at ${w.right} px (row #${w.row})`);
await browser.close();
server.close();
console.log(m.scrollW > m.W ? `REPRO: yes the motion catalogue is ${m.scrollW} px wide at ${m.W} px (${m.wide.length} English row name(s) past the edge, e.g. "${m.wide[0] && m.wide[0].text}")` : `REPRO: no no horizontal scroll (${m.scrollW}/${m.W})`);
