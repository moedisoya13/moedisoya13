// 봉인 (seals) — GDD-V2 §5.4. Three seal stones in different zones — (0, 2), (2, 0), (1, 1), the
// left end, the right end and the middle; the order is the player's. Stand inside a stone's ring
// (2.2u) for 5 s in all: it breaks (leaving stops the count, it never goes back). The first step into
// a ring calls its garrison — two packs and a threat out of rift warnings round it. A breaking stone
// sends a 5u shockwave: fodder die (their shards drop). All three broken → the guardian.
// Layout: office (walls with doors between zones: lines of enemies through the doors and lanes).
const STAY = 5.0, RING = 2.2, SHOCK = 5, PACKS = 2, THREATS = 1;

BD.sites.register({
  id: 'seal', name: '봉인석', stay: STAY, total: true, ring: RING, known: true, ringColor: '#ffd24a', states: ['intact', 'cracked', 'broken'],
  first(w, site) {
    const rng = w.rng.spawn, P = BD.places, row = BD.director.row(w), kinds = [];
    for (let i = 0; i < THREATS; i++) kinds.push(P.threat(w, rng));
    for (let i = 0; i < PACKS; i++) { const n = row ? rng.int(row.pack[0], row.pack[1]) : 5; for (let k = 0; k < n; k++) kinds.push(P.fodder(w, rng)); }
    P.warn(w, site.x, site.y, kinds.filter(Boolean), { r0: 3.2, r1: 5.5, flags: { garrison: site.id } });
  },
  use(w, site) {
    BD.places.shock(w, site.x, site.y, SHOCK);
    BD.W.toast(w, '봉인석이 깨졌다');
    return true;
  },
  look(w, s) { return s.phase !== 'idle' ? 'broken' : s.progress >= s.need / 2 ? 'cracked' : 'intact'; },
});

BD.tasks.register({
  id: 'seals', name: '봉인', layout: 'office', icon: 'seal',
  places() { return [{ kind: 'seal', zone: [0, 2] }, { kind: 'seal', zone: [2, 0] }, { kind: 'seal', zone: [1, 1] }]; },
  goal() { return 3; },
  on: { site_clear(ev, w) { if (ev.kind === 'seal') BD.taskRt.progress(w, 1); } },
  label(task) { return '봉인 ' + task.value + '/' + task.goal; },
});
