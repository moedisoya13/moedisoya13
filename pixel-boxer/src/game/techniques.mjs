/* The techniques a boxer carries (docs/moves-plan-5.md §4.0). The game boxes itself: a technique is not a button but something
   a boxer has in his loadout and his head picks (brain.mjs; ai.mjs for the sparring rival), at the places it decides already:
   a punch seen coming, an opening, the start of a combination, his feet while he waits.
     whether he has it    his loadout: profile.mjs loadout(skills, asked) -> f.techniques (createBout(seed, { techniques }))
     how well he does it  his grade at it: gradeOf(skills, id) (named in his skills, or the move it is a form of, or `all`)
     when he picks it     his sheet (his reading, his sense, his eye for an opening) and his corner's plan; not his grade
   The head says what it picked by adding to the controls it already gives: { tech: id } with the press or the guard it goes
   with, { body: true } on a punch for the body, { away: 'wave', side }. The bout carries `tech` and `body` on the press and on
   the move the press starts (bout.mjs: signed, f.action.asked), and the motion built for the technique reads them there.
   Until it is built nothing reads them, and the press is the one it would have been without them.

   An entry, one block a technique (define(id, { ... })); the stage that builds a technique's motion edits its own block:
     name, section    what it is called, and where the plan has it
     open             the grades that can do it (skill.mjs LEVELS ids); at any other grade it never comes out, carried or not
     cost             slots it takes (profile.mjs: SLOTS)
     as               the move whose grade it is done at when his skills do not name it (the cross-arm guard: the guard's)
     standard(level)  in the loadout he gets when none is given, at his grade for it
     ready            its motion is built: the head picks it only then, or in rehearsal (createBrain(sheet, plan, { rehearse:
                      true })), when the controls go to a bout that has nothing to do with them yet
     answer           to a punch seen coming: { of: 'parry' | 'guard' | 'slip' (the answer whose share it takes a part of, from
                      the same roll: the chance he does something about the punch at all stays what it was), share (0..1 of
                      it), when(s), control(s) (what he does, each step the punch is coming), once (spent once the punch's trunk
                      has turned, as a slip is), hold(s) (seconds he keeps at it after the punch has gone by; 0.12), held(s)
                      (what he does in them; the guard kept up) }
     opening(s)       an opening it has made that the bout does not mark (a whiff in the sway, a block): a key, the same for as
                      long as it is the same opening, or null. He rolls once for each, k.counter × plan.counter (the rival:
                      his level's counter). Left out, a technique that answers a punch opens through the bout's own opening
                      (the parry's: f.counter)
     counter(s)       the controls of the punch he takes the opening with
     combination      in place of a combination started with a power punch: { when(s), weight(s) (his chance), burst(s) (the
                      presses, each a set of controls, with next: seconds to the one after) }
     move             his feet while he waits: { when(s), chance(s) (rolled once a rest between combinations; 1 is always),
                      control(s) (each step) }
   s, the situation (situation()), is the state of the bout as his head reads it. Every choice rolls the bout's own dice
   (s.roll: bout.mjs random), and only when a technique he carries is in its situation: a bout whose boxers carry nothing
   ready rolls exactly as it did before there were techniques. */
import { LEVELS, levelOf } from '../anim/skill.mjs';
import { MOVES } from '../anim/moves.mjs';
import { RING } from '../world/ring.mjs';

export const TECHNIQUES = {};
export function define(id, entry) {
  return (TECHNIQUES[id] = Object.assign({ name: id, section: null, open: [], cost: 1, as: null, standard: null, ready: false }, entry, { id }));
}

// the grade he does a technique at, whether his grade opens it, and whether he carries it and can do it
export const gradeOf = (skills, id) => levelOf(skills, skills && skills[id] ? id : (TECHNIQUES[id] && TECHNIQUES[id].as) || id);
export const opens = (skills, id) => !!TECHNIQUES[id] && TECHNIQUES[id].open.includes(gradeOf(skills, id).id);
export const has = (f, id) => !!f.techniques && f.techniques.includes(id) && opens(f.skills, id);
// what his head may pick: carried, opened, and built (or rehearsed)
export const offered = (s, id) => has(s.me, id) && (TECHNIQUES[id].ready || !!s.mind.rehearse);

