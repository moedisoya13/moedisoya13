// Off-screen awareness for floors larger than the screen: edge-of-screen markers for objectives
// and threats that are out of view, and a minimap. Both are switched per floor:
//   w.floor.offscreen = {indicators, minimap} (set by a floor plan, BD.gen.plans) wins, else
//   C.OFFSCREEN ('auto' = on when the floor does not fit the screen). Every v1 room fits → off.
// Markers come from BD.render.markers sources (DOM-free, content may register its own):
//   collect(w, out) → out.push({x, y, kind: 'objective'|'threat', color?, icon?(g, x, y, r), id?,
//                               edge? (false: minimap only), mini? (false: edge only), r? (minimap dot radius)})
// Built in: 'flagged' (enemies or pickups with .flags.marker / .marker = 'threat'|'objective';
// guardians and the boss count as threats) and 'flow' (lit altar, open stairs, available trial).
//
//   BD.client.offscreen.enabled(w) → {indicators, minimap}
//   BD.client.offscreen.markers(w) → the collected markers
//   BD.client.offscreen.drawIndicators(g, ui, rect?)   rect: where markers may sit (INSET default)
//   BD.client.offscreen.drawMinimap(g, ui, rect?)      rect: {x, y, w, h} (MINIMAP default)
//   BD.client.offscreen.draw(g, ui)                    both, when enabled (drawWorld calls it)
// The UI agent may move them by changing OS.INSET / OS.MINIMAP or call the drawers itself.

const C = BD.C;
const U = BD.ui;
const OS = BD.client.offscreen = {
  // marker band: inside the screen, clear of the v1 HUD's top bar, card tray and dash button
  INSET: { x0: 30, y0: 104, x1: 1250, y1: 586 },
  MINIMAP: { x: 1078, y: 150, w: 186, h: 124 },
  COLORS: { objective: '#ffd24a', threat: '#e8342c' },
  MAX: 12,
};

const flagOf = (o) => (o.marker || (o.flags && o.flags.marker) || null);
BD.render.markers.register({
  id: 'flagged',
  collect(w, out) {
    for (const e of w.enemies) {
      if (e.dead) continue;
      const k = flagOf(e) || (e.guardian || e.boss ? 'threat' : null);
      if (k) out.push({ x: e.x, y: e.y, kind: k, id: 'e' + e.id });
    }
    for (const p of w.pickups) { const k = flagOf(p); if (k) out.push({ x: p.x, y: p.y, kind: k, id: 'p' + p.id }); }
  },
});
BD.render.markers.register({
  id: 'flow',
  collect(w, out) {
    if (w.altar && w.altar.state === 'lit') out.push({ x: w.altar.x, y: w.altar.y, kind: 'objective', id: 'altar' });
    if (w.stairs && w.stairs.open) out.push({ x: w.stairs.ringX, y: w.stairs.ringY, kind: 'objective', id: 'stairs' });
    if (w.trial && w.trial.state === 'available') out.push({ x: w.trial.x, y: w.trial.y, kind: 'objective', color: '#c9a0ff', id: 'trial' });
  },
});

OS.enabled = function (w) {
  const fits = BD.view.fits(w.grid), o = w.floor.offscreen || {}, d = C.OFFSCREEN;
  const pick = (k) => (o[k] !== undefined ? !!o[k] : d[k] === 'auto' ? !fits : !!d[k]);
  return { indicators: pick('indicators'), minimap: pick('minimap') };
};
OS.markers = function (w) {
  const out = [];
  for (const src of BD.render.markers.all()) src.collect(w, out);
  return out;
};

