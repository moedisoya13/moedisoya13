// HUD and card feedback (GDD §9.2–9.3), sounds (§10), feel (hit-stop, ink, sound words),
// caps (§0). Runs against the real 18 cards; enemies not yet merged are stand-ins from
// tests/ui/fixtures/standins.js.
'use strict';
const H = require('./_harness');

const GDD_CARDS = ['pierce', 'whirl', 'sword_wave', 'flame', 'lightning', 'tide', 'leech', 'riposte', 'drawcut', 'holy_light', 'armor_break', 'mana_backlash', 'rest_of_dead', 'kings_hunt', 'fire_pilgrimage', 'chain_slash', 'flawless', 'one_flash'];
const GDD_SFX = ['slash', 'hit', 'pierce', 'hit_guard', 'whirl', 'hit_type', 'wave', 'kill', 'ignite', 'chain', 'splash', 'steam', 'slam', 'dash', 'dodge', 'hurt', 'heal_small', 'flask', 'telegraph', 'arrow', 'fire_circle', 'blink', 'charge', 'spawn', 'guardian_in', 'guardian_down', 'stairs_open', 'altar_open', 'card_set', 'quest_tick', 'awaken', 'combo_up', 'combo_max', 'combo_warn', 'combo_break', 'riposte', 'charge_ready', 'boss_roar', 'boss_cleave', 'thorns', 'dawn_bell', 'death', 'win', 'ui_ok', 'ui_move'];

async function playing(t, hand, extra) {
  const T = await H.open(H.variant(), { query: '?seed=5&hand=' + hand + '&mute=1&nosave=1' + (extra || '') });
  await T.key('Enter');
  t.eq(await T.mode(), 'play');
  // a stable state: the room emptied, then the hand dealt again, so the kills of the clear-out
  // (real undead count toward 망자의 안식, any kill feeds 연참) leave no progress or stacks behind
  await T.eval(() => {
    const B = window.__BD, w = B.world();
    B.killAll(); w.wave.n = 3; w.freezeT = 0;
    const ids = w.cards.map((c) => c && c.id);
    ids.forEach((id, i) => { if (id) window.BD.cardRt.unequip(w, i); });
    ids.forEach((id, i) => { if (id) B.give(id, i); });
  });
  t.eq(await T.eval(() => window.__BD.world().cards.filter((c) => c && (c.state.progress || c.state.stack)).map((c) => c.id)), [], 'no progress or stacks left from the clear-out');
  return T;
}
const toasts = (T) => T.eval(() => window.BD.ui.S.toasts.map((x) => x.text));
const has = (arr, s) => arr.some((x) => x === s);

