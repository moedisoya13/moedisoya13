/* The defence and the blows in the catalogue, as scripts in the same form as the footwork (src/footwork.mjs): the other man
   throws, at a set moment of the loop, and the boxer meets it. Every exchange is the real bout: whether a punch misses, is
   blocked, is turned aside or lands is the glove meeting (or not meeting) the head, and tests/defense.test.mjs holds each
   script to what its card says happens.

   The moments are measured, not guessed: each evasion works only if it starts in a window after the punch does (too early
   and the punch follows the head, too late and the head is still there), and the windows below are the middle of the ones
   the bout gives, sixtieths of a second after the press that throws the punch (tools/windows.mjs measures them, in these
   same drills: the boxer is a pro, whose head moves of its own accord, so the windows are his). */
import { HOME } from './footwork.mjs';
import { getUp } from './game/bout.mjs';
import { LEVELS } from './anim/skill.mjs';
import { MOVES } from './anim/moves.mjs';
import { WINDOWS } from './windows.data.mjs';

// where the other man stands for each punch, from the boxer: at the range it is thrown from
export const RANGE = { jab: 1.0, cross: 1.0, hook: 0.85, upper: 0.85 };
// his presses for each punch: a hook and an uppercut come only as the second and third of his power chain (bout.mjs)
export const THROW = { jab: [[0, 'jab']], cross: [[0, 'power']], hook: [[-0.32, 'power'], [0, 'power']], upper: [[-0.64, 'power'], [-0.32, 'power'], [0, 'power']] };

/* The defence by grade: every way of meeting a punch is a row of seven cards, one for each grade of the boxer defending (his
   sheet is that grade at everything: anim/skill.mjs), against the same pro throwing the same punch at the same moment of the
   loop, so that the other man is the same in every card to the frame. Each grade answers in the middle of its own window
   (src/windows.data.mjs, measured by node tools/windows.mjs --write), and every card ends the way it says.
   kind: 'evade' (press: [move, value]), 'parry' (the guard put up on the frame), 'block' (a guard held from early on),
   'guard' (held all through, three punches into it), 'counter' (slipped, and a punch thrown out of the end of it at once). */
