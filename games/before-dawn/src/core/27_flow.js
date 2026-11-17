// Run flow: floor entry, waves and rifts (§3.2), guardian and sealed stairs (§3.3),
// stay-to-interact (§3.4), altar and trial state machines (§3.5), flasks, floor transitions,
// the clock and dawn drain (§3.6), win and loss (§3.7).
//
// altar.state: 'off' → 'lit' (guardian down) → 'open' (overlay) → 'used' | 'lit' (나중에)
//              → after a cleared trial: 'lit' again with two new offers
// altar.step (while open): 'choose' → 'slot'
// trial.state: 'none' → 'available' (guardian down) → 'active' → 'cleared'

const C = BD.C;
const M = BD.math;
const W = BD.W;
const F = BD.flow = {};

F.enterFloor = function (w, n) {
  const f = w.run.floors[n];
  if (f.v2) return F.enterFloorV2(w, n);
  w.floorN = n; w.floor = f;
  w.grid = BD.Grid.fromString(f.w, f.h, f.cells);
  w.enemies = []; w.projectiles = []; w.telegraphs = []; w.zones = []; w.hitboxes = []; w.pickups = []; w.rifts = []; w.queue = [];
  w.shards = []; w.sites = []; w.task = null; w.director = null;
  w.field = null; w.fieldT = 0; w.fieldCell = -1; w.fieldCache = null;
  const h = w.hero, L = f.layout;
  h.x = L.start[0]; h.y = L.start[1]; h.targetId = null; h.dashT = 0; h.dashBuf = 0; h.face = Math.atan2(-1, -1);
  w.stats.floorReached = Math.max(w.stats.floorReached, n);
  w.interact = { target: null, progress: 0, need: 0, sealedToast: false };
  for (const p of L.flasks) w.pickups.push({ id: W.id(w), kind: 'flask', x: p[0], y: p[1] });
  w.stairs = L.stairs ? Object.assign({ open: false }, L.stairs) : null;
  w.altar = L.altar ? { state: 'off', x: L.altar[0], y: L.altar[1], offers: [], offered: [], round: 0, step: 'choose', pick: null, needExit: false } : null;
  w.trial = L.trialRift ? { state: 'none', x: L.trialRift[0], y: L.trialRift[1], t0: 0 } : null;
  w.wave = { n: 1, t: 0, guardianId: null };
  w.freezeT = C.WAVES.initFreeze;
  BD.view.snapCam(w);
  W.emit(w, 'floor_enter', { floor: n, domType: f.domType, nextDomType: f.nextDomType });
  W.banner(w, n === 6 ? '옥상 — 마왕' : n + 'F — ' + C.TYPE_NAMES[f.domType], 'floor');
  if (n === 6) {
    const b = W.makeEnemy(w, f.spawns.boss, L.bossPos[0], L.bossPos[1], { via: 'placed' });
    w.wave.guardianId = b.id;
    W.emit(w, 'wave_start', { floor: n, wave: 1, count: 1 });
  } else {
    f.spawns.w1.forEach((k, i) => W.makeEnemy(w, k, L.wave1[i][0], L.wave1[i][1], { via: 'placed', wave: 1 }));
    W.emit(w, 'wave_start', { floor: n, wave: 1, count: f.spawns.w1.length });
  }
};

