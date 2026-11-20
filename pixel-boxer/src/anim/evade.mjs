/* The ways of getting the head out of the way, by grade (anim/skill.mjs: evade). An evasion is written once, as keys
   (moves.mjs: slip, duck, roll, pull), and that is the pro's. The other grades are not written again: each reads the same
   curve on its own clock, and each group of joints reads it at its own moment. The order the groups go in is the grade:
   a beginner's neck goes first and his knees hardly at all, an amateur's waist goes all of a piece and his knees after it, a
   pro's knees and waist together, a great one's weight is over before his shoulders follow and his head comes last.
     timeline(name, level)        where each written stretch of the curve falls in his time, seconds after the press:
                                  { flinch, map, clear, backAt, end, cut, hold } (clear: the head is off the line; cut: a
                                  punch may start from here; hold: the moment a legend waits at for the other man's arm)
     evadeTime(action, T)         his time in it, with a legend's wait taken out
     progress(action)             how far out he is (0..1, by the trunk's time) and whether he is still going out: what a
                                  great one stops at once his head is clear of the punch by his grade's margin (action.cap)
     sampleEvade(action, level, c)   the channels it adds this frame, into c (sided, and made up for the turned stance)
     LOADED                       which hand an evasion leaves wound up, by move and side ('L' lead, 'R' rear)
   The pro's (grade 3) is the curve exactly as written: the same numbers at the same moments. */
import { MOVES, LEFT_BEND } from './moves.mjs';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

// which group of joints each channel belongs to
const GROUP = {};
for (const ch of ['hp', 'hw', 'hr']) GROUP[ch] = 'head';
for (const ch of ['lean', 'side', 'twist', 'yaw', 'tip']) GROUP[ch] = 'trunk';
for (const ch of ['hx', 'hy', 'hz', 'st']) GROUP[ch] = 'hips';
for (const ch of ['lfx', 'lfy', 'lfz', 'lfw', 'lfp', 'lk', 'rfx', 'rfy', 'rfz', 'rfw', 'rfp', 'rk']) GROUP[ch] = 'feet';
for (const ch of ['lx', 'ly', 'lz', 'le', 'lc', 'lg', 'rx', 'ry', 'rz', 're', 'rc', 'rg', 'aim']) GROUP[ch] = 'hands';
export const GROUPS = ['head', 'trunk', 'hips', 'feet', 'hands'];

/* The written stretches of each evasion: out (the head going), hold (out there), back. `clear` is the written moment the head
   is off the line (the end of its going; for a weave, the bottom of the U, under the punch). */
export const WRITTEN = {
  slip: { segs: [['out', 0, 0.1], ['hold', 0.1, 0.2], ['back', 0.2, 0.42]], clear: 0.1 },
  duck: { segs: [['out', 0, 0.12], ['hold', 0.12, 0.24], ['back', 0.24, 0.5]], clear: 0.12 },
  roll: { segs: [['out', 0, 0.1], ['out', 0.1, 0.22], ['out', 0.22, 0.36], ['back', 0.36, 0.52]], clear: 0.22 },
  pull: { segs: [['out', 0, 0.12], ['hold', 0.12, 0.26], ['back', 0.26, 0.5]], clear: 0.12 }
};
export const EVASIONS = Object.keys(WRITTEN);

/* The hand an evasion leaves wound up: the weight on the foot it ends on decides it. Slipped to his right (outside a jab), the
   weight is on the rear foot and the rear shoulder back and down: the rear hand. To his left, the lead. Ducked, the legs coming
   up are an uppercut's. Weaved, the side he comes up on. Swayed back onto the rear leg, the rear hand. */
export function LOADED(name, side) {
  if (name === 'slip' || name === 'roll') return side > 0 ? 'L' : 'R';
  return 'R';
}

/* What each grade adds to the written shape at the far point of each evasion, sided as the move is (x to the side he goes),
   on top of what its groups' sizes make of the written curve. In his own channels: see moves.mjs. */
