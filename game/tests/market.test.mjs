import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../web/src/rng.js';
import { createMarket, stepMarket, applyShock, getStock, STOCK_DEFS, HISTORY, TICK } from '../web/src/market.js';

function simulate(seed, seconds) {
  const rng = createRng(seed);
  const m = createMarket(rng);
  const news = [];
  for (let t = 0; t < seconds; t += 1 / 60) news.push(...stepMarket(m, rng, 1 / 60));
  return { m, news };
}

test('같은 시드면 같은 시세 (결정성)', () => {
  const a = simulate(42, 120).m;
  const b = simulate(42, 120).m;
  assert.deepEqual(
    a.stocks.map((s) => s.history),
    b.stocks.map((s) => s.history),
  );
  const c = simulate(43, 120).m;
  assert.notDeepEqual(
    a.stocks.map((s) => s.price),
    c.stocks.map((s) => s.price),
  );
});

test('15분 내내 가격이 하한/상한을 벗어나지 않는다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { m } = simulate(seed, 900);
    for (const s of m.stocks) {
      const d = s.def;
      assert.ok(s.low >= d.p0 * d.floor - 0.01, `${s.id} low ${s.low}`);
      assert.ok(s.high <= d.p0 * d.cap + 0.01, `${s.id} high ${s.high}`);
      assert.ok(Number.isFinite(s.price));
    }
  }
});

test('history 는 HISTORY 개로 제한, tick 은 0.5초', () => {
  const { m } = simulate(7, 200);
  for (const s of m.stocks) assert.equal(s.history.length, HISTORY);
  assert.ok(Math.abs(m.t - 200) <= TICK);
  assert.equal(m.t, m.ticks * TICK);
});

test('regime 이 바뀐다 (추세가 하나로 고정되지 않음)', () => {
  const rng = createRng(5);
  const m = createMarket(rng);
  const seen = new Set();
  for (let i = 0; i < 60 * 300; i++) {
    stepMarket(m, rng, 1 / 60);
    seen.add(m.stocks[1].regime);
  }
  assert.equal(seen.size, 3);
});

test('테마주(DGN)가 우량주(LTS)보다 변동성이 크다', () => {
  let ltsVol = 0;
  let dgnVol = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { m } = simulate(seed, 300);
    const vol = (h) => {
      let sum = 0;
      for (let i = 1; i < h.length; i++) sum += Math.log(h[i] / h[i - 1]) ** 2;
      return Math.sqrt(sum / (h.length - 1));
    };
    ltsVol += vol(getStock(m, 'LTS').history);
    dgnVol += vol(getStock(m, 'DGN').history);
  }
  assert.ok(dgnVol > ltsVol * 2, `dgn ${dgnVol} lts ${ltsVol}`);
});

test('우량주는 장기적으로 크게 무너지지 않는다 (중앙값 0.85~1.5배)', () => {
  const ratios = [];
  for (let seed = 1; seed <= 60; seed++) {
    const { m } = simulate(seed * 31, 900);
    const s = getStock(m, 'LTS');
    ratios.push(s.price / s.def.p0);
  }
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  assert.ok(med > 0.85 && med < 1.5, `median ${med}`);
});

test('뉴스 이벤트가 발생하고 텍스트가 있다', () => {
  const { news } = simulate(11, 600);
  assert.ok(news.length > 3);
  for (const n of news) {
    assert.equal(n.type, 'news');
    assert.ok(typeof n.text === 'string' && n.text.length > 0);
    assert.ok(STOCK_DEFS.some((d) => d.id === n.stock));
  }
});

test('applyShock: 즉시 반영 + 같은 방향 regime', () => {
  const rng = createRng(3);
  const m = createMarket(rng);
  const before = getStock(m, 'DGN').price;
  const ev = applyShock(m, 'DGN', 0.2, '테스트', rng);
  const s = getStock(m, 'DGN');
  assert.ok(Math.abs(s.price / before - 1.2) < 0.01);
  assert.equal(s.regime, 'bull');
  assert.equal(ev.text, '테스트');
  assert.equal(applyShock(m, 'NOPE', 0.1, 'x', rng), null);
});
