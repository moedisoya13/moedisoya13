/* Everything the boxer does. A pose is the guard plus numbers on named channels (a hand moved so far, the hips turned so
   many degrees). Punches put numbers on them by physics: a chain of joints firing in turn (see PUNCHES). The rest (covering
   up, a dash, a fall) are curves: keys on the channels, eased between and never held.

   Channels (all zero in the guard):
     hx hy hz          hips, metres (x to the boxer's left, z ahead)
     lean yaw side     the whole trunk, degrees: curling forward, turning left, bending left
     tip               the whole body tipped forward from the hips, stiff as a board (a fall)
     twist             the chest turned further than the hips
     hp hw hr          head: nod down, turn left, tilt left
     lx ly lz le       left hand, metres, and how far its elbow is lifted out (0 down .. 1 level with the shoulder)
     rx ry rz re       right hand
     lc rc             how far each hand is locked to the chest and swung by it (1), not held to the face (0): a hook
     lg rg             how far each hand is put where its channels say in the room, not carried with the head (1): a glove
                       planted on the canvas (the solver stops it there, on top)
     lfx lfy lfz lfw lfp   left foot: metres across, up, ahead; degrees turned out, heel raised
     rfx rfy rfz rfw rfp   right foot
     lkf rkf           each knee bent this many degrees further than it is (the guard's 38 and 48, or wherever the rest of him
                       has it), straightened if negative. A knee over a planted foot cannot bend without the hips coming down
                       over it, so the hips are put where the bend says (straight down, and over toward the knee bent more,
                       the weight going onto that leg: animator.mjs, bend); a foot off the canvas is folded up under him
     lkx rkx           each knee turned round its leg from over the foot: in (negative), as a hook's pivot turns it, or out
     lk rk             how far each knee is pointed down at the canvas (1): a knee put down (the solver stops it there, on it)
     st                taller and thinner by this share
     aim               how much the punching hand is steered onto the target (0..1) */

export const CHANNELS = ['hx', 'hy', 'hz', 'lean', 'tip', 'yaw', 'side', 'twist', 'hp', 'hw', 'hr', 'lx', 'ly', 'lz', 'le', 'lc', 'lg', 'rx', 'ry', 'rz', 're', 'rc', 'rg',
  'lfx', 'lfy', 'lfz', 'lfw', 'lfp', 'lk', 'rfx', 'rfy', 'rfz', 'rfw', 'rfp', 'rk', 'lkf', 'rkf', 'lkx', 'rkx', 'st', 'aim'];

// Orthodox guard: left foot and hand lead, chin down, weight on the balls of the feet.
export const GUARD = {
  hips: [0, 0.885, -0.02],
  lean: 17,
  yaw: -28,
  twist: -10,
  chin: 5,
  hands: { L: [0.1, 1.385, 0.33], R: [-0.1, 1.365, 0.17] },
  feet: { L: { at: [0.13, 0.09, 0.2], yaw: -12, pitch: 0 }, R: { at: [-0.15, 0.09, -0.24], yaw: -48, pitch: 12 } }
};

const EASE = {
  lin: u => u,
  io: u => u * u * u * (u * (u * 6 - 15) + 10), // leaves and arrives at rest
  out: u => 1 - (1 - u) ** 3,
  in: u => u ** 2.2, // something falling
  punch: u => 1 - (1 - u ** 1.5) ** 2.6 // starts from rest, is fastest early, lands at rest
};

/* keys: [{ t, e (how this key is arrived at: io by default), ...channels }]. Every channel starts at zero and, unless the
   move is `stay`, is back at zero by `dur`. */
function compile(def) {
  const tracks = {};
  for (const key of def.keys)
    for (const ch of Object.keys(key)) {
      if (ch === 't' || ch === 'e') continue;
      if (!CHANNELS.includes(ch)) throw new Error(`Unknown channel ${ch}`);
      (tracks[ch] = tracks[ch] || [[0, 0, 'io']]).push([key.t, key[ch], key.e || 'io']);
    }
  for (const track of Object.values(tracks)) {
    const last = track[track.length - 1];
    if (!def.stay && last[0] < def.dur) track.push([def.dur, 0, 'io']);
  }
  return Object.assign({}, def, { tracks });
}
export function sampleMove(move, t, out) {
  for (const ch in move.tracks) {
    const track = move.tracks[ch];
    let i = 0;
    while (i + 1 < track.length && track[i + 1][0] <= t) i++;
    if (i + 1 >= track.length) out[ch] = (out[ch] || 0) + track[i][1];
    else {
      const a = track[i],
        b = track[i + 1],
        u = (t - a[0]) / (b[0] - a[0]);
      out[ch] = (out[ch] || 0) + a[1] + (b[1] - a[1]) * EASE[b[2]](u < 0 ? 0 : u);
    }
  }
  return out;
}

