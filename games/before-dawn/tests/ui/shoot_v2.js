#!/usr/bin/env node
// Frames of the v2 UI for review (docs/screens/v2-ui/), at the three sizes the game ships for:
//   desktop 1280×720 · phone 667×375 (touch) · forced 375×667 portrait turned to landscape (touch)
//
//   node tests/ui/shoot_v2.js screens [--out DIR] [--sizes desktop,phone,forced]
//       every overlay and screen, staged: title, prep, the choice (level, chest), pause, result
//       (death, win), codex, help, settings; HUD moments (surge, level up, task done, guardian,
//       boss, low HP, a task on each kind); one play frame per floor colour (1F–5F, rooftop)
//   node tests/ui/shoot_v2.js pilot [--floor 1] [--sec 150] [--every 10] [--seed 21] [--sizes …]
//       the human-like pilot of tools/fun/lib.js at normal speed (choices read for 1.2 s), a frame
//       every --every s of game time; DIR/pilot-<size>-<floor>F/t####.jpg + a contact sheet
//   node tests/ui/shoot_v2.js sheet --dir DIR [--cols 3]    a contact sheet of the PNGs in DIR
// Uses the UI tests' stand-in build (tests/ui/fixtures/standins.js: the v2 boons, tasks and sites
// other branches add), so places and task kinds can be staged. Prints what it wrote.
'use strict';
const path = require('path');
const fs = require('fs');
const H = require('./_harness');
const L = require('../../tools/fun/lib');

const a = process.argv.slice(2), mode = a[0] || 'screens', o = {};
for (let i = 1; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const OUT = path.resolve(String(o.out || path.join(H.ROOT, 'docs/screens/v2-ui')));
const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, touch: false },
  phone: { viewport: { width: 667, height: 375 }, touch: true },
  forced: { viewport: { width: 375, height: 667 }, touch: true, forced: true },
};
const sizes = String(o.sizes || 'desktop,phone,forced').split(',');

async function open(size, query, init) {
  const S = SIZES[size];
  const T = await H.open(H.variant(), { query, init, context: { viewport: S.viewport, hasTouch: S.touch, deviceScaleFactor: 1 } });
  await T.eval((touch) => { window.BD.ui.S.lastInput = touch ? 'touch' : 'key'; }, S.touch);
  if (S.forced) await T.eval(() => { const ui = window.__BD.ui; ui.view.setForced('turn'); ui.app.setRotate(ui.view.portrait); if (ui.app.uiOverlay === 'tap') ui.app.closeOverlay(); });
  await T.wait(150);
  return T;
}
const shot = async (T, file) => { await T.page.screenshot({ path: file }); console.log(path.relative(H.ROOT, file)); };
const start = (T) => T.eval(() => { const B = window.__BD; if (B.app.uiOverlay) B.app.closeOverlay(); if (!B.app.world || B.app.mode !== 'play') B.ui.startRun(); B.app.save.settings.hints = false; });
// let the director fill the screen for a while (bot at ×2), then hold the world still
async function crowd(T, sec) {
  await T.eval(() => { window.__BD.app.botOn = true; window.__BD.params.speed = 2; });
  await T.wait(sec * 1000);
  await T.eval(() => { const B = window.__BD; B.app.botOn = false; B.params.speed = 1; B.ui.hold = 1e9; });
  await T.wait(120);
}
const SAVE = {
  v: 2, runs: 9, wins: 2, bestFloor: 6, bestWinSec: 842.4, bestLevel: 24, bestKills: 2410, tierUnlocked: 1, tierSelected: 0, tierWins: [2, 0, 0, 0], rerollUnlocked: true,
  unlocked: ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'riposte', 'holy_light', 'armor_break', 'rest_of_dead', 'kings_hunt', 'chain_slash', 'flawless', 'sword_wave'],
  counters: { kills: 3120, dodges: 41, mageKills: 30, magicKills: 640, questAwakened: 1, comboMaxed: 0 },
  codex: { pierce: { held: 4, wins: 1, best: 0, bestLevel: 5 }, whirl: { held: 3, wins: 1, best: 0, bestLevel: 4 }, flame: { held: 2, wins: 0, best: 0, bestLevel: 3 }, chain_slash: { held: 2, wins: 0, best: 8, bestLevel: 2 } },
  history: [
    { seed: 88123, tier: 0, result: 'death', cause: 'goblin:stab', floor: 4, sec: 512.3, cards: ['whirl', 'flame', 'leech'] },
    { seed: 4511, tier: 0, result: 'win', cause: '', floor: 6, sec: 842.4, cards: ['pierce', 'lightning', 'chain_slash'] },
  ],
  settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: false }, lastSeed: 88123,
};
const withSave = { fn: (s) => { try { localStorage.setItem('before-dawn.save.v2', s); } catch (e) { /* ignore */ } }, arg: JSON.stringify(SAVE) };

