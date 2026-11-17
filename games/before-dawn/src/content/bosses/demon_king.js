// 마왕 (boss) — PLACEHOLDER for the core loop (GDD §14 step 2): an HP block with one attack,
// 휩쓸기 `cleave`. The enemies agent replaces this file with the three-phase boss of §6.4.
const A = BD.ai;

BD.enemies.register({
  id: 'demon_king', name: '마왕', type: 'boss', sprite: 'demon_king',
  hp: 1500, speed: 1.6, dmg: 22, radius: 0.9,
  attacks: { cleave: { name: '휩쓸기' } },
  T: { trigger: 4, half: 70, r: 3.6, time: 0.9, gap: 2.2, stop: 2.0 },
  create(e) { e.mem.cd = 1.5; },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T;
    m.cd -= dt;
    if (m.windup) return;
    if (A.canAttack(w, e) && m.cd <= 0 && A.edgeDist(w, e) <= T.trigger) {
      m.windup = true; e.state = 'windup'; e.squash = 1;
      const dir = A.angleToHero(w, e);
      e.face = dir;
      A.telegraph(w, e, {
        shape: 'fan', x: e.x, y: e.y, dir, half: T.half, r: T.r, time: T.time, attack: 'cleave',
        onFire() { m.windup = false; m.cd = T.gap; },
      });
      return;
    }
    e.state = A.chase(w, e, e.speed, dt, T.stop) ? 'idle' : 'move';
  },
});
