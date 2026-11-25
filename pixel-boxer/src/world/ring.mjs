/* The ring: a canvas six metres square on a raised apron, four padded posts and three ropes a side. Sculpted once and baked
   (tools/bake.mjs); the canvas is one plain colour, the bake's own light and shade on it and nothing marked out, and the
   ropes are baked apart from it (assets/ropes.splats.txt), so that the page can bend them where a man leans on them
   (world/ropes.mjs). The ropes run `rope` metres from the centre: a man stands at most `half` from it (game/bout.mjs), and
   there his back is against them. */
import { MAT } from '../rig/boxer.mjs';

export const RING = { half: 2.55, apron: 3.2, rope: 2.62, heights: [0.48, 0.84, 1.2], thick: 0.024 };

/* The ring sculpted: the canvas and the apron, the posts and their pads, and (o.ropes, as it is unless false) the ropes. */
export function sculptRing(S, o) {
  const A = RING.apron,
    rope = RING.rope;
  S.box([0, -0.42, 0], [A, 0.42, A], MAT.canvas, { res: 0.1 });
  S.box([0, -0.5, 0], [A + 0.03, 0.34, A + 0.03], MAT.apron, { res: 0.1 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * (rope + 0.12),
      z = sz * (rope + 0.12),
      pad = sx * sz > 0 ? MAT.white : sx > 0 ? MAT.blue : MAT.red;
    S.tube([[x, 0, z], [x, 1.42, z]], 0.07, 0.07, MAT.steel, { res: 0.06 });
    // the corner pad faces the centre
    S.box([x - sx * 0.1, 0.8, z - sz * 0.1], [0.11, 0.55, 0.11], pad, { res: 0.06 });
  }
  if (!o || o.ropes !== false) sculptRopes(S);
}
// the three ropes a side, red at the bottom, white, blue at the top (each side's from corner to corner)
export function sculptRopes(S) {
  const rope = RING.rope,
    mats = [MAT.red, MAT.white, MAT.blue];
  RING.heights.forEach((h, k) => {
    for (const s of [-1, 1]) {
      S.tube([[-rope, h, s * rope], [rope, h, s * rope]], RING.thick, RING.thick, mats[k], { res: 0.05 });
      S.tube([[s * rope, h, -rope], [s * rope, h, rope]], RING.thick, RING.thick, mats[k], { res: 0.05 });
    }
  });
}
