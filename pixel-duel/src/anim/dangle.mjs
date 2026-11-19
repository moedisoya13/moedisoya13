/* Things that hang and are left behind: the tied hair and the two lengths of the scarf. Each is a bone that would ride its
   parent rigidly; instead its far end is a weight on a spring, pulled toward where the parent would carry it and slow to get
   there, so it trails a lunge, swings past when the body stops and settles. Worked out in the world, after the pose, straight
   on the bone matrices the renderer is about to be given.
     const dangle = createDangle(bind)      bind: fk() of the sculpting pose
     dangle.apply(mats, dt)                 mats: boneMatrices() output (twelve numbers a joint), changed in place */
import * as M from '../rig/m3.mjs';
import { NAMES, PARENT } from '../rig/skeleton.mjs';

// joint, and the bone's reach from it in the T-pose's axes (metres); parents before children.
// hang: how much it would rather point straight down than where its parent carries it (cloth more than tied hair)
export const DANGLES = [
  { joint: 'Tail', reach: [0, -0.12, -0.07], stiff: 170, damp: 11, hang: 0.15 },
  { joint: 'Scarf1', reach: [0, -0.2, -0.07], stiff: 120, damp: 8, hang: 0.3 },
  { joint: 'Scarf2', reach: [0, -0.2, -0.03], stiff: 90, damp: 7, hang: 0.45 }
];
const GRAVITY = [0, -4, 0];
const len = a => Math.hypot(a[0], a[1], a[2]);
// the least turn that carries unit direction a onto unit direction b
function turn(a, b) {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.9999) return M.id();
  const k = 1 / (1 + c);
  return [
    c + k * v[0] * v[0], k * v[0] * v[1] - v[2], k * v[0] * v[2] + v[1],
    k * v[0] * v[1] + v[2], c + k * v[1] * v[1], k * v[1] * v[2] - v[0],
    k * v[0] * v[2] - v[1], k * v[1] * v[2] + v[0], c + k * v[2] * v[2]
  ];
}

export function createDangle(bind) {
  const bones = DANGLES.map(d => ({
    ...d,
    at: NAMES.indexOf(d.joint) * 12,
    parent: NAMES.indexOf(PARENT[d.joint]) * 12,
    // the bone as sculpted: where it starts and which way it reaches, in the space the splats were made in
    from: bind.p[d.joint],
    rest: M.app(bind.R[PARENT[d.joint]], d.reach),
    tip: null,
    vel: [0, 0, 0]
  }));
  return {
    apply(mats, dt) {
      dt = Math.min(dt, 1 / 30);
      for (const b of bones) {
        const R = Array.from(mats.subarray(b.parent, b.parent + 9)),
          move = [mats[b.parent + 9], mats[b.parent + 10], mats[b.parent + 11]],
          base = M.add(M.app(R, b.from), move),
          carried = M.app(R, b.rest), // where the parent alone would point it
          reach = len(carried),
          aim = M.add(M.scale(carried, (1 - b.hang) / reach), [0, -b.hang, 0]),
          want = M.add(base, M.scale(aim, reach / (len(aim) || 1)));
        if (!b.tip || len(M.sub(want, b.tip)) > 0.9) {
          // first frame, or the figure was put somewhere else: start at rest there
          b.tip = want;
          b.vel = [0, 0, 0];
        }
        if (dt > 0) {
          const acc = M.add(M.sub(M.scale(M.sub(want, b.tip), b.stiff), M.scale(b.vel, b.damp)), GRAVITY);
          b.vel = M.add(b.vel, M.scale(acc, dt));
          b.tip = M.add(b.tip, M.scale(b.vel, dt));
        }
        // it is a length of hair or cloth, not elastic: keep the far end the bone's length from the near one
        const out = M.sub(b.tip, base),
          l = len(out) || 1;
        b.tip = M.add(base, M.scale(out, reach / l));
        const Rb = M.mul(turn(M.scale(carried, 1 / reach), M.scale(out, 1 / l)), R),
          to = M.sub(base, M.app(Rb, b.from));
        mats.set(Rb, b.at);
        mats.set(to, b.at + 9);
      }
    }
  };
}
