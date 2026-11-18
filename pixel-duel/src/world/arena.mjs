/* The courtyard the duel is fought in: a stone terrace, a gate behind it, two lanterns and bamboo (the sky and its moon are painted by the renderer).
   The fighters move along X at z = 0 and the camera looks from +Z, so everything here is dressing behind that line.
   Sculpted once and baked; nothing in it moves. */
import { MAT } from '../rig/swordsman.mjs';

export const ARENA = { halfWidth: 4.6, camera: { target: [0, 1.12, 0], dist: 5.7, pitch: 0.07, yaw: 0 } };

// a small seeded generator, so the same courtyard is baked every time
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sculptArena(S, seed) {
  const rr = mulberry(seed || 5);
  // terrace: its top is the ground the fighters stand on, its front face the bottom edge of the picture
  S.box([0, -0.3, -0.35], [6.6, 0.3, 1.85], MAT.stone, { res: 0.095 });
  S.box([0, -0.07, 1.5], [6.6, 0.07, 0.06], MAT.paleStone, { res: 0.05 }); // a lighter kerb to draw the edge
  for (let i = 0; i < 26; i++) {
    const x = -6 + rr() * 12,
      z = -1.9 + rr() * 2.9;
    if (Math.abs(z) < 0.5) continue; // nothing underfoot on the fighting line
    S.ball([x, 0.01, z], [0.05 + rr() * 0.07, 0.025, 0.04 + rr() * 0.05], MAT.paleStone, { res: 0.04 });
  }
  // wall along the back
  S.box([0, 0.5, -2.35], [6.6, 0.5, 0.16], MAT.stone, { res: 0.095 });
  S.box([0, 1.04, -2.35], [6.6, 0.05, 0.24], MAT.paleStone, { res: 0.08 });

  // gate: two posts, a tie beam and a curved lintel
  for (const x of [-1.75, 1.75]) {
    S.tube([[x, 0, -1.95], [x * 0.96, 3.0, -1.95]], 0.15, 0.12, MAT.timber, { res: 0.055 });
    S.box([x, 0.14, -1.95], [0.21, 0.14, 0.21], MAT.stone, { res: 0.05 });
  }
  S.box([0, 2.36, -1.95], [2.15, 0.09, 0.1], MAT.timber, { res: 0.055 });
  S.box([0, 2.98, -1.95], [2.55, 0.11, 0.14], MAT.timber, { res: 0.055 });
  S.tube([[-2.85, 3.3, -1.95], [-1.4, 3.16, -1.95], [0, 3.13, -1.95], [1.4, 3.16, -1.95], [2.85, 3.3, -1.95]], 0.11, 0.11, MAT.stone, { res: 0.055 });

  // lanterns, lit
  for (const x of [-3.7, 3.7]) {
    const z = -1.35;
    S.lathe([x, 0, z], 0.18, [0.3, 0.22], MAT.stone, { res: 0.05 });
    S.tube([[x, 0.15, z], [x, 0.95, z]], 0.09, 0.08, MAT.stone, { res: 0.05 });
    S.box([x, 1.0, z], [0.22, 0.05, 0.22], MAT.paleStone, { res: 0.05 });
    S.ball([x, 1.2, z], [0.15, 0.15, 0.15], MAT.lamp, { res: 0.045 });
    S.lathe([x, 1.36, z], 0.24, [0.36, 0.2, 0.06], MAT.stone, { res: 0.05 });
  }

  // bamboo behind the wall, leaning a little, with a tuft of leaves on each
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1,
      x = side * (2.9 + rr() * 3.4),
      z = -2.9 - rr() * 0.9,
      h = 3.4 + rr() * 1.6,
      lean = (rr() - 0.5) * 0.7;
    S.tube([[x, 0.6, z], [x + lean * 0.4, h * 0.6, z], [x + lean, h, z]], 0.055, 0.03, MAT.bamboo, { res: 0.06 });
    for (let k = 0; k < 3; k++)
      S.ball([x + lean * (0.75 + k * 0.12) + (rr() - 0.5) * 0.5, h * (0.78 + k * 0.1), z + (rr() - 0.5) * 0.3], [0.34, 0.13, 0.2], MAT.bamboo, { res: 0.07 });
  }
}
