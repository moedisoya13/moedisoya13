// Combat: the swing pipeline of GDD §2.3 (① swing … ⑧ swing_end), generic strikes
// (echo, riposte), hero projectiles (sword wave), the damage function, deaths and knockback.

const C = BD.C;
const M = BD.math;
const W = BD.W;
const K = BD.combat = {};

const DIRECT_SOURCES = ['slash', 'pierce', 'whirl', 'wave', 'echo', 'riposte', 'dash'];
const INDIRECT_SOURCES = ['chain', 'burn', 'steam', 'burst', 'slam'];
K.SOURCES = DIRECT_SOURCES.concat(INDIRECT_SOURCES);
K.isDirect = (src) => DIRECT_SOURCES.includes(src);

// Place a strike shape in the world. Shape fields are relative to the strike origin and aim
// unless the shape gives its own x/y/dir. kind: fan|line|circle|ring (+ any kind registered
// in BD.combat.shapeKinds by content).
K.shapeKinds = {
  fan: (s, o) => ({ kind: 'fan', x: s.x !== undefined ? s.x : o.x, y: s.y !== undefined ? s.y : o.y, dir: s.dir !== undefined ? s.dir : o.aim, r: s.r, half: s.half }),
  line: (s, o) => ({ kind: 'line', x: s.x !== undefined ? s.x : o.x, y: s.y !== undefined ? s.y : o.y, dir: s.dir !== undefined ? s.dir : o.aim, len: s.len, width: s.width }),
  circle: (s, o) => ({ kind: 'circle', x: s.x !== undefined ? s.x : o.x, y: s.y !== undefined ? s.y : o.y, r: s.r }),
  ring: (s, o) => ({ kind: 'ring', x: s.x !== undefined ? s.x : o.x, y: s.y !== undefined ? s.y : o.y, r0: s.r0, r1: s.r1 }),
};
K.placeShape = function (s, origin) {
  const f = K.shapeKinds[s.kind];
  if (!f) BD.fail(`unknown strike shape kind '${s.kind}'`);
  const g = f(s, origin);
  g.factor = s.factor === undefined ? 1 : s.factor;
  g.source = s.source || 'slash';
  if (!K.SOURCES.includes(g.source)) BD.fail(`strike shape source '${g.source}' is not a GDD hit source`);
  g.card = s.card || null;
  g.trail = s.trail || null; // optional presentation hints for the renderer
  return g;
};

// ① – ⑧ for one auto-attack swing against `target`.
K.swing = function (w, target) {
  const h = w.hero, s = h.stats;
  const aim = Math.atan2(target.y - h.y, target.x - h.x);
  h.aim = aim; h.aimT = C.HERO.trail + C.HERO.aimHold; h.swingT = C.HERO.trail;
  h.pose = 'slash'; h.poseT = 0.2;
  const sw = {
    id: W.id(w), isSwing: true, x: h.x, y: h.y, aim, primaryId: target.id,
    primaryDist: M.round(W.edgeDist(w, target), 3), reach: s.reach, charged: !!s.charged,
    dmgBase: s.dmgBase, source: 'slash', hits: [], shapes: null, data: {},
  };
  w.lastSwing = sw;
  // ①
  W.emit(w, 'swing', { aim, primaryId: sw.primaryId, primaryDist: sw.primaryDist, reach: sw.reach, charged: sw.charged });
  // ②
  const shapes = [{ kind: 'fan', r: s.reach, half: s.halfArc, factor: 1, source: 'slash' }];
  BD.cardRt.each(w, (card, ctx) => {
    if (!card.def.shapes) return;
    ctx.swing = sw;
    for (const sh of card.def.shapes(ctx) || []) shapes.push(Object.assign({ card: card.id }, sh));
  });
  sw.shapes = shapes.map((x) => K.placeShape(x, sw));
  // ③ – ⑥
  K.resolve(w, sw);
  // ⑦
  BD.cardRt.each(w, (card, ctx) => { if (card.def.afterSwing) { ctx.swing = sw; card.def.afterSwing(ctx); } });
  // ⑧
  W.emit(w, 'swing_end', { hitCount: sw.hits.length, primaryId: sw.primaryId, primaryDist: sw.primaryDist, reach: sw.reach });
  return sw;
};

