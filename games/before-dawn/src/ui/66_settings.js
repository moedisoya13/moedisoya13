// 설정 (GDD §9.1 settings): 소리 (0–100 %), 화면 흔들림, 돌진 버튼 위치 (오른쪽/왼쪽),
// 첫 판 안내 다시 보기, 기록 지우기 (asks once more). Every change is written to the save.

const K = BD.ui.K;
const NAV = BD.ui.nav;
const ST = { confirmWipe: false, seen: -9 };

function wipe(app) {
  const keep = Object.assign({}, app.save.settings);
  const fresh = BD.progress.fresh();
  for (const k of BD.progress.FIELDS) app.save[k] = fresh[k];
  app.save.settings = keep;
  if (!app.nosave) BD.progress.store(app.storage, app.save);
}

BD.ui.overlays.register({
  id: 'settings',
  draw(g, ui) {
    const app = ui.app, s = app.save.settings;
    if (ui.time - ST.seen > 0.2) ST.confirmWipe = false;
    ST.seen = ui.time;
    K.dim(g, 0.9);
    K.letter(g, '설정', 640, 74, { size: 52 });
    K.panel(g, 250, 104, 780, 500, { edge: '#8d877c', facetK: 0.08 });
    const rows = ['소리', '화면 흔들림', '돌진 버튼 위치', '첫 판 안내', '기록 지우기'];
    rows.forEach((r, i) => K.text(ui, r, 286, 160 + i * 92, { size: 27, weight: 800, color: K.PAPER }));
    const cx = 610, cw = 380, ch = 66;
    BD.ui.stepper(ui, { id: 'volume', label: NAV.volumeLabel(s), x: cx, y: 118, w: cw, h: ch, onEnter: () => NAV.toggleMute(ui), step: (d) => NAV.volume(ui, d * 0.1) });
    K.button(ui, { id: 'shake', label: s.shake ? '켬' : '끔', x: cx, y: 210, w: cw, h: ch, menu: true, onTap: () => app.setSettings({ shake: !s.shake }) });
    K.button(ui, { id: 'dashSide', label: s.dashSide === 'left' ? '왼쪽' : '오른쪽', x: cx, y: 302, w: cw, h: ch, menu: true, onTap: () => app.setSettings({ dashSide: s.dashSide === 'left' ? 'right' : 'left' }) });
    K.button(ui, { id: 'hints', label: s.hints ? '켜짐 — 다음 판에 안내' : '다시 보기', x: cx, y: 394, w: cw, h: ch, menu: true, size: s.hints ? 22 : 24, onTap: () => { if (!s.hints) app.setSettings({ hints: true }); } });
    K.button(ui, {
      id: 'wipe', label: ST.confirmWipe ? '정말 지운다' : ui.time - (ST.wipedAt || -9) < 2 ? '지웠다' : '지우기', sub: ST.confirmWipe ? '판 기록·해금이 사라진다' : null, kind: 'danger', x: cx, y: 486, w: cw, h: ST.confirmWipe ? 80 : ch, menu: true,
      onTap: () => { if (ST.confirmWipe) { ST.confirmWipe = false; wipe(app); ST.wipedAt = ui.time; } else ST.confirmWipe = true; },
    });
    K.button(ui, { id: 'close', label: '닫기', kind: 'primary', x: 530, y: 626, w: 220, h: 66, menu: true, size: 27, onTap: () => NAV.closeSettings(ui) });
  },
  key(ev, ui) {
    if (BD.ui.stepperKey(ev, ui, { volume: (d) => NAV.volume(ui, d * 0.1) })) return true;
    if (ev.code === 'Escape') { NAV.closeSettings(ui); return true; }
    return NAV.keyTick(ev, ui);
  },
});
