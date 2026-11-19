/* The footwork in the catalogue, as scripts: where the boxer and the other man should be standing at each moment of a loop,
   and which buttons are pressed when. Nothing here draws; drive() turns a script into the controls a bout takes, so the same
   scripts run in the page and under node --test. */
import { RULES, createBout, settle } from './game/bout.mjs';

export const HOME = [0, 0]; // where the boxer starts each loop, and the other man 1.25 m in front of him
export const AWAY = [1.25, 0];
const around = (centre, from, angle) => {
  const dx = from[0] - centre[0],
    dz = from[1] - centre[1],
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [centre[0] + dx * c - dz * s, centre[1] + dx * s + dz * c];
};
const wave = (t, period) => Math.sin((2 * Math.PI * t) / period);
// a place to be that is held, then left: 0 until `from`, 1 until `to`, eased over `over` seconds at each end
const hold = (t, from, to) => (t >= from && t < to ? 1 : 0);

/* The pendulum step, on his own beat (it reads the rhythm of his feet, so it is in time whatever the pace): six half beats
   to a swing. The lead foot steps in and the rear follows it; he rocks back on the lead; the rear steps out and the lead
   follows it; he rocks forward on the rear. The feet only ever take turns. */
const PENDULUM = 0.26; // metres in and out
function pendulum(f) {
  const r = f.animator.rhythm,
    own = (f.script = f.script || {});
  // the half beat the lead foot first stepped on is the first of the six
  if (own.from === undefined && r.stepping === 'L') own.from = r.halves;
  if (own.from === undefined) return [0, 0];
  const h = (((r.halves - own.from) % 6) + 6) % 6,
    u = (r.beat * 2) % 1,
    w = h < 2 ? (h + u) / 2 : h >= 3 && h < 5 ? (h - 3 + u) / 2 : 0,
    ease = w * w * (3 - 2 * w),
    // where he should be, and how fast he should be going there (a full in or out takes one cycle of his feet)
    x = h < 2 ? PENDULUM * ease : h === 2 ? PENDULUM : h < 5 ? PENDULUM * (1 - ease) : 0,
    v = (h < 2 ? 1 : h >= 3 && h < 5 ? -1 : 0) * ((PENDULUM * 6 * w * (1 - w)) / r.cycle);
  return [(v + 5 * (HOME[0] + x - f.x)) / RULES.speed, (5 * (HOME[1] - f.z)) / RULES.speed];
}

/* loop: seconds. me(t), him(t): where each should be standing at t (the script walks them there); or stick(f): the
   controls themselves, for footwork that keeps his time. press: [[t, button, value]] (value true if left out), and
   against: the same for the other man. cover(t): guard held (hisCover(t) for the other man). view: { yaw, pitch }. */
