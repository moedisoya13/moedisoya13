import { clamp } from '../utils/easing.js';

/** 화면 플래시 + 엔딩 타이틀 카드. 둘 다 시각의 함수로만 갱신된다. */
export function createFx() {
  const flash = document.getElementById('flash');
  const titleCard = document.getElementById('title-card');
  const titleInner = titleCard.querySelector('.title-card__inner');

  let lastFlash = -1;
  let lastTitle = -1;

  titleCard.style.transition = 'none';
  titleInner.style.transition = 'none';

  return {
    setFlash(v) {
      const a = clamp(v);
      if (Math.abs(a - lastFlash) < 0.002) return;
      lastFlash = a;
      flash.style.opacity = String(a);
    },

    /** 0 = 숨김, 1 = 완전히 표시 */
    setTitle(v) {
      const a = clamp(v);
      if (Math.abs(a - lastTitle) < 0.002) return;
      lastTitle = a;
      titleCard.style.opacity = String(a);
      titleCard.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
      titleInner.style.transform = `translateY(${(1 - a) * 16}px) scale(${0.97 + a * 0.03})`;
    },

    reset() {
      lastFlash = lastTitle = -1;
      this.setFlash(0);
      this.setTitle(0);
    },
  };
}