// v2 floors (GDD-V2 §5.5): no waves; the task, the director and the sites run the floor. The hero
// stands at the start, enemies stay still for the entry freeze (1.5 s). w.wave survives only as
// the test idiom `w.wave.n = 3` (BD.W.scenario: no director, no choice overlay).
const TASK_NAMES = () => { const o = {}; for (const id of BD.tasks.ids()) o[id] = BD.tasks.get(id).name; return o; };
F.enterFloorV2 = function (w, n) {
  const f = w.run.floors[n];
  if (w.task && w.task.owner) w.bus.offOwner(w.task.owner);
  w.floorN = n; w.floor = f;
  w.grid = BD.Grid.fromString(f.w, f.h, f.cells);
  w.enemies = []; w.projectiles = []; w.telegraphs = []; w.zones = []; w.hitboxes = []; w.pickups = []; w.rifts = []; w.queue = [];
  w.shards = []; w.field = null; w.fieldT = 0; w.fieldCell = -1; w.fieldCache = null;
  const h = w.hero, L = f.layout;
  h.x = L.start[0]; h.y = L.start[1]; h.targetId = null; h.dashT = 0; h.dashBuf = 0; h.face = Math.atan2(-1, -1);
  w.stats.floorReached = Math.max(w.stats.floorReached, n);
  w.interact = { target: null, progress: 0, need: 0, sealedToast: false };
  for (const p of L.flasks) w.pickups.push({ id: W.id(w), kind: 'flask', x: p[0], y: p[1] });
  w.stairs = L.stairs ? Object.assign({ open: false }, L.stairs) : null;
  w.altar = null; w.trial = null;
  w.wave = { n: 1, t: 0, guardianId: null };
  w.freezeT = C.WAVES.initFreeze;
  BD.view.snapCam(w);
  W.updateField(w, 0);
  W.emit(w, 'floor_enter', { floor: n, domType: f.domType, nextDomType: f.nextDomType });
  if (n === 6) {
    W.banner(w, '옥상 — 마왕', 'floor');
    const b = W.makeEnemy(w, f.spawns.boss, L.bossPos[0], L.bossPos[1], { via: 'placed' });
    w.wave.guardianId = b.id;
    w.task = null;
  } else {
    W.banner(w, n + 'F — ' + C.TYPE_NAMES[f.domType] + ' · ' + (TASK_NAMES()[f.task] || f.task), 'floor');
    BD.taskRt.start(w);
  }
  BD.siteRt.start(w);
  BD.pickupRt.start(w); // GDD-V2 §6: what threats leave behind
  BD.director.start(w);
};

function riftPos(w, i) {
  const r = w.floor.layout.rifts[i % w.floor.layout.rifts.length];
  const j = w.rng.spawn;
  return [r[0] + j.range(-0.45, 0.45), r[1] + j.range(-0.45, 0.45)];
}

F.survivors = function (w) {
  let n = 0;
  for (const e of w.enemies) if (!e.dead && !e.guardian && !e.trial) n++;
  for (const r of w.rifts) if (!r.opts.guardian && !r.opts.trial) n++;
  for (const q of w.queue) if (!q.opts.guardian && !q.opts.trial) n++;
  return n;
};

F.updateWaves = function (w, dt) {
  if (w.floorN === 6 || !w.wave || w.floor.v2) return;
  const wv = w.wave, sp = w.floor.spawns;
  wv.t += dt;
  if (wv.n === 1 && (F.survivors(w) <= C.WAVES.wave2Survivors || wv.t >= C.WAVES.timeout)) {
    wv.n = 2; wv.t = 0;
    sp.w2.forEach((k, i) => { const p = riftPos(w, i); W.spawnAt(w, k, p[0], p[1], { wave: 2, elite: sp.elites.includes(i) }); });
    W.emit(w, 'wave_start', { floor: w.floorN, wave: 2, count: sp.w2.length });
  } else if (wv.n === 2 && (F.survivors(w) <= C.WAVES.wave3Survivors || wv.t >= C.WAVES.timeout)) {
    wv.n = 3; wv.t = 0;
    sp.w3.forEach((k, i) => { const p = riftPos(w, i); W.spawnAt(w, k, p[0], p[1], { wave: 3 }); });
    const s = w.stairs;
    const gx = s.side === 'y0' ? s.x : 0.9, gy = s.side === 'y0' ? 0.9 : s.y;
    W.spawnAt(w, sp.guardian, gx, gy, { wave: 3, guardian: true, via: 'door' });
    W.emit(w, 'wave_start', { floor: w.floorN, wave: 3, count: sp.w3.length + 1 });
  }
};

F.guardianKilled = function (w, e) {
  if (w.floorN === 6) return;
  w.hero.radiance = Math.min(C.RADIANCE_MAX, w.hero.radiance + 1);
  w.stairs.open = true;
  W.emit(w, 'guardian_kill', { floor: w.floorN, kind: e.kind });
  if (w.floor.v2) BD.taskRt.floorClear(w); // GDD-V2 §5.5-4
  W.emit(w, 'stairs_open', { floor: w.floorN });
  W.banner(w, '계단이 열렸다', 'stairs');
  F.lightAltar(w);
  if (w.trial && w.trial.state === 'none') w.trial.state = 'available';
};

