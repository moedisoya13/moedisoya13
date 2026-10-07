// 주가 시뮬레이션 (pure — DOM 없음, node --test 대상).
//
// 0.5초 tick 마다 로그가격 x 를 갱신한다:
//   x += 추세(regime) + 평균회귀(anchor 쪽으로) + 잡음 + 가끔 점프
// regime(상승/하락/횡보)이 15~40초씩 이어져서 "지금 오르는 중"이 눈에 읽힌다.
// 완전 랜덤워크면 차트를 볼 이유가 없고, 너무 뻔하면 도박의 맛이 없다 — 그 중간을 노린 설계.

export const TICK = 0.5; // 초
export const HISTORY = 180; // 차트 바에 그리는 tick 수 (= 90초)
export const RUN_SAMPLE_EVERY = 4; // runHistory 는 2초 간격 (NG 화면 전체 차트용)

export const STOCK_DEFS = [
  {
    id: 'LTS',
    name: '연꽃전자',
    short: '연꽃',
    kind: '우량주',
    p0: 40,
    sigma: 0.006, // 로그 변동성 / √초
    trend: 0.003, // regime 추세 / 초
    revert: 0.004, // 평균회귀 강도 / 초
    anchorDrift: 0.00016, // 앵커 우상향 (15분에 약 +15%)
    anchorVol: 0,
    jumpRate: 1 / 150, // 초당 점프 확률
    jump: [0.04, 0.1],
    floor: 0.35, // p0 대비 하한
    cap: 4, // p0 대비 상한
    regimeDur: [20, 40],
  },
  {
    id: 'DGN',
    name: '드래곤국수',
    short: '국수',
    kind: '테마주',
    p0: 15,
    sigma: 0.02,
    trend: 0.008,
    revert: 0.003,
    anchorDrift: 0,
    anchorVol: 0.004,
    jumpRate: 1 / 40,
    jump: [0.15, 0.35],
    floor: 0.15,
    cap: 8,
    regimeDur: [15, 35],
  },
];

const HEADLINES = {
  LTS: {
    up: [
      '연꽃전자, 신형 삐삐 사전예약 완판',
      '연꽃전자 반도체 수율 개선 소식',
      '외국인, 연꽃전자 대량 매수',
      '연꽃전자 분기 실적 서프라이즈',
    ],
    down: [
      '연꽃전자 CEO, 쿵푸 수업 중 부상',
      '연꽃전자 삐삐 배터리 발열 논란',
      '기관, 연꽃전자 차익실현 매물',
      '연꽃전자 공장 정전 사고',
    ],
  },
  DGN: {
    up: [
      '드래곤국수 매운맛 신메뉴 대박!',
      '드래곤국수, 홍콩 영화 PPL 계약설',
      '"국수 먹고 힘 났다" 재키 인터뷰 화제',
      '드래곤국수 해외 수출 계약 체결',
      '개미들 "국수는 영원하다" 집단 매수',
    ],
    down: [
      '드래곤국수 불량 면발 리콜 사태',
      '드래곤국수 사장, 야반도주설',
      '밀가루 가격 폭등… 드래곤국수 직격탄',
      '드래곤국수 위생 점검 적발',
      '드래곤국수 회계 의혹 제기',
    ],
  },
};

const REGIME_NEXT = {
  bull: [['bear', 0.4], ['flat', 0.45], ['bull', 0.15]],
  bear: [['bull', 0.45], ['flat', 0.4], ['bear', 0.15]],
  flat: [['bull', 0.45], ['bear', 0.45], ['flat', 0.1]],
};

const ANALYST = { bull: '매수', bear: '매도', flat: '중립' };

export function createMarket(rng, defs = STOCK_DEFS) {
  return {
    t: 0,
    acc: 0,
    ticks: 0,
    stocks: defs.map((d) => {
      const regime = rng.pick(['bull', 'bear', 'flat']);
      return {
        def: d,
        id: d.id,
        price: d.p0,
        open: d.p0,
        logP: Math.log(d.p0),
        anchor: Math.log(d.p0),
        regime,
        regimeLeft: rng.range(d.regimeDur[0], d.regimeDur[1]),
        analyst: analystFor(regime, rng),
        history: [d.p0],
        runHistory: [d.p0],
        high: d.p0,
        low: d.p0,
      };
    }),
  };
}

