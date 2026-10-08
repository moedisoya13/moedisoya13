// 멀티터치 검증: 조이스틱을 잡은 채 매수 꾹 → 정지 확인, 매도 → 거래 확인, 레벨업 화면 캡처
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2] || '.';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage();
let errs = 0;
p.on('pageerror', e => { errs++; console.log('PAGEERR', e.message); });
p.on('console', m => { if (m.type() === 'error') { errs++; console.log('ERR', m.text()); } });
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await p.waitForTimeout(500);
await p.click('#btnStart');
await p.waitForTimeout(600);
const cdp = await ctx.newCDPSession(p);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(q => ({ x: q[0], y: q[1], id: q[2] })) });
const st = () => p.evaluate(() => ({ frozen: __AI.Market.frozen, shares: +__AI.Market.shares.toFixed(4), cost: __AI.Market.cost, trades: __AI.Market.trades, joy: !!__AI.G && !!window.Input?.joy, state: __AI.G.state, price: Math.round(__AI.Market.price), lv: __AI.G.level, xp: +__AI.G.xp.toFixed(1) }));
await T('touchStart', [[195, 650, 1]]);
await T('touchMove', [[230, 640, 1]]);
await p.waitForTimeout(300);
await T('touchStart', [[230, 640, 1], [45, 35, 2]]);   // 두 번째 손가락: 매수
await p.waitForTimeout(200);
console.log('hold buy', JSON.stringify(await st()));
// 매수 중에 보석을 강제로 주워 본다
await p.evaluate(() => { const G = __AI.G; for (let i = 0; i < 6; i++) G.gems.push({ x: G.p.x + 3, y: G.p.y, v: 5, k: 1, z: 0, vz: 0, vx: 0, vy: 0, mag: true, mt: 0.2, t: 0 }); });
await p.waitForTimeout(700);
await p.screenshot({ path: out + '/t-buy.png' });
console.log('after stock', JSON.stringify(await st()));
await T('touchMove', [[230, 640, 1]]);                 // 매수 손가락만 뗌
await p.waitForTimeout(200);
console.log('release buy', JSON.stringify(await st()));
await p.waitForTimeout(3000);
await p.evaluate(() => { const M = __AI.Market; M.price = M.avg * 1.25; });   // 25% 상승 가정
await T('touchStart', [[230, 640, 1], [345, 35, 3]]);  // 매도 탭
await T('touchMove', [[230, 640, 1]]);
await p.waitForTimeout(150);
await p.screenshot({ path: out + '/t-sell.png' });
console.log('after sell', JSON.stringify(await st()));
await T('touchEnd', []);
await p.waitForTimeout(1200);
console.log('after stream', JSON.stringify(await st()));
await p.evaluate(() => { __AI.G.pendingLv = 1; });
await p.waitForTimeout(100);
await p.waitForTimeout(900);
await p.screenshot({ path: out + '/t-levelup.png' });
console.log('levelup', JSON.stringify(await st()));
// 카드 너무 빨리 누르기 방지 확인 후 선택
await p.click('#cards .card:nth-child(2)');
await p.waitForTimeout(400);
console.log('picked', JSON.stringify(await st()));
// 일시정지
await T('touchStart', [[195, 40, 4]]); await T('touchEnd', []);
await p.waitForTimeout(500);
await p.screenshot({ path: out + '/t-pause.png' });
console.log('paused', JSON.stringify(await st()), 'errors', errs);
await b.close();