F.lightAltar = function (w) {
  const a = w.altar;
  if (!a) return;
  const equipped = w.cards.filter(Boolean).map((c) => c.id);
  a.offers = BD.cardRt.offers(w.run, w.floorN, a.round, equipped, a.offered, w.unlocked);
  a.offered = a.offered.concat(a.offers);
  a.round++;
  a.state = 'lit'; a.step = 'choose'; a.pick = null; a.needExit = false;
};

F.bossKilled = function (w) {
  if (w.ending) return;
  w.ending = { kind: 'win', t: C.ENDING.win, cause: null };
  W.emit(w, 'win', { t: M.round(w.t, 3) });
};

F.heroDies = function (w, cause) {
  const h = w.hero;
  if (h.dead) return;
  h.dead = true; h.hp = 0; h.pose = 'hurt'; h.dashBuf = 0;
  w.ending = { kind: 'death', t: cause === 'giveup' ? 0 : C.ENDING.death, cause };
  w.altarOpen = false;
  W.emit(w, 'death', { cause, floor: w.floorN, t: M.round(w.t, 3) });
};

F.dropFlask = function (w, x, y) {
  if (w.floor && w.floor.v2) { BD.pickupRt.drop(w, 'flask', x, y); return; } // GDD-V2 §6: at most 4 on a floor
  const [px, py] = BD.nav.resolve(w.grid, x, y, 0.3);
  w.pickups.push({ id: W.id(w), kind: 'flask', x: px, y: py });
};

// ---- stay-to-interact -------------------------------------------------------------------

F.ringAt = function (w) {
  const h = w.hero, R = C.INTERACT.ring;
  const s = w.stairs, a = w.altar, t = w.trial;
  if (s && M.dist(h.x, h.y, s.ringX, s.ringY) <= R) return 'stairs';
  if (a && (a.state === 'lit') && !a.needExit && M.dist(h.x, h.y, a.x, a.y) <= R) return 'altar';
  if (t && t.state === 'available' && M.dist(h.x, h.y, t.x, t.y) <= R) return 'trial';
  return null;
};

F.updateInteract = function (w, dt) {
  const I = w.interact, h = w.hero;
  if (w.altar && w.altar.needExit && M.dist(h.x, h.y, w.altar.x, w.altar.y) > C.INTERACT.ring) w.altar.needExit = false;
  const at = h.dashT > 0 ? null : F.ringAt(w);
  if (at !== I.target) { I.target = at; I.progress = 0; I.sealedToast = false; }
  if (!at) return;
  if (at === 'stairs' && !w.stairs.open) {
    if (!I.sealedToast) { I.sealedToast = true; W.toast(w, '계단이 봉인되어 있다'); }
    I.progress = 0; I.need = 0;
    return;
  }
  I.need = C.INTERACT[at];
  I.progress += dt;
  if (I.progress + 1e-9 < I.need) return;
  I.target = null; I.progress = 0;
  if (at === 'stairs') F.useStairs(w);
  else if (at === 'altar') F.openAltar(w);
  else if (at === 'trial') F.startTrial(w);
};

F.useStairs = function (w) {
  W.emit(w, 'floor_exit', { floor: w.floorN, t: M.round(w.t, 3) });
  w.blackoutT = C.INTERACT.blackout;
  w.blackoutTo = w.floorN + 1;
};

F.updatePickups = function (w) { BD.pickupRt.update(w); }; // touch pickups (src/core/33_pickups.js)

// ---- altar ---------------------------------------------------------------------------------

F.openAltar = function (w) {
  const a = w.altar;
  a.state = 'open'; a.step = 'choose'; a.pick = null;
  w.altarOpen = true;
  w.hero.dashBuf = 0; // a dash pressed on the way in does not fire when the altar closes
  W.emit(w, 'altar_open', { floor: w.floorN });
};

function closeAltar(w, state, choice) {
  const a = w.altar;
  a.state = state; a.step = 'choose'; a.pick = null; a.needExit = true;
  w.altarOpen = false;
  w.hero.invuln = Math.max(w.hero.invuln, C.INTERACT.closeInvuln);
  W.emit(w, 'altar_close', { floor: w.floorN, choice });
}

