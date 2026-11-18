// 발도 (trigger) — GDD §5.3, GDD-V2 §4.4. Unlock: 15 dodges in total.
// Every 8u the hero moves readies the blade (v2: the count runs while he swings too; the dash
// distance counts — `tick.moved` includes it). The next swing is charged: every hit of it ×2.5 and
// the blade 0.6u longer (the wave of 검기 flies 0.6u further and keeps the ×2.5). Only the charged
// swing spends the charge; then the count starts again from 0.
// Levels (cumulative, ctx.lv):
//   1 every 8u, ×2.5, blade +0.6u   2 ×3.0   3 every 6u   4 blade +1.0u and the fan +60° (half +30°)
//   5 the charged swing cuts the whole circle around the hero (a full circle at the charged reach)
// On screen: a white arc under the feet that fills with the distance, a full white ring and a white
// blade once ready (decors 'drawcut_feet' / 'drawcut_blade'), a white-hot fan on the charged swing
// (vfx 'drawcut_flash', a full white ring at level 5). Slot: ring = distance / need, glow when ready.
const K = BD.cardKit;
const M = BD.math;
const T = { need: 8, mult: 2.5, reach: 0.6 }; // level 1

const lvOfCard = (c) => BD.cardRt.lv(c.def, c.level || 1);

BD.cards.register({
  id: 'drawcut', name: '발도', family: 'trigger', icon: 'drawcut',
  unlock: (save) => save.counters.dodges >= 15, unlockText: '누적 회피 15',
  desc: '8u 움직일 때마다 준비 완료(베는 중에도 찬다. 돌진 거리 포함). 다음 베기 한 번이 피해 ×2.5, 칼 길이 +0.6u(검기에도 적용).',
  T,
  levels: [null,
    { text: '8u 움직일 때마다 준비(베는 중에도, 돌진 포함). 다음 베기 피해 × 2.5, 칼 길이 +0.6u', need: 8, mult: 2.5, reach: 0.6, half: 0, circle: false },
    { text: '피해 × 3.0', mult: 3.0 },
    { text: '6u마다', need: 6 },
    { text: '칼 길이 +1.0u, 부채꼴 +60°', reach: 1.0, half: 30 },
    { text: '준비된 베기가 원 전체를 벤다', circle: true },
  ],
  init(ctx) { ctx.state.dist = 0; ctx.state.ready = false; },
  stats(ctx, s) { if (ctx.state.ready) { s.charged = true; s.reach += ctx.lv.reach; s.halfArc += ctx.lv.half; } },
  shapes(ctx) {
    if (!ctx.lv.circle || !ctx.swing.charged) return [];
    return [{ kind: 'circle', r: ctx.swing.reach, factor: 1, source: 'slash' }];
  },
  mult(ctx) {
    const sw = ctx.swing, p = sw.data && sw.data.projectile;
    return sw.charged || (p && p.charged) ? ctx.lv.mult : 1;
  },
  on: {
    tick(ev, ctx) {
      const st = ctx.state;
      if (st.ready) return;
      st.dist += ev.moved;
      if (st.dist >= ctx.lv.need - 1e-9) { st.ready = true; K.vfx(ctx, 'drawcut_ready', { life: 0.4 }); }
    },
    swing(ev, ctx) {
      if (ev.charged) K.vfx(ctx, 'drawcut_flash', { x: K.r3(ctx.hero.x), y: K.r3(ctx.hero.y), aim: K.r3(ev.aim), reach: ev.reach, circle: !!ctx.lv.circle, life: 0.3 });
    },
    swing_end(ev, ctx) { if (ctx.state.ready) { ctx.state.dist = 0; ctx.state.ready = false; } },
  },
  hud(state, ctx) { return { ring: M.clamp(state.dist / (ctx ? ctx.lv.need : T.need), 0, 1), glow: !!state.ready }; },
});

BD.render.decor.register({
  id: 'drawcut_feet', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'drawcut');
    if (!c || h.dead) return;
    const D = K.draw, st = c.state, p = M.clamp(st.dist / lvOfCard(c).need, 0, 1);
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
    const span = ev.circle ? Math.PI : 0.9;
    const pts = D.arcPts(v, ev.x, ev.y, ev.reach * 0.98, ev.aim - span, ev.aim + span, ev.circle ? 44 : 20, 16);
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
