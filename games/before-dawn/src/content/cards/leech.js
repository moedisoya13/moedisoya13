// 흡수 (trigger) — GDD §5.3. Every 4th kill (any source) heals 5. A guardian or elite kill
// heals 10 at once instead (it does not also advance the 4-kill counter).
// On screen: the fallen enemy's ink is drawn into the blade (vfx 'leech_ink') and a green
// "+5" rises over the hero (vfx 'leech_heal'). Slot: pips 0–3 = kills toward the next heal.
const K = BD.cardKit;
const M = BD.math;
const T = { every: 4, heal: 5, bigHeal: 10 };

function heal(ctx, amount, ev) {
  const got = ctx.heal(amount, 'leech');
  if (got > 0) { ctx.credit(got); K.vfx(ctx, 'leech_heal', { amount: got, life: 0.9 }); }
}

BD.cards.register({
  id: 'leech', name: '흡수', family: 'trigger', unlock: 'base', icon: 'leech',
  desc: '처치 4회마다 HP +5. 수호자·정예 처치는 즉시 HP +10.',
  T,
  init(ctx) { ctx.state.kills = 0; },
  on: {
    kill(ev, ctx) {
      K.vfx(ctx, 'leech_ink', { x: ev.x, y: ev.y, life: 0.45 });
      if (ev.guardian || ev.elite) { heal(ctx, T.bigHeal, ev); return; }
      ctx.state.kills++;
      if (ctx.state.kills >= T.every) { ctx.state.kills = 0; heal(ctx, T.heal, ev); }
    },
  },
  hud(state) { return { pips: state.kills }; },
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
