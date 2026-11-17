#!/usr/bin/env node
// Feel measurements that need only the simulation (no browser).
//   node tools/feel/sim_feel.js            all sections
//   node tools/feel/sim_feel.js --only move,dash,escape,ttk,target
// Prints one block per section; --json prints the collected numbers as JSON at the end.
'use strict';
const K = require('./_kit');
const o = K.args();
const only = o.only ? String(o.only).split(',') : null;
const want = (s) => !only || only.includes(s);
const BD = K.load();
const C = BD.C, M = BD.math;
const out = {};
const f = K.f;

// ---------------------------------------------------------------------------------------------
if (want('move')) {
  const r = out.move = {};
  // acceleration / stopping: speed per tick after input on and after input off
  {
    const { H, w } = K.arena({ BD, noAttack: true });
    const h = w.hero, xs = [];
    H.input({ mx: 1, my: 0 });
    for (let i = 0; i < 6; i++) { const x0 = h.x; H.step(1); xs.push((h.x - x0) * 60); }
    H.input({ mx: 0, my: 0 });
    const stop = [];
    for (let i = 0; i < 6; i++) { const x0 = h.x; H.step(1); stop.push((h.x - x0) * 60); }
    r.speedPerTickAfterPress = xs.map((v) => +v.toFixed(3));
    r.speedPerTickAfterRelease = stop.map((v) => +v.toFixed(3));
    r.ticksToFullSpeed = xs.findIndex((v) => v >= C.HERO.speed * 0.99) + 1;
    r.ticksToStop = stop.findIndex((v) => Math.abs(v) < 1e-6) + 1;
  }
  // diagonal: world speed, and the on-screen speed for the 8 screen directions
  {
    r.screen = {};
    for (const [name, sx, sy] of [['right', 1, 0], ['up', 0, -1], ['up-right', 1, -1], ['down-right', 1, 1]]) {
      const { H, w } = K.arena({ BD, noAttack: true });
      const wx = sx / 80 + sy / 40, wy = -sx / 80 + sy / 40, l = Math.hypot(wx, wy);
      const h = w.hero, x0 = h.x, y0 = h.y;
      H.input({ mx: wx / l, my: wy / l }); H.step(30);
      const dx = (h.x - x0) * 2, dy = (h.y - y0) * 2;
      r.screen[name] = { worldSpeed: +Math.hypot(dx, dy).toFixed(3), screenPxPerSec: +Math.hypot((dx - dy) * 40, (dx + dy) * 20).toFixed(1), screenAngleDeg: +(Math.atan2((dx + dy) * 20, (dx - dy) * 40) / M.DEG).toFixed(1) };
    }
    const { H, w } = K.arena({ BD, noAttack: true });
    const h = w.hero, x0 = h.x, y0 = h.y;
    H.input({ mx: 1, my: 1 }); H.step(60); // un-normalised input, as two keys would give in world axes
    r.worldDiagonalSpeed = +Math.hypot(h.x - x0, h.y - y0).toFixed(3);
  }
  // wall slide: push into the x = 0 wall at an angle; speed kept along the wall
  {
    r.wallSlide = {};
    for (const deg of [15, 30, 45, 60, 75, 90]) {
      const { H, w } = K.arena({ BD, noAttack: true, hx: 0.36, hy: 4 });
      const h = w.hero, y0 = h.y;
      const a = deg * M.DEG; // 90 = straight into the wall
      H.input({ mx: -Math.sin(a), my: Math.cos(a) }); H.step(60);
      r.wallSlide[deg] = +((h.y - y0)).toFixed(2); // u travelled along the wall in 1 s (free: 4.2)
    }
  }
  // obstacle corner: one solid cell straight ahead, lateral offset 0 … 0.9u. progress in 1.0 s
  {
    const Wd = 12, Hh = 12;
    let cells = '';
    for (let y = 0; y < Hh; y++) for (let x = 0; x < Wd; x++) cells += (x === 6 && y === 6) ? '#' : '.';
    r.pillar = {};
    let grid;
    try { grid = BD.Grid.fromString(Wd, Hh, cells); } catch (e) { grid = null; }
    for (const off of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.8, 0.9]) {
      const { H, w } = K.arena({ BD, noAttack: true, w: Wd, h: Hh, hx: 4, hy: 6.5 + off });
      if (grid) w.grid = BD.Grid.fromString(Wd, Hh, cells); else { w.grid.set(6, 6, BD.CELL.SOLID); }
      const h = w.hero;
      H.input({ mx: 1, my: 0 }); H.step(90);
      r.pillar[off] = { x: +h.x.toFixed(2), y: +h.y.toFixed(2), passed: h.x > 7 };
    }
  }
  // enemy body block: (a) a frozen ring of N ghouls around the hero, push 2 s; (b) live goblins
  {
    r.ring = {};
    for (const n of [4, 5, 6, 8]) {
      const { H, w } = K.arena({ BD, noAttack: true });
      const h = w.hero;
      const R = C.ENEMY.keepOut + 0.45; // centre distance at the keep-out edge
      for (let i = 0; i < n; i++) { const a = (i / n) * M.TAU + 0.3; const e = K.spawn(BD, w, 'ghoul', h.x + Math.cos(a) * R, h.y + Math.sin(a) * R); e.stunT = 1e9; }
      const x0 = h.x, y0 = h.y;
      let best = 0;
      for (let k = 0; k < 16; k++) { // try 16 directions, keep the best escape
        h.x = x0; h.y = y0;
        const a = (k / 16) * M.TAU;
        H.input({ mx: Math.cos(a), my: Math.sin(a) }); H.step(120);
        best = Math.max(best, Math.hypot(h.x - x0, h.y - y0));
      }
      const gap = 2 * R * Math.sin(Math.PI / n) - 0.9;
      r.ring[n] = { gapBetweenBodies: +gap.toFixed(2), bestEscapeIn2s: +best.toFixed(2), trapped: best < 2 };
    }
    // live: 8 goblins already around the hero; hero walks +x for 3 s (free = 12.6u)
    const res = [];
    for (let seed = 1; seed <= 10; seed++) {
      const { H, w } = K.arena({ BD, noAttack: true, seed, w: 24, h: 24, hx: 6, hy: 12 });
      const h = w.hero;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * M.TAU; K.spawn(BD, w, 'goblin', h.x + Math.cos(a) * 1.6, h.y + Math.sin(a) * 1.6); }
      H.step(60); // let them settle into the ring
      const x0 = h.x; let blocked = 0;
      H.input({ mx: 1, my: 0 });
      for (let i = 0; i < 180; i++) { const px = h.x, py = h.y; h.invuln = 1; H.step(1); if (Math.hypot(h.x - px, h.y - py) < C.HERO.speed / 60 * 0.5) blocked++; }
      res.push({ dist: h.x - x0, blocked });
    }
    r.liveGoblins8 = { meanDistIn3s: +K.mean(res.map((x) => x.dist)).toFixed(2), free: 12.6, meanBlockedTicks: +K.mean(res.map((x) => x.blocked)).toFixed(1), worstDist: +Math.min(...res.map((x) => x.dist)).toFixed(2) };
    // guardians and the boss must not be shoved: walk into a stunned guardian for 1.5 s
    {
      const { H, w } = K.arena({ BD, noAttack: true, hx: 4, hy: 8 });
      const g0 = K.spawn(BD, w, 'ghoul', 6, 8.1, { guardian: true }); g0.stunT = 1e9;
      const gx = g0.x, gy = g0.y;
      H.input({ mx: 1, my: 0 }); H.step(90);
      r.guardianShoved = +Math.hypot(g0.x - gx, g0.y - gy).toFixed(3);
    }
    // walking straight into one stationary enemy head-on and slightly off-centre
    r.headOn = {};
    for (const off of [0, 0.05, 0.2, 0.4]) {
      const { H, w } = K.arena({ BD, noAttack: true, hx: 4, hy: 8 });
      const h = w.hero;
      const e = K.spawn(BD, w, 'ghoul', 6, 8 + off); e.stunT = 1e9;
      H.input({ mx: 1, my: 0 }); H.step(90);
      r.headOn[off] = { x: +h.x.toFixed(2), passed: h.x > 7 };
    }
  }
  console.log('== move ==\n' + JSON.stringify(r, null, 1));
}