const SHAPE = {
  slip: {
    // the neck tilts first and the waist bends back after it: the head goes out and back, not down (the knees stay locked,
    // the hips go the wrong way), and the foot on that side is put out wide to catch him
    1: { size: { hy: 0, hx: -0.25, side: 1.4 }, add: { hr: 18, lean: -16, hz: -0.04, hy: 0.01 }, far: 0.08 },
    // a stiff bend at the waist, the knees half, the eyes tilted with it and the elbows up
    2: { size: { hx: 0.4, hy: 0.4, side: 1.4 }, add: { hr: 8, le: 0.15, re: 0.15 } },
    // the hips go first, less far, and the bend does more; the shoulder on the side he goes rolls back with them: wound up
    // (the glove on the side the punch goes by stays on his cheek, out of its way)
    '4m': { size: { hx: 0.75, hy: 0.6, side: 1.1 }, add: { twist: 8, hp: 3 }, line: [-0.1, -0.01] },
    '4a': { size: { hx: 0.75, hy: 0.6, side: 1.1 }, add: { twist: 8, hp: 3, lean: 3 }, line: [-0.1, -0.01] },
    '5m': { size: { hx: 0.5, hy: 0.45, side: 1.25 }, add: { twist: 12, hp: 3 }, far: 0.02, line: [-0.12, -0.01] },
    '5a': { size: { hx: 0.5, hy: 0.45, side: 1.25 }, add: { twist: 12, hp: 3, lean: 4 }, far: 0.02, line: [-0.12, -0.01] }
  },
  duck: {
    // a bow from the waist, knees locked, the gloves on top of the head and the eyes on the canvas (the hips go back only
    // so far, so the head goes out toward him)
    1: { size: { hy: 0.8, hz: 0.8, hx: 0.5, lean: 0.95 }, delay: { trunk: 0, hips: 0 }, add: { hp: 17, ly: 0.1, ry: 0.1, lz: -0.04, rz: -0.04 } },
    // the knees, then the waist: one, two
    2: { size: { hy: 0.6, lean: 0.85, hz: 0.7, hx: 0.6 }, delay: { hips: 0, trunk: 0.1, hz: 0.1, hx: 0.1 }, add: { hp: 7 } },
    // the eyes kept up, on his hips (the head goes down as far as it has to, and no further)
    '4m': { size: { lean: 1.2, hy: 0.9 }, add: { hp: -6 } },
    '4a': { size: { lean: 1.17, hy: 0.88 }, add: { hp: -6 } },
    '5m': { size: { lean: 1.24, hy: 0.9 }, add: { hp: -6 } },
    '5a': { size: { lean: 1.2, hy: 0.88 }, add: { hp: -6, ly: -0.03, ry: -0.03 } }
  },
  roll: {
    // no U: bowed, pushed across bowed, and stood up, the gloves over his head
    1: { size: { hy: 0.6, hx: 0.3, hz: 1.1, lean: 1.0, side: 0.8 }, time: { out: 1.05, flinch: 0.04 }, add: { hp: 10, ly: -0.2, ry: -0.08, lx: 0.04 } },
    2: { size: { hx: 0.5 }, delay: { hips: 0, trunk: 0.03 }, add: { ly: -0.04, ry: -0.03, lz: -0.1, lx: -0.03 } },
    // (the lead glove in on his cheek while the hook goes over: out of its way)
    '4m': { add: { twist: 10, lz: -0.12, ly: -0.02 } },
    // (a low man has to go lower still to get under a hook aimed at his jaw: the U is deeper and narrower)
    '4a': { size: { hy: 1.5, lean: 1.7, hx: 0.8 }, add: { twist: 10, ly: -0.04, ry: -0.03, lz: -0.1, lx: -0.03 } },
    '5m': { add: { twist: 10, lz: -0.12, ly: -0.02 } },
    '5a': { size: { hy: 1.5, lean: 1.7, hx: 0.8 }, time: { out: 0.75 }, add: { twist: 10, ly: -0.07, ry: -0.03, lz: -0.15, lx: -0.04 } }
  },
  pull: {
    // back from the waist, knees locked, the chin up and the hands out in front for balance
    1: { size: { hy: 0, hz: 0.9 }, add: { lean: -3, hp: -6, lz: 0.08, rz: 0.08, lx: 0.02, rx: -0.02 } },
    2: {},
    // sat down on the rear leg, the chin in, the lead shoulder across it, the rear hand ready in front of the chin
    '4m': { size: { hz: 1.05 }, add: { hy: -0.035, hp: 13, twist: -6, rz: 0.03 } },
    // (a dirty man does not go back: he sits down onto the rear leg, the rear foot dragged back, the chin behind the shoulder)
    '4a': { size: { hz: 1.0 }, add: { hy: -0.05, rfz: -0.06, hp: 13, twist: -6 } },
    '5m': { size: { hz: 1.07 }, add: { hy: -0.03, hp: 12, ly: -0.04 } },
    '5a': { size: { hz: 1.0 }, add: { hy: -0.05, rfz: -0.06, hp: 12, ly: -0.04 } }
  }
};
const SIDED = ['side', 'hx', 'hw', 'hr', 'lx', 'rx', 'twist'];

