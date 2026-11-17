// Touch controls (GDD §2.1) at phone size: a drag anywhere is the floating joystick and is
// drawn; a second press within 250 ms dashes; the dash button dashes and never becomes the
// stick; card slots pause; the dash button follows settings.dashSide.
'use strict';
const H = require('./_harness');

async function playing(t, extra) {
  const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1' + (extra || ''), context: { viewport: { width: 667, height: 375 }, hasTouch: true } });
  await T.key('Enter');
  t.eq(await T.mode(), 'play');
  await T.eval(() => { const B = window.__BD, w = B.world(); B.killAll(); w.wave.n = 3; w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2; });
  return T;
}
const hero = (T) => T.eval(() => { const h = window.__BD.world().hero; return { x: h.x, y: h.y }; });
const dashes = (T) => T.eval(() => window.__BD.events(400).filter((e) => e.type === 'dash').length);
const stick = (T) => T.eval(() => window.BD.client.input.stick());
const has = (arr, x) => arr.some((s) => s === x);

module.exports = {
  async 'drag anywhere moves the hero and draws the stick; release stops'(t) {
    const T = await playing(t);
    try {
      const h0 = await hero(T);
      const [x0, y0] = await T.client(900, 260);
      await T.pointer('pointerdown', x0, y0, 31);
      for (let i = 1; i <= 5; i++) { await T.pointer('pointermove', x0 + i * 6, y0, 31); await T.wait(20); }
      await T.wait(400);
      const s = await stick(T);
      t.assert(s && s.x > s.ox, 'stick active with the finger to the right of its origin');
      const h1 = await hero(T);
      // screen right = world (+x, −y)
      t.assert(h1.x - h0.x > 0.3 && h0.y - h1.y > 0.3, `hero moved screen-right: ${JSON.stringify([h0, h1])}`);
      await T.pointer('pointerup', x0 + 30, y0, 31);
      await T.wait(60);
      t.eq(await stick(T), null, 'stick released');
      const h2 = await hero(T); await T.wait(250); const h3 = await hero(T);
      t.assert(Math.hypot(h3.x - h2.x, h3.y - h2.y) < 0.05, 'hero stops on release');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'double tap within 250 ms dashes; a slower second tap does not'(t) {
    const T = await playing(t);
    try {
      const [x, y] = await T.client(500, 300);
      await T.pointer('pointerdown', x, y, 41); await T.pointer('pointermove', x - 30, y, 41); await T.wait(120);
      await T.pointer('pointerup', x - 30, y, 41);
      await T.wait(450);
      await T.pointer('pointerdown', x, y, 42); await T.wait(60); await T.pointer('pointerup', x, y, 42);
      await T.wait(100);
      t.eq(await dashes(T), 0, 'a tap 450 ms later is not a dash');
      await T.wait(80);
      await T.pointer('pointerdown', x, y, 43); await T.wait(30); await T.pointer('pointerup', x, y, 43);
      await T.wait(120);
      t.eq(await dashes(T), 1, 'tap within 250 ms of the last release dashes');
    } finally { await T.close(); }
  },

  async 'the dash button dashes and its touch never becomes the joystick'(t) {
    const T = await playing(t);
    try {
      const b = await T.find('hud_dash');
      t.assert(b, 'dash button declared');
      t.assert(b.w >= 92 && b.h >= 92, 'thumb-sized hit area');
      const [cx, cy] = await T.client(b.x + b.w / 2, b.y + b.h / 2);
      const h0 = await hero(T);
      await T.pointer('pointerdown', cx, cy, 51);
      await T.pointer('pointermove', cx - 40, cy - 20, 51);
      await T.wait(100);
      t.eq(await stick(T), null, 'no joystick from the dash button');
      await T.pointer('pointerup', cx - 40, cy - 20, 51);
      await T.wait(120);
      t.eq(await dashes(T), 1, 'pressing the button dashes');
      const h1 = await hero(T);
      t.assert(Math.hypot(h1.x - h0.x, h1.y - h0.y) > 1.5, 'dash moved the hero');
    } finally { await T.close(); }
  },

  async 'portrait: rotate prompt holds the world; back to landscape lands on pause; blur pauses'(t) {
    const T = await playing(t);
    try {
      await T.wait(200);
      await T.page.setViewportSize({ width: 375, height: 667 });
      await T.wait(200);
      t.eq(await T.overlay(), 'rotate');
      t.assert(has(await T.texts(), '화면을 가로로'), 'rotate prompt drawn');
      const t0 = (await T.state()).t; await T.wait(400);
      t.eq((await T.state()).t, t0, 'world held while portrait');
      await T.page.setViewportSize({ width: 667, height: 375 });
      await T.wait(200);
      t.eq(await T.overlay(), 'pause', 'back in landscape: the pause menu');
      await T.tap('resume');
      t.eq(await T.overlay(), null);
      await T.eval(() => window.dispatchEvent(new Event('blur')));
      await T.wait();
      t.eq(await T.overlay(), 'pause', 'losing focus pauses');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'card slots and Ⅱ pause; dash side setting moves the button'(t) {
    const T = await playing(t);
    try {
      for (const id of ['slot1', 'hud_pause']) {
        const before = await hero(T);
        await T.tap(id);
        t.eq(await T.overlay(), 'pause', id + ' pauses');
        const after = await hero(T);
        t.assert(Math.hypot(after.x - before.x, after.y - before.y) < 0.01, 'tap on ' + id + ' did not move the hero');
        await T.tap('resume');
      }
      const right = await T.find('hud_dash');
      t.assert(right.x > 1000, 'dash button on the right by default');
      await T.eval(() => window.__BD.app.setSettings({ dashSide: 'left' }));
      await T.wait();
      const left = await T.find('hud_dash');
      t.assert(left.x < 200, 'dash button on the left');
      await T.tap('hud_dash');
      t.eq(await dashes(T), 1, 'left dash button dashes');
    } finally { await T.close(); }
  },
};
