// Static stage painter (browser only): everything of a floor that never moves, painted once into
// the screen cache of a v1 room or into the 512-px chunks of a big floor (32_bigfloor.js), from the
// stage model (36_stage.js). Painter's order:
//   inner shafts → facade and slab lip under the front edges → the floor's one flat colour →
//   carpets, emblems, slab seams, zone joints, worn patches, scuffs, cracks (clipped to the floor)
//   → wall-base and prop cast shadows (ink + halftone) → stones, ink spots → floor outline →
//   railings round shafts → back walls (glass/concrete bays, pilasters, cut top, wall items,
//   elevator) → furniture along the walls and back growths, by depth.
// Readability rule: the floor stays one flat colour per floor type; every mark on it is a step of
// that colour (±8–16 %) or thin ink, so enemies, telegraphs and pickups keep reading on it.
//
//   R.paint.region(g, P, w, cells, rect)  paint the given floor cells (painter-sorted [x, y]) with
//       projection P; rect {x0, y0, x1, y1} in P's px (null = no culling) limits marks and extras
//   R.paint.facade / R.paint.wallSeg / R.paint.wallItem / R.paint.elevator (used by the sheet too)

const C = BD.C;
const U = BD.ui;
const R = BD.client.render;
const KIT = R.kit;
const ST = R.stage;
const PT = R.paint = {};
const INK = U.INK;
const ISO_X = C.ISO_X, ISO_Y = C.ISO_Y;

const cellRng = (m, tag, x, y) => BD.Rng(BD.hash32(m.seed + ':' + tag + ':' + x + ':' + y));
const isFloor = (grid, x, y) => { const c = grid.get(x, y); return c === BD.CELL.FLOOR || c === BD.CELL.SOLID; };
const map = BD.view.map;
// does the world bbox [x0, x1] × [y0, y1] (u, z up to zTop px) touch rect (map px)?
function touches(rect, x0, y0, x1, y1, zTop, below) {
  if (!rect) return true;
  const sxa = (x0 - y1) * ISO_X, sxb = (x1 - y0) * ISO_X, sya = (x0 + y0) * ISO_Y - (zTop || 0), syb = (x1 + y1) * ISO_Y + (below || 0);
  return sxb >= rect.x0 && sxa <= rect.x1 && syb >= rect.y0 && sya <= rect.y1;
}
PT.touches = touches;

// ---- facade: the building below the slab edge -----------------------------------------------------
const FAC = { lip: 16, storey: 74, spandrel: 16, litWarm: ['#f7cf63', '#f2c04f', '#f9dc86'], litCool: '#8cc8e2', dark: '#1a2033', darkR: '#141826', body: '#262b40', bodyR: '#1a1d2c', lipL: '#a2a4ae', lipR: '#666976' };
PT.FAC = FAC;
// one 1-u segment a→b of the outer edge; side 'y' = front-left face (lit), 'x' = front-right (shadow)
PT.facade = function (g, a, b, bottom, side, rng, inner) {
  const L = FAC.lip, dx = b[0] - a[0], dy = b[1] - a[1], lit = side === 'y';
  // slab lip: concrete, two-tone
  KIT.fill(g, [a, b, [b[0], b[1] + L], [a[0], a[1] + L]], inner ? '#3a3d48' : lit ? FAC.lipL : FAC.lipR);
  KIT.line(g, [[a[0], a[1] + 4], [b[0], b[1] + 4]], 1, 'rgba(255,255,255,0.25)');
  // body
  KIT.poly(g, [[a[0], a[1] + L], [b[0], b[1] + L], [b[0], bottom], [a[0], bottom]]);
  g.fillStyle = inner ? '#10121b' : lit ? FAC.body : FAC.bodyR; g.fill();
  const P = (t, z) => [a[0] + dx * t, a[1] + dy * t + z];
  for (let k = 0; ; k++) {
    const top = L + k * FAC.storey;
    if (a[1] + top > bottom && b[1] + top > bottom) break;
    // spandrel band
    KIT.fill(g, [P(0, top), P(1, top), P(1, top + FAC.spandrel), P(0, top + FAC.spandrel)], inner ? '#1c1f2b' : lit ? '#3a3f55' : '#262a3b');
    KIT.line(g, [P(0, top + FAC.spandrel), P(1, top + FAC.spandrel)], 1.2);
    // two windows per u
    for (let c = 0; c < 2; c++) {
      const t0 = c * 0.5 + 0.05, t1 = c * 0.5 + 0.45, z0 = top + FAC.spandrel + 5, z1 = top + FAC.storey - 5;
      const r = rng.next(), deep = k > 2 ? 0.55 : 1;
      let col = lit ? FAC.dark : FAC.darkR, lamp = false;
      if (!inner && r < 0.2 * deep) { col = KIT.mix(FAC.litWarm[Math.floor(rng.next() * 3)], lit ? '#ffffff' : '#000000', lit ? 0 : 0.18); lamp = true; }
      else if (!inner && r < 0.26 * deep) { col = FAC.litCool; lamp = true; }
      else if (inner && r < 0.08) { col = '#5a4a2a'; }
      const q = [P(t0, z0), P(t1, z0), P(t1, z1), P(t0, z1)];
      KIT.fill(g, q, col);
      if (lamp) {
        KIT.fill(g, [P(t0, z0 + (z1 - z0) * 0.62), P(t1, z0 + (z1 - z0) * 0.62), P(t1, z1), P(t0, z1)], KIT.mul(col, 0.82));
        if (rng.next() < 0.35) for (let i = 1; i < 4; i++) KIT.line(g, [P(t0, z0 + i * 7), P(t1, z0 + i * 7)], 0.8, 'rgba(10,10,12,0.35)');
      } else if (rng.next() < 0.3) KIT.line(g, [P(t0 + 0.05, z1 - 4), P(t0 + 0.2, z0 + 6)], 1, 'rgba(160,190,230,0.22)');
      KIT.poly(g, q); KIT.ink(g, 1.1);
    }
    KIT.line(g, [P(0.5, top + FAC.spandrel), P(0.5, top + FAC.storey)], 1.6);
  }
  if (!lit) { KIT.poly(g, [[a[0], a[1] + L], [b[0], b[1] + L], [b[0], bottom], [a[0], bottom]]); KIT.halftone(g, 0.18); }
  KIT.line(g, [[a[0], a[1] + L], [b[0], b[1] + L]], 2);
};

