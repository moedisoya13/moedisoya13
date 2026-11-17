// 긴 칼 (long) — GDD-V2 §4.5: blade reach +0.25u per rank (+0.75u at rank 3). Seen as the reach
// ring and every shape that follows the blade (whirl's circle, one_flash's tip band).
BD.boons.register({
  id: 'long', name: '긴 칼', max: 3, icon: 'long',
  text(rank) { return '칼 길이 +' + (0.25 * rank).toFixed(2) + 'u'; },
  stats(s, rank) { s.reach += 0.25 * rank; },
});
