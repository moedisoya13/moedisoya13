/* The motion catalogue: every entry is a real bout, looped, with the boxer driven through one piece of footwork, or one
   exchange of punches and defence, by a script of places to be and buttons to press (src/footwork.mjs, src/defense.mjs,
   src/ladder.mjs). Every technique is a row of seven cards, one for each grade (anim/skill.mjs: 1, 2, 3, 4명, 4암, 5명, 5암),
   and the seven of a row keep one clock, so that what is the same in all of them (the other man, his punch, the script) is
   the same to the frame and only the grade differs. One canvas lies behind the page and each card's stage is a window onto
   its own bout; a row is stepped while any card of it is on screen, and only the cards on screen are drawn. An exchange
   starts from a fresh bout every loop, so what each card shows is what its test checks.
   A brilliant defence (game/bout.mjs) is shown again at a quarter of the speed in its own card (src/replay.mjs): its time
   stands still meanwhile, and the row waits for it at the end of the loop. So is a knockdown, a moment after the man comes
   down on the canvas (docs/moves-plan-6.md §2.4B), from a moment before the blow, the camera drawn in closer on him, and
   what the blow threw (its motes, the ripple through him, the second one where he came down and the ring through the
   canvas) thrown again as it comes, in the replay's own time. A card draws its bout between its last two steps, and a
   replay between the steps it kept, so neither ever shows the same picture twice running however slowly it is played. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import * as M from './rig/m3.mjs';
import { createFx } from './render/fx.mjs';
import { blow, met, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow } from './render/blow.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { floor } from './render/floor.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices, toWorld } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';

import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, ITEMS as GUARDS, PARRY_DOWN, CROSS_ARM, CROSS_BODY, CROSS_BODY_ROWS, ROLLING, CROSS_LEVELS, ROLL_LEVELS, PULL_WAYS, PULL_COUNTER, BLOCK_FIRE, FIRE_LEVELS, SHELL, SHELL_ROWS, SHELL_LEVELS } from './defense.mjs';
import { LADDER, STANCES, DIRTY, FOOTWORK, PUNCHES, TECHNIQUES, ENTRY, MOVING, TRICKS, SHOWOFF, TAUNT_ROWS, TAUNTING, BODY_PUNCHES, BODY_LADDER, REAR, REAR_LADDER, WAVE_ROWS, WAVING, SHIFT_ROWS, SHIFT_LEVELS, SHIFTING, WALKING, walkRound, waveCard } from './ladder.mjs';
import { BODYSHOTS, LIVER_BLOCK } from './bodyshots.mjs';
import { LEVELS, LEVEL, CROSS } from './anim/skill.mjs';
import { LINKS, ORDER, skipped } from './phys/chain.mjs';
import { MOVES } from './anim/moves.mjs';
import { H } from './anim/stance.mjs';
import { WINDOWS } from './windows.data.mjs';
import { createReplay } from './replay.mjs';
import { across, lineAngle, guardOf } from './measure.mjs';
import { attachMemos } from './memo.mjs';
import { BEARING } from './bearing.data.mjs';
import { createTracker, track, CELLS, BANDS, cellSaid } from './game/bearing.mjs';

const DT = 1 / 60;
// the fouls, as a card names them
const FOUL = { stomp: '발등 밟기', thumb: '안면 잽' };
const JOINT = { drive: '다리', hips: '엉덩이', waist: '허리', trunk: '몸통', shoulder: '어깨', elbow: '팔꿈치' };
const SPAN = 0.3; // seconds of a punch the chain timeline under a rung shows
// what became of the punch, as the card says it
const SAID = { whiff: '빗나감', graze: '스침', block: '막음', parry: '패리', hit: '명중' };
// what met it (a block's part), as the card says it
const MET = { glove: '글러브', forearm: '팔뚝', elbow: '팔꿈치', shoulder: '어깨' };
// a frame count as a card writes it: +4, −3 (a frame before the press: a guess)
const signed = (n, bare) => (n < 0 ? `−${-n}` : bare ? `${n}` : `+${n}`);
// a window of frames as a card writes it: 2–4, or 3 for one frame
const span = w => (w[0] === w[1] ? signed(w[0], true) : `${signed(w[0], true)}–${signed(w[1], true)}`);
const FOOTWORK_STATS = ['pendulum', 'inout', 'stalk', 'side', 'circle', 'turn', 'dash', 'stepjab', 'onetwo'];
// (the dashes each way are dash cards)
const STAT = { bounce: 'stance', dashIn: 'dash', dashSide: 'dash' };
// (the liver block cards have no punch of the other man's to fight round: each loop is a fresh bout all the same)
const byId = Object.fromEntries([...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING, ...BODY_LADDER, ...REAR_LADDER, ...BODYSHOTS, ...LIVER_BLOCK.map(e => Object.assign({}, e, { fresh: true })), ...WAVING, ...PARRY_DOWN, ...CROSS_ARM, ...CROSS_BODY.map(e => Object.assign({}, e, { fresh: true })), ...ROLLING, ...PULL_COUNTER, ...[...BLOCK_FIRE, ...SHELL].map(e => Object.assign({}, e, { fresh: true })), ...SHIFTING, ...WALKING].map(e => [e.id, e]));

/* ---- what is in the catalogue: parts, and in each the techniques, each a row of seven grades (or, being hit, one card) */
const FOOT_NOTE = {
  bounce: '발이 닿을 때마다 무릎이 짧게 굽었다 펴지며 튕겨 오르고, 머리와 글러브가 한 박자 늦게 따라오고, 체중이 두 발 사이를 시계추처럼 오갑니다. 무릎이 굽는 폭이 등급입니다(1은 0°, 3은 ±5°, 5명은 ±8°). 1은 무릎이 뻣뻣해 발이 캔버스를 떠나지 않고 박자와 무관하게 체중만 옮기며, 2는 상체가 통짜로 오르내리고, 3부터 머리가 움직이고, 4명은 강약 박에 머리가 착지마다 양 끝, 5명은 스윙과 구절과 변주, 암은 박자를 지우고 낮게 구릅니다. 카드 아래는 골반이 오르내린 폭, 머리가 좌우로 오간 폭, 분당 착지입니다.',
  pendulum: '앞발이 들어가고 뒷발이 따라붙고, 앞발로 한 번 흔들고, 뒷발이 빠지고 앞발이 따라 나오고, 뒷발로 한 번 흔듭니다. 자기 박자의 여섯 반박자에 한 번이라 1과 2는 느린 박자만큼 늦고, 암은 착지 간격이 들쭉날쭉합니다. 카드 아래는 한 번 왕복에 걸린 시간과 착지 간격의 변동입니다.',
  inout: '가는 쪽 발이 먼저 움직입니다. 1은 걸음 중에 발이 모이고 틀린 발이 먼저 나가기도 하며 몸이 먼저 쏠리고, 2는 걸음마다 멈추며 발을 붙였다 벌립니다. 5명은 들어가며 앞발이 닿을 때 머리가 바깥(오른쪽)으로 7 cm 빠지고(슬립) 무릎이 굽은 채 남으며, 빠지며 뒷발이 닿을 때 상체가 뒤로 눕고 바로 돌아옵니다(스웨이). 5암은 같은 것을 박자 밖에서, 크기가 들쭉날쭉하게 합니다. 카드 아래는 걸음 중 가장 좁아진 스탠스 폭(평소 대비)입니다.',
  side: '가는 쪽 발이 먼저 벌어지고 반대 발이 간격을 되찾습니다. 1은 발이 모이고, 2는 붙였다 벌리고, 3부터 폭을 지킵니다. 5명·5암은 서클링처럼 걸음마다 얕은 위빙을 합니다. 카드 아래는 가장 좁아진 폭과 두 발의 좌우가 뒤집힌 적이 있는지입니다.',
  circle: '상대를 가운데 두고 호를 그립니다. 1은 가슴이 0.3초 늦게 따라가고, 2와 암은 12°가 벌어지면 한 번에 돌아서고, 3부터 가슴이 계속 상대를 향합니다. 5명은 발이 닿을 때마다 머리가 그 발 쪽으로 얕은 U를 그리고(좌우 10 cm 남짓, 무릎으로 7 cm, 네 걸음에 한 번은 더 깊게) U의 바닥이 발 착지에 옵니다. 그 U가 들어갈 자리를 위해 옆으로 갈 때의 걸음이 느립니다. 5암은 바닥이 착지에서 어긋나고, 크기와 방향이 들쭉날쭉하고, 가끔 앞어깨 페이크가 섞입니다. 카드 아래는 가슴과 상대 사이 각의 최대값입니다.',
  turn: '상대가 옆으로 돌아 나가면 제자리에서 발을 옮겨 정면을 되찾습니다. 1은 늦게, 2와 암은 기다렸다 한 번에, 3부터 작은 피벗을 이어서 따라갑니다. 카드 아래는 정면 오차의 최대값입니다.',
  stalk: '가드를 올린 채 짧은 걸음으로 밀고 들어갑니다. 가드의 모양은 그 등급의 가드입니다(1은 눈을 가리고, 4암·5암은 고전형 크로스암으로 뒷 글러브는 턱 앞, 앞팔은 배 앞). 카드 아래는 걸음 중 가장 좁아진 폭입니다.',
  dash: '한 박자에 크게 빠집니다. 미는 다리 무릎이 두 프레임에 굽었다 펴지며 밀고, 내려서는 다리 무릎이 굽어 받습니다. 1은 가라앉지 않고 선 채로 뛰어 손이 벌어지고 내려서 비틀거리며, 2는 먼저 일어섰다 밀고 납작하게 섭니다. 4암·5암은 미끄러지듯 낮게, 5명은 돌아선 채 내려섭니다. 5명은 턱을 묻고 뒷무릎에 앉으며 상체가 뒤로 누운 채(스웨이) 빠지고, 내려서며 왼쪽으로 한 번 슬립합니다. 5명은 발이 닿는 박자에 대시합니다. 거리는 등급이 바꾸지 않습니다. 카드 아래는 골반이 가장 높이 오르거나 내려간 양과 다시 움직일 수 있기까지의 시간입니다.',
  dashIn: '한 박자에 크게 들어갑니다(상대는 닿지 않는 2.3 m에). 5명·5암은 더킹 대시의 작은 형태입니다: 무릎으로 머리가 가드보다 10 cm 남짓 내려가고 오른쪽(상대 잽의 바깥)으로 비켜서 들어가며, 내려설 때 무릎이 +15° 굽은 채 남아 그 안에 누른 주먹은 감기를 다시 하지 않고 나갑니다. 5암은 크기와 때가 들쭉날쭉합니다. 카드 아래는 골반이 가장 높이 오르거나 내려간 양과 다시 움직일 수 있기까지의 시간입니다.',
  dashSide: '한 박자에 크게 왼쪽으로 빠집니다. 5명·5암은 대시와 위빙이 한 동작입니다: 가는 쪽 반대편에서 밑으로(깊이 10 cm 남짓) 돌아 가는 쪽으로 올라옵니다. 카드 아래는 골반이 가장 높이 오르거나 내려간 양과 다시 움직일 수 있기까지의 시간입니다.',
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
/* the show-off's tricks and taunts (anim/show.mjs, docs/moves-plan-4.md §5): what each does, as its row says it */
const TRICK_NOTE = {
  flicker: '허리에 내려 둔 앞손이 아래에서 비스듬히 위로 채찍처럼 올라오는 잽. 어깨는 거의 돌지 않고 팔꿈치가 펴지며 손목이 마지막에 튑니다. 손은 가드가 아니라 허리로 돌아가고, 손이 돌아온 뒤 0.25초 안에 다시 누르면 와인드업 없이 연달아 나갑니다(최대 3번). 4암은 크게 휘두르고 5암은 손목만 씁니다. 나머지 등급은 같은 자리에서 보통 잽을 칩니다. 카드 아래는 첫 번째의 충격량과 닿기까지입니다.',
  pawDown: '상대가 가드를 들고 있을 때, 앞손으로 그 앞 글러브를 위에서 눌러 내리고(꽉 붙은 가드면 다른 글러브도 같이) 뒷손 스트레이트가 그 위로 넘어갑니다. 앞손이 실제로 글러브에 닿아야 치워지고, 치워진 글러브는 0.3초 뒤 돌아옵니다. 나머지 등급의 같은 스트레이트는 가드에 막힙니다. 카드 아래는 스트레이트의 충격량과 누른 뒤 닿기까지입니다.',
  pawUp: '앞손이 밑에서 상대의 뒷 글러브를 들어 올리고(꽉 붙은 가드면 다른 글러브도 같이) 뒷손 어퍼가 그 밑으로 올라옵니다. 맞는 판정이 머리뿐이라 올린 가드 밑으로 턱을 칩니다. 나머지 등급의 같은 어퍼는 가드에 막힙니다.',
  collar: '앞손이 상대 머리 바깥을 돌아 뒷목에 걸리고(글러브가 머리 뒤에 실제로 닿아야 함), 어퍼의 다리 구동과 함께 머리를 앞·아래로 당기는 동안 뒷손 어퍼가 올라옵니다. 내려오는 머리와 올라오는 주먹의 속도가 더해집니다. 닿고 0.1초(5암 0.05초) 뒤 놓습니다.',
  elbow: '스트레이트를 상대 머리 바깥(자기 왼쪽)으로 비껴 던지며 파고들고, 다 펴지 않은 팔꿈치가 뒤따라 턱에 닿습니다. 맞는 것은 아래팔 뿌리이고, 주먹이 손목 없이 실린 팔과 몸의 질량으로 칩니다. 4암은 대놓고 팔꿈치를 세우고, 5암은 빗나간 주먹을 거두는 척합니다.'
};
const TAUNT_NOTE = {
  beckon: '앞 글러브를 내밀어 손바닥을 위로 두 번 까딱입니다. 도발 중에는 가드가 없고, 어떤 입력으로든 끊깁니다. 시합에서는 서 있는 동안 16반박자마다 굴려(4암 30%, 5암 15%) 손짓·턱 내밀기·풍차 가운데 하나가 나오고, 가드 풀고 멀어지기의 마지막 뜀에도 붙습니다(60%, 40%). 4암은 크고 길게(1.25배), 5암은 작게(0.6배) 합니다. 카드 아래는 도발이 이어진 시간입니다.',
  chinOut: '두 손을 내리고 턱을 내밀어 좌우로 흔듭니다.',
  wind: '뒷팔을 몸 앞에서 크게 한 바퀴 돌려 볼로 펀치를 흉내 냅니다(어깨가 갈 수 없는 등 뒤로는 돌리지 않습니다).',
  shrug: '상대 잽을 슬립으로 피한 직후 두 손을 벌리고 어깨를 올립니다(시합에서는 4암 25%, 5암 40%).',
  tapChin: '맞은 뒤 자기 턱을 뒷 글러브로 톡톡 칩니다(시합에서는 30 N·s 미만으로 맞았을 때 4암 20%, 5암 30%).'
};
const footRow = e => ({
  id: e.id,
  name: e.name,
  en: e.en,
  note: FOOT_NOTE[e.id] || e.note,
  stat: STAT[e.id] || e.id,
  cards: LEVELS.map(lv => (e.id === 'bounce' ? `stance@${lv}` : `${e.id}@${lv}`))
});
/* the plan 5 rows (docs/moves-plan-5.md §3, §4, §4A): the body punches, the rear hook, a clean great one's own techniques,
   the cross-arm guard and the shoulder roll */
const BODY_NOTE = {
  jabBody: '앞손 잽을 명치로. 두 무릎으로 내려가며 같은 잽을 낮게 뻗습니다(팔은 곧게). 상대는 아마추어 자세로 서서 가드를 들고 맞기만 합니다. 카드 아래는 충격량, 닿기까지, 닿는 순간 머리가 가드 높이에서 내려간 거리, 골반이 돈 각입니다.',
  crossBody: '뒷손 스트레이트를 명치로. 두 무릎이 더 깊이 굽어 어깨가 과녁 높이까지 내려가고 팔은 수평으로 뻗습니다. 내려간 머리는 실제로 내려가 있어, 던지는 동안 상대의 잽이 그 위로 지나갈 수 있습니다.',
  hookBody: '앞손 훅을 간으로. 훅은 자기 머리보다 5 cm 넘게 낮게 휘두를 수 없어, 감는 동안 앞무릎으로 내려가고 앞손 쪽 옆구리를 굽혀 같은 높이의 훅을 던집니다. 팔꿈치를 굳혀 가슴에 붙이고 몸통이 휘두르며, 휘두르는 길에서 간에 닿습니다. 1은 무릎 대신 허리를 숙이고 팔을 내려 휘두르며, 2는 내려간 자세에서 멈칫하고 치고, 3은 감는 동안 내려가고, 4명은 발 착지에 맞춰 내려가 얼굴을 보며 치고, 암은 낮은 자세에서 거의 내려가지 않습니다. 프로의 리버 훅은 80 N·s 넘게, 누른 뒤 0.17~0.22초에 닿습니다.',
  upperBody: '초근거리(0.64 m)의 어퍼를 명치로. 숏 어퍼처럼 두 무릎으로 내려갔다가 펴며, 주먹이 허리띠에서 명치로 올라옵니다.',
  hookR: '뒷손 훅. 강타 연타에는 없고, 풀백 뒤의 반격과 숄더 롤 뒤의 반격(다음 단계)이 이 주먹을 이름으로 누릅니다. 여기서는 0.8 m에서 머리로 칩니다. 이 훅에 다운되면 오른쪽으로 쓰러지고, 실신이면 통나무 · 훅의 거울(고개가 오른쪽으로)입니다.'
};
const CLEAN_NOTE = {
  wave: '상대 사거리 끝(1.6 m 남짓)에서 크게 도는 서클링. 손을 내리고(4명은 가드보다 20 cm, 5명은 30 cm 넘게 아래) 상체를 세운 채, 두 발이 벌어졌다 모이는 한 번에 머리가 한 번 오르내립니다. 4명은 0.87초마다 고르게, 5명은 물결마다 길이가 다릅니다. 디딘 발은 미끄러질 수 없어 1 cm 든 낮은 걸음으로 끌고, 도는 빠르기는 초속 0.86 m입니다(기획은 1.9~2.2). 4명·5명이 이 기술을 가졌을 때만 타고, 그 밖에는 서클 아웃입니다. 카드 아래는 물결 하나의 길이, 깊이, 상대와의 거리입니다.',
  slick: '파도를 타는 중에 프로가 걸어 들어오며 잽을 칩니다. 상체를 뒤로 눕혀(슬릭백) 잽을 흘려보내고 파도는 이어집니다. 걸어 들어오는 잽을 4명은 물결의 60%, 5명은 80%에서 빗나가게 하고(서 있는 그에게는 같은 잽이 맞습니다), 서 있는 자리에서 친 잽은 닿지 않습니다. 1.2 m에서 시작한 스트레이트는 머리를 따라와 맞습니다: 파도가 비워 두는 곳입니다. 카드 아래는 잽이 빗나간 거리와 그때 두 사람 사이의 거리입니다.',
  parryDown: PARRY_DOWN[0].note,
  blockFire: '가드를 든 채 프로의 리버 훅을 뒷팔꿈치로 막고(§3.4의 팔꿈치 블록), 막은 그 팔로 올려칩니다. 블록 & 파이어를 가진 4명·5명이 막은 뒤 0.25초 안에 강타를 누르면(머리가 k.counter × 작전으로 고름) 막느라 옆구리를 접은 것이 감기라 그 손의 어퍼(0.74 m 안이면 인사이드 어퍼)가 장전된 채(4명 0.7, 5명 1.0) 나갑니다. 주먹은 허리띠 높이에서 팔꿈치가 옆구리를 스치며 출발하고(4명 0.16초, 5명 0.13초), 그쪽 무릎이 펴지며 올라가고, 반대 글러브는 관자놀이에 붙어 있습니다. 상대는 훅을 던지느라 팔이 나와 있어 카운터입니다. 5명은 어퍼가 닿고 0.07초 뒤 반대 손 훅이 따라갑니다(따라 들어가며). 갈비로 온 훅을 앞팔꿈치로 막으면 앞손 훅이 같은 식으로 나갑니다. 카드 아래는 막은 뒤 어퍼가 닿기까지와 그 충격량입니다.',
  shell: '피커부 셸: 가드를 웅크려 올립니다. 두 무릎(4명 +12°/+15°, 5명 +14°/+17°)과 허리(14°)로 내려앉아 머리가 0.18초(5명 0.14초)에 15 cm 남짓 내려가고, 상체를 상대 쪽으로 20° 돌려 세우고, 두 글러브를 광대뼈 앞에, 아래팔을 세웁니다. 프로의 잽이 글러브에 막히면(또는 위로 지나가면) 0.25초 안에 그 자세에서 앞손 훅이 감기 없이 나가고(장전 4명 0.7, 5명 1.0) 이어서 뒷손 바디 어퍼가 따라갑니다. 웅크리고 있는 동안 숨이 초당 최대치의 1.5%씩 듭니다. 5명은 곧은 주먹이 오면 그 손의 반대쪽으로 머리가 4 cm 더 빠집니다. 카드 아래는 셸에 들어간 뒤 0.3초 동안 머리가 내려간 양(서 있을 때의 오르내림 포함), 바닥까지 걸린 시간, 상대 잽의 결과입니다.',
  'shell-hook': '같은 셸로 프로의 앞손 훅(0.85 m)을 받습니다. 광대뼈의 글러브와 세운 아래팔이 머리 옆을 덮어 막고, 몸통으로 온 리버 훅은 내려오는 뒷팔꿈치가 막습니다.',
  'shell-upper': '셸이 비워 두는 곳: 어퍼. 글러브는 광대뼈에, 아래팔은 세워져 있어 밑에서 올라오는 어퍼는 두 팔 사이로 턱에 닿습니다(명치로 오는 바디 스트레이트도 벌어진 두 팔꿈치 사이로 들어옵니다).',
  shift: '타이슨 시프트("THE TYSON SHIFT" 영상): 한 번 누르면 전부 나갑니다. 뒷손 스트레이트(맞든 막히든 빗나가든 다음으로), 그것이 닿으면(4명) 또는 그 어깨가 발사될 때(5명) 뒷발이 떠서 앞발 옆을 지나 앞발보다 앞·오른쪽에 내려앉고(스탠스가 뒤바뀜, 4명 0.17초, 5명 0.12초, 4 cm 넘게 뜨지 않음), 몸이 상대 앞발 바깥으로 0.7 m 남짓, 그가 처음 마주 본 선에서 20~28° 벗어난 자리로 들어가 무릎과 허리로 내려앉습니다(머리가 가드보다 15 cm 넘게 낮게). 거기서 왼손 바디 훅(왼쪽이 뒤가 되어 뒷손처럼 골반이 크게 돔)이 첫 주먹 뒤 4명 0.37초, 5명 0.30초에, 오른손 어퍼가 그 뒤 4명 0.25초, 5명 0.22초에 닿고, 앞발을 앞으로 돌려 내며 오소독스로 돌아옵니다. 상대는 아마추어로 가드를 들고 맞기만 합니다. 카드 아래는 세 주먹의 충격량, 첫 주먹이 닿은 뒤 바디 훅이 닿기까지, 끝난 자리(상대와의 거리, 처음 선에서 벗어난 각)입니다.',
  'shift-shell': '같은 시프트를 피커부 셸에서(셸도 가진 선수가 0.3초부터 웅크려 있다가). 이미 내려앉아 있어 내려앉는 동안을 건너뛰고, 첫 주먹이 닿은 뒤 바디 훅까지가 4명 0.30초, 5명 0.25초로 서서 시작한 것보다 50~70 ms 빠릅니다. 셸에서는 5명도 스트레이트가 닿은 뒤에 발이 뜹니다. 상대는 아마추어 자세에 프로의 가드입니다.'
};
const CROSS_NOTE = {
  crossArm: '고전형 크로스암 가드(아치 무어·켄 노턴·포먼). 가드를 올리면 뒷 글러브는 턱 앞에, 앞팔은 배 앞에 가로로 눕히고, 옆으로 서서 앞어깨를 올리고 턱을 당깁니다. 고르는 기술이라 가진 선수만 들고, 기본 로드아웃에서는 4암·5암이 갖습니다(이 줄은 3·4명·5명에게도 줌; 1·2는 가져도 안 나옴). 같은 프로의 스트레이트가 뒷 글러브에 막힙니다. 3은 4암의 모양에 앞팔이 2 cm 낮고 막기만 하며, 4명·5명은 자기 패리, 4암·5암은 해머링 패리입니다. 카드 아래는 블록 충격량과 막은 곳입니다.',
  'crossArm-hook': '같은 가드로 스트레이트와 그 뒤의 앞손 훅을 받습니다. 훅이 출발하면(4암·4명 0.09초, 5암·5명 0.05초, 3은 0.12초 뒤) 뒷 글러브가 0.04초에 걸쳐 귀 위로 올라가 막습니다(웅크린 머리에 훅은 정수리 옆으로 옵니다). 이 움직임이 없으면 다섯 등급 모두 훅에 맞습니다. 어퍼도 이 가드의 뒷 글러브에 막힙니다(4차의 "엇갈린 팔 밑으로 올라오는 어퍼"는 뒤집혔습니다).',
  rollCounter: '스트레이트에 가드를 숄더 롤로 올리고, 굴린 다음 스텝에 뒷손 훅으로 반격합니다. 상체를 뒤로 눕히고 오른쪽으로 꺾으며 체중을 뒷발로 싣고, 앞어깨를 더 올리고 턱을 묻고, 주먹이 닿을 때 가슴이 오른쪽으로 가장 빨리 돕니다. 어깨선이 초당 200° 넘게 돌고 있을 때 앞어깨에 닿으면 굴린 것이고(체력은 블록의 절반), 굴려진 스트레이트는 0.3초 뻗은 채 묶입니다. 구간이 1~3프레임으로 좁아, 이르면 서 있는 어깨에 맞고(블록의 2배) 늦으면 상체를 꺾은 만큼 빗나갑니다. 뒤로 감긴 가슴이 뒷손 훅의 감기라(4 0.7, 5 전부) 뒷다리의 체중이 앞으로 넘어오는 동안(4 0.135초, 5 0.1초) 롤을 풀며 기다렸다 나가고, 상대 팔이 아직 묶여 있어 카운터입니다. 어깨에 닿은 뒤 훅이 머리에 닿기까지 4명·4암 0.22초, 5명·5암 0.17초이고, 4암·5암은 따라 들어갑니다. 중심 간 0.74 m 안이면 훅 대신 뒷손 숏 어퍼입니다. 굴리지 못하면 장전도 카운터도 없습니다. 4명·4암·5명·5암이 이 기술을 가졌을 때만입니다. 카드 아래는 구간, 닿는 순간 글러브와 머리 사이의 여유, 굴린 뒤 훅이 닿기까지와 그 충격량입니다.',
  'crossBody-jab': '크로스암 가드로 프로의 바디 잽을 받습니다. 배 앞에 가로로 누운 앞팔의 팔꿈치가 몸 앞으로 나와 있어 명치를 노린 잽이 거기 걸립니다. 기획이 약점으로 둔 명치의 틈(앞팔 위, 뒷 글러브 아래)은 이 엔진에서 열리지 않습니다: 옆으로 선 몸이라 명치가 상대 선에서 60° 가까이 돌아가 있고, 지름 21 cm 글러브가 앞팔꿈치와 뒷팔꿈치 사이를 지나가지 못합니다. 4 이상은 팔로 받은 다음 턱 앞에 있던 뒷손이 그대로 나가는 반격을 칩니다(먼 거리라 짧은 오버핸드, 감기 4 0.3·5 0.7). 3은 막기만 합니다. 카드 아래는 블록 충격량과 받은 곳, 막은 뒤 반격이 닿기까지와 그 충격량입니다.',
  'crossBody-cross': '같은 가드로 프로의 바디 스트레이트를 받습니다. 웅크린 크로스암의 가슴은 가드보다 낮아 스트레이트가 가슴 위쪽으로 들어오고, 몸 앞에 있는 팔(팔꿈치, 5암은 아래팔, 5명은 글러브)에 막힙니다. 앞어깨는 머리만 지키므로 몸통으로 오는 주먹에는 걸리지 않습니다.',
  'crossBody-liver': '같은 가드로 프로의 리버 훅(0.85 m)을 받습니다. 리버 훅은 그의 오른쪽에서 돌아오는데, 오른쪽 갈비 앞에 놓인 앞 글러브가 먼저 길에 있어 팔꿈치를 내릴 필요 없이 막힙니다(110~127 N·s의 훅이 글러브에). 4 이상은 막은 뒤 0.3초 안에 뒷손 어퍼로 반격합니다(4 0.13초, 5 0.10초 뒤에 닿음).'
};
/* the pull counter (docs/moves-plan-5.md §3.8): the three ways out of a sway back, as the head picks them */
const PULL_NOTE = {
  pullBody: '풀백 3형제는 고르는 기술입니다(3단계 이상의 기본 로드아웃, 일곱 등급 모두 엶). 스웨이 백으로 잽을 흘리고, 잽이 다 뻗어 빗나가는 순간 머리가 반격을 고릅니다: 상대가 0.85 m 안으로 들어와 있으면 뒷손 훅, 아니면 바디를 섞는 확률로 리버 훅, 그 밖에는 스트레이트(가장 흔함). 스웨이가 감아 둔 만큼(1·2는 0, 3은 0.3, 4는 0.7, 5는 1) 감기와 다리 구동을 건너뛰고, 돌아오는 몸이 그 주먹의 감기입니다. 1·2는 스웨이가 끝나고 선 뒤에, 3은 복귀의 80%부터, 4·5는 머리가 선을 벗어난 순간부터 나갈 수 있지만 몸이 돌아오는 만큼(4는 0.12~0.18초, 5는 0.11~0.16초) 기다렸다 나갑니다. ①은 뒷다리가 밀어 체중이 앞발로 넘어가며 앞무릎으로 내려앉고(리버 훅의 감기), 리버 훅의 던지는 거리(0.74 m)까지 들어가 간을 칩니다. 그보다 멀리서는 높게 들어가 뒷팔꿈치에 막힙니다. 카드 아래는 잽이 다 뻗은 뒤 반격이 닿기까지와 그 충격량입니다.',
  pullHook: '② 상대가 0.9 m에서 잽을 치며 들어와 있어(빗나갈 때 중심 간 0.72~0.86 m) 뒷손 훅입니다. 체중이 앞발로 가며 머리가 앞손 쪽 아래로(가드보다 9~10 cm 아래, 낮게 서는 4암·5암은 4~7 cm; 7~11 cm 옆) 들어가고 골반이 감겨 뒷손이 장전됩니다. 1은 숙이지 않고 선 채 팔만 휘두릅니다.',
  pullCross: '③ 뒷다리에 앉은 자세가 그대로 스트레이트의 장전이고 내려가지 않습니다. 4·5는 다른 둘보다 돌아오는 시간이 짧아(0.8배) 가장 빨리 닿습니다. 5는 잽 팔이 돌아가는 것과 같이 들어갑니다.'
};
const graded = (e, note, stat, levels, more) => Object.assign({ id: e.id, name: e.name, en: e.en, note, stat, cards: levels.map(lv => `${e.id}@${lv}`) }, more);
const single = e => ({ id: e.id, name: e.name, en: e.en, single: true });

/* ---- the eight bearings (docs/bearing-system-plan.md §8.1, stage O): every move that takes a man round the other, a row of
   two. The first is the path his centre took, drawn from above in the frame of the line the other man faced him on as it
   started (his front up, his lead hand on the left: game/bearing.mjs), with the eight cells and the bands round him; it is
   drawn from what tools/bearing.mjs measured into src/bearing.data.mjs, so no bout is fought for it. The second is the card
   itself, the same script, seen from above and from behind the other man as he stood at the start. Nothing here moves
   differently: these are the scripts the other parts show (the walk round him is new: src/ladder.mjs WALKING). */
const BEARING_NEW = '새 부 팔방(단계 O): 위에서 본 길과 돈 칸, 잡은 방위. 동작은 그대로';
const BEHIND = Math.PI / 2; // (the camera's yaw behind a man facing back down the canvas: the other man of every card here)
const BEARING_ROWS = [
  { group: '걸음과 대시', move: 'side', level: '3', note: '0.5 m 옆(그의 앞손 쪽)으로 곧게 걷는 카드입니다. 호를 따라 딛지 않아 거리가 조금 벌어지고, 한 걸음은 반 칸이 안 됩니다. 그는 서서 따라 돌아 정면 칸을 내주지 않습니다.' },
  { group: '걸음과 대시', move: 'circle', level: '3', note: '대본이 그를 가운데 두고 43°까지 돌았다가 돌아옵니다(그의 뒷손 쪽으로 먼저). 그림은 바깥 끝까지 가는 처음 1.25초입니다.' },
  { group: '걸음과 대시', move: 'walk', level: '3', note: '새 대본: 스틱을 끝까지 밀어 2초 동안, 1.0 m를 지키며 그의 앞손 쪽으로 걷습니다(자유 걸음, 능력치 50에서 초속 2.3 m). 한 칸에 0.34초로 어느 동작보다 빨리 돌지만, 서 있는 그는 초당 430°까지 따라 돌아 정면 칸을 내주지 않습니다.' },
  { group: '걸음과 대시', move: 'dashSide', level: '3', note: '한 박자에 1.2 m를 옆(그의 뒷손 쪽)으로 갑니다. 거의 한 칸을 돌지만 띠 하나 밖으로 나가고, 그는 그동안 다 따라옵니다.' },
  { group: '걸음과 대시', move: 'turn', level: '3', yaw: -BEHIND, note: '이 줄은 거꾸로입니다: 상대가 카드의 선수 둘레를 초당 64°까지 돌고, 가운데(위가 정면)는 카드의 선수입니다. 정점은 그가 상대를 못 본 각, 곧 정면 오차입니다.' },
  { group: '진입 · 이탈', move: 'hopPivot', level: '3', note: '앞발 볼을 축으로 75° 돌고 뒤로 뜁니다. 제자리 피벗이라 방위는 반 칸만 바뀝니다(돌수록 그를 지나쳐 봅니다).' },
  { group: '진입 · 이탈', move: 'hopCircle', level: '3', note: '옆으로 네 번 뛰어 돌며 밖으로 나갑니다.' },
  { group: '진입 · 이탈', move: 'duckIn', level: '4m', note: '숙여 들어가며 4명·4암은 바깥(+)으로 각을 잡고, 5명·5암은 끝에서 앞발을 축으로 돌아 섭니다(−).' },
  { group: 'L 전용 기술', move: 'shift', level: '4m', note: '스트레이트 뒤 뒷발이 앞발을 지나 그의 앞발 바깥(+)에 내려섭니다. 굵은 선은 내려설 때까지, 점선은 주먹 셋과 돌아오기입니다. 기획의 목표는 두 칸(4명 72°, 5명 76°)입니다.' },
  { group: 'L 전용 기술', move: 'shift', level: '5m', note: '5명은 스트레이트의 어깨가 켜질 때 뒷발이 뜹니다.' },
  { group: 'L 전용 기술', move: 'wave', level: '4m', note: '1.6 m 밖에서 그의 뒷손 쪽으로 돕니다. 기획의 목표는 한 번에 2~4칸, 한 칸에 4명 0.71초, 5명 0.58초입니다.' },
  { group: 'L 전용 기술', move: 'wave', level: '5m', note: '5명의 물결은 길이가 들쭉날쭉합니다.' },
  { group: 'L 전용 기술', move: 'slick', level: '4m', note: '파도를 타는 중에 그가 걸어 들어와 잽을 칩니다. 상체를 뒤로 눕혀 흘리고 파도는 이어집니다.' }
];
/* (the card of each: its script, seen from above; the walk round him and the wave are made afresh, since a wave card keeps
   the bout it is fighting with it for the slick back's step in: src/ladder.mjs walkRound, waveCard) */
const bearingRow = r => {
  const rows = BEARING_ROWS.filter(x => x.move === r.move),
    id = 'bearing-' + r.move + (rows.length > 1 ? '-' + r.level : ''),
    base = r.move === 'walk' ? walkRound(r.level) : r.move === 'slick' || r.move === 'wave' ? waveCard(WAVE_ROWS.find(w => w.id === r.move), r.level) : byId[`${r.move}@${r.level}`],
    move = BEARING.moves[r.move],
    // (from above, on the man whose frame it is, far enough back for the furthest the other gets from him)
    far = Math.max(...move.levels[r.level].path.map(p => Math.hypot(p[1], p[2]))),
    entry = Object.assign({}, base, { id: `top-${base.id}`, view: { yaw: r.yaw ?? BEHIND, pitch: 1.3, y: 0.3, on: 1 - move.mover, frame: [(far + 0.55) / 0.33, 1] } });
  byId[entry.id] = entry;
  return { id, name: move.name + (rows.length > 1 ? ' ' + LEVEL[r.level].label : ''), en: move.en, note: r.note, stat: 'bearing', mover: move.mover, cards: [entry.id], plan: { move: r.move, level: r.level }, since: 'new', sinceNote: BEARING_NEW, sinceCards: null };
};

/* ---- the eight bearings: the part's two tables, and each row's path from above (src/bearing.data.mjs) */
const PUNCH_SAID = { jab: '잽', cross: '스트레이트', hook: '앞손 훅', upper: '어퍼', hookR: '뒷손 훅', hookBody: '리버 훅', crossBody: '바디 스트레이트' };
const fixed = (x, n = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(n);
const whole = x => (Math.round(x) > 0 ? '+' : Math.round(x) < 0 ? '−' : '') + Math.abs(Math.round(x));
// (a move that goes round and round is said as so many cells a second, and a cell in so many seconds)
const movedSaid = m => (m.rate !== undefined ? { cells: `초당 ${fixed(m.rate / 45)}`, time: `한 칸 ${m.perCell.toFixed(2)}` } : { cells: fixed(m.cells), time: m.time.toFixed(2) });
const bandSaid = m => `${BANDS[m.band[0]].name}→<wbr>${BANDS[m.band[1]].name}`;
function bearingHead() {
  const head = document.createElement('div'),
    items = PARTS.find(P => P.id === 'bearing').groups.flatMap(([, items]) => items),
    lines = [];
  head.className = 'bearing-head';
  // what each move does, grade by grade: grades whose numbers are the same on one line
  for (const [id, mv] of Object.entries(BEARING.moves)) {
    const groups = [];
    for (const [lv, m] of Object.entries(mv.levels)) {
      const said = movedSaid(m),
        key = [said.cells, said.time, bandSaid(m), whole(m.peak), m.window.toFixed(2)].join('|'),
        same = groups.find(g => g.key === key);
      if (same) same.levels.push(lv);
      else groups.push({ key, levels: [lv], m, said });
    }
    const row = items.find(i => i.plan.move === id);
    groups.forEach((g, i) =>
      lines.push(
        `<tr>${i === 0 ? `<th scope="row" rowspan="${groups.length}"><a href="#row-${row.id}">${mv.name}</a></th>` : ''}<td class="lv">${g.levels.length === LEVELS.length ? '전부' : g.levels.map(lv => LEVEL[lv].label).join('·<wbr>')}</td><td class="n">${g.said.cells}</td><td class="n">${g.said.time}</td><td class="band">${bandSaid(g.m)}</td><td class="n">${whole(g.m.peak)}${id === 'turn' ? '*' : ''}</td><td class="n">${g.m.window ? g.m.window.toFixed(2) : '0'}</td></tr>`
      )
    );
  }
  // what each cell is worth with nobody turning, at its middle (pros on both sides, each punch from its own distance)
  const W = BEARING.worth['3'],
    landed = (by, i) =>
      Object.entries(W[by])
        .filter(([, row]) => row[i].type === 'hit' || row[i].type === 'graze')
        .map(([p, row]) => `${PUNCH_SAID[p]} ${Math.round(row[i].J)}`)
        .join(' · ') || '없음',
    cells = [0, 1, 2, 3, 4, -3, -2, -1].map(k => {
      const c = CELLS.find(c => c.k === k),
        i = W.angles.findIndex(a => Math.abs(a - c.at) < 1e-6);
      return `<tr><th scope="row">${cellSaid(k)} ${c.name}</th><td>${landed('me', i)}</td><td>${landed('him', i)}</td></tr>`;
    });
  const still = Object.values(BEARING.moves).every(mv => Object.values(mv.levels).every(m => m.window === 0));
  head.innerHTML = `<figure class="bt"><figcaption>동작마다 돈 칸 <span>상대는 카드의 상대 그대로, 서서 따라 돕니다. 돈 칸은 끝에서(시프트는 내려설 때), 초는 거기까지(1° 안으로 들어올 때), 정점은 그가 내준 방위의 가장 큰 값, 창은 그것이 22.5°를 넘은 시간(초)${still ? '. 지금은 어느 동작도 한 칸을 잡지 못합니다' : ''}</span></figcaption>
      <table><thead><tr><th scope="col" class="l">동작</th><th scope="col" class="l">등급</th><th scope="col">돈 칸</th><th scope="col">초</th><th scope="col" class="l">띠</th><th scope="col">정점 °</th><th scope="col">창 초</th></tr></thead><tbody>${lines.join('')}</tbody></table>
      <p class="bt-note">* 따라 돌기는 상대가 카드의 선수 둘레를 돌고, 정점은 카드 선수의 정면 오차입니다.</p></figure>
    <figure class="bt"><figcaption>칸의 값 <span>아무도 돌지 않을 때 칸의 가운데에서, 3단계끼리, 주먹마다 제 거리에서 친 결과(N·s). 얻는 것은 가드를 든 그에게 들어가는 내 주먹, 내주는 것은 그의 주먹이 내게 닿는 것</span></figcaption>
      <table class="worth"><thead><tr><th scope="col" class="l">칸</th><th scope="col" class="l">얻는 것</th><th scope="col" class="l">내주는 것</th></tr></thead><tbody>${cells.join('')}</tbody></table></figure>
    <p class="plan-legend"><span><i class="sw path"></i>그 칸까지 간 길</span><span><i class="sw after"></i>그 뒤</span><span><i class="sw tick"></i>0.1초마다(긴 동작은 0.5초마다)</span><span><i class="sw lead"></i><i class="sw rear"></i>앞발 · 뒷발이 닿은 곳</span><span><i class="sw front"></i>처음 그의 정면</span><span><i class="sw facing"></i>끝에서 그의 정면</span></p>`;
  return head;
}
// a row's first card: the path from above, and its numbers at the card's grade
function planCard(item) {
  const { move, level } = item.plan,
    m = BEARING.moves[move].levels[level],
    said = movedSaid(m),
    card = document.createElement('article');
  card.className = 'card rung plan-card';
  card.setAttribute('role', 'listitem');
  card.innerHTML = `<div class="stage plan" role="img" aria-label="${item.name} ${LEVEL[level].label}: 위에서 본 길">${planOf(m)}</div>
    <div class="info"><h3>위에서 <span class="en">${LEVEL[level].label} · ${BEARING.moves[move].en}</span></h3>
      <div class="feet stats"><span>돈 칸 <b>${said.cells}</b></span><span><b>${said.time}</b> 초</span></div>
      <div class="feet stats"><span>정점 <b>${whole(m.peak)}</b>°</span><span>창 <b>${m.window.toFixed(2)}</b> 초</span></div>
      <div class="feet stats"><span>${bandSaid(m)}</span><span><b>${m.d[0].toFixed(2)}</b>→<b>${m.d[1].toFixed(2)}</b> m</span></div></div>`;
  return card;
}
/* The path from above: the other man in the middle, his front up and his lead hand to the left, the eight cells out to the
   edges of the picture and the rings of the bands; the man's centre (bold to where the numbers are taken, then thin), a dot
   every tenth of a second (every half in a long move), his feet where they came down, and the other man's front as it
   started and as it ended. Lines
   and dots keep their width in pixels however wide the card is, and the writing is the page's, laid over it. */
function planOf(m) {
  const S = 100,
    far = Math.max(1.25, ...m.path.map(p => Math.hypot(p[1], p[2])), ...m.feet.map(f => Math.hypot(f[1], f[2]))) + 0.3,
    H = far,
    Wd = far * 1.25,
    big = Math.hypot(Wd, H),
    // (metres in that frame: x round to his lead hand, to the left; y ahead of him, up)
    P = (x, y) => [-x * S, -y * S],
    round = (deg, r) => P(r * Math.sin((deg * Math.PI) / 180), r * Math.cos((deg * Math.PI) / 180)),
    xy = q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`,
    // (writing kept inside the picture however narrow it is)
    pct = q => `left:${Math.min(95, Math.max(5, ((q[0] + Wd * S) / (2 * Wd * S)) * 100)).toFixed(2)}%;top:${Math.min(94, Math.max(6, ((q[1] + H * S) / (2 * H * S)) * 100)).toFixed(2)}%`,
    dot = (q, cls) => `<path class="${cls}" d="M${xy(q)}h0.01"/>`,
    line = (a, b, cls) => `<path class="${cls}" d="M${xy(a)}L${xy(b)}"/>`,
    // (the edge of the picture, along a bearing)
    rim = deg => {
      const a = (deg * Math.PI) / 180;
      return Math.min(Math.abs(Math.sin(a)) > 1e-6 ? Wd / Math.abs(Math.sin(a)) : Infinity, Math.abs(Math.cos(a)) > 1e-6 ? H / Math.abs(Math.cos(a)) : Infinity);
    },
    upto = m.path.filter(p => p[0] <= m.mark + 1e-6),
    after = m.path.filter(p => p[0] >= m.mark - 1e-6),
    out = [];
  CELLS.forEach((c, i) => out.push(`<polygon class="sec${i % 2 ? ' odd' : ''}" points="0,0 ${Array.from({ length: 10 }, (_, j) => xy(round(c.at - 22.5 + j * 5, big))).join(' ')}"/>`));
  CELLS.forEach(c => out.push(line(round(c.at + 22.5, 0.3), round(c.at + 22.5, big), 'edge')));
  BANDS.filter(b => b.to < big).forEach(b => out.push(`<circle class="ring" r="${b.to * S}"/>`));
  // (him: his head, his shoulders turned with his chest 38 degrees to his right, his front as it started, and as it ended)
  out.push(`<ellipse class="body" rx="${0.24 * S}" ry="${0.09 * S}" transform="rotate(38)"/><circle class="body head" r="${0.1 * S}"/>`);
  out.push(line(round(0, 0.14), round(0, 0.55), 'front'), line(round(m.end, 0.14), round(m.end, 0.45), 'facing'));
  out.push(`<polyline class="after" points="${after.map(p => xy(P(p[1], p[2]))).join(' ')}"/><polyline class="path" points="${upto.map(p => xy(P(p[1], p[2]))).join(' ')}"/>`);
  const every = m.mark > 2 ? 0.5 : 0.1;
  for (const p of upto) if (p[0] > 0 && Math.abs(p[0] / every - Math.round(p[0] / every)) < 0.02 / (every * 10)) out.push(dot(P(p[1], p[2]), 'tick'));
  for (const f of m.feet) out.push(dot(P(f[1], f[2]), 'foot ' + (f[3] === 'L' ? 'lead' : 'rear')));
  if (upto.length) out.push(dot(P(upto[0][1], upto[0][2]), 'start'), dot(P(upto[upto.length - 1][1], upto[upto.length - 1][2]), 'mark'));
  const labels = CELLS.map(c => `<span class="k" style="${pct(round(c.at, Math.max(0.9, rim(c.at) - 0.14)))}">${cellSaid(c.k)}</span>`).concat(
    // (along the line behind him, a little to his lead hand's side, clear of the cell's number; the narrow ones only on a wide page)
    BANDS.filter(b => b.from < far - 0.15).map(b => {
      const from = Math.max(b.from, 0.62);
      return `<span class="band${b.to - from < 0.2 ? ' thin' : ''}" style="${pct(round(166, (from + Math.min(b.to, far)) / 2))}">${b.name}</span>`;
    })
  );
  return `<svg viewBox="${-Wd * S} ${-H * S} ${2 * Wd * S} ${2 * H * S}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out.join('')}</svg>${labels.join('')}`;
}

const FX_NOTE = '이펙트: 예전 색의 입자가 맞은 몸의 반대쪽 면에서 타격 방향으로 나가고, 흰 번쩍임 대신 닿은 점에서 파문이 퍼짐';
// (a knockdown's own, plan 6 §2.4B and §2.4C: what its cards show now besides)
const DOWN_NOTE = '이펙트: 입자 대신 용암 덩이와 불티를 빠르게 두 번 잇달아. 덩이는 머리가 뜨겁고 꼬리로 갈수록 식은 여러 색으로 날다가 숯처럼 검게 식고, 불티는 깜빡이며 떠다니다 꺼짐. 흰 번쩍임 대신 파문, 캔버스에 닿는 곳에서 두 번째 파문과 바닥의 큰 고리 파문, 닿고 0.3초 뒤 ¼ 속도·1.2배 줌 리플레이';
/* ---- what is new or changed since the catalogue was last published as the user reviewed it (version 22, commit 14594d1),
   by row: measured, not guessed. A row is changed where a card of it moved (every joint of both men compared frame by frame
   with the scripts at 14594d1: the cards listed moved more than 1 mm, the waist of plan 6 stage K turning what the chest used
   to) or where what it exists to show is drawn otherwise (the being-hit and knockdown cards: the blow's effect of stage J,
   and the knockdown's own effect, its lava and its replay, §2.4B and §2.4C).
   No punch's events changed (node tools/events.mjs --diff is empty), and no row is new but the eight bearings' (stage O of
   docs/bearing-system-plan.md: marked where they are made, bearingRow). The note says what changed. */
const SINCE = {
  // changed: the waist (stage K)
  dashSide: { since: 'changed', cards: ['5m', '5a'], note: '5명·5암의 대시 중 U자 위빙을 허리가 돌림(머리·글러브 최대 0.42·0.71 cm, 허리 6.2°·8.4°)' },
  circle: { since: 'changed', cards: ['5m', '5a'], note: '5명·5암의 걸음마다 위빙을 허리가 돌림(최대 0.64·0.42 cm, 허리 6.8°·6.0°)' },
  side: { since: 'changed', cards: ['5m', '5a'], note: '5명·5암의 걸음마다 위빙을 허리가 돌림(최대 0.48·0.20 cm)' },
  dash: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.63 cm, 허리 7.7°)' },
  dashIn: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.42 cm, 허리 7.5°)' },
  inout: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.48 cm, 허리 7.9°)' },
  turn: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.24 cm, 허리 6.0°)' },
  bounce: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.22 cm, 허리 6.0°)' },
  onetwo: { since: 'changed', cards: ['5a'], note: '5암의 어깨 페인트를 허리가 돌림(최대 0.11 cm)' },
  wave: { since: 'changed', cards: ['4m', '5m'], note: '파도의 흔들림과 어깨 페인트를 허리가 돌림(최대 0.37·0.54 cm, 허리 4.0°·9.3°)' },
  slick: { since: 'changed', cards: ['4m', '5m'], note: '파도의 흔들림을 허리가 돌림(최대 0.37·0.54 cm)' },
  // changed: the blow's effect (stage J)
  'hit-jab': { since: 'changed', note: FX_NOTE },
  'hit-cross': { since: 'changed', note: FX_NOTE },
  'hit-hook': { since: 'changed', note: FX_NOTE },
  'hit-upper': { since: 'changed', note: FX_NOTE },
  'stagger': { since: 'changed', note: FX_NOTE },
  'down-back': { since: 'changed', note: DOWN_NOTE },
  'down-knee': { since: 'changed', note: DOWN_NOTE },
  'down-side': { since: 'changed', note: DOWN_NOTE },
  'down-front': { since: 'changed', note: DOWN_NOTE },
  'out-twist': { since: 'changed', note: DOWN_NOTE },
  'out-log': { since: 'changed', note: DOWN_NOTE },
  'out-limp': { since: 'changed', note: DOWN_NOTE },
  'body-solar': { since: 'changed', note: FX_NOTE },
  'body-liver': { since: 'changed', note: FX_NOTE },
  'body-ribs': { since: 'changed', note: FX_NOTE },
  'down-liver': { since: 'changed', note: DOWN_NOTE }
};
const SINCE_SAID = { new: '새', changed: '바뀜' };
/* What has nothing new or changed is folded away (the user's rule: only what moved is open): a row or a card on its own shows
   its name alone, with this button to open it; a link to it (the contents, the list of changes) opens it; and one button at the
   top opens or folds them all. A folded card's stage has no size, so it is neither stepped nor drawn. */
