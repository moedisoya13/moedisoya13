// Prop catalogue (browser only): every floor-standing object of the stage, drawn from the facet
// kit (31_kit.js). A prop instance is {id, x, y, w, h, v, state}: its footprint is the w × h cells
// from (x, y) — for an obstacle exactly its SOLID cells — v a small variant number, state an
// optional look ('open', 'broken', …). The generator or content names props by id (the list and
// footprints are in docs/ARCHITECTURE.md §10); the stage model (36_stage.js) infers one from the
// SOLID cells when the floor names none.
//
//   R.props.register({id, name, fit(w, h) → bool, height(inst) px, tall, layer: 'solid'|'decor',
//                     draw(g, P, inst, ctx)})       ctx = {theme, layout, rng}
//   R.props.get(id) (unknown → 'block', remembered in R.props.unknown), R.props.ids(), R.props.all()
//   R.props.piece(inst, dx, dy, theme, layout) → cached sprite of the footprint cell (dx, dy),
//       anchored at that cell's back corner; drawn in depth order cell by cell, so actors sort
//       against a long desk row or a 2 × 2 column exactly as against single cells
//   R.props.whole(inst, theme, layout) → cached sprite of the whole prop, anchored at its back corner
//   R.props.shadow(g, P, inst) → the prop's cast shadow on the floor (static layer)
// Draw in local coordinates: the footprint spans (0, 0)–(w, h) of P.

const R = BD.client.render;
const KIT = R.kit;
const PR = R.props = { defs: new Map(), unknown: new Set() };
const ISO_X = BD.C.ISO_X, ISO_Y = BD.C.ISO_Y;

PR.register = function (d) {
  if (!d || !d.id || typeof d.draw !== 'function') throw new Error('[BD] prop needs id and draw()');
  if (PR.defs.has(d.id)) throw new Error('[BD] duplicate prop id ' + d.id);
  PR.defs.set(d.id, Object.assign({ layer: 'solid', tall: false, fit: () => true, height: () => 60, name: d.id }, d));
  return d;
};
PR.has = (id) => PR.defs.has(id);
PR.get = function (id) {
  const d = PR.defs.get(id);
  if (d) return d;
  if (!PR.unknown.has(id)) { PR.unknown.add(id); try { console.warn('[BD] unknown prop id ' + id + ' — drawn as a block'); } catch (e) { /* no console */ } }
  return PR.defs.get('block');
};
PR.ids = () => [...PR.defs.keys()].sort();
PR.all = () => PR.ids().map((k) => PR.defs.get(k));

// ---- materials ----------------------------------------------------------------------------------
const pal = KIT.pal;
const MAT = PR.MAT = {
  concrete: pal('#b9bac2'), concreteDark: pal('#7d808d'), cap: pal('#d4d3cf'),
  wood: { top: '#a3835f', left: '#7f6449', right: '#433628' }, panel: pal('#545966'),
  steel: pal('#a3afbf'), steelDark: pal('#5a6472'), black: pal('#3b404c'),
  felt: pal('#5b7193'), cream: pal('#ddd5c4'), stone: pal('#5d566c'), stoneDark: pal('#3c3747'),
  khaki: pal('#a69b78'), crate: { top: '#a88a64', left: '#87694a', right: '#4a3a29' }, crateSteel: pal('#7a8798'),
  leaf: { top: '#4f9a54', left: '#367a40', right: '#18381f' }, leafDead: { top: '#8a8272', left: '#6c6457', right: '#35302a' },
  soil: '#3a2e25', screen: '#6fd0e6', screenDim: '#24485a', glass: 'rgba(170,205,240,0.28)',
};
// theme tints (the floor type the prop stands on): heavy → steel, undead → greyer, magic → violet trim
PR.tint = function (m, theme) {
  if (theme === 'heavy' && m === MAT.wood) return { top: '#8e98a6', left: '#707a88', right: '#363c47' };
  if (theme === 'undead' && m === MAT.leaf) return MAT.leafDead;
  return m;
};

// ---- shared parts ---------------------------------------------------------------------------------
// points of a face: side 'l' = the +y face (lit), 'r' = the +x face (shadow); a0..a1 along it, z0..z1
function face(P, x, y, dw, dh, side, a0, a1, z0, z1) {
  if (side === 'l') { const xa = x + dw * a0, xb = x + dw * a1; return [P(xa, y + dh, z0), P(xb, y + dh, z0), P(xb, y + dh, z1), P(xa, y + dh, z1)]; }
  const ya = y + dh * (1 - a0), yb = y + dh * (1 - a1);
  return [P(x + dw, ya, z0), P(x + dw, yb, z0), P(x + dw, yb, z1), P(x + dw, ya, z1)];
}
PR.face = face;
function quad(g, q, c, lw) { KIT.poly(g, q); if (c) { g.fillStyle = c; g.fill(); } if (lw) KIT.ink(g, lw); }
// a flat monitor standing at (x, y) on a surface at z; facing 'l' (+y) or 'r' (+x) shows the screen
function monitor(g, P, x, y, z, along, lit) {
  const thin = 0.05, half = 0.2;
  const bx = along === 'x' ? x - half : x - thin, by = along === 'x' ? y - thin : y - half, dw = along === 'x' ? half * 2 : thin * 2, dh = along === 'x' ? thin * 2 : half * 2;
  KIT.box(g, P, x - 0.05, y - 0.05, 0.1, 0.1, z, z + 6, MAT.black, { lw: 1.2, dots: false });
  KIT.box(g, P, bx, by, dw, dh, z + 6, z + 24, MAT.black, { lw: 1.6, dots: false });
  const sd = along === 'x' ? 'l' : 'r';
  quad(g, face(P, bx, by, dw, dh, sd, 0.1, 0.9, z + 8, z + 22), lit ? MAT.screen : MAT.screenDim);
  if (lit) { const q = face(P, bx, by, dw, dh, sd, 0.18, 0.5, z + 15, z + 20); quad(g, q, 'rgba(255,255,255,0.55)'); }
}
PR.monitor = monitor;
// a low-poly bush (screen space): a gem of 7 points, lit upper-left facet, shadow lower-right
function bush(g, sx, sy, r, m, rng) {
  m = m || MAT.leaf;
  const pts = [];
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2), rr = r * rng.range(0.8, 1.1); pts.push([sx + Math.cos(a) * rr, sy - r * 0.8 + Math.sin(a) * rr * 0.85]); }
  KIT.fill(g, pts, m.left);
  const c = [sx - r * 0.1, sy - r * 0.95];
  KIT.fill(g, [pts[5], pts[6], pts[0], c], m.top);
  KIT.fill(g, [pts[1], pts[2], pts[3], c], m.right);
  KIT.poly(g, pts); KIT.ink(g, 1.6);
  KIT.line(g, [pts[0], c, pts[3]], 0.8);
}
PR.bush = bush;
function drawerLines(g, P, x, y, dw, dh, z0, z1, side, n) {
  for (let i = 1; i < n; i++) { const z = z0 + ((z1 - z0) * i) / n, q = face(P, x, y, dw, dh, side, 0.06, 0.94, z, z); KIT.line(g, [q[0], q[1]], 1); }
  for (let i = 0; i < n; i++) { const z = z0 + ((z1 - z0) * (i + 0.6)) / n, q = face(P, x, y, dw, dh, side, 0.4, 0.6, z, z); KIT.line(g, [q[0], q[1]], 1.8, '#d9dde3'); KIT.line(g, [q[0], q[1]], 0.6); }
}
PR.drawerLines = drawerLines;
// crystals growing out of a prop or the floor at local (x, y, z)
function growth(g, P, x, y, z, n, size, rng, kind) {
  const b = P(x, y, z);
  const items = [];
  for (let i = 0; i < n; i++) items.push({ ox: rng.range(-12, 12) * size, oy: rng.range(-4, 6) * size, h: rng.range(22, 46) * size, w: rng.range(5, 9) * size, lean: rng.range(-10, 10) * size });
  items.sort((a, b2) => a.oy - b2.oy);
  for (const it of items) {
    if (kind === 'spike') KIT.spike(g, b[0] + it.ox, b[1] + it.oy, it.h * 1.15, it.w * 0.8, it.lean * 1.3);
    else KIT.shard(g, b[0] + it.ox, b[1] + it.oy, it.h, it.w, it.lean);
  }
}
PR.growth = growth;
const along = (inst) => (inst.w >= inst.h ? 'x' : 'y');

