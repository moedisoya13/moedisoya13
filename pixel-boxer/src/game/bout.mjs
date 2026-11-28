/* The match: two boxers on a square of canvas, stepped at a fixed rate from two sets of controls. Nothing here draws, and the
   same code runs in the page and under node --test.
     const bout = createBout(seed, { sheets: [mine, his] (profile.mjs: who they are; an honest club fighter if left out),
                                     skills: [mine, his] (anim/skill.mjs: the grade each throws each move at, by name or
                                     `all`; a pro's if left out),
                                     knockdowns: true (a boxer who runs out of health goes down and the match counts him;
                                     left out, he is knocked out and the bout is over),
                                     techniques: [mine, his] (game/techniques.mjs: the techniques each carries, by id; what
                                     his grades give him if left out: profile.mjs loadout) -> f.techniques })
     step(bout, [mine, his], dt)
     getUp(bout, f)         a man who has beaten the count gets up, where he lies, the way that fits how he lies (anim/
                            animator.mjs: getUp); -> the rise he starts
       controls: { move: [x, z] (a direction on the canvas, up to 1 long), jab, power (true on the tick pressed; or the
                   name of a punch, which is then that punch: a script's, or a technique's answer, 'hookR' the rear hook,
                   'hookBody' the liver hook; a show-off's trick named there is still the trick),
                   cover (true while held), dash: [x, z] | true (on the tick flicked; true is straight back),
                   slip: 1 | -1 (the head off the line, to his left or right), duck: true | 1 | -1 (down under a punch in a
                   shallow U, coming up on his left, or with -1 his right),
                   roll: 1 | -1 (bob and weave: down under it and up on his left or right), pull: true (the head swayed
                   back out of reach); duck with a dash ahead in the same tick is the duck in (duckIn: down and in under
                   the punches, to right up close); away: 'pivot' | 'circle' with side: 1 | -1 (his left or right) is
                   moving off out of range with the guard let go of (hopPivot, hopCircle); away: 'wave' held is the wave,
                   circling wide round him for as long as it is held (a clean great one's who carries it: anim/clean.mjs,
                   game/techniques.mjs; anyone else circles out), and a jab pressed in it goes out of it, a power punch
                   puts an end to it;
                   tech: id, body: true (the head's: the technique a press or a guard is meant as, and a punch for the body,
                   game/techniques.mjs; carried on the press and the move it starts as f.action.asked, read by the motion
                   built for it, and nothing else) }
     bout.events            what happened this step, for the picture and the sound (a dirty boxer's fouls among them:
                            { type: 'foul', name: stomp | thumb, who, on, J }; nobody penalises them). A punch that misses
                            says by how much (whiff: margin, metres between the glove's and the head's surfaces at the
                            closest), and a defence that was brilliant says so: { type: 'brilliant', who (the defender),
                            on, of: 'whiff' | 'parry', margin, late, from (bout time the punch was pressed), counter (the
                            id of the punch he answered with) }, and its whiff or parry event is marked brilliant: true.
                            A punch that lands on his trunk says where (game/trunk.mjs): { type: 'hit', part: 'body', zone:
                            liver | solar | ribs | body, trunk: { at: waist, to: chest, r } (what to throw sweat off), breath
                            (the share of all his breath it took), liver: true (it puts him down) }; one met by an elbow or a
                            forearm on its way there is { type: 'block', part: 'elbow' | 'forearm', zone (where it was aimed) };
                            and a man doubled up by one goes down a moment later: { type: 'buckle', who }. A guard put up
                            meant as a shoulder roll says so ({ type: 'roll', who }), and a punch met by the lead shoulder (a
                            cross-arm guard's, or a roll's) is { type: 'block', part: 'shoulder', roll: true (rolled off it as
                            his chest turned away) | false, margin (metres between the glove and his head as it met it) };
                            a guard put up meant as the peek-a-boo shell says so too ({ type: 'shell', who }), and a power
                            press meant as the Tyson shift that starts one ({ type: 'shift', who })
     bout.fighters[i].pose  his solved pose this step (and .place: where on the canvas, .points: gloves and head in the world)
     bout.fighters[i].stands   a man who only stands there and takes it (a ladder rung's or a card's target): no blow to his
                            liver puts him down (anything else does as it would; a script keeps his health up besides)

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
   A parry leaves a punch wound up the same way, by the grade of his guard. A power press meant as the pull counter (game/
   techniques.mjs) out of a sway back is kept until the sway lets it go, and is the straight, the liver hook (asked for the
   body) or the rear hook (named), at every grade, wound up whichever hand it is and waiting for him to come back in first
   (anim/evade.mjs PULLED). A defence is brilliant when the punch missed by
   three centimetres or less (or his head was clear of it by less than a frame), or the guard went up as late as it could and
   still turned it aside, and a loaded punch went back within 0.4 s of the defence starting. */
const BRILLIANT = { margin: 0.03, within: 0.4 };
import * as M from '../rig/m3.mjs';
import { MOVES, RISE, TO_BODY, GUARD } from '../anim/moves.mjs';
import { FOOT } from '../rig/body.mjs';
import { createAnimator, arrival } from '../anim/animator.mjs';
import { toWorld } from '../anim/pose.mjs';
import { createChain, stepChain, effectiveMass, preload } from '../phys/chain.mjs';
import * as P from '../anim/pose.mjs';
import { RING } from '../world/ring.mjs';
import { pressOf as ropesPressed, ROPE, SIDES, BODY } from '../world/ropes.mjs';
import { push as edgePush, jointR } from '../world/edge.mjs';
import { NAMES } from '../rig/skeleton.mjs';
import { arenaOf } from '../world/pit.mjs';
import { LEN } from '../rig/solve.mjs';
import { body, blank, fatigue, COST, loadout } from './profile.mjs';
import { asked, has, gradeOf } from './techniques.mjs';
import { levelOf, CROSS, ROLL, OVER } from '../anim/skill.mjs';
import { timeline, evadeTime, progress, LOADED, pullWait, pullTo } from '../anim/evade.mjs';
import { choose, THROWS, PAW, COLLAR, ELBOW } from '../anim/show.mjs';
import { waveOf, waveTravel, waveTurn, waveBlocked, patOf, presses, fireOf, shellOf } from '../anim/clean.mjs';
import { shiftOf } from '../anim/shift.mjs';
import { dice } from '../anim/stance.mjs';
import { trunk, balls, where, aimed, aimFor, spray, ZONES } from './trunk.mjs';
import { shown } from '../anim/body.mjs';

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
  touch: 1, // metres a second: a glove already against him (right up close) has to be going on into him faster than this to count
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
  // right up close (centre to centre, as the power punch is pressed) the chain is the inside hook and the inside uppercut, in
  // turn: no straight punch is thrown from there
  inside: 0.72,
  chainIn: ['hookIn', 'upperIn'],
  /* and once he is in it, the next press of the chain goes on with it while the man he is knocking back is still within
     insideOn: he steps back in for it (stepIn), and does not throw a long-range punch from a few centimetres outside the
     inside range. The inside hook turned by the waist (docs/moves-plan-6.md §3.3 N14) knocks a man back to 0.69-0.73 m by
     the next press from where the inside chain is thrown, 0.62 to 0.68 m (0.68-0.71 before it). Only the power press that
     goes on with a pressed inside chain (f.inChain), and only up to a pro's grade (insideTo): a great one and a legend,
     who threw the long hook and the long uppercut from 0.64 m on before it, still do; kept on the inside two, a legend
     stepping back in for the third stood where he would topple and whiffed it. And not while the other man holds his guard
     up: stepping back in at a covered man from 0.72 to 0.74 m, the inside uppercut's glove went 8 to 10.6 cm into his forearm
     where the long hook thrown there did not touch it. The counters out of an evasion, a parry, a block or the shell, and
     the tricks, read the distance alone, as they did */
  insideOn: 0.8,
  insideTo: 3,
  dash: { reach: 1.2 },
  stepIn: 2.6, // metres a second he closes at while throwing, down to the punch's own range
  lunge: 60, // metres a second a second: how quickly a step in gathers speed and sheds it
  hookDrop: 0.05, // how far below his own head a hook can be swung
  drop: 1, // health a finishing blow had to spare at most to put him down on a knee rather than flat
  out: 2.5, // and at least to knock him out cold (about 70 N·s past what he had left); or one that catches him throwing
  jaw: 0.08, // how far below the middle of the head a hook is aimed
  startGap: 2.4,
  /* ---- the body (docs/moves-plan-5.md §3.2; where on it: game/trunk.mjs). A blow to the trunk takes `damage` health a
     newton-second (the head's 0.6) and `breath` of all his breath for `ref` newton-seconds (times the place's: trunk.mjs
     ZONES); it stops him `stun` as long as one to the head would and moves him `shove` as far (the trunk folds round it).
     Taken on an elbow or a forearm, it takes `blocked` of that breath. A blow of `liver` newton-seconds or more on the liver
     (a counter's gain in it), or `heap` on it in `within` seconds, puts him down on a knee `late` seconds after (moves.mjs:
     dropLiver), his breath cut to `spent` of all he has. Nothing to the body knocks a man out cold. */
  body: { damage: 0.021, breath: 0.12, ref: 85, stun: 0.5, shove: 0.5, blocked: 0.25, liver: 70, heap: 150, within: 10, late: 0.4, spent: 0.3 }
};
const DT = 1 / 60;

function boxer(x, yaw, seed, sheet, skills) {
  const k = body(sheet);
  return { vary: false, luck: null, sheet: sheet || blank(), skills: skills || {}, k, stamina: k.staminaMax, x, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, ix: 0, iz: 0, gx: 0, gz: 0, yaw, turn: 0, hp: RULES.hp, action: null, cover: false, coverAge: 0, stun: 0, counter: 0, want: null, wantAge: 0, link: 0, sinceHit: 9, sinceLast: 9, serial: 0, down: 0, pinned: 0, animator: createAnimator(seed), pose: null, place: null, points: null, before: null };
}
export function createBout(seed, o) {
  o = o || {};
  const sheets = o.sheets || [],
    bout = { t: 0, stop: 0, over: null, overAt: 0, seed: seed || 1, events: [], knockdowns: !!o.knockdowns, arena: arenaOf(o.arena), fighters: [boxer(-RULES.startGap / 2, Math.PI / 2, 0, sheets[0], (o.skills || [])[0]), boxer(RULES.startGap / 2, -Math.PI / 2, 1, sheets[1], (o.skills || [])[1])] };
  /* (a show-off's tricks and taunts come up by his own dice, thrown from the bout's seed, in a real bout: o.vary. Scripts and
     tests name what they want instead: anim/show.mjs) */
  bout.fighters.forEach((f, i) => ((f.vary = !!o.vary), (f.luck = dice((seed || 1) * 31 + i * 7919 + 5))));
  // (the techniques each carries: game/techniques.mjs)
  bout.fighters.forEach((f, i) => (f.techniques = loadout(f.skills, (o.techniques || [])[i])));
  settle(bout);
  return bout;
}
/* Where they fight (world/pit.mjs ARENAS): 'ring' (as it is unless named), whose ropes give and can be leaned on (ropes,
   below), or 'underground', the pit walled round with bricks and paint drums, which stops a man as the ropes stopped him
   before they gave: the last quarter of a metre run out of speed, and no further (travel, step). (world/pit.mjs arenaOf) */
