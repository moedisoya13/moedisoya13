// ── 게임 데이터: 몬스터, 보스, 무기, 패시브, 스테이지 ─────────────────
const RUN_LEN = 1800;    // 30분
const STAGE_LEN = 300;   // 스테이지당 5분

const STAGES = [
  { name: '초원', sub: '시작의 들판', ground: 'meadow', roman: 'I' },
  { name: '명계', sub: '하데스의 문', ground: 'under', roman: 'II' },
  { name: '사막', sub: '두아트의 모래', ground: 'desert', roman: 'III' },
  { name: '설원', sub: '니플헤임', ground: 'snow', roman: 'IV' },
  { name: '신전', sub: '올림포스 폐허', ground: 'temple', roman: 'V' },
  { name: '혼돈', sub: '긴눙가가프', ground: 'chaos', roman: 'VI' },
];

// beh: walk 걷기 · scurry 바글바글 · waddle 뒤뚱 · float 유령 · flutter 날갯짓 · hop 강시 뜀
//      rush 돌진 · pack 무리 측면 포위 · ranged 원거리
const ENEMIES = {
  spartoi:  { name: '스파르토이', myth: '그리스', hp: 9, spd: 27, dmg: 6, xp: 1, r: 4, tier: 0, w: 10, beh: 'walk' },
  scarab:   { name: '스카라브', myth: '이집트', hp: 4, spd: 40, dmg: 3, xp: 1, r: 3, tier: 0, w: 6, beh: 'scurry', group: [4, 7] },
  kappa:    { name: '갓파', myth: '일본', hp: 13, spd: 23, dmg: 7, xp: 1, r: 4.5, tier: 0, w: 8, beh: 'waddle' },
  wisp:     { name: '도깨비불', myth: '한국', hp: 7, spd: 31, dmg: 5, xp: 1, r: 3.5, tier: 0, w: 7, beh: 'float', ghost: true },
  harpy:    { name: '하피', myth: '그리스', hp: 12, spd: 44, dmg: 7, xp: 2, r: 5, tier: 1, w: 7, beh: 'flutter', fly: true },
  jiangshi: { name: '강시', myth: '중국', hp: 24, spd: 44, dmg: 9, xp: 2, r: 4, tier: 1, w: 7, beh: 'hop' },
  draugr:   { name: '드라우그르', myth: '북유럽', hp: 38, spd: 21, dmg: 10, xp: 3, r: 5, tier: 1, w: 6, beh: 'walk' },
  dokkaebi: { name: '도깨비', myth: '한국', hp: 34, spd: 26, dmg: 10, xp: 3, r: 5.5, tier: 2, w: 6, beh: 'rush' },
  mummy:    { name: '미라', myth: '이집트', hp: 60, spd: 16, dmg: 12, xp: 4, r: 5, tier: 2, w: 6, beh: 'walk' },
  warg:     { name: '와르그', myth: '북유럽', hp: 22, spd: 54, dmg: 9, xp: 2, r: 5, tier: 2, w: 6, beh: 'pack', group: [3, 5] },
  tengu:    { name: '텐구', myth: '일본', hp: 30, spd: 30, dmg: 8, xp: 4, r: 5, tier: 3, w: 4, beh: 'ranged', fly: true },
  gwisin:   { name: '처녀귀신', myth: '한국', hp: 28, spd: 30, dmg: 11, xp: 3, r: 4.5, tier: 3, w: 5, beh: 'float', ghost: true },
  ghoul:    { name: '구울', myth: '아라비아', hp: 40, spd: 47, dmg: 11, xp: 3, r: 5, tier: 3, w: 6, beh: 'walk' },
  cyclops:  { name: '키클롭스', myth: '그리스', hp: 240, spd: 15, dmg: 18, xp: 15, r: 9, tier: 3, w: 2, beh: 'walk', heavy: true },
  oni:      { name: '오니', myth: '일본', hp: 150, spd: 24, dmg: 16, xp: 10, r: 8, tier: 4, w: 3, beh: 'rush', heavy: true },
  hydra:    { name: '히드라', myth: '그리스', hp: 90, spd: 22, dmg: 13, xp: 6, r: 7, tier: 4, w: 4, beh: 'walk', split: 'hydraling' },
  hydraling:{ name: '새끼 히드라', myth: '그리스', hp: 20, spd: 40, dmg: 7, xp: 1, r: 3.5, tier: 99, w: 0, beh: 'walk' },
};

const BOSSES = {
  medusa:   { name: '메두사', myth: '그리스 신화', hp: 1000, spd: 20, dmg: 18, r: 10 },
  minotaur: { name: '미노타우로스', myth: '그리스 신화', hp: 1300, spd: 28, dmg: 22, r: 11 },
  fenrir:   { name: '펜리르', myth: '북유럽 신화', hp: 1150, spd: 40, dmg: 20, r: 12 },
  anubis:   { name: '아누비스', myth: '이집트 신화', hp: 1250, spd: 18, dmg: 18, r: 9 },
  gumiho:   { name: '구미호', myth: '한국 설화', hp: 1150, spd: 34, dmg: 18, r: 11 },
  quetzal:  { name: '케찰코아틀', myth: '아즈텍 신화', hp: 1500, spd: 58, dmg: 20, r: 6 },
};

