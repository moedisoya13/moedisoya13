// Room shape `notch` (GDD §7.2): an L-shaped room — one side corner loses a 4×4 block of cells,
// which become VOID (the night sky shows through). The side corners of the iso diamond are
// (W, 0) on the right and (0, H) on the left; the back corner (0, 0) keeps both back walls
// and the front corner (W, H) holds the hero's start (§7.3), so neither is cut. Not on 1F.
const SIZE = 4;
BD.gen.shapes.register({
  id: 'notch',
  firstFloor: false,
  apply(grid, ctx) {
    const right = ctx.rng.chance(0.5);
    const x0 = right ? ctx.W - SIZE : 0, y0 = right ? 0 : ctx.H - SIZE;
    BD.gen.fill(grid, BD.roomKit.rectCells(x0, y0, SIZE, SIZE), BD.CELL.VOID);
  },
});
