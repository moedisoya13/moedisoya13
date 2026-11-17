// Between-run progress and the save (GDD §11). DOM-free: takes a storage adapter with
// getItem/setItem (localStorage in the browser, a Map in Node). Every storage access is in
// try/catch; on failure the game continues with in-memory values.

const P = BD.progress = {};
P.KEY = 'before-dawn.save.v1';
P.FIELDS = ['v', 'runs', 'wins', 'bestFloor', 'bestWinSec', 'tierUnlocked', 'tierSelected', 'tierWins', 'rerollUnlocked', 'unlocked', 'counters', 'codex', 'history', 'settings', 'lastSeed'];

P.fresh = function () {
  return {
    v: 1, runs: 0, wins: 0, bestFloor: 0, bestWinSec: null,
    tierUnlocked: 0, tierSelected: 0, tierWins: [0, 0, 0, 0], rerollUnlocked: false,
    unlocked: BD.cards.all().filter((d) => d.unlock === 'base').map((d) => d.id),
    counters: { kills: 0, dodges: 0, mageKills: 0, magicKills: 0, questAwakened: 0, comboMaxed: 0 },
    codex: {}, history: [],
    settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: true },
    lastSeed: 0,
  };
};

P.memoryStorage = function () {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
};

P.load = function (storage) {
  const s = P.fresh();
  try {
    const raw = storage && storage.getItem(P.KEY);
    if (!raw) return s;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return s;
    for (const k of P.FIELDS) if (o[k] !== undefined) s[k] = o[k];
    s.counters = Object.assign(P.fresh().counters, o.counters || {});
    s.settings = Object.assign(P.fresh().settings, o.settings || {});
    for (const id of P.fresh().unlocked) if (!s.unlocked.includes(id)) s.unlocked.push(id);
  } catch (err) { /* unreadable storage: keep defaults */ }
  return s;
};

P.store = function (storage, save) {
  try {
    if (!storage) return false;
    const o = {};
    for (const k of P.FIELDS) o[k] = save[k];
    storage.setItem(P.KEY, JSON.stringify(o));
    return true;
  } catch (err) { return false; }
};

// Result summary of a finished world (the result screen reads this).
P.summary = function (w, result, cause) {
  const top = Object.entries(w.stats.dmgTaken).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3)
    .map(([k, v]) => ({ key: k, dmg: v, text: BD.causeText(k).replace(/에$/, '') }));
  const cards = w.cards.filter(Boolean).map((c) => ({
    id: c.id, name: c.def.name, slot: c.slot, progress: c.state.progress, goal: c.state.goal, awakened: c.state.awakened,
    stack: c.state.stack, bestStack: w.stats.bestStack[c.id] || 0, contrib: Math.round((w.stats.cards[c.id] || {}).contrib || 0),
  }));
  return {
    result, cause: cause || null, causeText: BD.causeText(cause), floor: w.floorN, sec: BD.math.round(w.t, 2),
    clock: BD.flow.clockStr(w), kills: w.stats.kills, trials: w.stats.trials, trialSec: BD.math.round(w.stats.trialSec, 1),
    dodges: w.stats.dodges, hurts: w.stats.hurts, cards, heldIds: Object.keys(w.stats.cards).sort(), topDamage: top,
    seed: w.seed, tier: w.tier, events: w.bus.count(),
    run: { mageKills: w.stats.mageKills, magicKills: w.stats.magicKills || 0, questAwakened: w.stats.questAwakened, comboMaxed: w.stats.comboMaxed },
  };
};

// Apply a finished run to the save. Returns the list of newly unlocked things.
P.endRun = function (save, sum) {
  const win = sum.result === 'win';
  save.runs++;
  if (win) save.wins++;
  save.bestFloor = Math.max(save.bestFloor, sum.floor);
  if (win && (save.bestWinSec === null || sum.sec < save.bestWinSec)) save.bestWinSec = sum.sec;
  const news = [];
  if (win) {
    save.tierWins[sum.tier] = (save.tierWins[sum.tier] || 0) + 1;
    const next = Math.min(BD.C.TIERS.length - 1, sum.tier + 1);
    if (next > save.tierUnlocked) { save.tierUnlocked = next; news.push({ kind: 'tier', id: next }); }
  }
  if (!save.rerollUnlocked && save.runs >= 3) { save.rerollUnlocked = true; news.push({ kind: 'reroll' }); }
  const c = save.counters;
  c.kills += sum.kills; c.dodges += sum.dodges; c.mageKills += sum.run.mageKills;
  c.magicKills = (c.magicKills || 0) + (sum.run.magicKills || 0); // GDD-V2 §8 (마력 역류)
  c.questAwakened += sum.run.questAwakened; c.comboMaxed += sum.run.comboMaxed;
  for (const id of sum.heldIds) {
    const e = save.codex[id] || (save.codex[id] = { held: 0, wins: 0, best: 0 });
    e.held++;
  }
  for (const card of sum.cards) {
    const e = save.codex[card.id];
    if (win) e.wins++;
    e.best = Math.max(e.best, card.bestStack || 0, card.awakened ? 1 : 0);
  }
  save.history.unshift({ seed: sum.seed, tier: sum.tier, result: sum.result, cause: sum.cause || '', floor: sum.floor, sec: sum.sec, cards: sum.cards.map((x) => x.id) });
  save.history = save.history.slice(0, 10);
  for (const d of BD.cards.all()) {
    if (d.unlock === 'base' || save.unlocked.includes(d.id)) continue;
    if (d.unlock(save, sum)) { save.unlocked.push(d.id); news.push({ kind: 'card', id: d.id, name: d.name }); }
  }
  save.lastSeed = sum.seed;
  return news;
};
