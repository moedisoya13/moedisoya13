// 고블린 (beast) — GDD §6.2 / §6.3. Reference enemy: fast surround movement (spreads around
// the hero by bearing), stab with a fan telegraph, retreat, the guardian's rift summon.
const A = BD.ai;
const M = BD.math;

BD.enemies.register({
  id: 'goblin', name: '고블린', type: 'beast', sprite: 'goblin',
  hp: 60, speed: 4.5, dmg: 7, radius: 0.35, cost: 1, // tuned: GDD HP 20, dmg 6
  attacks: { stab: { name: '찌르기' } },
  T: { range: 1.0, half: 30, tgR: 1.3, tgTime: 0.45, backDist: 1.2, backTime: 0.3, cd: 1.6, ring: 0.95, chaseFar: 3.0 },
  guardian: {
    name: '고블린 족장',
    create(e, w) { BD.enemyTune.guardian(e, w); e.mem.summonT = 12; },
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
      if (o === e || o.dead || o.down || o.kind !== 'goblin' || A.edgeDist(w, o) > 4) continue;
      const db = M.wrap(b - Math.atan2(o.y - h.y, o.x - h.x));
      if (Math.abs(db) < 0.9) b += (db === 0 ? (e.id < o.id ? 1 : -1) : Math.sign(db)) * (0.9 - Math.abs(db)) * 0.5;
    }
    const tx = h.x + Math.cos(b) * (T.ring + e.r), ty = h.y + Math.sin(b) * (T.ring + e.r);
    if (A.goTo(w, e, tx, ty, e.speed, dt)) e.state = 'idle';
    else e.state = 'move';
    if (ed < 1.5) e.face = A.angleToHero(w, e);
  },
});
