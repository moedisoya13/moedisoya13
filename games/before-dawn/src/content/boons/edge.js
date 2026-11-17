// 날 벼림 (edge) — GDD-V2 §4.5: swing damage +2 per rank (3 ranks). Seen as a thicker trail.
BD.boons.register({
  id: 'edge', name: '날 벼림', max: 3, icon: 'edge',
  text(rank) { return '베기 피해 +' + 2 * rank; },
  stats(s, rank) { s.dmgBase += 2 * rank; },
});
