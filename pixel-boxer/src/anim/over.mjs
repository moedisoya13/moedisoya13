/* The cross counter's body (docs/cross-counter-plan.md §3; stage Y): the rear straight thrown over the other man's jab as it
   comes (moves.mjs crossOver), the head going off to his left, inside the jab, in the same movement. The chain is the cross's
   (the hips, the waist and the chest, the arm); this is what is laid on it, by his grade (skill.mjs OVER), on the clock of the
   moment it went (`go` of action.crossing: game/bout.mjs, a great one's and a legend's having waited for the jab's aim):
     the head      off the line by the slip's own far point (moves.mjs SLIP: the bend to his left, the hips across, the knee
                   on that side taking the weight), on the slip's curve (its quickest first) and in his grade's slip's time
                   (OVER go), no quicker; with the slip's sit back (moves.mjs LEFT_BEND, so that it goes across and not into the
                   jab) only until the jab has gone by, and let down to `keep` of it as the turn of the hips and the chest
                   takes the head on across (it does not come back: the straight carries it on); his grade's share of it (OVER
                   head)
     the rear hand not carried with the head (a guard's hand is held to the face: animator.mjs carried), but left where it was
                   as he went and lifted up and out to his right off it, over the arm coming in, before the shoulder sends it
                   (overHand, overLift: RISE), the elbow pointed up and out, then up and in over his arm (overPole: OVER pole,
                   elbow), and the shoulder turned in to the chin (OVER tuck)
     the feet      the lead foot pushed in and across on its ball as the weight comes onto it (OVER step); the rear foot is the
                   cross's (moves.mjs links.drive)
     a dirty man   goes down as he goes, and in once the jab has gone by (OVER in, low; game/bout.mjs crossBy)
     waiting       a great one's or a legend's, for the jab's aim: the rear knee a few degrees further bent, and nothing else
     the way out   OVER exit: back the way he came (the chain's own), lower and to his left, or a half step off to his left
   overOf(level) -> his grade's table; went(action) -> seconds since it went, or null while it waits */
import { OVER } from './skill.mjs';
import { SLIP, LEFT_BEND } from './moves.mjs';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);
const F = 1 / 60;

/* (the head: the slip's far point (his grade's share of it, OVER head), held until `hold` after it went, let down to `keep` of it
   over `down`, as the turn takes it on; the sit back only until `sit` seconds after it went, let go of over 2 frames; forward,
   `hz` metres, only from `ahead` after it went and once the jab has gone by (game/bout.mjs crossBy); and `wait` degrees of the rear knee as he waits: the plan's 4 to 6 took his head 2.0 cm off
   where his stance has it, 3 takes it 1.9 at the most, and the plan holds him to 2) */
export const HEAD = { share: 1, keep: 0.3, hold: 4 * F, down: 2 * F, sit: 3 * F, wait: 3, hz: 0.06, ahead: 3 * F, lead: [0, 0, 0] };
/* (the rear hand: lifted at the least `up` metres and `out` to his right (his grade's, OVER out: the overhand's arc, how wide),
   `ahead` forward, over `time` seconds from when it went, its quickest first, more where his arm needs it (overRaise, CLEAR),
   and let down onto the punch's own way as the shoulder sends it, from `from` of its way round; and left where it was across
   him until `keep` after it went, taken back across with his head over `catch`) */
export const RISE = { up: 0.27, out: 0.1, ahead: 0.08, time: 4 * F, from: 0.5, keep: 4.5 * F, catch: 2 * F };
/* (the rear elbow: pointed `out` (his grade's, OVER pole: out, up, ahead as the chest sees it, out mirrored to his right) as the
   hand goes up, and turned to `up` (up and in) as the shoulder sends it, his grade's share of it (OVER elbow); followed at `rate`
   (1/s; a guard's is 16), and let go of from `straight` [from, over] of the elbow's way straight on, and as the hand comes home) */
