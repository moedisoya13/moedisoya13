/* The motion catalogue: every entry is a real bout, looped, with the boxer driven through one piece of footwork, or one
   exchange of punches and defence, by a script of places to be and buttons to press (src/footwork.mjs, src/defense.mjs,
   src/ladder.mjs). Every technique is a row of seven cards, one for each grade (anim/skill.mjs: 1, 2, 3, 4명, 4암, 5명, 5암),
   and the seven of a row keep one clock, so that what is the same in all of them (the other man, his punch, the script) is
   the same to the frame and only the grade differs. One canvas lies behind the page and each card's stage is a window onto
   its own bout; a row is stepped while any card of it is on screen, and only the cards on screen are drawn. An exchange
   starts from a fresh bout every loop, so what each card shows is what its test checks.
   A brilliant defence (game/bout.mjs) is shown again at a quarter of the speed in its own card (src/replay.mjs): its time
   stands still meanwhile, and the row waits for it at the end of the loop. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices, toWorld } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';

import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, ITEMS as GUARDS } from './defense.mjs';
import { LADDER, STANCES, DIRTY, FOOTWORK, PUNCHES, TECHNIQUES, ENTRY, MOVING } from './ladder.mjs';
import { LEVELS, LEVEL } from './anim/skill.mjs';
import { LINKS } from './phys/chain.mjs';
import { MOVES } from './anim/moves.mjs';
import { H } from './anim/stance.mjs';
import { WINDOWS } from './windows.data.mjs';
import { createReplay } from './replay.mjs';
import { across, lineAngle, guardOf } from './measure.mjs';

const DT = 1 / 60;
// the fouls, as a card names them
const FOUL = { stomp: '발등 밟기', thumb: '안면 잽' };
const JOINT = { drive: '다리', hips: '엉덩이', trunk: '몸통', shoulder: '어깨', elbow: '팔꿈치' };
const SPAN = 0.3; // seconds of a punch the chain timeline under a rung shows
// what became of the punch, as the card says it
const SAID = { whiff: '빗나감', graze: '스침', block: '막음', parry: '패리', hit: '명중' };
// a frame count as a card writes it: +4, −3 (a frame before the press: a guess)
const signed = (n, bare) => (n < 0 ? `−${-n}` : bare ? `${n}` : `+${n}`);
const FOOTWORK_STATS = ['pendulum', 'inout', 'stalk', 'side', 'circle', 'turn', 'dash', 'stepjab', 'onetwo'];
const byId = Object.fromEntries([...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY].map(e => [e.id, e]));

/* ---- what is in the catalogue: parts, and in each the techniques, each a row of seven grades (or, being hit, one card) */
const FOOT_NOTE = {
  bounce: '발이 닿을 때마다 무릎이 짧게 굽었다 펴지며 튕겨 오르고, 머리와 글러브가 한 박자 늦게 따라오고, 체중이 두 발 사이를 시계추처럼 오갑니다. 무릎이 굽는 폭이 등급입니다(1은 0°, 3은 ±5°, 5명은 ±8°). 1은 무릎이 뻣뻣해 발이 캔버스를 떠나지 않고 박자와 무관하게 체중만 옮기며, 2는 상체가 통짜로 오르내리고, 3부터 머리가 움직이고, 4명은 강약 박에 머리가 착지마다 양 끝, 5명은 스윙과 구절과 변주, 암은 박자를 지우고 낮게 구릅니다. 카드 아래는 골반이 오르내린 폭, 머리가 좌우로 오간 폭, 분당 착지입니다.',
  pendulum: '앞발이 들어가고 뒷발이 따라붙고, 앞발로 한 번 흔들고, 뒷발이 빠지고 앞발이 따라 나오고, 뒷발로 한 번 흔듭니다. 자기 박자의 여섯 반박자에 한 번이라 1과 2는 느린 박자만큼 늦고, 암은 착지 간격이 들쭉날쭉합니다. 카드 아래는 한 번 왕복에 걸린 시간과 착지 간격의 변동입니다.',
  inout: '가는 쪽 발이 먼저 움직입니다. 1은 걸음 중에 발이 모이고 틀린 발이 먼저 나가기도 하며 몸이 먼저 쏠리고, 2는 걸음마다 멈추며 발을 붙였다 벌립니다. 카드 아래는 걸음 중 가장 좁아진 스탠스 폭(평소 대비)입니다.',
  side: '가는 쪽 발이 먼저 벌어지고 반대 발이 간격을 되찾습니다. 1은 발이 모이고, 2는 붙였다 벌리고, 3부터 폭을 지킵니다. 카드 아래는 가장 좁아진 폭과 두 발의 좌우가 뒤집힌 적이 있는지입니다.',
  circle: '상대를 가운데 두고 호를 그립니다. 1은 가슴이 0.3초 늦게 따라가고, 2와 암은 12°가 벌어지면 한 번에 돌아서고, 3부터 가슴이 계속 상대를 향합니다. 카드 아래는 가슴과 상대 사이 각의 최대값입니다.',
  turn: '상대가 옆으로 돌아 나가면 제자리에서 발을 옮겨 정면을 되찾습니다. 1은 늦게, 2와 암은 기다렸다 한 번에, 3부터 작은 피벗을 이어서 따라갑니다. 카드 아래는 정면 오차의 최대값입니다.',
  stalk: '가드를 올린 채 짧은 걸음으로 밀고 들어갑니다. 가드의 모양은 그 등급의 가드입니다(1은 눈을 가리고, 4암은 팔뚝을 포갬). 카드 아래는 걸음 중 가장 좁아진 폭입니다.',
  dash: '한 박자에 크게 빠집니다. 미는 다리 무릎이 두 프레임에 굽었다 펴지며 밀고, 내려서는 다리 무릎이 굽어 받습니다. 1은 가라앉지 않고 선 채로 뛰어 손이 벌어지고 내려서 비틀거리며, 2는 먼저 일어섰다 밀고 납작하게 섭니다. 4암·5암은 미끄러지듯 낮게, 5명은 돌아선 채 내려섭니다. 거리는 등급이 바꾸지 않습니다. 카드 아래는 골반이 가장 높이 오르거나 내려간 양과 다시 움직일 수 있기까지의 시간입니다.',
  stepjab: '들어가며 잽을 칩니다. 1은 서고 나서 늦게, 2는 앞발이 닿은 다음에(발, 주먹), 3은 대본대로, 4명은 잽이 앞발 착지에 닿게, 5명은 두 착지 사이에 닿게 누릅니다. 카드 아래는 잽이 닿은 순간과 가장 가까운 앞발 착지의 차이입니다.',
  onetwo: '들어가며 잽, 뒷발이 따라붙는 박자에 스트레이트. 1은 두 주먹 사이에 한참 서 있고, 2는 발과 주먹을 번갈아 네 박자로, 4명은 두 주먹이 각각 착지에, 5명은 엇박에 닿습니다. 카드 아래는 두 주먹이 닿은 간격(반박자 0.32초 단위)입니다.'
};
const PUNCH_NOTE = {
  jab: '앞손의 짧은 주먹. 앞발이 나가며 앞무릎이 굽었다가 닿을 때 펴집니다. 1은 팔이 몸보다 먼저 나가고, 2는 순서는 맞지만 이음새가 끊기고, 3은 교과서, 4는 다음 관절이 앞 관절의 정점 전에 출발하고, 5는 예비동작 없이 한 동작입니다.',
  cross: '뒷발에서 올라온 회전이 뒷손까지 이어지는 주먹. 뒷무릎이 굽어 장전되고, 뒷발이 돌 때 무릎이 안으로 돌며 펴집니다. 4명은 닿는 순간이 앞발 착지, 5명은 두 착지 사이(엇박)입니다.',
  hook: '팔을 굽혀 가슴에 고정하고 몸통이 휘두르는 주먹. 굽힌 앞무릎에 체중을 싣고, 앞발과 함께 앞무릎이 안으로 돌며 펴집니다. 더 도는 몸은 주먹을 머리 너머로 보내므로 고수의 추가 회전은 조금만 받습니다.',
  upper: '무릎에서 올라오는 주먹. 두 무릎을 굽혀 가라앉았다가 펴며 올라오고, 머리는 주먹과 함께 올라옵니다.',
  hookIn: '중심 간 0.72 m 안(초근거리)에서 파워 버튼은 숏 훅과 숏 어퍼를 번갈아 냅니다. 숏 훅은 팔을 가슴에 붙인 채 골반·가슴을 더 감았다(+22°·+10°) 더 돌리고(−40°·−36°) 두 발이 다 돕니다: 앞발이 안으로 돌며 뒤꿈치가 들리고, 앞무릎이 안으로 돌며 펴져 체중이 뒷발로 넘어갑니다. 훅처럼 휘두르는 길에서 머리에 닿습니다. 0.64 m에서 던집니다. 1은 팔부터 나가고, 2는 이음새가 끊기고, 4·5는 분리가 크고 감기가 짧습니다. 카드 아래는 충격량, 닿기까지, 골반이 돈 각입니다.',
  upperIn: '무릎을 스프링으로 쓰는 어퍼. 두 무릎(뒷무릎이 더)으로 골반이 10 cm 내려가며 손을 허리띠까지 내렸다가, 무릎이 다 펴지며 골반과 함께 손이 턱 밑으로 곧게 올라옵니다(마지막 길이 수직에서 25° 안). 1은 무릎을 쓰지 않고 팔로 퍼 올리고, 2는 바닥에서 0.05초 멈췄다 올라오고, 4는 다음 발 착지에 맞춰 내려가며, 5는 내려가는 구간이 거의 없습니다. 카드 아래는 충격량, 닿기까지, 무릎이 가장 많이 굽은 각입니다.'
};
const MOVE_NOTE = {
  duckIn: '더킹 + 앞 대시. 두 무릎(뒷무릎이 더)으로 내려가며 골반을 뒤꿈치 위로 빼 머리를 곧게 낮추고 오른쪽(상대 잽의 바깥)으로 빼며, 뒷다리가 펴져 1.0 m에서 초근거리(0.67 m 남짓)까지 밀고 들어갑니다. 착지 뒤 0.15초 동안 굽은 무릎이 남아, 그 안에 누른 숏 훅·숏 어퍼는 감긴 채로 나갑니다(4·5는 전부, 3은 절반). 1은 허리로 숙여 바닥을 보고 발이 높이 뜨며 0.8 m에서 멈추고, 2는 숙이고 나서 들어가며, 4는 바깥으로 각을 잡고, 5는 앞발을 축으로 상대 옆구리 쪽으로 돌아 섭니다. 카드 아래는 끝난 거리와 머리가 가장 낮았던 높이입니다.',
  hopPivot: '가드를 풀고(앞손 28 cm, 뒷손 24 cm 내림) 상체를 세운 채 발목으로 튀며, 앞발 볼을 축으로 75° 돌아 상대 정면에서 비켜난 뒤 뒤로 세 번 뜁니다. 마지막 뜀에 손이 가드로 돌아옵니다. 1은 꼿꼿이 서서 뒷걸음질하고 손이 흘러내리며, 2는 작게 뛰고 손이 얼굴에 붙어 있고 45°만 돕니다. 카드 아래는 끝난 거리와 상대가 본 각도입니다.',
  hopCircle: '가드를 풀고 상대를 보면서 옆으로 네 번 뛰어 돕니다(한 번에 원둘레로 16 cm, 바깥으로 12 cm). 5명은 가운데 뜀에서 앞뒤 발이 공중에서 바뀌었다 돌아옵니다. 카드 아래는 끝난 거리와 상대가 본 각도입니다.'
};
const TECH_NOTE = {
  stomp: '발등이 닿는 거리(0.8 m)에서 던지는 훅. 반칙은 4암과 5암에만 있습니다: 코일 동안 앞발을 들어 상대 앞발 위로 가져가 다리 구동과 함께 내려 밟고, 상대는 0.45초 묶입니다. 나머지 등급은 같은 자리에서 반칙 없이 훅만 던집니다.',
  thumb: '잽이 닿은 뒤 글러브를 얼굴에 올려 둔 채 밀어 넣는 반칙. 4암은 대놓고 0.2초, 5암은 0.1초 손목을 돌려 넣고 시치미를 뗍니다. 나머지 등급은 같은 잽을 반칙 없이 칩니다.'
};
const footRow = e => ({
  id: e.id,
  name: e.name,
  en: e.en,
  note: FOOT_NOTE[e.id] || e.note,
  stat: e.id === 'bounce' ? 'stance' : e.id,
  cards: LEVELS.map(lv => (e.id === 'bounce' ? `stance@${lv}` : `${e.id}@${lv}`))
});
const PARTS = [
  {
    part: '풋워크',
    note: '모든 기술은 다섯 단계이고, 4와 5에는 깔끔한 정도(명)와 더티 복싱(암) 두 갈래가 있어 일곱 장이 한 줄로 놓입니다. 일곱 장은 같은 대본을 한 시계로 돌리므로, 다른 것은 그리로 가는 몸뿐입니다. 발자국의 노란색은 앞발, 파란색은 뒷발이고, 명 카드의 빨간 등불은 강박(앞발 착지)에 켜집니다.',
    groups: [
      ['박자', ['bounce', 'pendulum']],
      ['직선', ['inout', 'stalk', 'dash']],
      ['좌우', ['side', 'circle', 'turn']],
      ['주먹과 함께', ['stepjab', 'onetwo']]
    ].map(([group, ids]) => [group, ids.map(id => footRow(ENTRIES.find(e => e.id === id)))])
  },
  {
    part: '수비',
    note: '상대는 일곱 장 모두 같은 프로(3단계)이고 같은 순간에 같은 주먹을 던집니다. 수비하는 쪽은 그 등급 자기 구간의 가운데에서 누르고(구간은 tools/windows.mjs로 잰 값), 피했는지 막았는지는 글러브와 머리의 실제 접촉입니다. 아슬아슬하게 피하고 0.4초 안에 장전된 카운터가 나간 수비는 그 카드에서만 1/4 속도로 다시 보여 줍니다.',
    groups: ['피하기', '막기', '카운터'].map(group => [group, GUARDS.filter(i => i.group === group).map(i => ({ id: i.id, name: i.name, en: i.en, note: i.note, stat: i.id, cards: LEVELS.map(lv => `${i.id}@${lv}`) }))])
  },
  {
    part: '주먹',
    note: '차이는 데미지 배율이 아니라 관절이 움직이는 순서와 협응, 리듬에서 나옵니다. 충격량은 곱해 준 값이 아니라 그렇게 던진 결과이고, 막대는 관절마다 출발에서 정점까지, 세로선은 닿은 순간, 시간은 누른 뒤부터입니다. 머리는 닿는 순간 머리가 자기 가드 자리에서 선 밖으로 벗어난 거리, 골반은 가장 많이 돈 각입니다.',
    groups: [
      ['주먹', PUNCHES.filter(p => !p.inside).map(p => ({ id: p.id, name: p.name, en: p.en, note: PUNCH_NOTE[p.id], stat: 'rung', cards: LEVELS.map(lv => `${p.id}@${lv}`) }))],
      ['초근거리', PUNCHES.filter(p => p.inside).map(p => ({ id: p.id, name: p.name, en: p.en, note: PUNCH_NOTE[p.id], stat: 'rung', knee: p.id === 'upperIn', cards: LEVELS.map(lv => `${p.id}@${lv}`) }))],
      ['암의 기술', TECHNIQUES.map(t => ({ id: t.id, name: t.name, en: t.en, note: TECH_NOTE[t.id], stat: 'foul', cards: LEVELS.map(lv => `${t.id}@${lv}`) }))]
    ]
  },
  {
    part: '진입 · 이탈',
    note: '들어갈 때는 머리를 주먹 선 밑으로 낮춰 파고들고, 나올 때는 가드를 풀고 발목으로 튀어 사거리 밖으로 나갑니다. 어디까지 가는지는 시합이 정하고, 카드는 루프마다 새 시합에서 다시 칩니다. 상대는 프로이고 서 있기만 합니다.',
    groups: [['진입 · 이탈', MOVING.map(m => ({ id: m.id, name: m.name, en: m.en, note: MOVE_NOTE[m.id], stat: 'moving', cards: LEVELS.map(lv => `${m.id}@${lv}`) }))]]
  },
  {
    part: '맞기와 다운',
    note: '맞는 반응과 다운은 등급을 매기지 않습니다. 충격량과 그 방향이 만드는 것이고, 등급이 바꾸는 것은 맞기 직전의 자세뿐입니다. 한 장씩 놓습니다.',
    single: true,
    groups: ['맞기', '다운'].map(group => [group, DEFENSE.filter(e => !e.level && e.group === group).map(e => e.id)])
  }
];

