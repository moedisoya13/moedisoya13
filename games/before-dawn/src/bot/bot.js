// Deterministic bot (GDD §13.1). Each tick, first matching rule wins:
//  ① standing in a telegraph that fires in < 0.6 s → walk to the nearest safe spot;
//     < 0.2 s and still inside → dash
//  ② HP ≤ 50 and a flask exists → go to it
//  ③ enemies present → hold edgeDist = reach − 0.5u (4.0u with a ranged acquire) to the nearest
//  ④ no enemies and altar lit → go to the altar (overlay: pray if HP < 60, else first offer
//     into the leftmost non-conditional slot, or slot 0)
//  ⑤ trial option on → open the trial rift
//  ⑥ go to the stairs
// Uses only world state; no randomness.

const M = BD.math;
const B = BD.bot = {};
const SAMPLE_DIRS = 16;

function dangerShapes(w) {
  const out = [];
  for (const t of w.telegraphs) if (t.danger) out.push(t);
  return out;
}
function insideDanger(w, x, y, r, shapes, horizon) {
  for (const t of shapes) if ((horizon === undefined || t.remain < horizon) && M.shapeHits(t, x, y, r + 0.05)) return true;
  for (const z of w.zones) if (z.dmg > 0 && M.dist(x, y, z.x, z.y) <= z.r + r) return true;
  return false;
}

function pathDir(w, x, y) {
  const h = w.hero;
  const fake = { x: h.x, y: h.y, r: h.r };
  if (BD.ai.clearPath(w, fake, x, y)) return M.norm(x - h.x, y - h.y);
  const f = BD.ai.fieldTo(w, Math.floor(x), Math.floor(y));
  const wp = BD.nav.downhill(w.grid, f, h.x, h.y);
  return wp ? M.norm(wp[0] - h.x, wp[1] - h.y) : M.norm(x - h.x, y - h.y);
}

function go(w, x, y) {
  if (M.dist(w.hero.x, w.hero.y, x, y) < 0.15) return { mx: 0, my: 0, dash: false };
  const [mx, my] = pathDir(w, x, y);
  return { mx, my, dash: false };
}

function safeSpot(w, shapes) {
  const h = w.hero;
  let best = null;
  for (const d of [0.5, 0.9, 1.4, 2.0, 2.8, 3.6]) {
    for (let i = 0; i < SAMPLE_DIRS; i++) {
      const a = (i / SAMPLE_DIRS) * M.TAU;
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
      if (!w.grid.walkable(Math.floor(x), Math.floor(y))) continue;
      const [rx, ry] = BD.nav.resolve(w.grid, x, y, h.r);
      if (M.dist(rx, ry, x, y) > 0.05) continue;
      if (insideDanger(w, x, y, h.r, shapes)) continue;
      if (!best || d < best.d) best = { x, y, d, a };
    }
    if (best) return best;
  }
  return null;
}

B.think = function (w, opts) {
  const h = w.hero;
  const shapes = dangerShapes(w);
  // ①
  let urgent = Infinity;
  for (const t of shapes) if (M.shapeHits(t, h.x, h.y, h.r + 0.05)) urgent = Math.min(urgent, t.remain);
  if (urgent < 0.6) {
    const s = safeSpot(w, shapes);
    if (s) {
      const [mx, my] = M.norm(s.x - h.x, s.y - h.y);
      return { mx, my, dash: urgent < 0.2 && h.dashCd <= 0 };
    }
    return { mx: 0, my: 0, dash: urgent < 0.2 && h.dashCd <= 0 };
  }
  // ②
  if (h.hp <= 50 && w.pickups.length) {
    const p = w.pickups.slice().sort((a, b) => M.dist(h.x, h.y, a.x, a.y) - M.dist(h.x, h.y, b.x, b.y))[0];
    return go(w, p.x, p.y);
  }
  // ③
  const live = w.enemies.filter((e) => !e.dead && !e.down);
  if (live.length) {
    let near = live[0], nd = Infinity;
    for (const e of live) { const d = BD.W.edgeDist(w, e); if (d < nd || (d === nd && e.id < near.id)) { nd = d; near = e; } }
    const s = h.stats;
    const desired = s.acquire > s.reach ? 4.0 : s.reach - 0.5;
    if (nd > desired + 1.5) return go(w, near.x, near.y);
    // local search over 16 directions + stand still
    let best = null;
    const step = 0.5;
    for (let i = -1; i < SAMPLE_DIRS; i++) {
      const a = (i / SAMPLE_DIRS) * M.TAU;
      const dx = i < 0 ? 0 : Math.cos(a) * step, dy = i < 0 ? 0 : Math.sin(a) * step;
      const [x, y] = BD.nav.move(w.grid, h.x, h.y, dx, dy, h.r);
      const ed = M.dist(x, y, near.x, near.y) - near.r;
      let score = Math.abs(ed - desired);
      if (insideDanger(w, x, y, h.r, shapes)) score += 5;
      for (const e of live) { const d = M.dist(x, y, e.x, e.y) - e.r; if (d < 1.0) score += (1.0 - d) * 0.8; }
      if (i >= 0 && M.dist(x, y, h.x, h.y) < step * 0.3) score += 0.5; // blocked
      if (i < 0) score -= 0.05; // prefer standing when equal
      if (!best || score < best.score - 1e-9) best = { score, dx, dy };
    }
    const [mx, my] = M.norm(best.dx, best.dy);
    return { mx, my, dash: false };
  }
  // ④
  const a = w.altar;
  if (a && a.state === 'lit' && !a.needExit && !w.botSkipAltar) return go(w, a.x, a.y);
  // ⑤
  const t = w.trial;
  if (opts && opts.trial && t && t.state === 'available') return go(w, t.x, t.y);
  // ⑥
  if (w.stairs && w.stairs.open) return go(w, w.stairs.ringX, w.stairs.ringY);
  // waiting for a wave: drift to the room centre
  return go(w, w.grid.w / 2, w.grid.h / 2);
};

// Altar overlay decision → [cmd, arg]
B.altar = function (w) {
  const a = w.altar;
  if (a.step === 'slot') {
    let slot = 0;
    for (let i = 0; i < 3; i++) {
      const c = w.cards[i];
      if (!c || !['quest', 'combo'].includes(c.def.family)) { slot = i; break; }
    }
    return ['slot', slot];
  }
  if (w.hero.hp < 60 || !a.offers.length) return ['pray'];
  return ['pick', 0];
};
