// 관통 (shape) — GDD §5.3, GDD-V2 §4.4. Reference card for the shape stage (②) and for card levels.
// Every swing adds a thrust along the aim (source 'pierce'). Levels (cumulative, ctx.lv):
//   1 line 4.2u × 0.9u, factor 1.0   2 length 5.4u   3 width 1.3u, hit enemies pushed 0.6u along it
//   4 length 6.6u, factor 1.2        5 a second thrust behind the hero at factor 0.7
// With 일섬 ×8 the line is at least 6.0u × 1.4u (§5.5). With 검기 the wave pierces 2 more (§5.6).
// On screen: a long orange thrust with an inked head (trail drawer 'pierce').
const K = BD.cardKit;

BD.cards.register({
  id: 'pierce', name: '관통', family: 'shape', unlock: 'base', icon: 'pierce',
  desc: '베기마다 조준선을 따라 길이 4.2u·폭 0.9u 찌르기를 더한다(배율 1.0).',
  levels: [null,
    { text: '베기마다 조준선으로 길이 4.2u·폭 0.9u 찌르기(배율 1.0)', len: 4.2, width: 0.9, factor: 1.0, push: 0, back: 0 },
    { text: '찌르기 길이 5.4u', len: 5.4 },
    { text: '폭 1.3u, 맞은 적을 찌른 방향으로 0.6u 민다', width: 1.3, push: 0.6 },
    { text: '길이 6.6u, 배율 1.2', len: 6.6, factor: 1.2 },
    { text: '등 뒤로도 같은 찌르기(배율 0.7)', back: 0.7 },
  ],
  shapes(ctx) {
    const lv = ctx.lv, big = K.stack(ctx.w, 'one_flash') >= 8;
    const len = big ? Math.max(lv.len, K.PIERCE_BIG.len) : lv.len, width = big ? Math.max(lv.width, K.PIERCE_BIG.width) : lv.width;
    const out = [{ kind: 'line', len, width, factor: lv.factor, source: 'pierce' }];
    if (lv.back) out.push({ kind: 'line', len, width, factor: lv.back, source: 'pierce', dir: ctx.swing.aim + Math.PI });
    return out;
  },
  onHit(ctx, e, hit) {
    if (!ctx.lv.push || hit.source !== 'pierce' || !hit.shape) return;
    ctx.knock(e, Math.cos(hit.shape.dir), Math.sin(hit.shape.dir), ctx.lv.push);
  },
  hud() { return {}; },
});

BD.render.trails.register({
  id: 'pierce',
  draw(g, v, s, k, tr, w) { K.draw.thrust(g, v, s, k, tr.elements, w); },
});
