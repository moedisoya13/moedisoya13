import { CHAPTERS, TOTAL_DURATION, captionsAt, chapterAt } from './story.js';
import { clamp } from './utils/easing.js';

/**
 * 타임라인 디렉터.
 *
 * 화면 상태는 전부 chapter.apply(t)가 다시 만들어 내므로 어디로 시크하든
 * 결과가 같다. 되돌릴 수 없는 것(사운드)만 전진 재생 중 큐 교차 시에만 쏜다.
 */
export function createDirector(stage) {
  let t = 0;
  let playing = true;
  let lastCueT = 0;
  let finished = false;
  const listeners = new Set();

  const ctx = {
    t: 0,
    local: 0,
    p: 0,
    dt: 0,
    elapsed: 0,
    chapter: CHAPTERS[0],
    stage,
    runtime: null,
  };

  function notify() {
    for (const cb of listeners) cb(api);
  }

  /** (from, to] 구간에 걸린 큐를 순서대로 재생 */
  function fireCues(from, to) {
    for (const ch of CHAPTERS) {
      if (ch.t1 < from || ch.t0 > to) continue;
      for (const cue of ch.cues || []) {
        const at = ch.t0 + cue.at;
        if (at > from && at <= to) stage.audio.cue(cue.sfx, cue.opts);
      }
    }
  }

  /** 시각 t의 화면을 통째로 다시 만든다 */
  function applyAt(time, dt, elapsed) {
    const chapter = chapterAt(time);
    ctx.t = time;
    ctx.dt = dt;
    ctx.elapsed = elapsed;
    ctx.chapter = chapter;
    ctx.local = time - chapter.t0;
    ctx.p = clamp(ctx.local / (chapter.t1 - chapter.t0));
    ctx.runtime = null;

    chapter.apply(ctx);

    const shot = chapter.camera(ctx);
    stage.rig.apply(shot, time);

    stage.subtitles.render(captionsAt(chapter, ctx.local));
    stage.hud.setChapter(chapter.no, chapter.title);

    return chapter;
  }

  const api = {
    get time() {
      return t;
    },
    get duration() {
      return TOTAL_DURATION;
    },
    get playing() {
      return playing;
    },
    get finished() {
      return finished;
    },
    get chapters() {
      return CHAPTERS;
    },
    get chapter() {
      return chapterAt(t);
    },

    play() {
      if (finished) return api.replay();
      playing = true;
      stage.audio.setPlaying(true);
      notify();
      return api;
    },
    pause() {
      playing = false;
      stage.audio.setPlaying(false);
      notify();
      return api;
    },
    toggle() {
      return playing ? api.pause() : api.play();
    },

    /** 사운드 큐를 쏘지 않고 화면만 옮긴다 */
    seek(time, { keepPlaying = true } = {}) {
      t = clamp(time, 0, TOTAL_DURATION);
      lastCueT = t;
      finished = t >= TOTAL_DURATION - 1e-4;
      if (finished && keepPlaying) playing = false;
      applyAt(t, 0, performance.now() / 1000);
      notify();
      return api;
    },

    replay() {
      t = 0;
      lastCueT = 0;
      finished = false;
      playing = true;
      stage.audio.setPlaying(true);
      applyAt(0, 0, performance.now() / 1000);
      notify();
      return api;
    },

    jumpToChapter(no) {
      const ch = CHAPTERS.find((c) => c.no === no);
      if (ch) api.seek(ch.t0 + 0.001, { keepPlaying: false });
      return api;
    },

    nudge(seconds) {
      api.seek(t + seconds, { keepPlaying: false });
      return api;
    },

    /** @param {number} dt 초 @param {number} elapsed 앱 시작 이후 초 */
    update(dt, elapsed) {
      if (playing && !finished) {
        const prev = t;
        t = Math.min(t + dt, TOTAL_DURATION);
        fireCues(prev, t);
        lastCueT = t;
        if (t >= TOTAL_DURATION - 1e-4) {
          finished = true;
          playing = false;
          stage.audio.setPlaying(false);
          notify();
        }
      }
      applyAt(t, dt, elapsed);
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  return api;
}