/* A punch is not keyed. It is a kinetic chain (phys/chain.mjs): five joints that fire one after another, and what each one
   contributes to the pose as it turns. `coil` is the wind-up, let go as the chain fires; `links` says what each joint adds as
   it goes from 0 to 1. The shoulder and elbow need no amounts: they are the arm itself, worked out by how it is thrown.
     arm: 'straight'  the shoulder swings the upper arm onto the line of the target and the elbow straightens along it
          'swing'     the arm is held bent and locked to the chest, the body carries it round, the shoulder closes the last of it
                      (land: the share of the trunk's turn at which the turn brings the locked fist onto the head; most: the
                      furthest round it is held, degrees, and ahead: no further round than this off the front of the chest;
                      tight: the fist is kept in at the chest through the wind-up and raised to the target only with the drive)
          'lift'      the arm is held bent, the legs and trunk drive it up, the shoulder closes the last of it
     chain: { coil: seconds of wind-up, rate: how fast each joint's muscle is (rad/s natural frequency), skip: joints held
              still, turn: degrees the hips and trunk turn through, locked: the arm is stiff from the start }
     reach: about how far away, centre to centre, it can land (the rival's judgment and the step in; the hit itself is
            the glove meeting the head); close: the distance he steps in to
     body: how much of a grade's way of using the body (anim/skill.mjs: form) this punch takes, times: turn (of the extra
            turn a better man gives the legs, hips and trunk), off (of the head off the line), bend, tuck, over (of the
            weight thrown in after it)
     foul: the foul a dirty boxer throws with it (anim/skill.mjs: form.dirty), where there is one (the jab and the hook; the
            cross and the uppercut are thrown with a dirty grade's body and nothing else), which has to land as truly as a
            punch does: a part of him (a foot, a glove) meeting the other man (his instep, his face), judged the way a punch
            is (game/bout.mjs: fouls), with an impulse the way a punch's is, from the mass of the part. Pairs of amounts are
            [4암, 5암]: a great dirty fighter does it in the open, a legend does it small and passes it off as an accident.
            The body it takes is the animator's (anim/animator.mjs: the foul); these are its amounts. */
