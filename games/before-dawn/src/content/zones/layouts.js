// Floor layouts (배치 유형, GDD-V2 §5.3): which fills a floor uses, whether its zones are walled,
// and which catalogue prop each kind of block becomes (docs/ARCHITECTURE.md §11.2). The task names
// its layout (purge plaza, seals office, nests atrium, hold hall, hunt ruin).
//
//   {id, centre: fill of zone (1, 1), fills: [fills of the other zones], walls?: true (office:
//    1-cell walls on the zone borders with two 3-wide doors per 16 cells), props: {kind: [ids]}}
//
// Block kinds the fills put: post 1×1, column 2×2 (pillars), planter 1×3, row 1×5 (aisle), cube 2×2
// (cubicles), mass 4×4 (ring), wall (chamber, zone borders). An id may carry a state: 'wall:glass'.
// BD.gen.propFor(kind, layout, theme, rng) picks one; the floor type adds its own (heavy sandbags
// and weapon racks, magic bookshelves and crystals, undead and heavy spike masses).
const L = BD.gen.layouts;

L.register({
  id: 'plaza', name: '광장', centre: 'pillars', fills: ['open', 'pillars', 'planters', 'ring'],
  props: { post: ['pillar', 'pillar', 'pillar', 'plant'], column: ['pillar_big'], planter: ['planter'], row: ['desk_row'], cube: ['crate'], mass: ['fountain'], wall: ['wall:concrete'] },
});
L.register({
  id: 'office', name: '사무실', centre: 'cubicles', fills: ['cubicles', 'aisle', 'planters', 'open'], walls: true,
  props: { post: ['pillar', 'cabinet', 'plant', 'vending', 'copier'], column: ['cubicle'], planter: ['partition'], row: ['desk_row'], cube: ['cubicle'], mass: ['reception'], wall: ['wall:glass'] },
});
L.register({
  id: 'atrium', name: '아트리움', centre: 'island', fills: ['pillars', 'planters', 'open'],
  props: { post: ['pillar', 'pillar', 'plant'], column: ['pillar_big'], planter: ['planter'], row: ['desk_row'], cube: ['crate'], mass: ['fountain'], wall: ['wall:concrete'] },
});
L.register({
  id: 'hall', name: '대전', centre: 'chamber', fills: ['aisle', 'pillars'],
  props: { post: ['pillar', 'pillar', 'crystal_block'], column: ['pillar_big'], planter: ['bench'], row: ['server_rack'], cube: ['crate'], mass: ['crystal_mass'], wall: ['wall:stone'] },
});
L.register({
  id: 'ruin', name: '폐허', centre: 'ring', fills: ['planters', 'cubicles', 'ring', 'pillars'],
  props: { post: ['pillar:broken', 'rubble', 'crate', 'spike_mass', 'crystal_block'], column: ['crate', 'crystal_block', 'spike_mass'], planter: ['rubble', 'planter', 'crate'], row: ['rubble', 'bookshelf', 'desk_row'], cube: ['crate', 'crystal_block', 'spike_mass'], mass: ['crystal_mass'], wall: ['wall:concrete'] },
});

// One prop id (and state) for a block of `kind` on a `layout` floor of type `theme`.
BD.gen.propFor = function (kind, layout, theme, rng) {
  const lay = L.get(layout), pick = (a) => a[Math.floor(rng.next() * a.length)];
  let id = pick(lay.props[kind] || ['crate']);
  if (kind === 'planter' && theme === 'heavy' && layout !== 'office' && rng.chance(0.5)) id = 'sandbags';
  if (kind === 'row') {
    if (layout === 'hall') id = theme === 'magic' ? 'bookshelf' : 'server_rack';
    else if (theme === 'heavy' && rng.chance(0.35)) id = 'weapon_rack';
    else if (theme === 'magic' && rng.chance(0.35)) id = 'bookshelf';
  }
  if (kind === 'column' && theme === 'heavy' && layout !== 'office' && layout !== 'ruin' && rng.chance(0.4)) id = 'crate';
  if (kind === 'mass') {
    if (layout === 'plaza' || layout === 'atrium') id = theme === 'magic' ? 'crystal_mass' : 'fountain';
    else if (layout !== 'office') id = theme === 'undead' || theme === 'heavy' ? 'spike_mass' : 'crystal_mass';
  }
  const [pid, state] = id.split(':');
  return state ? { id: pid, state } : { id: pid };
};