const F = 1 / 60;
export const ITEMS = [
  {
    id: 'slip', name: '슬립', en: 'Slip', group: '피하기', kind: 'evade', move: ['slip', -1], card: 'slip',
    note: '잽의 어깨가 발사된 다음 머리를 바깥으로 뺍니다. 빼는 쪽 무릎이 굽어 체중을 받고 반대쪽 무릎은 펴집니다. 1은 주먹보다 먼저 찍어서 움찔하며 무릎을 잠근 채 크게 빠지고, 2는 허리째 꺾이고, 3은 무릎과 몸통이 같이, 4는 골반이 먼저 실리고 어깨가 감기며, 5는 주먹이 귀를 스치게 필요한 만큼만 빠집니다. 카드 아래는 누를 수 있는 가장 늦은 프레임과 주먹이 빗나간 거리입니다.',
    loop: 2, punch: ['jab', 0.8], outcome: 'whiff', view: { yaw: 0.75, pitch: 0.28 }
  },
  {
    id: 'slip-cross', name: '슬립 · 스트레이트', en: 'Slip the cross', group: '피하기', kind: 'evade', move: ['slip', -1], card: 'slip-cross',
    note: '뒷손 스트레이트는 더 늦게 오고 더 멀리 뻗습니다. 몸통이 돌기 시작한 걸 보고 한 박자 늦게 뺍니다. 바깥(왼쪽)으로 빼는 슬립은 물리 수정 뒤 프로의 스트레이트를 피하지 못해, 잽과 같은 오른쪽으로 뺍니다.',
    loop: 2, punch: ['cross', 0.8], outcome: 'whiff', view: { yaw: 0.75, pitch: 0.28 }
  },
  {
    id: 'pull', name: '스웨이 백', en: 'Pull back', group: '피하기', kind: 'evade', move: ['pull', true], card: 'pull',
    note: '뒷무릎을 굽혀 뒷다리에 앉고 앞무릎은 펴지며, 상체를 세워 머리를 사거리 밖으로 뺍니다. 1은 무릎을 잠근 채 허리로 젖히고, 4는 뒷다리에 더 깊이 앉으며 턱을 당기고, 5는 사거리 바로 밖에서 멈춥니다. 암은 뒤로 빼지 않고 뒷다리에 주저앉으며 뒷발을 끌어 뺍니다. 카드 아래는 가장 늦은 프레임과 끝난 뒤 상대와의 거리 변화입니다.',
    loop: 2, punch: ['jab', 0.8], outcome: 'whiff', view: { yaw: 0, pitch: 0.24 }
  },
  {
    id: 'duck', name: '더킹', en: 'Duck', group: '피하기', kind: 'evade', move: ['duck', true], card: 'duck',
    note: '스트레이트는 가드로 받고, 이어지는 훅 밑으로 내려갑니다. 허리가 먼저 접히고 무릎이 받아 골반이 곧게 내려가며, 머리는 훅이 오는 쪽으로 조금 내려가 바닥을 지나 반대쪽으로 조금 올라오는 얕은 U자를 그립니다. 훅은 자기 머리보다 9 cm 넘게 낮게 내려오지 못해 머리 위로 지나갑니다. 골반은 1.3 g보다 빨리 내려갈 수 없어 모든 등급이 훅이 나오기 전에 내려가 있어야 합니다(음수 프레임은 찍은 것). 1은 무릎이 뻣뻣해 허리로만 숙여 바닥을 보고, 2는 허리가 접힌 다음 무릎이 굽고, 4·5는 눈을 치뜬 채 무릎으로 한 번에 내려갑니다. 카드 아래는 가장 늦은 프레임, 앞을 못 본 시간, 머리가 내려간 깊이 가운데 골반(무릎)이 낸 몫입니다.',
    loop: 2.4, punch: ['hook', 1.1], outcome: 'whiff', before: 'block', view: { yaw: 0.5, pitch: 0.22 }
  },
  {
    id: 'roll', name: '위빙', en: 'Bob and weave', group: '피하기', kind: 'evade', move: ['roll', 1], card: 'roll',
    note: '훅이 오는 쪽으로 머리를 숙여 U자를 그리며 밑으로 빠지고, 반대편으로 올라옵니다. U자는 무릎이 그립니다: 들어가는 쪽 무릎이 먼저 굽고, 바닥에서 두 무릎이 다 굽고, 나오는 쪽 무릎이 받는 동안 반대쪽은 펴며 밀어 체중이 한 발에서 다른 발로 넘어갑니다. 1은 무릎을 거의 안 쓰고 허리로 깊이 숙여 바닥을 보며 두 글러브를 머리 위로 올리고, U 없이 숙인 채 그대로 일어섭니다. 숙이는 데 오래 걸리고 오래 숙이고 있어서 훅이 나오기 훨씬 전에 찍어야 피합니다(읽은 것이 아니라 겁먹고 미리 숙인 것). 2는 허리가 먼저 접히고 무릎이 뒤따르며 바닥에서 잠깐 멈추고 U를 반만 그립니다. 1·2도 3단계만큼(26 cm 넘게) 내려갑니다. 3부터 매끄러운 U, 암은 좁게, 더 뒤로 빠집니다. 카드 아래는 가장 늦은 프레임, 위빙 전체 시간, 머리가 내려간 깊이 가운데 골반(무릎)이 낸 몫입니다.',
    loop: 2.4, punch: ['hook', 1.1], outcome: 'whiff', before: 'block', view: { yaw: 0.5, pitch: 0.22 }
  },
  {
    id: 'parry', name: '패리', en: 'Parry', group: '막기', kind: 'parry', card: 'parry',
    note: '주먹이 닿기 직전에 올린 가드는 주먹을 옆으로 쳐냅니다. 글러브가 가드 자리에 도착하는 빠르기가 등급이라 구간의 뒤끝이 갈립니다. 1은 팔 전체로 쫓아가 쳐내고, 5는 손목만 틀어 넘깁니다. 4암·5암은 뒷손 주먹의 아랫면으로 잽을 위에서 내려칩니다(해머링 패리): 턱 앞에서 광대뼈 높이로 올렸다 내려찍는 글러브가 잽 글러브에 실제로 닿아야 쳐내고, 쳐내면 잽을 던진 팔이 아래로 떨어집니다. 내려찍는 때를 맞춰야 해서 구간이 좁고, 이어지는 장전 카운터는 앞손 훅입니다. 카드 아래는 패리가 되는 구간과 손이 가드에서 나간 거리입니다.',
    loop: 2, punch: ['jab', 0.8], outcome: 'parry', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'block', name: '블록', en: 'Block', group: '막기', kind: 'block',
    note: '미리 굳혀 둔 가드는 막기만 합니다. 1은 글러브가 얼굴까지 밀려 들어오고 손이 벌어지고, 4명은 닿기 직전 몸통을 돌리며 머리를 빼 주먹과 같이 가고, 4·5암은 크로스암 가드(뒷 글러브는 턱 앞, 앞팔은 배 앞에 가로로)로 받아 주먹이 뒷 글러브에 막히고, 5암은 막은 팔로 밀고 들어옵니다. 카드 아래는 충격량과 가드가 다시 선 시간입니다.',
    loop: 2, punch: ['cross', 0.8], cover: t => t > 0.2 && t < 1.3, outcome: 'block', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'guard', name: '가드', en: 'Covering up', group: '막기', kind: 'guard',
    note: '잽, 잽, 스트레이트를 제자리에서 가드로 받습니다. 1은 두 글러브로 눈을 가리고 팔꿈치가 벌어지고, 2는 귀마개처럼 높게, 4암·5암은 고전형 크로스암(뒷 글러브는 턱 앞, 앞팔은 배 앞에 가로로, 옆으로 서서 앞어깨를 올림)으로 뒷 글러브와 어깨로 막고, 5명은 느슨하게 듭니다. 카드 아래는 밀린 거리와 두 글러브 사이 간격입니다.',
    loop: 2.4, punch: ['cross', 1.6], throws: [[0.8, 'jab'], [1.2, 'jab'], [1.6, 'power']], cover: t => t > 0.2, outcome: 'block', before: 'block', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'counter', name: '카운터', en: 'Slip and counter', group: '카운터', kind: 'counter', move: ['slip', -1], card: 'counter',
    note: '슬립 카드와 같은 잽을 빼고, 빠진 자세에서 뒷손 스트레이트를 칩니다. 4·5는 머리가 선을 벗어난 순간부터 주먹을 시작할 수 있고, 슬립이 감아 둔 만큼 감기와 다리 구동을 건너뛰어 상대 팔이 아직 나와 있는 동안 닿습니다. 3은 복귀의 80%부터, 1·2는 슬립이 끝나야 나갑니다. 아슬아슬하게 피하고 0.4초 안에 장전 카운터가 나간 수비는 1/4 속도로 다시 보여 줍니다. 카드 아래는 잽이 지나간 뒤 내 주먹이 닿기까지와 그 충격량입니다.',
    loop: 2.4, punch: ['jab', 0.8], outcome: 'whiff', view: { yaw: 0.6, pitch: 0.26 }
  }
];
// the frame (after the press that throws the punch) a grade answers on: the middle of his window for that card (a grade with
// no window at all, which no card has since a beginner's and an amateur's weave got under the hook (docs/moves-plan-5.md §2),
// answers where a pro does, and is hit)
const answer = (item, lv) => {
  const w = WINDOWS[item.card];
  return w && w[lv] && w[lv].at !== null ? w[lv].at : w && w['3'] && w['3'].at !== null ? w['3'].at : 0;
};
export const unanswered = (item, lv) => !!(WINDOWS[item.card] && WINDOWS[item.card][lv] && WINDOWS[item.card][lv].at === null);
function graded(item, lv) {
  const at = item.punch[1],
    k = item.kind === 'evade' || item.kind === 'counter' || item.kind === 'parry' ? answer(item, lv) : null,
    when = k === null ? null : at + k * F,
    e = Object.assign({}, item, {
      id: `${item.id}@${lv}`,
      item: item.id,
      level: lv,
      answer: k,
      setup: b => (b.fighters[0].skills = { all: lv })
    });
  if (unanswered(item, lv)) e.outcome = 'hit';
  if (item.kind === 'evade' || item.kind === 'counter') {
    e.press = [[when, item.move[0], item.move[1]]];
    // (a hook comes after a cross taken on the guard, put down when he goes)
    if (item.punch[0] === 'hook') e.cover = t => t > 0.2 && t < Math.min(at - 0.05, when - 1e-9);
  }
  if (item.kind === 'parry') e.cover = t => t >= when - 1e-9 && t < at + 0.4;
  if (item.kind === 'counter') e.cue = counterCue(when);
  return e;
}
/* The counter: pressed from the step after he goes off the line until a punch starts (it starts as soon as his grade lets
   it: from the moment his head is clear, from most of the way back, or once he is back). */
