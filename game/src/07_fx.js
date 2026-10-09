// ─────────────────────────────────────────────────────────────
// FX — particles (world px coords), floor decals, lightning bolts
// ─────────────────────────────────────────────────────────────

const FX = {
  parts: [], decals: [], bolts: [],
  clear() { this.parts.length = 0; this.decals.length = 0; this.bolts.length = 0; },

  // world-pixel spawn helpers
  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.ang !== undefined ? o.ang + rand(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rand(0, TAU);
      const sp = rand(o.sp0 ?? 10, o.sp1 ?? 40);
      this.parts.push({
        x: x + rand(-(o.jit || 0), o.jit || 0), y: y + rand(-(o.jit || 0), o.jit || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(o.l0 ?? 0.3, o.l1 ?? 0.8), t: 0,
        c: Array.isArray(o.c) ? pick(o.c) : o.c, size: o.size ?? 1, drag: o.drag ?? 3, grav: o.grav ?? 0,
        glow: !!o.glow, grow: o.grow ?? 0, kind: o.kind || 'px', decal: o.decal || null, z: o.z ?? 0, vz: o.vz ?? 0,
      });
    }
  },
  dust(x, y, n = 6) { this.burst(x, y, n, { c: ['#5b4e48', '#463a35', '#6d625c'], sp0: 5, sp1: 25, l0: 0.3, l1: 0.7, jit: 3 }); },
  sparks(x, y, n = 10, c = [C.gold, C.goldHi, '#ffffff']) { this.burst(x, y, n, { c, sp0: 25, sp1: 80, l0: 0.2, l1: 0.5, glow: true, drag: 4 }); },
  blood(x, y, n = 12, ang) {
    this.burst(x, y, n, { c: [C.blood, C.blood2, '#6e0a12'], sp0: 20, sp1: 70, l0: 0.25, l1: 0.5, ang, spread: ang !== undefined ? 0.9 : Math.PI, drag: 6, decal: 'blood' });
  },
  smoke(x, y, n = 6, c = ['#3a3442', '#4b4452', '#2c2733']) { this.burst(x, y, n, { c, sp0: 4, sp1: 16, l0: 0.5, l1: 1.1, kind: 'puff', size: 2, grow: 4, jit: 2 }); },
  debris(x, y, n = 14) { this.burst(x, y, n, { c: [C.rubble, C.rubble2, '#7b6a5f', C.wallTop], sp0: 20, sp1: 90, l0: 0.4, l1: 0.9, drag: 4, size: 2, decal: 'debris' }); },
  splash(x, y, n = 12) { this.burst(x, y, n, { c: ['#cfe8f0', '#8fc4d8', '#ffffff'], sp0: 15, sp1: 55, l0: 0.25, l1: 0.6, drag: 5 }); },
  ring(x, y, c = C.white, r1 = 18, life = 0.35, glow = true) { this.parts.push({ kind: 'ring', x, y, c, r0: 2, r1, life, t: 0, glow }); },

  decal(kind, x, y, r = 2, c) {
    this.decals.push({ kind, x, y, r, c, t: 0 });
    if (this.decals.length > 160) this.decals.shift();
  },

  bolt(x, y, fromY, opts = {}) {
    const pts = [];
    let cx = x + rand(-20, 20), cy = fromY;
    pts.push(cx, cy);
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      cx = lerp(cx, x, 0.35) + rand(-9, 9) * (1 - t);
      cy = lerp(fromY, y, t);
      pts.push(i === n ? x : cx, i === n ? y : cy);
    }
    const branches = [];
    for (let b = 0; b < 3; b++) {
      const k = randi(1, n - 2) * 2;
      let bx = pts[k], by = pts[k + 1];
      const br = [bx, by];
      for (let s = 0; s < 3; s++) { bx += rand(-14, 14); by += rand(6, 16); br.push(bx, by); }
      branches.push(br);
    }
    this.bolts.push({ pts, branches, t: 0, life: opts.life || 0.45, c: opts.c || C.goldHi });
  },

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        if (p.decal === 'blood' && rnd() < 0.5) this.decal('blood', p.x, p.y, rand(0.6, 1.6), p.c);
        if (p.decal === 'debris' && rnd() < 0.4) this.decal('debris', p.x, p.y, 1, p.c);
        this.parts.splice(i, 1); continue;
      }
      if (p.kind === 'ring') continue;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) { const b = this.bolts[i]; b.t += dt; if (b.t > b.life) this.bolts.splice(i, 1); }
  },

  drawDecals(camX, camY) {
    for (const d of this.decals) {
      const x = d.x - camX, y = d.y - camY;
      if (x < -10 || y < -10 || x > Screen.W + 10 || y > Screen.H + 10) continue;
      if (d.kind === 'blood') disc(x, y, d.r, d.c || C.blood);
      else if (d.kind === 'debris') px(x, y, d.c || C.rubble);
    }
  },

  draw(camX, camY, glowLayer) {
    for (const p of this.parts) {
      if (!!p.glow !== glowLayer) continue;
      const x = p.x - camX, y = p.y - camY;
      if (x < -20 || y < -20 || x > Screen.W + 20 || y > Screen.H + 20) continue;
      const f = p.t / p.life;
      if (p.kind === 'ring') {
        L.globalAlpha = 1 - f;
        ring(x, y, lerp(p.r0, p.r1, Ease.outCubic(f)), p.c);
        L.globalAlpha = 1;
      } else if (p.kind === 'puff') {
        L.globalAlpha = (1 - f) * 0.7;
        disc(x, y, p.size + p.grow * f, p.c);
        L.globalAlpha = 1;
      } else {
        if (f > 0.7) L.globalAlpha = (1 - f) / 0.3;
        rect(x - (p.size >> 1), y - (p.size >> 1), p.size, p.size, p.c);
        L.globalAlpha = 1;
      }
    }
    if (glowLayer) {
      for (const b of this.bolts) {
        const f = b.t / b.life;
        if (f > 0.15 && f < 0.3 && ((b.t * 60) | 0) % 2) continue; // flicker
        L.globalAlpha = f < 0.6 ? 1 : (1 - f) / 0.4;
        const P = b.pts;
        for (let i = 0; i + 3 < P.length; i += 2) {
          thickLine(P[i] - camX, P[i + 1] - camY, P[i + 2] - camX, P[i + 3] - camY, 4, rgba(C.gold, 0.5));
        }
        for (const br of b.branches) for (let i = 0; i + 3 < br.length; i += 2) line(br[i] - camX, br[i + 1] - camY, br[i + 2] - camX, br[i + 3] - camY, C.goldHi);
        for (let i = 0; i + 3 < P.length; i += 2) thickLine(P[i] - camX, P[i + 1] - camY, P[i + 2] - camX, P[i + 3] - camY, 2, '#ffffff');
        L.globalAlpha = 1;
      }
    }
  },
};
