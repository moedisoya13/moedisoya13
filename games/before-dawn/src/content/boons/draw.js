// 빛 끌림 (draw) — GDD-V2 §4.5: shard pick-up radius +0.8u per rank (3.6u at rank 3). Seen as the
// pale-gold pick-up ring.
BD.boons.register({
  id: 'draw', name: '빛 끌림', max: 3, icon: 'draw',
  text(rank) { return '줍는 반경 +' + (0.8 * rank).toFixed(1) + 'u'; },
  stats(s, rank) { s.pickupR += 0.8 * rank; },
});
