// World: the state of one run, plus entity factories and the hero-damage API.
// Everything here is DOM-free and deterministic.

const C = BD.C;
const M = BD.math;

BD.createWorld = function (opts) {
  const seed = opts.seed >>> 0;
  const tier = opts.tier | 0;
  const run = BD.gen.run(seed, tier, opts.task ? { task: opts.task } : undefined);
  const w = {
    seed, tier, mods: BD.tierMods(tier), run,
    rng: { spawn: BD.stream(seed, 'spawn'), ai: BD.stream(seed, 'ai'), fx: BD.stream(seed, 'fx'), choice: BD.stream(seed, 'choice') },
    bus: BD.Bus(),
    t: 0, ticks: 0, dt: C.TICK,
    floorN: 0, floor: null, grid: null,
    hero: null, enemies: [], projectiles: [], telegraphs: [], zones: [], hitboxes: [], pickups: [], rifts: [], queue: [],
    wave: null, stairs: null, altar: null, trial: null, interact: { target: null, progress: 0, need: 0 },
    // v2 (docs/ARCHITECTURE.md §10): the simulation's camera, light shards on the floor, the horde
    // director, the floor task, sites, the open growth choice
    cam: null, shards: [], director: null, task: null, sites: [], choice: null, choiceOpen: false,
    cards: [null, null, null],
    freezeT: 0, blackoutT: 0, blackoutTo: 0, ending: null, altarOpen: false,
    dawnFired: false, drainAcc: 0,
    nextId: 1, timers: [], timerSeq: 0,
    field: null, fieldT: 0, fieldCell: -1,
    input: { mx: 0, my: 0, dash: false },
    slots: { melee: 0, ranged: 0 },
    stats: {
      kills: 0, hurts: 0, dodges: 0, trials: 0, trialSec: 0, mageKills: 0, questAwakened: 0, comboMaxed: 0,
      dmgTaken: {}, cards: {}, floorReached: 1, bestStack: {},
      unseenHits: 0, shards: 0, levels: 0, recycled: 0, tasks: [],
    },
    particleCount: 0, // set by the browser effect layer; not part of the hash
  };
  w.hero = BD.hero.create(w);
  return w;
};

BD.W = {}; // world helpers
const W = BD.W;

W.id = (w) => w.nextId++;
W.emit = (w, name, payload) => w.bus.emit(name, payload);
W.toast = (w, text) => w.bus.emit('toast', { text });
W.banner = (w, text, kind) => w.bus.emit('banner', { text, kind: kind || 'info' });

// Deterministic timers (echo, delayed counters …). fn(w) runs during the tick it expires in.
W.after = function (w, delay, fn) { w.timers.push({ at: w.t + delay, seq: w.timerSeq++, fn }); };
W.runTimers = function (w) {
  if (!w.timers.length) return;
  const due = w.timers.filter((x) => x.at <= w.t + 1e-9).sort((a, b) => a.at - b.at || a.seq - b.seq);
  if (!due.length) return;
  w.timers = w.timers.filter((x) => x.at > w.t + 1e-9);
  for (const x of due) x.fn(w);
};

// GDD-V2 §5.6: is (x, y) inside the screen rectangle S / the combat window C this tick.
W.onScreen = (w, x, y, pad) => BD.view.onScreen(w, x, y, pad);
W.inView = (w, x, y, pad) => BD.view.inView(w, x, y, pad);

// A staged scenario (tests): no director, no growth-choice overlay. Set w.scenario = true, or the
// v1 test idiom w.wave.n = 3 ("no more waves") that the existing tests use.
W.scenario = (w) => !!(w.scenario || (w.wave && w.wave.n >= 3));

W.edgeDist = (w, e) => M.dist(w.hero.x, w.hero.y, e.x, e.y) - e.r;
W.alive = (e) => !e.dead && !e.down;
W.livingEnemies = (w) => w.enemies.filter(W.alive);
W.enemyById = (w, id) => { for (const e of w.enemies) if (e.id === id) return e; return null; };

// ---- enemies -------------------------------------------------------------------------