export const POLE = { out: [0.3, 0.9, 0], up: [-0.4, 0.8, 0.2], rate: 30, straight: [0.77, 0.1] };
/* (and it goes round the arm, from down at his side to up and out, at most this many degrees a second: an elbow's 1200 (animator.mjs)
   would not get it there by the time the punch lands; 1800 is 30 degrees a frame, the plan's §3.5, the audit's 40 apart) */
export const ROUND = 1800;

/* (the elbow's lift and its pole let go of as the arm goes on past where it lands, a punch that has missed or has put him down:
   straightened, an elbow kept up and in turns the upper arm past its range) */
const straight = chain => 1 - smooth((clamp(chain.q[4], 0, 1) - POLE.straight[0]) / POLE.straight[1]);
export const overOf = level => OVER[level && level.id] || OVER[3];
export const went = action => (action && action.crossing && action.crossing.go !== null && action.chain ? action.chain.t - action.crossing.go : null);
// (seconds since the jab went by him, game/bout.mjs crossBy; null until it has)
const passed = action => (action.crossing.by !== undefined && action.chain ? action.chain.t - action.crossing.by : null);

/* The body, this frame, into c (the punch's own channels are there already). action: the crossOver; form: his grade's form */
export function overBody(c, action, form) {
  const ov = overOf(action.level),
    chain = action.chain,
    g = went(action);
  if (g === null) {
    // (waiting for the jab's aim: the rear knee loaded, and nothing else)
    c.rkf += HEAD.wait * smooth(chain.t / 0.05);
    return;
  }
  const back = chain.phase === 'recover' || chain.phase === 'done' ? smooth(chain.since / 0.2) : 0,
    u = clamp(g / ov.go, 0, 1),
    k = 1 - (1 - u) ** 3,
    held = 1 - (1 - HEAD.keep) * smooth((g - HEAD.hold) / HEAD.down),
    w = (ov.head ?? HEAD.share) * k * held * (1 - back);
  for (const ch of ['side', 'hx', 'lean', 'hw', 'hr', 'lkf', 'rkf', 'lx']) c[ch] += SLIP[ch] * w;
  // (the lead glove kept to his left cheek; a dirty man's, further out to his left, out of the way of the rear elbow as it comes
  // over, in on him as he is: OVER lead, by the slip's going)
  const lead = ov.lead || HEAD.lead;
  c.lx += lead[0] * k * (1 - back);
  c.ly += lead[1] * k * (1 - back);
  c.lz += lead[2] * k * (1 - back);
  // (the turned stance: the bend to his left made up of a little more bend and a sit back, until the jab has gone by)
  const sit = SLIP.side * w * (1 - smooth((g - HEAD.sit) / (2 * F)));
  c.lean += LEFT_BEND.lean * sit;
  c.side += LEFT_BEND.side * sit;
  // (and forward only once the jab has gone by: `ahead` after it went, and not before the bout says the jab is by, game/bout.mjs
  // crossBy; going in before then, his head met the jab on its way, harder than the straight it would have been met in)
  const by = passed(action),
    fwd = by === null ? 0 : Math.min(g - HEAD.ahead, by);
  c.hz += HEAD.hz * smooth(fwd / (3 * F)) * (1 - back);
  // (the lead foot pushed in and across on its ball as the weight comes onto it)
  const st = smooth(g / (3 * F)) * (1 - back);
  c.lfx += ov.step[0] * st;
  c.lfz += ov.step[1] * st;
  // (a dirty man goes down as he goes, and in once the jab has gone by)
  c.hz += ov.in * (by === null ? 0 : smooth(by / 0.1)) * (1 - back);
  c.hy -= ov.low * smooth(g / 0.1) * (1 - back);
  // (the rear elbow lifted out as the hand goes up, and the rear shoulder turned in to the chin as the arm goes)
  const lift = 1 - (1 - clamp(g / RISE.time, 0, 1)) ** 2;
  c.re += ov.elbow * lift * straight(chain) * (1 - back);
  const tuck = smooth(clamp(chain.q[4], 0, 1)) * ov.tuck;
  c.twist += tuck;
  c.hr -= tuck;
  // (the way out: lower and to his left, or a half step off to his left and turned back in)
  if (back > 0 && back < 1) {
    const b = bump(back);
    if (ov.exit === 'low') (c.hy -= 0.03 * b), (c.hx += 0.03 * b), (c.lean += 3 * b);
    else if (ov.exit === 'angle') (c.hx += 0.05 * b), (c.lfx += 0.05 * b), (c.rfx += 0.05 * b), (c.yaw -= 8 * b);
  }
}