/* What a press carries of the head's controls into the bout (bout.mjs: signed): the technique he means it as, if his grade
   opens it (a script names one the same way), and whether it is for the body. null when it carries neither. */
export function asked(f, input) {
  const tech = input.tech && opens(f.skills, input.tech) ? input.tech : null;
  return tech || input.body ? { tech, body: !!input.body } : null;
}

/* Body punches are not techniques: everyone throws them (§3.3), and his head turns a punch of a combination into one by his
   sense: base + iq × his iq (0..1), `guarded` times as often at a guard held up `held` seconds or more, `pressure` times under
   the pressure plan; `blocked` for the next punch (within `within` s) after a head punch of his was blocked; never in the
   `after` seconds after one of his has landed to the body (the other man's gloves are down: the head); and not under `least`
   iq at all (one thing at a time). ready: the body punches are built (stage C2 sets it); until then the head does not roll
   for them, so a bout rolls as it did. LOW: the punches for the body (§3.3, §4.4) and their kinds; a press with body: true is
   one too. */
export const BODY = { ready: true, base: 0.1, iq: 0.3, guarded: 2, held: 0.3, pressure: 1.4, blocked: 0.6, within: 1, after: 0.35, least: 0.3 };
const LOW = { jabBody: 'straight', crossBody: 'straight', hookBody: 'hook', upperBody: 'upper', shiftHook: 'hook' };
export const forBody = (name, action) => name in LOW || !!(action && action.asked && action.asked.body);
const toBody = e => !!e.zone || e.part === 'body';
// (a man rocked by a blow: one of `J` newton-seconds or more, which stops him long enough to rock him, in the last `last` s)
const ROCKED = { J: 57, last: 1 };

/* What his head keeps of what has happened (each step's bout.events, read once a step): the last head punch of his that was
   blocked, when one of his last landed to the body, when he last hurt the other man, the other man's last punch that went by
   him, and the last one he blocked (and how: part, roll). */
export const memory = () => ({ blocked: null, bodyAt: -9, hurtAt: -9, by: null, kept: null });
export function observe(mem, bout, who) {
  for (const e of bout.events) {
    if (e.type === 'block' && e.who === who && !forBody(e.name)) mem.blocked = { at: bout.t, name: e.name };
    else if (e.type === 'hit' && e.who === who) {
      if (toBody(e)) mem.bodyAt = bout.t;
      if (e.J >= ROCKED.J) mem.hurtAt = bout.t;
    } else if (e.type === 'whiff' && e.who === 1 - who) mem.by = { at: bout.t, name: e.name };
    else if (e.type === 'block' && e.on === who) mem.kept = { at: bout.t, name: e.name, part: e.part, roll: !!e.roll };
  }
}

/* The situation, as his head reads it. mind: the brain or the rival (mem, used, rehearse); o: { coming (the punch on its way
   at him, bout.mjs incoming), range (metres he wants to be at), side (his way round), iq (0..1), plan (his plan's id),
   roll (the bout's dice) }. */
export function situation(bout, who, mind, o) {
  const me = bout.fighters[who],
    him = bout.fighters[1 - who],
    coming = o.coming || null,
    move = coming && MOVES[coming.name],
    far = Math.hypot(him.x - me.x, him.z - me.z),
    ropes = f => RING.half - Math.max(Math.abs(f.x), Math.abs(f.z));
  return {
    bout, who, me, him, mind, mem: mind.mem, used: mind.used, t: bout.t, far,
    coming,
    // (what is coming: a jab or a straight, by the hand; a hook or an uppercut; at his head or his body)
    punch: move ? (move.kind === 'straight' ? (move.hand === 'L' ? 'jab' : 'straight') : move.kind) : null,
    body: !!coming && forBody(coming.name, coming),
    head: !!coming && !forBody(coming.name, coming),
    inReach: !!move && far < move.reach + 0.25,
    soon: !!coming && !!coming.chain.on[2],
    breath: me.stamina / me.k.staminaMax,
    guarded: !!him.cover && him.coverAge > BODY.held,
    rocked: bout.t - mind.mem.hurtAt <= ROCKED.last,
    ropes: ropes(me), // metres to the ropes behind him (the nearer side), and behind the other man
    hisRopes: ropes(him),
    resting: mind.rest > 0, // (between combinations, not yet ready to start the next)
    range: o.range, side: o.side || 1, iq: o.iq ?? 0.5, plan: o.plan || null, roll: o.roll
  };
}

