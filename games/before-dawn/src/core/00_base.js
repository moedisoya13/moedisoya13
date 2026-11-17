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
  // Camera (src/core/05_view.js, src/client/15_camera.js). On an axis where the floor plus FRAME
  // margins fits the 1280 × 720 view the camera stands still with the room centred (every v1
  // room); on other axes it follows the hero, clamped so the view stays inside the frame.
  //   fit: map-px margins around the floor's projected box that must fit for the camera to stand
  //        still on that axis (top includes the back walls; sized so every v1 room fits)
  //   frame: margins the following camera may show around the box (room for the HUD bars and the
  //          card tray, so the hero at the floor's edge is not under them)
  //   slack: the most the client camera may lag or lead the hero on a following axis (map px);
  //          the simulation's view rectangle is the hero-centred view inset by it, so whatever
  //          the simulation calls "in view" is on every screen
  //   follow: time constant (s) of the smooth follow; lookahead (u) along the walk, eased over lookTime s
  // off-screen awareness default per floor: 'auto' = on when the floor does not fit the screen
  // (never in a v1 room); a generated floor's `offscreen` {indicators, minimap} overrides it
  OFFSCREEN: { indicators: 'auto', minimap: 'auto' },
  CAM: { fit: { x: 60, top: 100, bottom: 80 }, frame: { x: 140, top: 220, bottom: 230 }, slack: { x: 112, y: 64 }, follow: 0.14, lookahead: 1.6, lookTime: 0.4 },
  RUN_SEC: 900, CLOCK_START_MIN: 18 * 60,
  // v2 (docs/GDD-V2.md §3.7): enemies alive 110 (the director stops there; rifts queue), on screen
  // 80, shards on the floor 200 (the farthest merge into their nearest), hero shots 40, warnings 32
  CAP: { enemies: 110, onScreen: 80, projectiles: 60, heroShots: 40, shards: 200, telegraphs: 32, particles: 300 },
  HERO: {
    maxHp: 100, speed: 4.2, radius: 0.35, hurtInvuln: 1.0, hurtKnock: 0.5,
    dmg: 10, interval: 0.6, reach: 1.9, halfArc: 50, switchMargin: 0.4,
    trail: 0.15, aimHold: 0.25, spriteH: 90,
    // walking into a regular enemy shoves it sideways: this share of the overlap per tick, at most
    // shoveSpeed × speed (u/s); guardians, the boss and lunging enemies stay solid (docs/CONTROLS-REVIEW.md §3.5)
    shoveShare: 0.6, shoveSpeed: 0.6,
  },
  // corner assist (walking only): when the grid stops a step below `stuck` of its length, probe
  // sideways in `step` up to `reach`; the nearest spot that walks ≥ `need` of the step is slid toward
  // at `speed` × HERO.speed (docs/CONTROLS-REVIEW.md §3.5)
  CORNER: { stuck: 0.3, step: 0.05, reach: 0.45, need: 0.9, speed: 0.6 }, // reach: spec 0.25, see the review's 구현 메모
  // buffer: a dash pressed up to this long before it is possible fires when it becomes possible
  DASH: { dur: 0.2, dist: 3.2, invuln: 0.25, dmg: 5, knock: 1.0, cd: 2.5, buffer: 0.2 },
  WAVES: {
    shares: [0.30, 0.35], wave2Survivors: 2, wave3Survivors: 3, timeout: 28,
    initFreeze: 1.5, riftWarn: 1.2, guardianWarn: 2.0, noAttackAfterSpawn: 0.6,
  },
  INTERACT: { ring: 0.9, altar: 0.8, trial: 1.5, stairs: 1.0, stairsRingOffset: 1.2, blackout: 0.6, closeInvuln: 0.5, flaskTouch: 0.6 },
  FLASK: 30, PRAY: 25, RADIANCE_MAX: 9, // radiance max 9: GDD-V2 §4.6 (v1: 5)
  DAWN: { firstSec: 60, rate1: 1, rate2: 3 },
  ENEMY: { keepOut: 0.8, meleeCap: 3, rangedCap: 2, flowEvery: 0.2, minTelegraph: 0.45 },
  ELITE: { size: 1.3, hp: 2.5, dmg: 1.25, tg: 1.2, perFloor: [0, 0, 0, 1, 1, 2, 0] },
  // guardian HP per floor (GDD §6.3, set by docs/CONTROLS-REVIEW.md §3.1; earlier ×3 tuning: docs/requests/enemies.md)
  // v2: HP 400 / 700 / 1000 / 1300 / 1600 (GDD-V2 §3.6; v1 tuned row was 385 / 530 / 675 / 815 / 960)
  GUARDIAN: { size: 1.6, dmg: 1.3, tg: 1.4, knock: 0.33, hp: [0, 400, 700, 1000, 1300, 1600] },
  STATUS: {
    burnTick: 0.5, burnDmg: 3, burnDur: 3, burnSpread: 0.6, burnImmune: 2, spreadPerTick: 2, // spreadPerTick: GDD-V2 §4.4
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
  // limits for a floor size asked by a floor plan (BD.gen.plans) or gen opts: sides in cells
  GEN_SIZE: { min: 8, max: 128 },
  FLOORS: 6,
  GEN_RETRIES: 20,
};

// ---- v2 (docs/GDD-V2.md) -------------------------------------------------------------------------
// The proof slice (§11.1) reads its numbers from here and from content defs (enemy hp/speed/dmg/
// shards, card levels, boons). Every value is the GDD-V2 starting value unless a line says
// "tuned"; tuned numbers are listed against the GDD in docs/requests/v2-tuning.md.

