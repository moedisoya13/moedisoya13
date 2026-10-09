// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/honey-immune.js
// A killer stuck by honey CFG.HONEY_IMMUNE_AFTER (10) times becomes immune: later traps are trampled.
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); }); return p; };
  // drop a trap under the entity, wait a few frames, report whether it stuck
  // (a RUN killer only checks honey while walking, so wait until the trap is gone)
  const trial = (p, who) => p.evaluate((who) => new Promise((res) => {
    const { G } = __SXS; const e = who === 'run' ? G.killer : __SXS.P;
    e.stuckT = 0; G.honeyTraps.length = 0; G.honeyTraps.push({ x: Math.floor(e.x), y: Math.floor(e.y), t: 0 });
    const t0 = performance.now();
    const poll = () => {
      if (G.honeyTraps.length && performance.now() - t0 < 1500) { G.honeyTraps[0].x = Math.floor(e.x); G.honeyTraps[0].y = Math.floor(e.y); return setTimeout(poll, 30); }
      res({ stuck: e.stuckT > 0, hits: e.honeyHits || 0, immune: !!e.honeyImmune, trapsLeft: G.honeyTraps.length });
    };
    poll();
  }), who);
  // RUN: the killer
  {
    const p = await mk();
    await p.goto(`${GAME}?killer=butcher&seed=9&god=1`); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    await p.evaluate(() => { startPhase('play'); const K = __SXS.G.killer; K.x = 1.5; K.y = 1.5; while (!walkable(Math.floor(K.x), Math.floor(K.y))) K.x += 1; K.path = null; });
    const rs = [];
    for (let i = 0; i < 11; i++) rs.push(await trial(p, 'run'));
    console.log('RUN ', rs.map((r) => (r.stuck ? 'S' : '-')).join(''), JSON.stringify(rs[9]), '→ 11th', JSON.stringify(rs[10]));
    await p.evaluate(() => { __SXS.P.honey = 2; }); await p.waitForTimeout(100);
    await p.screenshot({ path: 'shots/honey-run.png' });
    console.log('RUN errors', p.errs.length ? p.errs : 'none');
  }
  // HUNT: the player's killer
  {
    const p = await mk();
    await p.goto(`${GAME}?killer=witch&seed=9`); await p.waitForTimeout(400);
    await p.keyboard.press('k'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.evaluate(() => startHuntPhase('hunt'));
    const rs = [];
    for (let i = 0; i < 11; i++) { rs.push(await trial(p, 'hunt')); if (i === 4) await p.screenshot({ path: 'shots/honey-hunt-5.png' }); }
    console.log('HUNT', rs.map((r) => (r.stuck ? 'S' : '-')).join(''), JSON.stringify(rs[9]), '→ 11th', JSON.stringify(rs[10]));
    await p.screenshot({ path: 'shots/honey-hunt-immune.png' });
    console.log('HUNT errors', p.errs.length ? p.errs : 'none');
  }
  await browser.close();
})();
