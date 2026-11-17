// Zone fills and the plaza layout (GDD-V2 §5.2, §5.3) — the two fills the proof slice uses.
// A fill gets the grid and one 16 × 16 zone {zx, zy, x0, y0, size, cx, cy, keep(x, y)} and sets
// obstacle cells inside the zone's inner 12 × 12 (the outer 2-cell border stays open, so zones
// always join by 4+ cells). keep(x, y) cells must stay floor (the start's 5u, a site's centre).
const SOLID = () => BD.CELL.SOLID;
function put(grid, zone, cells) {
  if (cells.some(([x, y]) => zone.keep(x, y) || x < zone.x0 + 2 || y < zone.y0 + 2 || x >= zone.x0 + zone.size - 2 || y >= zone.y0 + zone.size - 2)) return false;
  for (const [x, y] of cells) grid.set(x, y, SOLID());
  return true;
}

// open: 0–2 single pillars somewhere in the inner 12 × 12, at least 3 cells apart
BD.gen.fills.register({
  id: 'open',
  apply(grid, zone, rng) {
    const n = rng.int(0, 2), placed = [];
    for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
      const x = rng.int(zone.x0 + 3, zone.x0 + zone.size - 4), y = rng.int(zone.y0 + 3, zone.y0 + zone.size - 4);
      if (placed.some(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y)) < 3)) continue;
      if (put(grid, zone, [[x, y]])) { placed.push([x, y]); i++; }
    }
  },
});

// pillars: four 2 × 2 pillars centred 4 cells from the zone centre on both axes
BD.gen.fills.register({
  id: 'pillars',
  apply(grid, zone) {
    const c = zone.size / 2;
    for (const dy of [-4, 4]) for (const dx of [-4, 4]) {
      const x = zone.x0 + c + dx - 1, y = zone.y0 + c + dy - 1;
      put(grid, zone, [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
    }
  },
});

// 광장 (plaza, the purge layout): no zone walls, pillars in the centre zone, open or pillars elsewhere.
// (§5.3 also lists planters and ring for plaza zones: they come with the generation agent.)
BD.gen.layouts.register({ id: 'plaza', centre: 'pillars', fills: ['open', 'pillars'] });
