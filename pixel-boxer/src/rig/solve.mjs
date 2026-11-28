/* A stance, said the way a coach would say it, turned into joint rotations. Everything the boxer does is described this way
   and solved again every frame, so a planted foot stays planted and a fist goes exactly where it is sent.
   In the boxer's own space (origin on the canvas under him, +Z ahead, +X to his left, metres):
     { hips: [x, y, z],
       spine: { Hips, Spine1, Spine2, Chest, Neck1, Head: [x, y, z] degrees, or a 3x3 rotation },
       feet:  { L | R: { at: [x, y, z] (where the ankle would be with the foot flat: 0.09 high on the canvas), yaw, pitch
                         (the heel raised, degrees), roll (onto an edge, degrees: + its left side up); or ankle: [x, y, z] and R: the foot's 3x3 turn, as they are (a foot
                         lying however a fall left it); pole (where the knee points, in his space) and poleW (how much: left
                         out, it points over the foot, as the pelvis turns); out (degrees the knee is turned round the leg
                         from there: in, negative, as a hook's pivot turns it; out, positive, as a squat does) } },
       hands: { L | R: { at: [x, y, z] (the wrist), pole: where the elbow points, as the chest sees it (or toward: the same,
                         in his own space), round: { was, most } (where the elbow was round the arm last frame, degrees, and
                         how far it may go round from there this frame), shoulder: { was, most } (the upper arm's way last
                         frame, as solve() gave it in arms, and how many degrees it may swing from there this frame), last:
                         where the wrist was last frame (where a hand the shoulder cannot put where it is sent goes instead,
                         as near that as will do), punch (a punch on its way), chest (how locked to the chest it is, 0..1:
                         moves.mjs lc, rc), room (how far it is put down in the room, 0..1: lg, rg), apart: { was, most }
                         (how far it was put off where it was sent last frame, to keep its glove out of the other arm, as
                         solve() gave it in apart, and how many metres that may change by this frame), soft (metres: its
                         glove is put off his own head and trunk from so far short of touching, by degrees, not only once
                         it is in them; left out, 0), stay (a hand the shoulder cannot put where it is sent by any way
                         round is left where it is sent, not put out toward where a guard holds it) } },
       stretch }
   solve(stance) -> { root, rot: { Joint: 3x3 local }, stretch, at: { Joint: where it is, in his space }, head (the middle
                      of the head), round: { L, R }, arms: { L, R } (each upper arm's way as the chest sees it, mirrored
                      onto the left: what the shoulder's swing limit reads), knees: { L, R } (each knee round its leg, as
                      the flip limit reads it),
                      knee: { L | R: { flex, out } } (each knee as it came out: degrees bent from straight, and degrees turned
                      out from over the foot, in negative),
                      apart: { L, R } (how far each hand was put off where it was sent to keep its glove out of the other
                      arm, what that did to its glove, and how much that changed this frame, as the chest sees it: { at,
                      glove, step }, metres, or null) }
   centre(pose) -> his centre of mass, in his space as he is drawn (stretched about the canvas).
   armEnd(shoulder, target, ease) -> where an arm puts a wrist sent to target (no nearer the shoulder than it folds, no
                      further than it reaches; ease: slowed up to the fold over so many metres).

   The body is held inside what it can do (body.mjs), whatever it is asked: a heel that lifts turns the foot on its ball, so
   the ankle rises and the toes stay on the canvas, and nothing of the foot goes under it; a foot follows its shin when the
   ankle would go past its range; the knee points the way the pelvis lets it and never under the canvas; the elbow is put
   where the shoulder lets the upper arm point and turn (body.mjs: SHOULDER), off the canvas, and goes round the arm and swings
   no faster than it can, and where no elbow will do the hand goes less far; a glove stays out of his own head and
   trunk and on top of the canvas, and out of his other arm (the hand not punching gives way, a little at a time). Each of
   these moves a joint round the circle a limb's middle joint can be anywhere on, or moves the end of the limb, as little as
   it takes. */
import * as M from './m3.mjs';
import { NAMES, PARENT, TPOSE } from './skeleton.mjs';
import { RANGE, RADIUS, FOOT, GLOVE, HEAD, SEGMENTS, shoulderOf, gloveInArm } from './body.mjs';

