/* A stance, said the way a coach would say it, turned into joint rotations. Everything the boxer does is described this way
   and solved again every frame, so a planted foot stays planted and a fist goes exactly where it is sent.
   In the boxer's own space (origin on the canvas under him, +Z ahead, +X to his left, metres):
     { hips: [x, y, z],
       spine: { Hips, Spine1, Spine2, Chest, Neck1, Head: [x, y, z] degrees },
       feet:  { L | R: { at: [x, y, z] (the ankle: 0.09 high when flat), yaw, pitch, pole } },
       hands: { L | R: { at: [x, y, z] (the wrist), pole: where the elbow points } },
       stretch }
   solve(stance) -> { root, rot: { Joint: 3x3 local }, stretch, at: { Joint: where it is, in his space } }. */
import * as M from './m3.mjs';
import { NAMES, PARENT, TPOSE } from './skeleton.mjs';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = (a, fallback) => {
  const l = len(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : fallback || [0, 1, 0];
};
const reject = (v, d) => M.sub(v, M.scale(d, dot(v, d)));
const fromCols = (c0, c1, c2) => [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
const dist = (a, b) => len(M.sub(a, b));

/* The middle joint of a two-bone limb. A target past the limb's length is brought back onto it, but softly: the last few
   centimetres of reach are approached, never hit, so a fully thrown punch does not lock the elbow with a click. */
function twoBone(a, target, l1, l2, pole) {
  const v = M.sub(target, a),
    d = len(v),
    full = l1 + l2,
    soft = 0.035,
    knee = full - soft,
    want = Math.max(Math.abs(l1 - l2) + 1e-3, d <= knee ? d : knee + soft * (1 - Math.exp(-(d - knee) / soft)) - 1e-3),
    dir = norm(v, [0, -1, 0]),
    along = (l1 * l1 - l2 * l2 + want * want) / (2 * want),
    out = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    sideways = norm(reject(pole, dir), norm(reject([0, 0, 1], dir), [1, 0, 0]));
  return { mid: M.add(M.add(a, M.scale(dir, along)), M.scale(sideways, out)), end: M.add(a, M.scale(dir, want)) };
}

export const LEN = {
  upperArm: dist(TPOSE.LeftForeArm, TPOSE.LeftArm),
  foreArm: dist(TPOSE.LeftHand, TPOSE.LeftForeArm),
  thigh: dist(TPOSE.LeftShin, TPOSE.LeftLeg),
  shin: dist(TPOSE.LeftFoot, TPOSE.LeftShin)
};
const SPINE = ['Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Head', 'LeftShoulder', 'RightShoulder'];

export function solve(stance) {
  const spine = stance.spine || {},
    G = {},
    P = {},
    rot = {};
  const place = (name, local) => {
    const parent = PARENT[name];
    rot[name] = local;
    G[name] = parent ? M.mul(G[parent], local) : local;
    P[name] = parent ? M.add(P[parent], M.app(G[parent], M.sub(TPOSE[name], TPOSE[parent]))) : stance.hips;
  };
  const aim = (name, world) => place(name, M.mul(M.tr(G[PARENT[name]]), world));
  for (const name of SPINE) place(name, M.euler(spine[name] || [0, 0, 0]));

  for (const side of ['L', 'R']) {
    const Side = side === 'L' ? 'Left' : 'Right',
      s = side === 'L' ? 1 : -1;
    // arm: the bones run along their own X, outward, and the elbow folds about their Y
    const hand = stance.hands[side];
    place(Side + 'Arm', M.id());
    const shoulder = P[Side + 'Arm'],
      pole = hand.pole || [s * 0.4, -1, -0.3],
      arm = twoBone(shoulder, hand.at, LEN.upperArm, LEN.foreArm, pole),
      d1 = norm(M.sub(arm.mid, shoulder)),
      d2 = norm(M.sub(arm.end, arm.mid));
    let fold = cross(d2, d1);
    fold = len(fold) < 1e-4 ? norm(cross(norm(reject(pole, d1)), d1)) : norm(fold);
    fold = M.scale(fold, s);
    const x1 = M.scale(d1, s),
      x2 = M.scale(d2, s);
    aim(Side + 'Arm', fromCols(x1, fold, cross(x1, fold)));
    aim(Side + 'ForeArm', fromCols(x2, fold, cross(x2, fold)));
    place(Side + 'Hand', M.id());

    // leg: the bones run down their own -Y, and the knee folds about their X
    const foot = stance.feet[side];
    place(Side + 'Leg', M.id());
    const hip = P[Side + 'Leg'],
      yaw = M.ry(foot.yaw || 0),
      kneeTo = foot.pole || M.app(yaw, [0, 0.1, 1]),
      leg = twoBone(hip, foot.at, LEN.thigh, LEN.shin, kneeTo),
      t1 = norm(M.sub(leg.mid, hip)),
      t2 = norm(M.sub(leg.end, leg.mid));
    let hinge = cross(t1, t2);
    hinge = len(hinge) < 1e-4 ? norm(cross(norm(reject(kneeTo, t1)), t1)) : norm(hinge);
    const y1 = M.scale(t1, -1),
      y2 = M.scale(t2, -1);
    aim(Side + 'Leg', fromCols(hinge, y1, cross(hinge, y1)));
    aim(Side + 'Shin', fromCols(hinge, y2, cross(hinge, y2)));
    aim(Side + 'Foot', M.mul(yaw, M.rx(foot.pitch || 0)));
    place(Side + 'ToeBase', M.rx(-(foot.pitch || 0) * 0.8)); // the toes stay on the canvas when the heel lifts
  }
  for (const name of NAMES) if (!rot[name]) place(name, M.id());
  return { root: M.sub(stance.hips, TPOSE.Hips), rot, stretch: stance.stretch || 1, at: P };
}
