/* Buttons for one fighter, from the keyboard and from the touch controls, read once a step.
   Touch: the left of the screen is a stick you put down anywhere (drag to walk, flick to dodge that way); the right holds
   three buttons. Keys: A/D or the arrows walk (tap the same way twice to dodge), J cut, K parry, L or space dodge back. */
const FLICK = { distance: 46, within: 170 }; // pixels, milliseconds
const DOUBLE_TAP = 240;

export function createInput(root) {
  const held = { left: false, right: false };
  let stick = 0,
    attack = false,
    parry = false,
    dodge = 0;
  const lastTap = { left: -1e9, right: -1e9 };
  const KEYS = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyJ: 'attack', KeyZ: 'attack', KeyK: 'parry', KeyX: 'parry', KeyL: 'dodge', Space: 'dodge', ShiftLeft: 'dodge'
  };
  addEventListener('keydown', e => {
    const k = KEYS[e.code];
    if (!k || e.repeat) return;
    e.preventDefault();
    if (k === 'left' || k === 'right') {
      held[k] = true;
      if (e.timeStamp - lastTap[k] < DOUBLE_TAP) dodge = k === 'left' ? -1 : 1;
      lastTap[k] = e.timeStamp;
    } else if (k === 'attack') attack = true;
    else if (k === 'parry') parry = true;
    else dodge = dodge || 2; // 2: away from the opponent, whichever side that is
  });
  addEventListener('keyup', e => {
    const k = KEYS[e.code];
    if (k === 'left' || k === 'right') held[k] = false;
  });

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
      stick = 0;
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
        }
      });
      pad.addEventListener('pointermove', e => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - x0;
        if (!flicked && Math.abs(dx) > FLICK.distance && e.timeStamp - t0 < FLICK.within) {
          dodge = Math.sign(dx);
          flicked = true;
        }
        stick = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
        if (nub) nub.style.setProperty('--dx', Math.max(-34, Math.min(34, dx)) + 'px');
      });
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }
    for (const button of root.querySelectorAll('[data-button]')) {
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        const what = button.dataset.button;
        if (what === 'attack') attack = true;
        else if (what === 'parry') parry = true;
        else dodge = dodge || 2;
        button.classList.add('down');
      });
      const up = () => button.classList.remove('down');
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('pointerleave', up);
    }
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  return {
    /* The buttons as the duel wants them; presses are handed over once. `away` is the direction that leads away from the
       opponent, which is where a plain dodge goes. */
    read(away) {
      const out = {
        move: stick || (held.right ? 1 : 0) - (held.left ? 1 : 0),
        attack,
        parry,
        dodge: dodge === 2 ? away : dodge
      };
      attack = parry = false;
      dodge = 0;
      return out;
    },
    any: () => attack || parry || dodge !== 0
  };
}
