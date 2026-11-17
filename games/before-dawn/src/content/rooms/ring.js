// Obstacle pattern `ring` (GDD §7.2): one 3×3 block of demon crystal in the middle of the room
// (players circle it). If a `bite` shape leaves too little room on the front side, the block
// steps one cell towards the back walls so the 2-cell gap to void (§7.2) still holds.
const T = { size: 3, wallGap: 2 };
BD.gen.patterns.register({
  id: 'ring',
  firstFloor: false,
  T,
  apply(grid, ctx) {
    const K = BD.roomKit;
    const x0 = Math.floor(ctx.W / 2) - 1, y0 = Math.floor(ctx.H / 2) - 1;
    for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) {
      const cells = K.rectCells(x0 + ox, y0 + oy, T.size, T.size);
      if (K.fits(grid, cells, T.wallGap, 2)) { BD.gen.fill(grid, cells, BD.CELL.SOLID); return; }
    }
  },
});

// purple crystal cluster: a dark plinth per cell and a spire whose height peaks at the block centre
BD.render.obstacles.register({
  id: 'ring',
  draw(g, v, cx, cy, w, t) {
    const K = BD.roomKit, S = BD.CELL.SOLID, R = BD.client.render;
    K.box(g, v, cx + 0.02, cy + 0.02, 0.96, 0.96, 0, 10, '#3b2a55', '#2a1d3e', '#21172f');
    let n = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (w.grid.get(cx + ox, cy + oy) === S) n++;
    const h = 30 + n * 7, b = v.proj(cx + 0.5, cy + 0.5, 8), wd = 13;
    const lean = ((cx * 7 + cy * 13) % 5) - 2;
    R.poly(g, [[b[0] - wd, b[1]], [b[0] + lean * 3, b[1] - h], [b[0] + wd, b[1]]]); g.fillStyle = '#5b2d91'; g.fill();
    R.poly(g, [[b[0], b[1] + 2], [b[0] + lean * 3, b[1] - h], [b[0] + wd, b[1]]]); g.fillStyle = '#8a4fd0'; g.fill();
    R.poly(g, [[b[0] - wd, b[1]], [b[0] + lean * 3, b[1] - h], [b[0] + wd, b[1]]]); R.ink(g, 2);
    const glow = 0.25 + 0.15 * Math.sin(t * 2 + cx + cy);
    g.fillStyle = 'rgba(200,160,255,' + glow + ')';
    R.poly(g, [[b[0] - 3, b[1] - h * 0.3], [b[0] + lean * 3, b[1] - h * 0.9], [b[0] + 2, b[1] - h * 0.3]]); g.fill();
  },
});
