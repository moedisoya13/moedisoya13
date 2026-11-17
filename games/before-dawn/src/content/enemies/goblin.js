// 고블린 (beast) — GDD §6.2 / §6.3. Reference enemy: fast surround movement (spreads around
// the hero by bearing), stab with a fan telegraph, retreat, the guardian's rift summon.
const A = BD.ai;
const M = BD.math;

BD.enemies.register({
  id: 'goblin', name: '고블린', type: 'beast', sprite: 'goblin',
  // GDD-V2 §3.2 fodder: HP 10, 3.2 u/s (slower than the hero), 4, r 0.32, stab warning 0.6 s
  // (v1 tuned: HP 40, 4.5 u/s, 7, r 0.35, 0.45 s)
  hp: 10, speed: 3.2, dmg: 4, radius: 0.32, cost: 1, role: 'fodder', shards: 1,
  attacks: { stab: { name: '찌르기' } },
  T: { range: 1.0, half: 30, tgR: 1.3, tgTime: 0.6, backDist: 1.2, backTime: 0.3, cd: 1.6, ring: 0.95, chaseFar: 3.0 },
  guardian: {
    name: '고블린 족장',
    create(e) { e.mem.summonT = 12; },
    update(e, w, dt) {
      e.mem.summonT -= dt;
      if (e.mem.summonT <= 0) { e.mem.summonT = 12; A.summon(w, ['goblin', 'goblin', 'goblin']); }
    },
  },
  create(e, w) { e.mem.cd = A.rng(w).range(0, 1); },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T, h = w.hero;
    m.cd -= dt;
    if (m.backT > 0) {
      m.backT -= dt;
      A.flee(w, e, T.backDist / T.backTime, dt);
      e.state = 'retreat';
      if (m.backT <= 0) A.release(w, e);
      return;
    }
    if (m.windup) return;
    const ed = A.edgeDist(w, e);
    if (A.canAttack(w, e) && m.cd <= 0 && ed <= T.range && A.slot(w, e, 'melee')) {
      m.windup = true; e.state = 'windup'; e.squash = 1;
      const dir = A.angleToHero(w, e);
      e.face = dir;
      A.telegraph(w, e, {
        shape: 'fan', x: e.x, y: e.y, dir, half: T.half, r: T.tgR, time: T.tgTime, attack: 'stab',
        onFire() { m.windup = false; m.backT = T.backTime; m.cd = T.cd; },
      });
      return;
    }
    if (ed > T.chaseFar) { A.chase(w, e, e.speed, dt); e.state = 'move'; return; }
    // surround: push our bearing away from nearby goblins' bearings
    let b = Math.atan2(e.y - h.y, e.x - h.x);
    for (const o of w.enemies) {
      if (o === e || o.dead || o.down || o.def.update !== e.def.update || A.edgeDist(w, o) > 4) continue; // goblins and squires
      const db = M.wrap(b - Math.atan2(o.y - h.y, o.x - h.x));
      if (Math.abs(db) < 0.9) b += (db === 0 ? (e.id < o.id ? 1 : -1) : Math.sign(db)) * (0.9 - Math.abs(db)) * 0.5;
    }
    const tx = h.x + Math.cos(b) * (T.ring + e.r), ty = h.y + Math.sin(b) * (T.ring + e.r);
    if (A.goTo(w, e, tx, ty, e.speed, dt)) e.state = 'idle';
    else e.state = 'move';
    if (ed < 1.5) e.face = A.angleToHero(w, e);
  },
});

// 고블린 병졸 (heavy fodder, GDD-V2 §3.2): the goblin's behaviour, goblin × 1.1 in steel, no front guard.
{
  const G0 = BD.enemies.get('goblin');
  BD.enemies.register({
    id: 'squire', name: '고블린 병졸', type: 'heavy', sprite: 'goblin', scale: 1.1, tint: 'steel', variantOf: 'goblin',
    hp: 18, speed: 2.8, dmg: 5, radius: 0.36, cost: 1, role: 'fodder', shards: 1,
    attacks: { stab: { name: '찌르기' } },
    T: Object.assign({}, G0.T), create: G0.create, update: G0.update,
  });
}