export const counterCue = when => (bout, t) => {
  const f = bout.fighters[0],
    own = (f.cues = f.cues || {});
  if (own.countered || t < when + F - 1e-9) return null;
  if (f.action && MOVES[f.action.name].punch) return void (own.countered = t);
  return 'power';
};
export const GRADED = ITEMS.flatMap(item => LEVELS.map(lv => graded(item, lv)));

/* loop, view as for the footwork. punch: [what the other man throws, when the last press of it is made]; press: the boxer's
   answer; outcome: what happens to that last punch ('whiff' | 'block' | 'parry' | 'hit'), and to any before it in the
   chain (before: 'block' etc.). cover(t): his guard held. */
const DRILLS = [
  // ---- being hit
  {
    id: 'hit-jab', name: '잽에 맞음', en: 'Taking a jab', group: '맞기', hurt: true,
    note: '잽은 가볍고 곧습니다. 고개가 뒤로 젖혀졌다 바로 돌아오고, 발은 거의 밀리지 않습니다.',
    loop: 1.8, punch: ['jab', 0.6], outcome: 'hit', view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'hit-cross', name: '스트레이트에 맞음', en: 'Taking a cross', group: '맞기', hurt: true,
    note: '체중이 실린 뒷손은 머리를 크게 젖히고 몸 전체를 뒤로 밀어냅니다. 밀린 만큼 발이 따라 물러납니다.',
    loop: 2, punch: ['cross', 0.6], outcome: 'hit', view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'hit-hook', name: '훅에 맞음', en: 'Taking a hook', group: '맞기', hurt: true,
    note: '옆에서 온 주먹은 고개를 돌려 버리고 몸통이 따라 비틀립니다.',
    loop: 2.4, punch: ['hook', 1.0], cover: t => t > 0.1 && t < 0.95, outcome: 'hit', before: 'block', view: { yaw: 0.6, pitch: 0.24 }
  },
  {
    id: 'stagger', name: '휘청임', en: 'Rocked', group: '맞기', hurt: true,
    note: '이미 많이 맞은 선수가 스트레이트와 훅을 연달아 맞습니다. 무릎이 실제로 풀립니다: 두 무릎이 0.25초 간격으로 번갈아 꺾이며 안으로 모이고, 상체가 다리 위에서 흔들리고, 글러브가 처집니다.',
    loop: 3, punch: ['hook', 1.0], outcome: 'hit', before: 'hit', gap: 0.88, setup: b => (b.fighters[0].hp = 34), keep: b => (b.fighters[0].hp = Math.max(b.fighters[0].hp, 20)), view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'worn', name: '지친 기색', en: 'Worn down', group: '맞기', hurt: true,
    note: '체력과 숨이 바닥난 선수입니다. 발이 캔버스에서 거의 떨어지지 않고, 가드가 내려가고, 가슴이 빠르게 들썩입니다.',
    loop: 3, punch: null, status: '체력 14 · 숨 5%', setup: b => (b.fighters[0].hp = 14), keep: b => ((b.fighters[0].hp = 14), (b.fighters[0].stamina = 0.05 * b.fighters[0].k.staminaMax)), view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'hit-upper', name: '어퍼컷에 맞음', en: 'Taking an uppercut', group: '맞기', hurt: true,
    note: '밑에서 올라온 주먹은 턱을 들어 올립니다. 시선이 천장으로 갔다가 돌아옵니다.',
    loop: 2.8, punch: ['upper', 1.3], cover: t => t > 0.1 && t < 1.25, outcome: 'hit', before: 'block', view: { yaw: 0.3, pitch: 0.24 }
  }
];

