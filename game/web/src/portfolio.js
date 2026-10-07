// 보유 주식 · 평단 · 매수/매도/청산 계산 (pure — node --test 대상).
//
// 코인은 정수로만 다룬다. 매수 비용은 올림, 매도 대금은 내림 — 반올림 차익으로
// 무한 수익을 만드는 경로를 원천 차단한다.
// 원가(cost)는 "코인 환산"으로 기록한다: XP 로 낸 금액도 XP×환율 만큼 원가에 들어간다.

export function createPortfolio(ids = ['LTS', 'DGN']) {
  const holdings = {};
  for (const id of ids) holdings[id] = { qty: 0, cost: 0 };
  return { holdings, realized: 0, trades: [], bestTrade: null };
}

export function buyCost(price, qty, feeRate) {
  return Math.max(0, Math.ceil(price * qty * (1 + feeRate) - 1e-9));
}

export function sellProceeds(price, qty, feeRate) {
  return Math.floor(price * qty * (1 - feeRate) + 1e-9);
}

// 결제 수단 계산: 코인 먼저, 모자라면 (useXp 일 때) XP 로 충당.
// 불가능하면 null.
export function planPayment(cost, coins, xp, xpRate, useXp) {
  if (cost <= coins) return { coins: cost, xp: 0 };
  if (!useXp) return null;
  const rest = cost - coins;
  const xpNeed = Math.ceil(rest / xpRate - 1e-9);
  if (xpNeed > xp) return null;
  return { coins, xp: xpNeed };
}

// 지금 가진 자원으로 살 수 있는 최대 수량
export function maxBuyQty(price, feeRate, coins, xp, xpRate, useXp) {
  const budget = coins + (useXp ? Math.floor(xp * xpRate) : 0);
  let q = Math.floor(budget / (price * (1 + feeRate)));
  while (q > 0 && !planPayment(buyCost(price, q, feeRate), coins, xp, xpRate, useXp)) q--;
  return Math.max(0, q);
}

// 매수 실행. 성공 시 결제 내역 {coins, xp, cost}, 실패 시 null.
export function buy(pf, id, qty, price, feeRate, wallet, xpRate, useXp, t = 0) {
  if (qty <= 0) return null;
  const cost = buyCost(price, qty, feeRate);
  const pay = planPayment(cost, wallet.coins, wallet.xp, xpRate, useXp);
  if (!pay) return null;
  const h = pf.holdings[id];
  h.qty += qty;
  // 원가는 코인 환산. XP 로 낸 부분은 환율로 환산해 넣는다.
  h.cost += pay.coins + pay.xp * xpRate;
  pf.trades.push({ t, id, side: 'buy', qty, price });
  return { ...pay, cost };
}

// 매도 실행. 받은 코인과 실현손익을 돌려준다.
export function sell(pf, id, qty, price, feeRate, t = 0) {
  const h = pf.holdings[id];
  qty = Math.min(qty, h.qty);
  if (qty <= 0) return null;
  const proceeds = sellProceeds(price, qty, feeRate);
  const basis = (h.cost / h.qty) * qty;
  const pnl = proceeds - basis;
  h.qty -= qty;
  h.cost -= basis;
  if (h.qty === 0) h.cost = 0; // 부동소수 찌꺼기 제거
  pf.realized += pnl;
  const trade = { t, id, side: 'sell', qty, price, pnl };
  pf.trades.push(trade);
  if (!pf.bestTrade || pnl > pf.bestTrade.pnl) pf.bestTrade = trade;
  return { proceeds, pnl };
}

export function avgCost(pf, id) {
  const h = pf.holdings[id];
  return h.qty > 0 ? h.cost / h.qty : 0;
}

export function marketValue(pf, priceMap) {
  let v = 0;
  for (const id in pf.holdings) v += pf.holdings[id].qty * (priceMap[id] || 0);
  return v;
}

export function unrealized(pf, id, price) {
  const h = pf.holdings[id];
  if (h.qty === 0) return 0;
  return h.qty * price - h.cost;
}

// 평가손익률 (수수료 전 기준, 차트 바 표시용)
export function unrealizedPct(pf, id, price) {
  const h = pf.holdings[id];
  if (h.qty === 0 || h.cost === 0) return 0;
  return (h.qty * price - h.cost) / h.cost;
}

// 런 종료 시 강제청산. 총 대금을 돌려준다.
export function liquidate(pf, priceMap, feeRate, t = 0) {
  let total = 0;
  for (const id in pf.holdings) {
    const h = pf.holdings[id];
    if (h.qty > 0) {
      const r = sell(pf, id, h.qty, priceMap[id], feeRate, t);
      if (r) total += r.proceeds;
    }
  }
  return total;
}
