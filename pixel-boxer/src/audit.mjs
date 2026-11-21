/* A physics audit of everything the boxers do: every scripted bout in the catalogue (footwork and the defence at every grade,
   the blows, the skill ladder) is fought once, and in every frame both bodies are held against what a body can do and what the world allows:
     anatomy    joint ranges (rig/body.mjs: RANGE, and SHOULDER for where the upper arm can point and how far it can turn
                about itself): elbow, shoulder, knee, hip, ankle, spine, neck; limbs changing length; a joint flipping over
                between frames
     contact    anything under the canvas; a man's own glove inside his trunk or head; one man inside the other
     dynamics   the centre of mass: falling faster than gravity, thrown upward, standing where he would topple; how fast the
                joints of a punch turn
   Nothing here fixes anything. tools/audit.mjs prints what it finds; tests/audit.test.mjs holds it to nothing.
     audit(scripts, { only })   -> { found: { check: { frames, bad, worst, by, most, cases } }, seen, falls, turning }
                                    seen: how many frames of a man were checked
                                    cases: every frame that broke the check (up to a few hundred of them), with where it was
     measure(f)                 one man in one frame: where everything is on the canvas, and every angle the checks need
     SCRIPTS                    every scripted bout there is
   What is left out on purpose, because it is the game and not the body: the frames held at the moment of a blow (time is
   stopped), and the three frames drawn after anyone is struck (a blow is meant to jolt; the frames held in between are not
   counted, or a long hold would use the three up). A foot counts as holding him up while
   its ankle is low or its ball is on the canvas (a heel raised off a ball that is down is still a foot on the canvas). */
import * as M from './rig/m3.mjs';
import { fk, TPOSE } from './rig/skeleton.mjs';
import { RANGE as LIMIT, RADIUS, SEGMENTS, HEAD, GLOVE, shoulderOf } from './rig/body.mjs';
import { step } from './game/bout.mjs';
import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, PARRY_DOWN, CROSS_ARM, ROLLING, PULL_COUNTER, BLOCK_FIRE, SHELL } from './defense.mjs';
import { LADDER, DIRTY, STANCES, FOOTWORK, ENTRY, SHOWOFF, TAUNTING, BODY_LADDER, REAR_LADDER, WAVING } from './ladder.mjs';
import { BODYSHOTS, LIVER_BLOCK } from './bodyshots.mjs';
import { MOVES } from './anim/moves.mjs';

const DT = 1 / 60,
  G = 9.81,
  DEG = 180 / Math.PI;
export { LIMIT };
export const SCRIPTS = [...ENTRIES, ...DEFENSE, ...LADDER, ...DIRTY, ...STANCES, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING, ...BODY_LADDER, ...REAR_LADDER, ...BODYSHOTS, ...LIVER_BLOCK, ...WAVING, ...PARRY_DOWN, ...CROSS_ARM, ...ROLLING, ...PULL_COUNTER, ...BLOCK_FIRE, ...SHELL];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len = a => Math.hypot(a[0], a[1], a[2]),
  unit = a => M.scale(a, 1 / (len(a) || 1)),
  dist = (a, b) => len(M.sub(a, b)),
  axis = (R, i) => [R[i], R[3 + i], R[6 + i]], // column i: where that axis of the joint points
  into = (R, v) => M.app(M.tr(R), v), // a direction, as the joint sees it
  angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * DEG,
  reject = (v, d) => M.sub(v, M.scale(d, dot(v, d)));

