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
// v2 floors (GDD-V2 §10.3, all eight rules):
//  ① as above
//  ② HP ≤ 45: a flask within 20u → go to it; else an unused spring (a site of kind 'spring')
//  ③ a halo, or a holy stone with ≥ 8 enemies within 3u, within 8u and not inside a warning → go to it
//  ④ the goal, chosen every 2 s: the guardian → the nearest task place left (a seal, nest or brazier
//     site; a chief of the hunt; an optional site he wants within 10u comes first, on the way) → the
//     elite of a rift he opened → sites by opts.sites ('smart' default:
//     chests always, the altar once, a rift at HP ≥ 70; 'all': every optional site, a spring only below
//     full HP; 'none') → open stairs
//  ⑤ ≥ 6 enemies within 2.2u: step away from the centroid of those within 4u, keeping the nearest
//     within reach
//  ⑥ < 4 enemies within 3u and a shard within 6u: to the nearest shard (with the goal off screen:
//     only one on the way to it, or within 2u — the hero does not wander off his errand; ⑤ leans that way)
//  ⑦ the goal is off screen (or the stairs are open): walk to it; a site with a ring (seal, brazier,
//     an optional site): stay in its ring; a nest, a chief or the guardian in view: hold reach − 0.5u
//     to it (it becomes the nearest, so the auto-attack takes it)
//  ⑧ else ③ above (no enemy at all: toward the goal, or the floor centre)
// BD.bot.choose(w, {policy}) answers any open choice overlay with an app.cmd argument list.

const M = BD.math;
const B = BD.bot = {};
const SAMPLE_DIRS = 16;
const SHOT_LOOKAHEAD = 0.6; // s of a hostile projectile's flight treated as danger
const NEAR_SITE = 10;       // u: an optional site this close comes before the task places (rule ④)

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
// kind: 'guardian' | 'stairs' | 'site' (site) | 'chief' (enemy) | null
function goalLive(w, g) {
  if (g.kind === 'site') return g.site.phase === 'idle' && !g.site.needExit && w.sites.includes(g.site);
  if (g.kind === 'chief') return !g.enemy.dead;
  return true;
}
function goal(w, opts) {
  const h = w.hero, g = w.botGoal;
  const guard = w.enemies.find((e) => !e.dead && e.guardian);
  if (guard) return { x: guard.x, y: guard.y, kind: 'guardian', enemy: guard };
  if (g && g.kind && g.kind !== 'stairs' && w.t < g.until && goalLive(w, g)) { if (g.kind === 'chief') { g.x = g.enemy.x; g.y = g.enemy.y; } return g; }
  let best = null;
  const mode = opts.sites || 'smart';
  for (const s of w.sites) {
    if (s.phase !== 'idle' || s.needExit) continue;
    let want = !s.optional;
    if (s.optional && mode === 'all') want = s.kind !== 'spring' || h.hp < h.maxHp;
    else if (s.optional && mode === 'smart') want = s.kind === 'chest' || (s.kind === 'altar' && !w.botAltarUsed) || (s.kind === 'rift' && h.hp >= 70);
    if (!want) continue;
    // task places first; an optional site he wants within 10u is taken on the way (a short detour while
    // the horde is about, not a walk back over an empty floor after the clear)
    const dd = M.dist(h.x, h.y, s.x, s.y), d = dd + (s.optional && dd > NEAR_SITE ? 1000 : 0);
    if (!best || d < best.d) best = { d, g: { x: s.x, y: s.y, kind: 'site', site: s } };
  }
  for (const e of w.enemies) {
    // a hunt's chief (a task place); the elite of a rift he opened (its reward needs it down)
    if (e.dead || !(e.flags.chief || e.flags.riftElite)) continue;
    const d = M.dist(h.x, h.y, e.x, e.y) + (e.flags.riftElite ? 500 : 0);
    if (!best || d < best.d) best = { d, g: { x: e.x, y: e.y, kind: 'chief', enemy: e } };
  }
  const stairs = w.stairs && w.stairs.open ? { x: w.stairs.ringX, y: w.stairs.ringY, kind: 'stairs' } : null;
  w.botGoal = Object.assign(best ? best.g : stairs || { x: null, y: null, kind: null }, { until: w.t + 2 });
  return w.botGoal;
}

