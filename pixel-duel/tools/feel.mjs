#!/usr/bin/env node
/* Numbers about how the clips hit, measured from the poses themselves at 60 frames a second. They are what the rules in
   README.md are checked against:  node tools/feel.mjs  (add --json for the raw values; exits 1 when a rule is broken) */
import { CLIPS, sample, stance, drawing, TORSO_GAIN } from '../src/anim/clips.mjs';
import { createAlive } from '../src/anim/alive.mjs';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { STANCES } from '../src/rig/poses.mjs';
import { solve } from '../src/rig/solve.mjs';

const FPS = 60,
  DT = 1 / FPS;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const BODY = NAMES.filter(n => n !== 'Sword');
const joints = pose => fk(pose).p;
// how far the body moves between two poses: the mean over its joints, in metres
const moved = (a, b) => {
  const A = joints(a),
    Bp = joints(b);
  return BODY.reduce((sum, n) => sum + dist(A[n], Bp[n]), 0) / BODY.length;
};
const angleBetween = (A, Bm) => (Math.acos(Math.max(-1, Math.min(1, (A[0] * Bm[0] + A[1] * Bm[1] + A[2] * Bm[2] + A[3] * Bm[3] + A[4] * Bm[4] + A[5] * Bm[5] + A[6] * Bm[6] + A[7] * Bm[7] + A[8] * Bm[8] - 1) / 2))) * 180) / Math.PI;

const guard = stance('guard');
const report = { attacks: {}, reactions: {}, torso: {}, alive: {}, walk: {} };

