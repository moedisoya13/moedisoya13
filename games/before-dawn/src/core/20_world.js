// World: the state of one run, plus entity factories and the hero-damage API.
// Everything here is DOM-free and deterministic.

const C = BD.C;
const M = BD.math;

BD.createWorld = function (opts) {
  const seed = opts.seed >>> 0;
  const tier = opts.tier | 0;
  const run = BD.gen.run(seed, tier);
  const w = {
    seed, tier, mods: BD.tierMods(tier), run,
    rng: { spawn: BD.stream(seed, 'spawn'), ai: BD.stream(seed, 'ai'), fx: BD.stream(seed, 'fx') },
    bus: BD.Bus(),
    t: 0, ticks: 0, dt: C.TICK,
    floorN: 0, floor: null, grid: null,
    hero: null, enemies: [], projectiles: [], telegraphs: [], zones: [], hitboxes: [], pickups: [], rifts: [], queue: [],
    wave: null, stairs: null, altar: null, trial: null, interact: { target: null, progress: 0, need: 0 },
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

W.edgeDist = (w, e) => M.dist(w.hero.x, w.hero.y, e.x, e.y) - e.r;
W.alive = (e) => !e.dead && !e.down;
W.livingEnemies = (w) => w.enemies.filter(W.alive);
W.enemyById = (w, id) => { for (const e of w.enemies) if (e.id === id) return e; return null; };

// ---- enemies -------------------------------------------------------------------------

// Create an enemy now (no warning). opts: elite, guardian, via, trial, wave.
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
  if (boss) knock = 0;
  const e = {
    id: W.id(w), kind, def, type: def.type, x, y, r: def.radius * size, size,
    hp: Math.round(hp * hpMul), maxHp: Math.round(hp * hpMul),
    elite: !!opts.elite, guardian: !!opts.guardian, boss, trial: !!opts.trial, wave: opts.wave || 0,
    speed: def.speed * w.mods.enemySpeed, dmg: Math.round(def.dmg * dmgMul), dmgMul, tgScale: tg, knockScale: knock,
    state: 'idle', face: Math.atan2(w.hero.y - y, w.hero.x - x),
    noAttackT: opts.noAttack || 0, stunT: 0, knock: null, lunging: false,
    statuses: {}, flags: {}, mem: {}, slot: null, down: null, revives: 0, dead: false,
    lastSource: null, squash: 0, bornT: w.t,
  };
  if (def.create) def.create(e, w);
  if (e.guardian && def.guardian && def.guardian.create) def.guardian.create(e, w);
  if (def.alwaysWet) e.statuses.wet = { t: Infinity };
  w.enemies.push(e);
  W.emit(w, 'spawn', { enemyId: e.id, kind, x, y, via: opts.via || 'placed' });
  return e;
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
