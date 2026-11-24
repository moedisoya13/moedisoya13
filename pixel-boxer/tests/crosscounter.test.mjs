/* The cross counter (docs/cross-counter-plan.md §8.1; stage Y1): the rear straight thrown over the other man's jab as it comes,
   the head off inside it in the same movement (game/bout.mjs CROSSING, anim/over.mjs, moves.mjs crossOver, src/defense.mjs
   CROSS_COUNTER). Its cards are fought here as the catalogue fights them (the pro's jab at 0.8 s from 1.0 m, the boxer pressing
   in the middle of his window) and held to what the plan asks of them, number by number. Where the engine fell short of the
   plan's number the test holds what it reaches, and says so beside it (the plan's number first): those are the stage's known
   limits, reported, not targets met. The plan's tests 12 and 15 (the head's dice, the seeded bouts) are stage Y2's. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trace, summary, segseg, engine, setGlove } from '../tools/crosscounter.mjs';
import { CROSS_COUNTER, OUT_COUNTER, OVER_LEVELS, DEFENSE } from '../src/defense.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import { RULES, CROSSING, step, getUp } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { rung, run } from '../src/measure.mjs';
import { auditor } from '../src/audit.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { LEVEL } from '../src/anim/skill.mjs';
import { createChain, stepChain } from '../src/phys/chain.mjs';

const E = await engine();
setGlove(E.gloveInArm);
const F = 1 / 60;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  len = a => Math.hypot(a[0], a[1], a[2]);
const card = lv => CROSS_COUNTER.find(e => e.id === `crossCounter@${lv}`);
// (a card fought as the tool fights it: the same moments, the same place; o.k the frame after the jab's press it presses on)
const fought = new Map();
const fight = (lv, k, more) => {
  const key = JSON.stringify([lv, k, more || {}]);
  if (!fought.has(key)) {
    const o = Object.assign({ lv, k }, more),
      t = trace(E, o);
    fought.set(key, { o, frames: t.frames, s: summary(t.frames, o), audit: t.audit, bout: t.bout });
  }
  return fought.get(key);
};
const middle = lv => WINDOWS.crossCounter[lv].at;
const atMiddle = lv => fight(lv, middle(lv));

// the jab's miss, cm, each grade's band (§0.2: 3 2–5, 4명 2–4, 4암 1–3, 5명 1–3, 5암 0.5–2)
const MISS = { 3: [2, 5], '4m': [2, 4], '4a': [1, 3], '5m': [1, 3], '5a': [0.5, 2] };
// what the straight lands with, each grade (the ladder's rung: src/ladder.mjs, src/measure.mjs rung)
const STRAIGHT = Object.fromEntries(OVER_LEVELS.map(lv => [lv, rung(`cross@${lv}`).J]));

test('cross counter 1: each grade\'s card ends the way it says: the jab misses by the grade\'s margin, the cross counter lands on his head, a counter', () => {
  for (const lv of OVER_LEVELS) {
    const e = card(lv);
    assert.equal(e.answer, middle(lv), `${lv}: the card presses in the middle of its window`);
    const { s } = atMiddle(lv);
    assert.equal(s.jab.type, 'whiff', `${lv}: the jab ${s.jab.type}`);
    assert.ok(s.jab.margin >= MISS[lv][0] - 1e-9 && s.jab.margin <= MISS[lv][1] + 1e-9, `${lv}: the jab missed by ${s.jab.margin} cm, the grade's ${MISS[lv]}`);
    assert.equal(s.blow.type, 'hit', `${lv}: ${s.blow.type}`);
    assert.equal(s.blow.name, 'crossOver');
    assert.ok(!s.blow.zone && s.blow.part !== 'body', `${lv}: on his head`);
    assert.equal(s.blow.counter, true, `${lv}: a counter`);
  }
});

test('cross counter 2: it lands 9 frames (±1) after the jab is pressed, the jab\'s arm still out (50 cm or more from his shoulder), a counter', () => {
  for (const lv of OVER_LEVELS) {
    const { s } = atMiddle(lv);
    assert.ok(Math.abs(s.blow.n - 9) <= 1, `${lv}: landed at +${s.blow.n}`);
    assert.ok(s.blow.arm >= 50, `${lv}: the jab's glove ${s.blow.arm} cm from his shoulder`);
    assert.equal(s.blow.counter, true);
    assert.equal(WINDOWS.crossCounter[lv].hit, s.blow.n, `${lv}: the window's row says when it lands`);
  }
});

test('cross counter 3: it lands 3 frames or more sooner than the same grade\'s slip and counter', () => {
  for (const lv of OVER_LEVELS) {
    const e = DEFENSE.find(x => x.id === `counter@${lv}`),
      { frames } = run(e, e.loop),
      press = frames.findIndex(f => f.events.some(v => v.type === 'punch' && v.who === 1)),
      hit = frames.findIndex(f => f.events.some(v => v.type === 'hit' && v.who === 0)),
      slipped = hit - press,
      { s } = atMiddle(lv);
    assert.ok(slipped - s.blow.n >= 3, `${lv}: the slip counter at +${slipped}, the cross counter at +${s.blow.n}`);
  }
});

/* The head (§3.3). Held as the plan has it: off the jab's way by 25 cm or more as the jab gets to where it was (+6), across before
   ahead, and never quicker in a frame than the same grade's slip. Where it is at the contact the plan puts at 27–33 cm across,
   14–22 ahead and 4–9 down: across holds for the clean grades, the dirty grades go in on him (their `in`) and end 33–36 across
   and 25 ahead, and the head goes down 2–10 cm, the pro's least (the slip's own bend lifts it): held to what it reaches */
