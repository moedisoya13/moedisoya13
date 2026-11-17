// First-run hints (GDD §9.3 last line): one toast each, when the situation first comes up —
// moving, the target chevron, a floor warning, the dash, the altar, the sealed stairs.
// Shown while settings.hints is on; the first finished run turns it off (설정 → 첫 판 안내
// 다시 보기 turns it back on).

const S = BD.ui.S;
const MSG = BD.ui.msg;
const H = BD.ui.hints = { shown: {}, queue: [], active: false };

const touchy = () => S.lastInput === 'touch';
const TEXT = {
  move: () => (touchy() ? '화면을 끌면 움직입니다. 공격은 자동입니다' : 'WASD·방향키로 움직입니다. 공격은 자동입니다'),
  target: () => '주황 꺾쇠가 다음 표적입니다',
  telegraph: () => '빨간 빗금은 곧 맞는 자리 — 비키세요',
  dash: (ui) => (touchy() ? '돌진: ' + (ui.app.save.settings.dashSide === 'left' ? '왼쪽' : '오른쪽') + ' 아래 버튼, 또는 두 번 두드리기' : '돌진: Space 또는 Shift'),
  altar: () => '빛나는 제단에 머물면 성인을 바꿉니다',
  sealed: () => '수호자를 베어야 계단이 열립니다',
  trial: () => '보라 균열에 머물면 시련 — 이기면 새 제단',
};

function on(ui) { return !!ui.app.save.settings.hints; }
H.show = function (ui, key, delay) {
  if (!on(ui) || H.shown[key]) return;
  H.shown[key] = true;
  H.queue.push({ key, at: ui.time + (delay || 0) });
};

BD.ui.effects.register({
  id: 'hints',
  reset(ui) { H.shown = {}; H.queue = []; H.active = on(ui); },
  on: {
    floor_enter(ev, ui) { if (ev.floor === 1 || !H.shown.move) H.show(ui, 'move', 1.6); },
    telegraph(ev, ui) { H.show(ui, 'telegraph', 0); },
    hurt(ev, ui) { H.show(ui, 'dash', 0.3); },
    dodge(ev, ui) { H.shown.dash = true; },
    stairs_open(ev, ui) { H.show(ui, 'altar', 1.4); if (ui.world.trial) H.show(ui, 'trial', 4.6); },
    toast(ev, ui) { if (ev.text === '계단이 봉인되어 있다') H.show(ui, 'sealed', 0.2); },
  },
  update(dt, ui) {
    const w = ui.world;
    if (ui.app.mode === 'result' && H.active) {
      H.active = false;
      if (on(ui)) ui.app.setSettings({ hints: false });
      return;
    }
    if (!w || ui.app.mode !== 'play') return;
    if (w.hero.targetId && !H.shown.target && H.shown.move) H.show(ui, 'target', 0.4);
    if (ui.app.overlay()) return;
    H.queue = H.queue.filter((q) => {
      if (ui.time < q.at) return true;
      MSG.toast(TEXT[q.key](ui), 'hint');
      return false;
    });
  },
});
