/* How a boxer stands when he is doing nothing else, by the grade of his footwork (skill.mjs: stance). These are layers of
   numbers on the animator's channels, like everything else, and they are driven by his beat (the half beats his feet keep)
   or, where a grade has no beat to speak of, by his own clock: never by the bout, and never moving where he stands on the
   canvas (his feet move only through their own channels). The animator owns the state; what is here is what each layer is.
     headAt(head, X)            the head at X along its U (-1 to his right .. 1 to his left): { x, y } metres
     headTo(c, x, y)            that offset put onto the channels, part from the hips and part bent at the waist
     phraseX(P)                 where the legend's head is at P half beats into his phrase
     FLOURISH[name].at(c, p, t, k, side)   a flourish p half beats (t seconds) in, at weight k, added to the channels */

// seconds: half a beat on the spot (a pattern written in half beats keeps this time when it keeps no beat)
export const H = 0.32;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
// up and back down again over 0..1, leaving and arriving at rest
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

/* The head goes from one side to the other along a U: lowest passing the middle, level with the guard at either end. Put as
   a parabola under the line between the ends, it is a curve with no corner in it however fast or slow X goes along it. */
export const headAt = (head, X) => ({ x: head.A * X, y: -head.D * (1 - X * X) });

/* An offset of the head (x to his left, y up, metres) as the channels make it: a third of it from the hips moving over the
   feet, the rest bent at the waist, and the bend to his left made the way a slip makes it (moves.mjs: LEFT_BEND), so the head
   goes across and not into the punch. Measured: a degree of bend takes the head 0.85 cm to his right, 1.47 cm to his left. */
const ACROSS = { L: 1.47, R: 0.85 },
  LEFT_BEND = { side: 0.375, lean: -0.69 };
export function headTo(c, x, y) {
  c.hx += x / 3;
  const bend = ((x * 2) / 3) * 100;
  if (bend > 0) {
    const raw = bend / ACROSS.L;
    c.side += raw * (1 + LEFT_BEND.side);
    c.lean += raw * LEFT_BEND.lean;
  } else c.side += bend / ACROSS.R;
  c.hy += y;
}

/* The legend's phrase (5명), sixteen half beats from a lead foot coming down: an end on every lead foot (left, right, left,
   right), into the middle and held there, the same twice as fast while the tempo quickens, a dead stop, the break out of it
   (a flourish, if he is free to), and back to the left under a change of level, ready to go round again. */
export const PHRASE = {
  length: 16,
  keys: [[0, 1], [2, -1], [4, 1], [6, -1], [7, 0], [8, 0], [9, 1], [10, -1], [11, 1], [12, -1], [14, -1], [16, 1]],
  fast: [8, 12], // the tempo quickens (cycle 0.52 s instead of 0.64)
  stop: 12, // and stops dead for a half beat of the slow tempo
  burst: 12, // out of which comes a flourish
  level: [14, 16] // and the change of level under the last crossing
};
export function phraseX(P) {
  const keys = PHRASE.keys;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= P) i++;
  if (i + 1 >= keys.length) return keys[i][1];
  const [p0, a] = keys[i],
    [p1, b] = keys[i + 1];
  return a + (b - a) * (1 - Math.cos((Math.PI * (P - p0)) / (p1 - p0))) / 2;
}

/* Flourishes: things a boxer does with his feet and his hands while he is waiting, each for so many half beats from a foot
   coming down. They are not actions: they stop nothing, and an action starting puts an end to them (the animator lets go of
   what they were showing). `side` is +1 or -1, which way a sided one goes. In his own terms: x to his left, z ahead. The
   lead foot is at z 0.2 and the rear at -0.24 in the guard, the middle of them -0.02. */
