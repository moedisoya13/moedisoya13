// Off-screen awareness for the big floors (GDD-V2 §5.7), built on the engine's switch and marker
// sources (src/client/70_offscreen.js: OS.enabled(w), BD.render.markers): the UI draws both itself,
// in HUD layers, so they sit under the HUD boxes and never on them.
//
// Edge markers — what is outside the screen, at most 6, in this order (§5.7):
//   guardian (crown, gold; also the crown that blinks three times where it will stand once the task
//   is done) · open stairs (white) · the task's places still to do (task glyph, gold; the nearest one
//   larger) · elites (skull, red — white on the red floor) · flasks when HP ≤ 50 (blue) · the
//   spring when HP ≤ 50 and unused (blue) · anything other branches register as a marker source.
//   Each: a disc with the glyph, a wedge pointing at the thing, its distance in u; on a band 28 px
//   inside the screen edge, pushed clear of the HUD blocks (HP, task, clock/minimap, tray, dash).
//   Altar, chest and rift are on the minimap only.
// Minimap — top right under the floor row: the floor in the screen's own orientation (cells baked
//   once per floor), the screen's frame, task places (gold; done grey), places to visit ('?' until
//   known, then their glyph; used grey), the stairs (locked / open), the guardian, elites (red dots),
//   the hero (white dot with a facing wedge — the hero's orange is the blade's alone). No fodder.
// Ids nobody here knows draw as a lettered seal; a site with only an id and a state still shows.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const M = BD.math;
const OS = BD.client.offscreen;
const MAP = BD.ui.map = { blink: null, last: [] };
const GOLD = '#ffd24a', RED = '#e8342c', WHITE = '#f6f1e6', BLUE = '#8fd3ff', GREY = '#7d7a74';
const TASK_SITE = { seal: 1, nest: 1, brazier: 1 };

// the engine draws its own markers and minimap from drawWorld unless told otherwise: the UI draws
// them (below) in HUD layers instead
OS.draw = function () {};

const flagOf = (o) => (o.marker || (o.flags && o.flags.marker) || null);
const siteGlyph = (kind) => 'site:' + kind;
function taskGlyph(w) { return w.task ? 'task:' + w.task.kind : 'site:seal'; }
function isTaskSite(s) { return s.optional === false || (s.optional === undefined && TASK_SITE[s.kind]); }
const used = (s) => s.state === 'used' || s.state === 'done' || s.state === 'dead' || s.state === 'broken' || s.state === 'dry' || s.state === 'open' || s.state === 'spent';

