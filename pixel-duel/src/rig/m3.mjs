// 3x3 matrices as nine numbers by rows, vectors as [x, y, z]. Same layout ink-studio's K.M uses, so the two interchange.
const RAD = Math.PI / 180;
const id = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (A, C) => [
  A[0] * C[0] + A[1] * C[3] + A[2] * C[6], A[0] * C[1] + A[1] * C[4] + A[2] * C[7], A[0] * C[2] + A[1] * C[5] + A[2] * C[8],
  A[3] * C[0] + A[4] * C[3] + A[5] * C[6], A[3] * C[1] + A[4] * C[4] + A[5] * C[7], A[3] * C[2] + A[4] * C[5] + A[5] * C[8],
  A[6] * C[0] + A[7] * C[3] + A[8] * C[6], A[6] * C[1] + A[7] * C[4] + A[8] * C[7], A[6] * C[2] + A[7] * C[5] + A[8] * C[8]
];
const app = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2]
];
const tr = A => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const rx = d => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = d => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = d => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
// Euler degrees [x, y, z]: X is applied first, then Y, then Z, all about the parent's axes.
const euler = e => mul(rz(e[2] || 0), mul(ry(e[1] || 0), rx(e[0] || 0)));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const col = (R, i) => [R[i], R[3 + i], R[6 + i]];
export { RAD, id, mul, app, tr, rx, ry, rz, euler, add, sub, scale, lerp, col };
