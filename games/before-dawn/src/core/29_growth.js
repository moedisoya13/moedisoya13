// Growth inside a run (GDD-V2 §4.1–4.3, §4.5): light shards, the gauge and levels, the growth
// choice (셋 중 하나) and boons (단련). DOM-free and deterministic (choice draws: w.rng.choice).
//
//   BD.growth.drop(w, x, y, value)   a shard pops out at (x, y) (kills call it; cards may too)
//   BD.growth.onKill(w, e)           the kill's shards (def.shards; guardian 10 × 6; elite 25)
//   BD.growth.pullAll(w)             every shard on the floor flies to the hero (guardian kill, halo)
//   BD.growth.need(level)            shards from `level` to the next (C.V2.xp)
//   BD.growth.addXp(w, n)            gauge +n; a full gauge levels up and queues a choice
//   BD.growth.update(w, dt)          per tick: shards pop, get drawn in, are picked up; opens a queued choice
//   BD.growth.open(w, kind)          opens the choice overlay now (kind 'level'; 'chest' later)
//   BD.growth.options(w)             the three options §4.3 would offer now
//   BD.growth.pick(w, i)             answer the open choice (app.cmd('choice', 'pick', i))
//   BD.growth.boonStats(w, s)        boons' stats hooks (hero.computeStats)
//   BD.growth.giveBoon(w, id) / levelCard(w, card)   what a pick does (also for `&level=` starts)
//
// w.shards = [{id, x, y, v, popT, pull, sp}] (at most C.CAP.shards; the farthest merge into their
// nearest). w.choice = {kind, options: [{kind: 'card'|'boon'|'breath', id, from, to, text, name, pick}],
// lastCards}; w.choiceOpen is true while it waits (the world stands still, like the altar).
// A scenario (BD.W.scenario(w): tests that stage a fight) never opens a choice; levels still count.

const C = BD.C;
const M = BD.math;
const W = BD.W;
const G = BD.growth = {};
const SH = C.V2.shard;

G.need = (L) => (L <= 1 ? C.V2.xp.first[0] : L === 2 ? C.V2.xp.first[1] : Math.round(C.V2.xp.base + C.V2.xp.per * L));

G.drop = function (w, x, y, value) {
  if (!(value > 0) || !w.grid) return null;
  const [px, py] = BD.nav.resolve(w.grid, x, y, 0.15);
  const s = { id: W.id(w), x: px, y: py, v: value, popT: SH.pop, pull: false, sp: 0 };
  w.shards.push(s);
  if (w.shards.length > C.CAP.shards) mergeFarthest(w);
  W.emit(w, 'shard_drop', { x: M.round(px, 3), y: M.round(py, 3), value });
  return s;
};
// §3.7: over the cap, the shard farthest from the hero joins its nearest neighbour (values add).
function mergeFarthest(w) {
  const h = w.hero, L = w.shards;
  let fi = -1, fd = -1;
  for (let i = 0; i < L.length; i++) { if (L[i].pull) continue; const d = M.dist(L[i].x, L[i].y, h.x, h.y); if (d > fd) { fd = d; fi = i; } }
  if (fi < 0) return;
  const f = L[fi];
  let ni = -1, nd = Infinity;
  for (let i = 0; i < L.length; i++) { if (i === fi) continue; const d = M.dist(L[i].x, L[i].y, f.x, f.y); if (d < nd) { nd = d; ni = i; } }
  if (ni < 0) return;
  L[ni].v += f.v;
  L.splice(fi, 1);
}

G.onKill = function (w, e) {
  if (e.boss) return;
  if (e.guardian) { // §4.1: ten shards of 6, scattered
    for (let i = 0; i < 10; i++) { const a = (i / 10) * M.TAU; G.drop(w, e.x + Math.cos(a) * 1.2, e.y + Math.sin(a) * 1.2, 6); }
    return;
  }
  const v = e.elite ? 25 : e.def.shards !== undefined ? e.def.shards : e.role === 'fodder' ? 1 : 3;
  G.drop(w, e.x, e.y, v);
};

