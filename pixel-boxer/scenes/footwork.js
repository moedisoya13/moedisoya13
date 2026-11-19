'use strict';
/* One entry of the footwork catalogue (src/footwork.mjs), played as its real bout, for looking at a frame at a time:
     FOOTWORK=pendulum npx ink-studio sheet scenes/footwork.js --from 1 --to 2.6 --n 12
   The other man is left out of the picture; the camera stays on the boxer whose feet these are. */
const { buildStage } = require('./lib/stage.js');
const { ENTRIES, HOME, AWAY, drive } = require('../src/footwork.mjs');
const { createBout, step, settle } = require('../src/game/bout.mjs');
let bout, tick;

module.exports = kit => ({
  id: 'footwork',
  name: 'Footwork',
  seed: 3,
  build(seed) {
    const entry = ENTRIES.find(e => e.id === (process.env.FOOTWORK || 'bounce'));
    if (!entry) throw new Error('FOOTWORK names none of: ' + ENTRIES.map(e => e.id).join(' '));
    return buildStage(kit, seed, {
      restart() {
        bout = createBout(7);
        [bout.fighters[0].x, bout.fighters[0].z] = HOME;
        [bout.fighters[1].x, bout.fighters[1].z] = AWAY;
        settle(bout);
        tick = 0;
      },
      frame() {
        step(bout, drive(entry, bout, tick++ / 60, 1 / 60), 1 / 60);
        bout.fighters[1].hp = 1000;
        return bout.fighters[0];
      },
      finish: { cam: { target: [0.12, 0.62, 0], dist: 4.6, pitch: 0.18, yaw: Number(process.env.YAW || 1.25) } }
    }).W;
  }
});