/* The rear hand as the punch has it before the shoulder sends it (animator.mjs: free): where his guard held it as he went, not
   carried on with his head (open: the guard's place for it; carried: how far his head has carried a guard's hand, in his own
   terms), and back with it as it comes home. While he waits, the guard's own. */
export function overHand(action, open, carried) {
  const g = went(action),
    chain = action.chain;
  if (g === null) return [open[0] + carried[0], open[1] + carried[1], open[2] + carried[2]];
  if (!chain.carried) chain.carried = carried.slice();
  const back = chain.phase === 'recover' || chain.phase === 'done' ? smooth(chain.since / 0.15) : 0;
  // (left where it was across him, and carried on ahead and down with his head as a guard's hand is: left behind as the body
  // goes in, the rear hand would be wound back, and the straight thrown from there harder than the straight)
  const across = Math.max(back, smooth((g - RISE.keep) / RISE.catch));
  return chain.carried.map((v, i) => open[i] + (i === 0 ? v + (carried[i] - v) * across : carried[i]));
}
// ---- the rear arm read off his (the plan's §3.5): over his lead arm by a margin, wherever it is
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len = a => Math.hypot(a[0], a[1], a[2]),
  unit = (a, or) => {
    const l = len(a);
    return l > 1e-9 ? scale(a, 1 / l) : or;
  };
// (the closest points of two segments, p1-q1 and p2-q2: how far apart, and where along each, 0..1; flat: seen from above)
function closest(p1, q1, p2, q2, flat) {
  const f = flat ? v => [v[0], 0, v[2]] : v => v,
    d1 = f(sub(q1, p1)),
    d2 = f(sub(q2, p2)),
    r = f(sub(p1, p2)),
    a = dot(d1, d1),
    e = dot(d2, d2),
    ff = dot(d2, r),
    c = dot(d1, r),
    b = dot(d1, d2),
    den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * ff - c * e) / den, 0, 1) : 0,
    t = e > 1e-12 ? (b * s + ff) / e : 0;
  if (t < 0) (t = 0), (s = a > 1e-12 ? clamp(-c / a, 0, 1) : 0);
  else if (t > 1) (t = 1), (s = a > 1e-12 ? clamp((b - c) / a, 0, 1) : 0);
  return { d: len(sub(add(r, scale(d1, s)), scale(d2, t))), s, t };
}
/* How far over his lead arm the rear glove is lifted (§8.2, metres, centre to centre): the glove's middle over his forearm's
   axis and over his upper arm's (`glove`: 4 or 6 of the arm and 10 of the glove, less 3 of padding and the 2 §8.2 lets it in;
   the plan's path, 13 and 15, has 2 and 3 more), and the wrist behind it over them by as much as §8.2 keeps the forearm off them
   (`fore`, `foreUp`). What the reading adds is no more than §8.2 asks: the arc's own lift (RISE) is what goes over his arm with
   room on the cards; read with the plan's 13 and 15 (and 2 more for the wrist) the lift came out by a corner on the cards, 4.2
   to 6.7 N·s, the man fought first seeing his head a step late and so throwing a little further. The lift grows no faster
   than `rise` metres a second, and is let down as the shoulder sends the arm from RISE from of its way round to
   `down` (a little before it lands: let down as it lands, the glove's going down on top of its own way took it in 10 to 20%
   harder than the straight). His arm: as it will be at the end of his jab (hisNext: no further than `arm` from his shoulder,
   the elbow `upperShare` of the way along it and `sag` under the line), the glove's middle `GLOVE` past the wrist. `out` and
   `ahead`: of the lift, how much the glove is taken out to his right and forward with it as it goes up (the overhand's arc;
   RISE's, his grade's arc, the least of it), and the way out let back in as the shoulder sends the arm from `across` [from,
   to] of its way round (let back in with the rest as it lands, the wrist went 30 cm across in a step and took the elbow round
   under his upper arm with it) */
