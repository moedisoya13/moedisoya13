// Night sky and far city (browser only). Flat bands, no gradient: six horizontal bands of night
// colour that step toward a dawn set from 03:00 to 06:00 (R.dawnK), stars and a crescent moon
// that fade with it. Three skyline layers — far towers with a demon-castle spire, a middle row,
// near blocks with water towers and signs — painted once per floor into tileable strips (night
// and dawn looks) and slid with the camera at 6 %, 11 % and 19 % of its travel (parallax). On a big
// floor only the parts of the screen the stage leaves open are drawn (above the back walls'
// base, beside the side corners, below the facade); the glass of the back walls shows it through.
//
//   R.sky.prepare(w, v)   per floor (32_bigfloor.js / buildStatic)
//   R.drawSky(g, w)       bands, stars, moon (screen space)
//   R.drawSkyline(g, w, v) the three layers at the camera's parallax offset

const C = BD.C;
const R = BD.client.render;
const KIT = R.kit;
const SK = R.sky = { layers: null, key: null };
const TW = 1024; // tile width of a skyline strip (logical px)
const NIGHT = ['#04050b', '#070916', '#0b0e20', '#11132b', '#181838', '#221d44'];
const DAWN = ['#2a2443', '#3c2f57', '#584066', '#80566e', '#ad7374', '#d99a86'];
const BANDS = [0, 110, 210, 300, 380, 450, 720];
const LAYERS = [
  { par: 0.06, top: 150, bottom: 640, minH: 160, maxH: 430, minW: 34, maxW: 80, night: '#10132a', dawn: '#5a4866', win: 0.05, ww: 2, wh: 3, ink: false },
  { par: 0.11, top: 240, bottom: 690, minH: 120, maxH: 360, minW: 50, maxW: 110, night: '#0b0d1d', dawn: '#47394f', win: 0.09, ww: 3, wh: 4, ink: false },
  { par: 0.19, top: 330, bottom: 760, minH: 110, maxH: 320, minW: 70, maxW: 150, night: '#06070f', dawn: '#342a3d', win: 0.12, ww: 4, wh: 6, ink: true },
];
SK.LAYERS = LAYERS;

