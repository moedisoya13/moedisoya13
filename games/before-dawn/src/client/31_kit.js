// Low-poly facet kit (browser only): the small set of inked, two-tone solids every stage drawing
// is built from — boxes (with taper/bevel), n-gon prisms, crystal shards, black spikes, rocks,
// contact shadows, halftone and uneven ink — plus a pixel-density-aware sprite cache.
//
// One light for the whole stage (docs/prior/art-direction.md §3): from the screen's left and
// above. In world terms it comes from (−x, +y): a solid's +y face (screen lower-left) is lit,
// its +x face (screen lower-right) is the shadow face, tops are lit, and cast shadows fall to the
// screen right (world (+1, −1)). Two tones per surface: the lit tone and one ink-cool shadow tone
// with a light halftone. Outlines are ink: heavy on the silhouette and the ground line, light on
// inner edges, so weights are uneven like a brush.
//
//   KIT.pal(base)            → {top, left, right}  (lit, lit side, shadow side) from one colour
//   KIT.box(g, P, x, y, dw, dh, z0, z1, pal, o)   o: {taper u, ink false, lw, dots false}
//   KIT.bevelBox(g, P, x, y, dw, dh, z0, z1, pal, bevel u)   a box with a chamfered top
//   KIT.prismN(g, P, cx, cy, r, n, z0, z1, pal, o) o: {rot, taper (0..1), lw}
//   KIT.shard(g, x, y, h, w, lean, pal, o)        crystal on the ground at screen (x, y)
//   KIT.spike(g, x, y, h, w, lean, o)             black demon-castle spike
//   KIT.rock(g, x, y, r, rng, pal)                faceted rubble stone
//   KIT.shadowBox(g, P, x, y, dw, dh, hpx, a)     cast shadow of a box on the floor
//   KIT.halftone(g, alpha)                        fills the current path with ink dots
//   KIT.sprite(key, x0, y0, x1, y1, draw) / KIT.blit(g, sp, x, y, alpha)   cached canvases at KIT.s
// P is a projection (wx, wy, zpx) → [sx, sy]: view.proj, a map view's proj, or a local one.

const U = BD.ui;
const R = BD.client.render;
const KIT = R.kit = { s: 1 };
const INK = U.INK;
const COOL = [27, 30, 46]; // the shadow tone leans to this ink blue

function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function hex(r, g, b) { return '#' + ((1 << 24) | (cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).slice(1); }
KIT.rgb = rgb; KIT.hex = hex;
const memo = new Map();
KIT.mul = function (h, f) { const k = h + '*' + f; let v = memo.get(k); if (!v) { const c = rgb(h); v = hex(c[0] * f, c[1] * f, c[2] * f); memo.set(k, v); } return v; };
KIT.mix = function (a, b, t) { const k = a + '~' + b + '~' + t; let v = memo.get(k); if (!v) { const x = rgb(a), y = rgb(b); v = hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); memo.set(k, v); } return v; };
KIT.rgba = function (h, a) { const c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
// lit top, lit side a step darker, shadow side: dark and cool
KIT.pal = function (base, o) {
  o = o || {};
  const k = 'pal:' + base + ':' + (o.side || 0.84) + ':' + (o.dark || 0.46);
  let p = memo.get(k);
  if (!p) {
    const c = rgb(base), d = o.dark || 0.46;
    p = { top: base, left: KIT.mul(base, o.side || 0.84), right: hex(c[0] * d * 0.75 + COOL[0] * 0.25, c[1] * d * 0.75 + COOL[1] * 0.25, c[2] * d * 0.75 + COOL[2] * 0.25) };
    memo.set(k, p);
  }
  return p;
};

// ---- paths, ink ---------------------------------------------------------------------------------
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
KIT.poly = poly;
function line(g, pts, lw, color) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.lineWidth = lw; g.strokeStyle = color || INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
}
KIT.line = line;
function ink(g, lw) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
KIT.ink = ink;
function fill(g, pts, c) { poly(g, pts); g.fillStyle = c; g.fill(); }
KIT.fill = fill;
// a brush stroke a→b: swells to w in the middle, ends at w·end (uneven ink)
KIT.brush = function (g, a, b, w, end, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, e = (end === undefined ? 0.35 : end) * w / 2, m = w / 2;
  g.beginPath();
  g.moveTo(a[0] + nx * e, a[1] + ny * e);
  g.quadraticCurveTo((a[0] + b[0]) / 2 + nx * m * 2, (a[1] + b[1]) / 2 + ny * m * 2, b[0] + nx * e, b[1] + ny * e);
  g.lineTo(b[0] - nx * e, b[1] - ny * e);
  g.quadraticCurveTo((a[0] + b[0]) / 2 - nx * m * 2, (a[1] + b[1]) / 2 - ny * m * 2, a[0] - nx * e, a[1] - ny * e);
  g.closePath(); g.fillStyle = color || INK; g.fill();
};

