#!/usr/bin/env node
// Frame time with the kill / pick-up feedback at full load (GDD-V2 §7: "a phone holds 60 fps"):
// a 48×48 floor, ~100 enemies kept alive round the hero, the hero levelled (회전베기 5단계 and
// big damage) so a swing kills several at once — a heavy kill rate (≈ 5–10 kills a second) with
// shards raining into the gauge. The growth choice is kept shut (scenario) so the world never stops.
// Measured in headless Chromium on the built page (or --html FILE), two profiles like
// tests/art/perf.js: desktop 1280×720 ×1 and phone 667×375 ×2, touch, CPU ×4.
//   js   — the whole requestAnimationFrame callback (ticks + world + HUD + effects), wall ms
//   full — js + a 1-px readback that forces the canvas to raster
// Usage: node tests/ui/perf_feedback.js [--seconds 10] [--only desktop|phone] [--html FILE] [--enemies 100] [--rate 8]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('seconds', 10));
const ONLY = arg('only', '');
const HTML = path.resolve(arg('html', path.join(ROOT, 'dist/before-dawn.html')));
const ENEMIES = Number(arg('enemies', 100));
const RATE = Number(arg('rate', 8)); // enemies added per second at most (≈ the kill rate once the crowd is full)
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
    window.__PERF = { on: false, js: [], full: [], flush: false };
    window.requestAnimationFrame = (cb) => raf((ts) => {
      const P = window.__PERF, t0 = performance.now();
      cb(ts);
      const t1 = performance.now();
      if (P.flush) { const c = document.getElementById('bd'); if (c) c.getContext('2d').getImageData(0, 0, 1, 1); }
      if (P.on) { P.js.push(t1 - t0); P.full.push(performance.now() - t0); }
    });
  });
  await page.goto('file://' + HTML + '?seed=11&mute=1&nosave=1&hand=whirl,flame,leech');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.evaluate(() => { const B = window.__BD; B.app.save.settings.hints = false; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  await page.waitForTimeout(300);
  await page.evaluate(([n, rate]) => {
    const B = window.__BD, BD = window.BD;
    B.stage({ size: [48, 48], enemies: n });
    const w = B.world();
    w.scenario = true; // levels count, the choice stays shut
    w.hero.hp = w.hero.maxHp = 1e9; w.hero.radiance = 9;
    w.hero.x = 24; w.hero.y = 24; if (BD.client.camera && BD.client.camera.snap) BD.client.camera.snap();
    if (BD.view.snapCam) BD.view.snapCam(w);
    const c = w.cards.find((x) => x && x.id === 'whirl');
    if (c) while ((c.level || 1) < BD.cardRt.maxLevel(c.def)) BD.cardRt.levelUp(w, c);
    for (const id of ['edge', 'edge', 'edge']) if (BD.boons.has(id) && (w.hero.boons[id] || 0) < 3) BD.growth.giveBoon(w, id);
    // keep the crowd: fodder (and a threat now and then) 6–10u round the hero, at most --rate a second
    const fodder = BD.enemies.all().filter((d) => d.role === 'fodder').map((d) => d.id);
    const threats = BD.enemies.all().filter((d) => d.role !== 'fodder' && d.type !== 'boss').map((d) => d.id);
    let k = 0;
    window.__kills = 0;
    w.bus.on('kill', () => { window.__kills++; });
    window.__topup = setInterval(() => {
      const alive = w.enemies.filter((e) => !e.dead).length;
      for (let i = alive; i < Math.min(n, alive + rate / 4); i++) {
        const a = (k * 2.399) % (2 * Math.PI), r = 6 + (k % 5);
        const x = Math.max(1.5, Math.min(w.grid.w - 1.5, w.hero.x + Math.cos(a) * r)), y = Math.max(1.5, Math.min(w.grid.h - 1.5, w.hero.y + Math.sin(a) * r));
        k++;
        const kind = k % 9 === 0 && threats.length ? threats[k % threats.length] : fodder[k % fodder.length];
        if (w.grid.walkable(Math.floor(x), Math.floor(y))) BD.W.makeEnemy(w, kind, x, y, { via: 'placed' });
      }
    }, 250);
  }, [ENEMIES, RATE]);
  if (P.throttle > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.throttle }); }
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  const measure = async (flush) => {
    await page.evaluate((f) => { const P = window.__PERF; P.js = []; P.full = []; P.flush = f; P.on = true; window.__k0 = window.__kills; window.__t0 = window.__BD.world().t; }, flush);
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < SECONDS * 1000) {
      await page.keyboard.down(keys[i % 4]); await page.waitForTimeout(600); await page.keyboard.up(keys[i % 4]); i++;
    }
    return page.evaluate(() => { const P = window.__PERF; P.on = false; const w = window.__BD.world(); return { js: P.js, full: P.full, kills: window.__kills - window.__k0, gameSec: w.t - window.__t0, particles: window.BD.client.fx.list.length }; });
  };
  await page.waitForTimeout(1500);
  const a = await measure(false);
  const b = await measure(true);
  const alive = await page.evaluate(() => window.__BD.world().enemies.filter((e) => !e.dead).length);
  await browser.close();
  return {
    profile: P.id, seconds: SECONDS, enemiesAlive: alive, frames: a.js.length,
    killsPerSec: +(a.kills / Math.max(0.1, a.gameSec)).toFixed(1), particlesAtEnd: a.particles,
    jsMs: { p50: q(a.js, 0.5), p95: q(a.js, 0.95), max: q(a.js, 1) },
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
