// 연참 (combo: tempo) — GDD §5.5. Reference card for stacks, timers, event listeners and the HUD.
// +1 per kill (any source), max 5; +2 swing damage per stack (flat, stage ③).
// Reset only by `timeout`: 4.0 s without a direct hit. Kills and direct hits refill the timer;
// the timer stands still while no spawned enemy is in the room (tick.enemiesAlive == 0).
// Taking the card out at the altar resets with `swap` (card runtime).
// On screen: a timer ring at the hero's feet that empties over the 4 s and flashes red under
// 1 s (decor 'chain_slash_ring', GDD §9.3), an afterglow on the blade at ×5 (decor
// 'combo_afterglow'), the break toast. Slot: "×N" + timer ring.
const K = BD.cardKit;
const M = BD.math;
const LIMIT = 4.0;
const T = { limit: LIMIT, perStack: 2, warn: 1.0 };

BD.cards.register({
  id: 'chain_slash', name: '연참', family: 'combo', unlock: 'base', maxStack: 5, icon: 'chain_slash',
  desc: '적을 처치할 때마다 스택 +1(최대 5). 스택마다 베기 피해 +2. 4초 동안 직접 타격을 못 하면 끊긴다.',
  T,
  init(ctx) { ctx.state.timer = LIMIT; },
  flat(ctx) { return T.perStack * ctx.state.stack; },
  on: {
    kill(ev, ctx) {
      const from = ctx.state.stack;
      ctx.setStack(from + 1, 'gain');
      ctx.state.timer = LIMIT;
      if (from < ctx.def.maxStack && ctx.state.stack === ctx.def.maxStack) ctx.toast(ctx.def.name + ' ×' + ctx.def.maxStack);
    },
    hit(ev, ctx) { if (ev.direct) ctx.state.timer = LIMIT; },
    tick(ev, ctx) {
      if (ev.enemiesAlive <= 0) return;
      ctx.state.timer = Math.max(0, ctx.state.timer - ev.dt);
      if (ctx.state.timer <= 0 && ctx.state.stack > 0) {
        ctx.setStack(0, 'timeout');
        ctx.toast('연참 끊김: 4초 동안 베지 못했다');
      }
    },
  },
  hud(state) { return { text: '×' + state.stack, ring: state.timer / LIMIT, warn: state.stack > 0 && state.timer < T.warn }; },
});

BD.render.decor.register({
  id: 'chain_slash_ring', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'chain_slash');
    if (!c || h.dead || c.state.stack <= 0) return;
    const D = K.draw, p = M.clamp(c.state.timer / LIMIT, 0, 1);
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
      if (c.def.family !== 'combo' || c.state.stack < c.def.maxStack) continue;
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
