// Displays backed by the save (GDD §11): the title's record line, 다시 뽑기 and 밤의 깊이 on
// the preparation screen (and the depth choice written back), the codex statistics, stamps,
// unlock conditions with progress and the last runs, the result's unlocks, the settings, and
// a storage that throws.
'use strict';
const H = require('./_harness');

const KEY = 'before-dawn.save.v1';
const SAVE = {
  v: 1, runs: 7, wins: 1, bestFloor: 6, bestWinSec: 802.4, tierUnlocked: 2, tierSelected: 1, tierWins: [1, 0, 0, 0], rerollUnlocked: true,
  unlocked: ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'riposte', 'holy_light', 'armor_break', 'rest_of_dead', 'kings_hunt', 'chain_slash', 'flawless', 'sword_wave'],
  counters: { kills: 87, dodges: 9, mageKills: 13, questAwakened: 0, comboMaxed: 0 },
  codex: { pierce: { held: 3, wins: 1, best: 0 } },
  history: [
    { seed: 88123, tier: 1, result: 'death', cause: 'goblin:stab', floor: 4, sec: 512.3, cards: ['whirl', 'flame', 'rest_of_dead'] },
    { seed: 4511, tier: 0, result: 'win', cause: '', floor: 6, sec: 802.4, cards: ['pierce', 'lightning', 'chain_slash'] },
  ],
  settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: false }, lastSeed: 88123,
};
const preload = (save) => ({ fn: ([k, s]) => { try { if (!sessionStorage.getItem('bd-test-loaded')) { localStorage.setItem(k, s); sessionStorage.setItem('bd-test-loaded', '1'); } } catch (e) { /* ignore */ } }, arg: [KEY, JSON.stringify(save)] });
const stored = (T) => T.eval((k) => JSON.parse(localStorage.getItem(k)), KEY);
const has = (arr, s) => arr.some((x) => x === s);