const RAD = Math.PI / 180,
  DEG = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = (a, fallback) => {
  const l = len(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : fallback || [0, 1, 0];
};
const reject = (v, d) => M.sub(v, M.scale(d, dot(v, d)));
const fromCols = (c0, c1, c2) => [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
const dist = (a, b) => len(M.sub(a, b));
const col = (R, i) => [R[i], R[3 + i], R[6 + i]];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = d => ((((d + 180) % 360) + 360) % 360) - 180;
// v turned by th radians about the unit axis k (Rodrigues)
const turned = (v, k, th) => {
  const c = Math.cos(th),
    sn = Math.sin(th);
  return M.add(M.add(M.scale(v, c), M.scale(cross(k, v), sn)), M.scale(k, dot(k, v) * (1 - c)));
};

/* The most two-bone solves of an arm (limb) one solve() may do, keeping his gloves out of his other arms included: what keeping
   a glove out does past that is let be for the frame. A limb solve is what an arm costs: one whose elbow fits at once is
   quick, one that has to look round the arm for an elbow the shoulder allows (a hand sent out of reach) several times
   slower. On the machine this was measured on, loaded, a solve() that did 51 to 150 of them took 2.3 ms at the fastest
   and 4.3 on average, so 200 is some 3 to 9 ms there, and five to ten times that on a phone: a dropped frame. Before a glove
   was kept out of the other arm, the worst solve() of 32 seeded bouts did 157, and one in about 2,300 did more than 50;
   200 holds keeping-apart's worst to about that, and as rare (with it, 191 at worst, and one in about 1,150 past 50). */
const ARM_LIMBS = 200;
// (the most limb solves trying one push can take: is it in reach, and then, five times over, the arm and a glove kept out of
// his head and trunk, each in reach)
const TRY = 11;
// (the 26 ways round a point, along the axes and between them, for a search all round)
const ROUND = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) ROUND.push([x, y, z].map(v => v / Math.hypot(x, y, z)));
// (the fewest limb solves a second keeping-apart pass is begun with: both arms let be and the hand already put off put there
// again, two pushes of the other, and the other found and put where it is found)
const AFTER = 2 + 1 + 2 * TRY + TRY + 1;

/* What the solver holds him to: the body's ranges, a little inside them (the audit holds him to the ranges themselves), and
   how close a glove may come to his own head and trunk (a glove at the cheek or against the ribs is not in them), and to his
   other arm (the audit lets it in 2 cm). */
const KEEP = {
  ankleUp: RANGE.ankleUp - 3,
  ankleDown: RANGE.ankleDown - 3,
  ankleRoll: RANGE.ankleRoll - 3,
  shoulder: 3, // degrees inside where the shoulder lets the upper arm point and turn (body.mjs: SHOULDER)
  reach: 30, // how far behind the chest's plane a hand may be put, from its shoulder: so far there is always an elbow for it
  knee: [RANGE.kneeAzimuth[0] + 6, RANGE.kneeAzimuth[1] - 6],
  hipIn: RANGE.hipIn - 3,
  hipOut: RANGE.hipOut - 3,
  hipBehind: RANGE.hipBehind - 3,
  head: RADIUS.glove + RADIUS.head - 0.08,
  trunk: RADIUS.glove + RADIUS.Chest - 0.07 + 0.01,
  arm: 0 // how far (metres) a glove may be into his other arm, past touching with its padding squashed (body.mjs: ARM)
};

/* The middle joint of a two-bone limb. A target past the limb's length is brought back onto it, but softly: the last few
   centimetres of reach are approached, never hit, so a fully thrown punch does not lock the elbow with a click (a leg's
   last two: a leg is straightened, and a knee that cannot bend the way it is asked to stays straight). */
// (how near its root a limb's end may be put, of its whole length: an arm; a leg is given its own)
const FOLD = 0.42;
function twoBone(a, target, l1, l2, pole, least, give) {
  const v = M.sub(target, a),
    d = len(v),
    full = l1 + l2,
    soft = give ?? 0.055,
    knee = full - soft,
    /* (nor is it ever folded right up: a wrist on top of its own shoulder leaves the elbow nowhere in particular to be; a
       leg folds as far as a knee does) */
    want = Math.max(least ?? FOLD * full, d <= knee ? d : knee + soft * (1 - Math.exp(-(d - knee) / soft)) - 1e-3),
    dir = norm(v, [0, -1, 0]),
    along = (l1 * l1 - l2 * l2 + want * want) / (2 * want),
    out = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    sideways = norm(reject(pole, dir), norm(reject([0, 0, 1], dir), [1, 0, 0]));
  return { mid: M.add(M.add(a, M.scale(dir, along)), M.scale(sideways, out)), end: M.add(a, M.scale(dir, want)) };
}

/* The same limb with its middle joint turned round the line from root to end, as little as it takes to satisfy each of
   `rules` (predicates on where the middle joint is), the first ones before the later: if no turn satisfies all of them, the
   last is let go of, and so on. */
function limb(a, target, l1, l2, pole, rules, least, give, cost) {
  const base = twoBone(a, target, l1, l2, pole, least, give),
    line = M.sub(base.end, a),
    dir = norm(line),
    centre = M.add(a, M.scale(dir, dot(M.sub(base.mid, a), dir))),
    r = dist(base.mid, centre);
  if (r < 1e-4) return Object.assign(base, { ok: true });
  const u = M.scale(M.sub(base.mid, centre), 1 / r),
    v = cross(dir, u),
    at = th => M.add(centre, M.add(M.scale(u, r * Math.cos(th)), M.scale(v, r * Math.sin(th))));
  for (let n = rules.length; n > 0; n--) {
    const ok = th => rules.slice(0, n).every(rule => rule(at(th)));
    if (ok(0)) return Object.assign(base, { ok: n === rules.length, kept: n });
    for (let k = 1; k <= 36; k++) {
      // (either way round that will do, the one nearer where it was last frame, if that is known: it does not jump sides)
      const ways = [1, -1].filter(sg => ok(sg * k * 5 * RAD));
      if (!ways.length) continue;
      const sg = ways.length > 1 && cost ? (cost(at(k * 5 * RAD)) <= cost(at(-k * 5 * RAD)) ? 1 : -1) : ways[0];
      {
        let hi = sg * k * 5 * RAD;
        let lo = sg * (k - 1) * 5 * RAD;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (ok(mid)) hi = mid;
          else lo = mid;
        }
        return { mid: at(hi), end: base.end, ok: n === rules.length, kept: n };
      }
    }
  }
  return Object.assign(base, { ok: false, kept: 0 });
}

// the foot turned (yaw), its heel raised (pitch) and rolled onto an edge (roll), degrees
const footFrame = (yaw, pitch, roll) => M.mul(M.ry(yaw), M.mul(M.rx(pitch), M.rz(roll)));
// a foot set down so, as the solver will first put it: its ankle and its turn
export const footPose = foot => {
  const F = footFrame(foot.yaw || 0, foot.pitch || 0, 0);
  return { ankle: ankleFor(foot.at, foot.yaw || 0, F, foot.pitch || 0), R: F };
};
// lifted until no part of the sole is under the canvas
function lifted(ankle, F) {
  let low = Infinity;
  for (const [c, r] of FOOT.sole) low = Math.min(low, ankle[1] + M.app(F, c)[1] - r);
  return low < 0 ? [ankle[0], ankle[1] - low, ankle[2]] : ankle;
}
/* Where the ankle is for a foot set down at `at` (where the ankle would be, flat) and turned so: a raised heel turns the
   foot on its ball, raised toes on its heel, and then it is lifted until no part of the sole is under the canvas. */