G.pullAll = function (w) { for (const s of w.shards) { s.pull = true; s.popT = 0; } };

G.addXp = function (w, n) {
  const h = w.hero;
  h.xp += n;
  while (h.xp >= h.xpNeed) {
    h.xp -= h.xpNeed;
    h.level++;
    h.xpNeed = G.need(h.level);
    w.stats.levels++;
    w.choiceQueue = (w.choiceQueue || 0) + 1;
    W.emit(w, 'level_up', { level: h.level });
  }
};

G.update = function (w, dt) {
  const h = w.hero;
  if (w.shards.length && !h.dead) {
    const R = h.pickupR;
    let n = 0;
    for (const s of w.shards) {
      if (s.popT > 0) { s.popT -= dt; continue; }
      const d = M.dist(s.x, s.y, h.x, h.y);
      if (!s.pull && d <= R) s.pull = true;
      if (!s.pull) continue;
      s.sp = s.sp ? Math.min(SH.speed1, s.sp + SH.accel * dt) : SH.speed0;
      const step = s.sp * dt;
      if (d <= SH.take + step) { s.taken = true; n++; continue; }
      s.x += ((h.x - s.x) / d) * step; s.y += ((h.y - s.y) / d) * step;
    }
    if (n) {
      for (const s of w.shards) {
        if (!s.taken) continue;
        w.stats.shards += s.v;
        W.emit(w, 'pickup', { kind: 'shard', x: M.round(s.x, 3), y: M.round(s.y, 3), value: s.v });
        G.addXp(w, s.v);
      }
      w.shards = w.shards.filter((s) => !s.taken);
    }
  }
  if (w.choiceQueue > 0 && !w.choiceOpen && !h.dead && !w.ending && !W.scenario(w)) { w.choiceQueue--; G.open(w, 'level'); }
};

// ---- the growth choice (§4.3) ------------------------------------------------------------------
const cardOption = (c) => {
  const to = (c.level || 1) + 1;
  return { kind: 'card', id: c.id, name: c.def.name, from: c.level || 1, to, text: BD.cardRt.levelText(c.def, to), pick: 'card:' + c.id };
};
const boonOption = (w, id) => {
  const b = BD.boons.get(id), to = (w.hero.boons[id] || 0) + 1;
  return { kind: 'boon', id, name: b.name, from: to - 1, to, text: b.text(to), pick: 'boon:' + id };
};
const breath = () => ({ kind: 'breath', id: 'breath', name: '여명의 숨', from: 0, to: 0, text: 'HP +' + C.V2.choice.breathHp, pick: 'breath' });

// kind 'level' (§4.3): two cards that can still grow + one boon (one card + two boons when only one
// can grow, three boons when none can); then, once no boon is left, the other growable card before
// 여명의 숨 — never a dead offer while something can still grow (cards owner: docs/requests/v2-cards.md).
// kind 'chest' (§4.6): each equipped card that can grow, in slot order; a slot whose card is at its
// top level (or an empty slot) is filled with a boon, then 여명의 숨.
G.options = function (w, kind) {
  const rng = w.rng.choice, last = (w.choice && w.choice.lastCards) || w.lastCards || [];
  const U = w.cards.filter((c) => c && (c.level || 1) < BD.cardRt.maxLevel(c.def));
  const B = BD.boons.ids().filter((id) => (w.hero.boons[id] || 0) < BD.boons.get(id).max);
  if (kind === 'chest') {
    const out = U.slice().sort((a, b) => a.slot - b.slot).map(cardOption);
    const boons = rng.shuffle(B);
    while (out.length < 3 && boons.length) out.push(boonOption(w, boons.shift()));
    while (out.length < 3) out.push(breath());
    return out;
  }
  const nCards = U.length >= 2 ? C.V2.choice.cardSlots : U.length;
  // cards not offered last time first (any card gets its chance within two choices), then slot order
  const order = rng.shuffle(U).sort((a, b) => (last.includes(a.id) ? 1 : 0) - (last.includes(b.id) ? 1 : 0));
  const out = order.slice(0, nCards).sort((a, b) => a.slot - b.slot).map(cardOption);
  const boons = rng.shuffle(B);
  while (out.length < 3 && boons.length) out.push(boonOption(w, boons.shift()));
  for (const c of order.slice(nCards)) if (out.length < 3) out.push(cardOption(c));
  while (out.length < 3) out.push(breath());
  return out;
};

