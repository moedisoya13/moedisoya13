// 3-1: on the game page the red corner (fighter 0) is not boxed by any head: brain.mjs is wired to no page. Loads
// index.html?auto=1&seed=3&speed=4&rows=80, lets the bout run ~40 s of wall time at ?speed=4&rows=80, and counts what each corner does (actions started,
// distance walked, health). Usage: node 3-1.mjs <pixel-boxer root>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(process.argv[2]);
const SHOTS = '/tmp/pixel-boxer-audit/audit/shots';
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404), res.end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html?auto=1&seed=3&speed=4&rows=80`);
await page.waitForFunction(() => globalThis.__bout && globalThis.__bout.bout && globalThis.__bout.phase === 'fight', null, { timeout: 120000 });
// sample the bout every 40 ms: actions started by each corner, metres walked
const sample = await page.evaluate(async () => {
  const B = globalThis.__bout, acts = [{}, {}], walked = [0, 0], last = [null, null], was = [null, null];
  const t0 = performance.now();
  while (performance.now() - t0 < 40000 && B.phase !== 'over') {
    const b = B.bout;
    b.fighters.forEach((f, i) => {
      const a = f.action ? f.action.name + '#' + (f.action.id ?? '') + (f.action.at ?? '') : null;
      if (a && a !== was[i]) acts[i][f.action.name] = (acts[i][f.action.name] || 0) + 1;
      was[i] = a;
      if (last[i]) walked[i] += Math.hypot(f.x - last[i][0], f.z - last[i][1]);
      last[i] = [f.x, f.z];
    });
    await new Promise(r => setTimeout(r, 40));
  }
  const b = B.bout;
  return { t: +b.t.toFixed(2), phase: B.phase, acts, walked: walked.map(w => +w.toFixed(2)), hp: b.fighters.map(f => +f.hp.toFixed(1)), techniques: b.fighters.map(f => f.techniques), skills: b.fighters.map(f => f.skills) };
});
await page.screenshot({ path: SHOTS + '/3-1-game.png' });
await browser.close();
server.close();
console.log(JSON.stringify(sample));
console.log('page errors', errors.length, errors.slice(0, 3));
const n = s => Object.values(s).reduce((a, b) => a + b, 0);
const red = n(sample.acts[0]), blue = n(sample.acts[1]);
console.log(`bout time ${sample.t} s: red (player corner) actions ${red}, walked ${sample.walked[0]} m; blue (ai.mjs rival) actions ${blue}, walked ${sample.walked[1]} m; hp ${sample.hp.join(' / ')}`);
console.log(red === 0 && blue > 0 ? `REPRO: yes red corner did nothing in ${sample.t} s of bout (0 actions, walked ${sample.walked[0]} m) while the rival made ${blue}; brain.mjs drives no page` : `REPRO: no red ${red} actions`);
