// Keyboard and touch/mouse input (GDD §2.1).
// - WASD/arrows move (screen directions), Space/Shift dash, Esc/P pause, Enter/1-4/arrows menus
// - pointer drag anywhere = floating joystick: dead zone 12px, full speed at 40px, origin
//   follows the finger past 60px; touches starting on a UI button never become the stick
// - double tap (new press within 250 ms of the last release) = dash in the last direction
// All distances are logical px. Output: input.current() → {mx, my, dash} in world axes.

const IN = BD.client.input = {};
const DEAD = 12, FULL = 40, FOLLOW = 60, DOUBLE_TAP = 0.25;

IN.attach = function (canvas, ui) {
  const keys = new Set();
  const st = IN.st = { stick: null, lastDir: [0, 0], lastUp: -1, dashReq: false, pressBtn: null };
  const view = ui.view;
  const now = () => performance.now() / 1000;

  const moveKeys = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

  window.addEventListener('keydown', (ev) => {
    ui.unlockAudio();
    if (ev.repeat && !moveKeys[ev.code]) return;
    if (ui.key(ev)) { ev.preventDefault(); return; }
    if (moveKeys[ev.code]) { keys.add(ev.code); ev.preventDefault(); }
    if (ev.code === 'Space' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') { st.dashReq = true; ev.preventDefault(); }
    if (ev.code === 'Escape' || ev.code === 'KeyP') {
      const app = ui.app;
      if (app.uiOverlay === 'pause') app.resume(); else app.pause();
      ev.preventDefault();
    }
  });
  window.addEventListener('keyup', (ev) => { keys.delete(ev.code); });
  window.addEventListener('blur', () => keys.clear());

  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return view.toLogical(ev.clientX - r.left, ev.clientY - r.top); };

  canvas.addEventListener('pointerdown', (ev) => {
    ui.unlockAudio();
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    const [x, y] = pos(ev);
    const b = ui.hitButton(x, y);
    if (b) { st.pressBtn = { b, id: ev.pointerId }; if (b.onPress) b.onPress(); ev.preventDefault(); return; }
    if (ui.app.mode !== 'play' || ui.app.overlay()) return;
    if (st.stick) return;
    const t = now();
    if (st.lastUp >= 0 && t - st.lastUp <= DOUBLE_TAP) st.dashReq = true; // direction: last move dir
    st.stick = { id: ev.pointerId, ox: x, oy: y, x, y };
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    const s = st.stick;
    if (!s || s.id !== ev.pointerId) return;
    const [x, y] = pos(ev);
    s.x = x; s.y = y;
    const dx = x - s.ox, dy = y - s.oy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > FOLLOW) { s.ox = x - (dx / d) * FOLLOW; s.oy = y - (dy / d) * FOLLOW; }
    ev.preventDefault();
  });
  const up = (ev) => {
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
    st.lastUp = now();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  IN.current = function () {
    let sx = 0, sy = 0, mag = 0;
    const s = st.stick;
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > DEAD) { sx = dx / d; sy = dy / d; mag = Math.min(1, (d - DEAD) / (FULL - DEAD)); }
    } else {
      for (const k of keys) { sx += moveKeys[k][0]; sy += moveKeys[k][1]; }
      if (sx || sy) mag = 1;
    }
    let mx = 0, my = 0;
    if (mag > 0) { const [wx, wy] = view.screenDirToWorld(sx, sy); mx = wx * mag; my = wy * mag; st.lastDir = [wx, wy]; }
    let dash = false;
    if (st.dashReq) { dash = true; if (!mag) { mx = st.lastDir[0] * 0.02; my = st.lastDir[1] * 0.02; } }
    return { mx, my, dash };
  };
  IN.consumeDash = function () { st.dashReq = false; };
  IN.stick = () => st.stick;
};