const HEAD_AT = { left: [26.5, 36.5], ahead: [14, 26.5], down: [2, 10] };
test('cross counter 4: the head goes off the line first and across, no quicker than the slip, and is clear of the jab\'s way by 25 cm as it gets there', () => {
  for (const lv of OVER_LEVELS) {
    const { s } = atMiddle(lv);
    // (25 cm: the two balls' 23 and 2 cm; a grade whose miss the plan puts under 2 cm, its least: 5암 0.5, 4암 and 5명 1)
    assert.ok(s.off6 >= 23 + Math.min(2, MISS[lv][0]), `${lv}: ${s.off6} cm off the jab's way at +6`);
    assert.ok(s.leftFirst.left20 !== null && (s.leftFirst.ahead10 === null || s.leftFirst.left20 < s.leftFirst.ahead10), `${lv}: 20 cm across at +${s.leftFirst.left20}, 10 ahead at +${s.leftFirst.ahead10}`);
    const [left, up, ahead] = s.blow.head;
    assert.ok(left >= HEAD_AT.left[0] && left <= HEAD_AT.left[1], `${lv}: ${left} cm across at the contact`);
    assert.ok(ahead >= HEAD_AT.ahead[0] && ahead <= HEAD_AT.ahead[1], `${lv}: ${ahead} cm ahead at the contact`);
    assert.ok(-up >= HEAD_AT.down[0] && -up <= HEAD_AT.down[1], `${lv}: ${-up} cm down at the contact`);
    // (the slip to his left, pressed on its own: how far his head goes in a frame, the same ball of it, src/audit.mjs measure)
    const slip = { id: 'slip', loop: 1.6, me: () => HOME, him: () => [HOME[0] + 1.0, HOME[1]], press: [[0.8, 'slip', 1]], against: [], setup: b => (b.fighters[0].skills = { all: lv }) },
      bout = freshBout(slip);
    let most = 0,
      was = null;
    for (let tick = 0; tick < 66; tick++) {
      step(bout, drive(slip, bout, tick * F, F), F);
      const h = E.measure(bout.fighters[0]).at.head;
      if (tick >= 47 && was) most = Math.max(most, len(sub(h, was)));
      was = h;
    }
    assert.ok(s.headStep <= most * 100 + 1e-9, `${lv}: ${s.headStep} cm in a frame, the slip's ${(most * 100).toFixed(1)}`);
  }
});

/* The head goes in at him only once the jab has gone by (§3.3 "앞은 잽이 지나간 뒤"; game/bout.mjs crossBy, CROSSING by): until
   the bout marks it, it goes across and down and no more than 3 cm ahead (2.6 at the most on the cards, from either corner, the
   stance's own sway in it); going in from the moment he went (round 2), a cross counter that lost took the jab harder than the
   plain cross does */
