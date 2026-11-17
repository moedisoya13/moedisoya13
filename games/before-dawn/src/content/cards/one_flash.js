// 일섬 (combo: spacing) — GDD §5.5, GDD-V2 §4.4. Unlock: any combo card at its max stack once.
// On each swing, by the target's edge distance d against this swing's reach R:
//   R − tip ≤ d ≤ R (the blade tip) → +1 · d < 0.7 (inside the guard) → reset `too_close` ·
//   in between, or beyond R (a wave target) → no change. Max 8. Taking it out → `swap`.
// Stages: swing damage per stack · from the pierce stack the swing gains a pierce line (none added
// when 관통 is equipped — no change) · 8 the pierce line, 관통's included, becomes 6.0u × 1.4u
// (pierce.js reads K.pierceSize). The stack is updated at ①, before the shapes of the same swing.
// Levels (cumulative, ctx.lv):
//   1 tip zone 0.7u, +1 per stack, pierce line from 4   2 tip zone 0.9u   3 +1.5 per stack
//   4 pierce line from 3   5 at 8 every tip swing adds 일섬: an 8u × 1.0u line at factor 1.5
// On screen: the tip zone as a pale orange band around the hero while equipped (decor
// 'one_flash_band'), the thrust trail of its pierce line, a long white-gold slash for 일섬 (trail
// 'one_flash' on a shape marked flash), stage labels "관통" / "관통↑", the ×8 afterglow, the toast
// "일섬 흐트러짐: 품을 내줬다". Slot: "×N" + badge.
const K = BD.cardKit;
const M = BD.math;
const T = { guard: 0.7, bigAt: 8, flashLen: 8, flashWidth: 1.0 };
const eps = 1e-6;
const lvOfCard = (c) => BD.cardRt.lv(c.def, c.level || 1);

BD.cards.register({
  id: 'one_flash', name: '일섬', family: 'combo', maxStack: 8, icon: 'one_flash',
  unlock: (save) => save.counters.comboMaxed >= 1, unlockText: '콤보 카드 하나를 최대 스택까지 1회',
  desc: '베기의 표적이 칼끝 구간(칼 길이 −0.7u ~ 칼 길이)에 있으면 +1(최대 8). 표적이 품 안(0.7u 미만)이면 끊긴다. 스택마다 베기 피해 +1 · 4 이상: 형태에 관통 추가 · 8: 관통이 길이 6.0u·폭 1.4u로 커짐.',
  T,
  levels: [null,
    { text: '표적이 칼끝 구간(칼 길이 −0.7u)이면 +1(최대 8), 품 안(0.7u 미만)이면 0. 스택마다 베기 +1, 4 이상 관통, 8 큰 관통', tip: 0.7, perStack: 1, pierceAt: 4, flash: 0 },
    { text: '칼끝 구간 폭 0.9u', tip: 0.9 },
    { text: '스택마다 베기 +1.5', perStack: 1.5 },
    { text: '3 이상에서 관통', pierceAt: 3 },
    { text: '8에서 칼끝 베기마다 일섬: 길이 8u·폭 1.0u 직선, 배율 1.5', flash: 1.5 },
  ],
  init(ctx) { ctx.state.tipSwing = false; },
  flat(ctx) { return ctx.lv.perStack * ctx.state.stack; },
  shapes(ctx) {
    const out = [], lv = ctx.lv, n = ctx.state.stack;
    if (n >= lv.pierceAt && !K.has(ctx.w, 'pierce')) {
      const sz = K.pierceSize(ctx.w);
      out.push({ kind: 'line', len: sz.len, width: sz.width, factor: 1.0, source: 'pierce' });
    }
    if (lv.flash && n >= T.bigAt && ctx.state.tipSwing) out.push({ kind: 'line', len: T.flashLen, width: T.flashWidth, factor: lv.flash, source: 'pierce', trail: { flash: true } });
    return out;
  },
  on: {
    swing(ev, ctx) {
      const d = ev.primaryDist, R = ev.reach, from = ctx.state.stack, lv = ctx.lv;
      ctx.state.tipSwing = false;
      if (d > R + eps) return;
      if (d < T.guard - eps) {
        if (from > 0) { ctx.setStack(0, 'too_close'); ctx.toast('일섬 흐트러짐: 품을 내줬다'); }
        return;
      }
      if (d >= R - lv.tip - eps) {
        ctx.state.tipSwing = true;
        ctx.setStack(from + 1, 'gain');
        const to = ctx.state.stack;
        if (from < lv.pierceAt && to >= lv.pierceAt) K.label(ctx, '관통');
        if (from < T.bigAt && to >= T.bigAt) K.label(ctx, lv.flash ? '일섬' : '관통↑');
        if (from < ctx.def.maxStack && to === ctx.def.maxStack) ctx.toast(ctx.def.name + ' ×' + ctx.def.maxStack);
      }
    },
  },
  hud(state, ctx) {
    const lv = ctx ? ctx.lv : { pierceAt: 4, flash: 0 };
    return { text: '×' + state.stack, badge: state.stack >= T.bigAt ? (lv.flash ? '일섬' : '관통↑') : state.stack >= lv.pierceAt ? '관통' : undefined };
  },
});

BD.render.trails.register({
  id: 'one_flash',
  draw(g, v, s, k, tr, w) {
    if (!(s.trail && s.trail.flash)) { K.draw.thrust(g, v, s, k, tr.elements, w); return; }
    // 일섬: a long white-hot line with a gold edge that snaps out at once and lingers
    const D = K.draw, a = 1 - k * k, cx = Math.cos(s.dir), cy = Math.sin(s.dir);
    const p0 = v.proj(s.x + cx * 0.2, s.y + cy * 0.2, 16), p1 = v.proj(s.x + cx * s.len, s.y + cy * s.len, 16);
    g.lineCap = 'round';
    D.path(g, [p0, p1]);
    g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = 16; g.stroke();
    g.strokeStyle = D.rgba(K.GOLD, a); g.lineWidth = 11; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 5; g.stroke();
    g.lineCap = 'butt';
    for (let i = 1; i < 6; i++) { // sparks along the cut
      const u = i / 6, q = v.proj(s.x + cx * s.len * u, s.y + cy * s.len * u, 16 + 18 * k);
      g.beginPath(); g.arc(q[0], q[1], 3 * a + 1, 0, M.TAU); g.fillStyle = D.rgba('#fff3d6', a); g.fill();
    }
  },
});

BD.render.decor.register({
  id: 'one_flash_band', target: 'hero_back',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'one_flash');
    if (h.dead || !c) return;
    const D = K.draw, R = h.stats.reach, tip = lvOfCard(c).tip;
    // pale orange band; thin ink edges keep it readable on the yellow beast floor
    D.annulus(g, v, h.x, h.y, R - tip, R, 'rgba(255,154,60,0.22)');
    D.ellipse(g, v, h.x, h.y, R, null, 'rgba(10,10,12,0.35)', 3.5);
    D.ellipse(g, v, h.x, h.y, R, null, 'rgba(255,154,60,0.85)', 1.5);
    D.ellipse(g, v, h.x, h.y, R - tip, null, 'rgba(10,10,12,0.25)', 2.5);
    D.ellipse(g, v, h.x, h.y, R - tip, null, 'rgba(255,154,60,0.6)', 1);
    // the guard (too close) as a faint dashed ring
    g.setLineDash([4, 5]);
    D.ellipse(g, v, h.x, h.y, T.guard, null, 'rgba(255,255,255,0.22)', 1);
    g.setLineDash([]);
  },
});