export const CLEAR = { glove: [0.1, 0.12], fore: 0.06, foreUp: 0.08, rise: 6, down: 0.99, GLOVE: 0.075, arm: 0.57, upperShare: 0.53, sag: 0.06, out: 0.45, ahead: 0.4, across: [0.45, 0.99] };

/* His lead arm (his left), as this man sees it (view.foe, game/bout.mjs: in his own terms, put through his stretch as the
   target is): { S shoulder, E elbow, W wrist, G glove, A: where his jab is sent, once its aim is set, lag: the steps his points
   are behind (seen last step by the man fought first) }, or null */
export function hisArm(view, wide, tall) {
  const f = view && view.foe;
  if (!f || !f.shoulder || !f.elbow || !f.glove) return null;
  const put = q => [q[0] * wide, q[1] / tall, q[2] * wide],
    S = put(f.shoulder.L),
    E = put(f.elbow.L),
    G = put(f.glove.L),
    d = sub(G, E),
    l = len(d);
  return { S, E, G, W: l > CLEAR.GLOVE ? add(E, scale(d, (l - CLEAR.GLOVE) / l)) : E, A: f.aim ? put(f.aim) : null, lag: f.lag ?? 0 };
}

/* What the rear arm is read off: his lead arm as it will be at the end of his jab, once its aim is set: from his shoulder (put
   on by the steps it is seen behind, at the speed it went from the step before) toward where the jab is sent, as far as it
   reaches (CLEAR arm), the elbow `upperShare` of the way along it and `sag` under the line (as a pro's jab is at its end). Not
   his arm as it is: read as it is (and put on at its speed), a step behind for the man fought first, the lift came out by a
   corner, 4 to 11 N·s on the cards, and the arm coming in a few centimetres a step faster or slower than it had been made the
   lift jump. Kept on the chain: { t, S } -> [the arm], or [] (no aim yet), or null */
export function hisNext(action, his) {
  const chain = action && action.chain;
  if (!his || !chain) return null;
  const was = chain.his;
  chain.his = { t: chain.t, S: his.S };
  if (!his.A) return [];
  const S = was && his.lag && chain.t - was.t > 1e-6 && chain.t - was.t < 0.03 ? add(his.S, scale(sub(his.S, was.S), his.lag)) : his.S,
    v = sub(his.A, S),
    lv = len(v) || 1,
    reach = Math.min(lv, CLEAR.arm),
    W = add(S, scale(v, reach / lv));
  return [{ S, E: add(add(S, scale(v, (reach * CLEAR.upperShare) / lv)), [0, -CLEAR.sag, 0]), W, G: add(W, scale(v, CLEAR.GLOVE / lv)) }];
}

/* What lifts the rear glove over his arm this frame (animator.mjs: added to where the punch puts the wrist), in his own terms:
   the way the glove has still to go, from where the punch has it now (wrist: unlifted; at: the target the wrist is sent to;
   shoulder: his own) to where it lands, seen from above, crosses his forearm and his upper arm somewhere ahead: the glove is
   lifted, the whole of the way still to go, by what it lacks of CLEAR's height over his arm there (less, the further to one
   side of it the way goes), read again each frame, so that wherever his arm is and wherever it is going, the glove goes over
   it. The lift grows to that (no faster than CLEAR rise) while his arm is still ahead of it, and is held once it is not; and
   is let down onto the punch's own way as the shoulder sends it (from RISE from of its way round to CLEAR down: a little past
   where it lands, so that it lands coming down onto his face), but not while his arm is still ahead and the glove needs it.
   Out to his right with it (CLEAR out), the overhand's arc. Kept on the chain: { most } */
