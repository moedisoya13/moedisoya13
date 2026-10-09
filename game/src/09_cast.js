// ─────────────────────────────────────────────────────────────
// Cast — the six killers, the Doctor's machines, the Evolver stages
// ─────────────────────────────────────────────────────────────

function weaponDir(B) {
  const dx = B.har.x - B.er.x, dy = B.har.y - B.er.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}
function smear(rig, st, B, c = 'rgba(230,230,240,0.35)') {
  if (!st.atk || st.atk.phase !== 'strike' || st.atk.f > 0.7) return;
  rig.fn(B.har.d + 1, () => {
    const a = st.atk.f;
    L.globalAlpha = 0.5 * (1 - a);
    for (let i = 1; i <= 3; i++) disc(lerp(B.har.x, B.ch.x, i * 0.18), lerp(B.har.y, B.ch.y - 6, i * 0.18), 1.6, '#e8e8f0');
    L.globalAlpha = 1;
  });
}

// ── 도살자 · lion mask, cleaver ──
const STY_BUTCHER = {
  scale: 1.3, sh: 3.8, hip: 2.1, torso: 5.4, leg: 7.6, stride: 3.6, armAmp: 2.4,
  k: { legs: '#3a2a22', legs2: '#2a1d18', boot: '#191214', body: '#d6ccbc', sleeve: '#b9845f', sleeve2: '#a5714f', hand: '#9f6a48', belly: '#cbbfab' },
  dims: { thigh: 2.6, shin: 2.3, torsoW: 6.4, arm: 2.3, fore: 2.1, hand: 1.3 },
  extra(rig, J, st, B) {
    rig.disc(rig.P(J.chest[0] + 2.1, -0.9, J.chest[2] - 2.2), 1.2, C.blood2, 0.25);
    rig.disc(rig.P(J.hipC[0] + 2.2, 1, J.hipC[2] + 1.5), 0.9, C.blood, 0.25);
    const hc = rig.Pj(J.head), s = rig.s;
    // mane (behind the mask)
    rig.fn(hc.d - 0.15, () => {
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + Math.sin(st.t * 2) * 0.05; const r = (i % 2 ? 4.2 : 6.0) * s; pts.push(hc.x + Math.cos(a) * r, hc.y - 0.5 + Math.sin(a) * r * 0.92); }
      const out = []; for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - hc.x, dy = pts[i + 1] - hc.y + 0.5, d = Math.hypot(dx, dy) || 1; out.push(pts[i] + dx / d, pts[i + 1] + dy / d); }
      poly(out, C.ink);
      poly(pts, st.flash || '#b8641e');
      disc(hc.x, hc.y - 0.5, 4.2 * s, st.flash || '#8a4512');
    });
    const H = headPts(rig, J, 3);
    rig.disc(hc, 3.0, '#ddb070', 0.05);
    rig.disc(H.front(-0.4, -2.4, 2.6), 0.9, '#c8924f', 0.06);
    rig.disc(H.front(-0.4, 2.4, 2.6), 0.9, '#c8924f', 0.06);
    rig.disc(H.front(1.9, 0, -0.9), 1.5, '#f0d7a6', 0.1);
    rig.fn(hc.d + 0.3, () => {
      if (rig.fy < -0.25) return;
      const e1 = H.front(2.7, -1.1, 0.7), e2 = H.front(2.7, 1.1, 0.7), n = H.front(3.2, 0, -0.4);
      px(e1.x, e1.y, '#120a0a'); px(e2.x, e2.y, '#120a0a'); px(n.x, n.y, '#3a1a10');
      // crack across the mask
      const c1 = H.front(2.6, -1.8, 1.8); px(c1.x, c1.y, '#6a4020');
    });
    // cleaver
    rig.fn(B.har.d + 0.5, () => {
      const [dx, dy] = weaponDir(B), nx = -dy, ny = dx, s2 = rig.s;
      const b0x = B.har.x + dx * 1.2 * s2, b0y = B.har.y + dy * 1.2 * s2, b1x = B.har.x + dx * 6.5 * s2, b1y = B.har.y + dy * 6.5 * s2;
      const w = 2.6 * s2;
      poly([b0x, b0y, b1x, b1y, b1x + nx * w, b1y + ny * w, b0x + nx * w, b0y + ny * w], st.flash || C.ink);
      poly([b0x + nx * 0.6, b0y + ny * 0.6, b1x - dx * 0.6 + nx * 0.6, b1y - dy * 0.6 + ny * 0.6, b1x - dx * 0.6 + nx * (w - 0.6), b1y - dy * 0.6 + ny * (w - 0.6), b0x + nx * (w - 0.6), b0y + ny * (w - 0.6)], st.flash || '#c4c9cf');
      line(b0x + nx * (w - 0.5), b0y + ny * (w - 0.5), b1x + nx * (w - 0.5), b1y + ny * (w - 0.5), st.flash || '#eef1f4');
      px(b1x + nx, b1y + ny, C.blood2);
      line(B.har.x, B.har.y, B.har.x - dx * 2, B.har.y - dy * 2, '#3a2214');
    });
    smear(rig, st, B);
  },
};

