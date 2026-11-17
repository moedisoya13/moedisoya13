// Touch pickups (GDD-V2 §6): things on the floor the hero uses by stepping on them (flask, and
// later halo / holy_stone). Light shards are not these: they are drawn in by the pick-up radius
// (src/core/29_growth.js). A kind registers {id, touch (u from the hero's edge), take(w, p) →
// true if used (false: it stays, e.g. a flask at full HP)}; place one with
// w.pickups.push({id: BD.W.id(w), kind, x, y, value?}). Each use emits `pickup {kind, x, y, value}`.

const C = BD.C;
const M = BD.math;
const W = BD.W;
const P = BD.pickupRt = {};

BD.pickups.register({
  id: 'flask', touch: C.INTERACT.flaskTouch,
  take(w, p) {
    if (w.hero.hp >= w.hero.maxHp) return false; // v1: not picked up at full HP
    W.heal(w, w.mods.flask, 'flask');
    return true;
  },
});

P.update = function (w) {
  const h = w.hero;
  if (!w.pickups.length || h.dead) return;
  for (const p of w.pickups) {
    if (p.taken) continue;
    const def = BD.pickups.get(p.kind);
    if (M.dist(h.x, h.y, p.x, p.y) > def.touch + h.r) continue;
    if (!def.take(w, p)) continue;
    p.taken = true;
    W.emit(w, 'pickup', { kind: p.kind, x: p.x, y: p.y, value: p.value || 0 });
  }
  w.pickups = w.pickups.filter((p) => !p.taken);
};
