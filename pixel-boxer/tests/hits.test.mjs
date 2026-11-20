/* Being hit and going down, by the blow's vector (docs/moves-plan-4.md §11), and the shoulder held to its table:
     a man knocked down goes the way the blow went and the way he was going: his centre of mass travels, from the blow to
     where he lies, within 35 degrees of the blow's impulse and his own momentum added, along the canvas;
     a struck body takes the whole vector, the head first: back lays the trunk back and pushes the hips back and the weight
     onto the heels, up lifts him onto his toes and down into his knees, across bends him that way; more of each for more of
     the vector, and all of it for more of the impulse;
     the shoulder's table (rig/body.mjs: SHOULDER) holds a guard and a punch and not the three places an arm cannot go; and
     each of the four ways up keeps to it, swings the shoulder no faster than 900 degrees a second, and keeps the elbows out
     of the trunk. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, local, getUp, RULES } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { measure } from '../src/audit.mjs';
import { createAnimator } from '../src/anim/animator.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import { shoulderOf, armMost, twistMost } from '../src/rig/body.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI,
  LAID = DEFENSE.filter(e => e.fall === 'ko' || e.fall === 'slump');

// one knockdown drill: the blow that put him down, his centre of mass and how fast it was going just before it, and where it
// came to rest (in his own terms as he was hit: [to his left, ahead])
function knockdown(entry) {
  const bout = freshBout(entry),
    f = bout.fighters[0];
  let hit = null,
    was = null,
    v = null,
    rest = null,
    lies = null,
    follow = null;
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    const e = bout.events.find(e => e.type === 'hit' && e.on === 0 && e.down);
    if (e && !hit) hit = { e, from: was, v, yaw: f.yaw };
    // (where the glove went on to, through him, over the 80 ms after it met him)
    const fo = bout.events.find(e => e.type === 'follow' && e.on === 0);
    if (fo) follow = fo.follow;
    if (bout.stop > 0) continue;
    const com = measure(f).com;
    if (was) v = [(com[0] - was[0]) / DT, (com[2] - was[2]) / DT];
    was = com;
    if (hit && f.action && MOVES[f.action.name].fall) rest = com;
    if (f.action && f.action.name.startsWith('rise')) lies = f.action.from;
  }
  const mine = w => local({ yaw: hit.yaw }, w[0], w[1]);
  return { J: hit.e.J, vec: mine([hit.e.vec[0], hit.e.vec[2]]), own: mine(hit.v), moved: mine([rest[0] - hit.from[0], rest[2] - hit.from[2]]), follow: follow && mine([follow[0], follow[2]]), lies };
}
const angle = (a, b) => Math.abs(((((Math.atan2(a[0], a[1]) - Math.atan2(b[0], b[1])) * DEG + 540) % 360) - 180));

for (const entry of LAID)
  test(`knockdown: ${entry.id} goes the way the blow went and the way he was going`, () => {
    const k = knockdown(entry);
    // (the impulse as physics has it, and as the bout shoves him with it, 2.2 times: both, his momentum added)
    for (const shove of [1, RULES.shove]) {
      const want = [0, 1].map(i => shove * k.J * k.vec[i] + RULES.mass * k.own[i]);
      assert.ok(angle(k.moved, want) <= 35, `${entry.id}: moved [${k.moved.map(x => x.toFixed(2))}] against [${want.map(x => x.toFixed(0))}] (shove ${shove}): ${angle(k.moved, want).toFixed(0)} degrees`);
    }
  });

test('knockdown: the hook goes down the way its glove goes on through him, to his left; caught coming in, he goes down forward', () => {
  const side = knockdown(DEFENSE.find(e => e.id === 'down-side')),
    front = knockdown(DEFENSE.find(e => e.id === 'down-front'));
  /* (a lead hook lands on its sweep, coming from his right, and goes on through him to his left: he goes where it goes, his
     centre of mass from the blow to where he lies within 25 degrees of the glove's way along the canvas over the 80 ms after
     it met him, and to his left. There is no rear-hand hook in the game to hold to the mirror of it.) */
  assert.ok(side.follow && side.follow[0] > 0 && side.moved[0] > 0 && Math.abs(side.moved[0]) > Math.abs(side.moved[1]), `hook: follow [${side.follow && side.follow.map(x => x.toFixed(2))}], moved [${side.moved.map(x => x.toFixed(2))}]`);
  assert.ok(angle(side.moved, side.follow) <= 25, `hook: moved [${side.moved.map(x => x.toFixed(2))}] against the follow-through [${side.follow.map(x => x.toFixed(2))}]: ${angle(side.moved, side.follow).toFixed(0)} degrees`);
  assert.ok(front.own[1] > 2 && front.moved[1] > 0.3 && front.lies === 'front', `coming in at ${front.own[1].toFixed(1)} m/s: moved [${front.moved.map(x => x.toFixed(2))}], lies on his ${front.lies}`);
});

