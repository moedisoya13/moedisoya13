#!/usr/bin/env node
// A script-side trial of the v2 loop on the v1 engine: are the starting numbers of
// docs/GDD-V2.md §3 and §4.2 in the right range? No game file is edited; the v1 simulation is
// monkey-patched from here (the way tools/feel/human_bot.js runs its experiments).
//
//   node tools/fun/proto_horde.js --floor 1 --seeds 1-10 [--hand whirl] [--sec 110]
//   node tools/fun/proto_horde.js --all [--grow]   floors 1, 3, 5 × no card / whirl / pierce / flame
//   --grow adds the damage a player would have grown by that floor (edge boon: +2 per floor, max +6)
//
// What it sets up: one open 48×48 floor, hero in the middle, no waves. Then, per GDD-V2:
//   - goblin: HP 10 × floor factor, speed 3.2, damage 4, stab warning 0.6 s (§3.2); a slime
//     (HP 30 × factor, damage 10) joins a pack every "threat interval" (§3.4)
//   - the director of §3.4: on-screen target rising over the floor budget, spawn tokens, packs of
//     4–8 just outside the view (60 % ahead of the hero), surges, recycling beyond 24u
//   - the view is the hero-centred 1280×720 rectangle; enemies outside the combat window cannot
//     start an attack (§5.6 rule 1); melee cap per floor (§3.5)
//   - every kill drops a shard; shards within 1.2u are picked up; the level curve of §4.2 turns
//     them into level-ups (counted as choices; nothing is upgraded, so the hero stays at base
//     power with radiance = floor − 1 unless --grow: the numbers are a floor, not a ceiling)
// What it does not have: card levels, boons, sites, tasks, shard-seeking in the pilot, slime split.
// The pilot is the human-like one of lib.js on the shipped v1 bot.
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'load'));
const L = require('./lib');

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;

// GDD-V2 §3.4 / §3.5, index = floor
const DIR = [null,
  { budget: 110, from: 12, to: 20, rate: 3.0, threat: 8, threatCap: 3, hp: 1.0, dmg: 1.0, melee: 4 },
  { budget: 130, from: 14, to: 26, rate: 3.5, threat: 8, threatCap: 3, hp: 1.2, dmg: 1.0, melee: 4 },
  { budget: 140, from: 18, to: 32, rate: 4.0, threat: 7, threatCap: 4, hp: 1.4, dmg: 1.15, melee: 5 },
  { budget: 150, from: 22, to: 38, rate: 4.8, threat: 6, threatCap: 5, hp: 1.6, dmg: 1.15, melee: 5 },
  { budget: 160, from: 26, to: 44, rate: 5.5, threat: 5, threatCap: 6, hp: 1.8, dmg: 1.3, melee: 6 },
];
const need = (lv) => (lv === 1 ? 12 : lv === 2 ? 24 : Math.round(30 + 7 * lv));
const SIZE = 48;

