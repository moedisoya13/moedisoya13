// 넓은 품 (wide) — GDD-V2 §4.5: the blade's fan +20° per rank (100° → 160° at rank 3), i.e. the
// half-angle +10° per rank. Seen as the fan's arc on every swing.
BD.boons.register({
  id: 'wide', name: '넓은 품', max: 3, icon: 'wide',
  text(rank) { return '부채꼴 각 +' + 20 * rank + '° (' + (100 + 20 * rank) + '°)'; },
  stats(s, rank) { s.halfArc += 10 * rank; },
});
