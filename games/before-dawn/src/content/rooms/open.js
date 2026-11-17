// Obstacle pattern `open` (GDD §7.2): 0–2 single pillars. Also the fallback pattern.
// A pattern's apply(grid, ctx) marks cells SOLID. Use BD.gen.tryBlock / canPlace so solids
// keep 2 cells from each other, walls and void (§7.2 장애물 제한).
BD.gen.patterns.register({
  id: 'open',
  firstFloor: true,
  apply(grid, ctx) {
    const n = ctx.rng.int(0, 2);
    for (let i = 0; i < n; i++) BD.gen.tryBlock(grid, ctx.rng, 1, 1, 40, 2);
  },
});

BD.render.obstacles.register({
  id: 'open',
  draw(g, v, cx, cy) { BD.roomKit.drawPillar(g, v, cx, cy, 64, ['#8c8f9c', '#666976', '#50525d']); },
});