/* Going down. The bout counts knockdowns (as a match does) instead of ending at the first, and the script is the referee:
   the boxer is left as much health as makes the finishing blow put him down the way the card says (with little to spare,
   a knee; with plenty, flat out), only at `from`, just before it arrives (a hurt man's posture is his own and would
   change where it lands), and he beats the count `up` seconds into the loop, and gets up the way match.mjs gets a man up
   (bout.mjs: getUp, where he lies and the way that fits how he lies). */
/* (caught coming in: he throws his rear hand from out of range, stepping in behind it, and the other man's jab meets him on
   the way: when each is pressed, how far apart they stand, and when he beats the count) */
const FRONT = { gap: 1.76, cross: 0.6, jab: 0.58, up: 2.8 };
const down = (hp, from, up) => ({
  hurt: true,
  setup: b => (b.knockdowns = true),
  keep: (b, t) => {
    const f = b.fighters[0];
    if (t < from) f.hp = 100;
    else if (t < from + 1 / 60 + 1e-9) f.hp = hp;
    if (f.down && t >= up) {
      f.hp = 40;
      getUp(b, f);
    }
  }
});
DRILLS.push(
  Object.assign(down(1, 0.62, 2.6), {
    id: 'down-back', name: '다운 · 뒤로', en: 'Laid out', group: '다운',
    note: '여유 있게 넘친 스트레이트에 몸이 물리가 됩니다. 근육이 다리부터 풀려 무릎이 꺾이고, 주먹이 민 대로 뒤로 넘어가 등으로 눕습니다. 누운 자세에서 앉고, 무릎을 세워 한쪽 무릎을 거쳐 일어납니다.',
    loop: 5, punch: ['cross', 0.6], outcome: 'hit', fall: 'ko', view: { yaw: 0.5, pitch: 0.3 }
  }),
  Object.assign(down(2.4, 0.62, 2.2), {
    id: 'down-knee', name: '다운 · 무릎', en: 'Dropped to a knee', group: '다운',
    note: '체력을 겨우 넘긴 한 방에는 다리만 풀립니다. 뒷무릎과 글러브 하나를 캔버스에 대고 고개를 숙인 채 버티다가, 글러브로 밀고 일어납니다.',
    loop: 4.2, punch: ['cross', 0.6], outcome: 'hit', fall: 'drop', view: { yaw: 0.5, pitch: 0.3 }
  }),
  Object.assign(down(1.5, 1.02, 2.8), {
    id: 'down-side', name: '다운 · 옆으로', en: 'Sideways', group: '다운',
    note: '훅이 닿는 순간 글러브는 그의 오른쪽으로, 조금 뒤와 위로 가고 있었습니다(이 거리의 훅은 턱 밑을 지나쳤다가 어깨가 다시 끌어당기는 길에 닿습니다). 넘어지는 몸에는 그 방향 그대로 머리의 충격과 몸 전체의 밀림이 들어가, 무릎이 꺾이며 오른쪽 옆으로 쓰러집니다. 옆으로 떨어진 몸은 앞으로 숙인 상체와 가드 팔 쪽으로 굴러 엎드립니다(물리라 어떻게 눕는지는 정해 두지 않았습니다). 두 손으로 밀어 네발이 되고, 한쪽 무릎을 거쳐 일어납니다.',
    loop: 5.4, punch: ['hook', 1.0], cover: t => t > 0.1 && t < 0.97, outcome: 'hit', before: 'block', fall: 'slump', view: { yaw: 0.5, pitch: 0.3 }
  }),
  Object.assign(down(0.05, FRONT.jab - 0.02, FRONT.up), {
    id: 'down-front', name: '다운 · 앞으로', en: 'Caught coming in', group: '다운',
    note: '멀리서 스트레이트를 치며 밟고 들어가다 상대의 잽에 맞습니다. 맞기 직전 몸이 앞으로 초속 3.6 m로 들어가고 있어, 잽이 민 것보다 들어가던 운동량이 커서 앞으로 쏟아져 엎드립니다(어디로 떨어질지는 물리가 정합니다). 두 손으로 밀어 네발이 되고, 한쪽 무릎을 거쳐 일어납니다.',
    loop: 5.4, gap: FRONT.gap, press: [[FRONT.cross, 'power']], punch: ['jab', FRONT.jab], outcome: 'hit', fall: 'ko', view: { yaw: 0.5, pitch: 0.3 }
  }),
  /* Out cold (docs/moves-plan-4.md §6, docs/moves-plan-5.md §1): the finishing blow with RULES.out of health or more to
     spare (bout.mjs). The script tries to get him up as the knockdowns' do, and nothing happens: a man out cold does not get
     up. A hook knocks him out stiff with his neck wrenched round (outTwist), a cross stiff as a log (outStiff), an uppercut
     limp, lifted and let go of slowly (outLift); the limp that lets go of everything at once (out) is no blow's now. */
  Object.assign(down(0.05, 1.02, 2.8), {
    id: 'out-twist', name: '실신 · 통나무 · 훅', en: 'Out cold, twisted', group: '다운', out: true,
    note: '다운 · 옆으로와 같은 훅이 체력을 2.5 넘게 넘겨 의식이 끊깁니다. 맞는 순간 목만 움직여 고개가 훅이 지나간 쪽(왼쪽)으로 약 60° 돌아가고 턱이 당겨진 채 0.06초 만에 굳고, 척추·엉덩관절·무릎·발목·팔은 가드 그대로 굳어 있습니다. 굳은 몸은 훅이 민 쪽 발(앞발)의 바깥날을 축으로 한 덩어리로 옆으로 넘어가며 그쪽으로 조금 돌아, 위팔과 어깨부터 캔버스에 닿습니다. 닿은 뒤에야 풀려 등으로 구르고, 한쪽 아래팔이 들린 채 1.5초 있다가 천천히 내려옵니다. 상대는 쓰러지는 그에게서 한 걸음 물러납니다. 일어나지 않습니다. 카드 아래는 맞고 나서 머리가 캔버스에 닿기까지의 시간입니다.',
    // (the other man steps back off him as he goes down: his rear foot comes down where the other man's lead foot is)
    loop: 7.6, punch: ['hook', 1.0], cover: t => t > 0.1 && t < 0.97, outcome: 'hit', before: 'block', fall: 'outTwist', back: [1.3, 0.4], view: { yaw: 0.5, pitch: 0.3 }
  }),
  Object.assign(down(0.05, 0.62, 2.6), {
    id: 'out-log', name: '실신 · 통나무', en: 'Out cold, stiff', group: '다운', out: true,
    note: '다운 · 뒤로와 같은 스트레이트가 체력을 2.5 넘게 넘겨 의식이 끊깁니다. 척추·엉덩관절·무릎·팔이 가드 자세 그대로 굳어, 무릎을 꺾지 않고 나무처럼 뒤로 넘어갑니다(목과 발목만 풀림). 캔버스에 닿은 뒤에야 굳은 관절이 풀리고, 뒤통수가 캔버스에 닿아 한 번 작게 튑니다. 가드에 굳어 있던 한쪽 아래팔은 누운 뒤에도 들린 채 1.5초 있다가 천천히 내려오고, 숨 말고는 움직이지 않으며 일어나지 않습니다. 카드 아래는 맞고 나서 머리가 캔버스에 닿기까지의 시간입니다.',
    loop: 7.2, punch: ['cross', 0.6], outcome: 'hit', fall: 'outStiff', view: { yaw: 0.5, pitch: 0.3 }
  }),
  // (a pro's uppercut has too little in it to go RULES.out past anything: a great one's, 4m, does)
  Object.assign(down(0.05, 1.36, 3.1), { setup: b => ((b.knockdowns = true), (b.fighters[1].skills = { upper: '4m' })) }, {
    id: 'out-limp', name: '실신 · 림프 · 어퍼', en: 'Out cold, limp', group: '다운', out: true,
    note: '4명의 어퍼컷이 체력을 2.5 넘게 넘겨 의식이 끊깁니다(프로의 어퍼는 그만큼 세지 않습니다). 맞는 순간 고개가 뒤로 40° 넘게 젖혀지며 몸이 발끝으로 4~5 cm 들렸다가, 들린 채 매달린 듯 멈추고 발바닥이 다시 닿습니다. 그다음 아래에서 위로 천천히 풀립니다: 무릎이 먼저 꺾여 주저앉고, 가드가 풀려 글러브가 내려오고, 엉덩관절, 목(젖혀졌던 머리가 앞으로 떨어짐), 마지막으로 척추가 풀려 상체가 접힙니다. 팔은 몸을 받치지 않고, 선 자리에서 0.5 m 안에 무너집니다. 누운 뒤에는 숨만 쉬고 한쪽 아래팔이 들려 1.5초 있다가 천천히 내려오며, 일어나지 않습니다. 카드 아래는 맞고 나서 머리가 캔버스에 닿기까지의 시간입니다.',
    loop: 7.4, punch: ['upper', 1.34], cover: t => t > 0.1 && t < 1.25, outcome: 'hit', before: 'block', fall: 'outLift', back: [1.6, 0.4], view: { yaw: 0.5, pitch: 0.3 }
  })
);

