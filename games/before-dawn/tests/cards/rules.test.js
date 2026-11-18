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
    t.eq(['chain_slash', 'flawless', 'one_flash'].map((id) => BD.cards.get(id).maxStack), [10, 6, 8]); // chain_slash: GDD-V2 §4.4 (v1 5)
    t.eq(['rest_of_dead', 'kings_hunt', 'fire_pilgrimage'].map((id) => BD.cards.get(id).goal), [150, 5, 150]); // GDD-V2 §4.4 (v1 12, 3, 12)
    for (const id of Object.keys(GDD)) if (GDD[id][1] === 'unlock') t.assert(typeof BD.cards.get(id).unlockText === 'string', id + ' unlockText');
    t.eq(BD.progress.fresh().unlocked.slice().sort(), ['armor_break', 'chain_slash', 'flame', 'flawless', 'holy_light', 'kings_hunt', 'leech', 'lightning', 'pierce', 'rest_of_dead', 'riposte', 'whirl']);
  },
  // GDD-V2 §8: 해류 4000 kills (v1 150), 마력 역류 1200 magic-type kills (v1 20 mages); the rest as v1
  'unlocks are evaluated at run end from the save counters (GDD §11, GDD-V2 §8)'(t) {
    const { BD } = world(t);
    const save = BD.progress.fresh();
    t.eq(save.counters.magicKills, 0);
    const sum = { result: 'death', floor: 3, sec: 300, kills: 4000, dodges: 15, heldIds: [], cards: [], seed: 1, tier: 0, cause: '', run: { mageKills: 20, magicKills: 1200, questAwakened: 1, comboMaxed: 1 } };
    const news = BD.progress.endRun(save, sum).filter((x) => x.kind === 'card').map((x) => x.id).sort();
    t.eq(news, ['drawcut', 'fire_pilgrimage', 'mana_backlash', 'one_flash', 'sword_wave', 'tide']);
    t.eq(save.counters.magicKills, 1200);
    const save2 = BD.progress.fresh();
    const none = BD.progress.endRun(save2, Object.assign({}, sum, { floor: 2, kills: 3999, dodges: 14, run: { mageKills: 999, magicKills: 1199, questAwakened: 0, comboMaxed: 0 } }));
    t.eq(none.filter((x) => x.kind === 'card'), []);
    // two runs add up; a run summary counts magic-type kills (the engine's w.stats.magicKills)
    BD.progress.endRun(save2, Object.assign({}, sum, { floor: 2, kills: 1, dodges: 0, run: { mageKills: 0, magicKills: 1, questAwakened: 0, comboMaxed: 0 } }));
    t.eq(save2.unlocked.filter((id) => ['tide', 'mana_backlash'].includes(id)).sort(), ['mana_backlash', 'tide']);
    const { BD: B2, w } = world(t);
    B2.combat.kill(w, B2.W.makeEnemy(w, 'mana_slime', w.hero.x + 3, w.hero.y, {}));
    B2.combat.kill(w, B2.W.makeEnemy(w, 'goblin', w.hero.x + 3, w.hero.y, {}));
    t.eq(B2.progress.summary(w, 'death', null).run.magicKills, 1);
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
  // GDD-V2 §4.6: the altar offers three unlocked cards that are not equipped; 1F–4F 50 % the first is
  // the next floor's target card; quests only while feasible (§4.4). Every card has levels now, so
  // the whole pool is dealt and offered again.
  'altar offers (v2): three distinct unlocked cards, never equipped; the target rule; quests only when feasible'(t) {
    const { BD, H, w } = world(t);
    const full = Object.keys(GDD);
    t.eq(BD.cards.ids().filter((id) => BD.cards.get(id).levels).sort(), full.slice().sort());
    t.eq(BD.cardRt.pool(full).slice().sort(), full.slice().sort());
    t.eq(BD.cardRt.pool(BD.progress.fresh().unlocked).length, 12);
    const hand = ['pierce', 'flame', 'leech'];
    let targetFirst = 0, n = 0, quests = 0;
    for (let s = 1; s <= 60; s++) {
      const run = BD.gen.run(s, 0);
      for (let f = 1; f <= 5; f++) {
        const fake = { run, floorN: f, floor: run.floors[f], cards: hand.map((id) => ({ id })), unlocked: full };
        const o = BD.cardAltar.offers(fake);
        t.eq(o.length, 3, `seed ${s} ${f}F`);
        t.eq(new Set(o).size, 3);
        for (const id of o) t.assert(full.includes(id) && !hand.includes(id), id);
        t.eq(BD.cardAltar.offers(fake), o, 'same floor, same offers');
        const info = BD.cardAltar.remaining(run, f);
        for (const id of o) {
          const d = BD.cards.get(id);
          if (d.family === 'quest') { quests++; t.assert(d.offerable(info), `${id} offered on ${f}F with ${info.domTypes}`); }
        }
        const d0 = BD.cards.get(o[0]);
        if (f <= 4) { n++; if (d0.family === 'target' && d0.targetType === run.floors[f].nextDomType) targetFirst++; }
        if (f === 5) t.assert(o.every((id) => BD.cards.get(id).family !== 'quest'), '5F: no quest is feasible');
      }
    }
    t.assert(targetFirst / n > 0.4 && targetFirst / n < 0.75, 'target first ' + targetFirst + '/' + n);
    t.assert(quests > 10, 'quests are offered where feasible: ' + quests);
    // the base pool only: never a locked card
    const run = BD.gen.run(3, 0);
    for (let f = 1; f <= 5; f++) {
      const o = BD.cardAltar.offers({ run, floorN: f, floor: run.floors[f], cards: hand.map((id) => ({ id })), unlocked: BD.progress.fresh().unlocked });
      for (const id of o) t.eq(BD.cards.get(id).unlock, 'base', id);
    }
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