test('knockdown: the same blow, and the same man coming in, go down the same way every time', () => {
  for (const id of ['down-side', 'down-front']) assert.deepEqual(knockdown(DEFENSE.find(e => e.id === id)), knockdown(DEFENSE.find(e => e.id === id)));
});

/* ---- a struck body, from the guard, against the same man not struck: degrees and centimetres, at the most */
const col = (m, i) => [m[i], m[3 + i], m[6 + i]];
function read(pose) {
  const F = fk(pose),
    up = col(F.R.Chest, 1),
    nod = col(F.R.Head, 1),
    foot = S => ({ pitch: -Math.asin(col(F.R[S + 'Foot'], 2)[1]) * DEG, roll: Math.asin(col(F.R[S + 'Foot'], 0)[1]) * DEG });
  return { tilt: [Math.atan2(up[0], up[1]) * DEG, Math.atan2(up[2], up[1]) * DEG], nod: Math.atan2(nod[2], nod[1]) * DEG, hips: F.p.Hips, L: foot('Left'), R: foot('Right') };
}
function struck(J, dir) {
  const a = createAnimator(0),
    b = createAnimator(0),
    view = { move: [0, 0], turn: 0, cover: 0, action: null };
  for (let i = 0; i < 90; i++) a.update(view, DT), b.update(view, DT);
  a.strike({ J, dir, stun: 0.3, hp: 100 });
  const l = Math.hypot(dir[0], dir[2]) || 1,
    way = [dir[0] / l, dir[2] / l],
    out = { tilt: 0, tiltAt: 0, head: 0, headAt: 0, back: 0, up: 0, across: 0, toes: 0, heels: 0, roll: 0 };
  for (let i = 1; i <= 60; i++) {
    const v = Object.assign({}, view, { stun: i * DT < 0.3 }),
      r = read(a.update(v, DT)),
      c = read(b.update(v, DT)),
      tilt = (r.tilt[0] - c.tilt[0]) * way[0] + (r.tilt[1] - c.tilt[1]) * way[1],
      head = c.nod - r.nod;
    if (tilt > out.tilt) (out.tilt = tilt), (out.tiltAt = i * DT);
    if (head > out.head) (out.head = head), (out.headAt = i * DT);
    out.back = Math.max(out.back, (c.hips[2] - r.hips[2]) * 100);
    out.up = Math.max(out.up, (r.hips[1] - c.hips[1]) * 100);
    out.across = Math.max(out.across, Math.abs(r.hips[0] - c.hips[0]) * 100);
    out.toes = Math.max(out.toes, c.L.pitch - r.L.pitch);
    out.heels = Math.max(out.heels, Math.min(r.L.pitch - c.L.pitch, r.R.pitch - c.R.pitch));
    out.roll = Math.max(out.roll, Math.abs(r.L.roll - c.L.roll), Math.abs(r.R.roll - c.R.roll));
  }
  return out;
}
const unit = d => d.map(x => x / Math.hypot(...d));

