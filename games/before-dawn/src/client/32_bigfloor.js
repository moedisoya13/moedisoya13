// Static layer of a floor larger than the screen (BD.view.fits false). Same look as the v1
// screen cache (facade with windows, checker tiles with grime, ink outline, back walls with glass,
// desks, crystal clusters), but painted lazily in CH × CH logical-px chunks of map space, so only
// what is near the screen exists and a 48×48 floor never needs a 4000-px canvas. Randomness is
// per cell (render:<seed>:<floor>:<tag>:<x>:<y>), so a chunk paints the same whatever order the
// chunks are made in. Chunks are LRU-bounded; visible ones are made at once, one more per frame
// ahead of the camera.
//
// Baked decals (R.bake, ink splats) go into one floor-wide canvas covering the floor's projected
// box at up to BAKE_BUDGET device px (so slightly softer than the screen on very large floors);
// R.bake's view is a map view whose origin is that canvas's corner, R.clipFloor works with it.

const C = BD.C;
const M = BD.math;
const U = BD.ui;
const R = BD.client.render;
const B = R.big = { grid: null, chunks: new Map(), frameNo: 0 };
const CH = 512, MAX_CHUNKS = 36, BAKE_BUDGET = 4.2e6, SLAB = 14;

// a view-like object whose proj puts map px (rox, roy) at the origin: for painting off screen
R.mapView = function (rox, roy) {
  const mv = {
    rox, roy,
    proj: (wx, wy, z) => [rox + (wx - wy) * C.ISO_X, roy + (wx + wy) * C.ISO_Y - (z || 0)],
    worldDirToScreen: (dx, dy) => [(dx - dy) * C.ISO_X, (dx + dy) * C.ISO_Y],
    toWorld: (lx, ly) => BD.view.unmap(lx - rox, ly - roy),
  };
  mv.screenDirToWorld = (sx, sy) => BD.math.norm(sx / (2 * C.ISO_X) + sy / (2 * C.ISO_Y), -sx / (2 * C.ISO_X) + sy / (2 * C.ISO_Y));
  return mv;
};

const cellRng = (w, tag, x, y) => BD.Rng(BD.hash32('render:' + w.seed + ':' + w.floorN + ':' + tag + ':' + x + ':' + y));

B.prepare = function (w, v) {
  const s = Math.min(2, v.dpr * v.scale) || 1;
  if (B.grid === w.grid && B.s === s) return;
  const sameFloor = B.grid === w.grid;
  B.grid = w.grid; B.s = s; B.chunks = new Map();
  R.floorKey = 'big'; R.cache = null; R.cacheGrid = null; // the v1 cache rebuilds if a v1 floor comes next
  const grid = w.grid, W = grid.w, H = grid.h, f = BD.view.frame(grid);
  B.frame = f; B.bottom = f.y1 + 40;
  // far skyline: the screen-fixed backdrop (as v1)
  const sky = R.skylineData(BD.Rng(BD.hash32('render:' + w.seed + ':' + w.floorN + ':sky')));
  R.skyNight = R.paintSkyline(v, sky, false);
  R.skyDawn = R.paintSkyline(v, sky, true);
  // cells bucketed by the chunks their tile, facade and wall boxes touch (painter order kept)
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid.get(x, y) !== BD.CELL.VOID) cells.push([x, y]);
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  B.buckets = new Map();
  for (const c of cells) {
    const [x, y] = c;
    const edge = [grid.get(x, y + 1), grid.get(x + 1, y)].some((n) => n === -1 || n === BD.CELL.VOID);
    const x0 = (x - y - 1) * C.ISO_X, x1 = (x - y + 1) * C.ISO_X;
    const y0 = (x + y) * C.ISO_Y - (x === 0 || y === 0 ? C.WALL_H + 4 : 0), y1 = edge ? B.bottom : (x + y + 2) * C.ISO_Y + 4;
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
      const k = cx + ',' + cy;
      if (!B.buckets.has(k)) B.buckets.set(k, []);
      B.buckets.get(k).push(c);
    }
  }
  // wall props (desks) at the v1 density along the back walls, and the three crystal clusters
  const rng = BD.Rng(BD.hash32('render:' + w.seed + ':' + w.floorN + ':props'));
  B.props = [];
  const nProps = Math.max(4, Math.round((4 * (W + H)) / 26));
  for (let i = 0; i < nProps; i++) {
    const alongX = rng.next() < 0.5, t = rng.range(1, (alongX ? W : H) - 2), stairs = w.stairs;
    if (stairs && ((alongX && stairs.side === 'y0' && Math.abs(stairs.x - t) < 2) || (!alongX && stairs.side === 'x0' && Math.abs(stairs.y - t) < 2))) continue;
    if (grid.get(alongX ? Math.floor(t) : 0, alongX ? 0 : Math.floor(t)) === BD.CELL.VOID) continue;
    B.props.push({ alongX, t });
  }
  B.crystals = [[W, 0, 4, 4, 6], [0, H, 4, -4, 6], [0, 0, 3, 0, -C.WALL_H + 6]];
  // floor-wide decal canvas
  const bx0 = -H * C.ISO_X, bw = (W + H) * C.ISO_X, bh = (W + H) * C.ISO_Y;
  const sb = Math.min(s, Math.sqrt(BAKE_BUDGET / (bw * bh)));
  if (!sameFloor || !B.bake) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(bw * sb); cv.height = Math.ceil(bh * sb);
    cv.getContext('2d').scale(sb, sb);
    B.bake = { cv, sb, ox: bx0, w: bw, h: bh };
    R.bakeCanvas = cv;
    R.bakeView = R.mapView(-bx0, 0);
  }
};

