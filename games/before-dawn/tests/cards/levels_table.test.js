// GDD-V2 §4.4 as data: the numbers of all 18 cards at every level, transcribed from the GDD table
// (not from the card files), checked against each card's merged level numbers (BD.cardRt.lv). A
// number tuned away from the GDD is written here as the tuned value with the GDD value beside it;
// every such change is listed in docs/requests/v2-cards.md under "tuning".
// What each level does on the field is in levels.test.js (the six slice cards) and
// levels_more.test.js (the other twelve).
const { world } = require('./_kit');

// one row per level: what that level changes (cumulative like the GDD table)
const GDD = {
  pierce: [{ len: 4.2, width: 0.9, factor: 1.0, push: 0, back: 0 }, { len: 5.4 }, { width: 1.3, push: 0.6 }, { len: 6.6, factor: 1.2 }, { back: 0.7 }],
  whirl: [{ factor: 0.7, plus: 0, ring: 0 }, { factor: 0.85 }, { plus: 0.4 }, { factor: 1.0 }, { ring: 0.6 }],
  sword_wave: [{ range: 6.5, width: 1.0, factor: 0.6, pierce: 2, spread: [0] }, { factor: 0.8 }, { spread: [0, -16, 16] }, { pierce: 4, width: 1.3 }, { spread: [0, -16, 16, -32, 32], range: 8 }],
  flame: [{ dmg: 3, dur: 3, spread: 0.6, scar: 0 }, { dmg: 4 }, { spread: 1.0 }, { dmg: 5, dur: 4 }, { scar: 5 }],
  lightning: [{ range: 3.0, jumps: 3, jumpsWet: 5, pct: 0.6, pctWet: 1.0, bolt: 0 }, { jumps: 4, jumpsWet: 6 }, { pct: 0.8 }, { jumps: 6, jumpsWet: 8, range: 3.5 }, { bolt: 1.5 }],
  tide: [{ push: 1.2, wet: 4, slam: 8, bump: 0, wave: 0 }, { slam: 14 }, { push: 1.8, bump: 6 }, { wet: 6, slam: 20 }, { wave: 0.8 }],
  leech: [{ every: 80, heal: 4, big: 10, overflow: 0, ring: 0 }, { every: 70 }, { heal: 5, overflow: 5 }, { every: 60 }, { ring: 20 }],
  riposte: [{ r: 2.6, hurt: 2, dodge: 3, cd: 2.0, dashEnd: false }, { r: 3.2 }, { cd: 1.2 }, { hurt: 3, dodge: 4 }, { dashEnd: true }],
  drawcut: [{ need: 8, mult: 2.5, reach: 0.6, half: 0, circle: false }, { mult: 3.0 }, { need: 6 }, { reach: 1.0, half: 30 }, { circle: true }],
  holy_light: [{ flat: 8, burst: 0, every: 0 }, { flat: 12 }, { burst: 12 }, { flat: 16, burst: 18 }, { every: 10 }],
  armor_break: [{ per: 15, burst: 0, royal: false, empower: false }, { per: 20 }, { burst: 25 }, { royal: true }, { empower: true }],
  mana_backlash: [{ flat: 5, r: 1.8, dmg: 12, any: false }, { flat: 8 }, { r: 2.4 }, { dmg: 18 }, { any: true }],
  rest_of_dead: [{ goal: 150, before: 4, all: 3, undead: 10, r: 1.8, dmg: 20, every: 0 }, { before: 6, goal: 120 }, { r: 2.4 }, { all: 5, undead: 14 }, { every: 8 }],
  kings_hunt: [{ flat: 3, mult: 1.6, shard: 0, first: 0 }, { flat: 6 }, { shard: 25 }, { mult: 1.9 }, { first: 3 }],
  fire_pilgrimage: [{ every: 4, r: 1.5, dmg: 12, immune: false, trail: 0 }, { every: 3 }, { immune: true, r: 2.0 }, { dmg: 18 }, { trail: 5 }],
  chain_slash: [{ per: 10, limit: 2.0, perStack: 1, haste: 0, burst: 0 }, { limit: 2.5 }, { haste: 0.12 }, { perStack: 1.5 }, { maxStack: 15, burst: 5 }],
  flawless: [{ per: 25, reach: 0.4, echo: 0.5, block: false }, { per: 20 }, { block: true }, { echo: 0.75, reach: 0.6 }, { maxStack: 8 }],
  one_flash: [{ tip: 0.7, perStack: 1, pierceAt: 4, flash: 0 }, { tip: 0.9 }, { perStack: 1.5 }, { pierceAt: 3 }, { flash: 1.5 }],
};
// level-1 values that live on the def rather than in levels (GDD-V2 §4.4)
const DEF = { chain_slash: { maxStack: 10 }, flawless: { maxStack: 6 }, one_flash: { maxStack: 8 }, rest_of_dead: { goal: 150 }, kings_hunt: { goal: 5 }, fire_pilgrimage: { goal: 150 } };

module.exports = {
  'all 18 cards: five levels, each with its choice line, numbers as GDD-V2 §4.4 at every level'(t) {
    const { BD } = world(t);
    t.eq(Object.keys(GDD).sort(), BD.cards.ids().filter((id) => !id.startsWith('test_')));
    for (const [id, rows] of Object.entries(GDD)) {
      const d = BD.cards.get(id);
      t.eq(d.levels.length, 6, id);
      t.eq(BD.cardRt.maxLevel(d), 5, id);
      let want = {};
      for (let L = 1; L <= 5; L++) {
        t.assert(typeof d.levels[L].text === 'string' && d.levels[L].text.length >= 4, `${id} ${L}: text`);
        want = Object.assign({}, want, rows[L - 1]);
        const got = Object.assign({}, BD.cardRt.lv(d, L));
        for (const k of Object.keys(want)) t.eq(got[k], want[k], `${id} level ${L}: ${k}`);
      }
      for (const [k, v] of Object.entries(DEF[id] || {})) t.eq(d[k], v, `${id}.${k}`);
    }
  },
  'every level line is shown on the choice: the line of the level it brings (levelText)'(t) {
    const { BD } = world(t);
    for (const id of Object.keys(GDD)) {
      const d = BD.cards.get(id);
      for (let L = 1; L <= 5; L++) t.eq(BD.cardRt.levelText(d, L), d.levels[L].text, id + ' ' + L);
      const lines = d.levels.slice(1).map((x) => x.text);
      t.eq(new Set(lines).size, 5, id + ': five different lines');
    }
  },
};
