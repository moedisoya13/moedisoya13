// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/map-audit.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto(GAME + '?seed=1');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const keep = __SXS.M;
    let maps = 0, clashTiles = 0, mapsWithClash = 0, hideN = 0, t0 = performance.now(), kinds = {};
    for (let i = 0; i < 300; i++) {
      const m = genMap(); M = m; maps++;
      let c = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (!walkable(x, y) && !doorAt(x, y)) continue;
        const ks = new Set();
        for (const [dx, dy] of DIRS) {
          if (doorAt(x + dx, y + dy)) ks.add('door');
          const f = furnAt(x + dx, y + dy);
          if (f && f.hide) ks.add('hide');
          if (f && f.kind === 'toilet') ks.add('toilet');
        }
        if (ks.size > 1) { c++; const k = [...ks].sort().join('+'); kinds[k] = (kinds[k] || 0) + 1; }
      }
      clashTiles += c; if (c) mapsWithClash++; hideN += m.hideSpots.length;
    }
    M = keep;
    return { maps, mapsWithClash, clashTiles, kinds, avgHideSpots: +(hideN / maps).toFixed(1), msPerMap: +((performance.now() - t0) / maps).toFixed(2) };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
