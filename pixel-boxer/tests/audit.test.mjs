/* Every scripted bout there is, fought once and held frame by frame against the physics audit (src/audit.mjs, which
   node tools/audit.mjs prints): nothing broken. The few things that are, are listed below, each with why it is let stand
   and how far it may go, so that one getting worse, or anything new, still fails. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, SCRIPTS } from '../src/audit.mjs';
import { MOVES } from '../src/anim/moves.mjs';

// (a man in a knockdown's fall: his body is a passive body then, phys/fall.mjs, and nothing is keyed)
const falling = c => !!(MOVES[c.doing] && MOVES[c.doing].fall);

const EXCEPTIONS = [
  {
    check: 'thrown upward (g)',
    when: falling,
    frames: 8,
    most: 14,
    why: 'the canvas stopping a man who has fallen onto it: a real impact (a body hitting the floor is stopped in a few hundredths of a second, which is 5 to 15 g), and the physics does it, not a key'
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

test('audit: no scripted bout breaks anything a body can do, beyond the listed exceptions', () => {
  const { found, seen } = audit(SCRIPTS);
  assert.ok(seen > 10000, `only ${seen} frames were checked`);
  const broken = [];
  for (const [check, c] of Object.entries(found)) {
    if (!c.bad) continue;
    assert.equal(c.cases.length, c.bad, `${check}: more frames broken (${c.bad}) than are kept to look at`);
    const left = c.cases.filter(k => !EXCEPTIONS.some(e => e.check === check && e.when(k)));
    for (const k of left) broken.push(`${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`);
    for (const e of EXCEPTIONS.filter(e => e.check === check)) {
      const mine = c.cases.filter(k => e.when(k));
      if (mine.length > e.frames) broken.push(`${check}: ${mine.length} frames under its exception, more than the ${e.frames} allowed (${e.why})`);
      for (const k of mine) if (Math.abs(k.value) > e.most) broken.push(`${check}: ${k.value} at ${k.script} @ ${k.t}, past the ${e.most} its exception allows`);
    }
  }
  assert.deepEqual(broken, []);
});
