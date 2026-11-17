#!/usr/bin/env node
// The prop sheet: every stage prop id (with its footprint), every site in each state, the wall
// items, the elevator, a glass bay and the growths, drawn by BD.client.artStage.sheet in the built
// page and saved as PNG. Usage: node tests/art/sheet.js <out.png> [--theme beast] [--layout office]
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(argv.find((a, i) => !a.startsWith('--') && !['--theme', '--layout'].includes(argv[i - 1])) || path.join(ROOT, 'docs/screens/v2-art/prop-sheet.png'));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(ROOT, 'dist/before-dawn.html') + '?seed=11&mute=1&nosave=1');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  const url = await page.evaluate(([theme, layout]) => window.BD.client.artStage.sheet({ theme, layout, scale: 1 }).toDataURL('image/png'), [opt('theme', 'beast'), opt('layout', 'office')]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', path.relative(ROOT, OUT));
  await browser.close();
  if (errors.length) { console.log('PAGE ERRORS', errors); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