function buildings(rng, L) {
  const out = [];
  let x = 0;
  while (x < TW) {
    const bw = rng.range(L.minW, L.maxW), bh = rng.range(L.minH, L.maxH), top = L.bottom - bh;
    const b = { x, w: bw, top, wins: [], cap: rng.next(), spire: false };
    for (let wy = top + 10; wy < L.bottom - 6; wy += L.wh + 6) for (let wx = x + 5; wx < x + bw - L.ww - 4; wx += L.ww + 5) {
      if (rng.next() < L.win) b.wins.push([wx, wy, rng.next() < 0.78 ? (rng.next() < 0.6 ? '#f2c25a' : '#e8d9a0') : rng.next() < 0.5 ? '#6fd0e6' : '#d978c8', rng.range(0.45, 1)]);
    }
    out.push(b);
    x += bw + rng.range(-8, 10);
  }
  return out;
}
// one strip (TW wide, layer height) in its night or dawn look; buildings that cross the right
// edge are drawn again at x − TW so the strip tiles
function paint(L, data, dawn, s, castle) {
  const H = 800, cv = document.createElement('canvas');
  cv.width = Math.ceil(TW * s); cv.height = Math.ceil((H - L.top + 40) * s);
  const g = cv.getContext('2d');
  g.scale(s, s); g.translate(0, -L.top + 40);
  for (const off of [0, -TW]) for (const b of data) {
    if (off && b.x + b.w <= TW) continue;
    const x = b.x + off;
    g.fillStyle = dawn ? L.dawn : L.night;
    g.beginPath();
    g.moveTo(x, H); g.lineTo(x, b.top);
    if (b.cap > 0.82) { g.lineTo(x + b.w * 0.3, b.top); g.lineTo(x + b.w * 0.5, b.top - 26); g.lineTo(x + b.w * 0.7, b.top); } // stepped crown
    else if (b.cap > 0.7) { g.lineTo(x + b.w * 0.5, b.top - 12); }
    g.lineTo(x + b.w, b.top); g.lineTo(x + b.w, H); g.closePath(); g.fill();
    if (L.ink) { g.lineWidth = 1.6; g.strokeStyle = '#020204'; g.stroke(); }
    if (b.cap > 0.55 && b.cap <= 0.7 && L.ink) { // water tower
      const tx = x + b.w * 0.6, ty = b.top;
      g.fillStyle = dawn ? L.dawn : L.night; g.fillRect(tx - 7, ty - 18, 14, 12); g.fillRect(tx - 6, ty - 6, 2, 6); g.fillRect(tx + 4, ty - 6, 2, 6);
      g.beginPath(); g.moveTo(tx - 8, ty - 18); g.lineTo(tx, ty - 25); g.lineTo(tx + 8, ty - 18); g.fill();
    }
    if (b.cap < 0.08) { g.strokeStyle = dawn ? L.dawn : L.night; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + b.w * 0.5, b.top); g.lineTo(x + b.w * 0.5, b.top - 34); g.stroke(); if (!dawn) { g.fillStyle = '#e04a5a'; g.fillRect(x + b.w * 0.5 - 1.5, b.top - 36, 3, 3); } }
    if (dawn) { g.fillStyle = 'rgba(255,200,170,0.20)'; g.fillRect(x + b.w - 5, b.top, 5, H - b.top); }
    b.wins.forEach((p, i) => {
      if (dawn && i % 5) return;
      g.globalAlpha = dawn ? p[3] * 0.3 : p[3]; g.fillStyle = p[2]; g.fillRect(p[0] + off, p[1], L.ww, L.wh); g.globalAlpha = 1;
    });
  }
  if (castle) { // the demon castle's spire on the far horizon: black, violet cracks
    const cx = castle.x, base = L.bottom;
    g.fillStyle = dawn ? '#3a2c48' : '#08060e';
    g.beginPath(); g.moveTo(cx - 60, base); g.lineTo(cx - 34, base - 220); g.lineTo(cx - 18, base - 250); g.lineTo(cx - 8, base - 380); g.lineTo(cx + 4, base - 300); g.lineTo(cx + 16, base - 330); g.lineTo(cx + 26, base - 230); g.lineTo(cx + 50, base - 200); g.lineTo(cx + 70, base); g.closePath(); g.fill();
    g.lineWidth = 1.6; g.strokeStyle = '#020204'; g.stroke();
    g.strokeStyle = dawn ? 'rgba(185,140,255,0.35)' : 'rgba(185,140,255,0.8)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(cx - 4, base - 360); g.lineTo(cx - 10, base - 300); g.lineTo(cx - 2, base - 260); g.lineTo(cx - 14, base - 200); g.moveTo(cx + 16, base - 300); g.lineTo(cx + 10, base - 240); g.stroke();
  }
  return cv;
}

SK.prepare = function (w, v) {
  const s = Math.min(1.25, Math.max(0.75, v.dpr * v.scale)) || 1, key = w.seed + ':' + w.floorN + ':' + s;
  if (SK.key === key && SK.layers) return;
  SK.key = key;
  const rng = KIT.rng('sky:' + w.seed + ':' + w.floorN);
  SK.layers = LAYERS.map((L, i) => {
    const data = buildings(rng, L), castle = i === 0 ? { x: rng.range(200, TW - 200) } : null;
    return { L, night: paint(L, data, false, s, castle), dawn: paint(L, data, true, s, castle) };
  });
  SK.stars = [];
  for (let i = 0; i < 70; i++) SK.stars.push([rng.range(0, C.VIEW_W), rng.range(0, 360), rng.next() < 0.15 ? 2 : 1, rng.range(0.35, 0.9)]);
  // keep the v1 names alive for anything that reads them
  R.skyNight = SK.layers[2].night; R.skyDawn = SK.layers[2].dawn;
};