test('struck: the more of the blow comes up through him, the higher he is lifted, and the more of it back, the further the trunk is laid back', () => {
  /* (at 85 newton-seconds a blow more than half up through him throws him as high as his legs reach on his toes, and no
     higher: past that, how high the hips are is the trunk's lean, not the lift; so the lift is held to the order up to there) */
  for (const [J, most] of [[40, 2.5], [85, 1]]) {
    const ups = [0, 0.4, 1, 2.5].filter(u => u <= most).map(u => struck(J, unit([0, u, -1])).up);
    assert.ok(ups.every((u, i) => !i || u > ups[i - 1]), `${J} N·s, lifted ${ups.map(x => x.toFixed(1))} cm`);
    const backs = [0.3, 0.6, 1].map(b => struck(J, unit([Math.sqrt(1 - b * b), 0, -b])).tilt);
    assert.ok(backs.every((t, i) => !i || t > backs[i - 1]), `${J} N·s, laid back ${backs.map(x => x.toFixed(1))} degrees`);
  }
});

test('struck: an 85 N·s straight lays the trunk back 14 degrees and more, half as far again as it did, the head first', () => {
  // (the catalogue's cross, as it meets him: a little up, a little to his left; the trunk went back 14.3 degrees before this
  // stage, measured the same way, toward the blow)
  const r = struck(85, [0.1, 0.29, -0.95]);
  assert.ok(r.tilt >= 14 && r.tilt >= 1.5 * 14.3, `laid back ${r.tilt.toFixed(1)} degrees`);
  assert.ok(r.back >= 3 && r.back <= 6 && r.toes >= 5, `hips back ${r.back.toFixed(1)} cm, lead toes up ${r.toes.toFixed(1)} degrees`);
  assert.ok(r.tiltAt - r.headAt >= 0.025 && r.tiltAt - r.headAt <= 0.065, `the head at its furthest at ${(r.headAt * 1000).toFixed(0)} ms, the trunk at ${(r.tiltAt * 1000).toFixed(0)} ms`);
});

test('struck: up through him he is lifted onto his toes; across him the trunk bends that way and the other foot rolls', () => {
  const up = struck(85, [0, 1, 0]),
    across = struck(85, [-1, 0, 0]);
  assert.ok(up.up >= 4 && up.up <= 7.5 && up.heels >= 10 && up.heels <= 18, `lifted ${up.up.toFixed(1)} cm, heels ${up.heels.toFixed(1)} degrees`);
  assert.ok(across.tilt >= 10 && across.tilt <= 16 && across.across >= 2 && across.across <= 4 && across.roll >= 5, `bent ${across.tilt.toFixed(1)} degrees, hips ${across.across.toFixed(1)} cm, a foot rolled ${across.roll.toFixed(1)} degrees`);
});

test('struck: every part of it grows with the impulse', () => {
  const at = J => struck(J, unit([-0.4, 0.4, -0.8]));
  const [a, b, c] = [40, 85, 110].map(at);
  for (const k of ['tilt', 'head', 'back', 'up', 'across']) assert.ok(a[k] < b[k] && b[k] < c[k], `${k}: ${[a, b, c].map(x => x[k].toFixed(1))}`);
});