// ---- back walls --------------------------------------------------------------------------------------
const WALL = { curb: 9, transom: 64, beam: 86, thick: 0.22, glass: 'rgba(14,20,40,0.56)', lit: '#5a5d6c', dark: '#3a3c49', beamC: '#24262f', cut: '#a9abb5' };
PT.WALL = WALL;
// segment of a back wall from world (x0, y0) to (x1, y1) along its side ('y0': the wall at y = 0,
// lit inner face; 'x0': at x = 0, shadow face). kind: 'glass' | 'solid' | 'elevator' | 'parapet'
PT.wallSeg = function (g, P, x0, y0, x1, y1, side, kind, rng, first, last) {
  const WH = ST.WALL_H, lit = side === 'y0';
  const A = (z) => P(x0, y0, z), B = (z) => P(x1, y1, z);
  const face = (z0, z1) => [A(z0), B(z0), B(z1), A(z1)];
  const out = side === 'y0' ? [0, -WALL.thick] : [-WALL.thick, 0];
  if (kind === 'parapet') {
    KIT.fill(g, face(0, 26), lit ? '#8f929e' : '#5e616e'); if (!lit) { KIT.poly(g, face(0, 26)); KIT.halftone(g, 0.18); }
    KIT.fill(g, [A(26), B(26), P(x1 + out[0], y1 + out[1], 26), P(x0 + out[0], y0 + out[1], 26)], '#c3c4ca');
    KIT.poly(g, [A(0), B(0), B(26), P(x1 + out[0], y1 + out[1], 26), P(x0 + out[0], y0 + out[1], 26), A(26)]); KIT.ink(g, 2);
    for (const t of [0.25, 0.75]) { const p = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 26); KIT.line(g, [p, [p[0], p[1] - 20]], 2.2); }
    KIT.line(g, [A(46), B(46)], 3.4); KIT.line(g, [A(46), B(46)], 1.6, '#b9bcc6');
    return;
  }
  // curb
  KIT.fill(g, face(0, WALL.curb), lit ? '#8a8d99' : '#585b67');
  if (kind === 'glass' || kind === 'broken') {
    KIT.poly(g, face(WALL.curb, WALL.beam)); g.fillStyle = WALL.glass; g.fill();
    // the city through the glass: towers on the pane, lit windows, now and then a sign
    const at = (t, z) => P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z);
    for (let t = rng.range(-0.1, 0.05); t < 1;) {
      const t0 = Math.max(0, t), t1 = Math.min(1, t + rng.range(0.16, 0.38)), top = rng.range(WALL.curb + 22, WALL.beam - 4);
      KIT.fill(g, [at(t0, WALL.curb), at(t1, WALL.curb), at(t1, top), at(t0, top)], rng.next() < 0.5 ? '#0a0e1e' : '#0e1428');
      for (let z = top - 5; z > WALL.curb + 5; z -= 7) for (let u = t0 + 0.025; u < t1 - 0.04; u += 0.065) {
        if (rng.next() > 0.24) continue;
        const r = rng.next(), c = r < 0.72 ? '#f2c25a' : r < 0.88 ? '#6fd0e6' : '#d978c8';
        KIT.fill(g, [at(u, z), at(u + 0.032, z), at(u + 0.032, z - 3.2), at(u, z - 3.2)], c);
      }
      if (rng.next() < 0.12) { const u = (t0 + t1) / 2; KIT.fill(g, [at(u - 0.06, top - 4), at(u + 0.06, top - 4), at(u + 0.06, top - 12), at(u - 0.06, top - 12)], rng.next() < 0.5 ? '#d978c8' : '#6fd0e6'); }
      t = t1 + rng.range(0.01, 0.06);
    }
    if (!lit) { KIT.poly(g, face(WALL.curb, WALL.beam)); KIT.halftone(g, 0.14); }
    if (kind === 'broken') { // a smashed pane: a dark hole with jagged edges, cracks round it
      const c = at(rng.range(0.3, 0.7), rng.range(34, 60)), hole = [];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832, r = rng.range(6, 15); hole.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 1.3]); }
      KIT.fill(g, hole, '#05060a'); KIT.poly(g, hole); g.lineWidth = 2; g.strokeStyle = 'rgba(200,220,255,0.6)'; g.stroke();
      for (let i = 0; i < 6; i++) { const a = rng.range(0, 6.283), L = rng.range(14, 30); KIT.line(g, [[c[0] + Math.cos(a) * 12, c[1] + Math.sin(a) * 14], [c[0] + Math.cos(a + 0.2) * L * 0.6, c[1] + Math.sin(a + 0.2) * L * 0.8], [c[0] + Math.cos(a) * L, c[1] + Math.sin(a) * L * 1.1]], 1, 'rgba(200,220,255,0.55)'); }
    }
    // reflections: one long glint per pane, some panes only
    if (rng.next() < 0.55) { const t = rng.range(0.15, 0.6), p0 = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, WALL.curb + 8), p1 = P(x0 + (x1 - x0) * (t + 0.28), y0 + (y1 - y0) * (t + 0.28), WALL.beam - 12); KIT.line(g, [p0, p1], 2, 'rgba(190,215,255,0.16)'); KIT.line(g, [[p0[0] + 7, p0[1]], [p1[0] + 7, p1[1]]], 1, 'rgba(190,215,255,0.12)'); }
    KIT.line(g, [A(WALL.transom), B(WALL.transom)], 2.2, '#3c4050'); KIT.line(g, [A(WALL.transom), B(WALL.transom)], 0.8);
    const m = P((x0 + x1) / 2, (y0 + y1) / 2, WALL.curb), mt = P((x0 + x1) / 2, (y0 + y1) / 2, WALL.beam);
    KIT.line(g, [m, mt], 2, '#3c4050'); KIT.line(g, [m, mt], 0.7);
  } else {
    KIT.fill(g, face(WALL.curb, WALL.beam), lit ? WALL.lit : WALL.dark);
    if (!lit) { KIT.poly(g, face(WALL.curb, WALL.beam)); KIT.halftone(g, 0.16); }
    // concrete panels: a seam per u, a lighter streak, now and then a crack
    const mid = P((x0 + x1) / 2, (y0 + y1) / 2, WALL.curb), midT = P((x0 + x1) / 2, (y0 + y1) / 2, WALL.beam);
    KIT.line(g, [mid, midT], 1, 'rgba(10,10,12,0.55)');
    KIT.line(g, [A(WALL.transom - 18), B(WALL.transom - 18)], 0.9, 'rgba(10,10,12,0.35)');
    if (rng.next() < 0.45) { const t = rng.range(0.15, 0.85), z = rng.range(30, 76), c = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z); KIT.line(g, [c, [c[0] + rng.range(-6, 6), c[1] + 9], [c[0] + rng.range(-4, 8), c[1] + 18], [c[0] + rng.range(-8, 4), c[1] + 26]], 1.1); }
    if (rng.next() < 0.35) { const t = rng.range(0.1, 0.7); KIT.line(g, [P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, WALL.beam - 6), P(x0 + (x1 - x0) * (t + 0.2), y0 + (y1 - y0) * (t + 0.2), WALL.curb + 10)], 2, 'rgba(255,255,255,0.06)'); }
  }
  // ceiling beam and the cut top (the diorama's section)
  KIT.fill(g, face(WALL.beam, WH), WALL.beamC);
  KIT.fill(g, [A(WH), B(WH), P(x1 + out[0], y1 + out[1], WH), P(x0 + out[0], y0 + out[1], WH)], WALL.cut);
  KIT.line(g, [A(WH), B(WH)], 2.2);
  KIT.line(g, [P(x0 + out[0], y0 + out[1], WH), P(x1 + out[0], y1 + out[1], WH)], 2.2);
  KIT.line(g, [A(WALL.beam), B(WALL.beam)], 1.4);
  KIT.line(g, [A(WALL.curb), B(WALL.curb)], 1.2);
  KIT.line(g, [A(0), B(0)], 2.4);
  if (first) KIT.line(g, [A(0), A(WH), P(x0 + out[0], y0 + out[1], WH)], 2.2);
  if (last) KIT.line(g, [B(0), B(WH), P(x1 + out[0], y1 + out[1], WH)], 2.2);
};
// a concrete pilaster standing against the wall at world (x, y)
PT.pilaster = function (g, P, x, y, side) {
  const pal = KIT.pal('#9c9eaa');
  const bx = side === 'y0' ? x - 0.16 : 0, by = side === 'y0' ? 0 : y - 0.16, dw = side === 'y0' ? 0.32 : 0.26, dh = side === 'y0' ? 0.26 : 0.32;
  KIT.box(g, P, bx, by, dw, dh, 0, ST.WALL_H, pal, { lw: 2 });
};
// wall-mounted items on the wall plane: a along the wall (u), at height z (px)
PT.wallItem = function (g, P, side, a, kind, v) {
  const at = (u, z) => (side === 'y0' ? P(u, 0.03, z) : P(0.03, u, z));
  const q = (u0, u1, z0, z1) => [at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)];
  const box = (u0, u1, z0, z1, c, lw) => { KIT.fill(g, q(u0, u1, z0, z1), c); KIT.poly(g, q(u0, u1, z0, z1)); KIT.ink(g, lw || 1.6); };
  if (kind === 'clock') {
    const pts = []; for (let i = 0; i < 14; i++) { const t = (i / 14) * 6.2832; pts.push(at(a + 0.3 + Math.cos(t) * 0.22, 66 + Math.sin(t) * 9)); }
    KIT.fill(g, pts, '#efe9da'); KIT.poly(g, pts); KIT.ink(g, 2.2);
    const c = at(a + 0.3, 66); KIT.line(g, [c, at(a + 0.3, 72)], 1.6); KIT.line(g, [c, at(a + 0.42, 64)], 1.6);
  } else if (kind === 'exit') {
    box(a, a + 0.5, 70, 80, '#2f9a5a'); box(a + 0.08, a + 0.2, 72, 78, '#e8f5ea', 0.8);
    const p = at(a + 0.32, 75); KIT.line(g, [[p[0] - 4, p[1]], [p[0] + 4, p[1]], [p[0] + 1, p[1] - 3]], 1.4, '#e8f5ea');
  } else if (kind === 'board') {
    box(a, a + 0.9, 34, 60, '#a68559', 2);
    const r = BD.Rng(v + 7); for (let i = 0; i < 4; i++) { const u = a + 0.08 + r.next() * 0.6, z = 38 + r.next() * 14; box(u, u + 0.16, z, z + 7, r.pick(['#f3eedd', '#f4e27a', '#bfe3f0', '#e8c8d8']), 0.8); }
  } else if (kind === 'whiteboard') {
    box(a, a + 1.1, 32, 62, '#f2f1ec', 2.2);
    KIT.line(g, [at(a + 0.12, 54), at(a + 0.5, 56), at(a + 0.7, 50)], 1.2, '#3a5a9a'); KIT.line(g, [at(a + 0.15, 44), at(a + 0.8, 44)], 1, '#3a3a3a'); KIT.line(g, [at(a + 0.15, 39), at(a + 0.6, 39)], 1, '#3a3a3a');
    box(a + 0.05, a + 1.05, 30, 32, '#9aa0aa', 1);
  } else if (kind === 'tv') {
    box(a, a + 0.8, 44, 68, '#16191f', 2); box(a + 0.05, a + 0.75, 47, 65, '#2b4a5c', 0.8); KIT.line(g, [at(a + 0.1, 49), at(a + 0.35, 62)], 1.2, 'rgba(255,255,255,0.25)');
  } else if (kind === 'vent') {
    box(a, a + 0.6, 70, 80, '#9a9da8', 1.4); for (let i = 1; i < 4; i++) KIT.line(g, [at(a + 0.05, 70 + i * 2.5), at(a + 0.55, 70 + i * 2.5)], 0.9);
  } else if (kind === 'extinguisher') {
    box(a, a + 0.32, 12, 40, '#b8333a', 1.8); box(a + 0.05, a + 0.27, 16, 36, '#e3e0d8', 0.8); const c = at(a + 0.16, 26); KIT.fill(g, [[c[0] - 2, c[1] - 6], [c[0] + 2, c[1] - 6], [c[0] + 2, c[1] + 6], [c[0] - 2, c[1] + 6]], '#b8333a');
  } else if (kind === 'shield') { // the armoury: a heater shield, steel rim, a dark field with a bar
    const pts = [at(a, 72), at(a + 0.5, 72), at(a + 0.5, 54), at(a + 0.25, 40), at(a, 54)];
    KIT.fill(g, pts, '#9aa6b5'); KIT.poly(g, pts); KIT.ink(g, 2);
    const inner = [at(a + 0.06, 69), at(a + 0.44, 69), at(a + 0.44, 55), at(a + 0.25, 44), at(a + 0.06, 55)];
    KIT.fill(g, inner, v % 2 ? '#2f4a7a' : '#3a3550'); KIT.poly(g, inner); KIT.ink(g, 1);
    KIT.line(g, [at(a + 0.25, 68), at(a + 0.25, 46)], 3, '#e3d9a8'); KIT.line(g, [at(a + 0.1, 62), at(a + 0.4, 62)], 3, '#e3d9a8');
  } else if (kind === 'banner') { // a hanging banner with the castle's sigil
    const c = v % 2 ? '#4a2a6a' : '#2a2d3a', pts = [at(a, 84), at(a + 0.45, 84), at(a + 0.45, 34), at(a + 0.225, 42), at(a, 34)];
    KIT.fill(g, pts, c); KIT.poly(g, pts); KIT.halftone(g, 0.12); KIT.poly(g, pts); KIT.ink(g, 1.8);
    KIT.line(g, [at(a - 0.05, 85), at(a + 0.5, 85)], 3);
    const s = at(a + 0.225, 64); KIT.fill(g, [[s[0], s[1] - 8], [s[0] + 6, s[1]], [s[0], s[1] + 8], [s[0] - 6, s[1]]], '#c9a0ff'); KIT.poly(g, [[s[0], s[1] - 8], [s[0] + 6, s[1]], [s[0], s[1] + 8], [s[0] - 6, s[1]]]); KIT.ink(g, 1);
  } else if (kind === 'sigil') { // the magic floor: a rune circle burned into the wall, glowing
    const ring = (r) => { const pts = []; for (let i = 0; i < 16; i++) { const t = (i / 16) * 6.2832; pts.push(at(a + 0.4 + Math.cos(t) * r, 58 + Math.sin(t) * r * 40)); } return pts; };
    KIT.poly(g, ring(0.42)); g.fillStyle = 'rgba(155,89,208,0.22)'; g.fill(); g.lineWidth = 2.4; g.strokeStyle = '#c9a0ff'; g.stroke();
    KIT.poly(g, ring(0.3)); g.lineWidth = 1.2; g.stroke();
    KIT.poly(g, [at(a + 0.4, 70), at(a + 0.66, 50), at(a + 0.14, 50)]); g.lineWidth = 1.4; g.stroke();
  } else if (kind === 'cobweb') { // the undead floor: webs in the corner of the bay, under the beam
    const o = at(a, 86), web = 'rgba(232,232,236,0.7)';
    for (let i = 0; i < 5; i++) { const t = (i / 4) * 1.4; KIT.line(g, [o, at(a + Math.cos(t) * 0.7, 86 - Math.sin(t) * 30)], 0.9, web); }
    for (const r of [0.25, 0.45, 0.65]) { const pts = []; for (let i = 0; i <= 4; i++) { const t = (i / 4) * 1.4; pts.push(at(a + Math.cos(t) * r, 86 - Math.sin(t) * r * 43)); } KIT.line(g, pts, 0.8, web); }
  } else if (kind === 'claws') { // the beast floor: three gouges torn through the wall
    for (let i = 0; i < 3; i++) KIT.brush(g, at(a + i * 0.12, 72 - i * 2), at(a + 0.3 + i * 0.12, 34 - i * 2), 5, 0.15);
    for (let i = 0; i < 3; i++) KIT.line(g, [at(a + i * 0.12 + 0.05, 64), at(a + 0.26 + i * 0.12, 40)], 1, 'rgba(255,255,255,0.3)');
  } else { // poster
    const r = BD.Rng(v + 3), c = r.pick(['#3d5a80', '#6b4e7a', '#4f6b4f', '#8a7a5a']);
    box(a, a + 0.5, 40, 66, '#e9e3d3', 1.8); box(a + 0.05, a + 0.45, 48, 63, c, 0.8);
    const p = at(a + 0.25, 56); KIT.fill(g, [[p[0], p[1] - 5], [p[0] + 5, p[1] + 3], [p[0] - 5, p[1] + 3]], '#e9e3d3');
  }
};
// the broken elevator: a 4-u bay with a 2-u door, one leaf forced open, one bent, the shaft dark
PT.elevator = function (g, P, side, a0) {
  const at = (u, z, d) => (side === 'y0' ? P(u, d || 0.02, z) : P(d || 0.02, u, z));
  const q = (u0, u1, z0, z1, d) => [at(u0, z0, d), at(u1, z0, d), at(u1, z1, d), at(u0, z1, d)];
  const c = a0 + 2, frame = KIT.pal('#8f97a3');
  // steel surround (slightly proud of the wall)
  KIT.fill(g, q(c - 1.25, c + 1.25, 0, 82), '#7a828e'); KIT.poly(g, q(c - 1.25, c + 1.25, 0, 82)); KIT.ink(g, 2.2);
  KIT.fill(g, q(c - 1.0, c + 1.0, 4, 74), '#07080c');
  // shaft: a hanging cable, a glint of the car far below
  KIT.line(g, [at(c + 0.15, 74), at(c + 0.2, 30), at(c + 0.05, 12)], 1.6, '#4a4e58');
  KIT.fill(g, q(c - 0.6, c - 0.1, 8, 12), '#3a2f22');
  // left leaf forced half open, right leaf bent in
  KIT.fill(g, q(c - 1.0, c - 0.55, 4, 74), frame.top); KIT.poly(g, q(c - 1.0, c - 0.55, 4, 74)); KIT.ink(g, 1.6);
  KIT.line(g, [at(c - 0.78, 10), at(c - 0.78, 68)], 1, 'rgba(255,255,255,0.35)');
  const r0 = at(c + 0.2, 4), r1 = at(c + 1.0, 4), r2 = at(c + 1.0, 74), r3 = at(c + 0.35, 74), bend = at(c + 0.05, 40, 0.3);
  KIT.fill(g, [r0, r1, r2, r3, bend], frame.left); KIT.poly(g, [r0, r1, r2, r3, bend]); KIT.ink(g, 1.8);
  KIT.line(g, [bend, at(c + 0.6, 42)], 1.2);
  KIT.poly(g, [r0, bend, r3, at(c + 0.6, 42)]); KIT.halftone(g, 0.3);
  // floor indicator and call buttons
  KIT.fill(g, q(c - 0.45, c + 0.45, 84, 94), '#16191f'); KIT.poly(g, q(c - 0.45, c + 0.45, 84, 94)); KIT.ink(g, 1.4);
  const ind = at(c, 89); KIT.fill(g, [[ind[0] - 4, ind[1] + 2], [ind[0], ind[1] - 3], [ind[0] + 4, ind[1] + 2]], '#b7f0a0');
  KIT.fill(g, q(c + 1.4, c + 1.6, 34, 48), '#9aa2ad'); KIT.poly(g, q(c + 1.4, c + 1.6, 34, 48)); KIT.ink(g, 1.2);
  // cracks round the frame
  KIT.line(g, [at(c - 1.25, 60), at(c - 1.5, 66), at(c - 1.45, 74), at(c - 1.7, 80)], 1.2);
  KIT.line(g, [at(c + 1.25, 20), at(c + 1.45, 24), at(c + 1.5, 32)], 1.2);
};

