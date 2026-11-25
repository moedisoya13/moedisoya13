/* The sounds of a bout, made on the spot (Web Audio; nothing is loaded, and nothing plays until the first touch has unlocked
   the audio context). Two halves:

     cuesOf(e, c)        what one event of the bout (game/bout.mjs bout.events) sounds like: a list of { name, o } cues. Pure:
                         the game and the sparring both hear the bout through it (audio.hear), so they cannot drift apart.
                         c: { men (the fighters, or a replay's captured men: x, z, and stamina / k.staminaMax if known),
                         pit (fought in the underground pit: its crowd, its concrete), you (the player's man, for the
                         counter-chance cue; null for none), replay (a replay is throwing it again: no crowd, no bell) }
     createEars()        what the bout's state sounds like from step to step, not its events: feet on the canvas by the
                         distance walked, the ropes pressed, a spent man panting. ears.watch(men, dt, c) -> cues.

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
     audio.ambience(kind)            'pit' starts the pit crowd's murmur loop, anything else stops it
     audio.mute(on)

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
// (events that make no sound of their own: a guard put up, a power press meant as a shift, where the glove went on to, the
// wave held, and a brilliant defence, whose whiff or parry speaks for it)
export const QUIET = ['cover', 'shell', 'shift', 'follow', 'wave', 'brilliant'];

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
      cue('impact', { who: e.on, J, where, counter: !!e.counter, down });
      if (down) cue('exhale', { who: e.on, delay: 0.12 });
      else if (where === 'body' && J >= 45) cue('grunt', { who: e.on, J, delay: 0.03 });
      else if (where === 'head' && J >= 70) cue('gasp', { who: e.on, J, delay: 0.02 });
      // (the pit's crowd at a power blow, a counter or a knockdown: as world/pit.mjs has them react)
      if (c.pit && !c.replay && (down || e.J >= 60 || e.counter)) cue(down ? 'roar' : 'cheer');
      if (down && !c.replay) cue('bell', { strikes: 3, delay: 1.1 });
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
    case 'buckle':
      cue('grunt', { who: e.who, J: 110 });
      break;
    // (not the bout's: the page says when a man knocked down comes down on the canvas, render/blow.mjs landed)
    case 'floor':
      cue('floor', { who: e.who, pit: !!c.pit });
      break;
  }
  return out;
}

/* ---- what the state sounds like, step by step */
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
        const s = seen[i];
        if (!s) return void (seen[i] = { x: f.x, z: f.z, walked: 0, rope: 0, ropeAt: -9, pant: 0, breath: 0, t: 0 });
        s.t += dt;
        const d = Math.hypot(f.x - s.x, f.z - s.z);
        s.x = f.x;
        s.z = f.z;
        // (a man down, one in a dash (it has its own scuff), or one put somewhere new: no steps)
        if (f.down || (f.action && f.action.name === 'dash') || d > 0.5) s.walked = 0;
        else if ((s.walked += d) >= STRIDE) (s.walked -= STRIDE), out.push({ name: 'step', o: { who: i, v: d / Math.max(dt, 1e-6), pit: !!c.pit } });
        // (the ropes taking him: the first moment he is pressed well onto them)
        const press = f.rope ? f.rope.press || 0 : 0;
        if (!c.pit && press > 0.35 && s.rope <= 0.35 && s.t - s.ropeAt > 0.5) (s.ropeAt = s.t), out.push({ name: 'rope', o: { who: i, press } });
        s.rope = press;
        // (a man spent and doing nothing: his breath, in and out)
        const tired = tiredOf(f);
        if (tired > 0.7 && !f.down && !f.action) {
          if ((s.pant += dt) >= 0.75) (s.pant = 0), (s.breath = 1 - s.breath), out.push({ name: 'pant', o: { who: i, tired, out: !!s.breath } });
        } else s.pant = 0;
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
   the same one for the same man again */
