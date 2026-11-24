/* What the boxer may wear (rig/boxer.mjs WEAR, sculptBoxer's o.wear: the training suit, its hood down and up), baked by
   tools/bake.mjs --wear into assets/boxer-<wear>.splats.txt and manifest.wear. A look only: each outfit is held to unpacking
   whole, to every splat riding a real joint and naming a slot of the palette, to its cloth being the ramp the suit's colours
   are put in place of, and to not outgrowing the bare fighter; the bare fighter is held to being sculpted as he was, and the
   committed boxer and ring assets to being the bytes they were (the pending catalogue's recorded clips draw them). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PALETTE, RIVAL, WEAR, RIVAL_WEAR, MAT, dress, sculptBoxer } from '../src/rig/boxer.mjs';
import { unpack, fromBase64, BYTES } from '../src/render/splats.mjs';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { guardPose } from '../src/anim/animator.mjs';

const asset = name => readFileSync(new URL('../assets/' + name, import.meta.url));
const manifest = JSON.parse(asset('manifest.json'));
const OUTFITS = ['training', 'training-up'];
const CLOTH = MAT.cloth.r; // the trunks' ramp, which the suit hides
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meshOf = wear => {
  const part = manifest.wear[wear],
    bytes = fromBase64(asset(part.file).toString('utf8'));
  return { part, bytes, rows: unpack(bytes, part) };
};

/* The solids a sculpt is made of, without the sculpting kit: each as it was asked for (the kind, its numbers to a millionth,
   its ramp, the joint carrying it, whole, its spacing and its frame) and its box in the world (a ball: the ellipsoid's, turned
   by its frame; a tube: its points, as thick as its thickest; a ring: in its frame's flat; a cut: the solid cut from). Solids
   made only to be joined (hold) are not drawn and not listed. */
function solidsOf(bind, o) {
  const r6 = v => (Array.isArray(v) ? v.map(r6) : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v),
    I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    list = [];
  const note = (kind, extent) => (...a) => {
    const o = a[a.length - 1] || {},
      ext = extent(...a),
      s = { said: [kind, ...a.slice(0, -2).map(r6), a[a.length - 2].r, o.tag, !!o.whole, o.res, o.ax ? r6(o.ax) : null], lo: ext[0], hi: ext[1], tag: o.tag };
    if (!o.hold) list.push(s);
    return s;
  };
  const around = (c, h) => [c.map((v, k) => v - h[k]), c.map((v, k) => v + h[k])];
  const S = {
    ball: note('ball', (c, r, mat, o) => {
      const rr = r.length ? r : [r, r, r],
        ax = o.ax || I;
      return around(c, [0, 1, 2].map(k => Math.hypot(rr[0] * ax[0][k], rr[1] * ax[1][k], rr[2] * ax[2][k])));
    }),
    tube: note('tube', (pts, r0, r1) => {
      const r = Math.max(r0, r1);
      return [[0, 1, 2].map(k => Math.min(...pts.map(p => p[k])) - r), [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) + r)];
    }),
    torus: note('torus', (c, R, r, mat, o) => {
      const ax = o.ax || I;
      return around(c, [0, 1, 2].map(k => R * Math.hypot(ax[0][k], ax[2][k]) + r));
    }),
    join: (kind, a, b, o) => {
      const s = { said: ['join', kind, a.said, b.said, o.tag], lo: a.lo, hi: a.hi, tag: o.tag };
      list.push(s);
      return s;
    }
  };
  sculptBoxer(S, bind, o);
  return list;
}
const boxOf = list => [[0, 1, 2].map(k => Math.min(...list.map(s => s.lo[k]))), [0, 1, 2].map(k => Math.max(...list.map(s => s.hi[k])))];

test('the two outfits are baked, each in its file, and unpack whole', () => {
  assert.deepEqual(Object.keys(manifest.wear).sort(), [...OUTFITS].sort());
  assert.deepEqual(Object.keys(WEAR).sort(), [...OUTFITS].sort(), 'an outfit for every colouring, and a colouring for every outfit');
  for (const wear of OUTFITS) {
    const { part, bytes, rows } = meshOf(wear);
    assert.equal(part.file, `boxer-${wear}.splats.txt`);
    assert.equal(bytes.byteLength, part.count * BYTES, `${wear}: ${part.count} splats of ${BYTES} bytes`);
    assert.ok(part.count > 8000 && part.count < 14000, `${wear}: ${part.count} splats, about as many as the bare boxer's ${manifest.boxer.count}`);
    assert.equal(rows.length, part.count * 12);
    assert.ok(rows.every(Number.isFinite), `${wear}: every number of every splat is a number`);
  }
});

test("every splat of an outfit rides a real joint and names a slot of the palette", () => {
  assert.equal(manifest.bones, NAMES.length + 1);
  assert.deepEqual(manifest.palette, PALETTE, 'the palette the outfits were baked with is the palette');
  for (const wear of OUTFITS) {
    const { rows, part } = meshOf(wear),
      bones = new Set();
    for (let i = 0; i < part.count; i++) {
      const pal = rows[i * 12 + 9],
        bone = rows[i * 12 + 10];
      assert.ok(Number.isInteger(pal) && pal >= 1 && pal < PALETTE.length, `${wear} splat ${i}: palette ${pal}`);
      // (bone 0 is the one that never moves, behind the joints: render/renderer.mjs packBones)
      assert.ok(Number.isInteger(bone) && bone >= 1 && bone < manifest.bones, `${wear} splat ${i}: bone ${bone}`);
      bones.add(bone);
    }
    assert.equal(bones.size, NAMES.length, `${wear}: every joint carries something`);
  }
});

