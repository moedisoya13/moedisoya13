#!/usr/bin/env node
/* Numbers about how the boxer moves, taken from the real thing: the rules are stepped with scripted controls, each step is
   animated exactly as the page animates it, and the joints are measured on the canvas, sixty times a second.
     node tools/feel.mjs      (--json for the raw values; exits 1 when a rule is broken) */
import { createBout, step, viewOf, RULES as BOUT } from '../src/game/bout.mjs';
import { createAnimator } from '../src/anim/animator.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import * as M from '../src/rig/m3.mjs';

const DT = 1 / 60;
// judged apart, because they are meant to be quick: the arms from the elbow down, and the feet
const HANDS = ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'];
const FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftShin', 'RightShin'];
const BODY = NAMES.filter(n => !HANDS.includes(n));
const CORE = BODY.filter(n => !FEET.includes(n));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* Play `seconds` of a bout: controls(tick, bout) -> [mine, his]. Returns a frame a tick for boxer `who`:
   { joints: world positions, view, stop } */
function play(seconds, controls, o) {
  o = o || {};
  const bout = createBout(5),
    animators = [createAnimator(0), createAnimator(1)],
    frames = [],
    events = [];
  let blow = -9; // the tick somebody was last hit: a blow is meant to jolt, so those frames are judged apart
  bout.fighters[0].x = -(o.gap || 1) / 2;
  bout.fighters[1].x = (o.gap || 1) / 2;
  if (o.setup) o.setup(bout);
  // let them settle into their guards first
  for (let i = 0; i < 40; i++) for (const k of [0, 1]) animators[k].update(viewOf(bout, k), DT);
  for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
    step(bout, controls(tick, bout), DT);
    for (const e of bout.events) {
      events.push({ ...e, tick });
      if (e.type === 'hit') animators[e.on].strike({ kind: e.kind, dir: [0, -1], power: Math.min(1.5, e.power) });
      if (e.type === 'hit' || e.type === 'block' || e.type === 'parry') blow = tick;
    }
    const held = bout.stop > 0;
    for (const k of [0, 1]) {
      const view = viewOf(bout, k),
        pose = animators[k].update(view, held ? DT * 0.06 : DT),
        place = { R: M.ry((view.facing * 180) / Math.PI), p: [view.at[0], 0, view.at[1]] };
      if (k === (o.who || 0)) frames.push({ struck: tick - blow <= 2, joints: Object.fromEntries(NAMES.map(n => [n, toWorld(place, pose.at[n], pose.stretch)])), view, held, place });
    }
  }
  return { frames, events, bout };
}
/* From a run of frames: how much of the time the body is moving, the fastest any joint goes, and the hardest any joint is
   jolted (the change in its frame-to-frame step: a pop shows up here). Frames held by a hit stop are left out. */
function measure(frames) {
  const live = frames.filter(f => !f.held);
  let moving = 0,
    freeze = 0,
    run = 0,
    bodyStep = 0,
    handStep = 0,
    bodyJolt = 0,
    handJolt = 0,
    footJolt = 0,
    pop = 0,
    worst = '';
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1].joints,
      b = live[i].joints,
      mean = BODY.reduce((s, n) => s + dist(a[n], b[n]), 0) / BODY.length;
    if (mean >= 0.0003) (moving++, (run = 0));
    else freeze = Math.max(freeze, ++run);
    for (const n of NAMES) {
      const d = dist(a[n], b[n]),
        hand = HANDS.includes(n);
      if (hand) handStep = Math.max(handStep, d);
      else bodyStep = Math.max(bodyStep, d);
      if (i > 1 && !live[i].struck && !live[i - 1].struck) {
        const before = live[i - 2].joints[n],
          accel = M.sub(M.sub(b[n], a[n]), M.sub(a[n], before)),
          jolt = Math.hypot(...accel);
        /* a pop: the joint goes one way and comes straight back the next frame, at speed both ways. Hard acceleration is
           what a punch is, and a punch that stops dead is still going the same way when it stops; only a mistake reverses
           at full speed inside one frame (the 3 cm allowed is the elbow of a punch being drawn back before it is thrown). It is the smaller of two successive steps that point against each other. */
        const was = M.sub(a[n], before),
          now = M.sub(b[n], a[n]),
          against = -(was[0] * now[0] + was[1] * now[1] + was[2] * now[2]) / (Math.hypot(...was) * Math.hypot(...now) || 1),
          back = Math.min(Math.hypot(...was), Math.hypot(...now));
        if (against > 0.6 && back > pop) (pop = back), (worst = n);
        if (hand) handJolt = Math.max(handJolt, jolt);
        else if (FEET.includes(n)) footJolt = Math.max(footJolt, jolt);
        else bodyJolt = Math.max(bodyJolt, jolt);
      }
    }
  }
  return {
    moving: Math.round((moving / (live.length - 1)) * 100),
    freeze: +(freeze * DT).toFixed(3),
    body: +(bodyStep * 60).toFixed(1), // m/s
    hands: +(handStep * 60).toFixed(1),
    bodyJolt: +(bodyJolt * 100).toFixed(1), // cm a frame, a frame
    handJolt: +(handJolt * 100).toFixed(1),
    footJolt: +(footJolt * 100).toFixed(1),
    pop: +(pop * 100).toFixed(1),
    worst
  };
}

const idle = {};
const press = (tick, at, what) => (tick === at ? { [what]: true } : idle);
const report = { scenes: {}, punches: {}, walk: {} };