const FOLD = '<button type="button" class="fold" aria-expanded="false">펼치기</button>';
function unfold(el, open) {
  if (!el || !(el.classList.contains('folded') || el.dataset.unfolded)) return;
  el.classList.toggle('folded', !open);
  el.dataset.unfolded = open ? '1' : '';
  const button = el.querySelector('button.fold');
  if (button) (button.textContent = open ? '접기' : '펼치기'), button.setAttribute('aria-expanded', String(open));
}
function folding() {
  document.addEventListener('click', ev => {
    const button = ev.target.closest && ev.target.closest('button.fold');
    if (button) return unfold(button.closest('.item, .card'), button.getAttribute('aria-expanded') !== 'true');
    const link = ev.target.closest && ev.target.closest('a[href^="#row-"]');
    if (link) unfold(document.getElementById(link.getAttribute('href').slice(1)), true);
  });
  const all = document.getElementById('fold-all');
  if (all)
    all.addEventListener('click', () => {
      const open = all.getAttribute('aria-pressed') !== 'true';
      all.setAttribute('aria-pressed', String(open));
      for (const el of document.querySelectorAll('.item, .card')) unfold(el, open);
    });
  if (location.hash.startsWith('#row-')) unfold(document.getElementById(location.hash.slice(1)), true);
}

