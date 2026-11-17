// Stage every enemy, guardian and boss phase in the built game (dist/, run node build.js first)
// and screenshot it with Playwright. Not a test (tools/test.js runs *.test.js only); the
// screenshots in docs/screens/enemies/ came from it.
// node tests/enemies/stage_screens.js [outDir] [scene,scene…]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const OUT = process.argv[2] || path.join(ROOT, 'docs/screens/enemies/all');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

// Each scene: seed/floor/hand, then setup(args) in the page (BD and __BD are globals), then
// a list of [ticks, screenshotName|null, checkFn?]. Everything after setup is deterministic.
const scenes = {
  // stage(): BD / __BD are page globals. U(expr) = step until expr (string, w = world) holds.
  beast: { seed: 1, floor: 1, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.5; w.hero.y = 9.5;
    const s = BD.W.makeEnemy(w, 'slime', 9.4, 8.8, {}); s.mem.cd = 0;
    const gs = [[5.2, 9.2], [6.9, 8.2], [5.9, 10.8]].map(([x, y]) => { const g = BD.W.makeEnemy(w, 'goblin', x, y, {}); g.mem.cd = 0.25; return g; });
    for (const [x, y] of [[3.0, 4.0], [4.0, 5.2]]) BD.W.makeEnemy(w, 'goblin', x, y, {}).mem.cd = 99;
    return {};
  }, steps: [['w.telegraphs.filter((t) => t.attack === "stab").length >= 2 && w.telegraphs.some((t) => t.attack === "stab" && t.remain < 0.2)', 'beast_slime_pounce_goblin_stabs']] },
  slime_land: { seed: 1, floor: 1, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.5; w.hero.y = 9.5;
    const s = BD.W.makeEnemy(w, 'slime', 9.4, 8.8, {}); s.mem.cd = 0;
    return {};
  }, steps: [['w.telegraphs.length > 0', null, 'w.hero.y = 10.9; w.hero.x = 5.0'], ['w.enemies[0].state === "flat"', null], [10, 'beast_slime_landed_flat']] },
  beast_guardians: { seed: 1, floor: 1, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.5; w.hero.y = 9.5;
    const s = BD.W.makeEnemy(w, 'slime', 9.4, 8.0, { guardian: true }); s.mem.cd = 0; s.mem.pounces = 2;
    const g = BD.W.makeEnemy(w, 'goblin', 3.5, 10.0, { guardian: true }); g.mem.summonT = 0.3; g.mem.cd = 99;
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "pounce" && t.remain < 0.3)', 'beast_guardians_king_slime_pounce_goblin_chief_rifts']] },
  undead: { seed: 3, floor: 1, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 7.5; w.hero.y = 7.5;
    const a = BD.W.makeEnemy(w, 'skel_archer', 2.0, 2.4, {}); a.mem.cd = 0;
    const g = BD.W.makeEnemy(w, 'ghoul', 9.6, 6.6, {}); g.mem.cd = 0.4;
    const c = BD.W.makeEnemy(w, 'ghoul', 9.6, 9.8, {}); c.stunT = 1e9;
    BD.combat.damage(w, c, 9999, { source: 'slash', direct: true });
    return { down: !!c.down };
  }, steps: [['w.telegraphs.some((t) => t.attack === "lunge" && t.remain < 0.3)', 'undead_archer_line_ghoul_lunge_corpse'], ['w.projectiles.length > 0', null], [8, 'undead_arrow_in_flight']] },
  undead_guardians: { seed: 3, floor: 1, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 8.0; w.hero.y = 7.8;
    const a = BD.W.makeEnemy(w, 'skel_archer', 2.4, 2.4, { guardian: true }); a.mem.cd = 0;
    const g = BD.W.makeEnemy(w, 'ghoul', 10.0, 4.5, { guardian: true }); g.stunT = 1e9;
    BD.combat.damage(w, g, 9999, { source: 'slash', direct: true });
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "shot" && t.remain < 0.35)', 'undead_guardian_archer_three_lines_ghoul_tyrant_down']] },
  magic: { seed: 1, floor: 3, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 7.5; w.hero.y = 5.0;
    const m = BD.W.makeEnemy(w, 'mage', 12.5, 6.0, {}); m.mem.cd = 0; m.mem.blinkCdT = 99;
    return {};
  }, steps: [['w.zones.length > 0', null, 'const z = w.zones[0]; const g = BD.W.makeEnemy(w, "goblin", z.x + 0.3, z.y, {}); g.stunT = 1e9; w.hero.x = 5.0; w.hero.y = 3.6; const m2 = BD.W.makeEnemy(w, "mage", 2.0, 7.0, {}); m2.mem.cd = 0.2; m2.mem.blinkCdT = 99; const m3 = BD.W.makeEnemy(w, "mage", 6.2, 2.4, {}); m3.mem.cd = 99; m3.mem.nearT = 0.3; m3.mem.blinkCdT = 0'],
    ['w.telegraphs.some((t) => t.attack === "blink" && t.remain < 0.25) && w.telegraphs.some((t) => t.attack === "fire_circle")', 'magic_mage_circle_zone_burning_goblin_blink_mark']] },
  magic_guardian: { seed: 1, floor: 3, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 7.5; w.hero.y = 5.0;
    const m = BD.W.makeEnemy(w, 'mage', 13.0, 5.0, { guardian: true }); m.mem.cd = 0; m.mem.blinkCdT = 99;
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "fire_circle" && t.remain < 0.35)', 'magic_guardian_three_circles']] },
  heavy: { seed: 1, floor: 2, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.0; w.hero.y = 9.0;
    const k = BD.W.makeEnemy(w, 'dark_knight', 6.0, 5.0, {}); k.face = Math.PI / 2; k.mem.cd = 0;
    const k2 = BD.W.makeEnemy(w, 'dark_knight', 2.5, 10.5, {}); k2.face = 0; k2.mem.cd = 99;
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "charge" && t.remain < 0.3)', 'heavy_knight_charge_white_hatch_guard_arcs']] },
  heavy_slam: { seed: 1, floor: 2, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.0; w.hero.y = 3.6;
    const k = BD.W.makeEnemy(w, 'dark_knight', 6.0, 7.4, {}); k.face = -Math.PI / 2; k.mem.cd = 0;
    return {};
  }, steps: [['w.telegraphs.length > 0', null, 'w.hero.x = 9.0'], ['w.enemies[0].stunT > 0', null], [20, 'heavy_knight_slammed_desks_opening']] },
  heavy_guardian_full: { seed: 1, floor: 2, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 9.0; w.hero.y = 9.6;
    const k = BD.W.makeEnemy(w, 'dark_knight', 9.0, 3.8, { guardian: true }); k.face = Math.PI / 2; k.mem.cd = 0;
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "charge" && t.remain < 0.3)', 'heavy_guardian_full_7u_charge', 'w.hero.x = 6.5; w.hero.y = 10.5'], ['w.telegraphs.some((t) => t.attack === "sweep" && t.remain < 0.3)', 'heavy_guardian_sweep_after_full_charge']] },
  heavy_guardian: { seed: 1, floor: 2, setup() {
    const w = __BD.world(); __BD.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.atkTimer = 1e9;
    w.hero.x = 6.0; w.hero.y = 11.0;
    const k = BD.W.makeEnemy(w, 'dark_knight', 6.0, 4.6, { guardian: true }); k.face = Math.PI / 2; k.mem.cd = 0;
    return {};
  }, steps: [['w.telegraphs.some((t) => t.attack === "charge" && t.remain < 0.4)', 'heavy_guardian_charge_cut_short_by_desk', 'w.hero.x = 9.2; w.hero.y = 9.0'], ['w.telegraphs.some((t) => t.attack === "sweep" && t.remain < 0.3)', 'heavy_guardian_sweep']] },
  boss1: { seed: 9, floor: 6, setup() {
    const w = __BD.world(); w.freezeT = 0; w.hero.atkTimer = 1e9;
    const b = w.enemies.find((e) => e.boss); b.mem.cd = 0;
    w.hero.x = 6.5; w.hero.y = 9.7;
    return { hp: b.maxHp };
  }, steps: [['w.telegraphs.some((t) => t.attack === "cleave" && t.remain < 0.35)', 'boss_p1_cleave', 'w.hero.x = 6.5; w.hero.y = 11.5'], ['w.telegraphs.filter((t) => t.attack === "dark_bolts").length >= 2', null], [8, 'boss_p1_dark_bolts']] },
  boss2: { seed: 9, floor: 6, setup() {
    const w = __BD.world(); w.freezeT = 0; w.hero.atkTimer = 1e9;
    const b = w.enemies.find((e) => e.boss); b.hp = Math.round(b.maxHp * 0.6);
    w.hero.x = 6.5; w.hero.y = 9.7;
    return {};
  }, steps: [[20, 'boss_p2_roar'], ['w.telegraphs.filter((t) => t.attack === "dark_bolts").length >= 2', 'boss_p2_dark_bolts_fan'], ['w.telegraphs.some((t) => t.attack === "thorns" && t.remain < 0.45)', 'boss_p2_thorns']] },
  boss3: { seed: 9, floor: 6, setup() {
    const w = __BD.world(); w.freezeT = 0; w.hero.atkTimer = 1e9;
    const b = w.enemies.find((e) => e.boss); b.hp = Math.round(b.maxHp * 0.3); b.mem.phase = 2;
    w.hero.x = 6.5; w.hero.y = 9.7;
    return {};
  }, steps: [[20, 'boss_p3_roar'], ['w.telegraphs.filter((t) => t.attack === "collapse").length >= 2', null], [6, 'boss_p3_collapse']] },
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const url = 'file://' + path.join(ROOT, 'dist/before-dawn.html');
  for (const [name, sc] of Object.entries(scenes)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url + `?seed=${sc.seed}&mute=1&nosave=1`);
    await p.waitForTimeout(400);
    await p.evaluate(([seed, floor]) => { __BD.start({ seed, floor, hand: ['pierce'] }); __BD.params.speed = 0; }, [sc.seed, sc.floor]);
    await p.waitForTimeout(150);
    const info = await p.evaluate(`(${sc.setup.toString().replace(/^setup/, 'function')})()`);
    let log = name + ' setup ' + JSON.stringify(info);
    for (const [cond, shot, after] of sc.steps) {
      const r = await p.evaluate(([cond]) => {
        const w = __BD.world();
        if (typeof cond === 'number') { for (let i = 0; i < cond; i++) { __BD.setHp(100); __BD.step(1); } return cond; }
        const f = new Function('w', 'BD', 'return (' + cond + ');');
        for (let i = 0; i < 1200; i++) { if (f(w, BD)) return i; __BD.setHp(100); __BD.step(1); }
        return -1;
      }, [cond]);
      log += ` | ${typeof cond === 'number' ? cond + ' ticks' : 'until ' + (r < 0 ? 'NEVER' : r + ' ticks')}`;
      if (shot) {
        await p.waitForTimeout(150);
        const st = await p.evaluate(() => { const s = __BD.state(); return { t: s.t, hp: s.hero.hp, tgs: s.telegraphs.map((t) => `${t.attack}:${t.shape}:${t.remain}`), zones: __BD.world().zones.length, proj: s.projectiles, enemies: s.enemies.map((e) => e.kind + (e.guardian ? '*' : '') + ':' + e.state) }; });
        await p.screenshot({ path: path.join(OUT, shot + '.png') });
        log += `\n   ${shot}: t=${st.t} tgs=[${st.tgs.join(' ')}] zones=${st.zones} proj=${st.proj} enemies=[${st.enemies.join(' ')}]`;
      }
      if (after) await p.evaluate((code) => { const w = __BD.world(); new Function('w', 'BD', code)(w, BD); }, after);
    }
    if (errors.length) log += '\n   ERRORS: ' + errors.join(' / ');
    console.log(log);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
