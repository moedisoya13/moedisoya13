#!/usr/bin/env node
// Extra stage shots the round sheets do not cover: a v1-size room (1F) and the 13×13 rooftop,
// the showcase floor at dawn (05:30) with its skyline, telegraphs on the red heavy floor (white
// hatching over the steel deck) and on the yellow floor, each at 1280×720.
// Usage: node tests/art/extra.js <out-dir>
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/screens/v2-art/extra'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'dist/before-dawn.html') + '?seed=11&mute=1&nosave=1&hand=pierce,flame,leech');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.evaluate(() => { const B = window.__BD; B.app.save.settings.hints = false; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  await page.waitForTimeout(2600);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 86 }); console.log('wrote', name); };
  await shot('v1-room-1F');
  // the rooftop (v1 13×13, the demon king's floor)
  await page.evaluate(() => { const B = window.__BD; B.goto(6); B.world().freezeT = 1e9; });
  await page.waitForTimeout(2600);
  await shot('v1-rooftop');
  // dawn on the showcase floor: the clock at 05:30, the camera near the back corner
  await page.evaluate(() => {
    const B = window.__BD, BD = window.BD, w = B.world();
    BD.client.artStage.stage(w, { layout: 'atrium', theme: 'magic', enemies: 0 });
    w.t = w.mods.runSec * (11.5 / 12); w.hero.x = 7.5; w.hero.y = 30.5; w.freezeT = 1e9; BD.client.camera.snap();
  });
  await page.waitForTimeout(2600);
  await shot('dawn-0530-atrium-magic');
  // telegraphs on the heavy (red) floor and the beast (yellow) floor
  for (const theme of ['heavy', 'beast']) {
    await page.evaluate((theme) => {
      const B = window.__BD, BD = window.BD, w = B.world();
      BD.client.artStage.stage(w, { layout: 'ruin', theme, enemies: 0 });
      w.t = 30; w.hero.x = 24.5; w.hero.y = 37.5; BD.client.camera.snap();
      const knight = BD.W.makeEnemy(w, 'dark_knight', 27.5, 35.5, { via: 'placed' });
      const mage = BD.W.makeEnemy(w, 'mage', 21.5, 34.5, { via: 'placed' });
      BD.W.makeEnemy(w, 'goblin', 25.5, 33.5, { via: 'placed' });
      w.freezeT = 1e9;
      // still warnings to read against the floor: a fan, a line and a circle, half filled
      w.telegraphs.push({ id: 9001, shape: 'fan', x: 27.5, y: 35.5, r: 3, dir: Math.PI * 0.95, half: 45, remain: 8, total: 16, style: 'hatch', ownerId: knight.id, ownerKind: 'enemy', attack: 'test', dmg: 10, persist: true });
      w.telegraphs.push({ id: 9002, shape: 'circle', x: 22, y: 38, r: 1.6, remain: 4, total: 16, style: 'hatch', ownerId: mage.id, ownerKind: 'enemy', attack: 'test', dmg: 10, persist: true });
      w.telegraphs.push({ id: 9003, shape: 'line', x: 25.5, y: 33.5, dir: Math.PI * 0.6, len: 5, width: 0.8, remain: 11, total: 16, style: 'hatch', ownerId: mage.id, ownerKind: 'enemy', attack: 'test', dmg: 10, persist: true });
    }, theme);
    await page.waitForTimeout(2800);
    await page.evaluate(() => { const w = window.__BD.world(); void w; });
    await shot('telegraphs-' + theme);
  }
  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS', errors); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