/* One man in one frame: where everything is on the canvas, and every angle the checks need. */
export function measure(f) {
  const pose = f.pose,
    { R, p } = fk(pose),
    s = pose.stretch || 1,
    w = 1 / Math.sqrt(s),
    world = q => M.add(M.app(f.place.R, [q[0] * w, q[1] * s, q[2] * w]), f.place.p),
    P = { head: M.add(p.Head, M.app(R.Head, HEAD)) },
    out = { at: {}, angles: {}, lengths: {} };
  for (const name in p) P[name] = p[name];
  for (const S of ['Left', 'Right']) P['glove' + S] = M.add(P[S + 'Hand'], M.scale(unit(M.sub(P[S + 'Hand'], P[S + 'ForeArm'])), GLOVE.ahead));
  for (const name in P) out.at[name] = world(P[name]);
  const a = out.angles;

  for (const S of ['Left', 'Right']) {
    const m = S === 'Left' ? 1 : -1, // (mirror the right side onto the left: x is then "out to the side")
      mir = v => [v[0] * m, v[1], v[2]],
      sh = P[S + 'Arm'],
      el = P[S + 'ForeArm'],
      wr = P[S + 'Hand'],
      hip = P[S + 'Leg'],
      kn = P[S + 'Shin'],
      an = P[S + 'Foot'];
    out.lengths[S + 'UpperArm'] = dist(sh, el);
    out.lengths[S + 'ForeArm'] = dist(el, wr);
    out.lengths[S + 'Thigh'] = dist(hip, kn);
    out.lengths[S + 'Shin'] = dist(kn, an);
    // ---- arm
    a[S + 'Elbow'] = angle(M.sub(sh, el), M.sub(wr, el));
    // the upper arm as the chest sees it (x out, y up, z ahead), and the way its forearm bends from it: read against the
    // shoulder's table (body.mjs: SHOULDER)
    const u = mir(into(R.Chest, unit(M.sub(el, sh)))),
      sho = shoulderOf(u, mir(into(R.Chest, axis(R[S + 'Arm'], 2))));
    a[S + 'ShoulderPlane'] = sho.plane;
    a[S + 'ShoulderElev'] = sho.elev;
    a[S + 'ShoulderTwist'] = sho.twist;
    a[S + 'ShoulderZone'] = sho.zone;
    a[S + 'ShoulderTurned'] = sho.turned;
    a[S + 'ArmUp'] = u;
    // which way the elbow points round the line from shoulder to wrist (for seeing it flip between frames)
    const line = unit(M.sub(wr, sh)),
      off = reject(M.sub(el, sh), line),
      ref = unit(reject(axis(R.Chest, 1), line)),
      ref2 = [line[1] * ref[2] - line[2] * ref[1], line[2] * ref[0] - line[0] * ref[2], line[0] * ref[1] - line[1] * ref[0]];
    // (and not where it is undefined: an elbow straight, or the arm along the chest's own up, which is what it is measured from)
    a[S + 'ElbowRound'] = len(off) > 0.03 && Math.abs(dot(line, axis(R.Chest, 1))) < 0.95 ? Math.atan2(dot(off, ref2), dot(off, ref)) * DEG : null;
    // ---- leg
    a[S + 'Knee'] = angle(M.sub(hip, kn), M.sub(an, kn));
    const t = mir(into(R.Hips, unit(M.sub(kn, hip)))); // the thigh as the pelvis sees it
    a[S + 'HipBehind'] = t[2] < 0 ? Math.asin(Math.min(1, -t[2])) * DEG : 0;
    a[S + 'HipOut'] = Math.asin(Math.max(-1, Math.min(1, t[0]))) * DEG; // out to the side (+), across the other leg (-)
    /* The knee is a hinge on the front of the thigh. Round the line from hip to ankle, it must point about where the front of
       the thigh does: ahead of the pelvis when the leg hangs under it, up from the pelvis when the leg is out in front, down
       when it is out behind. */
    const down = unit(M.sub(an, hip)),
      koff = reject(M.sub(kn, hip), down),
      pz = axis(R.Hips, 2),
      py = axis(R.Hips, 1),
      px = M.scale(axis(R.Hips, 0), m),
      ahead = dot(down, pz),
      front = unit(Math.abs(ahead) < 0.8 ? reject(pz, down) : reject(M.scale(py, ahead > 0 ? 1 : -1), down)),
      outward = unit(reject(px, down));
    a[S + 'KneeRound'] = len(koff) > 0.04 ? Math.atan2(dot(koff, outward), dot(koff, front)) * DEG : null;
    // ---- ankle: the shin against the foot (the foot's own up and ahead)
    const shin = unit(M.sub(kn, an)),
      F = R[S + 'Foot'],
      fu = axis(F, 1),
      ff = axis(F, 2),
      fx = axis(F, 0);
    a[S + 'Ankle'] = Math.atan2(dot(shin, ff), dot(shin, fu)) * DEG; // + the shin over the toes (toes up), - pointed
    a[S + 'AnkleRoll'] = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(shin, fx)))) * DEG);
  }
  // ---- spine (the chest as the pelvis sees it) and neck (the head as the chest sees it)
  for (const [name, lo, hi] of [['Spine', 'Hips', 'Chest'], ['Neck', 'Chest', 'Head']]) {
    const up = into(R[lo], axis(R[hi], 1)),
      fwd = into(R[lo], axis(R[hi], 2));
    a[name + 'Forward'] = Math.atan2(up[2], up[1]) * DEG;
    a[name + 'Side'] = Math.atan2(up[0], up[1]) * DEG;
    a[name + 'Twist'] = Math.atan2(fwd[0], fwd[2]) * DEG;
  }
  // (and how the pelvis and the chest are turned on the canvas, about the vertical)
  const yaw = R => {
    const z = M.app(f.place.R, axis(R, 2));
    return Math.atan2(z[0], z[2]) * DEG;
  };
  a.PelvisYaw = yaw(R.Hips);
  a.ChestYaw = yaw(R.Chest);
  // ---- the centre of mass
  let com = [0, 0, 0],
    mass = 0;
  for (const [from, to, share, along] of SEGMENTS) (com = M.add(com, M.scale(M.lerp(out.at[from], out.at[to], along), share))), (mass += share);
  out.com = M.scale(com, 1 / mass);
  // ---- his own gloves inside his trunk or his head
  out.self = [];
  for (const S of ['Left', 'Right']) {
    const g = P['glove' + S],
      trunk = M.sub(P.Chest, P.Hips),
      k = Math.max(0, Math.min(1, dot(M.sub(g, P.Hips), trunk) / dot(trunk, trunk))),
      toTrunk = dist(g, M.add(P.Hips, M.scale(trunk, k)));
    out.self.push([S + ' glove in trunk', RADIUS.glove + RADIUS.Chest - toTrunk - 0.07]); // (a glove held against the chest is not in it)
    out.self.push([S + ' glove in head', RADIUS.glove + RADIUS.head - dist(g, P.head) - 0.08]); // (nor is one at the cheek)
  }
  return out;
}
export const SOLID = [['head', RADIUS.head], ['Chest', RADIUS.Chest], ['Hips', RADIUS.Hips], ...['Left', 'Right'].flatMap(S => [['glove' + S, RADIUS.glove], [S + 'Arm', RADIUS.Arm], [S + 'ForeArm', RADIUS.ForeArm], [S + 'Shin', RADIUS.Shin], [S + 'Foot', RADIUS.Foot], [S + 'ToeBase', RADIUS.ToeBase]])];

