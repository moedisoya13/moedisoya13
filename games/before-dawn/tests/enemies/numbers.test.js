// Every enemy number against GDD-V2 §3 (the table §3.2, the director rows §3.4–3.5, elites,
// guardians and the boss §3.6). A number that tuning changed is listed in TUNED with the GDD-V2 value
// next to it (docs/requests/v2-enemies.md "tuning" has the reasons); everything else must equal the
// GDD-V2 text exactly. Behaviour numbers the GDD-V2 leaves to v1 (§3.2 "그 밖의 행동·예고 모양·대기
// 시간은 v1 §6.2 그대로") are pinned at their v1 values. Behaviour tests read the same defs, so this
// file is the one place that pins the numbers.
'use strict';

// [path, GDD-V2 value]
const GDD = {
  // fodder (§3.2): HP, speed, damage, radius, shards, the warning; variants: sprite, scale, tint
  goblin: [['hp', 10], ['role', 'fodder'], ['shards', 1], ['speed', 3.2], ['dmg', 4], ['radius', 0.32], ['type', 'beast'], ['sprite', 'goblin'],
    ['T.range', 1.0], ['T.half', 30], ['T.tgR', 1.3], ['T.tgTime', 0.6], ['T.backDist', 1.2], ['T.backTime', 0.3], ['T.cd', 1.6], ['T.summonEvery', 12], ['T.summonN', 3]],
  slimelet: [['hp', 8], ['role', 'fodder'], ['shards', 1], ['speed', 1.3 / 0.8], ['dmg', 4], ['radius', 0.28], ['type', 'beast'], ['sprite', 'slime'], ['scale', 0.6], ['variantOf', 'slime'], ['alwaysWet', true],
    ['T.hopDist', 1.3], ['T.hopEvery', 0.8], ['T.range', 2.0], ['T.tgR', 0.6], ['T.tgTime', 0.6], ['T.split', 0]],
  husk: [['hp', 14], ['role', 'fodder'], ['shards', 1], ['speed', 2.6], ['dmg', 5], ['radius', 0.36], ['type', 'undead'], ['sprite', 'ghoul'], ['scale', 0.8], ['tint', 'pale'], ['variantOf', 'ghoul'],
    ['T.half', 40], ['T.tgR', 1.4], ['T.tgTime', 0.6], ['revive', undefined]],
  mana_slime: [['hp', 12], ['role', 'fodder'], ['shards', 1], ['speed', 1.4 / 0.9], ['dmg', 4], ['radius', 0.34], ['type', 'magic'], ['sprite', 'slime'], ['scale', 0.75], ['tint', 'violet'], ['variantOf', 'slime'], ['alwaysWet', true],
    ['T.hopDist', 1.4], ['T.hopEvery', 0.9], ['T.tgR', 0.7], ['T.tgTime', 0.6], ['T.split', 0]],
  squire: [['hp', 18], ['role', 'fodder'], ['shards', 1], ['speed', 2.8], ['dmg', 5], ['radius', 0.36], ['type', 'heavy'], ['sprite', 'goblin'], ['scale', 1.1], ['tint', 'steel'], ['variantOf', 'goblin'],
    ['T.half', 30], ['T.tgR', 1.3], ['T.tgTime', 0.6], ['defense', undefined]],
  // threats (§3.2)
  slime: [['hp', 30], ['role', 'threat'], ['shards', 3], ['speed', 1.6 / 1.1], ['dmg', 10], ['radius', 0.45], ['type', 'beast'], ['sprite', 'slime'], ['alwaysWet', true],
    ['T.hopDist', 1.6], ['T.hopEvery', 1.1], ['T.range', 3.0], ['T.tgR', 0.9], ['T.tgTime', 0.7], ['T.flat', 0.8], ['T.cd', 2.2], ['T.split', 2]],
  skel_archer: [['hp', 20], ['role', 'threat'], ['shards', 3], ['speed', 2.6], ['dmg', 8], ['radius', 0.35], ['type', 'undead'], ['sprite', 'skeleton_archer'],
    ['T.hold', 6], ['T.leave', 9], ['T.tooClose', 2], ['T.backDist', 3], ['T.backEvery', 6],
    ['T.width', 0.3], ['T.lineMax', 12], ['T.tgTime', 0.8], ['T.arrowSpeed', 14], ['T.cd', 2.4], ['T.fan', 15]],
  ghoul: [['hp', 45], ['role', 'threat'], ['shards', 4], ['speed', 2.6], ['dmg', 12], ['radius', 0.45], ['type', 'undead'], ['sprite', 'ghoul'],
    ['T.range', 2.2], ['T.half', 45], ['T.tgR', 2.0], ['T.tgTime', 0.6], ['T.leap', 1.5], ['T.cd', 2.0],
    ['T.reviveDelay', 2.5], ['T.reviveHp', 20], ['T.corpseHp', 20], ['T.guardianRevive', 0.5]],
  mage: [['hp', 30], ['role', 'threat'], ['shards', 4], ['speed', 2.0], ['dmg', 10], ['radius', 0.35], ['type', 'magic'], ['sprite', 'mage'],
    ['T.keepMin', 4], ['T.keepMax', 7], ['T.blinkAt', 0.5], ['T.blinkMin', 4], ['T.blinkMax', 6], ['T.blinkTg', 0.4],
    ['T.near', 2.0], ['T.nearTime', 0.5], ['T.guardianBlinkCd', 6], ['T.tgR', 1.3], ['T.tgTime', 1.1], ['T.cd', 3.0], ['T.side', 2.2],
    ['T.zoneLife', 2.5], ['T.zoneTick', 0.5], ['T.zoneDmg', 3]],
  dark_knight: [['hp', 120], ['role', 'threat'], ['shards', 8], ['speed', 2.0], ['dmg', 18], ['radius', 0.55], ['type', 'heavy'], ['sprite', 'dark_knight'],
    ['T.turn', 100], ['T.guardHalf', 60], ['T.guardMul', 0.2], ['T.range', 5], ['T.coneHalf', 30], ['T.width', 1.4], ['T.len', 5],
    ['T.guardianLen', 7], ['T.tgTime', 0.9], ['T.chargeSpeed', 10], ['T.recover', 1.4], ['T.wallRecover', 2.8], ['T.cd', 3.5],
    ['T.sweepR', 2.2], ['T.sweepTime', 0.6], ['T.ffDmg', 30], ['T.ffPush', 1], ['knockScale', 0.33]],
  // the boss (§3.6; skills v1 §6.4)
  demon_king: [['hp', 6000], ['speed', 1.6], ['radius', 0.9], ['type', 'boss'], ['sprite', 'demon_king'],
    ['T.phaseAt', [0.66, 0.33]],
    ['T.phases.1.speed', 1.6], ['T.phases.1.gap', 2.2], ['T.phases.1.cycle', ['cleave', 'dark_bolts']],
    ['T.phases.2.speed', 1.6], ['T.phases.2.gap', 2.0], ['T.phases.2.cycle', ['cleave', 'dark_bolts', 'thorns']],
    ['T.phases.3.speed', 2.4], ['T.phases.3.gap', 1.6], ['T.phases.3.cycle', ['cleave', 'collapse', 'dark_bolts', 'thorns']],
    ['T.cleave.trigger', 4], ['T.cleave.half', 70], ['T.cleave.r', 3.6], ['T.cleave.time', 0.9], ['T.cleave.time3', 0.7], ['T.cleave.dmg', 22],
    ['T.bolts.n', 3], ['T.bolts.every', 0.35], ['T.bolts.time', 0.6], ['T.bolts.speed', 12], ['T.bolts.dmg', 12], ['T.bolts.fanN', 5], ['T.bolts.fanHalf', 30], ['T.bolts.lineMax', 12],
    ['T.thorns.n', 5], ['T.thorns.r', 1.2], ['T.thorns.spread', 3], ['T.thorns.time', 1.0], ['T.thorns.dmg', 18],
    ['T.collapse.rings', [[0, 3], [3, 6], [6, 9]]], ['T.collapse.every', 0.5], ['T.collapse.time', 0.8], ['T.collapse.dmg', 20],
    ['T.minionDmg', 40], ['T.roar.time', 1.5], ['T.roar.push', 3]],
};
// The director's enemy columns (§3.4, §3.5): floors 1–5 and the rooftop (index 6)
const ROWS = {
  hp: [1.0, 1.2, 1.4, 1.6, 1.8, 1.5], dmg: [1.0, 1.0, 1.15, 1.15, 1.3, 1.15],
  melee: [4, 4, 5, 5, 6, 3], ranged: [2, 2, 3, 3, 3, 2],
  threatEvery: [8, 8, 7, 6, 5, 0], threatCap: [3, 3, 4, 5, 6, 0], eliteEvery: [0, 60, 50, 45, 40, 0],
};
// Horde mixes (§3.3) and the rooftop's (§3.6)
const MIXES = {
  beast: { fodder: { goblin: 100 }, threats: { slime: 1 }, elite: 'slime' },
  undead: { fodder: { husk: 85, goblin: 15 }, threats: { skel_archer: 2, ghoul: 1 }, elite: 'ghoul' },
  magic: { fodder: { mana_slime: 85, goblin: 15 }, threats: { mage: 1 }, elite: 'mage' },
  heavy: { fodder: { squire: 85, goblin: 15 }, threats: { dark_knight: 1 }, threatCost: { dark_knight: 2 }, elite: 'dark_knight' },
  rooftop: { fodder: { goblin: 1, husk: 1, mana_slime: 1, squire: 1 }, threats: {} },
};
// Elites and guardians (§3.6)
const ELITE_HP = [0, 160, 160, 220, 300, 380, 380]; // 1F has none (a 1F elite takes 2F's), rooftop 5F's
const GUARDIAN_HP = [0, 400, 700, 1000, 1300, 1600];

