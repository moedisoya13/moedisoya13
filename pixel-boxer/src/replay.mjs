/* The instant replay: what the game, a card, the effect study and the review sheet show again of two moments the bout makes.
   A brilliant defence (game/bout.mjs: a miss by a whisker, or on the last frame of the window, and a loaded punch back within
   0.4 s): when the counter has landed, it plays back at a quarter of the speed from the moment the other man's punch was
   pressed to a moment after the counter met him; unless a knockdown comes before it plays (the counter puts him down): then
   only the knockdown's is played, as every knockdown is shown.
   A knockdown (docs/moves-plan-6.md §2.4D, the user's instruction of 2026-11-24): the fall is shown live, at the true speed,
   from the ordinary camera, all the way down; then, once every effect of the blow and of the landing has gone out and he is
   down and all but still, the picture cuts to a closer camera, from above or from wherever the blow is seen best (viewOf),
   and plays, slowly and briefly, from the press of the punch that put him down to him falling away after it, ending before
   any of him comes down on the canvas; then it cuts back. Its numbers are all in FALL.
   It keeps the last two seconds or so of what is drawn (and, while a knockdown's replay is awaited, everything from the press
   on). While it plays, the bout is not stepped: its time stands still and goes on afterwards from where it stopped.
   It plays smoothly at any speed: what is drawn is between two of the steps it kept, by how far it has got from one to the
   next (blend: places and points along the line between them, each joint's turn the short way at an even rate), and the
   steps in which the bout held the moment of a blow (its time did not move on) are left out of it, so that no picture of it
   is the same as the one before. The blows of the steps it keeps (hits, blocks, parries) and where a falling man came down
   are kept with them, so that what they threw can be thrown again as the replay comes to them, in its own time (a
   knockdown's replay ends before he comes down: it throws again his blow's motes and ripple, never the landing's); and
   with them the events that are only heard (HEARD: the punch pressed, a slip, a dash ...), so that a replay is heard from
   its start, the punch's breath and swing first.
     const r = createReplay({ keep, slow, lead, tail, fall, yaw, room, brilliant, capture })
       keep: seconds kept (2); slow: the speed a brilliant defence's plays at (0.25); lead: seconds before the punch was
       pressed it starts from (0.05); tail: seconds after the counter lands it goes on to, live, before it plays (0.25);
       fall: a knockdown's numbers, over FALL's; yaw(): the live camera's yaw, for the side the men are seen from (a cut
       keeps each on the side of the picture he was on, if it can); room(target, Z, size): whether the page has room for a
       camera looking at target from the way Z, framing a box of that size (viewOf; by default it has); brilliant: false
       to replay no brilliant defence (the game shows a knockdown's alone); capture(bout): what to keep of a step for
       drawing it again (by default both men's poses and places: captureBout)
     r.watch(bout, dt, quiet)   after every step of the bout: keeps the step, reads its events; quiet: true once nothing
                         the page draws of a blow is still to be seen (render/blow.mjs quietOf; left out, nothing is
                         waited for) -> true on the step a replay starts
     r.playing           true while it plays (do not step the bout)
     r.pending           true while a knockdown's replay is awaited (seen, not yet played)
     r.kind, r.on        what it is replaying ('brilliant' | 'fall'), and in a knockdown's, the man who went down
     r.view              a knockdown's camera, for the picture next() last gave (its last one too, until the bout is stepped): { target, yaw, pitch, closer, push, name ('above' | 'side'),
                         score, parts, scores } (viewOf), and blow, from, to (the bout's times of the blow and of its first
                         and last steps), hit (the blow: who, on, hand, at...); a page draws it at distOf
     r.next(dt)          what to draw now, dt seconds of real time on: a step it kept, or one between two of them (null once
                         it is over: playing is false again). r.crossed: the steps kept that it has come to since it was
                         last asked (each step's { events: its blows and what is only heard of it, landed: { fall, landing } if a falling man came down
                         in it }), the first of them on the first call; r.started: true on that first call; r.moved: the
                         bout's seconds the picture moved on since the last (what the effects thrown again move on by)
     r.skip()            ends it now (a key, a tap or a button in the game): the bout goes on from where it stood
     r.live(k)           the bout as it stands, drawn k (0..1) of the way from the step before the last to the last (null
                         before any step is kept)
     r.progress          0..1 through it, at the picture next() last gave
   blend(a, b, k): the drawn state k (0..1) of the way from a step a to the next, b, both as captureBout keeps them.
   paceOf(fall, u): the speed a knockdown's replay plays at with the bout's time at u (FALL.pace).
   viewOf(frames, hit, set, yaw, room): the camera a knockdown's replay cuts to (FALL.view: the rule, and how a candidate is scored);
   distOf(view, live, aspect, progress, most): how far off it a page draws it; backOf(yaw, pitch): the way to its eye. */
