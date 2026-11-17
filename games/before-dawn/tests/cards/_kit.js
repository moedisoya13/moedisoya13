// Helpers for tests/cards (not a test file itself: tools/test.js only runs *.test.js).
'use strict';

const STANDINS = 'tests/cards/standin_enemies.js';

// A fresh run on `floor` with no waves, an open room (obstacles cleared), the hero in the
// middle and the given cards in slots 0..2.
function world(t, o) {
  o = o || {};
  const BD = t.load({ extraFiles: [STANDINS].concat(o.extraFiles || []) });
  const H = BD.harness();
  H.start({ seed: o.seed || 5, hand: [], floor: o.floor || 1 });
  const w = H.world();
  H.killAll(); w.wave.n = 3; w.freezeT = 0;
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) if (w.grid.get(x, y) === BD.CELL.SOLID) w.grid.set(x, y, BD.CELL.FLOOR);
  w.field = null;
  (o.hand || []).forEach((id, i) => H.give(id, i));
  w.hero.x = Math.floor(w.grid.w / 2) + 0.5; w.hero.y = Math.floor(w.grid.h / 2) + 0.5;
  w.hero.face = 0;
  H.input({ mx: 0, my: 0 });
  w.bus.recentAll = () => w.bus.recent(4000);
  return { BD, H, w };
}

// An inert enemy (stunned for ever) at an offset from the hero. opts: hp, face ('hero'), elite, guardian.
function place(BD, w, kind, dx, dy, opts) {
  opts = opts || {};
  const e = BD.W.makeEnemy(w, kind, w.hero.x + dx, w.hero.y + dy, { elite: opts.elite, guardian: opts.guardian });
  if (opts.hp !== undefined) { e.hp = opts.hp; e.maxHp = Math.max(e.maxHp, opts.hp); }
  e.stunT = 1e9;
  e.face = Math.atan2(w.hero.y - e.y, w.hero.x - e.x);
  return e;
}

const evs = (w, type, pred) => w.bus.recent(4000).filter((e) => e.event === type && (!pred || pred(e)));
const hitsOn = (w, e, source) => evs(w, 'hit', (h) => h.enemyId === e.id && (!source || h.source === source));

// Step until fn() is true (max n ticks). Returns ticks used, or -1.
function until(H, fn, n) {
  for (let i = 0; i < (n || 600); i++) { if (fn()) return i; H.step(1); }
  return fn() ? n : -1;
}

// Make the hero swing exactly once at the nearest enemy now (atkTimer 0) and not again soon.
function swingOnce(BD, H, w) {
  w.hero.atkTimer = 0;
  const n0 = w.bus.counts().swing || 0;
  H.step(1);
  w.hero.atkTimer = 99;
  return (w.bus.counts().swing || 0) - n0;
}

module.exports = { STANDINS, world, place, evs, hitsOn, until, swingOnce };
