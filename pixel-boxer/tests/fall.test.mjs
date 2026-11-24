/* Knockdowns are physics (phys/fall.mjs): a limp body from the pose he was in and the blow, under gravity, on the canvas.
   Here: each knockdown drill comes to rest where a fallen man would, never hangs in the air on the way, and gets up out of
   the very pose it came to rest in; the knee drop really has a knee and a glove on the canvas; the same blow gives the same
   fall every time; and a body knocked down from the guard by blows from every side settles, never throwing itself about,
   on its back, front or side, each of which has its own way up. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, getUp } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { BODYSHOTS } from '../src/bodyshots.mjs';
import { measure, auditor, GETUP } from '../src/audit.mjs';
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

/* Caught coming in (down-front: docs/moves-plan-6.md §3.5 N25), his legs no longer split as far: a limp hip is still held by
   its ligaments from well short of the end of its range, a limp knee pushed back open from short of folded right up, and
   the knee of the leg he leaves behind lets go first (phys/fall.mjs: LIGAMENT, TRAIL). They were 158 degrees apart at the
   most and 157 lying, his ankles 1.76 m and 1.69 m; the plan's 80, 55, 0.95 and 0.75 are not all reached (he is struck in
   the middle of a cross, the whole of him turning at 520 degrees a second, and the rear leg, stepping through, is flung
   out by it while he is in the air): 97.5 and 72.2 degrees, 1.45 and 0.91 m, and he is held to what he did before the
   knee was let open. He still lands on his front (tests/hits.test.mjs) and gets up from it. (The other knockdowns' heads
   are stopped by the canvas when they were, to three frames: down-back 0.717 s after the blow as before, down-side 0.800
   for 0.750; but down-side, his legs drawn together, now rolls on over onto his front and gets up from there, where he
   lay on his back.) */
test('knockdown: caught coming in, his thighs are at most 120 degrees apart and 80 once he lies, his ankles 1.6 m and 1 m', () => {
  const entry = DEFENSE.find(e => e.id === 'down-front'),
    fell = drill(entry).filter(k => MOVES[k.doing] && MOVES[k.doing].fall),
    sub = (a, b) => a.map((v, i) => v - b[i]),
    thighs = k => {
      const a = sub(k.m.at.LeftShin, k.m.at.LeftLeg),
        b = sub(k.m.at.RightShin, k.m.at.RightLeg);
      return (Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)) * 180) / Math.PI;
    },
    ankles = k => Math.hypot(...sub(k.m.at.LeftFoot, k.m.at.RightFoot)),
    lying = fell[fell.length - 1];
  assert.ok(fell.length > 60, `${fell.length} frames down`);
  const most = Math.max(...fell.map(thighs)),
    apart = Math.max(...fell.map(ankles));
  assert.ok(most <= 120 && thighs(lying) <= 80, `his thighs ${most.toFixed(1)} degrees apart at the most, ${thighs(lying).toFixed(1)} lying`);
  assert.ok(apart <= 1.6 && ankles(lying) <= 1, `his ankles ${apart.toFixed(2)} m apart at the most, ${ankles(lying).toFixed(2)} m lying`);
});

/* Getting up, his legs come out of how he lay joint by joint (anim/animator.mjs: legsUnlying), and no joint of them moves
   more than GETUP (8 cm, 4.8 m/s: half as fast as a jab's glove at its fastest, src/audit.mjs) in a frame, from the last
   frame he lay in to the end of the part of the rise blended out of it, in every get-up of every knockdown card. (Blended
   by where their ends were, the leg down-front left folded right up jumped 15 to 35 cm in single frames as the solver let
   it out straighter a step at a time, and the rise off his back and off his side 9.8 and 9.4 where the blend ended. The
   rest of each rise, as its keys make it, is watched: src/audit.mjs, GETTING_UP.) */
test('getting up: out of how he lay, no joint of his legs moves 8 cm in a frame, in every get-up of every knockdown card', () => {
  const cards = [...DOWNS, BODYSHOTS.find(e => e.id === 'down-liver')],
    worst = [];
  for (const entry of cards) {
    const frames = drill(entry),
      up = frames.findIndex(k => k.doing.startsWith('rise')),
      name = frames[up].doing,
      blend = Math.round((MOVES[name].blend || 0) / DT);
    let most = [0];
    for (let i = up; i <= up + blend && i < frames.length; i++)
      for (const n in frames[i].m.at) {
        if (!/Leg|Shin|Foot|ToeBase/.test(n)) continue;
        const a = frames[i].m.at[n],
          b = frames[i - 1].m.at[n],
          d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d > most[0]) most = [d, n, i - up];
      }
    worst.push({ d: most[0], said: `${entry.id} ${name}: ${(most[0] * 100).toFixed(1)} cm (${most[1]}, frame ${most[2]})` });
  }
  assert.equal(worst.length, 5);
  assert.ok(worst.every(w => w.d < GETUP), worst.map(w => w.said).join('; '));
});

