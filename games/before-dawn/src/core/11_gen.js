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

// A floor size from a plan or gen opts: integer sides within C.GEN_SIZE (throws otherwise).
G.checkSize = function (size, who) {
  const L = C.GEN_SIZE;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((v) => Number.isInteger(v) && v >= L.min && v <= L.max)) {
    BD.fail(`gen: ${who || 'floor'} size must be [W, H], integers ${L.min}..${L.max}, got ${JSON.stringify(size)}`);
  }
  return size;
};

function buildRoom(seed, n, attempt, forceFallback, forced) {
  const rng = BD.sub(seed, 'gen', 'floor' + n + '/try' + attempt);
  const size = forced || (n === 1 ? [12, 12] : rng.pick(C.ROOM_SIZES));
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

// opts (optional): {size: [W, H]} — a floor of that size (big floors, v2); offscreen: copied to
// the floor for the client's off-screen indicators / minimap switches.
G.floor = function (seed, tier, n, domType, nextDomType, opts) {
  opts = opts || {};
  const forced = opts.size ? G.checkSize(opts.size) : null;
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
    room = buildRoom(seed, n, a, a === C.GEN_RETRIES, forced);
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
    ...(opts.offscreen ? { offscreen: opts.offscreen } : {}),
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
// v2 (GDD-V2 §5): when horde mixes and tasks are registered every run is the v2 run — five 48 × 48
// floors from G.floorV2 and the 28 × 28 rooftop. opts.v1 (or no v2 content) builds the v1 rooms
// (GDD §7, still used by BD.stageFloor and the v1 generator tests).
// opts (optional): {sizes: {n: [W, H]}} overrides the floor plan per floor (v1 rooms only);
// {task: id} sets 1F's task (URL &task=).
G.isV2 = () => BD.director.mixes.ids().length > 0 && BD.tasks.ids().length > 0;
G.run = function (seed, tier, opts) {
  opts = opts || {};
  if (!opts.v1 && G.isV2()) return G.runV2(seed, tier, opts);
  const od = G.domOrder(BD.sub(seed, 'gen', 'domOrder'));
  const plan = BD.gen.plans.all()[0] || null;
  const floors = [null];
  for (let n = 1; n <= 5; n++) {
    const dom = od.order[n - 1], next = n < 5 ? od.order[n] : 'rooftop';
    let size = opts.sizes && opts.sizes[n];
    if (!size && plan) size = plan.size(n, { seed, tier, domType: dom, rng: BD.sub(seed, 'gen', 'plan' + n) }) || null;
    const fo = size ? { size: G.checkSize(size, plan ? `plan '${plan.id}' floor ${n}` : 'floor ' + n) } : {};
    if (size && plan && plan.offscreen) fo.offscreen = plan.offscreen(n);
    floors.push(G.floor(seed, tier, n, dom, next, fo));
  }
  floors.push(G.rooftop(seed));
  return { seed, tier, domOrder: od.order, reduced: od.reduced, floors };
};

// ---- v2 floors (GDD-V2 §5) ------------------------------------------------------------------------
// §3.3: 1F is beast; on 2F–5F every other type with a horde mix appears at least once; neighbours
// differ. Uniform over the sequences that satisfy it.
G.domOrderV2 = function (rng) {
  const types = BD.director.mixes.ids().filter((t) => C.TYPES.includes(t));
  const first = types.includes('beast') ? 'beast' : types[0];
  const others = types.filter((t) => t !== first);
  const seqs = [];
  (function rec(n, acc) {
    if (n > 5) { if (others.every((t) => acc.includes(t))) seqs.push(acc.slice()); return; }
    for (const t of types) { if (t === acc[acc.length - 1]) continue; acc.push(t); rec(n + 1, acc); acc.pop(); }
  })(2, [first]);
  if (!seqs.length) return { order: [first, first, first, first, first], reduced: 'one type only' };
  return { order: rng.pick(seqs), reduced: false };
};
// §5.4: 1F is purge (or opts.task); 2F–5F take the other registered tasks in a shuffled order,
// one each while they last; floors left over (the proof slice registers only purge) are purge.
G.taskOrder = function (rng, first) {
  const all = BD.tasks.ids(), base = all.includes('purge') ? 'purge' : all[0];
  const rest = rng.shuffle(all.filter((t) => t !== base));
  const out = [first || base];
  for (let n = 2; n <= 5; n++) out.push(rest.length ? rest.shift() : base);
  return out;
};

G.runV2 = function (seed, tier, opts) {
  opts = opts || {};
  if (opts.task) BD.tasks.get(opts.task);
  const od = G.domOrderV2(BD.sub(seed, 'gen', 'domOrderV2'));
  const tasks = G.taskOrder(BD.sub(seed, 'gen', 'tasks'), opts.task);
  const floors = [null];
  for (let n = 1; n <= 5; n++) floors.push(G.floorV2(seed, tier, n, od.order[n - 1], n < 5 ? od.order[n] : 'rooftop', tasks[n - 1]));
  floors.push(G.rooftopV2(seed));
  return { seed, tier, v2: true, domOrder: od.order, tasks, reduced: od.reduced, floors };
};

// One zone (16 × 16 cells) for a fill: x0/y0 its corner cell, cx/cy its centre (u), keep(x, y) →
// true for cells that must stay floor (the start's 5u, a site's 5 × 5 centre).
function zoneOf(zx, zy, keep) {
  const Z = C.V2.floor.zone;
  return { zx, zy, x0: zx * Z, y0: zy * Z, size: Z, cx: zx * Z + Z / 2, cy: zy * Z + Z / 2, keep };
}

// §5.1–5.3, §5.8 for the slice: a 48 × 48 floor of 3 × 3 zones; the task names its layout (§5.3,
// purge → plaza); start (2, 2) and stairs (0, 0) are 'open', the centre zone takes the layout's
// centre fill, the others one of its fills. The stairs door is on a back wall of the stairs zone.
// Checks: connected, start / ring / sites on floor, no 1-cell passage, solid ≤ 14 %, the start's 5u
// clear. 20 retries on derived streams, then every zone 'open'.
G.floorV2 = function (seed, tier, n, domType, nextDomType, task) {
  const F = C.V2.floor, S = F.size, Z = F.zone;
  const tdef = BD.tasks.get(task);
  const layoutId = tdef.layout && BD.gen.layouts.has(tdef.layout) ? tdef.layout : BD.gen.layouts.has('plaza') ? 'plaza' : BD.gen.layouts.ids()[0];
  const lay = BD.gen.layouts.get(layoutId);
  const gk = G.guardianKinds(domType);
  const guardian = gk.length ? BD.sub(seed, 'gen', 'guardian' + n).pick(gk) : null;
  const start = F.start.slice();
  let out = null;
  for (let a = 0; a <= C.GEN_RETRIES && !out; a++) {
    const rng = BD.sub(seed, 'gen', 'v2floor' + n + '/try' + a), fallback = a === C.GEN_RETRIES;
    const grid = BD.Grid(S, S);
    const keep = (x, y) => M.dist(x + 0.5, y + 0.5, start[0], start[1]) <= 5.5;
    const zones = [];
    for (let zy = 0; zy < 3; zy++) for (let zx = 0; zx < 3; zx++) {
      const fill = fallback || (zx === 2 && zy === 2) || (zx === 0 && zy === 0) ? 'open' : zx === 1 && zy === 1 ? lay.centre : rng.pick(lay.fills);
      BD.gen.fills.get(fill).apply(grid, zoneOf(zx, zy, keep), rng);
      zones.push(fill);
    }
    // the stairs door: on the wy = 0 edge at wx 4..11 or the wx = 0 edge at wy 4..11 (§5.1)
    const side = rng.chance(0.5) ? 'y0' : 'x0', k = rng.int(4, 11);
    const ring = C.INTERACT.stairsRingOffset;
    const stairs = side === 'y0' ? { side, x: k + 0.5, y: 0, ringX: k + 0.5, ringY: ring } : { side, x: 0, y: k + 0.5, ringX: ring, ringY: k + 0.5 };
    const flaskZones = [[0, 2], [2, 0], [1, 0], [0, 1], [2, 1], [1, 2]];
    const fz = rng.pick(flaskZones), flask = BD.nav.resolve(grid, fz[0] * Z + Z / 2 + rng.range(-3, 3), fz[1] * Z + Z / 2 + rng.range(-3, 3), 0.3);
    const layout = { start, stairs, altar: null, trialRift: null, rifts: [], flasks: [[flask[0], flask[1]]], wave1: [], sites: [], zones };
    const reason = G.checkV2(grid, layout);
    if (reason) { if (fallback) BD.fail(`gen: v2 floor ${n} failed even with every zone open: ${reason}`); continue; }
    out = {
      n, v2: true, domType, nextDomType, w: S, h: S, cells: grid.toString(), shape: 'rect', pattern: layoutId, floorKind: layoutId,
      task, guardian, attempts: a + 1, fallback, layout,
      spawns: { w1: [], w2: [], w3: [], elites: [], guardian }, trial: null,
      offscreen: { indicators: true, minimap: true },
    };
  }
  return out;
};

// §5.8 1–5 for what the slice places.
G.checkV2 = function (grid, layout) {
  const pts = [layout.start, [layout.stairs.ringX, layout.stairs.ringY]].concat(layout.flasks, layout.sites.map((s) => [s.x, s.y]));
  for (const p of pts) if (!grid.walkable(Math.floor(p[0]), Math.floor(p[1]))) return '§5.8-2 key point not on floor';
  let floorN = 0;
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] === BD.CELL.FLOOR) floorN++;
  const field = BD.nav.bfs(grid, Math.floor(layout.start[0]), Math.floor(layout.start[1]));
  let reach = 0;
  for (let i = 0; i < field.length; i++) if (field[i] >= 0) reach++;
  if (reach !== floorN) return '§5.8-1 floor not connected';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    if (!grid.walkable(x, y)) continue;
    let ok = false;
    for (let oy = -1; oy <= 0 && !ok; oy++) for (let ox = -1; ox <= 0 && !ok; ox++) {
      if (grid.walkable(x + ox, y + oy) && grid.walkable(x + ox + 1, y + oy) && grid.walkable(x + ox, y + oy + 1) && grid.walkable(x + ox + 1, y + oy + 1)) ok = true;
    }
    if (!ok) return '§5.8-3 one-cell passage at ' + x + ',' + y;
  }
  const solid = grid.count(BD.CELL.SOLID);
  if (solid > 0.14 * floorN) return '§5.8-4 solid cells above 14 %';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    if (grid.walkable(x, y)) continue;
    if (M.dist(x + 0.5, y + 0.5, layout.start[0], layout.start[1]) < 5) return '§5.8-5 obstacle within 5u of the start';
  }
  return null;
};

