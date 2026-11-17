// 슬라임 (beast) — GDD §6.2 / §6.3. Reference enemy: hop movement, pounce with a circle
// telegraph and a lunge, landing stun, the guardian variant's summon, always wet.
const A = BD.ai;

BD.enemies.register({
  id: 'slime', name: '슬라임', type: 'beast', sprite: 'slime',
  hp: 90, speed: 1.6 / 1.1, dmg: 12, radius: 0.45, cost: 1.5, // tuned: GDD HP 30, dmg 10
  alwaysWet: true, // §6.1: always wet; steam does not dry it
  attacks: { pounce: { name: '덮치기' } },
  T: { hopDist: 1.6, hopEvery: 1.1, hopDur: 0.35, range: 3.0, tgR: 0.9, tgTime: 0.7, jump: 0.25, flat: 0.8, cd: 2.2 },
  guardian: {
    name: '대왕 슬라임',
    create(e, w) { BD.enemyTune.guardian(e, w); e.mem.summoned = 0; },
  },
  create(e, w) {
    e.mem.hopT = A.rng(w).range(0, 1.1);
    e.mem.cd = 0; e.mem.pounces = 0;
  },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T, h = w.hero;
    m.cd -= dt;
    if (e.lunge) { e.state = 'jump'; return; }
    if (m.flatT > 0) {
      m.flatT -= dt; e.state = 'flat';
      if (m.flatT <= 0) A.release(w, e);
      return;
    }
    if (m.windup) {
      m.windupT -= dt;
      if (m.windupT <= T.jump && !m.jumped) { m.jumped = true; A.lunge(w, e, m.tx, m.ty, T.jump); }
      return;
    }
    if (A.canAttack(w, e) && m.cd <= 0 && A.edgeDist(w, e) <= T.range && A.slot(w, e, 'melee')) {
      m.windup = true; m.windupT = T.tgTime; m.jumped = false; m.tx = h.x; m.ty = h.y;
      e.state = 'windup'; e.squash = 1;
      e.face = A.angleToHero(w, e);
      A.telegraph(w, e, {
        shape: 'circle', x: m.tx, y: m.ty, r: T.tgR, time: T.tgTime, attack: 'pounce',
        onFire(w2) {
          m.windup = false; m.flatT = T.flat; m.cd = T.cd; m.pounces++;
          if (e.guardian && m.pounces % 3 === 0 && m.summoned < 6) {
            for (let i = 0; i < 2 && m.summoned < 6; i++) {
              m.summoned++;
              const [x, y] = BD.nav.resolve(w2.grid, e.x + (i ? 0.8 : -0.8), e.y, 0.45);
              BD.W.makeEnemy(w2, 'slime', x, y, { via: 'summon', noAttack: 0.6 });
            }
          }
        },
      });
      return;
    }
    m.hopT -= dt;
    if (m.hopT <= 0) { m.hopT = T.hopEvery; m.hopLeft = T.hopDur; m.hopDir = A.dirToHero(w, e); }
    if (m.hopLeft > 0) {
      m.hopLeft -= dt;
      const sp = (T.hopDist / T.hopDur) * (e.speed / e.def.speed);
      A.move(w, e, m.hopDir[0] * sp * dt, m.hopDir[1] * sp * dt);
      e.face = Math.atan2(m.hopDir[1], m.hopDir[0]);
      e.state = 'hop';
    } else e.state = 'idle';
  },
});
