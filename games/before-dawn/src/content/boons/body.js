// 굳은 몸 (body) — GDD-V2 §4.5: max HP +15 per rank (145 at rank 3) and HP +15 on the spot. The
// max HP is not a per-tick stat, so the rank applies once in onGain. Seen in the HP bar.
BD.boons.register({
  id: 'body', name: '굳은 몸', max: 3, icon: 'body',
  text(rank) { return '최대 HP +' + 15 * rank + ', 그 자리에서 HP +15'; },
  stats() {},
  onGain(w) {
    w.hero.maxHp += 15;
    BD.W.heal(w, 15, 'body');
  },
});
