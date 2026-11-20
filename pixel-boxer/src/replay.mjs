/* The instant replay of a brilliant defence: what a card (and later the match screen) shows again, at a quarter of the speed,
   when the bout says a defence was brilliant (game/bout.mjs: a miss by a whisker, or on the last frame of the window, and a
   loaded punch back within 0.4 s). It keeps the last second or so of what is drawn, and when the counter has landed it plays
   back from the moment the other man's punch was pressed to a moment after the counter met him. While it plays, the bout
   is not stepped: its time stands still and goes on afterwards from where it stopped.
     const r = createReplay({ keep, slow, lead, tail, capture })
       keep: seconds kept (1); slow: the speed it plays at (0.25); lead: seconds before the punch was pressed it starts from
       (0.05); tail: seconds after the counter lands it goes on to, live, before it plays (0.25); capture(bout): what to keep
       of a step for drawing it again (by default both men's poses and places: captureBout)
     r.watch(bout, dt)   after every step of the bout: keeps the step, reads its events -> true on the step a replay starts
     r.playing           true while it plays (do not step the bout)
     r.next(dt)          the step to draw now, dt seconds of real time on (null once it is over: playing is false again)
     r.progress          0..1 through it */
export const captureBout = bout => ({
  t: bout.t,
  men: bout.fighters.map(f => ({ pose: f.pose, place: f.place, x: f.x, z: f.z, yaw: f.yaw, flash: f.flash, points: f.points }))
});

export function createReplay(o) {
  o = Object.assign({ keep: 1, slow: 0.25, lead: 0.05, tail: 0.25, capture: captureBout }, o);
  let kept = [], // { clock, t, snap }
    clock = 0,
    armed = null, // a brilliant defence seen: { from, who, counter }
    landed = null, // and its counter landed: the clock it did
    play = null; // { frames, at }
  return {
    get playing() {
      return !!play;
    },
    get progress() {
      return play ? Math.min(1, play.at / Math.max(1e-6, play.frames.length - 1)) : 0;
    },
    watch(bout, dt) {
      clock += dt;
      kept.push({ clock, t: bout.t, snap: o.capture(bout) });
      while (kept.length && kept[0].clock < clock - o.keep) kept.shift();
      for (const e of bout.events) {
        if (e.type === 'brilliant') (armed = { from: e.from, who: e.who, counter: e.counter }), (landed = null);
        // (the counter it was answered with: when it meets him, or misses, the replay goes on a moment and then plays)
        else if (armed && landed === null && e.who === armed.who && ['hit', 'whiff', 'block', 'graze'].includes(e.type)) {
          const f = bout.fighters[armed.who];
          if (f.action && f.action.id === armed.counter) landed = clock;
        }
      }
      if (armed && landed !== null && clock - landed >= o.tail - 1e-9) {
        const from = armed.from - o.lead,
          frames = kept.filter(k => k.t >= from - 1e-9).map(k => k.snap);
        armed = landed = null;
        if (frames.length > 1) {
          play = { frames, at: 0 };
          return true;
        }
      }
      return false;
    },
    next(dt) {
      if (!play) return null;
      const snap = play.frames[Math.min(play.frames.length - 1, Math.floor(play.at))];
      // (the steps were a sixtieth of a second apart: at a quarter of the speed each is shown four times as long)
      play.at += (dt * o.slow) / (1 / 60);
      if (play.at >= play.frames.length) play = null;
      return snap;
    },
    reset() {
      kept = [];
      armed = landed = play = null;
    }
  };
}
