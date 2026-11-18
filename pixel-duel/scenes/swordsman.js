'use strict';
// Every stance in turn, one a second:  ink-studio sheet scenes/swordsman.js --t 0,1,2,3 --cols 4
const { buildStage } = require('./lib/stage.js');
const { STANCES } = require('../src/rig/poses.mjs');
const { stance } = require('../src/anim/clips.mjs');
const ORDER = Object.keys(STANCES);

module.exports = kit => ({
  id: 'swordsman',
  name: 'Swordsman: stances',
  seed: 11,
  build(seed) {
    return buildStage(kit, seed, {
      pose: t => stance(ORDER[Math.max(0, Math.min(ORDER.length - 1, Math.floor(t + 1e-6)))])
    }).W;
  }
});
