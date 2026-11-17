// Every enemy kind, an elite of each type, each guardian and each boss phase standing in a horde, in
// the built game (run `node build.js` first), at 1280×720 and 667×375, frozen at a telling moment
// (a warning about to fire, a split, a charge through the horde) and gathered into contact sheets.
// Not a test (tools/test.js runs *.test.js only); docs/screens/v2-enemies/ came from it.
//
//   node tests/enemies/v2_screens.js [outDir] [scene,scene…]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const OUT = process.argv[2] || path.join(ROOT, 'docs/screens/v2-enemies');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const HTML = path.join(ROOT, 'dist/before-dawn.html');
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

// In the page: clear the floor, put the hero at (hx, hy), stop the director, fill a ring of `n` of the
// floor's fodder 2–7u around him (their own timers: some will be winding up), then `extra` (a function
// body with w, h, mk(kind, dx, dy, opts) in scope) places the threats. The hero does not swing and his
// HP is topped up, so the scene stays.
const STAGE = function (o) {
  const B = window.__BD, w = B.world(), h = w.hero;
  for (const e of w.enemies.slice()) BD.W.removeEnemy(w, e, 'recycle');
  w.shards = []; w.telegraphs = []; w.projectiles = []; w.zones = []; w.rifts = []; w.queue = []; w.pickups = [];
  if (w.director) w.director.off = true;
  w.freezeT = 0; h.x = o.hx; h.y = o.hy; h.atkTimer = 1e9; h.targetId = null;
  BD.view.snapCam(w);
  const rnd = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const mk = (kind, dx, dy, opts) => { const [x, y] = BD.nav.resolve(w.grid, h.x + dx, h.y + dy, 0.4); return BD.W.makeEnemy(w, kind, x, y, opts || {}); };
  const mix = BD.director.mixOf(w), kinds = Object.keys(mix.fodder).sort(), sum = kinds.reduce((s, k) => s + mix.fodder[k], 0);
  const pick = () => { let r = rnd() * sum; for (const k of kinds) { r -= mix.fodder[k]; if (r < 0) return k; } return kinds[0]; };
  for (let i = 0; i < o.n; i++) {
    const a = rnd() * Math.PI * 2, d = 2 + rnd() * 5;
    const e = mk(pick(), Math.cos(a) * d, Math.sin(a) * d);
    e.mem.cd = 0.3 + rnd() * 2.5;
  }
  (0, eval)('(function (w, h, mk) {' + (o.extra || '') + '})')(w, h, mk);
  window.__shot = { pred: null, hit: false };
  if (!window.__wrapped) {
    window.__wrapped = true;
    const app = B.app, step = app.step;
    app.step = function () {
      const r = step(), sw = app.world;
      // the hero never swings (and is drawn walking, not mid-swing: interval − atkTimer > follow-through)
      if (sw) { sw.hero.hp = sw.hero.maxHp; sw.hero.atkTimer = 1e8; sw.hero.stats.interval = 1e8 + 1; }
      if (window.__shot.pred && sw && window.__shot.pred(sw)) { window.__shot.pred = null; window.__shot.hit = true; B.ui.hold = 1e9; }
      return r;
    };
  }
  return { enemies: w.enemies.length };
};

