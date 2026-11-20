/* The match: two boxers on a square of canvas, stepped at a fixed rate from two sets of controls. Nothing here draws, and the
   same code runs in the page and under node --test.
     const bout = createBout(seed, { sheets: [mine, his] (profile.mjs: who they are; an honest club fighter if left out),
                                     skills: [mine, his] (anim/skill.mjs: the grade each throws each move at, by name or
                                     `all`; a pro's if left out),
                                     knockdowns: true (a boxer who runs out of health goes down and the match counts him;
                                     left out, he is knocked out and the bout is over) })
     step(bout, [mine, his], dt)
     getUp(bout, f)         a man who has beaten the count gets up, where he lies, the way that fits how he lies (anim/
                            animator.mjs: getUp); -> the rise he starts
       controls: { move: [x, z] (a direction on the canvas, up to 1 long), jab, power (true on the tick pressed),
                   cover (true while held), dash: [x, z] | true (on the tick flicked; true is straight back),
                   slip: 1 | -1 (the head off the line, to his left or right), duck: true | 1 | -1 (down under a punch in a
                   shallow U, coming up on his left, or with -1 his right),
                   roll: 1 | -1 (bob and weave: down under it and up on his left or right), pull: true (the head swayed
                   back out of reach) }
     bout.events            what happened this step, for the picture and the sound (a dirty boxer's fouls among them:
                            { type: 'foul', name: stomp | thumb, who, on, J }; nobody penalises them). A punch that misses
                            says by how much (whiff: margin, metres between the glove's and the head's surfaces at the
                            closest), and a defence that was brilliant says so: { type: 'brilliant', who (the defender),
                            on, of: 'whiff' | 'parry', margin, late, from (bout time the punch was pressed), counter (the
                            id of the punch he answered with) }, and its whiff or parry event is marked brilliant: true
     bout.fighters[i].pose  his solved pose this step (and .place: where on the canvas, .points: gloves and head in the world)

   A punch is physics from the feet to the glove. Pressing a button only starts a kinetic chain (phys/chain.mjs); the joints
   fire in turn, the body is solved every step, and a punch lands when, and only when, the glove meets the other man's head.
   What it does then is the impulse it delivers: the glove's speed into the head, times the mass the chain has put behind it
   at that instant. So a punch from too far falls short, one thrown too close arrives before the elbow has straightened and
   is weak, and getting the head out of the way is the dodge. A guard held up puts the gloves in the way; one raised just
   before the punch turns it aside and opens a counter.

   How a man gets out of the way is his grade's (anim/evade.mjs): how long it takes, how long he is tied up in it, and when
   a punch may start out of it (a great one's from the moment his head is off the line, a pro's from most of the way back, the
   rest once it is over). A punch started out of the end of an evasion has its wind-up and leg drive done already, as far as
   the evasion's end is that punch's coil (the hand it leaves wound up: evade.mjs LOADED): it gets there sooner, not harder.
   A parry leaves a punch wound up the same way, by the grade of his guard. A defence is brilliant when the punch missed by
   three centimetres or less (or his head was clear of it by less than a frame), or the guard went up as late as it could and
   still turned it aside, and a loaded punch went back within 0.4 s of the defence starting. */
const BRILLIANT = { margin: 0.03, within: 0.4 };
import * as M from '../rig/m3.mjs';
import { MOVES, RISE } from '../anim/moves.mjs';
import { createAnimator } from '../anim/animator.mjs';
import { toWorld } from '../anim/pose.mjs';
import { createChain, stepChain, effectiveMass, preload } from '../phys/chain.mjs';
import * as P from '../anim/pose.mjs';
import { RING } from '../world/ring.mjs';
import { LEN } from '../rig/solve.mjs';
import { body, blank, fatigue, COST } from './profile.mjs';
import { levelOf } from '../anim/skill.mjs';
import { timeline, evadeTime, progress, LOADED } from '../anim/evade.mjs';

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
  damage: 0.035, // health lost per newton-second
  mass: 75, // kilograms: what a blow has to push
  shove: 2.2, // how much more than physics a blow moves a man (it is a game)
  stun: [0.16, 1 / 260], // seconds: a floor, plus so much per newton-second
  stop: [0.03, 0.13, 1 / 900], // the held moment: least, most, and seconds per newton-second
  // ---- defence
  parry: 0.17, // a guard this fresh turns a punch aside
  guardUp: 0.63, // and a guard is in the way once the gloves have got this far into it (anim/skill.mjs: cover.arrive)
  counter: 0.95, // seconds the opening lasts
  counterGain: 1.8,
  smother: 0.15, // share of a blow that gets through a held guard
  buffer: 0.2,
  combo: 0.55, // a power punch this soon after the last becomes the next in the chain
  chain: ['cross', 'hook', 'upper'],
  dash: { reach: 1.2 },
  stepIn: 2.6, // metres a second he closes at while throwing, down to the punch's own range
  lunge: 60, // metres a second a second: how quickly a step in gathers speed and sheds it
  hookDrop: 0.09, // how far below his own head a hook can be swung
  drop: 1, // health a finishing blow had to spare at most to put him down on a knee rather than flat
  jaw: 0.08, // how far below the middle of the head a hook is aimed
  startGap: 2.4
};
const DT = 1 / 60;

