#!/usr/bin/env node
// Perfect bot vs a "human-like" bot over many seeds (tier 0, dealt hands, no trials).
//
//   node tools/feel/human_bot.js --seeds 1-100                  both pilots, projectile-aware
//   node tools/feel/human_bot.js --seeds 1-100 --pilots human --hp 0.67 --minwarn 0.6
//   node tools/feel/human_bot.js --seeds 1-40 --blind           pilots that do not see arrows in flight
//
// The human-like pilot wraps the shipped bot (BD.bot.think) and takes away what a person
// does not have:
//   - reaction: a warning is invisible to it for 0.25–0.40 s after it appears (per warning)
//   - it re-decides its movement only every 0.13–0.20 s (the stick is held in between), except
//     that a newly noticed warning triggers an immediate decision (that is the reaction)
//   - 15 % of reactions go the wrong way for 0.25 s (direction off by 45–90°)
//   - aim noise ±12° on every decision
//   - dash is a panic button, not frame-perfect: pressed when it stands in a noticed warning
//     with < 0.35 s left (the shipped bot: < 0.2 s, exact), and only 75 % of the time
// Both pilots are "projectile-aware" unless --blind: an arrow/bolt in flight counts as a warning
// along its next 0.6 s of travel (the shipped bot ignores shots in flight; see
// docs/requests/enemies.md request 2). All randomness comes from a tool-local PRNG seeded by
// the run seed, so results are repeatable. The simulation itself is not modified.
//
// Experiment knobs (script-side monkey patches, no game file changes):
//   --hp K        multiply every enemy's HP (normal, elite, guardian, boss) by K
//   --minwarn S   lengthen every damaging warning shorter than S seconds to S
//   --guardhp K / --bosshp K   extra multiplier for guardians / the boss (on top of --hp)
//   --dmg K       multiply every hit the hero takes by K
//   --invuln S    post-hit invulnerability in seconds (shipped: 0.6)
//   --firewarn S  warning time of the mage's fire circle (shipped: 0.9)
//   --buffer      model a dash input buffer: a dash pressed during cooldown fires when it ends (≤ 0.2 s)
'use strict';
const K = require('./_kit');
const o = K.args();
const BD = K.load();
const M = BD.math, C = BD.C;

const hpK = Number(o.hp || 1), minWarn = Number(o.minwarn || 0), gK = Number(o.guardhp || 1), bK = Number(o.bosshp || 1);
if (hpK !== 1 || gK !== 1 || bK !== 1) {
  const mk = BD.W.makeEnemy;
  BD.W.makeEnemy = function (w, kind, x, y, opts) {
    const e = mk(w, kind, x, y, opts);
    const k = hpK * (e.guardian ? gK : 1) * (e.boss ? bK : 1);
    e.hp = Math.max(1, Math.round(e.hp * k)); e.maxHp = Math.max(1, Math.round(e.maxHp * k));
    return e;
  };
}
const dmgK = Number(o.dmg || 1);
if (dmgK !== 1) {
  const hh = BD.W.hurtHero;
  BD.W.hurtHero = function (w, dmg, info) { return hh(w, dmg * dmgK, info); };
}
if (o.invuln) BD.C.HERO.hurtInvuln = Number(o.invuln);
if (o.firewarn) {
  const tg1 = BD.hazards.telegraph;
  BD.hazards.telegraph = function (w, spec) {
    if (spec.attack === 'fire_circle') spec = Object.assign({}, spec, { time: Number(o.firewarn) });
    return tg1(w, spec);
  };
}
if (minWarn > 0) {
  const tg0 = BD.hazards.telegraph;
  BD.hazards.telegraph = function (w, spec) {
    if ((spec.dmg > 0 || spec.danger) && spec.time < minWarn) spec = Object.assign({}, spec, { time: minWarn });
    return tg0(w, spec);
  };
}

function projShapes(w) {
  const out = [];
  for (const p of w.projectiles) {
    if (!p.hostile) continue;
    const len = Math.min((p.range || 20) - (p.travelled || 0), p.speed * 0.6);
    if (len <= 0) continue;
    const t = (w.hero.x - p.x) * Math.cos(p.dir) + (w.hero.y - p.y) * Math.sin(p.dir);
    out.push({ id: 'p' + p.id, shape: 'line', x: p.x, y: p.y, dir: p.dir, len, width: 2 * p.r + 0.1, remain: Math.max(0, t / p.speed), danger: true, fake: true });
  }
  return out;
}

