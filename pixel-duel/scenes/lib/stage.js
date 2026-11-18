'use strict';
// What every review scene shares: a disc of ground, the swordsman sculpted in his bind stance, and a pose(t) that drives him.
const { fk, NAMES } = require('../../src/rig/skeleton.mjs');
const { PALETTE, MAT, sculptSwordsman } = require('../../src/rig/swordsman.mjs');
const { BIND } = require('../../src/rig/poses.mjs');
const { boneMatrices } = require('../../src/anim/pose.mjs');

function buildStage({ makeBuilder, makeSculpt, KIT: K }, seed, o) {
  o = o || {};
  const B = makeBuilder(seed, PALETTE);
  const S = K.sculpt(makeSculpt(B));
  S.sun = B.norm([0.5, 0.8, 0.35]); // from the figure's left, the side the camera is on
  S.aoR = 0.07;
  S.aoK = 1.3;
  if (o.ground !== false) {
    S.ground(MAT.ground, { rad: o.rad || 1.6, res: 0.06 });
    S.bake();
  }
  const rig = K.creature(B, S);
  for (const name of NAMES) rig.bone(name); // bone i + 1 is joint i, whatever order the solids come in
  const bind = fk(BIND);
  sculptSwordsman(S, bind);
  S.bake();
  const W = B.finish(
    Object.assign({ cam: { target: [0, 0.9, 0.15], dist: 4.6, pitch: 0.06, yaw: 1.571 }, detail: 44, dither: 0.2, radius: 2 }, o.finish)
  );
  const mats = new Float32Array(NAMES.length * 12);
  rig.bind(W, t => {
    boneMatrices(o.pose(t), bind, o.place ? o.place(t) : null, mats, 0);
    for (let i = 0; i < NAMES.length; i++) {
      const k = i * 12;
      // rig.set wants (turn, a point at rest, where that point is now): hand it the origin and the move
      rig.set(NAMES[i], Array.from(mats.subarray(k, k + 9)), [0, 0, 0], [mats[k + 9], mats[k + 10], mats[k + 11]]);
    }
  });
  return { W, B, S, rig, bind };
}
module.exports = { buildStage };