const placed = e =>
  Object.assign({}, e, {
    me: () => HOME,
    // (countered, he is left where the counter puts him: it is the end of the exchange; a drill may put him further off, or
    // step him back off a man he has knocked out: back)
    him: t => (e.kind === 'counter' && t > e.punch[1] + 0.3 ? null : [HOME[0] + (e.gap || (e.punch ? RANGE[e.punch[0]] : 1.15)) + (e.back && t > e.back[0] ? e.back[1] : 0), HOME[1]]),
    against: e.throws || (e.punch ? THROW[e.punch[0]].map(([dt, button]) => [e.punch[1] + dt, button]) : [])
  });
// the blows and the knockdowns (one card each: being hit has no grade), and the graded rows
export const DEFENSE = [...GRADED.map(placed), ...DRILLS.map(placed)];

/* The down parry and counter (anim/clean.mjs, docs/moves-plan-5.md §4.2): a clean great one's and a clean legend's own, a
   card each, for the catalogue's technique rows (tests/clean.test.mjs holds them to what they say). The same pro throws the same jab as the parry card, at the same moment; the boxer carries the technique (his loadout:
   game/techniques.mjs) and puts his guard up meant as it (tech: 'parryDown', from the frame of the card on), and takes the
   opening it makes at once (a power press as soon as the jab is pressed down: his counter, the cross of the hand that
   pressed it, a legend's jab first). The frame he puts it up on is the middle of the window measured in these same drills
   (WINDOWS.parryDown, node tools/windows.mjs --write: frames after the press that throws the jab on which the guard put up
   for it presses it down). The card's numbers: the window, and how long after the glove was pressed down his counter lands. */
