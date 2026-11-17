// Zone fills (구역 채우기, GDD-V2 §5.2). A fill gets the grid and one 16 × 16 zone and places its
// obstacles through the zone, which records each block for the stage (floor.stage.props), so the
// prop drawn is exactly the cells that collide:
//
//   zone = {zx, zy, x0, y0, size: 16, cx, cy, site (a site stands on the zone centre),
//           keep(x, y) (cells that must stay floor: the start's 5u, a site's centre, the guardian),
//           put(x, y, w, h, kind, {inner}) → bool   SOLID block of a kind (see layouts.js); refused
//                                                    when a cell is not floor, is kept, or leaves the
//                                                    core (offsets 3..12; {inner}: 2..13)
//           free(x, y, w, h, gap) → bool            the block and `gap` cells round it are floor
//           carve(x, y, cell)}                       VOID (or FLOOR) inside the inner 12 × 12
//
// The outer 2 cells of a zone stay open (zones always join by 4+ cells). Blocks keep one more cell
// (the core) so a wall on a zone border (office) never leaves a 1-cell gap beside them; only the
// chamber's walls and the island's shaft use the inner 12 × 12. `centre: true` marks a fill that
// covers the zone centre: the generator does not pick it for a zone whose centre holds a site.
const FILLS = BD.gen.fills;
const O = (z, k) => z.x0 + k, P = (z, k) => z.y0 + k;

// open: 0–2 single pillars somewhere in the core, at least 3 cells apart
FILLS.register({
  id: 'open', name: '탁 트인 곳',
  apply(grid, z, rng) {
    const n = rng.int(0, 2), placed = [];
    for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
      const x = rng.int(O(z, 3), O(z, 12)), y = rng.int(P(z, 3), P(z, 12));
      if (placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < 3)) continue;
      if (z.put(x, y, 1, 1, 'post')) { placed.push([x, y]); i++; }
    }
  },
});

// pillars: four 2 × 2 pillars centred 4 cells from the zone centre on both axes
FILLS.register({
  id: 'pillars', name: '기둥',
  apply(grid, z) {
    for (const dy of [3, 11]) for (const dx of [3, 11]) z.put(O(z, dx), P(z, dy), 2, 2, 'column');
  },
});

// planters: 4–6 blocks of 1 × 3 (either way round), at least 2 cells from each other
FILLS.register({
  id: 'planters', name: '화단',
  apply(grid, z, rng) {
    const n = rng.int(4, 6);
    let made = 0;
    for (let t = 0; t < 80 && made < n; t++) {
      const hor = rng.chance(0.5), w = hor ? 3 : 1, h = hor ? 1 : 3;
      const x = rng.int(O(z, 3), O(z, 13 - w)), y = rng.int(P(z, 3), P(z, 13 - h));
      if (!z.free(x, y, w, h, 2)) continue;
      if (z.put(x, y, w, h, 'planter')) made++;
    }
  },
});

// aisle: three parallel 1 × 5 rows 4 cells apart (centre to centre), the way round by seed; a row
// that would cross a site's centre is left out
FILLS.register({
  id: 'aisle', name: '통로',
  apply(grid, z, rng) {
    const hor = rng.chance(0.5);
    for (const k of [4, 8, 12]) {
      if (hor) z.put(O(z, 6), P(z, k), 5, 1, 'row');
      else z.put(O(z, k), P(z, 6), 1, 5, 'row');
    }
  },
});

// cubicles: 2 × 2 blocks on a 3 × 3 grid with 2-cell lanes, two of them left out (a site's centre
// block is always one of the two)
FILLS.register({
  id: 'cubicles', name: '골목',
  apply(grid, z, rng) {
    const slots = [];
    for (const oy of [3, 7, 11]) for (const ox of [3, 7, 11]) slots.push([O(z, ox), P(z, oy)]);
    const fits = slots.filter(([x, y]) => !z.keep(x, y) && !z.keep(x + 1, y) && !z.keep(x, y + 1) && !z.keep(x + 1, y + 1));
    const drop = Math.max(0, 2 - (slots.length - fits.length));
    const keep = rng.shuffle(fits).slice(drop);
    keep.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of keep) z.put(x, y, 2, 2, 'cube');
  },
});

// ring: one 4 × 4 block in the middle (walk round it)
FILLS.register({
  id: 'ring', name: '한 바퀴', centre: true,
  apply(grid, z) { z.put(O(z, 6), P(z, 6), 4, 4, 'mass'); },
});

// chamber: a 12 × 12 room — 1-cell walls on the inner 12 × 12, a 3-wide door in the middle of each
// side, empty inside (the hold task's brazier stands in it)
FILLS.register({
  id: 'chamber', name: '지키는 방',
  apply(grid, z) {
    const lo = 2, hi = 13, d0 = 7, d1 = 9;
    const runs = [];
    for (const y of [lo, hi]) runs.push([lo, y, d0 - lo, 1], [d1 + 1, y, hi - d1, 1]);
    for (const x of [lo, hi]) runs.push([x, lo + 1, 1, d0 - lo - 1], [x, d1 + 1, 1, hi - d1 - 1]);
    for (const [ox, oy, w, h] of runs) z.put(O(z, ox), P(z, oy), w, h, 'wall', { inner: true });
  },
});

// island: the inner 12 × 12 is a shaft (VOID) but for a 6 × 6 island in the middle and four 3-wide,
// 3-long bridges from it to the zone's border; the border becomes the walk round the shaft
FILLS.register({
  id: 'island', name: '건너가는 곳',
  apply(grid, z) {
    for (let oy = 2; oy <= 13; oy++) for (let ox = 2; ox <= 13; ox++) {
      const isle = ox >= 5 && ox <= 10 && oy >= 5 && oy <= 10;
      const bridge = (ox >= 7 && ox <= 9) || (oy >= 7 && oy <= 9);
      if (!isle && !bridge) z.carve(O(z, ox), P(z, oy), BD.CELL.VOID);
    }
  },
});
