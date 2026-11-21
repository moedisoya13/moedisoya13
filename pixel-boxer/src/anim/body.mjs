/* A punch to the body, from the side of the man it lands on (docs/moves-plan-5.md §3.4, §3.5): his body folding round it, and
   his elbow brought down over it before it lands. Layers of numbers on the animator's channels, as anything else he does is
   (anim/animator.mjs calls these, and keeps the state they return). FOLD.after: seconds after the trunk each part goes.
     bodyState()                 what his body is still doing about blows to it
     struck(s, hit, clock)       a blow has landed on his trunk (game/bout.mjs): hit.J (newton-seconds, as felt), hit.zone (the
                                 place: game/trunk.mjs), hit.a (degrees round to his right from the front of his chest), and
                                 his grade's elbow block (hit.low: skill.mjs cover.low; its `after`, a beginner's hands let down)
     give(s, c, clock)           what the blows to his body are doing to him this frame
     coverLow(s, c, seen, cv, cover, dt)   the elbow block: his guard up (cover, 0..1), a punch coming at his body (seen: game/
                                 bout.mjs view.low, { zone, t: seconds since he could have seen where it was going }), and
                                 his grade's way of meeting it (cv: skill.mjs cover)

   Folded round it: the same shape as a blow to the head (the bout's vector and impulse, capped at 110 N·s, and the further a
   part is from where it landed, the later it goes) but the other way up: the trunk first, then the hips, the head and the
   hands (`after`). Amounts are for `ref` newton-seconds and go with the impulse:
     front   (the pit of the stomach and the belly) the chest folded forward `fold` degrees round where it landed (the spine
             curled over it, the pelvis turned only `pelvis` of that: he doubles up, he does not bow), the hips back `back`
             metres, both knees `knees` degrees more; the head comes forward and down with it (about 6 to 9 cm at 85 N·s) and
             nods; both elbows come down round his belly, the gloves `hands` metres lower (his head left open), held a while
     side    (the liver, the ribs) bent `bend` degrees down toward it and folded `forward` degrees, the hips pushed `across`
             metres the other way (the knee on that side, `knee` degrees more, takes them most of half of that back toward it:
             about 3 cm is what shows), and only the elbow on that side down over it
     breath  the chest caved in once (`cave`) and back over 0.4 s, and then for `gasp` seconds a breath `quick` times as fast as
             a man at rest takes, short and hard
   The place's own share is the trunk's (game/trunk.mjs ZONES: the pit of the stomach folds him 1.3 times as far). */
import { ZONES } from '../game/trunk.mjs';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));

export const FOLD = {
  ref: 85, most: 110,
  after: { hips: 0.03, head: 0.045, hands: 0.06 },
  fold: 12.3, pelvis: 0.25, back: 0.04, knees: 8,
  bend: 12, forward: 8, across: 0.07, knee: 12,
  nod: 8, tilt: 6,
  hands: 0.06, inward: 0.03, home: 0.03, side: 0.1,
  cave: 0.012, gasp: 1.5, quick: 1.6
};
/* (how each part comes and goes: so many seconds to get there, held so long, and let go of over so long, the harder the blow
   the longer) */
const SHAPE = { trunk: [0.09, 0.04, 0.22], hips: [0.09, 0.04, 0.22], head: [0.1, 0.1, 0.18], hands: [0.1, 0.19, 0.22], cave: [0.1, 0, 0.18] };
function envelope(t, [up, hold, tau], K) {
  if (t <= 0) return 0;
  if (t < up) return smooth(t / up);
  const x = (t - up - hold) / (tau * (0.7 + 0.3 * K));
  return x <= 0 ? 1 : (1 + x) * Math.exp(-x);
}

export const bodyState = () => ({ hits: [], low: { w: 0, zone: null, id: null, from: null } });
// (seconds an elbow brought down is held there once it has got there)
const HOLD = 0.35;