// the ground a man's feet cover: is a point over it? -> how far outside, metres (0 inside). under: the other man's joints,
// whose feet can be stood on
export function outsideSupport(at, point, under) {
  const pts = [];
  for (const S of ['Left', 'Right']) {
    // (a foot in the air holds nothing up; one stood on the other man's foot does, as the canvas would)
    const onHis = under && ['Left', 'Right'].some(T => Math.hypot(at[S + 'ToeBase'][0] - under[T + 'Foot'][0], at[S + 'ToeBase'][2] - under[T + 'Foot'][2]) < 0.15 && at[S + 'ToeBase'][1] < under[T + 'Foot'][1] + 0.06);
    if (at[S + 'Foot'][1] > 0.13 && at[S + 'ToeBase'][1] > 0.06 && !onHis) continue;
    const heel = at[S + 'Foot'],
      toe = at[S + 'ToeBase'],
      d = unit([toe[0] - heel[0], 0, toe[2] - heel[2]]),
      n = [-d[2], 0, d[0]];
    for (const [along, across] of [[-0.07, 0.05], [-0.07, -0.05], [0.2, 0.05], [0.2, -0.05]]) pts.push([heel[0] + d[0] * along + n[0] * across, heel[2] + d[2] * along + n[2] * across]);
  }
  if (pts.length < 3) return null;
  // convex hull (gift wrapping), then the distance outside it
  const hull = [];
  let start = pts.reduce((b, q) => (q[0] < b[0] ? q : b)),
    cur = start;
  do {
    hull.push(cur);
    let next = pts[0];
    for (const q of pts) {
      const c = (next[0] - cur[0]) * (q[1] - cur[1]) - (next[1] - cur[1]) * (q[0] - cur[0]);
      if (next === cur || c < 0 || (c === 0 && Math.hypot(q[0] - cur[0], q[1] - cur[1]) > Math.hypot(next[0] - cur[0], next[1] - cur[1]))) next = q;
    }
    cur = next;
  } while (cur !== start && hull.length < 20);
  let inside = true,
    best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length],
      ex = b[0] - a[0],
      ez = b[1] - a[1],
      c = ex * (point[2] - a[1]) - ez * (point[0] - a[0]);
    if (c < 0) inside = false; // (the hull runs anticlockwise: inside is on the left of every edge)
    const k = Math.max(0, Math.min(1, ((point[0] - a[0]) * ex + (point[2] - a[1]) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(point[0] - a[0] - ex * k, point[2] - a[1] - ez * k));
  }
  return inside ? 0 : best;
}

