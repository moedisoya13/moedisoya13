// Static layer of a floor larger than the screen (BD.view.fits false), painted lazily in CH × CH
// logical-px chunks of map space, so only what is near the screen exists and a 48×48 floor never
// needs a 4000-px canvas. What a chunk holds is the stage painter's (37_paint.js: facade, floor,
// marks, shadows, back walls, wall furniture, back growths) for the cells whose tile, facade or
// wall box touches it; every random choice is keyed by cell or by element, so a chunk paints the
// same whatever order the chunks are made in. Chunks are LRU-bounded; visible ones are made at
// once, one more per frame ahead of the camera, and `B.warm(ms)` paints the ring ahead within a
// time budget.
//
// Baked decals (R.bake, ink splats) go into one floor-wide canvas covering the floor's projected
// box at up to BAKE_BUDGET device px (so slightly softer than the screen on very large floors);
// R.bake's view is a map view whose origin is that canvas's corner, R.clipFloor works with it.

const C = BD.C;
const R = BD.client.render;
const B = R.big = { grid: null, chunks: new Map(), frameNo: 0, painted: 0, paintMs: 0 };
const CH = 512, MAX_CHUNKS = 36, BAKE_BUDGET = 4.2e6;

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

// the floor's cells in painter's order with the map-px box each one paints into (tile, the facade
// under an open edge down to `bottom`, the back wall above row/column 0); inner shafts included
R.stageCells = function (w, bottom) {
  const grid = w.grid, W = grid.w, H = grid.h, m = R.stage.of(w), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid.get(x, y);
    if (c === BD.CELL.VOID && m.voidKind[y * W + x] !== 2) continue;
    out.push([x, y]);
  }
  out.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  return out.map(([x, y]) => {
    const open = (n) => n === -1 || n === BD.CELL.VOID;
    const edge = open(grid.get(x, y + 1)) || open(grid.get(x + 1, y));
    const x0 = (x - y - 1) * C.ISO_X - 12, x1 = (x - y + 1) * C.ISO_X + 12;
    const y0 = (x + y) * C.ISO_Y - (x === 0 || y === 0 ? R.stage.WALL_H + 16 : 4), y1 = edge ? bottom : (x + y + 2) * C.ISO_Y + 4;
    return { c: [x, y], x0, x1, y0, y1 };
  });
};

B.prepare = function (w, v) {
  const s = Math.min(2, v.dpr * v.scale) || 1;
  if (B.grid === w.grid && B.s === s && B.key === R.stage.of(w).key) return;
  const sameFloor = B.grid === w.grid;
  B.grid = w.grid; B.s = s; B.chunks = new Map(); B.key = R.stage.of(w).key;
  R.floorKey = 'big'; R.cache = null; R.cacheGrid = null; // the v1 cache rebuilds if a v1 floor comes next
  const f = BD.view.frame(w.grid);
  B.frame = f; B.bottom = f.y1 + 40;
  R.sky.prepare(w, v);
  // cells bucketed by the chunks their boxes touch (painter order kept)
  B.buckets = new Map();
  for (const it of R.stageCells(w, B.bottom)) {
    for (let cy = Math.floor(it.y0 / CH); cy <= Math.floor(it.y1 / CH); cy++) for (let cx = Math.floor(it.x0 / CH); cx <= Math.floor(it.x1 / CH); cx++) {
      const k = cx + ',' + cy;
      if (!B.buckets.has(k)) B.buckets.set(k, []);
      B.buckets.get(k).push(it.c);
    }
  }
  // floor-wide decal canvas
  const W = w.grid.w, H = w.grid.h, bx0 = -H * C.ISO_X, bw = (W + H) * C.ISO_X, bh = (W + H) * C.ISO_Y;
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
  const touchesFrame = mx0 < f.x1 + 60 && mx0 + CH > f.x0 - 60 && my0 < B.bottom && my0 + CH > f.y0 - 140;
  if (!cells.length && !touchesFrame) return { cv: null };
  const t0 = performance.now();
  const s = B.s, cv = document.createElement('canvas');
  cv.width = Math.round(CH * s); cv.height = Math.round(CH * s);
  const g = cv.getContext('2d');
  g.scale(cv.width / CH, cv.height / CH);
  g.translate(-mx0, -my0);
  g.beginPath(); g.rect(mx0, my0, CH, CH); g.clip();
  R.paint.region(g, R.mapView(0, 0).proj, w, cells, { x0: mx0 - 4, y0: my0 - 4, x1: mx0 + CH + 4, y1: my0 + CH + 4 }, B.bottom);
  B.painted++; B.paintMs += performance.now() - t0;
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
  B.view = [cx0, cx1, cy0, cy1];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = chunk(w, cx, cy);
    if (c.cv) g.drawImage(c.cv, v.rox + cx * CH, v.roy + cy * CH, CH, CH);
  }
  // one chunk ahead per frame (the ring around the view), so walking rarely waits for a paint
  B.warm(w, 0);
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
// paint missing chunks of the ring around the view: at least one, more while under `ms` of work
B.warm = function (w, ms) {
  if (!B.view) return 0;
  const [cx0, cx1, cy0, cy1] = B.view, t0 = performance.now();
  let made = 0;
  for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
    if (B.chunks.has(cx + ',' + cy)) continue;
    if (made && performance.now() - t0 > (ms || 0)) return made;
    chunk(w, cx, cy); made++;
  }
  return made;
};
B.stats = () => ({ chunks: B.chunks.size, painted: [...B.chunks.values()].filter((c) => c.cv).length, bake: B.bake ? [B.bake.cv.width, B.bake.cv.height] : null, paintMsAvg: B.painted ? +(B.paintMs / B.painted).toFixed(1) : 0 });
