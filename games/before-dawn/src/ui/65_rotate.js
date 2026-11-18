// 회전 안내 (overlay 'rotate', GDD §2.1 / §9.1) and what follows it, 화면을 터치하면 시작 / 계속
// (overlay 'tap'): after the rotate prompt, one touch gets the player playing.
//
// - A portrait window holds the game behind the rotate prompt (the client sets app.rotate). The
//   prompt says what a touch will do.
// - Touching the prompt (screens that never turn: rotation lock, file viewers, in-app browsers;
//   or a tall desktop window) switches the view to forced landscape (client view.setForced: the
//   picture a quarter turn round for a touch, upright and letterboxed for a mouse or key) and at
//   once does what the tap state below would do. The view drops forced landscape by itself when
//   the window really turns landscape; play goes on without a restart.
// - Turning the device back to landscape instead, at launch, on the title or on the preparation
//   screen: 「화면을 터치하면 시작」 over the title art. The first tap, click, Enter or Space starts
//   a run with the hand the preparation screen would deal (NAV.deal: a fresh seed, the saved depth,
//   the §5.6 rule, no reroll spent; on the preparation screen, the hand it shows), skipping that
//   screen for this path only. With the URL test hooks (?seed, ?hand, ?floor, ?bot) it starts the
//   URL's run, as 출정 does. Esc goes to the title menu instead.
// - Mid-run: 「화면을 터치하면 계속」 over the held fight instead of the pause menu; one tap resumes.
//   Esc / P open the pause menu. Losing focus still opens the pause menu (shell), as before.
// - Anywhere else (a menu overlay was open, the altar, codex, result, a bot run) the device turns
//   back to where it was.
// Both overlays claim the press and act on its release (a user gesture for audio on every
// browser, touch included), so the tap never becomes the joystick, never presses the dash button
// and never arms the double-tap dash.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const NAV = BD.ui.nav;
const PREP = BD.ui.prep;
const S = BD.ui.S;
const TAP = BD.ui.tap = { down: null };
const ROT = { hooked: false, down: null }; // subscribed to the view's turns; the prompt's pressed pointer

// What landscape leads to from here: 'start', 'continue', or null (back where it was).
TAP.next = function (app) {
  if (app.uiOverlay && app.uiOverlay !== 'tap') return null;
  if (app.mode === 'title' || app.mode === 'prep') return 'start';
  const w = app.world;
  if (app.mode === 'play' && w && !w.altarOpen && !w.ending && !app.botOn) return 'continue';
  return null;
};

TAP.open = function (ui) {
  const app = ui.app;
  if (!TAP.next(app) || app.uiOverlay === 'tap') return;
  if (app.mode === 'title' && !NAV.urlRun(app)) NAV.deal(ui); // the night 출정 would deal
  TAP.down = null;
  app.openOverlay('tap');
  NAV.focus0(ui);
};

// The tap: unlock audio, leave no dash request or double-tap timer behind, then start or resume.
TAP.go = function (ui) {
  if (ui.app.overlay() === 'tap') TAP.act(ui);
};
TAP.act = function (ui) {
  const app = ui.app;
  TAP.down = null;
  ui.unlockAudio(); // also resumes a context iOS created suspended
  const st = BD.client.input.st;
  if (st) { st.dashReq = false; st.lastUp = -1; }
  if (app.mode === 'play') { if (app.uiOverlay === 'tap') app.closeOverlay(); }
  else if (app.mode !== 'prep' && NAV.urlRun(app)) ui.startRun();
  else NAV.ascend(ui);
  NAV.focus0(ui);
  ui.sfxSafe('ui_ok');
};

// The rotate prompt's tap: forced landscape ('turn' for a touch, 'fit' for a mouse or key), then
// straight into play as the tap state would; elsewhere (a menu, codex, result) just the view.
TAP.force = function (ui, kind) {
  const app = ui.app, next = TAP.next(app);
  ui.view.setForced(kind);
  app.setRotate(ui.view.portrait);
  if (app.rotate) return;
  if (next === 'start' && app.mode === 'title' && app.uiOverlay !== 'tap' && !NAV.urlRun(app)) NAV.deal(ui);
  if (next) TAP.act(ui);
  else { ui.unlockAudio(); NAV.focus0(ui); ui.sfxSafe('ui_ok'); }
};

TAP.dismiss = function (ui) {
  const app = ui.app;
  TAP.down = null;
  app.closeOverlay();
  if (app.mode === 'play') app.pause();
  NAV.focus0(ui);
  ui.sfxSafe('ui_move');
};

