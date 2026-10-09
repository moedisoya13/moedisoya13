// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/run-mechanics.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
const FILE = GAME;
async function scenario(browser, killer, name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.goto(`${FILE}?killer=${killer}&seed=11`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => { __SXS.startPhase('play'); __SXS.G.startT = __SXS.G.rt; });
  let res;
  try { res = await fn(page); } catch (e) { res = 'THREW ' + e.message; }
  console.log(`[${killer}] ${name}:`, JSON.stringify(res), errs.length ? 'ERRORS: ' + errs.join(' | ') : '');
  await page.screenshot({ path: `shots/mech-${killer}-${name}.png` });
  await ctx.close();
}
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  // 1. hide + killer check (killer saw us hide)
  await scenario(browser, 'butcher', 'hide', async (page) => {
    await page.evaluate(() => {
      const { G, M } = __SXS; const K = G.killer;
      const f = M.hideSpots.find((h) => !inLockedRoom(h.ax, h.ay));
      P.x = f.ax + .5; P.y = f.ay + .5;
      K.x = f.ax + .5; K.y = f.ay + .5; // will be moved
      const fld = costField(f.ax, f.ay, {}); let b = null; for (let i = 0; i < fld.length; i++) if (fld[i] === 4 && walkable(i % M.w, (i / M.w) | 0)) { b = i; break; }
      K.x = (b % M.w) + .5; K.y = ((b / M.w) | 0) + .5; K.sees = true;
      doHide(f); K.state = 'chase';
      window.__spot = f;
    });
    await W(2500);
    const mid = await page.evaluate(() => ({ st: __SXS.G.killer.state, check: __spot.check, pstate: P.state }));
    await W(5000);
    const end = await page.evaluate(() => ({ st: __SXS.G.killer.state, pstate: P.state, hp: P.hp }));
    return { mid, end };
  });
  // 2. lock a door, killer bashes it
  await scenario(browser, 'witch', 'bash', async (page) => {
    return await page.evaluate(async () => {
      const { G, M } = __SXS; const K = G.killer;
      const d = M.doors.find((d) => d.state === 'open' && M.rooms[d.room].kind !== 'bathroom');
      // player inside room next to door, killer outside, door locked
      P.x = d.inX + .5; P.y = d.inY + .5;
      K.x = d.outX + .5; K.y = d.outY + .5; K.state = 'chase'; K.lastSeen = { x: P.x, y: P.y }; K.path = null;
      d.state = 'locked';
      // make the detour long: lock the room's other door too
      for (const id of M.rooms[d.room].doors) M.doors[id].state = 'locked';
      window.__door = d;
      return { door: d.state };
    }).then(async (r) => { await W(4000); const mid = await page.evaluate(() => ({ k: __SXS.G.killer.state, bash: +__door.bash.toFixed(2) })); await W(5500); const end = await page.evaluate(() => ({ door: __door.state, k: __SXS.G.killer.state })); return { r, mid, end }; });
  });
  // 3. toilet warp
  await scenario(browser, 'samurai', 'toilet', async (page) => {
    const r = await page.evaluate(() => { const { M } = __SXS; const [a, b] = M.toilets; P.x = a.ax + .5; P.y = a.ay + .5; doToilet(a); return { to: [b.ax, b.ay] }; });
    await W(900);
    const e = await page.evaluate(() => ({ p: [Math.floor(P.x), Math.floor(P.y)], st: P.state, cd: +__SXS.G.toiletCd.toFixed(2) }));
    return { r, e };
  });
  // 4. laurel → slot → letter / dup / honey
  await scenario(browser, 'janitor', 'laurel', async (page) => {
    await page.evaluate(() => { const G = __SXS.G; G.laurels.push({ x: Math.floor(P.x), y: Math.floor(P.y), t: 0 }); });
    await W(400);
    const spin = await page.evaluate(() => !!__SXS.G.slot.active);
    await W(1500);
    return await page.evaluate((spin) => ({ spin, letters: P.letters, honey: P.honey, dup: __SXS.G.dupT > 0 }), spin);
  });
  // 5. witch: six candles → hellgate → game over
  await scenario(browser, 'witch', 'hellgate', async (page) => {
    await page.evaluate(() => { const G = __SXS.G; for (let i = 0; i < 6; i++) { const t = G.openTiles[i * 37]; G.candles.push({ x: t[0], y: t[1], fake: false, t: 0 }); } });
    await W(1500);
    const mid = await page.evaluate(() => __SXS.G.phase);
    await W(3000);
    return { mid, end: await page.evaluate(() => [__SXS.G.phase, __SXS.G.deathCause]) };
  });
  // 6. witch: fake candle extinguish
  await scenario(browser, 'witch', 'fake', async (page) => {
    await page.evaluate(() => { const G = __SXS.G; const c = { x: Math.floor(P.x), y: Math.floor(P.y), fake: true, t: 0 }; G.candles.push(c); extinguishCandle(c); });
    return await page.evaluate(() => ({ hp: P.hp, slow: P.slowT > 0, candles: __SXS.G.candles.length }));
  });
  // 7. doctor countdown → explode; and touch reset
  await scenario(browser, 'doctor', 'touch', async (page) => {
    await page.evaluate(() => { const G = __SXS.G; G.docT = 100; const K = G.killer; K.x = P.x; K.y = P.y; });
    await W(300);
    return await page.evaluate(() => ({ docT: Math.round(__SXS.G.docT), d: +dist(P.x, P.y, __SXS.G.killer.x, __SXS.G.killer.y).toFixed(1) }));
  });
  await scenario(browser, 'doctor', 'explode', async (page) => {
    await page.evaluate(() => { const G = __SXS.G; G.docT = 0.5; G.killer.actT = 59.5; });
    await W(1200); const mid = await page.evaluate(() => [__SXS.G.phase, __SXS.G.enemies.length]);
    await W(2600); return { mid, end: await page.evaluate(() => [__SXS.G.phase, __SXS.G.deathCause]) };
  });
  await scenario(browser, 'doctor', 'summon', async (page) => {
    await page.evaluate(() => { const K = __SXS.G.killer; K.summon(); K.summon(); });
    await W(3000);
    return await page.evaluate(() => __SXS.G.enemies.map((e) => [e.kind, e.state, e.dormant || false]));
  });
  // 8. janitor grades + siren + flash
  await scenario(browser, 'janitor', 'grade', async (page) => {
    return await page.evaluate(() => {
      const G = __SXS.G, K = G.killer; K.sees = true;
      K.onPlayerAction('key'); K.onPlayerAction('toilet'); const sir = G.sirenT > 0; K.onPlayerAction('key');
      return { grade: K.grade, dmg: K.dmg, siren: sir };
    });
  });
  // 9. evolver: hatch, then evolve
  await scenario(browser, 'evolver', 'evolve', async (page) => {
    await page.evaluate(() => { const K = __SXS.G.killer; K.eggT = 59.9; });
    await W(500);
    const a = await page.evaluate(() => { const K = __SXS.G.killer; return [K.stage, +dist(K.x, K.y, P.x, P.y).toFixed(1)]; });
    await page.evaluate(() => { __SXS.G.killer.evoT = 89.9; });
    await W(400);
    const b = await page.evaluate(() => __SXS.G.killer.stage);
    await page.evaluate(() => { __SXS.G.killer.evoT = 179.9; });
    await W(400);
    const c = await page.evaluate(() => __SXS.G.killer.stage);
    await W(2500);
    return { a, b, c, hp: await page.evaluate(() => P.hp) };
  });
  // 10. samurai: spear through a wall + wells
  await scenario(browser, 'samurai', 'spear', async (page) => {
    await page.evaluate(() => { const { G, M } = __SXS; const K = G.killer; const tx = Math.floor(P.x), ty = Math.floor(P.y);
      // put samurai 3 tiles up/down in the same column even if a wall is between
      for (const dy of [-3, 3, -4, 4, -2, 2]) { if (walkable(tx, ty + dy)) { K.x = tx + .5; K.y = ty + dy + .5; break; } }
      K.spearCd = 0; K.sees = true; });
    await W(1400);
    return await page.evaluate(() => ({ hp: P.hp, cd: +__SXS.G.killer.spearCd.toFixed(1) }));
  });
  await scenario(browser, 'samurai', 'wells', async (page) => {
    await page.evaluate(() => { __SXS.G.killer.wellT = 40; });
    await W(9000);
    return await page.evaluate(() => ({ wells: __SXS.M.wells.length, use: __SXS.G.killer.useWells }));
  });
  // 11. butcher wall break
  await scenario(browser, 'butcher', 'wallbreak', async (page) => {
    const r = await page.evaluate(() => {
      const { G, M } = __SXS; const K = G.killer;
      // find a breakable wall with a big detour
      for (let y = 1; y < M.h - 1; y++) for (let x = 1; x < M.w - 1; x++) {
        if (!breakableWall(x, y)) continue;
        const horiz = tAt(x - 1, y) !== T.WALL && tAt(x + 1, y) !== T.WALL;
        const a = horiz ? [x - 1, y] : [x, y - 1], b = horiz ? [x + 1, y] : [x, y + 1];
        const p = findPath(a[0], a[1], b[0], b[1], {});
        if (p && p.cost > 14) { K.x = a[0] + .5; K.y = a[1] + .5; P.x = b[0] + .5; P.y = b[1] + .5; K.state = 'chase'; K.lastSeen = { x: P.x, y: P.y }; K.breakCd = 0; K.path = null; return { wall: [x, y], detour: p.cost }; }
      }
      return 'none';
    });
    await W(1800);
    return { r, after: await page.evaluate(() => ({ tile: r => 0, pstate: P.state, cracks: __SXS.G.cracks.length, cd: Math.round(__SXS.G.killer.breakCd) })) };
  });
  await browser.close();
})();