function boxer(x, yaw, seed, sheet, skills) {
  const k = body(sheet);
  return { sheet: sheet || blank(), skills: skills || {}, k, stamina: k.staminaMax, x, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, ix: 0, iz: 0, gx: 0, gz: 0, yaw, turn: 0, hp: RULES.hp, action: null, cover: false, coverAge: 0, stun: 0, counter: 0, flash: 0, want: null, wantAge: 0, link: 0, sinceHit: 9, sinceLast: 9, serial: 0, down: 0, pinned: 0, animator: createAnimator(seed), pose: null, place: null, points: null, before: null };
}
export function createBout(seed, o) {
  o = o || {};
  const sheets = o.sheets || [],
    bout = { t: 0, stop: 0, over: null, overAt: 0, seed: seed || 1, events: [], knockdowns: !!o.knockdowns, fighters: [boxer(-RULES.startGap / 2, Math.PI / 2, 0, sheets[0], (o.skills || [])[0]), boxer(RULES.startGap / 2, -Math.PI / 2, 1, sheets[1], (o.skills || [])[1])] };
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
// the ways of getting the head out of the way, as controls name them (each a move of its own, with a side where it has one)
const EVADE = ['slip', 'duck', 'roll', 'pull'];
const pressOf = input => (input.dash ? ['dash', input.dash] : EVADE.find(n => input[n]) ? [EVADE.find(n => input[n]), input[EVADE.find(n => input[n])]] : input.jab ? ['jab'] : input.power ? ['power'] : null);
// a punch still on its way out: wound up or being thrown, and not yet landed
export const incoming = f => (punching(f) && !f.action.struck && (f.action.chain.phase === 'coil' || f.action.chain.phase === 'throw') ? f.action : null);
// may he start something new? In the middle of a punch, only another punch, and only once this one has been thrown
const open = (f, punch) =>
  f.stun <= 0 &&
  (!f.action ||
    (punch && punching(f) && (f.action.chain.phase === 'hold' || f.action.chain.phase === 'recover')) ||
    // (out of an evasion, from the moment his grade lets him: anim/skill.mjs, evade.cut)
    (punch && isEvasion(f.action.name) && f.action.t >= timeline(f.action.name, f.action.level).cut - 1e-9));

const isEvasion = name => EVADE.includes(name);
// the evasion a man is in (or came out of a moment ago), and how far into it: what a punch started now is thrown out of
const GRACE = 0.1; // seconds after an evasion is over that its end is still the coil of the next punch
function loadOf(f, bout, move) {
  const e = f.action && isEvasion(f.action.name) ? f.action : f.lastEvade && f.lastEvade.endedAt !== null && bout.t - f.lastEvade.endedAt <= GRACE ? f.lastEvade.action : null;
  if (e) {
    const ev = e.level.evade;
    return LOADED(e.name, e.side) === move.hand ? { load: ev.load, from: e.id } : null;
  }
  // a parry: the other hand, or the one that turned it aside, by the grade of his guard
  const p = f.parried;
  if (p && bout.t - p.at <= RULES.counter) {
    const cv = p.level.cover;
    if ((cv.hand === 'same') === (move.hand === p.hand)) return { load: cv.load, shoulder: cv.q, from: 'parry' };
  }
  return null;
}
function begin(f, name, more, bout) {
  const move = MOVES[name],
    before = f.action,
    level = levelOf(f.skills, name),
    // his muscles: as quick as his speed, and slower as he tires (never below three quarters of it); his skill: how he uses them
    chain = move.punch ? createChain(move, f.k.rate * (0.75 + 0.25 * fatigue(f)), level) : null;
  if (COST[name]) f.stamina = Math.max(0, f.stamina - COST[name]);
  // a punch thrown with the hand that has just punched starts from where that arm's joints still are (a double jab)
  if (chain && before && before.chain && MOVES[before.name].hand === move.hand) (chain.q = before.chain.q.slice()), (chain.v = before.chain.v.slice());
  // out of the end of an evasion or a parry: wound up already
  const loaded = chain && bout ? loadOf(f, bout, move) : null;
  if (loaded) preload(chain, move, loaded.load, loaded.shoulder);
  if (before && isEvasion(before.name) && f.lastEvade && f.lastEvade.action === before) f.lastEvade.endedAt = bout ? bout.t : 0;
  f.action = Object.assign({ name, t: 0, id: name + ++f.serial, struck: false, chain, level, at: bout ? bout.t : 0, loaded: loaded && loaded.load > 0 ? loaded : null }, more);
  if (isEvasion(name)) (f.lastEvade = { action: f.action, name, start: bout ? bout.t : 0, endedAt: null }), (f.action.head0 = f.points ? f.points.head.slice() : null);
  f.cover = false;
}

function decide(bout, f, input, dt, who) {
  const pressed = pressOf(input);
  if (pressed) (f.want = pressed), (f.wantAge = 0);
  else if (f.want && (f.wantAge += dt) > RULES.buffer) f.want = null;
  if (f.want) {
    const [what, dir] = f.want,
      punch = what !== 'dash' && !EVADE.includes(what);
    // (a man whose lead foot is stood on cannot dash or sway back off it; he can still slip and duck)
    if (f.pinned > 0 && (what === 'dash' || what === 'pull')) f.want = null;
    else if (open(f, punch)) {
      f.want = null;
      if (EVADE.includes(what)) {
        begin(f, what, { side: dir === true ? 1 : dir }, bout);
        // (what he is getting out of the way of: the other man's punch on its way, if there is one)
        const other = bout.fighters[1 - who],
          coming = incoming(other) || (punching(other) && other.action.chain.phase === 'hold' && !other.action.struck ? other.action : null);
        f.defence = { kind: 'evade', start: bout.t, of: coming ? coming.id : null, from: coming ? coming.at : bout.t, margin: null, late: false, counterAt: null, event: null, said: false };
        bout.events.push({ type: what, who });
      } else if (!punch) {
        const [fx, fz] = aheadOf(f);
        let d = dir === true ? [-fx, -fz] : dir;
        const l = Math.hypot(d[0], d[1]) || 1;
        d = [d[0] / l, d[1] / l];
        begin(f, 'dash', { dir: local(f, d[0], d[1]), go: d }, bout);
        bout.events.push({ type: 'dash', who });
      } else {
        let name = 'jab';
        // (out of an evasion, a power punch is the one it has wound up: the rear hand's straight, the lead hook off a slip
        // or a weave to the left, the uppercut out of a duck)
        const out = f.action && isEvasion(f.action.name) ? f.action : f.lastEvade && f.lastEvade.endedAt !== null && bout.t - f.lastEvade.endedAt <= GRACE ? f.lastEvade.action : null;
        if (what === 'power' && out && out.level.evade.load > 0) {
          name = LOADED(out.name, out.side) === 'L' ? 'hook' : out.name === 'duck' ? 'upper' : 'cross';
          f.link = Math.max(0, RULES.chain.indexOf(name));
        } else if (what === 'power') {
          f.link = f.sinceLast < RULES.combo && f.lastPower ? (f.link + 1) % RULES.chain.length : 0;
          name = RULES.chain[f.link];
        }
        begin(f, name, { counter: f.counter > 0 }, bout);
        // a loaded punch answering a defence: what makes the defence brilliant, if it was close enough
        if (f.action.loaded && f.defence && f.defence.counterAt === null && bout.t - f.defence.start <= BRILLIANT.within + 1e-9) (f.defence.counterAt = bout.t), (f.defence.counter = f.action.id), judge(bout, f, who);
        f.lastPower = what === 'power';
        f.counter = 0;
        bout.events.push({ type: 'punch', who, name });
      }
    }
  }
  /* A stunned boxer can still pull his hands up (it is what a hurt man does) but not in time to turn a punch aside: his guard
     counts as an old one at once. A man thrown open by a parry, or in the middle of anything, cannot. */
  const dazed = f.stun > 0,
    covering = !!input.cover && !f.action;
  f.coverAge = covering ? (f.cover ? f.coverAge + dt : dazed ? 9 : 0) : 0;
  if (covering && !f.cover) bout.events.push({ type: 'cover', who });
  f.cover = covering;
}

function travel(f, input, dt, other) {
  const m = input.move || [0, 0],
    l = Math.hypot(m[0], m[1]),
    k = l > 1 ? 1 / l : 1,
    fresh = 0.78 + 0.22 * fatigue(f),
    walk = f.k.walk * fresh,
    top = f.stun > 0 || f.pinned > 0 || (f.action && !punching(f)) ? 0 : f.action ? RULES.punchSpeed : f.cover ? walk * (RULES.coverSpeed / RULES.speed) : walk,
    wx = m[0] * k * top,
    wz = m[1] * k * top,
    dx = wx - f.vx,
    dz = wz - f.vz,
    d = Math.hypot(dx, dz),
    most = f.k.accel * fresh * dt;
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
      rate = (30 * u * u * (1 - u) * (1 - u) * f.k.dash * fresh) / dur;
    sx = f.action.go[0] * rate;
    sz = f.action.go[1] * rate;
  }
  let ix = 0,
    iz = 0;
  if (incoming(f) && other && !other.down) {
    /* A punch is stepped into: he closes on a head that is just out of range, so a combination follows its target back
       and a counter reaches a man who has been thrown onto his heels. (It is the head he measures to, not the feet.) */
    const head = other.points ? other.points.head : [other.x, 0, other.z],
      ox = head[0] - f.x,
      oz = head[2] - f.z,
      far = (Math.hypot(ox, oz) || 1) + 0.09,
      close = Math.max(0, Math.min(RULES.stepIn * (f.action.counter ? 1.5 : 1), (far - MOVES[f.action.name].close) * 9));
    if (far < MOVES[f.action.name].reach + 0.6) (ix = (ox / far) * close), (iz = (oz / far) * close);
  }
  // (the step in is the legs driving him: it gathers speed and sheds it at most as fast as they can, and is not a jump)
  {
    const dx = ix - f.ix,
      dz = iz - f.iz,
      d = Math.hypot(dx, dz),
      most = RULES.lunge * dt;
    if (d <= most) (f.ix = ix), (f.iz = iz);
    else (f.ix += (dx / d) * most), (f.iz += (dz / d) * most);
    sx += f.ix;
    sz += f.iz;
  }
  // the ropes give: the last quarter of a metre is run out of speed, not into a wall
  const ease = (p, v) => (v * p > 0 ? Math.sign(v) * Math.min(Math.abs(v), Math.max(0, RULES.half - Math.abs(p)) * 9) : v);
  f.x += ease(f.x, f.vx + f.kx + sx) * dt;
  f.z += ease(f.z, f.vz + f.kz + sz) * dt;
}

