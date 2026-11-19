/* Short-lived splats drawn over the fight: the smear a blade leaves when it jumps between two drawings, sparks, dust.
   Each is a streak (a stretched gaussian from a to b); every frame the live ones are written into one array for the renderer. */
import * as M from '../rig/m3.mjs';
import { fk } from '../rig/skeleton.mjs';

const CAP = 512;
const len = a => Math.hypot(a[0], a[1], a[2]);

// where the blade is in the world: from the guard to the point
export function bladeOf(pose, place) {
  const f = fk(pose),
    dir = M.col(f.R.Sword, 2),
    at = d => M.add(M.app(place.R, M.add(f.p.Sword, M.scale(dir, d))), place.p);
  return { base: at(0.12), tip: at(1.08) };
}
// the direction from a to b, turned a share t of the way (the short way round)
function swing(a, b, t) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])),
    th = Math.acos(d);
  if (th < 1e-3) return a;
  const s = Math.sin(th),
    ka = Math.sin((1 - t) * th) / s,
    kb = Math.sin(t * th) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

export function createFx(random) {
  const items = [],
    rows = new Float32Array(CAP * 12),
    rnd = random || Math.random;
  const add = item => {
    if (items.length < CAP) items.push(Object.assign({ age: 0, v: [0, 0, 0], g: 0, drag: 0, width: 0.03 }, item));
  };
  return {
    rows,
    count: 0,
    /* The blade was at `from` last frame and is at `to` now, far apart: fill the sweep between with blades. Each cools
       through `colours` as it ages, and the ones nearest where the swing began go first, so the sweep is eaten from its
       tail toward the blade. What the eye reads as the swing itself. */
    smear(from, to, colours) {
      const l = len(M.sub(from.tip, from.base)),
        d0 = M.scale(M.sub(from.tip, from.base), 1 / l),
        d1 = M.scale(M.sub(to.tip, to.base), 1 / l),
        n = 24; // close enough together that the blades fuse into one sweep at the point
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n,
          base = M.lerp(from.base, to.base, t),
          dir = swing(d0, d1, t);
        add({
          a: M.add(base, M.scale(dir, l * 0.32)),
          b: M.add(base, M.scale(dir, l * 1.02)),
          width: 0.05 + 0.04 * t,
          pal: colours,
          life: 0.07 + 0.13 * t
        });
      }
    },
    sparks(at, n, colours, speed) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2,
          s = (speed || 4) * (0.4 + rnd() * 0.9),
          v = [Math.cos(a) * s, Math.sin(a) * s * 0.9 + 1.2, (rnd() - 0.3) * 1.5];
        add({ a: at.slice(), b: at.slice(), v, g: -14, drag: 3, width: 0.022, pal: colours, life: 0.16 + rnd() * 0.2, tail: 0.028 });
      }
    },
    dust(at, n, colours, dir) {
      for (let i = 0; i < n; i++) {
        const v = [(dir || 0) * (0.6 + rnd() * 1.2) + (rnd() - 0.5) * 0.6, 0.3 + rnd() * 0.7, (rnd() - 0.5) * 0.4],
          p = [at[0] + (rnd() - 0.5) * 0.3, 0.04 + rnd() * 0.05, at[2] + (rnd() - 0.5) * 0.2];
        add({ a: p, b: p.slice(), v, g: -1.5, drag: 4, width: 0.05 + rnd() * 0.03, pal: colours, life: 0.25 + rnd() * 0.2, puff: true });
      }
    },
    update(dt) {
      let n = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age >= it.life) {
          items.splice(i, 1);
          continue;
        }
        if (it.tail || it.puff) {
          it.v[1] += it.g * dt;
          const k = Math.max(0, 1 - it.drag * dt);
          it.v = M.scale(it.v, k);
          it.b = M.add(it.b, M.scale(it.v, dt));
          it.a = it.puff ? it.b : M.sub(it.b, M.scale(it.v, it.tail));
        }
      }
      for (const it of items) {
        const u = it.age / it.life,
          half = M.scale(M.sub(it.b, it.a), 0.5),
          l = len(half),
          width = it.width * (it.puff ? 0.6 + u : 1 - 0.6 * u),
          sw = (width / 1.9) ** 2,
          sl = Math.max(sw, (l / 1.9) ** 2),
          d = l > 1e-5 ? M.scale(half, 1 / l) : [1, 0, 0],
          k = sl - sw,
          o = n * 12,
          pal = Array.isArray(it.pal) ? it.pal[Math.min(it.pal.length - 1, Math.floor(u * it.pal.length))] : it.pal;
        rows[o] = (it.a[0] + it.b[0]) / 2;
        rows[o + 1] = (it.a[1] + it.b[1]) / 2;
        rows[o + 2] = (it.a[2] + it.b[2]) / 2;
        rows[o + 3] = sw + k * d[0] * d[0];
        rows[o + 4] = k * d[0] * d[1];
        rows[o + 5] = k * d[0] * d[2];
        rows[o + 6] = sw + k * d[1] * d[1];
        rows[o + 7] = k * d[1] * d[2];
        rows[o + 8] = sw + k * d[2] * d[2];
        rows[o + 9] = pal;
        rows[o + 10] = 0;
        rows[o + 11] = 3;
        n++;
      }
      this.count = n;
      return n;
    }
  };
}