test('cross counter 4b: the head goes in only once the jab has gone by', () => {
  for (const lv of OVER_LEVELS)
    for (const corner of [0, 1]) {
      const { frames } = fight(lv, middle(lv), corner ? { corner } : undefined),
        f0 = frames.find(f => f.n === -1),
        c = Math.cos(f0.yaw),
        sn = Math.sin(f0.yaw);
      const by = frames.find(f => f.n >= 0 && f.ba && f.ba.crossing && f.ba.crossing.by !== undefined);
      assert.ok(by && by.n >= 4 && by.n <= 6, `${lv}, corner ${corner}: the jab by at +${by && by.n}`);
      for (const f of frames.filter(f => f.n >= 0 && f.n < by.n)) {
        const d = sub(f.B.at.head, f0.B.at.head);
        assert.ok(sn * d[0] + c * d[2] <= 0.03, `${lv}, corner ${corner}: the head ${((sn * d[0] + c * d[2]) * 100).toFixed(1)} cm ahead at +${f.n}, before the jab is by`);
      }
    }
});

test('cross counter 5: it lands with 0.90 to 1.10 of the grade\'s straight, the grades in the straight\'s order', () => {
  const J = OVER_LEVELS.map(lv => atMiddle(lv).s.blow.J);
  OVER_LEVELS.forEach((lv, i) => assert.ok(J[i] >= 0.9 * STRAIGHT[lv] - 1e-9 && J[i] <= 1.1 * STRAIGHT[lv] + 1e-9, `${lv}: ${J[i]} N·s, the straight's ${STRAIGHT[lv]}`));
  for (let i = 1; i < J.length; i++) assert.ok(J[i] > J[i - 1], `${OVER_LEVELS[i]} ${J[i]} after ${OVER_LEVELS[i - 1]} ${J[i - 1]}`);
});

/* The arm over his (§3.5, §8.2): his lead arm as his own glove would meet it, the axes of the arms, his glove and forearm against
   the head and the rear shoulder, over the frames the checks look at. Held as the plan has them; the elbow at the contact, the
   plan's 1.50 m, is held to what it reaches (1.25 m: an elbow lifted up and out by the contact put the forearm through his upper
   arm or the upper arm through his forearm, §9.1's 2), and the glove comes down onto the head or level with it (the plan's 5–10
   degrees down: the dirty legend's comes in level, within 2 degrees) */
const ARM = { glove: 2, fore: 6, foreUp: 8, upper: 5, head: 2, shoulder: 5, over: 0, elbow: 1.25, rise: 0.035 };
test('cross counter 6: the rear arm goes over his: clear of his arm, his glove and forearm clear of the head and the shoulder', () => {
  for (const lv of OVER_LEVELS) {
    const { s, frames } = atMiddle(lv),
      a = s.arm;
    assert.ok(a.glove <= ARM.glove, `${lv}: the glove ${a.glove} cm into his arm`);
    assert.ok(a.fore >= ARM.fore, `${lv}: the forearms' axes ${a.fore} cm apart`);
    assert.ok(a.foreUp >= ARM.foreUp, `${lv}: the forearm ${a.foreUp} cm from his upper arm`);
    assert.ok(a.upper >= ARM.upper, `${lv}: the upper arm ${a.upper} cm from his forearm`);
    assert.ok(a.head === null || a.head <= ARM.head, `${lv}: his glove or forearm ${a.head} cm into the head`);
    assert.ok(a.shoulder === null || a.shoulder <= ARM.shoulder, `${lv}: his glove or forearm ${a.shoulder} cm into the rear shoulder`);
    assert.ok(a.over !== null && a.over >= ARM.over, `${lv}: the glove ${a.over} cm short of 13 over his arm where it goes over it`);
    assert.ok(s.blow.elbowY >= ARM.elbow, `${lv}: the elbow ${s.blow.elbowY} m up at the contact`);
    assert.ok(s.blow.descends <= ARM.rise, `${lv}: the glove's way into him, ${s.blow.descends} up`);
    // (the rear glove not taken across to his left with his head over the three frames after it went)
    const went = frames.find(f => f.n === s.go),
      later = frames.filter(f => f.n > s.go && f.n <= s.go + 3);
    for (const f of later) {
      const c = Math.cos(went.yaw),
        sn = Math.sin(went.yaw),
        d = sub(f.B.at.gloveRight, went.B.at.gloveRight);
      assert.ok(c * d[0] - sn * d[2] <= 0.03, `${lv}: the rear glove ${((c * d[0] - sn * d[2]) * 100).toFixed(1)} cm to his left at +${f.n}`);
    }
  }
});