// screen rectangles where the stage leaves the sky visible (null: all of it)
SK.open = function (w, v) {
  if (BD.view.fits(w.grid)) return null;
  const W = w.grid.w, H = w.grid.h, P = v.proj;
  const back = P(0, 0), left = P(0, H), right = P(W, 0), bottom = (R.big.bottom || 0) + v.roy;
  // the back edges (the walls' base): y on the screen's left and right edges
  const yAt = (sx) => (sx <= back[0] ? back[1] + ((back[0] - sx) / C.ISO_X) * C.ISO_Y : back[1] + ((sx - back[0]) / C.ISO_X) * C.ISO_Y);
  const out = [];
  const yTop = Math.min(C.VIEW_H, Math.max(yAt(0), yAt(C.VIEW_W)));
  if (yTop > 0) out.push([0, 0, C.VIEW_W, yTop]);
  if (left[0] > 0) out.push([0, 0, Math.min(C.VIEW_W, left[0] + 2), C.VIEW_H]);
  if (right[0] < C.VIEW_W) out.push([Math.max(0, right[0] - 2), 0, C.VIEW_W, C.VIEW_H]);
  if (bottom < C.VIEW_H) out.push([0, Math.max(0, bottom - 2), C.VIEW_W, C.VIEW_H]);
  return out;
};
function clipOpen(g, rects) {
  g.beginPath();
  for (const r of rects) g.rect(r[0], r[1] - 30, r[2] - r[0], r[3] - r[1] + 60);
  g.clip();
}

R.drawSky = function (g, w) {
  const k = R.dawnK(w), v = BD.client.shell && BD.client.shell.ui ? BD.client.shell.ui.view : null;
  const open = w && v && w.grid ? SK.open(w, v) : null;
  if (open && !open.length) { SK.skipped = true; return; }
  SK.skipped = false;
  g.save();
  if (open) clipOpen(g, open);
  for (let i = 0; i < 6; i++) { g.fillStyle = k > 0 ? KIT.mix(NIGHT[i], DAWN[i], Math.round(k * 20) / 20) : NIGHT[i]; g.fillRect(0, BANDS[i], C.VIEW_W, BANDS[i + 1] - BANDS[i] + 1); }
  if (SK.stars && k < 1) {
    g.fillStyle = '#e9e6f5';
    for (const s of SK.stars) { g.globalAlpha = s[3] * (1 - k); g.fillRect(s[0], s[1], s[2], s[2]); }
    g.globalAlpha = 1;
    // crescent moon, inked
    const mx = 250, my = 140, r = 24; // clear of the HUD's corners
    g.globalAlpha = 1 - k * 0.6;
    g.beginPath(); g.arc(mx, my, r, 0.35 * Math.PI, 1.65 * Math.PI, false); g.arc(mx + 11, my - 4, r * 0.88, 1.52 * Math.PI, 0.48 * Math.PI, true); g.closePath();
    g.fillStyle = '#efe6c4'; g.fill(); g.lineWidth = 2; g.strokeStyle = BD.ui.INK; g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
};

R.drawSkyline = function (g, w, v) {
  if (!SK.layers || SK.skipped) return;
  const k = R.dawnK(w), cam = BD.client.camera.focus, f = BD.view.frame(w.grid);
  const dx = (cam[0] || 0) - (f.cx || 0), dy = (cam[1] || 0) - (f.cy || 0);
  const open = BD.view.fits(w.grid) ? null : SK.open(w, v);
  g.save();
  if (open) clipOpen(g, open);
  for (const ly of SK.layers) {
    const L = ly.L, ox = -dx * L.par, oy = -dy * L.par * 0.6;
    const x0 = ((ox % TW) + TW) % TW - TW, y = L.top - 40 + oy, hh = ly.night.height / (ly.night.width / TW);
    for (let x = x0; x < C.VIEW_W; x += TW) {
      g.drawImage(ly.night, x, y, TW, hh);
      if (k > 0) { g.globalAlpha = k; g.drawImage(ly.dawn, x, y, TW, hh); g.globalAlpha = 1; }
    }
    // below the strip: the layer's own colour, so a high camera never shows a gap
    if (y + hh < C.VIEW_H) { g.fillStyle = k > 0.5 ? L.dawn : L.night; g.fillRect(0, y + hh - 1, C.VIEW_W, C.VIEW_H - y - hh + 1); }
  }
  g.restore();
};
