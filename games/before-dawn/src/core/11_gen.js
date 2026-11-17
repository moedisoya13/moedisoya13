// Floor generation (GDD §7). Builds all six floors at run start from (seed, tier).
// Content supplies room shapes, obstacle patterns and spawn bundles through registries;
// this file owns ordering, placement (§7.3), wave splits, elites, guardians and §7.6 checks.

const G = BD.gen;
const C = BD.C;
const M = BD.math;

// Types that have a dominant bundle on floor n.
G.domTypesFor = function (n) {
  return BD.gen.bundles.ids().filter((t) => BD.gen.bundles.get(t).dom[n]);
};

// §7.5 dominant order. Enumerates every sequence over types with a bundle for that floor:
// ① 1F is beast or undead ② each available type appears ③ neighbours differ.
// If no sequence satisfies all (content missing), relaxes ③ then ② and marks the result
// reduced — reported by gen() and by tools/accept.js, never hidden.
G.domOrder = function (rng) {
  const per = [];
  for (let n = 1; n <= 5; n++) per[n] = G.domTypesFor(n);
  const allTypes = [...new Set(per.slice(1).flat())].sort();
  const seqs = [];
  (function rec(n, acc) {
    if (n > 5) { seqs.push(acc.slice()); return; }
    for (const t of per[n]) { if (n === 1 && t !== 'beast' && t !== 'undead') continue; acc.push(t); rec(n + 1, acc); acc.pop(); }
  })(1, []);
  if (!seqs.length) BD.fail('gen: no dominant type available for some floor (register spawn bundles)');
  const full = seqs.filter((s) => allTypes.every((t) => s.includes(t)) && s.every((t, i) => i === 0 || s[i - 1] !== t));
  if (full.length) return { order: rng.pick(full), reduced: false };
  const relaxed = seqs.filter((s) => s.every((t, i) => i === 0 || s[i - 1] !== t));
  if (relaxed.length) return { order: rng.pick(relaxed), reduced: 'not every type covered' };
  return { order: rng.pick(seqs), reduced: 'neighbouring floors share a type (only ' + allTypes.join(',') + ' registered)' };
};

function cellsWhere(grid, pred) {
  const out = [];
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.walkable(x, y) && pred(x + 0.5, y + 0.5, x, y)) out.push([x + 0.5, y + 0.5]);
  return out;
}
const far = (p, q, d) => M.dist(p[0], p[1], q[0], q[1]) >= d;

function nearEdge(grid, cx, cy, k) {
  for (let oy = -k; oy <= k; oy++) for (let ox = -k; ox <= k; ox++) { const c = grid.get(cx + ox, cy + oy); if (c === -1 || c === BD.CELL.VOID) return true; }
  return false;
}

// §7.3 placement. Returns layout or a string reason on failure.
G.place = function (grid, rng, wave1Count) {
  const W = grid.w, H = grid.h;
  const start = [W - 2 + 0.5, H - 2 + 0.5];
  if (!grid.walkable(W - 2, H - 2)) return 'start cell not floor';
  const doors = [];
  for (let x = 2; x <= W - 3; x++) if (grid.walkable(x, 0) && grid.walkable(x, 1)) doors.push({ side: 'y0', x: x + 0.5, y: 0, ringX: x + 0.5, ringY: C.INTERACT.stairsRingOffset });
  for (let y = 2; y <= H - 3; y++) if (grid.walkable(0, y) && grid.walkable(1, y)) doors.push({ side: 'x0', x: 0, y: y + 0.5, ringX: C.INTERACT.stairsRingOffset, ringY: y + 0.5 });
  if (!doors.length) return 'no stairs position';
  const stairs = rng.pick(doors);
  const ring = [stairs.ringX, stairs.ringY];
  const centre = [W / 2, H / 2];
  const altarC = cellsWhere(grid, (x, y) => far([x, y], ring, 4) && far([x, y], start, 4));
  if (!altarC.length) return 'no altar cell';
  altarC.sort((a, b) => M.dist(a[0], a[1], centre[0], centre[1]) - M.dist(b[0], b[1], centre[0], centre[1]));
  const altar = altarC[0];
  const trialC = cellsWhere(grid, (x, y) => far([x, y], altar, 4) && far([x, y], ring, 4) && far([x, y], start, 4));
  if (!trialC.length) return 'no trial rift cell';
  const trialRift = rng.pick(trialC);
  const riftC = rng.shuffle(cellsWhere(grid, (x, y, cx, cy) => nearEdge(grid, cx, cy, 2) && far([x, y], start, 5)));
  const rifts = [];
  for (const c of riftC) { if (rifts.every((r) => far(r, c, 5))) rifts.push(c); if (rifts.length === 3) break; }
  if (rifts.length < 3) return 'fewer than 3 rifts';
  const flaskC = cellsWhere(grid, (x, y) => far([x, y], start, 5) && far([x, y], ring, 3));
  if (!flaskC.length) return 'no flask cell';
  const flask = rng.pick(flaskC);
  const w1C = rng.shuffle(cellsWhere(grid, (x, y) => far([x, y], start, 6)));
  const wave1 = [];
  for (const c of w1C) { if (wave1.length >= wave1Count) break; if (wave1.every((p) => far(p, c, 1.2))) wave1.push(c); }
  if (wave1.length < wave1Count) return 'not enough wave-1 cells';
  return { start, stairs, altar, trialRift, rifts, flasks: [flask], wave1 };
};

