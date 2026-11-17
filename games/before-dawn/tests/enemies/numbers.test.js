// v2: the enemy table is GDD-V2 §3.2 — HP, speed, damage and radius of the fodder (goblin and the
// four variants: husk, squire, slimelet, mana_slime), the threats' HP (the proof slice keeps their
// v1 behaviour numbers, GDD-V2 §11.1-2), the boss's 6000 and the guardian row 400 … 1600 (§3.6);
// role and shards (§3.1, §4.1). The rows below were the v1 values for: slime hp 60, goblin hp 40 /
// speed 4.5 / dmg 6 (tuned 7) / radius 0.35 / stab 0.45 s, archer hp 40, ghoul hp 120 / revive 40,
// mage hp 54, dark knight hp 240, boss hp 3000, guardians 385 … 960.
// Every enemy number against GDD §6.2–6.4 / §7.4. A number that tuning changed is listed in
// TUNED with the GDD value next to it (docs/requests/enemies.md "tuning" has the reasons);
// everything else must equal the GDD exactly. The HP column, the ghoul's revive HP, the mage's
// fire-circle warning and the guardian row are the GDD's own since docs/CONTROLS-REVIEW.md §3.1
// (the GDD lines were changed with it), so they are no longer listed as tuned. Behaviour tests read the same defs, so this file
// is the one place that pins the numbers.
'use strict';

// [path, GDD value]
const GDD = {
  slime: [['hp', 30], ['role', 'threat'], ['shards', 3], ['speed', 1.6 / 1.1], ['dmg', 10], ['radius', 0.45], ['cost', 1.5], ['type', 'beast'], ['sprite', 'slime'],
    ['T.hopDist', 1.6], ['T.hopEvery', 1.1], ['T.range', 3.0], ['T.tgR', 0.9], ['T.tgTime', 0.7], ['T.flat', 0.8], ['T.cd', 2.2]],
  goblin: [['hp', 10], ['role', 'fodder'], ['shards', 1], ['speed', 3.2], ['dmg', 4], ['radius', 0.32], ['cost', 1], ['type', 'beast'], ['sprite', 'goblin'],
    ['T.range', 1.0], ['T.half', 30], ['T.tgR', 1.3], ['T.tgTime', 0.6], ['T.backDist', 1.2], ['T.backTime', 0.3], ['T.cd', 1.6]],
  squire: [['hp', 18], ['role', 'fodder'], ['shards', 1], ['speed', 2.8], ['dmg', 5], ['radius', 0.36], ['type', 'heavy'], ['sprite', 'goblin'], ['scale', 1.1], ['variantOf', 'goblin'], ['T.tgTime', 0.6]],
  husk: [['hp', 14], ['role', 'fodder'], ['shards', 1], ['speed', 2.6], ['dmg', 5], ['radius', 0.36], ['type', 'undead'], ['sprite', 'ghoul'], ['scale', 0.8], ['variantOf', 'ghoul'],
    ['T.half', 40], ['T.tgR', 1.4], ['T.tgTime', 0.6]],
  slimelet: [['hp', 8], ['role', 'fodder'], ['shards', 1], ['speed', 1.3 / 0.8], ['dmg', 4], ['radius', 0.28], ['type', 'beast'], ['sprite', 'slime'], ['scale', 0.6], ['alwaysWet', true],
    ['T.hopDist', 1.3], ['T.hopEvery', 0.8], ['T.range', 2.0], ['T.tgR', 0.6], ['T.tgTime', 0.6]],
  mana_slime: [['hp', 12], ['role', 'fodder'], ['shards', 1], ['speed', 1.4 / 0.9], ['dmg', 4], ['radius', 0.34], ['type', 'magic'], ['sprite', 'slime'], ['scale', 0.75], ['alwaysWet', true],
    ['T.hopDist', 1.4], ['T.hopEvery', 0.9], ['T.tgR', 0.7], ['T.tgTime', 0.6]],
  skel_archer: [['hp', 20], ['role', 'threat'], ['shards', 3], ['speed', 2.6], ['dmg', 9], ['radius', 0.35], ['cost', 1.5], ['type', 'undead'], ['sprite', 'skeleton_archer'],
    ['T.keepMin', 5], ['T.keepMax', 7], ['T.tooClose', 3.5], ['T.width', 0.3], ['T.tgTime', 0.8], ['T.arrowSpeed', 14], ['T.cd', 2.4], ['T.fan', 15]],
  ghoul: [['hp', 45], ['role', 'threat'], ['shards', 4], ['speed', 2.4], ['dmg', 14], ['radius', 0.45], ['cost', 3], ['type', 'undead'], ['sprite', 'ghoul'],
    ['T.range', 2.2], ['T.half', 45], ['T.tgR', 2.0], ['T.tgTime', 0.6], ['T.leap', 1.5], ['T.cd', 2.0],
    ['T.reviveDelay', 2.5], ['T.reviveHp', 20], ['T.corpseHp', 20], ['T.guardianRevive', 0.5]],
  mage: [['hp', 30], ['role', 'threat'], ['shards', 4], ['speed', 2.0], ['dmg', 12], ['radius', 0.35], ['cost', 2.5], ['type', 'magic'], ['sprite', 'mage'],
    ['T.keepMin', 4], ['T.keepMax', 7], ['T.near', 2.0], ['T.nearTime', 0.5], ['T.blinkMin', 6], ['T.blinkTg', 0.4], ['T.blinkCd', 5],
    ['T.guardianBlinkCd', 4], ['T.tgR', 1.3], ['T.tgTime', 1.1], ['T.cd', 3.0], ['T.side', 2.2], ['T.zoneLife', 2.5], ['T.zoneTick', 0.5], ['T.zoneDmg', 3]],
  dark_knight: [['hp', 120], ['role', 'threat'], ['shards', 8], ['speed', 2.0], ['dmg', 20], ['radius', 0.55], ['cost', 6], ['type', 'heavy'], ['sprite', 'dark_knight'],
    ['T.turn', 100], ['T.guardHalf', 60], ['T.guardMul', 0.2], ['T.range', 5], ['T.coneHalf', 30], ['T.width', 1.4], ['T.len', 5],
    ['T.guardianLen', 7], ['T.tgTime', 0.9], ['T.chargeSpeed', 10], ['T.recover', 1.4], ['T.wallRecover', 2.8], ['T.cd', 3.5],
    ['T.sweepR', 2.2], ['T.sweepTime', 0.6], ['knockScale', 0.33]],
  demon_king: [['hp', 6000], ['speed', 1.6], ['radius', 0.9], ['type', 'boss'], ['sprite', 'demon_king'],
    ['T.phaseAt', [0.66, 0.33]],
    ['T.phases.1.speed', 1.6], ['T.phases.1.gap', 2.2], ['T.phases.1.cycle', ['cleave', 'dark_bolts']], ['T.phases.1.summonEvery', 0],
    ['T.phases.2.speed', 1.6], ['T.phases.2.gap', 2.0], ['T.phases.2.cycle', ['cleave', 'dark_bolts', 'thorns']], ['T.phases.2.summonEvery', 20],
    ['T.phases.3.speed', 2.4], ['T.phases.3.gap', 1.6], ['T.phases.3.cycle', ['cleave', 'collapse', 'dark_bolts', 'thorns']], ['T.phases.3.summonEvery', 15],
    ['T.cleave.trigger', 4], ['T.cleave.half', 70], ['T.cleave.r', 3.6], ['T.cleave.time', 0.9], ['T.cleave.time3', 0.7], ['T.cleave.dmg', 22],
    ['T.bolts.n', 3], ['T.bolts.every', 0.35], ['T.bolts.time', 0.6], ['T.bolts.speed', 12], ['T.bolts.dmg', 12], ['T.bolts.fanN', 5], ['T.bolts.fanHalf', 30],
    ['T.thorns.n', 5], ['T.thorns.r', 1.2], ['T.thorns.spread', 3], ['T.thorns.time', 1.0], ['T.thorns.dmg', 18],
    ['T.collapse.rings', [[0, 3], [3, 6], [6, 9]]], ['T.collapse.every', 0.5], ['T.collapse.time', 0.8], ['T.collapse.dmg', 20],
    ['T.summonCap', 8], ['T.roar.time', 1.5], ['T.roar.push', 3]],
};

