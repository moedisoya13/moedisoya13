// ─────────────────────────────────────────────────────────────
// Punishment sequence — a full-res comic panel ("극화체").
// Left: the muscle-giant hero holding the killer by the collar, fist
// raised. Right: the killer. Three lightning marks fly into the fist;
// tap on time to charge it (effects only, no judgement text).
// Damage = charge level; 3 = one-hit KO.
// Design space: 1000 × 1800, fitted to the screen.
// ─────────────────────────────────────────────────────────────

const INK = '#0a0608';
const Comic = {
  W: 1000, H: 1800, WIN: 0.17,

  start(k) {
    this.k = k; this.kind = k.kind; this.stage = k.stage || null;
    this.t = 0; this.charge = 0; this.done = false; this.punchT = null; this.impactT = null; this.endT = null;
    this.hpBefore = k.hp; this.hpAfter = k.hp; this.ko = false;
    this.marks = [1.0, 1.75, 2.5].map((t0) => ({ t0, arrive: t0 + 1.0, state: 'fly', resT: 0 }));
    this.parts = []; this.arcs = []; this.shake = 0; this.flash = 0; this.fade = 0;
    this.seed = Math.random() * 1000;
    this.layout();
    this.cache = null;
    Sfx.stopDrone();
  },
  layout() {
    const pw = Screen.pw, ph = Screen.ph;
    const s = Math.min(pw / this.W, ph / this.H * 1.08);
    this.s = s; this.ox = (pw - this.W * s) / 2; this.oy = Math.max(0, (ph - this.H * s) / 2);
  },

  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.r2 = (p.r2 || 0) + (p.spin || 0) * dt;
      if (p.t > p.life) this.parts.splice(i, 1);
    }
    if (!this.punchT && Input.tapped()) {
      let best = null, bd = Infinity;
      for (const m of this.marks) if (m.state === 'fly') { const d = Math.abs(this.t - m.arrive); if (d < bd) { bd = d; best = m; } }
      if (best && bd <= this.WIN) this.hitMark(best);
    }
    for (const m of this.marks) if (m.state === 'fly' && this.t > m.arrive + this.WIN) this.missMark(m);
    if (!this.punchT && this.marks.every((m) => m.state !== 'fly')) this.punchT = this.t + 0.45;
    if (this.punchT && !this.impactT && this.t >= this.punchT + 0.2) this.impact();
    if (this.impactT && !this.endT && this.t >= this.impactT + (this.ko ? 2.4 : 1.6)) this.endT = this.t;
    if (this.endT) { this.fade = Math.min(1, (this.t - this.endT) / 0.45); if (this.fade >= 1) this.done = true; }
  },
  fist() { return [200 + Math.sin(this.t * 3) * 6, 360 + Math.sin(this.t * 2.2) * 8]; },
  hitMark(m) {
    m.state = 'hit'; m.resT = this.t;
    this.charge++;
    Sfx.zap(this.charge);
    this.shake = 10 + this.charge * 4; this.flash = 0.25;
    const [fx, fy] = this.fist();
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU), sp = rand(300, 900); this.parts.push({ kind: 'spark', x: fx, y: fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.55), t: 0, c: pick(['#ffffff', '#fff3b0', '#ffd23f', '#9fe8ff']) }); }
    this.parts.push({ kind: 'ring', x: fx, y: fy, vx: 0, vy: 0, life: 0.35, t: 0, c: '#fff3b0' });
  },
  missMark(m) {
    m.state = 'miss'; m.resT = this.t;
    Sfx.fizz();
    const [x, y] = this.markPos(m.arrive);
    for (let i = 0; i < 10; i++) this.parts.push({ kind: 'smoke', x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-60, 60), vy: rand(-120, -30), life: rand(0.4, 0.8), t: 0, c: '#5a5560' });
  },
  impact() {
    this.impactT = this.t;
    const dmg = this.charge;
    this.hpAfter = Math.max(0, this.hpBefore - dmg);
    this.ko = this.hpAfter <= 0;
    if (dmg === 0) { Sfx.whiff(); return; }
    Sfx.punch(dmg);
    this.shake = 30 + dmg * 10; this.flash = 0.9;
    const hx = 760, hy = 740;
    for (let i = 0; i < 14 + dmg * 8; i++) { const a = rand(-1.2, 0.6), sp = rand(500, 1400); this.parts.push({ kind: 'spark', x: hx, y: hy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), t: 0, c: pick(['#ffffff', '#fff3b0', '#ffd23f']) }); }
    for (let i = 0; i < 2 + dmg; i++) this.parts.push({ kind: 'tooth', x: hx + 40, y: hy + 40, vx: rand(200, 700), vy: rand(-700, -300), g: 2200, life: 1.4, t: 0, spin: rand(-12, 12) });
    for (let i = 0; i < 6; i++) this.parts.push({ kind: 'sweat', x: hx + rand(-60, 60), y: hy - 80, vx: rand(-300, 400), vy: rand(-600, -200), g: 1800, life: 1.0, t: 0 });
  },
  markPos(tArrive, now = this.t) {
    // bezier from top-right into the raised fist
    const u = clamp(1 - (tArrive - now) / 1.0, 0, 1.15);
    const [fx, fy] = this.fist();
    const p0 = [1120, 120], p1 = [700, -40], p2 = [fx, fy];
    const v = Math.min(u, 1);
    const x = (1 - v) * (1 - v) * p0[0] + 2 * (1 - v) * v * p1[0] + v * v * p2[0];
    const y = (1 - v) * (1 - v) * p0[1] + 2 * (1 - v) * v * p1[1] + v * v * p2[1];
    return [x, y, u];
  },

  // ── drawing ──
  draw() {
    const ctx = Screen.ctx;
    if (!this.cache || this.cache.pw !== Screen.pw || this.cache.ph !== Screen.ph) { this.layout(); this.buildCache(); }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120306'; ctx.fillRect(0, 0, Screen.pw, Screen.ph);
    const sh = this.shake;
    const jx = sh ? rand(-sh, sh) * this.s : 0, jy = sh ? rand(-sh, sh) * this.s : 0;
    const intro = Math.min(1, this.t / 0.35);
    const zoom = 1 + (1 - Ease.outBack(intro)) * 0.25;
    ctx.translate(Screen.pw / 2 + jx, Screen.ph / 2 + jy);
    ctx.scale(zoom, zoom);
    ctx.translate(-Screen.pw / 2, -Screen.ph / 2);
    ctx.drawImage(this.cache.bg, 0, 0);
    ctx.setTransform(this.s * zoom, 0, 0, this.s * zoom, Screen.pw / 2 + jx - (Screen.pw / 2 - this.ox) * zoom, Screen.ph / 2 + jy - (Screen.ph / 2 - this.oy) * zoom);
    const t = this.t;

    // punch kinematics
    let lunge = 0, punchF = 0;
    if (this.punchT && t >= this.punchT) { punchF = clamp((t - this.punchT) / 0.2, 0, 1); lunge = Ease.outCubic(punchF) * 150; }
    if (this.impactT) lunge = 150 - Ease.outCubic(clamp((t - this.impactT - 0.4) / 0.6, 0, 1)) * 60;
    const whiff = this.impactT && this.charge === 0;
    // killer recoil
    let rec = 0;
    if (this.impactT && !whiff) rec = Math.exp(-(t - this.impactT) * 3) * (this.ko ? 1.3 : 1);
    const duck = whiff ? Math.min(1, (t - this.impactT) * 6) : (this.punchT && this.charge === 0 && t > this.punchT ? clamp((t - this.punchT) / 0.15, 0, 1) : 0);
    const tremble = Math.sin(t * 40) * 3;
    ctx.save();
    ctx.translate(rec * 90 + (this.ko && this.impactT ? Math.min(1, (t - this.impactT) / 1.2) * 40 : 0), rec * 30 + duck * 90);
    ctx.drawImage(this.cache.killerBody, 0, 0, this.W, this.H);
    drawComicKillerHead(ctx, this.kind, this.stage, { t, react: rec, ko: this.ko && this.impactT && t > this.impactT + 0.15, tremble, duck });
    ctx.restore();

    // hero
    ctx.save();
    ctx.translate(lunge, Math.sin(t * 2) * 4);
    ctx.drawImage(this.cache.heroBody, 0, 0, this.W, this.H);
    drawComicHeroHead(ctx, t, this.charge);
    // grabbing hand on the collar (drawn over the killer)
    drawGrabHand(ctx, rec * 70 - lunge * 0.4, rec * 25 + duck * 60);
    // raised / punching arm
    const S = [175, 820];
    let target, elbowUp = true;
    if (this.punchT && t >= this.punchT) {
      const k = Ease.inCubic(punchF);
      const [fx, fy] = this.fist();
      const tx = whiff ? 780 : 735, ty = whiff ? 580 : 680;
      target = [lerp(fx, tx - lunge, k), lerp(fy, ty, k)];
      elbowUp = true; // overhead smash: the arm arcs above the head, never across the face
      if (this.impactT) target = [tx - lunge + (whiff ? 40 : 0), ty];
    } else target = this.fist();
    drawHeroArm(ctx, S, target, elbowUp, this.charge, t);
    ctx.restore();

    // target ring + lightning marks
    if (!this.punchT) {
      const [fx, fy] = this.fist();
      const pulse = 1 + Math.sin(t * 8) * 0.05;
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,243,176,0.85)';
      ctx.beginPath(); ctx.arc(fx, fy, 128 * pulse, 0, TAU); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(fx, fy, 140 * pulse, 0, TAU); ctx.stroke();
      for (const m of this.marks) {
        if (m.state === 'hit') continue;
        if (t < m.t0) continue;
        const [x, y, u] = this.markPos(m.arrive);
        if (m.state === 'miss') continue;
        drawBoltMark(ctx, x, y, 1 + (1 - Math.min(u, 1)) * 0.3, t, u);
      }
    }

    // particles
    for (const p of this.parts) drawComicPart(ctx, p);
    // impact burst
    if (this.impactT && !whiff) {
      const f = (t - this.impactT);
      if (f < 0.5) drawImpactStar(ctx, 700, 700, 1 + this.charge * 0.35, f);
    }
    // killer hearts
    drawComicHearts(ctx, this);
    ctx.restore();

    // impact frame flash + panel frame
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,252,240,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, Screen.pw, Screen.ph); }
    const b = Math.max(6, Screen.pw * 0.018);
    ctx.strokeStyle = INK; ctx.lineWidth = b * 2; ctx.strokeRect(0, 0, Screen.pw, Screen.ph);
    ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = b * 0.4; ctx.strokeRect(b * 1.3, b * 1.3, Screen.pw - b * 2.6, Screen.ph - b * 2.6);
    if (t < 0.9) { // tap hint: a pulsing finger, no words
      const a = (1 - t / 0.9);
      drawTapHint(ctx, Screen.pw * 0.5, Screen.ph * 0.88, Screen.pw * 0.07, a, t);
    }
    if (this.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${this.fade})`; ctx.fillRect(0, 0, Screen.pw, Screen.ph); }
    ctx.restore();
  },

  buildCache() {
    const pw = Screen.pw, ph = Screen.ph;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    // background in device space
    const bg = mk(pw, ph), g = bg.getContext('2d');
    g.setTransform(this.s, 0, 0, this.s, this.ox, this.oy);
    drawComicBackground(g, this.W, this.H, (this.oy / this.s), (Screen.ph / this.s));
    // character layers in design space (scaled ×s, drawn back with the main transform)
    const res = Math.min(1, this.s * 1.15);
    const hero = mk(Math.ceil(this.W * res), Math.ceil(this.H * res)), hg = hero.getContext('2d');
    hg.scale(res, res); drawComicHeroBody(hg);
    const kb = mk(Math.ceil(this.W * res), Math.ceil(this.H * res)), kg = kb.getContext('2d');
    kg.scale(res, res); drawComicKillerBody(kg, this.kind, this.stage);
    this.cache = { pw, ph, bg, heroBody: hero, killerBody: kb };
  },
};

// ═════════════ comic drawing helpers (design space) ═════════════
function ink(g, build, fill, lw = 9) {
  g.beginPath(); build(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
function hatch(g, build, ang, gap, lw, box, col = 'rgba(10,6,8,0.55)') {
  g.save(); g.beginPath(); build(g); g.clip();
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
  const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 10;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let o = -R; o <= R; o += gap) { g.moveTo(cx + ca * -R - sa * o, cy + sa * -R + ca * o); g.lineTo(cx + ca * R - sa * o, cy + sa * R + ca * o); }
  g.stroke(); g.restore();
}
function halftone(g, build, box, gap, rf, col = 'rgba(10,6,8,0.45)') {
  g.save(); g.beginPath(); build(g); g.clip(); g.fillStyle = col;
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y += gap) for (let x = x0 + ((y / gap) % 2) * gap / 2; x < x1; x += gap) { const r = rf(x, y); if (r > 0.3) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } }
  g.restore();
}
// volume: radial / linear gradients that light a shape from the upper-left
function volR(g, x, y, r, base, k1 = 1.3, k2 = 0.55) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.15);
  gr.addColorStop(0, shade(base, k1)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, k2));
  return gr;
}
function volL(g, x0, y0, x1, y1, base, k1 = 1.3, k2 = 0.55) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, shade(base, k1)); gr.addColorStop(0.45, base); gr.addColorStop(1, shade(base, k2));
  return gr;
}
const P2 = (pts) => (g) => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };

function drawComicBackground(g, W, H, top, visH) {
  const y0 = -top - 50, y1 = -top + visH + 50;
  g.fillStyle = '#7a0a12'; g.fillRect(-200, y0, W + 400, y1 - y0);
  const cx = 620, cy = 760;
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU, a1 = ((i + 0.5) / 40) * TAU;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * 3000, cy + Math.sin(a0) * 3000); g.lineTo(cx + Math.cos(a1) * 3000, cy + Math.sin(a1) * 3000); g.closePath();
    g.fillStyle = i % 2 ? '#c4151f' : '#a10f19'; g.fill();
  }
  const rg = g.createRadialGradient(cx, cy, 30, cx, cy, 700);
  rg.addColorStop(0, 'rgba(255,214,90,0.9)'); rg.addColorStop(0.35, 'rgba(255,90,40,0.45)'); rg.addColorStop(1, 'rgba(120,0,10,0)');
  g.fillStyle = rg; g.fillRect(-200, y0, W + 400, y1 - y0);
  halftone(g, (q) => q.rect(-200, y0, W + 400, y1 - y0), [-200, y0, W + 200, y1], 26, (x, y) => clamp((Math.hypot(x - cx, y - cy) - 250) / 90, 0, 9), 'rgba(40,0,6,0.55)');
  // speed lines
  g.strokeStyle = 'rgba(255,240,220,0.35)'; g.lineWidth = 4;
  for (let i = 0; i < 70; i++) { const a = rand(0, TAU), r0 = rand(420, 700); g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * 2000, cy + Math.sin(a) * 2000); g.stroke(); }
  const vg = g.createRadialGradient(cx, cy, 500, cx, cy, 1400);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(-200, y0, W + 400, y1 - y0);
  // ground shadow band
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-200, 1560, W + 400, y1 - 1560);
}

// ── hero ──
const HERO = { red: '#c8202c', red2: '#8e1520', red3: '#e8404a', skin: '#e9a77b', skin2: '#b9724c', gold: '#ffcf3a', gold2: '#b8861a', cape: '#f2ead8', cape2: '#c9bda3' };

function drawComicHeroBody(g) {
  // cape
  const capeG = g.createLinearGradient(-60, 1300, 545, 1300);
  capeG.addColorStop(0, '#a99d84'); capeG.addColorStop(0.35, '#f6efe0'); capeG.addColorStop(0.7, '#e2d8c2'); capeG.addColorStop(1, '#b8ac93');
  ink(g, (q) => { q.moveTo(150, 790); q.bezierCurveTo(30, 920, -80, 1300, -60, 1820); q.lineTo(430, 1820); q.bezierCurveTo(400, 1500, 480, 1150, 545, 860); q.closePath(); }, capeG, 10);
  ink(g, (q) => { q.moveTo(170, 860); q.bezierCurveTo(90, 1050, 40, 1400, 60, 1820); q.lineTo(150, 1820); q.bezierCurveTo(130, 1450, 160, 1100, 230, 880); q.closePath(); }, HERO.cape2, 0);
  ink(g, (q) => { q.moveTo(330, 980); q.bezierCurveTo(300, 1250, 290, 1550, 300, 1820); q.lineTo(360, 1820); q.bezierCurveTo(350, 1550, 360, 1250, 400, 1000); q.closePath(); }, HERO.cape2, 0);
  g.lineWidth = 12; g.strokeStyle = HERO.gold; g.beginPath(); g.moveTo(140, 800); g.bezierCurveTo(25, 925, -70, 1300, -50, 1820); g.stroke();
  // neck
  ink(g, P2([285, 690, 425, 680, 450, 820, 265, 830]), volL(g, 265, 0, 450, 0, HERO.skin, 0.75, 1.1), 9);
  hatch(g, P2([285, 690, 350, 690, 330, 830, 265, 830]), 0.9, 14, 3, [265, 680, 450, 830]);
  // torso
  const torso = (q) => { q.moveTo(140, 805); q.bezierCurveTo(200, 755, 480, 760, 570, 850); q.bezierCurveTo(620, 960, 530, 1160, 480, 1310); q.lineTo(255, 1330); q.bezierCurveTo(215, 1150, 120, 1010, 140, 805); q.closePath(); };
  ink(g, torso, volR(g, 360, 900, 430, HERO.red, 1.3, 0.48), 11);
  hatch(g, torso, -0.7, 15, 4, [120, 750, 620, 1330], 'rgba(60,0,8,0.35)');
  // pecs
  const pecL = (q) => { q.moveTo(180, 880); q.bezierCurveTo(220, 820, 340, 815, 365, 900); q.bezierCurveTo(345, 975, 230, 990, 180, 935); q.closePath(); };
  const pecR = (q) => { q.moveTo(372, 900); q.bezierCurveTo(395, 835, 505, 845, 540, 910); q.bezierCurveTo(520, 980, 420, 990, 372, 945); q.closePath(); };
  ink(g, pecL, volR(g, 270, 900, 110, HERO.red3, 1.25, 0.7), 7); ink(g, pecR, volR(g, 455, 905, 100, HERO.red, 1.2, 0.62), 7);
  hatch(g, pecL, 0.2, 13, 3, [180, 815, 365, 990], 'rgba(60,0,8,0.4)');
  g.strokeStyle = 'rgba(255,200,200,0.55)'; g.lineWidth = 8; g.beginPath(); g.moveTo(215, 865); g.quadraticCurveTo(270, 838, 330, 860); g.stroke();
  // abs
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const x = 285 + c * 95 - r * 8, y = 1010 + r * 85;
    ink(g, (q) => { q.moveTo(x, y); q.quadraticCurveTo(x + 40, y - 12, x + 80, y); q.quadraticCurveTo(x + 84, y + 35, x + 76, y + 62); q.quadraticCurveTo(x + 38, y + 72, x + 4, y + 62); q.quadraticCurveTo(x - 4, y + 32, x, y); }, c ? HERO.red : HERO.red3, 6);
  }
  // lightning emblem
  const bolt = [338, 790, 452, 795, 395, 885, 465, 885, 300, 1060, 352, 930, 286, 930];
  ink(g, P2(bolt), HERO.gold, 10);
  g.strokeStyle = '#fff3b0'; g.lineWidth = 5; g.beginPath(); g.moveTo(350, 805); g.lineTo(430, 808); g.stroke();
  // belt
  ink(g, P2([245, 1265, 492, 1240, 500, 1310, 252, 1335]), HERO.gold, 9);
  ink(g, P2([348, 1255, 408, 1250, 412, 1318, 352, 1323]), HERO.gold2, 6);
  // shoulder caps (the arms are drawn live)
  ink(g, (q) => q.arc(520, 875, 70, 0, TAU), volR(g, 520, 875, 70, HERO.red, 1.3, 0.55), 9);
  ink(g, (q) => q.arc(175, 835, 82, 0, TAU), volR(g, 175, 835, 82, HERO.red3, 1.3, 0.6), 9);
  hatch(g, (q) => q.arc(520, 875, 70, 0, TAU), 0.8, 13, 3, [450, 805, 590, 945], 'rgba(60,0,8,0.45)');
}

function drawComicHeroHead(g, t, charge) {
  const bob = Math.sin(t * 2.4) * 3;
  g.save(); g.translate(0, bob);
  // hair back
  ink(g, (q) => { q.moveTo(275, 600); q.bezierCurveTo(255, 470, 330, 395, 430, 405); q.lineTo(470, 370); q.lineTo(462, 418); q.lineTo(515, 405); q.lineTo(490, 455); q.bezierCurveTo(500, 500, 498, 530, 492, 560); q.lineTo(285, 640); q.closePath(); }, '#16100e', 9);
  // face
  const face = (q) => { q.moveTo(292, 520); q.bezierCurveTo(296, 455, 365, 430, 425, 445); q.bezierCurveTo(478, 458, 492, 520, 488, 585); q.lineTo(482, 645); q.bezierCurveTo(476, 690, 446, 712, 402, 714); q.lineTo(332, 708); q.bezierCurveTo(300, 698, 286, 655, 287, 600); q.closePath(); };
  ink(g, face, volR(g, 420, 560, 170, HERO.skin, 1.12, 0.62), 10);
  hatch(g, (q) => { q.moveTo(287, 520); q.lineTo(360, 500); q.lineTo(340, 714); q.lineTo(287, 714); q.closePath(); }, 1.0, 12, 3.5, [280, 480, 370, 720], 'rgba(90,30,10,0.45)');
  // fringe
  ink(g, (q) => { q.moveTo(296, 540); q.bezierCurveTo(320, 470, 390, 455, 470, 470); q.lineTo(492, 505); q.bezierCurveTo(440, 488, 380, 492, 340, 520); q.lineTo(318, 575); q.closePath(); }, '#16100e', 7);
  // ear
  ink(g, (q) => { q.moveTo(300, 575); q.bezierCurveTo(270, 570, 268, 625, 300, 632); }, HERO.skin2, 7);
  // brow (furious), eye, nose, mouth
  g.fillStyle = INK; g.beginPath(); g.moveTo(398, 528); g.lineTo(482, 512); g.lineTo(486, 532); g.lineTo(404, 552); g.closePath(); g.fill();
  ink(g, P2([418, 556, 470, 546, 466, 562, 422, 570]), '#ffffff', 5);
  g.fillStyle = INK; g.fillRect(452, 549, 9, 12);
  if (charge > 0) { g.fillStyle = `rgba(160,230,255,${0.3 + charge * 0.2})`; g.beginPath(); g.ellipse(446, 557, 36, 16, -0.15, 0, TAU); g.fill(); }
  g.lineWidth = 7; g.strokeStyle = INK; g.beginPath(); g.moveTo(478, 560); g.lineTo(495, 615); g.lineTo(470, 618); g.stroke();
  ink(g, P2([408, 645, 482, 638, 478, 675, 412, 682]), '#ffffff', 6);
  g.lineWidth = 3; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(408 + i * 15, 643 - i); g.lineTo(410 + i * 15, 680 - i); g.stroke(); }
  g.beginPath(); g.moveTo(410, 662); g.lineTo(480, 656); g.stroke();
  // jaw shadow
  hatch(g, (q) => { q.moveTo(330, 690); q.lineTo(480, 660); q.lineTo(470, 712); q.lineTo(330, 712); q.closePath(); }, -0.4, 10, 3, [330, 650, 490, 715], 'rgba(90,30,10,0.5)');
  g.restore();
}

function ik2(S, T, a, b, up) {
  const dx = T[0] - S[0], dy = T[1] - S[1];
  const d = clamp(Math.hypot(dx, dy), 1, a + b - 1);
  const base = Math.atan2(dy, dx);
  const k = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const ang = base + (up ? -k : k);
  const E = [S[0] + Math.cos(ang) * a, S[1] + Math.sin(ang) * a];
  const tx = S[0] + Math.cos(base) * d, ty = S[1] + Math.sin(base) * d;
  return { E, W: [tx, ty] };
}
function limb(g, A, B, wa, wb, fill, bulge = 0) {
  const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const mx = (A[0] + B[0]) / 2 + nx * bulge, my = (A[1] + B[1]) / 2 + ny * bulge;
  if (typeof fill === 'string' && fill[0] === '#') {
    const w = Math.max(wa, wb) * 0.6;
    fill = volL(g, mx + nx * w, my + ny * w, mx - nx * w, my - ny * w, fill, 1.35, 0.5);
  }
  ink(g, (q) => {
    q.moveTo(A[0] + nx * wa / 2, A[1] + ny * wa / 2);
    q.quadraticCurveTo(mx + nx * (wa + wb) / 3, my + ny * (wa + wb) / 3, B[0] + nx * wb / 2, B[1] + ny * wb / 2);
    q.lineTo(B[0] - nx * wb / 2, B[1] - ny * wb / 2);
    q.quadraticCurveTo(mx - nx * (wa + wb) / 4, my - ny * (wa + wb) / 4, A[0] - nx * wa / 2, A[1] - ny * wa / 2);
    q.closePath();
  }, fill, 9);
}
function drawHeroArm(g, S, T, up, charge, t) {
  const { E, W } = ik2(S, T, 270, 250, up);
  limb(g, S, E, 150, 112, HERO.red3, 30);
  limb(g, E, W, 112, 96, HERO.red, 10);
  // gold cuff
  const dx = W[0] - E[0], dy = W[1] - E[1], d = Math.hypot(dx, dy) || 1;
  const cx = W[0] - (dx / d) * 40, cy = W[1] - (dy / d) * 40;
  ink(g, (q) => q.ellipse(cx, cy, 56, 34, Math.atan2(dy, dx) + Math.PI / 2, 0, TAU), HERO.gold, 8);
  // electric aura
  if (charge > 0) {
    const R = 110 + charge * 35;
    const rg = g.createRadialGradient(W[0], W[1], 20, W[0], W[1], R * 1.4);
    rg.addColorStop(0, `rgba(255,255,255,${0.35 + charge * 0.15})`); rg.addColorStop(0.5, `rgba(140,220,255,${0.18 + charge * 0.1})`); rg.addColorStop(1, 'rgba(140,220,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(W[0], W[1], R * 1.4, 0, TAU); g.fill();
  }
  // fist
  const ang = Math.atan2(dy, dx);
  g.save(); g.translate(W[0], W[1]); g.rotate(ang - Math.PI / 2);
  ink(g, (q) => { q.moveTo(-70, -10); q.bezierCurveTo(-78, 60, -50, 95, 0, 98); q.bezierCurveTo(55, 96, 78, 60, 72, -10); q.bezierCurveTo(60, -50, -55, -52, -70, -10); q.closePath(); }, volR(g, 0, 30, 95, HERO.skin, 1.2, 0.6), 9);
  for (let i = 0; i < 4; i++) ink(g, (q) => q.arc(-48 + i * 32, 74, 19, 0, TAU), volR(g, -48 + i * 32, 74, 19, HERO.skin, 1.25, 0.7), 6);
  ink(g, (q) => { q.moveTo(-60, 10); q.bezierCurveTo(-20, 30, 20, 40, 40, 30); }, null, 7);
  hatch(g, (q) => { q.moveTo(-70, -10); q.lineTo(-10, -30); q.lineTo(-20, 98); q.lineTo(-75, 60); q.closePath(); }, 0.8, 11, 3, [-80, -40, 0, 100], 'rgba(90,30,10,0.45)');
  g.restore();
  // lightning arcs crawling over the fist
  if (charge > 0) {
    const n = charge * 3;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a0 = t * 7 + i * 2.1 + Math.sin(t * 13 + i) * 0.6;
      let x = W[0] + Math.cos(a0) * 50, y = W[1] + Math.sin(a0) * 50;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += Math.cos(a0 + rand(-1.2, 1.2)) * (30 + charge * 10); y += Math.sin(a0 + rand(-1.2, 1.2)) * (30 + charge * 10); g.lineTo(x, y); }
      g.strokeStyle = 'rgba(160,230,255,0.9)'; g.lineWidth = 9; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3.5; g.stroke();
    }
  }
}
function drawGrabHand(g, ox, oy) {
  const S = [520, 875], T = [660 + ox, 905 + oy];
  const { E } = ik2(S, T, 150, 140, false);
  limb(g, S, E, 120, 100, HERO.red, 18);
  limb(g, E, T, 100, 90, HERO.red3, 6);
  ink(g, (q) => q.ellipse(T[0] - 5, T[1], 40, 26, 0.3, 0, TAU), HERO.gold, 7);
  ink(g, (q) => { q.moveTo(T[0] + 10, T[1] - 50); q.bezierCurveTo(T[0] + 90, T[1] - 60, T[0] + 100, T[1] + 40, T[0] + 30, T[1] + 55); q.bezierCurveTo(T[0] - 10, T[1] + 40, T[0] - 10, T[1] - 30, T[0] + 10, T[1] - 50); q.closePath(); }, HERO.skin, 8);
  for (let i = 0; i < 3; i++) ink(g, (q) => { q.moveTo(T[0] + 40, T[1] - 30 + i * 26); q.lineTo(T[0] + 82, T[1] - 26 + i * 26); }, null, 5);
}

// ── killers ──
const KCOL = {
  butcher: { body: '#d9cfbf', body2: '#a99f8f', skin: '#c58a5f' },
  witch: { body: '#4b2a5a', body2: '#2e1838', skin: '#bfc8ae' },
  janitor: { body: '#3b4a66', body2: '#26324a', skin: '#ecd6c0' },
  evolver: { body: '#3e5a3a', body2: '#22341f', skin: '#6f9a5a' },
  doctor: { body: '#eef0ec', body2: '#bfc6bf', skin: '#c9dcb4' },
  samurai: { body: '#9a1d1d', body2: '#5a0e0e', skin: '#2a1c1c' },
};
function drawComicKillerBody(g, kind, stage) {
  const c = KCOL[kind];
  const perfect = kind === 'evolver' && stage === 'perfect';
  if (perfect) { // wings
    for (const s of [0, 1]) ink(g, (q) => { q.moveTo(820, 900); q.bezierCurveTo(1000, 650 - s * 120, 1150, 760 - s * 80, 1120, 1050 + s * 60); q.bezierCurveTo(1000, 1000, 900, 980, 820, 960); q.closePath(); }, 'rgba(203,184,220,0.75)', 7);
  }
  const body = (q) => { q.moveTo(600, 905); q.bezierCurveTo(680, 860, 900, 860, 1010, 930); q.lineTo(1040, 1600); q.lineTo(640, 1600); q.bezierCurveTo(620, 1300, 580, 1050, 600, 905); q.closePath(); };
  ink(g, body, volL(g, 600, 900, 1040, 1350, perfect ? '#2a1e2e' : c.body, 1.25, 0.5), 11);
  hatch(g, body, 0.75, 16, 4, [580, 850, 1040, 1600], 'rgba(10,6,8,0.4)');
  switch (kind) {
    case 'butcher': {
      ink(g, P2([640, 980, 980, 990, 1010, 1600, 660, 1600]), '#e8e0d2', 9); // apron
      for (let i = 0; i < 9; i++) { g.fillStyle = i % 3 ? '#9c0f1a' : '#c11d2a'; g.beginPath(); g.ellipse(700 + ((i * 97) % 260), 1060 + ((i * 151) % 420), 16 + (i % 4) * 9, 11 + (i % 3) * 7, i, 0, TAU); g.fill(); }
      ink(g, (q) => { q.moveTo(700, 990); q.lineTo(760, 900); }, null, 12); ink(g, (q) => { q.moveTo(930, 995); q.lineTo(880, 900); }, null, 12);
      // dropped cleaver
      ink(g, P2([870, 1450, 1010, 1380, 1050, 1470, 905, 1540]), '#c9cdd3', 9);
      ink(g, P2([820, 1480, 875, 1452, 895, 1500, 840, 1528]), '#4a2a16', 7);
      break;
    }
    case 'witch': {
      for (let i = 0; i < 14; i++) ink(g, (q) => { q.moveTo(620 + i * 30, 1180 + (i % 2) * 10); q.lineTo(615 + i * 30, 1240); }, null, 5);
      ink(g, (q) => { q.moveTo(600, 920); q.bezierCurveTo(760, 1000, 900, 1000, 1020, 940); q.lineTo(1030, 1190); q.bezierCurveTo(880, 1230, 720, 1230, 610, 1190); q.closePath(); }, '#5b3470', 9);
      // clawed hand raised in fear
      ink(g, (q) => { q.moveTo(940, 1250); q.bezierCurveTo(900, 1150, 960, 1080, 1000, 1110); q.lineTo(1030, 1260); q.closePath(); }, c.skin, 7);
      for (let i = 0; i < 4; i++) ink(g, (q) => { q.moveTo(930 + i * 22, 1100 - i * 6); q.quadraticCurveTo(900 + i * 26, 1010, 930 + i * 28, 980 - i * 10); }, null, 6);
      break;
    }
    case 'janitor': {
      ink(g, P2([700, 900, 790, 1010, 760, 1080, 680, 960]), c.body2, 8);
      ink(g, P2([880, 900, 790, 1010, 830, 1080, 920, 960]), c.body2, 8);
      ink(g, P2([830, 1120, 930, 1120, 930, 1160, 830, 1160]), '#e8e0c8', 6);
      ink(g, (q) => q.arc(720, 1150, 20, 0, TAU), HERO.gold, 6);
      // broken racket
      ink(g, (q) => q.ellipse(960, 1430, 80, 110, 0.5, 0, TAU), null, 12);
      g.strokeStyle = 'rgba(10,6,8,0.5)'; g.lineWidth = 3;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(900 + i * 20, 1340); g.lineTo(1000 + i * 20, 1520); g.stroke(); }
      ink(g, (q) => { q.moveTo(900, 1530); q.lineTo(820, 1640); }, null, 16);
      break;
    }
    case 'evolver': {
      for (let i = 0; i < 6; i++) ink(g, (q) => { q.moveTo(630 + i * 6, 1000 + i * 95); q.bezierCurveTo(760, 980 + i * 95, 900, 980 + i * 95, 1020, 1000 + i * 95); }, null, 7);
      ink(g, (q) => { q.moveTo(960, 940); q.bezierCurveTo(1040, 800, 1000, 700, 960, 640); q.lineTo(900, 700); q.bezierCurveTo(950, 760, 960, 820, 920, 900); q.closePath(); }, perfect ? '#3d2b42' : '#557a4c', 8);
      break;
    }
    case 'doctor': {
      ink(g, P2([690, 900, 800, 1060, 780, 1600, 700, 1600, 640, 1040]), '#ffffff', 8);
      ink(g, P2([930, 900, 820, 1060, 840, 1600, 960, 1600, 1000, 1040]), '#f4f6f2', 8);
      ink(g, P2([790, 1060, 830, 1060, 830, 1600, 790, 1600]), '#2a2a34', 6);
      // shattered flask
      ink(g, P2([930, 1400, 990, 1380, 1010, 1470, 950, 1500]), 'rgba(140,240,140,0.7)', 7);
      g.fillStyle = 'rgba(140,240,140,0.8)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(880 + i * 30, 1530 + (i % 2) * 20, 8, 0, TAU); g.fill(); }
      break;
    }
    case 'samurai': {
      for (let r = 0; r < 7; r++) for (let i = 0; i < 6; i++) ink(g, P2([640 + i * 62, 980 + r * 78, 698 + i * 62, 980 + r * 78, 698 + i * 62, 1048 + r * 78, 640 + i * 62, 1048 + r * 78]), r % 2 ? '#7a1515' : '#9a1d1d', 4);
      for (let r = 0; r < 7; r++) { g.strokeStyle = HERO.gold; g.lineWidth = 5; g.beginPath(); g.moveTo(640, 1014 + r * 78); g.lineTo(1012, 1014 + r * 78); g.stroke(); }
      ink(g, P2([590, 880, 700, 860, 720, 1020, 600, 1040]), '#5a0e0e', 9);
      ink(g, P2([1020, 900, 920, 870, 905, 1030, 1030, 1050]), '#5a0e0e', 9);
      for (let i = 0; i < 7; i++) { g.fillStyle = '#4a060c'; g.beginPath(); g.ellipse(680 + ((i * 113) % 300), 1050 + ((i * 167) % 450), 18, 12, i, 0, TAU); g.fill(); }
      ink(g, (q) => { q.moveTo(1010, 1300); q.lineTo(860, 1650); }, null, 20);
      g.strokeStyle = '#4a2a16'; g.lineWidth = 12; g.beginPath(); g.moveTo(1010, 1300); g.lineTo(860, 1650); g.stroke();
      break;
    }
  }
  // collar where the hero grabs
  ink(g, (q) => { q.moveTo(620, 905); q.bezierCurveTo(670, 960, 720, 960, 760, 905); }, null, 10);
}

function eyesWide(g, x, y, r, pupil = 7, white = '#ffffff', iris = INK) {
  ink(g, (q) => q.ellipse(x, y, r, r * 0.8, 0, 0, TAU), white, 6);
  g.fillStyle = iris; g.beginPath(); g.arc(x + 2, y + 1, pupil, 0, TAU); g.fill();
}
function koEyes(g, x, y, r) {
  g.lineWidth = 9; g.strokeStyle = INK; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
}
function sweat(g, x, y, s, t) {
  const yy = y + ((t * 120) % 60);
  ink(g, (q) => { q.moveTo(x, yy - 22 * s); q.bezierCurveTo(x + 14 * s, yy, x + 10 * s, yy + 14 * s, x, yy + 14 * s); q.bezierCurveTo(x - 10 * s, yy + 14 * s, x - 14 * s, yy, x, yy - 22 * s); }, '#bfe6ff', 4);
}

function drawComicKillerHead(g, kind, stage, s) {
  const hx = 780, hy = 735;
  g.save();
  g.translate(hx + s.tremble, hy);
  g.rotate(s.react * 0.4 + (s.ko ? 0.25 : 0));
  g.translate(-hx, -hy);
  const ko = s.ko, t = s.t;
  switch (kind) {
    case 'butcher': {
      const spikes = (q) => { for (let i = 0; i <= 26; i++) { const a = (i / 26) * TAU, r = i % 2 ? 150 : 205; const x = hx + Math.cos(a) * r, y = hy - 10 + Math.sin(a) * r; i ? q.lineTo(x, y) : q.moveTo(x, y); } q.closePath(); };
      ink(g, spikes, '#b0601c', 10);
      hatch(g, spikes, 0.5, 14, 4, [hx - 210, hy - 220, hx + 210, hy + 200], 'rgba(60,20,0,0.45)');
      const mask = (q) => q.ellipse(hx, hy, 118, 130, 0, 0, TAU);
      ink(g, mask, volR(g, hx, hy, 130, '#e3b06c', 1.2, 0.6), 10);
      hatch(g, (q) => q.ellipse(hx - 50, hy + 20, 70, 110, 0, 0, TAU), 1.1, 12, 3, [hx - 120, hy - 100, hx, hy + 140], 'rgba(90,40,0,0.4)');
      ink(g, (q) => q.ellipse(hx + 10, hy + 60, 60, 46, 0, 0, TAU), '#f2d8a8', 7);
      ink(g, P2([hx - 10, hy + 30, hx + 34, hy + 30, hx + 12, hy + 58]), '#3a1a10', 5);
      ink(g, (q) => { q.moveTo(hx - 60, hy - 120); q.lineTo(hx - 20, hy - 40); q.lineTo(hx - 50, hy + 10); }, null, 5);
      for (const ex of [hx - 48, hx + 52]) { ink(g, (q) => q.ellipse(ex, hy - 20, 34, 26, 0, 0, TAU), INK, 0); if (ko) koEyes(g, ex, hy - 20, 16); else eyesWide(g, ex, hy - 20, 18, 5); }
      ink(g, (q) => { q.moveTo(hx - 30, hy + 98); q.quadraticCurveTo(hx + 10, hy + 80 + (ko ? 30 : 0), hx + 50, hy + 98); }, null, 7);
      if (ko) ink(g, (q) => q.ellipse(hx + 20, hy + 120, 18, 26, 0.2, 0, TAU), '#e0606a', 5);
      sweat(g, hx + 140, hy - 90, 1.2, t);
      break;
    }
    case 'witch': {
      for (let i = 0; i < 18; i++) { const a = -Math.PI + (i / 17) * Math.PI * 1.2 - 0.1; ink(g, (q) => { q.moveTo(hx + Math.cos(a) * 80, hy - 40 + Math.sin(a) * 80); q.bezierCurveTo(hx + Math.cos(a) * 170, hy + Math.sin(a) * 150, hx + Math.cos(a) * 200 + Math.sin(t * 3 + i) * 10, hy + 120 + Math.sin(a) * 120, hx + Math.cos(a) * 190, hy + 230); }, null, 9); g.strokeStyle = '#e8e4dc'; g.lineWidth = 5; g.stroke(); }
      const face = (q) => { q.moveTo(hx - 95, hy - 70); q.bezierCurveTo(hx - 90, hy - 160, hx + 90, hy - 160, hx + 100, hy - 60); q.bezierCurveTo(hx + 110, hy + 60, hx + 60, hy + 150, hx + 5, hy + 160); q.bezierCurveTo(hx - 60, hy + 150, hx - 105, hy + 60, hx - 95, hy - 70); q.closePath(); };
      ink(g, face, volR(g, hx, hy, 160, '#c3ccb0', 1.15, 0.55), 10);
      for (let i = 0; i < 4; i++) ink(g, (q) => { q.moveTo(hx - 70, hy - 100 + i * 16); q.quadraticCurveTo(hx, hy - 110 + i * 16, hx + 70, hy - 100 + i * 16); }, null, 3);
      ink(g, P2([hx + 5, hy - 40, hx + 70, hy + 40, hx + 15, hy + 45]), '#b0ba98', 7);
      for (const ex of [hx - 45, hx + 50]) { if (ko) koEyes(g, ex, hy - 45, 16); else { eyesWide(g, ex, hy - 45, 24, 9, '#fffbe8', '#c1263a'); g.fillStyle = INK; g.beginPath(); g.arc(ex + 2, hy - 44, 4, 0, TAU); g.fill(); } }
      ink(g, (q) => { q.moveTo(hx - 50, hy + 85); q.quadraticCurveTo(hx, hy + 140, hx + 55, hy + 85); q.quadraticCurveTo(hx, hy + 105, hx - 50, hy + 85); }, '#3a0a14', 6);
      for (let i = 0; i < 4; i++) ink(g, P2([hx - 30 + i * 22, hy + 92, hx - 20 + i * 22, hy + 92, hx - 25 + i * 22, hy + 110 - (i % 2) * 8]), '#e8e2c0', 3);
      sweat(g, hx + 120, hy - 60, 1, t);
      break;
    }
    case 'janitor': {
      const face = (q) => { q.moveTo(hx - 100, hy - 50); q.bezierCurveTo(hx - 100, hy - 130, hx + 100, hy - 130, hx + 105, hy - 40); q.bezierCurveTo(hx + 110, hy + 80, hx + 60, hy + 150, hx, hy + 150); q.bezierCurveTo(hx - 70, hy + 150, hx - 105, hy + 80, hx - 100, hy - 50); q.closePath(); };
      ink(g, face, volR(g, hx, hy, 150, '#ecd6c0', 1.1, 0.6), 10);
      hatch(g, (q) => q.rect(hx - 105, hy - 60, 60, 210), 1.0, 12, 3, [hx - 110, hy - 70, hx - 40, hy + 160], 'rgba(90,50,30,0.4)');
      ink(g, (q) => { q.moveTo(hx - 120, hy - 70); q.bezierCurveTo(hx - 110, hy - 200, hx + 120, hy - 210, hx + 125, hy - 70); q.closePath(); }, '#1f2a3d', 10);
      ink(g, (q) => { q.moveTo(hx - 70, hy - 70); q.bezierCurveTo(hx, hy - 50, hx + 120, hy - 55, hx + 190, hy - 30); q.lineTo(hx + 180, hy - 70); q.bezierCurveTo(hx + 100, hy - 95, hx, hy - 95, hx - 70, hy - 70); q.closePath(); }, '#141c2a', 8);
      ink(g, P2([hx - 15, hy - 160, hx + 25, hy - 160, hx + 30, hy - 120, hx - 20, hy - 120]), HERO.gold, 6);
      // sanpaku eyes: huge whites, pinprick pupils
      for (const ex of [hx - 42, hx + 48]) { if (ko) koEyes(g, ex, hy - 5, 18); else eyesWide(g, ex, hy - 5, 32, 4); }
      ink(g, (q) => q.ellipse(hx + 5, hy + 85, 34, ko ? 16 : 40, 0, 0, TAU), '#3a0a14', 7);
      sweat(g, hx - 120, hy - 20, 1.1, t); sweat(g, hx + 125, hy + 10, 0.9, t + 0.3);
      break;
    }
    case 'evolver': {
      const perfect = stage === 'perfect', larva = stage === 'larva';
      const col = perfect ? ['#2a1e2e', '#3d2b42', '#c1263a'] : larva ? ['#8f9e6a', '#b0bf86', '#e0303a'] : ['#3e5a3a', '#6f9a5a', '#ffe14a'];
      const head = (q) => { q.moveTo(hx - 130, hy - 30); q.bezierCurveTo(hx - 120, hy - 190, hx + 110, hy - 220, hx + 170, hy - 60); q.bezierCurveTo(hx + 190, hy + 40, hx + 120, hy + 150, hx + 20, hy + 170); q.bezierCurveTo(hx - 90, hy + 160, hx - 140, hy + 80, hx - 130, hy - 30); q.closePath(); };
      ink(g, head, volR(g, hx, hy - 30, 200, col[0], 1.45, 0.45), 11);
      g.strokeStyle = col[1]; g.lineWidth = 14; g.beginPath(); g.moveTo(hx - 80, hy - 120); g.quadraticCurveTo(hx + 20, hy - 180, hx + 120, hy - 110); g.stroke();
      const open = ko ? 0.4 : 1 + Math.sin(t * 5) * 0.1;
      const mouth = (q) => { q.moveTo(hx - 80, hy + 10); q.bezierCurveTo(hx - 40, hy + 10 + 140 * open, hx + 110, hy + 10 + 140 * open, hx + 150, hy + 5); q.bezierCurveTo(hx + 80, hy - 30, hx - 20, hy - 30, hx - 80, hy + 10); q.closePath(); };
      ink(g, mouth, '#5a0a14', 9);
      g.fillStyle = '#f4efe6';
      for (let i = 0; i < 9; i++) { const x = hx - 65 + i * 24; ink(g, P2([x, hy + 2 - i * 1.5, x + 18, hy - i * 1.5, x + 9, hy + 40 - (i % 2) * 12]), '#f4efe6', 3); }
      for (let i = 0; i < 8; i++) { const x = hx - 50 + i * 24; ink(g, P2([x, hy + 120 * open, x + 18, hy + 118 * open, x + 9, hy + 85 * open]), '#f4efe6', 3); }
      for (const [ex, ey] of [[hx - 60, hy - 70], [hx + 70, hy - 85]]) { if (ko) koEyes(g, ex, ey, 18); else { ink(g, (q) => q.ellipse(ex, ey, 26, 18, -0.3, 0, TAU), col[2], 6); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 6, ey - 5, 5, 0, TAU); g.fill(); } }
      g.strokeStyle = 'rgba(200,230,180,0.7)'; g.lineWidth = 6; g.beginPath(); g.moveTo(hx + 40, hy + 90 * open); g.quadraticCurveTo(hx + 45, hy + 150 * open + 40, hx + 30, hy + 200 * open + 30); g.stroke();
      break;
    }
    case 'doctor': {
      const spikes = [[-130, -40], [-150, -130], [-90, -210], [0, -240], [90, -215], [160, -140], [150, -40]];
      ink(g, (q) => { q.moveTo(hx - 110, hy - 20); for (const [x, y] of spikes) { q.lineTo(hx + x * 0.6, hy - 60 + y * 0.35); q.lineTo(hx + x, hy + y); } q.lineTo(hx + 110, hy - 20); q.closePath(); }, '#f4f6fb', 10);
      const face = (q) => { q.moveTo(hx - 100, hy - 40); q.bezierCurveTo(hx - 100, hy - 120, hx + 100, hy - 120, hx + 100, hy - 30); q.bezierCurveTo(hx + 105, hy + 90, hx + 50, hy + 155, hx - 5, hy + 150); q.bezierCurveTo(hx - 70, hy + 145, hx - 105, hy + 80, hx - 100, hy - 40); q.closePath(); };
      ink(g, face, volR(g, hx, hy, 150, '#cfe2bc', 1.12, 0.6), 10);
      for (const ex of [hx - 40, hx + 45]) ink(g, (q) => q.arc(ex, hy - 95, 30, 0, TAU), '#8fd3ff', 8);
      ink(g, (q) => { q.moveTo(hx - 75, hy - 50); q.quadraticCurveTo(hx, hy - 75, hx + 80, hy - 50); }, null, 14);
      for (const ex of [hx - 40, hx + 45]) { if (ko) koEyes(g, ex, hy - 10, 18); else eyesWide(g, ex, hy - 10, 28, 6, '#fff9d8'); }
      ink(g, (q) => q.ellipse(hx + 5, hy + 80, 46, ko ? 14 : 36, 0, 0, TAU), '#3a0a14', 7);
      g.strokeStyle = '#8be06a'; g.lineWidth = 9; g.beginPath(); g.moveTo(hx + 30, hy + 105); g.quadraticCurveTo(hx + 40, hy + 160, hx + 25, hy + 210); g.stroke();
      sweat(g, hx + 120, hy - 40, 1, t);
      break;
    }
    case 'samurai': {
      ink(g, (q) => { q.moveTo(hx - 170, hy + 60); q.bezierCurveTo(hx - 180, hy - 40, hx - 140, hy - 140, hx, hy - 150); q.bezierCurveTo(hx + 140, hy - 140, hx + 180, hy - 40, hx + 170, hy + 60); q.lineTo(hx + 210, hy + 130); q.lineTo(hx - 210, hy + 130); q.closePath(); }, '#231b1b', 10);
      for (let i = 0; i < 3; i++) ink(g, (q) => { q.moveTo(hx - 190 + i * 8, hy + 60 + i * 26); q.lineTo(hx + 190 - i * 8, hy + 60 + i * 26); }, null, 6);
      ink(g, (q) => { q.moveTo(hx - 20, hy - 140); q.bezierCurveTo(hx - 120, hy - 200, hx - 210, hy - 330, hx - 160, hy - 380); q.bezierCurveTo(hx - 150, hy - 280, hx - 80, hy - 220, hx, hy - 180); q.bezierCurveTo(hx + 80, hy - 220, hx + 150, hy - 280, hx + 160, hy - 380); q.bezierCurveTo(hx + 210, hy - 330, hx + 120, hy - 200, hx + 20, hy - 140); q.closePath(); }, HERO.gold, 9);
      const menpo = (q) => { q.moveTo(hx - 90, hy - 30); q.lineTo(hx + 90, hy - 30); q.bezierCurveTo(hx + 95, hy + 70, hx + 50, hy + 130, hx, hy + 135); q.bezierCurveTo(hx - 50, hy + 130, hx - 95, hy + 70, hx - 90, hy - 30); q.closePath(); };
      ink(g, menpo, volR(g, hx, hy + 40, 120, '#6a1010', 1.5, 0.5), 10);
      hatch(g, menpo, 0.7, 13, 3, [hx - 95, hy - 30, hx + 95, hy + 140], 'rgba(10,0,0,0.35)');
      ink(g, (q) => { q.moveTo(hx - 70, hy - 40); q.lineTo(hx + 10, hy + 10); q.lineTo(hx - 30, hy + 60); }, null, 6); // crack
      ink(g, (q) => q.rect(hx - 50, hy + 65, 100, 26), '#efe8d8', 6);
      g.lineWidth = 4; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(hx - 50 + i * 20, hy + 65); g.lineTo(hx - 50 + i * 20, hy + 91); g.stroke(); }
      for (const ex of [hx - 40, hx + 40]) { ink(g, (q) => q.rect(ex - 30, hy - 75, 60, 32), INK, 0); if (ko) koEyes(g, ex, hy - 60, 14); else { g.fillStyle = '#ffdf5a'; g.beginPath(); g.ellipse(ex, hy - 60, 16, 7, 0, 0, TAU); g.fill(); } }
      sweat(g, hx + 150, hy - 20, 1, t);
      break;
    }
  }
  if (ko) { for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; drawStar(g, hx + Math.cos(a) * 150, hy - 180 + Math.sin(a) * 40, 22); } }
  g.restore();
}
function drawStar(g, x, y, r) {
  ink(g, (q) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r; i ? q.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : q.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } q.closePath(); }, '#ffd23f', 5);
}

function drawBoltMark(g, x, y, sc, t, u) {
  g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(-0.4 + Math.sin(t * 10) * 0.08);
  const glow = g.createRadialGradient(0, 0, 10, 0, 0, 90);
  glow.addColorStop(0, 'rgba(255,250,200,0.9)'); glow.addColorStop(1, 'rgba(255,220,80,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.fill();
  ink(g, P2([-20, -70, 38, -70, 8, -12, 42, -12, -30, 78, -6, 10, -40, 10]), '#ffd23f', 8);
  g.strokeStyle = '#fff6c8'; g.lineWidth = 5; g.beginPath(); g.moveTo(-14, -62); g.lineTo(28, -62); g.stroke();
  g.restore();
  // trail
  g.strokeStyle = 'rgba(255,240,170,0.5)'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + 60, y - 30); g.lineTo(x + 160, y - 70); g.stroke();
}
function drawImpactStar(g, x, y, sc, f) {
  const k = 1 + f * 2;
  g.save(); g.translate(x, y); g.scale(sc * k * 0.8, sc * k * 0.8);
  g.globalAlpha = Math.max(0, 1 - f * 2);
  ink(g, (q) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = i % 2 ? 70 : 170 + (i % 4) * 25; i ? q.lineTo(Math.cos(a) * r, Math.sin(a) * r) : q.moveTo(Math.cos(a) * r, Math.sin(a) * r); } q.closePath(); }, '#fff3b0', 10);
  ink(g, (q) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.2, r = i % 2 ? 40 : 100; i ? q.lineTo(Math.cos(a) * r, Math.sin(a) * r) : q.moveTo(Math.cos(a) * r, Math.sin(a) * r); } q.closePath(); }, '#ffffff', 0);
  g.globalAlpha = 1;
  g.restore();
}
function drawComicPart(g, p) {
  const f = p.t / p.life;
  g.globalAlpha = Math.max(0, 1 - f);
  if (p.kind === 'spark') { g.strokeStyle = p.c; g.lineWidth = 8 * (1 - f) + 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.stroke(); }
  else if (p.kind === 'ring') { g.strokeStyle = p.c; g.lineWidth = 14 * (1 - f); g.beginPath(); g.arc(p.x, p.y, 60 + f * 160, 0, TAU); g.stroke(); }
  else if (p.kind === 'smoke') { g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 16 + f * 30, 0, TAU); g.fill(); }
  else if (p.kind === 'tooth') { g.save(); g.translate(p.x, p.y); g.rotate(p.r2); g.globalAlpha = 1; ink(g, (q) => { q.moveTo(-12, -16); q.lineTo(12, -16); q.lineTo(10, 10); q.lineTo(0, 18); q.lineTo(-10, 10); q.closePath(); }, '#f4efe6', 5); g.restore(); }
  else if (p.kind === 'sweat') { g.globalAlpha = 1; sweat(g, p.x, p.y, 0.8, 0); }
  g.globalAlpha = 1;
}
function drawComicHearts(g, cs) {
  const n = 3, x0 = 650, y = 455;
  for (let i = 0; i < n; i++) {
    const alive = i < cs.hpBefore;
    let lost = false, dropF = 0;
    if (cs.impactT && i >= cs.hpAfter && i < cs.hpBefore) {
      const d = cs.t - cs.impactT - 0.15 - (cs.hpBefore - 1 - i) * 0.22;
      if (d > 0) { lost = true; dropF = d; }
    }
    if (!alive) { heartShape(g, x0 + i * 110, y, 44, '#3a2a30'); continue; }
    if (lost) {
      g.save(); g.translate(x0 + i * 110 + dropF * 80, y + dropF * dropF * 900); g.rotate(dropF * 4);
      heartShape(g, -22, 0, 44, '#e0303a', true); g.restore();
    } else heartShape(g, x0 + i * 110, y + Math.sin(cs.t * 6 + i) * 4, 44, '#e0303a');
  }
}
function heartShape(g, x, y, s, fill, broken) {
  ink(g, (q) => { q.moveTo(x, y + s * 0.35); q.bezierCurveTo(x - s * 1.1, y - s * 0.5, x - s * 0.35, y - s * 1.1, x, y - s * 0.45); q.bezierCurveTo(x + s * 0.35, y - s * 1.1, x + s * 1.1, y - s * 0.5, x, y + s * 0.35 + s * 0.6); q.closePath(); }, fill, 7);
  if (broken) ink(g, (q) => { q.moveTo(x, y - s * 0.45); q.lineTo(x - 10, y); q.lineTo(x + 8, y + 18); q.lineTo(x, y + s * 0.9); }, null, 6);
  else { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x - s * 0.45, y - s * 0.45, s * 0.15, 0, TAU); g.fill(); }
}
function drawTapHint(g, x, y, r, a, t) {
  g.save(); g.globalAlpha = a;
  const p = 1 + Math.sin(t * 12) * 0.12;
  g.strokeStyle = '#fff3b0'; g.lineWidth = r * 0.12;
  g.beginPath(); g.arc(x, y - r * 0.6, r * 0.7 * p, 0, TAU); g.stroke();
  g.fillStyle = '#f4efe6'; g.strokeStyle = INK; g.lineWidth = r * 0.1;
  g.beginPath(); g.roundRect ? g.roundRect(x - r * 0.18, y - r * 0.7, r * 0.36, r * 1.1, r * 0.18) : g.rect(x - r * 0.18, y - r * 0.7, r * 0.36, r * 1.1);
  g.fill(); g.stroke();
  g.beginPath(); g.ellipse(x + r * 0.05, y + r * 0.45, r * 0.42, r * 0.42, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
}
