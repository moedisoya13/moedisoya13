// Obstacle pattern `pillars` (GDD §7.2): 4–6 single 1×1 pillars, at least 3 free cells apart
// (Chebyshev), 2 from walls and void. Allowed on 1F. A 12×12 room fits at most 4 under these
// rules, so 1F pillar rooms have exactly 4; larger rooms draw 4–6.
const T = { min: 4, max: 6, wallGap: 2, solidGap: 3, height: 64 };
BD.gen.patterns.register({
  id: 'pillars',
  firstFloor: true,
  T,
  apply(grid, ctx) {
    const K = BD.roomKit;
    const want = ctx.rng.int(T.min, T.max);
    K.placeBlocks(grid, ctx.rng, want, (r) => [[r.int(0, grid.w - 1), r.int(0, grid.h - 1)]], T.wallGap, T.solidGap, 40, 300);
  },
});

// concrete office pillars (also used by `open`)
const PILLAR_COL = ['#8c8f9c', '#666976', '#50525d'];
BD.render.obstacles.register({
  id: 'pillars',
  draw(g, v, cx, cy) { BD.roomKit.drawPillar(g, v, cx, cy, T.height, PILLAR_COL); },
});
