// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/hunt-flow.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
// Hunt mode flow test: title → select → intro → hunt (attack / ability / context) → dawn or win
const { chromium } = require('playwright');
const path = require('path');
const FILE = GAME;
const OUT = path.join(__dirname, 'shots');
const killer = process.argv[2] || 'butcher';
const seed = process.argv[3] || '3';
const ending = process.argv[4] || 'dawn';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(`${FILE}?seed=${seed}`);
  await page.waitForTimeout(600);
  const shot = (n) => page.screenshot({ path: `${OUT}/hunt-${killer}-${n}.png` });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await shot('0-title');
  // tap the HUNT button on the title
  const hb = await ev(() => { const b = UI.title.hunt, S = Screen.dpr; return { x: (b.x + b.w / 2) / S, y: (b.y + b.h / 2) / S }; });
  await page.mouse.click(hb.x, hb.y);
  await page.waitForTimeout(400);
  console.log('after hunt tap:', await ev(() => __SXS.G.phase));
  await shot('1-select');
  // pick the killer card, then start
  const card = await ev((k) => { const c = UI.select.cards.find((q) => q.kind === k), S = Screen.dpr; return { x: (c.x + c.w / 2) / S, y: (c.y + c.h / 2) / S }; }, killer);
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(200);
  await shot('2-select-picked');
  const st = await ev(() => { const b = UI.select.start, S = Screen.dpr; return { x: (b.x + b.w / 2) / S, y: (b.y + b.h / 2) / S }; });
  await page.mouse.click(st.x, st.y);
  await page.waitForTimeout(1500);
  console.log('after start:', await ev(() => ({ phase: __SXS.G.phase, game: __SXS.G.game, kind: __SXS.P.kind })));
  await shot('3-intro');
  await page.waitForTimeout(2400);
  console.log('phase:', await ev(() => __SXS.G.phase));
  await shot('4-hunt');
  // walk a bit with the keyboard
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(700); await page.keyboard.up('ArrowDown');
  const mv = await ev(() => ({ x: __SXS.P.x.toFixed(2), y: __SXS.P.y.toFixed(2) }));
  console.log('hunter moved to', JSON.stringify(mv));
  await page.waitForTimeout(3000);
  console.log('victims:', JSON.stringify(await ev(() => __SXS.G.victims.map((v) => ({ s: v.state, x: v.x.toFixed(1), y: v.y.toFixed(1), k: v.keys })))));

  // 1) melee: put a victim right in front of the hunter
  const r1 = await ev(() => {
    const { G, P } = __SXS;
    const v = G.victims[0];
    const [tx, ty] = [Math.floor(P.x), Math.floor(P.y)];
    for (const [dx, dy] of DIRS) if (walkable(tx + dx, ty + dy)) { v.x = tx + dx + 0.5; v.y = ty + dy + 0.5; v.path = null; v.stunT = 1; P.ang = Math.atan2(dy, dx); break; }
    return { vx: v.x, vy: v.y };
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  const k1 = await ev(() => ({ kills: __SXS.G.kills, v0: __SXS.G.victims[0].state, stun: __SXS.G.victims[0].stunT.toFixed(2) }));
  console.log('melee →', JSON.stringify(k1));
  await shot('5-melee');

  // 2) ability
  const ab = await ev(() => {
    const { G, P, M } = __SXS; const K = P;
    K.abilCd = 0;
    if (K.kind === 'butcher') {
      // stand next to a breakable wall facing it
      for (const [x, y] of G.openTiles) for (const [dx, dy] of DIRS) if (walkable(x, y) && breakableWall(x + dx, y + dy)) { K.x = x + 0.5; K.y = y + 0.5; K.ang = Math.atan2(dy, dx); updateCamera(0, true); return { at: [x, y], dir: [dx, dy], ready: huntAbilityReady() }; }
    }
    if (K.kind === 'evolver') { K.evoT = CFG.EVOLVE_ADULT; }
    return { ready: huntAbilityReady() };
  });
  console.log('ability prep', JSON.stringify(ab));
  if (killer === 'evolver') await page.waitForTimeout(200);
  // put a victim in the line of fire for line abilities
  await ev(() => {
    const { G, P } = __SXS; const K = P;
    const v = G.victims.find((q) => !q.dead);
    if (!v || !['janitor', 'evolver', 'samurai'].includes(K.kind)) return;
    const [dx, dy] = facingDir(K), [tx, ty] = K.tile();
    const range = K.kind === 'samurai' ? 3 : 2;
    let ok = true; for (let i = 1; i <= range; i++) if (!walkable(tx + dx * i, ty + dy * i)) ok = false;
    if (!ok) { for (const [ex, ey] of DIRS) { let good = true; for (let i = 1; i <= range; i++) if (!walkable(tx + ex * i, ty + ey * i)) good = false; if (good) { K.ang = Math.atan2(ey, ex); break; } } }
    const [fx, fy] = facingDir(K);
    v.x = tx + fx * range + 0.5; v.y = ty + fy * range + 0.5; v.path = null; v.stunT = 2; v.state = 'flee';
  });
  const before = await ev(() => ({ kills: __SXS.G.kills, walls: __SXS.M.t.filter((t) => t === T.RUBBLE).length, candles: __SXS.G.candles.length, machines: __SXS.G.machines.length }));
  await page.keyboard.press('r');
  await page.waitForTimeout(1600);
  const after = await ev(() => ({ kills: __SXS.G.kills, walls: __SXS.M.t.filter((t) => t === T.RUBBLE).length, candles: __SXS.G.candles.length, machines: __SXS.G.machines.length, cd: __SXS.P.abilCd.toFixed(1), stunned: __SXS.G.victims.filter((v) => v.stunT > 0).length }));
  console.log('ability', JSON.stringify(before), '→', JSON.stringify(after));
  await shot('6-ability');

  // 3) check a hiding spot with a hidden victim inside
  const hc = await ev(() => {
    const { G, P, M } = __SXS; const K = P;
    const v = G.victims.find((q) => !q.dead);
    if (!v) return 'no victim';
    for (const f of M.hideSpots) {
      if (f.occupied) continue;
      for (const [dx, dy] of DIRS) {
        const x = f.x + dx, y = f.y + dy;
        if (!walkable(x, y) || (x === f.ax && y === f.ay && false)) continue;
        K.x = x + 0.5; K.y = y + 0.5; K.ang = Math.atan2(-dy, -dx); K.atk = null;
        v.state = 'hidden'; v.hideSpot = f; f.occupied = true; v.x = f.x + 0.5; v.y = f.y + 0.5; v.hideT = 0; v.boltAt = 99; v.stunT = 0;
        updateCamera(0, true);
        return { f: [f.x, f.y], at: [x, y], idx: v.idx };
      }
    }
    return 'no spot';
  });
  console.log('check prep', JSON.stringify(hc));
  await page.waitForTimeout(100);
  console.log('ctx offered:', await ev(() => __SXS.P.ctx && __SXS.P.ctx.kind));
  await page.keyboard.press('c');
  await page.waitForTimeout(2500); await shot('7-check');
  await ev(() => { const v = __SXS.G.victims.find((q) => q.state === 'hidden'); if (v) v.boltAt = 99; });
  await page.waitForTimeout(3000);
  console.log('check →', JSON.stringify(await ev(() => ({ kills: __SXS.G.kills, states: __SXS.G.victims.map((v) => v.state) }))));

  // 4) bash a locked door
  const bp = await ev(() => {
    const { G, P, M } = __SXS; const K = P;
    for (const d of M.doors) for (const [dx, dy] of DIRS) {
      const x = d.x + dx, y = d.y + dy;
      if (!walkable(x, y) || doorAt(x, y)) continue;
      d.state = 'locked'; d.bash = 0; K.x = x + 0.5; K.y = y + 0.5; K.ang = Math.atan2(-dy, -dx); updateCamera(0, true); repathAll();
      return { door: [d.x, d.y], bashTime: K.bashTime };
    }
  });
  await page.waitForTimeout(100);
  console.log('bash prep', JSON.stringify(bp), 'ctx', await ev(() => __SXS.P.ctx && __SXS.P.ctx.kind));
  await page.keyboard.press('c');
  await page.waitForTimeout(1200); await shot('8-bash');
  await page.waitForTimeout((bp ? bp.bashTime : 3) * 1000);
  console.log('bash →', await ev((b) => { const d = __SXS.M.doors.find((q) => q.x === b.door[0] && q.y === b.door[1]); return d && d.state; }, bp));

  // 5) toilet
  const tp = await ev(() => {
    const { G, P, M } = __SXS; const K = P; const t = M.toilets[0];
    for (const [dx, dy] of DIRS) { const x = t.x + dx, y = t.y + dy; if (walkable(x, y)) { K.x = x + 0.5; K.y = y + 0.5; G.toiletCd = 0; updateCamera(0, true); return { from: [x, y], to: [M.toilets[1].ax, M.toilets[1].ay] }; } }
  });
  await page.waitForTimeout(100);
  console.log('toilet ctx', await ev(() => __SXS.P.ctx && __SXS.P.ctx.kind));
  await page.keyboard.press('c');
  await page.waitForTimeout(1600);
  console.log('toilet →', JSON.stringify(tp), await ev(() => [Math.floor(__SXS.P.x), Math.floor(__SXS.P.y)]));

  // 6) let the AI run for a while (soak)
  await page.waitForTimeout(6000);
  await shot('9-soak');
  const info = await ev(() => ({ phase: __SXS.G.phase, t: __SXS.G.huntT.toFixed(0), kills: __SXS.G.kills, vs: __SXS.G.victims.map((v) => v.state + (v.keys ? '/k' + v.keys : '') + (v.honey ? '/h' : '')), traps: __SXS.G.honeyTraps.length, locked: __SXS.M.doors.filter((d) => d.state === 'locked').length }));
  console.log('soak', JSON.stringify(info));

  // 7) ending
  if (ending === 'dawn') {
    await ev(() => { __SXS.G.huntT = 2; });
    await page.waitForTimeout(3200); await shot('10-dawn');
    await page.waitForTimeout(3000);
  } else {
    await ev(() => { for (const v of __SXS.G.victims) if (!v.dead) killVictim(v, 'melee'); });
    await page.waitForTimeout(1000); await shot('10-win');
    await page.waitForTimeout(2600);
  }
  console.log('end phase:', await ev(() => __SXS.G.phase));
  await shot('11-end');
  await page.mouse.click(195, 500);
  await page.waitForTimeout(500);
  console.log('after end tap:', await ev(() => ({ phase: __SXS.G.phase, game: __SXS.G.game })));
  await shot('12-title');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
  await browser.close();
})();