module.exports = {
  async 'every GDD card id has a drawn icon; unknown ids fall back to the name'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1' });
    try {
      const r = await T.eval((ids) => {
        const IC = window.BD.ui.icons;
        const missing = ids.filter((id) => !IC.cardDrawer({ id }));
        const c = document.createElement('canvas').getContext('2d');
        for (const id of ids) IC.card(c, { id, name: id }, 32, 32, 64);
        IC.card(c, { id: 'nobody_knows', name: '시험 성인', family: 'quest' }, 32, 32, 64);
        return { missing, fallback: IC.cardDrawer({ id: 'nobody_knows', name: '시험' }) };
      }, GDD_CARDS);
      t.eq(r.missing, [], 'icons for all 18 ids');
      t.eq(r.fallback, null, 'unknown id has no drawer (name seal is drawn instead)');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'slots: quest progress and awakening, combo stacks, max, stage badge, reset reasons'(t) {
    const T = await playing(t, 'rest_of_dead,chain_slash,flawless');
    try {
      const goal = await T.eval(() => window.__BD.world().cards[0].state.goal); // GDD-V2 §4.4: 150 (v1 12)
      await T.eval(() => { const w = window.__BD.world(); window.BD.cardRt.addProgress(w, w.cards[0], 7); });
      await T.wait();
      t.assert(has(await T.texts(), '7/' + goal), 'quest progress in the slot');
      await T.eval((g) => { const w = window.__BD.world(); window.BD.cardRt.addProgress(w, w.cards[0], g - 9); }, goal);
      await T.wait();
      t.assert(has(await toasts(T), '망자의 안식: 앞으로 2'), 'two to go');
      await T.eval(() => { const w = window.__BD.world(); window.BD.cardRt.addProgress(w, w.cards[0], 2); });
      await T.wait();
      // GDD §5.4: once awakened the slot turns gold for good; the card's own hud() shows 각성
      t.assert(has(await T.texts(), '각성'), 'awakened slot text');
      t.assert(!(await T.texts()).includes(goal + '/' + goal), 'the count is replaced');
      t.eq(await T.eval(() => { const w = window.__BD.world(); return window.BD.ui.cards.hud(w, w.cards[0]).awakened; }), true, 'gold frame state');
      t.assert(has(await toasts(T), '각성: 망자의 안식'), 'awaken toast');
      t.assert((await T.texts()).includes('각성: 망자의 안식'), 'awaken banner');
      t.assert(await T.eval(() => window.BD.ui.S.slots[0].burstAt > 0), 'gold burst on the slot');
      // combo up to max (연참: 10 at level 1, GDD-V2 §4.4; v1 5)
      for (let i = 1; i <= 10; i++) await T.eval((i) => { const w = window.__BD.world(); window.BD.cardRt.setStack(w, w.cards[1], i, 'gain'); }, i);
      await T.wait();
      t.assert(has(await T.texts(), '×10'), 'stack in the slot');
      t.assert(has(await toasts(T), '연참 ×10'), 'max toast');
      // timeout reset (staged like the card does it): the reason in words
      await T.eval(() => { const w = window.__BD.world(); window.BD.cardRt.setStack(w, w.cards[1], 0, 'timeout'); });
      await T.wait();
      t.assert(has(await T.texts(), '×0'));
      t.assert(has(await toasts(T), '연참 끊김: 2초 동안 처치가 없었다'), 'timeout reason (GDD-V2: 2 s without a kill)');
      t.assert(await T.eval(() => window.BD.ui.S.slots[1].shakeAt > 0), 'slot shakes');
      // stage badge and a hurt reset with the attack named
      await T.eval(() => { const w = window.__BD.world(); for (let i = 1; i <= 4; i++) window.BD.cardRt.setStack(w, w.cards[2], i, 'gain'); });
      await T.wait(120);
      t.assert(has(await T.texts(), '칼 길이↑'), 'stage badge for 무결 ×4');
      await T.eval(() => {
        const w = window.__BD.world(), BD = window.BD;
        const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 2, w.hero.y, {});
        w.hero.invuln = 0; w.hero.dashInvuln = 0;
        BD.W.hurtHero(w, 6, { source: 'goblin', attack: 'stab', enemyId: g.id, x: g.x, y: g.y });
        BD.cardRt.setStack(w, w.cards[2], 0, 'hurt');
      });
      await T.wait();
      t.assert(has(await toasts(T), '무결 깨짐: 고블린의 찌르기'), 'hurt reason names the attack');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'combo timer warning, target glow, pips and rings come from card state'(t) {
    const T = await playing(t, 'holy_light,leech,chain_slash');
    try {
      await T.eval(() => { const w = window.__BD.world(), BD = window.BD; w.floor.domType = 'undead'; BD.cardRt.setStack(w, w.cards[2], 2, 'gain'); w.cards[2].state.timer = 0.5; w.cards[1].state.kills = 2; BD.W.makeEnemy(w, 'goblin', w.hero.x + 4, w.hero.y + 4, {}).stunT = 99; });
      await T.wait(120);
      const hud = await T.eval(() => { const w = window.__BD.world(), CI = window.BD.ui.cards; return w.cards.map((c) => CI.hud(w, c)); });
      t.eq(hud[0].glow, true, 'target card glows on a floor of its type');
      t.near(hud[1].ring, 2 / 80, 1e-9, 'leech ring: 2 of 80 kills (GDD-V2 §4.4; v1 pips of 4)');
      t.eq(hud[2].warn, true, 'combo timer under 1 s warns');
      t.assert(await T.eval(() => window.BD.ui.S.slots[2].warn), 'slot warning state');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  // GDD-V2 §7.1: a fodder kill leaves ink but no sound word and no hit-stop (several die every
  // second); a threat's kill keeps the word. Staged in a room that fits the screen so the decal
  // layer is in screen pixels.
  // GDD-V2 §3.7: kill marks are a pool of 150 (not baked into a floor-wide canvas); only a
  // guardian (or the boss) bakes its splat for good
  async 'kills leave pooled ink marks (a guardian bakes); threats get a sound word, fodder does not; hit-stop holds the world at speed 1'(t) {
    const T = await playing(t, 'pierce');
    try {
      await T.eval(() => { window.__BD.stage({ size: [12, 12], enemies: 0 }); });
      await T.wait(200); // the renderer sets up the new floor's decal layer on its next frame
      const r = await T.eval(() => {
        const B = window.__BD, BD = window.BD;
        const w = B.world(); w.freezeT = 0;
        BD.ui.S.letters.length = 0;
        const marks = BD.ui.feel.marks;
        const markAt = (e) => marks.some((m) => Math.abs(m.x - e.x) < 0.01 && Math.abs(m.y - e.y) < 0.01);
        const ink = (e) => {
          const v = B.ui.view, [sx, sy] = v.proj(e.x, e.y);
          const c = BD.client.render.bakeCanvas, k = c.width / 1280;
          const d = c.getContext('2d').getImageData(Math.round((sx - 20) * k), Math.round((sy - 10) * k), Math.round(40 * k), Math.round(20 * k)).data;
          let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 120) n++;
          return n;
        };
        const f = BD.W.makeEnemy(w, 'goblin', 4.5, 6, {});
        BD.combat.kill(w, f);
        const fodder = { mark: markAt(f), baked: ink(f), letters: BD.ui.S.letters.length, hold: B.ui.hold };
        const e = BD.W.makeEnemy(w, 'slime', 7.5, 6, {});
        BD.combat.kill(w, e);
        const threat = { mark: markAt(e), letters: BD.ui.S.letters.map((l) => l.text) };
        const gd = BD.W.makeEnemy(w, 'goblin', 6, 8.5, { guardian: true });
        BD.combat.kill(w, gd);
        return { fodder, threat, guardianInk: ink(gd) };
      });
      t.assert(r.fodder.mark, 'a pooled mark at the fodder kill');
      t.eq(r.fodder.baked, 0, 'nothing baked for fodder');
      t.eq([r.fodder.letters, r.fodder.hold], [0, 0], 'no word, no hit-stop for fodder');
      t.assert(r.threat.mark, 'a pooled mark at the threat kill');
      t.assert(r.threat.letters.length >= 1 && ['쾅!', '서걱!'].includes(r.threat.letters[0]), 'threat lettering ' + r.threat.letters);
      t.assert(r.guardianInk > 20, 'a guardian bakes its splat: ' + r.guardianInk);
      await T.wait(400);
      await T.eval(() => window.BD.ui.feel.hitstop(0.4, true));
      const t0 = (await T.state()).t;
      await T.wait(150);
      const t1 = (await T.state()).t;
      t.eq(t1, t0, 'world held during the hit-stop');
      await T.wait(500);
      const t2 = (await T.state()).t;
      t.assert(t2 > t1, 'world runs again');
      t.eq(await T.eval(() => [window.__BD.params.speed, window.__BD.ui.hold]), [1, 0], 'hold released, speed untouched');
    } finally { await T.close(); }
  },

  async 'every §10 sound is registered, silent before the first gesture, plays after it'(t) {
    const T = await H.open(H.variant(), { query: '?nosave=1' });
    try {
      const reg = await T.eval((ids) => ids.filter((id) => !window.BD.ui.sfx.has(id)), GDD_SFX);
      t.eq(reg, [], 'all GDD sound ids registered');
      const atk = await T.eval(() => window.BD.enemies.all().flatMap((d) => Object.entries(d.attacks).flatMap(([a, v]) => ['sfx', 'sfxStart'].filter((k) => v[k] && !window.BD.ui.sfx.has(v[k])).map((k) => d.id + '.' + a + '.' + k + '=' + v[k]))));
      t.eq(atk, [], 'every enemy attack sound names a registered sound');
      t.eq(await T.eval(() => window.BD.client.audio.ac), null, 'no AudioContext before input');
      await T.page.mouse.click(5, 5);
      await T.wait();
      const r = await T.eval((ids) => {
        const errs = [];
        for (const id of ids) { try { window.BD.client.sfx(id, { stack: 3 }); } catch (e) { errs.push(id + ': ' + e.message); } }
        return { ac: !!window.BD.client.audio.ac, errs };
      }, GDD_SFX);
      t.assert(r.ac, 'AudioContext after a gesture');
      t.eq(r.errs, []);
      await T.wait(300);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'a bot run at speed 8 keeps particles within the cap and draws without errors'(t) {
    const T = await H.open(H.variant(), { query: '?seed=3&bot=1&speed=8&mute=1&nosave=1' });
    try {
      await T.key('Enter');
      let max = 0;
      for (let i = 0; i < 24; i++) { await T.wait(250); max = Math.max(max, (await T.state()).particles || 0); }
      t.assert(max <= 300, 'particles ≤ 300: ' + max);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },
};