/* ---- where the head decides */

/* A punch seen coming, by one roll: shares [['parry', p], ['guard', g], ['slip', s]] as before; a technique he may pick takes
   its part of its answer's share from the bottom of it (two that take from the same answer at once take their parts in
   proportion, at most the whole of it). -> an answer, a technique's id, or null. */
export function answerOf(s, roll, shares) {
  const offers = (s.me.techniques || []).filter(id => TECHNIQUES[id] && TECHNIQUES[id].answer && offered(s, id) && TECHNIQUES[id].answer.when(s));
  let lo = 0;
  for (const [name, share] of shares) {
    if (roll < lo + share) {
      const mine = offers.filter(id => TECHNIQUES[id].answer.of === name),
        sum = mine.reduce((a, id) => a + TECHNIQUES[id].answer.share, 0),
        k = sum > 1 ? 1 / sum : 1;
      let at = lo;
      for (const id of mine) if (roll < (at += share * TECHNIQUES[id].answer.share * k)) return id;
      return name;
    }
    lo += share;
  }
  return null;
}

// a punch at the bout's own opening (a parry's): the counter of the technique that made it, if one did (in the last `within` s)
const OPENED = { within: 1.2 };
export function counterOf(s) {
  const t = s.used && TECHNIQUES[s.used.id];
  return t && !t.opening && t.counter && s.t - s.used.at <= OPENED.within ? t.counter(s) : {};
}
// an opening one of his techniques has made: { id, key } or null
export function openingOf(s) {
  for (const id of s.me.techniques || []) {
    const t = TECHNIQUES[id];
    if (!t || !t.opening || !offered(s, id)) continue;
    const key = t.opening(s);
    if (key) return { id, key };
  }
  return null;
}
// a combination of a technique's in place of one started with a power punch: its presses, or null
export function comboOf(s) {
  for (const id of s.me.techniques || []) {
    const c = TECHNIQUES[id] && TECHNIQUES[id].combination;
    if (c && offered(s, id) && c.when(s) && s.roll() < c.weight(s)) return c.burst(s);
  }
  return null;
}
// his feet, while he waits: a technique's controls, or null (rolled once a rest: mind.rests counts them)
export function goingOf(s) {
  const mind = s.mind;
  for (const id of s.me.techniques || []) {
    const m = TECHNIQUES[id] && TECHNIQUES[id].move;
    if (!m || !offered(s, id) || !m.when(s)) continue;
    if (!mind.going || mind.going.id !== id || mind.going.rest !== mind.rests) {
      const c = m.chance(s);
      mind.going = { id, rest: mind.rests, on: c >= 1 || (c > 0 && s.roll() < c) };
    }
    if (mind.going.on) return m.control(s);
  }
  return null;
}
// a punch of a combination, to the body? (the head's dice for it; and the punch after a blocked one has been thrown)
export function bodyChance(s) {
  if (s.iq < BODY.least || s.t - s.mem.bodyAt <= BODY.after) return 0;
  if (s.mem.blocked && s.t - s.mem.blocked.at <= BODY.within) return BODY.blocked;
  return Math.min(1, (BODY.base + BODY.iq * s.iq) * (s.guarded ? BODY.guarded : 1) * (s.plan === 'pressure' ? BODY.pressure : 1));
}
export function bodyOf(s) {
  if (!(BODY.ready || s.mind.rehearse)) return false;
  const p = bodyChance(s);
  s.mem.blocked = null;
  return p >= 1 || (p > 0 && s.roll() < p);
}

/* ---- the techniques (docs/moves-plan-5.md §4.0's table, in its order) */

const CLEAN = ['4m', '5m'];
const straight = s => s.head && (s.punch === 'jab' || s.punch === 'straight');
// (an event of his, since he picked the technique and within so many seconds)
const since = (s, e, within) => !!e && !!s.used && e.at >= s.used.at && s.t - e.at <= within;

