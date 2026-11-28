/* What keeps a man's body inside the place he fights in, ball by ball (the user, 2026-11-28, cards a-fall-edge and a-corner):
   his body as balls round the points of him (a man down: every joint, so thick, JOINT_R; a man standing: the bout's own
   points, world/ropes.mjs BODY), and the place's edge as what those balls may not go into:
     the ring   the near side of its ropes (RING.rope less their thickness), where the ropes cannot give: for a man down or
                getting up, everywhere (nothing holds a man lying on the canvas against them but the canvas); for a man
                standing, only as far as a rope can be drawn bent where he presses it (near a corner, where it is tied, hardly
                at all: world/ropes.mjs bend); and the corner pads, as they are sculpted (world/ring.mjs sculptRing)
     the pit    the inner face of its walls and drums (world/pit.mjs PIT.edge)
   push(arena, balls, standing) -> [dx, dz]: how far to move him (his place, and every ball with it) so that none of them is
   in it; [0, 0] when none is. It moves him straight in from each side he is over, and off a pad along the corner's
   diagonal. (`most`: how far a rope bends at the most, world/ropes.mjs ROPE.drawn.most, for a man standing.) */
import { RING } from './ring.mjs';
import { PIT } from './pit.mjs';

// (a man's joints as balls, the thickness of what is sculpted round each, a little less where it is a long part: rig/boxer.mjs)
export const JOINT_R = {
  Hips: 0.15, Spine1: 0.13, Spine2: 0.14, Chest: 0.14, Neck1: 0.06, Head: 0.11,
  Shoulder: 0.09, Arm: 0.07, ForeArm: 0.06, Hand: 0.1, Leg: 0.11, Shin: 0.075, Foot: 0.065, ToeBase: 0.06
};
export const jointR = name => JOINT_R[name] ?? JOINT_R[name.replace(/^(Left|Right)/, '')] ?? 0.08;

// the ring's corner pads: a box at each corner, (centre out on both axes, its half width, its middle's height, half its height)
export const PAD = { out: RING.rope + 0.12 - 0.1, half: 0.11, y: 0.8, high: 0.55 };
const FACE = RING.rope - RING.thick;

/* (how far a man standing may press a rope at u along its side: as far as it is drawn bent out there, so that his body is
   never seen through it by more than `GIVE.through` metres (world/ropes.mjs bend: a rope pressed d is drawn out d times
   its taper, 1 but within 0.4 m of the corner where it is tied), and no further than it bends at the most) */
export const GIVE = { through: 0.012, taper: 0.4 };
export const give = (u, most) => {
  const taper = Math.max(0, Math.min(1, (RING.rope - Math.abs(u)) / GIVE.taper));
  return taper >= 1 ? most : Math.min(most, GIVE.through / (1 - taper));
};

export function push(arena, balls, standing, most) {
  let px = 0,
    nx = 0,
    pz = 0,
    nz = 0;
  const pit = arena === 'underground',
    face = pit ? PIT.edge : FACE;
  for (const [p, r] of balls) {
    if (!p) continue;
    // (each side: how far past it, less what the rope there can give a man standing; a man standing meets the ropes only
    // with a ball at a rope's height (world/ropes.mjs contacts); one down, or getting up, at any height: what would hang out
    // over the ropes or the walls as he goes down would come down through them, so it is kept in from the first)
    const meets = pit || !standing || RING.heights.some(h => Math.abs(p[1] - h) < r);
    for (const [a, t] of meets ? [[0, 2], [2, 0]] : []) {
      const allow = standing && !pit ? give(p[t], most || 0) : 0,
        over = Math.abs(p[a]) + r - face - allow;
      if (over > 0) {
        if (a === 0) p[0] > 0 ? (px = Math.max(px, over)) : (nx = Math.max(nx, over));
        else p[2] > 0 ? (pz = Math.max(pz, over)) : (nz = Math.max(nz, over));
      }
    }
    // (the ring's corner pads: out of the box straight in along the corner's diagonal, as far as takes it off the nearer of
    // the pad's two faces: a man pinned in the corner is held off it the same way every step, not first one way, then the other)
    if (!pit && Math.abs(p[1] - PAD.y) < PAD.high + r) {
      const ix = Math.abs(p[0]) + r - (PAD.out - PAD.half),
        iz = Math.abs(p[2]) + r - (PAD.out - PAD.half),
        d = Math.min(ix, iz);
      if (d > 0) {
        p[0] > 0 ? (px = Math.max(px, d)) : (nx = Math.max(nx, d));
        p[2] > 0 ? (pz = Math.max(pz, d)) : (nz = Math.max(nz, d));
      }
    }
  }
  return [nx - px, nz - pz];
}
