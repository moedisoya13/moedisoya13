#!/usr/bin/env node
/* Numbers about how the boxer moves, taken from the real thing: the rules are stepped with scripted controls, each step is
   animated exactly as the page animates it, and the joints are measured on the canvas, sixty times a second.
     node tools/feel.mjs      (--json for the raw values; exits 1 when a rule is broken) */
import { createBout, step, settle, RULES as BOUT } from '../src/game/bout.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { createChain, stepChain, effectiveMass, LINKS } from '../src/phys/chain.mjs';
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
   { joints: world positions, held (in a hit stop), struck (somebody has just been hit) } */
function play(seconds, controls, o) {
  o = o || {};
  const bout = createBout(5),
    frames = [],
    events = [];
  let blow = -9; // the tick somebody was last hit: a blow is meant to jolt, so those frames are judged apart
  bout.fighters[0].x = -(o.gap || 1) / 2;
  bout.fighters[1].x = (o.gap || 1) / 2;
  settle(bout);
  for (let i = 0; i < 40; i++) step(bout, [{}, {}], DT); // into their guards, bouncing
  if (o.setup) o.setup(bout);
  for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
    step(bout, controls(tick, bout), DT);
    for (const e of bout.events) {
      events.push({ ...e, tick });
      if (e.type === 'hit' || e.type === 'block' || e.type === 'parry') blow = tick;
    }
    const f = bout.fighters[o.who || 0];
    frames.push({ struck: tick - blow <= 2, held: bout.stop > 0, joints: Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)])), glove: f.points });
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
const report = { scenes: {}, chain: {}, punches: {}, walk: {}, bounce: {} };

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

// ---- the chain of each punch on its own: when each joint fires and peaks, and how the weight behind the glove builds
for (const name of ['jab', 'cross', 'hook', 'upper']) {
  const move = MOVES[name],
    chain = createChain(move),
    used = LINKS.map((l, i) => i).filter(i => !(move.chain.skip || []).includes(LINKS[i]));
  let mass = 0,
    start = 0;
  for (let i = 0; i < 480 && chain.phase !== 'done'; i++) {
    stepChain(chain, move, 1 / 240);
    if (chain.phase === 'throw' || chain.phase === 'hold') mass = Math.max(mass, effectiveMass(chain, move));
    if (chain.phase === 'coil') start = chain.t;
  }
  report.chain[name] = {
    links: used.map(i => LINKS[i]),
    fired: used.map(i => Math.round(chain.fired[i] * 1000)),
    peak: used.map(i => Math.round(chain.peakAt[i] * 1000)),
    ordered: used.every((i, k) => k === 0 || (chain.fired[i] > chain.fired[used[k - 1]] && chain.peakAt[i] > chain.peakAt[used[k - 1]])),
    mass: +mass.toFixed(1),
    whole: +chain.t.toFixed(2)
  };
}

// ---- each punch thrown in a bout, from its own range: what the glove was doing when it met the head
function thrown(name, gap) {
  const link = BOUT.chain.indexOf(name),
    run = play(1, t => [press(t, 6, name === 'jab' ? 'jab' : 'power'), idle], {
      gap,
      // (as if the punches before it in the chain had just been thrown)
      setup: bout => link > 0 && Object.assign(bout.fighters[0], { link: link - 1, lastPower: true, sinceLast: 0 })
    }),
    hit = run.events.find(e => e.J !== undefined),
    hand = MOVES[name].hand;
  let fastest = 0;
  for (let i = 1; i < run.frames.length; i++) if (!run.frames[i].held && !run.frames[i - 1].held) fastest = Math.max(fastest, dist(run.frames[i].glove[hand], run.frames[i - 1].glove[hand]) * 60);
  return { hit, fastest };
}
for (const name of ['jab', 'cross', 'hook', 'upper']) {
  const { hit, fastest } = thrown(name, MOVES[name].close);
  report.punches[name] = { landed: !!hit && hit.type === 'hit', after: hit ? +((hit.tick - 6 + 1) / 60).toFixed(3) : null, speed: hit ? hit.speed : 0, mass: hit ? hit.mass : 0, J: hit ? hit.J : 0, fastest: +fastest.toFixed(1) };
}
{
  const close = thrown('cross', 0.68).hit,
    far = thrown('jab', 1.6).hit;
  report.punches.cross.smothered = close ? close.J : 0;
  report.punches.jab.outOfReach = !far;
}

