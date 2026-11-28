/* The held checks of the physics audit (src/audit.mjs) in what the catalogue's scripts do not do but a fight does, and the
   cross-arm guard's parry: each from a card of the open-questions catalogue's first group, fixed in the round of 2026-11-28
   (docs/audit-2026-11-25.md; the seeded repros are docs/audit-2026-11-25/4-1.mjs, 4-4.mjs, 1-4.mjs).
     a-cover-punch  a beginner parries, his whole arm gone after the punch and his elbows up in his guard, and throws his cross
                    straight out of it: the upper arm held to what the shoulder lets it be (rig/solve.mjs: a straight punch's
                    elbow is kept so, as a hook's always was; anim/animator.mjs: the knocked glove of the hand he throws with
                    comes back no slower than the textbook's)
     a-reel-g       a reeling man does not come down faster than he can fall (anim/animator.mjs: the hips carrying what he
                    cannot do as asked, his hands' last wrists with them, tried again until it is so)
     a-dark-line    the cross-arm guard put up fresh turns aside a little: a punch met on its rear glove, in the freshest half
                    of his grade's window (game/bout.mjs: guardOf, rear; CROSS_PARRY)
     a-topple       a legend going somewhere at speed does not stand on one foot with his weight outside it, and (a-single-frames)
                    a 5암 walking in or out as he throws keeps his rear thigh within the hip: the foot he stands on is dragged
                    after him once his hip has gone out of its leg's reach, and the one stepping comes down within it
                    (anim/animator.mjs: outOfReach; seeded repros docs/audit-2026-11-25/4-3.mjs, 4-5.mjs); and the foot he
                    stands on so at every grade (the second fix round of 2026-11-28)
     a-single-frames (the two men inside each other) a straight punch thrown from right up close keeps its elbow out of the
                    other man's trunk, shoulders and elbows, as far round as the shoulder lets it go (rig/solve.mjs: HIM) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditor } from '../src/audit.mjs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW } from '../src/defense.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { PLANS } from '../src/game/brain.mjs';

const DT = 1 / 60,
  AT = 0.8;

/* A man of `lv` with his guard put up on the frame his parry card puts it up (the middle of his window: src/windows.data.mjs),
   the other man's `punch` coming in, and, `after` seconds after he has parried it, his own cross thrown (the guard let go). */
function parryThenCross(lv, punch, after) {
  const k = WINDOWS.parry[lv].at,
    e = { id: `${punch}@${lv} +${after}`, loop: AT + 1.2, me: () => HOME, him: () => [HOME[0] + RANGE[punch], HOME[1]], against: THROW[punch].map(([dt, b]) => [AT + dt, b]), cover: t => t >= AT + k * DT - 1e-9 && t < AT + 0.4, press: [], setup: b => (b.fighters[0].skills = { all: lv }) },
    bout = freshBout(e),
    a = auditor();
  a.begin(e);
  let parried = null,
    threw = null;
  for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
    const ctl = drive(e, bout, tick * DT, DT);
    if (parried !== null && threw === null && tick * DT >= parried + after - 1e-9) (ctl[0].power = true), (threw = tick * DT);
    if (threw !== null) ctl[0].cover = false;
    step(bout, ctl, DT);
    bout.fighters[0].hp = bout.fighters[1].hp = 1000;
    if (parried === null && bout.events.some(x => x.type === 'parry' && x.who === 0)) parried = tick * DT;
    a.frame(bout, tick);
  }
  return { parried, threw, found: a.result().found };
}

test('a-cover-punch: a beginner\'s cross thrown straight out of the parry keeps his upper arm where the shoulder lets it be', () => {
  // (before the fix: 6 to 16 frames past the turn the upper arm can make, 16 to 52 degrees, in every one of these)
  for (const punch of ['jab', 'cross'])
    for (const after of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
      const { parried, threw, found } = parryThenCross('1', punch, after);
      assert.ok(parried !== null && threw !== null, `${punch} +${after}: parried ${parried}, threw ${threw}`);
      for (const check of ['upper arm turned past its range (degrees past)', 'upper arm in a place the shoulder cannot put it (degrees past)', 'his own glove in his other arm']) {
        const c = found[check];
        assert.equal(c ? c.bad : 0, 0, `${punch} +${after}: ${check}: ${c && c.worst ? JSON.stringify(c.worst) : ''}`);
      }
    }
});