export const PARRY_DOWN = ['4m', '5m'].map(lv => {
  const item = { id: 'parryDown', punch: ['jab', 0.8] },
    w = WINDOWS.parryDown[lv],
    at = item.punch[1] + w.at * F;
  return placed({
    id: `parryDown@${lv}`, item: 'parryDown', level: lv, card: 'parryDown', answer: w.at, window: [w.from, w.to],
    name: `다운패링 카운터 ${lv === '4m' ? '4명' : '5명'}`, en: 'Down parry and counter', group: '명의 기술', kind: 'parry',
    note: '막 올린 가드가 잽을 옆으로 쳐내지 않고, 뒷손이 턱 앞으로 나가 들어오는 글러브를 위에서 눌러 내립니다. 실제로 위에서 닿아야 내리고(닿지 못하면 블록), 눌린 팔은 닿은 자리에서 20 cm 떨어지고 어깨가 딸려 내려가 0.35초 묶입니다. 4명은 누른 손이 가드로 돌아가지 않고 그 자리에서 스트레이트로 뻗고, 5명은 손목만 9 cm 내리며 앞손 잽이 같이 나가고 누른 손의 스트레이트가 뒤따릅니다. 카드 아래는 구간과 눌린 뒤 반격이 닿기까지입니다.',
    loop: 2.4, punch: item.punch, outcome: 'parry', view: { yaw: 0.4, pitch: 0.26 },
    setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['parryDown'])),
    cover: t => t >= at - 1e-9 && t < item.punch[1] + 0.4,
    // (the guard meant as the down parry; and the counter, once, as soon as the glove has been pressed down)
    cue: (bout, t) => {
      const f = bout.fighters[0],
        own = (f.cues = f.cues || {});
      if (!own.countered && f.parried && f.parried.down && f.counter > 0) return (own.countered = true), 'power';
      return t >= at - 1e-9 && t < item.punch[1] + 0.4 ? ['tech', 'parryDown'] : null;
    }
  });
});

