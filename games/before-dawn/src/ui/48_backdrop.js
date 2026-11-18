// Backdrop of the out-of-run screens: the night city, the skyscraper with the demon castle's
// black thorns and violet crystals on its crown, a rooftop ledge. Flat colour and ink, cached
// per scale and variant ('night' | 'dawn'); only a few windows and crystals animate on top.

const C = BD.C;
const K = BD.ui.K;
const BG = BD.ui.backdrop = {};
const cache = {};

function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return 'rgb(' + c(16) + ',' + c(8) + ',' + c(0) + ')';
}

function paint(g, variant) {
  const rng = BD.Rng(0xbd0 + (variant === 'dawn' ? 1 : 0));
  const dawn = variant === 'dawn';
  // sky (two flat bands + a soft horizon, as the in-game sky)
  const gr = g.createLinearGradient(0, 0, 0, C.VIEW_H);
  gr.addColorStop(0, dawn ? '#1b1a33' : '#05060d');
  gr.addColorStop(0.55, dawn ? '#5a3a58' : '#141128');
  gr.addColorStop(1, dawn ? '#f0a060' : '#2a1a3a');
  g.fillStyle = gr; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  // stars / moon
  if (!dawn) {
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + rng.range(0.2, 0.8) + ')'; g.fillRect(rng.range(0, C.VIEW_W), rng.range(0, 330), 2, 2); }
    K.circle(g, 1150, 96, 34); g.fillStyle = '#e8e2d0'; g.fill(); K.ink(g, 3);
    K.circle(g, 1164, 88, 30); g.fillStyle = '#0a0b16'; g.fill();
  } else {
    K.circle(g, 210, 700, 120); g.fillStyle = '#ffd89a'; g.fill();
    K.circle(g, 210, 700, 90); g.fillStyle = '#ffeec8'; g.fill();
  }
  // two skyline layers
  for (let layer = 0; layer < 2; layer++) {
    let x = -20;
    while (x < C.VIEW_W + 20) {
      const bw = rng.range(50, 120), bh = rng.range(140, 380) * (layer ? 0.7 : 1);
      const top = C.VIEW_H - bh - (layer ? 0 : 50);
      g.fillStyle = dawn ? (layer ? '#2a2236' : '#1e1a2c') : layer ? '#0d0e18' : '#090a12';
      g.fillRect(x, top, bw, C.VIEW_H - top);
      for (let wy = top + 10; wy < C.VIEW_H - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
        if (rng.next() < (layer ? 0.13 : 0.08)) {
          g.fillStyle = rng.pick(['#f2b84a', '#e9a33c', '#c94fa0', '#4fb7d8', '#f2b84a']);
          g.globalAlpha = rng.range(0.35, 0.9) * (dawn ? 0.5 : 1);
          g.fillRect(wx, wy, 5, 7); g.globalAlpha = 1;
        }
      }
      x += bw + rng.range(-8, 16);
    }
  }
  // the skyscraper, seen from its corner
  const cx = 800, topY = 205;
  const L = [[668, topY - 34], [cx, topY], [cx, 760], [668, 760]];
  const Rf = [[cx, topY], [932, topY - 34], [932, 760], [cx, 760]];
  K.poly(g, L); g.fillStyle = dawn ? '#3a3248' : '#262838'; g.fill(); K.ink(g, 4);
  K.poly(g, Rf); g.fillStyle = dawn ? '#241f30' : '#151621'; g.fill(); K.ink(g, 4);
  g.save(); K.poly(g, Rf); g.clip(); g.globalAlpha = 0.25; g.fillStyle = K.halftone(g, '#000000', 6); g.fillRect(cx, topY - 40, 140, 800); g.restore();
  for (const [face, a, b] of [[L, [668, topY - 34], [cx, topY]], [Rf, [cx, topY], [932, topY - 34]]]) {
    for (let row = 0; row < 26; row++) for (let col = 0; col < 6; col++) {
      const t0 = 0.08 + col * 0.15, t1 = t0 + 0.08;
      const y0 = 26 + row * 22;
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 + y0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 + y0];
      K.poly(g, [p0, p1, [p1[0], p1[1] + 12], [p0[0], p0[1] + 12]]);
      const lit = rng.next() < (face === L ? 0.2 : 0.12);
      g.fillStyle = lit ? rng.pick(['rgba(242,184,74,0.85)', 'rgba(242,184,74,0.85)', 'rgba(201,79,160,0.7)', 'rgba(79,183,216,0.6)']) : 'rgba(10,11,20,0.9)';
      g.fill();
    }
  }
  // the crown: the demon castle's black thorns and violet crystals
  const top = [[668, topY - 34], [cx, topY - 68], [932, topY - 34], [cx, topY]];
  K.poly(g, top); g.fillStyle = '#2f2a3e'; g.fill(); K.ink(g, 3);
  if (!dawn) {
    const glow = g.createRadialGradient(cx, topY - 90, 10, cx, topY - 90, 230);
    glow.addColorStop(0, 'rgba(155,89,208,0.42)'); glow.addColorStop(1, 'rgba(155,89,208,0)');
    g.fillStyle = glow; g.fillRect(cx - 240, topY - 330, 480, 420);
  }
  const thorn = (x, base, h, lean, wdt) => { K.poly(g, [[x - wdt, base], [x + lean, base - h], [x + wdt, base]]); g.fillStyle = '#0d0c12'; g.fill(); K.ink(g, 2.5); };
  const spires = [[700, 40, -14], [728, 90, 6], [756, 70, -8], [cx - 18, 150, -4], [cx + 6, 190, 2], [cx + 34, 120, 10], [862, 84, 12], [892, 58, 16], [918, 34, 10]];
  for (const [x, h, lean] of spires) thorn(x, topY - 40 + Math.abs(x - cx) * 0.2, h, lean, 9 + h * 0.06);
  const crystal = (x, base, h, lean, wdt) => {
    K.poly(g, [[x - wdt, base], [x + lean, base - h], [x + wdt, base]]); g.fillStyle = '#5b2d91'; g.fill();
    K.poly(g, [[x, base], [x + lean, base - h], [x + wdt, base]]); g.fillStyle = '#8a4fd0'; g.fill();
    K.poly(g, [[x - wdt, base], [x + lean, base - h], [x + wdt, base]]); K.ink(g, 2);
  };
  for (const [x, h, lean] of [[690, 44, -6], [742, 62, 4], [cx - 40, 78, -6], [cx + 46, 70, 8], [880, 52, 6], [910, 34, -4], [cx - 4, 46, 0]]) crystal(x, topY - 26 + Math.abs(x - cx) * 0.15, h, lean, 10);
  // crystals and thorns eating into the tower's edges
  for (let i = 0; i < 6; i++) crystal(668 + rng.range(-4, 8), 300 + i * 70, rng.range(24, 44), rng.range(-14, -4), 7);
  // rooftop ledge, foreground right (the hero stands here)
  const ledge = [[880, 668], [1290, 640], [1290, 730], [880, 730]];
  K.poly(g, ledge); g.fillStyle = dawn ? '#2a2236' : '#101018'; g.fill(); K.ink(g, 4);
  K.poly(g, [[880, 668], [1290, 640], [1290, 652], [880, 680]]); g.fillStyle = dawn ? '#4a3a52' : '#22222e'; g.fill(); K.ink(g, 2.5);
}