function ankleFor(at, yaw, F, pitch) {
  const pivot = pitch >= 0 ? FOOT.ball : FOOT.heel,
    spot = M.add(at, M.app(M.ry(yaw), pivot)),
    ankle = M.sub(spot, M.app(F, pivot));
  let low = Infinity;
  for (const [c, r] of FOOT.sole) low = Math.min(low, ankle[1] + M.app(F, c)[1] - r);
  if (low < 0) ankle[1] -= low;
  return ankle;
}

export const LEN = {
  upperArm: dist(TPOSE.LeftForeArm, TPOSE.LeftArm),
  foreArm: dist(TPOSE.LeftHand, TPOSE.LeftForeArm),
  thigh: dist(TPOSE.LeftShin, TPOSE.LeftLeg),
  shin: dist(TPOSE.LeftFoot, TPOSE.LeftShin)
};
// how near the hip the ankle can be, the knee folded as far as it goes (a little short of the body's range)
const FOLDED = Math.sqrt(LEN.thigh ** 2 + LEN.shin ** 2 - 2 * LEN.thigh * LEN.shin * Math.cos((RANGE.kneeFolded + 4) * RAD));
const SPINE = ['Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Head', 'LeftShoulder', 'RightShoulder'];

/* Where an arm puts a wrist sent to `target` from a shoulder at `a`, before any of its rules: no nearer its shoulder than a
   folded arm lets it be (a hand asked for right in front of the shoulder is put out ahead of it), and no further than it
   reaches. For whoever has to know where a hand will be before it is solved (anim/animator.mjs: a taunt's room). ease: come
   up to the fold over that many metres and not stopped dead at it (a hand taken in toward its shoulder at speed is slowed
   to nothing there, not halted in a frame: what a taunt's hands are given). */
// (how near its shoulder an arm puts a wrist: folded right up)
export const FOLDED_ARM = FOLD * (LEN.upperArm + LEN.foreArm);
export const armEnd = (a, target, ease = 0) => {
  const v = M.sub(target, a),
    d = len(v),
    least = FOLDED_ARM;
  return twoBone(a, ease > 0 && d < least + ease ? M.add(a, M.scale(norm(v, [0, -1, 0]), least + ease * Math.exp((d - least - ease) / ease))) : target, LEN.upperArm, LEN.foreArm, [0, -1, 0]).end;
};
/* Where an elbow is round its arm: the angle of its offset from the line from shoulder to wrist, measured from the chest's up
   (as tools/audit.mjs measures it). */
export function roundOf(shoulder, elbow, wrist, chestUp) {
  const line = norm(M.sub(wrist, shoulder)),
    off = reject(M.sub(elbow, shoulder), line);
  if (len(off) < 0.03) return null;
  const ref = norm(reject(chestUp, line)),
    ref2 = cross(line, ref);
  return Math.atan2(dot(off, ref2), dot(off, ref)) * DEG;
}

/* A push (a vector) brought from where it was toward where it is wanted, no further in a frame than `most`: its size changed
   by no more than that, and turned by no more than that measured round the arc its end goes along (so that a push turning
   round, as a glove slides round an arm, does not shrink to nothing on the way). */
function toward(was, want, most) {
  const lw = len(was),
    lt = len(want);
  if (lw < 1e-6) return lt <= most ? want : M.scale(want, most / lt);
  const size = clamp(lt, lw - most, lw + most);
  if (lt < 1e-6 || size < 1e-6) return M.scale(was, Math.max(0, size) / lw);
  const a = M.scale(was, 1 / lw),
    b = M.scale(want, 1 / lt),
    th = Math.acos(clamp(dot(a, b), -1, 1)),
    turn = Math.min(th, most / Math.max(lw, size, 1e-6));
  if (th < 1e-6) return M.scale(b, size);
  // (turned about the axis between them; straight back the other way, about any axis square to it)
  const axis = th > Math.PI - 1e-3 ? norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])) : norm(cross(a, b));
  return M.scale(turned(a, axis, turn), size);
}

