// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/hunt-rules.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
// Hunt-mode rule checks per killer
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
  await page.evaluate(() => startHuntPhase('hunt'));
  await page.waitForTimeout(100);
  return page;
}
const W = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const browser = await chromium.launch();
  const out = [];
  // witch: 6 real candles → ritual kills one victim and consumes the candles
  {
    const p = await boot(browser, 'witch');
    await p.evaluate(() => { const { G } = __SXS; for (let i = 0; i < 6; i++) { const [x, y] = spawnTile(3); G.candles.push({ x, y, fake: false, t: 0 }); } });
    await W(p, 400);
    out.push(['witch ritual', await p.evaluate(() => ({ kills: __SXS.G.kills, candles: __SXS.G.candles.length }))]);
    // 4 lit → the eye reveals all
    await p.evaluate(() => { const { G } = __SXS; for (let i = 0; i < 4; i++) { const [x, y] = spawnTile(3); G.candles.push({ x, y, fake: false, t: 0 }); } G.eyeCycleT = CFG.WITCH_EYE_EVERY; });
    await W(p, 200);
    out.push(['witch eye', await p.evaluate(() => ({ exposeAll: __SXS.G.exposeAllT.toFixed(1), fakes: __SXS.G.candles.filter((c) => c.fake).length }))]);
    // a victim snuffs a fake candle → stunned
    await p.evaluate(() => { const { G } = __SXS; const v = G.victims.find((q) => !q.dead); const tx = Math.floor(v.x), ty = Math.floor(v.y); G.candles.push({ x: tx, y: ty, fake: true, t: 0 }); v.state = 'roam'; v.busyT = 0; window.__v = v; });
    await W(p, 900);
    out.push(['victim snuffs fake', await p.evaluate(() => ({ stun: __v.stunT.toFixed(1), exposed: __v.exposedT.toFixed(1) }))]);
    out.push(['witch errs', p.errs]);
  }
  // janitor: victim unlocks a door in view → grade up; S grade shares victims' sight
  {
    const p = await boot(browser, 'janitor');
    const r = await p.evaluate(() => {
      const { G, P, M } = __SXS; const K = P; const v = G.victims[0];
      // a door with walkable tiles on both sides along a straight line
      for (const d of M.doors) {
        for (const [dx, dy] of DIRS) {
          const ax = d.x - dx, ay = d.y - dy, bx = d.x + dx, by = d.y + dy;
          if (!walkable(ax, ay) || !walkable(bx, by) || !walkable(ax - dx, ay - dy)) continue;
          d.state = 'locked'; v.keys = 1; v.x = ax + 0.5; v.y = ay + 0.5; v.state = 'roam'; v.goal = [bx, by]; v.path = null; v.roamT = 20;
          K.x = ax - dx + 0.5; K.y = ay - dy + 0.5; K.ang = Math.atan2(dy, dx); updateCamera(0, true); repathAll();
          return { door: [d.x, d.y], grade0: K.grade };
        }
      }
    });
    await W(p, 1500);
    out.push(['janitor witness', { ...r, ...(await p.evaluate((r) => ({ grade: __SXS.P.grade, door: __SXS.M.doors.find((d) => d.x === r.door[0] && d.y === r.door[1]).state, keys: __SXS.G.victims[0].keys }), r)) }]);
    await p.evaluate(() => { __SXS.P.setGrade(3); });
    await W(p, 300);
    out.push(['janitor S', await p.evaluate(() => ({ grade: __SXS.P.grade }))]);
    // flashlight blinds a victim in front
    await p.evaluate(() => { const { G, P } = __SXS; const v = G.victims.find((q) => !q.dead); const [tx, ty] = P.tile(); const [dx, dy] = facingDir(P); if (walkable(tx + dx * 2, ty + dy * 2)) { v.x = tx + dx * 2 + 0.5; v.y = ty + dy * 2 + 0.5; } v.path = null; P.abilCd = 0; window.__v = v; });
    await p.keyboard.press('r'); await W(p, 700);
    out.push(['janitor flash', await p.evaluate(() => ({ stun: __v.stunT.toFixed(1), cd: __SXS.P.abilCd.toFixed(1) }))]);
    out.push(['janitor errs', p.errs]);
  }
  // samurai: dig two wells and travel
  {
    const p = await boot(browser, 'samurai');
    const r = await p.evaluate(() => {
      const { G, P, M } = __SXS; const K = P;
      const a = G.openTiles.find(([x, y]) => walkable(x, y) && openTile(x, y));
      const b = G.openTiles.find(([x, y]) => walkable(x, y) && openTile(x, y) && dist(x, y, a[0], a[1]) > 12);
      K.x = a[0] + 0.5; K.y = a[1] + 0.5; updateCamera(0, true);
      window.__ab = [a, b];
      return { a, b };
    });
    await W(p, 100);
    const c1 = await p.evaluate(() => __SXS.P.ctx && __SXS.P.ctx.kind);
    await p.keyboard.press('c'); await W(p, 200);
    await p.evaluate(() => { const K = __SXS.P, b = __ab[1]; K.x = b[0] + 0.5; K.y = b[1] + 0.5; updateCamera(0, true); });
    await W(p, 100);
    await p.keyboard.press('c'); await W(p, 200);
    const c2 = await p.evaluate(() => __SXS.P.ctx && __SXS.P.ctx.kind);
    await p.keyboard.press('c'); await W(p, 1800);
    out.push(['samurai wells', { r, c1, c2, wells: await p.evaluate(() => __SXS.M.wells.length), at: await p.evaluate(() => __SXS.P.tile()) }]);
    out.push(['samurai errs', p.errs]);
  }
  // evolver: larva → adult → perfect; stealth when still
  {
    const p = await boot(browser, 'evolver');
    await W(p, 3400);
    const s0 = await p.evaluate(() => ({ stage: __SXS.P.stage, stealth: __SXS.P.stealth }));
    await p.evaluate(() => { __SXS.P.evoT = CFG.EVOLVE_ADULT; }); await W(p, 200);
    const s1 = await p.evaluate(() => ({ stage: __SXS.P.stage }));
    await p.evaluate(() => { __SXS.P.evoT = CFG.EVOLVE_PERFECT; }); await W(p, 200);
    const s2 = await p.evaluate(() => ({ stage: __SXS.P.stage, ratio: __SXS.P.ratio }));
    await p.evaluate(() => { __SXS.P.upgT = 99; }); await W(p, 200);
    const s3 = await p.evaluate(() => ({ ratio: __SXS.P.ratio.toFixed(3), tr: __SXS.P.tentRange }));
    out.push(['evolver', { s0, s1, s2, s3 }]);
    await p.screenshot({ path: 'shots/hm-evolver.png' });
    out.push(['evolver errs', p.errs]);
  }
  // butcher: honey trap laid by a fleeing victim sticks the hunter; hide bolt ends the check
  {
    const p = await boot(browser, 'butcher');
    await p.evaluate(() => { const { G, P } = __SXS; const [tx, ty] = P.tile(); const [dx, dy] = DIRS.find(([a, b]) => walkable(tx + a, ty + b)); G.honeyTraps.push({ x: tx + dx, y: ty + dy, t: 0 }); window.__dir = [dx, dy]; });
    const key = await p.evaluate(() => ({ '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' })[__dir.join(',')]);
    await p.keyboard.down(key); await W(p, 400); await p.keyboard.up(key);
    out.push(['honey stick', await p.evaluate(() => ({ stuck: __SXS.P.stuckT.toFixed(1), traps: __SXS.G.honeyTraps.length }))]);
    await W(p, 2000);
    // bolt: victim hides, hunter checks, victim bursts out → check cancelled
    const r = await p.evaluate(() => {
      const { G, P, M } = __SXS; const K = P; K.stuckT = 0;
      const v = G.victims.find((q) => !q.dead);
      for (const f of M.hideSpots) { if (f.occupied) continue; for (const [dx, dy] of DIRS) { const x = f.x + dx, y = f.y + dy; if (!walkable(x, y)) continue;
        K.x = x + 0.5; K.y = y + 0.5; K.ang = Math.atan2(-dy, -dx); v.state = 'hidden'; v.hideSpot = f; f.occupied = true; v.x = f.x + 0.5; v.y = f.y + 0.5; v.hideT = 0; updateCamera(0, true); window.__v = v; return [f.x, f.y]; } }
    });
    await W(p, 100); await p.keyboard.press('c'); await W(p, 300);
    await p.evaluate(() => { __v.boltAt = 0.1; });
    await W(p, 400);
    out.push(['bolt', await p.evaluate(() => ({ v: __v.state, check: !!__SXS.P.check, f: __SXS.M.hideSpots.find((f) => f.occupied && f === __v.hideSpot) ? 'still' : 'free' }))]);
    out.push(['butcher errs', p.errs]);
  }
  for (const [k, v] of out) console.log(k.padEnd(20), JSON.stringify(v));
  await browser.close();
})();
