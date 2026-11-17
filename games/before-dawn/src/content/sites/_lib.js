// Shared helpers for sites and tasks (GDD-V2 §4.6, §5.4–5.5). Everything that spawns goes through the
// registries — the floor's horde mix (BD.director.mixes) says which fodder and threats exist — so the
// enemies agent can rename or add kinds without touching this file. What it relies on is listed in
// docs/requests/v2-floors.md.
//
//   BD.places.mix(w)                    the floor's horde mix (rooftop: 'rooftop')
//   BD.places.fodder(w, rng) / threat(w, rng)   a weighted kind from it
//   BD.places.eliteKind(w)              the elite of this floor (§3.6: BD.director.eliteKind, the horde
//                                       mix's elite — the dominant type's threat, a ghoul on undead floors)
//   BD.places.spots(w, x, y, n, r0, r1, rng)   n free floor points r0..r1 u round (x, y), ≥ 0.9u apart
//   BD.places.guard(w, x, y, kinds, o)  enemies standing round a place, dormant until one of their
//                                       group is in the combat window (o: {r0, r1, group, elite: kind})
//   BD.places.warn(w, x, y, kinds, o)   enemies coming out of rift warnings round a point (on screen:
//                                       the 1.2 s warning of GDD-V2 §3.4); o.flags tags them
//   BD.places.shock(w, x, y, r, o)      a shockwave: fodder within r die (their shards drop); with
//                                       o.dmg the others take that much (o.push u of knockback)
//   BD.places.wake(w)                   per tick (siteRt.update): a dormant group wakes together
//   BD.places.count(w, pred)            live enemies + pending warnings whose flags pass pred
const C = BD.C;
const M = BD.math;
const W = BD.W;
const P = BD.places = {};

P.mix = (w) => {
  const id = w.floorN === 6 ? 'rooftop' : w.floor.domType;
  return BD.director.mixes.has(id) ? BD.director.mixes.get(id) : null;
};
function pickW(rng, table) {
  const ks = Object.keys(table || {}).sort();
  if (!ks.length) return null;
  let sum = 0;
  for (const k of ks) sum += table[k];
  let r = rng.next() * sum;
  for (const k of ks) { r -= table[k]; if (r < 0) return k; }
  return ks[ks.length - 1];
}
P.fodder = (w, rng) => { const m = P.mix(w); return m ? pickW(rng, m.fodder) : null; };
P.threat = (w, rng) => { const m = P.mix(w); return m ? pickW(rng, m.threats) || pickW(rng, m.fodder) : null; };
P.eliteKind = (w) => BD.director.eliteKind(w); // §3.6, the enemies' rule (src/core/28_director.js)

P.spots = function (w, x, y, n, r0, r1, rng) {
  const out = [], g = w.grid;
  for (let i = 0; i < n * 30 && out.length < n; i++) {
    const a = rng.range(0, M.TAU), r = rng.range(r0, r1), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const [rx, ry] = BD.nav.resolve(g, px, py, 0.45);
    if (!g.walkable(Math.floor(rx), Math.floor(ry)) || M.dist(rx, ry, px, py) > 0.3) continue;
    if (out.some((q) => M.dist(q[0], q[1], rx, ry) < 0.9)) continue;
    out.push([rx, ry]);
  }
  return out;
};

P.guard = function (w, x, y, kinds, o) {
  o = o || {};
  const rng = w.rng.spawn, list = [];
  const pts = P.spots(w, x, y, kinds.length, o.r0 || 1.6, o.r1 || 3.6, rng);
  kinds.forEach((k, i) => {
    const p = pts[i] || [x, y];
    const elite = !!(o.elite && i === 0);
    const flags = Object.assign({ keep: true, wake: o.group }, o.flags || {}, elite && o.eliteFlags ? o.eliteFlags : {});
    list.push(W.makeEnemy(w, k, p[0], p[1], { via: 'placed', elite, dormant: o.wakeR ? { r: o.wakeR } : { view: true }, flags }));
  });
  return list;
};

P.warn = function (w, x, y, kinds, o) {
  o = o || {};
  const rng = w.rng.spawn, out = [];
  const pts = P.spots(w, x, y, kinds.length, o.r0 || 1.0, o.r1 || 2.6, rng);
  kinds.forEach((k, i) => {
    const p = pts[i] || [x, y];
    out.push(W.spawnAt(w, k, p[0], p[1], { via: 'rift', elite: !!(o.elite && i === 0), flags: Object.assign({}, o.flags || {}) }));
  });
  return out;
};

P.shock = function (w, x, y, r, o) {
  o = o || {};
  for (const e of w.enemies.slice()) {
    if (e.dead || M.dist(e.x, e.y, x, y) > r + e.r) continue;
    if (e.role === 'fodder') { e.lastSource = 'burst'; BD.combat.kill(w, e); continue; }
    if (!o.dmg || e.role === 'object' && o.objects === false) continue;
    const d = M.dist(e.x, e.y, x, y), [nx, ny] = d > 1e-6 ? [(e.x - x) / d, (e.y - y) / d] : [1, 0];
    BD.combat.damage(w, e, o.dmg, { source: 'burst', direct: false, fromX: x, fromY: y });
    if (o.push && !e.dead) BD.combat.knock(w, e, nx, ny, o.push, {});
  }
  if (o.vfx !== false) W.emit(w, 'vfx', { kind: 'shock', x, y, r, life: 0.5 });
};

P.count = function (w, pred) {
  let n = 0;
  for (const e of w.enemies) if (!e.dead && pred(e.flags)) n++;
  for (const r of w.rifts) if (pred((r.opts && r.opts.flags) || {})) n++;
  for (const q of w.queue) if (pred((q.opts && q.opts.flags) || {})) n++;
  return n;
};

// A dormant group (a chest's guards, a chief and his pack) wakes together the first time any of
// them is inside the combat window; guards that were kept from recycling while they waited are no
// longer kept (task targets — flags.target — stay kept).
P.wake = function (w) {
  let groups = null;
  for (const e of w.enemies) {
    if (e.dead || !e.flags.wake) continue; // a member the engine already woke (dormant {view}) still calls its group
    if (BD.view.inView(w, e.x, e.y)) (groups || (groups = new Set())).add(e.flags.wake);
  }
  if (!groups) return;
  for (const e of w.enemies) {
    if (e.dead || !groups.has(e.flags.wake)) continue;
    if (e.dormant) { e.dormant = null; W.emit(w, 'wake', { enemyId: e.id }); }
    if (!e.flags.target) delete e.flags.keep;
    delete e.flags.wake;
  }
};
