/* The ropes, which give (the user, 2026-11-25: "로프는 탄성이 있어 로프로 몸을 기울여 기댈 수도 있습니다"). Three a side
   (world/ring.mjs RING: `rope` metres out, at `heights`), each a string tied at the corners. A man's body is the balls of
   BODY round the points of him the bout keeps (game/bout.mjs f.points: his hips, his spine, his head); where one of them
   goes past the near side of a rope, at that rope's height, the rope is pressed out there by as far as it went, and is
   drawn bent out round that place, ROPE.drawn.wide metres either way of it (and never at the corners, where it is tied).
     contacts(points, out)     -> per rope (side * 3 + level: SIDES, RING.heights) { d, u }: how far out it is pressed
                                  (metres, 0 if he does not touch it) and where along it (the coordinate along its side)
     pressOf(points)           -> per side, the deepest any of its ropes is pressed: what the bout pushes him back by
     bend(u, at, d)            how far out a rope is drawn at u along it, pressed d metres at `at`
     createRopes(rows, count)  the baked ropes (assets/ropes.splats.txt), bent where they are pressed:
                                 update(men, dt) -> whether the rows changed (each man's points, or null), the rows moved
   The bout (game/bout.mjs ropes) pushes a man pressing them back in, ROPE.k metres a second for every metre he presses
   them, and turns a knockback carrying him into them round, ROPE.bounce of it; and a man at them with his back to them,
   pressed onto them by a blow, the other man or his own walking, leans back on them (anim/animator.mjs: the lean, sprung,
   ROPE.lean). A drawn rope let go of springs back, past where it lies and back (ROPE.drawn: a spring of hz, damped by
   ratio), never through the man still on it. */
import { RING } from './ring.mjs';

export const ROPE = {
  k: 4,
  bounce: 0.45,
  // (the lean: his centre within `near` of where he must stop, his back toward the ropes; `most` degrees of trunk laid back, the
  // hips `hips` metres forward under it, `side` degrees toward a rope at his side; sprung at hz, damped by ratio)
  lean: { near: 0.2, most: 16, hips: 0, side: 7, hz: 2.2, ratio: 0.45 },
  drawn: { hz: 3.2, ratio: 0.14, most: 0.3, wide: 1.1 }
};
// the balls of him that meet the ropes: the bout's points, each so thick (the trunk's, game/trunk.mjs TRUNK; the head's)
export const BODY = [['hips', 0.13], ['waist', 0.12], ['belly', 0.125], ['chest', 0.13], ['head', 0.12]];
// each side by the axis across it and its sign: the ropes at x = +rope, x = -rope, z = +rope, z = -rope
export const SIDES = [[0, 1], [0, -1], [2, 1], [2, -1]];
const ROPES = SIDES.length * RING.heights.length,
  FACE = RING.rope - RING.thick, // (the near side of a rope)
  END = RING.rope; // (each is tied at the corners, this far along its side either way)

export function contacts(points, out) {
  out = out || Array.from({ length: ROPES }, () => ({ d: 0, u: 0 }));
  for (const c of out) (c.d = 0), (c.u = 0);
  if (!points) return out;
  SIDES.forEach(([a, s], side) => {
    const t = 2 - a;
    RING.heights.forEach((h, level) => {
      const c = out[side * RING.heights.length + level];
      for (const [name, r] of BODY) {
        const p = points[name];
        if (!p) continue;
        const dy = p[1] - h;
        if (Math.abs(dy) >= r) continue;
        const e = s * p[a] + Math.sqrt(r * r - dy * dy) - FACE;
        if (e > c.d) (c.d = e), (c.u = p[t]);
      }
    });
  });
  return out;
}
export function pressOf(points) {
  const c = contacts(points),
    n = RING.heights.length;
  return SIDES.map((_, side) => Math.max(...c.slice(side * n, side * n + n).map(x => x.d)));
}
export function bend(u, at, d) {
  if (!(d > 0) && !(d < 0)) return 0;
  const x = (u - at) / ROPE.drawn.wide;
  if (Math.abs(x) >= 1 || Math.abs(u) >= END) return 0;
  return d * (1 - x * x) ** 2 * Math.min(1, (END - Math.abs(u)) / 0.4);
}

export function createRopes(rows, count) {
  const n = RING.heights.length,
    rest = rows.slice(0, count * 12),
    which = new Int16Array(count).fill(-1);
  // (each splat's rope: the height nearest it, and the side whose line it lies nearer)
  for (let i = 0; i < count; i++) {
    const o = i * 12,
      x = rest[o],
      y = rest[o + 1],
      z = rest[o + 2];
    let level = -1,
      best = 0.08;
    RING.heights.forEach((h, k) => Math.abs(y - h) < best && ((best = Math.abs(y - h)), (level = k)));
    if (level < 0) continue;
    const alongZ = Math.abs(Math.abs(z) - RING.rope) < Math.abs(Math.abs(x) - RING.rope),
      side = alongZ ? (z > 0 ? 2 : 3) : x > 0 ? 0 : 1;
    which[i] = side * n + level;
  }
  const state = Array.from({ length: ROPES }, () => ({ d: 0, v: 0, u: 0 })),
    seen = Array.from({ length: ROPES }, () => ({ d: 0, u: 0 })),
    each = Array.from({ length: ROPES }, () => ({ d: 0, u: 0 }));
  let bent = false;
  return {
    rows,
    state,
    update(men, dt) {
      for (const c of seen) (c.d = 0), (c.u = 0);
      for (const points of men) {
        contacts(points, each);
        each.forEach((c, k) => c.d > seen[k].d && ((seen[k].d = c.d), (seen[k].u = c.u)));
      }
      const { hz, ratio, most } = ROPE.drawn,
        w = 2 * Math.PI * hz,
        steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) * 240)),
        h = Math.min(dt, 0.1) / steps;
      let any = false;
      state.forEach((s, k) => {
        const c = seen[k],
          d0 = Math.min(most, c.d);
        if (c.d > 0) s.u = c.u;
        // (held out by him; or let go of, springing back, no further in than he is out; or, with no time, as he has it now)
        if (!(dt > 0)) (s.d = Math.max(0, d0)), (s.v = 0);
        else if (c.d > 0 && d0 >= s.d) (s.v = h > 0 ? (d0 - s.d) / (h * steps) : 0), (s.d = d0);
        else
          for (let i = 0; i < steps; i++) {
            s.v += (-2 * ratio * w * s.v - w * w * s.d) * h;
            s.d = Math.max(c.d > 0 ? d0 : -most, s.d + s.v * h);
          }
        if (Math.abs(s.d) < 2e-4 && Math.abs(s.v) < 2e-3 && !(c.d > 0)) (s.d = 0), (s.v = 0);
        if (s.d) any = true;
      });
      if (!any && !bent) return false;
      for (let i = 0; i < count; i++) {
        const k = which[i];
        if (k < 0) continue;
        const [a, sg] = SIDES[Math.floor(k / n)],
          o = i * 12,
          s = state[k];
        rows[o + a] = rest[o + a] + sg * bend(rest[o + 2 - a], s.u, s.d);
      }
      bent = any;
      return true;
    }
  };
}
