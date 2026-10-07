// 레벨업 3택 1 선택지 생성/적용 (DOM 없음, 테스트 대상).

import { SLOTS } from './config.js';
import { WEAPONS, WEAPON_IDS } from './weapons.js';
import { PASSIVES, PASSIVE_IDS } from './passives.js';

export function buildChoices(player, rng, n = 3) {
  const pool = [];
  const owned = new Set(player.weapons.map((w) => w.id));
  for (const w of player.weapons) {
    if (w.level < WEAPONS[w.id].max) pool.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 1.3 });
  }
  if (player.weapons.length < SLOTS.weapons) {
    for (const id of WEAPON_IDS) if (!owned.has(id)) pool.push({ kind: 'weapon', id, level: 1, weight: 1 });
  }
  const passiveCount = Object.keys(player.passives).length;
  for (const id in player.passives) {
    if (player.passives[id] < PASSIVES[id].max) pool.push({ kind: 'passive', id, level: player.passives[id] + 1, weight: 1 });
  }
  if (passiveCount < SLOTS.passives) {
    for (const id of PASSIVE_IDS) if (!(id in player.passives)) pool.push({ kind: 'passive', id, level: 1, weight: 0.8 });
  }

  const out = [];
  while (out.length < n && pool.length) {
    const idx = rng.weighted(pool.map((c, i) => [i, c.weight]));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  if (!out.length) {
    // 전부 만렙: 소모성 보상
    out.push({ kind: 'heal' }, { kind: 'coins', amount: 25 });
  }
  return out;
}

export function describeChoice(c) {
  if (c.kind === 'weapon') {
    const d = WEAPONS[c.id];
    return { name: d.name, icon: d.icon, level: c.level, isNew: c.level === 1, desc: d.desc[c.level - 1], tag: '기술' };
  }
  if (c.kind === 'passive') {
    const d = PASSIVES[c.id];
    return { name: d.name, icon: d.icon, level: c.level, isNew: c.level === 1, desc: d.desc(c.level), tag: '패시브' };
  }
  if (c.kind === 'heal') return { name: '국수 한 그릇', icon: 'food', desc: 'HP 50 회복', tag: '보너스' };
  return { name: '용돈', icon: 'coin5', desc: `코인 +${c.amount}`, tag: '보너스' };
}

// 플레이어 상태만 바꾼다. 스탯 재계산·회복은 호출자가 한다.
export function applyChoice(player, c) {
  if (c.kind === 'weapon') {
    const w = player.weapons.find((x) => x.id === c.id);
    if (w) w.level = c.level;
    else player.weapons.push({ id: c.id, level: 1, cd: 0.2, st: {} });
  } else if (c.kind === 'passive') {
    player.passives[c.id] = c.level;
  } else if (c.kind === 'coins') {
    player.coins += c.amount;
  }
}
