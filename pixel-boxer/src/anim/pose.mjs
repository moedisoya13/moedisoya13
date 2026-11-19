/* From a pose to what the renderer draws with: the rest-to-pose transform of every joint, twelve numbers each (a 3x3 by rows,
   then the move). `bind` is fk() of the pose the boxer was sculpted in; `place` puts him on the canvas: { R, p }.
   Stretch scales him about the ground under him, thinner as he gets taller. */
import * as M from '../rig/m3.mjs';
import { NAMES, fk } from '../rig/skeleton.mjs';

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
// a point given in the boxer's own space, where it is on the canvas
export const toWorld = (place, p, stretch) => {
  const s = stretch || 1,
    w = 1 / Math.sqrt(s);
  return M.add(M.app(place.R, [p[0] * w, p[1] * s, p[2] * w]), place.p);
};
