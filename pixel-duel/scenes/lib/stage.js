'use strict';
// What every review scene shares: a disc of ground, the swordsman sculpted in his bind stance, and a pose(t) that drives him.
const { fk, NAMES } = require('../../src/rig/skeleton.mjs');
const { PALETTE, MAT, sculptSwordsman } = require('../../src/rig/swordsman.mjs');
const { BIND } = require('../../src/rig/poses.mjs');
const { boneMatrices } = require('../../src/anim/pose.mjs');
const { createAlive } = require('../../src/anim/alive.mjs');
const { createDangle } = require('../../src/anim/dangle.mjs');

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
  /* What is drawn has a past (the settle after a cut, the swing of the scarf), so a picture of time t is reached by playing
     every sixtieth of a second up to it; asking for an earlier time starts over. o.drawing(t) says which drawing the figure
     is on (see clips.mjs); without it the poses are shown bare. */
  const STEP = 1 / 60;
  let alive, dangle, at;
  const restart = () => {
    alive = createAlive();
    dangle = createDangle(bind);
    at = -STEP;
  };
  restart();
  const advance = (t, dt) => {
    let pose = o.pose(t);
    if (o.drawing) {
      const d = o.drawing(t);
      pose = alive.update(pose, d.token, dt, d);
    }
    boneMatrices(pose, bind, o.place ? o.place(t) : null, mats, 0);
    dangle.apply(mats, dt);
  };
  rig.bind(W, t => {
    if (t < at - 1e-9) restart();
    while (at + STEP <= t + 1e-9) advance((at += STEP), at < STEP / 2 ? 0 : STEP);
    for (let i = 0; i < NAMES.length; i++) {
      const k = i * 12;
      // rig.set wants (turn, a point at rest, where that point is now): hand it the origin and the move
      rig.set(NAMES[i], Array.from(mats.subarray(k, k + 9)), [0, 0, 0], [mats[k + 9], mats[k + 10], mats[k + 11]]);
    }
  });
  return { W, B, S, rig, bind };
}
module.exports = { buildStage };