const PUNCHES = {
  jab: {
    hand: 'L', arm: 'straight', kind: 'straight', reach: 1.15, close: 1.0,
    chain: { coil: 0, rate: [58, 50, 56, 46, 44], turn: [9, 14] },
    body: { off: 0.6, dip: 0.5 },
    coil: {},
    // (the lead knee bends as the foot goes, and is straightened by the time the glove lands)
    links: { drive: { hz: 0.06, lfz: 0.07, lkf: 6 }, hips: { yaw: -9, rx: 0.02, ry: 0.03 }, trunk: { twist: -14, lean: 4, hp: 3, lkf: -10 }, shoulder: {}, elbow: {} },
    /* the face jab (`thumb`): the glove left over his face after it lands and pushed on into it, so he cannot see (blatant:
       his head snapped back; a legend's a short push, the wrist turned in, and home as if nothing had happened). It counts
       a few hundredths after the contact, if the glove is still on him; he covers the eye with his rear glove a while. */
    foul: { name: 'thumb', hold: [0.2, 0.1], push: [0.06, 0.03], at: 0.04, blind: 0.4, snap: [10, 0] }
  },
  cross: {
    hand: 'R', arm: 'straight', kind: 'straight', reach: 1.15, close: 1.0,
    chain: { coil: 0.05, rate: [58, 36, 50, 54, 54], turn: [41, 38] },
    coil: { yaw: -7, hz: -0.025, rkf: 10, rz: -0.04, ry: -0.02 }, // (the rear knee loaded)
    links: {
      drive: { rfw: 40, rfp: 24, rfz: 0.05, rkx: -22, hz: 0.11, hy: -0.03, st: 0.02 }, // the rear foot turns on its ball and pushes, the knee turned in over it
      hips: { yaw: 34, hx: 0.03 },
      trunk: { twist: 38, lean: 7, side: 3, lx: -0.04, ly: 0.03, lz: -0.1 }, // the other hand stays at the chin
      shoulder: {},
      elbow: {}
    }
  },
  hook: {
    hand: 'L', arm: 'swing', kind: 'hook', reach: 0.9, close: 0.82, land: 0.7,
    chain: { coil: 0.085, rate: [58, 42, 52, 60, 0], skip: ['elbow'], turn: [41, 32], locked: true },
    /* (the arm is locked to the chest, so the body's turn is the fist's path, and the animator puts that path through the
       head: the fist is raised to the jaw, and sent out as far as the head and held round to the lead side as the legs drive,
       as far round as the turn still to come will carry it by the time the trunk is `land` of the way round, so that the
       turn brings it onto the head and it lands on its sweep, going the way a hook goes, with the trunk behind it
       (anim/animator.mjs: sweep). A better man's turn is all of it; his head stays where the arm can still reach from; and
       it is thrown off set feet, the bounce stopped under it) */
    body: { turn: 1, off: 0, bend: 0, tuck: 0, sep: 0.5, dip: 1.5, lively: 0 },
    // the arm is set at a right angle and locked to the chest, the weight goes onto the lead leg
    coil: { yaw: 15, twist: 6, lkf: 12, lean: 2, lx: 0.1, ly: 0, lz: 0.12, le: 0.9, lc: 1 }, // (onto the bent lead knee)
    links: {
      drive: { lfw: -38, lfp: 20, lkx: -26, lkf: -6, hz: 0.05, lx: 0.02, ly: 0.02, lz: 0.06, le: 1, lc: 1 }, // the lead foot and knee turn in and the knee straightens, the arm stays locked
      hips: { yaw: -26, hx: -0.02, hy: -0.02 },
      trunk: { twist: -26, side: -4, rz: -0.02, ry: 0.03 },
      shoulder: {},
      elbow: {}
    },
    /* the stomp: the lead foot lifted over his lead foot in the wind-up (the eyes going down to it, blatant) and put down
       on his instep as the legs drive, the weight coming onto it: the stomp is the hook's drive (lifted by its knee, bent
       `knee` degrees at the top of the blatant one's lift, as much less as the lift is less). If it comes down within
       12 cm of his instep he is pinned there for 0.45 s. Blatant, the foot stays and grinds until the hand is home; a
       legend's comes off 50 ms after the hook lands. A foot is reckoned with the leg behind it, 12 kg; its ball can reach
       0.32 m. */
    foul: { name: 'stomp', lift: [0.06, 0.02], knee: 35, look: [8, 0], sink: 0.04, near: 0.12, reach: 0.32, mass: 12, pin: 0.45, off: [null, 0.05] }
  },
  upper: {
    hand: 'R', arm: 'lift', kind: 'upper', reach: 0.9, close: 0.8,
    chain: { coil: 0.09, rate: [44, 36, 52, 52, 0], skip: ['elbow'], turn: [32, 26], locked: true },
    /* (a punch that comes up out of the knees goes down into them further, and is lifted enough by them to need little more
       of a better man's turn, or of his head off the line, before the chin is over it; and with the bounce in it already,
       half the bounce goes on under it) */
    body: { dip: 1.2, turn: 0.3, off: 0.5, lively: 0.5 },
    coil: { lkf: 16, rkf: 16, lean: 9, yaw: -6, side: -7, rx: 0.02, ry: -0.18, rz: 0.02, hp: 4, st: -0.01 }, // down onto bent knees, the hand dropped (as far as the hips can be let down in the time)
    links: {
      drive: { lkf: -6, rkf: -6, st: 0.02, rfw: 32, rfp: 28 }, // the legs straighten under it (as far as a body driven up can be stopped again by gravity)
      hips: { yaw: 26, hz: 0.09 },
      trunk: { twist: 26, lean: -5, side: 3, lz: -0.06 },
      shoulder: {},
      elbow: {}
    }
  },
  /* ---- a show-off's (anim/show.mjs, docs/moves-plan-4.md §5.3): the flicker, the jab a press may turn into at 4암 and 5암. The
     lead hand let down at his waist (low: it goes from there and comes back there, not to the guard) is whipped up at a slant
     onto the head: the shoulder hardly turns, the elbow straightens and the wrist snaps over at the end (`snap`, metres the
     glove goes on with it). Quick and light: the arm is loose (`firm`), and so little of the body is behind it. A great dirty
     fighter swings it big (his body behind it as written), a legend flicks it off the wrist (`body`, [4암, 5암]: how much of
     the written turn each puts into it). */
  flicker: {
    hand: 'L', arm: 'straight', kind: 'straight', low: true, reach: 1.15, close: 1.0, snap: 0.03, flick: [0.6, 0.4],
    chain: { coil: 0, rate: [40, 40, 46, 48, 56], turn: [5, 6], firm: 0.15 },
    body: { off: 0.3, dip: 0.3, sep: 0.2, tuck: 0.5, over: 0.3 },
    coil: {},
    links: { drive: { hz: 0.03, lfz: 0.03, lkf: 3 }, hips: { yaw: -5 }, trunk: { twist: -8, lean: 2, lkf: -4 }, shoulder: {}, elbow: {} }
  },
  /* ---- right up close (game/bout.mjs: RULES.inside, centre to centre; the power chain there is the inside hook and the inside
     uppercut, in turn). Each is its long-range punch thrown with more of the body and less of the arm. */
  /* The inside hook (docs/moves-plan-4.md §1): thrown at 0.64 m, the arm folded tighter to the chest, wound up further (the
     hips and the chest turned to his left, the weight onto the bent lead knee), and the hips and the chest turned further
     through it, both feet turning: the lead foot in on its ball, its heel up, the lead knee turned in over it and
     straightening as the weight goes back onto the rear foot, the rear foot turning out. The head stays on the axis of the
     turn and ends a few centimetres toward the rear foot. It lands on its sweep the way the hook does (animator: sweep). */
  hookIn: {
    hand: 'L', arm: 'swing', kind: 'hook', reach: 0.74, close: 0.64, land: 0.7, tight: true, most: 30, ahead: 35,
    // (set: the share of the wind-up that is the arm being set, which no grade leaves out: a hook's is most of it, this one's,
    // its arm half folded at the chest already, a little over half)
    chain: { coil: 0.085, rate: [48, 28, 36, 60, 0], skip: ['elbow'], turn: [40, 36], locked: true, set: 0.6 },
    body: { turn: 1, off: 0, bend: 0, tuck: 0, sep: 0.5, dip: 1.5, lively: 0, over: 0.2 },
    // (the fist kept low at the chest and the elbow only half out through the wind-up: right up close, a glove raised out of
    // the guard is in his face; it is raised and sent out with the drive: tight)
    coil: { yaw: 22, twist: 10, lkf: 16, lean: 2, hz: 0.02, lx: 0.05, ly: -0.03, lz: 0, le: 0.6, lc: 1 },
    links: {
      drive: { lfw: -50, lfp: 28, lkx: -32, lkf: -24, rkf: 8, rfw: 14, hz: 0.02, le: 1, lc: 1 },
      hips: { yaw: -40, hx: -0.03, hy: -0.02 },
      trunk: { twist: -36, side: -4, hx: -0.02, hz: -0.03, rz: -0.02, ry: 0.03 },
      shoulder: {},
      elbow: {}
    }
  },
  /* The inside uppercut (§2): the knees are the spring. Down onto both knees (the rear one more), the waist hardly bent, the
     rear hand dropped to his belt with the elbow at his side and the palm up; then the knees straighten all the way and the
     hips come up under it, the heels off the canvas, the body stretched a little, the waist laid back as it comes, and the
     fist comes straight up between the other man's gloves to the chin (under: the hand is taken under the target as the
     legs drive, `under` metres short of it so that it comes up in front of his chest, and the last of its way is upright;
     the bent arm reaches `bent` from the shoulder). How it goes down and comes up is the grade's (skill.mjs: chain.spring). */
  upperIn: {
    hand: 'R', arm: 'lift', kind: 'upper', reach: 0.74, close: 0.64, under: 0.18, bent: 0.5,
    chain: { coil: 0.18, rate: [40, 36, 52, 52, 0], skip: ['elbow'], turn: [20, 22], locked: true, set: 0, spring: true },
    body: { dip: 0.5, turn: 0.3, off: 0.5, lively: 0, over: 0.2 },
    coil: { lkf: 30, rkf: 34, lean: 9, yaw: -6, side: -4, rx: 0.06, ry: -0.3, rz: 0.1, re: -0.2, hp: 4, st: -0.01 },
    links: {
      // (the hand kept down at his belt as the legs drive, as low as the bent arm lets it: the shoulder brings it up, all of it)
      drive: { lkf: -38, rkf: -42, st: 0.02, rfw: 30, rfp: 30, lfp: 14, ry: -0.6 },
      hips: { yaw: 20, hz: 0.08 },
      trunk: { twist: 22, lean: -8, side: 3, lz: -0.06 },
      shoulder: {},
      elbow: {}
    }
  }
};
for (const [name, punch] of Object.entries(PUNCHES)) {
  for (const amounts of [punch.coil, ...Object.values(punch.links)]) for (const ch of Object.keys(amounts)) if (!CHANNELS.includes(ch)) throw new Error(`${name}: unknown channel ${ch}`);
  Object.assign(punch, { name, punch: true });
}

