// A legend's movement (docs/moves-plan-4.md §12, anim/legend.mjs): at 5명 and 5암 the head and the knees are the shape of
// going anywhere; below that, nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, steps, guardOf, landings } from '../src/measure.mjs';
import { FOOTWORK } from '../src/ladder.mjs';
import { createAnimator } from '../src/anim/animator.mjs';
import { LEVEL } from '../src/anim/skill.mjs';
import { createBout, step, settle } from '../src/game/bout.mjs';

const DT = 1 / 60;
const card = id => FOOTWORK.find(e => e.id === id);
const circling = lv => steps(run(card(`circle@${lv}`), card(`circle@${lv}`).loop * 2).frames, 0.6);

test('legend: a clean legend circling weaves every step, the head 8 cm across his hips and 6 cm down, lowest as the foot lands', () => {
  const s = circling('5m');
  assert.ok(s.length >= 12, `${s.length} steps going round`);
  for (const x of s) {
    assert.ok(x.side >= 8, `step at ${x.tick}: ${x.side} cm across`);
    assert.ok(x.up >= 6, `step at ${x.tick}: ${x.up} cm up and down`);
    assert.ok(Math.abs(x.low) <= 2, `step at ${x.tick}: lowest ${x.low} frames from the landing`);
  }
});

/* The same measurement, for a pro and a clean great one, is what it was before a legend's movement was put in (the steps
   going round faster than 0.3 m/s in two loops of the card: tick of the landing, cm across, cm up and down, frames from the
   landing to the lowest point). */
const BEFORE = {
  3: [[28, 0.4, 2.3, 1], [39, 1.3, 2.6, 2], [51, 0.2, 2.6, 2], [100, 1.9, 5.7, 3], [116, 0.6, 3.6, 2], [129, 0.6, 3, 2], [141, 0.8, 2.2, 2], [152, 0.5, 1.9, 1], [162, 0.7, 1.7, 1], [172, 0.3, 1.9, 2], [183, 0.3, 2.1, 2], [194, 1.5, 2.7, 2], [207, 0.4, 3.1, 2], [258, 1.9, 5.3, 2], [272, 0.5, 3, 2], [285, 0.5, 2.6, 1], [296, 0.8, 2.2, 1], [307, 0.5, 2, 1], [317, 0.7, 1.8, 1], [327, 0.4, 2.1, 2], [338, 0.4, 2.4, 2], [351, 1.6, 3.1, 2], [399, 1.4, 4.9, 3], [415, 1.8, 4.3, 2], [429, 0.4, 2.6, 1], [440, 0.3, 2.4, 2], [451, 0.7, 1.8, 2], [461, 0.6, 2, 2], [472, 0.6, 1.9, 1], [482, 0.5, 2.2, 2], [494, 0.4, 2.3, 2], [506, 1.8, 3.5, 3], [557, 0.9, 4.3, 2], [571, 1.6, 3.9, 2], [584, 0.3, 2.4, 2]],
  '4m': [[28, 3.4, 3.5, 1], [39, 1.1, 2.8, 2], [51, 3.6, 4.2, 3], [100, 2.1, 6.6, 3], [116, 2.7, 4.5, 2], [129, 0.7, 3.4, 2], [141, 3.2, 3.3, 1], [152, 0.9, 2.1, 1], [162, 3, 2.6, 2], [172, 1.3, 4.3, 2], [183, 3.7, 3.3, 1], [194, 1.3, 2.9, 2], [207, 2.8, 4.4, 2], [258, 1.9, 5.8, 2], [272, 3.5, 4.1, 2], [285, 1.5, 5.5, 1], [296, 3.4, 3.3, 1], [307, 0.9, 2.1, 1], [317, 2.3, 2.6, 1], [327, 0.8, 2.4, 2], [338, 3.6, 3.7, 2], [351, 1.5, 3.5, 2], [399, 6.4, 5.2, 3], [415, 1.7, 4.8, 3], [429, 2.6, 3.6, 1], [440, 0.6, 2.6, 2], [451, 2.8, 2.6, 1], [461, 0.9, 2.1, 2], [472, 3.1, 2.6, 2], [482, 1.3, 4.4, 2], [494, 4.3, 3.6, 1], [506, 1.6, 4, 3], [557, 4.7, 5, 2], [571, 1.5, 4.1, 2], [584, 3.2, 3.2, 2]]
};
test('legend: a pro and a clean great one go round exactly as they did (the legend\'s movement is not theirs)', () => {
  for (const lv of ['3', '4m']) {
    const now = steps(run(card(`circle@${lv}`), card(`circle@${lv}`).loop * 2).frames, 0.3).map(x => [x.tick, x.side, x.up, x.low]);
    assert.deepEqual(now, BEFORE[lv], lv);
  }
});

