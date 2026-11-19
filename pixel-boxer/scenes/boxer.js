'use strict';
/* The boxer through everything he can do, one thing every 1.2 seconds, played as a real bout (the other man stands across
   the ring, out of the picture and out of reach, so the punches are thrown at the air and run their full length):
     ink-studio sheet scenes/boxer.js --from 2.4 --to 2.75 --n 8 --zoom 2.2     the cross, joint by joint
     ink-studio clip scenes/boxer.js --from 0 --to 6 --fps 30                   the punches, moving */
const { buildStage } = require('./lib/stage.js');
const { createBout, step, settle } = require('../src/game/bout.mjs');
const SLOT = 1.2;
const REEL = [
  { say: 'guard' },
  { press: 'jab' }, { press: 'power' }, { press: 'power', then: 1 }, { press: 'power', then: 2 },
  { say: 'walk ahead', move: [1, 0] }, { say: 'walk back', move: [-1, 0] }, { say: 'circle', move: [0, 1] }, { say: 'and back', move: [0, -1] },
  { dash: [-1, 0] }, { say: 'cover', cover: true },
  { say: 'jab taken', strike: { J: 40, dir: [0, 0, -1] } },
  { say: 'hook taken', strike: { J: 95, dir: [-1, 0, -0.2] } },
  { say: 'uppercut taken', strike: { J: 60, dir: [0, 0.8, -0.6] } },
  { say: 'knocked out', ko: true }
];
let bout, done;

module.exports = kit => ({
  id: 'boxer',
  name: 'Boxer: every move',
  seed: 3,
  build(seed) {
    return buildStage(kit, seed, {
      restart() {
        bout = createBout(3);
        bout.fighters[0].x = 0;
        bout.fighters[1].x = 2.5;
        settle(bout);
        done = -1;
      },
      frame(t) {
        const i = Math.min(REEL.length - 1, Math.floor(t / SLOT + 1e-6)),
          slot = REEL[i],
          local = t - i * SLOT,
          f = bout.fighters[0],
          fresh = done !== i && local >= 0.1,
          mine = { move: slot.move && local < 0.9 ? slot.move : [0, 0], cover: !!slot.cover && local > 0.1 && local < 0.9 };
        if (fresh) {
          done = i;
          if (slot.press) {
            // (as if the punches before it in the combination had just been thrown)
            if (slot.then) Object.assign(f, { link: slot.then - 1, lastPower: true, sinceLast: 0 });
            mine[slot.press] = true;
          }
          if (slot.dash) mine.dash = slot.dash;
          if (slot.strike) f.animator.strike(slot.strike);
          if (slot.ko) (f.action = { name: 'ko', t: 0, id: 'ko', chain: null }), (f.down = 1);
        }
        step(bout, [mine, {}], 1 / 60);
        f.x = Math.max(-0.6, Math.min(0.6, f.x)); // he stays in the picture
        f.z = Math.max(-0.6, Math.min(0.6, f.z));
        return { pose: f.pose, place: f.place };
      }
    }).W;
  }
});
module.exports.REEL = REEL;
module.exports.SLOT = SLOT;