// ---- what is marked -------------------------------------------------------------------------------
MAP.collect = function (w, ui) {
  const out = [], h = w.hero, low = h.hp <= 50;
  const heavy = w.floor && w.floor.domType === 'heavy';
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (e.guardian || e.role === 'guardian' || e.boss) out.push({ x: e.x, y: e.y, kind: 'guardian', pri: 0, glyph: 'crown', color: GOLD, id: 'e' + e.id });
    else if (e.elite || e.role === 'elite') out.push({ x: e.x, y: e.y, kind: 'elite', pri: 3, glyph: 'skull', color: heavy ? WHITE : RED, id: 'e' + e.id });
    else if (e.role === 'object' || flagOf(e) === 'objective') out.push({ x: e.x, y: e.y, kind: 'task', pri: 2, glyph: taskGlyph(w), color: GOLD, id: 'e' + e.id });
    else if (flagOf(e) === 'threat') out.push({ x: e.x, y: e.y, kind: 'elite', pri: 3, glyph: 'skull', color: heavy ? WHITE : RED, id: 'e' + e.id });
  }
  if (MAP.blink && ui && ui.time - MAP.blink.t0 < 1.8 && !w.enemies.some((e) => !e.dead && e.guardian)) out.push({ x: MAP.blink.x, y: MAP.blink.y, kind: 'guardian', pri: 0, glyph: 'crown', color: GOLD, blink: MAP.blink.t0, id: 'blink' });
  if (w.stairs && w.stairs.open) out.push({ x: w.stairs.ringX, y: w.stairs.ringY, kind: 'stairs', pri: 1, glyph: 'stairs', color: WHITE, id: 'stairs' });
  for (const s of w.sites || []) {
    if (used(s)) continue;
    if (isTaskSite(s) && !(w.task && w.task.done)) out.push({ x: s.x, y: s.y, kind: 'task', pri: 2, glyph: siteGlyph(s.kind), color: GOLD, id: 's' + s.id });
    else if (s.kind === 'spring' && low && s.known) out.push({ x: s.x, y: s.y, kind: 'spring', pri: 5, glyph: 'site:spring', color: BLUE, id: 's' + s.id });
  }
  if (low) for (const p of w.pickups || []) if (p.kind === 'flask') out.push({ x: p.x, y: p.y, kind: 'flask', pri: 4, glyph: 'flask', color: BLUE, id: 'p' + p.id });
  // marker sources other branches register (the engine's own two are read above in v2 terms)
  for (const src of BD.render.markers.all()) {
    if (src.id === 'flagged' || src.id === 'flow') continue;
    const list = [];
    try { src.collect(w, list); } catch (err) { continue; }
    for (const m of list) out.push({ x: m.x, y: m.y, kind: m.kind || 'objective', pri: m.kind === 'threat' ? 3 : 6, glyph: m.glyph || null, icon: m.icon || null, color: m.color || (m.kind === 'threat' ? RED : GOLD), id: m.id || src.id + ':' + m.x + ',' + m.y });
  }
  // the nearest task place is drawn larger
  let best = null, bd = Infinity;
  for (const m of out) if (m.kind === 'task') { const d = M.dist(m.x, m.y, h.x, h.y); if (d < bd) { bd = d; best = m; } }
  if (best) best.nearest = true;
  return out;
};

