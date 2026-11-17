// Card information the screens need beyond the card registry: the GDD §5 display order, the
// unlock conditions in words with progress from the save (GDD §11), and a generic reader of a
// card's HUD state. Everything shown is read from BD.cards and the card's state; these tables
// only add words for ids the GDD defines, and every lookup falls back when an id is unknown.

const K = BD.ui.K;
const CI = BD.ui.cards = {};

CI.ORDER = ['pierce', 'whirl', 'sword_wave', 'flame', 'lightning', 'tide', 'leech', 'riposte', 'drawcut',
  'holy_light', 'armor_break', 'mana_backlash', 'rest_of_dead', 'kings_hunt', 'fire_pilgrimage',
  'chain_slash', 'flawless', 'one_flash'];

// Unlock conditions in words (GDD §11 as GDD-V2 §8 changes them). prog(save) → [current, goal].
// A card def may carry its own words and progress (unlockText, unlockProgress(save)); they win.
const UNLOCK = {
  sword_wave: { text: '3층에 처음 도달', prog: (s) => [Math.min(3, s.bestFloor || 0), 3] },
  tide: { text: '누적 처치 4000', prog: (s) => [Math.min(4000, s.counters.kills || 0), 4000] },
  drawcut: { text: '누적 회피 15', prog: (s) => [Math.min(15, s.counters.dodges || 0), 15] },
  mana_backlash: { text: '누적 마법 유형 처치 1200', prog: (s) => [Math.min(1200, s.counters.magicKills || 0), 1200] },
  fire_pilgrimage: { text: '퀘스트 카드를 1회 각성', prog: (s) => [Math.min(1, s.counters.questAwakened || 0), 1] },
  one_flash: { text: '콤보 카드 하나를 최대 스택까지 1회', prog: (s) => [Math.min(1, s.counters.comboMaxed || 0), 1] },
};
const ownDef = (id) => (BD.cards.has(id) ? BD.cards.get(id) : null);
CI.unlockText = (id) => { const d = ownDef(id); return d && d.unlockText ? d.unlockText : UNLOCK[id] ? UNLOCK[id].text : '숨겨진 조건'; };
CI.unlockProgress = (id, save) => {
  const d = ownDef(id);
  if (!save) return null;
  try { if (d && d.unlockProgress) return d.unlockProgress(save); } catch (err) { /* fall back */ }
  return UNLOCK[id] ? UNLOCK[id].prog(save) : null;
};

// Combo stage effects (GDD §5.5), used only when a card's hud() gives no `badge`.
const BADGES = {
  flawless: [[6, '잔영'], [4, '칼 길이↑'], [2, '간격↑']],
  one_flash: [[8, '관통↑'], [4, '관통']],
};
CI.fallbackBadge = function (id, stack) {
  const t = BADGES[id];
  if (!t || !stack) return '';
  for (const [n, b] of t) if (stack >= n) return b;
  return '';
};

// Cards whose hud() ring is a cooldown left (1 = just used) rather than a charge or a timer.
const COOLDOWN_RING = { riposte: true };

// All registered cards in GDD order (unknown ids after, by id).
CI.all = function () {
  const rank = (id) => { const i = CI.ORDER.indexOf(id); return i < 0 ? 999 : i; };
  return BD.cards.all().slice().sort((a, b) => rank(a.id) - rank(b.id) || (a.id < b.id ? -1 : 1));
};
CI.def = (id) => (BD.cards.has(id) ? BD.cards.get(id) : null);
CI.isUnlocked = (def, save) => def.unlock === 'base' || (save && save.unlocked.includes(def.id));

// HUD state of an equipped card: the card's hud() merged over defaults read from its state.
// → {text, ring, pips, glow, badge, flash, cover, warn, maxed, awakened, stack, max}
CI.hud = function (w, card) {
  let h = null;
  if (card.def.hud) {
    try { h = card.def.hud(card.state, BD.cardRt.ctx(w, card)); } catch (err) { h = null; }
  }
  h = h || {};
  const st = card.state, def = card.def, fam = def.family;
  const out = { text: h.text, ring: h.ring, pips: h.pips, glow: h.glow, badge: h.badge, flash: !!h.flash, cover: h.cover };
  // a cooldown ring is also drawn as a shade over the icon (반격's "대기 가림막")
  if (out.cover === undefined && COOLDOWN_RING[card.id] && typeof out.ring === 'number') out.cover = out.ring;
  if (out.text === undefined || out.text === null) {
    if (fam === 'quest' && st.goal) out.text = (st.awakened ? st.goal : st.progress || 0) + '/' + st.goal;
    else if (fam === 'combo') out.text = '×' + (st.stack || 0);
    else out.text = '';
  }
  if (out.glow === undefined && fam === 'target' && def.targetType) out.glow = !!(w.floor && def.targetType === w.floor.domType);
  if (!out.badge) out.badge = fam === 'combo' ? CI.fallbackBadge(card.id, st.stack) : '';
  out.stack = st.stack || 0;
  out.max = BD.cardRt.maxStack(card) || 0;
  out.maxed = fam === 'combo' && out.max > 0 && out.stack >= out.max;
  out.awakened = !!st.awakened;
  // a running combo timer close to running out (GDD §9.3: under 1 s); the card's own flag wins
  out.warn = h.warn !== undefined ? !!h.warn : fam === 'combo' && out.stack > 0 && typeof st.timer === 'number' && st.timer < 1 && st.timer > 0;
  return out;
};

// One line describing a card's live state (pause screen, altar slot step, result).
CI.stateLine = function (card) {
  const st = card.state, def = card.def;
  if (def.family === 'quest') return st.awakened ? '각성함' : '진행 ' + (st.progress || 0) + '/' + st.goal;
  const max = BD.cardRt.maxStack(card);
  if (def.family === 'combo') return '스택 ×' + (st.stack || 0) + (max ? ' (최대 ' + max + ')' : '');
  return '';
};
