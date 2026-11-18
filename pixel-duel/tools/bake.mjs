#!/usr/bin/env node
/* Bakes what the game draws: the swordsman at rest and the courtyard, as flat arrays of splats the browser can hand straight to
   the graphics card. ink-studio is only needed here; the game itself ships none of it.
     node tools/bake.mjs        -> assets/fighter.splats.txt, assets/arena.splats.txt, assets/manifest.json
   A splat is twelve floats here (x y z, the six numbers of its shape c00 c01 c02 c11 c12 c22, palette index, bone, density)
   and 22 bytes on disk, written as base64 text: see src/render/splats.mjs. */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { PALETTE, sculptSwordsman } from '../src/rig/swordsman.mjs';
import { BIND } from '../src/rig/poses.mjs';
import { ARENA, sculptArena } from '../src/world/arena.mjs';
import { pack as packSplats, BYTES } from '../src/render/splats.mjs';

const require = createRequire(import.meta.url);
const { makeBuilder, makeSculpt, KIT: K } = require('@shapeshift-labs/ink-studio').load();
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

const packed = hex => ((hex >> 16) & 255) + ((hex >> 8) & 255) * 256 + (hex & 255) * 65536;
const INDEX = new Map(PALETTE.map((hex, i) => [packed(hex), i]));
function paletteIndex(colour) {
  const exact = INDEX.get(Math.round(colour));
  if (exact !== undefined) return exact;
  const r = colour % 256,
    g = Math.floor(colour / 256) % 256,
    b = Math.floor(colour / 65536);
  let best = 0,
    bestD = 1e9;
  PALETTE.forEach((hex, i) => {
    const d = (r - ((hex >> 16) & 255)) ** 2 + (g - ((hex >> 8) & 255)) ** 2 + (b - (hex & 255)) ** 2;
    if (d < bestD) (bestD = d), (best = i);
  });
  return best;
}

function pack(W, boned) {
  const D = W.data,
    rows = [];
  let offPalette = 0;
  for (let i = 0; i < W.count; i++) {
    const o = i * 16,
      kind = Math.round(D[o + 11]) % 16;
    if (D[o + 3] <= 0) continue;
    if (boned && kind !== 12) continue; // only what rides a bone belongs to the figure
    if (!INDEX.has(Math.round(D[o + 7]))) offPalette++;
    rows.push(D[o], D[o + 1], D[o + 2], D[o + 4], D[o + 5], D[o + 6], D[o + 8], D[o + 9], D[o + 10], paletteIndex(D[o + 7]), boned ? D[o + 12] : 0, D[o + 3]);
  }
  return { data: new Float32Array(rows), count: rows.length / 12, offPalette };
}

// ---- the swordsman, in the stance he is lit in
let fighter;
{
  const B = makeBuilder(11, PALETTE),
    S = K.sculpt(makeSculpt(B));
  S.sun = B.norm([0.5, 0.8, 0.35]);
  S.aoR = 0.07;
  S.aoK = 1.3;
  const rig = K.creature(B, S);
  for (const name of NAMES) rig.bone(name);
  sculptSwordsman(S, fk(BIND));
  S.bake();
  const W = B.finish({});
  rig.bind(W, () => {});
  fighter = pack(W, true);
}

// ---- the courtyard
let arena;
{
  const B = makeBuilder(5, PALETTE),
    S = K.sculpt(makeSculpt(B));
  S.sun = B.norm([0.45, 0.8, 0.5]);
  sculptArena(S, 5);
  S.bake();
  arena = pack(B.finish({}), false);
  // nearest the camera first (it looks from +Z), so what is hidden behind a nearer splat fails the depth test before it is shaded
  const order = Array.from({ length: arena.count }, (_, i) => i).sort((a, b) => arena.data[b * 12 + 2] - arena.data[a * 12 + 2]),
    sorted = new Float32Array(arena.data.length);
  order.forEach((from, to) => sorted.set(arena.data.subarray(from * 12, from * 12 + 12), to * 12));
  arena.data = sorted;
}

function write(name, baked) {
  const packed = packSplats(baked.data),
    file = name + '.splats.txt';
  writeFileSync(path.join(out, file), Buffer.from(packed.bytes).toString('base64') + '\n');
  const round = v => +v.toFixed(5);
  console.log(`${name.padEnd(8)}${baked.count} splats, ${((baked.count * BYTES) / 1024).toFixed(0)} KB packed, ${baked.offPalette} off palette`);
  return { file, count: baked.count, min: packed.min.map(round), size: packed.size.map(round) };
}
const manifest = {
  palette: PALETTE,
  bones: NAMES.length + 1, // bone 0 stays where it is; bone i + 1 is joint i
  fighter: write('fighter', fighter),
  arena: Object.assign(write('arena', arena), { halfWidth: ARENA.halfWidth, camera: ARENA.camera })
};
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