import * as M from './rig/m3.mjs';
import { RADIUS } from './rig/body.mjs';
import { toWorld } from './anim/pose.mjs';
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
/* (and the events that are only heard, kept with the steps too so that a replay is heard as it was, the press of its punch
   first: nothing is drawn of them, so a page that throws again what is drawn of each step's events is not changed by them.
   A whiff and a graze are drawn by a defence's lines, render/guard.mjs, and so are not kept: their sound is not heard again) */
const HEARD = ['punch', 'taunt', 'slip', 'duck', 'roll', 'pull', 'collar', 'duckIn', 'dash', 'hopPivot', 'hopCircle', 'paw', 'foul'];

/* A knockdown's replay: all its numbers, in one place (docs/moves-plan-6.md §2.4D). Each can be set apart in createReplay's
   `fall`.
     of       which knockdowns are replayed: 'every' one (a knockdown or a knockout: e.down or e.out), or only one that
              'ending' the match (out cold, or any down in a bout that counts no knockdowns, as the game's is)
     beat     the bout's seconds between the last effect going out and the cut
     still    he is down and all but still once his head, his chest and his hips have each gone slower than `speed` m/s
              for `for` seconds running, from when he first came down
     most     the longest it waits: so many seconds of the bout after the blow, whatever is still going on
     windup   the longest wind-up it shows: from the press of the punch, or from so long before the blow if that was longer
     end      it shows him falling away to so many seconds after the blow, or to `clear` steps before he first comes down on
              the canvas if that is sooner
     pace     how fast: `windup` times the true speed until `ease` seconds of the bout before the blow, easing (smoothstep) to
              `blow` at the blow, and `blow` to the end
     view     its camera (viewOf, distOf): from `above` (a pitch, radians) for a blow that lands across the line between
              them, from the side at the lowest of `heights` for one along it or up; checked from `dist` metres off with
              each man's bones `grow` metres fatter, a line of sight ending at the surface of what it looks at; if that will
              not do, the best by `weights` of the candidates (from above; from the side at each of `heights`, every 1/round
              of a turn round), scored over the blow's step and the `before` steps before it, the glove's path over its last
              `path` seconds, and the two men's chests apart in the picture from apart[0] to apart[1] metres; drawn `closer`
              times closer than the page's live camera, never so close that what it frames and `pad` metres round it is
              cut, and pushed in by `push` of that over the replay */
export const FALL = {
  of: 'every',
  beat: 0.15,
  still: { speed: 0.5, for: 0.2 },
  most: 2.5,
  windup: 0.5,
  end: 0.35,
  clear: 3,
  pace: { windup: 0.5, blow: 0.25, ease: 0.1 },
  view: { above: 1.05, heights: [0.12, 0.4, 0.7], round: 12, dist: 2.5, grow: 0.02, apart: [0.5, 0.85], before: 2, path: 0.1, weights: { contact: 2, apart: 1.5, glove: 1.5, fall: 1.5, head: 1, sides: 0.5 }, closer: 1.5, push: 0.05, pad: 0.25 }
};

export function paceOf(u, blowAt, pace = FALL.pace) {
  if (u >= blowAt) return pace.blow;
  if (u <= blowAt - pace.ease) return pace.windup;
  const x = (u - (blowAt - pace.ease)) / pace.ease;
  return pace.windup + (pace.blow - pace.windup) * x * x * (3 - 2 * x);
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const mean = ps => M.scale(ps.reduce((s, p) => M.add(s, p), [0, 0, 0]), 1 / ps.length);
// (how near two segments come to each other, [p1, q1] and [p2, q2]; a point is a segment of no length)
function gap(p1, q1, p2, q2) {
  const d1 = M.sub(q1, p1),
    d2 = M.sub(q2, p2),
    r = M.sub(p1, p2),
    a = dot3(d1, d1),
    e = dot3(d2, d2),
    f = dot3(d2, r);
  let s = 0,
    t = 0;
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(...r);
  if (a <= 1e-12) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = dot3(d1, r);
    if (e <= 1e-12) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = dot3(d1, d2),
        den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) (t = 0), (s = Math.max(0, Math.min(1, -c / a)));
      else if (t > 1) (t = 1), (s = Math.max(0, Math.min(1, (b - c) / a)));
    }
  }
  return Math.hypot(...M.sub(M.add(p1, M.scale(d1, s)), M.add(p2, M.scale(d2, t))));
}
/* A man as a step kept him, as what hides what is behind him: [part, a, b, r] capsules (a ball where a is b) of his trunk,
   neck and head, his arms and gloves, and his legs (rig/body.mjs RADIUS). */