export { arenaOf };
// stand both boxers in their guards where they are (after they have been put somewhere by hand)
export function settle(bout) {
  for (const f of bout.fighters) (f.animator = createAnimator(f === bout.fighters[0] ? 0 : 1)), (f.before = f.points = f.parts = null);
  for (let i = 0; i < 2; i++) bout.fighters.forEach((f, k) => solvePose(bout, f, k, 0));
}
export function random(bout) {
  bout.seed = (bout.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(bout.seed ^ (bout.seed >>> 15), 1 | bout.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = x => ((x = Math.max(0, Math.min(1, x))), x * x * (3 - 2 * x));
const aheadOf = f => [Math.sin(f.yaw), Math.cos(f.yaw)];
// a direction on the canvas, in a boxer's own terms: [to his left, ahead of him]
export const local = (f, x, z) => [x * Math.cos(f.yaw) - z * Math.sin(f.yaw), x * Math.sin(f.yaw) + z * Math.cos(f.yaw)];
const punching = f => !!f.action && !!MOVES[f.action.name].punch;
// the ways of getting the head out of the way, as controls name them (each a move of its own, with a side where it has one)
const EVADE = ['slip', 'duck', 'roll', 'pull'];
const pressOf = input =>
  // (a punch pressed while the wave is held is the punch: out of the wave, anim/clean.mjs)
  input.away === 'wave' && (input.jab || input.power) ? (input.jab ? ['jab', input.jab] : ['power', input.power]) :
  input.dash && input.duck && input.dash !== true ? ['duckIn', input.dash] : input.away ? [input.away === 'pivot' ? 'hopPivot' : input.away === 'wave' ? 'wave' : 'hopCircle', input.side || 1] : input.dash ? ['dash', input.dash] : EVADE.find(n => input[n]) ? [EVADE.find(n => input[n]), input[EVADE.find(n => input[n])]] : input.jab ? ['jab', input.jab] : input.power ? ['power', input.power] : input.taunt ? ['taunt', input.taunt] : null;
/* (a press carries what the head adds to it, game/techniques.mjs asked: the technique it is meant as, if his grade opens it,
   and whether it is for the body; a press with neither is the press it always was) */
const signed = (f, input, p) => {
  const a = p && asked(f, input);
  return a ? [p[0], p[1], a] : p;
};
// moving off somewhere as a move of its own: the dash, the duck in, and the two ways away (and the wave)
const GOING = ['dash', 'duckIn', 'hopPivot', 'hopCircle', 'wave'];
/* The duck in ends right up close (centre to centre, short of it by his grade: skill.mjs, entry.stop), and goes there at
   most this far, `wide` degrees to his right of the line to the other man; moving away, each hop is a half beat long (`beat`): `backHop` metres back after the pivot (which takes
   `turn` seconds), or `hop` metres round him and `out` away from him. */
export const GO = { wide: 8, inTo: 0.67, inMost: 0.5, inFrom: 0.05, inTime: 0.31, hop: 0.16, backHop: 0.21, out: 0.12, beat: 0.16, turn: 0.22, back: 3, round: 4 };
// a punch still on its way out: wound up or being thrown, and not yet landed
export const incoming = f => (punching(f) && !f.action.struck && (f.action.chain.phase === 'coil' || f.action.chain.phase === 'throw') ? f.action : null);
// may he start something new? In the middle of a punch, only another punch, and only once this one has been thrown
const open = (f, punch) =>
  f.stun <= 0 &&
  (!f.action ||
    (punch && punching(f) && (f.action.chain.phase === 'hold' || f.action.chain.phase === 'recover')) ||
    // (out of an evasion, from the moment his grade lets him: anim/skill.mjs, evade.cut)
    (punch && isEvasion(f.action.name) && f.action.t >= timeline(f.action.name, f.action.level).cut - 1e-9) ||
    // (and out of a duck in once he has landed)
    (punch && f.action.name === 'duckIn' && f.action.t >= DUCK_IN.landed - 1e-9) ||
    // (and out of the wave at any moment: anim/clean.mjs)
    (punch && f.action.name === 'wave'));
// (the duck in has landed at this; the knees stay bent, the wind-up of what he throws next, `wound` seconds after it)
const DUCK_IN = { landed: 0.4, wound: 0.15 };

const isEvasion = name => EVADE.includes(name);
// (a power press meant as the pull counter, while he is still in the sway back it is to come out of, or has just come out)
const pullKept = (f, t) =>
  f.want[0] === 'power' && !!f.want[2] && f.want[2].tech === 'pullCounter' && (f.action ? f.action.name === 'pull' : !!f.lastEvade && f.lastEvade.name === 'pull' && f.lastEvade.endedAt !== null && t - f.lastEvade.endedAt <= GRACE);
// the evasion a man is in (or came out of a moment ago), and how far into it: what a punch started now is thrown out of
const GRACE = 0.1; // seconds after an evasion is over that its end is still the coil of the next punch
function loadOf(f, bout, move, more) {
  // (out of a duck in, landed and still bent: an inside punch, as much of its wind-up done as his grade leaves wound)
  const din = f.action && f.action.name === 'duckIn' ? f.action : f.lastIn && bout.t - f.lastIn.endedAt <= DUCK_IN.wound + 1e-9 - Math.max(0, MOVES.duckIn.dur - DUCK_IN.landed - DUCK_IN.wound) ? f.lastIn.action : null;
  if (din && (move.name === 'hookIn' || move.name === 'upperIn')) {
    const since = din === f.action ? din.t - DUCK_IN.landed : DUCK_IN.landed + DUCK_IN.wound;
    if (since >= -1e-9 && since <= DUCK_IN.wound + 1e-9 && din.level.entry.load > 0) return { load: din.level.entry.load, from: din.id };
  }
  /* (out of a shoulder roll that has rolled a punch off his shoulder, the roll & counter: the chest turned away behind the
     shoulder is the rear hand's wind-up, his grade's share of it done, waiting for his weight to come forward first: skill.mjs
     ROLL counter, docs/moves-plan-5.md §4A.7) */
  if (more && more.rollOut) {
    const c = more.rollOut.roll.counter;
    return c ? { load: c.load, from: 'roll', rolled: true, wait: c.wait } : null;
  }
  const e = f.action && isEvasion(f.action.name) ? f.action : f.lastEvade && f.lastEvade.endedAt !== null && bout.t - f.lastEvade.endedAt <= GRACE ? f.lastEvade.action : null;
  if (e) {
    const ev = e.level.evade;
    // (the pull counter: the way back out of the sway is the wind-up of whichever of the three it is, anim/evade.mjs PULLED)
    if (more && more.pulled && e.name === 'pull') return { load: ev.load, from: e.id, pulled: true, grade: e.level.id, wait: pullWait(e, move.name) };
    return LOADED(e.name, e.side) === move.hand ? { load: ev.load, from: e.id } : null;
  }
  // (a punch to his body taken on the arms of his cross-arm guard: the rear hand at his chin is set already, §4A.6)
  if (more && more.crossed) return { load: more.crossed.load, from: 'cross' };
  // (the Tyson shift: the crouch is the wind-up of the uppercut out of it, anim/shift.mjs)
  if (more && more.shifted && move.name === 'upperIn' && f.shift) return { load: f.shift.sv.load, from: 'shift' };
  // (block and fire: the crunch of the elbow block is the wind-up of the punch the blocking arm fires, anim/clean.mjs)
  if (more && more.fired) return { load: more.fired.fire.load, from: 'block', fired: more.fired, wait: more.fired.fire.wait };
  // (and out of the peek-a-boo shell: the crouch is the wind-up of the lead hook, and of the body uppercut after it)
  if (more && more.shelled) {
    const sh = more.shelled.sh || (f.lastShell && f.lastShell.sh);
    return sh ? { load: more.shelled.follow ? sh.loadBody : sh.load, from: 'shell', shell: sh, wait: more.shelled.follow ? 0 : sh.wait } : null;
  }
  const p = f.parried;
  /* (out of a down parry, anim/clean.mjs: the hand that pressed it, from where it is, waiting out the press first; a legend's
     lead hand goes at once, a little wound up already) */
  if (p && p.down && bout.t - p.at <= RULES.counter) {
    const pat = p.pat;
    if (move.hand === 'R') return { load: pat.load, from: 'parry', down: true, wait: pat.counter === 'cross' ? Math.max(0, pat.hold - (bout.t - p.at)) : 0 };
    return pat.counter === 'jab' && pat.jab > 0 ? { load: pat.jab, from: 'parry', down: true } : null;
  }
  // a parry: the other hand, or the one that turned it aside, by the grade of his guard
  if (p && bout.t - p.at <= RULES.counter) {
    const cv = p.level.cover;
    if ((cv.hand === 'same') === (move.hand === p.hand)) return { load: cv.load, shoulder: cv.q, from: 'parry' };
  }
  /* a jab out of the wave (anim/clean.mjs): the hand comes straight up from where it hangs, no wind-up shown; out of a slick
     back, with the trunk coming forward again (a legend's the more) */
  if (f.action && f.action.name === 'wave' && move.name === 'jab') {
    const wv = waveOf(f.action.level),
      a = f.animator.wave;
    return { load: a && a.slicked ? wv.load : wv.jab, from: 'wave' };
  }
  /* a legend on the move (anim/legend.mjs): his knees bent and his trunk leant by the shape of his going are the wind-up of
     whatever he throws out of it, as far as they go; he does not wind up again */
  const lg = f.animator.legend;
  if (lg) return { load: Math.min(1, lg.load), from: 'legend' };
  return null;
}
function begin(f, name, more, bout) {
  const move = MOVES[name],
    before = f.action,
    // (a punch to the body, or the rear hook, at the grade of the punch it is a form of, unless his skills name it: moves.mjs of)
    level = levelOf(f.skills, move.of && !(f.skills && f.skills[name]) ? move.of : name),
    // his muscles: as quick as his speed, and slower as he tires (never below three quarters of it); his skill: how he uses them
    chain = move.punch ? createChain(move, f.k.rate * (0.75 + 0.25 * fatigue(f)), level, more && more.variant) : null;
  if (COST[name]) f.stamina = Math.max(0, f.stamina - COST[name]);
  // a punch thrown with the hand that has just punched starts from where that arm's joints still are (a double jab)
  if (chain && before && before.chain && MOVES[before.name].hand === move.hand) (chain.q = before.chain.q.slice()), (chain.v = before.chain.v.slice());
  /* (but out of an inside hook whose body was stopped by what it met, strike: `spent`, the legs drive the next punch of that
     hand afresh: their drive was spent in what the hook hit (the waist's turn with it), and the hips and the trunk are taken up
     where the hook was stopped. Taken up driven out already, a great one's and a legend's long hook out of it had its fist
     sent out round in its wind-up, which only its own drive should do (anim/animator.mjs: a hook's reach and angle come with
     the legs' drive), and the elbow went round under the arm and back in three frames, 93 to 108 degrees a frame, the upper
     arm past its range; taken up where the legs, hips and trunk would have got to had they not been stopped, a legend's long
     hook landed a third lighter, 35 N·s on the average; and with the hips from rest as well, a pro's long uppercut after it
     took his upper arm where the shoulder cannot put it. A great dirty fighter's legs are taken up no further driven out than
     his grade's `spent` (anim/skill.mjs), and still: from rest, his long hook out of it landed a frame later than it did and
     lighter, 3.6 N·s on the average in 40 of 224 moments, 6.2 at the most. From a great one up only: up to a pro's grade the
     long hook comes out of the inside hook only where the rule does not keep him on the inside chain (RULES.insideOn: the man
     he presses holds his guard up, or is knocked past 0.80 m), and taken up afresh there it got onto his guard sooner than it
     did, and the long uppercut after it went into his lead forearm, 10.0 to
     11.4 cm, where 0ac7c0c's touches it 2.4 to 2.6) */
  if (chain && before && before.chain && before.chain.spent && MOVES[before.name].hand === move.hand && level.grade >= 4) {
    const kept = (level.chain && level.chain.spent) || 0;
    chain.q[0] = kept > 0 ? Math.min(chain.q[0], kept) : 0;
    chain.v[0] = chain.q[5] = chain.v[5] = 0;
  }
  // out of the end of an evasion or a parry: wound up already
  let loaded = chain && bout ? loadOf(f, bout, move, more) : null;
  // (but not by a legend's going: a punch to the body has to go down to it first, anim/body.mjs)
  if (loaded && loaded.from === 'legend' && move.level) loaded = null;
  if (loaded) preload(chain, move, loaded.load, loaded.shoulder);
  // (a guard pushed out of the way first: the punch waits for the lead hand to get it there, anim/show.mjs)
  if (chain && more && (more.variant === 'pawDown' || more.variant === 'pawUp')) chain.wait = PAW.wait[name] || PAW.wait.cross;
  // (and the uppercut under a collar waits for the lead hand to have his neck and to have hauled on it a while: anim/show.mjs)
  if (chain && more && more.variant === 'collar') chain.wait = COLLAR.wait;
  // (a punch to the body thrown in two movements: down in the wind-up, a moment's stop at the bottom, and then the punch, anim/body.mjs: seam)
  if (chain && move.level && level.form.level && level.form.level.seam && !(loaded && loaded.load > 0)) chain.pause += level.form.level.seam;
  // (a great one's spring waits for his next foot to come down, half a beat at most, and goes down with it)
  if (chain && chain.springWait && !(loaded && loaded.load > 0)) {
    const r = f.animator.rhythm;
    chain.wait = Math.max(0, Math.min(r.left, r.half));
  }
  // (the counter out of a down parry waits for the pressing hand to have kept the glove down: anim/clean.mjs)
  if (chain && loaded && loaded.wait > 0) chain.wait = loaded.wait;
  // (out of a sway back he comes back in first, a punch all wound up waiting wound up: anim/evade.mjs PULLED)
  if (chain && loaded && (loaded.pulled || loaded.fired || loaded.shell || loaded.rolled) && chain.wait > 0 && chain.phase === 'throw') (chain.phase = 'coil'), (chain.coilTime = Math.max(chain.coilTime, 1e-3));
  if (before && isEvasion(before.name) && f.lastEvade && f.lastEvade.action === before) f.lastEvade.endedAt = bout ? bout.t : 0;
  if (before && before.name === 'duckIn') f.lastIn = { action: before, endedAt: bout ? bout.t : 0 };
  f.action = Object.assign({ name, t: 0, id: name + ++f.serial, struck: false, chain, level, at: bout ? bout.t : 0, loaded: loaded && (loaded.load > 0 || loaded.pulled || loaded.fired || loaded.rolled) ? loaded : null }, more);
  if (isEvasion(name)) (f.lastEvade = { action: f.action, name, start: bout ? bout.t : 0, endedAt: null }), (f.action.head0 = f.points ? f.points.head.slice() : null);
  f.cover = false;
  f.roll = null;
}

/* Where a duck in or a way away goes, decided as it starts: the duck in, toward the other man to right up close (short of it
   by his grade), turned out by his grade's angle; the pivot, round the ball of his lead foot by his grade's degrees to the
   side asked, and then back; the circle, round him to that side and out. */
function plan(f, other, name, dir) {
  const lv = levelOf(f.skills, name);
  if (name === 'duckIn') {
    const e = lv.entry,
      dx = other.x - f.x,
      dz = other.z - f.z,
      d = Math.hypot(dx, dz) || 1,
      a = (-(GO.wide + e.angle) * Math.PI) / 180,
      // (turned out to his right, outside the other man's lead arm: a few degrees always, and his grade's angle)
      go = [(dx * Math.cos(a) + dz * Math.sin(a)) / d, (dz * Math.cos(a) - dx * Math.sin(a)) / d];
    return { go, reach: Math.max(0, Math.min(GO.inMost, d - GO.inTo - e.stop)), side: 1, dir: local(f, go[0], go[1]) };
  }
  const side = dir === -1 ? -1 : 1,
    ball = f.pose ? at(f, 'LeftToeBase') : [f.x, 0, f.z];
  return { side, centre: [ball[0], ball[2]], from: [f.x, f.z], dir: [0, -1] };
}

/* Who can go into the wave (anim/clean.mjs): a man who carries it (game/techniques.mjs: his loadout holds 'wave' and his grade
   opens it), at his grade's wave, which only 4명 and 5명 have (skill.mjs: wave). The one place it is decided; asked of anyone
   else, it is the circle out. -> his grade's wave, or null */
const wavesAt = f => (has(f, 'wave') ? waveOf(levelOf(f.skills, 'wave')) : null);

/* ---- The down parry (anim/clean.mjs, docs/moves-plan-5.md §4.2): a guard put up meant as one (the head's tech: 'parryDown',
   game/techniques.mjs) by a man who carries it at a grade that has one (skill.mjs: pat, 4명 and 5명). The guard is his, as
   any guard is; his rear glove goes out of it to press the punch down (the animator's), and the bout judges what it comes
   down on (strike). Kept as f.pat = { id, at (when the guard went up), pat (his grade's), met (when it met the glove) }:
   while his guard is up, or after it has met a glove until his counter is done with it, and never past a blow. */
const patsAt = f => (has(f, 'parryDown') ? patOf(levelOf(f.skills, 'parryDown')) : null);
const PAT = { life: 0.8, above: 0 };
function patGuard(bout, f, input, covering, dt) {
  // (put up fresh, meant as one: a stunned man's guard is never fresh, and is no down parry)
  if (covering && !f.cover) {
    const a = asked(f, input),
      pat = a && a.tech === 'parryDown' && f.stun <= 0 ? patsAt(f) : null;
    f.pat = pat ? { id: 'pat' + ++f.serial, at: bout.t, pat, met: null } : null;
  } else if (f.pat && (f.sinceHit <= dt + 1e-9 || (f.pat.met === null && !covering) || bout.t - (f.pat.met ?? f.pat.at) > PAT.life)) f.pat = null;
}
/* What his body is told of it (view.pat): how soon the glove coming in, if it is one his grade presses down, will be on his
   rear glove: at the speed it is closing on it, or, sooner, when the punch's chain will have it all the way out (a glove
   only starting out gathers speed faster than the step before says: he reads the arm, as a slick back does: animator.mjs
   arrival); whether his guard is still fresh enough (a parry's: RULES.parry, his own) */
function patView(bout, f, other) {
  const p = f.pat,
    coming = incoming(other);
  let eta = null;
  if (coming && p.met === null && presses(p.pat, coming.name) && other.points && other.before && f.points) {
    const hand = MOVES[coming.name].hand,
      r = f.points.R,
      gap = Math.hypot(...M.sub(other.points[hand], r)) - 2 * RULES.glove,
      was = Math.hypot(...M.sub(other.before[hand], r)) - 2 * RULES.glove,
      v = (was - gap) / DT;
    eta = Math.min(v > 0.3 ? Math.max(0, gap) / v : Infinity, arrival(coming.chain, MOVES[coming.name]));
  }
  return { id: p.id, pat: p.pat, met: p.met === null ? null : bout.t - p.met, fresh: f.cover && f.coverAge <= f.k.parry * (0.7 + 0.3 * fatigue(f)), eta };
}
// (and his counter out of it, a power punch in the opening it made: the pressing hand's cross, or a legend's jab first, the
// cross pressed after it on its own: f.patFollow)
function patCounter(bout, f, inside) {
  const p = f.parried;
  if (p.pat.counter === 'jab' && !p.jabbed) {
    p.jabbed = true;
    f.patFollow = p.at + p.pat.follow;
    return 'jab';
  }
  return inside ? 'upperIn' : 'cross';
}
/* ---- Block and fire (anim/clean.mjs, docs/moves-plan-5.md §4.3): a hook to his body met by his elbow or forearm (strike:
   f.elbowed, kept for anyone) is, for a man who carries blockFire at a grade that has it (skill.mjs: fire, 4명 and 5명), the
   wind-up of a punch from the arm that blocked it. A power press meant as it (tech: 'blockFire') within his grade's `within`
   of the block, and not since hit, is that punch: off the rear elbow (the liver) the uppercut, the inside one right up close;
   off the lead elbow (the ribs) the lead hook. It goes as a counter (the other man's arm is still coming home off his body:
   a counter's gain in it), wound up as far as the crunch winds it, and a legend's other hand's hook follows it, pressed by the
   bout on its own (f.fireFollow), as a legend's cross after his down parry's jab. -> { fire, hand, zone } or null */
const firesAt = f => (has(f, 'blockFire') ? fireOf(gradeOf(f.skills, 'blockFire')) : null);
function firedOf(bout, f, sign) {
  const fire = sign && sign.tech === 'blockFire' ? firesAt(f) : null,
    b = f.elbowed;
  if (!fire || !b || bout.t - b.at > fire.within + 1e-9 || f.sinceHit < bout.t - b.at - 1e-9) return null;
  return { fire, hand: b.zone === 'ribs' ? 'L' : 'R', zone: b.zone, at: b.at };
}
// (the punch a legend's block and fire is followed by: the other hand's hook, `follow` seconds after the first got there)
function fireNext(bout, f) {
  const L = f.action && f.action.loaded && f.action.loaded.fired;
  if (L && L.fire.follow !== null && !f.action.followed) (f.action.followed = true), (f.fireFollow = { at: bout.t + L.fire.follow, hand: L.hand === 'R' ? 'L' : 'R', inside: L.fire.inside });
}
// (the body uppercut after the hook out of the shell, `follow` seconds after the hook got there)
function shellNext(bout, f) {
  const sh = f.action && f.action.shellOut;
  if (sh && !f.action.followed) (f.action.followed = true), (f.lastShell = { sh }), (f.shellFollow = { at: bout.t + sh.follow });
}
const fireName = (hand, inside) => (hand === 'R' ? (inside ? 'upperIn' : 'upper') : inside ? 'hookIn' : 'hook');
/* ---- The peek-a-boo shell (anim/clean.mjs, docs/moves-plan-5.md §4.5): a guard put up meant as one (tech: 'shell') by a man
   who carries it at a grade that has one (skill.mjs: shell, 4명 and 5명). Kept as f.shell = { at, sh (his grade's) } for as
   long as that guard stays up, and never past a blow; it costs breath while it is held. Crouched behind it, his gloves and
   his forearms are in the way of every punch (strike), and a fresh one turns nothing aside. A punch that goes over him or
   into it opens him (f.shellOpen: when), and a power press meant as it within his grade's `within` is his counter out of the
   crouch: the lead hook, wound up as far as the crouch winds it, and the rear body uppercut after it, pressed by the bout on
   its own (f.shellFollow). */
const shellsAt = f => (has(f, 'shell') ? shellOf(gradeOf(f.skills, 'shell')) : null);
function shellGuard(bout, f, input, covering, dt, who) {
  const a = covering && f.stun <= 0 ? asked(f, input) : null,
    sh = a && a.tech === 'shell' ? shellsAt(f) : null;
  if (sh && !f.shell) {
    f.shell = { at: bout.t, sh };
    bout.events.push({ type: 'shell', who });
  } else if (f.shell && (!covering || f.sinceHit <= dt + 1e-9)) f.shell = null;
  if (f.shell) f.stamina = Math.max(0, f.stamina - f.k.staminaMax * f.shell.sh.cost * dt);
}
// (gone over him or into his gloves: the shell's opening)
const shellOpens = (bout, other) => other.shell && (other.shellOpen = { at: bout.t, sh: other.shell.sh });
function shellCounter(bout, f, sign) {
  const o = f.shellOpen;
  if (!sign || sign.tech !== 'shell' || !o || !has(f, 'shell') || bout.t - o.at > o.sh.within + 1e-9 || f.sinceHit < bout.t - o.at - 1e-9) return null;
  return o;
}
/* ---- The Tyson shift (anim/shift.mjs, docs/moves-plan-5.md §4.4): a power press meant as it (tech: 'shift') by a man who
   carries it at a grade that has one (skill.mjs: shift, 4명 and 5명) is the rear hand's straight with the shift behind it, kept
   as f.shift until he is back in his stance. The bout has all of it on the canvas and tells his body in his own terms (viewOf:
   view.shift):
     where he goes    a spot `at[0]` metres from the other man, `at[1]` degrees off the line he faced him on, out past his lead
                      foot (to the shifting man's right), wherever the other man is as he goes (no further than `most` from
                      where he started, and no wider a stance than `long`), his centre taken there over `go` from when the
                      rear foot goes (once the straight has got there, or as its shoulder fires: `with`); the rear foot's
                      spot is put by it (`foot`) and is fixed as it comes down. The lead foot stays where it is until then,
                      and is drawn in on its ball after (`rear`, `draw`)
     the punches      the body hook pressed `hookGo` after the straight got there (landed, blocked or gone by), the uppercut
                      `upperGo` after the hook did (both by name, meant as the shift); out of the shell, both `shell` sooner
     back round       `backAt` after the uppercut got there: the lead foot is brought round to the front past the rear one, which
                      turns on its ball and is drawn as far as it must be, and his centre goes where his own stance puts it
                      `end` metres from the other man, square to him (a legend `turn` degrees further round him)
   Nothing else he is told is done while it lasts (no guard, no evasion, no walking: the crouch is his defence). A blow puts an
   end to it (strike), and so does anything that is not its own punches (a parry's reel); his feet are put back under him then
   (anim/shift.mjs). A legend reads a punch on its way at him and does not start it into it (`read`). */
const shiftsAt = f => (has(f, 'shift') ? shiftOf(gradeOf(f.skills, 'shift')) : null);
// (the breath it takes besides the straight's: the step, the hook, the uppercut; and seconds at the most it lasts)
const SHIFT = { breath: 6 + 8 + 9, most: 1.6 };
// (where the ball of his rear foot is in his own stance, and where a ball of his is on the canvas now)
const BALL_R = (() => {
  const b = M.app(M.ry(GUARD.feet.R.yaw), FOOT.ball);
  return [GUARD.feet.R.at[0] + b[0], 0, GUARD.feet.R.at[2] + b[2]];
})();
const ball = (f, side) => {
  const p = at(f, side === 'L' ? 'LeftToeBase' : 'RightToeBase');
  return [p[0], p[2]];
};
function shiftBegin(bout, f, other, sv) {
  const dx = other.x - f.x,
    dz = other.z - f.z,
    d = Math.hypot(dx, dz) || 1,
    fa = [dx / d, dz / d];
  f.stamina = Math.max(0, f.stamina - SHIFT.breath);
  bout.events.push({ type: 'shift', who: bout.fighters.indexOf(f) });
  return { id: 'shift' + ++f.serial, at: bout.t, sv, from: [f.x, f.z], fa, right: [-fa[1], fa[0]], R0: f.pose ? ball(f, 'R') : null, Lst: f.pose ? ball(f, 'L') : [f.x, f.z], R1: null, C: null, L0: null, got: {}, pressed: {}, back: null, shell: !!f.shell, landed: false, t: 0, off: null };
}
// where the shift takes his centre, from where the other man is now
function shiftTarget(f, other) {
  const s = f.shift,
    sv = s.sv,
    th = (sv.at[1] * Math.PI) / 180,
    C = [other.x + sv.at[0] * (-Math.cos(th) * s.fa[0] + Math.sin(th) * s.right[0]), other.z + sv.at[0] * (-Math.cos(th) * s.fa[1] + Math.sin(th) * s.right[1])],
    go = [C[0] - s.from[0], C[1] - s.from[1]],
    l = Math.hypot(go[0], go[1]),
    to = l > sv.most ? [s.from[0] + (go[0] * sv.most) / l, s.from[1] + (go[1] * sv.most) / l] : C,
    // (and no wider a stance than `long`, from the rear foot's spot to the lead foot, which stays where it is)
    R = shiftFootAt(s, to),
    d = [R[0] - s.Lst[0], R[1] - s.Lst[1]],
    k = Math.hypot(d[0], d[1]);
  return k > sv.long ? [to[0] - d[0] * (1 - sv.long / k), to[1] - d[1] * (1 - sv.long / k)] : to;
}
// (the rear foot's spot, put by where his centre is going)
const shiftFootAt = (s, C) => [C[0] + s.sv.foot[0] * s.right[0] + s.sv.foot[1] * s.fa[0], C[1] + s.sv.foot[0] * s.right[1] + s.sv.foot[1] * s.fa[1]];
/* Each step, before he moves: what of it has got where, the punches it presses, and coming back round; or the end of it. */
function shiftStep(bout, f, who) {
  const s = f.shift,
    sv = s.sv,
    t = bout.t - s.at,
    other = bout.fighters[1 - who],
    a = f.action;
  // (over: down, stopped, doing something that is not its own, or its punches never came)
  if (f.down || f.stun > 0 || (a && !a.shifted) || t > SHIFT.most) return void (f.shift = null);
  s.t = t;
  // (each of its punches, as it got there: landed, blocked or gone by)
  if (a && a.shifted && a.chain && (a.struck || a.chain.thrownAt >= 0 || a.chain.phase === 'recover' || a.chain.phase === 'done') && s.got[a.name] === undefined) s.got[a.name] = bout.t;
  /* (the rear foot goes once the straight has got there, or, his grade's `with`, as its shoulder fires: the punch and the step
     one movement; out of the shell, once it has got there, whatever his grade: he is down in his crouch already) */
  if (s.off === null && (s.got.cross !== undefined || (sv.with === 'shoulder' && !s.shell && a && a.name === 'cross' && a.chain && a.chain.on[3])) && t >= sv.off - 1e-9) s.off = t;
  const cut = s.shell ? sv.shell : 0,
    press = (name, when) => {
      if (s.pressed[name] || bout.t < when - 1e-9) return;
      s.pressed[name] = true;
      (f.want = ['power', name, { tech: 'shift', body: name === 'shiftHook' }]), (f.wantAge = 0), (f.wantAt = bout.t);
    };
  if (s.got.cross !== undefined) press('shiftHook', s.got.cross + sv.hookGo - cut);
  if (s.got.shiftHook !== undefined) press('upperIn', s.got.shiftHook + sv.upperGo);
  // (his centre: where the step takes him, the rear foot's spot with it until it comes down)
  if (!s.back) {
    const C = s.landed ? s.C : shiftTarget(f, other);
    s.C = C;
    if (!s.landed) s.R1 = shiftFootAt(s, C);
    if (s.off !== null && t >= s.off + sv.step - 1e-9 && !s.landed) {
      /* (down: the lead foot, behind him now, drawn in on its ball as the weight comes down between the feet, to no further
         than `rear` metres from where his centre is going) */
      s.landed = true;
      s.Ls = ball(f, 'L');
      const d = [s.Ls[0] - C[0], s.Ls[1] - C[1]],
        l = Math.hypot(d[0], d[1]),
        k = l > sv.rear ? sv.rear / l : 1;
      s.Lin = [C[0] + d[0] * k, C[1] + d[1] * k];
      s.inAt = t;
    }
  }
  // back round, once the uppercut has got there
  if (!s.back && s.got.upperIn !== undefined && bout.t >= s.got.upperIn + sv.backAt - 1e-9) {
    /* (where his own stance puts him, square to the other man, `end` metres from him: of all those, the one whose rear foot is
       nearest where his right foot is, which turns on its ball and is drawn there as the lead foot comes round; a legend
       `turn` degrees further round him, away from the line the other man faced him on) */
    const R = ball(f, 'R'),
      O = [other.x, other.z],
      from = Math.atan2(f.z - O[1], f.x - O[0]),
      stand = (r, psi) => {
        const C = [O[0] + r * Math.cos(psi), O[1] + r * Math.sin(psi)],
          g = M.app(M.ry((Math.atan2(O[0] - C[0], O[1] - C[1]) * 180) / Math.PI), BALL_R);
        return { C, psi, r, cost: Math.hypot(C[0] + g[0] - R[0], C[1] + g[2] - R[1]) };
      };
    let best = null;
    for (let r = sv.end[0]; r <= sv.end[1] + 1e-9; r += 0.02)
      for (let k = -30; k <= 30; k++) {
        const c = stand(r, from + (k * Math.PI) / 90);
        if (!best || c.cost < best.cost) best = c;
      }
    if (sv.turn) {
      const off = psi => Math.abs(Math.atan2(Math.sin(psi - Math.atan2(-s.fa[1], -s.fa[0])), Math.cos(psi - Math.atan2(-s.fa[1], -s.fa[0])))),
        r = (sv.turn * Math.PI) / 180,
        psi = off(best.psi + r) > off(best.psi - r) ? best.psi + r : best.psi - r;
      best = stand(best.r, psi);
    }
    s.back = { at: bout.t, from: [f.x, f.z], to: best.C };
    s.L0 = ball(f, 'L');
    s.Rb = R;
  }
  if (s.back && bout.t - s.back.at >= sv.back - 1e-9) f.shift = null;
}
// how fast the shift is taking his centre over the canvas this step: [x, z] metres a second
function shiftTravel(f, dt) {
  if (!f.shift.C) return [0, 0];
  const s = f.shift,
    sv = s.sv,
    t = s.t,
    e = u => ((u = Math.max(0, Math.min(1, u))), u * u * u * (10 + u * (6 * u - 15))),
    want = s.back
      ? M.lerp([...s.back.from, 0], [...s.back.to, 0], e((t - (s.back.at - s.at)) / sv.back))
      : s.off === null
        ? [...s.from, 0]
        : M.lerp([...s.from, 0], [...s.C, 0], e((t - s.off - sv.go[0]) / (sv.go[1] - sv.go[0])));
  return [(want[0] - f.x) / dt, (want[1] - f.z) / dt];
}
// what his body is told of it (view.shift), in his own terms
function shiftView(bout, f) {
  const s = f.shift,
    sv = s.sv,
    t = bout.t - s.at,
    mineXZ = p => (p ? mine(f, [p[0], 0, p[1]]) : null);
  return {
    id: s.id, t, sv, shell: s.shell,
    step: s.off === null ? null : (t - s.off) / sv.step,
    off: s.off,
    back: s.back ? (bout.t - s.back.at) / sv.back : null,
    in: s.Lin ? (t - s.inAt) / sv.draw : null,
    Ls: mineXZ(s.Ls), Lin: mineXZ(s.Lin),
    R0: mineXZ(s.R0), R1: mineXZ(s.R1), L0: mineXZ(s.L0), Rb: mineXZ(s.Rb)
  };
}
/* The cross-arm guard (anim/show.mjs, docs/moves-plan-5.md §4A): a man who carries it (game/techniques.mjs: crossArm, by default
   the dirty great ones) holds his grade's whenever his guard is up (skill.mjs: CROSS, his grade at it being his guard's
   unless his skills name it). The one place it is decided. -> the shape, or null */
export const crossOf = f => (has(f, 'crossArm') ? CROSS[gradeOf(f.skills, 'crossArm').id] || null : null);
/* The shoulder roll (§4A.4): a press of the guard meant as rollCounter (game/techniques.mjs; a script names it the same way),
   at a grade that opens it, rolls at once; the roll is his grade's (skill.mjs: ROLL). While it lasts his guard is up (a fresh
   one neither hammers nor meets the punch: the roll is the answer), and the lead shoulder is in the way whatever guard he
   holds, a roll taking the cross-arm shape on for its moment if he holds none. f.roll: { t, roll, rolled (a punch rolled off
   it: { at, J }) } */
const rollOf = f => ROLL[gradeOf(f.skills, 'rollCounter').id] || null;
/* (the roll he is in, if it has rolled a punch off his shoulder and the arm that threw it is still held out there: what the
   roll & counter goes out of; ROLL_IN: centre to centre, closer than this it is the rear uppercut, §4A.7) */
const rolledOf = (f, bout) => (f.roll && f.roll.rolled && bout.t - f.roll.rolled.at <= SHOULDER.tied + 1e-9 ? f.roll : null);
const ROLL_IN = 0.74;
/* A punch to his body taken on the arms (or the lead glove) of his cross-arm guard, held up, is an opening for the rear hand
   set at his chin (§4A.6: f.crossed { at, part }, kept for anyone, the guard's grade opening one: skill.mjs CROSS counter): a
   power press meant as crossArm within `within` s, not hit in between, is the rear uppercut, the inside one right up close,
   and from `upper` metres or further the short overhand (the cross), its wind-up so far done. */
const CROSSED = { within: 0.3, upper: 0.9 };
function crossedOf(bout, f) {
  const c = crossOf(f),
    b = f.crossed;
  if (!c || !c.counter || !b || bout.t - b.at > CROSSED.within + 1e-9 || f.sinceHit < bout.t - b.at - 1e-9) return null;
  return { load: c.counter.load, at: b.at, part: b.part };
}
function rollFor(bout, f, input, dt) {
  if (f.roll) {
    f.roll.t += dt;
    const r = f.roll.roll;
    // (he stays rolled under the arm he has rolled off his shoulder for as long as it is held out there)
    if (f.roll.rolled && bout.t - f.roll.rolled.at < SHOULDER.tied) f.roll.t = Math.min(f.roll.t, r.lag + r.go + r.hold);
    // (over once it has unwound, or the moment he does anything else or is stopped by a blow)
    if (f.roll.t >= r.lag + r.go + r.hold + r.home || f.action || f.stun > 0) f.roll = null;
  }
  const a = !f.roll && !f.action && f.stun <= 0 && input.cover && asked(f, input);
  if (a && a.tech === 'rollCounter' && rollOf(f)) {
    f.roll = { t: 0, roll: rollOf(f), at: bout.t, rolled: null };
    bout.events.push({ type: 'roll', who: bout.fighters.indexOf(f) });
  }
}
/* What of his guard is in the way, for the bout's strike: the cross-arm guard he holds (its forearms; the hammer, a dirty
   great one's parry), and whether a guard put up fresh turns a punch aside the way his grade parries (not in a roll, not with a
   cross-arm guard that takes a jab rather than meeting it). rear: a cross-arm guard that does not parry the way his grade
   does, put up fresh, turns aside a little all the same: a punch that meets its rear glove, the one at his chin, and nothing
   that meets the lead arm laid across his belly (the user's choice, 2026-11-28, card a-dark-line: "크로스암 가드에 패리를
   조금"; held as it was, it turned nothing aside but by the hammer, and the dirty great ones parried a quarter as often as
   they do without it, docs/audit-2026-11-25/1-4.mjs). While the hammer is coming down the rear glove is the hammer's, not
   the guard's (the strike) */
/* (how much of his grade's window a cross-arm guard's rear glove turns a punch aside in, the freshest of it: half. All of it, a
   pro carrying the guard parried a jab put up on any of nine frames, as his high guard does) */
const CROSS_PARRY = 0.5;
const guardOf = other => {
  const cross = crossOf(other),
    open = !other.roll && !other.shell;
  return { cross, hammer: cross && cross.hammer, parries: open && (!cross || cross.parry === 'meet'), rear: open && !!cross && cross.parry !== 'meet' };
};
/* The lead shoulder (§4A.4): a ball of `r` round the shoulder joint, in the way of a punch while a cross-arm guard is up or a
   roll is on. A punch that meets it while his chest is turning away to his right at `rolling` degrees a second or more, in a
   roll, is rolled off it: a block (part 'shoulder', roll: true) that lets `soft` of the held guard's share through, and the
   arm that threw it is held out where it was stopped for `tied` seconds, carried on after it (moves.mjs rolled). One that
   meets a shoulder standing still lets `hard` of it through (roll: false). */
const SHOULDER = { r: 0.07, rolling: 200, soft: 0.5, hard: 2, tied: 0.3 };
const shoulderUp = other => !!other.before && !!other.before.LS && (!!other.roll || (!!crossOf(other) && other.cover && other.animator.covered >= RULES.guardUp));
// (how fast his shoulders turned to his right this step, degrees a second: the line from the rear shoulder to the lead one)
const turning = (other, dt) => {
  const way = p => Math.atan2(p.LS[0] - p.RS[0], p.LS[2] - p.RS[2]);
  return (-(((way(other.points) - way(other.before) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180) / Math.PI / dt;
};
function shouldered(bout, f, other, who, action, blow, J, felt, stop, dt, s) {
  const roll = !!other.roll && turning(other, dt) >= SHOULDER.rolling,
    // (and how far his head was from the glove as it met his shoulder, surface to surface: how much room the roll left)
    margin = Math.hypot(...M.sub(M.lerp(f.before[blow.hand], f.points[blow.hand], s), M.lerp(other.before.head, other.points.head, s))) - RULES.glove - RULES.head;
  other.hp = Math.max(1, other.hp - J * RULES.damage * other.k.smother * (roll ? SHOULDER.soft : SHOULDER.hard) * other.k.chin);
  other.kx += ((blow.dir[0] * J) / RULES.mass) * RULES.shove * 0.6;
  other.kz += ((blow.dir[1] * J) / RULES.mass) * RULES.shove * 0.6;
  other.animator.strike({ J: J * 0.25, dir: felt.dir });
  bout.stop = stop * 0.4;
  if (roll) {
    // (held out where it was stopped, and carried on after it: tied up)
    action.chain.hold = Math.max(action.chain.hold, SHOULDER.tied);
    action.rolled = { at: action.chain.t };
    f.stun = Math.max(f.stun, SHOULDER.tied);
    other.roll.rolled = { at: bout.t, J };
  }
  return bout.events.push(Object.assign({ type: 'block' }, blow, { part: 'shoulder', roll, margin: +margin.toFixed(4) }));
}

/* ---- The cross counter (docs/cross-counter-plan.md §4.5; stage Y; anim/over.mjs, moves.mjs crossOver): a power press meant
   as crossCounter (game/techniques.mjs) by a man who carries it, standing in his guard (doing nothing else), at a jab coming at
   his head (the lead hand's straight: a jab, a face jab, a flicker; not one to the body) from `near` to `far` metres centre to
   centre, is the rear straight thrown over it (crossOver), a counter. Anywhere else the press is the power punch it would have
   been. And only at a jab whose aim is set no more than `aim` steps after it started (stepsFromStart: the jab's own chain,
   run on where it is not set yet): a pro's, a great one's and a legend's are set on its 4th step, an amateur's on its 8th, a
   beginner's on its 9th. At a jab that takes that long to come the press is the power punch it would have been, the
   straight, which lands before such a jab is out: the cross counter, timed to the aim, waited for it or went before it was
   out, and landed lighter than that straight or not at all in 908 of the 12,320 bouts of the plan's §9.2 sweep, every one of
   them at an amateur's or a beginner's jab, and its arm went through his in most of the rest there. Nor once the jab has
   won: pressed more than `late` steps after its aim is set (the windows end a step after it), the jab lands before the head
   can go, and the press is the power punch it would have been (the cross counter's head, going all the same, took him on into
   the jab: harder, and his arm in the other man, in 29 bouts of the sweep).
   A grade whose table says so (skill.mjs OVER wait: a great one's and a legend's) waits, pressed before the jab's aim
   is set, for the step it is set on, and no longer than `wait` seconds; the jab gone while he waits (cut short, or landed),
   he lets it go and is back in his guard, nothing thrown. A grade that does not wait (a pro) throws it only once the jab's
   aim is set, or will be by the end of this step (no more than `early` steps before it): pressed before that, the press is
   the power punch it would have been (his head going before the aim was set, the jab followed it and landed, and the rear
   arm he had lifted over it came home through the jab's forearm: 34 bouts of the sweep, the two men's arms in each other).
   The jab gone by (`by`: its elbow that far straight, the step a pro's reaches a head that stood where his was, or it is no
   longer coming: crossBy) is what his head waits for to go on in at him (anim/over.mjs); going in from the moment he went,
   it took him into a jab that had not gone by, and a cross counter that lost was hit harder than the plain cross. The rules the plan leaves to the user (§0.3), each one switch here:
     counter  the counter's gain (RULES.counterGain, its held moment and its step in): 'out', only if it lands while the jab's
              arm is still out (the jab still his action, on its way, held out, or coming home with its elbow `elbow` or
              more of the way straight); 'never', a plain blow (the plan's (나))
              (the plan's (다), a gain of its own, 1.4, would be a third value here and its own multiplier in strike)
     through  0: the first blow cuts the other man's punch short, as it always has (no trade). Over 0 (the plan's (나)): a cross
              counter that is hit when its elbow is that far straight goes on (a trade); the switch is wired and off, and nothing
              has been fought with it on
   The other two, who carries it (game/techniques.mjs: crossCounter open, not standard) and the dirty grades' body (skill.mjs
   OVER), are a table entry each. f.action.crossing: { of (the jab's id), at, go (chain.t it went at, null while it waits) } */
export const CROSSING = { near: 0.88, far: 1.16, wait: 0.12, aim: 5, late: 1, early: 0, by: 0.6, counter: 'out', elbow: 0.8, through: 0 };
// (the jab he can throw it over: coming at his head, lead hand, straight, its aim soon set, and he where it can be thrown from)
function crossingOf(f, other, far, who) {
  const jab = !f.action && f.stun <= 0 && has(f, 'crossCounter') && far >= CROSSING.near - 1e-9 && far <= CROSSING.far + 1e-9 ? incoming(other) : null,
    move = jab && MOVES[jab.name];
  return move && move.hand === 'L' && move.kind === 'straight' && !move.zone && !(jab.asked && jab.asked.body) && stepsFromStart(jab, who) <= CROSSING.aim && !won(jab, who) && (waits(f) || stepsToAim(jab, who, CROSSING.early) <= CROSSING.early) ? jab : null;
}
// (a grade that waits for the jab's aim, skill.mjs OVER wait: at the cross's grade, as begin has it)
const waits = f => !!(OVER[levelOf(f.skills, f.skills && f.skills.crossOver ? 'crossOver' : MOVES.crossOver.of).id] || OVER[3]).wait;
// (and the jab has not won already: its aim set more than CROSSING.late steps before the end of this one)
const won = (jab, who) => jab.aimAge !== undefined && Math.round(jab.chain.t / DT) + (who < 1 - who ? 1 : 0) - jab.aimAge > CROSSING.late;
/* (how many steps from its start the jab's aim is set: as it was, set already; or the steps it will have been going by the end
   of this one and those after this one it takes to set, its chain run on; Infinity, more than CROSSING.aim) */
function stepsFromStart(jab, who) {
  if (jab.aimAge !== undefined) return jab.aimAge;
  const age = Math.round(jab.chain.t / DT) + (who < 1 - who ? 1 : 0);
  return age > CROSSING.aim ? Infinity : age + stepsToAim(jab, who, CROSSING.aim - age);
}
/* (how many steps after this one the jab's aim is set: its shoulder on; 0, set already or on this step; Infinity, not within
   `most`. Its chain is run on, a copy of it, as he will run it: fought in turn, a man still to come this step has not moved
   yet, and his is run on this step's first) */
function stepsToAim(jab, who, most) {
  if (jab.aim || jab.chain.on[3]) return 0;
  const c = jab.chain,
    ahead = who < 1 - who ? 1 : 0,
    copy = Object.assign({}, c, { q: c.q.slice(), v: c.v.slice(), a: c.a.slice(), push: c.push.slice(), ready: c.ready.slice(), handed: c.handed.slice(), on: c.on.slice(), fired: c.fired.slice(), peak: c.peak.slice(), peakAt: c.peakAt.slice(), coil: Object.assign({}, c.coil) });
  for (let n = 1; n <= most + ahead; n++) {
    stepChain(copy, MOVES[jab.name], DT);
    if (copy.on[3]) return Math.max(0, n - ahead);
  }
  return Infinity;
}
// (has the jab's aim been set, or will it be on this step)
const aimSet = (bout, f, jab, who) => stepsToAim(jab, who, 0) === 0;
// (each step, before his chain is: a cross counter waiting for the jab's aim goes now, or is let go of)
function crossWait(bout, f, who) {
  const a = f.action,
    c = a.crossing,
    other = bout.fighters[1 - who],
    jab = other.action && other.action.id === c.of && !other.action.struck ? other.action : null;
  if (!jab) return void (f.action = null);
  if (aimSet(bout, f, jab, who) || a.chain.t >= CROSSING.wait - 1e-9) (c.go = a.chain.t), (a.chain.wait = a.chain.t);
}
const waiting = action => !!action && !!action.crossing && action.crossing.go === null;
/* (the jab gone by: out as far as it reaches a head that stood where his did, its elbow `elbow` of the way straight, or on its
   way home, or gone; marked once, on his chain's clock, as both men's steps are done (viewOf), so that it is the same step
   from either corner: action.crossing.by. Until then his head goes across and down, not in: anim/over.mjs) */
function crossBy(f, other) {
  const c = f.action.crossing,
    jab = other.action && other.action.id === c.of && other.action.chain ? other.action : null;
  if (c.go !== null && (!jab || !["coil", "throw"].includes(jab.chain.phase) || jab.chain.q[4] >= CROSSING.by - 1e-9)) c.by = f.action.chain.t;
}
// (does it land as a counter: the plan's §0.3 (1), CROSSING.counter)
function crossCounted(action, other) {
  if (CROSSING.counter !== 'out') return false;
  const jab = other.action;
  return !!jab && jab.id === action.crossing.of && !!jab.chain && (['coil', 'throw', 'hold'].includes(jab.chain.phase) || (jab.chain.phase === 'recover' && jab.chain.q[4] >= CROSSING.elbow - 1e-9));
}

/* The wave from step to step (anim/clean.mjs): held while it is asked for; the ropes in the way he is going are the end of it,
   and so is his lead foot stood on (at once). Gone once he is doing anything that is not the wave or a jab out of it (a
   moment's grace, for the wave to be taken up again as a jab out of it comes home). */
function holdWave(bout, f, input, who) {
  const w = f.wave,
    on = !!f.action && (f.action.name === 'wave' || !!f.action.wave);
  if (on) w.seen = bout.t;
  else if (bout.t - w.seen > 0.1 + 1e-9) return void (f.wave = null);
  w.held = input.away === 'wave';
  w.blocked = waveBlocked(f, bout.fighters[1 - who], RULES.half);
  if (f.pinned > 0 && f.action && f.action.name === 'wave') (f.action = null), (f.wave = null);
}

function decide(bout, f, input, dt, who) {
  // (in the Tyson shift, nothing else he is told is done: its own punches are the bout's to press, anim/shift.mjs)
  if (f.shift) shiftStep(bout, f, who);
  if (f.shift) input = {};
  // (a legend's cross after the jab out of his down parry, pressed on its own when its moment comes: anim/clean.mjs)
  if (f.patFollow !== undefined && f.patFollow !== null && bout.t >= f.patFollow - 1e-9) {
    f.patFollow = null;
    if (!f.want) (f.want = ['power', true]), (f.wantAge = 0), (f.wantAt = bout.t);
  }
  // (a legend's other hand's hook after his block and fire, pressed on its own when its moment comes: anim/clean.mjs)
  if (f.fireFollow && bout.t >= f.fireFollow.at - 1e-9) {
    const other = bout.fighters[1 - who],
      inside = Math.hypot(other.x - f.x, other.z - f.z) < f.fireFollow.inside;
    if (!f.want) (f.want = ['power', f.fireFollow.hand === 'L' ? (inside ? 'hookIn' : 'hook') : 'hookR']), (f.wantAge = 0), (f.wantAt = bout.t);
    f.fireFollow = null;
  }
  // (and the rear body uppercut after the hook out of the shell, pressed on its own when its moment comes)
  if (f.shellFollow && bout.t >= f.shellFollow.at - 1e-9) {
    if (!f.want) (f.want = ['power', 'upperBody', { tech: 'shell', body: true }]), (f.wantAge = 0), (f.wantAt = bout.t);
    f.shellFollow = null;
  }
  const pressed = signed(f, input, pressOf(input));
  // (a taunt is over the moment he does anything: a button, his guard, setting off: anim/show.mjs)
  if (f.action && MOVES[f.action.name].taunt && (pressed || input.cover || Math.hypot(...(input.move || [0, 0])) > 0.3)) f.action = null;
  if (pressed) (f.want = pressed), (f.wantAge = 0), (f.wantAt = bout.t);
  // (the pull counter's press is kept for as long as he is still in the sway it is to come out of: anim/evade.mjs PULLED)
  else if (f.want && (f.wantAge += dt) > RULES.buffer && !pullKept(f, bout.t)) f.want = null;
  if (f.wave) holdWave(bout, f, input, who);
  if (f.want) {
    // (the wave, asked of a man who does not carry it or whose grade has none, is the circle out: anim/clean.mjs)
    const what = f.want[0] === 'wave' && !wavesAt(f) ? 'hopCircle' : f.want[0],
      dir = f.want[1],
      sign = f.want[2],
      punch = !GOING.includes(what) && !EVADE.includes(what) && what !== 'taunt';
    // (a man whose lead foot is stood on cannot dash or sway back off it, or go in or away; he can still slip and duck)
    if (f.pinned > 0 && (GOING.includes(what) || what === 'pull')) f.want = null;
    // (a taunt named while he is moving away is the one on the last hop)
    else if (what === 'taunt' && f.action && (f.action.name === 'hopPivot' || f.action.name === 'hopCircle')) (f.action.taunt = dir), (f.want = null);
    // (a jab pressed in a flicker waits for the hand to be home at his waist: a flicker goes again from there, at once)
    else if (what === 'jab' && f.action && f.action.name === 'flicker' && Math.max(f.action.chain.q[3], f.action.chain.q[4]) > FLICK.home);
    // (the wave held: he is in it already)
    else if (what === 'wave' && f.action && f.action.name === 'wave') f.want = null;
    // (a legend does not start the Tyson shift into a punch on its way at him: its first punch would be caught)
    else if (what === 'power' && typeof dir !== 'string' && !!sign && sign.tech === 'shift' && !f.shift && shiftsAt(f) && shiftsAt(f).read && incoming(bout.fighters[1 - who])) f.want = null;
    else if (open(f, punch)) {
      f.want = null;
      if (EVADE.includes(what)) {
        begin(f, what, { side: dir === true ? 1 : dir }, bout);
        // (what he is getting out of the way of: the other man's punch on its way, if there is one)
        const other = bout.fighters[1 - who],
          coming = incoming(other) || (punching(other) && other.action.chain.phase === 'hold' && !other.action.struck ? other.action : null);
        f.defence = { kind: 'evade', start: bout.t, of: coming ? coming.id : null, from: coming ? coming.at : bout.t, margin: null, late: false, counterAt: null, event: null, said: false };
        bout.events.push({ type: what, who });
      } else if (what === 'taunt') {
        taunt(bout, f, who, dir);
      } else if (what === 'duckIn' || what === 'hopPivot' || what === 'hopCircle') {
        begin(f, what, plan(f, bout.fighters[1 - who], what, dir), bout);
        bout.events.push({ type: what, who });
        // (a show-off's last hop may be a taunt: his dice, in a real bout)
        const p = tauntChance(f, 'hop');
        if (p && f.luck() < p) f.action.taunt = TAUNTS.hop[Math.floor(f.luck() * TAUNTS.hop.length)];
      } else if (what === 'wave') {
        // (the wave: round the other man to the side asked, kept on, or taken up again after a jab out of it; not into the ropes)
        const side = f.wave ? f.wave.side : dir === -1 ? -1 : 1;
        if (f.wave || !waveBlocked(f, bout.fighters[1 - who], RULES.half, side)) {
          f.wave = f.wave || { side, v: 0, held: true, blocked: false, seen: bout.t };
          begin(f, 'wave', { side }, bout);
          bout.events.push({ type: 'wave', who });
        }
      } else if (!punch) {
        const [fx, fz] = aheadOf(f);
        let d = dir === true ? [-fx, -fz] : dir;
        const l = Math.hypot(d[0], d[1]) || 1;
        d = [d[0] / l, d[1] / l];
        begin(f, 'dash', { dir: local(f, d[0], d[1]), go: d }, bout);
        bout.events.push({ type: 'dash', who });
      } else {
        let name = 'jab',
          plain = false; // (a power press of the chain itself, no counter's and no technique's punch)
        // (out of an evasion, a power punch is the one it has wound up: the rear hand's straight, the lead hook off a slip
        // or a weave to the left, the uppercut out of a duck)
        const out = f.action && isEvasion(f.action.name) ? f.action : f.lastEvade && f.lastEvade.endedAt !== null && bout.t - f.lastEvade.endedAt <= GRACE ? f.lastEvade.action : null;
        // (right up close, the inside chain: the lead hand's the inside hook, the rear hand's the inside uppercut)
        const other = bout.fighters[1 - who],
          far = Math.hypot(other.x - f.x, other.z - f.z),
          inside = far < RULES.inside,
          chain = inside ? RULES.chainIn : RULES.chain;
        /* (out of a sway back, the pull counter, game/techniques.mjs, at every grade: the straight, or the liver hook asked for
           the body, or the rear hook it names; anim/evade.mjs PULLED) */
        const pulled = what === 'power' && !!out && out.name === 'pull' && !!sign && sign.tech === 'pullCounter';
        /* (out of a shoulder roll that has rolled a punch off his shoulder, the roll & counter, game/techniques.mjs: the rear
           hook, the rear uppercut right up close, or the one it names; a counter, the arm he rolled still held out there) */
        const rollOut = what === 'power' && !pulled && !!sign && sign.tech === 'rollCounter' ? rolledOf(f, bout) : null;
        // (and off a punch to his body taken on the arms of his cross-arm guard, its counter: §4A.6, game/techniques.mjs)
        const crossed = what === 'power' && !pulled && !rollOut && !!sign && sign.tech === 'crossArm' ? crossedOf(bout, f) : null;
        // (off an elbow block, block and fire: the arm that blocked it, game/techniques.mjs, anim/clean.mjs)
        /* (the Tyson shift, anim/shift.mjs: its first punch, the rear hand's straight; and the two after it, pressed by the bout
           by name) */
        const shifted = what === 'power' && !pulled && !!sign && sign.tech === 'shift' ? (f.shift ? (typeof dir === 'string' && dir !== 'cross' ? f.shift : null) : typeof dir !== 'string' ? shiftsAt(f) : null) : null;
        const fired = what === 'power' && !pulled && !shifted && typeof dir !== 'string' ? firedOf(bout, f, sign) : null,
          // (out of the peek-a-boo shell: the lead hook, the inside one right up close; the body uppercut after it by name)
          shelled = what === 'power' && !pulled && !fired && !shifted ? (typeof dir === 'string' ? (dir === 'upperBody' && sign && sign.tech === 'shell' ? { follow: true } : null) : shellCounter(bout, f, sign)) : null;
        // (a jab coming at his head, and a power press meant as the cross counter: the rear straight over it, CROSSING)
        const crossing = what === 'power' && typeof dir !== 'string' && !!sign && sign.tech === 'crossCounter' && !sign.body ? crossingOf(f, other, far, who) : null;
        if (crossing) (name = 'crossOver'), (f.link = 0);
        else if (pulled) (name = sign.body ? 'hookBody' : 'cross'), (f.link = 0);
        else if (rollOut) (name = Math.hypot(other.x - f.x, other.z - f.z) < ROLL_IN ? 'upperIn' : 'hookR'), (f.link = 0);
        else if (crossed) {
          const far = Math.hypot(other.x - f.x, other.z - f.z);
          name = far < ROLL_IN ? 'upperIn' : far < CROSSED.upper ? 'upper' : 'cross';
          f.link = Math.max(0, chain.indexOf(name));
        }
        else if (shifted && !f.shift) (name = 'cross'), (f.link = 0);
        else if (fired) {
          name = fireName(fired.hand, Math.hypot(other.x - f.x, other.z - f.z) < fired.fire.inside);
          f.link = Math.max(0, chain.indexOf(name));
        } else if (shelled && !shelled.follow) {
          name = Math.hypot(other.x - f.x, other.z - f.z) < shelled.sh.inside ? 'hookIn' : 'hook';
          f.link = Math.max(0, chain.indexOf(name));
        }
        else if (what === 'power' && out && out.level.evade.load > 0) {
          name = LOADED(out.name, out.side) === 'L' ? 'hook' : out.name === 'duck' ? 'upper' : 'cross';
          if (inside) name = name === 'hook' ? 'hookIn' : 'upperIn';
          f.link = Math.max(0, chain.indexOf(name));
        } else if (what === 'power' && f.parried && f.parried.hammer && bout.t - f.parried.at <= RULES.counter) {
          // (out of a hammering parry, the rear fist down: the power punch is the lead hook it has wound up, anim/show.mjs)
          name = inside ? 'hookIn' : 'hook';
          f.link = Math.max(0, chain.indexOf(name));
        } else if (what === 'power' && f.parried && f.parried.down && bout.t - f.parried.at <= RULES.counter) {
          // (out of a down parry: the counter it opens, anim/clean.mjs)
          name = patCounter(bout, f, inside);
          f.link = Math.max(0, chain.indexOf(name));
        } else if (what === 'power') {
          /* (the pressed chain; and the press soon after one of the pressed inside chain goes on with it out to
             RULES.insideOn, where the punch it comes to is his at a pro's grade or below and the other man's guard is not up:
             f.inChain, RULES.insideTo) */
          const on = f.sinceLast < RULES.combo && f.lastPower,
            next = RULES.chainIn[(f.link + 1) % RULES.chainIn.length],
            kept = !inside && on && !!f.inChain && far < RULES.insideOn && levelOf(f.skills, next).grade <= RULES.insideTo && !other.cover,
            pressed = kept ? RULES.chainIn : chain;
          f.link = on ? (f.link + 1) % pressed.length : 0;
          name = pressed[f.link];
          plain = true;
        }
        /* a show-off's trick (anim/show.mjs, docs/moves-plan-4.md §5.2): the one the press names, or one his dice turn up; a
           flicker pressed again within FLICK.again of the last one arriving is another, with no wind-up, up to FLICK.most */
        /* (a press that names a punch is that punch: a script's, or a technique's answer, the rear hook out of a sway back or a
           shoulder roll; and a press for the body is the body punch of the one it would have been: moves.mjs TO_BODY) */
        const named = typeof dir === 'string' && MOVES[dir] && MOVES[dir].punch && !THROWS[dir] ? dir : null,
          low = !named && !shifted && !!sign && !!sign.body && !!TO_BODY[name];
        if (named) name = named;
        else if (low) name = TO_BODY[name];
        const again = !named && !low && what === 'jab' && f.flicks && f.flicks.n < FLICK.most && f.wantAt - f.flicks.at <= FLICK.again + 1e-9,
          trick = again ? 'flicker' : named || low || crossing ? null : trickOf(f, other, what, name, dir);
        if (trick && THROWS[trick]) name = trick === 'pawUp' && inside ? 'upperIn' : THROWS[trick];
        if (name === 'flicker') f.flicks = { n: again ? f.flicks.n + 1 : 1, at: Infinity };
        else if (what === 'jab') f.flicks = null;
        // (a jab out of the wave goes on with it; a power punch puts an end to it)
        const fromWave = !!f.wave && what === 'jab' && !!f.action && f.action.name === 'wave';
        if (f.wave && !fromWave) f.wave = null;
        if (shifted && !f.shift) f.shift = shiftBegin(bout, f, other, shifted);
        begin(f, name, { counter: f.counter > 0 || !!fired || !!rollOut || (!!crossing && CROSSING.counter !== 'never'), variant: trick, wave: fromWave || undefined, pulled: pulled || undefined, fired: fired || undefined, shelled: shelled || undefined, shifted: shifted ? true : undefined, rollOut: rollOut ? { t: rollOut.t, roll: rollOut.roll, at: bout.t } : undefined, crossed: crossed || undefined, crossing: crossing ? { of: crossing.id, at: bout.t, go: 0 } : undefined }, bout);
        if (crossed) f.crossed = null;
        if (crossing) {
          /* (a grade that waits for the jab's aim, pressed before it is set: nothing moves until it is, CROSSING; and what he got
             out of the way of, his counter with it: a miss by a whisker makes it brilliant, judge) */
          if ((OVER[f.action.level.id] || OVER[3]).wait) (f.action.crossing.go = null), (f.action.chain.wait = CROSSING.wait);
          f.defence = { kind: 'evade', start: bout.t, of: crossing.id, from: crossing.at, margin: null, late: false, counterAt: bout.t, counter: f.action.id, event: null, said: false };
        }
        if (fired) (f.elbowed = null), (f.fireFollow = null);
        if (shelled && !shelled.follow) (f.shellOpen = null), (f.shellFollow = null), (f.action.shellOut = shelled.sh);
        // a loaded punch answering a defence: what makes the defence brilliant, if it was close enough
        if (f.action.loaded && f.action.loaded.load > 0 && f.action.loaded.from !== 'legend' && f.action.loaded.from !== 'wave' && f.defence && f.defence.counterAt === null && bout.t - f.defence.start <= BRILLIANT.within + 1e-9) (f.defence.counterAt = bout.t), (f.defence.counter = f.action.id), judge(bout, f, who);
        f.lastPower = what === 'power';
        f.inChain = plain && !named && !trick && RULES.chainIn.includes(name);
        f.counter = 0;
        bout.events.push({ type: 'punch', who, name });
      }
      // (what the head meant the press as, on the move it started: game/techniques.mjs)
      if (sign && f.action) f.action.asked = sign;
    }
  }
  /* A stunned boxer can still pull his hands up (it is what a hurt man does) but not in time to turn a punch aside: his guard
     counts as an old one at once. A man thrown open by a parry, or in the middle of anything, cannot. */
  // (a shoulder roll: started by the guard put up meant as one, and the guard up for as long as it lasts)
  rollFor(bout, f, input, dt);
  const dazed = f.stun > 0,
    covering = (!!input.cover || !!f.roll) && !f.action && !f.shift;
  f.coverAge = covering ? (f.cover ? f.coverAge + dt : dazed ? 9 : 0) : 0;
  if (covering && !f.cover) bout.events.push({ type: 'cover', who });
  // (a guard meant as a down parry: anim/clean.mjs)
  patGuard(bout, f, input, covering, dt);
  // (a guard meant as the peek-a-boo shell: anim/clean.mjs)
  shellGuard(bout, f, input, covering, dt, who);
  f.cover = covering;
}

function travel(f, input, dt, other) {
  // (in the Tyson shift, he goes where it takes him and nowhere else: anim/shift.mjs)
  const m = (!f.shift && input.move) || [0, 0],
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
  } else if (f.action && f.action.name === 'duckIn') {
    // (in, the same curve, over the stretch the rear leg pushes him and the lead foot lands; after his grade's seam)
    const a = f.action,
      e = a.level.entry,
      u = (a.t - GO.inFrom - e.seam) / GO.inTime,
      rate = u > 0 && u < 1 ? (30 * u * u * (1 - u) * (1 - u) * a.reach) / GO.inTime : 0;
    sx = a.go[0] * rate;
    sz = a.go[1] * rate;
    // (a legend goes on round on the ball of his lead foot at the end, to the other man's side: to his own left)
    const [pa, pr] = e.pivot,
      w = (a.t - (GO.inFrom + e.seam + GO.inTime * 0.85)) / 0.12;
    if (pr && w > 0 && w < 1) {
      const side = [a.go[1], -a.go[0]],
        v = (pr * 30 * w * w * (1 - w) * (1 - w)) / 0.12;
      sx += side[0] * v;
      sz += side[1] * v;
    }
  } else if (f.action && (f.action.name === 'hopPivot' || f.action.name === 'hopCircle')) {
    const a = f.action,
      aw = a.level.away,
      [fx, fz] = aheadOf(f),
      left = [fz, -fx];
    if (a.name === 'hopPivot' && aw.pivot) {
      // round the ball of his lead foot, the rear foot drawing the circle; then hopped back, half a beat a hop
      const k = (aw.pivot * Math.PI) / 180,
        e = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)),
        place = t => {
          const ang = -a.side * k * e(t / GO.turn), // (+ side: round to his left)
            ox = a.from[0] - a.centre[0],
            oz = a.from[1] - a.centre[1];
          return [a.centre[0] + ox * Math.cos(ang) + oz * Math.sin(ang), a.centre[1] - ox * Math.sin(ang) + oz * Math.cos(ang)];
        };
      if (a.t <= GO.turn + dt) {
        const p0 = place(a.t - dt),
          p1 = place(a.t);
        sx = (p1[0] - p0[0]) / dt;
        sz = (p1[1] - p0[1]) / dt;
      } else if (a.t < GO.turn + GO.back * GO.beat) (sx = -fx * (GO.backHop / GO.beat)), (sz = -fz * (GO.backHop / GO.beat));
    } else if (a.name === 'hopPivot' || !aw.hop) {
      // (a man who cannot hop walks back, and goes no further than his hops would)
      const n = a.name === 'hopPivot' ? GO.back : GO.round;
      if (a.t < n * GO.beat * 1.4) (sx = -fx * (GO.backHop / (GO.beat * 1.4))), (sz = -fz * (GO.backHop / (GO.beat * 1.4)));
    } else if (a.t < GO.round * GO.beat) {
      // round him, still facing him, and out (his chest kept on him: face)
      sx = (left[0] * a.side * GO.hop - fx * GO.out) / GO.beat;
      sz = (left[1] * a.side * GO.hop - fz * GO.out) / GO.beat;
    }
  } else if (f.shift) {
    [sx, sz] = shiftTravel(f, dt);
    f.vx = f.vz = 0;
  } else if (f.wave && other && f.stun <= 0 && (!f.action || f.action.name === 'wave' || f.action.wave)) {
    // (the wave: round him at the pace of the wave his feet are in, kept in its band, anim/clean.mjs)
    [sx, sz] = waveTravel(f, other, dt, !!incoming(other));
  }
  let ix = 0,
    iz = 0;
  // (not a cross counter waiting for the jab's aim: nothing of him moves until it goes, CROSSING)
  if (incoming(f) && other && !other.down && !f.shift && !waiting(f.action)) {
    /* A punch is stepped into: he closes on a head that is just out of range, so a combination follows its target back
       and a counter reaches a man who has been thrown onto his heels. (It is the head he measures to, not the feet.) */
    // (a punch to the body measures to his trunk: moves.mjs zone)
    const low = !!MOVES[f.action.name].zone && !!other.points && !!other.points.waist,
      head = other.points ? (low ? other.points.waist : other.points.head) : [other.x, 0, other.z],
      ox = head[0] - f.x,
      oz = head[2] - f.z,
      far = (Math.hypot(ox, oz) || 1) + (low ? 0 : 0.09),
      // (and the pull counter's liver hook, the weight driven forward out of the sway, to its own distance: anim/evade.mjs)
      close = Math.max(0, Math.min(RULES.stepIn * (f.action.counter ? 1.5 : 1), (far - (f.action.variant === 'elbow' ? ELBOW.close : pullTo(f.action) ?? MOVES[f.action.name].close)) * 9));
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
  const rate = RULES.turnRate * (punching(f) ? 0.35 : f.stun > 0 ? 0.2 : 1),
    // (going round him in the wave, his facing is carried round with the line to him: anim/clean.mjs)
    round = f.wave && dt > 0 ? waveTurn(f, other, dt) : 0;
  f.turn = Math.max(-rate, Math.min(rate, round + wrap(want - f.yaw) * 14));
  f.yaw = wrap(f.yaw + f.turn * dt);
}

function advance(bout, f, dt, who) {
  if (f.stun > 0) f.stun = Math.max(0, f.stun - dt);
  if (!f.action) return;
  const move = MOVES[f.action.name];
  f.action.t += dt;
  // (doubled up by a blow to the body, his legs go only now: { type: 'buckle', who })
  if (f.action.name === 'dropLiver' && f.action.t >= RULES.body.late - 1e-9 && f.action.t - dt < RULES.body.late - 1e-9) bout.events.push({ type: 'buckle', who });
  // (a cross counter waiting for the jab's aim: it goes now, or, the jab gone, is let go of: CROSSING)
  if (waiting(f.action)) crossWait(bout, f, who);
  if (!f.action) return;
  if (move.punch) {
    const was = f.action.chain.phase,
      now = stepChain(f.action.chain, move, dt);
    // (a show-off's elbow comes on behind the fist after it has got there: it has missed only once the arm starts home)
    const ends = f.action.variant === 'elbow' ? was === 'hold' && now !== 'hold' : was === 'throw' && now !== 'throw';
    if (was === 'throw' && now !== 'throw') {
      f.sinceLast = 0;
      // (a flicker's hand has got there: pressed again soon enough, it goes again)
      if (move.name === 'flicker' && f.flicks) f.flicks.at = bout.t;
    }
    if (ends) {
      // (a legend's block and fire, out at the end of its reach without meeting him: the other hand's hook after it all the same)
      if (!f.action.struck) fireNext(bout, f), shellNext(bout, f);
      if (!f.action.struck) {
        // (gone over a man crouched in his shell: his opening)
        shellOpens(bout, bout.fighters[1 - who]);
        const near = f.action.near,
          e = { type: 'whiff', who, name: move.name, margin: near ? +near.gap.toFixed(4) : null };
        bout.events.push(e);
        // (and what the man who got out of its way made of it)
        const other = bout.fighters[1 - who],
          d = other.defence;
        if (d && d.kind === 'evade' && d.of === f.action.id && d.event === null) {
          // (a show-off who has made it miss may shrug at him once he is out of it: his dice)
          const p = tauntChance(other, 'evade');
          if (p && other.luck() < p) other.tauntNext = 'shrug';
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
  } else if (f.action.name === 'wave') {
    // (the wave is over once its last wave has come up and his hands are back: anim/clean.mjs)
    const a = f.animator.wave;
    if (a && a.done) (f.action = null), (f.wave = null);
  } else if (f.action.taunt && f.action.t >= move.dur - TAUNT.hop) {
    // (the last hop moving away, a show-off's taunt instead of his guard coming back)
    taunt(bout, f, who, f.action.taunt);
  } else if (f.action.t >= move.dur * (f.action.long || 1) + (f.action.name === 'dash' && f.action.level ? f.action.level.dash.extra : 0)) {
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
      meet: f.cover && f.coverAge < f.k.parry && !f.shell ? 1 - f.coverAge / f.k.parry : 0,
      // (and how long it has been up: a show-off's hammer is timed from it; a guard up for a shoulder roll is not one)
      fresh: f.cover && !f.roll ? f.coverAge : null,
      // what the fight has taken out of him, for his body to show: hurt from his health, tired from his breath
      hurt: Math.max(0, Math.min(1, (45 - f.hp) / 45)),
      tired: Math.max(0, Math.min(1, (0.6 - f.stamina / f.k.staminaMax) / 0.6)),
      cheer: bout.over === i && bout.t - bout.overAt > 0.9,
      still: !!f.down && f.action.t >= MOVES[f.action.name].dur,
      action: f.action,
      aim: null,
      // how he stands and moves when he is doing nothing else (his grade of footwork), and whether a blow has stopped him
      stance: levelOf(f.skills, 'stance'),
      // and how he covers up (the guard, the block, the parry), and the cross-arm guard he holds if he carries it
      guard: levelOf(f.skills, 'cover'),
      cross: crossOf(f),
      // (a shoulder roll he is in, and the cross-arm shape it takes on if he holds none: anim/show.mjs)
      // (and, out of it into the roll & counter, the roll let go of as the counter goes: out, seconds since it started)
      roll: f.roll || (f.action && f.action.rollOut) ? Object.assign({ shape: crossOf(f) ? null : CROSS[gradeOf(f.skills, 'rollCounter').id] || null }, f.roll ? { t: f.roll.t, roll: f.roll.roll } : { t: f.action.rollOut.t, roll: f.action.rollOut.roll, out: f.action.t }) : null,
      hook: null,
      stun: f.stun > 0,
      shoved: Math.hypot(f.kx, f.kz),
      // (leaning back on the ropes: how far he is pressed onto them, 0..1, and their way in his own terms: ropes)
      rope: f.rope || null,
      reach: null,
      // the other man, in his own terms: his lead foot's instep (what a dirty man stands on), and whether this man's own lead
      // foot is stood on (and his elbows: what the bottom of an inside uppercut's U is kept clear of, anim/animator.mjs; and
      // his shoulders, elbows and gloves: what a cross counter's rear arm goes over, anim/over.mjs)
      // (and the rest of his body that a glove can be in, as the audit reads it, src/audit.mjs SOLID, and his gloves, where they
      // will be as he is drawn this frame: a rocked man's slowed arms are kept out of them as the solver's would be,
      // anim/animator.mjs rockedArms; and, while he taunts, what of him a taunting hand is kept off: anim/animator.mjs ROOM)
      foe: f.place && other.pose && other.points ? { foot: mine(f, at(other, 'LeftFoot', [0, -0.02, 0.07])), glove: { L: mine(f, other.points.L), R: mine(f, other.points.R) }, head: mine(f, other.points.head), elbow: { L: mine(f, other.points.LE), R: mine(f, other.points.RE) }, shoulder: { L: mine(f, other.points.LS), R: mine(f, other.points.RS) }, aim: leadAim(bout, f, other), lag: i === 0 ? 1 : 0, nape: mine(f, napeOf(other)), right: dirIn(f, [-Math.cos(other.yaw), Math.sin(other.yaw)]), ...bodyOf(bout, f, other), solid: f.action && MOVES[f.action.name].taunt ? solidOf(f, other) : null } : null,
      pinned: f.pinned > 0,
      // the down parry his guard is put up for, if it is (anim/clean.mjs): how soon the glove coming in will be on his rear glove
      pat: f.pat ? patView(bout, f, other) : null,
      // the peek-a-boo shell he is in, if he is (anim/clean.mjs): his grade's, how long, and the hand of a straight punch on its way
      // at him
      // the Tyson shift he is in, if he is (anim/shift.mjs)
      shift: f.shift ? shiftView(bout, f) : null,
      shell: f.shell ? { sh: f.shell.sh, t: bout.t - f.shell.at, from: incoming(other) && incoming(other).chain.on[1] && MOVES[incoming(other).name].arm === 'straight' ? MOVES[incoming(other).name].hand : null } : null,
      // the wave he is in, if he is (anim/clean.mjs): which way round, whether it is still held, his grade's
      wave: f.wave ? { side: f.wave.side, held: f.wave.held, blocked: f.wave.blocked, level: wavesAt(f) } : null,
      // knocked down: what of the other man he cannot fall through, in his own terms
      near: f.down && f.place && other.pose ? NEAR.map(([joint, r]) => [mine(f, at(other, joint)), r]) : null
    };
  /* A punch coming at him: how soon it will get to his head at the speed it is closing, and which way it is going (his own
     terms). A great one covering up rides it, or goes out to take it early, the instant before it lands. */
  const coming = incoming(other);
  /* (a lead hook on its way: how long since it started, what a cross-arm guard's rear glove goes back to the ear by. From its
     start, the wind-up that sets the arm: its hips fire only 40 ms or so before it lands, too late for anyone to answer) */
  if (coming && MOVES[coming.name].hand === 'L' && MOVES[coming.name].arm === 'swing') view.hook = coming.t;
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
  // (and one on its way to his body: where on it, and how long since he could have seen that it was: anim/body.mjs, coverLow)
  if (coming && f.points) {
    const zone = lowOf(other, f, coming),
      t = zone ? seen(coming) : null;
    if (t !== null) view.low = { zone, t, id: coming.id };
  }
  /* (in the wave, a punch of his thrown from where it can reach him, and how soon it will be there as it is being thrown: what
     a slick back goes by, anim/clean.mjs) */
  if (view.wave && coming && Math.hypot(other.x - f.x, other.z - f.z) < MOVES[coming.name].reach + 0.6) {
    view.wave.eta = arrival(coming.chain, MOVES[coming.name]);
    // (and once it is committed, how clear of where it is going his head is: a slick back goes as far as that needs)
    if (coming.aim && other.points && f.points) {
      const hand = MOVES[coming.name].hand;
      let to = M.add(other.place.p, M.app(other.place.R, coming.aim));
      if (MOVES[coming.name].arm === 'straight') {
        const S = toWorld(other.place, other.pose.at[hand === 'L' ? 'LeftArm' : 'RightArm'], other.pose.stretch),
          d = M.sub(to, S),
          l = Math.hypot(d[0], d[1], d[2]) || 1;
        to = M.add(S, M.scale(d, (Math.min(l, LEN.upperArm + LEN.foreArm - 0.03) + 0.075) / l));
      }
      view.wave.clear = segment(f.points.head, other.points[hand], to) - RULES.glove - RULES.head;
    }
  }
  // (a cross counter: the moment the jab has gone by, what his head waits for to go on in, anim/over.mjs: CROSSING)
  if (f.action && f.action.crossing && f.action.crossing.by === undefined) crossBy(f, other);
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
    else if (move.zone && other.points.waist && Math.hypot(side, front) < 1.7 && front > 0.2) {
      // (a punch to the body: at the middle of its place on his trunk, game/trunk.mjs; committed as a punch at the head is)
      view.aim = aimFor(f, other.points, f.action.zone || move.spot || move.zone, move.arm, move.hand);
      // (and a punch that comes up into it is aimed on in, `into` metres past where it would stop at his skin: moves.mjs)
      if (move.into) view.aim[2] += move.into;
      if (f.action.chain.on[move.arm === 'swing' ? 1 : 3]) f.action.aim = view.aim;
    } else if (Math.hypot(side, front) < 1.7 && front > 0.2) {
      const from = move.hand === 'L' ? 1 : -1,
        /* a hook is an arm locked at the shoulder and swung flat by the body, at the jaw: it can be thrown a little low, but
           not at a head that has gone down under it (that is what the uppercut is for) */
        low = move.arm === 'swing' ? Math.max(h[1] - RULES.jaw, f.points.head[1] - RULES.hookDrop) : h[1];
      view.aim = move.arm === 'swing' ? [side + from * 0.05, low, front - 0.1] : move.arm === 'lift' ? [side, h[1] - 0.1, front - 0.07] : [side, h[1], front - 0.075];
      // (a show-off's elbow: the cross thrown past the side of his head, anim/show.mjs)
      if (f.action.variant === 'elbow') view.aim = [side + ELBOW.wide, h[1] + 0.16, front - 0.075];
      /* Once the joint that steers it has fired the punch is committed: it goes where the head was then, and a head that has
         moved since is missed. That is what a slip is. (Up to then he is still looking, and a punch follows a head that
         drifts.) A straight punch and an uppercut are steered by the shoulder to the last; a hook is an arm locked to a
         body that is already turning, and its path is set when the hips go. (So a hook is ducked; an uppercut finds a
         ducking head.) */
      if (f.action.chain.on[move.arm === 'swing' ? 1 : 3]) (f.action.aim = view.aim), (f.action.aimAt ??= bout.t), (f.action.aimAge ??= Math.round(f.action.chain.t / DT));
    }
  }
  return view;
}
/* the back of a man's neck, as a show-off's collar hand goes for it (anim/show.mjs: COLLAR): behind the middle of his head
   and under it; and a way on the canvas ([x, z]) in boxer f's own terms */
const napeOf = f => {
  const [ax, az] = aheadOf(f),
    h = f.points.head;
  return [h[0] - ax * COLLAR.nape[0], h[1] - COLLAR.nape[1], h[2] - az * COLLAR.nape[0]];
};
const dirIn = (f, d) => {
  const v = M.app(M.tr(f.place.R), [d[0], 0, d[1]]);
  return [v[0], 0, v[2]];
};
// (the other man's joints a glove of his can be in, standing, as the audit reads them: src/audit.mjs SOLID, but his head and gloves)
const FOE = ['Chest', 'Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftShin', 'RightShin', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
/* (those, and his gloves, in boxer f's own space, as the other man will be drawn this frame: as he was drawn, if he has been
   already this frame, and if he is yet to be, on from there as far as he went last frame; read as he was last drawn, a hook's
   shoulder coming round was 9 cm further into a slowed glove than it was read: solvePose, parts) */
const bodyOf = (bout, f, other) => {
  const b = other.parts,
    on = (p, was) => (b && b.t !== bout.t && was ? M.sub(M.scale(p, 2), was) : p),
    // (in his own space as he is about to be drawn, where he has got to this frame: solvePose, place)
    me = p => mine({ place: { R: M.ry((f.yaw * 180) / Math.PI), p: [f.x, 0, f.z] }, pose: f.pose }, p);
  if (!b) return { body: FOE.map(j => [j, me(at(other, j))]), hands: { L: me(other.points.L), R: me(other.points.R) } };
  return { body: FOE.map((j, k) => [j, me(on(b.at[k], b.was && b.was[k]))]), hands: { L: me(on(other.points.L, other.before && other.before.L)), R: me(on(other.points.R, other.before && other.before.R)) } };
};
const NEAR = [['Hips', 0.14], ['Spine2', 0.14], ['Chest', 0.15], ['LeftShin', 0.07], ['RightShin', 0.07], ['LeftLeg', 0.1], ['RightLeg', 0.1], ['LeftFoot', 0.06], ['RightFoot', 0.06]];
/* (where the other man's lead straight is sent, once its aim is set, in this man's terms: where the arm coming in will be at
   its end, what a cross counter's rear arm goes over, anim/over.mjs) */
function leadAim(bout, f, other) {
  const a = other.action,
    move = a && MOVES[a.name];
  // (set on an earlier step: the man fought second would see it the step it is set, the man fought first a step after)
  return a && a.aim && a.aimAt !== undefined && a.aimAt < bout.t - 1e-9 && other.place && move && move.hand === 'L' && move.arm === 'straight' ? mine(f, M.add(other.place.p, M.app(other.place.R, a.aim))) : null;
}
// a point on the canvas in boxer f's own space (as he was last drawn), and a point of his on the canvas (a joint, and so far on
// from it in that joint's terms)
const mine = (f, p) => {
  const d = M.app(M.tr(f.place.R), M.sub(p, f.place.p)),
    s = (f.pose && f.pose.stretch) || 1;
  return [d[0] * Math.sqrt(s), d[1] / s, d[2] * Math.sqrt(s)];
};
const at = (f, joint, by) => P.toWorld(f.place, M.add(f.pose.at[joint], by || [0, 0, 0]), f.pose.stretch);
/* The other man's head and trunk as a glove lands on them (RULES.head, trunk.mjs balls), in boxer f's own space, for a hand
   of his that is not punching to keep clear of (a show-off's taunt: anim/animator.mjs, show.mjs ROOM): [middle, how near a
   glove's middle comes to it before they touch, how far that middle moved in the last step he was drawn in, the punch he
   is throwing, if he is (its arm: 'straight', 'swing' or 'lift', or 'low' for one to the body; his head and trunk go on
   in with it, faster than they have moved yet, up behind an uppercut and down behind one to the body), and how far a dash of his has still to take it, if he is in one (dashLeft:
   a dash is on him in a tenth of a second, and where it ends is known from its start)]. Each middle is where it was last
   drawn and as far on as the two of them have gone over the canvas since (the first of them solved in a step sees the
   other a step late: a dash goes 14 cm in one). */
function solidOf(f, other) {
  const was = other.before,
    punch = incoming(other) && MOVES[incoming(other).name],
    coming = punch ? (punch.zone ? 'low' : punch.arm) : null,
    left = dashLeft(other, f),
    gone = [other.x - other.place.p[0] - (f.x - f.place.p[0]), 0, other.z - other.place.p[2] - (f.z - f.place.p[2])],
    out = [[other.points.head, RULES.head + RULES.glove, was && was.head]];
  const now = balls(other.points),
    then = was && was.hips ? balls(was) : null;
  now.forEach(([p, r], i) => out.push([p, r + RULES.glove, then && then[i][0]]));
  return out.map(([p, r, p0]) => {
    const q = mine(f, M.add(p, gone));
    return [q, r, p0 ? M.sub(mine(f, p), mine(f, p0)) : [0, 0, 0], coming, left && M.sub(mine(f, [p[0] + gone[0] + left[0], p[1], p[2] + gone[2] + left[1]]), q)];
  });
}
/* -> how far over the canvas ([x, z]) the dash boxer f is in has still to take his head and trunk, or null if he is in
   none: what is left of its reach the way it goes (travel's curve: 30 u2 (1 - u)2 comes to u3 (10 - 15 u + 6 u2) of it by
   u), and no nearer the other man than the two of them are kept apart (RULES.gap); and as far again as he is yet to be
   thrown forward over his feet (DASH_LEAN: measured, his head 18 cm and his chest 15 further ahead of his place a tenth
   of a second in than at its start, and back by its end). The duck in under a punch is a dash too, of its own length. */
const DASH_LEAN = { far: 0.16, by: 0.4 };
function dashLeft(f, other) {
  const a = f.action;
  if (!a || (a.name !== 'dash' && a.name !== 'duckIn')) return null;
  // (a duck in goes in the same way, over its own stretch and as far as it was begun for: travel)
  const duck = a.name === 'duckIn',
    u = duck ? Math.min(1, Math.max(0, (a.t - GO.inFrom - a.level.entry.seam) / GO.inTime)) : Math.min(1, a.t / (MOVES.dash.dur * 0.85)),
    reach = duck ? a.reach : f.k.dash * (0.78 + 0.22 * fatigue(f)),
    [gx, gz] = a.go,
    rx = f.x - other.x,
    rz = f.z - other.z,
    along = rx * gx + rz * gz,
    // (how far along his way he comes to that near the other man, if he does)
    inside = along * along - (rx * rx + rz * rz - RULES.gap * RULES.gap),
    until = inside > 0 && along < 0 ? Math.max(0, -along - Math.sqrt(inside)) : Infinity,
    far = Math.min(until, reach * (1 - u * u * u * (10 - 15 * u + 6 * u * u))) + (duck ? 0 : DASH_LEAN.far * Math.max(0, 1 - u / DASH_LEAN.by));
  return [gx * far, gz * far];
}
// solve boxer i for this step, and find his gloves and head on the canvas
const EDGE_SLIDE = 4; // metres a second at the most that a man down is moved in off the edge (world/edge.mjs)
function solvePose(bout, f, i, dt) {
  const pose = f.animator.update(viewOf(bout, i), dt);
  // (a man knocked down takes his place with him as he slides: anim/animator.mjs)
  if (pose.drift) {
    const d = M.app(M.ry((f.yaw * 180) / Math.PI), [pose.drift[0], 0, pose.drift[1]]);
    f.x += d[0];
    f.z += d[2];
  }
  /* (and a man down, or getting up off the canvas, is kept inside the ropes, off the posts and pads, inside the pit's walls,
     every joint of him as a ball: his place moved in under him as far as the deepest of them went past: world/edge.mjs) */
  if (f.down || (f.action && MOVES[f.action.name].floor)) {
    const lying = { R: M.ry((f.yaw * 180) / Math.PI), p: [f.x, 0, f.z] },
      joint = n => toWorld(lying, pose.at[n], pose.stretch),
      neck = joint('Neck1'),
      head = joint('Head'),
      up = M.sub(head, neck),
      // (the middle of his head as the bout keeps it, f.points.head, beyond the joint it turns on)
      skull = M.add(head, M.scale(up, 0.1 / (Math.hypot(up[0], up[1], up[2]) || 1))),
      [dx, dz] = edgePush(bout.arena, [...NAMES.map(n => [joint(n), jointR(n)]), [skull, BODY.find(([n]) => n === 'head')[1]]], false),
      // (no faster than EDGE_SLIDE: the canvas slides him in under his fall, it does not snap him back)
      most = EDGE_SLIDE * dt,
      far = Math.hypot(dx, dz),
      k = far > most ? most / far : 1;
    f.x += dx * k;
    f.z += dz * k;
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
  // (and where the joints of him a glove can be in are, and were the last time he was drawn: bodyOf)
  f.parts = { t: bout.t, at: FOE.map(at), was: f.parts ? f.parts.at : null };
  f.before = f.points;
  f.points = {
    L: beyond(at('LeftForeArm'), at('LeftHand'), 0.075), // the middle of each glove: on past the wrist
    R: beyond(at('RightForeArm'), at('RightHand'), 0.075),
    head: beyond(at('Neck1'), at('Head'), 0.1),
    // (and the elbows: a show-off's crossed forearms are in the way, and his elbow is what lands of an elbow strike)
    LE: at('LeftForeArm'),
    RE: at('RightForeArm'),
    // (and the shoulders: the lead one is in the way of a punch in a cross-arm guard or a roll, and the line between them is
    // how fast his chest is turning, docs/moves-plan-5.md §4A.4)
    LS: at('LeftArm'),
    RS: at('RightArm'),
    // (and his knees, which meet the bottom rope: world/ropes.mjs BODY)
    kneeL: at('LeftShin'),
    kneeR: at('RightShin'),
    // (and his trunk: the spine from his hips to his chest, and which way his shoulders lie: game/trunk.mjs)
    ...trunk(at)
  };
}

/* Does the glove, on its way from where it was last step to where it is now, meet a ball of radius r that has itself moved
   from c0 to c1? -> how far through the step (0..1) they first touch, or -1. (A glove that starts the step already against
   it, as one held up right up close is, meets it only if it is going on into it, by more than `least` metres this step: a
   glove resting on a face, or drawn back off one, has not hit it.) */
function meets(g0, g1, c0, c1, r, least) {
  const p = M.sub(g0, c0),
    d = M.sub(M.sub(g1, c1), p),
    dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2],
    pd = p[0] * d[0] + p[1] * d[1] + p[2] * d[2],
    pp = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
  if (pp <= r * r) return -pd / (Math.sqrt(pp) || 1e-9) > (least || 0) ? 0 : -1;
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
/* A man laid out by a blow is shoved the way the glove goes on through his head: each step for FOLLOW.time after the contact,
   his body (the fall) is given its share of the shove along the glove's way along the canvas that step (its share of the
   blow's up or down with it), and at the end the bout says where the glove went on to: { type: 'follow', who, on, follow
   (its mean velocity over that time, m/s, on the canvas) }. The blow's own vec, the way the glove was going as it met him,
   is what his head takes at once (phys/fall.mjs). */
const FOLLOW = { time: 0.08, first: 0.5 };
function follow(bout, f, who, dt) {
  /* (the way it goes is the glove's way from the step before it met him to where it is now: what it was doing as it met him
     and what it has done since, so that a straight punch at the end of its reach, whose glove has all but stopped, shoves
     him the way it came, and a hook, swinging on round, the way it swings) */
  const k = f.follow,
    other = bout.fighters[k.on],
    g = f.points[k.hand],
    v = M.sub(g, k.back),
    flat = Math.hypot(v[0], v[2]);
  k.t += dt;
  const last = k.t >= FOLLOW.time - 1e-9,
    // (most of it at once, as the blow lands, and the rest as the glove goes on through)
    share = last ? k.shove - k.given : Math.min(k.shove - k.given, k.given ? k.shove * (1 - k.first) * (dt / (FOLLOW.time - dt)) : k.shove * k.first);
  if (flat > 1e-6 && share > 0 && other.animator.shove) {
    const way = M.app(M.tr(other.place.R), [v[0] / flat, 0, v[2] / flat]);
    other.animator.shove([way[0] * share, k.up * share, way[2] * share]);
    k.given += share;
  }
  if (last) {
    const mean = M.scale(M.sub(g, k.from), 1 / k.t);
    bout.events.push({ type: 'follow', who, on: k.on, follow: mean });
    other.followed = mean;
    f.follow = null;
  }
}

/* A show-off's taunts (anim/show.mjs, docs/moves-plan-4.md §5.4): moves of their own, with no guard in them and over the
   moment he does anything. In a real bout his dice throw for one (his grade's chances, skill.mjs: stance.show.taunt): standing
   doing nothing, once every `every` half beats of his feet (one of `idle`); just after a punch has missed him (a shrug, once
   he is out of the way); just after one under `light` newton-seconds has landed (a tap of the chin, once he has got over
   it); and on the last hop moving away (one of `hop`, over the last `hop` seconds of it). A script names one ('taunt'). */
const TAUNT = { every: 16, light: 30, hop: 0.2 };
const TAUNTS = { idle: ['beckon', 'chinOut', 'wind'], hop: ['beckon', 'wind'] };
const tauntChance = (f, when) => {
  const show = f.vary && f.luck && levelOf(f.skills, 'stance').stance.show;
  return show ? show.taunt[when] : 0;
};
function taunt(bout, f, who, name) {
  const show = levelOf(f.skills, 'stance').stance.show;
  if (!show || !MOVES[name] || !MOVES[name].taunt) return;
  begin(f, name, { long: show.long, size: show.size }, bout);
  f.tauntNext = null;
  bout.events.push({ type: 'taunt', name, who });
}
// (between actions: one his dice have queued, or one standing still every so many half beats)
function idleTaunt(bout, f, who, input) {
  if (f.down || f.stun > 0 || f.action || f.cover || pressOf(input) || input.cover) return;
  if (f.tauntNext) return taunt(bout, f, who, f.tauntNext);
  const r = f.animator.rhythm,
    k = Math.floor(r.halves / TAUNT.every);
  if (f.tauntAt === undefined) f.tauntAt = k;
  if (k === f.tauntAt) return;
  f.tauntAt = k;
  const p = tauntChance(f, 'idle');
  if (p && Math.hypot(f.vx, f.vz) < 0.2 && f.luck() < p) taunt(bout, f, who, TAUNTS.idle[Math.floor(f.luck() * TAUNTS.idle.length)]);
}

/* A show-off's tricks (anim/show.mjs): which of his grade's the press can turn into now. The elbow is thrown from so far
   (centre to centre), the collar from closer than so far; a guard has to have been held so long to be pushed out of the way;
   a stomp needs the lead foot to reach his. FLICK: a flicker pressed again this soon after the last arrives goes again, so
   many in a row at most, as soon as the arm is so far back (its shoulder and elbow, 0..1 of the way out). */
const TRICK = { elbow: [0.75, 0.85], collar: 0.75, guarded: 0.2 };
const FLICK = { again: 0.25, most: 3, home: 0.25 };
function trickOf(f, other, button, name, forced) {
  const level = levelOf(f.skills, name),
    table = level.vary && level.vary[button];
  if (!table) return null;
  const d = Math.hypot(other.x - f.x, other.z - f.z),
    foot = () => f.pose && other.pose && Math.hypot(...[0, 2].map(i => at(f, 'LeftToeBase')[i] - at(other, 'LeftFoot', [0, -0.02, 0.07])[i])) < MOVES.hook.foul.reach,
    when = t =>
      t === 'flicker' || t === 'thumb'
        ? name === 'jab'
        : t === 'stomp'
          ? name === 'hook' && foot()
          : t === 'elbow'
            ? name === 'cross' && d >= TRICK.elbow[0] && d <= TRICK.elbow[1]
            : t === 'collar'
              ? (name === 'upper' || name === 'upperIn') && d < TRICK.collar
              : t === 'pawDown' || t === 'pawUp'
                ? other.cover && other.coverAge > TRICK.guarded
                : false;
  return choose(table, when, typeof forced === 'string' ? forced : null, f.vary && f.luck ? f.luck() : null);
}
// a forearm, as the bout reckons it in the way: so many balls from the elbow to the glove, each as thick as the forearm
const FOREARM = { n: 6, r: 0.045 };
/* ---- The down parry, as a blow judges it (anim/clean.mjs, docs/moves-plan-5.md §4.2): his rear glove coming down (the
   animator's patting, a guard put up for it: f.pat) on a punch his grade presses down, while his guard is as fresh as a parry's
   has to be, is the down parry's, not a glove held in the way. It presses down a glove it meets from above (the middle of his glove higher than the middle of the one coming in, as
   they meet, less `above`): the arm that threw it is held down where it was met (moves.mjs: patted), not knocked back, and the
   defender has his opening, the counter wound up in the hand that pressed it. Met any other way, by it or by the guard put up
   for it, the punch is blocked (as a hammer's: a guard put up for it turns nothing aside). */
const patNow = (other, move) => !!other.pat && other.pat.met === null && other.animator.patting && presses(other.pat.pat, move.name) && other.coverAge <= other.k.parry * (0.7 + 0.3 * fatigue(other));
const patAbove = (first, g0, g1) => M.lerp(first.c0, first.c1, first.s)[1] >= M.lerp(g0, g1, first.s)[1] - PAT.above;
function patted(bout, f, other, who, action, blow) {
  const pat = other.pat.pat,
    cover = levelOf(other.skills, 'cover');
  begin(f, 'patted', { hand: blow.hand });
  f.stun = pat.stun;
  other.pat.met = bout.t;
  other.counter = RULES.counter;
  bout.stop = 0.1;
  other.parried = { hand: 'R', at: bout.t, level: cover, down: true, pat };
  const e = Object.assign({ type: 'parry', down: true }, blow, { who: 1 - who, on: who });
  other.defence = { kind: 'parry', start: bout.t - other.coverAge, of: action.id, from: action.at, margin: null, late: other.coverAge <= cover.cover.arrive + 1 / 60 + 1e-9, counterAt: null, event: e, said: false };
  return bout.events.push(e);
}
/* A punch to the body (docs/moves-plan-5.md §3): the place on his trunk it is aimed at, named by the punch (action.zone) or
   where its aim is (game/trunk.mjs: aimed); null for a punch at his head. Coming at his body, it is met by his elbows (a ball
   `elbow` metres thick) and forearms, whatever his guard is doing: they are in the way where they are. And how long since the
   man it is coming at could have seen where it was going: from when the joint that steers it fired (the hips of an arm swung
   by the body, the shoulder of anything else), or null before. */
const ARMS = { elbow: 0.06 };
function lowOf(f, other, action) {
  if (action.zone) return action.zone;
  const aim = action.aim && f.place && other.points && other.points.waist ? aimed(other.points, M.add(f.place.p, M.app(f.place.R, action.aim))) : null;
  return aim || (!action.aim && MOVES[action.name].zone) || null;
}
/* (a punch to the body thrown from lower down shows where it is going from the moment he starts down to it: anim/body.mjs,
   shown; anything else from when the joint that steers it fired) */
function seen(action) {
  const move = MOVES[action.name],
    down = move.level ? shown(action, move) : null;
  if (down !== null) return down;
  const at = action.chain.fired[move.arm === 'swing' ? 1 : 3];
  return at >= 0 ? action.chain.t - at : null;
}
function strike(bout, f, other, who, dt) {
  // (a show-off's elbow lands as it comes on behind the fist, the arm out: anim/show.mjs)
  const action = incoming(f) || (f.action && f.action.variant === 'elbow' && !f.action.struck && f.action.chain.phase === 'hold' ? f.action : null);
  if (!action || !f.before || !other.before || other.down) return;
  const move = MOVES[action.name],
    hand = move.hand,
    // (what lands: the glove; of a show-off's elbow, the root of the forearm, a ball as thick as it: anim/show.mjs)
    elbow = action.variant === 'elbow' && f.before[hand + 'E'],
    root = (p, k) => M.lerp(p[hand + 'E'], p[hand], k),
    g0 = elbow ? root(f.before, ELBOW.root) : f.before[hand],
    g1 = elbow ? root(f.points, ELBOW.root) : f.points[hand],
    gr = elbow ? ELBOW.r : RULES.glove;
  // (how near it has come to his head so far: a punch that misses says by how much, and whether his head was only just clear)
  {
    const gap = closest(g0, g1, other.before.head, other.points.head) - gr - RULES.head;
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
      clear = segment(head, g1, to) - gr - RULES.head,
      p = progress(away),
      moved = Math.hypot(head[0] - away.head0[0], head[1] - away.head0[1], head[2] - away.head0[2]);
    if (p.k >= 0.3 || !p.going) {
      const full = moved / Math.max(p.k, 0.3),
        just = away.level.evade.just;
      away.cap = clear + (full - moved) > just && full > 1e-3 ? Math.min(1, Math.max(p.k, p.k + (just - clear) / full)) : 1;
    }
  }
  // (a wind-up is not a punch on its way: a glove drawn back or set against his face as the arm is set has not hit him)
  if (action.chain.phase === 'coil') return;
  // what is in the way: his head, and, if he is covering up, his gloves in front of it
  let first = null;
  const test = (what, key, r, c0, c1) => {
    // (a glove already against his guard is met by it however it moves: it is in the way)
    c0 = c0 || other.before[key];
    c1 = c1 || other.points[key];
    // (on his head, his trunk or an arm in the way of a punch to the body, right up close, it has to be going on into it)
    const s = meets(g0, g1, c0, c1, r, what === 'head' || what === 'trunk' || what === 'elbow' || what === 'forearm' ? RULES.touch * dt : -Infinity);
    if (s >= 0 && (!first || s < first.s)) first = { what, key, s, c0, c1 };
  };
  test('head', 'head', gr + RULES.head);
  /* (and, for a punch at his body, his trunk, the waist to the chest: game/trunk.mjs; a punch at his head goes on past it to his
     head, as it always has, an uppercut close in brushing up the front of his chest on its way) */
  const low = lowOf(f, other, action);
  if (low && other.before.waist) {
    const was = balls(other.before);
    balls(other.points).forEach(([c, r], i) => test('trunk', 'trunk', gr + r, was[i][0], c));
  }
  // (the gloves are in the way once they have got most of the way up: how quickly is his grade's)
  // (his cross-arm guard, if he carries it, and its parry: guardOf)
  const guard = guardOf(other),
    // (a rear glove coming down to press a punch down is the down parry's, below)
    patting = patNow(other, move);
  /* (crouched in his shell, his gloves are up at his cheekbones and his forearms up and down in front of him: an uppercut comes
     up between them to his chin, under the gloves. The bout reckons a glove as a ball 10.5 cm round, which at his cheekbone
     would cover his chin too, so it does not reckon them in the way of one: anim/clean.mjs, docs/moves-plan-5.md §4.5, §8) */
  const under = !!other.shell && move.arm === 'lift' && !low;
  if (other.cover && other.animator.covered >= RULES.guardUp && !under) {
    // (a fist coming down as a hammer is the hammer's, below, not a glove held in the way)
    for (const key of ['L', 'R']) if (!(key === 'R' && ((guard.hammer && other.animator.hammering) || patting))) test('guard', key, RULES.glove + gr);
    /* (a show-off's crossed arms, or the forearms up and down in front of a man in his shell: the forearms are in the way too,
       from the elbow to the glove, a capsule as thick as the forearm and the glove coming at it: anim/show.mjs, clean.mjs) */
    if ((guard.cross || other.shell) && other.before.LE && !other.animator.hammering)
      for (const key of ['L', 'R'])
        for (let i = 0; i < FOREARM.n; i++) {
          const k = i / FOREARM.n;
          test('guard', key, gr + FOREARM.r, M.lerp(other.before[key + 'E'], other.before[key], k), M.lerp(other.points[key + 'E'], other.points[key], k));
        }
  }
  // (a show-off's guard put up fresh is a hammer of his rear fist: it turns a punch aside only if it comes down on the glove)
  if (guard.hammer && other.cover && other.animator.hammering) test('hammer', 'R', RULES.glove + gr);
  if (patting) test('pat', 'R', RULES.glove + gr);
  /* (and his lead shoulder, in a cross-arm guard or a roll: rolled off it, or taken on it, shouldered; it keeps his head, and a
     punch to his body is his arms' to meet, docs/moves-plan-5.md §4A.3) */
  if (shoulderUp(other) && !low) test('shoulder', 'LS', SHOULDER.r + gr);
  // (a punch to his body: his elbows and forearms are in the way, where they are, his guard up or not)
  if (low && other.before.LE)
    for (const key of ['L', 'R']) {
      test('elbow', key + 'E', gr + ARMS.elbow);
      for (let i = 0; i < FOREARM.n; i++) {
        const k = (i + 0.5) / FOREARM.n;
        test('forearm', key, gr + FOREARM.r, M.lerp(other.before[key + 'E'], other.before[key], k), M.lerp(other.points[key + 'E'], other.points[key], k));
      }
    }
  if (!first) return;

  // ---- the blow: how fast the glove is closing on what it hit, and how much is behind it
  const at = M.lerp(g0, g1, first.s),
    centre = M.lerp(first.c0, first.c1, first.s),
    line = M.sub(centre, at),
    ll = Math.hypot(line[0], line[1], line[2]) || 1,
    n = M.scale(line, 1 / ll),
    closing = M.scale(M.sub(M.sub(g1, g0), M.sub(first.c1, first.c0)), 1 / dt),
    speed = Math.max(0, closing[0] * n[0] + closing[1] * n[1] + closing[2] * n[2]),
    mass = effectiveMass(action.chain, move, elbow ? 'elbow' : 'glove'),
    // (his power is how much of his body he gets behind it; a tired man gets less)
    J = mass * speed * (1 + RULES.bounce) * f.k.power * (0.85 + 0.15 * fatigue(f)),
    flat = Math.hypot(n[0], n[2]) || 1,
    dir = [n[0] / flat, n[2] / flat],
    // (vec: the way the glove was going as it met him, as he would see it coming: what a blow throws off him goes that way)
    cl = Math.hypot(closing[0], closing[1], closing[2]),
    vec = cl > 1e-6 ? M.scale(closing, 1 / cl) : n,
    blow = { who, on: 1 - who, name: move.name, kind: move.kind, hand, J: +J.toFixed(1), speed: +speed.toFixed(2), mass: +mass.toFixed(2), dir, vec, at: M.add(at, M.scale(n, gr)), variant: action.variant || undefined, part: elbow ? 'elbow' : 'glove' };
  action.struck = true;
  action.chain.landed = true;
  // (a legend's block and fire: the other hand's hook follows it, his grade's moment after it got there; and the body uppercut
  // after the hook out of the shell)
  fireNext(bout, f);
  shellNext(bout, f);
  action.chain.v[3] = action.chain.v[4] = 0; // the arm is stopped by what it hit
  /* (and an inside hook's body with it, the waist and the hips that swung it, on whatever it met: his head, or the glove,
     forearm or shoulder that blocked it, as the arm is. Right up close the turn is spent in what it hit, and run on round,
     the forearm goes on into the glove he holds up beside it, which nothing here stops; the waist that drives it, docs/
     moves-plan-6.md §3.3 N14, took it 8 to 10 cm into that glove when he stood a few centimetres nearer or further than the
     card has him, or moved) */
  if (move.name === 'hookIn') action.chain.v.fill(0), (action.chain.spent = true);
  // (an elbow that has landed comes away off his jaw at once: the arm starts home, it does not lean on into his head; and so
  // does a punch to the body, his trunk folding round where it was: anim/body.mjs)
  if (elbow || move.level) (action.chain.phase = 'recover'), (action.chain.since = 0);
  // (and the body turning behind a punch to the body is stopped with it, and all of it starts home at once: the fist is in him,
  // and he is folding round it)
  if (move.level) action.chain.v.fill(0), (action.chain.since = 0.06), (action.chain.back *= 1.8);
  /* (and the pull counter's rear hook comes away off his jaw as it lands, the body that swung it stopped with it: it lands
     beside the lead glove he is bringing home from his jab, and run on round it would go through that glove, which nothing
     here stops: anim/evade.mjs PULLED) */
  else if (move.name === 'hookR' && action.loaded && action.loaded.pulled) action.chain.v.fill(0), (action.chain.phase = 'recover'), (action.chain.since = 0);
  f.sinceLast = 0;
  /* (on his trunk: where, game/trunk.mjs, and the part of him the effects throw sweat off; below his hips, nothing that
     counts has happened, and the glove is stopped there) */
  const spot = first.what === 'trunk' || first.what === 'elbow' || first.what === 'forearm' ? where(other.points, blow.at) : null;
  if (first.what === 'trunk' && !spot) return;
  if (first.what === 'trunk') Object.assign(blow, { part: 'body', zone: spot.zone, trunk: spray(other.points) });
  // (a touch on the head is nothing; on the gloves it is still met, however early and slow: turned aside or smothered)
  if (J < RULES.graze && (first.what === 'head' || first.what === 'trunk')) return bout.events.push(Object.assign({ type: 'graze' }, blow));
  // the way the blow went (the glove's way as it met him), as the man who took it would say: what his body takes it by
  const [side, front] = local(other, vec[0], vec[2]),
    felt = { J, dir: [side, vec[1], front] };
  const stop = Math.max(RULES.stop[0], Math.min(RULES.stop[1], J * RULES.stop[2]));
  // (pressed down from above, by the rear glove coming down; met any other way by it, blocked)
  if (first.what === 'pat') {
    if (patAbove(first, g0, g1)) return patted(bout, f, other, who, action, blow);
    first.what = 'guard';
  }
  // (and where on his trunk, for his body to fold round it: anim/body.mjs)
  const fold = spot && { zone: spot.zone, a: spot.a, k: spot.k, high: spot.high };

  if (first.what === 'elbow' || first.what === 'forearm') {
    /* a punch to the body met by an elbow or a forearm (docs/moves-plan-5.md §3.4): smothered as a held guard smothers one,
       a quarter of the breath it would have taken, and his body giving a quarter as much, as to a blow on his guard */
    other.hp = Math.max(1, other.hp - J * RULES.damage * other.k.smother * other.k.chin);
    other.stamina = Math.max(0, other.stamina - breathOf(other, J, { zone: low }) * RULES.body.blocked);
    other.kx += ((dir[0] * J) / RULES.mass) * RULES.shove * 0.6 * RULES.body.shove;
    other.kz += ((dir[1] * J) / RULES.mass) * RULES.shove * 0.6 * RULES.body.shove;
    other.animator.strike(Object.assign({ J: J * 0.25, dir: felt.dir }, fold || { zone: low }));
    bout.stop = stop * 0.4;
    // (a hook kept off his body so: what block and fire goes off, above)
    if (move.kind === 'hook') other.elbowed = { at: bout.t, zone: low };
    // (and on the arms of his cross-arm guard, held up: its counter, above)
    if (guard.cross && guard.cross.counter && other.cover) other.crossed = { at: bout.t, part: first.what };
    return bout.events.push(Object.assign({ type: 'block' }, blow, { part: first.what, zone: low }));
  }

  if (first.what === 'hammer') {
    /* hammered down: the arm that threw it is knocked down and falls away, his head left open in front, and the defender has
       his opening (and a lead hand wound up: his rear fist is down) */
    begin(f, 'hammered', { hand });
    f.stun = 0.6;
    other.counter = RULES.counter;
    const cover = levelOf(other.skills, 'cover');
    bout.stop = 0.1;
    other.parried = { hand: 'R', at: bout.t, level: cover, hammer: true };
    const e = Object.assign({ type: 'parry', hammer: true }, blow, { who: 1 - who, on: who });
    other.defence = { kind: 'parry', start: bout.t - other.coverAge, of: action.id, from: action.at, margin: null, late: false, counterAt: null, event: e, said: false };
    return bout.events.push(e);
  }
  if (first.what === 'shoulder') return shouldered(bout, f, other, who, action, blow, J, felt, stop, dt, first.s);
  if (first.what === 'guard') {
    /* (a show-off's guard turns aside by its hammer and, a little, by its rear glove, a pro's cross-arm guard only by its
       rear glove, a guard up for a roll is the roll, and one put up to press it down turns it aside only by that: met fresh
       anywhere else, it is a block) */
    // (or, a cross-arm guard's, met on its rear glove in the freshest CROSS_PARRY of the window: guardOf, rear)
    const within = other.k.parry * (0.7 + 0.3 * fatigue(other)),
      turns = guard.parries ? other.coverAge <= within : guard.rear && first.key === 'R' && first.c0 === other.before.R && other.coverAge <= within * CROSS_PARRY;
    if (turns && !other.pat) {
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
    // (into the gloves of a man crouched in his shell: his opening)
    shellOpens(bout, other);
    // (a punch to his body on the lead glove of his cross-arm guard, across his belly: its counter, above)
    if (low && guard.cross && guard.cross.counter) other.crossed = { at: bout.t, part: 'glove' };
    // (and what of his guard it met: a glove, or a show-off's crossed forearm)
    return bout.events.push(Object.assign({ type: 'block' }, blow, { part: first.c0 === other.before[first.key] ? 'glove' : 'forearm' }));
  }
  // (a cross counter is one only while the jab's arm is still out: CROSSING)
  const counter = action.crossing ? !!action.counter && crossCounted(action, other) : !!action.counter,
    worth = J * (counter ? RULES.counterGain : 1),
    damage = worth * (spot ? RULES.body.damage : RULES.damage) * other.k.chin,
    had = other.hp,
    /* (caught as he throws: his own punch still on its way or out, and this one thrown at it, after it, a counter; a man
       who walks onto a punch already coming has not been countered) */
    caught = punching(other) && !!other.action.chain && ['coil', 'throw', 'hold'].includes(other.action.chain.phase) && other.action.at < action.at - 1e-9;
  other.hp = Math.max(0, other.hp - damage);
  // (a cross counter hit once its elbow is that far straight goes on, if the plan's §0.3 (4) is answered with a trade: CROSSING)
  if (!(CROSSING.through > 0 && !!other.action && !!other.action.crossing && !!other.action.chain && other.action.chain.q[4] >= CROSSING.through)) other.action = null;
  // (hit in the middle of the Tyson shift: it is over, and his feet are put back under him, anim/shift.mjs)
  other.shift = null;
  other.cover = false;
  other.want = null;
  other.counter = 0;
  other.stun = (RULES.stun[0] + worth * RULES.stun[1]) * other.k.stunTaken * (spot ? RULES.body.stun : 1);
  /* A dirty boxer does not let a man he has hit get away: he goes in after him (skill.mjs: dirty); from right up close he is
     in already, and does not walk into him. */
  const dirty = (action.level && action.level.form.dirty) || 0,
    // (and so does a legend after his block and fire, his other hand's hook to follow, and a man who hooks out of his shell, his
    // body uppercut to follow: anim/clean.mjs)
    chase = !!(action.loaded && action.loaded.fired && action.loaded.fired.fire.follow !== null),
    // (but not a show-off with the other man's neck in his lead hand, sat back against it: anim/show.mjs COLLAR)
    after = move.close >= RULES.inside && !action.collared ? (dirty || chase ? 0.75 : action.shellOut ? action.shellOut.chase : 0) : 0,
    // (and a man whose foot is stood on can hardly be moved off it)
    push = (worth / RULES.mass) * RULES.shove * (other.pinned > 0 ? 0.3 : 1) * (spot ? RULES.body.shove : 1);
  other.kx += dir[0] * push;
  other.kz += dir[1] * push;
  f.kx += dir[0] * push * after;
  f.kz += dir[1] * push * after;
  other.sinceHit = 0;
  other.animator.strike(Object.assign({ J: Math.min(worth, 110), dir: felt.dir, stun: other.stun, hp: other.hp }, fold && Object.assign(fold, { low: guard.low })));
  // (a show-off hit lightly may tap his chin at him once he has got over it: his dice)
  if (worth < TAUNT.light && other.hp > 0) {
    const p = tauntChance(other, 'hit');
    if (p && other.luck() < p) other.tauntNext = 'tapChin';
  }
  bout.stop = Math.min(RULES.stop[1], stop * (counter ? 1.5 : 1));
  // (to the body: his breath, and on the liver, his legs, a moment late)
  const winded = spot ? breathOf(other, worth, spot) : 0,
    // (a man who only stands there and takes it, a rung's or a card's target, f.stands: src/ladder.mjs, src/bodyshots.mjs)
    liver = !!spot && spot.zone === 'liver' && !other.stands && livered(bout, other, worth);
  if (spot) other.stamina = Math.max(0, other.stamina - winded);
  const down = other.hp <= 0 || liver,
    /* (out cold: a finishing blow with RULES.out of health or more to spare, or one that caught him throwing; stiff as a log
       from a jab or a cross, a log with his neck wrenched round from a hook, lifted and let go of slowly from an uppercut:
       docs/moves-plan-5.md §1; never from a blow to the body) */
    out = down && !spot && (damage - had >= RULES.out || caught) ? { straight: 'outStiff', hook: 'outTwist', upper: 'outLift' }[move.kind] || 'out' : null;
  bout.events.push(Object.assign({ type: 'hit', damage: +damage.toFixed(1), counter, down }, blow, spot ? { breath: +(winded / other.k.staminaMax).toFixed(3), liver: liver || undefined } : null, out ? { out } : null));
  /* (and the roll & counter's rear hook comes away off his jaw as it lands, the body that swung it stopped with it, unless it
     puts him down: run on round, it goes through the lead glove he holds up beside his jaw, which nothing here stops; as the
     pull counter's, above) */
  if (!down && move.name === 'hookR' && action.loaded && action.loaded.rolled) action.chain.v.fill(0), (action.chain.phase = 'recover'), (action.chain.since = 0);
  if (down && spot) return doubled(bout, other, who);
  if (down) {
    /* How he goes: a blow that only just finished him puts him down on a knee; one with plenty to spare lays him out, a
       body falling the way the blow went and the way he was going (phys/fall.mjs: it is handed the blow, the way the glove
       was going as it met him, and the shove that goes with it, the same way, up or down as well as along the canvas; on
       top of what was still pushing him and all he was moving at, his walking and his stepping in. These are his body's
       now, not his place's to carry). Out cold, he is laid out the same way, and his body let go of as an unconscious
       man's is (outStiff, outTwist, outLift: phys/fall.mjs), and he does not get up. */
    const knee = !out && damage - had < RULES.drop;
    let laid = null;
    if (!knee) {
      const way = M.app(M.tr(other.place.R), vec), // (in his own terms)
        [x, z] = local(other, other.kx - dir[0] * push + other.vx + other.ix, other.kz - dir[1] * push + other.vz + other.iz);
      /* (the shove itself is not given here: a head with nothing holding it up does not stop the glove, which carries on
         through, and he is shoved the way it carries on, over the first FOLLOW.time of the fall: follow, below) */
      // (a straight punch is at the end of its reach as it lands, and its glove's way on through is its way in: shoved that
      // way at once, as the fall starts; a hook swings on round, and shoves him the way it swings)
      const swung = move.arm === 'swing';
      laid = { J: worth, dir: way, at: mine(other, blow.at), push: swung ? [x, 0, z] : [x + way[0] * push, way[1] * push, z + way[2] * push] };
      other.vx = other.vz = other.ix = other.iz = 0;
      action.chain.landed = false;
      f.follow = { on: 1 - who, hand, from: f.points[hand].slice(), back: f.before[hand].slice(), t: 0, shove: swung ? push : 0, up: way[1], given: 0, first: FOLLOW.first };
    }
    begin(other, out || (knee ? 'drop' : move.kind === 'hook' ? 'slump' : 'ko'), knee ? {} : { blow: laid });
    // (laid out, the shove is his body's now; dropped to a knee, he sags where he stands, his feet under him)
    other.kx = other.kz = 0;
    other.down = 1;
    other.stun = 0;
    other.downs = (other.downs || 0) + 1;
    // in a match the referee counts him; in a bare bout he is out
    if (!bout.knockdowns) (bout.over = who), (bout.overAt = bout.t);
  }
}

/* A blow to the body (docs/moves-plan-5.md §3.2, §3.5): the breath it takes out of him, by where it landed (game/trunk.mjs:
   ZONES, the top of his chest half as much again); whether it is one too many on his liver (hard enough at once, or enough
   of them lately); and down on a knee from it: doubled over a moment late (moves.mjs: dropLiver), his breath cut, and a
   knockdown he gets up from (match.mjs) whatever health he has left. */
const breathOf = (f, J, at) => f.k.staminaMax * RULES.body.breath * (J / RULES.body.ref) * (ZONES[at.zone] || ZONES.body).breath * (at.high ? ZONES.body.high : 1);
function livered(bout, f, J) {
  const B = RULES.body;
  f.livers = (f.livers || []).filter(l => bout.t - l.at <= B.within + 1e-9).concat([{ at: bout.t, J }]);
  return J >= B.liver - 1e-9 || f.livers.reduce((s, l) => s + l.J, 0) > B.heap;
}
function doubled(bout, f, who) {
  // (on his feet a moment longer, but his feet are done with: he sags where he stands, as a man dropped to a knee does)
  begin(f, 'dropLiver', {});
  f.kx = f.kz = 0;
  f.down = 1;
  f.stun = 0;
  f.downs = (f.downs || 0) + 1;
  f.stamina = Math.min(f.stamina, RULES.body.spent * f.k.staminaMax);
  if (!bout.knockdowns) (bout.over = who), (bout.overAt = bout.t);
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
  if (!move || !move.punch || !move.foul || !tier || action.variant !== move.foul.name || action.fouled || other.down || !f.before || !other.before) return;
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

/* A show-off's lead hand on the other man's lead glove (anim/show.mjs: paw): when it meets it, the glove is pushed down (or
   up) out of the way, held there and let go (his body's: animator.pawed). Only once a punch, and only if it gets there. */
function paws(bout, f, other, who) {
  const action = f.action,
    v = action && action.variant;
  if ((v !== 'pawDown' && v !== 'pawUp') || action.pawed || other.down || !other.points || action.t > PAW.reach + PAW.hold) return;
  const hand = PAW.glove[v];
  if (Math.hypot(...M.sub(f.points.L, other.points[hand])) > RULES.glove * 2 + 0.01) return;
  const tier = Math.max(0, (action.level.form.dirty || 1) - 1),
    d = PAW.press[tier];
  // (in his own terms as the pushing man would see it: across to his left, up)
  action.pawed = { at: bout.t, push: [(hand === 'L' ? -1 : 1) * d * PAW.aside, (v === 'pawDown' ? -1 : 1) * d] };
  other.animator.pawed && other.animator.pawed({ hand, dy: (v === 'pawDown' ? -1 : 1) * d, dx: (hand === 'L' ? 1 : -1) * d * PAW.aside, hold: PAW.hold, free: PAW.free });
  // (and the other glove of a tight guard, against the one pushed, goes with it)
  const o = hand === 'L' ? 'R' : 'L';
  if (Math.hypot(...M.sub(other.points.L, other.points.R)) < RULES.glove * 2 + 0.03) other.animator.pawed({ hand: o, dy: (v === 'pawDown' ? -1 : 1) * d, dx: (o === 'L' ? 1 : -1) * d * PAW.aside, hold: PAW.hold, free: PAW.free });
  bout.events.push({ type: 'paw', name: v, who, on: 1 - who, t: +action.t.toFixed(3) });
}

/* A show-off's lead hand behind the other man's neck (anim/show.mjs: collar): when it gets there, it pulls his head forward
   and down into the uppercut (his body's: animator.pulled) until the uppercut gets there, and then no longer hauls on it (the
   blow has his head; the hand comes off a moment later). Only if it gets there. */
function collars(bout, f, other, who) {
  const action = f.action;
  if (action && action.variant === 'collar' && action.collared && !action.collared.done && action.chain && action.chain.thrownAt >= 0) {
    action.collared.done = true;
    other.animator.pulled && other.animator.pulled({ go: true, free: COLLAR.free });
  }
  if (!action || action.variant !== 'collar' || action.collared || other.down || !other.points || action.t > COLLAR.reach * 2.5) return;
  if (Math.hypot(...M.sub(f.points.L, napeOf(other))) > RULES.glove + 0.04) return;
  action.collared = { at: bout.t, t: action.t };
  const to = [f.x - other.x, f.z - other.z],
    // (toward the man pulling him, in his own terms)
    [x, z] = local(other, to[0], to[1]),
    l = Math.hypot(x, z) || 1,
    // (as hard as the puller's grade hauls: [4암, 5암])
    n = Math.max(0, (((action.level && action.level.form) || {}).dirty || 1) - 1);
  other.animator.pulled && other.animator.pulled({ dir: [x / l, z / l], d: COLLAR.pull[Math.min(n, COLLAR.pull.length - 1)], time: COLLAR.time });
  bout.events.push({ type: 'collar', who, on: 1 - who, t: +action.t.toFixed(3) });
}

/* The ropes give (world/ropes.mjs). Where his body is pressed into them (as he was last solved), they push him back in,
   ROPE.k metres a second for every metre, and a knockback carrying him into them is turned round, ROPE.bounce of it: soft,
   where the canvas's edge alone (the pit's, or the ring's before) is a wall he is run up against. And a man at them, his back
   toward them, leans back on them as far as he is pressed onto them (f.rope, for the animator: anim/animator.mjs): by his
   own walking into them (lying back on them), a blow carrying him into them, the other man up against him from the inside,
   or no more than his body against them. Not a man down, nor one getting up off the canvas. */
function ropes(f, other, dt) {
  f.rope = null;
  if (f.down || !f.points || (f.action && MOVES[f.action.name].floor)) return;
  const press = ropesPressed(f.points);
  SIDES.forEach(([axis, s], side) => {
    const key = axis ? 'z' : 'x',
      knock = axis ? 'kz' : 'kx';
    if (press[side] > 0) {
      f[key] -= s * ROPE.k * press[side] * dt;
      if (s * f[knock] > 0) f[knock] *= -ROPE.bounce;
    }
  });
  f.rope = leanOf(f, other, press, 1);
  /* (and where the ropes cannot give, near a corner where they are tied, and at the corner pads: his body kept off them, as it
     was last solved and carried on as far as he has gone since: world/edge.mjs) */
  const since = [f.x - f.px, f.z - f.pz],
    [dx, dz] = edgePush('ring', BODY.map(([n, r]) => [f.points[n] && [f.points[n][0] + since[0], f.points[n][1], f.points[n][2] + since[1]], r]), true, ROPE.drawn.most);
  f.x += dx;
  f.z += dz;
  f.x = Math.max(-RULES.half, Math.min(RULES.half, f.x));
  f.z = Math.max(-RULES.half, Math.min(RULES.half, f.z));
}

/* (how far he leans back on what is behind him at the edge, 0..1, `scale` of it, and the way to it in his own terms:
   { press, way } or null. His centre within ROPE.lean.near of where he must stop, his back toward it, and something putting
   him onto it: the ropes pressed (press, per side: the ring's), his own walking, a blow carrying him there, or the other man
   up against him from the inside) */
function leanOf(f, other, press, scale) {
  const L = ROPE.lean;
  let best = null;
  SIDES.forEach(([axis, s], side) => {
    const key = axis ? 'z' : 'x',
      knock = axis ? 'kz' : 'kx',
      walk = axis ? 'vz' : 'vx',
      near = smooth((s * f[key] - (RULES.half - L.near)) / L.near);
    if (near <= 0) return;
    // (the way to the edge, in his own terms: [to his left, ahead of him]; how much of it is behind him)
    const way = local(f, axis ? 0 : s, axis ? s : 0),
      back = smooth((-way[1] - 0.2) / 0.6),
      inside = s * (f[key] - other[key]) > 0.25 && Math.hypot(f.x - other.x, f.z - other.z) < RULES.gap + 0.05,
      drive = Math.max((press ? press[side] : 0) / 0.1, (s * f[walk]) / 1, (s * f[knock]) / 0.6, inside ? 0.8 : 0),
      k = near * back * Math.max(0, Math.min(1, drive)) * scale;
    if (k > 0 && (!best || k > best.press)) best = { press: k, way };
  });
  return best;
}
/* The pit's walls and drums give nothing (the user, 2026-11-28, card pit-lean: add): a man at them with his back to them
   leans back toward them as he would onto the ropes, ROPE.lean.pit of it, and nothing pushes him off them */
function walls(f, other) {
  f.rope = null;
  if (f.down || !f.points || (f.action && MOVES[f.action.name].floor)) return;
  f.rope = leanOf(f, other, null, ROPE.lean.pit);
}

/* Up off the canvas, where he lies (his place turned and moved under him: anim/animator.mjs getUp), the way that fits how
   he lies; or, off a knee, the way up off a knee. A man out cold does not get up: nothing is done, -> null. */
export function getUp(bout, f) {
  if (f.down && f.action && MOVES[f.action.name].faint) return null;
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
  if (bout.stop > 0) {
    // the moment of a blow is held; presses made in it are kept
    bout.stop -= dt;
    bout.fighters.forEach((f, i) => {
      const input = inputs[i] || {},
        pressed = signed(f, input, pressOf(input));
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
    if (!f.down) idleTaunt(bout, f, i, input);
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
    if (bout.arena === 'ring') ropes(f, f === a ? b : a, dt);
    else walls(f, f === a ? b : a);
    // how fast the canvas really went past under him this step, ropes and the other man allowed for: what his feet walk to
    f.gx = (f.x - f.px) / dt;
    f.gz = (f.z - f.pz) / dt;
  }
  // the bodies, solved; then whether a foot or a glove on its way has met anything (a foot first: a stamp is the drive of
  // the hook it goes with, and comes down before the glove gets there, or in the same frame)
  bout.fighters.forEach((f, i) => solvePose(bout, f, i, dt));
  bout.fighters.forEach((f, i) => f.follow && follow(bout, f, i, dt));
  fouls(bout, a, b, 0, dt);
  fouls(bout, b, a, 1, dt);
  paws(bout, a, b, 0);
  paws(bout, b, a, 1);
  collars(bout, a, b, 0);
  collars(bout, b, a, 1);
  strike(bout, a, b, 0, dt);
  if (bout.stop <= 0) strike(bout, b, a, 1, dt);
  return bout;
}