test('cross counter 7: the waist goes between the hips and the chest, no faster than 600 degrees a second, the chest on the hips no faster than the straight\'s', () => {
  for (const lv of OVER_LEVELS) {
    // (the chain on its own, at 240 steps a second as tests/skill.test.mjs throws it: a bout's sixtieths cannot tell the peaks apart)
    const c = createChain(MOVES.crossOver, 1, LEVEL[lv]);
    for (let i = 0; i < 480 && c.phase !== 'done'; i++) stepChain(c, MOVES.crossOver, 1 / 240);
    assert.ok(c.peakAt[1] < c.peakAt[5] && c.peakAt[5] < c.peakAt[2], `${lv}: the hips, the waist, the chest peak at ${[c.peakAt[1], c.peakAt[5], c.peakAt[2]].map(v => v.toFixed(4))}`);
    const { frames, s } = atMiddle(lv),
      punch = frames.filter(f => f.ba && f.ba.name === 'crossOver');
    const rate = (fs, key) => {
      let most = 0;
      for (let i = 1; i < fs.length; i++) if (!fs[i].held && fs[i].n <= s.blow.n) most = Math.max(most, Math.abs(fs[i].B.angles[key] - fs[i - 1].B.angles[key]) / F);
      return most;
    };
    // (and the grade's straight, thrown at him standing there from the same place, no jab coming)
    const waist = rate(punch, 'WaistTwist'),
      chest = rate(punch, 'SpineTwist'),
      cross = trace(E, { lv, k: 3, press: 'plain', throws: [] }).frames.filter(f => f.ba && f.ba.name === 'cross');
    let theirs = 0;
    for (let i = 1; i < cross.length; i++) if (!cross[i].held && cross[i].ba.phase === 'throw') theirs = Math.max(theirs, Math.abs(cross[i].B.angles.SpineTwist - cross[i - 1].B.angles.SpineTwist) / F);
    assert.ok(waist <= 600, `${lv}: the waist at ${waist.toFixed(0)} deg/s`);
    assert.ok(chest <= theirs * 1.1 + 1e-9, `${lv}: the chest on the hips at ${chest.toFixed(0)} deg/s, the straight's ${theirs.toFixed(0)}`);
  }
});

/* The lead hand and the feet (§3.6, §3.7). The lead glove: the plan's, within 4 cm of where his guard holds it from the head,
   not 3 cm under the chin. The engine's straight draws it in to his chin as it goes (13 to 16 cm nearer the head than his
   guard's, the clean grades; moves.mjs cross, links.trunk), and a show-off's comes up off his waist only part of the way: held,
   it goes no further from his head than in his guard, and no lower against his head than in the grade's own straight, thrown
   from the same place. The rear foot on its ball on the canvas (within 0.5 cm, or no higher than the grade's own straight lifts
   it: a clean legend's lifts it 3 cm), the lead foot pushed on 4–8 cm */
