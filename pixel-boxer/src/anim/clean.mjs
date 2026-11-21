/* The clean great ones' own techniques (docs/moves-plan-5.md §4): at 4명 and 5명 only, as a show-off's are at 4암 and 5암
   (show.mjs). Layers of numbers on the animator's channels, and rules the bout reads; whether anything lands is the bout's to
   judge by real contact. Grades without them (skill.mjs: their keys are left out) run none of this.

   ---- The wave (파도, §4.1): circling wide at the end of the other man's reach, the hands let down, the trunk upright, and
   the head rising and falling as the feet slide apart and are drawn together again, one slide a wave. A state held as long as it
   is asked for (the control value `{ away: 'wave', side }`), not a move that runs out. A punch coming at him while he is in it, he lies back off
   (the slick back): a body moving, not a judgment, and a punch that still reaches his head lands.
     WAVE                        the bout's numbers: how far from the other man he keeps (near, far), the ropes, the beat
     waveOf(level)               a grade's wave (skill.mjs: wave), or null: that grade cannot, and gets the circle out instead
     wavePlan(wv, seed, k)       wave k of a man's wave: { P (seconds), depth, step (metres round), dir (+1, or -1: a feint
                                 the other way), shoulder (a lead shoulder feinted in it), shuffle }, the same every time asked
     -- the bout's side --
     waveTravel(f, other, dt, coming)   how fast his own wave is taking him over the canvas this step: [x, z] metres a second
     waveTurn(f, other, dt)      how fast the line to the other man is turning as he goes round him (what his facing
                                 follows, so that he is square to him all the way round), radians a second
     waveBlocked(f, other, half, way)   the ropes in the way he is going (or would go)
     -- the animator's side --
     createWave()                his wave as his feet and body keep it
     waveBeat(w, s)              each frame, before the beat: whether the wave has his feet, and at what cycle
     waveLand(w, halves)         a foot has come down: which foot steps now (the lead out, or the trail in), or null
     waveLanding(w, side)        where the stepping foot is to come down, past where his beat would put it: [x, 0, z]
     waveDrag(w, side)           how much of the stepping foot's way is along the canvas (a slide a centimetre up)
     waveBody(c, w, s)           the body: the hands let down, upright, the knees making the wave, the head across, the slick back
   The feet cannot really slide (a planted foot stays where it was put: animator.mjs), so each slide is a step that leaves the
   canvas by a centimetre or less (§8). One slide a wave, each foot stepping once in it, the feet only as far apart and
   together as a man's legs go: that is what sets how fast he can go round (about 30° a second at 1.6 m, where the plan
   asks 60 to 75: tests/clean.test.mjs). */
import { dice, headTo, FLOURISH } from './stance.mjs';
import { GUARD } from './moves.mjs';
import { FOOT } from '../rig/body.mjs';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

/* near, far: metres centre to centre he keeps to (in nearer, he goes out; further, in), and how fast he puts it right; rope:
   metres of canvas he must have ahead of him the way he is going, or the wave is over; half: seconds a half beat of the
   wave's (a wave is so many of them); accel: metres a second a second his going round speeds up and slows down by;
   gather: metres apart across the line he is going along the balls of his feet are as they are drawn together (the most
   they can be, and the least, uncrossed); start: seconds the hands take to go down, end: to come back up; least: waves he
   makes however short the press (two) */
export const WAVE = { near: 1.55, far: 1.85, inward: 3, outward: 0.5, rope: 0.6, half: 0.29, accel: 12, gather: 0.1, start: 0.12, end: 0.2, least: 2 };

// where the balls of his feet are across him in the guard (+ to his left), and so how far apart across the stance is
const ballX = side => {
  const g = GUARD.feet[side],
    y = (g.yaw * Math.PI) / 180;
  return g.at[0] + FOOT.ball[0] * Math.cos(y) + FOOT.ball[2] * Math.sin(y);
};
const STANCE = ballX('L') - ballX('R');

export const waveOf = level => (level && level.wave) || null;

/* Wave k, as the grade makes it. A clean great one's are all the same, on his beat; a legend's are his own dice (thrown from
   his seed and k, so the same bout goes the same way): two to four half beats long and as deep as they come, and every so
   often one the other way first (a feint of direction), a lead shoulder feinted in one, a shuffle in another. How far a wave
   takes him round is how far apart his feet go less how far together: a long one goes no further than his legs reach. */
