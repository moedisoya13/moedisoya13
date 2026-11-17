// Browser harness for the UI tests and tests/ui/shoot.js (not a test file itself).
//  - variant(): builds dist/before-dawn.html and writes a copy with tests/ui/fixtures/standins.js
//    injected before boot (stand-ins for cards/enemies of other branches) to a temp folder
//  - open(url, opts): a Playwright page with console/page errors and network requests collected
//  - helpers to read what the UI drew (window.__BD.ui.debug) and to tap buttons by label/id,
//    with a mouse click or a synthetic touch pointer, in logical coordinates
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
let cached = {};

function variant(o) {
  o = Object.assign({ standins: true }, o || {});
  const key = o.standins ? 'standins' : 'plain';
  if (cached[key]) return cached[key];
  require(path.join(ROOT, 'build.js')).build();
  let html = fs.readFileSync(path.join(ROOT, 'dist/before-dawn.html'), 'utf8');
  if (o.standins) {
    const src = fs.readFileSync(path.join(__dirname, 'fixtures/standins.js'), 'utf8');
    const mark = '// ---- src/boot.js';
    if (!html.includes(mark)) throw new Error('boot marker not found in the build');
    html = html.replace(mark, () => "// ---- tests/ui/fixtures/standins.js\n(function(BD){'use strict';\n" + src + '\n})(BD);\n' + mark);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-ui-'));
  const file = path.join(dir, 'before-dawn.html');
  fs.writeFileSync(file, html);
  return (cached[key] = 'file://' + file);
}

async function open(url, opts) {
  opts = opts || {};
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts.context || {}));
  if (opts.init) await ctx.addInitScript(opts.init.fn, opts.init.arg);
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  await page.goto(url + (opts.query || ''));
  await page.waitForFunction(() => window.__BD && window.__BD.ui && window.__BD.ui.debug, null, { timeout: 10000 });
  const T = {
    browser, ctx, page, errors, requests,
    close: () => browser.close(),
    wait: (ms) => page.waitForTimeout(ms === undefined ? 80 : ms),
    state: () => page.evaluate(() => window.__BD.state()),
    mode: () => page.evaluate(() => window.__BD.state().mode),
    overlay: () => page.evaluate(() => window.__BD.state().overlay),
    texts: () => page.evaluate(() => window.__BD.ui.debug.texts()),
    buttons: () => page.evaluate(() => window.__BD.ui.debug.buttons()),
    events: (n) => page.evaluate((n) => window.__BD.events(n), n || 200),
    eval: (fn, arg) => page.evaluate(fn, arg),
    key: async (code) => { await page.keyboard.press(code); await T.wait(); },
    // find a declared button by id or label in the active layer (last frame)
    find: async (idOrLabel) => {
      const bs = await T.buttons();
      const L = await page.evaluate(() => window.__BD.ui.activeLayer());
      const layerOk = (b) => b.layer === L || (L === 'hud' && b.layer === 'screen');
      return bs.find((b) => layerOk(b) && (b.id === idOrLabel || b.label === idOrLabel)) || null;
    },
    // logical point → client point
    client: (x, y) => page.evaluate(([x, y]) => { const v = window.__BD.ui.view; return [v.offX + x * v.scale, v.offY + y * v.scale]; }, [x, y]),
    pointer: (type, x, y, id, kind) => page.evaluate(([type, x, y, id, kind]) => {
      const c = document.getElementById('bd');
      c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, [type, x, y, id || 21, kind || 'touch']),
    // tap a logical point with a touch pointer (down, short hold, up)
    tapAt: async (x, y, kind) => {
      const [cx, cy] = await T.client(x, y);
      await T.pointer('pointerdown', cx, cy, 21, kind || 'touch');
      await T.wait(40);
      await T.pointer('pointerup', cx, cy, 21, kind || 'touch');
      await T.wait();
    },
    tap: async (idOrLabel, kind) => {
      const b = await T.find(idOrLabel);
      if (!b) throw new Error('no button ' + idOrLabel + ' in ' + JSON.stringify((await T.buttons()).map((x) => x.id || x.label)));
      await T.tapAt(b.x + b.w / 2, b.y + b.h / 2, kind);
      return b;
    },
    click: async (idOrLabel) => {
      const b = await T.find(idOrLabel);
      if (!b) throw new Error('no button ' + idOrLabel);
      const [cx, cy] = await T.client(b.x + b.w / 2, b.y + b.h / 2);
      await page.mouse.click(cx, cy);
      await T.wait();
      return b;
    },
    waitMode: async (mode, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 10000)) { if ((await T.mode()) === mode) { await T.wait(80); return true; } await T.wait(100); }
      return false;
    },
    shot: (file) => page.screenshot({ path: file }),
  };
  await T.wait(250);
  return T;
}

module.exports = { ROOT, variant, open };
