// ─────────────────────────────────────────────────────────────
// Pathfinding (Dijkstra on tiles) and line of sight (grid DDA)
// Edges: 4-neighbour walk · locked door (bash cost or key) ·
//        toilet pair teleport · samurai well pair teleport
// ─────────────────────────────────────────────────────────────

const VIA = { WALK: 0, TOILET: 1, WELL: 2, DOOR: 3 };
const Heap = {
  ids: new Int32Array(8192), pri: new Float32Array(8192), n: 0,
  clear() { this.n = 0; },
  push(id, p) {
    let i = this.n++;
    if (i >= this.ids.length) { const a = new Int32Array(i * 2), b = new Float32Array(i * 2); a.set(this.ids); b.set(this.pri); this.ids = a; this.pri = b; }
    while (i > 0) { const par = (i - 1) >> 1; if (this.pri[par] <= p) break; this.ids[i] = this.ids[par]; this.pri[i] = this.pri[par]; i = par; }
    this.ids[i] = id; this.pri[i] = p;
  },
  pop() {
    const top = this.ids[0]; const n = --this.n;
    if (n > 0) {
      const id = this.ids[n], p = this.pri[n];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1; if (c >= n) break;
        if (c + 1 < n && this.pri[c + 1] < this.pri[c]) c++;
        if (this.pri[c] >= p) break;
        this.ids[i] = this.ids[c]; this.pri[i] = this.pri[c]; i = c;
      }
      this.ids[i] = id; this.pri[i] = p;
    }
    return top;
  },
};

let _pf = null;
function pfBuffers() {
  const n = M.w * M.h;
  if (!_pf || _pf.n !== n) _pf = { n, cost: new Float32Array(n), prev: new Int32Array(n), via: new Uint8Array(n) };
  return _pf;
}

// opts: { bash: seconds|0, speed: tiles/s, key: bool, toilets: bool, wells: bool }
function expandNeighbors(i, opts, cb) {
  const w = M.w, x = i % w, y = (i / w) | 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (!inB(nx, ny)) continue;
    const t = M.t[ny * w + nx];
    if (t === T.WALL) continue;
    if (t === T.DOOR) {
      const d = M.doors[M.doorAt[ny * w + nx]];
      if (d.state === 'locked') {
        if (opts.key) cb(ny * w + nx, 1.5, VIA.DOOR);
        else if (opts.bash) cb(ny * w + nx, 1 + opts.bash * (opts.speed || 4), VIA.DOOR);
        continue;
      }
      cb(ny * w + nx, 1, VIA.WALK);
      continue;
    }
    if (M.furnAt[ny * w + nx] >= 0) continue;
    cb(ny * w + nx, 1, VIA.WALK);
  }
  if (opts.toilets && M.toilets.length === 2) {
    const [a, b] = M.toilets;
    if (i === a.ay * w + a.ax) cb(b.ay * w + b.ax, 3, VIA.TOILET);
    else if (i === b.ay * w + b.ax) cb(a.ay * w + a.ax, 3, VIA.TOILET);
  }
  if (opts.wells && M.wells.length === 2) {
    const [a, b] = M.wells;
    if (i === a.y * w + a.x) cb(b.y * w + b.x, 2, VIA.WELL);
    else if (i === b.y * w + b.x) cb(a.y * w + a.x, 2, VIA.WELL);
  }
}

function dijkstra(src, goal, opts) {
  const B = pfBuffers();
  B.cost.fill(Infinity); B.prev.fill(-1);
  B.cost[src] = 0;
  Heap.clear(); Heap.push(src, 0);
  while (Heap.n) {
    const i = Heap.pop();
    if (i === goal) break;
    const ci = B.cost[i];
    expandNeighbors(i, opts, (j, c, via) => {
      const nc = ci + c;
      if (nc < B.cost[j]) { B.cost[j] = nc; B.prev[j] = i; B.via[j] = via; Heap.push(j, nc); }
    });
  }
  return B;
}

// returns [{i, via}] from (excluding) src to goal, or null
function findPath(sx, sy, gx, gy, opts = {}) {
  if (!inB(sx, sy) || !inB(gx, gy)) return null;
  const src = sy * M.w + sx, goal = gy * M.w + gx;
  if (src === goal) return [];
  const B = dijkstra(src, goal, opts);
  if (B.cost[goal] === Infinity) return null;
  const out = [];
  let i = goal, guard = 0;
  while (i !== src && guard++ < 5000) { out.push({ i, via: B.via[i] }); i = B.prev[i]; }
  out.reverse();
  out.cost = B.cost[goal];
  return out;
}

// full cost field from a source (copied, safe to keep)
function costField(sx, sy, opts = {}) {
  const B = dijkstra(sy * M.w + sx, -1, opts);
  return Float32Array.from(B.cost);
}

// ── line of sight (tile-space floats) ──
function los(ax, ay, bx, by) {
  let tx = Math.floor(ax), ty = Math.floor(ay);
  const ex = Math.floor(bx), ey = Math.floor(by);
  const dx = bx - ax, dy = by - ay;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - ax : ax - tx) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - ay : ay - ty) * tdy : Infinity;
  let guard = 0;
  while (!(tx === ex && ty === ey) && guard++ < 200) {
    if (tmx < tmy) { tx += stepX; tmx += tdx; } else { ty += stepY; tmy += tdy; }
    if (tx === ex && ty === ey) return true;
    if (opaque(tx, ty)) return false;
  }
  return true;
}

// ray march returning hit distance; marks visited tiles in `mark` (stamp array) if given
function rayCast(ox, oy, ca, sa, maxR, mark, stamp) {
  let tx = Math.floor(ox), ty = Math.floor(oy);
  const stepX = ca > 0 ? 1 : -1, stepY = sa > 0 ? 1 : -1;
  const tdx = ca !== 0 ? Math.abs(1 / ca) : Infinity, tdy = sa !== 0 ? Math.abs(1 / sa) : Infinity;
  let tmx = ca !== 0 ? (ca > 0 ? tx + 1 - ox : ox - tx) * tdx : Infinity;
  let tmy = sa !== 0 ? (sa > 0 ? ty + 1 - oy : oy - ty) * tdy : Infinity;
  if (mark && inB(tx, ty)) mark[ty * M.w + tx] = stamp;
  let t = 0, guard = 0;
  while (guard++ < 120) {
    if (tmx < tmy) { t = tmx; tx += stepX; tmx += tdx; } else { t = tmy; ty += stepY; tmy += tdy; }
    if (t > maxR) return maxR;
    if (!inB(tx, ty)) return t;
    if (mark) mark[ty * M.w + tx] = stamp;
    if (opaque(tx, ty)) return t;
  }
  return maxR;
}
