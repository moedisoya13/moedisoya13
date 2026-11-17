// The card set as data (GDD §5.3–5.6, §11): ids, families, unlocks, icons, the start hand and
// altar rules that the card data feeds, the HUD contract.
const { world } = require('./_kit');

const GDD = {
  pierce: ['shape', 'base'], whirl: ['shape', 'base'], sword_wave: ['shape', 'unlock'],
  flame: ['element', 'base'], lightning: ['element', 'base'], tide: ['element', 'unlock'],
  leech: ['trigger', 'base'], riposte: ['trigger', 'base'], drawcut: ['trigger', 'unlock'],
  holy_light: ['target', 'base'], armor_break: ['target', 'base'], mana_backlash: ['target', 'unlock'],
  rest_of_dead: ['quest', 'base'], kings_hunt: ['quest', 'base'], fire_pilgrimage: ['quest', 'unlock'],
  chain_slash: ['combo', 'base'], flawless: ['combo', 'base'], one_flash: ['combo', 'unlock'],
};

module.exports = {
  'the 18 GDD cards are registered with their family, unlock kind and icon = id'(t) {
    const { BD } = world(t);
    const ids = BD.cards.ids().filter((id) => !id.startsWith('test_'));
    t.eq(ids, Object.keys(GDD).sort());
    for (const [id, [fam, unlock]] of Object.entries(GDD)) {
      const d = BD.cards.get(id);
      t.eq(d.family, fam, id);
      t.eq(d.unlock === 'base' ? 'base' : 'unlock', unlock, id);
      t.eq(d.icon, id, id + ' icon');
      t.assert(typeof d.desc === 'string' && d.desc.length > 10, id + ' desc');
    }
    t.eq(['tide', 'lightning', 'flame'].map((id) => BD.cards.get(id).element), ['tide', 'lightning', 'flame']);
    t.eq(['holy_light', 'armor_break', 'mana_backlash'].map((id) => BD.cards.get(id).targetType), ['undead', 'heavy', 'magic']);
    t.eq(['chain_slash', 'flawless', 'one_flash'].map((id) => BD.cards.get(id).maxStack), [5, 6, 8]);
    t.eq(['rest_of_dead', 'kings_hunt', 'fire_pilgrimage'].map((id) => BD.cards.get(id).goal), [12, 3, 12]);
    t.eq(BD.progress.fresh().unlocked.slice().sort(), ['armor_break', 'chain_slash', 'flame', 'flawless', 'holy_light', 'kings_hunt', 'leech', 'lightning', 'pierce', 'rest_of_dead', 'riposte', 'whirl']);
  },
  'unlocks are evaluated at run end from the save counters (GDD §11)'(t) {
    const { BD } = world(t);
    const save = BD.progress.fresh();
    const sum = { result: 'death', floor: 3, sec: 300, kills: 150, dodges: 15, heldIds: [], cards: [], seed: 1, tier: 0, cause: '', run: { mageKills: 20, questAwakened: 1, comboMaxed: 1 } };
    const news = BD.progress.endRun(save, sum).filter((x) => x.kind === 'card').map((x) => x.id).sort();
    t.eq(news, ['drawcut', 'fire_pilgrimage', 'mana_backlash', 'one_flash', 'sword_wave', 'tide']);
    const save2 = BD.progress.fresh();
    const none = BD.progress.endRun(save2, Object.assign({}, sum, { floor: 2, kills: 149, dodges: 14, run: { mageKills: 19, questAwakened: 0, comboMaxed: 0 } }));
    t.eq(none.filter((x) => x.kind === 'card'), []);
  },
  'start hand (§5.6): 3 distinct, ≤ 1 quest/combo, ≥ 1 shape/element — base pool and full pool, rerolls too'(t) {
    const { BD } = world(t);
    const full = Object.keys(GDD);
    for (const pool of [BD.progress.fresh().unlocked, full]) for (let s = 1; s <= 500; s++) for (const rr of [0, 1]) {
      const h = BD.cardRt.dealHand(s, pool, rr);
      const fam = h.map((id) => BD.cards.get(id).family);
      t.eq(h.length, 3); t.eq(new Set(h).size, 3);
      t.assert(fam.filter((f) => f === 'quest' || f === 'combo').length <= 1, `seed ${s}: ${h}`);
      t.assert(fam.some((f) => f === 'shape' || f === 'element'), `seed ${s}: ${h}`);
    }
  },
  'altar offers (§5.6): quests only on 1F–3F and only when still feasible; 왕의 사냥 only on 1F–2F'(t) {
    const { BD } = world(t);
    const full = Object.keys(GDD);
    let questOffers = 0;
    for (let s = 1; s <= 120; s++) {
      const run = BD.gen.run(s, 0);
      for (let n = 1; n <= 5; n++) for (let round = 0; round < 2; round++) {
        const o = BD.cardRt.offers(run, n, round, ['pierce', 'flame', 'leech'], [], full);
        const info = BD.cardRt.remaining(run, n);
        for (const id of o) {
          const d = BD.cards.get(id);
          if (d.family !== 'quest') continue;
          questOffers++;
          t.assert(n <= 3, `${id} offered on ${n}F`);
          t.assert(d.offerable(info), `${id} offered while infeasible on ${n}F`);
          if (id === 'kings_hunt') t.assert(n <= 2, 'kings_hunt on ' + n + 'F');
        }
        t.eq(o.length, 2);
      }
    }
    t.assert(questOffers > 0, 'quests do get offered');
  },
  'every card hud() returns only the documented slot fields'(t) {
    const { BD, H, w } = world(t, { hand: [] });
    const ok = ['text', 'ring', 'pips', 'glow', 'badge', 'flash', 'warn'];
    for (const id of Object.keys(GDD)) {
      BD.cardRt.equip(w, 0, id);
      const c = w.cards[0];
      const hd = c.def.hud(c.state, BD.cardRt.ctx(w, c)) || {};
      for (const k of Object.keys(hd)) t.assert(ok.includes(k), `${id}: unexpected hud field ${k}`);
      if (hd.ring !== undefined) t.assert(hd.ring >= 0 && hd.ring <= 1, `${id}: ring ${hd.ring}`);
      if (c.def.family === 'combo') t.eq(hd.text, '×0', id);
      if (c.def.family === 'quest') t.eq(hd.text, '0/' + c.def.goal, id);
      BD.cardRt.unequip(w, 0, 'swap');
    }
  },
  'every vfx kind a card emits has a drawer, every card drawer is registered once'(t) {
    const { BD } = world(t);
    const kinds = ['ignite', 'steam_puff', 'chain_bolt', 'splash', 'leech_ink', 'leech_heal', 'drawcut_ready', 'drawcut_flash', 'holy_cross',
      'armor_shards', 'mana_chain', 'mana_burst', 'rod_glow', 'rod_rim', 'rod_burst', 'quest_mote', 'royal_heal', 'pilgrim_flare', 'pilgrim_burst', 'combo_label'];
    for (const k of kinds) t.assert(BD.render.vfx.has(k), 'vfx ' + k);
    for (const k of ['pierce', 'whirl', 'riposte', 'flawless', 'one_flash']) t.assert(BD.render.trails.has(k), 'trail ' + k);
    t.assert(BD.render.projectiles.has('wave'));
    for (const k of ['riposte_flash', 'drawcut_feet', 'drawcut_blade', 'mana_chains', 'kings_hunt_mark', 'pilgrim_blade', 'chain_slash_ring', 'combo_afterglow', 'one_flash_band']) t.assert(BD.render.decor.has(k), 'decor ' + k);
  },
};
