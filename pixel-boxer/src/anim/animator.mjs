/* One boxer's body, a frame at a time. It is told what he is doing (walking this way, a tenth of a second into a cross,
   covering up, just been hooked) and answers with a solved pose. Nothing is played back: the guard, its bounce, the step under
   it, the punch over it and the give of a body that has been hit are separate layers of numbers, summed and solved every
   frame at whatever rate the screen runs, so there are no held frames to smooth over and no joins between moves.
     const a = createAnimator()
     a.update(view, dt) -> { root, rot, stretch, at: { Joint: position in his own space } }
       view: { move: [left, ahead] metres a second in his own space, turn: radians a second,
               action: { name, t, id, dir, chain (a punch's kinetic chain: see phys/chain.mjs) } | null, cover: 0..1,
               aim: [x, y, z] where the punching wrist is to go, in his space | null,
               cheer: bool, still: bool (lying on the canvas) }
     a.strike({ J, dir: [left, up, ahead] })         he has just been hit: the impulse in newton-seconds, and the way it went */
import * as M from '../rig/m3.mjs';
import { TPOSE } from '../rig/skeleton.mjs';
import { solve, LEN } from '../rig/solve.mjs';
import { LINKS } from '../phys/chain.mjs';
import { CHANNELS, GUARD, MOVES, sampleMove } from './moves.mjs';

const TAU = Math.PI * 2;
/* The feet keep time. One beat is one foot coming down; a cycle is both. Standing, the boxer rocks between his feet on that
   beat (the lead foot is lifted and set down, then the rear: a pendulum), and when he travels the same beat becomes his
   steps, quickening as he goes, so he never has to find the rhythm again: he was already in it. */
const CYCLE = { rest: 0.64, travel: 0.3 }; // seconds for both feet to come down once: bouncing on the spot, and at full speed
const HOP = 0.03; // metres an unweighted foot clears the canvas by, bouncing on the spot
/* The bounce itself, once for each foot that comes down: a short squash as the weight lands (the legs take it like springs),
   the push back off it, and a float before the next. The squash and the float meet at the same speed, so it rebounds
   rather than bobs. Heights in metres at full liveliness. */
const BOUNCE = { contact: 0.38, float: 0.016 };
BOUNCE.squash = (4 * BOUNCE.float * BOUNCE.contact) / ((1 - BOUNCE.contact) * Math.PI); // the depth that meets the float at the same speed
const ROCK = 0.034; // metres the weight swings forward and back between the feet, bouncing on the spot
const STRIDE = 0.42; // metres: the furthest a foot is ever put from its place in the guard
const SETTLE = 30; // how fast the difference between two moves is let go of (1/seconds): gone in about a sixth of a second
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => x * x * (3 - 2 * x);

// a damped spring in closed steps: stable at any frame rate
function spring(s, target, dt, hz, ratio) {
  const w = TAU * hz,
    n = Math.max(1, Math.ceil(dt * 240));
  for (let i = 0, h = dt / n; i < n; i++) {
    s.v += (-2 * ratio * w * s.v - w * w * (s.x - target)) * h;
    s.x += s.v * h;
  }
  return s.x;
}
// where the head is for a given trunk, by walking up the spine: the hands are carried with it
function headOf(hips, spine) {
  let R = M.euler(spine.Hips),
    p = hips,
    prev = 'Hips';
  for (const name of ['Spine1', 'Spine2', 'Chest', 'Neck1', 'Head']) {
    p = M.add(p, M.app(R, M.sub(TPOSE[name], TPOSE[prev])));
    R = M.mul(R, M.euler(spine[name] || [0, 0, 0]));
    prev = name;
  }
  return M.add(p, M.app(R, [0, 0.1, 0.02]));
}
// where the chest is and how it is turned, for the same: a hand that is locked to it is swung by it
function chestOf(hips, spine) {
  let R = M.euler(spine.Hips),
    p = hips,
    prev = 'Hips';
  for (const name of ['Spine1', 'Spine2', 'Chest']) {
    p = M.add(p, M.app(R, M.sub(TPOSE[name], TPOSE[prev])));
    R = M.mul(R, M.euler(spine[name] || [0, 0, 0]));
    prev = name;
  }
  return { p, R };
}
function trunk(c) {
  const lean = GUARD.lean + c.lean,
    yaw = GUARD.yaw + c.yaw,
    twist = GUARD.twist + c.twist,
    look = -(yaw + twist) * 0.45 + c.hw * 0.5; // the eyes stay on the opponent whatever the shoulders do
  return {
    Hips: [lean * 0.4 + c.tip, yaw, -c.side * 0.4],
    Spine2: [lean * 0.3, twist * 0.4, -c.side * 0.3],
    Chest: [lean * 0.3, twist * 0.6, -c.side * 0.3],
    Neck1: [GUARD.chin * 0.5 - lean * 0.2 + c.hp * 0.5, look, -c.hr * 0.5],
    Head: [GUARD.chin * 0.5 - lean * 0.2 + c.hp * 0.5, look, -c.hr * 0.5]
  };
}
const ZERO = Object.fromEntries(CHANNELS.map(ch => [ch, 0]));
const REST = headOf(GUARD.hips, trunk(ZERO));
const CHEST = chestOf(GUARD.hips, trunk(ZERO));

