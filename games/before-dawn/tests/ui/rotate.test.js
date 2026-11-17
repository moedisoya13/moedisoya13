// After the rotate prompt, one touch gets the player playing (the user's ask: "화면 회전 안내 이후
// 터치하면 자동 시작"). Phone sizes, synthetic touch pointers:
// - launch in portrait 375×667 → rotate prompt (says it will start) → landscape 667×375 →
//   화면을 터치하면 시작 → one tap → play, with the hand the preparation screen would deal
// - mid-run: portrait → landscape → 화면을 터치하면 계속 (t held) → one tap → play
// - the tap is never a move, a dash-button press or half of a double-tap dash
// - Esc on the tap state opens the menus; blur still pauses; the preparation screen's own hand
'use strict';
const H = require('./_harness');

const PORTRAIT = { width: 375, height: 667 };
const LANDSCAPE = { width: 667, height: 375 };
const has = (arr, s) => arr.some((x) => x === s);
const dashes = (T) => T.eval(() => window.__BD.events(400).filter((e) => e.event === 'dash').length);
const stick = (T) => T.eval(() => window.BD.client.input.stick());
const hero = (T) => T.eval(() => { const h = window.__BD.world().hero; return { x: h.x, y: h.y }; });
const turn = async (T, size) => { await T.page.setViewportSize(size); await T.wait(250); };

// One tap at logical (x, y) and, `gap` ms after its release, a new press that drags — all in the
// page so the second press is surely inside the 250 ms double-tap window. Returns the measured gap
// and what the app looked like between the two.
const tapThenPress = (T, x, y, x2, y2, gap) => T.eval(([x, y, x2, y2, gap]) => new Promise((done) => {
  const c = document.getElementById('bd'), v = window.__BD.ui.view;
  const fire = (type, lx, ly, id) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: v.offX + lx * v.scale, clientY: v.offY + ly * v.scale, bubbles: true, cancelable: true }));
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

// the GDD §5.6 starting-hand rule, checked on the ids
const handRules = (T, hand) => T.eval((hand) => {
  const fam = (id) => window.BD.cards.get(id).family;
  return {
    n: hand.length, distinct: new Set(hand).size,
    conditional: hand.filter((id) => ['quest', 'combo'].includes(fam(id))).length,
    shapeOrElement: hand.filter((id) => ['shape', 'element'].includes(fam(id))).length,
  };
}, hand);

module.exports = {
  async 'launch in portrait → rotate prompt → 화면을 터치하면 시작 → one tap starts a dealt run, no dash'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: PORTRAIT, hasTouch: true } });
    try {
      t.eq(await T.mode(), 'title');
      t.eq(await T.overlay(), 'rotate', 'portrait at launch: the rotate prompt');
      const rt = await T.texts();
      for (const s of ['화면을 가로로', '돌려 주세요', '돌린 뒤 화면을 터치하면', '바로 시작합니다']) t.assert(has(rt, s), 'rotate prompt says: ' + s);
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap', 'back in landscape: the tap-to-start state');
      t.eq(await T.mode(), 'title', 'over the title, no preparation screen');
      const tx = await T.texts();
      t.assert(has(tx, '화면을 터치하면') && has(tx, '시작'), '화면을 터치하면 시작 drawn');
      t.assert(has(tx, '여명 전야'), 'over the title art');
      t.eq((await T.buttons()).filter((b) => b.layer === 'overlay').length, 0, 'no menu buttons in the tap state');
      // the hand shown is the one the preparation screen would deal: picked seed, saved depth, no reroll
      const prep = await T.eval(() => Object.assign({}, window.BD.ui.prep));
      t.eq(prep.rerolls, 0, 'no reroll spent');
      const dealt = await T.eval((p) => window.BD.cardRt.dealHand(p.seed, window.__BD.app.save.unlocked, 0), prep);
      const names = await T.eval((ids) => ids.map((id) => window.BD.cards.get(id).name), dealt);
      for (const n of names) t.assert(has(tx, n), 'tap state shows dealt card ' + n);
      await T.wait(400);
      t.eq(await T.mode(), 'title', 'waits for the tap');
      t.eq(await T.overlay(), 'tap');
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
      const hand = st.cards.map((c) => c.id);
      t.eq(hand, dealt, 'the run uses the dealt hand');
      t.eq(await handRules(T, hand), { n: 3, distinct: 3, conditional: Math.min(1, (await handRules(T, hand)).conditional), shapeOrElement: (await handRules(T, hand)).shapeOrElement });
      const rules = await handRules(T, hand);
      t.assert(rules.n === 3 && rules.distinct === 3 && rules.conditional <= 1 && rules.shapeOrElement >= 1, 'GDD §5.6 hand: ' + JSON.stringify(rules));
      t.assert(st.t > 0, 'the clock runs');
      t.eq(await dashes(T), 0, 'no dash event from the tap');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'mid-run: portrait holds t; landscape shows 화면을 터치하면 계속; one tap resumes, no move, no dash'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce&mute=1&nosave=1', context: { viewport: LANDSCAPE, hasTouch: true } });
    try {
      await T.key('Enter');
      t.eq(await T.mode(), 'play');
      await T.eval(() => { const B = window.__BD, w = B.world(); B.killAll(); w.wave.n = 3; w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2; });
      // a drag released just before the phone turns (would arm a double-tap)
      const [x0, y0] = await T.client(900, 260);
      await T.pointer('pointerdown', x0, y0, 31); await T.pointer('pointermove', x0 + 30, y0, 31); await T.wait(60);
      await T.pointer('pointerup', x0 + 30, y0, 31);
      await turn(T, PORTRAIT);
      t.eq(await T.overlay(), 'rotate');
      const rt = await T.texts();
      t.assert(has(rt, '화면을 가로로') && has(rt, '바로 이어집니다'), 'rotate prompt says play goes on');
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
      // tap on the dash button's spot; check right away that nothing moved, then let it run
      const dashBtn = (await T.buttons()).find((b) => b.id === 'hud_dash');
      t.assert(dashBtn, 'dash button drawn under the tap state');
      await T.tapAt(dashBtn.x + dashBtn.w / 2, dashBtn.y + dashBtn.h / 2);
      t.eq(await T.overlay(), null, 'one tap resumes');
      t.eq(await stick(T), null, 'the tap did not become the joystick');
      await T.wait(250);
      const s1 = await T.state();
      t.assert(s1.t > t0, 'the clock runs again');
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
      await T.eval(() => { const B = window.__BD, w = B.world(); B.killAll(); w.wave.n = 3; });
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
      await turn(T, PORTRAIT); await turn(T, LANDSCAPE);
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
      t.assert(has(await T.texts(), '바로 시작합니다'));
      await turn(T, LANDSCAPE);
      t.eq(await T.overlay(), 'tap');
      t.eq(await T.eval(() => window.BD.ui.prep.seed), seed, 'the preparation screen keeps its night');
      await T.tapAt(640, 360, 'mouse');
      t.eq(await T.mode(), 'play', 'a click starts it');
      const st = await T.state();
      t.eq(st.seed, seed);
      t.eq(st.cards.map((c) => c.id), await T.eval((s) => window.BD.cardRt.dealHand(s, window.__BD.app.save.unlocked, 0), seed));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },
};