// ---------------------------------------------------------------------------------------------
if (want('dash')) {
  const r = out.dash = {};
  { // distance, duration, i-frames
    const { H, w } = K.arena({ BD, noAttack: true });
    const h = w.hero, x0 = h.x;
    H.input({ mx: 1, my: 0, dash: true }); H.step(1); H.input({ mx: 1, my: 0 });
    let dashTicks = 1, inv = 1;
    while (h.dashT > 0) { H.step(1); dashTicks++; }
    r.dashTicks = dashTicks; r.dashDist = +(h.x - x0).toFixed(2);
    const { H: H2, w: w2 } = K.arena({ BD, noAttack: true });
    H2.input({ mx: 1, my: 0, dash: true }); H2.step(1); H2.input({ mx: 0, my: 0 });
    while (w2.hero.dashInvuln > 0) { H2.step(1); inv++; }
    r.invulnTicks = inv; r.cooldown = C.DASH.cd;
  }
  { // press during cooldown: is it remembered?
    r.buffer = {};
    for (const early of [1, 3, 6, 10, 18]) { // press `early` ticks before the cooldown ends, 1-tick press
      const { H, w } = K.arena({ BD, noAttack: true });
      const h = w.hero;
      H.input({ mx: 1, my: 0, dash: true }); H.step(1); H.input({ mx: 1, my: 0 });
      while (h.dashCd > early / 60 + 1e-9) H.step(1);
      const n0 = w.bus.recent(4000).filter((e) => e.type === 'dash').length;
      H.input({ mx: 1, my: 0, dash: true }); H.step(1); H.input({ mx: 1, my: 0 }); H.step(30);
      r.buffer[early + ' ticks early'] = w.bus.recent(4000).filter((e) => e.type === 'dash').length > n0 ? 'dashes' : 'DROPPED';
    }
  }
  { // direction with no input: facing; facing while a swing's aim is held
    const { H, w } = K.arena({ BD, noAttack: true });
    const h = w.hero;
    H.input({ mx: 0, my: 1 }); H.step(10); H.input({ mx: 0, my: 0 }); H.step(10);
    const y0 = h.y, x0 = h.x;
    H.input({ mx: 0, my: 0, dash: true }); H.step(1); H.input({ mx: 0, my: 0 }); H.step(20);
    r.noInputDir = `last move dir (0,1) → dashed (${f(h.x - x0)}, ${f(h.y - y0)})`;
    // standing still next to an enemy: the hero faces the target while swinging → dash goes INTO it
    const A2 = K.arena({ BD });
    const h2 = A2.w.hero;
    A2.H.input({ mx: 0, my: 1 }); A2.H.step(10); A2.H.input({ mx: 0, my: 0 }); // last movement: +y
    const e = K.spawn(BD, A2.w, 'ghoul', h2.x + 1.6, h2.y); e.stunT = 1e9;
    A2.H.step(5);
    const bx = h2.x, by = h2.y;
    A2.H.input({ mx: 0, my: 0, dash: true }); A2.H.step(1); A2.H.input({ mx: 0, my: 0 }); A2.H.step(20);
    r.idleDashNextToTarget = { dx: +(h2.x - bx).toFixed(2), dy: +(h2.y - by).toFixed(2), note: 'last movement was +y, the target stands at +x; in the built game the client sends the last movement direction, the core alone uses the facing' };
  }
  console.log('== dash ==\n' + JSON.stringify(r, null, 1));
}