// GDD-V2 §5.1: the rooftop is 28 × 28 open with four 2 × 2 pillars centred on (8, 8) (20, 8) (8, 20)
// (20, 20); the boss in the centre, the hero at (24, 24), flasks at (4, 22) and (22, 4). Minions come
// from the director (its rooftop mix); the boss's v1 summon list is empty.
G.rooftopV2 = function (seed) {
  const R = C.V2.roof, S = R.size;
  const grid = BD.Grid(S, S);
  for (const [px, py] of R.pillars) for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) grid.set(px + ox, py + oy, BD.CELL.SOLID);
  const boss = BD.enemies.all().filter((d) => d.type === 'boss')[0].id;
  return {
    n: 6, v2: true, domType: 'rooftop', nextDomType: null, w: S, h: S, cells: grid.toString(), shape: 'rect', pattern: 'rooftop', floorKind: 'rooftop',
    task: null, guardian: null, attempts: 1, fallback: false,
    layout: { start: R.start.slice(), stairs: null, altar: null, trialRift: null, rifts: [], flasks: R.flasks.map((p) => p.slice()), wave1: [], sites: [], bossPos: R.boss.slice() },
    spawns: { w1: [], w2: [], w3: [], elites: [], guardian: null, boss },
    summonType: null, summon: [], trial: null,
    offscreen: { indicators: true, minimap: true },
  };
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