function face(f, other, dt) {
  // (a man on the canvas, or getting up off it, does not turn to face anyone)
  if (f.down || (f.action && MOVES[f.action.name].floor)) return void (f.turn = 0);
  let want = Math.atan2(other.x - f.x, other.z - f.z);
  /* By the grade of his footwork (anim/skill.mjs: stance.travel): a beginner's chest follows the other man round late; an
     amateur, and a dirty man, let him get so far round and then turn all at once. */
  const tr = levelOf(f.skills, 'stance').stance.travel;
  if (tr.face) {
    f.faceTo = f.faceTo === undefined ? want : wrap(f.faceTo + wrap(want - f.faceTo) * (1 - Math.exp(-dt / tr.face)));
    want = f.faceTo;
  }
  if (tr.pivot) {
    const off = Math.abs(wrap(want - f.yaw)) * 57.3;
    if (off > tr.pivot) f.pivoting = true;
    else if (off < 1.5) f.pivoting = false;
    if (!f.pivoting) want = f.yaw;
  }
  // a boxer who has thrown his weight into a punch cannot swing round with it
  const rate = RULES.turnRate * (punching(f) ? 0.35 : f.stun > 0 ? 0.2 : 1);
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
      if (!f.action.struck) {
        const near = f.action.near,
          e = { type: 'whiff', who, name: move.name, margin: near ? +near.gap.toFixed(4) : null };
        bout.events.push(e);
        // (and what the man who got out of its way made of it)
        const other = bout.fighters[1 - who],
          d = other.defence;
        if (d && d.kind === 'evade' && d.of === f.action.id && d.event === null) {
          d.event = e;
          d.margin = e.margin;
          d.late = !!(near && near.late);
          judge(bout, other, 1 - who);
        }
      }
    }
    if (now === 'done') f.action = null;
  } else if (isEvasion(f.action.name)) {
    /* An evasion lasts as long as its grade makes it (anim/evade.mjs). A legend waits out there for the other man's arm to
       start home, and comes back with it (never later than his grade lets him wait). */
    const level = f.action.level,
      ev = level.evade,
      T = timeline(f.action.name, level),
      other = bout.fighters[1 - who];
    if (ev.follow && f.action.t - dt >= T.hold - 1e-9 && f.action.t < ev.follow) {
      // (until he has seen the arm go out and start home again; a punch that never comes, he gives up on at the most)
      const out = punching(other) && ['coil', 'throw', 'hold'].includes(other.action.chain.phase);
      if (out) f.action.seen = true;
      if (!f.action.back && (out || !f.action.seen)) f.action.held = (f.action.held || 0) + dt;
      else f.action.back = true;
    }
    if (ev.textbook ? f.action.t >= move.dur : evadeTime(f.action, T) >= T.end) {
      if (f.lastEvade && f.lastEvade.action === f.action) f.lastEvade.endedAt = bout.t;
      f.action = null;
    }
  } else if (f.action.t >= move.dur + (f.action.name === 'dash' && f.action.level ? f.action.level.dash.extra : 0)) {
    // (a dash ties him up as long as his grade lands it: skill.mjs, dash.extra)
    if (move.stay) f.action.t = move.dur;
    else f.action = null;
  }
}

