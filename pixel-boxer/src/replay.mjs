/* The instant replay: what a card (and later the match screen) shows again, at a quarter of the speed, of two moments the
   bout makes. A brilliant defence (game/bout.mjs: a miss by a whisker, or on the last frame of the window, and a loaded
   punch back within 0.4 s): when the counter has landed, it plays back from the moment the other man's punch was pressed to
   a moment after the counter met him. A knockdown (docs/moves-plan-6.md §2.4B): a moment after the falling man first comes
   down on the canvas (render/blow.mjs: landed, from his body's points), it plays back from a moment before the blow to then.
   It keeps the last two seconds or so of what is drawn. While it plays, the bout is not stepped: its time stands still and
   goes on afterwards from where it stopped.
   It plays smoothly at any speed: what is drawn is between two of the steps it kept, by how far it has got from one to the
   next (blend: places and points along the line between them, each joint's turn the short way at an even rate), and the
   steps in which the bout held the moment of a blow (its time did not move on) are left out of it, so that no picture of it
   is the same as the one before. It starts on the first step it always did and ends on the last, at the moment it always
   did. The blows of the steps it keeps (hits, blocks, parries) and where a falling man came down are kept with them, so
   that what they threw can be thrown again as the replay comes to them, in its own time.
     const r = createReplay({ keep, slow, lead, tail, fall, capture })
       keep: seconds kept (2); slow: the speed it plays at (0.25); lead: seconds before the punch was pressed it starts from
       (0.05); tail: seconds after the counter lands it goes on to, live, before it plays (0.25); fall: a knockdown's { lead
       (seconds before the blow it starts from, 0.2), tail (seconds after he comes down that it goes on to, 0.3) };
       capture(bout): what to keep of a step for drawing it again (by default both men's poses and places: captureBout)
     r.watch(bout, dt)   after every step of the bout: keeps the step, reads its events -> true on the step a replay starts
     r.playing           true while it plays (do not step the bout)
     r.kind, r.on        what it is replaying ('brilliant' | 'fall'), and in a knockdown's, the man who went down
     r.next(dt)          what to draw now, dt seconds of real time on: a step it kept, or one between two of them (null once
                         it is over: playing is false again). r.crossed: the steps kept that it has come to since it was
                         last asked (each step's { events: its blows, landed: { fall, landing } if a falling man came down
                         in it }), the first of them on the first call; r.started: true on that first call
     r.live(k)           the bout as it stands, drawn k (0..1) of the way from the step before the last to the last (null
                         before any step is kept)
     r.progress          0..1 through it
   blend(a, b, k): the drawn state k (0..1) of the way from a step a to the next, b, both as captureBout keeps them. */
import * as M from './rig/m3.mjs';
import { fallOf, landed as cameDown } from './render/blow.mjs';

export const captureBout = bout => ({
  t: bout.t,
  men: bout.fighters.map(f => ({ pose: f.pose, place: f.place, x: f.x, z: f.z, yaw: f.yaw, points: f.points }))
});

const DT = 1 / 60;
// a turn (3x3 by rows) as a quaternion [x, y, z, w], and back
function quat(R) {
  const t = R[0] + R[4] + R[8];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [(R[7] - R[5]) / s, (R[2] - R[6]) / s, (R[3] - R[1]) / s, s / 4];
  } else if (R[0] > R[4] && R[0] > R[8]) {
    const s = Math.sqrt(1 + R[0] - R[4] - R[8]) * 2;
    q = [s / 4, (R[1] + R[3]) / s, (R[2] + R[6]) / s, (R[7] - R[5]) / s];
  } else if (R[4] > R[8]) {
    const s = Math.sqrt(1 + R[4] - R[0] - R[8]) * 2;
    q = [(R[1] + R[3]) / s, s / 4, (R[5] + R[7]) / s, (R[2] - R[6]) / s];
  } else {
    const s = Math.sqrt(1 + R[8] - R[0] - R[4]) * 2;
    q = [(R[2] + R[6]) / s, (R[5] + R[7]) / s, s / 4, (R[3] - R[1]) / s];
  }
  return q;
}
function matrix([x, y, z, w]) {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
/* A turn k of the way from A to C, the short way round at an even rate (slerp), so that each picture between two steps turns
   a joint as far as the next. */
function turn(A, C, k) {
  const a = quat(A);
  let c = quat(C),
    d = a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3];
  if (d < 0) (c = c.map(x => -x)), (d = -d);
  let p, r;
  if (d > 0.9995) (p = 1 - k), (r = k);
  else {
    const th = Math.acos(Math.min(1, d)),
      s = Math.sin(th);
    (p = Math.sin((1 - k) * th) / s), (r = Math.sin(k * th) / s);
  }
  const q = a.map((x, i) => x * p + c[i] * r),
    l = Math.hypot(...q);
  return matrix(q.map(x => x / l));
}
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// one man k of the way from how he was kept at one step to the next
function blendMan(a, b, k) {
  let pose = a.pose;
  if (a.pose !== b.pose) {
    const pa = a.pose,
      pb = b.pose,
      rot = {},
      at = {};
    for (const n of new Set([...Object.keys(pa.rot || {}), ...Object.keys(pb.rot || {})])) rot[n] = turn((pa.rot && pa.rot[n]) || ID, (pb.rot && pb.rot[n]) || ID, k);
    for (const n in pb.at) at[n] = pa.at && pa.at[n] ? M.lerp(pa.at[n], pb.at[n], k) : pb.at[n];
    pose = Object.assign({}, pb, { rot, at, root: M.lerp(pa.root || [0, 0, 0], pb.root || [0, 0, 0], k), stretch: (pa.stretch || 1) + ((pb.stretch || 1) - (pa.stretch || 1)) * k });
  }
  const points = {};
  for (const n in b.points) points[n] = a.points && a.points[n] ? M.lerp(a.points[n], b.points[n], k) : b.points[n];
  return {
    pose,
    place: { R: turn(a.place.R, b.place.R, k), p: M.lerp(a.place.p, b.place.p, k) },
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    yaw: a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k,
    points
  };
}
export function blend(a, b, k) {
  if (k <= 1e-9 || a === b) return a;
  if (k >= 1 - 1e-9) return b;
  return { t: a.t + (b.t - a.t) * k, men: a.men.map((m, i) => blendMan(m, b.men[i], k)), events: [] };
}

