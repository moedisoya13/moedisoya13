/* Everything the boxer does, as curves. A move is a list of keys on named channels; each channel is a number added to the
   guard (a hand moved so far, the hips turned so many degrees), and between keys it is eased, never held: sampled at any time
   it gives a pose, so the motion is as smooth as the display can show it. The numbers the rules need (when a punch lands, how
   far it reaches) sit beside the curves, so what is seen and what is judged cannot drift apart.

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

export const MOVES = Object.fromEntries(
  Object.entries({
    /* ---- punches. contact: when it lands; cancel: from when another punch may follow; close: the distance he steps in to;
       swing: the fist is carried round by the body, so it closes on its target as the body turns (see `aim`); reach: how far away, centre to centre,
       an opponent can be and still be hit; wide: degrees either side of dead ahead it still finds its target; kind: where it comes from. */
    jab: {
      punch: true, hand: 'L', kind: 'straight', dur: 0.32, contact: 0.1, cancel: 0.18, reach: 1.12, close: 0.92, wide: 30, damage: 4, stop: 0.045, push: 0.6,
      keys: [
        { t: 0.1, e: 'punch', lx: -0.07, ly: 0.07, lz: 0.66, yaw: -15, twist: -8, lean: 4, hz: 0.06, lfz: 0.07, aim: 1, rx: 0.02, ry: 0.03, hp: 3 },
        { t: 0.05, e: 'out', lfy: 0.025 },
        { t: 0.1, e: 'in', lfy: 0 },
        { t: 0.135, e: 'lin', lx: -0.07, ly: 0.07, lz: 0.64, yaw: -15, twist: -8, lean: 4, hz: 0.06, aim: 1 },
        { t: 0.2, lfz: 0.07 }
      ]
    },
    cross: {
      punch: true, hand: 'R', kind: 'straight', dur: 0.48, contact: 0.17, cancel: 0.27, reach: 1.14, close: 0.94, wide: 28, damage: 9, stop: 0.085, push: 1.5,
      keys: [
        { t: 0.06, yaw: -7, hz: -0.025, rz: -0.04, ry: -0.02, hy: -0.015 },
        { t: 0.17, e: 'punch', yaw: 54, twist: 18, lean: 7, hz: 0.11, hx: 0.03, hy: -0.03, rx: 0.13, ry: 0.09, rz: 0.9, aim: 1, rfw: 40, rfp: 24, rfz: 0.05, lx: -0.04, ly: 0.03, lz: -0.1, side: 3, st: 0.03 },
        { t: 0.215, e: 'lin', yaw: 56, twist: 18, lean: 8, hz: 0.115, hx: 0.03, hy: -0.035, rx: 0.13, ry: 0.085, rz: 0.87, aim: 1, rfw: 40, rfp: 24, rfz: 0.05, lx: -0.04, ly: 0.03, lz: -0.1, side: 3, st: 0.01 }
      ]
    },
    hook: {
      punch: true, swing: true, hand: 'L', kind: 'hook', dur: 0.58, contact: 0.2, cancel: 0.32, reach: 0.88, close: 0.66, wide: 50, damage: 11, stop: 0.1, push: 1.4,
      keys: [
        // the arm is set at a right angle and locked to the chest, the weight goes onto the lead leg...
        { t: 0.085, yaw: 15, twist: 6, hx: 0.03, hy: -0.035, lx: 0.1, ly: -0.05, lz: 0.12, le: 0.9, lc: 1, lean: 2, aim: 0 },
        // ...and the hips throw it round
        { t: 0.2, e: 'punch', yaw: -44, twist: -20, hx: -0.02, hz: 0.05, hy: -0.02, lx: 0.02, ly: 0.02, lz: 0.14, le: 1, lc: 1, aim: 1, lfw: -38, lfp: 20, side: -4, rz: -0.02, ry: 0.03, st: 0.02 },
        { t: 0.235, e: 'lin', yaw: -47, twist: -21, hx: -0.02, hz: 0.05, hy: -0.02, lx: 0.02, ly: 0.02, lz: 0.14, le: 1, lc: 1, aim: 1, lfw: -39, lfp: 20, side: -4 },
        { t: 0.33, e: 'out', yaw: -62, twist: -28, hx: -0.03, hz: 0.04, hy: -0.03, lx: -0.02, ly: 0, lz: 0.1, le: 1, lc: 1, aim: 0, lfw: -42, lfp: 20, side: -6 }
      ]
    },
    upper: {
      punch: true, hand: 'R', kind: 'upper', dur: 0.6, contact: 0.21, cancel: 0.35, reach: 0.92, close: 0.72, wide: 34, damage: 14, stop: 0.12, push: 1.1,
      keys: [
        { t: 0.1, hy: -0.1, lean: 9, yaw: -6, side: -7, rx: 0.02, ry: -0.2, rz: 0.02, hp: 4, st: -0.04 },
        { t: 0.21, e: 'punch', hy: 0.035, lean: -5, yaw: 40, twist: 12, side: 3, hz: 0.07, rx: 0.13, ry: 0.19, rz: 0.4, aim: 1, rfw: 32, rfp: 28, st: 0.05, lz: -0.06 },
        { t: 0.24, e: 'lin', hy: 0.04, lean: -6, yaw: 41, twist: 12, side: 3, hz: 0.07, rx: 0.13, ry: 0.21, rz: 0.4, aim: 1, rfw: 32, rfp: 28, st: 0.05 },
        { t: 0.31, e: 'out', hy: 0.05, lean: -8, yaw: 44, twist: 14, side: 3, hz: 0.07, rx: 0.14, ry: 0.36, rz: 0.36, aim: 0, rfw: 32, rfp: 28, st: 0.03 }
      ]
    },

    // ---- defence and being hit. These are shapes the body takes; how long it holds them is the rules' business.
    // the tight guard, mixed in by how much the boxer is covering up
    cover: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: -0.07, ly: 0.115, lz: -0.03, rx: -0.02, ry: 0.135, rz: 0.1, lean: 6, hy: -0.035, hp: 7, hz: -0.01 }] },
    // a quick step: the body sinks into it and comes up out of it (which way it leans is added from the step's direction)
    dash: { dur: 0.3, keys: [{ t: 0.07, e: 'out', hy: -0.075, st: -0.035, ly: -0.03, ry: -0.03 }] },
    // a punch turned aside: the puncher's arms are thrown open and he is carried back onto his heels
    reel: {
      dur: 0.62,
      keys: [{ t: 0.1, e: 'out', lean: -15, hz: -0.1, hy: 0.01, lx: 0.2, ly: 0.08, lz: -0.14, rx: -0.2, ry: 0.1, rz: -0.1, hp: -12, le: 0.5, re: 0.5 }, { t: 0.3, lean: -9, hz: -0.07, lx: 0.12, ly: 0.02, lz: -0.08, rx: -0.12, ry: 0.03, rz: -0.06, hp: -5 }]
    },
    // knocked out: the knees go, then the rest of him, onto his back
    ko: {
      stay: true, dur: 1.2,
      keys: [
        { t: 0.24, e: 'out', hy: -0.2, lean: -12, hp: -22, lx: 0.08, ly: -0.3, lz: -0.06, rx: -0.08, ry: -0.3, rz: -0.02, yaw: 14, twist: 10 },
        { t: 0.72, e: 'in', hy: -0.735, hz: -0.5, tip: -76, lean: -8, hp: 12, lx: 0.46, ly: -0.02, lz: -0.25, rx: -0.58, ry: -0.15, rz: 0, le: 0.9, re: 0.9, yaw: 26, twist: 6, lfp: 20, rfp: 10, rfz: 0.16, rfw: 20 },
        { t: 0.86, e: 'out', hy: -0.7, tip: -72, hp: 2 },
        { t: 1.08, e: 'io', hy: -0.735, hz: -0.5, tip: -76, lean: -8, hp: 12, lx: 0.46, ly: -0.02, lz: -0.25, rx: -0.58, ry: -0.15, rz: 0, le: 0.9, re: 0.9, yaw: 26, twist: 6, lfp: 20, rfp: 10, rfz: 0.16, rfw: 20 }
      ]
    },
    // arms up, mixed in for the winner
    cheer: { stay: true, dur: 1, keys: [{ t: 1, e: 'lin', lx: 0.2, ly: 0.52, lz: -0.2, rx: -0.2, ry: 0.55, rz: -0.02, le: 0.7, re: 0.7, lean: -15, yaw: 24, twist: 8, hp: -10, hy: 0.04 }] }
  }).map(([name, def]) => [name, compile(Object.assign({ name }, def))])
);
