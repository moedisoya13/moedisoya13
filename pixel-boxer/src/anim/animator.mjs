/* One boxer's body, a frame at a time. It is told what he is doing (walking this way, a tenth of a second into a cross,
   covering up, just been hooked) and answers with a solved pose. Nothing is played back: the guard, its bounce, the step under
   it, the punch over it and the give of a body that has been hit are separate layers of numbers, summed and solved every
   frame at whatever rate the screen runs, so there are no held frames to smooth over and no joins between moves.
     const a = createAnimator(seed)
     a.update(view, dt) -> { root, rot, stretch, at: { Joint: position in his own space } }
       view: { move: [left, ahead] metres a second in his own space, turn: radians a second,
               action: { name, t, id, dir, chain (a punch's kinetic chain: see phys/chain.mjs), level } | null, cover: 0..1,
               aim: [x, y, z] where the punching wrist is to go, in his space | null,
               reach: metres between the punching glove and the head it is going for (their surfaces) | null,
               stance: his grade of footwork (skill.mjs) | null, stun: bool (stopped by a blow),
               cheer: bool, still: bool (lying on the canvas) }
     a.strike({ J, dir: [left, up, ahead] })         he has just been hit: the impulse in newton-seconds, and the way it went
     a.rhythm                                         his beat: { beat, cycle, halves, stepping, landed, lead, flourish } */
import * as M from '../rig/m3.mjs';
import { TPOSE } from '../rig/skeleton.mjs';
import { solve, LEN } from '../rig/solve.mjs';
import { LINKS, stepChain } from '../phys/chain.mjs';
import { CHANNELS, GUARD, MOVES, LEFT_BEND, sampleMove } from './moves.mjs';
import { LEVEL } from './skill.mjs';
import { H, headAt, headTo, phraseX, PHRASE, FLOURISH, CLEAN, DIRTY, dice } from './stance.mjs';

const TAU = Math.PI * 2;
/* The feet keep time. One beat is one foot coming down; a cycle is both. Standing, the boxer rocks between his feet on that
   beat (the lead foot is lifted and set down, then the rear: a pendulum), and when he travels the same beat becomes his
   steps, quickening as he goes, so he never has to find the rhythm again: he was already in it. */
const CYCLE = { rest: 0.64, travel: 0.3, fast: 0.52 }; // seconds for both feet to come down once: on the spot, at full speed, and a legend's quickened phrase
const HOP = 0.03; // metres an unweighted foot clears the canvas by, bouncing on the spot
/* The bounce itself, once for each foot that comes down: a short squash as the weight lands (the legs take it like springs),
   the push back off it, and a float before the next. The squash and the float meet at the same speed, so it rebounds
   rather than bobs. Heights in metres at full liveliness. */
const BOUNCE = { contact: 0.38, float: 0.016 };
// rocked: seconds it takes to wear off (to a third), and how quickly it comes on
const WOBBLE = { last: 0.95, onset: 0.1 };
BOUNCE.squash = (4 * BOUNCE.float * BOUNCE.contact) / ((1 - BOUNCE.contact) * Math.PI); // the depth that meets the float at the same speed
const ROCK = 0.034; // metres the weight swings forward and back between the feet, bouncing on the spot
const STRIDE = 0.42; // metres: the furthest a foot is ever put from its place in the guard
const SETTLE = 30; // how fast the difference between two moves is let go of (1/seconds): gone in about a sixth of a second
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

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
/* The trunk and the head. The eyes stay on the opponent whatever the shoulders do: of a turn of the shoulders away from the
   guard, `gaze` of it is taken back by the neck (the textbook's 0.9; a beginner's head goes round with his shoulders). */