export function wavePlan(wv, seed, k) {
  const lo = wv.loose;
  if (!lo) return { k, n: wv.halves, P: wv.halves * WAVE.half, depth: wv.depth, step: wv.step, dir: 1, shoulder: false, shuffle: false };
  const r = dice(seed * 7349 + k * 92821 + 3),
    // (the first of each so many waves round comes a few waves in: lo.feint, lo.shuffle are [every, the first])
    feint = k % lo.feint[0] === lo.feint[1],
    n = feint ? lo.halves[0] : lo.halves[0] + Math.floor(r() * (lo.halves[1] - lo.halves[0] + 1)),
    P = n * WAVE.half,
    depth = lo.depth[0] + (lo.depth[1] - lo.depth[0]) * r(),
    shoulder = r() < lo.shoulder[0];
  return { k, n, P, depth, step: clamp((wv.step / (wv.halves * WAVE.half)) * P, lo.step[0], lo.step[1]), dir: feint ? -1 : 1, shoulder: shoulder && !feint, shuffle: !feint && k % lo.shuffle[0] === lo.shuffle[1] };
}

// ---------------------------------------------------------------------------------------------------- the bout's side

// the line from him to the other man on the canvas, its length, and his left of it
const lineOf = (f, other) => {
  const dx = other.x - f.x,
    dz = other.z - f.z,
    d = Math.hypot(dx, dz) || 1;
  return { n: [dx / d, dz / d], left: [dz / d, -dx / d], d };
};

/* How fast his wave takes him over the canvas this step: round the other man at the speed of the wave his feet are in
   (animator.wave: how far it goes round over how long it takes, the other way in a feint), and in or out of the band he keeps
   to; still, once the last wave is over. Followed at WAVE.accel, so that a change of wave or of way is a lean into it, not a
   jerk. f.wave: the bout's record of it ({ side, v: the speed round now, ... }); coming: a punch of the other man's on its way. */
export function waveTravel(f, other, dt, coming) {
  const s = f.wave,
    a = f.animator.wave,
    { n, left, d } = lineOf(f, other),
    plan = a && a.plan,
    // (the ropes in the way, he stops going round at once)
    want = !a || a.ending || s.blocked ? 0 : plan ? (s.side * plan.dir * plan.step) / plan.P : 0,
    most = WAVE.accel * dt;
  s.v += clamp(want - s.v, -most, most);
  /* (in the band, nothing; out of it, back to its edge. Not while a punch is coming at him: he lies back off it instead, his
     feet going on round) */
  const to = clamp(d, WAVE.near + 0.02, WAVE.far - 0.02),
    radial = coming ? 0 : clamp((to - d) * WAVE.inward, -WAVE.outward, WAVE.outward);
  return [left[0] * s.v - n[0] * radial, left[1] * s.v - n[1] * radial];
}

/* How fast the line to the other man turns as he goes round him (his own going, the other man standing): the facing is
   carried round with it, and only what is left is put right by turning to him. */
export function waveTurn(f, other, dt) {
  const rx = other.x - f.x,
    rz = other.z - f.z,
    vx = (f.x - f.px) / dt,
    vz = (f.z - f.pz) / dt;
  return (rz * -vx - rx * -vz) / (rx * rx + rz * rz || 1);
}

/* The ropes in the way: so far ahead of him the way he is going round (or would go: way, +1 to his left), off the canvas he
   can stand on. */
export function waveBlocked(f, other, half, way) {
  if (!way && (!f.wave || Math.abs(f.wave.v) < 0.05)) return false;
  const { left } = lineOf(f, other),
    s = way || Math.sign(f.wave.v),
    x = f.x + left[0] * s * WAVE.rope,
    z = f.z + left[1] * s * WAVE.rope;
  return Math.abs(x) > half || Math.abs(z) > half;
}

// --------------------------------------------------------------------------------------------------- the animator's side

export function createWave() {
  return { on: false, t: 0, start: 0, anchor: null, halves: 0, h: 0, k: -1, phi: 0, plan: null, end: null, done: false, side: 1, w: 0, slick: 0, clear: 0, was: null, level: null, seed: 0 };
}

