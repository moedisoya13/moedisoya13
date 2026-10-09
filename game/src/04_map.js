// ─────────────────────────────────────────────────────────────
// Map — Pac-Man-style braided maze (no dead ends) with two-door
// pass-through rooms, furniture, and a pre-rendered tile layer.
// ─────────────────────────────────────────────────────────────

const T = { WALL: 0, FLOOR: 1, ROOM: 2, DOOR: 3, RUBBLE: 4 };
let M = null;

const ROOM_KINDS = {
  bathroom: { floor: 'tile', furn: [['toilet'], ['tub', 1], ['sink']] },
  bedroom: { floor: 'carpet', furn: [['bed', 1], ['wardrobe', 1], ['lamp']] },
  study: { floor: 'green', furn: [['bookshelf'], ['wardrobe', 1], ['desk']] },
  kitchen: { floor: 'kitchen', furn: [['pantry', 1], ['stove'], ['counter'], ['table']] },
  parlor: { floor: 'blue', furn: [['clock', 1], ['piano'], ['sofa'], ['plant']] },
};

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function genMap() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const m = tryGenMap(CFG.CELLS_W, CFG.CELLS_H);
    if (m) return m;
  }
  throw new Error('map generation failed');
}

function tryGenMap(CW, CH) {
  const cellRoom = new Int16Array(CW * CH).fill(-1);
  const rooms = [];
  const sizes = [[2, 2], [2, 2], [2, 2], [2, 2], [2, 3], [3, 2]];
  let tries = 0;
  while (rooms.length < CFG.ROOMS && tries++ < 600) {
    const [rw, rh] = pick(sizes);
    const x0 = randi(1, CW - rw - 1), y0 = randi(1, CH - rh - 1);
    let ok = true;
    for (let y = y0 - 1; y <= y0 + rh && ok; y++)
      for (let x = x0 - 1; x <= x0 + rw; x++)
        if (x >= 0 && y >= 0 && x < CW && y < CH && cellRoom[y * CW + x] !== -1) { ok = false; break; }
    if (!ok) continue;
    const id = rooms.length;
    rooms.push({ id, cx0: x0, cy0: y0, cw: rw, ch: rh, doors: [] });
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) cellRoom[y * CW + x] = id;
  }
  if (rooms.length < CFG.ROOMS - 1) return null;

  // corridor spanning tree (Kruskal) over non-room cells
  const N = CW * CH;
  const link = new Uint8Array(N); // bit k = connected toward DIRS[k]
  const parent = new Int32Array(N); for (let i = 0; i < N; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const free = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && cellRoom[y * CW + x] === -1;
  const addLink = (x, y, k) => { const [dx, dy] = DIRS[k]; link[y * CW + x] |= 1 << k; link[(y + dy) * CW + x + dx] |= 1 << ((k + 2) % 4); };
  const edges = [];
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (!free(x, y)) continue;
    if (free(x + 1, y)) edges.push([x, y, 0]);
    if (free(x, y + 1)) edges.push([x, y, 1]);
  }
  shuffle(edges);
  for (const [x, y, k] of edges) {
    const [dx, dy] = DIRS[k];
    const a = find(y * CW + x), b = find((y + dy) * CW + x + dx);
    if (a !== b) { parent[a] = b; addLink(x, y, k); }
  }
  let root = -1;
  for (let i = 0; i < N; i++) if (cellRoom[i] === -1) { const r = find(i); if (root === -1) root = r; else if (r !== root) return null; }

  // braid: remove every dead end
  const deg = (i) => { let d = 0, l = link[i]; while (l) { d += l & 1; l >>= 1; } return d; };
  const order = [];
  for (let i = 0; i < N; i++) if (cellRoom[i] === -1) order.push(i);
  shuffle(order);
  for (const i of order) {
    if (deg(i) !== 1) continue;
    const x = i % CW, y = (i / CW) | 0;
    const cands = [];
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[k];
      if (free(x + dx, y + dy) && !(link[i] & (1 << k))) cands.push(k);
    }
    if (!cands.length) return null;
    const pref = cands.filter((k) => deg((y + DIRS[k][1]) * CW + x + DIRS[k][0]) === 1);
    addLink(x, y, pick(pref.length ? pref : cands));
  }
  for (const i of order) {
    const x = i % CW, y = (i / CW) | 0;
    for (const k of [0, 1]) {
      const [dx, dy] = DIRS[k];
      if (free(x + dx, y + dy) && !(link[i] & (1 << k)) && rnd() < CFG.EXTRA_LOOPS) addLink(x, y, k);
    }
  }

  // tiles
  const W = CW * 2 + 1, H = CH * 2 + 1;
  const t = new Uint8Array(W * H);
  const roomOf = new Int16Array(W * H).fill(-1);
  const roomWall = new Uint8Array(W * H);
  const doorAt = new Int16Array(W * H).fill(-1);
  const furnAt = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = y * CW + x;
    if (cellRoom[i] !== -1) continue;
    t[(2 * y + 1) * W + 2 * x + 1] = T.FLOOR;
    if (link[i] & 1) t[(2 * y + 1) * W + 2 * x + 2] = T.FLOOR;
    if (link[i] & 2) t[(2 * y + 2) * W + 2 * x + 1] = T.FLOOR;
  }
  const doors = [];
  for (const r of rooms) {
    r.x0 = 2 * r.cx0 + 1; r.y0 = 2 * r.cy0 + 1;
    r.x1 = 2 * (r.cx0 + r.cw - 1) + 1; r.y1 = 2 * (r.cy0 + r.ch - 1) + 1;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { t[y * W + x] = T.ROOM; roomOf[y * W + x] = r.id; }
    for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) if (t[y * W + x] === T.WALL) roomWall[y * W + x] = 1;
    // two doors on opposite sides
    const pair = rnd() < 0.5 ? ['W', 'E'] : ['N', 'S'];
    for (const side of pair) {
      let cx, cy, ox, oy;
      if (side === 'W' || side === 'E') {
        cy = r.cy0 + randi(0, r.ch - 1); cx = side === 'W' ? r.cx0 : r.cx0 + r.cw - 1;
        ox = side === 'W' ? cx - 1 : cx + 1; oy = cy;
      } else {
        cx = r.cx0 + randi(0, r.cw - 1); cy = side === 'N' ? r.cy0 : r.cy0 + r.ch - 1;
        oy = side === 'N' ? cy - 1 : cy + 1; ox = cx;
      }
      const tx = cx + ox + 1, ty = cy + oy + 1;
      const d = { id: doors.length, x: tx, y: ty, horiz: side === 'W' || side === 'E', state: 'open', room: r.id, bash: 0, shake: 0, anim: 1 };
      d.inX = 2 * cx + 1; d.inY = 2 * cy + 1;   // interior tile next to the door
      d.outX = 2 * ox + 1; d.outY = 2 * oy + 1; // corridor tile next to the door
      doors.push(d); r.doors.push(d.id);
      t[ty * W + tx] = T.DOOR; doorAt[ty * W + tx] = d.id; roomWall[ty * W + tx] = 0;
    }
  }

  const m = { w: W, h: H, t, roomOf, roomWall, doorAt, furnAt, rooms, doors, furn: [], toilets: [], hideSpots: [], wells: [] };
  if (!furnishRooms(m)) return null;
  // initial locks (bathroom doors stay open so the toilet pair is usable)
  for (const d of doors) if (m.rooms[d.room].kind !== 'bathroom' && rnd() < CFG.LOCKED_DOOR_P) d.state = 'locked';
  return m;
}

