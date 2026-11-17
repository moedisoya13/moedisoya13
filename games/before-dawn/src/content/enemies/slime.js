// 슬라임 (beast threat) — GDD-V2 §3.2. Hops 1.6u every 1.1 s; within 3u of the hero it pounces: a
// circle of radius 0.9 where he stood fills over 0.7 s, it lunges there and lies flat 0.8 s. Always
// wet. **It splits**: where it dies two 새끼 슬라임 appear, stand 0.3 s, and may attack 0.6 s after
// appearing (§5.6-4); slimelets do not split. Guardian 대왕 슬라임 (v1 §6.3): drops two slimes every
// third pounce, six at most; it keeps to the stairs zone + 6u and does not split.
// Fodder (§3.2): 새끼 슬라임 (slime × 0.6) and 마력 슬라임 (magic, slime × 0.75 in violet) share the
// behaviour with their own hop and pounce numbers.
const A = BD.ai;

BD.enemies.register({
  id: 'slime', name: '슬라임', type: 'beast', sprite: 'slime',
  hp: 30, speed: 1.6 / 1.1, dmg: 10, radius: 0.45, cost: 1.5, role: 'threat', shards: 3, // GDD-V2 §3.2 (v1 tuned: 60 HP, 12)
  alwaysWet: true, // §6.1: always wet; steam does not dry it
  attacks: { pounce: { name: '덮치기' } },
  T: { hopDist: 1.6, hopEvery: 1.1, hopDur: 0.35, range: 3.0, tgR: 0.9, tgTime: 0.7, jump: 0.25, flat: 0.8, cd: 2.2, split: 2 },
  guardian: {
    name: '대왕 슬라임',
    create(e) { e.mem.summoned = 0; },
    update(e, w) { BD.foes.clamp(w, e); },
  },
  // §3.2: two slimelets where it died (not the guardian: its death clears the floor)
  onDeath(e, w) { if (!e.guardian) BD.foes.split(w, e, 'slimelet', e.def.T.split); },
  create(e, w) {
    e.mem.hopT = A.rng(w).range(0, 1.1);
    e.mem.cd = 0; e.mem.pounces = 0;
    BD.foes.born(e, w);
  },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T, h = w.hero;
    m.cd -= dt;
    if (m.holdT > 0) { m.holdT -= dt; e.state = 'idle'; return; } // just split off
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
    if (BD.foes.leash(w, e, dt)) return;
    if (A.canAttack(w, e) && m.cd <= 0 && A.edgeDist(w, e) <= T.range && BD.foes.slot(w, e, 'melee')) {
      m.windup = true; m.windupT = T.tgTime; m.jumped = false; m.tx = h.x; m.ty = h.y;
      e.state = 'windup'; e.squash = 1;
      e.face = A.angleToHero(w, e);
      A.telegraph(w, e, {
        shape: 'circle', x: m.tx, y: m.ty, r: T.tgR, time: T.tgTime, attack: 'pounce',
        onFire(w2) {
          m.windup = false; m.flatT = T.flat; m.cd = T.cd; m.pounces++;
          if (e.guardian && m.pounces % 3 === 0 && m.summoned < 6) {
            for (let i = 0; i < 2 && m.summoned < 6 && BD.foes.room(w2) > 0; i++) {
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

// Fodder slimes (GDD-V2 §3.2): the slime's behaviour with their own hop and pounce, always wet.
// 새끼 슬라임 (beast, slime × 0.6) and 마력 슬라임 (magic, slime × 0.75 in violet). Neither splits.
{
  const S0 = BD.enemies.get('slime');
  const variant = (o) => BD.enemies.register(Object.assign({
    sprite: 'slime', variantOf: 'slime', cost: 1, role: 'fodder', shards: 1, alwaysWet: true,
    attacks: { pounce: { name: '덮치기' } }, create: S0.create, update: S0.update,
  }, o));
  variant({ id: 'slimelet', name: '새끼 슬라임', type: 'beast', scale: 0.6, hp: 8, speed: 1.3 / 0.8, dmg: 4, radius: 0.28,
    T: Object.assign({}, S0.T, { hopDist: 1.3, hopEvery: 0.8, hopDur: 0.3, range: 2.0, tgR: 0.6, tgTime: 0.6, flat: 0.5, cd: 2.0, split: 0 }) });
  variant({ id: 'mana_slime', name: '마력 슬라임', type: 'magic', scale: 0.75, tint: 'violet', hp: 12, speed: 1.4 / 0.9, dmg: 4, radius: 0.34,
    T: Object.assign({}, S0.T, { hopDist: 1.4, hopEvery: 0.9, hopDur: 0.32, range: 2.2, tgR: 0.7, tgTime: 0.6, flat: 0.5, cd: 2.0, split: 0 }) });
}

// The split: a short white burst where the slime came apart (the slimelets are the news).
BD.render.vfx.register({
  id: 'slime_split',
  draw(g, v, ev, k) {
    const R = BD.client.render;
    g.globalAlpha = 1 - k;
    R.ellipse(g, v, ev.x, ev.y, 0.25 + 0.6 * k, null, BD.ui.INK, 4);
    R.ellipse(g, v, ev.x, ev.y, 0.25 + 0.6 * k, null, '#ffffff', 2);
    g.globalAlpha = 1;
  },
});
