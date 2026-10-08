// 보스/스테이지 스크린샷: 각 보스를 해당 시간으로 워프해 찍는다
//   node tools/bossshots.mjs <outdir> boss1,boss2,... [stage]
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [out = '.', list = 'medusa', stageArg = '0', wait = '5000'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
let errs = 0;
for (const [i, boss] of list.split(',').entries()) {
  const stage = (+stageArg + i) % 6;
  const p = await ctx.newPage();
  p.on('pageerror', e => { errs++; console.log('PAGEERR', boss, e.message); });
  p.on('console', m => { if (m.type() === 'error') { errs++; console.log('ERR', boss, m.text()); } });
  await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname + `?bot&speed=1&boss=${boss}&t=${stage * 300 + 236}`);
  await p.waitForTimeout(+wait);
  await p.screenshot({ path: `${out}/boss-${boss}.png` });
  await p.close();
}
console.log('errors', errs);
await b.close();