// ── 마녀 · hunched occult crone ──
const STY_WITCH = {
  scale: 1.05, sh: 2.8, hip: 1.6, torso: 4.6, leg: 6.8, stride: 2.2, armAmp: 2.6, hunch: 3.2, lean: 0.4, neck: 2.6,
  k: { legs: '#1d1622', boot: '#141016', body: '#4b2a5a', sleeve: '#3b2148', sleeve2: '#2f1a3a', hand: '#b5c2a2' },
  dims: { torsoW: 5.6, arm: 1.4, fore: 1.2, hand: 0.9 },
  behind(rig, J, st) {
    // long skirt hides the legs
    const a = rig.Pj(J.hipL), b = rig.Pj(J.hipR);
    const sway = Math.sin(st.phase) * 0.8 * st.amt;
    rig.poly([a, b, rig.P(-0.5 + sway, 3.4, 0.3), rig.P(-0.5 - sway, -3.4, 0.3)], '#231a2b', -0.02);
  },
  extra(rig, J, st, B) {
    const H = headPts(rig, J, 2.8);
    const hc = H.c;
    rig.disc(hc, 2.8, '#cfd3bd', 0.05);
    // wild white hair
    rig.fn(hc.d - 0.1, () => {
      const s = rig.s, c = st.flash || '#d9d4cc';
      disc(hc.x, hc.y - 0.6, 3.3 * s, c);
      for (let i = -2; i <= 2; i++) line(hc.x + i * 1.4 * s, hc.y, hc.x + i * 2.0 * s + Math.sin(st.t * 3 + i) * 0.6, hc.y + 4.5 * s, c);
    });
    rig.fn(hc.d + 0.3, () => {
      if (rig.fy < -0.25) return;
      const f = H.front(2.2, 0, -0.2), e1 = H.front(2.3, -1, 0.5), e2 = H.front(2.3, 1, 0.5), n = H.front(3.1, 0, -0.3);
      disc(f.x, f.y, 1.6 * rig.s, st.flash || '#c4ccb0');
      px(e1.x, e1.y, '#e0303a'); px(e2.x, e2.y, '#e0303a'); px(n.x, n.y + 1, '#8f9a7a');
    });
    // long nails
    rig.fn(B.har.d + 0.3, () => {
      for (const h of [B.hal, B.har]) for (let i = -1; i <= 1; i++) line(h.x, h.y, h.x + rig.fx * 2.4 + i * 0.9, h.y + rig.fy * 1.5 + 1, '#e9e3c8');
    });
    smear(rig, st, B, '#c9d0b4');
  },
};

// ── 수위 · sanpaku-eyed guard, flashlight + tennis racket ──
const STY_JANITOR = {
  scale: 1.12, sh: 3.3, hip: 1.9, torso: 5.2, leg: 8, stride: 3.3, armAmp: 1.4,
  k: { legs: '#2a3346', legs2: '#202838', boot: '#121014', body: '#3b4a66', sleeve: '#34425c', sleeve2: '#2b3850', hand: '#e4cdb4' },
  dims: { torsoW: 5.4 },
  extra(rig, J, st, B) {
    const H = headPts(rig, J, 3);
    rig.disc(H.c, 3.0, '#e9d6c0', 0.05);
    rig.disc(H.front(-0.3, 0, 2.3), 2.7, '#1f2a3d', 0.06);   // cap crown
    rig.disc(H.front(2.2, 0, 2.0), 1.5, '#141c2a', 0.08);    // brim
    rig.fn(H.c.d + 0.35, () => {
      if (rig.fy < -0.25) return;
      const e1 = H.front(2.8, -1.1, 0.0), e2 = H.front(2.8, 1.1, 0.0);
      // sanpaku: white eyes, pinprick pupils
      rect(e1.x - 0.5, e1.y, 2, 1, '#ffffff'); rect(e2.x - 0.5, e2.y, 2, 1, '#ffffff');
      px(e1.x, e1.y, '#5a0a0a'); px(e2.x, e2.y, '#5a0a0a');
      const b = rig.P(J.chest[0] + 2.2, -1.4, J.chest[2] - 1); px(b.x, b.y, C.gold);
    });
    // flashlight (left hand)
    rig.fn(B.hal.d + 0.3, () => {
      line(B.hal.x, B.hal.y, B.hal.x + rig.fx * 2.5, B.hal.y + rig.fy * 1.6, '#80838c');
      px(B.hal.x + rig.fx * 3, B.hal.y + rig.fy * 2, st.beam ? '#fff6c0' : '#a59a6a');
    });
    // tennis racket (right hand)
    rig.fn(B.har.d + 0.5, () => {
      const [dx, dy] = weaponDir(B), s = rig.s;
      const hx = B.har.x + dx * 3 * s, hy = B.har.y + dy * 3 * s;
      line(B.har.x, B.har.y, hx, hy, '#4a3a30');
      const cx = hx + dx * 2.6 * s, cy = hy + dy * 2.6 * s;
      ellipse(cx, cy, 2.8 * s, 2.0 * s, Math.atan2(dy, dx), st.flash || '#cfd2d6');
      ellipse(cx, cy, 2.0 * s, 1.2 * s, Math.atan2(dy, dx), st.flash || '#6c7a5a');
      px(cx, cy, '#cfd2d6');
    });
    smear(rig, st, B);
  },
};

