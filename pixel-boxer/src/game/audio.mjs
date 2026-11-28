/* The sounds of a bout, made on the spot (Web Audio; nothing is loaded, and nothing plays until the first touch has unlocked
   the audio context). Two halves:

     cuesOf(e, c)        what one event of the bout (game/bout.mjs bout.events) sounds like: a list of { name, o } cues. Pure:
                         the game and the sparring both hear the bout through it (audio.hear), so they cannot drift apart.
                         c: { men (the fighters, or a replay's captured men: x, z, and stamina / k.staminaMax if known),
                         pit (fought in the underground pit: its crowd, its concrete), you (the player's man, for the
                         counter-chance cue; null for none), replay (a replay is throwing it again: no crowd, no bell) }
     createEars()        what the bout's state sounds like from step to step, not its events: feet on the canvas by the
                         distance walked and on every beat of a bounce on the spot, the ropes pressed. ears.watch(men, dt, c)
                         -> cues.

     const audio = createAudio({ context, random })   context: an AudioContext (or OfflineAudioContext) to use instead of
                                                      making one at unlock; random: () => [0, 1) for the small variations
     audio.unlock()                  on the first touch (resumes a suspended context)
     audio.play(name, o)             one sound by name (SOUNDS) -> { name, level, dur, at, pan } or null if it was not played
                                     (locked, muted, too soon after the same one, or the voices all taken by louder ones)
                                     o: { who (whose voice / where to pan), pan (-1..1, instead of who), J, delay (s), rate
                                     (the speed the picture plays at: a slowed replay's sounds come lower and longer), ... }
     audio.hear(e, c)                cuesOf(e, c) played, panned by where each man stands in the picture (c.yaw, c.target:
                                     the camera's) -> what was played
     audio.watch(men, dt, c)         one step of the bout's state (createEars) played
     audio.ambience(kind)            'pit' starts the pit crowd's murmur loop, anything else fades it out
     audio.mute(on)                  everything off at once, what was already scheduled too (and nothing held kept); on again
                                     for what comes next
     audio.muted                     whether it is
     audio.ambient                   'pit' while the pit's murmur goes, else null
     audio.held                      the names of the cues held for later (the knockout's bell)

   The knockout's bell is held (a cue with o.ko): a page that replays a knockdown (the game, the sparring) calls hear with
   c.replay for what the replay throws again and watch for every live step, and the bell rings on the first live step after
   the replay (skipped or played out), or KO_WAIT seconds of live steps after the blow if no replay came; never over the
   replay. It also lets the pit's murmur go: the bout is over. A page that replays nothing says so (c.replays === false: the
   audition) and hears it at its own delay. A bell already ringing when a replay starts is cut short.
   A page hidden (another tab, another app) suspends the sound and a page shown again resumes it (document visibilitychange,
   pagehide / pageshow), whatever page it is on.

   The mix: every cue goes through its own gain and a stereo pan (±0.4 at the picture's edges) into one of the buses (MIX),
   the buses into a master gain, a compressor and a limiter, so stacked blows never clip. The voice, air, guard and feet
   buses go through a duck that a knockdown blow pulls down for a moment. At most LIMIT.voices cues sound at once (a louder
   one takes the place of the quietest; a quieter one than all of them is not played), and the same cue for the same man is
   not played again within its gap. */
import { MOVES } from '../anim/moves.mjs';