// ---- halftone ---------------------------------------------------------------------------------
// ink dots on a 5 px grid (staggered), drawn at 3× and scaled into user space so they stay round
const dotPat = {};
KIT.dots = function (g, size, color) {
  size = size || 5; color = color || INK;
  const k = size + color;
  if (dotPat[k] !== undefined) return dotPat[k];
  const S = 3, c = document.createElement('canvas'); c.width = c.height = size * 2 * S;
  const h = c.getContext('2d'); h.fillStyle = color;
  const r = size * 0.24 * S;
  for (const [x, y] of [[0.5, 0.5], [1.5, 1.5]]) { h.beginPath(); h.arc(x * size * S, y * size * S, r, 0, 6.2832); h.fill(); }
  let p = g.createPattern(c, 'repeat');
  try { p.setTransform(new DOMMatrix().scale(1 / S)); } catch (e) { p = null; } // no setTransform: no dots
  return (dotPat[k] = p);
};
// fill the current path with dots at alpha (the shadow-face and cast-shadow screen)
KIT.halftone = function (g, alpha, size) {
  const p = KIT.dots(g, size);
  if (!p) return;
  const a = g.globalAlpha; g.globalAlpha = a * (alpha === undefined ? 0.22 : alpha); g.fillStyle = p; g.fill(); g.globalAlpha = a;
};

// ---- solids -----------------------------------------------------------------------------------
// Inked box over world rect (x, y, dw, dh) from z0 to z1 px; taper insets the top by that many u.
KIT.box = function (g, P, x, y, dw, dh, z0, z1, pal, o) {
  o = o || {};
  const t = o.taper || 0, lw = o.lw || 2.2;
  const A0 = P(x, y + dh, z0), B0 = P(x + dw, y + dh, z0), C0 = P(x + dw, y, z0);
  const A1 = P(x + t, y + dh - t, z1), B1 = P(x + dw - t, y + dh - t, z1), C1 = P(x + dw - t, y + t, z1), D1 = P(x + t, y + t, z1);
  fill(g, [A0, B0, B1, A1], pal.left);
  poly(g, [B0, C0, C1, B1]); g.fillStyle = pal.right; g.fill();
  if (o.dots !== false && z1 - z0 > 6) KIT.halftone(g, 0.18);
  fill(g, [A1, B1, C1, D1], pal.top);
  if (o.ink === false) return;
  poly(g, [A0, B0, C0, C1, D1, A1]); ink(g, lw);
  line(g, [A1, B1, C1], lw * 0.55);
  line(g, [B1, B0], lw * 0.55);
  line(g, [A0, B0, C0], lw * 1.45); // ground line: the heaviest
};
// box with a chamfered (faceted) top edge of `bevel` u — reads as cut stone / moulded plastic
KIT.bevelBox = function (g, P, x, y, dw, dh, z0, z1, pal, bevel, o) {
  const bz = Math.min((z1 - z0) * 0.45, bevel * 40);
  KIT.box(g, P, x, y, dw, dh, z0, z1 - bz, pal, o);
  KIT.box(g, P, x, y, dw, dh, z1 - bz, z1, { top: pal.top, left: KIT.mix(pal.left, pal.top, 0.45), right: KIT.mix(pal.right, pal.left, 0.35) }, Object.assign({ taper: bevel, dots: false }, o || {}));
};
// n-gon prism (pillars, tanks, planters, basins) centred at (cx, cy), radius r u
KIT.prismN = function (g, P, cx, cy, r, n, z0, z1, pal, o) {
  o = o || {};
  const rot = o.rot === undefined ? Math.PI / n : o.rot, rt = r * (1 - (o.taper || 0)), lw = o.lw || 2;
  const b = [], t = [], nrm = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    b.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0));
    t.push(P(cx + Math.cos(a) * rt, cy + Math.sin(a) * rt, z1));
    const am = a + Math.PI / n; nrm.push([Math.cos(am), Math.sin(am)]);
  }
  const vis = [];
  for (let i = 0; i < n; i++) {
    const [nx, ny] = nrm[i];
    if (nx + ny <= 0.02) continue; // faces away from the camera
    const j = (i + 1) % n, lit = -nx + ny; // light from (−x, +y)
    fill(g, [b[i], b[j], t[j], t[i]], lit > 0.25 ? pal.left : lit > -0.45 ? KIT.mix(pal.left, pal.right, 0.5) : pal.right);
    if (lit <= -0.45 && z1 - z0 > 6) { poly(g, [b[i], b[j], t[j], t[i]]); KIT.halftone(g, 0.16); }
    vis.push(i);
  }
  fill(g, t, pal.top);
  if (o.ink === false) return;
  for (const i of vis) { const j = (i + 1) % n; line(g, [t[i], b[i]], lw * 0.5); line(g, [b[i], b[j]], lw * 1.4); line(g, [t[j], b[j]], lw * 0.5); }
  poly(g, t); ink(g, lw);
  // outermost verticals heavier (the silhouette)
  if (vis.length) { const f = vis[0], l = (vis[vis.length - 1] + 1) % n; line(g, [t[f], b[f]], lw); line(g, [t[l], b[l]], lw); }
};