/* Each frame, before his beat: s = { wave (the bout's: { side, held, blocked } | null), level (the grade's wave), seed,
   halves, u (his beat: animator.mjs), dt }. The wave's half beats are his feet's from the first foot that comes down after it
   started (the anchor): two to a wave, the lead foot out (the feet spread, the head at its lowest as it lands) and the trail
   foot in (gathered, the head at its highest). -> { cycle } while it has his feet, or null (before the anchor, after the
   last wave, and when there is none). */
export function waveBeat(w, s) {
  if (!s.wave || !s.level) {
    if (w.on) Object.assign(w, createWave());
    return null;
  }
  if (!w.on) Object.assign(w, createWave(), { on: true, start: s.halves, level: s.level, seed: s.seed });
  w.t += s.dt;
  w.side = s.wave.side;
  w.held = s.wave.held && !s.wave.blocked;
  w.blocked = !!s.wave.blocked;
  if (w.end !== null) {
    w.end += s.dt;
    if (w.end >= WAVE.end) w.done = true;
    w.plan = null;
    return null;
  }
  if (w.anchor === null) {
    // (the lead in: he is still on whatever beat he had; the first wave is what he is about to go into)
    w.plan = wavePlan(w.level, w.seed, 0);
    w.k = -1;
    w.phi = 0;
    return null;
  }
  const h = s.halves - w.anchor;
  w.k = Math.floor(h / 2);
  w.plan = wavePlan(w.level, w.seed, w.k);
  w.phi = clamp((h - 2 * w.k + s.u) / 2, 0, 1);
  w.h = h;
  return { cycle: w.plan.P };
}

/* A foot has come down (halves: the count now). The first after the wave started is its anchor; at the start of a wave, if
   it is no longer asked for and he has made his waves, the wave is over (and at any foot, if the ropes are in the way): the
   hands come back up over WAVE.end and his feet are his own again. -> the foot to step now: the lead (the one on the side he is going,
   which in a feint is the other one) on the first half of a wave, the trail on the second; or null. */
export function waveLand(w, halves) {
  if (!w.on || w.end !== null) return null;
  if (w.anchor === null) w.anchor = halves;
  const h = halves - w.anchor,
    k = Math.floor(h / 2),
    first = h % 2 === 0;
  if ((first && !w.held && k >= WAVE.least) || w.blocked) {
    w.end = 0;
    return null;
  }
  const plan = wavePlan(w.level, w.seed, k),
    go = w.side * plan.dir; // (+1: to his left, the lead foot's side)
  return (go > 0) === first ? 'L' : 'R';
}

/* Where the stepping foot comes down, on top of where his beat puts it (ahead of its place by how fast the canvas goes by
   under it, for a quarter of a cycle): the lead foot that much further out the way he is going, the trail foot that much
   less far, so that the balls of his feet go from WAVE.gather apart across to that and a wave's way round apart, and back. */
export function waveLanding(w, side) {
  if (!w.on || w.end !== null || w.anchor === null || !w.plan) return null;
  const go = w.side * w.plan.dir,
    lead = (side === 'L') === go > 0,
    b = (WAVE.gather + w.plan.step / 2 - STANCE) / 2;
  return [go * b * (lead ? 1 : -1), 0, 0];
}

// (the lead foot slid out a centimetre off the canvas; the trail foot drawn in after it, all but on it)
export function waveDrag(w, side) {
  if (!w.on || w.end !== null || w.anchor === null || !w.plan) return null;
  const go = w.side * w.plan.dir,
    lead = (side === 'L') === go > 0;
  return lead ? w.level.drag[0] : w.level.drag[1];
}

/* The body, s = { view (the animator's view; its wave.eta: how soon a punch thrown at him will be there), clock, dt }.
   wv (skill.mjs: wave): halves, depth (metres the head goes down at the bottom of a wave, the feet spread), top (metres it
   is above the guard's at the top), knee (degrees both knees are bent through it, besides the drop of the spread feet), bent
   (degrees they are kept bent), across (metres the head goes to either side of the hips, the way he is going first), hands
   ([lead, rear] metres let down; wide: metres out to the side; swing: metres the lead hand swings), upright, chin (degrees), heel
   (degrees the sliding foot's heel is up), slick { eta: seconds before a punch would get to his head that he goes, lean:
   degrees back, back: metres the hips go back, knee: degrees of the rear knee, go, home: seconds to go and come back, just:
   metres clear of a committed punch's way his head goes, and no further },
   shoulder (degrees of a lead shoulder feint). -> how much of the wave there is, 0..1 */
