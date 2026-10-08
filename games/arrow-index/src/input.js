// ── 입력: 떠다니는 조이스틱 + 모서리 버튼 + 키보드 ─────────────────────
const Input = {
  ptrs: new Map(),
  joy: null,          // { id, bx, by, x, y }  (기기 픽셀)
  keys: {},
  buyId: null,
  lastTouchY: null,

  init(cv) {
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
    };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.unlock();
      if (G.state !== 'play') return;
      const [x, y] = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      const pad = 8 * View.U;
      const hit = (r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
      if (hit(HUD.buyRect())) {
        this.ptrs.set(e.pointerId, { role: 'buy' });
        this.buyId = e.pointerId;
        HUD.buyDown();
        Haptic.tap();
        return;
      }
      if (hit(HUD.sellRect())) {
        this.ptrs.set(e.pointerId, { role: 'sell' });
        HUD.sellDown();
        Haptic.tap();
        return;
      }
      if (hit(HUD.pauseRect())) {
        this.ptrs.set(e.pointerId, { role: 'pause' });
        return;
      }
      if (!this.joy) {
        this.joy = { id: e.pointerId, bx: x, by: y, x, y, t: 0 };
        this.ptrs.set(e.pointerId, { role: 'joy' });
      } else this.ptrs.set(e.pointerId, { role: 'none' });
    }, { passive: false });

    cv.addEventListener('pointermove', e => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      if (p.role === 'joy' && this.joy && this.joy.id === e.pointerId) {
        const [x, y] = pos(e);
        const j = this.joy;
        j.x = x; j.y = y;
        const R = this.radius();
        const dx = x - j.bx, dy = y - j.by, d = Math.hypot(dx, dy);
        if (d > R) { j.bx = x - (dx / d) * R; j.by = y - (dy / d) * R; } // 받침이 손가락을 따라온다
      }
    }, { passive: false });

    const up = e => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return;
      this.ptrs.delete(e.pointerId);
      if (p.role === 'joy' && this.joy && this.joy.id === e.pointerId) {
        HUD.joyRelease(this.joy);
        this.joy = null;
      } else if (p.role === 'buy') {
        this.buyId = null;
        HUD.buyUp();
      } else if (p.role === 'pause' && e.type === 'pointerup') {
        UI.pause();
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);

    // iOS 확대/스크롤 방지
    ['touchstart', 'touchmove'].forEach(t => cv.addEventListener(t, e => e.preventDefault(), { passive: false }));
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (e.target === cv) e.preventDefault(); });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      Sfx.unlock();
      this.keys[e.code] = true;
      if (G.state === 'play') {
        if (e.code === 'Space' || e.code === 'KeyJ') { HUD.buyDown(); e.preventDefault(); }
        if (e.code === 'KeyK' || e.code === 'KeyL' || e.code === 'Enter') { HUD.sellDown(); e.preventDefault(); }
        if (e.code === 'Escape' || e.code === 'KeyP') UI.pause();
      } else if (G.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) UI.resume();
      else if (G.state === 'levelup' && /^Digit[1-3]$/.test(e.code)) UI.pickCard(+e.code.slice(5) - 1);
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (e.code === 'Space' || e.code === 'KeyJ') HUD.buyUp();
    });
    window.addEventListener('blur', () => { this.keys = {}; this.reset(); });
  },

  radius() { return 46 * View.U; },

  reset() {
    this.ptrs.clear();
    if (this.joy) HUD.joyRelease(this.joy);
    this.joy = null;
    if (this.buyId !== null || Market.frozen) HUD.buyUp();
    this.buyId = null;
  },

  // 이동 벡터 (길이 0..1)
  move() {
    if (Bot.on) return Bot.move();
    let x = 0, y = 0;
    const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    const j = this.joy;
    if (!j) return { x: 0, y: 0 };
    const R = this.radius();
    const dx = (j.x - j.bx) / R, dy = (j.y - j.by) / R;
    const m = Math.min(1, Math.hypot(dx, dy));
    if (m < 0.12) return { x: 0, y: 0 };
    const s = Math.min(1, (m - 0.12) / 0.7) / (Math.hypot(dx, dy) || 1);
    return { x: dx * s, y: dy * s };
  },
};
