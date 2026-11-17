// Floor generation (GDD-V2 §5.1–5.3, §5.5, §5.8): 200 seeds per layout, every guarantee of §5.8
// on every floor, each layout's own shape (office walls and doors, the atrium's shaft and island, the
// hall's room, the ruin's ring), the props the stage gets (footprint = collision), the task order of
// a run, the fallback, the checks themselves, and how long it all takes.
'use strict';
const K = require('./_kit');

const TYPES = ['beast', 'undead', 'magic', 'heavy'];
const SEEDS = 200;
// floor n and its type for the i-th seed: every floor number and type comes up for every layout
const floorOf = (s) => ({ n: 1 + (s % 5), dom: TYPES[(s >> 1) % 4] });
const runs = (s, mx) => { const out = []; let a = 0; while (a < s.length) { let b = a; while (b < s.length && s[b] === s[a]) b++; if (s[a] === mx) out.push(b - a); a = b; } return out; };

function eachFloor(BD, task, fn) {
  for (let s = 1; s <= SEEDS; s++) {
    const { n, dom } = floorOf(s);
    const f = BD.gen.floorV2(s, 0, n, dom, 'magic', task);
    fn(f, BD.Grid.fromString(f.w, f.h, f.cells), s, n);
  }
}

module.exports = {
  'every layout, 200 seeds: §5.8 1–6 hold, the task picks its layout, start / stairs zones open, the centre fill, no fallback': (t) => {
    const BD = t.load(), F = BD.C.V2.floor;
    for (const task of Object.keys(K.LAYOUT_OF)) {
      const layout = K.LAYOUT_OF[task], lay = BD.gen.layouts.get(layout);
      let tries = 0;
      eachFloor(BD, task, (f, g, s, n) => {
        const tag = `${task} seed ${s} ${n}F`;
        t.eq(BD.gen.checkV2(g, f.layout), null, tag);
        t.eq([f.w, f.h, f.floorKind, f.task, f.fallback, f.stage.layout], [48, 48, layout, task, false, layout], tag);
        t.eq([f.layout.zones[0], f.layout.zones[8], f.layout.zones[4]], ['open', 'open', lay.centre], tag + ' zones');
        t.eq(f.stage.zones.map((z) => z.fill), f.layout.zones, tag);
        for (const z of f.layout.zones) t.assert(z === 'open' || z === lay.centre || lay.fills.includes(z), tag + ' fill ' + z);
        t.eq(f.layout.start, F.start, tag);
        const st = f.layout.stairs;
        t.assert(st.side === 'y0' ? st.y === 0 && st.x >= 4 && st.x <= 12 : st.x === 0 && st.y >= 4 && st.y <= 12, tag + ' stairs door on a back wall of zone (0, 0)');
        t.eq(f.layout.flasks, [], tag + ' no flask from the generator (GDD-V2 §6)');
        tries += f.attempts;
      });
      t.assert(tries / SEEDS < 1.3, task + ': retries are rare, mean tries ' + (tries / SEEDS));
    }
  },

  'the places: task places in zones (0, 2) (2, 0) (1, 1), four optional sites in four other zones (1F: two chests, no rift), 5 × 5 clear, 12u apart': (t) => {
    const BD = t.load(), Z = 16;
    const expect = { purge: [], seals: ['seal', 'seal', 'seal'], nests: ['nest', 'nest', 'nest'], hold: ['brazier'], hunt: ['chief', 'chief', 'chief'] };
    for (const task of Object.keys(expect)) {
      eachFloor(BD, task, (f, g, s, n) => {
        const tag = `${task} seed ${s} ${n}F`, L = f.layout, all = L.sites.concat(L.targets);
        const places = all.filter((p) => !p.optional), opt = all.filter((p) => p.optional);
        t.eq(places.map((p) => p.kind), expect[task], tag);
        const want = task === 'hold' ? ['1,1'] : task === 'purge' ? [] : ['0,2', '2,0', '1,1'];
        t.eq(places.map((p) => p.zx + ',' + p.zy), want, tag);
        t.eq(opt.map((p) => p.kind).sort(), n === 1 ? ['altar', 'chest', 'chest', 'spring'] : ['altar', 'chest', 'rift', 'spring'], tag + ' optional kinds');
        const zones = all.map((p) => p.zx + ',' + p.zy);
        t.eq(new Set(zones).size, zones.length, tag + ' one place per zone');
        t.assert(!zones.includes('2,2') && !zones.includes('0,0'), tag + ' nothing in the start or stairs zone');
        for (const p of all) {
          const off = task === 'hunt' && p.zx === 1 && p.zy === 1 ? 5 : 0;
          t.eq([p.x, p.y], [p.zx * Z + 8 + off, p.zy * Z + 8 + off], tag + ' at the zone centre');
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) t.assert(g.walkable(Math.floor(p.x) + ox, Math.floor(p.y) + oy), tag + ' 5 × 5 clear');
        }
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) t.assert(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= 12, tag + ' 12u apart');
        t.eq(L.sites.every((p) => BD.sites.has(p.kind)) && L.targets.every((p) => !BD.sites.has(p.kind)), true);
      });
    }
  },

  'props: one named catalogue prop per block, footprints exactly the SOLID cells, no overlaps; walls carry their layout’s state': (t) => {
    const BD = t.load(), wallState = { office: 'glass', hall: 'stone' };
    for (const task of Object.keys(K.LAYOUT_OF)) {
      const layout = K.LAYOUT_OF[task];
      const seen = new Set();
      eachFloor(BD, task, (f, g, s) => {
        const own = new Int32Array(f.w * f.h).fill(-1), tag = `${task} seed ${s}`;
        f.stage.props.forEach((p, i) => {
          t.assert(K.PROP_IDS.includes(p.id), tag + ' catalogue id ' + p.id);
          seen.add(p.id);
          for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
            t.eq(g.get(x, y), BD.CELL.SOLID, tag + ' prop on a free cell');
            t.eq(own[y * f.w + x], -1, tag + ' props overlap');
            own[y * f.w + x] = i;
          }
          if (p.id === 'wall') t.eq(p.state, wallState[layout] || 'concrete', tag + ' wall state');
          if (p.id === 'wall') t.eq(Math.min(p.w, p.h), 1, tag + ' walls are one cell thick');
        });
        for (let i = 0; i < own.length; i++) if (g.cells[i] === BD.CELL.SOLID) t.assert(own[i] >= 0, tag + ' SOLID cell without a prop at ' + (i % f.w) + ',' + Math.floor(i / f.w));
      });
      if (layout === 'office') for (const id of ['wall', 'cubicle', 'desk_row', 'partition']) t.assert(seen.has(id), 'office uses ' + id);
      if (layout === 'hall') for (const id of ['wall', 'server_rack', 'pillar_big']) t.assert(seen.has(id), 'hall uses ' + id);
      if (layout === 'plaza') for (const id of ['pillar_big', 'planter', 'fountain']) t.assert(seen.has(id), 'plaza uses ' + id);
      if (layout === 'ruin') t.assert(seen.has('crystal_mass') || seen.has('spike_mass'), 'ruin has its ring');
    }
  },

  'office: a wall on every inner zone border with two 3-wide doors per 16 cells, 4+ apart; the zones only join through doors': (t) => {
    const BD = t.load();
    eachFloor(BD, 'seals', (f, g, s) => {
      const tag = 'office seed ' + s, S = 48, solidAt = (x, y) => g.get(x, y) === BD.CELL.SOLID;
      for (const b of [16, 32]) {
        const col = [b - 1, b].find((x) => { let n = 0; for (let y = 0; y < S; y++) if (solidAt(x, y)) n++; return n >= 30; });
        const row = [b - 1, b].find((y) => { let n = 0; for (let x = 0; x < S; x++) if (solidAt(x, y)) n++; return n >= 30; });
        t.assert(col !== undefined && row !== undefined, tag + ' walls along x = ' + b + ' and y = ' + b);
        for (let seg = 0; seg < 3; seg++) {
          const vs = [], hs = [];
          for (let k = seg * 16; k < seg * 16 + 16; k++) { vs.push(solidAt(col, k) ? '#' : '.'); hs.push(solidAt(k, row) ? '#' : '.'); }
          t.eq(runs(vs, '.'), [3, 3], tag + ` doors on x=${col} y ${seg * 16}..: ${vs.join('')}`);
          t.eq(runs(hs, '.'), [3, 3], tag + ` doors on y=${row} x ${seg * 16}..: ${hs.join('')}`);
          for (const line of [vs, hs]) { const a = line.indexOf('.'), b2 = line.indexOf('.', a + 3); t.assert(b2 - (a + 3) >= 4, tag + ' doors 4+ apart'); }
        }
      }
    });
  },

  'atrium: a shaft round a 6 × 6 island with four 3-wide bridges; hall: a 12 × 12 room with four 3-wide doors; ruin: a 4 × 4 ring block': (t) => {
    const BD = t.load(), V = BD.CELL.VOID, FL = BD.CELL.FLOOR, SO = BD.CELL.SOLID;
    eachFloor(BD, 'nests', (f, g, s) => {
      const tag = 'atrium seed ' + s;
      t.eq(g.count(V), 72, tag + ' shaft cells');
      for (let y = 21; y <= 26; y++) for (let x = 21; x <= 26; x++) t.eq(g.get(x, y), FL, tag + ' island');
      for (const k of [18, 19, 20, 27, 28, 29]) {
        t.eq([23, 24, 25].map((x) => g.get(x, k)), [FL, FL, FL], tag + ' bridge across row ' + k);
        t.eq([23, 24, 25].map((y) => g.get(k, y)), [FL, FL, FL], tag + ' bridge across column ' + k);
        t.eq([g.get(22, k), g.get(26, k), g.get(k, 22), g.get(k, 26)], [V, V, V, V], tag + ' bridges are 3 wide');
      }
    });
    eachFloor(BD, 'hold', (f, g, s) => {
      const tag = 'hall seed ' + s;
      for (const k of [18, 29]) {
        const v = [], h = [];
        for (let i = 18; i <= 29; i++) { v.push(g.get(k, i) === SO ? '#' : '.'); h.push(g.get(i, k) === SO ? '#' : '.'); }
        t.eq(runs(v, '.'), [3], tag + ' a door in the room wall x = ' + k + ': ' + v.join(''));
        t.eq(runs(h, '.'), [3], tag + ' a door in the room wall y = ' + k + ': ' + h.join(''));
      }
      for (let y = 19; y <= 28; y++) for (let x = 19; x <= 28; x++) t.eq(g.get(x, y), FL, tag + ' the room is empty');
    });
    eachFloor(BD, 'hunt', (f, g, s) => {
      for (let y = 22; y <= 25; y++) for (let x = 22; x <= 25; x++) t.eq(g.get(x, y), SO, 'ruin seed ' + s + ' ring');
    });
  },

  'a run: 1F purge, 2F–5F the other four tasks once each in a seeded order (all 24 orders over 200 seeds), §5.8-7, pure, &task sets 1F only': (t) => {
    const BD = t.load(), orders = new Set();
    for (let s = 1; s <= SEEDS; s++) {
      const r = BD.gen.run(s, 0);
      t.eq(BD.gen.checkRunV2(r), null, 'seed ' + s);
      t.eq(r.tasks[0], 'purge');
      t.eq(r.tasks.slice(1).slice().sort(), ['hold', 'hunt', 'nests', 'seals'], 'seed ' + s);
      orders.add(r.tasks.join(','));
      for (let n = 1; n <= 5; n++) t.eq([r.floors[n].task, r.floors[n].floorKind], [r.tasks[n - 1], K.LAYOUT_OF[r.tasks[n - 1]]]);
    }
    t.eq(orders.size, 24, 'every order comes up');
    t.eq(JSON.stringify(BD.gen.run(9, 0)), JSON.stringify(BD.gen.run(9, 0)), 'pure');
    const a = BD.gen.run(9, 0), b = BD.gen.run(9, 0, { task: 'hold' });
    t.eq(b.tasks, ['hold'].concat(a.tasks.slice(1)), '&task changes 1F only');
    t.eq(b.floors[1].floorKind, 'hall');
  },

  'the rooftop is a v2 floor: 28 × 28, domType rooftop, its four pillars named (castle), no sites, two flasks': (t) => {
    const BD = t.load(), r = BD.gen.run(4, 0), f = r.floors[6], g = BD.Grid.fromString(f.w, f.h, f.cells);
    t.eq([f.v2, f.w, f.h, f.domType, f.stage.layout, f.layout.sites, f.layout.flasks], [true, 28, 28, 'rooftop', 'rooftop', [], [[4, 22], [22, 4]]]);
    t.eq(f.stage.props.map((p) => [p.id, p.x, p.y, p.w, p.h, p.state]), [[7, 7], [19, 7], [7, 19], [19, 19]].map(([x, y]) => ['pillar_big', x, y, 2, 2, 'castle']));
    t.eq(g.count(BD.CELL.SOLID), 16);
  },

  'fallback: a layout that keeps failing ends as plaza with every zone open after 20 retries, places kept, still §5.8-clean': (t) => {
    const BD = t.load(), cub = BD.gen.fills.get('cubicles'), apply = cub.apply;
    cub.apply = (grid, z) => { for (let y = z.y0 + 3; y <= z.y0 + 12; y++) for (let x = z.x0 + 3; x <= z.x0 + 12; x++) if (!z.keep(x, y)) grid.set(x, y, BD.CELL.SOLID); };
    try {
      const f = BD.gen.floorV2(5, 0, 2, 'heavy', 'magic', 'seals');
      t.eq([f.fallback, f.attempts, f.floorKind, f.stage.layout], [true, BD.C.GEN_RETRIES + 1, 'plaza', 'plaza']);
      t.eq(f.layout.zones, Array(9).fill('open'));
      t.eq(f.layout.sites.filter((p) => p.kind === 'seal').length, 3);
      t.eq(BD.gen.checkV2(BD.Grid.fromString(f.w, f.h, f.cells), f.layout), null);
    } finally { cub.apply = apply; }
  },

  'the checks catch what they guard: disconnection, a 1-cell way, too much SOLID, a blocked site, places too close, two in a zone, a place in the start zone, the start crowded': (t) => {
    const BD = t.load(), base = BD.gen.floorV2(7, 0, 2, 'undead', 'magic', 'seals');
    const fresh = () => ({ g: BD.Grid.fromString(base.w, base.h, base.cells), L: JSON.parse(JSON.stringify(base.layout)) });
    const why = (mut) => { const { g, L } = fresh(); mut(g, L); return BD.gen.checkV2(g, L) || ''; };
    t.eq(why(() => {}), '');
    t.assert(why((g) => { for (let y = 0; y < 48; y++) { g.set(36, y, BD.CELL.SOLID); g.set(37, y, BD.CELL.SOLID); } }).startsWith('§5.8-1'), 'cut in two');
    t.assert(why((g) => { for (let y = 2; y < 46; y++) for (let x = 2; x < 46; x++) if (x % 3 === 0 && y % 3 === 0) g.set(x, y, BD.CELL.SOLID); }).startsWith('§5.8-'), 'a lattice');
    t.assert(why((g) => { for (let x = 30; x <= 34; x++) { g.set(x, 36, BD.CELL.SOLID); g.set(x, 38, BD.CELL.SOLID); } }).startsWith('§5.8-3'), 'a 1-cell lane');
    t.assert(why((g) => { for (let y = 2; y < 30; y++) for (let x = 20; x < 30; x++) if ((x + y) % 2 === 0 && Math.abs(x - 24) > 3) g.set(x, y, BD.CELL.SOLID); }).startsWith('§5.8-'), 'crowded');
    t.assert(why((g, L) => { const s = L.sites[0]; g.set(Math.floor(s.x) + 1, Math.floor(s.y), BD.CELL.SOLID); }).includes('5 × 5'), 'a site’s centre');
    const open = BD.Grid(48, 48), L0 = { start: [40, 40], stairs: base.layout.stairs, flasks: [], targets: [], sites: [{ kind: 'seal', x: 8, y: 40, zx: 0, zy: 2 }, { kind: 'seal', x: 8, y: 32, zx: 0, zy: 1 }] };
    t.assert((BD.gen.checkV2(open, L0) || '').includes('12u'), 'too close');
    t.assert(why((g, L) => { L.sites[0].zx = L.sites[1].zx; L.sites[0].zy = L.sites[1].zy; }).startsWith('§5.8-6'), 'two task places in a zone');
    t.assert(why((g, L) => { const o = L.sites.find((p) => p.optional); o.zx = 2; o.zy = 2; }).startsWith('§5.8-6'), 'a place in the start zone');
    t.assert(why((g) => g.set(42, 41, BD.CELL.SOLID)).startsWith('§5.8-5'), 'within 5u of the start');
    t.assert(why((g, L) => { g.set(Math.floor(L.stairs.ringX), Math.floor(L.stairs.ringY), BD.CELL.SOLID); }).startsWith('§5.8-'), 'the stairs ring');
  },

  'cost: a whole run generates in well under a frame per floor; one check pass is under 2 ms': (t) => {
    const BD = t.load();
    let t0 = process.hrtime.bigint();
    for (let s = 1; s <= 60; s++) BD.gen.run(s, 0);
    const perFloor = Number(process.hrtime.bigint() - t0) / 1e6 / (60 * 5);
    const f = BD.gen.floorV2(3, 0, 3, 'magic', 'heavy', 'seals'), g = BD.Grid.fromString(f.w, f.h, f.cells);
    t0 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) BD.gen.checkV2(g, f.layout);
    const perCheck = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
    t.assert(perFloor < 8, 'ms per floor ' + perFloor.toFixed(2));
    t.assert(perCheck < 2, 'ms per check ' + perCheck.toFixed(3));
  },
};
