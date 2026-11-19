/* The match's rules, with nothing in them about drawing: two boxers on a square of canvas, stepped at a fixed rate from two
   sets of controls. The same code runs in the page and under node --test.
     const bout = createBout(seed)
     step(bout, [mine, his], dt)
       controls: { move: [x, z] (a direction on the canvas, up to 1 long), jab, power (true on the tick pressed),
                   cover (true while held), dash: [x, z] | true (on the tick flicked; true is straight back) }
     bout.events      what happened this step, for the picture and the sound
     viewOf(bout, i)  what boxer i is doing, in the words the animator takes
   A punch lands at its move's contact time if the other boxer is in reach and in front. A guard raised just before it lands
   turns it aside and opens a counter; a guard held longer only smothers it; a dash slips it. */
import { MOVES } from '../anim/moves.mjs';
import { RING } from '../world/ring.mjs';

export const RULES = {
  hp: 100,
  speed: 2.3, // metres a second, free
  coverSpeed: 1.1,
  punchSpeed: 0.55,
  accel: 17,
  turnRate: 7.5, // radians a second
  gap: 0.74, // the boxers' centres are never closer
  half: RING.half,
  parry: 0.17, // a guard this fresh turns a punch aside
  counter: 0.95, // seconds the opening lasts
  counterGain: 1.8,
  smother: 0.15, // share of the damage that gets through a held guard
  buffer: 0.2,
  combo: 0.55, // a power punch this soon after the last becomes the next in the chain
  chain: ['cross', 'hook', 'upper'],
  dash: { reach: 1.2, safeFrom: 0.02, safeTo: 0.21 },
  stun: { jab: 0.24, power: 0.42, counter: 0.62, parried: 0.6 },
  startGap: 2.4
};

