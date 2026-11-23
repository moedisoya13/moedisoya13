/* How a blow is drawn (docs/moves-plan-6.md §2), the one place the game, the motion catalogue, the pending catalogue and the
   review sheet all take it from. Nothing here knows the renderer: it works out where things are, and puts motes into an fx
   (render/fx.mjs) and a ripple into a layer's `wave` (render/renderer.mjs).
   A blow that lands throws the sparks it always has (the same colours; a twentieth faster; how many, how thick and how
   long they last, in proportion to the damage it did, a pro's straight a twentieth shorter-lived than they were), but from
   where the line of
   the blow comes out of the part of him it struck, on his far side, and along the way the glove was going, up and down as
   well as across. They go into an fx of his own, drawn `outside` his silhouette, so none of them is ever seen over him: the
   first of them shows at his outline. A glove met by a glove (a block, a parry) has no struck body: its sparks stay where
   they met. In place of a flash of white on him, a ripple goes out through him from where it landed, held to the part it
   landed on (his head, or his trunk at Spine2) wherever that goes as he is knocked back or folds. One ripple a man: a new
   blow while one is going through him takes its place.
     FX                    the numbers: head (the head as a ball, metres), out (how far off the surface the motes start),
                           ref (the damage everything is measured by: the health a pro's straight to the head takes, 85 N s),
                           most (the most times ref a blow is drawn as), motes { n (how many of each kind at ref), width
                           (how thick at ref, metres), thin (the thinnest drawn), life (how long they last at ref, times
                           the sparks' own 0.16-0.38 s), short (the least that is, times ref's), pace (times the sparks'
                           own velocity) }, ripple { speed (m/s its front goes
                           out), last (seconds), width (metres of the train of waves at its front, at ref), sway (metres it
                           carries what it passes, at the start, at ref), thin (the narrowest train), down { last, sway
                           (times) }: a knockdown's }
     scaleOf(e)            the damage of a hit over FX.ref, to FX.most: how many motes, how thick, how long they last, how
                           wide and how far the ripple, all in proportion to it (the user's rule: twice the damage, twice
                           of each)
     exitOf(part, at, vec) where the motes start: part { at, r } (a ball) or { at, to, r } (a capsule: a trunk, the hit's
                           e.trunk); at where the glove met him; vec the way it was going (unit). -> a point in the world
     blow(fx, e, struck)   a hit's motes into fx (the struck man's own), from the far side of what it struck (e.trunk if
                           it is a body shot, else his head): their number and their thickness by the damage (a counter's
                           gain and a body shot's smaller share are in the damage already). -> how many motes
     met(fx, e)            a block's or a parry's sparks, where the gloves met
     rippleOf(e, struck)   the ripple a hit starts: { joint, off, age: 0, strength, width, last, sway } (strength and
                           width by the damage; age to be moved on by the caller, in the same time as the motes), or null
                           for anything that is not a hit
     rippleRow(ripple, struck, set)   the layer's wave for it now: [x, y, z, front, width, strength, sway], or null once it
                           is over (set: the ripple's numbers, FX.ripple by default) */
import * as M from '../rig/m3.mjs';

export const FX = {
  head: 0.115,
  out: 0.01,
  ref: 3,
  most: 2.2,
  motes: { n: [17, 11], width: 0.024, thin: 0.01, life: 0.95, short: 0.4, pace: 1.05 },
  ripple: { speed: 3, last: 0.4, width: 0.14, sway: 0.034, thin: 0.06, down: { last: 0.55, sway: 1.3 } }
};
// health a newton-second takes off a man with an ordinary chin (game/bout.mjs RULES.damage): for a hit that carries no damage
const PER_NS = 0.035;

// the sparks of a hit: [colours, speed] of its two kinds for a blow of k (its impulse over 85 N s, to 1.6: the speeds as before)
const SPARKS = [k => [[38, 39, 40, 41], 2.5 + 3 * k], k => [[41, 41, 25], 2.5 + 2 * k]];

export const scaleOf = e => Math.min(FX.most, Math.max(0, (e.damage ?? e.J * PER_NS) / FX.ref));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.sqrt(dot(a, a));

/* The point of the part's core (its middle, or the segment from at to to) nearest the point p. */
function nearest(part, p) {
  if (!part.to) return part.at;
  const u = M.sub(part.to, part.at),
    s = Math.max(0, Math.min(1, dot(M.sub(p, part.at), u) / (dot(u, u) || 1)));
  return M.add(part.at, M.scale(u, s));
}