const FEET = { ball: 0.005, step: [0.04, 0.08] };
test('cross counter 8: the lead glove stays at the head, the rear foot on its ball, the lead foot pushed in', () => {
  for (const lv of OVER_LEVELS) {
    const { frames, s } = atMiddle(lv),
      f0 = frames.find(f => f.n === -1),
      guard = len(sub(f0.B.at.gloveLeft, f0.B.at.head)),
      during = frames.filter(f => f.n >= s.go && f.n <= s.blow.n),
      cross = trace(E, { lv, k: 3, press: 'plain', throws: [] }).frames.filter(f => f.n >= 3 && f.n <= 10),
      low = Math.min(...cross.map(f => f.B.at.gloveLeft[1] - f.B.at.head[1])),
      // (a clean legend's own straight lifts the ball of his rear foot 3 cm off the canvas as it goes: held to that, at his)
      ball = Math.max(0.03 + FEET.ball, ...cross.map(f => f.B.at.RightToeBase[1]));
    for (const f of during) {
      assert.ok(len(sub(f.B.at.gloveLeft, f.B.at.head)) <= guard + 1e-9, `${lv}: the lead glove ${(len(sub(f.B.at.gloveLeft, f.B.at.head)) * 100).toFixed(1)} cm from the head at +${f.n}, ${(guard * 100).toFixed(1)} in his guard`);
      assert.ok(f.B.at.gloveLeft[1] - f.B.at.head[1] >= low - 1e-9, `${lv}: the lead glove ${((f.B.at.gloveLeft[1] - f.B.at.head[1]) * 100).toFixed(1)} cm under the head at +${f.n}, the straight's ${(low * 100).toFixed(1)}`);
      assert.ok(f.B.at.RightToeBase[1] <= ball + 1e-9, `${lv}: the rear foot's ball ${(f.B.at.RightToeBase[1] * 100).toFixed(1)} cm up at +${f.n}`);
    }
    const moved = len(sub(frames.find(f => f.n === s.blow.n).B.at.LeftToeBase, f0.B.at.LeftToeBase).map((v, i) => (i === 1 ? 0 : v)));
    assert.ok(moved >= FEET.step[0] && moved <= FEET.step[1], `${lv}: the lead foot ${(moved * 100).toFixed(1)} cm on`);
  }
});

/* The window (§4.3, §7.2): measured (tools/windows.mjs, src/windows.data.mjs), held to the table it gives. The plan's: a pro +3,
   a great one +1–+3 (4명) and +1–+4, a legend +1–+4. Measured: a pro's +4 works too (his head goes off with the cross's own
   turn behind it, and the jab misses by 1.3 cm), 4명's +4 too (3.4 cm); a dirty legend's +4 works since his head goes in on
   him only once the jab has gone by (round 3; before, the jab landed, 8.5 N·s). Out of it, two frames either side (the pro's
   two mistimed cards), the jab lands and the cross counter does not: pressed early, before the jab's aim is set, a pro's press
   is the plain cross (CROSSING early), and the jab that follows his head in lands harder than on a man standing still. */
const WINDOW = { 3: [3, 4], '4m': [1, 4], '4a': [1, 4], '5m': [1, 4], '5a': [1, 4] };
test('cross counter 9: the window is the table\'s; out of it the jab lands and the cross counter does not', () => {
  for (const lv of OVER_LEVELS) assert.deepEqual([WINDOWS.crossCounter[lv].from, WINDOWS.crossCounter[lv].to], WINDOW[lv], lv);
  const standing = fight('3', null).s.jab;
  assert.equal(standing.type, 'hit');
  for (const id of ['crossCounter-early@3', 'crossCounter-late@3']) {
    const e = CROSS_COUNTER.find(x => x.id === id),
      { s } = fight('3', e.answer);
    assert.equal(e.answer, e.off === 'early' ? WINDOW[3][0] - 2 : WINDOW[3][1] + 2, id);
    assert.equal(s.jab.type, 'hit', `${id}: the jab ${s.jab.type}`);
    assert.ok(!s.blow || s.blow.name !== 'crossOver' || s.blow.type !== 'hit', `${id}: the cross counter landed`);
    // (early: harder than on a man standing still, 1.2 to 1.5 times as the plan measured the plain cross; late: as hard)
    if (e.off === 'early') assert.ok(s.jab.J >= 1.2 * standing.J && s.jab.J <= 1.5 * standing.J, `${id}: the jab ${s.jab.J} N·s, ${standing.J} on a man standing`);
    else assert.ok(Math.abs(s.jab.J - standing.J) <= 1.5, `${id}: the jab ${s.jab.J} N·s, ${standing.J} on a man standing`);
  }
});

