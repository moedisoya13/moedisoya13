// Test fixture: a floor plan that makes floors 2–5 big and leaves 1F at its GDD size.
BD.gen.plans.register({
  id: 'test_big',
  size(n, ctx) { return n === 1 ? null : [40 + 4 * n, 36 + ctx.rng.int(0, 8)]; },
  offscreen(n) { return { indicators: true, minimap: n >= 3 }; },
});