test('a-reel-g: a reeling man in a match comes down no faster than he can fall', () => {
  // (the seeded matches of docs/audit-2026-11-25/4-4.mjs: before the fix, reeling frames at 1.6, 2.6 and 1.97 g)
  const a = auditor();
  for (const [seed, until] of [[2, 54.1], [23, 11.5]]) {
    const match = createMatch({ seed, skills: [{ all: '3' }, { all: '1' }], plans: [PLANS.pressure, PLANS.breathe], rounds: 1, roundTime: 60 });
    a.begin({ id: 'seed ' + seed });
    for (let tick = 0; tick < until * 60; tick++) {
      stepMatch(match, DT);
      if (match.phase !== 'fight' && match.phase !== 'count') break;
      a.frame(match.bout, tick);
    }
  }
  const c = a.result().found['falling faster than gravity (g)'],
    reel = c ? c.cases.filter(k => k.doing === 'reel') : [];
  assert.deepEqual(reel, []);
});

/* What became of the other man's punch, the guard put up on frame k after it was pressed: 'H' a hammer, 'P' turned aside
   otherwise, 'b' blocked, 'x' anything else (src/defense.mjs's way of throwing it: the punch's own range, a jab from 1 m). */
function outcome(lv, tech, punch, k) {
  const e = { id: 'x', loop: AT + 0.8, me: () => HOME, him: () => [HOME[0] + (punch === 'jab' ? 1.0 : RANGE[punch]), HOME[1]], against: THROW[punch].map(([dt, b]) => [AT + dt, b]), press: [], cover: t => t >= AT + k * DT - 1e-9 && t < AT + 0.4, setup: b => ((b.fighters[0].skills = { all: lv }), tech && (b.fighters[0].techniques = tech)) },
    bout = freshBout(e);
  let out = 'x',
    seen = false;
  for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    bout.fighters[0].hp = bout.fighters[1].hp = 1000;
    for (const x of bout.events)
      if (!seen && (x.on === 1 || x.who === 1) && ['parry', 'block', 'hit'].includes(x.type)) (seen = true), (out = x.type === 'parry' ? (x.hammer ? 'H' : 'P') : x.type === 'block' ? 'b' : 'x');
  }
  return out;
}
const row = (lv, tech, punch) => Array.from({ length: 17 }, (_, i) => outcome(lv, tech, punch, i - 8)).join('');

test('a-dark-line: the cross-arm guard put up fresh turns aside a little, on its rear glove', () => {
  // (the dirty great one: his hammer as it was, and, put up too late for the hammer to come down, his rear glove turns it
  // aside; before, it blocked: xxxxxxxxHHHbbxxxx)
  for (const punch of ['jab', 'cross']) {
    const r = row('4a', null, punch);
    assert.ok(r.includes('H') && r.includes('P'), `4암 ${punch}: ${r}`);
    assert.ok(r.lastIndexOf('H') < r.indexOf('P'), `4암 ${punch}: the rear glove only where the hammer is too late: ${r}`);
  }
  // (a pro carrying it: some of the frames a 4명's high guard turns a jab aside on, not all of them; before, none)
  const pro = row('3', ['crossArm'], 'jab'),
    clean = row('4m', null, 'jab'),
    n = s => s.split('P').length - 1;
  assert.ok(n(pro) > 0 && n(pro) < n(clean), `3 with the cross-arm guard ${pro}, 4명 ${clean}`);
});

/* A man of `lv` with the other man 1.25 m ahead (src/footwork.mjs: AWAY), sent at full stick where `me` says, the loop fought
   three times over, covering up when `cover` says and throwing what `press` says: the held checks broken, by name. */
function going(lv, { me, press = [], cover = null, loop }) {
  const e = { id: `${lv} going`, loop, me, cover, press, setup: b => (b.fighters[0].skills = { all: lv }) },
    bout = freshBout(e),
    a = auditor();
  a.begin(e);
  for (let tick = 0; tick < Math.round(e.loop / DT) * 3; tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    bout.fighters[0].hp = bout.fighters[1].hp = 1000;
    a.frame(bout, tick);
  }
  const out = {};
  for (const [check, c] of Object.entries(a.result().found)) if (c.bad) out[check] = `${c.bad} frames, worst ${c.worst.value.toFixed(1)} at ${c.worst.t} s (${c.worst.doing})`;
  return out;
}
const TOPPLE = 'standing where he would topple (cm outside his feet, held over 0.3 s)',
  THIGH = 'thigh behind the pelvis';

