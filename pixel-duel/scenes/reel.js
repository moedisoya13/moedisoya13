'use strict';
/* Every clip in turn, each starting on a whole second, at game timing:
     ink-studio sheet scenes/reel.js --from 0 --to 0.55 --n 12      the slash, frame by frame
     ink-studio ghost scenes/reel.js --t 0.2 --spacing 0.05 --n 2   the swing with its neighbours laid over it */
const { buildStage } = require('./lib/stage.js');
const { CLIPS, sample, stance, drawing } = require('../src/anim/clips.mjs');
const REEL = ['slash', 'thrust', 'parry', 'deflect', 'dodge', 'hurt', 'stagger', 'down', 'walk', 'idle'];
const SLOT = 1.5;
// which clip is playing at t, and how far into it
const slot = t => {
  const i = Math.max(0, Math.min(REEL.length - 1, Math.floor(t / SLOT + 1e-6))),
    clip = CLIPS[REEL[i]],
    local = t - i * SLOT,
    over = !clip.loop && !clip.hold && local >= clip.dur;
  return { i, name: over ? 'idle' : REEL[i], t: over ? local - clip.dur : clip.loop ? local : Math.min(local, clip.dur) };
};

module.exports = kit => ({
  id: 'reel',
  name: 'Swordsman: clips',
  seed: 11,
  build(seed) {
    return buildStage(kit, seed, {
      pose(t) {
        const s = slot(t);
        return sample(CLIPS[s.name], s.t, stance('guard'), { advance: 1, speed: 2 });
      },
      drawing(t) {
        const s = slot(t),
          d = drawing(s.name, s.t);
        d.token += '#' + s.i;
        d.still = s.name === 'down' && s.t > 0.6;
        return d;
      }
    }).W;
  }
});
module.exports.REEL = REEL;
module.exports.SLOT = SLOT;