module.exports = {
  async 'title, preparation and codex read the save; the depth choice is written back'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1', init: preload(SAVE) });
    try {
      t.assert(has(await T.texts(), '최고 기록: 옥상 · 승리 1회'), 'record line');
      await T.key('Enter');
      const prep = await T.texts();
      t.assert(has(prep, '다시 뽑기 (1)'), 'reroll offered once unlocked');
      t.assert(has(prep, '밤의 깊이  ◀  1  ▶'), 'depth starts at the saved choice');
      const seed = Number(prep.find((s) => /^시드 \d+$/.test(s)).slice(3));
      await T.tap('reroll', 'mouse');
      t.assert(has(await T.texts(), '다시 뽑기 (0)'), 'one reroll per night');
      const hand1 = await T.eval((seed) => window.BD.cardRt.dealHand(seed, window.__BD.app.save.unlocked, 1).map((id) => window.BD.cards.get(id).name), seed);
      for (const n of hand1) t.assert(has(await T.texts(), n), 'rerolled hand shown: ' + n);
      await T.tap('tier_inc', 'mouse');
      t.assert(has(await T.texts(), '밤의 깊이  ◀  2  ▶'));
      await T.tap('tier_inc', 'mouse');
      t.assert(has(await T.texts(), '밤의 깊이  ◀  2  ▶'), 'cannot pass the unlocked depth');
      t.eq((await stored(T)).tierSelected, 2, 'depth choice saved');
      await T.tap('ascend', 'mouse');
      const st = await T.state();
      t.eq([st.seed, st.tier], [seed, 2], 'run starts with the seed and depth shown');
      t.eq(st.cards.map((c) => c.id), await T.eval((seed) => window.BD.cardRt.dealHand(seed, window.__BD.app.save.unlocked, 1), seed), 'run starts with the rerolled hand');
      await T.eval(() => window.__BD.app.toTitle());
      await T.wait();
      await T.tap('codex', 'mouse');
      const cx = await T.texts();
      for (const s of ['판 수', '7', '1회', '옥상', '04:41 (13분 22초)', '보통 1 · 깊이1 0 · 깊이2 0', '87', '최근 2판']) t.assert(has(cx, s), 'codex shows ' + s);
      t.assert(cx.some((s) => /^승리 옥상 · 04:41$/.test(s)) && cx.some((s) => /^쓰러짐 4F · /.test(s)), 'last runs');
      await T.tap('card:tide', 'mouse');
      t.assert(has(await T.texts(), '해금: 누적 처치 150  (87/150)'), 'locked card: condition and progress');
      await T.tap('card:pierce', 'mouse');
      t.assert((await T.texts()).some((s) => /사용 3판 · 승리 1회/.test(s)), 'codex counts of an unlocked card');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'a finished run is saved and shows its unlocks; a fresh save has no reroll or depth'(t) {
    const fresh = Object.assign({}, SAVE, { runs: 2, wins: 0, bestFloor: 2, tierUnlocked: 0, tierSelected: 0, rerollUnlocked: false, history: [], codex: {}, settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: true } });
    const T = await H.open(H.variant(), { query: '?mute=1', init: preload(fresh) });
    try {
      await T.key('Enter');
      const prep = await T.texts();
      t.assert(!prep.some((s) => /다시 뽑기/.test(s)) && !prep.some((s) => /밤의 깊이/.test(s)), 'nothing locked is offered');
      await T.key('Enter');
      await T.eval(() => { const w = window.__BD.world(); w.t = 400; });
      await T.eval(() => window.__BD.app.giveUp());
      t.assert(await T.waitMode('result', 4000));
      t.assert((await T.texts()).some((s) => s === '출정 준비: 다시 뽑기'), 'third run unlocks the reroll, shown on the result');
      const s = await stored(T);
      t.eq([s.runs, s.rerollUnlocked, s.history.length], [3, true, 1], 'saved');
      t.eq(s.settings.hints, false, 'first-run hints switch off after a finished run');
      await T.tap('title', 'mouse');
      t.assert((await T.texts()).some((x) => /^최고 기록: .* · 승리 0회$/.test(x)));
    } finally { await T.close(); }
  },

  async 'settings change the save; wiping records keeps the settings'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1', init: preload(SAVE) });
    try {
      await T.tap('settings', 'mouse');
      await T.tap('volume_dec', 'mouse'); await T.tap('volume_dec', 'mouse');
      t.eq((await stored(T)).settings.sfx, 0.6);
      await T.tap('volume', 'mouse');
      t.eq((await stored(T)).settings.sfx, 0, '소리 toggles to off');
      t.assert(has(await T.texts(), '꺼짐'));
      await T.tap('volume', 'mouse');
      t.eq((await stored(T)).settings.sfx, 0.6, 'and back to the last volume');
      await T.tap('shake', 'mouse');
      await T.tap('dashSide', 'mouse');
      await T.tap('hints', 'mouse');
      let s = await stored(T);
      t.eq([s.settings.shake, s.settings.dashSide, s.settings.hints], [false, 'left', true]);
      await T.tap('wipe', 'mouse');
      t.eq((await stored(T)).runs, 7, 'first press only asks');
      await T.tap('wipe', 'mouse');
      s = await stored(T);
      t.eq([s.runs, s.wins, s.history.length, s.tierUnlocked], [0, 0, 0, 0], 'records wiped');
      t.eq([s.settings.sfx, s.settings.dashSide], [0.6, 'left'], 'settings kept');
      await T.tap('close', 'mouse');
      t.assert(has(await T.texts(), '최고 기록: — · 승리 0회'));
    } finally { await T.close(); }
  },

  async 'a storage that throws: every screen still works'(t) {
    const thrower = { fn: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); }, configurable: true }); }, arg: null };
    const T = await H.open(H.variant(), { query: '?mute=1', init: thrower });
    try {
      t.assert(has(await T.texts(), '최고 기록: — · 승리 0회'));
      await T.tap('settings', 'mouse'); await T.tap('shake', 'mouse'); await T.tap('close', 'mouse');
      await T.tap('codex', 'mouse'); await T.tap('back', 'mouse');
      await T.tap('sortie', 'mouse'); await T.tap('ascend', 'mouse');
      t.eq(await T.mode(), 'play');
      await T.eval(() => window.__BD.app.giveUp());
      t.assert(await T.waitMode('result', 4000));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },
};