function furnishRooms(m) {
  const kinds = ['bathroom', 'bathroom'];
  const rest = shuffle(['bedroom', 'bedroom', 'study', 'kitchen', 'parlor', 'bedroom', 'study', 'parlor']);
  // spread bathrooms apart: first and the farthest room from it
  const rs = m.rooms.slice();
  const a = rs[0];
  let far = rs[1], best = -1;
  for (const r of rs.slice(1)) { const d = Math.abs(r.x0 - a.x0) + Math.abs(r.y0 - a.y0); if (d > best) { best = d; far = r; } }
  a.kind = 'bathroom'; far.kind = 'bathroom';
  let k = 0;
  for (const r of rs) if (!r.kind) r.kind = rest[k++ % rest.length];
  kinds.length = 0;

  for (const r of m.rooms) {
    const spec = ROOM_KINDS[r.kind];
    const inside = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) inside.push([x, y]);
    const doorIn = r.doors.map((id) => [m.doors[id].inX, m.doors[id].inY]);
    const isDoorIn = (x, y) => doorIn.some(([a, b]) => a === x && b === y);
    const edge = (x, y) => x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
    const occ = new Set();
    const placed = [];
    const connected = () => {
      // BFS over free interior tiles from first door; must reach other door + an access tile for each placed item
      const key = (x, y) => y * m.w + x;
      const seen = new Set([key(...doorIn[0])]);
      const q = [doorIn[0]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < r.x0 || nx > r.x1 || ny < r.y0 || ny > r.y1) continue;
          const kk = key(nx, ny);
          if (seen.has(kk) || occ.has(kk)) continue;
          seen.add(kk); q.push([nx, ny]);
        }
      }
      if (!doorIn.every(([x, y]) => seen.has(key(x, y)))) return false;
      for (const f of placed) {
        const acc = DIRS.map(([dx, dy]) => [f.x + dx, f.y + dy]).find(([x, y]) => seen.has(key(x, y)));
        if (!acc) return false;
        f.ax = acc[0]; f.ay = acc[1];
      }
      return true;
    };
    for (const [kind, hide] of spec.furn) {
      if (placed.length >= Math.max(2, Math.floor(inside.length / 3))) break;
      const cands = shuffle(inside.filter(([x, y]) => edge(x, y) && !isDoorIn(x, y) && !occ.has(y * m.w + x)));
      for (const [x, y] of cands) {
        occ.add(y * m.w + x);
        const f = { id: m.furn.length + placed.length, kind, x, y, room: r.id, hide: !!hide, ax: x, ay: y, occupied: false, shake: 0 };
        placed.push(f);
        if (connected()) break;
        placed.pop(); occ.delete(y * m.w + x);
      }
    }
    connected();
    if (r.kind === 'bathroom' && !placed.some((f) => f.kind === 'toilet')) return false;
    for (const f of placed) {
      f.id = m.furn.length;
      m.furn.push(f);
      m.furnAt[f.y * m.w + f.x] = f.id;
      if (f.hide) m.hideSpots.push(f);
      if (f.kind === 'toilet') m.toilets.push(f);
    }
  }
  return m.toilets.length === 2;
}

