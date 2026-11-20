/* A stance, said the way a coach would say it, turned into joint rotations. Everything the boxer does is described this way
   and solved again every frame, so a planted foot stays planted and a fist goes exactly where it is sent.
   In the boxer's own space (origin on the canvas under him, +Z ahead, +X to his left, metres):
     { hips: [x, y, z],
       spine: { Hips, Spine1, Spine2, Chest, Neck1, Head: [x, y, z] degrees, or a 3x3 rotation },
       feet:  { L | R: { at: [x, y, z] (where the ankle would be with the foot flat: 0.09 high on the canvas), yaw, pitch
                         (the heel raised, degrees); or ankle: [x, y, z] and R: the foot's 3x3 turn, as they are (a foot
                         lying however a fall left it); pole (where the knee points, in his space) and poleW (how much: left
                         out, it points over the foot, as the pelvis turns) } },
       hands: { L | R: { at: [x, y, z] (the wrist), pole: where the elbow points, as the chest sees it (or toward: the same,
                         in his own space), round: { was, most } (where the elbow was round the arm last frame, degrees, and
                         how far it may go round from there this frame) } },
       stretch }
   solve(stance) -> { root, rot: { Joint: 3x3 local }, stretch, at: { Joint: where it is, in his space }, head (the middle
                      of the head), round: { L, R } }
   centre(pose) -> his centre of mass, in his space as he is drawn (stretched about the canvas).

   The body is held inside what it can do (body.mjs), whatever it is asked: a heel that lifts turns the foot on its ball, so
   the ankle rises and the toes stay on the canvas, and nothing of the foot goes under it; a foot follows its shin when the
   ankle would go past its range; the knee points the way the pelvis lets it and never under the canvas; the elbow keeps out
   of the chest's way, off the canvas, and goes round the arm no faster than it can; a glove stays out of his own head and
   trunk and on top of the canvas. Each of these moves a joint round the circle a limb's middle joint can be anywhere on, or
   moves the end of the limb, as little as it takes. */
import * as M from './m3.mjs';
import { NAMES, PARENT, TPOSE } from './skeleton.mjs';
import { RANGE, RADIUS, FOOT, GLOVE, HEAD, SEGMENTS } from './body.mjs';

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

/* What the solver holds him to: the body's ranges, a little inside them (the audit holds him to the ranges themselves), and
   how close a glove may come to his own head and trunk (a glove at the cheek or against the ribs is not in them). */
const KEEP = {
  ankleUp: RANGE.ankleUp - 3,
  ankleDown: RANGE.ankleDown - 3,
  ankleRoll: RANGE.ankleRoll - 3,
  across: RANGE.shoulderAcross - 3,
  behind: RANGE.shoulderBehind - 3,
  reach: 30, // how far behind the chest's plane a hand may be put, from its shoulder: so far there is always an elbow for it
  knee: [RANGE.kneeAzimuth[0] + 6, RANGE.kneeAzimuth[1] - 6],
  hipIn: RANGE.hipIn - 3,
  hipOut: RANGE.hipOut - 3,
  hipBehind: RANGE.hipBehind - 3,
  head: RADIUS.glove + RADIUS.head - 0.08,
  trunk: RADIUS.glove + RADIUS.Chest - 0.07 + 0.01
};

/* The middle joint of a two-bone limb. A target past the limb's length is brought back onto it, but softly: the last few
   centimetres of reach are approached, never hit, so a fully thrown punch does not lock the elbow with a click (a leg's
   last two: a leg is straightened, and a knee that cannot bend the way it is asked to stays straight). */
