// Shared helpers for tests/floors (GDD-V2 §5, §6): start a floor with a given task, a calm stage
// (no director, no growth overlay, no stray enemies), events, the hero standing somewhere.
'use strict';

const K = module.exports;

// A v2 run on `floor` with 1F's task `task`. o.calm (default): every enemy removed but task objects
// (nests), chiefs and their packs, and chest guards (o.keepGuards false removes those too); no
// director, no growth overlay.
K.start = function (t, o) {
  o = o || {};
  const BD = t.load();
  const H = BD.harness();
  H.start({ seed: o.seed || 3, hand: o.hand || [], floor: o.floor || 1, level: o.level || 1, task: o.task });
  const w = H.world();
  if (o.calm !== false) {
    for (const e of w.enemies.slice()) {
      const chestGuard = String(e.flags.wake || '').startsWith('chest:'), huntPack = String(e.flags.wake || '').startsWith('hunt:');
      if (e.role === 'object' || (o.keepGuards !== false && chestGuard) || e.flags.chief || huntPack) continue;
      BD.W.removeEnemy(w, e, 'recycle');
    }
    w.enemies = w.enemies.filter((e) => !e.dead); w.shards = []; w.stats.recycled = 0; w.scenario = true; w.freezeT = 0;
  }
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
};
K.evs = (w, name) => w.bus.recent(4000).filter((x) => x.event === name);
K.site = (w, kind, i) => w.sites.filter((s) => s.kind === kind)[i || 0];
// put the hero at (x, y) with the camera there; his blade idle unless o.fight
K.place = function (BD, w, x, y, o) {
  w.hero.x = x; w.hero.y = y; BD.view.snapCam(w);
  if (!(o && o.fight)) w.hero.atkTimer = 1e9;
};
// hold every live enemy in place (for counting what a shockwave does)
K.freeze = (w) => { for (const e of w.enemies) if (!e.dead) e.stunT = 1e9; };
K.live = (w, pred) => w.enemies.filter((e) => !e.dead && (!pred || pred(e)));
// The catalogue prop ids of docs/ARCHITECTURE.md §11.2 (the stage art draws an unknown id as `block`).
K.PROP_IDS = ['pillar', 'pillar_big', 'planter', 'partition', 'bench', 'sandbags', 'desk_row', 'server_rack', 'bookshelf', 'weapon_rack', 'cubicle', 'crate', 'crystal_block', 'spike_mass', 'crystal_mass', 'fountain', 'reception', 'wall', 'rubble', 'cabinet', 'vending', 'copier', 'plant', 'ac_unit', 'water_tank'];
K.LAYOUT_OF = { purge: 'plaza', seals: 'office', nests: 'atrium', hold: 'hall', hunt: 'ruin' };