export const ENTRIES = [
  {
    id: 'bounce', name: '리듬 바운스', en: 'Rhythm bounce', group: '박자',
    note: '발이 닿을 때마다 짧게 눌렸다가 튕겨 올라 잠깐 뜹니다. 머리와 글러브는 한 박자 늦게 따라오고, 체중은 두 발 사이를 시계추처럼 오갑니다. 나머지는 전부 이 박자 위에 얹힙니다.',
    loop: 4, me: () => HOME, view: { yaw: 0.25, pitch: 0.5 }
  },
  {
    id: 'pendulum', name: '펜듈럼 스텝', en: 'Pendulum step', group: '박자',
    note: '앞발이 들어가고 뒷발이 따라붙고, 앞발로 한 번 흔들고. 뒷발이 빠지고 앞발이 따라 나오고, 뒷발로 한 번 흔들고. 여섯 박자에 한 번 들어갔다 나옵니다.',
    loop: 6, me: () => HOME, stick: pendulum, view: { yaw: 0, pitch: 0.5 }
  },
  {
    id: 'inout', name: '스텝 인 · 아웃', en: 'Push step', group: '직선',
    note: '가는 쪽 발이 먼저 움직입니다. 들어갈 때는 앞발이 나가고 뒷발이 따라오고, 빠질 때는 뒷발이 빠지고 앞발이 따라옵니다. 두 발은 서로 지나치지 않습니다.',
    loop: 2.6, me: t => [0.3 * hold(t, 0.3, 1.5), 0], view: { yaw: 0, pitch: 0.55 }
  },
  {
    id: 'side', name: '사이드 스텝', en: 'Lateral step', group: '좌우',
    note: '가는 쪽 발이 먼저 벌어지고 반대 발이 간격을 되찾습니다. 스탠스 폭은 그대로입니다.',
    loop: 3.2, me: t => [0, 0.5 * (hold(t, 0.2, 1.2) - hold(t, 1.8, 2.8))], view: { yaw: 1.2, pitch: 0.6 }
  },
  {
    id: 'circle', name: '서클링', en: 'Circling', group: '좌우',
    note: '상대를 가운데 두고 호를 그립니다. 발은 옆으로 가지만 가슴은 계속 상대를 향합니다.',
    loop: 5, me: t => around(AWAY, HOME, 0.75 * wave(t, 5)), view: { yaw: 0, pitch: 0.95 }
  },
  {
    id: 'turn', name: '따라 돌기', en: 'Turning to face', group: '좌우',
    note: '상대가 옆으로 돌아 나가면 제자리에서 발을 옮겨 정면을 되찾습니다.',
    loop: 5, me: () => HOME, him: t => around(HOME, AWAY, 0.9 * wave(t, 5)), view: { yaw: 0, pitch: 0.95 }
  },
  {
    id: 'stalk', name: '가드 전진', en: 'Stalking behind the guard', group: '직선',
    note: '가드를 올린 채 짧은 걸음으로 밀고 들어갑니다. 걸음이 줄어든 만큼 박자는 느려집니다.',
    loop: 3.6, me: t => [0.3 * hold(t, 0.4, 2.2), 0], cover: t => t > 0.2 && t < 2.6, view: { yaw: 0, pitch: 0.55 }
  },
  {
    id: 'dash', name: '대시', en: 'Dash step', group: '직선',
    note: '한 박자에 크게 빠집니다. 가라앉았다 올라오며 다시 원래 박자로 돌아옵니다.',
    loop: 2.6, me: t => [-0.9 * hold(t, 0.4, 1.3), 0], press: [[0.4, 'dash']], view: { yaw: 0, pitch: 0.55 }
  },
  {
    id: 'stepjab', name: '스텝 잽', en: 'Step jab', group: '주먹과 함께',
    note: '앞발이 닿는 박자에 잽이 나갑니다. 치고 나면 같은 박자로 빠집니다.',
    loop: 2.4, me: t => [0.26 * hold(t, 0.3, 1.1), 0], press: [[0.55, 'jab']], view: { yaw: 0, pitch: 0.5 }
  },
  {
    id: 'onetwo', name: '스텝 원투', en: 'Step one-two', group: '주먹과 함께',
    note: '들어가며 잽, 뒷발이 따라붙는 박자에 스트레이트. 다리에서 올라온 회전이 주먹까지 이어집니다.',
    loop: 2.8, me: t => [0.26 * hold(t, 0.3, 1.4), 0], press: [[0.55, 'jab'], [0.78, 'power']], view: { yaw: 0, pitch: 0.5 }
  }
];

// a bout set up for a script: the boxer at HOME, the other man at AWAY (or where the entry puts them), both in their guards
export function freshBout(entry) {
  const bout = createBout(7);
  [bout.fighters[0].x, bout.fighters[0].z] = entry && entry.me ? entry.me(0) : HOME;
  [bout.fighters[1].x, bout.fighters[1].z] = entry && entry.him ? entry.him(0) : AWAY;
  settle(bout);
  return bout;
}

// walk a boxer to where the script wants him: full stick when far, easing off as he arrives
const walkTo = (f, to) => {
  const dx = to[0] - f.x,
    dz = to[1] - f.z,
    d = Math.hypot(dx, dz);
  return d < 0.025 ? [0, 0] : [(dx / d) * Math.min(1, d * 4.5), (dz / d) * Math.min(1, d * 4.5)];
};
/* The controls for both boxers for the step that takes the bout from time `at` to `at + dt` of the entry's script. */
export function drive(entry, bout, at, dt) {
  const [a, b] = bout.fighters,
    // (counted in whole steps, so a button due on a step is pressed on it exactly once, whatever the arithmetic of the clock)
    tick = Math.round(at / dt) + 1,
    loop = Math.round(entry.loop / dt),
    t = (tick % loop) * dt,
    mine = { move: entry.stick ? entry.stick(a) : walkTo(a, entry.me(t)), cover: !!(entry.cover && entry.cover(t)) },
    his = { move: walkTo(b, entry.him ? entry.him(t) : AWAY), cover: !!(entry.hisCover && entry.hisCover(t)) };
  for (const [controls, presses] of [[mine, entry.press], [his, entry.against]])
    for (const [when, button, value] of presses || []) if (tick % loop === Math.round(when / dt)) controls[button] = value === undefined ? true : value;
  return [mine, his];
}
