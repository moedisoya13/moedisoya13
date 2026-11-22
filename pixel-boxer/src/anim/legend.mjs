/* A legend's movement (docs/moves-plan-4.md §12): at 5명 and 5암 the head and the knees are part of the shape of going
   anywhere, not something pressed on top of it. Stepping sideways or round, every foot that comes down is a shallow weave,
   the head drawn under to the side of that foot; stepping in, the head slips outside as the lead foot lands and the knees
   stay bent; stepping out, the upper body lies back off the rear foot's landing and comes straight back; a dash goes under
   (in), sways back and slips on landing (back), or is a weave (to the side). A clean legend does it on his beat, the bottom
   of each U on a foot coming down; a dirty one off it, never the same size twice, and now and then a feint of the lead
   shoulder in it. Nothing here is an evasion: the head is simply somewhere else, and a punch that finds it gone misses by
   what the bout's physics says.
     travel(c, s)          the walking shapes, added to this frame's channels (s: see below)
     dash(c, d, T)         a dash's shape, T seconds after it started (d: see dashShape), until it is over (-> false)
     dashShape(action, lg, seed)   what a dash started now is to look like
   The shapes are made by the knees (lkf, rkf: animator.mjs, bend), the waist and the hips over the feet; the height of the
   hips is never written. Grades below 5 have no `legend` (skill.mjs: stance.legend) and nothing here runs for them. */
import { headTo, dice } from './stance.mjs';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);
/* The bottom of a U is where the legs take him, the top where he floats: a body thrown up and caught. Down it can go no
   faster than gravity (1.3 g with the muscles pulling: animator.mjs, FALL), and up the legs drive at up to 3 g, so the U is
   two parabolas, the one at the bottom R times as sharp as the one at the top. dip(d): 1 at the bottom, 0 at either top
   (d = -0.5 and 0.5), level there. With the head going down D metres over a U W seconds wide, the top asks 2 TOP D / W^2
   of gravity: 6.5 cm over a 0.29 s half beat is 10 m/s^2, under the 12.75 there is (a half beat of the travelling beat, as
   short as 0.15 s, would allow 2.5 cm: hence the legend's slower travelling beat, skill.mjs). */
const R = 2.3,
  CUT = 0.5 / (1 + R),
  BOT = 2 / CUT,
  TOP = BOT / R;
export const dip = d => {
  const x = Math.abs(d);
  return x >= 0.5 ? 0 : x < CUT ? 1 - BOT * x * x : TOP * (0.5 - x) * (0.5 - x);
};
// from one side to the other over d = -0.5 .. 0.5, leaving and arriving level (the head's way across a U)
const across = d => (d <= -0.5 ? 0 : d >= 0.5 ? 1 : (1 + Math.sin(Math.PI * d)) / 2);
// a pulse over d = -0.5 .. 0.5, most at 0
const pulse = d => bump(d + 0.5);
// metres the hips go down for a degree of both knees, about the guard's bend (animator.mjs: BOUNCE.slope)
const SLOPE = 0.0027;

/* What each foot that comes down is to bring, as numbers that are the same every time that landing is asked about (a dirty
   legend's from dice of his own, one throw per landing, so that the same bout goes the same way): off (half beats the
   middle of it is off the landing), size, a side flipped, nothing at all, a shoulder feint. A clean one's are all plain. */
function landing(lg, seed, k) {
  if (lg.beat) return { off: 0, size: k % lg.deep[0] === 0 ? lg.deep[1] / lg.weave[1] : 1, flip: 1, skip: false, feint: false, deep: k % lg.deep[0] === 0 };
  const r = dice(seed * 7919 + k * 104729 + 17),
    off = (r() < 0.5 ? -1 : 1) * lg.loose.off * (0.5 + 0.5 * r());
  return { off, size: lg.loose.size[0] + (lg.loose.size[1] - lg.loose.size[0]) * r(), flip: r() < lg.loose.flip ? -1 : 1, skip: r() < lg.loose.skip, feint: r() < lg.loose.feint, deep: false };
}

