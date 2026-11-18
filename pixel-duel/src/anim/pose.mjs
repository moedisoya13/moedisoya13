/* What is done to finished poses ({ root, rot: { Joint: 3x3 local }, stretch }): blending two of them, and the two edits that
   turn smooth generated motion into something with weight (see FEEL.md). */
import * as M from '../rig/m3.mjs';
import * as Q from './quat.mjs';
import { NAMES, PARENT, fk } from '../rig/skeleton.mjs';

export function blend(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const rot = {};
  for (const name of NAMES) rot[name] = Q.toM3(Q.slerp(Q.fromM3(a.rot[name]), Q.fromM3(b.rot[name]), t));
  return { root: M.lerp(a.root, b.root, t), rot, stretch: a.stretch + (b.stretch - a.stretch) * t };
}

const TORSO = ['Spine1', 'Spine2', 'Chest'];
const KEEP = ['Neck1', 'LeftShoulder', 'RightShoulder']; // what hangs off the chest and must go on pointing where it did
/* Twist and lean of the waist and chest multiplied by k, with the head and both arms left pointing exactly where they were:
   the body commits further to the move while the sword keeps its line. */
export function exaggerateTorso(pose, k) {
  if (k === 1) return pose;
  const before = fk(pose),
    rot = Object.assign({}, pose.rot);
  for (const name of TORSO) rot[name] = Q.toM3(Q.power(Q.fromM3(pose.rot[name]), k));
  const after = fk({ root: pose.root, rot });
  for (const name of KEEP) rot[name] = M.mul(M.tr(after.R[PARENT[name]]), before.R[name]);
  return { root: pose.root, rot, stretch: pose.stretch };
}

/* The rest-to-pose transform of every joint, twelve numbers each (a 3x3 by rows, then the move): what the splat renderer wants.
   `bind` is fk() of the pose the figure was sculpted in. `place` puts the whole figure in the world: { R: 3x3, p: [x, y, z] }
   (R may mirror). Stretch scales the figure about the ground under it, thinner as it gets taller. */
export function boneMatrices(pose, bind, place, out, offset) {
  const now = fk(pose),
    s = pose.stretch || 1,
    w = 1 / Math.sqrt(s),
    PR = place ? place.R : M.id(),
    pp = place ? place.p : [0, 0, 0],
    squash = M.mul(PR, [w, 0, 0, 0, s, 0, 0, 0, w]);
  out = out || new Float32Array(NAMES.length * 12);
  offset = offset || 0;
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i],
      R = M.mul(squash, M.mul(now.R[name], M.tr(bind.R[name]))),
      to = M.add(M.app(squash, now.p[name]), pp),
      from = bind.p[name],
      k = offset + i * 12;
    for (let j = 0; j < 9; j++) out[k + j] = R[j];
    out[k + 9] = to[0] - (R[0] * from[0] + R[1] * from[1] + R[2] * from[2]);
    out[k + 10] = to[1] - (R[3] * from[0] + R[4] * from[1] + R[5] * from[2]);
    out[k + 11] = to[2] - (R[6] * from[0] + R[7] * from[1] + R[8] * from[2]);
  }
  return out;
}
