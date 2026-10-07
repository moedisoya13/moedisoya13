// 차트 바를 화면 위/아래 중 어디에 둘지 결정 (pure).
//
// 원칙: 엄지가 닿는 쪽의 반대편. 판단은 touchstart 에서만 한다 — 드래그 도중에
// 바가 왔다 갔다 하면 정신없고, 손가락이 가운데를 지날 때마다 깜빡이게 된다.
// 화면 가운데 띠(DEAD_BAND)에서 시작한 터치는 현재 위치를 유지한다.

export const DEAD_BAND = 0.1; // 가운데 ±10% 구간

export function decideSide(mode, current, touchY, viewportH) {
  if (mode === 'top' || mode === 'bottom') return mode;
  if (touchY == null || !(viewportH > 0)) return current;
  const r = touchY / viewportH;
  if (r > 0.5 + DEAD_BAND) return 'top';
  if (r < 0.5 - DEAD_BAND) return 'bottom';
  return current;
}