// ── 박사 · mad scientist ──
const STY_DOCTOR = {
  scale: 1.08, sh: 3, hip: 1.7, torso: 5, leg: 7.8, stride: 3.6, armAmp: 4.2,
  k: { legs: '#3a3a44', boot: '#1a1418', body: '#e9ece8', sleeve: '#dfe3df', sleeve2: '#cfd6cf', hand: '#c6d8b2' },
  behind(rig, J, st) {
    const fl = Math.sin(st.t * 10) * 0.6 * st.amt;
    const a = rig.Pj(J.hipL), b = rig.Pj(J.hipR);
    rig.poly([a, b, rig.P(-1.8 - st.amt * 2 + fl, 2.6, 1.2), rig.P(-1.8 - st.amt * 2 - fl, -2.6, 1.2)], '#d8ddd8', -0.05);
  },
  extra(rig, J, st, B) {
    const H = headPts(rig, J, 2.9);
    rig.disc(H.c, 2.9, '#cfe0c0', 0.05);
    rig.fn(H.c.d - 0.1, () => {
      const s = rig.s, c = st.flash || '#f2f4fb';
      const spikes = [[-2.6, -2.2], [-1.2, -3.6], [0.6, -3.9], [2.2, -3.0], [3.2, -1.4], [-3.4, -0.6]];
      for (const [x, y] of spikes) thickLine(H.c.x, H.c.y - 1, H.c.x + x * s * 1.3, H.c.y - 1 + y * s * 1.2, 1.6, c);
      disc(H.c.x, H.c.y - 1.2, 2.6 * s, c);
    });
    rig.fn(H.c.d + 0.35, () => {
      if (rig.fy < -0.25) return;
      const g1 = H.front(2.3, -1.1, 1.3), g2 = H.front(2.3, 1.1, 1.3), m = H.front(2.8, 0.6, -1.4);
      disc(g1.x, g1.y, 0.9 * rig.s, '#8fd3ff'); disc(g2.x, g2.y, 0.9 * rig.s, '#8fd3ff');
      px(m.x, m.y + 1, '#8be06a');
    });
  },
};

// ── 무사 · blood-soaked samurai armour with a spear ──
const STY_SAMURAI = {
  scale: 1.27, sh: 3.9, hip: 2.1, torso: 5.4, leg: 7.8, stride: 3.0, armAmp: 1.0,
  k: { legs: '#2b1a1a', legs2: '#1d1212', boot: '#151012', body: '#8e1b1b', sleeve: '#6f1414', sleeve2: '#4a0e0e', hand: '#2a2020' },
  dims: { torsoW: 6.2, arm: 2, fore: 1.8 },
  extra(rig, J, st, B) {
    // lamellar stripes + sode
    for (let i = 0; i < 3; i++) {
      const z = J.chest[2] - 1 - i * 1.6;
      rig.line(rig.P(J.chest[0] + 2.3, -2.4, z), rig.P(J.chest[0] + 2.3, 2.4, z), 0.8, i % 2 ? C.gold2 : C.ink, 0.2);
    }
    rig.disc(rig.P(J.shL[0], J.shL[1] * 1.2, J.shL[2] + 0.4), 1.9, '#7a1515', 0.05);
    rig.disc(rig.P(J.shR[0], J.shR[1] * 1.2, J.shR[2] + 0.4), 1.9, '#7a1515', 0.05);
    rig.disc(rig.P(J.chest[0] + 2.4, 1.2, J.chest[2] - 2.5), 0.9, C.blood2, 0.22);
    const H = headPts(rig, J, 3.2);
    rig.disc(H.front(-1.0, 0, -0.6), 3.4, '#1d1515', 0.03);  // shikoro
    rig.disc(H.c, 3.2, '#231b1b', 0.05);                    // kabuto
    rig.disc(H.front(2.0, 0, -0.7), 1.8, '#5a1010', 0.09);   // menpo
    rig.fn(H.c.d + 0.4, () => {
      // golden crescent crest
      const a = H.front(2.4, -2.8, 4.0), m = H.front(2.6, 0, 2.2), b = H.front(2.4, 2.8, 4.0);
      line(a.x, a.y, m.x, m.y, st.flash || C.gold); line(m.x, m.y, b.x, b.y, st.flash || C.gold);
      if (rig.fy > -0.25) { const t1 = H.front(3.1, -0.5, -1.2), t2 = H.front(3.1, 0.5, -1.2); px(t1.x, t1.y, '#ece7d8'); px(t2.x, t2.y, '#ece7d8'); const e = H.front(3, 0.9, 0.6); px(e.x, e.y, '#ffdf5a'); }
    });
    // spear through both hands
    rig.fn(Math.max(B.har.d, B.hal.d) + 0.6, () => {
      const dx = B.hal.x - B.har.x, dy = B.hal.y - B.har.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d, s = rig.s;
      const ext = (st.spearExt || 0) * s;
      const tx = B.hal.x + ux * (9 * s + ext), ty = B.hal.y + uy * (9 * s + ext);
      line(B.har.x - ux * 4 * s, B.har.y - uy * 4 * s, tx, ty, st.flash || '#4a2a16');
      thickLine(tx, ty, tx + ux * 3.2 * s, ty + uy * 3.2 * s, 1.6, st.flash || '#e6e9ef');
      px(tx + ux * 3.4 * s, ty + uy * 3.4 * s, '#ffffff');
      px(tx - ux, ty - uy, C.blood2);
    });
  },
};

const KILLER_STYLES = { butcher: STY_BUTCHER, witch: STY_WITCH, janitor: STY_JANITOR, doctor: STY_DOCTOR, samurai: STY_SAMURAI };

// ── 초진화체 stages ──
function drawEgg(X, Y, t, wobble) {
  const p = 1 + Math.sin(t * 3) * 0.05;
  groundShadow(X, Y, 6, 2.6, 0.5);
  L.globalAlpha = 0.85; ellipse(X, Y, 6.5, 2.6, 0, '#3f4a22'); L.globalAlpha = 1;
  const ox = Math.sin(t * 30) * wobble;
  ellipse(X + ox, Y - 6, 4.6 * p + 1, 6.2 * p + 1, 0, C.ink);
  ellipse(X + ox, Y - 6, 4.6 * p, 6.2 * p, 0, '#d6cfb2');
  ellipse(X + ox - 1.2, Y - 7.5, 2.2, 3, 0, '#ece6cf');
  line(X + ox - 2, Y - 9, X + ox + 1, Y - 5, '#9c6a6a'); line(X + ox + 1, Y - 5, X + ox + 3, Y - 7, '#9c6a6a'); line(X + ox - 3, Y - 4, X + ox - 1, Y - 2, '#7a4a52');
  if (wobble > 0.3) { line(X + ox - 1, Y - 12, X + ox + 1, Y - 9, C.ink); }
}

