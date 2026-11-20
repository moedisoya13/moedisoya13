// The seven grades of a punch (anim/skill.mjs): what each is, as the bout fights it (the catalogue's rungs, tools/ladder.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle } from '../src/game/bout.mjs';
import { rung, run } from '../src/measure.mjs';
import { DIRTY } from '../src/ladder.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';

const DT = 1 / 60;
const PUNCHES = ['jab', 'cross', 'hook', 'upper'];
const CLEAN = ['1', '2', '3', '4m', '5m'];
// every rung, fought once: the blow (and when it landed after the press), and the body that threw it
const ladder = Object.fromEntries(PUNCHES.flatMap(p => LEVELS.map(lv => [`${p}@${lv}`, rung(`${p}@${lv}`)])));
const r = (p, lv) => ladder[`${p}@${lv}`];

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
    for (const lv of LEVELS) assert.equal(r(name, lv).type, 'hit', `${name}@${lv} lands`);
    for (const [lo, hi] of [['1', '2'], ['2', '3'], ['3', '4m'], ['4m', '5m'], ['3', '4a'], ['4a', '5a']]) {
      assert.ok(r(name, hi).J > r(name, lo).J, `${name}: ${lo} ${r(name, lo).J} < ${hi} ${r(name, hi).J}`);
      assert.ok(r(name, hi).ms <= r(name, lo).ms, `${name}: ${hi} (${r(name, hi).ms} ms) gets there no later than ${lo} (${r(name, lo).ms} ms)`);
    }
    // a beginner's is a fraction of a pro's (the jab, an arm punch anyway, the least), a legend's well over it
    assert.ok(r(name, '1').J < 0.65 * r(name, '3').J && r(name, '5m').J > 1.1 * r(name, '3').J, name);
  }
});

test('skill: a beginner throws the arm before the body has turned behind it; from an amateur up, the joints go legs first', () => {
  for (const name of PUNCHES) {
    const fired = lv => r(name, lv).fired;
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

test('skill: the better he is, the further his head is off the line when the punch lands, and the more his hips turn', () => {
  for (const name of PUNCHES) {
    for (let i = 2; i < CLEAN.length; i++) assert.ok(r(name, CLEAN[i]).off > r(name, CLEAN[i - 1]).off, `${name}: head off the line, ${CLEAN[i - 1]} ${r(name, CLEAN[i - 1]).off} < ${CLEAN[i]} ${r(name, CLEAN[i]).off} cm`);
    for (let i = 1; i < CLEAN.length; i++) assert.ok(r(name, CLEAN[i]).hipTurn > r(name, CLEAN[i - 1]).hipTurn, `${name}: hips turned, ${CLEAN[i - 1]} ${r(name, CLEAN[i - 1]).hipTurn} < ${CLEAN[i]} ${r(name, CLEAN[i]).hipTurn} deg`);
  }
});

test('skill: a beginner and an amateur turn all of a piece; from a pro up the shoulders are held back behind the hips, more the better he is', () => {
  for (const name of PUNCHES) {
    for (const lv of ['1', '2']) assert.ok(r(name, lv).sep < 1, `${name}@${lv}: ${r(name, lv).sep} deg`);
    assert.ok(r(name, '3').sep < r(name, '4m').sep && r(name, '4m').sep < r(name, '5m').sep, `${name}: ${r(name, '3').sep} < ${r(name, '4m').sep} < ${r(name, '5m').sep} deg`);
  }
});

/* A beginner stands up out of his knees into every punch. A pro sits down into a hook and a cross; so does a great one. (A
   legend's cross lands off his beat, at the top of a bounce he never stops; an uppercut comes up out of the knees by what
   it is; and a jab is over before the knees have done more than start: see README.) */
test('skill: a beginner stands up into his punches; a pro and a great one land a hook and a cross down in their knees', () => {
  for (const name of PUNCHES) assert.ok(r(name, '1').sunk > 0, `${name}@1: hips ${r(name, '1').sunk} cm from his guard`);
  for (const lv of ['3', '4m']) for (const name of ['cross', 'hook']) assert.ok(r(name, lv).sunk < 0, `${name}@${lv}: hips ${r(name, lv).sunk} cm from his guard`);
  assert.ok(r('hook', '5m').sunk < 0, `hook@5m: hips ${r('hook', '5m').sunk} cm from his guard`);
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

test('skill: a dirty punch lands within a frame of the clean one of its grade', () => {
  for (const name of PUNCHES)
    for (const top of ['4', '5']) assert.ok(Math.abs(r(name, `${top}m`).ms - r(name, `${top}a`).ms) <= DT * 1000 + 1e-9, `${name}@${top}: ${r(name, `${top}m`).ms} / ${r(name, `${top}a`).ms} ms`);
});

/* A dirty fighter's fouls (moves.mjs: foul) really land, the way a punch does, and do what they do. Timed in the frames that
   are drawn: the moment of a blow is held. */
const technique = Object.fromEntries(DIRTY.map(e => [e.id, run(e)]));
const events = id => technique[id].frames.flatMap((f, i) => f.events.filter(e => e.who === 0).map(e => ({ ...e, i, drawn: technique[id].frames.slice(0, i + 1).filter(g => !g.held).length })));
const first = (id, type, name) => events(id).find(e => e.type === type && (!name || e.name === name));
test('skill: a dirty hook stands on his instep before it lands, and his lead foot stays where it was stood on', () => {
  for (const lv of ['4a', '5a']) {
    const id = `stomp@${lv}`,
      stomp = first(id, 'foul', 'stomp'),
      hit = first(id, 'hit', 'hook');
    assert.ok(stomp && hit && stomp.i < hit.i, `${id}: ${JSON.stringify(events(id).map(e => e.type + ' ' + (e.name || '')))}`);
    const pinned = technique[id].frames.filter(f => f.foe.pinned),
      moved = Math.max(...pinned.map(f => Math.hypot(f.foe.foot[0] - pinned[0].foe.foot[0], f.foe.foot[2] - pinned[0].foe.foot[2])));
    assert.ok(pinned.length >= 20, `${id}: pinned for ${pinned.length} frames`);
    assert.ok(moved <= 0.01, `${id}: his lead foot moved ${(moved * 100).toFixed(1)} cm while it was stood on`);
  }
});
test('skill: a dirty jab leaves the glove over his face after it lands', () => {
  for (const lv of ['4a', '5a']) {
    const jab = first(`thumb@${lv}`, 'hit', 'jab'),
      thumb = first(`thumb@${lv}`, 'foul', 'thumb');
    assert.ok(jab && thumb && thumb.i > jab.i, `thumb@${lv}`);
  }
});
test('skill: the cross and the uppercut have no foul at any grade', () => {
  for (const id of Object.keys(ladder).filter(id => /^(cross|upper)@/.test(id))) assert.ok(!ladder[id].frames.some(f => f.events.some(e => e.type === 'foul')), id);
});
