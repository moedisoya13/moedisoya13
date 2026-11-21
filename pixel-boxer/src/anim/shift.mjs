/* The Tyson shift (타이슨 시프트, docs/moves-plan-5.md §4.4): a clean great one's and a clean legend's (4명 and 5명), a
   technique his head picks (game/techniques.mjs shift) in place of a combination started with a power punch. Four beats:
     ① the rear hand's straight at the head (it hides the feet: landed, blocked or gone by, he goes on);
     ② the shift: the rear foot comes off the canvas and is walked through, past the lead foot, to come down ahead of it and
        out to the right; his centre goes with it, in close and off the other man's line, outside his lead foot; the lead foot
        turns on its ball and stays. The stance is changed over;
     ③ down low in it, on both knees and over at the waist, the gloves at his chest;
     ④ the lead hand's hook to the body (moves.mjs shiftHook, thrown as a rear hand's: the left side is behind him now), and the
        rear hand's uppercut out of the knees (moves.mjs upperIn);
   and back round: the lead foot brought round to the front past the rear one, his centre over it, square to him again, in the
   orthodox stance he always stands in.
   The engine's boxer always stands with his left foot and hand ahead (moves.mjs GUARD; there is no southpaw: §8). The stance
   changed over is this one action's: his feet are put where it says for as long as it lasts, and he comes back out of it to his
   own stance. A blow in the middle of it puts his feet back (the lead foot comes through under him as he is knocked back).

   What is whose. The bout (game/bout.mjs: f.shift) decides it all on the canvas: when each punch goes (it presses them), where
   his centre goes and when, where the rear foot comes down (a spot on the canvas), and when he comes back; it tells the body,
   every step, in his own terms (view.shift). This module is the body's side:
     shiftOf(level)                 a grade's shift (skill.mjs: shift), or null: that grade has none
     createShift()                  the body's own state of it
     shiftHold(st, s)               each frame, before his beat: whether his feet are the shift's (and the beat chooses none to
                                    step), its start and its end; a foot in the air as it starts is put down where it is; as
                                    it ends, the feet are let go of where they are, or, if they are out of place (a blow in
                                    the middle of it), brought back under him over `settle` seconds
     shiftFoot(st, side, s)         where a foot of his is: { at (the ball, his own terms), lift, pitch } or null (his own)
     shiftBody(c, st, s)            the crouch and the turn of the hips with the stance changed over, the gloves at his chest,
                                    the feet turned on their balls; the punches are their own */
import { MOVES } from './moves.mjs';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const ease = u => ((u = clamp(u, 0, 1)), u * u * u * (10 + u * (6 * u - 15))); // leaves and lands at rest

export const shiftOf = level => (level && level.shift) || null;
// (seconds to bring feet that are out of place back under him once it is over: a blow in the middle of it)
export const SETTLE = { time: 0.3, far: 0.05, lift: 0.04 };

export const createShift = () => ({ on: false, id: null, settle: null, square: 0 });

/* s: { view (the bout's view.shift, or null), planted ({ L, R }: the balls of his feet, where they are put, his own terms),
   swing (his beat's step: { side, from, to }), drawn ({ L, R }: where each ball was drawn last frame), ball ({ L, R }: where
   each is in his guard), drift (a spot on the canvas, carried back as the canvas goes by under him this frame), dt }
   -> true while his feet are the shift's */
export function shiftHold(st, s) {
  const v = s.view;
  if (v && (!st.on || st.id !== v.id)) {
    // (a foot in the air as it starts is put down where it is: he does not finish a step of his beat)
    if (s.swing.side && s.drawn[s.swing.side]) s.planted[s.swing.side] = s.drawn[s.swing.side].slice();
    s.swing.side = s.swing.from = s.swing.to = null;
    Object.assign(st, { on: true, id: v.id, settle: null, square: 0 });
  } else if (!v && st.on) {
    st.on = false;
    // (let go of where they are; or, out of place, brought back under him)
    const far = side => Math.hypot(s.drawn[side][0] - s.ball[side][0], s.drawn[side][2] - s.ball[side][2]);
    for (const side of ['L', 'R']) if (s.drawn[side]) s.planted[side] = s.drawn[side].slice();
    if (s.drawn.L && s.drawn.R && Math.max(far('L'), far('R')) > SETTLE.far) st.settle = { t: 0, from: { L: s.drawn.L.slice(), R: s.drawn.R.slice() } };
  }
  if (st.settle) {
    st.settle.t += s.dt;
    for (const side of ['L', 'R']) {
      const d = s.drift(st.settle.from[side]);
      st.settle.from[side][0] += d[0];
      st.settle.from[side][2] += d[1];
    }
    if (st.settle.t >= SETTLE.time) {
      for (const side of ['L', 'R']) s.planted[side] = s.ball[side].slice();
      st.settle = null;
    }
  }
  return st.on || !!st.settle;
}