// ---- the catalogue -------------------------------------------------------------------------------
// fallback for unknown ids
PR.register({ id: 'block', name: '덩어리', height: () => 40, draw(g, P, it) { KIT.bevelBox(g, P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, 0, 40, MAT.concreteDark, 0.08); } });

// Columns run up to the section cut of the diorama (the back walls' height) and end in the same
// light cut face, so they read as the building's structure, not as pedestals. 1×1 and 2×2;
// castle stone with a violet seam on the rooftop, broken off with rebar in the ruin.
const CUT = '#a9abb5';
function column(g, P, x, y, s, h, m, d, castle) {
  KIT.bevelBox(g, P, x, y, s, s, 0, 12, d, 0.06 * s);
  const i = 0.12 * s;
  KIT.box(g, P, x + i, y + i, s - 2 * i, s - 2 * i, 12, h, m);
  KIT.box(g, P, x + i - 0.02, y + i - 0.02, s - 2 * i + 0.04, s - 2 * i + 0.04, h - 10, h, castle ? d : { top: CUT, left: KIT.mul(m.left, 0.82), right: KIT.mul(m.right, 0.82) }, { dots: false });
  // a seam on each face, a chipped corner
  const sl = PR.face(P, x + i, y + i, s - 2 * i, s - 2 * i, 'l', 0.5, 0.5, 18, h - 16), sr = PR.face(P, x + i, y + i, s - 2 * i, s - 2 * i, 'r', 0.5, 0.5, 18, h - 16);
  if (castle) { KIT.line(g, [sl[0], sl[3]], 4); KIT.line(g, [sl[0], sl[3]], 2, '#b98cff'); KIT.line(g, [sr[0], sr[3]], 4); KIT.line(g, [sr[0], sr[3]], 2, '#8a4fd0'); return; }
  KIT.line(g, [sl[0], sl[3]], 1, 'rgba(10,10,12,0.45)'); KIT.line(g, [sr[0], sr[3]], 1, 'rgba(10,10,12,0.6)');
  const c = P(x + s - i, y + s * 0.5, h * 0.45); KIT.line(g, [c, [c[0] + 3, c[1] + 9], [c[0] + 1, c[1] + 16], [c[0] + 4, c[1] + 24]], 1);
}
PR.column = column;
PR.register({
  id: 'pillar', name: '기둥', tall: true, fit: (w, h) => w === 1 && h === 1, height: () => 106,
  draw(g, P, it, ctx) {
    const castle = ctx.theme === 'rooftop' || it.state === 'castle', broken = it.state === 'broken' || ctx.layout === 'ruin';
    const m = castle ? MAT.stone : MAT.concrete;
    if (broken) {
      KIT.bevelBox(g, P, 0.03, 0.03, 0.94, 0.94, 0, 12, MAT.concreteDark, 0.06);
      KIT.box(g, P, 0.15, 0.15, 0.7, 0.7, 12, 58, m);
      const t = [P(0.15, 0.85, 58), P(0.85, 0.85, 66), P(0.85, 0.15, 72), P(0.15, 0.15, 60)];
      const j = [P(0.15, 0.85, 58), P(0.4, 0.85, 70), P(0.6, 0.85, 62), P(0.85, 0.85, 66)];
      KIT.fill(g, [P(0.15, 0.85, 58), j[1], j[2], P(0.85, 0.85, 66), P(0.85, 0.15, 72), P(0.15, 0.15, 60)], m.top);
      KIT.poly(g, [t[0], j[1], j[2], t[1], t[2], t[3]]); KIT.ink(g, 2);
      const r1 = P(0.35, 0.5, 66), r2 = P(0.62, 0.42, 70);
      KIT.line(g, [r1, [r1[0] - 4, r1[1] - 18]], 2.2, '#6b5a4a'); KIT.line(g, [r2, [r2[0] + 5, r2[1] - 14]], 2.2, '#6b5a4a');
      return;
    }
    column(g, P, 0.03, 0.03, 0.94, 104, m, castle ? MAT.stoneDark : MAT.concreteDark, castle);
  },
});
PR.register({
  id: 'pillar_big', name: '큰 기둥', tall: true, fit: (w, h) => w === 2 && h === 2, height: () => 112,
  draw(g, P, it, ctx) {
    const castle = ctx.theme === 'rooftop' || it.state === 'castle';
    column(g, P, 0.05, 0.05, 1.9, 110, castle ? MAT.stone : MAT.concrete, castle ? MAT.stoneDark : MAT.concreteDark, castle);
    if (castle) return;
    // a floor plate on the lit face
    const q = PR.face(P, 0.28, 0.28, 1.44, 1.44, 'l', 0.36, 0.64, 60, 74); KIT.fill(g, q, '#23262f'); KIT.poly(g, q); KIT.ink(g, 1.2);
    const n = PR.face(P, 0.28, 0.28, 1.44, 1.44, 'l', 0.42, 0.58, 63, 71); KIT.fill(g, n, '#e8e1cf');
  },
});
// 1×N planter (N ≥ 2): concrete trough, soil, faceted shrubs; undead dead twigs, magic crystal shoots
PR.register({
  id: 'planter', name: '화단', fit: (w, h) => Math.min(w, h) === 1 && Math.max(w, h) >= 2, height: () => 62,
  draw(g, P, it, ctx) {
    KIT.box(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 24, MAT.concrete, { taper: 0.02 });
    KIT.fill(g, [P(0.18, it.h - 0.18, 22), P(it.w - 0.18, it.h - 0.18, 22), P(it.w - 0.18, 0.18, 22), P(0.18, 0.18, 22)], MAT.soil);
    const n = Math.max(it.w, it.h), rng = ctx.rng;
    for (let i = 0; i < n; i++) {
      const cx = it.w > 1 ? i + 0.5 : 0.5, cy = it.h > 1 ? i + 0.5 : 0.5, b = P(cx, cy, 22);
      if (ctx.theme === 'magic') { growth(g, P, cx, cy, 22, 2, 0.7, rng); continue; }
      if (ctx.theme === 'undead') { for (let k = 0; k < 3; k++) KIT.line(g, [b, [b[0] + rng.range(-14, 14), b[1] - rng.range(16, 30)]], 2, '#4a4038'); bush(g, b[0], b[1] + 2, 9, MAT.leafDead, rng); continue; }
      bush(g, b[0] - 6, b[1] + 1, rng.range(12, 15), MAT.leaf, rng);
      bush(g, b[0] + 7, b[1] + 4, rng.range(10, 13), MAT.leaf, rng);
      if (ctx.theme === 'beast' && i % 2) KIT.spike(g, b[0] + 2, b[1] + 6, 26, 4, 6);
    }
  },
});
// 1×N office partition: storage cabinets with a felt screen along the middle
PR.register({
  id: 'partition', name: '칸막이', tall: true, fit: (w, h) => Math.min(w, h) === 1 && Math.max(w, h) >= 2, height: () => 64,
  draw(g, P, it, ctx) {
    KIT.box(g, P, 0.05, 0.05, it.w - 0.1, it.h - 0.1, 0, 28, MAT.steel);
    const ax = along(it) === 'x';
    drawerLines(g, P, 0.05, 0.05, it.w - 0.1, it.h - 0.1, 2, 26, ax ? 'l' : 'r', 2);
    const px = ax ? 0.08 : 0.42, py = ax ? 0.42 : 0.08, pw = ax ? it.w - 0.16 : 0.16, ph = ax ? 0.16 : it.h - 0.16;
    const felt = ctx.theme === 'heavy' ? MAT.steelDark : MAT.felt;
    KIT.box(g, P, px, py, pw, ph, 28, 60, felt);
    KIT.box(g, P, px - 0.02, py - 0.02, pw + 0.04, ph + 0.04, 60, 64, MAT.cream, { dots: false });
    const rng = ctx.rng, n = Math.max(it.w, it.h);
    for (let i = 0; i < n; i++) if (rng.chance(0.7)) {
      const a = (i + rng.range(0.2, 0.6)) / n, q = face(P, px, py, pw, ph, ax ? 'l' : 'r', a, a + 0.12 / n * 2, 38, 52);
      quad(g, q, rng.pick(['#f3eedd', '#f4e27a', '#bfe3f0']), 0.9);
    }
    if (ctx.theme === 'beast') { const c = P(ax ? it.w * 0.5 : 0.5, ax ? 0.58 : it.h * 0.5, 50); for (let k = 0; k < 3; k++) KIT.line(g, [[c[0] - 8 + k * 6, c[1] - 6], [c[0] - 2 + k * 6, c[1] + 12]], 1.6); }
  },
});
// 1×N bench desks: wood tops on dark panels, monitors back to back, keyboards, papers
PR.register({
  id: 'desk_row', name: '책상 줄', fit: (w, h) => Math.min(w, h) === 1 && Math.max(w, h) >= 2, height: () => 54,
  draw(g, P, it, ctx) {
    const ax = along(it) === 'x', wood = PR.tint(MAT.wood, ctx.theme);
    KIT.box(g, P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, 0, 22, MAT.panel);
    KIT.box(g, P, 0.02, 0.02, it.w - 0.04, it.h - 0.04, 22, 27, wood, { dots: false });
    // centre divider
    if (ax) KIT.box(g, P, 0.06, 0.47, it.w - 0.12, 0.06, 27, 33, MAT.cream, { dots: false, lw: 1.2 });
    else KIT.box(g, P, 0.47, 0.06, 0.06, it.h - 0.12, 27, 33, MAT.cream, { dots: false, lw: 1.2 });
    const rng = ctx.rng, n = Math.max(it.w, it.h);
    for (let i = 0; i < n; i++) {
      const c = i + 0.5;
      const mx = ax ? c : 0.7, my = ax ? 0.7 : c;
      if (rng.chance(0.85)) monitor(g, P, mx, my, 27, ax ? 'x' : 'y', ctx.theme !== 'undead' ? rng.chance(0.7) : rng.chance(0.2));
      const kx = ax ? c : 0.86, ky = ax ? 0.86 : c;
      KIT.box(g, P, kx - (ax ? 0.18 : 0.05), ky - (ax ? 0.05 : 0.18), ax ? 0.36 : 0.1, ax ? 0.1 : 0.36, 27, 29, MAT.cream, { lw: 1, dots: false });
      if (rng.chance(0.4)) { const px = ax ? c - 0.3 : 0.25, py = ax ? 0.25 : c - 0.3; KIT.fill(g, [P(px, py, 27.5), P(px + 0.25, py, 27.5), P(px + 0.25, py + 0.2, 27.5), P(px, py + 0.2, 27.5)], '#f3eedd'); }
      if (rng.chance(0.25)) KIT.prismN(g, P, ax ? c + 0.28 : 0.25, ax ? 0.25 : c + 0.28, 0.06, 6, 27, 34, MAT.cream, { lw: 1 });
    }
    if (ctx.theme === 'magic' && n >= 3) growth(g, P, ax ? n * 0.5 : 0.3, ax ? 0.3 : n * 0.5, 27, 3, 0.6, rng);
  },
});
// 1×N server racks (the hall's aisles)
PR.register({
  id: 'server_rack', name: '서버 랙', tall: true, fit: (w, h) => Math.min(w, h) === 1 && Math.max(w, h) >= 2, height: () => 80,
  draw(g, P, it, ctx) {
    const ax = along(it) === 'x', n = Math.max(it.w, it.h), rng = ctx.rng;
    for (let i = 0; i < n; i++) {
      const x = ax ? i + 0.04 : 0.08, y = ax ? 0.08 : i + 0.04, dw = ax ? 0.92 : 0.84, dh = ax ? 0.84 : 0.92;
      KIT.box(g, P, x, y, dw, dh, 0, 76, MAT.black);
      const sd = ax ? 'l' : 'r';
      for (let k = 0; k < 6; k++) {
        const z = 8 + k * 11, q = face(P, x, y, dw, dh, sd, 0.1, 0.9, z, z + 7);
        quad(g, q, '#20242c', 0.8);
        const led = face(P, x, y, dw, dh, sd, 0.14, 0.2, z + 2, z + 5);
        quad(g, led, rng.chance(0.6) ? '#7cf0b0' : rng.chance(0.5) ? '#6fd0e6' : '#2c3a40');
      }
      KIT.box(g, P, x + 0.1, y + 0.1, dw - 0.2, dh - 0.2, 76, 80, MAT.steelDark, { dots: false, lw: 1.2 });
    }
  },
});
// 2×2 cubicle pod: four desks round a cross of felt screens
PR.register({
  id: 'cubicle', name: '칸막이 사무실', tall: true, fit: (w, h) => w === 2 && h === 2, height: () => 62,
  draw(g, P, it, ctx) {
    const wood = PR.tint(MAT.wood, ctx.theme), felt = ctx.theme === 'heavy' ? MAT.steelDark : MAT.felt, rng = ctx.rng;
    const desk = (qx, qy) => {
      const x = qx + 0.06, y = qy + 0.06;
      KIT.box(g, P, x, y, 0.88, 0.88, 0, 22, MAT.panel);
      KIT.box(g, P, x - 0.02, y - 0.02, 0.92, 0.92, 22, 26, wood, { dots: false });
      const mx = qx === 0 ? 0.62 : 1.38, my = qy === 0 ? 0.62 : 1.38;
      monitor(g, P, mx, my, 26, qx === qy ? (qx ? 'x' : 'y') : qx ? 'y' : 'x', rng.chance(0.65));
      KIT.box(g, P, qx === 0 ? 0.2 : 1.45, qy === 0 ? 0.2 : 1.45, 0.3, 0.12, 26, 28, MAT.cream, { lw: 1, dots: false });
    };
    const armX = (x0, x1) => KIT.box(g, P, x0, 0.93, x1 - x0, 0.14, 0, 58, felt);
    const armY = (y0, y1) => KIT.box(g, P, 0.93, y0, 0.14, y1 - y0, 0, 58, felt);
    desk(0, 0);
    armY(0.04, 0.93); armX(0.04, 0.93);
    desk(1, 0); desk(0, 1);
    KIT.box(g, P, 0.9, 0.9, 0.2, 0.2, 0, 62, MAT.cream);
    armX(1.07, 1.96); armY(1.07, 1.96);
    desk(1, 1);
    if (ctx.theme === 'undead') { const c = P(0.1, 0.1, 58); KIT.line(g, [c, [c[0] + 14, c[1] + 10]], 0.8, 'rgba(240,240,240,0.7)'); KIT.line(g, [[c[0] + 3, c[1] + 2], [c[0] - 2, c[1] + 16]], 0.8, 'rgba(240,240,240,0.7)'); }
  },
});
// filing cabinets (any 1×N or single)
PR.register({
  id: 'cabinet', name: '서류함', tall: true, fit: (w, h) => Math.min(w, h) === 1, height: () => 60,
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, n = Math.max(it.w, it.h), m = ctx.theme === 'undead' ? pal('#8f9a8c') : MAT.steel;
    for (let i = 0; i < n; i++) {
      const x = ax ? i + 0.05 : 0.12, y = ax ? 0.12 : i + 0.05, dw = ax ? 0.9 : 0.76, dh = ax ? 0.76 : 0.9, h = 52 + (ctx.rng.chance(0.5) ? 6 : 0);
      KIT.box(g, P, x, y, dw, dh, 0, h, m);
      drawerLines(g, P, x, y, dw, dh, 3, h - 3, ax ? 'l' : 'r', 4);
      if (ctx.rng.chance(0.4)) KIT.box(g, P, x + 0.2, y + 0.2, 0.4, 0.3, h, h + 8, MAT.cream, { lw: 1, dots: false });
    }
  },
});
// crates: single, rows or stacks; steel in the armoury
PR.register({
  id: 'crate', name: '상자 더미', fit: () => true, height: (it) => (it.w * it.h >= 4 ? 88 : 64),
  draw(g, P, it, ctx) {
    const steel = ctx.theme === 'heavy', m = steel ? MAT.crateSteel : MAT.crate, rng = ctx.rng;
    for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) {
      const s = rng.range(0.78, 0.9), ox = x + (1 - s) / 2, oy = y + (1 - s) / 2, h1 = 30 + rng.int(0, 2) * 4;
      KIT.box(g, P, ox, oy, s, s, 0, h1, m);
      const plank = (z) => { const a = face(P, ox, oy, s, s, 'l', 0, 1, z, z), b = face(P, ox, oy, s, s, 'r', 0, 1, z, z); KIT.line(g, [a[0], a[1], b[1]], 0.9); };
      plank(h1 * 0.5);
      if (!steel) { const q = face(P, ox, oy, s, s, 'l', 0.08, 0.92, 4, h1 - 4); KIT.line(g, [q[0], q[2]], 1.2); }
      else { const q = face(P, ox, oy, s, s, 'l', 0.35, 0.65, h1 * 0.6, h1 * 0.8); quad(g, q, '#d6d0bd', 0.9); }
      if (rng.chance(0.55)) { const s2 = s * rng.range(0.6, 0.8), o2 = (s - s2) * rng.range(0.2, 0.8); KIT.box(g, P, ox + o2, oy + o2, s2, s2, h1, h1 + 24, m); plank(h1 + 12); }
    }
  },
});
// a crystal mass of the demon castle on a rock mound (ring centre, ruin)
PR.register({
  id: 'crystal_mass', name: '수정 덩어리', tall: true, fit: (w, h) => Math.min(w, h) >= 1, height: (it) => 60 + 22 * Math.min(it.w, it.h),
  draw(g, P, it, ctx) {
    const rng = ctx.rng, n = it.w * it.h;
    KIT.box(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 10, MAT.stoneDark, { taper: 0.05 });
    const stones = [];
    for (let i = 0; i < n * 2; i++) stones.push([rng.range(0.25, it.w - 0.25), rng.range(0.25, it.h - 0.25)]);
    stones.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [x, y] of stones) { const p = P(x, y, 10); KIT.rock(g, p[0], p[1], rng.range(7, 12), rng, MAT.stoneDark); }
    const k = Math.min(it.w, it.h), shards = [];
    for (let i = 0; i < 3 + k * 3; i++) {
      const r = rng.range(0, 0.42) * k, a = rng.range(0, 6.283);
      shards.push({ x: it.w / 2 + Math.cos(a) * r, y: it.h / 2 + Math.sin(a) * r, h: (1 - r / (0.5 * k + 0.01) * 0.6) * (34 + 26 * k) * rng.range(0.7, 1), w: rng.range(7, 11) + k * 2, lean: rng.range(-14, 14) });
    }
    shards.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const s of shards) { const p = P(s.x, s.y, 8); if (rng.chance(0.25)) KIT.spike(g, p[0], p[1], s.h * 0.8, s.w * 0.6, s.lean * 1.4); else KIT.shard(g, p[0], p[1], s.h, s.w, s.lean); }
  },
});
// black spikes bursting from a mound (growth obstacle)
PR.register({
  id: 'spike_mass', name: '가시 덩어리', tall: true, fit: () => true, height: (it) => 54 + 18 * Math.min(it.w, it.h),
  draw(g, P, it, ctx) {
    const rng = ctx.rng, k = Math.min(it.w, it.h);
    KIT.box(g, P, 0.08, 0.08, it.w - 0.16, it.h - 0.16, 0, 8, KIT.pal('#2c2935'), { taper: 0.06 });
    const sp = [];
    for (let i = 0; i < 4 + it.w * it.h * 2; i++) sp.push({ x: rng.range(0.2, it.w - 0.2), y: rng.range(0.2, it.h - 0.2), h: rng.range(26, 46 + 16 * k), w: rng.range(5, 8), lean: rng.range(-16, 16) });
    sp.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const s of sp) { const p = P(s.x, s.y, 6); KIT.spike(g, p[0], p[1], s.h, s.w, s.lean); }
    if (ctx.theme === 'magic' || ctx.theme === 'rooftop') for (let i = 0; i < k + 1; i++) { const p = P(rng.range(0.3, it.w - 0.3), rng.range(0.3, it.h - 0.3), 6); KIT.shard(g, p[0], p[1], rng.range(20, 34), 6, rng.range(-8, 8)); }
  },
});
// a dry fountain: octagonal basin, cracked bowl, broken obelisk (plaza centre)
PR.register({
  id: 'fountain', name: '마른 분수', tall: true, fit: (w, h) => w === h && w >= 2, height: (it) => 40 + 22 * it.w,
  draw(g, P, it, ctx) {
    const c = it.w / 2, r = c - 0.06, rng = ctx.rng;
    KIT.prismN(g, P, c, c, r, 8, 0, 22, MAT.concrete, { lw: 2.4 });
    KIT.prismN(g, P, c, c, r * 0.82, 8, 22, 22.5, { top: '#3a3f4c', left: '#3a3f4c', right: '#3a3f4c' }, { lw: 1.2 });
    for (let i = 0; i < 4; i++) { const a = rng.range(0, 6.283), p0 = P(c + Math.cos(a) * r * 0.3, c + Math.sin(a) * r * 0.3, 22), p1 = P(c + Math.cos(a) * r * 0.75, c + Math.sin(a) * r * 0.75, 22); KIT.line(g, [p0, [(p0[0] + p1[0]) / 2 + rng.range(-5, 5), (p0[1] + p1[1]) / 2], p1], 1.1); }
    KIT.prismN(g, P, c, c, 0.42, 6, 22, 40, MAT.cap);
    KIT.box(g, P, c - 0.22, c - 0.22, 0.44, 0.44, 40, 40 + 14 * it.w, MAT.stone, { taper: 0.08 });
    const top = P(c, c, 40 + 14 * it.w);
    KIT.fill(g, [[top[0] - 7, top[1] + 2], [top[0] + 2, top[1] - 12], [top[0] + 8, top[1] + 3]], MAT.stone.top); KIT.poly(g, [[top[0] - 7, top[1] + 2], [top[0] + 2, top[1] - 12], [top[0] + 8, top[1] + 3]]); KIT.ink(g, 1.6);
    if (ctx.theme !== 'beast' && ctx.theme !== 'heavy') growth(g, P, c + 0.3, c + 0.5, 22, 3, 0.7, rng);
  },
});
// reception counter round a logo column (office centre)
PR.register({
  id: 'reception', name: '안내 데스크', tall: true, fit: (w, h) => w >= 3 && h >= 3, height: () => 96,
  draw(g, P, it, ctx) {
    const W = it.w, H = it.h, wood = PR.tint(MAT.wood, ctx.theme);
    KIT.box(g, P, 0.1, 0.1, W - 0.2, H - 0.2, 0, 14, MAT.panel, { dots: false });
    KIT.box(g, P, W / 2 - 0.45, H / 2 - 0.45, 0.9, 0.9, 14, 92, MAT.black);
    quad(g, face(P, W / 2 - 0.45, H / 2 - 0.45, 0.9, 0.9, 'l', 0.15, 0.85, 50, 80), '#1f2733', 1.2);
    const e = P(W / 2, H / 2 + 0.45, 65); KIT.fill(g, [[e[0], e[1] - 9], [e[0] + 7, e[1]], [e[0], e[1] + 9], [e[0] - 7, e[1]]], '#e8e1cf'); KIT.poly(g, [[e[0], e[1] - 9], [e[0] + 7, e[1]], [e[0], e[1] + 9], [e[0] - 7, e[1]]]); KIT.ink(g, 1.4);
    // counters: back two, then front two (painter order)
    KIT.box(g, P, 0.05, 0.05, W - 0.1, 0.55, 0, 34, MAT.cream);
    KIT.box(g, P, 0.05, 0.6, 0.55, H - 1.2, 0, 34, MAT.cream);
    KIT.box(g, P, W - 0.6, 0.6, 0.55, H - 1.2, 0, 34, MAT.cream);
    KIT.box(g, P, 0.05, H - 0.6, W - 0.1, 0.55, 0, 34, MAT.cream);
    for (const [x, y, w2, h2] of [[0.05, H - 0.6, W - 0.1, 0.55], [W - 0.6, 0.6, 0.55, H - 1.2]]) KIT.box(g, P, x - 0.02, y - 0.02, w2 + 0.04, h2 + 0.04, 34, 38, wood, { dots: false, lw: 1.4 });
    monitor(g, P, W - 0.35, H / 2, 38, 'y', true);
    monitor(g, P, W / 2, H - 0.35, 38, 'x', ctx.theme !== 'undead');
  },
});
// interior wall run: office glass, castle stone in the hall, concrete otherwise
PR.register({
  id: 'wall', name: '벽', tall: true, fit: (w, h) => Math.min(w, h) === 1, height: (it) => (it.state === 'stone' ? 74 : 62),
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, n = Math.max(it.w, it.h), rng = ctx.rng;
    const kind = it.state || (ctx.layout === 'office' ? 'glass' : ctx.layout === 'hall' ? 'stone' : 'concrete');
    if (kind === 'glass') {
      KIT.box(g, P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, 0, 12, MAT.concreteDark);
      const gx = ax ? 0.04 : 0.4, gy = ax ? 0.4 : 0.04, gw = ax ? it.w - 0.08 : 0.2, gh = ax ? 0.2 : it.h - 0.08;
      // glass: translucent panes so the crowd behind still shows
      const sd = ax ? 'l' : 'r';
      KIT.poly(g, face(P, gx, gy, gw, gh, sd, 0, 1, 12, 54)); g.fillStyle = MAT.glass; g.fill();
      KIT.fill(g, [P(gx, gy + gh, 54), P(gx + gw, gy + gh, 54), P(gx + gw, gy, 54), P(gx, gy, 54)], 'rgba(170,205,240,0.18)');
      for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2), q = face(P, gx, gy, gw, gh, sd, a, a, 12, 54); KIT.line(g, [q[0], q[3]], i % 2 ? 1.2 : 2.4, '#2a2f3a'); }
      for (let i = 0; i < n; i++) if (rng.chance(0.5)) { const a = (i + 0.2) / n, q = face(P, gx, gy, gw, gh, sd, a, a + 0.25 / n, 20, 48); KIT.line(g, [q[0], q[2]], 1.4, 'rgba(255,255,255,0.5)'); }
      KIT.box(g, P, gx - 0.02, gy - 0.02, gw + 0.04, gh + 0.04, 54, 60, MAT.steelDark, { dots: false, lw: 1.6 });
      return;
    }
    if (kind === 'stone') {
      KIT.box(g, P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, 0, 60, MAT.stone);
      const sd = ax ? 'l' : 'r';
      for (let r = 1; r < 4; r++) { const q = face(P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, sd, 0, 1, r * 15, r * 15); KIT.line(g, [q[0], q[1]], 1); for (let i = 0; i < n * 2; i++) { const a = (i + (r % 2) * 0.5) / (n * 2); if (a <= 0 || a >= 1) continue; const p = face(P, 0.04, 0.04, it.w - 0.08, it.h - 0.08, sd, a, a, (r - 1) * 15, r * 15); KIT.line(g, [p[0], p[3]], 0.9); } }
      for (let i = 0; i < n; i++) { const x = ax ? i + 0.12 : 0.12, y = ax ? 0.12 : i + 0.12; KIT.box(g, P, x, y, ax ? 0.5 : 0.76, ax ? 0.76 : 0.5, 60, 74, MAT.stone); }
      if (rng.chance(0.6)) growth(g, P, ax ? n * rng.range(0.2, 0.8) : 0.8, ax ? 0.8 : n * rng.range(0.2, 0.8), 0, 2, 0.75, rng);
      return;
    }
    KIT.box(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 50, MAT.concrete);
    KIT.box(g, P, 0.02, 0.02, it.w - 0.04, it.h - 0.04, 50, 56, MAT.cap, { dots: false });
  },
});
// 1×N benches (hall, plaza)
PR.register({
  id: 'bench', name: '벤치', fit: (w, h) => Math.min(w, h) === 1, height: () => 30,
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, stone = ctx.layout === 'hall';
    KIT.box(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 8, MAT.concreteDark, { dots: false });
    if (stone) { KIT.bevelBox(g, P, 0.1, 0.1, it.w - 0.2, it.h - 0.2, 8, 26, MAT.stone, 0.06); return; }
    const n = Math.max(it.w, it.h);
    for (let i = 0; i < n; i++) { const x = ax ? i + 0.2 : 0.3, y = ax ? 0.3 : i + 0.2; KIT.box(g, P, x, y, ax ? 0.1 : 0.4, ax ? 0.4 : 0.1, 8, 18, MAT.black, { lw: 1.2 }); }
    KIT.box(g, P, 0.1, 0.18, it.w - (ax ? 0.2 : 0.36), it.h - (ax ? 0.36 : 0.2), 18, 24, PR.tint(MAT.wood, ctx.theme), { dots: false });
  },
});
// rubble: broken slabs, stones and rebar (ruin)
PR.register({
  id: 'rubble', name: '잔해', fit: () => true, height: () => 46,
  draw(g, P, it, ctx) {
    const rng = ctx.rng;
    KIT.box(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 8, MAT.concreteDark, { taper: 0.08, dots: false });
    for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) {
      const a = rng.range(0.1, 0.3), b = rng.range(0.1, 0.3);
      const p = [P(x + a, y + 1 - b, 8), P(x + 1 - b, y + 1 - a, 8 + rng.range(4, 12)), P(x + 1 - a, y + b, 8 + rng.range(18, 34)), P(x + b, y + a, 8 + rng.range(10, 26))];
      KIT.fill(g, p, MAT.concrete.top); KIT.poly(g, p); KIT.halftone(g, 0.12); KIT.poly(g, p); KIT.ink(g, 1.8);
      const q = P(x + 0.5, y + 0.5, 20); KIT.line(g, [q, [q[0] + rng.range(-12, 12), q[1] - rng.range(10, 22)]], 2, '#6b5a4a');
      const r = P(x + rng.range(0.2, 0.8), y + 0.85, 6); KIT.rock(g, r[0], r[1], rng.range(5, 8), rng, MAT.concrete);
    }
  },
});
// tall bookshelf rows (magic floors)
PR.register({
  id: 'bookshelf', name: '책장', tall: true, fit: (w, h) => Math.min(w, h) === 1, height: () => 82,
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, rng = ctx.rng, sd = ax ? 'l' : 'r';
    KIT.box(g, P, 0.06, 0.12, it.w - 0.12, it.h - 0.24, 0, 78, ctx.theme === 'magic' ? pal('#5e4a3a') : MAT.wood); // walnut: never the purple floor's hue
    const n = Math.max(it.w, it.h);
    for (let s = 0; s < 4; s++) {
      const z0 = 6 + s * 18;
      quad(g, face(P, 0.06, 0.12, it.w - 0.12, it.h - 0.24, sd, 0.03, 0.97, z0, z0 + 15), '#1e1b24', 1);
      let a = 0.04;
      while (a < 0.95) { const bw = rng.range(0.02, 0.05) / n * 3; if (a + bw > 0.96) break; quad(g, face(P, 0.06, 0.12, it.w - 0.12, it.h - 0.24, sd, a, a + bw, z0, z0 + rng.range(10, 14)), rng.pick(['#6b4e7a', '#4d6b8a', '#8a7a5a', '#5a7a5e', '#9a6a6a', '#c9b98a'])); a += bw + 0.004; }
    }
    if (ctx.theme === 'magic') growth(g, P, ax ? n * 0.7 : 0.5, ax ? 0.5 : n * 0.7, 78, 2, 0.6, rng);
  },
});
// vending machine
PR.register({
  id: 'vending', name: '자판기', tall: true, fit: (w, h) => w === 1 && h === 1, height: () => 84,
  draw(g, P, it, ctx) {
    KIT.box(g, P, 0.08, 0.14, 0.84, 0.72, 0, 80, pal('#3f6f8f'));
    const q = face(P, 0.08, 0.14, 0.84, 0.72, 'l', 0.1, 0.65, 26, 72);
    quad(g, q, ctx.theme === 'undead' ? '#2c3a40' : '#cfeef6', 1.2);
    for (let r = 1; r < 4; r++) { const z = 26 + r * 11.5, l = face(P, 0.08, 0.14, 0.84, 0.72, 'l', 0.1, 0.65, z, z); KIT.line(g, [l[0], l[1]], 1); }
    quad(g, face(P, 0.08, 0.14, 0.84, 0.72, 'l', 0.72, 0.9, 40, 60), '#20242c', 1);
    quad(g, face(P, 0.08, 0.14, 0.84, 0.72, 'l', 0.1, 0.9, 6, 16), '#1a1d24', 1);
  },
});
// copier
PR.register({
  id: 'copier', name: '복사기', fit: (w, h) => w === 1 && h === 1, height: () => 46,
  draw(g, P) {
    KIT.box(g, P, 0.1, 0.12, 0.8, 0.76, 0, 34, MAT.cream);
    drawerLines(g, P, 0.1, 0.12, 0.8, 0.76, 3, 22, 'l', 2);
    KIT.box(g, P, 0.14, 0.16, 0.72, 0.6, 34, 40, pal('#c7c1b1'), { dots: false });
    KIT.box(g, P, 0.55, 0.62, 0.3, 0.2, 34, 37, MAT.black, { dots: false, lw: 1 });
    KIT.box(g, P, 0.9, 0.3, 0.16, 0.4, 20, 24, pal('#f3eedd'), { dots: false, lw: 1 });
  },
});
// big potted plant
PR.register({
  id: 'plant', name: '화분', fit: (w, h) => w === 1 && h === 1, height: () => 76,
  draw(g, P, it, ctx) {
    KIT.prismN(g, P, 0.5, 0.5, 0.32, 6, 0, 24, MAT.cream, { taper: 0.15 });
    const b = P(0.5, 0.5, 24), rng = ctx.rng, m = PR.tint(MAT.leaf, ctx.theme);
    KIT.line(g, [b, [b[0] + 2, b[1] - 22]], 2.4, '#4a3a2a');
    bush(g, b[0] - 8, b[1] - 12, 13, m, rng); bush(g, b[0] + 9, b[1] - 16, 12, m, rng); bush(g, b[0], b[1] - 30, 15, m, rng);
  },
});
// sandbag barricade (armoury)
PR.register({
  id: 'sandbags', name: '모래주머니', fit: () => true, height: () => 30,
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, n = Math.max(it.w, it.h), m = MAT.khaki;
    for (let row = 0; row < 3; row++) for (let i = 0; i < n * 2 - (row % 2); i++) {
      const a = (i + 0.5 + (row % 2) * 0.5) / 2, x = ax ? a : 0.5, y = ax ? 0.5 : a, p = P(x, y, row * 9);
      const pts = [[p[0] - 15, p[1]], [p[0] - 11, p[1] - 8], [p[0] + 9, p[1] - 10], [p[0] + 15, p[1] - 2], [p[0] + 10, p[1] + 6], [p[0] - 10, p[1] + 6]];
      KIT.fill(g, pts, m.left); KIT.fill(g, [pts[1], pts[2], pts[3], [p[0], p[1] - 2]], m.top); KIT.fill(g, [pts[3], pts[4], [p[0], p[1] + 2], [p[0], p[1] - 2]], m.right);
      KIT.poly(g, pts); KIT.ink(g, 1.5);
    }
  },
});
// weapon rack (armoury)
PR.register({
  id: 'weapon_rack', name: '무기 거치대', tall: true, fit: (w, h) => Math.min(w, h) === 1, height: () => 70,
  draw(g, P, it, ctx) {
    const ax = it.w >= it.h, n = Math.max(it.w, it.h), rng = ctx.rng;
    KIT.box(g, P, 0.08, 0.3, ax ? it.w - 0.16 : 0.4, ax ? 0.4 : it.h - 0.16, 0, 10, MAT.wood);
    for (let i = 0; i <= n; i++) { const a = Math.min(n - 0.1, Math.max(0.1, i)); const x = ax ? a : 0.5, y = ax ? 0.5 : a; KIT.box(g, P, x - 0.05, y - 0.05, 0.1, 0.1, 10, 56, MAT.wood, { lw: 1.4 }); }
    const bar = (z) => KIT.box(g, P, ax ? 0.08 : 0.45, ax ? 0.45 : 0.08, ax ? it.w - 0.16 : 0.1, ax ? 0.1 : it.h - 0.16, z, z + 4, MAT.wood, { lw: 1.2, dots: false });
    bar(30); bar(52);
    for (let i = 0; i < n * 3; i++) {
      const a = (i + 0.5) / 3, x = ax ? a : 0.62, y = ax ? 0.62 : a, b = P(x, y, 6), t = [b[0] + rng.range(-3, 3), b[1] - rng.range(52, 66)];
      KIT.line(g, [b, t], 3.4); KIT.line(g, [b, t], 1.6, rng.chance(0.5) ? '#c9d2dc' : '#8a6a4a');
      KIT.fill(g, [[t[0] - 3, t[1] + 6], [t[0], t[1] - 4], [t[0] + 3, t[1] + 6]], '#dfe6ee'); KIT.poly(g, [[t[0] - 3, t[1] + 6], [t[0], t[1] - 4], [t[0] + 3, t[1] + 6]]); KIT.ink(g, 1);
    }
  },
});
// rooftop air conditioner
PR.register({
  id: 'ac_unit', name: '실외기', fit: (w, h) => w * h <= 2, height: () => 44,
  draw(g, P, it) {
    KIT.bevelBox(g, P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 0, 38, MAT.steel, 0.05);
    const ax = it.w >= it.h;
    for (let i = 0; i < Math.max(it.w, it.h); i++) {
      const c = P(ax ? i + 0.5 : it.w / 2, ax ? it.h / 2 : i + 0.5, 38);
      g.beginPath(); g.ellipse(c[0], c[1], 15, 7.5, 0, 0, 6.2832); g.fillStyle = '#2a2f38'; g.fill(); KIT.ink(g, 1.4);
      for (let k = 0; k < 3; k++) { const a = k * 2.1; KIT.line(g, [c, [c[0] + Math.cos(a) * 13, c[1] + Math.sin(a) * 6.5]], 1.4, '#8d97a4'); }
    }
    for (let k = 1; k < 5; k++) { const q = face(P, 0.06, 0.06, it.w - 0.12, it.h - 0.12, 'l', 0.1, 0.9, k * 6, k * 6); KIT.line(g, [q[0], q[1]], 0.9); }
  },
});
// rooftop water tank on legs
PR.register({
  id: 'water_tank', name: '물탱크', tall: true, fit: (w, h) => w === 2 && h === 2, height: () => 128,
  draw(g, P) {
    for (const [x, y] of [[0.3, 0.3], [1.6, 0.3], [0.3, 1.6], [1.6, 1.6]]) KIT.box(g, P, x, y, 0.1, 0.1, 0, 26, MAT.steelDark, { lw: 1.3 });
    KIT.box(g, P, 0.2, 0.2, 1.6, 1.6, 22, 28, MAT.steelDark, { dots: false });
    KIT.prismN(g, P, 1, 1, 0.86, 10, 28, 104, pal('#8aa0b4'));
    for (const z of [50, 78]) { const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 4 + (i / 10) * Math.PI; pts.push(P(1 + Math.cos(a) * 0.86, 1 + Math.sin(a) * 0.86, z)); } KIT.line(g, pts, 1); }
    KIT.prismN(g, P, 1, 1, 0.86, 10, 104, 124, pal('#9fb3c5'), { taper: 0.85 });
    const l0 = P(1.1, 1.86, 30), l1 = P(1.1, 1.86, 104); KIT.line(g, [l0, l1], 1.4); KIT.line(g, [[l0[0] + 8, l0[1] + 4], [l1[0] + 8, l1[1] + 4]], 1.4);
    for (let z = 36; z < 104; z += 10) { const a = P(1.1, 1.86, z); KIT.line(g, [a, [a[0] + 8, a[1] + 4]], 1); }
  },
});
// a single crystal cluster obstacle on rock
PR.register({
  id: 'crystal_block', name: '수정', tall: true, fit: () => true, height: (it) => 64 + 16 * Math.min(it.w, it.h),
  draw(g, P, it, ctx) {
    const rng = ctx.rng, k = Math.min(it.w, it.h);
    for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) { const p = P(x + 0.5, y + 0.6, 0); KIT.rock(g, p[0], p[1], 16, rng, MAT.stoneDark); }
    const sh = [];
    for (let i = 0; i < 2 + 3 * k; i++) sh.push({ x: rng.range(0.25, it.w - 0.25), y: rng.range(0.25, it.h - 0.25), h: rng.range(30, 50 + 16 * k), w: rng.range(7, 11), lean: rng.range(-12, 12) });
    sh.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const s of sh) { const p = P(s.x, s.y, 6); KIT.shard(g, p[0], p[1], s.h, s.w, s.lean); }
  },
});

