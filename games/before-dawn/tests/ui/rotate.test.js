// After the rotate prompt, one touch gets the player playing (the user's asks: "화면 회전 안내 이후
// 터치하면 자동 시작" and "화면 회전 안내에서 넘어가지 않습니다"). Phone sizes, synthetic pointers:
// - the prompt itself takes a touch: forced landscape (the picture a quarter turn round on the
//   portrait window) and the run starts; drags, the dash button and the double tap follow the
//   turn; a real landscape window returns to the normal view without a restart
// - turning the device instead: 화면을 터치하면 시작 (launch) / 계속 (mid-run, t held) → one tap
// - the tap is never a move, a dash-button press or half of a double-tap dash
// - the size is re-read every frame; a tall desktop window takes a click into an upright view
// - Esc on the tap state opens the menus; blur still pauses; the preparation screen's own hand
'use strict';
const H = require('./_harness');

const PORTRAIT = { width: 375, height: 667 };
const LANDSCAPE = { width: 667, height: 375 };
const has = (arr, s) => arr.some((x) => x === s);
const dashes = (T) => T.eval(() => window.__BD.events(400).filter((e) => e.event === 'dash').length);
const stick = (T) => T.eval(() => window.BD.client.input.stick());
const hero = (T) => T.eval(() => { const h = window.__BD.world().hero; return { x: h.x, y: h.y }; });
const view = (T) => T.eval(() => { const v = window.__BD.ui.view; return { forced: v.forced, rot: v.rot, portrait: v.portrait }; });
const turn = async (T, size) => { await T.page.setViewportSize(size); await T.wait(250); };
const calm = (T) => T.eval(() => { const B = window.__BD, w = B.world(); B.killAll(); w.wave.n = 3; w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2; w.hero.dashCd = 0; });
const dealt = (T, seed) => T.eval((s) => window.BD.cardRt.dealHand(s, window.__BD.app.save.unlocked, 0), seed);

// One tap at logical (x, y) and, `gap` ms after its release, a new press that drags — all in the
// page so the second press is surely inside the 250 ms double-tap window. Returns the measured gap
// and what the app looked like between the two.
const tapThenPress = (T, x, y, x2, y2, gap) => T.eval(([x, y, x2, y2, gap]) => new Promise((done) => {
  const c = document.getElementById('bd'), v = window.__BD.ui.view;
  const fire = (type, lx, ly, id) => { const p = v.toClient(lx, ly); c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: p[0], clientY: p[1], bubbles: true, cancelable: true })); };
  fire('pointerdown', x, y, 61);
  const stickOnPress = window.BD.client.input.stick();
  fire('pointerup', x, y, 61);
  const t0 = performance.now();
  const after = { mode: window.__BD.state().mode, overlay: window.__BD.state().overlay, stick: window.BD.client.input.stick(), dashReq: window.BD.client.input.st.dashReq };
  setTimeout(() => {
    fire('pointerdown', x2, y2, 62);
    const gapMs = performance.now() - t0;
    const dashReq = window.BD.client.input.st.dashReq;
    fire('pointermove', x2 + 30, y2, 62);
    done({ stickOnPress, after, gapMs, dashReqOnSecond: dashReq });
  }, gap);
}), [x, y, x2, y2, gap]);

// a touch drag in logical coordinates (mapped through the view), held for `ms`
async function drag(T, x, y, dx, dy, id, ms) {
  const [cx0, cy0] = await T.client(x, y), [cx1, cy1] = await T.client(x + dx, y + dy);
  await T.pointer('pointerdown', cx0, cy0, id);
  for (let i = 1; i <= 5; i++) { await T.pointer('pointermove', cx0 + ((cx1 - cx0) * i) / 5, cy0 + ((cy1 - cy0) * i) / 5, id); await T.wait(15); }
  await T.wait(ms);
  return { client: [cx1 - cx0, cy1 - cy0], end: [cx1, cy1] };
}

// the GDD §5.6 starting-hand rule, checked on the ids
const handRules = (T, hand) => T.eval((hand) => {
  const fam = (id) => window.BD.cards.get(id).family;
  return {
    n: hand.length, distinct: new Set(hand).size,
    conditional: hand.filter((id) => ['quest', 'combo'].includes(fam(id))).length,
    shapeOrElement: hand.filter((id) => ['shape', 'element'].includes(fam(id))).length,
  };
}, hand);
async function checkHand(t, T, hand) {
  const r = await handRules(T, hand);
  t.assert(r.n === 3 && r.distinct === 3 && r.conditional <= 1 && r.shapeOrElement >= 1, 'GDD §5.6 hand: ' + JSON.stringify(r));
}

