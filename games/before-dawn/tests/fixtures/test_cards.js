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