function drawLarva(X, Y, e, t, flash) {
  // segmented worm following its own trail
  const tr = e.trail, TS = CFG.TS;
  const segs = 4;
  for (let i = segs; i >= 1; i--) {
    const k = Math.min(tr.length - 1, i * 3);
    const q = tr[k] || [e.x, e.y];
    const sx = X + (q[0] - e.x) * TS, sy = Y + (q[1] - e.y) * TS;
    disc(sx, sy - 2, 2.6 - i * 0.3 + 1, C.ink);
    disc(sx, sy - 2, 2.6 - i * 0.3, flash || (i % 2 ? '#7d8c58' : '#9aaa6c'));
    px(sx, sy - 3, '#b9c88a');
  }
  const a = e.ang, fx = Math.cos(a), fy = Math.sin(a);
  disc(X, Y - 3, 3.6, C.ink);
  disc(X, Y - 3, 2.7, flash || '#a7b67c');
  const open = (Math.sin(t * 12) + 1) * 0.6 + (e.atk ? 1 : 0);
  for (const s of [-1, 1]) line(X + fx * 2.5 - fy * s * 1.4, Y - 3 + fy * 1.6 + fx * s * 1.0, X + fx * 4.4 - fy * s * (0.4 + open), Y - 3 + fy * 2.8 + fx * s * (0.4 + open), '#e8e1c8');
  px(X + fx * 1.5 - fy, Y - 4 + fy, '#e0303a'); px(X + fx * 1.5 + fy, Y - 4 - fy, '#e0303a');
}

function drawMantis(X, Y, st, perfect) {
  const rig = new Rig(X, Y, st.ang, (perfect ? 1.35 : 1.12) * (st.scale || 1));
  if (st.flash) rig.flash = st.flash;
  const col = perfect ? { a: '#2a1e2e', b: '#3d2b42', hi: '#c1263a', leg: '#1d1420' } : { a: '#3e5a3a', b: '#557a4c', hi: '#8fbf6a', leg: '#26381f' };
  const s = Math.sin(st.phase), amt = st.amt;
  // legs (4), alternating
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, fwd = i < 2 ? 1.5 : -2.5;
    const ph = s * (i === 0 || i === 3 ? 1 : -1) * 2.2 * amt;
    const lift = Math.max(0, Math.cos(st.phase) * (i === 0 || i === 3 ? 1 : -1)) * 1.6 * amt;
    const hipP = rig.P(fwd * 0.6, side * 1.2, 5.5), knee = rig.P(fwd + ph * 0.5, side * 4.2, 6.5 + lift), foot = rig.P(fwd + ph, side * 4.6, lift);
    rig.line(hipP, knee, 1, col.leg); rig.line(knee, foot, 1, col.leg);
  }
  // abdomen + thorax
  rig.disc(rig.P(-3.8, 0, 5), 3.2, col.a, 0);
  rig.disc(rig.P(-5.2, 0, 4.6), 2.2, col.b, 0.01);
  rig.line(rig.P(-1, 0, 6), rig.P(2.8, 0, 9.5), 2.8, col.a);
  // tentacles from the back
  for (const sd of [-1, 1]) {
    const w = Math.sin(st.t * 5 + sd) * 1.5;
    rig.line(rig.P(-3, sd * 1.2, 7.5), rig.P(-5.5 + w, sd * 3, 10), 0.9, col.b);
    rig.line(rig.P(-5.5 + w, sd * 3, 10), rig.P(-7 - w, sd * 3.8, 8), 0.8, col.hi);
  }
  // wings (perfect form, once faster than the player)
  if (perfect && st.wings) {
    const fl = Math.sin(st.t * 22) * 2;
    rig.fn(rig.P(-2, 0, 8).d - 0.4, () => {
      L.globalAlpha = 0.55;
      for (const sd of [-1, 1]) {
        const a = rig.P(0, sd * 1.5, 9), b = rig.P(-7, sd * (8 + fl), 12 + fl), c = rig.P(-9, sd * 4, 7);
        poly([a.x, a.y, b.x, b.y, c.x, c.y], '#cbb8dc');
        line(a.x, a.y, b.x, b.y, '#f0e6ff');
      }
      L.globalAlpha = 1;
    });
  }
  // raptorial scythes
  const strike = st.atk && st.atk.phase === 'strike' ? Ease.outCubic(st.atk.f) : 0;
  const reach = st.tentacleOut || 0;
  for (const sd of [-1, 1]) {
    const sh = rig.P(2.6, sd * 1.6, 9.2);
    const el = rig.P(3.5 + strike * 2, sd * 2.4, 13 - strike * 3);
    const tip = rig.P(5.2 + strike * 5 + reach, sd * 1.4, 8 - strike * 3);
    rig.line(sh, el, 1.4, col.a); rig.line(el, tip, 1.2, col.hi);
  }
  // head with a huge fanged mouth
  const head = rig.P(4.4, 0, 11);
  rig.disc(head, 2.5, col.b, 0.02);
  const open = st.atk ? 1 : (Math.sin(st.t * 4) + 1) * 0.3;
  rig.fn(head.d + 0.3, () => {
    if (rig.fy < -0.3) return;
    const m = rig.P(6, 0, 10);
    disc(m.x, m.y, (1.2 + open) * rig.s, '#4a0a12');
    for (let i = -1; i <= 1; i++) px(m.x + i * 1.2, m.y - (1 + open), '#f4efe6');
    for (let i = -1; i <= 1; i += 2) px(m.x + i * 0.8, m.y + 1 + open * 0.6, '#f4efe6');
    const e1 = rig.P(5, -1.4, 12.2), e2 = rig.P(5, 1.4, 12.2);
    px(e1.x, e1.y, perfect ? '#ff4040' : '#ffe14a'); px(e2.x, e2.y, perfect ? '#ff4040' : '#ffe14a');
  });
  if (perfect) rig.fn(rig.P(-3, 0, 7).d + 0.2, () => { const v = rig.P(-3.5, 0, 8.4); px(v.x, v.y, '#ff3048'); px(v.x + 1, v.y + 1, '#ff3048'); });
  rig.render();
}

