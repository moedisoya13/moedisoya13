#!/usr/bin/env node
// Frames of every card at levels 1, 3 and 5 in the built game during a horde, and the contact
// sheets of docs/screens/v2-cards/ (not a test file: tools/test.js runs only *.test.js).
//
//   node build.js && node tests/cards/shoot.js --out DIR [--only flame,whirl] [--levels 1,3,5]
//   node tests/cards/shoot.js --sheet DIR --to docs/screens/v2-cards     (sheets only, from DIR)
//
// Per card and level: a run starts through window.__BD on the floor whose type suits the card
// (its target type, undead for 망자의 안식, else 3F), the card is raised to the level (quest cards
// awakened from level 3, combo cards at their top stack), the bot fights at 2× speed, and when the
// card's own effect fires with at least 10 enemies in view the world and the renderer's clock
// freeze a few ticks later (the effect is mid-flight) and the frame is shot at 1280 × 720.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;

// what to wait for: the card's own event in the tick, how many ticks after it to freeze
// ev(e, w, L, inView) → true for an event of the card (inView(enemy): in the combat window)
const SIG = {
  pierce: { ev: (e, w, L, inView) => e.event === 'swing_end' && e.hitCount >= 3, delay: 3 },
  whirl: { ev: (e, w, L, inView) => e.event === 'swing_end' && e.hitCount >= 4 && (L < 5 || w.lastSwing.shapes.some((s) => s.kind === 'ring')), delay: 3 },
  sword_wave: { ev: (e, w, L, inView) => e.event === 'swing_end' && e.hitCount >= 1, delay: 8 },
  flame: { ev: (e, w, L, inView) => e.event === 'tick' && w.enemies.filter((x) => !x.dead && x.statuses.burn && inView(x)).length >= 6, delay: 0 },
  lightning: { ev: (e, w, L, inView) => e.event === 'vfx' && (L < 5 ? e.kind === 'chain_bolt' && e.points.length >= 4 : e.kind === 'thunder'), delay: 2 },
  tide: { ev: (e, w, L, inView) => (L < 3 ? e.event === 'vfx' && e.kind === 'splash' : L < 5 ? e.event === 'vfx' && e.kind === 'tide_bump' : e.event === 'strike' && e.shapes.some((s) => s.card === 'tide')), delay: 3 },
  leech: { ev: (e, w, L, inView) => e.event === 'vfx' && e.kind === (L < 5 ? 'leech_heal' : 'leech_ring'), delay: 4 },
  riposte: { ev: (e, w, L, inView) => e.event === 'strike' && e.source === 'riposte', delay: 3, force: 'riposte' },
  drawcut: { ev: (e, w, L, inView) => e.event === 'swing' && e.charged, delay: 3 },
  holy_light: { ev: (e, w, L, inView) => e.event === 'vfx' && e.kind === (L < 3 ? 'holy_cross' : 'holy_burst'), delay: 4 },
  armor_break: { ev: (e, w, L, inView) => e.event === 'vfx' && e.kind === (L < 3 ? 'armor_shards' : 'armor_burst'), delay: 4 },
  mana_backlash: { ev: (e, w, L, inView) => e.event === 'vfx' && e.kind === 'mana_burst', delay: 5 },
  rest_of_dead: { ev: (e, w, L, inView) => e.event === 'vfx' && e.kind === (L < 3 ? 'rod_glow' : 'rod_burst'), delay: 4 },
  kings_hunt: { ev: (e, w, L, inView) => (L < 5 ? e.event === 'hit' && e.elite : e.event === 'vfx' && e.kind === 'royal_first'), delay: 4, force: 'elite' },
  fire_pilgrimage: { ev: (e, w, L, inView) => (L < 3 ? e.event === 'vfx' && e.kind === 'pilgrim_flare' : L < 5 ? e.event === 'vfx' && e.kind === 'pilgrim_burst' : e.event === 'tick' && w.zones.filter((z) => z.kind === 'pilgrim_trail').length >= 8), delay: 3 },
  chain_slash: { ev: (e, w, L, inView) => (L < 5 ? e.event === 'swing_end' && e.hitCount >= 2 : e.event === 'hit' && e.source === 'burst'), delay: 3 },
  flawless: { ev: (e, w, L, inView) => e.event === 'strike' && e.source === 'echo', delay: 3 },
  one_flash: { ev: (e, w, L, inView) => e.event === 'strike' && e.shapes.some((s) => s.card === 'one_flash' && (L < 5 || (s.trail && s.trail.flash))), delay: 3 },
};