define('pullCounter', {
  name: '풀백 3형제', section: '§3.8', open: LEVELS, as: 'pull', standard: lv => lv.grade >= 3, ready: true,
  // a jab or a straight at his head from 0.9 m or further: swayed back (half of his slips), as its trunk turns
  answer: { of: 'slip', share: 0.5, once: true, when: s => straight(s) && s.far >= 0.9, control: s => (s.soon ? { pull: true, tech: 'pullCounter' } : {}) },
  /* the punch gone by him in the sway, while he is still in it or has only just come out of it (the bout's grace: 0.1 s): out of
     anything else, a power punch is not the pull counter */
  opening: s =>
    s.used && s.used.id === 'pullCounter' && since(s, s.mem.by, 0.3) && (s.me.action ? s.me.action.name === 'pull' : !!s.me.lastEvade && s.me.lastEvade.name === 'pull' && s.me.lastEvade.endedAt !== null && s.t - s.me.lastEvade.endedAt <= 0.1)
      ? 'pullCounter:' + s.mem.by.at
      : null,
  /* (built, stage D: anim/evade.mjs PULLED, game/bout.mjs: out of the sway the press is the straight, the liver hook for the
     body, or the rear hook by name, at every grade, wound up as far as the grade's sway winds it and waiting for him to come
     back in) ② the rear hook if the other man has come in inside 0.85 m; ① else to the body by his body dice (a guard held
     up, the pressure plan: bodyChance); ③ else the straight (the commonest) */
  counter: s =>
    s.far < 0.85 ? { power: 'hookR', tech: 'pullCounter' } : Object.assign({ power: true, tech: 'pullCounter' }, s.roll() < bodyChance(s) ? { body: true } : {})
});

define('wave', {
  name: '파도', section: '§4.1', open: CLEAN, ready: true,
  /* (built by stage E, anim/clean.mjs; the bout lets a man into it who carries it and whose grade has one: bout.mjs wavesAt)
     wanting to be off at 1.3 m or more (defend, breathe, or tired), with room to go round; the jab plan, in half his rests
     between combinations, and only while he rests (the wave holds him off at 1.55-1.85 m, out of reach of starting one) */
  move: { when: s => s.ropes > 0.8 && (s.range >= 1.3 || (s.plan === 'jab' && s.resting)), chance: s => (s.range >= 1.3 ? 1 : 0.5), control: s => ({ away: 'wave', side: s.side }) }
});

define('parryDown', {
  name: '다운패링 카운터', section: '§4.2', open: CLEAN, ready: true,
  // a jab at his head within reach (a legend's: a straight too): the guard put up as a parry's is (60% of his parries)
  answer: { of: 'parry', share: 0.6, when: s => s.inReach && s.head && (s.punch === 'jab' || (s.punch === 'straight' && gradeOf(s.me.skills, 'parryDown').grade === 5)), control: s => ({ cover: s.soon, tech: 'parryDown' }) },
  /* (built: anim/clean.mjs, the bout's f.pat. Pressed down, the bout opens him as a parry does, and a power punch in that
     opening is the down parry's counter, from the hand that pressed it: a 4명's cross, a legend's jab and the cross after it) */
  counter: () => ({ power: true, tech: 'parryDown' })
});

define('blockFire', {
  name: '블록 & 파이어', section: '§4.3', open: CLEAN, ready: true,
  /* (built, stage G1: game/bout.mjs fired, anim/clean.mjs fireBody, skill.mjs fire) a hook to his body met by his elbow or
     forearm with his guard up (§3.4): the arm that blocked it fires, within 0.25 s (his grade's fire.within), as a counter:
     off the rear elbow the uppercut (the inside one inside 0.74 m), off the lead elbow the lead hook; a legend's other hand's
     hook follows it, the bout's */
  opening: s => {
    const k = s.mem.kept;
    return k && LOW[k.name] === 'hook' && (k.part === 'elbow' || k.part === 'forearm') && s.t - k.at <= 0.25 ? 'blockFire:' + k.at : null;
  },
  counter: () => ({ power: true, tech: 'blockFire' })
});

