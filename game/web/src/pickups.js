// 만두(XP) · 코인 · 아이템 드롭과 흡수.

import { XP_GEM_CAP } from './config.js';
import { addXp, healPlayer, refreshStats } from './player.js';
import { addText, addSparks } from './effects.js';
import { dist2 } from './util.js';
import { WEAPONS } from './weapons.js';
import { PASSIVES } from './passives.js';

function push(run, o) {
  run.pickups.push({ vx: 0, vy: 0, homing: false, t: 0, ...o });
}

export function dropXp(run, x, y, value) {
  // 너무 많으면 기존 만두에 합친다 (뱀서 원작과 같은 방식)
  let xpCount = 0;
  for (const p of run.pickups) if (p.kind === 'xp') xpCount++;
  if (xpCount >= XP_GEM_CAP) {
    for (let i = run.pickups.length - 1; i >= 0; i--) {
      const p = run.pickups[i];
      if (p.kind === 'xp' && !p.homing) {
        p.value += value;
        return;
      }
    }
  }
  push(run, { kind: 'xp', x, y, value });
}

export function dropCoin(run, x, y, value) {
  push(run, { kind: 'coin', x, y, value, vy: -40 - Math.random() * 30, vx: (Math.random() - 0.5) * 40, bounce: 0.25 });
}

export function dropItem(run, kind, x, y) {
  push(run, { kind, x, y });
}

export function xpSprite(value) {
  return value >= 10 ? 'xp3' : value >= 3 ? 'xp2' : 'xp1';
}

export function coinSprite(value) {
  return value >= 5 ? 'coin5' : 'coin';
}

export function updatePickups(run, dt) {
  const pl = run.player;
  const mag = pl.stats.magnet;
  const list = run.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    if (p.bounce > 0) {
      // 코인 튀어오르기 연출 (짧게)
      p.bounce -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      continue;
    }
    const d2 = dist2(p.x, p.y, pl.x, pl.y);
    const items = p.kind !== 'xp' && p.kind !== 'coin';
    if (!p.homing && d2 < (items ? 14 * 14 : mag * mag)) p.homing = true;
    if (p.homing) {
      const d = Math.sqrt(d2) || 1;
      const sp = 90 + p.t * 40 + (run.magnetAll > 0 ? 160 : 0);
      p.speed = Math.min(400, Math.max(p.speed || 0, sp));
      p.x += ((pl.x - p.x) / d) * p.speed * dt;
      p.y += ((pl.y - p.y) / d) * p.speed * dt;
      if (d < 7) {
        collect(run, p);
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }
  if (run.magnetAll > 0) run.magnetAll -= dt;
}

function collect(run, p) {
  const pl = run.player;
  switch (p.kind) {
    case 'xp':
      addXp(run, p.value);
      run.sfx.push('xp');
      break;
    case 'coin': {
      const raw = p.value * pl.stats.greed;
      const v = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
      pl.coins += v;
      run.coinsEarned += v;
      run.sfx.push('coin');
      break;
    }
    case 'food':
      healPlayer(run, 30);
      run.sfx.push('eat');
      break;
    case 'magnet':
      run.magnetAll = 3;
      for (const q of run.pickups) if (q.kind === 'xp' || q.kind === 'coin') q.homing = true;
      addText(run, pl.x, pl.y - 20, '자석!', '#ff8080');
      run.sfx.push('powerup');
      break;
    case 'pager':
      run.pager++;
      addText(run, pl.x, pl.y - 20, '삐삐 획득!', '#8fe3ff');
      run.sfx.push('powerup');
      break;
    case 'chest':
      openChest(run);
      break;
  }
}

// 보물상자: 보유 기술·패시브 1~3개 강화 + 코인
export function openChest(run) {
  const pl = run.player;
  const n = run.rng.weighted([[1, 6], [2, 3], [3, 1]]);
  const got = [];
  for (let k = 0; k < n; k++) {
    const pool = [];
    for (const w of pl.weapons) if (w.level < WEAPONS[w.id].max) pool.push(['w', w]);
    for (const id in pl.passives) if (pl.passives[id] < PASSIVES[id].max) pool.push(['p', id]);
    if (!pool.length) break;
    const [kind, ref] = run.rng.pick(pool);
    if (kind === 'w') {
      ref.level++;
      got.push(`${WEAPONS[ref.id].name} Lv${ref.level}`);
    } else {
      pl.passives[ref]++;
      got.push(`${PASSIVES[ref].name} Lv${pl.passives[ref]}`);
    }
  }
  refreshStats(run);
  const coins = 30 + Math.floor(run.t / 10);
  pl.coins += coins;
  run.coinsEarned += coins;
  addSparks(run, pl.x, pl.y, 30, '#ffe14d', 120);
  run.sfx.push('levelup');
  run.events.push({ type: 'chest', items: got, coins });
}
