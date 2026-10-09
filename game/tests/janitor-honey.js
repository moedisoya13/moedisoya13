// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/janitor-honey.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
const FILE = GAME;
(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); return p; };
  // RUN: the janitor watches the player drop honey (seen → up; unseen → no change)
  {
    const p = await mk();
    await p.goto(`${FILE}?killer=janitor&seed=17&god=1&honey=3`);
    await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    await p.evaluate(() => { startPhase('play'); });
    const seen = await p.evaluate(() => {
      const { G, P } = __SXS; const K = G.killer;
      const o = G.openTiles.find(([x, y]) => [0, 1, 2, 3].every((i) => walkable(x + i, y)));
      P.x = o[0] + 3.5; P.y = o[1] + 0.5; K.x = o[0] + 0.5; K.y = o[1] + 0.5; K.ang = 0; K.stunT = 0; K.path = null; K.atkCd = 99;
      return { g0: K.grade };
    });
    await p.waitForTimeout(250);
    await p.evaluate(() => { const K = __SXS.G.killer; window.__sees = K.sees; });
    await p.keyboard.press('q'); await p.waitForTimeout(150);
    const r1 = await p.evaluate(() => ({ sees: __sees, grade: __SXS.G.killer.grade, honey: __SXS.P.honey }));
    // unseen: killer far away & stunned
    await p.evaluate(() => { const { G, P } = __SXS; const K = G.killer; K.x = 1.5; K.y = 1.5; K.stunT = 5; K.sees = false; P.x = Math.floor(P.x) + 1.5; });
    await p.waitForTimeout(150);
    await p.keyboard.press('q'); await p.waitForTimeout(150);
    const r2 = await p.evaluate(() => ({ sees: __SXS.G.killer.sees, grade: __SXS.G.killer.grade, honey: __SXS.P.honey }));
    console.log('RUN  seen', JSON.stringify({ ...seen, ...r1 }), ' unseen', JSON.stringify(r2), p.errs.length ? p.errs : 'no errors');
  }
  // HUNT: a victim drops honey in the janitor's view
  {
    const p = await mk();
    await p.goto(`${FILE}?killer=janitor&seed=17`);
    await p.waitForTimeout(400); await p.keyboard.press('k'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    await p.evaluate(() => { startHuntPhase('hunt'); });
    await p.evaluate(() => {
      const { G, P } = __SXS; const K = P;
      const o = G.openTiles.find(([x, y]) => [0, 1, 2, 3, 4, 5].every((i) => walkable(x + i, y)));
      K.x = o[0] + 0.5; K.y = o[1] + 0.5; K.ang = 0; updateCamera(0, true);
      const v = G.victims[0]; v.x = o[0] + 2.5; v.y = o[1] + 0.5; v.honey = 1; v.state = 'flee'; v.calmT = 0; v.path = null; v.panicT = 0; v.stunT = 0.15; window.__v = v;
    });
    await p.waitForTimeout(400);
    console.log('HUNT', JSON.stringify(await p.evaluate(() => ({ grade: __SXS.P.grade, victimHoney: __v.honey, traps: __SXS.G.honeyTraps.length }))), p.errs.length ? p.errs : 'no errors');
  }
  await browser.close();
})();
