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
     lfx lfy lfz lfw lfp   left foot: metres across, up, ahead; degrees turned out, heel raised
     rfx rfy rfz rfw rfp   right foot
     st                taller and thinner by this share
     aim               how much the punching hand is steered onto the target (0..1) */

export const CHANNELS = ['hx', 'hy', 'hz', 'lean', 'tip', 'yaw', 'side', 'twist', 'hp', 'hw', 'hr', 'lx', 'ly', 'lz', 'le', 'lc', 'rx', 'ry', 'rz', 're', 'rc',
  'lfx', 'lfy', 'lfz', 'lfw', 'lfp', 'rfx', 'rfy', 'rfz', 'rfw', 'rfp', 'st', 'aim'];

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
          'lift'      the arm is held bent, the legs and trunk drive it up, the shoulder closes the last of it
     chain: { coil: seconds of wind-up, rate: how fast each joint's muscle is (rad/s natural frequency), skip: joints held
              still, turn: degrees the hips and trunk turn through, locked: the arm is stiff from the start }
     reach: about how far away, centre to centre, it can land (the rival's judgment and the step in; the hit itself is
            the glove meeting the head); close: the distance he steps in to
     dirty: [the foul a dirty boxer folds into it, and the second one a legend adds] (anim/skill.mjs), each in two parts:
            set: what goes with the punch as it is thrown, only what does not move the punching glove (the elbow raised
                 higher, flare; the other hand, the feet, the head: body channels), so the punch lands where it would have
            follow: what comes after it has landed, while he is still in the other man's face: the punching hand on past
                 the chain's line (hand, metres in his terms) and the body driven on after it (body) */
