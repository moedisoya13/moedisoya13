// 관통 (shape) — GDD §5.3. Reference card for the shape stage (②): adds a line to every swing.
// Line along the aim, 4.2u × 0.9u, factor 1.0, source 'pierce'. With 일섬 ×8 the line is
// 6.0u × 1.4u (§5.5). With 검기 the wave pierces up to 3 enemies (sword_wave.js, §5.6).
// On screen: a long orange thrust with an inked head (trail drawer 'pierce').
const K = BD.cardKit;

BD.cards.register({
  id: 'pierce', name: '관통', family: 'shape', unlock: 'base', icon: 'pierce',
  desc: '베기마다 조준선을 따라 길이 4.2u·폭 0.9u 찌르기를 더한다(배율 1.0).',
  shapes(ctx) {
    const sz = K.pierceSize(ctx.w);
    return [{ kind: 'line', len: sz.len, width: sz.width, factor: 1.0, source: 'pierce' }];
  },
  hud() { return {}; },
});

BD.render.trails.register({
  id: 'pierce',
  draw(g, v, s, k, tr, w) { K.draw.thrust(g, v, s, k, tr.elements, w); },
});