// ---- decor (not obstacles: furniture against the back walls, baked into the static layer) -------
// A decor piece is a catalogue prop squashed along the wall's depth: footprint 2 × 0.56 u draws
// the 2 × 1 base prop with the depth axis scaled by 0.56 (the projection stays a parallel one).
function decor(id, name, base, draw1) {
  PR.register({
    id, name, layer: 'decor', height: () => (base ? PR.defs.get(base).height({ w: 1, h: 1 }) : 66),
    draw(g, P, it, ctx) {
      const ax = it.w >= it.h, sx = ax ? 1 : it.w, sy = ax ? it.h : 1;
      const inner = { id: base || id, w: Math.max(1, Math.round(it.w / sx)), h: Math.max(1, Math.round(it.h / sy)), v: it.v };
      const Q = (x, y, z) => P(x * sx, y * sy, z);
      if (base) PR.defs.get(base).draw(g, Q, inner, ctx); else draw1(g, Q, inner, ctx);
    },
  });
}
decor('wall_desk', '벽 책상', 'desk_row');
decor('wall_cabinet', '벽 서류함', 'cabinet');
decor('potted_plant', '작은 화분', 'plant');
decor('printer', '프린터', 'copier');
decor('ac_unit_decor', '실외기(장식)', 'ac_unit');
decor('wall_rack', '벽 무기 거치대', 'weapon_rack');
decor('wall_crates', '벽 상자', 'crate');
decor('wall_shelf', '벽 책장', 'bookshelf');
decor('water_cooler', '정수기', null, (g, P) => {
  KIT.box(g, P, 0.22, 0.22, 0.56, 0.56, 0, 40, MAT.cream);
  KIT.prismN(g, P, 0.5, 0.5, 0.24, 8, 40, 64, { top: '#bfe3f0', left: '#8ec9de', right: '#3f7d96' }, { lw: 1.6 });
  quad(g, face(P, 0.22, 0.22, 0.56, 0.56, 'l', 0.38, 0.62, 26, 32), '#3a5a8a', 1);
});