// A strike that is not an auto-attack swing (echo, riposte …): no swing/swing_end events.
// spec: {x, y, aim, shapes:[{kind, …, factor, source}], factorScale, dmgBase, primaryId}
K.strike = function (w, spec) {
  const h = w.hero;
  const sw = {
    id: W.id(w), isSwing: false, x: spec.x !== undefined ? spec.x : h.x, y: spec.y !== undefined ? spec.y : h.y,
    aim: spec.aim !== undefined ? spec.aim : h.face, primaryId: spec.primaryId || null, primaryDist: 0,
    reach: h.stats.reach, charged: false, dmgBase: spec.dmgBase !== undefined ? spec.dmgBase : h.stats.dmgBase,
    factorScale: spec.factorScale || 1, source: spec.source || 'slash', hits: [], data: {},
  };
  sw.shapes = spec.shapes.map((x) => K.placeShape(Object.assign({ source: sw.source }, x), sw));
  K.resolve(w, sw);
  return sw;
};

// ② hit list → ③ damage → ④ apply + hit → ⑤ elements/onHit → ⑥ deaths.
K.resolve = function (w, sw, forcedHits) {
  const hits = [];
  if (forcedHits) {
    for (const fh of forcedHits) hits.push(fh);
  } else {
    for (const e of w.enemies) {
      if (e.dead) continue;
      let best = null;
      for (const s of sw.shapes) {
        if (!M.shapeHits(s, e.x, e.y, e.r)) continue;
        if (!best || s.factor > best.factor) best = s;
      }
      if (best) hits.push({ e, shape: best, factor: best.factor, source: best.source, card: best.card });
    }
  }
  W.emit(w, 'strike', { source: sw.source, shapes: sw.shapes, x: sw.x, y: sw.y, aim: sw.aim, elements: BD.cardRt.elements(w) });
  w.inStrike = (w.inStrike || 0) + 1;
  for (const hit of hits) {
    const e = hit.e;
    if (e.dead) continue;
    let flat = 0, mult = 1;
    const parts = [];
    BD.cardRt.each(w, (card, ctx) => {
      ctx.swing = sw;
      if (card.def.flat) { const f = card.def.flat(ctx, e) || 0; if (f) { flat += f; parts.push([card, 'flat', f]); } }
      if (card.def.mult) { const m = card.def.mult(ctx, e); if (m !== undefined && m !== 1) { mult *= m; parts.push([card, 'mult', m]); } }
    });
    const raw = (sw.dmgBase + flat) * hit.factor * (sw.factorScale || 1) * mult;
    const dmg = K.damage(w, e, raw, {
      source: hit.source, direct: true, primary: e.id === sw.primaryId, fromX: sw.x, fromY: sw.y, swing: sw,
    });
    hit.dmg = dmg;
    sw.hits.push(hit);
    // contribution credit (result screen): flat share, mult share, shape-only hits
    for (const [card, k, v] of parts) {
      const c = k === 'flat' ? (dmg * v) / (sw.dmgBase + flat) : dmg * (1 - 1 / v);
      BD.cardRt.credit(w, card.id, c);
    }
    if (hit.card && hit.source !== 'slash') BD.cardRt.credit(w, hit.card, dmg);
  }
  // ⑤ elements in order tide → lightning → flame, then other onHit hooks in slot order
  for (const card of BD.cardRt.onHitOrder(w)) {
    const ctx = BD.cardRt.ctx(w, card, sw);
    for (const hit of sw.hits) if (!hit.e.dead) card.def.onHit(ctx, hit.e, hit);
  }
  w.inStrike--;
  // ⑥
  if (!w.inStrike) K.resolveDeaths(w);
  return sw;
};

// The one damage function for hero-side damage. amount is pre-rounding; the enemy's
// defense hook (e.g. a front guard) multiplies it. Fixed damage passes direct:false.
// info: {source, direct, primary, fromX, fromY, swing}
K.damage = function (w, e, amount, info) {
  if (e.dead) return 0;
  if (!K.SOURCES.includes(info.source)) BD.fail(`damage source '${info.source}' is not a GDD hit source`);
  const direct = info.direct !== undefined ? info.direct : K.isDirect(info.source);
  info.direct = direct;
  let m = 1;
  if (e.def.defense) m = e.def.defense(e, w, info);
  const dmg = Math.max(1, Math.round(amount * m));
  e.hp -= dmg;
  e.lastSource = info.source;
  e.hitT = 0.12;
  W.emit(w, 'hit', {
    enemyId: e.id, kind: e.kind, type: e.type, dmg, source: info.source, direct,
    primary: !!info.primary, dist: M.round(W.edgeDist(w, e), 3), x: M.round(e.x, 3), y: M.round(e.y, 3),
  });
  if (!w.inStrike && e.hp <= 0) K.resolveDeath(w, e);
  return dmg;
};

