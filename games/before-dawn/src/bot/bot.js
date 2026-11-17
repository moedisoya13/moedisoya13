// Deterministic bot (GDD §13.1). Each tick, first matching rule wins:
//  ① standing in a telegraph that fires in < 0.6 s → walk to the nearest safe spot;
//     < 0.2 s and still inside → dash. A hostile projectile already in flight (arrow, dark
//     bolt) counts as a line telegraph over the stretch it covers in the next 0.6 s, firing
//     when it reaches the hero: the bot steps out of its path and does not walk back into it
//  ② HP ≤ 50 and a flask exists → go to it
//  ③ enemies present → hold edgeDist = reach − 0.5u (4.0u with a ranged acquire) to the nearest
//  ④ no enemies and altar lit → go to the altar (overlay: pray if HP < 60, else first offer
//     into the leftmost non-conditional slot, or slot 0)
//  ⑤ trial option on → open the trial rift
//  ⑥ go to the stairs
// Uses only world state; no randomness.
//
// v2 floors (GDD-V2 §10.3; the slice has rules 1, 2, 4–8):
//  ① as above
//  ② HP ≤ 45: a flask within 20u → go to it; else an unused spring (a site of kind 'spring')
//  ④ the goal, chosen every 2 s: the guardian → the nearest task site left → sites by opts.sites
//     ('smart' default: chests always, the altar once, a rift at HP ≥ 70; 'all'; 'none') → open stairs
//  ⑤ ≥ 6 enemies within 2.2u: step away from the centroid of those within 4u, keeping the nearest
//     within reach
//  ⑥ < 4 enemies within 3u and a shard within 6u: to the nearest shard
//  ⑦ the goal is off screen (or the stairs are open): walk to it; a task site: stay in its ring
//  ⑧ else ③ above (no enemy at all: toward the goal, or the floor centre)
// BD.bot.choose(w, {policy}) answers any open choice overlay with an app.cmd argument list.

const M = BD.math;
const B = BD.bot = {};
const SAMPLE_DIRS = 16;
const SHOT_LOOKAHEAD = 0.6; // s of a hostile projectile's flight treated as danger

// The stretch a hostile projectile covers in the next SHOT_LOOKAHEAD s, as a line shape.
// remain = time until it reaches the hero's position along its path (Infinity once past).
function shotShape(w, p) {
  const len = BD.nav.rayLen(w.grid, p.x, p.y, p.dir, Math.min(p.range - p.travelled, p.speed * SHOT_LOOKAHEAD));
  const along = (w.hero.x - p.x) * Math.cos(p.dir) + (w.hero.y - p.y) * Math.sin(p.dir);
  return { shape: 'line', x: p.x, y: p.y, dir: p.dir, len, width: p.r * 2, remain: along >= 0 ? along / p.speed : Infinity };
}

function dangerShapes(w) {
  const out = [];
  for (const t of w.telegraphs) if (t.danger) out.push(t);
  for (const p of w.projectiles) if (p.hostile && !p.dead) out.push(shotShape(w, p));
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
  if (w.floor && w.floor.v2) return thinkV2(w, opts || {}, shapes);
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

// ---- v2 (GDD-V2 §10.3) ---------------------------------------------------------------------------
function dodge(w, shapes) {
  const h = w.hero;
  let urgent = Infinity;
  for (const t of shapes) if (M.shapeHits(t, h.x, h.y, h.r + 0.05)) urgent = Math.min(urgent, t.remain);
  if (urgent >= 0.6) return null;
  const s = safeSpot(w, shapes);
  const dash = urgent < 0.2 && h.dashCd <= 0;
  if (s) { const [mx, my] = M.norm(s.x - h.x, s.y - h.y); return { mx, my, dash }; }
  return { mx: 0, my: 0, dash };
}

// The goal of rule ④, re-chosen every 2 s (kept on the world as w.botGoal; read-only for rules).
function goal(w, opts) {
  const h = w.hero, g = w.botGoal;
  const guard = w.enemies.find((e) => !e.dead && e.guardian);
  if (guard) return { x: guard.x, y: guard.y, kind: 'guardian' };
  if (w.stairs && w.stairs.open) return { x: w.stairs.ringX, y: w.stairs.ringY, kind: 'stairs' };
  if (g && w.t < g.until && (!g.site || g.site.state === 'idle')) return g;
  let best = null;
  const mode = opts.sites || 'smart';
  for (const s of w.sites) {
    if (s.state !== 'idle') continue;
    let want = !s.optional;
    if (s.optional && mode === 'all') want = true;
    else if (s.optional && mode === 'smart') want = s.kind === 'chest' || (s.kind === 'altar' && !w.botAltarUsed) || (s.kind === 'rift' && h.hp >= 70);
    if (!want) continue;
    const d = M.dist(h.x, h.y, s.x, s.y) + (s.optional ? 1000 : 0); // task sites first
    if (!best || d < best.d) best = { d, s };
  }
  w.botGoal = best ? { x: best.s.x, y: best.s.y, kind: 'site', site: best.s, until: w.t + 2 } : { x: null, y: null, kind: null, until: w.t + 2 };
  return w.botGoal;
}

function fight(w, shapes, live, near, nd) {
  const h = w.hero, s = h.stats;
  const desired = s.acquire > s.reach ? 4.0 : s.reach - 0.5;
  if (nd > desired + 1.5) return go(w, near.x, near.y);
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
    if (i >= 0 && M.dist(x, y, h.x, h.y) < step * 0.3) score += 0.5;
    if (i < 0) score -= 0.05;
    if (!best || score < best.score - 1e-9) best = { score, dx, dy };
  }
  const [mx, my] = M.norm(best.dx, best.dy);
  return { mx, my, dash: false };
}

