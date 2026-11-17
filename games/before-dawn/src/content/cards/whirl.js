// 회전베기 (shape) — GDD §5.3. Every swing adds a full circle of radius = blade reach.
// Enemies inside the base fan keep factor 1.0 (each enemy is hit once, at its best factor);
// the rest of the circle hits at 0.7 (source 'whirl').
// On screen: an orange ring that sweeps once around the body (trail drawer 'whirl').
const K = BD.cardKit;
const M = BD.math;

BD.cards.register({
  id: 'whirl', name: '회전베기', family: 'shape', unlock: 'base', icon: 'whirl',
  desc: '베기마다 반경 = 칼 길이의 원 전체를 더한다. 부채꼴 밖은 배율 0.7.',
  shapes(ctx) {
    return [{ kind: 'circle', r: ctx.swing.reach, factor: 0.7, source: 'whirl' }];
  },
  hud() { return {}; },
});

BD.render.trails.register({
  id: 'whirl',
  draw(g, v, s, k, tr, w) {
    const D = K.draw, a = 1 - k;
    const fan = tr.shapes.find((x) => x.kind === 'fan');
    const start = fan ? fan.dir : 0;
    // a faint full ring, then the bright sweep that wraps once around the hero
    D.stroke(g, D.arcPts(v, s.x, s.y, s.r * 0.95, 0, M.TAU, 40, 10), a * 0.45, 3, tr.elements, { rim: D.rim(w), highlight: false });
    const sweep = Math.min(1, 0.2 + k * 4) * M.TAU;
    const tail = Math.max(0, sweep - M.TAU * 0.6);
    const pts = D.arcPts(v, s.x, s.y, s.r * 0.95, start + tail, start + sweep, 32, 12);
    D.stroke(g, pts, a, 8, tr.elements, { rim: D.rim(w) });
  },
});