const PUNCHES = {
  jab: {
    hand: 'L', arm: 'straight', kind: 'straight', reach: 1.15, close: 1.0,
    chain: { coil: 0, rate: [58, 52, 52, 46, 44], turn: [15, 8] },
    coil: {},
    links: { drive: { hz: 0.06, lfz: 0.07 }, hips: { yaw: -15, rx: 0.02, ry: 0.03 }, trunk: { twist: -8, lean: 4, hp: 3 }, shoulder: {}, elbow: {} },
    // the laces raked down his face after it lands; then the rear hand pinning his lead glove, and a foot on his
    dirty: [
      { set: { flare: 0.3 }, follow: { hand: [-0.06, -0.2, -0.02], body: { hp: 4, lean: 4 } } }, // the elbow up, the laces raked down his face
      { set: { body: { rz: 0.17, ry: -0.05, rx: 0.08, lfz: 0.06 } } } // the rear hand pinning his lead glove down, a foot on his
    ]
  },
  cross: {
    hand: 'R', arm: 'straight', kind: 'straight', reach: 1.15, close: 1.0,
    chain: { coil: 0.05, rate: [52, 44, 46, 50, 52], turn: [61, 18] },
    coil: { yaw: -7, hz: -0.025, hy: -0.015, rz: -0.04, ry: -0.02 },
    links: {
      drive: { rfw: 40, rfp: 24, rfz: 0.05, hz: 0.11, hy: -0.03, st: 0.02 }, // the rear foot turns on its ball and pushes
      hips: { yaw: 54, hx: 0.03 },
      trunk: { twist: 18, lean: 7, side: 3, lx: -0.04, ly: 0.03, lz: -0.1 }, // the other hand stays at the chin
      shoulder: {},
      elbow: {}
    },
    // the forearm and shoulder driven on through his face after the fist; then the lead hand round his neck, holding him on it
    dirty: [
      { set: { flare: 0.65 }, follow: { hand: [0.13, -0.03, -0.2], body: { twist: 10, lean: 9, hz: 0.07 } } }, // the arm folded and the forearm driven into his face
      { set: { body: { lz: 0.21, ly: 0.08, lx: -0.07, hp: -4 } } } // the lead hand round his neck, holding him on it
    ]
  },
  hook: {
    hand: 'L', arm: 'swing', kind: 'hook', reach: 0.9, close: 0.82,
    chain: { coil: 0.085, rate: [55, 42, 44, 60, 0], skip: ['elbow'], turn: [59, 26], locked: true },
    // the arm is set at a right angle and locked to the chest, the weight goes onto the lead leg
    coil: { yaw: 15, twist: 6, hx: 0.03, hy: -0.035, lean: 2, lx: 0.1, ly: -0.05, lz: 0.12, le: 0.9, lc: 1 },
    links: {
      drive: { lfw: -38, lfp: 20, hz: 0.05, lx: 0.02, ly: 0.02, lz: 0.14, le: 1, lc: 1 }, // the lead foot turns in, the arm stays locked
      hips: { yaw: -44, hx: -0.02, hy: -0.02 },
      trunk: { twist: -20, side: -4, rz: -0.02, ry: 0.03 },
      shoulder: {},
      elbow: {}
    },
    // the elbow raised and carried on through after the fist has landed; then the rear hand holding him, a foot on his
    dirty: [
      { set: { flare: 0.85 }, follow: { hand: [-0.06, 0.1, -0.24], body: { yaw: -10, hz: 0.05, lean: 5 } } }, // the arm folded back and the elbow on into his face
      { set: { body: { rz: 0.19, ry: 0.03, rx: 0.07, lfz: 0.07 } } } // the rear hand holding him, a foot on his
    ]
  },
  upper: {
    hand: 'R', arm: 'lift', kind: 'upper', reach: 0.9, close: 0.8,
    chain: { coil: 0.09, rate: [40, 44, 46, 52, 0], skip: ['elbow'], turn: [46, 12], locked: true },
    coil: { hy: -0.1, lean: 9, yaw: -6, side: -7, rx: 0.02, ry: -0.2, rz: 0.02, hp: 4, st: -0.04 }, // down onto bent knees, the hand dropped
    links: {
      drive: { hy: 0.035, st: 0.05, rfw: 32, rfp: 28 }, // the legs straighten under it
      hips: { yaw: 40, hz: 0.07 },
      trunk: { twist: 12, lean: -5, side: 3, lz: -0.06 },
      shoulder: {},
      elbow: {}
    },
    // the head driven up and in with it, into his face; then the lead hand pulling his head down onto both
    dirty: [
      { set: { body: { hp: 9 } }, follow: { body: { hz: 0.11, lean: 13, hy: 0.05, hp: 8 } } }, // the crown of the head down and in, then driven up into him
      { set: { body: { lz: 0.21, ly: -0.04, lx: -0.05 } } } // the lead hand pulling his head down onto both
    ]
  }
};
for (const [name, punch] of Object.entries(PUNCHES)) {
  for (const amounts of [punch.coil, ...Object.values(punch.links), ...(punch.dirty || []).flatMap(d => [(d.set || {}).body || {}, (d.follow || {}).body || {}])]) for (const ch of Object.keys(amounts)) if (!CHANNELS.includes(ch)) throw new Error(`${name}: unknown channel ${ch}`);
  Object.assign(punch, { name, punch: true });
}

/* His stance is turned to his right, so a bend to his left, as the trunk sees it, would carry the head forward into the
   punch as well as across. In a sided move (a slip, a roll) every degree of bend to the left is made up of a little more
   bend and a sit back, so that the head goes straight across either way. (Measured: both slips take the head 28-33 cm
   across and less than 1 cm toward the other man.) */
export const LEFT_BEND = { side: 0.375, lean: -0.69 };

/* How a man goes down, and the way up from each: off his back, off a knee, off his face. */
export const RISE = { ko: 'rise', drop: 'riseKnee', slump: 'riseFront' };