define('shift', {
  name: '타이슨 시프트', section: '§4.4', open: CLEAN, ready: true,
  /* (built, stage G2: game/bout.mjs f.shift, anim/shift.mjs, skill.mjs shift, moves.mjs shiftHook. One press meant as it is all
     of it: the rear hand's straight, the rear foot through past the lead one and the stance changed over, down low, the body
     hook and the uppercut the bout presses, and back round into his own stance; out of the shell, the crouch is there already) */
  // at 0.9-1.05 m with his breath (45%) for it, the other man rocked, covered up, or near the ropes: the shift, as one press
  combination: {
    when: s => s.far >= 0.9 && s.far <= 1.05 && s.breath >= 0.45 && (s.rocked || s.guarded || s.hisRopes < 1.2),
    weight: s => (0.15 + 0.35 * s.iq) * (s.plan === 'pressure' || s.plan === 'allin' ? 1.5 : 1),
    burst: () => [{ power: true, tech: 'shift', next: 0.3 }]
  }
});

define('shell', {
  name: '피커부 셸', section: '§4.5', open: CLEAN, ready: true,
  /* (built, stage G1: game/bout.mjs f.shell, anim/clean.mjs shellBody, skill.mjs shell. Crouched behind it his gloves and
     forearms are in the way of every punch but the uppercut; the counter is the lead hook out of the crouch and the rear body
     uppercut after it, the bout's) */
  // a jab or a straight at his head, his breath at half or more: crouched behind his guard (30% of his guards), 0.6-1.2 s
  answer: {
    of: 'guard', share: 0.3, when: s => straight(s) && s.breath >= 0.5,
    control: () => ({ cover: true, tech: 'shell' }), hold: s => 0.6 + 0.6 * s.roll(), held: s => ({ cover: !s.me.action, tech: 'shell' })
  },
  // the punch gone over him or into his gloves, within 0.25 s
  opening: s => {
    if (!s.used || s.used.id !== 'shell') return null;
    const e = [s.mem.by, s.mem.kept].find(e => since(s, e, 0.25));
    return e ? 'shell:' + e.at : null;
  },
  // the hook and the body uppercut out of the crouch; or, carrying it, the shift by its own chance (out of the crouch: stage G2)
  counter: s => (offered(s, 'shift') && s.roll() < TECHNIQUES.shift.combination.weight(s) ? { power: true, tech: 'shift' } : { power: true, tech: 'shell' })
});

define('crossArm', {
  name: '크로스암 가드', section: '§4A.8', open: ['3', '4m', '4a', '5m', '5a'], as: 'cover', standard: lv => lv.grade >= 4 && lv.side === 'a', ready: true
  /* no dice: carried, his guard is this shape whenever it is up (game/bout.mjs crossOf: has(f, 'crossArm') and his grade's
     skill.mjs CROSS; the shape, anim/show.mjs crossGuard) */
});

// (the rear hook out of a roll, or right up close, centre to centre, the rear uppercut: §4A.7)
const ROLLED = { inside: 0.74 };
define('rollCounter', {
  name: '숄더 롤 & 카운터', section: '§4A.7', open: ['4m', '4a', '5m', '5a'], ready: true,
  /* (the roll is built, stage H1: the guard put up meant as rollCounter rolls, game/bout.mjs rollFor, anim/show.mjs
     shoulderRoll; the counter is the rear hook, stage C2 (moves.mjs hookR, pressed by name), the rear uppercut right up close
     (§4A.7: inside 0.74 m); how much of it the roll has wound up already is stage H2's) */
  /* a straight at his head within reach: the guard up as a parry's, and rolled (60% of his parries). Rolled as its legs drive:
     its trunk fires too late for a roll to be turning as it lands (it makes the punch miss instead), stage H1's measure */
  answer: { of: 'parry', share: 0.6, when: s => s.inReach && s.head && s.punch === 'straight', control: s => (s.coming.chain.on[0] ? { cover: true, tech: 'rollCounter' } : {}) },
  // rolled: the straight met his lead shoulder as it rolled (stage H1's block: part 'shoulder', roll: true)
  opening: s => (s.used && s.used.id === 'rollCounter' && since(s, s.mem.kept, 0.3) && s.mem.kept.roll ? 'rollCounter:' + s.mem.kept.at : null),
  counter: s => ({ power: s.far < ROLLED.inside ? 'upperIn' : 'hookR', tech: 'rollCounter' })
});
