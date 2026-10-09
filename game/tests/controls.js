// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/controls.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
// Controls test (run mode): bend-follow, late corner cut, diagonal at a crossroads
const { chromium } = require('playwright');
const FILE = GAME;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${FILE}?seed=9&killer=butcher&god=1`);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    startPhase('play');
    const { G } = __SXS; G.killer.stunT = 9999; G.killer.x = 1.5; G.killer.y = 1.5;
    window.__trace = [];
    window.__joy = (x, y) => { const j = __SXS.Input.joy; const m = Math.hypot(x, y); j.active = m > 0; j.vx = m ? x / m : 0; j.vy = m ? y / m : 0; j.mag = m ? 1 : 0; };
    const rec = () => { const P = __SXS.P; __trace.push([P.x, P.y]); requestAnimationFrame(rec); };
    requestAnimationFrame(rec);
  });
  const W = (ms) => page.waitForTimeout(ms);
  const res = {};

  // 1) L-bend: hold "forward" into a plain wall where the corridor turns
  const bend = await page.evaluate(() => {
    const { M, P } = __SXS;
    for (let y = 2; y < M.h - 2; y++) for (let x = 2; x < M.w - 2; x++) {
      if (tAt(x, y) !== T.FLOOR) continue;
      const ex = DIRS.filter(([dx, dy]) => tAt(x + dx, y + dy) === T.FLOOR);
      if (ex.length !== 2 || ex[0][0] === -ex[1][0]) continue; // need an L
      const [a, b] = ex;               // come in along -a (moving toward the bend means direction = -a), leave along b
      const fwd = [-a[0], -a[1]];
      const sx = x + a[0] * 2, sy = y + a[1] * 2;
      if (tAt(x + a[0], y + a[1]) !== T.FLOOR || tAt(sx, sy) !== T.FLOOR || tAt(x + fwd[0], y + fwd[1]) !== T.WALL) continue;
      P.x = sx + 0.5; P.y = sy + 0.5; P.dx = fwd[0]; P.dy = fwd[1]; P.amt = 1; P.state = 'free';
      __joy(fwd[0], fwd[1]);
      return { bend: [x, y], start: [sx, sy], fwd, out: b };
    }
  });
  await W(1000);
  res.bend = { ...bend, end: await page.evaluate(() => { __joy(0, 0); return [Math.floor(__SXS.P.x), Math.floor(__SXS.P.y)]; }) };
  res.bend.followed = res.bend.end[0] === bend.bend[0] + bend.out[0] * (res.bend.end[0] - bend.bend[0] !== 0 ? Math.abs(res.bend.end[0] - bend.bend[0]) : 0) && true;

  // 2) late turn: moving up, already 0.3 past a junction centre, then push right
  const late = await page.evaluate(() => {
    const { M, P } = __SXS;
    for (let y = 3; y < M.h - 3; y++) for (let x = 2; x < M.w - 3; x++) {
      if (tAt(x, y) !== T.FLOOR || tAt(x, y - 1) !== T.FLOOR || tAt(x, y + 1) !== T.FLOOR || tAt(x + 1, y) !== T.FLOOR || tAt(x + 2, y) !== T.FLOOR) continue;
      P.x = x + 0.5; P.y = y + 0.5 - 0.3; P.dx = 0; P.dy = -1; P.amt = 1;
      __trace.length = 0; __joy(1, 0);
      return { at: [x, y] };
    }
  });
  await W(450);
  res.late = await page.evaluate((late) => {
    __joy(0, 0);
    const [x, y] = late.at, tr = __trace.slice();
    const cy = y + 0.5;
    // backward-only steps: y changes while x doesn't
    let pureBack = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < tr.length; i++) { const dx = tr[i][0] - tr[i - 1][0], dy = tr[i][1] - tr[i - 1][1]; if (Math.abs(dy) > 1e-4 && Math.abs(dx) < 1e-4) pureBack++; minY = Math.min(minY, tr[i][1]); maxY = Math.max(maxY, tr[i][1]); }
    const P = __SXS.P;
    return { tr: tr.slice(0, 8).map((p) => p.map((v) => +v.toFixed(3))), ...late, end: [+P.x.toFixed(2), +P.y.toFixed(2)], centredY: Math.abs(P.y - cy) < 1e-3, pureBackFrames: pureBack, frames: tr.length };
  }, late);

  // 3) diagonal at a crossroads: up-right ±3°, alternating each frame
  const cross = await page.evaluate(() => {
    const { M, P } = __SXS;
    for (let y = 3; y < M.h - 3; y++) for (let x = 3; x < M.w - 3; x++) {
      if (tAt(x, y) !== T.FLOOR) continue;
      if (!DIRS.every(([dx, dy]) => tAt(x + dx, y + dy) === T.FLOOR)) continue;
      P.x = x - 1 + 0.5; P.y = y + 0.5; P.dx = 1; P.dy = 0; P.amt = 1;
      __trace.length = 0;
      let k = 0; window.__osc = setInterval(() => { const a = -Math.PI / 4 + (k++ % 2 ? 0.05 : -0.05); __joy(Math.cos(a), Math.sin(a)); }, 16);
      return { at: [x, y] };
    }
  });
  await W(700);
  res.cross = await page.evaluate((c) => {
    clearInterval(__osc); __joy(0, 0);
    const tr = __trace.slice();
    let flips = 0, last = null;
    for (let i = 1; i < tr.length; i++) { const dx = tr[i][0] - tr[i - 1][0], dy = tr[i][1] - tr[i - 1][1]; if (Math.abs(dx) + Math.abs(dy) < 1e-4) continue; const ax = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (last && ax !== last) flips++; last = ax; }
    const P = __SXS.P;
    return { ...c, end: [+P.x.toFixed(2), +P.y.toFixed(2)], axisFlips: flips };
  }, cross);
  for (const k in res) console.log(k.padEnd(6), JSON.stringify(res[k]));
  console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no errors');
  await browser.close();
})();
