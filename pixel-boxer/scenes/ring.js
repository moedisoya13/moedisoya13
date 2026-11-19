'use strict';
// The ring from the match's camera, the boxer standing in it:  ink-studio render scenes/ring.js --w 960 --h 540
const { buildStage } = require('./lib/stage.js');
module.exports = kit => ({
  id: 'ring',
  name: 'Ring',
  seed: 3,
  build: seed => buildStage(kit, seed, { ring: true, view: () => ({ at: [-0.5, 0], facing: Math.PI / 2 }), finish: { cam: { target: [0, 0.7, 0], dist: 9.2, pitch: 0.52, yaw: 0.5 }, detail: 24, radius: 6 } }).W
});
