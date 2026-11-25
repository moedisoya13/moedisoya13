/* How the sparring page shows a knockdown: the one place it is decided, the game page's own way (src/main.mjs, docs/moves-plan-6.md
   §2.4D, src/replay.mjs): the fall live at the true speed from the ordinary camera, all the way down; then, once every effect
   of the blow and of the landing has gone out (render/blow.mjs quietOf), a cut to a closer camera (from above, or from the side
   the blow is seen best from: replay.mjs viewOf) and a brief slow replay from the press of the punch that did it to him falling
   away, ending before he comes down; then a cut back. Any tap or key skips it. If the game's way changes, this file follows it
   and src/spar.mjs does not change. The page calls it at these points and nowhere else:
     const k = createKnockdown({ yaw, aspect, edge })   yaw(): the live camera's yaw; aspect(): the picture's width over its
                            height; edge(): what the camera keeps inside (the ropes, RING.rope, unless it says: the pit's
                            edge, world/stage.mjs)
     k.after(bout, quiet)   after each step: -> true on the step a replay starts (the page stops stepping the bout while k.playing);
                            quiet: quietOf(the motes, the ripples, the ring) as the page draws them
     k.picture(dt)          while k.playing: what to draw instead of the live bout (k.crossed: the steps it has come to, to throw
                            their blows' effects again in k.moved seconds of its own; k.started on the first; k.view its camera)
     k.camera(live, played) the camera to draw the replay with (live: the live camera's distance; played: what k.picture gave),
                            or null while none plays
     k.skip()               a tap or a key: -> true if it ended a replay
     k.shown(bout)          the fall and its replay have been shown, and a moment after it: the result may come
     k.reset()              a new round */
import { createReplay, distOf, backOf, FALL } from '../replay.mjs';
import { RING } from '../world/ring.mjs';

const DT = 1 / 60;
/* A knockdown's replay camera is not to look at them through the ropes (the game page's rule, src/main.mjs): it has room where,
   as far off as it is drawn, it is inside them, or high enough over them (EYE metres up) that they lie under the picture; and
   if none has, it comes in no further off what it frames than a little inside them (inside). AFTER: seconds after the replay
   before the result (the game's). */
const EYE = 2.4,
  AFTER = 0.6;
function inside(at, Z, ROPES) {
  let far = Infinity;
  for (const i of [0, 2]) if (Math.abs(Z[i]) > 1e-6) far = Math.min(far, (Math.sign(Z[i]) * ROPES - at[i]) / Z[i]);
  return far - 0.2;
}
const roomFor = (at, Z, d, ROPES) => {
  const eye = [0, 1, 2].map(i => at[i] + Z[i] * d);
  return (Math.abs(eye[0]) < ROPES && Math.abs(eye[2]) < ROPES) || eye[1] >= EYE;
};

export function createKnockdown(o) {
  let liveDist = 8,
    endedAt = -Infinity;
  const edge = () => (o.edge ? o.edge() : RING.rope);
  const replay = createReplay({
    brilliant: false,
    yaw: o.yaw,
    room: (at, Z, size) => roomFor(at, Z, distOf({ size, closer: FALL.view.closer, push: 0 }, liveDist, o.aspect(), 0), edge())
  });
  return {
    get playing() {
      return replay.playing;
    },
    get pending() {
      return replay.pending;
    },
    get crossed() {
      return replay.crossed;
    },
    get started() {
      return replay.started;
    },
    get moved() {
      return replay.moved;
    },
    get view() {
      return replay.view;
    },
    after(bout, quiet) {
      return replay.watch(bout, DT, quiet);
    },
    picture(dt, bout) {
      const snap = replay.next(dt);
      if (!replay.playing) endedAt = bout.t;
      return snap;
    },
    camera(live, played) {
      liveDist = live;
      const v = played ? replay.view : null;
      return v ? { target: v.target, yaw: v.yaw, pitch: v.pitch, dist: distOf(v, live, o.aspect(), replay.progress, inside(v.target, backOf(v.yaw, v.pitch), edge())) } : null;
    },
    skip(bout) {
      if (!replay.playing) return false;
      replay.skip();
      endedAt = bout.t;
      return true;
    },
    shown(bout) {
      return bout.over !== null && bout.t - bout.overAt > 1.6 && !replay.pending && !replay.playing && bout.t - endedAt >= AFTER;
    },
    reset() {
      replay.reset();
      endedAt = -Infinity;
    }
  };
}
