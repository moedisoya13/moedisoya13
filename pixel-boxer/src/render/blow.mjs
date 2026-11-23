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
                           gain and a body shot's smaller share are in the damage already); a knockdown's lava in their
                           place, thrown twice (the second volley left with fx to throw on its own clock). -> how many
                           motes (or globs and embers, both volleys) it throws
     lavaOf(e)             a knockdown's lava, as blow throws it: { globs, embers (how many of each, in all), width (a
                           glob's, metres), volleys: [{ globs, embers }, ...] (each throw, the first at once and the
                           next FX.lava.twice.gap seconds later), gap }, or null for any other event
     met(fx, e)            a block's or a parry's sparks, where the gloves met
     rippleOf(e, struck)   the ripple a hit starts: { joint, off, age: 0, strength, width, last, sway } (strength and
                           width by the damage; age to be moved on by the caller, in the same time as the motes), or null
                           for anything that is not a hit
     rippleRow(ripple, struck, set)   the layer's wave for it now: [x, y, z, front, width, strength, sway], or null once it
                           is over (set: the ripple's numbers, FX.ripple by default)
   A knockdown's blow (a hit that puts him down, or out cold: e.down, e.out) is drawn as its own (docs/moves-plan-6.md §2.4B),
   with no light in any of it, and nothing of the bout changed: where his falling body first comes down on the canvas, a
   second ripple goes through him from the part that came down, and a large ring goes out through the canvas from under it,
   lifting the tiles as it passes; and the game and the effect study show the moment of the blow at a quarter of the speed.
   Its motes are lava (§2.4C): in place of the two kinds of coloured mote every other hit throws, globs of it and embers, in
   the colours of heat and of charcoal alone (never the palette's white or blues), from the same far side of him and the
   same way. A glob is never one colour: hot, its head is the hottest, its body a step cooler and its tail two; as it cools
   (from the top of its flight, as it falls faster and as it ages) a charcoal crust forms behind it and closes round a
   shrinking orange glow (never red), until it is a cinder with one orange point, and the point goes out;
   it is heavy, and where it comes down on the canvas it does not bounce but lies there as a flat spot, a glowing core over
   a charcoal rim going dark, and is gone. As it flies it sheds embers. An ember is a speck, thrown faster and wider, caught
   by the air within half a metre, then drifting and wandering, flickering between two steps of its glow as it cools (by its
   own age and seed, so a slow motion and a replay show it the same), and going out from orange by winking. The lava is
   thrown twice in quick succession (§2.4C 7, the user's: "빠르게 2연속 발사"): the first volley as the blow lands, a second
   as many again (or a share of it) a moment later on the motes' own clock, from where the line of the blow comes out of him
   then: from the part it struck as he is at that moment if the fx is handed him as he goes on (the game, a live card, the
   effect study, the review sheet), or from where it was if he is a step kept for a replay; the same way, scattered by the
   fx's own dice when it is thrown, drawn in his own layer like the first so that it too shows first at his outline. The
   ripple, the slow motion and what happens where he comes down are each once.
     fallOf(e)             a knockdown blow's watch for where he comes down: { on, q, out, landed: null }, or null for any
                           other event
     landingOf(man)        the part of him nearest the canvas, if it is within FX.land.near of it: { joint, clear (metres
                           between the part's underside and the canvas), at (that underside, world) }, or null. man: as
                           the bout keeps him, or as a replay does ({ pose, place, points })
     landed(fall, man)     after each step of the bout: where he first comes down, on the step he does (once), else null
     landRipple(fall, man, landing)   the second ripple, from the part that came down: as rippleOf's, FX.ripple.land
     groundOf(fall, landing)          the ring through the canvas: { at (world, on the canvas), age: 0, last, lift (metres) }
     groundRow(ground, set)           the canvas layer's ground wave for it now: [x, y, z, front, width, lift, glow] (glow: the
                           lift past which a tile is drawn a step lighter, 0 none), or null once it is over
     groundLift(row, p)    how high that lifts a point of the canvas (the renderer's own reckoning, for checking it)
     slowOf(e)             the slow motion a knockdown's blow starts: { span (bout seconds), u, back, held }, or null
     paceOf(slow)          the speed the picture is to play at now (1 is as it happens)
     slowOn(slow, real, since, held)  moved on by `real` seconds of real time, the bout now `since` seconds past the blow
                           (its own time: the held moment of the blow is not counted), held while that moment is held ->
                           the slow motion, or null once it is over */
import * as M from '../rig/m3.mjs';
import { RADIUS } from '../rig/body.mjs';
import { toWorld } from '../anim/pose.mjs';

export const FX = {
  head: 0.115,
  out: 0.01,
  ref: 3,
  most: 2.2,
  motes: { n: [17, 11], width: 0.024, thin: 0.01, life: 0.95, short: 0.4, pace: 1.05 },
  /* a knockdown's lava, in place of the motes (render/fx.mjs globs, embers), with no light in it. glow: the palette's
     colours of heat from the hottest down (assets/manifest.json: pale yellow 39, amber 40, orange 18); crust: the charcoal
     a glob cools to, lightest first (7, 6, 5), so that nothing cooling is ever red: lava cools to a cinder with a glow in
     it, and an ember goes out from orange, winking. globs: how many at ref; how thick, times the motes' width, never thinner than `least` metres (so that its
     three tones show) nor thicker than `most` (one as big as his head would be a ball, not a drop); times the motes'
     gravity, the air's hold on them and their life; how fast one must fall to be cold (m/s); how long one gone cold before
     it comes down is carried on down to the canvas (s, at most: none, so that most go out in the air, as the plan has it);
     how long it lies there once it is down (s); and the embers it sheds: one every so many seconds, at a share of its
     velocity, at most so many. embers: how many at ref; times the speed and the spread of the globs' fan; times the motes'
     gravity, the air's hold and their life; how much more the air holds one for every m/s it goes (the faster, the harder:
     so that, a fifth faster than the globs, they are still stopped within half a metre); how fast it wanders (m/s, least
     and most); how often it flickers (s); and the speed over which it has a tail (m/s). twice: the second volley, `gap`
     seconds of the motes' own time after the first, `share` times its size (1: as many again; null: thrown once) */
  lava: {
    glow: [39, 40, 18],
    crust: [7, 6, 5],
    globs: { n: 11, width: 1.7, least: 0.024, most: 0.06, fall: 0.8, drag: 0.8, life: 1.6, cool: 2.5, land: 0, spot: 0.35, shed: { every: 0.05, pace: 0.3, most: 4 } },
    embers: { n: 18, pace: 1.2, wide: 1.2, fall: 0.2, drag: 1.6, life: 2, brake: 4, wander: [0.1, 0.2], flicker: 0.04, trail: 1.5 },
    twice: { gap: 0.05, share: 1 }
  },
  // (land: the second ripple of a knockdown, from where he comes down: its strength times the blow's, and how long it goes)
  ripple: { speed: 3, last: 0.4, width: 0.14, sway: 0.034, thin: 0.06, down: { last: 0.55, sway: 1.3 }, land: { strength: 0.8, last: 0.45 } },
  // where a falling man comes down: the first step any of these parts of him (its middle, and how thick it is) is this near
  land: { near: 0.06, parts: [['hips', RADIUS.Hips], ['chest', RADIUS.Chest], ['head', RADIUS.head], ['LeftShin', RADIUS.Shin], ['RightShin', RADIUS.Shin]] },
  /* the ring through the canvas from where he comes down: its front's speed (m/s), how long it goes, the width of its train
     of waves (metres), how high it lifts the tiles (metres: at the measure, FX.ref, in proportion to the damage below it,
     never more than that and never less than `least`), the share of the lift past which a tile is drawn a step lighter, and
     a knockout's (how long, times the lift) */
  ground: { speed: 4, last: 0.6, width: 0.35, lift: 0.03, least: 0.01, glow: 0.3, out: { last: 0.75, lift: 1.3 } },
  /* a knockdown's slow motion: the speed it is shown at, the speed it starts from and the real seconds it takes to get from
     that to it, the real seconds it takes to get back to full speed once it is over, and how long it lasts (bout seconds)
     for a knockdown and for a knockout */
  slow: { rate: 0.25, from: 0.5, ease: 0.05, back: 0.1, down: 0.25, out: 0.35 }
};
// health a newton-second takes off a man with an ordinary chin (game/bout.mjs RULES.damage): for a hit that carries no damage
const PER_NS = 0.035;

// the sparks of a hit: [colours, speed] of its two kinds for a blow of k (its impulse over 85 N s, to 1.6: the speeds as before)
const SPARKS = [k => [[38, 39, 40, 41], 2.5 + 3 * k], k => [[41, 41, 25], 2.5 + 2 * k]];

export const scaleOf = e => Math.min(FX.most, Math.max(0, (e.damage ?? e.J * PER_NS) / FX.ref));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.sqrt(dot(a, a));
const smooth = x => ((x = Math.max(0, Math.min(1, x))), x * x * (3 - 2 * x));
// a point of him by name, in the world: one the bout keeps (his head, hips, chest, belly...), or else a joint of his pose
const pointOf = (man, joint) => (man.points && man.points[joint]) || toWorld(man.place, man.pose.at[joint], man.pose.stretch);

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

/* (how many globs and embers each volley of a knockdown's blow of q throws, the first and, if there is one, the second;
   and how thick a glob is) */
const lavaFor = q => {
  const G = FX.lava.globs,
    T = FX.lava.twice,
    first = { globs: Math.max(1, Math.round(G.n * q)), embers: Math.max(1, Math.round(FX.lava.embers.n * q)) },
    volleys = [first];
  if (T && T.share > 0) volleys.push({ globs: Math.max(1, Math.round(first.globs * T.share)), embers: Math.max(1, Math.round(first.embers * T.share)) });
  return { volleys, width: Math.min(G.most, Math.max(G.least, Math.max(FX.motes.thin, FX.motes.width * q) * G.width)) };
};
export const lavaOf = e => {
  if (e.type !== 'hit' || !(e.down || e.out)) return null;
  const { volleys, width } = lavaFor(scaleOf(e));
  return { globs: volleys.reduce((n, v) => n + v.globs, 0), embers: volleys.reduce((n, v) => n + v.embers, 0), width, volleys, gap: volleys.length > 1 ? FX.lava.twice.gap : 0 };
};

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
  if (e.down || e.out) {
    // a knockdown's: lava, the globs as fast as the first kind of mote, the embers faster, both lasting longer
    const L = FX.lava,
      G = L.globs,
      E = L.embers,
      { volleys, width: thick } = lavaFor(q),
      speed = SPARKS[0](k)[1],
      ember = { glow: L.glow, width: FX.motes.thin, life: o.life * E.life, fall: E.fall, drag: E.drag, brake: E.brake, wander: E.wander, flicker: E.flicker, trail: E.trail },
      // (one volley from `at`, gone `late` seconds on its way already)
      volley = (at, { globs, embers }, late) => {
        fx.globs(at, globs, speed, way, thick, { glow: L.glow, crust: L.crust, life: o.life * G.life, pace: o.pace, fall: G.fall, drag: G.drag, cool: G.cool, land: G.land, spot: G.spot, shed: Object.assign({ ember }, G.shed), age: late });
        fx.embers(at, embers, speed * E.pace, way, FX.motes.thin, Object.assign({ pace: o.pace, wide: E.wide, age: late }, ember));
      };
    volley(from, volleys[0], 0);
    if (volleys[1]) {
      /* the second: from where the line of the blow comes out of him then, the line held to the part it struck (his head, or
         his trunk at Spine2) as the ripple is, the part as he is then (as it was, for a man kept as a step) */
      const key = e.trunk ? 'belly' : 'head',
        was = struck.points[key].slice();
      fx.after(L.twice.gap, late => {
        const p = struck.points,
          moved = M.sub(p[key], was),
          now = e.trunk ? { at: p.waist, to: p.chest, r: e.trunk.r } : { at: p.head, r: FX.head };
        volley(exitOf(now, M.add(e.at, moved), e.vec), volleys[1], late);
      });
    }
    return volleys.reduce((n, v) => n + v.globs + v.embers, 0);
  }
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
  const c = M.add(pointOf(struck, ripple.joint), ripple.off);
  return [c[0], c[1], c[2], set.speed * ripple.age, ripple.width ?? set.width, ripple.strength * (1 - ripple.age / ripple.last) ** 1.2, ripple.sway];
}

export const fallOf = e => (e.type === 'hit' && (e.down || e.out) ? { on: e.on, q: scaleOf(e), out: !!e.out, landed: null } : null);

/* (each part's underside: its middle, as far down as it is thick; the lowest of them, if it is near enough the canvas. A
   knee is a joint of his pose; the rest the bout keeps as his points) */
export function landingOf(man) {
  let low = null;
  for (const [joint, r] of FX.land.parts) {
    const p = pointOf(man, joint),
      clear = p[1] - r;
    if (!low || clear < low.clear) low = { joint, clear, at: [p[0], clear, p[2]] };
  }
  return low.clear < FX.land.near ? low : null;
}

export function landed(fall, man) {
  if (!fall || fall.landed) return null;
  const l = landingOf(man);
  if (l) fall.landed = l;
  return l;
}

export function landRipple(fall, man, landing) {
  const set = FX.ripple,
    q = fall.q * set.land.strength;
  // (held to the part that came down, from its underside; as long a sway as the blow's own ripple)
  return { joint: landing.joint, off: M.sub(landing.at, pointOf(man, landing.joint)), age: 0, strength: q, width: Math.max(set.thin, set.width * q), last: set.land.last, sway: set.sway * set.down.sway };
}

export function groundOf(fall, landing) {
  const set = FX.ground,
    out = fall.out ? set.out : null;
  // (as high as the blow was hard, a knockout's higher: up to the most it lifts them, which a pro's straight does)
  return { at: [landing.at[0], 0, landing.at[2]], age: 0, last: out ? out.last : set.last, lift: Math.min(set.lift, Math.max(set.least, set.lift * fall.q * (out ? out.lift : 1))) };
}

export function groundRow(ground, set) {
  set = set || FX.ground;
  if (!ground || ground.age >= ground.last) return null;
  const fade = (1 - ground.age / ground.last) ** 1.2,
    lift = ground.lift * fade;
  // (the crest a step lighter while it is still high enough to be seen as a crest)
  return [ground.at[0], ground.at[1], ground.at[2], set.speed * ground.age, set.width, lift, fade > 0.3 ? set.glow * lift : 0];
}

/* How high the ring lifts a point of the canvas (world), as the renderer's shader works it out (render/renderer.mjs: the
   ground wave): from how far out it is along the canvas, past or short of the front, a crest at the front, steep ahead of
   it, a trough and a smaller crest trailing behind; nothing above the canvas. -> metres */
export function groundLift(row, p) {
  if (!row) return 0;
  const x = Math.hypot(p[0] - row[0], p[2] - row[2]) - row[3],
    w = row[4],
    env = x > 0 ? Math.exp(-(x * x) / (0.09 * w * w)) : Math.exp(-(x * x) / (w * w)),
    y = Math.abs(p[1]),
    above = Math.max(0, Math.min(1, (y - 0.03) / 0.09));
  return row[5] * env * Math.cos((6.2832 * x) / (1.4 * w)) * (1 - above * above * (3 - 2 * above));
}

export const slowOf = e => (e.type === 'hit' && (e.down || e.out) ? { span: e.out ? FX.slow.out : FX.slow.down, u: 0, back: -1, held: true } : null);

/* (from half the speed down to a quarter as it starts, eased, in its first FX.slow.ease real seconds; a quarter until the
   bout is so far past the blow; then back up to the full speed, eased, in FX.slow.back real seconds) */
export function paceOf(slow) {
  const S = FX.slow;
  if (!slow || slow.held) return 1;
  if (slow.back < 0) return S.from + (S.rate - S.from) * smooth(slow.u / S.ease);
  return S.rate + (1 - S.rate) * smooth((slow.u - slow.back) / S.back);
}

export function slowOn(slow, real, since, held) {
  if (!slow) return null;
  slow.held = held;
  if (held) return slow; // (the moment of the blow, held as it always is: the slow motion is of the bout's own time)
  slow.u += real;
  if (slow.back < 0 && since >= slow.span - 1e-9) slow.back = slow.u;
  return slow.back >= 0 && slow.u - slow.back >= FX.slow.back ? null : slow;
}