G.open = function (w, kind) {
  const options = G.options(w, kind);
  // a chest offers every card: it does not change which cards the next level choice puts first
  const prev = (w.choice && w.choice.lastCards) || w.lastCards || [];
  w.choice = { kind: kind || 'level', options, level: w.hero.level - (w.choiceQueue || 0), lastCards: kind === 'chest' ? prev : options.filter((o) => o.kind === 'card').map((o) => o.id) };
  w.choiceOpen = true;
  w.hero.dashBuf = 0;
  W.emit(w, 'choice_open', { kind: w.choice.kind, options: options.map((o) => o.pick) });
  return w.choice;
};

G.levelCard = function (w, card) { return BD.cardRt.levelUp(w, card); };
G.giveBoon = function (w, id) {
  const b = BD.boons.get(id), rank = (w.hero.boons[id] || 0) + 1;
  if (rank > b.max) BD.fail(`boon '${id}' is already at rank ${b.max}`);
  w.hero.boons[id] = rank;
  W.emit(w, 'boon', { id, rank });
  if (b.onGain) b.onGain(w, rank);
  BD.hero.computeStats(w);
  return rank;
};

// Apply option i of the open choice; the world goes on (0.5 s invulnerable, a shockwave pushes
// fodder within 3u out by 1.5u); a second queued level opens the next choice on the next tick.
G.pick = function (w, i) {
  const ch = w.choice;
  if (!w.choiceOpen || !ch) BD.fail('choice pick while no choice is open');
  const o = ch.options[i];
  if (!o) BD.fail(`choice pick ${i} out of range (0..${ch.options.length - 1})`);
  if (o.kind === 'card') {
    const card = BD.cardRt.get(w, o.id);
    if (!card) BD.fail(`choice: card '${o.id}' is not equipped`);
    G.levelCard(w, card);
    W.toast(w, card.def.name + ' ' + card.level + '단계 — ' + o.text);
  } else if (o.kind === 'boon') {
    const rank = G.giveBoon(w, o.id);
    W.toast(w, o.name + ' ' + rank + '단계 — ' + o.text);
  } else W.heal(w, C.V2.choice.breathHp, 'breath');
  w.lastCards = ch.lastCards;
  w.choiceOpen = false;
  W.emit(w, 'choice_pick', { kind: ch.kind, pick: o.pick });
  const h = w.hero, K = C.V2.choice;
  h.invuln = Math.max(h.invuln, K.invuln);
  for (const e of w.enemies) {
    if (e.dead || e.down || e.role !== 'fodder') continue;
    const d = M.dist(e.x, e.y, h.x, h.y);
    if (d > K.shoveR) continue;
    const [nx, ny] = d > 1e-6 ? [(e.x - h.x) / d, (e.y - h.y) / d] : [1, 0];
    BD.combat.knock(w, e, nx, ny, K.shoveDist, {});
  }
  return o;
};

// ---- boons (§4.5) ---------------------------------------------------------------------------------
G.boonStats = function (w, s) {
  const b = w.hero.boons;
  for (const id of Object.keys(b).sort()) if (b[id] > 0) BD.boons.get(id).stats(s, b[id], w);
};
