/* The duel's rules, with nothing in them about drawing: two fighters on a line, stepped at a fixed rate from two sets of
   buttons. The same code runs in the browser and under node --test.
     const duel = createDuel(seed)
     step(duel, [playerInput, rivalInput], dt)     input: { move: -1..1, attack, parry, dodge: -1 | 0 | 1 } (buttons true on the
                                                   tick they are pressed)
     duel.events                                   what happened on this step, for the picture and the sound
   A hit freezes both fighters for a few frames (the hit stop): the striker on the drawing that landed, the struck one already
   thrown back. A cut that meets an open parry is deflected: the striker staggers and the defender has a moment (`chance`) in
   which an attack becomes the thrust. */
import { CLIPS, sample, stance } from '../anim/clips.mjs';

export const RULES = {
  hp: 6,
  walk: 2.3,
  gap: 1.2, // the fighters never stand closer than this
  halfWidth: 4.6,
  hitStop: { slash: 0.1, heavy: 0.12, thrust: 0.2, deflect: 0.15 },
  chance: 0.95,
  dodgeSafe: 0.24, // seconds of a dodge during which nothing lands
  buffer: 0.16, // a press this early is remembered until the fighter is free
  startGap: 3.2
};
const ATTACKS = { slash: true, heavy: true, thrust: true };

