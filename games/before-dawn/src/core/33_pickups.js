// Touch pickups (GDD-V2 §6): things on the floor the hero uses by stepping on them — flask (성수),
// halo (빛의 고리), holy_stone (성광석). Light shards are not these: they are drawn in by the pick-up
// radius (src/core/29_growth.js); these are not, they must be walked onto (touch 0.6u). A kind
// registers {id, touch (u from the hero's edge), take(w, p) → true if used (false: it stays, e.g. a
// flask at full HP)}; halo and holy_stone are in src/content/pickups/. Each use emits
// `pickup {kind, x, y, value}`.
//
// Supply (§6): an elite always drops a flask (src/core/22_combat.js → BD.flow.dropFlask); a threat
// that dies drops a flask 4 %, a halo 2 %, a holy stone 1.5 % (w.rng.spawn, in that order); a chest
// gives a halo, a cleared rift a holy stone. At most 4 flasks, 2 halos, 2 holy stones lie on a floor
// at once: a drop over the cap does not happen. The rooftop has its two flasks from the generator.
//
//   BD.pickupRt.drop(w, kind, x, y)     place one (respects the cap; returns it or null)
//   BD.pickupRt.count(w, kind)          how many of a kind lie on the floor
//   BD.pickupRt.start(w)                v2 floor entry: the threat-drop listener
//   BD.pickupRt.update(w)               per tick: touches

const C = BD.C;
const M = BD.math;
const W = BD.W;
const P = BD.pickupRt = {};
P.CAP = { flask: 4, halo: 2, holy_stone: 2 };
P.THREAT_DROP = [['flask', 0.04], ['halo', 0.02], ['holy_stone', 0.015]];

BD.pickups.register({
  id: 'flask', touch: C.INTERACT.flaskTouch,
  take(w, p) {
    if (w.hero.hp >= w.hero.maxHp) return false; // v1: not picked up at full HP
    W.heal(w, w.mods.flask, 'flask');
    return true;
  },
});

P.count = (w, kind) => { let n = 0; for (const p of w.pickups) if (p.kind === kind && !p.taken) n++; return n; };

P.drop = function (w, kind, x, y) {
  BD.pickups.get(kind);
  if (P.CAP[kind] !== undefined && P.count(w, kind) >= P.CAP[kind]) return null;
  const [px, py] = BD.nav.resolve(w.grid, x, y, 0.3);
  const p = { id: W.id(w), kind, x: px, y: py };
  w.pickups.push(p);
  return p;
};

// A threat's death may leave a pickup (rolled in this order, each on its own).
P.start = function (w) {
  if (w.pickupOwner) w.bus.offOwner(w.pickupOwner);
  w.pickupOwner = {};
  if (!w.floor.v2) return;
  w.bus.on('kill', (ev) => {
    const e = W.enemyById(w, ev.enemyId);
    if (!e || e.role !== 'threat') return;
    const rng = w.rng.spawn;
    let k = 0;
    for (const [kind, chance] of P.THREAT_DROP) {
      if (!BD.pickups.has(kind) || !rng.chance(chance)) continue;
      P.drop(w, kind, e.x + (k % 2 ? 0.5 : -0.5) * Math.min(1, k), e.y + 0.4 * k);
      k++;
    }
  }, w.pickupOwner);
};

P.update = function (w) {
  const h = w.hero;
  if (!w.pickups.length || h.dead) return;
  for (const p of w.pickups.slice()) {
    if (p.taken) continue;
    const def = BD.pickups.get(p.kind);
    if (M.dist(h.x, h.y, p.x, p.y) > def.touch + h.r) continue;
    if (!def.take(w, p)) continue;
    p.taken = true;
    W.emit(w, 'pickup', { kind: p.kind, x: p.x, y: p.y, value: p.value || 0 });
  }
  w.pickups = w.pickups.filter((p) => !p.taken);
};
