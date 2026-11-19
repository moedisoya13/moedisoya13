/* The match: two boxers on a square of canvas, stepped at a fixed rate from two sets of controls. Nothing here draws, and the
   same code runs in the page and under node --test.
     const bout = createBout(seed)
     step(bout, [mine, his], dt)
       controls: { move: [x, z] (a direction on the canvas, up to 1 long), jab, power (true on the tick pressed),
                   cover (true while held), dash: [x, z] | true (on the tick flicked; true is straight back) }
     bout.events            what happened this step, for the picture and the sound
     bout.fighters[i].pose  his solved pose this step (and .place: where on the canvas, .points: gloves and head in the world)

   A punch is physics from the feet to the glove. Pressing a button only starts a kinetic chain (phys/chain.mjs); the joints
   fire in turn, the body is solved every step, and a punch lands when, and only when, the glove meets the other man's head.
   What it does then is the impulse it delivers: the glove's speed into the head, times the mass the chain has put behind it
   at that instant. So a punch from too far falls short, one thrown too close arrives before the elbow has straightened and
   is weak, and getting the head out of the way is the dodge. A guard held up puts the gloves in the way; one raised just
   before the punch turns it aside and opens a counter. */
import * as M from '../rig/m3.mjs';
import { MOVES } from '../anim/moves.mjs';
import { createAnimator } from '../anim/animator.mjs';
import { toWorld } from '../anim/pose.mjs';
import { createChain, stepChain, effectiveMass } from '../phys/chain.mjs';
import { RING } from '../world/ring.mjs';

export const RULES = {
  hp: 100,
  speed: 2.3, // metres a second, free
  coverSpeed: 1.1,
  punchSpeed: 0.55,
  accel: 17,
  turnRate: 7.5, // radians a second
  gap: 0.62, // the boxers' centres are never closer
  half: RING.half,
  // ---- the blow
  glove: 0.105, // radius of a glove, metres
  head: 0.125,
  bounce: 0.3, // how much of the glove's speed comes back off the head
  graze: 6, // newton-seconds: less than this is a touch, not a punch
  damage: 0.12, // health lost per newton-second
  mass: 75, // kilograms: what a blow has to push
  shove: 2.2, // how much more than physics a blow moves a man (it is a game)
  stun: [0.16, 1 / 260], // seconds: a floor, plus so much per newton-second
  stop: [0.03, 0.13, 1 / 900], // the held moment: least, most, and seconds per newton-second
  // ---- defence
  parry: 0.17, // a guard this fresh turns a punch aside
  counter: 0.95, // seconds the opening lasts
  counterGain: 1.8,
  smother: 0.15, // share of a blow that gets through a held guard
  buffer: 0.2,
  combo: 0.55, // a power punch this soon after the last becomes the next in the chain
  chain: ['cross', 'hook', 'upper'],
  dash: { reach: 1.2 },
  stepIn: 2.6, // metres a second he closes at while throwing, down to the punch's own range
  startGap: 2.4
};
const DT = 1 / 60;

