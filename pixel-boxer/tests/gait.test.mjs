import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimator } from '../src/anim/animator.mjs';
import { GUARD } from '../src/anim/moves.mjs';
import { ENTRIES, HOME, AWAY, drive } from '../src/footwork.mjs';
import { createBout, step, settle } from '../src/game/bout.mjs';

const DT = 1 / 60;
const JOINT = { L: 'LeftFoot', R: 'RightFoot' };

/* From standing, start travelling one way at walking pace; -> which foot is the first to be put down well over on the
   side he is going (more than 6 cm from its place in the guard, that way). */
function firstFoot(move, settleFor) {
  const a = createAnimator(0);
  for (let i = 0; i < settleFor; i++) a.update({ move: [0, 0] }, DT);
  const l = Math.hypot(move[0], move[1]),
    dir = [move[0] / l, move[1] / l];
  let was = a.rhythm.stepping;
  for (let i = 0; i < 90; i++) {
    const pose = a.update({ move }, DT),
      r = a.rhythm;
    if (was && r.stepping !== was) {
      // `was` has just come down
      const at = pose.at[JOINT[was]],
        home = GUARD.feet[was].at,
        over = (at[0] - home[0]) * dir[0] + (at[2] - home[2]) * dir[1];
      if (over > 0.06) return was;
    }
    was = r.stepping;
  }
  return null;
}

test('gait: the foot on the side he is going steps first, whenever he sets off', () => {
  // (from every point in the bounce: the step he sets off in can be either foot's)
  for (let settleFor = 20; settleFor < 60; settleFor += 3) {
    assert.equal(firstFoot([0, 1.4], settleFor), 'L', 'advancing, the lead foot');
    assert.equal(firstFoot([0, -1.4], settleFor), 'R', 'retreating, the rear foot');
    assert.equal(firstFoot([1.4, 0], settleFor), 'L', 'to his left, the lead foot (it is on his left)');
    assert.equal(firstFoot([-1.4, 0], settleFor), 'R', 'to his right, the rear foot');
  }
});

/* Set off at the bout's own acceleration and keep going, walking and turning; -> for each stance, in order, how far the
   planted foot moved on the canvas while it was down. */
function stances(move, turn) {
  const a = createAnimator(0);
  for (let i = 0; i < 30; i++) a.update({}, DT);
  let x = 0,
    z = 0,
    yaw = 0;
  const planted = {},
    out = [];
  for (let i = 0; i < 150; i++) {
    const k = Math.min(1, ((i + 1) * DT * 17) / Math.hypot(move[0], move[1]) || 1),
      m = [move[0] * k, move[1] * k],
      pose = a.update({ move: m, turn: turn * k }, DT),
      stepping = a.rhythm.stepping;
    // (his own space to the canvas: +z ahead along his heading, +x to his left)
    x += (m[0] * Math.cos(yaw) + m[1] * Math.sin(yaw)) * DT;
    z += (-m[0] * Math.sin(yaw) + m[1] * Math.cos(yaw)) * DT;
    yaw += turn * k * DT;
    for (const side of ['L', 'R']) {
      const p = pose.at[JOINT[side]],
        world = [x + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), z - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)];
      if (stepping === side) {
        if (planted[side]) out.push(planted[side].worst);
        delete planted[side];
      } else if (!planted[side]) planted[side] = { at: world, worst: 0 };
      else planted[side].worst = Math.max(planted[side].worst, Math.hypot(world[0] - planted[side].at[0], world[1] - planted[side].at[1]));
    }
  }
  return out;
}

test('gait: once under way, a planted foot stays where it was put on the canvas while he travels and turns over it', () => {
  for (const [move, turn] of [[[0.4, 1.2], 1.1], [[0, 2.3], 0], [[0, -2.3], 0], [[2.3, 0], 0], [[0, 0], 3]]) {
    // (the first two stances are setting off: there the rear foot may be dragged, the way a push step drags it)
    const after = stances(move, turn).slice(2);
    assert.ok(after.length >= 6, 'he keeps stepping');
    assert.ok(Math.max(...after) < 0.012, `${JSON.stringify(move)}, turning ${turn}: a planted foot moved ${(Math.max(...after) * 100).toFixed(1)} cm`);
  }
});

test('pendulum step: in on the lead, rock, out on the rear, rock; the feet only ever take turns', () => {
  const entry = ENTRIES.find(e => e.id === 'pendulum'),
    bout = createBout(7),
    a = bout.fighters[0];
  [a.x, a.z] = HOME;
  [bout.fighters[1].x, bout.fighters[1].z] = AWAY;
  settle(bout);
  const slots = [];
  let last = -1;
  for (let i = 0; i < Math.round(6 / DT); i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    const r = a.animator.rhythm;
    if (r.halves !== last) (slots.push({ foot: r.stepping, x: a.x - HOME[0] }), (last = r.halves));
  }
  const first = slots.findIndex(s => s.foot === 'L');
  const swings = slots.slice(first, first + 18);
  for (let i = 1; i < swings.length; i++) assert.notEqual(swings[i].foot, swings[i - 1].foot, 'the feet take turns');
  for (let k = 0; k + 6 <= swings.length; k += 6) {
    const [inLead, inRear, rockLead, outRear, outLead, rockRear] = swings.slice(k, k + 6);
    assert.equal(inLead.foot, 'L', 'in: the lead foot first');
    assert.equal(outRear.foot, 'R', 'out: the rear foot first');
    assert.ok(rockLead.x > 0.22 && outRear.x > 0.22, 'in, he rocks on the lead foot before coming out: ' + rockLead.x.toFixed(2));
    assert.ok(Math.abs(rockRear.x) < 0.04, 'out, he rocks on the rear foot: ' + rockRear.x.toFixed(2));
    assert.ok(inRear.x > 0.06 && inRear.x < 0.2 && outLead.x > 0.06 && outLead.x < 0.2, 'half way in and out as the other foot follows');
  }
});
