// 밸런스 상수 모음. 숫자는 플레이테스트 전 초기값이다 — 체감에 맞춰 여기서만 고친다.

export const RUN_SECONDS = 15 * 60; // 15:00 생존 = 클리어
export const STEP = 1 / 60; // fixed timestep
export const LOGICAL_TARGET_W = 240; // 논리 해상도 가로 목표 (픽셀 크기 결정)
export const BAR_CSS_H = 96; // 차트 바 높이 (CSS px, safe-area 제외)

export const PLAYER = {
  baseHp: 100,
  speed: 62, // logical px / s
  radius: 5,
  pickupRadius: 24,
  iframes: 0.6,
};

// 레벨 n → n+1 에 필요한 XP
export function xpToNext(level) {
  return Math.floor(4 + level * 4 + level * level * 0.5);
}

export const SLOTS = { weapons: 6, passives: 6 };

export const ENEMY_CAP = 300;

export const BROKER = {
  firstAt: 25, // 첫 등장 (초)
  interval: 55, // 떠난 뒤 다음 등장까지
  stay: 25, // 머무는 시간
  dist: [80, 120], // 플레이어로부터 등장 거리
  radius: 16, // 이 안에 들어가면 매매창
};

export const TRADE = {
  feeRate: 0.01, // 매수·매도 각각 1%
  xpRate: 0.5, // XP 1 = 코인 0.5
};

export const SHOP = [
  { id: 'noodle', name: '국수 한 그릇', desc: 'HP 40% 회복', price: () => 25 },
  { id: 'scroll', name: '비전서', desc: '즉시 레벨업', price: (lv) => 30 + lv * 7 },
  { id: 'pager', name: '삐삐', desc: '어디서든 왕씨 호출 (1회)', price: () => 45, max: 2 },
];

// 영구 업그레이드 (금고)
export const META = [
  { id: 'hp', name: '강철 체력', desc: (l) => `최대 HP +${l * 10}`, max: 5, cost: (l) => 40 + l * 40 },
  { id: 'might', name: '근력 훈련', desc: (l) => `공격력 +${l * 5}%`, max: 5, cost: (l) => 60 + l * 50 },
  { id: 'speed', name: '경공술', desc: (l) => `이동속도 +${l * 5}%`, max: 3, cost: (l) => 50 + l * 50 },
  { id: 'magnet', name: '자석 장갑', desc: (l) => `흡수 범위 +${l * 15}%`, max: 3, cost: (l) => 40 + l * 40 },
  { id: 'greed', name: '탐욕', desc: (l) => `코인 획득 +${l * 10}%`, max: 5, cost: (l) => 60 + l * 60 },
  { id: 'seed', name: '시드머니', desc: (l) => `시작 코인 +${l * 20}`, max: 3, cost: (l) => 80 + l * 80 },
  {
    id: 'sense',
    name: '투자 감각',
    desc: (l) => (l >= 3 ? '수수료 -0.5%p · 애널리스트 의견' : `수수료 -${(l * 0.25).toFixed(2)}%p`),
    max: 3,
    cost: (l) => 100 + l * 120,
  },
  { id: 'revive', name: '스턴트 대역', desc: (l) => `사망 시 부활 ${l}회`, max: 1, cost: () => 500 },
];

export const COIN_DROP_CHANCE = 0.07;
export const XP_GEM_CAP = 350;