// ── queries ──
const inB = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h;
const tAt = (x, y) => (inB(x, y) ? M.t[y * M.w + x] : T.WALL);
function doorAt(x, y) { if (!inB(x, y)) return null; const id = M.doorAt[y * M.w + x]; return id >= 0 ? M.doors[id] : null; }
function furnAt(x, y) { if (!inB(x, y)) return null; const id = M.furnAt[y * M.w + x]; return id >= 0 ? M.furn[id] : null; }
function isFloorish(t) { return t === T.FLOOR || t === T.ROOM || t === T.RUBBLE; }
// walkable for everyone; locked doors handled by the caller where relevant
function walkable(x, y) {
  const t = tAt(x, y);
  if (t === T.WALL) return false;
  if (t === T.DOOR) return doorAt(x, y).state !== 'locked';
  return M.furnAt[y * M.w + x] < 0;
}
function opaque(x, y) {
  const t = tAt(x, y);
  if (t === T.WALL) return true;
  if (t === T.DOOR) return doorAt(x, y).state === 'locked';
  return false;
}
// a floor tile items/spawns can sit on
function openTile(x, y) { const t = tAt(x, y); return isFloorish(t) && M.furnAt[y * M.w + x] < 0; }
function allOpenTiles() {
  const out = [];
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (openTile(x, y)) out.push([x, y]);
  return out;
}
function inLockedRoom(x, y) {
  const r = M.roomOf[y * M.w + x];
  if (r < 0) return false;
  return M.rooms[r].doors.every((id) => M.doors[id].state === 'locked');
}
// butcher: a wall tile separating two corridor tiles in a straight line
function breakableWall(x, y) {
  if (x <= 0 || y <= 0 || x >= M.w - 1 || y >= M.h - 1) return false;
  if (tAt(x, y) !== T.WALL || M.roomWall[y * M.w + x]) return false;
  const corr = (a, b) => { const t = tAt(a, b); return (t === T.FLOOR || t === T.RUBBLE) && M.roomOf[b * M.w + a] < 0; };
  return (corr(x - 1, y) && corr(x + 1, y)) || (corr(x, y - 1) && corr(x, y + 1));
}

// ─────────────────────────────────────────────────────────────
// Pre-rendered tile layer (ImageData for speed)
// ─────────────────────────────────────────────────────────────
const MapGfx = { cv: null, ctx: null, img: null, ol: null, olx: null };
const _rgb = {};
function hexRgb(h) { if (_rgb[h]) return _rgb[h]; const n = parseInt(h.slice(1), 16); return (_rgb[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]); }