// ── 박사's machines ──
function drawMachine(X, Y, st, kind, dormant) {
  const rig = new Rig(X, Y, st.ang, 1.1);
  if (st.flash) rig.flash = st.flash;
  const tread = (st.phase * 2) % 2 < 1;
  for (const sd of [-1, 1]) rig.line(rig.P(-3, sd * 3.6, 1.2), rig.P(3, sd * 3.6, 1.2), 2.4, tread ? '#1c1c22' : '#26262e');
  if (kind === 'saw') {
    rig.disc(rig.P(0, 0, 4), 4.2, '#6b6f78');
    rig.disc(rig.P(-0.4, 0, 6.4), 3, '#8b909a', 0.1);
    const bladeC = rig.P(5.2, 0, 4.5);
    rig.fn(bladeC.d + 0.2, () => {
      const spin = dormant ? 0 : st.t * 30;
      disc(bladeC.x, bladeC.y, 4.4, C.ink);
      disc(bladeC.x, bladeC.y, 3.6, st.flash || '#cfd4dc');
      for (let i = 0; i < 8; i++) { const a = spin + (i / 8) * TAU; px(bladeC.x + Math.cos(a) * 4.2, bladeC.y + Math.sin(a) * 3.2, '#eef2f6'); }
      disc(bladeC.x, bladeC.y, 1, '#555a62');
    });
  } else {
    rig.line(rig.P(-3.5, 0, 4.5), rig.P(2.5, 0, 4.5), 6, '#c9a227');
    rig.line(rig.P(-3, 0, 6.8), rig.P(2, 0, 6.8), 3, '#a8861a', 0.1);
    rig.fn(rig.P(0, 0, 7).d + 0.25, () => { for (let i = -2; i <= 2; i++) { const p = rig.P(i * 1.2, 0, 7.2); px(p.x, p.y, i % 2 ? C.ink : '#ffd23f'); } });
    const a = rig.P(3, -2.2, 4.5), b = rig.P(3, 2.2, 4.5), tip = rig.P(9, 0, 4.5);
    rig.poly([a, b, tip], '#aeb5c0', 0.3);
    rig.fn(tip.d + 0.35, () => {
      const spin = dormant ? 0 : st.t * 20;
      for (let i = 0; i < 3; i++) { const u = ((i / 3) + (spin % 1) / 3); const p = rig.P(3 + u * 6, (1 - u) * 2 * Math.sin(spin * 6 + i), 4.5); px(p.x, p.y, '#6a7280'); }
    });
  }
  const eye = rig.P(1.5, 0, 7.6);
  rig.fn(eye.d + 0.5, () => { px(eye.x, eye.y, dormant ? '#3a2020' : ((st.t * 6) | 0) % 2 ? '#ff2a2a' : '#ff8080'); });
  rig.render();
}

// ═════════════════════════════════════════════════════════════
// Props: furniture, doors, items, world icons
// ═════════════════════════════════════════════════════════════

function box(x, y, w, h, top, front, depth = 7) {
  rect(x - 1, y - depth - 1, w + 2, depth + h + 2, C.ink);
  rect(x, y - depth, w, depth, top);
  rect(x, y, w, h, front);
}