/* ---- the page, written from the parts (so the page and the bouts cannot disagree about what is in the catalogue) */
const main = document.getElementById('catalog'),
  ROWS = []; // { item, cells }
for (const P of PARTS) {
  const head = document.createElement('h2');
  head.className = 'part';
  head.textContent = P.part;
  main.append(head);
  const note = document.createElement('p');
  note.className = 'part-note';
  note.textContent = P.note;
  main.append(note);
  for (const [group, items] of P.groups) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${group}</h2>`;
    if (P.single) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const id of items) grid.append(singleCard(byId[id]));
      section.append(grid);
      ROWS.push(...items.map(id => ({ item: { id, stat: 'single' }, ids: [id] })));
    } else
      for (const item of items) {
        const block = document.createElement('div');
        block.className = 'item';
        block.dataset.item = item.id;
        block.innerHTML = `<div class="item-head"><h3>${item.name} <span class="en">${item.en}</span></h3><p>${item.note}</p></div><div class="row7" role="list"></div>`;
        for (const id of item.cards) block.lastElementChild.append(gradeCard(byId[id], item));
        section.append(block);
        ROWS.push({ item, ids: item.cards });
      }
    main.append(section);
  }
}

// a card of a row: the grade, and the numbers its technique is told by
function gradeCard(e, item) {
  const level = LEVEL[e.level],
    card = document.createElement('article'),
    beat = level.side === 'm' ? `<span class="lamp beat" data-beat title="강박"></span>` : '';
  card.className = 'card rung';
  card.setAttribute('role', 'listitem');
  card.dataset.entry = e.id;
  let stats = '';
  const pair = (a, b) => `<div class="feet stats"><span>${a}</span>${b ? `<span>${b}</span>` : ''}</div>`;
  switch (item.stat) {
    case 'stance':
      stats = pair('골반 <b data-hips>–</b> cm', '머리 <b data-head>–</b> cm') + `<div class="feet"><span class="lamp lead" data-lamp="L"></span><span class="lamp rear" data-lamp="R"></span>${beat}<span class="pace">분당 <b data-pace>–</b>보</span></div>`;
      break;
    case 'pendulum':
      stats = pair('왕복 <b data-a>–</b> 초', '변동 <b data-b>–</b>');
      break;
    case 'inout':
    case 'stalk':
      stats = pair('최소 폭 <b data-a>–</b>%');
      break;
    case 'side':
      stats = pair('최소 폭 <b data-a>–</b>%', '교차 <b data-b>–</b>');
      break;
    case 'circle':
    case 'turn':
      stats = pair('정면 오차 <b data-a>–</b>°');
      break;
    case 'dash':
      stats = pair('골반 <b data-a>–</b> cm', '<b data-b>–</b> ms');
      break;
    case 'stepjab':
      stats = pair('착지–타격 <b data-a>–</b> ms');
      break;
    case 'onetwo':
      stats = pair('두 주먹 <b data-a>–</b> h');
      break;
    case 'slip':
    case 'slip-cross':
    case 'duck':
    case 'roll':
    case 'pull': {
      const w = WINDOWS[item.id] && WINDOWS[item.id][e.level];
      const second = { slip: '여유 <b data-a>–</b>', 'slip-cross': '여유 <b data-a>–</b>', pull: '거리 <b data-a>–</b>', duck: '못 봄 <b data-a>–</b> ms', roll: '총 <b data-a>–</b> ms' }[item.id];
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair(`<b>${w && w.to !== null ? signed(w.to) : '–'}</b> f까지`, second) + (item.id === 'duck' || item.id === 'roll' ? pair('무릎 몫 <b data-knee>–</b>%') : '');
      break;
    }
    case 'parry': {
      const w = WINDOWS.parry[e.level];
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair(`<b>${signed(w.from, true)}–${signed(w.to, true)}</b> f`, '손 <b data-a>–</b> cm');
      break;
    }
    case 'block':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> N·s', '가드 <b data-b>–</b> ms');
      break;
    case 'guard':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('밀림 <b data-a>–</b> cm', '간격 <b data-b>–</b> cm');
      break;
    case 'counter':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> ms', '<b data-b>–</b> N·s');
      break;
    case 'moving':
      stats = pair('끝 거리 <b data-a>–</b> m', e.move === 'duckIn' ? '머리 <b data-b>–</b> cm' : '각도 <b data-b>–</b>°');
      break;
    case 'rung': {
      const skip = MOVES[e.punch].chain.skip || [];
      stats = `<div class="chain">${LINKS.map((l, i) => `<span class="row${skip.includes(l) ? ' off' : ''}"><i>${JOINT[l]}</i><span class="lane"><b data-bar="${i}"></b></span></span>`).join('')}<span class="hit-at" data-at></span></div>
        <div class="feet result"><span><b data-blow>–</b> N·s</span><span class="pace"><b data-ms>–</b> ms</span></div>` + (item.knee ? pair('무릎 <b data-knee>–</b>°', '골반 <b data-turn>–</b>°') : pair('머리 <b data-off>–</b> cm', '골반 <b data-turn>–</b>°')) + (beat ? `<div class="feet stats">${beat}<span>닿은 박자 <b data-on>–</b></span></div>` : '');
      break;
    }
    case 'foul':
      stats = pair(`${level.side === 'a' ? FOUL[e.foul] : '반칙 없음'}`, level.side === 'a' ? '<b data-fj>–</b> N·s' : '') + pair('<span data-fat></span>') + pair('주먹 <b data-blow>–</b> N·s');
      break;
  }
  card.innerHTML = `<div class="stage" role="img" aria-label="${item.name} ${level.label} 애니메이션"><span class="replay" hidden>리플레이 ¼</span></div>
    <div class="info"><h3>${level.label} <span class="en">${level.name}</span></h3>${stats}${beat && FOOTWORK_STATS.includes(item.stat) ? `<div class="feet">${beat}<span>강박</span></div>` : ''}</div>`;
  return card;
}
// a card on its own (being hit, going down)
function singleCard(e) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.entry = e.id;
  card.innerHTML = `<div class="stage" role="img" aria-label="${e.name} 애니메이션"></div>
    <div class="info"><h3>${e.name} <span class="en">${e.en}</span></h3><p>${e.note}</p>
      ${e.status ? `<div class="feet result"><span class="tag">${e.status}</span></div>` : `<div class="feet result"><span class="tag" data-tag>–</span><span class="pace"><b data-blow>–</b> N·s</span></div>`}</div>`;
  return card;
}

// the square of canvas each bout stands on: tiles, so that where a foot lands can be seen
function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap,
        tile = 0.5,
        fx = Math.abs((((x / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        fz = Math.abs((((z / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        dark = (Math.floor(x / tile + 100) + Math.floor(z / tile + 100)) % 2;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, fx < 0.03 || fz < 0.03 ? 22 : dark ? 23 : 24, 0, 3], k);
      k += 12;
    }
  return { rows, count: n * n };
}

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const boxer = unpack(fromBase64(await (await fetch('assets/' + manifest.boxer.file)).text()), manifest.boxer);
  return { manifest, boxer };
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const flash = el => {
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
};

function start({ manifest, boxer }) {
  const canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    tiles = floor(3.2, [0.6, 0]),
    meshes = { boxer: R.mesh(boxer, manifest.boxer.count), floor: R.mesh(tiles.rows, tiles.count) },
    palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))],
    mats = new Float32Array(NAMES.length * 12);
  let speed = 1,
    prints = true,
    last = 0,
    ground = new Float32Array(12),
    ink = new Float32Array(rgb(manifest.palette[0]));

  const q = (el, s) => el.querySelector(s);
  const makeCell = (entry, item) => {
    const el = document.querySelector(`[data-entry="${entry.id}"]`),
      fx = createFx();
    return {
      entry,
      item,
      el,
      stage: q(el, '.stage'),
      tag: q(el, '[data-tag]'),
      replayTag: q(el, '.replay'),
      lamps: { L: q(el, '[data-lamp="L"]'), R: q(el, '[data-lamp="R"]') },
      beat: q(el, '[data-beat]'),
      out: Object.fromEntries(['a', 'b', 'pace', 'blow', 'ms', 'hips', 'head', 'on', 'fj', 'fat', 'off', 'turn', 'knee'].map(k => [k, q(el, `[data-${k}]`)])),
      bars: [...el.querySelectorAll('[data-bar]')],
      at: q(el, '[data-at]'),
      exchange: entry.punch !== undefined || !!entry.fresh,
      fx,
      mesh: R.mesh(fx.rows, 0, true),
      bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
      replay: createReplay(),
      shown: null, // the step being drawn, while a replay plays
      cam: { target: [0.45, entry.level ? 0.95 : entry.punch !== undefined ? 0.85 : 0.52, 0], yaw: entry.view.yaw, pitch: entry.view.pitch, dist: 5.4 },
      shake: 0,
      t: 0
    };
  };
  const rows = ROWS.map(r => ({ item: r.item, cells: r.ids.map(id => makeCell(byId[id], r.item)), acc: 0 }));
  const cells = rows.flatMap(r => r.cells);
  for (const cell of cells) reset(cell);

  function reset(cell) {
    cell.bout = freshBout(cell.entry);
    cell.t = 0;
    cell.m = { track: [], plants: [], up: { L: false, R: false }, halves: undefined, press: null, most: 0, landedAt: undefined };
    cell.replay.reset();
    cell.shown = null;
  }
  function tell(cell, text, blow) {
    if (!cell.tag) return;
    cell.tag.textContent = text;
    flash(cell.tag);
    if (blow !== undefined && cell.out.blow) cell.out.blow.textContent = blow === null ? '–' : String(Math.round(blow));
  }
  const put = (cell, k, v) => cell.out[k] && (cell.out[k].textContent = v);

  /* One step of one card: the bout, and the numbers under it. A card past the end of its loop (waiting for the rest of the
     row) stands in its guard. */
  function tick(cell) {
    const { entry, item } = cell,
      bout = cell.bout,
      [a, b] = bout.fighters,
      m = cell.m,
      over = cell.exchange && cell.t >= entry.loop - 1e-9,
      controls = over ? [{}, {}] : drive(entry, bout, cell.t, DT);
    cell.t += DT;
    step(bout, controls, DT);
    if (cell.replay.watch(bout, DT) && cell.replayTag) cell.replayTag.hidden = false;
    b.hp = 1000; // he is here to be stood in front of, not beaten
    if (!entry.hurt) a.hp = 1000;
    const r = a.animator.rhythm,
      newHalf = m.halves !== undefined && r.halves !== m.halves;
    for (const e of bout.events) {
      const by = e.type === 'parry' ? e.on : e.who;
      if (by === 1 && SAID[e.type]) tell(cell, e.down ? '다운' : SAID[e.type] + (e.brilliant ? '!' : ''), e.J);
      // (a defence found brilliant after the event it was: the counter decides it)
      if (e.type === 'brilliant' && e.who === 0 && cell.tag) tell(cell, SAID[e.of] + '!');
      // the blow itself, as the game shows it: sparks and sweat sized by its impulse, and the picture shaken
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85);
        cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
        cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
      } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
      else if (e.type === 'parry') (cell.fx.sparks(e.at, 14, [38, 38, 39, 40], 5), (cell.shake = 2));
      measureEvent(cell, e, a, b);
    }
    cell.shake *= 0.82;
    // (the strong beat: his lead foot coming down)
    if (cell.beat && newHalf && r.landed === 'L') flash(cell.beat);
    // (a foot coming down, in footwork: its lamp, its print, and the time for the pace)
    if (newHalf && r.landed && !cell.exchange) {
      if (cell.lamps[r.landed]) flash(cell.lamps[r.landed]);
      m.plants.push(cell.t);
      if (m.plants.length > 8) m.plants.shift();
      const joint = r.landed === 'L' ? 'LeftFoot' : 'RightFoot';
      if (prints) cell.fx.print(toWorld(a.place, a.pose.at[joint], 1), a.yaw + (r.landed === 'L' ? -0.2 : -0.8), r.landed === 'L' ? [40, 40, 39, 25, 24] : [41, 41, 25, 25, 24], 1.5);
    }
    if (newHalf) (m.landings = m.landings || []).push({ t: cell.t, foot: r.landed });
    m.halves = r.halves;
    measureStep(cell, a, b);
  }

  // the numbers each card is told by, as the bout goes
  function measureEvent(cell, e, a, b) {
    const { item, entry } = cell,
      m = cell.m;
    switch (item.stat) {
      case 'slip':
      case 'slip-cross':
        if (e.type === 'whiff' && e.who === 1) put(cell, 'a', `${(e.margin * 100).toFixed(1)} cm`);
        if (e.type === 'hit' && e.who === 1) put(cell, 'a', '맞음');
        break;
      case 'pull':
        if (e.type === 'pull') m.gap0 = Math.hypot(b.x - a.x, b.z - a.z);
        break;
      case 'block':
        if (e.type === 'block' && e.who === 1) (put(cell, 'a', String(Math.round(e.J))), (m.blocked = { t: cell.t, hand: e.hand === 'L' ? 'R' : 'L', base: m.gloveRest }));
        break;
      case 'guard':
        if (e.type === 'block' && e.who === 1 && m.x0 === undefined) m.x0 = [a.x, a.z];
        break;
      case 'counter':
        if (e.type === 'whiff' && e.who === 1) m.whiff = cell.t;
        if (e.type === 'hit' && e.who === 0 && m.whiff !== undefined) put(cell, 'a', String(Math.round((cell.t - m.whiff) * 1000))), put(cell, 'b', String(Math.round(e.J)));
        break;
      case 'dash':
        if (e.type === 'dash') m.dashAt = cell.t;
        break;
      case 'stepjab':
        if (e.type === 'hit' && e.who === 0 && e.name === 'jab') (m.jabAt = cell.t), (m.done = false);
        break;
      case 'onetwo':
        if (e.type === 'hit' && e.who === 0 && e.name === 'jab') m.jabAt = cell.t;
        if (e.type === 'hit' && e.who === 0 && e.name === 'cross' && m.jabAt !== undefined) put(cell, 'a', ((cell.t - m.jabAt) / H).toFixed(2));
        break;
      case 'rung':
        if (e.type === 'punch' && e.who === 0 && e.name === entry.punch) (m.press = cell.t), (m.most = 0), (m.lo = m.hi = undefined), (m.landed = false);
        if (e.who === 0 && e.type === 'hit') m.landed = true;
        if (e.who === 0 && ['hit', 'graze', 'whiff', 'block'].includes(e.type) && a.action && a.action.chain) {
          const c = a.action.chain,
            pct = x => `${Math.max(0, Math.min(100, (x / SPAN) * 100)).toFixed(1)}%`;
          put(cell, 'blow', e.J === undefined ? '–' : String(Math.round(e.J)));
          put(cell, 'ms', m.press === null ? '–' : String(Math.round((cell.t - m.press) * 1000)));
          const guard = guardOf(entry.level),
            side = MOVES[entry.punch].hand === 'R' ? 1 : -1;
          put(cell, 'off', (side * (across(a, b, a.points.head) - guard.head) * 100).toFixed(1));
          put(cell, 'turn', String(Math.round(m.most)));
          if (cell.out.on) {
            const u = a.animator.rhythm.u,
              from = Math.min(u, 1 - u);
            put(cell, 'on', from <= 0.12 ? '정박' : from >= 0.3 ? '엇박' : '–');
          }
          cell.bars.forEach((bar, i) => {
            const on = c.fired[i] >= 0;
            bar.style.left = on ? pct(c.fired[i]) : '0';
            bar.style.width = on ? `max(3px, ${pct(Math.max(0, c.peakAt[i] - c.fired[i]))})` : '0';
          });
          cell.at.style.setProperty('--at', String(Math.max(0, Math.min(1, (cell.t - (m.press ?? cell.t)) / SPAN))));
          cell.at.classList.add('on');
        }
        break;
      case 'foul':
        if (e.who === 0 && e.type === 'foul') (put(cell, 'fj', String(Math.round(e.J))), put(cell, 'fat', m.landedAt === undefined ? '주먹 전' : `주먹 뒤 ${Math.round((cell.t - m.landedAt) * 1000)} ms`));
        if (e.who === 0 && e.type === 'hit' && e.name === entry.punch) (put(cell, 'blow', String(Math.round(e.J))), (m.landedAt = cell.t));
        break;
    }
  }
  function measureStep(cell, a, b) {
    const { item, entry } = cell,
      m = cell.m,
      every = Math.round(cell.t / DT) % 20 === 0,
      feet = () => {
        const L = a.pose.at.LeftToeBase,
          Rt = a.pose.at.RightToeBase;
        return { w: Math.hypot(L[0] - Rt[0], L[2] - Rt[2]), x: L[0] - Rt[0] };
      };
    /* (a duck's and a weave's knees: how far the hips went down over how far the head did, from where they were as it
       started: the knees' share of it, tools/knees.mjs) */
    if (item.stat === 'duck' || item.stat === 'roll') {
      const hy = a.pose.at.Hips[1] * a.pose.stretch,
        y = a.points.head[1];
      if (a.action && a.action.name === item.stat) {
        if (m.kneeFrom === undefined) m.kneeFrom = { hy: m.kneeWas ? m.kneeWas.hy : hy, y: m.kneeWas ? m.kneeWas.y : y, hips: 0, head: 0 };
        m.kneeFrom.hips = Math.max(m.kneeFrom.hips, m.kneeFrom.hy - hy);
        m.kneeFrom.head = Math.max(m.kneeFrom.head, m.kneeFrom.y - y);
      } else if (m.kneeFrom && !m.kneeSaid) (m.kneeSaid = true), put(cell, 'knee', m.kneeFrom.head > 0.02 ? String(Math.round((100 * Math.max(0, m.kneeFrom.hips)) / m.kneeFrom.head)) : '–');
      if (!a.action) m.kneeWas = { hy, y };
    }
    switch (item.stat) {
      case 'stance': {
        m.track.push([a.pose.at.Hips[1] * a.pose.stretch, across(a, b, a.points.head)]);
        if (m.track.length > 240) m.track.shift();
        if (m.track.length >= 120 && every) {
          const span = k => Math.max(...m.track.map(x => x[k])) - Math.min(...m.track.map(x => x[k]));
          put(cell, 'hips', (span(0) * 100).toFixed(1));
          put(cell, 'head', (span(1) * 100).toFixed(1));
          if (m.plants.length >= 4) put(cell, 'pace', String(Math.round(((m.plants.length - 1) / (m.plants[m.plants.length - 1] - m.plants[0])) * 60)));
        }
        break;
      }
      case 'pendulum': {
        const l = m.landings || [];
        if (l.length >= 8 && every) {
          const gaps = l.slice(-13).slice(1).map((x, i, all) => x.t - (i ? all[i - 1].t : l.slice(-13)[0].t)),
            mean = gaps.reduce((s, g) => s + g, 0) / gaps.length,
            sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
          put(cell, 'a', (mean * 6).toFixed(2));
          put(cell, 'b', (sd / mean).toFixed(2));
        }
        break;
      }
      case 'inout':
      case 'stalk':
      case 'side': {
        const f = feet();
        if (m.w0 === undefined && cell.t > 0.15) m.w0 = f.w;
        if (m.w0 !== undefined) {
          m.wMin = Math.min(m.wMin ?? 9, f.w / m.w0);
          if (f.x < -0.02) m.crossed = true;
        }
        if (every && m.wMin !== undefined) (put(cell, 'a', String(Math.round(m.wMin * 100))), put(cell, 'b', m.crossed ? '있음' : '없음'));
        break;
      }
      case 'circle':
      case 'turn': {
        const off = Math.abs(wrap(Math.atan2(b.x - a.x, b.z - a.z) - a.yaw)) * (180 / Math.PI);
        if (cell.t > 0.3) m.faceMax = Math.max(m.faceMax || 0, off);
        if (every && m.faceMax !== undefined) put(cell, 'a', String(Math.round(m.faceMax)));
        break;
      }
      case 'dash': {
        const y = a.pose.at.Hips[1] * a.pose.stretch;
        if (m.dashAt === undefined) m.y0 = m.y0 === undefined ? y : m.y0 + (y - m.y0) * 0.05;
        else {
          const d = y - m.y0;
          if (Math.abs(d) > Math.abs(m.dy || 0)) m.dy = d;
          if (m.free === undefined && !a.action) m.free = cell.t - m.dashAt;
        }
        if (every && m.dy !== undefined) put(cell, 'a', `${m.dy > 0 ? '+' : ''}${(m.dy * 100).toFixed(1)}`), m.free !== undefined && put(cell, 'b', String(Math.round(m.free * 1000)));
        break;
      }
      case 'stepjab': {
        // the nearest lead foot coming down to the jab landing, before or after it (after: the jab came first)
        const l = (m.landings || []).filter(x => x.foot === 'L');
        if (m.jabAt !== undefined && l.length && (cell.t - m.jabAt > 0.4 || m.done)) {
          if (!m.done) {
            const near = l.reduce((best, x) => (Math.abs(x.t - m.jabAt) < Math.abs(best.t - m.jabAt) ? x : best));
            put(cell, 'a', `${m.jabAt - near.t >= 0 ? '+' : ''}${Math.round((m.jabAt - near.t) * 1000)}`);
            m.done = true;
          }
        }
        break;
      }
      case 'pull':
        if (m.gap0 !== undefined && !a.action && m.after === undefined) (m.after = Math.hypot(b.x - a.x, b.z - a.z) - m.gap0), put(cell, 'a', `${m.after >= 0 ? '+' : ''}${(m.after * 100).toFixed(1)} cm`);
        break;
      case 'duck': {
        // how long he could not see him: his head bowed more than fifteen degrees further than it is in his guard
        const H0 = a.pose.at.Head,
          N = a.pose.at.Neck1,
          bow = Math.atan2(Math.hypot(H0[0] - N[0], H0[2] - N[2]), H0[1] - N[1]) * (180 / Math.PI);
        if (!a.action) m.bow0 = bow;
        else if (a.action.name === 'duck' && m.bow0 !== undefined) m.duck = (m.duck || 0) + (bow - m.bow0 > 15 ? DT : 0);
        if (!a.action && m.duck !== undefined && !m.said) (put(cell, 'a', String(Math.round(m.duck * 1000))), (m.said = true));
        break;
      }
      case 'roll':
        if (a.action && a.action.name === 'roll') m.roll = a.action.t;
        else if (m.roll !== undefined && !m.said) (put(cell, 'a', String(Math.round(m.roll * 1000))), (m.said = true));
        break;
      case 'parry': {
        // how far the gloves go out from his face to meet it
        const reach = Math.max(...['L', 'R'].map(k => Math.hypot(...a.points[k].map((v, i) => v - a.points.head[i]))));
        if (!a.cover) m.rest = reach;
        else if (m.rest !== undefined) m.reach = Math.max(m.reach || 0, reach - m.rest);
        if (every && m.reach !== undefined) put(cell, 'a', (m.reach * 100).toFixed(1));
        break;
      }
      case 'block': {
        // how long until the glove that was hit is back where it was on his face
        const dist = k => Math.hypot(...a.points[k].map((v, i) => v - a.points.head[i]));
        if (!m.blocked) m.gloveRest = { L: dist('L'), R: dist('R') };
        else if (m.back === undefined && cell.t - m.blocked.t > 0.03) {
          const k = Object.keys(m.blocked.base).reduce((x, y) => (Math.abs(dist(y) - m.blocked.base[y]) > Math.abs(dist(x) - m.blocked.base[x]) ? y : x));
          if (Math.abs(dist(k) - m.blocked.base[k]) < 0.015 || cell.t - m.blocked.t > 0.8) (m.back = cell.t - m.blocked.t), put(cell, 'b', String(Math.round(m.back * 1000)));
        }
        break;
      }
      case 'guard':
        if (a.cover) {
          const g = Math.hypot(...a.points.L.map((v, i) => v - a.points.R[i])) - 0.2;
          m.gap = m.gap === undefined ? g : m.gap + (g - m.gap) * 0.1;
        }
        if (every) {
          if (m.gap !== undefined) put(cell, 'b', Math.max(0, m.gap * 100).toFixed(1));
          if (m.x0) put(cell, 'a', (Math.hypot(a.x - m.x0[0], a.z - m.x0[1]) * 100).toFixed(1));
        }
        break;
      case 'moving': {
        // where he ends (centre to centre), and on the way in how low his head went; or the angle he ends at, seen from the
        // other man, off where he started
        if (a.action && a.action.name === entry.move) {
          m.going = true;
          m.low = Math.min(m.low ?? 9, a.points.head[1]);
          if (m.a0 === undefined) m.a0 = Math.atan2(a.z - b.z, a.x - b.x);
        } else if (m.going && !m.said) {
          m.said = true;
          put(cell, 'a', Math.hypot(a.x - b.x, a.z - b.z).toFixed(2));
          put(cell, 'b', entry.move === 'duckIn' ? (m.low * 100).toFixed(0) : String(Math.round(Math.abs(wrap(Math.atan2(a.z - b.z, a.x - b.x) - m.a0)) * (180 / Math.PI))));
        }
        break;
      }
      case 'rung':
        // (the most the knees bend, either of them: the inside uppercut's spring)
        if (item.knee && a.action && a.action.chain && a.pose.knee) m.knee = Math.max(m.knee || 0, ...['L', 'R'].map(k => (a.pose.knee[k] ? a.pose.knee[k].flex : 0)));
        if (item.knee && a.action && a.action.chain && m.knee) put(cell, 'knee', String(Math.round(m.knee)));
        if (m.press !== null && a.action && a.action.chain) {
          const guard = guardOf(entry.level),
            turn = Math.sign(MOVES[a.action.name].links.hips.yaw),
            d = wrap(lineAngle(a.pose, 'LeftLeg', 'RightLeg') - guard.hips);
          m.most = Math.max(m.most, (-turn * d * 180) / Math.PI);
          /* (right up close the hook lands before the hips are round past where they are in his guard: what its card says is
             how far they swung, from the wind-up to the contact) */
          if (item.id === 'hookIn' && !m.landed) (m.lo = Math.min(m.lo ?? d, d)), (m.hi = Math.max(m.hi ?? d, d)), (m.most = ((m.hi - m.lo) * 180) / Math.PI);
        }
        break;
    }
  }

  /* A row: its cards step together, so the same moment of the script is in all of them. A card that is replaying is not
     stepped (its time stands still); an exchange starts again, all of it, once every card has played its loop. */
  function stepRow(row) {
    const ex = row.cells[0].exchange;
    if (ex && row.cells.every(c => c.t >= c.entry.loop - 1e-9 && !c.replay.playing)) row.cells.forEach(reset);
    for (const cell of row.cells) if (!cell.replay.playing) tick(cell);
  }

  function theme() {
    // the canvas has no transparency: what it paints round the stages is the page's own colour
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  }
  const onScreen = box => !(box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth || box.width < 8);
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    const grid = R.resize(h / Math.max(2, Math.round(dpr * 2.5))); // about two and a half screen pixels to an art pixel
    if (Math.round(now / 500) !== Math.round((now - 17) / 500)) theme();
    R.begin();
    for (const row of rows) {
      const boxes = row.cells.map(c => c.stage.getBoundingClientRect());
      if (!boxes.some(onScreen)) continue;
      row.acc += elapsed;
      let steps = 0;
      while (row.acc >= DT && steps++ < 6) (row.acc -= DT), stepRow(row);
      if (steps > 6) row.acc = 0;
      row.cells.forEach((cell, i) => {
        const box = boxes[i];
        // (a replay plays on in real time whether or not the row is being stepped)
        if (cell.replay.playing) cell.shown = cell.replay.next(elapsed) || null;
        else cell.shown = null;
        if (cell.replayTag && !cell.replay.playing && !cell.replayTag.hidden) cell.replayTag.hidden = true;
        if (!onScreen(box)) return;
        draw(cell, box, dpr, grid, elapsed);
      });
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }
  function draw(cell, box, dpr, grid, elapsed) {
    const live = cell.bout.fighters,
      men = cell.shown ? cell.shown.men : live,
      layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
      shadows = [];
    men.forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(cell.shown ? 0 : elapsed, shadows, 22));
    layers.push({ mesh: cell.mesh, palette: palettes[0], mask: 0.6 }, { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1 }, { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, flash: men[1].flash > 0 ? 1 : 0 });
    const ease = 1 - Math.exp(-elapsed * 4),
      rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      [a, b] = men,
      // (an exchange is framed on the two of them, close; footwork on the boxer whose feet these are)
      mine = cell.exchange ? 0.5 : 0.6;
    cell.cam.target[0] += (a.x * mine + b.x * (1 - mine) - cell.cam.target[0]) * ease;
    cell.cam.target[2] += (a.z * mine + b.z * (1 - mine) - cell.cam.target[2]) * ease;
    // far enough back that both men are in the picture from the feet up, whatever shape the window is
    const [near, wide] = cell.entry.level ? [3.4, 2.1] : cell.exchange ? [3.3, 2.5] : [5.2, 3.6];
    cell.cam.dist = Math.max(near, wide / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h)));
    const jolt = !cell.shown && cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
    R.cell(rect, { camera: cell.cam, layers, shake: jolt });
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  const toggle = document.getElementById('prints');
  toggle.addEventListener('click', () => {
    prints = !prints;
    toggle.setAttribute('aria-pressed', String(prints));
  });
  // (for looking at the page from a script: every row stepped on by so many seconds at once)
  globalThis.__catalog = { cells, rows, renderer: R, advance: sec => rows.forEach(row => { for (let i = 0; i < Math.round(sec / DT); i++) stepRow(row); }) };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