// ---- growths and rubble (screen space; base on the ground at (x, y)) -----------------------------
const CRYSTAL = { top: '#b98cff', left: '#8a4fd0', right: '#3d1f73', glint: '#e7d6ff' };
KIT.CRYSTAL = CRYSTAL;
// a faceted crystal shard: two facets split by a ridge, a glint sliver, heavy ink
KIT.shard = function (g, x, y, h, w, lean, pal, o) {
  pal = pal || CRYSTAL; o = o || {};
  const tip = [x + lean, y - h], l = [x - w, y - h * 0.22], r = [x + w * 0.95, y - h * 0.3];
  const bl = [x - w * 0.6, y + w * 0.18], br = [x + w * 0.55, y + w * 0.2], bm = [x + w * 0.12, y + w * 0.32];
  const ridge = [x + lean * 0.35 + w * 0.08, y - h * 0.62];
  fill(g, [bl, l, ridge, bm], pal.left);
  fill(g, [l, tip, ridge], pal.top);
  fill(g, [bm, ridge, tip, r, br], pal.right);
  poly(g, [bm, ridge, tip, r, br]); KIT.halftone(g, 0.2);
  fill(g, [[l[0] + w * 0.25, l[1] - h * 0.05], [tip[0] - w * 0.08, tip[1] + h * 0.12], [ridge[0] - w * 0.18, ridge[1] + h * 0.02]], pal.glint || '#ffffff');
  poly(g, [bl, l, tip, r, br, bm]); ink(g, o.lw || 2.2);
  line(g, [l, ridge, bm], 1); line(g, [ridge, tip], 1);
};
const SPIKE = { lit: '#3b3549', dark: '#0f0d14', glint: '#6a6283' };
KIT.SPIKE = SPIKE;
// a black spike, slightly curved: lit facet, ink facet, a cold glint along the ridge
KIT.spike = function (g, x, y, h, w, lean, o) {
  o = o || {};
  const pal = o.pal || SPIKE, tip = [x + lean, y - h], bend = [x + lean * 0.25 + w * 0.15, y - h * 0.55];
  const bl = [x - w, y + w * 0.15], br = [x + w, y + w * 0.1], bm = [x + w * 0.15, y + w * 0.35];
  g.beginPath(); g.moveTo(bl[0], bl[1]); g.quadraticCurveTo(bend[0] - w * 0.9, bend[1], tip[0], tip[1]); g.lineTo(bm[0], bm[1]); g.closePath(); g.fillStyle = pal.lit; g.fill();
  g.beginPath(); g.moveTo(bm[0], bm[1]); g.lineTo(tip[0], tip[1]); g.quadraticCurveTo(bend[0] + w * 0.9, bend[1], br[0], br[1]); g.closePath(); g.fillStyle = pal.dark; g.fill();
  line(g, [[bm[0] - w * 0.15, bm[1] - h * 0.12], [tip[0] - (tip[0] - bm[0]) * 0.18, tip[1] + h * 0.1]], 1.2, pal.glint);
  g.beginPath(); g.moveTo(bl[0], bl[1]); g.quadraticCurveTo(bend[0] - w * 0.9, bend[1], tip[0], tip[1]); g.quadraticCurveTo(bend[0] + w * 0.9, bend[1], br[0], br[1]); g.lineTo(bm[0], bm[1]); g.closePath();
  ink(g, o.lw || 2);
};
// faceted rubble stone (lit top facet, shadow skirt)
KIT.rock = function (g, x, y, r, rng, pal) {
  pal = pal || KIT.pal('#8d8f9a');
  const n = 6, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + rng.range(-0.3, 0.3), rr = r * rng.range(0.75, 1.15); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.55]); }
  const top = pts.map((p) => [p[0] - r * 0.08, p[1] - r * 0.45]);
  fill(g, pts, pal.right);
  fill(g, top, pal.top);
  poly(g, [pts[0], pts[1], pts[2], top[2], top[1], top[0]]); g.fillStyle = pal.left; g.fill();
  const hull = pts.concat(top);
  hull.sort((a, b) => a[0] - b[0]);
  poly(g, convex(hull)); ink(g, 1.3);
};
// monotone-chain convex hull of [x, y] points
function convex(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
KIT.convex = convex;

// ---- cast shadows (on the floor; drawn into the static layer) -----------------------------------
const SH = { k: 0.011, dx: 1, dy: -0.55 }; // shadow length u per px of height, world direction
KIT.SH = SH;
KIT.shadowBox = function (g, P, x, y, dw, dh, hpx, alpha) {
  const L = hpx * SH.k, ox = SH.dx * L, oy = SH.dy * L;
  const pts = [];
  for (const [px, py] of [[x, y], [x + dw, y], [x + dw, y + dh], [x, y + dh]]) { pts.push(P(px, py)); pts.push(P(px + ox, py + oy)); }
  poly(g, convex(pts));
  g.fillStyle = 'rgba(10,10,12,' + (alpha === undefined ? 0.2 : alpha) + ')'; g.fill();
  KIT.halftone(g, 0.3);
};
KIT.shadowDisc = function (g, P, cx, cy, r, hpx, alpha) {
  const L = hpx * SH.k, pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.2832; pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); pts.push(P(cx + Math.cos(a) * r + SH.dx * L, cy + Math.sin(a) * r + SH.dy * L)); }
  poly(g, convex(pts));
  g.fillStyle = 'rgba(10,10,12,' + (alpha === undefined ? 0.2 : alpha) + ')'; g.fill();
  KIT.halftone(g, 0.3);
};