/* The walking shapes. s: { lg (his grade's stance.legend), seed, halves, u (the beat: animator.mjs), feet (the foot that came
   down at each half beat, by its count), next (the foot stepping now, to come down at halves + 1), w (how much of it there
   is: 0 standing .. 1 going), side, fwd, back (the shares of the way he is going: sideways, in, out) }. -> how far the
   knees are bent by it, degrees (what a punch thrown now starts out of) */
export function travel(c, s) {
  const { lg, seed, halves: K, u, w } = s;
  const phi = K + u,
    foot = k => (k === K + 1 ? s.next : s.feet[k] || null),
    sideOf = f => (f === 'L' ? 1 : f === 'R' ? -1 : 0),
    L = {};
  for (let k = K - 2; k <= K + 1; k++) L[k] = landing(lg, seed, k);
  /* where the head is to be across once landing k has been and gone: the other end from the last (the first, the end of
     the foot that came down), kept once said (s.sides), so that a foot that steps twice running, setting off, does not
     leave the head where it was; a dirty one's sometimes the same end again, at his own size, or nowhere new at all */
  const sides = s.sides;
  for (let k = K - 2; k <= K + 1; k++) if (sides[k] === undefined && (k <= K || s.next)) sides[k] = sides[k - 1] !== undefined ? -sides[k - 1] : sideOf(foot(k)) || 1;
  delete sides[K - 8];
  const target = k => (L[k].skip || sides[k] === undefined ? null : sides[k] * L[k].flip * L[k].size);
  const T = {};
  for (let k = K - 2; k <= K + 1; k++) {
    const t = target(k);
    T[k] = t === null ? (k > K - 2 ? T[k - 1] : 0) : t;
  }
  let X = T[K - 2],
    Y = 0,
    slip = 0,
    sway = 0,
    feint = 0,
    deep = 0;
  for (let k = K - 1; k <= K + 1; k++) {
    const d = phi - k - L[k].off,
      f = foot(k);
    X += (T[k] - T[k - 1]) * across(d);
    if (!L[k].skip && f) {
      Y += dip(d) * L[k].size;
      if (L[k].deep) deep += dip(d);
      // in: the head slips outside as the lead foot lands; out: the upper body lies back off the rear foot
      if (f === 'L') slip += pulse(d / 1.2) * L[k].size;
      if (f === 'R') sway += pulse(d / 1.2) * L[k].size;
    }
    if (L[k].feint) feint += pulse(d / 0.8);
  }
  const A = lg.weave[0] * w * s.side,
    D = lg.weave[1] * w * s.side;
  // the weave: across from the hips and the waist, and down on the knees (a deep one, a little at the waist too)
  headTo(c, X * A, 0);
  c.waist += 4 * X * w * s.side;
  let knees = (Y * D) / SLOPE;
  c.lean += lg.deepLean * deep * w * s.side;
  // stepping in: outside (to his right) off the lead foot, onto the right knee, and the knees left bent as he goes
  // (as much as he is going in, or has just gone: s.bent)
  if (s.fwd > 0 || s.bent > 0) {
    const k = slip * Math.max(s.fwd * w, s.bent || 0);
    headTo(c, -lg.slip * k, 0);
    c.rkf += 10 * k;
    c.lkf -= 3 * k;
  }
  knees += lg.knee * (s.bent || 0);
  // stepping out: the trunk laid back off the rear foot, onto the rear knee, the chin in, and straight back up
  if (s.back > 0) {
    const k = sway * s.back * w;
    c.lean -= lg.sway * k;
    c.hp += 4 * k;
    c.rkf += 8 * k;
    c.lkf -= 4 * k;
  }
  // a dirty one's lead shoulder, now and then: turned in and dropped at him, the knees giving, and back
  if (feint > 0) {
    const k = feint * w;
    c.waist -= lg.loose.shoulder * k;
    c.side -= 3 * k;
    c.lz += 0.05 * k;
    c.ly -= 0.01 * k;
    knees += 5 * k;
  }
  c.lkf += knees;
  c.rkf += knees;
  return knees;
}

