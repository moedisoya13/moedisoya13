// Whole bot runs with a spread of hands (every card at least twice, every family mixed, all 18
// unlocked so the altar can offer anything): no exceptions, no NaN, only allowed combo resets,
// and the cards' events show up. Plus the criterion-15 scenarios run on the stand-in enemies.
const { STANDINS } = require('./_kit');

const ALL = ['pierce', 'whirl', 'sword_wave', 'flame', 'lightning', 'tide', 'leech', 'riposte', 'drawcut', 'holy_light', 'armor_break', 'mana_backlash', 'rest_of_dead', 'kings_hunt', 'fire_pilgrimage', 'chain_slash', 'flawless', 'one_flash'];
const HANDS = [
  ['pierce', 'flame', 'leech'], ['whirl', 'lightning', 'chain_slash'], ['sword_wave', 'tide', 'riposte'],
  ['pierce', 'sword_wave', 'drawcut'], ['whirl', 'tide', 'flame'], ['lightning', 'holy_light', 'rest_of_dead'],
  ['armor_break', 'whirl', 'kings_hunt'], ['mana_backlash', 'pierce', 'fire_pilgrimage'], ['flame', 'one_flash', 'leech'],
  ['tide', 'lightning', 'flawless'], ['sword_wave', 'drawcut', 'one_flash'], ['riposte', 'flame', 'flawless'],
  ['holy_light', 'armor_break', 'mana_backlash'], ['rest_of_dead', 'kings_hunt', 'fire_pilgrimage'], ['chain_slash', 'flawless', 'one_flash'],
  ['whirl', 'fire_pilgrimage', 'riposte'], ['pierce', 'tide', 'kings_hunt'], ['lightning', 'leech', 'drawcut'],
];
const ALLOWED = { chain_slash: ['timeout', 'swap'], flawless: ['hurt', 'swap'], one_flash: ['too_close', 'swap'] };

function nanFree(o) {
  let ok = true;
  JSON.stringify(o, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) ok = false; return v; });
  return ok;
}

module.exports = {
  'bot runs over 18 hands × 2 seeds × tiers 0–3 finish without exceptions, NaN or bad resets'(t) {
    const BD = t.load();
    for (const hand of ALL) t.assert(HANDS.filter((h) => h.includes(hand)).length >= 2, hand + ' in ≥ 2 hands');
    const bad = [], seen = new Set(), results = {};
    let n = 0;
    HANDS.forEach((hand, i) => {
      for (const seed of [100 + i, 300 + i]) {
        const tier = n++ % 4;
        let w = null;
        const r = BD.simRun({
          seed, tier, hand, unlocked: ALL, maxSec: 1100, trial: seed % 2 === 0,
          onTick(app) {
            if (w === app.world) return;
            w = app.world;
            w.bus.on('combo_change', (ev) => { if (ev.to < ev.from && !ALLOWED[ev.cardId].includes(ev.reason)) bad.push(`${ev.cardId} ${ev.reason}`); });
            for (const name of ['hit', 'kill', 'vfx', 'quest_progress', 'combo_change', 'heal']) w.bus.on(name, (ev) => seen.add(name + ':' + (ev.source || ev.kind || ev.cardId || '')));
          },
        });
        results[r.result] = (results[r.result] || 0) + 1;
        if (!['win', 'death', 'timeout'].includes(r.result)) bad.push('result ' + r.result);
        if (!nanFree(BD.dump(r.app))) bad.push(hand + ': NaN in the dump');
      }
    });
    t.eq(bad, []);
    const want = ['hit:pierce', 'hit:whirl', 'hit:wave', 'hit:chain', 'hit:burn', 'hit:riposte', 'hit:slam', 'vfx:chain_bolt', 'vfx:splash', 'combo_change:chain_slash', 'heal:leech'];
    // undead only spawn once the enemies agent's bundles are merged
    if (BD.gen.bundles.has('undead')) want.push('vfx:holy_cross', 'quest_progress:rest_of_dead');
    for (const k of want) t.assert(seen.has(k), 'never saw ' + k);
  },
  'criterion 15 scenarios (tools/scenarios.js) pass on the stand-in enemies'(t) {
    const BD = t.load({ extraFiles: [STANDINS] });
    const out = require('../../tools/scenarios').run(BD);
    t.eq(out.filter((x) => !x.ok).map((x) => x.name + ': ' + x.why), []);
    t.eq(out.length, 4);
  },
};
