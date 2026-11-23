/* What the pending catalogue holds (docs/pending-catalog.md §4-§7): the items still open, each with where it stands, its
   numbers against the plan, its choices and the one recommended, and the cards that show it. Nothing here knows the page or
   the renderer: node reads it too (tools/pending.mjs measures the cards' variants from it, tests/pending.test.mjs checks it).
   Grades are written 명/암 as in the rest of the code; the page shows them as L/D. Item ids and choice ids are the keys the
   decisions are saved under: change the words, never the ids.
     PARTS      the four parts, in order
     ITEMS      the items, in order; part: the part's n (part 5: what the work of 2026-11-23 left open, shown first)
     TUNES      the variants' overrides (src/tune.mjs), as the cards and tools/pending.mjs both use them
     VERSIONS   the hit effect's versions, and MIST, the colours of its spray, as they were compared (the item is decided:
                the game draws the blow by render/blow.mjs, and src/fxlab.mjs no longer has them: these are the originals)
     FX_SCENES  the three scenes the versions are compared in
   A card: { entry (a catalogue script id), say (a line: what it is), kind (what its numbers are: tag, liver, cross, pd, fx,
   wave), key (its expected numbers in src/pending.numbers.mjs: NUMBERS.cards), tune, guard and gap (the down parry's frame
   and distance: tune.mjs guardAt), scene and version (an effect card), band (the plan's range for a liver hook) }, or
   { image, say } (a reference sheet, docs/ref), or { fill: true } (the empty half of a row). An item's groups: each a clock
   (its cards stepped together, started again together), of rows of two. An item that pairs with the next: pair (its id),
   and each its one card: card. */
import { NUMBERS } from './pending.numbers.mjs';

const N = NUMBERS || {};
const f1 = x => (x === undefined || x === null ? '–' : (+x).toFixed(1));
const f0 = x => (x === undefined || x === null ? '–' : String(Math.round(x)));
const at = (o, ...keys) => keys.reduce((v, k) => (v && v[k] !== undefined ? v[k] : undefined), o);

export const PARTS = [
  { n: 5, mark: '새', title: '오늘 생긴 결정 (2026-11-23)', note: '오늘의 작업에서 나온 것입니다. 카드는 없고, 항목마다 지금의 상태와 기본값이 적혀 있습니다. 고르지 않으면 "권장"(기본값)으로 진행합니다.' },
  { n: 1, title: '남은 구현', note: '카드가 없습니다. 고르는 것은 진행 여부와 순서입니다.' },
  { n: 2, title: '결정을 기다리는 것', note: '기획자가 정한 기본값과 균형. 비교 쌍은 왼쪽이 지금, 오른쪽이 조정안입니다. 조정안 카드는 같은 엔진에 표의 값 하나둘만 바꿔 돌린 것이고, 게임의 기본값은 그대로입니다.' },
  { n: 3, title: '엔진 한계로 기획과 다른 것', note: '고르는 것은 대체로 같습니다: 수용(README의 알려진 한계에 남김), 다시 시도(방법은 한 줄로 적힘), 목표를 지움. 카드는 카탈로그의 대본 그대로이고, 참고 영상의 접촉 시트가 있으면 왼쪽에 기획 쪽으로 놓습니다.' },
  { n: 4, title: '정리 후보', note: '고르는 것은 승인(파기)과 보류입니다. 승인된 것만 다음 세션이 메모를 읽고 지웁니다.' }
];

/* ---- the variants (docs/pending-catalog.md §2, §5.6, §6.6): each a value of a game table replaced whole for the card */
export const TUNES = {
  // the liver hook's path laid so the trunk is further round as it reaches the liver: it lands a frame later, at the end of the sweep
  land: [['MOVES', 'hookBody', 'land', 0.76]],
  // the cross-arm guard as the plan draws it, variant 나: upright (the lean), the rear glove and elbow placed for it
  upright: [['CROSS', '4a', 'R', [-0.049, -0.056, -0.037, 0.08]], ['CROSS', '4a', 'pole', { L: [1, -0.7, 0.4], R: [-0.089, -1, 0.041] }], ['CROSS', '4a', 'lean', -10]],
  // variant 가: the lean left as it is, only the rear glove and elbow
  glove: [['CROSS', '4a', 'R', [0.073, -0.052, -0.029, -0.343]], ['CROSS', '4a', 'pole', { L: [1, -0.7, 0.4], R: [-0.392, -1, 0.2] }]]
};

/* ---- the hit effect (src/fxlab.mjs VERSIONS and MIST, the same values: see above) */
export const MIST = [[39, 39, 40, 40], [40, 40, 39, 41], [41, 41, 41, 25], [38, 39, 40, 40], [41, 38, 41, 41]];
export const VERSIONS = [
  { id: 'now', name: '지금', note: '지금의 색 입자와 흰 번쩍임. 비교 기준입니다.' },
  { id: 'base', name: 'A · 기본', note: '입자는 타격이 가는 쪽, 맞은 부위의 그늘진 면 전체에서 나옵니다. 파문은 빛 없이 몸이 일렁이며 초속 3 m로 0.4초 동안 퍼집니다.', spray: { n: 130, range: 0.8, flare: 0.5 }, wave: { speed: 3, last: 0.4, width: 0.14, sway: 0.034 } },
  { id: 'wide', name: 'B · 크고 느리게', note: '입자가 더 많고 굵으며 가장자리에서 더 벌어집니다. 파문은 느리고 크게 일렁입니다.', spray: { n: 180, range: 0.65, flare: 0.9, life: 0.5, size: 0.018 }, wave: { speed: 2.2, last: 0.55, width: 0.2, sway: 0.05 } },
  { id: 'long', name: 'C · 잘고 빠르게', note: '입자가 덜 벌어지고 1 m 넘게 뻗어 타격의 선이 남습니다. 파문은 잘게 떨며 빠르게 지나갑니다.', spray: { n: 120, range: 1.05, flare: 0.28 }, wave: { speed: 4.2, last: 0.3, width: 0.1, sway: 0.024 } }
];
/* struck: which of the two is hit (the camera is pulled onto him); body: the spray comes off the trunk where the punch met
   it (the hit's e.trunk), at 0.6 of a blow to the head's amount and reach; shake: the picture's jolt at a knockdown */
export const FX_SCENES = [
  { entry: 'hit-cross', title: '스트레이트 (머리)', view: { yaw: 0.3, pitch: 0.14 }, struck: 0 },
  /* (the plan's yaw was 1.3, the catalogue card's: at the effect's close framing on the struck man that puts the other man's
     back between the camera and the trunk, so the scene is seen from the struck man's open side instead) */
  { entry: 'body-liver', title: '리버 훅 (몸통)', view: { yaw: 2.4, pitch: 0.14 }, struck: 0, body: true },
  { entry: 'down-back', title: '다운', view: { yaw: 0.5, pitch: 0.14 }, struck: 0, shake: 5 }
];
const fxRows = FX_SCENES.map((s, i) => ({
  title: s.title,
  rows: [['now', 'base'], ['wide', 'long']].map(pair =>
    pair.map(v => ({ entry: s.entry, scene: i, version: v, view: s.view, kind: 'fx', say: VERSIONS.find(x => x.id === v).name }))
  )
}));

