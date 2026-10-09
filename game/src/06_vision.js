// ─────────────────────────────────────────────────────────────
// Vision — flashlight cone + small body circle, blocked by walls.
// Out-of-sight areas sink into a soft, blurred shade (half-res mask
// upscaled with smoothing).
// ─────────────────────────────────────────────────────────────

const Vision = {
  vis: null, stamp: 1, pts: [], extra: [], cv: null, ctx: null, mw: 0, mh: 0,

  reset() { this.vis = new Int32Array(M.w * M.h); this.stamp = 1; },
  ensureMask() {
    const mw = Math.ceil(Screen.W / 2), mh = Math.ceil(Screen.H / 2);
    if (!this.cv) { this.cv = document.createElement('canvas'); this.ctx = this.cv.getContext('2d'); }
    if (this.mw !== mw || this.mh !== mh) { this.cv.width = mw; this.cv.height = mh; this.mw = mw; this.mh = mh; }
  },

  // Cast rays from (ox,oy) [tile units]; fills polygon & marks visible tiles
  cast(ox, oy, ang, range, half, near, rays = 200, mark = true, out = this.pts) {
    out.length = 0;
    for (let k = 0; k < rays; k++) {
      const a = ang - Math.PI + (k / rays) * TAU;
      const da = Math.abs(angDiff(ang, a));
      const cone = half > 0 ? smoothstep(half + 0.2, half - 0.1, da) : 0;
      const R = near + (range - near) * cone;
      const ca = Math.cos(a), sa = Math.sin(a);
      let r = rayCast(ox, oy, ca, sa, R, mark ? this.vis : null, this.stamp);
      if (r < R - 1e-3) r += 0.6; // light the wall faces we hit (3/4 view)
      out.push(ox + ca * r, oy + sa * r);
    }
    return out;
  },

  begin() { this.stamp++; this.extra.length = 0; },
  visibleTile(x, y) { return inB(x, y) && this.vis[y * M.w + x] === this.stamp; },
  visible(x, y) { return this.visibleTile(Math.floor(x), Math.floor(y)); },

  // extra light: {x,y,r (tiles), a (0..1)} or {poly, x, y, r}
  addLight(l) { this.extra.push(l); },

  // Fog = a blurred, darkened copy of the scene, shown wherever the mask says "unseen".
  drawMask(camX, camY, darkness, playerLight) {
    this.ensureMask();
    const g = this.ctx, TS = CFG.TS;
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000000';
    g.fillRect(0, 0, Screen.W, Screen.H);
    g.globalCompositeOperation = 'destination-out';
    const sx = (x) => x * TS - camX, sy = (y) => y * TS - camY;
    const fillPoly = (pts, cx, cy, rPx, inner = 0.55, edge = 0.2) => {
      if (pts.length < 6) return;
      const gr = g.createRadialGradient(sx(cx), sy(cy), 0, sx(cx), sy(cy), rPx);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(inner, 'rgba(0,0,0,0.96)');
      gr.addColorStop(1, `rgba(0,0,0,${edge})`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(sx(pts[0]), sy(pts[1]));
      for (let k = 2; k < pts.length; k += 2) g.lineTo(sx(pts[k]), sy(pts[k + 1]));
      g.closePath(); g.fill();
    };
    if (playerLight) fillPoly(this.pts, playerLight.x, playerLight.y, playerLight.r * TS, 0.55, 0.22);
    for (const l of this.extra) {
      if (l.poly) { fillPoly(l.poly, l.x, l.y, l.r * TS, 0.4, 0.15); continue; }
      const gr = g.createRadialGradient(sx(l.x), sy(l.y), 0, sx(l.x), sy(l.y), l.r * TS);
      gr.addColorStop(0, `rgba(0,0,0,${l.a})`);
      gr.addColorStop(0.5, `rgba(0,0,0,${l.a * 0.75})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(sx(l.x), sy(l.y), l.r * TS, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    // blur: scene → quarter res → back up to half res (smoothed)
    const qw = Math.ceil(Screen.W / 4), qh = Math.ceil(Screen.H / 4);
    if (!this.bq) { this.bq = document.createElement('canvas'); this.bqx = this.bq.getContext('2d'); this.fg = document.createElement('canvas'); this.fgx = this.fg.getContext('2d'); }
    if (this.bq.width !== qw || this.bq.height !== qh) { this.bq.width = qw; this.bq.height = qh; }
    if (this.fg.width !== this.mw || this.fg.height !== this.mh) { this.fg.width = this.mw; this.fg.height = this.mh; }
    const bx = this.bqx, fx = this.fgx;
    bx.imageSmoothingEnabled = true; fx.imageSmoothingEnabled = true;
    bx.globalCompositeOperation = 'copy';
    bx.drawImage(Screen.lo, 0, 0, Screen.W, Screen.H, 0, 0, qw, qh);
    fx.globalCompositeOperation = 'copy';
    fx.drawImage(this.bq, 0, 0, qw, qh, 0, 0, this.mw, this.mh);
    fx.globalCompositeOperation = 'source-over';
    fx.fillStyle = `rgba(6,3,14,${darkness})`;
    fx.fillRect(0, 0, this.mw, this.mh);
    fx.globalCompositeOperation = 'destination-in';
    fx.drawImage(this.cv, 0, 0);
    fx.globalCompositeOperation = 'source-over';
    L.imageSmoothingEnabled = true;
    L.drawImage(this.fg, 0, 0, this.mw, this.mh, 0, 0, this.mw * 2, this.mh * 2);
    L.imageSmoothingEnabled = false;
  },
};
