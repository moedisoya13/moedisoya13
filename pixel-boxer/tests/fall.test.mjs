/* Knockdowns are physics (phys/fall.mjs): a limp body from the pose he was in and the blow, under gravity, on the canvas.
   Here: each knockdown drill comes to rest where a fallen man would, never hangs in the air on the way, and gets up out of
   the very pose it came to rest in; the knee drop really has a knee and a glove on the canvas; the same blow gives the same
   fall every time; and a body knocked down from the guard by blows from every side settles, never throwing itself about,
   on its back, front or side, each of which has its own way up. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { measure } from '../src/audit.mjs';
import { createFall, stepFall, lyingOf, poseOf } from '../src/phys/fall.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';
import { guardPose } from '../src/anim/animator.mjs';
import { MOVES, LIE, UP } from '../src/anim/moves.mjs';
import { RADIUS, GLOVE } from '../src/rig/body.mjs';

const DT = 1 / 60,
  // (knocked out cold he does not get up: tests/faint.test.mjs)
  DOWNS = DEFENSE.filter(e => e.fall && !MOVES[e.fall].faint);

// one knockdown drill, frame by frame: what the knocked-down man was doing and where he was
function drill(entry) {
  const bout = freshBout(entry),
    f = bout.fighters[0],
    frames = [];
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (bout.stop > 0) continue; // (time held at the blow)
    frames.push({ doing: f.action ? f.action.name : 'guard', m: measure(f) });
  }
  return frames;
}

for (const entry of DOWNS)
  test(`knockdown: ${entry.id} falls, comes to rest, and gets up out of the pose he lay in`, () => {
    const frames = drill(entry),
      down = frames.findIndex(k => MOVES[k.doing] && MOVES[k.doing].floor && !k.doing.startsWith('rise')),
      up = frames.findIndex((k, i) => i > down && k.doing.startsWith('rise'));
    assert.ok(down >= 0 && up > down, `${entry.id}: went down at ${down}, got up at ${up}`);
    const rest = frames[up - 1].m;
    if (entry.fall === 'drop') {
      // a knee and a glove down on the canvas, not hovering over it
      const knee = Math.min(rest.at.LeftShin[1], rest.at.RightShin[1]),
        glove = Math.min(rest.at.gloveLeft[1], rest.at.gloveRight[1]);
      assert.ok(knee < RADIUS.Shin + 0.01, `knee ${knee.toFixed(3)} m up`);
      assert.ok(glove < GLOVE.r + 0.02, `glove ${glove.toFixed(3)} m up`);
    } else {
      assert.ok(rest.com[1] < 0.3 && rest.at.head[1] < 0.35, `at rest: centre of mass ${rest.com[1].toFixed(2)} m, head ${rest.at.head[1].toFixed(2)} m up`);
      // on the way down the centre of mass never hangs still in the air (2 mm a frame, 35 cm up, more than three frames)
      let still = 0;
      for (let i = down + 1; i < up; i++) {
        const y = frames[i].m.com[1];
        still = y > 0.35 && Math.abs(y - frames[i - 1].m.com[1]) < 0.002 ? still + 1 : 0;
        assert.ok(still <= 3, `hung in the air at ${y.toFixed(2)} m, frame ${i}`);
      }
    }
    // the first frame of the rise is the last he lay in, give or take how far he moves in a frame
    for (const name in rest.at) {
      const a = rest.at[name],
        b = frames[up].m.at[name],
        d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(d < 0.03, `${name} jumped ${(d * 100).toFixed(1)} cm into the rise`);
    }
  });

test('knockdown: the same blow knocks him down the same way every time', () => {
  const a = drill(DOWNS[0]).map(k => k.m.com),
    b = drill(DOWNS[0]).map(k => k.m.com);
  assert.deepEqual(a, b);
});

test('knockdown: from the guard, a blow from any side lays him down still, on his back, front or side, each with its way up', () => {
  const guard = guardPose(),
    seen = new Set();
  for (let k = 0; k <= 8; k++) {
    const a = (k * Math.PI) / 4,
      blow = k === 8 ? null : { J: 60, dir: [Math.sin(a), 0, -Math.cos(a)], at: null, push: [0, 0] },
      body = createFall(guard, guard, DT, blow);
    let fastest = 0;
    for (let i = 1; i <= 10 / DT && !body.asleep; i++) {
      stepFall(body, DT);
      if (i * DT > 0.1) for (const b of body.bodies) fastest = Math.max(fastest, Math.hypot(...b.v));
    }
    const lying = lyingOf(body),
      mass = body.bodies.reduce((m, b) => m + 1 / b.im, 0),
      com = body.bodies.reduce((y, b) => y + b.x[1] / b.im, 0) / mass;
    seen.add(lying.on);
    assert.ok(fastest < 12, `blow ${k}: a part of him went ${fastest.toFixed(1)} m/s`);
    assert.ok(body.asleep, `blow ${k}: still moving after 10 s`);
    assert.ok(com < 0.4 && Math.hypot(lying.hips[0], lying.hips[2]) < 1.5, `blow ${k}: came to rest with his centre of mass ${com.toFixed(2)} m up, hips at ${lying.hips.map(v => v.toFixed(2))}`);
    assert.ok(MOVES[LIE[lying.on]] && UP[LIE[lying.on]], `blow ${k}: no way up from his ${lying.on}`);
  }
  assert.ok(seen.size >= 2, `every fall ended on his ${[...seen]}`);
});

/* The waist (Spine1) is part of the pose a fall starts from: the belly, one piece from the waist to the chest, is set from
   where the lower spine and the chest are, so a man knocked down with his waist turned is not snapped straight as the physics
   takes him (the pose it starts from is his, to the half centimetre the one-piece belly always takes), and his first frame
   of falling goes where the same fall from his guard goes, give or take what the turn itself changes. */
test('knockdown: knocked down with his waist turned 15 degrees, no joint of him jumps in the first frame', () => {
  const most = (a, b) => Math.max(...NAMES.map(n => Math.hypot(a[n][0] - b[n][0], a[n][1] - b[n][1], a[n][2] - b[n][2]))),
    fell = waist => {
      const pose = guardPose({ waist }),
        body = createFall(pose, pose, DT, null),
        start = poseOf(body, 0, 0).at;
      stepFall(body, DT);
      const next = poseOf(body, DT, 0).at;
      return { pose, start, moved: Object.fromEntries(NAMES.map(n => [n, next[n].map((v, i) => v - start[n][i])])) };
    },
    straight = fell(0);
  for (const waist of [15, -15]) {
    const { pose, start, moved } = fell(waist),
      R = pose.rot.Spine1,
      turned = (Math.atan2(R[2], R[8]) * 180) / Math.PI;
    assert.ok(Math.abs(turned - waist) < 0.01, `the guard's waist is turned ${turned.toFixed(2)} degrees`);
    assert.ok(most(start, pose.at) < 0.01, `waist ${waist}: the fall starts ${(most(start, pose.at) * 100).toFixed(1)} cm from his pose`);
    assert.ok(most(moved, straight.moved) < 0.03, `waist ${waist}: the first frame of the fall goes ${(most(moved, straight.moved) * 100).toFixed(1)} cm from where it goes from the guard`);
  }
});