export function overRaise(action, his, shoulder, wrist, at, dt) {
  const g = went(action),
    chain = action.chain;
  if (g === null || !his) return null;
  const st = (chain.raise ??= { most: 0 }),
    way = unit(sub(at, shoulder), [0, 0, 1]),
    p0 = add(wrist, scale(way, CLEAR.GLOVE)),
    p1 = add(at, scale(way, CLEAR.GLOVE));
  let lack = 0,
    ahead = false;
  // (the glove's middle, and the wrist behind it: the end of the forearm, over his arm by as much as the forearm is kept off it)
  for (const arm of his)
    for (const [q0, q1, a, b, need] of [[p0, p1, arm.E, arm.W, CLEAR.glove[0]], [p0, p1, arm.S, arm.E, CLEAR.glove[1]], [wrist, at, arm.E, arm.W, CLEAR.fore], [wrist, at, arm.S, arm.E, CLEAR.foreUp]]) {
      const c = closest(q0, q1, a, b, true);
      if (c.d >= need) continue;
      ahead = true;
      const y = a[1] + (b[1] - a[1]) * c.t + Math.sqrt(need * need - c.d * c.d),
        path = q0[1] + (q1[1] - q0[1]) * c.s;
      lack = Math.max(lack, y - path);
    }
  if (ahead) st.most = Math.min(Math.max(st.most, lack), st.most + CLEAR.rise * dt);
  const back = chain.phase === 'recover' || chain.phase === 'done' ? 1 : 0,
    down = 1 - smooth((clamp(chain.q[3], 0, 2) - RISE.from) / (CLEAR.down - RISE.from)),
    L = Math.max(st.most * down, ahead ? Math.min(lack, st.most) : 0) * (1 - back);
  // (and never less than the overhand's own arc, RISE: up and out over the guard as he goes (out: his grade's, OVER out), let
  // down as the shoulder sends it)
  const rise = (1 - (1 - clamp(g / RISE.time, 0, 1)) ** 2) * (1 - back),
    b = rise * down,
    // (out to his right let back in over the whole of the shoulder's way round, not in the two steps it lands in: let back in
    // there, the wrist went 30 cm across in a step and took the elbow round under his upper arm with it)
    across = 1 - smooth((clamp(chain.q[3], 0, 2) - CLEAR.across[0]) / (CLEAR.across[1] - CLEAR.across[0])),
    side = Math.max(CLEAR.out * Math.max(L, st.most * down), (overOf(action.level).out ?? RISE.out) * rise) * across;
  return [-side, Math.max(L, RISE.up * b), Math.max(CLEAR.ahead * L, RISE.ahead * b)];
}

/* Where the rear elbow is asked to point (animator.mjs: toward, in his own terms), how much of it and how quickly it follows: his
   grade's way out as the hand goes up and up and in as the shoulder sends it (OVER pole, POLE up: as the chest sees it, out
   mirrored to his right; R the chest's turn), his grade's share (OVER elbow), let go of as the arm goes on straight and as it
   comes home. (Not read off his arm: every reading tried, the elbow put where the circle it can be on keeps my upper arm and
   forearm clearest of his, now, a step on and at the end of his jab, took the elbow up to 1.50 to 1.57 m and then, the solver
   turning it no faster than 30 degrees a step while the arm swings across, put the upper arm through his forearm or the forearm
   through his, 0.3 to 4 cm, on the cards themselves.) s: -1, his right -> { to, w, rate } or null */
export function overElbow(action, s, R) {
  const g = went(action),
    chain = action.chain;
  if (g === null) return null;
  const back = chain.phase === 'recover' || chain.phase === 'done' ? smooth(chain.since / 0.15) : 0,
    lift = 1 - (1 - clamp(g / RISE.time, 0, 1)) ** 2,
    k = smooth(clamp(chain.q[3], 0, 1)),
    out = overOf(action.level).pole || POLE.out,
    to = [0, 1, 2].map(i => out[i] + (POLE.up[i] - out[i]) * k),
    l = [s * to[0], to[1], to[2]];
  return { to: unit([R[0] * l[0] + R[1] * l[1] + R[2] * l[2], R[3] * l[0] + R[4] * l[1] + R[5] * l[2], R[6] * l[0] + R[7] * l[1] + R[8] * l[2]], [0, 1, 0]), w: overOf(action.level).elbow * lift * straight(chain) * (1 - back), rate: POLE.rate };
}
