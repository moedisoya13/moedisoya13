// 반격 (trigger) — GDD §5.3, §2.4, GDD-V2 §4.4.
// Hurt → 0.15 s later a counter: a circle around the hero at ×2 swing damage (source 'riposte',
// direct; elements apply). A dash that lets an attack pass (`dodge`) → an immediate ×3 counter and
// the dash cooldown is reset. Either counter puts the card on its cooldown; while it is cooling
// down, hurts and dodges do nothing (and the dash is not reset).
// Levels (cumulative, ctx.lv):
//   1 radius 2.6u, ×2 / ×3, cooldown 2.0 s   2 radius 3.2u   3 cooldown 1.2 s   4 ×3 / ×4
//   5 every dash ends in a counter where it stops: radius 2.2u at ×1.5 (no cooldown of its own;
//     the dash's own cooldown paces it)
// On screen: the pauldron flashes (decor 'riposte_flash') and an orange double ring bursts out
// (trail 'riposte'). Slot: ring = cooldown left (the "대기 가림막").
const K = BD.cardKit;
const M = BD.math;
const T = { delay: 0.15, dashR: 2.2, dashScale: 1.5 };

function counter(w, card, r, scale) {
  const ctx = BD.cardRt.ctx(w, card);
  card.state.flashT = w.t;
  ctx.strike({ shapes: [{ kind: 'circle', r, factor: 1, source: 'riposte', card: 'riposte' }], factorScale: scale, source: 'riposte' });
}
function ready(ctx) { return ctx.w.t >= ctx.state.readyAt - 1e-9; }

BD.cards.register({
  id: 'riposte', name: '반격', family: 'trigger', unlock: 'base', icon: 'riposte',
  desc: '피격 0.15초 뒤 반경 2.6u 원형 반격(베기 피해 ×2, 속성 적용). 돌진으로 공격을 흘리면 즉시 ×3 반격 + 돌진 대기 초기화. 반격 재사용 2.0초.',
  T,
  levels: [null,
    { text: '피격 0.15초 뒤 반경 2.6u 반격(× 2). 돌진으로 흘리면 × 3 + 돌진 대기 초기화. 재사용 2.0초', r: 2.6, hurt: 2, dodge: 3, cd: 2.0, dashEnd: false },
    { text: '반경 3.2u', r: 3.2 },
    { text: '재사용 1.2초', cd: 1.2 },
    { text: '배율 × 3 / × 4', hurt: 3, dodge: 4 },
    { text: '모든 돌진이 끝나는 자리에서 반경 2.2u 반격(× 1.5)', dashEnd: true },
  ],
  init(ctx) { ctx.state.readyAt = 0; ctx.state.flashT = -99; ctx.state.dashing = false; },
  on: {
    hurt(ev, ctx) {
      if (!ready(ctx)) return;
      const card = ctx.card, w = ctx.w, floor = w.floorN, lv = ctx.lv;
      ctx.state.readyAt = w.t + lv.cd;
      ctx.after(T.delay, (w2) => {
        if (w2.cards[card.slot] !== card || w2.hero.dead || w2.floorN !== floor) return;
        counter(w2, card, lv.r, lv.hurt);
      });
    },
    dodge(ev, ctx) {
      if (!ready(ctx)) return;
      ctx.state.readyAt = ctx.w.t + ctx.lv.cd;
      counter(ctx.w, ctx.card, ctx.lv.r, ctx.lv.dodge);
      ctx.hero.dashCd = 0;
    },
    // 5단계: the tick after a dash ends (the hero has stepped out of whatever he stopped in)
    tick(ev, ctx) {
      const h = ctx.hero, st = ctx.state, dashing = h.dashT > 0;
      if (st.dashing && !dashing && ctx.lv.dashEnd && !h.dead) counter(ctx.w, ctx.card, T.dashR, T.dashScale);
      st.dashing = dashing;
    },
  },
  hud(state, ctx) { return { ring: M.clamp((state.readyAt - ctx.w.t) / ctx.lv.cd, 0, 1) }; },
});

BD.render.trails.register({
  id: 'riposte',
  draw(g, v, s, k, tr, w) {
    const D = K.draw, a = 1 - k, grow = 0.55 + 0.45 * Math.min(1, k * 3);
    D.stroke(g, D.arcPts(v, s.x, s.y, s.r * grow, 0, M.TAU, 44, 10), a, 9, tr.elements, { rim: D.rim(w) });
    D.stroke(g, D.arcPts(v, s.x, s.y, s.r * grow * 0.62, 0.4, M.TAU + 0.4, 36, 14), a * 0.8, 4, tr.elements, { rim: D.rim(w), highlight: false });
    // radial cuts
    const c = v.proj(s.x, s.y, 12);
    g.strokeStyle = D.rgba(K.ORANGE, a); g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * M.TAU, r0 = s.r * grow * 0.7, r1 = s.r * grow * 1.05;
      g.beginPath();
      g.moveTo(c[0] + Math.cos(an) * r0 * 56.57, c[1] + Math.sin(an) * r0 * 28.28);
      g.lineTo(c[0] + Math.cos(an) * r1 * 56.57, c[1] + Math.sin(an) * r1 * 28.28);
      g.stroke();
    }
    g.lineCap = 'butt';
  },
});

BD.render.decor.register({
  id: 'riposte_flash', target: 'hero_front',
  draw(g, v, h, w, box) {
    const c = BD.cardRt.get(w, 'riposte');
    if (!c) return;
    const age = w.t - c.state.flashT;
    if (age < 0 || age > 0.4) return;
    const a = 1 - age / 0.4, grow = 0.7 + 0.6 * (1 - a);
    const sx = box.x + (box.flip ? 10 : -10), sy = box.top + (box.y - box.top) * 0.28;
    g.save(); g.translate(sx, sy);
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * M.TAU, L = (i % 2 ? 14 : 30) * grow;
      K.draw.path(g, [[Math.cos(an + 0.22) * 4, Math.sin(an + 0.22) * 4], [Math.cos(an) * L, Math.sin(an) * L], [Math.cos(an - 0.22) * 4, Math.sin(an - 0.22) * 4]], true);
      g.fillStyle = K.draw.rgba(i % 2 ? K.ORANGE : '#ffffff', a); g.fill();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    }
    g.beginPath(); g.arc(0, 0, 9, 0, M.TAU); g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.fill();
    g.lineWidth = 3; g.strokeStyle = K.draw.rgba(K.ORANGE, a); g.stroke();
    g.restore();
  },
});