export function waveBody(c, w, s) {
  const wv = w.level;
  if (!w.on || !wv) return 0;
  // (the hands down and the trunk up as it starts, back up as it ends)
  const on = smooth(w.t / WAVE.start) * (w.end === null ? 1 : 1 - smooth(w.end / WAVE.end));
  w.w = on;
  const go = w.side * (w.plan ? w.plan.dir : 1),
    lead = go > 0 ? 'l' : 'r',
    phi = w.anchor === null || w.end !== null ? 0 : w.phi,
    plan = w.plan || wavePlan(wv, w.seed, 0),
    // (0 at the top of a wave, the feet together; 1 at the bottom, spread)
    Y = w.anchor === null || w.end !== null ? 0 : (1 - Math.cos(TAU * phi)) / 2,
    depth = plan.depth / wv.depth;
  // ---- the slick back: a punch thrown at him, that will be there soon (the bout's view.wave.eta: game/bout.mjs)
  const eta = s.view.wave ? s.view.wave.eta : null,
    path = eta !== null && eta !== undefined && eta <= wv.slick.eta;
  if (path) w.clear = wv.slick.home;
  else w.clear = Math.max(0, w.clear - s.dt);
  const want = path || w.clear > wv.slick.home - 0.05 ? 1 : 0;
  // (as far as it takes: once the punch is committed and his head is clear of where it is going by his grade's margin, no further)
  const clear = s.view.wave ? s.view.wave.clear : null,
    enough = clear !== null && clear !== undefined && clear >= wv.slick.just;
  w.slick = want > w.slick ? (enough ? w.slick : Math.min(1, w.slick + s.dt / wv.slick.go)) : Math.max(0, w.slick - s.dt / wv.slick.home);
  const sl = smooth(w.slick) * on,
    still = 1 - sl; // (the wave broken off while he lies back)
  // ---- how he holds himself: upright, the chin up a touch, the knees kept bent, the hands let down below the chest
  c.lean -= wv.upright * on;
  c.hp -= wv.chin * on;
  c.lkf += wv.bent * on;
  c.rkf += wv.bent * on;
  const swing = wv.swing * Math.sin(TAU * 0.9 * s.clock);
  c.ly += wv.hands[0] * on;
  c.ry += wv.hands[1] * on;
  c.lz += (-0.04 + swing) * on;
  c.rz += (0.03 - swing * 0.5) * on;
  c.lx += wv.wide * on;
  c.rx -= wv.wide * on;
  c.le -= 0.2 * on;
  c.re -= 0.2 * on;
  // ---- the wave itself: down on both knees as the feet spread and up as they come together (and at the top a touch above
  // the guard), the head across to the side he is going first and back, the shoulders a little with it
  const knee = (wv.knee * depth * Y - wv.lift) * on * still;
  c.lkf += knee;
  c.rkf += knee;
  const X = Math.sin(TAU * phi) * go * on * still;
  // (across his hips, not with them: the bend at the waist alone, as headTo makes it, less the hips' share)
  headTo(c, wv.across * X * 1.5, 0);
  c.hx -= (wv.across * X * 1.5) / 3;
  c.twist += 4 * X;
  // (the sliding foot's heel up as it goes)
  if (w.anchor !== null && w.end === null && phi < 0.5) c[lead + 'fp'] += wv.heel * Math.sin(Math.PI * phi * 2) * on;
  // (a legend's lead shoulder feinted at him in the middle of a wave, now and then)
  if (plan.shoulder && wv.shoulder) {
    const k = bump((phi - 0.3) / 0.4) * on * still;
    c.twist -= wv.shoulder * k;
    c.side -= 3 * k;
    c.lz += 0.04 * k;
  }
  // (and now and then a legend's feet switched over in the air as they come together, and back: his shuffle, stance.mjs)
  if (plan.shuffle && phi > 0.5) FLOURISH.shuffle.at(c, (phi - 0.5) * 2, 0, on * still);
  // ---- the slick back: the trunk laid back, the hips back over the rear foot, onto the rear knee; the chin in
  c.lean -= wv.slick.lean * sl;
  c.hz -= wv.slick.back * sl;
  c.rkf += wv.slick.knee * sl;
  c.hp += 4 * sl;
  return on;
}

