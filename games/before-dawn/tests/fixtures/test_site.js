// Test fixture: two site kinds on the v2 site hook (src/core/32_sites.js) — one used at once
// (like a spring), one whose stay adds up and that finishes later (like a seal stone).
BD.sites.register({
  id: 'test_spring', name: '시험 샘', stay: 1.2, optional: true,
  use(w) { BD.W.heal(w, 40, 'spring'); return true; },
});
BD.sites.register({
  id: 'test_seal', name: '시험 봉인석', stay: 5.0, total: true, ring: 2.2, known: true,
  use(w, site) { site.mem = { t: 0 }; return false; },
  update(w, site, dt) { site.mem.t += dt; if (site.mem.t >= 1) BD.siteRt.clear(w, site); },
});