function analystFor(regime, rng) {
  // 75% 확률로 맞는 의견 — 힌트이지 정답지가 아니다
  if (rng.next() < 0.75) return ANALYST[regime];
  return rng.pick(['매수', '매도', '중립']);
}

export function getStock(market, id) {
  return market.stocks.find((s) => s.id === id);
}

export function prices(market) {
  const out = {};
  for (const s of market.stocks) out[s.id] = s.price;
  return out;
}

// dt 초만큼 시장을 진행. 이번 호출에서 생긴 뉴스 이벤트 배열을 돌려준다.
export function stepMarket(market, rng, dt) {
  const events = [];
  market.acc += dt;
  while (market.acc >= TICK) {
    market.acc -= TICK;
    tick(market, rng, events);
  }
  return events;
}

function tick(market, rng, events) {
  market.t += TICK;
  market.ticks++;
  const sq = Math.sqrt(TICK);

  for (const s of market.stocks) {
    const d = s.def;
    const lo = Math.log(d.p0 * d.floor);
    const hi = Math.log(d.p0 * d.cap);

    s.regimeLeft -= TICK;
    if (s.regimeLeft <= 0) {
      s.regime = nextRegime(s, rng);
      s.regimeLeft = rng.range(d.regimeDur[0], d.regimeDur[1]);
      s.analyst = analystFor(s.regime, rng);
    }

    s.anchor += d.anchorDrift * TICK + d.anchorVol * sq * rng.gauss();
    s.anchor = clamp(s.anchor, lo + 0.4, hi - 0.6);

    const mu = s.regime === 'bull' ? d.trend : s.regime === 'bear' ? -d.trend : 0;
    let x = s.logP;
    x += mu * TICK - d.revert * (x - s.anchor) * TICK + d.sigma * sq * rng.gauss();

    if (rng.next() < d.jumpRate * TICK) {
      // 점프 방향은 regime 쪽으로 65% 기운다
      const upBias = s.regime === 'bull' ? 0.65 : s.regime === 'bear' ? 0.35 : 0.5;
      const dir = rng.next() < upBias ? 1 : -1;
      const pct = dir * rng.range(d.jump[0], d.jump[1]);
      x += Math.log(1 + pct);
      events.push(newsEvent(s, pct, rng));
    }

    s.logP = clamp(x, lo, hi);
    setPrice(s);
    pushHistory(market, s);
  }
}

function nextRegime(s, rng) {
  const d = s.def;
  // 바닥 근처면 반등, 천장 근처면 조정 — 상폐/무한상승 방지
  if (s.price < d.p0 * d.floor * 1.4) return 'bull';
  if (s.price > d.p0 * d.cap * 0.7) return 'bear';
  return rng.weighted(REGIME_NEXT[s.regime]);
}

function setPrice(s) {
  s.price = Math.round(Math.exp(s.logP) * 100) / 100;
  if (s.price > s.high) s.high = s.price;
  if (s.price < s.low) s.low = s.price;
}

function pushHistory(market, s) {
  s.history.push(s.price);
  if (s.history.length > HISTORY) s.history.shift();
  if (market.ticks % RUN_SAMPLE_EVERY === 0) s.runHistory.push(s.price);
}

function newsEvent(s, pct, rng, text) {
  const pool = HEADLINES[s.id] ? HEADLINES[s.id][pct >= 0 ? 'up' : 'down'] : null;
  return {
    type: 'news',
    stock: s.id,
    pct,
    text: text || (pool ? rng.pick(pool) : `${s.def.name} ${pct >= 0 ? '급등' : '급락'}`),
  };
}

// 게임 이벤트(보스 처치 등)가 시장에 주는 충격. 즉시 반영하고 뉴스 이벤트를 돌려준다.
export function applyShock(market, id, pct, text, rng) {
  const s = getStock(market, id);
  if (!s) return null;
  const d = s.def;
  s.logP = clamp(s.logP + Math.log(1 + pct), Math.log(d.p0 * d.floor), Math.log(d.p0 * d.cap));
  setPrice(s);
  // 충격 직후 흐름도 같은 방향으로 잠시 이어지게
  s.regime = pct >= 0 ? 'bull' : 'bear';
  s.regimeLeft = Math.max(s.regimeLeft, 10);
  return newsEvent(s, pct, rng, text);
}

// 표시용 등락률 (run 시작가 대비)
export function changePct(s) {
  return (s.price - s.open) / s.open;
}

export function formatPrice(p) {
  return p >= 10 ? p.toFixed(1) : p.toFixed(2);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