// Altar commands (from the overlay or the bot). Throws on commands that are not valid now.
// pick(i) → step 'slot'; slot(s) → swap; back(); pray(); later()
F.altarCmd = function (w, cmd, arg) {
  const a = w.altar;
  if (!a || a.state !== 'open') BD.fail(`altar command '${cmd}' while altar is not open`);
  if (cmd === 'pick') {
    if (!(arg >= 0 && arg < a.offers.length)) BD.fail(`altar pick ${arg} out of range`);
    a.pick = arg; a.step = 'slot';
  } else if (cmd === 'back') {
    a.pick = null; a.step = 'choose';
  } else if (cmd === 'slot') {
    if (a.step !== 'slot') BD.fail('altar slot before pick');
    if (!(arg >= 0 && arg <= 2)) BD.fail(`altar slot ${arg} out of range`);
    const inId = a.offers[a.pick];
    const out = w.cards[arg];
    BD.cardRt.unequip(w, arg, 'swap');
    BD.cardRt.equip(w, arg, inId);
    W.emit(w, 'card_swap', { slot: arg, outId: out ? out.id : null, inId });
    W.toast(w, '성인을 새겼다: ' + BD.cards.get(inId).name);
    closeAltar(w, 'used', 'card');
  } else if (cmd === 'pray') {
    W.heal(w, C.PRAY, 'altar');
    W.emit(w, 'altar_pray', { floor: w.floorN });
    closeAltar(w, 'used', 'pray');
  } else if (cmd === 'later') {
    closeAltar(w, 'lit', 'later');
  } else BD.fail(`unknown altar command '${cmd}'`);
};

// ---- trial ---------------------------------------------------------------------------------

F.startTrial = function (w) {
  const t = w.trial, f = w.floor;
  t.state = 'active'; t.t0 = w.t;
  w.stats.trials++;
  W.emit(w, 'trial_start', { floor: w.floorN });
  W.banner(w, '시련 — 균열이 열렸다', 'trial');
  f.trial.kinds.forEach((k, i) => { const p = riftPos(w, i); W.spawnAt(w, k, p[0], p[1], { trial: true }); });
  if (f.trial.elite) { const p = riftPos(w, f.trial.kinds.length); W.spawnAt(w, f.trial.elite, p[0], p[1], { trial: true, elite: true }); }
  W.emit(w, 'wave_start', { floor: w.floorN, wave: 'trial', count: f.trial.kinds.length + (f.trial.elite ? 1 : 0) });
};

F.updateTrial = function (w) {
  const t = w.trial;
  if (!t || t.state !== 'active') return;
  if (w.enemies.some((e) => e.trial && !e.dead) || w.rifts.some((r) => r.opts.trial) || w.queue.some((q) => q.opts.trial)) return;
  t.state = 'cleared';
  w.stats.trialSec += w.t - t.t0;
  W.emit(w, 'trial_clear', { floor: w.floorN });
  W.banner(w, '시련을 넘었다 — 제단이 다시 켜졌다', 'trial_clear');
  F.lightAltar(w);
};

// ---- clock -----------------------------------------------------------------------------------

F.runSec = (w) => w.mods.runSec;
F.clockMin = (w) => (w.t * 720) / w.mods.runSec;
F.clockStr = function (w) {
  const m = Math.floor(C.CLOCK_START_MIN + F.clockMin(w) + 1e-6) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};

F.updateDawn = function (w, dt) {
  const over = w.t - w.mods.runSec;
  if (over < 0) return;
  if (!w.dawnFired) {
    w.dawnFired = true;
    W.emit(w, 'dawn', { t: M.round(w.t, 3) });
    W.toast(w, '동이 튼다 — 결계가 몸을 갉는다');
  }
  w.drainAcc += dt;
  while (w.drainAcc >= 1 - 1e-9 && !w.hero.dead) {
    w.drainAcc -= 1;
    const dmg = over <= C.DAWN.firstSec ? C.DAWN.rate1 : C.DAWN.rate2;
    w.hero.hp = Math.max(0, w.hero.hp - dmg);
    W.emit(w, 'drain', { dmg, hpAfter: w.hero.hp });
    if (w.hero.hp <= 0) F.heroDies(w, 'drain');
  }
};

F.update = function (w, dt) {
  F.updateWaves(w, dt);
  F.updateTrial(w);
  F.updatePickups(w);
  F.updateInteract(w, dt);
  BD.siteRt.update(w, dt);
};