function run(seed, floor, hand, sec) {
  const BD = load();
  const D = DIR[floor], C = BD.C, M = BD.math;
  // ---- the v2 numbers, patched onto the v1 definitions
  const gob = BD.enemies.get('goblin'), sl = BD.enemies.get('slime');
  gob.hp = 10; gob.speed = 3.2; gob.dmg = 4; gob.T.tgTime = 0.6;
  sl.hp = 30; sl.dmg = 10;
  C.ENEMY.meleeCap = D.melee; C.CAP.enemies = 110;
  const mk = BD.W.makeEnemy;
  BD.W.makeEnemy = function (w, kind, x, y, opts) {
    const e = mk(w, kind, x, y, opts);
    e.hp = e.maxHp = Math.max(1, Math.round(e.hp * D.hp)); e.dmg = Math.round(e.dmg * D.dmg);
    e.viewT = 0; e.farT = 0;
    return e;
  };
  // the view: camera on the hero (no lead in this trial)
  const sxy = (w, x, y) => [640 + ((x - w.hero.x) - (y - w.hero.y)) * 40, 350 + ((x - w.hero.x) + (y - w.hero.y)) * 20];
  BD.W.onScreen = (w, x, y) => { const [sx, sy] = sxy(w, x, y); return sx >= 0 && sx <= 1280 && sy >= 0 && sy <= 720; };
  BD.W.inView = (w, x, y) => { const [sx, sy] = sxy(w, x, y); return sx >= 48 && sx <= 1232 && sy >= 84 && sy <= 600; };
  const can = BD.ai.canAttack;
  BD.ai.canAttack = (w, e) => can(w, e) && e.viewT >= 0.5;
  BD.events.declare('choice_pick', ['kind', 'pick'], { extra: true });
  BD.events.declare('level_up', ['level'], { extra: true });

  const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  app.botOn = false;
  const met = L.makeMetrics(BD);
  app.onWorld((w) => met.attach(w));
  app.startRun({ seed, tier: 0, hand, floor: 1 });
  const w = app.world;
  for (const e of w.enemies.slice()) if (!e.dead) BD.combat.kill(w, e);
  w.rifts = []; w.queue = []; w.wave.n = 3; w.freezeT = 0;
  w.grid = BD.Grid(SIZE, SIZE); w.field = null; w.fieldCell = -1; w.fieldCache = null;
  w.hero.x = SIZE / 2; w.hero.y = SIZE / 2;
  // --grow: radiance plus the 'edge' boon a player would have by this floor (+2 per floor, three ranks)
  w.hero.radiance = floor - 1 + (o.grow ? 2 * Math.min(3, floor - 1) : 0);
  w.altar = null; w.trial = null; w.pickups = []; if (w.stairs) w.stairs.open = false;
  const raw = met.raw(); // forget the set-up kills
  raw.total.kills = 0; raw.killT.length = 0; raw.gainT.length = 0; raw.minutes.length = 0; raw.floors = {}; raw.ttk = {}; raw.first = {};

  const rnd = BD.stream(seed, 'proto');
  const shards = [];
  let level = 1, xp = 0, tokens = 6, threatT = D.threat, surgeAt = 25, surgeEnd = -1, dirT = 0, lastMove = [0, -1], t0 = w.t;
  w.bus.on('kill', (e) => { shards.push({ x: e.x, y: e.y, v: e.kind === 'slime' ? 3 : 1 }); });

  function spawnPack(withThreat) {
    const h = w.hero;
    let ang = rnd.next() < 0.6 ? Math.atan2(lastMove[1], lastMove[0]) + (rnd.next() * 2 - 1) * 60 * M.DEG : rnd.next() * M.TAU;
    for (let tries = 0; tries < 12; tries++, ang += 0.5) {
      let d = 6;
      while (d < 30 && BD.W.onScreen(w, h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d)) d += 0.5;
      d += 1.5 + rnd.next() * 2.5;
      const px = h.x + Math.cos(ang) * d, py = h.y + Math.sin(ang) * d;
      if (px < 1.5 || py < 1.5 || px > SIZE - 1.5 || py > SIZE - 1.5) continue;
      const n = Math.min(Math.floor(tokens), (floor === 1 ? 4 : 4) + Math.floor(rnd.next() * (floor === 1 ? 3 : 5)));
      for (let i = 0; i < n; i++) {
        const ex = Math.min(SIZE - 1, Math.max(1, px + (rnd.next() * 2 - 1) * 2)), ey = Math.min(SIZE - 1, Math.max(1, py + (rnd.next() * 2 - 1) * 2));
        BD.W.makeEnemy(w, withThreat && i === 0 ? 'slime' : 'goblin', ex, ey, { via: 'placed' });
      }
      tokens -= n;
      return n;
    }
    return 0;
  }

  const pilot = L.makePilot(BD, seed, {});
  const maxT = t0 + sec;
  let guard = 0, levels = 0, picked = 0, dropped = 0, recycled = 0;
  while (app.mode === 'play' && w.t < maxT && guard++ < sec * 60 * 3) {
    const h = w.hero, tau = w.t - t0, dt = C.TICK;
    // director (every 0.4 s)
    tokens = Math.min(12, tokens + D.rate * dt); threatT -= dt; dirT -= dt;
    if (tau >= surgeAt) { surgeEnd = tau + 8; surgeAt += 35; }
    let on = 0, near = 0, threats = 0;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const vis = BD.W.onScreen(w, e.x, e.y), d = Math.hypot(e.x - h.x, e.y - h.y);
      e.viewT = BD.W.inView(w, e.x, e.y) ? e.viewT + dt : 0;
      if (vis) on++; else if (d < 22) near++;
      if (e.kind === 'slime') threats++;
      e.farT = !vis && d > 24 ? e.farT + dt : 0;
      if (e.farT > 3) { BD.ai.release(w, e); e.dead = true; recycled++; }
    }
    if (dirT <= 0) {
      dirT = 0.4;
      const want = (D.from + (D.to - D.from) * Math.min(1, tau / D.budget)) * (tau < surgeEnd ? 1.5 : 1) * (tau > D.budget ? 1.25 : 1);
      const total = w.enemies.filter((e) => !e.dead).length;
      if (on + near < want && total < 110 && tokens >= 4) {
        const th = threatT <= 0 && threats < D.threatCap;
        if (spawnPack(th) && th) threatT = D.threat;
      }
    }
    // shards
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      if (!s.counted) { s.counted = true; dropped += s.v; }
      if (Math.hypot(s.x - h.x, s.y - h.y) <= 1.2) {
        shards.splice(i, 1); xp += s.v; picked += s.v;
        w.bus.emit('pickup', { kind: 'shard', x: s.x, y: s.y });
        while (xp >= need(level)) { xp -= need(level); level++; levels++; w.bus.emit('level_up', { level }); w.bus.emit('choice_pick', { kind: 'level', pick: 'none' }); }
      }
    }
    const inp = pilot.think(w);
    if (Math.hypot(inp.mx, inp.my) > 0.3) lastMove = [inp.mx, inp.my];
    app.input = inp;
    if (app.step()) met.tick(w);
  }
  const s = met.summary();
  s.proto = { floor, level, levels, pickedPct: dropped ? Math.round((100 * picked) / dropped) : 0, recycled, hp: w.hero.hp, died: app.mode !== 'play', sec: Math.round(w.t - t0) };
  return s;
}

