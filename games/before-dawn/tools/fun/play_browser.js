#!/usr/bin/env node
// One whole run in the real browser build at normal speed, steered by the human-like pilot of
// lib.js, with frames captured along the way. docs/GDD-V2.md §10.
//
//   node tools/fun/play_browser.js --seed 21 --out /tmp/run21
//   node tools/fun/play_browser.js --seed 7 --hand whirl,flame,leech --altar card --trial --out DIR
//   node tools/fun/play_browser.js --seed 7 --phone        667×375 touch viewport
//
// What it does: builds nothing (run `node build.js` first), opens dist/before-dawn.html from
// file://, takes the title → prep → play path with the keyboard, then replaces the page's input
// source with the pilot (one decision per simulated tick, exactly as in Node) and lets the page's
// own frame loop run. Choice overlays are answered after --think seconds of real time (default 2),
// as a person reading the cards would. Frames: one per second of game time for the first 60 s,
// then one every --every seconds (default 5). Output: DIR/run.json (the lib.js summary, wall
// clock, frame rate, console errors) and DIR/t####.jpg.
'use strict';
const path = require('path');
const fs = require('fs');
const L = require('./lib');

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
const o = args();
const seed = Number(o.seed || 21);
const OUT = path.resolve(String(o.out || path.join(__dirname, '..', '..', 'dist', 'fun', 'seed' + seed)));
const every = Number(o.every || 5), think = Number(o.think || 2), firstDense = Number(o.first === undefined ? 60 : o.first);
const HTML = path.resolve(String(o.html || path.join(__dirname, '..', '..', 'dist', 'before-dawn.html')));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const vp = o.phone ? { width: 667, height: 375 } : { width: 1280, height: 720 };
  const ctx = await browser.newContext({ viewport: vp, hasTouch: !!o.phone, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  const query = `?seed=${seed}&mute=1&nosave=1&tier=${Number(o.tier || 0)}` + (o.hand !== undefined ? '&hand=' + (o.hand === true ? '' : o.hand) : '');
  await page.goto('file://' + HTML + query);
  await page.waitForFunction(() => window.__BD && window.__BD.ui, null, { timeout: 15000 });

  // the pilot and the collector, the same source text as in Node
  await page.evaluate(([pilotSrc, metricsSrc, opts, think]) => {
    const BD = window.BD, B = window.__BD, app = B.app;
    const makePilot = (0, eval)('(' + pilotSrc + ')'), makeMetrics = (0, eval)('(' + metricsSrc + ')');
    const F = (window.__FUN = { met: null, pilot: null, frames: 0, t0: 0, choiceSince: 0, wallPlay: 0, last: 0 });
    app.onWorld((w) => { F.met = makeMetrics(BD); F.met.attach(w); F.pilot = makePilot(BD, w.seed, opts); F.t0 = performance.now(); });
    const step = app.step;
    app.step = function () { const r = step(); if (r && F.met) F.met.tick(app.world); return r; };
    BD.client.input.current = function () { return F.pilot && app.world ? F.pilot.think(app.world) : { mx: 0, my: 0, dash: false }; };
    BD.client.input.consumeDash = function () {};
    const raf = () => { F.frames++; requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // choices are answered after `think` seconds of real time; a blur pause is undone
    setInterval(() => {
      const w = app.world;
      if (app.uiOverlay === 'pause') app.resume();
      if (!w || app.mode !== 'play' || !F.pilot) return;
      if (F.pilot.choiceOpen(w)) {
        const now = performance.now();
        if (!F.choiceSince) F.choiceSince = now;
        if (now - F.choiceSince >= think * 1000) { const c = F.pilot.choose(w); app.cmd(c[0], c[1], c[2]); F.choiceSince = 0; }
      } else F.choiceSince = 0;
    }, 100);
  }, [L.makePilot.toString(), L.makeMetrics.toString(), { altar: o.altar || 'mixed', trial: !!o.trial }, think]);

  const mode = () => page.evaluate(() => window.__BD.state().mode);
  for (let i = 0; i < 6 && (await mode()) !== 'play'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
  if ((await mode()) !== 'play') throw new Error('not in play: ' + (await mode()));

  const wall0 = Date.now();
  let nextShot = 0, shots = 0, last = null;
  const shoot = async (t) => {
    const name = 't' + String(Math.round(t)).padStart(4, '0') + '.jpg';
    await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 60 });
    shots++;
  };
  for (;;) {
    const s = await page.evaluate(() => { const B = window.__BD, w = B.world(); return { mode: B.app.mode, t: w ? w.t : 0, floor: w ? w.floorN : 0, hp: w ? w.hero.hp : 0 }; });
    last = s;
    if (s.mode !== 'play') break;
    if (s.t >= nextShot) { await shoot(s.t); nextShot = s.t < firstDense ? Math.floor(s.t) + 1 : Math.floor(s.t / every) * every + every; }
    if (Date.now() - wall0 > 30 * 60 * 1000) { errors.push('gave up after 30 min of wall clock'); break; }
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'result.jpg'), type: 'jpeg', quality: 70 });
  const sum = await page.evaluate(() => { const F = window.__FUN; return { summary: F.met.summary(), frames: F.frames, wallMs: performance.now() - F.t0 }; });
  const wallSec = (Date.now() - wall0) / 1000;
  const out = Object.assign({ wallSec: Math.round(wallSec), gameSec: sum.summary.sec, fps: Math.round((10 * sum.frames) / (sum.wallMs / 1000)) / 10, shots, errors, requests, viewport: vp, opts: { altar: o.altar || 'mixed', trial: !!o.trial } }, sum.summary);
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(out, null, 1));
  const r = out;
  console.log(`seed ${seed} [${r.hand.join(',')}] ${r.result} ${r.floor}F game ${r.gameSec}s wall ${r.wallSec}s fps ${r.fps} | kills/min ${r.total.killsPerMin} on-screen ${r.total.onScreenMean} sparse ${r.total.sparsePct}% choices ${r.choiceGap.n} (median gap ${r.choiceGap.median}s) | frames ${shots} → ${OUT}${errors.length ? ' | ERRORS ' + errors.length : ''}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