function pilotPerfect(aware) {
  return function (w, opts) {
    if (!aware) return BD.bot.think(w, opts);
    const real = w.telegraphs;
    w.telegraphs = real.concat(projShapes(w));
    try { return BD.bot.think(w, opts); } finally { w.telegraphs = real; }
  };
}

function pilotHuman(seed, aware) {
  const rnd = K.rng(seed * 7919 + 13);
  const seenAt = new Map(); // warning id → time it becomes visible
  const noticed = new Set();
  const dashRoll = new Map();
  let held = { mx: 0, my: 0 }, nextDecide = 0, wrongUntil = 0, wrongRot = 0;
  return function (w, opts) {
    const real = w.telegraphs;
    const all = aware ? real.concat(projShapes(w)) : real;
    const vis = [];
    let fresh = false;
    for (const t of all) {
      if (!seenAt.has(t.id)) seenAt.set(t.id, w.t + (t.fake ? 0.18 + rnd() * 0.12 : 0.25 + rnd() * 0.15));
      if (w.t >= seenAt.get(t.id)) {
        vis.push(t);
        if (!noticed.has(t.id)) {
          noticed.add(t.id);
          if (t.danger && M.shapeHits(t, w.hero.x, w.hero.y, w.hero.r + 0.05)) fresh = true;
        }
      }
    }
    if (seenAt.size > 4000) { seenAt.clear(); noticed.clear(); dashRoll.clear(); }
    let dash = false;
    // panic dash: standing in a noticed warning about to fire
    let urgent = Infinity, uid = null;
    for (const t of vis) if (t.danger && M.shapeHits(t, w.hero.x, w.hero.y, w.hero.r + 0.05) && t.remain < urgent) { urgent = t.remain; uid = t.id; }
    if (urgent < 0.35 && w.hero.dashCd <= 0) {
      if (!dashRoll.has(uid)) dashRoll.set(uid, rnd() < 0.75);
      dash = dashRoll.get(uid);
    }
    if (fresh || w.t >= nextDecide) {
      w.telegraphs = vis;
      let d;
      try { d = BD.bot.think(w, opts); } finally { w.telegraphs = real; }
      let a = Math.atan2(d.my, d.mx), l = Math.hypot(d.mx, d.my);
      if (fresh && rnd() < 0.15) { wrongUntil = w.t + 0.25; wrongRot = (rnd() < 0.5 ? -1 : 1) * (45 + rnd() * 45) * M.DEG; }
      if (l > 0.01) {
        a += (rnd() * 2 - 1) * 12 * M.DEG;
        if (w.t < wrongUntil) a += wrongRot;
        held = { mx: Math.cos(a), my: Math.sin(a) };
      } else held = { mx: 0, my: 0 };
      nextDecide = w.t + 0.13 + rnd() * 0.07;
    }
    return { mx: held.mx, my: held.my, dash };
  };
}

function run(seed, pilotName, aware) {
  const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  app.botOn = false;
  app.startRun({ seed, tier: 0 });
  const w = app.world;
  const pilot = pilotName === 'human' ? pilotHuman(seed, aware) : pilotPerfect(aware);
  const maxTicks = 1500 * 60;
  let guard = 0, pendingDash = 0, swingTicks = 0, enemyTicks = 0, blocked = 0, moveTicks = 0;
  const floorT = {}; let lastFloor = w.floorN, floorStart = 0;
  while (app.mode === 'play' && w.ticks < maxTicks && guard++ < maxTicks * 3) {
    if (w.altarOpen) { const c = BD.bot.altar(w, {}); app.cmd('altar', c[0], c[1]); continue; }
    const inp = pilot(w, { trial: false });
    if (o.buffer) { // dash input buffer model
      if (inp.dash) pendingDash = 12;
      if (pendingDash > 0) { pendingDash--; inp.dash = true; if (w.hero.dashCd <= 0) pendingDash = 0; }
    }
    app.input = inp;
    const hx = w.hero.x, hy = w.hero.y;
    app.step();
    if (w.floorN !== lastFloor) { floorT[lastFloor] = w.t - floorStart; floorStart = w.t; lastFloor = w.floorN; }
    if (w.enemies.some((e) => !e.dead && !e.down)) { enemyTicks++; if (w.hero.targetId !== null) swingTicks++; }
    if (Math.hypot(inp.mx, inp.my) > 0.5 && w.hero.dashT <= 0) { moveTicks++; if (Math.hypot(w.hero.x - hx, w.hero.y - hy) < C.HERO.speed / 60 * 0.5) blocked++; }
  }
  const s = app.lastResult;
  const ev = w.bus.recent(1e6);
  return {
    seed, result: s ? s.result : 'timeout', floor: w.floorN, sec: w.t, cause: s ? s.cause : null, hurts: w.stats.hurts, dodges: w.stats.dodges,
    dmgTaken: Object.assign({}, w.stats.dmgTaken), uptime: swingTicks / Math.max(1, enemyTicks), floorT, cards: w.cards.filter(Boolean).map((c) => c.id),
    blockedShare: blocked / Math.max(1, moveTicks), dashes: ev.filter((e) => e.event === 'dash').length,
  };
}