function drawFurniture(f, X, Y, t) {
  const TS = CFG.TS, by = Y + TS - 1;
  const sh = f.shake > 0 ? Math.round(Math.sin(t * 60) * Math.min(1, f.shake * 3)) : 0;
  X += sh;
  switch (f.kind) {
    case 'wardrobe': case 'pantry': {
      const top = f.kind === 'wardrobe' ? '#3a2416' : '#5b3d22', fr = f.kind === 'wardrobe' ? '#4e2f1a' : '#6f4c2a';
      box(X + 1, by - 12, 12, 12, top, fr, 6);
      rect(X + 1, by - 12, 12, 1, shade(fr, 1.25));
      line(X + 7, by - 11, X + 7, by - 1, shade(fr, 0.6));
      px(X + 6, by - 6, C.brass); px(X + 8, by - 6, C.brass);
      if (f.kind === 'pantry') { rect(X + 3, by - 10, 3, 3, '#2a1c12'); rect(X + 9, by - 10, 3, 3, '#2a1c12'); }
      if (f.occupied && ((t * 3) | 0) % 5 === 0) px(X + 7, by - 8, '#ffffff');
      break;
    }
    case 'clock': {
      box(X + 4, by - 15, 6, 15, '#3a2214', '#4a2a18', 3);
      disc(X + 7, by - 12, 2.2, '#efe6cc'); px(X + 7, by - 13, C.ink); px(X + 8, by - 12, C.ink);
      rect(X + 5, by - 8, 4, 6, '#20120a');
      const sw = Math.round(Math.sin(t * 3.2) * 1.2); px(X + 7 + sw, by - 4, C.gold); line(X + 7, by - 8, X + 7 + sw, by - 4, C.gold2);
      break;
    }
    case 'bed': {
      box(X + 1, by - 4, 12, 4, '#d8d2c8', '#3a2416', 9);
      rect(X + 2, by - 12, 10, 3, '#f0ece4');
      rect(X + 1, by - 8, 12, 4, '#6e1c2a'); rect(X + 1, by - 8, 12, 1, '#8a2a3a');
      rect(X + 2, by - 1, 10, 1, '#0a0608');
      if (f.occupied && ((t * 2) | 0) % 4 === 0) px(X + 4, by - 1, '#ffffff');
      break;
    }
    case 'tub': {
      box(X + 1, by - 5, 12, 5, '#e8e8e2', '#cfd2cc', 8);
      rect(X + 3, by - 11, 8, 5, '#4f7f8c'); rect(X + 3, by - 11, 8, 1, '#7fb0bc');
      // shower curtain
      rect(X + 1, by - 16, 12, 1, '#9aa0a8'); for (let i = 0; i < 6; i++) line(X + 1 + i * 2, by - 15, X + 1 + i * 2 + (f.occupied ? Math.sin(t * 4 + i) : 0), by - 6, i % 2 ? '#b8c8d8' : '#98a8c0');
      px(X + 2, by, '#8a8a84'); px(X + 11, by, '#8a8a84');
      break;
    }
    case 'toilet': {
      rect(X + 3, by - 13, 8, 4, C.ink); rect(X + 4, by - 12, 6, 3, '#e8e8e2');
      ellipse(X + 7, by - 6, 4.2, 3.4, 0, C.ink); ellipse(X + 7, by - 6, 3.4, 2.7, 0, '#eeeeea');
      ellipse(X + 7, by - 6, 2, 1.4, 0, '#3c6e7c');
      rect(X + 5, by - 3, 4, 2, '#cfd2cc');
      if (G.toiletCd > 0) { const k = G.toiletCd / CFG.TOILET_CD; L.globalAlpha = 0.6 * k; ellipse(X + 7, by - 6, 2, 1.4, t * 8, '#9fd8ea'); L.globalAlpha = 1; }
      break;
    }
    case 'sink': {
      rect(X + 3, by - 9, 8, 6, C.ink); ellipse(X + 7, by - 6, 3.2, 2.3, 0, '#e8e8e2'); ellipse(X + 7, by - 6, 1.8, 1.1, 0, '#6a7a80'); px(X + 7, by - 9, '#b8bcc4');
      rect(X + 4, by - 14, 6, 4, '#2a3236'); rect(X + 5, by - 13, 4, 2, '#5a6a72');
      break;
    }
    case 'lamp': {
      box(X + 4, by - 4, 6, 4, '#3a2416', '#2a1a10', 4);
      ellipse(X + 7, by - 11, 3, 2, 0, C.ink); ellipse(X + 7, by - 11, 2.4, 1.5, 0, '#f2d27a');
      line(X + 7, by - 9, X + 7, by - 8, '#2a1a10');
      break;
    }
    case 'bookshelf': {
      box(X + 1, by - 12, 12, 12, '#3a2416', '#2c1a10', 4);
      for (let r = 0; r < 3; r++) {
        rect(X + 1, by - 12 + r * 4 + 3, 12, 1, '#4e2f1a');
        for (let i = 0; i < 11; i++) { const h = hash2(f.x * 31 + i, f.y * 17 + r); if (h < 0.85) rect(X + 2 + i, by - 12 + r * 4, 1, 3, ['#7a2a2a', '#2a4a6a', '#5a6a2a', '#8a6a2a', '#4a2a5a'][(h * 5) | 0]); }
      }
      break;
    }
    case 'desk': {
      box(X + 1, by - 5, 12, 5, '#5b3d22', '#3a2416', 8);
      rect(X + 3, by - 12, 4, 3, '#e8e2d0'); rect(X + 8, by - 11, 3, 2, '#d8d0bc');
      disc(X + 10, by - 9, 1.2, '#efe9d8'); px(X + 10, by - 11, '#ffb347');
      break;
    }
    case 'stove': {
      box(X + 1, by - 6, 12, 6, '#2a2a2e', '#1e1e22', 8);
      for (const [a, b] of [[4, 11], [10, 11], [4, 8], [10, 8]]) ring(X + a, by - b + 1, 1.6, '#55555c');
      rect(X + 3, by - 5, 8, 3, '#3a3a40'); rect(X + 4, by - 4, 6, 1, '#6a3a20');
      break;
    }
    case 'counter': {
      box(X + 1, by - 6, 12, 6, '#7a5a3a', '#4e3420', 8);
      rect(X + 3, by - 12, 5, 4, '#b8956a'); px(X + 5, by - 10, C.blood2); px(X + 6, by - 11, C.blood);
      rect(X + 9, by - 13, 2, 4, '#2a1a10'); line(X + 9, by - 15, X + 9, by - 13, '#d8dce2'); line(X + 10, by - 16, X + 10, by - 13, '#d8dce2');
      break;
    }
    case 'table': {
      ellipse(X + 7, by - 6, 6, 4.4, 0, C.ink); ellipse(X + 7, by - 6, 5.2, 3.6, 0, '#4a2c1a'); ellipse(X + 7, by - 7, 4, 2.4, 0, '#5a3822');
      rect(X + 6, by - 3, 2, 3, '#2a1a10');
      rect(X + 7, by - 11, 1, 3, '#efe9d8'); px(X + 7, by - 12, ((t * 9) | 0) % 2 ? '#ffd27a' : '#ff9a3a');
      break;
    }
    case 'piano': {
      box(X + 1, by - 7, 12, 7, '#141216', '#0e0c10', 7);
      rect(X + 2, by - 9, 10, 2, '#efece4'); for (let i = 0; i < 5; i++) px(X + 3 + i * 2, by - 9, '#141216');
      px(X + 3, by - 13, '#3a3640');
      break;
    }
    case 'sofa': {
      box(X + 1, by - 5, 12, 5, '#7a1a26', '#5a121c', 8);
      rect(X + 1, by - 13, 12, 3, '#8e2230'); rect(X + 2, by - 9, 4, 3, '#9a2a38'); rect(X + 8, by - 9, 4, 3, '#9a2a38');
      break;
    }
    case 'plant': {
      rect(X + 4, by - 5, 6, 5, C.ink); rect(X + 5, by - 4, 4, 4, '#9a4a2a');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.sin(t + i) * 0.1; disc(X + 7 + Math.cos(a) * 3, by - 9 + Math.sin(a) * 2.4, 1.6, i % 2 ? '#2a4a2a' : '#365a32'); }
      break;
    }
  }
}