export function bodyOf(m) {
  const p = m.points,
    at = n => toWorld(m.place, m.pose.at[n], m.pose.stretch),
    R = RADIUS;
  return [
    ['trunk', p.hips, p.belly, R.Hips],
    ['trunk', p.belly, p.chest, R.Chest],
    ['neck', p.chest, at('Neck1'), 0.06],
    ['head', p.head, p.head, R.head],
    ...['L', 'R'].flatMap(k => [['arm', p[k + 'S'], p[k + 'E'], R.Arm], ['arm', p[k + 'E'], p[k], R.ForeArm], ['glove', p[k], p[k], R.glove]]),
    ...['Left', 'Right'].flatMap(S => [['leg', at(S + 'Leg'), at(S + 'Shin'), 0.07], ['leg', at(S + 'Shin'), at(S + 'Foot'), R.Shin]])
  ];
}
// (is p seen from the eye past these bodies, the last `margin` metres of the way to it left out?)
export function seen(eye, p, bodies, margin) {
  const d = M.sub(p, eye),
    l = Math.hypot(...d),
    q = M.add(eye, M.scale(d, Math.max(0, l - margin) / l));
  return bodies.every(([, a, b, r]) => gap(eye, q, a, b) >= r);
}
// (how much of a path lies across a picture looking along D, rather than along the line of sight: 0..1)
function across(path, D) {
  let all = 0,
    side = 0;
  for (let i = 1; i < path.length; i++) {
    const v = M.sub(path[i], path[i - 1]),
      l = Math.hypot(...v),
      along = dot3(v, D);
    all += l;
    side += Math.sqrt(Math.max(0, l * l - along * along));
  }
  return all > 1e-9 ? side / all : 0;
}
// a camera's way of looking (eye to what it frames), and its right and its up, as the renderer reckons them (render/renderer.mjs)
function lookOf(yaw, pitch) {
  const Z = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)],
    X = [Math.cos(yaw), 0, -Math.sin(yaw)];
  return { Z, X, Y: [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]] };
}
const unit = v => M.scale(v, 1 / (Math.hypot(...v) || 1));

/* The camera a knockdown's replay cuts to: frames, the steps it plays (as captureBout keeps them); hit: the blow { t, who,
   on, hand, at, vec, trunk }; live: the live camera's yaw. The rule (docs/moves-plan-6.md §2.4D):
   1. The way the blow travels as it lands (the way the glove was going as it met him: the bout's e.vec) is reckoned against
      the line between the two men: across it (flat), along it (flat), or up or down.
   2. Mostly across it (a hook, to the head or the body: its arc lies flat): from above, the bird's-eye (`above`, a pitch),
      side on to the line between them on the live camera's side.
      Otherwise (a straight, a jab, an uppercut): from the side, side on to the line between them, at the lowest of
      `heights`, on the side of the punching man's other hand, which his punching arm does not cover.
   3. That view is taken if, at the blow's step, the glove that landed and the part of him it landed on (his head, or his
      trunk where it landed) are both seen past both men's bodies (each a little fatter than its bones, by `grow`, as the
      splats are), and the page has room for it there (room(target, Z, size), if it gives one: the game's camera is not to
      look at them through the ropes). If not: a side view's other side, as low, if they are seen from there and there is
      room; else the best scored of every candidate in which they are and there is: from above, and from the side at each
      of `heights`, every 1/round of a turn round, each scored (set.weights) on
        contact  over the blow's step and the `before` steps before it, the share in which both are seen
        apart    the two men's chests apart in the picture, from apart[0] metres (none) to apart[1] (all)
        glove    how much of the blow's way (as in 1) and of the glove's path over its last `path` seconds lies across the
                 picture, not along the line of sight
        fall     the same of his head's way from the blow to the end
        head     the share of the replay's pictures in which his head is seen past both men's bodies (his own head left out)
        sides    the men on the sides of the picture they were on live (1) or not (0)
      (and if it is seen in none, the view of 2 all the same).
   What it frames, in its own picture: the middle of the box round the glove's path, both men's heads, chests and hips at
   the blow and his head and hips at the end (both men's upper bodies, and his falling away); `size` is that box's half
   width and half height (metres), for a page to draw it all in (distOf).
   -> { name ('above' | 'side'), why ('across' | 'along' | 'up', and '-other' or '-seen' if 3 took another), target, yaw, pitch,
        closer, push, size, seen (the check of 3), score, parts, scores: every candidate's } */