const CASES = 400; // frames kept of each check that is broken, for saying where

/* Fight each script once and hold every frame of both men to the checks. `only`: just frames in these actions. */
export function audit(scripts, o) {
  o = o || {};
  const only = o.only || null,
    found = {}, // check -> { frames, bad, worst, by, most, cases }
    falls = {},
    turning = {}; // punch -> grade -> joint -> fastest it turned, degrees a second
  let seen = 0;
  const note = (check, value, where, bad) => {
    const c = (found[check] = found[check] || { frames: 0, bad: 0, worst: null, by: {}, most: {}, cases: [] });
    c.frames++;
    if (!bad) return;
    c.bad++;
    c.by[where.doing] = (c.by[where.doing] || 0) + 1;
    if (!(Math.abs(c.most[where.doing]) >= Math.abs(value))) c.most[where.doing] = +value.toFixed(1);
    if (!c.worst || Math.abs(value) > Math.abs(c.worst.value)) c.worst = { value, ...where };
    if (c.cases.length < CASES) c.cases.push({ value: +value.toFixed(2), ...where });
  };
  for (const entry of scripts) {
    const bout = freshBout(entry),
      prev = [null, null],
      prev2 = [null, null];
    let struck = [99, 99], // frames drawn since each man was in a blow
      unbalanced = [0, 0];
    for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
      step(bout, drive(entry, bout, tick * DT, DT), DT);
      bout.fighters[1].hp = 1000;
      if (!entry.hurt) bout.fighters[0].hp = 1000;
      for (const e of bout.events) if (['hit', 'block', 'parry'].includes(e.type)) (struck[e.on] = 0), (struck[e.who] = 0);
      const held = bout.stop > 0,
        now = bout.fighters.map(measure);
      bout.fighters.forEach((f, i) => {
        const m = now[i],
          doing = f.action ? f.action.name : f.cover ? 'cover' : 'guard',
          where = { script: entry.id, t: +(tick * DT).toFixed(3), who: i, doing };
        if (only && !only.includes(doing)) return;
        seen++;
        const a = m.angles,
          move = MOVES[doing],
          floor = move && move.floor;
        // ---- anatomy
        for (const S of ['Left', 'Right']) {
          note('elbow past straight', a[S + 'Elbow'], where, a[S + 'Elbow'] > LIMIT.elbowStraight);
          note('elbow folded past its limit', a[S + 'Elbow'], where, a[S + 'Elbow'] < LIMIT.elbowFolded);
          note('upper arm in a place the shoulder cannot put it (degrees past)', a[S + 'ShoulderZone'], where, a[S + 'ShoulderZone'] > 0);
          note('upper arm turned past its range (degrees past)', a[S + 'ShoulderTurned'], where, a[S + 'ShoulderTurned'] > 0);
          note('knee folded past its limit', a[S + 'Knee'], where, a[S + 'Knee'] < LIMIT.kneeFolded);
          if (a[S + 'KneeRound'] !== null && a[S + 'Knee'] < 160) note('knee bent the wrong way round', a[S + 'KneeRound'], where, a[S + 'KneeRound'] < LIMIT.kneeAzimuth[0] || a[S + 'KneeRound'] > LIMIT.kneeAzimuth[1]);
          note('thigh behind the pelvis', a[S + 'HipBehind'], where, a[S + 'HipBehind'] > LIMIT.hipBehind);
          note('thigh out to the side', a[S + 'HipOut'], where, a[S + 'HipOut'] > LIMIT.hipOut);
          note('thigh across the other', a[S + 'HipOut'], where, a[S + 'HipOut'] < -LIMIT.hipIn);
          note('ankle: toes up past its limit', a[S + 'Ankle'], where, a[S + 'Ankle'] > LIMIT.ankleUp);
          note('ankle: pointed past its limit', a[S + 'Ankle'], where, a[S + 'Ankle'] < -LIMIT.ankleDown);
          note('ankle rolled over', a[S + 'AnkleRoll'], where, a[S + 'AnkleRoll'] > LIMIT.ankleRoll);
          for (const [bone, rest] of [['UpperArm', dist(TPOSE.LeftArm, TPOSE.LeftForeArm)], ['ForeArm', dist(TPOSE.LeftForeArm, TPOSE.LeftHand)], ['Thigh', dist(TPOSE.LeftLeg, TPOSE.LeftShin)], ['Shin', dist(TPOSE.LeftShin, TPOSE.LeftFoot)]])
            note('a bone changing length', (m.lengths[S + bone] - rest) * 100, where, Math.abs(m.lengths[S + bone] - rest) > 0.005);
        }
        note('spine bent forward past its limit', a.SpineForward, where, a.SpineForward > LIMIT.spineForward);
        note('spine bent back past its limit', a.SpineForward, where, a.SpineForward < -LIMIT.spineBack);
        note('spine bent sideways past its limit', a.SpineSide, where, Math.abs(a.SpineSide) > LIMIT.spineSide);
        note('spine twisted past its limit', a.SpineTwist, where, Math.abs(a.SpineTwist) > LIMIT.spineTwist);
        note('neck: chin down past its limit', a.NeckForward, where, a.NeckForward > LIMIT.neckDown);
        note('neck: head back past its limit', a.NeckForward, where, a.NeckForward < -LIMIT.neckUp);
        note('neck turned past its limit', a.NeckTwist, where, Math.abs(a.NeckTwist) > LIMIT.neckTurn);
        note('neck tilted past its limit', a.NeckSide, where, Math.abs(a.NeckSide) > LIMIT.neckTilt);
        // ---- contact
        for (const [name, r] of SOLID) note('under the canvas: ' + name.replace(/Left|Right/, ''), (r - m.at[name][1]) * 100, where, m.at[name][1] < r - 0.02);
        for (const [what, depth] of m.self) note('his own ' + what.slice(what.indexOf(' ') + 1), depth * 100, where, depth > 0.02);
        // ---- between frames
        const before = prev[i],
          before2 = prev2[i],
          fresh = struck[i] <= 3;
        if (before && !held && !fresh) {
          for (const S of ['Left', 'Right']) {
            for (const [what, key, bent] of [['elbow flipping round', S + 'ElbowRound', a[S + 'Elbow'] < 150], ['knee flipping round', S + 'KneeRound', a[S + 'Knee'] < 150]]) {
              if (a[key] === null || before.angles[key] === null || !bent) continue;
              let d = a[key] - before.angles[key];
              d = ((d + 540) % 360) - 180;
              note(what + ' (degrees a frame)', d, where, Math.abs(d) > 40);
            }
          }
          if (before2) {
            // the centre of mass: how hard it is being accelerated downward (nothing falls faster than it falls)
            const acc = (m.com[1] - 2 * before.com[1] + before2.com[1]) / (DT * DT);
            note('falling faster than gravity (g)', -acc / G, where, -acc / G > 1.5);
            note('thrown upward (g)', acc / G, where, acc / G > 4);
          }
        }
        if (!floor && !f.down) {
          const out = outsideSupport(m.at, m.com, now[1 - i].at);
          if (out !== null) {
            unbalanced[i] = out > 0.06 ? unbalanced[i] + 1 : 0;
            note('standing where he would topple (cm outside his feet, held over 0.3 s)', out * 100, where, out > 0.06 && unbalanced[i] > 18);
          }
        } else unbalanced[i] = 0;
        // ---- the knockdowns, frame by frame
        if (i === 0 && entry.fall) (falls[entry.id] = falls[entry.id] || []).push({ t: where.t, doing, com: m.com, head: m.at.head, hips: m.at.Hips, angles: a, at: m.at, held, rise: f.action && f.action.rise });
        // ---- how fast the joints of a punch turn, and how far
        if (i === 0 && entry.level && before && !held && f.action && MOVES[f.action.name].punch && f.action.chain.phase === 'throw') {
          const S = MOVES[f.action.name].hand === 'L' ? 'Left' : 'Right',
            turn = (x, y) => ((x - y + 540) % 360) - 180,
            rates = { hips: Math.abs(turn(a.PelvisYaw, before.angles.PelvisYaw)) / DT, chest: Math.abs(turn(a.ChestYaw, before.angles.ChestYaw)) / DT, trunk: Math.abs(a.SpineTwist - before.angles.SpineTwist) / DT, elbow: Math.abs(a[S + 'Elbow'] - before.angles[S + 'Elbow']) / DT, glove: dist(m.at['glove' + S], before.at['glove' + S]) / DT },
            slot = ((turning[entry.punch] = turning[entry.punch] || {})[entry.level] = turning[entry.punch][entry.level] || {});
          for (const k in rates) slot[k] = Math.max(slot[k] || 0, rates[k]);
        }
      });
      // ---- one man inside the other
      for (const [na, ra] of SOLID)
        for (const [nb, rb] of SOLID) {
          const glove = na.startsWith('glove') || nb.startsWith('glove');
          if (glove && (na === 'head' || nb === 'head' || (na.startsWith('glove') && nb.startsWith('glove')))) continue; // (that is a punch landing, or a guard)
          const depth = ra + rb - dist(now[0].at[na], now[1].at[nb]),
            doing = [0, 1].map(i => (bout.fighters[i].action ? bout.fighters[i].action.name : 'guard')).join(' / ');
          if (only && !only.some(o => doing.includes(o))) continue;
          note(glove ? 'a glove inside the other man' : 'the two men inside each other', depth * 100, { script: entry.id, t: +(tick * DT).toFixed(3), who: na + ' in ' + nb, doing }, depth > (glove ? 0.08 : 0.05));
        }
      if (!held) (prev2[0] = prev[0]), (prev2[1] = prev[1]), (prev[0] = now[0]), (prev[1] = now[1]), struck[0]++, struck[1]++;
    }
  }
  return { found, seen, falls, turning };
}