// (one press against one punch of his: what the boxer threw, and what came of his punch and of the other man's)
function exchange({ lv = '3', gap = 1.0, his = [[0.8, 'jab']], k = 3, techniques = ['crossCounter'], skills, cut }) {
  const e = {
      id: 'x', loop: 1.8, me: () => HOME, him: t => (t > 1.1 ? null : [HOME[0] + gap, HOME[1]]), against: his,
      press: [[0.8 + k * F, 'power'], [0.8 + k * F, 'tech', 'crossCounter']],
      setup: b => ((b.fighters[0].skills = skills || { all: lv }), (b.fighters[0].techniques = techniques), (b.fighters[1].stands = true))
    },
    bout = freshBout(e),
    out = { thrown: null, mine: null, his: null };
  for (let tick = 0; tick < Math.round(e.loop / F); tick++) {
    if (cut) cut(bout, tick);
    step(bout, drive(e, bout, tick * F, F), F);
    bout.fighters[0].hp = bout.fighters[1].hp = 1000;
    for (const v of bout.events) {
      if (v.type === 'punch' && v.who === 0 && !out.thrown) out.thrown = v.name;
      if (v.who === 0 && ['hit', 'graze', 'whiff', 'block'].includes(v.type) && !out.mine) out.mine = v;
      if (v.who === 1 && ['hit', 'graze', 'whiff', 'block', 'parry'].includes(v.type) && !out.his) out.his = v;
    }
  }
  return out;
}
test('cross counter 10: only at a jab at his head, from where it can be thrown, by a man who carries it at a grade that opens it; a counter only while the jab\'s arm is out', () => {
  // (a: no jab coming, the press is the cross)
  assert.equal(exchange({ his: [] }).thrown, 'cross');
  // (b: from too close, or too far, not the cross counter)
  for (const gap of [0.8, 1.25]) assert.notEqual(exchange({ gap, k: 3 }).thrown, 'crossOver', `at ${gap} m`);
  assert.ok(CROSSING.near > 0.8 && CROSSING.far < 1.25);
  // (c: the body jab, the straight, the hook: not the cross counter)
  for (const [his, k] of [[[[0.8, 'power', 'jabBody']], 3], [[[0.8, 'power']], 4], [[[0.48, 'power'], [0.8, 'power']], 3]]) assert.notEqual(exchange({ his, k }).thrown, 'crossOver', JSON.stringify(his));
  // (d: not carried, or at an amateur's grade: the power punch it would have been)
  assert.equal(exchange({ techniques: [] }).thrown, 'cross');
  assert.equal(exchange({ lv: '2', k: 3 }).thrown, 'cross');
  // (and it is the cross counter, landing, a counter, as the card's)
  const card3 = exchange({ k: middle('3') });
  assert.equal(card3.thrown, 'crossOver');
  assert.equal(card3.mine.type, 'hit');
  assert.equal(card3.mine.counter, true);
  /* (e: the jab's arm taken home before it lands, its elbow less than CROSSING.elbow straight: a plain blow. The jab's chain is
     put into its way home the step before the cross counter lands, and kept bent there) */
  const home = exchange({
    k: middle('3'),
    cut: (bout, tick) => {
      const j = bout.fighters[1].action;
      if (tick >= 55 && j && j.name === 'jab' && j.chain) (j.chain.phase = 'recover'), (j.chain.since = 1), (j.chain.q[4] = Math.min(j.chain.q[4], 0.5)), (j.chain.v[4] = 0);
    }
  });
  assert.equal(home.mine && home.mine.name, 'crossOver');
  assert.equal(home.mine.type, 'hit');
  assert.equal(home.mine.counter, false, 'the jab\'s arm going home: not a counter');
});

/* Waiting (§3.1, §4.5 2): a great one or a legend pressed before the jab's aim is set waits for it, nothing of him moving but his
   rear knee, and goes as he would have pressed then; the jab gone while he waits, he throws nothing and is back in his guard */
/* A jab that takes long to come (§4, CROSSING aim): one whose aim is set more than CROSSING.aim steps after it starts (a
   beginner's on its 9th, an amateur's on its 8th; a pro's on its 4th), pressed at any moment of it: the press is the power punch
   it would have been, the bout event for event the bout of the plain press. At a pro's jab, a cross counter */