/* A defence judged: a miss by a whisker (or a head clear of it by less than a frame), or a parry as late as it could be, and
   a loaded punch back within 0.4 s of the defence starting. Once a defence. */
function judge(bout, f, who) {
  const d = f.defence;
  if (!d || d.said || d.counterAt === null || !d.event) return;
  const close = d.kind === 'parry' ? d.late : (d.margin !== null && d.margin <= BRILLIANT.margin + 1e-9) || d.late;
  if (!close || d.counterAt - d.start > BRILLIANT.within + 1e-9) return;
  d.said = true;
  d.event.brilliant = true;
  bout.events.push({ type: 'brilliant', who, on: 1 - who, of: d.kind === 'parry' ? 'parry' : 'whiff', margin: d.margin, late: d.late, from: d.from, counter: d.counter, at: bout.t });
}

/* What boxer i is doing, in the words the animator takes. */
function viewOf(bout, i) {
  const f = bout.fighters[i],
    other = bout.fighters[1 - i],
    view = {
      move: local(f, f.gx, f.gz),
      turn: f.turn,
      cover: f.cover ? 1 : 0,
      // a guard still young enough to turn a punch aside: the gloves are out meeting it, not yet pulled in to the face
      meet: f.cover && f.coverAge < f.k.parry ? 1 - f.coverAge / f.k.parry : 0,
      // what the fight has taken out of him, for his body to show: hurt from his health, tired from his breath
      hurt: Math.max(0, Math.min(1, (45 - f.hp) / 45)),
      tired: Math.max(0, Math.min(1, (0.6 - f.stamina / f.k.staminaMax) / 0.6)),
      cheer: bout.over === i && bout.t - bout.overAt > 0.9,
      still: !!f.down && f.action.t >= MOVES[f.action.name].dur,
      action: f.action,
      aim: null,
      // how he stands and moves when he is doing nothing else (his grade of footwork), and whether a blow has stopped him
      stance: levelOf(f.skills, 'stance'),
      // and how he covers up (the guard, the block, the parry)
      guard: levelOf(f.skills, 'cover'),
      stun: f.stun > 0,
      shoved: Math.hypot(f.kx, f.kz),
      reach: null,
      // the other man, in his own terms: his lead foot's instep (what a dirty man stands on), and whether this man's own lead
      // foot is stood on
      foe: f.place && other.pose && other.points ? { foot: mine(f, at(other, 'LeftFoot', [0, -0.02, 0.07])) } : null,
      pinned: f.pinned > 0,
      // knocked down: what of the other man he cannot fall through, in his own terms
      near: f.down && f.place && other.pose ? NEAR.map(([joint, r]) => [mine(f, at(other, joint)), r]) : null
    };
  /* A punch coming at him: how soon it will get to his head at the speed it is closing, and which way it is going (his own
     terms). A great one covering up rides it, or goes out to take it early, the instant before it lands. */
  const coming = incoming(other);
  if (coming && other.points && other.before && f.points) {
    const hand = MOVES[coming.name].hand,
      g = other.points[hand],
      g0 = other.before[hand],
      h = f.points.head,
      gap = Math.hypot(h[0] - g[0], h[1] - g[1], h[2] - g[2]) - RULES.glove - RULES.head,
      was = Math.hypot(h[0] - g0[0], h[1] - g0[1], h[2] - g0[2]) - RULES.glove - RULES.head,
      v = (was - gap) / DT,
      [left, ahead] = local(f, g[0] - g0[0], g[2] - g0[2]);
    if (v > 0.5) view.threat = { eta: gap / v, dir: [left, ahead] };
  }
  if (punching(f) && !other.down && other.points) {
    /* Where the punch is thrown: at the head as it is now, wherever that is. The wrist is sent so that the glove's centre
       would end at the middle of the head (it will meet it before then): straight through for a straight punch, onto the
       side of the head for a hook, up under the chin for an uppercut. */
    const move = MOVES[f.action.name],
      h = other.points.head,
      [side, front] = local(f, h[0] - f.x, h[2] - f.z),
      glove = f.points && f.points[move.hand];
    // (how far the glove still has to go to meet it: a boxer who times his punches to his feet times them by this)
    if (glove) view.reach = Math.hypot(h[0] - glove[0], h[1] - glove[1], h[2] - glove[2]) - RULES.glove - RULES.head;
    if (f.action.aim) view.aim = f.action.aim;
    else if (Math.hypot(side, front) < 1.7 && front > 0.2) {
      const from = move.hand === 'L' ? 1 : -1,
        /* a hook is an arm locked at the shoulder and swung flat by the body, at the jaw: it can be thrown a little low, but
           not at a head that has gone down under it (that is what the uppercut is for) */
        low = move.arm === 'swing' ? Math.max(h[1] - RULES.jaw, f.points.head[1] - RULES.hookDrop) : h[1];
      view.aim = move.arm === 'swing' ? [side + from * 0.05, low, front - 0.1] : move.arm === 'lift' ? [side, h[1] - 0.1, front - 0.07] : [side, h[1], front - 0.075];
      /* Once the joint that steers it has fired the punch is committed: it goes where the head was then, and a head that has
         moved since is missed. That is what a slip is. (Up to then he is still looking, and a punch follows a head that
         drifts.) A straight punch and an uppercut are steered by the shoulder to the last; a hook is an arm locked to a
         body that is already turning, and its path is set when the hips go. (So a hook is ducked; an uppercut finds a
         ducking head.) */
      if (f.action.chain.on[move.arm === 'swing' ? 1 : 3]) f.action.aim = view.aim;
    }
  }
  return view;
}
const NEAR = [['Hips', 0.14], ['Spine2', 0.14], ['Chest', 0.15], ['LeftShin', 0.07], ['RightShin', 0.07], ['LeftLeg', 0.1], ['RightLeg', 0.1], ['LeftFoot', 0.06], ['RightFoot', 0.06]];
// a point on the canvas in boxer f's own space (as he was last drawn), and a point of his on the canvas (a joint, and so far on
// from it in that joint's terms)
const mine = (f, p) => {
  const d = M.app(M.tr(f.place.R), M.sub(p, f.place.p)),
    s = (f.pose && f.pose.stretch) || 1;
  return [d[0] * Math.sqrt(s), d[1] / s, d[2] * Math.sqrt(s)];
};
const at = (f, joint, by) => P.toWorld(f.place, M.add(f.pose.at[joint], by || [0, 0, 0]), f.pose.stretch);
// solve boxer i for this step, and find his gloves and head on the canvas
function solvePose(bout, f, i, dt) {
  const pose = f.animator.update(viewOf(bout, i), dt);
  // (a man knocked down takes his place with him as he slides: anim/animator.mjs)
  if (pose.drift) {
    const d = M.app(M.ry((f.yaw * 180) / Math.PI), [pose.drift[0], 0, pose.drift[1]]);
    f.x += d[0];
    f.z += d[2];
  }
  const place = { R: M.ry((f.yaw * 180) / Math.PI), p: [f.x, 0, f.z] },
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

/* How close the glove, on its way from g0 to g1 this step, comes to the head on its way from c0 to c1: centre to centre. */
function closest(g0, g1, c0, c1) {
  const p = M.sub(g0, c0),
    d = M.sub(M.sub(g1, c1), p),
    dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2],
    s = dd < 1e-12 ? 0 : Math.max(0, Math.min(1, -(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / dd));
  return Math.hypot(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s);
}
// how far a point is from the segment a to b
function segment(p, a, b) {
  const ab = M.sub(b, a),
    ap = M.sub(p, a),
    l = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2],
    s = l < 1e-12 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l));
  return Math.hypot(ap[0] - ab[0] * s, ap[1] - ab[1] * s, ap[2] - ab[2] * s);
}
function strike(bout, f, other, who, dt) {
  const action = incoming(f);
  if (!action || !f.before || !other.before || other.down) return;
  const move = MOVES[action.name],
    hand = move.hand,
    g0 = f.before[hand],
    g1 = f.points[hand];
  // (how near it has come to his head so far: a punch that misses says by how much, and whether his head was only just clear)
  {
    const gap = closest(g0, g1, other.before.head, other.points.head) - RULES.glove - RULES.head;
    if (!action.near || gap < action.near.gap) {
      /* (and whether a defence started a frame later would have met it: his head getting away from the glove less than a
         frame's worth faster than the gap it leaves, the last frame of his window) */
      const h = other.points.head,
        n = M.sub(h, g1),
        l = Math.hypot(n[0], n[1], n[2]) || 1,
        v = M.sub(h, other.before.head),
        away = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / l;
      action.near = { gap, late: gap >= 0 && gap < away };
    }
  }
  /* A great one getting out of its way goes only as far as he has to: once the punch is committed (its aim set) and his head
     is clear of where it is going by his grade's margin, his head goes no further (anim/evade.mjs: action.cap). */
  const away = other.action && isEvasion(other.action.name) ? other.action : null;
  if (away && away.level.evade.just && away.cap === undefined && away.name === 'slip' && action.aim && away.head0) {
    /* (how far his head has gone, and so how far it will go at this rate, against how clear of the punch's path it is now:
       if the rest of the way would take it further clear than his margin, it stops at the margin) */
    // (where the glove will stop: a straight arm reaches only so far past the shoulder, the glove's middle past the wrist)
    let to = M.add(f.place.p, M.app(f.place.R, action.aim));
    if (move.arm === 'straight') {
      const S = toWorld(f.place, f.pose.at[hand === 'L' ? 'LeftArm' : 'RightArm'], f.pose.stretch),
        d = M.sub(to, S),
        l = Math.hypot(d[0], d[1], d[2]) || 1;
      to = M.add(S, M.scale(d, (Math.min(l, LEN.upperArm + LEN.foreArm - 0.03) + 0.075) / l));
    }
    const head = other.points.head,
      clear = segment(head, g1, to) - RULES.glove - RULES.head,
      p = progress(away),
      moved = Math.hypot(head[0] - away.head0[0], head[1] - away.head0[1], head[2] - away.head0[2]);
    if (p.k >= 0.3 || !p.going) {
      const full = moved / Math.max(p.k, 0.3),
        just = away.level.evade.just;
      away.cap = clear + (full - moved) > just && full > 1e-3 ? Math.min(1, Math.max(p.k, p.k + (just - clear) / full)) : 1;
    }
  }
  // what is in the way: his head, and, if he is covering up, his gloves in front of it
  let first = null;
  const test = (what, key, r) => {
    const s = meets(g0, g1, other.before[key], other.points[key], r);
    if (s >= 0 && (!first || s < first.s)) first = { what, key, s };
  };
  test('head', 'head', RULES.glove + RULES.head);
  // (the gloves are in the way once they have got most of the way up: how quickly is his grade's)
  if (other.cover && other.animator.covered >= RULES.guardUp) for (const key of ['L', 'R']) test('guard', key, RULES.glove * 2);
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
    // (his power is how much of his body he gets behind it; a tired man gets less)
    J = mass * speed * (1 + RULES.bounce) * f.k.power * (0.85 + 0.15 * fatigue(f)),
    flat = Math.hypot(n[0], n[2]) || 1,
    dir = [n[0] / flat, n[2] / flat],
    // (vec: the way the glove was going as it met him, as he would see it coming: what a blow throws off him goes that way)
    cl = Math.hypot(closing[0], closing[1], closing[2]),
    vec = cl > 1e-6 ? M.scale(closing, 1 / cl) : n,
    blow = { who, on: 1 - who, name: move.name, kind: move.kind, hand, J: +J.toFixed(1), speed: +speed.toFixed(2), mass: +mass.toFixed(2), dir, vec, at: M.add(at, M.scale(n, RULES.glove)) };
  action.struck = true;
  action.chain.landed = true;
  action.chain.v[3] = action.chain.v[4] = 0; // the arm is stopped by what it hit
  f.sinceLast = 0;
  // (a touch on the head is nothing; on the gloves it is still met, however early and slow: turned aside or smothered)
  if (J < RULES.graze && first.what === 'head') return bout.events.push(Object.assign({ type: 'graze' }, blow));
  const [side, front] = local(other, n[0], n[2]),
    felt = { J, dir: [side, n[1], front] }; // the way the blow went, as the man who took it would say
  const stop = Math.max(RULES.stop[0], Math.min(RULES.stop[1], J * RULES.stop[2]));

  if (first.what === 'guard') {
    if (other.coverAge <= other.k.parry * (0.7 + 0.3 * fatigue(other))) {
      // turned aside: the puncher is thrown open, the defender has his opening
      begin(f, 'reel');
      f.stun = 0.6;
      f.kx = -dir[0] * 1.2;
      f.kz = -dir[1] * 1.2;
      other.counter = RULES.counter;
      const cover = levelOf(other.skills, 'cover');
      other.animator.deflect({ hand: first.key, J, dir: felt.dir, level: cover });
      bout.stop = 0.1;
      // (what it leaves wound up, by the grade of his guard; and whether it went up as late as it could and still did it)
      other.parried = { hand: first.key, at: bout.t, level: cover };
      const e = Object.assign({ type: 'parry' }, blow, { who: 1 - who, on: who });
      other.defence = { kind: 'parry', start: bout.t - other.coverAge, of: action.id, from: action.at, margin: null, late: other.coverAge <= cover.cover.arrive + 1 / 60 + 1e-9, counterAt: null, event: e, said: false };
      return bout.events.push(e);
    }
    other.hp = Math.max(1, other.hp - J * RULES.damage * other.k.smother * other.k.chin);
    other.kx += ((dir[0] * J) / RULES.mass) * RULES.shove * 0.6;
    other.kz += ((dir[1] * J) / RULES.mass) * RULES.shove * 0.6;
    other.animator.strike({ J: J * 0.25, dir: felt.dir });
    other.animator.brace({ J, hand: first.key, dir: felt.dir, level: levelOf(other.skills, 'cover') });
    bout.stop = stop * 0.4;
    return bout.events.push(Object.assign({ type: 'block' }, blow));
  }
  const counter = !!action.counter,
    worth = J * (counter ? RULES.counterGain : 1),
    damage = worth * RULES.damage * other.k.chin,
    had = other.hp;
  other.hp = Math.max(0, other.hp - damage);
  other.action = null;
  other.cover = false;
  other.want = null;
  other.counter = 0;
  other.stun = (RULES.stun[0] + worth * RULES.stun[1]) * other.k.stunTaken;
  /* A dirty boxer does not let a man he has hit get away: he goes in after him (skill.mjs: dirty). */
  const dirty = (action.level && action.level.form.dirty) || 0,
    after = dirty ? 0.75 : 0,
    // (and a man whose foot is stood on can hardly be moved off it)
    push = (worth / RULES.mass) * RULES.shove * (other.pinned > 0 ? 0.3 : 1);
  other.kx += dir[0] * push;
  other.kz += dir[1] * push;
  f.kx += dir[0] * push * after;
  f.kz += dir[1] * push * after;
  other.flash = 0.07;
  other.sinceHit = 0;
  other.animator.strike({ J: Math.min(worth, 110), dir: felt.dir, stun: other.stun, hp: other.hp });
  bout.stop = Math.min(RULES.stop[1], stop * (counter ? 1.5 : 1));
  const down = other.hp <= 0;
  bout.events.push(Object.assign({ type: 'hit', damage: +damage.toFixed(1), counter, down }, blow));
  if (down) {
    /* How he goes: a blow that only just finished him puts him down on a knee; one with plenty to spare lays him out, a
       body falling the way the blow and his weight take it (phys/fall.mjs: it is handed the blow, and the shove, which
       is then his body's and not his place's to carry). */
    const knee = damage - had < RULES.drop;
    begin(other, knee ? 'drop' : move.kind === 'hook' ? 'slump' : 'ko', knee ? {} : { blow: { J: worth, dir: M.app(M.tr(other.place.R), n), at: mine(other, blow.at), push: local(other, other.kx, other.kz) } });
    // (laid out, the shove is his body's now; dropped to a knee, he sags where he stands, his feet under him)
    other.kx = other.kz = 0;
    other.down = 1;
    other.stun = 0;
    other.downs = (other.downs || 0) + 1;
    // in a match the referee counts him; in a bare bout he is out
    if (!bout.knockdowns) (bout.over = who), (bout.overAt = bout.t);
  }
}