// ---- slices and caching -----------------------------------------------------------------------------
const ctxOf = (inst, theme, layout) => ({ theme, layout, rng: KIT.rng(inst.id + ':' + (inst.v | 0) + ':' + inst.w + 'x' + inst.h + ':' + theme) });
const keyOf = (inst, theme, layout) => inst.id + '|' + inst.w + 'x' + inst.h + '|' + (inst.v | 0) + '|' + (inst.state || '') + '|' + theme + '|' + (layout || '');
// The prop's whole look, anchored so that local (0, 0) is at the sprite origin
PR.whole = function (inst, theme, layout) {
  const d = PR.get(inst.id), H = d.height(inst) + 8;
  const x0 = -inst.h * ISO_X - 6, x1 = inst.w * ISO_X + 6, y0 = -H - 6, y1 = (inst.w + inst.h) * ISO_Y + 8;
  return KIT.sprite('W:' + keyOf(inst, theme, layout), x0, y0, x1, y1, (g) => { d.draw(g, KIT.proj(0, 0), inst, ctxOf(inst, theme, layout)); });
};
// the slice of footprint cell (dx, dy): the whole prop clipped to that cell's column (its box up to
// the prop's height, a little wider for the ink), anchored at the cell's back corner
PR.piece = function (inst, dx, dy, theme, layout) {
  const d = PR.get(inst.id);
  if (inst.w === 1 && inst.h === 1) return PR.whole(inst, theme, layout);
  const H = d.height(inst) + 8, e = 3;
  return KIT.sprite('P:' + keyOf(inst, theme, layout) + '|' + dx + ',' + dy, -ISO_X - e - 4, -H - e - 4, ISO_X + e + 4, 2 * ISO_Y + e + 6, (g) => {
    // the column of the cell: hexagon D1 C1 C0 B0 A0 A1 around the cell box, origin at its back corner
    g.beginPath();
    g.moveTo(0, -H - e); g.lineTo(ISO_X + e, ISO_Y - H - e); g.lineTo(ISO_X + e, ISO_Y + e); g.lineTo(0, 2 * ISO_Y + e + 2); g.lineTo(-ISO_X - e, ISO_Y + e); g.lineTo(-ISO_X - e, ISO_Y - H - e); g.closePath();
    g.clip();
    d.draw(g, KIT.proj(-(dx - dy) * ISO_X, -(dx + dy) * ISO_Y), inst, ctxOf(inst, theme, layout));
  });
};
PR.shadow = function (g, P, inst) {
  const d = PR.get(inst.id), h = d.height(inst);
  KIT.shadowBox(g, (wx, wy, z) => P(inst.x + wx, inst.y + wy, z), 0.06, 0.06, inst.w - 0.12, inst.h - 0.12, Math.min(90, h * 0.85), 0.2);
};