// §7.6 checks 1–3. Returns null if ok, else a reason.
G.check = function (grid, layout) {
  let first = -1, floorN = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === BD.CELL.FLOOR) { floorN++; if (first < 0) first = i; }
  if (first < 0) return 'no floor';
  const field = BD.nav.bfs(grid, first % grid.w, (first / grid.w) | 0);
  let reach = 0;
  for (let i = 0; i < field.length; i++) if (field[i] >= 0) reach++;
  if (reach !== floorN) return '§7.6-1 floor not connected';
  const pts = [layout.start, [layout.stairs.ringX, layout.stairs.ringY], layout.altar, layout.trialRift, ...layout.rifts, ...layout.flasks];
  for (const p of pts) if (!grid.walkable(Math.floor(p[0]), Math.floor(p[1]))) return '§7.6-2 key point not on floor';
  // §7.6-3: every floor cell belongs to some 2×2 all-floor block (no 1-wide passages).
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    if (!grid.walkable(x, y)) continue;
    let ok = false;
    for (let oy = -1; oy <= 0 && !ok; oy++) for (let ox = -1; ox <= 0 && !ok; ox++) {
      if (grid.walkable(x + ox, y + oy) && grid.walkable(x + ox + 1, y + oy) && grid.walkable(x + ox, y + oy + 1) && grid.walkable(x + ox + 1, y + oy + 1)) ok = true;
    }
    if (!ok) return '§7.6-3 one-cell passage at ' + x + ',' + y;
  }
  const solid = grid.count(BD.CELL.SOLID);
  if (solid > 0.12 * (floorN + solid)) return 'solid cells above 12%';
  return null;
};

function expand(row) {
  const out = [];
  if (!row) return out;
  for (const k of Object.keys(row).sort()) for (let i = 0; i < row[k]; i++) out.push(k);
  return out;
}

// Spawn list of floor n (§7.4): dominant bundle + non-dominant bundles of the other registered types.
G.spawnList = function (n, domType) {
  let list = expand(BD.gen.bundles.get(domType).dom[n]);
  for (const t of BD.gen.bundles.ids()) if (t !== domType) list = list.concat(expand(BD.gen.bundles.get(t).nondom[n]));
  return list;
};

G.guardianKinds = function (type) {
  return BD.enemies.all().filter((d) => d.type === type && d.guardian).map((d) => d.id);
};

function buildRoom(seed, n, attempt, forceFallback) {
  const rng = BD.sub(seed, 'gen', 'floor' + n + '/try' + attempt);
  const size = n === 1 ? [12, 12] : rng.pick(C.ROOM_SIZES);
  const W = size[0], H = size[1];
  const shapes = BD.gen.shapes.all().filter((s) => n > 1 || s.firstFloor);
  const patterns = BD.gen.patterns.all().filter((p) => n > 1 || p.firstFloor);
  const shape = forceFallback || !shapes.length ? BD.gen.shapes.get('rect') : rng.pick(shapes);
  const pattern = forceFallback || !patterns.length ? BD.gen.patterns.get('open') : rng.pick(patterns);
  const grid = BD.Grid(W, H);
  const ctx = { n, rng, W, H, grid };
  shape.apply(grid, ctx);
  pattern.apply(grid, ctx);
  return { grid, rng, shape: shape.id, pattern: pattern.id };
}