// ---- edge markers -----------------------------------------------------------------------------------
const MAX = 6;
// HUD blocks the markers keep clear of (logical px)
function blocks(ui) {
  const [dx, dy] = BD.ui.dashCenter(ui), dr = BD.ui.dashSize(ui).r + 10, ph = K.phone(ui);
  return [
    { x0: 0, y0: 0, x1: 380, y1: ph ? 118 : 110 },        // HP, radiance, kills
    { x0: 430, y0: 0, x1: 850, y1: ph ? 92 : 80 },        // task / guardian / boss
    { x0: 1036, y0: 0, x1: 1280, y1: 200 },               // clock, floors, minimap
    { x0: 418, y0: 572, x1: 862, y1: 720 },               // gauge, crossguard, slots
    { x0: dx - dr, y0: dy - dr, x1: dx + dr, y1: dy + dr }, // dash button
  ];
}
function clearOf(x, y, r, B, band) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of B) {
      if (x + r < b.x0 || x - r > b.x1 || y + r < b.y0 || y - r > b.y1) continue;
      // out the shorter way along the edge the marker sits on
      const up = y - (b.y0 - r - 4), down = (b.y1 + r + 4) - y, left = x - (b.x0 - r - 4), right = (b.x1 + r + 4) - x;
      const onSide = x <= band.x0 + 1 || x >= band.x1 - 1;
      if (onSide) { if (b.y0 <= band.y0 + 2) y = b.y1 + r + 4; else if (b.y1 >= band.y1 - 2) y = b.y0 - r - 4; else y = up < down ? b.y0 - r - 4 : b.y1 + r + 4; }
      else if (b.y0 <= band.y0 + 2 && y < 360) y = b.y1 + r + 4;      // a block on the top edge: below it
      else if (b.y1 >= band.y1 - 2 && y > 360) y = b.y0 - r - 4;      // on the bottom edge: above it
      else x = left < right ? b.x0 - r - 4 : b.x1 + r + 4;
      moved = true;
    }
    if (!moved) break;
  }
  return [x, y];
}
MAP.place = function (ui, list) {
  const v = ui.view, ph = K.phone(ui), inset = 28;
  const band = { x0: inset, y0: inset, x1: C.VIEW_W - inset, y1: C.VIEW_H - inset };
  const cx = C.VIEW_W / 2, cy = C.VIEW_H / 2, B = blocks(ui);
  const out = [];
  for (const m of list) {
    const [sx, sy0] = v.proj(m.x, m.y), sy = sy0 - 24;
    if (sx >= 8 && sx <= C.VIEW_W - 8 && sy >= 8 && sy <= C.VIEW_H - 8) continue; // on screen
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min(dx ? ((dx > 0 ? band.x1 : band.x0) - cx) / dx : Infinity, dy ? ((dy > 0 ? band.y1 : band.y0) - cy) / dy : Infinity);
    const r = (ph ? 20 : 15) * (m.nearest ? 1.25 : 1);
    let x = cx + dx * k, y = cy + dy * k;
    x = M.clamp(x, band.x0 + r, band.x1 - r); y = M.clamp(y, band.y0 + r, band.y1 - r);
    [x, y] = clearOf(x, y, r, B, band);
    out.push({ m, x, y, r, a: Math.atan2(sy - y, sx - x), d: Math.round(M.dist(m.x, m.y, ui.world.hero.x, ui.world.hero.y)) });
  }
  // two markers on the same spot: nudge the later one along
  for (let i = 1; i < out.length; i++) for (let j = 0; j < i; j++) {
    const a = out[i], b = out[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 4) { if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y) || a.x <= band.x0 + a.r + 1 || a.x >= band.x1 - a.r - 1) a.y += (a.y < 360 ? 1 : -1) * (a.r + b.r + 6); else a.x += (a.x < 640 ? 1 : -1) * (a.r + b.r + 6); }
  }
  return out;
};
function drawMarker(g, ui, it) {
  const { m, x, y, r } = it, ph = K.phone(ui);
  let alpha = 1;
  if (m.blink !== undefined) { const t = ui.time - m.blink; if (t > 1.8) return; alpha = Math.floor(t / 0.3) % 2 ? 0.25 : 1; }
  g.save(); g.globalAlpha = alpha;
  // wedge toward the thing
  g.translate(x, y); g.rotate(it.a);
  K.poly(g, [[r + 13, 0], [r - 2, -9], [r - 2, 9]]); g.fillStyle = m.color; g.fill(); g.lineWidth = 2.5; g.strokeStyle = K.INK; g.stroke();
  g.rotate(-it.a);
  const pulse = m.kind === 'elite' || m.kind === 'guardian' ? 1 + 0.07 * Math.sin(ui.time * 8) : 1;
  K.circle(g, 2, 3, r * pulse); g.fillStyle = K.INK; g.fill();
  K.circle(g, 0, 0, r * pulse); g.fillStyle = '#141318'; g.fill(); g.lineWidth = 3; g.strokeStyle = m.color; g.stroke();
  if (m.icon) m.icon(g, 0, 0, r * 0.8); else IC.glyph(g, m.glyph || 'site:?', 0, 0, r * 1.45);
  g.restore();
  // distance in u, on the side facing the screen centre
  const tx = x - Math.cos(it.a) * (r + (ph ? 26 : 20)), ty = y - Math.sin(it.a) * (r + (ph ? 14 : 11)) + (ph ? 9 : 7);
  g.globalAlpha = alpha;
  K.text(ui, it.d + 'u', tx, ty, { size: ph ? 25 : 18, align: 'center', weight: 900, color: m.color === RED ? '#ffb0a8' : K.PAPER, stroke: 5 });
  g.globalAlpha = 1;
}
BD.ui.hud.register({
  id: 'edge_markers',
  order: 6, // over the world and the washes, under every HUD box
  draw(g, ui) {
    const w = ui.world;
    if (!w || !w.grid || ui.app.overlay() || w.blackoutT > 0) { MAP.last = []; return; }
    if (!OS.enabled(w).indicators) { MAP.last = []; return; }
    const h = w.hero;
    const list = MAP.collect(w, ui).sort((a, b) => a.pri - b.pri || M.dist(a.x, a.y, h.x, h.y) - M.dist(b.x, b.y, h.x, h.y));
    const placed = MAP.place(ui, list).slice(0, MAX);
    MAP.last = placed.map((p) => ({ kind: p.m.kind, glyph: p.m.glyph, x: Math.round(p.x), y: Math.round(p.y), r: p.r, d: p.d, nearest: !!p.m.nearest }));
    for (const it of placed) drawMarker(g, ui, it);
  },
});