// ---- floor marks ---------------------------------------------------------------------------------------
function circlePts(P, cx, cy, r, n) { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832; pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } return pts; }
function carpet(g, P, c, col) {
  const q = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const base = c.kind === 'hall' ? KIT.mul(col, 0.74) : KIT.mul(col, 0.86), edge = KIT.mul(col, c.kind === 'hall' ? 0.6 : 0.74);
  KIT.fill(g, q(c.x, c.y, c.x + c.w, c.y + c.h), edge);
  KIT.fill(g, q(c.x + 0.3, c.y + 0.3, c.x + c.w - 0.3, c.y + c.h - 0.3), base);
  g.beginPath();
  if (c.kind === 'office') for (let i = 2; i < Math.max(c.w, c.h); i += 2) { if (i < c.w) { const a = P(c.x + i, c.y + 0.3), b = P(c.x + i, c.y + c.h - 0.3); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } if (i < c.h) { const a = P(c.x + 0.3, c.y + i), b = P(c.x + c.w - 0.3, c.y + i); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } }
  else { const a = q(c.x + 0.7, c.y + 0.7, c.x + c.w - 0.7, c.y + c.h - 0.7); g.moveTo(a[0][0], a[0][1]); for (const p of a) g.lineTo(p[0], p[1]); g.closePath(); }
  g.lineWidth = 1.2; g.strokeStyle = edge; g.stroke();
  KIT.poly(g, q(c.x, c.y, c.x + c.w, c.y + c.h)); g.lineWidth = 1.4; g.strokeStyle = 'rgba(10,10,12,0.55)'; g.stroke();
}
function emblem(g, P, e, col) {
  const line = KIT.mul(col, 0.8), light = KIT.mix(col, '#ffffff', 0.22);
  const ring = (r, lw, c) => { KIT.poly(g, circlePts(P, e.x, e.y, r, 40)); g.lineWidth = lw; g.strokeStyle = c; g.stroke(); };
  if (e.kind === 'helipad') {
    ring(e.r, 5, 'rgba(232,230,220,0.55)');
    const H = (x0, y0, x1, y1) => KIT.fill(g, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], 'rgba(232,230,220,0.55)');
    const s = e.r * 0.42; H(e.x - s, e.y - s, e.x - s * 0.6, e.y + s); H(e.x + s * 0.6, e.y - s, e.x + s, e.y + s); H(e.x - s * 0.6, e.y - s * 0.15, e.x + s * 0.6, e.y + s * 0.15);
    return;
  }
  if (e.kind === 'rune') {
    ring(e.r, 2, light); ring(e.r * 0.84, 1.2, light);
    const tri = (o) => { const pts = []; for (let i = 0; i < 3; i++) { const a = o + (i / 3) * 6.2832; pts.push(P(e.x + Math.cos(a) * e.r * 0.84, e.y + Math.sin(a) * e.r * 0.84)); } KIT.poly(g, pts); g.lineWidth = 1.2; g.strokeStyle = light; g.stroke(); };
    tri(0); tri(Math.PI);
    return;
  }
  ring(e.r, 2.2, line); ring(e.r * 0.72, 1.2, line);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.2832, p0 = P(e.x + Math.cos(a) * e.r * 0.72, e.y + Math.sin(a) * e.r * 0.72), p1 = P(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r); KIT.line(g, [p0, p1], 1.2, line); }
  const d = 0.5; KIT.fill(g, [P(e.x - d, e.y), P(e.x, e.y - d), P(e.x + d, e.y), P(e.x, e.y + d)], line);
}

