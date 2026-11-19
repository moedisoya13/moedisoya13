/* One boxer's controls, from touch and from the keyboard, read once a step.
   Touch: the left of the screen is a stick you put down anywhere (drag to move, flick to dash that way); the right holds
   jab, power punch and guard (held). Keys: WASD or arrows move (tap a direction twice to dash), J jab, K power punch,
   L or Shift guard, Space dash.
   Directions are the screen's: x to the right, y up the picture. The page turns them onto the canvas by where the camera is. */
const FLICK = { distance: 44, within: 170 };
const DOUBLE_TAP = 230;
const REACH = 56; // pixels of drag for full speed

export function createInput(root) {
  const held = { left: false, right: false, up: false, down: false, cover: false };
  let stick = [0, 0],
    jab = false,
    power = false,
    cover = false,
    dash = null;
  const lastTap = {};
  const KEYS = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyJ: 'jab', KeyZ: 'jab', KeyK: 'power', KeyX: 'power', KeyL: 'cover', ShiftLeft: 'cover', ShiftRight: 'cover', Space: 'dash'
  };
  const VECTOR = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] };
  const keys = () => [(held.right ? 1 : 0) - (held.left ? 1 : 0), (held.up ? 1 : 0) - (held.down ? 1 : 0)];
  addEventListener('keydown', e => {
    const k = KEYS[e.code];
    if (!k || e.repeat) return;
    e.preventDefault();
    if (VECTOR[k]) {
      held[k] = true;
      if (e.timeStamp - (lastTap[k] || -1e9) < DOUBLE_TAP) dash = VECTOR[k];
      lastTap[k] = e.timeStamp;
    } else if (k === 'jab') jab = true;
    else if (k === 'power') power = true;
    else if (k === 'cover') held.cover = true;
    else {
      const m = keys();
      dash = m[0] || m[1] ? m : true;
    }
  });
  addEventListener('keyup', e => {
    const k = KEYS[e.code];
    if (VECTOR[k]) held[k] = false;
    else if (k === 'cover') held.cover = false;
  });
  addEventListener('blur', () => Object.keys(held).forEach(k => (held[k] = false)));

  if (root) {
    const pad = root.querySelector('[data-pad]'),
      nub = root.querySelector('[data-nub]');
    let id = null,
      x0 = 0,
      y0 = 0,
      t0 = 0,
      flicked = false;
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      stick = [0, 0];
      if (nub) nub.style.opacity = '0';
    };
    if (pad) {
      pad.addEventListener('pointerdown', e => {
        if (id !== null) return;
        id = e.pointerId;
        pad.setPointerCapture(id);
        x0 = e.clientX;
        y0 = e.clientY;
        t0 = e.timeStamp;
        flicked = false;
        if (nub) {
          const r = pad.getBoundingClientRect();
          nub.style.left = x0 - r.left + 'px';
          nub.style.top = y0 - r.top + 'px';
          nub.style.opacity = '1';
          nub.style.setProperty('--dx', '0px');
          nub.style.setProperty('--dy', '0px');
        }
      });
      pad.addEventListener('pointermove', e => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - x0,
          dy = e.clientY - y0,
          d = Math.hypot(dx, dy);
        if (!flicked && d > FLICK.distance && e.timeStamp - t0 < FLICK.within) {
          dash = [dx / d, -dy / d];
          flicked = true;
        }
        // a small dead centre, then speed by how far the thumb has gone
        const k = d < 10 ? 0 : Math.min(1, (d - 10) / (REACH - 10)) / d;
        stick = [dx * k, -dy * k];
        if (nub) {
          const c = Math.min(1, 36 / (d || 1));
          nub.style.setProperty('--dx', dx * c + 'px');
          nub.style.setProperty('--dy', dy * c + 'px');
        }
      });
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }
    for (const button of root.querySelectorAll('[data-button]')) {
      const what = button.dataset.button;
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        if (what === 'jab') jab = true;
        else if (what === 'power') power = true;
        else cover = true;
        button.classList.add('down');
      });
      const up = () => {
        if (what === 'cover') cover = false;
        button.classList.remove('down');
      };
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
    }
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  return {
    // presses are handed over once; held things as they stand
    read() {
      const k = keys(),
        kl = Math.hypot(k[0], k[1]) || 1,
        out = { move: stick[0] || stick[1] ? stick : [k[0] / kl, k[1] / kl], jab, power, cover: cover || held.cover, dash };
      jab = power = false;
      dash = null;
      return out;
    }
  };
}
