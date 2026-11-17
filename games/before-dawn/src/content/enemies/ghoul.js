// 구울 (undead threat) — GDD-V2 §3.2 (behaviour v1 §6.2). Walks after the hero without stopping.
// Lunge: within 2.2u a 90° fan of radius 2.0 fills over 0.6 s, hits for 12 and the ghoul leaps 1.5u
// forward. At HP 0 it goes down (`down`); the corpse has HP 20 and rises 2.5 s later with HP 20, once.
// The engine applies the ways to stop it: e.flags.noRevive (holy_light, awakened rest_of_dead),
// cutting the corpse to 0 (it then dies with `kill`), burning when it falls (no `down`).
// Guardian 구울 폭군: rises with 50 % of its maximum HP instead.
// Elite / tier HP multipliers scale the corpse and revive HP by the same factor (maxHp / def.hp).
const A = BD.ai;
const M = BD.math;

const T = {
  range: 2.2, half: 45, tgR: 2.0, tgTime: 0.6, leap: 1.5, leapTime: 0.2, cd: 1.6,
  reviveDelay: 2.5, reviveHp: 20, corpseHp: 20, guardianRevive: 0.5, // revive HP: GDD-V2 §3.2 (+20; v1 tuned 40)
  riseCd: 0.8, // after rising: no lunge for this long (on top of the engine's 0.3 s no-attack)
};

BD.enemies.register({
  id: 'ghoul', name: '구울', type: 'undead', sprite: 'ghoul',
  hp: 70, speed: 2.6, dmg: 18, radius: 0.45, cost: 3, role: 'threat', shards: 4, // GDD-V2 §3.2 (v1 tuned: 120 HP, 2.4 u/s, 14)
  attacks: { lunge: { name: '달려들기' } },
  T,
  guardian: { name: '구울 폭군', update(e, w) { BD.foes.clamp(w, e); } }, // the 50 % rise is read from e.guardian in revive()
  revive(e, w) {
    if (e.revives >= 1) return null;
    const k = e.maxHp / e.def.hp;
    const hp = e.guardian ? Math.round(e.maxHp * T.guardianRevive) : Math.round(T.reviveHp * k);
    BD.W.emit(w, 'vfx', { kind: 'ghoul_down', enemyId: e.id, life: T.reviveDelay + 0.1 }); // corpse timer ring
    return { delay: T.reviveDelay, hp, corpseHp: Math.round(T.corpseHp * k) };
  },
  create(e, w) { e.mem.cd = A.rng(w).range(0.3, 1.0); e.mem.rev = 0; BD.foes.born(e, w); },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T; // variants (husk) bring their own T
    if (m.rev !== e.revives) { // just rose: the lunge in progress when it fell was cancelled
      m.rev = e.revives; m.windup = false; m.cd = T.riseCd; A.release(w, e);
    }
    m.cd -= dt;
    if (e.lunge) { e.state = 'jump'; return; }
    if (m.windup) { e.state = 'windup'; return; }
    if (BD.foes.leash(w, e, dt)) return;
    const ed = A.edgeDist(w, e);
    if (A.canAttack(w, e) && m.cd <= 0 && ed <= T.range && BD.foes.slot(w, e, 'melee')) {
      m.windup = true; e.state = 'windup'; e.squash = 1;
      const dir = A.angleToHero(w, e);
      e.face = dir;
      A.telegraph(w, e, {
        shape: 'fan', x: e.x, y: e.y, dir, half: T.half, r: T.tgR, time: T.tgTime, attack: 'lunge',
        onFire(w2, tg) {
          m.windup = false; m.cd = T.cd;
          const L = T.leap * e.tgScale;
          A.lunge(w2, e, e.x + Math.cos(tg.dir) * L, e.y + Math.sin(tg.dir) * L, T.leapTime);
          A.release(w2, e);
        },
      });
      return;
    }
    e.state = A.chase(w, e, e.speed, dt) ? 'idle' : 'move';
  },
});

// 굶주린 망자 (undead fodder, GDD-V2 §3.2): the ghoul's behaviour with fodder numbers, ghoul × 0.8,
// no revive. Registered here so it shares the ghoul's update.
{
  const G0 = BD.enemies.get('ghoul');
  BD.enemies.register({
    id: 'husk', name: '굶주린 망자', type: 'undead', sprite: 'ghoul', scale: 0.8, tint: 'pale', variantOf: 'ghoul',
    hp: 14, speed: 2.6, dmg: 5, radius: 0.36, cost: 1, role: 'fodder', shards: 1,
    attacks: { lunge: { name: '할퀴기' } },
    T: Object.assign({}, T, { range: 1.4, half: 40, tgR: 1.4, tgTime: 0.6, leap: 0.6, leapTime: 0.15, cd: 2.0 }),
    create: G0.create, update: G0.update,
  });
}

// The fallen body: a grey ring around the corpse that closes clockwise until it rises, so the
// player can see how long is left to finish it (§6.5 "자리를 지키고 시체를 마저 벰").
BD.render.vfx.register({
  id: 'ghoul_down',
  draw(g, v, ev, k, w, t) {
    const e = BD.W.enemyById(w, ev.enemyId);
    if (!e || e.dead || !e.down) return;
    const left = Math.max(0, e.down.t) / T.reviveDelay;
    const R = BD.client.render, r = e.r * 1.35;
    R.ellipse(g, v, e.x, e.y, r, 'rgba(10,10,12,0.28)', BD.ui.INK, 3);
    const pts = [];
    for (let i = 0; i <= 40 * left; i++) { const a = -Math.PI / 2 + (i / 40) * M.TAU; pts.push(v.proj(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)); }
    if (pts.length > 1) {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]);
      g.strokeStyle = left < 0.3 && Math.floor(t * 8) % 2 ? '#ffffff' : '#bdb8ac'; g.lineWidth = 3.5; g.stroke();
    }
    const c = v.proj(e.x, e.y, 34 + Math.sin(t * 6) * 2);
    const s = Math.max(0, e.down.t).toFixed(1);
    g.font = BD.ui.font(15, 800); g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = BD.ui.INK; g.strokeText(s, c[0], c[1]);
    g.fillStyle = '#e8e2d0'; g.fillText(s, c[0], c[1]);
  },
});