// ---------------------------------------------------------------------------------------------
// escape: for each attack, catch real telegraphs, then ask: starting `react` s after the warning
// appears, can the hero walk out (4.2 u/s, straight line, best of 32 directions)? can he dash out?
if (want('escape')) {
  const r = out.escape = {};
  const REACTS = [0, 0.25, 0.30, 0.35];
  function exitDist(w, tg, x, y, hr) { // shortest straight walk that leaves the shape
    let best = Infinity;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * M.TAU;
      for (let d = 0; d <= 8; d += 0.05) {
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (!M.shapeHits(tg, px, py, hr)) { best = Math.min(best, d); break; }
      }
    }
    return best;
  }
  const cases = [
    ['goblin stab', 'goblin', {}, 0.9], ['slime pounce', 'slime', {}, 2.0], ['ghoul lunge', 'ghoul', {}, 1.6],
    ['archer shot', 'skel_archer', {}, 6], ['mage fire circle', 'mage', {}, 5], ['knight charge', 'dark_knight', {}, 3.5],
    ['ELITE goblin stab', 'goblin', { elite: true }, 0.9], ['ELITE ghoul lunge', 'ghoul', { elite: true }, 1.6],
    ['GUARDIAN goblin stab', 'goblin', { guardian: true }, 0.9], ['GUARDIAN ghoul lunge', 'ghoul', { guardian: true }, 1.6],
    ['GUARDIAN slime pounce', 'slime', { guardian: true }, 2.0], ['GUARDIAN mage circles', 'mage', { guardian: true }, 5],
    ['GUARDIAN knight charge', 'dark_knight', { guardian: true }, 3.5],
  ];
  for (const [name, kind, opts, dist] of cases) {
    const samples = [];
    for (let seed = 1; seed <= 6 && samples.length < 6; seed++) {
      const { H, w } = K.arena({ BD, noAttack: true, seed, w: 20, h: 20 });
      const h = w.hero;
      K.spawn(BD, w, kind, h.x + dist + (opts.guardian ? 0.4 : 0), h.y, opts);
      const seen = new Set();
      for (let i = 0; i < 600 && samples.length < 6; i++) {
        h.invuln = 1; H.step(1);
        for (const tg of w.telegraphs) {
          if (!tg.danger || seen.has(tg.id)) continue; seen.add(tg.id);
          if (!M.shapeHits(tg, h.x, h.y, h.r)) continue;
          samples.push({ time: tg.total, exit: exitDist(w, tg, h.x, h.y, h.r), attack: tg.attack, shape: tg.shape });
        }
      }
    }
    if (!samples.length) { r[name] = 'no telegraph caught'; continue; }
    const time = K.median(samples.map((s) => s.time)), exit = Math.max(...samples.map((s) => s.exit));
    const row = { attack: samples[0].attack, shape: samples[0].shape, warn: +time.toFixed(2), worstExitDist: +exit.toFixed(2), walkTime: +(exit / C.HERO.speed).toFixed(2), dashClears: exit <= C.DASH.dist };
    for (const re of REACTS) row['walkMargin@' + re] = +(time - re - exit / C.HERO.speed).toFixed(2);
    // dash: leaves if exit ≤ 3.2u; time to cover `exit` at 16 u/s; or i-frames cover the hit
    row['dashMargin@0.30'] = +(time - 0.30 - Math.min(exit, C.DASH.dist) / (C.DASH.dist / C.DASH.dur)).toFixed(2);
    r[name] = row;
  }
  // boss shapes straight from the def numbers (centre of the shape = worst case)
  r.boss = {
    cleave: { warn: 0.9, warn3: 0.7, note: 'fan 140° r 3.6: worst exit ≈ backwards 3.6u−dist; from 2u in front: 1.95u → walk 0.46 s' },
    thorns: { warn: 1.0, exit: 1.2 + 0.35, walkTime: +((1.55) / 4.2).toFixed(2) },
    collapse: { warn: 0.8, ringWidth: 3, worstExit: 1.5 + 0.35, walkTime: +((1.85) / 4.2).toFixed(2) },
    bolts: { warn: 0.6, exit: 0.2 + 0.35, walkTime: +((0.55) / 4.2).toFixed(2) },
  };
  console.log('== escape ==');
  for (const k of Object.keys(r)) console.log(k.padEnd(26), JSON.stringify(r[k]));
}

