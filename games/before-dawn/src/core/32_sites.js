// Sites (거점, GDD-V2 §5.5): places on a big floor the hero uses by standing in their ring. The
// kinds are content (BD.sites); the floor generator lists where they stand (floor.layout.sites =
// [{kind, x, y, optional?}]); this file runs the stay rings. The proof slice registers no kind
// (purge has no site); tests/fixtures/test_site.js shows the hook working.
//
// w.sites = [{id, kind, x, y, state: 'idle' | 'active' | 'used', known, optional, progress, need}]
//   def = {id, name, stay (s), total? (true: time in the ring adds up and does not reset, like the
//          seal stones), ring? (u, default C.INTERACT.ring), optional? (a 들를 곳: counts as a
//          choice in tools/fun), known? (shown by kind from the start; else '?' until 16u),
//          use(w, site) → true when finished at once (spring), else the site stays 'active' and
//          calls BD.siteRt.clear(w, site) itself later (rift, nest), update?(w, site, dt)}
//   BD.siteRt.start(w)           floor entry: builds w.sites from the layout
//   BD.siteRt.update(w, dt)      rings, def.update of active sites
//   BD.siteRt.clear(w, site)     finished: state 'used', site_clear
//   BD.siteRt.at(w)              the site whose ring the hero stands in, or null

const C = BD.C;
const M = BD.math;
const W = BD.W;
const S = BD.siteRt = {};
const KNOW = 16;

S.start = function (w) {
  w.sites = ((w.floor.layout && w.floor.layout.sites) || []).map((p) => {
    const def = BD.sites.get(p.kind);
    return { id: W.id(w), kind: p.kind, x: p.x, y: p.y, state: 'idle', known: !!def.known, optional: p.optional !== undefined ? !!p.optional : !!def.optional, progress: 0, need: def.stay };
  });
};

S.at = function (w) {
  const h = w.hero;
  for (const s of w.sites) {
    if (s.state !== 'idle') continue;
    const def = BD.sites.get(s.kind);
    if (M.dist(h.x, h.y, s.x, s.y) <= (def.ring || C.INTERACT.ring)) return s;
  }
  return null;
};

S.clear = function (w, site) {
  if (site.state === 'used') return;
  site.state = 'used';
  W.emit(w, 'site_clear', { kind: site.kind, id: site.id, optional: site.optional });
};

S.update = function (w, dt) {
  if (!w.sites.length) return;
  const h = w.hero;
  for (const s of w.sites) if (!s.known && M.dist(h.x, h.y, s.x, s.y) <= KNOW) s.known = true;
  const here = h.dashT > 0 || h.dead ? null : S.at(w);
  for (const s of w.sites) {
    const def = BD.sites.get(s.kind);
    if (s.state === 'active') { if (def.update) def.update(w, s, dt); continue; }
    if (s.state !== 'idle') continue;
    if (s === here) {
      s.progress += dt;
      if (s.progress + 1e-9 >= s.need) {
        s.state = 'active';
        W.emit(w, 'site_start', { kind: s.kind, id: s.id, optional: s.optional });
        if (def.use(w, s)) S.clear(w, s);
      }
    } else if (!def.total) s.progress = 0;
  }
};
