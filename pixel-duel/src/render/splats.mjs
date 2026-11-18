/* How baked splats travel: packed small, then written as base64 text, so any static host (and any that only serves text and
   images) can carry them, compressed on the wire like every other text file.
   A splat is 22 bytes, little-endian:
     position   3 x uint16   across the mesh's bounding box (a fighter: 0.03 mm steps; the courtyard: 0.2 mm)
     shape      6 x float16  the covariance c00 c01 c02 c11 c12 c22, times COV_SCALE so the small values keep their precision
     palette, bone, density x 8, 0      one byte each
   pack() is used by tools/bake.mjs and unpack() by the page; both deal in rows of twelve floats
   (x y z, c00 c01 c02, c11 c12 c22, palette, bone, density), which is what the renderer draws from. */
export const BYTES = 22;
export const COV_SCALE = 1024;

const f32 = new Float32Array(1),
  u32 = new Uint32Array(f32.buffer);
export function toHalf(value) {
  f32[0] = value;
  const x = u32[0],
    sign = (x >>> 16) & 0x8000,
    exp = ((x >>> 23) & 0xff) - 127 + 15,
    frac = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign; // too small: zero
    const m = (frac | 0x800000) >> (1 - exp);
    return sign | ((m + 0x1000) >> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  const half = sign | (exp << 10) | (frac >> 13);
  return frac & 0x1000 ? half + 1 : half; // round to nearest; a carry into the exponent is still the right number
}
export function fromHalf(h) {
  const sign = h & 0x8000 ? -1 : 1,
    exp = (h >> 10) & 0x1f,
    frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

/* rows: Float32Array, twelve floats a splat -> { bytes: Uint8Array, min, size } */
export function pack(rows) {
  const n = rows.length / 12,
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], rows[i * 12 + k]);
      max[k] = Math.max(max[k], rows[i * 12 + k]);
    }
  const size = max.map((v, k) => Math.max(1e-6, v - min[k])),
    bytes = new Uint8Array(n * BYTES),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) {
    const r = i * 12,
      o = i * BYTES;
    for (let k = 0; k < 3; k++) view.setUint16(o + k * 2, Math.round(((rows[r + k] - min[k]) / size[k]) * 65535), true);
    for (let k = 0; k < 6; k++) view.setUint16(o + 6 + k * 2, toHalf(rows[r + 3 + k] * COV_SCALE), true);
    bytes[o + 18] = rows[r + 9];
    bytes[o + 19] = rows[r + 10];
    bytes[o + 20] = Math.min(255, Math.round(rows[r + 11] * 8));
  }
  return { bytes, min, size };
}
/* bytes: Uint8Array as packed; meta: { count, min, size } -> Float32Array of rows */
export function unpack(bytes, meta) {
  const n = meta.count,
    rows = new Float32Array(n * 12),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < n * BYTES) throw new Error(`Splat data is ${bytes.byteLength} bytes, expected ${n * BYTES}`);
  for (let i = 0; i < n; i++) {
    const r = i * 12,
      o = i * BYTES;
    for (let k = 0; k < 3; k++) rows[r + k] = meta.min[k] + (view.getUint16(o + k * 2, true) / 65535) * meta.size[k];
    for (let k = 0; k < 6; k++) rows[r + 3 + k] = fromHalf(view.getUint16(o + 6 + k * 2, true)) / COV_SCALE;
    rows[r + 9] = bytes[o + 18];
    rows[r + 10] = bytes[o + 19];
    rows[r + 11] = bytes[o + 20] / 8;
  }
  return rows;
}
export function fromBase64(text) {
  const raw = atob(text.trim()),
    bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