const REACH = LEN.upperArm + LEN.foreArm - 0.03; // as far as a wrist gets from its shoulder
const BENT = 0.4; // and as far as it gets with the elbow held at a right angle
const unit = v => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
// a direction turned a share t of the way from a to b, the short way round
function swingTo(a, b, t) {
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1),
    th = Math.acos(d);
  if (th < 1e-4) return b;
  const s = Math.sin(th);
  return unit(M.add(M.scale(a, Math.sin((1 - t) * th) / s), M.scale(b, Math.sin(t * th) / s)));
}

// the guard itself, standing still: the pose the boxer is sculpted and lit in
export const guardPose = () => {
  return solve({
    hips: GUARD.hips,
    spine: trunk(ZERO),
    feet: GUARD.feet,
    hands: { L: { at: GUARD.hands.L, pole: [0.5, -1, -0.2] }, R: { at: GUARD.hands.R, pole: [-0.5, -1, -0.2] } }
  });
};

export function createAnimator(seed) {
  const c = {}, // this frame's channels
    shown = {}, // last frame's, as drawn
    speed = {}, // and how fast each was changing
    carry = {}; // what is still owed to the move before: { x, v } a channel, sprung to nothing
  for (const ch of CHANNELS) (shown[ch] = 0), (speed[ch] = 0), (carry[ch] = { x: 0, v: 0 });
  let sunk = 0, // how far the hips are down for the spread of the feet
    clock = (seed || 0) * 0.37,
    beat = 0, // where in the cycle of his feet he is, in turns; a foot comes down at every half
    half = -1, // which half of a cycle the beat was in last frame (so a new one is seen), and how many there have been
    halves = 0,
    cycle = CYCLE.rest, // how long that cycle is taking just now, seconds
    cover = 0,
    cheer = 0,
    doing = null;
  // how fast the canvas is going past under each foot, followed a little late so a shove or a stop does not snatch the feet
  const under = { L: [0, 0], R: [0, 0] },
    /* The feet are on the canvas, not on the body. A planted foot stays where it was put while the body travels and turns
       over it (its place is kept in his own space and carried back as the canvas goes by); at every half beat one foot is
       chosen to step, and is brought from where it was to where it should be, leaving and landing at rest on the canvas. */
    planted = { L: GUARD.feet.L.at.slice(), R: GUARD.feet.R.at.slice() },
    swing = { side: null, from: null, last: ['L', 'R'], to: null, still: false, back: false },
    lag = { x: 0, v: 0 }, // the upper body following the bounce, a touch late: what makes the gloves and head ride it
    elbow = { L: null, R: null }, // which way each elbow was pointing from its shoulder, last frame
    // where each hand was drawn last frame and how fast it was going, and what is still owed to the move before
    hand = { L: null, R: null },
    handSpeed = { L: [0, 0, 0], R: [0, 0, 0] },
    handCarry = { L: { x: [0, 0, 0], v: [0, 0, 0] }, R: { x: [0, 0, 0], v: [0, 0, 0] } },
    steer = { L: [0, 0, 0], R: [0, 0, 0] }; // how far each hand is being carried off its punch's nominal line onto the target
  // the give of a struck body: head (nod, turn, tilt), trunk (lean, side, turn), and how far the guard is knocked open
  const give = { hp: { x: 0, v: 0 }, hw: { x: 0, v: 0 }, hr: { x: 0, v: 0 }, lean: { x: 0, v: 0 }, side: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, open: { x: 0, v: 0 }, sink: { x: 0, v: 0 } };

  return {
    /* The blow's impulse is shared out by where it was going: back through the head nods it back, across turns and tilts
       it, upward lifts the chin; the trunk follows more slowly; the guard is knocked open. */
    strike(hit) {
      const k = hit.J / 55, // a clean cross is about 55 newton-seconds
        [left, up, ahead] = hit.dir;
      give.hp.v += (ahead * 800 - up * 1000) * k;
      give.hw.v += left * 900 * k;
      give.hr.v += -left * 400 * k;
      give.lean.v += (ahead * 300 - up * 260) * k;
      give.side.v += -left * 260 * k;
      give.yaw.v += left * 300 * k;
      give.sink.v += Math.max(0, up) * 1.1 * k;
      give.open.v += 7 * k;
    },
    // where his feet are in their rhythm: the beat (turns), how long a cycle is taking, and how many half beats there have been
    get rhythm() {
      return { beat, cycle, halves, stepping: swing.side };
    },
    update(view, dt) {
      clock += dt;
      for (const ch of CHANNELS) c[ch] = 0;
      const action = view.action,
        id = action ? action.id : null;

      // ---- what he is doing
      if (action && MOVES[action.name].punch) {
        // a punch: what its wind-up and each joint of its chain add, by how far each has turned
        const move = MOVES[action.name],
          chain = action.chain;
        for (const ch in move.coil) c[ch] += move.coil[ch] * chain.coil.q;
        LINKS.forEach((link, i) => {
          for (const ch in move.links[link]) c[ch] += move.links[link][ch] * chain.q[i];
        });
      } else if (action) {
        sampleMove(MOVES[action.name], action.t, c);
        if (action.name === 'dash' && action.dir) {
          const a = -c.hy / 0.075; // the dash's own rise and fall, as 0..1
          c.side += a * 13 * action.dir[0];
          c.lean += a * 8 * action.dir[1];
          c.hw += a * 8 * action.dir[0];
        }
      }
      cover += (clamp(view.cover || 0, 0, 1) - cover) * (1 - Math.exp(-dt * 22));
      cheer += ((view.cheer ? 1 : 0) - cheer) * (1 - Math.exp(-dt * 5));
      if (cover > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.cover, 1, {}))) c[ch] += v * cover;
      if (cheer > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.cheer, 1, {}))) c[ch] += v * smooth(cheer);

      // ---- the beat of his feet: how fast the canvas is passing under each, and so how quick the rhythm is
      const [vx, vz] = view.move || [0, 0],
        turn = view.turn || 0,
        feet = {};
      let fastest = 0;
      {
        const follow = 1 - Math.exp(-dt * 16);
        for (const side of ['L', 'R']) {
          const g = GUARD.feet[side],
            u = under[side];
          // the ground speed of this foot's place under the body, walking and turning together, followed a little late
          u[0] += (vx + turn * g.at[2] - u[0]) * follow;
          u[1] += (vz - turn * g.at[0] - u[1]) * follow;
          fastest = Math.max(fastest, Math.hypot(u[0], u[1]));
          feet[side] = { g, fx: u[0], fz: u[1] };
        }
      }
      const going = clamp(fastest / 1.5, 0, 1); // 0 bouncing on the spot .. 1 travelling
      cycle += (CYCLE.rest + (CYCLE.travel - CYCLE.rest) * going - cycle) * (1 - Math.exp(-dt * 10)); // (quick enough to keep up, slow enough not to snap the bounce)
      /* Setting off: the foot on the side he is going should move first. If the other one was already up, hopping in place,
         it is only set back down under him in its place (it takes no step of its own), and the right foot steps first. */
      const speedNow = Math.hypot(vx, vz),
        mid = [(GUARD.feet.L.at[0] + GUARD.feet.R.at[0]) / 2, (GUARD.feet.L.at[2] + GUARD.feet.R.at[2]) / 2],
        leads = side => {
          const g = GUARD.feet[side].at,
            out = [g[0] - mid[0], g[2] - mid[1]];
          return speedNow > 0.25 ? (vx * out[0] + vz * out[1]) / (speedNow * Math.hypot(out[0], out[1])) : 0;
        };
      if (swing.side && swing.still && leads(swing.side) < -0.3) swing.back = true;
      if (!view.still) beat = (beat + dt / cycle) % 1;
      const now = Math.floor(beat * 2),
        u = beat * 2 - now; // how far through this half beat: 0 a foot has just come down
      // the canvas going past under any point of his own space, this frame
      const drift = p => [-(vx + turn * p[2]) * dt, -(vz - turn * p[0]) * dt];
      for (const side of ['L', 'R']) {
        const d = drift(planted[side]);
        planted[side][0] += d[0];
        planted[side][2] += d[1];
      }
      // (and where the stepping foot left, and where it is to come down: both are spots on the canvas)
      for (const spot of [swing.from, swing.to])
        if (spot) {
          const d = drift(spot);
          spot[0] += d[0];
          spot[2] += d[1];
        }
      // where a foot should come down: centred on its place, so that it is drawn back through it while it is planted
      const landing = side => {
        if (swing.back && swing.side === side) return GUARD.feet[side].at.slice();
        const g = GUARD.feet[side].at,
          f = feet[side],
          ahead = cycle / 4,
          l = Math.hypot(f.fx, f.fz) * ahead,
          k = l > STRIDE ? STRIDE / l : 1;
        return [g[0] + f.fx * ahead * k, g[1], g[2] + f.fz * ahead * k];
      };
      if (now !== half) {
        // ---- a foot comes down, and the next is chosen to step
        half = now;
        halves++;
        // (was the foot that has just come down only hopping in place, or did it go somewhere?)
        const hopped = !swing.side || (swing.still && Math.hypot(swing.to[0] - swing.from[0], swing.to[2] - swing.from[2]) < 0.1);
        if (swing.side) planted[swing.side] = swing.to.slice();
        swing.side = swing.from = swing.to = null;
        swing.back = false;
        if (!view.still && !(action && action.name === 'ko')) {
          /* The foot that steps is the one that most needs to be somewhere else; travelling, the foot on the side he is going
             steps first (a boxer never crosses his feet or brings them together); otherwise they take turns. */
          const score = side => {
            const to = landing(side),
              need = Math.hypot(to[0] - planted[side][0], to[2] - planted[side][2]);
            return need + 0.07 * leads(side) + (swing.last[1] === side ? 0 : 0.03) - (swing.last[0] === side && swing.last[1] === side ? 1 : 0);
          },
            // setting off from a hop in place, the first step is always the foot on the side he is going
            first = hopped && speedNow > 0.25 && !(swing.last[0] === swing.last[1] && leads(swing.last[1]) > 0),
            side = first ? (leads('L') >= leads('R') ? 'L' : 'R') : score('L') >= score('R') ? 'L' : 'R';
          swing.side = side;
          swing.still = speedNow < 0.25; // (a hop in place, not a step anywhere)
          swing.from = planted[side].slice();
          swing.last = [swing.last[1], side];
        }
      }

      // ---- the bounce: down into each landing and back up off it, the weight swinging between the feet like a pendulum
      const lively = view.still ? 0 : action ? 0.35 : 1 + cheer * 1.6,
        spot = (1 - going) * lively, // how much of this is bouncing on the spot
        /* he bounces most on the spot: travelling, the beat quickens and the bounce shrinks with the square of it, so it is as
           soft a rebound at a run as standing (and at full speed he glides) */
        ride = lively * (cycle / CYCLE.rest) ** 2,
        C = BOUNCE.contact,
        sinking = u < C,
        g = sinking ? Math.sin((Math.PI * u) / C) : 0, // 0..1..0 through the squash
        s = sinking ? 0 : (u - C) / (1 - C), // 0..1 through the float
        y = (sinking ? -BOUNCE.squash * g : BOUNCE.float * 4 * s * (1 - s)) * ride,
        // forward while the rear foot is up, back while the lead is: through the middle at every landing
        rock = swing.side ? (swing.side === 'L' ? -1 : 1) * Math.sin(Math.PI * u) : 0,
        trail = spring(lag, y, dt, 4.2, 0.32) - y; // how far the upper body is behind the hips
      c.hy += y;
      // squashed into the landing and stretched off it, each starting and ending at rest (the head is a long way from the canvas)
      c.st += (sinking ? -0.011 * g * g : 0.01 * Math.sin(Math.PI * s) ** 2 * (1 - s)) * ride;
      c.lean += 1.3 * g * g * ride + 1.6 * rock * spot;
      c.hz += ROCK * rock * spot;
      c.hx += 0.007 * Math.sin(TAU * beat + 1) * ride;
      c.hp -= 220 * trail; // the head nods with the bounce a moment after it
      c.ly += 0.9 * trail - 0.006 * rock * ride;
      c.ry += 0.9 * trail + 0.006 * rock * ride;
      c.lz += 0.012 * rock * ride;
      c.st += 0.006 * Math.sin(TAU * 0.4 * clock) * (view.still ? 0 : 1);
      const up = sinking ? 0 : 4 * s * (1 - s); // 0..1: how far off his heels the float has him

      // ---- the give of a body that has been hit
      c.hp += spring(give.hp, 0, dt, 3.4, 0.42);
      c.hw += spring(give.hw, 0, dt, 3.4, 0.42);
      c.hr += spring(give.hr, 0, dt, 3.4, 0.42);
      c.lean += spring(give.lean, 0, dt, 2.1, 0.55);
      c.side += spring(give.side, 0, dt, 2.1, 0.55);
      c.yaw += spring(give.yaw, 0, dt, 2.1, 0.55);
      c.hy -= Math.abs(spring(give.sink, 0, dt, 2.4, 0.6)) * 0.5;
      const open = spring(give.open, 0, dt, 2.6, 0.6);
      c.lx += 0.09 * open;
      c.ly -= 0.05 * Math.abs(open);
      c.rx -= 0.09 * open;
      c.ry -= 0.05 * Math.abs(open);

      // ---- one move handing over to another: what was showing is let go of, not dropped
      const handover = id !== doing;
      if (handover) {
        doing = id;
        for (const ch of CHANNELS) {
          if (ch === 'aim') continue;
          carry[ch].x = shown[ch] - c[ch];
          carry[ch].v = speed[ch];
        }
      }
      for (const ch of CHANNELS) {
        if (ch === 'aim') continue; // not part of the pose: it says how hard a hand is being steered, and has its own follower
        const k = carry[ch];
        if (k.x || k.v) {
          // critically damped, exact: x(t) = (x + (v + w x) t) e^(-w t)
          const e = Math.exp(-SETTLE * dt),
            j = k.v + SETTLE * k.x;
          k.x = (k.x + j * dt) * e;
          k.v = (k.v - SETTLE * j * dt) * e;
          if (Math.abs(k.x) < 1e-6 && Math.abs(k.v) < 1e-5) k.x = k.v = 0;
          c[ch] += k.x;
        }
        speed[ch] = dt > 0 ? (c[ch] - shown[ch]) / dt : 0;
        shown[ch] = c[ch];
      }

      // ---- the feet: the planted one where it was put, the stepping one on its way from there to where it should land
      let dip = 0;
      for (const side of ['L', 'R']) {
        const g = GUARD.feet[side],
          k = side === 'L' ? 'lf' : 'rf',
          stepping = swing.side === side;
        let at = planted[side],
          lift = 0,
          pitch = (side === 'R' ? 6 : 3) * up * lively; // a planted foot is on its ball, the heel riding up with the float
        if (stepping) {
          // where it will come down, as a spot on the canvas: carried back with the canvas for the time still to go
          const land = landing(side),
            left = ((1 - u) * cycle) / 2,
            f = feet[side],
            to = [land[0] + f.fx * left, land[1], land[2] + f.fz * left],
            from = swing.from,
            e = u * u * u * (10 + u * (6 * u - 15)), // leaves and lands at rest
            length = Math.hypot(to[0] - from[0], to[2] - from[2]);
          swing.to = to;
          at = [from[0] + (to[0] - from[0]) * e, g.at[1], from[2] + (to[2] - from[2]) * e];
          // travelling, a foot is lifted by its stride; on the spot it is only unweighted and snapped up off the canvas
          lift = (Math.min(0.075, length * 0.35) + HOP * spot) * Math.pow(Math.sin(Math.PI * u), 1.3);
          pitch = 14 * Math.sin(TAU * u) * clamp(length / 0.2, 0, 1) + 8 * spot * Math.sin(Math.PI * u);
        } else {
          // a foot left too far behind by a shove or a dash is dragged, not left to pull the leg straight
          const o = [at[0] - g.at[0], at[2] - g.at[2]],
            l = Math.hypot(o[0], o[1]),
            most = STRIDE * 1.2;
          if (l > most) (at[0] = g.at[0] + (o[0] * most) / l), (at[2] = g.at[2] + (o[1] * most) / l);
        }
        // the hips come down a little as the feet are spread (as much as a long stride asks, and no more)
        dip += Math.min(0.04, (at[0] - g.at[0]) ** 2 + (at[2] - g.at[2]) ** 2) * 0.3;
        feet[side] = {
          at: [at[0] + c[k + 'x'], g.at[1] + c[k + 'y'] + lift, at[2] + c[k + 'z']],
          yaw: g.yaw + c[k + 'w'],
          pitch: g.pitch + c[k + 'p'] + pitch
        };
      }

      // ---- solve
      sunk += (dip - sunk) * (1 - Math.exp(-dt * 24)); // (followed, so a foot snapping through its swing does not jerk the hips)
      const hips = [GUARD.hips[0] + c.hx, Math.max(0.15, GUARD.hips[1] + c.hy - sunk), GUARD.hips[2] + c.hz],
        spine = trunk(c),
        head = headOf(hips, spine),
        carried = M.sub(head, REST), // the hands go where the head goes: a guard is held to the face, not to the room
        hands = {};
      /* A punch is written to land at a nominal spot in front of the guard. With a head to hit, the hand is carried off
         that line by however much it takes to land there instead, in step with how far the punch has been thrown: so it
         leaves the guard as written, arrives on the target at the moment it would have arrived at nothing, and comes back
         the same way. Each hand follows its own correction a touch late, so one punch handing over to the next never
         snatches either of them. */
      const chest = chestOf(hips, spine),
        swung = M.mul(chest.R, M.tr(CHEST.R)),
        // (the target is where it will be drawn; the boxer is solved before he is stretched, so it is put back through that)
        tall = 1 + c.st,
        wide = Math.sqrt(tall),
        target = view.aim && [view.aim[0] * wide, view.aim[1] / tall, view.aim[2] * wide];
      for (const side of ['L', 'R']) {
        const k = side === 'L' ? 'l' : 'r',
          s = side === 'L' ? 1 : -1,
          flare = clamp(c[k + 'e'], 0, 1),
          open = M.add(GUARD.hands[side], [c[k + 'x'], c[k + 'y'], c[k + 'z']]),
          // held to the face, or locked to the chest and swung with it, or part way between
          free = M.lerp(M.add(open, carried), M.add(chest.p, M.app(swung, M.sub(open, CHEST.p))), clamp(c[k + 'c'], 0, 1)),
          mine = action && MOVES[action.name].punch && MOVES[action.name].hand === side ? MOVES[action.name] : null;
        if (mine) {
          /* The punching arm is not sent anywhere: it is thrown. The shoulder and elbow are the last two joints of the
             chain, and where the fist is follows from how far each has turned, on top of wherever the body has carried the
             shoulder by then. */
          const chain = action.chain,
            shoulder = M.add(chest.p, M.app(chest.R, M.sub(TPOSE[(side === 'L' ? 'Left' : 'Right') + 'Arm'], TPOSE.Chest))),
            swing = clamp(chain.q[3], 0, 1.06),
            extend = clamp(chain.q[4], 0, 1.05);
          let thrown;
          if (mine.arm === 'straight') {
            // the shoulder turns the arm onto the line of the target; the elbow straightens it along that line
            const to = target || [s * 0.02, 1.46, shoulder[2] + 0.75],
              from = M.sub(free, shoulder),
              line = M.sub(to, shoulder),
              folded = Math.hypot(from[0], from[1], from[2]),
              out = Math.min(REACH, Math.hypot(line[0], line[1], line[2]));
            thrown = M.add(shoulder, M.scale(swingTo(unit(from), unit(line), swing), folded + (out - folded) * extend));
          } else {
            // the arm stays bent and the body brings it: the shoulder only closes what is left between the fist and the target
            const to = target || M.add(free, mine.arm === 'lift' ? [s * -0.1, 0.36, 0.38] : [s * -0.1, 0.02, 0.06]);
            thrown = M.lerp(free, to, swing);
            // (bent is bent: a hook thrown from too far away does not grow into a straight punch to get there)
            const out = M.sub(thrown, shoulder),
              far = Math.hypot(out[0], out[1], out[2]);
            if (far > BENT) thrown = M.add(shoulder, M.scale(out, BENT / far));
          }
          steer[side] = M.sub(thrown, free);
        } else {
          // a hand whose punch has been cut short by the next one is let back to its guard, not dropped there
          const k = Math.exp(-dt * 18);
          steer[side] = M.scale(steer[side], k);
        }
        /* Where the elbow points is asked for, not ordered: it leans toward where the move wants it from where it was, so an
           arm passing through a pose with no good answer (a wrist crossing its own shoulder) cannot flip over in a frame. */
        const asked = M.app(chest.R, [s * (0.5 + 0.8 * flare), -1 + 1.3 * flare, -0.2 - 0.25 * flare]),
          l = Math.hypot(asked[0], asked[1], asked[2]) || 1,
          keep = elbow[side] ? Math.exp(-dt * 16) : 0;
        /* One punch handing over to the next (a double jab, a jab into a cross) starts the new chain from the guard while the
           hand is still out: what the hand was doing is carried over and let go of, the way the channels are, so it goes on
           from where it is instead of snapping home first. */
        const raw = M.add(free, steer[side]),
          carry = handCarry[side];
        if (handover && hand[side]) {
          carry.x = M.sub(hand[side], raw);
          carry.v = handSpeed[side].slice();
        }
        const e = Math.exp(-SETTLE * dt);
        for (let i = 0; i < 3; i++) {
          const j = carry.v[i] + SETTLE * carry.x[i];
          carry.x[i] = (carry.x[i] + j * dt) * e;
          carry.v[i] = (carry.v[i] - SETTLE * j * dt) * e;
        }
        const at = M.add(raw, carry.x);
        if (hand[side] && dt > 0) handSpeed[side] = M.scale(M.sub(at, hand[side]), 1 / dt);
        hand[side] = at;
        hands[side] = { at, toward: M.lerp(M.scale(asked, 1 / l), elbow[side] || [0, 0, 0], keep) };
      }
      const pose = solve({ hips, spine, feet, hands, stretch: 1 + c.st });
      for (const [side, Side] of [['L', 'Left'], ['R', 'Right']]) {
        const d = M.sub(pose.at[Side + 'ForeArm'], pose.at[Side + 'Arm']),
          l = Math.hypot(d[0], d[1], d[2]) || 1;
        elbow[side] = M.scale(d, 1 / l);
      }
      return pose;
    }
  };
}