// ---------------------------------------------------------------------------------------------------- the down parry
/* ---- The down parry and counter (다운패링 카운터, §4.2): his guard put up fresh to press the punch down, not to turn it aside.
   A technique of its own (game/techniques.mjs: parryDown, his head's to pick; the parry he puts up otherwise is as it was),
   at 4명 and 5명 only (skill.mjs: pat). The rear glove goes out in front of his chin, above the line the glove comes in on,
   waits there for it, and comes down on it as it comes; the bout judges the glove it comes down on as pressed down (game/
   bout.mjs: only while it is coming down, and only from above), and the man who threw it is held there, the arm down where
   it was met (moves.mjs: patted). The counter goes from the hand that pressed it, from where it is: it does not go back to
   the guard first.
     patOf(level)                a grade's down parry (skill.mjs: pat), or null
     presses(pat, name)          whether it presses down a punch of this name (a jab; a legend's, a cross too)
     -- the animator's side --
     createPat()                 his down parry as his body keeps it
     patDown(c, p, s)            the rear glove out, down on the glove coming in, held, and home (or on into his counter);
                                 -> whether it is coming down now (animator.patting: what the bout judges it by)
     pattedArm(c, action, drop)  the man pressed down: his arm held where it was met and let down, and given back */
export const patOf = level => (level && level.pat) || null;
export const presses = (pat, name) => !!pat && pat.presses.includes(name);

export function createPat() {
  return { id: null, pat: null, t: 0, t0: null, met: null, home: null, w: 0 };
}

/* s = { view (view.pat, the bout's: { id (the guard it is), pat (his grade's), met (seconds since it met the glove, or null),
   fresh (his guard is still young enough to do it: as a parry's), eta (seconds until the glove coming in, if it is one it
   presses down, would be on his rear glove, or null) } | null), hand (the hand of a punch he is throwing, or null), phase (its
   chain's), dt }. The rear glove is put where the pat says, over what the guard has it doing (its channels taken there by
   how far the pat is on), so that it is where it means to be however far up the guard is. */
export function patDown(c, p, s) {
  const v = s.view.pat;
  if (v && v.id !== p.id) Object.assign(p, createPat(), { id: v.id, pat: v.pat });
  const pat = p.pat;
  if (!pat || (p.home !== null && p.t - p.home >= pat.back)) return false;
  p.t += s.dt;
  if (v && v.met !== null && p.met === null) p.met = p.t - v.met;
  // (down as the glove comes: once it will be on it within `go`, his guard still fresh; once a guard)
  if (p.t0 === null && p.home === null && v && v.fresh && v.eta !== null && v.eta <= pat.go) p.t0 = p.t;
  const d = p.t0 === null ? 0 : smooth((p.t - p.t0) / pat.fall),
    // (his counter, thrown from it: the pressing hand's punch, on its way)
    going = s.hand === 'R' && (s.phase === 'coil' || s.phase === 'throw');
  /* home: once it has kept the glove down long enough (or the punch it went on into is out), once it has come down on
     nothing, or his guard has grown old with nothing come down on, or the bout has let go of it (a blow, the guard down) */
  if (p.home === null) {
    const missed = p.met === null && ((p.t0 !== null && p.t - p.t0 >= pat.fall + 0.05) || (p.t0 === null && !(v && v.fresh))),
      kept = p.met !== null && (s.hand === 'R' ? !going : p.t - p.met >= pat.hold);
    if (!v || missed || kept) p.home = p.t;
  }
  const w = smooth(p.t / pat.set) * (p.home === null ? 1 : 1 - smooth((p.t - p.home) / pat.back)),
    T = { rx: pat.at[0], ry: pat.at[1] - pat.down * d, rz: pat.at[2] + pat.out * d, re: pat.elbow };
  p.w = w;
  for (const ch in T) c[ch] += (T[ch] - c[ch]) * w;
  /* (the lead glove back to his temple, out of the way of the glove coming in, while it is not punching: the first thing he
     does, as the guard comes up under it, in half the time the rear glove takes to get out) */
  const lead = (p.home === null ? smooth((p.t * 2) / pat.set) : w) * (s.hand === 'L' ? 0 : 1);
  (c.lx += pat.lead[0] * lead), (c.ly += pat.lead[1] * lead), (c.lz += pat.lead[2] * lead);
  return p.t0 !== null && p.met === null && p.home === null && p.t >= pat.set - 1 / 120 && p.t - p.t0 <= pat.fall + 1 / 60;
}

