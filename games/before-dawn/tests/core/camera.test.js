// The follow camera in the built page (headless Chromium): v1 rooms stand still; on a staged
// 48×48 floor everything that maps between screen and world follows the camera — the projection
// and its inverse, touches (normal and forced-landscape quarter turn), the stick and the dash
// direction, baked decals, the telegraph clip, particles — and the off-screen markers, minimap
// switch and character animation work there.
'use strict';

async function open(t, vp, query) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(t.dist + '?seed=11&mute=1&nosave=1&hand=pierce,flame,leech' + (query || ''));
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.evaluate(() => { const B = window.__BD; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); }); // Enter may land before the title is up
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // stage a big floor; enemies frozen in place so the hero can walk freely
  const stage = (enemies) => ev((n) => {
    const B = window.__BD; B.stage({ size: [48, 48], enemies: n });
    const w = B.world(); w.hero.hp = w.hero.maxHp = 1e6; w.freezeT = 1e9;
  }, enemies === undefined ? 0 : enemies);
  const touch = (type, x, y, id) => ev(([type, x, y, id]) => {
    document.getElementById('bd').dispatchEvent(new PointerEvent(type, { pointerId: id || 31, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, [type, x, y, id]);
  return { browser, page, ev, stage, touch, errors, close: () => browser.close() };
}
const cam = (P) => P.ev(() => { const v = window.__BD.ui.view; return { rox: v.rox, roy: v.roy }; });
const heroScreen = (P) => P.ev(() => { const w = window.__BD.world(); return window.__BD.ui.view.proj(w.hero.x, w.hero.y); });
const hero = (P) => P.ev(() => { const h = window.__BD.world().hero; return { x: h.x, y: h.y }; });

module.exports = {
  // v2 runs start on 48×48 floors; a room that fits the screen (a v1 room, staged at 12×12) keeps the v1 camera
  'a room that fits (v1 size): the camera stands still while the hero walks; markers and minimap off': async (t) => {
    const P = await open(t, { width: 1280, height: 720 });
    try {
      await P.ev(() => { const B = window.__BD; B.stage({ size: [12, 12], enemies: 0 }); const w = B.world(); w.hero.hp = w.hero.maxHp = 1e6; });
      await P.page.waitForTimeout(100);
      const c0 = await cam(P);
      await P.page.keyboard.down('KeyA'); await P.page.waitForTimeout(700); await P.page.keyboard.up('KeyA');
      t.eq(await cam(P), c0);
      t.eq(await P.ev(() => window.BD.client.offscreen.enabled(window.__BD.world())), { indicators: false, minimap: false });
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'big floor: follows the hero within the slack, projection round trip, touch → world': async (t) => {
    const P = await open(t, { width: 1280, height: 720 });
    try {
      await P.stage();
      t.eq(await P.ev(() => window.BD.client.offscreen.enabled(window.__BD.world())), { indicators: true, minimap: true });
      const c0 = await cam(P), h0 = await hero(P);
      await P.page.keyboard.down('KeyW'); await P.page.waitForTimeout(1500);
      const [sx, sy] = await heroScreen(P);
      await P.page.keyboard.up('KeyW');
      const c1 = await cam(P), h1 = await hero(P);
      t.assert(c1.roy > c0.roy + 100, 'the world scrolled down as the hero went up the screen');
      t.assert(Math.abs(sx - 640) <= 112 + 1 && Math.abs(sy - 350) <= 64 + 1, `hero within the slack of the focus point: ${sx}, ${sy}`);
      t.assert(Math.hypot(h1.x - h0.x, h1.y - h0.y) > 4);
      const rt = await P.ev(() => { const v = window.__BD.ui.view; const [lx, ly] = v.proj(17.25, 30.5); return v.toWorld(lx, ly); });
      t.near(rt[0], 17.25, 1e-9); t.near(rt[1], 30.5, 1e-9);
      // a pointer at the hero's feet on screen maps back to the hero
      const back = await P.ev(() => { const w = window.__BD.world(), v = window.__BD.ui.view, [lx, ly] = v.proj(w.hero.x, w.hero.y), [cx, cy] = v.toClient(lx, ly); return { at: v.clientToWorld(cx, cy), h: [w.hero.x, w.hero.y] }; });
      t.near(back.at[0], back.h[0], 1e-6); t.near(back.at[1], back.h[1], 1e-6);
      // the simulation's view rectangle is inside what the camera shows
      const inside = await P.ev(() => { const w = window.__BD.world(), v = window.__BD.ui.view, r = window.BD.view.rect(w); return r.x0 + v.rox >= -1 && r.x1 + v.rox <= 1281 && r.y0 + v.roy >= -1 && r.y1 + v.roy <= 721; });
      t.assert(inside, 'BD.view.rect lies on screen');
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'forced landscape (quarter turn) on a big floor: stick drags and the dash go the way the finger goes on the picture': async (t) => {
    const P = await open(t, { width: 375, height: 667 });
    try {
      await P.ev(() => window.__BD.ui.view.setForced('turn'));
      await P.ev(() => { const a = window.__BD.app; if (a.uiOverlay) a.closeOverlay(); });
      await P.page.waitForTimeout(150);
      t.eq(await P.ev(() => window.__BD.ui.view.rot), 1);
      await P.stage();
      await P.ev(() => { const h = window.__BD.world().hero; h.x = 24; h.y = 24; window.BD.client.camera.snap(); });
      await P.page.waitForTimeout(200);
      // drag on the turned picture (logical +x), held: the hero's screen x grows, the camera follows
      const drag = async (dx, dy, ms) => {
        const [c0x, c0y] = await P.ev(() => window.__BD.ui.view.toClient(500, 360));
        const [c1x, c1y] = await P.ev(([dx, dy]) => window.__BD.ui.view.toClient(500 + dx, 360 + dy), [dx, dy]);
        await P.touch('pointerdown', c0x, c0y, 41);
        for (let i = 1; i <= 5; i++) { await P.touch('pointermove', c0x + ((c1x - c0x) * i) / 5, c0y + ((c1y - c0y) * i) / 5, 41); await P.page.waitForTimeout(15); }
        await P.page.waitForTimeout(ms);
        await P.touch('pointerup', c1x, c1y, 41);
      };
      const w0 = await P.ev(() => { const w = window.__BD.world(); return window.BD.view.map(w.hero.x, w.hero.y); });
      const c0 = await cam(P);
      await drag(-80, 0, 700); // left on the picture
      const w1 = await P.ev(() => { const w = window.__BD.world(); return window.BD.view.map(w.hero.x, w.hero.y); });
      const c1 = await cam(P);
      t.assert(w1[0] < w0[0] - 60 && Math.abs(w1[1] - w0[1]) < 0.3 * Math.abs(w1[0] - w0[0]), `hero moved left on the picture: ${w0} → ${w1}`);
      t.assert(c1.rox > c0.rox + 30, 'the camera followed left');
      // dash with no input: along the last walk (left on the picture), through the camera
      await P.ev(() => { window.__BD.world().hero.dashCd = 0; window.BD.client.input.st.dashReq = true; });
      await P.page.waitForTimeout(400);
      const w2 = await P.ev(() => { const w = window.__BD.world(); return window.BD.view.map(w.hero.x, w.hero.y); });
      t.assert(w2[0] < w1[0] - 100, `dash went left on the picture: ${w1} → ${w2}`);
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'big floor: baked decals, the telegraph clip and particles stay on their world spot as the camera moves': async (t) => {
    const P = await open(t, { width: 1280, height: 720 });
    try {
      await P.stage();
      await P.page.waitForTimeout(200);
      // a decal under the hero, a particle and the floor clip, read back from the screen after the camera moved
      const spot = await P.ev(() => {
        const w = window.__BD.world(), x = w.hero.x - 2, y = w.hero.y - 2;
        window.BD.client.render.bake((g, v) => { const [sx, sy] = v.proj(x, y); g.save(); window.BD.client.render.clipFloor(g, v, w); g.fillStyle = '#ff00ff'; g.beginPath(); g.arc(sx, sy, 14, 0, 7); g.fill(); g.restore(); });
        return [x, y];
      });
      await P.page.keyboard.down('KeyW'); await P.page.waitForTimeout(900); await P.page.keyboard.up('KeyW');
      await P.page.waitForTimeout(200);
      const r = await P.ev(([x, y]) => {
        const v = window.__BD.ui.view, w = window.__BD.world(), c = document.getElementById('bd'), g = c.getContext('2d');
        const px = (lx, ly) => { const [cx, cy] = v.toClient(lx, ly); return Array.from(g.getImageData(Math.round(cx * v.dpr), Math.round(cy * v.dpr), 1, 1).data); };
        const [lx, ly] = v.proj(x, y);
        // telegraph clip: inside on a floor cell near the hero, outside above the back corner of the floor
        const s = document.createElement('canvas'); s.width = 1280; s.height = 720; const sg = s.getContext('2d');
        sg.save(); window.BD.client.render.clipFloor(sg, v, w); sg.fillStyle = '#f00'; sg.fillRect(0, 0, 1280, 720); sg.restore();
        const [fx, fy] = v.proj(w.hero.x - 1, w.hero.y - 1), [ox, oy] = v.proj(0, 0);
        const a = (X, Y) => (X >= 0 && Y >= 0 && X < 1280 && Y < 720 ? sg.getImageData(Math.round(X), Math.round(Y), 1, 1).data[3] : -1);
        return { onScreen: lx > 0 && lx < 1280 && ly > 0 && ly < 720, decal: px(lx, ly), clipIn: a(fx, fy), clipOut: a(ox, oy - 30), moved: v.roy };
      }, spot);
      t.assert(r.onScreen, 'the decal spot is still on screen');
      t.assert(r.decal[0] > 200 && r.decal[1] < 80 && r.decal[2] > 200, 'decal drawn at its world spot after the camera moved: ' + r.decal);
      t.eq(r.clipIn, 255);
      t.assert(r.clipOut === 0 || r.clipOut === -1, 'outside the floor is clipped');
      // particle: emitted at a world point, drawn through the same projection
      const p = await P.ev(() => { const w = window.__BD.world(), F = window.BD.client.fx; F.reset(); F.emit({ x: w.hero.x + 1, y: w.hero.y, life: 5, color: '#00ff00', size: 9, layer: 'world' }); return [w.hero.x + 1, w.hero.y]; });
      await P.page.waitForTimeout(100);
      const pc = await P.ev(([x, y]) => { const v = window.__BD.ui.view, g = document.getElementById('bd').getContext('2d'), [lx, ly] = v.proj(x, y), [cx, cy] = v.toClient(lx, ly); return Array.from(g.getImageData(Math.round(cx * v.dpr), Math.round(cy * v.dpr), 1, 1).data); }, p);
      t.assert(pc[1] > 180 && pc[0] < 100, 'particle at its world spot: ' + pc);
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'big floor: off-screen threats get edge markers inside the band, the minimap draws; animation clips play and deaths leave a ghost': async (t) => {
    const P = await open(t, { width: 1280, height: 720 });
    try {
      await P.stage(30);
      await P.page.waitForFunction(() => Object.keys(window.BD.client.assets.anim).length === Object.keys(window.BD.animData).length);
      const r = await P.ev(() => {
        const w = window.__BD.world(), OS = window.BD.client.offscreen, v = window.__BD.ui.view;
        const far = w.enemies.find((e) => !v.worldOnScreen(e.x, e.y));
        far.flags.marker = 'threat';
        const ms = OS.markers(w);
        // spy on the marker drawing: where does the arc for `far` go
        const g = { calls: [] }; const real = document.createElement('canvas').getContext('2d');
        const spy = new Proxy(real, { get: (o, k) => (k === 'translate' ? (x, y) => { g.calls.push([x, y]); o.translate(x, y); } : typeof o[k] === 'function' ? o[k].bind(o) : o[k]), set: (o, k, val) => { o[k] = val; return true; } });
        OS.drawIndicators(spy, window.__BD.ui);
        const I = OS.INSET;
        return { n: ms.filter((m) => m.kind === 'threat').length, inBand: g.calls.length > 0 && g.calls.every(([x, y]) => x >= I.x0 - 1 && x <= I.x1 + 1 && y >= I.y0 - 1 && y <= I.y1 + 1), calls: g.calls.length };
      });
      t.assert(r.n >= 1 && r.calls >= 1 && r.inBand, JSON.stringify(r));
      // animation: count frames drawn from strips over a short walk next to live enemies
      const a = await P.ev(() => new Promise((done) => {
        const AN = window.BD.client.render.anim, real = AN.drawFrame; let n = 0;
        AN.drawFrame = function () { n++; return real.apply(this, arguments); };
        const w = window.__BD.world(); w.freezeT = 0;
        for (const e of w.enemies) { e.x = w.hero.x - 3 - (e.id % 5) * 0.6; e.y = w.hero.y - 3 + (e.id % 3) * 0.6; }
        setTimeout(() => { AN.drawFrame = real; done({ n }); }, 600);
      }));
      t.assert(a.n > 30, 'clip frames drawn: ' + a.n);
      const g = await P.ev(() => new Promise((done) => {
        const B = window.__BD, w = B.world(), AN = window.BD.client.render.anim;
        w.freezeT = 1e9;
        const e = w.enemies.find((x) => !x.dead && !x.down), mine = () => AN.ghosts.filter((gh) => gh.id === e.id).length;
        window.BD.combat.kill(w, e);
        const n1 = mine();
        setTimeout(() => done({ n1, n2: mine(), alive: w.enemies.filter((x) => x.id === e.id && !x.dead).length }), 1100);
      }));
      t.eq([g.n1, g.n2, g.alive], [1, 0, 0], 'a ghost for the dissolve, gone after it, the enemy itself gone at once');
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },
};