function paintChunk(w, cx, cy) {
  const key = cx + ',' + cy, cells = B.buckets.get(key) || [];
  const mx0 = cx * CH, my0 = cy * CH, f = B.frame;
  const touchesExtras = mx0 < f.x1 && mx0 + CH > f.x0 && my0 < B.bottom && my0 + CH > f.y0 - 80 && (B.props.length || B.crystals.length);
  if (!cells.length && !touchesExtras) return { cv: null };
  const s = B.s, cv = document.createElement('canvas');
  cv.width = Math.round(CH * s); cv.height = Math.round(CH * s);
  const g = cv.getContext('2d');
  g.scale(cv.width / CH, cv.height / CH);
  g.translate(-mx0, -my0);
  g.beginPath(); g.rect(mx0, my0, CH, CH); g.clip();
  const v = R.mapView(0, 0), P = v.proj, grid = w.grid, col = R.floorColor(w), poly = R.poly, ink = R.ink;
  // facade (tower body + slab) under the front edges
  for (const [x, y] of cells) {
    const front = grid.get(x, y + 1), right = grid.get(x + 1, y);
    if (front === -1 || front === BD.CELL.VOID) {
      const rng = cellRng(w, 'ff', x, y), a = P(x, y + 1), b = P(x + 1, y + 1);
      poly(g, [a, b, [b[0], B.bottom], [a[0], B.bottom]]); g.fillStyle = '#1a1b24'; g.fill();
      poly(g, [a, b, [b[0], b[1] + SLAB], [a[0], a[1] + SLAB]]); g.fillStyle = R.shade(col, 0.55); g.fill(); ink(g, 1.5);
      R.windows(g, rng, a, b, SLAB, B.bottom, ['rgba(242,184,74,0.8)', 'rgba(242,184,74,0.8)', 'rgba(79,183,216,0.6)'], 'rgba(36,40,58,0.95)', 0.16);
    }
    if (right === -1 || right === BD.CELL.VOID) {
      const rng = cellRng(w, 'fr', x, y), a = P(x + 1, y), b = P(x + 1, y + 1);
      poly(g, [a, b, [b[0], B.bottom], [a[0], B.bottom]]); g.fillStyle = '#121319'; g.fill();
      poly(g, [a, b, [b[0], b[1] + SLAB], [a[0], a[1] + SLAB]]); g.fillStyle = R.shade(col, 0.42); g.fill(); ink(g, 1.5);
      R.windows(g, rng, a, b, SLAB, B.bottom, ['rgba(201,79,160,0.65)', 'rgba(242,184,74,0.7)'], 'rgba(26,29,44,0.95)', 0.12);
    }
  }
  // floor tiles with grime
  for (const [x, y] of cells) {
    poly(g, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]);
    g.fillStyle = (x + y) % 2 ? col : R.shade(col, 0.94);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 1; g.stroke();
    const rng = cellRng(w, 'g', x, y);
    if (rng.next() < 0.12) {
      const c = P(x + rng.next(), y + rng.next());
      g.fillStyle = 'rgba(10,10,12,0.25)'; g.beginPath(); g.ellipse(c[0], c[1], rng.range(2, 5), rng.range(1, 2.5), 0, 0, M.TAU); g.fill();
    }
  }
  // floor outline
  for (const [x, y] of cells) {
    const edges = [[0, -1, [x, y], [x + 1, y]], [-1, 0, [x, y], [x, y + 1]], [0, 1, [x, y + 1], [x + 1, y + 1]], [1, 0, [x + 1, y], [x + 1, y + 1]]];
    for (const [ox, oy, a, b] of edges) {
      const n = grid.get(x + ox, y + oy);
      if (n === -1 || n === BD.CELL.VOID) { g.beginPath(); g.moveTo(...P(a[0], a[1])); g.lineTo(...P(b[0], b[1])); g.lineWidth = 2.5; g.strokeStyle = U.INK; g.stroke(); }
    }
  }
  // back walls
  for (const [x, y] of cells) {
    if (y === 0) R.wallSeg(g, P(x, 0), P(x + 1, 0), '#2b2c36');
    if (x === 0) R.wallSeg(g, P(0, y), P(0, y + 1), '#363744');
  }
  // desks with monitors
  for (const p of B.props) {
    const bx = p.alongX ? p.t : 0.05, by = p.alongX ? 0.05 : p.t, dw = p.alongX ? 1.0 : 0.35, dh = p.alongX ? 0.35 : 1.0;
    R.prism(g, v, bx, by, dw, dh, 12, '#4a3f36', '#5d5045', '#3a312a');
    const m = P(bx + dw / 2, by + dh / 2, 12);
    g.fillStyle = '#0d1a24'; g.fillRect(m[0] - 7, m[1] - 14, 14, 10); g.strokeStyle = U.INK; g.lineWidth = 1.5; g.strokeRect(m[0] - 7, m[1] - 14, 14, 10);
    g.fillStyle = 'rgba(79,183,216,0.6)'; g.fillRect(m[0] - 5, m[1] - 12, 10, 6);
  }
  // crystal clusters at the side and back corners (same rng per cluster in every chunk)
  B.crystals.forEach(([x, y, n, ox, oy], i) => { const c = P(x, y); R.crystal(g, cellRng(w, 'cr', i, 0), c[0] + ox, c[1] + oy, n); });
  return { cv };
}