// Spawn tables §7.4 (index = floor).
const BUNDLES = {
  beast: { dom: [null, { goblin: 8, slime: 4 }, { goblin: 11, slime: 5 }, { goblin: 14, slime: 7 }, { goblin: 17, slime: 8 }, { goblin: 20, slime: 9 }],
    nondom: [null, { goblin: 2, slime: 1 }, { goblin: 3, slime: 1 }, { goblin: 4, slime: 1 }, { goblin: 3, slime: 2 }, { goblin: 4, slime: 2 }] },
  undead: { dom: [null, { skel_archer: 5, ghoul: 2 }, { skel_archer: 6, ghoul: 3 }, { skel_archer: 8, ghoul: 4 }, { skel_archer: 9, ghoul: 5 }, { skel_archer: 10, ghoul: 6 }],
    nondom: [null, { skel_archer: 2 }, { skel_archer: 1, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 3, ghoul: 1 }] },
  magic: { dom: [null, null, { mage: 8 }, { mage: 10 }, { mage: 12 }, { mage: 13 }],
    nondom: [null, { mage: 1 }, { mage: 2 }, { mage: 2 }, { mage: 2 }, { mage: 3 }] },
  heavy: { dom: [null, null, { dark_knight: 3 }, { dark_knight: 4 }, { dark_knight: 5 }, { dark_knight: 6 }],
    nondom: [null, null, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }] },
};

