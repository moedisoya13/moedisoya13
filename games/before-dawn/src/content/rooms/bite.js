// Room shape `bite` (GDD §7.2): the middle of each of the two front edges is bitten out,
// 4 cells wide and 2 cells deep (VOID). The front edges are the y = H and x = W sides of the
// grid (nearest the camera). Not on 1F.
const WIDE = 4, DEEP = 2;
BD.gen.shapes.register({
  id: 'bite',
  firstFloor: false,
  apply(grid, ctx) {
    const K = BD.roomKit, V = BD.CELL.VOID;
    const mx = Math.floor(ctx.W / 2) - WIDE / 2, my = Math.floor(ctx.H / 2) - WIDE / 2;
    BD.gen.fill(grid, K.rectCells(mx, ctx.H - DEEP, WIDE, DEEP), V); // front-left edge (y = H)
    BD.gen.fill(grid, K.rectCells(ctx.W - DEEP, my, DEEP, WIDE), V); // front-right edge (x = W)
  },
});
