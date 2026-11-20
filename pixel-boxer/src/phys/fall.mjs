/* A man knocked down is a body, not a move. At the instant he goes, the animator hands him to this: fourteen rigid pieces
   (pelvis, belly, chest, head, and each upper arm, forearm with its glove, thigh, shin and foot), joined where his joints
   are, each joint held inside the range a body has (rig/body.mjs), all of it under gravity, on a canvas that holds it up and
   grips it, and with his limbs kept out of his own trunk and head (and out of the other man's legs, if he falls at them).
   It starts as he was: his pose, how fast each part was moving, and the blow that put him there (its impulse at his head,
   the way the glove was going as it met him, and the shove the bout gave him that way, with whatever he was already moving
   at: game/bout.mjs). His muscles hold the pose he was in and let go of it in a quarter of a second, from the legs up: the
   knees and hips first, then the trunk, the neck, the arms last. So he goes at the knees and folds, and lands however the
   blow and his weight take him: back and away from a straight, the way a hook's glove was going, forward if he was coming
   in, further for a harder one. The shoulders are held to the same table the solver and the audit use (rig/body.mjs:
   SHOULDER).
   Lying there, he still breathes.
   It is stepped at a fixed rate (twelve steps a frame), with nothing random in it, so a bout replays exactly.
     const body = createFall(pose, before, dt, blow)   pose, before: his last two solved poses (his own space); blow: { J
                                                        (newton-seconds), dir (unit, his space: the way the glove was going
                                                        as it met him), at (where, his space), push (his whole body's speed
                                                        from the shove and from what he was already moving at, [x, y, z]
                                                        m/s, or [x, z]) } | null
     stepFall(body, dt, obstacles)                     obstacles: [[centre, radius]] he cannot fall through (his space)
     poseOf(body, clock)                               -> a pose, as solve() returns one (rot, root, at, head, stretch)
     lyingOf(body)                                     -> how he has come to rest: { on: 'back' | 'front' | 'side', down:
                                                          'L' | 'R' (the side he lies on), hips, head (his space) }
     moveFall(body, R, off)                            carry the body into another frame of his own (getting up where he lies)
   The method is position-based dynamics of rigid bodies (Mueller et al., "Detailed rigid body simulation with extended
   position based dynamics", 2020): each step the bodies move freely, then every joint, limit, contact and muscle is put
   right by moving and turning the bodies as their masses and inertias share it, and the velocities are what that comes to. */
import * as M from '../rig/m3.mjs';
import { NAMES, PARENT, TPOSE, fk } from '../rig/skeleton.mjs';
import { RANGE, FOOT, HEAD, shoulderOf } from '../rig/body.mjs';

const G = 9.81,
  STEPS = 12,
  ITER = 3,
  RAD = Math.PI / 180,
  DEG = 180 / Math.PI;

