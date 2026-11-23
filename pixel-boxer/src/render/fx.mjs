/* Short-lived splats over the match: the streak a glove leaves along the path it really took, sparks off a blow (where they
   start, which way they go, and how hot they are at first: render/blow.mjs), the sweat that leaves the far side of a head when it is hit (a study, not drawn
   in the game), dust from a foot, and the shadows that pin the boxers to the canvas. Each is a stretched gaussian from a to b; every frame
   the live ones are written into one array of rows for the renderer. */
import * as M from '../rig/m3.mjs';

const CAP = 960;
const WHITE = 38; // the palette's white (assets/manifest.json)
const len = a => Math.hypot(a[0], a[1], a[2]);

export function createFx(random) {
  const items = [],
    rows = new Float32Array(CAP * 12),
    rnd = random || Math.random;
  const add = item => {
    if (items.length < CAP - 16) items.push(Object.assign({ age: 0, v: null, g: 0, drag: 0, width: 0.03, grow: 0 }, item));
  };
  function write(n, a, b, width, pal, flat, dense, light) {
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
    rows[o + 10] = light ? 1 : 0; // (a speck of light: the renderer never inks it, even in front of a boxer)
    rows[o + 11] = dense ?? 3; // (how solid: under a half it is not drawn at all, so a mote thinning toward that winks out)
  }
  return {
    rows,
    count: 0,
    // the glove was at a last frame and is at b now: leave that stretch of its path behind, cooling through `colours`
    trail(a, b, width, colours, life) {
      add({ a: a.slice(), b: b.slice(), width, pal: colours, life: life || 0.1, shrink: 0.75 });
    },
    /* sparks thrown out round `at`, a fan with a little lift in it, carried on `dir` if there is one: [x, z] the way across,
       and [x, z, y] up or down as well (render/blow.mjs: the way the glove was going), each at 0.7 of the speed; width:
       how thick each is drawn, metres (render/blow.mjs: by the damage done); o: { life (times its life), pace (times its
       velocity, the fan's lift with it), fall (times its gravity), drag (times the air's hold on it), hot: { colours (hottest
       first), fall (m/s), least (s) }: a mote glowing as it flies, at the hottest of them while it rises, cooling from the top
       of its flight through the rest of them as it falls faster, and its own colours again once it falls at `fall` (and it
       stays so: one that bounces does not glow again); one thrown downward glows for its first `least` seconds before that
       rule takes it; and having glowed, it is never drawn white } (render/blow.mjs: a hit's) */
    sparks(at, n, colours, speed, dir, width, o) {
      const life = (o && o.life) || 1,
        pace = (o && o.pace) || 1,
        fall = (o && o.fall) || 1,
        drag = (o && o.drag) || 1,
        hot = (o && o.hot) || null;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2,
          s = speed * (0.35 + rnd() * 0.9),
          v = [Math.cos(a) * s * 0.8 + (dir ? dir[0] * speed * 0.7 : 0), Math.sin(a) * s * 0.7 + 1.4 + (dir && dir[2] ? dir[2] * speed * 0.7 : 0), (rnd() - 0.5) * s + (dir ? dir[1] * speed * 0.7 : 0)].map(x => x * pace);
        add({ a: at.slice(), b: at.slice(), v, g: -13 * fall, drag: 3 * drag, width: width || 0.024, pal: colours, hot, cool: 0, life: (0.16 + rnd() * 0.22) * life, tail: 0.03, shrink: 0.6 });
      }
    },
    /* The spray off a blow: sweat thrown off the part of him that was struck, at the instant it lands. The way the glove
       was going is taken as a light: every bit of the part's surface that light leaves in shadow (the side away from the
       glove) throws motes, most where the shadow is deepest, straight behind the blow. Each mote's velocity is worked out
       from where on the surface it sat: the way the blow was going, turned outward by the surface's own facing there, so
       one from straight behind goes straight on and one from the edge of the shadow leaves at a slant. The fan's shape is
       the part's, not a set angle: an uppercut under the chin throws them up off the top of the head, a hook throws them
       off the far cheek the way the hook was going. How far they get, and how many there are, is the blow's impulse.
       It is a mist: motes far too small to fall, stopped by the air within a metre, so it is out in a tenth of a second,
       dense at the part and thin at its tip, and then hangs where it stopped and thins away.
       None of it is to be seen over the man it came off, in front of him or behind: kept in an fx of its own for each man
       and drawn as a layer with the renderer's `outside` set to his silhouette, it shows first at his outline, as if it came
       from behind him, and scatters from there.
         part     what was struck: { at: its middle (world), r: its radius } (a head), or { at, to, r } for a part with
                  length (a trunk: the motes come off all along it)
         vec      the way the glove was going as it met him (unit, world)
         J        the blow's impulse, newton-seconds
         colours  what a mote goes through as it hangs, or several of those, one taken for each mote
         o        { n: motes for a blow of 85 N s, range: metres the fastest get for one (both in proportion to J),
                    flare: how far a mote at the shadow's edge is turned outward (0 none, 1 half way to its own facing),
                    size: metres across, drag: how soon the air stops them (1/s), life: seconds, g: how fast it settles
                    (m/s2, a mist's: next to nothing), beads: the share that are drops heavy enough to carry on and fall }
       -> how many motes it threw */
    spray(part, vec, J, colours, o) {
      const k = Math.min(1.7, J / 85),
        n = Math.round((o.n ?? 120) * k),
        drag = o.drag ?? 12,
        top = (o.range ?? 0.8) * k * drag, // (a mote the air stops goes its speed over the drag, all told)
        d = vec,
        s = len([d[2], 0, -d[0]]) > 1e-3 ? M.scale([d[2], 0, -d[0]], 1 / len([d[2], 0, -d[0]])) : [1, 0, 0],
        u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]],
        pick = () => (Array.isArray(colours[0]) ? colours[Math.floor(rnd() * colours.length)] : colours);
      for (let i = 0; i < n; i++) {
        /* where on the shadowed side: the surface's facing there, taken so that there are more of them the deeper the
           shadow (as light falls off a surface turned from it, the other way round) */
        const deep = Math.sqrt(rnd()), // (how squarely this bit of surface faces away from the glove: 1 straight behind)
          edge = Math.sqrt(1 - deep * deep),
          round = rnd() * Math.PI * 2,
          out = M.add(M.scale(s, Math.cos(round)), M.scale(u, Math.sin(round))),
          facing = M.add(M.scale(d, deep), M.scale(out, edge)),
          middle = part.to ? M.lerp(part.at, part.to, rnd()) : part.at,
          at = M.add(middle, M.scale(facing, part.r)),
          // the way it leaves: the blow's way, turned outward by as much as the surface there faces outward
          way = M.add(d, M.scale(out, edge * (o.flare ?? 0.7))),
          wl = len(way),
          bead = rnd() < (o.beads ?? 0),
          // (the deepest shadow is hit squarest and throws hardest; and of any bit, most motes are slow and a few fast)
          go = top * (0.35 + 0.65 * deep) * (0.2 + 0.8 * rnd() ** 1.7), // (none so slow that it is left sitting on him)
          v = M.scale(way, go / wl);
        add({
          a: at, b: at.slice(), v, g: bead ? -9.8 : o.g ?? -1.2, drag: drag * (bead ? 0.3 : 0.8 + 0.4 * rnd()),
          width: (o.size ?? 0.015) * (bead ? 1.7 : 0.7 + 0.6 * rnd()), pal: pick(), life: (o.life ?? 0.42) * (bead ? 1.3 : 0.55 + 0.75 * rnd()), tail: bead ? 0.012 : 0.007,
          shrink: 0.2, thin: !bead, splat: true
        });
      }
      return n;
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
          // (how far a glowing mote has cooled: by how fast it falls, never back)
          if (it.hot && it.age >= it.hot.least) it.cool = Math.max(it.cool, Math.min(1, -it.v[1] / it.hot.fall));
        }
      }
      for (const it of items) {
        if (n >= CAP) break;
        if (it.stick && it.top <= 0.5) continue; // (a bead is not seen until the head moves under it)
        const u = it.age / it.life,
          own = Array.isArray(it.pal) ? Math.min(it.pal.length - 1, Math.floor(u * it.pal.length)) : -1,
          // (a mote still glowing: its hot colours as far as it has cooled; then its own, from where it is in its life, but past
          // the palette's white if it has glowed)
          pal = it.hot && it.cool < 1 ? it.hot.colours[Math.min(it.hot.colours.length - 1, Math.floor(it.cool * it.hot.colours.length))] : own < 0 ? it.pal : it.hot && it.pal[own] === WHITE ? it.pal.slice(own).find(c => c !== WHITE) ?? it.pal[own] : it.pal[own];
        // (a mote of the mist is a single pixel while it flies, and thins away to nothing over the rest of its life)
        write(n++, it.a, it.b, it.width * (it.stick ? 0.6 : 1 - it.shrink * u), pal, it.flat, it.thin ? 1.5 - 1.1 * Math.max(0, (u - 0.4) / 0.6) ** 1.5 : 3, it.thin);
      }
      this.count = n;
      return n;
    }
  };
}
