// Enemy-side hazards: telegraphs (every attack's floor warning), projectiles, zones and
// hitboxes. Hero projectiles (sword wave) share the projectile list.
//
// Telegraph spec: {shape: circle|fan|line|ring, x, y, r, dir, half(deg), len, width, r0, r1,
//   time, dmg, attack, owner (enemy), style ('hatch' default | 'blink' | content style),
//   onFire(w, tg), persist (survive owner's death), noScale,
//   danger (warns of a hit that comes later, e.g. an arrow; implied when dmg > 0)}
// When the fill completes, a hero inside the shape takes dmg (dash i-frames → dodge), then
// onFire runs. Owner-linked shapes scale by owner.tgScale (elite ×1.2, guardian ×1.4).

const C = BD.C;
const M = BD.math;
const W = BD.W;
const Z = BD.hazards = {};

Z.telegraph = function (w, spec) {
  const o = spec.owner || null;
  const tg = Object.assign({ style: 'hatch' }, spec);
  delete tg.owner;
  tg.id = W.id(w);
  tg.ownerId = o ? o.id : null;
  tg.ownerKind = o ? o.kind : spec.ownerKind || null;
  const k = o && !spec.noScale ? o.tgScale : 1;
  for (const f of ['r', 'len', 'width', 'r0', 'r1']) if (tg[f] !== undefined) tg[f] *= k;
  if (tg.dmg > 0 && tg.time < C.ENEMY.minTelegraph) tg.time = C.ENEMY.minTelegraph;
  tg.total = tg.time; tg.remain = tg.time;
  tg.danger = tg.danger || tg.dmg > 0;
  tg.shape = tg.shape || 'circle';
  // GDD-V2 §5.6: a warning whose owner or origin is outside the combat window when it starts is
  // "unseen"; a hit from it counts in w.stats.unseenHits (must stay 0, §10.4 V7)
  tg.unseen = !!(w.grid && ((o && !o.boss && !BD.view.inView(w, o.x, o.y, -0.05)) || (tg.x !== undefined && !BD.view.inView(w, tg.x, tg.y, -0.05))));
  w.telegraphs.push(tg);
  W.emit(w, 'telegraph', { id: tg.id, shape: tg.shape, ownerId: tg.ownerId, ownerKind: tg.ownerKind, attack: tg.attack || null, time: tg.time, style: tg.style });
  return tg;
};

Z.cancelOwned = function (w, ownerId) {
  w.telegraphs = w.telegraphs.filter((t) => t.ownerId !== ownerId || t.persist);
  w.hitboxes = w.hitboxes.filter((h) => h.ownerId !== ownerId);
};

// Remove telegraphs matching filter (boss roar clears everything in progress).
Z.clearTelegraphs = function (w, filter) {
  w.telegraphs = filter ? w.telegraphs.filter((t) => !filter(t)) : [];
};

Z.heroInside = function (w, shape) {
  return M.shapeHits(shape, w.hero.x, w.hero.y, w.hero.r);
};

Z.projectile = function (w, spec) {
  if (spec.hostile === false) { // hero shots: at most CAP.heroShots, the oldest goes (GDD-V2 §3.7)
    const mine = w.projectiles.filter((q) => !q.hostile && !q.dead);
    if (mine.length >= C.CAP.heroShots) mine[0].dead = true;
  } else if (w.projectiles.filter((q) => q.hostile && !q.dead).length >= C.CAP.projectiles) return null;
  const p = Object.assign({ r: 0.15, speed: 12, range: 20, hostile: true, kind: 'bolt', travelled: 0 }, spec);
  const o = spec.owner || null;
  delete p.owner;
  p.id = W.id(w);
  p.ownerId = o ? o.id : null;
  p.ownerKind = o ? o.kind : spec.ownerKind || null;
  p.vx = Math.cos(p.dir) * p.speed; p.vy = Math.sin(p.dir) * p.speed;
  p.hitIds = new Set(spec.skip || []);
  if (!p.hostile && p.pierce === undefined) p.pierce = 1;
  w.projectiles.push(p);
  W.emit(w, 'projectile', { id: p.id, kind: p.kind, hostile: p.hostile, x: M.round(p.x, 3), y: M.round(p.y, 3) });
  return p;
};

// Zone spec: {kind, x, y, r, life, tick, dmg, attack, owner, igniteEnemies, enemyDmg (hero-side zones)}
Z.zone = function (w, spec) {
  const o = spec.owner || null;
  const z = Object.assign({ kind: 'fire', tick: 0.5, life: 2.5, dmg: 0 }, spec);
  delete z.owner;
  z.id = W.id(w);
  z.ownerId = o ? o.id : null;
  z.ownerKind = o ? o.kind : spec.ownerKind || null;
  z.acc = 0; z.n = 0; z.age = 0;
  w.zones.push(z);
  return z;
};

// Hitbox: a short-lived damaging circle (lunges, charges). follow: stays on the owner.
// spec: {owner, r, dmg, attack, life, follow (default true), x, y}
Z.hitbox = function (w, spec) {
  const o = spec.owner;
  const hb = Object.assign({ follow: true, life: 0.2 }, spec);
  delete hb.owner;
  hb.id = W.id(w);
  hb.ownerId = o ? o.id : null;
  hb.ownerKind = o ? o.kind : spec.ownerKind || null;
  hb.done = false;
  if (o && hb.r !== undefined && !spec.noScale) hb.r *= o.tgScale;
  w.hitboxes.push(hb);
  return hb;
};

