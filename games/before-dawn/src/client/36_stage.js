// Stage model (browser only): what the static stage of a floor is made of, worked out once per
// floor from the grid and whatever the generator says, and read by the painter (37_paint.js) and
// the depth-sorted prop pass (drawWorld). It never changes the simulation.
//
// What the generator / content may put on the floor (all optional; docs/ARCHITECTURE.md §10):
//   floor.stage = {
//     layout: 'plaza'|'office'|'atrium'|'hall'|'ruin',        // GDD-V2 §5.3 배치 유형
//     zones:  [{zx, zy, fill}],                                // 16 × 16 zones, fill = §5.2 id
//     props:  [{id, x, y, w, h, v?, state?}],                  // obstacles by catalogue id; cells SOLID
//   }
// Without it the model infers: the layout from the v1 obstacle pattern, 16-u zones on a big floor,
// and one prop per rectangle of SOLID cells (connected cells split greedily into rectangles, each
// classified by its shape, the layout and the floor type). Every SOLID cell belongs to exactly one
// prop, whose footprint is that rectangle — what is drawn is what collides.
//
//   R.stage.of(w) → model {W, H, theme, layout, zones, props, cellProp, voidKind, marks, wall, growth}
//   R.stage.themeOf(w), R.stage.WALL_H, R.stage.LAYOUTS, R.stage.FILLS

const C = BD.C;
const R = BD.client.render;
const KIT = R.kit;
const ST = R.stage = { WALL_H: 100 };
ST.THEMES = ['beast', 'undead', 'magic', 'heavy', 'rooftop'];
ST.LAYOUTS = ['plaza', 'office', 'atrium', 'hall', 'ruin'];
ST.FILLS = ['open', 'pillars', 'planters', 'aisle', 'cubicles', 'ring', 'chamber', 'island'];
const PATTERN_LAYOUT = { aisle: 'office', cover: 'office', pillars: 'plaza', open: 'plaza', ring: 'ruin', rooftop: 'rooftop' };

ST.themeOf = (w) => (ST.THEMES.includes(w.floor.domType) ? w.floor.domType : 'beast');
const stageOf = (f) => f.stage || {};
ST.layoutOf = function (w) {
  const f = w.floor, s = stageOf(f);
  const L = s.layout || f.layoutType || f.arrangement || (typeof f.layout === 'string' ? f.layout : null);
  if (L) return L;
  if (f.domType === 'rooftop') return 'rooftop';
  return PATTERN_LAYOUT[f.pattern] || 'plaza';
};

const models = new WeakMap();
ST.of = function (w) {
  const key = w.floor.domType + '|' + ST.layoutOf(w) + '|' + (w.floor.stage ? 's' : '') + '|' + w.floorN;
  let m = models.get(w.grid);
  if (m && m.key === key) return m;
  m = build(w, key);
  models.set(w.grid, m);
  return m;
};
ST.reset = function (w) { if (w && w.grid) models.delete(w.grid); };

