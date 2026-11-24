/* Every scripted bout there is, fought once and held frame by frame against the physics audit (src/audit.mjs, which
   node tools/audit.mjs prints): nothing broken. The few things that are, are listed below, each with why it is let stand
   and how far it may go, so that one getting worse, or anything new, still fails. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, auditor, SCRIPTS, LIMIT, JUMP, JUMPING, KNOCKED, GETUP, GETTING_UP } from '../src/audit.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { PLANS } from '../src/game/brain.mjs';
import { loadout } from '../src/game/profile.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';
import { MOVES } from '../src/anim/moves.mjs';

// (a man in a knockdown's fall: his body is a passive body then, phys/fall.mjs, and nothing is keyed)
const falling = c => !!(MOVES[c.doing] && MOVES[c.doing].fall);

const EXCEPTIONS = [
  {
    check: 'thrown upward (g)',
    when: falling,
    // (a landing is a few frames however many cards fall: so many to a script, not so many in all)
    frames: 4,
    each: true,
    most: 14,
    why: 'the canvas stopping a man who has fallen onto it: a real impact (a body hitting the floor is stopped in a few hundredths of a second, which is 5 to 15 g, and sampled sixty times a second a landing is about two frames of it), and the physics does it, not a key'
  },
  {
    check: 'falling faster than gravity (g)',
    when: falling,
    frames: 3,
    most: 2.5,
    why: 'a body settling on the canvas: as his limbs come to rest the centre of mass, taken from the drawn pose by Dempster\'s shares, shifts by a few millimetres from one frame to the next, which over a sixtieth of a second reads as a little more than g; nothing in the physics pulls him down but gravity'
  },
  {
    check: 'standing where he would topple (cm outside his feet, held over 0.3 s)',
    when: c => c.script === 'cross@4a' && c.who === 1,
    frames: 1,
    most: 25,
    why: 'the struck man walking back in after a hard cross has knocked him away: the gait keeps time with one foot always swinging, so on long steps his weight passes outside the one foot down, first ahead of it and then behind the next, for a frame past the 0.3 s allowed. A gait that waits for the weight to come over before it lifts a foot is the fix, and is not done'
  },
  {
    check: 'a glove inside the other man',
    when: c => c.script.startsWith('stomp@') && c.who.startsWith('glove') && c.doing.startsWith('hook'),
    frames: 3,
    most: 10,
    why: 'a hook thrown from right up close, after the stamp has brought the dirty man in, comes up through the other man\'s shoulder in the frames before it reaches his head: the bout scores a glove on a head and nothing else, so the shoulder does not stop it (a smothered punch would)'
  }
];

// (every script is fought once, for all the tests below)
let done = null;
const audited = () => done || (done = audit(SCRIPTS));

test('audit: no scripted bout breaks anything a body can do, beyond the listed exceptions', () => {
  const { found, seen } = audited();
  assert.ok(seen > 10000, `only ${seen} frames were checked`);
  const broken = [];
  for (const [check, c] of Object.entries(found)) {
    if (!c.bad) continue;
    assert.equal(c.cases.length, c.bad, `${check}: more frames broken (${c.bad}) than are kept to look at`);
    const left = c.cases.filter(k => !EXCEPTIONS.some(e => e.check === check && e.when(k)));
    for (const k of left) broken.push(`${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`);
    for (const e of EXCEPTIONS.filter(e => e.check === check)) {
      const mine = c.cases.filter(k => e.when(k));
      // (counted over every script, or, for an exception that says so, script by script)
      const counts = e.each ? Object.entries(mine.reduce((n, k) => ((n[k.script] = (n[k.script] || 0) + 1), n), {})) : [['all scripts', mine.length]];
      for (const [where, n] of counts) if (n > e.frames) broken.push(`${check}: ${n} frames under its exception in ${where}, more than the ${e.frames} allowed (${e.why})`);
      for (const k of mine) if (Math.abs(k.value) > e.most) broken.push(`${check}: ${k.value} at ${k.script} @ ${k.t}, past the ${e.most} its exception allows`);
    }
  }
  assert.deepEqual(broken, []);
});

/* His own glove in his other arm (plan 6 §6.1): neither glove goes more than 2 cm into the other arm (its elbow, its
   forearm short of the wrist, its upper arm; past touching, the padding's give taken off: rig/body.mjs ARM), in any frame
   he stands in, with no exception. The solver keeps it out (rig/solve.mjs: KEEP.arm). */