G.floor = function (seed, tier, n, domType, nextDomType) {
  const mods = BD.tierMods(tier);
  const srng = BD.sub(seed, 'gen', 'spawns' + n);
  const all = srng.shuffle(G.spawnList(n, domType));
  const n1 = Math.ceil(all.length * C.WAVES.shares[0]);
  const n2 = Math.ceil(all.length * C.WAVES.shares[1]);
  const spawns = { w1: all.slice(0, n1), w2: all.slice(n1, n1 + n2), w3: all.slice(n1 + n2), elites: [], guardian: null };
  const eliteN = C.ELITE.perFloor[n] + mods.elitePlus;
  let pool = spawns.w2.map((k, i) => i).filter((i) => BD.enemies.get(spawns.w2[i]).type === domType);
  if (pool.length < eliteN) pool = spawns.w2.map((k, i) => i);
  spawns.elites = srng.shuffle(pool).slice(0, eliteN).sort((a, b) => a - b);
  const gk = G.guardianKinds(domType);
  if (!gk.length) BD.fail(`gen: no enemy of type '${domType}' declares a guardian`);
  spawns.guardian = srng.pick(gk);
  const half = {};
  const domRow = BD.gen.bundles.get(domType).dom[n] || {};
  for (const k of Object.keys(domRow).sort()) half[k] = Math.ceil(domRow[k] / 2);
  const trial = { kinds: expand(half), elite: n >= 3 ? srng.pick(Object.keys(domRow).sort()) : null };

  let room, layout, reason, attempts = 0, fallback = false;
  for (let a = 0; a <= C.GEN_RETRIES; a++) {
    attempts = a + 1;
    room = buildRoom(seed, n, a, a === C.GEN_RETRIES);
    fallback = a === C.GEN_RETRIES;
    layout = G.place(room.grid, room.rng, spawns.w1.length);
    if (typeof layout === 'string') { reason = layout; continue; }
    reason = G.check(room.grid, layout);
    if (!reason) break;
  }
  if (reason) BD.fail(`gen: floor ${n} failed even with rect+open fallback: ${reason}`);
  return {
    n, domType, nextDomType, w: room.grid.w, h: room.grid.h, cells: room.grid.toString(),
    shape: room.shape, pattern: room.pattern, attempts, fallback, layout, spawns, trial,
  };
};

G.rooftop = function (seed) {
  const W = 13, H = 13;
  const grid = BD.Grid(W, H);
  for (const [x, y] of [[3, 3], [9, 3], [3, 9], [9, 9]]) grid.set(x, y, BD.CELL.SOLID);
  const boss = BD.enemies.all().filter((d) => d.type === 'boss')[0].id;
  const types = BD.gen.bundles.ids().filter((t) => BD.gen.bundles.get(t).nondom[3]);
  const summonType = types.length ? BD.sub(seed, 'gen', 'rooftop').pick(types) : null;
  return {
    n: 6, domType: 'rooftop', nextDomType: null, w: W, h: H, cells: grid.toString(), shape: 'rect', pattern: 'rooftop',
    attempts: 1, fallback: false,
    layout: { start: [11.5, 11.5], stairs: null, altar: null, trialRift: null, rifts: [[1.5, 6.5], [6.5, 1.5]], flasks: [[2.5, 10.5], [10.5, 2.5]], wave1: [], bossPos: [6.5, 6.5] },
    spawns: { w1: [], w2: [], w3: [], elites: [], guardian: null, boss },
    summonType,
    summon: summonType ? expand(BD.gen.bundles.get(summonType).nondom[3]) : [],
    trial: null,
  };
};

// Whole run: six floors (§7.1). Pure function of (seed, tier).
G.run = function (seed, tier) {
  const od = G.domOrder(BD.sub(seed, 'gen', 'domOrder'));
  const floors = [null];
  for (let n = 1; n <= 5; n++) floors.push(G.floor(seed, tier, n, od.order[n - 1], n < 5 ? od.order[n] : 'rooftop'));
  floors.push(G.rooftop(seed));
  return { seed, tier, domOrder: od.order, reduced: od.reduced, floors };
};

// ---- helpers for room shape / obstacle pattern content -----------------------------------

// True if every cell of `cells` ([[cx, cy], …]) is floor and no solid, void or wall cell lies
// within `gap` cells (Chebyshev) of the block — the §7.2 spacing rule (default 2).
G.canPlace = function (grid, cells, gap) {
  gap = gap === undefined ? 2 : gap;
  const own = new Set(cells.map(([x, y]) => y * 1000 + x));
  for (const [x, y] of cells) if (!grid.walkable(x, y)) return false;
  for (const [x, y] of cells) {
    for (let oy = -gap; oy <= gap; oy++) for (let ox = -gap; ox <= gap; ox++) {
      const nx = x + ox, ny = y + oy;
      if (own.has(ny * 1000 + nx)) continue;
      const c = grid.get(nx, ny);
      if (c !== BD.CELL.FLOOR) return false;
    }
  }
  return true;
};
G.fill = function (grid, cells, v) { for (const [x, y] of cells) grid.set(x, y, v); };
// Try up to `tries` random anchors for a block of size bw×bh; returns placed cells or null.
G.tryBlock = function (grid, rng, bw, bh, tries, gap) {
  for (let i = 0; i < (tries || 40); i++) {
    const x = rng.int(0, grid.w - bw), y = rng.int(0, grid.h - bh);
    const cells = [];
    for (let oy = 0; oy < bh; oy++) for (let ox = 0; ox < bw; ox++) cells.push([x + ox, y + oy]);
    if (G.canPlace(grid, cells, gap)) { G.fill(grid, cells, BD.CELL.SOLID); return cells; }
  }
  return null;
};