const PARTS = [
  {
    id: 'footwork',
    part: '풋워크',
    note: '모든 기술은 다섯 단계이고, 4와 5에는 깔끔한 정도(명)와 더티 복싱(암) 두 갈래가 있어 일곱 장이 두 장씩 놓입니다. 일곱 장은 같은 대본을 한 시계로 돌리므로, 다른 것은 그리로 가는 몸뿐입니다. 발자국의 노란색은 앞발, 파란색은 뒷발이고, L 카드의 빨간 등불은 강박(앞발 착지)에 켜집니다.',
    groups: [
      ['박자', ['bounce', 'pendulum']],
      ['직선', ['inout', 'stalk', 'dash', 'dashIn']],
      ['좌우', ['side', 'circle', 'turn', 'dashSide']],
      ['주먹과 함께', ['stepjab', 'onetwo']]
    ].map(([group, ids]) => [group, ids.map(id => footRow(ENTRIES.find(e => e.id === id)))])
  },
  {
    id: 'defense',
    part: '수비',
    note: '상대는 일곱 장 모두 같은 프로(3단계)이고 같은 순간에 같은 주먹을 던집니다. 수비하는 쪽은 그 등급 자기 구간의 가운데에서 누르고(구간은 tools/windows.mjs로 잰 값), 피했는지 막았는지는 글러브와 머리의 실제 접촉입니다. 아슬아슬하게 피하고 0.4초 안에 장전된 카운터가 나간 수비는 그 카드에서만 1/4 속도로 다시 보여 줍니다.',
    groups: [
      ...['피하기', '막기', '카운터'].map(group => [group, GUARDS.filter(i => i.group === group).map(i => ({ id: i.id, name: i.name, en: i.en, note: i.note, stat: i.id, cards: LEVELS.map(lv => `${i.id}@${lv}`) }))]),
      // (the pull counter: a technique, game/techniques.mjs, every grade's; the cards name the way, no dice)
      ['풀백 3형제', PULL_WAYS.map(w => graded(w, PULL_NOTE[w.id], 'pulled', LEVELS))]
    ]
  },
  {
    id: 'punches',
    part: '주먹',
    note: '차이는 데미지 배율이 아니라 관절이 움직이는 순서와 협응, 리듬에서 나옵니다. 충격량은 곱해 준 값이 아니라 그렇게 던진 결과이고, 막대는 관절마다 출발에서 정점까지, 세로선은 닿은 순간, 시간은 누른 뒤부터입니다. 머리는 닿는 순간 머리가 자기 가드 자리에서 선 밖으로 벗어난 거리, 골반은 가장 많이 돈 각입니다.',
    groups: [
      ['주먹', PUNCHES.filter(p => !p.inside).map(p => ({ id: p.id, name: p.name, en: p.en, note: PUNCH_NOTE[p.id], stat: 'rung', cards: LEVELS.map(lv => `${p.id}@${lv}`) }))],
      ['초근거리', PUNCHES.filter(p => p.inside).map(p => ({ id: p.id, name: p.name, en: p.en, note: PUNCH_NOTE[p.id], stat: 'rung', knee: p.id === 'upperIn', cards: LEVELS.map(lv => `${p.id}@${lv}`) }))],
      ['뒷손 훅', REAR.map(p => graded(p, BODY_NOTE[p.id], 'rung', LEVELS))],
      ['암의 기술', TECHNIQUES.map(t => ({ id: t.id, name: t.name, en: t.en, note: TECH_NOTE[t.id], stat: 'foul', cards: LEVELS.map(lv => `${t.id}@${lv}`) }))]
    ]
  },
  {
    id: 'body',
    part: '바디샷',
    note: '몸통도 맞는 곳입니다. 허리에서 가슴까지를 공 다섯 개로 잇고, 닿은 점을 가슴이 보는 방향으로 읽어 간(그의 오른쪽), 명치(정면), 갈비(왼쪽)로 나눕니다. 몸통은 체력을 머리의 60%만 깎고 숨을 깎으며(간이 가장 많이), 실신은 없습니다. 바디 주먹은 기술이 아니라 기본 동작이고 시합에서는 머리가 콤비네이션의 주먹마다 고릅니다. 몸통은 가드 글러브가 아니라 팔꿈치와 아래팔이 막습니다. 주먹 줄의 상대는 아마추어 자세로 서서 맞기만 하고, 막기 줄의 상대는 프로입니다.',
    groups: [
      ['바디 주먹', BODY_PUNCHES.map(p => graded(p, BODY_NOTE[p.id], 'rung', LEVELS, { drop: true, knee: !!p.inside }))],
      ['맞는 곳', BODYSHOTS.filter(e => !e.level && e.group === '맞기').map(single)],
      ['팔꿈치 블록', [BODYSHOTS.find(e => e.item === 'block-elbow'), LIVER_BLOCK[0]].map(e => graded({ id: e.item, name: e.name, en: e.en }, e.note, 'met', LEVELS))],
      ['리버 다운', BODYSHOTS.filter(e => e.liver).map(single)]
    ]
  },
  {
    id: 'clean',
    part: 'L 전용 기술',
    note: '4명과 5명만 여는 기술입니다. 조작이 없는 오토배틀러라 기본 동작이 아닌 것은 선수가 로드아웃에 갖고 머리가 고르는 기술이고(game/techniques.mjs), 카드는 기술을 이름으로 불러 머리의 주사위를 거치지 않습니다. 한 줄에 4명과 5명 두 장입니다.',
    groups: [
      ['파도', WAVE_ROWS.map(r => graded(r, CLEAN_NOTE[r.id], r.id === 'slick' ? 'slick' : 'wave', ['4m', '5m']))],
      ['다운패링 카운터', [graded({ id: 'parryDown', name: '다운패링 카운터', en: 'Down parry and counter' }, CLEAN_NOTE.parryDown, 'parryDown', ['4m', '5m'])]],
      ['블록 & 파이어', [graded({ id: 'blockFire', name: '블록 & 파이어', en: 'Block and fire' }, CLEAN_NOTE.blockFire, 'fired', FIRE_LEVELS)]],
      ['피커부 셸', SHELL_ROWS.map(r => graded(r, CLEAN_NOTE[r.id], 'shell', SHELL_LEVELS))],
      ['타이슨 시프트', SHIFT_ROWS.map(r => graded(r, CLEAN_NOTE[r.id], 'shift', SHIFT_LEVELS))]
    ]
  },
  {
    id: 'cross',
    part: '크로스암 가드 · 숄더 롤',
    note: '크로스암 가드와 숄더 롤은 고르는 기술입니다. 카드의 선수는 등급과 함께 그 기술을 받고, 상대는 프로입니다. 크로스암은 주사위가 없어 가진 선수의 가드가 늘 그 모양이고(몸통으로 온 주먹을 그 팔로 받으면 4 이상은 뒷손으로 반격), 숄더 롤은 머리가 스트레이트의 다리가 발사되는 순간 고르고 굴린 다음 스텝에 뒷손 훅으로 반격합니다. 카드는 반격을 머리처럼 누릅니다. 수비 줄의 4암·5암 카드도 이 가드입니다.',
    groups: [
      ['크로스암 가드', ['crossArm', 'crossArm-hook'].map(id => CROSS_ARM.find(e => e.item === id)).map(e => graded({ id: e.item, name: e.name, en: e.en }, CROSS_NOTE[e.item], 'met', CROSS_LEVELS))],
      ['크로스암 · 바디', CROSS_BODY_ROWS.map(r => graded(r, CROSS_NOTE[r.id], 'crossed', CROSS_LEVELS))],
      ['숄더 롤 & 카운터', [graded({ id: 'rollCounter', name: '숄더 롤 & 카운터', en: 'The shoulder roll and counter' }, CROSS_NOTE.rollCounter, 'rolled', ROLL_LEVELS)]]
    ]
  },
  {
    id: 'showoff',
    part: '과시형 암',
    note: '4암과 5암은 과시형입니다. 앞손을 허리에 내리고(진자처럼 흔들림) 상체를 뒤로 눕히고 턱을 내밀며, 가드는 고전형 크로스암(뒷 글러브는 턱 앞, 앞팔은 배 앞)이고, 막 올린 가드는 턱 앞에서 출발해 뒷손으로 내려찍는 패리입니다(수비의 4암·5암 카드). 버튼을 누르면 조건이 맞을 때 시드에서 나온 확률로 기술이 바뀌고, 동작이 없을 때와 특정 순간에 도발합니다. 카탈로그는 기술과 도발을 지정해서 돌립니다. 일곱 장 가운데 기술은 4암·5암에만 있고, 나머지 등급은 같은 자리에서 같은 버튼의 보통 동작을 합니다. 상대는 프로입니다.',
    groups: [
      ['기술', TRICKS.map(t => ({ id: t.id, name: t.name, en: t.en, note: TRICK_NOTE[t.id], stat: 'trick', cards: LEVELS.map(lv => `${t.id}@${lv}`) }))],
      ['도발', TAUNT_ROWS.map(t => ({ id: t.id, name: t.name, en: t.en, note: TAUNT_NOTE[t.id], stat: 'taunt', cards: LEVELS.map(lv => `${t.id}@${lv}`) }))]
    ]
  },
  {
    id: 'moving',
    part: '진입 · 이탈',
    note: '들어갈 때는 머리를 주먹 선 밑으로 낮춰 파고들고, 나올 때는 가드를 풀고 발목으로 튀어 사거리 밖으로 나갑니다. 어디까지 가는지는 시합이 정하고, 카드는 루프마다 새 시합에서 다시 칩니다. 상대는 프로이고 서 있기만 합니다.',
    groups: [['진입 · 이탈', MOVING.map(m => ({ id: m.id, name: m.name, en: m.en, note: MOVE_NOTE[m.id], stat: 'moving', cards: LEVELS.map(lv => `${m.id}@${lv}`) }))]]
  },
  {
    id: 'bearing',
    part: '팔방',
    note: '그가 바라보는 쪽(그의 정면)을 위로 두고 그의 둘레를 여덟 칸으로 나눕니다: 정면 0, 그의 앞손 쪽(그의 왼쪽, 바깥)으로 +1 +2 +3, 등 뒤 4, 뒷손 쪽(안)으로 −1 −2 −3. 칸은 45°씩이고 경계를 4° 넘어야 바뀌며, 거리는 여섯 띠입니다. 동작마다 숫자가 둘입니다: 돈 칸(동작이 시작할 때 그의 정면선에서 내가 그의 둘레로 돈 각 ÷ 45°: 내 발이 한 일)과 잡은 방위(그의 틀에서 내가 있는 곳: 그가 못 따라와 내준 것), 그리고 그것이 한 칸(22.5°) 넘게 남은 시간(창). 숫자는 tools/bearing.mjs가 카드의 대본을 실제로 돌려 잰 값이고, 동작은 하나도 바뀌지 않았습니다. 줄마다 왼쪽은 위에서 본 길, 오른쪽은 같은 대본의 카드(그의 뒤 위에서)입니다.',
    head: true,
    groups: [...new Set(BEARING_ROWS.map(r => r.group))].map(group => [group, BEARING_ROWS.filter(r => r.group === group).map(bearingRow)])
  },
  {
    id: 'hurt',
    part: '맞기와 다운',
    note: '맞는 반응과 다운은 등급을 매기지 않습니다. 충격량과 그 방향이 만드는 것이고, 등급이 바꾸는 것은 맞기 직전의 자세뿐입니다. 한 장씩 놓습니다. 실신은 주먹마다 다릅니다: 스트레이트는 통나무, 훅은 고개가 돌아간 통나무, 어퍼는 들렸다가 천천히 풀리는 림프입니다.',
    groups: [
      ['맞기', DEFENSE.filter(e => !e.level && e.group === '맞기').map(single)],
      ['다운', DEFENSE.filter(e => !e.level && e.group === '다운' && !e.out).map(single)],
      ['실신', DEFENSE.filter(e => !e.level && e.out).map(single)]
    ]
  }
];
for (const P of PARTS)
  for (const [, items] of P.groups)
    for (const item of items) {
      const s = SINCE[item.id];
      if (s) Object.assign(item, { since: s.since, sinceNote: s.note, sinceCards: s.cards || null });
    }