/* A dirty boxer's foul (moves.mjs: foul), judged the way a punch is: the part of him it is done with has to meet the part of
   the other man it is done to. Once a punch, at most. What it does to him is his body's (the animator's), and to his feet:
   stood on, he is pinned where he is. Nobody penalises any of it: it is only seen. */
const FOULS = { foot: 0.06, ball: 0.03 }; // radius of a foot, and of the ball of it, metres
function fouls(bout, f, other, who, dt) {
  const action = f.action,
    move = action && MOVES[action.name],
    level = action && action.level,
    tier = level && level.form.dirty;
  if (!move || !move.punch || !move.foul || !tier || action.fouled || other.down || !f.before || !other.before) return;
  const foul = move.foul,
    chain = action.chain,
    k = tier - 1,
    landed = chain.thrownAt >= 0 ? chain.t - chain.thrownAt : -1,
    // closing speed of a part of him on a part of the other man, along the line between them, and the impulse it carries
    blow = (a0, a1, b0, b1, mass) => {
      const line = M.sub(b1, a1),
        l = Math.hypot(line[0], line[1], line[2]) || 1,
        v = M.scale(M.sub(M.sub(a1, a0), M.sub(b1, b0)), 1 / dt),
        speed = Math.max(0, (v[0] * line[0] + v[1] * line[1] + v[2] * line[2]) / l);
      return +(mass * speed * (1 + RULES.bounce)).toFixed(1);
    },
    hit = (name, J) => {
      action.fouled = { name, at: chain.t };
      bout.events.push({ type: 'foul', name, who, on: 1 - who, J, tier: level.id });
      other.animator.foul && other.animator.foul({ name, J, tier: k });
    };
  if (foul.name === 'stomp') {
    // the ball of his foot coming down on the instep as the legs drive: within so much of it, and down on it (the sole of the
    // ball as low as the point on the instep it is aimed at)
    const foot = at(f, 'LeftToeBase'),
      was = f.footWas || foot,
      on = at(other, 'LeftFoot', [0, -0.02, 0.07]);
    f.footWas = foot;
    if ((chain.phase === 'throw' || chain.phase === 'coil') && chain.q[0] > 0.3 && foot[1] - FOULS.ball < on[1] + 0.01 && Math.hypot(foot[0] - on[0], foot[2] - on[2]) < foul.near) {
      hit('stomp', blow(was, foot, on, on, foul.mass));
      other.pinned = foul.pin;
    }
  } else if (foul.name === 'thumb') {
    // the face jab: the glove still over his face so long after it landed
    if (action.struck && landed >= foul.at && Math.hypot(...M.sub(f.points[move.hand], other.points.head)) < RULES.glove + RULES.head + 0.03) hit('thumb', blow(f.before[move.hand], f.points[move.hand], other.before.head, other.points.head, effectiveMass(chain, move)));
  }
}

