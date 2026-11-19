/* The ring: a canvas six metres square on a raised apron, four padded posts and three ropes a side. Sculpted once and baked;
   the canvas is then marked out in tiles, because a floor with a pattern on it is what makes footwork visible. */
import { MAT } from '../rig/boxer.mjs';

export const RING = { half: 2.55, apron: 3.2 }; // how far from the centre a boxer can stand, and where the canvas ends

export function sculptRing(S) {
  const A = RING.apron,
    rope = A - 0.32;
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
  for (const [h, mat] of [[0.48, MAT.red], [0.84, MAT.white], [1.2, MAT.blue]])
    for (const s of [-1, 1]) {
      S.tube([[-rope, h, s * rope], [rope, h, s * rope]], 0.024, 0.024, mat, { res: 0.05 });
      S.tube([[s * rope, h, -rope], [s * rope, h, rope]], 0.024, 0.024, mat, { res: 0.05 });
    }
}

/* Mark the canvas after baking: darker seams every `tile` metres, a ring in the middle. `data` is splat rows, `stride` floats
   each, the colour packed in column `col`; `shade(colour, steps)` returns the same ramp `steps` darker or lighter. */
export function markCanvas(data, count, stride, col, shade, isCanvas) {
  const tile = 0.8,
    seam = 0.035;
  for (let i = 0; i < count; i++) {
    const o = i * stride,
      x = data[o],
      y = data[o + 1],
      z = data[o + 2];
    if (y < -0.03 || Math.abs(x) > RING.apron || Math.abs(z) > RING.apron || !isCanvas(data[o + col])) continue;
    const fx = Math.abs(((x / tile) % 1 + 1.5) % 1 - 0.5) * tile,
      fz = Math.abs(((z / tile) % 1 + 1.5) % 1 - 0.5) * tile,
      r = Math.hypot(x, z),
      checker = (Math.floor(x / tile + 100) + Math.floor(z / tile + 100)) % 2;
    let steps = checker ? 0 : -1;
    if (fx < seam || fz < seam) steps = -2;
    if (Math.abs(r - 1.1) < 0.045) steps = 1;
    if (steps) data[o + col] = shade(data[o + col], steps);
  }
}
