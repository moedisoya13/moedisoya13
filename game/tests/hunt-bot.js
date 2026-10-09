// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/hunt-bot.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
// Autoplay soak for hunt mode: an omniscient bot chases the nearest victim,
// bashes locked doors, checks hiding spots, fires the ability now and then.
const { chromium } = require('playwright');
const path = require('path');
const FILE = GAME;
const OUT = path.join(__dirname, 'shots');
const killer = process.argv[2] || 'butcher';
const seed = process.argv[3] || '7';
const secs = (process.argv[4] || '60') | 0;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(`${FILE}?seed=${seed}&killer=${killer}`);
  await page.waitForTimeout(500);
  await page.keyboard.press('k'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.evaluate(() => startHuntPhase('hunt'));
  await page.evaluate(() => {
    window.__bot = { frames: 0, slow: 0, maxDt: 0, abil: 0, checks: 0, bashes: 0, last: performance.now() };
    const B = window.__bot;
    const tick = () => {
      const now = performance.now(), dt = now - B.last; B.last = now; B.frames++; if (dt > 34) B.slow++; B.maxDt = Math.max(B.maxDt, dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setInterval(() => {
      const { G, P, Input } = __SXS; const K = P;
      if (!G || G.game !== 'hunt' || G.phase !== 'hunt') return;
      const ks = Input.keys; ks.u = ks.d = ks.l = ks.r = false;
      if (K.check || K.bashP) return; // stand still while busy
      const live = G.victims.filter((v) => !v.dead);
      if (!live.length) return;
      let tgt = null, bd = Infinity;
      for (const v of live) { const d = Math.hypot(v.x - K.x, v.y - K.y); if (d < bd) { bd = d; tgt = v; } }
      const hidden = tgt.state === 'hidden';
      const goal = hidden ? [tgt.hideSpot.ax, tgt.hideSpot.ay] : [Math.floor(tgt.x), Math.floor(tgt.y)];
      // hidden target: once next to the spot, check it
      if (hidden && K.ctx && K.ctx.kind === 'check' && K.ctx.obj === tgt.hideSpot) { Input.btn.ctx.pressed = true; B.checks++; return; }
      if (K.ctx && K.ctx.kind === 'bash') {
        const d = K.ctx.obj; const [tx, ty] = K.tile();
        const pth = findPath(tx, ty, goal[0], goal[1], { bash: 0 });
        if (!pth) { Input.btn.ctx.pressed = true; B.bashes++; return; }
      }
      if (!hidden && bd < 1.45) { Input.btn.act.pressed = true; }
      if (Math.random() < 0.02) { Input.btn.abil.pressed = true; B.abil++; }
      const [tx, ty] = K.tile();
      const pth = findPath(tx, ty, goal[0], goal[1], { bash: K.bashTime, toilets: true, wells: K.useWells && M.wells.length === 2 });
      if (!pth || !pth.length) {
        // same tile — steer toward the victim directly
        const dx = tgt.x - K.x, dy = tgt.y - K.y;
        if (Math.abs(dx) > Math.abs(dy)) ks[dx > 0 ? 'r' : 'l'] = true; else ks[dy > 0 ? 'd' : 'u'] = true;
        return;
      }
      const st = pth[0]; const sx = st.i % M.w, sy = (st.i / M.w) | 0;
      if (st.via === VIA.TOILET || st.via === VIA.WELL) { if (K.ctx && (K.ctx.kind === 'toilet' || K.ctx.kind === 'well')) Input.btn.ctx.pressed = true; }
      const dx = sx - tx, dy = sy - ty;
      if (dx > 0) ks.r = true; else if (dx < 0) ks.l = true; else if (dy > 0) ks.d = true; else if (dy < 0) ks.u = true;
      // samurai: dig the wells early
      if (K.kind === 'samurai' && K.ctx && K.ctx.kind === 'wellPlace' && Math.random() < 0.05) Input.btn.ctx.pressed = true;
    }, 50);
  });
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => { const { G, P } = __SXS; return { ph: G.phase, t: Math.round(G.huntT), kills: G.kills, vs: G.victims.map((v) => v.state[0] + v.hp).join(','), K: P.kind, stage: P.stage, mach: G.machines && G.machines.length, candles: G.candles.length, grade: P.grade, wells: __SXS.M.wells.length }; });
    console.log(JSON.stringify(s));
    if (s.ph !== 'hunt') break;
  }
  await page.screenshot({ path: `${OUT}/bot-${killer}.png` });
  const b = await page.evaluate(() => window.__bot);
  console.log('bot', JSON.stringify(b));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 3).join('\n') : 'no errors');
  await browser.close();
})();