export const COUNTER_GAIN = 1.8; // RULES.counterGain (game/bout.mjs): a counter lands this much harder (tests/sfx.test.mjs holds them equal)
export const CLEAN = 85; // N·s: a clean cross; an impact's size is J over this
export const MIX = { voice: 0.85, impact: 1, guard: 0.8, air: 0.55, feet: 0.5, crowd: 0.55, bell: 0.45, ui: 0.35 };
// (red, blue: the breath's band and the voiced push scaled by pitch; low: the voiced fundamental in Hz)
export const VOICE = [{ pitch: 1.07, low: 132 }, { pitch: 0.92, low: 106 }];
export const LIMIT = { voices: 18, gap: 0.035, pan: 0.4, wide: 2.2 };
export const STRIDE = 0.38; // metres walked to a footstep
// (bouncing on the spot: a beat of his feet is a soft step if he went less than this far since the one before)
export const SPOT = 0.12;
// (seconds of live steps after a knockout's blow that its bell waits for a replay, if none comes: past the longest a
// knockdown's replay waits to start, replay.mjs FALL.most 2.5)
export const KO_WAIT = 2.6;
// (events that make no sound of their own: a guard put up, a power press meant as a shift, where the glove went on to, the
// wave held, and a brilliant defence, whose whiff or parry speaks for it; a man doubled up going down, since the struck man's
// own voice was dropped (the user's answer of 2026-11-28, sound-hurt): his blow said it)
export const QUIET = ['cover', 'shell', 'shift', 'follow', 'wave', 'brilliant', 'buckle'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// (how far a fighter is spent, 0 fresh .. 1 out of breath: as his body shows it, game/bout.mjs view.tired)
export const tiredOf = f => (f && f.k && f.k.staminaMax && f.stamina !== undefined ? clamp((0.6 - f.stamina / f.k.staminaMax) / 0.6, 0, 1) : 0);
// (a punch by name: its kind, straight | hook | upper, and its hand, L | R; and whether it is a power blow, the rear hand's
// hook or uppercut or a named big one)
export function punchOf(name) {
  const m = (name && MOVES[name]) || {},
    kind = m.kind || 'straight',
    hand = m.hand || 'L',
    breath = kind === 'straight' ? (hand === 'L' ? 'jab' : 'straight') : kind;
  return { kind, hand, breath, power: (hand === 'R' && kind !== 'straight') || name === 'crossOver' || name === 'shiftHook' };
}

/* ---- the mapping: one event -> its cues */
export function cuesOf(e, c) {
  c = c || {};
  const men = c.men || [],
    out = [],
    cue = (name, o) => out.push({ name, o: o || {} });
  switch (e && e.type) {
    case 'punch': {
      const p = punchOf(e.name);
      cue('breath', { who: e.who, kind: p.breath, power: p.power, tired: tiredOf(men[e.who]) });
      if (p.power || p.kind !== 'straight') cue('swing', { who: e.who, kind: p.kind, power: p.power });
      break;
    }
    case 'taunt':
      cue('breath', { who: e.who, kind: 'straight', soft: 0.35, tired: tiredOf(men[e.who]) });
      break;
    case 'hit': {
      const J = e.J * (e.counter ? COUNTER_GAIN : 1),
        where = e.part === 'body' ? 'body' : 'head',
        down = !!(e.down || e.out);
      // (no "욱" or "헉" from the struck man: dropped, the user's answer of 2026-11-28, sound-hurt; a knockdown's breath going
      // out of him stays)
      cue('impact', { who: e.on, J, where, counter: !!e.counter, down });
      if (down) cue('exhale', { who: e.on, delay: 0.12 });
      // (the pit's crowd at a power blow, a counter or a knockdown: as world/pit.mjs has them react)
      if (c.pit && !c.replay && (down || e.J >= 60 || e.counter)) cue(down ? 'roar' : 'cheer');
      // (the knockout's bell: held by createAudio until the knockdown has been shown, its replay included)
      if (down && !c.replay) cue('bell', { strikes: 3, delay: 1.1, ko: true });
      break;
    }
    case 'block':
      cue('block', { who: e.on, J: e.J, part: e.part, roll: !!e.roll });
      break;
    case 'parry':
      cue('parry', { who: e.who, J: e.J, hammer: !!e.hammer, down: !!e.down });
      if (c.you !== undefined && c.you !== null && e.who === c.you && !c.replay) cue('chance', { delay: 0.1 });
      break;
    case 'graze':
      cue('graze', { who: e.on });
      break;
    case 'whiff':
      // (the air of a glove going past his ear: heard where the man it missed is)
      cue('whiff', { who: e.who === 0 || e.who === 1 ? 1 - e.who : undefined, kind: punchOf(e.name).kind });
      break;
    case 'slip':
    case 'duck':
    case 'roll':
    case 'pull':
    case 'collar':
      cue('evade', { who: e.who, kind: e.type });
      break;
    case 'duckIn':
      cue('evade', { who: e.who, kind: 'duck' });
      cue('dash', { who: e.who, pit: !!c.pit });
      break;
    case 'dash':
    case 'hopPivot':
    case 'hopCircle':
      cue('dash', { who: e.who, pit: !!c.pit });
      break;
    case 'paw':
      cue('block', { who: e.on, J: 12, part: 'glove' });
      break;
    case 'foul':
      if (e.name === 'stomp') cue('step', { who: e.on, v: 3, pit: !!c.pit });
      else cue('graze', { who: e.on });
      break;
    // (the match's, not the bout's: a man up too late going down again, game/match.mjs; his breath going out of him, as a
    // knockdown's does; his knee on the canvas is the page's floor)
    case 'collapse':
      cue('exhale', { who: e.who });
      break;
    // (not the bout's: the page says when a man knocked down comes down on the canvas, render/blow.mjs landed)
    case 'floor':
      cue('floor', { who: e.who, pit: !!c.pit });
      break;
  }
  return out;
}

/* ---- what the state sounds like, step by step: his feet (a step for every stride walked, and, bouncing on the spot, one for
   every beat a foot comes down: the animator's rhythm, game/bout.mjs f.animator.rhythm.halves; the user's answer of
   2026-11-28, sound-steps), and the ropes taking him. (No panting: the spent man's voice was dropped, sound-hurt.) */
export function createEars() {
  let seen = [];
  return {
    reset() {
      seen = [];
    },
    watch(men, dt, c) {
      c = c || {};
      const out = [];
      (men || []).forEach((f, i) => {
        if (!f) return;
        const s = seen[i],
          beat = f.animator && f.animator.rhythm ? f.animator.rhythm : null;
        if (!s) return void (seen[i] = { x: f.x, z: f.z, walked: 0, rope: 0, ropeAt: -9, t: 0, halves: beat ? beat.halves : null, since: 0 });
        s.t += dt;
        const d = Math.hypot(f.x - s.x, f.z - s.z);
        s.x = f.x;
        s.z = f.z;
        // (a man down, one in a dash (it has its own scuff), or one put somewhere new: no steps)
        const off = f.down || (f.action && f.action.name === 'dash') || d > 0.5;
        if (off) s.walked = 0;
        else if ((s.walked += d) >= STRIDE) (s.walked -= STRIDE), out.push({ name: 'step', o: { who: i, v: d / Math.max(dt, 1e-6), pit: !!c.pit } });
        // (a foot coming down on the beat while he bounces where he stands: doing nothing else, and not gone a stride's way)
        if (beat) {
          s.since += d;
          if (s.halves !== null && beat.halves !== s.halves) {
            if (!off && !f.action && !beat.stopped && s.since < SPOT) out.push({ name: 'step', o: { who: i, v: 0.5, bounce: true, pit: !!c.pit } });
            s.since = 0;
          }
          s.halves = beat.halves;
        }
        // (the ropes taking him: the first moment he is pressed well onto them)
        const press = f.rope ? f.rope.press || 0 : 0;
        if (!c.pit && press > 0.35 && s.rope <= 0.35 && s.t - s.ropeAt > 0.5) (s.ropeAt = s.t), out.push({ name: 'rope', o: { who: i, press } });
        s.rope = press;
      });
      return out;
    }
  };
}

// (where a man is in the picture, -1 left .. 1 right, by the camera's yaw and target: the screen's right is (cos, -sin) on
// the canvas, as the game's stick has it)
export function panOf(c, who) {
  const f = c && c.men && c.men[who];
  if (!f || f.x === undefined) return 0;
  const yaw = c.yaw || 0,
    t = c.target || [0, 0, 0],
    across = (f.x - t[0]) * Math.cos(yaw) - (f.z - t[2]) * Math.sin(yaw);
  return clamp(across / LIMIT.wide, -1, 1) * LIMIT.pan;
}

/* ---- the sounds: each makes itself with the kit at its moment (k) from its options (o) and says its level and length.
   bus: which gain it goes through; pri: who gives way when the voices are all taken (the lowest first); gap: seconds before
   the same one for the same man again. (Changed 2026-11-28 by the user's answers on the audition's cards: the breath, the
   blows, the blocks and parries, the feet, the bell and the crowd made again, the struck man's voice dropped; what each was
   and is, measured, in README's sound section.) */
const DOWN = 1.3; // a knockdown's blow is never lighter than this much of a clean cross (110 N·s): its sub and its length
const SOUNDS = {
  // the breath blown out as a punch goes: not through the teeth (the old "tss") but out of the mouth, a short "훅": the lips
  // letting go (a tick), then the air through the open mouth in two bands (its vowel), gliding down as it empties; a jab's
  // short and a little brighter, a hook's and an uppercut's longer and sweeping further down; a power blow's with a voiced
  // push under it ("흡"); a tired man's longer, lower, with a rasp under it
  breath: {
    bus: 'voice',
    pri: 3,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0],
        tired = o.tired || 0,
        [len, f1, f2, glide, lvl] = { jab: [0.07, 1500, 3200, 0.9, 0.85], straight: [0.095, 1300, 2900, 0.84, 1], hook: [0.12, 1350, 2800, 0.66, 1], upper: [0.13, 1200, 2600, 0.64, 1] }[o.kind] || [0.095, 1300, 2900, 0.84, 1],
        pitch = v.pitch * k.vary(0.04) * (1 - 0.18 * tired),
        dur = len * k.vary(0.08) * (1 + 0.7 * tired);
      k.noise({ type: 'highpass', f: 3600 * pitch, attack: 0.0008, dur: 0.007, peak: 0.5 });
      k.noise({ f: f1 * pitch, to: f1 * pitch * glide, q: 1.3, attack: 0.004, dur, peak: 1 });
      k.noise({ f: f2 * pitch, to: f2 * pitch * glide, q: 1.7, attack: 0.003, dur: dur * 0.8, peak: 0.55 });
      if (tired > 0.05) k.noise({ f: 650 * v.pitch, to: 480 * v.pitch, q: 0.9, attack: 0.012, dur: dur * 1.25, peak: 0.5 * tired });
      if (o.power) k.voiced({ f: v.low * 1.12 * k.vary(0.03), to: v.low * 0.9, formants: [[640, 3, 1], [1150, 4, 0.4]], attack: 0.006, dur: 0.075, peak: 0.55 });
      return { level: 1.6 * lvl * k.vary(0.15) * (o.soft === undefined ? 1 : o.soft) * (1 - 0.12 * tired), dur: dur * 1.25 };
    }
  },
  // the air a big arc moves: soft, under the breath (hooks, uppercuts, power blows)
  swing: {
    bus: 'air',
    pri: 2,
    make(k, o) {
      const up = o.kind === 'upper',
        dur = (o.power ? 0.2 : 0.17) * k.vary(0.08);
      k.noise({ f: up ? 520 : 450, to: up ? 1500 : 1300, q: 0.8, attack: dur * 0.45, dur: dur * 0.55, peak: 1 });
      return { level: (o.power ? 0.26 : 0.2) * k.vary(0.1), dur };
    }
  },
  // leather on flesh, sized by the impulse: lower than before and not a drum's sine alone, the weight going in as a short
  // burst through a resonant lowpass sweeping down ("thup") over a low falling thud; for heavy blows a sub drop under it and a
  // longer body. The head's with a bright "팍" of leather on bone that lasts (60 ms and more), the body's duller, lower, longer;
  // a counter's with a crack in it; a knockdown's at least as heavy as a heavy blow (DOWN), however light the punch
  impact: {
    bus: 'impact',
    pri: 4,
    gap: 0.02,
    make(k, o) {
      const down = !!o.down,
        s = Math.max(clamp((o.J === undefined ? 60 : o.J) / CLEAN, 0.12, 2), down ? DOWN : 0),
        heavy = smooth(0.5, 1.3, s),
        head = o.where !== 'body',
        thump = (head ? 0.09 : 0.14) + 0.1 * s;
      k.tone({ type: 'sine', f: (head ? 92 : 74) * (1.08 - 0.1 * s), to: (head ? 44 : 35) * (1.05 - 0.08 * s), attack: 0.002, dur: thump, peak: head ? 0.8 : 1 });
      k.noise({ type: 'lowpass', f: head ? 260 : 200, to: head ? 110 : 85, q: 3, attack: 0.0015, dur: (head ? 0.05 : 0.07) + 0.03 * s, peak: head ? 1.1 : 1.3 });
      if (head) {
        k.noise({ f: 3000, to: 2200, q: 0.8, hp: 1800, attack: 0.0008, dur: 0.06 + 0.02 * s, peak: 1.5 });
        k.noise({ type: 'highpass', f: 5200, attack: 0.0006, dur: 0.022 + 0.01 * s, peak: 0.8 });
      } else {
        k.noise({ f: 650 * (1 - 0.1 * s), q: 0.8, attack: 0.001, dur: 0.04 + 0.025 * s, peak: 0.6 });
        k.noise({ type: 'lowpass', f: 380, attack: 0.002, dur: 0.09 + 0.07 * s, peak: 0.55 });
      }
      let dur = thump;
      if (heavy > 0) {
        const sub = (head ? 0.2 : 0.28) + 0.25 * s + (down ? 0.25 : 0);
        k.tone({ type: 'sine', f: 50, to: 26, attack: 0.004, dur: sub, peak: (head && !down ? 0.55 : 0.9) * heavy });
        k.noise({ type: 'lowpass', f: 420, attack: 0.003, dur: 0.15 + 0.15 * s, peak: 0.35 * heavy });
        dur = Math.max(dur, sub);
      }
      if (o.counter) k.noise({ type: 'bandpass', f: 4200, q: 0.8, hp: 2500, attack: 0.0006, dur: 0.014, peak: 0.9 });
      if (down) k.duck(0.35, 0.45);
      return { level: (0.26 + 0.42 * Math.pow(s, 0.8)) * (down ? 1.15 : 1), dur };
    }
  },
  // glove on glove and forearm: padded leather meeting, a dull "퍽" through a resonant lowpass falling and the arm's low knock
  // under it, the leather's skin a short soft slap (lower than the old tick), no sub, no metal (a shoulder rolled off: softer,
  // with a brush after it)
  block: {
    bus: 'guard',
    pri: 3,
    make(k, o) {
      const s = clamp((o.J === undefined ? 50 : o.J) / CLEAN, 0.1, 1.6),
        glove = o.part === 'glove',
        shoulder = o.part === 'shoulder',
        c = glove ? 520 : shoulder ? 300 : 380,
        dur = 0.035 + 0.025 * s;
      k.noise({ type: 'lowpass', f: c * (1 - 0.1 * s), to: c * 0.6, q: 2.2, attack: 0.0015, dur, peak: 1 });
      k.tone({ type: 'sine', f: glove ? 150 : 125, to: glove ? 90 : 75, attack: 0.002, dur: 0.05 + 0.02 * s, peak: 0.5 });
      k.noise({ f: 1100, q: 1.2, attack: 0.001, dur: 0.012, peak: glove ? 0.3 : 0.15 });
      if (shoulder) k.noise({ f: 600, to: 380, q: 0.9, attack: 0.02, dur: 0.12, peak: 0.45, at: 0.01 });
      return { level: (0.375 + 0.45 * s) * (shoulder ? 1.14 : 1), dur: Math.max(dur, shoulder ? 0.15 : 0.07) };
    }
  },
  // a punch turned aside: a lighter, quicker "탁", lower than before (a hammer or a press down: a little more weight)
  parry: {
    bus: 'guard',
    pri: 3,
    make(k, o) {
      k.noise({ f: 1000, q: 1.6, attack: 0.0008, dur: 0.016, peak: 1 });
      k.noise({ type: 'lowpass', f: 520, q: 2, attack: 0.002, dur: 0.03, peak: 0.8, at: 0.004 });
      if (o.hammer || o.down) k.tone({ type: 'triangle', f: 170, to: 105, attack: 0.002, dur: 0.06, peak: 0.45, lp: 700, at: 0.004 });
      return { level: o.hammer || o.down ? 1.9 : 1.75, dur: 0.07 };
    }
  },
  // a touch that was no punch: a thin brush
  graze: {
    bus: 'guard',
    pri: 2,
    make(k) {
      k.noise({ f: 4800, q: 0.7, hp: 2800, attack: 0.01, dur: 0.06, peak: 1 });
      return { level: 0.3, dur: 0.07 };
    }
  },
  // a slip, a duck, a weave, a pull: cloth and air
  evade: {
    bus: 'air',
    pri: 2,
    make(k, o) {
      const low = o.kind === 'duck' || o.kind === 'roll' ? 0.75 : o.kind === 'pull' ? 0.9 : 1,
        dur = 0.16 * k.vary(0.1);
      k.noise({ f: 600 * low, to: 1500 * low, q: 0.7, attack: dur * 0.35, dur: dur * 0.65, peak: 1 });
      k.noise({ f: 2400, q: 0.6, attack: 0.02, dur: 0.06, peak: 0.25 });
      return { level: 0.32 * k.vary(0.1), dur };
    }
  },
  // the glove that missed, going past his ear
  whiff: {
    bus: 'air',
    pri: 2,
    make(k, o) {
      const dur = (o.kind === 'straight' ? 0.12 : 0.15) * k.vary(0.08);
      k.noise({ f: 2000, to: 600, q: 0.9, attack: 0.02, dur, peak: 1 });
      return { level: 0.36 * k.vary(0.1), dur };
    }
  },
  // knocked down: a long breath going out of him
  exhale: {
    bus: 'voice',
    pri: 3,
    gap: 0.5,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0];
      k.noise({ f: 1400 * v.pitch, to: 700 * v.pitch, q: 0.8, attack: 0.05, dur: 0.6, peak: 1 });
      k.voiced({ f: v.low * 0.85, to: v.low * 0.68, formants: [[420, 2.5, 1]], attack: 0.04, dur: 0.5, peak: 0.25, at: 0.03 });
      return { level: 0.3, dur: 0.65 };
    }
  },
  // a foot on the canvas: quieter than before and not a scrape, a soft padded pat of the sole (a resonant low band) with the
  // faintest canvas hiss (a bounce's shorter and softer still); in the pit, two grains of grit on concrete
  step: {
    bus: 'feet',
    pri: 1,
    gap: 0.08,
    make(k, o) {
      const v = clamp((o.v || 1) / 1.5, 0.3, 1.6);
      k.noise({ type: 'lowpass', f: 240, to: 150, q: 1.6, attack: 0.003, dur: o.bounce ? 0.03 : 0.04, peak: 1 });
      if (o.pit) k.noise({ f: 3000, q: 1.2, hp: 2200, attack: 0.001, dur: 0.012, peak: 0.35 }), k.noise({ f: 3600, q: 1.2, hp: 2200, attack: 0.001, dur: 0.01, peak: 0.25, at: 0.018 });
      else k.noise({ type: 'highpass', f: 2600, attack: 0.004, dur: 0.025, peak: 0.04 });
      return { level: 0.7 * v * (o.bounce ? 0.6 : 1) * k.vary(0.2), dur: 0.05 };
    }
  },
  // a quick step: quieter, and the shoe's drag on the canvas, a falling scuff and its pat, in place of the old squeak (in the
  // pit, grit dragged)
  dash: {
    bus: 'feet',
    pri: 2,
    gap: 0.1,
    make(k, o) {
      k.noise({ type: 'lowpass', f: 300, to: 170, q: 1.6, attack: 0.002, dur: 0.035, peak: 1 });
      if (o.pit) k.noise({ f: 2800, to: 2000, q: 0.8, hp: 1800, attack: 0.003, dur: 0.06, peak: 0.45 });
      else k.noise({ f: 900, to: 450, q: 1.2, attack: 0.006, dur: 0.06, peak: 0.5 });
      return { level: (o.pit ? 0.44 : 1.6) * k.vary(0.1), dur: 0.07 };
    }
  },
  // a man coming down on the floor: a body's thud, not a drum's boom (its weight through a resonant lowpass over a low sine),
  // the slap of him on the canvas; the ring's boards under it with a short hollow knock and the ropes shaken, the pit's
  // concrete dead and dry, with grit
  floor: {
    bus: 'impact',
    pri: 4,
    gap: 0.3,
    make(k, o) {
      const dur = o.pit ? 0.22 : 0.4;
      k.tone({ type: 'sine', f: 58, to: 30, attack: 0.004, dur, peak: 1 });
      k.noise({ type: 'lowpass', f: o.pit ? 420 : 170, to: o.pit ? 200 : 80, q: o.pit ? 1 : 3, attack: 0.003, dur: o.pit ? 0.12 : 0.3, peak: 1 });
      k.noise({ f: o.pit ? 1600 : 480, q: 0.9, attack: 0.001, dur: o.pit ? 0.03 : 0.06, peak: o.pit ? 0.5 : 0.45 });
      if (o.pit) k.noise({ f: 3200, q: 0.6, hp: 2000, attack: 0.001, dur: 0.025, peak: 0.25 });
      else {
        k.tone({ type: 'sine', f: 96, to: 92, attack: 0.004, dur: 0.22, peak: 0.25 });
        k.tone({ type: 'sine', f: 143, to: 139, attack: 0.004, dur: 0.16, peak: 0.15 });
        k.noise({ f: 1300, q: 7, attack: 0.01, dur: 0.18, peak: 0.1, at: 0.03 });
      }
      return { level: 0.62, dur: o.pit ? 0.22 : 0.42 };
    }
  },
  // the ropes taking a man's weight: quieter, a low thrum as the rope gives and its cover creaking on the posts (a few short
  // grains, close and uneven), in place of the old hum and buzz
  rope: {
    bus: 'feet',
    pri: 2,
    gap: 0.5,
    make(k, o) {
      k.tone({ type: 'sine', f: 74, to: 70, attack: 0.02, dur: 0.3, peak: 0.5 });
      k.tone({ type: 'triangle', f: 148, to: 141, attack: 0.02, dur: 0.18, peak: 0.12, lp: 600 });
      [0, 0.022, 0.05, 0.071, 0.1, 0.135].forEach((at, i) => k.noise({ f: (950 + 130 * (i % 3)) * k.vary(0.06), q: 9, attack: 0.001, dur: 0.012, peak: 0.4 - 0.04 * i, at }));
      return { level: (0.12 + 0.2 * clamp(o.press || 0.5, 0, 1)) * 0.55, dur: 0.32 };
    }
  },
  // the pit's crowd (world/pit.mjs): a cheer at a power blow or a counter, a roar at a knockdown; many people, not one band
  // of noise: knots of them each in a vowel's band, coming in at their own moments (as the figures jump, 0.04-0.3 s late),
  // voices among them going up ("와!"), and in a cheer hands clapping
  cheer: { bus: 'crowd', pri: 2, gap: 0.4, make: k => (k.crowd({ dur: 1.1, bands: 6, voices: 5, claps: 10, low: 450, high: 2600 }), { level: 0.23, dur: 1.1 }) },
  roar: { bus: 'crowd', pri: 3, gap: 1, make: k => (k.crowd({ dur: 3.2, bands: 8, voices: 8, claps: 6, low: 380, high: 2800 }), { level: 0.45, dur: 3.2 }) },
  // the ring bell: one strike at the start, three quick ones at the knockout. A struck brass dome: the hammer's click and
  // first clang, then six of the dome's modes (1, 2.04, 2.76, 4.07, 5.4, 6.9 times 820 Hz), each a close pair 1.2 Hz apart
  // a mode (the shimmer a real bell has), the higher dying first, the lowest ringing on 2.2 s
  bell: {
    bus: 'bell',
    pri: 5,
    gap: 0.5,
    make(k, o) {
      const n = o.strikes || 1;
      for (let i = 0; i < n; i++) {
        const at = i * 0.3,
          hard = i ? 0.92 : 1;
        k.noise({ type: 'highpass', f: 4000, attack: 0.0004, dur: 0.006, peak: 0.45 * hard, at });
        k.noise({ f: 3300, q: 3, attack: 0.0006, dur: 0.03, peak: 0.25 * hard, at });
        for (const [r, peak, dur] of BELL) for (const side of [-1, 1]) k.tone({ type: 'sine', f: 820 * r + side * 1.2 * r, to: (820 * r + side * 1.2 * r) * 0.999, attack: 0.0015, dur, peak: peak * 0.55 * hard, at });
      }
      return { level: n > 1 ? 0.24 : 0.3, dur: (n - 1) * 0.3 + 2.2 };
    }
  },
  // the result, as before: up for a win, down for a loss
  win: { bus: 'ui', pri: 5, make: k => ([523, 659, 784, 1047].forEach((f, i) => k.tone({ type: 'triangle', f, to: f, attack: 0.004, dur: 0.16, peak: 1, at: i * 0.1 })), { level: 0.5, dur: 0.5 }) },
  lose: { bus: 'ui', pri: 5, make: k => ([392, 330, 262, 196].forEach((f, i) => k.tone({ type: 'triangle', f, to: f * 0.97, attack: 0.004, dur: 0.24, peak: 1, at: i * 0.16 })), { level: 0.55, dur: 0.75 }) },
  // the player's man turned a punch aside: his counter is open (the game's HUD says so too)
  chance: { bus: 'ui', pri: 2, make: k => (k.tone({ type: 'triangle', f: 880, to: 880, attack: 0.004, dur: 0.07, peak: 1 }), k.tone({ type: 'triangle', f: 1320, to: 1320, attack: 0.004, dur: 0.12, peak: 1, at: 0.07 }), { level: 0.3, dur: 0.2 }) }
};
// (the bell's modes: [times its lowest, peak, seconds])
const BELL = [[1, 1, 2.2], [2.04, 0.5, 1.3], [2.76, 0.42, 1], [4.07, 0.22, 0.6], [5.4, 0.14, 0.4], [6.9, 0.07, 0.25]];
// (the old names, from before: kept for any caller still using them)
const OLD = { hit: ['impact', { J: 60 }], heavy: ['impact', { J: 110 }], deflect: ['parry', {}], dodge: ['evade', {}] };
export const NAMES = [...Object.keys(SOUNDS), ...Object.keys(OLD)];

