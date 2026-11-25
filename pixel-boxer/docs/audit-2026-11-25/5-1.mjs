// 5-1: underground pit: when the fight is near an edge the camera stands out among the crowd, and the crowd's side twelfths
// (not culled: world/pit.mjs facing() culls by yaw only) are drawn huge close to the lens, at the picture's top corners and
// under the HUD's text. Measured on the art grid (the renderer's own framebuffer, read back), seed 3, a frame every 2 s.
// usage: node 5-1.mjs <pixel-boxer root>
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2] || '.');
const SH = '/tmp/pixel-boxer-audit/audit/shots/';
fs.mkdirSync(SH, { recursive: true });
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const server = await new Promise(res => {
  const s = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => (e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }), r.end(d))));
  });
  s.listen(0, '127.0.0.1', () => res(s));
});
// manual frames: rAF taken over, Math.random seeded, the draw skipped except on the frames measured
const INIT = () => {
  let seed = 12345;
  Math.random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const q = [];
  let t = 1000;
  window.requestAnimationFrame = cb => (q.push(cb), q.length);
  window.__tick = (n, draw) => {
    for (let i = 0; i < n; i++) {
      window.__drawOn = !!draw && i === n - 1;
      t += 1000 / 60;
      for (const cb of q.splice(0)) cb(t);
    }
    window.__drawOn = false;
  };
  window.__gate = () => {
    const R = globalThis.__bout && globalThis.__bout.renderer;
    if (!R || R.__gated) return !!R;
    const real = R.draw;
    R.draw = f => ((window.__lastFrame = f), window.__drawOn ? real(f) : 0);
    return (R.__gated = true);
  };
};
const browser = await chromium.launch();
const results = {};
for (const [arena, W, H] of [['underground', 1280, 800], ['underground', 390, 844], ['ring', 1280, 800], ['ring', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?auto=1&seed=3&arena=${arena}`);
  for (let i = 0; i < 600 && !(await page.evaluate(() => (window.__tick(1), window.__gate()))); i++) await page.waitForTimeout(100);
  const rows = [];
  for (let k = 1; k <= 15; k++) {
    const m = await page.evaluate(async () => {
      window.__tick(120, true);
      // every crowd figure in a twelfth drawn this frame (world/pit.mjs crowdOf, facing), projected: its height on the art grid
      const P = await import('./src/world/pit.mjs'), Rd = await import('./src/render/renderer.mjs');
      const figs = (window.__figs = window.__figs || P.crowdOf().figures), B0 = globalThis.__bout, cam0 = B0.cam;
      const drawn = new Set(P.createCrowd().facing(cam0.yaw)), V = Rd.viewOf(cam0), rowsN = B0.renderer.target.h, wN = B0.renderer.target.w;
      const focal = rowsN / 2 / Math.tan((38 * Math.PI) / 360);
      const see = q => [0, 1, 2].map(i => V[i] * q[0] + V[4 + i] * q[1] + V[8 + i] * q[2] + V[12 + i]);
      let figH = 0, figD = 99;
      for (const g of figs) {
        if (!drawn.has(g.sector)) continue;
        const a = see([g.x, 0, g.z]), b = see([g.x, 1.7, g.z]);
        if (-a[2] < 0.3 || -b[2] < 0.3) continue;
        const ya = (a[1] / -a[2]) * focal, yb = (b[1] / -b[2]) * focal, xa = (a[0] / -a[2]) * focal;
        if (Math.abs(xa) > wN / 2 + 10 || Math.min(ya, yb) > rowsN / 2 || Math.max(ya, yb) < -rowsN / 2) continue;
        if (yb - ya > figH) (figH = yb - ya), (figD = Math.hypot(...a));
      }
      const B = globalThis.__bout, R = B.renderer, gl = R.gl, { w, h, scale } = R.target, px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.target.fbo);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const f = window.__lastFrame, key = (a, i) => [0, 1, 2].map(c => Math.round(a[i * 3 + c] * 255)).join(',');
      const set = l => new Set(Array.from({ length: 48 }, (_, i) => key(l.palette, i)));
      const crowdLayer = f.layers.find(l => l.bones && l.mask === 0.5 && !l.silhouette), groundLayer = f.layers[0];
      const crowdSet = crowdLayer ? set(crowdLayer) : new Set();
      const at = (x, y) => (y * w + x) * 4;
      const isCrowd = (x, y) => { const i = at(x, y); return px[i + 3] > 170 && px[i + 3] < 186 && crowdSet.has(px[i] + ',' + px[i + 1] + ',' + px[i + 2]); };
      const isHall = (x, y) => px[at(x, y) + 3] < 50;
      let crowd = 0, run = 0, top = h, bot = -1;
      for (let x = 0; x < w; x++) {
        let r = 0;
        for (let y = 0; y < h; y++) {
          if (isCrowd(x, y)) (crowd++, r++, (run = Math.max(run, r))); else r = 0;
          if (px[at(x, y) + 3] > 250) (top = Math.min(top, y)), (bot = Math.max(bot, y));
        }
      }
      // the HUD's text (the corners' names and the stage), in art pixels: how much of what is under it is crowd, and hall
      const cv = document.getElementById('view').getBoundingClientRect(), cw = R.gl.canvas.width, ch = R.gl.canvas.height,
        ox = Math.floor((cw - w * scale) / 2), oy = Math.floor((ch - h * scale) / 2);
      let under = 0, underCrowd = 0, underHall = 0;
      for (const el of document.querySelectorAll('#hud .name, #stage')) {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        for (const b of rg.getClientRects()) {
          for (let cy = b.top; cy < b.bottom; cy += scale) for (let cx = b.left; cx < b.right; cx += scale) {
            const ax = Math.floor((cx - cv.left - ox) / scale), ay = Math.floor((ch - (cy - cv.top) - oy) / scale);
            if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
            under++;
            if (isCrowd(ax, ay)) underCrowd++;
            if (isHall(ax, ay)) underHall++;
          }
        }
      }
      const eye = [B.cam.target[0] + Math.cos(B.cam.pitch) * Math.sin(B.cam.yaw) * B.cam.dist, B.cam.target[2] + Math.cos(B.cam.pitch) * Math.cos(B.cam.yaw) * B.cam.dist];
      return { t: +B.bout.t.toFixed(1), figH: Math.round(figH), figD: +figD.toFixed(2), eyeR: +Math.hypot(eye[0], eye[1]).toFixed(2), crowdShare: +(crowd / (w * h)).toFixed(3), crowdRun: run, boxerH: bot - top + 1, hudOverCrowd: +(underCrowd / Math.max(1, under)).toFixed(2), hudOverHall: +(underHall / Math.max(1, under)).toFixed(2), art: w + 'x' + h };
    });
    rows.push(m);
    if (k === 5) await page.screenshot({ path: `${SH}5-1-${arena}-${W}.png` });
  }
  results[`${arena} ${W}x${H}`] = rows;
  console.log(`${arena} ${W}x${H}`, errors.length ? 'errors ' + errors : '');
  for (const r of rows) console.log('  ', JSON.stringify(r));
  await ctx.close();
}
await browser.close();
server.close();
const pit = results['underground 1280x800'], pit390 = results['underground 390x844'], ring = results['ring 1280x800'];
const giant = pit.filter(r => r.figH > r.boxerH);
const hudPit = [...pit, ...pit390].filter(r => r.hudOverCrowd >= 0.25).length;
const avg = a => +(a.reduce((s, r) => s + r.hudOverHall, 0) / a.length).toFixed(2);
console.log(`pit 1280: frames with a drawn crowd figure taller on screen than the boxers: ${giant.length}/${pit.length} (tallest ${Math.max(...pit.map(r => r.figH))} art px of a 200-px picture, boxers ${Math.min(...pit.map(r => r.boxerH))}-${Math.max(...pit.map(r => r.boxerH))}; eye ${Math.min(...pit.map(r => r.eyeR))}-${Math.max(...pit.map(r => r.eyeR))} m from the centre, the crowd stands 3.42-4.92 m out)`);
const g390 = pit390.filter(r => r.figH > r.boxerH);
console.log(`pit 390: ${g390.length}/${pit390.length} (tallest ${Math.max(...pit390.map(r => r.figH))} art px of 195)`);
console.log(`HUD text over crowd >= 25%: ${hudPit}/${pit.length + pit390.length} pit frames; HUD text over the dark hall: ring ${avg(ring)} vs pit ${avg(pit)} (1280)`);
console.log(giant.length > 0 || hudPit > 0 ? `REPRO: yes pit crowd figure drawn taller than the boxers in ${giant.length}/${pit.length} frames at 1280 (up to ${Math.max(...pit.map(r => r.figH))} art px vs boxers <= ${Math.max(...pit.map(r => r.boxerH))}); HUD text over crowd in ${hudPit}/${pit.length + pit390.length} pit frames` : 'REPRO: no');