K.resolveDeaths = function (w) {
  for (const e of w.enemies.slice()) if (!e.dead && e.hp <= 0) K.resolveDeath(w, e);
};

// HP ≤ 0: either goes down (revive rule from the enemy def) or dies.
K.resolveDeath = function (w, e) {
  if (e.dead || e.hp > 0) return;
  if (!e.down && e.def.revive && !e.flags.noRevive && !e.statuses.burn) {
    const rv = e.def.revive(e, w);
    if (rv) {
      e.down = { t: rv.delay, reviveHp: rv.hp };
      e.hp = rv.corpseHp;
      e.state = 'down';
      BD.ai.release(w, e);
      BD.hazards.cancelOwned(w, e.id);
      W.emit(w, 'down', { enemyId: e.id });
      return;
    }
  }
  K.kill(w, e);
};

K.kill = function (w, e) {
  if (e.dead) return;
  e.dead = true; e.state = 'dead'; e.hp = 0;
  BD.ai.release(w, e);
  BD.hazards.cancelOwned(w, e.id);
  w.stats.kills++;
  if (e.kind === 'mage') w.stats.mageKills++;
  W.emit(w, 'kill', {
    enemyId: e.id, kind: e.kind, type: e.type, elite: e.elite, guardian: e.guardian, boss: e.boss,
    burning: !!e.statuses.burn, wet: !!e.statuses.wet, source: e.lastSource || 'slash', x: M.round(e.x, 3), y: M.round(e.y, 3),
  });
  if (e.def.onDeath) e.def.onDeath(e, w);
  if (e.elite) BD.flow.dropFlask(w, e.x, e.y);
  if (e.guardian) BD.flow.guardianKilled(w, e);
  if (e.boss) BD.flow.bossKilled(w, e);
};

// Knockback (tide, dash). dist is scaled by the enemy's knockScale (guardian 0.33, boss 0).
// opts.slam: hitting a wall/obstacle deals the fixed slam damage and stuns (§5.3 tide).
K.knock = function (w, e, nx, ny, dist, opts) {
  const d = dist * e.knockScale;
  if (d <= 0 || e.dead) return;
  const T = C.STATUS.knockTime;
  e.knock = { vx: (nx * d) / T, vy: (ny * d) / T, t: T, slam: !!(opts && opts.slam) };
};

K.updateKnock = function (w, e, dt) {
  const k = e.knock;
  const step = Math.min(dt, k.t);
  const [x, y, hit] = BD.nav.move(w.grid, e.x, e.y, k.vx * step, k.vy * step, e.r);
  e.x = x; e.y = y;
  k.t -= dt;
  if (hit && k.slam) {
    e.knock = null;
    W.emit(w, 'slam', { enemyId: e.id, x: M.round(e.x, 3), y: M.round(e.y, 3) });
    e.stunT = Math.max(e.stunT, C.STATUS.slamStun);
    K.damage(w, e, C.STATUS.slamDmg, { source: 'slam', direct: false });
    return;
  }
  if (hit || k.t <= 0) e.knock = null;
};

// Hero projectile (sword wave). spec: {x, y, dir, speed, range, width, factor, pierce, skip:Set, swing, card}
K.heroProjectile = function (w, spec) {
  return BD.hazards.projectile(w, Object.assign({ hostile: false, kind: 'wave', r: (spec.width || 1) / 2, source: 'wave' }, spec));
};

// Called by hazards when a hero projectile overlaps an enemy: runs ③–⑥ for that one hit.
K.projectileHit = function (w, p, e) {
  const sw = {
    id: W.id(w), isSwing: false, x: p.x, y: p.y, aim: p.dir, primaryId: null, primaryDist: 0,
    reach: w.hero.stats.reach, charged: false, dmgBase: p.dmgBase !== undefined ? p.dmgBase : w.hero.stats.dmgBase,
    factorScale: p.factorScale || 1, source: p.source || 'wave', hits: [], shapes: [], data: { projectile: p },
  };
  K.resolve(w, sw, [{ e, shape: null, factor: p.factor === undefined ? 1 : p.factor, source: p.source || 'wave', card: p.card || null }]);
};
