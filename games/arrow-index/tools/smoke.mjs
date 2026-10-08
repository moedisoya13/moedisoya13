// 스모크 테스트: iPhone 크기로 열고, 시작하고, 조작하고, 스크린샷을 찍는다.
//   node tools/smoke.mjs <outdir> [query]
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2] || '.';
const query = process.argv[3] || '';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error' || m.text().startsWith('BOT_')) { console.log('console:', m.text()); if (m.type()==='error') errors.push(m.text()); } });
p.on('pageerror', e => { console.log('pageerror:', e.message); errors.push(e.message); });
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname + query);
await p.waitForTimeout(800);
await p.screenshot({ path: out + '/01-title.png' });
await p.click('#btnStart');
await p.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(p);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] ?? i })) });
// 조이스틱: 아래쪽에서 오른쪽으로 끌기
await touch('touchStart', [[200, 650, 1]]);
for (let i = 0; i < 20; i++) { await touch('touchMove', [[200 + i * 2.5, 650 - i, 1]]); await p.waitForTimeout(30); }
await p.waitForTimeout(2500);
await p.screenshot({ path: out + '/02-move.png' });
// 매수 꾹 (두 번째 손가락) 하면서 이동
await touch('touchMove', [[250, 630, 1], [40, 70, 2]]);
await p.waitForTimeout(3000);
await p.screenshot({ path: out + '/03-buy.png' });
await touch('touchEnd', [[250, 630, 1]]);
await touch('touchEnd', []);
await p.waitForTimeout(1500);
// 매도 탭
await touch('touchStart', [[350, 70, 3]]);
await touch('touchEnd', []);
await p.waitForTimeout(250);
await p.screenshot({ path: out + '/04-sell.png' });
const st = await p.evaluate(() => ({ state: __AI.G.state, t: __AI.G.t.toFixed(1), hp: __AI.G.p.hp, lv: __AI.G.level, kills: __AI.G.kills, enemies: __AI.G.enemies.length, shares: __AI.Market.shares, trades: __AI.Market.trades }));
console.log('state', JSON.stringify(st));
console.log('errors', errors.length);
await b.close();
