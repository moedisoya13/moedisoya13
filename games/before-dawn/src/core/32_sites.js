// Sites (거점, GDD-V2 §5.4–5.5): places on a big floor the hero uses by standing in their ring, or
// (passive sites: the nests) that a task runs itself. The kinds are content (BD.sites:
// src/content/sites/*.js, task sites in src/content/tasks/*.js); the floor generator lists where they
// stand (floor.layout.sites = [{kind, x, y, zx, zy, optional}]); this file runs the rings.
//
// w.sites = [{id, kind, x, y, zx, zy, phase, state, known, optional, progress, need, entered, mem}]
//   phase  'idle' (waiting for the hero) → 'active' (used, still running: a rift's fight) → 'used'
//   state  the look the art draws (docs/ARCHITECTURE.md §11.4): def.states[0] at first, then what the
//          def sets (spring full → dry, seal intact → cracked → broken, chest closed → open, …)
//   known  false: shown as '?' until the hero comes within 16u (def.known: known from the start)
// def = {id, name, stay (s), total? (time in the ring adds up and is kept when he leaves: seals,
//        the brazier), ring? (u, default C.INTERACT.ring), optional? (a 들를 곳), known?, states?,
//        passive? (no ring: the task runs it), enter?(w, site) at floor entry (a chest's guards),
//        first?(w, site) the first time he steps into the ring (a seal's garrison),
//        ready?(w, site) → false holds the stay at 0 (a spring at full HP),
//        look?(w, site) → state, every tick, use(w, site) → true when finished at once (else the
//        site stays 'active' and calls BD.siteRt.clear itself), update?(w, site, dt) while active,
//        on?: {event(ev, w, site)} — listeners for as long as its floor lasts}
//
//   BD.siteRt.start(w)            floor entry: w.sites from the layout, listeners, def.enter
//   BD.siteRt.update(w, dt)       known, rings, looks, def.update of active sites
//   BD.siteRt.clear(w, site)      finished: phase 'used', site_clear
//   BD.siteRt.release(w, site)    back to 'idle' (the altar's 나중에): it re-arms once he has left the ring
//   BD.siteRt.at(w)               the idle site whose ring the hero stands in, or null
//   BD.siteRt.look(w, site)       refresh site.state from def.look (done on every phase change and tick)
//   BD.siteRt.ring(site)          its ring radius;  BD.siteRt.get(w, id) by id;  BD.siteRt.of(w, kind)

const C = BD.C;
const M = BD.math;
const W = BD.W;
const S = BD.siteRt = {};
S.KNOW = 16;   // u: an unknown site shows its kind when the hero comes this close (GDD-V2 §5.5)

S.ring = (s) => BD.sites.get(s.kind).ring || C.INTERACT.ring;
S.get = (w, id) => { for (const s of w.sites) if (s.id === id) return s; return null; };
S.of = (w, kind) => w.sites.filter((s) => s.kind === kind);

S.start = function (w) {
  if (w.siteOwner) w.bus.offOwner(w.siteOwner);
  w.siteOwner = {};
  w.sites = ((w.floor.layout && w.floor.layout.sites) || []).map((p) => {
    const def = BD.sites.get(p.kind);
    return {
      id: W.id(w), kind: p.kind, x: p.x, y: p.y, zx: p.zx, zy: p.zy, phase: 'idle', state: def.states ? def.states[0] : null,
      known: !!def.known, optional: p.optional !== undefined ? !!p.optional : !!def.optional, progress: 0, need: def.stay,
      entered: false, needExit: false, mem: {},
    };
  });
  for (const s of w.sites) {
    const def = BD.sites.get(s.kind), site = s;
    if (def.on) for (const ev of Object.keys(def.on)) w.bus.on(ev, (p) => { if (w.sites.includes(site)) def.on[ev](p, w, site); }, w.siteOwner);
  }
  for (const s of w.sites) { const def = BD.sites.get(s.kind); if (def.enter) def.enter(w, s); }
};

S.at = function (w) {
  const h = w.hero;
  for (const s of w.sites) {
    if (s.phase !== 'idle' || s.needExit) continue;
    const def = BD.sites.get(s.kind);
    if (def.passive) continue;
    if (M.dist(h.x, h.y, s.x, s.y) <= (def.ring || C.INTERACT.ring)) return s;
  }
  return null;
};

// the look follows the phase at once (listeners of site_clear already see the new state)
S.look = function (w, site) { const def = BD.sites.get(site.kind); if (def.look) site.state = def.look(w, site); };

S.clear = function (w, site) {
  if (site.phase === 'used') return;
  site.phase = 'used';
  S.look(w, site);
  W.emit(w, 'site_clear', { kind: site.kind, id: site.id, optional: site.optional });
};

S.release = function (w, site) {
  if (site.phase === 'used') return;
  site.phase = 'idle'; site.progress = 0; site.needExit = true;
  S.look(w, site);
};

// A staged scenario (BD.W.scenario: tests that stage a fight) leaves the floor's places alone —
// a test standing its hero on a zone centre must not open a chest or call a garrison — unless it
// sets w.sitesLive (the site tests themselves).
S.update = function (w, dt) {
  if (!w.sites.length || (W.scenario(w) && !w.sitesLive)) return;
  const h = w.hero;
  for (const s of w.sites) {
    if (!s.known && M.dist(h.x, h.y, s.x, s.y) <= S.KNOW) s.known = true;
    if (s.needExit && M.dist(h.x, h.y, s.x, s.y) > S.ring(s)) s.needExit = false;
  }
  const here = h.dashT > 0 || h.dead ? null : S.at(w);
  for (const s of w.sites) {
    const def = BD.sites.get(s.kind);
    if (s.phase === 'active') { if (def.update) def.update(w, s, dt); }
    else if (s.phase === 'idle' && !def.passive) {
      if (s === here) {
        if (!s.entered) { s.entered = true; if (def.first) def.first(w, s); }
        if (!def.ready || def.ready(w, s)) s.progress += dt;
        else if (!def.total) s.progress = 0;
        if (s.progress + 1e-9 >= s.need) {
          s.progress = s.need;
          s.phase = 'active';
          S.look(w, s);
          W.emit(w, 'site_start', { kind: s.kind, id: s.id, optional: s.optional });
          if (def.use(w, s)) S.clear(w, s);
        }
      } else if (!def.total) s.progress = 0;
    }
    if (def.look) s.state = def.look(w, s);
  }
};
