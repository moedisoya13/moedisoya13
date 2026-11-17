// 시련의 균열 (trial rift) — GDD-V2 §4.6, §5.5; from 2F (1F has a second chest instead). Stand 1.5 s
// in its ring: an elite and two packs come out of it (1.2 s warnings). Bring the elite down: radiance
// +1 (max 9), two big shards (2 × 25) and a 성광석 (holy stone). Its enemies stay through the floor
// clear (they are the rift's own). Looks: available → active → spent.
const PACKS = 2;

BD.sites.register({
  id: 'rift', name: '시련의 균열', stay: 1.5, optional: true, states: ['available', 'active', 'spent'],
  use(w, site) {
    const rng = w.rng.spawn, P = BD.places, row = BD.director.row(w), tag = { rift: site.id, keep: true };
    P.warn(w, site.x, site.y, [P.eliteKind(w)], { r0: 1.2, r1: 2.0, elite: true, flags: Object.assign({ marker: 'threat', riftElite: true }, tag) });
    for (let i = 0; i < PACKS; i++) {
      const n = row ? rng.int(row.pack[0], row.pack[1]) : 5, kinds = [];
      for (let k = 0; k < n; k++) kinds.push(P.fodder(w, rng));
      P.warn(w, site.x, site.y, kinds.filter(Boolean), { r0: 1.5, r1: 3.5, flags: tag });
    }
    w.stats.trials++;
    BD.W.banner(w, '시련 — 균열이 열렸다', 'trial');
    return false; // active until the elite falls
  },
  on: {
    kill(ev, w, site) {
      if (site.phase !== 'active') return;
      const e = BD.W.enemyById(w, ev.enemyId);
      if (!e || !e.flags.riftElite || e.flags.rift !== site.id) return;
      const h = w.hero;
      h.radiance = Math.min(BD.C.RADIANCE_MAX, h.radiance + 1);
      BD.growth.drop(w, e.x + 0.5, e.y, 25);
      BD.growth.drop(w, e.x - 0.5, e.y, 25);
      BD.pickupRt.drop(w, 'holy_stone', e.x, e.y + 0.8);
      for (const o of w.enemies) if (!o.dead && o.flags.rift === site.id) delete o.flags.keep;
      BD.W.banner(w, '시련을 넘었다 — 광휘 +1', 'trial_clear');
      BD.siteRt.clear(w, site);
    },
  },
  look(w, s) { return s.phase === 'idle' ? 'available' : s.phase === 'active' ? 'active' : 'spent'; },
});
