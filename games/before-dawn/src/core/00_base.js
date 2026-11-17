// Core base: constants, failure helpers, the registry factory and finalize().
// Every tunable number of the engine lives in BD.C. Content numbers live in content defs.

BD.fail = function (msg) { throw new Error('[BD] ' + msg); };
BD.assert = function (cond, msg) { if (!cond) BD.fail(msg); };

BD.C = {
  TICK: 1 / 60,
  MAX_CATCHUP: 5,
  VIEW_W: 1280, VIEW_H: 720,
  // HUD card slots (GDD §9.2): three 84 px sockets, gap 12, centred, top at y 616 (logical px)
  SLOTS: { size: 84, gap: 12, y: 616 },
  ISO_X: 40, ISO_Y: 20, ROOM_CX: 640, ROOM_CY: 350, WALL_H: 80,
  RUN_SEC: 900, CLOCK_START_MIN: 18 * 60,
  CAP: { enemies: 80, projectiles: 60, particles: 300 },
  HERO: {
    maxHp: 100, speed: 4.2, radius: 0.35, hurtInvuln: 0.6, hurtKnock: 0.5,
    dmg: 10, interval: 0.6, reach: 1.9, halfArc: 50, switchMargin: 0.4,
    trail: 0.15, aimHold: 0.25, spriteH: 90,
  },
  DASH: { dur: 0.2, dist: 3.2, invuln: 0.25, dmg: 5, knock: 1.0, cd: 2.5 },
  WAVES: {
    shares: [0.30, 0.35], wave2Survivors: 2, wave3Survivors: 3, timeout: 28,
    initFreeze: 1.5, riftWarn: 1.2, guardianWarn: 2.0, noAttackAfterSpawn: 0.6,
  },
  INTERACT: { ring: 0.9, altar: 0.8, trial: 1.5, stairs: 1.0, stairsRingOffset: 1.2, blackout: 0.6, closeInvuln: 0.5, flaskTouch: 0.6 },
  FLASK: 30, PRAY: 25, RADIANCE_MAX: 5,
  DAWN: { firstSec: 60, rate1: 1, rate2: 3 },
  ENEMY: { keepOut: 0.8, meleeCap: 3, rangedCap: 2, flowEvery: 0.2, minTelegraph: 0.45 },
  ELITE: { size: 1.3, hp: 2.5, dmg: 1.25, tg: 1.2, perFloor: [0, 0, 0, 1, 1, 2, 0] },
  // guardian HP per floor: tuned ×3 from GDD §6.3 (160/220/280/340/400) by the enemies agent, docs/requests/enemies.md
  GUARDIAN: { size: 1.6, dmg: 1.3, tg: 1.4, knock: 0.33, hp: [0, 480, 660, 840, 1020, 1200] },
  STATUS: {
    burnTick: 0.5, burnDmg: 3, burnDur: 3, burnSpread: 0.6, burnImmune: 2,
    wetDur: 4, steamDmg: 8, steamR: 1.2, steamCd: 1, slamDmg: 8, slamStun: 0.5, knockTime: 0.15,
  },
  ENDING: { win: 1.5, death: 0.8 },
  // 밤의 깊이 (cumulative): index = tier
  TIERS: [
    {},
    { enemyHp: 1.2, elitePlus: 1 },
    { runSec: 780, guardianDmg: 1.25 },
    { flask: 20, enemySpeed: 1.1 },
  ],
  TYPES: ['beast', 'undead', 'magic', 'heavy'],
  TYPE_NAMES: { beast: '마물', undead: '언데드', magic: '마법', heavy: '중갑', boss: '마왕', rooftop: '옥상' },
  FLOOR_COLORS: { beast: '#f2c230', undead: '#4fa94d', magic: '#5c4d8e', heavy: '#e0392f', rooftop: '#7d8597' },
  ROOM_SIZES: [[16, 10], [10, 16], [13, 13], [14, 12], [12, 14]],
  FLOORS: 6,
  GEN_RETRIES: 20,
};

// Card slot i (0..2) on the HUD in logical px — the one place the slot geometry lives: the UI
// draws the slots there, the cards fly their quest dot to it.
BD.slotRect = function (i) {
  const S = BD.C.SLOTS, x0 = BD.C.VIEW_W / 2 - (3 * S.size + 2 * S.gap) / 2;
  return { x: x0 + i * (S.size + S.gap), y: S.y, w: S.size, h: S.size };
};
BD.slotCenter = function (i) { const r = BD.slotRect(i); return [r.x + r.w / 2, r.y + r.h / 2]; };

// Cumulative tier modifiers.
BD.tierMods = function (tier) {
  const m = { enemyHp: 1, elitePlus: 0, runSec: BD.C.RUN_SEC, guardianDmg: 1, flask: BD.C.FLASK, enemySpeed: 1 };
  for (let i = 1; i <= tier && i < BD.C.TIERS.length; i++) {
    const t = BD.C.TIERS[i];
    if (t.enemyHp) m.enemyHp *= t.enemyHp;
    if (t.elitePlus) m.elitePlus += t.elitePlus;
    if (t.runSec) m.runSec = t.runSec;
    if (t.guardianDmg) m.guardianDmg *= t.guardianDmg;
    if (t.flask) m.flask = t.flask;
    if (t.enemySpeed) m.enemySpeed *= t.enemySpeed;
  }
  return m;
};

// Registry factory. get() of an unknown id throws: nothing is stubbed silently.
BD.makeRegistry = function (name, opts) {
  opts = opts || {};
  const items = new Map();
  let frozen = false;
  return {
    name,
    register(def) {
      if (frozen) BD.fail(`${name}: register('${def && def.id}') after finalize`);
      if (!def || typeof def.id !== 'string' || !def.id) BD.fail(`${name}: register() needs a string id`);
      if (items.has(def.id)) BD.fail(`${name}: duplicate id '${def.id}'`);
      for (const k of opts.required || []) {
        if (def[k] === undefined) BD.fail(`${name} '${def.id}': missing required field '${k}'`);
      }
      if (opts.validate) opts.validate(def);
      items.set(def.id, def);
      return def;
    },
    get(id) {
      const d = items.get(id);
      if (!d) BD.fail(`unknown ${name} id '${id}' (registered: ${[...items.keys()].sort().join(', ') || 'none'})`);
      return d;
    },
    has(id) { return items.has(id); },
    ids() { return [...items.keys()].sort(); },
    all() { return [...items.keys()].sort().map((k) => items.get(k)); },
    freeze() { frozen = true; },
  };
};

// Hooks run by finalize() to cross-check registries once every file is loaded.
BD._finalizers = [];
BD.onFinalize = function (fn) { BD._finalizers.push(fn); };
BD.finalize = function () {
  if (BD._finalized) return;
  for (const fn of BD._finalizers) fn();
  BD._finalized = true;
};
