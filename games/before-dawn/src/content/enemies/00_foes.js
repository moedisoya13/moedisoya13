// Rules the GDD-V2 §3 horde shares across enemy kinds (the enemies agent's), and the API the floor
// tasks and sites use to put enemies on a floor. Deterministic and DOM-free; numbers in BD.foes.T.
//
//   BD.foes.born(e, w)                 every threat's create(): an elite's HP by floor (§3.6), its flags
//   BD.foes.slot(w, e, cat)            the attack-slot rule of §3.5: elites, guardians and the boss take
//                                      no slot; threats first — while a threat in view waits for a slot of
//                                      its kind, fodder leave the last one free for it
//   BD.foes.leash(w, e, dt) → bool     a guardian's walk (§3.6): it never leaves its box (the stairs zone
//                                      plus 6u; archer and mage guardians the zone itself). A melee
//                                      guardian whose hero is outside the box walks to the box's nearest
//                                      point and waits there (returns true: skip the kind's walking)
//   BD.foes.clamp(w, e)                after the kind's update: put a guardian back inside its box
//   BD.foes.hitFoes(w, owner, test, dmg, push)   an enemy area attack that also hits enemies (§3.2):
//                                      `foe` damage (indirect; kills drop shards) and an optional push
//   BD.foes.room(w)                    how many enemies may still be made now (§3.7: 110 alive, rifts and
//                                      queued spawns included)
//   BD.foes.spawn(w, kind, x, y, o)    make an enemy for a task or a site: now (o.warn 0 / undefined and
//                                      off screen) or behind a rift warning (o.warn > 0, or inside the view
//                                      — §3.4: what appears in view gets the 1.2 s warning); respects the cap
//   BD.foes.pack(w, x, y, n, o)        n of this floor's fodder around (x, y) (+ o.threats of its threats),
//                                      for chest guards, seal guards, nests; returns the made enemies / rifts
//   BD.foes.eliteKind(w, type)         the elite of a type (§3.6: the dominant threat; undead → ghoul)
//
// Flags tasks may set on an enemy (read by the engine): e.flags.keep (never recycled, survives the floor
// clear), e.flags.marker = 'objective' | 'threat' (edge-of-screen marker and minimap).

const C = BD.C;
const M = BD.math;
const W = BD.W;
const F = BD.foes = {};

F.T = {
  // §3.6: elite HP by floor (1F has none; a 1F or rooftop elite takes the nearest row), dark knight × 1.5
  eliteHp: [0, 160, 160, 220, 300, 380, 380],
  eliteHpMul: { dark_knight: 1.5 },
  leash: 6,           // a guardian follows to this many u outside the stairs zone
  zoneOnly: { skel_archer: true, mage: true }, // these guardians move only inside the zone
  wantFor: 0.25,      // s a threat refused a slot keeps claiming the next free one
  splitHold: 0.3,     // slimelets of a split stand this long before they move (§3.2)
};

// ---- elites (§3.6) ----------------------------------------------------------------------------
F.born = function (e, w) {
  if (!e.elite) return;
  const row = F.T.eliteHp, n = Math.max(1, Math.min(row.length - 1, w.floorN || 1));
  const hp = Math.round(row[n] * (F.T.eliteHpMul[e.kind] || 1) * w.mods.enemyHp);
  e.hp = e.maxHp = hp;
  e.flags.marker = 'threat'; // §5.7: shown at the screen edge while it lives
};
F.eliteKind = function (w, type) { // the horde mix's `elite` (src/content/floors/*.js)
  type = type || (w.floor && w.floor.domType);
  const mx = BD.director.mixes.has(type) ? BD.director.mixes.get(type) : null;
  return (mx && mx.elite) || 'slime';
};

