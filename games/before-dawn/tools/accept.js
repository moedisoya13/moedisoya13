#!/usr/bin/env node
// Acceptance criteria of GDD §13.2. Prints one line per criterion:
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

  // 4
  if (want(4)) {
    let bad = [], reduced = 0;
    for (let s = 1; s <= 200; s++) {
      const run = BD.gen.run(s, 0);
      if (run.reduced) reduced++;
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n];
        const g = BD.Grid.fromString(f.w, f.h, f.cells);
        const why = BD.gen.check(g, f.layout);
        if (why) bad.push(`seed ${s} ${n}F: ${why}`);
      }
      const o = run.domOrder;
      if (!(o[0] === 'beast' || o[0] === 'undead')) bad.push(`seed ${s}: 1F is ${o[0]}`);
      if (!run.reduced) {
        if (!BD.C.TYPES.every((t) => o.includes(t))) bad.push(`seed ${s}: not every type dominant`);
        if (o.some((t, i) => i && o[i - 1] === t)) bad.push(`seed ${s}: neighbours share a type`);
      }
    }
    const types = BD.gen.bundles.ids();
    if (bad.length) report(4, 'FAIL', `${bad.length} problems, first: ${bad[0]}`);
    else if (reduced) report(4, 'PENDING', `§7.6-1..3 and 1F rule pass for 200 seeds × 5 floors; §7.6-4 / §7.5 ②③ need all four type bundles (registered: ${types.join(',')})`);
    else report(4, 'PASS', '200 seeds: §7.6 1–4 and §7.5 order rules hold');
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
          const st = BD.dump(BD.simRun({ seed: n, hand: [ids[i], ids[j], ids[k]], floor: 2, maxSec: 20 }).app);
          if (!nanFree(st)) bad.push(`${ids[i]},${ids[j]},${ids[k]}: NaN`);
        } catch (err) { bad.push(`${ids[i]},${ids[j]},${ids[k]}: ${err.message}`); }
      }
      report(6, bad.length ? 'FAIL' : 'PASS', `${n} combinations × 20 s on 2F${bad.length ? ', ' + bad.length + ' failed, first: ' + bad[0] : ', no exceptions, no NaN'}`);
    }
  }

  // 7, 11, 12 share 20 bot runs
  let runs20 = null;
  const comboBad = [];
  let timerChecks = 0;
  if (want(7) || want(11) || want(12)) {
    const allowed = { chain_slash: ['timeout', 'swap'], flawless: ['hurt', 'swap'], one_flash: ['too_close', 'swap'] };
    const seen = new Set();
    runs20 = botRuns(Array.from({ length: 20 }, (_, i) => i + 1), {
      onTick(app) {
        const w = app.world;
        if (!seen.has(w)) {
          seen.add(w);
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
  if (want(7)) {
    const reached = runs20.filter((r) => r.floor >= 2).length;
    const kinds = BD.enemies.ids();
    report(7, reached >= 15 ? 'PASS' : 'FAIL', `${reached}/20 bot runs reached 2F (wins ${runs20.filter((r) => r.result === 'win').length}; enemy kinds registered: ${kinds.join(',')} — recheck when content lands)`);
  }
  if (want(11)) {
    const missC = missing(['chain_slash', 'flawless', 'one_flash'], BD.cards);
    if (comboBad.length) report(11, 'FAIL', `${comboBad.length} violations, first: ${comboBad[0]}`);
    else if (missC.length) report(11, 'PENDING', `chain_slash: reset reasons ok, ${timerChecks} empty-room ticks without timer loss; ${missC.join(', ')} not registered`);
    else report(11, 'PASS', `combo resets use only allowed reasons; ${timerChecks} empty-room ticks checked`);
  }
  if (want(12)) {
    const maxE = Math.max(...runs20.map((r) => r.maxE)), maxP = Math.max(...runs20.map((r) => r.maxP));
    // stress: ask for 150 enemies and 100 projectiles at once
    const H = BD.harness();
    H.start({ seed: 3 });
    const w = H.world();
    w.wave.n = 3;
    for (let i = 0; i < 150; i++) BD.W.spawnAt(w, 'goblin', 2 + (i % 8), 2 + (i % 8), { warn: 0.1 });
    for (let i = 0; i < 100; i++) BD.hazards.projectile(w, { x: 6, y: 6, dir: i, speed: 1, range: 50, dmg: 1, ownerKind: 'goblin', attack: 'stab' });
    let sE = 0, sP = 0;
    for (let i = 0; i < 120; i++) { H.step(1); sE = Math.max(sE, w.enemies.filter((e) => !e.dead).length); sP = Math.max(sP, w.projectiles.length); }
    const ok = maxE <= 80 && maxP <= 60 && sE <= 80 && sP <= 60 && maxParticles <= 300;
    report(12, ok ? 'PASS' : 'FAIL', `bot runs max enemies ${maxE}, projectiles ${maxP}; stress (150 spawns, 100 shots) max ${sE} / ${sP}, queued ${w.queue.length}; particles (browser, sampled during #2) max ${maxParticles}`);
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
    const w = H.world();
    H.killAll(); w.wave.n = 3;
    const g = BD.W.makeEnemy(w, w.floor.spawns.guardian, 2.5, 2.5, { guardian: true });
    BD.combat.kill(w, g);
    H.killAll();
    w.hero.x = w.altar.x; w.hero.y = w.altar.y;
    H.input({ mx: 0, my: 0 });
    let k = 0;
    while (H.state().overlay !== 'altar' && k < 200) { H.step(1); k++; }
    const a1 = H.hash(); H.step(600); const a2 = H.hash();
    const ok = h1 === h2 && a1 === a2 && H.state().overlay === 'altar';
    report(10, ok ? 'PASS' : 'FAIL', `pause: ${h1 === h2 ? 'hash unchanged' : 'hash changed'} over 600 ticks; altar (opened after ${(k / 60).toFixed(2)} s): ${a1 === a2 ? 'hash unchanged' : 'hash changed'}`);
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
      const dashes = await p.evaluate(() => window.__BD.events(400).filter((e) => e.type === 'dash').length);
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
    while (w.enemies.length < 80) {
      const x = 1.5 + (i * 7) % (w.grid.w - 3), y = 1.5 + Math.floor(i / 3) % (w.grid.h - 3);
      BD.W.makeEnemy(w, kinds[i % kinds.length], x, y, {}); i++;
    }
    const refill = () => { while (w.projectiles.length < 60) BD.hazards.projectile(w, { x: w.grid.w / 2, y: w.grid.h / 2, dir: w.projectiles.length * 0.7, speed: 0.5, range: 99, dmg: 1, ownerKind: kinds[0], attack: Object.keys(BD.enemies.get(kinds[0]).attacks)[0] }); };
    w.hero.hp = 1e9; w.hero.maxHp = 1e9;
    for (let k = 0; k < 60; k++) { refill(); BD.tick(w); }
    let total = 0, n = 0;
    for (let k = 0; k < 600; k++) {
      refill();
      while (w.enemies.filter((e) => !e.dead).length < 80) BD.W.makeEnemy(w, kinds[k % kinds.length], 1.5 + (k % 5), 1.5, {});
      const t0 = process.hrtime.bigint();
      BD.tick(w);
      total += Number(process.hrtime.bigint() - t0) / 1e6; n++;
    }
    const avg = total / n;
    report(16, avg < 4 ? 'PASS' : 'FAIL', `80 enemies + 60 projectiles: ${avg.toFixed(3)} ms per logic tick (avg of ${n}; kinds ${kinds.join(',')})`);
  }

  // 17, 18
  const missAll = missing(GDD_ENEMIES, BD.enemies).concat(missing(GDD_CARDS, BD.cards));
  if (want(17)) report(17, 'PENDING', `tuning target; needs full content (${missAll.length} ids missing). ${runs20 ? 'Now: ' + runs20.filter((r) => r.result === 'win').length + '/20 wins, median floor ' + runs20.map((r) => r.floor).sort((a, b) => a - b)[10] : ''}`);
  if (want(18)) report(18, 'PENDING', `tuning target; needs rest_of_dead, flawless and full content`);

  if (browser) await browser.close();
  const fails = results.filter((r) => r.status === 'FAIL').length;
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${c('PASS')} pass, ${fails} fail, ${c('PENDING')} pending${c('SKIP') ? ', ' + c('SKIP') + ' skipped' : ''}`);
  process.exit(fails ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