export const MOVES = Object.assign(
  {},
  PUNCHES,
  Object.fromEntries(
  Object.entries({
    // ---- defence and being hit. These are shapes the body takes; how long it holds them is the rules' business.
    // the tight guard, mixed in by how much the boxer is covering up
    cover: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: -0.07, ly: 0.115, lz: -0.03, rx: -0.02, ry: 0.135, rz: 0.1, lean: 6, hy: -0.035, hp: 7, hz: -0.01 }] },
    /* the gloves of a guard put up to meet a punch, mixed in while it is young enough to turn one aside: open, out in front
       of the face, the rear one across to catch a jab */
    meet: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lz: 0.05, ly: 0.01, lx: -0.02, rz: 0.08, rx: 0.05, ry: 0.02, re: 0.15, twist: -3 }] },
    // a quick step: the body sinks into it and comes up out of it (which way it leans is added from the step's direction)
    dash: { dur: 0.3, keys: [{ t: 0.07, e: 'out', hy: -0.075, st: -0.035, ly: -0.03, ry: -0.03 }] },
    // a punch turned aside: the puncher's arms are thrown open and he is carried back onto his heels
    reel: {
      dur: 0.62,
      keys: [{ t: 0.1, e: 'out', lean: -15, hz: -0.1, hy: 0.01, lx: 0.2, ly: 0.08, lz: -0.14, rx: -0.2, ry: 0.1, rz: -0.1, hp: -12, le: 0.5, re: 0.5 }, { t: 0.3, lean: -9, hz: -0.07, lx: 0.12, ly: 0.02, lz: -0.08, rx: -0.12, ry: 0.03, rz: -0.06, hp: -5 }]
    },
    // knocked out: the knees go, then the rest of him, onto his back
    ko: {
      floor: true, stay: true, dur: 1.2,
      keys: [
        { t: 0.24, e: 'out', hy: -0.2, lean: -12, hp: -22, lx: 0.08, ly: -0.3, lz: -0.06, rx: -0.08, ry: -0.3, rz: -0.02, yaw: 14, twist: 10 },
        { t: 0.72, e: 'in', hy: -0.735, hz: -0.5, tip: -76, lean: -8, hp: 12, lx: 0.46, ly: -0.02, lz: -0.25, rx: -0.58, ry: -0.15, rz: 0, le: 0.9, re: 0.9, yaw: 26, twist: 6, lfp: 20, rfp: 10, rfz: 0.16, rfw: 20 },
        { t: 0.86, e: 'out', hy: -0.7, tip: -72, hp: 2 },
        { t: 1.08, e: 'io', hy: -0.735, hz: -0.5, tip: -76, lean: -8, hp: 12, lx: 0.46, ly: -0.02, lz: -0.25, rx: -0.58, ry: -0.15, rz: 0, le: 0.9, re: 0.9, yaw: 26, twist: 6, lfp: 20, rfp: 10, rfz: 0.16, rfw: 20 }
      ]
    },
    // a slip: the head taken off the line of a punch, bent and dipped to one side and straight back (which side is the
    // action's: see the animator)
    slip: {
      sided: true,
      dur: 0.42,
      keys: [{ t: 0.1, e: 'out', side: 16, hx: 0.12, hy: -0.07, lean: 6, hw: 8, hr: 6, lx: 0.02, rx: 0.02 }, { t: 0.2, e: 'lin', side: 16, hx: 0.12, hy: -0.07, lean: 6, hw: 8, hr: 6, lx: 0.02, rx: 0.02 }]
    },
    // a duck: the knees go and he folds at the hips, chin on his chest, gloves still at his face, straight down and up
    duck: {
      dur: 0.5,
      keys: [{ t: 0.12, e: 'out', hy: -0.31, hz: -0.15, lean: 28, hp: 12, lfp: 8, rfp: 18 }, { t: 0.24, e: 'lin', hy: -0.31, hz: -0.15, lean: 28, hp: 12, lfp: 8, rfp: 18 }]
    },
    // bob and weave: down to one side, under, and up on the other, the head drawing a U (the side is the one he comes up on)
    roll: {
      sided: true,
      dur: 0.52,
      keys: [
        { t: 0.1, e: 'out', hy: -0.15, hz: -0.05, side: -16, hx: -0.11, lean: 16, hw: -8, hr: -6, lfp: 6, rfp: 10 },
        { t: 0.22, hy: -0.31, hz: -0.14, side: 0, hx: 0, lean: 28, hp: 12, hw: 0, hr: 0, lfp: 8, rfp: 18 },
        { t: 0.36, hy: -0.12, hz: -0.04, side: 16, hx: 0.11, lean: 12, hp: 4, hw: 8, hr: 6, lfp: 4, rfp: 8 }
      ]
    },
    // a sway: the weight rocked onto the back foot and the trunk drawn up and back, so the head is just out of reach
    pull: {
      dur: 0.5,
      keys: [{ t: 0.12, e: 'out', hz: -0.15, hy: -0.03, lean: -17, hp: -9, lfp: 16, lfz: 0.01, ly: 0.02, ry: 0.02 }, { t: 0.26, e: 'lin', hz: -0.15, hy: -0.03, lean: -17, hp: -9, lfp: 16, lfz: 0.01, ly: 0.02, ry: 0.02 }]
    },
    // up off the canvas: onto an elbow, a knee, and back into the guard, a little unsteady
    rise: {
      floor: true, dur: 1.7,
      keys: [
        { t: 0.02, e: 'lin', hy: -0.735, hz: -0.5, tip: -76, lean: -8, hp: 12, lx: 0.46, ly: -0.02, lz: -0.25, rx: -0.58, ry: -0.15, rz: 0, le: 0.9, re: 0.9, yaw: 26, twist: 6, lfp: 20, rfp: 10, rfz: 0.16, rfw: 20 },
        { t: 0.55, hy: -0.52, hz: -0.25, tip: -34, lean: 18, hp: 16, lx: 0.3, ly: -0.55, lz: 0.1, rx: -0.35, ry: -0.6, rz: 0.1, le: 0.5, re: 0.5, yaw: 12, lfp: 10, rfp: 30, rfz: 0.05 },
        { t: 1.05, hy: -0.24, hz: -0.08, tip: -8, lean: 22, hp: 10, lx: 0.08, ly: -0.25, lz: -0.05, rx: -0.1, ry: -0.3, rz: 0, rfp: 18 },
        { t: 1.4, hy: -0.06, lean: 8, hp: 4, side: 3, ly: -0.05, ry: -0.06 }
      ]
    },
    // dropped: the legs go, he sags, and the rear knee and a glove go down to the canvas; he stays there, head down
    drop: {
      floor: true, stay: true, dur: 0.9,
      keys: [
        { t: 0.2, e: 'out', hy: -0.2, lean: 14, hp: 20, hr: 8, lx: 0.04, ly: -0.2, rx: -0.04, ry: -0.24, side: 4 },
        { t: 0.62, e: 'in', hy: -0.57, hz: -0.1, lean: 32, hp: 26, hr: 6, lx: 0.08, ly: -0.42, lz: 0.05, rx: -0.02, ry: -1.04, rz: 0.36, re: 0.4, side: 6, yaw: 6, rfz: -0.36, rfp: 62, lfz: 0.12 },
        { t: 0.9, e: 'io', hy: -0.55, hz: -0.1, lean: 30, hp: 24, hr: 4, lx: 0.08, ly: -0.4, lz: 0.05, rx: -0.02, ry: -1.02, rz: 0.36, re: 0.4, side: 5, yaw: 6, rfz: -0.36, rfp: 62, lfz: 0.12 }
      ]
    },
    // slumped: a hook turns him, the knees go, and he pitches forward onto his face, stretched out on the canvas
    slump: {
      floor: true, stay: true, dur: 1.3,
      keys: [
        { t: 0.18, e: 'out', hy: -0.18, lean: 10, hp: 24, hw: 25, hr: 14, yaw: 22, twist: 10, lx: 0.06, ly: -0.22, rx: -0.06, ry: -0.26 },
        { t: 0.55, e: 'in', hy: -0.42, hz: 0.02, lean: 34, tip: 8, hp: 30, hw: 18, hr: 10, yaw: 30, twist: 6, lx: 0.1, ly: -0.5, lz: 0.2, rx: -0.12, ry: -0.55, rz: 0.24, le: 0.5, re: 0.5, rfz: -0.18, rfp: 40, lfz: -0.08, lfp: 30 },
        { t: 0.95, e: 'in', hy: -0.5, hz: 0.1, lean: 40, tip: 38, hp: 18, hw: 10, hr: 6, yaw: 32, twist: 4, lx: 0.14, ly: -0.42, lz: 0.32, rx: -0.16, ry: -0.46, rz: 0.36, le: 0.9, re: 0.9, rfz: -0.3, rfp: 60, lfz: -0.22, lfp: 60 },
        { t: 1.12, e: 'out', hy: -0.48, hz: 0.1, lean: 38, tip: 34, hp: 20, hw: 10, hr: 6, yaw: 32, twist: 4, lx: 0.14, ly: -0.42, lz: 0.32, rx: -0.16, ry: -0.46, rz: 0.36, le: 0.9, re: 0.9, rfz: -0.3, rfp: 60, lfz: -0.22, lfp: 60 },
        { t: 1.3, e: 'io', hy: -0.5, hz: 0.1, lean: 40, tip: 38, hp: 18, hw: 10, hr: 6, yaw: 32, twist: 4, lx: 0.14, ly: -0.42, lz: 0.32, rx: -0.16, ry: -0.46, rz: 0.36, le: 0.9, re: 0.9, rfz: -0.3, rfp: 60, lfz: -0.22, lfp: 60 }
      ]
    },
    // up off a knee: the glove pushes off the canvas, the rear foot comes under him, and he is up, shaking it off
    riseKnee: {
      floor: true, dur: 1.15,
      keys: [
        { t: 0.02, e: 'lin', hy: -0.55, hz: -0.1, lean: 30, hp: 24, hr: 4, lx: 0.08, ly: -0.4, lz: 0.05, rx: -0.02, ry: -1.02, rz: 0.36, re: 0.4, side: 5, yaw: 6, rfz: -0.36, rfp: 62, lfz: 0.12 },
        { t: 0.4, hy: -0.36, lean: 30, hp: 18, lx: 0.06, ly: -0.3, rx: -0.04, ry: -0.6, rz: 0.18, side: 3, yaw: 4, rfz: -0.16, rfp: 36, lfz: 0.06 },
        { t: 0.75, hy: -0.08, lean: 10, hp: 4, hw: 10, ly: -0.08, ry: -0.1 },
        { t: 0.95, hy: -0.04, lean: 6, hw: -8, hr: 4, ly: -0.04, ry: -0.05 }
      ]
    },
    // up from face down: onto his hands and knees, onto one knee, and up
    riseFront: {
      floor: true, dur: 1.9,
      keys: [
        { t: 0.02, e: 'lin', hy: -0.5, hz: 0.1, lean: 40, tip: 38, hp: 18, hw: 10, hr: 6, yaw: 32, twist: 4, lx: 0.14, ly: -0.42, lz: 0.32, rx: -0.16, ry: -0.46, rz: 0.36, le: 0.9, re: 0.9, rfz: -0.3, rfp: 60, lfz: -0.22, lfp: 60 },
        { t: 0.5, hy: -0.48, hz: 0.04, lean: 36, tip: 22, hp: 10, hw: 4, yaw: 18, lx: 0.12, ly: -0.62, lz: 0.22, rx: -0.14, ry: -0.66, rz: 0.24, le: 0.3, re: 0.3, rfz: -0.3, rfp: 55, lfz: -0.2, lfp: 50 },
        { t: 1.0, hy: -0.44, hz: -0.06, lean: 28, hp: 20, hr: 4, lx: 0.08, ly: -0.36, lz: 0.05, rx: -0.02, ry: -0.9, rz: 0.34, re: 0.4, side: 5, yaw: 6, rfz: -0.2, rfp: 45, lfz: 0.1 },
        { t: 1.45, hy: -0.12, lean: 12, hp: 6, hw: 8, ly: -0.1, ry: -0.14 },
        { t: 1.7, hy: -0.05, lean: 7, hw: -6, hr: 3, ly: -0.05, ry: -0.06 }
      ]
    },
    // arms up, mixed in for the winner
    cheer: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: 0.2, ly: 0.52, lz: -0.2, rx: -0.2, ry: 0.55, rz: -0.02, le: 0.7, re: 0.7, lean: -15, yaw: 24, twist: 8, hp: -10, hy: 0.04 }] }
  }).map(([name, def]) => [name, compile(Object.assign({ name }, def))])
  )
);
