// 가벼운 발 (step) — GDD-V2 §4.5: dash cooldown −0.4 s and walking speed +3 % per rank (1.3 s and
// +9 % at rank 3). Seen in the dash cooldown arc and the walk. Reads `s.dashCd` (hero stats).
BD.boons.register({
  id: 'step', name: '가벼운 발', max: 3, icon: 'step',
  text(rank) { return '돌진 대기 −' + (0.4 * rank).toFixed(1) + '초, 이동 +' + 3 * rank + '%'; },
  stats(s, rank) { s.dashCd -= 0.4 * rank; s.speedMul *= 1 + 0.03 * rank; },
});
