'use strict';
/* A motion from Kimodo played on the swordsman, to check an import by eye. Convert one first (the samples that ship in
   nv-tlabs/kimodo under kimodo/assets/demo/examples will do), then name it in DUEL_MOTION:
     python3 tools/kimodo_import.py .../06_root_waypoints/motion.npz studio/motions/dance.json
     DUEL_MOTION=studio/motions/dance.json npx ink-studio sheet scenes/kimodo.js --from 0 --to 4 --n 10
   DUEL_FPS=12 holds drawings at that rate instead of playing the motion smooth. */
const fs = require('node:fs');
const { buildStage } = require('./lib/stage.js');
const { sampleMotion, onDrawings } = require('../src/anim/motion.mjs');

module.exports = kit => ({
  id: 'kimodo',
  name: 'Swordsman: generated motion',
  seed: 11,
  build(seed) {
    const file = process.env.DUEL_MOTION;
    if (!file) throw new Error('Set DUEL_MOTION to a clip converted with tools/kimodo_import.py');
    const motion = JSON.parse(fs.readFileSync(file, 'utf8')),
      fps = Number(process.env.DUEL_FPS) || 0;
    return buildStage(kit, seed, {
      rad: 3.2,
      pose: t => (fps ? onDrawings(motion, t, fps) : sampleMotion(motion, t)),
      finish: { cam: { target: [0, 0.9, 0.6], dist: 6.2, pitch: 0.1, yaw: 1.1 }, radius: 4 }
    }).W;
  }
});
