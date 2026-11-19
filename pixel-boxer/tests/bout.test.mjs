import test from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, viewOf, RULES } from '../src/game/bout.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { createRival, think } from '../src/game/ai.mjs';

const DT = 1 / 60;
const idle = {};
function run(bout, secs, inputAt, until) {
  const seen = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    step(bout, inputAt ? inputAt(i, bout) : [idle, idle], DT);
    seen.push(...bout.events.map(e => ({ ...e, tick: i })));
    if (until && until(bout)) break;
  }
  return seen;
}
const close = (bout, gap) => {
  bout.fighters[0].x = -(gap || 1) / 2;
  bout.fighters[1].x = (gap || 1) / 2;
  return bout;
};

test('a jab in reach lands at its contact time, hurts and holds the moment', () => {
  const bout = close(createBout());
  const seen = run(bout, 0.3, i => [i === 0 ? { jab: true } : idle, idle], b => b.stop > 0);
  const hit = seen.find(e => e.type === 'hit');
  assert.ok(hit, 'the jab should land');
  assert.ok(Math.abs(hit.tick + 1 - MOVES.jab.contact / DT) <= 1, 'on the frame the glove arrives');
  assert.equal(bout.fighters[1].hp, RULES.hp - MOVES.jab.damage);
  assert.ok(bout.fighters[1].stun > 0);
  const t = bout.fighters[0].action.t;
  step(bout, [idle, idle], DT);
  assert.equal(bout.fighters[0].action.t, t, 'nothing advances while the blow is held');
});

test('a punch from too far away, or at a man who is not in front, misses', () => {
  let bout = createBout();
  let seen = run(bout, 0.4, i => [i === 0 ? { jab: true } : idle, idle]);
  assert.ok(seen.some(e => e.type === 'whiff'));
  bout = close(createBout());
  bout.fighters[0].yaw = -Math.PI / 2; // facing away
  seen = run(bout, 0.12, i => [i === 0 ? { jab: true } : idle, idle]);
  assert.ok(!seen.some(e => e.type === 'hit'));
});

test('power punches pressed in rhythm run cross, hook, uppercut', () => {
  const bout = close(createBout(), 0.9);
  bout.fighters[1].hp = 1000;
  const seen = run(bout, 1.6, i => [i % 14 === 0 ? { power: true } : idle, idle]);
  assert.deepEqual(seen.filter(e => e.type === 'punch').slice(0, 3).map(e => e.name), ['cross', 'hook', 'upper']);
});

test('a guard raised just before the punch turns it aside and the counter hits harder', () => {
  const bout = close(createBout());
  const tick = Math.round(MOVES.cross.contact / DT);
  let seen = run(bout, 0.5, i => [i >= tick - 6 ? { cover: true } : idle, i === 0 ? { power: true } : idle], b => b.stop > 0);
  assert.ok(seen.some(e => e.type === 'parry'));
  assert.equal(bout.fighters[0].hp, RULES.hp);
  assert.equal(bout.fighters[1].action.name, 'reel');
  assert.ok(bout.fighters[0].counter > 0);
  seen = run(bout, 0.8, i => [i === 8 ? { power: true } : idle, idle], b => b.fighters[1].hp < RULES.hp);
  const hit = seen.find(e => e.type === 'hit');
  assert.ok(hit && hit.counter);
  assert.equal(bout.fighters[1].hp, RULES.hp - MOVES.cross.damage * RULES.counterGain);
});

test('a guard held all along only smothers the punch', () => {
  const bout = close(createBout());
  const seen = run(bout, 0.7, i => [{ cover: true }, i === 20 ? { power: true } : idle]);
  assert.ok(seen.some(e => e.type === 'block'));
  assert.ok(bout.fighters[0].hp < RULES.hp && bout.fighters[0].hp > RULES.hp - MOVES.cross.damage * 0.5);
});

test('a dash timed to the punch slips it and carries him clear', () => {
  const bout = close(createBout());
  const tick = Math.round(MOVES.cross.contact / DT);
  const x0 = bout.fighters[0].x;
  const seen = run(bout, 0.6, i => [i === tick - 5 ? { dash: true } : idle, i === 0 ? { power: true } : idle]);
  // slipped inside its reach, or already out of it: either way the punch finds nothing
  assert.ok(seen.some(e => e.type === 'slip' || e.type === 'whiff'));
  assert.ok(!seen.some(e => e.type === 'hit' || e.type === 'block'));
  assert.equal(bout.fighters[0].hp, RULES.hp);
  assert.ok(bout.fighters[0].x < x0 - 0.9);
});

test('the boxers stay inside the ropes, off each other, and facing each other', () => {
  const bout = createBout();
  run(bout, 5, () => [{ move: [1, 0.3] }, { move: [1, 0] }]);
  const [a, b] = bout.fighters;
  assert.ok(Math.abs(b.x) <= RULES.half + 1e-9 && Math.abs(a.z) <= RULES.half + 1e-9);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) >= RULES.gap - 1e-6);
  const want = Math.atan2(b.x - a.x, b.z - a.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw))) < 0.1);
});

test('walking speeds up and slows down, it does not start or stop dead', () => {
  const bout = createBout();
  step(bout, [{ move: [0, 1] }, idle], DT);
  assert.ok(Math.hypot(bout.fighters[0].vx, bout.fighters[0].vz) < RULES.speed * 0.2);
  run(bout, 0.5, () => [{ move: [0, 1] }, idle]);
  assert.ok(Math.abs(Math.hypot(bout.fighters[0].vx, bout.fighters[0].vz) - RULES.speed) < 1e-6);
});

test('the last of his health puts a boxer down and ends the bout', () => {
  const bout = close(createBout());
  bout.fighters[1].hp = 3;
  run(bout, 0.4, i => [i === 0 ? { jab: true } : idle, idle], b => b.over !== null);
  assert.equal(bout.over, 0);
  assert.equal(bout.fighters[1].action.name, 'ko');
  run(bout, 3);
  assert.equal(bout.fighters[1].action.name, 'ko');
  assert.ok(viewOf(bout, 1).still && viewOf(bout, 0).cheer);
});

test('a bout against the rival ends, whoever is at the controls', () => {
  for (const [name, play] of [['nobody', () => idle], ['a brawler', (i, b) => ({ move: [b.fighters[1].x - b.fighters[0].x, b.fighters[1].z - b.fighters[0].z], jab: i % 23 === 0, power: i % 37 === 0 })]]) {
    const bout = createBout(11),
      rival = createRival('contender');
    let ticks = 0;
    while (bout.over === null && ticks < 60 * 240) {
      step(bout, [play(ticks, bout), think(rival, bout, DT)], DT);
      ticks++;
    }
    assert.notEqual(bout.over, null, name + ': over inside four minutes');
    if (name === 'nobody') assert.equal(bout.over, 1);
  }
});
