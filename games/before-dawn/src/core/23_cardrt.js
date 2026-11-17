// Card runtime: instances in the three slots, the hook context, hand dealing and altar
// offers (GDD §5.6), quest/combo helpers that emit the §5.2 events with the right payloads.

const W = BD.W;
const R = BD.cardRt = {};
const CONDITIONAL = ['quest', 'combo'];

// The context passed to every card hook: { w, card, state, def, hero, swing, … helpers }.
R.ctx = function (w, card, swing) {
  const ctx = {
    w, card, def: card.def, state: card.state, hero: w.hero, swing: swing || null,
    emit: (name, payload) => W.emit(w, name, payload),
    toast: (text) => W.toast(w, text),
    credit: (amount) => R.credit(w, card.id, amount),
    after: (delay, fn) => W.after(w, delay, fn),
    strike: (spec) => BD.combat.strike(w, spec),
    damage: (e, amount, info) => BD.combat.damage(w, e, amount, info),
    status: (e, name, opts) => BD.status.apply(w, e, name, opts),
    knock: (e, nx, ny, dist, opts) => BD.combat.knock(w, e, nx, ny, dist, opts),
    heal: (amount, source) => W.heal(w, amount, source),
    projectile: (spec) => BD.combat.heroProjectile(w, Object.assign({ card: card.id, x: w.hero.x, y: w.hero.y }, spec)),
    enemies: () => W.livingEnemies(w),
    setStack: (to, reason) => R.setStack(w, card, to, reason),
    addProgress: (n) => R.addProgress(w, card, n),
    awaken: () => R.awaken(w, card),
  };
  return ctx;
};

R.each = function (w, fn) {
  for (let i = 0; i < 3; i++) { const c = w.cards[i]; if (c) fn(c, R.ctx(w, c, null)); }
};
R.list = (w) => w.cards.filter(Boolean);
R.has = (w, id) => w.cards.some((c) => c && c.id === id);
R.get = (w, id) => w.cards.find((c) => c && c.id === id) || null;

R.elements = function (w) {
  return BD.ELEMENT_ORDER.filter((el) => w.cards.some((c) => c && c.def.element === el));
};

// ⑤ order: element cards tide → lightning → flame, then every other onHit card in slot order.
R.onHitOrder = function (w) {
  const list = R.list(w).filter((c) => c.def.onHit);
  const el = list.filter((c) => c.def.element).sort((a, b) => BD.ELEMENT_ORDER.indexOf(a.def.element) - BD.ELEMENT_ORDER.indexOf(b.def.element) || a.slot - b.slot);
  return el.concat(list.filter((c) => !c.def.element));
};

R.credit = function (w, id, amount) {
  const s = w.stats.cards[id] || (w.stats.cards[id] = { contrib: 0, procs: 0 });
  s.contrib += amount;
};

R.equip = function (w, slot, id) {
  const def = BD.cards.get(id);
  if (slot < 0 || slot > 2) BD.fail(`card slot must be 0..2, got ${slot}`);
  if (w.cards[slot]) R.unequip(w, slot, 'swap');
  const card = {
    id, def, slot,
    state: { stack: def.family === 'combo' ? 0 : null, timer: null, progress: def.family === 'quest' ? 0 : null, goal: def.goal || null, awakened: false },
  };
  w.cards[slot] = card;
  if (!w.stats.cards[id]) w.stats.cards[id] = { contrib: 0, procs: 0 };
  const ctx = R.ctx(w, card, null);
  if (def.init) def.init(ctx);
  if (def.on) for (const ev of Object.keys(def.on)) {
    const fn = def.on[ev];
    w.bus.on(ev, (payload) => { if (w.cards[card.slot] === card) fn(payload, R.ctx(w, card, null)); }, card);
  }
  if (def.onEquip) def.onEquip(ctx);
  return card;
};

R.unequip = function (w, slot, reason) {
  const card = w.cards[slot];
  if (!card) return null;
  if (card.def.family === 'combo' && card.state.stack > 0) R.setStack(w, card, 0, 'swap');
  if (card.def.onUnequip) card.def.onUnequip(R.ctx(w, card, null));
  w.bus.offOwner(card);
  w.cards[slot] = null;
  return card;
};