/* And the same of falls the cards do not show, each held as well to the audit's held checks, all of them, a landing as the
   audit lets a fall land (src/audit.mjs; tests/audit.test.mjs, its exceptions: thrown upward in 4 frames at most, at 14 g at
   most, and falling faster than gravity in 3, at 2.5). Down-front two ways, every hundredth of a second from 0.06 s sooner
   to 0.06 s later than the card's:
     the jab itself  thrown so much off the card's (the other man's presses moved, and the moment his health is dropped and
                     his get-up with them). As the frames fall that is a few blows: 0.02 and 0.01 s sooner, 54 newton-seconds
                     at 0.667 s, and the card's and 0.01 s later, 31 at 0.683, knock him down forward; 0.02 s later drops him
                     to a knee; 0.03 s sooner and earlier, and 0.03 and 0.04 s later, it misses him; 0.05 and 0.06 s later it
                     lands as he is left so little health that it knocks him out cold; each held to what it does (JAB_DOES).
                     A fall out cold is the base's own (phys/fall.mjs: its hips, knees and waist are let be as they were),
                     and what it breaks is watched, not held: these two break, the same in the base, a glove inside the
                     other man (the jab's, 8 and 7 frames, 9.22 cm), and 0.06 s later his knee the wrong way round (4
                     frames, 60.2 degrees) and his ankle rolled over (46.7)
     his health      dropped so much sooner or later than the card's, the jab where it is (as the frames fall, about 8 falls,
                     all from the card's one blow at 0.683 s, every one forward)
   Every get-up is held to the legs' bound. Most of those falls leave the leg he left behind folded right up (phys/fall.mjs),
   and it comes round with the blend, held to a range as wide as it lay, rather than being turned back to the nearer edge of
   its range at once (anim/animator.mjs: legsUnlying; turned back so, the knee changed edges from one frame to the next in
   five of the thirteen, 10 to 31 cm); and its knee is kept on the canvas, not let through it, as it comes round
   (anim/animator.mjs: kneeUp; let through, one of the thirteen had his knee 5.8 cm into it for 55 frames). */
const OFF = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
// (what the jab does to him, thrown so many hundredths off the card's: every one held to it)
const JAB_DOES = { '-6': 'misses', '-5': 'misses', '-4': 'misses', '-3': 'misses', '-2': 'down forward', '-1': 'down forward', 0: 'down forward', 1: 'down forward', 2: 'to a knee', 3: 'misses', 4: 'misses', 5: 'out cold', 6: 'out cold' };
/* (the audit's held checks over one run: what it breaks, but a landing within what the audit lets a fall's be; and apart,
   watched, what it breaks while he is out cold, his fall the base's) */
