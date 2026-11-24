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
               guard it takes on, if he holds none), out (seconds since the roll & counter went out of it) } | null
               (show.mjs),
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
import { FOOT, HEAD, RADIUS, RANGE, GLOVE, shoulderOf, gloveInArm } from '../rig/body.mjs';
import { LINKS, stepChain } from '../phys/chain.mjs';
import { CHANNELS, GUARD, MOVES, LEFT_BEND, LIE, UP, sampleMove, mirrorKnees } from './moves.mjs';
import { LEVEL } from './skill.mjs';
import { H, headAt, headTo, phraseX, PHRASE, FLOURISH, CLEAN, DIRTY, dice } from './stance.mjs';
import { sampleEvade, EVASIONS, timeline, evadeTime, pullBack, pullIn } from './evade.mjs';
import { travel as legendTravel, dash as legendDash, dashShape } from './legend.mjs';
import { stance as showStance, crossGuard, ear, shoulderRoll, hammer, paw, PAW, collar, COLLAR, ELBOW } from './show.mjs';
import { bodyState, struck as foldUp, give as bodyGive, coverLow, lower } from './body.mjs';
import { createWave, waveBeat, waveLand, waveLanding, waveDrag, waveBody, createPat, patDown, pattedArm, fireBody, createShell, shellBody } from './clean.mjs';
import { createShift, shiftHold, shiftFoot, shiftBody } from './shift.mjs';
import { overBody, overHand, overRaise, overElbow, hisArm, hisNext, ROUND } from './over.mjs';

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
/* Rocked (strike: a blow that stopped him long enough, or one more on a man already hurt), his legs gone for a second or so
   (docs/moves-plan-6.md §3.5 N24): `last` seconds for it to wear off (to a third), `onset` for it to come on. At its worst:
     gloves  both down `glove` metres, as they were, where the move puts them; and past that his arms hang from the
             shoulders, the lead the heavier: each upper arm let down `droop` degrees about the line across his chest and
             its elbow opened as far again by half (lead, rear), over `drooped` seconds from the blow, and let go of in
             `quick` by a hand that throws. That is done to the solved arm, in the shoulder's and the elbow's own terms,
             not to where the hand is sent (rockedArms, below): a guard's wrist is sent nearer its shoulder than the arm
             folds, and sent a little lower as the blow threw his head and trunk back, the solver's answer for the
             shoulder jumped (the lead glove 30 cm in a frame, the upper arm's plane from 13 to -104 degrees)
     arms    and they are slow: while he is rocked at all (`slowed` of it and up), the upper arm of a hand that is not
             throwing turns on its shoulder, and the forearm on its elbow, no faster than `slow` degrees a second from
             how they were drawn last, and come to rest softly (`follow` of what is left a second: rockedArms, below). A
             struck man's guard is where the solver's answer for an arm is least sure, his head and trunk thrown back onto
             his wrists, and whatever is added to him then, a deeper sway as much as a sagging glove, can tip it into
             another answer in a frame; a man with his legs gone does not whip an arm round in a sixtieth of a second
             (and the solver's keeping a glove out of his other arm reaches the drawn arm as slowly: what the pose says
             of that push is the push followed the same way, rockedArms). An arm let go of, its hand throwing or he over
             it, is the solver's and how it was off the solver's, that let out `caught` times as fast, in three frames or
             so, before it is the solver's again. And an arm drawn so goes round his own head and his trunk: wherever
             its glove would be more than `own` metres in either (the audit holds each to 0.02) and deeper than the
             solver's own has it, it is turned on its shoulder by what takes it out. The solver keeps his gloves out of
             them, and a head rolling onto a glove that is slow to follow it was in it, 9 cm at worst (11 an arm let
             go of), in 100 frames of 32 bouts. His other arm likewise, by the arm of the two the solver would have give,
             and no faster than `slow` (both arms taken toward the solver's until the glove was out, they jumped 16 to
             29 cm in a frame); and the other man's body, past `him` metres (the audit holds a glove to 0.08 in him: this
             is read before his hips are let carry what he cannot do, and of the other man as he will be drawn, so with
             3 cm to spare) and deeper than the solver's own glove is in him, or his elbow in the other man's glove:
             hanging back from a blow, a slowed glove was in him where the solver's was not in 110 frames of 32 bouts
             (27 so, and 41 in the bouts as they go now; of the 27 most were a punch's forearm coming through his guard
             faster than a frame's reading of it foresees, and the frames a landed blow is held at); kept out of him
             only on his feet, not going down or getting up. Slowed from `slowed` of rocked and up, a rocked man's arms
             are slow for about 4 s after each rocking, in 29% of the time men fight (192 matches between the computer's
             men): he blocks 0.385 of what reaches him rocked, against 0.414 before, about 7% less
     head    rolling `roll` degrees either way, after the trunk (`lag` radians behind its sway), the chin down `chin`; his eyes
             only `look` of the way on the other man (his grade's is 0.9: anim/skill.mjs, look). (The plan's 18 degrees, as it wears off over
             `last`, rolls the head through 24 degrees in all in the first second and a half; 24 rolls it through 32.) The
             roll comes on over `rolled` seconds from the blow, when the blow's own snap of his head is spent: on top of
             that from the first frame, three frames after a 118 N·s cross, his neck was tilted 45.6 degrees, 0.6 past
             what a neck tilts (1 frame of 32 bouts; 38.8 without the roll)
     knees   each giving `knee` degrees (7 to 22, and the step that catches him on top), the two a quarter of a second apart,
             turned in `in` degrees (the plan's 8 to 26, and 8 to 24, put a struck man walking back in over one foot past the
             audit's 0.3 s in blockFire@5m: tests/audit.test.mjs); each the less, to not at all, as it comes within `room`
             of the other man's shins and feet (kneeRoom)
     trunk   swaying `side` degrees from side to side over them, the waist turning `waist` degrees against it (the chest loose
             on the pelvis), the hips going `hips` metres out the other way under it
     feet    every `every` seconds a step out to catch him (`brace`: the foot on the side he is swaying to, `d` metres out to
             that side and a little back, lifted `lift` metres and put down over `time` seconds; a foot already out is brought
             back under him instead), from `from` of it and up, and not while a blow is knocking him back (faster than
             `shoved` m/s: his feet are stepping back already) nor while he throws a punch; brought back under him once he
             has got over it
   His head itself goes only a little way: a rocked man is there to be hit, not harder to find. */
const WOBBLE = {
  last: 1.3,
  onset: 0.1,
  glove: 0.14,
  droop: { L: 9, R: 4 },
  drooped: 0.3,
  quick: 0.1,
  slow: 600,
  follow: 20,
  caught: 3,
  own: 0.01,
  him: 0.05,
  slowed: 0.02,
  roll: 24,
  rolled: 0.2,
  lag: 1.4,
  chin: 16,
  look: 0.5,
  knee: [7, 15],
  in: 14,
  room: [0.12, 0.3, 0.1],
  side: 9,
  waist: 6,
  hips: 0.04,
  brace: { every: 0.9, first: 0.3, from: 0.25, d: [0.08, 0.12], lift: 0.035, time: 0.22, out: 0.06, shoved: 0.05 }
};
/* Being hit (strike): the whole of him takes the blow's vector, the head first and the rest after it, down the body: the
   trunk `trunk` seconds after the head, the hips `hips` after, the feet `feet` after. Amounts are for `ref` newton-seconds
   (a clean cross) and go with the impulse (the bout caps it at 110), each a velocity given to a spring that is let go of as
   it always was (so a harder blow is longer getting over). Of the trunk's turn, `waist` is the waist's (Spine1, turned on
   the pelvis), `waisted` seconds after the head, between the chest and the hips (docs/moves-plan-6.md §1.5):
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
const HIT = { ref: 85, trunk: 0.03, waist: 1 / 3, waisted: 0.038, hips: 0.045, feet: 0.06, lean: 27, ext: 0.3, side: 11, give: [26.6, 20], hz: 1.25, toes: 360, hx: 0.85, edge: 260, lift: { knee: 0.04, most: 0.055, push: 0.045, free: 0.02, heel: 330 }, mass: 75, shove: 2.2 };
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
/* (the waist, the disc between the pelvis and the chest (Spine1), turns on the pelvis past 16 degrees less and less, never
   past 22: three inside the body's range for it (rig/body.mjs: RANGE.waistTwist), as a knockdown's fall holds it
   (phys/fall.mjs: LIM.waist); and the spine's whole twist above is the waist's and the chest's together: where the two would
   go past it, the chest gives first) */