// Spawn tables of the v1 room generator (`gen.run(…, {v1: true})`, GDD §7.4; index = floor).
const BUNDLES = {
  beast: { dom: [null, { goblin: 8, slime: 4 }, { goblin: 11, slime: 5 }, { goblin: 14, slime: 7 }, { goblin: 17, slime: 8 }, { goblin: 20, slime: 9 }],
    nondom: [null, { goblin: 2, slime: 1 }, { goblin: 3, slime: 1 }, { goblin: 4, slime: 1 }, { goblin: 3, slime: 2 }, { goblin: 4, slime: 2 }] },
  undead: { dom: [null, { skel_archer: 5, ghoul: 2 }, { skel_archer: 6, ghoul: 3 }, { skel_archer: 8, ghoul: 4 }, { skel_archer: 9, ghoul: 5 }, { skel_archer: 10, ghoul: 6 }],
    nondom: [null, { skel_archer: 2 }, { skel_archer: 1, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 3, ghoul: 1 }] },
  magic: { dom: [null, null, { mage: 6 }, { mage: 7 }, { mage: 8 }, { mage: 9 }],
    nondom: [null, { mage: 1 }, { mage: 2 }, { mage: 2 }, { mage: 2 }, { mage: 3 }] },
  heavy: { dom: [null, null, { dark_knight: 3 }, { dark_knight: 4 }, { dark_knight: 5 }, { dark_knight: 6 }],
    nondom: [null, null, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }] },
};