/* ---- the shoulder */
const arm = (plane, elev) => [Math.cos((plane * Math.PI) / 180) * Math.sin((elev * Math.PI) / 180), -Math.cos((elev * Math.PI) / 180), Math.sin((plane * Math.PI) / 180) * Math.sin((elev * Math.PI) / 180)];
test('shoulder: the table lets an arm hang, guard, punch and reach overhead in front, and not into its three forbidden places', () => {
  // (the plan's points: across 140 to 110, ahead overhead, out nearly overhead, back 55)
  for (const [p, e] of [[140, 110], [90, 180], [0, 170], [-90, 55]]) assert.ok(Math.abs(armMost(p) - e) < 1e-9, `${p}: ${armMost(p)}`);
  // (inside: hanging any way; the guard's tucked rear elbow; a hook's elbow raised level and drawn back; a straight arm ahead)
  for (const [p, e] of [[-150, 10], [155, 60], [-55, 85], [90, 95], [30, 70]]) assert.equal(shoulderOf(arm(p, e)).zone, 0, `${p}/${e}`);
  // (outside: up behind, across past 140, across behind the back)
  for (const [p, e] of [[-90, 90], [-45, 120], [170, 80], [-150, 60]]) assert.ok(shoulderOf(arm(p, e)).zone > 10, `${p}/${e}`);
  // the turn: hanging, 90 in and 80 out; overhead, less in
  assert.deepEqual(twistMost(0), [90, 80]);
  assert.ok(twistMost(170)[0] < 40 && twistMost(170)[1] >= 90);
});

// one way up, frame by frame: how fast each upper arm swings as the chest sees it, what the table says of it, and how near
// each elbow comes to the trunk's line (hips to chest)
function rise(id, name) {
  const entry = DEFENSE.find(e => e.id === id),
    bout = freshBout(entry),
    f = bout.fighters[0];
  if (name) {
    const own = f.animator.getUp.bind(f.animator);
    f.animator.getUp = () => Object.assign(own(), { name });
  }
  const out = { name: null, fastest: 0, zone: 0, turned: 0, into: [] };
  let prev = null,
    near = null;
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    const a = f.action;
    if (!a || !a.name.startsWith('rise') || bout.stop > 0) continue;
    out.name = a.name;
    const m = measure(f),
      g = m.angles,
      d = {};
    for (const S of ['Left', 'Right']) {
      out.zone = Math.max(out.zone, g[S + 'ShoulderZone']);
      out.turned = Math.max(out.turned, g[S + 'ShoulderTurned']);
      if (prev) {
        const u = g[S + 'ArmUp'],
          v = prev[S + 'ArmUp'];
        out.fastest = Math.max(out.fastest, (Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * DEG) / DT);
      }
      const e = m.at[S + 'ForeArm'],
        h = m.at.Hips,
        c = m.at.Chest,
        t = c.map((x, i) => x - h[i]),
        k = Math.max(0, Math.min(1, ((e[0] - h[0]) * t[0] + (e[1] - h[1]) * t[1] + (e[2] - h[2]) * t[2]) / (t[0] ** 2 + t[1] ** 2 + t[2] ** 2)));
      d[S] = Math.hypot(...e.map((x, i) => x - (h[i] + t[i] * k)));
      /* (inside the trunk, which is deeper than 7 cm all round its line, and going in further: an elbow tucked in front of
         the ribs in the guard is 9 or 10 cm from it, and one the fall left lying across his chest may start nearer, but is
         not pushed further in) */
      if (near && d[S] < 0.07 && d[S] < near[S] - 1e-3) out.into.push(`${S} ${(d[S] * 100).toFixed(1)} cm @${a.t.toFixed(2)}`);
    }
    prev = g;
    near = d;
  }
  return out;
}
for (const [id, name] of [['down-back'], ['down-front'], ['down-side', 'riseSide'], ['down-knee']])
  test(`getting up: ${name || id} keeps the shoulders where they can go, swings them no faster than 900 degrees a second, and keeps the elbows out of the trunk`, () => {
    const r = rise(id, name);
    assert.ok(r.name, 'he got up');
    assert.ok(r.zone === 0 && r.turned === 0, `${r.name}: ${r.zone.toFixed(1)} degrees into a forbidden place, turned ${r.turned.toFixed(1)} past`);
    assert.ok(r.fastest <= 900.5, `${r.name}: a shoulder swung ${r.fastest.toFixed(0)} degrees a second`);
    assert.deepEqual(r.into, [], `${r.name}: an elbow went into the trunk`);
  });
