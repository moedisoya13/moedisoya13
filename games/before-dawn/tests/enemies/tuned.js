// Enemy numbers tuned away from GDD-V2 (not a test file): { key: [GDD-V2 value, tuned value] }.
//   '<kind>.<path>'        an enemy def field (numbers.test.js GDD table)
//   'row.<col>.<floor>'    a column of BD.C.DIRECTOR.floors (hp, dmg, melee, ranged, threatEvery, threatCap,
//                          eliteEvery), set by src/content/floors/00_rows.js
//   'eliteHp.<floor>'      BD.foes.T.eliteHp      'guardianHp.<floor>'  BD.C.GUARDIAN.hp (00_rows.js)
// Each entry has its reason in docs/requests/v2-enemies.md, "tuning" (human-like pilot, seeds 1–100).
'use strict';

module.exports = {
  // threats live longer and swing more often: with the GDD-V2 numbers they died before their first or
  // second attack (the pilot took 1.5 hits a minute and won 60 % of runs, mostly safe)
  'slime.hp': [30, 45], 'slime.dmg': [10, 14], 'slime.T.cd': [2.2, 1.8],
  'skel_archer.hp': [20, 35], 'skel_archer.dmg': [8, 12], 'skel_archer.T.cd': [2.4, 1.8],
  'ghoul.hp': [45, 70], 'ghoul.dmg': [12, 18], 'ghoul.T.cd': [2.0, 1.6],
  'mage.hp': [30, 50], 'mage.T.cd': [3.0, 2.4],
  // the charge was half of all damage taken and of all deaths before the rooftop: less per hit
  'dark_knight.hp': [120, 160], 'dark_knight.dmg': [18, 11], 'dark_knight.T.cd': [3.5, 3.0],
  // the rooftop killed 1 in 9 who reached it; the boss's v1 damage was made for a room of 13 × 13
  'demon_king.T.cleave.dmg': [22, 46], 'demon_king.T.bolts.dmg': [12, 22], 'demon_king.T.thorns.dmg': [18, 36], 'demon_king.T.collapse.dmg': [20, 38],
  // more minions on the rooftop (the slice had raised 8 / 12 / 16 at 2.0/s to 10 / 14 / 18 at 2.6/s): the only light in the
  // boss fight, and the longest wait for a choice (§10.1 #12) fell there
  'row.phases.6': [[8, 12, 16], [12, 16, 20]], 'row.rate.6': [2.0, 3.2],
  // §9.2 knob ①: damage of regular enemies by floor (deaths spread over 2F–5F)
  'row.dmg.1': [1.0, 1.3], 'row.dmg.2': [1.0, 1.8], 'row.dmg.3': [1.15, 2.2], 'row.dmg.4': [1.15, 2.7], 'row.dmg.5': [1.3, 3.1], 'row.dmg.6': [1.15, 1.9],
  // knob ②: more ranged wind-ups and threats at once, threats more often
  'row.ranged.2': [2, 3], 'row.ranged.4': [3, 4], 'row.ranged.5': [3, 4],
  'row.threatEvery.1': [8, 6], 'row.threatEvery.2': [8, 6], 'row.threatEvery.3': [7, 5], 'row.threatEvery.4': [6, 5], 'row.threatEvery.5': [5, 4],
  'row.threatCap.2': [3, 4], 'row.threatCap.3': [4, 5], 'row.threatCap.4': [5, 6], 'row.threatCap.5': [6, 7],
  // knob ③: guardian fights took 45 s (target 25–35 s)
  'guardianHp.1': [400, 280], 'guardianHp.2': [700, 480], 'guardianHp.3': [1000, 680], 'guardianHp.4': [1300, 880], 'guardianHp.5': [1600, 1090],
};
