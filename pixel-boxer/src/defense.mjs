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
    note: '훅이 오는 쪽으로 머리를 숙여 U자를 그리며 밑으로 빠지고, 반대편으로 올라옵니다. U자는 무릎이 그립니다: 들어가는 쪽 무릎이 먼저 굽고, 바닥에서 두 무릎이 다 굽고, 나오는 쪽 무릎이 받는 동안 반대쪽은 펴며 밀어 체중이 한 발에서 다른 발로 넘어갑니다. 1은 무릎을 거의 안 써 모서리가 있는 길로 숙였다 일어나고, 2는 구간마다 끊기고, 3부터 매끄러운 U, 암은 좁게, 더 뒤로 빠집니다. 카드 아래는 가장 늦은 프레임, 위빙 전체 시간, 머리가 내려간 깊이 가운데 골반(무릎)이 낸 몫입니다.',
    loop: 2.4, punch: ['hook', 1.1], outcome: 'whiff', before: 'block', view: { yaw: 0.5, pitch: 0.22 }
  },
  {
    id: 'parry', name: '패리', en: 'Parry', group: '막기', kind: 'parry', card: 'parry',
    note: '주먹이 닿기 직전에 올린 가드는 주먹을 옆으로 쳐냅니다. 글러브가 가드 자리에 도착하는 빠르기가 등급이라 구간의 뒤끝이 갈립니다. 1은 팔 전체로 쫓아가 쳐내고, 5는 손목만 틀어 넘깁니다. 카드 아래는 패리가 되는 구간과 손이 가드에서 나간 거리입니다.',
    loop: 2, punch: ['jab', 0.8], outcome: 'parry', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'block', name: '블록', en: 'Block', group: '막기', kind: 'block',
    note: '미리 굳혀 둔 가드는 막기만 합니다. 1은 글러브가 얼굴까지 밀려 들어오고 손이 벌어지고, 4명은 닿기 직전 몸통을 돌리며 머리를 빼 주먹과 같이 가고, 4·5암은 앞으로 기대어 버팁니다. 카드 아래는 충격량과 가드가 다시 선 시간입니다.',
    loop: 2, punch: ['cross', 0.8], cover: t => t > 0.2 && t < 1.3, outcome: 'block', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'guard', name: '가드', en: 'Covering up', group: '막기', kind: 'guard',
    note: '잽, 잽, 스트레이트를 제자리에서 가드로 받습니다. 1은 두 글러브로 눈을 가리고 팔꿈치가 벌어지고, 2는 귀마개처럼 높게, 4암은 팔뚝을 포개고, 5명은 느슨하게 듭니다. 카드 아래는 밀린 거리와 두 글러브 사이 간격입니다.',
    loop: 2.4, punch: ['cross', 1.6], throws: [[0.8, 'jab'], [1.2, 'jab'], [1.6, 'power']], cover: t => t > 0.2, outcome: 'block', before: 'block', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'counter', name: '카운터', en: 'Slip and counter', group: '카운터', kind: 'counter', move: ['slip', -1], card: 'counter',
    note: '슬립 카드와 같은 잽을 빼고, 빠진 자세에서 뒷손 스트레이트를 칩니다. 4·5는 머리가 선을 벗어난 순간부터 주먹을 시작할 수 있고, 슬립이 감아 둔 만큼 감기와 다리 구동을 건너뛰어 상대 팔이 아직 나와 있는 동안 닿습니다. 3은 복귀의 80%부터, 1·2는 슬립이 끝나야 나갑니다. 아슬아슬하게 피하고 0.4초 안에 장전 카운터가 나간 수비는 1/4 속도로 다시 보여 줍니다. 카드 아래는 잽이 지나간 뒤 내 주먹이 닿기까지와 그 충격량입니다.',
    loop: 2.4, punch: ['jab', 0.8], outcome: 'whiff', view: { yaw: 0.6, pitch: 0.26 }
  }
];
// the frame (after the press that throws the punch) a grade answers on: the middle of his window for that card
const answer = (item, lv) => (WINDOWS[item.card] && WINDOWS[item.card][lv] ? WINDOWS[item.card][lv].at : 0);
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
    own = (f.script = f.script || {});
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
    loop: 3, punch: ['hook', 1.0], outcome: 'hit', before: 'hit', setup: b => (b.fighters[0].hp = 34), keep: b => (b.fighters[0].hp = Math.max(b.fighters[0].hp, 20)), view: { yaw: 0.3, pitch: 0.24 }
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
    id: 'down-face', name: '다운 · 앞으로', en: 'Face first', group: '다운',
    note: '훅에 몸이 돌아가며 무릎이 꺾이고, 돌던 대로 넘어가 캔버스에 엎드립니다(물리라 어떻게 떨어질지는 정해 두지 않았습니다). 두 손으로 밀어 네발이 되고, 한쪽 무릎을 거쳐 일어납니다.',
    loop: 5.4, punch: ['hook', 1.0], cover: t => t > 0.1 && t < 0.95, outcome: 'hit', before: 'block', fall: 'slump', view: { yaw: 0.5, pitch: 0.3 }
  })
);

const placed = e =>
  Object.assign({}, e, {
    me: () => HOME,
    // (countered, he is left where the counter puts him: it is the end of the exchange)
    him: t => (e.kind === 'counter' && t > e.punch[1] + 0.3 ? null : [HOME[0] + (e.punch ? RANGE[e.punch[0]] : 1.15), HOME[1]]),
    against: e.throws || (e.punch ? THROW[e.punch[0]].map(([dt, button]) => [e.punch[1] + dt, button]) : [])
  });
// the blows and the knockdowns (one card each: being hit has no grade), and the graded rows
export const DEFENSE = [...GRADED.map(placed), ...DRILLS.map(placed)];
