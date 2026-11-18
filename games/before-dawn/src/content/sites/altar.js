// 제단 (altar) — GDD-V2 §4.6, §5.5. One per floor, lit from the start and known from the start (the
// only site shown by kind on the minimap before you come near). Stand 0.8 s in its ring: the altar
// opens — a card swap or a prayer, once per floor. What it offers and what a swap does is the cards
// side's (src/content/cards/_altar.js, BD.cardAltar): a choice of kind 'altar' in the growth overlay.
//
//   open:  BD.cardAltar.use(w, site) — the site stays 'active' while the choice is open
//   close: `altar_close {choice}` with 'card' | 'pray' → the site is used (site_clear); 'later' → idle
//          again, ready once the hero has stepped out of the ring (BD.siteRt.release)
// Looks: lit → used.
BD.sites.register({
  id: 'altar', name: '제단', stay: 0.8, optional: true, known: true, states: ['lit', 'used'],
  use(w, site) { BD.cardAltar.use(w, site); return false; },
  on: {
    altar_close(ev, w, site) {
      if (site.phase !== 'active') return;
      if (ev.choice === 'later') BD.siteRt.release(w, site);
      else BD.siteRt.clear(w, site);
    },
  },
  look(w, s) { return s.phase === 'used' ? 'used' : 'lit'; },
});
