// E2E 스모크: iPhone 에뮬레이션으로 한 판의 주요 흐름을 훑는다.
// 사용: NODE_PATH="$(npm root -g)" node tools/smoke.cjs   (SHOTS=디렉터리 로 스크린샷 저장 위치 지정)
// 사전 설치된 chromium 을 쓴다 (CHROMIUM 환경변수로 경로 변경 가능).
const { chromium, devices } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'jacky-smoke');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

(async () => {
  const { serve } = await import(path.join(__dirname, 'serve.mjs'));
  const server = await serve(8130);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // CDP 합성 터치는 cancelable=false 라 preventDefault 경고가 난다 — 실제 기기와 무관
    if (m.type() === 'error' && !m.text().startsWith('Ignored attempt to cancel')) errors.push(m.text());
  });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  async function drag(x, y, dx, dy) {
    await touch('touchStart', x, y);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', x + (dx * i) / 10, y + (dy * i) / 10);
      await page.waitForTimeout(30);
    }
  }

  await page.goto('http://localhost:8130/?debug=1');
  await page.waitForSelector('[data-act=start]');
  await shot('01-title');
  check(await g(() => window.__game.scene === 'title'), '타이틀 화면');

  await page.tap('[data-act=start]');
  await page.waitForTimeout(300);
  check(await g(() => window.__game.scene === 'play'), '런 시작');

  // 차트 바 자동 전환 (좌표는 뷰포트 높이 비율로)
  const H = await g(() => window.innerHeight);
  await drag(200, H * 0.85, 30, -20);
  await page.waitForTimeout(400);
  check((await g(() => window.__game.barSide)) === 'top', '하단 터치 → 차트 바 상단');
  const moved = await g(() => Math.hypot(window.__game.run.player.x, window.__game.run.player.y));
  check(moved > 3, `드래그로 이동 (${moved.toFixed(1)}px)`);
  await touch('touchEnd');
  await drag(200, H * 0.2, -30, 20);
  await page.waitForTimeout(500);
  check((await g(() => window.__game.barSide)) === 'bottom', '상단 터치 → 차트 바 하단');
  await shot('02-bar-bottom');
  await touch('touchEnd');
  await drag(200, H * 0.5, 10, 0); // 가운데 띠: 유지
  await page.waitForTimeout(400);
  check((await g(() => window.__game.barSide)) === 'bottom', '가운데 터치 → 위치 유지');
  await touch('touchEnd');

  // 레벨업
  await g(() => {
    window.__game.run.debug.god = true;
    window.__game.levelUp();
  });
  await page.waitForTimeout(300);
  check((await g(() => window.__game.modal)) === 'levelup', '레벨업 모달');
  await shot('03-levelup');
  await page.waitForTimeout(300);
  await page.tap('.card');
  await page.waitForTimeout(200);
  check(await g(() => window.__game.run.player.weapons.length + Object.keys(window.__game.run.player.passives).length >= 2 || window.__game.run.player.weapons[0].level === 2), '선택 적용');

  // 브로커: 매수 → 시간 경과 → 매도
  await g(() => {
    const r = window.__game.run;
    r.player.coins = 300;
    window.__game.spawnBroker();
    r.player.x = r.broker.x;
    r.player.y = r.broker.y;
  });
  await page.waitForTimeout(300);
  check((await g(() => window.__game.modal)) === 'broker', '왕씨 포장마차 진입 → 매매창');
  await page.tap('[data-q="DGN:+"]');
  await page.tap('[data-q="DGN:+"]');
  await page.tap('[data-buy=DGN]');
  await page.waitForTimeout(100);
  const h1 = await g(() => window.__game.run.portfolio.holdings.DGN.qty);
  check(h1 === 3, `국수 3주 매수 (보유 ${h1})`);
  await shot('04-broker');
  await page.tap('[data-tab=shop]');
  await page.tap('[data-shop=pager]');
  check((await g(() => window.__game.run.pager)) === 1, '상점: 삐삐 구매');
  await page.tap('[data-act=close]');
  await page.waitForTimeout(200);
  check((await g(() => window.__game.modal)) === null, '매매창 닫기');
  await g(() => window.__game.setTimeScale(4));
  await page.waitForTimeout(2500);
  await g(() => window.__game.setTimeScale(1));
  // 레벨업이 끼어들었으면 처리
  for (let i = 0; i < 5 && (await g(() => window.__game.modal)) === 'levelup'; i++) {
    await page.waitForTimeout(300);
    await page.tap('.card');
  }
  await page.tap('[data-act=pager]');
  await page.waitForTimeout(200);
  check((await g(() => window.__game.modal)) === 'broker', '삐삐로 원격 매매창');
  await page.tap('[data-q="DGN:all"]');
  await page.tap('[data-sell=DGN]');
  check((await g(() => window.__game.run.portfolio.holdings.DGN.qty)) === 0, '국수 전량 매도');
  check((await g(() => window.__game.run.portfolio.trades.length)) === 2, '거래 기록 2건');
  await page.tap('[data-act=close]');

  // 일시정지
  await page.tap('[data-act=pause]');
  await page.waitForTimeout(150);
  check((await g(() => window.__game.modal)) === 'pause', '일시정지');
  await shot('05-pause');
  const t0 = await g(() => window.__game.run.t);
  await page.waitForTimeout(400);
  check((await g(() => window.__game.run.t)) === t0, '일시정지 중 시간 정지');
  await page.tap('[data-act=resume]');

  // 사망 → NG → 금고 입금
  await g(() => {
    const r = window.__game.run;
    r.player.coins = 50;
  });
  const vault0 = await g(() => window.__game.save.vault);
  await g(() => window.__game.kill());
  await page.waitForTimeout(1200);
  check((await g(() => window.__game.scene)) === 'result', 'NG 결과 화면');
  await shot('06-result');
  const vault1 = await g(() => window.__game.save.vault);
  check(vault1 >= vault0 + 50, `금고 입금 (${vault0} → ${vault1})`);

  // 금고에서 업그레이드 구매
  await page.tap('[data-act=vault]');
  await page.waitForTimeout(200);
  await page.tap('[data-buy=hp]');
  check((await g(() => window.__game.save.upgrades.hp)) === 1, '금고: 강철 체력 구매');
  await shot('07-vault');
  await page.tap('[data-act=back]');

  // 클리어
  await page.tap('[data-act=start]');
  await page.waitForTimeout(200);
  check((await g(() => window.__game.run.player.stats.maxHp)) === 110, '영구 업그레이드 반영 (HP 110)');
  await g(() => {
    window.__game.run.debug.god = true;
    window.__game.run.t = 15 * 60 - 0.05;
  });
  await page.waitForTimeout(1200);
  check((await g(() => window.__game.scene)) === 'result', '15:00 클리어');
  await shot('08-clear');
  const saved = await g(() => JSON.parse(localStorage.getItem('jacky-survivors:v1')));
  check(saved && saved.best.clears === 1, 'localStorage 저장');

  check(errors.length === 0, `페이지 에러 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(`\nscreenshots: ${SHOTS}`);
  await browser.close();
  server.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