function thinkV2(w, opts, shapes) {
  const h = w.hero;
  // ①
  const d1 = dodge(w, shapes);
  if (d1) return d1;
  // ②
  if (h.hp <= 45) {
    let p = null, pd = 20;
    for (const q of w.pickups) { if (q.kind !== 'flask') continue; const d = M.dist(h.x, h.y, q.x, q.y); if (d <= pd) { pd = d; p = q; } }
    if (p) return go(w, p.x, p.y);
    const sp = w.sites.find((s) => s.kind === 'spring' && s.state === 'idle');
    if (sp) return go(w, sp.x, sp.y);
  }
  // ④
  const g = goal(w, opts);
  const live = [];
  let near = null, nd = Infinity, close22 = 0, close3 = 0;
  for (const e of w.enemies) {
    if (e.dead || e.down) continue;
    live.push(e);
    const d = BD.W.edgeDist(w, e);
    if (d < nd || (d === nd && e.id < near.id)) { nd = d; near = e; }
    if (d <= 2.2) close22++;
    if (d <= 3) close3++;
  }
  // ⑤
  if (close22 >= 6) {
    let cx = 0, cy = 0, n = 0;
    for (const e of live) if (M.dist(h.x, h.y, e.x, e.y) <= 4) { cx += e.x; cy += e.y; n++; }
    cx /= n; cy /= n;
    let best = null;
    for (let i = 0; i < SAMPLE_DIRS; i++) {
      const a = (i / SAMPLE_DIRS) * M.TAU, [x, y] = BD.nav.move(w.grid, h.x, h.y, Math.cos(a) * 0.6, Math.sin(a) * 0.6, h.r);
      let score = -M.dist(x, y, cx, cy);
      if (M.dist(x, y, near.x, near.y) - near.r > h.stats.reach) score += 1.5;
      if (insideDanger(w, x, y, h.r, shapes)) score += 5;
      if (M.dist(x, y, h.x, h.y) < 0.2) score += 3;
      if (!best || score < best.score - 1e-9) best = { score, a };
    }
    return { mx: Math.cos(best.a), my: Math.sin(best.a), dash: false };
  }
  // ⑥
  if (close3 < 4 && w.shards.length) {
    let s = null, sd = 6;
    for (const q of w.shards) { if (q.pull) continue; const d = M.dist(h.x, h.y, q.x, q.y); if (d <= sd) { sd = d; s = q; } }
    if (s && !insideDanger(w, s.x, s.y, h.r, shapes)) return go(w, s.x, s.y);
  }
  // ⑦
  if (g.kind === 'stairs') return go(w, g.x, g.y);
  if (g.kind && !BD.W.onScreen(w, g.x, g.y)) return go(w, g.x, g.y);
  if (g.kind === 'site' && !g.site.optional) {
    const r = (BD.sites.get(g.site.kind).ring || BD.C.INTERACT.ring) * 0.7;
    if (M.dist(h.x, h.y, g.x, g.y) > r) return go(w, g.x, g.y);
  }
  // ⑧
  if (near) return fight(w, shapes, live, near, nd);
  if (g.kind) return go(w, g.x, g.y);
  return go(w, w.grid.w / 2, w.grid.h / 2);
}

// Answer the open choice overlay → arguments for app.cmd (GDD-V2 §10.3).
// policy: 'mixed' (HP < 60: 여명의 숨 / 굳은 몸 first, else the lowest-level card), 'card' (always a
// card when offered), 'pray' (boons first; the altar prays).
B.choose = function (w, opts) {
  opts = opts || {};
  if (w.altarOpen) return ['altar'].concat(B.altar(w, opts));
  const ch = w.choice, policy = opts.policy || 'mixed';
  if (!w.choiceOpen || !ch) BD.fail('bot.choose: no choice is open');
  if (ch.kind === 'altar') return BD.cardAltar.choose(w, opts); // the v2 altar (src/content/cards/_altar.js)
  const O = ch.options;
  const lowestCard = () => { let bi = -1; for (let i = 0; i < O.length; i++) if (O[i].kind === 'card' && (bi < 0 || O[i].from < O[bi].from)) bi = i; return bi; };
  const first = (pred) => O.findIndex(pred);
  let i = -1;
  if (policy === 'pray') i = first((o) => o.kind === 'boon');
  else if (policy === 'mixed' && w.hero.hp < 60) i = first((o) => o.kind === 'breath' || (o.kind === 'boon' && o.id === 'body'));
  if (i < 0 && policy !== 'pray') i = lowestCard();
  if (i < 0) i = first((o) => o.kind === 'boon');
  if (i < 0) i = 0;
  return ['choice', 'pick', i];
};
