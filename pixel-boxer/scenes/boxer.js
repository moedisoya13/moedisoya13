'use strict';
/* The boxer through everything he can do, one thing every 1.2 seconds, for looking at a frame at a time:
     ink-studio sheet scenes/boxer.js --from 1.2 --to 1.52 --n 10        the jab
     ink-studio clip scenes/boxer.js --from 0 --to 6 --fps 30            the punches, moving */
const { buildStage } = require('./lib/stage.js');
const { MOVES } = require('../src/anim/moves.mjs');
const SLOT = 1.2;
const REEL = [
  { say: 'guard' },
  { action: 'jab' }, { action: 'cross' }, { action: 'hook' }, { action: 'upper' },
  { say: 'walk ahead', move: [0, 1.8] }, { say: 'walk back', move: [0, -1.8] }, { say: 'circle left', move: [1.6, 0] }, { say: 'turn', turn: 2.5 },
  { action: 'dash', dir: [0, -1] }, { say: 'cover', cover: 1 },
  { say: 'jab taken', strike: { kind: 'straight', dir: [0, -1], power: 0.5 } },
  { say: 'hook taken', strike: { kind: 'hook', dir: [-1, 0], power: 1 } },
  { say: 'uppercut taken', strike: { kind: 'upper', dir: [0, -1], power: 1 } },
  { action: 'reel' }, { action: 'ko', hold: true }, { say: 'cheer', cheer: true }
];
let struck = -1;

module.exports = kit => ({
  id: 'boxer',
  name: 'Boxer: every move',
  seed: 3,
  build(seed) {
    struck = -1;
    return buildStage(kit, seed, {
      view(t, animator) {
        const i = Math.min(REEL.length - 1, Math.floor(t / SLOT + 1e-6)),
          step = REEL[i],
          local = t - i * SLOT,
          view = { move: step.move || [0, 0], turn: step.turn || 0, cover: step.cover || 0, cheer: !!step.cheer, aim: null };
        if (t < 1e-6) struck = -1;
        if (step.action) {
          const move = MOVES[step.action];
          if (local < move.dur || step.hold) view.action = { name: step.action, t: Math.min(local, move.dur), id: step.action + i, dir: step.dir };
          view.still = step.action === 'ko' && local > move.dur;
        }
        if (step.strike && local >= 0.2 && struck !== i) {
          struck = i;
          animator.strike(step.strike);
        }
        return view;
      }
    }).W;
  }
});
module.exports.REEL = REEL;
module.exports.SLOT = SLOT;