const env = (p, len) => smooth(p / 0.2) * smooth((len - p) / 0.2); // in and out over a fifth of a half beat
export const FLOURISH = {
  // the shuffle: up off the canvas a touch and the feet switched, lead behind rear, and back, twice, the shoulders with them
  shuffle: {
    len: 2, clean: true,
    at(c, p, t, k) {
      const q = clamp(p / 0.5, 0, 4),
        n = Math.floor(Math.min(q, 3.999)),
        f = q - n,
        out = n % 2 === 0 ? smooth(f) : 1 - smooth(f), // switched (1) or home (0)
        e = env(p, 2) * k;
      c.lfz += -0.35 * out * e; // the lead foot to 13 cm behind the middle of the stance
      c.rfz += 0.35 * out * e; // the rear to 13 cm in front of it
      c.lfy += 0.025 * bump(f) * e;
      c.rfy += 0.025 * bump(f) * e;
      c.hy += 0.015 * bump(p / 2) * e;
      c.yaw += 8 * out * e; // the shoulders go with the feet
      c.ly -= 0.03 * e;
      c.ry -= 0.03 * e;
      c.le += 0.15 * e;
      c.re += 0.15 * e;
    }
  },
  // in and out: the hips and the lead foot in for a half beat, the upper body left behind, and out again
  inout: {
    len: 2, clean: true,
    at(c, p, t, k) {
      const w = (p < 1 ? smooth(p) : 1 - smooth(p - 1)) * k;
      c.hz += 0.07 * w;
      c.lfz += 0.05 * w;
      c.lfy += 0.02 * bump(p < 1 ? p : p - 1) * k;
      c.lean -= 3 * w;
    }
  },
  // the jab feint: the lead shoulder and hand flick out and the knees give, in eight hundredths, and back by fourteen
  jabFeint: {
    len: 1, clean: true,
    at(c, p, t, k) {
      const w = (t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.08) / 0.06)) * k;
      c.waist -= 7 * w;
      c.lz += 0.09 * w;
      c.ly += 0.01 * w;
      c.hy -= 0.015 * w;
    }
  },
  // the level feint: down and over in a tenth of a second, as if under a punch or into one, and up by eighteen hundredths
  levelFeint: {
    len: 1, clean: true,
    at(c, p, t, k) {
      const w = (t < 0.1 ? smooth(t / 0.1) : 1 - smooth((t - 0.1) / 0.08)) * k;
      c.hy -= 0.06 * w;
      c.lean += 6 * w;
    }
  },
  // the side hop: the hips and both feet a hop to one side, the head left behind and catching up, and back
  sideHop: {
    len: 2, clean: true, sided: true,
    at(c, p, t, k, side) {
      const w = (p < 1 ? smooth(p) : 1 - smooth(p - 1)) * k,
        hop = bump(p < 1 ? p : p - 1) * k;
      c.hx += 0.07 * side * w;
      c.lfx += 0.05 * side * w;
      c.rfx += 0.05 * side * w;
      c.lfy += 0.02 * hop;
      c.rfy += 0.02 * hop;
      c.hy += 0.01 * hop;
      // (the head stays where it was a moment, then follows: a bend against the way the hips go, coming and going)
      c.side -= 5 * side * Math.sin(Math.PI * clamp(p, 0, 2)) * k;
    }
  },
  // ---- dirty (the stance forms of the two dirty techniques kept): the paw, the lead hand stuck out in his eyes and tapping
  // at his gloves (the face jab's), and a step onto his lead foot (the stomp's)
  paw: {
    len: 2, dirty: true,
    at(c, p, t, k) {
      const e = env(p, 2) * k;
      c.lz += (0.12 + 0.03 * bump((p * 2) % 1)) * e;
      c.ly += 0.03 * e;
      c.lx -= 0.03 * e;
      c.le += 0.1 * e;
    }
  },
  stompStep: {
    len: 2, dirty: true,
    at(c, p, t, k) {
      const w = (p < 1.2 ? smooth(p / 1.2) : 1 - smooth((p - 1.2) / 0.8)) * k;
      c.lfz += 0.1 * w;
      c.lfy += 0.025 * bump(p / 1.2) * k;
      c.waist -= 6 * w;
      c.hz += 0.04 * w;
    }
  }
};
export const CLEAN = Object.keys(FLOURISH).filter(n => FLOURISH[n].clean);
export const DIRTY = Object.keys(FLOURISH).filter(n => FLOURISH[n].dirty);

// a little random number source of his own, so that the same boxer in the same bout fidgets the same way every time
export function dice(seed) {
  let s = (seed * 2654435761 + 0x9e3779b9) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