export function createAudio(opts) {
  opts = opts || {};
  const random = opts.random || Math.random,
    ears = createEars(),
    last = new Map();
  let ctx = null,
    noise = null,
    master = null,
    duck = null,
    buses = null,
    muted = false,
    active = [],
    murmur = null,
    wantMurmur = false,
    // (cues held for later: the knockout's bell; the live steps' seconds watched, to time them by; and whether the sound was
    // suspended because the page was hidden)
    held = [],
    stepT = 0,
    asleep = false;
  function build(c) {
    ctx = c;
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // buses -> (the duck, for the quieter ones) -> master -> compressor -> limiter -> out
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    duck = ctx.createGain();
    duck.connect(master);
    const comp = ctx.createDynamicsCompressor(),
      lim = ctx.createDynamicsCompressor(),
      trim = ctx.createGain();
    [[comp, -18, 12, 4, 0.003, 0.2], [lim, -3, 0, 20, 0.001, 0.08]].forEach(([n, th, knee, ratio, attack, release]) => {
      n.threshold.value = th;
      n.knee.value = knee;
      n.ratio.value = ratio;
      n.attack.value = attack;
      n.release.value = release;
    });
    trim.gain.value = 0.85;
    master.connect(comp).connect(lim).connect(trim).connect(ctx.destination);
    buses = {};
    for (const [name, g] of Object.entries(MIX)) {
      const b = ctx.createGain();
      b.gain.value = g;
      b.connect(name === 'impact' || name === 'bell' || name === 'crowd' || name === 'ui' ? master : duck);
      buses[name] = b;
    }
    if (wantMurmur) ambience('pit');
  }
  function unlock() {
    try {
      if (ctx) return ctx.state === 'suspended' && ctx.resume && ((asleep = false), ctx.resume());
      if (opts.context) return build(opts.context);
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AC) build(new AC());
    } catch {
      ctx = null; // (no audio here: everything stays silent)
    }
  }
  // (the page hidden: the sound suspended, so nothing goes on in the background; shown again: resumed, if it was running.
  // Not an offline context's: it renders on its own clock)
  const doc = globalThis.document;
  function sleep(hidden) {
    try {
      if (!ctx || typeof ctx.startRendering === 'function' || !ctx.suspend) return;
      if (hidden && ctx.state === 'running') (asleep = true), ctx.suspend();
      else if (!hidden && asleep) (asleep = false), ctx.resume();
    } catch {
      asleep = false;
    }
  }
  if (doc && doc.addEventListener) {
    doc.addEventListener('visibilitychange', () => sleep(!!doc.hidden));
    if (globalThis.addEventListener) {
      globalThis.addEventListener('pagehide', () => sleep(true));
      globalThis.addEventListener('pageshow', () => sleep(!!doc.hidden));
    }
  }

  // ---- the kit a sound makes itself with: everything at its moment t, its pitch scaled by p and its lengths by L
  function kitAt(t, out, p, L) {
    const nyq = ctx.sampleRate * 0.45,
      hz = f => clamp(f * p, 20, nyq),
      ends = [],
      env = (g, at, peak, attack, dur, clip) => {
        const a = Math.max(0.0005, attack * L),
          d = Math.max(0.004, dur * L);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), at + a);
        if (clip) g.gain.setValueAtTime(Math.max(0.0002, peak * 0.7), at + a + d * 0.8), g.gain.linearRampToValueAtTime(0.0001, at + a + d);
        else g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
        return at + a + d;
      },
      filter = (type, f, q) => {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = hz(f);
        if (q) b.Q.value = q;
        return b;
      },
      chain = (src, nodes, g) => {
        let n = src;
        for (const x of nodes) n = n.connect(x);
        n.connect(g).connect(out);
      };
    const kit = {
      ends,
      vary: amount => 1 + (random() * 2 - 1) * amount,
      // filtered noise: a band (or a highpass / lowpass, resonant by q if given) swept from f to `to`, with an extra
      // highpass `hp` if asked; loop: for one longer than the noise kept (2 s)
      noise(o) {
        const at = t + (o.at || 0) * L,
          src = ctx.createBufferSource(),
          band = filter(o.type || 'bandpass', o.f, o.q || (o.type === 'highpass' || o.type === 'lowpass' ? 0.7 : 1)),
          g = ctx.createGain(),
          nodes = [band];
        src.buffer = noise;
        if (o.loop) src.loop = true;
        band.frequency.setValueAtTime(hz(o.f), at);
        if (o.to) band.frequency.exponentialRampToValueAtTime(hz(o.to), at + (o.attack + o.dur) * L);
        if (o.hp) nodes.push(filter('highpass', o.hp, 0.7));
        const end = env(g, at, o.peak, o.attack, o.dur, o.clip);
        chain(src, nodes, g);
        src.start(at, random() * 1.2);
        src.stop(end + 0.05);
        ends.push(end);
      },
      // a tone falling (or rising) from f to `to`, through a lowpass `lp` if asked
      tone(o) {
        const at = t + (o.at || 0) * L,
          osc = ctx.createOscillator(),
          g = ctx.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(hz(o.f), at);
        osc.frequency.exponentialRampToValueAtTime(hz(o.to || o.f), at + (o.attack + o.dur) * L);
        const end = env(g, at, o.peak, o.attack, o.dur);
        chain(osc, o.lp ? [filter('lowpass', o.lp, 0.7)] : [], g);
        osc.start(at);
        osc.stop(end + 0.05);
        ends.push(end);
      },
      // a voice: a buzz at f falling to `to`, through its formants ([centre Hz, Q, weight]) and a lowpass `lp` if asked
      voiced(o) {
        const at = t + (o.at || 0) * L,
          osc = ctx.createOscillator(),
          g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(hz(o.f), at);
        osc.frequency.exponentialRampToValueAtTime(hz(o.to || o.f), at + (o.attack + o.dur) * L);
        const end = env(g, at, o.peak, o.attack, o.dur);
        for (const [f, q, w] of o.formants) {
          const b = filter('bandpass', f, q),
            wg = ctx.createGain();
          wg.gain.value = w;
          osc.connect(b).connect(wg);
          if (o.lp) wg.connect(filter('lowpass', o.lp, 0.7)).connect(g);
          else wg.connect(g);
        }
        g.connect(out);
        osc.start(at);
        osc.stop(end + 0.05);
        ends.push(end);
      },
      /* a crowd over `dur` seconds (its swell at about a quarter of it, then dying away): `bands` knots of people, each the noise
         through a vowel's band between `low` and `high` Hz, coming in at its own moment (0.04-0.3 s late, as the figures
         jump); `voices` of them going up together, a buzz through the "아" / "오" formants; and `claps` hands, short bright
         grains through the swell */
      crowd(o) {
        const D = o.dur;
        for (let i = 0; i < o.bands; i++) {
          const late = 0.04 + 0.26 * random(),
            f = o.low * Math.pow(o.high / o.low, (i + 0.5 * random()) / o.bands);
          kit.noise({ f, to: f * (0.85 + 0.1 * random()), q: 1.4, attack: 0.22 * D, dur: 0.75 * D - late, peak: 1 / Math.sqrt(o.bands), at: late, loop: true });
        }
        for (let i = 0; i < o.voices; i++) {
          const late = 0.04 + 0.26 * random(),
            f = 150 + 120 * random(),
            ah = i % 2 === 0;
          kit.voiced({ f, to: f * (1.2 + 0.15 * random()), formants: ah ? [[750, 4, 1], [1200, 5, 0.6], [2600, 6, 0.2]] : [[480, 4, 1], [900, 5, 0.5], [2500, 6, 0.15]], attack: 0.18 * D, dur: 0.55 * D, peak: 0.6 / o.voices, at: late });
        }
        for (let i = 0; i < o.claps; i++) kit.noise({ f: 1600 + 900 * random(), q: 1.1, hp: 900, attack: 0.001, dur: 0.012, peak: 0.25, at: 0.12 * D + 0.6 * D * random() });
      },
      // the quieter buses pulled down to `to` and let back up over `back` seconds (a knockdown blow)
      duck(to, back) {
        const g = duck.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(1, t);
        g.linearRampToValueAtTime(to, t + 0.02);
        g.setTargetAtTime(1, t + 0.02 + back * L * 0.4, back * L * 0.3);
      }
    };
    return kit;
  }

  // (a voice silenced now, over `over` seconds, and let go)
  function hush(v, now, over) {
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(v.level, now);
    v.out.gain.linearRampToValueAtTime(0.0001, now + over);
    v.end = Math.min(v.end, now + over);
  }
  function play(name, o) {
    try {
      o = o || {};
      if (OLD[name]) return play(OLD[name][0], Object.assign({}, OLD[name][1], o));
      const s = SOUNDS[name];
      if (!ctx || muted || !s) return null;
      const now = ctx.currentTime,
        t = now + Math.max(0, o.delay || 0) / Math.sqrt(clamp(o.rate || 1, 0.05, 4)),
        rate = clamp(o.rate || 1, 0.05, 4),
        p = Math.sqrt(rate),
        L = 1 / p,
        key = name + ':' + (o.who === undefined ? '' : o.who);
      // (the same one for the same man too soon after: not again)
      if (last.has(key) && t - last.get(key) < (s.gap === undefined ? LIMIT.gap : s.gap) * L - 1e-9) return null;
      // (every voice taken: the quietest, oldest one gives way to a louder one; one quieter than all of them is not played)
      active = active.filter(v => v.end > now);
      if (active.length >= LIMIT.voices) {
        const low = active.reduce((a, v) => (v.pri < a.pri || (v.pri === a.pri && v.at < a.at) ? v : a));
        if (low.pri > s.pri) return null;
        hush(low, now, 0.02);
        active.splice(active.indexOf(low), 1);
      }
      last.set(key, t);
      const out = ctx.createGain(),
        pan = clamp(o.pan === undefined ? 0 : o.pan, -1, 1);
      if (ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner();
        pn.pan.value = pan;
        out.connect(pn).connect(buses[s.bus]);
      } else out.connect(buses[s.bus]);
      const k = kitAt(t, out, p, L),
        made = s.make(k, o);
      out.gain.setValueAtTime(made.level, now);
      const end = Math.max(t + made.dur * L, ...k.ends);
      active.push({ end, pri: s.pri, at: t, out, level: made.level, name, ko: !!o.ko });
      return { name, level: made.level, dur: end - t, at: t, pan };
    } catch {
      return null; // (a sound that cannot be made here is not worth the bout)
    }
  }
  // (the cues played; a knockout's held, unless the page replays nothing)
  function cast(cues, c) {
    const out = [];
    for (const q of cues) {
      const o = Object.assign({ pan: panOf(c, q.o.who), rate: c && c.rate }, q.o);
      if (o.ko && !(c && c.replays === false)) {
        if (ctx && !muted) held.push({ name: q.name, o, due: stepT + KO_WAIT, made: ctx.currentTime, replayed: false });
        continue;
      }
      const r = play(q.name, o);
      if (r) out.push(r);
    }
    return out;
  }
  // (on a live step: what was held rung, once a replay has been shown since it was held or its wait is over; a stale one,
  // not rung for so long that the page cannot have been stepping, let go)
  function release() {
    if (!held.length || !ctx) return [];
    const out = [],
      keep = [];
    for (const h of held) {
      if (ctx.currentTime - h.made > 12) continue;
      if (!h.replayed && stepT < h.due - 1e-9) {
        keep.push(h);
        continue;
      }
      const r = play(h.name, Object.assign({}, h.o, { delay: 0, rate: 1 }));
      if (r) out.push(r);
      // (the knockout's bell: the bout is over, the pit's crowd stops waiting)
      if (h.o.ko) ambience(null, 2.5);
    }
    held = keep;
    return out;
  }
  // (a replay starting: whatever is held waits for it to be over, and a knockout's bell already ringing is cut short)
  function replaying() {
    for (const h of held) h.replayed = true;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of active) if (v.ko && v.end > now) hush(v, now, 0.08);
  }

  function ambience(kind, fade) {
    wantMurmur = kind === 'pit';
    if (!ctx) return;
    if (murmur && !wantMurmur) {
      // (faded out on its own gain, which nothing else moves: the voices' wander is upstream of it, so it goes to nothing)
      const g = murmur.g.gain,
        now = ctx.currentTime,
        over = fade || 0.6;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, murmur.level), now);
      g.exponentialRampToValueAtTime(0.0001, now + over);
      for (const n of murmur.sources) n.stop(now + over + 0.05);
      murmur = null;
    } else if (!murmur && wantMurmur) {
      /* (the pit's crowd waiting: a babble of people talking, not one band of noise: seven knots of them, each the noise
         through a vowel's band (300-2600 Hz), its level rising and falling at a syllable's rate (2.5-5.5 a second) and
         wandering slowly, and three low voices droning through the "어" formants, their pitch drifting; all under a lowpass,
         as from across the room. The fade is the last gain, `g`, alone) */
      const now = ctx.currentTime,
        g = ctx.createGain(),
        bed = ctx.createGain(),
        lp = ctx.createBiquadFilter(),
        sources = [],
        level = 0.065,
        oscs = [],
        osc = (f, type) => {
          const x = ctx.createOscillator();
          x.type = type || 'sine';
          x.frequency.value = f;
          oscs.push(x);
          return x;
        },
        // (a gain sitting at `base` and swung `depth` either way by a slow oscillator at f Hz)
        swung = (base, depth, f) => {
          const a = ctx.createGain(),
            d = ctx.createGain();
          a.gain.value = base;
          d.gain.value = depth;
          osc(f).connect(d).connect(a.gain);
          return a;
        };
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      bed.gain.value = 1;
      for (const f of [320, 460, 620, 850, 1150, 1600, 2300]) {
        const src = ctx.createBufferSource(),
          band = ctx.createBiquadFilter(),
          talk = swung(0.5, 0.45, 2.5 + 3 * random()),
          wander = swung(0.65, 0.3, 0.07 + 0.2 * random());
        src.buffer = noise;
        src.loop = true;
        band.type = 'bandpass';
        band.frequency.value = f * (0.9 + 0.2 * random());
        band.Q.value = 2.2;
        src.connect(band).connect(talk).connect(wander).connect(bed);
        src.start(now, random() * 1.9);
        sources.push(src);
      }
      for (let i = 0; i < 3; i++) {
        const v = osc(105 + 40 * random(), 'sawtooth'),
          drift = ctx.createGain(),
          f1 = ctx.createBiquadFilter(),
          f2 = ctx.createBiquadFilter(),
          talk = swung(0.05, 0.045, 3 + 2 * random());
        drift.gain.value = 6;
        osc(0.2 + 0.3 * random()).connect(drift).connect(v.frequency);
        f1.type = f2.type = 'bandpass';
        f1.frequency.value = 520;
        f1.Q.value = 5;
        f2.frequency.value = 1000;
        f2.Q.value = 6;
        v.connect(f1).connect(talk);
        v.connect(f2).connect(talk);
        talk.connect(bed);
      }
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(level, now + 1.5);
      bed.connect(lp).connect(g).connect(buses.crowd);
      for (const x of oscs) x.start(now), sources.push(x);
      murmur = { g, sources, level };
    }
  }

  return {
    unlock,
    play,
    hear: (e, c) => {
      if (c && c.replay) return replaying(), cast(cuesOf(e, c), c);
      return cast(cuesOf(e, c), c).concat(release());
    },
    watch: (men, dt, c) => {
      stepT += dt || 0;
      return cast(ears.watch(men, dt, c), c).concat(release());
    },
    reset: () => (ears.reset(), (held = []), (stepT = 0)),
    ambience(kind) {
      try {
        ambience(kind);
      } catch {
        murmur = null;
      }
    },
    mute(on) {
      muted = !!on;
      if (muted) held = [];
      if (!ctx || !master) return;
      try {
        const now = ctx.currentTime,
          g = master.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(clamp(g.value, 0, 1), now);
        g.linearRampToValueAtTime(muted ? 0 : 1, now + 0.02);
        // (and what was already scheduled, sounding or still to come: let go, so that it does not come back with the sound)
        if (muted) for (const v of active) hush(v, now, 0.02);
        if (muted) active = [];
      } catch {
        master.gain.value = muted ? 0 : 1;
      }
    },
    get muted() {
      return muted;
    },
    // ('pit' while the pit's murmur is going, else null)
    get ambient() {
      return murmur ? 'pit' : null;
    },
    // (what is sounding now: for the audition page and the tests)
    get voices() {
      return ctx ? active.filter(v => v.end > ctx.currentTime).length : 0;
    },
    // (cues held for later, by name: the knockout's bell until the knockdown has been shown)
    get held() {
      return held.map(h => h.name);
    },
    get context() {
      return ctx;
    }
  };
}
