// Moving between screens (GDD §9.1): title → 출정 준비 → play → result → retry / title,
// title → 기록 / 설정 / 도움말. Keyboard focus goes back to the first menu item on each move.
//
// Interpretation: when the URL already defines the run (?seed, ?hand, ?floor or ?bot — the test
// hooks of GDD §13.1), 출정 starts that run at once instead of showing the preparation screen,
// so one Enter on the title runs the scripted game (tools/accept.js criteria 2, 13, 14).

const NAV = BD.ui.nav = {};
const PREP = BD.ui.prep = { seed: 0, tier: 0, rerolls: 0, last: null };

NAV.focus0 = (ui) => { ui.focus = 0; };
NAV.urlRun = (app) => { const p = app.params || {}; return p.seed !== undefined || !!p.hand || p.floor !== undefined || !!p.bot; };

NAV.sortie = function (ui) { // 출정
  if (NAV.urlRun(ui.app)) { ui.startRun(); NAV.focus0(ui); return; }
  NAV.prep(ui);
};
// The night the preparation screen deals: a fresh seed (or the given one), no reroll spent, the
// saved depth. The tap-to-start state after the rotate prompt (65_rotate.js) deals the same way
// and then ascends without showing the screen.
NAV.deal = function (ui, seed) {
  const s = ui.app.save;
  PREP.seed = seed !== undefined ? seed : ui.app.newSeed();
  PREP.rerolls = 0;
  PREP.tier = Math.max(0, Math.min(s.tierUnlocked || 0, s.tierSelected || 0));
};
NAV.prep = function (ui, seed) {
  NAV.deal(ui, seed);
  ui.app.setMode('prep');
  NAV.focus0(ui);
};
NAV.hand = () => BD.cardRt.dealHand(PREP.seed, BD.client.shell.app.save.unlocked, PREP.rerolls);
NAV.ascend = function (ui) { // 오른다
  PREP.last = { seed: PREP.seed, tier: PREP.tier, rerolls: PREP.rerolls };
  ui.app.startRun({ seed: PREP.seed, tier: PREP.tier, rerolls: PREP.rerolls });
  NAV.focus0(ui);
};
NAV.setTier = function (ui, n) {
  const s = ui.app.save;
  PREP.tier = Math.max(0, Math.min(s.tierUnlocked || 0, n));
  if (s.tierSelected !== PREP.tier) {
    s.tierSelected = PREP.tier;
    if (!ui.app.nosave) BD.progress.store(ui.app.storage, s);
  }
};
NAV.again = function (ui) { // 다시 오른다: a new night
  if (NAV.urlRun(ui.app)) { ui.app.retry(false); NAV.focus0(ui); return; }
  NAV.prep(ui);
};
NAV.sameNight = function (ui) { // 같은 밤 다시: same seed, tier and hand
  const r = ui.app.lastResult, L = PREP.last;
  if (L && r && r.seed === L.seed) ui.app.startRun({ seed: L.seed, tier: L.tier, rerolls: L.rerolls });
  else ui.app.retry(true);
  NAV.focus0(ui);
};
NAV.title = function (ui) { ui.app.toTitle(); NAV.focus0(ui); };
NAV.codex = function (ui) { ui.app.setMode('codex'); NAV.focus0(ui); BD.ui.codexSel = null; };
// overlays: remember where help came from (title or pause)
NAV.openHelp = function (ui) { BD.ui.S.helpFrom = ui.app.uiOverlay || null; ui.app.openOverlay('help'); NAV.focus0(ui); };
NAV.closeHelp = function (ui) {
  if (BD.ui.S.helpFrom === 'pause' && ui.app.mode === 'play') ui.app.openOverlay('pause'); else ui.app.closeOverlay();
  BD.ui.S.helpFrom = null; NAV.focus0(ui);
};
NAV.openSettings = function (ui) { ui.app.openOverlay('settings'); NAV.focus0(ui); };
NAV.closeSettings = function (ui) { ui.app.closeOverlay(); NAV.focus0(ui); };

// Sound volume (0..1 in 0.1 steps; 0 = mute).
NAV.volume = function (ui, dv) {
  const s = ui.app.save.settings;
  const v = Math.round(Math.max(0, Math.min(1, (Number(s.sfx) || 0) + dv)) * 10) / 10;
  if (v > 0) BD.ui.S.lastVolume = v;
  ui.app.setSettings({ sfx: v });
  BD.ui.audio.applyVolume(ui.app.save);
};
NAV.toggleMute = function (ui) {
  const s = ui.app.save.settings;
  const v = Number(s.sfx) > 0 ? 0 : BD.ui.S.lastVolume || 0.8;
  if (Number(s.sfx) > 0) BD.ui.S.lastVolume = Number(s.sfx);
  ui.app.setSettings({ sfx: v });
  BD.ui.audio.applyVolume(ui.app.save);
  return v;
};
NAV.volumeLabel = (s) => (Number(s.sfx) > 0 ? Math.round(Number(s.sfx) * 100) + '%' : '꺼짐');

// Arrow-key focus moves get the short tick; returns false so the shell still moves the focus.
NAV.keyTick = function (ev, ui) {
  if (/^Arrow/.test(ev.code)) ui.sfxSafe('ui_move');
  return false;
};
