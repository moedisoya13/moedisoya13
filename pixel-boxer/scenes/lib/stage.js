'use strict';
// What the review scenes share: the ring (or a bare disc), one boxer sculpted in his guard, and a script that drives him.
const { fk, NAMES } = require('../../src/rig/skeleton.mjs');
const { PALETTE, MAT, sculptBoxer } = require('../../src/rig/boxer.mjs');
const { sculptRing, markCanvas } = require('../../src/world/ring.mjs');
const { boneMatrices } = require('../../src/anim/pose.mjs');
const { createAnimator, guardPose } = require('../../src/anim/animator.mjs');
const M = require('../../src/rig/m3.mjs');

const packed = hex => ((hex >> 16) & 255) + ((hex >> 8) & 255) * 256 + (hex & 255) * 65536;
const CANVAS = MAT.canvas.r.map(i => packed(PALETTE[i]));
const shade = (colour, steps) => CANVAS[Math.max(0, Math.min(CANVAS.length - 1, CANVAS.indexOf(Math.round(colour)) + steps))];

/* o.view(t) -> what the boxer is doing at t (see animator.mjs), plus at: [x, z] and facing (radians) to put him somewhere.
   The animator has a past, so a picture of time t is reached by playing every sixtieth of a second up to it. */
function buildStage({ makeBuilder, makeSculpt, KIT: K }, seed, o) {
  const B = makeBuilder(seed, PALETTE);
  const S = K.sculpt(makeSculpt(B));
  S.sun = B.norm([0.25, 0.9, 0.35]); // a lamp over the ring: mostly from above, so turning a boxer does not betray the bake
  S.aoR = 0.07;
  S.aoK = 1.3;
  if (o.ring) sculptRing(S);
  else S.box([0, -0.1, 0], [2.4, 0.1, 2.4], MAT.canvas, { res: 0.1 });
  S.bake();
  const rig = K.creature(B, S);
  for (const name of NAMES) rig.bone(name);
  const bind = fk(guardPose());
  sculptBoxer(S, bind);
  S.bake();
  const W = B.finish(Object.assign({ cam: { target: [0, 0.85, 0], dist: 6.6, pitch: 0.5, yaw: 0.75 }, detail: 34, dither: 0.2, radius: 4 }, o.finish));
  markCanvas(W.data, W.count, 16, 7, shade, c => CANVAS.includes(Math.round(c)));
  const mats = new Float32Array(NAMES.length * 12),
    STEP = 1 / 60;
  let animator, at;
  const restart = () => {
    animator = createAnimator();
    at = -STEP;
  };
  restart();
  rig.bind(W, t => {
    if (t < at - 1e-9) restart();
    while (at + STEP <= t + 1e-9) {
      at += STEP;
      const view = o.view(at, animator),
        pose = animator.update(view, at < STEP / 2 ? 0 : STEP);
      boneMatrices(pose, bind, { R: M.ry(((view.facing || 0) * 180) / Math.PI), p: [view.at ? view.at[0] : 0, 0, view.at ? view.at[1] : 0] }, mats, 0);
    }
    for (let i = 0; i < NAMES.length; i++) {
      const k = i * 12;
      rig.set(NAMES[i], Array.from(mats.subarray(k, k + 9)), [0, 0, 0], [mats[k + 9], mats[k + 10], mats[k + 11]]);
    }
  });
  return { W, bind };
}
module.exports = { buildStage };
