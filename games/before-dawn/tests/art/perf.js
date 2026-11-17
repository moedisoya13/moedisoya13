#!/usr/bin/env node
// Frame time on a staged 48×48 floor with 110 enemies (the engine's own staging hook,
// __BD.stage), measured in headless Chromium on the built page. Two profiles:
//   desktop  1280×720, device scale 1
//   phone    667×375, device scale 2, touch, CPU throttled ×4 (a mid phone, roughly)
// Per profile: the hero walks a loop across the floor for SECONDS while the crowd converges on
// him (hero invulnerable; dead enemies topped up so 110 stay alive). Reported per frame:
//   js   — the whole requestAnimationFrame callback (ticks + world + HUD), wall ms
//   full — js + a 1-px readback that forces the canvas to raster (what the frame really costs)
// and the world draw alone (BD.client.render.drawWorld). Prints one JSON line per profile.
// Usage: node tests/art/perf.js [--seconds 8] [--only desktop|phone] [--enemies 110] [--art]
//   --art  stage through BD.client.artStage (the showcase floor) instead of __BD.stage
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('seconds', 8));
const ENEMIES = Number(arg('enemies', 110));
const ONLY = arg('only', '');
const ART = process.argv.includes('--art');
const PROFILES = [
  { id: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, throttle: 1 },
  { id: 'phone', viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, throttle: 4 },
];

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null; };

async function run(P) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: P.viewport, deviceScaleFactor: P.deviceScaleFactor, hasTouch: !!P.hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__PERF = { on: false, js: [], full: [], world: [], flush: false };
    window.requestAnimationFrame = (cb) => raf((ts) => {
      const P = window.__PERF, t0 = performance.now();
      cb(ts);
      const t1 = performance.now();
      if (P.flush) { const c = document.getElementById('bd'); if (c) c.getContext('2d').getImageData(0, 0, 1, 1); }
      if (P.on) { P.js.push(t1 - t0); P.full.push(performance.now() - t0); }
    });
  });
  await page.goto('file://' + path.join(ROOT, 'dist/before-dawn.html') + '?seed=11&mute=1&nosave=1&hand=pierce,flame,leech');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.evaluate(() => { const B = window.__BD; B.app.save.settings.hints = false; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  await page.waitForTimeout(300);
  await page.evaluate(([n, art]) => {
    const B = window.__BD, BD = window.BD;
    if (art && BD.client.artStage) BD.client.artStage.stage(B.world(), { enemies: n, layout: 'office' });
    else B.stage({ size: [48, 48], enemies: n });
    const w = B.world(); w.hero.hp = w.hero.maxHp = 1e9;
    w.hero.x = 30; w.hero.y = 30; BD.client.camera.snap();
    // keep the crowd at n: top up dead enemies near the edge of the view every half second
    const kinds = BD.enemies.all().filter((d) => d.type !== 'boss').map((d) => d.id);
    let k = 0;
    window.__topup = setInterval(() => {
      const alive = w.enemies.filter((e) => !e.dead).length;
      for (let i = alive; i < n; i++) {
        const a = (k * 2.399) % (2 * Math.PI), r = 9 + (k % 5);
        const x = Math.max(1.5, Math.min(w.grid.w - 1.5, w.hero.x + Math.cos(a) * r)), y = Math.max(1.5, Math.min(w.grid.h - 1.5, w.hero.y + Math.sin(a) * r));
        k++;
        if (w.grid.walkable(Math.floor(x), Math.floor(y))) BD.W.makeEnemy(w, kinds[k % kinds.length], x, y, { via: 'placed' });
      }
    }, 500);
    // world draw time alone
    const R = BD.client.render, orig = R.drawWorld;
    R.drawWorld = function (g, ui, dt) { const t0 = performance.now(); orig.call(this, g, ui, dt); if (window.__PERF.on) window.__PERF.world.push(performance.now() - t0); };
  }, [ENEMIES, ART]);
  if (P.throttle > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.throttle }); }
  // the hero walks a square loop (keys), so new parts of the floor keep coming on screen
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  const measure = async (flush) => {
    await page.evaluate((f) => { const P = window.__PERF; P.js = []; P.full = []; P.world = []; P.flush = f; P.on = true; }, flush);
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < SECONDS * 1000) {
      await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(900); await page.keyboard.up(keys[i % 4]); i++;
    }
    return page.evaluate(() => { const P = window.__PERF; P.on = false; return { js: P.js, full: P.full, world: P.world }; });
  };
  await page.waitForTimeout(1000); // warm-up: chunks around the start
  const a = await measure(false);
  const b = await measure(true);
  const alive = await page.evaluate(() => window.__BD.world().enemies.filter((e) => !e.dead).length);
  await browser.close();
  return {
    profile: P.id, art: ART, seconds: SECONDS, enemiesAlive: alive, frames: a.js.length,
    jsMs: { p50: q(a.js, 0.5), p95: q(a.js, 0.95), max: q(a.js, 1) },
    worldMs: { p50: q(a.world, 0.5), p95: q(a.world, 0.95) },
    fullMs: { p50: q(b.full, 0.5), p95: q(b.full, 0.95), max: q(b.full, 1), over16: +(b.full.filter((x) => x > 16.7).length / Math.max(1, b.full.length)).toFixed(3) },
    errors,
  };
}

(async () => {
  for (const P of PROFILES) {
    if (ONLY && P.id !== ONLY) continue;
    console.log(JSON.stringify(await run(P)));
  }
})().catch((e) => { console.error(e); process.exit(1); });
