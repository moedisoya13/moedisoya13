/* Short-lived splats over the match: the streak a glove leaves along the path it really took, sparks and sweat off a blow,
   dust from a foot, and the shadows that pin the boxers to the canvas. Each is a stretched gaussian from a to b; every frame
   the live ones are written into one array of rows for the renderer. */
import * as M from '../rig/m3.mjs';

const CAP = 640;
const len = a => Math.hypot(a[0], a[1], a[2]);

export function createFx(random) {
  const items = [],
    rows = new Float32Array(CAP * 12),
    rnd = random || Math.random;
  const add = item => {
    if (items.length < CAP - 16) items.push(Object.assign({ age: 0, v: null, g: 0, drag: 0, width: 0.03, grow: 0 }, item));
  };
  function write(n, a, b, width, pal, flat) {
    const half = M.scale(M.sub(b, a), 0.5),
      l = len(half),
      sw = (width / 1.9) ** 2,
      sl = Math.max(sw, (l / 1.9) ** 2),
      d = l > 1e-5 ? M.scale(half, 1 / l) : [1, 0, 0],
      k = sl - sw,
      o = n * 12,
      up = flat ? 1e-6 - sw : 0; // a shadow has no height
    rows[o] = (a[0] + b[0]) / 2;
    rows[o + 1] = (a[1] + b[1]) / 2;
    rows[o + 2] = (a[2] + b[2]) / 2;
    rows[o + 3] = sw + k * d[0] * d[0];
    rows[o + 4] = k * d[0] * d[1];
    rows[o + 5] = k * d[0] * d[2];
    rows[o + 6] = sw + up + k * d[1] * d[1];
    rows[o + 7] = k * d[1] * d[2];
    rows[o + 8] = sw + k * d[2] * d[2];
    rows[o + 9] = pal;
    rows[o + 10] = 0;
    rows[o + 11] = 3;
  }
  return {
    rows,
    count: 0,
    // the glove was at a last frame and is at b now: leave that stretch of its path behind, cooling through `colours`
    trail(a, b, width, colours, life) {
      add({ a: a.slice(), b: b.slice(), width, pal: colours, life: life || 0.1, shrink: 0.75 });
    },
    sparks(at, n, colours, speed, dir) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2,
          s = speed * (0.35 + rnd() * 0.9),
          v = [Math.cos(a) * s * 0.8 + (dir ? dir[0] * speed * 0.7 : 0), Math.sin(a) * s * 0.7 + 1.4, (rnd() - 0.5) * s + (dir ? dir[1] * speed * 0.7 : 0)];
        add({ a: at.slice(), b: at.slice(), v, g: -13, drag: 3, width: 0.024, pal: colours, life: 0.16 + rnd() * 0.22, tail: 0.03, shrink: 0.6 });
      }
    },
    dust(at, n, colours, dir) {
      for (let i = 0; i < n; i++) {
        const v = [(dir ? dir[0] : 0) * (0.5 + rnd()) + (rnd() - 0.5) * 0.7, 0.25 + rnd() * 0.6, (dir ? dir[1] : 0) * (0.5 + rnd()) + (rnd() - 0.5) * 0.7],
          p = [at[0] + (rnd() - 0.5) * 0.25, 0.04 + rnd() * 0.05, at[2] + (rnd() - 0.5) * 0.25];
        add({ a: p, b: p.slice(), v, g: -1.2, drag: 4, width: 0.05 + rnd() * 0.03, pal: colours, life: 0.22 + rnd() * 0.2, tail: 0, shrink: -0.8 });
      }
    },
    // where a foot came down: a flat print on the canvas that fades
    print(at, yaw, colours, life) {
      const f = [Math.sin(yaw) * 0.085, 0, Math.cos(yaw) * 0.085];
      add({ a: [at[0] - f[0], 0.014, at[2] - f[2]], b: [at[0] + f[0], 0.014, at[2] + f[2]], width: 0.075, pal: colours, life: life || 1.4, shrink: 0.15, flat: true });
    },
    /* shadows: [{ x, z, yaw, long, wide }] drawn this frame only, flat on the canvas */
    update(dt, shadows, shade) {
      let n = 0;
      for (const s of shadows || []) {
        const f = [Math.sin(s.yaw) * s.long, 0, Math.cos(s.yaw) * s.long];
        write(n++, [s.x - f[0], 0.012, s.z - f[2]], [s.x + f[0], 0.012, s.z + f[2]], s.wide, shade, true);
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age >= it.life) {
          items.splice(i, 1);
          continue;
        }
        if (it.v) {
          it.v[1] += it.g * dt;
          it.v = M.scale(it.v, Math.max(0, 1 - it.drag * dt));
          it.b = M.add(it.b, M.scale(it.v, dt));
          if (it.b[1] < 0.02) (it.b[1] = 0.02), (it.v[1] *= -0.35);
          it.a = M.sub(it.b, M.scale(it.v, it.tail));
        }
      }
      for (const it of items) {
        if (n >= CAP) break;
        const u = it.age / it.life;
        write(n++, it.a, it.b, it.width * (1 - it.shrink * u), Array.isArray(it.pal) ? it.pal[Math.min(it.pal.length - 1, Math.floor(u * it.pal.length))] : it.pal, it.flat);
      }
      this.count = n;
      return n;
    }
  };
}
