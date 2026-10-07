// 플로팅 조이스틱: 화면 어디든 엄지를 대면 그 자리가 조이스틱 중심이 된다.
// 너무 멀리 끌면 중심이 따라온다 (방향 전환이 빠르다). 데스크톱 테스트용으로 WASD/마우스도 받는다.

export function createInput(target, { onTouchStart } = {}) {
  const input = {
    active: false,
    id: null,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    radius: 46, // CSS px
    enabled: true,
    keys: new Set(),
  };

  const isUi = (el) => el && el.closest && el.closest('[data-ui]');

  function start(id, cx, cy) {
    input.active = true;
    input.id = id;
    input.ox = cx;
    input.oy = cy;
    input.x = 0;
    input.y = 0;
    onTouchStart && onTouchStart(cy);
  }
  function move(cx, cy) {
    let dx = cx - input.ox;
    let dy = cy - input.oy;
    const d = Math.hypot(dx, dy);
    if (d > input.radius) {
      // 중심을 손가락 쪽으로 끌고 온다
      input.ox = cx - (dx / d) * input.radius;
      input.oy = cy - (dy / d) * input.radius;
      dx = cx - input.ox;
      dy = cy - input.oy;
    }
    input.x = dx / input.radius;
    input.y = dy / input.radius;
  }
  function end() {
    input.active = false;
    input.id = null;
    input.x = 0;
    input.y = 0;
  }

  target.addEventListener(
    'touchstart',
    (e) => {
      if (isUi(e.target)) return;
      e.preventDefault();
      if (!input.enabled || input.active) return;
      const t = e.changedTouches[0];
      start(t.identifier, t.clientX, t.clientY);
    },
    { passive: false },
  );
  target.addEventListener(
    'touchmove',
    (e) => {
      if (isUi(e.target)) return;
      e.preventDefault();
      if (!input.active) return;
      for (const t of e.changedTouches) if (t.identifier === input.id) move(t.clientX, t.clientY);
    },
    { passive: false },
  );
  const touchEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === input.id) end();
  };
  target.addEventListener('touchend', touchEnd);
  target.addEventListener('touchcancel', touchEnd);

  // 마우스 (데스크톱)
  let mouseDown = false;
  target.addEventListener('mousedown', (e) => {
    if (isUi(e.target) || !input.enabled) return;
    mouseDown = true;
    start('mouse', e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (mouseDown && input.active) move(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (mouseDown) end();
    mouseDown = false;
  });

  window.addEventListener('keydown', (e) => input.keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    input.keys.clear();
    end();
  });

  input.read = () => {
    let kx = 0;
    let ky = 0;
    const k = input.keys;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('w') || k.has('arrowup')) ky -= 1;
    if (k.has('s') || k.has('arrowdown')) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    if (!input.enabled) return { x: 0, y: 0 };
    return { x: input.x, y: input.y };
  };
  input.reset = end;
  return input;
}
