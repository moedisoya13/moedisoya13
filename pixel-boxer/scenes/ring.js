'use strict';
// The ring from the match's camera, the boxer standing in it:  ink-studio render scenes/ring.js --w 960 --h 540
const { buildStage } = require('./lib/stage.js');
const { createBout, settle } = require('../src/game/bout.mjs');
let bout;
module.exports = kit => ({
  id: 'ring',
  name: 'Ring',
  seed: 3,
  build: seed =>
    buildStage(kit, seed, {
      ring: true,
      restart() {
        bout = createBout(3);
        bout.fighters[0].x = -0.5;
        settle(bout);
      },
      frame: () => bout.fighters[0],
      finish: { cam: { target: [0, 0.7, 0], dist: 9.2, pitch: 0.52, yaw: 0.5 }, detail: 24, radius: 6 }
    }).W
});
