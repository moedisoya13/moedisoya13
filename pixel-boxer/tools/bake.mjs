#!/usr/bin/env node
/* Bakes what the match draws: the boxer in his guard, the ring (its plain canvas and posts, and its ropes apart, so that the
   page can bend them: world/ropes.mjs) and the underground pit (its floor, edge and lamp, and its crowd on the bones of its
   groups: world/pit.mjs), as packed splats the page hands to the graphics card, and the boxer in each thing he may wear
   (rig/boxer.mjs WEAR: the training suit, its hood down and up).
   ink-studio is only needed here; the page ships none of it.
     node tools/bake.mjs          -> assets/boxer.splats.txt, assets/ring.splats.txt, assets/ropes.splats.txt, assets/pit.splats.txt,
                                     assets/crowd.splats.txt, assets/boxer-<wear>.splats.txt, assets/manifest.json
     node tools/bake.mjs --wear   -> the outfits alone: assets/boxer-<wear>.splats.txt, and their entries put into the manifest
                                     as it is (manifest.wear), the rest left as it was baked
     node tools/bake.mjs --world  -> the places alone: the ring, its ropes, the pit and its crowd (manifest.ring, ropes, pit,
                                     crowd), the boxer and his outfits left as they were baked */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { PALETTE, MAT, WEAR, sculptBoxer } from '../src/rig/boxer.mjs';
import { RING, sculptRing, sculptRopes } from '../src/world/ring.mjs';
import { PIT, CROWD, BUDGET, sculptPit, brickOf, floorOf, crowdOf } from '../src/world/pit.mjs';
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

// the boxer in his guard, as he is or in something he wears
function bakeBoxer(wear) {
  const { B, S } = sculptor(3),
    rig = K.creature(B, S);
  for (const name of NAMES) rig.bone(name);
  sculptBoxer(S, fk(guardPose()), { wear });
  S.bake();
  const W = B.finish({});
  rig.bind(W, () => {});
  return rowsOf(W, true);
}
const only = process.argv.includes('--wear'),
  world = process.argv.includes('--world'),
  outfits = Object.keys(WEAR);
let boxer, places;
if (!only && !world) boxer = bakeBoxer();
if (!only) {
  // the ring with its canvas plain (the bake's light and shade on it, nothing marked on it), and its ropes, lit as they are
  const ring = sculptor(5);
  sculptRing(ring.S, { ropes: false });
  ring.S.bake();
  const ropes = sculptor(6);
  sculptRopes(ropes.S);
  ropes.S.bake();
  // the pit under its lamp: the sun let down to a glimmer; the bricks' mortar marked a step of its ramp darker
  const pit = sculptor(7);
  Object.assign(pit.S, { sunK: 0.22, amb: 0.1, sky: 0.12 });
  sculptPit(pit.S);
  pit.S.bake();
  const P = pit.B.finish({}),
    brick = MAT.apron.r.map(i => packed(PALETTE[i]));
  for (let i = 0; i < P.count; i++) {
    const o = i * 16,
      k = brick.indexOf(Math.round(P.data[o + 7]));
    if (k >= 0 && brickOf(P.data[o], P.data[o + 1], P.data[o + 2])) P.data[o + 7] = packed(PALETTE[MAT.canvas.r[0]]);
  }
  const edge = rowsOf(P, false),
    floor = floorOf(),
    crowd = crowdOf(),
    all = new Float32Array(floor.rows.length + edge.data.length);
  all.set(floor.rows);
  all.set(edge.data, floor.rows.length);
  /* (the canvas a step darker all over, its light and shade kept: lit, it is the ramp's third step, so that what the effects
     light on it (render/renderer.mjs: a ring through the canvas a step lighter where it lifts it) has a step to go to) */
  const canvas = rowsOf(ring.B.finish({}), false);
  for (let i = 0; i < canvas.count; i++) {
    const o = i * 12,
      k = MAT.canvas.r.indexOf(canvas.data[o + 9]);
    if (k > 0) canvas.data[o + 9] = MAT.canvas.r[k - 1];
  }
  places = {
    ring: canvas,
    ropes: rowsOf(ropes.B.finish({}), false),
    pit: { data: all, count: floor.count + edge.count, stray: edge.stray },
    crowd: { data: crowd.rows, count: crowd.count, stray: 0, figures: crowd.figures.length }
  };
  console.log(`pit: floor ${floor.count}, edge ${edge.count}, crowd ${crowd.count} (${crowd.figures.length} figures)`);
  if (places.pit.count + places.crowd.count > BUDGET || places.crowd.count > CROWD.budget) throw new Error(`the pit is ${places.pit.count} + ${places.crowd.count} splats: over its budget`);
}

function write(name, baked) {
  const p = packSplats(baked.data),
    file = name + '.splats.txt',
    round = v => +v.toFixed(5);
  writeFileSync(path.join(out, file), Buffer.from(p.bytes).toString('base64') + '\n');
  console.log(`${name.padEnd(19)}${baked.count} splats, ${((baked.count * BYTES) / 1024).toFixed(0)} KB packed, ${baked.stray} off palette`);
  return { file, count: baked.count, min: p.min.map(round), size: p.size.map(round) };
}
const where = path.join(out, 'manifest.json'),
  manifest = only || world ? JSON.parse(readFileSync(where, 'utf8')) : { palette: PALETTE, bones: NAMES.length + 1, boxer: write('boxer', boxer) };
// (an outfit's splats, and the places', name the palette's slots: it must be the palette the manifest was baked with)
if (JSON.stringify(manifest.palette) !== JSON.stringify(PALETTE) || manifest.bones !== NAMES.length + 1) throw new Error('assets/manifest.json was baked with another palette or skeleton: bake everything');
if (places) {
  manifest.ring = Object.assign(write('ring', places.ring), RING);
  manifest.ropes = write('ropes', places.ropes);
  manifest.pit = Object.assign(write('pit', places.pit), { edge: PIT.edge, budget: BUDGET });
  manifest.crowd = Object.assign(write('crowd', places.crowd), { figures: places.crowd.figures, groups: CROWD.groups.length, sectors: CROWD.sectors });
}
if (!world) manifest.wear = Object.fromEntries(outfits.map(wear => [wear, write('boxer-' + wear, bakeBoxer(wear))]));
// (the entries in the order they have always been in, the new ones after)
const order = ['palette', 'bones', 'boxer', 'ring', 'wear', 'ropes', 'pit', 'crowd'];
writeFileSync(where, JSON.stringify(Object.fromEntries(order.filter(k => k in manifest).map(k => [k, manifest[k]])), null, 2) + '\n');
