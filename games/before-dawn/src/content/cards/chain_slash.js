// 연참 (combo: tempo) — GDD §5.5, GDD-V2 §4.4. Reference card for stacks, timers, listeners, the HUD.
// Every 10th kill (any source) +1 stack, max 10; +1 swing damage per stack (flat, stage ③).
// Reset only by `timeout`: 2.0 s without a kill. The timer stands still while no enemy is on the
// screen (BD.W.onScreen). Taking the card out at the altar resets with `swap` (card runtime).
// Levels: 2 the timer holds 2.5 s · 3 at 5+ stacks swings come 12 % sooner · 4 +1.5 per stack ·
// 5 max 15; at the top, every kill bursts 5 within 1.2u of where it fell.
// On screen: a timer ring at the hero's feet that empties and flashes red under 1 s (decor
// 'chain_slash_ring', GDD §9.3), an afterglow on the blade at the top (decor 'combo_afterglow'),
// the break toast. Slot: "×N" + timer ring.
const K = BD.cardKit;
const M = BD.math;
const T = { per: 10, limit: 2.0, perStack: 1, warn: 1.0 }; // level 1

const onScreenEnemy = (w) => w.enemies.some((e) => !e.dead && !e.down && BD.W.onScreen(w, e.x, e.y));

BD.cards.register({
  id: 'chain_slash', name: '연참', family: 'combo', unlock: 'base', maxStack: 10, icon: 'chain_slash',
  desc: '처치 10회마다 스택 +1(최대 10). 스택마다 베기 피해 +1. 2초 동안 처치가 없으면 끊긴다.',
  T,
  levels: [null,
    { text: '처치 10마다 스택 +1(최대 10), 스택마다 베기 +1. 2.0초 처치가 없으면 끊긴다', per: 10, limit: 2.0, perStack: 1, haste: 0, burst: 0 },
    { text: '유지 시간 2.5초', limit: 2.5 },
    { text: '스택 5 이상이면 베기 간격 −12%', haste: 0.12 },
    { text: '스택마다 베기 +1.5', perStack: 1.5 },
    { text: '최대 15. 최대 스택에서는 처치 지점마다 반경 1.2u에 5 피해', maxStack: 15, burst: 5 },
  ],
  init(ctx) { ctx.state.timer = ctx.lv.limit; ctx.state.kills = 0; },
  stats(ctx, s) { if (ctx.lv.haste && ctx.state.stack >= 5) s.interval *= 1 - ctx.lv.haste; },
  flat(ctx) { return ctx.lv.perStack * ctx.state.stack; },
  on: {
    kill(ev, ctx) {
      const st = ctx.state, max = BD.cardRt.maxStack(ctx.card);
      st.timer = ctx.lv.limit;
      if (ctx.lv.burst && st.stack >= max) K.burst(ctx, ev.x, ev.y, 1.2, ctx.lv.burst, ev.enemyId);
      if (++st.kills < ctx.lv.per) return;
      st.kills = 0;
      const from = st.stack;
      ctx.setStack(from + 1, 'gain');
      if (from < max && st.stack === max) ctx.toast(ctx.def.name + ' ×' + max);
    },
    tick(ev, ctx) {
      const st = ctx.state;
      if (st.stack <= 0 && st.kills <= 0) { st.timer = ctx.lv.limit; return; }
      if (!onScreenEnemy(ctx.w)) return; // nothing to cut on screen: the timer stands still
      st.timer = Math.max(0, st.timer - ev.dt);
      if (st.timer <= 0) {
        st.kills = 0;
        if (st.stack > 0) { ctx.setStack(0, 'timeout'); ctx.toast('연참 끊김: ' + ctx.lv.limit + '초 동안 처치가 없었다'); }
      }
    },
  },
  hud(state, ctx) {
    const lim = ctx ? ctx.lv.limit : T.limit;
    return { text: '×' + state.stack, ring: state.timer / lim, warn: state.stack > 0 && state.timer < T.warn };
  },
});

BD.render.decor.register({
  id: 'chain_slash_ring', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'chain_slash');
    if (!c || h.dead || c.state.stack <= 0) return;
    const D = K.draw, lim = BD.cardRt.lv(c.def, c.level || 1).limit || T.limit, p = M.clamp(c.state.timer / lim, 0, 1);
    const warn = c.state.timer < T.warn, on = !warn || Math.floor(t * 8) % 2 === 0;
    const col = warn ? '#ff4040' : '#b07ce8';
    D.ellipse(g, v, h.x, h.y, 0.78, null, 'rgba(10,10,12,0.35)', 3);
    if (!on) return;
    const pts = D.arcPts(v, h.x, h.y, 0.78, -Math.PI / 2, -Math.PI / 2 + p * M.TAU, Math.max(2, Math.ceil(48 * p)));
    if (pts.length < 2) return;
    D.path(g, pts);
    g.strokeStyle = 'rgba(10,10,12,0.7)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
  },
});

// GDD §9.3 콤보 최대: "칼에 잔광" — shared by the three combo cards.
BD.render.decor.register({
  id: 'combo_afterglow', target: 'hero_front',
  draw(g, v, h, w, box, t) {
    if (h.dead) return;
    for (const c of BD.cardRt.list(w)) {
      if (c.def.family !== 'combo' || c.state.stack < BD.cardRt.maxStack(c)) continue;
      const a = 0.75 + 0.25 * Math.sin(t * 7);
      K.draw.bladeGlow(g, v, h, '#b07ce8', a, 7);
      const [p0, p1] = K.draw.bladePts(v, h);
      for (let i = 0; i < 4; i++) { // drifting sparks off the blade
        const u = (t * 1.3 + i * 0.25) % 1, x = p0[0] + (p1[0] - p0[0]) * u, y = p0[1] + (p1[1] - p0[1]) * u - 10 * ((t * 2 + i * 0.37) % 1);
        g.beginPath(); g.arc(x, y, 2.4, 0, M.TAU); g.fillStyle = 'rgba(231,210,255,' + a + ')'; g.fill();
      }
      return;
    }
  },
});

BD.render.vfx.register({
  id: 'combo_label',
  draw(g, v, ev, k, w) {
    const h = w.hero, c = v.proj(h.x, h.y, 104 + 30 * k + (ev.row || 0) * 24);
    K.draw.text(g, ev.text, c[0], c[1], 20, '#e7d2ff', k < 0.7 ? 1 : (1 - k) / 0.3);
  },
});