function trunk(c, gaze) {
  const lean = GUARD.lean + c.lean,
    yaw = GUARD.yaw + c.yaw,
    twist = GUARD.twist + c.twist,
    look = -(GUARD.yaw + GUARD.twist) * 0.45 - (c.yaw + c.twist) * (gaze ?? 0.9) * 0.5 + c.hw * 0.5;
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

/* How long a punch takes to get there, as thrown by this chain (a copy of it, run on to where the arm is out and stopped):
   what a script or a brain presses early by, to have it land on a beat. */
export function arrival(chain, move) {
  const c = Object.assign({}, chain, { q: chain.q.slice(), v: chain.v.slice(), a: chain.a.slice(), push: chain.push.slice(), ready: chain.ready.slice(), handed: chain.handed.slice(), on: chain.on.slice(), fired: chain.fired.slice(), peak: chain.peak.slice(), peakAt: chain.peakAt.slice(), coil: Object.assign({}, chain.coil) });
  for (let i = 0; i < 240 && (c.phase === 'coil' || c.phase === 'throw'); i++) stepChain(c, move, 1 / 240);
  return c.t - chain.t;
}
// and how long until its hand is home and the chain at rest
function homecoming(chain, move) {
  const c = Object.assign({}, chain, { q: chain.q.slice(), v: chain.v.slice(), a: chain.a.slice(), push: chain.push.slice(), ready: chain.ready.slice(), handed: chain.handed.slice(), on: chain.on.slice(), fired: chain.fired.slice(), peak: chain.peak.slice(), peakAt: chain.peakAt.slice(), coil: Object.assign({}, chain.coil) });
  for (let i = 0; i < 360 && c.phase !== 'done'; i++) stepChain(c, move, 1 / 240);
  return c.t - chain.t;
}

export function createAnimator(seed) {
  const c = {}, // this frame's channels
    shown = {}, // last frame's, as drawn
    speed = {}, // and how fast each was changing
    carry = {}; // what is still owed to the move before: { x, v } a channel, sprung to nothing
  for (const ch of CHANNELS) (shown[ch] = 0), (speed[ch] = 0), (carry[ch] = { x: 0, v: 0 });
  const roll = dice((seed || 0) + 1); // his own dice: the fidgets, the flourishes, the lurch of a man with no beat
  let sunk = 0, // how far the hips are down for the spread of the feet
    clock = (seed || 0) * 0.37,
    // ---- the beat: how far through this half beat he is (0 a foot has just come down), and how many half beats there have been
    u = 0,
    halves = 0,
    fresh = true, // (the first frame is a foot coming down)
    stretch = 1, // this half beat's length, times half a cycle: a swung beat's long and short, a dirty man's lurch
    rate = 1, // how fast the beat runs just now: pulled and pushed to put a clean punch on it (or off it)
    stop = 0, // seconds of a dead stop left (a legend's break)
    stopped = 0, // how long it has lasted
    gather = 0, // how far he went down into the stop, let go of after it
    cycle = CYCLE.rest, // how long that cycle is taking just now, seconds
    // the half beat the lead foot came down on (followed by `ref`, gently): what an end of the head's swing is timed from
    refTo = 0,
    ref = 0,
    loose = 0, // the free swing of a man whose head keeps no beat, in turns
    gaze = 0.9,
    cover = 0,
    meet = 0, // how far out to meet a punch the gloves of a fresh guard are
    hurt = 0, // what the fight has taken out of him, as his body shows it (followed slowly: see view.hurt, view.tired)
    tired = 0,
    cheer = 0,
    doing = null,
    flourish = null, // { name, from (half beats), t, k, side }
    nextFlourish = 2.2 + 2.3 * roll(), // seconds until a man who fidgets fidgets again
    bag = [], // the flourishes still to come before any comes round again
    exit = null, // how he is coming out of the punch before: { kind, from, t, x, y, side, done }
    dropFor = null, // the punch whose start put a foot down
    dropAt = 0,
    dropHalf = -1,
    approach = null; // the punching glove closing on its target: { gap, v, a }
  // a beginner's feet, shifted about the canvas a few centimetres at a time: where each is now, and the one moving
  const fidget = { L: 0, R: 0, move: null, next: 1.8 + 1.4 * roll(), side: 'R' };
  // how far a beginner's body goes on past his feet when he stops, sprung back
  const lurch = { x: { x: 0, v: 0 }, z: { x: 0, v: 0 }, was: [0, 0] };
  // how fast the canvas is going past under each foot, followed a little late so a shove or a stop does not snatch the feet
  const under = { L: [0, 0], R: [0, 0] },
    /* The feet are on the canvas, not on the body. A planted foot stays where it was put while the body travels and turns
       over it (its place is kept in his own space and carried back as the canvas goes by); at every half beat one foot is
       chosen to step, and is brought from where it was to where it should be, leaving and landing at rest on the canvas. */
    planted = { L: GUARD.feet.L.at.slice(), R: GUARD.feet.R.at.slice() },
    swing = { side: null, from: null, last: ['L', 'R'], to: null, still: false, back: false, came: null },
    lag = { x: 0, v: 0 }, // the upper body following the bounce, a touch late: what makes the gloves and head ride it
    elbow = { L: null, R: null }, // which way each elbow was pointing from its shoulder, last frame
    // where each hand was drawn last frame and how fast it was going, and what is still owed to the move before
    hand = { L: null, R: null },
    handSpeed = { L: [0, 0, 0], R: [0, 0, 0] },
    handCarry = { L: { x: [0, 0, 0], v: [0, 0, 0] }, R: { x: [0, 0, 0], v: [0, 0, 0] } },
    steer = { L: [0, 0, 0], R: [0, 0, 0] }; // how far each hand is being carried off its punch's nominal line onto the target
  // the give of a struck body: head (nod, turn, tilt), trunk (lean, side, turn), and how far the guard is knocked open
  const give = { hp: { x: 0, v: 0 }, hw: { x: 0, v: 0 }, hr: { x: 0, v: 0 }, lean: { x: 0, v: 0 }, side: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, open: { x: 0, v: 0 }, sink: { x: 0, v: 0 } };
  // and of each glove on its own, metres (in his terms, as the hand channels are): a glove that has met a punch
  const knock = { L: [0, 1, 2].map(() => ({ x: 0, v: 0 })), R: [0, 1, 2].map(() => ({ x: 0, v: 0 })) };
  // a man rocked by a blow: how badly (0..1) and how long ago; his legs are gone for a second or so
  const wobble = { amount: 0, t: 9 };
  // the head's offset off the line of the punch, as it was last frame (what the way out of the punch starts from)
  const off = { x: 0, y: 0 };
  // what a dirty man's fouls are doing to him: a flinch at a foot stood on, a glove over an eye he has been thumbed in
  const fouled = { flinch: 9, blind: 9, long: 0.4 };

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
      /* A blow that stops him long enough rocks him (the longer, the worse, and the more he has been hurt already, the
         worse again); another before he has got over it adds to what is left. */
      if (hit.stun !== undefined) {
        const now = wobble.amount * Math.exp(-wobble.t / WOBBLE.last),
          more = clamp((hit.stun - 0.38) / 0.36, 0, 1) + clamp((45 - (hit.hp ?? 100)) / 45, 0, 1) * 0.35;
        if (more > 0.02) (wobble.amount = clamp(now + more, 0, 1)), (wobble.t = 0);
      }
    },
    /* A parry: the glove that met the punch sweeps it off the line, across his body and down, and comes back; his
       shoulders turn a little with it. (The puncher's side of it is the reel.) */
    deflect(hit) {
      const g = knock[hit.hand],
        across = hit.hand === 'R' ? 1 : -1; // the right glove pushes a punch away to his left, the left glove to his right
      g[0].v += across * 3.2;
      g[1].v -= 1.4;
      g[2].v += 0.9;
      give.yaw.v += across * 140;
      give.hw.v += across * 60;
    },
    /* A block: the punch drives the glove it hit back into his face, and the other one after it, and rocks his head and
       his trunk back, and his knees take it. */
    brace(hit) {
      const k = Math.max(0.5, Math.min(hit.J, 120) / 40); // (even a punch smothered early shoves the guard)
      for (const side of ['L', 'R']) {
        const g = knock[side],
          m = side === hit.hand ? 1 : 0.45;
        g[2].v -= 1.6 * k * m;
        g[1].v += 0.35 * k * m;
        g[0].v += (side === 'L' ? -0.4 : 0.4) * k * m; // and in toward the middle
      }
      give.hp.v -= 260 * k;
      give.lean.v -= 150 * k;
      give.sink.v += 0.5 * k;
    },
    /* A foul done to him (game/bout.mjs: fouls): stood on, he flinches and looks down at it; thumbed, his head goes back (if it
       was done in the open) and his rear glove goes to his eye a while. (A head put into his is a blow: strike. Held round
       the neck, his head is pulled down for as long as it lasts: view.pulled.) */
    foul(hit) {
      if (hit.name === 'stomp') fouled.flinch = 0;
      if (hit.name === 'thumb') {
        const move = MOVES.jab.foul;
        fouled.blind = 0;
        fouled.long = move.blind;
        give.hp.v -= move.snap[hit.tier] * 18;
      }
    },
    /* Where his feet are in their rhythm: the beat (turns), how long a cycle is taking, how many half beats there have been,
       the foot stepping now and the one that came down last, the half beats since a lead foot came down on the count his
       head keeps (fractional), how far into this half beat he is and how long it will take at the pace he is going, and
       the flourish he is in the middle of. */
    get rhythm() {
      const lengthNow = (cycle / 2) * stretch;
      return { beat: ((((halves - 1) % 2) + 2) % 2 + u) / 2, cycle, halves, stepping: swing.side, landed: swing.came, lead: halves + u - ref, u, half: lengthNow, left: stop > 0 ? stop + lengthNow * (1 - u) : (lengthNow * (1 - u)) / Math.max(0.05, rate), flourish: flourish && flourish.k > 0.5 ? flourish.name : null, stopped: stop > 0 };
    },
    update(view, dt) {
      clock += dt;
      for (const ch of CHANNELS) c[ch] = 0;
      const action = view.action,
        id = action ? action.id : null,
        punchMove = action && MOVES[action.name].punch ? MOVES[action.name] : null,
        grade = view.stance || LEVEL[3],
        st = grade.stance,
        stun = !!view.stun;

      // ---- what he is doing
      // what the punching hand does past where the chain puts it, and how much higher its elbow is (a dirty punch's)
      const extra = { L: null, R: null },
        raise = { L: 0, R: 0 };
      let form = null, // how this punch's grade holds the body (skill.mjs)
        foul = null, // and the foul a dirty one throws with it (moves.mjs)
        stomp = null, // a lead foot going onto his instep: { to, w, lift }
        butt = null, // his head going into the other man's: { to, w, most }
        grab = null; // a hand round the back of his neck: { side, to, w }
      if (punchMove) {
        // a punch: what its wind-up and each joint of its chain add, by how far each has turned (as far as he turns it)
        const move = punchMove,
          chain = action.chain,
          amp = chain.amp || [1, 1, 1, 1, 1];
        form = (action.level || LEVEL[3]).form;
        foul = form.dirty && move.foul ? move.foul : null;
        const sg = Math.sign(move.links.trunk.twist), // which way this punch turns the body
          share = Object.assign({ off: 1, bend: 1, tuck: 1, sep: 1, dip: 1 }, move.body), // how much of each this punch takes
          [d, hp, t] = [0, 1, 2].map(i => clamp(chain.q[i], 0, 1.2));
        /* (the better he is the less of the wind-up shows; what sets the arm for a hook or an uppercut is all there, and so is
           the shoulders' turn past the hips that the locked arm is swung out of. A man who turns all of a piece, with no
           stretch between his hips and his shoulders, winds up all of a piece too.) */
        // (and a beginner does not use his knees at all: what the wind-up and the chain do to his height is not done)
        const knees = form.dip > 0 ? 0 : 1;
        for (const ch in move.coil) c[ch === 'twist' && !form.sep ? 'yaw' : ch] += move.coil[ch] * chain.coil.q * (ch === 'lc' || ch === 'le' || ch === 'rc' || ch === 're' || (ch === 'twist' && move.chain.locked) ? 1 : chain.shown ?? 1) * (ch === 'hy' ? knees : 1);
        LINKS.forEach((link, i) => {
          for (const ch in move.links[link]) c[ch] += move.links[link][ch] * chain.q[i] * amp[i] * (ch === 'hy' ? knees : 1);
        });
        /* How the rest of him is held while it goes, by how good he is (skill.mjs): all of it grows with the arm, so it is
           there as the punch is and gone as it comes home. */
        const me = move.hand,
          k = me === 'L' ? 'l' : 'r',
          o = me === 'L' ? 'r' : 'l',
          s = me === 'L' ? 1 : -1,
          arm = clamp(Math.max(chain.q[3], move.arm === 'straight' ? chain.q[4] : 0), 0, 1),
          out = smooth(arm),
          // (only once it has got there: the foul is what follows the punch, not what throws it)
          reach = chain.thrownAt >= 0 ? smooth(clamp((chain.t - chain.thrownAt) / 0.05, 0, 1)) * out : 0,
          tell = form.tell * chain.coil.q;
        /* a beginner shows it coming: the hand drawn back (and a little out, or in his upright stance it is drawn back onto
           its own shoulder, where an arm has nowhere left to fold), the elbow out, the shoulders turned away, the chin up */
        c[k + 'z'] -= 0.075 * tell;
        c[k + 'x'] += s * 0.02 * tell;
        c[k + 'y'] -= 0.035 * tell;
        c[k + 'e'] += 0.45 * tell;
        c.yaw -= s * 7 * tell;
        c.hp -= 5 * tell;
        // the other hand: dropped and out to the side, or kept tight to the chin
        if (form.guard > 0) (c[o + 'y'] -= 0.17 * form.guard * out), (c[o + 'z'] -= 0.06 * form.guard * out), (c[o + 'x'] -= s * 0.05 * form.guard * out);
        else if (form.guard < 0) (c[o + 'y'] += 0.02 * -form.guard * out), (c[o + 'z'] -= 0.025 * -form.guard * out), (c[o + 'x'] += s * 0.015 * -form.guard * out);
        c.hp -= 11 * form.chin * out; // the chin up and out after it (tucked, the better he is)
        c.lean += 9 * form.over * out; // and the weight thrown in after it, over the front foot
        c.hz += 0.05 * form.over * out;
        /* The stretch across the trunk: as the hips go the shoulders are held back behind them, most of all halfway through
           the hips' turn, and let go as the hips finish it (the more of it a man can hold, the more the trunk has to give
           back). It is the hips' turn that pulls it, so a man whose trunk goes early holds it as long as one whose trunk
           waits; and only on the way out (by the time the hips have got there it is gone, and they come back without it). */
        const hipsQ = clamp(chain.q[1], 0, 1);
        if (chain.phase !== 'recover' && chain.phase !== 'done') c.twist -= sg * form.sep * share.sep * 4 * hipsQ * (1 - hipsQ);
        /* The punching shoulder turned in and up to the chin as the arm goes, the head tilted down onto it. */
        const tuck = smooth(clamp(move.arm === 'straight' ? chain.q[4] : chain.q[3], 0, 1)) * form.tuck * share.tuck;
        c.twist += sg * tuck;
        c.hr += s * tuck;
        // a hook or an uppercut thrown with a bend to the side the weight goes to
        if (move.arm !== 'straight') {
          const bend = sg * form.bend * share.bend * clamp(t, 0, 1);
          if (bend > 0) (c.side += bend * (1 + LEFT_BEND.side)), (c.lean += bend * LEFT_BEND.lean);
          else c.side += bend;
        }
        /* Down into the knees as the hips fire, on a raised cosine about that moment (from the start of the action, by the
           time it takes to get there: a wind-up and the hips' own start), and up out of them as the trunk and shoulder go,
           which a punch aimed up under the head (a hook, an uppercut) is lifted by (a jab, half as deep; an uppercut, which
           comes up out of the knees, half as deep again). A beginner does the opposite: he stands up as his arm goes out. */
        const depth = form.dip * share.dip;
        if (form.dip > 0) c.hy += depth * out;
        else {
          const at = chain.coilTime / (chain.quick || 1) + 0.03 + form.late,
            half = Math.max(0.05, at),
            from = Math.abs(action.t - at);
          if (from < half) c.hy += (depth * (1 + Math.cos((Math.PI * from) / half))) / 2;
        }
        if (form.drop) c.st += 0.015 * smooth(clamp(t, 0, 1)) * (1 - 0.5 * smooth(clamp(chain.q[3], 0, 1)));
        /* The head off the line of the punch: a rear hand's to the lead foot's side, a lead hand's to the rear foot's, by
           the time the glove lands. What takes it there is the grade: the trunk turning, or the hips (before the glove has
           left the guard), or the legs and the wind-up, first of all. A jab takes it less far; a hook takes it down as well,
           the weight going back onto the rear foot; an uppercut's comes up with the fist. On the way back, a boxer who moves
           his head after punching hands it over to the way out (exit, below). */
        const side = me === 'R' ? 1 : -1,
          by = form.with === 'legs' ? Math.max(chain.coil.q, d) : form.with === 'hips' ? hp : t,
          gone = smooth(clamp(by, 0, 1)) * form.off * share.off,
          ox = side * gone,
          oy = move.arm === 'swing' ? -0.35 * Math.abs(gone) : move.arm === 'lift' ? -0.3 * Math.abs(gone) * (1 - out) : 0;
        // (the way out of it starts as the hand starts home, and a head that moves on after punching is the way out's from then)
        // (a man who loses his balance after it, or stands flat, does so as soon as it has got there)
        const comingOut = chain.phase === 'recover' || ((form.exit === 'stumble' || form.exit === 'flat') && chain.phase === 'hold'),
          // (a legend who has put his head into a man after a cross says sorry for it, and that is his way out)
          way = foul && foul.name === 'butt' && foul.sorry[form.dirty - 1] ? 'sorry' : form.exit;
        if (comingOut && (!exit || exit.id !== id) && way) exit = { kind: way, id, from: halves + u, t: 0, x: off.x, y: off.y, side: off.x >= 0 ? -1 : 1, done: null };
        if (foul && foul.name === 'butt') off.x = off.y = 0;
        else if (!(chain.phase === 'recover' && (form.exit === 'roll' || form.exit === 'angle'))) {
          headTo(c, ox, oy);
          off.x = ox;
          off.y = oy;
        }
        /* Dirty: the punch's foul (moves.mjs: foul), blatant (a great dirty fighter's) or passed off (a legend's). Whether it
           lands is the bout's to judge (game/bout.mjs: fouls); this is the body that does it. */
        if (foul) {
          const n = form.dirty - 1;
          if (foul.name === 'thumb') extra[me] = M.add(extra[me] || [0, 0, 0], [0, -0.01, foul.push[n] * reach]); // pushed on into his face
          else if (foul.name === 'butt') {
            /* the head kept on the line of the punch, the crown tipped forward and down into it from the moment the shoulder
               goes (bowed from the neck and the trunk, so the shoulder is not crowded onto the punch), and then the lunge
               after the fist, from the hips, level with his head: that is what meets him */
            const w = smooth(clamp(chain.q[3], 0, 1)) * (chain.phase === 'recover' ? 1 - smooth(chain.since / 0.2) : 1),
              [ahead, down] = foul.head[n],
              go = reach * (chain.phase === 'recover' ? 1 - smooth(chain.since / 0.2) : 1);
            c.hp += 60 * ahead * w;
            c.lean += 30 * ahead * w + 12 * go;
            c.hy -= 0.3 * down * w;
            // (the lunge itself is aimed at his head, wherever the punch has knocked it, once he knows where his own is: solve)
            if (view.foe && go > 0) butt = { to: view.foe.head, w: go, most: foul.on[n] };
            if (!foul.sorry[n]) raise[o.toUpperCase()] += 0.6 * reach; // (and the forearm across, shoving)
          } else if (foul.name === 'stomp' && view.foe) {
            // the lead foot over his in the wind-up and down on it with the drive, if it will reach
            const to = view.foe.foot,
              from = planted.L,
              far = Math.hypot(to[0] - from[0], to[2] - from[2]);
            if (far < foul.reach) {
              const on = smooth(clamp(chain.coil.q * 1.2 + chain.q[0], 0, 1)),
                off = foul.off[n] === null ? (chain.phase === 'recover' ? smooth(chain.since / 0.25) : 0) : chain.thrownAt >= 0 ? smooth((chain.t - chain.thrownAt - foul.off[n]) / 0.1) : 0;
              stomp = { to: to.slice(), w: on * (1 - off), lift: foul.lift[n] * Math.sin(Math.PI * clamp(chain.coil.q * (1 - clamp(chain.q[0], 0, 1)), 0, 1)) };
              c.hp += foul.look[n] * chain.coil.q * (1 - chain.q[0]);
              c.hy -= foul.sink * smooth(clamp(chain.q[0], 0, 1)) * (1 - off);
            }
          } else if (foul.name === 'hold' && view.foe) {
            // the lead hand round the back of his neck in the wind-up, held there while the uppercut goes, and let go
            const w = chain.phase === 'coil' ? smooth(chain.coil.q) : chain.phase === 'recover' ? 1 - smooth(chain.since / 0.15) : 1,
              h = view.foe.head;
            grab = { side: o.toUpperCase(), to: [h[0] - s * 0.04, h[1] - 0.12, h[2] + 0.06], w };
            raise[me] += foul.elbow[n] * reach; // (a legend's elbow comes up the same way after the fist)
          }
        }
      } else if (action) {
        sampleMove(MOVES[action.name], action.t, c);
        if (MOVES[action.name].sided) {
          // to his left (+1) or his right (-1)
          const s = action.side || 1;
          for (const ch of ['side', 'hx', 'hw', 'hr', 'lx', 'rx']) c[ch] *= s;
          // (the turned stance: see LEFT_BEND)
          if (c.side > 0) (c.lean += LEFT_BEND.lean * c.side), (c.side += LEFT_BEND.side * c.side);
        }
        if (action.name === 'dash' && action.dir) {
          const a = -c.hy / 0.075; // the dash's own rise and fall, as 0..1
          c.side += a * 13 * action.dir[0];
          c.lean += a * 8 * action.dir[1];
          c.hw += a * 8 * action.dir[0];
        }
      }
      // (any action but the punch he is coming out of puts an end to the way out of it)
      if (exit && action && action.id !== exit.id) exit = null;
      cover += (clamp(view.cover || 0, 0, 1) - cover) * (1 - Math.exp(-dt * 22));
      meet += (clamp(view.meet || 0, 0, 1) - meet) * (1 - Math.exp(-dt * 30));
      hurt += (clamp(view.hurt || 0, 0, 1) - hurt) * (1 - Math.exp(-dt * 1.5));
      tired += (clamp(view.tired || 0, 0, 1) - tired) * (1 - Math.exp(-dt * 1.5));
      cheer += ((view.cheer ? 1 : 0) - cheer) * (1 - Math.exp(-dt * 5));
      gaze += ((form ? form.look : st.look) - gaze) * (1 - Math.exp(-dt * 20));
      if (cover > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.cover, 1, {}))) c[ch] += v * cover;
      if (cheer > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.cheer, 1, {}))) c[ch] += v * smooth(cheer);
      if (meet > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.meet, 1, {}))) c[ch] += v * meet;
      const floored = !!(action && MOVES[action.name].floor),
        rocked = floored ? 0 : wobble.amount * Math.exp(-(wobble.t + dt) / WOBBLE.last) * smooth(clamp((wobble.t + dt) / WOBBLE.onset, 0, 1)),
        // what is left of his rhythm: a rocked man's and a spent man's grade comes apart
        intact = (1 - 0.7 * rocked) * (1 - 0.5 * tired);

      // ---- the beat of his feet: how fast the canvas is passing under each, and so how quick the rhythm is
      const [vx, vz] = view.move || [0, 0],
        turn = view.turn || 0,
        feet = {};
      let fastest = 0;
      {
        const follow = 1 - Math.exp(-dt * 16);
        for (const side of ['L', 'R']) {
          const g = GUARD.feet[side],
            uu = under[side];
          // the ground speed of this foot's place under the body, walking and turning together, followed a little late
          uu[0] += (vx + turn * g.at[2] - uu[0]) * follow;
          uu[1] += (vz - turn * g.at[0] - uu[1]) * follow;
          fastest = Math.max(fastest, Math.hypot(uu[0], uu[1]));
          feet[side] = { g, fx: uu[0], fz: uu[1] };
        }
      }
      const going = clamp(fastest / 1.5, 0, 1), // 0 bouncing on the spot .. 1 travelling
        speedNow = Math.hypot(vx, vz),
        // free to fidget: doing nothing, not covering up, not going anywhere, not stopped or rocked or spent
        idle = !action && !view.still && cover < 0.05 && speedNow < 0.4 && !stun && rocked < 0.05 && hurt < 0.5 && tired < 0.6 && !exit,
        // where in his phrase he is (a legend's), in half beats from a lead foot
        P = ((((halves + u - ref) % PHRASE.length) + PHRASE.length) % PHRASE.length),
        quick = st.tempo === 'phrase' && P >= PHRASE.fast[0] && P < PHRASE.fast[1] ? CYCLE.fast / CYCLE.rest : 1;
      cycle += (CYCLE.rest * quick + (CYCLE.travel * st.travel.cycle - CYCLE.rest * quick) * going - cycle) * (1 - Math.exp(-dt * 10)); // (quick enough to keep up, slow enough not to snap the bounce)
      /* Setting off: the foot on the side he is going should move first. If the other one was already up, hopping in place,
         it is only set back down under him in its place (it takes no step of its own), and the right foot steps first. */
      const mid = [(GUARD.feet.L.at[0] + GUARD.feet.R.at[0]) / 2, (GUARD.feet.L.at[2] + GUARD.feet.R.at[2]) / 2],
        leads = side => {
          const g = GUARD.feet[side].at,
            out = [g[0] - mid[0], g[2] - mid[1]];
          return speedNow > 0.25 ? (vx * out[0] + vz * out[1]) / (speedNow * Math.hypot(out[0], out[1])) : 0;
        };
      if (swing.side && swing.still && leads(swing.side) < -0.3) swing.back = true;

      /* A clean boxer's beat is pulled or held back a little to put his punch on it: the contact on a foot coming down (on
         the beat), or halfway between two (off it); and, on the beat, the hand home again on the next. Where the glove is
         going to meet the head is judged from how fast it is closing on it, and how fast that is growing. */
      let want = 1;
      if (punchMove && form && form.beat && view.reach != null && (action.chain.phase === 'coil' || action.chain.phase === 'throw')) {
        const gap = Math.max(0, view.reach),
          was = approach && approach.id === id ? approach : null,
          v = was && dt > 0 ? (was.gap - gap) / dt : 0,
          a = was && dt > 0 ? (v - was.v) / dt : 0;
        approach = { id, gap, v, a };
        let eta = null;
        if (v > 0.4) {
          const A = Math.max(0, a) / 2,
            disc = v * v + 4 * A * gap;
          eta = A > 1e-6 ? (-v + Math.sqrt(disc)) / (2 * A) : gap / v;
        } else if (action.chain.phase === 'coil' || v <= 0.4) eta = arrival(action.chain, punchMove) * 0.85;
        if (eta !== null && eta > 0.005 && eta < 0.5) want = timing(eta, form.beat);
      } else if (punchMove && form && form.beat === 'on' && action.chain.phase === 'recover') want = timing(homecoming(action.chain, punchMove), 'on');
      else approach = null;
      function timing(eta, where) {
        // the beat points ahead (in seconds at the present pace), and the one that asks the least of the beat to arrive with it
        const len = (cycle / 2) * stretch,
          to = (1 - u) * len,
          marks = where === 'on' ? [to, to + cycle / 2] : u < 0.5 ? [(0.5 - u) * len, to + cycle / 4] : [to + cycle / 4, to + (cycle * 3) / 4];
        let best = 1,
          worst = Infinity;
        for (const m of marks) {
          const r = m / eta,
            cost = Math.abs(Math.log(r));
          if (cost < worst) (worst = cost), (best = r);
        }
        return clamp(best, 0.55, 1.8);
      }
      rate += (want - rate) * (1 - Math.exp(-dt * 25));
      // (a legend's dead stop: the beat stands still)
      if (stop > 0) {
        stop = Math.max(0, stop - dt);
        stopped += dt;
        if (!idle) stop = 0;
      }
      if (!view.still && stop <= 0) u += (dt * rate) / ((cycle / 2) * stretch);
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
      if (fresh || u >= 1) {
        // ---- a foot comes down, and the next is chosen to step
        fresh = false;
        u = Math.max(0, u - 1);
        if (u >= 1) u = 0;
        halves++;
        swing.came = swing.side;
        // (was the foot that has just come down only hopping in place, or did it go somewhere?)
        const hopped = !swing.side || (swing.still && Math.hypot(swing.to[0] - swing.from[0], swing.to[2] - swing.from[2]) < 0.1);
        if (swing.side) planted[swing.side] = swing.to.slice();
        // a lead foot coming down on an odd count puts the head's count right (gently: see ref)
        if (swing.came === 'L' && (((halves - refTo) % 2) + 2) % 2 === 1) refTo += 1;
        swing.side = swing.from = swing.to = null;
        swing.back = false;
        if (!view.still && !(action && MOVES[action.name].floor)) {
          /* The foot that steps is the one that most needs to be somewhere else; travelling, the foot on the side he is going
             steps first (a boxer never crosses his feet or brings them together); otherwise they take turns. */
          const score = side => {
            if (side === 'L' && view.pinned) return -Infinity; // (a foot stood on stays where it is)
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
        /* How long this half beat is to be: even; swung, the half that starts on the lead foot long and the other short; or,
           a man with no beat, anything up to a quarter either way, at random (and seldom near the middle: he lurches). */
        stretch = 1;
        if (st.swing !== 0.5) stretch = 2 * (swing.came === 'L' ? st.swing : 1 - st.swing);
        if (st.jitter) stretch *= 1 + (roll() < 0.5 ? -1 : 1) * st.jitter * (0.5 + 0.5 * roll());
        // a legend's phrase stops dead where it says (if he is free to), and a flourish breaks out of the stop
        const at = (((halves - ref) % PHRASE.length) + PHRASE.length) % PHRASE.length;
        if (st.tempo === 'phrase' && Math.abs(at - PHRASE.stop) < 0.5 && idle && stop <= 0 && stopped === 0) (stop = H), (stopped = 1e-9);
        else if (stopped && Math.abs(at - PHRASE.stop) >= 0.5) stopped = 0;
      }
      ref += clamp(refTo - ref, -2 * dt, 2 * dt);
      const now = (((halves - 1) % 2) + 2) % 2,
        beat = (now + u) / 2,
        hh = halves + u - ref; // half beats from a lead foot

      // ---- the bounce: down into each landing and back up off it, the weight swinging between the feet like a pendulum
      // (a tired man's feet barely leave the canvas, and a hurt man's legs are heavy; and the grade's own rhythm)
      const flat = exit && exit.kind === 'flat' ? 1 - smooth(exit.done === null ? 0 : (halves + u - exit.done - 2) / 0.5) : 0,
        lively = (view.still ? 0 : action ? (form ? form.lively * ((punchMove.body && punchMove.body.lively) ?? 1) : 0.35) : 1 + cheer * 1.6) * (1 - 0.5 * tired) * (1 - 0.3 * hurt) * st.bounce * (1 - 0.7 * rocked) * (1 - flat),
        spot = (1 - going) * lively, // how much of this is bouncing on the spot
        /* he bounces most on the spot: travelling, the beat quickens and the bounce shrinks with the square of it, so it is as
           soft a rebound at a run as standing (and at full speed he glides) */
        ride = lively * (cycle / CYCLE.rest) ** 2,
        C = BOUNCE.contact,
        sinking = u < C,
        g = sinking ? Math.sin((Math.PI * u) / C) : 0, // 0..1..0 through the squash
        s = sinking ? 0 : (u - C) / (1 - C), // 0..1 through the float
        // (a strong beat and a weak one: the landing on each foot as deep as its accent; and the float out of a change of level
        // the higher for it, a spring let go)
        accent = swing.came === 'L' ? st.accent[0] : swing.came === 'R' ? st.accent[1] : 1,
        spring8 = st.head && st.head.beat === 'locked' && st.head.level && ((hh % st.head.level.every) + st.head.level.every) % st.head.level.every >= 6 && ((hh % st.head.level.every) + st.head.level.every) % st.head.level.every < 7 ? 1.6 : 1,
        y = (sinking ? -BOUNCE.squash * g * accent : BOUNCE.float * 4 * s * (1 - s) * spring8) * ride,
        // forward while the rear foot is up, back while the lead is: through the middle at every landing
        rock = (swing.side ? (swing.side === 'L' ? -1 : 1) * Math.sin(Math.PI * u) : 0) * st.rock,
        trail = (spring(lag, y, dt, 4.2, 0.32) - y) * st.lag; // how far the upper body is behind the hips
      c.hy += y;
      // squashed into the landing and stretched off it, each starting and ending at rest (the head is a long way from the canvas)
      c.st += (sinking ? -0.011 * g * g : 0.01 * Math.sin(Math.PI * s) ** 2 * (1 - s)) * ride;
      c.lean += 1.3 * g * g * ride + 1.6 * rock * spot;
      c.hz += ROCK * rock * spot;
      c.hx += 0.007 * Math.sin(TAU * beat + 1) * ride * st.rock;
      c.hp -= 220 * trail; // the head nods with the bounce a moment after it
      c.ly += 0.9 * trail - 0.006 * rock * ride;
      c.ry += 0.9 * trail + 0.006 * rock * ride;
      c.lz += 0.012 * rock * ride;
      c.st += 0.006 * Math.sin(TAU * 0.4 * clock) * (view.still ? 0 : 1);
      const up = sinking ? 0 : 4 * s * (1 - s); // 0..1: how far off his heels the float has him
      // (a legend's dead stop: no landing, no float; he only settles into his knees, and comes up out of it into what follows)
      if (stop > 0 || gather > 0) {
        if (stop > 0) gather = clamp(stopped / H, 0, 1);
        else gather = Math.max(0, gather - dt / (0.6 * H));
        const k = stop > 0 ? (gather * (1 - 0.3 * gather)) / 0.7 : gather * gather;
        c.hy -= 0.018 * k;
        c.lean += 2 * k;
        c.st -= 0.004 * k;
      }

      /* ---- how he stands: the grade's own posture, held under everything else. (A crouch is come up out of as a punch goes:
         most of it is unwound into the punch, and wound up again as the hand comes home.) */
      const unwind = punchMove ? 1 - 0.7 * smooth(clamp(Math.max(action.chain.q[3], punchMove.arm === 'straight' ? action.chain.q[4] : 0), 0, 1)) : 1;
      c.hy += st.hips < 0 ? st.hips * unwind : st.hips;
      c.lean += st.lean > 0 ? st.lean * unwind : st.lean;
      c.yaw += st.yaw;
      c.lfz += st.gap / 2;
      c.rfz -= st.gap / 2;
      if (st.shoulder) (c.side -= st.shoulder), (c.hr += st.shoulder * 0.6);
      {
        const gd = st.guard,
          free = { L: !(punchMove && punchMove.hand === 'L'), R: !(punchMove && punchMove.hand === 'R') };
        c.ly += gd.y;
        c.ry += gd.y;
        c.lx += gd.apart / 2;
        c.rx -= gd.apart / 2;
        c.le += gd.elbow;
        c.re += gd.elbow;
        c.hp += gd.chin;
        if (free.L) (c.lx += gd.lead[0]), (c.ly += gd.lead[1]), (c.lz += gd.lead[2]);
        // (loose hands drift with his breathing and the bounce, a legend's never quite still)
        if (gd.loose) (c.ly += 0.008 * gd.loose * Math.sin(TAU * 0.7 * clock)), (c.ry += 0.008 * gd.loose * Math.sin(TAU * 0.7 * clock + 2)), (c.lz += 0.006 * gd.loose * Math.sin(TAU * 0.45 * clock + 1));
      }
      /* A beginner: his weight shifts from foot to foot in its own slow time (no beat in it), his feet are put right every few
         seconds, a few centimetres at a time, at no moment in particular, and back the next time. */
      /* (and a man who stands flat, a beginner always, an amateur for a beat after he has punched, settles from one leg to
         the other and back, sinking a little onto each as it takes him: a figure of eight, so that he is never quite still,
         and nothing of it across, where his head would go) */
      const settling = st.flourish === 'nervous' ? 1 : flat;
      if (settling > 0) {
        c.hz += 0.015 * Math.sin(TAU * 0.45 * clock) * settling * intact;
        c.hy += 0.008 * Math.sin(2 * TAU * 0.45 * clock) * settling * intact;
      }
      if (st.flourish === 'nervous') {
        c.hx += 0.0035 * Math.sin(TAU * 0.45 * clock + 1.3) * intact;
        if (fidget.move) {
          const m = fidget.move;
          m.t += dt;
          const e = smooth(m.t / 0.32);
          fidget[m.side] = m.from + (m.to - m.from) * e;
          c[m.side === 'L' ? 'lfy' : 'rfy'] += 0.008 * bump(m.t / 0.32);
          if (m.t >= 0.32) fidget.move = null;
        } else if ((fidget.next -= dt) <= 0 && idle) {
          const side = (fidget.side = fidget.side === 'L' ? 'R' : 'L'),
            from = fidget[side];
          fidget.move = { side, from, to: from ? 0 : (side === 'L' ? 1 : -1) * 0.03 * (roll() < 0.5 ? 1 : -1), t: 0 };
          fidget.next = 1.8 + 1.4 * roll();
        }
      }
      c.lfx += fidget.L;
      c.rfx += fidget.R;

      /* ---- the head, on its own: off the line and back, by his grade (skill.mjs: stance.head). Only while he is doing
         nothing else; travelling, half as far; rocked or spent, his grade comes apart. A beat-locked head is at an end on
         every lead foot and passes under in between; a legend's goes through his phrase; a dirty man's rolls low in no time
         at all. The shoulders roll the other way. */
      const comeback = exit ? (exit.kind === 'roll' || exit.kind === 'angle' ? smooth(halves + u - exit.from - 2) : 1) : 1,
        hw = action ? 0 : (1 - 0.5 * going) * intact * comeback;
      if (st.head && hw > 0) {
        const head = st.head;
        let X = 0,
          level = 0;
        if (head.beat === 'free') X = Math.sin((TAU * clock) / (head.T * H));
        else if (head.beat === 'locked') {
          X = Math.cos((Math.PI * hh) / (head.T / 2));
          if (head.level) {
            const L = ((hh % head.level.every) + head.level.every) % head.level.every;
            level = bump((L - (head.level.every - 3)) / 2);
          }
        } else if (head.beat === 'phrase') {
          X = phraseX(P);
          level = bump((P - PHRASE.level[0]) / (PHRASE.level[1] - PHRASE.level[0]));
        } else {
          // (rolling: his own time, never the same twice running)
          X = Math.sin(TAU * loose);
          if (head.level) {
            const L = (clock + (seed || 0) * 0.9) % head.level.every;
            level = bump((L - (head.level.every - 0.6)) / 0.6);
          }
        }
        const at = headAt(head, X);
        headTo(c, at.x * hw, at.y * hw);
        if (head.level) (c.hy -= head.level.depth * level * hw), (c.lean += head.level.lean * level * hw);
        if (head.beat !== 'free') c.twist += 4 * X * hw;
      }
      if (st.head && st.head.beat === 'roll') loose += (dt / (st.head.T * H)) * (1 + 0.35 * Math.sin(TAU * 0.11 * clock + (seed || 0) * 2.1));
      // a heavy, dirty man puts his lead hand out now and then to find the range
      if (st.paw && !punchMove) {
        const w = bump(((clock + 1.3) % 5.2) / 1.2) * (action ? 0 : 1);
        c.lz += st.paw * w;
        c.ly += 0.01 * w;
      }

      /* ---- flourishes (stance.mjs): a legend's out of the stop in his phrase, a dirty man's whenever he feels like it (every
         few seconds, on a foot coming down). An action starting puts an end to one at once (and what it was showing is let
         go of, as between any two moves); anything else, covering up or setting off, fades it out. */
      if (flourish) {
        flourish.t += dt;
        const p = halves + u - flourish.from,
          def = FLOURISH[flourish.name];
        if (action) flourish.k = 0;
        else if (!idle) flourish.k = Math.max(0, flourish.k - dt * 8);
        if (flourish.k > 0 && p < def.len) def.at(c, p, flourish.t, flourish.k * intact, flourish.side);
        if (flourish.k <= 0 || p >= def.len) flourish = null;
      } else if (idle) {
        const pick = list => {
          if (!bag.length) bag = list.slice().sort(() => roll() - 0.5);
          return bag.pop();
        };
        if (st.flourish === 'clean' && stopped > 0 && stop <= 0 && u < 0.2) (stopped = 0), (flourish = { name: pick(CLEAN), from: halves, t: 0, k: 1, side: roll() < 0.5 ? 1 : -1 });
        else if (st.flourish === 'dirty' && (nextFlourish -= dt) <= 0 && u < 0.12) (flourish = { name: pick(DIRTY), from: halves, t: 0, k: 1, side: 1 }), (nextFlourish = 2.2 + 2.3 * roll());
      }

      /* ---- the way out of a punch (skill.mjs: form.exit). A beginner loses his balance after it; an amateur brings it back
         the way it went and stands flat a beat before he bounces again; a great one moves his head on as he comes out,
         under and over to the other side, and a legend steps off at an angle with it and turns back in, and his head
         carries on from there. Timed in half beats from the hand starting home, and over in two or three. */
      if (exit) {
        exit.t += dt;
        if (exit.done === null && !action) exit.done = halves + u;
        const p = (halves + u - exit.from) / 2;
        if (exit.kind === 'stumble') {
          const a = exit.t < 0.25 ? smooth(exit.t / 0.25) : 1 - smooth((exit.t - 0.25) / 0.4),
            hands = exit.t < 0.35 ? smooth(exit.t / 0.35) : 1 - smooth((exit.t - 0.5) / 0.45);
          c.hz += 0.05 * a;
          c.lean += 4 * a;
          c.rfz += 0.08 * a; // the rear foot dragged in after him
          c.rfx += 0.03 * a;
          c.ly -= 0.05 * hands;
          c.ry -= 0.06 * hands;
          if (exit.t > 1) exit = null;
        } else if (exit.kind === 'sorry') {
          // the rear glove held up over the shoulder, open, a nod, and half a step back before he bounces again
          const up = exit.t < 0.15 ? smooth(exit.t / 0.15) : 1 - smooth((exit.t - 0.5) / 0.2),
            nod = bump((exit.t - 0.2) / 0.25),
            back = exit.t < 0.35 ? smooth(exit.t / 0.35) : 1 - smooth((exit.t - 0.45) / 0.3);
          c.ry += 0.34 * up;
          c.rz -= 0.12 * up;
          c.rx += 0.06 * up;
          c.re += 0.5 * up;
          c.hp += 9 * nod;
          c.hz -= 0.08 * back;
          if (exit.t > 0.8) exit = null;
        } else if (exit.kind === 'flat') {
          if (exit.done !== null && halves + u - exit.done > 2.6) exit = null;
        } else if (exit.kind === 'roll' || exit.kind === 'angle') {
          const e = smooth(p),
            handing = 1 - smooth((p - 1) * 2), // (handed over to the head's own movement over the half beat after)
            x = exit.x * (1 - 1.6 * e),
            y = exit.y * (1 - e) - 0.04 * bump(p);
          headTo(c, x * handing, y * handing);
          if (exit.kind === 'angle') {
            const w = (p < 1 ? smooth(p * 1.5) : 1 - smooth((p - 1) * 2)),
              lift = bump(p * 1.5) + bump((p - 1) * 2);
            c.hx += 0.05 * exit.side * w;
            c.lfx += 0.05 * exit.side * w;
            c.rfx += 0.05 * exit.side * w;
            c.lfy += 0.02 * lift;
            c.rfy += 0.02 * lift;
            c.yaw -= 8 * exit.side * w;
          }
          if (p >= 1.5 && !action) exit = null;
        } else exit = null;
      }

      /* ---- travelling, by his grade: a beginner leans his body into it ahead of his feet and goes on past when he stops;
         an amateur's steps each nearly come to a stop before the next. */
      if (st.travel.lean && speedNow > 0.05) {
        const k = clamp(speedNow / 1.5, 0, 1) * st.travel.lean;
        c.lean += (k * vz) / speedNow;
        const across = (k * vx) / speedNow;
        if (across > 0) (c.side += across * (1 + LEFT_BEND.side)), (c.lean += across * LEFT_BEND.lean);
        else c.side += across;
      }
      if (st.travel.lurch) {
        const ax = dt > 0 ? (vx - lurch.was[0]) / dt : 0,
          az = dt > 0 ? (vz - lurch.was[1]) / dt : 0;
        lurch.was = [vx, vz];
        // (a spring hung from his hips, shaken by how hard he slows: only slowing, which is what carries a body on past)
        const pushX = vx * ax < 0 ? -ax : 0,
          pushZ = vz * az < 0 ? -az : 0,
          W = TAU * 2.2;
        lurch.x.v += (pushX * 0.9 - W * W * lurch.x.x - 2 * 0.55 * W * lurch.x.v) * dt;
        lurch.z.v += (pushZ * 0.9 - W * W * lurch.z.x - 2 * 0.55 * W * lurch.z.v) * dt;
        lurch.x.x += lurch.x.v * dt;
        lurch.z.x += lurch.z.v * dt;
        c.hx += clamp(lurch.x.x, -st.travel.lurch, st.travel.lurch);
        c.hz += clamp(lurch.z.x, -st.travel.lurch, st.travel.lurch);
      }
      if (st.travel.halting && speedNow > 0.05) {
        const len = (cycle / 2) * stretch,
          e = u * u * (3 - 2 * u),
          k = (e - u) * len * st.travel.halting;
        c.hx += vx * k;
        c.hz += vz * k;
      }

      // ---- fouls done to him: a flinch, an eye covered, a head pulled down onto what is coming
      fouled.flinch += dt;
      fouled.blind += dt;
      if (fouled.flinch < 0.3) {
        const k = bump(fouled.flinch / 0.3);
        c.hp += 10 * k;
        c.ly -= 0.03 * k;
        c.ry -= 0.03 * k;
      }
      if (fouled.blind < fouled.long + 0.2 && !(punchMove && punchMove.hand === 'R')) {
        const k = smooth(fouled.blind / 0.1) * (1 - smooth((fouled.blind - fouled.long) / 0.2));
        c.ry += 0.07 * k;
        c.rz += 0.04 * k;
        c.rx += 0.05 * k;
        c.hw -= 6 * k;
      }
      if (view.pulled > 0.002) {
        const k = view.pulled;
        c.hy -= 0.04 * k;
        c.lean += 10 * k;
        c.hp += 8 * k;
        c.hz += 0.03 * k;
      }

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
      for (const [side, x, yy, z] of [['L', 'lx', 'ly', 'lz'], ['R', 'rx', 'ry', 'rz']]) {
        const gk = knock[side];
        c[x] += spring(gk[0], 0, dt, 4.2, 0.55);
        c[yy] += spring(gk[1], 0, dt, 4.2, 0.55);
        c[z] += spring(gk[2], 0, dt, 4.2, 0.55);
      }

      /* ---- down and staying there: he still breathes, hard, and the head lifts and drops with it (a man on the canvas is
         not a picture of one) */
      if (action && MOVES[action.name].floor && MOVES[action.name].stay) {
        // (it comes in as the fall settles, so that there is no moment when nothing moves)
        const k = smooth(clamp(action.t / MOVES[action.name].dur, 0, 1)),
          b = Math.sin(TAU * 1.3 * clock),
          slow = Math.sin(TAU * 0.37 * clock + 0.6);
        c.st += 0.012 * b * k;
        c.hy += 0.012 * b * k;
        c.lean += (3.5 * b + 1.5 * slow) * k;
        c.hp += (5 * slow - 3 * b) * k;
        c.hw += 4 * Math.sin(TAU * 0.23 * clock) * k;
        c.ly += 0.02 * b * k;
        c.ry += 0.02 * Math.sin(TAU * 1.3 * clock + 0.5) * k;
      }

      // ---- what the fight has done to him: rocked by the last big blow, worn down by all of them, short of breath
      if (!floored) {
        wobble.t += dt;
        const w = wobble.amount * Math.exp(-wobble.t / WOBBLE.last) * smooth(clamp(wobble.t / WOBBLE.onset, 0, 1)),
          T = wobble.t,
          // a hand that is punching is the punch's, not his condition's (it is physics: where it goes is what it hits)
          free = { L: !(punchMove && punchMove.hand === 'L'), R: !(punchMove && punchMove.hand === 'R') },
          guardUp = 1 - 0.6 * cover,
          breath = Math.sin(TAU * (1 + 0.5 * tired) * clock);
        if (w > 1e-3) {
          /* the knees go and come back, the trunk swings from side to side over them, the head lolls, the gloves sag. (The
             head itself goes only a little way: a rocked man is there to be hit, not harder to find.) */
          c.hy -= 0.04 * w * (0.7 + 0.3 * Math.sin(TAU * 2.1 * T));
          c.side += 5 * w * Math.sin(TAU * 1.3 * T);
          c.lean += 5 * w;
          c.hr += 12 * w * Math.sin(TAU * 1.05 * T + 0.8);
          c.hp += 10 * w;
          c.lfw -= 8 * w; // the knees knock in
          c.rfw += 6 * w;
          if (free.L) (c.ly -= 0.14 * w * guardUp), (c.lz -= 0.04 * w), (c.lx += 0.03 * w);
          if (free.R) (c.ry -= 0.14 * w * guardUp), (c.rz -= 0.04 * w), (c.rx -= 0.03 * w);
        }
        // hurt: the guard lower and wider, the head and shoulders forward and down
        c.lean += 8 * hurt;
        c.hp += 10 * hurt;
        c.hy -= 0.03 * hurt;
        // tired: the gloves heavy, the chest heaving, quicker as he is more spent
        c.st += 0.012 * tired * breath;
        c.lean += 2.5 * tired * breath;
        c.hp -= 3 * tired * breath; // (the chin comes up for air)
        if (free.L) (c.ly -= (0.08 * hurt + 0.07 * tired - 0.018 * tired * breath) * guardUp), (c.lx += 0.03 * hurt), (c.lz -= 0.03 * tired);
        if (free.R) (c.ry -= (0.07 * hurt + 0.07 * tired - 0.018 * tired * breath) * guardUp), (c.rx -= 0.03 * hurt), (c.rz -= 0.02 * tired);
      }

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
      /* (a great puncher whose foot is in the air as he lets go puts it down at once, inside two frames: a drop step) */
      if (punchMove && form && form.drop && dropFor !== id) (dropFor = id), (dropAt = clock), (dropHalf = halves);
      const dropped = punchMove && form && form.drop && halves === dropHalf ? clamp(1 - (clock - dropAt) / (2 / 60), 0, 1) : 1;
      let dip = 0;
      for (const side of ['L', 'R']) {
        const gf = GUARD.feet[side],
          k = side === 'L' ? 'lf' : 'rf',
          stepping = swing.side === side;
        let at = planted[side],
          lift = 0,
          pitch = st.flat ? 0 : (side === 'R' ? 6 : 3) * up * lively; // a planted foot is on its ball, the heel riding up with the float
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
          at = [from[0] + (to[0] - from[0]) * e, gf.at[1], from[2] + (to[2] - from[2]) * e];
          // travelling, a foot is lifted by its stride; on the spot it is only unweighted and snapped up off the canvas (a
          // dirty man slides his along instead)
          lift = (Math.min(0.075, length * 0.35) * (1 - st.drag) + HOP * spot * st.hop) * Math.pow(Math.sin(Math.PI * u), 1.3) * dropped;
          pitch = st.flat ? 0 : (14 * Math.sin(TAU * u) * clamp(length / 0.2, 0, 1) * (1 - 0.6 * st.drag) + 8 * spot * Math.min(1, st.hop) * Math.sin(Math.PI * u)) * dropped;
        } else {
          // a foot left too far behind by a shove or a dash is dragged, not left to pull the leg straight
          const o = [at[0] - gf.at[0], at[2] - gf.at[2]],
            l = Math.hypot(o[0], o[1]),
            most = STRIDE * 1.2;
          if (l > most) (at[0] = gf.at[0] + (o[0] * most) / l), (at[2] = gf.at[2] + (o[1] * most) / l);
        }
        // (a dirty man's lead foot on its way onto the other man's, and on it: the bout's to say whether it got there)
        if (stomp && side === 'L') {
          at = [at[0] + (stomp.to[0] - at[0]) * stomp.w, at[1], at[2] + (stomp.to[2] - at[2]) * stomp.w];
          lift += stomp.lift;
        }
        // the hips come down a little as the feet are spread (as much as a long stride asks, and no more)
        dip += Math.min(0.04, (at[0] - gf.at[0]) ** 2 + (at[2] - gf.at[2]) ** 2) * 0.3;
        feet[side] = {
          at: [at[0] + c[k + 'x'], gf.at[1] + c[k + 'y'] + lift, at[2] + c[k + 'z']],
          yaw: gf.yaw + c[k + 'w'],
          pitch: gf.pitch + c[k + 'p'] + pitch
        };
      }

      // ---- solve
      sunk += (dip - sunk) * (1 - Math.exp(-dt * 24)); // (followed, so a foot snapping through its swing does not jerk the hips)
      const hips = [GUARD.hips[0] + c.hx, Math.max(0.15, GUARD.hips[1] + c.hy - sunk), GUARD.hips[2] + c.hz],
        spine = trunk(c, gaze);
      /* (a head put into a man: the hips are carried on until his own head is against the other man's, as far as a lunge
         goes; the rest of him is solved from there) */
      if (butt) {
        const h = headOf(hips, spine),
          d = [butt.to[0] - h[0], butt.to[2] - h[2]],
          l = Math.hypot(d[0], d[1]) || 1,
          go = Math.min(butt.most, Math.max(0, l - 0.16)) * butt.w;
        hips[0] += (d[0] / l) * go;
        hips[2] += (d[1] / l) * go;
      }
      const head = headOf(hips, spine),
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
          flare = clamp(c[k + 'e'], 0, 1) + raise[side],
          open = M.add(GUARD.hands[side], [c[k + 'x'], c[k + 'y'], c[k + 'z']]),
          // held to the face, or locked to the chest and swung with it, or part way between
          held = M.lerp(M.add(open, carried), M.add(chest.p, M.app(swung, M.sub(open, CHEST.p))), clamp(c[k + 'c'], 0, 1)),
          // (or reaching round the back of the other man's neck)
          free = grab && grab.side === side ? M.lerp(held, grab.to, grab.w) : held,
          mine = punchMove && punchMove.hand === side ? punchMove : null;
        if (mine) {
          /* The punching arm is not sent anywhere: it is thrown. The shoulder and elbow are the last two joints of the
             chain, and where the fist is follows from how far each has turned, on top of wherever the body has carried the
             shoulder by then. */
          const chain = action.chain,
            shoulder = M.add(chest.p, M.app(chest.R, M.sub(TPOSE[(side === 'L' ? 'Left' : 'Right') + 'Arm'], TPOSE.Chest))),
            swingQ = clamp(chain.q[3], 0, 1.06),
            extend = clamp(chain.q[4], 0, 1.05);
          let thrown;
          if (mine.arm === 'straight') {
            // the shoulder turns the arm onto the line of the target; the elbow straightens it along that line
            const to = target || [s * 0.02, 1.46, shoulder[2] + 0.75],
              from = M.sub(free, shoulder),
              line = M.sub(to, shoulder),
              folded = Math.hypot(from[0], from[1], from[2]),
              out = Math.min(REACH, Math.hypot(line[0], line[1], line[2]));
            thrown = M.add(shoulder, M.scale(swingTo(unit(from), unit(line), swingQ), folded + (out - folded) * extend));
          } else {
            // the arm stays bent and the body brings it: the shoulder only closes what is left between the fist and the target
            const to = target || M.add(free, mine.arm === 'lift' ? [s * -0.1, 0.36, 0.38] : [s * -0.1, 0.02, 0.06]);
            thrown = M.lerp(free, to, swingQ);
            // (bent is bent: a hook thrown from too far away does not grow into a straight punch to get there)
            const out = M.sub(thrown, shoulder),
              far = Math.hypot(out[0], out[1], out[2]);
            if (far > BENT) thrown = M.add(shoulder, M.scale(out, BENT / far));
          }
          if (extra[side]) thrown = M.add(thrown, extra[side]);
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
          hc = handCarry[side];
        if (handover && hand[side]) {
          hc.x = M.sub(hand[side], raw);
          hc.v = handSpeed[side].slice();
        }
        const e = Math.exp(-SETTLE * dt);
        for (let i = 0; i < 3; i++) {
          const j = hc.v[i] + SETTLE * hc.x[i];
          hc.x[i] = (hc.x[i] + j * dt) * e;
          hc.v[i] = (hc.v[i] - SETTLE * j * dt) * e;
        }
        const at = M.add(raw, hc.x);
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