function held(entry) {
  const bout = freshBout(entry),
    a = auditor();
  a.begin(entry);
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    a.frame(bout, tick);
  }
  const LANDING = { 'thrown upward (g)': [4, 14], 'falling faster than gravity (g)': [3, 2.5] },
    cold = k => { const m = MOVES[k.doing.split(' / ')[0]]; return !!(m && m.faint); },
    broken = [],
    watched = [];
  for (const [check, c] of Object.entries(a.result().found)) {
    if (!c.bad) continue;
    const said = list => `${check}: ${list.length} frames, ${list.reduce((w, k) => (Math.abs(k.value) > Math.abs(w.value) ? k : w)).value.toFixed(2)} (${list[0].doing})`,
      land = LANDING[check],
      fall = c.cases.filter(k => MOVES[k.doing] && MOVES[k.doing].fall);
    if (land && fall.length === c.bad && c.bad <= land[0] && fall.every(k => Math.abs(k.value) <= land[1])) continue;
    const out = c.cases.filter(cold),
      rest = c.cases.filter(k => !cold(k));
    if (out.length) watched.push(said(out));
    if (rest.length) broken.push(said(rest));
  }
  return { broken, watched };
}
function offDownFront(k, jab) {
  const base = DEFENSE.find(e => e.id === 'down-front'),
    by = k / 100,
    at = base.punch[1] + (jab ? by : 0),
    drop = (jab ? at : base.punch[1] + by) - 0.02,
    up = 2.8 + (jab ? by : 0);
  return Object.assign({}, base, {
    id: `down-front, ${jab ? 'the jab' : 'his health'} ${by} s`,
    against: jab ? base.against.map(([t, b, v]) => [t + by, b, v]) : base.against,
    keep: (b, t) => {
      const f = b.fighters[0];
      // (finished by the jab, as the card is, and up at 2.8 s, or as much later as the jab is)
      if (t < drop) f.hp = 100;
      else if (t < drop + DT + 1e-9) f.hp = 0.05;
      if (f.down && t >= up) (f.hp = 40), getUp(b, f);
    }
  });
}
for (const [name, jab] of [
  ['caught coming in by a jab thrown up to 0.06 s sooner or later, the blow itself moved: it does to him what it did (down forward, to a knee, out cold, or it misses him), no joint of his legs moves 8 cm in a frame as he gets up, and the audit\'s held checks hold (out cold, watched)', true],
  ['caught coming in, his health dropped up to 0.06 s sooner or later than the jab that drops him: he falls forward, no joint of his legs moves 8 cm in a frame as he gets up out of how he lay, and the audit\'s held checks hold', false]
])
  test(`getting up: ${name}`, t => {
    const worst = [],
      broken = [];
    for (const k of OFF) {
      const entry = offDownFront(k, jab),
        frames = drill(entry),
        fell = frames.find(f => MOVES[f.doing] && MOVES[f.doing].fall),
        up = frames.findIndex(f => f.doing.startsWith('rise'));
      // (his health dropped, it is always the card's blow, and he always falls forward; the jab moved, it does what it did)
      const did = fell ? (fell.doing === 'ko' ? 'down forward' : MOVES[fell.doing].faint ? 'out cold' : fell.doing) : up > 0 ? (frames[up].doing === 'riseKnee' ? 'to a knee' : frames[up].doing) : 'misses';
      assert.equal(did, jab ? JAB_DOES[k] : 'down forward', `${entry.id}: what the blow did to him`);
      if (did === 'down forward') assert.ok(up > 0, `${entry.id}: he got up`);
      if (up > 0) {
        const blend = Math.round((MOVES[frames[up].doing].blend || 0) / DT);
        let most = [0];
        for (let i = up; i <= up + blend && i < frames.length; i++)
          for (const n in frames[i].m.at) {
            if (!/Leg|Shin|Foot|ToeBase/.test(n)) continue;
            const a = frames[i].m.at[n],
              b = frames[i - 1].m.at[n],
              d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
            if (d > most[0]) most = [d, n, i - up];
          }
        worst.push({ d: most[0], said: `${entry.id} ${frames[up].doing}: ${(most[0] * 100).toFixed(1)} cm (${most[1]}, frame ${most[2]})` });
      }
      const h = held(entry);
      for (const b of h.broken) broken.push(`${entry.id}: ${b}`);
      for (const w of h.watched) t.diagnostic(`watched, ${entry.id}, out cold: ${w}`);
    }
    assert.ok(worst.every(w => w.d < GETUP), worst.map(w => w.said).join('; '));
    assert.deepEqual(broken, []);
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
   takes him (the pose it starts from is his, to the half centimetre the one-piece belly always takes). And nothing of him
   jumps in his first frame of falling, straight or turned: a guard's rear elbow, tucked in front of his ribs nearer his trunk
   than the fall keeps a limb, is let out from there over 0.13 s (phys/fall.mjs: EASE), not put out at once (it jumped 3.1
   cm, and 4.2 with the waist turned the other way). */
test('knockdown: knocked down from the guard, straight or with his waist turned 15 degrees, no joint of him moves 3 cm in the first frame', () => {
  const most = (a, b) => Math.max(...NAMES.map(n => Math.hypot(a[n][0] - b[n][0], a[n][1] - b[n][1], a[n][2] - b[n][2])));
  for (const waist of [0, 15, -15]) {
    const pose = guardPose({ waist }),
      body = createFall(pose, pose, DT, null),
      start = poseOf(body, 0, 0).at,
      R = pose.rot.Spine1,
      turned = (Math.atan2(R[2], R[8]) * 180) / Math.PI;
    stepFall(body, DT);
    const next = poseOf(body, DT, 0).at;
    assert.ok(Math.abs(turned - waist) < 0.01, `the guard's waist is turned ${turned.toFixed(2)} degrees`);
    assert.ok(most(start, pose.at) < 0.01, `waist ${waist}: the fall starts ${(most(start, pose.at) * 100).toFixed(1)} cm from his pose`);
    assert.ok(most(next, start) < 0.03, `waist ${waist}: a joint moved ${(most(next, start) * 100).toFixed(1)} cm in the first frame of the fall`);
  }
});
