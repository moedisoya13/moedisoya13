// The seven grades of a punch (anim/skill.mjs): what each is, as the bout fights it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { LADDER, AT } from '../src/ladder.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';

const DT = 1 / 60;
const PUNCHES = ['jab', 'cross', 'hook', 'upper'];

// one loop of a ladder script: the blow, the chain that threw it, and the boxer's joints in every frame
function fight(id) {
  const entry = LADDER.find(e => e.id === id),
    bout = freshBout(entry),
    frames = [];
  let blow = null,
    chain = null,
    struck = -9;
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    const f = bout.fighters[0];
    if (f.action && f.action.chain) chain = f.action.chain;
    for (const e of bout.events) if (!blow && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)) (blow = { ...e, t: (tick + 1) * DT - AT }), (struck = tick);
    if (bout.stop > 0 && tick - struck < 30) struck = tick;
    frames.push({ tick, held: bout.stop > 0, struck: tick - struck <= 2, hand: toWorld(f.place, f.pose.at[(blow || {}).hand === 'L' ? 'LeftHand' : 'RightHand'], f.pose.stretch), joints: Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)])) });
  }
  return { blow, chain, frames };
}
const ladder = Object.fromEntries(LADDER.map(e => [e.id, fight(e.id)]));

test('skill: a pro is the textbook, exactly: grade 3 throws every punch the way it is written', () => {
  for (const name of PUNCHES) {
    const J = skills => {
      const b = createBout(5, { skills: [skills, {}] });
      b.fighters[0].x = -0.46;
      b.fighters[1].x = 0.46;
      b.fighters[1].hp = 1000;
      settle(b);
      if (name === 'hook' || name === 'upper') Object.assign(b.fighters[0], { lastPower: true, sinceLast: 0, link: name === 'hook' ? 0 : 1 });
      for (let i = 0; i < 60; i++) {
        step(b, [i === 0 ? (name === 'jab' ? { jab: true } : { power: true }) : {}, {}], DT);
        const e = b.events.find(e => e.type === 'hit');
        if (e) return e.J;
      }
      return null;
    };
    assert.ok(J({}) > 0, name);
    assert.equal(J({ all: '3' }), J({}), name);
  }
});

test('skill: every punch is harder and gets there sooner, grade by grade, clean or dirty', () => {
  for (const name of PUNCHES) {
    const r = lv => ladder[`${name}@${lv}`].blow;
    for (const lv of LEVELS) assert.equal(r(lv).type, 'hit', `${name}@${lv} lands`);
    for (const [lo, hi] of [['1', '2'], ['2', '3'], ['3', '4m'], ['4m', '5m'], ['3', '4a'], ['4a', '5a']]) {
      assert.ok(r(hi).J > r(lo).J, `${name}: ${lo} ${r(lo).J} < ${hi} ${r(hi).J}`);
      assert.ok(r(hi).t <= r(lo).t + 1e-9, `${name}: ${hi} gets there no later than ${lo}`);
    }
    // a beginner's is a fraction of a pro's (the jab, an arm punch anyway, the least), a legend's well over it
    assert.ok(r('1').J < 0.65 * r('3').J && r('5m').J > 1.1 * r('3').J, name);
  }
});

test('skill: a beginner throws the arm before the body has turned behind it; from an amateur up, the joints go legs first', () => {
  for (const name of PUNCHES) {
    const fired = lv => ladder[`${name}@${lv}`].chain.fired;
    // (at grade 1 the shoulder goes with the hips, before the trunk if the trunk goes at all; in the textbook, after it)
    const one = fired('1');
    assert.ok(one[3] <= one[1] && (one[2] < 0 || one[3] < one[2]), `${name}: at grade 1 the shoulder goes with the hips: ${one}`);
    for (const lv of ['2', '3', '4m', '5m']) {
      const f = fired(lv);
      for (let i = 1; i < 4; i++) assert.ok(f[i] >= f[i - 1], `${name}@${lv}: joint ${i} after joint ${i - 1}`);
    }
    // an amateur's is the right order with a seam in it: his hips go later after his legs than a pro's
    assert.ok(fired('2')[1] - fired('2')[0] > fired('3')[1] - fired('3')[0], name);
  }
});

test('skill: no grade of any punch has a joint go one way and straight back the next frame by more than 3 cm', () => {
  for (const [id, { frames }] of Object.entries(ladder)) {
    const live = frames.filter(f => !f.held);
    for (let i = 2; i < live.length; i++) {
      if (live[i].struck || live[i - 1].struck) continue;
      for (const n of NAMES) {
        const a = live[i - 2].joints[n],
          m = live[i - 1].joints[n],
          c = live[i].joints[n],
          was = m.map((v, k) => v - a[k]),
          now = c.map((v, k) => v - m[k]),
          lw = Math.hypot(...was),
          ln = Math.hypot(...now),
          against = -(was[0] * now[0] + was[1] * now[1] + was[2] * now[2]) / (lw * ln || 1);
        assert.ok(!(against > 0.6 && Math.min(lw, ln) > 0.03), `${id}: ${n} pops ${(Math.min(lw, ln) * 100).toFixed(1)} cm at ${live[i].tick}`);
      }
    }
  }
});

test('skill: a dirty punch lands where the clean one does, and then its foul shows', () => {
  for (const name of PUNCHES)
    for (const top of ['4', '5']) {
      const clean = ladder[`${name}@${top}m`],
        dirty = ladder[`${name}@${top}a`];
      assert.ok(Math.abs(clean.blow.t - dirty.blow.t) <= DT + 1e-9, `${name}@${top}: lands within a frame of the clean one`);
      // in the moment after it has landed, the punching hand is somewhere else
      const after = clean.frames.filter(f => f.tick * DT - AT > clean.blow.t && f.tick * DT - AT < clean.blow.t + 0.3),
        apart = Math.max(...after.map(f => Math.hypot(...f.hand.map((v, k) => v - dirty.frames[f.tick].hand[k])))),
        body = Math.max(...after.map(f => Math.hypot(...f.joints.Head.map((v, k) => v - dirty.frames[f.tick].joints.Head[k]))));
      assert.ok(Math.max(apart, body) > 0.06, `${name}@${top}: the foul moves the hand ${(apart * 100).toFixed(1)} cm, the head ${(body * 100).toFixed(1)} cm`);
    }
});
