// Touch controls (GDD §2.1) at phone size: a drag anywhere is the floating joystick and is
// drawn; a second press within 250 ms dashes; the dash button dashes and never becomes the
// stick; card slots pause; the dash button follows settings.dashSide.
// docs/CONTROLS-REVIEW.md §3.2, §3.3, §3.7: the stick is sized in CSS px (dead 8, full 48, origin
// follows past 64) at every screen size; a re-grip away from where the finger lifted is no dash;
// a dash pressed just before it is ready fires when ready, one the buffer cannot save shakes the
// button; a Space in the pause menu is no dash on resume; phone-sized dash and pause hit areas.
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
const dashes = (T) => T.eval(() => window.__BD.events(400).filter((e) => e.event === 'dash').length);
const stick = (T) => T.eval(() => window.BD.client.input.stick());
const has = (arr, x) => arr.some((s) => s === x);
// speed share of a drag of `css` CSS px held at (x, y) (client px), then released
async function share(T, x, y, css) {
  await T.pointer('pointerdown', x, y, 81); await T.pointer('pointermove', x + css, y, 81);
  const m = await T.eval(() => { const i = window.BD.client.input.current(); return Math.hypot(i.mx, i.my); });
  await T.pointer('pointerup', x + css, y, 81);
  await T.eval(() => window.BD.client.input.clearDash());
  return m;
}

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

  async 'portrait: rotate prompt holds the world; back to landscape asks for a tap; blur pauses'(t) {
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
      t.eq(await T.overlay(), 'tap', 'back in landscape: 화면을 터치하면 계속 (tests/ui/rotate.test.js)');
      await T.tapAt(640, 360);
      t.eq(await T.overlay(), null, 'one tap resumes');
      await T.eval(() => window.dispatchEvent(new Event('blur')));
      await T.wait();
      t.eq(await T.overlay(), 'pause', 'losing focus pauses');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'the stick is sized in CSS px on a phone and a tablet: 7 px nothing, 9 px moving, 30 px about half, 48 px full; the drawn ring is the 48 px line'(t) {
    for (const vp of [{ width: 667, height: 375 }, { width: 1024, height: 768 }]) {
      const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: vp, hasTouch: true } });
      try {
        await T.key('Enter');
        await T.eval(() => { const B = window.__BD; B.killAll(); B.world().wave.n = 3; });
        const got = [];
        for (const d of [7, 9, 30, 40, 48, 70]) got.push(+(await share(T, 200, 200, d)).toFixed(3));
        const name = vp.width + '×' + vp.height;
        t.eq(got[0], 0, name + ': 7 px is inside the dead zone');
        t.assert(got[1] > 0, name + ': 9 px moves');
        t.assert(got[2] >= 0.45 && got[2] <= 0.65, name + ': 30 px is about half speed: ' + got[2]);
        t.assert(got[3] < 0.99 && got[4] >= 0.99 && got[5] >= 0.99, name + ': full speed from 48 px: ' + got);
        // past 64 px the origin follows the finger
        await T.pointer('pointerdown', 200, 200, 82); await T.pointer('pointermove', 300, 200, 82);
        const s = await T.eval(() => { const s = window.BD.client.input.stick(), v = window.__BD.ui.view; return (s.x - s.ox) * v.scale; });
        await T.pointer('pointerup', 300, 200, 82);
        t.near(s, 64, 0.01, name + ': origin 64 CSS px behind the finger');
      } finally { await T.close(); }
    }
  },

  async 're-gripping away from where the finger lifted is a new stick, not a dash; in place it still dashes'(t) {
    const T = await playing(t);
    try {
      const regrip = (dx) => T.eval(async (dx) => {
        const c = document.getElementById('bd'), B = window.__BD;
        const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        B.world().hero.dashCd = 0; window.BD.client.input.clearDash();
        const n0 = B.events(400).filter((e) => e.event === 'dash').length;
        ev('pointerdown', 150, 200); ev('pointermove', 180, 200); await sleep(200); ev('pointerup', 180, 200);
        await sleep(150);
        ev('pointerdown', 180 + dx, 210); ev('pointermove', 180 + dx, 180); await sleep(200);
        const stick = !!window.BD.client.input.stick();
        ev('pointerup', 180 + dx, 180); await sleep(80);
        return { dash: B.events(400).filter((e) => e.event === 'dash').length > n0, stick };
      }, dx);
      const far = await regrip(150), farther = await regrip(-140), near = await regrip(20);
      t.eq([far.dash, farther.dash], [false, false], 'a press 150 / 140 CSS px away within 150 ms does not dash');
      t.assert(far.stick && farther.stick, 'it is a new stick');
      t.eq(near.dash, true, 'a press 20 CSS px from the lift within 150 ms is a double tap');
    } finally { await T.close(); }
  },

  async 'dash just before it is ready fires when ready; a press the buffer cannot save shakes the button; Space in the pause menu is no dash'(t) {
    const T = await playing(t);
    try {
      const b = await T.find('hud_dash');
      const [cx, cy] = await T.client(b.x + b.w / 2, b.y + b.h / 2);
      await T.eval(() => { window.__BD.world().hero.dashCd = 0.12; });
      await T.pointer('pointerdown', cx, cy, 91); await T.wait(30); await T.pointer('pointerup', cx, cy, 91);
      await T.wait(400);
      t.eq(await dashes(T), 1, 'pressed 0.12 s early: dashes when ready');
      const r = await T.eval(() => window.BD.client.input.st.refusedAt);
      t.eq(r, -1, 'a press the buffer saves does not shake the button');
      await T.eval(() => { window.__BD.world().hero.dashCd = 1.5; });
      await T.pointer('pointerdown', cx, cy, 92); await T.wait(30); await T.pointer('pointerup', cx, cy, 92);
      await T.wait(60);
      const shake = await T.eval(() => window.__BD.ui.time - window.BD.client.input.st.refusedAt);
      t.assert(shake >= 0 && shake < 0.15, 'a press 1.5 s early is refused and shakes the button (' + shake + ')');
      await T.wait(300); // past the 0.2 s buffer
      await T.eval(() => { window.__BD.world().hero.dashCd = 0; });
      await T.wait(450);
      t.eq(await dashes(T), 1, 'the refused press was not kept');
      // Space while paused
      await T.key('Escape');
      t.eq(await T.overlay(), 'pause');
      await T.key('Space');
      await T.key('Escape');
      t.eq(await T.overlay(), null);
      await T.wait(200);
      t.eq(await dashes(T), 1, 'Space in the pause menu does not dash on resume');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'phone 667×375: dash button at least 68 CSS px across with a 72 CSS px touch square, pause 44 CSS px; a laptop keeps the old sizes'(t) {
    const sizes = async (vp) => {
      const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: vp, hasTouch: true } });
      try {
        await T.key('Enter');
        await T.find('hud_dash'); // the play frame has drawn its buttons (a busy machine may need a moment)
        return await T.eval(() => {
          const B = window.__BD, v = B.ui.view, bs = B.ui.debug.buttons();
          const d = bs.find((b) => b.id === 'hud_dash'), p = bs.find((b) => b.id === 'hud_pause');
          return { s: v.scale, dash: [d.w * v.scale, d.h * v.scale], pause: [p.w * v.scale, p.h * v.scale], r: window.BD.ui.dashSize(B.ui).r * v.scale, inside: d.x >= 0 && d.y >= 0 && d.x + d.w <= 1280 && d.y + d.h <= 720 && p.x + p.w <= 1280 };
        });
      } finally { await T.close(); }
    };
    const ph = await sizes({ width: 667, height: 375 });
    t.assert(Math.min(...ph.dash) >= 72 - 0.01, 'dash touch square ≥ 72 CSS px: ' + ph.dash);
    t.assert(2 * ph.r >= 68 - 0.01, 'dash drawn ≥ 68 CSS px across: ' + 2 * ph.r);
    t.assert(Math.min(...ph.pause) >= 44 - 0.01, 'pause ≥ 44 CSS px: ' + ph.pause);
    t.assert(ph.inside, 'both stay inside the picture');
    const lap = await sizes({ width: 1280, height: 720 });
    t.eq([lap.dash, lap.pause, lap.r], [[104, 104], [72, 66], 46], 'scale 1: unchanged');
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