// ---- classification ------------------------------------------------------------------------------
// one rectangle of SOLID cells → a prop id
function classify(rw, rh, layout, theme, rng) {
  const a = Math.min(rw, rh), b = Math.max(rw, rh);
  const pick = (arr) => arr[Math.floor(rng.next() * arr.length)];
  if (theme === 'rooftop') {
    if (a === 2 && b === 2) return pick(['pillar_big', 'water_tank']);
    if (a === 1 && b === 1) return pick(['pillar', 'pillar', 'ac_unit']);
    if (a === 1 && b === 2) return 'ac_unit';
    if (a >= 3) return 'crystal_mass';
    return a === 1 && b >= 6 ? 'wall' : 'spike_mass';
  }
  if (a === 1 && b >= 6) return 'wall';
  if (a === 1 && b === 1) {
    if (layout === 'office') return pick(['pillar', 'pillar', 'cabinet', 'plant', 'vending', 'copier']);
    if (layout === 'ruin') return pick(['pillar', 'rubble', 'crate', 'spike_mass', 'crystal_block']);
    if (layout === 'hall') return pick(['pillar', 'pillar', 'crystal_block']);
    return pick(['pillar', 'pillar', 'pillar', 'plant']);
  }
  if (a === 1 && b <= 3) {
    if (theme === 'heavy' && layout !== 'office' && rng.next() < 0.5) return 'sandbags';
    if (layout === 'office') return 'partition';
    if (layout === 'hall') return 'bench';
    if (layout === 'ruin') return pick(['rubble', 'planter', 'crate']);
    return 'planter';
  }
  if (a === 1) { // 4–5 long rows
    if (layout === 'hall') return theme === 'magic' ? 'bookshelf' : 'server_rack';
    if (theme === 'heavy' && rng.next() < 0.35) return 'weapon_rack';
    if (theme === 'magic' && rng.next() < 0.35) return 'bookshelf';
    if (layout === 'ruin') return pick(['rubble', 'bookshelf', 'desk_row']);
    return 'desk_row';
  }
  if (a === 2 && b === 2) {
    if (layout === 'office') return 'cubicle';
    if (layout === 'ruin') return pick(['crate', 'crystal_block', 'spike_mass']);
    if (theme === 'heavy' && rng.next() < 0.4) return 'crate';
    return 'pillar_big';
  }
  if (a >= 3 && rw === rh) {
    if (layout === 'office') return 'reception';
    if (layout === 'plaza' || layout === 'atrium') return theme === 'magic' ? 'crystal_mass' : 'fountain';
    return theme === 'undead' || theme === 'heavy' ? 'spike_mass' : 'crystal_mass';
  }
  if (a >= 3) return layout === 'office' ? 'reception' : 'crystal_mass';
  return layout === 'ruin' || theme === 'magic' ? 'crystal_block' : 'crate';
}
ST.classify = classify;

// split a set of cells into rectangles: top-left-most cell, run right, then grow down
function rects(cells, W) {
  const left = new Set(cells.map(([x, y]) => y * W + x)), out = [];
  const order = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of order) {
    if (!left.has(y * W + x)) continue;
    let rw = 1;
    while (left.has(y * W + x + rw)) rw++;
    let rh = 1;
    for (;;) { let ok = true; for (let i = 0; i < rw; i++) if (!left.has((y + rh) * W + x + i)) { ok = false; break; } if (!ok) break; rh++; }
    // a tall thin column of a wider run reads better as a line: keep runs ≤ 1 thick when the
    // rectangle is very unbalanced (L-shaped walls)
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) left.delete((y + j) * W + x + i);
    out.push({ x, y, w: rw, h: rh });
  }
  return out;
}

function build(w, key) {
  const grid = w.grid, W = grid.w, H = grid.h, f = w.floor, s = stageOf(f);
  const theme = ST.themeOf(w), layout = ST.layoutOf(w);
  const seed = 'st:' + w.seed + ':' + w.floorN + ':' + W + 'x' + H;
  const m = { key, W, H, theme, layout, seed, props: [], cellProp: new Int32Array(W * H).fill(-1) };
  // zones: given, else 16-u squares on a floor of at least 32 × 32
  const Z = 16;
  m.zones = [];
  if (Array.isArray(s.zones) && s.zones.length) m.zones = s.zones.map((z) => Object.assign({ x: z.zx * Z, y: z.zy * Z, w: Z, h: Z }, z));
  else if (W >= 2 * Z && H >= 2 * Z) for (let zy = 0; zy * Z < H; zy++) for (let zx = 0; zx * Z < W; zx++) m.zones.push({ zx, zy, x: zx * Z, y: zy * Z, w: Math.min(Z, W - zx * Z), h: Math.min(Z, H - zy * Z), fill: null });
  // explicit props first
  const add = (p) => {
    const i = m.props.length;
    p.key = p.x + p.y; p.v = p.v === undefined ? (BD.hash32(seed + ':' + p.x + ',' + p.y) & 7) : p.v;
    m.props.push(p);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (grid.get(x, y) === BD.CELL.SOLID) m.cellProp[y * W + x] = i;
  };
  for (const p of s.props || f.props || []) add({ id: p.id, x: p.x, y: p.y, w: p.w || 1, h: p.h || 1, v: p.v, state: p.state, given: true });
  // the rest: components of SOLID cells → rectangles → props
  const seen = new Uint8Array(W * H), rng = KIT.rng(seed + ':classify');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen[i] || grid.get(x, y) !== BD.CELL.SOLID || m.cellProp[i] >= 0) continue;
    const comp = [], q = [[x, y]]; seen[i] = 1;
    while (q.length) {
      const [cx, cy] = q.pop(); comp.push([cx, cy]);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[j] || grid.get(nx, ny) !== BD.CELL.SOLID || m.cellProp[j] >= 0) continue;
        seen[j] = 1; q.push([nx, ny]);
      }
    }
    // a thin component (walls of a chamber or an office boundary) stays a wall even where the
    // greedy split leaves short pieces at its corners
    const rs = rects(comp, W), thin = rs.every((r) => Math.min(r.w, r.h) === 1) && comp.length >= 8;
    for (const r of rs) {
      let id = thin ? 'wall' : classify(r.w, r.h, layout, theme, rng);
      if (!R.props.get(id).fit(r.w, r.h)) id = r.w === 1 || r.h === 1 ? 'crate' : 'crystal_block';
      add({ id, x: r.x, y: r.y, w: r.w, h: r.h });
    }
  }
  // voids: outer (open to the sky) or inner (an atrium shaft)
  m.voidKind = new Uint8Array(W * H);
  {
    const q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && grid.get(x, y) === BD.CELL.VOID) { m.voidKind[y * W + x] = 1; q.push([x, y]); }
    while (q.length) { const [cx, cy] = q.pop(); for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (!m.voidKind[j] && grid.get(nx, ny) === BD.CELL.VOID) { m.voidKind[j] = 1; q.push([nx, ny]); } } }
    for (let i = 0; i < W * H; i++) if (!m.voidKind[i] && grid.cells[i] === BD.CELL.VOID) m.voidKind[i] = 2;
  }
  m.marks = marks(w, m);
  m.wall = walls(w, m);
  m.growth = growths(w, m);
  return m;
}

