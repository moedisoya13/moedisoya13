/* The fighter's clips. A clip is a list of drawings, not a curve: each key names a stance and says how it is reached.
     { t, pose, in }   at t seconds the figure takes `pose`. `in` is how long it spends getting there from the drawing before:
                       0 (the default) is a cut, the whole change in one frame.
   Cuts are the point. The swing of an attack is two drawings 0.11 s apart with nothing between them, the first frame after a
   button press is already the coiled wind-up, and a struck figure is already bent as far back as it will go: the eye fills in
   the motion, and reads the missing in-betweens as speed. Only the settling back to guard is eased.
   `marks` are moments the game reads: hit (the blade is where it does its damage), open/shut (the parry window), free (the
   clip may be interrupted by another action from here), and `reach` is how far ahead of the figure a hit lands, in metres. */
import { STANCES } from '../rig/poses.mjs';
import { solve } from '../rig/solve.mjs';
import { blend, exaggerateTorso } from './pose.mjs';
import { gaitStance, CYCLE } from './gait.mjs';

export const TORSO_GAIN = 1.5;
const solved = {};
export function stance(name) {
  if (!solved[name]) {
    if (!STANCES[name]) throw new Error('No stance called ' + name);
    // attack drawings commit the waist and chest half as far again; guard and reactions are left as written
    const gain = /^(slash|thrust)/.test(name) ? TORSO_GAIN : 1;
    solved[name] = exaggerateTorso(solve(STANCES[name]), gain);
  }
  return solved[name];
}

export const CLIPS = {
  // the guard is never held: the fighter bounces in it, once a second and a bit
  idle: { loop: 1.2, keys: [{ t: 0, pose: 'guard', in: 0.6 }, { t: 0.6, pose: 'guardLow', in: 0.6 }] },
  // the one clip that is not drawings: footwork is worked out from the feet up (gait.mjs), every frame its own
  walk: { loop: CYCLE, gait: true },
  slash: {
    dur: 0.56,
    keys: [
      { t: 0, pose: 'slashWind' },
      { t: 0.15, pose: 'slashHit', over: 0.05, drift: 0.02 },
      { t: 0.205, pose: 'slashEnd', over: 0.07 },
      { t: 0.36, pose: 'guard', in: 0.18 }
    ],
    marks: { hit: 0.15, free: 0.46 },
    swing: [0.15, 0.26], // the two drawings of the cut, 0.11 s
    reach: 1.95,
    damage: 1,
    lunge: 0.28
  },
  thrust: {
    dur: 0.72,
    keys: [
      { t: 0, pose: 'thrustWind' },
      { t: 0.16, pose: 'thrustHit', over: 0.05, drift: 0.02 },
      { t: 0.215, pose: 'thrustHold', over: 0.07 },
      { t: 0.46, pose: 'guard', in: 0.24 }
    ],
    marks: { hit: 0.16, free: 0.6 },
    swing: [0.16, 0.27],
    reach: 2.35,
    damage: 3,
    lunge: 0.42
  },
  // the rival's cut: the same drawings behind a wind-up long enough to read and answer
  heavy: {
    dur: 0.9,
    keys: [
      { t: 0, pose: 'slashWind' },
      { t: 0.45, pose: 'slashHit', over: 0.05, drift: 0.02 },
      { t: 0.505, pose: 'slashEnd', over: 0.07 },
      { t: 0.68, pose: 'guard', in: 0.2 }
    ],
    marks: { hit: 0.45, free: 0.8 },
    swing: [0.45, 0.56],
    reach: 1.95,
    damage: 1,
    lunge: 0.28
  },
  parry: {
    dur: 0.42,
    keys: [{ t: 0, pose: 'parry' }, { t: 0.3, pose: 'guard', in: 0.12 }],
    marks: { open: 0, shut: 0.22, free: 0.34 }
  },
  deflect: { dur: 0.3, keys: [{ t: 0, pose: 'parryHit' }, { t: 0.14, pose: 'guard', in: 0.16 }], marks: { free: 0.1 } },
  dodge: { dur: 0.36, keys: [{ t: 0, pose: 'dodge' }, { t: 0.22, pose: 'guard', in: 0.14 }], marks: { free: 0.3 }, slide: -1.15 },
  hurt: { dur: 0.46, keys: [{ t: 0, pose: 'hurt' }, { t: 0.2, pose: 'guard', in: 0.26 }], marks: { free: 0.4 }, slide: -0.35 },
  // parried: thrown open and left there, which is the opening the thrust answers
  stagger: { dur: 0.8, keys: [{ t: 0, pose: 'hurt' }, { t: 0.55, pose: 'guard', in: 0.25 }], marks: { free: 0.78 }, slide: -0.2 },
  down: { dur: 1.2, hold: true, keys: [{ t: 0, pose: 'hurt' }, { t: 0.16, pose: 'down', in: 0.22 }], slide: -0.5 }
};

const smooth = x => x * x * (3 - 2 * x);
const keyAt = (clip, t) => {
  let i = 0;
  while (i + 1 < clip.keys.length && clip.keys[i + 1].t <= t) i++;
  return i;
};
const wrap = (clip, t) => (clip.loop ? ((t % clip.loop) + clip.loop) % clip.loop : t);
/* The pose of a clip at t seconds. `from` is the pose the figure was in when the clip began, which the first key eases out of
   when it has an `in` (a cut ignores it). `walk` is how the figure is walking, for the clip that needs it: { advance, speed }. */
export function sample(clip, t, from, walk) {
  if (clip.gait) return solve(gaitStance(t, walk ? walk.advance : 1, walk ? walk.speed : 2));
  t = wrap(clip, t);
  const keys = clip.keys,
    i = keyAt(clip, t),
    key = keys[i],
    to = stance(key.pose),
    lead = key.in || 0;
  if (lead <= 0 || t - key.t >= lead) return to;
  const before = i > 0 ? stance(keys[i - 1].pose) : clip.loop ? stance(keys[keys.length - 1].pose) : from || to;
  return blend(before, to, smooth((t - key.t) / lead));
}
/* Which drawing a clip is on at t, for the code that brings the figure to life between drawings (alive.mjs):
   { token (changes when the drawing does), cut (reached with no in-betweens), over, drift (that key's own settings) }. */
export function drawing(name, t) {
  const clip = CLIPS[name];
  if (clip.loop) return { token: name, cut: false };
  const i = keyAt(clip, t),
    key = clip.keys[i];
  return { token: name + ':' + i, cut: !(key.in > 0), over: key.over, drift: key.drift };
}
