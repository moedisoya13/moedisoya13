/* What keeps a figure made of held drawings from ever standing dead still. The clips decide the drawings and when they change;
   this decides how the figure arrives at each one and what it does while it stays there. It is drawn-side only: the duel's
   rules never see it.
     const alive = createAlive()
     alive.update(target, token, dt, { cut, over, drift, still }) -> the pose to draw
   `token` names the drawing the figure is on; when it changes, the figure has arrived somewhere new:
     cut    (a drawing reached with no in-betweens) the whole jump still lands on the first frame, then the figure carries on
            a little past the drawing the way it came, springs back, and goes on sinking into it slowly for as long as it is
            held. A coil that deepens, a follow-through that settles, a struck body that keeps giving.
     eased  (a loop begun, a drawing blended into) whatever the figure was showing is let go of smoothly, with no pop, however
            the two motions differ.
   A breath and a slow sway of the upper body are laid over everything, so the longest hold still moves; the feet and hips
   are left where the drawing put them. */
import * as M from '../rig/m3.mjs';
import * as Q from './quat.mjs';
import { NAMES } from '../rig/skeleton.mjs';

export const ALIVE = {
  over: 0.12, // how far past a drawing the figure carries, as a share of the jump that brought it there
  overTau: 0.08, // seconds for that to die away
  overHz: 5, // and how fast it springs back
  drift: 0.08, // how much further it sinks into a held drawing, as a share of the jump
  driftTau: 0.5,
  ease: 0.045, // seconds: how quickly an eased arrival lets go of the old pose (about five of these to settle)
  breath: 0.01, // taller and thinner by this share, and back
  breathHz: 0.45,
  sway: 1.4, // degrees the body above the waist circles through, so even a long hold shifts its weight
  swayHz: 0.6
};

export function createAlive(seed) {
  let token = null,
    shown = null,
    delta = null, // what was showing when the drawing changed, measured from the new drawing
    dRoot = [0, 0, 0],
    dStretch = 0,
    age = 0,
    cut = false,
    gains = null,
    clock = (seed || 0) * 1.7;
  return {
    reset() {
      token = shown = null;
    },
    update(target, tok, dt, o) {
      o = o || {};
      clock += dt;
      if (tok !== token) {
        const was = shown || target;
        token = tok;
        age = 0;
        cut = !!o.cut;
        gains = { over: o.over === undefined ? ALIVE.over : o.over, drift: o.drift === undefined ? ALIVE.drift : o.drift };
        delta = {};
        for (const name of NAMES) delta[name] = Q.mul(Q.fromM3(was.rot[name]), Q.inv(Q.fromM3(target.rot[name])));
        dRoot = M.sub(was.root, target.root);
        dStretch = was.stretch - target.stretch;
      } else age += dt;
      /* w is how much of the old pose is mixed back in. Eased: it starts at 1 and dies away. Cut: it starts at 0 (the jump
         has landed) and goes negative, which is the figure carrying on beyond the drawing, away from where it came from. */
      const w = cut
        ? -(gains.over * Math.exp(-age / ALIVE.overTau) * Math.sin(2 * Math.PI * ALIVE.overHz * age) + gains.drift * (1 - Math.exp(-age / ALIVE.driftTau)))
        : (1 + age / ALIVE.ease) * Math.exp(-age / ALIVE.ease);
      const breath = o.still ? 0 : ALIVE.breath * Math.sin(2 * Math.PI * ALIVE.breathHz * clock);
      if (Math.abs(w) < 1e-4 && o.still) return (shown = target);
      const rot = {};
      for (const name of NAMES) rot[name] = Math.abs(w) < 1e-4 ? target.rot[name] : Q.toM3(Q.mul(Q.power(delta[name], w), Q.fromM3(target.rot[name])));
      shown = { root: M.add(target.root, M.scale(dRoot, w)), rot, stretch: target.stretch + dStretch * w };
      if (o.still) return shown;
      // the breath and sway are not part of what the next arrival is measured from
      const a = 2 * Math.PI * ALIVE.swayHz * clock,
        lean = [ALIVE.sway * Math.cos(a), 0, ALIVE.sway * Math.sin(a)],
        live = Object.assign({}, rot);
      live.Spine1 = M.mul(rot.Spine1, M.euler(lean));
      live.Neck1 = M.mul(rot.Neck1, M.euler(M.scale(lean, -0.6))); // the eyes stay on the opponent
      return { root: shown.root, rot: live, stretch: shown.stretch * (1 + breath) };
    }
  };
}
