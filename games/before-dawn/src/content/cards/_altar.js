// The v2 altar (제단) — GDD-V2 §4.6, §5.5, §10.3: what the altar does to the hand. The floor puts an
// altar site down (the floors agent registers the site kind 'altar'); its `use` and `update` call
// this module, which opens a choice overlay of kind 'altar' and answers it. One altar per floor,
// lit from the start, used once: swap a card or pray, one of the two.
//
//   BD.cardAltar.use(w, site)          site def's use(w, site): opens the altar (false: the site stays
//                                      'active' until a swap or a prayer clears it)
//   BD.cardAltar.update(w, site, dt)   site def's update: after 나중에 the site re-arms (state 'idle')
//                                      once the hero has stepped out of its ring
//   BD.cardAltar.open(w, site|null)    open now (tests, staging); a site keeps its offers across 나중에
//   BD.cardAltar.offers(w)             the three offers of this floor (§4.6 rule below)
//   BD.cardAltar.cmd(w, cmd, arg)      'pick' i | 'slot' s | 'back' | 'pray' | 'later'
//                                      (app.cmd('choice', cmd, arg) routes here while the altar is open)
//   BD.cardAltar.choose(w, {policy})   the bot's answer → ['choice', cmd, arg] (BD.bot.choose routes here)
//
// The choice (w.choiceOpen, w.choice; the world stands still like any choice):
//   w.choice = {kind: 'altar', step: 'choose' | 'slot', offers: [3 card ids], pick: null | i,
//               options (what this step shows, see optionsFor), floor, nextDomType, pray: 30,
//               site: site id | null, lastCards (kept for the next growth choice), level}
//   step 'choose': pick i takes offer i to step 'slot'; pray; later
//   step 'slot':   slot s (or pick s) empties slot s: the new card comes in at that card's level
//                  (§4.6 "새 카드는 빠진 카드의 단계를 물려받는다"); back; pray; later
// Events: altar_open {floor} and choice_open {kind: 'altar', options: ['card:<id>' ×3]} on opening;
// a swap: card_swap {slot, outId, inId}, choice_pick {kind: 'altar', pick: 'swap:<out>><in>'}; a prayer
// (HP +30): heal {source 'altar'}, altar_pray {floor}, choice_pick {kind: 'altar', pick: 'pray'};
// every close: altar_close {floor, choice: 'card' | 'pray' | 'later'} (later emits no choice_pick).
//
// Offers (§4.6): three unlocked cards not equipped; on 1F–4F with 50 % the first is the target card
// of the next floor's dominant type (v1 rule ②); a quest card only while it can still be completed
// (card def offerable(info), info = A.remaining: §4.4 "남은 층에 언데드 우세 층" / "남은 층 ≥ 2").
// The draw is BD.sub(seed, 'gen', 'altar<floor>'): the same floor of the same seed offers the same.

const C = BD.C;
const M = BD.math;
const W = BD.W;
const A = BD.cardAltar = {};
A.PRAY = 30;          // 기도 HP +30 (GDD-V2 §4.6; v1 C.PRAY 25 stays for v1 rooms)
A.OFFERS = 3;
A.TARGET_CHANCE = 0.5;
const CONDITIONAL = ['quest', 'combo'];

// The floors after floorN (up to 5F; the rooftop has no altar and no quest targets of its own).
A.remaining = function (run, floorN) {
  const domTypes = [];
  for (let n = floorN + 1; n <= 5; n++) if (run.floors[n]) domTypes.push(run.floors[n].domType);
  return { floor: floorN, floorsLeft: domTypes.length, domTypes, guardians: domTypes.length };
};

A.offers = function (w) {
  const run = w.run, n = w.floorN;
  const rng = BD.sub(run.seed, 'gen', 'altar' + n);
  const info = A.remaining(run, n);
  const next = run.floors[n] ? run.floors[n].nextDomType : null;
  const equipped = w.cards.filter(Boolean).map((c) => c.id);
  let pool = BD.cardRt.pool(w.unlocked).filter((id) => !equipped.includes(id)).filter((id) => {
    const d = BD.cards.get(id);
    return d.family !== 'quest' || !d.offerable || d.offerable(info);
  });
  const out = [];
  if (n <= 4 && rng.chance(A.TARGET_CHANCE)) {
    const tgt = pool.filter((id) => { const d = BD.cards.get(id); return d.family === 'target' && d.targetType === next; });
    if (tgt.length) out.push(rng.pick(tgt));
  }
  pool = rng.shuffle(pool.filter((id) => !out.includes(id)));
  while (out.length < A.OFFERS && pool.length) out.push(pool.shift());
  return out;
};

// What each step shows, as growth-choice options (kind 'card', so a generic choice overlay can draw
// them): 'choose' → the offers (at level 1: the level comes from the slot); 'slot' → the three slots,
// each with the level the new card would take there.
function optionsFor(w, ch) {
  if (ch.step === 'choose') {
    return ch.offers.map((id) => {
      const d = BD.cards.get(id);
      return { kind: 'card', id, name: d.name, from: 1, to: 1, text: BD.cardRt.levelText(d, 1), pick: 'card:' + id, altar: 'offer' };
    });
  }
  const inId = ch.offers[ch.pick], inDef = BD.cards.get(inId);
  return [0, 1, 2].map((s) => {
    const c = w.cards[s], L = c ? c.level || 1 : 1;
    return {
      kind: 'card', id: c ? c.id : inId, name: c ? c.def.name : '빈 홈', from: L, to: L, slot: s, altar: 'slot',
      text: (c ? c.def.name + ' → ' : '') + inDef.name + ' ' + L + '단계: ' + BD.cardRt.levelText(inDef, L),
      pick: 'swap:' + (c ? c.id : '') + '>' + inId,
    };
  });
}