export function solve(stance) {
  const spine = stance.spine || {},
    G = {},
    P = {},
    rot = {},
    round = {},
    knees = {},
    knee = {},
    arms = {};
  const place = (name, local) => {
    const parent = PARENT[name];
    rot[name] = local;
    G[name] = parent ? M.mul(G[parent], local) : local;
    P[name] = parent ? M.add(P[parent], M.app(G[parent], M.sub(TPOSE[name], TPOSE[parent]))) : stance.hips;
  };
  const aim = (name, world) => place(name, M.mul(M.tr(G[PARENT[name]]), world));
  for (const name of SPINE) {
    const e = spine[name] || [0, 0, 0];
    place(name, e.length === 9 ? e : M.euler(e));
  }
  const head = M.add(P.Head, M.app(G.Head, HEAD)),
    chestUp = col(G.Chest, 1);

  /* ---- an arm: the bones run along their own X, outward, and the elbow folds about their Y. extra: how far its hand is put
     off where it is sent (to keep a glove out of the other arm, below), or nothing. A hand the shoulder cannot put where it is
     sent goes where it can (within, below): one put off from there is put off from where it went, not from where it was sent
     (from there a push of a centimetre can swing the arm round to the other way it can go, its glove a long way off) */
  const went = { L: null, R: null },
    bareTo = { L: null, R: null }; // (what each arm was solved to, not put off: to put it back there with one solve)
  let armLimbs = 0; // (how many limb solves of an arm this call has done: ARM_LIMBS)
  /* how: nothing, the arm solved in full; 'try', sent off by extra only as it is sent, or not at all (-> false) if the shoulder
     cannot put the hand there, or a glove kept out of his head or trunk would take it where it cannot; or a target an arm was
     solved to before, to solve it to that again at once. -> the target the arm was solved to */
  const armOf = (side, extra, how) => {
    const Side = side === 'L' ? 'Left' : 'Right',
      s = side === 'L' ? 1 : -1;
    const hand = stance.hands[side];
    place(Side + 'Arm', M.id());
    const shoulder = P[Side + 'Arm'],
      // the elbow's direction turns with the chest, so it does not swing round when the shoulders do
      pole = hand.toward || M.app(G.Chest, hand.pole || [s * 0.5, -1, -0.2]), // (toward: the same, already in his own space)
      // (a direction as the chest sees it, mirrored onto the left: x out, y up, z ahead; the upper arm's, for an elbow)
      mirror = v => {
        const d = M.app(M.tr(G.Chest), v);
        return [d[0] * s, d[1], d[2]];
      },
      seen = elbow => mirror(norm(M.sub(elbow, shoulder))),
      // where the shoulder lets the upper arm point, and how far it lets it turn, for an elbow and the wrist it holds
      ball = wrist => elbow => {
        const sh = shoulderOf(seen(elbow), mirror(M.sub(wrist, elbow)), KEEP.shoulder);
        return sh.zone <= 0 && sh.turned <= 0;
      },
      // and how fast it lets it swing: so far from where it was last frame
      swing = elbow => !hand.shoulder || !hand.shoulder.was || Math.acos(clamp(dot(seen(elbow), hand.shoulder.was), -1, 1)) * DEG <= hand.shoulder.most,
      onTop = elbow => elbow[1] >= RADIUS.ForeArm;
    /* (a hand cannot be put far behind the chest's plane: the shoulder does not go there. A target that is, as a hook
       thrown by a body turned past what it was aimed at would ask, is brought round in front to where it can be reached) */
    const again = how && how !== 'try' ? how : null,
      trying = how === 'try';
    let target = again || (extra ? M.add(went[side] || hand.at, extra) : hand.at),
      arm;
    if (!again) {
      const to = M.sub(target, shoulder),
        l = len(to),
        d = M.app(M.tr(G.Chest), M.scale(to, 1 / (l || 1))),
        most = Math.sin(KEEP.reach * RAD);
      if (l > 1e-6 && d[2] < -most) {
        const k = Math.sqrt((1 - most * most) / (d[0] * d[0] + d[1] * d[1] || 1e-9));
        target = M.add(shoulder, M.scale(M.app(G.Chest, [d[0] * k, d[1] * k, -most]), l));
      }
    }
    /* The elbow is kept off the canvas and put where the shoulder lets the upper arm be (body.mjs: SHOULDER), and then (each
       given up before the one ahead of it) goes round the arm only so fast, so that an arm passing through a pose with no
       good answer does not flip over, and swings the upper arm only so fast; of two ways round, the nearer the way it went
       last frame. Where no elbow lets the hand get where it is sent inside the shoulder's range without flipping over round
       the arm, the hand goes less far: its way from the shoulder is brought round toward where a guard's hand is until one
       does (but not a punching hand's). */
    const rulesFor = wrist => {
      const r = hand.round,
        rate = elbow => {
          if (!r || r.was === null || r.was === undefined) return true;
          const now = roundOf(shoulder, elbow, wrist, chestUp);
          return now === null || Math.abs(wrap(now - r.was)) <= r.most;
        };
      // (a punch on its way is thrown, and where it goes is what it hits: its wrist is where the throw puts it, and its
      // elbow is kept off the canvas and where the shoulder lets the upper arm be, and then, if it can be, to the round
      // rate; the upper arm's swing is not limited)
      /* (a hook's elbow, which goes round the arm with the wrist where the throw puts it, was always kept so; a straight
         punch's was kept only off the canvas and to the round rate, and a beginner's cross thrown out of his high cover,
         its elbow up there and its hand drawn down onto his chest in the wind-up, turned the upper arm 79 degrees past
         what it can turn in a seeded match, docs/audit-2026-11-25/4-1.mjs. Where the elbow is round the arm does not move
         the wrist, so the punch goes where it went) */
      return hand.punch ? [onTop, ball(wrist), rate] : [onTop, ball(wrist), rate, swing];
    };
    // (of two ways round that will do, the one nearer where the elbow was round the arm last frame)
    const nearer = wrist => (hand.round && hand.round.was !== null && hand.round.was !== undefined ? elbow => {
      const now = roundOf(shoulder, elbow, wrist, chestUp);
      return now === null ? 0 : Math.abs(wrap(now - hand.round.was));
    } : null);
    // (whether an elbow lets the shoulder put the hand there without going round the arm faster than it can)
    const solveTo = (to, rules) => (armLimbs++, limb(shoulder, to, LEN.upperArm, LEN.foreArm, pole, rules, undefined, undefined, nearer(to)));
    const reachable = to => {
      const a = solveTo(to, rulesFor(to).slice(0, 3));
      return a.kept === undefined ? ball(to)(a.mid) : a.kept >= 3;
    };
    // (not a punching hand: a punch is thrown, and where it goes is what it hits)
    /* (an arm solved with all its rules tells as much: what keeps the first three of them, or a straight arm the shoulder
       lets be, is in reach; so a target is solved once, and that solve used, where it is) */
    const inReach = (a, to) => (a.kept === undefined ? ball(to)(a.mid) : a.kept >= 3);
    // (where the shoulder cannot put it: brought round)
    const around = at => {
      const to = M.sub(at, shoulder),
        l = len(to),
        from = norm(to),
        // (toward where it was last frame first, so that it does not jump; and then toward where a guard's hand is)
        ways = [hand.last ? norm(M.sub(hand.last, shoulder)) : null, M.app(G.Chest, norm([-s * 0.45, -0.2, 0.87]))].filter(Boolean);
      for (const way of ways)
        for (let k = 1; k <= 20; k++) {
          const t = M.add(shoulder, M.scale(norm(M.lerp(from, way, k / 20)), l));
          if (reachable(t)) return t;
        }
      /* (and if none will, out toward where a guard's hand is, at its full length; or, a hand that stays (hand.stay), where
         it is sent: a hand on its way home from a taunt, put out so, was thrown 59 cm in a frame and back) */
      return hand.stay ? at : M.add(shoulder, M.scale(ways[ways.length - 1], l));
    };
    const sent = target;
    // (the arm solved to the target, if it is in reach as it is; else brought round, or, tried only as it is sent, not had)
    let ready = null;
    const reach = to => {
      if (hand.punch) return to;
      const a = solveTo(to, rulesFor(to));
      if (inReach(a, to)) return (ready = a), to;
      return trying ? null : around(to);
    };
    if (!again && (target = reach(target)) === null) return false;
    const reached = len(M.sub(target, sent)) < 1e-9;
    let solved = target;
    for (let pass = 0; pass < 5; pass++) {
      solved = target;
      arm = ready || solveTo(target, rulesFor(target));
      ready = null;
      if (again) break;
      // the glove: out of his own head and trunk, and on top of the canvas
      const glove = M.add(arm.end, M.scale(norm(M.sub(arm.end, arm.mid)), GLOVE.ahead)),
        trunk = M.sub(P.Chest, P.Hips),
        k = clamp(dot(M.sub(glove, P.Hips), trunk) / dot(trunk, trunk), 0, 1),
        spine0 = M.add(P.Hips, M.scale(trunk, k));
      let push = [0, 0, 0];
      /* (a hand sent softly, hand.soft = m, is put off from m short of touching: by (most + m - l)^2 / 4m there, as far as
         ever out of him, and not set against him at once the frame it touches: once, the first time round) */
      const m = hand.soft && pass === 0 ? hand.soft : 0;
      for (const [from, most] of [[head, KEEP.head], [spine0, KEEP.trunk]]) {
        const d = M.sub(glove, from),
          l = len(d);
        if (l < most + m) push = M.add(push, M.scale(norm(d, [s, 0, 0]), m > 0 && l > most - m ? ((most + m - l) * (most + m - l)) / (4 * m) : most - l));
      }
      if (glove[1] + push[1] < GLOVE.r) push[1] = GLOVE.r + 0.004 - glove[1];
      if (len(push) < 1e-4) break;
      if ((target = reach(M.add(arm.end, push))) === null) return false;
    }
    const d1 = norm(M.sub(arm.mid, shoulder)),
      d2 = norm(M.sub(arm.end, arm.mid));
    let fold = cross(d2, d1);
    if (len(fold) < 0.05) {
      /* (an arm all but straight is turned about itself the way its elbow is asked to point, and no further than the shoulder
         lets it: what it bends toward is put back inside the turn its elevation allows) */
      fold = norm(cross(norm(reject(pole, d1)), d1));
      const bends = cross(d1, fold),
        sh = shoulderOf(seen(arm.mid), mirror(bends), KEEP.shoulder);
      // (turning it about itself by phi turns it by s phi as the mirrored chest sees it)
      if (sh.turned > 0) fold = turned(fold, d1, -Math.sign(sh.twist) * s * sh.turned * RAD);
    } else fold = norm(fold);
    fold = M.scale(fold, s);
    const x1 = M.scale(d1, s),
      x2 = M.scale(d2, s);
    aim(Side + 'Arm', fromCols(x1, fold, cross(x1, fold)));
    aim(Side + 'ForeArm', fromCols(x2, fold, cross(x2, fold)));
    place(Side + 'Hand', M.id());
    if (!extra && !again) (went[side] = reached ? null : P[Side + 'Hand']), (bareTo[side] = solved);
    round[side] = roundOf(shoulder, P[Side + 'ForeArm'], P[Side + 'Hand'], chestUp);
    arms[side] = seen(P[Side + 'ForeArm']);
    return solved;
  };
  for (const side of ['L', 'R']) armOf(side, null);

  /* ---- his own gloves out of his other arm (body.mjs: ARM). Both arms where they are sent, a glove in the other arm is
     taken out of it to the nearest place outside, by the hand that is not throwing a punch (a punch is thrown, and goes where
     it goes), or, if neither is, by the one the less locked to the chest (hand.chest, moves.mjs: lc, rc; a hand held to the
     face gives way to one the chest swings), and by the glove's own if they are locked as much as each other. A glove gives
     by being moved out the way out of the arm; an arm gives by its hand being moved the other way, the arm going with it (by
     as much again as the glove is nearer the elbow than the wrist: the forearm turns about the elbow). So an arm gives only
     where its hand moves it: met on the wrist's half of its forearm; met nearer the elbow, at the elbow or on the upper arm,
     its hand would have to go twice as far as the glove is in, or more, and the glove gives instead (unless it is thrown). A
     hand put down on the canvas does not give (hand.room). Where either may give, the one already giving (put off last
     frame, the other not) goes on giving: handed from one to the other mid-way, each would start again from nothing.
     And it is the glove that is held, not only where its hand is sent: each hand is sent off where it is sent by no more
     than hand.apart.most further than last frame, nor turned round by more (hand.apart.was.at), and what that does to its
     glove (from where the glove is without it) may change by no more than hand.apart.most from last frame's
     (hand.apart.was.glove), nor that change by more than as much again from last frame's (hand.apart.was.step: a glove is
     eased out of an arm, and back, not knocked), nor be much more than the hand was sent off by (an arm at the end of its
     reach, sent a few centimetres off, can swing its glove a long way: where no elbow will do, the hand goes where it
     can). Where the way it is sent will not do, the hand goes as far from last frame's toward it as will; if none of that
     will, it lets last frame's go as far as will do; if none of that will either, pushes all round are tried; and if
     nothing will, it does what breaks those limits the least (where his own arm has just been flung somewhere new, by a
     blow or by a hand sent where the shoulder cannot put it, the glove cannot always be kept on its way). A hand let go of
     keeps, for the next frame, how far that moved its glove. A glove does not jump out of an arm, or back. Where the hand
     that gives cannot keep up with a glove coming into the arm, what it has done is kept and the other gives way too, if
     it may, from there. What that leaves of a glove in an arm is the move's to keep out (its hand channels). */
  const gloveOf = Side => M.add(P[Side + 'Hand'], M.scale(norm(M.sub(P[Side + 'Hand'], P[Side + 'ForeArm'])), GLOVE.ahead)),
    bare = { L: gloveOf('Left'), R: gloveOf('Right') }; // (each glove where it is without being put off)
  /* (the whole of it, with what a hand has already been put off by kept, as it is: `fixed`, { L | R: { at, e } }, and that
     hand held where it is put) -> { apart, done: { L | R: { at (how far its hand is put off, in his space), e (what that
     does to its glove), tried (whether it was asked to give) } } } */
  const searched = { L: false, R: false }; // (each hand is searched for all round once a call at most)
  const keepApart = (fixed = {}) => {
    const extra = { L: fixed.L ? fixed.L.at : null, R: fixed.R ? fixed.R.at : null },
      stays = h => !!h.punch || (h.room || 0) > 0.5 || (h === stance.hands.L && !!fixed.L) || (h === stance.hands.R && !!fixed.R);
    for (const side of ['L', 'R']) if (fixed[side]) armOf(side, fixed[side].at, fixed[side].to);
    const asked = { L: false, R: false };
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const [side, other] of [['L', 'R'], ['R', 'L']]) {
        const into = gloveInArm(gloveOf(side === 'L' ? 'Left' : 'Right'), ...['Arm', 'ForeArm', 'Hand'].map(j => P[(other === 'L' ? 'Left' : 'Right') + j])),
          by = into.depth - KEEP.arm,
          mine = stance.hands[side],
          his = stance.hands[other];
        if (by <= 1e-3 || (stays(mine) && stays(his))) continue;
        const giving = h => !!(h.apart && h.apart.was && len(h.apart.was.at) > 1e-6),
          gives = stays(mine) ? other : stays(his) || !(into.part === 'forearm' && into.along >= 0.5) ? side : giving(mine) !== giving(his) ? (giving(mine) ? side : other) : (mine.chest || 0) <= (his.chest || 0) ? side : other,
          push = gives === side ? M.scale(into.out, by) : M.scale(into.out, -by / (into.part === 'forearm' ? Math.max(0.5, into.along) : 1));
        extra[gives] = extra[gives] ? M.add(extra[gives], push) : push;
        asked[gives] = true;
        // (sent off by all asked so far, as it is sent: while this call has the limb solves for it, and for both to be found)
        if (ARM_LIMBS - armLimbs < 3 * TRY + 2) break;
        armOf(gives, extra[gives], 'try');
        moved = true;
      }
      if (!moved || ARM_LIMBS - armLimbs < 3 * TRY + 2) break;
    }
    // (each held to last frame's, as the chest carries it; and that, for next frame)
    const apart = {},
      done = {};
    for (const side of ['L', 'R']) {
      const Side = side === 'L' ? 'Left' : 'Right',
        hand = stance.hands[side];
      if (fixed[side]) {
        done[side] = fixed[side];
        apart[side] = len(fixed[side].at) > 1e-6 || len(fixed[side].e) > 1e-6 ? { at: M.app(M.tr(G.Chest), fixed[side].at), glove: M.app(M.tr(G.Chest), fixed[side].e), step: M.app(M.tr(G.Chest), fixed[side].step) } : null;
        continue;
      }
      const want = extra[side] || [0, 0, 0],
        // (not put off at all last frame is put off by nothing; only a hand with no last frame, the guard drawn on its own, is not held)
        limited = !!hand.apart,
        most = limited ? hand.apart.most : Infinity,
        was = limited && hand.apart.was ? { at: M.app(G.Chest, hand.apart.was.at), glove: M.app(G.Chest, hand.apart.was.glove), step: hand.apart.was.step ? M.app(G.Chest, hand.apart.was.step) : [0, 0, 0] } : { at: [0, 0, 0], glove: [0, 0, 0], step: [0, 0, 0] },
        now = limited ? toward(was.at, want, most) : want,
        // (what sending it so far off does to its glove, and by how much that will not do: more change to the glove since last
        // frame than a hand can make in one, or a change more unlike last frame's than that, or a glove swung much further than
        // its hand was sent)
        // (-> { e, to: what the arm was solved to }, or null where the hand cannot be put so, as it is sent)
        effect = at => {
          const to = len(at) > 1e-6 ? armOf(side, at, 'try') : armOf(side, null, bareTo[side]);
          return to ? { e: M.sub(gloveOf(Side), bare[side]), to } : null;
        },
        over = (at, e) => (limited ? Math.max(0, len(M.sub(e, was.glove)) - most) + Math.max(0, len(M.sub(M.sub(e, was.glove), was.step)) - most) : 0) + Math.max(0, len(e) - 1.5 * len(at) - 0.01);
      if (len(now) < 1e-6 && over(now, [0, 0, 0]) <= 1e-4) {
        if (extra[side]) armOf(side, null, bareTo[side]);
        // (let go of: and, where that moved its glove, by how much, for next frame, so that it is not pushed straight back)
        done[side] = { at: [0, 0, 0], e: [0, 0, 0], to: bareTo[side], step: M.scale(was.glove, -1), tried: asked[side] };
        apart[side] = len(was.glove) > 1e-6 ? { at: [0, 0, 0], glove: [0, 0, 0], step: M.app(M.tr(G.Chest), done[side].step) } : null;
        continue;
      }
      /* (what is left of this call's limb solves for trying: less the one that puts this hand where it is found, and what the
         other hand, still to come, needs to be tried once and put) */
      const spare = () => ARM_LIMBS - armLimbs - 1 - (side === 'L' && !fixed.R ? TRY + 1 : 0);
      let best = null,
        last = null;
      /* (each tried in turn, only as it is sent, and the first that breaks nothing taken; else, all tried, or this call's limb
         solves spent, the one that breaks the least, and of those the nearest where it is sent) */
      const fits = () => !!best && best.over <= 1e-4,
        tryAll = list => {
          for (const a of list) {
            if (fits() || spare() < TRY) return;
            const r = effect(a);
            last = r ? r.to : null;
            if (!r) continue;
            const o = over(a, r.e),
              miss = len(M.sub(a, want));
            if (!best || o < best.over - 1e-4 || (o < best.over + 1e-4 && miss < best.miss)) best = { at: a, e: r.e, to: r.to, over: o, miss };
          }
        };
      tryAll([now]);
      if (!fits()) {
        /* (as far from last frame's toward where it is sent as will do; and if nothing on the way will, as far as will do
           from last frame's toward letting it go; and if nothing will, what does the least that will not) */
        const tries = [];
        for (let k = 0; k < 8; k++) tries.push(M.add(was.at, M.scale(M.sub(now, was.at), k / 8)));
        for (let k = 1; k <= 4; k++) tries.push(M.scale(was.at, 1 - k / 4));
        // (and past where it is sent, along last frame's way, for a glove still on its way out that cannot stop at once)
        for (let k = 1; k <= 4; k++) tries.push(M.add(now, M.scale(M.sub(now, was.at), k / 4)));
        // (those that would do, were the glove to go with its hand from where it was found for where it is sent, first; and of
        // those, the nearest where it is sent)
        const ref0 = best || { at: was.at, e: was.glove };
        tryAll(tries.map(a => ({ a, fits: Math.round(over(a, M.add(ref0.e, M.sub(a, ref0.at))) / 0.005), miss: len(M.sub(a, want)) })).sort((x, y) => x.fits - y.fits || x.miss - y.miss).map(x => x.a));
        /* (and if nothing on those ways will, pushes all round last frame's and round the best found, 1 to 8 cm off: an arm
           at the end of its reach, or with the shoulder turning it as far as it turns, can go one way for a push and another
           way altogether for one a little to the side. Once a call for each hand at most) */
        if (!fits() && !searched[side]) {
          searched[side] = true;
          const ref = best || { at: was.at, e: was.glove },
            from = [was.at, ref.at];
          /* (were the glove to go with its hand from where the best found put it: those that would put it where it may be
             first, and of those the nearest where the hand is sent; so that, an arm going about as its hand does, the first
             tried is mostly the one) */
          const all = [];
          for (const r of [0.01, 0.025, 0.05, 0.08])
            for (const c of from)
              for (const d of ROUND) {
                const a = M.add(c, M.scale(d, r));
                all.push({ a, fits: Math.round(over(a, M.add(ref.e, M.sub(a, ref.at))) / 0.005), miss: len(M.sub(a, want)) });
              }
          tryAll(all.sort((x, y) => x.fits - y.fits || x.miss - y.miss).map(x => x.a));
        }
      }
      // (none of it in reach as it is sent: let go)
      if (!best) best = { at: [0, 0, 0], e: [0, 0, 0], to: bareTo[side] };
      if (last !== best.to) armOf(side, best.at, best.to);
      done[side] = { at: best.at, e: best.e, to: best.to, step: M.sub(best.e, was.glove), tried: asked[side] };
      apart[side] = len(best.at) > 1e-6 || len(best.e) > 1e-6 ? { at: M.app(M.tr(G.Chest), best.at), glove: M.app(M.tr(G.Chest), best.e), step: M.app(M.tr(G.Chest), done[side].step) } : null;
    }
    return { apart, done };
  };
  let { apart, done } = keepApart();
  /* (a glove still in the other arm, the one that gave held to what it can do in a frame: what that hand has done is kept,
     and the other gives way too, if it may) */
  const still = side => gloveInArm(gloveOf(side === 'L' ? 'Left' : 'Right'), ...['Arm', 'ForeArm', 'Hand'].map(j => P[(side === 'L' ? 'Right' : 'Left') + j])).depth > KEEP.arm + 0.002,
    gave = ['L', 'R'].filter(side => done[side] && done[side].tried);
  // (if this call has the limb solves left for it: else what the first pass did stands)
  if (gave.length === 1 && ['L', 'R'].some(still) && ARM_LIMBS - armLimbs >= AFTER) {
    for (const side of ['L', 'R']) armOf(side, null, bareTo[side]);
    ({ apart } = keepApart({ [gave[0]]: done[gave[0]] }));
  }

  for (const side of ['L', 'R']) {
    const Side = side === 'L' ? 'Left' : 'Right',
      s = side === 'L' ? 1 : -1;
    // ---- leg: the bones run down their own -Y, and the knee folds about their X
    const foot = stance.feet[side];
    place(Side + 'Leg', M.id());
    const hip = P[Side + 'Leg'],
      yaw = foot.yaw || 0,
      pz = col(G.Hips, 2),
      py = col(G.Hips, 1),
      px = M.scale(col(G.Hips, 0), s),
      // (the knee points over the foot, as the pelvis carries it: the foot's turn out from the pelvis, in the pelvis's terms)
      rel = (wrap(yaw - Math.atan2(pz[0], pz[2]) * DEG) * RAD),
      own = M.app(G.Hips, [Math.sin(rel), 0.1, Math.cos(rel)]),
      kneeTo = foot.pole ? norm(M.lerp(own, norm(foot.pole), clamp(foot.poleW ?? 1, 0, 1))) : own,
      /* which way the knee points round the leg's own line, from the front of the thigh (ahead of the pelvis when the leg
         hangs under it, up from it when the leg is out in front, down when it is out behind): it is a hinge, and the thigh
         turns in the hip only so far */
      azimuth = (knee, ankle) => {
        const down = norm(M.sub(ankle, hip)),
          off = reject(M.sub(knee, hip), down);
        if (len(off) < 0.04) return 0;
        const ahead = dot(down, pz),
          w = clamp((Math.abs(ahead) - 0.6) / 0.3, 0, 1),
          front = norm(reject(M.lerp(pz, M.scale(py, ahead > 0 ? 1 : -1), w * w * (3 - 2 * w)), down)),
          outward = norm(reject(px, down));
        return Math.atan2(dot(off, outward), dot(off, front)) * DEG;
      };
    // (the thigh as the pelvis sees it, mirrored onto the left: not across the other leg, out, or behind, past their ranges)
    const thighWay = knee => {
      const t = M.app(M.tr(G.Hips), norm(M.sub(knee, hip))),
        x = t[0] * s;
      return x >= -Math.sin(KEEP.hipIn * RAD) && x <= Math.sin(KEEP.hipOut * RAD) && -t[2] <= Math.sin(KEEP.hipBehind * RAD);
    };
    let pitch = foot.pitch || 0,
      roll = foot.roll || 0,
      F,
      leg;
    for (let pass = 0; pass < 4; pass++) {
      F = foot.R ? M.mul(foot.R, M.mul(M.rx(pitch), M.rz(roll))) : footFrame(yaw, pitch, roll);
      const ankle = foot.R ? lifted(foot.ankle, F) : ankleFor(foot.at, yaw, F, pitch),
        // (the knee turned in or out round the line from hip to ankle: out is away from the other leg)
        pole = foot.out ? turned(kneeTo, norm(M.sub(ankle, hip)), -s * foot.out * RAD) : kneeTo,
        /* the knee on the canvas, the thigh within its ranges in the hip, then (each given up before the one ahead of it) no
           flip round the leg in a frame, as the elbow, and the thigh kept short of the ends of its turn */
        within = (a, [lo, hi]) => a >= lo && a <= hi,
        rules = [
          knee => knee[1] >= RADIUS.Shin,
          thighWay,
          knee => within(azimuth(knee, ankle), RANGE.kneeAzimuth),
          knee => {
            const r = foot.round;
            return !r || r.was === null || r.was === undefined || len(reject(M.sub(knee, hip), norm(M.sub(ankle, hip)))) < 0.04 || Math.abs(wrap(azimuth(knee, ankle) - r.was)) <= r.most;
          },
          knee => within(azimuth(knee, ankle), KEEP.knee)
        ],
        HARD = 3;
      const near = foot.round && foot.round.was !== null && foot.round.was !== undefined ? knee => Math.abs(wrap(azimuth(knee, ankle) - foot.round.was)) : null;
      leg = limb(hip, ankle, LEN.thigh, LEN.shin, pole, rules, FOLDED, 0.02, near);
      /* (and where no knee will do, the knee asked to bend the one way it cannot, as a man lying on his face cannot fold his
         knees into the canvas, the leg is let out straighter until one will: the foot does not get where it was sent) */
      // (as little straighter as will do, and if it can be, with the knee not flung round to the other side to get there)
      if (leg.kept < HARD) {
        const d = M.sub(ankle, hip),
          l = len(d),
          most = LEN.thigh + LEN.shin;
        search: for (const need of [rules.length, HARD])
          for (const k of [0.25, 0.5, 0.75, 1]) {
            const to = M.add(hip, M.scale(d, (l + (most - l) * k) / (l || 1)));
            to[1] = Math.max(to[1], ankle[1]); // (along the canvas, not into it)
            const out = limb(hip, to, LEN.thigh, LEN.shin, pole, rules, FOLDED, 0.02, near);
            if (out.kept >= need) {
              leg = out;
              break search;
            }
          }
      }
      // the foot follows its shin past the ankle's range: up onto its ball, down off its toes, over onto an edge
      const shin = M.app(M.tr(F), norm(M.sub(leg.mid, leg.end))),
        up = Math.atan2(shin[2], shin[1]) * DEG,
        edge = Math.asin(clamp(shin[0], -1, 1)) * DEG,
        dp = up > KEEP.ankleUp ? up - KEEP.ankleUp : up < -KEEP.ankleDown ? up + KEEP.ankleDown : 0,
        dr = edge > KEEP.ankleRoll ? edge - KEEP.ankleRoll : edge < -KEEP.ankleRoll ? edge + KEEP.ankleRoll : 0;
      if ((Math.abs(dp) < 0.2 && Math.abs(dr) < 0.2) || pass === 3) break;
      pitch += dp * 1.05;
      roll -= dr * 1.05;
    }
    const t1 = norm(M.sub(leg.mid, hip)),
      t2 = norm(M.sub(leg.end, leg.mid));
    let hinge = cross(t1, t2);
    hinge = len(hinge) < 1e-4 ? norm(cross(norm(reject(kneeTo, t1)), t1)) : norm(hinge);
    const y1 = M.scale(t1, -1),
      y2 = M.scale(t2, -1);
    aim(Side + 'Leg', fromCols(hinge, y1, cross(hinge, y1)));
    aim(Side + 'Shin', fromCols(hinge, y2, cross(hinge, y2)));
    aim(Side + 'Foot', F);
    knees[side] = len(reject(M.sub(leg.mid, hip), norm(M.sub(leg.end, hip)))) < 0.04 ? null : azimuth(leg.mid, leg.end);
    // (how bent the knee came out, and how far round from over the foot: what the audit, the tests and the cards read)
    {
      const a = norm(M.sub(hip, leg.mid)),
        b = norm(M.sub(leg.end, leg.mid)),
        flex = 180 - Math.acos(clamp(dot(a, b), -1, 1)) * DEG;
      knee[side] = { flex, out: knees[side] === null ? 0 : wrap(knees[side] - azimuth(M.add(hip, M.scale(kneeTo, 0.3)), leg.end)) };
    }
    place(Side + 'ToeBase', M.rx(-Math.max(0, foot.R ? 0 : pitch) * 0.8)); // the toes stay on the canvas when the heel lifts
  }
  for (const name of NAMES) if (!rot[name]) place(name, M.id());
  return { root: M.sub(stance.hips, TPOSE.Hips), rot, stretch: stance.stretch || 1, at: P, head, round, knees, knee, arms, apart };
}

// his centre of mass (Dempster's shares, body.mjs), as he is drawn: stretched taller and thinner about the canvas
export function centre(pose) {
  const at = pose.at,
    P = name => (name === 'head' ? pose.head : name.startsWith('glove') ? glove(at, name.slice(5)) : at[name]),
    s = pose.stretch || 1,
    w = 1 / Math.sqrt(s);
  let c = [0, 0, 0],
    mass = 0;
  for (const [from, to, share, along] of SEGMENTS) (c = M.add(c, M.scale(M.lerp(P(from), P(to), along), share))), (mass += share);
  return [(c[0] / mass) * w, (c[1] / mass) * s, (c[2] / mass) * w];
}
const glove = (at, Side) => M.add(at[Side + 'Hand'], M.scale(norm(M.sub(at[Side + 'Hand'], at[Side + 'ForeArm'])), GLOVE.ahead));
