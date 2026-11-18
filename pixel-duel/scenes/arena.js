'use strict';
// The courtyard from the game's camera, empty:  ink-studio render scenes/arena.js --w 960 --h 540
const { PALETTE } = require('../src/rig/swordsman.mjs');
const { ARENA, sculptArena } = require('../src/world/arena.mjs');

module.exports = ({ makeBuilder, makeSculpt, KIT: K }) => ({
  id: 'arena',
  name: 'Courtyard',
  seed: 5,
  build(seed) {
    const B = makeBuilder(seed, PALETTE);
    const S = K.sculpt(makeSculpt(B));
    S.sun = B.norm([0.45, 0.8, 0.5]);
    sculptArena(S, seed);
    S.bake();
    return B.finish({ cam: ARENA.camera, detail: 26, dither: 0.2, radius: 8 });
  }
});
