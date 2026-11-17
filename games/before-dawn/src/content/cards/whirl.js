// 회전베기 (shape) — GDD §5.3, GDD-V2 §4.4. Every swing adds a full circle of radius = blade reach.
// Enemies inside the base fan keep factor 1.0 (each enemy is hit once, at its best factor); the
// rest of the circle hits at the level's factor (source 'whirl'). Levels:
//   1 factor 0.7   2 0.85   3 circle radius +0.4u   4 1.0
//   5 every third hitting swing an aftershock ring from the blade's reach to reach + 1.6u at 0.6
// On screen: an orange ring that sweeps once around the body (trail drawer 'whirl').
const K = BD.cardKit;
const M = BD.math;

BD.cards.register({
  id: 'whirl', name: '회전베기', family: 'shape', unlock: 'base', icon: 'whirl',
  desc: '베기마다 반경 = 칼 길이의 원 전체를 더한다. 부채꼴 밖은 배율 0.7.',
  levels: [null,
    { text: '베기마다 칼 길이의 원 전체. 부채꼴 밖은 배율 0.7', factor: 0.7, plus: 0, ring: 0 },
    { text: '부채꼴 밖 배율 0.85', factor: 0.85 },
    { text: '원의 반경 +0.4u', plus: 0.4 },
    { text: '부채꼴 밖 배율 1.0', factor: 1.0 },
    { text: '맞힌 베기 3번째마다 여파: 칼 길이 ~ +1.6u 고리(배율 0.6)', ring: 0.6 },
  ],
  init(ctx) { ctx.state.n = 0; },
  shapes(ctx) {
    const lv = ctx.lv, reach = ctx.swing.reach;
    const out = [{ kind: 'circle', r: reach + lv.plus, factor: lv.factor, source: 'whirl' }];
    if (lv.ring && ctx.state.n % 3 === 2) out.push({ kind: 'ring', r0: reach, r1: reach + 1.6, factor: lv.ring, source: 'whirl' });
    return out;
  },
  on: { swing_end(ev, ctx) { if (ev.hitCount > 0) ctx.state.n++; } },
  hud(state, ctx) { return ctx && ctx.lv.ring ? { pips: state.n % 3 } : {}; },
});

BD.render.trails.register({
  id: 'whirl',
  draw(g, v, s, k, tr, w) {
    if (s.kind === 'ring') { BD.render.trails.get('ring').draw(g, v, s, k, tr, w); return; }
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