// ---- vectors and quaternions ([x, y, z, w])
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = (a, f) => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : f || [0, 1, 0];
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qconj = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
const qrot = (q, v) => {
  const t = cross([q[0], q[1], q[2]], v),
    t2 = [2 * t[0], 2 * t[1], 2 * t[2]],
    u = cross([q[0], q[1], q[2]], t2);
  return [v[0] + q[3] * t2[0] + u[0], v[1] + q[3] * t2[1] + u[1], v[2] + q[3] * t2[2] + u[2]];
};
const qaxis = (axis, angle) => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
// the rotation q as a vector: its axis times its angle (the short way round)
const qvec = q => {
  const w = q[3] < 0 ? -1 : 1,
    v = [q[0] * w, q[1] * w, q[2] * w],
    s = len(v);
  if (s < 1e-9) return [0, 0, 0];
  const a = 2 * Math.atan2(s, q[3] * w);
  return [(v[0] / s) * a, (v[1] / s) * a, (v[2] / s) * a];
};
function qFromM3(m) {
  const t = m[0] + m[4] + m[8];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
  }
  return qnorm(q);
}
function qToM3(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

/* ---- the pieces of him. joint: the skeleton joint whose frame the piece is (its position is that joint's, its turn is
   that joint's turn from the T-pose); carry: joints held rigid on it; mass (kg, a 75 kg man by Dempster's shares, the gloves
   on the forearms); com: its middle, in its own frame from its joint; box: half sizes for its inertia; balls: what of it
   touches things, [centre, radius]; up: which body part it is, for when its muscles let go. */
const side = (s, f) => f(s === 'L' ? 'Left' : 'Right', s === 'L' ? 1 : -1, s);
const PIECES = [
  { name: 'pelvis', joint: 'Hips', carry: [], mass: 10.7, com: [0, 0, 0], box: [0.16, 0.09, 0.11], balls: [[[0, -0.02, 0], 0.13], [[0.09, -0.07, -0.04], 0.1], [[-0.09, -0.07, -0.04], 0.1]] },
  // (a trunk is broad and not deep: it lies flat, and is not a log to roll)
  { name: 'belly', joint: 'Spine1', carry: ['Spine2'], mass: 10.4, com: [0, 0.12, 0], box: [0.14, 0.12, 0.1], balls: [[[0.07, 0.06, 0.01], 0.12], [[-0.07, 0.06, 0.01], 0.12], [[0.07, 0.18, 0.01], 0.12], [[-0.07, 0.18, 0.01], 0.12]] },
  { name: 'chest', joint: 'Chest', carry: ['LeftShoulder', 'RightShoulder'], mass: 16.2, com: [0, 0.07, 0], box: [0.18, 0.11, 0.11], balls: [[[0, 0, 0], 0.12], [[0.1, 0.06, 0.02], 0.13], [[-0.1, 0.06, 0.02], 0.13], [[0.16, 0.13, 0], 0.09], [[-0.16, 0.13, 0], 0.09]] },
  { name: 'head', joint: 'Neck1', carry: ['Head'], mass: 6.1, com: [0, 0.16, 0.02], box: [0.09, 0.12, 0.1], balls: [[[0, 0.18, 0.02], 0.12], [[0, 0.03, 0], 0.06]] },
  ...['L', 'R'].flatMap(s =>
    side(s, (S, x) => [
      { name: s + 'arm', joint: S + 'Arm', carry: [], mass: 2.1, com: [x * 0.12, 0, 0], box: [0.14, 0.045, 0.045], balls: [[[0, 0, 0], 0.06], [[x * 0.14, 0, 0], 0.06], [[x * 0.27, 0, 0], 0.05]], limb: true },
      { name: s + 'fore', joint: S + 'ForeArm', carry: [S + 'Hand'], mass: 2.0, com: [x * 0.18, 0, 0], box: [0.16, 0.05, 0.05], balls: [[[x * 0.12, 0, 0], 0.05], [[x * 0.325, 0, 0], 0.1]], limb: true, glove: 1 },
      { name: s + 'thigh', joint: S + 'Leg', carry: [], mass: 7.5, com: [0, -0.18, 0], box: [0.07, 0.21, 0.07], balls: [[[0, -0.16, 0], 0.1], [[0, -0.42, 0], 0.06]], leg: true },
      { name: s + 'shin', joint: S + 'Shin', carry: [], mass: 3.5, com: [0, -0.18, 0], box: [0.05, 0.2, 0.05], balls: [[[0, -0.2, 0], 0.065]], limb: true, leg: true },
      { name: s + 'foot', joint: S + 'Foot', carry: [S + 'ToeBase'], mass: 1.1, com: [0, -0.04, 0.05], box: [0.05, 0.03, 0.1], balls: [[[0, 0, 0], 0.05], ...FOOT.sole], limb: true, leg: true }
    ])
  )
];
const INDEX = Object.fromEntries(PIECES.map((p, i) => [p.name, i]));
const OWNER = {}; // skeleton joint -> the piece that carries it
for (const p of PIECES) for (const j of [p.joint, ...p.carry]) OWNER[j] = p.name;

/* ---- the joints. kind: how the child may turn on the parent (the ranges are the body's, a few degrees inside them);
   tone: the order his muscles let go in, seconds from the knockdown that each starts and has finished letting go */
const R = RANGE;
const LIMB = ['L', 'R'];
const JOINTS = [
  { parent: 'pelvis', child: 'belly', kind: 'spine', tone: [0.06, 0.22], stiff: 900 },
  { parent: 'belly', child: 'chest', kind: 'spine', tone: [0.06, 0.22], stiff: 900 },
  { parent: 'chest', child: 'head', kind: 'neck', tone: [0.1, 0.26], stiff: 120 },
  ...LIMB.flatMap(s => [
    { parent: 'chest', child: s + 'arm', kind: 'shoulder', s, tone: [0.14, 0.3], stiff: 120 },
    { parent: s + 'arm', child: s + 'fore', kind: 'elbow', s, tone: [0.14, 0.3], stiff: 60 },
    { parent: 'pelvis', child: s + 'thigh', kind: 'hip', s, tone: [0, 0.16], stiff: 900 },
    { parent: s + 'thigh', child: s + 'shin', kind: 'knee', s, tone: [0, 0.14], stiff: 900 },
    { parent: s + 'shin', child: s + 'foot', kind: 'ankle', s, tone: [0, 0.16], stiff: 200 }
  ])
];
const LIM = {
  spine: { fwd: [-(R.spineBack - 4) / 2, (R.spineForward - 6) / 2], side: (R.spineSide - 4) / 2, twist: (R.spineTwist - 4) / 2 },
  // (and the two together, the chest on the pelvis, as a whole: each half's limits do not add up to the whole's)
  trunk: { fwd: [-(R.spineBack - 4), R.spineForward - 6], side: R.spineSide - 4, twist: R.spineTwist - 5 },
  neck: { fwd: [-(R.neckUp - 6), R.neckDown - 6], side: R.neckTilt - 6, twist: R.neckTurn - 8 },
  shoulder: 4, // degrees inside where the shoulder lets the upper arm point and turn (body.mjs: SHOULDER)
  elbow: { fold: 180 - R.elbowFolded - 4 },
  hip: { behind: R.hipBehind - 4, out: R.hipOut - 4, in: R.hipIn - 4, up: 120, twist: 40 },
  knee: { fold: 180 - R.kneeFolded - 4 },
  ankle: { up: R.ankleUp - 4, down: R.ankleDown - 4, roll: R.ankleRoll - 4, twist: 25 }
};
const MU = 0.9; // how the canvas grips
const HEAD_SHARE = 0.4; // of a blow's impulse, what his head takes (the rest reaches his chest through the neck)
// how fast a limp body's moving and turning die away (1/s): a little, and each joint's turning toward its parent's (soft tissue)
// (an arm's joints more: a limp arm is not whipped about; and an upper arm's turn about itself most of all, as the cuff of
// muscle round the shoulder holds it)
const DAMP = { move: 0.4, turn: 0.8, joint: 2.5, arm: 8, roll: 40 };
// how near his own trunk's line a glove may come, and his head's middle a glove; any other part of a limb, its own thickness
// and this much
const KEEP = { glove: 0.16, head: 0.13, limb: 0.1 };
const PRESS = 0.004; // metres a pass a limb is pressed out of his trunk at the most

const inertia = (m, [a, b, c]) => [(m / 3) * (b * b + c * c), (m / 3) * (a * a + c * c), (m / 3) * (a * a + b * b)];

// the world inverse inertia of a piece applied to a vector
function iw(b, v) {
  const l = qrot(qconj(b.q), v);
  return qrot(b.q, [l[0] * b.ii[0], l[1] * b.ii[1], l[2] * b.ii[2]]);
}
const wPos = (b, r, n) => {
  if (!b) return 0;
  const rn = cross(r, n);
  return b.im + dot(rn, iw(b, rn));
};
const wRot = (b, n) => (b ? dot(n, iw(b, n)) : 0);
function turnBy(b, dw) {
  const d = qmul([dw[0], dw[1], dw[2], 0], b.q);
  b.q = qnorm([b.q[0] + 0.5 * d[0], b.q[1] + 0.5 * d[1], b.q[2] + 0.5 * d[2], b.q[3] + 0.5 * d[3]]);
}
// move two pieces (b may be none: the world) so that a's point (at offset ra) is put `dx` back toward b's
function positional(a, ra, b, rb, dx, compliance, h) {
  const c = len(dx);
  if (c < 1e-9) return 0;
  const n = [dx[0] / c, dx[1] / c, dx[2] / c],
    w = wPos(a, ra, n) + wPos(b, rb, n);
  if (w < 1e-12) return 0;
  const dl = -c / (w + compliance / (h * h)),
    p = [n[0] * dl, n[1] * dl, n[2] * dl];
  if (a) (a.x = [a.x[0] + p[0] * a.im, a.x[1] + p[1] * a.im, a.x[2] + p[2] * a.im]), turnBy(a, iw(a, cross(ra, p)));
  if (b) (b.x = [b.x[0] - p[0] * b.im, b.x[1] - p[1] * b.im, b.x[2] - p[2] * b.im]), turnBy(b, iw(b, cross(rb, [-p[0], -p[1], -p[2]])));
  return c;
}
// turn a by the rotation vector `rot` relative to b (and b the other way), as their inertias share it
function angular(a, b, rot, compliance, h) {
  const th = len(rot);
  if (th < 1e-9) return;
  const n = [rot[0] / th, rot[1] / th, rot[2] / th],
    w = wRot(a, n) + wRot(b, n);
  if (w < 1e-12) return;
  const dl = th / (w + compliance / (h * h)),
    p = [n[0] * dl, n[1] * dl, n[2] * dl];
  if (a) turnBy(a, iw(a, p));
  if (b) turnBy(b, iw(b, [-p[0], -p[1], -p[2]]));
}

const at = (b, local) => M.add(b.x, qrot(b.q, M.sub(local, b.com))); // a point of a piece (local: in its own frame, from its joint)
const off = (b, local) => qrot(b.q, M.sub(local, b.com)); // and its offset from the piece's middle

export function createFall(pose, before, dt, blow) {
  const now = fk(pose),
    was = before ? fk(before) : now,
    /* (the belly is one piece: it takes the turn of its upper half, set to run from where his lower spine is to where his
       chest is, so that the spine bends at its two ends and nothing is pulled together at the start) */
    turnOf = (F, name) => {
      if (name !== 'Spine1') return qFromM3(F.R[name]);
      const q = qFromM3(F.R.Spine2),
        up = qrot(q, [0, 1, 0]),
        to = unit(M.sub(F.p.Chest, F.p.Spine1)),
        ax = cross(up, to),
        s = len(ax);
      return s > 1e-9 ? qnorm(qmul(qaxis([ax[0] / s, ax[1] / s, ax[2] / s], Math.asin(clamp(s, 0, 1))), q)) : q;
    };
  const bodies = PIECES.map(def => {
    const q = turnOf(now, def.joint),
      qp = turnOf(was, def.joint),
      x = M.add(now.p[def.joint], qrot(q, def.com)),
      xp = M.add(was.p[def.joint], qrot(qp, def.com)),
      I = inertia(def.mass, def.box),
      v = dt > 0 ? M.scale(M.sub(x, xp), 1 / dt) : [0, 0, 0],
      dq = qmul(q, qconj(qp)),
      w = dt > 0 ? M.scale(qvec(dq), 1 / dt) : [0, 0, 0];
    return Object.assign({}, def, { x, q, v, w, xp: x, qp: q, im: 1 / def.mass, ii: I.map(i => 1 / i) });
  });
  const body = { bodies, t: 0, rest: 0, still: 0, base: {} };
  // what each muscle holds: the child's turn on its parent as he went down
  body.hold = JOINTS.map(j => qmul(qconj(bodies[INDEX[j.parent]].q), bodies[INDEX[j.child]].q));
  // where each child hangs from its parent: its joint, in the parent's frame (from the T-pose: everything between is rigid)
  body.hang = JOINTS.map(j => M.sub(TPOSE[PIECES[INDEX[j.child]].joint], TPOSE[PIECES[INDEX[j.parent]].joint]));
  if (blow) {
    /* The shove the bout gave him is the speed of all of him; the blow itself lands on his head, and turns him: its
       momentum is taken out of the shove so that he goes, all told, as far as the shove says. */
    const M_all = PIECES.reduce((s, p) => s + p.mass, 0),
      push = !blow.push ? [0, 0, 0] : blow.push.length === 3 ? blow.push.slice() : [blow.push[0], 0, blow.push[1]],
      J = M.scale(blow.dir, blow.J || 0),
      base = M.sub(push, M.scale(J, 1 / M_all));
    for (const b of bodies) b.v = M.add(b.v, base);
    /* (it is put through the middle of his head and of his chest: the neck gives, so his head takes some of it and the
       rest reaches his trunk at once; how it turns him is how far those are off his body's line, ahead of his spine and
       above his hips, and not how it glanced off the head itself, which would spin the head alone) */
    for (const [name, local, share] of [['head', [0, 0.18, 0.02], HEAD_SHARE], ['chest', [0, 0.07, 0], 1 - HEAD_SHARE]]) {
      const b = bodies[INDEX[name]],
        r = M.sub(at(b, local), b.x),
        p = M.scale(J, share);
      b.v = M.add(b.v, M.scale(p, b.im));
      b.w = M.add(b.w, iw(b, cross(r, p)));
    }
  }
  return body;
}

/* How the child of joint j is turned on its parent, put inside its range: -> the rotation (a vector, in the world) that
   takes it from where it is to the nearest place inside, or null if it is inside. */
function limit(j, p, c) {
  const rel = qmul(qconj(p.q), c.q), // the child's frame in the parent's
    L = LIM[j.kind];
  const toWorld = v => qrot(p.q, v);
  if (j.kind === 'spine' || j.kind === 'neck' || j.kind === 'trunk') {
    /* swing and twist: the child's up tilted forward or back and to a side (kept inside those ranges), and turned about
       its own up (kept inside that) */
    const tq = qnorm([0, rel[1], 0, rel[3]]),
      tw = 2 * Math.atan2(tq[1], tq[3]) * DEG,
      up = qrot(rel, [0, 1, 0]),
      fwd = Math.atan2(up[2], up[1]) * DEG,
      sd = Math.atan2(up[0], up[1]) * DEG,
      f2 = clamp(fwd, L.fwd[0], L.fwd[1]),
      s2 = clamp(sd, -L.side, L.side),
      /* (the twist as the chest's own front is seen from the pelvis grows with the bend, by 1/cos of it: what is held is
         that) */
      most = Math.atan(Math.tan(L.twist * RAD) * Math.cos(f2 * RAD) * Math.cos(s2 * RAD)) * DEG,
      t2 = clamp(((tw + 540) % 360) - 180, -most, most);
    if (f2 === fwd && s2 === sd && Math.abs(t2 - (((tw + 540) % 360) - 180)) < 1e-9) return null;
    const u = unit([Math.tan(s2 * RAD), 1, Math.tan(f2 * RAD)]),
      ax = cross([0, 1, 0], u),
      swing = len(ax) > 1e-9 ? qaxis(unit(ax), Math.acos(clamp(u[1], -1, 1))) : [0, 0, 0, 1],
      want = qmul(swing, qaxis([0, 1, 0], t2 * RAD));
    return toWorld(qvec(qmul(want, qconj(rel))));
  }
  if (j.kind === 'elbow' || j.kind === 'knee') {
    // a hinge: about the parent's own axis (y for the elbow, x for the knee) and no other, and only so far, one way
    const axis = j.kind === 'elbow' ? [0, 1, 0] : [1, 0, 0],
      a = qrot(rel, axis),
      fix = cross(a, axis), // what turns the child's axis back onto the parent's
      sw = qmul(qaxis(unit(fix, [1, 0, 0]), Math.asin(clamp(len(fix), 0, 1))), rel),
      ang = qvec(sw),
      th = (j.kind === 'elbow' ? -j.sOf * ang[1] : ang[0]) * DEG, // the fold, positive
      t2 = clamp(th, 0, L.fold);
    let rot = M.scale(fix, Math.asin(clamp(len(fix), 0, 1)) / (len(fix) || 1));
    if (t2 !== th) rot = M.add(rot, M.scale(axis, ((j.kind === 'elbow' ? -j.sOf : 1) * (t2 - th)) * RAD));
    return len(rot) > 1e-6 ? toWorld(rot) : null;
  }
  // a ball: the bone's direction kept inside its cone, and its twist about itself
  const bone = j.kind === 'shoulder' ? [j.sOf, 0, 0] : [0, -1, 0],
    d = qrot(rel, bone);
  let dn = d.slice(),
    tw = null;
  if (j.kind === 'shoulder') {
    /* (where the shoulder lets the upper arm point, the table that the solver and the audit use: one raised past the most of
       its plane is let down in that plane to it; and turned about itself, the way its forearm bends, past what that
       elevation allows, turned back. Mirrored: x out, and a turn the other way for the right arm) */
    const z = qrot(rel, [0, 0, 1]),
      sh = shoulderOf([d[0] * j.sOf, d[1], d[2]], [z[0] * j.sOf, z[1], z[2]], L);
    if (sh.zone > 0) {
      const e = (sh.elev - sh.zone) * RAD,
        pl = sh.plane * RAD;
      dn = [Math.cos(pl) * Math.sin(e) * j.sOf, -Math.cos(e), Math.sin(pl) * Math.sin(e)];
    }
    if (sh.turned > 0) tw = toWorld(M.scale(d, -Math.sign(sh.twist) * j.sOf * sh.turned * RAD));
  } else if (j.kind === 'hip') {
    const m = [d[0] * j.sOf, d[1], d[2]];
    m[0] = clamp(m[0], -Math.sin(L.in * RAD), Math.sin(L.out * RAD));
    m[2] = Math.max(m[2], -Math.sin(L.behind * RAD));
    dn = unit([m[0] * j.sOf, m[1], m[2]]);
    // (and not folded up past the chest: forward, up to 120 degrees from hanging)
    if (Math.acos(clamp(dot(dn, [0, -1, 0]), -1, 1)) * DEG > L.up) {
      const h = unit([dn[0], 0, dn[2]], [0, 0, 1]),
        a = L.up * RAD;
      dn = [h[0] * Math.sin(a), -Math.cos(a), h[2] * Math.sin(a)];
    }
  } else if (j.kind === 'ankle') {
    // the shin as the foot sees it: rel turns the foot in the shin's frame, so the shin in the foot's is the inverse's
    const s = qrot(qconj(rel), [0, 1, 0]),
      up = Math.atan2(s[2], s[1]) * DEG,
      rl = Math.asin(clamp(s[0], -1, 1)) * DEG,
      u2 = clamp(up, -L.down, L.up),
      r2 = clamp(rl, -L.roll, L.roll);
    if (u2 === up && r2 === rl) return twist(rel, [0, 1, 0], L.twist, toWorld);
    const sn = unit([Math.sin(r2 * RAD), Math.cos(u2 * RAD) * Math.cos(r2 * RAD), Math.sin(u2 * RAD) * Math.cos(r2 * RAD)]),
      fix = cross(s, sn); // turning the shin (in the foot's frame) from s to sn is turning the foot the other way
    const a = Math.asin(clamp(len(fix), 0, 1));
    return toWorld(qrot(rel, M.scale(unit(fix), -a)));
  }
  const fix = cross(d, dn),
    a = Math.asin(clamp(len(fix), 0, 1)),
    swing = len(fix) > 1e-6 ? M.scale(unit(fix), a) : [0, 0, 0];
  if (j.kind !== 'shoulder') tw = twist(rel, bone, L.twist, toWorld);
  const out = M.add(toWorld(swing), tw || [0, 0, 0]);
  return len(out) > 1e-6 ? out : null;
}
// the twist of a relative turn about an axis (in the child's own terms), held within ±most degrees
function twist(rel, axis, most, toWorld) {
  const a = qrot(rel, axis),
    v = [rel[0], rel[1], rel[2]],
    proj = M.scale(a, dot(v, a)),
    t = qnorm([proj[0], proj[1], proj[2], rel[3]]),
    ang = qvec(t),
    th = dot(ang, a) * DEG,
    t2 = clamp(th, -most, most);
  return t2 === th ? null : toWorld(M.scale(a, (t2 - th) * RAD));
}

/* Which way a knee points round the leg's own line, from the front of the thigh (ahead of the pelvis when the leg hangs
   under it, up from it when the leg is out in front, down when it is out behind), as tools/audit.mjs measures it: the
   thigh turns in the hip only so far. Kept inside that by turning the thigh and the shin together about the line from hip
   to ankle (the ankle, on the line, stays where it is). */
const KNEE_WAY = [RANGE.kneeAzimuth[0] + 6, RANGE.kneeAzimuth[1] - 6];
/* (and only so much at a time, degrees a pass: what the knee's way is measured from swings round as the leg goes out in
   front or behind, so a leg can find itself well outside it in a step without having turned at all, and putting that right
   at once flings the leg) */
const KNEE_TURN = 0.5;
function kneeWay(bs, s) {
  const pelvis = bs[INDEX.pelvis],
    thigh = bs[INDEX[s + 'thigh']],
    shin = bs[INDEX[s + 'shin']],
    foot = bs[INDEX[s + 'foot']],
    hip = at(thigh, [0, 0, 0]),
    knee = at(shin, [0, 0, 0]),
    d = unit(M.sub(at(foot, [0, 0, 0]), hip)),
    off = M.sub(M.sub(knee, hip), M.scale(d, dot(M.sub(knee, hip), d)));
  if (len(off) < 0.04) return;
  const pz = qrot(pelvis.q, [0, 0, 1]),
    py = qrot(pelvis.q, [0, 1, 0]),
    px = M.scale(qrot(pelvis.q, [1, 0, 0]), s === 'L' ? 1 : -1),
    ahead = dot(d, pz),
    w = smooth((Math.abs(ahead) - 0.6) / 0.3),
    ref = M.add(M.scale(pz, 1 - w), M.scale(py, w * (ahead > 0 ? 1 : -1))),
    front = unit(M.sub(ref, M.scale(d, dot(ref, d)))),
    outward = unit(M.sub(px, M.scale(d, dot(px, d)))),
    a = Math.atan2(dot(off, outward), dot(off, front)) * DEG,
    a2 = clamp(a, KNEE_WAY[0], KNEE_WAY[1]);
  if (a2 === a) return;
  // (turning about d by +phi carries the front toward d x front, which is outward for the right leg and inward for the left)
  const phi = clamp((a2 - a) * 0.5, -KNEE_TURN, KNEE_TURN) * RAD * (dot(cross(d, front), outward) > 0 ? 1 : -1),
    rq = qaxis(d, phi);
  for (const b of [thigh, shin]) {
    b.x = M.add(hip, qrot(rq, M.sub(b.x, hip)));
    b.q = qnorm(qmul(rq, b.q));
  }
}

/* A joint found past its range is turned back by no more than this in one pass (radians), as Box2D caps its angular
   corrections: in an ordinary step it is a fraction of a degree past, and this never bites, but where contacts and other
   limits have shoved a joint well past in one go, or where a range is measured from something that has itself swung (an
   ankle's from the foot it turns), turning it all the way back in one pass makes a speed out of nothing and throws the
   body. */
const FIX_MOST = 3 * RAD;
const most = fix => {
  const a = len(fix);
  return a > FIX_MOST ? M.scale(fix, FIX_MOST / a) : fix;
};
// asleep: no piece of him further than this from where it was (metres: creeping at under 2 cm a second) for this long (seconds)
const SLEEP = { moved: 0.01, after: 0.5 };
// the energy of all of him: moving, turning and up off the canvas (joules)
function energy(bs) {
  let kin = 0,
    pot = 0;
  for (const b of bs) {
    const l = qrot(qconj(b.q), b.w);
    kin += 0.5 * (dot(b.v, b.v) / b.im + l[0] * l[0] / b.ii[0] + l[1] * l[1] / b.ii[1] + l[2] * l[2] / b.ii[2]);
    pot += (G * b.x[1]) / b.im;
  }
  return { kin, pot, total: kin + pot };
}
// how much of his muscles' hold on joint j is left at time t: all of it, and gone over its span
const tone = (j, t) => 1 - smooth((t - j.tone[0]) / (j.tone[1] - j.tone[0]));

export function stepFall(body, dt, obstacles) {
  if (dt <= 0) return body;
  // (asleep, he lies exactly as he came to rest, until the other man's legs come into him)
  if (body.asleep && !(obstacles && obstacles.some(([c, r]) => body.bodies.some(b => b.balls.some(([local, rb]) => len(M.sub(at(b, local), c)) < r + rb))))) {
    body.still += dt;
    return body;
  }
  body.asleep = false;
  const h = dt / STEPS,
    bs = body.bodies,
    pelvis = bs[INDEX.pelvis],
    chest = bs[INDEX.chest],
    head = bs[INDEX.head];
  for (let n = 0; n < STEPS; n++) {
    body.t += h;
    const before = energy(bs),
      touching = [], // contacts this step: [piece, its local point, normal, how fast that point was going along it]
      pressed = []; // a limb kept out of his own trunk or head this step: [limb, its local point, the other piece, normal]
    for (const b of bs) {
      b.v[1] -= G * h;
      b.xp = b.x.slice();
      b.qp = b.q.slice();
      b.x = M.add(b.x, M.scale(b.v, h));
      turnBy(b, M.scale(b.w, h));
    }
    // (put right three times over, each step: the joints, the limits and the contacts pull against each other)
    for (let pass = 0; pass < ITER; pass++) {
      // ---- the joints: each child's joint where its parent holds it, inside its range, held by what is left of his muscles
      JOINTS.forEach((j, k) => {
        const p = bs[INDEX[j.parent]],
          c = bs[INDEX[j.child]],
          rp = off(p, body.hang[k]),
          rc = off(c, [0, 0, 0]),
          gap = M.sub(M.add(c.x, rc), M.add(p.x, rp));
        positional(c, rc, p, rp, gap, 0, h);
        const w = tone(j, body.t);
        if (w > 0.001) {
          const rel = qmul(qconj(p.q), c.q),
            rot = qrot(p.q, qvec(qmul(body.hold[k], qconj(rel))));
          angular(c, p, rot, 1 / (j.stiff * w * w), h);
        }
        const fix = limit(Object.assign({ sOf: j.s === 'R' ? -1 : 1 }, j), p, c);
        if (fix) angular(c, p, most(fix), 0, h);
      });
      {
        const fix = limit({ kind: 'trunk' }, pelvis, chest);
        if (fix) angular(chest, pelvis, most(fix), 0, h);
      }
      for (const s of LIMB) kneeWay(bs, s);
      // ---- the canvas, which holds him up and grips him
      for (const b of bs)
        for (const [local, r] of b.balls) {
          const pnt = at(b, local);
          if (pnt[1] >= r) continue;
          const ro = M.sub(pnt, b.x),
            vn = b.v[1] + cross(b.w, ro)[1],
            depth = positional(b, ro, null, null, [0, pnt[1] - r, 0], 0, h);
          if (!pass) touching.push([b, local, [0, 1, 0], vn]);
          // (where that point was at the start of the step: what it has slid since is taken back, as far as the grip goes)
          const now = at(b, local),
            then = M.add(b.xp, qrot(b.qp, M.sub(local, b.com))),
            slid = [now[0] - then[0], 0, now[2] - then[2]],
            s = len(slid);
          if (s > 1e-9) positional(b, M.sub(now, b.x), null, null, M.scale(slid, Math.min(1, (MU * depth) / s)), 0, h);
        }
      // ---- his limbs out of his own trunk and head, and out of the other man
      // (the trunk's line runs from his hips to his chest, as tools/audit.mjs takes it)
      const spineLo = at(pelvis, [0, 0, 0]),
        spineHi = at(chest, [0, 0, 0]),
        line = M.sub(spineHi, spineLo),
        ll = dot(line, line),
        headC = at(head, [0, 0.18, 0.02]);
      for (const b of bs) {
        if (!b.limb) continue;
        for (const [local, r] of b.balls) {
          const pnt = at(b, local),
            k = clamp(dot(M.sub(pnt, spineLo), line) / ll, 0, 1),
            near = M.add(spineLo, M.scale(line, k)),
            glove = b.glove && r >= 0.1,
            keep = glove ? KEEP.glove : KEEP.limb + r,
            d = M.sub(pnt, near),
            dl = len(d),
            // (a thigh joins the trunk at the hip, and an upper arm at the shoulder: only their far ends are kept out)
            home = (b.leg && k < 0.25) || (b.name.endsWith('arm') && k > 0.8);
          if (!home && dl < keep) {
            const trunk = k < 0.2 ? pelvis : k < 0.6 ? bs[INDEX.belly] : chest;
            // (a glove all the way out at once; any other part of a limb so much a pass, so that a trunk landing on an arm
            // presses it out from under him rather than flinging it)
            positional(b, M.sub(pnt, b.x), trunk, M.sub(near, trunk.x), M.scale(unit(d, [1, 0, 0]), glove ? dl - keep : Math.max(dl - keep, -PRESS)), 0, h);
            pressed.push([b, local, trunk, unit(d, [1, 0, 0])]);
          }
          if (b.name.endsWith('fore')) {
            const p2 = at(b, local),
              dh = M.sub(p2, headC),
              l2 = len(dh),
              most = glove ? KEEP.head : KEEP.limb + r;
            if (l2 < most) positional(b, M.sub(p2, b.x), head, M.sub(headC, head.x), M.scale(unit(dh), l2 - most), 0, h), pressed.push([b, local, head, unit(dh)]);
          }
        }
      }
      /* (and the shoulders once more, after all that: a man who lands on his own arm does not have it shoved past where the
         shoulder lets it go, the canvas or his trunk making room for it instead) */
      JOINTS.forEach(j => {
        if (j.kind !== 'shoulder') return;
        const p = bs[INDEX[j.parent]],
          c = bs[INDEX[j.child]],
          fix = limit(Object.assign({ sOf: j.s === 'R' ? -1 : 1 }, j), p, c);
        if (fix) angular(c, p, fix, 0, h);
      });
      if (obstacles)
        for (const b of bs)
          for (const [local, r] of b.balls) {
            for (const [c, rr] of obstacles) {
              const pnt = at(b, local),
                d = M.sub(pnt, c),
                dl = len(d);
              if (dl < r + rr) {
                const n = unit(d),
                  ro = M.sub(pnt, b.x);
                if (!pass) touching.push([b, local, n, dot(M.add(b.v, cross(b.w, ro)), n)]);
                positional(b, ro, null, null, M.scale(n, dl - r - rr), 0, h);
              }
            }
          }
    }
    // ---- what that comes to: the velocities, a little damped (a limp body is not a spring)
    for (const b of bs) {
      b.v = M.scale(M.sub(b.x, b.xp), 1 / h);
      const dq = qmul(b.q, qconj(b.qp));
      b.w = M.scale(qvec(dq), 1 / h);
      const k = Math.exp(-h * DAMP.move);
      b.v = M.scale(b.v, k);
      b.w = M.scale(b.w, Math.exp(-h * DAMP.turn));
    }
    /* (a body that lands does not bounce off the canvas: what putting it back on top would add, it loses, and what it
       slides with, the grip takes, up to what the landing pressed into it) */
    for (const [b, local, n, before] of touching) {
      const r = off(b, local),
        vp = M.add(b.v, cross(b.w, r)),
        vn = dot(vp, n),
        want = Math.max(0, -0 * before),
        dvn = want - vn;
      const vt = M.sub(vp, M.scale(n, vn)),
        st = len(vt),
        grip = Math.min(st, MU * Math.max(0, -before) * 0.5 + MU * Math.max(0, -dvn));
      let dv = dvn < 0 ? M.scale(n, dvn) : [0, 0, 0];
      if (st > 1e-9) dv = M.sub(dv, M.scale(vt, grip / st));
      const dl = len(dv);
      if (dl < 1e-9) continue;
      const d = M.scale(dv, 1 / dl),
        p = M.scale(d, dl / wPos(b, r, d));
      b.v = M.add(b.v, M.scale(p, b.im));
      b.w = M.add(b.w, iw(b, cross(r, p)));
    }
    /* (nor does a limb pushed out of his trunk or head spring off it: what they part with, beyond what keeping them apart
       took, each loses; a body folded up on itself otherwise winds itself up against its own joints and throws itself off
       the canvas) */
    for (const [b, local, o, n] of pressed) {
      const pnt = at(b, local),
        rb = M.sub(pnt, b.x),
        ro = M.sub(pnt, o.x),
        vn = dot(M.sub(M.add(b.v, cross(b.w, rb)), M.add(o.v, cross(o.w, ro))), n);
      if (vn <= 0) continue;
      const p = M.scale(n, -vn / (wPos(b, rb, n) + wPos(o, ro, n)));
      b.v = M.add(b.v, M.scale(p, b.im));
      b.w = M.add(b.w, iw(b, cross(rb, p)));
      o.v = M.sub(o.v, M.scale(p, o.im));
      o.w = M.sub(o.w, iw(o, cross(ro, p)));
    }
    // (and each joint's turning damped toward its parent's: soft tissue)
    for (const j of JOINTS) {
      const p = bs[INDEX[j.parent]],
        c = bs[INDEX[j.child]],
        dw = M.sub(c.w, p.w),
        s = len(dw);
      if (s < 1e-6) continue;
      const n = M.scale(dw, 1 / s),
        w = wRot(c, n) + wRot(p, n),
        imp = M.scale(n, (s * Math.min(1, (j.kind === 'shoulder' || j.kind === 'elbow' ? DAMP.arm : DAMP.joint) * h)) / w);
      c.w = M.sub(c.w, iw(c, imp));
      p.w = M.add(p.w, iw(p, imp));
      if (j.kind === 'shoulder') {
        const a = qrot(c.q, [j.s === 'R' ? -1 : 1, 0, 0]),
          t = dot(M.sub(c.w, p.w), a),
          r = M.scale(a, (t * Math.min(1, DAMP.roll * h)) / (wRot(c, a) + wRot(p, a)));
        c.w = M.sub(c.w, iw(c, r));
        p.w = M.add(p.w, iw(p, r));
      }
    }
    /* (and a limp body has nothing in it to give it energy: what the corrections above add, where contacts, limits and
       joints pull against each other in a body heaped up on itself, is taken back, all of him slowed alike) */
    const after = energy(bs);
    if (after.total > before.total + 1e-3) {
      const k = Math.sqrt(Math.max(0, before.total - after.pot) / Math.max(after.kin, 1e-9));
      for (const b of bs) (b.v = M.scale(b.v, k)), (b.w = M.scale(b.w, k));
    }
  }
  // how long he has lain still (his middle hardly moving)
  const v = len(bs[INDEX.belly].v) + 0.3 * len(bs[INDEX.belly].w);
  body.still = v < 0.05 ? body.still + dt : 0;
  /* and once no part of him has got anywhere for a while, he is let stop: a body heaped up on itself, held together by
     corrections that each put a little of it right, otherwise trembles on the spot and creeps by fractions of a millimetre
     a frame for as long as he lies there (rigid-body engines put such a body to sleep for the same reason) */
  if (!body.calm || bs.some((b, i) => len(M.sub(b.x, body.calm.at[i])) > SLEEP.moved)) body.calm = { at: bs.map(b => b.x.slice()), t: 0 };
  else body.calm.t += dt;
  if (body.calm.t > SLEEP.after) {
    body.asleep = true;
    for (const b of bs) (b.v = [0, 0, 0]), (b.w = [0, 0, 0]);
  }
  return body;
}

/* His pose, as the renderer and the bout take it: each joint's turn from the piece that carries it (the belly's two joints
   share its turn), his hips where his pelvis is. Breathing is put on top, a little lift of the chest and the head away from
   the canvas and a slow turn of the head, so that a man lying there is never a picture of one. */
export function poseOf(body, clock, breath) {
  const bs = body.bodies,
    G2 = {};
  for (const name of NAMES) {
    const b = bs[INDEX[OWNER[name] || 'pelvis']];
    G2[name] = qToM3(b.q);
  }
  const rot = {};
  for (const name of NAMES) rot[name] = PARENT[name] ? M.mul(M.tr(G2[PARENT[name]]), G2[name]) : G2[name];
  const pelvis = bs[INDEX.pelvis],
    hips = M.sub(pelvis.x, qrot(pelvis.q, pelvis.com));
  if (breath) {
    // (about an axis that lifts the part away from the canvas whichever way he lies)
    const k = breath,
      b = Math.sin(2 * Math.PI * 1.3 * clock),
      slow = Math.sin(2 * Math.PI * 0.37 * clock + 0.6),
      lift = (joint, child, angle) => {
        const F = fk({ root: M.sub(hips, TPOSE.Hips), rot }),
          dir = unit(M.sub(F.p[child], F.p[joint])),
          a = unit(cross(dir, [0, 1, 0]), [1, 0, 0]),
          local = M.app(M.tr(F.R[joint]), a);
        rot[joint] = M.mul(rot[joint], qToM3(qaxis(unit(local), angle)));
      };
    lift('Spine2', 'Neck1', (1.2 + 1.2 * b + 0.5 + 0.5 * slow) * RAD * k);
    lift('Neck1', 'Head', (3 + 3 * slow + 2 - 2 * b) * RAD * k);
    rot.Head = M.mul(rot.Head, M.ry(5 * Math.sin(2 * Math.PI * 0.23 * clock) * k));
  }
  const pose = { root: M.sub(hips, TPOSE.Hips), rot, stretch: 1 },
    F = fk(pose);
  pose.at = F.p;
  pose.head = M.add(F.p.Head, M.app(F.R.Head, HEAD));
  pose.round = { L: null, R: null };
  return pose;
}

// how he has come to rest: on his back, his front or a side (and which), from which way his chest faces
export function lyingOf(body) {
  const bs = body.bodies,
    chest = bs[INDEX.chest],
    face = qrot(chest.q, [0, 0, 1]),
    left = qrot(chest.q, [1, 0, 0]),
    pelvis = bs[INDEX.pelvis],
    hips = M.sub(pelvis.x, qrot(pelvis.q, pelvis.com)),
    head = at(bs[INDEX.head], [0, 0.18, 0.02]);
  const on = face[1] > 0.55 ? 'back' : face[1] < -0.55 ? 'front' : 'side';
  return { on, down: left[1] > 0 ? 'R' : 'L', hips, head };
}

// carry him into another frame of his own: p' = R p + off (R a 3x3 turn about the vertical)
export function moveFall(body, Rm, offset) {
  const q = qFromM3(Rm);
  for (const b of body.bodies) {
    b.x = M.add(M.app(Rm, b.x), offset);
    b.xp = M.add(M.app(Rm, b.xp), offset);
    b.q = qnorm(qmul(q, b.q));
    b.qp = qnorm(qmul(q, b.qp));
    b.v = M.app(Rm, b.v);
    b.w = M.app(Rm, b.w);
  }
  return body;
}
