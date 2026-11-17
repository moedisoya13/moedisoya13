// Enemy update framework and the helpers behaviours use. A behaviour is the enemy def's
// update(e, w, dt); it runs only when the enemy is active (not frozen, knocked, stunned,
// down). Rules enforced here so content cannot break them:
//   - keep-out: walking/separation never brings an enemy within edgeDist 0.8u of the hero
//     (only lunges via ai.lunge may, GDD §6.1)
//   - concurrent attack caps: melee 3, ranged 2; guardians and the boss are exempt
//   - no attacks during the floor-entry freeze or the 0.6 s after appearing

const C = BD.C;
const M = BD.math;
const W = BD.W;
const A = BD.ai = {};

A.canAttack = (w, e) => e.noAttackT <= 0 && w.freezeT <= 0 && !w.hero.dead;
A.edgeDist = (w, e) => W.edgeDist(w, e);
A.angleToHero = (w, e) => Math.atan2(w.hero.y - e.y, w.hero.x - e.x);
A.rng = (w) => w.rng.ai;
// "Nothing hits from off screen" (big floors): is (x, y) — with a margin of pad u — inside the
// view every client shows this tick (BD.view.rect: deterministic, device-independent).
A.inView = (w, x, y, pad) => BD.view.inView(w, x, y, pad);
A.seen = (w, e) => BD.view.inView(w, e.x, e.y, e.r);

// Attack slots (§6.1 동시 공격 상한). cat: 'melee' | 'ranged'.
A.slot = function (w, e, cat) {
  if (e.guardian || e.boss) return true;
  if (e.slot) return true;
  const cap = cat === 'ranged' ? C.ENEMY.rangedCap : C.ENEMY.meleeCap;
  let n = 0;
  for (const o of w.enemies) if (!o.dead && o.slot === cat) n++;
  if (n >= cap) return false;
  e.slot = cat;
  return true;
};
A.release = function (w, e) { e.slot = null; };

// Move by (dx, dy) with grid collision and the keep-out clamp. Returns distance moved.
A.move = function (w, e, dx, dy) {
  const h = w.hero;
  if (!e.lunging) {
    const ox = e.x - h.x, oy = e.y - h.y, od = Math.sqrt(ox * ox + oy * oy);
    const nd = M.dist(e.x + dx, e.y + dy, h.x, h.y);
    const limit = C.ENEMY.keepOut + e.r;
    if (nd < limit && nd < od && od > 1e-6) {
      // drop the inward radial component; never end up closer than before
      const ux = ox / od, uy = oy / od;
      const radial = dx * ux + dy * uy;
      if (radial < 0) { dx -= radial * ux; dy -= radial * uy; }
      const nd2 = M.dist(e.x + dx, e.y + dy, h.x, h.y);
      if (nd2 < Math.min(limit, od)) { const k = Math.min(limit, od) / Math.max(nd2, 1e-6); dx = h.x + (e.x + dx - h.x) * k - e.x; dy = h.y + (e.y + dy - h.y) * k - e.y; }
    }
  }
  const [x, y] = BD.nav.move(w.grid, e.x, e.y, dx, dy, e.r);
  const d = M.dist(e.x, e.y, x, y);
  e.x = x; e.y = y;
  return d;
};

// Is the straight path from e to (x, y) free of obstacles (for direct steering)?
A.clearPath = function (w, e, x, y) {
  // fast path, same answer: no blocked cell in the box around the segment (rays offset < 1u)
  if (!BD.nav.blockedIn(w.grid, Math.floor(Math.min(e.x, x)) - 1, Math.floor(Math.min(e.y, y)) - 1, Math.floor(Math.max(e.x, x)) + 1, Math.floor(Math.max(e.y, y)) + 1)) return true;
  const dir = Math.atan2(y - e.y, x - e.x), L = M.dist(e.x, e.y, x, y);
  const nx = -Math.sin(dir) * e.r * 0.9, ny = Math.cos(dir) * e.r * 0.9;
  return BD.nav.rayLen(w.grid, e.x + nx, e.y + ny, dir, L) >= L - 1e-6 && BD.nav.rayLen(w.grid, e.x - nx, e.y - ny, dir, L) >= L - 1e-6 && blockFreeVoid(w, e.x, e.y, x, y);
};
function blockFreeVoid(w, x0, y0, x1, y1) {
  const L = M.dist(x0, y0, x1, y1), n = Math.ceil(L / 0.4);
  for (let i = 1; i <= n; i++) { const t = i / n; if (w.grid.get(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)) !== BD.CELL.FLOOR) return false; }
  return true;
}

