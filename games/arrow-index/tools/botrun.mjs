// 봇 자동 플레이: 빠른 속도로 돌리며 주기적으로 상태 로그 + 스크린샷
//   node tools/botrun.mjs <outdir> <speed> <maxRealSec> [shotEverySimSec] [extraQuery]
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [out = '.', speed = '8', maxSec = '120', shotEvery = '0', extra = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage();
let errs = 0;
p.on('console', m => { const t = m.text(); if (m.type() === 'error') { errs++; if (errs < 6) console.log('ERR', t); } else if (t.startsWith('BOT_')) console.log(t); });
p.on('pageerror', e => { errs++; if (errs < 6) console.log('PAGEERR', e.message, e.stack?.split('\n').slice(0,3).join(' | ')); });
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname + `?bot&speed=${speed}${extra}`);
const t0 = Date.now();
let nextShot = +shotEvery || 1e9, lastLog = 0;
while ((Date.now() - t0) / 1000 < +maxSec) {
  await p.waitForTimeout(1000);
  const s = await p.evaluate(() => { const G = __AI.G; return { st: G.state, t: G.t, hp: Math.round(G.p.hp), mhp: G.p.maxHp, lv: G.level, k: G.kills, en: G.enemies.length, gems: G.gems.length, parts: G.parts.length, w: G.weapons.map(w => w.id + w.L).join(','), pa: Object.entries(G.passive).map(([k, v]) => k + v).join(','), boss: G.boss ? G.boss.kind + ':' + Math.round(G.boss.hp) : '', tr: __AI.Market.trades, net: Math.round(__AI.Market.netGain) }; });
  if (s.t - lastLog >= 60 || s.st === 'over') { lastLog = s.t; console.log(JSON.stringify({ ...s, t: s.t.toFixed(0), real: ((Date.now() - t0) / 1000).toFixed(0) })); }
  if (s.t >= nextShot) { await p.screenshot({ path: `${out}/bot-${String(Math.round(s.t)).padStart(4, '0')}.png` }); nextShot += +shotEvery; }
  if (s.st === 'over') { await p.screenshot({ path: `${out}/bot-over.png` }); break; }
}
console.log('errors', errs);
await b.close();
