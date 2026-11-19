#!/usr/bin/env node
/* Bakes what the match draws: the boxer in his guard and the ring, as packed splats the page hands to the graphics card.
   ink-studio is only needed here; the page ships none of it.
     node tools/bake.mjs   -> assets/boxer.splats.txt, assets/ring.splats.txt, assets/manifest.json */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { PALETTE, MAT, sculptBoxer } from '../src/rig/boxer.mjs';
import { RING, sculptRing, markCanvas } from '../src/world/ring.mjs';
import { guardPose } from '../src/anim/animator.mjs';
import { pack as packSplats, BYTES } from '../src/render/splats.mjs';

const require = createRequire(import.meta.url);
const { makeBuilder, makeSculpt, KIT: K } = require('@shapeshift-labs/ink-studio').load();
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

const packed = hex => ((hex >> 16) & 255) + ((hex >> 8) & 255) * 256 + (hex & 255) * 65536;
const INDEX = new Map(PALETTE.map((hex, i) => [packed(hex), i]));
function rowsOf(W, boned) {
  const D = W.data,
    rows = [];
  let stray = 0;
  for (let i = 0; i < W.count; i++) {
    const o = i * 16,
      kind = Math.round(D[o + 11]) % 16;
    if (D[o + 3] <= 0 || (boned && kind !== 12)) continue;
    const index = INDEX.get(Math.round(D[o + 7]));
    if (index === undefined) stray++;
    rows.push(D[o], D[o + 1], D[o + 2], D[o + 4], D[o + 5], D[o + 6], D[o + 8], D[o + 9], D[o + 10], index || 0, boned ? D[o + 12] : 0, D[o + 3]);
  }
  return { data: new Float32Array(rows), count: rows.length / 12, stray };
}
const sculptor = seed => {
  const B = makeBuilder(seed, PALETTE),
    S = K.sculpt(makeSculpt(B));
  S.sun = B.norm([0.25, 0.9, 0.35]);
  S.aoR = 0.07;
  S.aoK = 1.3;
  return { B, S };
};

let boxer, ring;
{
  const { B, S } = sculptor(3),
    rig = K.creature(B, S);
  for (const name of NAMES) rig.bone(name);
  sculptBoxer(S, fk(guardPose()));
  S.bake();
  const W = B.finish({});
  rig.bind(W, () => {});
  boxer = rowsOf(W, true);
}
{
  const { B, S } = sculptor(5);
  sculptRing(S);
  S.bake();
  const W = B.finish({}),
    canvas = MAT.canvas.r.map(i => packed(PALETTE[i])),
    shade = (colour, steps) => canvas[Math.max(0, Math.min(canvas.length - 1, canvas.indexOf(Math.round(colour)) + steps))];
  markCanvas(W.data, W.count, 16, 7, shade, c => canvas.includes(Math.round(c)));
  ring = rowsOf(W, false);
}

function write(name, baked) {
  const p = packSplats(baked.data),
    file = name + '.splats.txt',
    round = v => +v.toFixed(5);
  writeFileSync(path.join(out, file), Buffer.from(p.bytes).toString('base64') + '\n');
  console.log(`${name.padEnd(6)}${baked.count} splats, ${((baked.count * BYTES) / 1024).toFixed(0)} KB packed, ${baked.stray} off palette`);
  return { file, count: baked.count, min: p.min.map(round), size: p.size.map(round) };
}
const manifest = { palette: PALETTE, bones: NAMES.length + 1, boxer: write('boxer', boxer), ring: Object.assign(write('ring', ring), RING) };
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
