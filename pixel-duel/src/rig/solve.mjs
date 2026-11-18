/* Poses written the way an animator blocks them, turned into joint rotations.
   A stance says where things are, in the figure's own space (origin on the ground under it, +Z ahead, +X to its left, metres):
     { hips: [x, y, z],                       where the hip joint is (0.93 high standing straight)
       spine: { Hips, Spine1, Spine2, Chest, Neck1, Head, LeftShoulder, RightShoulder: [x, y, z] degrees },
       feet:  { L | R: { at: [x, y, z] (the ankle; 0.09 high when flat), yaw, pitch (degrees), pole: knee direction } },
       hands: { L | R: { at: [x, y, z] (the wrist), pole: elbow direction, blade: [x, y, z] (right hand: where the blade points),
                         edge: [x, y, z] (which way its cutting edge faces) } },
       stretch: 1 }                           the whole figure taller and thinner (over 1) or squashed (under 1), volume kept
   solve(stance) -> { root, rot: { Joint: 3x3 local }, stretch }: the same shape of pose a generated clip supplies, so hand-written
   stances and Kimodo motion go through one path afterwards. Limbs are two-bone reaches, so a planted foot stays planted
   whatever the hips do. */
import * as M from './m3.mjs';
import { NAMES, PARENT, TPOSE } from './skeleton.mjs';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = (a, fallback) => {
  const l = len(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : fallback || [0, 1, 0];
};
const reject = (v, d) => M.sub(v, M.scale(d, dot(v, d))); // the part of v square to the unit direction d
const fromCols = (c0, c1, c2) => [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
const dist = (a, b) => len(M.sub(a, b));

// Where the middle joint of a two-bone limb goes, bending toward `pole`. A target out of reach is brought back onto the limb's length.
function twoBone(a, target, l1, l2, pole) {
  let v = M.sub(target, a),
    d = len(v);
  const far = l1 + l2 - 1e-3,
    near = Math.abs(l1 - l2) + 1e-3,
    want = Math.min(far, Math.max(near, d));
  const dir = norm(v, [0, -1, 0]);
  if (want !== d) {
    target = M.add(a, M.scale(dir, want));
    d = want;
  }
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    out = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    side = norm(reject(pole, dir), norm(reject([0, 0, 1], dir), [1, 0, 0]));
  return { mid: M.add(M.add(a, M.scale(dir, along)), M.scale(side, out)), end: target };
}

const LEN = {
  upperArm: dist(TPOSE.LeftForeArm, TPOSE.LeftArm),
  foreArm: dist(TPOSE.LeftHand, TPOSE.LeftForeArm),
  thigh: dist(TPOSE.LeftShin, TPOSE.LeftLeg),
  shin: dist(TPOSE.LeftFoot, TPOSE.LeftShin)
};
const SPINE = ['Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Head', 'LeftShoulder', 'RightShoulder'];
const DEFAULT_HAND = { L: { at: [0.32, 0.95, -0.12] }, R: { at: [-0.3, 0.95, 0.1], blade: [0, 0.3, 1] } };
const DEFAULT_FOOT = { L: { at: [0.11, 0.09, 0] }, R: { at: [-0.11, 0.09, 0] } };

function solve(stance) {
  stance = stance || {};
  const hips = stance.hips || TPOSE.Hips,
    spine = stance.spine || {},
    G = {},
    P = {},
    rot = {};
  const place = (name, local) => {
    const parent = PARENT[name];
    rot[name] = local;
    G[name] = parent ? M.mul(G[parent], local) : local;
    P[name] = parent ? M.add(P[parent], M.app(G[parent], M.sub(TPOSE[name], TPOSE[parent]))) : hips;
  };
  // a joint given its world rotation: its local one is whatever its parent leaves over
  const aim = (name, world) => place(name, M.mul(M.tr(G[PARENT[name]]), world));
  for (const name of SPINE) place(name, M.euler(spine[name] || [0, 0, 0]));

  for (const side of ['L', 'R']) {
    const Side = side === 'L' ? 'Left' : 'Right',
      s = side === 'L' ? 1 : -1;
    // ---- arm: the bones run along their own X, outward, and the elbow folds about their Y
    const hand = Object.assign({}, DEFAULT_HAND[side], stance.hands && stance.hands[side]);
    place(Side + 'Arm', M.id());
    const shoulder = P[Side + 'Arm'],
      arm = twoBone(shoulder, hand.at, LEN.upperArm, LEN.foreArm, hand.pole || [s * 0.35, -1, -0.6]),
      d1 = norm(M.sub(arm.mid, shoulder)),
      d2 = norm(M.sub(arm.end, arm.mid));
    let fold = norm(cross(d2, d1), null);
    if (len(cross(d2, d1)) < 1e-4) fold = norm(cross(norm(reject(hand.pole || [s * 0.35, -1, -0.6], d1)), d1));
    fold = M.scale(fold, s); // the left elbow folds forward about -Y, the right about +Y: one sign for both once mirrored
    const x1 = M.scale(d1, s),
      x2 = M.scale(d2, s);
    aim(Side + 'Arm', fromCols(x1, fold, cross(x1, fold)));
    aim(Side + 'ForeArm', fromCols(x2, fold, cross(x2, fold)));
    if (hand.blade) {
      const z = norm(hand.blade),
        guide = hand.edge ? cross(norm(hand.edge), z) : x2,
        x = norm(reject(guide, z), norm(reject(fold, z)));
      aim(Side + 'Hand', fromCols(x, cross(z, x), z));
    } else place(Side + 'Hand', M.id());

    // ---- leg: the bones run down their own -Y, and the knee folds about their X
    const foot = Object.assign({}, DEFAULT_FOOT[side], stance.feet && stance.feet[side]);
    place(Side + 'Leg', M.id());
    const hip = P[Side + 'Leg'],
      yaw = M.ry(foot.yaw || 0),
      leg = twoBone(hip, foot.at, LEN.thigh, LEN.shin, foot.pole || M.app(yaw, [0, 0.1, 1])),
      t1 = norm(M.sub(leg.mid, hip)),
      t2 = norm(M.sub(leg.end, leg.mid));
    let hinge = norm(cross(t1, t2), null);
    if (len(cross(t1, t2)) < 1e-4) hinge = norm(cross(norm(reject(foot.pole || M.app(yaw, [0, 0.1, 1]), t1)), t1));
    const y1 = M.scale(t1, -1),
      y2 = M.scale(t2, -1);
    aim(Side + 'Leg', fromCols(hinge, y1, cross(hinge, y1)));
    aim(Side + 'Shin', fromCols(hinge, y2, cross(hinge, y2)));
    aim(Side + 'Foot', M.mul(yaw, M.rx(foot.pitch || 0)));
    place(Side + 'ToeBase', M.rx(-(foot.pitch || 0) * 0.8)); // the toes stay on the ground when the heel lifts
  }
  place('Sword', M.id());
  for (const name of NAMES) if (!rot[name]) throw new Error('No rotation was solved for ' + name);
  return { root: M.sub(hips, TPOSE.Hips), rot, stretch: stance.stretch || 1 };
}

export { solve, twoBone, LEN };