// ---------------------------------------------------------------------------------------------
// time to kill: a stunned dummy of each kind at 1.2u, hero standing; base hand and dealt hands
if (want('ttk')) {
  const r = out.ttk = {};
  const GDD_HP = { goblin: 20, slime: 30, skel_archer: 25, ghoul: 60, mage: 40, dark_knight: 120 };
  const kinds = Object.keys(GDD_HP);
  function ttk(kind, hand, behind, hp) {
    const { H, w } = K.arena({ BD, hand });
    const h = w.hero;
    const e = K.spawn(BD, w, kind, h.x + 1.3, h.y);
    e.stunT = 1e9; if (hp) { e.hp = hp; e.maxHp = hp; }
    e.face = behind ? 0 : Math.PI; // facing away from / toward the hero (hero is at −x)
    let t = 0;
    while (!e.dead && t < 60 * 120) { e.stunT = 1e9; if (e.down) { /* corpse: keep hitting */ } H.step(1); t++; }
    return t / 60;
  }
  const hands = [];
  for (let s = 1; s <= 40; s++) hands.push(BD.cardRt.dealHand(s, BD.harness().app.save.unlocked, 0));
  for (const kind of kinds) {
    const now = BD.enemies.get(kind).hp;
    const row = { hpGDD: GDD_HP[kind], hpNow: now };
    const front = kind === 'dark_knight';
    row.baseGDD = +ttk(kind, [], !front ? true : false, GDD_HP[kind]).toFixed(1);
    row.baseNow = +ttk(kind, [], !front ? true : false).toFixed(1);
    if (front) { row.baseNowBack = +ttk(kind, [], true).toFixed(1); row.baseGDDBack = +ttk(kind, [], true, GDD_HP[kind]).toFixed(1); }
    const hn = hands.map((hd) => ttk(kind, hd, !front)), hg = hands.map((hd) => ttk(kind, hd, !front, GDD_HP[kind]));
    row.handGDD_median = +K.median(hg).toFixed(1);
    row.handNow_median = +K.median(hn).toFixed(1);
    row.handNow_minmax = [+Math.min(...hn).toFixed(1), +Math.max(...hn).toFixed(1)];
    row.swingsNowBase = Math.round(row.baseNow / C.HERO.interval) + 1; // first swing lands at t = 0
    r[kind] = row;
  }
  console.log('== ttk (s, single stunned dummy, hero standing in reach) ==');
  for (const k of kinds) console.log(k.padEnd(12), JSON.stringify(r[k]));
  console.log('hands sampled: 40 dealt hands (seeds 1–40)');
}