const WAIST = { knee: RANGE.waistTwist - 9, most: RANGE.waistTwist - 3 };
const soft = (x, { knee, most }) => (Math.abs(x) <= knee ? x : Math.sign(x) * (knee + (most - knee) * Math.tanh((Math.abs(x) - knee) / (most - knee))));
function trunk(c, gaze) {
  const lean = GUARD.lean + c.lean,
    yaw = GUARD.yaw + c.yaw,
    waist = soft(c.waist || 0, WAIST),
    twist = soft(GUARD.twist + c.twist + waist, TWIST) - waist,
    look = soft(2 * (-(GUARD.yaw + GUARD.twist) * 0.45 - (c.yaw + waist + twist - GUARD.twist) * (gaze ?? 0.9) * 0.5 + c.hw * 0.5), NECK) / 2;
  return {
    Hips: [lean * 0.4 + c.tip, yaw, -c.side * 0.4],
    Spine1: [0, waist, 0],
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
/* how fast a hand is put off where it is sent, or let back, to keep its glove out of his other arm, and how much faster that
   may move its glove (solve.mjs): metres a second, under 4 cm a frame */
const APART = 2.2;
// (the bottom of an inside uppercut's U kept this far in front of the other man's elbow where that elbow is in the way: clearOf)
const CLEAR = 0.08;
/* Where the other man's elbow is, right up close, in front of this man's rear hand (no further from him than the hand is,
   and within 12 cm of it across and 25 cm below it, his elbow as he holds his guard up at 0.62 to 0.66 m): how near himself
   the bottom of the inside uppercut's U may be taken, CLEAR in front of that elbow; -Infinity where nothing is in the way.
   (Taken back toward him to the U's own bottom, the hand went down onto that elbow and into the forearm above it, 8 to 13 cm,
   a great dirty fighter's and a legend's, in the wind-up of the inside chain's uppercut at a man who guards; or, sent down
   late and fast, `downFrom`, it went across into his own lead upper arm, crossed in front of him after the inside hook, 2.5
   to 4.1 cm, and turned his upper arm 18 degrees past its range.) In his own terms, as the target is (view.foe, game/
   bout.mjs); read once, as the punch starts */
function clearOf(view, free, wide, tall) {
  const el = view.foe && view.foe.elbow;
  let z = -Infinity;
  if (el)
    for (const q of [el.L, el.R]) {
      const p = [q[0] * wide, q[1] / tall, q[2] * wide];
      if (p[2] < free[2] + 0.06 && Math.abs(p[0] - free[0]) < 0.12 && p[1] > free[1] - 0.25) z = Math.max(z, p[2] + CLEAR);
    }
  return z;
}
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

// the guard itself, standing still: the pose the boxer is sculpted and lit in (or the guard with these channels' trunk)
export const guardPose = ch => {
  return solve({
    hips: GUARD.hips,
    spine: trunk(ch ? Object.assign({}, ZERO, ch) : ZERO),
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
  for (const ch of ['lx', 'rx', 'side', 'twist', 'waist', 'yaw', 'hw', 'hr', 'hx']) if (c[ch]) c[ch] = -c[ch];
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
    approach = null, // the punching glove closing on its target: { gap, v, a }
    wentFor = null; // the cross counter that went after waiting (over.mjs)
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
  // how far up his cross-arm guard was last frame, and how much it is on its way up or down (show.mjs crossGuard)
  let crossWas = 0,
    crossUp = 0,
    crossDown = 0;
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
    apart = { L: null, R: null }, // and how far each hand was put off where it was sent, to keep it out of the other arm (solve.mjs: apart)
    knees = { L: null, R: null }, // and each knee round its leg (solve.mjs: azimuth), degrees
    // where each hand was drawn last frame and how fast it was going, and what is still owed to the move before
    hand = { L: null, R: null },
    handSpeed = { L: [0, 0, 0], R: [0, 0, 0] },
    handCarry = { L: { x: [0, 0, 0], v: [0, 0, 0] }, R: { x: [0, 0, 0], v: [0, 0, 0] } },
    steer = { L: [0, 0, 0], R: [0, 0, 0] }, // how far each hand is being carried off its punch's nominal line onto the target
    held = { L: null, R: null }; // how far round to its side a hook's fist is held, degrees (see sweep)
  // the give of a struck body: head (nod, turn, tilt), trunk (lean, side, turn), and how far the guard is knocked open
  // (and the rest of him: the hips back and across, the lead toes up, a foot rolled onto an edge, the knees taking him)
  const give = { hp: { x: 0, v: 0 }, hw: { x: 0, v: 0 }, hr: { x: 0, v: 0 }, lean: { x: 0, v: 0 }, side: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, waist: { x: 0, v: 0 }, open: { x: 0, v: 0 }, sink: { x: 0, v: 0 }, hz: { x: 0, v: 0 }, hx: { x: 0, v: 0 }, toes: { x: 0, v: 0 }, edge: { x: 0, v: 0 }, settle: { x: 0, v: 0 } };
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
  const wobble = { amount: 0, t: 9, now: 0 };
  // the feet he has put out to catch himself, rocked (WOBBLE.brace): how far each is out ([across, ahead] metres), the step
  // under way, and how long until the next
  const brace = { L: [0, 0], R: [0, 0], move: null, next: 0 };
  // how far each arm hangs from its shoulder, rocked (WOBBLE.droop): 0..1
  const droop = { L: 0, R: 0 };
  // his arms as they were last drawn, slowed, rocked (WOBBLE.slow): each { arm, fore (their turns), push (of its glove, as
  // said of it), own, pushed (the solver's own turns and push then), at (when) } or null
  // (and on: which are slowed this frame; drawn: how each is drawn this frame, once it has been worked out)
  // (and pushed: what is said of each drawn arm's glove being kept out of his other arm, where that is not the solver's own)
  const slow = { L: null, R: null, on: { L: false, R: false }, drawn: null, pushed: { L: null, R: null } };
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
  // (the peek-a-boo shell he is crouched in, and how far: clean.mjs)
  const shell = createShell();
  let shelled = 0;
  // (the Tyson shift he is in: his feet are its, shift.mjs; and where each ball of his feet was drawn last frame)
  const shift = createShift(),
    drawn = { L: null, R: null };
  const remember = pose => ((poses = [poses[1], pose]), pose);
  /* (how much of a rocked man's knees' giving and turning in each knee has room for (WOBBLE.room): in close, his knee bent and
     turned in so went into the other man's shin or foot, his lead knee 5 to 10 cm into the other's for 20 frames of 32
     bouts; nearer them than room[1] metres, as he was last drawn, it gives the less, and not at all nearer than room[0],
     come to over room[2] seconds, so that it does not go back and forth) */
  const kneeGive = { Left: 1, Right: 1 };
  const kneeRoom = (dt, foe) => {
    const last = poses[1],
      body = foe && foe.body,
      R = WOBBLE.room;
    for (const S of ['Left', 'Right']) {
      let d = Infinity;
      if (last && last.at && body) for (const [j, p] of body) if (/Shin|Foot/.test(j)) d = Math.min(d, Math.hypot(...M.sub(last.at[S + 'Shin'], p)));
      const want = smooth((d - R[0]) / (R[1] - R[0]));
      kneeGive[S] += (want - kneeGive[S]) * Math.min(1, dt / R[2]);
    }
    return kneeGive;
  };
  // a pose part of the way from another to it, each bone turned part of the way (what the solver said of it kept)
  const between = (from, to, w) => {
    const out = Object.assign({}, to, { root: M.lerp(from.root, to.root, w), rot: {} });
    for (const name in to.rot) out.rot[name] = from.rot[name] ? Q.toM3(Q.slerp(Q.fromM3(from.rot[name]), Q.fromM3(to.rot[name]), w)) : to.rot[name];
    const F = fk(out);
    out.at = F.p;
    out.head = M.add(F.p.Head, M.app(F.R.Head, HEAD));
    return out;
  };

  /* A rocked man's arms (WOBBLE): slow, and hanging from his shoulders. The solved pose with, for each hand that is slowed
     (slow.on), the upper arm and the forearm turned toward how the solver has them from how they were drawn last frame, each
     on its own joint, by `follow` of what is left a second and no faster than `slow`; and then, by k.L and k.R of
     WOBBLE.droop, each upper arm turned down about the line across his chest, the hand going down in front of him and the
     elbow back, and the elbow opened. So the arm goes on from where it was drawn, wherever the solver has gone, and nothing
     added to a rocked man can make it jump. Where that would put the upper arm outside what the shoulder lets it be
     (rig/body.mjs: SHOULDER, a degree inside), it goes round by the nearest the shoulder does let it be (letBe), and hangs
     from there less far, until it does not; the solver's own arm is inside it, and only an arm that cannot be brought in
     so is slowed less; and one whose glove would be in his own head, trunk or other arm goes round it (WOBBLE.own). An arm not drawn so last frame
     is as the solver has it; one let go of is the solver's and how it was off it, that let out first (WOBBLE.caught). */
  const ARMS = [['L', 'Left', 1], ['R', 'Right', -1]];
  const hung = (pose, F, Side, s, rot, deg) => {
    // (about the chest's own x, as the upper arm's parent sees it)
    const up = F.R[Side + 'Shoulder'],
      across = M.mul(M.tr(up), M.mul(F.R.Chest, M.mul(M.rx(deg), M.mul(M.tr(F.R.Chest), up))));
    return { arm: M.mul(across, rot.arm), fore: M.mul(rot.fore, M.ry(s * deg * 1.5)) };
  };
  // (the upper arm, its forearm bending so, read against what the shoulder lets it be: as the chest sees them, mirrored onto
  // the left, a degree inside)
  const shoulder = (F, Side, s, rot) => {
    const R = M.mul(M.tr(F.R.Chest), M.mul(F.R[Side + 'Shoulder'], rot.arm)),
      Rf = M.mul(R, rot.fore);
    return shoulderOf([M.col(R, 0)[0], M.col(R, 0)[1] * s, M.col(R, 0)[2] * s], [M.col(Rf, 0)[0], M.col(Rf, 0)[1] * s, M.col(Rf, 0)[2] * s], 1);
  };
  const shouldered = (F, Side, s, rot) => {
    const sh = shoulder(F, Side, s, rot);
    return sh.zone <= 0 && sh.turned <= 0;
  };
  /* (an arm the shoulder does not let be so, brought to the nearest it does: let down toward hanging by as far as it is
     raised past the most of its plane, and turned about itself by as far as it is turned past what it may be, and again
     while that leaves either. As little as it is outside, so little it is moved: nothing jumps. Null where four goes at it
     do not bring it in) */
  const letBe = (F, Side, s, rot) => {
    const up = M.mul(M.tr(F.R.Chest), F.R[Side + 'Shoulder']);
    let at = rot;
    for (let i = 0; i < 4; i++) {
      const sh = shoulder(F, Side, s, at);
      if (sh.zone <= 0 && sh.turned <= 0) return at;
      if (sh.zone > 0) {
        const d = M.scale(M.col(M.mul(up, at.arm), 0), s),
          l = Math.hypot(d[0], d[2]); // (about d x his chest's own down)
        if (l > 1e-6) {
          const h = ((sh.zone + 0.2) * M.RAD) / 2,
            turn = Q.toM3([(d[2] / l) * Math.sin(h), 0, (-d[0] / l) * Math.sin(h), Math.cos(h)]);
          at = { arm: M.mul(M.tr(up), M.mul(turn, M.mul(up, at.arm))), fore: at.fore };
        }
      }
      if (sh.turned > 0) {
        const one = { arm: M.mul(at.arm, M.rx(sh.turned + 0.2)), fore: at.fore },
          other = { arm: M.mul(at.arm, M.rx(-sh.turned - 0.2)), fore: at.fore };
        at = shoulder(F, Side, s, one).turned <= shoulder(F, Side, s, other).turned ? one : other;
      }
    }
    return shouldered(F, Side, s, at) ? at : null;
  };
  // (an arm part of the way from one to another: both its turns, the short way)
  const blend = (x, y, t) => ({ arm: Q.toM3(Q.slerp(Q.fromM3(x.arm), Q.fromM3(y.arm), t)), fore: Q.toM3(Q.slerp(Q.fromM3(x.fore), Q.fromM3(y.fore), t)) });
  /* (each glove in his own head, in his trunk and in his other arm, his arms turned so, as the audit measures them
     (audit.mjs: measure; a glove held at the cheek or against the chest is not in it): for the left and the right, { head,
     trunk (how deep, metres), g (the glove), at (its shoulder), out (the way out of each, from its middle to the glove),
     arm (it in his other arm: rig/body.mjs, gloveInArm) }) */
  const inHimself = (pose, arms) => {
    const rot = Object.assign({}, pose.rot);
    for (const [side, Side] of ARMS) (rot[Side + 'Arm'] = arms[side].arm), (rot[Side + 'ForeArm'] = arms[side].fore);
    const P = fk(Object.assign({}, pose, { rot })).p,
      trunk = M.sub(P.Chest, P.Hips);
    return ARMS.map(([, Side]) => {
      const Other = Side === 'Left' ? 'Right' : 'Left',
        along = M.sub(P[Side + 'Hand'], P[Side + 'ForeArm']),
        g = M.add(P[Side + 'Hand'], M.scale(along, GLOVE.ahead / (Math.hypot(...along) || 1))),
        by = M.sub(g, P.Hips),
        k = clamp((by[0] * trunk[0] + by[1] * trunk[1] + by[2] * trunk[2]) / (trunk[0] * trunk[0] + trunk[1] * trunk[1] + trunk[2] * trunk[2]), 0, 1),
        out = [M.sub(g, pose.head), M.sub(g, M.add(P.Hips, M.scale(trunk, k)))];
      return { g, at: P[Side + 'Arm'], out, head: RADIUS.glove + RADIUS.head - Math.hypot(...out[0]) - 0.08, trunk: RADIUS.glove + RADIUS.Chest - Math.hypot(...out[1]) - 0.07, arm: gloveInArm(g, P[Other + 'Arm'], P[Other + 'ForeArm'], P[Other + 'Hand']) };
    });
  };
  /* (how deep each glove of his is in the other man, and his elbow in the other man's gloves, his arms turned so, as the audit
     measures them (audit.mjs: SOLID; a glove on a head or a glove is a punch landing, or a guard): for the left and the right,
     { depth (metres), p (his glove or elbow, whichever is the deeper), out (the way out, from the other man's part to it),
     at (his shoulder) }, or null where there is no other man) */
  const inHim = (pose, arms, foe) => {
    if (!foe || !foe.body) return null;
    const rot = Object.assign({}, pose.rot);
    for (const [side, Side] of ARMS) (rot[Side + 'Arm'] = arms[side].arm), (rot[Side + 'ForeArm'] = arms[side].fore);
    const P = fk(Object.assign({}, pose, { rot })).p;
    return ARMS.map(([, Side]) => {
      const along = M.sub(P[Side + 'Hand'], P[Side + 'ForeArm']),
        g = M.add(P[Side + 'Hand'], M.scale(along, GLOVE.ahead / (Math.hypot(...along) || 1))),
        best = { depth: -1, p: g, out: [0, 0, 1], at: P[Side + 'Arm'] },
        meet = (p, r, c, rc) => {
          const d = M.sub(p, c),
            l = Math.hypot(...d),
            depth = r + rc - l;
          if (depth > best.depth) Object.assign(best, { depth, p, out: l > 1e-6 ? M.scale(d, 1 / l) : [0, 0, 1] });
        };
      for (const [j, c] of foe.body) meet(g, RADIUS.glove, c, RADIUS[j.replace(/^(Left|Right)/, '')]);
      for (const c of [foe.hands.L, foe.hands.R]) meet(P[Side + 'ForeArm'], RADIUS.ForeArm, c, RADIUS.glove);
      return best;
    });
  };
  const rockedArms = (pose, k, dt, st, foe) => {
    const F = fk(pose);
    // (worked out once a frame, from the pose as it is first solved: solved again with his hips moved, his arms are drawn the same)
    if (!slow.drawn) {
      (slow.drawn = { L: null, R: null }), (slow.pushed = { L: null, R: null });
      for (const [side, Side, s] of ARMS) {
        const was = slow[side] && slow[side].at >= clock - dt * 1.5 ? slow[side] : null,
          own = { arm: pose.rot[Side + 'Arm'], fore: pose.rot[Side + 'ForeArm'] },
          deg = WOBBLE.droop[side] * k[side],
          /* (an arm let go of, its hand throwing or he over it, is not as the solver has it at once: how it is off the
             solver's is let out, `caught` times as fast, and it is the solver's again when none is left. It is the
             solver's and that, not a following of the solver's: following a hand that is thrown, it would be drawn
             half a frame behind it) */
          quick = slow.on[side] ? 1 : WOBBLE.caught,
          part = 1 - Math.exp(-WOBBLE.follow * quick * dt),
          // (what keeping its glove out of his other arm does to the glove, as the solver has the arm: its push, pose.apart)
          pushed = pose.apart && pose.apart[side] ? pose.apart[side].glove : [0, 0, 0];
        let now = own,
          left = 0;
        if (was) {
          const most = WOBBLE.slow * quick * M.RAD * dt;
          now = {};
          for (const j of ['arm', 'fore']) {
            // (how it was drawn, off the solver's own of now while it is slowed, of then once it is let go)
            const off = Q.fromM3(M.mul(was[j], M.tr(slow.on[side] ? own[j] : was.own[j]))),
              th = 2 * Math.acos(clamp(Math.abs(off[3]), 0, 1)),
              by = Math.min(most, th * part);
            now[j] = th < 1e-5 ? own[j] : M.mul(Q.toM3(Q.power(off, 1 - by / th)), own[j]);
            left = Math.max(left, th - by);
          }
        }
        /* (and that push reaches the arm as it is drawn as slowly as the arm follows the solver's: what is said of the pose
           as drawn (its apart) is the push followed so, and the solver is told its own next frame, `own`) */
        const push = was ? M.add(pushed, M.scale(M.sub(was.push, slow.on[side] ? pushed : was.pushed), 1 - part)) : pushed,
          caught = !slow.on[side] && left < 0.5 * M.RAD && Math.hypot(...M.sub(push, pushed)) < 0.001;
        if (was && !caught) slow.pushed[side] = push;
        else now = own;
        if (now !== own || deg > 1e-3) {
          /* (slowed, it is part of the way between two places the shoulder allows, and the way between them can pass
             through one it does not, an arm in a guard being turned out about as far as it goes: it goes round by the
             nearest the shoulder does allow. Taken straight to the solver's instead, it jumped as the solver's had, 40 cm
             in a frame; that is left for an arm four goes do not bring in) */
          if (now !== own && !shouldered(F, Side, s, now)) {
            const near = letBe(F, Side, s, now);
            let lo = 0,
              hi = 1;
            if (!near) for (let i = 0; i < 8; i++) shouldered(F, Side, s, blend(own, now, (lo + hi) * 0.5)) ? (lo = (lo + hi) * 0.5) : (hi = (lo + hi) * 0.5);
            now = near || blend(own, now, lo);
          }
          // (and hanging from there as far as the shoulder lets it)
          let drawn = deg > 1e-3 ? hung(pose, F, Side, s, now, deg) : now;
          if (drawn !== now && !shouldered(F, Side, s, drawn)) {
            let lo = 0,
              hi = 1;
            for (let i = 0; i < 8; i++) shouldered(F, Side, s, hung(pose, F, Side, s, now, deg * (lo + hi) * 0.5)) ? (lo = (lo + hi) * 0.5) : (hi = (lo + hi) * 0.5);
            drawn = hung(pose, F, Side, s, now, deg * lo);
          }
          slow.drawn[side] = drawn;
        }
        slow[side] = slow.on[side] || (was && !caught) ? { arm: now.arm, fore: now.fore, push: was && !caught ? push : pushed, own, pushed, at: clock } : null;
      }
      /* (and the solver keeps each glove out of his head and his trunk, which an arm drawn otherwise is not kept out of: his
         head rolls onto a glove that is slow to follow it, or the way to where the solver has gone lies through it. Where
         an arm as it is drawn has its glove deeper in either than `own`, and than the solver's own has it, it goes round:
         the whole arm turned on its shoulder, the glove straight out of what it is in, by as far as it is in it, so that
         as little as it is in, so little it is moved. Only where four goes do not bring it out, or the shoulder does not
         let it be so, is it slowed less instead: taken toward the solver's by as much as does) */
      if (slow.drawn.L || slow.drawn.R) {
        const own = { L: { arm: pose.rot.LeftArm, fore: pose.rot.LeftForeArm }, R: { arm: pose.rot.RightArm, fore: pose.rot.RightForeArm } },
          drawn = { L: slow.drawn.L || own.L, R: slow.drawn.R || own.R },
          solved = inHimself(pose, own),
          may = solved.map(o => [Math.max(o.head, WOBBLE.own) + 1e-4, Math.max(o.trunk, WOBBLE.own) + 1e-4, Math.max(o.arm.depth, WOBBLE.own) + 1e-4]),
          most = WOBBLE.slow * M.RAD * dt,
          spent = { L: 0, R: 0 };
        /* (his other arm first, which the solver keeps each glove out of too (rig/solve.mjs: keepApart) and a slowed arm is
           not kept out of: where a glove as it is drawn is deeper in his other arm as that is drawn than `own`, and than the
           solver's own glove is in the solver's own arm, a slowed arm gives, turned on its shoulder by what takes the glove
           out: the glove's own arm, its glove going the way out of the other; or the other, going the other way from under
           it. Of two slowed arms, the one the solver would have give: the glove's, unless it is met on the wrist's half of
           the forearm and its hand is the more locked to the chest. No faster than a slowed arm turns, `slow`, so that it
           takes a few frames, and nothing jumps; a hand that is throwing does not give) */
        for (let pass = 0; pass < 4; pass++) {
          let moved = false;
          ARMS.forEach(([side], n) => {
            const other = ARMS[1 - n][0],
              all = inHimself(pose, drawn),
              into = all[n].arm,
              deep = into.depth - may[n][2];
            if (deep <= 0) return;
            const can = x => slow.on[x] && !!slow[x] && spent[x] < most - 1e-4,
              mine = into.part !== 'forearm' || into.along < 0.5 || (st.hands[side].chest || 0) <= (st.hands[other].chest || 0),
              gives = can(side) && can(other) ? (mine ? side : other) : can(side) ? side : can(other) ? other : null;
            // (where neither may, an arm that only hangs, a fifth of a degree at most by then, hangs not at all: it is the solver's)
            if (!gives) {
              for (const x of [side, other]) if (slow.drawn[x] && !slow[x]) (slow.drawn[x] = null), (drawn[x] = own[x]), (moved = true);
              return;
            }
            const [, Side, s] = ARMS[gives === side ? n : 1 - n],
              up = F.R[Side + 'Shoulder'],
              r = M.sub(gives === side ? all[n].g : into.at, all[gives === side ? n : 1 - n].at),
              u = gives === side ? into.out : M.scale(into.out, -1),
              ax = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]],
              l = Math.hypot(...ax);
            if (l < 1e-6) return;
            const th = Math.min((deep + 0.002) / l, most - spent[gives]),
              turn = M.mul(M.tr(up), M.mul(Q.toM3([(ax[0] / l) * Math.sin(th / 2), (ax[1] / l) * Math.sin(th / 2), (ax[2] / l) * Math.sin(th / 2), Math.cos(th / 2)]), up)),
              turned = { arm: M.mul(turn, drawn[gives].arm), fore: drawn[gives].fore },
              a = shouldered(F, Side, s, turned) ? turned : letBe(F, Side, s, turned);
            // (only if it does take the glove further out)
            if (!a || inHimself(pose, Object.assign({}, drawn, { [gives]: a }))[n].arm.depth > into.depth - 1e-5) return;
            (slow.drawn[gives] = drawn[gives] = a), (spent[gives] += th), (moved = true);
            // (and it goes on from there)
            const now = { arm: M.mul(turn, slow[gives].arm), fore: slow[gives].fore },
              near = shouldered(F, Side, s, now) ? now : letBe(F, Side, s, now);
            if (near) (slow[gives].arm = near.arm), (slow[gives].fore = near.fore);
          });
          if (!moved) break;
        }
        /* (and the other man, whom the solver does not keep his gloves out of, but whom an arm drawn otherwise, hanging back
           from a blow, can be in where the solver's is not: where a glove as it is drawn is further in his body than `him`
           metres (the audit holds it to 0.08) and than the solver's own glove is, or his elbow in the other man's glove, the
           arm is turned on its shoulder by what takes it out, no faster than a slowed arm turns, and where that is not
           enough slowed less, as far as brings it out) */
        const solvedIn = inHim(pose, own, foe);
        if (solvedIn)
          ARMS.forEach(([side, Side, s], n) => {
            if (!slow.drawn[side] || !slow[side]) return;
            const may = Math.max(solvedIn[n].depth, WOBBLE.him) + 1e-4,
              read = a => inHim(pose, Object.assign({}, drawn, { [side]: a }), foe)[n],
              allowed = a => (shouldered(F, Side, s, a) ? a : letBe(F, Side, s, a)),
              up = F.R[Side + 'Shoulder'];
            let is = read(drawn[side]);
            if (is.depth <= may) return;
            let at = drawn[side],
              turned = M.id();
            for (let i = 0; i < 4 && is.depth > may && spent[side] < most - 1e-4; i++) {
              const r = M.sub(is.p, is.at),
                u = is.out,
                ax = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]],
                l = Math.hypot(...ax);
              if (l < 1e-6) break;
              const th = Math.min((is.depth - may + 0.002) / l, most - spent[side]),
                turn = M.mul(M.tr(up), M.mul(Q.toM3([(ax[0] / l) * Math.sin(th / 2), (ax[1] / l) * Math.sin(th / 2), (ax[2] / l) * Math.sin(th / 2), Math.cos(th / 2)]), up)),
                next = allowed({ arm: M.mul(turn, at.arm), fore: at.fore }),
                was = is.depth;
              if (!next) break;
              is = read(next);
              if (is.depth > was - 1e-5) break;
              (at = next), (turned = M.mul(turn, turned)), (spent[side] += th);
            }
            if (is.depth > may) {
              // (slowed less: toward the solver's, as far as takes it out)
              let lo = 0,
                hi = 1,
                best = own[side];
              for (let i = 0; i < 7; i++) {
                const t = (lo + hi) * 0.5,
                  a = allowed(blend(own[side], at, t));
                a && read(a).depth <= may ? ((lo = t), (best = a)) : (hi = t);
              }
              slow.drawn[side] = drawn[side] = best;
              const near = lo > 0 ? allowed(blend(own[side], { arm: M.mul(turned, slow[side].arm), fore: slow[side].fore }, lo)) || own[side] : own[side];
              (slow[side].arm = near.arm), (slow[side].fore = near.fore);
              return;
            }
            slow.drawn[side] = drawn[side] = at;
            // (and it goes on from there)
            const near = allowed({ arm: M.mul(turned, slow[side].arm), fore: slow[side].fore });
            if (near) (slow[side].arm = near.arm), (slow[side].fore = near.fore);
          });
        // (and then his head and his trunk, which come before his other arm and the other man)
        ARMS.forEach(([side, Side, s], n) => {
          if (!slow.drawn[side]) return;
          const read = a => inHimself(pose, Object.assign({}, drawn, { [side]: a }))[n],
            over = o => o.head > may[n][0] || o.trunk > may[n][1],
            allowed = a => (shouldered(F, Side, s, a) ? a : letBe(F, Side, s, a)),
            up = F.R[Side + 'Shoulder'];
          let is = read(drawn[side]);
          if (!over(is)) return;
          let at = drawn[side],
            turned = M.id();
          for (let i = 0; i < 4 && over(is); i++) {
            const which = is.head - may[n][0] > is.trunk - may[n][1] ? 0 : 1,
              deep = which ? is.trunk - may[n][1] : is.head - may[n][0],
              r = M.sub(is.g, is.at),
              u = is.out[which],
              ax = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]],
              l = Math.hypot(...ax),
              lu = Math.hypot(...u);
            if (l < 1e-6 * lu) break;
            // (about r x u, which takes the glove toward u: so far round that it is out by what it was in, and 2 mm)
            const h = Math.min(((deep + 0.002) * lu) / l, 0.25) / 2,
              turn = M.mul(M.tr(up), M.mul(Q.toM3([(ax[0] / l) * Math.sin(h), (ax[1] / l) * Math.sin(h), (ax[2] / l) * Math.sin(h), Math.cos(h)]), up));
            (at = { arm: M.mul(turn, at.arm), fore: at.fore }), (turned = M.mul(turn, turned));
            is = read(at);
          }
          const round = over(is) ? null : allowed(at);
          if (round && !over(read(round))) {
            slow.drawn[side] = drawn[side] = round;
            // (and it goes on from there)
            if (slow[side]) {
              const near = allowed({ arm: M.mul(turned, slow[side].arm), fore: slow[side].fore }) || own[side];
              (slow[side].arm = near.arm), (slow[side].fore = near.fore);
            }
            return;
          }
          let lo = 0,
            hi = 1,
            best = own[side];
          for (let i = 0; i < 7; i++) {
            const t = (lo + hi) * 0.5,
              a = allowed(blend(own[side], drawn[side], t));
            a && !over(read(a)) ? ((lo = t), (best = a)) : (hi = t);
          }
          slow.drawn[side] = drawn[side] = best;
          if (slow[side]) {
            const near = lo > 0 ? allowed(blend(own[side], slow[side], lo)) || own[side] : own[side];
            (slow[side].arm = near.arm), (slow[side].fore = near.fore);
          }
        });
      }
    }
    if (!slow.drawn.L && !slow.drawn.R && !slow.pushed.L && !slow.pushed.R) return pose;
    /* (and where the solver had his elbows and wrists, and how far it put each hand off, is kept, `own`: what it is told of
       them next frame is its own answer, not this) */
    const out = Object.assign({}, pose, { rot: Object.assign({}, pose.rot), own: {}, apart: Object.assign({}, pose.apart) });
    for (const [side, Side] of ARMS) {
      out.own[side] = { arm: pose.at[Side + 'Arm'], fore: pose.at[Side + 'ForeArm'], hand: pose.at[Side + 'Hand'], apart: pose.apart ? pose.apart[side] : null };
      if (slow.drawn[side]) (out.rot[Side + 'Arm'] = slow.drawn[side].arm), (out.rot[Side + 'ForeArm'] = slow.drawn[side].fore);
      if (slow.pushed[side]) out.apart[side] = Math.hypot(...slow.pushed[side]) > 1e-6 ? Object.assign({ at: [0, 0, 0], step: [0, 0, 0] }, pose.apart && pose.apart[side], { glove: slow.pushed[side] }) : null;
    }
    const G = fk(out);
    out.at = G.p;
    out.head = M.add(G.p.Head, M.app(G.R.Head, HEAD));
    return out;
  };
  /* His legs, meanwhile, are blended joint by joint, not by where their ends are: each thigh turned on the pelvis, each knee
     bent and each foot turned from how he lay to how the rise's own pose has them, solved from hips moved as far as these
     have been (st: the blended stance as it went to the solver, `from` as it was blended). A leg's ends moved straight are
     a target it may not reach inside its ranges (one that lay folded right up, its heel over its buttock, as the hips are
     lifted off the canvas), and the solver lets such a leg out straighter a step at a time, each a jump of its own (15 to
     35 cm in a frame); a knee bent part of the way from one angle to the other stays on its side of the leg. Each joint
     is turned the short way as it stood when the rise began, and goes on that way round whatever the rise's own pose does
     after (near half a turn apart, the short way changes sides from one frame to the next). */
  const LEG = ['Leg', 'Shin', 'Foot', 'ToeBase'];
  /* (a leg turned part of the way from one pose to another can pass through where the hip does not let it go: a thigh across
     the other leg or out behind is turned back to the edge of its range, and a knee pointing round the leg's line further
     than a hip turns the thigh is turned back to the edge of that, the rest of the leg with it, as the solver keeps a leg,
     a little inside rig/body.mjs RANGE; its way round read as the audit reads it. That is for what the blend itself does.
     Where the fall left a leg outside those to begin with (phys/fall.mjs: a knee folded right up and lying the wrong way
     round, a thigh at the end of its range), nothing is turned back at once: its range for this rise is as wide as it
     lay, and a knee lying more than `KNEE_LAIN` degrees the wrong way round is not turned back at all but comes round
     with the blend. Turned back to the nearer edge, a knee lying about opposite its range changed edges from one frame
     to the next, half a turn round the leg in a frame, 19 to 31 cm.) */
  const THIGH = { in: Math.sin((RANGE.hipIn - 3) * M.RAD), out: Math.sin((RANGE.hipOut - 3) * M.RAD), behind: Math.sin((RANGE.hipBehind - 3) * M.RAD) },
    KNEE_ROUND = [RANGE.kneeAzimuth[0] + 2, RANGE.kneeAzimuth[1] - 2],
    KNEE_LAIN = 45;
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    off3 = (v, d) => M.sub(v, M.scale(d, dot3(v, d))),
    wrap180 = a => ((((a + 180) % 360) + 360) % 360) - 180;
  // (the thigh's turn on the pelvis turned on by `a` radians about `axis`, in the pelvis's own terms)
  const turnLeg = (rot, name, axis, a) => {
    const h = a / 2,
      k = Math.sin(h) / (Math.hypot(...axis) || 1);
    rot[name] = M.mul(Q.toM3([axis[0] * k, axis[1] * k, axis[2] * k, Math.cos(h)]), rot[name]);
  };
  /* (a leg as the pelvis sees it, from its hip: the knee, the ankle, and which way the knee points round the line from hip to
     ankle, degrees, with how far off that line it is, metres: next to nothing, the way round says nothing) */
  const legOf = (pose, S) => {
    const F = fk(pose),
      back = M.tr(F.R.Hips),
      s = S === 'Left' ? 1 : -1,
      [knee, ankle] = ['Shin', 'Foot'].map(j => M.app(back, M.sub(F.p[S + j], F.p[S + 'Leg']))),
      down = unit(ankle),
      koff = off3(knee, down),
      ahead = down[2],
      front = unit(off3(Math.abs(ahead) < 0.8 ? [0, 0, 1] : [0, ahead > 0 ? 1 : -1, 0], down)),
      outward = unit(off3([s, 0, 0], down));
    // (turning about the line from hip to ankle by +a carries the front toward down x front: `way` is which way that is)
    return { knee, down, off: Math.hypot(...koff), round: Math.atan2(dot3(koff, outward), dot3(koff, front)) / M.RAD, way: dot3(cross3(down, front), outward) > 0 ? 1 : -1 };
  };
  // (a turn part of the way from a to b, as quaternions, with no choosing of the short way: that is the caller's)
  const partWay = (a, b, t) => {
    const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], -1, 1),
      th = Math.acos(d),
      sn = Math.sin(th),
      ka = sn < 1e-5 ? 1 - t : Math.sin((1 - t) * th) / sn,
      kb = sn < 1e-5 ? t : Math.sin(t * th) / sn,
      q = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb],
      l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  /* (and a knee is kept out of the canvas: each leg's turns are blended toward the rise's own taken at the rise's own hips,
     which are higher than his yet are, and with his hips still low a thigh so turned puts the knee into the canvas: down-front
     with his health dropped 0.02 s before the jab, 5.8 cm, in 55 frames. Where the knee, as he is drawn (his hips where he
     can have them, and propped up off the canvas: ON_CANVAS), would be lower than it lay and than on the canvas (its ball on
     it, rig/body.mjs RADIUS), the thigh is turned up on the hip by the least that brings it there, the shin kept as it was, so
     that it goes where the knee goes) */
  const kneeHeight = (pose, S) => fk(pose).p[S + 'Shin'][1] * (pose.stretch || 1);
  // (how far a foot is rolled over on its ankle, degrees, as the audit reads it: the shin against the foot's own across)
  const ANKLE_ROLL = RANGE.ankleRoll - 2;
  const ankleRoll = (pose, S) => {
    const F = fk(pose);
    return Math.asin(clamp(dot3(unit(M.sub(F.p[S + 'Shin'], F.p[S + 'Foot'])), M.app(F.R[S + 'Foot'], [1, 0, 0])), -1, 1)) / M.RAD;
  };
  const kneeUp = (pose, S, floor) => {
    const F = fk(pose),
      hip = F.p[S + 'Leg'],
      d = M.sub(F.p[S + 'Shin'], hip),
      want = floor / (pose.stretch || 1) - hip[1];
    if (d[1] >= want - 1e-6) return;
    const h = Math.hypot(d[0], d[2]),
      // (the way out from under the hip it goes: the way it leans, or straight down, forward)
      e = h > 1e-3 ? [d[0] / h, 0, d[2] / h] : unit(off3(M.app(F.R.Hips, [0, 0, 1]), [0, 1, 0])),
      along = dot3(d, e),
      L = Math.hypot(...d),
      th = Math.asin(clamp(want / L, -1, 1)) - Math.atan2(d[1], along),
      k = [-e[2], 0, e[0]];
    if (!(th > 0)) return;
    turnLeg(pose.rot, S + 'Leg', M.app(M.tr(F.R.Hips), k), th);
    turnLeg(pose.rot, S + 'Shin', M.app(M.tr(F.R[S + 'Leg']), k), -th);
  };
  const legsUnlying = (pose, st, from, { key, w }) => {
    const own = solve(Object.assign({}, key, { hips: M.add(key.hips, M.sub(st.hips, from.hips)) })),
      out = Object.assign({}, pose, { rot: Object.assign({}, pose.rot), knees: own.knees, knee: own.knee });
    // (how each leg lay, and so what it is held to through this rise; and each joint's turn as it was last blended toward)
    if (!rising.legs) {
      rising.legs = { to: {} };
      for (const S of ['Left', 'Right']) {
        const s = S === 'Left' ? 1 : -1,
          lay = legOf(rising.pose, S),
          t = unit(lay.knee),
          past = lay.off > 0.04 ? Math.max(KNEE_ROUND[0] - lay.round, lay.round - KNEE_ROUND[1], 0) : 0,
          // (as wide as it lay: past the edge it lay nearer, the long way round counted too)
          over = Math.min(past, 360 - (KNEE_ROUND[1] - KNEE_ROUND[0]) - past),
          upper = wrap180(lay.round - KNEE_ROUND[1]) > 0 && wrap180(lay.round - KNEE_ROUND[1]) <= wrap180(KNEE_ROUND[0] - lay.round);
        rising.legs[S] = {
          in: Math.max(THIGH.in, -t[0] * s),
          out: Math.max(THIGH.out, t[0] * s),
          behind: Math.max(THIGH.behind, -t[2]),
          round: past <= 0 ? KNEE_ROUND : over > KNEE_LAIN ? null : upper ? [KNEE_ROUND[0], KNEE_ROUND[1] + over] : [KNEE_ROUND[0] - over, KNEE_ROUND[1]],
          knee: kneeHeight(rising.pose, S),
          roll: Math.max(ANKLE_ROLL, Math.abs(ankleRoll(rising.pose, S)))
        };
      }
    }
    for (const S of ['Left', 'Right']) {
      for (const b of LEG) {
        const a = Q.fromM3(rising.pose.rot[S + b]),
          was = rising.legs.to[S + b] || a;
        let q = Q.fromM3(own.rot[S + b]);
        // (the same turn either way round: the one nearer what it was last frame, and at first the lying pose's)
        if (q[0] * was[0] + q[1] * was[1] + q[2] * was[2] + q[3] * was[3] < 0) q = q.map(x => -x);
        rising.legs.to[S + b] = q;
        out.rot[S + b] = Q.toM3(partWay(a, q, w));
      }
      const s = S === 'Left' ? 1 : -1,
        held = rising.legs[S];
      let leg = legOf(out, S);
      const t = unit(leg.knee),
        x = clamp(t[0] * s, -held.in, held.out) * s,
        z = Math.max(t[2], -held.behind);
      if (x !== t[0] || z !== t[2]) {
        const to = unit([x, t[1], z]),
          ax = cross3(t, to);
        if (Math.hypot(...ax) > 1e-9) turnLeg(out.rot, S + 'Leg', ax, Math.atan2(Math.hypot(...ax), dot3(t, to)));
        leg = legOf(out, S);
      }
      if (held.round) {
        // (a knee all but on the line from hip to ankle points nowhere in particular: turned back by less, the nearer it is)
        const mid = (held.round[0] + held.round[1]) / 2,
          half = (held.round[1] - held.round[0]) / 2,
          off = wrap180(leg.round - mid),
          by = (clamp(off, -half, half) - off) * smooth((leg.off - 0.02) / 0.06);
        if (by) turnLeg(out.rot, S + 'Leg', leg.down, by * M.RAD * leg.way);
      }
      /* (and the foot not rolled over on its ankle further than it lay, or than ANKLE_ROLL: turned part of the way from how it
         lay to how the rise has it, a foot lying rolled 29 degrees went through 35, past what an ankle rolls, in 5 frames) */
      const G = fk(out),
        shin = unit(M.sub(G.p[S + 'Shin'], G.p[S + 'Foot'])),
        fx = M.app(G.R[S + 'Foot'], [1, 0, 0]),
        roll = Math.asin(clamp(dot3(shin, fx), -1, 1)) / M.RAD,
        over = Math.abs(roll) - held.roll;
      if (over > 0) {
        const k = cross3(fx, shin);
        if (Math.hypot(...k) > 1e-9) turnLeg(out.rot, S + 'Foot', M.app(M.tr(G.R[S + 'Shin']), k), -Math.sign(roll) * over * M.RAD);
      }
    }
    const F = fk(out);
    out.at = F.p;
    out.head = M.add(F.p.Head, M.app(F.R.Head, HEAD));
    return out;
  };
  /* A rise is the pose he lay in turning into the rise's own over its first part: the solver's inputs, blended (the hips
     and the ends of his limbs moved straight, the joints turned the short way), and solved as anything is (but his legs:
     legsUnlying). */
  /* (how far an arm being brought round has gone on its way out to his side, half way through the rise's blend (blendStance):
     at an even pace, but for the last TURN of it, over which it comes to a stop out there, where its way turns, to set off
     again as it stopped. Turned there at speed, the glove's going up became going down from one frame to the next, and his
     centre of mass with it: 1.5 g, down-front with his health dropped 0.04 s after the jab) */
  const TURN = 0.1;
  const turnOut = w => {
    const x = (w - (0.5 - TURN)) / TURN;
    return x <= 0 ? w * 2 : 1 - 2 * TURN + 2 * TURN * (x + x * x - x * x * x);
  };
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
        way = w < 0.5 ? swingTo(unit(a0), aside, turnOut(w)) : swingTo(aside, unit(a1), 1 - turnOut(1 - w)),
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
          give.yaw.v += left * 300 * k * (1 - HIT.waist);
        }
      });
      // (and of the trunk's turn, the waist's share a moment after, between the chest's and the hips')
      later.push({ at: clock + HIT.waisted, kick: () => (give.waist.v += left * 300 * k * HIT.waist) });
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
    // how far he is crouched in his peek-a-boo shell (clean.mjs), 0..1
    get shelled() {
      return shelled;
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
          amp = chain.amp || [1, 1, 1, 1, 1, 1];
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
          height = ch => (ch === 'hy' || ch === 'lkf' || ch === 'rkf' ? knees : 1),
          // (of the punch's waist, what his waist turns on its own; his chest turns the rest with itself: his grade's, chain.mjs)
          own = chain.own ?? 1;
        for (const ch in move.coil) {
          const v = move.coil[ch] * chain.coil.q * (ch === 'lc' || ch === 'le' || ch === 'rc' || ch === 're' || ((ch === 'twist' || ch === 'waist') && move.chain.locked) || (ch === 'yaw' && move.arm === 'swing') ? 1 : chain.shown ?? 1) * height(ch);
          // (a man who turns all of a piece winds up all of a piece: what his chest and his waist would add to the wind-up goes
          // with his hips, all of it, the waist's share his chest would carry as well as the share his waist turns on its own)
          if ((ch === 'twist' || ch === 'waist') && !form.sep) c.yaw += v;
          else if (ch === 'waist') (c.waist += v * own), (c.twist += v * (1 - own));
          else c[ch] += v;
        }
        // (a flicker's body: a great dirty fighter's swing, a legend's wrist; and how much of its waist each cracks, its own
        // share and not the body's: moves.mjs)
        const flick = move.flick ? move.flick[Math.max(0, (form.dirty || 1) - 1)] : 1,
          whip = chain.whip ?? 1;
        LINKS.forEach((link, i) => {
          if (link === 'waist') {
            // (the waist's own turn, as the waist goes; the rest of it as the chest goes, the chest carrying it)
            for (const ch in move.links.waist) (c[ch] += move.links.waist[ch] * chain.q[i] * amp[i] * own * whip), (c.twist += move.links.waist[ch] * chain.q[2] * amp[2] * (1 - own) * whip);
            return;
          }
          for (const ch in move.links[link]) c[ch] += move.links[link][ch] * chain.q[i] * amp[i] * height(ch) * flick;
        });
        // (a punch to the body: the way down to it, his grade's, body.mjs)
        if (move.level) lower(c, action, move, action.level || LEVEL[3]);
        // (out of a sway back, the pull counter: coming back in is its wind-up, anim/evade.mjs)
        if (action.loaded && action.loaded.pulled) pullBack(c, action, move);
        // (off an elbow block, block and fire: the crunch is its wind-up, anim/clean.mjs)
        if (action.loaded && action.loaded.fired) fireBody(c, action, move);
        // (the cross counter: the head off inside the jab, the elbow up, the lead foot in, by his grade, anim/over.mjs)
        if (move.over) overBody(c, action, form);
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
        if (action.loaded && action.loaded.load > 0 && action.loaded.from !== 'parry' && action.loaded.from !== 'legend' && action.loaded.from !== 'wave' && action.loaded.from !== 'block') (c[o + 'z'] -= 0.12 * (1 - smooth(action.t / 0.2))), (c[o + 'y'] -= 0.01 * (1 - smooth(action.t / 0.2)));
        c.hp -= 11 * form.chin * out; // the chin up and out after it (tucked, the better he is)
        c.lean += 9 * form.over * share.over * out; // and the weight thrown in after it, over the front foot (right up close there is no room)
        c.hz += 0.05 * form.over * share.over * out;
        /* The stretch across the trunk: as the hips go the shoulders are held back behind them, most of all halfway through
           the hips' turn, and let go as the hips finish it (the more of it a man can hold, the more the trunk has to give
           back). It is the hips' turn that pulls it, so a man whose trunk goes early holds it as long as one whose trunk
           waits; and only on the way out (by the time the hips have got there it is gone, and they come back without it). In a
           punch that turns the waist it is the waist that is held back, the belt left behind the hips and catching up. */
        const hipsQ = clamp(chain.q[1], 0, 1);
        if (chain.phase !== 'recover' && chain.phase !== 'done') c[move.chain.waist ? 'waist' : 'twist'] -= sg * form.sep * share.sep * 4 * hipsQ * (1 - hipsQ);
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
        if (comingOut && (!exit || exit.id !== id) && form.exit && !move.over) exit = { kind: form.exit, id, from: halves + u, t: 0, x: off.x, y: off.y, side: off.x >= 0 ? -1 : 1, done: null };
        if (!(chain.phase === 'recover' && (form.exit === 'roll' || form.exit === 'angle'))) {
          headTo(c, ox, oy);
          off.x = ox;
          off.y = oy;
        }
        /* Dirty: the punch's foul (moves.mjs: foul), blatant (a great dirty fighter's) or passed off (a legend's). Whether it
           lands is the bout's to judge (game/bout.mjs: fouls); this is the body that does it. */
        /* (a flicker's wrist snaps over at the end of it: the glove goes on a few centimetres, up and in, as the elbow gets
           straight, and back as it comes home) */
        const snap = Array.isArray(move.snap) ? move.snap[Math.max(0, (form.dirty || 1) - 1)] : move.snap;
        if (snap) extra[me] = M.add(extra[me] || [0, 0, 0], [0, snap * 0.4, snap].map(v => v * smooth(clamp((chain.q[4] - 0.75) / 0.25, 0, 1)) * (chain.phase === 'recover' ? 1 - smooth(chain.since / 0.12) : 1)));
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
      {
        // (rocked, his eyes only so far on the other man)
        const look = form ? form.look : evading ? evading.look : cv.look !== null ? st.look + (cv.look - st.look) * cover : st.look;
        gaze += (look + (WOBBLE.look - look) * wobble.now - gaze) * (1 - Math.exp(-dt * 20));
      }
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
        const r = rolling ? shoulderRoll(c, rolling.roll, rolling.t, rolling.out) : null;
        crossK = shape ? Math.max(xc ? cover : 0, r && !xc ? r.w : 0) : 0;
        /* (how much it is on its way up, or down, followed, for the way the lead hand goes into it and out: but not a hammer
           put up fresh, show.mjs crossGuard) */
        const freshHammer = !!(xc && xc.hammer) && !rolling && view.fresh !== null && view.fresh !== undefined;
        crossUp = freshHammer ? 0 : crossUp + ((crossK > crossWas + 1e-6 ? 1 : 0) - crossUp) * (1 - Math.exp(-dt * 20));
        crossDown += ((crossK < crossWas - 1e-6 ? 1 : 0) - crossDown) * (1 - Math.exp(-dt * 20));
        crossWas = crossK;
        if (crossK > 0.002) shrug += crossGuard(c, shape, crossK, crossUp, crossDown);
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
      // (crouched behind it, the peek-a-boo shell: clean.mjs)
      shelled = shellBody(c, shell, { view, low: bodyHits.low, winding: !!(action && action.loaded && action.loaded.from === 'shell' && action.chain && action.chain.phase === 'coil'), quick: !!(view.shift && view.shift.off !== null), dt, clock });
      // (the Tyson shift: down in it, the stance changed over, shift.mjs; out of the shell, the shell's crouch handed over to it as
      // it lets go, the quicker once its rear foot goes)
      shiftBody(c, shift, { view: view.shift || null, action, shelled, dt });
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
      // (but not a cross counter: when it goes is the jab's, anim/over.mjs)
      if (punchMove && form && form.beat && !punchMove.over && view.reach != null && (action.chain.phase === 'coil' || action.chain.phase === 'throw')) {
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
      // (the Tyson shift has his feet while it lasts, and while it brings them back under him after: shift.mjs)
      const shifting = shiftHold(shift, { view: view.shift || null, planted, swing, drawn, ball: BALL, drift, dt });
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
        if (!view.still && !(action && MOVES[action.name].floor) && !shifting) {
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
        /* (with the chest: turned at the waist instead, which is where it belongs, the gloves of a guard held through it move
           a few millimetres. That changed eleven of the cards' events (a legend's counter cross by 10 N·s) and put a slipping
           legend's lead glove 2.3 cm into his own rear forearm, so it stays the chest's: docs/moves-plan-6.md §1.6) */
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
      c.waist += spring(give.waist, 0, dt, 2.1, 0.55);
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
      // (down on the canvas, nothing of it is left to come back as he gets up: no foot out, no eyes off the other man)
      if (floored) (brace.L = [0, 0]), (brace.R = [0, 0]), (brace.move = null), (wobble.now = 0), (droop.L = droop.R = 0);
      (slow.on.L = slow.on.R = false), (slow.drawn = null);
      if (!floored) {
        wobble.t += dt;
        const w = wobble.amount * Math.exp(-wobble.t / WOBBLE.last) * smooth(clamp(wobble.t / WOBBLE.onset, 0, 1)),
          T = wobble.t,
          // a hand that is punching is the punch's, not his condition's (it is physics: where it goes is what it hits)
          free = { L: !(punchMove && punchMove.hand === 'L'), R: !(punchMove && punchMove.hand === 'R') },
          guardUp = 1 - 0.6 * cover,
          breath = Math.sin(TAU * (1 + 0.5 * tired) * clock);
        wobble.now = w;
        if (w > 1e-3) {
          /* the knees go and come back, the trunk swings from side to side over them, the head lolls after it, the gloves
             sag (WOBBLE) */
          const W = WOBBLE,
            sway = Math.sin(TAU * 1.3 * T);
          // (the knees give, one and then the other, a quarter of a second apart, turned in toward each other; and not into the
          // other man's legs: kneeRoom)
          const room = kneeRoom(dt, view.foe);
          c.lkf += w * room.Left * (W.knee[0] + W.knee[1] * Math.sin(TAU * T) ** 2);
          c.rkf += w * room.Right * (W.knee[0] + W.knee[1] * Math.cos(TAU * T) ** 2);
          c.lkx -= W.in * w * room.Left;
          c.rkx -= W.in * w * room.Right;
          // (the trunk over them, the waist turning against it, the hips going out the other way under it)
          c.side += W.side * w * sway;
          c.waist -= W.waist * w * sway;
          c.hx -= W.hips * w * sway;
          c.lean += 5 * w;
          // (the head rolling after the trunk, the chin down)
          c.hr += W.roll * w * smooth(clamp(T / W.rolled, 0, 1)) * Math.sin(TAU * 1.3 * T - W.lag);
          c.hp += W.chin * w;
          if (free.L) (c.ly -= W.glove * w * guardUp), (c.lz -= 0.04 * w), (c.lx += 0.03 * w);
          if (free.R) (c.ry -= W.glove * w * guardUp), (c.rz -= 0.04 * w), (c.rx -= 0.03 * w);
        }
        /* (and how far his arms hang past that, each of a hand that is free: come to over W.drooped from the blow, and let
           go of, a hand that throws, in W.quick) */
        for (const side of ['L', 'R']) {
          const want = free[side] ? w * guardUp * smooth(clamp(wobble.t / WOBBLE.drooped, 0, 1)) : 0,
            most = dt / WOBBLE.quick;
          droop[side] += clamp(want - droop[side], -most, most);
          slow.on[side] = free[side] && w >= WOBBLE.slowed;
        }
        /* (and a foot put out to catch him as he sways that way, every so often while he is badly rocked, and back under him
           once he is over it: WOBBLE.brace) */
        {
          const B = WOBBLE.brace;
          /* (not while he throws: a step put out to catch him as a punch of his own carries his weight on over it left him
             where he would topple, 17 cm outside his feet for 4 frames past the 0.3 s, a jab thrown as the stun ran out; one
             under way when he throws is cut short, the foot put down where it has got to) */
          if (punchMove && brace.move) brace.move = null;
          if (brace.move) {
            const m = brace.move;
            m.t += dt;
            const e = smooth(m.t / B.time);
            brace[m.side] = [m.from[0] + (m.to[0] - m.from[0]) * e, m.from[1] + (m.to[1] - m.from[1]) * e];
            c[m.side === 'L' ? 'lfy' : 'rfy'] += B.lift * bump(m.t / B.time);
            if (m.t >= B.time) brace.move = null;
          } else if (w > B.from && (view.shoved || 0) <= B.shoved && !punchMove) {
            if (wobble.t < B.first) brace.next = B.first - wobble.t;
            else if ((brace.next -= dt) <= 0) {
              // (a lead foot stood on stays where it is: the other is put out instead)
              const side = Math.sin(TAU * 1.3 * T) > 0 && !view.pinned ? 'L' : 'R',
                out = Math.hypot(...brace[side]) > B.out,
                d = B.d[0] + (B.d[1] - B.d[0]) * roll(),
                s = side === 'L' ? 1 : -1;
              brace.move = { side, from: brace[side].slice(), to: out ? [0, 0] : [brace[side][0] + s * d * 0.8, brace[side][1] - d * 0.6], t: 0 };
              brace.next = B.every;
            }
          } else if (w < 0.05) {
            const side = Math.hypot(...brace.L) > 1e-4 ? 'L' : Math.hypot(...brace.R) > 1e-4 ? 'R' : null;
            if (side) brace.move = { side, from: brace[side].slice(), to: [0, 0], t: 0 };
          }
          c.lfx += brace.L[0];
          c.lfz += brace.L[1];
          c.rfx += brace.R[0];
          c.rfz += brace.R[1];
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
        for (const side of ['L', 'R']) (hand[side] = null), (elbow[side] = null), (round[side] = null), (arm[side] = null), (wrist[side] = null), (apart[side] = null), (knees[side] = null), (steer[side] = [0, 0, 0]);
        height = null;
        exit = null;
        fall = null;
      }
      // ---- one move handing over to another: what was showing is let go of, not dropped
      // (and a cross counter that waited for the jab's aim, going now, as if it had been pressed now: over.mjs)
      const goes = !!action && !!action.crossing && !!action.crossing.go && wentFor !== id;
      if (goes) wentFor = id;
      const handover = id !== doing || goes;
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
        // (the Tyson shift's: the rear foot through the air to its spot, the lead foot round to the front again: shift.mjs)
        const sf = shifting ? shiftFoot(shift, side, { view: view.shift || null, planted, ball: BALL }) : null;
        if (sf) (at = sf.at), (lift = sf.lift), (pitch = sf.pitch);
        else if (stepping) {
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
        } else if (!shifting) {
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
        // (where its ball is, for the Tyson shift to take it from: shift.mjs)
        drawn[side] = at.slice();
        // the hips come down a little as the feet are spread (as much as a long stride asks, and no more)
        dip += (shifting ? 0 : 1) * Math.min(0.04, (at[0] - BALL[side][0]) ** 2 + (at[2] - BALL[side][2]) ** 2) * 0.3;
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
      if (globalThis.__dbg) globalThis.__dbg.push({ kf: { ...kf }, hy: c.hy, lean: c.lean, yaw: c.yaw, elev: { ...elev }, sunk, hz: c.hz, sh: view.shift ? [view.shift.off, view.shift.shell, view.shift.t] : null });
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
      // (a cross counter's rear arm goes over the other man's lead arm, read off where his jab is going: over.mjs)
      const his = punchMove && punchMove.over ? hisNext(action, hisArm(view, wide, tall)) : null;
      for (const side of ['L', 'R']) {
        const k = side === 'L' ? 'l' : 'r',
          s = side === 'L' ? 1 : -1,
          flare = clamp(c[k + 'e'], 0, 1),
          open = M.add(GUARD.hands[side], [c[k + 'x'], c[k + 'y'], c[k + 'z']]),
          // held to the face, or locked to the chest and swung with it, or part way between
          // (or put on the canvas: where its channels say, in the room)
          mine = punchMove && punchMove.hand === side ? punchMove : null,
          // (a cross counter's rear hand: left where it was as he went, not carried with his head, and lifted over: over.mjs)
          kept = mine && mine.over ? overHand(action, open, carried) : M.lerp(M.lerp(M.add(open, carried), M.add(chest.p, M.app(swung, M.sub(open, CHEST.p))), clamp(c[k + 'c'], 0, 1)), open, clamp(c[k + 'g'], 0, 1)),
          free = reach && side === 'L' && reach.w > 0 ? M.lerp(kept, [reach.to[0] * wide, reach.to[1] / tall, reach.to[2] * wide], reach.w) : kept;
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
            // (a cross counter's: lifted over his arm on the way, over.mjs)
            if (mine.over) {
              const raised = overRaise(action, his, shoulder, thrown, to, dt);
              if (raised) thrown = M.add(thrown, raised);
            }
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
                /* (an inside hook's is raised only as the legs drive: right up close, a glove raised from the guard is in his face,
                   and one raised high before the body turns under it takes the upper arm up past where it can go; all the way up
                   by `tight` of the legs' drive (true: by the square of the drive). And where its waist turns on its own, raised at
                   least as far as the waist has turned: what the waist brings round is up at the jaw by the time it is round. A
                   quick man's waist turns in a frame, and with the fist still on its way up it went round under the jaw of a man
                   standing a few centimetres off the line, and on through his lead shoulder) */
                raised = mine.tight ? (mine.tight === true ? drove * drove : smooth(clamp(chain.q[0] / mine.tight, 0, 1))) : smooth(clamp(Math.max(chain.coil.q, chain.q[0]), 0, 1)),
                set = mine.tight && mine.chain.waist ? Math.max(raised, smooth(clamp(chain.q[5] * (chain.own ?? 1), 0, 1))) : raised,
                ring = [to[0] - s * 0.05, to[1] + 0.03, to[2] + 0.1],
                amp = chain.amp || [1, 1, 1, 1, 1, 1],
                wound = ((mine.coil.yaw || 0) + (mine.coil.twist || 0) + (mine.coil.waist || 0)) * chain.coil.q,
                // (and the waist's, where the punch turns it: all of what it turns on its own, the waist being quick, and the
                // rest as the chest's)
                own = chain.own ?? 1,
                still = mine.links.hips.yaw * amp[1] * (1 - chain.q[1]) + mine.links.trunk.twist * amp[2] * ((mine.land ?? 1) - chain.q[2]) + (mine.links.waist ? mine.links.waist.waist * (chain.whip ?? 1) * (amp[5] * own * (1 - chain.q[5]) + amp[2] * (1 - own) * ((mine.land ?? 1) - chain.q[2])) : 0) - wound,
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
            } else if (target && mine.scoop && form && !(form.dip > 0)) {
              /* The inside uppercut's U (docs/moves-plan-6.md §3.3 N16), for a man who uses his knees: the hand goes down with
                 them on its own side (half way across from his shoulder to the target), held `scoop` metres back toward him
                 so that it goes down and not out; at the bottom it goes forward that far along it and in under the target
                 (`inward` of the way across to it from his shoulder) as the legs drive, over the legs' drive and not before (slid at the end
                 of the wind-up, it went in a frame and back, a jump of 3 to 4 cm: tests/stance.test.mjs), no lower than the
                 bent arm will carry it at the end of it, to the foot of its way up (`foot` short of the target); and up from
                 there as the shoulder closes, the pro's way up, sent `through` metres past where the glove meets the chin, so
                 that it lands on its way up and not at the end of it. In under the target before it goes up, and not on the
                 way up: coming up from its own side, it crossed in front of the other man's chest on the way, into it with him
                 a few centimetres nearer, and came onto the chin from the side. The floor is held until the shoulder is a
                 third of the way through and let go by the time it is two thirds: let go as the shoulder fires, the hand
                 dropped off it under the legs' drive in the frame it was meant to start up, and went up 34 cm in the next one
                 (12 more than it did before the U). Retraced on the way home, the arm dropped back down to the bottom of the U
                 and took him down faster than he can fall, a frame of 1.5 g with the other man a few centimetres nearer. */
              /* (half way across, and no further than 15 cm from his shoulder: at the card's own spot that is 13 to 15 cm, but
                 off it, at a man stepping back with his guard up as the inside hook is still coming home, the target is off to
                 his lead side and half way across was 19 cm: sent there, the hand went into his own lead arm, 2.8 to 3.3 cm,
                 a legend's) */
              const ux = shoulder[0] - s * Math.min(0.15, (s * (shoulder[0] - to[0])) / 2),
                /* (and in under it no further across him than 8 cm past the middle of his own chest, about as far as it goes
                   at the card's own spot: the rest of the way across it goes as it comes up. Taken all the way in under a man
                   side-stepping to his lead side, 15 to 22 cm past the middle, the hand crossed his body low, through his own
                   lead upper arm, 5.4 to 7.2 cm, and took his upper arm where the shoulder cannot put it, 13 degrees: an
                   amateur's inside chain at a man side-stepping 16 cm as he is hit) */
                across = shoulder[0] + (to[0] - shoulder[0]) * (mine.inward ?? 1),
                under = s * (across - chest.p[0]) < -0.08 ? chest.p[0] - s * 0.08 : across,
                uz = to[2] - (mine.foot ?? mine.under ?? 0),
                wound = chain.phase === 'coil' ? clamp(chain.coil.q, 0, 1) : 1,
                // (coming home it goes back as a guard's hand does, not back down the U: let go of over the first 0.15 s)
                keep = chain.phase === 'recover' ? 1 - smooth(clamp(chain.since / 0.15, 0, 1)) : 1,
                /* (and not before `downFrom` of the wind-up is done: out of an inside hook his guard blocked, the rear hand sent
                   down and back toward him in the first frames of it went through his own lead arm on its way, 2.4 to 4.3 cm,
                   and turned his upper arm past its range) */
                down = smooth(clamp((wound - (mine.downFrom || 0)) / 0.6, 0, 1)) * keep,
                along = smooth(clamp(chain.q[0], 0, 1)) * keep,
                // (`hang`: how far below his shoulder the hand hangs at the bottom of it, where the move says: the bent arm's reach)
                reach = mine.hang || mine.bent || BENT,
                floor = shoulder[1] - Math.sqrt(Math.max(0, reach * reach - (ux - shoulder[0]) ** 2 - (uz - shoulder[2]) ** 2)),
                level = (1 - smooth(clamp((swingQ - 0.3) / 0.3, 0, 1))) * keep,
                /* (and not back past the other man's elbow, where it is in front of the hand: the bottom kept in front of it,
                   clearOf. Off the card's spot, right up close at a man holding his guard up, his lead elbow is a few
                   centimetres in front of the rear hand and in front of his chest) */
                bottom = Math.max(uz - mine.scoop, (chain.clear ??= clearOf(view, free, wide, tall))),
                hx = free[0] + (ux - free[0]) * down + (under - ux) * along,
                hz = free[2] + (bottom - free[2]) * down + (uz - bottom) * along;
              // (and the legs' drive does not push it down past where the wind-up left it: the bottom of the U)
              /* (thrown already wound up, out of an evasion or off his arms (game/bout.mjs: preload), the wind-up has not taken
                 it down: its bottom is the U's own, or a crossed counter from the rear glove at his chin was held up there as
                 his body went down and met the other man's head from below in the first frame up, 14 N·s for 83) */
              if (chain.phase === 'coil' || chain.low === undefined) chain.low = chain.load > 0 ? floor : Math.max(free[1], floor);
              const low = Math.max(floor, chain.low);
              thrown = M.lerp([hx, free[1] + Math.max(0, low - free[1]) * level, hz], [to[0], to[1] + (mine.through || 0), to[2]], swingQ);
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
          // (and the peek-a-boo shell: the elbows in at his sides, under the gloves: clean.mjs)
          tucked = shelled > 0.002 && shell.sh && !(mine && action.shifted) ? shelled * (mine ? 1 - smooth(action.t / 0.2) : 1) : 0,
          asked = M.app(chest.R, M.lerp(M.lerp(M.lerp(M.lerp([s * (0.5 + 0.8 * flare), -1 + 1.3 * flare, -0.2 - 0.25 * flare], [s * 0.45, -0.35, -0.85], pushing), [s * 0.15, -1, -0.2], hang), crossed ? shape.pole[side] : [0, 0, 0], crossed), tucked ? [s * shell.sh.pole[0], shell.sh.pole[1], shell.sh.pole[2]] : [0, 0, 0], tucked)),
          l = Math.hypot(asked[0], asked[1], asked[2]) || 1;
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
        // (and a cross counter's rear elbow up and out as the hand goes up, up and in as the shoulder sends it: over.mjs)
        const poled = mine && mine.over ? overElbow(action, s, chest.R) : null,
          way = poled ? unit(M.lerp(M.scale(asked, 1 / l), poled.to, poled.w)) : M.scale(asked, 1 / l),
          keep = elbow[side] ? Math.exp(-dt * (poled ? poled.rate : 16)) : 0;
        // (and it goes round the arm no faster than an elbow can, 1200 degrees a second, and the shoulder swings it no faster
        // than 900)
        /* (and, kept out of the other arm, it is put off where it is sent no faster than APART: how locked to the chest it is,
           and how far put down in the room, say which hand gives way: solve.mjs) */
        hands[side] = { at, toward: M.lerp(way, elbow[side] || [0, 0, 0], keep), round: { was: round[side], most: (poled ? ROUND : 1200) * dt }, shoulder: { was: arm[side], most: 900 * dt }, last: wrist[side], punch: !!mine && (action.chain.phase === 'coil' || action.chain.phase === 'throw') && !(pullIn(action) > 0 && action.chain.t < action.chain.wait), locked: !!mine && mine.arm === 'swing', chest: clamp(c[k + 'c'], 0, 1), room: clamp(c[k + 'g'], 0, 1), apart: { was: apart[side], most: APART * dt } };
      }
      let stance = { hips, spine, feet, hands, stretch: 1 + c.st },
        // (getting up, while the rise is still being blended out of how he lay: its own stance, and how far it has gone)
        unlying = null;
      if (rising && action && rising.id === id) {
        const w = smooth(action.t / rising.blend);
        if (w < 1) (unlying = { key: stance, w }), (stance = blendStance(rising.rest, stance, w));
        else rising = null;
      } else if (rising && rising.id !== null) rising = null;
      // (rocked, his arms are slow and hang, before what his body can do with his weight is reckoned: FALL)
      // (on the canvas, getting up or going down, his slowed arms are not kept out of the other man: rockedArms)
      const solved = st => (unlying ? legsUnlying(solve(st), st, stance, unlying) : rockedArms(solve(st), droop, dt, st, action && MOVES[action.name].floor ? null : view.foe));
      let pose = solved(stance);
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
            /* (but not the fist of a punch to the body on its way: it goes where it is thrown, low, and the arm reaches down
               to it from wherever the shoulder is, as the way down to it lags: body.mjs, lower) */
            const low = punchMove && punchMove.level && (action.chain.phase === 'coil' || action.chain.phase === 'throw') ? punchMove.hand : null,
              shifted = h => {
              const by = [0, h / (1 + c.st), 0],
                moved = {};
              for (const side of ['L', 'R']) moved[side] = side === low ? stance.hands[side] : Object.assign({}, stance.hands[side], { at: M.add(stance.hands[side].at, by) });
              return solved(Object.assign({}, stance, { hips: M.add(stance.hips, by), hands: moved }));
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
      // (and his knees, while the rise is blended out of how he lay: not let through the canvas, but kept on it: kneeUp)
      if (unlying && rising && rising.legs) {
        pose.rot = Object.assign({}, pose.rot);
        for (const S of ['Left', 'Right']) kneeUp(pose, S, Math.min(RADIUS.Shin, rising.legs[S].knee));
        const F = fk(pose);
        for (const S of ['Left', 'Right']) for (const b of LEG) pose.at[S + b] = F.p[S + b];
      }
      for (const [side, Side] of [['L', 'Left'], ['R', 'Right']]) {
        // (as the solver had them, where a rocked man's arms are drawn otherwise: rockedArms)
        const o = pose.own ? pose.own[side] : { arm: pose.at[Side + 'Arm'], fore: pose.at[Side + 'ForeArm'], hand: pose.at[Side + 'Hand'] },
          d = M.sub(o.fore, o.arm),
          l = Math.hypot(d[0], d[1], d[2]) || 1;
        elbow[side] = M.scale(d, 1 / l);
        round[side] = pose.round[side];
        arm[side] = pose.arms ? pose.arms[side] : null;
        wrist[side] = o.hand;
        apart[side] = pose.own ? pose.own[side].apart : pose.apart ? pose.apart[side] : null;
        knees[side] = pose.knees ? pose.knees[side] : null;
      }
      return remember(pose);
    }
  };
}