/* His stance is turned to his right, so a bend to his left, as the trunk sees it, would carry the head forward into the
   punch as well as across. In a sided move (a slip, a roll) every degree of bend to the left is made up of a little more
   bend and a sit back, so that the head goes straight across either way. (Measured: both slips take the head 28-33 cm
   across and less than 1 cm toward the other man.) */
export const LEFT_BEND = { side: 0.375, lean: -0.69 };
/* A sided move is written going to his left (+1); to his right, what it says of each knee is said of the other one. */
export function mirrorKnees(c) {
  for (const [a, b] of [['lkf', 'rkf'], ['lkx', 'rkx']]) {
    const x = c[a] || 0;
    c[a] = c[b] || 0;
    c[b] = x;
  }
}

/* How a man goes down, and the way up. Laid out, he is a body (phys/fall.mjs: ko from a straight punch or an uppercut,
   slump from a hook, the same body either way, the blow's direction is what differs), and the way up is chosen by how he
   came to rest: off his back, off his front, off his side. Dropped to a knee, he means it, and gets up off the knee.
   Knocked out cold (out from a hook or an uppercut, limp; outStiff from a jab or a cross, stiff as a log) there is no way
   up: he lies there. */
export const RISE = { drop: 'riseKnee', dropLiver: 'riseLiver' };
export const LIE = { back: 'rise', front: 'riseFront', side: 'riseSide' };
/* Where each way up has his hips at the end of its first part, and which way his body lies along the canvas there (from
   his hips to his head, radians from straight ahead): a man getting up where he lies is turned and moved so that his hips
   and that line are where he lies (bout.mjs: getUp), and the rise is blended out of the pose he lay in over that first
   part (`blend`, seconds). */
export const UP = { rise: { hips: [0, -0.22], heading: Math.PI }, riseFront: { hips: [0, -0.02], heading: 0 }, riseSide: { hips: [0, -0.02], heading: 0 } };

// the far points of the evasions (the duck's knees come after its waist, so they are keyed apart)
const SLIP = { side: 11, hx: 0.13, lean: 6, hw: 8, hr: 6, lx: 0.02, rx: 0.02, lkf: 14, rkf: -4 };
const DUCK = { lean: 34, hp: 12, hz: -0.22, hx: 0.14, lfp: 6, rfp: 10 };
const PULL = { hz: -0.17, lean: -17, hp: -9, lfp: 10, lfz: 0.01, ly: 0.02, ry: 0.02, lkf: -10, rkf: 16 };

