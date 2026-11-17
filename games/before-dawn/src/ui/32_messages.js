// Toasts (left middle, 3 lines, 3 s) and banners (top centre, 1.0–1.5 s, never block input)
// from the engine's `toast` / `banner` events and from the UI itself (hints, card feedback).
// The same text twice within a second is shown once.

const S = BD.ui.S;
const MSG = BD.ui.msg = {};
MSG.TOAST_LIFE = 3.0;
MSG.BANNER_LIFE = { floor: 1.5, guardian: 1.5, awaken: 1.5, stairs: 1.2, boss: 1.5, info: 1.2 };

const clock = () => (BD.client.shell && BD.client.shell.ui ? BD.client.shell.ui.time : 0);

// kind: 'info' | 'hint' | 'break' | 'gain' | 'unlock' | 'warn'
MSG.toast = function (text, kind) {
  const now = clock();
  if (S.toasts.some((t) => t.text === text && now - t.t < 1.0)) return;
  S.toasts.push({ text, kind: kind || 'info', t: now });
  if (S.toasts.length > 3) S.toasts.splice(0, S.toasts.length - 3);
};
MSG.banner = function (text, kind) {
  const now = clock();
  if (S.banner && S.banner.text === text && now - S.banner.t < 1.0) return;
  S.banner = { text, kind: kind || 'info', t: now, life: MSG.BANNER_LIFE[kind] || 1.2 };
};
MSG.live = function (now) {
  S.toasts = S.toasts.filter((t) => now - t.t < MSG.TOAST_LIFE);
  if (S.banner && now - S.banner.t >= S.banner.life) S.banner = null;
};

function toastKind(text) {
  if (/끊김|깨짐|흐트러짐|봉인/.test(text)) return 'break';
  if (/^성인을 새겼다|^각성/.test(text)) return 'gain';
  if (/동이 튼다/.test(text)) return 'warn';
  return 'info';
}

BD.ui.effects.register({
  id: 'messages',
  reset() { S.toasts = []; S.banner = null; },
  on: {
    toast(ev) { MSG.toast(ev.text, toastKind(ev.text)); },
    banner(ev) { MSG.banner(ev.text, ev.kind); },
    trial_start() { MSG.banner('시련 — 균열이 열렸다', 'guardian'); },
    trial_clear() { MSG.banner('시련을 넘었다 — 제단이 다시 켜졌다', 'stairs'); },
    spawn(ev, ui) {
      // GDD §9.2 banner `수호자 — 암흑기사 단장` when a guardian walks in
      const e = BD.W.enemyById(ui.world, ev.enemyId);
      if (e && e.guardian) MSG.banner('수호자 — ' + ((e.def.guardian && e.def.guardian.name) || e.def.name), 'guardian');
    },
  },
  update(dt, ui) { MSG.live(ui.time); },
});
