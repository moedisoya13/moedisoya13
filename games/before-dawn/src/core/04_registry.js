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
    // attacks.<id> = {name, sfx?, sfxStart?}: sound ids (BD.ui.sfx) played when the blow lands
    // (telegraph_fire) and when its warning starts (telegraph); checked against the UI in the browser
    for (const [a, v] of Object.entries(d.attacks || {})) {
      if (!v || typeof v.name !== 'string') BD.fail(`enemy '${d.id}': attacks.${a}.name required`);
      for (const k of ['sfx', 'sfxStart']) if (v[k] !== undefined && typeof v[k] !== 'string') BD.fail(`enemy '${d.id}': attacks.${a}.${k} must be a sound id`);
    }
  },
});

BD.gen = BD.gen || {};
BD.gen.shapes = BD.makeRegistry('room shape', {
  required: ['apply'],
});
BD.gen.patterns = BD.makeRegistry('obstacle pattern', {
  required: ['apply'],
});
// Floor plan (v2, optional, at most one): sizes floors 1–5 beyond GDD §7's room sizes.
//   BD.gen.plans.register({ id, size(n, ctx) → [W, H] | null, offscreen?(n) → {indicators, minimap} })
// ctx = {seed, tier, domType, rng (its own gen sub-stream 'plan<n>')}. null keeps the §7 size
// (and the §7 random draw, so unsized floors generate exactly as before).
BD.gen.plans = BD.makeRegistry('floor plan', { required: ['size'] });
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
// Decor: extra drawing attached to actors. target: an enemy kind | 'enemy' (every enemy) |
// 'hero_back' (before the hero sprite) | 'hero_front' (after it). Any number per target.
BD.render.decor = BD.makeRegistry('decor', {
  required: ['target', 'draw'],
});
BD.render.obstacles = BD.makeRegistry('obstacle drawer', { required: ['draw'] });   // by obstacle pattern id
BD.render.vfx = BD.makeRegistry('vfx drawer', { required: ['draw'] });             // by vfx event kind

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
  if (BD.gen.plans.ids().length > 1) BD.fail(`at most one floor plan may be registered, found ${BD.gen.plans.ids().join(', ')}`);
  if (!BD.gen.shapes.has('rect')) BD.fail("room shape 'rect' must be registered (fallback)");
  if (!BD.gen.patterns.has('open')) BD.fail("obstacle pattern 'open' must be registered (fallback)");
  for (const r of [BD.cards, BD.enemies, BD.gen.shapes, BD.gen.patterns, BD.gen.bundles, BD.gen.plans]) r.freeze();
});
