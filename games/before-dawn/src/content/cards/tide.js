// 해류 (element) — GDD §5.3, §5.6. Unlock: 150 kills in total.
// Every enemy the blade hits is pushed 1.2u straight away from the hero and is wet for 4 s.
// The push is scaled by the enemy's knockScale (heavy 0.33 → 0.4u, guardian ≤ 0.33 → 0.4u,
// boss 0 → none; engine and enemy defs). An enemy pushed into a wall or obstacle takes 8 and
// is stunned 0.5 s (engine `slam`). Wet enemies turn fire into steam and strengthen 뇌전.
// On screen: blue #3aa0ff stripes on every trail (engine), a splash where the wave of water
// hits (vfx 'splash'), a water mark under wet enemies (engine), the steam puff.
const K = BD.cardKit;
const M = BD.math;
const T = { push: 1.2, wet: 4 };

BD.cards.register({
  id: 'tide', name: '해류', family: 'element', element: 'tide', icon: 'tide',
  unlock: (save) => save.counters.kills >= 150,
  desc: '맞은 적을 용사 반대쪽으로 1.2u 밀고(중갑 0.4u, 수호자 0.4u, 마왕 0) 4초간 젖음. 밀린 적이 벽·장애물에 부딪히면 8 피해와 0.5초 기절.',
  T,
  onHit(ctx, e) {
    const h = ctx.hero;
    let [nx, ny] = M.norm(e.x - h.x, e.y - h.y);
    if (!nx && !ny) { nx = Math.cos(ctx.swing.aim); ny = Math.sin(ctx.swing.aim); }
    if (!e.down && e.hp > 0) ctx.knock(e, nx, ny, T.push, { slam: true });
    ctx.status(e, 'wet', { dur: T.wet });
    K.vfx(ctx, 'splash', { x: K.r3(e.x), y: K.r3(e.y), dir: K.r3(Math.atan2(ny, nx)), life: 0.4 });
  },
  on: {
    steam(ev, ctx) { K.steamFeedback(ctx, ev); },
  },
  hud() { return {}; },
});

BD.render.vfx.register({
  id: 'splash',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    // a crest of water thrown along the push, then droplets
    const arc = D.arcPts(v, ev.x, ev.y, 0.45 + 0.5 * k, ev.dir - 1.0, ev.dir + 1.0, 10, 12 + 10 * (1 - k));
    D.path(g, arc);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = D.rgba('#3aa0ff', a); g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = 'rgba(220,240,255,' + a + ')'; g.lineWidth = 1.5; g.stroke();
    g.lineCap = 'butt';
    for (let i = 0; i < 6; i++) {
      const an = ev.dir + (i - 2.5) * 0.4, d = 0.3 + k * (0.7 + (i % 3) * 0.2);
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, 10 + 30 * k * (1 - k) * 4);
      g.beginPath(); g.arc(c[0], c[1], 3.2 * a + 1, 0, M.TAU);
      g.fillStyle = D.rgba('#3aa0ff', a); g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    }
  },
});
