/* The fighter's skeleton. Joint names and hierarchy are a subset of the SOMA 30-joint skeleton that Kimodo generates on
   (kimodo/skeleton/definitions.py, SOMASkeleton30), so a generated clip's local rotations can drive it joint for joint.
   Units are metres, Y is up, the figure faces +Z and its left side is +X: Kimodo's own convention.
   The table is the T-pose. A pose is { root: [dx, dy, dz], rot: { Joint: [x, y, z] degrees | 3x3 } }; root moves the hips
   from where they are in the T-pose, and every rotation is local to the joint's parent. */
import * as M from './m3.mjs';

const side = (name, parent, p) => [
  ['Left' + name, parent.replace('@', 'Left'), p],
  ['Right' + name, parent.replace('@', 'Right'), [-p[0], p[1], p[2]]]
];
const JOINTS = [
  ['Hips', null, [0, 0.93, 0]],
  ['Spine1', 'Hips', [0, 1.03, 0]],
  ['Spine2', 'Spine1', [0, 1.14, 0]],
  ['Chest', 'Spine2', [0, 1.26, 0]],
  ['Neck1', 'Chest', [0, 1.43, 0]],
  ['Head', 'Neck1', [0, 1.51, 0]],
  ...side('Shoulder', 'Chest', [0.05, 1.39, 0]),
  ...side('Arm', '@Shoulder', [0.19, 1.39, 0]),
  ...side('ForeArm', '@Arm', [0.45, 1.39, 0]),
  ...side('Hand', '@ForeArm', [0.69, 1.39, 0]),
  ...side('Leg', 'Hips', [0.11, 0.9, 0]),
  ...side('Shin', '@Leg', [0.11, 0.5, 0]),
  ...side('Foot', '@Shin', [0.11, 0.09, 0]),
  ...side('ToeBase', '@Foot', [0.11, 0.03, 0.13]),
  /* not a SOMA joint: the sword rides the right hand. With the palm down in the T-pose the grip runs front to back and the
     blade leaves the thumb side, toward +Z. */
  ['Sword', 'RightHand', [-0.75, 1.39, 0]]
];

const NAMES = JOINTS.map(j => j[0]);
const PARENT = Object.fromEntries(JOINTS.map(j => [j[0], j[1]]));
const TPOSE = Object.fromEntries(JOINTS.map(j => [j[0], j[2]]));
for (const [name, parent] of JOINTS)
  if (parent && NAMES.indexOf(parent) > NAMES.indexOf(name)) throw new Error(`${name} is listed before its parent ${parent}`);

const asMatrix = r => (!r ? M.id() : r.length === 9 ? r : M.euler(r));

/* Forward kinematics: -> { R: { Joint: world 3x3 }, p: { Joint: world position } }. */
function fk(pose) {
  pose = pose || {};
  const rot = pose.rot || {},
    R = {},
    p = {};
  for (const name of NAMES) {
    const parent = PARENT[name],
      local = asMatrix(rot[name]);
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

export { JOINTS, NAMES, PARENT, TPOSE, fk, asMatrix };
