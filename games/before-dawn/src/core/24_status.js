// Enemy statuses: burn, wet (and the steam reaction), sunder, bind. GDD §5.3, §5.6, §6.1.
// - burn: 3 dmg every 0.5 s for 3 s; spreads each tick to enemies within 0.6u edge-to-edge;
//   an enemy that burnt out is immune to spread for 2 s (direct ignition still works).
// - wet: 4 s. Fire touching a wet enemy makes steam instead: wet and burn vanish and every
//   enemy within 1.2u takes 8 (once per enemy per second). alwaysWet enemies stay wet.
// - sunder: integer stacks {n}; bind: timer {t}. Their effects are read by cards/behaviours.

const C = BD.C.STATUS;
const W = BD.W;
const S = BD.status = {};
S.NAMES = ['burn', 'wet', 'sunder', 'bind'];

function setOn(w, e, name, val) {
  const had = !!e.statuses[name];
  e.statuses[name] = val;
  if (!had) W.emit(w, 'status', { enemyId: e.id, status: name, on: true });
}

S.remove = function (w, e, name) {
  if (!e.statuses[name]) return;
  if (name === 'wet' && e.def.alwaysWet) return;
  delete e.statuses[name];
  W.emit(w, 'status', { enemyId: e.id, status: name, on: false });
};

// opts: {direct: bool (ignition by a hit; ignores spread immunity), dur, n, source}
// burn (v2, GDD-V2 §4.4 화염): opts.dmg (per tick, default STATUS.burnDmg) and opts.spread (u,
// default STATUS.burnSpread) ride on the burn; a burn that spreads passes both on. One burning
// enemy lights at most STATUS.spreadPerTick others per tick.
S.apply = function (w, e, name, opts) {
  opts = opts || {};
  if (e.dead) return false;
  if (!S.NAMES.includes(name)) BD.fail(`unknown status '${name}'`);
  if (name === 'burn') {
    if (e.statuses.wet) { S.steam(w, e); return false; }
    if (!opts.direct && e.burnImmuneT > 0) return false;
    const cur = e.statuses.burn;
    const dmg = Math.max(opts.dmg || C.burnDmg, cur && !opts.direct ? cur.dmg : 0), spread = opts.spread || C.burnSpread;
    setOn(w, e, 'burn', { t: Math.max(opts.dur || C.burnDur, cur ? cur.t : 0), acc: cur ? cur.acc : 0, dmg, spread: Math.max(spread, cur ? cur.spread : 0) });
    return true;
  }
  if (name === 'wet') {
    if (e.statuses.burn) { S.steam(w, e); if (!e.def.alwaysWet) return false; }
    if (e.def.alwaysWet) return true;
    setOn(w, e, 'wet', { t: opts.dur || C.wetDur });
    return true;
  }
  if (name === 'sunder') {
    const n = Math.min(opts.max || 5, ((e.statuses.sunder && e.statuses.sunder.n) || 0) + (opts.n || 1));
    setOn(w, e, 'sunder', { n });
    return true;
  }
  if (name === 'bind') {
    setOn(w, e, 'bind', { t: Math.max(opts.dur || 0, (e.statuses.bind && e.statuses.bind.t) || 0) });
    return true;
  }
  return false;
};

S.steam = function (w, e) {
  if (w.t < (e.steamReadyT || 0)) {
    // still on cooldown: fire is quenched without a new burst
    S.remove(w, e, 'burn'); S.remove(w, e, 'wet');
    return;
  }
  e.steamReadyT = w.t + C.steamCd;
  S.remove(w, e, 'burn');
  S.remove(w, e, 'wet');
  W.emit(w, 'steam', { x: BD.math.round(e.x, 3), y: BD.math.round(e.y, 3) });
  for (const o of w.enemies.slice()) {
    if (o.dead) continue;
    if (BD.math.dist(o.x, o.y, e.x, e.y) - o.r > C.steamR) continue;
    if (w.t < (o.steamHitT || 0)) continue;
    o.steamHitT = w.t + C.steamCd;
    BD.combat.damage(w, o, C.steamDmg, { source: 'steam', direct: false });
  }
};

S.update = function (w, dt) {
  const list = w.enemies;
  for (const e of list) {
    if (e.dead) continue;
    if (e.burnImmuneT > 0) e.burnImmuneT -= dt;
    const st = e.statuses;
    if (st.wet && st.wet.t !== Infinity) { st.wet.t -= dt; if (st.wet.t <= 0) S.remove(w, e, 'wet'); }
    if (st.bind) { st.bind.t -= dt; if (st.bind.t <= 0) S.remove(w, e, 'bind'); }
    if (st.burn) {
      const b = st.burn;
      b.acc += dt; b.t -= dt;
      while (b.acc >= C.burnTick - 1e-9 && !e.dead) {
        b.acc -= C.burnTick;
        BD.combat.damage(w, e, b.dmg || C.burnDmg, { source: 'burn', direct: false });
      }
      if (!e.dead && b.t <= 1e-9) { S.remove(w, e, 'burn'); e.burnImmuneT = C.burnImmune; }
    }
  }
  // spread (in list order; buckets only skip enemies too far apart to touch)
  let burning = false, maxR = 0, maxS = C.burnSpread;
  for (const e of list) {
    if (e.statuses.burn && !e.dead && !e.down) { burning = true; if (e.statuses.burn.spread > maxS) maxS = e.statuses.burn.spread; }
    if (e.r > maxR) maxR = e.r;
  }
  if (!burning) return;
  const B = BD.nav.buckets(list, 2 * maxR + maxS + 0.01), n0 = list.length;
  for (const e of list) {
    const b = e.statuses.burn;
    if (e.dead || e.down || !b) continue;
    const near = B.near(e.x, e.y);
    for (let i = n0; i < list.length; i++) near.push(i); // anything that appeared during the spread
    let lit = 0;
    for (const oi of near) {
      if (lit >= C.spreadPerTick) break;
      const o = list[oi];
      if (o === e || o.dead || o.statuses.burn || o.burnImmuneT > 0) continue;
      if (BD.math.dist(o.x, o.y, e.x, e.y) - o.r - e.r <= (b.spread || C.burnSpread) && S.apply(w, o, 'burn', { dmg: b.dmg, spread: b.spread })) lit++;
    }
  }
};