// The horde director (§3.4). Row = floor (6 = rooftop). from → to: wanted enemies on screen from
// floor entry to the end of the time budget; rate: spawn tokens per second (one per enemy, at most
// tokenMax banked); threatEvery / threatCap: seconds between threats and how many may live;
// eliteEvery: not used by the slice (elites are the enemies agent's, §3.6); hp / dmg: multipliers
// for regular enemies (fodder and threats) made on that floor; melee / ranged: concurrent wind-up
// caps (§3.5); pack: fodder per pack [min, max]. The rooftop's want is per boss phase.
BD.C.DIRECTOR = {
  every: 0.4, tokenMax: 12, tokensAtEntry: 6,
  // tuned (docs/requests/v2-tuning.md): rate ×1.3 and from/to raised, rooftop phases +2 — with the GDD
  // values the hero killed packs as fast as they arrived and the screen held 11.7 enemies (gate ≥ 12)
  floors: [null,
    { budget: 110, from: 14, to: 24, rate: 4.0, threatEvery: 8, threatCap: 3, eliteEvery: 0, hp: 1.0, dmg: 1.0, melee: 4, ranged: 2, pack: [4, 6] },
    { budget: 130, from: 16, to: 30, rate: 4.5, threatEvery: 8, threatCap: 3, eliteEvery: 60, hp: 1.2, dmg: 1.0, melee: 4, ranged: 2, pack: [4, 8] },
    { budget: 140, from: 20, to: 36, rate: 5.0, threatEvery: 7, threatCap: 4, eliteEvery: 50, hp: 1.4, dmg: 1.15, melee: 5, ranged: 3, pack: [4, 8] },
    { budget: 150, from: 24, to: 42, rate: 6.0, threatEvery: 6, threatCap: 5, eliteEvery: 45, hp: 1.6, dmg: 1.15, melee: 5, ranged: 3, pack: [4, 8] },
    { budget: 160, from: 28, to: 48, rate: 6.8, threatEvery: 5, threatCap: 6, eliteEvery: 40, hp: 1.8, dmg: 1.3, melee: 6, ranged: 3, pack: [4, 8] },
    { budget: 150, phases: [10, 14, 18], rate: 2.6, threatEvery: 0, threatCap: 0, eliteEvery: 0, hp: 1.5, dmg: 1.15, melee: 3, ranged: 2, pack: [4, 6] },
  ],
  surge: { first: 25, every: 35, dur: 8, mult: 1.5 },     // 몰려온다
  guardianMult: 0.5,   // want and token rate while the guardian is up
  overtimeMult: 1.25,  // after the floor's budget (밤이 깊어진다)
  spawnOut: [1.5, 4],  // u beyond the screen rectangle
  ahead: 0.6, aheadHalf: 60, // share of packs within ±aheadHalf° of the hero's last second of walking
  packR: 2,            // pack members within this many u of the pack point
  near: 22,            // off-screen enemies within this many u count as coming (have)
  recycle: { fodder: 24, threat: 30, after: 3 },
  otherThreat: 0.25,   // a threat of another type (rng spawn)
  entryPacks: 2, entryInset: 2, // packs standing 2u inside the screen edge at floor entry
};

BD.C.V2 = {
  // the simulation's camera (§5.6): target = hero + walking direction (eased over leadTau s) × lead u;
  // cam += (target − cam)(1 − e^(−follow·dt)); clamped to [edge, side − edge] on each axis
  cam: { lead: 1.5, leadTau: 0.35, follow: 8, edge: 5 },
  // the combat window C in logical px (S is the whole 1280 × 720 view); on an axis where the floor
  // fits the view (a v1 room) both are the whole view, as before
  combat: { x0: 48, x1: 1232, y0: 84, y1: 600 },
  seenFor: 0.5,        // s an enemy must have been inside C before it may start an attack (§5.6-1)
  fodderNear: 0.5, fodderNearR: 1.6, // fodder: also this long within this many u of the hero (§3.5)
  shotOut: 2,          // hostile shots vanish this many u outside S (§5.6-3)
  // light shards (§4.1)
  shard: { pickR: 1.2, pop: 0.2, speed0: 6, speed1: 18, accel: 40, take: 0.3, mergeAbove: 200 },
  // level curve (§4.2): need(1) = 12, need(2) = 24, need(L ≥ 3) = round(base + per × L)
  xp: { first: [12, 24], base: 30, per: 7 },
  // growth choice (§4.3)
  choice: { cardSlots: 2, shoveR: 3, shoveDist: 1.5, invuln: 0.5, breathHp: 20 },
  maxCardLevel: 5,
  // floors (§5.1): 48 × 48 of 16 × 16 zones; start (40, 40); the guardian at the stairs zone centre
  floor: { size: 48, zone: 16, start: [40, 40], guardianAt: [8, 8], guardianWarn: 2.0, guardianWake: 10 },
  roof: { size: 28, pillars: [[8, 8], [20, 8], [8, 20], [20, 20]], boss: [14, 14], start: [24, 24], flasks: [[4, 22], [22, 4]], edge: 5 },
  // the level `&floor=N` starts with (§10.3): 2F 6, 3F 10, 4F 15, 5F 19, rooftop 23
  levelAtFloor: [0, 1, 6, 10, 15, 19, 23],
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
