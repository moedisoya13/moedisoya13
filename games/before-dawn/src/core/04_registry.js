// The content registries. Content files call register(); the engine looks ids up with get(),
// which throws on unknown ids. finalize() cross-checks references between registries.

BD.sub = function (seed, stream, name) { return BD.Rng(BD.hash32('bd:' + (seed >>> 0) + ':' + stream + '/' + name)); };

const FAMILIES = ['shape', 'element', 'trigger', 'target', 'quest', 'combo'];
const ELEMENTS = ['tide', 'lightning', 'flame']; // §2.3 ⑤ order
BD.CARD_FAMILIES = FAMILIES;
BD.ELEMENT_ORDER = ELEMENTS;

BD.cards = BD.makeRegistry('card', {
  required: ['name', 'family', 'unlock', 'desc'],
  validate(d) {
    if (!FAMILIES.includes(d.family)) BD.fail(`card '${d.id}': family must be one of ${FAMILIES.join('|')}`);
    if (d.unlock !== 'base' && typeof d.unlock !== 'function') BD.fail(`card '${d.id}': unlock must be 'base' or function(save)`);
    if (d.element && !ELEMENTS.includes(d.element)) BD.fail(`card '${d.id}': element must be one of ${ELEMENTS.join('|')}`);
    if (d.family === 'combo' && typeof d.maxStack !== 'number') BD.fail(`card '${d.id}': combo cards need maxStack`);
    if (d.family === 'quest' && typeof d.goal !== 'number') BD.fail(`card '${d.id}': quest cards need goal`);
    const fns = ['init', 'stats', 'shapes', 'flat', 'mult', 'onHit', 'afterSwing', 'hud', 'offerable', 'onEquip', 'onUnequip', 'tick'];
    for (const f of fns) if (d[f] !== undefined && typeof d[f] !== 'function') BD.fail(`card '${d.id}': ${f} must be a function`);
    if (d.on) for (const ev of Object.keys(d.on)) {
      if (!BD.events.decl[ev]) BD.fail(`card '${d.id}': listens to undeclared event '${ev}'`);
    }
    if (d.family === 'element' && !d.element) BD.fail(`card '${d.id}': element cards need element`);
  },
});

BD.enemies = BD.makeRegistry('enemy', {
  required: ['name', 'type', 'hp', 'speed', 'dmg', 'radius', 'sprite', 'attacks', 'update'],
  validate(d) {
    if (!BD.C.TYPES.includes(d.type) && d.type !== 'boss') BD.fail(`enemy '${d.id}': type must be one of ${BD.C.TYPES.join('|')}|boss`);
    if (typeof d.update !== 'function') BD.fail(`enemy '${d.id}': update must be a function`);
    if (d.type !== 'boss' && typeof d.cost !== 'number') BD.fail(`enemy '${d.id}': cost required`);
  },
});

BD.gen = BD.gen || {};
BD.gen.shapes = BD.makeRegistry('room shape', {
  required: ['apply'],
});
BD.gen.patterns = BD.makeRegistry('obstacle pattern', {
  required: ['apply'],
});
// Spawn bundles per type (GDD §7.4). dom[n] / nondom[n] for floor n = 1..5, each {kind: count} or null.
BD.gen.bundles = BD.makeRegistry('spawn bundle', {
  required: ['dom', 'nondom'],
  validate(d) {
    if (!BD.C.TYPES.includes(d.id)) BD.fail(`spawn bundle id must be a type id, got '${d.id}'`);
    for (const k of ['dom', 'nondom']) if (!Array.isArray(d[k]) || d[k].length !== 6) BD.fail(`bundle '${d.id}': ${k} must be an array of 6 (index 0 unused, 1..5 = floors)`);
  },
});

// Presentation drawers. Stored here (DOM-free) so content files can ship their own drawing
// next to their rules; they are only ever invoked by the browser renderer.
BD.render = BD.render || {};
BD.render.trails = BD.makeRegistry('trail drawer', { required: ['draw'] });       // by strike shape kind
BD.render.projectiles = BD.makeRegistry('projectile drawer', { required: ['draw'] }); // by projectile kind
BD.render.zones = BD.makeRegistry('zone drawer', { required: ['draw'] });         // by zone kind
BD.render.telegraphs = BD.makeRegistry('telegraph style', { required: ['draw'] }); // by telegraph style
BD.render.decor = BD.makeRegistry('enemy decor', { required: ['draw'] });          // extra per-enemy drawing, by enemy kind

BD.onFinalize(function () {
  const meta = BD.assetMeta || {};
  for (const d of BD.enemies.all()) {
    if (!meta[d.sprite]) BD.fail(`enemy '${d.id}': sprite '${d.sprite}' is not in assets/sprites.json`);
  }
  for (const b of BD.gen.bundles.all()) {
    for (const k of ['dom', 'nondom']) for (const row of b[k]) if (row) for (const kind of Object.keys(row)) {
      const e = BD.enemies.get(kind);
      if (e.type !== b.id) BD.fail(`bundle '${b.id}': kind '${kind}' has type '${e.type}'`);
    }
  }
  const bosses = BD.enemies.all().filter((d) => d.type === 'boss');
  if (bosses.length !== 1) BD.fail(`exactly one boss enemy must be registered, found ${bosses.length}`);
  if (!BD.gen.shapes.has('rect')) BD.fail("room shape 'rect' must be registered (fallback)");
  if (!BD.gen.patterns.has('open')) BD.fail("obstacle pattern 'open' must be registered (fallback)");
  for (const r of [BD.cards, BD.enemies, BD.gen.shapes, BD.gen.patterns, BD.gen.bundles]) r.freeze();
});
