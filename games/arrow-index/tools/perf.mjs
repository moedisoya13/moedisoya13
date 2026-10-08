// 프레임 비용 측정 (1배속, 후반 장면)
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage();
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname + '?bot&speed=1&t=' + (process.argv[2] || 1500));
await p.waitForTimeout(12000);
await p.evaluate(() => { window.__perf = { n: 0, sum: 0, max: 0 }; });
await p.waitForTimeout(6000);
const r = await p.evaluate(() => ({ ...window.__perf, en: __AI.G.enemies.length, parts: __AI.G.parts.length, fx: __AI.G.fx.length, arrows: __AI.G.arrows.length }));
console.log('frames', r.n, 'avg ms', (r.sum / r.n).toFixed(2), 'max ms', r.max.toFixed(1), 'en', r.en, 'parts', r.parts, 'fx', r.fx, 'arrows', r.arrows);
await b.close();
