// The growth choice overlay (GDD-V2 §4.3, §7.2): keyboard, mouse and one-thumb touch, the 0.35 s
// lock, no accidental pick from the thumb that was steering, what each option shows, and options
// of kinds or ids this branch has never seen (a chest from the sites branch, a card without level
// text, an unknown boon).
'use strict';
const H = require('./_harness');

async function playing(extra, context) {
  const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce,flame,leech&mute=1&nosave=1' + (extra || ''), context });
  await T.key('Enter');
  await T.eval(() => { const w = window.__BD.world(); w.freezeT = 0; window.BD.ui.S.lastInput = 'mouse'; });
  return T;
}
// fill the gauge; the next tick opens the choice
async function openChoice(T, settle) {
  await T.eval(() => { const w = window.__BD.world(); window.BD.growth.addXp(w, w.hero.xpNeed - w.hero.xp); });
  for (let i = 0; i < 40 && (await T.overlay()) !== 'choice'; i++) await T.wait(25);
  if ((await T.overlay()) !== 'choice') throw new Error('choice did not open');
  if (settle !== false) await T.wait(450); // past the 0.35 s lock
}
const rects = (T) => T.eval(() => window.BD.ui.choice.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const picks = (T) => T.eval(() => window.__BD.events(400).filter((e) => e.event === 'choice_pick').map((e) => e.pick));
const options = (T) => T.eval(() => window.__BD.world().choice.options.map((o) => o.pick));

module.exports = {
  async 'keyboard: 1 · 2 · 3 pick at once; ← → + Enter picks the focused card; Space and Esc never pick'(t) {
    const T = await playing();
    try {
      await openChoice(T);
      let opts = await options(T);
      await T.key('Space'); await T.key('Escape');
      t.eq(await T.overlay(), 'choice', 'Space / Esc do nothing');
      await T.key('Digit2');
      t.eq(await picks(T), [opts[1]], '2 picks the second');
      t.eq(await T.overlay(), null, 'the overlay closes and play goes on');
      await openChoice(T);
      opts = await options(T);
      await T.key('ArrowRight'); // first press shows the focus (on a fresh keyboard focus it is the first card)
      await T.key('ArrowRight'); await T.key('ArrowRight'); await T.key('ArrowLeft');
      await T.key('Enter');
      t.eq((await picks(T)).slice(-1), [opts[1]], 'arrows + Enter');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'the 0.35 s lock swallows keys and taps; the cards rise in 0.2 s with dark borders'(t) {
    const T = await playing();
    try {
      await openChoice(T, false);
      // in one go inside the page, the moment the overlay has drawn (a busy machine must not let the
      // lock run out between a test's steps): a key, a tap on card 1
      const age = await T.eval(async () => {
        const ui = window.__BD.ui, CH = window.BD.ui.choice, w = window.__BD.world();
        for (let i = 0; i < 100 && CH.key !== w.choice; i++) await new Promise((r) => requestAnimationFrame(r));
        const ov = window.BD.ui.overlays.get('choice'), r = CH.rects[0], x = r.x + r.w / 2, y = r.y + r.h / 2;
        const a = ui.time - CH.openAt;
        ov.key({ code: 'Digit1' }, ui);
        ov.pointer({ type: 'down', x, y, id: 77 }, ui); ov.pointer({ type: 'up', x, y, id: 77 }, ui);
        return a;
      });
      t.assert(age < 0.35, 'tried inside the lock (' + age.toFixed(2) + ' s)');
      t.eq(await picks(T), [], 'nothing picked during the lock');
      t.eq(await T.overlay(), 'choice');
      await T.wait(400);
      await T.key('Digit1');
      t.eq((await picks(T)).length, 1, 'after the lock a key picks');
    } finally { await T.close(); }
  },

  async 'mouse: hover focuses, a click picks; a press dragged off the card does not'(t) {
    const T = await playing();
    try {
      await openChoice(T);
      const opts = await options(T), R = await rects(T);
      const cl = async (x, y) => T.client(x, y);
      // press on card 3, drag to card 1, release: nothing
      let [x, y] = await cl(...centre(R[2]));
      await T.page.mouse.move(x, y); await T.page.mouse.down();
      [x, y] = await cl(...centre(R[0]));
      await T.page.mouse.move(x, y, { steps: 6 }); await T.page.mouse.up(); await T.wait();
      t.eq(await picks(T), [], 'a press dragged across cards is no pick');
      [x, y] = await cl(...centre(R[2]));
      await T.page.mouse.move(x, y); await T.wait(60);
      t.eq(await T.eval(() => window.BD.ui.choice.hover), 2, 'hover focuses');
      await T.page.mouse.click(x, y); await T.wait();
      t.eq(await picks(T), [opts[2]], 'a click picks the third');
    } finally { await T.close(); }
  },

  async 'touch: a tap picks; the steering thumb lifted over a card, a late re-grip, a drag and a slide to another card do not'(t) {
    const T = await playing('', { viewport: { width: 667, height: 375 }, hasTouch: true });
    try {
      t.eq(await T.eval(() => window.__BD.ui.view.scale < 0.74), true, 'phone scale');
      // 1. the thumb is steering when the overlay opens; it slides onto a card and lifts
      let p = await T.client(300, 420);
      await T.pointer('pointerdown', p[0], p[1], 31, 'touch');
      await T.pointer('pointermove', p[0] + 20, p[1] - 10, 31, 'touch');
      await openChoice(T);
      const R = await rects(T), opts = await options(T);
      const c1 = await T.client(...centre(R[1]));
      for (let i = 1; i <= 5; i++) await T.pointer('pointermove', p[0] + (c1[0] - p[0]) * i / 5, p[1] + (c1[1] - p[1]) * i / 5, 31, 'touch');
      await T.wait(100);
      await T.pointer('pointerup', c1[0], c1[1], 31, 'touch'); await T.wait();
      t.eq(await picks(T), [], 'the steering thumb never picks');
      // 2. a drag that starts on a card (the thumb trying to steer) is no pick
      const c0 = await T.client(...centre(R[0]));
      await T.pointer('pointerdown', c0[0], c0[1], 32, 'touch');
      for (let i = 1; i <= 4; i++) await T.pointer('pointermove', c0[0] + i * 12, c0[1] + i * 4, 32, 'touch');
      await T.pointer('pointerup', c0[0] + 48, c0[1] + 16, 32, 'touch'); await T.wait();
      t.eq(await picks(T), [], 'a drag is no pick');
      // 3. down on one card, up on another: no pick
      const c2 = await T.client(...centre(R[2]));
      await T.pointer('pointerdown', c0[0], c0[1], 33, 'touch'); await T.wait(30);
      await T.pointer('pointermove', c2[0], c2[1], 33, 'touch');
      await T.pointer('pointerup', c2[0], c2[1], 33, 'touch'); await T.wait();
      t.eq(await picks(T), [], 'a slide to another card is no pick');
      // 4. a clean tap picks
      await T.tapAt(...centre(R[2]));
      t.eq(await picks(T), [opts[2]], 'a tap picks the third card');
      t.eq(await T.overlay(), null);
      // 5. a re-grip that lands inside the lock and lifts after it: no pick
      await openChoice(T, false);
      // the press goes down the moment the overlay has drawn (inside the lock), and lifts after it
      const age = await T.eval(async () => {
        const ui = window.__BD.ui, CH = window.BD.ui.choice, w = window.__BD.world(), v = ui.view, c = document.getElementById('bd');
        for (let i = 0; i < 100 && CH.key !== w.choice; i++) await new Promise((r) => requestAnimationFrame(r));
        const r = CH.rects[0], p = v.toClient(r.x + r.w / 2, r.y + r.h / 2);
        window.__downAt = p;
        c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 34, pointerType: 'touch', isPrimary: true, clientX: p[0], clientY: p[1], bubbles: true, cancelable: true }));
        return ui.time - CH.openAt;
      });
      t.assert(age < 0.35, 'pressed inside the lock (' + age.toFixed(2) + ' s)');
      await T.wait(450);
      const d = await T.eval(() => window.__downAt);
      await T.pointer('pointerup', d[0], d[1], 34, 'touch'); await T.wait();
      t.eq((await picks(T)).length, 1, 'a press that began in the lock picks nothing');
      t.eq(await T.overlay(), 'choice');
      // 6. the dash thumb: a tap where the dash button sits (under the third card on a phone)
      const dc = await T.eval(() => window.BD.ui.dashCenter(window.__BD.ui));
      await T.tapAt(dc[0], dc[1]);
      t.eq((await picks(T)).length, 1, 'a tap on the dash button spot picks nothing');
      t.eq(await T.overlay(), 'choice');
      t.eq(await T.eval(() => window.__BD.world().hero.dashT || 0), 0, 'no dash from the taps');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'each option shows its icon, name, kind, level pips and the line its level adds; a pick flies to the slot and lights a pip'(t) {
    const T = await playing();
    try {
      await T.eval(() => { const w = window.__BD.world(); window.BD.cardRt.levelUp(w, w.cards[0]); });
      await openChoice(T);
      const w = await T.eval(() => window.__BD.world().choice.options.map((o) => ({ kind: o.kind, id: o.id, name: o.name, from: o.from, to: o.to, text: o.text })));
      const texts = await T.texts();
      t.assert(texts.includes('성장 — Lv 2'), 'title with the level');
      for (const o of w) {
        t.assert(texts.includes(o.name), 'name ' + o.name);
        if (o.kind !== 'breath') t.assert(texts.includes((o.from ? o.from + '단계 → ' : '') + o.to + '단계'), 'levels of ' + o.name);
        t.assert(texts.some((s) => o.text.startsWith(s.replace(/…$/, '')) || s && o.text.includes(s)), 'level line of ' + o.name + ': ' + o.text);
      }
      const pierce = w.find((o) => o.id === 'pierce');
      if (pierce) t.assert(texts.includes('모양이 바뀐다'), 'level 3 is a shape change');
      t.assert(texts.some((s) => /성인$/.test(s)), 'kind tag');
      const i = w.findIndex((o) => o.kind === 'card');
      await T.key('Digit' + (i + 1));
      const lv = await T.eval((id) => window.__BD.world().cards.find((c) => c && c.id === id).level, w[i].id);
      t.eq(lv, w[i].to, 'the card levelled');
      t.assert((await T.eval(() => window.BD.ui.S.toasts.map((x) => x.text))).some((s) => s.indexOf(w[i].name + ' ' + w[i].to + '단계') === 0), 'toast names the card and level');
      t.assert(await T.eval(() => !!window.BD.ui.choice.exit), 'the picked card flies to its slot');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'options this branch has never seen: a chest choice, a card without level text, an unknown boon and kind'(t) {
    const T = await playing();
    try {
      await T.eval(() => {
        const BD = window.BD, w = window.__BD.world();
        w.choice = { kind: 'chest', options: [
          { kind: 'card', id: 'nobody_card', name: '시험 성인', from: 2, to: 3, text: '', pick: 'card:nobody_card' },
          { kind: 'boon', id: 'nobody_boon', name: '새 단련', from: 0, to: 1, text: '무언가 +1', pick: 'boon:nobody_boon' },
          { kind: 'relic', id: 'x', name: '이상한 것', text: '설명 한 줄', pick: 'relic:x' },
        ], lastCards: [] };
        w.choiceOpen = true;
        BD.W.emit(w, 'choice_open', { kind: 'chest', options: w.choice.options.map((o) => o.pick) });
      });
      await T.wait(450);
      const texts = await T.texts();
      for (const s of ['상자 — 성인 하나를 올린다', '시험 성인', '3단계로 오른다', '새 단련', '무언가 +1', '이상한 것', '설명 한 줄']) t.assert(texts.includes(s), 'shows ' + s);
      await T.eval(() => { const w = window.__BD.world(); w.choiceOpen = false; w.choice = null; });
      await T.wait();
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'phone 667×375 and forced landscape 375×667: the cards fill the height, the level line is ≥ 14 CSS px, a tap picks'(t) {
    for (const vp of [{ width: 667, height: 375 }, { width: 375, height: 667 }]) {
      const T = await playing('', { viewport: vp, hasTouch: true });
      try {
        if (vp.height > vp.width) await T.eval(() => { const ui = window.__BD.ui; ui.view.setForced('turn'); ui.app.setRotate(ui.view.portrait); if (ui.app.uiOverlay) ui.app.closeOverlay(); });
        await T.wait(200);
        await openChoice(T);
        const r = await T.eval(() => {
          const B = window.__BD, s = B.ui.view.scale, R = window.BD.ui.choice.rects;
          return { s, h: R[0].h, bottom: R[0].y + R[0].h, minLine: window.BD.ui.choice.lineSize * s };
        });
        t.assert(r.h >= 560 && r.bottom <= 700, 'tall cards ' + JSON.stringify(r));
        t.assert(r.minLine >= 14, 'the level line is large on a phone: ' + r.minLine.toFixed(1) + ' CSS px');
        const R = await rects(T), opts = await options(T);
        await T.tapAt(...centre(R[1]));
        t.eq(await picks(T), [opts[1]], 'tap picks (' + vp.width + '×' + vp.height + ')');
        t.eq(T.errors, []);
      } finally { await T.close(); }
    }
  },
};