// bound {x, y, r}: positions outside it cost 4 (holding a site's ring while fighting)
function fight(w, shapes, live, near, nd, bound) {
  const h = w.hero, s = h.stats;
  const desired = s.acquire > s.reach ? 4.0 : s.reach - 0.5;
  if (nd > desired + 1.5 && !bound) return go(w, near.x, near.y);
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
    if (bound && M.dist(x, y, bound.x, bound.y) > bound.r) score += 4;
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
    const sp = w.sites.find((s) => s.kind === 'spring' && s.phase === 'idle' && !s.needExit);
    if (sp) return go(w, sp.x, sp.y);
  }
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
  // ③
  if (w.pickups.length) {
    let p = null, pd = 8;
    for (const q of w.pickups) {
      if (q.kind !== 'halo' && q.kind !== 'holy_stone') continue;
      if (q.kind === 'holy_stone' && live.filter((e) => M.dist(h.x, h.y, e.x, e.y) - e.r <= 3).length < 8) continue;
      const d = M.dist(h.x, h.y, q.x, q.y);
      if (d <= pd && !insideDanger(w, q.x, q.y, h.r, shapes)) { pd = d; p = q; }
    }
    if (p) return go(w, p.x, p.y);
  }
  // ④
  const g = goal(w, opts);
  // a site with a ring (task or optional) close by: the rules below keep him inside it (⑦)
  let bound = null;
  if (g.kind === 'site' && !BD.sites.get(g.site.kind).passive) {
    const r = BD.siteRt.ring(g.site);
    if (M.dist(h.x, h.y, g.x, g.y) <= r + 4) bound = { x: g.x, y: g.y, r: Math.max(0.45, r * 0.8) };
  }
  const outside = (x, y) => !!bound && M.dist(x, y, bound.x, bound.y) > bound.r;
  // a goal off screen pulls: step-backs lean toward it, and only shards on the way (or at hand) are fetched
  const away = g.kind && g.x !== null && !BD.W.onScreen(w, g.x, g.y) ? M.norm(g.x - h.x, g.y - h.y) : null;
  const onWay = (x, y) => !away || M.dist(h.x, h.y, x, y) <= 2 || (x - h.x) * away[0] + (y - h.y) * away[1] > 0.5 * M.dist(h.x, h.y, x, y);
  // ⑤
  if (close22 >= 6 && !(bound && outside(h.x, h.y))) {
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
      if (outside(x, y)) score += 4;
      if (away) score -= 0.6 * (Math.cos(a) * away[0] + Math.sin(a) * away[1]);
      if (!best || score < best.score - 1e-9) best = { score, a };
    }
    return { mx: Math.cos(best.a), my: Math.sin(best.a), dash: false };
  }
  // ⑥
  if (close3 < 4 && w.shards.length) {
    let s = null, sd = 6;
    for (const q of w.shards) { if (q.pull || !onWay(q.x, q.y)) continue; const d = M.dist(h.x, h.y, q.x, q.y); if (d <= sd) { sd = d; s = q; } }
    if (s && !insideDanger(w, s.x, s.y, h.r, shapes) && !outside(s.x, s.y)) return go(w, s.x, s.y);
  }
  // ⑦
  if (g.kind === 'stairs') return go(w, g.x, g.y);
  if (g.kind && !BD.W.onScreen(w, g.x, g.y)) return go(w, g.x, g.y);
  if (g.kind === 'site') {
    const def = BD.sites.get(g.site.kind);
    const obj = def.passive && g.site.mem && g.site.mem.enemyId ? BD.W.enemyById(w, g.site.mem.enemyId) : null;
    if (obj && !obj.dead) return fight(w, shapes, live, obj, BD.W.edgeDist(w, obj));
    if (!bound || outside(h.x, h.y)) return go(w, g.x, g.y);
  }
  if ((g.kind === 'chief' || g.kind === 'guardian') && !g.enemy.dead) return fight(w, shapes, live, g.enemy, BD.W.edgeDist(w, g.enemy));
  // ⑧
  if (near) return fight(w, shapes, live, near, nd, bound);
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