// Create an enemy now (no warning). opts: elite, guardian, via, trial, wave, noAttack, dormant.
// v2: def.role ('fodder' | 'threat'; guardians, elites and the boss are their own roles), def.scale
// (sprite size of a variant: e.size = scale × elite/guardian size, the body radius is def.radius ×
// the elite/guardian size only), the floor's director row multiplies a regular enemy's HP and
// damage (GDD-V2 §3.4). opts.dormant {r}: stands still until the hero comes within r u.
W.makeEnemy = function (w, kind, x, y, opts) {
  opts = opts || {};
  const def = BD.enemies.get(kind);
  const boss = def.type === 'boss';
  let size = 1, hpMul = w.mods.enemyHp, dmgMul = 1, tg = 1, knock = def.knockScale !== undefined ? def.knockScale : 1;
  let hp = def.hp;
  if (opts.elite) { size *= C.ELITE.size; hpMul *= C.ELITE.hp; dmgMul *= C.ELITE.dmg; tg *= C.ELITE.tg; }
  if (opts.guardian) {
    size *= C.GUARDIAN.size; dmgMul *= C.GUARDIAN.dmg * w.mods.guardianDmg; tg *= C.GUARDIAN.tg;
    knock = Math.min(knock, C.GUARDIAN.knock);
    hp = C.GUARDIAN.hp[w.floorN] || C.GUARDIAN.hp[5]; hpMul = w.mods.enemyHp;
  }
  const row = BD.director && BD.director.row(w);
  if (row && !opts.guardian && !opts.elite && !boss) { hpMul *= row.hp; dmgMul *= row.dmg; }
  if (boss) knock = 0;
  const role = boss ? 'boss' : opts.guardian ? 'guardian' : opts.elite ? 'elite' : def.role || 'threat';
  const e = {
    id: W.id(w), kind, def, type: def.type, role, x, y, r: def.radius * size, size: size * (def.scale || 1),
    hp: Math.round(hp * hpMul), maxHp: Math.round(hp * hpMul),
    elite: !!opts.elite, guardian: !!opts.guardian, boss, trial: !!opts.trial, wave: opts.wave || 0,
    speed: def.speed * w.mods.enemySpeed, dmg: Math.round(def.dmg * dmgMul), dmgMul, tgScale: tg, knockScale: knock,
    state: 'idle', face: Math.atan2(w.hero.y - y, w.hero.x - x),
    noAttackT: opts.noAttack || 0, stunT: 0, knock: null, lunging: false,
    statuses: {}, flags: Object.assign({}, opts.flags), mem: {}, slot: null, down: null, revives: 0, dead: false, // opts.flags: v2-enemies (task marks pass through rifts)
    lastSource: null, squash: 0, bornT: w.t,
    // §5.6-1: seconds inside the combat window (an enemy made inside it counts as having been there,
    // so placed enemies and rifts keep their v1 timing; the director spawns outside S);
    // §3.5: seconds near the hero (fodder); seconds far off screen (recycling)
    viewT: 0, nearT: 0, farT: 0, dormant: opts.dormant || null,
  };
  if (w.grid && W.inView(w, x, y)) e.viewT = C.V2.seenFor;
  if (def.create) def.create(e, w);
  if (e.guardian && def.guardian && def.guardian.create) def.guardian.create(e, w);
  if (def.alwaysWet) e.statuses.wet = { t: Infinity };
  w.enemies.push(e);
  W.emit(w, 'spawn', { enemyId: e.id, kind, x, y, via: opts.via || 'placed' });
  if (e.guardian) W.banner(w, '수호자 — ' + ((def.guardian && def.guardian.name) || def.name), 'guardian'); // GDD §9.2
  return e;
};

// Remove an enemy without a kill: no kill event, no shards (recycling, floor clear). why: 'recycle'
// emits nothing (GDD-V2 §3.4); 'clear' emits `dissolve` for the ink-scatter look (§5.5-4).
W.removeEnemy = function (w, e, why) {
  if (e.dead) return;
  e.dead = true; e.state = 'dead';
  BD.ai.release(w, e);
  BD.hazards.cancelOwned(w, e.id);
  if (why === 'recycle') w.stats.recycled++;
  else W.emit(w, 'dissolve', { enemyId: e.id, kind: e.kind, x: M.round(e.x, 3), y: M.round(e.y, 3) });
};

// Spawn with a rift warning (GDD §3.2-5). Respects the enemy cap via a queue.
W.spawnAt = function (w, kind, x, y, opts) {
  opts = Object.assign({}, opts);
  const time = opts.warn !== undefined ? opts.warn : (opts.guardian ? C.WAVES.guardianWarn : C.WAVES.riftWarn);
  const pending = w.rifts.length + w.enemies.filter((e) => !e.dead).length;
  if (pending >= C.CAP.enemies) { w.queue.push({ kind, x, y, opts }); return null; }
  const r = { kind, x, y, opts, time, remain: time };
  w.rifts.push(r);
  W.emit(w, 'rift', { x, y, time, guardian: !!opts.guardian });
  return r;
};