// 무기: 레벨 L(1..8) 별 수치 표. 인덱스 = L-1
const WEAPONS = {
  bow: {
    name: '장궁', icon: 'bow', desc: '가장 가까운 적에게 화살을 쏜다',
    lv: ['', '화살 +1', '피해 +40%', '관통 +1 · 연사 +10%', '화살 +1', '피해 +30%', '관통 +1 · 연사 +10%', '화살 +1 · 피해 +20%'],
    count: [1, 2, 2, 2, 3, 3, 3, 4], dmg: [10, 10, 14, 14, 14, 18, 18, 22], pierce: [1, 1, 1, 2, 2, 2, 3, 3], cd: [1.0, 1.0, 1.0, 0.9, 0.9, 0.9, 0.8, 0.8],
  },
  rain: {
    name: '화살비', icon: 'rain', desc: '적이 몰린 곳에 화살을 쏟아붓는다',
    lv: ['', '화살 +2', '피해 +30%', '범위 +15%', '화살 +2 · 쿨 -10%', '피해 +25%', '화살 +2 · 범위 +10%', '화살 +4 · 쿨 -10%'],
    count: [6, 8, 8, 8, 10, 10, 12, 16], dmg: [9, 9, 12, 12, 12, 15, 15, 17], radius: [22, 22, 22, 26, 26, 26, 29, 29], cd: [4.2, 4.2, 4.2, 4.2, 3.8, 3.8, 3.8, 3.4],
  },
  blast: {
    name: '폭렬시', icon: 'blast', desc: '맞는 순간 터지는 무거운 화살',
    lv: ['', '피해 +20%', '폭발 범위 +15%', '화살 +1', '피해 +25%', '폭발 범위 +15%', '화살 +1', '피해 +30% · 쿨 -15%'],
    count: [1, 1, 1, 2, 2, 2, 3, 3], dmg: [22, 26, 26, 26, 33, 33, 33, 43], radius: [18, 18, 21, 21, 21, 24, 24, 24], cd: [2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.2],
  },
  falcon: {
    name: '매', icon: 'falcon', desc: '주위를 돌다 적에게 급강하한다',
    lv: ['', '피해 +30%', '매 +1', '속도 +15%', '피해 +30%', '매 +1', '피해 +25% · 속도 +10%', '매 +1'],
    count: [1, 1, 2, 2, 2, 3, 3, 4], dmg: [12, 16, 16, 16, 21, 21, 26, 26], speed: [150, 150, 150, 172, 172, 172, 190, 190], cd: [1.1, 1.1, 1.1, 1.0, 1.0, 0.9, 0.8, 0.7],
  },
  feather: {
    name: '바람깃', icon: 'feather', desc: '칼날 깃털이 몸 주위를 돈다',
    lv: ['', '깃털 +1', '피해 +30%', '지속 +0.5초 · 반경 +8%', '깃털 +1', '피해 +30%', '깃털 +1 · 지속 +0.5초', '피해 +30% · 반경 +8%'],
    count: [2, 3, 3, 3, 4, 4, 5, 5], dmg: [7, 7, 9, 9, 9, 12, 12, 15], radius: [26, 26, 26, 28, 28, 28, 28, 30], dur: [3, 3, 3, 3.5, 3.5, 3.5, 4, 4],
  },
  chain: {
    name: '뇌전시', icon: 'chain', desc: '번개가 적과 적 사이를 건너뛴다',
    lv: ['', '연쇄 +1', '피해 +30%', '연쇄 +1', '쿨 -12%', '피해 +30%', '연쇄 +2', '피해 +25% · 연쇄 +1'],
    count: [3, 4, 4, 5, 5, 5, 7, 8], dmg: [14, 14, 18, 18, 18, 24, 24, 30], cd: [2.4, 2.4, 2.4, 2.4, 2.1, 2.1, 2.1, 2.1],
  },
  nova: {
    name: '사방시', icon: 'nova', desc: '사방으로 화살을 흩뿌린다',
    lv: ['', '피해 +25%', '화살 +2', '쿨 -10%', '화살 +2 · 관통 +1', '피해 +25%', '화살 +2', '화살 +2 · 쿨 -10%'],
    count: [8, 8, 10, 10, 12, 12, 14, 16], dmg: [8, 10, 10, 10, 10, 12, 12, 12], cd: [3.0, 3.0, 3.0, 2.7, 2.7, 2.7, 2.7, 2.4], pierce: [1, 1, 1, 1, 2, 2, 2, 2],
  },
  trap: {
    name: '가시덫', icon: 'trap', desc: '발밑에 덫을 놓아 밟은 적을 묶는다',
    lv: ['', '피해 +25%', '덫 +1', '피해 +20%', '덫 +1 · 쿨 -10%', '피해 +20%', '덫 +1', '덫 +1 · 피해 +20%'],
    count: [2, 2, 3, 3, 4, 4, 5, 6], dmg: [30, 38, 38, 46, 46, 55, 55, 66], cd: [2.5, 2.5, 2.5, 2.5, 2.2, 2.2, 2.2, 2.2],
  },
};
const WEAPON_MAX = 8;

