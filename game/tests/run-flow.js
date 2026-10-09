// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/run-flow.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
const path = require('path');
const FILE = GAME;
const OUT = path.join(__dirname, 'shots');
const killer = process.argv[2] || 'butcher';
const seed = process.argv[3] || '3';
const taps = (process.argv[4] || '3') | 0; // how many lightning marks to hit
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(`${FILE}?killer=${killer}&seed=${seed}`);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4200);
  const shot = (n) => page.screenshot({ path: `${OUT}/${killer}-${n}.png` });
  // put the killer 3 tiles away along an open path and let it chase
  await page.evaluate(() => {
    const { G, P, M } = __SXS; const K = G.killer;
    if (K.stage === 'egg') K.hatch && K.hatch();
    // find a walkable tile ~3 steps from the player
    const f = costField(Math.floor(P.x), Math.floor(P.y), {});
    let best = null; for (let i = 0; i < f.length; i++) if (f[i] === 3 && walkable(i % M.w, (i / M.w) | 0)) { best = i; break; }
    if (best !== null) { K.x = (best % M.w) + .5; K.y = ((best / M.w) | 0) + .5; }
    K.state = 'chase'; K.lastSeen = { x: P.x, y: P.y }; K.path = null;
  });
  await page.waitForTimeout(900); await shot('4-chase');
  await page.waitForTimeout(1500); await shot('5-chase2');
  const s1 = await page.evaluate(() => { const { G, P } = __SXS; return { hp: P.hp, st: P.state, k: G.killer.state, phase: G.phase }; });
  console.log('after chase', JSON.stringify(s1));
  // Shazam
  await page.evaluate(() => { const { G, P } = __SXS; if (P.state === 'dead') return; P.hp = 3; P.letters = { S: 1, H: 1, A: 2, Z: 1, M: 1 }; G.pendingShazam = true; });
  await page.waitForTimeout(500); await shot('6-shazam-a');
  await page.waitForTimeout(600); await shot('7-shazam-bolt');
  await page.waitForTimeout(1600); await shot('8-revenge');
  // move the killer next to the hero → close-up
  await page.evaluate(() => { const { G, P } = __SXS; const K = G.killer; K.x = P.x; K.y = P.y + 0.5; K.trav = null; });
  await page.waitForTimeout(400); await shot('9-closeup');
  await page.waitForTimeout(900);
  const ph = await page.evaluate(() => __SXS.G.phase);
  console.log('phase before comic:', ph);
  // comic: marks arrive at 2.0, 2.75, 3.5 s after punish starts
  const t0 = await page.evaluate(() => __SXS.Comic.t);
  const arrivals = [2.0, 2.75, 3.5];
  await shot('10-comic-start');
  for (let i = 0; i < 3; i++) {
    const now = await page.evaluate(() => __SXS.Comic.t);
    const wait = (arrivals[i] - now) * 1000 - 20;
    if (wait > 0) await page.waitForTimeout(wait);
    if (i === 1) await shot('11-comic-mark');
    if (i < taps) await page.mouse.click(195, 600);
  }
  await page.waitForTimeout(500); await shot('12-comic-punch');
  await page.waitForTimeout(250); await shot('13-comic-impact');
  await page.waitForTimeout(900); await shot('14-comic-after');
  const c = await page.evaluate(() => { const C = __SXS.Comic; return { charge: C.charge, hpAfter: C.hpAfter, ko: C.ko }; });
  console.log('comic', JSON.stringify(c));
  await page.waitForTimeout(2600); await shot('15-after');
  const s2 = await page.evaluate(() => { const { G, P } = __SXS; return { phase: G.phase, mode: G.mode, hp: G.killer.hp, letters: P.letters, aPhase: G.aPhase }; });
  console.log('end', JSON.stringify(s2));
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
