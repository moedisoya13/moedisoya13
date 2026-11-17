// 빠른 손 (quick) — GDD-V2 §4.5: swing interval −7 % per rank (0.47 s at rank 3). Seen in the beat.
BD.boons.register({
  id: 'quick', name: '빠른 손', max: 3, icon: 'quick',
  text(rank) { return '베기 간격 −' + 7 * rank + '%'; },
  stats(s, rank) { s.interval *= 1 - 0.07 * rank; },
});