/* The man pressed down: the glove that was met held where it was met (action.held: the wrist, in his own space, as it was
   drawn then: the animator keeps it) and pressed down `drop` metres in 0.06 s, [down, and back toward him as the arm gives],
   his own carriage of it let go of (its channels are where it is in the room), and given back over the end of the move.
   -> how much of it is held */
export function pattedArm(c, action, drop) {
  if (!action.held) return 0;
  const side = action.hand === 'R' ? 'R' : 'L',
    k = side === 'L' ? 'l' : 'r',
    g = GUARD.hands[side],
    down = smooth(action.t / 0.06),
    w = 1 - smooth((action.t - 0.24) / 0.16),
    T = [action.held[0] - g[0], action.held[1] - drop[0] * down - g[1], action.held[2] - drop[1] * down - g[2]];
  c[k + 'x'] += (T[0] - c[k + 'x']) * w;
  c[k + 'y'] += (T[1] - c[k + 'y']) * w;
  c[k + 'z'] += (T[2] - c[k + 'z']) * w;
  c[k + 'c'] *= 1 - w;
  c[k + 'g'] += (1 - c[k + 'g']) * w;
  return w;
}

// ---------------------------------------------------------------------------------------------------- block and fire
/* ---- Block and fire (블록 & 파이어, §4.3): a clean great one's and a clean legend's counter off the elbow block (game/techniques.mjs
   blockFire, his head's to pick; skill.mjs: fire, 4명 and 5명 only). The hook to his body met by his elbow, the crunch of the
   block (anim/body.mjs coverLow: the elbow down at his side, the trunk bent down over it on that knee) is the wind-up of the
   punch the blocking arm fires (game/bout.mjs: fired, preloaded as far as the grade's `load`): off the rear elbow the
   uppercut, off the lead elbow the lead hook. The fist comes off his side at his belt, waits there the grade's `wait` as the
   elbow brushes past his ribs, and goes up between them; the knee on that side drives straight through it; the other glove
   stays at his temple all the way. A legend's other hand's hook follows (the bout presses it).
     fireOf(level)               a grade's block and fire (skill.mjs: fire), or null
     fireBody(c, action, move)   the punch fired off the block, this frame, on top of its own chain: the fist low at his belt
                                 while it waits, the knee on that side driven straight, the other glove kept at his temple */
export const fireOf = level => (level && level.fire) || null;
export function fireBody(c, action, move) {
  const L = action.loaded,
    F = L && L.fired && L.fired.fire,
    chain = action.chain;
  if (!F || !chain) return 0;
  const k = move.hand === 'L' ? 'l' : 'r',
    o = move.hand === 'L' ? 'r' : 'l',
    s = move.hand === 'L' ? 1 : -1,
    // (on the chain's own clock: seconds since it went, negative while it waits)
    go = (chain.wait || 0) + chain.coilTime + (chain.pause || 0),
    since = chain.t - go,
    low = since < 0 ? smooth(chain.t / Math.max(0.03, go)) : 1 - smooth(since / 0.08),
    drive = since < 0 ? 0 : smooth(since / F.up),
    home = chain.phase === 'recover' ? 1 - smooth(chain.since / 0.2) : chain.phase === 'done' ? 0 : 1,
    keep = smooth(chain.t / 0.05) * home;
  // the fist down at his belt, in at his side, as the elbow comes off it
  c[k + 'y'] -= F.low * low;
  c[k + 'x'] += s * 0.02 * low;
  // the knee on that side driven straight under it
  c[k + 'kf'] += F.knee * drive * home;
  // the other glove at his temple
  c[o + 'x'] += -s * F.other[0] * keep;
  c[o + 'y'] += F.other[1] * keep;
  c[o + 'z'] += F.other[2] * keep;
  return keep;
}

