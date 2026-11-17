// 화염 (element) — GDD §5.3, §5.6. Every enemy the blade hits is ignited: 3 damage every 0.5 s
// for 3 s (18 in all). The burn rules themselves (spread to enemies within 0.6u each tick,
// 2 s spread immunity after burning out, steam on a wet enemy) are engine status rules
// (ARCHITECTURE §6), shared with the mage's fire zone.
// On screen: red-orange #ff5a2a stripes on every trail (engine, from `element`), flame
// strokes on burning enemies (engine), an ignition flare where the blade lights an enemy
// (vfx 'ignite') and the steam puff + first-time toast when fire meets a wet enemy.
const K = BD.cardKit;
const M = BD.math;

BD.cards.register({
  id: 'flame', name: '화염', family: 'element', element: 'flame', unlock: 'base', icon: 'flame',
  desc: '맞은 적 점화: 0.5초마다 3 피해, 3초(합 18). 불타는 적은 가장자리 0.6u 안의 적에게 불을 옮긴다. 다 탄 적은 2초간 옮겨 붙지 않는다(직접 벤 것은 붙는다).',
  onHit(ctx, e) {
    const was = !!e.statuses.burn;
    if (ctx.status(e, 'burn', { direct: true }) && !was) K.vfx(ctx, 'ignite', { x: K.r3(e.x), y: K.r3(e.y), life: 0.45 });
  },
  on: {
    steam(ev, ctx) { K.steamFeedback(ctx, ev); },
  },
  hud() { return {}; },
});

BD.render.vfx.register({
  id: 'ignite',
  draw(g, v, ev, k) {
    const c = v.proj(ev.x, ev.y, 22), a = 1 - k;
    for (let i = 0; i < 7; i++) {
      const an = -Math.PI / 2 + (i - 3) * 0.38, L = (16 + 12 * (i % 2)) * (0.6 + k);
      const bx = c[0] + Math.cos(an) * 6, by = c[1] + Math.sin(an) * 6;
      K.draw.path(g, [[bx - 5, by], [bx + Math.cos(an) * L, by + Math.sin(an) * L], [bx + 5, by]], true);
      g.fillStyle = K.draw.rgba(i % 2 ? '#ffd24a' : '#ff5a2a', a); g.fill();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    }
  },
});

BD.render.vfx.register({
  id: 'steam_puff',
  draw(g, v, ev, k) {
    const a = 1 - k;
    for (let i = 0; i < 7; i++) {
      const an = (i / 7) * M.TAU + 0.4, d = 0.25 + k * 0.95;
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, 10 + k * 34 + (i % 3) * 6);
      g.beginPath(); g.arc(c[0], c[1], 7 + k * 10 + (i % 2) * 3, 0, M.TAU);
      g.fillStyle = 'rgba(245,245,250,' + 0.75 * a + ')'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(10,10,12,' + 0.45 * a + ')'; g.stroke();
    }
  },
});