function drawDoor(d, X, Y, t) {
  const TS = CFG.TS;
  const sh = d.shake > 0 ? Math.round(Math.sin(t * 70) * 1) : 0;
  X += sh;
  if (d.horiz) {
    // passage runs west↔east; the door stands edge-on in a N–S wall
    rect(X + 5, Y - 4, 4, 2, C.ink); rect(X + 5, Y + TS - 2, 4, 2, C.ink);
    if (d.state === 'locked') {
      rect(X + 4, Y - 6, 6, TS + 5, C.ink);
      rect(X + 5, Y - 5, 4, TS + 3, C.doorLocked);
      line(X + 7, Y - 5, X + 7, Y + TS - 3, shade(C.doorLocked, 0.7));
      rect(X + 5, Y + 2, 4, 3, C.brass); px(X + 6, Y + 3, C.ink); px(X + 7, Y + 3, C.ink);
      crackOverlay(X + 5, Y - 5, 4, TS + 3, d.bash);
    } else if (d.state === 'open') {
      rect(X + 1, Y - 5, 3, 8, C.ink); rect(X + 2, Y - 4, 1, 6, C.door);   // swung leaf
    } else {
      px(X + 3, Y + 6, C.door); px(X + 9, Y + 9, C.door2); px(X + 6, Y + 11, C.door); px(X + 10, Y + 4, C.door2);
    }
  } else {
    // passage runs north↕south; we see the door's face in an E–W wall
    rect(X, Y - 5, 2, TS + 5, C.ink); rect(X + TS - 2, Y - 5, 2, TS + 5, C.ink);
    rect(X, Y - 6, TS, 2, '#2a1a12');
    if (d.state === 'locked') {
      rect(X + 1, Y - 4, TS - 2, TS + 3, C.ink);
      rect(X + 2, Y - 3, TS - 4, TS + 1, C.doorLocked);
      for (let i = 0; i < 3; i++) line(X + 3 + i * 3, Y - 3, X + 3 + i * 3, Y + TS - 3, shade(C.doorLocked, 0.75));
      rect(X + 5, Y + 3, 4, 4, C.brass); rect(X + 6, Y + 4, 2, 2, C.brass2); px(X + 6, Y + 5, C.ink);
      crackOverlay(X + 2, Y - 3, TS - 4, TS + 1, d.bash);
    } else if (d.state === 'open') {
      rect(X + 2, Y - 4, 2, TS - 2, C.door); rect(X + 2, Y - 4, 1, TS - 2, C.door2);
    } else {
      px(X + 3, Y + 4, C.door); px(X + 9, Y + 8, C.door2); px(X + 5, Y + 11, C.door); px(X + 11, Y + 2, C.door2); px(X + 7, Y + 6, C.door);
    }
  }
}
function crackOverlay(x, y, w, h, f) {
  if (f <= 0.05) return;
  const n = Math.floor(f * 6);
  for (let i = 0; i < n; i++) {
    const sx = x + hash2(i, 7) * w, sy = y + hash2(i, 13) * h;
    line(sx, sy, sx + (hash2(i, 3) - 0.5) * 6, sy + (hash2(i, 5) - 0.5) * 6, '#2a0c08');
  }
}

function drawKey(X, Y, t) {
  const b = Math.round(Math.sin(t * 4) * 1);
  Y += b;
  groundShadow(X, Y + 3 - b, 3, 1, 0.35);
  ring(X - 2, Y, 1.6, C.ink); rect(X - 1, Y - 1, 6, 3, C.ink);
  ring(X - 2, Y, 1.1, C.key); rect(X - 1, Y, 5, 1, C.key); px(X + 2, Y + 1, C.key); px(X + 4, Y + 1, C.key);
  if ((t * 1.5) % 1 < 0.15) { px(X + 4, Y - 2, '#ffffff'); }
}

function drawLaurel(X, Y, t) {
  const b = Math.sin(t * 2.4) * 1.2;
  Y += Math.round(b);
  groundShadow(X, Y + 6 - Math.round(b), 4, 1.5, 0.3);
  const n = 12;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 1.76;
    const lx = X + Math.cos(a) * 4.2, ly = Y + Math.sin(a) * 4.2;
    const lo = Math.sin(a) > 0.2;
    if (pass === 0) ellipse(lx, ly, 2.1, 1.3, a + Math.PI / 2 + 0.5, C.ink);
    else ellipse(lx, ly, 1.5, 0.8, a + Math.PI / 2 + 0.5, lo ? C.laurel2 : C.laurel);
  }
  px(X - 1, Y + 4, C.red); px(X + 1, Y + 4, C.red); px(X, Y + 5, C.red);
  const sp = (t * 1.3) % 1;
  if (sp < 0.2) { const a = t * 2; px(X + Math.cos(a) * 5, Y + Math.sin(a) * 5, '#ffffff'); }
}