for (const name of ['slash', 'thrust']) {
  const clip = CLIPS[name],
    [from, to] = clip.swing;
  // the drawings shown while the blade travels: distinct poses on the frames of the swing window
  const drawings = new Set();
  let path = 0,
    last = joints(sample(clip, from - DT, guard)).RightHand;
  for (let f = Math.round(from * FPS); f < Math.round(to * FPS); f++) {
    const t = f * DT + 1e-9,
      key = clip.keys.filter(k => k.t <= t).pop();
    drawings.add(key.pose);
    const hand = joints(sample(clip, t, guard)).RightHand;
    path += dist(last, hand);
    last = hand;
  }
  report.attacks[name] = {
    swingSeconds: +(to - from).toFixed(3),
    swingDrawings: drawings.size,
    handSpeed: +(path / (to - from)).toFixed(1),
    firstFrame: +(moved(guard, sample(clip, 0, guard)) * 100).toFixed(1),
    stretch: [...new Set(clip.keys.map(k => stance(k.pose).stretch))]
  };
}
for (const name of ['hurt', 'stagger', 'dodge', 'parry']) {
  report.reactions[name] = { firstFrame: +(moved(guard, sample(CLIPS[name], 0, guard)) * 100).toFixed(1) };
}
// the torso gain actually applied, read back from a drawing: chest turn against the hips, written and exaggerated
{
  const twist = pose => {
    const f = fk(pose);
    return angleBetween(f.R.Hips, f.R.Chest);
  };
  const written = twist(solve(STANCES.slashHit)),
    shown = twist(stance('slashHit'));
  const dir = pose => {
    const f = fk(pose);
    return [f.R.Sword[2], f.R.Sword[5], f.R.Sword[8]];
  };
  const a = dir(solve(STANCES.slashHit)),
    b = dir(stance('slashHit'));
  report.torso = {
    gain: TORSO_GAIN,
    written: +written.toFixed(1),
    shown: +shown.toFixed(1),
    bladeTurned: +((Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI).toFixed(2)
  };
}

/* ---- what is actually drawn: the clips with the settle, drift and breath of alive.mjs over them, a frame at a time.
   A frame counts as moving when the body's joints shift 0.3 mm on average: about one art pixel a second at fighting distance. */
const MOVING = 0.0003;
const WALK = { advance: 1, speed: 2 };
function play(name, seconds) {
  const clip = CLIPS[name],
    alive = createAlive(),
    frames = [];
  alive.update(guard, 'guard', 0, {}); // the figure was standing in its guard
  const n = Math.round((seconds || clip.dur || clip.loop) * FPS);
  for (let f = 0; f < n; f++) {
    const t = f * DT,
      at = clip.loop ? t : Math.min(t, clip.dur - 1e-6),
      d = drawing(name, at);
    frames.push(alive.update(sample(clip, at, guard, WALK), d.token + '#1', f ? DT : 0, d));
  }
  return frames;
}
for (const name of Object.keys(CLIPS)) {
  // (the fall is measured until the body has landed; after that it is meant to lie still)
  const frames = play(name, name === 'down' ? 0.4 : name === 'idle' ? 2.4 : name === 'walk' ? 1.44 : 0);
  let moving = 0,
    run = 0,
    freeze = 0;
  for (let f = 1; f < frames.length; f++) {
    if (moved(frames[f - 1], frames[f]) >= MOVING) (moving++, (run = 0));
    else freeze = Math.max(freeze, ++run);
  }
  report.alive[name] = { moving: Math.round((moving / (frames.length - 1)) * 100), freeze: +(freeze * DT).toFixed(3) };
  if (report.attacks[name]) report.attacks[name].firstFrame = +(moved(guard, frames[0]) * 100).toFixed(1);
}
// footwork: a foot that is down must stay where it is while the body travels over it
{
  const frames = play('walk', 1.44);
  let slide = 0;
  for (const side of ['LeftFoot', 'RightFoot']) {
    let planted = null;
    frames.forEach((pose, f) => {
      const t = f * DT,
        p = joints(pose)[side],
        world = [p[0], p[1], p[2] + WALK.speed * t];
      if (t < 0.25 || p[1] > 0.0905) return void (planted = null); // the first short step, or in the air
      if (!planted) planted = world;
      slide = Math.max(slide, Math.abs(world[2] - planted[2]));
    });
  }
  report.walk = { stride: +(WALK.speed * CLIPS.walk.loop).toFixed(2), slide: +(slide * 1000).toFixed(1) };
}

const RULES = [
  ['a swing is two drawings', () => Object.values(report.attacks).every(a => a.swingDrawings <= 2)],
  ['the swing lasts 0.11 s', () => Object.values(report.attacks).every(a => Math.abs(a.swingSeconds - 0.11) < 0.005)],
  ['the first frame of an attack moves the body 17 cm or more', () => Object.values(report.attacks).every(a => a.firstFrame >= 17)],
  ['a struck figure is thrown 24 cm or more on the frame it is hit', () => report.reactions.hurt.firstFrame >= 24],
  ['the sword hand crosses the swing at 14 m/s or more', () => Object.values(report.attacks).every(a => a.handSpeed >= 14)],
  ['the figure never stretches or squashes by more than a tenth', () => Object.values(report.attacks).every(a => a.stretch.every(s => s >= 0.9 - 1e-9 && s <= 1.1 + 1e-9))],
  ['exaggerating the torso leaves the blade pointing where it did', () => report.torso.bladeTurned < 0.01],
  ['no clip stands still for longer than 0.1 s', () => Object.values(report.alive).every(a => a.freeze <= 0.1)],
  ['nine frames in ten are moving, in every clip', () => Object.values(report.alive).every(a => a.moving >= 90)],
  ['a planted foot slides less than 5 mm while walking', () => report.walk.slide < 5]
];
const results = RULES.map(([rule, check]) => [rule, check()]);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const [name, a] of Object.entries(report.attacks))
    console.log(`${name.padEnd(8)} swing ${a.swingSeconds}s in ${a.swingDrawings} drawings, hand ${a.handSpeed} m/s, first frame ${a.firstFrame} cm, stretch ${a.stretch.join(' ')}`);
  for (const [name, r] of Object.entries(report.reactions)) console.log(`${name.padEnd(8)} first frame ${r.firstFrame} cm`);
  console.log('moving   ' + Object.entries(report.alive).map(([name, a]) => `${name} ${a.moving}%/${a.freeze}s`).join('  ') + '   (share of frames moving / longest freeze)');
  console.log(`walk     stride ${report.walk.stride} m, planted foot slides ${report.walk.slide} mm`);
  console.log(`torso    x${report.torso.gain}: chest against hips ${report.torso.written} -> ${report.torso.shown} degrees, blade turned ${report.torso.bladeTurned} degrees`);
  for (const [rule, ok] of results) console.log((ok ? 'ok    ' : 'BROKEN') + ' ' + rule);
}
export { report, results };
if (results.some(r => !r[1])) process.exitCode = 1;