function chunk(w, cx, cy) {
  const k = cx + ',' + cy;
  let c = B.chunks.get(k);
  if (!c) { c = paintChunk(w, cx, cy); B.chunks.set(k, c); }
  c.used = B.frameNo;
  return c;
}

B.drawStatic = function (g, v, w) {
  B.frameNo++;
  const pad = 24; // screen shake
  const mx0 = -v.rox - pad, my0 = -v.roy - pad, mx1 = -v.rox + C.VIEW_W + pad, my1 = -v.roy + C.VIEW_H + pad;
  const cx0 = Math.floor(mx0 / CH), cx1 = Math.floor(mx1 / CH), cy0 = Math.floor(my0 / CH), cy1 = Math.floor(my1 / CH);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = chunk(w, cx, cy);
    if (c.cv) g.drawImage(c.cv, v.rox + cx * CH, v.roy + cy * CH, CH, CH);
  }
  // one chunk ahead per frame (the ring around the view), so walking rarely waits for a paint
  let made = false;
  for (let cy = cy0 - 1; cy <= cy1 + 1 && !made; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1 && !made; cx++) {
    if (!B.chunks.has(cx + ',' + cy)) { chunk(w, cx, cy); made = true; }
  }
  if (B.chunks.size > MAX_CHUNKS) {
    const old = [...B.chunks.entries()].filter(([, c]) => c.used < B.frameNo).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && B.chunks.size > MAX_CHUNKS; i++) B.chunks.delete(old[i][0]);
  }
  // baked decals: the visible part of the floor-wide canvas
  const bk = B.bake;
  if (bk) {
    const lx0 = Math.max(0, -v.rox - bk.ox - pad), ly0 = Math.max(0, -v.roy - pad);
    const lx1 = Math.min(bk.w, -v.rox - bk.ox + C.VIEW_W + pad), ly1 = Math.min(bk.h, -v.roy + C.VIEW_H + pad);
    if (lx1 > lx0 && ly1 > ly0) g.drawImage(bk.cv, lx0 * bk.sb, ly0 * bk.sb, (lx1 - lx0) * bk.sb, (ly1 - ly0) * bk.sb, lx0 + bk.ox + v.rox, ly0 + v.roy, lx1 - lx0, ly1 - ly0);
  }
};
B.stats = () => ({ chunks: B.chunks.size, painted: [...B.chunks.values()].filter((c) => c.cv).length, bake: B.bake ? [B.bake.cv.width, B.bake.cv.height] : null });