/* ---- the four comparison pairs' numbers, as tools/pending.mjs measured them */
const GRADES = ['1', '2', '3', '4m', '4a', '5m', '5a'];
const SHOWN = { 1: '1', 2: '2', 3: '3', '4m': '4명', '4a': '4암', '5m': '5명', '5a': '5암' };
const LIVER_PLAN = { 1: '20~28 N·s', 2: '55~65', 3: '85~95, 0.19~0.20 s', '4m': '**100~110**', '4a': '95~105', '5m': '**110~120**', '5a': '105~115' };
const liverCell = (r, fast) => (r ? `${f1(r.J)} · ${f0(r.ms)} ms${fast ? ` · ${f1(r.speed)} m/s` : ''}` : '–');
const liverRows = GRADES.map(lv => [SHOWN[lv], LIVER_PLAN[lv], liverCell(at(N, 'liver', 'ladder', lv, 'now'), ['3', '4m', '5m'].includes(lv)), liverCell(at(N, 'liver', 'ladder', lv, 'tuned'))]).concat([['리버 다운의 기준', '70 N·s', '70', '70 (바꾸지 않음)']]);
const shapeOf = k => at(N, 'cross', 'shape', k) || {};
const SHAPE_ROWS = [
  ['뒷팔 아래팔, 수직에서', '15° 안', s => `${f1(s.tilt)}°`],
  ['뒷 글러브 ↔ 머리 가운데', '21 cm (시험 23 cm 안)', s => `${f1(s.rearDist)} cm`],
  ['뒷 글러브, 머리 가운데 아래로', '턱 (시험 5~13 cm)', s => `${f1(s.rearUnder)} cm`],
  ['뒷 글러브 높이', '1.50 m', s => (s.rearGloveY === undefined ? '–' : `${(s.rearGloveY / 100).toFixed(2)} m`)],
  ['뒷팔꿈치 높이', '1.10 m', s => (s.rearElbowY === undefined ? '–' : `${(s.rearElbowY / 100).toFixed(2)} m`)],
  ['앞팔, 수평에서', '±10° (시험 12°)', s => `${f1(s.level)}°`],
  ['앞 글러브 높이', '1.14 m', s => (s.leadY === undefined ? '–' : `${(s.leadY / 100).toFixed(2)} m`)],
  ['어깨 표 위반', '0', s => f1(s.zone)]
];
const PD = at(N, 'parryDown') || {};
const per100 = (lv, k, n) => f1(at(PD, n ? 'n' + n : 'per100', lv, k));
const SAID_PD = { down: '눌러 내림', block: '블록', hit: '맞음', parry: '패리', whiff: '빗나감', none: '–' };
const frameRow = (lv, gap) => {
  const r = at(PD, 'frames', lv, String(gap));
  if (!r) return '–';
  // runs of the same outcome, as the plan wrote them: 눌러 내림 ×6 / 블록
  const runs = [];
  for (const x of r) runs.length && runs[runs.length - 1][0] === x ? runs[runs.length - 1][1]++ : runs.push([x, 1]);
  return runs.map(([x, n]) => SAID_PD[x] + (n > 1 ? ` ×${n}` : '')).join(' / ');
};

