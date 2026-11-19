/* The boxer's skeleton: a subset of the SOMA 30-joint skeleton Kimodo generates on, with the same names, hierarchy and axes
   (metres, Y up, facing +Z, left side +X, every joint at the identity in the T-pose), so generated motion can drive it joint
   for joint. A pose is { root: [dx, dy, dz], rot: { Joint: 3x3 local }, stretch }. */
import * as M from './m3.mjs';

const side = (name, parent, p) => [
  ['Left' + name, parent.replace('@', 'Left'), p],
  ['Right' + name, parent.replace('@', 'Right'), [-p[0], p[1], p[2]]]
];
const JOINTS = [
  ['Hips', null, [0, 0.95, 0]],
  ['Spine1', 'Hips', [0, 1.05, 0]],
  ['Spine2', 'Spine1', [0, 1.17, 0]],
  ['Chest', 'Spine2', [0, 1.29, 0]],
  ['Neck1', 'Chest', [0, 1.47, 0]],
  ['Head', 'Neck1', [0, 1.55, 0]],
  ...side('Shoulder', 'Chest', [0.06, 1.43, 0]),
  ...side('Arm', '@Shoulder', [0.21, 1.43, 0]),
  ...side('ForeArm', '@Arm', [0.49, 1.43, 0]),
  ...side('Hand', '@ForeArm', [0.74, 1.43, 0]),
  ...side('Leg', 'Hips', [0.11, 0.92, 0]),
  ...side('Shin', '@Leg', [0.11, 0.5, 0]),
  ...side('Foot', '@Shin', [0.11, 0.09, 0]),
  ...side('ToeBase', '@Foot', [0.11, 0.03, 0.13])
];
const NAMES = JOINTS.map(j => j[0]);
const PARENT = Object.fromEntries(JOINTS.map(j => [j[0], j[1]]));
const TPOSE = Object.fromEntries(JOINTS.map(j => [j[0], j[2]]));

function fk(pose) {
  const rot = pose.rot || {},
    R = {},
    p = {};
  for (const name of NAMES) {
    const parent = PARENT[name],
      local = rot[name] || M.id();
    if (!parent) {
      R[name] = local;
      p[name] = M.add(TPOSE[name], pose.root || [0, 0, 0]);
    } else {
      R[name] = M.mul(R[parent], local);
      p[name] = M.add(p[parent], M.app(R[parent], M.sub(TPOSE[name], TPOSE[parent])));
    }
  }
  return { R, p };
}
export { JOINTS, NAMES, PARENT, TPOSE, fk };