// ---------------------------------------------------------------------------------------------------- the peek-a-boo shell
/* ---- The peek-a-boo shell (피커부 셸, §4.5): a clean great one's and a clean legend's guard put up crouched (game/techniques.mjs
   shell, his head's to pick; skill.mjs: shell, 4명 and 5명 only; game/bout.mjs: f.shell, what it stops and what it opens).
   Down on both knees and over at the waist, the chin tucked, the gloves drawn in to his cheekbones and the elbows in at his
   sides, the forearms up and down in front of his ribs: he goes down into it over `down` seconds (a sine's ease: it starts
   and stops at rest, as a weight let down onto bent knees does) and comes up over `up` once it is over; what he throws out of
   it is thrown from the crouch as he comes up. A legend's head goes down and up in a shallow U while he holds it, and away
   from the hand of a punch thrown at him.
     shellOf(level)              a grade's shell (skill.mjs: shell), or null
     createShell()               his shell as his body keeps it
     shellBody(c, st, s)         s = { view (view.shell, the bout's: { sh, t, from } | null), low (his elbow block's state:
                                 anim/body.mjs bodyState().low), winding (a punch out of it still wound up, not yet
                                 thrown), dt, clock }; -> how far in it */
export const shellOf = level => (level && level.shell) || null;
export const createShell = () => ({ sh: null, x: 0, away: 0 });
export function shellBody(c, st, s) {
  const v = s.view.shell;
  if (v) st.sh = v.sh;
  const sh = st.sh;
  if (!sh) return 0;
  // (and held, not let go of, while what he throws out of it is still being wound up: the crouch is its wind-up)
  st.x = v ? Math.min(1, st.x + s.dt / sh.down) : s.winding ? st.x : Math.max(0, st.x - s.dt / sh.up);
  if (st.x <= 0) return void (st.sh = null), 0;
  const w = (1 - Math.cos(Math.PI * st.x)) / 2;
  // the crouch: both knees, over at the waist, the chin in
  c.lkf += sh.knees[0] * w;
  c.rkf += sh.knees[1] * w;
  c.lean += sh.waist * w;
  c.hp += sh.chin * w;
  // (and squared up to him, the lead shoulder drawn back over his hips)
  c.yaw += sh.square * w;
  // the gloves in to his cheekbones, the elbows in at his sides
  c.lx += sh.lead[0] * w;
  c.ly += sh.lead[1] * w;
  c.lz += sh.lead[2] * w;
  c.rx += sh.rear[0] * w;
  c.ry += sh.rear[1] * w;
  c.rz += sh.rear[2] * w;
  c.le += sh.elbow * w;
  c.re += sh.elbow * w;
  /* (and a punch coming at his body: his elbow brought down over it as his guard's is (anim/body.mjs coverLow, s.low: its
     state), further, down to where his liver and ribs are now he is crouched; the rear one for the liver, the lead for the
     ribs) */
  const lw = s.low && s.low.w > 0 ? smooth(s.low.w) * w : 0;
  if (lw) {
    const z = s.low.zone;
    if (z === 'liver') (c.rx += sh.low[0] * lw), (c.ry += sh.low[1] * lw), (c.rz += sh.low[2] * lw);
    else if (z === 'ribs') (c.lx -= sh.low[0] * lw), (c.ly += sh.low[1] * lw), (c.lz += sh.low[2] * lw);
    /* (at the pit of his stomach the elbows stay out at his sides, `open` metres of the hands' further apart than a guard's
       brings them in together in front of it: the gap he leaves there, the two elbows wide enough apart for a fist to come in
       between them, as the bout reckons them: a ball 6 cm round each, the glove 10.5) */
    else (c.lx += sh.open * lw), (c.rx -= sh.open * lw);
  }
  // (a legend's: the shallow U, on both knees, and the head away from a punch coming at him)
  if (sh.u && v) {
    c.hy -= ((sh.u * (1 - Math.cos((2 * Math.PI * v.t) / sh.period))) / 2) * w;
  }
  if (sh.away) {
    const want = v && v.from ? (v.from === 'L' ? -1 : 1) : 0;
    st.away += clamp(want - st.away, -s.dt / 0.08, s.dt / 0.08);
    if (st.away) headTo(c, sh.away * st.away * w, 0);
  }
  return w;
}
