// (test harness) run from anywhere: NODE_PATH=$(npm root -g) node game/tests/hunt-ten-victims.js
const __path = require('path'); process.chdir(__dirname); require('fs').mkdirSync('shots', { recursive: true });
const GAME = 'file://' + __path.resolve(__dirname, '..', 'slasher-x-slasher.html');
const { chromium } = require('playwright');
const FILE = GAME;
(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); }); return p; };
  const fps = (p, ms = 4000) => p.evaluate((ms) => new Promise((res) => { let n = 0, slow = 0, max = 0, last = performance.now(); const t0 = last; const f = (now) => { const d = now - last; last = now; n++; if (d > 34) slow++; max = Math.max(max, d); if (now - t0 < ms) requestAnimationFrame(f); else res({ fps: Math.round(n / (ms / 1000)), slow, maxMs: +max.toFixed(1) }); }; requestAnimationFrame(f); }), ms);
  const hunt = async (p, k) => { await p.goto(`${FILE}?killer=${k}&seed=23`); await p.waitForTimeout(400); await p.keyboard.press('k'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(150); await p.evaluate(() => startHuntPhase('hunt')); };
  // 1) ten victims, spread out
  {
    const p = await mk(); await hunt(p, 'doctor');
    const r = await p.evaluate(() => { const vs = __SXS.G.victims; let minGap = Infinity; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) minGap = Math.min(minGap, dist(vs[i].x, vs[i].y, vs[j].x, vs[j].y)); return { n: vs.length, names: vs.map((v) => v.info.name).join(''), minGap: +minGap.toFixed(1), keys: __SXS.G.keyItems.length, honey: __SXS.G.honeyItems.length, title: '' }; });
    console.log('spawn', JSON.stringify(r));
    // 2) shared sight: a sleeping machine far away looks at a victim → that victim is visible to the doctor
    const s = await p.evaluate(() => {
      const { G, P, M } = __SXS; const K = P;
      const o = G.openTiles.find(([x, y]) => [0, 1, 2, 3, 4].every((i) => walkable(x + i, y)) && dist(x, y, K.x, K.y) > 14);
      const m = new HuntMachine('saw', o[0], o[1], K); m.stunT = 99; m.ang = 0; G.machines.push(m);
      const v = G.victims[3]; v.x = o[0] + 3.5; v.y = o[1] + 0.5; v.stunT = 99; v.path = null; window.__v = v; window.__m = m;
      return { machineFar: +dist(m.x, m.y, K.x, K.y).toFixed(1) };
    });
    await p.waitForTimeout(300);
    const s2 = await p.evaluate(() => ({ dormant: __m.dormant, victimVisibleToDoctor: Vision.visible(__v.x, __v.y), drawn: __v._drawn }));
    console.log('hunt shared sight', JSON.stringify({ ...s, ...s2 }));
    // 3) a second, awake machine near the victim but blind to it (facing away, walls) should still target it via shared sight
    const s3 = await p.evaluate(() => {
      const { G, P } = __SXS; const K = P; const v = __v;
      // move doctor next to the far machine so a fresh machine stays awake (leash)
      K.x = __m.x - 1; K.y = __m.y; updateCamera(0, true);
      const m2 = new HuntMachine('drill', Math.floor(K.x), Math.floor(K.y), K); m2.stunT = 0; G.machines.push(m2); window.__m2 = m2;
      v.stunT = 99; return { m2: [m2.x, m2.y] };
    });
    await p.waitForTimeout(1500);
    console.log('machine targets', JSON.stringify(await p.evaluate(() => ({ goal: __m2.goal, last: __m2.lastSeen && [Math.floor(__m2.lastSeen.x), Math.floor(__m2.lastSeen.y)], victim: [Math.floor(__v.x), Math.floor(__v.y)], hp: __v.hp }))));
    await p.screenshot({ path: 'shots/ten-doc.png' });
    await p.evaluate(() => { const { G, P } = __SXS; for (let i = 0; i < 14; i++) G.machines.push(new HuntMachine(i % 2 ? 'saw' : 'drill', Math.floor(P.x), Math.floor(P.y), P)); });
    console.log('perf doctor 16 machines + 10 victims', JSON.stringify(await fps(p)), p.errs.length ? p.errs : 'no errors');
  }
  // 4) janitor S with ten victims' sight
  {
    const p = await mk(); await hunt(p, 'janitor');
    await p.evaluate(() => __SXS.P.setGrade(3));
    console.log('perf janitor S + 10 victims', JSON.stringify(await fps(p)));
    await p.screenshot({ path: 'shots/ten-hud.png' });
    await p.evaluate(() => { const G = __SXS.G; for (let i = 0; i < 6; i++) killVictim(G.victims[i], 'x'); G.victims[7].hp = 1; G.huntT = 0.3; });
    await p.waitForTimeout(4400);
    await p.screenshot({ path: 'shots/ten-end.png' });
    console.log('janitor', p.errs.length ? p.errs : 'no errors');
  }
  // 5) RUN: a sleeping machine spots the player; an awake machine with no line of sight starts chasing
  {
    const p = await mk();
    await p.goto(`${FILE}?killer=doctor&seed=23&god=1`); await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    await p.evaluate(() => { startPhase('play'); const { G, P } = __SXS; const D = G.killer;
      D.summon(); D.summon(); const [a, b] = D.machines();
      // a: far from the doctor (asleep) looking straight at the player; b: next to the doctor, facing away, far from the player
      const o = G.openTiles.find(([x, y]) => [0, 1, 2, 3].every((i) => walkable(x + i, y)) && dist(x, y, D.x, D.y) > 14);
      a.x = o[0] + 0.5; a.y = o[1] + 0.5; a.ang = 0; a.stunT = 0; P.x = o[0] + 3.5; P.y = o[1] + 0.5;
      b.x = D.x; b.y = D.y; b.ang = Math.PI; b.stunT = 0; b.state = 'patrol'; b.lastSeen = null;
      window.__a = a; window.__b = b; });
    await p.waitForTimeout(400);
    console.log('run shared sight', JSON.stringify(await p.evaluate(() => ({ teamSeen: !!__SXS.G.teamSeen, aDormant: __a.dormant, bSees: __b.sees, bState: __b.state, bLast: __b.lastSeen && [Math.floor(__b.lastSeen.x), Math.floor(__b.lastSeen.y)], player: [Math.floor(__SXS.P.x), Math.floor(__SXS.P.y)] }))), p.errs.length ? p.errs : 'no errors');
  }
  await browser.close();
})();
