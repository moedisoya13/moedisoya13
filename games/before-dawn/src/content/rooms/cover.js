// Obstacle pattern `cover` (GDD §7.2): 5–7 office partitions of 1×2 cells, each in a random
// orientation, 2 free cells from each other, walls and void. Cover against archers and bolts.
const T = { min: 5, max: 7, wallGap: 2, solidGap: 2, height: 40 };
BD.gen.patterns.register({
  id: 'cover',
  firstFloor: false,
  T,
  apply(grid, ctx) {
    const want = ctx.rng.int(T.min, T.max);
    BD.roomKit.placeBlocks(grid, ctx.rng, want, (r) => {
      const alongX = r.chance(0.5), bw = alongX ? 2 : 1, bh = alongX ? 1 : 2;
      return BD.roomKit.rectCells(r.int(0, grid.w - bw), r.int(0, grid.h - bh), bw, bh);
    }, T.wallGap, T.solidGap, 40, 300);
  },
});

// felt-covered cubicle panel with a light frame
BD.render.obstacles.register({
  id: 'cover',
  draw(g, v, cx, cy, w) {
    const K = BD.roomKit, S = BD.CELL.SOLID;
    const alongX = w.grid.get(cx - 1, cy) === S || w.grid.get(cx + 1, cy) === S;
    const x = alongX ? cx + 0.02 : cx + 0.32, y = alongX ? cy + 0.32 : cy + 0.02;
    const dw = alongX ? 0.96 : 0.36, dh = alongX ? 0.36 : 0.96;
    K.box(g, v, x, y, dw, dh, 0, T.height, '#c9c3b5', '#4c5a72', '#3c475c');
  },
});