// ---- edge markers ------------------------------------------------------------------------------
function glyph(g, kind, x, y, r) {
  g.fillStyle = U.INK;
  if (kind === 'threat') { g.fillRect(x - 1.6, y - r * 0.55, 3.2, r * 0.7); g.fillRect(x - 1.6, y + r * 0.28, 3.2, 3.2); }
  else { g.beginPath(); g.moveTo(x, y - r * 0.55); g.lineTo(x + r * 0.45, y); g.lineTo(x, y + r * 0.55); g.lineTo(x - r * 0.45, y); g.closePath(); g.fill(); }
}
OS.drawIndicators = function (g, ui, rect) {
  const w = ui.world, v = ui.view, R = rect || OS.INSET;
  const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, t = ui.time;
  const list = [];
  for (const m of OS.markers(w)) {
    if (m.edge === false) continue; // minimap only (GDD-V2 §5.7: altar, chest, rift)
    const [sx, sy0] = v.proj(m.x, m.y), sy = sy0 - 30;
    if (sx >= 0 && sx <= C.VIEW_W && sy >= 0 && sy <= C.VIEW_H) continue; // on screen
    list.push({ m, sx, sy, d: Math.hypot(sx - cx, sy - cy) });
  }
  list.sort((a, b) => (a.m.kind === b.m.kind ? a.d - b.d : a.m.kind === 'threat' ? -1 : 1));
  for (const it of list.slice(0, OS.MAX)) {
    const dx = it.sx - cx, dy = it.sy - cy;
    // where the ray from the band's centre leaves the band
    const k = Math.min(dx ? ((dx > 0 ? R.x1 : R.x0) - cx) / dx : Infinity, dy ? ((dy > 0 ? R.y1 : R.y0) - cy) / dy : Infinity);
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    const col = it.m.color || OS.COLORS[it.m.kind] || '#ffffff';
    const near = Math.max(0, Math.min(1, 1 - (it.d - 700) / 1400)), r = 11 + 4 * near;
    const pulse = it.m.kind === 'threat' ? 1 + 0.08 * Math.sin(t * 9) : 1;
    g.save(); g.translate(x, y); g.globalAlpha = 0.55 + 0.45 * near;
    g.rotate(a);
    g.beginPath(); g.moveTo(r + 11, 0); g.lineTo(r + 1, -7); g.lineTo(r + 1, 7); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = U.INK; g.stroke();
    g.rotate(-a);
    g.beginPath(); g.arc(0, 0, r * pulse, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = U.INK; g.stroke();
    if (it.m.icon) it.m.icon(g, 0, 0, r); else glyph(g, it.m.kind, 0, 0, r);
    g.restore();
  }
};

// ---- minimap -----------------------------------------------------------------------------------
// The floor in the screen's own isometric orientation, scaled into rect; the screen as a frame.
const mmCache = { grid: null, key: null, cv: null };
function minimapBase(w, v, rect, k, ox, oy) {
  const key = rect.w + 'x' + rect.h + ':' + v.dpr;
  if (mmCache.grid === w.grid && mmCache.key === key) return mmCache.cv;
  const s = Math.min(2, v.dpr * v.scale) || 1, cv = document.createElement('canvas');
  cv.width = Math.ceil(rect.w * s); cv.height = Math.ceil(rect.h * s);
  const g = cv.getContext('2d'), grid = w.grid, col = BD.client.render.floorColor(w);
  g.scale(s, s);
  const P = (x, y) => { const [mx, my] = BD.view.map(x, y); return [ox + mx * k, oy + my * k]; };
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const c = grid.get(x, y);
    if (c === BD.CELL.VOID) continue;
    const a = P(x, y), b = P(x + 1, y), cc = P(x + 1, y + 1), d = P(x, y + 1);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath();
    g.fillStyle = c === BD.CELL.SOLID ? '#2a2b33' : BD.client.render.shade(col, 0.55); g.fill();
  }
  Object.assign(mmCache, { grid: w.grid, key, cv });
  return cv;
}
OS.drawMinimap = function (g, ui, rect) {
  const w = ui.world, v = ui.view, R = rect || OS.MINIMAP, grid = w.grid;
  const pad = 6, mw = (grid.w + grid.h) * C.ISO_X, mh = (grid.w + grid.h) * C.ISO_Y;
  const k = Math.min((R.w - 2 * pad) / mw, (R.h - 2 * pad) / mh);
  const ox = R.x + R.w / 2 - ((grid.w - grid.h) / 2) * C.ISO_X * k, oy = R.y + R.h / 2 - mh * k / 2;
  const M = (x, y) => { const [mx, my] = BD.view.map(x, y); return [ox + mx * k, oy + my * k]; };
  g.save();
  g.fillStyle = 'rgba(8,8,12,0.72)'; g.fillRect(R.x, R.y, R.w, R.h);
  g.lineWidth = 2; g.strokeStyle = '#6d6a64'; g.strokeRect(R.x + 1, R.y + 1, R.w - 2, R.h - 2);
  g.beginPath(); g.rect(R.x + 2, R.y + 2, R.w - 4, R.h - 4); g.clip();
  g.drawImage(minimapBase(w, v, R, k, ox - R.x, oy - R.y), R.x, R.y, R.w, R.h);
  // enemies, markers, hero
  g.fillStyle = 'rgba(232,52,44,0.85)';
  for (const e of w.enemies) { if (e.dead) continue; const p = M(e.x, e.y); g.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
  for (const m of OS.markers(w)) {
    if (m.mini === false) continue;
    const p = M(m.x, m.y);
    if (m.miniIcon) { m.miniIcon(g, p[0], p[1]); continue; }
    g.beginPath(); g.arc(p[0], p[1], m.r || 3.2, 0, Math.PI * 2); g.fillStyle = m.color || OS.COLORS[m.kind]; g.fill(); g.lineWidth = 1.2; g.strokeStyle = U.INK; g.stroke();
  }
  // the screen (an upright rectangle in this projection)
  const sx = ox + (-v.rox) * k, sy = oy + (-v.roy) * k;
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(243,234,216,0.9)'; g.strokeRect(sx, sy, C.VIEW_W * k, C.VIEW_H * k);
  const h = M(w.hero.x, w.hero.y);
  g.beginPath(); g.arc(h[0], h[1], 3.6, 0, Math.PI * 2); g.fillStyle = U.ORANGE; g.fill(); g.lineWidth = 1.5; g.strokeStyle = U.INK; g.stroke();
  g.restore();
};

OS.draw = function (g, ui) {
  const w = ui.world;
  if (!w || !w.grid) return;
  const on = OS.enabled(w);
  if (on.indicators) OS.drawIndicators(g, ui);
  if (on.minimap) OS.drawMinimap(g, ui);
};
