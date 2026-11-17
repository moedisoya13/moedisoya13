// 상자 (chest) — GDD-V2 §4.6, §5.5. Two threats and six fodder stand round it from floor entry and
// move once any of them is in view (they scatter with the rest at the floor clear). Stand 0.8 s in its ring: the growth overlay opens with your own
// three cards (pick one: +1 level; a card at its last level gives its place to a boon) and a 빛의 고리
// (halo) drops beside the chest. The only place where you choose which card grows. Looks: closed → open.
const GUARDS = { threats: 2, fodder: 6 };

BD.sites.register({
  id: 'chest', name: '상자', stay: 0.8, optional: true, ringColor: '#e0b23e', states: ['closed', 'open'],
  enter(w, site) {
    const rng = w.rng.spawn, P = BD.places, kinds = [];
    for (let i = 0; i < GUARDS.threats; i++) kinds.push(P.threat(w, rng));
    for (let i = 0; i < GUARDS.fodder; i++) kinds.push(P.fodder(w, rng));
    site.mem.guards = P.guard(w, site.x, site.y, kinds.filter(Boolean), { r0: 2.0, r1: 4.2, group: 'chest:' + site.id }).map((e) => e.id);
  },
  use(w, site) {
    if (!w.hero.dead && !w.ending) BD.growth.open(w, 'chest');
    BD.pickupRt.drop(w, 'halo', site.x + 1.2, site.y + 0.6, { always: true });
    BD.W.toast(w, '상자 — 키울 성인을 고른다');
    return true;
  },
  // the floor clear scatters the horde (GDD-V2 §5.5-4): guards still waiting go with it
  on: { floor_clear(ev, w, site) { for (const e of w.enemies.slice()) if (!e.dead && e.flags.wake === 'chest:' + site.id) BD.W.removeEnemy(w, e, 'clear'); } },
  look(w, s) { return s.phase === 'idle' ? 'closed' : 'open'; },
  guards: GUARDS,
});

// The chest's three options: one per equipped card, slot order — "+1 level" while it can grow, else a
// boon in its place (distinct, drawn with w.rng.choice); 여명의 숨 if nothing is left (GDD-V2 §4.6).
BD.growth.kinds.chest = function (w) {
  const C = BD.C, out = [], rng = w.rng.choice;
  const boons = rng.shuffle(BD.boons.ids().filter((id) => (w.hero.boons[id] || 0) < BD.boons.get(id).max));
  for (let i = 0; i < 3; i++) {
    const c = w.cards[i];
    if (c && (c.level || 1) < BD.cardRt.maxLevel(c.def)) {
      const to = (c.level || 1) + 1;
      out.push({ kind: 'card', id: c.id, name: c.def.name, from: c.level || 1, to, text: BD.cardRt.levelText(c.def, to), pick: 'card:' + c.id });
    } else if (boons.length) {
      const id = boons.shift(), b = BD.boons.get(id), to = (w.hero.boons[id] || 0) + 1;
      out.push({ kind: 'boon', id, name: b.name, from: to - 1, to, text: b.text(to), pick: 'boon:' + id });
    } else out.push({ kind: 'breath', id: 'breath', name: '여명의 숨', from: 0, to: 0, text: 'HP +' + C.V2.choice.breathHp, pick: 'breath' });
  }
  return out;
};
