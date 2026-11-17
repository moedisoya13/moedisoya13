// The v2 save (GDD-V2 §8, accept V14) in Node: the key and fields, the migration from a v1 save,
// the new records (best level, most kills in one run, each card's best level), and saves that
// are broken or half-written. The browser side (title, codex, result reading it) is save.test.js.
'use strict';

const V1 = {
  v: 1, runs: 7, wins: 1, bestFloor: 6, bestWinSec: 402.4, tierUnlocked: 2, tierSelected: 1, tierWins: [1, 0, 0, 0], rerollUnlocked: true,
  unlocked: ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'riposte', 'holy_light', 'armor_break', 'rest_of_dead', 'kings_hunt', 'chain_slash', 'flawless', 'sword_wave'],
  counters: { kills: 870, dodges: 9, mageKills: 13, questAwakened: 1, comboMaxed: 0 },
  codex: { pierce: { held: 3, wins: 1, best: 0 } },
  history: [{ seed: 4511, tier: 0, result: 'win', cause: '', floor: 6, sec: 402.4, cards: ['pierce', 'lightning', 'chain_slash'] }],
  settings: { sfx: 0.4, shake: false, dashSide: 'left', hints: false }, lastSeed: 4511,
};

function sum(o) {
  return Object.assign({
    result: 'death', cause: 'goblin:stab', floor: 3, sec: 300, kills: 512, dodges: 3, heldIds: ['pierce', 'flame'],
    cards: [{ id: 'pierce', level: 4, bestStack: 0 }, { id: 'flame', level: 2, bestStack: 0 }], seed: 9, tier: 0,
    run: { mageKills: 2, magicKills: 140, questAwakened: 0, comboMaxed: 0 }, level: 14,
  }, o || {});
}

module.exports = {
  'v2 key and fields; a fresh save writes v: 2 with the new records'(t) {
    const BD = t.load(), P = BD.progress;
    t.eq(P.KEY, 'before-dawn.save.v2');
    const s = P.fresh();
    t.eq(Object.keys(s).sort(), P.FIELDS.slice().sort());
    for (const k of ['bestLevel', 'bestKills']) t.eq(s[k], 0, k);
    t.eq(s.counters.magicKills, 0);
    const m = P.memoryStorage();
    t.assert(P.store(m, s));
    const o = JSON.parse(m.getItem(P.KEY));
    t.eq(o.v, 2);
    t.eq(Object.keys(o).sort(), P.FIELDS.slice().sort());
    t.eq(m.getItem(P.KEY_V1), null, 'nothing written under the v1 key');
  },

  'a v1 save is migrated: unlocks, records, depth, reroll, settings and counters (mageKills → magicKills)'(t) {
    const BD = t.load(), P = BD.progress;
    const m = P.memoryStorage();
    m.setItem(P.KEY_V1, JSON.stringify(V1));
    const s = P.load(m);
    t.eq(s.v, 2);
    t.eq([s.runs, s.wins, s.bestFloor, s.tierUnlocked, s.tierSelected, s.tierWins, s.rerollUnlocked], [7, 1, 6, 2, 1, [1, 0, 0, 0], true]);
    t.assert(s.unlocked.includes('sword_wave'), 'unlocked carried over');
    t.eq(s.settings, V1.settings, 'settings carried over');
    t.eq([s.counters.kills, s.counters.dodges, s.counters.mageKills, s.counters.magicKills, s.counters.questAwakened], [870, 9, 13, 13, 1]);
    t.eq([s.bestLevel, s.bestKills], [0, 0], 'new records start at 0');
    t.eq([s.bestWinSec, s.history, s.codex], [null, [], {}], 'v1 run records (a different game) start fresh');
    // the next store writes the v2 key and leaves the v1 one alone
    P.store(m, s);
    t.eq(JSON.parse(m.getItem(P.KEY)).runs, 7);
    t.eq(JSON.parse(m.getItem(P.KEY_V1)).v, 1);
    // once a v2 save exists, the v1 one is no longer read
    const s2 = P.load(m);
    s2.runs = 8; P.store(m, s2);
    m.setItem(P.KEY_V1, JSON.stringify(Object.assign({}, V1, { runs: 99 })));
    t.eq(P.load(m).runs, 8);
  },

  'a run end keeps the best level, the most kills of one run and each card’s best level'(t) {
    const BD = t.load(), P = BD.progress;
    const s = P.fresh();
    P.endRun(s, sum());
    t.eq([s.bestLevel, s.bestKills, s.counters.magicKills], [14, 512, 140]);
    t.eq([s.codex.pierce.bestLevel, s.codex.flame.bestLevel], [4, 2]);
    P.endRun(s, sum({ kills: 300, level: 9, cards: [{ id: 'pierce', level: 5 }, { id: 'whirl', level: 3 }], heldIds: ['pierce', 'whirl'] }));
    t.eq([s.bestLevel, s.bestKills, s.runs], [14, 512, 2], 'bests only go up');
    t.eq([s.codex.pierce.bestLevel, s.codex.whirl.bestLevel, s.codex.pierce.held], [5, 3, 2]);
    // a summary from an older engine (no level, no magicKills) still counts
    P.endRun(s, sum({ level: undefined, run: { mageKills: 4, questAwakened: 0, comboMaxed: 0 }, cards: [{ id: 'pierce' }] }));
    t.eq([s.bestLevel, s.counters.magicKills, s.counters.mageKills, s.codex.pierce.bestLevel], [14, 144, 8, 5]);
  },

  'the summary of a finished world carries the level, card levels, boons and tasks'(t) {
    const BD = t.load(), H = BD.harness();
    H.start({ seed: 3, hand: ['pierce', 'flame'] });
    const w = H.world();
    BD.cardRt.levelUp(w, w.cards[0]); BD.cardRt.levelUp(w, w.cards[0]);
    BD.growth.giveBoon(w, BD.boons.ids()[0]);
    w.hero.level = 11;
    const s = BD.progress.summary(w, 'death', 'goblin:stab');
    t.eq(s.level, 11);
    t.eq(s.cards.map((c) => [c.id, c.level]), [['pierce', 3], ['flame', 1]]);
    t.eq(s.boons, { [BD.boons.ids()[0]]: 1 });
    t.assert(Array.isArray(s.tasks));
  },

  'broken or foreign data never stops the game: defaults, and the halves that parse'(t) {
    const BD = t.load(), P = BD.progress;
    const cases = [
      [P.KEY, '{not json'], [P.KEY, JSON.stringify({ v: 3, runs: 5 })], [P.KEY_V1, '[]'], [P.KEY_V1, JSON.stringify({ v: 1, unlocked: 'oops', codex: null, history: 4, tierWins: null })],
    ];
    for (const [k, raw] of cases) {
      const m = P.memoryStorage(); m.setItem(k, raw);
      const s = P.load(m);
      t.eq(s.v, 2, k + ' ' + raw);
      t.assert(Array.isArray(s.unlocked) && s.unlocked.includes('pierce'), 'base cards are always unlocked');
      t.assert(Array.isArray(s.history) && Array.isArray(s.tierWins) && typeof s.codex === 'object' && s.codex);
      P.endRun(s, sum()); // still usable
    }
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    t.eq(P.load(boom).runs, 0);
    t.eq(P.store(boom, P.fresh()), false);
  },
};
