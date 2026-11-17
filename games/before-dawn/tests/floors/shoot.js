#!/usr/bin/env node
// Pictures of the v2 floors (GDD-V2 §5): every layout on every floor colour, as a whole-floor overview
// (the stage art's own painter on one canvas, sites in their states, labels) and as in-play frames
// (the bot playing a 3F floor of that layout and type for a while, the minimap and edge markers on)
// at 1280 × 720 and 667 × 375; plus the rooftop. Not a test (tools/test.js runs *.test.js only).
// Usage: node build.js && node tests/floors/shoot.js [out-dir] [--only plaza,office] [--types beast,heavy]
//        [--no-play] [--no-overview] [--seed N] [--sec S]
// Writes <out>/overview-<layout>-<type>.jpg, <out>/play-<layout>-<type>-<size>.jpg, contact sheets.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const WITH_VALUE = ['--only', '--types', '--seed', '--sec'];
const OUT = path.resolve(argv.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(argv[i - 1]))[0] || path.join(ROOT, 'docs/screens/v2-floors'));
const TASK_OF = { plaza: 'purge', office: 'seals', atrium: 'nests', hall: 'hold', ruin: 'hunt' };
const LAYOUTS = opt('only', 'plaza,office,atrium,hall,ruin').split(',');
const TYPES = opt('types', 'beast,undead,magic,heavy').split(',');
const SEED = Number(opt('seed', 21)), SEC = Number(opt('sec', 16));
const SIZES = [{ tag: '1280x720', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, { tag: '667x375', viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true }];

async function page(S) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: S.viewport, deviceScaleFactor: S.deviceScaleFactor, hasTouch: !!S.hasTouch });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('file://' + path.join(ROOT, 'dist/before-dawn.html') + `?seed=${SEED}&mute=1&nosave=1&hand=pierce,flame,leech`);
  await pg.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await pg.evaluate(() => { const B = window.__BD; B.app.save.settings.hints = false; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  return { browser, pg, errors };
}

// in the page: a 3F floor of `layout` on floor type `type` (the generator itself, seed SEED)
const STAGE = `(function (seed, task, type, roof) {
  const B = window.__BD, BD = window.BD;
  B.app.startRun({ seed, floor: roof ? 6 : 3, hand: ['pierce', 'flame', 'leech'] });
  const w = B.world();
  if (!roof) { w.run.floors[3] = BD.gen.floorV2(seed, 0, 3, type, 'magic', task); BD.flow.enterFloor(w, 3); }
  BD.client.render.invalidate(); BD.client.camera.snap();
  return { layout: w.floor.floorKind, type: w.floor.domType, sites: w.sites.map((s) => s.kind), attempts: w.floor.attempts };
})`;

// in the page: the whole floor on one canvas → PNG data URL
const OVERVIEW = `(function (label) {
  const BD = window.BD, R = BD.client.render, KIT = R.kit, w = window.__BD.world(), grid = w.grid, C = BD.C;
  const bottom = (grid.w + grid.h) * C.ISO_Y + 150, k = 0.5; // a strip of the facade below the slab
  const x0 = -grid.h * C.ISO_X - 90, x1 = grid.w * C.ISO_X + 90, y0 = -190, y1 = bottom + 10;
  const cv = document.createElement('canvas'); cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
  const g = cv.getContext('2d'); g.fillStyle = '#0b0c12'; g.fillRect(0, 0, cv.width, cv.height);
  g.scale(k, k);
  const v = R.mapView(-x0, -y0);
  R.paint.region(g, v.proj, w, R.stageCells(w, bottom).map((it) => it.c), null, bottom - y0);
  R.sites.door(g, v, w, 0);
  const items = [];
  const hx = w.hero.x, hy = w.hero.y; w.hero.x = -50; w.hero.y = -50; // nothing hides behind props
  R.stage.pushItems(items, g, v, w, 0, () => true);
  w.hero.x = hx; w.hero.y = hy;
  items.sort((a, b) => a.k - b.k); for (const it of items) it.f();
  // labels: what each place is and where the hero starts
  const lab = (x, y, s, col) => { const p = v.proj(x, y, 70); g.font = '800 30px sans-serif'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#0b0c12'; g.strokeText(s, p[0], p[1]); g.fillStyle = col; g.fillText(s, p[0], p[1]); };
  const NAMES = { seal: '봉인석', nest: '둥지', brazier: '화로', altar: '제단', spring: '샘', chest: '상자', rift: '시련', chief: '우두머리' };
  for (const s of w.sites) lab(s.x, s.y - 1.2, NAMES[s.kind] || s.kind, s.optional ? '#f3ead8' : '#ffd24a');
  for (const p of (w.floor.layout.targets || [])) lab(p.x, p.y - 1.2, NAMES[p.kind] || p.kind, '#ffd24a');
  if (w.floor.layout.start) lab(w.floor.layout.start[0], w.floor.layout.start[1], '시작', '#ff9a3a');
  if (w.stairs) lab(w.stairs.ringX + 2, w.stairs.ringY + 2, '계단', '#ffffff');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = '800 26px sans-serif'; g.textAlign = 'left'; g.fillStyle = '#f3ead8'; g.fillText(label, 24, 40);
  return cv.toDataURL('image/jpeg', 0.86);
})`;

async function overviews() {
  const { browser, pg, errors } = await page(SIZES[0]);
  const shots = [];
  for (const layout of LAYOUTS) for (const type of TYPES) {
    const info = await pg.evaluate(`${STAGE}(${SEED}, '${TASK_OF[layout]}', '${type}', false)`);
    await pg.waitForTimeout(150);
    const url = await pg.evaluate(`${OVERVIEW}(${JSON.stringify(`${layout} (${TASK_OF[layout]}) · ${type} · 3F · seed ${SEED} · ${info.sites.join(' ')}`)})`);
    const file = path.join(OUT, `overview-${layout}-${type}.jpg`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    shots.push(file); console.log('wrote', path.relative(ROOT, file), info.attempts + ' try');
  }
  await pg.evaluate(`${STAGE}(${SEED}, null, null, true)`);
  await pg.waitForTimeout(150);
  const url = await pg.evaluate(`${OVERVIEW}('rooftop · 28 × 28 · seed ${SEED}')`);
  fs.writeFileSync(path.join(OUT, 'overview-rooftop.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  if (errors.length) console.log('PAGE ERRORS', errors);
  return { shots, errors };
}

async function play(S) {
  const { browser, pg, errors } = await page(S);
  const shots = [];
  for (const layout of LAYOUTS) for (const type of TYPES) {
    await pg.evaluate(`${STAGE}(${SEED}, '${TASK_OF[layout]}', '${type}', false)`);
    await pg.evaluate(() => { const B = window.__BD; B.app.botOn = true; B.app.botOpts = { trial: false }; });
    await pg.waitForTimeout(SEC * 1000);
    const file = path.join(OUT, `play-${layout}-${type}-${S.tag}.jpg`);
    await pg.screenshot({ path: file, type: 'jpeg', quality: 82 });
    const st = await pg.evaluate(() => { const s = window.__BD.state(); return s.task.kind + ' ' + s.task.value + '/' + s.task.goal + ' t ' + Math.round(s.t) + ' hp ' + s.hero.hp; });
    shots.push(file); console.log('wrote', path.relative(ROOT, file), st);
  }
  await browser.close();
  if (errors.length) console.log('PAGE ERRORS', S.tag, errors);
  return { shots, errors };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let errors = [];
  if (!argv.includes('--no-overview')) {
    const o = await overviews(); errors = errors.concat(o.errors);
    try { execFileSync('montage', [...o.shots, '-tile', `${TYPES.length}x${LAYOUTS.length}`, '-geometry', '640x360+4+4', '-background', '#222', path.join(OUT, 'sheet-overview.jpg')]); } catch (e) { console.log('montage failed', e.message); }
  }
  if (!argv.includes('--no-play')) for (const S of SIZES) {
    const p = await play(S); errors = errors.concat(p.errors);
    try { execFileSync('montage', [...p.shots, '-tile', `${TYPES.length}x${LAYOUTS.length}`, '-geometry', S.tag === '1280x720' ? '640x360+4+4' : '667x375+4+4', '-background', '#222', path.join(OUT, `sheet-play-${S.tag}.jpg`)]); } catch (e) { console.log('montage failed', e.message); }
  }
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