function fighter(x, face, attack) {
  return { x, face, hp: RULES.hp, clip: 'idle', ct: 0, from: stance('guard'), struck: false, chance: 0, safe: 0, flash: 0, attack, want: null, wantAge: 0, moving: 0 };
}
export function createDuel(seed) {
  return {
    t: 0,
    stop: 0,
    over: null, // 0 or 1: the winner
    seed: seed || 1,
    events: [],
    fighters: [fighter(-RULES.startGap / 2, 1, 'slash'), fighter(RULES.startGap / 2, -1, 'heavy')]
  };
}
export function random(duel) {
  duel.seed = (duel.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(duel.seed ^ (duel.seed >>> 15), 1 | duel.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const poseOf = f => sample(CLIPS[f.clip], f.ct, f.from);
export const isFree = f => {
  const clip = CLIPS[f.clip];
  return !!clip.loop || (!clip.hold && f.ct >= (clip.marks && clip.marks.free !== undefined ? clip.marks.free : clip.dur));
};
function play(f, name) {
  f.from = poseOf(f);
  f.clip = name;
  f.ct = 0;
  f.struck = false;
}

// how much of a clip's slide has been covered by time t: fast at first, spent by `over` seconds
const slid = (t, over) => {
  const u = Math.min(1, Math.max(0, t / over));
  return 1 - (1 - u) * (1 - u);
};
function slideOf(clip) {
  if (clip.lunge) return [clip.lunge, clip.marks.hit];
  if (clip.slide) return [clip.slide, Math.min(0.22, clip.dur)];
  return null;
}

function act(duel, f, other, input, dt, who) {
  // remember a press for a moment, so one made a few frames early still counts
  const pressed = input.dodge ? ['dodge', input.dodge] : input.parry ? ['parry'] : input.attack ? ['attack'] : null;
  if (pressed) {
    f.want = pressed;
    f.wantAge = 0;
  } else if (f.want && (f.wantAge += dt) > RULES.buffer) f.want = null;
  f.moving = 0;
  if (!isFree(f)) return;
  if (f.clip !== 'idle' && f.clip !== 'walk' && !f.want && !input.move) return play(f, 'idle'), undefined;
  f.face = other.x >= f.x ? 1 : -1;
  if (f.want) {
    const [what, dir] = f.want;
    f.want = null;
    if (what === 'dodge') {
      play(f, 'dodge');
      f.slideDir = dir * f.face < 0 || !dir ? -1 : 1; // back unless the stick says through
      f.safe = RULES.dodgeSafe;
      duel.events.push({ type: 'dodge', who });
    } else if (what === 'parry') {
      play(f, 'parry');
      duel.events.push({ type: 'guard', who });
    } else {
      const name = f.chance > 0 ? 'thrust' : f.attack;
      f.chance = 0;
      play(f, name);
      duel.events.push({ type: 'windup', who, clip: name });
    }
    return;
  }
  if (input.move) {
    if (f.clip !== 'walk') play(f, 'walk');
    f.moving = Math.sign(input.move);
    f.x += f.moving * RULES.walk * dt;
  } else if (f.clip !== 'idle') play(f, 'idle');
}

function advance(duel, f, other, dt, who) {
  const clip = CLIPS[f.clip],
    before = f.ct;
  f.ct += dt;
  const slide = slideOf(clip);
  if (slide) {
    // a dodge goes the way it was sent (slideDir: -1 back, 1 through); every other slide is along the way the fighter faces
    const along = f.clip === 'dodge' ? f.slideDir * Math.abs(slide[0]) : slide[0];
    f.x += f.face * along * (slid(f.ct, slide[1]) - slid(before, slide[1]));
  }
  if (ATTACKS[f.clip] && !f.struck && f.ct >= clip.marks.hit) {
    f.struck = true;
    f.ct = clip.marks.hit; // the hit stop holds exactly this drawing
    duel.events.push({ type: 'swing', who, clip: f.clip });
    resolve(duel, f, other, clip, who);
  }
  if (!clip.loop && !clip.hold && f.ct >= clip.dur) play(f, 'idle');
}

function resolve(duel, f, other, clip, who) {
  const ahead = (other.x - f.x) * f.face;
  if (ahead <= 0 || ahead > clip.reach || other.clip === 'down') return duel.events.push({ type: 'whiff', who });
  const at = f.x + f.face * Math.min(ahead, clip.reach) * 0.85;
  const guard = CLIPS.parry.marks;
  if (other.clip === 'parry' && other.ct >= guard.open && other.ct <= guard.shut && f.clip !== 'thrust') {
    other.face = -f.face;
    play(other, 'deflect');
    other.chance = RULES.chance;
    play(f, 'stagger');
    duel.stop = RULES.hitStop.deflect;
    return duel.events.push({ type: 'deflect', who, by: 1 - who, at });
  }
  if (other.safe > 0) return duel.events.push({ type: 'whiff', who, dodged: true });
  other.hp = Math.max(0, other.hp - clip.damage);
  other.face = -f.face;
  other.flash = 0.1;
  other.chance = 0;
  play(other, other.hp > 0 ? 'hurt' : 'down');
  duel.stop = RULES.hitStop[f.clip];
  duel.events.push({ type: 'hit', who, on: 1 - who, at, clip: f.clip, damage: clip.damage, down: other.hp <= 0 });
  if (other.hp <= 0) duel.over = who;
}

export function step(duel, inputs, dt) {
  duel.events.length = 0;
  duel.t += dt;
  const [a, b] = duel.fighters;
  for (const f of duel.fighters) f.flash = Math.max(0, f.flash - dt);
  if (duel.stop > 0) {
    // frozen: presses are still remembered, nothing moves
    duel.stop -= dt;
    duel.fighters.forEach((f, i) => {
      const input = inputs[i] || {};
      const pressed = input.dodge ? ['dodge', input.dodge] : input.parry ? ['parry'] : input.attack ? ['attack'] : null;
      if (pressed) (f.want = pressed), (f.wantAge = 0);
    });
    return duel;
  }
  for (const f of duel.fighters) {
    f.chance = Math.max(0, f.chance - dt);
    f.safe = Math.max(0, f.safe - dt);
  }
  if (duel.over === null) {
    act(duel, a, b, inputs[0] || {}, dt, 0);
    act(duel, b, a, inputs[1] || {}, dt, 1);
  }
  advance(duel, a, b, dt, 0);
  if (duel.stop <= 0) advance(duel, b, a, dt, 1);
  // keep them on the terrace and off each other
  for (const f of duel.fighters) f.x = Math.max(-RULES.halfWidth, Math.min(RULES.halfWidth, f.x));
  const gap = b.x - a.x,
    side = gap >= 0 ? 1 : -1;
  if (Math.abs(gap) < RULES.gap && a.clip !== 'down' && b.clip !== 'down') {
    const push = (RULES.gap - Math.abs(gap)) / 2;
    a.x -= side * push;
    b.x += side * push;
    for (const f of duel.fighters) f.x = Math.max(-RULES.halfWidth, Math.min(RULES.halfWidth, f.x));
    if (Math.abs(b.x - a.x) < RULES.gap) {
      // one of them is against the edge: the other gives all the ground
      if (Math.abs(a.x) >= RULES.halfWidth) b.x = a.x + side * RULES.gap;
      else a.x = b.x - side * RULES.gap;
    }
  }
  return duel;
}
