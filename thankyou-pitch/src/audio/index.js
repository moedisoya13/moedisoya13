import { createAudioEngine } from './engine.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';

/** story.js가 쓰는 얇은 파사드. 사운드가 꺼져 있으면 전부 no-op이다. */
export function createAudio() {
  const engine = createAudioEngine();
  const sfx = createSfx(engine);
  const music = createMusic(engine);
  let pendingTension = 0;

  return {
    get enabled() {
      return engine.enabled;
    },

    async enable() {
      const ok = await engine.enable();
      if (!ok) return false;
      music.start();
      music.setTension(pendingTension);
      sfx.startAmbient();
      return true;
    },

    disable() {
      engine.disable();
    },

    async toggle() {
      if (engine.enabled) {
        this.disable();
        return false;
      }
      return this.enable();
    },

    cue(name, opts) {
      sfx.play(name, opts);
    },

    setTension(v) {
      pendingTension = v;
      music.setTension(v);
    },

    setPlaying(v) {
      music.setPlaying(v);
    },

    dispose() {
      music.dispose();
      engine.dispose();
    },
  };
}
