// The seven grades of a punch (anim/skill.mjs): what each is, as the bout fights it (the catalogue's rungs, tools/ladder.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle } from '../src/game/bout.mjs';
import { rung, run } from '../src/measure.mjs';
import { DIRTY, LADDER, BODY_LADDER, REAR_LADDER, SHOWOFF } from '../src/ladder.mjs';
import { audit } from '../src/audit.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { createChain, stepChain, effectiveMass, LINKS } from '../src/phys/chain.mjs';

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
const events = id => technique[id].frames.flatMap((f, i) => f.events.filter(e => e.who === 0).map(e => ({ ...e, i, drawn: technique[id].frames.slice(0, i + 1).filter(g => !g.held).length }))).map((e, n) => ({ ...e, n }));
const first = (id, type, name) => events(id).find(e => e.type === type && (!name || e.name === name));
test('skill: a dirty hook stands on his instep before it lands, and his lead foot stays where it was stood on', () => {
  for (const lv of ['4a', '5a']) {
    const id = `stomp@${lv}`,
      stomp = first(id, 'foul', 'stomp'),
      hit = first(id, 'hit', 'hook');
    // (the foot comes down with the legs' drive, and the hook lands on its sweep a moment later: in the same frame, at the
    // closest, where the foot is judged first)
    assert.ok(stomp && hit && stomp.n < hit.n, `${id}: ${JSON.stringify(events(id).map(e => e.type + ' ' + (e.name || '')))}`);
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

/* The waist (phys/chain.mjs): a sixth joint, a branch off the hips. The punches that turn it as plan 6 §1.4 has it turn a share
   of what the chest turned before on the waist instead; each is tried here against itself with that share given back to the
   chest (`plainOf`). The jab, the cross, the hook and the uppercut have no share of their own (what they do in the catalogue's
   cards is too fine for one: moves.mjs), and are tried as plan 6 §1.4 wrote them (`given`: degrees of the twist, rad/s of the
   waist's muscle), but for the uppercut's muscle: §1.4 writes 60 rad/s for the uppercuts, and with 60 a great one's and a
   legend's waist reaches its peak in the same step of the chain as the chest, not before it, which §1.6 (1) asks (hips,
   waist, chest, in that order). The two uppercuts that turn a waist are built with 64 for that (moves.mjs: upperIn,
   upperBody), and the plain one is tried with 64 here so that the order below can be held strictly at every grade from a
   pro's up; with §1.4's 60 it holds as `no later than the chest` at 4 and 5, as it was held before stage N. A deviation from
   §1.4's table, for the user to see (the stage's report). The waist is tried set off from each place it can be: with the
   trunk (hips), with the hips (drive), with the legs. */
const plainOf = m => {
  const { waist, ...chain } = m.chain,
    { waist: w, ...links } = m.links;
  return Object.assign({}, m, { chain, links: Object.assign({}, links, { trunk: Object.assign({}, links.trunk, { twist: links.trunk.twist + w.waist }) }) });
};
const GIVEN = { jab: [-4, 70], cross: [10, 64], hook: [-10, 66], upper: [6, 64] };
const given = name => {
  const m = MOVES[name],
    [waist, rate] = GIVEN[name];
  return Object.assign({}, m, {
    chain: Object.assign({}, m.chain, { waist: { rate, from: 'hips' } }),
    links: Object.assign({}, m.links, { trunk: Object.assign({}, m.links.trunk, { twist: m.links.trunk.twist - waist }), waist: { waist } })
  });
};
const from = (m, at) => Object.assign({}, m, { chain: Object.assign({}, m.chain, { waist: Object.assign({}, m.chain.waist, { from: at }) }) });
// the punches whose share of the chest's turn is the waist's now (plan 6 §1.4), and those of them on the catalogue's ladders
const MOVED = ['upperIn', 'jabBody', 'crossBody', 'upperBody'];
const RUNGS = MOVED;
// one punch thrown on its own, at 240 steps a second, at a grade: its chain, and the most weight behind the glove on the way
const thrown = (move, lv, each) => {
  const c = createChain(move, 1, LEVEL[lv]);
  c.mass = 0;
  for (let i = 0; i < 480 && c.phase !== 'done'; i++) {
    stepChain(c, move, 1 / 240);
    if (c.phase === 'throw') c.mass = Math.max(c.mass, effectiveMass(c, move));
    if (each) each(c);
  }
  return c;
};
test('skill: the waist goes off with what sets it off and peaks between the hips and the chest; the other five go when they did', () => {
  const cases = [...MOVED.map(n => [n, MOVES[n], plainOf(MOVES[n])]), ...Object.keys(GIVEN).map(n => [n, given(n), MOVES[n]])];
  for (const [name, move, without] of cases)
    for (const lv of LEVELS) {
      const plain = thrown(without, lv);
      for (const at of ['hips', 'drive', 'legs']) {
        const c = thrown(from(move, at), lv);
        // (a branch: whatever the waist does, the legs, hips, trunk, shoulder and elbow fire and peak at the same instants)
        for (let i = 0; i < 5; i++) {
          assert.equal(c.fired[i], plain.fired[i], `${name}@${lv} (${at}): ${LINKS[i]} fires when it did`);
          assert.equal(c.peakAt[i], plain.peakAt[i], `${name}@${lv} (${at}): ${LINKS[i]} peaks when it did`);
        }
        assert.equal(c.fired[5], c.fired[at === 'legs' ? 0 : at === 'drive' ? 1 : 2], `${name}@${lv}: the waist goes off with the ${at === 'legs' ? 'legs' : at === 'drive' ? 'hips' : 'trunk'}`);
        assert.ok(c.peak[5] > 1, `${name}@${lv} (${at}): the waist turns`);
        // (the same weight behind the glove: the trunk's share split between the waist and the chest, not added to)
        if (at !== 'legs') assert.ok(Math.abs(c.mass / plain.mass - 1) < 0.03, `${name}@${lv} (${at}): ${c.mass.toFixed(2)} kg behind it, ${plain.mass.toFixed(2)} without the waist`);
      }
      // from a pro up the order of the peaks is the hips, the waist, the chest (plan 6 §1.6 (1))
      if (['3', '4m', '4a', '5m', '5a'].includes(lv)) {
        const c = thrown(from(move, 'hips'), lv);
        assert.ok(c.peakAt[1] < c.peakAt[5] && c.peakAt[5] < c.peakAt[2], `${name}@${lv}: hips ${c.peakAt[1]}, waist ${c.peakAt[5]}, trunk ${c.peakAt[2]}`);
      }
    }
});
/* §1.6 (1) is held above of the punches that moved a share of the chest's turn to the waist. The three the catalogue asked for
   more waist in (plan 6 §3.3) each turn it in an order of their own, by design, and are held to that here. The inside hook's
   waist is set off with the hips and is quicker than they are: it peaks first, before the hips and the chest, right up close
   the waist doing the hitting before the hips have turned (N14). The rear hook's is set off with the hips too, so that it
   is ahead of the chest and the chest on the pelvis is no faster than it was (§1.3): it peaks with the hips, a step of the
   chain (1/240 s) before them at the most, and before the chest (N15). The flicker's, loose, peaks before the hips and 20
   ms and more before the elbow, the handle stopped as the tip goes fastest (N17; its two grades). */
test('skill: the inside hook, the rear hook and the flicker turn the waist in the order each was built to', () => {
  for (const lv of ['3', '4m', '4a', '5m', '5a']) {
    const i = thrown(MOVES.hookIn, lv),
      r = thrown(MOVES.hookR, lv);
    assert.ok(i.peakAt[5] < i.peakAt[1] && i.peakAt[1] < i.peakAt[2], `hookIn@${lv}: waist ${i.peakAt[5]}, hips ${i.peakAt[1]}, chest ${i.peakAt[2]}`);
    assert.ok(Math.abs(r.peakAt[5] - r.peakAt[1]) <= 1 / 240 + 1e-9 && r.peakAt[5] < r.peakAt[2], `hookR@${lv}: waist ${r.peakAt[5]}, hips ${r.peakAt[1]}, chest ${r.peakAt[2]}`);
  }
  for (const lv of ['4a', '5a']) {
    const f = thrown(MOVES.flicker, lv);
    assert.ok(f.peakAt[5] < f.peakAt[1] && f.peakAt[4] - f.peakAt[5] >= 0.02, `flicker@${lv}: waist ${f.peakAt[5]}, hips ${f.peakAt[1]}, elbow ${f.peakAt[4]}`);
  }
});
/* A punch whose share of the chest's turn is the waist's now (plan 6 §1.4) is the punch it was: at every grade, as the bout
   fights its rung, within 6% of the impulse and a frame of the contact of itself with that share given back to the chest
   (§1.6 (4)), and the chest no more than a tenth faster on the pelvis (§1.6 (5)). */
const asPlain = (names, fn) => {
  const saved = names.map(n => [MOVES[n], { chain: MOVES[n].chain, links: MOVES[n].links }]);
  for (const [m] of saved) {
    const p = plainOf(m);
    Object.assign(m, { chain: p.chain, links: p.links });
  }
  try {
    return fn();
  } finally {
    for (const [m, was] of saved) Object.assign(m, was);
  }
};
test('skill: a punch whose share of the chest is the waist\'s now lands within 6% and a frame of what it did, at every grade', () => {
  const ids = RUNGS.flatMap(p => LEVELS.map(lv => `${p}@${lv}`)),
    now = Object.fromEntries(ids.map(id => [id, rung(id)])),
    was = asPlain(RUNGS, () => Object.fromEntries(ids.map(id => [id, rung(id)])));
  for (const id of ids) {
    assert.equal(now[id].type, was[id].type, id);
    assert.ok(Math.abs(now[id].J / was[id].J - 1) <= 0.06, `${id}: ${now[id].J} N·s, ${was[id].J} with the chest's share`);
    assert.ok(Math.abs(now[id].ms - was[id].ms) <= DT * 1000 + 1e-9, `${id}: lands ${now[id].ms} ms after the press, ${was[id].ms} with the chest's share`);
  }
});
/* And the chest no more than a tenth faster than before the waist (§1.3, §1.6 (5)), every punch with a waist, every grade: the
   four that moved a share, on the pelvis, against themselves with the share given back; the rear hook, on the pelvis, against
   what it was at 7fa3003 before its waist (TURNED). The inside hook and the flicker turn a waist the plan asks to be quick
   (N14: 450 deg/s and more; N17) on top of a chest that hardly turned before (62 deg/s at a pro's inside hook, 169 at a
   legend's flicker): the chest rides on the waist, so on the pelvis it cannot keep within a tenth of that (437 and 523
   deg/s); what is held of theirs is the chest's own turn, on the waist. This is a deviation from §1.6 (5), which bounds the
   chest on the pelvis for every punch: it is the pending question `waist-bound`, its recommended answer (the chest's own
   turn) taken, awaiting the user. (The flicker's cards are filed under the press, the jab's: audit.mjs.) */
const TURNED = {
  hookR: { 1: 7, 2: 752, 3: 1071, '4m': 1301, '4a': 1297, '5m': 1523, '5a': 1520 },
  hookIn: { 1: 0, 2: 0, 3: 62, '4m': 50, '4a': 67, '5m': 72, '5a': 97 },
  flicker: { '4a': 156, '5a': 169 }
};
test('skill: and its chest turns no more than a tenth faster than it did, every punch with a waist', () => {
  const entries = [...LADDER, ...BODY_LADDER].filter(e => RUNGS.includes(e.punch)),
    now = audit(entries).turning,
    was = asPlain(RUNGS, () => audit(entries).turning);
  for (const p of RUNGS)
    for (const lv of LEVELS) assert.ok(now[p][lv].trunk <= was[p][lv].trunk * 1.1 + 1e-9, `${p}@${lv}: the chest on the pelvis ${now[p][lv].trunk.toFixed(0)} deg/s, ${was[p][lv].trunk.toFixed(0)} with the chest's share`);
  const three = audit([...REAR_LADDER, ...LADDER.filter(e => e.punch === 'hookIn'), ...SHOWOFF.filter(e => e.id === 'flicker@4a' || e.id === 'flicker@5a')]).turning;
  for (const lv of LEVELS) {
    assert.ok(three.hookR[lv].trunk <= TURNED.hookR[lv] * 1.1 + 1e-9, `hookR@${lv}: the chest on the pelvis ${three.hookR[lv].trunk.toFixed(0)} deg/s, ${TURNED.hookR[lv]} before its waist`);
    // (a beginner's and an amateur's chest did not turn on the pelvis at all before the contact: held to that, to a rounding)
    assert.ok(three.hookIn[lv].own <= TURNED.hookIn[lv] * 1.1 + 0.5, `hookIn@${lv}: the chest on the waist ${three.hookIn[lv].own.toFixed(0)} deg/s, ${TURNED.hookIn[lv]} on the pelvis before its waist`);
  }
  for (const lv of ['4a', '5a']) assert.ok(three.jab[lv].own <= TURNED.flicker[lv] * 1.1 + 1e-9, `flicker@${lv}: the chest on the waist ${three.jab[lv].own.toFixed(0)} deg/s, ${TURNED.flicker[lv]} on the pelvis before its waist`);
});
test('skill: a punch that does not turn its waist holds it still all the way through', () => {
  for (const [name, move] of Object.entries(MOVES).filter(([, m]) => m.punch && !m.chain.waist))
    for (const lv of LEVELS) thrown(move, lv, c => assert.ok(c.q[5] === 0 && c.v[5] === 0, `${name}@${lv}: the waist moved`));
});
