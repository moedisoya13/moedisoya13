// Room shape `rect` (GDD §7.2): the full W×H rectangle. Also the fallback shape.
// A shape's apply(grid, ctx) marks cells VOID; ctx = {n (floor), rng, W, H, grid}.
BD.gen.shapes.register({
  id: 'rect',
  firstFloor: true, // allowed on 1F
  apply(grid, ctx) { /* every cell stays floor */ },
});