Z.update = function (w, dt) {
  const h = w.hero;
  // telegraphs
  if (w.telegraphs.length) {
    const fired = [];
    for (const tg of w.telegraphs) { tg.remain -= dt; if (tg.remain <= 1e-9) fired.push(tg); }
    if (fired.length) {
      w.telegraphs = w.telegraphs.filter((t) => t.remain > 1e-9);
      for (const tg of fired) {
        if (tg.dmg > 0 && Z.heroInside(w, tg)) {
          if (tg.unseen && !h.invuln && !h.dashInvuln) w.stats.unseenHits++;
          W.hurtHero(w, tg.dmg, { source: tg.ownerKind || 'zone', owner: tg.ownerKind, attack: tg.attack, enemyId: tg.ownerId, attackId: 'tg' + tg.id, x: tg.x, y: tg.y });
        }
        W.emit(w, 'telegraph_fire', { id: tg.id, attack: tg.attack || null, ownerId: tg.ownerId, ownerKind: tg.ownerKind });
        if (tg.onFire) tg.onFire(w, tg);
      }
    }
  }
  // projectiles
  if (w.projectiles.length) {
    for (const p of w.projectiles) {
      if (p.dead) continue;
      const steps = Math.max(1, Math.ceil((p.speed * dt) / 0.25));
      for (let i = 0; i < steps && !p.dead; i++) {
        const sx = (p.vx * dt) / steps, sy = (p.vy * dt) / steps;
        p.x += sx; p.y += sy; p.travelled += Math.sqrt(sx * sx + sy * sy);
        if (w.grid.blocksShot(Math.floor(p.x), Math.floor(p.y))) { p.dead = true; p.blocked = true; break; }
        if (p.travelled >= p.range) { p.dead = true; break; }
        if (p.hostile && !BD.view.onScreen(w, p.x, p.y, -C.V2.shotOut)) { p.dead = true; break; } // §5.6-3
        if (p.hostile) {
          if (!h.dead && M.dist(p.x, p.y, h.x, h.y) <= p.r + h.r) {
            const landed = W.hurtHero(w, p.dmg, { source: p.ownerKind || 'zone', owner: p.ownerKind, attack: p.attack, enemyId: p.ownerId, attackId: 'p' + p.id, x: p.x - p.vx, y: p.y - p.vy });
            if (landed) p.dead = true;
          }
        } else {
          for (const e of w.enemies) {
            if (e.dead || e.down || p.hitIds.has(e.id)) continue;
            if (M.dist(p.x, p.y, e.x, e.y) > p.r + e.r) continue;
            p.hitIds.add(e.id);
            BD.combat.projectileHit(w, p, e);
            p.pierce--;
            if (p.pierce <= 0) { p.dead = true; break; }
          }
        }
      }
    }
    w.projectiles = w.projectiles.filter((p) => !p.dead);
  }
  // zones
  if (w.zones.length) {
    for (const z of w.zones) {
      z.life -= dt; z.age += dt; z.acc += dt;
      while (z.acc >= z.tick - 1e-9) {
        z.acc -= z.tick; z.n++;
        if (z.dmg > 0 && M.dist(h.x, h.y, z.x, z.y) <= z.r + h.r * 0.5) {
          W.hurtHero(w, z.dmg, { source: 'zone', owner: z.ownerKind, attack: z.attack, enemyId: z.ownerId, attackId: 'z' + z.id + ':' + z.n });
        }
        // a hero-side zone (화염 5단계's fire scar): enemyDmg to every enemy inside, as burn damage
        if (z.enemyDmg > 0) for (const e of w.enemies.slice()) {
          if (!e.dead && !e.down && M.dist(e.x, e.y, z.x, z.y) <= z.r + e.r * 0.5) BD.combat.damage(w, e, z.enemyDmg, { source: 'burn', direct: false });
        }
        if (z.igniteEnemies) for (const e of w.enemies.slice()) {
          if (!e.dead && !e.down && M.dist(e.x, e.y, z.x, z.y) <= z.r + e.r * 0.5) BD.status.apply(w, e, 'burn', { direct: true });
        }
      }
    }
    w.zones = w.zones.filter((z) => z.life > 0);
  }
  // hitboxes
  if (w.hitboxes.length) {
    for (const hb of w.hitboxes) {
      hb.life -= dt;
      if (hb.follow && hb.ownerId !== null) { const o = W.enemyById(w, hb.ownerId); if (o) { hb.x = o.x; hb.y = o.y; } }
      if (!hb.done && M.dist(h.x, h.y, hb.x, hb.y) <= hb.r + h.r) {
        hb.done = true;
        W.hurtHero(w, hb.dmg, { source: hb.ownerKind || 'zone', owner: hb.ownerKind, attack: hb.attack, enemyId: hb.ownerId, attackId: 'h' + hb.id, x: hb.x, y: hb.y });
      }
    }
    w.hitboxes = w.hitboxes.filter((x) => x.life > 0);
  }
};
