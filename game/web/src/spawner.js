// 시간대별 스폰표 + 이벤트(폭주족 떼, 포위, 보스).

import { spawnEnemy } from './enemies.js';

// at: 시작 초, rate: 초당 스폰, min: 최소 유지 수, mix: [종류, 가중치]
export const WAVES = [
  { at: 0, rate: 0.6, min: 5, mix: [['thug', 1]] },
  { at: 45, rate: 1.1, min: 10, mix: [['thug', 1]] },
  { at: 90, rate: 1.8, min: 18, mix: [['thug', 3], ['knife', 1]] },
  { at: 150, rate: 2.2, min: 24, mix: [['thug', 2], ['knife', 2]] },
  { at: 210, rate: 2.6, min: 30, mix: [['thug', 2], ['knife', 2], ['thrower', 1]] },
  { at: 270, rate: 2.2, min: 24, mix: [['knife', 2], ['thrower', 1]] }, // 보스 전 숨 고르기
  { at: 330, rate: 3.0, min: 40, mix: [['thug', 2], ['knife', 2], ['ninja', 1]] },
  { at: 420, rate: 3.6, min: 50, mix: [['knife', 2], ['ninja', 2], ['thrower', 1]] },
  { at: 510, rate: 4.2, min: 60, mix: [['thug', 3], ['ninja', 2], ['thrower', 1], ['heavy', 0.3]] },
  { at: 570, rate: 3.6, min: 50, mix: [['ninja', 2], ['thrower', 1], ['heavy', 0.4]] },
  { at: 660, rate: 5.0, min: 80, mix: [['thug', 2], ['knife', 2], ['ninja', 2], ['heavy', 0.5]] },
  { at: 750, rate: 6.0, min: 100, mix: [['knife', 2], ['ninja', 3], ['thrower', 1], ['heavy', 0.8]] },
  { at: 830, rate: 6.5, min: 110, mix: [['ninja', 3], ['heavy', 1], ['thrower', 1]] },
];

export const EVENTS = [
  { at: 120, type: 'bikers', count: 4 },
  { at: 180, type: 'ring', enemy: 'thug', count: 20 },
  { at: 240, type: 'bikers', count: 6 },
  { at: 300, type: 'boss', enemy: 'boss1' },
  { at: 390, type: 'ring', enemy: 'knife', count: 24 },
  { at: 450, type: 'bikers', count: 10 },
  { at: 540, type: 'ring', enemy: 'ninja', count: 24 },
  { at: 600, type: 'boss', enemy: 'boss2' },
  { at: 690, type: 'bikers', count: 14 },
  { at: 780, type: 'ring', enemy: 'heavy', count: 12 },
  { at: 840, type: 'boss', enemy: 'boss3' },
];

export function waveAt(t) {
  let w = WAVES[0];
  for (const x of WAVES) if (x.at <= t) w = x;
  return w;
}

export function createSpawner() {
  return { budget: 0, nextEvent: 0 };
}

export function updateSpawner(run, dt) {
  const sp = run.spawner;
  const w = waveAt(run.t);
  // 보스전 중에는 졸개를 줄인다
  const rate = run.boss ? w.rate * 0.4 : w.rate;
  sp.budget += rate * dt;
  let guard = 0;
  while ((sp.budget >= 1 || run.enemies.length < w.min) && guard++ < 20) {
    if (sp.budget >= 1) sp.budget -= 1;
    spawnEnemy(run, run.rng.weighted(w.mix), ...ringPoint(run));
  }

  while (sp.nextEvent < EVENTS.length && EVENTS[sp.nextEvent].at <= run.t) {
    fireEvent(run, EVENTS[sp.nextEvent]);
    sp.nextEvent++;
  }
}

// 화면 바로 바깥 원 위의 한 점
export function ringPoint(run, extra = 16) {
  const R = Math.hypot(run.view.w, run.view.h) / 2 + extra;
  const a = run.rng.next() * Math.PI * 2;
  return [run.cam.x + Math.cos(a) * R, run.cam.y + Math.sin(a) * R];
}

function fireEvent(run, ev) {
  const pl = run.player;
  if (ev.type === 'boss') {
    const [x, y] = ringPoint(run, 0);
    spawnEnemy(run, ev.enemy, x, y);
  } else if (ev.type === 'ring') {
    const R = Math.hypot(run.view.w, run.view.h) / 2 + 10;
    for (let k = 0; k < ev.count; k++) {
      const a = (k / ev.count) * Math.PI * 2;
      spawnEnemy(run, ev.enemy, pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R);
    }
    run.events.push({ type: 'toast', text: '포위됐다!' });
  } else if (ev.type === 'bikers') {
    // 한쪽에서 줄지어 돌진
    const a = run.rng.next() * Math.PI * 2;
    const R = Math.hypot(run.view.w, run.view.h) / 2 + 20;
    const px = -Math.sin(a);
    const py = Math.cos(a);
    for (let k = 0; k < ev.count; k++) {
      const off = (k - (ev.count - 1) / 2) * 22;
      spawnEnemy(run, 'biker', pl.x + Math.cos(a) * R + px * off, pl.y + Math.sin(a) * R + py * off);
    }
    run.events.push({ type: 'toast', text: '폭주족이다!' });
    run.sfx.push('engine');
  }
}
