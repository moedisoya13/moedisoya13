// 8-1: spar.html opened from a round's link (#s-7), then 시작 (a new round, made #5 here by fixing the page's dice), then the
// bar's 다시 보기: the button still carries the link's one-off handler, which runs AFTER the page's own (registered first), so
// 다시 보기 first restarts the bout of #5 (begin) and then arranges #7 into the same plan slot (newRound) without leaving
// 'play': the page goes on stepping the bout of #5's men with #7's controls as they arrive, while the HUD, rails and
// knockdown marker are #7's.
// usage: node 8-1.mjs <pixel-boxer root>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
const root = process.argv[2];
const SHOTS = '/tmp/pixel-boxer-audit/audit/shots/';
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const srv = await new Promise(resolve => {
  const s = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/plain' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => s.close() }));
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
// (the page's dice for a new seed, fixed: 1 + 4 % 99999 = seed 5)
await page.addInitScript(() => {
  crypto.getRandomValues = a => (a.fill(4), a);
});
try {
  await page.goto(srv.url + '/spar.html#s-7');
  await page.waitForFunction(() => !document.getElementById('loading') && globalThis.__spar, null, { timeout: 60000 });
  console.log('again button on load:', JSON.stringify(await page.textContent('#againbtn')));
  await page.click('#startbtn');
  await page.waitForFunction(() => __spar.phase === 'play' && __spar.plan.done, null, { timeout: 150000 });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => ({ seed: __spar.plan.seed, phase: __spar.phase, hash: location.hash, men: __spar.plan.men.map(m => m.grade), hp: __spar.plan.hp }));
  console.log('after 시작, playing:', JSON.stringify(before));
  await page.click('#againbtn');
  await page.waitForFunction(() => __spar.plan && __spar.plan.done, null, { timeout: 150000 });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => {
    const p = __spar.plan, b = __spar.bout, k = __spar.k;
    return {
      seed: p.seed, phase: __spar.phase, hash: location.hash, k,
      planMen: p.men.map(m => m.grade), planHp: p.hp,
      boutMen: b.fighters.map(f => f.skills && f.skills.all),
      boutHp: b.fighters.map(f => +f.hp.toFixed(1)),
      hud: [document.getElementById('name0').textContent, document.getElementById('name1').textContent],
      // the block under the playhead on each man's technique lane against what the bout's man is doing
      lanes: [0, 1].map(i => {
        const blk = p.rails[i].find(x => x.from <= k - 1 && k - 1 < (x.to ?? 1e9));
        const a = b.fighters[i].action;
        return { rail: blk ? blk.kind + ':' + blk.name : null, bout: a ? a.name : b.fighters[i].stun > 0 ? 'stunned' : b.fighters[i].cover ? 'guard' : 'nothing' };
      })
    };
  });
  console.log('after 다시 보기 (3 s later):', JSON.stringify(after));
  await page.screenshot({ path: SHOTS + '8-1-after-again.png' });
  console.log('console errors:', errors.length, JSON.stringify(errors.slice(0, 3)));
  const wrongSeed = after.seed !== before.seed;
  const mixed = after.phase === 'play' && JSON.stringify(after.boutMen) !== JSON.stringify(after.planMen);
  console.log(wrongSeed ? `REPRO: yes 다시 보기 on round #${before.seed} arranged the linked #${after.seed} instead${mixed ? `, and plays #${after.seed}'s controls into #${before.seed}'s men (bout ${after.boutMen.join('/')} vs plan ${after.planMen.join('/')}, k ${after.k})` : ''}` : `REPRO: no 다시 보기 replayed #${after.seed}`);
} finally {
  await browser.close();
  srv.close();
}
