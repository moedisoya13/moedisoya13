// ─────────────────────────────────────────────────────────────
// Input — floating virtual joystick (touch anywhere), interaction &
// honey buttons, plus keyboard for desktop testing.
// All coordinates are in low-res pixels.
// ─────────────────────────────────────────────────────────────

const Input = {
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, mag: 0 },
  JOY_R: 20,
  keys: Object.create(null),
  btn: { act: { down: false, pressed: false, released: false, id: null }, honey: { down: false, pressed: false, released: false, id: null } },
  layout: { act: null, honey: null },  // set by the HUD every frame: {x,y,r,enabled}
  taps: [],
  anyKeyTap: false,

  init() {
    const cv = Screen.cv;
    const opts = { passive: false };
    cv.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    // stop iOS scroll / zoom / callout
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    cv.addEventListener('touchstart', stop, opts);
    cv.addEventListener('touchmove', stop, opts);
    cv.addEventListener('touchend', stop, opts);
    document.addEventListener('gesturestart', stop, opts);
    cv.addEventListener('contextmenu', stop);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
  },

  toLo(e) {
    const r = Screen.cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * Screen.dpr) / Screen.S, y: ((e.clientY - r.top) * Screen.dpr) / Screen.S };
  },
  hitBtn(name, p) {
    const b = this.layout[name];
    if (!b || !b.visible) return false;
    return dist(p.x, p.y, b.x, b.y) <= b.r + 7;
  },

  onDown(e) {
    if (e.cancelable) e.preventDefault();
    Sfx.init();
    const p = this.toLo(e);
    this.taps.push({ x: p.x, y: p.y, id: e.pointerId });
    for (const name of ['act', 'honey']) {
      if (this.hitBtn(name, p)) {
        const b = this.btn[name];
        b.down = true; b.pressed = true; b.id = e.pointerId;
        return;
      }
    }
    const j = this.joy;
    if (!j.active) {
      j.active = true; j.id = e.pointerId; j.ox = p.x; j.oy = p.y; j.x = p.x; j.y = p.y; j.vx = 0; j.vy = 0; j.mag = 0;
    }
  },
  onMove(e) {
    const j = this.joy;
    if (j.active && e.pointerId === j.id) {
      if (e.cancelable) e.preventDefault();
      const p = this.toLo(e);
      j.x = p.x; j.y = p.y;
      let dx = j.x - j.ox, dy = j.y - j.oy;
      const d = Math.hypot(dx, dy), R = this.JOY_R;
      if (d > R) { // floating base follows the thumb
        j.ox = j.x - (dx / d) * R; j.oy = j.y - (dy / d) * R;
        dx = j.x - j.ox; dy = j.y - j.oy;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      j.mag = m < 0.18 ? 0 : m;
      const dd = Math.hypot(dx, dy) || 1;
      j.vx = (dx / dd) * j.mag; j.vy = (dy / dd) * j.mag;
    }
  },
  onUp(e) {
    const j = this.joy;
    if (j.active && e.pointerId === j.id) { j.active = false; j.id = null; j.vx = 0; j.vy = 0; j.mag = 0; }
    for (const name of ['act', 'honey']) {
      const b = this.btn[name];
      if (b.down && b.id === e.pointerId) { b.down = false; b.released = true; b.id = null; }
    }
  },
  onKey(e, down) {
    const k = e.key.toLowerCase();
    const map = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
    if (map[k]) { this.keys[map[k]] = down; e.preventDefault(); }
    if (k === ' ' || k === 'e' || k === 'enter') {
      e.preventDefault();
      const b = this.btn.act;
      if (down && !b.down) { b.pressed = true; this.anyKeyTap = true; Sfx.init(); }
      if (!down && b.down) b.released = true;
      b.down = down;
    }
    if (k === 'q' || k === 'h') {
      const b = this.btn.honey;
      if (down && !b.down) b.pressed = true;
      if (!down && b.down) b.released = true;
      b.down = down;
    }
  },
  reset() {
    this.keys = Object.create(null);
    const j = this.joy; j.active = false; j.vx = 0; j.vy = 0; j.mag = 0;
    for (const b of Object.values(this.btn)) { b.down = false; b.pressed = false; b.released = false; }
  },

  // movement vector: joystick first, keyboard otherwise
  vector() {
    const j = this.joy;
    if (j.active && j.mag > 0) return { x: j.vx, y: j.vy, mag: j.mag };
    const k = this.keys;
    const x = (k.r ? 1 : 0) - (k.l ? 1 : 0), y = (k.d ? 1 : 0) - (k.u ? 1 : 0);
    if (!x && !y) return { x: 0, y: 0, mag: 0 };
    const d = Math.hypot(x, y);
    return { x: x / d, y: y / d, mag: 1 };
  },
  // "anything pressed" for menus / rhythm taps
  tapped() { return this.taps.length > 0 || this.anyKeyTap; },
  endFrame() {
    this.taps.length = 0; this.anyKeyTap = false;
    for (const b of Object.values(this.btn)) { b.pressed = false; b.released = false; }
  },
};