// Numbers changed by bot tuning: { 'kind.path': [gddValue, tunedValue] }. Kept in sync with
// docs/requests/enemies.md → "tuning".
const TUNED = {
  'slime.dmg': [10, 12],
};
const TUNED_BUNDLES = { // { 'type.dom.n': [gddRow, tunedRow] }
  'magic.dom.2': [{ mage: 8 }, { mage: 6 }], 'magic.dom.3': [{ mage: 10 }, { mage: 7 }],
  'magic.dom.4': [{ mage: 12 }, { mage: 8 }], 'magic.dom.5': [{ mage: 13 }, { mage: 9 }],
};
// Guardian HP per floor (GDD §6.3 = docs/CONTROLS-REVIEW.md §3.1; the engine's BD.C.GUARDIAN.hp
// holds the row). Before the review: GDD 160/220/280/340/400, tuned ×3 to 480/…/1200.
const GUARDIAN_HP = { gdd: [0, 400, 700, 1000, 1300, 1600], tuned: [0, 400, 700, 1000, 1300, 1600] }; // GDD-V2 §3.6

function get(o, path) { return path.split('.').reduce((a, k) => (a === undefined ? a : a[k]), o); }

module.exports = {
  'enemy numbers equal GDD §6.2–6.4 unless listed as tuned'(t) {
    const BD = t.load();
    const bad = [];
    for (const [kind, rows] of Object.entries(GDD)) {
      const def = BD.enemies.get(kind);
      for (const [path, gdd] of rows) {
        const key = kind + '.' + path;
        const want = TUNED[key] ? TUNED[key][1] : gdd;
        const got = get(def, path);
        if (JSON.stringify(got) !== JSON.stringify(want) && !(typeof got === 'number' && Math.abs(got - want) < 1e-9)) bad.push(`${key}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${TUNED[key] ? ' (tuned)' : ' (GDD)'}`);
      }
    }
    for (const key of Object.keys(TUNED)) if (!GDD[key.split('.')[0]].some(([p]) => key === key.split('.')[0] + '.' + p)) bad.push(`TUNED ${key} is not a GDD row`);
    t.assert(!bad.length, bad.join('\n'));
  },
  'guardian HP per floor: the engine row holds the tuned values, applied by makeEnemy'(t) {
    const BD = t.load();
    t.eq(BD.C.GUARDIAN.hp, GUARDIAN_HP.tuned, 'engine row is the tuned row');
    t.eq(BD.enemyTune, undefined, 'no content-side rescale left');
    const H = BD.harness();
    for (let n = 1; n <= 5; n++) {
      H.start({ seed: 1, hand: [], floor: n, tier: 0 }); const w = H.world();
      for (const k of ['slime', 'goblin', 'skel_archer', 'ghoul', 'mage', 'dark_knight']) {
        const e = BD.W.makeEnemy(w, k, w.hero.x + 3, w.hero.y, { guardian: true });
        t.eq([e.hp, e.maxHp], [Math.round(GUARDIAN_HP.tuned[n] * w.mods.enemyHp), Math.round(GUARDIAN_HP.tuned[n] * w.mods.enemyHp)], `${k} guardian on ${n}F`);
      }
    }
  },
  'attack names feed the death cause (고블린의 찌르기에 …)'(t) {
    const BD = t.load();
    t.eq(BD.causeText('skel_archer:shot'), '해골 궁수의 사격에');
    t.eq(BD.causeText('ghoul:lunge'), '구울의 달려들기에');
    t.eq(BD.causeText('mage:fire_circle'), '마도사의 불 원에');
    t.eq(BD.causeText('mage:fire_zone'), '마도사의 불 장판에');
    t.eq(BD.causeText('dark_knight:charge'), '암흑기사의 돌격에');
    for (const a of ['cleave', 'dark_bolts', 'thorns', 'collapse']) t.assert(BD.causeText('demon_king:' + a).startsWith('마왕의 '), a);
  },
  'guardian variants exist for every non-boss kind with the GDD names'(t) {
    const BD = t.load();
    const names = { slime: '대왕 슬라임', goblin: '고블린 족장', skel_archer: '해골 명궁', ghoul: '구울 폭군', mage: '대마도사', dark_knight: '암흑기사 단장' };
    for (const [k, n] of Object.entries(names)) t.eq(BD.enemies.get(k).guardian.name, n, k);
    t.eq(BD.enemies.get('demon_king').phaseAt, [0.66, 0.33]);
  },
  'spawn bundles equal GDD §7.4 unless listed as tuned'(t) {
    const BD = t.load();
    for (const [type, b] of Object.entries(BUNDLES)) {
      const def = BD.gen.bundles.get(type);
      for (const k of ['dom', 'nondom']) for (let n = 1; n <= 5; n++) {
        const key = `${type}.${k}.${n}`;
        const want = TUNED_BUNDLES[key] ? TUNED_BUNDLES[key][1] : b[k][n];
        t.eq(def[k][n], want, key);
      }
    }
  },
  'no orange (#ff9a3c, the hero colour) in enemy-side content'(t) {
    const fs = require('fs'), path = require('path'), L = require('../../tools/layers');
    for (const dir of ['src/content/enemies', 'src/content/bosses', 'src/content/rooms', 'src/content/floors']) {
      for (const f of L.listFiles(dir)) {
        const src = fs.readFileSync(path.join(L.ROOT, f), 'utf8').toLowerCase();
        t.assert(!src.includes('#ff9a3c') && !src.includes('ui.orange'), f + ' uses the hero orange');
      }
    }
  },
};
