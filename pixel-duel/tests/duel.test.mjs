import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuel, step, RULES, isFree } from '../src/game/duel.mjs';
import { CLIPS } from '../src/anim/clips.mjs';
import { createRival, think } from '../src/game/ai.mjs';

const DT = 1 / 60;
const idle = {};
// run until `until(duel)` or for `secs`, collecting every event
function run(duel, secs, inputAt, until) {
  const seen = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    step(duel, inputAt ? inputAt(i, duel) : [idle, idle], DT);
    seen.push(...duel.events.map(e => ({ ...e, tick: i })));
    if (until && until(duel)) break;
  }
  return seen;
}
const close = duel => {
  duel.fighters[0].x = -0.7;
  duel.fighters[1].x = 0.7;
  return duel;
};

test('a cut in reach lands on its hit mark, takes one life and stops both fighters', () => {
  const duel = close(createDuel());
  const seen = run(duel, 0.3, i => [i === 0 ? { attack: true } : idle, idle], d => d.stop > 0);
  const hit = seen.find(e => e.type === 'hit');
  assert.ok(hit, 'the cut should land');
  // the press and the first frame of the wind-up are the same tick, so the hit drawing is frame hit/DT counting from one
  assert.equal(hit.tick + 1, Math.round(CLIPS.slash.marks.hit / DT), 'on the frame of the hit drawing');
  assert.equal(duel.fighters[1].hp, RULES.hp - 1);
  assert.equal(duel.fighters[1].clip, 'hurt');
  assert.equal(duel.fighters[1].ct, 0, 'the struck fighter is held on its first, furthest drawing');
  assert.equal(duel.fighters[0].ct, CLIPS.slash.marks.hit, 'the striker is held on the drawing that landed');
  const [a, b] = [duel.fighters[0].ct, duel.fighters[1].ct];
  step(duel, [idle, idle], DT);
  assert.deepEqual([duel.fighters[0].ct, duel.fighters[1].ct], [a, b], 'nothing advances during the hit stop');
});

test('a cut out of reach whiffs', () => {
  const duel = createDuel();
  const seen = run(duel, 0.4, i => [i === 0 ? { attack: true } : idle, idle]);
  assert.ok(seen.some(e => e.type === 'whiff'));
  assert.equal(duel.fighters[1].hp, RULES.hp);
});

test('a parry timed to the hit deflects it, staggers the striker and opens a chance for the thrust', () => {
  const duel = close(createDuel());
  const hitTick = Math.round(CLIPS.heavy.marks.hit / DT);
  // the rival cuts; the player raises the guard six frames before it lands
  let seen = run(duel, 1, i => [i === hitTick - 6 ? { parry: true } : idle, i === 0 ? { attack: true } : idle], d => d.stop > 0);
  assert.ok(seen.some(e => e.type === 'deflect'), 'deflected');
  assert.equal(duel.fighters[0].hp, RULES.hp, 'no damage through a parry');
  assert.equal(duel.fighters[1].clip, 'stagger');
  assert.ok(duel.fighters[0].chance > 0);
  // attacking inside the chance is the thrust, and it lands for three
  seen = run(duel, 1.2, i => [i === 12 ? { attack: true } : idle, idle], d => d.fighters[1].hp < RULES.hp);
  const hit = seen.find(e => e.type === 'hit');
  assert.equal(hit && hit.clip, 'thrust');
  assert.equal(duel.fighters[1].hp, RULES.hp - CLIPS.thrust.damage);
});

test('a parry raised too early has shut by the time the cut lands', () => {
  const duel = close(createDuel());
  const seen = run(duel, 1, i => [i === 2 ? { parry: true } : idle, i === 0 ? { attack: true } : idle]);
  assert.ok(seen.some(e => e.type === 'hit' && e.on === 0));
});

test('a dodge slips the cut and gives ground', () => {
  const duel = close(createDuel());
  const hitTick = Math.round(CLIPS.heavy.marks.hit / DT);
  const x0 = duel.fighters[0].x;
  const seen = run(duel, 1, i => [i === hitTick - 5 ? { dodge: -1 } : idle, i === 0 ? { attack: true } : idle]);
  assert.ok(!seen.some(e => e.type === 'hit'));
  assert.ok(duel.fighters[0].x < x0 - 0.8, 'moved back about a metre');
});

test('a press made a few frames before the fighter is free still counts', () => {
  const duel = createDuel();
  run(duel, 0.02, i => [i === 0 ? { attack: true } : idle, idle]);
  const freeTick = Math.round(CLIPS.slash.marks.free / DT);
  const seen = run(duel, 1, i => [i === freeTick - 6 ? { attack: true } : idle, idle]);
  assert.ok(seen.some(e => e.type === 'windup'), 'the second cut starts as soon as the first lets go');
});

test('the fighters stay on the terrace and never overlap', () => {
  const duel = createDuel();
  run(duel, 6, () => [{ move: 1 }, { move: 1 }]);
  const [a, b] = duel.fighters;
  assert.ok(b.x <= RULES.halfWidth + 1e-9);
  assert.ok(b.x - a.x >= RULES.gap - 1e-6);
});

test('the last life ends the duel with the struck fighter down', () => {
  const duel = close(createDuel());
  duel.fighters[1].hp = 1;
  run(duel, 0.5, i => [i === 0 ? { attack: true } : idle, idle], d => d.over !== null);
  assert.equal(duel.over, 0);
  assert.equal(duel.fighters[1].clip, 'down');
  run(duel, 3);
  assert.equal(duel.fighters[1].clip, 'down', 'and stays down');
  assert.ok(!isFree(duel.fighters[1]));
});

test('the rival can win and can lose: a duel against a passive and against a relentless player both end', () => {
  for (const [name, play] of [['passive', () => idle], ['relentless', i => (i % 40 === 0 ? { attack: true } : { move: 1 })]]) {
    const duel = createDuel(7),
      rival = createRival('keen');
    let ticks = 0;
    while (duel.over === null && ticks < 60 * 120) {
      step(duel, [play(ticks), think(rival, duel, DT)], DT);
      ticks++;
    }
    assert.notEqual(duel.over, null, name + ': the duel ends inside two minutes');
    if (name === 'passive') assert.equal(duel.over, 1, 'a player who never acts loses');
  }
});
