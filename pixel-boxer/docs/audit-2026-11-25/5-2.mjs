// usage: node 5-2.mjs <pixel-boxer root>
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
// 5-2: the pit's crowd is drawn as "specks of light" (renderer.mjs SPLAT_VS: v_light = u_mask < 0.9 && a_misc.y > 0.5, and a
// crowd splat's a_misc.y is its bone, 1 or more), so its pixels carry the light's mark 0.7 and the second pass never inks
// them: a boxer seen against the crowd has no outline there. Counted on the art grid before the second pass: pixels of
// crowd that touch a boxer pixel (each would be the outline's ink if the crowd were marked as the rest of the arena, 0.5).
const browser = await chromium.launch();
let total = 0, framesWith = 0, frames = 0, worst = null;
for (const [W, H] of [[390, 844], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?auto=1&seed=3&arena=underground`);
  for (let i = 0; i < 600 && !(await page.evaluate(() => (window.__tick(1), window.__gate()))); i++) await page.waitForTimeout(100);
  for (let k = 1; k <= 15; k++) {
    const m = await page.evaluate(() => {
      window.__tick(120, true);
      const B = globalThis.__bout, R = B.renderer, gl = R.gl, { w, h } = R.target, px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.target.fbo);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const f = window.__lastFrame, crowdLayers = f.layers.filter(l => l.bones && l.mask === 0.5 && !l.silhouette);
      const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]);
      let crowdPx = 0, crowdLight = 0, missing = 0, inked = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const al = a(x, y), byMan = Math.max(a(x + 1, y), a(x - 1, y), a(x, y + 1), a(x, y - 1)) > 250;
        if (al > 170 && al < 186) { crowdLight++; if (byMan) missing++; }
        else if (al < 230 && byMan) inked++;
      }
      return { t: +B.bout.t.toFixed(1), crowdLayers: crowdLayers.length, crowdMarks: crowdLayers.map(l => l.mask)[0], lightMarked: crowdLight, missingOutline: missing, inkedOutline: inked };
    });
    frames++;
    total += m.missingOutline;
    if (m.missingOutline > 0) framesWith++;
    if (!worst || m.missingOutline > worst.m.missingOutline) worst = { m, W, k };
    console.log(W, JSON.stringify(m));
    if (m.missingOutline > 0 && W === 1280) await page.screenshot({ path: `${SH}5-2-${W}-f${k}.png` });
  }
  await ctx.close();
}
await browser.close();
server.close();
const src = fs.readFileSync(path.join(root, 'src/render/renderer.mjs'), 'utf8');
console.log('shader rule:', (src.match(/v_light = [^;]+;/) || ['?'])[0]);
console.log(`frames with crowd pixels at a boxer's edge left without ink: ${framesWith}/${frames}; ${total} pixels in all; worst ${worst.m.missingOutline} at ${worst.W} wide, t=${worst.m.t}`);
console.log(framesWith ? `REPRO: yes pit crowd drawn with the light mark 0.7: ${total} outline pixels missing where boxers meet the crowd, in ${framesWith}/${frames} frames (worst ${worst.m.missingOutline})` : 'REPRO: no');