// ---- the scenes a bout is made of
const SCENES = {
  guard: [2, () => [idle, idle]],
  'walk in and stop': [1.6, t => [{ move: t < 50 ? [1, 0] : [0, 0] }, idle], { gap: 3.6 }],
  circle: [2, t => [{ move: [0.2, t < 60 ? 1 : -1] }, idle], { gap: 1.6 }],
  'into the ropes': [1.6, () => [{ move: [0, 1] }, idle], { gap: 2.4 }],
  jab: [0.6, t => [press(t, 6, 'jab'), idle]],
  'jab, jab, cross': [1.2, t => [t === 6 || t === 20 ? { jab: true } : t === 34 ? { power: true } : idle, idle]],
  'cross, hook, uppercut': [1.6, t => [t % 18 === 6 && t < 50 ? { power: true } : idle, idle], { gap: 0.88 }],
  'cover up': [1.2, t => [{ cover: t > 10 && t < 45 }, idle]],
  dash: [0.8, t => [t === 6 ? { dash: [0, 1] } : idle, idle], { gap: 2.2 }],
  'taking a cross': [1.2, t => [idle, press(t, 6, 'power')]],
  'hit while punching': [1.2, t => [press(t, 12, 'power'), press(t, 6, 'jab')]],
  'knocked out': [1.4, t => [idle, press(t, 6, 'power')], { hp: 3 }]
};
for (const [name, [seconds, controls, o]] of Object.entries(SCENES)) {
  const run = play(seconds, (t, bout) => {
    if (o && o.hp && t === 0) bout.fighters[0].hp = o.hp;
    return controls(t, bout);
  }, o);
  report.scenes[name] = measure(run.frames);
}

// ---- each punch on its own: how fast the fist goes, and whether the glove is on the target on the tick the rules call the hit
for (const name of ['jab', 'cross', 'hook', 'upper']) {
  const link = BOUT.chain.indexOf(name),
    run = play(1, t => [press(t, 6, name === 'jab' ? 'jab' : 'power'), idle], {
      gap: Math.min(1, MOVES[name].reach - 0.08),
      // (as if the punches before it in the chain had just been thrown)
      setup: bout => link > 0 && Object.assign(bout.fighters[0], { link: link - 1, lastPower: true, sinceLast: 0 })
    }),
    hit = run.events.find(e => e.type === 'hit' && e.name === name),
    joint = MOVES[name].hand === 'L' ? 'LeftHand' : 'RightHand';
  let speed = 0;
  for (let i = 1; i < run.frames.length; i++) if (!run.frames[i].held) speed = Math.max(speed, dist(run.frames[i].joints[joint], run.frames[i - 1].joints[joint]) * 60);
  const f = hit && run.frames[hit.tick],
    target = f && f.view.aim && toWorld(f.place, f.view.aim, 1);
  report.punches[name] = { landed: !!hit, speed: +speed.toFixed(1), off: target ? +(dist(f.joints[joint], target) * 100).toFixed(1) : null };
}

// ---- footwork: a foot that is down stays where it was put
{
  const run = play(1.4, () => [{ move: [1, 0] }, idle], { gap: 4.6 });
  let slide = 0;
  for (const side of ['LeftFoot', 'RightFoot']) {
    let planted = null;
    run.frames.forEach((f, i) => {
      const p = f.joints[side];
      if (i < 40 || p[1] > 0.0905) return void (planted = null); // getting up to speed, or in the air
      if (!planted) planted = p;
      slide = Math.max(slide, Math.hypot(p[0] - planted[0], p[2] - planted[2]));
    });
  }
  report.walk = { speed: BOUT.speed, slide: +(slide * 1000).toFixed(1) };
}

const scenes = Object.values(report.scenes),
  punches = Object.values(report.punches);
const RULES = [
  ['the boxer is moving in every frame of every scene', () => scenes.every(s => s.moving === 100)],
  ['no joint ever goes one way and straight back the next frame by more than 3 cm (a pop)', () => scenes.every(s => s.pop <= 3)],
  ['walking, the head and trunk never change their step between frames by more than 1 cm', () => ['guard', 'walk in and stop', 'circle', 'into the ropes'].every(n => report.scenes[n].bodyJolt <= 1)],
  ['every punch lands, with the glove within 4 cm of where it was aimed', () => punches.every(p => p.landed && p.off !== null && p.off <= 4)],
  ['fists travel between 6 and 16 m/s at their fastest', () => punches.every(p => p.speed >= 6 && p.speed <= 16)],
  ['a planted foot slides less than 5 mm while walking', () => report.walk.slide < 5]
];
const results = RULES.map(([rule, check]) => [rule, check()]);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('scene                   moving  body m/s  hands m/s  jolt cm: body  feet  hands  pop cm');
  for (const [name, s] of Object.entries(report.scenes))
    console.log(`${name.padEnd(24)}${String(s.moving + '%').padEnd(8)}${String(s.body).padEnd(10)}${String(s.hands).padEnd(11)}${String(s.bodyJolt).padEnd(6)}${String(s.footJolt).padEnd(6)}${String(s.handJolt).padEnd(7)}${s.pop} ${s.pop > 3 ? s.worst : ''}`);
  for (const [name, p] of Object.entries(report.punches)) console.log(`${name.padEnd(8)} fist ${p.speed} m/s, ${p.landed ? `glove ${p.off} cm from its target when it lands` : 'did not land'}`);
  console.log(`walk     ${report.walk.speed} m/s, planted foot slides ${report.walk.slide} mm`);
  for (const [rule, ok] of results) console.log((ok ? 'ok    ' : 'BROKEN') + ' ' + rule);
}
export { report, results };
if (results.some(r => !r[1])) process.exitCode = 1;
