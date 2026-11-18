// Floor generation over many seeds (GDD §7): room sizes and shapes (§7.2), obstacle patterns and
// their spacing / 12 % limit, placement (§7.3), spawn tables and wave split (§7.4), dominant
// order (§7.5) and the guarantees of §7.6.
'use strict';
// v2 runs build 48 × 48 floors (GDD-V2 §5; tests/core/gen_v2.test.js). The v1 room generator these
// tests describe still runs on request (gen.run(…, {v1: true}); BD.stageFloor) and keeps its rules.
const V1 = { v1: true };

const SEEDS = Number(process.env.GEN_SEEDS) || 300; // GEN_SEEDS=2000 for a longer sweep
const SIZES = ['16x10', '10x16', '13x13', '14x12', '12x14'];

function solidBlocks(f) {
  const seen = new Set(), out = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? -1 : f.cells[y * f.w + x]);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    if (at(x, y) !== '#' || seen.has(y * f.w + x)) continue;
    const q = [[x, y]], cells = []; seen.add(y * f.w + x);
    while (q.length) {
      const [cx, cy] = q.pop(); cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (at(nx, ny) === '#' && !seen.has(ny * f.w + nx)) { seen.add(ny * f.w + nx); q.push([nx, ny]); }
      }
    }
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    out.push({ cells, bw: Math.max(...xs) - Math.min(...xs) + 1, bh: Math.max(...ys) - Math.min(...ys) + 1, x0: Math.min(...xs), y0: Math.min(...ys) });
  }
  return { blocks: out, at };
}
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
function minGap(A, B) { let m = Infinity; for (const a of A.cells) for (const b of B.cells) m = Math.min(m, cheb(a, b)); return m - 1; } // free cells between
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function checkFloor(t, BD, f, tag) {
  const { blocks, at } = solidBlocks(f);
  const nVoid = [...f.cells].filter((c) => c === ' ').length, nSolid = [...f.cells].filter((c) => c === '#').length;
  // size and shape
  if (f.n === 1) { t.eq(`${f.w}x${f.h}`, '12x12', tag); t.eq(f.shape, 'rect', tag); t.assert(['open', 'pillars'].includes(f.pattern), tag + ' 1F pattern'); }
  else t.assert(SIZES.includes(`${f.w}x${f.h}`), tag + ' size');
  t.assert(f.w + f.h <= 26, tag);
  if (f.shape === 'rect') t.eq(nVoid, 0, tag);
  if (f.shape === 'notch') {
    t.eq(nVoid, 16, tag);
    const right = at(f.w - 1, 0) === ' ';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) t.eq(right ? at(f.w - 4 + x, y) : at(x, f.h - 4 + y), ' ', tag + ' notch block');
  }
  if (f.shape === 'bite') {
    t.eq(nVoid, 16, tag);
    const mx = Math.floor(f.w / 2) - 2, my = Math.floor(f.h / 2) - 2;
    for (let i = 0; i < 4; i++) for (let d = 1; d <= 2; d++) { t.eq(at(mx + i, f.h - d), ' ', tag + ' bite y'); t.eq(at(f.w - d, my + i), ' ', tag + ' bite x'); }
  }
  // obstacles: 12 %, 2 cells from walls / void, pattern shapes and spacing
  t.assert(nSolid <= 0.12 * (f.w * f.h - nVoid) + 1e-9, tag + ' solid ≤ 12 %');
  for (const b of blocks) for (const [x, y] of b.cells) for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    const c = at(x + ox, y + oy);
    t.assert(c !== -1 && c !== ' ', `${tag} solid at ${x},${y} within 2 of wall/void`);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) t.assert(minGap(blocks[i], blocks[j]) >= 2, tag + ' blocks 2 apart');
  const sizes = blocks.map((b) => [b.bw, b.bh].sort().join('x'));
  const P = f.pattern;
  if (P === 'open') { t.assert(blocks.length <= 2, tag); t.assert(sizes.every((s) => s === '1x1'), tag); }
  if (P === 'pillars') {
    t.assert(blocks.length >= 4 && blocks.length <= 6, `${tag} pillars ${blocks.length}`);
    t.assert(sizes.every((s) => s === '1x1'), tag);
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) t.assert(minGap(blocks[i], blocks[j]) >= 3, tag + ' pillars 3 apart');
  }
  if (P === 'aisle') {
    t.assert(blocks.length >= 2 && blocks.length <= 3, `${tag} desks ${blocks.length}`);
    t.assert(sizes.every((s) => s === '1x4'), tag);
    t.eq(new Set(blocks.map((b) => b.bw > b.bh)).size, 1, tag + ' parallel');
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) t.assert(minGap(blocks[i], blocks[j]) >= 3, tag + ' desk rows 3 apart');
  }
  if (P === 'ring') {
    t.eq(blocks.length, 1, tag); t.eq(sizes[0], '3x3', tag);
    t.assert(Math.abs(blocks[0].x0 - (Math.floor(f.w / 2) - 1)) <= 1 && Math.abs(blocks[0].y0 - (Math.floor(f.h / 2) - 1)) <= 1, tag + ' centred');
  }
  if (P === 'cover') { t.assert(blocks.length >= 5 && blocks.length <= 7, `${tag} partitions ${blocks.length}`); t.assert(sizes.every((s) => s === '1x2'), tag); }
  // §7.6 1–3 (engine check) on the stored grid
  const g = BD.Grid.fromString(f.w, f.h, f.cells);
  t.eq(BD.gen.check(g, f.layout), null, tag);
  // §7.3 placement
  const L = f.layout;
  t.eq(L.start, [f.w - 2 + 0.5, f.h - 2 + 0.5], tag);
  t.eq(L.rifts.length, 3, tag);
  for (let i = 0; i < 3; i++) { t.assert(dist(L.rifts[i], L.start) >= 5, tag); for (let j = i + 1; j < 3; j++) t.assert(dist(L.rifts[i], L.rifts[j]) >= 5, tag); }
  t.assert(dist(L.altar, L.start) >= 4 && dist(L.altar, [L.stairs.ringX, L.stairs.ringY]) >= 4, tag + ' altar');
  t.assert(dist(L.flasks[0], L.start) >= 5 && dist(L.flasks[0], [L.stairs.ringX, L.stairs.ringY]) >= 3, tag + ' flask');
  for (const p of L.wave1) t.assert(dist(p, L.start) >= 6, tag + ' wave 1 ≥ 6u from the start');
  return { blocks: blocks.length };
}