function boxer(x, yaw) {
  return { x, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, yaw, turn: 0, hp: RULES.hp, action: null, cover: false, coverAge: 0, stun: 0, counter: 0, flash: 0, want: null, wantAge: 0, link: 0, sinceHit: 9, serial: 0, down: 0 };
}
export function createBout(seed) {
  return { t: 0, stop: 0, over: null, overAt: 0, seed: seed || 1, events: [], fighters: [boxer(-RULES.startGap / 2, Math.PI / 2), boxer(RULES.startGap / 2, -Math.PI / 2)] };
}
export function random(bout) {
  bout.seed = (bout.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(bout.seed ^ (bout.seed >>> 15), 1 | bout.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ahead = f => [Math.sin(f.yaw), Math.cos(f.yaw)];
const leftOf = f => [Math.cos(f.yaw), -Math.sin(f.yaw)];
// a direction on the canvas, in a boxer's own terms: [to his left, ahead of him]
export const local = (f, x, z) => [x * Math.cos(f.yaw) - z * Math.sin(f.yaw), x * Math.sin(f.yaw) + z * Math.cos(f.yaw)];
export const busy = f => !!f.action || f.stun > 0;
// may he start something new? Between punches, only another punch, and only once this one has landed
const open = (f, punch) => f.stun <= 0 && (!f.action || (punch && MOVES[f.action.name].punch && f.action.t >= MOVES[f.action.name].cancel));

function begin(f, name, more) {
  f.action = Object.assign({ name, t: 0, id: name + ++f.serial, struck: false }, more);
  f.cover = false;
}

function decide(bout, f, other, input, dt, who) {
  const pressed = input.dash ? ['dash', input.dash] : input.jab ? ['jab'] : input.power ? ['power'] : null;
  if (pressed) (f.want = pressed), (f.wantAge = 0);
  else if (f.want && (f.wantAge += dt) > RULES.buffer) f.want = null;
  if (f.want) {
    const [what, dir] = f.want,
      punch = what !== 'dash';
    if (open(f, punch)) {
      f.want = null;
      if (!punch) {
        const [fx, fz] = ahead(f);
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

function travel(f, input, dt) {
  const m = input.move || [0, 0],
    l = Math.hypot(m[0], m[1]),
    k = l > 1 ? 1 / l : 1,
    top = f.stun > 0 || (f.action && !MOVES[f.action.name].punch) ? 0 : f.action ? RULES.punchSpeed : f.cover ? RULES.coverSpeed : RULES.speed,
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
    // the dash covers its ground early and coasts: the speed that integrates to `reach` along 1 - (1 - u)^3
    const dur = MOVES.dash.dur * 0.8,
      u = Math.min(1, f.action.t / dur),
      rate = (3 * (1 - u) * (1 - u) * RULES.dash.reach) / dur;
    sx = f.action.go[0] * rate;
    sz = f.action.go[1] * rate;
  }
  f.x += (f.vx + f.kx + sx) * dt;
  f.z += (f.vz + f.kz + sz) * dt;
  f.gx = f.vx + f.kx + sx; // how fast the canvas is really going past, for the feet
  f.gz = f.vz + f.kz + sz;
}

function face(f, other, dt) {
  if (f.down) return void (f.turn = 0);
  const want = Math.atan2(other.x - f.x, other.z - f.z),
    // a boxer who has thrown his weight into a punch cannot swing round with it
    rate = RULES.turnRate * (f.action && MOVES[f.action.name].punch ? 0.35 : f.stun > 0 ? 0.2 : 1);
  f.turn = Math.max(-rate, Math.min(rate, wrap(want - f.yaw) * 14));
  f.yaw = wrap(f.yaw + f.turn * dt);
}

function land(bout, f, other, who) {
  const move = MOVES[f.action.name],
    dx = other.x - f.x,
    dz = other.z - f.z,
    far = Math.hypot(dx, dz),
    off = Math.abs(wrap(Math.atan2(dx, dz) - f.yaw)) * (180 / Math.PI);
  if (other.down || far > move.reach || off > move.wide) return bout.events.push({ type: 'whiff', who, name: move.name });
  const dash = other.action && other.action.name === 'dash';
  if (dash && other.action.t >= RULES.dash.safeFrom && other.action.t <= RULES.dash.safeTo) return bout.events.push({ type: 'slip', who: 1 - who, name: move.name });
  const dir = [dx / (far || 1), dz / (far || 1)],
    at = [other.x - dir[0] * 0.2, move.kind === 'upper' ? 1.38 : 1.5, other.z - dir[1] * 0.2];
  if (other.cover) {
    if (other.coverAge <= RULES.parry) {
      // turned aside: the puncher is thrown open, the defender has his opening
      begin(f, 'reel');
      f.stun = RULES.stun.parried;
      f.kx = -dir[0] * 1.2;
      f.kz = -dir[1] * 1.2;
      other.counter = RULES.counter;
      bout.stop = 0.1;
      return bout.events.push({ type: 'parry', who: 1 - who, on: who, at });
    }
    other.hp = Math.max(1, other.hp - move.damage * RULES.smother);
    other.kx += dir[0] * move.push * 0.5;
    other.kz += dir[1] * move.push * 0.5;
    bout.stop = move.stop * 0.4;
    return bout.events.push({ type: 'block', who, on: 1 - who, name: move.name, kind: move.kind, hand: move.hand, dir, at });
  }
  const counter = !!f.action.counter,
    damage = move.damage * (counter ? RULES.counterGain : 1);
  other.hp = Math.max(0, other.hp - damage);
  other.action = null;
  other.cover = false;
  other.want = null;
  other.counter = 0;
  other.stun = counter ? RULES.stun.counter : move.name === 'jab' ? RULES.stun.jab : RULES.stun.power;
  other.kx += dir[0] * move.push * (counter ? 1.5 : 1);
  other.kz += dir[1] * move.push * (counter ? 1.5 : 1);
  other.flash = 0.07;
  other.sinceHit = 0;
  bout.stop = move.stop * (counter ? 1.6 : 1);
  const down = other.hp <= 0;
  bout.events.push({ type: 'hit', who, on: 1 - who, name: move.name, kind: move.kind, hand: move.hand, dir, at, damage, counter, down, power: (move.damage / 10) * (counter ? 1.5 : 1) });
  if (down) {
    begin(other, 'ko');
    other.down = 1;
    other.stun = 0;
    bout.over = who;
    bout.overAt = bout.t;
  }
}

function advance(bout, f, other, dt, who) {
  if (f.stun > 0) f.stun = Math.max(0, f.stun - dt);
  if (!f.action) return;
  const move = MOVES[f.action.name];
  f.action.t += dt;
  if (move.punch && !f.action.struck && f.action.t >= move.contact) {
    f.action.struck = true;
    f.sinceLast = 0;
    land(bout, f, other, who);
  }
  if (f.action && f.action.t >= move.dur) {
    if (move.stay) f.action.t = move.dur;
    else f.action = null;
  }
}

export function step(bout, inputs, dt) {
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
  bout.fighters.forEach((f, i) => {
    const other = bout.fighters[1 - i],
      input = bout.over === null ? inputs[i] || {} : {};
    f.counter = Math.max(0, f.counter - dt);
    f.sinceLast = (f.sinceLast === undefined ? 9 : f.sinceLast) + dt;
    f.sinceHit += dt;
    if (!f.down) decide(bout, f, other, input, dt, i);
    travel(f, f.down ? {} : input, dt);
    face(f, other, dt);
  });
  advance(bout, a, b, dt, 0);
  if (bout.stop <= 0) advance(bout, b, a, dt, 1);

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
  }
  return bout;
}

/* What boxer i is doing, for the animator. `lead` looks that many seconds past the last step, so a screen faster than the
   rules still gets a new pose every frame. */
export function viewOf(bout, i, lead) {
  const f = bout.fighters[i],
    other = bout.fighters[1 - i],
    held = bout.stop > 0,
    t = held ? 0 : lead || 0,
    view = {
      at: [f.x + (f.gx || 0) * t, f.z + (f.gz || 0) * t],
      facing: f.yaw + f.turn * t,
      move: held ? [0, 0] : local(f, f.gx || 0, f.gz || 0),
      turn: held ? 0 : f.turn,
      cover: f.cover ? 1 : 0,
      cheer: bout.over === i && bout.t - bout.overAt > 0.9,
      still: !!f.down && f.action.t >= MOVES.ko.dur,
      action: f.action ? { name: f.action.name, t: Math.min(MOVES[f.action.name].dur, f.action.t + t), id: f.action.id, dir: f.action.dir } : null,
      aim: null
    };
  if (f.action && MOVES[f.action.name].punch && !other.down) {
    const move = MOVES[f.action.name],
      dx = other.x - f.x,
      dz = other.z - f.z,
      far = Math.hypot(dx, dz);
    if (far <= move.reach + 0.12 && far > 0.45) {
      // the wrist is sent to where the glove meets the head: short of it by a glove, from the side for a hook, under for an uppercut
      const [side, front] = local(f, dx, dz),
        hook = move.kind === 'hook' ? (move.hand === 'L' ? 1 : -1) : 0;
      view.aim = [side + hook * 0.1, move.kind === 'upper' ? 1.33 : 1.47, front - 0.3 + Math.abs(hook) * 0.1];
    }
  }
  return view;
}
