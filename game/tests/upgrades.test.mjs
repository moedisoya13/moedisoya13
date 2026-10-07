import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../web/src/rng.js';
import { buildChoices, applyChoice, describeChoice } from '../web/src/upgrades.js';
import { createPlayer } from '../web/src/player.js';
import { WEAPONS, WEAPON_IDS } from '../web/src/weapons.js';
import { PASSIVES, PASSIVE_IDS } from '../web/src/passives.js';
import { SLOTS, xpToNext } from '../web/src/config.js';

test('선택지 3개, 서로 다름', () => {
  const rng = createRng(1);
  for (let i = 0; i < 50; i++) {
    const p = createPlayer({});
    const c = buildChoices(p, rng);
    assert.equal(c.length, 3);
    const keys = c.map((x) => `${x.kind}:${x.id}`);
    assert.equal(new Set(keys).size, 3);
  }
});

test('슬롯이 꽉 차면 새 기술/패시브는 안 나온다', () => {
  const p = createPlayer({});
  p.weapons = WEAPON_IDS.slice(0, SLOTS.weapons).map((id) => ({ id, level: 1, cd: 0, st: {} }));
  for (const id of PASSIVE_IDS.slice(0, SLOTS.passives)) p.passives[id] = 1;
  const rng = createRng(2);
  for (let i = 0; i < 100; i++) {
    for (const c of buildChoices(p, rng)) {
      if (c.kind === 'weapon') assert.ok(p.weapons.some((w) => w.id === c.id));
      if (c.kind === 'passive') assert.ok(c.id in p.passives);
    }
  }
});

test('전부 만렙이면 보너스 선택지', () => {
  const p = createPlayer({});
  p.weapons = WEAPON_IDS.slice(0, SLOTS.weapons).map((id) => ({ id, level: WEAPONS[id].max, cd: 0, st: {} }));
  for (const id of PASSIVE_IDS.slice(0, SLOTS.passives)) p.passives[id] = PASSIVES[id].max;
  const c = buildChoices(p, createRng(3));
  assert.deepEqual(
    c.map((x) => x.kind),
    ['heal', 'coins'],
  );
});

test('applyChoice: 새 기술 추가 / 레벨업 / 패시브', () => {
  const p = createPlayer({});
  applyChoice(p, { kind: 'weapon', id: 'kick', level: 1 });
  assert.ok(p.weapons.some((w) => w.id === 'kick' && w.level === 1));
  applyChoice(p, { kind: 'weapon', id: 'punch', level: 2 });
  assert.equal(p.weapons.find((w) => w.id === 'punch').level, 2);
  applyChoice(p, { kind: 'passive', id: 'might', level: 1 });
  assert.equal(p.passives.might, 1);
  const coins = p.coins;
  applyChoice(p, { kind: 'coins', amount: 25 });
  assert.equal(p.coins, coins + 25);
});

test('모든 기술/패시브 설명이 레벨 수만큼 있다', () => {
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    assert.equal(w.desc.length, w.max, id);
    for (let lv = 1; lv <= w.max; lv++) {
      const d = describeChoice({ kind: 'weapon', id, level: lv });
      assert.ok(d.desc && d.name && d.icon, `${id} ${lv}`);
    }
  }
  for (const id of PASSIVE_IDS) assert.ok(describeChoice({ kind: 'passive', id, level: 1 }).desc);
});

test('XP 곡선은 증가한다', () => {
  for (let lv = 1; lv < 60; lv++) assert.ok(xpToNext(lv + 1) > xpToNext(lv));
});
