// Keyboard and touch/mouse input (GDD §2.1, docs/CONTROLS-REVIEW.md §3.2–3.3).
// - WASD/arrows move (screen directions), Space/Shift dash, Esc/P pause, Enter/1-4/arrows menus
// - pointer drag anywhere = floating joystick, sized in CSS px so the thumb travel is the same on
//   every screen: dead zone 8, full speed at 48 (linear between), the origin follows the finger
//   past 64; touches starting on a UI button never become the stick. Mouse drags alike.
// - double tap = dash: a new press within 250 ms of the last release AND within 60 CSS px of where
//   that finger lifted (a re-grip somewhere else is only a new stick). The core picks the direction
//   (this tick's input, else the last way the hero walked) and buffers the press for 0.2 s.
// - a dash request is dropped when an overlay opens (pause, altar, rotate, …) or the window blurs,
//   and a Space pressed while one is open is not a dash.
// Stick positions are logical px (they are drawn there); lengths are compared in CSS px
// (logical × view.scale — the forced-landscape quarter turn keeps lengths); the double-tap
// distance uses client px directly. Output: input.current() → {mx, my, dash} in world axes.
// st.refusedAt (ui.time): the last dash request the buffer cannot save (cooldown > DASH.buffer);
// the HUD shakes the dash button for it.

const IN = BD.client.input = {};
const DEAD = 8, FULL = 48, FOLLOW = 64, TAP_NEAR = 60, DOUBLE_TAP = 0.25; // CSS px, s
IN.SIZES = { DEAD, FULL, FOLLOW, TAP_NEAR, DOUBLE_TAP };

IN.attach = function (canvas, ui) {
  const keys = new Set();
  const st = IN.st = { stick: null, lastUp: -1, upX: 0, upY: 0, dashReq: false, pressBtn: null, refusedAt: -1 };
  const view = ui.view;
  const now = () => performance.now() / 1000;

  const moveKeys = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

  window.addEventListener('keydown', (ev) => {
    ui.unlockAudio();
    if (ev.repeat && !moveKeys[ev.code]) return;
    if (ui.key(ev)) { ev.preventDefault(); return; }
    if (moveKeys[ev.code]) { keys.add(ev.code); ev.preventDefault(); }
    if (ev.code === 'Space' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') {
      if (ui.app.mode === 'play' && !ui.app.overlay()) st.dashReq = true; // not a dash while a menu is up
      ev.preventDefault();
    }
    if (ev.code === 'Escape' || ev.code === 'KeyP') {
      const app = ui.app;
      if (app.uiOverlay === 'pause') app.resume(); else app.pause();
      ev.preventDefault();
    }
  });
  window.addEventListener('keyup', (ev) => { keys.delete(ev.code); });
  // iOS Safari starts audio only from touchend/click (see 50_audio.js)
  window.addEventListener('touchend', () => ui.unlockAudio(), { passive: true });
  window.addEventListener('click', () => ui.unlockAudio());
  window.addEventListener('blur', () => { keys.clear(); IN.clearDash(); });

  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return view.toLogical(ev.clientX - r.left, ev.clientY - r.top); };

  canvas.addEventListener('pointerdown', (ev) => {
    ui.unlockAudio();
    try { canvas.setPointerCapture(ev.pointerId); } catch (err) { /* synthetic pointer */ }
    const [x, y] = pos(ev);
    const b = ui.hitButton(x, y);
    if (b) { st.pressBtn = { b, id: ev.pointerId }; if (b.onPress) b.onPress(); ev.preventDefault(); return; }
    if (ui.pointer({ type: 'down', x, y, id: ev.pointerId })) { st.custom = ev.pointerId; ev.preventDefault(); return; }
    if (ui.app.mode !== 'play' || ui.app.overlay()) return;
    if (st.stick) return;
    const t = now();
    const near = Math.hypot(ev.clientX - st.upX, ev.clientY - st.upY) <= TAP_NEAR;
    if (st.lastUp >= 0 && t - st.lastUp <= DOUBLE_TAP && near) st.dashReq = true;
    st.stick = { id: ev.pointerId, ox: x, oy: y, x, y };
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (st.custom === ev.pointerId) { const [x, y] = pos(ev); ui.pointer({ type: 'move', x, y, id: ev.pointerId }); return; }
    const s = st.stick;
    if (!s || s.id !== ev.pointerId) return;
    const [x, y] = pos(ev);
    s.x = x; s.y = y;
    const dx = x - s.ox, dy = y - s.oy, d = Math.sqrt(dx * dx + dy * dy), follow = FOLLOW / view.scale;
    if (d > follow) { s.ox = x - (dx / d) * follow; s.oy = y - (dy / d) * follow; }
    ev.preventDefault();
  });
  const up = (ev) => {
    if (st.custom === ev.pointerId) { st.custom = null; const [x, y] = pos(ev); ui.pointer({ type: 'up', x, y, id: ev.pointerId }); return; }
    if (st.pressBtn && st.pressBtn.id === ev.pointerId) {
      const [x, y] = pos(ev);
      const b = st.pressBtn.b;
      st.pressBtn = null;
      if (b.onTap && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { ui.sfxSafe('ui_ok'); b.onTap(); }
      return;
    }
    const s = st.stick;
    if (!s || s.id !== ev.pointerId) return;
    st.stick = null;
    st.lastUp = now(); st.upX = ev.clientX; st.upY = ev.clientY;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  IN.current = function () {
    let sx = 0, sy = 0, mag = 0;
    const s = st.stick;
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.sqrt(dx * dx + dy * dy), css = d * view.scale;
      if (css > DEAD) { sx = dx / d; sy = dy / d; mag = Math.min(1, (css - DEAD) / (FULL - DEAD)); }
    } else {
      for (const k of keys) { sx += moveKeys[k][0]; sy += moveKeys[k][1]; }
      if (sx || sy) mag = 1;
    }
    let mx = 0, my = 0;
    if (mag > 0) { const [wx, wy] = view.screenDirToWorld(sx, sy); mx = wx * mag; my = wy * mag; }
    // the direction of an idle dash is the core's (the last way the hero walked)
    const dash = st.dashReq;
    if (dash) { const w = ui.app.world; if (w && w.hero.dashCd > BD.C.DASH.buffer) st.refusedAt = ui.time; }
    return { mx, my, dash };
  };
  IN.consumeDash = function () { st.dashReq = false; };
  // drop a pending dash request and the double-tap timer (overlays, blur, the tap-to-play state)
  IN.clearDash = function () { st.dashReq = false; st.lastUp = -1; };
  IN.stick = () => st.stick;
};