// ---- floor marks: carpets, emblems, worn patches, cracks, scuffs, rubble, ink -------------------------
const isFloor = (grid, x, y) => { const c = grid.get(x, y); return c === BD.CELL.FLOOR || c === BD.CELL.SOLID; };
function zoneFill(m, z) {
  if (z.fill) return z.fill;
  // inferred from what stands in it
  const ids = m.props.filter((p) => p.x >= z.x && p.y >= z.y && p.x < z.x + z.w && p.y < z.y + z.h).map((p) => p.id);
  if (ids.some((i) => i === 'cubicle')) return 'cubicles';
  if (ids.some((i) => i === 'desk_row' || i === 'server_rack' || i === 'bookshelf' || i === 'weapon_rack')) return 'aisle';
  if (ids.some((i) => i === 'pillar_big' || i === 'water_tank')) return 'pillars';
  if (ids.some((i) => i === 'fountain' || i === 'reception' || i === 'crystal_mass' || i === 'spike_mass')) return 'ring';
  if (ids.filter((i) => i === 'wall').length >= 3) return 'chamber';
  if (ids.some((i) => i === 'planter' || i === 'partition' || i === 'sandbags' || i === 'bench')) return 'planters';
  return 'open';
}
const BITS = {
  beast: { p: 0.05, kinds: ['twigs', 'twigs', 'tuft'] }, undead: { p: 0.05, kinds: ['bones', 'candles', 'bones'] },
  magic: { p: 0.06, kinds: ['shardlet', 'shardlet', 'orb'] }, heavy: { p: 0.04, kinds: ['bolts', 'chain'] }, rooftop: { p: 0.05, kinds: ['grate', 'gravel', 'gravel'] },
};
ST.BITS = BITS;
function marks(w, m) {
  const grid = w.grid, W = m.W, H = m.H, rng = KIT.rng(m.seed + ':marks');
  const out = { carpets: [], emblems: [], patches: [], cracks: [], scuffs: [], stones: [], ink: [], joints: [], bits: [] };
  for (const z of m.zones) {
    const fill = (z.fillSeen = zoneFill(m, z)), cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    if ((fill === 'cubicles' || fill === 'aisle') && m.layout !== 'ruin' && m.theme !== 'rooftop') out.carpets.push({ x: z.x + 1, y: z.y + 1, w: z.w - 2, h: z.h - 2, kind: m.layout === 'hall' ? 'runner' : 'office' });
    else if (fill === 'chamber') out.carpets.push({ x: z.x + 3, y: z.y + 3, w: z.w - 6, h: z.h - 6, kind: 'hall' });
    else if (fill === 'pillars' || fill === 'open' || fill === 'ring') { if (m.layout !== 'ruin' && rng.next() < (fill === 'open' ? 0.45 : 0.8)) out.emblems.push({ x: cx, y: cy, r: fill === 'ring' ? 4.2 : 3.2, kind: m.theme === 'magic' ? 'rune' : m.theme === 'rooftop' ? 'helipad' : 'inlay' }); }
    else if (fill === 'island') out.emblems.push({ x: cx, y: cy, r: 2.4, kind: 'inlay' });
  }
  // zone joints: expansion joints along zone borders
  for (const z of m.zones) { if (z.x > 0) out.joints.push([z.x, z.y, z.x, z.y + z.h]); if (z.y > 0) out.joints.push([z.x, z.y, z.x + z.w, z.y]); }
  if (m.theme === 'rooftop' && !out.emblems.some((e) => e.kind === 'helipad')) out.emblems.push({ x: W / 2, y: H / 2, r: Math.min(4, W / 6), kind: 'helipad' });
  // wear: denser near walls, props and edges; the ruin and the beast floor are rougher
  const rough = (m.layout === 'ruin' ? 1.6 : 1) * (m.theme === 'undead' ? 1.45 : m.theme === 'beast' ? 1.2 : 1);
  const nearThing = (x, y) => x <= 1 || y <= 1 || !isFloor(grid, x + 2, y) || !isFloor(grid, x, y + 2) || grid.get(x + 1, y) === BD.CELL.SOLID || grid.get(x, y + 1) === BD.CELL.SOLID || grid.get(x - 1, y) === BD.CELL.SOLID || grid.get(x, y - 1) === BD.CELL.SOLID;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid.get(x, y) !== BD.CELL.FLOOR) continue;
    const near = nearThing(x, y), p = rng.next();
    const edge = x <= 1 || y <= 1 || !isFloor(grid, x + 1, y) || !isFloor(grid, x, y + 1);
    if (p < (edge ? 0.16 : near ? 0.08 : 0.014) * rough) {
      const n = 6 + Math.floor(rng.next() * 3), r = rng.range(0.45, edge ? 1.9 : near ? 1.5 : 1.1), pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + rng.range(-0.25, 0.25), rr = r * rng.range(0.55, 1); pts.push([x + 0.5 + Math.cos(a) * rr, y + 0.5 + Math.sin(a) * rr]); }
      out.patches.push({ pts, dark: rng.next() < (edge ? 0.92 : 0.75) });
    }
    if (rng.next() < (near ? 0.03 : 0.008) * rough * rough) {
      const pts = [[x + rng.next(), y + rng.next()]], L = rng.int(3, 6);
      let a = rng.range(0, 6.283);
      for (let i = 0; i < L; i++) { a += rng.range(-0.9, 0.9); const q = pts[pts.length - 1]; pts.push([q[0] + Math.cos(a) * rng.range(0.25, 0.5), q[1] + Math.sin(a) * rng.range(0.25, 0.5)]); }
      const br = pts[Math.floor(L / 2)], b2 = [br[0] + rng.range(-0.4, 0.4), br[1] + rng.range(-0.4, 0.4)];
      out.cracks.push({ pts, branch: [br, b2] });
    }
    if (rng.next() < 0.012) out.scuffs.push({ x: x + rng.next(), y: y + rng.next(), a: rng.range(-0.6, 0.6), l: rng.range(0.4, 0.9) });
    if (rng.next() < (near ? 0.05 : 0.006) * rough) out.stones.push({ x: x + rng.range(0.15, 0.85), y: y + rng.range(0.15, 0.85), r: rng.range(2.5, 5) });
    // rubble heaps at the walls and the slab edge: a few chunks together (the reference's debris)
    if (edge && rng.next() < 0.05 * rough) { const cx = x + rng.range(0.2, 0.8), cy = y + rng.range(0.2, 0.8), k = rng.int(3, 6); for (let i = 0; i < k; i++) out.stones.push({ x: cx + rng.range(-0.45, 0.45), y: cy + rng.range(-0.3, 0.3), r: rng.range(3.5, 8.5) }); }
    if (edge && rng.next() < 0.012 * rough) out.ink.push({ x: x + rng.next(), y: y + rng.next(), r: rng.range(8, 15), seed: rng.int(1, 1e6) });
    if (rng.next() < 0.004 * rough) out.ink.push({ x: x + rng.next(), y: y + rng.next(), r: rng.range(4, 9), seed: rng.int(1, 1e6) });
    if (m.theme === 'beast' && rng.next() < (near ? 0.03 : 0.008)) out.cracks.push({ claw: true, x: x + 0.5, y: y + 0.5, a: rng.range(0, 3.14) });
    // the floor type's own litter, against walls and props only (the middle stays clear)
    const bit = BITS[m.theme];
    if (bit && near && rng.next() < bit.p) out.bits.push({ x: x + rng.range(0.2, 0.8), y: y + rng.range(0.2, 0.8), kind: bit.kinds[Math.floor(rng.next() * bit.kinds.length)], seed: rng.int(1, 1e6) });
    if (m.layout === 'office' && near && m.theme !== 'rooftop' && rng.next() < 0.03) out.bits.push({ x: x + rng.next(), y: y + rng.next(), kind: 'paper', seed: rng.int(1, 1e6) });
  }
  return out;
}

