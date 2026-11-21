import test from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle, RULES } from '../src/game/bout.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { createChain, stepChain, effectiveMass, LINKS } from '../src/phys/chain.mjs';
import { createRival, think } from '../src/game/ai.mjs';

const DT = 1 / 60;
const idle = {};
// two boxers `gap` apart, standing in their guards
function ring(gap, more) {
  const bout = createBout(3);
  bout.fighters[0].x = -gap / 2;
  bout.fighters[1].x = gap / 2;
  Object.assign(bout.fighters[1], { hp: 1000 }, more);
  settle(bout);
  return bout;
}
function run(bout, secs, inputAt, until) {
  const seen = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    step(bout, inputAt ? inputAt(i, bout) : [idle, idle], DT);
    seen.push(...bout.events.map(e => ({ ...e, tick: i })));
    if (until && until(bout)) break;
  }
  return seen;
}
const blow = seen => seen.find(e => e.J !== undefined);

test('the joints of a punch fire and peak in order, from the legs to the elbow', () => {
  for (const name of ['jab', 'cross', 'hook', 'upper']) {
    const move = MOVES[name],
      chain = createChain(move);
    for (let i = 0; i < 400 && chain.phase !== 'done'; i++) stepChain(chain, move, 1 / 240);
    const used = LINKS.map((l, i) => i).filter(i => !(move.chain.skip || []).includes(LINKS[i]));
    for (let k = 1; k < used.length; k++) {
      assert.ok(chain.fired[used[k]] > chain.fired[used[k - 1]], `${name}: ${LINKS[used[k]]} fires after ${LINKS[used[k - 1]]}`);
      assert.ok(chain.peakAt[used[k]] > chain.peakAt[used[k - 1]], `${name}: ${LINKS[used[k]]} peaks after ${LINKS[used[k - 1]]}`);
    }
    assert.equal(chain.phase, 'done', name + ' comes back to the guard');
  }
});

test('the body is behind a punch only around the moment the chain arrives', () => {
  const move = MOVES.cross,
    chain = createChain(move),
    mass = [];
  for (let i = 0; i < 240; i++) {
    stepChain(chain, move, 1 / 240);
    if (chain.phase === 'throw' || chain.phase === 'hold') mass.push(effectiveMass(chain, move));
  }
  const most = Math.max(...mass);
  assert.ok(mass[0] < 2, 'an arm punch at the start: ' + mass[0].toFixed(2));
  assert.ok(most > 5, 'the body behind it at the end: ' + most.toFixed(2));
  assert.ok(mass.indexOf(most) > mass.length / 2, 'and it builds through the throw');
});

test('a jab lands when the glove reaches the head, and what it does is its impulse', () => {
  const bout = ring(1.0);
  const seen = run(bout, 0.4, i => [i === 0 ? { jab: true } : idle, idle], b => b.stop > 0);
  const hit = blow(seen);
  assert.equal(hit && hit.type, 'hit');
  assert.ok(hit.tick >= 3 && hit.tick <= 9, 'after the chain has run, not on a schedule: tick ' + hit.tick);
  assert.ok(Math.abs(hit.J - hit.mass * hit.speed * (1 + RULES.bounce)) < 0.5, 'impulse = mass x closing speed x (1 + bounce)');
  assert.ok(Math.abs(1000 - bout.fighters[1].hp - hit.J * RULES.damage) < 0.1, 'damage in proportion');
  assert.ok(bout.fighters[1].stun > 0);
});

test('thrown from too far it falls short; thrown at nothing it hits nothing', () => {
  assert.ok(run(ring(1.6), 0.5, i => [i === 0 ? { jab: true } : idle, idle]).some(e => e.type === 'whiff'));
  const bout = ring(1.0);
  bout.fighters[0].yaw = -Math.PI / 2; // facing away
  assert.ok(!blow(run(bout, 0.2, i => [i === 0 ? { jab: true } : idle, idle])));
});

test('a cross from too close is smothered, and a cross is worth more than a jab', () => {
  const J = (gap, what) => {
    const hit = blow(run(ring(gap), 0.5, i => [i === 0 ? { [what]: true } : idle, idle]));
    return hit ? hit.J : 0;
  };
  // (from 0.68 m the power button throws the inside hook, RULES.inside: the long-range chain is held for this, to see a cross
  // thrown from there)
  const inside = RULES.inside;
  RULES.inside = 0;
  const range = J(1.0, 'power'),
    close = J(0.68, 'power'),
    jab = J(1.0, 'jab');
  RULES.inside = inside;
  assert.ok(range > 50, 'a cross at range: ' + range);
  assert.ok(close < range / 3, 'from too close the elbow has not straightened: ' + close);
  assert.ok(range > jab * 1.5, 'jab ' + jab + ', cross ' + range);
});

