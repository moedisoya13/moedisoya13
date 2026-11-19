/* The defence and the blows in the catalogue, as scripts in the same form as the footwork (src/footwork.mjs): the other man
   throws, at a set moment of the loop, and the boxer meets it. Every exchange is the real bout: whether a punch misses, is
   blocked, is turned aside or lands is the glove meeting (or not meeting) the head, and tests/defense.test.mjs holds each
   script to what its card says happens.

   The moments are measured, not guessed: each evasion works only if it starts in a window after the punch does (too early
   and the punch follows the head, too late and the head is still there), and the windows below are the middle of the ones
   the bout gives, sixtieths of a second after the press that throws the punch. */
import { HOME } from './footwork.mjs';

const F = 1 / 60;
// where the other man stands for each punch, from the boxer: at the range it is thrown from
const RANGE = { jab: 1.0, cross: 1.0, hook: 0.85, upper: 0.85 };
// his presses for each punch: a hook and an uppercut come only as the second and third of his power chain (bout.mjs)
const THROW = { jab: [[0, 'jab']], cross: [[0, 'power']], hook: [[-0.32, 'power'], [0, 'power']], upper: [[-0.64, 'power'], [-0.32, 'power'], [0, 'power']] };

/* loop, view as for the footwork. punch: [what the other man throws, when the last press of it is made]; press: the boxer's
   answer; outcome: what happens to that last punch ('whiff' | 'block' | 'parry' | 'hit'), and to any before it in the
   chain (before: 'block' etc.). cover(t): his guard held. */
const DRILLS = [
  // ---- getting the head out of the way
  {
    id: 'slip', name: '슬립', en: 'Slip', group: '피하기',
    note: '잽의 어깨가 발사된 다음 머리를 바깥으로 뺍니다. 주먹은 이미 머리가 있던 자리로 가고 있습니다.',
    loop: 2, punch: ['jab', 0.8], press: [[0.8 + 3 * F, 'slip', -1]], outcome: 'whiff', view: { yaw: 0.75, pitch: 0.28 }
  },
  {
    id: 'slip-cross', name: '슬립 · 스트레이트', en: 'Slip the cross', group: '피하기',
    note: '뒷손 스트레이트는 더 늦게 오고 더 멀리 뻗습니다. 몸통이 돌기 시작한 걸 보고 한 박자 늦게 뺍니다.',
    loop: 2, punch: ['cross', 0.8], press: [[0.8 + 6 * F, 'slip', -1]], outcome: 'whiff', view: { yaw: 0.75, pitch: 0.28 }
  },
  {
    id: 'pull', name: '스웨이 백', en: 'Pull back', group: '피하기',
    note: '체중을 뒷발로 옮기며 상체를 세워 머리를 사거리 밖으로 뺍니다. 다 뻗은 주먹 끝이 턱 앞에서 멈춥니다.',
    loop: 2, punch: ['jab', 0.8], press: [[0.8 + 4 * F, 'pull']], outcome: 'whiff', view: { yaw: 0, pitch: 0.24 }
  },
  {
    id: 'duck', name: '더킹', en: 'Duck', group: '피하기',
    note: '스트레이트는 가드로 받고, 이어지는 훅 밑으로 무릎을 굽혀 곧장 내려갑니다. 팔을 어깨 높이에 굳혀 휘두르는 훅은 내려간 머리를 따라오지 못합니다.',
    loop: 2.4, punch: ['hook', 1.1], cover: t => t > 0.2 && t < 1.05, press: [[1.1 + 8 * F, 'duck']], outcome: 'whiff', before: 'block', view: { yaw: 0.5, pitch: 0.22 }
  },
  {
    id: 'roll', name: '위빙', en: 'Bob and weave', group: '피하기',
    note: '훅이 오는 쪽으로 머리를 숙여 U자를 그리며 밑으로 빠지고, 반대편으로 올라옵니다. 올라온 자리가 다음 주먹을 던질 자리입니다.',
    loop: 2.4, punch: ['hook', 1.1], cover: t => t > 0.2 && t < 1.05, press: [[1.1 + 8 * F, 'roll', 1]], outcome: 'whiff', before: 'block', view: { yaw: 0.5, pitch: 0.22 }
  },
  // ---- meeting it with the gloves
  {
    id: 'parry', name: '패리', en: 'Parry', group: '막기',
    note: '주먹이 닿기 직전에 올린 가드는 주먹을 옆으로 쳐냅니다. 던진 쪽은 팔이 벌어진 채 뒤로 밀리고, 받아친 쪽에 기회가 열립니다.',
    loop: 2, punch: ['jab', 0.8], cover: t => t >= 0.8 + 5 * F && t < 1.2, outcome: 'parry', view: { yaw: 0.4, pitch: 0.26 }
  },
  {
    id: 'block', name: '블록', en: 'Block', group: '막기',
    note: '미리 굳혀 둔 가드는 막기만 합니다. 충격이 글러브를 얼굴 쪽으로 밀어 넣고 몸이 한 번 흔들립니다.',
    loop: 2, punch: ['cross', 0.8], cover: t => t > 0.2 && t < 1.3, outcome: 'block', view: { yaw: 0.4, pitch: 0.26 }
  },
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
    note: '이미 많이 맞은 선수가 스트레이트와 훅을 연달아 맞습니다. 무릎이 풀렸다 돌아오고, 상체가 다리 위에서 흔들리고, 글러브가 처집니다.',
    loop: 3, punch: ['hook', 1.0], outcome: 'hit', before: 'hit', setup: b => (b.fighters[0].hp = 34), keep: b => (b.fighters[0].hp = Math.max(b.fighters[0].hp, 20)), view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'worn', name: '지친 기색', en: 'Worn down', group: '맞기', hurt: true,
    note: '체력과 숨이 바닥난 선수입니다. 발이 캔버스에서 거의 떨어지지 않고, 가드가 내려가고, 가슴이 빠르게 들썩입니다.',
    loop: 3, punch: null, setup: b => (b.fighters[0].hp = 14), keep: b => ((b.fighters[0].hp = 14), (b.fighters[0].stamina = 0.05 * b.fighters[0].k.staminaMax)), view: { yaw: 0.3, pitch: 0.24 }
  },
  {
    id: 'hit-upper', name: '어퍼컷에 맞음', en: 'Taking an uppercut', group: '맞기', hurt: true,
    note: '밑에서 올라온 주먹은 턱을 들어 올립니다. 시선이 천장으로 갔다가 돌아옵니다.',
    loop: 2.8, punch: ['upper', 1.3], cover: t => t > 0.1 && t < 1.25, outcome: 'hit', before: 'block', view: { yaw: 0.3, pitch: 0.24 }
  }
];

export const DEFENSE = DRILLS.map(e =>
  Object.assign({}, e, {
    me: () => HOME,
    him: () => [HOME[0] + (e.punch ? RANGE[e.punch[0]] : 1.15), HOME[1]],
    against: e.punch ? THROW[e.punch[0]].map(([dt, button]) => [e.punch[1] + dt, button]) : []
  })
);