export function viewOf(frames, hit, set = FALL.view, live, room) {
  const k0 = Math.max(0, frames.findIndex(f => f.t >= hit.t - 1e-9)),
    at = frames[k0],
    struck = at.men[hit.on],
    by = at.men[hit.who],
    glove = frames.filter(f => f.t >= hit.t - set.path - 1e-9 && f.t <= hit.t + 1e-9).map(f => f.men[hit.who].points[hit.hand]),
    fall = frames.slice(k0).map(f => f.men[hit.on].points.head),
    end = frames[frames.length - 1].men[hit.on].points,
    keys = [...glove, struck.points.head, struck.points.chest, struck.points.hips, end.head, end.hips, by.points.head, by.points.chest, by.points.hips],
    line = [struck.x - by.x, 0, struck.z - by.z],
    axis = Math.atan2(line[0], line[2]),
    yaw = live === undefined ? axis - Math.PI / 2 : live,
    sides = [axis - Math.PI / 2, axis + Math.PI / 2],
    side0 = sides.slice().sort((a, b) => Math.abs(wrap(a - yaw)) - Math.abs(wrap(b - yaw)))[0],
    liveSide = Math.sign(dot3(line, lookOf(yaw, 0).X)) || 1,
    // (1: the way it travels as it lands, against the line between them)
    way = unit(hit.vec),
    along = unit(line),
    share = { across: Math.abs(dot3(way, [along[2], 0, -along[0]])), along: Math.abs(dot3(way, along)), up: Math.abs(way[1]) },
    why = share.across >= Math.max(share.along, share.up) ? 'across' : share.along >= share.up ? 'along' : 'up',
    // (the side his other hand is on: his left for a right hand's punch)
    other = M.scale(M.sub(by.points.LS, by.points.RS), hit.hand === 'R' ? 1 : -1),
    sideOff = sides.find(y => Math.sin(y) * other[0] + Math.cos(y) * other[2] > 0) ?? side0,
    // (the middle of the part it landed on: his head, or the point of his spine nearest where it landed, for a body shot)
    core = k => {
      const m = frames[k].men[hit.on];
      if (!hit.trunk) return m.points.head;
      const u = M.sub(m.points.chest, m.points.hips),
        s = Math.max(0, Math.min(1, dot3(M.sub(hit.at, m.points.hips), u) / (dot3(u, u) || 1)));
      return M.add(m.points.hips, M.scale(u, s));
    },
    // (both men's bodies at each step, a little fatter than their bones)
    bodies = frames.map(f => f.men.map(m => bodyOf(m).map(([part, a, b, r]) => [part, a, b, r + set.grow]))),
    // (the glove that landed, and the part it landed on, both seen from the eye at step k)
    met = (eye, k) => {
      const B = bodies[k].flat(),
        g = frames[k].men[hit.who].points[hit.hand],
        c = core(k);
      return seen(eye, g, B.filter(b => b[1] !== g), RADIUS.glove + set.grow) && seen(eye, c, B.filter(b => !(b[0] === 'head' && b[1] === c) && !(hit.trunk && b[0] === 'trunk' && b[0] && bodies[k][hit.on].includes(b))), (hit.trunk ? RADIUS.Chest : RADIUS.head) + set.grow);
    },
    near = frames.map((f, k) => k).filter(k => k <= k0 && k >= k0 - set.before),
    sights = frames.map((f, k) => k).filter(k => k >= k0 && (k - k0) % 3 === 0),
    W = set.weights,
    low = Math.min(...set.heights),
    first = why === 'across' ? { name: 'above', yaw: side0, pitch: set.above } : { name: 'side', yaw: sideOff, pitch: low },
    // (a side view's other side, as low)
    mirror = { name: 'side', yaw: sides.find(y => y !== first.yaw) ?? first.yaw, pitch: low },
    cands = [first, mirror, { name: 'above', yaw: side0, pitch: set.above }];
  for (let k = 0; k < set.round; k++) for (const pitch of set.heights) cands.push({ name: 'side', yaw: wrap(side0 + (2 * Math.PI * k) / set.round), pitch });
  for (const c of cands) {
    const { Z, X, Y } = lookOf(c.yaw, c.pitch),
      D = M.scale(Z, -1),
      xs = keys.map(p => dot3(p, X)),
      ys = keys.map(p => dot3(p, Y)),
      mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, keys.reduce((s, p) => s + dot3(p, D), 0) / keys.length];
    c.target = M.add(M.add(M.scale(X, mid[0]), M.scale(Y, mid[1])), M.scale(D, mid[2]));
    c.size = [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2];
    const eye = M.add(c.target, M.scale(Z, set.dist)),
      sep = Math.hypot(dot3(M.sub(struck.points.chest, by.points.chest), X), dot3(M.sub(struck.points.chest, by.points.chest), Y)),
      parts = {
        contact: near.filter(k => met(eye, k)).length / near.length,
        apart: Math.max(0, Math.min(1, (sep - set.apart[0]) / (set.apart[1] - set.apart[0]))),
        glove: (across(glove, D) + across([[0, 0, 0], way], D)) / 2,
        fall: across(fall, D),
        head: sights.filter(k => seen(eye, frames[k].men[hit.on].points.head, [...bodies[k][hit.who], ...bodies[k][hit.on].filter(b => b[0] !== 'head')], RADIUS.head + set.grow)).length / sights.length,
        sides: (Math.sign(dot3(line, X)) || 1) === liveSide ? 1 : 0
      };
    c.seen = met(eye, k0) && (!room || room(c.target, Z, c.size));
    c.parts = parts;
    c.score = Object.keys(W).reduce((s, k) => s + W[k] * parts[k], 0);
  }
  const fit = cands.slice(2).filter(c => c.seen),
    best = first.seen ? first : first.name === 'side' && mirror.seen ? mirror : fit.length ? fit.reduce((a, c) => (c.score > a.score + 1e-9 ? c : a)) : first;
  return { name: best.name, why: why + (best === first ? '' : best === mirror ? '-other' : '-seen'), target: best.target, yaw: best.yaw, pitch: best.pitch, closer: set.closer, push: set.push, size: best.size, seen: best.seen, score: best.score, parts: best.parts, share, scores: cands.slice(2).map(c => ({ name: c.name, yaw: c.yaw, pitch: c.pitch, score: c.score, seen: c.seen, parts: c.parts })) };
}

