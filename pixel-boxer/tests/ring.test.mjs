/* The match engine and the boxers' heads, as the fix round of 2026-11-28 left them (docs/audit-2026-11-25.md: a-draw-winner,
   a-count-ten, a-guard-flicker, a-standoff, a-hurt-blind, a-ropes-stuck, and the user's memo on fighting from a distance).
   Each is the audit's repro, made small: fixed seeds, chosen before the fix and not after. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { PLANS, SPACE, HURT, hurtOf, hurtEager } from '../src/game/brain.mjs';
import { settle, RULES } from '../src/game/bout.mjs';
import { MOVES } from '../src/anim/moves.mjs';

const DT = 1 / 60;
const tally = () => ({ thrown: 0, landed: 0, power: 0, J: 0, blocked: 0, downs: 0 });

// the last frame of a three-round match whose first two rounds are on the cards as given (1-2's way)
function decided(cards) {
  const m = createMatch({ seed: 5, rounds: 3, roundTime: 60 });
  m.cards = cards;
  m.stats = [[tally(), tally()], [tally(), tally()], [tally(), tally()]];
  m.round = 3;
  m.clock = 60 - 1 / 120;
  for (let i = 0; i < 10 && m.phase !== 'over'; i++) stepMatch(m, DT);
  return m;
}

test('match: a draw has no winner (a majority draw too), and nobody cheers', () => {
  const even = [[10, 10], [10, 10], [10, 10]],
    majority = decided([[[10, 9], [10, 10], [10, 10]], even]),
    split = decided([[[10, 9], [9, 10], [10, 10]], even]),
    won = decided([[[10, 9], [10, 9], [10, 10]], even]);
  for (const m of [majority, split]) {
    assert.equal(m.result.how, 'draw');
    assert.equal(m.result.winner, null, JSON.stringify(m.totals));
    assert.equal(m.bout.over, null);
  }
  assert.deepEqual([won.result.how, won.result.winner], ['decision', 0]);
});

test('match: a man who beats the count is not counted on while he gets up, and never to ten', () => {
  // seed 1000, pros: boxer 1 left on 1 health, so the first clean blow puts him down; he is made to rise at eight, the latest
  const m = createMatch({ seed: 1000, rounds: 1, roundTime: 60 });
  m.bout.fighters[1].hp = 1;
  let counted = [],
    upAt = null,
    downAt = null,
    k = 0;
  while (m.phase !== 'over' && k++ < 60 * 90) {
    stepMatch(m, DT);
    for (const e of m.events) {
      if (e.type === 'down') (downAt = e.who), (m.count.up = 8);
      if (e.type === 'count') counted.push(e.n);
      if (e.type === 'up') upAt = e.n;
    }
    if (downAt !== null && m.phase === 'fight') break;
  }
  assert.equal(downAt, 1, 'he went down');
  assert.equal(upAt, 8);
  assert.equal(m.phase, 'fight', 'and fights on');
  assert.ok(Math.max(...counted) <= 8, 'no number after he started up: ' + counted.join(','));
  const f = m.bout.fighters[1];
  assert.ok(!f.down && !(f.action && MOVES[f.action.name].floor), 'on his feet');
});

test('brain: a defending boxer keeps his guard up for a while at a time, not a coin every frame', () => {
  // (1-1: 18.5 changes a second before; a guard held 0.4 s at a time, half the time, is 2.5)
  let frames = 0,
    flips = 0,
    up = 0;
  for (const seed of [11, 22]) {
    const m = createMatch({ seed, plans: [PLANS.defend, PLANS.steady], rounds: 1, roundTime: 30 });
    let was = false;
    while (m.phase !== 'over') {
      stepMatch(m, DT);
      const f = m.bout.fighters[0];
      frames++;
      if (f.cover !== was) flips++;
      if (f.cover) up++;
      was = f.cover;
    }
  }
  const perSecond = flips / (frames * DT);
  assert.ok(perSecond < 4, perSecond.toFixed(1) + ' changes a second');
  assert.ok(up / frames > 0.2, 'he does keep it up: ' + ((100 * up) / frames).toFixed(0) + '%');
});

test('brain: plans that keep a man out of reach still come in to work: no round without a punch', () => {
  // (2-1, 1-3: breathe and defend want 1.65 and 1.3 m, beyond the 1.10 m a combination starts inside)
  for (const [p, q] of [['breathe', 'breathe'], ['defend', 'breathe'], ['defend', 'defend']]) {
    const m = createMatch({ seed: 1, plans: [PLANS[p], PLANS[q]], rounds: 1, roundTime: 30 }),
      thrown = [0, 0];
    while (m.phase !== 'over') {
      stepMatch(m, DT);
      for (const e of m.events) if (e.type === 'punch') thrown[e.who]++;
    }
    // (the card's measure: a round in which nobody throws; a man told to breathe throws seldom, 8% of his chances)
    assert.ok(thrown[0] + thrown[1] > 0, `${p} vs ${q}: ${thrown}`);
  }
});

test('brain: his own health counts: hurt, he throws less and stands off; whole, a little bolder', () => {
  const at = hp => hurtOf({ hp });
  assert.deepEqual(at(100), { hurt: 0, well: 1 });
  assert.equal(at(60).hurt, 0);
  assert.equal(at(15).hurt, 1);
  assert.ok(hurtEager(at(15)) < 0.7 && hurtEager(at(100)) > 1 && hurtEager(at(100)) <= 1 + HURT.bold);
  // in a round: the same man (seed 22, pros, steady plans) kept on 15 health and on 100; the hurt one stands further off,
  // covers more and starts fewer combinations of his own (his punches in all may not be fewer: a man who covers more parries
  // more, and takes the openings it gives him)
  const round = hp => {
    const m = createMatch({ seed: 22, rounds: 1, roundTime: 30 }),
      s = { far: 0, cover: 0, n: 0 };
    while (m.phase === 'fight') {
      m.bout.fighters[0].hp = hp;
      stepMatch(m, DT);
      const [a, b] = m.bout.fighters;
      s.n++;
      s.far += Math.hypot(a.x - b.x, a.z - b.z);
      if (a.cover) s.cover++;
    }
    s.combinations = m.brains[0].rests;
    return s;
  };
  const hurt = round(15),
    whole = round(100);
  assert.ok(hurt.far / hurt.n > whole.far / whole.n + 0.05, `${hurt.far / hurt.n} vs ${whole.far / whole.n} m`);
  assert.ok(hurt.cover / hurt.n > whole.cover / whole.n + 0.1, `${hurt.cover / hurt.n} vs ${whole.cover / whole.n}`);
  assert.ok(hurt.combinations < whole.combinations, `${hurt.combinations} vs ${whole.combinations}`);
});

test('brain: off the ropes: a man backed onto them goes round and out, and does not stay in a corner', () => {
  // (3-2 part A: a tired man set in a corner, a fresh one pressing him; before, 84% of 12 s on the ropes, 23% in the corner)
  const half = RULES.half;
  let corner = 0,
    edge = 0,
    n = 0,
    pivots = 0;
  for (const seed of [601, 702, 803]) {
    const m = createMatch({ seed, plans: [PLANS.steady, PLANS.pressure], rounds: 1, roundTime: 60 }),
      [a, b] = m.bout.fighters,
      d = 0.95 / Math.SQRT2;
    a.x = a.z = -2.2;
    b.x = b.z = -2.2 + d;
    a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
    a.stamina = 0.25 * a.k.staminaMax;
    settle(m.bout);
    for (let i = 0; i < 12 * 60 && m.phase === 'fight'; i++) {
      stepMatch(m, DT);
      for (const e of m.events) if (e.type === 'hopPivot' && e.who === 0) pivots++;
      n++;
      if (Math.abs(a.x) > half - 0.5 && Math.abs(a.z) > half - 0.5) corner++;
      if (Math.max(Math.abs(a.x), Math.abs(a.z)) > half - 0.1) edge++;
    }
  }
  assert.ok(corner / n < 0.1, 'in the corner ' + ((100 * corner) / n).toFixed(0) + '%');
  assert.ok(edge / n < 0.15, 'right on the ropes ' + ((100 * edge) / n).toFixed(0) + '%');
  assert.ok(pivots > 0, 'he pivots off them');
  // a whole round told to breathe against a man who comes after him (6-5: 76-89% of it within 10 cm of the ropes, 29 s at once)
  const m = createMatch({ seed: 1, plans: [PLANS.breathe, PLANS.steady], rounds: 1, roundTime: 60 }),
    f = m.bout.fighters[0];
  let run = 0,
    most = 0,
    on = 0,
    k = 0;
  while (m.phase !== 'over') {
    stepMatch(m, DT);
    if (m.phase !== 'fight') continue;
    k++;
    if (Math.max(Math.abs(f.x), Math.abs(f.z)) > half - 0.1) on++, (most = Math.max(most, ++run));
    else run = 0;
  }
  assert.ok(on / k < 0.15, 'on the ropes ' + ((100 * on) / k).toFixed(0) + '% of the round');
  assert.ok(most * DT < 3, 'at most ' + (most * DT).toFixed(1) + ' s at a time');
});

test('brain: they fight from a distance: wait outside the jab, step in to throw, step back out', () => {
  // (the user's memo, 2026-11-28: too long pressed up against each other; seeds 1000 and 8919, pros, steady plans, one round)
  let n = 0,
    near = 0,
    out = 0,
    thrown = 0;
  for (const seed of [1000, 8919]) {
    const m = createMatch({ seed, rounds: 1, roundTime: 40 });
    while (m.phase !== 'over') {
      stepMatch(m, DT);
      for (const e of m.events) if (e.type === 'punch') thrown++;
      if (m.phase !== 'fight') continue;
      const [a, b] = m.bout.fighters,
        far = Math.hypot(a.x - b.x, a.z - b.z);
      n++;
      if (far <= 0.9) near++;
      if (far >= SPACE.start) out++;
    }
  }
  assert.ok(near / n < 0.05, 'within 0.9 m ' + ((100 * near) / n).toFixed(1) + '%');
  assert.ok(out / n > 0.4, 'out of reach of starting ' + ((100 * out) / n).toFixed(0) + '%');
  assert.ok(thrown > 100, thrown + ' punches in 80 s');
});
