// 제단 (altar) — GDD-V2 §4.6, §5.5. One per floor, lit from the start and known from the start (the
// only site shown by kind on the minimap before you come near). Stand 0.8 s in its ring: the altar
// opens — a card swap or a prayer, once per floor. What it offers and what a swap does is the cards
// agent's; this site places it and calls it (contract: docs/requests/v2-floors.md §2):
//
//   open:  BD.altar.open(w, site) when the cards side defines it; otherwise the v1 altar of
//          src/core/27_flow.js: w.altar stands at the site, BD.flow.lightAltar (offers) and
//          BD.flow.openAltar (the overlay, w.altarOpen); w.altar is gone again once it closes
//   close: `altar_close {choice}` with 'card' | 'pray', or `choice_pick {kind: 'altar'}` → the site is
//          used; 'later' (`altar_close` 'later', or BD.siteRt.release(w, site)) → idle again, ready
//          once the hero has stepped out of the ring
// Looks: lit → used.
BD.sites.register({
  id: 'altar', name: '제단', stay: 0.8, optional: true, known: true, states: ['lit', 'used'],
  use(w, site) {
    if (BD.altar && BD.altar.open) { BD.altar.open(w, site); return false; }
    const a = site.mem.altar || { state: 'lit', x: site.x, y: site.y, offers: [], offered: [], round: 0, step: 'choose', pick: null, needExit: false, siteId: site.id };
    site.mem.altar = a;
    w.altar = a;
    if (!a.offers.length && a.round === 0) BD.flow.lightAltar(w);
    BD.flow.openAltar(w);
    return false; // active while the overlay is open
  },
  on: {
    altar_close(ev, w, site) {
      if (site.phase !== 'active') return;
      if (w.altar && w.altar.siteId === site.id) w.altar = null;
      if (ev.choice === 'later') BD.siteRt.release(w, site);
      else BD.siteRt.clear(w, site);
    },
    choice_pick(ev, w, site) { if (ev.kind === 'altar' && site.phase === 'active') BD.siteRt.clear(w, site); },
  },
  look(w, s) { return s.phase === 'used' ? 'used' : 'lit'; },
});
