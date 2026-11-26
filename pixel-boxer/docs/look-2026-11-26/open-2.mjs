// open-2: at 390 px the sticky answer bar (222 px) is taller than the page's scroll-padding-top (190 px, open.html:42),
// so every 차례 (TOC) jump lands with the group's heading under the bar.
// Usage: node open-2.mjs <pixel-boxer root>   (starts its own static server on a free port)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { serve } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-serve.mjs'));
const root = path.resolve(process.argv[2] || '.');
const srv = await serve(root);
const browser = await chromium.launch();
let hidden = 0, n = 0, worst = 0;
for (const w of [390, 800]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(srv.url + '/open.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const pad = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop);
  for (const g of ['audit', 'now', 'plan', 'limits', 'dispose', 'free']) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.click(`#toc a[href="#g-${g}"]`);
    await page.waitForTimeout(300);
    const r = await page.evaluate((g) => { const b = document.querySelector('.bar').getBoundingClientRect(), h = document.querySelector(`#g-${g} h2`).getBoundingClientRect(); return { bar: Math.round(b.bottom), top: Math.round(h.top), bottom: Math.round(h.bottom) }; }, g);
    const under = r.bottom <= r.bar;
    if (w === 390) (n++, under && hidden++, (worst = Math.max(worst, r.bar - r.top)));
    console.log(`width ${w} scroll-padding-top ${pad}: TOC → ${g}: bar bottom ${r.bar}px, heading ${r.top}-${r.bottom}px → ${under ? 'heading entirely under the bar' : r.top < r.bar ? 'heading partly under the bar' : 'visible'}`);
  }
}
await browser.close(); srv.close();
console.log(hidden ? `REPRO: yes at 390 px ${hidden} of ${n} TOC jumps put the group heading entirely under the sticky bar (bar bottom 222 px, heading starts ${worst} px above it)` : 'REPRO: no');