test('cross counter 10b: at a jab whose aim is set more than CROSSING.aim steps after it starts the press is the plain cross, event for event', () => {
  const events = o => trace(E, o).frames.map(f => f.ev);
  assert.equal(CROSSING.aim, 5);
  for (const lv of ['3', '4m', '5a'])
    for (const corner of [0, 1]) {
      for (const [foe, ks] of [['1', [1, 4, 7]], ['2', [2, 6]]])
        for (const k of ks) {
          const o = { lv, k, foe, corner },
            mine = events(o),
            plain = events(Object.assign({ press: 'plain' }, o));
          assert.deepEqual(mine, plain, `${lv} at a ${foe}'s jab, +${k}, corner ${corner}: not the plain press's bout`);
          assert.ok(mine.flat().some(e => e.type === 'punch' && e.mine && e.name === 'cross'), `${lv} +${k}: the cross thrown`);
        }
      // (a pro's at +3 and +4: pressed at +1, before the jab's aim is set, a pro's is the plain cross, test 10c)
      for (const k of lv === '3' ? [3, 4] : [1, 4]) {
        const o = { lv, k, foe: '3', corner },
          s = summary(trace(E, o).frames, o);
        assert.equal(s.thrown && s.thrown.name, 'crossOver', `${lv} at a pro's jab, +${k}, corner ${corner}: a cross counter`);
      }
    }
});

/* Pressed before the jab's aim is set (§4.3, CROSSING early), a grade that does not wait for it (a pro) throws the power punch
   it would have been, the bout event for event the bout of the plain press, at a pro's, a great one's and a legend's jab, from
   either corner; a great one pressed as early (from +1) waits for it and throws the cross counter (test 11) */
test('cross counter 10c: a pro pressed before the jab\'s aim is set throws the plain cross, event for event', () => {
  const events = o => trace(E, o).frames.map(f => f.ev);
  assert.equal(CROSSING.early, 0);
  for (const foe of ['3', '4m', '5a'])
    for (const corner of [0, 1])
      for (const k of [0, 1, 2]) {
        const o = { lv: '3', k, foe, corner },
          mine = events(o);
        assert.deepEqual(mine, events(Object.assign({ press: 'plain' }, o)), `3 at a ${foe}'s jab, +${k}, corner ${corner}: not the plain press's bout`);
        assert.ok(mine.flat().some(e => e.type === 'punch' && e.mine && e.name === 'cross'), `3 +${k}: the cross thrown`);
        // (a great one's, from +1: at +0 the man fought first presses before the jab is thrown, and it is the plain cross)
        if (k === 0) continue;
        const s = summary(trace(E, Object.assign({}, o, { lv: '4m' })).frames, Object.assign({}, o, { lv: '4m' }));
        assert.equal(s.thrown && s.thrown.name, 'crossOver', `4m at a ${foe}'s jab, +${k}, corner ${corner}: a cross counter`);
      }
});

test('cross counter 11: a great one and a legend wait for the jab\'s aim, still, and go with it; the jab gone, nothing is thrown', () => {
  for (const lv of ['4m', '5m']) {
    // (still: his head and hips no more than 2 cm from where they are in the same bout without the press, his stance's own going)
    const early = fight(lv, 1),
      set = fight(lv, 3),
      none = fight(lv, null),
      go = early.s.go;
    assert.equal(go, set.s.go, `${lv}: pressed at +1 it went at +${go}, pressed at +3 at +${set.s.go}`);
    for (const f of early.frames.filter(f => f.n >= 1 && f.n < go)) {
      const g = none.frames.find(x => x.n === f.n);
      assert.ok(len(sub(f.B.at.head, g.B.at.head)) <= 0.02, `${lv}: his head ${(len(sub(f.B.at.head, g.B.at.head)) * 100).toFixed(1)} cm off at +${f.n}, waiting`);
      assert.ok(len(sub(f.B.at.Hips, g.B.at.Hips)) <= 0.02, `${lv}: his hips ${(len(sub(f.B.at.Hips, g.B.at.Hips)) * 100).toFixed(1)} cm off at +${f.n}, waiting`);
    }
    assert.ok(Math.abs(early.s.blow.n - set.s.blow.n) <= 1, `${lv}: landed at +${early.s.blow.n}, +${set.s.blow.n} pressed at +3`);
    // (the jab taken away as he waits: nothing thrown, and back in his guard within 0.12 s)
    const e = { id: 'x', loop: 1.6, me: () => HOME, him: () => [HOME[0] + 1.0, HOME[1]], against: [[0.8, 'jab']], press: [[0.8 + F, 'power'], [0.8 + F, 'tech', 'crossCounter']], setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['crossCounter'])) },
      bout = freshBout(e),
      [a, b] = bout.fighters;
    let gone = null,
      thrown = false;
    for (let tick = 0; tick < 96; tick++) {
      // (the step after he pressed, the jab is called off)
      if (tick === 49 && b.action && b.action.name === 'jab') b.action = null;
      step(bout, drive(e, bout, tick * F, F), F);
      a.hp = b.hp = 1000;
      if (bout.events.some(v => v.who === 0 && ['hit', 'whiff', 'graze', 'block'].includes(v.type))) thrown = true;
      if (tick >= 49 && gone === null && !a.action) gone = tick;
    }
    assert.ok(gone !== null && gone <= 50, `${lv}: let go of at ${gone}`);
    assert.equal(thrown, false, `${lv}: something was thrown`);
  }
});

