/* Short-lived splats over the match: the streak a glove leaves along the path it really took, sparks off a blow, the sweat
   that leaves the far side of a head when it is hit, dust from a foot, and the shadows that pin the boxers to the canvas. Each is a stretched gaussian from a to b; every frame
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
    /* Sweat: beads that were sitting on the side of his head away from the glove. The blow drives the head into them, so
       at first they ride it; when the neck stops the head they keep going, each one letting go as the head slows under it
       (the loosest first, at nearly the head's top speed; the ones that cling longest leave slower and fall short). Nothing
       here is aimed: where they go is where the head was going.
         head()   -> the middle of his head now, in the world
         from     where the glove met it
         colours  what a bead goes through as it flies, or several of those, one taken for each bead
         o        { clock(): the bout's own time, seconds (it stands still while the moment of a blow is held, and the
                    picture may be drawn more often than the bout is stepped: the head's speed is reckoned by this),
                    size: metres across, gain: how much faster than the head they leave (it is a game), fan: how much they
                    spread out round the head's way, life: seconds, drag, tail: seconds of path a bead is drawn along } */
    sweat(head, from, n, colours, o) {
      const c = head(),
        far = M.sub(c, from),
        fl = len(far) || 1,
        f = M.scale(far, 1 / fl),
        // (two directions square to it, to put the beads round the far side)
        s = len([f[2], 0, -f[0]]) > 1e-3 ? M.scale([f[2], 0, -f[0]], 1 / len([f[2], 0, -f[0]])) : [1, 0, 0],
        u = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
      for (let i = 0; i < n; i++) {
        // on the far half of the head, more of them toward its top and back (hair holds sweat), a little way off the skin
        const out = 0.25 + 0.75 * rnd(),
          round = rnd() * Math.PI * 2,
          wide = Math.sqrt(1 - out * out),
          dir = M.add(M.scale(f, out), M.add(M.scale(s, wide * Math.cos(round)), M.scale(u, wide * Math.sin(round)))),
          off = M.scale([dir[0], dir[1] + 0.25 * rnd(), dir[2]], 0.115 + 0.02 * rnd());
        add({
          a: M.add(c, off), b: M.add(c, off), stick: head, clock: o.clock, at: o.clock(), off, dir, grip: 0.55 + 0.42 * rnd(), last: M.add(c, off), vel: [0, 0, 0], top: 0, topV: [0, 0, 0], on: 0,
          g: -9.8, drag: o.drag ?? 2, width: o.size * (0.75 + 0.5 * rnd()), pal: Array.isArray(colours[0]) ? colours[Math.floor(rnd() * colours.length)] : colours, life: 9, fly: (o.life ?? 0.45) * (0.6 + 0.8 * rnd()), tail: o.tail ?? 0.008, shrink: 0.45, splat: true,
          gain: (o.gain ?? 1.3) * (0.55 + 0.75 * rnd()), fan: (o.fan ?? 0.16) * rnd()
        });
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
        if (it.stick) {
          // a bead still on his head: it goes where the head goes, until the head slows under it
          const now = it.clock(),
            step = now - it.at;
          if (step <= 0) continue; // (his time has not moved: nothing is to be made of a head standing still in it)
          const p = M.add(it.stick(), it.off);
          it.vel = M.scale(M.sub(p, it.last), 1 / step);
          it.last = p;
          it.at = now;
          it.on += step;
          const speed = len(it.vel);
          if (speed > it.top) (it.top = speed), (it.topV = it.vel);
          it.a = it.b = p;
          if ((it.top > 0.5 && speed < it.top * it.grip) || it.on > 0.3) {
            if (it.top <= 0.5) {
              items.splice(i, 1); // the head never went anywhere: the bead stays where it was
              continue;
            }
            // let go: the head's speed as it leaves, a little of the way it faces out from the head, and a little lift
            const keep = Math.max(speed / it.top, 0.5);
            it.v = M.add(M.scale(it.topV, it.gain * keep), M.scale(it.dir, it.top * it.gain * it.fan));
            it.v[1] += 0.5 * it.fan * it.top;
            it.stick = null;
            it.age = 0;
            it.life = it.fly;
          }
        } else if (it.v) {
          it.v[1] += it.g * dt;
          it.v = M.scale(it.v, Math.max(0, 1 - it.drag * dt));
          it.b = M.add(it.b, M.scale(it.v, dt));
          if (it.b[1] < 0.02) {
            it.b[1] = 0.02;
            if (it.splat) it.life = Math.min(it.life, it.age + 0.03); // a bead is gone where it lands
            else it.v[1] *= -0.35;
          }
          it.a = M.sub(it.b, M.scale(it.v, it.tail));
        }
      }
      for (const it of items) {
        if (n >= CAP) break;
        if (it.stick && it.top <= 0.5) continue; // (a bead is not seen until the head moves under it)
        const u = it.age / it.life;
        write(n++, it.a, it.b, it.width * (it.stick ? 0.6 : 1 - it.shrink * u), Array.isArray(it.pal) ? it.pal[Math.min(it.pal.length - 1, Math.floor(u * it.pal.length))] : it.pal, it.flat);
      }
      this.count = n;
      return n;
    }
  };
}