// the poses the ways up go through, as channels: kneeling on the rear knee with the rear glove down by the lead foot, on
// hands and knees, sitting up with the hands behind
const KNEEL = { hy: -0.515, hz: -0.1, lean: 58, hp: 12, hr: 4, side: -16, yaw: 6, lx: 0.08, ly: -0.42, lz: 0.05, rx: -0.2, ry: -1.29, rz: -0.02, re: 0.3, rg: 1, rfx: -0.05, rfz: -0.16, rfp: 53, rk: 1, lfz: 0.12 };
const FOURS = { hy: -0.385, hz: 0, tip: 42, lean: 28, yaw: 28, twist: 10, hp: 6, lx: 0.1, ly: -1.3, lz: 0.17, lg: 1, rx: -0.1, ry: -1.285, rz: 0.33, rg: 1, le: 0.3, re: 0.3, lfz: -0.68, lfp: 60, lk: 1, rfz: -0.2, rfp: 55, rk: 1 };
const SIT = { hy: -0.755, hz: -0.22, lean: -30, hp: 10, lx: 0.2, ly: -1.3, lz: -0.87, lg: 1, rx: -0.2, ry: -1.285, rz: -0.71, rg: 1, lfz: -0.03, rfz: 0.4, rfw: 30 };
// (between them: the rear knee drawn in under him off his seat, and the lead foot brought up off all fours)
const TUCK = { hy: -0.62, hz: -0.18, lean: 8, side: -8, hp: 8, lx: 0.08, ly: -1.3, lz: -0.35, lg: 1, rx: -0.24, ry: -1.285, rz: -0.25, rg: 1, lfz: 0.05, rfx: -0.08, rfz: -0.1, rfp: 35, rk: 1 };
// (getting up, the lead hand is brought up off the canvas round the front of him, the elbow first: on the knee it is still on
// its way, low in front of him and the elbow out)
const KNEEL_UP = { ...KNEEL, lx: 0.1, ly: -0.72, lz: 0.16, le: 0.35 };
/* (down from a blow to the liver, docs/moves-plan-5.md §3.5: the same kneel, bent further over to his right, the rear elbow
   clamped to his side over the liver and its glove at his belly, and the lead glove put down on the canvas instead; on the
   way down, folded over it, the rear knee going; and before that, still up, his lead glove drawn in and down off the guard, a
   hurt man's, out of the way of the arm that has just hit him going home) */
const KNEEL_LIVER = { ...KNEEL, lean: 62, side: -22, hp: 16, lx: 0.2, ly: -1.29, lz: -0.02, lg: 1, le: 0.3, rx: -0.02, ry: -0.34, rz: -0.06, re: 0, rc: 1, rg: 0 };
const FOLD_LIVER = { hy: -0.2, lean: 30, side: -10, hp: 14, hr: -4, rx: -0.02, ry: -0.3, rz: -0.06, rc: 1, lx: 0.04, ly: -0.2 };
const HURT_LIVER = { ly: -0.06, lz: -0.08 };
const AT_REST = pose => Object.fromEntries(Object.keys(pose).map(ch => [ch, 0]));
const STEP = { hy: -0.4, hz: -0.04, tip: 30, lean: 34, yaw: 20, twist: 8, hp: 8, lx: 0.1, ly: -1.3, lz: 0.15, lg: 1, rx: -0.1, ry: -1.285, rz: 0.3, rg: 1, le: 0.3, re: 0.3, lfz: -0.22, lfy: 0.05, lfp: 15, rfz: -0.2, rfp: 55, rk: 1 };
const UP_HALF = { hy: -0.34, hz: -0.04, lean: 28, hp: 16, lx: 0.06, ly: -0.3, rx: -0.04, ry: -0.6, rz: 0.18, rg: 0.3, side: 3, yaw: 4, rfz: -0.16, rfp: 36, rk: 0.2, lfz: 0.06 };
const UP_NEAR = { hy: -0.08, lean: 10, hp: 4, hw: 10, ly: -0.08, ry: -0.1 };
const UP_DONE = { hy: -0.04, lean: 6, hw: -8, hr: 4, ly: -0.04, ry: -0.05 };