// ---- sprite cache ---------------------------------------------------------------------------------
// Canvases at the current pixel density KIT.s (set by the renderer each frame), LRU-bounded by
// device pixels (12 M px ≈ 48 MB; what one screen of a busy floor uses is ~3–7 M px at scale 2).
const cache = new Map();
KIT.MAX_PX = 12e6;
let cachePx = 0;
KIT.sprite = function (key, x0, y0, x1, y1, draw) {
  const k = key + '@' + KIT.s;
  let sp = cache.get(k);
  if (sp) { cache.delete(k); cache.set(k, sp); return sp; }
  const s = KIT.s, cv = document.createElement('canvas');
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  cv.width = Math.max(1, Math.ceil((x1 - x0) * s)); cv.height = Math.max(1, Math.ceil((y1 - y0) * s));
  const g = cv.getContext('2d');
  g.scale(cv.width / (x1 - x0), cv.height / (y1 - y0)); g.translate(-x0, -y0);
  draw(g);
  sp = { cv, x0, y0, w: x1 - x0, h: y1 - y0, px: cv.width * cv.height };
  cache.set(k, sp); cachePx += sp.px;
  while (cachePx > KIT.MAX_PX && cache.size > 1) { const [ok, old] = cache.entries().next().value; cache.delete(ok); cachePx -= old.px; }
  return sp;
};
KIT.blit = function (g, sp, x, y, alpha) {
  if (alpha !== undefined && alpha < 1) { const a = g.globalAlpha; g.globalAlpha = a * alpha; g.drawImage(sp.cv, x + sp.x0, y + sp.y0, sp.w, sp.h); g.globalAlpha = a; return; }
  g.drawImage(sp.cv, x + sp.x0, y + sp.y0, sp.w, sp.h);
};
KIT.clearCache = function () { cache.clear(); cachePx = 0; };
KIT.cacheSize = () => cache.size;
KIT.cachePx = () => cachePx;
// a local projection with the map origin at (ox, oy) px
KIT.proj = (ox, oy) => (wx, wy, z) => [ox + (wx - wy) * BD.C.ISO_X, oy + (wx + wy) * BD.C.ISO_Y - (z || 0)];
// deterministic rng from a string
KIT.rng = (key) => BD.Rng(BD.hash32('art:' + key));