/* s: { view, planted, ball } -> { at, lift, pitch } for a foot the shift has, or null */
export function shiftFoot(st, side, s) {
  const v = s.view;
  if (st.settle) {
    // (back under him: the lead foot stepped through, the rear dragged)
    const u = st.settle.t / SETTLE.time,
      e = ease(u),
      from = st.settle.from[side],
      to = s.ball[side];
    return { at: [from[0] + (to[0] - from[0]) * e, to[1], from[2] + (to[2] - from[2]) * e], lift: side === 'L' ? SETTLE.lift * Math.sin(Math.PI * clamp(u, 0, 1)) : 0.005 * Math.sin(Math.PI * clamp(u, 0, 1)), pitch: side === 'L' ? 10 * Math.sin(2 * Math.PI * clamp(u, 0, 1)) : 4 };
  }
  if (!v) return null;
  const sv = v.sv;
  const back = v.back === null || v.back <= 0 ? null : clamp(v.back, 0, 1);
  if (back !== null) {
    // back round: the lead foot brought round to the front, the rear turning on its ball and drawn as far as it must be
    const e = ease(back),
      from = side === 'L' ? v.L0 : v.Rb,
      to = s.ball[side],
      at = [from[0] + (to[0] - from[0]) * e, to[1], from[2] + (to[2] - from[2]) * e];
    if (back >= 1) s.planted[side] = at.slice();
    return side === 'L' ? { at, lift: sv.lift * Math.pow(Math.sin(Math.PI * back), 1.3), pitch: 12 * Math.sin(2 * Math.PI * back) } : { at, lift: 0.006 * Math.sin(Math.PI * back), pitch: 8 };
  }
  // the lead foot: where it is until the rear one is down, then drawn in on its ball (a slide, not a step)
  if (side === 'L') {
    if (v.in === null || !v.Ls) return null;
    const u = clamp(v.in, 0, 1),
      e = ease(u),
      at = [v.Ls[0] + (v.Lin[0] - v.Ls[0]) * e, s.ball.L[1], v.Ls[2] + (v.Lin[2] - v.Ls[2]) * e];
    if (u >= 1) s.planted.L = at.slice();
    return { at, lift: 0.004 * Math.sin(Math.PI * u), pitch: 6 };
  }
  // the rear foot: on its ball until it goes, then through the air to its spot, and there
  if (v.step === null || v.step <= 0) return null;
  const u = clamp(v.step, 0, 1),
    e = ease(u),
    at = [v.R0[0] + (v.R1[0] - v.R0[0]) * e, s.ball.R[1], v.R0[2] + (v.R1[2] - v.R0[2]) * e];
  if (u >= 1) s.planted.R = at.slice();
  return { at, lift: sv.lift * Math.pow(Math.sin(Math.PI * u), 1.3), pitch: 18 * Math.sin(Math.PI * u) * (1 - u) + 6 };
}

/* The rest of him (c: the channels; s: { view, action (what he is doing), shelled (how far he is still in the shell's crouch:
   clean.mjs shellBody), dt }): down into the crouch, the hips turned to face the other man with the stance changed over, the
   gloves drawn in to his chest as he goes in, the feet turned on their balls; all of it undone as he comes back round. The
   crouch is the uppercut's wind-up: it gives way to it as it winds up. */
export function shiftBody(c, st, s) {
  const v = s.view;
  if (!v) return 0;
  const sv = v.sv,
    t = v.t,
    a = s.action,
    back = v.back === null ? 0 : smooth(v.back),
    // (out of the shell he is down in it already: its crouch is handed on to this one as it lets go)
    down = v.shell ? clamp(1 - (s.shelled || 0), 0, 1) : v.off === null ? 0 : smooth((t - v.off - sv.down[0]) / (sv.down[1] - sv.down[0])),
    // (the uppercut's own wind-up and drive take the knees over as it goes)
    upper = a && a.name === 'upperIn' && a.chain && a.shifted ? clamp(Math.max(a.chain.coil.q, a.chain.q[0]), 0, 1) : 0,
    crouch = down * (1 - upper) * (1 - back),
    stepped = v.step === null ? 0 : smooth(v.step),
    // (squared up to him as the rear foot comes through, once the straight has got there: it has turned him already)
    straight = a && a.name === 'cross' && a.chain && (a.chain.phase === 'coil' || a.chain.phase === 'throw' || a.chain.phase === 'hold');
  st.square += ((straight ? 0 : stepped * (1 - back)) - st.square) * (1 - Math.exp(-s.dt * 25));
  const square = st.square;
  c.lkf += sv.knees[0] * crouch;
  // (the rear knee only once its foot is down, and over a tenth of a second: the weight coming onto it)
  c.rkf += sv.knees[1] * crouch * (v.step === null ? 1 : smooth(((v.step - 1) * sv.step) / 0.1));
  // (over at the waist and the hips back once the rear foot goes: out of the shell, the straight goes from his knees alone)
  const over = crouch * (v.off === null ? 0 : smooth((t - v.off) / 0.1));
  c.lean += sv.waist * over;
  // (and the hips let down between his feet, whatever the stride: the knees bend as they must under it)
  c.hy -= sv.sink * crouch;
  c.hz -= sv.seat * over; // (the hips back over his heels: the head is not put in his guard)
  c.hp -= 0.4 * sv.waist * over; // (the eyes kept up on him)
  c.yaw += sv.square * square;
  // the gloves drawn in to his chest as he goes in (not the one that is punching)
  const busy = a && a.chain && a.chain.phase !== 'done' && MOVES[a.name] ? MOVES[a.name].hand : null,
    k = smooth(t / 0.15) * (1 - back) * (1 - upper);
  if (busy !== 'L') (c.lx += sv.hand[0] * k), (c.ly += sv.hand[1] * k), (c.lz += sv.hand[2] * k);
  if (busy !== 'R') (c.rx -= sv.hand[0] * k), (c.ry += sv.hand[1] * k), (c.rz += sv.hand[2] * k);
  // the lead foot turned on its ball as the rear goes by it, the rear turned in the air to point ahead; and back
  c.lfw += sv.pivot[0] * stepped * (1 - back);
  c.rfw += sv.pivot[1] * stepped * (1 - back);
  return crouch;
}