BG.draw = function (g, ui, o) {
  o = o || {};
  const variant = o.variant || 'night';
  const v = ui.view, s = Math.min(2, (v.dpr || 1) * v.scale) || 1;
  const key = variant + ':' + s.toFixed(3);
  if (!cache[key]) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(C.VIEW_W * s); cv.height = Math.ceil(C.VIEW_H * s);
    const cg = cv.getContext('2d');
    cg.scale(s, s);
    paint(cg, variant);
    cache[key] = cv;
  }
  g.drawImage(cache[key], 0, 0, C.VIEW_W, C.VIEW_H);
  // a few windows blinking and the crown's crystals pulsing
  const t = ui.time;
  for (let i = 0; i < 6; i++) {
    const on = Math.sin(t * (0.7 + i * 0.13) + i * 2.1) > 0.6;
    if (!on) continue;
    g.fillStyle = 'rgba(242,184,74,0.9)';
    g.fillRect(40 + ((i * 197) % 1180), 470 + ((i * 53) % 200), 5, 7);
  }
  if (o.dim) { g.fillStyle = 'rgba(5,6,12,' + o.dim + ')'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); }
};

// The hero_slash sprite as cover art (feet at x, y; height in px).
BG.hero = function (g, id, x, y, h, o) {
  o = o || {};
  const img = BD.client.assets.img[id];
  if (!img) return;
  const sc = h / img.height, wdt = img.width * sc;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.flip) g.scale(-1, 1);
  g.imageSmoothingQuality = 'high';
  // ink drop shadow on the ledge
  g.fillStyle = 'rgba(10,10,12,0.6)'; g.beginPath(); g.ellipse(0, 0, wdt * 0.42, 12, 0, 0, Math.PI * 2); g.fill();
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  g.drawImage(img, -wdt / 2, -h, wdt, h);
  g.restore();
};