test('a-topple: a legend going round a man at full speed stands nowhere he would topple', () => {
  /* (from his guard, covered up, out round him to `to` as he lets the cover go, covered up again and back. Before the fix,
     the 5명: 11, 18, 6, 10 and 9 frames past the 0.3 s, 23 to 32 cm outside the foot he stood on, out to either side, off at
     either angle and back at one; the 5암's rear thigh 38 degrees out behind him off at one angle, 35 being the most) */
  for (const lv of ['5m', '5a'])
    for (const to of [[0, 1.2], [0, -1.2], [-1.2, 0], [-0.8, 0.9], [-0.8, -0.9], [-1, 0.6]]) {
      const broken = going(lv, { me: t => (t < 0.5 || t >= 1.4 ? HOME : to), loop: 2.4, cover: t => t < 0.5 || (t >= 1.2 && t < 1.4) });
      assert.deepEqual([broken[TOPPLE], broken[THIGH]], [undefined, undefined], `${lv} to ${to}: ${JSON.stringify(broken)}`);
    }
});

test('a-single-frames: a 5암 walking in or out as he throws keeps his rear thigh within the hip', () => {
  /* (walking in from 1.25 m off to all but on top of him, or out from there, a cross, a one-two or a cross and a cross. Before
     the fix: walking in, 14 and 27 frames past the 35 degrees the hip lets the thigh go out behind, 43 at the most; walking
     out, 1, 3 and 1, 39 at the most) */
  for (const [from, to] of [[[-1.2, 0], [0.1, 0]], [[0.1, 0], [-1.0, 0]]])
    for (const press of [[[0.5, 'power'], [1.2, 'power']], [[0.4, 'jab'], [0.6, 'power'], [1.1, 'jab'], [1.3, 'power']], [[0.5, 'power'], [1.0, 'power']]]) {
      const broken = going('5a', { me: t => (t < 0.2 ? from : to), press, loop: 2.0 });
      assert.equal(broken[THIGH], undefined, `from ${from} to ${to}, ${JSON.stringify(press)}: ${broken[THIGH]}`);
    }
});

test('a-topple: a man of any grade going round a man at full speed is not left on a foot his leg no longer reaches', () => {
  /* (the legend's case above, at the grades below a legend: from his guard, or covered up, out round him and back. Before the
     foot he stands on was dragged after him at every grade: a 3 off at one angle, 2 frames past the 0.3 s, 6.9 cm outside
     the foot he stood on, covered up or not; a 4명 the same way, 1 frame, 7.3 cm. A beginner going straight back out from
     him at full speed is not held here: his slow beginner's beat and long stride still leave him 5 frames 40 cm outside the
     foot he stands on, his leg reaching it all the while, which is another thing than this, and still open) */
  for (const lv of ['2', '3', '4m', '4a'])
    for (const to of [[0, 1.2], [0, -1.2], [-1.2, 0], [-0.8, 0.9], [-0.8, -0.9], [-1, 0.6]])
      for (const covered of [true, false]) {
        const broken = going(lv, { me: t => (t < 0.5 || t >= 1.4 ? HOME : to), loop: 2.4, cover: covered ? t => t < 0.5 || (t >= 1.2 && t < 1.4) : null });
        assert.equal(broken[TOPPLE], undefined, `${lv} to ${to}${covered ? ', covered' : ''}: ${broken[TOPPLE]}`);
      }
});

test('a-single-frames: a straight punch thrown from right up close as the other man throws keeps its elbow out of him', () => {
  /* (a 2 or a 3 0.62 m from him, jabbing or throwing his cross as the other man's hook, cross or uppercut comes, a little
     before or after; the elbow, the shoulder and the trunk of either man in the other's, as the audit holds them, 5 cm.
     Before the elbow was kept out: a 2's jab, its elbow 5.4 cm into the other man's shoulder as his hook came, 2 frames) */
  for (const lv of ['2', '3'])
    for (const mine of ['jab', 'power'])
      for (const his of ['hook', 'cross', 'upper'])
        for (const dt of [0, 0.1]) {
          const e = { id: `${lv} ${mine} ${his} ${dt}`, loop: 1.2, me: () => HOME, him: () => [HOME[0] + 0.62, HOME[1]], press: [[0.5, mine]], against: THROW[his].map(([t, b]) => [0.8 + dt + t, b]), setup: b => (b.fighters[0].skills = { all: lv }) },
            bout = freshBout(e),
            a = auditor();
          a.begin(e);
          for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
            step(bout, drive(e, bout, tick * DT, DT), DT);
            bout.fighters[0].hp = bout.fighters[1].hp = 1000;
            a.frame(bout, tick);
          }
          const c = a.result().found['the two men inside each other'],
            arms = c ? c.cases.filter(k => /Arm/.test(k.who)) : [];
          assert.deepEqual(arms, [], e.id);
        }
});