A.open = function (w, site) {
  if (w.choiceOpen) BD.fail('altar: a choice is already open');
  let offers;
  if (site) { if (!site.offers) site.offers = A.offers(w); offers = site.offers; } else offers = A.offers(w);
  const prev = (w.choice && w.choice.lastCards) || w.lastCards || [];
  const ch = {
    kind: 'altar', step: 'choose', offers: offers.slice(), pick: null, options: null, floor: w.floorN,
    nextDomType: w.floor ? w.floor.nextDomType : null, pray: A.PRAY, site: site ? site.id : null,
    lastCards: prev, level: w.hero.level,
  };
  ch.options = optionsFor(w, ch);
  w.choice = ch;
  w.choiceOpen = true;
  w.hero.dashBuf = 0;
  W.emit(w, 'altar_open', { floor: w.floorN });
  W.emit(w, 'choice_open', { kind: 'altar', options: ch.options.map((o) => o.pick) });
  return ch;
};

A.use = function (w, site) { A.open(w, site); return false; };

A.update = function (w, site) {
  if (!site.altarWait) return;
  const def = BD.sites.has(site.kind) ? BD.sites.get(site.kind) : null;
  const ring = (def && def.ring) || C.INTERACT.ring;
  if (M.dist(w.hero.x, w.hero.y, site.x, site.y) <= ring) return;
  site.altarWait = false; site.state = 'idle'; site.progress = 0;
};

const siteOf = (w, ch) => (ch.site === null ? null : (w.sites || []).find((s) => s.id === ch.site) || null);

function close(w, ch, choice) {
  w.choiceOpen = false;
  const h = w.hero;
  h.invuln = Math.max(h.invuln, C.INTERACT.closeInvuln);
  W.emit(w, 'altar_close', { floor: w.floorN, choice });
  const site = siteOf(w, ch);
  if (choice === 'later') { if (site) site.altarWait = true; return; }
  w.botAltarUsed = true; // the bot's 'smart' site rule visits one altar a run (GDD-V2 §10.3)
  if (site) BD.siteRt.clear(w, site);
}

A.swap = function (w, slot, inId) {
  const out = w.cards[slot], level = out ? out.level || 1 : 1;
  BD.cardRt.unequip(w, slot, 'swap');
  const card = BD.cardRt.equip(w, slot, inId, level);
  W.emit(w, 'card_swap', { slot, outId: out ? out.id : null, inId });
  W.toast(w, '성인을 새겼다: ' + card.def.name + ' ' + card.level + '단계');
  return card;
};

A.cmd = function (w, cmd, arg) {
  const ch = w.choice;
  if (!w.choiceOpen || !ch || ch.kind !== 'altar') BD.fail(`altar command '${cmd}' while the altar is not open`);
  if (cmd === 'pick' && ch.step === 'slot') cmd = 'slot';
  if (cmd === 'pick') {
    if (!(arg >= 0 && arg < ch.offers.length)) BD.fail(`altar pick ${arg} out of range (0..${ch.offers.length - 1})`);
    ch.pick = arg; ch.step = 'slot'; ch.options = optionsFor(w, ch);
  } else if (cmd === 'back') {
    ch.pick = null; ch.step = 'choose'; ch.options = optionsFor(w, ch);
  } else if (cmd === 'slot') {
    if (ch.step !== 'slot') BD.fail('altar slot before pick');
    if (!(arg >= 0 && arg <= 2)) BD.fail(`altar slot ${arg} out of range`);
    const inId = ch.offers[ch.pick], out = w.cards[arg];
    A.swap(w, arg, inId);
    W.emit(w, 'choice_pick', { kind: 'altar', pick: 'swap:' + (out ? out.id : '') + '>' + inId });
    close(w, ch, 'card');
  } else if (cmd === 'pray') {
    W.heal(w, A.PRAY, 'altar');
    W.emit(w, 'altar_pray', { floor: w.floorN });
    W.emit(w, 'choice_pick', { kind: 'altar', pick: 'pray' });
    close(w, ch, 'pray');
  } else if (cmd === 'later') {
    close(w, ch, 'later');
  } else BD.fail(`unknown altar command '${cmd}'`);
  return ch;
};

// The slot the bot empties: the lowest-level card that is neither quest nor combo (their progress
// would be lost), the leftmost on a tie; an empty slot first; else the lowest-level card.
A.slotFor = function (w) {
  let best = -1;
  for (const pass of [true, false]) {
    for (let i = 0; i < 3; i++) {
      const c = w.cards[i];
      if (!c) return i;
      if (pass && CONDITIONAL.includes(c.def.family)) continue;
      if (best < 0 || (c.level || 1) < (w.cards[best].level || 1)) best = i;
    }
    if (best >= 0) return best;
  }
  return 0;
};

// policy (GDD-V2 §10.3): 'mixed' prays below 60 HP, else takes the first offer; 'card' always takes
// it; 'pray' always prays.
A.choose = function (w, opts) {
  const ch = w.choice, policy = (opts && opts.policy) || 'mixed';
  if (ch.step === 'slot') return ['choice', 'slot', A.slotFor(w)];
  if (!ch.offers.length || policy === 'pray' || (policy === 'mixed' && w.hero.hp < 60)) return ['choice', 'pray'];
  return ['choice', 'pick', 0];
};