// ---- minimap -----------------------------------------------------------------------------------------
MAP.RECT = { x: 1066, y: 104, w: 190, h: 90 };
const base = { grid: null, key: null, cv: null };
function frameOf(w, R) {
  const grid = w.grid, pad = 6, mw = (grid.w + grid.h) * C.ISO_X, mh = (grid.w + grid.h) * C.ISO_Y;
  const k = Math.min((R.w - 2 * pad) / mw, (R.h - 2 * pad) / mh);
  const ox = R.x + R.w / 2 - ((grid.w - grid.h) / 2) * C.ISO_X * k, oy = R.y + R.h / 2 - (mh * k) / 2;
  return { k, ox, oy };
}
function baseCanvas(w, v, R, F) {
  const key = R.w + 'x' + R.h + ':' + v.dpr + ':' + v.scale;
  if (base.grid === w.grid && base.key === key) return base.cv;
  const s = Math.min(2, v.dpr * v.scale * 1.5) || 1, cv = document.createElement('canvas');
  cv.width = Math.ceil(R.w * s); cv.height = Math.ceil(R.h * s);
  const g = cv.getContext('2d'), grid = w.grid, col = BD.client.render.floorColor(w), shade = BD.client.render.shade;
  g.scale(s, s);
  const P = (x, y) => { const [mx, my] = BD.view.map(x, y); return [F.ox - R.x + mx * F.k, F.oy - R.y + my * F.k]; };
  const floorCol = shade(col, 0.62), solidCol = '#26252d';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const c = grid.get(x, y);
    if (c === BD.CELL.VOID) continue;
    const a = P(x, y), b = P(x + 1, y), cc = P(x + 1, y + 1), d = P(x, y + 1);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath();
    g.fillStyle = c === BD.CELL.SOLID ? solidCol : floorCol; g.fill();
  }
  // the floor's outline in ink
  const o = [P(0, 0), P(grid.w, 0), P(grid.w, grid.h), P(0, grid.h)];
  g.beginPath(); g.moveTo(o[0][0], o[0][1]); for (const p of o) g.lineTo(p[0], p[1]); g.closePath(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,10,12,0.8)'; g.stroke();
  Object.assign(base, { grid: w.grid, key, cv });
  return cv;
}
MAP.items = function (w) {
  // everything the minimap shows besides the floor, the frame and the hero
  const out = [];
  for (const s of w.sites || []) {
    const task = isTaskSite(s), done = used(s) || (task && w.task && w.task.done);
    if (task) out.push({ x: s.x, y: s.y, glyph: siteGlyph(s.kind), color: done ? GREY : GOLD, done, kind: 'task' });
    else out.push({ x: s.x, y: s.y, glyph: s.known || s.kind === 'altar' ? siteGlyph(s.kind) : 'site:?', color: done ? GREY : WHITE, done, kind: 'site' });
  }
  if (w.altar && w.altar.x !== undefined && (!w.sites || !w.sites.some((s) => s.kind === 'altar'))) out.push({ x: w.altar.x, y: w.altar.y, glyph: 'site:altar', color: w.altar.state === 'used' ? GREY : WHITE, done: w.altar.state === 'used', kind: 'site' });
  if (w.stairs && w.stairs.ringX !== undefined) out.push({ x: w.stairs.ringX, y: w.stairs.ringY, glyph: w.stairs.open ? 'stairs' : 'stairs_locked', color: w.stairs.open ? WHITE : GREY, kind: 'stairs' });
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (e.guardian || e.boss) out.push({ x: e.x, y: e.y, glyph: 'crown', color: GOLD, kind: 'guardian' });
    else if (e.elite || e.role === 'elite') out.push({ x: e.x, y: e.y, dot: RED, kind: 'elite' });
    else if (e.role === 'object' || flagOf(e) === 'objective') out.push({ x: e.x, y: e.y, glyph: taskGlyph(w), color: GOLD, kind: 'task' });
  }
  return out;
};
BD.ui.hud.register({
  id: 'minimap',
  order: 12,
  draw(g, ui) {
    const w = ui.world, v = ui.view;
    if (!w || !w.grid || !OS.enabled(w).minimap) { MAP.shown = false; return; }
    const R = MAP.RECT, F = frameOf(w, R), ph = K.phone(ui);
    const P = (x, y) => { const [mx, my] = BD.view.map(x, y); return [F.ox + mx * F.k, F.oy + my * F.k]; };
    MAP.shown = true;
    K.panel(g, R.x, R.y, R.w, R.h, { slant: 0, shadow: 3, facet: false, fill: 'rgba(10,10,12,0.82)', edge: '#4a4850', edgeW: 1.5 });
    g.save();
    g.beginPath(); g.rect(R.x + 2, R.y + 2, R.w - 4, R.h - 4); g.clip();
    g.drawImage(baseCanvas(w, v, R, F), R.x, R.y, R.w, R.h);
    // the screen's frame (an upright rectangle in this projection)
    const sx = F.ox + -v.rox * F.k, sy = F.oy + -v.roy * F.k;
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(243,234,216,0.75)'; g.strokeRect(sx, sy, C.VIEW_W * F.k, C.VIEW_H * F.k);
    const gs = ph ? 17 : 12;
    for (const it of MAP.items(w)) {
      const [x, y] = P(it.x, it.y);
      if (it.dot) { K.circle(g, x, y, ph ? 3.6 : 2.6); g.fillStyle = it.dot; g.fill(); g.lineWidth = 1; g.strokeStyle = K.INK; g.stroke(); continue; }
      IC.glyph(g, it.glyph, x, y, it.kind === 'guardian' ? gs * 1.15 : gs, { alpha: it.done ? 0.45 : 1 });
    }
    // the hero: a white dot and a wedge the way he faces
    const [hx, hy] = P(w.hero.x, w.hero.y), [fx, fy] = P(w.hero.x + Math.cos(w.hero.face || 0) * 2.2, w.hero.y + Math.sin(w.hero.face || 0) * 2.2);
    const a = Math.atan2(fy - hy, fx - hx), hr = ph ? 4.4 : 3.4;
    K.poly(g, [[hx + Math.cos(a) * (hr + 5), hy + Math.sin(a) * (hr + 5)], [hx + Math.cos(a + 2.2) * hr, hy + Math.sin(a + 2.2) * hr], [hx + Math.cos(a - 2.2) * hr, hy + Math.sin(a - 2.2) * hr]]);
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = K.INK; g.stroke();
    K.circle(g, hx, hy, hr); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = K.INK; g.stroke();
    g.restore();
  },
});

BD.ui.effects.register({
  id: 'map',
  reset() { MAP.blink = null; MAP.last = []; },
  on: {
    // §7.3 task complete: a crown blinks three times at the edge, where the guardian will stand
    task_clear(ev, ui) { const a = C.V2.floor.guardianAt; MAP.blink = { t0: ui.time + 0.3, x: a[0], y: a[1] }; },
    floor_enter() { MAP.blink = null; },
    spawn(ev, ui) { const e = BD.W.enemyById(ui.world, ev.enemyId); if (e && e.guardian) MAP.blink = null; },
  },
});