const SOUNDS = {
  // the exhale through the teeth as a punch goes: a jab's short and high "tss", a straight's "shh", a hook's and an
  // uppercut's longer and sweeping down; a power blow's with a voiced push under it ("hup"); a tired man's breathier, longer,
  // lower
  breath: {
    bus: 'voice',
    pri: 3,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0],
        tired = o.tired || 0,
        [f0, f1, len, q, lvl] = { jab: [5600, 5000, 0.07, 2.2, 0.85], straight: [4700, 4100, 0.095, 1.8, 1], hook: [4500, 2900, 0.12, 1.6, 1], upper: [4100, 2700, 0.13, 1.6, 1] }[o.kind] || [4700, 4100, 0.095, 1.8, 1],
        pitch = v.pitch * k.vary(0.04) * (1 - 0.22 * tired),
        dur = len * k.vary(0.08) * (1 + 0.7 * tired);
      k.noise({ f: f0 * pitch, to: f1 * pitch, q: q * (1 - 0.45 * tired), attack: 0.003, dur, peak: 1, hp: 1900 });
      if (tired > 0.05) k.noise({ f: 1500 * v.pitch, to: 1100 * v.pitch, q: 0.9, attack: 0.012, dur: dur * 1.25, peak: 0.3 * tired });
      if (o.power) k.voiced({ f: v.low * 1.12 * k.vary(0.03), to: v.low * 0.9, formants: [[640, 3, 1], [1150, 4, 0.4]], attack: 0.006, dur: 0.075, peak: 0.55 });
      return { level: 1.1 * lvl * k.vary(0.15) * (o.soft === undefined ? 1 : o.soft) * (1 - 0.12 * tired), dur: dur * 1.25 };
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
  // leather on flesh, sized by the impulse: a low thump falling, a leather smack, and for heavy blows a sub drop and a longer
  // body; the head's sharper and brighter ("pop"), the body's duller, lower, longer; a counter's with a crack in it
  impact: {
    bus: 'impact',
    pri: 4,
    gap: 0.02,
    make(k, o) {
      const s = clamp((o.J === undefined ? 60 : o.J) / CLEAN, 0.12, 2),
        heavy = smooth(0.5, 1.3, s),
        head = o.where !== 'body',
        thump = (head ? 0.09 : 0.14) + 0.1 * s;
      k.tone({ type: 'sine', f: (head ? 120 : 100) * (1.08 - 0.1 * s), to: (head ? 52 : 42) * (1.05 - 0.08 * s), attack: 0.002, dur: thump, peak: head ? 0.75 : 1 });
      k.noise({ f: (head ? 2600 : 1300) * (1 - 0.1 * s), q: head ? 1.1 : 0.8, attack: 0.001, dur: (head ? 0.026 : 0.035) + (head ? 0.012 : 0.02) * s, peak: head ? 1.6 : 0.55 });
      if (head) k.noise({ type: 'highpass', f: 3500, attack: 0.0008, dur: 0.01, peak: 0.9 });
      else k.noise({ type: 'lowpass', f: 520, attack: 0.002, dur: 0.08 + 0.06 * s, peak: 0.5 });
      let dur = thump;
      if (heavy > 0) {
        const sub = (head ? 0.2 : 0.28) + 0.25 * s + (o.down ? 0.25 : 0);
        k.tone({ type: 'sine', f: 62, to: 30, attack: 0.004, dur: sub, peak: (head && !o.down ? 0.55 : 0.9) * heavy });
        k.noise({ type: 'lowpass', f: 700, attack: 0.003, dur: 0.15 + 0.15 * s, peak: 0.35 * heavy });
        dur = Math.max(dur, sub);
      }
      if (o.counter) k.noise({ type: 'bandpass', f: 4200, q: 0.8, hp: 2500, attack: 0.0006, dur: 0.014, peak: 0.9 });
      if (o.down) k.duck(0.35, 0.45);
      return { level: (0.26 + 0.42 * Math.pow(s, 0.8)) * (o.down ? 1.15 : 1), dur };
    }
  },
  // glove on glove and forearm: a muffled slap, no sub, no metal (a shoulder rolled off: softer, with a brush after it)
  block: {
    bus: 'guard',
    pri: 3,
    make(k, o) {
      const s = clamp((o.J === undefined ? 50 : o.J) / CLEAN, 0.1, 1.6),
        c = o.part === 'glove' ? 850 : o.part === 'shoulder' ? 450 : 560,
        dur = 0.035 + 0.025 * s;
      k.noise({ f: c * (1 - 0.1 * s), q: 1.3, attack: 0.002, dur, peak: 1 });
      k.tone({ type: 'triangle', f: 210, to: 140, attack: 0.002, dur: 0.05 + 0.02 * s, peak: 0.35, lp: 900 });
      k.noise({ f: 1800, q: 1.5, attack: 0.001, dur: 0.015, peak: o.part === 'glove' ? 0.3 : 0.15 });
      if (o.part === 'shoulder') k.noise({ f: 900, to: 600, q: 0.9, attack: 0.02, dur: 0.12, peak: 0.4, at: 0.01 });
      return { level: (0.5 + 0.6 * s) * (o.part === 'shoulder' ? 0.8 : 1), dur: Math.max(dur, o.part === 'shoulder' ? 0.15 : 0.07) };
    }
  },
  // a punch turned aside: a lighter, quicker tick-slap (a hammer or a press down: a little more weight)
  parry: {
    bus: 'guard',
    pri: 3,
    make(k, o) {
      k.noise({ f: 1500, q: 2, attack: 0.0008, dur: 0.016, peak: 1 });
      k.noise({ f: 800, q: 1.4, attack: 0.002, dur: 0.03, peak: 0.6, at: 0.004 });
      if (o.hammer || o.down) k.tone({ type: 'triangle', f: 240, to: 150, attack: 0.002, dur: 0.06, peak: 0.4, lp: 900, at: 0.004 });
      return { level: o.hammer || o.down ? 1.9 : 1.6, dur: 0.07 };
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
  // the struck man: a low forced grunt from a body blow ("욱")
  grunt: {
    bus: 'voice',
    pri: 3,
    gap: 0.25,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0],
        s = clamp((o.J || 60) / CLEAN, 0.4, 1.6),
        dur = (0.13 + 0.08 * s) * k.vary(0.08);
      k.noise({ f: 600 * v.pitch, q: 1.2, attack: 0.002, dur: 0.025, peak: 0.5 });
      k.voiced({ f: v.low * 0.92 * k.vary(0.04), to: v.low * 0.78, formants: [[380, 2.5, 1], [850, 3, 0.4]], attack: 0.01, dur, peak: 1, lp: 1300 });
      return { level: (0.28 + 0.18 * s) * k.vary(0.1), dur };
    }
  },
  // a heavy blow to the head: a sharp clipped exhale ("헉")
  gasp: {
    bus: 'voice',
    pri: 3,
    gap: 0.25,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0],
        s = clamp((o.J || 80) / CLEAN, 0.5, 1.6),
        dur = 0.085 * k.vary(0.08);
      k.noise({ f: 1700 * v.pitch, q: 1.2, attack: 0.004, dur, peak: 1, clip: true });
      k.voiced({ f: v.low * 1.3, to: v.low * 1.15, formants: [[900, 3, 1]], attack: 0.004, dur: 0.04, peak: 0.3 });
      return { level: (0.12 + 0.07 * s) * k.vary(0.1), dur };
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
  // a spent man between exchanges: in and out
  pant: {
    bus: 'voice',
    pri: 1,
    gap: 0.3,
    make(k, o) {
      const v = VOICE[o.who] || VOICE[0];
      k.noise({ f: (o.out ? 1500 : 2200) * v.pitch, q: 1, attack: 0.05, dur: 0.17, peak: 1 });
      return { level: 0.1 * (o.tired || 1) * k.vary(0.15), dur: 0.22 };
    }
  },
  // a foot on the canvas: a soft scuff (in the pit, grittier: concrete)
  step: {
    bus: 'feet',
    pri: 1,
    gap: 0.08,
    make(k, o) {
      const v = clamp((o.v || 1) / 1.5, 0.3, 1.6);
      k.noise({ f: 300, to: 180, q: 0.9, attack: 0.004, dur: 0.05, peak: 1 });
      if (o.pit) k.noise({ f: 3500, q: 0.5, hp: 2500, attack: 0.002, dur: 0.04, peak: 0.6 });
      else k.noise({ f: 1800, q: 1, attack: 0.003, dur: 0.02, peak: 0.25 });
      return { level: 0.8 * v * k.vary(0.2), dur: 0.06 };
    }
  },
  // a quick step: a quicker scuff, the shoe squeaking on the canvas (in the pit, grit and no squeak)
  dash: {
    bus: 'feet',
    pri: 2,
    gap: 0.1,
    make(k, o) {
      k.noise({ f: 420, to: 220, q: 0.9, attack: 0.002, dur: 0.04, peak: 1 });
      if (o.pit) k.noise({ f: 3200, to: 2400, q: 0.5, hp: 2200, attack: 0.002, dur: 0.07, peak: 0.7 });
      else k.tone({ type: 'triangle', f: 2400 * k.vary(0.05), to: 2900, attack: 0.008, dur: 0.045, peak: 0.25, at: 0.01 });
      return { level: 0.45 * k.vary(0.1), dur: o.pit ? 0.08 : 0.06 };
    }
  },
  // a man coming down on the floor: a big low boom (the ring's with its canvas's hollow ring; the pit's dead and dry)
  floor: {
    bus: 'impact',
    pri: 4,
    gap: 0.3,
    make(k, o) {
      const dur = o.pit ? 0.25 : 0.45;
      k.tone({ type: 'sine', f: 70, to: 32, attack: 0.004, dur, peak: 1 });
      k.noise({ type: 'lowpass', f: o.pit ? 500 : 300, attack: 0.003, dur: o.pit ? 0.15 : 0.25, peak: 0.6 });
      if (o.pit) k.noise({ f: 2800, q: 0.6, hp: 1800, attack: 0.001, dur: 0.03, peak: 0.35 });
      else {
        k.tone({ type: 'sine', f: 118, to: 114, attack: 0.006, dur: 0.5, peak: 0.18 });
        k.tone({ type: 'sine', f: 177, to: 172, attack: 0.006, dur: 0.38, peak: 0.12 });
        k.noise({ f: 220, q: 8, attack: 0.004, dur: 0.35, peak: 0.25 });
      }
      return { level: 0.72, dur: o.pit ? 0.25 : 0.5 };
    }
  },
  // the ropes taking a man's weight: a short creak and thrum
  rope: {
    bus: 'feet',
    pri: 2,
    gap: 0.5,
    make(k, o) {
      k.tone({ type: 'triangle', f: 92, to: 88, attack: 0.01, dur: 0.35, peak: 0.5 });
      k.tone({ type: 'sine', f: 184, to: 178, attack: 0.01, dur: 0.25, peak: 0.2 });
      k.noise({ f: 1200, q: 6, attack: 0.01, dur: 0.08, peak: 0.3 });
      return { level: 0.12 + 0.2 * clamp(o.press || 0.5, 0, 1), dur: 0.36 };
    }
  },
  // the pit's crowd (world/pit.mjs): a cheer at a power blow or a counter, a roar at a knockdown
  cheer: { bus: 'crowd', pri: 2, gap: 0.4, make: k => (k.crowd(1.1, 500, 1100), { level: 0.22, dur: 1.1 }) },
  roar: { bus: 'crowd', pri: 3, gap: 1, make: k => (k.crowd(3.2, 450, 1300), { level: 0.36, dur: 3.2 }) },
  // the ring bell: one strike at the start, three quick ones at the knockout (three inharmonic partials, a long decay)
  bell: {
    bus: 'bell',
    pri: 5,
    gap: 0.5,
    make(k, o) {
      const n = o.strikes || 1;
      for (let i = 0; i < n; i++) {
        const at = i * 0.3;
        k.noise({ type: 'highpass', f: 3000, attack: 0.0005, dur: 0.008, peak: 0.4, at });
        [[740, 1, 1.6], [1856, 0.55, 1], [2913, 0.3, 0.55]].forEach(([f, peak, dur]) => k.tone({ type: 'sine', f, to: f * 0.998, attack: 0.002, dur, peak, at }));
      }
      return { level: 0.3, dur: (n - 1) * 0.3 + 1.6 };
    }
  },
  // the result, as before: up for a win, down for a loss
  win: { bus: 'ui', pri: 5, make: k => ([523, 659, 784, 1047].forEach((f, i) => k.tone({ type: 'triangle', f, to: f, attack: 0.004, dur: 0.16, peak: 1, at: i * 0.1 })), { level: 0.5, dur: 0.5 }) },
  lose: { bus: 'ui', pri: 5, make: k => ([392, 330, 262, 196].forEach((f, i) => k.tone({ type: 'triangle', f, to: f * 0.97, attack: 0.004, dur: 0.24, peak: 1, at: i * 0.16 })), { level: 0.55, dur: 0.75 }) },
  // the player's man turned a punch aside: his counter is open (the game's HUD says so too)
  chance: { bus: 'ui', pri: 2, make: k => (k.tone({ type: 'triangle', f: 880, to: 880, attack: 0.004, dur: 0.07, peak: 1 }), k.tone({ type: 'triangle', f: 1320, to: 1320, attack: 0.004, dur: 0.12, peak: 1, at: 0.07 }), { level: 0.3, dur: 0.2 }) }
};
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
    wantMurmur = false;
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
      if (ctx) return ctx.state === 'suspended' && ctx.resume && ctx.resume();
      if (opts.context) return build(opts.context);
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AC) build(new AC());
    } catch {
      ctx = null; // (no audio here: everything stays silent)
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
    return {
      ends,
      vary: amount => 1 + (random() * 2 - 1) * amount,
      // filtered noise: a band (or a highpass / lowpass) swept from f to `to`, with an extra highpass `hp` if asked
      noise(o) {
        const at = t + (o.at || 0) * L,
          src = ctx.createBufferSource(),
          band = filter(o.type || 'bandpass', o.f, o.type === 'highpass' || o.type === 'lowpass' ? 0.7 : o.q || 1),
          g = ctx.createGain(),
          nodes = [band];
        src.buffer = noise;
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
      // a crowd: the noise looped and let through low, swelling and dying away over `dur` seconds
      crowd(dur, low, high) {
        const src = ctx.createBufferSource(),
          band = filter('bandpass', low, 0.6),
          g = ctx.createGain(),
          d = dur * L;
        src.buffer = noise;
        src.loop = true;
        band.frequency.setValueAtTime(hz(low), t);
        band.frequency.linearRampToValueAtTime(hz(high), t + d * 0.3);
        band.frequency.linearRampToValueAtTime(hz(low), t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1, t + d * 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(band).connect(g).connect(out);
        src.start(t, random() * 1.2);
        src.stop(t + d + 0.05);
        ends.push(t + d);
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
        low.out.gain.cancelScheduledValues(now);
        low.out.gain.setValueAtTime(low.level, now);
        low.out.gain.linearRampToValueAtTime(0.0001, now + 0.02);
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
      active.push({ end, pri: s.pri, at: t, out, level: made.level, name });
      return { name, level: made.level, dur: end - t, at: t, pan };
    } catch {
      return null; // (a sound that cannot be made here is not worth the bout)
    }
  }
  const cast = (cues, c) => cues.map(q => play(q.name, Object.assign({ pan: panOf(c, q.o.who), rate: c && c.rate }, q.o))).filter(Boolean);

  function ambience(kind) {
    wantMurmur = kind === 'pit';
    if (!ctx) return;
    if (murmur && !wantMurmur) {
      const g = murmur.g.gain,
        now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value || 0.0001, now);
      g.linearRampToValueAtTime(0.0001, now + 0.4);
      murmur.src.stop(now + 0.45);
      murmur.lfo.stop(now + 0.45);
      murmur = null;
    } else if (!murmur && wantMurmur) {
      // (the pit's crowd waiting: low noise through a low band, its level wandering slowly)
      const now = ctx.currentTime,
        src = ctx.createBufferSource(),
        lp = ctx.createBiquadFilter(),
        band = ctx.createBiquadFilter(),
        g = ctx.createGain(),
        lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      src.buffer = noise;
      src.loop = true;
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      band.type = 'bandpass';
      band.frequency.value = 380;
      band.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 1.5);
      lfo.frequency.value = 0.13;
      depth.gain.value = 0.03;
      lfo.connect(depth).connect(g.gain);
      src.connect(lp).connect(band).connect(g).connect(buses.crowd);
      src.start(now);
      lfo.start(now);
      murmur = { src, lfo, g };
    }
  }

  return {
    unlock,
    play,
    hear: (e, c) => cast(cuesOf(e, c), c),
    watch: (men, dt, c) => cast(ears.watch(men, dt, c), c),
    reset: () => ears.reset(),
    ambience(kind) {
      try {
        ambience(kind);
      } catch {
        murmur = null;
      }
    },
    mute(on) {
      muted = !!on;
      if (master) master.gain.value = muted ? 0 : 1;
    },
    // (what is sounding now: for the audition page and the tests)
    get voices() {
      return ctx ? active.filter(v => v.end > ctx.currentTime).length : 0;
    },
    get context() {
      return ctx;
    }
  };
}
