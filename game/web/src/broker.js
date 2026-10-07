// 포장마차 왕씨 증권 — 주기적으로 근처에 나타나는 브로커 NPC.
// 매매는 이 NPC(또는 삐삐)를 통해서만 가능하다: "고점인데 왕씨까지 갈 수 있나?"가 핵심 긴장감.

import { BROKER } from './config.js';
import { dist2 } from './util.js';

export function createBroker() {
  return { active: false, x: 0, y: 0, left: 0, nextAt: BROKER.firstAt, armed: true, visits: 0 };
}

export function spawnBroker(run) {
  const b = run.broker;
  const pl = run.player;
  const a = run.rng.next() * Math.PI * 2;
  const d = run.rng.range(BROKER.dist[0], BROKER.dist[1]);
  b.active = true;
  b.x = pl.x + Math.cos(a) * d;
  b.y = pl.y + Math.sin(a) * d;
  b.left = BROKER.stay;
  b.armed = true;
  run.events.push({ type: 'toast', text: '왕씨 포장마차 개장!' });
  run.events.push({ type: 'ticker', text: '[알림] 왕씨 포장마차 증권 개장 — 화살표를 따라가세요' });
  run.sfx.push('bell');
}

export function updateBroker(run, dt) {
  const b = run.broker;
  if (!b.active) {
    if (run.t >= b.nextAt) spawnBroker(run);
    return;
  }
  b.left -= dt;
  if (b.left <= 0) {
    b.active = false;
    b.nextAt = run.t + BROKER.interval;
    run.events.push({ type: 'ticker', text: '[알림] 왕씨 포장마차 마감' });
    return;
  }
  const pl = run.player;
  const d2 = dist2(pl.x, pl.y, b.x, b.y);
  if (d2 < BROKER.radius * BROKER.radius) {
    if (b.armed) {
      b.armed = false;
      b.visits++;
      run.events.push({ type: 'broker', source: 'npc' });
    }
  } else if (d2 > (BROKER.radius + 12) * (BROKER.radius + 12)) {
    b.armed = true; // 한 번 벗어났다가 다시 와야 재오픈
  }
}