// a v2 build on the current floor: cards levelled, boons, a few kills, the gauge part full
const BUILD = () => {
  const BD = window.BD, w = window.__BD.world();
  const lv = [3, 2, 1];
  w.cards.forEach((c, i) => { if (!c) return; while ((c.level || 1) < Math.min(lv[i], BD.cardRt.maxLevel(c.def))) BD.cardRt.levelUp(w, c); });
  for (const id of ['edge', 'edge', 'quick', 'draw', 'long']) if (BD.boons.has(id) && (w.hero.boons[id] || 0) < BD.boons.get(id).max) BD.growth.giveBoon(w, id);
  w.hero.xp = Math.floor(w.hero.xpNeed * 0.72);
};

async function screens(size) {
  const dir = path.join(OUT, size);
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n + '.png');
  // title, prep, codex, help, settings
  let T = await open(size, '?mute=1&nosave=1', withSave);
  try {
    await T.eval(() => { const B = window.__BD; if (B.app.uiOverlay) B.app.closeOverlay(); });
    await T.wait(200); await shot(T, f('01-title'));
    await T.eval(() => window.BD.ui.nav.prep(window.__BD.ui)); await T.wait(200); await shot(T, f('02-prep'));
    await T.eval(() => window.BD.ui.nav.codex(window.__BD.ui)); await T.wait(200); await shot(T, f('03-codex'));
    await T.eval(() => { window.BD.ui.codexSel = 'tide'; }); await T.wait(150); await shot(T, f('03b-codex-locked'));
    await T.eval(() => { window.BD.ui.nav.title(window.__BD.ui); window.BD.ui.nav.openSettings(window.__BD.ui); }); await T.wait(150); await shot(T, f('04-settings'));
    await T.eval(() => { window.__BD.app.closeOverlay(); window.BD.ui.nav.openHelp(window.__BD.ui); }); await T.wait(150); await shot(T, f('05-help'));
  } finally { await T.close(); }
  // play on each floor colour: a crowd from the director, the HUD, markers and minimap
  for (const n of [1, 2, 3, 4, 5, 6]) {
    T = await open(size, '?seed=21&floor=' + n + '&hand=whirl,flame,leech&mute=1&nosave=1');
    try {
      await start(T);
      await T.eval(BUILD);
      await T.eval((n) => { const w = window.__BD.world(); if (n < 6) window.BD.uiTest.stageSites(w, { task: ['purge', 'seals', 'nests', 'hold', 'hunt'][n - 1] }); if (w.task && n > 1) w.task.value = Math.min(w.task.goal - 1, Math.ceil(w.task.goal / 3)); }, n);
      await crowd(T, 4);
      const dom = await T.eval(() => (window.__BD.world().floorN >= 6 ? 'rooftop' : window.__BD.world().floor.domType));
      await shot(T, f('10-play-' + n + 'F-' + dom));
    } finally { await T.close(); }
  }
  // overlays and HUD moments on 3F
  T = await open(size, '?seed=21&floor=3&hand=pierce,flame,chain_slash&mute=1&nosave=1');
  try {
    await start(T); await T.eval(BUILD);
    await T.eval(() => window.BD.uiTest.stageSites(window.__BD.world(), { task: 'seals' }));
    await crowd(T, 3);
    await T.eval(() => { window.__BD.ui.hold = 0; const w = window.__BD.world(); window.BD.growth.addXp(w, w.hero.xpNeed - w.hero.xp); });
    for (let i = 0; i < 30 && (await T.overlay()) !== 'choice'; i++) await T.wait(30);
    await T.wait(90); await shot(T, f('20-choice-opening-locked'));
    await T.wait(500); await shot(T, f('21-choice'));
    await T.key('Digit1'); await T.wait(120); await shot(T, f('22-choice-picked-flight'));
    await T.eval(() => { window.__BD.ui.hold = 1e9; }); await T.wait(400);
    await T.eval(() => {
      const w = window.__BD.world(), o = window.BD.growth.options(w).slice(0, 3);
      w.choice = { kind: 'chest', options: w.cards.filter((c) => c && c.level < window.BD.cardRt.maxLevel(c.def)).map((c) => ({ kind: 'card', id: c.id, name: c.def.name, from: c.level, to: c.level + 1, text: window.BD.cardRt.levelText(c.def, c.level + 1), pick: 'card:' + c.id })).slice(0, 3), lastCards: [] };
      if (!w.choice.options.length) w.choice.options = o;
      w.choiceOpen = true;
    });
    await T.wait(500); await shot(T, f('23-choice-chest'));
    await T.eval(() => { const w = window.__BD.world(); w.choiceOpen = false; w.choice = null; });
    await T.wait(100);
    await T.eval(() => window.__BD.app.pause()); await T.wait(250); await shot(T, f('24-pause'));
    await T.eval(() => window.__BD.app.resume());
    // surge: banner, dark edges, red wedges
    await T.eval(() => { const B = window.BD, w = window.__BD.world(); B.W.emit(w, 'surge', { floor: w.floorN, n: 2 }); B.W.banner(w, '몰려온다', 'surge'); B.W.emit(w, 'spawn', { enemyId: 0, kind: 'goblin', x: w.hero.x + 12, y: w.hero.y - 4, via: 'placed' }); B.W.emit(w, 'spawn', { enemyId: 0, kind: 'goblin', x: w.hero.x - 12, y: w.hero.y + 4, via: 'placed' }); });
    await T.wait(260); await shot(T, f('30-surge'));
    // level up ring + multi-kill word + streak pop
    await T.eval(() => { const B = window.BD, w = window.__BD.world(), h = w.hero; w.scenario = true; B.W.emit(w, 'level_up', { level: h.level }); window.BD.ui.S.streak = { n: 50, t: w.t, last: window.__BD.ui.time, popAt: window.__BD.ui.time }; window.BD.ui.feel.letter(window.__BD.ui, '촤악!', h.x + 1.5, h.y - 1, { size: 58, z: 90, always: true }); });
    await T.wait(140); await shot(T, f('31-levelup-multikill-streak'));
    // a seal breaks (task 2/3), then the task is done: crown blinks toward the stairs
    await T.eval(() => { const B = window.BD, w = window.__BD.world(), s = w.sites[0]; s.state = 'used'; B.W.emit(w, 'site_clear', { kind: s.kind, id: s.id, optional: false }); B.taskRt.progress(w, 1); });
    await T.wait(200); await shot(T, f('32-site-clear-task-2of3'));
    await T.eval(() => { const B = window.BD, w = window.__BD.world(); w.sites.forEach((s) => { if (!s.optional) s.state = 'used'; }); B.taskRt.complete(w); });
    await T.wait(500); await shot(T, f('33-task-done-crown'));
    await T.eval(() => {
      const BD = window.BD, w = window.__BD.world();
      if (!w.enemies.some((e) => !e.dead && e.guardian)) { const g = BD.W.makeEnemy(w, w.floor.guardian, w.hero.x + 3, w.hero.y - 2, { guardian: true, via: 'placed' }); g.hp = g.maxHp * 0.62; }
      w.hero.hp = 24;
    });
    await T.wait(400); await shot(T, f('34-guardian-lowhp'));
    // the result of this run (death)
    await T.eval(() => { const w = window.__BD.world(); w.t = Math.max(w.t, 260); window.__BD.ui.hold = 0; window.__BD.app.giveUp(); });
    await T.waitMode('result', 5000); await T.wait(300); await shot(T, f('40-result-death'));
  } finally { await T.close(); }
  // the rooftop: boss bar; a win's result
  T = await open(size, '?seed=21&floor=6&hand=whirl,lightning,leech&mute=1&nosave=1');
  try {
    await start(T); await T.eval(BUILD); await crowd(T, 3);
    await shot(T, f('35-boss'));
    await T.eval(() => { const B = window.BD, w = window.__BD.world(); window.__BD.ui.hold = 0; const boss = w.enemies.find((e) => e.boss); if (boss) { boss.hp = 0; B.combat.kill(w, boss); } });
    await T.waitMode('result', 8000); await T.wait(300); await shot(T, f('41-result-win'));
  } finally { await T.close(); }
}