// Steering direction toward the hero along the distance field (direct when the way is clear).
A.dirToHero = function (w, e) {
  const h = w.hero;
  if (A.clearPath(w, e, h.x, h.y)) return M.norm(h.x - e.x, h.y - e.y);
  const wp = BD.nav.downhill(w.grid, w.field, e.x, e.y);
  if (!wp) return M.norm(h.x - e.x, h.y - e.y);
  return M.norm(wp[0] - e.x, wp[1] - e.y);
};

// Distance field to an arbitrary cell, cached per floor (the FIELD_CACHE most recent targets).
const FIELD_CACHE = 64;
A.fieldTo = function (w, cx, cy) {
  w.fieldCache = w.fieldCache && w.fieldCache.floor === w.floorN ? w.fieldCache : { floor: w.floorN, map: new Map() };
  const key = cy * w.grid.w + cx, map = w.fieldCache.map;
  let f = map.get(key);
  if (f) { map.delete(key); map.set(key, f); return f; } // most recent last
  f = BD.nav.bfs(w.grid, cx, cy);
  map.set(key, f);
  if (map.size > FIELD_CACHE) map.delete(map.keys().next().value); // a big floor has many targets
  return f;
};
A.dirTo = function (w, e, x, y) {
  if (A.clearPath(w, e, x, y)) return M.norm(x - e.x, y - e.y);
  const wp = BD.nav.downhill(w.grid, A.fieldTo(w, Math.floor(x), Math.floor(y)), e.x, e.y);
  return wp ? M.norm(wp[0] - e.x, wp[1] - e.y) : M.norm(x - e.x, y - e.y);
};

// Walk toward the hero until edgeDist ≤ stop (default keep-out). Returns true when there.
A.chase = function (w, e, speed, dt, stop) {
  stop = stop === undefined ? C.ENEMY.keepOut : stop;
  if (A.edgeDist(w, e) <= stop + 0.02) return true;
  const [dx, dy] = A.dirToHero(w, e);
  A.move(w, e, dx * speed * dt, dy * speed * dt);
  e.face = Math.atan2(dy, dx);
  return false;
};
A.goTo = function (w, e, x, y, speed, dt) {
  if (M.dist(e.x, e.y, x, y) < 0.1) return true;
  const [dx, dy] = A.dirTo(w, e, x, y);
  const step = Math.min(speed * dt, M.dist(e.x, e.y, x, y));
  A.move(w, e, dx * step, dy * step);
  e.face = Math.atan2(dy, dx);
  return false;
};
A.flee = function (w, e, speed, dt) {
  const [dx, dy] = M.norm(e.x - w.hero.x, e.y - w.hero.y);
  A.move(w, e, dx * speed * dt, dy * speed * dt);
};
// Keep edgeDist within [min, max]; circle around the hero in between. Returns 'in'|'far'|'near'.
A.keepRange = function (w, e, min, max, speed, dt) {
  const d = A.edgeDist(w, e);
  if (d > max) { A.chase(w, e, speed, dt, max); return 'far'; }
  if (d < min) { A.flee(w, e, speed, dt); return 'near'; }
  return 'in';
};
A.orbit = function (w, e, speed, dt, sign) {
  const a = Math.atan2(e.y - w.hero.y, e.x - w.hero.x) + (sign || 1) * Math.PI / 2;
  A.move(w, e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
};
A.turn = function (e, target, ratePerSec, dt) {
  const d = M.wrap(target - e.face), m = ratePerSec * dt;
  e.face = M.wrap(e.face + Math.max(-m, Math.min(m, d)));
};

// Lunge: move to (x, y) over dur seconds, allowed inside the keep-out ring. Poll e.lunge.
// opts.hitbox: {r, dmg, attack} → damages the hero once on contact during the lunge.
A.lunge = function (w, e, x, y, dur, opts) {
  e.lunge = { fx: e.x, fy: e.y, tx: x, ty: y, t: 0, dur, wall: false };
  e.lunging = true;
  if (opts && opts.hitbox) BD.hazards.hitbox(w, Object.assign({ owner: e, life: dur, x: e.x, y: e.y }, opts.hitbox));
};
A.updateLunge = function (w, e, dt) {
  const L = e.lunge;
  L.t += dt;
  const k = Math.min(1, L.t / L.dur);
  const tx = L.fx + (L.tx - L.fx) * k, ty = L.fy + (L.ty - L.fy) * k;
  const [x, y, hit] = BD.nav.move(w.grid, e.x, e.y, tx - e.x, ty - e.y, e.r);
  e.x = x; e.y = y;
  if (hit) L.wall = true;
  if (k >= 1 || hit) { e.lunging = false; e.lunge = null; e.lastLunge = { wall: L.wall || hit, t: w.t }; }
};

// Telegraph / hazard shorthands bound to the owner.
A.telegraph = (w, e, spec) => BD.hazards.telegraph(w, Object.assign({ owner: e, dmg: e.dmg }, spec));
A.projectile = (w, e, spec) => BD.hazards.projectile(w, Object.assign({ owner: e, dmg: e.dmg, hostile: true, x: e.x, y: e.y }, spec));
A.zone = (w, e, spec) => BD.hazards.zone(w, Object.assign({ owner: e }, spec));
A.hitbox = (w, e, spec) => BD.hazards.hitbox(w, Object.assign({ owner: e, dmg: e.dmg, x: e.x, y: e.y }, spec));

// A random floor cell centre at least minDist from the hero (teleports).
A.randomCell = function (w, minDist, maxDist) {
  const cells = [];
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
    if (!w.grid.walkable(x, y)) continue;
    const d = M.dist(x + 0.5, y + 0.5, w.hero.x, w.hero.y);
    if (d >= minDist && (!maxDist || d <= maxDist)) cells.push([x + 0.5, y + 0.5]);
  }
  return cells.length ? A.rng(w).pick(cells) : null;
};