// ---- back walls: bays of glass or concrete, wall items, furniture along them, the elevator ---------
// what makes a floor type's walls its own: smashed panes, mounted items, furniture
const BROKEN = { beast: 0.35, undead: 0.3, magic: 0.12, heavy: 0.1 };
const WALL_ITEMS = { heavy: ['shield', 'shield', 'banner', 'banner'], magic: ['sigil', 'sigil', 'banner'], undead: ['cobweb', 'cobweb', 'clock'], beast: ['claws', 'claws', 'claws', 'poster'] };
const WALL_DECOR = { heavy: ['wall_rack', 'wall_crates'], magic: ['wall_shelf', 'wall_shelf'], beast: ['wall_crates', 'wall_crates'], undead: ['wall_cabinet', 'wall_cabinet'] };
ST.WALL_ITEMS = WALL_ITEMS; ST.WALL_DECOR = WALL_DECOR;
function walls(w, m) {
  const grid = w.grid, W = m.W, H = m.H, rng = KIT.rng(m.seed + ':walls'), out = { bays: [], items: [], decor: [], elevator: null, parapet: m.theme === 'rooftop' };
  const st = w.stairs, B = 4;
  const doorAt = (side, a) => st && st.side === side && Math.abs((side === 'y0' ? st.x : st.y) - a) < 2.2;
  for (const side of ['y0', 'x0']) {
    const n = side === 'y0' ? W : H;
    for (let a = 0; a < n; a += B) {
      const len = Math.min(B, n - a);
      let kind = rng.next() < 0.62 ? (rng.next() < (BROKEN[m.theme] || 0.08) ? 'broken' : 'glass') : 'solid';
      if (doorAt(side, a + len / 2) || doorAt(side, a) || doorAt(side, a + len)) kind = 'solid';
      out.bays.push({ side, a, len, kind });
    }
  }
  // the broken elevator: a solid bay on the side without the stairs (or far from them)
  const cands = out.bays.filter((b) => b.kind === 'solid' && b.len === B && !doorAt(b.side, b.a + B / 2) && !(st && st.side === b.side && Math.abs((b.side === 'y0' ? st.x : st.y) - (b.a + 2)) < 8) && b.a >= 4);
  if (cands.length && !out.parapet) { out.elevator = cands[Math.floor(rng.next() * cands.length)]; out.elevator.kind = 'elevator'; }
  // wall items on solid bays; furniture in front of glass and solid bays
  const base = ['clock', 'exit', 'board', 'whiteboard', 'tv', 'vent', 'extinguisher', 'poster', 'poster'], own = WALL_ITEMS[m.theme] || [];
  const pickItem = () => (own.length && rng.next() < 0.55 ? own[Math.floor(rng.next() * own.length)] : base[Math.floor(rng.next() * base.length)]);
  for (const b of out.bays) {
    if (b.kind === 'elevator' || out.parapet) continue;
    if (b.kind === 'solid' && !doorAt(b.side, b.a + b.len / 2)) out.items.push({ side: b.side, a: b.a + rng.range(0.6, b.len - 1.4), kind: pickItem(), v: rng.int(0, 7) });
    if (b.kind === 'solid' && rng.next() < 0.5 && b.len >= 3 && !doorAt(b.side, b.a + b.len / 2)) out.items.push({ side: b.side, a: b.a + b.len - 1.1, kind: pickItem(), v: rng.int(0, 7) });
    if (b.kind !== 'solid' && m.theme === 'undead' && rng.next() < 0.5) out.items.push({ side: b.side, a: b.a + 0.1, kind: 'cobweb', v: 0 });
    // furniture: a wall desk, cabinets, a cooler or a plant, never in front of the stairs door
    let a = b.a + 0.3;
    while (a < b.a + b.len - 0.8) {
      const c = rng.next(), wid = c < 0.4 ? 2 : 1;
      if (a + wid > b.a + b.len - 0.2) break;
      if (doorAt(b.side, a + wid / 2) || doorAt(b.side, a) || doorAt(b.side, a + wid)) { a += 1; continue; }
      let id = c < 0.4 ? 'wall_desk' : c < 0.62 ? 'wall_cabinet' : c < 0.74 ? 'water_cooler' : c < 0.86 ? 'potted_plant' : c < 0.92 ? 'printer' : null;
      const sw = WALL_DECOR[m.theme]; // the floor type's own furniture takes some places
      if (sw && id && rng.next() < 0.45) id = wid === 2 ? sw[0] : sw[1];
      if (id) {
        const cellX = b.side === 'y0' ? Math.floor(a) : 0, cellY = b.side === 'y0' ? 0 : Math.floor(a);
        if (grid.get(cellX, cellY) === BD.CELL.FLOOR) out.decor.push(b.side === 'y0' ? { id, x: a, y: 0.04, w: wid, h: 0.56, v: rng.int(0, 7), side: b.side } : { id, x: 0.04, y: a, w: 0.56, h: wid, v: rng.int(0, 7), side: b.side });
      }
      a += wid + rng.range(0.2, 1.2);
    }
  }
  if (out.parapet) {
    for (let i = 0; i < 4; i++) { const side = i % 2 ? 'x0' : 'y0', a = rng.range(2, (side === 'y0' ? W : H) - 3); out.decor.push(side === 'y0' ? { id: 'ac_unit_decor', x: a, y: 0.1, w: 1, h: 0.7, v: i, side } : { id: 'ac_unit_decor', x: 0.1, y: a, w: 0.7, h: 1, v: i, side }); }
  }
  return out;
}