/* Where the line of the blow leaves the part: the last point of it inside, or, for a line that only passes by it (or grazes
   it), the point of its surface the line comes nearest. The motes start FX.out beyond that, out along the surface's own
   facing there. For a ball this is the plan's: c + (m - c) h / |m - c| + d sqrt(r2 - h2), m the point of the line nearest
   the middle and h its distance, to r; a line through the middle leaves at c + d r. A capsule is the same with c the point
   of its spine nearest the line (a liver hook comes out of his left side and back); the line's distance from the spine is
   convex along it, so its way out is found by halving from the nearest point. */
export function exitOf(part, at, vec) {
  const o = at,
    d = vec,
    r = part.r;
  let c, t0;
  if (!part.to) (c = part.at), (t0 = dot(M.sub(c, o), d));
  else {
    // (the point of the spine nearest the line, and the line's own point nearest it: a quadratic in both, the spine's end kept)
    const u = M.sub(part.to, part.at),
      w = M.sub(part.at, o),
      a = dot(u, u),
      b = dot(u, d),
      e = dot(d, w),
      den = a - b * b,
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * e - dot(u, w)) / den)) : 0.5;
    c = M.add(part.at, M.scale(u, s));
    t0 = dot(M.sub(c, o), d);
  }
  const m = M.add(o, M.scale(d, t0)),
    gap = len(M.sub(m, c));
  let p;
  if (gap >= r) p = M.add(c, M.scale(M.sub(m, c), r / gap)); // (it passes by: the edge it passes)
  else if (!part.to) p = gap > 1e-9 ? M.add(m, M.scale(d, Math.sqrt(r * r - gap * gap))) : M.add(c, M.scale(d, r));
  else {
    // (the way out of a capsule: from the nearest point on along the line until it is r off the spine)
    let lo = t0,
      hi = t0 + 2 * r + len(M.sub(part.to, part.at));
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2,
        q = M.add(o, M.scale(d, mid));
      if (len(M.sub(q, nearest(part, q))) < r) lo = mid;
      else hi = mid;
    }
    p = M.add(o, M.scale(d, hi));
  }
  const q = nearest(part, p),
    facing = M.sub(p, q),
    fl = len(facing);
  return M.add(p, M.scale(fl > 1e-9 ? M.scale(facing, 1 / fl) : d, FX.out));
}

export function blow(fx, e, struck) {
  const q = scaleOf(e),
    // (how fast they leave is as it was: by the impulse, or by the damage where that is more, a counter's)
    k = Math.min(1.6, Math.max(q, (e.J || 0) / 85)),
    part = e.trunk ? e.trunk : { at: struck.points.head, r: FX.head },
    from = exitOf(part, e.at, e.vec),
    // (the way the glove was going: across, as before, and now up or down as well, at the same 0.7 of the speed)
    way = [e.vec[0], e.vec[2], e.vec[1]],
    // (how thick each is: in proportion to the damage, down to the thinnest that still shows as a pixel)
    width = Math.max(FX.motes.thin, FX.motes.width * q),
    // (how long each lasts: a twentieth less than the sparks always did at the measure, and in proportion to the damage from
    // there, down to FX.motes.short of it; and all of them a twentieth faster)
    o = { life: FX.motes.life * Math.max(FX.motes.short, q), pace: FX.motes.pace };
  let n = 0;
  SPARKS.forEach((sparks, i) => {
    const [colours, speed] = sparks(k),
      many = Math.max(1, Math.round(FX.motes.n[i] * q));
    fx.sparks(from, many, colours, speed, way, width, o);
    n += many;
  });
  return n;
}

export function met(fx, e) {
  if (e.type === 'block') fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir);
  else if (e.type === 'parry') fx.sparks(e.at, 14, [38, 38, 39, 40], 5);
}

export function rippleOf(e, struck) {
  if (e.type !== 'hit') return null;
  const joint = e.trunk ? 'belly' : 'head', // (the trunk's middle: Spine2, game/trunk.mjs)
    base = struck.points[joint],
    set = FX.ripple,
    q = scaleOf(e),
    down = !!(e.down || e.out);
  return {
    joint,
    off: M.sub(e.at, base),
    age: 0,
    // (how far it carries what it passes, and how wide its train of waves: both in proportion to the damage)
    strength: q,
    width: Math.max(set.thin, set.width * q),
    last: down ? set.down.last : set.last,
    sway: set.sway * (down ? set.down.sway : 1)
  };
}

export function rippleRow(ripple, struck, set) {
  set = set || FX.ripple;
  if (!ripple || ripple.age >= ripple.last) return null;
  const c = M.add(struck.points[ripple.joint], ripple.off);
  return [c[0], c[1], c[2], set.speed * ripple.age, ripple.width ?? set.width, ripple.strength * (1 - ripple.age / ripple.last) ** 1.2, ripple.sway];
}