async function pilot(size) {
  const floor = Number(o.floor || 1), sec = Number(o.sec || 150), every = Number(o.every || 10), seed = Number(o.seed || 21);
  const dir = path.join(OUT, 'pilot-' + size + '-' + floor + 'F');
  fs.mkdirSync(dir, { recursive: true });
  const T = await open(size, '?seed=' + seed + '&mute=1&nosave=1' + (floor > 1 ? '&floor=' + floor : '') + (o.hand ? '&hand=' + o.hand : ''));
  try {
    await T.eval(([pilotSrc, think]) => {
      const BD = window.BD, B = window.__BD, app = B.app;
      const makePilot = (0, eval)('(' + pilotSrc + ')');
      const F = (window.__PIL = { pilot: null, since: 0, frames: 0, t0: performance.now(), choices: 0 });
      app.onWorld((w) => { F.pilot = makePilot(BD, w.seed, {}); });
      BD.client.input.current = function () { return F.pilot && app.world ? F.pilot.think(app.world) : { mx: 0, my: 0, dash: false }; };
      BD.client.input.consumeDash = function () {};
      const raf = () => { F.frames++; requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      setInterval(() => {
        const w = app.world;
        if (app.uiOverlay === 'pause') app.resume();
        if (!w || app.mode !== 'play' || !F.pilot) return;
        if (F.pilot.choiceOpen(w)) {
          const now = performance.now();
          if (!F.since) F.since = now;
          if (now - F.since >= think * 1000) { const c = F.pilot.choose(w); app.cmd(c[0], c[1], c[2]); F.since = 0; F.choices++; }
        } else F.since = 0;
      }, 50);
    }, [L.makePilot.toString(), 1.2]);
    await start(T);
    await T.eval(() => { window.__BD.app.save.settings.hints = true; });
    const t0 = Date.now();
    let next = 0, last = null;
    for (;;) {
      const s = await T.eval(() => { const B = window.__BD, w = B.world(); return { mode: B.app.mode, t: w ? w.t : 0, floor: w ? w.floorN : 0, ov: B.app.overlay() }; });
      last = s;
      if (s.mode !== 'play' || s.t >= sec || s.floor !== floor || Date.now() - t0 > 20 * 60 * 1000) break;
      if (s.t >= next) { await T.page.screenshot({ path: path.join(dir, 't' + String(Math.round(s.t)).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 70 }); next = Math.floor(s.t / every) * every + every; }
      await T.wait(150);
    }
    const r = await T.eval(() => { const F = window.__PIL, w = window.__BD.world(); return { fps: Math.round((F.frames / ((performance.now() - F.t0) / 1000)) * 10) / 10, choices: F.choices, t: w ? w.t : 0, kills: w ? w.stats.kills : 0, level: w ? w.hero.level : 0 }; });
    console.log(size, floor + 'F', JSON.stringify(Object.assign(r, { last, errors: T.errors.slice(0, 3), requests: T.requests.length })));
    await sheet(dir, 4, 'jpg');
  } finally { await T.close(); }
}

async function sheet(dir, cols, ext) {
  const files = fs.readdirSync(dir).filter((x) => x.endsWith('.' + (ext || 'png')) && !x.startsWith('sheet')).sort();
  if (!files.length) return;
  const w = 400, h = 225;
  const html = '<body style="margin:0;background:#111;font:700 14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(' + cols + ',' + w + 'px)">' +
    files.map((f) => '<div style="position:relative;width:' + w + 'px;height:' + h + 'px;overflow:hidden;background:#000"><img src="file://' + path.join(dir, f) + '" style="max-width:' + w + 'px;max-height:' + h + 'px;display:block;margin:auto"><span style="position:absolute;left:3px;bottom:2px;background:#000b;padding:1px 4px">' + f.replace(/\.\w+$/, '') + '</span></div>').join('') + '</div></body>';
  const { chromium } = require('playwright');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: cols * w, height: Math.ceil(files.length / cols) * h } });
  const tmp = path.join(dir, '_sheet.html');
  fs.writeFileSync(tmp, html);
  await p.goto('file://' + tmp); await p.waitForTimeout(300);
  const out = path.join(dir, 'sheet.jpg');
  await p.screenshot({ path: out, type: 'jpeg', quality: 72, fullPage: true });
  fs.unlinkSync(tmp);
  await b.close();
  console.log(path.relative(H.ROOT, out));
}

(async () => {
  if (mode === 'sheet') { await sheet(path.resolve(String(o.dir)), Number(o.cols || 3), o.ext || 'png'); return; }
  for (const size of sizes) {
    if (mode === 'screens') { await screens(size); await sheet(path.join(OUT, size), 3); }
    else if (mode === 'pilot') await pilot(size);
  }
})().catch((e) => { console.error(e); process.exit(1); });