// ---- the bounce standing in the guard: how far the hips travel, and whether the feet keep an even time
{
  const run = play(2, () => [idle, idle]),
    hips = run.frames.map(f => f.joints.Hips[1]),
    up = { LeftFoot: false, RightFoot: false },
    downs = [];
  run.frames.forEach((f, i) => {
    for (const joint of ['LeftFoot', 'RightFoot']) {
      const y = f.joints[joint][1];
      if (y > 0.099) up[joint] = true;
      else if (up[joint] && y < 0.094) (up[joint] = false), downs.push(i / 60);
    }
  });
  const gaps = downs.slice(1).map((t, i) => t - downs[i]);
  report.bounce = {
    travel: +((Math.max(...hips) - Math.min(...hips)) * 100).toFixed(1),
    beat: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3) : 0,
    even: gaps.length >= 4 && Math.max(...gaps) - Math.min(...gaps) < 0.04
  };
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
const chains = Object.values(report.chain);
const RULES = [
  ['the boxer is moving in every frame of every scene', () => scenes.every(s => s.moving === 100)],
  ['no joint ever goes one way and straight back the next frame by more than 3 cm (a pop)', () => scenes.every(s => s.pop <= 3)],
  ['walking, the head and trunk never change their step between frames by more than 1 cm', () => ['guard', 'walk in and stop', 'circle', 'into the ropes'].every(n => report.scenes[n].bodyJolt <= 1)],
  ['standing, he bounces: the hips rise and fall at least 2.5 cm, a foot coming down at every half beat', () => report.bounce.travel >= 2.5 && report.bounce.even],
  ['a planted foot slides less than 5 mm while walking', () => report.walk.slide < 5],
  ['in every punch the joints fire and peak in order, from the legs up to the hand', () => chains.every(c => c.ordered)],
  ['every punch lands from its own range, by the glove meeting the head', () => punches.every(p => p.landed)],
  ['the glove meets the head at between 5 and 16 m/s', () => punches.every(p => p.speed >= 5 && p.speed <= 16)],
  ['a jab delivers less than a cross, and a cross from too close less than half of one from range', () => report.punches.jab.J < report.punches.cross.J && report.punches.cross.smothered < report.punches.cross.J / 2],
  ['a jab thrown from out of reach meets nothing', () => report.punches.jab.outOfReach]
];
const results = RULES.map(([rule, check]) => [rule, check()]);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('scene                   moving  body m/s  hands m/s  jolt cm: body  feet  hands  pop cm');
  for (const [name, s] of Object.entries(report.scenes))
    console.log(`${name.padEnd(24)}${String(s.moving + '%').padEnd(8)}${String(s.body).padEnd(10)}${String(s.hands).padEnd(11)}${String(s.bodyJolt).padEnd(6)}${String(s.footJolt).padEnd(6)}${String(s.handJolt).padEnd(7)}${s.pop} ${s.pop > 3 ? s.worst : ''}`);
  console.log('\nchain   joint: fires at / peaks at (ms after the button)                                    behind the glove');
  for (const [name, c] of Object.entries(report.chain)) console.log(`${name.padEnd(8)}${c.links.map((l, i) => `${l} ${c.fired[i]}/${c.peak[i]}`).join('   ').padEnd(92)}${c.mass} kg`);
  console.log('\npunch   lands after  glove speed  mass behind  impulse   fastest the glove went');
  for (const [name, p] of Object.entries(report.punches))
    console.log(`${name.padEnd(8)}${String(p.after + ' s').padEnd(13)}${String(p.speed + ' m/s').padEnd(13)}${String(p.mass + ' kg').padEnd(13)}${String(p.J + ' Ns').padEnd(10)}${p.fastest} m/s`);
  console.log(`a cross from 0.68 m: ${report.punches.cross.smothered} Ns`);
  console.log(`walk     ${report.walk.speed} m/s, planted foot slides ${report.walk.slide} mm`);
  console.log(`bounce   the hips travel ${report.bounce.travel} cm, a foot down every ${report.bounce.beat} s`);
  for (const [rule, ok] of results) console.log((ok ? 'ok    ' : 'BROKEN') + ' ' + rule);
}
export { report, results };
if (results.some(r => !r[1])) process.exitCode = 1;