/* The classic cross-arm guard and the shoulder roll (anim/show.mjs, docs/moves-plan-5.md §4A), as the catalogue's technique
   rows: techniques a man carries (game/techniques.mjs crossArm from 3 up, rollCounter from 4 up), and these cards give him
   them, so a pro and a clean great one hold it too. The guard: held up from early on, the same pro's cross into it (the block
   card's), or his cross and his lead hook after it (the rear glove going up over the ear as the hook starts); every one of
   them blocked (tests/show.test.mjs). The roll: his guard put up meant as the roll (tech: 'rollCounter') on the frame in the
   middle of his window, measured in these same drills (WINDOWS.rollCounter, node tools/windows.mjs --write), and kept up as
   long as the arm it rolls off is held out; the cross is rolled off the lead shoulder. Its counter (the rear hook, §4A.7) is
   the next stage's: the cards end at the roll. */
export const CROSS_LEVELS = ['3', '4m', '4a', '5m', '5a'];
export const ROLL_LEVELS = ['4m', '4a', '5m', '5a'];
const CROSS_ROWS = [
  { id: 'crossArm', name: '크로스암 가드', en: 'The cross-arm guard', punch: ['cross', 0.8], loop: 2, cover: t => t > 0.2 && t < 1.3 },
  { id: 'crossArm-hook', name: '크로스암 가드 · 훅', en: 'The cross-arm guard against the hook', punch: ['hook', 1.1], loop: 2.4, before: 'block', cover: t => t > 0.2 && t < 1.6 }
];
export const CROSS_ARM = CROSS_ROWS.flatMap(row =>
  CROSS_LEVELS.map(lv =>
    placed({
      id: `${row.id}@${lv}`, item: row.id, level: lv, name: row.name, en: row.en, group: '크로스암', kind: 'block',
      loop: row.loop, punch: row.punch, cover: row.cover, outcome: 'block', before: row.before, view: { yaw: 0.4, pitch: 0.26 },
      setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['crossArm']))
    })
  )
);
export const ROLLING = ROLL_LEVELS.map(lv => {
  const item = { punch: ['cross', 0.8] },
    w = WINDOWS.rollCounter && WINDOWS.rollCounter[lv],
    k = w ? w.at : 3,
    at = item.punch[1] + k * F;
  return placed({
    id: `rollCounter@${lv}`, item: 'rollCounter', level: lv, card: 'rollCounter', answer: k, window: w ? [w.from, w.to] : null,
    name: '숄더 롤', en: 'The shoulder roll', group: '크로스암', kind: 'roll',
    loop: 2, punch: item.punch, outcome: 'block', view: { yaw: 0.25, pitch: 0.26 },
    press: [[at, 'tech', 'rollCounter']],
    // (his guard kept up as long as the arm he has rolled off his shoulder is held out there)
    cover: t => t >= at - 1e-9 && t < item.punch[1] + 0.5,
    setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['crossArm', 'rollCounter']))
  });
});