/* A dash's shape, decided as it starts: which way it goes (its own terms, [left, ahead]), how big, when (a dirty legend's
   a touch early or late), and a feint in it. */
export function dashShape(action, lg, seed) {
  let h = 0;
  for (const ch of String(action.id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = dice(seed * 6151 + h),
    dir = action.dir || [0, -1];
  return lg.beat ? { dir, size: 1, late: 0, feint: false, lg } : { dir, size: lg.loose.size[0] + (lg.loose.size[1] - lg.loose.size[0]) * r(), late: (r() - 0.4) * 0.08, feint: r() < lg.loose.feint * 1.5, lg };
}
/* T seconds into it (the dash itself is 0.3 s; the shape runs on past its end into the landing). -> how far the knees are
   bent by it, or false once it is over.
     in     the duck in, small: down 10 cm into the knees and off 6 cm to his right as he goes, the gloves tight, and the knees
            left bent on landing (`end` degrees) a moment, the wind-up of what he throws out of it
     back   the chin buried and a sway back off the rear knee as he goes, and on landing a slip the other way (to his left)
     side   under and out the side he is going: a weave 12 cm deep, the head from behind the way he goes to ahead of it */
export function dash(c, d, T) {
  const t = T - d.late,
    { lg, size } = d,
    L = lg.dash;
  if (T > 0.8) return false;
  const fwd = Math.max(0, d.dir[1]),
    back = Math.max(0, -d.dir[1]),
    side = Math.abs(d.dir[0]),
    s = Math.sign(d.dir[0]) || 1;
  let knees = 0;
  if (fwd > 0) {
    /* down as the rear leg loads, held under the line as it pushes, up onto bent knees by the landing, and those let go of
       after it (a clean legend goes as a foot comes down, his body on its way down already: game footwork, ladder.mjs) */
    const down = t < 0.1 ? smooth(t / 0.1) : t < 0.28 ? 1 : 1 - smooth((t - 0.28) / 0.12),
      end = smooth((t - 0.26) / 0.1) * (1 - smooth((t - 0.5) / 0.25)),
      k = fwd * size;
    knees += (L.in[0] * down + L.in[2] * end) * k;
    c.lean += 9 * down * k;
    headTo(c, -L.in[1] * down * k, 0);
    c.hp += 3 * down * k;
    c.ly += 0.02 * down * k;
    c.ry += 0.02 * down * k;
    c.lz -= 0.05 * down * k;
    c.rz -= 0.03 * down * k;
  }
  if (back > 0) {
    // the sway as he goes, and the slip off the landing
    const sway = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.2) / 0.12),
      slip = bump((t - 0.24) / 0.32),
      k = back * size;
    c.hp += 9 * sway * k;
    c.lean -= L.back[0] * sway * k;
    c.rkf += 14 * sway * k;
    c.lkf -= 6 * sway * k;
    headTo(c, L.back[1] * slip * k, 0);
    c.lkf += 10 * slip * k;
    c.rkf -= 3 * slip * k;
    knees += 4 * slip * k;
  }
  if (side > 0) {
    // one U: from a little behind the way he goes, down under, up ahead of it
    const W = L.side[1],
      u = (t - 0.02) / W - 0.5,
      k = side * size;
    headTo(c, s * L.side[2] * (2 * across(u) - 1) * k - s * 0.01 * k, 0);
    knees += (dip(u) * L.side[0] * k) / SLOPE;
    c.lean += 5 * dip(u) * k;
    c.waist += 6 * s * (2 * across(u) - 1) * k;
  }
  // (a dirty one's lead shoulder feinted as he sets off)
  if (d.feint) {
    const k = pulse((T - 0.12) / 0.24);
    c.waist -= lg.loose.shoulder * k;
    c.side -= 3 * k;
    c.lz += 0.05 * k;
    knees += 4 * k;
  }
  c.lkf += knees;
  c.rkf += knees;
  return knees;
}
