// TEST-ONLY fixture: an altar site kind wired exactly as docs/requests/v2-cards.md asks the floors
// agent to register the real 'altar' (GDD-V2 §5.5: stay 0.8 s, known from the start, optional).
// It has its own id so it never collides with the real one after the merge.
BD.sites.register({
  id: 'test_altar', name: '제단', stay: 0.8, known: true, optional: true,
  use: (w, site) => BD.cardAltar.use(w, site),
  update: (w, site, dt) => BD.cardAltar.update(w, site, dt),
});