// ---- growths of the demon castle: back (baked) and front (depth-sorted, in front of actors) ---------
const GROW = { beast: { spike: 1, crystal: 0.5, nest: 0.4 }, undead: { spike: 1.3, crystal: 0.45, bone: 0.5 }, magic: { spike: 0.45, crystal: 1.8 }, heavy: { spike: 1.25, crystal: 0.45 }, rooftop: { spike: 1.6, crystal: 1.6 } };
ST.GROW = GROW;
function growths(w, m) {
  const grid = w.grid, W = m.W, H = m.H, rng = KIT.rng(m.seed + ':grow'), G = GROW[m.theme] || GROW.beast, out = { back: [], front: [], facade: [] };
  const kindAt = () => (rng.next() * (G.spike + G.crystal) < G.crystal ? 'crystal' : 'spike');
  const st = w.stairs, nearDoor = (x, y) => st && Math.hypot(st.ringX - x, st.ringY - y) < 3.4;
  const dense = (G.spike + G.crystal) / 1.6;
  // corners: masses taller than a man
  if (isFloor(grid, 0, 0)) out.back.push({ x: 0.2, y: 0.2, n: 10, size: 2.0, kind: 'mix' });
  if (isFloor(grid, W - 1, 0)) out.back.push({ x: W - 0.35, y: 0.25, n: 8, size: 1.75, kind: 'mix' });
  if (isFloor(grid, 0, H - 1)) out.back.push({ x: 0.25, y: H - 0.35, n: 8, size: 1.75, kind: 'mix' });
  // along the back walls, in clumps
  const per = 5.5 / dense;
  for (let a = 2.5 + rng.range(0, per); a < W - 2; a += per * rng.range(0.55, 1.45)) if (isFloor(grid, Math.floor(a), 0) && !nearDoor(a, 0.3)) out.back.push({ x: a, y: 0.18, n: rng.int(3, 6), size: rng.range(1.05, 1.6), kind: kindAt() });
  for (let a = 2.5 + rng.range(0, per); a < H - 2; a += per * rng.range(0.55, 1.45)) if (isFloor(grid, 0, Math.floor(a)) && !nearDoor(0.3, a)) out.back.push({ x: 0.18, y: a, n: rng.int(3, 6), size: rng.range(1.05, 1.6), kind: kindAt() });
  // the front edges (on the slab lip, outside the floor), the front corner, crystals in the facade
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (!isFloor(grid, x, y)) continue;
    const fy = grid.get(x, y + 1), fx = grid.get(x + 1, y);
    const edgeY = fy === -1 || (fy === BD.CELL.VOID && m.voidKind[(y + 1) * W + x] === 1), edgeX = fx === -1 || (fx === BD.CELL.VOID && m.voidKind[y * W + x + 1] === 1);
    if (edgeY && edgeX) { out.front.push({ x: x + 1.08, y: y + 1.08, n: 10, size: 2.0, kind: 'mix' }); continue; }
    if (edgeY && rng.next() < 0.075 * dense * 1.6) out.front.push({ x: x + rng.range(0.2, 0.8), y: y + 1.14, n: rng.int(3, 5), size: rng.range(1.0, 1.55), kind: kindAt() });
    if (edgeX && rng.next() < 0.075 * dense * 1.6) out.front.push({ x: x + 1.14, y: y + rng.range(0.2, 0.8), n: rng.int(3, 5), size: rng.range(1.0, 1.55), kind: kindAt() });
    if (edgeY && rng.next() < 0.05 * dense) out.facade.push({ x: x + rng.range(0.2, 0.8), y: y + 1, side: 'y', down: rng.range(30, 160) });
    if (edgeX && rng.next() < 0.05 * dense) out.facade.push({ x: x + 1, y: y + rng.range(0.2, 0.8), side: 'x', down: rng.range(30, 160) });
  }
  for (const c of out.back.concat(out.front, out.facade)) c.seed = rng.int(1, 1e9);
  return out;
}
// drop every cached stage canvas (floor type changed by a test, a staging page, a settings change)
R.invalidate = function () {
  if (R.big) R.big.grid = null;
  R.floorKey = null; R.cache = null;
  KIT.clearCache();
  if (R.sky) R.sky.key = null;
};
// one growth cluster drawn at screen (sx, sy)
ST.drawGrowth = function (g, sx, sy, c, theme) {
  const rng = BD.Rng(c.seed), items = [], n = c.n, sz = c.size;
  for (let i = 0; i < n; i++) {
    const k = c.kind === 'mix' ? (i % 3 === 1 ? 'spike' : 'crystal') : c.kind;
    const ox = rng.range(-17, 17) * sz, centre = 1.3 - Math.min(1, Math.abs(ox) / (17 * sz)) * 0.65;
    items.push({ k, ox, oy: rng.range(-6, 8) * sz, h: rng.range(30, 60) * sz * centre * (k === 'spike' ? 1.15 : 1), w: rng.range(6, 10) * Math.sqrt(sz), lean: (ox / (17 * sz)) * rng.range(6, 16) * sz + rng.range(-4, 4) });
  }
  items.sort((a, b) => a.oy - b.oy);
  // a dark root mound under the cluster, its rocks
  const mound = [[sx - 24 * sz, sy + 3], [sx - 10 * sz, sy - 6 * sz], [sx + 12 * sz, sy - 5 * sz], [sx + 26 * sz, sy + 3], [sx + 8 * sz, sy + 10 * sz], [sx - 14 * sz, sy + 8 * sz]];
  KIT.fill(g, mound, '#1b1822'); KIT.poly(g, mound); KIT.ink(g, 1.6);
  const heavy = theme === 'heavy' ? { pal: { lit: '#4a4e5a', dark: '#14161b', glint: '#8a93a3' } } : undefined;
  for (const it of items) {
    if (it.k === 'spike') KIT.spike(g, sx + it.ox, sy + it.oy, it.h, it.w * 0.8, it.lean * 1.3, heavy);
    else KIT.shard(g, sx + it.ox, sy + it.oy, it.h, it.w, it.lean);
  }
  for (let i = 0; i < 3; i++) KIT.rock(g, sx + rng.range(-22, 22) * sz, sy + rng.range(4, 10) * sz, rng.range(3, 5) * Math.sqrt(sz), rng, KIT.pal('#3a3545'));
};
// crystals grown into the facade below the slab edge (screen point (sx, sy) on the face)
ST.drawFacadeGrowth = function (g, sx, sy, c) {
  const rng = BD.Rng(c.seed), dir = c.side === 'y' ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    const x = sx + rng.range(-10, 10), y = sy + rng.range(-8, 8), h = rng.range(22, 40), w = rng.range(5, 8);
    KIT.shard(g, x, y, h, w, dir * rng.range(10, 22));
  }
};