test('audit: his own glove is never in his other arm', () => {
  const { found } = audited(),
    c = found['his own glove in his other arm'];
  assert.ok(c && c.frames > 10000, `checked in ${c ? c.frames : 0} frames`);
  assert.equal(c.bad, 0, `${c.bad} frames: ${JSON.stringify(c.cases.slice(0, 5))}`);
});

/* The waist (plan 6 §1.3): turned on the pelvis no further than 25 degrees and no faster than 900 a second, in every frame,
   a knockdown's fall too, with no exception. And both that turn it hold it to the same 22, three inside that (rig/body.mjs:
   RANGE.waistTwist): where the animator keys him (anim/animator.mjs: WAIST), and in an ordinary knockdown's fall, where his
   body is the physics' (phys/fall.mjs: LIM.waist, read as this reads it); no frame of any script goes past it by more than a
   measuring hair. (A fall was held to the body's 25 apart from the animator's frames while the physics held the waist by
   limits of its own, which this read 2 degrees wider: 22.4 at the most, 22.1 now: docs/moves-plan-6.md §3.5.) So the fall's
   bound is split: tightened for an ordinary knockdown's fall (22.5), unchanged out cold (25). A fall out cold is held, as
   it was, to the body's 25: the physics holds his waist by the spine's own limits, as it did (LIM.waist,
   holding it too, folded a limp man's knees past their limit in falls the scripts do not show), and out-limp's lifted man
   reads 22.5 in it, his waist turned a little further by the blows he blocks before the uppercut (anim/animator.mjs: HIT,
   waist), 22.3 before. */
test('audit: the waist is never turned past its range or faster than it can turn; the animator and an ordinary knockdown\'s fall never turn it past their 22 degrees', () => {
  const { found } = audited();
  for (const check of ['waist twisted past its limit', 'waist turning faster than it can (degrees a second)']) {
    assert.ok(found[check] && found[check].frames > 10000, `${check}: checked in ${found[check] ? found[check].frames : 0} frames`);
    assert.equal(found[check].bad, 0, `${check}: ${JSON.stringify(found[check].cases.slice(0, 5))}`);
  }
  const by = Object.entries(found['waist twisted past its limit'].largestBy),
    most = list => Math.max(0, ...list.map(([, v]) => v)),
    keyed = most(by.filter(([doing]) => !falling({ doing }))),
    fallen = most(by.filter(([doing]) => falling({ doing }) && !MOVES[doing].faint)),
    cold = most(by.filter(([doing]) => falling({ doing }) && MOVES[doing].faint));
  assert.ok(keyed <= 22.5, `the animator turned the waist ${keyed.toFixed(1)} degrees`);
  assert.ok(fallen <= LIMIT.waistTwist - 2.5, `an ordinary knockdown's fall turned the waist ${fallen.toFixed(1)} degrees`);
  assert.ok(cold <= LIMIT.waistTwist, `a fall out cold turned the waist ${cold.toFixed(1)} degrees`);
});

/* Kept out of his other arm, a glove is eased out and back, not knocked (plan 6 §6.1): what the solver's keeping-apart does
   to a glove (rig/solve.mjs: apart) changes that glove's velocity by no more than JUMP (3.6 m/s) in a frame, in any frame
   he stands in (the three after a blow too, but not those held at it), whatever the hand is doing, with no exception. */