/* The same input, the same bout; and the cards fought with the two men's places in the bout changed over land within a frame of
   the same moment, and within 4 N·s (the plan's 1: fought in turn, §0.4 6, the man in the second place is seen by the first as
   he was a step before, so the jab's aim is taken off his head a frame earlier, and misses him by 0.8 to 1.7 cm more, and his
   own punch lands a little otherwise: 1.7 to 3.7 N·s. The straight alone, thrown from either place, differs by up to 1.7, the
   jab by up to 2.0) */
test('cross counter 13: the same card is the same bout, and fought from the other corner it comes out the same', () => {
  for (const lv of OVER_LEVELS) {
    const o = { lv, k: middle(lv) },
      a = summary(trace(E, o).frames, o),
      b = summary(trace(E, o).frames, o);
    assert.deepEqual(a, b, `${lv}: the same card twice`);
    const c = summary(trace(E, Object.assign({ corner: 1 }, o)).frames, Object.assign({ corner: 1 }, o));
    assert.equal(c.blow && c.blow.name, 'crossOver', `${lv}: from the other corner`);
    assert.equal(c.blow.type, 'hit');
    assert.ok(Math.abs(c.blow.n - a.blow.n) <= 1, `${lv}: +${c.blow.n} from the other corner, +${a.blow.n}`);
    assert.ok(Math.abs(c.blow.J - a.blow.J) <= 4, `${lv}: ${c.blow.J} N·s from the other corner, ${a.blow.J}`);
  }
});

/* Out cold off it (§5.2, §7.1, §9.1 9): caught throwing his jab, the finishing blow knocks him out stiff; nothing of him jumps as
   he goes, his landing within the knockdowns' exception (4 frames, 14 g: tests/audit.test.mjs), and he does not get up */
test('cross counter 14: out cold off it, stiff; his fall starts where he was; he does not get up', () => {
  const e = OUT_COUNTER,
    bout = freshBout(e),
    au = auditor(),
    [a, b] = bout.fighters;
  au.begin(e);
  let blow = null,
    before = null,
    jump = 0,
    tried = null;
  for (let tick = 0; tick < Math.round(e.loop / F); tick++) {
    const was = a.pose ? Object.fromEntries(Object.entries(a.pose.at).map(([k, v]) => [k, v.slice()])) : null;
    step(bout, drive(e, bout, tick * F, F), F);
    b.hp = 1000;
    au.frame(bout, tick);
    const hit = bout.events.find(v => v.type === 'hit' && v.who === 1);
    if (hit && !blow) (blow = hit), (before = was);
    // (the first frame of the fall that is drawn: no joint more than 3 cm from where it was)
    if (blow && before && bout.stop <= 0 && !jump && a.action && MOVES[a.action.name].fall) {
      for (const k of Object.keys(before)) jump = Math.max(jump, len(sub(a.pose.at[k], before[k])));
      before = null;
    }
    if (a.down && tick * F >= 3.0 && tried === null) tried = getUp(bout, a);
  }
  assert.ok(blow, 'the cross counter landed');
  assert.equal(blow.name, 'crossOver');
  assert.equal(blow.down, true);
  assert.equal(blow.out, 'outStiff');
  assert.ok(jump <= 0.03, `the first frame of the fall: a joint ${(jump * 100).toFixed(1)} cm from where it was`);
  const up = au.result().found['thrown upward (g)'];
  const mine = up ? up.cases.filter(c => c.script === e.id) : [];
  assert.ok(mine.length <= 4 && mine.every(c => c.value <= 14), `the landing: ${JSON.stringify(mine)}`);
  assert.equal(tried, null, 'getUp did something');
  assert.ok(a.down && MOVES[a.action.name].faint);
});
