// Test-only cards (loaded by tests via load({extraFiles})). Never shipped.
BD.cards.register({
  id: 'test_flame', name: '시험 화염', family: 'element', element: 'flame', unlock: () => false, desc: 'test',
  onHit(ctx, e) { ctx.status(e, 'burn', { direct: true }); },
});
BD.cards.register({
  id: 'test_tide', name: '시험 해류', family: 'element', element: 'tide', unlock: () => false, desc: 'test',
  onHit(ctx, e) {
    const [nx, ny] = BD.math.norm(e.x - ctx.hero.x, e.y - ctx.hero.y);
    ctx.knock(e, nx, ny, 1.2, { slam: true });
    ctx.status(e, 'wet', {});
  },
});
BD.enemies.register({
  id: 'test_reviver', name: '시험 시체', type: 'undead', sprite: 'ghoul', hp: 10, speed: 0, dmg: 1, radius: 0.45, cost: 1,
  attacks: { none: { name: '없음' } },
  revive() { return { delay: 2.5, hp: 30, corpseHp: 20 }; },
  update() {},
});
BD.cards.register({
  id: 'test_wave', name: '시험 검기', family: 'shape', unlock: () => false, desc: 'test',
  stats(ctx, s) { s.acquireRange = 6.5; },
  afterSwing(ctx) {
    const sw = ctx.swing;
    ctx.projectile({ dir: sw.aim, speed: 13, range: 6.5, width: 1, factor: 0.6, pierce: 1, skip: new Set(sw.hits.map((h) => h.e.id)) });
  },
});
BD.cards.register({
  id: 'test_echo', name: '시험 잔영', family: 'combo', maxStack: 6, unlock: () => false, desc: 'test',
  afterSwing(ctx) {
    const sw = ctx.swing;
    ctx.after(0.2, () => ctx.strike({ shapes: sw.shapes.map((s) => Object.assign({}, s, { source: 'echo' })), factorScale: 0.5 }));
    ctx.emit('vfx', { kind: 'line', points: [[sw.x, sw.y], [sw.x + 1, sw.y]] });
  },
});
