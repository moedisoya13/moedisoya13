// 관통 (shape) — GDD §5.3. Reference card for the shape stage (②): adds a line to every swing.
BD.cards.register({
  id: 'pierce', name: '관통', family: 'shape', unlock: 'base', icon: 'arrow',
  desc: '베기마다 조준선을 따라 길이 4.2u·폭 0.9u 찌르기를 더한다.',
  shapes(ctx) {
    return [{ kind: 'line', len: 4.2, width: 0.9, factor: 1.0, source: 'pierce' }];
  },
  hud() { return {}; },
});
