#!/usr/bin/env node
// Reviewer screenshots for docs/CONTROLS-REVIEW.md §4.2 after the controls change, beside the ones
// browser_feel.js takes (`--only warn,shots --out docs/screens/feel-after`):
//   play_laptop_1280x720.png          a fight at laptop size: reach ring, target arc, chevron
//   play_phone_667x375_hold.png       phone, thumb held on the stick at full speed, dash cooling down
//   play_turned_375x667_hold.png      forced landscape on a 375×667 portrait window, thumb held
//   reach_ring_wait.png / _swing.png  the reach ring between swings and in the 0.1 s after one
//   shove_ring_{0,1,2,3}.png          the hero walking out through a ring of 8 held goblins (0 / 0.15 / 0.3 / 0.45 s),
//                                     shove_ring_live.png: the same with live goblins (no attacks) 0.6 s in
//   node tools/feel/after_shots.js [--out DIR]     (build first)
'use strict';
const path = require('path');
const fs = require('fs');
const K = require('./_kit');
const UH = require(path.join(__dirname, '..', '..', 'tests', 'ui', '_harness'));
const o = K.args();
const OUT = path.resolve(o.out || path.join(__dirname, '..', '..', 'docs', 'screens', 'feel-after'));
fs.mkdirSync(OUT, { recursive: true });
const URL0 = UH.variant({ standins: false });
const shot = (T, name) => T.shot(path.join(OUT, name));

// a run on 2F (seed 3) the bot has played for `sec`, then held still (speed 0) for the picture
async function fight(vp, touch, sec) {
  const T = await UH.open(URL0, { query: '?seed=3&mute=1&nosave=1&floor=2', context: { viewport: vp, hasTouch: !!touch, deviceScaleFactor: touch ? 2 : 1 } });
  await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
  await T.eval(() => window.__BD.bot(true));
  await T.wait(sec * 1000);
  await T.eval(() => { const B = window.__BD; B.bot(false); B.params.speed = 0; B.app.input = { mx: 0, my: 0, dash: false }; });
  return T;
}
// hold a thumb on the stick: press at logical (x, y), drag `css` CSS px toward the picture's right
async function hold(T, x, y, css) {
  const [ax, ay] = await T.client(x, y);
  const [bx, by] = await T.eval(([x, y, css]) => window.__BD.ui.view.toClient(x + css / window.__BD.ui.view.scale, y - 0.4 * css / window.__BD.ui.view.scale), [x, y, css]);
  await T.pointer('pointerdown', ax, ay, 1); await T.pointer('pointermove', bx, by, 1);
  await T.wait(150);
}

(async () => {
  { // laptop
    const T = await fight({ width: 1280, height: 720 }, false, 6);
    await T.eval(() => { const h = window.__BD.world().hero; h.swingT = 0; });
    await T.wait(120); await shot(T, 'play_laptop_1280x720.png'); await T.close();
  }
  { // phone: thumb held, dash cooling down
    const T = await fight({ width: 667, height: 375 }, true, 6);
    await T.eval(() => { const w = window.__BD.world(); w.hero.dashCd = 1.2; });
    await hold(T, 260, 470, 60);
    await shot(T, 'play_phone_667x375_hold.png'); await T.close();
  }
  { // forced landscape on a portrait window: one touch on the prompt turns the picture and starts
    const T = await UH.open(URL0, { query: '?seed=3&mute=1&nosave=1&floor=2', context: { viewport: { width: 375, height: 667 }, hasTouch: true, deviceScaleFactor: 2 } });
    await T.tapAt(640, 360);
    await T.eval(() => window.__BD.bot(true));
    await T.wait(6000);
    await T.eval(() => { const B = window.__BD; B.bot(false); B.params.speed = 0; B.app.input = { mx: 0, my: 0, dash: false }; });
    await hold(T, 260, 470, 60);
    const v = await T.eval(() => { const v = window.__BD.ui.view; return { forced: v.forced, rot: v.rot }; });
    if (v.forced !== 'turn') throw new Error('not turned: ' + JSON.stringify(v));
    await shot(T, 'play_turned_375x667_hold.png'); await T.close();
  }
  { // the reach ring: one goblin at the edge of reach, between swings and right after one
    const T = await UH.open(URL0, { query: '?seed=5&hand=&mute=1&nosave=1&floor=1', context: { viewport: { width: 1280, height: 720 } } });
    await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
    await T.eval(() => {
      const B = window.__BD, w = B.world(); B.params.speed = 0; B.killAll(); w.wave.n = 3; w.freezeT = 0;
      w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2; w.hero.invuln = 99;
      const e = window.BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.6, w.hero.y + 1.0, { noAttack: 99 }); e.stunT = 99; e.hp = e.maxHp = 1e6;
      B.step(1);
    });
    await T.eval(() => { const B = window.__BD; let n = 0; while (B.world().hero.swingT > 0 && n++ < 60) B.step(1); B.step(12); });
    await T.wait(120); await shot(T, 'reach_ring_wait.png');
    await T.eval(() => { const B = window.__BD; let n = 0; while (B.world().hero.swingT <= 0 && n++ < 60) B.step(1); B.step(1); });
    await T.wait(60); await shot(T, 'reach_ring_swing.png');
    await T.close();
  }
  // the shove: a ring of 8 goblins round the hero (no attacks, no swings); he walks screen-right
  for (const live of [false, true]) {
    const T = await UH.open(URL0, { query: '?seed=5&hand=&mute=1&nosave=1&floor=1', context: { viewport: { width: 1280, height: 720 } } });
    await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
    await T.eval((live) => {
      const B = window.__BD, w = B.world(); B.params.speed = 0; B.killAll(); w.wave.n = 3; w.freezeT = 0;
      w.hero.x = 3.5; w.hero.y = w.grid.h / 2 + 2; w.hero.atkTimer = 1e9;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const e = window.BD.W.makeEnemy(w, 'goblin', w.hero.x + Math.cos(a) * 1.15, w.hero.y + Math.sin(a) * 1.15, { noAttack: 99 });
        e.hp = e.maxHp = 1e6; if (!live) e.stunT = 99;
      }
      if (live) B.step(20); // let them settle round him
      B.app.input = { mx: 0.7071, my: -0.7071, dash: false }; // screen right
    }, live);
    for (let k = 0; k < (live ? 1 : 4); k++) {
      if (live) await T.eval(() => { const B = window.__BD; B.world().hero.atkTimer = 1e9; B.step(36); });
      await T.wait(80); await shot(T, live ? 'shove_ring_live.png' : `shove_ring_${k}.png`);
      await T.eval(() => { const B = window.__BD; B.world().hero.atkTimer = 1e9; B.step(9); });
    }
    await T.close();
  }
  console.log('written to ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