function twoBone(a, target, l1, l2, pole, least, give) {
  const v = M.sub(target, a),
    d = len(v),
    full = l1 + l2,
    soft = give ?? 0.055,
    knee = full - soft,
    /* (nor is it ever folded right up: a wrist on top of its own shoulder leaves the elbow nowhere in particular to be; a
       leg folds as far as a knee does) */
    want = Math.max(least ?? 0.42 * full, d <= knee ? d : knee + soft * (1 - Math.exp(-(d - knee) / soft)) - 1e-3),
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

export function solve(stance) {
  const spine = stance.spine || {},
    G = {},
    P = {},
    rot = {},
    round = {},
    knees = {};
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

  for (const side of ['L', 'R']) {
    const Side = side === 'L' ? 'Left' : 'Right',
      s = side === 'L' ? 1 : -1;
    // ---- arm: the bones run along their own X, outward, and the elbow folds about their Y
    const hand = stance.hands[side];
    place(Side + 'Arm', M.id());
    const shoulder = P[Side + 'Arm'],
      // the elbow's direction turns with the chest, so it does not swing round when the shoulders do
      pole = hand.toward || M.app(G.Chest, hand.pole || [s * 0.5, -1, -0.2]), // (toward: the same, already in his own space)
      // (the upper arm as the chest sees it, mirrored onto the left: x out, y up, z ahead)
      seen = elbow => {
        const d = M.app(M.tr(G.Chest), norm(M.sub(elbow, shoulder)));
        return [d[0] * s, d[1], d[2]];
      },
      chestWay = elbow => {
        const d = seen(elbow);
        return Math.asin(clamp(-d[0], -1, 1)) * DEG <= KEEP.across && Math.asin(clamp(-d[2], -1, 1)) * DEG <= KEEP.behind;
      },
      rules = [elbow => elbow[1] >= RADIUS.ForeArm, chestWay];
    /* (a hand cannot be put far behind the chest's plane: the shoulder does not go there. A target that is, as a hook
       thrown by a body turned past what it was aimed at would ask, is brought round in front to where it can be reached) */
    let target = hand.at,
      arm;
    {
      const to = M.sub(target, shoulder),
        l = len(to),
        d = M.app(M.tr(G.Chest), M.scale(to, 1 / (l || 1))),
        most = Math.sin(KEEP.reach * RAD);
      if (l > 1e-6 && d[2] < -most) {
        const k = Math.sqrt((1 - most * most) / (d[0] * d[0] + d[1] * d[1] || 1e-9));
        target = M.add(shoulder, M.scale(M.app(G.Chest, [d[0] * k, d[1] * k, -most]), l));
      }
    }
    for (let pass = 0; pass < 5; pass++) {
      const wrist = target;
      if (hand.round && hand.round.was !== null && hand.round.was !== undefined) {
        /* (it goes round the arm only so fast: an arm passing through a pose with no good answer does not flip over, and
           where it cannot keep both, it keeps this before the chest's way, which it comes back to as it can) */
        const r = hand.round,
          rate = elbow => {
            const now = roundOf(shoulder, elbow, wrist, chestUp);
            return now === null || Math.abs(wrap(now - r.was)) <= r.most;
          };
        rules.splice(1, rules.length - 1, rate, chestWay);
      }
      arm = limb(shoulder, target, LEN.upperArm, LEN.foreArm, pole, rules);
      // the glove: out of his own head and trunk, and on top of the canvas
      const glove = M.add(arm.end, M.scale(norm(M.sub(arm.end, arm.mid)), GLOVE.ahead)),
        trunk = M.sub(P.Chest, P.Hips),
        k = clamp(dot(M.sub(glove, P.Hips), trunk) / dot(trunk, trunk), 0, 1),
        spine0 = M.add(P.Hips, M.scale(trunk, k));
      let push = [0, 0, 0];
      for (const [from, most] of [[head, KEEP.head], [spine0, KEEP.trunk]]) {
        const d = M.sub(glove, from),
          l = len(d);
        if (l < most) push = M.add(push, M.scale(norm(d, [s, 0, 0]), most - l));
      }
      if (glove[1] + push[1] < GLOVE.r) push[1] = GLOVE.r + 0.004 - glove[1];
      if (len(push) < 1e-4) break;
      target = M.add(arm.end, push);
    }
    const d1 = norm(M.sub(arm.mid, shoulder)),
      d2 = norm(M.sub(arm.end, arm.mid));
    let fold = cross(d2, d1);
    fold = len(fold) < 1e-4 ? norm(cross(norm(reject(pole, d1)), d1)) : norm(fold);
    fold = M.scale(fold, s);
    const x1 = M.scale(d1, s),
      x2 = M.scale(d2, s);
    aim(Side + 'Arm', fromCols(x1, fold, cross(x1, fold)));
    aim(Side + 'ForeArm', fromCols(x2, fold, cross(x2, fold)));
    place(Side + 'Hand', M.id());
    round[side] = roundOf(shoulder, P[Side + 'ForeArm'], P[Side + 'Hand'], chestUp);

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
      roll = 0,
      F,
      leg;
    for (let pass = 0; pass < 4; pass++) {
      F = foot.R ? M.mul(foot.R, M.mul(M.rx(pitch), M.rz(roll))) : footFrame(yaw, pitch, roll);
      const ankle = foot.R ? lifted(foot.ankle, F) : ankleFor(foot.at, yaw, F, pitch),
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
      leg = limb(hip, ankle, LEN.thigh, LEN.shin, kneeTo, rules, FOLDED, 0.02, near);
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
            const out = limb(hip, to, LEN.thigh, LEN.shin, kneeTo, rules, FOLDED, 0.02, near);
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
    place(Side + 'ToeBase', M.rx(-Math.max(0, foot.R ? 0 : pitch) * 0.8)); // the toes stay on the canvas when the heel lifts
  }
  for (const name of NAMES) if (!rot[name]) place(name, M.id());
  return { root: M.sub(stance.hips, TPOSE.Hips), rot, stretch: stance.stretch || 1, at: P, head, round, knees };
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