/* Where each written stretch falls in his time. A beginner's flinch comes first, with nothing of the curve in it; the going
   is quicker or slower by `out`, the time out there and the way back by `hold` and `back` (a roll's corners held by `pause`). */
const timelines = new Map();
export function timeline(name, level) {
  const ev = level.evade,
    key = name + '@' + level.id;
  if (ev && !ev.custom && timelines.has(key)) return timelines.get(key);
  const w = WRITTEN[name],
    map = [],
    // (a move may keep its own time at a grade: shape.time)
    time = Object.assign({ out: ev.out, hold: ev.hold, back: ev.back, flinch: ev.flinch }, ((SHAPE[name] || {})[level.id] || {}).time);
  let t = time.flinch;
  const outs = w.segs.filter(s => s[0] === 'out').length;
  let seen = 0,
    clear = null,
    backAt = null,
    hold = null;
  for (const [kind, s0, s1] of w.segs) {
    if (kind === 'back' && backAt === null) backAt = t;
    const len = (s1 - s0) * (kind === 'out' ? time.out : kind === 'hold' ? time.hold : time.back);
    map.push([t, t + len, s0, s1]);
    t += len;
    if (clear === null && s1 >= w.clear - 1e-9) clear = t;
    if (kind === 'out' && ++seen < outs && ev.pause) (map.push([t, t + ev.pause, s1, s1]), (t += ev.pause));
    if (kind === 'out' && seen === outs) hold = t;
  }
  const delay = Object.assign({}, ev.delay, ((SHAPE[name] || {})[level.id] || {}).delay),
    lag = Math.max(0, ...GROUPS.map(g => delay[g] || 0));
  // (the head is off the line when the trunk has got it there: the trunk's delay is part of it)
  clear += delay.trunk || 0;
  const T = {
    flinch: time.flinch,
    map,
    clear,
    hold, // (a legend holds here, if he holds at all, until the other man's arm starts home)
    backAt,
    end: t + lag,
    // when a punch may start out of it: once it is over; or from four fifths of the way back; or from the moment the head is
    // off the line (the punch then starts from the end of the evasion: anim/skill.mjs, evade.cut)
    cut: ev.cut === 'clear' ? clear : ev.cut === 'return' ? backAt + 0.8 * (t - backAt) : t + lag
  };
  timelines.set(key, T);
  return T;
}
// written time for graded time t (seconds after the press)
function written(T, t) {
  if (t <= T.flinch) return 0;
  for (const [a, b, s0, s1] of T.map) if (t < b) return b > a ? s0 + ((t - a) / (b - a)) * (s1 - s0) : s1;
  const last = T.map[T.map.length - 1];
  return last[3];
}
// his time in it: a legend's wait for the other man's arm is time that does not move the curve
export const evadeTime = (action, T) => {
  const held = action.held || 0;
  return action.t <= T.hold ? action.t : Math.max(T.hold, action.t - held);
};
export function progress(action) {
  const level = action.level,
    T = timeline(action.name, level),
    t = evadeTime(action, T),
    shape = (SHAPE[action.name] || {})[level.id] || {},
    d = (shape.delay && shape.delay.trunk) ?? level.evade.delay.trunk ?? 0;
  return { k: outness(action.name, written(T, t - d)), going: T.backAt === null || t < T.backAt };
}
// how far out he is at written time s: 0 at rest, 1 out there (for what a grade adds to the shape, and its flinch)
function outness(name, s) {
  const w = WRITTEN[name];
  const outEnd = w.segs.filter(x => x[0] === 'out').pop()[2],
    backs = w.segs.filter(x => x[0] === 'back'),
    b0 = backs.length ? backs[0][1] : outEnd,
    b1 = backs.length ? backs[backs.length - 1][2] : outEnd;
  if (s <= 0) return 0;
  if (s < outEnd) return 1 - (1 - Math.min(1, s / Math.min(outEnd, w.clear + 0.02))) ** 3;
  if (s < b0) return 1;
  return 1 - smooth((s - b0) / (b1 - b0));
}

