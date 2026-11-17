// 일시정지 (GDD §9.1 pause): the three equipped cards with their full effect and live state;
// 계속 · 도움말 · 소리 ◀▶ · 화면 흔들림 켬/끔 · 포기하고 내려간다 (asks once more).
// Opened by Esc/P, the Ⅱ button, a card slot tap, or losing focus. Also the play screen's
// keys: M toggles the sound.

const K = BD.ui.K;
const NAV = BD.ui.nav;
const MSG = BD.ui.msg;
const P = { confirm: false };

// A value control: the button is focusable (Enter / ←→ when focused), the arrows are tap targets.
function stepper(ui, spec) {
  K.button(ui, { id: spec.id, label: spec.label, x: spec.x, y: spec.y, w: spec.w, h: spec.h, menu: true, size: spec.size || 24, onTap: spec.onEnter });
  const g = ui.g, cy = spec.y + spec.h / 2;
  for (const [sx, dir] of [[spec.x + 34, -1], [spec.x + spec.w - 34, 1]]) {
    K.poly(g, [[sx - 10 * dir, cy - 13], [sx + 10 * dir, cy], [sx - 10 * dir, cy + 13]]); g.fillStyle = K.GOLD_HI; g.fill(); K.ink(g, 2.5);
  }
  K.hit(ui, { id: spec.id + '_dec', label: '◀', x: spec.x - 8, y: spec.y - 6, w: 84, h: spec.h + 12, onTap: () => spec.step(-1) });
  K.hit(ui, { id: spec.id + '_inc', label: '▶', x: spec.x + spec.w - 76, y: spec.y - 6, w: 84, h: spec.h + 12, onTap: () => spec.step(1) });
}
BD.ui.stepper = stepper;
// ←/→ on a focused stepper
BD.ui.stepperKey = function (ev, ui, map) {
  const f = K.focusedButton(ui);
  if (!f || !map[f.id] || (ev.code !== 'ArrowLeft' && ev.code !== 'ArrowRight')) return false;
  map[f.id](ev.code === 'ArrowLeft' ? -1 : 1);
  ui.sfxSafe('ui_move');
  return true;
};

BD.ui.overlays.register({
  id: 'pause',
  draw(g, ui) {
    const w = ui.world, app = ui.app, st = app.save.settings;
    if (ui.time - (P.seen || -9) > 0.2) P.confirm = false; // a fresh opening never starts armed
    P.seen = ui.time;
    K.dim(g, 0.8);
    K.letter(g, '일시정지', 425, 74, { size: 54 });
    K.text(ui, K.floorName(w.floorN) + ' · ' + BD.flow.clockStr(w) + ' · HP ' + w.hero.hp + '/' + w.hero.maxHp, 1230, 70, { size: 23, align: 'right', weight: 800, color: K.DIM });
    for (let i = 0; i < 3; i++) {
      const c = w.cards[i];
      BD.ui.cardFace(ui, c ? c.def : null, 50, 100 + i * 172, 750, 160, { card: c, wide: true, iconSize: 84, sizes: [23, 21, 19, 17] });
    }
    const x = 850, bw = 380;
    K.button(ui, { id: 'resume', label: '계속', kind: 'primary', x, y: 100, w: bw, h: 76, hitPad: 8, menu: true, size: 32, onTap: () => { P.confirm = false; app.resume(); } });
    K.button(ui, { id: 'help', label: '도움말', x, y: 194, w: bw, h: 66, hitPad: 8, menu: true, onTap: () => { P.confirm = false; NAV.openHelp(ui); } });
    stepper(ui, { id: 'volume', label: '소리 ' + NAV.volumeLabel(st), x, y: 278, w: bw, h: 66, onEnter: () => NAV.toggleMute(ui), step: (d) => NAV.volume(ui, d * 0.1) });
    K.button(ui, { id: 'shake', label: '화면 흔들림 ' + (st.shake ? '켬' : '끔'), x, y: 362, w: bw, h: 66, hitPad: 8, menu: true, onTap: () => app.setSettings({ shake: !st.shake }) });
    K.button(ui, {
      id: 'giveup', label: P.confirm ? '정말 포기한다' : '포기하고 내려간다', sub: P.confirm ? '한 번 더 누르면 판이 끝난다' : null, kind: 'danger',
      x, y: 518, w: bw, h: P.confirm ? 82 : 66, hitPad: 8, menu: true, size: 25,
      onTap: () => { if (P.confirm) { P.confirm = false; app.giveUp(); NAV.focus0(ui); } else P.confirm = true; },
    });
  },
  key(ev, ui) {
    if (BD.ui.stepperKey(ev, ui, { volume: (d) => NAV.volume(ui, d * 0.1) })) return true;
    if (ev.code === 'Escape' || ev.code === 'KeyP') P.confirm = false;
    return NAV.keyTick(ev, ui);
  },
});

// the play mode's screen: nothing to draw over the HUD; M mutes / unmutes
BD.ui.screens.register({
  id: 'play',
  draw() {},
  key(ev, ui) {
    if (ev.code === 'KeyM') {
      const v = NAV.toggleMute(ui);
      MSG.toast(v > 0 ? '소리 ' + Math.round(v * 100) + '%' : '소리 꺼짐', 'info');
      return true;
    }
    return false;
  },
});

// Turning the device back to landscape lands on the pause menu instead of dropping the player
// straight into the fight (the same courtesy as losing focus, GDD §2.1).
const ROT = { was: false };
BD.ui.effects.register({
  id: 'rotate_pause',
  update(dt, ui) {
    const app = ui.app, now = !!app.rotate;
    if (ROT.was && !now && app.mode === 'play' && !app.overlay() && !app.botOn && app.world && !app.world.ending) app.pause();
    ROT.was = now;
  },
});
