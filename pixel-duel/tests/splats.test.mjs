import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, toHalf, fromHalf, BYTES } from '../src/render/splats.mjs';

test('half floats round-trip to within a part in two thousand across the range covariances use', () => {
  for (const v of [0, 1, -1, 0.5, 1024, 3.14159, 1e-3, 0.0007, 123.456, -0.02, 6.1e-5]) {
    const back = fromHalf(toHalf(v));
    assert.ok(Math.abs(back - v) <= Math.abs(v) / 2000 + 1e-7, `${v} came back as ${back}`);
  }
});

test('packed splats come back where they were: positions within a tenth of a millimetre, shapes within 0.1%', () => {
  const n = 500,
    rows = new Float32Array(n * 12);
  let seed = 9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const r = i * 12;
    rows.set([rnd() * 13 - 6.5, rnd() * 5, rnd() * 4 - 3], r);
    for (let k = 0; k < 6; k++) rows[r + 3 + k] = (rnd() - (k === 1 || k === 2 || k === 4 ? 0.5 : 0)) * 0.004 + (k === 0 || k === 3 || k === 5 ? 1e-4 : 0);
    rows[r + 9] = Math.floor(rnd() * 44);
    rows[r + 10] = Math.floor(rnd() * 24);
    rows[r + 11] = 3;
  }
  const packed = pack(rows);
  assert.equal(packed.bytes.length, n * BYTES);
  const back = unpack(packed.bytes, { count: n, min: packed.min, size: packed.size });
  for (let i = 0; i < n; i++) {
    const r = i * 12;
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(back[r + k] - rows[r + k]) < 1.2e-4);
    for (let k = 3; k < 9; k++) assert.ok(Math.abs(back[r + k] - rows[r + k]) <= Math.abs(rows[r + k]) * 1e-3 + 1e-8);
    assert.deepEqual([back[r + 9], back[r + 10], back[r + 11]], [rows[r + 9], rows[r + 10], rows[r + 11]]);
  }
});
