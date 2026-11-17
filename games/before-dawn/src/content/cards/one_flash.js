// 일섬 (combo: spacing) — GDD §5.5. Unlock: any combo card at its max stack once.
// On each swing, by the target's edge distance d against this swing's reach R:
//   R − 0.7 ≤ d ≤ R (the blade tip) → +1 · d < 0.7 (inside the guard) → reset `too_close` ·
//   in between, or beyond R (a wave target) → no change. Max 8. Taking it out → `swap`.
// Stages: +1 swing damage per stack · ≥ 4 the swing gains a pierce line (none added when 관통 is
// equipped — no change) · 8 the pierce line, 관통's included, becomes 6.0u × 1.4u (pierce.js
// reads K.pierceSize). The stack is updated at ①, before the shapes of the same swing.
// On screen: the tip zone as a pale orange band around the hero while equipped (decor
// 'one_flash_band', GDD §5.5), the thrust trail of its pierce line, stage labels "관통" /
// "관통↑", the ×8 afterglow, the toast "일섬 흐트러짐: 품을 내줬다". Slot: "×N" + badge.
const K = BD.cardKit;
const M = BD.math;
const T = { tip: 0.7, guard: 0.7, pierceAt: 4, bigAt: 8 };
const eps = 1e-6;

BD.cards.register({
  id: 'one_flash', name: '일섬', family: 'combo', maxStack: 8, icon: 'one_flash',
  unlock: (save) => save.counters.comboMaxed >= 1,
  desc: '베기의 표적이 칼끝 구간(칼 길이 −0.7u ~ 칼 길이)에 있으면 +1(최대 8). 표적이 품 안(0.7u 미만)이면 끊긴다. 스택마다 베기 피해 +1 · 4 이상: 형태에 관통 추가 · 8: 관통이 길이 6.0u·폭 1.4u로 커짐.',
  T,
  flat(ctx) { return ctx.state.stack; },
  shapes(ctx) {
    if (ctx.state.stack < T.pierceAt || K.has(ctx.w, 'pierce')) return [];
    const sz = K.pierceSize(ctx.w);
    return [{ kind: 'line', len: sz.len, width: sz.width, factor: 1.0, source: 'pierce' }];
  },
  on: {
    swing(ev, ctx) {
      const d = ev.primaryDist, R = ev.reach, from = ctx.state.stack;
      if (d > R + eps) return;
      if (d < T.guard - eps) {
        if (from > 0) { ctx.setStack(0, 'too_close'); ctx.toast('일섬 흐트러짐: 품을 내줬다'); }
        return;
      }
      if (d >= R - T.tip - eps) {
        ctx.setStack(from + 1, 'gain');
        const to = ctx.state.stack;
        if (from < T.pierceAt && to >= T.pierceAt) K.label(ctx, '관통');
        if (from < T.bigAt && to >= T.bigAt) K.label(ctx, '관통↑');
        if (from < ctx.def.maxStack && to === ctx.def.maxStack) ctx.toast(ctx.def.name + ' ×' + ctx.def.maxStack);
      }
    },
  },
  hud(state) { return { text: '×' + state.stack, badge: state.stack >= T.bigAt ? '관통↑' : state.stack >= T.pierceAt ? '관통' : undefined }; },
});

BD.render.trails.register({
  id: 'one_flash',
  draw(g, v, s, k, tr, w) { K.draw.thrust(g, v, s, k, tr.elements, w); },
});

BD.render.decor.register({
  id: 'one_flash_band', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    if (h.dead || !BD.cardRt.has(w, 'one_flash')) return;
    const D = K.draw, R = h.stats.reach;
    D.annulus(g, v, h.x, h.y, R - T.tip, R, 'rgba(255,154,60,0.16)');
    D.ellipse(g, v, h.x, h.y, R, null, 'rgba(255,154,60,0.55)', 1.5);
    D.ellipse(g, v, h.x, h.y, R - T.tip, null, 'rgba(255,154,60,0.35)', 1);
    // the guard (too close) as a faint dashed ring
    g.setLineDash([4, 5]);
    D.ellipse(g, v, h.x, h.y, T.guard, null, 'rgba(255,255,255,0.22)', 1);
    g.setLineDash([]);
  },
});
