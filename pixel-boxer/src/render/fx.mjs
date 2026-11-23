/* Short-lived splats over the match: the streak a glove leaves along the path it really took, sparks off a blow (where they
   start and which way they go: render/blow.mjs), the lava a knockdown's blow throws in their place (globs and embers), the
   sweat that leaves the far side of a head when it is hit (a study, not drawn in the game), dust from a foot, and the
   shadows that pin the boxers to the canvas. Each is a stretched gaussian from a to b (a glob is three of them, an ember
   one or two); every frame the live ones are written into one array of rows for the renderer.
     heatOf(it)   the colours a glob or an ember is drawn in now: a glob's [tail, body, head] as it flies, [rim, core] once it
                  is stuck to the canvas; an ember's [head, tail], null while it is winked out (for drawing it, and for
                  checking it) */
import * as M from '../rig/m3.mjs';

const CAP = 960;
const len = a => Math.hypot(a[0], a[1], a[2]);
// (a number from 0 to 1 for a whole number k and a seed: the same for the same two, whenever it is asked)
function chance(seed, k) {
  let h = Math.imul(seed ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* How far a glob has cooled, from its temperature T (1 hot, 0 cold), in five stages: 0 hot, 1 a crust forming behind, 2 a
   crust round a small glow, 3 a cinder with one glowing point, 4 the point gone out (the last of its life, once cold). */
const stageOf = it => (it.T <= 0.25 && it.age >= 0.85 * it.cools ? 4 : it.T > 0.75 ? 0 : it.T > 0.5 ? 1 : it.T > 0.25 ? 2 : 3);

/* The colours a glob is drawn in now ([tail, body, head]), from its glow (hottest first: pale yellow, amber, orange) and
   its crust (charcoal, lightest first): hot, its head the hottest glow, its body the next, its tail the next; then the
   crust forms behind an orange body and an amber head; then it closes round them, an orange glow inside it (the body then
   wholly within it: render/fx.mjs lava); then a cinder, darker, with one orange point; then the point goes out. Nothing of
   it is ever red: drawn a pixel or two across, a red heart could not be kept wholly inside its crust, and a red lump on
   its own reads as blood. Stuck to the canvas ([rim, core]): an orange core over a charcoal rim, the rim darkening, then
   all charcoal, over the time it lies there.
   An ember's ([head, tail]; null where it is not drawn): down its glow from where it started over its life (by the cube
   of how far through its life it is: hot for most of it), and every `flicker` seconds of its own age either the step it
   is at or the next as its seed says; at its last step it goes out by winking, the more often off the nearer its end;
   its tail a step cooler than its head (or as cool, at the last). */
export function heatOf(it) {
  if (it.kind === 'glob') {
    const [G, C] = [it.glow, it.crust];
    if (it.stuck) {
      const k = Math.min(2, Math.floor(((it.age - it.stuck.at) / it.spot) * 3));
      return [[C[0], C[1], C[2]][k], [G[2], G[2], C[1]][k]];
    }
    return [[G[2], G[1], G[0]], [C[0], G[2], G[1]], [C[0], G[2], G[2]], [C[2], C[1], G[2]], [C[2], C[1], C[1]]][stageOf(it)];
  }
  const H = it.heat,
    last = H.length - 1,
    at = Math.pow(it.age / it.life, 3) * (last + 1 - it.from),
    step = Math.min(last, it.from + Math.floor(at)),
    beat = Math.floor(it.age / it.flicker + 1e-6),
    roll = chance(it.seed, beat);
  if (step < last) {
    const head = roll < 0.5 ? step + 1 : step;
    return [H[head], H[Math.min(last, head + 1)]];
  }
  // (at the last step: off as often as on to begin with, nearly always off at the end; reckoned once a beat)
  const into = Math.pow((beat * it.flicker) / it.life, 3) * (last + 1 - it.from) - (last - it.from);
  return roll < 0.5 + 0.4 * Math.min(1, Math.max(0, into)) ? [null, null] : [H[last], H[last]];
}

export function createFx(random) {
  const items = [],
    rows = new Float32Array(CAP * 12),
    rnd = random || Math.random;
  const add = item => {
    if (items.length < CAP - 16) items.push(Object.assign({ age: 0, v: null, g: 0, drag: 0, width: 0.03, grow: 0 }, item));
  };
  /* the way a mote is thrown: a fan round where it starts with a little lift in it, carried on `dir` if there is one at 0.7
     of the speed, all of it times `pace`; wide: times the fan's own spread */
  const fling = (speed, dir, pace, wide) => {
    const a = rnd() * Math.PI * 2,
      s = speed * (0.35 + rnd() * 0.9) * (wide || 1);
    return [Math.cos(a) * s * 0.8 + (dir ? dir[0] * speed * 0.7 : 0), Math.sin(a) * s * 0.7 + 1.4 + (dir && dir[2] ? dir[2] * speed * 0.7 : 0), (rnd() - 0.5) * s + (dir ? dir[1] * speed * 0.7 : 0)].map(x => x * pace);
  };
  /* an ember at `at` going at v: o as embers' below; from: the step of its glow it starts at; age: how long ago it was let go
     (a glob sheds one on the beat of its own clock, wherever the frame falls) */
  const ember = (at, v, o, from, age) =>
    add({
      kind: 'ember', a: at.slice(), b: M.add(at, M.scale(v, age)), v, age, g: -13 * (o.fall ?? 1), drag: 3 * (o.drag ?? 1), brake: o.brake ?? 0, width: o.width, heat: o.glow, from,
      life: (0.16 + rnd() * 0.22) * (o.life ?? 1), seed: Math.floor(rnd() * 4294967296) | 0, flicker: o.flicker ?? 0.04, trail: o.trail ?? Infinity,
      wander: (o.wander ? o.wander[0] + rnd() * (o.wander[1] - o.wander[0]) : 0), round: rnd() * Math.PI * 2, turn: (rnd() < 0.5 ? -1 : 1) * (3 + 3 * rnd())
    });
  function write(n, a, b, width, pal, flat, dense, light, near) {
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
    // (a speck of light: the renderer never inks it, even in front of a boxer; or else, as a number below 0, how many metres
    // nearer the eye it is taken as in deciding what is nearest, so that one part of a glob stays in front of another)
    rows[o + 10] = light ? 1 : near ? -near : 0;
    rows[o + 11] = dense ?? 3; // (how solid: under a half it is not drawn at all, so a mote thinning toward that winks out)
  }
  // (one row more, from a to b, if there is room for it: near, metres nearer the eye it is taken as)
  const put = (n, a, b, width, pal, flat, near) => (n < CAP ? (write(n, a, b, width, pal, flat, 3, false, near), n + 1) : n);
  /* A glob as it flies: three parts laid along the way it goes, each a stretched gaussian, all longer the faster it goes;
     [half-width, how far behind the front its middle is, half its length]. Hot, the tail behind, the body over the back of
     the head, the head at the front. As it cools (from the first crust to the crust closed round it) the tail, now the
     crust, comes forward and swells round the body, and the body shrinks into it, so that once the crust has closed the
     body's glow lies wholly inside it from whichever side it is seen (an ellipsoid within another, about the same axis), the
     head a small point at the crust's front; the whole draws in a little. Each part is taken as nearer the eye than the
     one before it by as far as their middles are apart and a few millimetres more, so that from any side the head is drawn
     over the body and the body over the tail: the renderer draws whatever is nearest at a pixel, hard-edged, nothing
     blended, and three parts as near as each other would cut through one another. Stuck to the canvas: a flat spot, its
     core over its rim, both shrinking as they cool. An ember: a dot, and while it is fast a short tail behind it, the dot
     over the tail; nothing while it is winked out. -> the rows written so far */
  const mix = (a, b, k) => a + (b - a) * k;
  function lava(n, it) {
    const colours = heatOf(it);
    if (it.kind === 'glob') {
      if (it.stuck) {
        const u = Math.min(1, (it.age - it.stuck.at) / it.spot),
          k = it.width * (1 - 0.4 * u),
          d = it.stuck.way,
          p = [it.b[0], 0.014, it.b[2]];
        n = put(n, M.sub(p, M.scale(d, 1.3 * k)), M.add(p, M.scale(d, 1.3 * k)), 0.9 * k, colours[0], true, 0);
        return put(n, M.sub(p, M.scale(d, 0.5 * k * (1 - 0.5 * u))), M.add(p, M.scale(d, 0.5 * k * (1 - 0.5 * u))), 0.45 * k * (1 - 0.5 * u), colours[1], true, 0.005);
      }
      const T = it.T,
        R = it.width * (0.85 + 0.15 * T),
        d = it.way,
        s = Math.min(R, len(it.v) * 0.012) * (0.3 + 0.7 * T),
        c = Math.min(1, Math.max(0, (0.75 - T) / 0.25)), // (0 hot, 1 once the crust has closed round it)
        head = R * mix(0.25 + 0.4 * T, 0.2 + 0.2 * T, c),
        parts = [
          [R * mix(0.65, 0.95, c), mix(2.65 * R + 1.1 * s, R + 0.6 * s, c), mix(0.85 * R + 0.5 * s, 0.95 * R + 0.5 * s, c)],
          [R * mix(1, 0.45, c), mix(1.5 * R + 0.4 * s, 1.05 * R + 0.6 * s, c), mix(R + 0.4 * s, 0.45 * R + 0.3 * s, c)],
          [head, head + 0.2 * s, head + 0.2 * s]
        ];
      let near = 0;
      parts.forEach(([r, mid, half], i) => {
        if (i) near += Math.abs(mid - parts[i - 1][1]) + 0.004;
        const m = M.sub(it.b, M.scale(d, mid));
        n = put(n, M.sub(m, M.scale(d, half)), M.add(m, M.scale(d, half)), r, colours[i], false, near);
      });
      return n;
    }
    if (colours[0] === null) return n;
    const sp = len(it.v),
      p = it.b;
    if (sp <= it.trail) return put(n, p, p, it.width, colours[0], false, 0);
    n = put(n, M.sub(p, M.scale(it.v, 0.02)), M.sub(p, M.scale(it.v, 0.006)), it.width, colours[1], false, 0);
    return put(n, p, p, it.width, colours[0], false, sp * 0.013 + 0.004);
  }
  return {
    rows,
    items, // (what is live, for checking it: tests/fx.test.mjs reads a glob's T and an ember's colours off these)
    count: 0,
    // the glove was at a last frame and is at b now: leave that stretch of its path behind, cooling through `colours`
    trail(a, b, width, colours, life) {
      add({ a: a.slice(), b: b.slice(), width, pal: colours, life: life || 0.1, shrink: 0.75 });
    },
    /* sparks thrown out round `at`, a fan with a little lift in it, carried on `dir` if there is one: [x, z] the way across,
       and [x, z, y] up or down as well (render/blow.mjs: the way the glove was going), each at 0.7 of the speed; width:
       how thick each is drawn, metres (render/blow.mjs: by the damage done); o: { life (times its life), pace (times its
       velocity, the fan's lift with it), fall (times its gravity), drag (times the air's hold on it) } (render/blow.mjs: a
       hit's). Each goes through its colours over its life. */
    sparks(at, n, colours, speed, dir, width, o) {
      const life = (o && o.life) || 1,
        pace = (o && o.pace) || 1,
        fall = (o && o.fall) || 1,
        drag = (o && o.drag) || 1;
      for (let i = 0; i < n; i++) {
        const v = fling(speed, dir, pace);
        add({ a: at.slice(), b: at.slice(), v, g: -13 * fall, drag: 3 * drag, width: width || 0.024, pal: colours, life: (0.16 + rnd() * 0.22) * life, tail: 0.03, shrink: 0.6 });
      }
    },
    /* Lava: globs thrown out round `at` as sparks are (the same fan, `dir`, speed), each `width` thick (metres: its middle
       part's half-width as drawn), drawn as three parts along the way it flies, a head, a body and a tail, hot each a step
       of the glow cooler than the one before. While it rises it is at its hottest (T 1); from the top of its flight it cools
       by how fast it falls (T 1 - that over `cool` m/s; one thrown downward from the speed it was thrown at) and by its age
       (to cold at the end of its life), whichever is the cooler, never back. Cooling, it crusts over: a charcoal crust forms
       behind it and closes round a shrinking glow, until it is a cinder with one glowing point, and the point goes out
       (heatOf). It does not bounce: where it comes down on the canvas it lies flat for `spot` seconds, a glowing core over a
       charcoal rim going dark, and is gone. Flying, it sheds an ember every `shed.every` seconds of its own age, at
       `shed.pace` of its own velocity, as hot as its head, at most `shed.most` of them.
         o  { glow (colours, hottest first: three of them), crust (three, lightest first), life, pace, fall, drag (as
              sparks'), cool (m/s), land (seconds a glob cold before it comes down is carried on to the canvas, at most; 0:
              it is gone at the end of its life), spot (s), shed: { every, pace, most, ember: the embers' o } } */
    globs(at, n, speed, dir, width, o) {
      for (let i = 0; i < n; i++) {
        const v = fling(speed, dir, o.pace || 1),
          life = (0.16 + rnd() * 0.22) * (o.life || 1);
        add({
          kind: 'glob', a: at.slice(), b: at.slice(), v, g: -13 * (o.fall ?? 1), drag: 3 * (o.drag ?? 1), width, glow: o.glow, crust: o.crust, cools: life, life: life + (o.land ?? 0), cool: o.cool ?? 2.5,
          T: 1, top: null, thrown: Math.max(0, -v[1]), way: len(v) > 1e-6 ? M.scale(v, 1 / len(v)) : [1, 0, 0], spot: o.spot ?? 0.35, shed: o.shed || null, shedding: 0, stuck: null
        });
      }
    },
    /* Embers: specks thrown out round `at` as sparks are, `width` thick (the thinnest that shows), going down their glow over
       their life and flickering: every `flicker` seconds of their own age (so the same in a slow motion and a replay,
       however often they are drawn) the step they are at or the next, and at the last step on or off, winking out (heatOf).
       The air takes them quickly (drag
       times the sparks', and `brake` more for every m/s they go: the faster, the harder), they barely fall (`fall` times the
       sparks' gravity), and they wander to one side and the other at `wander` m/s, turning as they go. While fast (faster
       than `trail` m/s) each has a short tail a step cooler.
         o  { glow (colours, hottest first), life, pace, wide (times the fan's spread), fall, drag, brake (per m/s), wander: [least, most] m/s,
              flicker (s), trail (m/s) } */
    embers(at, n, speed, dir, width, o) {
      for (let i = 0; i < n; i++) ember(at, fling(speed, dir, o.pace || 1, o.wide), Object.assign({ width }, o), 0, 0);
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
        } else if (it.kind === 'glob') {
          if (it.stuck) continue; // (it lies where it came down)
          it.v[1] += it.g * dt;
          it.v = M.scale(it.v, Math.max(0, 1 - it.drag * dt));
          it.b = M.add(it.b, M.scale(it.v, dt));
          const sp = len(it.v);
          if (sp > 0.05) it.way = M.scale(it.v, 1 / sp);
          // (how hot it is: the hottest until the top of its flight; from there by how fast it falls and by its age, never back)
          if (it.top === null && it.v[1] < 0) it.top = Math.max(0, it.age - dt);
          if (it.top !== null) {
            const fell = Math.min(1, Math.max(0, (-it.v[1] - it.thrown) / it.cool)),
              aged = Math.min(1, Math.max(0, (it.age - it.top) / Math.max(1e-6, it.cools - it.top)));
            it.T = Math.min(it.T, 1 - fell, 1 - aged);
          }
          // (the embers it sheds on the beat of its own age, from where it was then, as hot as its head is)
          while (it.shed && it.shedding < it.shed.most && it.age >= (it.shedding + 1) * it.shed.every - 1e-9) {
            const late = Math.max(0, it.age - (it.shedding + 1) * it.shed.every);
            it.shedding++;
            ember(M.sub(it.b, M.scale(it.v, late)), M.scale(it.v, it.shed.pace), it.shed.ember, Math.min(it.shed.ember.glow.length - 1, stageOf(it)), late);
          }
          // (it does not bounce: where it comes down on the canvas it stays, flat, for the last of its time)
          if (it.b[1] < 0.02 + it.width * 0.5) {
            it.b[1] = 0.02 + it.width * 0.5;
            it.v = [0, 0, 0];
            const flat = Math.hypot(it.way[0], it.way[2]);
            it.stuck = { at: it.age, way: flat > 1e-3 ? [it.way[0] / flat, 0, it.way[2] / flat] : [1, 0, 0] };
            it.life = it.age + it.spot;
          }
        } else if (it.kind === 'ember') {
          // (the air takes it, the harder the faster it goes; it barely falls; and it wanders, turning as it goes)
          it.v[1] += it.g * dt;
          it.v = M.scale(it.v, Math.exp(-(it.drag + it.brake * len(it.v)) * dt));
          const turn = it.round + it.turn * it.age;
          it.b = M.add(it.b, M.scale([it.v[0] + it.wander * Math.cos(turn), it.v[1], it.v[2] + it.wander * Math.sin(turn)], dt));
          if (it.b[1] < 0.02) (it.b[1] = 0.02), (it.v[1] = Math.max(0, it.v[1]));
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
        if (it.kind) {
          n = lava(n, it);
          continue;
        }
        const u = it.age / it.life;
        // (a mote of the mist is a single pixel while it flies, and thins away to nothing over the rest of its life)
        write(n++, it.a, it.b, it.width * (it.stick ? 0.6 : 1 - it.shrink * u), Array.isArray(it.pal) ? it.pal[Math.min(it.pal.length - 1, Math.floor(u * it.pal.length))] : it.pal, it.flat, it.thin ? 1.5 - 1.1 * Math.max(0, (u - 0.4) / 0.6) ** 1.5 : 3, it.thin);
      }
      this.count = n;
      return n;
    }
  };
}