const TYPE = { holy_light: 'undead', rest_of_dead: 'undead', armor_break: 'heavy', mana_backlash: 'magic' };

async function shoot(page, card, L, seed) {
  const sig = SIG[card];
  return page.evaluate(async ([card, L, seed, evSrc, delay, force, type]) => {
    const B = window.__BD, BD = window.BD, app = B.app, R = BD.client.render;
    const sig = { ev: (0, eval)('(' + evSrc + ')'), delay, force };
    // the floor: the card's type if a floor of that type exists, else 3F
    const run = BD.gen.run(seed, 0);
    let floor = 3;
    if (type) for (let n = 2; n <= 5; n++) if (run.floors[n].domType === type) { floor = n; break; }
    B.start({ seed, hand: [card], floor, level: 1 });
    const w = B.world(), c = BD.cardRt.get(w, card);
    while (c.level < L) BD.cardRt.levelUp(w, c);
    if (c.def.family === 'quest' && L >= 3) BD.cardRt.awaken(w, c);
    if (c.def.family === 'combo') BD.cardRt.setStack(w, c, BD.cardRt.maxStack(c), 'gain');
    for (const id of ['edge', 'edge', 'body']) BD.growth.giveBoon(w, id);
    app.botOn = true; app.botOpts = { trial: false };
    B.params.speed = 2;
    // freeze: no world steps, the renderer's clock stands
    if (!window.__wrapped) {
      window.__wrapped = true;
      const step = app.step, draw = R.drawWorld;
      app.step = function () { return window.__FREEZE ? false : step.call(app); };
      R.drawWorld = function (g, ui, dt) { return draw.call(R, g, ui, window.__FREEZE ? 0 : dt); };
    }
    window.__FREEZE = false; window.__forced = 0;
    let hitAt = -1, ticks = 0;
    const inView = (x) => BD.view.inView(w, x.x, x.y);
    const on = (e) => {
      if (hitAt >= 0 || window.__FREEZE) return;
      let ok = false;
      try { ok = sig.ev(e, w, L, inView); } catch (err) { ok = false; }
      const crowd = w.enemies.filter((x) => !x.dead && inView(x)).length;
      if (ok && crowd >= 10 && w.t > 4) hitAt = w.ticks;
    };
    for (const name of ['swing', 'swing_end', 'vfx', 'strike', 'hit', 'tick']) w.bus.on(name, on, window);
    w.bus.on('tick', () => { ticks++; if (hitAt >= 0 && w.ticks >= hitAt + sig.delay) window.__FREEZE = true; }, window);
    const t0 = performance.now();
    while (!window.__FREEZE && performance.now() - t0 < 60000 && app.mode === 'play') {
      // 반격 needs a blow (levels 1–4) or a dash (level 5): one every 2 s of game time once a crowd is close
      if (sig.force === 'riposte' && !w.hero.dead && w.t > 6 && w.t - (window.__forced || 0) > 2 && w.enemies.filter((x) => !x.dead && BD.math.dist(x.x, x.y, w.hero.x, w.hero.y) < 3).length >= 4) {
        window.__forced = w.t;
        if (L >= 5) { if (w.hero.dashCd <= 0 && w.hero.dashT <= 0) BD.hero.startDash(w); } else { w.hero.invuln = 0; BD.W.hurtHero(w, 1, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'shoot' + w.ticks }); }
      }
      if (sig.force === 'elite' && w.t > 5 && !w.enemies.some((x) => !x.dead && x.elite)) {
        const kind = BD.director.mixes.get(w.floor.domType).threats ? Object.keys(BD.director.mixes.get(w.floor.domType).threats)[0] : 'goblin';
        BD.W.makeEnemy(w, kind, w.hero.x + 2.5, w.hero.y + 0.5, { elite: true });
      }
      if (sig.force === 'riposte' || sig.force === 'elite') w.hero.hp = Math.max(w.hero.hp, 60);
      await new Promise((r) => setTimeout(r, 50));
    }
    const crowd = w.enemies.filter((x) => !x.dead && inView(x)).length;
    return { ok: !!window.__FREEZE, floor, domType: w.floor.domType, t: +w.t.toFixed(1), crowd, level: c.level, mode: app.mode };
  }, [card, L, seed, sig.ev.toString(), sig.delay, sig.force || null, TYPE[card] || null]);
}

