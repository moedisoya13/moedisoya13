// localStorage 저장. 사생활 모드 등으로 저장이 막혀도 게임은 돌아가야 한다 — 실패는 조용히 삼킨다.

const KEY = 'jacky-survivors:v1';

const DEFAULTS = {
  vault: 0,
  upgrades: {},
  best: { time: 0, kills: 0, profit: 0, clears: 0 },
  runs: 0,
  settings: { sound: true, music: true, chart: 'auto' },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...d,
      best: { ...DEFAULTS.best, ...(d.best || {}) },
      settings: { ...DEFAULTS.settings, ...(d.settings || {}) },
      upgrades: { ...(d.upgrades || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* 저장 불가 환경 — 무시 */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return structuredClone(DEFAULTS);
}
