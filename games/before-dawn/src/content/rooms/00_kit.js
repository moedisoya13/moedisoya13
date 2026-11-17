// Shared helpers for the room shapes and obstacle patterns of GDD §7.2 (used at run time only,
// from inside apply()). Spacing is measured in free cells, Chebyshev:
//   wallGap  — free cells between a block and the outer wall or a VOID cell (§7.2: 2)
//   solidGap — free cells between two blocks (§7.2: 2; `pillars` / `aisle` ask for 3, "간격 3칸 이상")
// Interpretation note (docs/requests/enemies.md): "간격 3칸 이상" is read as three free cells
// between pillars / desk rows, i.e. stricter than the general 2-cell rule it would otherwise repeat.

const CELL = BD.CELL;
const K = BD.roomKit = {};

K.rectCells = function (x, y, bw, bh) {
  const out = [];
  for (let oy = 0; oy < bh; oy++) for (let ox = 0; ox < bw; ox++) out.push([x + ox, y + oy]);
  return out;
};

// True if every cell is floor, no wall/void lies within wallGap, no SOLID within solidGap.
K.fits = function (grid, cells, wallGap, solidGap) {
  const own = new Set(cells.map(([x, y]) => y * 1000 + x));
  for (const [x, y] of cells) if (!grid.walkable(x, y)) return false;
  const reach = Math.max(wallGap, solidGap);
  for (const [x, y] of cells) {
    for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
      const nx = x + ox, ny = y + oy;
      if (own.has(ny * 1000 + nx)) continue;
      const c = grid.get(nx, ny), d = Math.max(Math.abs(ox), Math.abs(oy));
      if ((c === -1 || c === CELL.VOID) && d <= wallGap) return false;
      if (c === CELL.SOLID && d <= solidGap) return false;
    }
  }
  return true;
};

// Place up to `count` blocks; each try draws a candidate from make(rng) → cells. Repeats the
// whole placement `rounds` times on a scratch copy and keeps the best (first that reaches
// `count`, else the one with most blocks). Returns the placed blocks (arrays of cells).
K.placeBlocks = function (grid, rng, count, make, wallGap, solidGap, rounds, tries) {
  const base = grid.cells.slice();
  let best = [];
  let bestCells = null;
  for (let r = 0; r < (rounds || 30); r++) {
    grid.cells.set(base);
    const placed = [];
    for (let i = 0; i < (tries || 200) && placed.length < count; i++) {
      const cells = make(rng);
      if (!cells || !K.fits(grid, cells, wallGap, solidGap)) continue;
      for (const [x, y] of cells) grid.set(x, y, CELL.SOLID);
      placed.push(cells);
    }
    if (placed.length > best.length) { best = placed; bestCells = grid.cells.slice(); }
    if (best.length >= count) break;
  }
  grid.cells.set(bestCells || base);
  return best;
};

// Floor cells that are not solid / void (for the 12 % limit).
K.floorCount = function (grid) { return grid.count(CELL.FLOOR) + grid.count(CELL.SOLID); };

// Shared low-poly drawing (browser only; called from obstacle drawers inside draw()).
// An inked box from height z0 to z1 px over the world rectangle (x, y, dw, dh).
K.box = function (g, v, x, y, dw, dh, z0, z1, top, left, right) {
  const R = BD.client.render, P = v.proj;
  const a0 = P(x, y + dh, z0), b0 = P(x + dw, y + dh, z0), c0 = P(x + dw, y, z0);
  const a1 = P(x, y + dh, z1), b1 = P(x + dw, y + dh, z1), c1 = P(x + dw, y, z1), d1 = P(x, y, z1);
  R.poly(g, [a0, b0, b1, a1]); g.fillStyle = left; g.fill(); R.ink(g, 1.5);
  R.poly(g, [b0, c0, c1, b1]); g.fillStyle = right; g.fill(); R.ink(g, 1.5);
  R.poly(g, [a1, b1, c1, d1]); g.fillStyle = top; g.fill(); R.ink(g, 2);
};
// A square pillar with a wider cap and base (open, pillars, rooftop).
K.drawPillar = function (g, v, cx, cy, hPx, col) {
  K.box(g, v, cx + 0.06, cy + 0.06, 0.88, 0.88, 0, 8, col[0], col[1], col[2]);
  K.box(g, v, cx + 0.16, cy + 0.16, 0.68, 0.68, 8, hPx - 8, col[0], col[1], col[2]);
  K.box(g, v, cx + 0.04, cy + 0.04, 0.92, 0.92, hPx - 8, hPx, col[0], col[1], col[2]);
  // a lit seam on the front face so the pillar reads against the floor colour
  const P = v.proj, m0 = P(cx + 0.5, cy + 0.84, 12), m1 = P(cx + 0.5, cy + 0.84, hPx - 12);
  g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.stroke();
};
