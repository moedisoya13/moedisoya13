// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/run-soak.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
const killers = (process.argv[2] || 'butcher,witch,janitor,evolver,doctor,samurai').split(',');
const secs = +(process.argv[3] || 40);
(async () => {
  const browser = await chromium.launch();
  for (const k of killers) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.goto(`${GAME}?killer=${k}&god=1&seed=${Math.floor(Math.random() * 1000)}`);
    await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(4200);
    // frame timing probe
    await page.evaluate(() => { window.__ft = []; const o = window.render; let last = performance.now(); window.__probe = setInterval(() => {}, 1000);
      const raf = (t) => { window.__ft.push(t - last); last = t; if (window.__ft.length < 100000) requestAnimationFrame(raf); }; requestAnimationFrame(raf); });
    const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const t0 = Date.now(); let held = null;
    while (Date.now() - t0 < secs * 1000) {
      if (held) await page.keyboard.up(held);
      held = dirs[Math.floor(Math.random() * 4)];
      await page.keyboard.down(held);
      const r = Math.random();
      if (r < 0.25) await page.keyboard.press('e');
      else if (r < 0.32) await page.keyboard.press('q');
      // occasionally hand out letters to exercise Shazam → revenge → comic
      if (Math.random() < 0.04) await page.evaluate(() => { const { G, P } = __SXS; if (G.phase === 'play' && G.mode === 'normal') { P.letters = { S: 1, H: 1, A: 2, Z: 1, M: 1 }; G.pendingShazam = true; } });
      // tap during comic
      const ph = await page.evaluate(() => __SXS.G.phase);
      if (ph === 'punish') { await page.mouse.click(195, 500); }
      if (ph === 'gameover' || ph === 'victory') { await page.waitForTimeout(1300); await page.keyboard.press('Enter'); await page.waitForTimeout(4200); }
      await page.waitForTimeout(300 + Math.random() * 900);
    }
    const st = await page.evaluate(() => { const { G, P } = __SXS; const ft = window.__ft.slice(10); ft.sort((a, b) => a - b);
      return { phase: G.phase, mode: G.mode, hp: P.hp, khp: G.killer.hp, shz: G.shazams, letters: P.letters, keys: P.keys, honey: P.honey, t: Math.round(G.time),
        ftMed: ft[Math.floor(ft.length / 2)]?.toFixed(1), ft95: ft[Math.floor(ft.length * 0.95)]?.toFixed(1), kstate: G.killer.state, extra: G.killer.stage || G.killer.grade || (G.candles ? G.candles.length : '') }; });
    console.log(k, JSON.stringify(st), errs.length ? '\n  ERRORS:\n  ' + [...new Set(errs)].join('\n  ') : 'no errors');
    await page.close();
  }
  await browser.close();
})();
