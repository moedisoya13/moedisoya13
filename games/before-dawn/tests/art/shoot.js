#!/usr/bin/env node
// Screenshots of the stage on a 48×48 floor, on each of the five floor colours, at 1280×720 and
// 667×375 (device scale 2), from three spots: the middle of the floor, the back corner (walls,
// stairs zone) and the front edge (slab edge, facade, skyline). Enemies are placed around the hero
// and frozen, hints off, so only the stage changes between rounds.
// Usage: node tests/art/shoot.js <out-dir> [--engine] [--layout plaza|office|atrium|hall|ruin]
//                                [--only beast,undead,...] [--spots mid,back,front] [--sizes 1280x720,667x375]
//   default: the showcase floor of BD.client.artStage (every zone fill and site);
//   --engine: the engine's own staging (__BD.stage, v1 patterns on a 48×48 grid) — the "before".
// Writes <out-dir>/<spot>-<type>-<size>.png and contact sheets <out-dir>/sheet-<size>.png.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const FLAGS_WITH_VALUE = ['--layout', '--only', '--spots', '--sizes'];
const positional = argv.filter((a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUE.includes(argv[i - 1]));
const OUT = path.resolve(positional[0] || path.join(ROOT, 'docs/screens/v2-art/tmp'));
const ENGINE = argv.includes('--engine');
const LAYOUT = opt('layout', 'showcase');
const TYPES = opt('only', 'beast,undead,magic,heavy,rooftop').split(',');
const SPOTS = opt('spots', 'mid,back,front').split(',');
const SIZES = opt('sizes', '1280x720,667x375').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { tag: s, viewport: { width: w, height: h }, deviceScaleFactor: w < 1000 ? 2 : 1, hasTouch: w < 1000 };
});
// hero position per spot (world u) — the camera follows him
const SPOT = { mid: [25.5, 27.5], back: [6.5, 7.5], front: [41.5, 44.5], left: [6.5, 40.5], right: [41.5, 6.5] };

async function shootSize(S) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: S.viewport, deviceScaleFactor: S.deviceScaleFactor, hasTouch: S.hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'dist/before-dawn.html') + '?seed=11&mute=1&nosave=1&hand=pierce,flame,leech');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.evaluate(() => { const B = window.__BD; B.app.save.settings.hints = false; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  await page.waitForTimeout(400);
  for (const type of TYPES) {
    for (const spot of SPOTS) {
      await page.evaluate(([type, spot, engine, layout]) => {
        const B = window.__BD, BD = window.BD, f2 = B.world().run.floors[2];
        if (!window.__dom2) window.__dom2 = f2.domType;
        f2.domType = window.__dom2; // staging regenerates floor 2 from its own type
        if (!engine && BD.client.artStage) BD.client.artStage.stage(B.world(), { enemies: 0, layout, theme: type });
        else B.stage({ size: [48, 48], enemies: 0 });
        const w = B.world();
        w.floor.domType = type;
        if (BD.client.render.invalidate) BD.client.render.invalidate(); else { BD.client.render.big.grid = null; BD.client.render.floorKey = null; }
        w.freezeT = 1e9;
        w.hero.x = spot[0]; w.hero.y = spot[1];
        // a crowd around him, on free cells, the same every time
        const kinds = ['goblin', 'slime', 'skel_archer', 'ghoul', 'mage', 'dark_knight'];
        const rng = BD.Rng(77);
        let n = 0;
        for (let i = 0; i < 400 && n < 26; i++) {
          const a = rng.range(0, 6.283), r = rng.range(2.2, 9);
          const x = spot[0] + Math.cos(a) * r, y = spot[1] + Math.sin(a) * r;
          if (!w.grid.walkable(Math.floor(x), Math.floor(y))) continue;
          if (w.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 1.1)) continue;
          BD.W.makeEnemy(w, kinds[n % kinds.length], x, y, { via: 'placed', elite: n === 3 });
          n++;
        }
        BD.client.camera.snap();
      }, [type, SPOT[spot], ENGINE, LAYOUT]);
      await page.waitForTimeout(2600); // the floor banner fades, chunks around are painted
      const file = path.join(OUT, `${spot}-${type}-${S.tag}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 84 });
      console.log('wrote', path.relative(ROOT, file));
    }
  }
  await browser.close();
  if (errors.length) console.log('PAGE ERRORS', S.tag, errors);
  return errors;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let errs = [];
  for (const S of SIZES) errs = errs.concat(await shootSize(S));
  // contact sheets: rows = spots, columns = floor types
  for (const S of SIZES) {
    const files = [];
    for (const spot of SPOTS) for (const type of TYPES) files.push(path.join(OUT, `${spot}-${type}-${S.tag}.jpg`));
    try {
      execFileSync('montage', [...files, '-tile', `${TYPES.length}x${SPOTS.length}`, '-geometry', S.tag === '1280x720' ? '640x360+4+4' : '667x375+4+4', '-background', '#222', path.join(OUT, `sheet-${S.tag}.jpg`)]);
      console.log('wrote', path.relative(ROOT, path.join(OUT, `sheet-${S.tag}.jpg`)));
    } catch (e) { console.log('montage failed', e.message); }
  }
  if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
