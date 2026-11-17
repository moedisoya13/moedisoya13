// Room grid: 1u cells. 0 floor, 1 solid (obstacle), 2 void (no floor; projectiles pass over).
// Outside the grid is wall: blocks movement, projectiles and line of sight.
// Movement and hits are continuous; the grid is only for generation, collision and pathing.

const FLOOR = 0, SOLID = 1, VOID = 2;
BD.CELL = { FLOOR, SOLID, VOID };

BD.Grid = function (w, h) {
  const g = { w, h, cells: new Uint8Array(w * h) };
  g.inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < w && cy < h;
  g.get = (cx, cy) => (cx >= 0 && cy >= 0 && cx < w && cy < h ? g.cells[cy * w + cx] : -1); // -1 = wall
  g.set = (cx, cy, v) => { if (g.inside(cx, cy)) g.cells[cy * w + cx] = v; };
  g.walkable = (cx, cy) => g.get(cx, cy) === FLOOR;
  g.blocksShot = (cx, cy) => { const c = g.get(cx, cy); return c === SOLID || c === -1; };
  g.toString = () => { let s = ''; for (let i = 0; i < g.cells.length; i++) s += g.cells[i] === FLOOR ? '.' : g.cells[i] === SOLID ? '#' : ' '; return s; };
  g.count = (v) => { let n = 0; for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === v) n++; return n; };
  return g;
};

BD.Grid.fromString = function (w, h, s) {
  const g = BD.Grid(w, h);
  for (let i = 0; i < w * h; i++) g.cells[i] = s[i] === '.' ? FLOOR : s[i] === '#' ? SOLID : VOID;
  return g;
};

const N = BD.nav = {};

// Push a circle out of every non-walkable cell (and the outer wall). Returns [x, y, hit].
N.resolve = function (g, x, y, r) {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (g.walkable(cx, cy)) continue;
      const px = Math.max(cx, Math.min(x, cx + 1)), py = Math.max(cy, Math.min(y, cy + 1));
      let dx = x - px, dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        // centre inside the cell: push out along the shallowest axis
        const l = x - cx, rr = cx + 1 - x, t = y - cy, b = cy + 1 - y;
        const m = Math.min(l, rr, t, b);
        if (m === l) { dx = -1; dy = 0; d = -l; } else if (m === rr) { dx = 1; dy = 0; d = -rr; } else if (m === t) { dx = 0; dy = -1; d = -t; } else { dx = 0; dy = 1; d = -b; }
        x += dx * (r - d); y += dy * (r - d);
      } else {
        x += (dx / d) * (r - d); y += (dy / d) * (r - d);
      }
      moved = true; hit = true;
    }
    if (!moved) break;
  }
  return [x, y, hit];
};

// Move a circle by (dx, dy) with sliding. Substeps keep fast movers (dash 16u/s) from tunnelling.
N.move = function (g, x, y, dx, dy, r) {
  const L = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(L / (r * 0.5)));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    const res = N.resolve(g, x + dx / steps, y + dy / steps, r);
    x = res[0]; y = res[1]; hit = hit || res[2];
  }
  return [x, y, hit];
};

// Line of sight for shots: blocked by solid cells and the outer wall, not by void.
N.losClear = function (g, x0, y0, x1, y1) {
  return N.rayLen(g, x0, y0, Math.atan2(y1 - y0, x1 - x0), BD.math.dist(x0, y0, x1, y1)) >= BD.math.dist(x0, y0, x1, y1) - 1e-6;
};

// Distance along dir until the first shot-blocking cell (DDA), capped at maxLen.
N.rayLen = function (g, x, y, dir, maxLen) {
  const dx = Math.cos(dir), dy = Math.sin(dir);
  let cx = Math.floor(x), cy = Math.floor(y);
  if (g.blocksShot(cx, cy)) return 0;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-12)), tdy = Math.abs(1 / (dy || 1e-12));
  let tx = dx > 0 ? (cx + 1 - x) * tdx : (x - cx) * tdx;
  let ty = dy > 0 ? (cy + 1 - y) * tdy : (y - cy) * tdy;
  for (let i = 0; i < 256; i++) {
    let t;
    if (tx < ty) { t = tx; tx += tdx; cx += stepX; } else { t = ty; ty += tdy; cy += stepY; }
    if (t >= maxLen) return maxLen;
    if (g.blocksShot(cx, cy)) return t;
  }
  return maxLen;
};

// 4-neighbour BFS over floor cells from (cx, cy). Returns Int16Array, -1 = unreachable.
N.bfs = function (g, cx, cy) {
  const dist = new Int16Array(g.w * g.h).fill(-1);
  if (!g.walkable(cx, cy)) return dist;
  const q = new Int32Array(g.w * g.h);
  let qh = 0, qt = 0;
  dist[cy * g.w + cx] = 0; q[qt++] = cy * g.w + cx;
  while (qh < qt) {
    const i = q[qh++], x = i % g.w, y = (i / g.w) | 0, d = dist[i] + 1;
    if (x > 0 && dist[i - 1] < 0 && g.cells[i - 1] === FLOOR) { dist[i - 1] = d; q[qt++] = i - 1; }
    if (x < g.w - 1 && dist[i + 1] < 0 && g.cells[i + 1] === FLOOR) { dist[i + 1] = d; q[qt++] = i + 1; }
    if (y > 0 && dist[i - g.w] < 0 && g.cells[i - g.w] === FLOOR) { dist[i - g.w] = d; q[qt++] = i - g.w; }
    if (y < g.h - 1 && dist[i + g.w] < 0 && g.cells[i + g.w] === FLOOR) { dist[i + g.w] = d; q[qt++] = i + g.w; }
  }
  return dist;
};

// Next waypoint downhill on a BFS field from world position (x, y). Diagonals need both
// orthogonal neighbours open. Returns [wx, wy] (cell centre) or null when already at the goal.
N.downhill = function (g, field, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  const here = g.inside(cx, cy) ? field[cy * g.w + cx] : -1;
  let best = here < 0 ? 1e9 : here, bx = -1, by = -1;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = cx + ox, ny = cy + oy;
    if (!g.walkable(nx, ny)) continue;
    if (ox && oy && (!g.walkable(cx + ox, cy) || !g.walkable(cx, cy + oy))) continue;
    const d = field[ny * g.w + nx];
    if (d < 0) continue;
    const score = d + (ox && oy ? 0.4 : 0);
    if (score < best) { best = score; bx = nx; by = ny; }
  }
  if (bx < 0) return null;
  return [bx + 0.5, by + 0.5];
};