/* ---- the items */
export const ITEMS = [
  // ===== 5. what the work of 2026-11-23 left open (no cards)
  ...[
    ['fx-twice', '다운 타격의 용암을 두 번 쏘기: 간격과 양',
      '지시대로 두 번 잇달아 쏩니다. 간격은 0.05초로 만들었다가 0.1초로 바꿨습니다(0.05초는 제 속도 화면에서 한 덩어리로 보였고, 0.1초는 첫 발이 퍼진 뒤 둘째 발이 터져 둘로 읽힙니다). 두 발 모두 채택한 수 그대로라 합쳐 두 배입니다(기준 타격에 덩이 11·불티 18씩). 가장 센 타격(2.2배)에서는 덩이 48·불티 80으로 번잡합니다.',
      [['keep', '0.1초, 두 발 모두 전량', '지금 그대로.'], ['half', '0.1초, 둘째 발은 절반', '둘째 발을 절반으로(센 타격에서 덜 번잡).'], ['split', '0.1초, 나눠 쏘기', '채택한 수를 둘로 나눠 합이 그대로.'], ['fast', '0.05초로 되돌림', '더 빠르지만 슬로가 아니면 한 덩어리로 보입니다.']],
      'keep', '둘로 읽히는 가장 짧은 간격입니다. 센 타격의 번잡함이 거슬리면 "둘째 발은 절반"을 권합니다.'],
    ['fx-ground-ring-game', '게임 화면의 바닥 고리 파문',
      '다운의 바닥 고리 파문이 카탈로그·시안·검토 시트의 타일 바닥에서는 잘 보이지만, 게임의 링 캔버스에서는 약합니다. 캔버스가 두껍게 겹친 입자라, 들어 올린 부분이 앞 입자에 가려 점처럼만 보입니다(3 cm 들림에서 918픽셀 차이).',
      [['bias', '밝힌 입자를 앞에 그림', '작은 수정. 고리의 밝은 띠가 가려지지 않게 합니다.'], ['rebake', '캔버스를 납작한 입자로 다시 만듦', '더 확실하지만 바닥 전체의 모양이 조금 바뀝니다.'], ['keep', '그대로', '게임에서는 약한 채로 둡니다.']],
      'bias', '작은 수정으로 먼저 해 보고, 모자라면 다시 만드는 쪽으로 갑니다.'],
    ['fx-defence-amount', '방어 이펙트를 얼마나 줄일지',
      '지금: 막음은 글러브가 만난 곳에 불꽃 4개(흰색·파랑), 패리는 불꽃 14개(흰색·노랑·호박)와 화면 흰빛, 피하기·숄더 롤·커버는 그림이 없습니다. 제안은 "공격은 튀는 것과 파문, 방어는 선과 작은 파문"입니다: 막은 팔뚝에 작은 파문, 쳐낸 주먹의 꺾인 궤적 선, 크기는 막은 충격량에 비례, 잽의 타격 효과보다 크지 않게.',
      [['lines-sparks', '선과 파문 + 불꽃 조금', '막음 0~2개, 패리 3~4개(쳐낸 방향으로).'], ['lines', '선과 파문만', '불꽃 없음.'], ['keep-no-white', '지금 불꽃에서 흰색만 뺌', '모양은 그대로, 흰색과 화면 흰빛만 없앱니다.']],
      'lines-sparks', '막음과 패리가 눈으로 갈리고, 타격보다 작게 읽힙니다.'],
    ['fx-defence-evade', '닿지 않은 피하기의 그림',
      '슬립·더킹·위빙·스웨이 백으로 주먹이 빗나갈 때는 지금 아무것도 그리지 않습니다.',
      [['wind-line', '스친 주먹에만 바람 선', '6 cm 안으로 스친 주먹의 길에 가는 선. 가까울수록 선명하고 멀리 빗나가면 없음.'], ['none', '그리지 않음', '지금 그대로.']],
      'wind-line', '아슬아슬하게 피한 것만 보이게 됩니다.'],
    ['fx-parry-white', '패리의 화면 흰빛',
      '타격의 흰 번쩍임은 모두 지웠는데, 패리 때 화면 전체의 흰빛(0.25)은 남아 있습니다.',
      [['remove', '없앰', '타격 쪽과 맞춥니다.'], ['keep', '둠', '패리의 신호로 남깁니다.']],
      'remove', '"흰 번쩍임 없이"라는 앞선 지시와 맞습니다.'],
    ['fx-brilliant-game', '기막힌 수비의 게임 안 표시',
      '기막힌 수비(아주 가깝게 피하거나 쳐내고 바로 받아친 것)는 카탈로그에서만 리플레이로 보이고, 게임 안에는 표시가 없습니다.',
      [['slow', '아주 짧은 슬로', '0.1초쯤, 다운의 슬로보다 훨씬 짧게.'], ['line', '바람 선만 더 선명하게', '슬로 없이.'], ['none', '표시 없음', '지금 그대로.']],
      'slow', '드문 장면이라 짧게 짚어 줄 만합니다.'],
    ['order-memo-first', '단계의 순서',
      '모션 카탈로그의 메모 27건이 아직 동작에 없습니다. 메모가 걸린 단계(M → N → P → Q → R → S → U → V)를 새 소스의 단계(도약 훅, 소스 A·B, 콤보)보다 먼저 하는 것으로 진행 중입니다. M·N·U·V는 지금 나란히 돌고 있습니다.',
      [['memo-first', '메모 단계 먼저', '지금 진행 중인 방식.'], ['leap-after-n', '도약 훅은 N 바로 뒤', '원래 계획대로 도약 훅을 주먹의 허리(N) 다음에.'], ['combos-early', '콤보를 앞당김', '기본 콤보와 같은 손 훅 → 바디를 N 다음에 바로.']],
      'memo-first', '메모가 가장 오래 기다렸습니다.'],
    ['pivot-kind', '피벗(인사이드·아웃사이드)을 어떻게 줄지',
      '소스 B의 피벗은 원투 뒤에 앞발을 디디고 돌아 상대의 옆을 잡는 동작입니다(단계 R2, 팔방 위치 시스템 위에서).',
      [['technique', '고르는 기술', '로드아웃 1칸. 4·5단계가 갖고, 5단계의 기본 로드아웃에 넣습니다.'], ['basic', '4단계 이상의 기본 동작', '누구나 등급만 되면 씁니다.']],
      'technique', '옆을 잡는 것은 선수의 색이 되는 기술입니다.'],
    ['block-return', '막고 받아치기',
      '지금은 주먹을 친 뒤 0.45~0.67초 동안 가드도 못 올리고, 상대도 그 틈을 따로 노리지 않습니다. 이탈(빠지기)을 넣으면 그 틈을 벌하는 "막고 받아치기"가 같이 있어야 뜻이 있습니다. 넣으면 시합의 결과가 지금과 달라집니다.',
      [['all-from-3', '3단계부터 모두', '머리로 온 주먹을 막은 뒤 0.25초 안의 반격.'], ['attribute', '카운터 능력치에만', '능력치가 높은 선수만.']],
      'all-from-3', '이것이 없으면 빠지는 동작의 값이 없습니다.'],
    ['source-a-script', '소스 A의 12박을 약속 대련의 첫 대본으로',
      '소스 A의 섀도 콤비네이션(잽·바디·훅·블록·어퍼·훅·위빙·스트레이트·훅·스트레이트·캐치·스트레이트)은 수비 박자에 상대의 주먹이 필요해서 카탈로그 카드로는 만들지 않았습니다.',
      [['yes', '만듦', '약속 대련 단계(Z)의 첫 대본으로.'], ['no', '만들지 않음', '동작의 재료로만 씁니다.']],
      'yes', '약속 대련의 틀을 시험하기에 알맞은 길이입니다.'],
    ['waist-counter-gain', '장전된 반격이 빨라지는 한도',
      '수비가 허리를 감아 두면 반격의 감기 시간이 줄어듭니다. 재 보니 얻을 것이 있는 것은 3~4단계의 훅·어퍼(남은 감기 23~98 ms)이고, 5단계와 4명의 스트레이트는 이미 거의 0입니다.',
      [['one', '1프레임까지', '어느 반격도 1프레임 넘게 빨라지지 않습니다.'], ['two-g3', '3단계의 훅·어퍼는 2프레임', '낮은 등급의 장전이 더 뚜렷해지지만 균형이 움직입니다.']],
      'one', '균형은 단계 X에서 한 번에 봅니다.'],
    ['waist-combo-coil', '콤비네이션의 감기 시간',
      '콤비네이션의 되감기(앞 주먹의 끝이 다음 주먹의 감기)는 지금 계획으로는 순서와 그림만 바꾸고 주먹 사이의 간격은 그대로 둡니다(±1프레임).',
      [['keep', '간격은 그대로', '그림과 순서만.'], ['shorten', '간격도 줄임', '주먹 사이가 1~3프레임 짧아집니다(기존 주먹의 ±1프레임 규칙을 넘음).']],
      'keep', '간격을 줄이면 회피 구간과 균형을 다시 재야 합니다.'],
    ['chain-row', '카탈로그에 체인 카드',
      '스트레이트 → 훅 → 어퍼의 체인을 보여 주는 카드가 지금 없습니다. 되감기를 넣기 전에 기준을 재려면 먼저 있어야 합니다.',
      [['add', '넣음', '일곱 등급의 한 줄.'], ['no', '넣지 않음', '시험에서만 잽니다.']],
      'add', '콤비네이션 부를 만들 때 어차피 필요합니다.'],
    ['pull-cross-power', '풀백 → 스트레이트의 세기',
      '4·5단계의 풀백 카운터 스트레이트가 지금 67 / 61 N·s로 3단계(88)보다 약합니다. 반격을 누르는 순간 허리가 반대로 감겨 있기 때문입니다. 바로잡으면 "기존 주먹 ±6%" 규칙을 넘어 오릅니다.',
      [['accept', '오르는 것을 받아들임', '3단계의 88 N·s까지.'], ['hold', '±6% 안에 묶음', '허리의 몫을 줄여 지금 세기 근처에 둡니다.']],
      'accept', '등급이 높을수록 약한 지금이 이상합니다.'],
    ['liver-waist-way', '리버에 맞을 때 허리가 감기는 쪽',
      '바디에 맞으면 앞으로만 접히던 것을, 허리가 돌며 접히게 합니다.',
      [['toward', '맞은 쪽으로 감김', '맞은 옆구리를 감싸듯.'], ['away', '주먹이 미는 쪽으로', '맞은 힘대로 돌아갑니다.']],
      'toward', '아픈 곳을 감싸는 쪽이 리버 다운으로 자연스럽게 이어집니다.'],
    ['fall-unscripted', '대본 밖의 쓰러짐',
      '별도 점검에서, 대본의 쓰러짐 일곱은 깨끗하지만 임의의 타격에서 나오는 쓰러짐 1,680개 가운데 1,624개가 무엇인가를 깹니다(발목 꺾임, 무릎이 180°까지 뒤집힘, 26.9 g로 튀어 오름). 실제 시합의 다운은 임의의 타격에서 나옵니다. 지금 V 단계는 메모 셋과 K에서 넘긴 것만 다룹니다.',
      [['own-stage', '따로 단계로', 'V 뒤에 쓰러짐 풀이 전반을 손보는 단계를 둡니다.'], ['within-v', 'V 안에서 되는 만큼', '따로 단계는 두지 않습니다.'], ['later', '나중에', '약속 대련까지 미룹니다.']],
      'own-stage', '시합에서 보이는 다운의 대부분이 여기에 걸려 있습니다.']    ,
    ['bearing-side', '팔방: "옆을 잡는다"의 기준',
      '팔방 위치 시스템의 기획(`docs/bearing-system-plan.md`)에서, 타이슨 시프트는 지금 0.5칸(22~23°)만 돕니다. 한 걸음으로는 다리 길이가 모자라고, 두 걸음으로 4명 72°·5명 76°(옆 칸 안)까지 갈 수 있다고 셈했습니다. 꼭 90°(상대의 바로 옆)가 되려면 세 번째 걸음이 필요하고 바디 훅이 0.10초 늦어집니다.',
      [['cell', '옆 칸에 들어가면 됨 (72~76°)', '두 걸음. 67.5°를 넘으면 옆 칸입니다.'], ['ninety', '90°까지', '세 걸음, 훅이 0.10초 늦음.']],
      'cell', '바디 훅이 팔꿈치를 지나기 시작하는 것이 45~67.5° 사이라, 옆 칸에 들면 이득이 생깁니다.'],
    ['bearing-pinned', '팔방: 묶인 발은 돌지 못하게',
      '각을 잡아도 지금은 서 있는 3단계 이상의 상대가 0.07~0.17초에 돌아 버려, 어떤 동작도 칸을 지키지 못합니다. 제안: 읽는 지연(등급별 0.05~0.30초), 묶인 발은 돌지 못함(스턴, 그리고 주먹을 막은 직후의 짧은 시간), 가드를 든 채로는 절반 속도. 이것은 새 규칙이라 시합의 균형이 움직입니다.',
      [['pinned', '묶인 발은 아예 못 돎', '맞거나 막은 직후에는 옆을 내줍니다(3단계 0.35~0.45초).'], ['slowed', '느리게만', '지금의 배율(스턴 0.2, 주먹 중 0.35)을 유지. 3단계는 옆 칸을 내주지 않고 50°쯤까지만.']],
      'pinned', '맞히거나 막게 만든 쪽이 각을 얻는 것이 읽기 쉽습니다. 읽고 서 있는 상대는 지금처럼 아무것도 내주지 않습니다.'],
    ['bearing-wave-speed', '팔방: 파도의 "빠르게"',
      '파도는 지금 한 칸에 1.5초가 걸립니다(둘레 0.86 m/s). 걷기만으로도 2.1~2.3 m/s로 돌 수 있어, 파도가 느린 것은 그 걸음새 때문입니다.',
      [['walk', '걷기 빠르기', '두 칸 1.2~1.4초, 네 칸 2.3~2.8초(1.8~2.2 m/s).'], ['dash', '대시 빠르기', '두 칸 0.6초쯤. 뜀이 커지고 숨이 많이 듭니다.']],
      'walk', '점검에 걸리지 않고 지금 엔진으로 닿는 빠르기입니다.'],
    ['bearing-names', '팔방: 칸의 이름',
      '상대의 정면을 0으로, 앞손 쪽이 +, 뒷손 쪽이 −입니다: 정면, 앞손 사선, 앞손 옆, 앞손 뒤, 등 뒤, 뒷손 뒤, 뒷손 옆, 뒷손 사선.',
      [['hands', '앞손 / 뒷손', '상대의 어느 손 쪽인지로.'], ['sides', '바깥 / 안', '복싱의 말(아웃사이드 / 인사이드)로.']],
      'hands', '화면을 보고 바로 알 수 있습니다.'],
    ['bearing-hud', '팔방: 게임 화면의 발밑 고리',
      '게임 화면에 상대의 발밑에 여덟 칸의 고리를 그려 지금 어느 칸에 있는지 보일 수 있습니다. 카탈로그에는 위에서 본 그림을 넣습니다.',
      [['none', '그리지 않음', '카탈로그와 검토 시트에서만.'], ['ring', '고리를 그림', '옅게, 칸을 잡은 동안만.']],
      'none', '먼저 카탈로그에서 보고 정합니다.'],
    ['bearing-dark-side', '팔방: 암이 뒷손 쪽으로 도는 것',
      '뒷손 쪽(−)은 상대의 모든 주먹이 닿는 쪽이지만 리버가 열리는 쪽입니다. 앞손 쪽(+)은 상대의 주먹이 거의 닿지 않는 쪽입니다.',
      [['yes', '암은 뒷손 쪽을 고름', '위험을 지고 리버를 노리는 색.'], ['no', '모두 앞손 쪽', '안전한 쪽으로만.']],
      'yes', '명과 암이 도는 쪽으로도 갈립니다.']
  ].map(([id, title, state, options, recommend, why]) => ({ id, part: 5, title, state, options: options.map(([oid, name, says]) => ({ id: oid, name, says })), recommend, why })),

  // ===== 1. what is left to build
  {
    id: 'impl-final-integration', part: 1, title: 'I 최종 통합',
    state: '5차 기획 §5의 마지막 단계. 카탈로그 전 행 점검(H2의 "크로스암 · 바디", "숄더 롤 & 카운터"까지 게시), 회피 구간 재측정, 승률 점검, README 마무리가 남았습니다. 게시된 모션 카탈로그는 H2 반영 전입니다.',
    tables: [{ head: ['', '기획', '현재'], rows: [
      ['카탈로그 새 장', '83장 + 대체 1장 (§5)', '대본은 모두 있음. 게시본은 H2의 19장(크로스암 · 바디 15, 숄더 롤 & 카운터 4)이 빠져 있음'],
      ['회피 구간', '`node tools/windows.mjs --grades --write`로 다시 잼', '마지막으로 쓴 때는 알 수 없음(`src/windows.data.mjs`)'],
      ['승률 점검', '기술 하나가 같은 능력치에서 승률 65%를 넘기면 보고 (`tools/balance.mjs`)', '`tools/balance.mjs`는 능력치만 바꿔 싸움. 기술을 주고 빼는 인자가 없음'],
      ['검증', '테스트·feel·audit 통과', '328/328, 10/10, 447 장면(예외는 다운 착지뿐)']
    ] }],
    options: [
      { id: 'go', name: '지금 진행', says: '2부의 결정과 무관한 부분이라 먼저 끝낼 수 있습니다.' },
      { id: 'after-decisions', name: '결정 뒤에 한 번에', says: '2부의 결정(리버 훅, 다운패링)을 반영한 뒤 한 번에. 승률을 한 번만 잽니다.' },
      { id: 'hold', name: '보류', says: '지금은 하지 않습니다.' }
    ],
    recommend: 'after-decisions', why: '리버 훅을 낮추면 승률과 다운 수가 다시 바뀌어, 먼저 재면 두 번 잽니다.'
  },
  {
    id: 'impl-fx-attach', part: 1, title: '타격 이펙트를 본편과 카탈로그에 붙이기',
    state: '정해짐 · 단계 J에서 붙였습니다(6차 기획 §2, `src/render/blow.mjs`): 본편·모션 카탈로그·이 페이지의 기본 카드·리뷰 시트가 같은 함수로 그립니다. 색 입자는 그대로, 시작점은 타격선이 맞은 몸을 빠져나가는 반대쪽 면, 맞은 선수의 윤곽 밖에서만 보임. 흰 번쩍임 대신 파문. 아래 표는 결정 전의 기록입니다.',
    tables: [{ head: ['', '기획', '현재'], rows: [
      ['본편(`index.html`)의 타격', '땀 분사 + 파문', '색 입자 + 흰 번쩍임'],
      ['카탈로그의 타격', '같음', '색 입자 + 흰 번쩍임'],
      ['바디샷의 양', '머리의 60% (§3.6)', '렌더러에 있음, 화면에는 아직']
    ] }],
    options: [
      { id: 'both', name: '둘 다', says: '본편과 카탈로그 둘 다.' },
      { id: 'game-only', name: '본편만', says: '카탈로그는 자세를 보는 곳이라 지금 것을 유지합니다.' },
      { id: 'hold', name: '보류', says: '지금은 하지 않습니다.' }
    ],
    recommend: 'both', why: '타격 이펙트 버전이 정해져야 시작합니다.'
  },

  // ===== 2. waiting on a decision
  {
    id: 'fx-version', part: 2, title: '타격 이펙트 버전', pairNo: 1,
    state: '정해짐 · 사용자 지시(6차 기획 D3·D4): A/B/C가 아니라 지금의 색 입자를 반대쪽 면에서, 흰 번쩍임 대신 시안 A의 파문으로. 단계 J에서 붙였습니다. 아래 네 장은 결정 전 비교 그대로입니다(같은 대본, 같은 시드, 한 시계; 카메라는 맞는 사람 쪽으로 당긴 구도).',
    tables: [{ head: ['85 N·s의 타격', '지금', 'A 기본', 'B 크고 느리게', 'C 잘고 빠르게'], rows: [
      ['입자 수', '17 + 11 불꽃', ...VERSIONS.slice(1).map(v => String(v.spray.n))],
      ['뻗는 거리', '–', ...VERSIONS.slice(1).map(v => `${v.spray.range.toFixed(2)} m`)],
      ['벌어짐 `flare`', '–', ...VERSIONS.slice(1).map(v => String(v.spray.flare))],
      ['파문 속도 · 길이', '흰 번쩍임', ...VERSIONS.slice(1).map(v => `${v.wave.speed} m/s · ${v.wave.last.toFixed(2)} s`)],
      ['파문 폭 · 흔들림', '–', ...VERSIONS.slice(1).map(v => `${Math.round(v.wave.width * 100)} cm · ${(v.wave.sway * 100).toFixed(1)} cm`)]
    ] }],
    groups: fxRows,
    options: [
      { id: 'a', name: 'A 기본', says: '무난하고, 타격 방향이 읽힙니다.' },
      { id: 'b', name: 'B 크고 느리게', says: '크게 보이지만 화면이 붐빕니다.' },
      { id: 'c', name: 'C 잘고 빠르게', says: '타격의 선이 남고 가볍습니다.' },
      { id: 'mix', name: '조합', says: '입자와 파문을 따로. 메모에 "입자 A + 파문 C"처럼 적습니다.' }
    ],
    recommend: 'a', why: '약한 주먹과 센 주먹의 차이가 입자 수와 거리로 가장 고르게 드러납니다. B는 잽에도 화면이 가려지고, C는 다운에서 약해 보입니다(기획자의 판단이고 잰 값이 아닙니다).'
  },
  {
    id: 'loadout-slots', part: 2, title: '로드아웃 칸 수',
    state: '`src/game/profile.mjs`의 `SLOTS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 }`. 가장 높은 등급이 칸 수를 정합니다. 기획자가 정한 값이고 사용자의 확인이 없습니다.',
    tables: [{ head: ['가장 높은 등급', '기획 (§7.1)', '현재'], rows: [['1, 2', '적혀 있지 않음', '1칸'], ['3', '2칸', '2칸'], ['4', '4칸', '4칸'], ['5', '6칸', '6칸']] }],
    options: [
      { id: 'keep', name: '그대로', says: '1/1/2/4/6.' },
      { id: 'tight', name: '좁게', says: '1/1/2/3/4. 5단계도 기술을 골라야 합니다(기술이 여덟 개라 6칸이면 거의 다 듭니다).' },
      { id: 'open', name: '칸 없음', says: '등급이 여는 것을 모두. 고르는 재미가 없어집니다.' }
    ],
    recommend: 'keep', why: '승률 점검(I) 전에는 바꿀 근거가 없습니다.'
  },
  {
    id: 'loadout-default', part: 2, title: '기본 로드아웃',
    state: '목록을 주지 않으면 등급에서 나옵니다. 3·4명·5명은 풀백 3형제, 4암·5암은 풀백 3형제 + 크로스암 가드. 1·2는 없음.',
    tables: [{ head: ['', '기획 (§7.1)', '현재'], rows: [
      ['1, 2', '없음', '없음'],
      ['3, 4명, 5명', '풀백 3형제', '풀백 3형제'],
      ['4암, 5암', '풀백 3형제 + 크로스암', '같음'],
      ['L 전용 다섯(파도, 다운패링, 블록 & 파이어, 셸, 시프트)과 숄더 롤 & 카운터', '기본에 없음', '기본에 없음(시합에 주어야 나옴)']
    ] }],
    options: [
      { id: 'keep', name: '그대로', says: '지금의 기본 로드아웃을 둡니다.' },
      { id: 'l-one', name: 'L 전용 하나', says: '4명·5명에게 L 전용 하나(다운패링)를 기본으로 더합니다. 지금 시합에서는 L 전용 기술이 하나도 안 나옵니다.' },
      { id: 'l-all', name: 'L 전용 모두', says: '4명·5명에게 칸이 차는 만큼 모두. 기본 시합이 크게 바뀌어 같은 시드의 결과가 전부 달라집니다.' }
    ],
    recommend: 'keep', why: 'L 전용 하나는 다운패링 가드 타이밍의 결정 뒤에 다시 볼 만합니다.'
  },
  {
    id: 'shift-order', part: 2, title: '타이슨 시프트의 주먹 순서',
    state: '뒷손 스트레이트 → (시프트) → 왼손 바디 훅 → 오른손 어퍼. G2에서 영상의 경기 장면을 프레임마다 다시 보아도 같은 순서로 읽혔습니다. 원본 영상은 이전 세션의 업로드에만 있었습니다.',
    tables: [{ head: ['', '기획 (§7.5)', '현재'], rows: [
      ['순서', '스트레이트 → 바디 훅 → 어퍼', '같음'],
      ['첫 주먹 → 바디 훅', '알 수 없음(§4.4를 이번에 다시 읽지 않음)', '서서 시작한 것이 셸에서 시작한 것(4명 0.30초, 5명 0.25초)보다 50~70 ms 느림']
    ] }],
    groups: [{ rows: [[{ image: 'docs/ref/tyson-shift.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'shift@4m', kind: 'tag', say: '타이슨 시프트 4명: 스트레이트 → 바디 훅 → 어퍼' }]] }],
    options: [
      { id: 'keep', name: '그대로', says: '스트레이트 → 바디 훅 → 어퍼.' },
      { id: 'recheck', name: '다시 잼', says: '영상을 다시 올려 받아 프레임 단위로 다시 잽니다.' },
      { id: 'hook-head', name: '머리 훅으로', says: '둘째 주먹을 머리 훅으로(영상을 다르게 읽는 경우). 바디 훅 뒤 어퍼의 "앞으로 나온 머리"가 없어집니다.' }
    ],
    recommend: 'keep'
  },
  {
    id: 'parrydown-5l-jab', part: 2, title: '5명 다운패링의 동시 잽',
    state: '4명은 내린 손의 스트레이트(영상 그대로), 5명은 내리는 것과 앞손 잽이 같이 나가고 스트레이트가 뒤따릅니다. 5명의 잽은 영상에 없고 기획자가 더한 차이입니다.',
    tables: [{ head: ['', '기획 (§4.2)', '현재'], rows: [
      ['4명: 닿은 뒤 스트레이트', '0.23 s (시험 0.18~0.28)', '시험 범위 안'],
      ['5명: 닿은 뒤 잽', '0.08~0.10 s (시험 0.06~0.12)', '시험 범위 안'],
      ['5명: 이어지는 스트레이트', '0.25 s', '알 수 없음(이번에 재지 않음)'],
      ['내리는 거리', '4명 16 cm, 5명 9 cm', '같음']
    ] }],
    groups: [{ rows: [[{ entry: 'parryDown@4m', kind: 'pd', say: '4명: 내린 손의 스트레이트' }, { entry: 'parryDown@5m', kind: 'pd', say: '5명: 동시 잽, 이어서 스트레이트' }]] }],
    options: [
      { id: 'keep', name: '그대로', says: '5명의 동시 잽을 둡니다. 4명과 5명이 눈으로 갈립니다.' },
      { id: 'same', name: '5명도 스트레이트만', says: '4명처럼 스트레이트만, 더 빨리. 영상에 충실하고 등급 차이는 시간뿐입니다.' },
      { id: 'jab-only', name: '5명은 잽만', says: '가볍고 빠르지만 반격이 약합니다.' }
    ],
    recommend: 'keep'
  },
  {
    id: 'liver-hook-power', part: 2, title: '리버 훅 세기', pairNo: 2,
    state: '4·5단계의 리버 훅이 기획보다 25~35% 셉니다. 같은 시드 36경기에서 다운 66번 가운데 리버 다운이 44번입니다. 간에 70 N·s 이상이면 리버 다운이라(`RULES.body.liver`), 4·5단계의 리버 훅은 맞으면 늘 다운입니다.',
    notes: [
      '**원인.** 등급의 표가 아니라 **닿는 프레임**입니다. 4·5단계의 훅은 한 프레임 일찍(누른 뒤 183 ms) 닿는데, 그 프레임은 휘두르는 길에서 글러브가 가장 빠른 순간입니다(18~20 m/s). 3단계는 한 프레임 뒤(200 ms), 12 m/s로 닿습니다. 등급의 `chain.amp`·`firm`·`early`를 3단계 값으로 내려도 4명은 130~138 N·s에 머뭅니다(기획 때 잰 값: `amp` 1 → 132.8, `firm` 1 → 130.1, `early` 0 → 138.5).',
      '**손잡이.** `MOVES.hookBody.land`(몸통이 얼마나 돌았을 때 간에 오도록 길을 잡는가). 지금 `0.7`, 조정안 **`0.76`**. 닿는 것이 한 프레임 뒤, 휘두름의 끝자락이 됩니다.',
      '다른 값(기획 때 잰 것): `land` 0.72는 4명만(99.7), 0.74는 4명·4암만 내려가고 5단계는 그대로(161.6). 0.78 이상은 2단계가 51.8로 떨어져 기획(55~65) 아래입니다. `chain.firm`을 곱하는 길(0.8: 4명 116, 5명 137, 3단계 72)은 3단계까지 같이 내려가서 버렸습니다.',
      '조정안을 저장소 사본에 넣고 `npm test`를 돌리면 327/328(기획 때): 떨어진 하나는 `tests/body.test.mjs`의 풀백 카운터 시합 시험(시드 4의 시합에서 풀백이 3번 이상 나와야 하는데 2번: 시합의 전개가 달라져서입니다).'
    ],
    tables: [{ head: ['등급', '기획 (§3.7)', '현재 (`land` 0.7)', '조정안 (`land` 0.76)'], rows: liverRows }],
    groups: [{ rows: [
      [{ entry: 'hookBody@4m', kind: 'liver', key: 'liver.4m.now', band: [100, 110], say: '4명 · 지금 (`land` 0.7)' }, { entry: 'hookBody@4m', kind: 'liver', key: 'liver.4m.land', band: [100, 110], tune: TUNES.land, say: '4명 · 조정안 (`land` 0.76)' }],
      [{ entry: 'hookBody@5m', kind: 'liver', key: 'liver.5m.now', band: [110, 120], say: '5명 · 지금 (`land` 0.7)' }, { entry: 'hookBody@5m', kind: 'liver', key: 'liver.5m.land', band: [110, 120], tune: TUNES.land, say: '5명 · 조정안 (`land` 0.76)' }]
    ] }],
    options: [
      { id: 'keep', name: '그대로', says: '리버 다운이 다운의 3분의 2인 채로 둡니다.' },
      { id: 'land', name: '`land` 0.76', says: `\`MOVES.hookBody.land\` 0.76. 4명 ${f1(at(N, 'liver', 'ladder', '4m', 'tuned', 'J'))}, 5명 ${f1(at(N, 'liver', 'ladder', '5m', 'tuned', 'J'))} N·s. 여전히 70을 넘어 맞으면 다운입니다. 시합 시험 하나를 다시 맞춰야 합니다.` },
      { id: 'land-liver', name: '`land` 0.76 + 기준 90', says: `리버 다운의 기준을 70 → 90 N·s로(\`RULES.body.liver\`). 3단계의 리버 훅(${f1(at(N, 'liver', 'ladder', '3', 'tuned', 'J'))})은 한 방에 다운을 내지 못하고 쌓여야(10초에 150) 냅니다. 다운 수가 가장 많이 줄어듭니다(얼마나는 재지 않음).` },
      { id: 'liver-only', name: '기준만 올림', says: '세기는 두고 기준만 올립니다. 4·5단계는 그대로 한 방입니다.' }
    ],
    recommend: 'land', why: '기획의 범위에 드는 값이 손잡이 하나로 나오고 3단계 이하는 거의 그대로입니다. 다운의 비율이 그래도 높으면 그때 기준도 올립니다.'
  },
  {
    id: 'parrydown-timing', part: 2, title: '다운패링 가드 타이밍', pairNo: 3,
    state: '시합에서 드뭅니다(F 단계에서 잰 값: 잽 100개에 4명 2.9번, 5명 3.3번). 다운패링의 가드는 상대 잽의 몸통 관절이 발사된 스텝(`on[2]`)에 올라가, 누른 뒤 +3프레임입니다(보통 패리와 같은 때). 프로의 잽은 +6에 닿습니다.',
    notes: [
      '**왜 낮은가.** 세 가지가 곱해집니다. (1) 고르는 몫이 작습니다: 패리의 60%. (2) 고른 것의 4분의 1~3분의 1은 가드가 "막 올린" 것이 되지 못합니다(이미 올라가 있거나, 주먹을 내는 중이거나, 경직). (3) +3은 구간의 끝입니다. 아래 표는 서서 던진 잽에 대해 가드를 올린 프레임별 결과입니다.',
      '**조정안.** 다운패링만, 읽는 관절을 앞당깁니다(보통 패리는 그대로). 4명은 그대로 `on[2]`, 5명은 다리 발사 `on[0]` → +1프레임(전설은 발에서 읽는다). 코드: `control: s => ({ cover: gradeOf(s.me.skills, \'parryDown\').grade === 5 ? !!s.coming && !!s.coming.chain.on[0] : s.soon, tech: \'parryDown\' })`.',
      `**주의.** 시합의 비율은 시드 ${PD.n || 36}개로 잰 것이라 ±1 안팎은 가리지 못합니다(가드 타이밍이 바뀌면 시합 자체가 달라져 잽의 수도 달라집니다). "지금" 값은 F 단계의 값(2.9, 3.3)과 다릅니다: F 단계의 시합 구성이 저장소에 남아 있지 않아 같은 조건을 맞추지 못했습니다. 목표: 5명 5~6번, 4명은 지금 값 유지.`
    ],
    tables: [
      { head: ['거리', '4명: −2 / 0 / +1 / +2 / +3 / +4 / +5', '5명: −2 / 0 / +1 / +2 / +3 / +4 / +5'], rows: ['1.0', '0.9', '0.8'].map(g => [`${g} m`, frameRow('4m', g), frameRow('5m', g)]) },
      { head: [`잽 100개에 눌러 내린 횟수 (시드 ${PD.n || 36}개)`, '지금 `on[2]` (+3)', '`on[1]` (+2)', '`on[0]` (+1)'], rows: ['4m', '5m'].map(lv => [SHOWN[lv], per100(lv, 'now'), per100(lv, 'on1'), per100(lv, 'on0')]) },
      ...(at(PD, 'n108') ? [{ head: ['같은 것을 시드 108개로', '지금 `on[2]`', '`on[0]`', '차이'], rows: ['4m', '5m'].map(lv => [SHOWN[lv], per100(lv, 'now', 108), per100(lv, 'on0', 108), f1(at(PD, 'n108', lv, 'on0') - at(PD, 'n108', lv, 'now'))]) }] : [])
    ],
    refs: [{ href: 'docs/ref/down-parry-counter.jpg', say: '참고: 다운패링 & 카운터 접촉 시트' }],
    groups: [{ rows: [
      [{ entry: 'parryDown@5m', guard: 3, gap: 0.8, kind: 'pd', key: 'pd.5m.3', rate: ['5m', 'now'], say: '5명, 0.8 m · 지금 머리가 누르는 프레임' }, { entry: 'parryDown@5m', guard: 1, gap: 0.8, kind: 'pd', key: 'pd.5m.1', rate: ['5m', 'on0'], say: '5명, 0.8 m · 조정된 프레임' }],
      [{ entry: 'parryDown@4m', guard: 3, kind: 'pd', key: 'pd.4m.3', rate: ['4m', 'now'], say: '4명, 1.0 m · 지금 머리가 누르는 프레임' }, { entry: 'parryDown@4m', guard: 1, kind: 'pd', key: 'pd.4m.1', rate: ['4m', 'on0'], say: '4명, 1.0 m · 앞당긴 프레임(4명은 바꿀 것이 없음)' }]
    ] }],
    options: [
      { id: 'keep', name: '그대로', says: '다운패링은 드문 기술로 남습니다.' },
      { id: 'legend-early', name: '5명만 발에서 읽음', says: `5명만 다리 발사에서 읽습니다. 잽 100개에 5명 ${per100('5m', 'now')} → ${per100('5m', 'on0')}번(시드 36개), ${per100('5m', 'now', 108)} → ${per100('5m', 'on0', 108)}번(시드 108개). 4명과 보통 패리는 그대로입니다.` },
      { id: 'both-early', name: '4명·5명 모두', says: `4명·5명 모두 \`on[0]\`. 4명은 ${per100('4m', 'now')} → ${per100('4m', 'on0')}번(시드 36개), ${per100('4m', 'now', 108)} → ${per100('4m', 'on0', 108)}번(시드 108개): 시드에 따라 방향이 바뀌어, 차이는 소음 안입니다.` },
      { id: 'share', name: '고르는 몫을 올림', says: '타이밍은 두고 패리의 60% → 100%. 고르는 횟수가 1.7배가 되지만 4명·5명의 보통 패리가 사라집니다(§4.2의 "대체하지 않는다"에 어긋남).' }
    ],
    recommend: 'legend-early', why: `기획은 시드 108개로 다시 재어 5명의 차이가 1번 아래면 그대로 두기로 했습니다. 다시 잰 차이는 ${f1(at(PD, 'n108', '5m', 'on0') - at(PD, 'n108', '5m', 'now'))}번입니다.`
  },

  // ===== 3. the engine's limits: where it is not what the plan drew
  {
    id: 'wave-speed', part: 3, title: '파도의 둘레 속도',
    state: '초속 0.86 m로 돕니다. 디딘 발은 캔버스에 붙어 있어야 해서 미끄러지지 못하고, 한 물결에 가는 거리가 발이 벌어지고 모이는 차이(0.75 m)뿐입니다.',
    tables: [{ head: ['', '기획 (§4.1)', '현재'], rows: [
      ['둘레 속도', '1.9~2.2 m/s', '0.86 m/s'],
      ['상대 둘레를 도는 각', '초당 60~75°', '알 수 없음(0.86 m/s와 거리 1.6 m 남짓에서 셈하면 초당 약 31°: 잰 값 아님)'],
      ['주기 (4명)', '0.87 s', '0.87 s'],
      ['거리', '1.55~1.85 m', '1.6 m 남짓']
    ] }],
    groups: [{ rows: [[{ image: 'docs/ref/wave.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'wave@4m', kind: 'wave', say: '파도 4명' }]] }],
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '디딘 발의 미끄러짐을 파도에서만 허용합니다(audit의 "디딘 발 1.2 cm" 규칙에 예외를 하나 더함: 한도를 넓히는 일이라 따로 승인이 필요합니다).' },
      { id: 'drop', name: '목표를 고침', says: '목표를 0.9 m/s로 고쳐 적습니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'faint-hook-twist', part: 3, title: '통나무 · 훅의 몸 회전', pair: 'faint-upper-card',
    state: '넘어가는 동안 몸이 도는 각이 7°, 축 되는 발 바깥날이 몸통 45°까지 캔버스에서 0.75 cm 안.',
    tables: [{ head: ['', '기획 (§1.2)', '현재'], rows: [['몸 회전', '12° (8~16°)', '7°'], ['축 발 바깥날', '0.5 cm 안', '0.75 cm 안'], ['고개 돌림 (85 N·s)', '알 수 없음(§1.2를 이번에 다시 읽지 않음)', '55° (45~65°)']] }],
    card: { entry: 'out-twist', kind: 'tag', say: '실신 · 통나무 · 훅' },
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '밀림의 옆 성분을 키워 다시 잽니다(발이 더 뜰 수 있습니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'faint-upper-card', part: 3, title: '어퍼 실신 카드의 주먹',
    state: '림프 · 어퍼 카드는 4명의 어퍼로 칩니다. 프로(3단계)의 어퍼는 실신의 기준을 넘지 못합니다.',
    tables: [{ head: ['', '기획 (§1.3)', '현재'], rows: [['카드의 주먹', '프로의 어퍼', '4명의 어퍼'], ['실신의 기준', '알 수 없음(이번에 찾지 않음)', '프로의 어퍼가 못 넘김']] }],
    card: { entry: 'out-limp', kind: 'tag', say: '실신 · 림프 · 어퍼 (4명의 어퍼)' },
    options: [
      { id: 'accept', name: '수용', says: '카드의 글에 "4명의 어퍼"라고 적혀 있으면 됩니다.' },
      { id: 'retry', name: '다시 시도', says: '실신의 기준을 어퍼에서만 낮춥니다(시합의 실신 수가 늡니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'weave-low-grades', part: 3, title: '위빙 1·2단계의 구간', pair: 'body-impulse',
    state: '1·2단계가 훅을 다시 피하지만 구간이 기획보다 늦고 좁습니다. 여유는 1 cm 안팎입니다.',
    tables: [{ head: ['', '기획 (§2.3, 예상)', '현재'], rows: [['1단계 구간', '−17~−14 f', '−11~−10 f'], ['2단계 구간', '−12~−10 f', '−11~−9 f'], ['여유', '알 수 없음(예상 표를 이번에 옮기지 않음)', '1 cm 안팎']] }],
    card: { entry: 'roll@1', kind: 'tag', say: '위빙 1단계 (더 좁은 쪽)' },
    options: [
      { id: 'accept', name: '수용', says: '기획의 값은 재기 전의 예상이었습니다.' },
      { id: 'retry', name: '다시 시도', says: '1단계의 내려가는 시간을 줄여 구간을 넓힙니다(1단계가 2단계보다 잘 피하게 될 수 있습니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'body-impulse', part: 3, title: '바디 주먹의 충격량과 명치',
    state: '명치는 가드의 뒷팔꿈치가 덮어 바디 스트레이트만 좁은 틈으로 닿습니다. 바디 스트레이트와 바디 어퍼가 3단계 목표보다 약하고, 뒷손 훅도 조금 약합니다.',
    tables: [{ head: ['3단계', '기획 (§3.3)', '현재'], rows: [['바디 스트레이트', '80~90 N·s', '63'], ['바디 어퍼', '60~70', '58'], ['리버 훅', '85~95', '85 (목표 안)'], ['뒷손 훅', '95~105', '89'], ['바디 어퍼의 머리 하강', '숏 어퍼와 같음', '닿는 순간 0~3 cm(1~3단계)']] }],
    card: { entry: 'crossBody@3', kind: 'tag', say: '바디 스트레이트 3단계 (차이가 가장 큼)' },
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '바디 스트레이트의 `chain.rate`·회전을 올려 80에 맞춥니다(리버 훅 조정과 같이 하면 시합 균형을 한 번에 봅니다).' },
      { id: 'drop', name: '목표를 고침', says: '목표를 잰 값으로 고쳐 적습니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'cross-arm-shape', part: 3, title: '크로스암 모양', pairNo: 4,
    state: '뒷팔의 아래팔이 수직에서 45~50° 기울어 있습니다(기획 15° 안). 가드의 숙임 때문에 머리가 뒷어깨보다 27 cm 앞에 있어, 턱 앞의 글러브까지 아래팔을 세우면 위팔이 닿지 않습니다.',
    notes: [
      '**기하.** 글러브가 어깨와 거의 같은 높이에서 수평으로 40 cm 떨어져 있으면, 그 사이에 매달린 팔꿈치에서 글러브로 가는 아래팔은 48° 기웁니다. 15° 안이 되려면 글러브가 어깨에서 수평 14 cm 안에 있어야 합니다: 몸을 세워 머리를 어깨 위로 가져오지 않으면 안 됩니다. 그래서 기획 모양의 변형은 글러브 자리만이 아니라 숙임(`lean`)을 바꿉니다.',
      '**변형의 값 (`CROSS[\'4a\']`, 4암의 표).** 지금 `R: [0.05, -0.065, -0.005, -0.3]`, `pole.R: [0.2, -1, 0.2]`, `lean: 6`. 변형 가(숙임 그대로): `R: [0.073, -0.052, -0.029, -0.343]`, `pole.R: [-0.392, -1, 0.2]`. 변형 나(몸을 세움, 카드에 쓰는 것): `R: [-0.049, -0.056, -0.037, 0.08]`, `pole.R: [-0.089, -1, 0.041]`, `lean: −10`. 값은 500번의 무작위 탐색에서 나온 것이고, 기획의 15°에는 이 손잡이들로 닿지 못했습니다.',
      `**변형 나를 돌려 본 결과.** 같은 프로의 스트레이트: 지금 ${at(N, 'cards', 'cross.4a.now', 'said') || '–'}, 변형 나 ${at(N, 'cards', 'cross.4a.upright', 'said') || '–'}. 이 카드의 audit 위반: 지금 ${f0(at(N, 'audit', 'cross.4a.now', 'bad'))}프레임, 변형 나 ${f0(at(N, 'audit', 'cross.4a.upright', 'bad'))}프레임${at(N, 'audit', 'cross.4a.upright', 'checks') && at(N, 'audit', 'cross.4a.upright', 'checks').length ? ` (${at(N, 'audit', 'cross.4a.upright', 'checks').join(', ')})` : ''}. §4A.10의 다른 시험(가슴이 닫힘, 앞어깨, 4암의 앞팔이 5암보다 높음)은 돌리지 않았습니다.`
    ],
    tables: [{ head: ['4암, 가드를 1초 든 뒤', '기획 (§4A.2)', '현재', '변형 가 (숙임 그대로)', '변형 나 (몸을 세움)'], rows: SHAPE_ROWS.map(([what, plan, cell]) => [what, plan, cell(shapeOf('now')), cell(shapeOf('glove')), cell(shapeOf('upright'))]) }],
    banner: { image: 'docs/ref/cross-arm-guard.jpg', say: '크로스암 가드 정석형(이미지 검색 화면). 누르면 원본' },
    groups: [{ rows: [[{ entry: 'crossArm@4a', kind: 'cross', key: 'cross.4a.now', say: '4암 · 지금' }, { entry: 'crossArm@4a', kind: 'cross', key: 'cross.4a.upright', tune: TUNES.upright, say: '4암 · 기획 모양 (변형 나: 몸을 세움)' }]] }],
    options: [
      { id: 'accept', name: '수용', says: '지금 모양(45~50°)을 둡니다.' },
      { id: 'upright', name: '몸을 세움 (변형 나)', says: `변형 나를 4암에 넣고 같은 방식으로 다섯 등급의 값을 찾습니다. ${f0(at(shapeOf('upright'), 'tilt'))}° 안팎. 몸이 16° 서므로 머리가 높아지고, 크로스암의 시험과 카드 30여 장, 구간(해머링, 숄더 롤)을 다시 재야 합니다.` },
      { id: 'glove-only', name: '글러브만 (변형 가)', says: `숙임 그대로, 글러브와 팔꿈치만. ${f0(at(shapeOf('glove'), 'tilt'))}°. 자세는 그대로라 다시 잴 것이 적고, 눈으로는 거의 차이가 없습니다.` },
      { id: 'drop', name: '목표를 고침', says: '기획의 "수직에서 15° 안"을 "45° 안팎"으로 고쳐 적습니다.' }
    ],
    recommend: 'accept', why: '변형 나도 기획의 절반밖에 못 가고, 값은 큰 재작업입니다. 카드에서 나란히 보고 모양이 눈에 띄게 낫다면 몸을 세웁니다.'
  },
  {
    id: 'cross-arm-gaps', part: 3, title: '크로스암의 약점이 열리지 않음', pair: 'roll-counter-weak',
    state: '기획의 약점 넷 가운데 셋이 이 엔진에서 나오지 않습니다.',
    tables: [{ head: ['약점', '기획 (§4A.3)', '현재'], rows: [
      ['2. 명치의 틈 (바디 잽·바디 스트레이트)', '5암의 명치에 맞음', '0.70~1.10 m 어디서도 팔에 막힘(시합 36번, 몸통으로 간 213개 모두)'],
      ['4라. 0.74 m 안의 숏 훅', '4암은 맞고 5암은 막음', '넷 다 글러브에 0~8 N·s'],
      ['3. 롤 중의 왼쪽', '왼쪽 갈비에 맞음', '맞지만 부위가 `body`(갈비 위). 시합에는 그 주먹이 없음'],
      ['1. 뒷손 훅', '관자놀이에 맞음', '맞음(시험 4가)'],
      ['숄더 롤의 구간', '알 수 없음(예상 없음)', '1~3프레임']
    ] }],
    card: { entry: 'crossBody-jab@5a', kind: 'tag', say: '크로스암 · 바디 잽 5암 (틈이 가장 넓어야 할 5암이 막음)' },
    options: [
      { id: 'accept', name: '수용', says: '글러브 지름 21 cm와 옆으로 선 몸의 기하입니다.' },
      { id: 'retry', name: '다시 시도', says: '크로스암에 대한 판정에서만 글러브 반지름을 줄입니다(판정이 가드마다 달라짐: "닿는지로만 정한다"에 어긋남).' },
      { id: 'drop', name: '목표를 지움', says: '약점 2·4라를 기획에서 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'roll-counter-weak', part: 3, title: '숄더 롤 & 카운터 4단계의 반격',
    state: '4단계의 반격(장전된 뒷손 훅)이 장전 없는 같은 훅보다 약합니다. 시간은 기다림으로 기획에 맞췄습니다.',
    tables: [{ head: ['', '기획 (§4A.7)', '현재'], rows: [
      ['4단계: 닿기까지', '0.22 s', '0.217 s'],
      ['5단계: 닿기까지', '0.16 s', '0.167 s'],
      ['4단계 충격량', '장전 없는 훅보다 약하지 않음(암시)', '68 N·s (장전 없는 훅 80~96)'],
      ['5단계 충격량', '–', '128~135 (87~99)'],
      ['"장전 없는 훅보다 40 ms 빠름"', '40 ms 이상', '같은 기다림에서 100~133 ms 빠름. 기다림 없는 훅(183 ms)보다는 4단계가 34 ms 느림']
    ] }],
    card: { entry: 'rollCounter@4m', kind: 'tag', say: '숄더 롤 & 카운터 4명' },
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '4단계의 기다림(0.135 s)을 줄여 세기를 얻습니다(기획의 0.22 s보다 빨라집니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'block-fire-wait', part: 3, title: '블록 & 파이어가 그냥 어퍼보다 느림',
    state: '기획의 시간은 맞췄습니다. 다만 이 엔진의 어퍼는 0.79 m에서 빨라, 기술 없이 같은 순간 누른 어퍼(167 ms)가 기술의 어퍼보다 먼저 닿습니다. 기술의 어퍼는 기획의 순서를 지키려고 기다렸다 나갑니다.',
    tables: [{ head: ['', '기획 (§4.3)', '현재'], rows: [['막은 뒤 닿기까지', '4명 0.27 s, 5명 0.20 s', '맞춤'], ['기다림', '–', '4명 0.16 s, 5명 0.13 s'], ['기술 없는 어퍼', '60 ms 느림(가정)', '167 ms로 더 빠름'], ['팔꿈치 내림', '12 cm · 8 cm, 무릎 +12°', '6 cm · 8 cm, +10°']] }],
    groups: [{ rows: [[{ image: 'docs/ref/block-and-fire.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'blockFire@4m', kind: 'tag', say: '블록 & 파이어 4명' }]] }],
    options: [
      { id: 'accept', name: '수용', says: '영상의 박자입니다.' },
      { id: 'retry', name: '다시 시도', says: '기다림을 없애 가장 빠른 반격으로(기획의 순서와 영상의 시간에서 벗어납니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'shell-shape', part: 3, title: '피커부 셸의 모양',
    state: '팔꿈치가 몸통에 붙지 않고, 잽이 머리 위로 지나가는 구간이 없고, 무릎은 기획의 절반입니다.',
    tables: [{ head: ['', '기획 (§4.5)', '현재'], rows: [
      ['팔꿈치 ↔ 몸통 옆면', '3 cm 안', '뒷팔 13~17 cm, 앞팔 30~34 cm'],
      ['1.0 m의 잽', '머리 위로 지나감', '늘 글러브에 막힘'],
      ['머리 하강', '16 cm', '0.2 s에 14.5 cm'],
      ['무릎', '+26° / +30°', '4명 +12° / +15°, 5명 +14° / +17°'],
      ['5명의 U자', '6 cm', '없음'],
      ['5명 바디 어퍼', '–', '19 N·s']
    ] }],
    groups: [{ rows: [[{ image: 'docs/ref/defense-or-a-trap.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'shell@4m', kind: 'tag', say: '피커부 셸 4명' }]] }],
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '셸에서만 숙임을 줄여 팔꿈치를 붙입니다(크로스암 변형 나와 같은 길: 머리가 올라가 잽·훅에 맞을 수 있습니다).' },
      { id: 'drop', name: '낮춰 적음', says: '셸을 기본 자세의 변형으로 낮춰 적습니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'shift-angle', part: 3, title: '타이슨 시프트의 각과 회전',
    state: '상대 앞발 바깥으로 벗어나는 각과 바디 훅의 골반 회전이 기획보다 작고, 박자 규칙이 없습니다.',
    tables: [{ head: ['', '기획 (§4.4)', '현재'], rows: [['벗어난 각', '4명 25~30°, 5명 30~35°', '23°, 28°'], ['바디 훅의 골반 회전', '훅의 1.6배', '1.30배, 1.52배'], ['박자', '4명 착지, 5명 착지 사이', '없음'], ['시프트 중의 잽', '60 N·s를 맞아도', '7~18 N·s로만 닿음']] }],
    groups: [{ rows: [[{ image: 'docs/ref/tyson-shift.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'shift@4m', kind: 'tag', say: '타이슨 시프트 4명' }]] }],
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '앞발도 5 cm 옮겨 각을 얻습니다(영상의 "앞발은 제자리"에서 벗어납니다).' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'pull-counter-slow', part: 3, title: '풀백 카운터 1~3단계의 시간',
    state: '4·5단계는 기획에 30 ms 안이지만 1~3단계는 67~200 ms 느립니다. 스웨이가 끝나야 주먹이 나가는데 스웨이가 깁니다.',
    tables: [{ head: ['바디 · 뒷손 훅 · 스트레이트 (ms)', '기획 (§3.8)', '현재'], rows: [['1단계', '850 · 850 · 800', '1050 · 1050 · 883'], ['2단계', '620 · 600 · 580', '767 · 733 · 633'], ['3단계', '450 · 430 · 400', '517 · 517 · 483'], ['4명', '300 · 280 · 250', '300 · 283 · 233']] }],
    groups: [{ rows: [[{ image: 'docs/ref/pull-counter-3-ways.jpg', say: '참고 영상의 접촉 시트(4 fps)' }, { entry: 'pullCross@3', kind: 'tag', say: '풀백 → 스트레이트 3단계' }]] }],
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '1~3단계의 스웨이를 짧게 합니다(스웨이 카드와 그 구간이 바뀝니다).' },
      { id: 'drop', name: '표를 고침', says: '표를 잰 값으로 고쳐 적습니다.' }
    ],
    recommend: 'accept'
  },
  {
    id: 'showoff-jerk', part: 3, title: '과시형 암 카드의 한 프레임 튐',
    state: '기술 카드 몇 장에 3 cm를 조금 넘는 한 프레임 튐이 남아 있습니다. 튐 시험은 주먹 사다리와 기본 풋워크만 봅니다.',
    tables: [{ head: ['', '기준', '현재'], rows: [['5암 가드 내리고 치기의 앞팔', '3 cm 이하', '3.3~5.1 cm'], ['4암 가드 올리고 치기 뒤 돌아가는 발', '3 cm 이하', '4 cm'], ['5암 턱 내밀기의 앞팔', '3 cm 이하', '3.3 cm']] }],
    groups: [{ rows: [[{ entry: 'pawDown@5a', kind: 'tag', say: '가드 내리고 치기 5암 (튐이 가장 큼). ¼ 속도에서 보입니다' }, { fill: true }]] }],
    options: [
      { id: 'accept', name: '수용', says: 'README의 알려진 한계에 남깁니다.' },
      { id: 'retry', name: '다시 시도', says: '세 카드의 그 프레임을 찾아 고치고 튐 시험을 기술 카드까지 넓힙니다.' },
      { id: 'drop', name: '목표를 지움', says: '기획에서 그 목표를 지웁니다.' }
    ],
    recommend: 'retry', why: '한도를 지키는 쪽이고 범위가 작습니다.'
  },

  // ===== 4. to clear away
  ...[
    ['cleanup-old-session', '이전 세션과 그 대화', '인계가 끝났습니다. 필요한 것은 저장소에 있습니다.', '세션 1개', 'approve'],
    ['cleanup-old-artifacts', '아티팩트 "한밤의 링", "달빛 결투"', '초기 게임 화면. 지금 것으로 대체됐습니다.', '2개. 그 밖의 지난 시안은 수를 알 수 없음(`Artifact`의 `list`로 확인)', 'approve'],
    ['cleanup-fx-versions', '쓰지 않을 이펙트 시안 버전', '타격 이펙트 버전이 정해지면 나머지 버전의 값과 "타격 이펙트 시안" 아티팩트.', '버전 4개 가운데 1개(조합이면 2개)만 남음', 'hold', '타격 이펙트 버전이 정해진 뒤에.'],
    ['cleanup-fx-sweat', '`src/render/fx.mjs`의 관성 땀 `sweat()`', '시안 1판. 채택되지 않았습니다.', '함수 1개. 부르는 곳이 남아 있는지는 알 수 없음(지우기 전에 `grep`)', 'approve'],
    ['cleanup-limp-out', '한꺼번에 풀리는 림프 `out`', '기획 §7.8이 "쓰지 않는다"고 했지만 시험이 아직 씁니다.', '시험 몇 개가 쓰는지 알 수 없음', 'hold', '시험을 먼저 옮깁니다.'],
    ['cleanup-fxlab-now', '`fxlab`의 "지금" 비교 카드', '이펙트가 본편에 붙으면 "지금"이 없어집니다.', '카드 5장(장면 5 × 1)', 'hold', '이펙트를 본편에 붙인 뒤에.']
  ].map(([id, title, state, count, recommend, why]) => ({
    id, part: 4, title, state,
    tables: [{ head: ['', '수치'], rows: [['남은 것', count]] }],
    options: [
      { id: 'approve', name: '승인', says: '파기합니다. 다음 세션이 메모를 읽고 지웁니다.' },
      { id: 'hold', name: '보류', says: '지금은 두고 나중에 다시 봅니다.' }
    ],
    recommend, why
  }))
];

// the line at the end of part 4: not an item (it is not ours to clear away)
export const STASH_NOTE = '`git stash`의 `stash@{0}`은 사용자의 것이라 정리 후보가 아닙니다.';