// Turning back to landscape after the rotate prompt opens the tap state (where TAP.next says), at
// the moment the view notices it — before the shell can run a tick. Not when the view left the
// prompt because the player chose forced landscape (TAP.force handles that tap itself).
BD.ui.effects.register({
  id: 'rotate_tap',
  update(dt, ui) {
    if (ROT.hooked) return;
    ROT.hooked = true;
    ui.view.onTurn((portrait) => { if (!portrait && !ui.view.forced) TAP.open(ui); });
  },
});

// ---- the rotate prompt -------------------------------------------------------------------------
// A portrait window shows the 1280×720 canvas at under a third of its size (0.29 on a 375 px
// wide phone), so everything here is drawn large: 112 px lettering, 50–56 px in the panel.
const PROMPT = {
  start: '가로 화면으로 바로 시작합니다',
  continue: '가로 화면으로 바로 이어집니다',
  none: '가로 화면으로 봅니다',
};
BD.ui.overlays.register({
  id: 'rotate',
  draw(g, ui) {
    g.fillStyle = '#07070c'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.globalAlpha = 0.3; g.fillStyle = K.halftone(g, '#2a2140', 9); g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); g.globalAlpha = 1;
    const next = TAP.next(ui.app);
    // the phone turning a quarter left, under a gold arc with an arrowhead
    const k = (Math.sin(ui.time * 2) + 1) / 2, px = 250, py = 380, r = 196;
    IC.phone(g, px, py, 320, -K.ease(k) * Math.PI / 2);
    const a0 = -2.25, a1 = -0.85;
    g.beginPath(); g.arc(px, py, r, a0, a1); K.ink(g, 12);
    g.beginPath(); g.arc(px, py, r, a0, a1); g.lineWidth = 6; g.strokeStyle = K.GOLD_HI; g.stroke();
    const ax = px + Math.cos(a0) * r, ay = py + Math.sin(a0) * r, tx = Math.sin(a0), ty = -Math.cos(a0); // counter-clockwise tangent
    K.poly(g, [[ax + tx * 30, ay + ty * 30], [ax - ty * 18, ay + tx * 18], [ax + ty * 18, ay - tx * 18]]);
    g.fillStyle = K.GOLD_HI; g.fill(); K.ink(g, 3);
    // what to do, and what a touch does (the whole screen is the button)
    const cx = 862;
    K.letter(g, '화면을 가로로', cx, 196, { size: 112 });
    K.letter(g, '돌려 주세요', cx, 334, { size: 112 });
    K.panel(g, cx - 384, 414, 768, 200, { slant: 12, edge: K.GOLD, edgeW: 3, facet: '#2a2418', shadow: 6 });
    K.text(ui, '화면을 터치하면', cx, 498, { size: 56, weight: 900, color: K.PAPER, align: 'center', maxW: 700 });
    K.text(ui, PROMPT[next || 'none'], cx, 578, { size: 50, weight: 900, color: K.GOLD_HI, align: 'center', maxW: 700 });
  },
  // a touch turns the picture (the device is turned by hand); a mouse keeps it upright
  pointer(ev, ui) {
    if (ev.type === 'down') ROT.down = ev.id;
    else if (ev.type === 'up' && ROT.down === ev.id) { ROT.down = null; TAP.force(ui, S.lastInput === 'touch' ? 'turn' : 'fit'); }
    return true;
  },
  key(ev, ui) {
    const c = ev.code;
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { TAP.force(ui, 'fit'); return true; }
    return false;
  },
});

// ---- the tap state -----------------------------------------------------------------------------
// A fingertip pressing a gold dot, with a ripple, once every 0.9 s.
function tapGlyph(g, ui, x, y, s) {
  const ph = (ui.time / 0.9) % 1;
  const press = ph < 0.16 ? ph / 0.16 : ph < 0.34 ? 1 - (ph - 0.16) / 0.18 : 0;
  if (ph > 0.12 && ph < 0.85) {
    const q = (ph - 0.12) / 0.73;
    K.circle(g, x, y, s * (0.22 + q * 0.62)); g.globalAlpha = 1 - q; g.lineWidth = 5; g.strokeStyle = K.GOLD_HI; g.stroke(); g.globalAlpha = 1;
  }
  K.circle(g, x, y, s * 0.16); g.fillStyle = K.GOLD_HI; g.fill(); K.ink(g, 3);
  IC.finger(g, x + s * 0.05, y + s * 0.44 - (1 - press) * s * 0.2, s);
}

// keyboard hint only where a keyboard is likely (not on a touch screen, not after a touch)
function keyHint() {
  if (S.lastInput === 'touch') return false;
  if (S.lastInput === 'mouse') return true;
  try { return !window.matchMedia('(pointer: coarse)').matches; } catch (err) { return true; }
}

function pulse(ui) { return (Math.sin(ui.time * 4.2) + 1) / 2; }

