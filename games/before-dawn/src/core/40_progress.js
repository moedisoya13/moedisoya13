// Between-run progress and the save (GDD §11, v2 format GDD-V2 §8). DOM-free: takes a storage
// adapter with getItem/setItem (localStorage in the browser, a Map in Node). Every storage access
// is in try/catch; on failure the game continues with in-memory values.
//
// v2 (GDD-V2 §8): key `before-dawn.save.v2`, v: 2, new fields bestLevel, bestKills (one run's
// kills) and codex[id].bestLevel, counter magicKills (magic-type kills; mageKills is kept for the
// v1 unlock rule until the cards move to it). When only a v1 save exists, load() carries over
// exactly what §8 lists — unlocked, runs, wins, bestFloor, tier*, rerollUnlocked, settings and
// counters (mageKills → magicKills); v1's fastest win, codex counts and run history describe a
// different game and start fresh — and the next store() writes the v2 key (the v1 key stays).

const P = BD.progress = {};
P.VERSION = 2;
P.KEY = 'before-dawn.save.v2';
P.KEY_V1 = 'before-dawn.save.v1';
P.FIELDS = ['v', 'runs', 'wins', 'bestFloor', 'bestWinSec', 'tierUnlocked', 'tierSelected', 'tierWins', 'rerollUnlocked', 'unlocked', 'counters', 'codex', 'history', 'settings', 'lastSeed', 'bestLevel', 'bestKills'];
P.FIELDS_V1 = ['unlocked', 'runs', 'wins', 'bestFloor', 'tierUnlocked', 'tierSelected', 'tierWins', 'rerollUnlocked', 'settings', 'counters'];

P.fresh = function () {
  return {
    v: P.VERSION, runs: 0, wins: 0, bestFloor: 0, bestWinSec: null, bestLevel: 0, bestKills: 0,
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
    const o = raw ? JSON.parse(raw) : null;
    if (o && o.v === P.VERSION) {
      for (const k of P.FIELDS) if (o[k] !== undefined && k !== 'v') s[k] = o[k];
    } else if (!raw) {
      const raw1 = storage && storage.getItem(P.KEY_V1);
      const o1 = raw1 ? JSON.parse(raw1) : null;
      if (!o1 || o1.v !== 1) return s;
      P.migrateV1(s, o1);
    } else return s;
    s.counters = Object.assign(P.fresh().counters, s.counters || {});
    s.settings = Object.assign(P.fresh().settings, s.settings || {});
    if (!Array.isArray(s.unlocked)) s.unlocked = P.fresh().unlocked;
    for (const id of P.fresh().unlocked) if (!s.unlocked.includes(id)) s.unlocked.push(id);
    if (!s.codex || typeof s.codex !== 'object') s.codex = {};
    for (const id of Object.keys(s.codex)) s.codex[id] = Object.assign({ held: 0, wins: 0, best: 0, bestLevel: 0 }, s.codex[id]);
    if (!Array.isArray(s.history)) s.history = [];
    if (!Array.isArray(s.tierWins)) s.tierWins = [0, 0, 0, 0];
  } catch (err) { /* unreadable storage: keep defaults */ }
  return s;
};

// A v1 save (GDD §11) into the fresh v2 save s (GDD-V2 §8).
P.migrateV1 = function (s, o1) {
  for (const k of P.FIELDS_V1) if (o1[k] !== undefined) s[k] = o1[k];
  const c = Object.assign({}, o1.counters || {});
  if (c.magicKills === undefined) c.magicKills = c.mageKills || 0;
  s.counters = c;
  s.bestLevel = 0; s.bestKills = 0;
  return s;
};

P.store = function (storage, save) {
  try {
    if (!storage) return false;
    const o = {};
    for (const k of P.FIELDS) o[k] = save[k];
    o.v = P.VERSION;
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
    level: c.level || 1, // GDD-V2 §8
  }));
  return {
    result, cause: cause || null, causeText: BD.causeText(cause), floor: w.floorN, sec: BD.math.round(w.t, 2),
    clock: BD.flow.clockStr(w), kills: w.stats.kills, trials: w.stats.trials, trialSec: BD.math.round(w.stats.trialSec, 1),
    dodges: w.stats.dodges, hurts: w.stats.hurts, cards, heldIds: Object.keys(w.stats.cards).sort(), topDamage: top,
    seed: w.seed, tier: w.tier, events: w.bus.count(),
    run: { mageKills: w.stats.mageKills, magicKills: w.stats.magicKills || 0, questAwakened: w.stats.questAwakened, comboMaxed: w.stats.comboMaxed },
    // GDD-V2 §8: the level reached, the boons taken, the floor tasks finished
    level: w.hero.level || 1, boons: Object.assign({}, w.hero.boons || {}), tasks: (w.stats.tasks || []).slice(), shards: w.stats.shards || 0,
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
  c.kills += sum.kills; c.dodges += sum.dodges; c.mageKills += sum.run.mageKills || 0;
  c.magicKills = (c.magicKills || 0) + (sum.run.magicKills || 0); // GDD-V2 §8 (마력 역류)
  c.questAwakened += sum.run.questAwakened; c.comboMaxed += sum.run.comboMaxed;
  save.bestLevel = Math.max(save.bestLevel || 0, sum.level || 0); // GDD-V2 §8
  save.bestKills = Math.max(save.bestKills || 0, sum.kills || 0);
  const entry = (id) => save.codex[id] || (save.codex[id] = { held: 0, wins: 0, best: 0, bestLevel: 0 });
  for (const id of sum.heldIds) entry(id).held++;
  for (const card of sum.cards) {
    const e = entry(card.id);
    if (win) e.wins++;
    e.best = Math.max(e.best, card.bestStack || 0, card.awakened ? 1 : 0);
    e.bestLevel = Math.max(e.bestLevel || 0, card.level || 1);
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