/* ---- the page, written from the parts (so the page and the bouts cannot disagree about what is in the catalogue): the
   contents first, a link to every part and every row (and to each row that is new or changed, with what changed), and each
   row's heading carrying its anchor (row-<id>) and its mark */
const main = document.getElementById('catalog'),
  ROWS = [], // { item, ids }
  badge = s => (s ? `<span class="since ${s}">${SINCE_SAID[s]}</span>` : ''),
  esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function contents() {
  const toc = document.getElementById('toc'),
    marked = PARTS.flatMap(P => P.groups.flatMap(([, items]) => items.filter(i => i.since).map(i => Object.assign({ part: P.part }, i))));
  toc.innerHTML = `<h2 class="toc-title">차례</h2>
    <p class="legend"><span>${badge('new')} 지난 게시본(v22, <code>14594d1</code>)에 없던 줄</span><span>${badge('changed')} 같은 대본을 그때와 지금 돌려 몸이 1 mm 넘게 움직인 줄(허리), 또는 맞는 그림이 달라진 줄(이펙트)</span></p>
    <details class="changes" open><summary>이번에 새로 들어오고 바뀐 것: 새 줄 <b>${marked.filter(i => i.since === 'new').length}</b> · 바뀐 줄 <b>${marked.filter(i => i.since === 'changed').length}</b></summary>
      <ul>${marked.sort((x, y) => (x.since === y.since ? 0 : x.since === 'changed' ? -1 : 1)).map(i => `<li>${badge(i.since)}<a href="#row-${i.id}">${i.name}</a><span>${esc(i.sinceNote)}</span></li>`).join('')}</ul></details>
    <ol class="toc-parts">${PARTS.map(P => `<li><a class="toc-part" href="#part-${P.id}">${P.part}</a><ul class="toc-rows">${P.groups.flatMap(([, items]) => items).map(i => `<li><a href="#row-${i.id}">${i.name}${badge(i.since)}</a></li>`).join('')}</ul></li>`).join('')}</ol>`;
}
contents();
for (const P of PARTS) {
  const head = document.createElement('h2');
  head.className = 'part';
  head.id = `part-${P.id}`;
  head.textContent = P.part;
  main.append(head);
  const note = document.createElement('p');
  note.className = 'part-note';
  note.textContent = P.note;
  main.append(note);
  if (P.head) main.append(bearingHead());
  for (const [group, items] of P.groups) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${group}</h2>`;
    const singles = items.filter(i => i.single),
      rows = items.filter(i => !i.single);
    if (singles.length) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const i of singles) grid.append(singleCard(byId[i.id], i));
      section.append(grid);
      ROWS.push(...singles.map(i => ({ item: Object.assign({}, i, { stat: 'single' }), ids: [i.id] })));
    }
    for (const item of rows) {
      const block = document.createElement('div');
      block.className = 'item' + (item.since ? ' since-' + item.since : ' folded'); // (a row with nothing new or changed is folded away: its name alone, until it is asked for)
      block.dataset.item = item.id;
      block.id = `row-${item.id}`;
      block.innerHTML = `<div class="item-head"><h3>${item.name}${badge(item.since)} <span class="en">${item.en}</span>${item.since ? '' : FOLD}</h3>${item.since ? `<p class="since-note">${esc(item.sinceNote)}</p>` : ''}<p>${item.note}</p></div><div class="row7" role="list"></div>`;
      if (item.plan) block.lastElementChild.append(planCard(item));
      for (const id of item.cards) block.lastElementChild.append(gradeCard(byId[id], item));
      section.append(block);
      ROWS.push({ item, ids: item.cards });
    }
    main.append(section);
  }
}
folding();
// (a thread of notes under every row and every card on its own: src/memo.mjs)
attachMemos({
  items: ROWS.map(({ item }) => ({
    id: item.id,
    name: item.name || byId[item.id].name,
    host: item.single ? document.getElementById(`row-${item.id}`).querySelector('.info') : document.getElementById(`row-${item.id}`)
  })),
  line: document.getElementById('memo-store'),
  toc: id => document.querySelector(`#toc .toc-rows a[href="#row-${id}"]`)
});
shownAsLD(document.body);
// (opened at a row's address: the page is written by now, so go there; the browser's own jump came before it was)
if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView();