// ---- attack slots (§3.5) --------------------------------------------------------------------------
function waiting(w) {
  if (w._foeWaitT === w.ticks) return w._foeWait;
  const out = { melee: false, ranged: false };
  for (const o of w.enemies) {
    if (o.dead || o.slot || o.role !== 'threat' || !(w.t - (o.wantT === undefined ? -9 : o.wantT) < F.T.wantFor)) continue;
    out[o.wantCat] = true;
  }
  w._foeWaitT = w.ticks; w._foeWait = out;
  return out;
}
function used(w, cat) { let n = 0; for (const o of w.enemies) if (!o.dead && o.slot === cat) n++; return n; }
F.cap = function (w, cat) {
  const row = BD.director.row(w);
  return cat === 'ranged' ? (row ? row.ranged : C.ENEMY.rangedCap) : (row ? row.melee : C.ENEMY.meleeCap);
};
F.slot = function (w, e, cat) {
  if (e.elite || e.guardian || e.boss) return true; // outside the caps (v1)
  if (e.slot) return true;
  if (e.role === 'fodder' && waiting(w)[cat] && used(w, cat) >= F.cap(w, cat) - 1) return false;
  const ok = BD.ai.slot(w, e, cat);
  if (!ok && e.role === 'threat') { e.wantT = w.t; e.wantCat = cat; }
  return ok;
};

// ---- the guardian's box (§3.6) ---------------------------------------------------------------------
F.box = function (w, e) {
  const z = C.V2.floor.zone, at = C.V2.floor.guardianAt;
  const zx = Math.floor(at[0] / z), zy = Math.floor(at[1] / z), L = F.T.zoneOnly[e.kind] ? 0 : F.T.leash;
  const g = w.grid;
  return { x0: Math.max(0, zx * z - L), y0: Math.max(0, zy * z - L), x1: Math.min(g.w, (zx + 1) * z + L), y1: Math.min(g.h, (zy + 1) * z + L) };
};
const boxed = (w) => w.floor && w.floor.v2 && w.floorN <= 5;
F.leash = function (w, e, dt) {
  if (!e.guardian || !boxed(w) || F.T.zoneOnly[e.kind]) return false;
  const b = F.box(w, e), h = w.hero;
  if (h.x >= b.x0 && h.x <= b.x1 && h.y >= b.y0 && h.y <= b.y1) return false;
  if (e.lunge || w.telegraphs.some((t) => t.ownerId === e.id)) return false; // finish what it started
  const m = e.r + 0.1, tx = M.clamp(h.x, b.x0 + m, b.x1 - m), ty = M.clamp(h.y, b.y0 + m, b.y1 - m);
  e.state = BD.ai.goTo(w, e, tx, ty, e.speed, dt) ? 'idle' : 'move';
  if (e.state === 'idle') e.face = BD.ai.angleToHero(w, e);
  return true;
};
F.clamp = function (w, e) {
  if (!e.guardian || !boxed(w)) return;
  const b = F.box(w, e), m = e.r + 0.05;
  const x = M.clamp(e.x, b.x0 + m, b.x1 - m), y = M.clamp(e.y, b.y0 + m, b.y1 - m);
  if (x !== e.x || y !== e.y) { const p = BD.nav.resolve(w.grid, x, y, e.r); e.x = p[0]; e.y = p[1]; }
};
// a cell inside the guardian's box (zone-only guardians), walkable, reachable, in view, ≥ min from the hero
F.boxCells = function (w, e, min) {
  const b = F.box(w, e), h = w.hero, out = [];
  for (let y = Math.ceil(b.y0); y < Math.floor(b.y1); y++) for (let x = Math.ceil(b.x0); x < Math.floor(b.x1); x++) {
    if (!w.grid.walkable(x, y) || (w.field && w.field[y * w.grid.w + x] < 0)) continue;
    const cx = x + 0.5, cy = y + 0.5;
    if (M.dist(cx, cy, h.x, h.y) < min || !W.inView(w, cx, cy, e.r)) continue;
    out.push([cx, cy]);
  }
  return out;
};