function renderMap() {
  const TS = CFG.TS;
  MapGfx.cv = document.createElement('canvas');
  MapGfx.cv.width = M.w * TS; MapGfx.cv.height = M.h * TS;
  MapGfx.ctx = MapGfx.cv.getContext('2d');
  const img = MapGfx.ctx.createImageData(M.w * TS, M.h * TS);
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) paintTile(img.data, M.w * TS, x, y, 0, 0);
  MapGfx.ctx.putImageData(img, 0, 0);
  // outline layer: drawn over the fog so the maze shape is always readable
  MapGfx.ol = document.createElement('canvas');
  MapGfx.ol.width = M.w * TS; MapGfx.ol.height = M.h * TS;
  MapGfx.olx = MapGfx.ol.getContext('2d');
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) paintOutlineTile(MapGfx.olx, x, y);
}
// re-render a tile (and its neighbours whose shading depends on it)
function rerenderTiles(x, y) {
  const TS = CFG.TS;
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    if (!inB(xx, yy)) continue;
    const img = MapGfx.ctx.createImageData(TS, TS);
    paintTile(img.data, TS, xx, yy, xx * TS, yy * TS);
    MapGfx.ctx.putImageData(img, xx * TS, yy * TS);
    MapGfx.olx.clearRect(xx * TS, yy * TS, TS, TS);
    paintOutlineTile(MapGfx.olx, xx, yy);
  }
}

// Path outline: a 1px line on every floor edge that touches a wall (Pac-Man style),
// plus the corner pixel where a wall pillar meets two open sides diagonally.
const OUTLINE_C = '#b08a84';
function paintOutlineTile(g, x, y) {
  const open = (a, b) => inB(a, b) && tAt(a, b) !== T.WALL;
  if (!open(x, y)) return;
  const TS = CFG.TS, X = x * TS, Y = y * TS;
  g.fillStyle = OUTLINE_C;
  const n = open(x, y - 1), s = open(x, y + 1), w = open(x - 1, y), e = open(x + 1, y);
  if (!n) g.fillRect(X, Y, TS, 1);
  if (!s) g.fillRect(X, Y + TS - 1, TS, 1);
  if (!w) g.fillRect(X, Y, 1, TS);
  if (!e) g.fillRect(X + TS - 1, Y, 1, TS);
  if (n && e && !open(x + 1, y - 1)) g.fillRect(X + TS - 1, Y, 1, 1);
  if (n && w && !open(x - 1, y - 1)) g.fillRect(X, Y, 1, 1);
  if (s && e && !open(x + 1, y + 1)) g.fillRect(X + TS - 1, Y + TS - 1, 1, 1);
  if (s && w && !open(x - 1, y + 1)) g.fillRect(X, Y + TS - 1, 1, 1);
}

function paintTile(d, stride, tx, ty, offX, offY) {
  const TS = CFG.TS;
  const t = tAt(tx, ty);
  const set = (gx, gy, hex) => { const c = hexRgb(hex); const o = ((gy - offY) * stride + (gx - offX)) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };
  const rid = M.roomOf[ty * M.w + tx];
  const room = rid >= 0 ? M.rooms[rid] : null;
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
    const gx = tx * TS + i, gy = ty * TS + j;
    let c;
    if (t === T.WALL) {
      const below = tAt(tx, ty + 1) !== T.WALL;
      const rw = M.roomWall[ty * M.w + tx];
      const faceH = 5;
      if (below && j >= TS - faceH) {
        const fj = j - (TS - faceH);
        c = (gx % 3 === 0) ? C.wallFace2 : C.wallFace;
        if (rw && gx % 4 === 0) c = '#24131c';
        if (fj === faceH - 1) c = C.baseboard;
        if (fj === 0) c = '#0d070a';
        // occasional portrait frame on the wall face
        const h = hash2(tx, ty);
        if (h < 0.1 && fj >= 1 && fj <= 3 && i >= 4 && i <= 9) c = (i === 4 || i === 9 || fj === 1 || fj === 3) ? C.gold2 : (h < 0.05 ? '#3b2030' : '#203040');
      } else {
        c = rw ? C.roomWallTop : C.wallTop;
        if (hash2(gx, gy) < 0.08) c = C.wallTop2;
        if (j === 0 && tAt(tx, ty - 1) !== T.WALL) c = rw ? C.roomWallHi : C.wallHi;
        if (i === 0 && tAt(tx - 1, ty) !== T.WALL) c = rw ? C.roomWallHi : C.wallHi;
        if (i === TS - 1 && tAt(tx + 1, ty) !== T.WALL) c = '#1a1015';
      }
    } else {
      if (room && t === T.ROOM) c = roomFloorPx(room, gx, gy, tx, ty, i, j);
      else c = woodPx(gx, gy);
      if (t === T.RUBBLE) {
        const h = hash2(gx * 3, gy * 7);
        if (h < 0.18) c = h < 0.07 ? C.rubble : C.rubble2;
        if ((gx + gy * 2) % 9 === 0 && h < 0.5) c = '#1f1714';
      }
      // contact shadows under walls (top) and beside walls (left)
      if (j < 3 && tAt(tx, ty - 1) === T.WALL) c = shadeFast(c, j === 0 ? 0.45 : j === 1 ? 0.6 : 0.8);
      if (i < 2 && tAt(tx - 1, ty) === T.WALL) c = shadeFast(c, i === 0 ? 0.6 : 0.82);
      // sparse old blood stains in corridors
      if (!room && t !== T.DOOR) {
        const h = hash2(tx * 13 + 7, ty * 17 + 3);
        if (h < 0.05) { const cx = 7 + (h * 40) % 4, cy = 7 + (h * 90) % 4; const rr = (i - cx) ** 2 + (j - cy) ** 2; if (rr < 6 + (hash2(gx, gy) * 6)) c = rr < 3 ? '#4a0d14' : '#3a0f12'; }
      }
    }
    set(gx, gy, c);
  }
}
const _shadeCache = {};
function shadeFast(hex, k) { const key = hex + k; return _shadeCache[key] || (_shadeCache[key] = shade(hex, k)); }