/* The channels an evasion adds this frame, into c (all its own, sided and made up for the turned stance as the move is).
   action: { name, t, side (+1 his left), held (seconds a legend has waited out there), cap (how far out a great one stops) } */
export function sampleEvade(action, level, c) {
  const name = action.name,
    move = MOVES[name],
    ev = level.evade,
    s = move.sided ? action.side || 1 : 1; // (a duck and a sway have no side)
  const tmp = {};
  if (ev.textbook) {
    // the pro's: the curve as written, at the moment written
    for (const ch in move.tracks) tmp[ch] = sampleTrack(move.tracks[ch], action.t);
  } else {
    const T = timeline(name, level),
      t = evadeTime(action, T);
    const shape = (SHAPE[name] || {})[level.id] || {},
      size = shape.size || {};
    const delay = Object.assign({}, ev.delay, shape.delay);
    for (const ch in move.tracks) {
      const g = GROUP[ch] || 'trunk',
        k = ev.scale[g] ?? 1,
        by = size[ch] ?? 1;
      if (!k || !by) continue;
      // (a channel may keep its own time apart from its group's: an amateur's hips go back only as his waist bends)
      tmp[ch] = sampleTrack(move.tracks[ch], written(T, t - (delay[ch] ?? delay[g] ?? 0))) * k * by * (GROUP[ch] === 'hands' || GROUP[ch] === 'feet' ? 1 : ev.move);
    }
    // what the grade adds to the shape, with the trunk's time (a foot put out wide: on the side he goes)
    const add = shape.add || {},
      out = outness(name, written(T, t - (delay.trunk || 0)));
    /* A great one goes only as far as he has to: once his head is clear of where the punch is going by his grade's margin
       (the bout says when: action.cap, how far out he was then), it goes no further, and comes back from there. */
    if (action.cap !== undefined) {
      const k = action.cap / Math.max(action.cap, out, 1e-6);
      for (const ch in tmp) if (GROUP[ch] === 'head' || GROUP[ch] === 'trunk' || GROUP[ch] === 'hips') tmp[ch] *= k;
    }
    if (out > 0) for (const ch in add) tmp[ch] = (tmp[ch] || 0) + add[ch] * out;
    // (the glove on the side the punch goes by: the left one when he goes to his right)
    if (shape.line && out > 0) {
      const g = s > 0 ? 'r' : 'l';
      tmp[g + 'z'] = (tmp[g + 'z'] || 0) + shape.line[0] * out;
      tmp[g + 'y'] = (tmp[g + 'y'] || 0) + shape.line[1] * out;
    }
    if (shape.far && out > 0) {
      // (the foot on the side he goes out to, its ball slid out and a touch up off the canvas as it goes)
      const foot = s > 0 ? 'lf' : 'rf';
      tmp[foot + 'x'] = (tmp[foot + 'x'] || 0) + shape.far * out; // (sided below, with x)
      tmp[foot + 'y'] = (tmp[foot + 'y'] || 0) + 0.012 * bump(clamp(out, 0, 1));
    }
    // a dirty man goes in while he goes off the line, and does not all come back up
    if (ev.in && name !== 'pull' && name !== 'roll') tmp.hz = (tmp.hz || 0) + ev.in * out * smooth((t - T.clear) / 0.1);
    if (ev.low) tmp.hy = (tmp.hy || 0) - ev.low * smooth(t / Math.max(1e-3, T.clear));
    /* A beginner's flinch: the shoulders up, both gloves up and out in front of his own eyes, the head jerked back and turned
       away (his eyes shut, as a hundred pixels show it), held until he is on his way back. An amateur's: he freezes. */
    if (ev.flinch && ev.wince) {
      const on = smooth(t / Math.max(0.02, T.flinch)) * (1 - smooth((t - T.backAt) / 0.15)),
        w = ev.wince;
      tmp.ly = (tmp.ly || 0) + 0.06 * w * on;
      tmp.ry = (tmp.ry || 0) + 0.06 * w * on;
      tmp.lz = (tmp.lz || 0) + 0.05 * w * on;
      tmp.rz = (tmp.rz || 0) + 0.05 * w * on;
      tmp.lx = (tmp.lx || 0) + 0.02 * w * on;
      tmp.rx = (tmp.rx || 0) - 0.02 * w * on;
      tmp.hy = (tmp.hy || 0) + 0.01 * w * on;
      tmp.hp = (tmp.hp || 0) - 6 * w * on;
      tmp.hw = (tmp.hw || 0) + 25 * w * on; // (sided: turned away to the side he goes)
    }
    /* A great one's way back passes under and over to the other side (a shallow U), and is over on a foot coming down (the
       animator times his beat to it). */
    if (ev.cross && T.backAt !== null && t > T.backAt) {
      const p = clamp((t - T.backAt) / Math.max(1e-3, T.end - T.backAt), 0, 1);
      tmp.hy = (tmp.hy || 0) - 0.04 * bump(p);
      tmp.side = (tmp.side || 0) - ev.cross * bump(clamp((p - 0.15) / 0.85, 0, 1));
    }
  }
  for (const ch of SIDED) if (tmp[ch]) tmp[ch] *= s;
  for (const ch of ['lfx', 'rfx']) if (tmp[ch]) tmp[ch] *= s;
  // (the turned stance: see moves.mjs LEFT_BEND)
  if (move.sided && tmp.side > 0) (tmp.lean = (tmp.lean || 0) + LEFT_BEND.lean * tmp.side), (tmp.side += LEFT_BEND.side * tmp.side);
  for (const ch in tmp) c[ch] += tmp[ch];
  return tmp;
}

// a written track at written time s (moves.mjs keys, eased between)
const EASE = {
  lin: u => u,
  io: u => u * u * u * (u * (u * 6 - 15) + 10),
  out: u => 1 - (1 - u) ** 3,
  in: u => u ** 2.2,
  punch: u => 1 - (1 - u ** 1.5) ** 2.6
};
function sampleTrack(track, t) {
  let i = 0;
  while (i + 1 < track.length && track[i + 1][0] <= t) i++;
  if (i + 1 >= track.length) return track[i][1];
  const a = track[i],
    b = track[i + 1],
    u = (t - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * EASE[b[2]](u < 0 ? 0 : u);
}
