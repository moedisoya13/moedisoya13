import { clamp } from '../utils/easing.js';

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

/**
 * 컨트롤 바 — 재생/일시정지, 스크럽, 챕터 점프, 자막·사운드 토글.
 * 키보드: Space, ←/→, 1~8, M, C, R
 */
export function createControls(director, { subtitles, audio }) {
  const bar = document.getElementById('controls');
  const btnPlay = document.getElementById('btn-play');
  const btnReplay = document.getElementById('btn-replay');
  const btnCc = document.getElementById('btn-cc');
  const btnSound = document.getElementById('btn-sound');
  const scrub = document.getElementById('scrub');
  const fill = document.getElementById('scrub-fill');
  const knob = document.getElementById('scrub-knob');
  const marks = document.getElementById('scrub-marks');
  const chapters = document.getElementById('chapters');
  const timeNow = document.getElementById('time-now');
  const timeTotal = document.getElementById('time-total');

  const duration = director.duration;
  timeTotal.textContent = fmt(duration);
  scrub.setAttribute('aria-valuemax', String(duration));

  /* 챕터 눈금 + 칩 */
  const chips = [];
  director.chapters.forEach((ch) => {
    if (ch.t0 > 0) {
      const m = document.createElement('div');
      m.className = 'scrub__mark';
      m.style.left = `${(ch.t0 / duration) * 100}%`;
      marks.appendChild(m);
    }
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = String(ch.no);
    chip.title = `${ch.no}. ${ch.title}`;
    chip.addEventListener('click', () => {
      director.jumpToChapter(ch.no);
      director.play();
      wake();
    });
    chapters.appendChild(chip);
    chips.push(chip);
  });

  /* 스크럽 */
  let dragging = false;
  const timeFromEvent = (e) => {
    const rect = scrub.getBoundingClientRect();
    const x = (e.clientX ?? 0) - rect.left;
    return clamp(x / rect.width) * duration;
  };
  const startDrag = (e) => {
    dragging = true;
    scrub.setPointerCapture?.(e.pointerId);
    director.seek(timeFromEvent(e), { keepPlaying: false });
    wake();
  };
  scrub.addEventListener('pointerdown', startDrag);
  scrub.addEventListener('pointermove', (e) => {
    if (dragging) director.seek(timeFromEvent(e), { keepPlaying: false });
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    scrub.releasePointerCapture?.(e.pointerId);
  };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      director.nudge(e.key === 'ArrowLeft' ? -5 : 5);
    }
  });

  /* 버튼 */
  btnPlay.addEventListener('click', () => {
    director.toggle();
    wake();
  });
  btnReplay.addEventListener('click', () => {
    director.replay();
    wake();
  });
  btnCc.addEventListener('click', () => {
    const on = !subtitles.isEnabled();
    subtitles.setEnabled(on);
    btnCc.classList.toggle('is-on', on);
    wake();
  });
  btnSound.addEventListener('click', async () => {
    const on = await audio.toggle();
    btnSound.classList.toggle('is-on', !!on);
    audio.setPlaying(director.playing);
    wake();
  });

  /* 자동으로 흐려지는 컨트롤 바 */
  let wakeTimer = null;
  function wake() {
    bar.classList.add('is-awake');
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => bar.classList.remove('is-awake'), 2600);
  }
  window.addEventListener('pointermove', wake, { passive: true });
  wake();

  /* 키보드 */
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        director.toggle();
        wake();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        director.nudge(-5);
        wake();
        break;
      case 'ArrowRight':
        e.preventDefault();
        director.nudge(5);
        wake();
        break;
      case 'r':
      case 'R':
        director.replay();
        wake();
        break;
      case 'c':
      case 'C':
        btnCc.click();
        break;
      case 'm':
      case 'M':
        btnSound.click();
        break;
      default:
        if (/^[1-8]$/.test(e.key)) {
          director.jumpToChapter(Number(e.key));
          director.play();
          wake();
        }
    }
  });

  /* 상태 반영 */
  function sync() {
    const t = director.time;
    const pct = (t / duration) * 100;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    timeNow.textContent = fmt(t);
    scrub.setAttribute('aria-valuenow', t.toFixed(1));
    bar.classList.toggle('is-paused', !director.playing);
    btnPlay.setAttribute('aria-label', director.playing ? '일시정지' : '재생');

    const active = director.chapter.no;
    chips.forEach((chip, i) => chip.classList.toggle('is-active', i + 1 === active));
  }

  director.onChange(sync);
  sync();

  return { sync, wake };
}