// ---------------------------------------------------------------------------------------------
// target readability over perfect-bot runs: switches, time without a target, swing uptime
if (want('target')) {
  const seeds = Number(o.seeds || 12);
  let forced = 0, ticksEnemies = 0, ticksTarget = 0, switches = 0, swings = 0, flips = 0, shortHolds = 0, holds = [], nearestNot = 0;
  let faceMoveOpp = 0, movingTicks = 0, quadFlips = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let last = null, holdStart = 0, lastQuad = null, lastQuadT = 0;
    BD.simRun({
      seed, tier: 0, maxSec: 240, onTick(app) {
        const w = app.world, h = w.hero;
        if (!w.enemies.some((e) => !e.dead && !e.down)) { last = null; return; }
        ticksEnemies++;
        if (h.targetId !== null) ticksTarget++;
        if (h.targetId !== last) {
          const prev = last !== null ? BD.W.enemyById(w, last) : null;
          const prevStillThere = prev && !prev.dead && !prev.down && BD.W.edgeDist(w, prev) <= h.stats.acquire;
          if (last !== null && h.targetId !== null && !prevStillThere) forced++;
          if (last !== null && h.targetId !== null && prevStillThere) {
            switches++;
            const held = (w.ticks - holdStart) / 60; holds.push(held); if (held < 0.6) shortHolds++;
          }
          last = h.targetId; holdStart = w.ticks;
        }
        if (h.moving) {
          movingTicks++;
          if (h.aimT > 0 && M.angDiff(h.face, Math.atan2(h.moveY, h.moveX)) > Math.PI * 0.6) faceMoveOpp++;
        }
        // sprite quadrant (screen-space): how often does the body flip?
        const sx = (Math.cos(h.face) - Math.sin(h.face)) * 40, sy = (Math.cos(h.face) + Math.sin(h.face)) * 20;
        const q = Math.abs(sx) > Math.abs(sy) * 2 ? (sx > 0 ? 'R' : 'L') : (sy > 0 ? 'F' : 'B');
        if (q !== lastQuad) { if (lastQuad && (w.ticks - lastQuadT) < 18) quadFlips++; lastQuad = q; lastQuadT = w.ticks; }
      },
    }).app.world.bus.recent(1e6).forEach((e) => { if (e.type === 'swing') swings++; });
  }
  // scripted, pilot-independent: back away from a slow chaser (ghoul) in a straight line for 6 s.
  // The hero should look like he is doing one thing; count how often the drawn body flips.
  const kite = (() => {
    const { H, w } = K.arena({ BD, w: 40, h: 12, hx: 30, hy: 6 });
    const h = w.hero;
    const e = K.spawn(BD, w, 'ghoul', h.x + 1.5, h.y); e.hp = e.maxHp = 1e6;
    let flips = 0, lastQ = null, faceJumps = 0, lastFace = h.face, aimTicks = 0;
    for (let i = 0; i < 360; i++) {
      h.invuln = 1;
      // step away only when the chaser is close, like a player keeping the edge of reach
      const near = BD.W.edgeDist(w, e) < 1.5;
      H.input({ mx: near ? -1 : 0, my: 0 }); H.step(1);
      const sx = (Math.cos(h.face) - Math.sin(h.face)) * 40, sy = (Math.cos(h.face) + Math.sin(h.face)) * 20;
      const q = sx >= 0 ? 'R' : 'L';
      if (lastQ && q !== lastQ) flips++; lastQ = q;
      if (M.angDiff(h.face, lastFace) > Math.PI / 2) faceJumps++; lastFace = h.face;
      if (M.angDiff(h.face, Math.atan2(e.y - h.y, e.x - h.x)) < 0.25) aimTicks++;
    }
    return { seconds: 6, leftRightFlips: flips, facingJumpsOver90deg: faceJumps, shareFacingTarget: +(aimTicks / 360).toFixed(2) };
  })();
  const sec = ticksEnemies / 60;
  out.target = {
    seeds, secondsWithEnemies: +sec.toFixed(0), targetShare: +(ticksTarget / ticksEnemies).toFixed(2),
    voluntarySwitchesPerMin: +(switches / sec * 60).toFixed(1), forcedSwitchesPerMin: +(forced / sec * 60).toFixed(1), medianHoldSec: +K.median(holds).toFixed(2), holdsUnder0_6s_share: +(shortHolds / Math.max(1, switches)).toFixed(2),
    kiteGhoul: kite, backpedalShareOfMoving: +(faceMoveOpp / Math.max(1, movingTicks)).toFixed(2), spriteFlipsUnder0_3sPerMin: +(quadFlips / sec * 60).toFixed(1),
  };
  console.log('== target (perfect bot, first 240 s of each run) ==\n' + JSON.stringify(out.target, null, 1));
}

if (o.json) console.log('JSON ' + JSON.stringify(out));