module.exports = {
  'every floor of 300 seeds: sizes, shapes, patterns, spacing, 12 %, §7.3 placement, §7.6 1–3'(t) {
    const BD = t.load();
    const used = { shape: {}, pattern: {} };
    let fallback = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const run = BD.gen.run(s, 0, V1);
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n];
        if (f.fallback) fallback++;
        checkFloor(t, BD, f, `seed ${s} ${n}F ${f.shape}/${f.pattern}`);
        used.shape[f.shape] = (used.shape[f.shape] || 0) + 1;
        used.pattern[f.pattern] = (used.pattern[f.pattern] || 0) + 1;
      }
    }
    t.eq(Object.keys(used.shape).sort(), ['bite', 'notch', 'rect']);
    t.eq(Object.keys(used.pattern).sort(), ['aisle', 'cover', 'open', 'pillars', 'ring']);
    t.assert(fallback === 0, `${fallback} floors needed the rect+open fallback`);
  },
  '§7.5 / §7.6-4: 1F beast or undead, every type dominant once, neighbours differ; ≥ 19 undead and 5 guardians per run'(t) {
    const BD = t.load();
    const firsts = new Set();
    for (let s = 1; s <= SEEDS; s++) {
      const run = BD.gen.run(s, 0, V1);
      const o = run.domOrder;
      t.eq(run.reduced, false);
      t.assert(o[0] === 'beast' || o[0] === 'undead', `seed ${s} 1F ${o[0]}`);
      firsts.add(o[0]);
      for (const ty of ['beast', 'undead', 'magic', 'heavy']) t.assert(o.includes(ty), `seed ${s} lacks ${ty}`);
      for (let i = 1; i < 5; i++) t.assert(o[i] !== o[i - 1], `seed ${s} neighbours`);
      let undead = 0, guardians = 0;
      for (let n = 1; n <= 5; n++) {
        const sp = run.floors[n].spawns;
        for (const k of sp.w1.concat(sp.w2, sp.w3)) if (BD.enemies.get(k).type === 'undead') undead++;
        if (BD.enemies.get(sp.guardian).type === 'undead') undead++;
        guardians++;
      }
      t.assert(undead >= 19, `seed ${s}: ${undead} undead`); t.eq(guardians, 5);
      t.eq(run.floors[5].nextDomType, 'rooftop');
      for (let n = 1; n < 5; n++) t.eq(run.floors[n].nextDomType, o[n]);
    }
    t.eq([...firsts].sort(), ['beast', 'undead']);
  },
  '§7.4: each floor = dominant bundle + the other types\' non-dominant bundles, split 30 % / 35 % / rest'(t) {
    const BD = t.load();
    for (let s = 1; s <= 80; s++) {
      const run = BD.gen.run(s, 0, V1);
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n], sp = f.spawns;
        const want = {};
        const add = (row) => { if (row) for (const [k, c] of Object.entries(row)) want[k] = (want[k] || 0) + c; };
        add(BD.gen.bundles.get(f.domType).dom[n]);
        for (const ty of ['beast', 'undead', 'magic', 'heavy']) if (ty !== f.domType) add(BD.gen.bundles.get(ty).nondom[n]);
        const all = sp.w1.concat(sp.w2, sp.w3), got = {};
        for (const k of all) got[k] = (got[k] || 0) + 1;
        t.eq(got, Object.fromEntries(Object.keys(want).sort().map((k) => [k, want[k]])), `seed ${s} ${n}F`);
        t.eq(sp.w1.length, Math.ceil(all.length * 0.30)); t.eq(sp.w2.length, Math.ceil(all.length * 0.35));
      }
    }
    // the GDD's two worked examples
    const count = (n, dom) => BD.gen.spawnList(n, dom).length;
    t.eq(count(3, 'heavy'), 14); t.eq(count(5, 'beast'), 37);
  },
  'trial lists: half the dominant bundle (rounded up) and, from 3F, one dominant elite'(t) {
    const BD = t.load();
    for (let s = 1; s <= 40; s++) {
      const run = BD.gen.run(s, 0, V1);
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n], row = BD.gen.bundles.get(f.domType).dom[n];
        const want = Object.values(row).reduce((a, c) => a + Math.ceil(c / 2), 0);
        t.eq(f.trial.kinds.length, want);
        t.eq(!!f.trial.elite, n >= 3);
        if (f.trial.elite) t.eq(BD.enemies.get(f.trial.elite).type, f.domType);
      }
    }
  },
  'rooftop: 13×13, pillars (3,3) (9,3) (3,9) (9,9), boss centre, hero (11,11), flasks, rifts; summon = a type\'s 3F non-dominant bundle'(t) {
    const BD = t.load();
    const types = new Set();
    for (let s = 1; s <= 60; s++) {
      const r = BD.gen.run(s, 0, V1).floors[6];
      t.eq([r.w, r.h], [13, 13]);
      const solids = [];
      for (let i = 0; i < r.cells.length; i++) if (r.cells[i] === '#') solids.push([i % 13, Math.floor(i / 13)]);
      t.eq(solids, [[3, 3], [9, 3], [3, 9], [9, 9]]);
      t.eq(r.layout.bossPos, [6.5, 6.5]); t.eq(r.layout.start, [11.5, 11.5]);
      t.eq(r.layout.flasks, [[2.5, 10.5], [10.5, 2.5]]); t.eq(r.layout.rifts, [[1.5, 6.5], [6.5, 1.5]]);
      const row = BD.gen.bundles.get(r.summonType).nondom[3];
      t.eq(r.summon.length, Object.values(row).reduce((a, c) => a + c, 0));
      types.add(r.summonType);
    }
    t.eq([...types].sort(), ['beast', 'heavy', 'magic', 'undead']);
  },
  'same seed and tier → identical floors'(t) {
    const BD = t.load();
    for (const s of [1, 77, 4242]) t.eq(JSON.stringify(BD.gen.run(s, 0, V1)), JSON.stringify(BD.gen.run(s, 0, V1)));
    t.assert(JSON.stringify(BD.gen.run(1, 0, V1).floors[1].cells) !== JSON.stringify(BD.gen.run(2, 0, V1).floors[1].cells) || BD.gen.run(1, 0, V1).domOrder.join() !== BD.gen.run(2, 0, V1).domOrder.join());
  },
};