test('legend: a clean legend\'s forward dash takes his head 8 cm under his guard and off to his right', () => {
  const { frames } = run(card('dashIn@5m')),
    i = frames.findIndex(f => f.events.some(e => e.type === 'dash' && e.who === 0)),
    guard = guardOf('5m').headY,
    low = Math.min(...frames.slice(i, i + 30).map(f => f.headY));
  assert.ok(i > 0, 'he dashes');
  assert.ok(guard - low >= 0.08, `${((guard - low) * 100).toFixed(1)} cm under his guard`);
  // (off to his right of his hips, as the duck in goes: outside the other man's jab)
  const across = f => {
      const h = f.gloves.head,
        p = f.joints.Hips;
      return (h[0] - p[0]) * Math.cos(f.yaw) - (h[2] - p[2]) * Math.sin(f.yaw);
    },
    off = Math.min(...frames.slice(i, i + 20).map(across)) - across(frames[i - 1]);
  assert.ok(off <= -0.04, `${(off * 100).toFixed(1)} cm across`);
  // (and a pro's does not: the dash itself takes his head down a little)
  const pro = run(card('dashIn@3')).frames,
    j = pro.findIndex(f => f.events.some(e => e.type === 'dash' && e.who === 0));
  assert.ok(guardOf('3').headY - Math.min(...pro.slice(j, j + 30).map(f => f.headY)) < 0.07, 'a pro goes in upright');
});

// a man going sideways at a walk, at a grade, his animator alone: his head over 6 s
function sideways(seed, lv) {
  const a = createAnimator(seed),
    out = [];
  for (let i = 0; i < 360; i++) {
    const pose = a.update({ move: [i < 30 ? i / 30 : 1, 0], turn: 0, action: null, cover: 0, stance: LEVEL[lv], guard: LEVEL[lv] }, DT);
    out.push(pose.head.map(v => +v.toFixed(6)));
  }
  return out;
}
test('legend: a dirty legend\'s movement is his own dice: the same seed goes the same way, another seed another way', () => {
  assert.deepEqual(sideways(3, '5a'), sideways(3, '5a'));
  assert.notDeepEqual(sideways(3, '5a'), sideways(4, '5a'));
  // (and a clean one's is the beat's: the same for any seed, once the beat is going)
  const a = sideways(3, '5m'),
    b = sideways(3, '5m');
  assert.deepEqual(a, b);
  // the catalogue's own card, twice
  const once = () => run(card('circle@5a'), 5).frames.map(f => f.gloves.head.map(v => +v.toFixed(6)));
  assert.deepEqual(once(), once());
});

test('legend: a dirty legend keeps no beat in it: the bottom of his U wanders off the landing, and its size with it', () => {
  const s = circling('5a'),
    off = s.filter(x => Math.abs(x.low) >= 3).length,
    sides = s.map(x => x.side),
    mean = sides.reduce((a, b) => a + b, 0) / sides.length,
    cv = Math.sqrt(sides.reduce((a, b) => a + (b - mean) ** 2, 0) / sides.length) / mean;
  assert.ok(off >= s.length / 2, `${off} of ${s.length} steps lowest 3 frames or more off the landing`);
  assert.ok(cv >= 0.4, `the weave's size from step to step varies: ${cv.toFixed(2)}`);
});

test('legend: stepping in, the head slips outside as the lead foot lands; stepping out, the trunk lies back', () => {
  const e = card('inout@5m'),
    { frames } = run(e, e.loop * 3),
    L = Math.round(e.loop / DT),
    rel = f => {
      const h = f.gloves.head,
        p = f.joints.Hips,
        d = [h[0] - p[0], h[2] - p[2]];
      return [d[0] * Math.cos(f.yaw) - d[1] * Math.sin(f.yaw), d[0] * Math.sin(f.yaw) + d[1] * Math.cos(f.yaw)];
    },
    mean = (fr, k) => fr.reduce((s, f) => s + rel(f)[k], 0) / fr.length;
  // (the second and third loops: in the first, the step in is over before a lead foot comes down)
  for (const k of [1, 2]) {
    const seg = (a, b) => frames.slice(k * L + Math.round(a / DT), k * L + Math.round(b / DT)),
      slip = Math.min(...seg(0.3, 0.95).map(f => rel(f)[0])) - mean(seg(0.05, 0.3), 0),
      lead = landings(seg(0.3, 0.95)).some(l => l.foot === 'L'),
      sway = Math.min(...seg(1.5, 2.2).map(f => rel(f)[1])) - mean(seg(1.25, 1.5), 1);
    assert.ok(lead, `loop ${k + 1}: a lead foot comes down going in`);
    assert.ok(slip <= -0.06, `loop ${k + 1}: the head ${(slip * 100).toFixed(1)} cm across (to his right) going in`);
    assert.ok(sway <= -0.025, `loop ${k + 1}: the head ${(sway * 100).toFixed(1)} cm back coming out`);
  }
});

/* A punch thrown on the move goes out of the bent knees and the lean he is in: its wind-up is already done (game/bout.mjs:
   loadOf); a pro's winds up as it always did. */
test('legend: a punch thrown going round does not wind up again', () => {
  for (const [lv, loaded] of [['5m', true], ['5a', true], ['3', false], ['4m', false]]) {
    const bout = createBout(7),
      [a, b] = bout.fighters;
    a.skills = { all: lv };
    [a.x, a.z] = [0, 0];
    [b.x, b.z] = [1.0, 0];
    settle(bout);
    let action = null;
    for (let i = 0; i < 90 && !action; i++) {
      step(bout, [{ move: [0, 1], jab: i === 60 }, {}], DT);
      if (a.action && a.action.name === 'jab') action = a.action;
    }
    assert.ok(action, `${lv}: he jabs`);
    assert.equal(!!(action.loaded && action.loaded.from === 'legend'), loaded, `${lv}: ${JSON.stringify(action.loaded)}`);
    if (loaded) assert.ok(action.chain.coil.q >= 0.5, `${lv}: wound up already, ${action.chain.coil.q.toFixed(2)}`);
  }
});
