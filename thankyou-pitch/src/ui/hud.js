import { clamp, easeOutCubic } from '../utils/easing.js';

/**
 * 화면 우상단 HUD — 「던질 수 있는 공」 카운터가 이 작품의 핵심 제약이라
 * 가장 크게 보여 준다.
 */
export function createHud() {
  const hud = document.getElementById('hud');
  const pips = Array.from(document.querySelectorAll('#hud-pips .pip'));
  const speedBlock = document.getElementById('hud-speed');
  const speedValue = document.getElementById('hud-speed-value');
  const pitchName = document.getElementById('hud-pitch-name');
  const countBlock = document.getElementById('hud-count');
  const strikesEl = document.getElementById('hud-strikes');
  const label = document.getElementById('chapter-label');
  const labelNo = label.querySelector('.chapter-label__no');
  const labelTitle = label.querySelector('.chapter-label__title');

  let lastPips = -1;
  let lastSpeed = -1;
  let lastStrikes = -1;
  let lastNo = -1;

  return {
    setVisible(v) {
      hud.classList.toggle('is-on', !!v);
    },

    /** 남은 공 개수 (0..3) */
    setPips(n) {
      const k = clamp(n, 0, 3);
      if (k === lastPips) return;
      lastPips = k;
      pips.forEach((pip, i) => pip.classList.toggle('is-spent', i >= k));
    },

    /**
     * @param {{kmh:number,name:string,reveal:number}|null} info
     */
    setSpeed(info) {
      if (!info) {
        if (lastSpeed !== -1) {
          speedBlock.hidden = true;
          lastSpeed = -1;
        }
        return;
      }
      speedBlock.hidden = false;
      // 비행 중에는 숫자가 올라가다가 포구 시점에 확정된다
      const shown = Math.round(info.kmh * (0.55 + 0.45 * easeOutCubic(clamp(info.reveal))));
      if (shown !== lastSpeed) {
        speedValue.textContent = String(shown);
        lastSpeed = shown;
      }
      if (pitchName.textContent !== info.name) pitchName.textContent = info.name;
    },

    setStrikes(n) {
      if (n === null || n === undefined) {
        if (lastStrikes !== -1) {
          countBlock.hidden = true;
          lastStrikes = -1;
        }
        return;
      }
      countBlock.hidden = false;
      if (n !== lastStrikes) {
        strikesEl.textContent = String(n);
        lastStrikes = n;
      }
    },

    setChapter(no, title) {
      if (no === lastNo) return;
      lastNo = no;
      labelNo.textContent = `CH.${no}`;
      labelTitle.textContent = title;
    },
    setChapterVisible(v) {
      label.classList.toggle('is-on', !!v);
    },

    reset() {
      lastPips = lastSpeed = lastStrikes = lastNo = -1;
    },
  };
}
