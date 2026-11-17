#!/usr/bin/env node
// Acceptance criteria of GDD §13.2 as GDD-V2 §10.4 keeps and replaces them. Prints one line per criterion:
// (v2: #4 checks the v2 generator (V6); #6 runs at 3F level 10 plus each levelled card at level 5
// (V8); #7 is the proof-slice gate of GDD-V2 §11.1 (tools/fun/measure.js, seeds 1–20); #10 holds the
// world under the growth choice; #12 is V3 + V7 + V11; #16 is V4; #17 is V12, a tuning target.)
//   PASS | FAIL | PENDING (depends on content not registered yet) | TARGET (tuning goal, informational)
// Usage: node tools/accept.js [--only 1,3,7] [--skip-browser]
// Exit code 1 if any criterion FAILs.
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('./load');
const { build, FORBIDDEN } = require('../build');
const L = require('./layers');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',').map(Number) : null;
const skipBrowser = argv.includes('--skip-browser');
const BD = load();
const results = [];
const DIST = path.join(L.ROOT, 'dist/before-dawn.html');

// What the GDD expects to exist once all content lands.
const GDD_CARDS = ['pierce', 'whirl', 'sword_wave', 'flame', 'lightning', 'tide', 'leech', 'riposte', 'drawcut', 'holy_light', 'armor_break', 'mana_backlash', 'rest_of_dead', 'kings_hunt', 'fire_pilgrimage', 'chain_slash', 'flawless', 'one_flash'];
const GDD_ENEMIES = ['slime', 'goblin', 'skel_archer', 'ghoul', 'mage', 'dark_knight', 'demon_king'];
const missing = (ids, reg) => ids.filter((id) => !reg.has(id));

function report(n, status, text) {
  results.push({ n, status });
  console.log(`#${String(n).padEnd(2)} ${status.padEnd(7)} ${text}`);
}
const want = (n) => !only || only.includes(n);

function nanFree(o) {
  let ok = true;
  JSON.stringify(o, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) ok = false; return v; });
  return ok;
}

function botRuns(seeds, extra) {
  return seeds.map((seed) => {
    let maxE = 0, maxP = 0, maxPart = 0;
    const r = BD.simRun(Object.assign({ seed, tier: 0, onTick(app) {
      const w = app.world;
      let e = 0; for (const x of w.enemies) if (!x.dead) e++;
      maxE = Math.max(maxE, e); maxP = Math.max(maxP, w.projectiles.length); maxPart = Math.max(maxPart, w.particleCount || 0);
      if (extra && extra.onTick) extra.onTick(app);
    } }, extra && extra.opts));
    r.maxE = maxE; r.maxP = maxP; r.maxPart = maxPart;
    return r;
  });
}