function summarize(name, rs) {
  const n = rs.length, wins = rs.filter((r) => r.result === 'win');
  const deaths = rs.filter((r) => r.result !== 'win');
  const byFloor = {}; for (const r of deaths) byFloor[r.floor + 'F'] = (byFloor[r.floor + 'F'] || 0) + 1;
  const causes = {}; for (const r of deaths) causes[r.cause] = (causes[r.cause] || 0) + 1;
  const dmg = {}; for (const r of rs) for (const k of Object.keys(r.dmgTaken)) dmg[k] = (dmg[k] || 0) + r.dmgTaken[k];
  const top = (obj, k) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, b]) => `${a} ${typeof b === 'number' && b > 999 ? Math.round(b) : b}`).join(', ');
  const ft = {}; for (let fl = 1; fl <= 6; fl++) { const v = rs.map((r) => r.floorT[fl]).filter((x) => x !== undefined); if (v.length) ft[fl + 'F'] = Math.round(K.median(v)); }
  const mins = rs.reduce((a, r) => a + r.sec, 0) / 60;
  console.log(`-- ${name}: ${n} runs`);
  console.log(`   wins ${wins.length} (${(100 * wins.length / n).toFixed(0)} %), median death floor ${deaths.length ? K.median(deaths.map((r) => r.floor)) + 'F' : '-'}, reach 2F ${rs.filter((r) => r.floor >= 2).length}/${n}, reach 3F ${rs.filter((r) => r.floor >= 3).length}/${n}, reach roof ${rs.filter((r) => r.floor >= 6).length}/${n}`);
  console.log(`   median win ${wins.length ? (K.median(wins.map((r) => r.sec)) / 60).toFixed(1) + ' min' : '-'}, median death at ${deaths.length ? (K.median(deaths.map((r) => r.sec)) / 60).toFixed(1) + ' min' : '-'}`);
  console.log(`   deaths by floor: ${JSON.stringify(byFloor)}`);
  console.log(`   causes of death: ${top(causes, 8)}`);
  console.log(`   damage taken (sum): ${top(dmg, 8)}`);
  console.log(`   hits taken per minute ${(rs.reduce((a, r) => a + r.hurts, 0) / mins).toFixed(1)}, dashes/min ${(rs.reduce((a, r) => a + r.dashes, 0) / mins).toFixed(1)}, dodges/min ${(rs.reduce((a, r) => a + r.dodges, 0) / mins).toFixed(2)}, attack uptime ${(100 * K.mean(rs.map((r) => r.uptime))).toFixed(0)} %, blocked-while-moving ${(100 * K.mean(rs.map((r) => r.blockedShare))).toFixed(1)} %`);
  console.log(`   median floor time (s): ${JSON.stringify(ft)}`);
  return { name, n, wins: wins.length, byFloor, causes };
}

const [a, b] = String(o.seeds || '1-40').split('-').map(Number);
const pilots = String(o.pilots || 'perfect,human').split(',');
const aware = !o.blind;
console.log(`seeds ${a}-${b || a}, projectile-${aware ? 'aware' : 'blind'}, hp ×${hpK} (guardian ×${gK}, boss ×${bK}), dmg taken ×${dmgK}, post-hit invuln ${BD.C.HERO.hurtInvuln}, min warning ${minWarn || 'as shipped'}${o.firewarn ? ', fire circle warning ' + o.firewarn : ''}${o.buffer ? ', dash buffer 0.2 s' : ''}`);
const t0 = Date.now();
for (const p of pilots) {
  const rs = [];
  for (let s = a; s <= (b || a); s++) rs.push(run(s, p, aware));
  summarize(p, rs);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s wall)`);