test('power punches pressed in rhythm run cross, hook, uppercut, and each one finds him', () => {
  const bout = ring(1.0);
  let next = 0;
  const seen = run(bout, 2, (i, b) => {
    const a = b.fighters[0].action,
      ready = !a || (a.chain && (a.chain.phase === 'hold' || a.chain.phase === 'recover'));
    if (ready && next < 3 && b.stop <= 0 && b.fighters[0].want === null) return next++, [{ power: true }, idle];
    return [idle, idle];
  });
  assert.deepEqual(seen.filter(e => e.type === 'punch').map(e => e.name), ['cross', 'hook', 'upper']);
  assert.deepEqual(seen.filter(e => e.type === 'hit').map(e => e.name), ['cross', 'hook', 'upper']);
});

test('a guard raised just before the punch turns it aside and the counter hits harder', () => {
  const bout = ring(1.0);
  let seen = run(bout, 0.6, (i, b) => [{ cover: !!b.fighters[1].action && b.fighters[1].action.chain.on[2] }, i === 0 ? { power: true } : idle], b => b.stop > 0);
  assert.ok(seen.some(e => e.type === 'parry'), 'turned aside');
  assert.equal(bout.fighters[0].hp, RULES.hp);
  assert.equal(bout.fighters[1].action.name, 'reel');
  assert.ok(bout.fighters[0].counter > 0);
  seen = run(bout, 0.9, i => [i === 8 ? { power: true } : idle, idle], b => b.fighters[1].hp < 1000);
  const hit = blow(seen);
  assert.ok(hit && hit.counter, 'the counter lands');
  assert.ok(Math.abs(1000 - bout.fighters[1].hp - hit.J * RULES.damage * RULES.counterGain) < 0.1);
});

test('a guard held up puts the gloves in the way: most of the blow is smothered', () => {
  const bout = ring(1.0);
  const seen = run(bout, 0.9, i => [{ cover: true }, i === 20 ? { power: true } : idle]);
  const hit = blow(seen);
  assert.equal(hit && hit.type, 'block');
  assert.ok(Math.abs(RULES.hp - bout.fighters[0].hp - hit.J * RULES.damage * RULES.smother) < 0.1);
});

test('getting out of the way is the dodge: a dash back and the cross finds nothing', () => {
  const bout = ring(1.0);
  const x0 = bout.fighters[0].x;
  const seen = run(bout, 0.8, (i, b) => [b.fighters[1].action && b.fighters[1].action.chain.on[0] && i < 20 && !b.fighters[0].action ? { dash: true } : idle, i === 0 ? { power: true } : idle]);
  assert.ok(!seen.some(e => e.type === 'hit'));
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

test('the last of his health puts a boxer down and ends the bout', () => {
  const bout = ring(1.0, { hp: 2 });
  run(bout, 0.5, i => [i === 0 ? { power: true } : idle, idle], b => b.over !== null);
  assert.equal(bout.over, 0);
  const fell = bout.fighters[1].action.name;
  assert.ok(MOVES[fell].floor && MOVES[fell].stay, 'down: ' + fell);
  run(bout, 3);
  assert.equal(bout.fighters[1].action.name, fell, 'and stays down');
});

/* What the head adds to a press (game/techniques.mjs: the technique it means it as, a punch for the body) goes with the press
   onto the move it starts, for the motion built for it to read; until one is, the press is the one it always was. */
test('a press carries what the head means by it, and is otherwise the press it always was', () => {
  const press = (extra, skills) => {
    const bout = createBout(3, { skills: [skills, {}] });
    bout.fighters[0].x = -0.5;
    bout.fighters[1].x = 0.5;
    bout.fighters[1].hp = 1000;
    settle(bout);
    step(bout, [Object.assign({ power: true }, extra), idle], DT);
    const asked = bout.fighters[0].action.asked,
      name = bout.fighters[0].action.name,
      seen = run(bout, 0.8);
    return { asked, name, seen, at: bout.fighters.map(f => [f.x, f.z, f.points.head]) };
  };
  const plain = press({}, { all: '4m' }),
    meant = press({ tech: 'shift', body: true }, { all: '4m' }),
    tech = press({ tech: 'shift' }, { all: '4m' });
  assert.equal(plain.asked, undefined);
  assert.deepEqual(meant.asked, { tech: 'shift', body: true });
  // (a technique whose motion is not built changes nothing; a press for the body is the body punch, stage C2: bout.mjs decide)
  assert.deepEqual(tech.asked, { tech: 'shift', body: false });
  assert.deepEqual(tech.seen, plain.seen);
  assert.deepEqual(tech.at, plain.at);
  assert.equal(plain.name, 'cross');
  assert.equal(meant.name, 'crossBody');
  // (a technique his grade does not open is not carried; nor one nobody has heard of)
  assert.deepEqual(press({ tech: 'shift', body: true }, { all: '3' }).asked, { tech: null, body: true });
  assert.equal(press({ tech: 'shift' }, { all: '3' }).asked, undefined);
  assert.equal(press({ tech: 'nonsense' }, { all: '4m' }).asked, undefined);
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