// Summon kinds at the floor's rifts (each with the rift warning). Returns rift entries.
A.summon = function (w, kinds, opts) {
  const rifts = (opts && opts.rifts) || w.floor.layout.rifts;
  const out = [];
  kinds.forEach((k, i) => {
    const r = rifts[i % rifts.length];
    const j = A.rng(w);
    out.push(W.spawnAt(w, k, r[0] + j.range(-0.4, 0.4), r[1] + j.range(-0.4, 0.4), Object.assign({ via: 'summon' }, opts || {})));
  });
  return out;
};

// Per tick for every enemy.
A.update = function (w, dt) {
  const list = w.enemies.slice();
  for (const e of list) {
    if (e.dead) continue;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.down) {
      e.down.t -= dt;
      if (e.flags.noRevive) { BD.combat.kill(w, e); continue; }
      if (e.down.t <= 0) {
        e.hp = e.down.reviveHp; e.down = null; e.revives++; e.state = 'idle'; e.noAttackT = 0.3;
        W.emit(w, 'revive', { enemyId: e.id });
      }
      continue;
    }
    if (e.knock) { BD.combat.updateKnock(w, e, dt); continue; }
    if (e.lunge) { A.updateLunge(w, e, dt); }
    if (e.stunT > 0) { e.stunT -= dt; e.state = 'stunned'; continue; }
    if (w.freezeT > 0) continue;
    if (e.noAttackT > 0) e.noAttackT -= dt;
    e.def.update(e, w, dt);
    if (e.guardian && e.def.guardian && e.def.guardian.update) e.def.guardian.update(e, w, dt);
  }
  A.separate(w);
};

// Enemies push each other apart (never into the keep-out ring).
// Pairs are visited in the order of the plain i < j loop; buckets (cell 2·max r + SEP_MARGIN, by
// the positions at the start) only skip pairs that cannot touch, so big crowds stay linear.
const SEP_MARGIN = 1.0;
const sepNear = [];
A.separate = function (w) {
  const L = w.enemies;
  let maxR = 0;
  for (const e of L) if (e.r > maxR) maxR = e.r;
  const B = BD.nav.buckets(L, 2 * maxR + SEP_MARGIN), start = L.map((e) => [e.x, e.y]);
  for (let i = 0; i < L.length; i++) {
    const a = L[i];
    if (a.dead || a.down) continue;
    const near = B.near(start[i][0], start[i][1], sepNear);
    for (let q = 0; q < near.length; q++) {
      const j = near[q];
      if (j <= i) continue;
      const b = L[j];
      if (b.dead || b.down) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= rr) continue;
      const push = (rr - d) / 2, nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
      const wa = a.boss ? 0 : b.boss ? 1 : 0.5, wb = 1 - wa;
      if (!a.lunging) A.move(w, a, -nx * push * 2 * wa, -ny * push * 2 * wa);
      if (!b.lunging) A.move(w, b, nx * push * 2 * wb, ny * push * 2 * wb);
    }
  }
};