const tg = (attack, left) => `w.telegraphs.some((t) => t.attack === '${attack}' && t.remain < ${left})`;
// scene: {seed, floor, hx, hy, n, extra, steps: [[pred, shotName | null, then?]]}
const SCENES = {
  beast: { seed: 1, floor: 1, hx: 34, hy: 34, n: 36, extra: `
      const s1 = mk('slime', 2.6, -0.4); s1.mem.cd = 0;
      const s2 = mk('slime', -1.2, 3.4); s2.mem.cd = 0.4;
      const el = mk('slime', -3.4, -2.2, { elite: true }); el.mem.cd = 0.2;`,
  steps: [[tg('pounce', 0.25), 'beast_goblins_slime_pounce_elite'],
    [null, null, `const s = w.enemies.find((e) => e.kind === 'slime' && !e.elite && !e.dead); BD.combat.damage(w, s, 999, { source: 'slash', direct: true });`],
    ['w.enemies.filter((e) => e.kind === "slimelet").length >= 2', 'beast_slime_split_two_slimelets']] },
  beast_guardians: { seed: 1, floor: 4, hx: 9, hy: 11, n: 30, extra: `
      const s = mk('slime', 2.6, -2.6, { guardian: true }); s.mem.cd = 0; s.mem.pounces = 2;
      const g = mk('goblin', -3.2, -2.8, { guardian: true }); g.mem.summonT = 0.4; g.mem.cd = 99;`,
  steps: [[tg('pounce', 0.3), 'beast_guardians_king_slime_goblin_chief_summon']] },
  undead: { seed: 2, floor: 2, hx: 34, hy: 34, n: 36, extra: `
      const a1 = mk('skel_archer', -5.2, -2.0); a1.mem.cd = 0; a1.mem.mode = 'hold';
      const a2 = mk('skel_archer', 3.0, -5.0); a2.mem.cd = 0.3; a2.mem.mode = 'hold';
      const g = mk('ghoul', 2.4, 0.6); g.mem.cd = 0.25;
      const el = mk('ghoul', -2.0, 3.6, { elite: true }); el.mem.cd = 0.6;
      const c = mk('ghoul', 4.2, 3.2); c.stunT = 1e9; BD.combat.damage(w, c, 999, { source: 'slash', direct: true });`,
  steps: [[`${tg('shot', 0.3)} && ${tg('lunge', 0.6)}`, 'undead_husks_archers_hold_ghoul_lunge_corpse_elite']] },
  undead_guardians: { seed: 6, floor: 4, hx: 9, hy: 11, n: 30, extra: `
      const a = mk('skel_archer', -2.0, -5.0, { guardian: true }); a.mem.cd = 0; a.mem.mode = 'hold';
      const g = mk('ghoul', 3.0, -3.0, { guardian: true }); g.mem.cd = 99; g.stunT = 1e9; BD.combat.damage(w, g, 99999, { source: 'slash', direct: true });`,
  steps: [[tg('shot', 0.3), 'undead_guardians_archer_master_three_lines_ghoul_tyrant_down']] },
  magic: { seed: 2, floor: 3, hx: 34, hy: 30, n: 36, extra: `
      const m1 = mk('mage', -4.5, -2.0); m1.mem.cd = 0;
      const m2 = mk('mage', 4.6, 1.0); m2.mem.cd = 99; BD.combat.damage(w, m2, Math.ceil(m2.maxHp / 2), { source: 'slash', direct: true });
      const el = mk('mage', 1.5, -5.0, { elite: true }); el.mem.cd = 0.5;`,
  steps: [[tg('blink', 0.15), 'magic_mana_slimes_mage_teleport_mark_fire_circle_elite'],
    ['w.zones.length > 0', null, `const z = w.zones[0]; for (let i = 0; i < 5; i++) BD.W.makeEnemy(w, 'mana_slime', z.x + Math.cos(i * 1.3) * 0.9, z.y + Math.sin(i * 1.3) * 0.9, {}).mem.cd = 99;`],
    ['w.enemies.filter((e) => e.statuses.burn).length >= 4', 'magic_fire_zone_burns_the_horde']] },
  magic_guardian: { seed: 2, floor: 3, hx: 9, hy: 11, n: 30, extra: `
      const m = mk('mage', 3.6, -3.6, { guardian: true }); m.mem.cd = 0; m.mem.blinkCdT = 99;`,
  steps: [[tg('fire_circle', 0.35), 'magic_guardian_archmage_three_circles']] },
  heavy: { seed: 1, floor: 2, hx: 29, hy: 34, n: 36, extra: `
      const k = mk('dark_knight', -4.6, 0); k.face = 0; k.mem.cd = 0;
      for (let i = 0; i < 5; i++) mk('squire', -1.6 - i * 0.55, (i % 2 ? 0.4 : -0.4)).mem.cd = 99;
      const el = mk('dark_knight', 2.4, -4.6, { elite: true }); el.mem.cd = 99;`,
  steps: [[tg('charge', 0.2), 'heavy_squires_knight_charge_into_horde_elite'],
    ['w.enemies.some((e) => e.kind === "dark_knight" && !e.elite && e.mem.trampled && !e.mem.charging)', 'heavy_after_charge_trampled_squires']] },
  heavy_guardian: { seed: 1, floor: 2, hx: 9, hy: 11, n: 30, extra: `
      const k = mk('dark_knight', 0, -5, { guardian: true }); k.face = Math.PI / 2; k.mem.cd = 0;`,
  steps: [[tg('charge', 0.25), 'heavy_guardian_captain_charge'], [tg('sweep', 0.25), 'heavy_guardian_captain_sweep']] },
  boss1: { seed: 1, floor: 6, hx: 17, hy: 17, n: 10, extra: `
      const b = BD.W.makeEnemy(w, 'demon_king', 14, 14, {}); b.mem.cd = 0;`,
  steps: [[`${tg('cleave', 0.3)} || ${tg('dark_bolts', 0.2)}`, 'boss_phase1_minions']] },
  boss2: { seed: 1, floor: 6, hx: 17, hy: 17, n: 12, extra: `
      const b = BD.W.makeEnemy(w, 'demon_king', 14, 14, {}); b.hp = Math.floor(b.maxHp * 0.6); b.mem.phase = 2; b.mem.cycleI = 2; b.mem.cd = 0;`,
  steps: [[tg('thorns', 0.3), 'boss_phase2_thorns_on_minions']] },
  boss3: { seed: 1, floor: 6, hx: 16.5, hy: 16.5, n: 14, extra: `
      const b = BD.W.makeEnemy(w, 'demon_king', 14, 14, {}); b.hp = Math.floor(b.maxHp * 0.3); b.mem.phase = 3; b.mem.cycleI = 1; b.mem.cd = 0;`,
  steps: [[`w.telegraphs.filter((t) => t.attack === 'collapse').length >= 2`, 'boss_phase3_collapse_rings_on_minions']] },
};

