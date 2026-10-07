import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAVES, EVENTS, waveAt } from '../web/src/spawner.js';
import { ENEMY_TYPES } from '../web/src/enemies.js';
import { RUN_SECONDS } from '../web/src/config.js';

test('웨이브/이벤트는 시간순, 런 길이 안쪽', () => {
  for (let i = 1; i < WAVES.length; i++) assert.ok(WAVES[i].at > WAVES[i - 1].at);
  for (let i = 1; i < EVENTS.length; i++) assert.ok(EVENTS[i].at > EVENTS[i - 1].at);
  assert.equal(WAVES[0].at, 0);
  for (const e of EVENTS) assert.ok(e.at < RUN_SECONDS);
});

test('스폰표의 적 종류는 모두 정의돼 있다', () => {
  for (const w of WAVES) for (const [type] of w.mix) assert.ok(ENEMY_TYPES[type], type);
  for (const e of EVENTS) if (e.enemy) assert.ok(ENEMY_TYPES[e.enemy], e.enemy);
});

test('보스는 5분, 10분, 14분', () => {
  const bosses = EVENTS.filter((e) => e.type === 'boss').map((e) => e.at);
  assert.deepEqual(bosses, [300, 600, 840]);
  for (const e of EVENTS.filter((x) => x.type === 'boss')) assert.ok(ENEMY_TYPES[e.enemy].boss);
});

test('waveAt 은 해당 시간의 웨이브', () => {
  assert.equal(waveAt(0), WAVES[0]);
  assert.equal(waveAt(44.9), WAVES[0]);
  assert.equal(waveAt(45), WAVES[1]);
  assert.equal(waveAt(99999), WAVES[WAVES.length - 1]);
});

test('후반이 초반보다 빡세다 (rate, min)', () => {
  const first = WAVES[0];
  const last = WAVES[WAVES.length - 1];
  assert.ok(last.rate > first.rate * 4);
  assert.ok(last.min > first.min * 10);
});