function boxer(x, yaw, seed) {
  return { x, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, gx: 0, gz: 0, yaw, turn: 0, hp: RULES.hp, action: null, cover: false, coverAge: 0, stun: 0, counter: 0, flash: 0, want: null, wantAge: 0, link: 0, sinceHit: 9, sinceLast: 9, serial: 0, down: 0, animator: createAnimator(seed), pose: null, place: null, points: null, before: null };
}
export function createBout(seed) {
  const bout = { t: 0, stop: 0, over: null, overAt: 0, seed: seed || 1, events: [], fighters: [boxer(-RULES.startGap / 2, Math.PI / 2, 0), boxer(RULES.startGap / 2, -Math.PI / 2, 1)] };
  settle(bout);
  return bout;
}
// stand both boxers in their guards where they are (after they have been put somewhere by hand)
export function settle(bout) {
  for (const f of bout.fighters) (f.animator = createAnimator(f === bout.fighters[0] ? 0 : 1)), (f.before = f.points = null);
  for (let i = 0; i < 2; i++) bout.fighters.forEach((f, k) => solvePose(bout, f, k, 0));
}
export function random(bout) {
  bout.seed = (bout.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(bout.seed ^ (bout.seed >>> 15), 1 | bout.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const aheadOf = f => [Math.sin(f.yaw), Math.cos(f.yaw)];
// a direction on the canvas, in a boxer's own terms: [to his left, ahead of him]
export const local = (f, x, z) => [x * Math.cos(f.yaw) - z * Math.sin(f.yaw), x * Math.sin(f.yaw) + z * Math.cos(f.yaw)];
const punching = f => !!f.action && !!MOVES[f.action.name].punch;
// a punch still on its way out: wound up or being thrown, and not yet landed
export const incoming = f => (punching(f) && !f.action.struck && (f.action.chain.phase === 'coil' || f.action.chain.phase === 'throw') ? f.action : null);
// may he start something new? In the middle of a punch, only another punch, and only once this one has been thrown
const open = (f, punch) => f.stun <= 0 && (!f.action || (punch && punching(f) && (f.action.chain.phase === 'hold' || f.action.chain.phase === 'recover')));

function begin(f, name, more) {
  const move = MOVES[name],
    before = f.action,
    chain = move.punch ? createChain(move) : null;
  // a punch thrown with the hand that has just punched starts from where that arm's joints still are (a double jab)
  if (chain && before && before.chain && MOVES[before.name].hand === move.hand) (chain.q = before.chain.q.slice()), (chain.v = before.chain.v.slice());
  f.action = Object.assign({ name, t: 0, id: name + ++f.serial, struck: false, chain }, more);
  f.cover = false;
}

function decide(bout, f, input, dt, who) {
  const pressed = input.dash ? ['dash', input.dash] : input.jab ? ['jab'] : input.power ? ['power'] : null;
  if (pressed) (f.want = pressed), (f.wantAge = 0);
  else if (f.want && (f.wantAge += dt) > RULES.buffer) f.want = null;
  if (f.want) {
    const [what, dir] = f.want,
      punch = what !== 'dash';
    if (open(f, punch)) {
      f.want = null;
      if (!punch) {
        const [fx, fz] = aheadOf(f);
        let d = dir === true ? [-fx, -fz] : dir;
        const l = Math.hypot(d[0], d[1]) || 1;
        d = [d[0] / l, d[1] / l];
        begin(f, 'dash', { dir: local(f, d[0], d[1]), go: d });
        bout.events.push({ type: 'dash', who });
      } else {
        let name = 'jab';
        if (what === 'power') {
          f.link = f.sinceLast < RULES.combo && f.lastPower ? (f.link + 1) % RULES.chain.length : 0;
          name = RULES.chain[f.link];
        }
        begin(f, name, { counter: f.counter > 0 });
        f.lastPower = what === 'power';
        f.counter = 0;
        bout.events.push({ type: 'punch', who, name });
      }
    }
  }
  const covering = !!input.cover && !f.action && f.stun <= 0;
  f.coverAge = covering ? (f.cover ? f.coverAge + dt : 0) : 0;
  if (covering && !f.cover) bout.events.push({ type: 'cover', who });
  f.cover = covering;
}

function travel(f, input, dt, other) {
  const m = input.move || [0, 0],
    l = Math.hypot(m[0], m[1]),
    k = l > 1 ? 1 / l : 1,
    top = f.stun > 0 || (f.action && !punching(f)) ? 0 : f.action ? RULES.punchSpeed : f.cover ? RULES.coverSpeed : RULES.speed,
    wx = m[0] * k * top,
    wz = m[1] * k * top,
    dx = wx - f.vx,
    dz = wz - f.vz,
    d = Math.hypot(dx, dz),
    most = RULES.accel * dt;
  if (d <= most) (f.vx = wx), (f.vz = wz);
  else (f.vx += (dx / d) * most), (f.vz += (dz / d) * most);
  // being knocked back is a push that dies away, on top of his own walking
  const drag = Math.exp(-dt * 7);
  f.kx *= drag;
  f.kz *= drag;
  let sx = 0,
    sz = 0;
  if (f.action && f.action.name === 'dash') {
    // the dash gathers speed and sheds it again: the speed that integrates to `reach` along a curve at rest at both ends
    const dur = MOVES.dash.dur * 0.85,
      u = Math.min(1, f.action.t / dur),
      rate = (30 * u * u * (1 - u) * (1 - u) * RULES.dash.reach) / dur;
    sx = f.action.go[0] * rate;
    sz = f.action.go[1] * rate;
  }
  if (incoming(f) && other && !other.down) {
    /* A punch is stepped into: he closes on a head that is just out of range, so a combination follows its target back
       and a counter reaches a man who has been thrown onto his heels. (It is the head he measures to, not the feet.) */
    const head = other.points ? other.points.head : [other.x, 0, other.z],
      ox = head[0] - f.x,
      oz = head[2] - f.z,
      far = (Math.hypot(ox, oz) || 1) + 0.09,
      close = Math.max(0, Math.min(RULES.stepIn * (f.action.counter ? 1.5 : 1), (far - MOVES[f.action.name].close) * 9));
    if (far < MOVES[f.action.name].reach + 0.6) (sx += (ox / far) * close), (sz += (oz / far) * close);
  }
  // the ropes give: the last quarter of a metre is run out of speed, not into a wall
  const ease = (p, v) => (v * p > 0 ? Math.sign(v) * Math.min(Math.abs(v), Math.max(0, RULES.half - Math.abs(p)) * 9) : v);
  f.x += ease(f.x, f.vx + f.kx + sx) * dt;
  f.z += ease(f.z, f.vz + f.kz + sz) * dt;
}

function face(f, other, dt) {
  if (f.down) return void (f.turn = 0);
  const want = Math.atan2(other.x - f.x, other.z - f.z),
    // a boxer who has thrown his weight into a punch cannot swing round with it
    rate = RULES.turnRate * (punching(f) ? 0.35 : f.stun > 0 ? 0.2 : 1);
  f.turn = Math.max(-rate, Math.min(rate, wrap(want - f.yaw) * 14));
  f.yaw = wrap(f.yaw + f.turn * dt);
}

function advance(bout, f, dt, who) {
  if (f.stun > 0) f.stun = Math.max(0, f.stun - dt);
  if (!f.action) return;
  const move = MOVES[f.action.name];
  f.action.t += dt;
  if (move.punch) {
    const was = f.action.chain.phase,
      now = stepChain(f.action.chain, move, dt);
    if (was === 'throw' && now !== 'throw') {
      f.sinceLast = 0;
      if (!f.action.struck) bout.events.push({ type: 'whiff', who, name: move.name });
    }
    if (now === 'done') f.action = null;
  } else if (f.action.t >= move.dur) {
    if (move.stay) f.action.t = move.dur;
    else f.action = null;
  }
}

/* What boxer i is doing, in the words the animator takes. */
function viewOf(bout, i) {
  const f = bout.fighters[i],
    other = bout.fighters[1 - i],
    view = {
      move: local(f, f.gx, f.gz),
      turn: f.turn,
      cover: f.cover ? 1 : 0,
      cheer: bout.over === i && bout.t - bout.overAt > 0.9,
      still: !!f.down && f.action.t >= MOVES.ko.dur,
      action: f.action,
      aim: null
    };
  if (punching(f) && !other.down && other.points) {
    /* Where the punch is thrown: at the head as it is now, wherever that is. The wrist is sent so that the glove's centre
       would end at the middle of the head (it will meet it before then): straight through for a straight punch, onto the
       side of the head for a hook, up under the chin for an uppercut. */
    const move = MOVES[f.action.name],
      h = other.points.head,
      [side, front] = local(f, h[0] - f.x, h[2] - f.z);
    if (Math.hypot(side, front) < 1.7 && front > 0.2) {
      const from = move.hand === 'L' ? 1 : -1;
      view.aim = move.arm === 'swing' ? [side + from * 0.05, h[1], front - 0.1] : move.arm === 'lift' ? [side, h[1] - 0.1, front - 0.07] : [side, h[1], front - 0.075];
    }
  }
  return view;
}
// solve boxer i for this step, and find his gloves and head on the canvas
function solvePose(bout, f, i, dt) {
  const pose = f.animator.update(viewOf(bout, i), dt),
    place = { R: M.ry((f.yaw * 180) / Math.PI), p: [f.x, 0, f.z] },
    at = name => toWorld(place, pose.at[name], pose.stretch),
    beyond = (a, b, far) => {
      const d = M.sub(b, a),
        l = Math.hypot(d[0], d[1], d[2]) || 1;
      return M.add(b, M.scale(d, far / l));
    };
  f.pose = pose;
  f.place = place;
  f.before = f.points;
  f.points = {
    L: beyond(at('LeftForeArm'), at('LeftHand'), 0.075), // the middle of each glove: on past the wrist
    R: beyond(at('RightForeArm'), at('RightHand'), 0.075),
    head: beyond(at('Neck1'), at('Head'), 0.1)
  };
}

/* Does the glove, on its way from where it was last step to where it is now, meet a ball of radius r that has itself moved
   from c0 to c1? -> how far through the step (0..1) they first touch, or -1. */
function meets(g0, g1, c0, c1, r) {
  const p = M.sub(g0, c0),
    d = M.sub(M.sub(g1, c1), p),
    dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2],
    pd = p[0] * d[0] + p[1] * d[1] + p[2] * d[2],
    pp = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
  if (pp <= r * r) return 0;
  if (dd < 1e-12) return -1;
  const disc = pd * pd - dd * (pp - r * r);
  if (disc < 0) return -1;
  const s = (-pd - Math.sqrt(disc)) / dd;
  return s >= 0 && s <= 1 ? s : -1;
}

function strike(bout, f, other, who, dt) {
  const action = incoming(f);
  if (!action || !f.before || !other.before || other.down) return;
  const move = MOVES[action.name],
    hand = move.hand,
    g0 = f.before[hand],
    g1 = f.points[hand];
  // what is in the way: his head, and, if he is covering up, his gloves in front of it
  let first = null;
  const test = (what, key, r) => {
    const s = meets(g0, g1, other.before[key], other.points[key], r);
    if (s >= 0 && (!first || s < first.s)) first = { what, key, s };
  };
  test('head', 'head', RULES.glove + RULES.head);
  if (other.cover) for (const key of ['L', 'R']) test('guard', key, RULES.glove * 2);
  if (!first) return;

  // ---- the blow: how fast the glove is closing on what it hit, and how much is behind it
  const at = M.lerp(g0, g1, first.s),
    centre = M.lerp(other.before[first.key], other.points[first.key], first.s),
    line = M.sub(centre, at),
    ll = Math.hypot(line[0], line[1], line[2]) || 1,
    n = M.scale(line, 1 / ll),
    closing = M.scale(M.sub(M.sub(g1, g0), M.sub(other.points[first.key], other.before[first.key])), 1 / dt),
    speed = Math.max(0, closing[0] * n[0] + closing[1] * n[1] + closing[2] * n[2]),
    mass = effectiveMass(action.chain, move),
    J = mass * speed * (1 + RULES.bounce),
    flat = Math.hypot(n[0], n[2]) || 1,
    dir = [n[0] / flat, n[2] / flat],
    blow = { who, on: 1 - who, name: move.name, kind: move.kind, hand, J: +J.toFixed(1), speed: +speed.toFixed(2), mass: +mass.toFixed(2), dir, at: M.add(at, M.scale(n, RULES.glove)) };
  action.struck = true;
  action.chain.landed = true;
  action.chain.v[3] = action.chain.v[4] = 0; // the arm is stopped by what it hit
  f.sinceLast = 0;
  if (J < RULES.graze) return bout.events.push(Object.assign({ type: 'graze' }, blow));
  const [side, front] = local(other, n[0], n[2]),
    felt = { J, dir: [side, n[1], front] }; // the way the blow went, as the man who took it would say
  const stop = Math.max(RULES.stop[0], Math.min(RULES.stop[1], J * RULES.stop[2]));

  if (first.what === 'guard') {
    if (other.coverAge <= RULES.parry) {
      // turned aside: the puncher is thrown open, the defender has his opening
      begin(f, 'reel');
      f.stun = 0.6;
      f.kx = -dir[0] * 1.2;
      f.kz = -dir[1] * 1.2;
      other.counter = RULES.counter;
      bout.stop = 0.1;
      return bout.events.push(Object.assign({ type: 'parry' }, blow, { who: 1 - who, on: who }));
    }
    other.hp = Math.max(1, other.hp - J * RULES.damage * RULES.smother);
    other.kx += ((dir[0] * J) / RULES.mass) * RULES.shove * 0.6;
    other.kz += ((dir[1] * J) / RULES.mass) * RULES.shove * 0.6;
    other.animator.strike({ J: J * 0.25, dir: felt.dir });
    bout.stop = stop * 0.4;
    return bout.events.push(Object.assign({ type: 'block' }, blow));
  }
  const counter = !!action.counter,
    worth = J * (counter ? RULES.counterGain : 1),
    damage = worth * RULES.damage;
  other.hp = Math.max(0, other.hp - damage);
  other.action = null;
  other.cover = false;
  other.want = null;
  other.counter = 0;
  other.stun = RULES.stun[0] + worth * RULES.stun[1];
  other.kx += ((dir[0] * worth) / RULES.mass) * RULES.shove;
  other.kz += ((dir[1] * worth) / RULES.mass) * RULES.shove;
  other.flash = 0.07;
  other.sinceHit = 0;
  other.animator.strike({ J: Math.min(worth, 110), dir: felt.dir });
  bout.stop = Math.min(RULES.stop[1], stop * (counter ? 1.5 : 1));
  const down = other.hp <= 0;
  bout.events.push(Object.assign({ type: 'hit', damage: +damage.toFixed(1), counter, down }, blow));
  if (down) {
    begin(other, 'ko');
    other.down = 1;
    other.stun = 0;
    bout.over = who;
    bout.overAt = bout.t;
  }
}

export function step(bout, inputs, dt) {
  dt = dt || DT;
  bout.events.length = 0;
  const [a, b] = bout.fighters;
  for (const f of bout.fighters) f.flash = Math.max(0, f.flash - dt);
  if (bout.stop > 0) {
    // the moment of a blow is held; presses made in it are kept
    bout.stop -= dt;
    bout.fighters.forEach((f, i) => {
      const input = inputs[i] || {},
        pressed = input.dash ? ['dash', input.dash] : input.jab ? ['jab'] : input.power ? ['power'] : null;
      if (pressed && bout.over === null) (f.want = pressed), (f.wantAge = 0);
    });
    return bout;
  }
  bout.t += dt;
  for (const f of bout.fighters) (f.px = f.x), (f.pz = f.z);
  bout.fighters.forEach((f, i) => {
    const other = bout.fighters[1 - i],
      input = bout.over === null ? inputs[i] || {} : {};
    f.counter = Math.max(0, f.counter - dt);
    f.sinceLast += dt;
    f.sinceHit += dt;
    if (!f.down) decide(bout, f, input, dt, i);
    travel(f, f.down ? {} : input, dt, other);
    face(f, other, dt);
    advance(bout, f, dt, i);
  });

  // keep them off each other and inside the ropes
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz);
  if (d < RULES.gap && !a.down && !b.down) {
    const push = (RULES.gap - d) / 2,
      nx = d > 1e-6 ? dx / d : 1,
      nz = d > 1e-6 ? dz / d : 0;
    a.x -= nx * push;
    a.z -= nz * push;
    b.x += nx * push;
    b.z += nz * push;
  }
  for (const f of bout.fighters) {
    f.x = Math.max(-RULES.half, Math.min(RULES.half, f.x));
    f.z = Math.max(-RULES.half, Math.min(RULES.half, f.z));
    // how fast the canvas really went past under him this step, ropes and the other man allowed for: what his feet walk to
    f.gx = (f.x - f.px) / dt;
    f.gz = (f.z - f.pz) / dt;
  }
  // the bodies, solved; then whether a glove on its way has met anything
  bout.fighters.forEach((f, i) => solvePose(bout, f, i, dt));
  strike(bout, a, b, 0, dt);
  if (bout.stop <= 0) strike(bout, b, a, 1, dt);
  return bout;
}