const BLOWS = ['hit', 'block', 'parry'];

export function createReplay(o) {
  o = Object.assign({ keep: 2, slow: 0.25, lead: 0.05, tail: 0.25, capture: captureBout }, o);
  o.fall = Object.assign({ lead: 0.2, tail: 0.3 }, o.fall);
  let kept = [], // { clock, t, snap }
    clock = 0,
    armed = null, // a brilliant defence seen: { from, who, counter }
    met = null, // and its counter landed: the clock it did
    fall = null, // a knockdown's blow seen: render/blow.mjs fallOf, with from (the bout time it plays from) and at (the clock he came down)
    play = null; // { frames, at, seen, kind, on }
  // (the steps kept from the bout time `from` on, each once: the steps that held the moment of a blow are the same picture)
  const from = t => {
    const out = [];
    for (const k of kept) if (k.t >= t - 1e-9 && (!out.length || k.t > out[out.length - 1].t + 1e-9)) out.push(k);
    return out.map(k => k.snap);
  };
  const start = (frames, kind, on) => {
    if (frames.length < 2) return false;
    play = { frames, at: 0, seen: -1, kind, on };
    return true;
  };
  return {
    slow: o.slow,
    crossed: [],
    started: false,
    get playing() {
      return !!play;
    },
    get kind() {
      return play ? play.kind : null;
    },
    get on() {
      return play ? play.on : null;
    },
    get progress() {
      return play ? Math.min(1, play.at / Math.max(1e-6, play.frames.length)) : 0;
    },
    watch(bout, dt) {
      clock += dt;
      const snap = o.capture(bout);
      snap.events = bout.events.filter(e => BLOWS.includes(e.type));
      kept.push({ clock, t: bout.t, snap });
      while (kept.length && kept[0].clock < clock - o.keep) kept.shift();
      for (const e of bout.events) {
        if (e.type === 'brilliant') (armed = { from: e.from, who: e.who, counter: e.counter }), (met = null);
        // (the counter it was answered with: when it meets him, or misses, the replay goes on a moment and then plays)
        else if (armed && met === null && e.who === armed.who && ['hit', 'whiff', 'block', 'graze'].includes(e.type)) {
          const f = bout.fighters[armed.who];
          if (f.action && f.action.id === armed.counter) met = clock;
        }
        const down = fallOf(e);
        if (down) fall = Object.assign(down, { from: bout.t - o.fall.lead, at: null });
      }
      // (a man knocked down: the step he first comes down on the canvas, kept with that step)
      if (fall && fall.at === null) {
        const landing = cameDown(fall, bout.fighters[fall.on]);
        if (landing) (fall.at = clock), (snap.landed = { fall, landing });
      }
      if (armed && met !== null && clock - met >= o.tail - 1e-9) {
        const frames = from(armed.from - o.lead);
        armed = met = null;
        if (start(frames, 'brilliant', null)) return true;
      }
      if (fall && fall.at !== null && clock - fall.at >= o.fall.tail - 1e-9) {
        const frames = from(fall.from),
          on = fall.on;
        fall = null;
        if (start(frames, 'fall', on)) return true;
      }
      return false;
    },
    next(dt) {
      if (!play) return null;
      /* (the steps were a sixtieth of a second apart: at a quarter of the speed it takes four pictures to go from one to the
         next; from the first step at the start to the last on the last picture, a sixtieth of a second before it is over) */
      const n = play.frames.length,
        p = Math.min(n - 1, (play.at * (n - 1)) / (n - o.slow)),
        i = Math.min(n - 1, Math.floor(p)),
        snap = i + 1 < n ? blend(play.frames[i], play.frames[i + 1], p - i) : play.frames[i];
      this.started = play.seen < 0;
      this.crossed = play.frames.slice(play.seen + 1, i + 1);
      play.seen = Math.max(play.seen, i);
      play.at += (dt * o.slow) / DT;
      if (play.at >= n) play = null;
      return snap;
    },
    live(k) {
      const n = kept.length;
      if (!n) return null;
      return n < 2 ? kept[n - 1].snap : blend(kept[n - 2].snap, kept[n - 1].snap, Math.max(0, Math.min(1, k)));
    },
    reset() {
      kept = [];
      armed = met = fall = play = null;
      this.crossed = [];
    }
  };
}
