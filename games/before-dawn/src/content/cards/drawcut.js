// 발도 (trigger) — GDD §5.3. Unlock: 15 dodges in total.
// After the last swing, moving 3.0u without swinging (dash distance counts — `tick.moved`
// includes it) readies the blade. The next swing is charged: every hit of it ×2.5 and the
// blade 0.6u longer (the wave of 검기 flies 0.6u further and keeps the ×2.5). Any swing spends
// the charge and restarts the count.
// On screen: a white arc under the feet that fills with the distance, a full white ring and
// a white blade once ready (decor 'drawcut'), a white-hot fan on the charged swing (vfx
// 'drawcut_flash'). Slot: ring = distance / 3.0, glow when ready.
const K = BD.cardKit;
const M = BD.math;
const T = { need: 3.0, mult: 2.5, reach: 0.6 };

BD.cards.register({
  id: 'drawcut', name: '발도', family: 'trigger', icon: 'drawcut',
  unlock: (save) => save.counters.dodges >= 15,
  desc: '마지막 베기 뒤 베지 않고 3.0u 이상 움직이면 준비 완료. 다음 베기 한 번이 피해 ×2.5, 칼 길이 +0.6u(검기에도 적용). 돌진 거리도 센다.',
  T,
  init(ctx) { ctx.state.dist = 0; ctx.state.ready = false; },
  stats(ctx, s) { if (ctx.state.ready) { s.charged = true; s.reach += T.reach; } },
  mult(ctx) {
    const sw = ctx.swing, p = sw.data && sw.data.projectile;
    return sw.charged || (p && p.charged) ? T.mult : 1;
  },
  on: {
    tick(ev, ctx) {
      const st = ctx.state;
      if (st.ready) return;
      st.dist += ev.moved;
      if (st.dist >= T.need - 1e-9) { st.ready = true; K.vfx(ctx, 'drawcut_ready', { life: 0.4 }); }
    },
    swing(ev, ctx) {
      if (ev.charged) K.vfx(ctx, 'drawcut_flash', { x: K.r3(ctx.hero.x), y: K.r3(ctx.hero.y), aim: K.r3(ev.aim), reach: ev.reach, life: 0.3 });
    },
    swing_end(ev, ctx) { ctx.state.dist = 0; ctx.state.ready = false; },
  },
  hud(state) { return { ring: M.clamp(state.dist / T.need, 0, 1), glow: !!state.ready }; },
});

BD.render.decor.register({
  id: 'drawcut_feet', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'drawcut');
    if (!c || h.dead) return;
    const D = K.draw, st = c.state, p = M.clamp(st.dist / T.need, 0, 1);
    if (st.ready) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 10);
      D.ellipse(g, v, h.x, h.y, 0.62, 'rgba(255,255,255,' + 0.10 * pulse + ')', 'rgba(10,10,12,0.7)', 4.5);
      D.ellipse(g, v, h.x, h.y, 0.62, null, 'rgba(255,255,255,' + pulse + ')', 2.5);
      // the white line at the feet, across the facing
      const f = h.face + Math.PI / 2, a = v.proj(h.x + Math.cos(f) * 0.55, h.y + Math.sin(f) * 0.55), b = v.proj(h.x - Math.cos(f) * 0.55, h.y - Math.sin(f) * 0.55);
      g.strokeStyle = 'rgba(255,255,255,' + pulse + ')'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    } else if (p > 0.02) {
      const pts = D.arcPts(v, h.x, h.y, 0.62, -Math.PI / 2, -Math.PI / 2 + p * M.TAU, Math.max(2, Math.ceil(40 * p)));
      D.path(g, pts);
      g.strokeStyle = 'rgba(10,10,12,0.6)'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.stroke();
    }
  },
});
BD.render.decor.register({
  id: 'drawcut_blade', target: 'hero_front',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'drawcut');
    if (!c || !c.state.ready || h.dead) return;
    K.draw.bladeGlow(g, v, h, '#ffffff', 0.7 + 0.3 * Math.sin(t * 12), 5);
  },
});

BD.render.vfx.register({ id: 'drawcut_ready', draw() {} }); // presentation hook (sound: charge_ready)
BD.render.vfx.register({
  id: 'drawcut_flash',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    const pts = D.arcPts(v, ev.x, ev.y, ev.reach * 0.98, ev.aim - 0.9, ev.aim + 0.9, 20, 16);
    D.path(g, pts);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,12,' + 0.7 * a + ')'; g.lineWidth = 14; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = D.rgba(K.ORANGE, a); g.lineWidth = 2; g.stroke();
    // a flash streak along the aim
    const s0 = v.proj(ev.x, ev.y, 20), s1 = v.proj(ev.x + Math.cos(ev.aim) * ev.reach * 1.25, ev.y + Math.sin(ev.aim) * ev.reach * 1.25, 20);
    g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 3; g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke();
    g.lineCap = 'butt';
  },
});
