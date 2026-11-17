// Obstacle pattern `aisle` (GDD §7.2): 2–3 rows of 1×4 office desks, all parallel (one random
// orientation per room), at least 3 free cells between rows (Chebyshev) and 2 from walls/void.
const T = { min: 2, max: 3, len: 4, wallGap: 2, solidGap: 3, height: 24 };
BD.gen.patterns.register({
  id: 'aisle',
  firstFloor: false,
  T,
  apply(grid, ctx) {
    const along = ctx.rng.chance(0.5); // true: desks run along x
    const bw = along ? T.len : 1, bh = along ? 1 : T.len;
    const want = ctx.rng.int(T.min, T.max);
    BD.roomKit.placeBlocks(grid, ctx.rng, want, (r) => BD.roomKit.rectCells(r.int(0, grid.w - bw), r.int(0, grid.h - bh), bw, bh), T.wallGap, T.solidGap, 40, 300);
  },
});

BD.render.obstacles.register({
  id: 'aisle',
  draw(g, v, cx, cy, w) {
    const K = BD.roomKit, S = BD.CELL.SOLID;
    const alongX = w.grid.get(cx - 1, cy) === S || w.grid.get(cx + 1, cy) === S;
    K.box(g, v, cx + 0.04, cy + 0.04, 0.92, 0.92, 0, T.height, '#7a6553', '#5d4b3d', '#4a3b30');
    // monitor on every other cell, facing the room's front
    if ((alongX ? cx : cy) % 2 === 0) {
      const mx = alongX ? cx + 0.3 : cx + 0.35, my = alongX ? cy + 0.35 : cy + 0.3;
      K.box(g, v, mx, my, alongX ? 0.4 : 0.12, alongX ? 0.12 : 0.4, T.height, T.height + 18, '#1b2733', '#0d1a24', '#101c28');
      const c = v.proj(mx + (alongX ? 0.2 : 0.06), my + (alongX ? 0.06 : 0.2), T.height + 10);
      g.fillStyle = 'rgba(79,183,216,0.55)'; g.fillRect(c[0] - 5, c[1] - 4, 10, 6);
    }
  },
});