// ---- small floor litter, the floor type's own (36_stage.js BITS) --------------------------------------
PT.bit = function (g, P, b) {
  const r = BD.Rng(b.seed), c = P(b.x, b.y);
  if (b.kind === 'twigs') { for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832 + r.range(-0.3, 0.3); KIT.line(g, [[c[0] + Math.cos(a) * 9, c[1] + Math.sin(a) * 4.5], [c[0] + Math.cos(a + 1.2) * 6, c[1] + Math.sin(a + 1.2) * 3 - 2]], 1.6, i % 2 ? '#3d2c1e' : '#5a4430'); } return; }
  if (b.kind === 'tuft') { for (let i = 0; i < 3; i++) KIT.brush(g, [c[0] - 5 + i * 4, c[1]], [c[0] - 2 + i * 5, c[1] - 7], 2.2, 0.1); return; }
  if (b.kind === 'bones') { for (const a of [r.range(-0.4, 0.4), r.range(1.2, 1.9)]) { const p0 = [c[0] - Math.cos(a) * 8, c[1] - Math.sin(a) * 4], p1 = [c[0] + Math.cos(a) * 8, c[1] + Math.sin(a) * 4]; KIT.line(g, [p0, p1], 5.2); KIT.line(g, [p0, p1], 2.8, '#e6dcc4'); } return; }
  if (b.kind === 'candles') {
    g.beginPath(); g.ellipse(c[0], c[1], 10, 5, 0, 0, 6.2832); g.fillStyle = '#d9cfb6'; g.fill();
    for (const [ox, oy, h] of [[-5, 0, 10], [3, -2, 14], [6, 2, 7]]) { KIT.box(g, (x, y, z) => [c[0] + ox + (x - y) * 40, c[1] + oy + (x + y) * 20 - z], -0.05, -0.05, 0.1, 0.1, 0, h, KIT.pal('#efe6cf'), { lw: 1, dots: false }); KIT.fill(g, [[c[0] + ox - 1.5, c[1] + oy - h - 1], [c[0] + ox, c[1] + oy - h - 7], [c[0] + ox + 1.5, c[1] + oy - h - 1]], '#ffe08a'); }
    return;
  }
  if (b.kind === 'shardlet') { KIT.shard(g, c[0] - 4, c[1], r.range(12, 18), 4, r.range(-5, 5)); KIT.shard(g, c[0] + 5, c[1] + 2, r.range(8, 12), 3.5, r.range(-5, 5)); return; }
  if (b.kind === 'orb') { g.beginPath(); g.ellipse(c[0], c[1] + 1, 6, 3, 0, 0, 6.2832); g.fillStyle = 'rgba(10,10,12,0.35)'; g.fill(); g.beginPath(); g.arc(c[0], c[1] - 14, 5, 0, 6.2832); g.fillStyle = '#b98cff'; g.fill(); KIT.ink(g, 1.4); g.beginPath(); g.arc(c[0] - 1.5, c[1] - 15.5, 1.6, 0, 6.2832); g.fillStyle = '#efe4ff'; g.fill(); return; }
  if (b.kind === 'bolts') { for (let i = 0; i < 3; i++) { const x = c[0] + r.range(-8, 8), y = c[1] + r.range(-3, 3), pts = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.2832; pts.push([x + Math.cos(a) * 2.6, y + Math.sin(a) * 1.6]); } KIT.fill(g, pts, '#8d97a4'); KIT.poly(g, pts); KIT.ink(g, 0.9); } return; }
  if (b.kind === 'chain') { for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(c[0] - 10 + i * 5, c[1] + (i % 2) * 1.5, 3.4, 2, i % 2 ? 0.6 : -0.3, 0, 6.2832); g.lineWidth = 2.6; g.strokeStyle = '#0a0a0c'; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = '#8d97a4'; g.stroke(); } return; }
  if (b.kind === 'grate') { const q = [P(b.x - 0.3, b.y - 0.2), P(b.x + 0.3, b.y - 0.2), P(b.x + 0.3, b.y + 0.2), P(b.x - 0.3, b.y + 0.2)]; KIT.fill(g, q, '#2a2d36'); KIT.poly(g, q); KIT.ink(g, 1.4); for (let i = 1; i < 5; i++) KIT.line(g, [P(b.x - 0.3 + i * 0.12, b.y - 0.2), P(b.x - 0.3 + i * 0.12, b.y + 0.2)], 1, '#6b6e7a'); return; }
  if (b.kind === 'gravel') { g.fillStyle = 'rgba(10,10,12,0.4)'; for (let i = 0; i < 9; i++) g.fillRect(c[0] + r.range(-12, 12), c[1] + r.range(-5, 5), 2, 1.5); return; }
  if (b.kind === 'paper') { for (let i = 0; i < 2; i++) { const x = b.x + r.range(-0.2, 0.2), y = b.y + r.range(-0.2, 0.2), q = [P(x, y), P(x + 0.22, y + 0.04), P(x + 0.18, y + 0.3), P(x - 0.04, y + 0.26)]; KIT.fill(g, q, '#efe9da'); KIT.poly(g, q); KIT.ink(g, 0.9); KIT.line(g, [P(x + 0.03, y + 0.1), P(x + 0.16, y + 0.12)], 0.7); } }
};