async function sheets(dir, to) {
  const { chromium } = require('playwright');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'shots.json'), 'utf8'));
  const cards = [...new Set(meta.map((m) => m.card))];
  const groups = [cards.slice(0, 9), cards.slice(9)];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  fs.mkdirSync(to, { recursive: true });
  const names = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const W0 = 480, H0 = 270;
    const cell = (m) => `<div style="position:relative;width:${W0}px;height:${H0}px"><img src="file://${path.join(dir, m.file)}" style="width:${W0}px;height:${H0}px;display:block"><span style="position:absolute;left:4px;top:3px;background:#000c;padding:1px 6px">${m.name} ${m.level}단계 · ${m.domType} · ${m.crowd} in view${m.ok ? '' : ' · NOT CAUGHT'}</span></div>`;
    const html = `<body style="margin:0;background:#111;font:700 15px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(3,${W0}px);gap:2px">${groups[gi].map((c) => [1, 3, 5].map((L) => meta.find((m) => m.card === c && m.level === L)).filter(Boolean).map(cell).join('')).join('')}</div></body>`;
    await page.setContent(html);
    await page.waitForTimeout(300);
    const file = path.join(to, `sheet-${gi + 1}-${groups[gi][0]}-to-${groups[gi][groups[gi].length - 1]}.jpg`);
    await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 82 });
    names.push(file);
  }
  await browser.close();
  return names;
}

(async () => {
  if (o.sheet) { console.log((await sheets(path.resolve(String(o.sheet)), path.resolve(String(o.to || 'docs/screens/v2-cards')))).join('\n')); return; }
  const { chromium } = require('playwright');
  const OUT = path.resolve(String(o.out || path.join(ROOT, 'dist', 'cards-shots')));
  fs.mkdirSync(OUT, { recursive: true });
  const { load } = require(path.join(ROOT, 'tools', 'load'));
  const BDn = load();
  const cards = o.only ? String(o.only).split(',') : BDn.cards.ids();
  const levels = String(o.levels || '1,3,5').split(',').map(Number);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'dist', 'before-dawn.html') + '?mute=1&nosave=1');
  await page.waitForFunction(() => window.__BD && window.__BD.ui, null, { timeout: 15000 });
  const metaFile = path.join(OUT, 'shots.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')).filter((m) => !(cards.includes(m.card) && levels.includes(m.level))) : [];
  for (const card of cards) for (const L of levels) {
    let r = null;
    for (const seed of [21, 9, 44]) { r = await shoot(page, card, L, seed); if (r.ok) break; }
    await page.waitForTimeout(250); // a few frames drawn at the frozen moment
    const file = `${card}-L${L}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    meta.push(Object.assign({ card, name: BDn.cards.get(card).name, level: L, file }, r));
    console.log(card, L, JSON.stringify(r));
  }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  await browser.close();
  console.log('errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
})().catch((e) => { console.error(e); process.exit(1); });