test("the suit is sculpted in the trunks' ramp and drawn grey by putting its colours in that ramp's place: no new slot", () => {
  assert.equal(PALETTE.length, 44, 'no slot of the palette spent on the suit');
  const grey = hex => {
    const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    return Math.max(...c) - Math.min(...c) <= 16;
  };
  const luma = hex => 0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255);
  for (const wear of OUTFITS)
    for (const [corner, table] of [[0, WEAR], [1, RIVAL_WEAR]]) {
      assert.deepEqual(Object.keys(table[wear]).map(Number), CLOTH, `${wear}, corner ${corner}: the cloth's ramp is what is recoloured, and nothing else`);
      const drawn = dress(PALETTE, corner, wear);
      assert.equal(drawn.length, PALETTE.length);
      CLOTH.forEach((i, k) => {
        assert.ok(grey(drawn[i]), `${wear}, corner ${corner}: slot ${i} is a grey (${drawn[i].toString(16)})`);
        if (k) assert.ok(luma(drawn[i]) > luma(drawn[CLOTH[k - 1]]) + 20, `${wear}, corner ${corner}: the ramp goes dark to light`);
      });
      // (the rest is the corner's own: the other corner's skin, gloves and trim, his streak's colours, the ring's)
      for (let i = 0; i < PALETTE.length; i++) if (!CLOTH.includes(i)) assert.equal(drawn[i], corner ? (RIVAL[i] ?? PALETTE[i]) : PALETTE[i], `${wear}, corner ${corner}: slot ${i} is his own`);
    }
  // as he is, a corner is drawn as before
  assert.deepEqual(dress(PALETTE, 0), PALETTE);
  assert.deepEqual(dress(PALETTE, 1), PALETTE.map((hex, i) => RIVAL[i] ?? hex));
  assert.deepEqual(dress(PALETTE, 1, ''), dress(PALETTE, 1));
  // the two corners' suits are told apart
  assert.notDeepEqual(WEAR.training, RIVAL_WEAR.training);
  // the cloth is most of what the suit shows, and every splat in the trunks' ramp is cloth the override recolours
  for (const wear of OUTFITS) {
    const { rows, part } = meshOf(wear);
    let cloth = 0;
    for (let i = 0; i < part.count; i++) if (CLOTH.includes(rows[i * 12 + 9])) cloth++;
    assert.ok(cloth / part.count > 0.6, `${wear}: ${((100 * cloth) / part.count).toFixed(0)}% of it is the suit's cloth`);
  }
});

test('a dressed fighter does not outgrow the bare one: his box within 3 cm of the bare box on every side, in the guard', () => {
  const bind = fk(guardPose()),
    [lo, hi] = boxOf(solidsOf(bind));
  for (const wear of OUTFITS) {
    const [dlo, dhi] = boxOf(solidsOf(bind, { wear }));
    for (let k = 0; k < 3; k++) {
      assert.ok(lo[k] - dlo[k] <= 0.03, `${wear}: ${'xyz'[k]} reaches ${((lo[k] - dlo[k]) * 100).toFixed(1)} cm past the bare boxer's low side`);
      assert.ok(dhi[k] - hi[k] <= 0.03, `${wear}: ${'xyz'[k]} reaches ${((dhi[k] - hi[k]) * 100).toFixed(1)} cm past the bare boxer's high side`);
    }
  }
});

test('each solid of an outfit is carried by one joint, a joint of the skeleton', () => {
  for (const wear of OUTFITS) for (const s of solidsOf(fk(guardPose()), { wear })) assert.ok(NAMES.includes(s.tag), `${wear}: ${JSON.stringify(s.said).slice(0, 60)} carried by ${s.tag}`);
});

test('without wear the boxer is sculpted as he was, solid for solid', () => {
  // the solids sculptBoxer asked for before there were outfits (at the T-pose, so that a change of guard does not move them):
  // their list, digested
  const list = solidsOf(fk({})).map(s => s.said);
  assert.equal(list.length, 37);
  assert.equal(sha(JSON.stringify(list)), 'a6dd791f6fdd7e66184cd562f7b743e78c5770e9681a81c70a47f89ea4e0174e');
});

test('the committed boxer and ring are the bytes they were', () => {
  assert.equal(manifest.boxer.count, 8657);
  assert.equal(manifest.ring.count, 23997);
  assert.equal(sha(asset('boxer.splats.txt')), 'd2f0d0fa5d1567667aafe82de04a76b768699a3bd2ba2176f780ae63fed5abee');
  assert.equal(sha(asset('ring.splats.txt')), '4457724a341d03725940c03efd9de1fbd5be25cfc4ff4dde5af53f069f97fc06');
});