// Numbers changed by tuning against GDD-V2: { 'kind.path' | 'row.<col>.<floor>' | 'eliteHp.<floor>' |
// 'guardianHp.<floor>': [gddValue, tunedValue] }. Kept in sync with docs/requests/v2-enemies.md "tuning".
const TUNED = require('./tuned');

function get(o, path) { return path.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
const want = (key, gdd) => (TUNED[key] ? TUNED[key][1] : gdd);

module.exports = {
  'enemy numbers equal GDD-V2 §3.2 / §3.6 unless listed as tuned'(t) {
    const BD = t.load();
    const bad = [];
    for (const [kind, rows] of Object.entries(GDD)) {
      const def = BD.enemies.get(kind);
      for (const [path, gdd] of rows) {
        const key = kind + '.' + path, w = want(key, gdd), got = get(def, path);
        if (!same(got, w)) bad.push(`${key}: ${JSON.stringify(got)} ≠ ${JSON.stringify(w)}${TUNED[key] ? ' (tuned)' : ' (GDD-V2)'}`);
      }
    }
    for (const key of Object.keys(TUNED)) {
      const k = key.split('.')[0];
      if (GDD[k] && !GDD[k].some(([p]) => key === k + '.' + p)) bad.push(`TUNED ${key} is not a GDD-V2 row`);
      if (!same(TUNED[key][0], (() => { // the left value must be the GDD-V2 one
        if (GDD[k]) { const r = GDD[k].find(([p]) => key === k + '.' + p); return r ? r[1] : undefined; }
        const [, col, n] = key.split('.');
        if (k === 'row') return col === 'phases' ? [8, 12, 16] : col === 'rate' ? 2.0 : ROWS[col][n - 1]; // rooftop: GDD-V2 §3.4
        if (k === 'eliteHp') return ELITE_HP[col];
        if (k === 'guardianHp') return GUARDIAN_HP[col];
        return undefined;
      })())) bad.push(`TUNED ${key}: the first value is not the GDD-V2 value`);
    }
    t.assert(!bad.length, bad.join('\n'));
  },
  'director rows (§3.4, §3.5): HP and damage multipliers, wind-up caps, threat and elite timing; the minimum warning 0.5 s'(t) {
    const BD = t.load();
    const bad = [];
    for (const [col, vals] of Object.entries(ROWS)) for (let n = 1; n <= 6; n++) {
      const key = `row.${col}.${n}`, w = want(key, vals[n - 1]), got = BD.C.DIRECTOR.floors[n][col];
      if (!same(got, w)) bad.push(`${key}: ${got} ≠ ${w}`);
    }
    // the rooftop (§3.4 옥상 행): minions wanted by boss phase, tokens per second
    t.eq(BD.C.DIRECTOR.floors[6].phases, want('row.phases.6', [8, 12, 16]), 'rooftop want by phase');
    t.eq(BD.C.DIRECTOR.floors[6].rate, want('row.rate.6', 2.0), 'rooftop rate');
    t.assert(!bad.length, bad.join('\n'));
    t.eq(BD.C.ENEMY.minTelegraph, 0.5, '§3.5: every damaging warning ≥ 0.5 s');
    t.eq(BD.C.CAP.enemies, 110); t.eq(BD.C.CAP.onScreen, 80); t.eq(BD.C.CAP.projectiles, 60); t.eq(BD.C.CAP.telegraphs, 32);
  },
  'horde mixes (§3.3): fodder shares, threats, the elite kind; the rooftop sends the four types\' fodder'(t) {
    const BD = t.load();
    for (const [id, m] of Object.entries(MIXES)) {
      const d = BD.director.mixes.get(id);
      t.eq(d.fodder, m.fodder, id + ' fodder'); t.eq(d.threats, m.threats, id + ' threats');
      t.eq(d.threatCost || {}, m.threatCost || {}, id + ' threat cost'); t.eq(d.elite, m.elite, id + ' elite');
    }
    t.eq(BD.C.DIRECTOR.otherThreat, 0.25, 'one threat in four from another type');
  },
  'elites (§3.6): HP by floor (dark knight × 1.5), size ×1.3, damage ×1.25, warnings ×1.2; guardians 400 … 1600'(t) {
    const BD = t.load();
    const H = BD.harness();
    for (let n = 1; n <= 6; n++) {
      H.start({ seed: 1, hand: [], floor: n, tier: 0 }); const w = H.world();
      for (const k of ['slime', 'skel_archer', 'ghoul', 'mage', 'dark_knight']) {
        const e = BD.W.makeEnemy(w, k, w.hero.x + 3, w.hero.y, { elite: true });
        const hp = Math.round(want('eliteHp.' + n, ELITE_HP[n]) * (k === 'dark_knight' ? 1.5 : 1) * w.mods.enemyHp);
        t.eq([e.hp, e.maxHp], [hp, hp], `${k} elite on ${n}F`);
        t.near(e.size, 1.3, 1e-9); t.eq(e.dmg, Math.round(e.def.dmg * 1.25)); t.near(e.tgScale, 1.2, 1e-9);
        t.eq(e.flags.marker, 'threat', 'shown at the screen edge');
        if (n <= 5) {
          const g = BD.W.makeEnemy(w, k, w.hero.x - 3, w.hero.y, { guardian: true });
          const gh = Math.round(want('guardianHp.' + n, GUARDIAN_HP[n]) * w.mods.enemyHp);
          t.eq([g.hp, g.maxHp], [gh, gh], `${k} guardian on ${n}F`);
        }
      }
    }
    t.eq(BD.C.ELITE.size, 1.3); t.eq(BD.C.ELITE.dmg, 1.25); t.eq(BD.C.ELITE.tg, 1.2);
    t.eq(BD.foes.T.eliteHp.map((v, n) => want('eliteHp.' + n, v)), BD.foes.T.eliteHp);
    t.eq(BD.C.GUARDIAN.hp.slice(1, 6).map((v, i) => want('guardianHp.' + (i + 1), GUARDIAN_HP[i + 1])), BD.C.GUARDIAN.hp.slice(1, 6));
  },
  'attack names feed the death cause (고블린의 찌르기에 …)'(t) {
    const BD = t.load();
    t.eq(BD.causeText('skel_archer:shot'), '해골 궁수의 사격에');
    t.eq(BD.causeText('ghoul:lunge'), '구울의 달려들기에');
    t.eq(BD.causeText('husk:lunge'), '굶주린 망자의 할퀴기에');
    t.eq(BD.causeText('mage:fire_circle'), '마도사의 불 원에');
    t.eq(BD.causeText('mage:fire_zone'), '마도사의 불 장판에');
    t.eq(BD.causeText('dark_knight:charge'), '암흑기사의 돌격에');
    t.eq(BD.causeText('squire:stab'), '고블린 병졸의 찌르기에');
    t.eq(BD.causeText('mana_slime:pounce'), '마력 슬라임의 덮치기에');
    for (const a of ['cleave', 'dark_bolts', 'thorns', 'collapse']) t.assert(BD.causeText('demon_king:' + a).startsWith('마왕의 '), a);
  },
  'guardian variants exist for every threat kind and the goblin, with the GDD names; fodder variants have none'(t) {
    const BD = t.load();
    const names = { slime: '대왕 슬라임', goblin: '고블린 족장', skel_archer: '해골 명궁', ghoul: '구울 폭군', mage: '대마도사', dark_knight: '암흑기사 단장' };
    for (const [k, n] of Object.entries(names)) t.eq(BD.enemies.get(k).guardian.name, n, k);
    for (const k of ['slimelet', 'husk', 'mana_slime', 'squire']) t.eq(BD.enemies.get(k).guardian, undefined, k);
    t.eq(BD.enemies.get('demon_king').phaseAt, [0.66, 0.33]);
  },
  'v1 room spawn bundles equal GDD §7.4 (magic rows as tuned for v1)'(t) {
    const BD = t.load();
    for (const [type, b] of Object.entries(BUNDLES)) {
      const def = BD.gen.bundles.get(type);
      for (const k of ['dom', 'nondom']) for (let n = 1; n <= 5; n++) t.eq(def[k][n], b[k][n], `${type}.${k}.${n}`);
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