export const MOVES = Object.assign(
  {},
  PUNCHES,
  Object.fromEntries(
  Object.entries({
    // ---- defence and being hit. These are shapes the body takes; how long it holds them is the rules' business.
    // the tight guard, mixed in by how much the boxer is covering up
    // (the knees a little more bent under it: the hips 3.5 cm down)
    cover: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: -0.07, ly: 0.115, lz: -0.03, rx: -0.02, ry: 0.135, rz: 0.1, lean: 6, lkf: 11, rkf: 11, hp: 7, hz: -0.01 }] },
    /* the gloves of a guard put up to meet a punch, mixed in while it is young enough to turn one aside: open, out in front
       of the face, the rear one across to catch a jab */
    meet: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lz: 0.05, ly: 0.01, lx: -0.02, rz: 0.08, rx: 0.05, ry: 0.02, re: 0.15, twist: -3 }] },
    /* a quick step: the body sinks into it and comes up out of it (which way it leans is added from the step's direction,
       and what the knees do, from which leg pushes and which lands: the animator) */
    dash: { dur: 0.3, keys: [{ t: 0.07, e: 'out', st: -0.035, ly: -0.03, ry: -0.03 }] },
    // a punch turned aside: the puncher's arms are thrown open and he is carried back onto his heels
    reel: {
      dur: 0.62,
      keys: [{ t: 0.1, e: 'out', lean: -15, hz: -0.1, hy: 0.01, lx: 0.2, ly: 0.08, lz: -0.14, rx: -0.2, ry: 0.1, rz: -0.1, hp: -12, le: 0.5, re: 0.5 }, { t: 0.3, lean: -9, hz: -0.07, lx: 0.12, ly: 0.02, lz: -0.08, rx: -0.12, ry: 0.03, rz: -0.06, hp: -5 }]
    },
    /* a punch hammered down (a show-off's parry, anim/show.mjs): the arm that threw it knocked down and falling away, the
       shoulder dragged down after it and the head left forward, open. Written for the lead hand; the rear's is the mirror
       (the animator swaps the hands: `hand`) */
    hammered: {
      hand: true,
      dur: 0.6,
      keys: [{ t: 0.08, e: 'out', ly: -0.34, lz: -0.1, lx: -0.03, le: -0.2, side: 4, lean: 5, hp: 5, twist: -5 }, { t: 0.32, e: 'lin', ly: -0.28, lz: -0.08, lx: -0.02, le: -0.15, side: 3, lean: 4, hp: 3, twist: -4 }]
    },
    /* a punch pressed down (a clean great one's down parry, anim/clean.mjs: patDown): the arm that threw it pressed down where
       it was met, `drop` metres (the animator holds the glove there and lets it down: clean.mjs pattedArm), the shoulder
       dragged down after it and the head brought forward, open; not knocked back. Shorter than a parry's reel or a hammer's,
       and the counter comes the sooner. Written for the lead hand; the rear's is the mirror (`hand`) */
    patted: {
      hand: true,
      dur: 0.4,
      drop: 0.2,
      keys: [{ t: 0.07, e: 'out', side: 5, lean: 6, hz: 0.03, hp: 5, twist: -5 }, { t: 0.28, e: 'lin', side: 4, lean: 5, hz: 0.025, hp: 4, twist: -4 }]
    },
    // knocked down and out: a body (phys/fall.mjs); these only say so, and how long before he is lying still
    ko: { floor: true, stay: true, fall: true, dur: 1.2, keys: [] },
    slump: { floor: true, stay: true, fall: true, dur: 1.2, keys: [] },
    // knocked out cold (docs/moves-plan-4.md §6): the same body let go of another way, and he does not get up
    out: { floor: true, stay: true, fall: true, faint: 'limp', dur: 1.2, keys: [] },
    outStiff: { floor: true, stay: true, fall: true, faint: 'log', dur: 1.2, keys: [] },
    /* a slip: the head taken off the line of a punch, bent and dipped to one side and straight back (which side is the
       action's: see the animator): the knee on that side bends and takes the weight, the other straightens, and the bend
       at the side is the less for it */
    slip: {
      sided: true,
      dur: 0.42,
      keys: [{ t: 0.1, e: 'out', ...SLIP }, { t: 0.2, e: 'lin', ...SLIP }]
    },
    /* a duck: down into the knees, not a bow. The waist goes first (it is quick, and the knees can let the hips down only
       so fast: animator.mjs, FALL), the knees take it over and go on down under it, and the hips go down and back over
       his heels and across to his left, so that the head, leant forward in a stance turned to his right, goes straight
       down and not in toward the hook: the head goes down most of all by the knees. And not quite straight down and up:
       a little of a weave in it, the head drawing a shallow U, a few centimetres down toward the side the hook comes from
       (his right: the knee on that side bends first), through the bottom on both knees, and up a little on the other
       side, the weight going over onto that knee and the shoulders rolling with it (the side is the one he comes up on:
       true is his left). The chin on the chest, the gloves still at the face. */
    duck: {
      sided: true,
      dur: 0.64,
      keys: [
        { t: 0.09, e: 'out', ...DUCK },
        { t: 0.12, side: -3, hr: -3, twist: -2 },
        { t: 0.22, rkf: 63 },
        { t: 0.24, lkf: 58 },
        { t: 0.3, side: 0, hr: 0, twist: 0 },
        { t: 0.4, e: 'lin', ...DUCK, lkf: 58, rkf: 63, side: 0, hr: 0, twist: 0 },
        { t: 0.5, lkf: 42, rkf: 41, side: 3, hr: 3, twist: 2 }
      ]
    },
    /* bob and weave: down to one side, under, and up on the other, the head drawing a U (the side is the one he comes up
       on), and the knees draw it: the knee on the side he goes in on bends first, both are bent under it, and the knee on
       the side he comes up on takes him up while the other straightens and pushes, the weight going over from one foot to
       the other. The waist bends with it, less. */
    roll: {
      sided: true,
      dur: 0.52,
      keys: [
        { t: 0.1, e: 'out', hz: -0.06, side: -16, hx: -0.11, lean: 14, hw: -8, hr: -6, lfp: 6, rfp: 10, lkf: 4, rkf: 30 },
        { t: 0.22, hz: -0.08, side: 0, hx: 0, lean: 24, hp: 8, hw: 0, hr: 0, lfp: 8, rfp: 14, lkf: 45, rkf: 45 },
        { t: 0.36, hz: -0.04, side: 16, hx: 0.11, lean: 12, hp: 3, hw: 8, hr: 6, lfp: 4, rfp: 8, lkf: 30, rkf: -5 }
      ]
    },
    /* a sway: the weight rocked onto the back foot, sat down on the bent rear leg, the lead leg straightening, and the
       trunk drawn up and back, so the head is just out of reach */
    pull: {
      dur: 0.5,
      keys: [{ t: 0.12, e: 'out', ...PULL }, { t: 0.26, e: 'lin', ...PULL }]
    },
    // up off his back: sitting up on his hands behind him, over onto the rear knee, and up, a little unsteady
    rise: {
      floor: true, dur: 2.3, blend: 0.8,
      keys: [{ t: 0.02, e: 'lin', ...SIT }, { t: 0.7, ...SIT }, { t: 1.1, ...TUCK }, { t: 1.4, ...KNEEL_UP }, { t: 1.75, ...UP_HALF }, { t: 2.0, ...UP_NEAR }, { t: 2.15, ...UP_DONE }]
    },
    /* dropped: the legs go, he sags, and the rear knee and the rear glove go down onto the canvas (the solver puts them on
       it); he stays there, head down. He means this one, so it is a move, not a fall. */
    drop: {
      floor: true, stay: true, dur: 0.9,
      keys: [
        { t: 0.2, e: 'out', hy: -0.2, lean: 14, hp: 20, hr: 8, lx: 0.04, ly: -0.2, rx: -0.04, ry: -0.24, side: 4 },
        { t: 0.7, ...KNEEL, rg: 0.9, ry: -1.25 },
        { t: 0.9, ...KNEEL }
      ]
    },
    // up off a knee: the glove pushes off the canvas, the rear foot comes under him, and he is up, shaking it off
    riseKnee: {
      floor: true, dur: 1.15,
      keys: [{ t: 0.02, e: 'lin', ...KNEEL }, { t: 0.4, ...UP_HALF }, { t: 0.75, ...UP_NEAR }, { t: 0.95, ...UP_DONE }]
    },
    /* doubled up by a blow to the body (docs/moves-plan-5.md §3.5; game/bout.mjs: RULES.body): nothing of his own for a
       moment (`late`: the blow's give is all there is, anim/body.mjs), and then the legs go: folded over it, the rear elbow
       clamped to the liver and the rear knee buckling, down onto the rear knee and the lead glove. He means to get up, and
       does, off the knee, the rear hand leaving his side last. */
    dropLiver: {
      floor: true, stay: true, dur: 1.05,
      // (the hips let down all the way from the moment the legs go, as fast as he can fall and stop on the knee: animator.mjs FALL)
      keys: [{ t: 0.15, ...HURT_LIVER }, { t: 0.4, ...AT_REST({ ...KNEEL_LIVER, ...FOLD_LIVER }), ...HURT_LIVER }, { t: 0.52, e: 'out', ...FOLD_LIVER }, { t: 0.85, ...KNEEL_LIVER }, { t: 1.05, ...KNEEL_LIVER }]
    },
    riseLiver: {
      floor: true, dur: 1.15,
      keys: [{ t: 0.02, e: 'lin', ...KNEEL_LIVER }, { t: 0.4, ...UP_HALF }, { t: 0.75, ...UP_NEAR }, { t: 0.95, ...UP_DONE }]
    },
    // up off his front: pushed up onto his hands and knees, onto the rear knee, and up
    riseFront: {
      floor: true, dur: 2.3, blend: 1,
      keys: [{ t: 0.02, e: 'lin', ...FOURS }, { t: 0.8, ...FOURS }, { t: 1.05, ...STEP }, { t: 1.35, ...KNEEL_UP }, { t: 1.7, ...UP_HALF }, { t: 1.95, ...UP_NEAR }, { t: 2.1, ...UP_DONE }]
    },
    // up off his side: rolled over onto his hands and knees as he pushes up, and on as from his front
    riseSide: {
      floor: true, dur: 2.4, blend: 1.1,
      keys: [{ t: 0.02, e: 'lin', ...FOURS }, { t: 0.9, ...FOURS }, { t: 1.15, ...STEP }, { t: 1.45, ...KNEEL_UP }, { t: 1.8, ...UP_HALF }, { t: 2.05, ...UP_NEAR }, { t: 2.2, ...UP_DONE }]
    },
    /* ---- in and out (docs/moves-plan-4.md §3, §4). How far he goes, and where to, is the bout's (game/bout.mjs: travel);
       these are the body that goes there, and each grade's way of doing it (anim/skill.mjs: entry, away; the animator). */
    /* The duck in: down into both knees (the rear one more) and a little at the waist at once, the hips back over his heels
       so the head goes down and not forward into the other man's lead arm, the head off to his right, outside the other
       man's jab, the gloves pulled in tight on the face; the rear leg straightens and pushes him in, low (and in a little to
       his right of the line to him, outside the other man's lead arm: game/bout.mjs, plan); the lead foot lands and the knees take it, and he comes up, but the knees stay bent a moment: that bend is
       the wind-up of an inside hook or an inside uppercut thrown out of it (game/bout.mjs: a punch out of the end of it is
       loaded, by his grade). */
    duckIn: {
      dur: 0.62,
      keys: [
        { t: 0.1, e: 'out', lean: 16, hp: 10, hx: -0.07, side: -4, lkf: 50, rkf: 56, hz: -0.06, lx: -0.04, ly: 0.06, lz: -0.12, rx: 0.02, ry: 0.06, rz: -0.06 },
        { t: 0.18, e: 'lin', lean: 16, hp: 10, hx: -0.07, side: -4, lkf: 50, rkf: 30, hz: -0.06, lx: -0.04, ly: 0.06, lz: -0.12, rx: 0.02, ry: 0.06, rz: -0.06 },
        { t: 0.26, lean: 12, hp: 8, hx: -0.06, side: -3, lkf: 34, rkf: 6, hz: -0.06, lx: -0.04, ly: 0.06, lz: -0.12, rx: 0.02, ry: 0.06, rz: -0.06 },
        { t: 0.4, lean: 8, hp: 3, hx: -0.03, side: -1, lkf: 22, rkf: 22, lx: -0.02, ly: 0.03, rx: 0.01, ry: 0.03 },
        { t: 0.55, e: 'lin', lean: 5, hp: 2, lkf: 20, rkf: 20 }
      ]
    },
    /* Moving away with the guard let go of (§4): the hands dropped to below the chest, loose, the trunk upright and the chin
       up a little, bouncing off the ankles with the heels off the canvas, away out of range: pivoted off the line on the
       ball of the lead foot and then hopped back (hopPivot), or hopped round him, still facing him (hopCircle). The hands
       come back up over the last hop. The rest of it, the bounce and the hands' swing, is the animator's. */
    hopPivot: { dur: 0.92, keys: [] },
    hopCircle: { dur: 0.86, keys: [] },
    // (the wave, a clean great one's circling at the end of his reach: held as long as its button is, anim/clean.mjs)
    wave: { dur: 1, keys: [] },
    /* ---- a show-off's taunts (anim/show.mjs, docs/moves-plan-4.md §5.4): no guard while they last, and anything he does puts
       an end to them (game/bout.mjs). Written as the plan's lengths; a grade stretches and shrinks them (skill.mjs:
       stance.show, long and size). */
    // the lead glove held out and beckoned twice, palm up, the chin up at him, the rear hand let down
    beckon: {
      taunt: true, dur: 0.6,
      keys: [
        { t: 0.14, lz: 0.2, ly: 0.04, lx: -0.04, le: 0.25, ry: -0.12, rz: -0.03, hp: -5 },
        { t: 0.24, lz: 0.12, ly: 0.08, lx: -0.04, le: 0.25, ry: -0.12, rz: -0.03, hp: -5 },
        { t: 0.33, lz: 0.2, ly: 0.04, lx: -0.04, le: 0.25, ry: -0.12, rz: -0.03, hp: -5 },
        { t: 0.43, lz: 0.12, ly: 0.08, lx: -0.04, le: 0.25, ry: -0.12, rz: -0.03, hp: -5 },
        { t: 0.5, lz: 0.16, ly: 0.05, lx: -0.04, le: 0.2, ry: -0.1, rz: -0.02, hp: -4 }
      ]
    },
    // both hands let down, the chin pushed out at him and rocked from side to side
    chinOut: {
      taunt: true, dur: 0.7,
      keys: [
        { t: 0.15, ly: -0.26, ry: -0.24, lx: 0.05, rx: -0.05, lz: -0.04, hp: -10, hz: 0.02, side: 4, hw: 10 },
        { t: 0.33, ly: -0.26, ry: -0.24, lx: 0.05, rx: -0.05, lz: -0.04, hp: -10, hz: 0.02, side: -4, hw: -10 },
        { t: 0.5, ly: -0.26, ry: -0.24, lx: 0.05, rx: -0.05, lz: -0.04, hp: -10, hz: 0.02, side: 4, hw: 10 },
        { t: 0.6, ly: -0.2, ry: -0.18, lx: 0.04, rx: -0.04, lz: -0.03, hp: -7, hz: 0.01, side: 0, hw: 0 }
      ]
    },
    // the hands thrown open, palms up, the shoulders up round the ears (the head sunk between them)
    shrug: {
      taunt: true, dur: 0.4,
      keys: [{ t: 0.12, e: 'out', lx: 0.14, rx: -0.14, ly: -0.12, ry: -0.12, lz: -0.06, rz: 0.03, le: 0.5, re: 0.5, hp: 7, lean: -3 }, { t: 0.28, lx: 0.14, rx: -0.14, ly: -0.12, ry: -0.12, lz: -0.06, rz: 0.03, le: 0.5, re: 0.5, hp: 7, lean: -3 }]
    },
    /* the windmill: the rear arm swung round once in front of his rear side, down, back, up and over, and on into the start
       of a bolo punch (a circle kept in front of him: no shoulder swings a whole arm round behind)*/
    wind: {
      taunt: true, dur: 0.8,
      keys: [
        { t: 0.1, rx: -0.08, ry: -0.18, rz: 0.16, re: 0.2, yaw: 3 },
        { t: 0.22, rx: -0.1, ry: -0.34, rz: 0.02, re: 0.2, yaw: 6 },
        { t: 0.34, rx: -0.1, ry: -0.2, rz: -0.1, re: 0.2, yaw: 8 },
        { t: 0.46, rx: -0.08, ry: -0.04, rz: 0.02, re: 0.2, yaw: 5 },
        { t: 0.56, rx: -0.06, ry: -0.16, rz: 0.16, re: 0.2, yaw: 0 },
        { t: 0.66, e: 'out', rx: -0.03, ry: -0.12, rz: 0.24, re: 0.15, yaw: -4, twist: 6 }
      ]
    },
    // the rear glove tapped on his own chin, twice, offering it, the lead hand let down
    tapChin: {
      taunt: true, dur: 0.5,
      keys: [
        { t: 0.1, rx: 0.04, ry: -0.04, rz: -0.02, re: 0.2, hp: -6, ly: -0.14 },
        { t: 0.18, rx: 0.06, ry: -0.06, rz: -0.05, re: 0.2, hp: -6, ly: -0.14 },
        { t: 0.26, rx: 0.04, ry: -0.04, rz: -0.02, re: 0.2, hp: -6, ly: -0.14 },
        { t: 0.34, rx: 0.06, ry: -0.06, rz: -0.05, re: 0.2, hp: -6, ly: -0.14 },
        { t: 0.42, rx: 0.03, ry: -0.03, rz: -0.01, re: 0.15, hp: -4, ly: -0.1 }
      ]
    },
    // arms up, mixed in for the winner
    cheer: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: 0.2, ly: 0.52, lz: -0.2, rx: -0.2, ry: 0.55, rz: -0.02, le: 0.7, re: 0.7, lean: -15, yaw: 24, twist: 8, hp: -10, hy: 0.04 }] }
  }).map(([name, def]) => [name, compile(Object.assign({ name }, def))])
  )
);
