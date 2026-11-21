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
               stance: his grade of footwork (skill.mjs) | null, guard: his grade of covering up | null,
               cross: the cross-arm guard he holds when his guard is up (skill.mjs CROSS[grade], show.mjs) | null,
               roll: a shoulder roll he is in, { t (seconds into it), roll (skill.mjs ROLL[grade]), shape (the cross-arm
               guard it takes on, if he holds none) } | null (show.mjs),
               hook: seconds since a lead hook coming at him started | null,
               threat: { eta (seconds until the punch coming at him gets there), dir } | null, stun: bool (stopped by a blow),
               low: { zone, t, id } | null (a punch coming at his body: where, and seconds since he could see it: body.mjs),
               shoved: metres a second he is being knocked back at,
               cheer: bool, still: bool (lying on the canvas) }
     a.strike({ J, dir: [left, up, ahead] })         he has just been hit: the impulse in newton-seconds, and the way the glove
                                                      was going as it met him (on his body: zone, a, k, the place it met
                                                      him, game/trunk.mjs; and his grade's cover.low: body.mjs)
     a.rhythm                                         his beat: { beat, cycle, halves, stepping, landed, lead, flourish }
     a.covered                                        how far his gloves are up into his guard, 0..1
     a.legend                                         a legend on the move (legend.mjs): how much of the wind-up of a
                                                      punch thrown now his bent knees and the lean of his trunk have done
                                                      already, { load: 0..1 } | null
     a.wave                                           the wave his feet are in (clean.mjs): { plan, k, phi, ending, done,
                                                      slicked } | null (view.wave: the bout's, while he is in one)
     a.patting                                        his rear glove coming down on a punch, a down parry (clean.mjs:
                                                      patDown; view.pat: the bout's, while his guard is put up for one)
     a.getUp()                                        knocked down and lying still: the way up that fits how he lies, and
                                                      how to turn and move his place so that he gets up where he lies:
                                                      { name, on, down, move: [x, z] (his space), turn (radians) } | null
   Knocked down (a move that is a fall: ko, slump, and out cold: out, outStiff, outTwist, outLift), his body is a body (phys/fall.mjs) from the pose he was in, and the next
   rise is blended out of the pose he comes to rest in (view.near: what of the other man he cannot fall through). */
import * as M from '../rig/m3.mjs';
import { TPOSE, fk } from '../rig/skeleton.mjs';
import { solve, centre, footPose, LEN } from '../rig/solve.mjs';
import { createFall, stepFall, shoveFall, poseOf, lyingOf, moveFall } from '../phys/fall.mjs';
import * as Q from './quat.mjs';
import { FOOT, HEAD, RADIUS, shoulderOf } from '../rig/body.mjs';
import { LINKS, stepChain } from '../phys/chain.mjs';
import { CHANNELS, GUARD, MOVES, LEFT_BEND, LIE, UP, sampleMove, mirrorKnees } from './moves.mjs';
import { LEVEL } from './skill.mjs';
import { H, headAt, headTo, phraseX, PHRASE, FLOURISH, CLEAN, DIRTY, dice } from './stance.mjs';
import { sampleEvade, EVASIONS, timeline, evadeTime } from './evade.mjs';
import { travel as legendTravel, dash as legendDash, dashShape } from './legend.mjs';
import { stance as showStance, crossGuard, ear, shoulderRoll, hammer, paw, PAW, collar, COLLAR, ELBOW } from './show.mjs';
import { bodyState, struck as foldUp, give as bodyGive, coverLow } from './body.mjs';
import { createWave, waveBeat, waveLand, waveLanding, waveDrag, waveBody, createPat, patDown, pattedArm } from './clean.mjs';

const TAU = Math.PI * 2;
/* The feet keep time. One beat is one foot coming down; a cycle is both. Standing, the boxer rocks between his feet on that
   beat (the lead foot is lifted and set down, then the rear: a pendulum), and when he travels the same beat becomes his
   steps, quickening as he goes, so he never has to find the rhythm again: he was already in it. */
const CYCLE = { rest: 0.64, travel: 0.3, fast: 0.52 }; // seconds for both feet to come down once: on the spot, at full speed, and a legend's quickened phrase
const HOP = 0.03; // metres an unweighted foot clears the canvas by, bouncing on the spot
/* The bounce itself, once for each foot that comes down: a short squash as the weight lands (the legs take it like springs),
   the push back off it, and a float before the next. The squash and the float meet at the same speed, so it rebounds
   rather than bobs. Heights of the hips in metres at full liveliness, and made by the knees: bent into the landing and
   straightened off it, about `knee` degrees either way in the textbook (skill.mjs: stance.knee, each grade's), at `slope`
   metres of the hips a degree (both knees together, about the guard's 38 and 48). */
const BOUNCE = { contact: 0.38, float: 0.016, knee: 5.4, slope: 0.0027 };
// rocked: seconds it takes to wear off (to a third), and how quickly it comes on
const WOBBLE = { last: 0.95, onset: 0.1 };
/* Being hit (strike): the whole of him takes the blow's vector, the head first and the rest after it, down the body: the
   trunk `trunk` seconds after the head, the hips `hips` after, the feet `feet` after. Amounts are for `ref` newton-seconds
   (a clean cross) and go with the impulse (the bout caps it at 110), each a velocity given to a spring that is let go of as
   it always was (so a harder blow is longer getting over):
     back    the trunk laid back (`lean` degrees: its springs take it `give` degrees a second of kick for each degree they
             lean it and bend it, and it leans and bends as it faces, turned to his right), the hips pushed back
             (`hz`: 4 cm), the weight onto his heels: the lead foot's toes up (`toes` degrees), the rear heel down with it
     up      the body lifted, as fast as the blow throws 75 kg (the bout's shove, 2.2 times physics) and so as high as that
             throws a body (v^2 / 2g), but no higher than his legs reach up on his toes (`lift`: the first `knee` metres as
             thrown, the rest less and less, never past `most`), pushed up over `push` seconds (under 3 g), down again
             under gravity, and into his knees; the heels go up as the hips pass `free` metres (`heel` degrees a metre), and
             the spine is straightened (laid back `ext` as much again as it is lifted)
     across  the trunk bent the way it went (`side` degrees), the hips after it (`hx`: 3 cm), the other foot rolled
             onto its inside edge (`edge`)
     down    pressed down into his knees */
// (of a head thrown by a blow, how much the gloves are not carried with it)
const SNAP = 0.25;
const HIT = { ref: 85, trunk: 0.03, hips: 0.045, feet: 0.06, lean: 27, ext: 0.3, side: 11, give: [26.6, 20], hz: 1.25, toes: 360, hx: 0.85, edge: 260, lift: { knee: 0.04, most: 0.055, push: 0.045, free: 0.02, heel: 330 }, mass: 75, shove: 2.2 };
BOUNCE.squash = (4 * BOUNCE.float * BOUNCE.contact) / ((1 - BOUNCE.contact) * Math.PI); // the depth that meets the float at the same speed
const ROCK = 0.034; // metres the weight swings forward and back between the feet, bouncing on the spot
/* A dash's knees, degrees and seconds: the leg he pushes off bent `push` in `load` (two frames), straightened back to `out` by
   `drive`, and the leg he lands on bent `land` over `lands`. lead: which way the lead foot is from the middle of his feet. */
const DASH = { push: 16, load: 0.034, out: 0, drive: 0.13, land: 12, lands: [0.1, 0.3], lead: [0.28, 0.44] };
const STRIDE = 0.42; // metres: the furthest a foot is ever put from its place in the guard
const SETTLE = 30; // how fast the difference between two moves is let go of (1/seconds): gone in about a sixth of a second
/* Nothing pulls a man down but gravity: his centre of mass can fall no faster than that (and a little faster as he is drawn,
   1.3 g, with the muscles pulling the hips down under it), and it is stopped on the way down, or driven up, by the legs, up
   to 3 g. Whatever a move asks of his height, and whatever his arms and legs are doing, this is what his body can do with
   it: the centre of mass follows what is asked exactly while it is within that, and otherwise goes as fast as it can,
   slowing in time to arrive at rest, and the hips carry it (metres a second a second). */
const FALL = { down: 1.3 * 9.81, up: 3 * 9.81, brake: 2.4 * 9.81, back: 15 }; // (back: how quickly he comes back onto what is asked, 1/s)
/* Seconds over which the first of a rise is drawn out of the pose he lay in, bone by bone. The rise itself is blended out of
   that pose as the solver takes it, but the solver does not take it exactly (it folds no arm as tight as a limp one can be,
   and puts an elbow it has unfolded back on top of the canvas), and the difference is let go of over this rather than in a
   frame. */
const UNLIE = 0.25;
// (what of him rests on the canvas, and how thick it is there)
const ON_CANVAS = ['Left', 'Right'].flatMap(S => [[S + 'Foot', RADIUS.Foot], [S + 'ToeBase', RADIUS.ToeBase]]);
// (and how much nearer its shoulder each hand is brought on its way there, the elbow bent, metres at the middle of it)
const FREE = 0.12;
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
  const E = e => (e && e.length === 9 ? e : M.euler(e || [0, 0, 0])); // (degrees, or a turn already)
  let R = E(spine.Hips),
    p = hips,
    prev = 'Hips';
  for (const name of ['Spine1', 'Spine2', 'Chest']) {
    p = M.add(p, M.app(R, M.sub(TPOSE[name], TPOSE[prev])));
    R = M.mul(R, E(spine[name]));
    prev = name;
  }
  return { p, R };
}
/* The trunk and the head. The eyes stay on the opponent whatever the shoulders do: of a turn of the shoulders away from the
   guard, `gaze` of it is taken back by the neck (the textbook's 0.9; a beginner's head goes round with his shoulders). But a
   neck turns only so far: past 60 degrees it gives less and less, and never more than 75, and beyond that he is looking over
   his shoulder (the eyes do the rest). */
const NECK = { knee: 60, most: 75 };
/* (and the spine twists only so far: the chest on the pelvis, past 34 degrees less and less, never past 42; the guard holds
   it 10 degrees to his right already, so a lead hook has the less of it to use) */
const TWIST = { knee: 34, most: 42 };
const soft = (x, { knee, most }) => (Math.abs(x) <= knee ? x : Math.sign(x) * (knee + (most - knee) * Math.tanh((Math.abs(x) - knee) / (most - knee))));
function trunk(c, gaze) {
  const lean = GUARD.lean + c.lean,
    yaw = GUARD.yaw + c.yaw,
    twist = soft(GUARD.twist + c.twist, TWIST),
    look = soft(2 * (-(GUARD.yaw + GUARD.twist) * 0.45 - (c.yaw + twist - GUARD.twist) * (gaze ?? 0.9) * 0.5 + c.hw * 0.5), NECK) / 2;
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

/* A planted foot is kept by its ball: that is the spot on the canvas that stays where it was put, and the foot turns on it
   (as the body turns over it, or a punch turns it) and its heel rises off it. Where each ball is in the guard: */
const ballOf = (at, yaw) => {
  const b = M.app(M.ry(yaw), FOOT.ball);
  return [at[0] + b[0], at[1], at[2] + b[2]];
};
const BALL = { L: ballOf(GUARD.feet.L.at, GUARD.feet.L.yaw), R: ballOf(GUARD.feet.R.at, GUARD.feet.R.yaw) };

/* The knees (the channels lkf, rkf). A knee over a planted foot is not bent on its own: the hips come down over the foot until
   the leg is bent that much further than it was. Each planted leg asks the hips down so far (straight down: the knee goes
   out over the toes, the hips do not go back), and the hips follow the leg the weight is on, which is the one bent more:
   bent as much as each other, both carry him, half each; bent `span` degrees apart or more, the more bent one carries all
   of him, and the hips go over toward it by `shift` of the way from the middle of his feet to that foot, sideways (the
   weight going onto it: forward and back the knees move nothing, which is the business of hz); the other leg follows,
   straightening, or bending under the hips, as it must. A foot off the canvas (up more
   than `air` metres, wholly by the second number more) carries nothing, and its knee bent further folds it up under him;
   straightened, a leg in the air stays as it hangs. */
const KNEE = { span: 24, shift: 0.5, air: [0.03, 0.06] };
const LEGS = { L: M.sub(TPOSE.LeftLeg, TPOSE.Hips), R: M.sub(TPOSE.RightLeg, TPOSE.Hips) };
// how far the hip is from the ankle with the knee bent so many degrees from straight, and back
const legSpan = flex => Math.sqrt(LEN.thigh ** 2 + LEN.shin ** 2 - 2 * LEN.thigh * LEN.shin * Math.cos(Math.PI - (clamp(flex, 0.5, 150) * Math.PI) / 180));
const legFlex = d => 180 - (Math.acos(clamp((LEN.thigh ** 2 + LEN.shin ** 2 - d * d) / (2 * LEN.thigh * LEN.shin), -1, 1)) * 180) / Math.PI;
// how far the hip comes down over the ankle (negative: up) for a knee bent `more` degrees further, the ankle where it is
function reach(H, A, more) {
  const h2 = (H[0] - A[0]) ** 2 + (H[2] - A[2]) ** 2,
    was = legFlex(Math.hypot(H[0] - A[0], H[1] - A[1], H[2] - A[2])),
    up = d => Math.sqrt(Math.max(0, d * d - h2));
  return up(legSpan(was + more)) - up(legSpan(was));
}
function bend(hips, spine, feet, kf, elev) {
  const R = M.euler(spine.Hips),
    hipAt = (p, side) => M.add(p, M.app(R, LEGS[side])),
    ankle = { L: footPose(feet.L).ankle, R: footPose(feet.R).ankle },
    planted = side => 1 - smooth((elev[side] - KNEE.air[0]) / KNEE.air[1]),
    w = { L: planted('L'), R: planted('R') },
    // the hips straight down (or up) as far as each planted leg asks
    // (from the leg as it is to the leg bent so much further, both reckoned the same way: a leg stretched past its length,
    // as a long stride leaves it for a moment, is taken as straight, and bent from there)
    down = side => reach(hipAt(hips, side), ankle[side], kf[side]),
    lean = clamp(0.5 + ((kf.L || 0) - (kf.R || 0)) / (2 * KNEE.span), 0, 1), // the share of the weight the bend puts on the lead leg
    share = { L: w.L * lean, R: w.R * (1 - lean) },
    all = share.L + share.R;
  let out = hips;
  if (all > 1e-6) {
    const dy = (share.L * (share.L ? down('L') : 0) + share.R * (share.R ? down('R') : 0)) / all,
      // (over toward the foot the weight goes onto, if both are down to take it)
      q = (lean - 0.5) * 2 * Math.min(w.L, w.R) * KNEE.shift * 0.5,
      across = M.sub(ankle.L, ankle.R);
    out = [hips[0] + across[0] * q, hips[1] + dy, hips[2]];
  }
  // a foot in the air: folded up under him by however much further its knee is bent
  for (const side of ['L', 'R']) {
    const fold = (1 - w[side]) * Math.max(0, kf[side] || 0);
    if (fold < 1e-6) continue;
    const H = hipAt(out, side),
      raise = Math.min(Math.max(0, -reach(H, ankle[side], fold)), Math.max(0, H[1] - 0.25 - ankle[side][1]));
    feet[side] = Object.assign({}, feet[side], { at: [feet[side].at[0], feet[side].at[1] + raise, feet[side].at[2]] });
  }
  return out;
}

const REACH = LEN.upperArm + LEN.foreArm - 0.03; // as far as a wrist gets from its shoulder
const HOLD_ROUND = 750; // degrees a second: the fastest a hook's fist is taken round to its side as the legs drive (sweep)
const BENT = 0.4; // and as far as it gets with the elbow held at a right angle
/* A shoulder shrugged up (the cross-arm guard's lead shoulder: show.mjs): the collarbone (LeftShoulder, from the chest to the
   shoulder: `arm` metres out) turned up so far that the shoulder rises so many metres, and `ahead` degrees forward at `most`
   metres of it (into the punch's way) */
const SHRUG = { arm: Math.abs(TPOSE.LeftArm[0] - TPOSE.LeftShoulder[0]), ahead: 18, most: 0.07 };
// (a straight rolled off a shoulder: how far its fist goes on, over it, in his own terms: moves.mjs rolled, game/bout.mjs)
const ROLLED = [0, 0.03, 0.08];
/* (his grade's way of covering up with the cross-arm guard he holds put in its place, for body.mjs coverLow: the same object
   when they are the same, as they are for the dirty great ones' default) */
const LOW_GUARDS = new Map();
const lowGuard = (cv, xc) => {
  if ((cv.cross || null) === xc) return cv;
  if (!LOW_GUARDS.has(cv)) LOW_GUARDS.set(cv, new Map());
  const m = LOW_GUARDS.get(cv);
  if (!m.has(xc)) m.set(xc, Object.assign({}, cv, { cross: xc }));
  return m.get(xc);
};
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

/* A point carried round by the turning body (about the vertical through `axis`), put onto the circle through `to`: `out` of
   the way to as far from the axis as `to` is, `up` of the way to its height, and turned `back` degrees round that circle
   (+ to his left). */
function sweep(p, to, axis, out, up, back) {
  const a = ((back || 0) * Math.PI) / 180,
    c = Math.cos(a),
    sn = Math.sin(a),
    rx = c * (p[0] - axis[0]) + sn * (p[2] - axis[2]),
    rz = -sn * (p[0] - axis[0]) + c * (p[2] - axis[2]),
    r = Math.hypot(rx, rz) || 1e-6,
    k = (r + (Math.hypot(to[0] - axis[0], to[2] - axis[2]) - r) * out) / r;
  return [axis[0] + rx * k, p[1] + (to[1] - p[1]) * up, axis[2] + rz * k];
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

/* The duck in, by his grade (skill.mjs: entry): the written curve, with a beginner's bow (the waist doing what the knees
   would, the eyes on the canvas, the foot lifted high, up again early), an amateur's seam (down, a stop, and then in), and
   a great one's eyes kept on the other man. Where he goes is the bout's. */
function duckIn(action, c) {
  const e = (action.level || LEVEL[3]).entry,
    t = action.t,
    // (a seam: the way in after the way down waits so long)
    s = t < 0.1 ? t : Math.max(0.1, t - e.seam),
    tmp = sampleMove(MOVES.duckIn, e.rise !== null && s > e.rise ? e.rise + (s - e.rise) * 1.8 : s, {});
  for (const ch in tmp) {
    let v = tmp[ch];
    if (ch === 'lkf' || ch === 'rkf') v *= 1 - e.waist * 0.8;
    if (ch === 'lean') v *= 1 + e.waist * 0.9;
    c[ch] += v;
  }
  const down = smooth(t / 0.1) * (1 - smooth((t - 0.35) / 0.2));
  c.hp += e.look * down;
  // (the lead foot lifted as it goes: a beginner's high off the canvas)
  c.lfy += Math.max(0, e.step - 0.02) * bump((t - 0.06 - e.seam) / 0.22);
  if (e.angle || e.pivot[0]) c.hp -= 4 * down; // (the eyes up on him)
}
/* Moving away with the guard let go of, by his grade (skill.mjs: away): the hands dropped below the chest and swinging loose a
   moment behind the bounce, the trunk upright and the chin up, the heels up, the knees bouncing off the ankles, and the hands
   back up over the last hop (`clock` for the bounce). A beginner cannot let go: his hands slide down, he stands up straight,
   flat on his heels, and his feet come together; a legend's feet change over in the air in the middle hop. */
function away(action, clock, c, show) {
  const aw = (action.level || LEVEL[3]).away,
    t = action.t,
    D = MOVES[action.name].dur,
    back = smooth((t - (D - 0.2)) / 0.2), // (the last hop: the hands come back)
    on = smooth(t / 0.12) * (1 - back),
    drop = aw.drop * (aw.slide ? smooth(t / 0.6) * (1 - back) : on),
    swing = Math.sin(TAU * (t - 0.06) / (2 * 0.16));
  // (a show-off's lead hand is down at his waist already: it is let hang loose, lower, by his thigh: show.mjs)
  c.ly -= (show ? 0.36 : 0.3) * drop + 0.03 * swing * drop;
  if (show) c.le -= 0.2 * drop;
  c.ry -= 0.26 * drop + 0.03 * swing * drop;
  c.lz -= 0.06 * drop;
  c.rz -= 0.02 * drop;
  c.lx += 0.03 * drop;
  c.rx -= 0.03 * drop;
  c.le -= 0.2 * drop;
  c.re -= 0.2 * drop;
  c.lean -= (8 + aw.upright) * on;
  c.hp -= 4 * on;
  if (aw.hop) {
    const hop = Math.sin(TAU * t / (2 * 0.16));
    c.lfp += 16 * on;
    c.rfp += 16 * on;
    c.lkf += 8 * aw.hop * hop * on;
    c.rkf += 8 * aw.hop * hop * on;
  } else (c.lfp -= 3 * on), (c.rfp -= 6 * on);
  if (aw.together) (c.lfx -= 0.05 * aw.together * on), (c.rfx += 0.05 * aw.together * on);
  // (the middle hop: lead foot back and rear foot forward, in the air, and back again)
  if (aw.shuffle) {
    const mid = bump((t - 0.34) / 0.22);
    c.lfz -= 0.4 * mid;
    c.rfz += 0.4 * mid;
  }
}

// (a show-off's tricks that send his lead hand for the other man: show.mjs)
const REACHING = ['pawDown', 'pawUp', 'collar'];
// a move written for the lead hand, made the rear hand's: the hands' channels swapped, and everything across him mirrored
function swapHands(c) {
  for (const [a, b] of [['lx', 'rx'], ['ly', 'ry'], ['lz', 'rz'], ['le', 're'], ['lc', 'rc'], ['lg', 'rg']]) {
    const x = c[a] || 0;
    c[a] = c[b] || 0;
    c[b] = x;
  }
  for (const ch of ['lx', 'rx', 'side', 'twist', 'yaw', 'hw', 'hr', 'hx']) if (c[ch]) c[ch] = -c[ch];
}
export function createAnimator(seed) {
  const c = {}, // this frame's channels
    shown = {}, // last frame's, as drawn
    speed = {}, // and how fast each was changing
    carry = {}; // what is still owed to the move before: { x, v } a channel, sprung to nothing
  for (const ch of CHANNELS) (shown[ch] = 0), (speed[ch] = 0), (carry[ch] = { x: 0, v: 0 });
  const roll = dice((seed || 0) + 1); // his own dice: the fidgets, the flourishes, the lurch of a man with no beat
  let sunk = 0, // how far the hips are down for the spread of the feet
    feetLive = 1, // how lively his feet are, followed: a foot in the air is not snapped down by a move starting
    height = null, // his centre of mass's height as drawn, and how fast it is changing: { y, v, want } (FALL)
    fall = null, // his body while he is knocked down (phys/fall.mjs)
    propped = 0, // metres the canvas is holding him up by, getting up (see below)
    rising = null, // the pose he lay in, as the solver takes one and as it was, for the rise to be blended out of: { rest, pose, blend, id }
    poses = [null, null], // his last two poses (what a fall starts from)
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
  /* a legend on the move (legend.mjs): the foot that came down at each half beat (by its count), how much of the shape of
     his going there is (followed), the dash he is shaping (and when it started), and how wound up all that leaves him */
  const legend = { feet: {}, sides: {}, w: 0, across: 0, bent: 0, dash: null, load: 0, k: { L: 0, R: 0 }, air: { L: 0, R: 0 } };
  // a clean great one's wave (clean.mjs): its own beat for his feet, and its body
  const wave = createWave();
  // and his down parry (clean.mjs): the rear glove out, down on a glove coming in, and on into his counter
  const pat = createPat();
  let patting = false;
  // a beginner's feet, shifted about the canvas a few centimetres at a time: where each is now, and the one moving
  const fidget = { L: 0, R: 0, move: null, next: 1.8 + 1.4 * roll(), side: 'R' };
  // how far a beginner's body goes on past his feet when he stops, sprung back
  const lurch = { x: { x: 0, v: 0 }, z: { x: 0, v: 0 }, was: [0, 0] };
  // how fast the canvas is going past under each foot, followed a little late so a shove or a stop does not snatch the feet
  const under = { L: [0, 0], R: [0, 0] },
    /* The feet are on the canvas, not on the body. A planted foot stays where it was put while the body travels and turns
       over it (its place is kept in his own space and carried back as the canvas goes by); at every half beat one foot is
       chosen to step, and is brought from where it was to where it should be, leaving and landing at rest on the canvas. */
    planted = { L: BALL.L.slice(), R: BALL.R.slice() },
    swing = { side: null, from: null, last: ['L', 'R'], to: null, still: false, back: false, came: null },
    lag = { x: 0, v: 0 }, // the upper body following the bounce, a touch late: what makes the gloves and head ride it
    elbow = { L: null, R: null }, // which way each elbow was pointing from its shoulder, last frame
    round = { L: null, R: null }, // and where it was round the arm (solve.mjs: roundOf), degrees
    arm = { L: null, R: null }, // and each upper arm's way as the chest saw it (solve.mjs: arms)
    wrist = { L: null, R: null }, // and where each wrist was
    knees = { L: null, R: null }, // and each knee round its leg (solve.mjs: azimuth), degrees
    // where each hand was drawn last frame and how fast it was going, and what is still owed to the move before
    hand = { L: null, R: null },
    handSpeed = { L: [0, 0, 0], R: [0, 0, 0] },
    handCarry = { L: { x: [0, 0, 0], v: [0, 0, 0] }, R: { x: [0, 0, 0], v: [0, 0, 0] } },
    steer = { L: [0, 0, 0], R: [0, 0, 0] }, // how far each hand is being carried off its punch's nominal line onto the target
    held = { L: null, R: null }; // how far round to its side a hook's fist is held, degrees (see sweep)
  // the give of a struck body: head (nod, turn, tilt), trunk (lean, side, turn), and how far the guard is knocked open
  // (and the rest of him: the hips back and across, the lead toes up, a foot rolled onto an edge, the knees taking him)
  const give = { hp: { x: 0, v: 0 }, hw: { x: 0, v: 0 }, hr: { x: 0, v: 0 }, lean: { x: 0, v: 0 }, side: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, open: { x: 0, v: 0 }, sink: { x: 0, v: 0 }, hz: { x: 0, v: 0 }, hx: { x: 0, v: 0 }, toes: { x: 0, v: 0 }, edge: { x: 0, v: 0 }, settle: { x: 0, v: 0 } };
  // the head as a blow throws it this frame (nod, turn, tilt: what of the give is the head's)
  const snap = { hp: 0, hw: 0, hr: 0 };
  // lifted by a blow: how high the hips are (metres), how fast they are going, and for how much longer they are being pushed up
  const lift = { y: 0, v: 0, a: 0, push: 0 };
  // what a blow has still to do to him, down the body after the head: [{ at (his clock), kick }]
  let later = [];
  // and of each glove on its own, metres (in his terms, as the hand channels are): a glove that has met a punch
  const knock = { L: [0, 1, 2].map(() => ({ x: 0, v: 0 })), R: [0, 1, 2].map(() => ({ x: 0, v: 0 })) };
  let edge = 0, // a foot rolled onto its inside edge by a blow across him: + the right foot (a blow to his left), - the left
    leadOut = 1, // how far out a dirty man's lead hand is (put out in the other man's face, unless a punch is coming)
    showDown = 1, // how far down a show-off's lead hand is let (show.mjs)
    hammering = false, // a show-off's rear fist coming down on a punch, his guard put up fresh (show.mjs)
    shrug = 0, // metres his lead shoulder is shrugged up (the cross-arm guard, the shoulder roll: show.mjs)
    crossHeld = null, // the cross-arm guard he held last frame, if it was up (what a block on its lead forearm sags)
    hooked = 0, // how far his rear glove has gone back to the ear for a lead hook (the cross-arm guard's)
    knockRate = 1, // how quickly a knocked glove comes back, times (his guard's grade: a block, or a parry)
    lastEvade = null; // the evasion he was in last frame (what the way out of it starts from)
  // a great one riding a punch on his guard (going with it, or out to take it early), 0..1
  const riding = { x: 0 };
  // the lead forearm of a cross-arm guard given by a blow on it: metres, and how long ago (show.mjs, skill.mjs CROSS: sag)
  const sag = { d: 0, t: 9 };
  // a man rocked by a blow: how badly (0..1) and how long ago; his legs are gone for a second or so
  const wobble = { amount: 0, t: 9 };
  // the head's offset off the line of the punch, as it was last frame (what the way out of the punch starts from)
  const off = { x: 0, y: 0 };
  // what a dirty man's fouls are doing to him: a flinch at a foot stood on, a glove over an eye he has been thumbed in
  const fouled = { flinch: 9, blind: 9, long: 0.4 };
  // a glove of his a show-off has pushed out of the way (show.mjs: paw): { hand, dy, hold, free, t } | null
  let pawedBy = null;
  // his neck in a show-off's hand, his head pulled forward and down (show.mjs: collar): { dir, d, time, t } | null
  let pulledBy = null;
  // what blows to his body are still doing to him, and his elbow brought down over one coming (body.mjs)
  const bodyHits = bodyState();
  const remember = pose => ((poses = [poses[1], pose]), pose);
  // a pose part of the way from another to it, each bone turned part of the way (what the solver said of it kept)
  const between = (from, to, w) => {
    const out = Object.assign({}, to, { root: M.lerp(from.root, to.root, w), rot: {} });
    for (const name in to.rot) out.rot[name] = from.rot[name] ? Q.toM3(Q.slerp(Q.fromM3(from.rot[name]), Q.fromM3(to.rot[name]), w)) : to.rot[name];
    const F = fk(out);
    out.at = F.p;
    out.head = M.add(F.p.Head, M.app(F.R.Head, HEAD));
    return out;
  };

  /* A rise is the pose he lay in turning into the rise's own over its first part: the solver's inputs, blended (the hips
     and the ends of his limbs moved straight, the joints turned the short way), and solved as anything is. */
  const blendStance = (rest, key, w) => {
    const out = { hips: M.lerp(rest.hips, key.hips, w), spine: {}, feet: {}, hands: key.hands, stretch: key.stretch };
    for (const j in rest.spine) {
      const e = key.spine[j] || [0, 0, 0];
      out.spine[j] = Q.toM3(Q.slerp(Q.fromM3(rest.spine[j]), Q.fromM3(e.length === 9 ? e : M.euler(e)), w));
    }
    // (each arm is brought round as the chest sees it, from where it lay to where the rise puts it)
    const was = chestOf(rest.hips, rest.spine),
      to = chestOf(key.hips, key.spine),
      now = chestOf(out.hips, out.spine);
    for (const side of ['L', 'R']) {
      const kf = footPose(key.feet[side]),
        rf = rest.feet[side],
        kh = key.hands[side],
        rh = rest.hands[side];
      const kp = key.feet[side].pole,
        // (turned from one to the other the short way round, never through nothing: a knee that lay pointing one way and is to
        // point nearly the other does not flip over half way)
        pole = rf.pole && kp ? swingTo(unit(rf.pole), unit(kp), w) : rf.pole || kp,
        poleW = rf.pole && kp ? Math.max(1 - w, key.feet[side].poleW) : rf.pole ? 1 - w : kp ? key.feet[side].poleW * w : 0;
      out.feet[side] = { ankle: M.lerp(rf.ankle, kf.ankle, w), R: Q.toM3(Q.slerp(Q.fromM3(rf.R), Q.fromM3(kf.R), w)), pole, poleW, round: key.feet[side].round, out: key.feet[side].out };
      /* (the arm from its shoulder, as the chest sees it: swung out to his side and down on its way, its elbow out and back,
         and not across or behind him: an arm lying across him or under him is freed, the shoulder rolled and the elbow out
         to the side, before it is put anywhere) */
      const S = side === 'L' ? 'LeftArm' : 'RightArm',
        at = ch => M.add(ch.p, M.app(ch.R, M.sub(TPOSE[S], TPOSE.Chest))),
        a0 = M.app(M.tr(was.R), M.sub(rh.at, at(was))),
        a1 = M.app(M.tr(to.R), M.sub(kh.at, at(to))),
        l0 = Math.hypot(...a0),
        l1 = Math.hypot(...a1),
        /* (half way, the way between where it lay and where it goes, taken out to his side: half way, or all the way if the
           way straight there would put it where the shoulder cannot, across him or behind him) */
        wide = unit([side === 'L' ? 0.8 : -0.8, -0.6, 0]),
        mirror = v => [side === 'L' ? v[0] : -v[0], v[1], v[2]],
        across = [0.1, 0.3, 0.5, 0.7, 0.9].some(k => shoulderOf(mirror(swingTo(unit(a0), unit(a1), k))).zone > 0),
        /* (and an arm lying across his chest comes off it forward first, not down across his belly, if he lies with his chest
           to the sky; lying on it, the arm is under him, and is drawn out to his side by his head, the shoulder rolled, not
           down past his belly) */
        aside = mirror(unit(a0))[0] < -0.2 ? unit(mirror(was.R[5] > -0.3 ? [0.45, -0.4, 0.8] : [0.75, 0.45, 0.1])) : across ? wide : swingTo(swingTo(unit(a0), unit(a1), 0.5), wide, 0.5),
        way = w < 0.5 ? swingTo(unit(a0), aside, w * 2) : swingTo(aside, unit(a1), w * 2 - 1),
        arm = M.scale(way, l0 + (l1 - l0) * w - FREE * Math.sin(Math.PI * w));
      // (the elbow out to his side at once, and kept there through the first half)
      const elbowOut = Math.min(1, w * 6) * (1 - smooth((w - 0.5) * 2));
      out.hands[side] = Object.assign({}, kh, { at: M.add(at(now), M.app(now.R, arm)), toward: unit(M.lerp(M.lerp(rh.toward, kh.toward, w), M.app(now.R, [side === 'L' ? 0.7 : -0.7, -0.3, -0.6]), elbowOut)) });
    }
    return out;
  };

  return {
    /* The blow's impulse is shared out by the way the glove was going (HIT). The head takes it at once: back through it
       nods it back, across turns and tilts it, upward lifts the chin, and the guard is knocked open. The rest of him takes
       it after, down the body: the trunk laid back and bent the way it went, the hips pushed after it and lifted, the
       weight onto his heels. */
    strike(hit) {
      // (a blow to his body, the trunk first and the head last: body.mjs)
      if (hit.zone) return foldUp(bodyHits, hit, clock);
      const k = hit.J / 55, // (the head's amounts are for 55 newton-seconds, as they always were)
        K = hit.J / HIT.ref,
        [left, up, ahead] = hit.dir,
        back = Math.max(0, -ahead);
      give.hp.v += (ahead * 800 - up * 1000) * k;
      give.hw.v += left * 900 * k;
      give.hr.v += -left * 400 * k;
      give.open.v += 7 * k;
      later.push({
        at: clock + HIT.trunk,
        kick: () => {
          /* (tilted the way the blow went, and further back as it lifts him: the trunk leans and bends as it faces, turned to
             his right in the guard, so so much of each as tilts it that way, by how far each of its springs takes it) */
          const y = ((GUARD.yaw + GUARD.twist / 2 + shown.yaw) * Math.PI) / 180,
            tilt = [left * HIT.side, (ahead - HIT.ext * Math.max(0, up)) * HIT.lean];
          give.lean.v += (tilt[0] * Math.sin(y) + tilt[1] * Math.cos(y)) * HIT.give[0] * K;
          give.side.v += (tilt[0] * Math.cos(y) - tilt[1] * Math.sin(y)) * HIT.give[1] * K;
          give.yaw.v += left * 300 * k;
        }
      });
      later.push({
        at: clock + HIT.hips,
        kick: () => {
          give.hz.v += ahead * HIT.hz * K;
          give.hx.v += left * HIT.hx * K;
          // (how fast the blow throws all of him up, or down)
          const v = ((hit.J * up) / HIT.mass) * HIT.shove,
            L = HIT.lift;
          if (v > 0) {
            /* as high as that throws a body, as far as his legs reach; and so how fast he leaves, the push up included
               (v0^2 / 2g + v0 push / 2 is that height) */
            const h = soft((v * v) / (2 * 9.81), L),
              v0 = 9.81 * (-L.push / 2 + Math.sqrt((L.push * L.push) / 4 + (2 * h) / 9.81));
            if (v0 > lift.v) (lift.a = (v0 - Math.max(0, lift.v)) / L.push), (lift.push = L.push);
          } else give.settle.v -= v; // (pressed down, the knees take it)
        }
      });
      later.push({
        at: clock + HIT.feet,
        kick: () => {
          give.toes.v += back * HIT.toes * K;
          give.edge.v += left * HIT.edge * K;
        }
      });
      /* A blow that stops him long enough rocks him (the longer, the worse, and the more he has been hurt already, the
         worse again); another before he has got over it adds to what is left. */
      if (hit.stun !== undefined) {
        const now = wobble.amount * Math.exp(-wobble.t / WOBBLE.last),
          more = clamp((hit.stun - 0.38) / 0.36, 0, 1) + clamp((45 - (hit.hp ?? 100)) / 45, 0, 1) * 0.35;
        if (more > 0.02) (wobble.amount = clamp(now + more, 0, 1)), (wobble.t = 0);
      }
    },
    /* Knocked down, shoved on by the glove going on through him (game/bout.mjs: follow): all of his falling body given this
       velocity, his own terms, or, out cold and stiff, turned over his foot by it (phys/fall.mjs: shoveFall; none before the
       fall has started: the bout gives it from the step after the blow) */
    shove(v) {
      if (fall) shoveFall(fall, v);
    },
    /* A parry: the glove that met the punch sweeps it off the line, across his body and down, and comes back; his
       shoulders turn a little with it. (The puncher's side of it is the reel.) */
    deflect(hit) {
      const g = knock[hit.hand],
        across = hit.hand === 'R' ? 1 : -1, // the right glove pushes a punch away to his left, the left glove to his right
        cv = (hit.level || LEVEL[3]).cover,
        // (a beginner's whole arm goes after it and stays out; a legend's wrist only, and on into his own punch)
        big = cv.meet.scale + (cv.meet.add.lz || 0) * 4;
      knockRate = cv.back;
      g[0].v += across * 3.2 * big;
      g[1].v -= 1.4 * big;
      g[2].v += 0.9 * big;
      give.yaw.v += across * 140;
      give.hw.v += across * 60;
    },
    /* A block: the punch drives the glove it hit back into his face, and the other one after it, and rocks his head and
       his trunk back, and his knees take it. */
    brace(hit) {
      const bk = (hit.level || LEVEL[3]).cover.block,
        k = Math.max(0.5, Math.min(hit.J, 120) / 40) * bk.brace; // (even a punch smothered early shoves the guard)
      knockRate = bk.settle;
      // (a beginner's gloves are knocked apart; a legend rolls it off his shoulder)
      if (bk.open) give.open.v += 150 * bk.open;
      if (bk.meet) give.yaw.v += (hit.hand === 'R' ? -1 : 1) * bk.meet[1] * 9;
      for (const side of ['L', 'R']) {
        const g = knock[side],
          m = side === hit.hand ? 1 : 0.45;
        g[2].v -= 1.6 * k * m;
        g[1].v += 0.35 * k * m;
        g[0].v += (side === 'L' ? -0.4 : 0.4) * k * m; // and in toward the middle
      }
      give.hp.v -= 260 * k;
      give.lean.v -= 60 * k;
      give.sink.v += 0.5 * k;
      // (a cross-arm guard's lead forearm, hit, gives and comes back: show.mjs)
      if (crossHeld && hit.hand === 'L') (sag.d = crossHeld.sag), (sag.t = 0);
    },
    /* A foul done to him (game/bout.mjs: fouls): stood on, he flinches and looks down at it; a glove left over his face, his
       head goes back (if it was done in the open) and his rear glove goes to his eye a while. */
    /* His guard pushed down or up by the other man's lead hand (game/bout.mjs: paws): the glove goes with it, is held there
       and comes back. */
    /* His neck caught by the other man's lead hand (game/bout.mjs: collars): his head and trunk pulled down toward him. */
    pulled(p) {
      pulledBy = Object.assign({ t: 0 }, p);
    },
    pawed(p) {
      pawedBy = pawedBy && pawedBy.t === 0 && pawedBy.hand !== p.hand ? [].concat(pawedBy.list || [pawedBy], [Object.assign({ t: 0 }, p)]) : Object.assign({ t: 0 }, p);
      if (Array.isArray(pawedBy)) pawedBy = { t: 0, list: pawedBy };
    },
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
    // how far his gloves have got up into his guard, 0..1 (his grade's arrival: skill.mjs, cover.arrive)
    get covered() {
      return cover;
    },
    // a show-off's rear fist coming down on a punch as his guard goes up (show.mjs: hammer): what the bout judges his parry by
    get hammering() {
      return hammering;
    },
    // a clean great one's rear glove coming down on a punch (clean.mjs: patDown): what the bout judges his down parry by
    get patting() {
      return patting;
    },
    get legend() {
      return legend.load > 0.05 ? { load: legend.load } : null;
    },
    get wave() {
      return wave.on ? { plan: wave.plan, k: wave.k, phi: wave.phi, ending: wave.end !== null, done: wave.done, slicked: wave.slick > 0.05 } : null;
    },
    get rhythm() {
      const lengthNow = (cycle / 2) * stretch;
      return { beat: ((((halves - 1) % 2) + 2) % 2 + u) / 2, cycle, halves, stepping: swing.side, landed: swing.came, lead: halves + u - ref, u, half: lengthNow, left: stop > 0 ? stop + lengthNow * (1 - u) : (lengthNow * (1 - u)) / Math.max(0.05, rate), flourish: flourish && flourish.k > 0.5 ? flourish.name : null, stopped: stop > 0 };
    },
    // his body as he was last knocked down (phys/fall.mjs), or null
    get fallen() {
      return fall;
    },
    /* Lying still after a fall: which way up fits how he lies (moves.mjs: LIE), and the turn and move of his place that put
       that rise's start where he lies (moves.mjs: UP), so that he gets up there; the body is carried into that place, and
       the pose he lies in kept for the rise to come out of. */
    getUp() {
      // (out cold, there is no way up)
      if (!fall || fall.out) return null;
      const lying = lyingOf(fall),
        name = LIE[lying.on],
        want = UP[name],
        heading = Math.atan2(lying.head[0] - lying.hips[0], lying.head[2] - lying.hips[2]),
        turn = Math.atan2(Math.sin(heading - want.heading), Math.cos(heading - want.heading)),
        Rt = M.ry((turn * 180) / Math.PI),
        k = M.app(Rt, [want.hips[0], 0, want.hips[1]]),
        o = [lying.hips[0] - k[0], 0, lying.hips[2] - k[2]];
      // (into the new place: p' = R^T (p - o))
      const back = M.tr(Rt);
      moveFall(fall, back, M.scale(M.app(back, o), -1));
      // (as he was last drawn, breathing and all)
      const pose = poseOf(fall, clock, fall.breath || 0),
        F = fk(pose),
        rest = { hips: M.add(pose.root, TPOSE.Hips), spine: {}, feet: {}, hands: {} };
      for (const j of ['Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Head', 'LeftShoulder', 'RightShoulder']) rest.spine[j] = pose.rot[j];
      for (const [side, S] of [['L', 'Left'], ['R', 'Right']]) {
        const mid = (a, b) => M.scale(M.add(F.p[a], F.p[b]), 0.5);
        // (where his knee points, if the leg is bent enough to say: a straight one says nothing)
        const bend = M.sub(F.p[S + 'Shin'], mid(S + 'Leg', S + 'Foot'));
        rest.feet[side] = { ankle: F.p[S + 'Foot'], R: F.R[S + 'Foot'], pole: Math.hypot(...bend) > 0.04 ? unit(bend) : null };
        rest.hands[side] = { at: F.p[S + 'Hand'], toward: unit(M.sub(F.p[S + 'ForeArm'], mid(S + 'Arm', S + 'Hand'))) };
      }
      rising = { rest, pose, blend: MOVES[name].blend, id: null };
      return { name, on: lying.on, down: lying.down, move: [o[0], o[2]], turn };
    },
    update(view, dt) {
      clock += dt;
      // (what a blow still has to do to him, down the body, as its moment comes)
      if (later.length && later.some(k => clock >= k.at - 1e-9)) {
        const due = later.filter(k => clock >= k.at - 1e-9);
        later = later.filter(k => clock < k.at - 1e-9);
        for (const k of due) k.kick();
      }
      // ---- knocked down: his body is the fall's until he gets up (breathing as it settles)
      if (view.action && MOVES[view.action.name].fall) {
        const act = view.action;
        if (!fall || fall.id !== act.id) (fall = createFall(poses[1] || guardPose(), poses[0], dt, act.blow, MOVES[act.name].faint)), (fall.id = act.id), (rising = null), (later = []), (lift.y = lift.v = lift.push = 0);
        stepFall(fall, dt, view.near);
        /* (his place on the canvas goes with him as he is thrown and slides: the body is moved back under it, and the bout
           told how far it has to move his place for it: pose.drift, metres in his own terms) */
        const lying = lyingOf(fall),
          drift = [lying.hips[0], 0, lying.hips[2]];
        moveFall(fall, M.id(), M.scale(drift, -1));
        if (poses[1]) poses[1] = Object.assign({}, poses[1], { root: M.sub(poses[1].root, drift) });
        fall.breath = smooth((fall.t - 0.3) / 1.2);
        const pose = poseOf(fall, clock, fall.breath);
        pose.drift = [drift[0], drift[2]];
        return remember(pose);
      }
      for (const ch of CHANNELS) c[ch] = 0;
      const action = view.action,
        id = action ? action.id : null,
        punchMove = action && MOVES[action.name].punch ? MOVES[action.name] : null,
        grade = view.stance || LEVEL[3],
        st = grade.stance,
        stun = !!view.stun,
        // (a dash, or the duck in: one burst, whoever makes it)
        dashing = !!action && (action.name === 'dash' || action.name === 'duckIn'),
        hopping = !!action && (action.name === 'hopPivot' || action.name === 'hopCircle'),
        taunting = !!action && !!MOVES[action.name].taunt;

      // ---- what he is doing
      // what the punching hand does past where the chain puts it (a dirty jab's glove pushed on into his face)
      const extra = { L: null, R: null };
      let form = null, // how this punch's grade holds the body (skill.mjs)
        foul = null, // and the foul a dirty one throws with it (moves.mjs)
        stomp = null; // a lead foot going onto his instep: { to, w, lift }
      if (punchMove) {
        // a punch: what its wind-up and each joint of its chain add, by how far each has turned (as far as he turns it)
        const move = punchMove,
          chain = action.chain,
          amp = chain.amp || [1, 1, 1, 1, 1];
        form = (action.level || LEVEL[3]).form;
        // (only when the press turned into it: game/bout.mjs, anim/show.mjs)
        foul = form.dirty && move.foul && action.variant === move.foul.name ? move.foul : null;
        const sg = Math.sign(move.links.trunk.twist), // which way this punch turns the body
          share = Object.assign({ off: 1, bend: 1, tuck: 1, sep: 1, dip: 1, over: 1 }, move.body), // how much of each this punch takes
          [d, hp, t] = [0, 1, 2].map(i => clamp(chain.q[i], 0, 1.2));
        /* (the better he is the less of the wind-up shows; what sets the arm for a hook or an uppercut is all there, and so is
           the shoulders' turn past the hips that the locked arm is swung out of. A man who turns all of a piece, with no
           stretch between his hips and his shoulders, winds up all of a piece too.) */
        // (and a beginner does not use his knees at all: what the wind-up and the chain do to his height is not done)
        const knees = form.dip > 0 ? 0 : 1,
          height = ch => (ch === 'hy' || ch === 'lkf' || ch === 'rkf' ? knees : 1);
        for (const ch in move.coil) c[ch === 'twist' && !form.sep ? 'yaw' : ch] += move.coil[ch] * chain.coil.q * (ch === 'lc' || ch === 'le' || ch === 'rc' || ch === 're' || (ch === 'twist' && move.chain.locked) || (ch === 'yaw' && move.arm === 'swing') ? 1 : chain.shown ?? 1) * height(ch);
        // (a flicker's body: a great dirty fighter's swing, a legend's wrist: moves.mjs)
        const flick = move.flick ? move.flick[Math.max(0, (form.dirty || 1) - 1)] : 1;
        LINKS.forEach((link, i) => {
          for (const ch in move.links[link]) c[ch] += move.links[link][ch] * chain.q[i] * amp[i] * height(ch) * flick;
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
          // (right up close there is no room to draw the hand back and show it coming)
          tell = form.tell * chain.coil.q * (move.tight ? 0 : 1);
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
        /* (a punch thrown out of the end of an evasion: the other glove is still on his cheek where the evasion put it, out of
           the way of the arm that has just gone past his head, and comes off it as the punch goes) */
        if (action.loaded && action.loaded.from !== 'parry' && action.loaded.from !== 'legend' && action.loaded.from !== 'wave') (c[o + 'z'] -= 0.12 * (1 - smooth(action.t / 0.2))), (c[o + 'y'] -= 0.01 * (1 - smooth(action.t / 0.2)));
        c.hp -= 11 * form.chin * out; // the chin up and out after it (tucked, the better he is)
        c.lean += 9 * form.over * share.over * out; // and the weight thrown in after it, over the front foot (right up close there is no room)
        c.hz += 0.05 * form.over * share.over * out;
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
          /* (no quicker than his hips can be let down: a dip so deep takes so long, and where that is longer than the time
             to the hips' firing, its bottom comes later, toward the contact) */
          const at = (chain.wait || 0) + chain.coilTime / (chain.quick || 1) + (chain.pause || 0) + 0.03 + form.late,
            half = Math.max(0.05, at, Math.sqrt((-depth * Math.PI ** 2) / (2 * FALL.down))),
            from = Math.abs(action.t - Math.max(at, half));
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
        const comingOut = chain.phase === 'recover' || ((form.exit === 'stumble' || form.exit === 'flat') && chain.phase === 'hold');
        if (comingOut && (!exit || exit.id !== id) && form.exit) exit = { kind: form.exit, id, from: halves + u, t: 0, x: off.x, y: off.y, side: off.x >= 0 ? -1 : 1, done: null };
        if (!(chain.phase === 'recover' && (form.exit === 'roll' || form.exit === 'angle'))) {
          headTo(c, ox, oy);
          off.x = ox;
          off.y = oy;
        }
        /* Dirty: the punch's foul (moves.mjs: foul), blatant (a great dirty fighter's) or passed off (a legend's). Whether it
           lands is the bout's to judge (game/bout.mjs: fouls); this is the body that does it. */
        /* (a flicker's wrist snaps over at the end of it: the glove goes on a few centimetres, up and in, as the elbow gets
           straight, and back as it comes home) */
        if (move.snap) extra[me] = M.add(extra[me] || [0, 0, 0], [0, move.snap * 0.4, move.snap].map(v => v * smooth(clamp((chain.q[4] - 0.75) / 0.25, 0, 1)) * (chain.phase === 'recover' ? 1 - smooth(chain.since / 0.12) : 1)));
        /* (rolled off his shoulder: carried on after it while it is held out, game/bout.mjs; moves.mjs rolled. The fist goes on
           with him, up and over the shoulder it was turned off, ROLLED metres, so that it is the fist that goes past and not the
           elbow folded into the shoulder) */
        if (action.rolled) {
          const since = chain.t - action.rolled.at;
          sampleMove(MOVES.rolled, since, c);
          const on = smooth(since / 0.1) * (chain.phase === 'recover' ? 1 - smooth(chain.since / 0.12) : chain.phase === 'done' ? 0 : 1);
          if (on > 0) extra[me] = M.add(extra[me] || [0, 0, 0], M.scale(ROLLED, on));
        }
        if (foul) {
          const n = form.dirty - 1;
          if (foul.name === 'thumb') extra[me] = M.add(extra[me] || [0, 0, 0], [0, -0.01, foul.push[n] * reach]); // pushed on into his face
          else if (foul.name === 'stomp' && view.foe) {
            /* the lead foot over his in the wind-up and down on it with the drive, if it will reach: decided as the punch
               starts, and kept to (a foot does not set off for his halfway through) */
            const to = view.foe.foot,
              from = planted.L;
            if (!chain.stomp) chain.stomp = { go: Math.hypot(to[0] - from[0], to[2] - from[2]) < foul.reach };
            if (chain.stomp.go) {
              const on = smooth(clamp(chain.coil.q * 1.2 + chain.q[0], 0, 1)),
                off = foul.off[n] === null ? (chain.phase === 'recover' ? smooth(chain.since / 0.25) : 0) : chain.thrownAt >= 0 ? smooth((chain.t - chain.thrownAt - foul.off[n]) / 0.1) : 0;
              // (up through the wind-up, highest as it ends, and stamped down with the drive: it lands moving, and stops on his)
              stomp = { to: to.slice(), w: on * (1 - off), lift: foul.lift[n] * smooth(chain.coil.q) * (1 - clamp(chain.q[0], 0, 1)) };
              // (lifted by the knee: folded up under him, the more the higher it goes)
              c.lkf += foul.knee * (stomp.lift / foul.lift[0]);
              c.hp += foul.look[n] * chain.coil.q * (1 - chain.q[0]);
              c.hy -= foul.sink * smooth(clamp(chain.q[0], 0, 1)) * (1 - off);
            }
          }
        }
      } else if (action) {
        // an evasion, by his grade (evade.mjs: the pro's is the curve as written)
        if (EVASIONS.includes(action.name)) sampleEvade(action, action.level || LEVEL[3], c);
        else if (action.name === 'duckIn') duckIn(action, c);
        else if (action.name === 'hopPivot' || action.name === 'hopCircle') away(action, clock, c, st.show);
        else if (MOVES[action.name].taunt) {
          // (a show-off's taunt: as his grade does it, longer or shorter and bigger or smaller, show.mjs)
          const tmp = sampleMove(MOVES[action.name], action.t / (action.long || 1), {});
          for (const ch in tmp) c[ch] += tmp[ch] * (action.size ?? 1);
        } else if (MOVES[action.name].hand) {
          // (written for the lead hand: the rear's is the same with the hands swapped, mirrored across him)
          const tmp = sampleMove(MOVES[action.name], action.t, {});
          if (action.hand === 'R') swapHands(tmp);
          for (const ch in tmp) c[ch] += tmp[ch];
          // (pressed down: the arm held where it was met, as it was drawn then, and let down: clean.mjs)
          if (action.name === 'patted') {
            if (!action.held && wrist[action.hand === 'R' ? 'R' : 'L']) action.held = wrist[action.hand === 'R' ? 'R' : 'L'].slice();
            pattedArm(c, action, MOVES.patted.drop);
          }
        } else {
          sampleMove(MOVES[action.name], action.t, c);
          if (MOVES[action.name].sided) {
            // to his left (+1) or his right (-1)
            const s = action.side || 1;
            for (const ch of ['side', 'hx', 'hw', 'hr', 'lx', 'rx']) c[ch] *= s;
            if (s < 0) mirrorKnees(c);
            // (the turned stance: see LEFT_BEND)
            if (c.side > 0) (c.lean += LEFT_BEND.lean * c.side), (c.side += LEFT_BEND.side * c.side);
          }
        }
        if (action.name === 'dash' && action.dir) {
          const a = -c.st / 0.035; // the dash's own sink and rise, as 0..1
          c.side += a * 13 * action.dir[0];
          c.lean += a * 8 * action.dir[1];
          c.hw += a * 8 * action.dir[0];
          /* by his grade (skill.mjs: dash): a beginner jumps up out of it, both feet off together and the hands thrown open;
             an amateur stands up first and then pushes; a dirty man slides it, low; a legend lands turned, the rear knee bent */
          const dg = (action.level || LEVEL[3]).dash;
          /* The knees: the leg he pushes off (the one behind the way he goes) is bent at once, in two frames, and straightens
             as it drives; the other takes him as it comes down, bent. (Stood up into it, he does neither.) */
          if (!dg.upright) {
            const lead = action.dir[0] * DASH.lead[0] + action.dir[1] * DASH.lead[1] < 0, // (going back, the lead leg pushes)
              t = action.t,
              push = t < DASH.load ? DASH.push * smooth(t / DASH.load) : t < DASH.drive ? DASH.push + (DASH.out - DASH.push) * smooth((t - DASH.load) / (DASH.drive - DASH.load)) : DASH.out * (1 - smooth((t - DASH.drive) / (0.3 - DASH.drive))),
              land = DASH.land * bump((t - DASH.lands[0]) / (DASH.lands[1] - DASH.lands[0]));
            c[lead ? 'lkf' : 'rkf'] += push;
            c[lead ? 'rkf' : 'lkf'] += land;
          }
          // (stood up into it, he does not lean into it either)
          if (dg.upright) (c.hy += a * dg.rise), (c.lean -= a * 8 * action.dir[1]), (c.lx += 0.03 * a), (c.rx -= 0.03 * a), (c.ly += 0.02 * a), (c.ry += 0.02 * a);
          if (dg.prep) c.hy += dg.prep * bump(action.t / 0.1);
          if (dg.low) c.hy -= dg.low * smooth(action.t / 0.1);
          if (dg.bend) c.hy -= dg.bend * 0.5 * smooth((action.t - 0.15) / 0.15);
        }
      }
      // (any action but the punch he is coming out of puts an end to the way out of it)
      if (exit && action && action.id !== exit.id) exit = null;
      /* (out of an evasion, the way out of it is his grade's: a beginner stumbles, an amateur stands flat a beat, a legend is
         stepped off to the side, turned back in) */
      // (and out of a dash: a beginner stumbles out of it, an amateur lands flat, a legend lands turned)
      if (lastEvade && !action && lastEvade.level) {
        const kind = lastEvade.name === 'dash' ? lastEvade.level.dash.land : lastEvade.level.evade.exit;
        if (kind) exit = { kind, id: lastEvade.id, from: halves + u, t: 0, x: 0, y: 0, side: lastEvade.name === 'dash' ? (lastEvade.dir && lastEvade.dir[0] < 0 ? -1 : 1) : lastEvade.side || 1, done: null };
      }
      lastEvade = action && (EVASIONS.includes(action.name) || action.name === 'dash') ? action : null;
      const evading = action && EVASIONS.includes(action.name) ? (action.level || LEVEL[3]).evade : null,
        cv = (view.guard || LEVEL[3]).cover,
        // (the cross-arm guard he holds, if he carries it: show.mjs; and a shoulder roll he is in)
        xc = view.cross || null,
        rolling = view.roll || null;
      // (how quickly the gloves get up into the guard is his grade's, or his cross-arm guard's)
      cover += (clamp(view.cover || 0, 0, 1) - cover) * (1 - Math.exp(-dt * (xc ? 1 / xc.arrive : cv.textbook ? 22 : 1 / cv.arrive)));
      meet += (clamp(view.meet || 0, 0, 1) - meet) * (1 - Math.exp(-dt * 30));
      hurt += (clamp(view.hurt || 0, 0, 1) - hurt) * (1 - Math.exp(-dt * 1.5));
      tired += (clamp(view.tired || 0, 0, 1) - tired) * (1 - Math.exp(-dt * 1.5));
      cheer += ((view.cheer ? 1 : 0) - cheer) * (1 - Math.exp(-dt * 5));
      gaze += ((form ? form.look : evading ? evading.look : cv.look !== null ? st.look + (cv.look - st.look) * cover : st.look) - gaze) * (1 - Math.exp(-dt * 20));
      if (cover > 0.002) {
        for (const [ch, v] of Object.entries(sampleMove(MOVES.cover, 1, {}))) c[ch] += v * cover;
        // the guard as his grade holds it
        if (!cv.textbook) {
          // (where his grade holds the hands, unless he holds a cross-arm guard: its hands are its own, below)
          if (!xc) for (const ch in cv.hands) c[ch] += cv.hands[ch] * cover;
          for (const ch in cv.body) c[ch] += cv.body[ch] * cover;
          if (cv.block.lean) c.lean += cv.block.lean * cover;
        }
      }
      /* The cross-arm guard (show.mjs), if he carries it, as far as his guard is up; a shoulder roll takes the guard's shape on
         for as long as it lasts even if he holds none (the lead forearm down across him, the rear glove at the chin), and turns
         him away behind the lead shoulder. */
      shrug = 0;
      let crossK = 0;
      const shape = xc || (rolling && rolling.shape) || null;
      {
        const r = rolling ? shoulderRoll(c, rolling.roll, rolling.t) : null;
        crossK = shape ? Math.max(xc ? cover : 0, r && !xc ? r.w : 0) : 0;
        if (crossK > 0.002) shrug += crossGuard(c, shape, crossK);
        if (r) shrug += r.shrug;
        // (a lead hook coming: the rear glove back to the ear, so long after it starts, in 0.04 s, and back as it goes)
        const want = shape && crossK > 0.5 && view.hook !== null && view.hook !== undefined ? smooth((view.hook - shape.ear) / 0.04) : 0;
        hooked += (want - hooked) * (want > hooked ? 1 : 1 - Math.exp(-dt * 12));
        if (hooked > 0.002) ear(c, shape, hooked * crossK);
        // (and a blow on the lead forearm gives it, and it is back in 0.3 s)
        sag.t += dt;
        if (sag.d && sag.t < 0.3) c.ly -= sag.d * crossK * Math.min(1, sag.t / 0.03) * (1 - smooth((sag.t - 0.03) / 0.27));
        crossHeld = xc && cover >= 0.5 ? xc : null;
      }
      /* (and a guard he puts up fresh is a hammer of the rear fist, not the gloves put out to meet it: show.mjs; his cross-arm
         guard's, a dirty great one's. Not in a roll: the rear glove stays at the chin) */
      const hammers = !!(xc && xc.hammer);
      hammering = hammers && !rolling && view.fresh !== null && view.fresh !== undefined && hammer(c, xc.hammer, view.fresh);
      /* (and with it up, an elbow brought down over a punch coming at his body, body.mjs; not by a man who holds the cross-arm
         guard, whose lead forearm is across his belly already: what body.mjs reads as cv.cross is the guard he holds) */
      coverLow(bodyHits, c, view.low, lowGuard(cv, xc), cover, dt, clock);
      if (cheer > 0.002) for (const [ch, v] of Object.entries(sampleMove(MOVES.cheer, 1, {}))) c[ch] += v * smooth(cheer);
      // (the gloves out to meet it: his grade's parry, unless his cross-arm guard does not parry so, or he is rolling, or his
      // rear glove is out to press it down: clean.mjs)
      if (meet > 0.002 && !(xc && xc.parry !== 'meet') && !rolling && !view.pat) {
        for (const [ch, v] of Object.entries(sampleMove(MOVES.meet, 1, {}))) c[ch] += v * meet * cv.meet.scale;
        for (const ch in cv.meet.add) c[ch] += cv.meet.add[ch] * meet;
      }
      /* A great one on his guard, the instant before a punch lands on it: he goes back with it (the trunk turning away and the
         head going back, so it closes on him the slower), or a legend's glove goes out to take it before it is all there. */
      {
        const near = cover > 0.5 && view.threat && view.threat.eta < 0.04 && (cv.block.go || cv.block.meet);
        riding.x += ((near ? 1 : 0) - riding.x) * (1 - Math.exp(-dt * (near ? 60 : 9)));
        if (riding.x > 1e-3) {
          const from = view.threat ? Math.sign(view.threat.dir[0]) || 1 : 1;
          if (cv.block.go) (c.yaw += cv.block.go[0] * from * riding.x), (c.hz -= cv.block.go[1] * riding.x), (c.lean -= 3 * riding.x);
          if (cv.block.meet) (c.lz += cv.block.meet[0] * riding.x), (c.rz += cv.block.meet[0] * riding.x);
        }
      }
      // (and a guard put up to press a punch down is the rear glove out and coming down on it, and on into his counter: clean.mjs)
      patting = patDown(c, pat, { view, hand: punchMove ? punchMove.hand : null, phase: punchMove ? action.chain.phase : null, dt });
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
          const g = BALL[side],
            uu = under[side];
          // the ground speed of this foot's place under the body, walking and turning together, followed a little late
          uu[0] += (vx + turn * g[2] - uu[0]) * follow;
          uu[1] += (vz - turn * g[0] - uu[1]) * follow;
          fastest = Math.max(fastest, Math.hypot(uu[0], uu[1]));
          feet[side] = { fx: uu[0], fz: uu[1] };
        }
      }
      const going = clamp(fastest / 1.5, 0, 1), // 0 bouncing on the spot .. 1 travelling
        speedNow = Math.hypot(vx, vz),
        // free to fidget: doing nothing, not covering up, not going anywhere, not stopped or rocked or spent
        idle = !action && !view.still && cover < 0.05 && speedNow < 0.4 && !stun && rocked < 0.05 && hurt < 0.5 && tired < 0.6 && !exit,
        // where in his phrase he is (a legend's), in half beats from a lead foot
        P = ((((halves + u - ref) % PHRASE.length) + PHRASE.length) % PHRASE.length),
        quick = st.tempo === 'phrase' && P >= PHRASE.fast[0] && P < PHRASE.fast[1] ? CYCLE.fast / CYCLE.rest : 1;
      /* (a legend going sideways or round keeps a slower travelling beat, room for the U of each step: legend.mjs; going in and
         out, his steps quicken as anyone's) */
      if (st.legend && speedNow > 0.2) legend.across += (Math.abs(vx) / speedNow - legend.across) * (1 - Math.exp(-dt * 6));
      const travelK = dashing ? 1 : st.legend ? 1 + (st.travel.cycle - 1) * legend.across : st.travel.cycle;
      // (a beginner's and an amateur's travelling beat is slower, but not a dash's: that is one burst, whoever makes it)
      cycle += (CYCLE.rest * quick + (CYCLE.travel * travelK - CYCLE.rest * quick) * going - cycle) * (1 - Math.exp(-dt * 10)); // (quick enough to keep up, slow enough not to snap the bounce)
      // (in the wave, his feet keep its beat: a slide out and a slide in to a wave, clean.mjs)
      const wv = waveBeat(wave, { wave: view.wave, level: view.wave && view.wave.level, seed: seed || 0, halves, u, dt });
      if (wv) cycle = wv.cycle;
      /* Setting off: the foot on the side he is going should move first. If the other one was already up, hopping in place,
         it is only set back down under him in its place (it takes no step of its own), and the right foot steps first. */
      const mid = [(BALL.L[0] + BALL.R[0]) / 2, (BALL.L[2] + BALL.R[2]) / 2],
        leads = side => {
          const g = BALL[side],
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
      else if (evading && evading.beat === 'on') {
        // (a great clean one's way back out of an evasion is over on a foot coming down)
        approach = null;
        const T = timeline(action.name, action.level),
          te = evadeTime(action, T);
        if (te >= T.backAt) want = timing(Math.max(0.01, T.end - te), 'on');
      } else approach = null;
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
        if (swing.back && swing.side === side) return BALL[side].slice();
        const g = BALL[side],
          f = feet[side],
          ahead = cycle / 4,
          l = Math.hypot(f.fx, f.fz) * ahead,
          k = l > STRIDE ? STRIDE / l : 1,
          // (in the wave, the lead foot out further and the trail foot in, clean.mjs)
          wl = waveLanding(wave, side) || [0, 0, 0];
        return [g[0] + f.fx * ahead * k + wl[0], g[1], g[2] + f.fz * ahead * k + wl[2]];
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
        legend.feet[halves] = swing.side;
        delete legend.feet[halves - 8];
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
            right = leads('L') >= leads('R') ? 'L' : 'R',
            // (in the wave, its foot: clean.mjs)
            waveFoot = waveLand(wave, halves),
            // (a beginner as often as not sets off with the wrong one)
            side = waveFoot || (first ? (st.travel.order && roll() < st.travel.order ? (right === 'L' ? 'R' : 'L') : right) : score('L') >= score('R') ? 'L' : 'R');
          swing.side = side;
          swing.skid = 0;
          swing.still = !waveFoot && speedNow < 0.25; // (a hop in place, not a step anywhere)
          swing.from = planted[side].slice();
          swing.last = [swing.last[1], side];
        }
        /* How long this half beat is to be: even; swung, the half that starts on the lead foot long and the other short; or,
           a man with no beat, anything up to a quarter either way, at random (and seldom near the middle: he lurches). */
        stretch = 1;
        // (a legend going somewhere steps evenly: each step is a U, and a short one has no room for it)
        if (st.swing !== 0.5) stretch = 1 + (2 * (swing.came === 'L' ? st.swing : 1 - st.swing) - 1) * (st.legend ? 1 - legend.w : 1);
        // (a dirty legend going sideways lurches less, his steps long already: legend.mjs keeps him off the beat instead)
        if (st.jitter) stretch *= 1 + (roll() < 0.5 ? -1 : 1) * st.jitter * (0.5 + 0.5 * roll()) * (st.legend ? 1 - 0.6 * legend.w * legend.across : 1);
        // (the wave's half beats are even)
        if (wave.on && wave.end === null && wave.anchor !== null) stretch = 1;
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
        pep = (view.still ? 0 : action ? (form ? form.lively * ((punchMove.body && punchMove.body.lively) ?? 1) : evading ? evading.lively : hopping ? 1.4 * (action.level || LEVEL[3]).away.hop : action.name === 'wave' ? 0 : 0.35) : (1 + cheer * 1.6) * (cv.textbook ? 1 : 1 - cover * (1 - cv.lively)) * (xc ? 1 - cover * (1 - xc.lively) : 1)) * (1 - 0.5 * tired) * (1 - 0.3 * hurt) * (1 - 0.7 * rocked) * (1 - flat),
        lively = pep * st.bounce,
        spot = (1 - going) * lively, // how much of this is bouncing on the spot
        footSpot = (1 - going) * (feetLive += (lively - feetLive) * (1 - Math.exp(-dt * 20))),
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
        // (how far the hips go is how far his knees bend through it: his grade's, stance.knee, the textbook's KNEE_BOUNCE)
        // (a legend going somewhere: the U of each step is his bounce, legend.mjs)
        y = (sinking ? -BOUNCE.squash * g * accent : BOUNCE.float * 4 * s * (1 - s) * spring8) * pep * (cycle / CYCLE.rest) ** 2 * (st.knee / BOUNCE.knee) * (st.legend ? 1 - legend.w : 1),
        // forward while the rear foot is up, back while the lead is: through the middle at every landing
        rock = (swing.side ? (swing.side === 'L' ? -1 : 1) * Math.sin(Math.PI * u) : 0) * st.rock,
        trail = (spring(lag, y, dt, 4.2, 0.32) - y) * st.lag; // how far the upper body is behind the hips
      // (the knees bend into the landing and straighten off it, and the hips go with them; on the canvas, the hips alone)
      if (action && MOVES[action.name].floor) c.hy += y;
      else (c.lkf -= y / BOUNCE.slope), (c.rkf -= y / BOUNCE.slope);
      // squashed into the landing and stretched off it, each starting and ending at rest (the head is a long way from the canvas)
      {
        // (and its squash and stretch: a legend's U, going somewhere, is the whole of it)
        const r = st.legend ? ride * (1 - legend.w) : ride;
        c.st += (sinking ? -0.011 * g * g : 0.01 * Math.sin(Math.PI * s) ** 2 * (1 - s)) * r;
        c.lean += 1.3 * g * g * r + 1.6 * rock * spot;
      }
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
         most of it is unwound into the punch, and wound up again as the hand comes home; a hook, which lands as the body
         turns, comes up out of it with the legs' drive.) */
      const unwind = punchMove ? 1 - 0.7 * smooth(clamp(Math.max(action.chain.q[3], punchMove.arm === 'straight' ? action.chain.q[4] : punchMove.arm === 'swing' ? action.chain.q[0] : 0), 0, 1)) : 1;
      // (a stiff, upright man is not stiff and upright in the middle of a dash: his legs have to take it)
      const stiff = dashing ? 0 : 1;
      c.hy += st.hips < 0 ? st.hips * unwind : st.hips * stiff;
      c.lean += st.lean > 0 ? st.lean * unwind : st.lean * stiff;
      c.yaw += st.yaw * stiff;
      c.lfz += st.gap / 2;
      c.rfz -= st.gap / 2;
      if (st.shoulder) (c.side -= st.shoulder * unwind), (c.hr += st.shoulder * 0.6 * unwind); // (the hunched lead shoulder too)
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
        // (a lead hand put out in his face comes home when a punch is coming, and while he covers up or gets out of the way)
        leadOut += ((evading || view.threat ? 0 : 1 - cover) - leadOut) * (1 - Math.exp(-dt * 25));
        if (free.L) (c.lx += gd.lead[0] * leadOut), (c.ly += gd.lead[1] * leadOut), (c.lz += gd.lead[2] * leadOut);
        // (loose hands drift with his breathing and the bounce, a legend's never quite still)
        if (gd.loose) (c.ly += 0.008 * gd.loose * Math.sin(TAU * 0.7 * clock)), (c.ry += 0.008 * gd.loose * Math.sin(TAU * 0.7 * clock + 2)), (c.lz += 0.006 * gd.loose * Math.sin(TAU * 0.45 * clock + 1));
        /* (a show-off's lead hand is let down to his waist, and comes up as a punch comes, as he covers up or gets out of the
           way, and as he throws anything with it but the flicker, which goes out of the waist and back to it: show.mjs) */
        if (st.show) {
          // (snapped up into a punch thrown with it, so that it is up and still before the glove gets there; let down slowly)
          const lowHand = !action || hopping || (punchMove && ((punchMove.hand === 'R' && !REACHING.includes(action.variant)) || punchMove.low)),
            want = lowHand && !evading && !view.threat ? 1 - cover : 0;
          showDown += (want - showDown) * (1 - Math.exp(-dt * (want > showDown ? 8 : punchMove && !lowHand ? 45 : 16)));
          showStance(c, st.show, { clock, down: showDown, unwind, cover, seed: seed || 0 });
        }
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
      const comeback = exit ? (exit.kind === 'roll' || exit.kind === 'angle' ? smooth(halves + u - exit.from - 2) : 1) : 1;
      /* (a legend going anywhere: the shape of his going is his head's movement, legend.mjs, below; how much of it there is,
         followed, as his own head's is let go of: gone as an action starts, the difference let go of as between any two
         moves, and back as he goes on) */
      const lg = st.legend;
      if (lg) {
        // (his own going: not a blow knocking him back)
        const want = !action && !view.still && !stun ? smooth((speedNow - 0.2) / 0.4) * (1 - smooth((view.shoved || 0) / 0.2)) * intact * comeback * (cv.textbook ? 1 : 1 - cover * (1 - cv.head)) * (xc ? 1 - cover * (1 - xc.head) : 1) : 0;
        legend.w = action ? 0 : legend.w + (want - legend.w) * (1 - Math.exp(-dt * 12));
        // (the knees bent going in stay bent a while after he stops: the spring of what he throws next)
        const sp = Math.max(speedNow, 1e-3);
        legend.bent = action ? 0 : Math.max(legend.bent * Math.exp(-dt * 2.5), (legend.w * Math.max(0, vz)) / sp);
      }
      const hw = action ? 0 : (1 - 0.5 * going) * intact * comeback * (cv.textbook ? 1 : 1 - cover * (1 - cv.head)) * (xc ? 1 - cover * (1 - xc.head) : 1) * (lg ? 1 - legend.w : 1);
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
      /* ---- a legend's going (legend.mjs): every step a shallow weave, in with a slip, out with a sway; and a dash's shape,
         from its start on past its end into the landing (anything else starting puts an end to it). What it leaves his knees
         and trunk at is the wind-up of a punch thrown out of it (game/bout.mjs: loadOf). */
      if (lg && (legend.w > 1e-4 || legend.bent > 1e-3)) {
        const sp = Math.max(speedNow, 1e-3);
        legendTravel(c, { lg, seed: seed || 0, halves, u, feet: legend.feet, sides: legend.sides, next: swing.side, w: legend.w, side: Math.abs(vx) / sp, fwd: Math.max(0, vz) / sp, back: Math.max(0, -vz) / sp, bent: legend.bent });
      }
      const kneesWere = [c.lkf, c.rkf];
      if (action && action.name === 'dash' && (!legend.dash || legend.dash.id !== action.id)) {
        const dl = (action.level || LEVEL[3]).stance.legend;
        legend.dash = dl ? { id: action.id, from: clock, d: dashShape(action, dl, seed || 0) } : null;
      }
      if (legend.dash && action && action.id !== legend.dash.id) legend.dash = null;
      if (legend.dash && legendDash(c, legend.dash.d, clock - legend.dash.from) === false) legend.dash = null;
      legend.k = { L: c.lkf - kneesWere[0], R: c.rkf - kneesWere[1] };
      legend.load = Math.max(legend.w > 0.3 ? legend.w : 0, legend.bent > 0.3 ? legend.bent : 0, legend.dash && clock - legend.dash.from < 0.65 ? 1 : 0);
      // ---- the wave (clean.mjs): the hands let down, upright, the knees making the wave, the head across, the slick back
      if (action && action.name === 'wave') waveBody(c, wave, { view, clock, dt });
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
      if (st.travel.lean && speedNow > 0.05 && !dashing) {
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

      // ---- a glove pushed out of the way (show.mjs: paw): with it at once, held, and back
      if (pawedBy) {
        pawedBy.t += dt;
        for (const p of pawedBy.list || [pawedBy]) {
          const t = pawedBy.t,
            k = t < 0.06 + p.hold ? smooth(t / 0.06) : 1 - smooth((t - 0.06 - p.hold) / p.free);
          c[p.hand === 'L' ? 'ly' : 'ry'] += p.dy * k;
          c[p.hand === 'L' ? 'lx' : 'rx'] += (p.dx || 0) * k;
          if (t > 0.06 + p.hold + p.free) pawedBy.done = true;
        }
        if (pawedBy.done) pawedBy = null;
      }
      // ---- the neck pulled: the head and the trunk dragged forward and down toward him over `time`, and let up
      if (pulledBy) {
        pulledBy.t += dt;
        const p = pulledBy,
          k = p.t < p.time ? Math.sin((Math.PI / 2) * (p.t / p.time)) ** 2 : 1 - smooth((p.t - p.time) / 0.25),
          down = (p.d / 0.1) * k;
        c.lean += 11 * down * Math.max(0, p.dir[1]);
        c.hp += 9 * down;
        c.hz += 0.03 * down * p.dir[1];
        c.hx += 0.03 * down * p.dir[0];
        if (p.t > p.time + 0.25) pulledBy = null;
      }
      // ---- fouls done to him: a flinch, an eye covered
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

      // ---- the give of a body that has been hit
      snap.hp = spring(give.hp, 0, dt, 3.4, 0.42);
      snap.hw = spring(give.hw, 0, dt, 3.4, 0.42);
      snap.hr = spring(give.hr, 0, dt, 3.4, 0.42);
      c.hp += snap.hp;
      c.hw += snap.hw;
      c.hr += snap.hr;
      c.lean += spring(give.lean, 0, dt, 2.1, 0.55);
      c.side += spring(give.side, 0, dt, 2.1, 0.55);
      c.yaw += spring(give.yaw, 0, dt, 2.1, 0.55);
      c.hy -= Math.abs(spring(give.sink, 0, dt, 2.4, 0.6)) * 0.5;
      c.hz += spring(give.hz, 0, dt, 2.1, 0.55);
      c.hx += spring(give.hx, 0, dt, 2.1, 0.55);
      {
        // (the weight onto his heels: the lead foot's toes up, the rear heel down with them)
        const toes = spring(give.toes, 0, dt, 2.1, 0.55);
        c.lfp -= toes;
        c.rfp -= 0.8 * toes;
      }
      edge = spring(give.edge, 0, dt, 2.1, 0.55);
      /* lifted: pushed up, thrown, and down again under gravity onto his knees, which take him (settle: metres the hips are
         let down by them, the bounce's knees: BOUNCE.slope). The heels go up as he goes. */
      if (lift.push > 0 || lift.y > 0) {
        const p = Math.min(dt, lift.push),
          f = dt - p;
        lift.y += lift.v * p + 0.5 * lift.a * p * p;
        lift.v += lift.a * p;
        lift.push -= p;
        lift.y += lift.v * f - 0.5 * 9.81 * f * f;
        lift.v -= 9.81 * f;
        if (lift.y <= 0) (give.settle.v -= lift.v), (lift.y = lift.v = lift.push = 0);
      }
      c.hy += lift.y;
      c.lfp += Math.max(0, lift.y - HIT.lift.free) * HIT.lift.heel;
      c.rfp += Math.max(0, lift.y - HIT.lift.free) * HIT.lift.heel;
      {
        const settle = spring(give.settle, 0, dt, 2.4, 0.6) / BOUNCE.slope;
        c.lkf += settle;
        c.rkf += settle;
      }
      // (and folded round blows to his body: body.mjs)
      bodyGive(bodyHits, c, clock);
      const open = spring(give.open, 0, dt, 2.6, 0.6);
      c.lx += 0.09 * open;
      c.ly -= 0.05 * Math.abs(open);
      c.rx -= 0.09 * open;
      c.ry -= 0.05 * Math.abs(open);
      for (const [side, x, yy, z] of [['L', 'lx', 'ly', 'lz'], ['R', 'rx', 'ry', 'rz']]) {
        const gk = knock[side];
        c[x] += spring(gk[0], 0, dt, 4.2 * knockRate, 0.55);
        c[yy] += spring(gk[1], 0, dt, 4.2 * knockRate, 0.55);
        c[z] += spring(gk[2], 0, dt, 4.2 * knockRate, 0.55);
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
          // (the knees give, one and then the other, a quarter of a second apart, turned in toward each other)
          c.lkf += w * (6 + 12 * Math.sin(TAU * T) ** 2);
          c.rkf += w * (6 + 12 * Math.cos(TAU * T) ** 2);
          c.lkx -= 12 * w;
          c.rkx -= 12 * w;
          c.side += 5 * w * Math.sin(TAU * 1.3 * T);
          c.lean += 5 * w;
          c.hr += 12 * w * Math.sin(TAU * 1.05 * T + 0.8);
          c.hp += 10 * w;
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

      // ---- getting up out of a fall: what was showing before he went down is gone, not let go of
      if (rising && action && rising.id === null && MOVES[action.name].blend) {
        rising.id = id;
        doing = id;
        for (const ch of CHANNELS) (shown[ch] = c[ch]), (speed[ch] = 0), (carry[ch].x = carry[ch].v = 0);
        for (const side of ['L', 'R']) (hand[side] = null), (elbow[side] = null), (round[side] = null), (arm[side] = null), (wrist[side] = null), (knees[side] = null), (steer[side] = [0, 0, 0]);
        height = null;
        exit = null;
        fall = null;
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

      /* (how far a legend's dash will have taken him in so many seconds more, for each metre a second it is taking him now:
         game/bout.mjs moves him along a curve at rest at both ends, 0.85 of the dash's length) */
      const dashTravel =
        st.legend && action && action.name === 'dash'
          ? tau => {
              const D = MOVES.dash.dur * 0.85,
                F = x => ((x = clamp(x, 0, 1)), x * x * x * (10 + x * (6 * x - 15))),
                q = clamp(action.t / D, 0.15, 0.95);
              return (F(q + tau / D) - F(q)) / ((30 * q * q * (1 - q) * (1 - q)) / D);
            }
          : null;
      // ---- the feet: the planted one where it was put, the stepping one on its way from there to where it should land
      /* (a great puncher whose foot is in the air as he lets go puts it down at once, inside two frames: a drop step) */
      if (punchMove && form && form.drop && dropFor !== id) (dropFor = id), (dropAt = clock), (dropHalf = halves);
      const dropped = punchMove && form && form.drop && halves === dropHalf ? clamp(1 - (clock - dropAt) / (2 / 60), 0, 1) : 1;
      let dip = 0;
      const elev = { L: 0, R: 0 };
      for (const side of ['L', 'R']) {
        const gf = GUARD.feet[side],
          k = side === 'L' ? 'lf' : 'rf',
          stepping = swing.side === side;
        let at = planted[side],
          lift = 0,
          pitch = st.flat ? 0 : (side === 'R' ? 6 : 3) * up * feetLive; // a planted foot is on its ball, the heel riding up with the float
        if (stepping) {
          // where it will come down, as a spot on the canvas: carried back with the canvas for the time still to go
          const land = landing(side),
            left = ((1 - u) * cycle) / 2,
            f = feet[side],
            // (a legend's dash is one step: the foot comes down under where the dash will have taken him, slowing as it does)
            by = dashTravel ? dashTravel(left) : null,
            to = by !== null ? [BALL[side][0] + f.fx * by, land[1], BALL[side][2] + f.fz * by] : [land[0] + f.fx * left, land[1], land[2] + f.fz * left],
            from = swing.from,
            e = u * u * u * (10 + u * (6 * u - 15)), // leaves and lands at rest
            length = Math.hypot(to[0] - from[0], to[2] - from[2]);
          swing.to = to;
          at = [from[0] + (to[0] - from[0]) * e, gf.at[1], from[2] + (to[2] - from[2]) * e];
          // (a beginner's feet come together in the middle of a step, an amateur's close and open again)
          if (st.travel.width < 1 && !swing.still && length > 0.03 && !dashing) {
            const o = planted[side === 'L' ? 'R' : 'L'],
              k = 1 - (1 - st.travel.width) * Math.sin(Math.PI * u);
            at = [o[0] + (at[0] - o[0]) * k, at[1], o[2] + (at[2] - o[2]) * k];
          }
          // travelling, a foot is lifted by its stride; on the spot it is only unweighted and snapped up off the canvas (a
          // dirty man slides his along instead)
          // (a foot only put right under a man who has stopped is skimmed back into place, not lifted: he stands on the other
          // one meanwhile, and could not for long with it high)
          // (a man knocked back skids his feet along the canvas rather than stepping: a foot in the air under a shove would leave
          // him on the other one, his weight past it)
          // (the whole of a step that a shove came in: skidding)
          swing.skid = Math.max(swing.skid || 0, view.shoved || 0);
          // (in the wave, a slide: clean.mjs)
          const slide = waveDrag(wave, side),
            drag = Math.max(slide ?? (action && action.name === 'dash' ? Math.max(st.drag, (action.level || LEVEL[3]).dash.drag) : action && action.name === 'duckIn' ? 0 : st.drag), smooth((swing.skid - 0.8) / 1.2));
          lift = (Math.min(0.075, length * 0.35) * (1 - drag) * (0.5 + 0.5 * going) + HOP * footSpot * st.hop) * Math.pow(Math.sin(Math.PI * u), 1.3) * dropped;
          pitch = st.flat ? 0 : (14 * Math.sin(TAU * u) * clamp(length / 0.2, 0, 1) * (1 - 0.6 * Math.max(st.drag, slide || 0)) + 8 * footSpot * Math.min(1, st.hop) * Math.sin(Math.PI * u)) * dropped;
        } else {
          // a foot left too far behind by a shove or a dash is dragged, not left to pull the leg straight
          const g = BALL[side],
            o = [at[0] - g[0], at[2] - g[2]],
            l = Math.hypot(o[0], o[1]),
            most = STRIDE * 1.2;
          if (l > most) (at[0] = g[0] + (o[0] * most) / l), (at[2] = g[2] + (o[1] * most) / l);
        }
        // (a dirty man's lead foot on its way onto the other man's, and on it: the bout's to say whether it got there)
        // (and it comes down on top of his, not through it to the canvas: his instep is a few centimetres up)
        if (stomp && side === 'L') {
          at = [at[0] + (stomp.to[0] - at[0]) * stomp.w, at[1], at[2] + (stomp.to[2] - at[2]) * stomp.w];
          lift = Math.max(lift, stomp.to[1] * stomp.w); // (the sole under his ball on the point aimed at, and lifted over it by the knee)
        }
        // the hips come down a little as the feet are spread (as much as a long stride asks, and no more)
        dip += Math.min(0.04, (at[0] - BALL[side][0]) ** 2 + (at[2] - BALL[side][2]) ** 2) * 0.3;
        // (the solver is told where the ankle would be with the foot flat, turned as it is now, over that ball)
        const yaw = gf.yaw + c[k + 'w'],
          back = M.app(M.ry(yaw), FOOT.ball);
        feet[side] = {
          at: [at[0] + c[k + 'x'] - back[0], gf.at[1] + c[k + 'y'] + lift, at[2] + c[k + 'z'] - back[2]],
          yaw,
          pitch: gf.pitch + c[k + 'p'] + pitch
        };
        // (rolled onto its inside edge by a blow across him: the outside edge up)
        if (edge > 0.05 && side === 'R') feet[side].roll = -edge;
        else if (edge < -0.05 && side === 'L') feet[side].roll = -edge;
        // (how far it is up off the canvas: a foot in the air carries no weight, and its knee bent folds it up under him; a
        // foot going up over his, from the start)
        elev[side] = c[k + 'y'] + lift + (stomp && side === 'L' && stomp.lift > 1e-4 ? 1 : 0);
        // (the knee turned in or out round its leg)
        if (c[side === 'L' ? 'lkx' : 'rkx']) feet[side].out = c[side === 'L' ? 'lkx' : 'rkx'];
        // (a knee put down points at the canvas, ahead: the solver stops it on it)
        feet[side].round = { was: knees[side], most: 900 * dt };
        const kneeDown = c[side === 'L' ? 'lk' : 'rk'];
        if (kneeDown > 0.001) Object.assign(feet[side], { pole: [0, -1, 0.8], poleW: clamp(kneeDown, 0, 1) });
      }

      // ---- solve
      sunk += (dip - sunk) * (1 - Math.exp(-dt * 24)); // (followed, so a foot snapping through its swing does not jerk the hips)
      let hips = [GUARD.hips[0] + c.hx, Math.max(0.15, GUARD.hips[1] + c.hy - sunk), GUARD.hips[2] + c.hz];
      const spine = trunk(c, gaze);
      /* (the lead shoulder shrugged up, the chin behind it: the collarbone turned up about the line ahead of him, so far that
         the shoulder rises so many metres, and a little forward with it: show.mjs) */
      if (shrug > 1e-4) spine.LeftShoulder = [0, -SHRUG.ahead * (shrug / SHRUG.most), (Math.asin(clamp(shrug / SHRUG.arm, 0, 0.9)) * 180) / Math.PI];
      // (the knees: the hips brought down over the planted feet as far as they say, a foot in the air folded up)
      /* (what a legend's going bends the knees by is a bend of the leg he stands on: a foot in the air is not folded up by it,
         legend.mjs) */
      /* (followed, so that a foot coming down onto a bent leg lets the hips down onto it over a tenth of a second, not in the
         frame it touches) */
      if (st.legend) for (const side of ['L', 'R']) legend.air[side] += (smooth((elev[side] - KNEE.air[0]) / KNEE.air[1]) - legend.air[side]) * (1 - Math.exp(-dt * 14));
      const kf = st.legend ? { L: c.lkf - legend.k.L * legend.air.L, R: c.rkf - legend.k.R * legend.air.R } : { L: c.lkf, R: c.rkf };
      if (kf.L || kf.R) hips = bend(hips, spine, feet, kf, elev);
      /* the hands go where the head goes: a guard is held to the face, not to the room (but only so far where a blow throws
         the head, SNAP: the gloves are on the arms, which are not thrown with it, and are knocked about by it on their own) */
      const head = Math.abs(snap.hp) + Math.abs(snap.hw) + Math.abs(snap.hr) > 0.01 ? headOf(hips, trunk(Object.assign({}, c, { hp: c.hp - snap.hp * SNAP, hw: c.hw - snap.hw * SNAP, hr: c.hr - snap.hr * SNAP }), gaze)) : headOf(hips, spine),
        carried = M.sub(head, REST),
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
      /* (a show-off's lead hand going for the other man's glove, to push his guard out of the way: show.mjs, paw; the target
         is where it will be drawn, so put back through his stretch as the punch's is) */
      /* (once it has met his glove, it goes with the glove it pushes, from where it met it, not after his glove as his body
         carries it about: game/bout.mjs, paws) */
      let pawAt = null;
      if (punchMove && action.pawed && view.foe && view.foe.glove) {
        if (!action.pawed.mine) action.pawed.mine = { at: view.foe.glove[PAW.glove[action.variant]].slice(), t: action.t };
        const m = action.pawed.mine,
          k = smooth((action.t - m.t) / 0.06),
          d = action.pawed.push || [0, 0];
        pawAt = [m.at[0] + d[0] * k, m.at[1] + d[1] * k, m.at[2]];
      }
      const pawing = punchMove && action.variant && (action.variant === 'pawDown' || action.variant === 'pawUp') && view.foe && view.foe.glove ? paw(action.variant, action.t, pawAt || view.foe.glove[PAW.glove[action.variant]]) : null;
      /* (it lets go as the hips fire the punch that follows: no shoulder holds a hand out across him while the trunk turns
         under it; the glove it has pushed stays where it is pushed a while on its own, game/bout.mjs) */
      if (pawing) pawing.w *= 1 - smooth(clamp(action.chain.q[1] * 2, 0, 1));
      // (its elbow up and out, over the top of his guard or under it)
      if (pawing) c.le += PAW.elbow[action.variant] * pawing.w;
      /* (or round his head to the back of his neck, the elbow up, and off it a moment after the uppercut lands: show.mjs) */
      let collaring = null;
      if (punchMove && action.variant === 'collar' && view.foe && view.foe.nape) {
        collaring = collar(action.t, view.foe);
        const lands = action.chain.thrownAt >= 0 ? action.chain.t - action.chain.thrownAt : -1;
        if (lands >= 0) collaring.w *= 1 - smooth((lands - COLLAR.let[Math.max(0, (form.dirty || 1) - 1)]) / 0.1);
        c.le += 0.9 * collaring.w;
      }
      const reach = pawing || collaring;
      // (the elbow lifted for it, a great dirty fighter's in the open; a legend's fist drawn back across as if from a miss)
      if (punchMove && action.variant === 'elbow') {
        const n = Math.max(0, (form.dirty || 1) - 1),
          go = smooth(clamp(action.chain.q[3], 0, 1));
        c.re += ELBOW.raise[n] * go;
        c.rx += ELBOW.draw[n] * go;
      }
      for (const side of ['L', 'R']) {
        const k = side === 'L' ? 'l' : 'r',
          s = side === 'L' ? 1 : -1,
          flare = clamp(c[k + 'e'], 0, 1),
          open = M.add(GUARD.hands[side], [c[k + 'x'], c[k + 'y'], c[k + 'z']]),
          // held to the face, or locked to the chest and swung with it, or part way between
          // (or put on the canvas: where its channels say, in the room)
          kept = M.lerp(M.lerp(M.add(open, carried), M.add(chest.p, M.app(swung, M.sub(open, CHEST.p))), clamp(c[k + 'c'], 0, 1)), open, clamp(c[k + 'g'], 0, 1)),
          free = reach && side === 'L' && reach.w > 0 ? M.lerp(kept, [reach.to[0] * wide, reach.to[1] / tall, reach.to[2] * wide], reach.w) : kept,
          mine = punchMove && punchMove.hand === side ? punchMove : null;
        if (mine) {
          /* The punching arm is not sent anywhere: it is thrown. The shoulder and elbow are the last two joints of the
             chain, and where the fist is follows from how far each has turned, on top of wherever the body has carried the
             shoulder by then. */
          const chain = action.chain,
            shoulder = M.add(chest.p, M.app(chest.R, M.sub(TPOSE[(side === 'L' ? 'Left' : 'Right') + 'Arm'], TPOSE.Chest))),
            swingQ = clamp(chain.q[3], 0, 1.06),
            // (a show-off's elbow: the arm only part straightened, the bent elbow coming on behind the fist: show.mjs)
            elbowed = action.variant === 'elbow' ? Math.max(0, (form.dirty || 1) - 1) : -1,
            extend = clamp(chain.q[4], 0, 1.05) * (elbowed >= 0 ? ELBOW.extend[elbowed] : 1);
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
            /* A hook's locked arm is raised to the target's height as he winds up, and as the legs drive it is sent out as far
               from the turning body as the middle of the head is and held round to the side it comes from as far as the turn
               still to come will carry it by the time the trunk is `land` of the way round (the legs, the rest of the hips',
               and that much of the trunk's, less the wind-up the body has still to unwind): so the turn itself brings the
               fist onto the head, with the trunk's turn behind it, and it lands on its sweep, going the way the hook goes.
               The shoulder closes nothing: a hook that finds no head goes on round with the body and stops with it, and does
               not come back for a head that has gone under it. Neither the reach nor the angle comes in the wind-up: from
               the guard the reach would take it out through his face, and the angle, on a wound-up arm, would turn the upper
               arm past its range. (Anything else bent and locked, an uppercut, is lifted by the body and its shoulder closes
               the last of it onto the target.) */
            if (target && mine.arm === 'swing') {
              const drove = smooth(clamp(chain.q[0], 0, 1)),
                // (an inside hook's is raised only as the legs drive, late in it: right up close, a glove raised from the guard is in
                // his face, and one raised high before the body turns under it takes the upper arm up past where it can go)
                set = mine.tight ? drove * drove : smooth(clamp(Math.max(chain.coil.q, chain.q[0]), 0, 1)),
                ring = [to[0] - s * 0.05, to[1] + 0.03, to[2] + 0.1],
                amp = chain.amp || [1, 1, 1, 1, 1],
                wound = ((mine.coil.yaw || 0) + (mine.coil.twist || 0)) * chain.coil.q,
                still = mine.links.hips.yaw * amp[1] * (1 - chain.q[1]) + mine.links.trunk.twist * amp[2] * ((mine.land ?? 1) - chain.q[2]) - wound,
                round = p => (Math.atan2(p[0] - chest.p[0], p[2] - chest.p[2]) * 180) / Math.PI,
                wrap = a => ((((a + 180) % 360) + 360) % 360) - 180,
                // (and never further round than a shoulder can hold it: `most` degrees, and, close in, `ahead` degrees off the
                // front of the chest)
                facing = round(M.add(chest.p, M.app(chest.R, [0, 0, 1]))),
                most = Math.min(mine.most || 70, mine.ahead ? s * wrap(facing + s * mine.ahead - round(free)) : Infinity),
                back = clamp(s * wrap(round(ring) - still - round(free)), -10, Math.max(-10, most)) * s;
              /* (and taken round no faster than so many degrees a second: a quick man's legs drive in a frame or two, and a fist
                 flung out to the side that fast and straight back in would snap) */
              const want = back * drove,
                fastest = HOLD_ROUND * dt,
                was = held[side] === null || chain.t <= dt + 1e-9 ? 0 : held[side];
              held[side] = s * (want - was) > fastest ? was + s * fastest : want;
              thrown = sweep(free, ring, chest.p, drove, set, held[side]);
            } else {
              // (an inside uppercut's hand is taken in under the target as the legs drive, so the last of its way is straight up)
              const under = target && mine.under ? smooth(clamp(chain.q[0], 0, 1)) : 0;
              // (under it and a little short of it, in front of his chest: it comes up in front of him, not through him)
              const uz = to[2] - (mine.under || 0);
              thrown = M.lerp([free[0] + (to[0] - free[0]) * under, free[1], free[2] + (uz - free[2]) * under], to, swingQ);
            }
            // (bent is bent: a hook thrown from too far away does not grow into a straight punch to get there)
            const out = M.sub(thrown, shoulder),
              far = Math.hypot(out[0], out[1], out[2]);
            const most = mine.bent || BENT;
            if (far > most) {
              /* (an inside uppercut's hand kept under the target is let up, not drawn back, as far as the bent arm needs: so
                 that it still comes straight up) */
              const flat = Math.hypot(out[0], out[2]);
              if (mine.under && target && flat < most * 0.98 && out[1] < 0) thrown = [thrown[0], shoulder[1] - Math.sqrt(most * most - flat * flat), thrown[2]];
              else thrown = M.add(shoulder, M.scale(out, most / far));
            }
          }
          if (extra[side]) thrown = M.add(thrown, extra[side]);
          steer[side] = M.sub(thrown, free);
        } else {
          // a hand whose punch has been cut short by the next one is let back to its guard, not dropped there
          const k = Math.exp(-dt * 18);
          steer[side] = M.scale(steer[side], k);
          // (but an arm pressed down is held where it was met, not where its punch was going: clean.mjs pattedArm)
          if (action && action.name === 'patted' && (action.hand === 'R' ? 'R' : 'L') === side) steer[side] = [0, 0, 0];
        }
        /* Where the elbow points is asked for, not ordered: it leans toward where the move wants it from where it was, so an
           arm passing through a pose with no good answer (a wrist crossing its own shoulder) cannot flip over in a frame. */
        /* (a hand pushing on the canvas, put there in the room and down on it, has its elbow back and out behind it: the arm
           that props or pushes him up) */
        /* (and a show-off's lead hand let down to his waist hangs from an elbow by his side, the forearm out in front: show.mjs) */
        const pushing = clamp(c[k + 'g'], 0, 1) * (1 - smooth((free[1] - 0.25) / 0.2)),
          hang = side === 'L' && st.show ? showDown : 0,
          // (and a cross-arm guard: each elbow where it puts it, as the chest sees it: show.mjs)
          crossed = shape && crossK > 0.002 ? crossK : 0,
          asked = M.app(chest.R, M.lerp(M.lerp(M.lerp([s * (0.5 + 0.8 * flare), -1 + 1.3 * flare, -0.2 - 0.25 * flare], [s * 0.45, -0.35, -0.85], pushing), [s * 0.15, -1, -0.2], hang), crossed ? shape.pole[side] : [0, 0, 0], crossed)),
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
        // (and it goes round the arm no faster than an elbow can, 1200 degrees a second, and the shoulder swings it no faster
        // than 900)
        hands[side] = { at, toward: M.lerp(M.scale(asked, 1 / l), elbow[side] || [0, 0, 0], keep), round: { was: round[side], most: 1200 * dt }, shoulder: { was: arm[side], most: 900 * dt }, last: wrist[side], punch: !!mine && (action.chain.phase === 'coil' || action.chain.phase === 'throw'), locked: !!mine && mine.arm === 'swing' };
      }
      let stance = { hips, spine, feet, hands, stretch: 1 + c.st };
      if (rising && action && rising.id === id) {
        const w = smooth(action.t / rising.blend);
        if (w < 1) stance = blendStance(rising.rest, stance, w);
        else rising = null;
      } else if (rising && rising.id !== null) rising = null;
      let pose = solve(stance);
      {
        const want = centre(pose)[1];
        if (!height || dt <= 0) height = { y: want, v: 0, want, vt: 0 };
        else {
          /* (what is asked is followed exactly while he can do it; once he cannot, he goes as hard as he can, and comes
             back onto it smoothly, as a spring does, rather than as hard again the other way; and never faster toward it
             than he could stop at it, if it stopped now) */
          const vt = (want - height.want) / dt,
            at = (vt - height.vt) / dt,
            e = want - height.y,
            W = FALL.back,
            most = e >= 0 ? Math.sqrt(2 * FALL.down * e + Math.max(vt, 0) ** 2) : -Math.sqrt(2 * FALL.brake * -e + Math.min(vt, 0) ** 2);
          // (on it, the spring has nothing to do and he goes exactly where it is asked)
          let a = at + W * W * (height.want - height.y) + 2 * W * (height.vt - height.v);
          if (e >= 0 && height.v + a * dt > most) a = (most - height.v) / dt;
          if (e < 0 && height.v + a * dt < most) a = (most - height.v) / dt;
          a = clamp(a, -FALL.down, FALL.up);
          height.v += a * dt;
          height.y += height.v * dt;
          height.want = want;
          height.vt = vt;
          /* (where he cannot do what is asked, his hips carry the difference, and all of him that goes with them: the hips
             move the centre of mass by about 0.85 of their own travel, the legs staying where they are, and by what it
             turns out to be, the second time) */
          const off = height.y - want;
          if (Math.abs(off) > 2e-4) {
            const shifted = h => {
              const by = [0, h / (1 + c.st), 0],
                moved = {};
              for (const side of ['L', 'R']) moved[side] = Object.assign({}, stance.hands[side], { at: M.add(stance.hands[side].at, by) });
              return solve(Object.assign({}, stance, { hips: M.add(stance.hips, by), hands: moved }));
            };
            let h = off / 0.85;
            pose = shifted(h);
            const got = centre(pose)[1] - want;
            if (Math.abs(got - off) > 2e-4 && Math.abs(got) > 1e-5) (h *= clamp(off / got, 0.5, 2)), (pose = shifted(h));
          }
        }
      }
      if (rising && action && rising.id === id && action.t < UNLIE) pose = between(rising.pose, pose, smooth(action.t / UNLIE));
      /* (the bones turned part of the way from how he lay can put a foot or a hand through the canvas: the canvas holds him up,
         the whole of him lifted by as much as goes through, and let down again gently once nothing does) */
      if (action && MOVES[action.name].floor) {
        const k = pose.stretch || 1,
          through = Math.max(0, ...ON_CANVAS.map(([j, r]) => r - pose.at[j][1] * k));
        propped = Math.max(through, propped - 0.15 * dt);
        if (propped > 1e-4) {
          const up = propped / k;
          pose.root = M.add(pose.root, [0, up, 0]);
          for (const j in pose.at) pose.at[j] = M.add(pose.at[j], [0, up, 0]);
          if (pose.head) pose.head = M.add(pose.head, [0, up, 0]);
        }
      } else propped = 0;
      for (const [side, Side] of [['L', 'Left'], ['R', 'Right']]) {
        const d = M.sub(pose.at[Side + 'ForeArm'], pose.at[Side + 'Arm']),
          l = Math.hypot(d[0], d[1], d[2]) || 1;
        elbow[side] = M.scale(d, 1 / l);
        round[side] = pose.round[side];
        arm[side] = pose.arms ? pose.arms[side] : null;
        wrist[side] = pose.at[Side + 'Hand'];
        knees[side] = pose.knees ? pose.knees[side] : null;
      }
      return remember(pose);
    }
  };
}