W.updateRifts = function (w, dt) {
  for (const r of w.rifts) r.remain -= dt;
  const done = w.rifts.filter((r) => r.remain <= 0);
  if (done.length) {
    w.rifts = w.rifts.filter((r) => r.remain > 0);
    for (const r of done) {
      const o = Object.assign({ noAttack: C.WAVES.noAttackAfterSpawn, via: r.opts.via || 'rift' }, r.opts);
      const [x, y] = BD.nav.resolve(w.grid, r.x, r.y, 0.3);
      W.makeEnemy(w, r.kind, x, y, o);
    }
  }
  while (w.queue.length && w.rifts.length + w.enemies.filter((e) => !e.dead).length < C.CAP.enemies) {
    const q = w.queue.shift();
    W.spawnAt(w, q.kind, q.x, q.y, q.opts);
  }
};

// ---- hero damage & heal ------------------------------------------------------------------

// info: {source: enemy kind | 'zone', attack, enemyId, attackId, x, y}
// Returns true if damage landed. Dash i-frames turn a would-be hit into one `dodge` per attackId.
W.hurtHero = function (w, dmg, info) {
  const h = w.hero;
  if (h.dead || w.ending) return false;
  if (h.dashInvuln > 0) {
    const key = info.attackId !== undefined ? info.attackId : info.attack + ':' + info.enemyId;
    if (!h.dodged.has(key)) {
      h.dodged.add(key);
      w.stats.dodges++;
      W.emit(w, 'dodge', { attack: info.attack, enemyId: info.enemyId === undefined ? null : info.enemyId });
    }
    return false;
  }
  if (h.invuln > 0) return false;
  if (info.source === 'zone' && h.stats.mods.zoneImmune) return false;
  dmg = Math.max(1, Math.round(dmg));
  h.hp = Math.max(0, h.hp - dmg);
  h.invuln = C.HERO.hurtInvuln;
  h.pose = 'hurt'; h.poseT = 0.3;
  w.stats.hurts++;
  const key = (info.owner || info.source) + ':' + info.attack;
  w.stats.dmgTaken[key] = (w.stats.dmgTaken[key] || 0) + dmg;
  if (info.x !== undefined) {
    const [nx, ny] = M.norm(h.x - info.x, h.y - info.y);
    const res = BD.nav.move(w.grid, h.x, h.y, nx * C.HERO.hurtKnock, ny * C.HERO.hurtKnock, h.r);
    h.x = res[0]; h.y = res[1];
  }
  W.emit(w, 'hurt', { dmg, source: info.source, attack: info.attack, hpAfter: h.hp, enemyId: info.enemyId === undefined ? null : info.enemyId });
  if (h.hp <= 0) BD.flow.heroDies(w, key);
  return true;
};

// Push the hero (boss roar shockwave …). Not damage; respects walls.
W.pushHero = function (w, nx, ny, dist) {
  const h = w.hero;
  const [x, y] = BD.nav.move(w.grid, h.x, h.y, nx * dist, ny * dist, h.r);
  h.x = x; h.y = y;
};

W.heal = function (w, amount, source) {
  const h = w.hero;
  if (h.dead) return 0;
  const a = Math.min(amount, h.maxHp - h.hp);
  if (a <= 0) return 0;
  h.hp += a;
  W.emit(w, 'heal', { amount: a, source, hpAfter: h.hp });
  return a;
};

// Cause text for the result screen: "goblin:stab" -> "고블린의 찌르기에".
BD.causeText = function (cause) {
  if (cause === 'drain') return '여명의 결계에';
  if (cause === 'giveup') return '포기';
  if (!cause) return '';
  const [kind, attack] = cause.split(':');
  if (!BD.enemies.has(kind)) return cause;
  const def = BD.enemies.get(kind);
  const a = def.attacks[attack];
  return def.name + '의 ' + (a ? a.name : attack) + '에';
};

// Distance field from the hero cell, refreshed every 0.2 s (GDD §6.1).
W.updateField = function (w, dt) {
  w.fieldT -= dt;
  if (w.fieldT <= 0 || !w.field) {
    w.fieldT = C.ENEMY.flowEvery;
    let cx = Math.floor(w.hero.x), cy = Math.floor(w.hero.y);
    if (!w.grid.walkable(cx, cy)) {
      // on a cell boundary next to an obstacle: use the open neighbour
      for (const [ox, oy] of [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) if (w.grid.walkable(cx + ox, cy + oy)) { cx += ox; cy += oy; break; }
    }
    const cell = cy * w.grid.w + cx;
    if (cell !== w.fieldCell || !w.field) { w.field = BD.nav.bfs(w.grid, cx, cy); w.fieldCell = cell; }
  }
};