async function main() {
  // 1
  if (want(1) || want(2) || want(13) || want(14)) {
    try {
      build();
      const html = fs.readFileSync(DIST, 'utf8');
      const bad = FORBIDDEN.filter((f) => html.includes(f));
      const files = fs.readdirSync(path.join(L.ROOT, 'dist')).filter((f) => f.endsWith('.html'));
      if (want(1)) report(1, bad.length || files.length !== 1 ? 'FAIL' : 'PASS', `dist/before-dawn.html ${(html.length / 1024).toFixed(0)} KB${bad.length ? ', contains ' + bad.join(' ') : ', no forbidden strings'}`);
    } catch (err) { report(1, 'FAIL', 'build threw: ' + err.message); }
  }

  let browser = null;
  const browserNeeded = !skipBrowser && (want(2) || want(13) || want(14));
  if (browserNeeded) {
    try { browser = await require('playwright').chromium.launch(); } catch (err) { console.log('   (playwright unavailable: ' + err.message + ')'); }
  }
  const fileUrl = 'file://' + DIST;

  async function page(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
    const p = await ctx.newPage();
    const errors = [], requests = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('request', (r) => { if (r.url() !== p.url() && !r.url().startsWith(fileUrl)) requests.push(r.url().slice(0, 80)); });
    return { p, ctx, errors, requests };
  }
  let maxParticles = 0;
  async function waitMode(p, mode, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await p.evaluate(() => window.__BD && (({ mode, particles }) => ({ mode, particles }))(window.__BD.state()));
      const m = s && s.mode;
      if (s && s.particles) maxParticles = Math.max(maxParticles, s.particles);
      if (m === mode) return true;
      await p.waitForTimeout(250);
    }
    return false;
  }

  // 2
  if (want(2)) {
    if (!browser) report(2, skipBrowser ? 'SKIP' : 'FAIL', 'headless browser not run');
    else {
      const { p, ctx, errors, requests } = await page();
      await p.goto(fileUrl + '?seed=7&bot=1&speed=64&mute=1&nosave=1');
      await p.waitForTimeout(500);
      const m0 = await p.evaluate(() => window.__BD.state().mode);
      await p.keyboard.press('Enter');
      const done = await waitMode(p, 'result', 240000);
      const st = await p.evaluate(() => { const r = window.__BD.app.lastResult; return r && { result: r.result, floor: r.floor, clock: r.clock }; });
      const ok = m0 === 'title' && done && !errors.length && !requests.length;
      report(2, ok ? 'PASS' : 'FAIL', `title → bot run → result (${st ? st.result + ' ' + st.floor + 'F ' + st.clock : 'not reached'}), console errors ${errors.length}, network requests ${requests.length}${errors.length ? ': ' + errors[0] : ''}${requests.length ? ': ' + requests[0] : ''}`);
      await ctx.close();
    }
  }

  // 3
  if (want(3)) {
    const a = BD.simRun({ seed: 42, tier: 0, bot: true, hashAt: [60] });
    const b = BD.simRun({ seed: 42, tier: 0, bot: true, hashAt: [60] });
    const strip = (r) => JSON.stringify({ result: r.result, floor: r.floor, sec: r.sec, kills: r.kills, cards: r.cards, events: r.events });
    const ok = a.hashes['60'] && a.hashes['60'] === b.hashes['60'] && strip(a) === strip(b);
    report(3, ok ? 'PASS' : 'FAIL', `seed 42 twice: hash@60s ${a.hashes['60']} / ${b.hashes['60']}, summary ${strip(a) === strip(b) ? 'equal' : 'differs'}`);
  }

  // 4 (GDD-V2 V6): the v2 generator over 200 seeds — §5.8 1–5 on every floor, 1F beast, the other
  // types on 2F–5F, neighbours differ, every 2F–5F task of the registered ones (the slice: purge)
  if (want(4)) {
    const bad = [];
    for (let s = 1; s <= 200; s++) {
      const run = BD.gen.run(s, 0);
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n];
        const why = BD.gen.checkV2(BD.Grid.fromString(f.w, f.h, f.cells), f.layout);
        if (why) bad.push(`seed ${s} ${n}F: ${why}`);
        if (f.w !== 48 || f.h !== 48) bad.push(`seed ${s} ${n}F: ${f.w}x${f.h}`);
      }
      const o = run.domOrder;
      if (o[0] !== 'beast') bad.push(`seed ${s}: 1F is ${o[0]}`);
      if (!['undead', 'magic', 'heavy'].every((t) => o.slice(1).includes(t))) bad.push(`seed ${s}: a type missing on 2F–5F`);
      if (o.some((t, i) => i && o[i - 1] === t)) bad.push(`seed ${s}: neighbours share a type`);
      const others = BD.tasks.ids().filter((t) => t !== 'purge');
      if (others.length >= 4 && new Set(run.tasks.slice(1)).size !== 4) bad.push(`seed ${s}: 2F–5F tasks repeat`);
    }
    if (bad.length) report(4, 'FAIL', `${bad.length} problems, first: ${bad[0]}`);
    else report(4, 'PASS', `200 seeds (GDD-V2 V6): 48×48 floors, §5.8 1–5, 1F beast, every type on 2F–5F, neighbours differ; tasks registered: ${BD.tasks.ids().join(',')}`);
  }

  // 5
  if (want(5)) {
    const miss = missing(GDD_CARDS, BD.cards);
    let bad = [];
    for (let s = 1; s <= 500; s++) {
      const h = BD.cardRt.dealHand(s, BD.progress.fresh().unlocked, 0);
      const fams = h.map((id) => BD.cards.get(id).family);
      if (new Set(h).size !== h.length) bad.push(`seed ${s}: duplicate`);
      if (fams.filter((f) => f === 'quest' || f === 'combo').length > 1) bad.push(`seed ${s}: two conditional`);
      if (!fams.some((f) => f === 'shape' || f === 'element')) bad.push(`seed ${s}: no shape/element`);
      if (!miss.length && h.length !== 3) bad.push(`seed ${s}: ${h.length} cards`);
    }
    if (bad.length) report(5, 'FAIL', `${bad.length} bad hands, first: ${bad[0]}`);
    else if (miss.length) report(5, 'PENDING', `rules hold for 500 seeds over the registered pool, but ${miss.length}/18 cards missing (hands have < 3 cards)`);
    else report(5, 'PASS', '500 seeds: 3 distinct, ≤ 1 conditional, ≥ 1 shape/element');
  }

  // 6
  if (want(6)) {
    const miss = missing(GDD_CARDS, BD.cards);
    if (miss.length) report(6, 'PENDING', `needs all 18 cards (${miss.length} missing: ${miss.slice(0, 5).join(',')}…)`);
    else {
      let n = 0, bad = [];
      const ids = GDD_CARDS;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
        n++;
        try {
          const st = BD.dump(BD.simRun({ seed: n, hand: [ids[i], ids[j], ids[k]], floor: 3, level: 10, maxSec: 20 }).app);
          if (!nanFree(st)) bad.push(`${ids[i]},${ids[j]},${ids[k]}: NaN`);
        } catch (err) { bad.push(`${ids[i]},${ids[j]},${ids[k]}: ${err.message}`); }
      }
      // V8 part 2: every card with levels at level 5 on 2F
      const levelled = ids.filter((id) => BD.cards.get(id).levels);
      for (const id of levelled) {
        try {
          const r = BD.simRun({ seed: 77, hand: [id], floor: 2, maxSec: 0.02 });
          const app = r.app, w = app.world, c = BD.cardRt.get(w, id);
          while (c.level < 5) BD.cardRt.levelUp(w, c);
          app.botOn = true; let k = 0;
          while (app.mode === 'play' && w.t < 20 && k++ < 5000) app.step();
          if (!nanFree(BD.dump(app))) bad.push(id + ' at level 5: NaN');
        } catch (err) { bad.push(id + ' at level 5: ' + err.message); }
      }
      report(6, bad.length ? 'FAIL' : 'PASS', `${n} combinations × 20 s on 3F at level 10, and ${levelled.length} levelled cards at level 5 on 2F (GDD-V2 V8)${bad.length ? ', ' + bad.length + ' failed, first: ' + bad[0] : ', no exceptions, no NaN'}`);
    }
  }

  // 7, 11, 12 share 20 bot runs
  let runs20 = null;
  const comboBad = [];
  let timerChecks = 0;
  if (want(7) || want(11) || want(12)) {
    const allowed = { chain_slash: ['timeout', 'swap'], flawless: ['hurt', 'swap'], one_flash: ['too_close', 'swap'] };
    const seen = new Set();
    var v3 = { screen: 0, shards: 0, tgs: 0, shots: 0 }, unseen = 0, choiceBad = [], choices = 0;
    runs20 = botRuns(Array.from({ length: 20 }, (_, i) => i + 1), {
      onTick(app) {
        const w = app.world;
        let sc = 0; for (const x of w.enemies) if (!x.dead && BD.view.inView(w, x.x, x.y)) sc++;
        v3.screen = Math.max(v3.screen, sc); v3.shards = Math.max(v3.shards, w.shards.length); v3.tgs = Math.max(v3.tgs, w.telegraphs.length);
        v3.shots = Math.max(v3.shots, w.projectiles.filter((p) => p.hostile).length);
        if (w.over || app.mode !== 'play') unseen = Math.max(unseen, w.stats.unseenHits);
        if (!seen.has(w)) {
          seen.add(w);
          // V11: three different options, never a card at level 5 or a boon at rank 3
          w.bus.on('choice_open', (ev) => {
            choices++;
            if (ev.options.length !== 3) choiceBad.push(ev.options.length + ' options');
            for (const o of w.choice.options) {
              if (o.kind === 'card' && o.from >= 5) choiceBad.push('card at level 5: ' + o.id);
              if (o.kind === 'boon' && o.from >= BD.boons.get(o.id).max) choiceBad.push('boon at max: ' + o.id);
            }
            const real = ev.options.filter((x) => x !== 'breath');
            if (new Set(real).size !== real.length) choiceBad.push('repeated option ' + ev.options.join(','));
          });
          w.bus.on('hurt', () => { unseen = Math.max(unseen, w.stats.unseenHits); });
          w.bus.on('combo_change', (ev) => {
            if (ev.to < ev.from && (!allowed[ev.cardId] || !allowed[ev.cardId].includes(ev.reason))) comboBad.push(`${ev.cardId} ${ev.reason}`);
            if (ev.to > ev.from && ev.reason !== 'gain') comboBad.push(`${ev.cardId} rose with ${ev.reason}`);
          });
          let before = null;
          w.bus.on('tick', (ev) => {
            const c = BD.cardRt.get(w, 'chain_slash');
            if (c && ev.enemiesAlive === 0 && before !== null) { timerChecks++; if (c.state.timer < before - 1e-9) comboBad.push('chain_slash timer fell with no enemies'); }
            before = c ? c.state.timer : null;
          });
        }
      },
    });
  }
  // 7 (GDD-V2 §11.1, replaces §13.2-7): the proof-slice gate, tools/fun/measure.js over seeds 1–20 with the
  // human-like pilot — kills/min ≥ 100, on screen ≥ 12, < 3 on screen ≤ 15 %, swings to kill ≤ 2.0, 2+ hit
  // swings ≥ 50 %, choice gap ≤ 40 s, first choice ≤ 25 s, hits/min ≤ 5, ≥ 10 of 20 runs reach 3F
  if (want(7)) {
    const F = require('./fun/lib');
    const q = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const rs = []; for (let sd = 1; sd <= 20; sd++) rs.push(F.runNode(BD, { seed: sd, altar: 'mixed' }));
    const m = {
      kpm: q(rs.map((r) => r.total.killsPerMin)), screen: q(rs.map((r) => r.total.onScreenMean)), sparse: q(rs.map((r) => r.total.sparsePct)),
      stk: q(rs.map((r) => r.swingsToKillAll)), multi: q(rs.map((r) => r.total.multiSwingPct)), gap: q(rs.map((r) => r.choiceGap.median)),
      first: q(rs.map((r) => (r.first.choice === undefined ? r.sec : r.first.choice))), hurts: q(rs.map((r) => r.total.hurtsPerMin)), reach3: rs.filter((r) => r.floor >= 3).length,
    };
    const ok = m.kpm >= 100 && m.screen >= 12 && m.sparse <= 15 && m.stk <= 2 && m.multi >= 50 && m.gap <= 40 && m.first <= 25 && m.hurts <= 5 && m.reach3 >= 10;
    report(7, ok ? 'PASS' : 'FAIL', `slice gate (GDD-V2 §11.1, 20 runs): kills/min ${m.kpm}, on screen ${m.screen}, sparse ${m.sparse} %, swings ${m.stk}, 2+ hits ${m.multi} %, choice gap ${m.gap} s, first ${m.first} s, hits/min ${m.hurts}, ${m.reach3}/20 reach 3F`);
  }
  if (want(11)) {
    const missC = missing(['chain_slash', 'flawless', 'one_flash'], BD.cards);
    if (comboBad.length) report(11, 'FAIL', `${comboBad.length} violations, first: ${comboBad[0]}`);
    else if (missC.length) report(11, 'PENDING', `chain_slash: reset reasons ok, ${timerChecks} empty-room ticks without timer loss; ${missC.join(', ')} not registered`);
    else report(11, 'PASS', `combo resets use only allowed reasons; ${timerChecks} empty-room ticks checked`);
  }
  // 12 (GDD-V2 V3, V7, V11; replaces §13.2-12): caps over the 20 bot runs and a stress, no hit from an
  // attack that began off the combat window, valid growth choices
  if (want(12)) {
    const maxE = Math.max(...runs20.map((r) => r.maxE)), maxP = Math.max(...runs20.map((r) => r.maxP));
    // stress: ask for 150 enemies and 100 hostile shots at once
    const H = BD.harness();
    H.start({ seed: 3 });
    const w = H.world();
    w.wave.n = 3;
    for (let i = 0; i < 150; i++) BD.W.spawnAt(w, 'goblin', 30 + (i % 8), 30 + (i % 8), { warn: 0.1 });
    for (let i = 0; i < 100; i++) BD.hazards.projectile(w, { x: 36, y: 36, dir: i, speed: 1, range: 50, dmg: 1, ownerKind: 'goblin', attack: 'stab' });
    let sE = 0, sP = 0;
    for (let i = 0; i < 120; i++) { H.step(1); sE = Math.max(sE, w.enemies.filter((e) => !e.dead).length); sP = Math.max(sP, w.projectiles.filter((p) => p.hostile).length); }
    const C = BD.C.CAP;
    const capsOk = maxE <= C.enemies && v3.screen <= C.onScreen && v3.shots <= C.projectiles && v3.shards <= C.shards && v3.tgs <= C.telegraphs && sE <= C.enemies && sP <= C.projectiles && maxParticles <= C.particles;
    const ok = capsOk && unseen === 0 && !choiceBad.length && choices > 100;
    report(12, ok ? 'PASS' : 'FAIL', `V3 bot runs max enemies ${maxE} (≤ ${C.enemies}), in view ${v3.screen} (≤ ${C.onScreen}), hostile shots ${v3.shots}, shards ${v3.shards}, warnings ${v3.tgs}; stress max ${sE} / ${sP}, queued ${w.queue.length}; particles (browser, #2) ${maxParticles} · V7 hits from off-screen attacks ${unseen} · V11 ${choices} choices${choiceBad.length ? ', bad: ' + choiceBad[0] : ', all valid'}`);
  }

  // 8
  if (want(8)) {
    const H = BD.harness();
    H.start({ seed: 1 });
    let clock450 = null;
    const w = H.world();
    while (H.app.mode === 'play' && w.t < 1200) {
      H.step(1);
      if (Math.abs(w.t - 450) < 1e-6) clock450 = BD.flow.clockStr(w);
    }
    // (enemies agent) An idle hero dies to the 1F archers and mage (they keep 4–7u, it never
    // reaches them) long before 450 s, so the clock is then read on the same idle seed with enemy
    // hits kept off (invuln each tick; the dawn drain ignores it) — docs/requests/enemies.md.
    if (clock450 === null) {
      const H2 = BD.harness();
      H2.start({ seed: 1 });
      const w2 = H2.world();
      while (H2.app.mode === 'play' && w2.t < 1200) {
        w2.hero.invuln = 1;
        H2.step(1);
        if (Math.abs(w2.t - 450) < 1e-6) clock450 = BD.flow.clockStr(w2);
      }
      const r2 = H2.app.lastResult;
      if (!r2 || r2.result !== 'death' || r2.sec >= 1200) clock450 = 'no dawn death (' + (r2 ? r2.result + ' ' + r2.sec : 'none') + ')';
    }
    const r = H.app.lastResult;
    const ok = r && r.result === 'death' && r.sec < 1200 && clock450 === '00:00';
    report(8, ok ? 'PASS' : 'FAIL', `idle seed 1: ${r ? r.result + ' at ' + r.sec + 's (' + r.causeText + ')' : 'no result'}, clock at 450 s = ${clock450}`);
  }

  // 9
  if (want(9)) {
    const H = BD.harness();
    H.start({ seed: 2 });
    const w = H.world();
    H.killAll(); w.wave.n = 3;
    const gk = w.floor.spawns.guardian;
    const g = BD.W.makeEnemy(w, gk, 2.5, w.grid.h - 2.5, { guardian: true });
    g.stunT = 1e9;
    w.hero.x = w.stairs.ringX; w.hero.y = w.stairs.ringY;
    H.input({ mx: 0, my: 0 });
    const f0 = w.floorN;
    H.step(300);
    const sealedOk = w.floorN === f0 && !w.bus.counts().floor_exit;
    BD.combat.kill(w, g);
    let ticks = 0;
    while (!w.bus.counts().floor_exit && ticks < 200) { H.step(1); ticks++; }
    let t2 = ticks;
    while (w.floorN === f0 && t2 < 400) { H.step(1); t2++; }
    const ok = sealedOk && Math.abs(ticks - 60) <= 1;
    report(9, ok ? 'PASS' : 'FAIL', `5 s on the ring with the guardian alive: floor ${sealedOk ? 'unchanged' : 'CHANGED'}; after the kill floor_exit at ${(ticks / 60).toFixed(2)} s, new floor at ${(t2 / 60).toFixed(2)} s (incl. 0.6 s blackout)`);
  }

  // 10
  if (want(10)) {
    const H = BD.harness();
    H.start({ seed: 4 });
    H.step(120);
    H.app.pause();
    const h1 = H.hash(); H.step(600); const h2 = H.hash();
    H.app.resume();
    // v2: the growth choice holds the world like the altar did (GDD-V2 §4.3, §10.4 V9)
    const w = H.world();
    BD.growth.addXp(w, w.hero.xpNeed - w.hero.xp);
    let k = 0;
    while (H.state().overlay !== 'choice' && k < 200) { H.step(1); k++; }
    const a1 = H.hash(); H.step(600); const a2 = H.hash();
    const ok = h1 === h2 && a1 === a2 && H.state().overlay === 'choice';
    report(10, ok ? 'PASS' : 'FAIL', `pause: ${h1 === h2 ? 'hash unchanged' : 'hash changed'} over 600 ticks; growth choice (open after ${k} tick): ${a1 === a2 ? 'hash unchanged' : 'hash changed'} over 600 ticks`);
  }

  // 13
  if (want(13)) {
    // Node: memory storage
    const P = BD.progress;
    const mem = P.memoryStorage();
    const app = BD.createApp({ storage: mem, params: {} });
    app.botOn = true;
    app.startRun({ seed: 9, floor: 6 });
    let guard = 0;
    while (app.mode === 'play' && guard++ < 200000) app.step();
    const raw = mem.getItem(P.KEY);
    const o = raw ? JSON.parse(raw) : null;
    const keysOk = o && o.v === 1 && JSON.stringify(Object.keys(o).sort()) === JSON.stringify(P.FIELDS.slice().sort());
    // Node: storage that throws
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const app2 = BD.createApp({ storage: boom, params: {} });
    app2.botOn = true; app2.startRun({ seed: 9, floor: 6 });
    guard = 0;
    while (app2.mode === 'play' && guard++ < 200000) app2.step();
    let browserNote = 'browser not run';
    let browserOk = true;
    if (browser) {
      const a = await page();
      await a.p.goto(fileUrl + '?seed=9&floor=6&bot=1&speed=64&mute=1');
      await a.p.waitForTimeout(300); await a.p.keyboard.press('Enter');
      const done = await waitMode(a.p, 'result', 120000);
      const saved = await a.p.evaluate(() => { try { return JSON.parse(localStorage.getItem('before-dawn.save.v1')); } catch (e) { return null; } });
      const b = await page();
      await b.p.addInitScript(() => {
        const thrower = () => { throw new Error('storage denied'); };
        Object.defineProperty(window, 'localStorage', { get: thrower, configurable: true });
      });
      await b.p.goto(fileUrl + '?seed=9&floor=6&bot=1&speed=64&mute=1');
      await b.p.waitForTimeout(300); await b.p.keyboard.press('Enter');
      const done2 = await waitMode(b.p, 'result', 120000);
      browserOk = done && saved && saved.v === 1 && done2 && !a.errors.length && !b.errors.length;
      browserNote = `browser: saved v=${saved && saved.v} runs=${saved && saved.runs}, throwing localStorage → ${done2 ? 'result reached' : 'STUCK'}${b.errors.length ? ' errors: ' + b.errors[0] : ''}`;
      await a.ctx.close(); await b.ctx.close();
    }
    const ok = keysOk && app2.mode === 'result' && browserOk;
    report(13, ok ? 'PASS' : 'FAIL', `node: key written, v=1, fields ${keysOk ? '= §11' : 'DIFFER'}; throwing storage → ${app2.mode}; ${browserNote}`);
  }

  // 14
  if (want(14)) {
    if (!browser) report(14, skipBrowser ? 'SKIP' : 'FAIL', 'headless browser not run');
    else {
      const { p, ctx, errors } = await page({ hasTouch: true });
      await p.goto(fileUrl + '?seed=5&mute=1&nosave=1');
      await p.waitForTimeout(400);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(200);
      const touch = (type, x, y) => p.evaluate(([type, x, y]) => {
        const c = document.getElementById('bd');
        c.dispatchEvent(new PointerEvent(type, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      }, [type, x, y]);
      const s0 = await p.evaluate(() => window.__BD.state().hero);
      await touch('pointerdown', 640, 400);
      for (let i = 1; i <= 6; i++) { await touch('pointermove', 640 - i * 10, 400 - i * 6); await p.waitForTimeout(30); }
      await p.waitForTimeout(500);
      const s1 = await p.evaluate(() => window.__BD.state().hero);
      const moved = Math.hypot(s1.x - s0.x, s1.y - s0.y);
      await touch('pointerup', 580, 364);
      await p.waitForTimeout(80);
      await touch('pointerdown', 600, 380);
      await p.waitForTimeout(150);
      await touch('pointerup', 600, 380);
      const dashes = await p.evaluate(() => window.__BD.events(400).filter((e) => e.event === 'dash').length);
      await p.setViewportSize({ width: 720, height: 1280 });
      await p.waitForTimeout(200);
      const r0 = await p.evaluate(() => window.__BD.state());
      await p.waitForTimeout(1000);
      const r1 = await p.evaluate(() => window.__BD.state());
      const ok = moved > 0.5 && dashes >= 1 && r0.overlay === 'rotate' && r1.t === r0.t && !errors.length;
      report(14, ok ? 'PASS' : 'FAIL', `touch drag moved hero ${moved.toFixed(2)}u, double tap → ${dashes} dash event(s), portrait overlay=${r0.overlay}, t ${r0.t} → ${r1.t}${errors.length ? ', error: ' + errors[0] : ''}`);
      await ctx.close();
    }
  }

  // 15
  if (want(15)) {
    const need = missing(['dark_knight', 'ghoul'], BD.enemies).concat(missing(['armor_break', 'holy_light', 'flame', 'rest_of_dead'], BD.cards));
    if (need.length) report(15, 'PENDING', `scenarios need ${need.join(', ')}`);
    else {
      const S = require('./scenarios');
      const out = S.run(BD);
      report(15, out.every((x) => x.ok) ? 'PASS' : 'FAIL', out.map((x) => `${x.name}: ${x.ok ? 'ok' : 'FAIL ' + x.why}`).join(' / '));
    }
  }

  // 16
  if (want(16)) {
    const H = BD.harness();
    H.start({ seed: 6, floor: 2 });
    const w = H.world();
    H.killAll(); w.wave.n = 3; w.freezeT = 0;
    const kinds = BD.enemies.all().filter((d) => d.type !== 'boss').map((d) => d.id);
    let i = 0;
    while (w.enemies.length < BD.C.CAP.enemies) {
      const x = 1.5 + (i * 7) % (w.grid.w - 3), y = 1.5 + Math.floor(i / 3) % (w.grid.h - 3);
      BD.W.makeEnemy(w, kinds[i % kinds.length], x, y, {}); i++;
    }
    const refill = () => { while (w.projectiles.length < 60) BD.hazards.projectile(w, { x: w.grid.w / 2, y: w.grid.h / 2, dir: w.projectiles.length * 0.7, speed: 0.5, range: 99, dmg: 1, ownerKind: kinds[0], attack: Object.keys(BD.enemies.get(kinds[0]).attacks)[0] }); };
    w.hero.hp = 1e9; w.hero.maxHp = 1e9;
    const shards = () => { while (w.shards.length < BD.C.CAP.shards) BD.growth.drop(w, 1.5 + (w.shards.length * 3) % (w.grid.w - 3), 1.5 + Math.floor(w.shards.length / 15) * 2.5 % (w.grid.h - 3), 1); };
    for (let k = 0; k < 60; k++) { refill(); shards(); BD.tick(w); }
    let total = 0, n = 0;
    for (let k = 0; k < 600; k++) {
      refill(); shards();
      while (w.enemies.filter((e) => !e.dead).length < BD.C.CAP.enemies) BD.W.makeEnemy(w, kinds[k % kinds.length], 1.5 + (k % 5), 1.5, {});
      const t0 = process.hrtime.bigint();
      BD.tick(w);
      total += Number(process.hrtime.bigint() - t0) / 1e6; n++;
    }
    const avg = total / n;
    report(16, avg < 4 ? 'PASS' : 'FAIL', `V4: ${BD.C.CAP.enemies} enemies + 60 projectiles + ${w.shards.length} shards on 48×48: ${avg.toFixed(3)} ms per logic tick (avg of ${n}; kinds ${kinds.length})`);
  }

  // 17 (GDD §13.2 as replaced by docs/CONTROLS-REVIEW.md §3.1): the human-like pilot of
  // tools/feel/human_bot.js over seeds 1–100 wins 8–28 and dies on 1F–2F at most 22 times; the
  // perfect pilot wins at least 60. A tuning target: TARGET (not FAIL) when it misses.
  const missAll = missing(GDD_ENEMIES, BD.enemies).concat(missing(GDD_CARDS, BD.cards));
  if (want(17)) {
    if (missAll.length) report(17, 'PENDING', `tuning target; needs full content (${missAll.length} ids missing)`);
    else {
      const { execFileSync } = require('child_process');
      const txt = execFileSync(process.execPath, [path.join(__dirname, 'feel', 'human_bot.js'), '--seeds', '1-100'], { encoding: 'utf8', maxBuffer: 64 << 20 });
      const pilot = (name) => {
        const b = txt.split('-- ' + name)[1] || '';
        const w = /wins (\d+)/.exec(b), d = /deaths by floor: (\{.*\})/.exec(b), m = /median win ([\d.]+) min/.exec(b);
        return { wins: w ? +w[1] : -1, by: d ? JSON.parse(d[1]) : {}, winMin: m ? +m[1] : null };
      };
      const h = pilot('human'), p = pilot('perfect'), early = (h.by['1F'] || 0) + (h.by['2F'] || 0);
      // GDD-V2 §9.2 / V12 (replaces §13.2-17 and docs/CONTROLS-REVIEW.md's 8–28): wins 20–35, ≤ 3 deaths on
      // 1F, ≤ 15 on 1F–2F, a winning run 12.5–15.5 min, the perfect pilot ≥ 70. A tuning target.
      const f1 = h.by['1F'] || 0;
      const ok = h.wins >= 20 && h.wins <= 35 && f1 <= 3 && early <= 15 && h.winMin >= 12.5 && h.winMin <= 15.5 && p.wins >= 70;
      report(17, ok ? 'PASS' : 'TARGET', `V12: human-like pilot ${h.wins}/100 wins (20–35), ${f1} deaths on 1F (≤ 3), ${early} on 1F–2F (≤ 15), median win ${h.winMin} min (12.5–15.5); perfect pilot ${p.wins}/100 wins (≥ 70)`);
    }
  }
  if (want(18)) report(18, 'PENDING', `tuning target; needs rest_of_dead, flawless and full content`);

  if (browser) await browser.close();
  const fails = results.filter((r) => r.status === 'FAIL').length;
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${c('PASS')} pass, ${fails} fail, ${c('PENDING')} pending${c('SKIP') ? ', ' + c('SKIP') + ' skipped' : ''}`);
  process.exit(fails ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
