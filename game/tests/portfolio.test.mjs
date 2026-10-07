import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortfolio,
  buyCost,
  sellProceeds,
  planPayment,
  maxBuyQty,
  buy,
  sell,
  avgCost,
  liquidate,
  unrealizedPct,
} from '../web/src/portfolio.js';

const FEE = 0.01;
const XPR = 0.5;

test('매수 비용은 올림, 매도 대금은 내림', () => {
  assert.equal(buyCost(10, 3, FEE), 31); // 30.3 → 31
  assert.equal(sellProceeds(10, 3, FEE), 29); // 29.7 → 29
  assert.equal(buyCost(10, 0, FEE), 0);
});

test('같은 가격에 사고 팔면 반드시 손해 (반올림 차익 없음)', () => {
  for (const price of [0.5, 1.37, 9.99, 15, 40.25]) {
    for (const q of [1, 2, 7, 33]) {
      assert.ok(sellProceeds(price, q, FEE) < buyCost(price, q, FEE), `${price} x ${q}`);
    }
  }
});

test('결제: 코인 먼저, 부족분은 XP (useXp 일 때만)', () => {
  assert.deepEqual(planPayment(20, 30, 100, XPR, true), { coins: 20, xp: 0 });
  assert.deepEqual(planPayment(20, 15, 100, XPR, true), { coins: 15, xp: 10 }); // 5코인 = XP 10
  assert.equal(planPayment(20, 15, 100, XPR, false), null);
  assert.equal(planPayment(20, 15, 9, XPR, true), null);
  assert.deepEqual(planPayment(3, 0, 6, XPR, true), { coins: 0, xp: 6 });
});

test('maxBuyQty 는 실제로 살 수 있는 최대치', () => {
  for (const [price, coins, xp, useXp] of [
    [10, 100, 0, false],
    [10, 100, 50, true],
    [3.3, 7, 13, true],
    [40, 39, 0, false],
  ]) {
    const q = maxBuyQty(price, FEE, coins, xp, XPR, useXp);
    if (q > 0) assert.ok(planPayment(buyCost(price, q, FEE), coins, xp, XPR, useXp), 'q 는 결제 가능');
    assert.equal(planPayment(buyCost(price, q + 1, FEE), coins, xp, XPR, useXp), null, 'q+1 은 불가');
  }
});

test('매수 → 평단 → 매도 실현손익', () => {
  const pf = createPortfolio();
  const r1 = buy(pf, 'LTS', 2, 10, FEE, { coins: 100, xp: 0 }, XPR, false);
  assert.deepEqual(r1, { coins: 21, xp: 0, cost: 21 });
  const r2 = buy(pf, 'LTS', 2, 20, FEE, { coins: 79, xp: 0 }, XPR, false);
  assert.equal(r2.cost, 41);
  assert.equal(pf.holdings.LTS.qty, 4);
  assert.equal(avgCost(pf, 'LTS'), 62 / 4);

  const s = sell(pf, 'LTS', 2, 30, FEE);
  assert.equal(s.proceeds, 59);
  assert.equal(s.pnl, 59 - 31);
  assert.equal(pf.holdings.LTS.qty, 2);
  assert.equal(pf.holdings.LTS.cost, 31);
  assert.equal(pf.bestTrade.pnl, 28);
});

test('XP 로 낸 금액은 코인 환산으로 원가에 들어간다', () => {
  const pf = createPortfolio();
  const r = buy(pf, 'DGN', 1, 10, FEE, { coins: 5, xp: 20 }, XPR, true);
  assert.deepEqual(r, { coins: 5, xp: 12, cost: 11 });
  assert.equal(pf.holdings.DGN.cost, 5 + 12 * XPR);
});

test('보유보다 많이 팔면 보유분만, 0주면 null', () => {
  const pf = createPortfolio();
  assert.equal(sell(pf, 'LTS', 1, 10, FEE), null);
  buy(pf, 'LTS', 3, 10, FEE, { coins: 100, xp: 0 }, XPR, false);
  const r = sell(pf, 'LTS', 99, 10, FEE);
  assert.equal(pf.holdings.LTS.qty, 0);
  assert.equal(pf.holdings.LTS.cost, 0);
  assert.equal(r.proceeds, 29);
});

test('강제청산: 전 종목 매도, 대금 합계', () => {
  const pf = createPortfolio();
  buy(pf, 'LTS', 2, 40, FEE, { coins: 1000, xp: 0 }, XPR, false);
  buy(pf, 'DGN', 5, 15, FEE, { coins: 1000, xp: 0 }, XPR, false);
  const total = liquidate(pf, { LTS: 50, DGN: 10 }, FEE);
  assert.equal(total, sellProceeds(50, 2, FEE) + sellProceeds(10, 5, FEE));
  assert.equal(pf.holdings.LTS.qty + pf.holdings.DGN.qty, 0);
});

test('평가손익률', () => {
  const pf = createPortfolio();
  assert.equal(unrealizedPct(pf, 'LTS', 10), 0);
  buy(pf, 'LTS', 10, 10, 0, { coins: 1000, xp: 0 }, XPR, false);
  assert.ok(Math.abs(unrealizedPct(pf, 'LTS', 12) - 0.2) < 1e-9);
});
