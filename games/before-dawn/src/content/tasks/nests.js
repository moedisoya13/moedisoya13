// 둥지 (nests) — GDD-V2 §5.4. Three nests in different zones — (0, 2), (2, 0), (1, 1) (the middle
// one on the atrium's island). A nest is a target that does not move (radius 0.8u, HP 150 × the
// floor's HP multiplier; the hero's auto-attack takes it like any enemy). While the hero is within
// 14u it hatches 4 fodder every 4 s (rift warnings), at most 12 of its own alive. Broken: 10 shards,
// its brood dies with it (their shards drop). All three broken → the guardian.
// Layout: atrium (cross the bridges to the island; archers and mages shoot over the shaft).
const HP = 150, R = 0.8, NEAR = 14, EVERY = 4, BROOD = 4, MAX = 12, SHARDS = 10;

// The nest object: an enemy-like body (src/core/20_world.js makeEnemy takes the def itself — it is not
// an enemy kind, so it never joins the horde, the codex or a staged crowd). role 'object'; the stage
// art draws the nest as a site, BD.render.objects only its health.
const NEST = {
  id: 'nest', name: '둥지', type: 'beast', hp: HP, speed: 0, dmg: 0, radius: R, sprite: 'slime', attacks: {},
  shards: SHARDS, knockScale: 0, object: true, cost: 0,
  create(e, w) { e.role = 'object'; if (BD.C.TYPES.includes(w.floor.domType)) e.type = w.floor.domType; },
  update(e) { e.state = 'idle'; },
};
BD.places.NEST = NEST;

BD.sites.register({
  id: 'nest', name: '둥지', stay: 0, passive: true, known: true, states: ['alive', 'dead'],
  enter(w, site) {
    const e = BD.W.makeEnemy(w, NEST, site.x, site.y, { via: 'placed', flags: { keep: true, target: true, nest: site.id } });
    site.mem = { enemyId: e.id, t: 0, home: [site.x, site.y] };
  },
  use() { return true; },
  on: {
    kill(ev, w, site) {
      if (site.phase !== 'idle' || ev.enemyId !== site.mem.enemyId) return;
      site.phase = 'active';
      for (const o of w.enemies.slice()) if (!o.dead && o.flags.brood === site.id) { o.lastSource = 'burst'; BD.combat.kill(w, o); }
      const mine = (x) => x.opts && x.opts.flags && x.opts.flags.brood === site.id;
      w.rifts = w.rifts.filter((r) => !mine(r)); w.queue = w.queue.filter((q) => !mine(q));
      BD.W.toast(w, '둥지를 부쉈다');
      BD.siteRt.clear(w, site);
    },
  },
  look(w, s) { return s.phase === 'idle' ? 'alive' : 'dead'; },
});

BD.tasks.register({
  id: 'nests', name: '둥지', layout: 'atrium', icon: 'nest',
  places() { return [{ kind: 'nest', zone: [0, 2] }, { kind: 'nest', zone: [2, 0] }, { kind: 'nest', zone: [1, 1] }]; },
  goal() { return 3; },
  on: { site_clear(ev, w) { if (ev.kind === 'nest') BD.taskRt.progress(w, 1); } },
  // the nests hold their place (separation and a walking hero may nudge a body) and hatch
  update(w, task, dt) {
    const h = w.hero, P = BD.places;
    for (const s of w.sites) {
      if (s.kind !== 'nest' || s.phase !== 'idle') continue;
      const e = BD.W.enemyById(w, s.mem.enemyId);
      if (!e || e.dead) continue;
      e.x = s.mem.home[0]; e.y = s.mem.home[1];
      if (w.freezeT > 0 || h.dead || BD.math.dist(h.x, h.y, e.x, e.y) > NEAR) continue;
      s.mem.t += dt;
      if (s.mem.t + 1e-9 < EVERY) continue;
      s.mem.t -= EVERY;
      const n = Math.min(BROOD, MAX - P.count(w, (f) => f.brood === s.id));
      const kinds = [];
      for (let i = 0; i < n; i++) kinds.push(P.fodder(w, w.rng.spawn));
      if (kinds.length) P.warn(w, e.x, e.y, kinds.filter(Boolean), { r0: 1.4, r1: 2.6, flags: { brood: s.id } });
    }
  },
  label(task) { return '둥지 ' + task.value + '/' + task.goal; },
  numbers: { HP, NEAR, EVERY, BROOD, MAX, SHARDS },
});

// health over the nest (the nest itself is the stage art's site drawing)
BD.render.objects.register({
  id: 'nest',
  draw(g, v, e, w) {
    const p = v.proj(e.x, e.y, 58), k = Math.max(0, e.hp / e.maxHp), wd = 54;
    g.save();
    g.fillStyle = BD.ui.INK; g.fillRect(p[0] - wd / 2 - 2, p[1] - 2, wd + 4, 10);
    g.fillStyle = '#3a2a2a'; g.fillRect(p[0] - wd / 2, p[1], wd, 6);
    g.fillStyle = e.hitT > 0 ? '#ffffff' : '#e8542c'; g.fillRect(p[0] - wd / 2, p[1], wd * k, 6);
    g.restore();
  },
});