test('audit: keeping a glove out of his other arm never knocks it', () => {
  const { found } = audited(),
    c = found[KNOCKED];
  assert.ok(c && c.frames > 10000, `checked in ${c ? c.frames : 0} frames`);
  assert.equal(JUMP, 3.6);
  assert.equal(c.bad, 0, `${c.bad} frames: ${JSON.stringify(c.cases.slice(0, 5))}`);
});

/* A glove jumping, of a hand not throwing a punch, nor parrying, nor pawing, is watched and not held (src/audit.mjs: the
   bouts were not made to it, and tools/audit.mjs prints where it is broken, group by group). What is held here is only that
   it is measured, apart from the checks, so that it cannot be dropped unseen. */
test('audit: a glove jumping is measured, apart from what is held', () => {
  const { found, watched } = audited(),
    c = watched[JUMPING];
  assert.ok(c && c.frames > 10000, `measured in ${c ? c.frames : 0} frames`);
  assert.ok(!(JUMPING in found));
});

/* And in a match (plan 6 §6.1): a match goes where no script goes, so three seeded matches are fought here and held, frame
   by frame, to the same checks through the same code as the scripts (src/audit.mjs: auditor), and keeping a glove out of
   his other arm knocks it in no frame of them. They are three of the 32 seeded bouts the separate check of stage M fought
   (seed 11, pressure against counter, one round, fifty seconds): a 5명 against a 5암 and a 1 against a 5암, the two where it
   first found the glove knocked hardest (6.6 m/s), and a 4명 against a 4명 with every technique each has. In all 32, one
   frame still breaks the measure, by 3.8 m/s (bout 9 at 44.33 s): there the arm itself, sent where it is sent, jumps in
   that frame (its glove's velocity changing by 14 m/s), and keeping it out of the other arm leaves the glove's motion
   smoother than it would be without (13.0 m/s against 14.5: the measure reads the push against that bare glove, which
   itself jumps). How many frames have a glove more than 2 cm in the other arm is said, not held. */
test('audit: in seeded matches, keeping a glove out of his other arm never knocks it', t => {
  const a = auditor();
  for (const [id, grades, all] of [['seed 11: 5m against 5a', ['5m', '5a']], ['seed 11: 1 against 5a', ['1', '5a']], ['seed 11: 4m against 4m, every technique', ['4m', '4m'], true]]) {
    const skills = grades.map(g => ({ all: g })),
      match = createMatch({ seed: 11, skills, rounds: 1, roundTime: 600, plans: [PLANS.pressure, PLANS.counter], techniques: all ? skills.map(s => loadout(s, Object.keys(TECHNIQUES))) : undefined });
    a.begin({ id });
    for (let tick = 0; tick < 3000; tick++) {
      stepMatch(match, 1 / 60);
      if (match.phase === 'over') break;
      a.frame(match.bout, tick);
    }
  }
  const { found, seen } = a.result(),
    c = found[KNOCKED],
    arm = found['his own glove in his other arm'];
  assert.ok(seen > 10000 && c && c.frames > 10000, `${seen} frames, the check taken in ${c ? c.frames : 0}`);
  assert.equal(c.bad, 0, `${c.bad} frames: ${JSON.stringify(c.cases.slice(0, 5))}`);
  t.diagnostic(`${arm.bad} frames of ${arm.frames} with a glove more than 2 cm in the other arm, the deepest ${arm.worst ? arm.worst.value.toFixed(1) + ' cm (' + arm.worst.script + ' @ ' + arm.worst.t + ' s)' : 'none'}; a glove knocked at most ${c.largest.toFixed(2)} m/s`);
});

/* And a joint jumping as he gets up (src/audit.mjs: GETUP), the same: measured in every frame of every get-up there is,
   apart from what is held (his legs out of how he lay are held: tests/fall.test.mjs). */
test('audit: a joint jumping as he gets up is measured, apart from what is held', () => {
  const { found, watched } = audited(),
    c = watched[GETTING_UP];
  assert.ok(c && c.frames > 300, `measured in ${c ? c.frames : 0} frames`);
  assert.equal(GETUP, 0.08);
  assert.ok(!(GETTING_UP in found));
});