const VIEWS = { desk: { width: 1280, height: 720 }, phone: { width: 667, height: 375 } };

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const made = { desk: [], phone: [] }, errors = [];
  for (const [vname, vp] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: vname === 'phone' });
    for (const [name, sc] of Object.entries(SCENES)) {
      if (ONLY && !ONLY.includes(name)) continue;
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
      await page.goto('file://' + HTML + `?seed=${sc.seed}&floor=${sc.floor}&mute=1&nosave=1`);
      await page.waitForFunction(() => window.__BD && window.__BD.ui && window.BD.client.assets.ready);
      for (let i = 0; i < 8 && (await page.evaluate(() => window.__BD.app.mode)) !== 'play'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
      if (sc.floor === 6) await page.waitForFunction(() => window.__BD.world().floorN === 6, null, { timeout: 5000 });
      await page.waitForTimeout(700); // strips decode, tints bake
      await page.evaluate(() => { const w = window.__BD.world(); if (w.choiceOpen) w.choiceOpen = false; });
      await page.evaluate(([src, o]) => (0, eval)('(' + src + ')')(o), [STAGE.toString(), { hx: sc.hx, hy: sc.hy, n: sc.n, extra: sc.extra }]);
      for (const [pred, shot, then] of sc.steps) {
        if (pred) {
          await page.evaluate((p) => { window.__shot.hit = false; window.__shot.pred = (0, eval)('(w) => ' + p); }, pred);
          try { await page.waitForFunction(() => window.__shot.hit, null, { timeout: 12000 }); } catch (err) { errors.push(`${name}/${vname}: '${pred}' never held`); await page.evaluate(() => { window.__shot.pred = null; }); }
          await page.waitForTimeout(120);
        }
        if (shot) {
          const file = path.join(OUT, 'frames', `${vname}_${shot}.png`);
          await page.screenshot({ path: file });
          made[vname].push({ file, label: shot.replace(/_/g, ' ') });
        }
        if (then) await page.evaluate((s) => { const w = window.__BD.world(); (0, eval)('(function (w) {' + s + '})')(w); }, then);
        await page.evaluate(() => { window.__BD.ui.hold = 0; });
      }
      await page.close();
    }
    await ctx.close();
  }
  // contact sheets: one per view size
  for (const [vname, list] of Object.entries(made)) {
    if (!list.length) continue;
    const cols = 2, cw = 640, ch = Math.round((cw * VIEWS[vname].height) / VIEWS[vname].width);
    const html = `<body style="margin:0;background:#111;font:700 15px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(${cols},${cw}px)">` +
      list.map((x) => `<div style="position:relative;width:${cw}px;height:${ch}px"><img src="file://${x.file}" style="width:${cw}px;height:${ch}px;display:block"><span style="position:absolute;left:4px;top:3px;background:#000b;padding:1px 6px">${x.label}</span></div>`).join('') + '</div></body>';
    const tmp = path.join(OUT, '_sheet.html');
    fs.writeFileSync(tmp, html);
    const p = await browser.newPage({ viewport: { width: cols * cw, height: Math.ceil(list.length / cols) * ch } });
    await p.goto('file://' + tmp);
    await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    await p.screenshot({ path: path.join(OUT, `sheet_${vname}_${vp(vname)}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
    await p.close();
    fs.unlinkSync(tmp);
  }
  await browser.close();
  console.log(`${made.desk.length + made.phone.length} frames, errors ${errors.length}${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  function vp(n) { return VIEWS[n].width + 'x' + VIEWS[n].height; }
})();