/* The pull counter (docs/moves-plan-5.md §3.8; game/techniques.mjs pullCounter, anim/evade.mjs PULLED), the three ways out of a
   sway back, each a row of seven: the same pro throws the same jab as the pull card, at the same moment; the boxer carries
   the technique and sways back meant as it on the frame in the middle of his window (WINDOWS.pull, the pull card's: the rear
   hook's row is fought closer, 0.9 m, where the head picks it, and has its own, WINDOWS.pullHook), and presses the counter
   once, as his head does: on the step after the jab has gone by him at full stretch (its whiff), the way named, and the bout
   keeps the press while he is still in the sway. The other man only takes it (a liver hook does not put him down: f.stands).
   tests/body.test.mjs holds them to what they say. The card's numbers: how
   long after the jab was all the way out the counter lands (on the bout's clock: the moments held at a blow are not counted),
   and how hard. */
export const PULL_WAYS = [
  { id: 'pullBody', name: '풀백 → 바디', en: 'Pull, and to the body', press: { power: true, tech: 'pullCounter', body: true }, gap: 1.0, card: 'pull' },
  { id: 'pullHook', name: '풀백 → 뒷손 훅', en: 'Pull, and the rear hook', press: { power: 'hookR', tech: 'pullCounter' }, gap: 0.9, card: 'pullHook' },
  { id: 'pullCross', name: '풀백 → 스트레이트', en: 'Pull, and the straight', press: { power: true, tech: 'pullCounter' }, gap: 1.0, card: 'pull' }
];
// the counter pressed once, the step after the jab has gone by him: the bout keeps it until the sway lets him go
export const pulledCue = (when, press) => (bout, t) => {
  const f = bout.fighters[0],
    own = (f.cues = f.cues || {});
  if (own.pressed || t < when + F - 1e-9 || !bout.events.some(e => e.type === 'whiff' && e.who === 1)) return null;
  own.pressed = true;
  return press;
};
export const PULL_COUNTER = PULL_WAYS.flatMap(way =>
  LEVELS.map(lv => {
    const item = { punch: ['jab', 0.8] },
      w = WINDOWS[way.card] && WINDOWS[way.card][lv],
      k = w && w.at !== null ? w.at : 0,
      when = item.punch[1] + k * F;
    return placed({
      id: `${way.id}@${lv}`, item: way.id, level: lv, card: way.card, answer: k, way: way.id, name: way.name, en: way.en, group: '풀백 3형제', kind: 'counter',
      loop: 2.4, gap: way.gap, punch: item.punch, outcome: 'whiff', view: { yaw: 0.6, pitch: 0.26 },
      press: [[when, 'pull', true], [when, 'tech', 'pullCounter']],
      cue: pulledCue(when, way.press),
      // (he only takes it: no liver hook of the boxer's puts him down, and the loop goes on round the exchange)
      setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['pullCounter']), (b.fighters[1].stands = true))
    });
  })
);