export function struck(s, hit, clock) {
  const K = Math.min(hit.J, FOLD.most) / FOLD.ref,
    a = hit.a || 0,
    zone = ZONES[hit.zone] || ZONES.body;
  s.hits.push({
    at: clock,
    K,
    // (how much of it is to his side, and which: + his right)
    side: smooth((Math.abs(a) - 20) / 30),
    sign: a >= 0 ? 1 : -1,
    fold: zone.fold,
    after: (hit.low && hit.low.after) || 0
  });
  if (s.hits.length > 6) s.hits.shift();
}

export function give(s, c, clock) {
  s.hits = s.hits.filter(h => clock - h.at < 3);
  for (const h of s.hits) {
    const t = clock - h.at,
      K = h.K,
      front = 1 - h.side,
      e = { trunk: envelope(t, SHAPE.trunk, K), hips: envelope(t - FOLD.after.hips, SHAPE.hips, K), head: envelope(t - FOLD.after.head, SHAPE.head, K), hands: envelope(t - FOLD.after.hands, SHAPE.hands, K), cave: envelope(t, SHAPE.cave, K) };
    // the trunk: curled forward round it (the pelvis turned only so much of that), and bent down toward it at his side
    const fold = K * (FOLD.fold * h.fold * front + FOLD.forward * h.side) * e.trunk,
      lean = fold * ((1 - FOLD.pelvis) / 0.6);
    c.lean += lean;
    c.tip += fold - lean;
    c.side -= FOLD.bend * K * h.side * h.sign * e.trunk;
    // the hips: back from it, or across away from it; the knees taking him
    c.hz -= FOLD.back * K * front * e.hips;
    c.hx += FOLD.across * K * h.side * h.sign * e.hips;
    c.lkf += K * (FOLD.knees * front + FOLD.knee * h.side * (h.sign < 0 ? 1 : 0)) * e.hips;
    c.rkf += K * (FOLD.knees * front + FOLD.knee * h.side * (h.sign > 0 ? 1 : 0)) * e.hips;
    // the head: on forward and down with the chest, the chin onto it, and tilted down toward a blow at his side
    c.hp += FOLD.nod * K * e.head;
    c.hr -= FOLD.tilt * K * h.side * h.sign * e.head;
    // the hands: both elbows down round his belly, or the one on that side down over it
    const both = FOLD.hands * K * front * e.hands,
      one = FOLD.side * K * h.side * e.hands,
      open = h.after * smooth(t / 0.15) * (1 - smooth((t - 0.6) / 0.5));
    c.ly -= both + (h.sign < 0 ? one : 0) + open;
    c.ry -= both + (h.sign > 0 ? one : 0) + open;
    c.lx -= FOLD.inward * K * front * e.hands - 0.04 * open;
    c.rx += FOLD.inward * K * front * e.hands - 0.04 * open;
    c.lz -= FOLD.home * K * e.hands;
    c.rz -= FOLD.home * K * e.hands;
    // the breath knocked out of him, and then gasped back
    c.st -= FOLD.cave * K * e.cave;
    c.lean += 3 * K * e.cave;
    const g = Math.min(1, K) * smooth((t - 0.25) / 0.2) * (1 - smooth((t - FOLD.gasp) / 0.4)),
      b = Math.sin(TAU * FOLD.quick * (t - 0.25));
    if (g > 0) (c.st += 0.009 * g * b), (c.lean += 2 * g * b), (c.hp -= 2.5 * g * b);
  }
}

/* The elbow block. As soon as his grade has seen where it is going (cv.low.delay), the elbow on that side comes down to his
   side over it (both, at the pit of the stomach, or if he cannot tell: an amateur), the glove after it, and the trunk bends
   down over it on the knee on that side; let go of once nothing is coming. The other glove stays at his head. A man holding
   the cross-arm guard (cv.cross on) has his lead forearm in front of his belly already (show.mjs) and brings nothing down,
   whatever his grade; a beginner's elbows never come down. */