const PASSIVES = {
  might:     { name: '근력', icon: 'might', max: 5, desc: '모든 피해 +10%' },
  haste:     { name: '속사', icon: 'haste', max: 5, desc: '재사용 대기시간 -7%' },
  multishot: { name: '다중시', icon: 'multishot', max: 2, desc: '모든 투사체 +1' },
  area:      { name: '광역', icon: 'area', max: 5, desc: '효과 범위 +10%' },
  fletch:    { name: '깃털화살', icon: 'fletch', max: 3, desc: '관통 +1 · 투사체 속도 +15%' },
  vital:     { name: '활력', icon: 'vital', max: 5, desc: '최대 체력 +20, 그만큼 회복' },
  regen:     { name: '재생', icon: 'regen', max: 5, desc: '초당 체력 +0.3' },
  swift:     { name: '신속', icon: 'swift', max: 5, desc: '이동 속도 +8%' },
  magnet:    { name: '자력', icon: 'magnet', max: 5, desc: '경험치 획득 범위 +35%' },
  armor:     { name: '갑주', icon: 'armor', max: 5, desc: '받는 피해 -1' },
  dividend:  { name: '배당', icon: 'dividend', max: 3, desc: '보유 주식이 틱마다 0.4% 불어난다', market: true },
  leverage:  { name: '레버리지', icon: 'leverage', max: 3, desc: '매도 손익 배율 ×1.5 (이익도 손실도)', market: true },
  stoploss:  { name: '손절선', icon: 'stoploss', max: 3, desc: '매도 배율 하한 0.75 → 0.85 → 0.95', market: true },
  insider:   { name: '내부자 정보', icon: 'insider', max: 1, desc: '다음 틱 가격이 그래프에 미리 비친다', market: true },
};

const SLOT_MAX = 6;

// 바닥 장식 스프라이트 (디더로 배경에 가라앉힌다)
const DECO = {
  meadow: ['rock', 'tuft', 'tuft', 'stump'],
  under: ['grave', 'bones', 'skull', 'rock'],
  desert: ['cactus', 'rock', 'bones', 'obelisk'],
  snow: ['crystal', 'rock', 'pine', 'pine'],
  temple: ['pillar', 'pillar', 'rock', 'urn'],
  chaos: ['crystal', 'eye', 'rock', 'skull'],
};

Object.assign(ART, {
  rock: [[
    '..###...',
    '.#####..',
    '##::###.',
    '#::::###',
    '########',
  ]],
  tuft: [[
    '#..#..#',
    '.#.#.#.',
    '.#.#.#.',
    '..###..',
  ]],
  stump: [[
    '.#####.',
    '#:::::#',
    '#######',
    '#.#.#.#',
    '#######',
    '##.#.##',
  ]],
  grave: [[
    '..###..',
    '.#####.',
    '##o#o##',
    '##ooo##',
    '##o#o##',
    '#######',
    '#######',
    '#######',
    '#########',
  ]],
  bones: [[
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '..#.#..',
    '##...##',
  ]],
  skull: [[
    '.###.',
    '#####',
    '#o#o#',
    '#####',
    '.#.#.',
  ]],
  cactus: [[
    '...#...',
    '..###..',
    '#.###..',
    '#.###.#',
    '#####.#',
    '..#####',
    '..###..',
    '..###..',
    '..###..',
    '.#####.',
  ]],
  obelisk: [[
    '..#..',
    '.###.',
    '.#o#.',
    '.###.',
    '.#o#.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '#####',
  ]],
  crystal: [[
    '..#..',
    '.###.',
    '.#:#.',
    '##:##',
    '#:#:#',
    '##:##',
    '.###.',
    '..#..',
  ]],
  pine: [[
    '....#....',
    '...###...',
    '..##:##..',
    '...###...',
    '..##:##..',
    '.##:#:##.',
    '..#####..',
    '.##:#:##.',
    '##:#:#:##',
    '....#....',
    '....#....',
  ]],
  pillar: [[
    '#######',
    '.#####.',
    '.#.#.#.',
    '.#.#.#.',
    '.#.#.#.',
    '.#.#.#.',
    '.#.#.#.',
    '.#.#.#.',
    '.#####.',
    '#######',
  ]],
  urn: [[
    '.#####.',
    '..###..',
    '.#####.',
    '##o#o##',
    '#######',
    '##o#o##',
    '.#####.',
    '..###..',
  ]],
  eye: [[
    '..###..',
    '.#ooo#.',
    '#oo#oo#',
    '.#ooo#.',
    '..###..',
  ]],
});