// ---- enemy area attacks that hit enemies (§3.2) --------------------------------------------------
// test(o) → true when enemy o is inside; once per call per enemy. Skips the owner, the boss and
// guardians (they are the ones swinging, and a guardian is not a minion). push: u (× knockScale) away
// from `push.from` along `push.dir` when given, else straight away from the owner.
F.hitFoes = function (w, owner, test, dmg, push) {
  let n = 0;
  for (const o of w.enemies.slice()) {
    if (o.dead || o.down || o === owner || o.boss || o.guardian || !test(o)) continue;
    n++;
    if (push && push.dist > 0) {
      let nx, ny;
      if (push.dir !== undefined) { // sideways off a line (a charge): the side the enemy stands on
        const cx = Math.cos(push.dir), cy = Math.sin(push.dir), side = (o.x - push.x) * -cy + (o.y - push.y) * cx;
        nx = -cy * (side >= 0 ? 1 : -1); ny = cx * (side >= 0 ? 1 : -1);
      } else [nx, ny] = M.norm(o.x - owner.x, o.y - owner.y);
      BD.combat.knock(w, o, nx || 1, ny, push.dist);
    }
    BD.combat.damage(w, o, dmg, { source: 'foe', direct: false });
  }
  return n;
};

// ---- making enemies (§3.4, §3.7) ------------------------------------------------------------------
F.room = function (w) {
  let alive = 0;
  for (const e of w.enemies) if (!e.dead) alive++;
  return Math.max(0, C.CAP.enemies - alive - w.rifts.length - w.queue.length);
};
F.spawn = function (w, kind, x, y, o) {
  o = Object.assign({ via: 'task' }, o);
  const warn = o.warn !== undefined ? o.warn : W.onScreen(w, x, y) ? C.WAVES.riftWarn : 0;
  if (warn > 0) return W.spawnAt(w, kind, x, y, Object.assign(o, { warn })); // queues itself at the cap
  if (F.room(w) <= 0) { w.queue.push({ kind, x, y, opts: o }); return null; } // o.flags → e.flags (makeEnemy)
  const [px, py] = BD.nav.resolve(w.grid, x, y, BD.enemies.get(kind).radius);
  return W.makeEnemy(w, kind, px, py, o);
};
// The floor's mix (rooftop: its own), n fodder around (x, y) within 2u, plus o.threats threats.
F.pack = function (w, x, y, n, o) {
  o = o || {};
  const mix = BD.director.mixOf(w), rng = w.rng.spawn, out = [];
  if (!mix) return out;
  const pick = (table) => {
    const ks = Object.keys(table).sort();
    let sum = 0; for (const k of ks) sum += table[k];
    let r = rng.next() * sum;
    for (const k of ks) { r -= table[k]; if (r < 0) return k; }
    return ks[ks.length - 1];
  };
  const list = [];
  for (let i = 0; i < (o.threats || 0) && Object.keys(mix.threats).length; i++) list.push(pick(mix.threats));
  for (let i = 0; i < n; i++) list.push(pick(mix.fodder));
  for (const kind of list) {
    let px = x, py = y;
    for (let t = 0; t < 8; t++) {
      const a = rng.range(0, M.TAU), r = rng.range(0.4, o.r || 2);
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (w.grid.walkable(Math.floor(cx), Math.floor(cy))) { px = cx; py = cy; break; }
    }
    const made = F.spawn(w, kind, px, py, { warn: o.warn, via: o.via, dormant: o.dormant, flags: o.flags });
    if (made) out.push(made);
  }
  return out;
};

// ---- the slime's split (§3.2) -----------------------------------------------------------------------
// Two slimelets where the slime died: they stand F.T.splitHold s, attack 0.6 s after appearing (§5.6-4).
F.split = function (w, e, kind, n) {
  const room = F.room(w);
  for (let i = 0; i < Math.min(n, room); i++) {
    const a = e.face + Math.PI / 2 + i * Math.PI;
    const [x, y] = BD.nav.resolve(w.grid, e.x + Math.cos(a) * 0.35, e.y + Math.sin(a) * 0.35, 0.28);
    const s = W.makeEnemy(w, kind, x, y, { via: 'split', noAttack: C.WAVES.noAttackAfterSpawn });
    s.mem.holdT = F.T.splitHold;
    s.face = a;
  }
  BD.W.emit(w, 'vfx', { kind: 'slime_split', x: M.round(e.x, 3), y: M.round(e.y, 3), life: 0.4 });
};