export function coverLow(s, c, seen, cv, cover, dt, clock) {
  const low = cv && cv.low,
    L = s.low,
    able = !!(low && low.delay !== null && low.delay !== undefined && !cv.cross);
  /* (what he has seen he answers, his grade's moment later, whether or not it has landed by then: the moment he could first
     see where it was going is kept, and the elbow held down HOLD after he has got there) */
  if (seen && (L.id !== seen.id || L.from === null)) (L.id = seen.id), (L.from = clock - seen.t), (L.zone = seen.zone);
  const since = L.from === null ? -1 : clock - L.from - (able ? low.delay : 0),
    want = able && cover > 0.5 && since >= -1e-9 && since < low.time + HOLD;
  if (L.from !== null && since >= low.time + HOLD + 0.25) L.from = null;
  L.w = want ? Math.min(1, L.w + dt / low.time) : Math.max(0, L.w - dt / 0.25);
  if (L.w <= 0 || !able) return;
  const e = smooth(L.w),
    both = low.both || L.zone === 'solar' || L.zone === 'body',
    rear = both || L.zone === 'liver',
    lead = both || L.zone === 'ribs',
    toward = L.zone === 'liver' ? -1 : L.zone === 'ribs' ? 1 : 0; // (+ his left)
  if (rear) (c.ry -= low.drop * e), (c.rz -= low.in * e), (c.rx -= 0.02 * e), (c.rkf += low.knee * e * (both ? 0.6 : 1));
  if (lead) (c.ly -= low.drop * e), (c.lz -= low.in * e), (c.lx += 0.02 * e), (c.lkf += low.knee * e * (both ? 0.6 : 1));
  // (the pit of the stomach: the two elbows brought in together in front of it)
  if (both) (c.lx -= 0.1 * e), (c.rx += 0.1 * e);
  c.side += toward * low.side * e;
  if (low.turn) c.yaw += (toward ? -toward : 1) * low.turn * e;
}

/* The way down to a punch to the body (docs/moves-plan-5.md §3.3, §3.7), from the side of the man who throws it: the punch's
   written level change (moves.mjs: level, the pro's: degrees more of each knee, of the waist and of a bend to the side) as his
   grade goes down to it (skill.mjs: form.level). It starts to show `show` seconds after the press, is down over `down`
   seconds (the punch's wind-up, if his grade does not say), is held while the punch goes and is out, and he comes up out of it
   over `up` seconds as the hand starts home.
     depth   how far down, times the written
     knee    how much of it is the knees, times the written; what the knees do not do the waist does instead (level.bow: the
             degrees of waist that put the head as far down as the written knees do), so a man who will not bend his knees
             bows to it
     look    degrees the eyes go down to the target (a beginner looks at it; a great one keeps them on the face: negative)
     seam    seconds he waits down there before the punch starts (an amateur's two movements: game/bout.mjs puts it on the
             chain's wait)
     lower(c, action, move, lv)   this frame's share, added to the channels; -> how far down he is meant to be, 0..1
     shown(action, move)          seconds since the way down started to show, or null (before it has, or a punch with
                                  none): what a man covering up reads a punch to his body off (coverLow, game/bout.mjs) */
export const LEVEL3 = { depth: 1, knee: 1, look: 0, show: 0, down: null, seam: 0, up: 0.2 };
const wayDown = lv => Object.assign({}, LEVEL3, lv && lv.form && lv.form.level);
const downOf = (L, action) => L.down ?? Math.max(0.06, (action.chain && action.chain.coilTime) || 0.1);
export function lower(c, action, move, lv) {
  const w = move.level;
  if (!w || !action.chain) return 0;
  const L = wayDown(lv),
    chain = action.chain,
    go = smooth((action.t - L.show) / downOf(L, action)),
    back = chain.phase === 'recover' ? 1 - smooth(chain.since / L.up) : chain.phase === 'done' ? 0 : 1,
    x = go * back * L.depth;
  if (x <= 0) return 0;
  for (const ch in w) if (ch !== 'bow') c[ch] += w[ch] * (ch === 'lkf' || ch === 'rkf' ? L.knee : 1) * x;
  c.lean += (w.bow || 0) * (1 - L.knee) * x;
  c.hp += L.look * x;
  return x;
}
export function shown(action, move) {
  if (!move.level || !action.chain) return null;
  // (a punch that comes up out of the knees shows them as its wind-up starts, after any wait for a foot)
  const at = move.chain.spring ? action.chain.wait || 0 : wayDown(action.level).show,
    t = action.t - at;
  return t >= 0 ? t : null;
}
