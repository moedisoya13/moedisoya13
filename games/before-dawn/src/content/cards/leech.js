// 흡수 (trigger) — GDD §5.3, GDD-V2 §4.4. Every 80th kill (any source) heals 4. A guardian or
// elite kill heals 10 at once instead (it does not also advance the count). Levels: 2 every 70 ·
// 3 heals 5, and at full HP a 5-shard drops instead · 4 every 60 · 5 each heal also bursts 20 in 2.2u.
// On screen: the fallen enemy's ink is drawn into the blade (vfx 'leech_ink') and a green
// "+4" rises over the hero (vfx 'leech_heal'). Slot: a ring filling toward the next heal.
const K = BD.cardKit;
const M = BD.math;
const T = { every: 80, heal: 4, bigHeal: 10 }; // level 1

function proc(ctx, amount) {
  const lv = ctx.lv, h = ctx.hero;
  if (h.hp >= h.maxHp && lv.overflow) BD.growth.drop(ctx.w, h.x, h.y, lv.overflow);
  const got = ctx.heal(amount, 'leech');
  if (got > 0) { ctx.credit(got); K.vfx(ctx, 'leech_heal', { amount: got, life: 0.9 }); }
  if (lv.ring) { K.burst(ctx, h.x, h.y, 2.2, lv.ring); K.vfx(ctx, 'leech_ring', { x: K.r3(h.x), y: K.r3(h.y), life: 0.35 }); }
}

BD.cards.register({
  id: 'leech', name: '흡수', family: 'trigger', unlock: 'base', icon: 'leech',
  desc: '처치 80회마다 HP +4. 수호자·정예 처치는 즉시 HP +10.',
  T,
  levels: [null,
    { text: '처치 80마다 HP +4. 정예·수호자 처치는 HP +10', every: 80, heal: 4, big: 10, overflow: 0, ring: 0 },
    { text: '처치 70마다', every: 70 },
    { text: 'HP +5. HP가 가득이면 대신 빛 조각 5', heal: 5, overflow: 5 },
    { text: '처치 60마다', every: 60 },
    { text: '회복이 터질 때 반경 2.2u 고리에 20 피해', ring: 20 },
  ],
  init(ctx) { ctx.state.kills = 0; },
  on: {
    kill(ev, ctx) {
      K.vfx(ctx, 'leech_ink', { x: ev.x, y: ev.y, life: 0.45 });
      if (ev.guardian || ev.elite) { proc(ctx, ctx.lv.big); return; }
      ctx.state.kills++;
      if (ctx.state.kills >= ctx.lv.every) { ctx.state.kills = 0; proc(ctx, ctx.lv.heal); }
    },
  },
  hud(state, ctx) { return { ring: ctx ? state.kills / ctx.lv.every : 0 }; },
});

BD.render.vfx.register({
  id: 'leech_ring',
  draw(g, v, ev, k) { K.draw.ellipse(g, v, ev.x, ev.y, 0.6 + 1.6 * k, null, K.draw.rgba('#6fe06a', 1 - k), 4); },
});

BD.render.vfx.register({
  id: 'leech_ink',
  draw(g, v, ev, k, w) {
    const h = w.hero;
    for (let i = 0; i < 6; i++) {
      const u = M.clamp(k * 1.25 - i * 0.05, 0, 1), e2 = u * u;
      const wob = Math.sin(u * 7 + i * 1.7) * 0.25 * (1 - u);
      const x = ev.x + (h.x - ev.x) * e2 + wob, y = ev.y + (h.y - ev.y) * e2 - wob;
      const c = v.proj(x, y, 20 + 18 * Math.sin(u * Math.PI) + 10 * u);
      g.beginPath(); g.arc(c[0], c[1], (4.5 - i * 0.5) * (1 - u * 0.6), 0, M.TAU);
      g.fillStyle = 'rgba(10,10,12,' + (0.9 - 0.4 * u) + ')'; g.fill();
    }
  },
});

BD.render.vfx.register({
  id: 'leech_heal',
  draw(g, v, ev, k, w) {
    const h = w.hero, c = v.proj(h.x, h.y, 100 + 26 * k);
    K.draw.text(g, '+' + ev.amount, c[0] + 18, c[1], 22, '#6fe06a', 1 - k * k);
  },
});
