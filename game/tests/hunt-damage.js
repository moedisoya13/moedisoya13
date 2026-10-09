// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/hunt-damage.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
// Hunt mode with victim HP: every damage source, i-frames, knockback, 10-minute clock
const { chromium } = require('playwright');
const FILE = GAME;
async function boot(browser, killer) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto(`${FILE}?killer=${killer}&seed=17`);
  await page.waitForTimeout(400);
  await page.keyboard.press('k'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.evaluate(() => {
    startHuntPhase('hunt');
    // park the hunter in a long straight corridor, victim 0 right in front (stunned so it stays put)
    window.__front = (stun = 1) => {
      const { G, P } = __SXS; const K = P;
      const o = G.openTiles.find(([x, y]) => [0, 1, 2, 3, 4].every((i) => walkable(x + i, y)));
      K.x = o[0] + 0.5; K.y = o[1] + 0.5; K.ang = 0; K.atk = null; K.atkCd = 0; updateCamera(0, true);
      const v = G.victims.find((q) => !q.dead);
      v.x = o[0] + 1.5; v.y = o[1] + 0.5; v.path = null; v.goal = null; v.knock = null; v.hurtT = 0; v.stunT = stun; v.state = 'flee'; v.trav = null;
      window.__v = v; return v.idx;
    };
    window.__st = () => { const v = __v; return { hp: v.hp, dead: v.dead, hurtT: +v.hurtT.toFixed(2), knock: !!v.knock, d: +dist(v.x, v.y, __SXS.P.x, __SXS.P.y).toFixed(2), stun: +v.stunT.toFixed(2), state: v.state }; };
  });
  await page.waitForTimeout(100);
  return page;
}
const W = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const browser = await chromium.launch();
  const out = [];
  {
    const p = await boot(browser, 'butcher');
    out.push(['clock', await p.evaluate(() => ({ huntT: Math.round(__SXS.G.huntT), hp0: __SXS.G.victims.map((v) => v.hp) }))]);
    await p.evaluate(() => __front()); await p.keyboard.press('Space'); await W(p, 200);
    const a = await p.evaluate(() => __st());
    await p.evaluate(() => { const K = __SXS.P; __v.x = K.x + 1; __v.y = K.y; __v.knock = null; K.atk = null; K.atkCd = 0; });
    await p.keyboard.press('Space'); await W(p, 200);
    const b = await p.evaluate(() => __st());
    await W(p, 900);
    await p.evaluate(() => __front(1)); await p.keyboard.press('Space'); await W(p, 250);
    const c = await p.evaluate(() => __st());
    out.push(['butcher 2dmg', { first: a, duringIframe: b, after: c, kills: await p.evaluate(() => __SXS.G.kills) }]);
    await p.screenshot({ path: 'shots/hp-butcher.png' });
    out.push(['butcher errs', p.errs]);
  }
  {
    const p = await boot(browser, 'witch');
    const seq = [];
    for (let i = 0; i < 3; i++) { await p.evaluate(() => __front()); await p.keyboard.press('Space'); await W(p, 300); seq.push(await p.evaluate(() => __st().hp)); await W(p, 700); }
    out.push(['witch 3 hits', { seq, dead: await p.evaluate(() => __v.dead) }]);
    // fake candle snuffed: 1 damage, no knockback
    await p.evaluate(() => { const { G } = __SXS; const v = G.victims.find((q) => !q.dead); v.hurtT = 0; v.knock = null; v.stunT = 0; v.state = 'roam'; v.busyT = 0; const tx = Math.floor(v.x), ty = Math.floor(v.y); G.candles.push({ x: tx, y: ty, fake: true, t: 0 }); window.__v = v; window.__hp0 = v.hp; });
    await W(p, 900);
    out.push(['fake candle', await p.evaluate(() => ({ before: __hp0, ...__st() }))]);
    out.push(['witch errs', p.errs]);
  }
  {
    const p = await boot(browser, 'janitor');
    await p.evaluate(() => { __SXS.P.setGrade(3); __front(); }); await p.keyboard.press('Space'); await W(p, 300);
    out.push(['janitor S one-shot', await p.evaluate(() => ({ dmg: __SXS.P.dmg, ...__st() }))]);
    out.push(['janitor errs', p.errs]);
  }
  {
    const p = await boot(browser, 'doctor');
    await p.evaluate(() => __front(0)); await p.keyboard.press('Space'); await W(p, 700);
    const a = await p.evaluate(() => __st());
    await p.evaluate(() => { const K = __SXS.P; __v.x = K.x + 1; __v.y = K.y; K.atk = null; K.atkCd = 0; });
    await p.keyboard.press('Space'); await W(p, 300);
    const b = await p.evaluate(() => __st());
    // a machine touching a victim: 1 damage then a cooldown
    await p.evaluate(() => { const { G, P } = __SXS; __front(3); P.abilCd = 0; });
    await p.keyboard.press('r'); await W(p, 100);
    await p.evaluate(() => { const m = __SXS.G.machines[0]; m.stunT = 0; m.x = __v.x; m.y = __v.y; __v.hurtT = 0; __v.knock = null; window.__hpm = __v.hp; });
    await W(p, 200);
    const c = await p.evaluate(() => ({ before: __hpm, ...__st(), hitCd: +__SXS.G.machines[0].hitCd.toFixed(2) }));
    out.push(['doctor', { batonStun: a, batonOnStunned: b, machine: c }]);
    out.push(['doctor errs', p.errs]);
  }
  {
    const p = await boot(browser, 'samurai');
    await p.evaluate(() => { __front(2); const v = __v; const K = __SXS.P; v.x = K.x + 3; P = __SXS.P; K.abilCd = 0; });
    await p.keyboard.press('r'); await W(p, 1400);
    out.push(['spear', await p.evaluate(() => __st())]);
    // hide spot found: pulled out and hit
    const r = await p.evaluate(() => {
      const { G, P, M } = __SXS; const K = P; const v = G.victims.find((q) => !q.dead);
      for (const f of M.hideSpots) { if (f.occupied) continue; for (const [dx, dy] of DIRS) { const x = f.x + dx, y = f.y + dy; if (!walkable(x, y)) continue;
        K.x = x + 0.5; K.y = y + 0.5; K.ang = Math.atan2(-dy, -dx); K.atk = null; v.hurtT = 0; v.knock = null; v.stunT = 0;
        v.state = 'hidden'; v.hideSpot = f; f.occupied = true; v.x = f.x + 0.5; v.y = f.y + 0.5; v.hideT = 0; v.boltAt = 99; updateCamera(0, true); window.__v = v; window.__hph = v.hp; return true; } }
    });
    await W(p, 100); await p.keyboard.press('c');
    await W(p, 1500); await p.evaluate(() => { __v.boltAt = 99; });
    await W(p, 4000);
    out.push(['found', await p.evaluate(() => ({ before: __hph, ...__st() }))]);
    out.push(['samurai errs', p.errs]);
  }
  {
    const p = await boot(browser, 'evolver');
    await p.evaluate(() => { __SXS.P.evoT = CFG.EVOLVE_ADULT; }); await W(p, 200);
    await p.evaluate(() => { __front(2); const K = __SXS.P; __v.x = K.x + 2; K.abilCd = 0; });
    await p.keyboard.press('r'); await W(p, 1000);
    out.push(['tentacle', await p.evaluate(() => __st())]);
    out.push(['evolver errs', p.errs]);
  }
  for (const [k, v] of out) console.log(k.padEnd(20), JSON.stringify(v));
  await browser.close();
})();