// ---- the region painter ---------------------------------------------------------------------------------
PT.region = function (g, P, w, cells, rect, bottom) {
  const m = ST.of(w), grid = w.grid, W = m.W, col = R.floorColor(w), theme = m.theme;
  const outside = (x, y) => { const c = grid.get(x, y); return c === -1 || (c === BD.CELL.VOID && m.voidKind[y * W + x] === 1); };
  const shaft = (x, y) => grid.get(x, y) === BD.CELL.VOID && m.voidKind[y * W + x] === 2;
  const solidOrFloor = (x, y) => isFloor(grid, x, y);
  // 1. inner shafts: their darkness, then their walls (the facade of the floors below)
  for (const [x, y] of cells) if (shaft(x, y)) KIT.fill(g, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], '#06070c');
  // 2. facade and lip under every edge whose outer side is open
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    const fy = !solidOrFloor(x, y + 1), fx = !solidOrFloor(x + 1, y);
    if (fy) { const inner = shaft(x, y + 1); PT.facade(g, P(x, y + 1), P(x + 1, y + 1), inner ? P(x, y + 1)[1] + 260 : bottom, 'y', cellRng(m, 'fy', x, y), inner); }
    if (fx) { const inner = shaft(x + 1, y); PT.facade(g, P(x + 1, y), P(x + 1, y + 1), inner ? P(x + 1, y + 1)[1] + 260 : bottom, 'x', cellRng(m, 'fx', x, y), inner); }
  }
  for (const c of m.growth.facade) {
    if (!touches(rect, c.x - 1, c.y - 1, c.x + 1, c.y + 1, 0, c.down + 60)) continue;
    const p = P(c.x, c.y); ST.drawFacadeGrowth(g, p[0], p[1] + FAC.lip + c.down, c);
  }
  // 3. the floor: one flat colour
  g.beginPath();
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    const a = P(x, y), b = P(x + 1, y), c = P(x + 1, y + 1), d = P(x, y + 1);
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
  }
  g.fillStyle = col; g.fill();
  // 4. marks on the floor, clipped to it
  g.save(); g.clip();
  const mk = m.marks;
  for (const c of mk.carpets) if (touches(rect, c.x, c.y, c.x + c.w, c.y + c.h)) carpet(g, P, c, col);
  for (const e of mk.emblems) if (touches(rect, e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r)) emblem(g, P, e, col);
  // slab seams every 2 u, broken here and there; zone joints doubled
  g.beginPath();
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    const r = cellRng(m, 's', x, y);
    const keep = theme === 'heavy' ? -1 : 0.22, step = theme === 'heavy' ? 4 : 2;
    if (x % step === 0 && x > 0 && r.next() > keep) { const a = P(x, y + r.range(0, 0.15)), b = P(x, y + 1 - r.range(0, 0.15)); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    if (y % step === 0 && y > 0 && r.next() > keep) { const a = P(x + r.range(0, 0.15), y), b = P(x + 1 - r.range(0, 0.15), y); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  }
  g.lineWidth = theme === 'heavy' ? 1.6 : 1; g.strokeStyle = KIT.mul(col, theme === 'heavy' ? 0.74 : 0.86); g.stroke();
  if (theme === 'heavy') { // steel deck plates: a rivet at each plate corner
    g.fillStyle = KIT.mul(col, 0.62);
    for (const [x, y] of cells) if (solidOrFloor(x, y)) { if (x % 4 === 0) { const p = P(x + 0.14, y + 0.5); g.fillRect(p[0] - 1.5, p[1] - 1, 3, 2); } if (y % 4 === 0) { const p = P(x + 0.5, y + 0.14); g.fillRect(p[0] - 1.5, p[1] - 1, 3, 2); } }
  }
  for (const j of mk.joints) {
    if (!touches(rect, Math.min(j[0], j[2]) - 0.2, Math.min(j[1], j[3]) - 0.2, Math.max(j[0], j[2]) + 0.2, Math.max(j[1], j[3]) + 0.2)) continue;
    const o = j[0] === j[2] ? [0.09, 0] : [0, 0.09];
    KIT.line(g, [P(j[0] - o[0], j[1] - o[1]), P(j[2] - o[0], j[3] - o[1])], 1.4, KIT.mul(col, 0.78));
    KIT.line(g, [P(j[0] + o[0], j[1] + o[1]), P(j[2] + o[0], j[3] + o[1])], 1.4, KIT.mul(col, 0.78));
  }
  for (const p of mk.patches) {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    if (!touches(rect, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) continue;
    KIT.fill(g, p.pts.map((q) => P(q[0], q[1])), p.dark ? KIT.mul(col, 0.87) : KIT.mix(col, '#ffffff', 0.07));
  }
  for (const s of mk.scuffs) { if (!touches(rect, s.x - 1, s.y - 1, s.x + 1, s.y + 1)) continue; KIT.line(g, [P(s.x, s.y), P(s.x + Math.cos(s.a) * s.l, s.y + Math.sin(s.a) * s.l)], 2.2, KIT.mix(col, '#ffffff', 0.12)); }
  for (const c of mk.cracks) {
    if (c.claw) {
      if (!touches(rect, c.x - 1, c.y - 1, c.x + 1, c.y + 1)) continue;
      for (let i = -1; i <= 1; i++) { const ox = Math.cos(c.a + 1.57) * 0.16 * i, oy = Math.sin(c.a + 1.57) * 0.16 * i; KIT.brush(g, P(c.x + ox - Math.cos(c.a) * 0.45, c.y + oy - Math.sin(c.a) * 0.45), P(c.x + ox + Math.cos(c.a) * 0.45, c.y + oy + Math.sin(c.a) * 0.45), 3, 0.1, 'rgba(10,10,12,0.75)'); }
      continue;
    }
    const p0 = c.pts[0];
    if (!touches(rect, p0[0] - 2, p0[1] - 2, p0[0] + 2, p0[1] + 2)) continue;
    if (theme === 'magic') KIT.line(g, c.pts.map((q) => P(q[0], q[1])), 3, 'rgba(201,160,255,0.35)');
    KIT.line(g, c.pts.map((q) => P(q[0], q[1])), 1.1, 'rgba(10,10,12,0.7)');
    KIT.line(g, c.branch.map((q) => P(q[0], q[1])), 0.8, 'rgba(10,10,12,0.6)');
  }
  // 5. cast shadows: along the left back wall (light comes from −x), contact strips at both walls,
  // and every prop's
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    if (x === 0) { KIT.poly(g, [P(0, y), P(0.75, y), P(0.75, y + 1), P(0, y + 1)]); g.fillStyle = 'rgba(10,10,12,0.16)'; g.fill(); KIT.halftone(g, 0.26); }
    if (y === 0 && !m.wall.parapet) { KIT.fill(g, [P(x, 0), P(x + 1, 0), P(x + 1, 0.18), P(x, 0.18)], 'rgba(10,10,12,0.22)'); }
  }
  for (const p of m.props) if (touches(rect, p.x - 0.5, p.y - 1.5, p.x + p.w + 1.5, p.y + p.h + 0.5)) R.props.shadow(g, P, p);
  for (const d of m.wall.decor) if (touches(rect, d.x, d.y, d.x + d.w + 1, d.y + d.h)) R.props.shadow(g, P, d);
  // 6. small stones, ink spots
  for (const s of mk.stones) {
    if (!touches(rect, s.x - 0.3, s.y - 0.3, s.x + 0.3, s.y + 0.3)) continue;
    const p = P(s.x, s.y); KIT.rock(g, p[0], p[1], s.r, BD.Rng(BD.hash32(m.seed + s.x)), KIT.pal(theme === 'rooftop' ? '#6b6e7a' : '#5b5e6a'));
  }
  for (const s of mk.ink) {
    if (!touches(rect, s.x - 0.5, s.y - 0.5, s.x + 0.5, s.y + 0.5)) continue;
    const p = P(s.x, s.y), r = BD.Rng(s.seed), pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832, rr = s.r * r.range(0.5, 1); pts.push([p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr * 0.5]); }
    KIT.fill(g, pts, 'rgba(10,10,12,0.7)');
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(p[0] + r.range(-2, 2) * s.r, p[1] + r.range(-0.8, 0.8) * s.r, r.range(1, 2.4), 0, 6.2832); g.fill(); }
  }
  for (const b of mk.bits) if (touches(rect, b.x - 0.6, b.y - 0.6, b.x + 0.6, b.y + 0.6, 30)) PT.bit(g, P, b);
  g.restore();
  // 7. the floor's outline, heavy ink on open edges
  g.beginPath();
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    for (const [ox, oy, ax, ay, bx, by] of [[0, -1, x, y, x + 1, y], [-1, 0, x, y, x, y + 1], [0, 1, x, y + 1, x + 1, y + 1], [1, 0, x + 1, y, x + 1, y + 1]]) {
      if (solidOrFloor(x + ox, y + oy)) continue;
      const a = P(ax, ay), b = P(bx, by); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
  }
  g.lineWidth = 3; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
  // 8. railings round the shafts
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    for (const [ox, oy, ax, ay, bx, by] of [[0, -1, x, y, x + 1, y], [-1, 0, x, y, x, y + 1], [0, 1, x, y + 1, x + 1, y + 1], [1, 0, x + 1, y, x + 1, y + 1]]) {
      if (!shaft(x + ox, y + oy)) continue;
      const pts = [];
      for (const t of [0.15, 0.5, 0.85]) { const p = P(ax + (bx - ax) * t, ay + (by - ay) * t); KIT.line(g, [p, [p[0], p[1] - 20]], 2.2); }
      pts.push(P(ax, ay, 20), P(bx, by, 20));
      KIT.line(g, pts, 3.6); KIT.line(g, pts, 1.6, '#c4c7cf');
    }
  }
  // 9. back walls with their bays, pilasters, items and the elevator
  const WB = m.wall, bayAt = (side, a) => WB.bays.find((b) => b.side === side && a >= b.a && a < b.a + b.len);
  for (const [x, y] of cells) {
    if (!solidOrFloor(x, y)) continue;
    if (y === 0 && touches(rect, x, -0.3, x + 1, 0, ST.WALL_H + 10)) {
      const b = bayAt('y0', x); PT.wallSeg(g, P, x, 0, x + 1, 0, 'y0', WB.parapet ? 'parapet' : b ? (b.kind === 'elevator' ? 'solid' : b.kind) : 'solid', cellRng(m, 'wy', x, 0), x === 0 || !solidOrFloor(x - 1, 0), !solidOrFloor(x + 1, 0));
    }
    if (x === 0 && touches(rect, -0.3, y, 0, y + 1, ST.WALL_H + 10)) {
      const b = bayAt('x0', y); PT.wallSeg(g, P, 0, y, 0, y + 1, 'x0', WB.parapet ? 'parapet' : b ? (b.kind === 'elevator' ? 'solid' : b.kind) : 'solid', cellRng(m, 'wx', 0, y), y === 0 || !solidOrFloor(0, y - 1), !solidOrFloor(0, y + 1));
    }
  }
  if (!WB.parapet) {
    for (const b of WB.bays) {
      if (b.a === 0) continue;
      const x = b.side === 'y0' ? b.a : 0, y = b.side === 'y0' ? 0 : b.a;
      if (!solidOrFloor(Math.min(x, W - 1), Math.min(y, m.H - 1)) || !touches(rect, x - 0.3, y - 0.3, x + 0.3, y + 0.3, ST.WALL_H + 10)) continue;
      PT.pilaster(g, P, x, y, b.side);
    }
    for (const it of WB.items) { const x = it.side === 'y0' ? it.a : 0, y = it.side === 'y0' ? 0 : it.a; if (touches(rect, x - 1, y - 1, x + 1, y + 1, ST.WALL_H)) PT.wallItem(g, P, it.side, it.a, it.kind, it.v); }
    if (WB.elevator) { const e = WB.elevator, x = e.side === 'y0' ? e.a : 0, y = e.side === 'y0' ? 0 : e.a; if (touches(rect, x, y, x + (e.side === 'y0' ? 4 : 0.3), y + (e.side === 'y0' ? 0.3 : 4), ST.WALL_H)) PT.elevator(g, P, e.side, e.a); }
  }
  // 10. furniture along the walls and the back growths, back to front
  const items = [];
  for (const d of WB.decor) if (touches(rect, d.x, d.y, d.x + d.w, d.y + d.h, 90)) items.push({ k: d.x + d.y + d.w + d.h, f: () => { const sp = R.props.whole(d, theme, m.layout); const p = P(d.x, d.y); KIT.blit(g, sp, p[0], p[1]); } });
  for (const c of m.growth.back) if (touches(rect, c.x - 1.6, c.y - 1.6, c.x + 1.6, c.y + 1.6, 110 * c.size + 30)) items.push({ k: c.x + c.y + 0.5, f: () => { const p = P(c.x, c.y); ST.drawGrowth(g, p[0], p[1], c, theme); } });
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f();
};