/* Up off the canvas, where he lies (his place turned and moved under him: anim/animator.mjs getUp), the way that fits how
   he lies; or, off a knee, the way up off a knee. */
export function getUp(bout, f) {
  const up = f.animator.getUp(),
    name = up ? up.name : RISE[f.action && f.action.name] || 'riseKnee';
  if (up) {
    const o = M.app(M.ry((f.yaw * 180) / Math.PI), [up.move[0], 0, up.move[1]]);
    f.x += o[0];
    f.z += o[2];
    f.yaw = wrap(f.yaw + up.turn);
  }
  f.down = 0;
  f.kx = f.kz = f.ix = f.iz = f.vx = f.vz = 0;
  f.action = { name, t: 0, id: name + ++f.serial, struck: false, chain: null, from: up ? up.on : 'knee', side: up && up.down === 'R' ? -1 : 1 };
  return f.action;
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
        pressed = pressOf(input);
      if (pressed && bout.over === null) (f.want = pressed), (f.wantAge = 0);
    });
    return bout;
  }
  bout.t += dt;
  for (const f of bout.fighters) (f.px = f.x), (f.pz = f.z), (f.pinned = Math.max(0, f.pinned - dt));
  bout.fighters.forEach((f, i) => {
    const other = bout.fighters[1 - i],
      input = bout.over === null ? inputs[i] || {} : {};
    f.counter = Math.max(0, f.counter - dt);
    // breath comes back while he is not punching: less while he holds his guard up, none while he throws
    if (!punching(f) && !(f.action && f.action.name === 'dash')) f.stamina = Math.min(f.k.staminaMax, f.stamina + f.k.regen * (f.cover ? 0.6 : 1) * dt);
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
  fouls(bout, a, b, 0, dt);
  fouls(bout, b, a, 1, dt);
  return bout;
}