// Combo stack change. reason ∈ gain | timeout | hurt | too_close | swap (GDD §5.2).
R.setStack = function (w, card, to, reason) {
  const max = card.def.maxStack;
  to = Math.max(0, Math.min(max, to));
  const from = card.state.stack;
  if (to === from) return;
  if (!['gain', 'timeout', 'hurt', 'too_close', 'swap'].includes(reason)) BD.fail(`combo_change reason '${reason}' not allowed`);
  card.state.stack = to;
  const best = w.stats.bestStack;
  best[card.id] = Math.max(best[card.id] || 0, to);
  if (to === max && from < max) w.stats.comboMaxed++;
  W.emit(w, 'combo_change', { cardId: card.id, from, to, reason });
};

R.addProgress = function (w, card, n) {
  const st = card.state;
  if (st.awakened) return;
  st.progress = Math.min(st.goal, st.progress + (n || 1));
  W.emit(w, 'quest_progress', { cardId: card.id, value: st.progress, goal: st.goal });
  if (st.progress >= st.goal) R.awaken(w, card);
};

R.awaken = function (w, card) {
  if (card.state.awakened) return;
  card.state.awakened = true;
  w.stats.questAwakened++;
  W.emit(w, 'quest_awaken', { cardId: card.id });
  W.banner(w, '각성: ' + card.def.name, 'awaken');
};

// ---- pools, hands, offers ------------------------------------------------------------------

// Cards a run may deal: registered cards that are base or listed in the save's unlocked ids.
R.pool = function (unlocked) {
  return BD.cards.all().filter((d) => d.unlock === 'base' || (unlocked && unlocked.includes(d.id))).map((d) => d.id);
};

// §5.6 start hand. rerolls = number of 다시 뽑기 used (each takes the next 3 by the same rule).
R.dealHand = function (seed, unlocked, rerolls) {
  const order = BD.sub(seed, 'gen', 'hand').shuffle(R.pool(unlocked));
  let idx = 0, hand = [];
  for (let r = 0; r <= (rerolls || 0); r++) {
    hand = [];
    let conditional = 0;
    while (idx < order.length && hand.length < 3) {
      const id = order[idx++];
      const fam = BD.cards.get(id).family;
      if (CONDITIONAL.includes(fam)) { if (conditional >= 1) continue; conditional++; }
      hand.push(id);
    }
    const isSE = (id) => ['shape', 'element'].includes(BD.cards.get(id).family);
    if (hand.length === 3 && !hand.some(isSE)) {
      let j = idx;
      while (j < order.length && !isSE(order[j])) j++;
      if (j < order.length) { hand[2] = order[j]; order.splice(j, 1); }
    }
  }
  return hand;
};

// What the floors after `floorN` still contain — for quest feasibility (§5.6 ①).
R.remaining = function (run, floorN) {
  const byType = { beast: 0, undead: 0, magic: 0, heavy: 0 };
  let guardians = 0;
  for (let n = floorN + 1; n <= 5; n++) {
    const f = run.floors[n];
    for (const k of f.spawns.w1.concat(f.spawns.w2, f.spawns.w3)) byType[BD.enemies.get(k).type]++;
    byType[BD.enemies.get(f.spawns.guardian).type]++;
    guardians++;
  }
  return { byType, guardians, floor: floorN };
};

// §5.6 altar offers: 2 cards from the pool minus equipped minus already offered on this floor.
R.offers = function (run, floorN, round, equipped, offered, unlocked) {
  const rng = BD.sub(run.seed, 'gen', 'altar' + floorN + '/' + round);
  const info = R.remaining(run, floorN);
  const next = run.floors[floorN].nextDomType;
  let pool = R.pool(unlocked).filter((id) => !equipped.includes(id) && !offered.includes(id)).filter((id) => {
    const d = BD.cards.get(id);
    if (d.family !== 'quest') return true;
    return floorN <= 3 && (!d.offerable || d.offerable(info));
  });
  const out = [];
  if (floorN <= 4 && rng.chance(0.5)) {
    const tgt = pool.filter((id) => { const d = BD.cards.get(id); return d.family === 'target' && d.targetType === next; });
    if (tgt.length) out.push(rng.pick(tgt));
  }
  pool = rng.shuffle(pool.filter((id) => !out.includes(id)));
  while (out.length < 2 && pool.length) out.push(pool.shift());
  return out;
};
