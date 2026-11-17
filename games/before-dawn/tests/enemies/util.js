// Shared set-up for the enemy tests (not a test file itself: tools/test.js runs *.test.js).
'use strict';

// A run on `floor` with every enemy and wave removed and an empty W×H floor (no obstacles),
// the hero idle in the middle. Returns {BD, H, w}.
function arena(t, o) {
  o = o || {};
  const BD = t.load(o.extraFiles ? { extraFiles: o.extraFiles } : undefined);
  const H = BD.harness();
  H.start({ seed: o.seed || 7, hand: o.hand || [], floor: o.floor || 2, tier: o.tier || 0 });
  const w = H.world();
  H.killAll(); w.wave.n = 3; w.freezeT = 0;
  if (o.grid !== false) {
    const W = o.w || 14, Hh = o.h || 14;
    w.grid = o.cells ? BD.Grid.fromString(W, Hh, o.cells) : BD.Grid(W, Hh);
    w.field = null; w.fieldCell = -1; w.fieldCache = null;
  }
  w.hero.x = o.hx !== undefined ? o.hx : w.grid.w / 2; w.hero.y = o.hy !== undefined ? o.hy : w.grid.h / 2;
  w.hero.atkTimer = 0;
  if (o.noAttack) { w.hero.atkTimer = 1e9; }
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
}

// Keep the hero from swinging (tests that watch an enemy without killing it).
function pacify(w) { w.hero.atkTimer = 1e9; }

// Step until pred(w) is true or `max` ticks pass. Returns ticks stepped (or -1).
function until(H, pred, max) {
  const w = H.world();
  for (let i = 0; i < (max || 600); i++) { if (pred(w)) return i; H.step(1); }
  return pred(w) ? (max || 600) : -1;
}

// Events of `type` since index `from` of the bus log.
function evs(w, type, from) {
  const n = w.bus.count() - (from || 0);
  return w.bus.recent(Math.min(n, 4000)).filter((e) => !type || e.type === type);
}

// Count living enemies of a kind.
function living(w, kind) { return w.enemies.filter((e) => !e.dead && (!kind || e.kind === kind)).length; }

module.exports = { arena, pacify, until, evs, living };