const q = (arr, p) => { const s = arr.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
function batch(floor, hand, seeds, sec) {
  const rs = seeds.map((sd) => run(sd, floor, hand, sec));
  const m = (f) => q(rs.map(f), 0.5);
  return {
    floor, hand: hand.join(',') || '(none)', runs: rs.length, died: rs.filter((r) => r.proto.died).length, survived: m((r) => r.proto.sec),
    kpm: m((r) => r.total.killsPerMin), onScreen: m((r) => r.total.onScreenMean), sparse: m((r) => r.total.sparsePct), stk: m((r) => r.swingsToKillAll),
    multi: m((r) => r.total.multiSwingPct), reach3: m((r) => r.inReachAtSwing.threePlus), chase: m((r) => r.total.chasePct),
    hurts: m((r) => r.total.hurtsPerMin), kph: m((r) => r.killsPerHurt), picked: m((r) => r.proto.pickedPct), levels: m((r) => r.proto.levels),
    gap: m((r) => r.choiceGap.median), first: m((r) => (r.first.choice === undefined ? NaN : r.first.choice)), f60: m((r) => r.first60.kills),
  };
}
const [s0, s1] = String(o.seeds || '1-10').split('-').map(Number);
const seeds = []; for (let s = s0; s <= (s1 || s0); s++) seeds.push(s);
const cols = ['floor', 'hand', 'died', 'survived', 'kpm', 'onScreen', 'sparse', 'stk', 'multi', 'reach3', 'chase', 'hurts', 'kph', 'picked', 'levels', 'gap', 'first', 'f60'];
console.log(cols.map((c, i) => (i === 1 ? c.padEnd(10) : c.padStart(9))).join(''));
const show = (b) => console.log(cols.map((c, i) => (i === 1 ? String(b[c]).padEnd(10) : String(b[c]).padStart(9))).join(''));
if (o.all) {
  for (const fl of [1, 3, 5]) for (const hand of [[], ['whirl'], ['pierce'], ['flame']]) show(batch(fl, hand, seeds, DIR[fl].budget));
} else {
  const fl = Number(o.floor || 1);
  show(batch(fl, o.hand && o.hand !== true ? String(o.hand).split(',') : [], seeds, Number(o.sec || DIR[fl].budget)));
}
