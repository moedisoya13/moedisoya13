// Floors larger than the screen: generation limits and guarantees, the floor plan hook, the DDA
// on long rays, staging, and the simulation's cost at 48×48 with 150 enemies.
'use strict';

module.exports = {
  'size limits: 8..128 integer sides, anything else throws': (t) => {
    const BD = t.load();
    for (const bad of [[7, 20], [20, 129], [20.5, 20], [20], 'x']) t.assert.throws(() => BD.gen.floor(1, 0, 2, 'beast', 'undead', { size: bad }), /size must be/);
    const f = BD.gen.floor(1, 0, 2, 'beast', 'undead', { size: [8, 8] });
    t.eq([f.w, f.h], [8, 8]);
  },

  'big floors generate valid for every room shape/pattern draw: §7.6 checks, key points, fast': (t) => {
    const BD = t.load(), G = BD.gen;
    const shapes = new Set(), patterns = new Set();
    let worst = 0;
    for (const size of [[48, 48], [64, 40], [24, 72], [96, 96]]) for (let seed = 1; seed <= (size[0] === 96 ? 6 : 25); seed++) {
      const t0 = Date.now();
      const f = G.floor(seed, 0, 2 + (seed % 4), 'undead', 'magic', { size });
      worst = Math.max(worst, Date.now() - t0);
      t.eq([f.w, f.h], size);
      const grid = BD.Grid.fromString(f.w, f.h, f.cells);
      t.eq(G.check(grid, f.layout), null, `seed ${seed} ${size}`);
      shapes.add(f.shape); patterns.add(f.pattern);
      t.assert(!f.fallback, `seed ${seed} ${size}: needed the rect+open fallback`);
    }
    t.assert(shapes.size >= 3 && patterns.size >= 4, 'many shapes and patterns drawn: ' + [...shapes] + ' / ' + [...patterns]);
    t.assert(worst < 500, 'a big floor generates in under 0.5 s (worst ' + worst + ' ms)');
  },

  // The plan hook sizes the v1 room generator (gen.run(…, {v1: true}), BD.stageFloor); v2 runs build
  // their 48 × 48 floors with gen.floorV2 (GDD-V2 §5) and never read a plan.
  'floor plan hook (v1 generator): sizes floors 2–5, 1F and unsized floors generate exactly as without a plan; v2 runs ignore it': (t) => {
    const plain = t.load(), planned = t.load({ extraFiles: [t.fixture('big_plan.js')] });
    for (const seed of [1, 9, 42]) {
      t.eq(JSON.stringify(planned.gen.run(seed, 0)), JSON.stringify(plain.gen.run(seed, 0)), 'v2 run unchanged by a plan');
      const a = plain.gen.run(seed, 0, { v1: true }), b = planned.gen.run(seed, 0, { v1: true });
      t.eq(JSON.stringify(b.floors[1]), JSON.stringify(a.floors[1]), '1F unchanged');
      t.eq(JSON.stringify(b.floors[6]), JSON.stringify(a.floors[6]), 'rooftop unchanged');
      for (let n = 2; n <= 5; n++) {
        t.eq(b.floors[n].w, 40 + 4 * n);
        t.assert(b.floors[n].h >= 36 && b.floors[n].h <= 44);
        t.eq(b.floors[n].offscreen, { indicators: true, minimap: n >= 3 });
      }
      t.eq(JSON.stringify(plain.gen.run(seed, 0, { v1: true, sizes: {} })), JSON.stringify(a), 'empty sizes change nothing');
    }
  },

  'long rays on a big grid stop at the wall (no fixed step cap)': (t) => {
    const BD = t.load();
    const g = BD.Grid(128, 128);
    const L = BD.nav.rayLen(g, 0.5, 0.5, Math.PI / 4 + 0.001, 1000);
    t.assert(L < 128 * Math.SQRT2 + 1, 'diagonal ray ends at the outer wall, got ' + L);
    t.assert(!BD.nav.losClear(g, 0.5, 0.5, 127.5, 127.5 + 5), 'a point past the wall is not in sight');
  },

  'buckets and blockedIn agree with brute force': (t) => {
    const BD = t.load(), rng = BD.Rng(3);
    const items = [];
    for (let i = 0; i < 300; i++) items.push({ x: rng.range(0, 48), y: rng.range(0, 48) });
    const B = BD.nav.buckets(items, 1.5);
    for (let i = 0; i < 300; i++) {
      const got = new Set(B.near(items[i].x, items[i].y));
      for (let j = 0; j < 300; j++) if (Math.abs(items[j].x - items[i].x) <= 1.5 && Math.abs(items[j].y - items[i].y) <= 1.5) t.assert(got.has(j));
    }
    const g = BD.Grid(20, 20);
    g.set(5, 5, BD.CELL.SOLID); g.set(12, 3, BD.CELL.VOID);
    t.eq(BD.nav.blockedIn(g, 0, 0, 19, 19), 2);
    t.eq(BD.nav.blockedIn(g, 6, 6, 19, 19), 0);
    t.eq(BD.nav.blockedIn(g, 5, 5, 5, 5), 1);
    t.eq(BD.nav.blockedIn(g, -1, 0, 3, 3), 1, 'outside counts as blocked');
  },

  'stage: 48×48 with 150 enemies is deterministic, and enemies cross the floor to the hero': (t) => {
    const BD = t.load();
    const run = () => {
      const H = BD.harness(); H.start({ seed: 11, hand: ['pierce'] });
      const s = H.stage({ size: [48, 48], enemies: 150 });
      t.eq(s, { floor: 2, w: 48, h: 48, enemies: 150 });
      const w = H.world(); w.hero.hp = w.hero.maxHp = 1e6;
      const far0 = w.enemies.filter((e) => Math.hypot(e.x - w.hero.x, e.y - w.hero.y) > 25).length;
      H.step(600);
      const far1 = w.enemies.filter((e) => Math.hypot(e.x - w.hero.x, e.y - w.hero.y) > 25).length;
      return { hash: H.hash(), far0, far1 };
    };
    const a = run(), b = run();
    t.eq(a.hash, b.hash);
    t.assert(a.far0 > 20 && a.far1 < a.far0 / 2, `far enemies close in (${a.far0} → ${a.far1})`);
  },

  'cost: 48×48, 150 enemies, hero walking across — measured tick': (t) => {
    const BD = t.load(), H = BD.harness();
    H.start({ seed: 11, hand: ['pierce', 'flame', 'leech'] });
    H.stage({ size: [48, 48], enemies: 150 });
    const w = H.world(); w.hero.hp = w.hero.maxHp = 1e9;
    for (let i = 0; i < 120; i++) { H.input({ mx: -0.7071, my: -0.7071 }); H.app.step(); } // warm up
    const ts = [];
    for (let i = 0; i < 900; i++) { H.input({ mx: -0.7071, my: -0.7071 }); const t0 = process.hrtime.bigint(); H.app.step(); ts.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    ts.sort((a, b) => a - b);
    const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
    console.log(`     48x48 / 150 enemies: avg ${avg.toFixed(2)} ms, p50 ${ts[450].toFixed(2)}, p95 ${ts[855].toFixed(2)} ms per tick (Node)`);
    t.assert(avg < 6, 'average tick under 6 ms in Node, got ' + avg.toFixed(2));
    t.assert(w.hero.x < 20 && w.hero.y < 20, 'the hero walked across');
  },
};