module.exports = {
  async 'forced landscape: one touch on the prompt turns the picture and starts; drag, dash button, double tap follow the turn; 667×375 goes back without a restart'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: PORTRAIT, hasTouch: true } });
    try {
      t.eq(await T.mode(), 'title');
      t.eq(await T.overlay(), 'rotate', 'portrait at launch: the rotate prompt');
      const rt = await T.texts();
      for (const s of ['화면을 가로로', '돌려 주세요', '화면을 터치하면', '가로 화면으로 바로 시작합니다']) t.assert(has(rt, s), 'rotate prompt says: ' + s);
      await T.wait(300);
      t.eq(await T.overlay(), 'rotate', 'the prompt stays while the window stays portrait');
      // one touch anywhere on the prompt
      await T.tapAt(640, 360);
      const v = await view(T);
      t.eq(v.forced, 'turn', 'a touch turns the picture');
      t.assert(v.rot === 1 || v.rot === -1, 'a quarter turn');
      t.eq(v.portrait, false, 'no rotate prompt any more');
      t.eq(await T.mode(), 'play', 'the same touch starts the run');
      t.eq(await T.overlay(), null);
      const st = await T.state();
      t.eq(st.cards.map((c) => c.id), await dealt(T, st.seed), 'the hand the preparation screen would deal');
      await checkHand(t, T, st.cards.map((c) => c.id));
      t.eq(await dashes(T), 0, 'the starting touch is not a dash');
      await calm(T);
      // a drag to the right of the turned picture is a downward (or upward) drag on the glass
      // and moves the hero screen-right: world (+x, −y)
      const h0 = await hero(T);
      const d = await drag(T, 900, 300, 60, 0, 31, 400);
      t.assert(Math.abs(d.client[1]) > 3 * Math.abs(d.client[0]), 'the drag runs along the portrait window\'s long side: ' + JSON.stringify(d.client));
      const s = await stick(T);
      t.assert(s && s.x > s.ox, 'the stick sees the drag as rightward in the picture');
      const h1 = await hero(T);
      t.assert(h1.x - h0.x > 0.3 && h0.y - h1.y > 0.3, 'hero moved screen-right: ' + JSON.stringify([h0, h1]));
      await T.pointer('pointerup', d.end[0], d.end[1], 31);
      await T.wait(450); // past the double-tap window
      // the dash button, at its place in the turned picture
      const b = await T.find('hud_dash');
      t.assert(b, 'dash button declared');
      const [bx, by] = await T.client(b.x + b.w / 2, b.y + b.h / 2);
      await T.pointer('pointerdown', bx, by, 51);
      await T.wait(60);
      t.eq(await stick(T), null, 'the dash button does not become the stick');
      await T.pointer('pointerup', bx, by, 51);
      await T.wait(150);
      t.eq(await dashes(T), 1, 'the dash button dashes in the turned picture');
      // the double tap
      await T.eval(() => { window.__BD.world().hero.dashCd = 0; });
      const d2 = await drag(T, 500, 300, -30, 0, 41, 100);
      await T.pointer('pointerup', d2.end[0], d2.end[1], 41);
      await T.wait(80);
      const [qx, qy] = await T.client(500, 300);
      await T.pointer('pointerdown', qx, qy, 42); await T.wait(30); await T.pointer('pointerup', qx, qy, 42);
      await T.wait(150);
      t.eq(await dashes(T), 2, 'a second press within 250 ms dashes in the turned picture');
      // the window really turns landscape: the normal view, the same run
      const before = await T.state();
      await turn(T, LANDSCAPE);
      const v2 = await view(T);
      t.eq(v2, { forced: null, rot: 0, portrait: false }, 'a landscape window ends forced landscape');
      t.eq(await T.overlay(), null, 'no prompt, no tap state: play goes on');
      const after = await T.state();
      t.eq(after.mode, 'play');
      t.eq(after.seed, before.seed, 'the same run');
      t.assert(after.t > before.t, 'not restarted: the clock goes on (' + before.t + ' → ' + after.t + ')');
      await calm(T);
      const h2 = await hero(T);
      const d3 = await drag(T, 900, 300, 60, 0, 71, 400);
      t.assert(Math.abs(d3.client[0]) > 3 * Math.abs(d3.client[1]), 'upright again: a rightward drag is rightward on the glass');
      const h3 = await hero(T);
      t.assert(h3.x - h2.x > 0.3 && h2.y - h3.y > 0.3, 'hero moved screen-right in the upright view');
      await T.pointer('pointerup', d3.end[0], d3.end[1], 71);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'forced landscape mid-run: the touch continues at once; back to portrait shows the prompt again'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: LANDSCAPE, hasTouch: true } });
    try {
      await T.key('Enter');
      await calm(T);
      await turn(T, PORTRAIT);
      t.eq(await T.overlay(), 'rotate');
      t.assert(has(await T.texts(), '가로 화면으로 바로 이어집니다'), 'the prompt says play goes on');
      const t0 = (await T.state()).t;
      await T.wait(300);
      t.eq((await T.state()).t, t0, 't held behind the prompt');
      await T.tapAt(640, 360);
      t.eq((await view(T)).forced, 'turn');
      t.eq(await T.overlay(), null, 'one touch: playing again');
      await T.wait(250);
      t.assert((await T.state()).t > t0, 'the clock runs');
      t.eq(await dashes(T), 0, 'no dash from the touch');
      // the window turns landscape, then portrait again: forced landscape ended, so the prompt is back
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), null);
      await turn(T, PORTRAIT);
      t.eq(await T.overlay(), 'rotate', 'a new portrait window asks again');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'forced landscape keeps the CSS-px stick, the re-grip rule and the phone-sized dash button (docs/CONTROLS-REVIEW.md §3.2, §3.3 c, §3.7)'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: PORTRAIT, hasTouch: true } });
    try {
      await T.tapAt(640, 360);
      t.eq((await view(T)).forced, 'turn');
      t.eq(await T.mode(), 'play');
      await calm(T);
      // a drag of `css` CSS px along the picture's rightward direction (down the glass when turned)
      const share = (css) => T.eval((css) => {
        const c = document.getElementById('bd'), v = window.__BD.ui.view;
        const a = v.toClient(500, 300), b = v.toClient(500 + css / v.scale, 300);
        const ev = (type, p) => c.dispatchEvent(new PointerEvent(type, { pointerId: 81, pointerType: 'touch', isPrimary: true, clientX: p[0], clientY: p[1], bubbles: true, cancelable: true }));
        ev('pointerdown', a); ev('pointermove', b);
        const i = window.BD.client.input.current();
        ev('pointerup', b); window.BD.client.input.clearDash();
        return { m: Math.hypot(i.mx, i.my), glass: [b[0] - a[0], b[1] - a[1]] };
      }, css);
      const r7 = await share(7), r30 = await share(30), r48 = await share(48);
      t.assert(Math.abs(r30.glass[1]) > 29 && Math.abs(r30.glass[0]) < 1, 'the drag runs along the glass\'s long side: ' + r30.glass);
      t.eq(r7.m, 0, '7 CSS px: dead zone');
      t.assert(r30.m >= 0.45 && r30.m <= 0.65, '30 CSS px: about half (' + r30.m + ')');
      t.assert(r48.m >= 0.99, '48 CSS px: full');
      // re-grip: a press 150 CSS px from the lift within 150 ms is no dash; 20 px is a double tap
      const regrip = (css) => T.eval(async (css) => {
        const c = document.getElementById('bd'), v = window.__BD.ui.view, B = window.__BD;
        const ev = (type, lx, ly) => { const p = v.toClient(lx, ly); c.dispatchEvent(new PointerEvent(type, { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: p[0], clientY: p[1], bubbles: true, cancelable: true })); };
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        B.world().hero.dashCd = 0; window.BD.client.input.clearDash();
        const n0 = B.events(400).filter((e) => e.event === 'dash').length;
        ev('pointerdown', 500, 300); ev('pointermove', 540, 300); await sleep(150); ev('pointerup', 540, 300);
        await sleep(120);
        const x2 = 540 + css / v.scale;
        ev('pointerdown', x2, 310); ev('pointermove', x2, 260); await sleep(150); ev('pointerup', x2, 260); await sleep(80);
        return B.events(400).filter((e) => e.event === 'dash').length > n0;
      }, css);
      t.eq(await regrip(150), false, 'turned: a re-grip 150 CSS px away is no dash');
      t.eq(await regrip(20), true, 'turned: a second press 20 CSS px from the lift dashes');
      // the dash button keeps its phone size in the turned picture
      const d = await T.eval(() => { const v = window.__BD.ui.view, b = window.__BD.ui.debug.buttons().find((x) => x.id === 'hud_dash'); return [b.w * v.scale, b.h * v.scale]; });
      t.assert(Math.min(...d) >= 72 - 0.01, 'dash touch square ≥ 72 CSS px when turned: ' + d);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'size re-read every frame (no resize event); a tall desktop window takes a click into an upright view'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: { width: 500, height: 760 } } });
    try {
      t.eq(await T.overlay(), 'rotate');
      // the browser reports landscape without firing resize
      await T.eval(() => {
        window.__real = { w: Object.getOwnPropertyDescriptor(window, 'innerWidth'), h: Object.getOwnPropertyDescriptor(window, 'innerHeight') };
        Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 760 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 500 });
      });
      await T.wait(200);
      t.eq(await T.overlay(), 'tap', 'the turn is noticed without a resize event');
      const seed = await T.eval(() => window.BD.ui.prep.seed);
      await T.eval(() => {
        const R = window.__real;
        if (R.w) Object.defineProperty(window, 'innerWidth', R.w); else delete window.innerWidth;
        if (R.h) Object.defineProperty(window, 'innerHeight', R.h); else delete window.innerHeight;
      });
      await T.wait(200);
      t.eq(await T.overlay(), 'rotate', 'and the turn back');
      await T.tapAt(640, 360, 'mouse');
      t.eq(await view(T), { forced: 'fit', rot: 0, portrait: false }, 'a mouse click keeps the picture upright, letterboxed');
      t.eq(await T.mode(), 'play', 'and starts');
      const st = await T.state();
      t.eq(st.seed, seed, 'the night dealt when the tap state opened');
      t.eq(st.cards.map((c) => c.id), await dealt(T, seed));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'turning the device at launch: 화면을 터치하면 시작 over the title → one tap starts a dealt run, no dash'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: PORTRAIT, hasTouch: true } });
    try {
      t.eq(await T.overlay(), 'rotate');
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap', 'back in landscape: the tap-to-start state');
      t.eq(await T.mode(), 'title', 'over the title, no preparation screen');
      t.eq((await view(T)).forced, null);
      const tx = await T.texts();
      t.assert(has(tx, '화면을 터치하면') && has(tx, '시작'), '화면을 터치하면 시작 drawn');
      t.assert(has(tx, '여명 전야'), 'over the title art');
      t.eq((await T.buttons()).filter((b) => b.layer === 'overlay').length, 0, 'no menu buttons in the tap state');
      // the hand shown is the one the preparation screen would deal: picked seed, saved depth, no reroll
      const prep = await T.eval(() => Object.assign({}, window.BD.ui.prep));
      t.eq(prep.rerolls, 0, 'no reroll spent');
      const hand = await dealt(T, prep.seed);
      const names = await T.eval((ids) => ids.map((id) => window.BD.cards.get(id).name), hand);
      for (const n of names) t.assert(has(tx, n), 'tap state shows dealt card ' + n);
      await T.wait(400);
      t.eq(await T.mode(), 'title', 'waits for the tap');
      // one tap, on the spot where play puts the dash button, then a drag 120 ms later
      const r = await tapThenPress(T, 1180, 620, 900, 300, 120);
      t.eq(r.stickOnPress, null, 'the press did not become the joystick');
      t.eq(r.after.mode, 'play', 'one tap starts the run');
      t.eq(r.after.overlay, null);
      t.eq(r.after.stick, null);
      t.eq(r.after.dashReq, false, 'no dash requested by the tap');
      t.assert(r.gapMs < 250, 'second press inside the double-tap window (' + Math.round(r.gapMs) + ' ms)');
      t.eq(r.dashReqOnSecond, false, 'the tap does not arm the double-tap dash');
      await T.wait(300);
      await T.pointer('pointerup', 0, 0, 62);
      const st = await T.state();
      t.eq(st.seed, prep.seed, 'the run uses the dealt seed');
      t.eq(st.tier, prep.tier, 'and the saved depth');
      t.eq(st.cards.map((c) => c.id), hand, 'the run uses the dealt hand');
      await checkHand(t, T, hand);
      t.assert(st.t > 0, 'the clock runs');
      t.eq(await dashes(T), 0, 'no dash event from the tap');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'turning the device mid-run: t held; 화면을 터치하면 계속; one tap resumes, no move, no dash'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: LANDSCAPE, hasTouch: true } });
    try {
      await T.key('Enter');
      t.eq(await T.mode(), 'play');
      await calm(T);
      // a drag released just before the phone turns (would arm a double tap)
      const d = await drag(T, 900, 260, 30, 0, 31, 40);
      await T.pointer('pointerup', d.end[0], d.end[1], 31);
      await turn(T, PORTRAIT);
      t.eq(await T.overlay(), 'rotate');
      const t0 = (await T.state()).t;
      await T.wait(300);
      t.eq((await T.state()).t, t0, 't held while portrait');
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap', 'back in landscape: tap to continue, not the pause menu');
      const tx = await T.texts();
      t.assert(has(tx, '화면을 터치하면') && has(tx, '계속'), '화면을 터치하면 계속 drawn');
      t.assert(!has(tx, '일시정지'), 'not the pause menu');
      t.eq((await T.state()).t, t0, 't held');
      await T.wait(500);
      t.eq((await T.state()).t, t0, 't still held while waiting for the tap');
      const h0 = await hero(T);
      // tap on the dash button's spot; nothing may move, then it runs
      const dashBtn = (await T.buttons()).find((b) => b.id === 'hud_dash');
      t.assert(dashBtn, 'dash button drawn under the tap state');
      await T.tapAt(dashBtn.x + dashBtn.w / 2, dashBtn.y + dashBtn.h / 2);
      t.eq(await T.overlay(), null, 'one tap resumes');
      t.eq(await stick(T), null, 'the tap did not become the joystick');
      await T.wait(250);
      t.assert((await T.state()).t > t0, 'the clock runs again');
      const h1 = await hero(T);
      t.assert(Math.hypot(h1.x - h0.x, h1.y - h0.y) < 0.01, 'the tap did not move the hero');
      t.eq(await dashes(T), 0, 'no dash: not the dash button, not a double tap');
      // tap again, then press within 250 ms: still no dash (the tap is not half a double tap)
      await turn(T, PORTRAIT); await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      const r = await tapThenPress(T, 640, 200, 640, 200, 100);
      t.eq(r.after.overlay, null);
      t.assert(r.gapMs < 250, 'second press inside the double-tap window (' + Math.round(r.gapMs) + ' ms)');
      t.eq(r.dashReqOnSecond, false, 'no double-tap dash');
      await T.wait(200);
      await T.pointer('pointerup', 0, 0, 62);
      t.eq(await dashes(T), 0);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'keys on the tap state: Space continues without a dash, Esc opens the menus; blur still pauses'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: LANDSCAPE, hasTouch: true } });
    try {
      await T.key('Enter');
      await calm(T);
      await turn(T, PORTRAIT); await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      await T.key('Escape');
      t.eq(await T.overlay(), 'pause', 'Esc on the tap state: the pause menu');
      await T.tap('resume');
      t.eq(await T.overlay(), null);
      await turn(T, PORTRAIT); await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      await T.key('Space');
      t.eq(await T.overlay(), null, 'Space continues');
      await T.wait(200);
      t.eq(await dashes(T), 0, 'Space on the tap state is not a dash');
      await T.eval(() => window.dispatchEvent(new Event('blur')));
      await T.wait();
      t.eq(await T.overlay(), 'pause', 'losing focus still opens the pause menu');
      // the pause menu stays the pause menu across a turn
      await turn(T, PORTRAIT);
      t.assert(has(await T.texts(), '가로 화면으로 봅니다'), 'the prompt says the touch only turns the view');
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'pause', 'a menu that was open stays open');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'title: Esc leaves the tap state for the menu; on the preparation screen the tap starts the shown night'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: PORTRAIT, hasTouch: true } });
    try {
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      await T.key('Escape');
      t.eq(await T.overlay(), null, 'Esc: the title menu');
      t.eq(await T.mode(), 'title');
      await T.key('Enter');
      t.eq(await T.mode(), 'prep', 'normal 출정 still opens the preparation screen');
      const seed = await T.eval(() => window.BD.ui.prep.seed);
      await turn(T, PORTRAIT);
      t.assert(has(await T.texts(), '가로 화면으로 바로 시작합니다'));
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      t.eq(await T.eval(() => window.BD.ui.prep.seed), seed, 'the preparation screen keeps its night');
      await T.tapAt(640, 360, 'mouse');
      t.eq(await T.mode(), 'play', 'a click starts it');
      const st = await T.state();
      t.eq(st.seed, seed);
      t.eq(st.cards.map((c) => c.id), await dealt(T, seed));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },
};