/* How far off what it frames a page draws a knockdown's replay: `closer` times closer than its live camera (live: that
   camera's distance; or nearer still, to `most` metres, if the page has no room further off: the game, inside its ropes),
   but never so close that the box viewOf framed (size, and `pad` metres round it for the bodies about those points) is cut
   by a picture of this shape (aspect: width over height; the renderer's field of view, 38 degrees high), and pushed in by
   `push` of that as it goes (progress 0..1) -> metres */
export const distOf = (view, live, aspect, progress, most = Infinity, set = FALL.view) =>
  Math.max(Math.min(live / view.closer, most), Math.max(view.size[1] + set.pad, (view.size[0] + set.pad) / aspect) / Math.tan((19 * Math.PI) / 180)) * (1 - view.push * progress);
// (the way a camera at yaw and pitch looks back from what it frames to its eye, as the renderer reckons it)
export const backOf = (yaw, pitch) => [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];

// (a's own numbers over b's: one level down, and the view's weights one further)
const over = (a, b) => {
  const out = Object.assign({}, a);
  for (const k in b || {}) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? over(a[k] || {}, b[k]) : b[k];
  return out;
};

export function createReplay(o) {
  o = Object.assign({ keep: 2, slow: 0.25, lead: 0.05, tail: 0.25, capture: captureBout, yaw: null, brilliant: true }, o);
  const F = over(FALL, o.fall);
  let kept = [], // { clock, t, snap }
    clock = 0,
    armed = null, // a brilliant defence seen: { from, who, counter }
    met = null, // and its counter landed: the clock it did
    presses = [null, null], // each man's last press of a punch: { name, t }
    fall = null, // a knockdown's blow seen: render/blow.mjs fallOf, with hit, from (the bout time it plays from), landT (he came down), quietAt, stillAt
    play = null, // { frames, at, seen, kind, on } (and a knockdown's: u, shown, blow, view)
    drawn = null; // the picture next() last gave: { kind, view, progress } (kept until the bout is stepped again)
  // (the steps kept from the bout time `t0` on, to t1, each once: the steps that held the moment of a blow are the same picture)
  const span = (t0, t1 = Infinity) => {
    const out = [];
    for (const k of kept) if (k.t >= t0 - 1e-9 && k.t <= t1 + 1e-9 && (!out.length || k.t > out[out.length - 1].t + 1e-9)) out.push(k);
    return out.map(k => k.snap);
  };
  const start = (frames, kind, on, f) => {
    if (frames.length < 2) return false;
    play = { frames, at: 0, seen: -1, kind, on };
    if (f) Object.assign(play, { u: frames[0].t, shown: null, blow: f.hit.t, view: Object.assign(viewOf(frames, f.hit, F.view, o.yaw ? o.yaw() : undefined, o.room), { blow: f.hit.t, hit: f.hit, from: frames[0].t, to: frames[frames.length - 1].t }) });
    return true;
  };
  return {
    slow: o.slow,
    fall: F,
    crossed: [],
    started: false,
    moved: 0,
    get playing() {
      return !!play;
    },
    get pending() {
      return !!fall;
    },
    // (the knockdown awaited, for looking at: hit, from, landT, quietAt, stillAt; null when none is)
    get awaiting() {
      return fall;
    },
    get kind() {
      return play ? play.kind : drawn ? drawn.kind : null;
    },
    get on() {
      return play ? play.on : drawn ? drawn.on : null;
    },
    // (of the picture next() last gave, its last one too)
    get view() {
      return drawn ? drawn.view : null;
    },
    get progress() {
      return drawn ? drawn.progress : 0;
    },
    watch(bout, dt, quiet) {
      clock += dt;
      drawn = null;
      const snap = o.capture(bout);
      snap.events = bout.events.filter(e => BLOWS.includes(e.type) || HEARD.includes(e.type));
      kept.push({ clock, t: bout.t, snap });
      for (const e of bout.events) {
        if (e.type === 'punch') presses[e.who] = { name: e.name, t: bout.t };
        if (e.type === 'brilliant' && o.brilliant) (armed = { from: e.from, who: e.who, counter: e.counter }), (met = null);
        // (the counter it was answered with: when it meets him, or misses, the replay goes on a moment and then plays)
        else if (armed && met === null && e.who === armed.who && ['hit', 'whiff', 'block', 'graze'].includes(e.type)) {
          const f = bout.fighters[armed.who];
          if (f.action && f.action.id === armed.counter) met = clock;
        }
        // (a knockdown: from the press of the punch that did it, or from so long before it at most)
        const down = fallOf(e);
        if (down && (F.of === 'every' || e.out || bout.over !== null)) {
          const p = presses[e.who];
          fall = Object.assign(down, { hit: { t: bout.t, who: e.who, on: e.on, hand: e.hand, at: e.at.slice(), vec: e.vec.slice(), trunk: e.trunk || null }, from: Math.max(p && p.name === e.name ? p.t : -Infinity, bout.t - F.windup), landT: null, quietAt: null, stillAt: null, calm: 0, was: null });
          /* (a brilliant defence whose counter puts him down is replayed as the knockdown alone: its quarter speed would cut
             into the fall, before he is down: the knockdown's showing is live all the way down first, then its replay) */
          armed = met = null;
        }
      }
      // (what is kept: the last `keep` seconds, and, while a knockdown's replay is awaited, everything from where it starts)
      while (kept.length > 1 && kept[0].clock < clock - o.keep && !(fall && kept[0].t >= fall.from - 1e-9)) kept.shift();
      if (fall) {
        // (the step he first comes down on the canvas, kept with that step)
        if (fall.landT === null) {
          const landing = cameDown(fall, bout.fighters[fall.on]);
          if (landing) (fall.landT = bout.t), (snap.landed = { fall, landing });
        }
        // (from then: how long his head, chest and hips have each gone slower than FALL.still.speed, and whether the effects are out)
        if (fall.landT !== null) {
          const p = bout.fighters[fall.on].points,
            now = { t: bout.t, head: p.head.slice(), chest: p.chest.slice(), hips: p.hips.slice() };
          if (fall.was && now.t > fall.was.t + 1e-9) {
            const d = now.t - fall.was.t,
              fast = Math.max(...['head', 'chest', 'hips'].map(k => Math.hypot(...M.sub(now[k], fall.was[k])) / d));
            fall.calm = fast < F.still.speed ? fall.calm + d : 0;
            if (fall.stillAt === null && fall.calm >= F.still.for - 1e-9) fall.stillAt = bout.t;
          }
          if (!fall.was || now.t > fall.was.t + 1e-9) fall.was = now;
          if (fall.quietAt === null && quiet !== false && bout.t > fall.landT + 1e-9) fall.quietAt = bout.t;
        }
      }
      if (armed && met !== null && clock - met >= o.tail - 1e-9) {
        const frames = span(armed.from - o.lead);
        armed = met = null;
        if (start(frames, 'brilliant', null)) return true;
      }
      if (fall) {
        // (when everything is out and a beat gone by and he is all but still, or at the latest so long after the blow)
        const ready = fall.quietAt !== null && bout.t - fall.quietAt >= F.beat - 1e-9 && fall.stillAt !== null;
        if (ready || bout.t - fall.hit.t >= F.most - 1e-9) {
          const f = fall,
            end = Math.min(f.hit.t + F.end, f.landT !== null ? f.landT - F.clear * DT : Infinity),
            frames = span(f.from, end);
          fall = null;
          if (start(frames, 'fall', f.on, f)) return true;
        }
      }
      return false;
    },
    next(dt) {
      if (!play) return null;
      if (play.view) {
        /* (a knockdown's: the bout's time it shows moved on by the real time at its own pace, drawn between the two steps
           round it; from the first step at the start, to the last on the last picture) */
        const { frames } = play,
          n = frames.length,
          end = frames[n - 1].t,
          u = Math.min(play.u, end);
        let i = Math.max(0, play.seen);
        while (i + 1 < n && frames[i + 1].t <= u + 1e-9) i++;
        const snap = i + 1 < n ? blend(frames[i], frames[i + 1], (u - frames[i].t) / (frames[i + 1].t - frames[i].t)) : frames[i];
        this.started = play.seen < 0;
        this.crossed = frames.slice(play.seen + 1, i + 1);
        play.seen = Math.max(play.seen, i);
        this.moved = play.shown === null ? 0 : u - play.shown;
        play.shown = u;
        drawn = { kind: play.kind, on: play.on, view: play.view, progress: Math.min(1, (u - frames[0].t) / Math.max(1e-6, end - frames[0].t)) };
        if (u >= end - 1e-9) play = null;
        else play.u = u + dt * paceOf(u, play.blow, F.pace);
        return snap;
      }
      /* (the steps were a sixtieth of a second apart: at a quarter of the speed it takes four pictures to go from one to the
         next; from the first step at the start to the last on the last picture, a sixtieth of a second before it is over) */
      const n = play.frames.length,
        p = Math.min(n - 1, (play.at * (n - 1)) / (n - o.slow)),
        i = Math.min(n - 1, Math.floor(p)),
        snap = i + 1 < n ? blend(play.frames[i], play.frames[i + 1], p - i) : play.frames[i];
      this.started = play.seen < 0;
      this.crossed = play.frames.slice(play.seen + 1, i + 1);
      this.moved = dt * o.slow;
      drawn = { kind: play.kind, on: play.on, view: null, progress: Math.min(1, play.at / Math.max(1e-6, n)) };
      play.seen = Math.max(play.seen, i);
      play.at += (dt * o.slow) / DT;
      if (play.at >= n) play = null;
      return snap;
    },
    skip() {
      play = drawn = null;
      this.crossed = [];
    },
    live(k) {
      const n = kept.length;
      if (!n) return null;
      return n < 2 ? kept[n - 1].snap : blend(kept[n - 2].snap, kept[n - 1].snap, Math.max(0, Math.min(1, k)));
    },
    reset() {
      kept = [];
      armed = met = fall = play = drawn = null;
      presses = [null, null];
      this.crossed = [];
    }
  };
}
