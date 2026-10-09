// ─────────────────────────────────────────────────────────────
// Screen: low-res pixel buffer upscaled by an integer factor onto the
// device-resolution canvas. Hi-res overlays (title cards, comic scene)
// draw straight onto the device canvas afterwards.
// ─────────────────────────────────────────────────────────────

const Screen = { app: null, cv: null, ctx: null, lo: null, W: 196, H: 400, S: 2, dpr: 1, pw: 0, ph: 0, cssW: 0, cssH: 0 };
let L = null; // low-res 2D context — every pixel primitive draws here

function setupScreen() {
  Screen.app = document.getElementById('app');
  Screen.cv = document.getElementById('cv');
  Screen.ctx = Screen.cv.getContext('2d', { alpha: false });
  Screen.lo = document.createElement('canvas');
  L = Screen.lo.getContext('2d');
  resizeScreen();
  window.addEventListener('resize', resizeScreen);
  window.addEventListener('orientationchange', () => setTimeout(resizeScreen, 120));
}

function resizeScreen() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = Screen.app.getBoundingClientRect();
  const cw = Math.max(1, Math.round(r.width)), ch = Math.max(1, Math.round(r.height));
  const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
  const S = Math.max(1, Math.round(pw / CFG.TARGET_W));
  Screen.dpr = dpr; Screen.cssW = cw; Screen.cssH = ch; Screen.pw = pw; Screen.ph = ph; Screen.S = S;
  Screen.W = Math.ceil(pw / S); Screen.H = Math.ceil(ph / S);
  Screen.cv.width = pw; Screen.cv.height = ph;
  Screen.lo.width = Screen.W; Screen.lo.height = Screen.H;
  L.imageSmoothingEnabled = false;
  if (typeof onScreenResized === 'function') onScreenResized();
}

// Upscale the low-res frame. zoom>1 crops around (zx,zy) for the close-up.
function presentFrame(shakeX = 0, shakeY = 0, zoom = 1, zx = 0, zy = 0) {
  const ctx = Screen.ctx, S = Screen.S;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (zoom <= 1.0001) {
    ctx.drawImage(Screen.lo, Math.round(shakeX) * S, Math.round(shakeY) * S, Screen.W * S, Screen.H * S);
  } else {
    const sw = Screen.W / zoom, sh = Screen.H / zoom;
    const sx = clamp(zx - sw / 2, 0, Screen.W - sw), sy = clamp(zy - sh / 2, 0, Screen.H - sh);
    ctx.fillStyle = C.void; ctx.fillRect(0, 0, Screen.pw, Screen.ph);
    ctx.drawImage(Screen.lo, sx, sy, sw, sh, 0, 0, Screen.W * S, Screen.H * S);
  }
}

// ── pixel primitives (low-res) ──────────────────────────────
function rect(x, y, w, h, c) { L.fillStyle = c; L.fillRect(Math.round(x), Math.round(y), w, h); }
function px(x, y, c) { L.fillStyle = c; L.fillRect(Math.round(x), Math.round(y), 1, 1); }

function disc(cx, cy, r, c) {
  L.fillStyle = c;
  if (r < 0.75) { L.fillRect(Math.round(cx - 0.5), Math.round(cy - 0.5), 1, 1); return; }
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - cy;
    if (dy * dy > r * r) continue;
    const half = Math.sqrt(r * r - dy * dy);
    const x0 = Math.ceil(cx - half - 0.5), x1 = Math.floor(cx + half - 0.5);
    if (x1 >= x0) L.fillRect(x0, py, x1 - x0 + 1, 1);
  }
}

// Rotated filled ellipse via exact per-row spans (crisp, no AA)
function ellipse(cx, cy, rx, ry, ang, c) {
  L.fillStyle = c;
  if (rx < 0.6 && ry < 0.6) { L.fillRect(Math.round(cx - 0.5), Math.round(cy - 0.5), 1, 1); return; }
  const co = Math.cos(ang), si = Math.sin(ang);
  const irx = 1 / (rx * rx), iry = 1 / (ry * ry);
  const A = co * co * irx + si * si * iry;
  const Bk = 2 * co * si * (irx - iry);
  const Ck = si * si * irx + co * co * iry;
  const ext = Math.max(rx, ry) + 1;
  const y0 = Math.floor(cy - ext), y1 = Math.ceil(cy + ext);
  for (let py = y0; py <= y1; py++) {
    const y = py + 0.5 - cy;
    const B = Bk * y, Cc = Ck * y * y - 1;
    const disc2 = B * B - 4 * A * Cc;
    if (disc2 < 0) continue;
    const sq = Math.sqrt(disc2);
    const xa = (-B - sq) / (2 * A), xb = (-B + sq) / (2 * A);
    const x0 = Math.ceil(cx + xa - 0.5), x1 = Math.floor(cx + xb - 0.5);
    if (x1 >= x0) L.fillRect(x0, py, x1 - x0 + 1, 1);
  }
}

function line(x0, y0, x1, y1, c) {
  L.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, guard = 0;
  for (;;) {
    L.fillRect(x0, y0, 1, 1);
    if ((x0 === x1 && y0 === y1) || guard++ > 2000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function thickLine(x0, y0, x1, y1, w, c) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 0.8));
  const r = w / 2;
  for (let i = 0; i <= n; i++) { const t = i / n; disc(lerp(x0, x1, t), lerp(y0, y1, t), r, c); }
}

// Scanline polygon fill (flat [x0,y0,x1,y1,...]), even-odd
function poly(pts, c) {
  L.fillStyle = c;
  const n = pts.length / 2;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minY = Math.min(minY, pts[i * 2 + 1]); maxY = Math.max(maxY, pts[i * 2 + 1]); }
  const xs = [];
  for (let py = Math.floor(minY); py <= Math.ceil(maxY); py++) {
    const y = py + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const j = (i + 1) % n, bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(xs[k] - 0.5), x1 = Math.floor(xs[k + 1] - 0.5);
      if (x1 >= x0) L.fillRect(x0, py, x1 - x0 + 1, 1);
    }
  }
}

function ring(cx, cy, r, c, frac = 1, start = -Math.PI / 2) {
  L.fillStyle = c;
  const n = Math.max(12, Math.ceil(r * 7 * frac));
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * TAU * frac;
    const x = Math.round(cx + Math.cos(a) * r - 0.5), y = Math.round(cy + Math.sin(a) * r - 0.5);
    if (x !== lx || y !== ly) { L.fillRect(x, y, 1, 1); lx = x; ly = y; }
  }
}

// ── pixel text ─────────────────────────────────────────────
function textW3(str, s = 1) { return str.length ? (str.length * 4 - 1) * s : 0; }
function text3(str, x, y, c, s = 1, align = 'left') {
  str = String(str).toUpperCase();
  const w = textW3(str, s);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  L.fillStyle = c;
  for (const ch of str) {
    const g = FONT3[ch] || FONT3[ch.toLowerCase()] || FONT3[' '];
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') L.fillRect(cx + q * s, y + r * s, s, s);
    cx += 4 * s;
  }
  return w;
}
function text5(ch, x, y, c) {
  const g = FONT5[ch];
  if (!g) return;
  L.fillStyle = c;
  for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q] === '#') L.fillRect(Math.round(x) + q, Math.round(y) + r, 1, 1);
}

// hash noise for deterministic texturing
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// shade a hex colour (k<1 darker, >1 lighter)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255), b = clamp(Math.round((n & 255) * k), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