function drawAItem(X, Y, t) {
  const b = Math.round(Math.sin(t * 3) * 1);
  Y += b;
  disc(X, Y, 5.4, C.ink); disc(X, Y, 4.6, C.gold2); disc(X, Y, 3.8, C.gold);
  text5('A', X - 2, Y - 3, C.ink);
}

function drawHoney(X, Y, t, active) {
  L.globalAlpha = 0.95;
  ellipse(X, Y, 5.4, 3.2, 0, C.honey2);
  ellipse(X - 0.5, Y - 0.4, 4.4, 2.4, 0, C.honey);
  px(X - 2, Y - 1, '#ffe08a'); px(X + 2, Y, '#ffd060');
  L.globalAlpha = 1;
}

function drawCandle(X, Y, t, fake, lit = true) {
  rect(X - 2, Y - 6, 4, 7, C.ink);
  rect(X - 1, Y - 5, 2, 5, '#efe9d8'); px(X - 1, Y - 2, '#d8d0b8'); px(X + 1, Y - 1, '#f8f4e8');
  rect(X - 3, Y, 6, 2, C.ink); rect(X - 2, Y, 4, 1, '#cfc6ae');
  if (!lit) return;
  // fake candles flicker in a different (steady) rhythm with a slightly greener flame
  const fl = fake ? (((t * 5) | 0) % 2) : ((Math.sin(t * 17) + Math.sin(t * 7.3)) > 0 ? 1 : 0);
  const outer = fake ? '#f0d878' : '#ffb347', inner = fake ? '#fff0b0' : '#fff2c0';
  px(X, Y - 7, outer); px(X, Y - 8, fl ? outer : inner); if (fl) px(X, Y - 9, outer);
  px(X - 1 + fl, Y - 7, inner);
}

function drawWell(X, Y, t, sealed, ripple) {
  ellipse(X, Y, 7, 4.6, 0, C.ink);
  ellipse(X, Y, 6.2, 3.9, 0, '#5a5a62');
  ellipse(X, Y - 0.6, 4.4, 2.6, 0, '#0c1418');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; px(X + Math.cos(a) * 5.4, Y + Math.sin(a) * 3.4, '#75757e'); }
  if (sealed) {
    line(X - 4, Y - 2, X + 4, Y + 1, '#6b4326'); line(X - 4, Y + 1, X + 4, Y - 2, '#6b4326');
    rect(X - 1, Y - 3, 3, 5, '#efe6c8'); px(X, Y - 2, C.red); px(X, Y, C.red);
  } else if (ripple > 0) {
    L.globalAlpha = Math.min(1, ripple * 2);
    ellipse(X, Y - 0.6, 4 * (1 - (ripple % 0.5)), 2.2 * (1 - (ripple % 0.5)), 0, '#3a6a7a');
    ellipse(X, Y - 0.6, 3 * (1 - (ripple % 0.5)), 1.4 * (1 - (ripple % 0.5)), 0, '#0c1418');
    L.globalAlpha = 1;
  }
}

// ── icons ──
function iconEye(X, Y, t) {
  const blink = ((t * 2) % 3) < 0.15;
  ellipse(X, Y, 5, blink ? 1 : 3, 0, C.ink);
  if (blink) return;
  ellipse(X, Y, 4, 2.2, 0, '#f4efe6');
  disc(X, Y, 1.8, '#c1263a'); px(X, Y, '#100'); px(X - 1, Y - 1, '#ffffff');
}
function iconSiren(X, Y, t) {
  const on = ((t * 8) | 0) % 2;
  rect(X - 4, Y + 1, 8, 2, C.ink);
  disc(X, Y, 3.2, C.ink); disc(X, Y, 2.4, on ? '#ff3030' : '#3060ff');
  px(X - 1, Y - 1, '#ffffff');
  if (on) { line(X - 6, Y - 3, X - 4, Y - 2, '#ff6060'); line(X + 6, Y - 3, X + 4, Y - 2, '#ff6060'); px(X, Y - 6, '#ff6060'); }
}
function iconGauge(X, Y, f, c = C.red) {
  disc(X, Y, 5, C.ink);
  disc(X, Y, 4, '#2a2028');
  for (let r = 1; r <= 4; r += 0.5) ring(X, Y, r, c, f);
}
function iconStars(X, Y, t) {
  for (let i = 0; i < 3; i++) { const a = t * 6 + (i / 3) * TAU; px(X + Math.cos(a) * 4, Y + Math.sin(a) * 1.6, i % 2 ? C.gold : '#ffffff'); }
}
function iconHeart(X, Y, full) {
  const c = full ? C.red : '#3a2a30';
  rect(X, Y + 1, 5, 2, C.ink); rect(X - 1, Y, 7, 3, C.ink); rect(X + 1, Y + 3, 3, 2, C.ink);
  px(X, Y, c); px(X + 1, Y, c); px(X + 3, Y, c); px(X + 4, Y, c);
  rect(X, Y + 1, 5, 1, c); rect(X + 1, Y + 2, 3, 1, c); px(X + 2, Y + 3, c);
  if (full) px(X, Y, '#ff9aa2');
}
function iconGrade(X, Y, g, pop) {
  const cols = ['#8a8a92', '#3a7ad8', '#e8902a', '#e0303a'];
  const s = 1 + pop * 0.6;
  const w = Math.round(9 * s);
  rect(X - w / 2 - 1, Y - w / 2 - 1, w + 2, w + 2, C.ink);
  rect(X - w / 2, Y - w / 2, w, w, cols[g]);
  rect(X - w / 2, Y - w / 2, w, 1, shade(cols[g], 1.3));
  text3('CBAS'[g], X + 0.5, Y - 2, '#ffffff', 1, 'center');
}
