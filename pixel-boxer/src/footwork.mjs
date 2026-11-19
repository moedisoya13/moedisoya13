/* The footwork in the catalogue, as scripts: where the boxer and the other man should be standing at each moment of a loop,
   and which buttons are pressed when. Nothing here draws; drive() turns a script into the controls a bout takes, so the same
   scripts run in the page and under node --test. */
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

/* loop: seconds. me(t), him(t): where each should be standing at t (the script walks them there). press: [[t, button]].
   cover(t): guard held. view: { yaw, pitch } of the camera. */
export const ENTRIES = [
  {
    id: 'bounce', name: '리듬 바운스', en: 'Pendulum bounce', group: '박자',
    note: '앞발, 뒷발, 앞발. 체중이 두 발 사이를 오가며 박자를 만듭니다. 나머지는 전부 이 박자 위에 얹힙니다.',
    loop: 4, me: () => HOME, view: { yaw: 0.25, pitch: 0.5 }
  },
  {
    id: 'inout', name: '스텝 인 · 아웃', en: 'Push step', group: '직선',
    note: '들어갈 때는 앞발이 먼저 나가고 뒷발이 따라옵니다. 빠질 때는 반대입니다. 두 발은 서로 지나치지 않습니다.',
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
    mine = { move: walkTo(a, entry.me(t)), cover: !!(entry.cover && entry.cover(t)) },
    his = { move: walkTo(b, entry.him ? entry.him(t) : AWAY) };
  for (const [when, button] of entry.press || []) if (tick % loop === Math.round(when / dt)) mine[button] = true;
  return [mine, his];
}