/* On the page the two branches of grades 4 and 5 read L (명, clean) and D (암, dirty); the data keeps 명 and 암.
   A Korean particle after the letter follows how it is said: L ends in a consonant (엘), D in a vowel (디). */
function asLD(s) {
  const after = { L: { 는: '은', 와: '과', 가: '이', 를: '을' }, D: { 은: '는', 과: '와', 이: '가', 을: '를' } },
    swap = (ld, j = '') => ld + (after[ld][j] || j);
  return s
    .replace(/([45])명(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('L', j))
    .replace(/([45·])암(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('D', j))
    .replace(/· 명/g, '· L')
    .replace(/· 암/g, '· D')
    .replace(/\((명|암)\)/g, (_, w) => (w === '명' ? '(L)' : '(D)'))
    .replace(/(^|[\s,(])암(은|는|과|와|의|에)/g, (_, b, j) => b + swap('D', j));
}
function shownAsLD(root) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/[명암]/.test(n.nodeValue)) n.nodeValue = asLD(n.nodeValue);
  for (const el of root.querySelectorAll('[aria-label], [title]'))
    for (const k of ['aria-label', 'title']) if (el.hasAttribute(k)) el.setAttribute(k, asLD(el.getAttribute(k)));
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
      // (the joints from the canvas up, a joint it holds still greyed; a waist it does not turn is not shown)
      const skip = skipped(MOVES[e.punch].chain);
      stats = `<div class="chain">${ORDER.filter(l => l !== 'waist' || !skip.includes(l)).map(l => `<span class="row${skip.includes(l) ? ' off' : ''}"><i>${JOINT[l]}</i><span class="lane"><b data-bar="${LINKS.indexOf(l)}"></b></span></span>`).join('')}<span class="hit-at" data-at></span></div>
        <div class="feet result"><span><b data-blow>–</b> N·s</span><span class="pace"><b data-ms>–</b> ms</span></div>` + (item.knee ? pair('무릎 <b data-knee>–</b>°', '골반 <b data-turn>–</b>°') : pair('머리 <b data-off>–</b> cm', '골반 <b data-turn>–</b>°')) + (item.drop ? pair('머리 하강 <b data-drop>–</b> cm') : '') + (beat ? `<div class="feet stats">${beat}<span>닿은 박자 <b data-on>–</b></span></div>` : '');
      break;
    }
    case 'foul':
      stats = pair(`${level.side === 'a' ? FOUL[e.foul] : '반칙 없음'}`, level.side === 'a' ? '<b data-fj>–</b> N·s' : '') + pair('<span data-fat></span>') + pair('주먹 <b data-blow>–</b> N·s');
      break;
    case 'trick':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair(level.vary ? item.name : '보통 주먹', '<b data-blow>–</b> N·s') + pair('<b data-ms>–</b> ms');
      break;
    case 'taunt':
      stats = pair(level.stance.show ? item.name : '도발 없음', '<b data-a>–</b> 초');
      break;
    // (plan 5: a block that says what met it; the shoulder roll; the wave and its slick back; the down parry)
    case 'met':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> N·s', '<b data-b>–</b>');
      break;
    // (the roll & counter: the window and the room it leaves, and from the roll to the rear hook landing, and how hard)
    case 'rolled':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair(`<b>${e.window ? span(e.window) : '–'}</b> f`, '여유 <b data-a>–</b> cm') + pair('훅까지 <b data-c>–</b> ms', '<b data-b>–</b> N·s');
      break;
    // (the cross-arm guard against a punch to the body: how hard, what met it; and its counter, how soon after, how hard)
    case 'crossed':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> N·s', '<b data-b>–</b>') + pair(CROSS[e.level] && CROSS[e.level].counter ? '반격 <b data-c>–</b> ms' : '반격 없음', CROSS[e.level] && CROSS[e.level].counter ? '<b data-d>–</b> N·s' : '');
      break;
    case 'wave':
      stats = pair('물결 <b data-a>–</b> 초', '깊이 <b data-b>–</b> cm') + pair('거리 <b data-c>–</b> m');
      break;
    case 'slick':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('여유 <b data-a>–</b>', '거리 <b data-b>–</b> m');
      break;
    case 'parryDown':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair(`<b>${span(e.window)}</b> f`, '반격 <b data-a>–</b> ms') + pair('<b data-b>–</b> N·s');
      break;
    case 'pulled':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> ms', '<b data-b>–</b> N·s');
      break;
    // (block and fire: from the block to the uppercut landing, and how hard; the shell: how far down his head goes, how soon)
    case 'fired':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('막은 뒤 <b data-a>–</b> ms', '<b data-b>–</b> N·s');
      break;
    case 'shell':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('머리 <b data-a>–</b> cm', '<b data-b>–</b> ms');
      break;
    // (the eight bearings: the cell the man going round is in now, in the other man's frame, the bearing, and the band)
    case 'bearing':
      stats = pair('칸 <b data-a>–</b>', '<b data-b>–</b>°') + pair('띠 <b data-c>–</b>');
      break;
    // (the Tyson shift: the three punches' impulses, the first to the body hook, and where he ends)
    case 'shift':
      stats = `<div class="feet result"><span class="tag" data-tag>–</span></div>` + pair('<b data-a>–</b> N·s', '바디 훅까지 <b data-b>–</b> ms') + pair('끝 <b data-c>–</b>');
      break;
  }
  // (a card of a changed row that came out otherwise than it did: its own mark)
  const changed = item.sinceCards && item.sinceCards.includes(e.level);
  if (changed) card.classList.add('changed');
  card.innerHTML = `<div class="stage" role="img" aria-label="${item.name} ${level.label} 애니메이션"><span class="replay" hidden>리플레이 ¼</span>${changed ? '<span class="mark">바뀜</span>' : ''}</div>
    <div class="info"><h3>${level.label} <span class="en">${level.name}</span></h3>${stats}${beat && FOOTWORK_STATS.includes(item.stat) ? `<div class="feet">${beat}<span>강박</span></div>` : ''}</div>`;
  return card;
}
// a card on its own (being hit, going down), its anchor and its mark with it
function singleCard(e, item = {}) {
  const card = document.createElement('article');
  card.className = 'card' + (item.since ? ' since-' + item.since : ' folded');
  card.dataset.entry = e.id;
  card.id = `row-${e.id}`;
  card.innerHTML = `<div class="stage" role="img" aria-label="${e.name} 애니메이션"><span class="replay" hidden>리플레이 ¼</span></div>
    <div class="info"><h3>${e.name}${badge(item.since)} <span class="en">${e.en}</span>${item.since ? '' : FOLD}</h3>${item.since ? `<p class="since-note">${esc(item.sinceNote)}</p>` : ''}<p>${e.note}</p>
      ${e.status ? `<div class="feet result"><span class="tag">${e.status}</span></div>` : `<div class="feet result"><span class="tag" data-tag>–</span><span class="pace"><b data-blow>–</b> N·s</span></div>`}${e.out ? `<div class="feet stats"><span>머리가 닿기까지 <b data-a>–</b> s</span></div>` : ''}${e.liver ? `<div class="feet stats"><span>무릎이 닿기까지 <b data-a>–</b> s</span></div>` : ''}</div>`;
  return card;
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
      out: Object.fromEntries(['a', 'b', 'c', 'd', 'pace', 'blow', 'ms', 'hips', 'head', 'on', 'fj', 'fat', 'off', 'turn', 'knee', 'drop'].map(k => [k, q(el, `[data-${k}]`)])),
      bars: [...el.querySelectorAll('[data-bar]')],
      at: q(el, '[data-at]'),
      exchange: entry.punch !== undefined || !!entry.fresh,
      fx,
      mesh: R.mesh(fx.rows, 0, true),
      // (what a blow throws off each man, apart from the rest: kept off his own silhouette, render/blow.mjs)
      motes: [0, 1].map(() => {
        const m = createFx();
        return { fx: m, mesh: R.mesh(m.rows, 0, true) };
      }),
      ripples: [null, null],
      falls: [null, null], // a man knocked down, until he comes down on the canvas (render/blow.mjs: fallOf)
      ground: null, // and the ring through the canvas from where he did
      again: null, // what a replay throws again, apart from what the live bout threw (made the first time it is needed)
      bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
      replay: createReplay(),
      shown: null, // what is being drawn, while a replay plays
      held: null, // the camera's target before a knockdown's replay drew it in

      cam: { target: [0.45, entry.view.y ?? (entry.level ? 0.95 : entry.punch !== undefined ? 0.85 : 0.52), 0], yaw: entry.view.yaw, pitch: entry.view.pitch, dist: 5.4 },
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
    cell.ripples = [null, null];
    cell.falls = [null, null];
    cell.ground = null;
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
      // (rolled off the shoulder, pressed down: said as such)
      if (by === 1 && SAID[e.type]) tell(cell, e.down && e.type !== 'parry' ? (e.out ? '실신' : '다운') : e.roll ? '굴림' : e.type === 'parry' && e.down ? '눌러 내림' : SAID[e.type] + (e.brilliant ? '!' : ''), e.J);
      // (a defence found brilliant after the event it was: the counter decides it)
      if (e.type === 'brilliant' && e.who === 0 && cell.tag) tell(cell, SAID[e.of] + '!');
      /* the blow itself, as the game shows it (render/blow.mjs): sparks sized by its impulse off the far side of what it
         struck, a ripple through him from where it landed, and the picture shaken */
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85);
        blow(cell.motes[e.on].fx, e, bout.fighters[e.on]);
        cell.ripples[e.on] = rippleOf(e, bout.fighters[e.on]);
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
        if (fallOf(e)) cell.falls[e.on] = fallOf(e);
      } else if (e.type === 'block') (met(cell.fx, e), (cell.shake = 1));
      else if (e.type === 'parry') (met(cell.fx, e), (cell.shake = 2));
      measureEvent(cell, e, a, b);
    }
    // (where a knocked-down man first comes down on the canvas: a second ripple through him, and a ring through the canvas)
    cell.falls.forEach((fall, i) => {
      const at = landed(fall, bout.fighters[i]);
      if (at) (cell.ripples[i] = landRipple(fall, bout.fighters[i], at)), (cell.ground = groundOf(fall, at));
    });
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
          put(cell, 'drop', ((guard.headY - a.points.head[1]) * 100).toFixed(1));
          put(cell, 'turn', String(Math.round(m.most)));
          if (cell.out.on) {
            const u = a.animator.rhythm.u,
              from = Math.min(u, 1 - u);
            put(cell, 'on', from <= 0.12 ? '정박' : from >= 0.3 ? '엇박' : '–');
          }
          cell.bars.forEach(bar => {
            const i = +bar.dataset.bar,
              on = c.fired[i] >= 0;
            bar.style.left = on ? pct(c.fired[i]) : '0';
            bar.style.width = on ? `max(3px, ${pct(Math.max(0, c.peakAt[i] - c.fired[i]))})` : '0';
          });
          cell.at.style.setProperty('--at', String(Math.max(0, Math.min(1, (cell.t - (m.press ?? cell.t)) / SPAN))));
          cell.at.classList.add('on');
        }
        break;
      case 'single':
        // (knocked out cold: from the blow to his head on the canvas; down from the liver: to his knee on it)
        if ((entry.out || entry.liver) && e.type === 'hit' && e.who === 1 && (e.down || entry.liver)) m.downAt = cell.t;
        break;
      case 'met':
        // (the last block of the exchange: how hard, and what met it)
        if (e.type === 'block' && e.who === 1) put(cell, 'a', String(Math.round(e.J))), put(cell, 'b', MET[e.part] || e.part || '–');
        if (e.type === 'hit' && e.who === 1) put(cell, 'a', String(Math.round(e.J))), put(cell, 'b', '맞음');
        break;
      case 'rolled':
        // (rolled off his shoulder, and the counter after it: on the bout's clock, as tests/show.test.mjs times it)
        if (e.type === 'block' && e.who === 1) (put(cell, 'a', e.margin === undefined ? '–' : (e.margin * 100).toFixed(1))), e.roll && m.rollAt === undefined && (m.rollAt = cell.bout.t);
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && m.rollAt !== undefined && !m.said) (m.said = true), put(cell, 'c', String(Math.round((cell.bout.t - m.rollAt) * 1000))), put(cell, 'b', e.J === undefined ? '–' : String(Math.round(e.J))), tell(cell, (e.type === 'hit' && e.counter ? '카운터 ' : '') + SAID[e.type]);
        break;
      case 'crossed':
        if (e.type === 'block' && e.who === 1 && m.blockAt === undefined) (m.blockAt = cell.bout.t), put(cell, 'a', String(Math.round(e.J))), put(cell, 'b', MET[e.part] || e.part || '–');
        if (e.type === 'hit' && e.who === 1) put(cell, 'a', String(Math.round(e.J))), put(cell, 'b', '맞음');
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && m.blockAt !== undefined && !m.said) (m.said = true), put(cell, 'c', String(Math.round((cell.bout.t - m.blockAt) * 1000))), put(cell, 'd', e.J === undefined ? '–' : String(Math.round(e.J))), tell(cell, '반격 ' + SAID[e.type]);
        break;
      case 'slick':
        if ((e.type === 'whiff' || e.type === 'hit' || e.type === 'graze') && e.who === 1) put(cell, 'a', e.type === 'whiff' && e.margin !== undefined ? `${(e.margin * 100).toFixed(1)} cm` : '맞음'), put(cell, 'b', Math.hypot(a.x - b.x, a.z - b.z).toFixed(2));
        break;
      case 'parryDown':
        // (on the bout's clock, as tests/clean.test.mjs times it: the moments held at a blow are not counted)
        if (e.type === 'parry' && e.on === 1 && e.down) m.downAt = cell.bout.t;
        if (e.type === 'hit' && e.who === 0 && m.downAt !== undefined && !m.said) (m.said = true), put(cell, 'a', String(Math.round((cell.bout.t - m.downAt) * 1000))), put(cell, 'b', String(Math.round(e.J)));
        break;
      case 'pulled':
        // (from the jab all the way out, as it goes by him, to his counter landing: on the bout's clock, as tests/body.test.mjs)
        if (e.type === 'whiff' && e.who === 1 && m.extAt === undefined) m.extAt = cell.bout.t;
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && m.extAt !== undefined && !m.said) (m.said = true), put(cell, 'a', String(Math.round((cell.bout.t - m.extAt) * 1000))), put(cell, 'b', e.J === undefined ? '–' : String(Math.round(e.J))), tell(cell, SAID[e.type] + (e.part === 'elbow' || e.part === 'forearm' ? ` (${MET[e.part]})` : ''));
        break;
      case 'fired':
        // (from the elbow block to the uppercut landing: on the bout's clock, as tests/clean.test.mjs times it)
        if (e.type === 'block' && e.on === 0 && (e.part === 'elbow' || e.part === 'forearm') && m.blockAt === undefined) m.blockAt = cell.bout.t;
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && m.blockAt !== undefined && !m.said) (m.said = true), put(cell, 'a', String(Math.round((cell.bout.t - m.blockAt) * 1000))), put(cell, 'b', e.J === undefined ? '–' : String(Math.round(e.J))), tell(cell, SAID[e.type] + (e.counter ? ' (카운터)' : ''));
        break;
      case 'shift':
        // (from the shift's start: each of its three punches as it got there, on the bout's clock, as tests/clean.test.mjs times it)
        if (e.type === 'shift' && e.who === 0) (m.shiftAt = cell.bout.t), (m.from = [a.x - b.x, a.z - b.z]), (m.got = []);
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && m.got && m.got.length < 3) {
          m.got.push({ t: cell.bout.t, J: e.J });
          put(cell, 'a', m.got.map(g => (g.J === undefined ? '–' : String(Math.round(g.J)))).join(' · '));
          if (m.got.length === 2) put(cell, 'b', String(Math.round((m.got[1].t - m.got[0].t) * 1000))), tell(cell, '바디 훅 ' + SAID[e.type] + (MET[e.part] && e.part !== 'glove' ? ` (${MET[e.part]})` : ''));
        }
        break;
      case 'shell':
        // (crouched into it: where his head was then; and what became of the other man's punch)
        if (e.type === 'shell' && e.who === 0) (m.shellAt = cell.bout.t), (m.shellY = a.points.head[1]), (m.shellLow = a.points.head[1]), (m.shellLowAt = cell.bout.t);
        if (e.who === 1 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && !m.told) (m.told = true), tell(cell, SAID[e.type] + (e.type === 'block' && MET[e.part] ? ` (${MET[e.part]})` : ''));
        break;
      case 'trick':
        if (e.type === 'punch' && e.who === 0 && m.press === null) m.press = cell.t;
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && !m.said) (m.said = true), put(cell, 'blow', e.J === undefined ? '–' : String(Math.round(e.J))), put(cell, 'ms', m.press === null ? '–' : String(Math.round((cell.t - m.press) * 1000))), tell(cell, SAID[e.type] + (e.part === 'elbow' ? ' (팔꿈치)' : ''));
        break;
      case 'taunt':
        if (e.type === 'taunt' && e.who === 0) m.tauntAt = cell.t;
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
      case 'bearing': {
        // (where he is round the other man, with the margin the cells change by: game/bearing.mjs)
        const tr = (m.tr = m.tr || createTracker()),
          p = track(tr, cell.bout).men[item.mover];
        if (Math.round(cell.t / DT) % 6 === 0) put(cell, 'a', cellSaid(p.cell)), put(cell, 'b', `${Math.round(p.beta) < 0 ? '−' : '+'}${Math.abs(Math.round(p.beta))}`), put(cell, 'c', BANDS[p.band].name);
        break;
      }
      case 'shift':
        // (where he ends, once it is over: metres from the other man, and degrees off the line the other man faced him on)
        if (m.shiftAt !== undefined && !m.ended && !a.shift && cell.bout.t > m.shiftAt) {
          m.ended = true;
          const now = [a.x - b.x, a.z - b.z],
            off = (Math.acos(Math.max(-1, Math.min(1, (m.from[0] * now[0] + m.from[1] * now[1]) / Math.hypot(...m.from) / Math.hypot(...now)))) * 180) / Math.PI;
          put(cell, 'c', `${Math.hypot(...now).toFixed(2)} m · ${Math.round(off)}°`);
        }
        break;
      case 'shell':
        // (how far down his head went in the first 0.3 s, and when it got within a centimetre of the bottom)
        if (m.shellAt !== undefined && !m.shellSaid) {
          const y = a.points.head[1];
          if (y < m.shellLow - 0.01) (m.shellLow = y), (m.shellLowAt = cell.bout.t);
          if (cell.bout.t - m.shellAt >= 0.3) (m.shellSaid = true), put(cell, 'a', ((m.shellY - m.shellLow) * 100).toFixed(1)), put(cell, 'b', String(Math.round((m.shellLowAt - m.shellAt) * 1000)));
        }
        break;
      case 'taunt':
        if (m.tauntAt !== undefined && m.tauntLen === undefined && !(a.action && MOVES[a.action.name].taunt)) (m.tauntLen = cell.t - m.tauntAt), put(cell, 'a', m.tauntLen.toFixed(2));
        break;
      case 'single': {
        // (his head on the canvas; from the liver, the lower of his knees on it)
        const low = entry.liver ? Math.min(...['LeftShin', 'RightShin'].map(k => toWorld(a.place, a.pose.at[k], 1)[1])) : a.points.head[1];
        if (m.downAt !== undefined && m.headDown === undefined && low < (entry.liver ? 0.12 : 0.16)) (m.headDown = cell.t - m.downAt), put(cell, 'a', m.headDown.toFixed(2));
        break;
      }
      case 'wave': {
        // a wave's length and depth (his head from its highest to its lowest in it), from one wave of his to the next
        const w = a.animator.wave,
          y = a.points.head[1];
        if (w && w.k !== m.k) {
          if (m.k !== undefined && m.k >= 1 && m.kAt !== undefined) (m.waves = (m.waves || []).concat([[cell.t - m.kAt, m.hi - m.lo]]).slice(-4)), put(cell, 'a', (m.waves.reduce((s, x) => s + x[0], 0) / m.waves.length).toFixed(2)), put(cell, 'b', (m.waves.reduce((s, x) => s + x[1], 0) / m.waves.length * 100).toFixed(1));
          (m.k = w.k), (m.kAt = cell.t), (m.hi = -9), (m.lo = 9);
        }
        if (w) (m.hi = Math.max(m.hi, y)), (m.lo = Math.min(m.lo, y));
        if (every && w) put(cell, 'c', Math.hypot(a.x - b.x, a.z - b.z).toFixed(2));
        break;
      }
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
        // (a replay plays on in real time whether or not the row is being stepped, throwing again what its steps threw)
        if (cell.replay.playing) (cell.shown = cell.replay.next(elapsed) || null), again(cell, cell.replay.crossed);
        else cell.shown = null;
        if (cell.replayTag && !cell.replay.playing && !cell.replayTag.hidden) cell.replayTag.hidden = true;
        if (!onScreen(box)) return;
        draw(cell, box, dpr, grid, elapsed, Math.min(1, row.acc / DT));
      });
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }
  /* What a replay throws again as it comes to the steps that threw it: the blows' motes and sparks and the ripples, and the
     second ripple and the ring where a falling man came down, into a set of its own (so that what the live bout threw stays
     as it was, to go on from when the replay is over). The first step of a replay starts it afresh. */
  function again(cell, crossed) {
    if (!crossed.length) return;
    if (!cell.again) {
      const set = () => {
        const f = createFx();
        return { fx: f, mesh: R.mesh(f.rows, 0, true) };
      };
      cell.again = { sparks: set(), motes: [set(), set()], ripples: [null, null], ground: null };
    }
    const A = cell.again;
    if (cell.replay.started) (A.ripples = [null, null]), (A.ground = null);
    for (const step of crossed) {
      for (const e of step.events) {
        if (e.type === 'hit') (blow(A.motes[e.on].fx, e, step.men[e.on]), (A.ripples[e.on] = rippleOf(e, step.men[e.on])));
        else met(A.sparks.fx, e);
      }
      if (step.landed) {
        const { fall, landing } = step.landed;
        A.ripples[fall.on] = landRipple(fall, step.men[fall.on], landing);
        A.ground = groundOf(fall, landing);
      }
    }
  }
  function draw(cell, box, dpr, grid, elapsed, between) {
    // (live, between its last two steps; in a replay, what it shows, and what it throws again, on in its own time)
    const live = cell.replay.live(between),
      men = cell.shown ? cell.shown.men : live ? live.men : cell.bout.fighters,
      fx = cell.shown && cell.again ? cell.again : cell,
      time = cell.shown ? elapsed * cell.replay.slow : elapsed,
      layers = [],
      shadows = [];
    men.forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(cell.shown ? 0 : elapsed, shadows, 22));
    for (const m of cell.motes) m.mesh.update(m.fx.rows, m.fx.update(cell.shown ? 0 : elapsed));
    if (cell.again) for (const m of [cell.again.sparks, ...cell.again.motes]) m.mesh.update(m.fx.rows, m.fx.update(cell.shown ? time : 0));
    // (each man's ripple, held to the part it started from, and the ring through the canvas, on in the same time as the motes)
    const waves = men.map((f, i) => {
      const r = fx.ripples[i];
      if (!r) return null;
      r.age += time;
      return rippleRow(r, f) || (fx.ripples[i] = null);
    });
    if (fx.ground) fx.ground.age += time;
    const ring = groundRow(fx.ground) || (fx.ground = null);
    layers.push(
      { mesh: meshes.floor, palette: palettes[0], mask: 0.5, ground: ring },
      // (the shadows and the prints on the canvas ride the ring through it, never lit by it)
      { mesh: cell.mesh, palette: palettes[0], mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] },
      { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1, wave: waves[0], silhouette: 1 },
      { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, wave: waves[1], silhouette: 2 },
      // (what a blow threw off each man is never seen over him: it shows first at his outline)
      ...(cell.shown && cell.again ? cell.again : cell).motes.map((m, i) => ({ mesh: m.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
    );
    if (cell.shown && cell.again) layers.push({ mesh: cell.again.sparks.mesh, palette: palettes[0], mask: 0.6 });
    const ease = 1 - Math.exp(-elapsed * 4),
      rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      [a, b] = men,
      // (an exchange is framed on the two of them, close; footwork on the boxer whose feet these are; or on the man the card
      // says: the eight bearings', on the man round whom the other goes)
      mine = cell.entry.view.on !== undefined ? 1 - cell.entry.view.on : cell.exchange ? 0.5 : 0.6,
      // (a knockdown's replay is framed on him, between his head and his hips, drawn 1.2 times closer: cut to, and back from)
      close = cell.shown && cell.replay.kind === 'fall' ? men[cell.replay.on] : null;
    if (close) {
      const mid = M.lerp(close.points.head, close.points.hips, 0.5);
      if (!cell.held) (cell.held = cell.cam.target.slice()), cell.cam.target.splice(0, 3, ...mid);
      for (let k = 0; k < 3; k++) cell.cam.target[k] += (mid[k] - cell.cam.target[k]) * ease;
    } else {
      if (cell.held) cell.cam.target.splice(0, 3, ...cell.held), (cell.held = null);
      cell.cam.target[0] += (a.x * mine + b.x * (1 - mine) - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (a.z * mine + b.z * (1 - mine) - cell.cam.target[2]) * ease;
    }
    // far enough back that both men are in the picture from the feet up, whatever shape the window is
    // (or as much as the card asks for: the eight bearings' cards, seen from above)
    const [near, wide] = cell.entry.view.frame || (cell.entry.level ? [3.4, 2.1] : cell.exchange ? [3.3, 2.5] : [5.2, 3.6]);
    cell.cam.dist = Math.max(near, wide / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h))) / (close ? 1.2 : 1);
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
  // (for looking at the page from a script: every row, or those of the items named, stepped on by so many seconds at once)
  globalThis.__catalog = { cells, rows, renderer: R, advance: (sec, only) => rows.filter(row => !only || only.includes(row.item.id)).forEach(row => { for (let i = 0; i < Math.round(sec / DT); i++) stepRow(row); }) };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