function woodPx(gx, gy) {
  const row = Math.floor(gy / 7);
  if (gy % 7 === 0) return C.woodSeam;
  const seg = Math.floor((gx + row * 17) / 29);
  if ((gx + row * 17) % 29 === 0) return C.woodSeam;
  const h = hash2(seg, row);
  let c = h < 0.5 ? C.wood : C.wood2;
  const n = hash2(gx, gy);
  if (n < 0.04) c = C.woodHi; else if (n > 0.97) c = C.woodSeam;
  if (gy % 7 === 1 && n < 0.5) c = shadeFast(c, 1.08);
  return c;
}

function roomFloorPx(room, gx, gy, tx, ty, i, j) {
  const TS = CFG.TS;
  const kind = ROOM_KINDS[room.kind].floor;
  const lx = gx - room.x0 * TS, ly = gy - room.y0 * TS;
  const rw = (room.x1 - room.x0 + 1) * TS, rh = (room.y1 - room.y0 + 1) * TS;
  const border = lx === 2 || ly === 2 || lx === rw - 3 || ly === rh - 3;
  const n = hash2(gx, gy);
  switch (kind) {
    case 'carpet': {
      if (border) return C.carpetGold;
      if (lx < 2 || ly < 2 || lx > rw - 3 || ly > rh - 3) return shadeFast(C.carpetRed, 0.75);
      const dmd = (gx + gy) % 6 === 0 || (gx - gy + 600) % 6 === 0;
      return dmd ? C.carpetRed2 : n < 0.05 ? shadeFast(C.carpetRed, 0.85) : C.carpetRed;
    }
    case 'tile': {
      if (gx % 7 === 0 || gy % 7 === 0) return C.grout;
      const ch = (Math.floor(gx / 7) + Math.floor(gy / 7)) % 2;
      let c = ch ? C.tileA : C.tileB;
      if (n < 0.06) c = shadeFast(c, 0.82);
      return c;
    }
    case 'green': {
      if (border) return shadeFast(C.carpetGold, 0.7);
      return n < 0.12 ? C.green2 : C.green;
    }
    case 'kitchen': {
      const ch = (Math.floor(gx / 7) + Math.floor(gy / 7)) % 2;
      let c = ch ? C.kitchenA : C.kitchenB;
      if (n < 0.05) c = shadeFast(c, 0.8);
      return c;
    }
    case 'blue': {
      if (border) return C.carpetGold;
      const cross = (gx % 6 === 3 && gy % 6 >= 2 && gy % 6 <= 4) || (gy % 6 === 3 && gx % 6 >= 2 && gx % 6 <= 4);
      return cross ? C.blue2 : n < 0.05 ? shadeFast(C.blue, 0.8) : C.blue;
    }
  }
  return C.wood;
}