function drawStart(g, ui) {
  const app = ui.app;
  BD.ui.titleArt(g, ui);
  // the call to action where the menu was
  K.panel(g, 52, 316, 500, 172, { slant: 14, edge: K.GOLD, edgeW: 3, facet: '#2a2418', shadow: 6 });
  tapGlyph(g, ui, 128, 398, 70);
  K.text(ui, '화면을 터치하면', 352, 380, { size: 46, weight: 900, color: K.PAPER, align: 'center', maxW: 360 });
  K.letter(g, '시작', 352, 464, { size: 92, fill: K.GOLD_HI, fill2: K.GOLD, scale: 1 + 0.035 * pulse(ui) });
  let y = 520;
  if (keyHint()) { K.text(ui, 'Enter · Space 시작   Esc 메뉴', 302, y, { size: 21, weight: 700, color: K.DIM, align: 'center', stroke: 4 }); }
  // the night it will be (as the preparation screen would show it)
  if (NAV.urlRun(app)) return;
  y = 566;
  const label = '이번 밤의 성인' + (PREP.tier > 0 ? ' · ' + BD.ui.tierName(PREP.tier) : '');
  K.text(ui, label, 302, y, { size: 24, weight: 900, color: K.GOLD_HI, align: 'center', stroke: 4 });
  NAV.hand().forEach((id, i) => {
    const def = BD.cards.get(id), x = 152 + i * 150, iy = 614, s = 54;
    K.poly(g, [[x - s / 2 - 4, iy - s / 2 - 4], [x + s / 2 + 4, iy - s / 2 - 4], [x + s / 2 + 4, iy + s / 2 + 4], [x - s / 2 - 4, iy + s / 2 + 4]]);
    g.fillStyle = K.INK; g.fill(); g.lineWidth = 3; g.strokeStyle = K.famColor(def.family); g.stroke();
    IC.card(g, def, x, iy, s - 6);
    K.text(ui, def.name, x, iy + 60, { size: 22, weight: 800, color: K.PAPER, align: 'center', stroke: 4, maxW: 144 });
  });
}

function drawContinue(g, ui) {
  const w = ui.world;
  // dim the held fight except a window around the hero, so the player sees where they are
  const [hx, hy0] = ui.view.proj(w.hero.x, w.hero.y, 0), hy = hy0 - 44, hr = 120;
  for (const [r, a] of [[hr, 0.3], [hr + 20, 0.45]]) { // two steps: a soft edge
    g.save();
    g.beginPath(); g.rect(0, 0, C.VIEW_W, C.VIEW_H); g.arc(hx, hy, r, 0, Math.PI * 2, true); g.clip();
    g.fillStyle = 'rgba(6,6,10,' + a + ')'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    if (r > hr) { g.globalAlpha = 0.35; g.fillStyle = K.halftone(g, '#000000', 7); g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); }
    g.restore();
  }
  // the call to action away from the hero: under his feet when he is high, over his head when
  // low (between the HUD bars and the card tray); the keyboard hint stays inside the panel
  const hint = keyHint(), ph = hint ? 200 : 170;
  const cx = 640, top = hy0 < 409 ? 600 - ph : 112, p = pulse(ui);
  K.panel(g, cx - 300, top, 600, ph, { slant: 14, edge: K.GOLD, edgeW: 3, facet: '#2a2418', shadow: 6 });
  tapGlyph(g, ui, cx - 212, top + 82, 70);
  K.text(ui, '화면을 터치하면', cx + 46, top + 64, { size: 46, weight: 900, color: K.PAPER, align: 'center', maxW: 380 });
  K.letter(g, '계속', cx + 46, top + 148, { size: 92, fill: K.GOLD_HI, fill2: K.GOLD, scale: 1 + 0.035 * p });
  if (hint) K.text(ui, 'Enter · Space 계속   Esc 일시정지', cx, top + 186, { size: 20, weight: 700, color: K.DIM, align: 'center' });
}

BD.ui.overlays.register({
  id: 'tap',
  draw(g, ui) {
    if (ui.app.mode === 'play' && ui.world) drawContinue(g, ui);
    else drawStart(g, ui);
  },
  // claim the press (it never becomes the stick); act on its release
  pointer(ev, ui) {
    if (ev.type === 'down') TAP.down = ev.id;
    else if (ev.type === 'up' && TAP.down === ev.id) TAP.go(ui);
    return true;
  },
  key(ev, ui) {
    const c = ev.code;
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { TAP.go(ui); return true; }
    if (c === 'Escape' || (c === 'KeyP' && ui.app.mode === 'play')) { TAP.dismiss(ui); return true; }
    return false;
  },
});
