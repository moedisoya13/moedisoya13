/* 한 라운드 스파링: one round of promised sparring (약속 대련, docs/moves-plan-6.md §8; docs/spar.md), arranged from a seed in
   one pass of the real bout. Nothing here draws, and the same code makes the round in the page and under node.
     planOf(seed, o)   -> the round (o.arena: where it is fought, the ring unless it is 'underground': game/bout.mjs arenaOf):
                          { seed, arena, men, hp, favoured, target, inputs (both men's controls, step by step), rails
                          and feet (what each man does, his techniques and his footwork, a block an action: rails.mjs),
                          events (what became of every punch), ko, steps, time, stats }. Played back by startOf(plan) and
                          stepping it with plan.inputs, it is the same bout to the step, events, lanes and all
                          (tests/spar.test.mjs).
     planner(seed)     -> the same made a piece at a time, for a page that must keep drawing: .run(ms) works on for about that
                          long; .plan (as far as it has got), .done
     startOf(plan)     -> a bout set up as the round starts: the two men, their grades and loadouts, the health both start with
     replayOf(plan)    -> the round played again from its controls: { bout, events, rails, feet }
   How a round is made (docs/spar.md has it in Korean):
   - Two men, red (0) and blue (1), each at one of the seven grades, as likely as each other (1 in 7), but never more than
     two grades apart (SPAR.gap: 1..5, 4명 and 4암 one grade, 5명 and 5암 one; the user's rule, 2026-11-28): a pair further
     apart is drawn again, both men, on with the same dice, so that every pair the rule lets through is as likely as any
     other and the same seed is always the same pair; each carries the
     techniques his grade gives him (profile.mjs loadout) and fills his other slots from those his grade opens, the round's
     dice choosing (game/techniques.mjs: a technique added there comes in here). One of them is favoured (the better
     grade; the dice between two of the same); both start with the same health (hpOf), on the HUD from the first frame.
   - A bout cannot be copied (its men's bodies and dice are closures), so nothing is tried and taken back: the round is one
     bout, stepped once from its start to the first knockdown, with a choreographer at each man's controls (think). Both act
     all the time, at once: each has his next thing in hand while he is still doing the last, pressed and held so that the
     bout starts it on the first frame it lets him (no standing between two motions), chosen from what his grade and his
     loadout have: a punch or a combination (game/combos.data.mjs: what his grade knows, pressed beat by beat), a punch to
     the body, a show-off's trick or taunt, his head moved off the line, his guard put up, a dash, the duck in, the pivot
     and the circle out, the wave. A punch he knows is coming (on its way, or still in the other man's hand: the promise) is
     answered, as often as his grade reads one (the engine's own answers and their shares, game/techniques.mjs answerOf: a
     parry, the guard, the head out of the way, or a technique he carries), and an opening is taken (a parry's, a
     technique's, the punch an evasion has wound up); in the middle of his own punch he cannot answer, and they trade: the
     blow that lands first ends what the other man was doing (the engine's rule), which the rails show as a cut and a hit
     reaction.
   - His feet are a stream of their own, beside his techniques and at the same time (stepOf): one step after another with
     nothing between them, the distance (in, out, pressing, giving ground) and the axis (a side step, a pivot, cutting off
     the ring), by where the two of them are.
   - The director (direct) steers it to the knockdown without touching the bout: each man's health is held to a line (the
     unfavoured man's to nothing at the round's target time, the favoured man's to a share of what he started with) by how
     often the man ahead of his line is defended and how hard the other presses him. A man whose health is in the finish's
     zone is thrown power punches only, so that the blow that puts him down is one; past the target time the liver is gone
     for (a liver blow puts a man down whatever his health). The first knockdown ends the round, whoever's it is.
   - What the controls were is all the plan keeps of the choreographers: plan.inputs, and the lanes as the bout showed them. */
import { createBout, step, incoming, RULES, arenaOf } from '../game/bout.mjs';
import { TECHNIQUES, opens, has, memory, observe, situation, answerOf, counterOf, openingOf } from '../game/techniques.mjs';
import { loadout } from '../game/profile.mjs';
import { LEVEL, LEVELS, levelOf } from '../anim/skill.mjs';
import { MOVES, TO_BODY } from '../anim/moves.mjs';
import { arrival } from '../anim/animator.mjs';
import { createChain } from '../phys/chain.mjs';
import { COMBOS, KNOWS, beatsOf } from '../game/combos.data.mjs';
import { dice } from '../anim/stance.mjs';
import { RING } from '../world/ring.mjs';
import { watcher, measure, gapsOf, worthOf, POWER, WAY } from './rails.mjs';

export const DT = 1 / 60;
const F = s => Math.max(1, Math.round(s * 60));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/* The numbers of a round (tune here):
     target     seconds of the round, as it is watched, the first knockdown is steered to (the round's dice, least and most)
     late       seconds past it after which the liver is gone for
     most       seconds after which a round with no knockdown is given up, and arranged again with the seed's next dice
     tries      how many times a round is arranged at the most
     hp         the health both start with: a second of the target time takes about this much off the unfavoured man, by the
                favoured man's grade (measured with nothing steered: tools/spar.mjs --rates); `apart` more of it for each
                grade past one the other man is below him, `novice` more off a beginner; least and most of it kept
     zone       health under which a man is thrown power punches only: the blow that puts him down is then the power
                button's (a jab takes 3.8 at the most, a counter's gain in it)
     power      newton-seconds, a counter's gain in them, from which a blow counts as a power blow on the rails (rails.mjs)
     gap        the most grades (1..5: LEVEL[lv].grade) the two men may be apart; a pair further apart is drawn again
     tail       seconds the bout goes on after the knockdown (his fall)
     tilt       degrees the line between them may lie off the picture's width before they walk it back round (the camera
                does not turn: src/spar.mjs) */
export const SPAR = {
  target: [46, 60],
  late: 5,
  most: 88,
  tries: 3,
  hp: { rate: { 1: 0.36, 2: 0.6, 3: 0.96, '4m': 1.05, '4a': 1.05, '5m': 1.22, '5a': 1.22 }, apart: 0.14, novice: 0.2, span: [14, 96] },
  zone: 4.2,
  gap: 2,
  power: POWER,
  tail: 4,
  tilt: 36
};

/* How each grade spars. read: how often he does something about a punch he knows is coming; answers: how (the shares of a parry, the guard and getting out of the way, as the
   engine's heads have them: 1 in all); counter: how often he takes an opening; power: the share of his attacks led by a
   power punch; combo: of his attacks that are more than one punch; the weights of what he starts when nothing is coming
   (attack, head: his head moved with no punch coming, cover: the guard put up, feet); reads: he stops a combination when a
   punch of it misses; show: a show-off's taunts and tricks (4암, 5암), so that he taunts about 5% of the round (the user,
   2026-11-28: "도발은 5% 수준으로"; 0.12 had him taunting 18% of it once a taunt ran to its end; far off, where little else
   is picked, it is twice that, and so it does not go down in proportion: tests/taunt.test.mjs); iq: his sense, as a
   technique reads it. */
const STYLE = {
  1: { read: 0.4, answers: [['parry', 0.05], ['guard', 0.5], ['slip', 0.45]], counter: 0.2, power: 0.4, combo: 0.3, attack: 1, head: 0.1, cover: 0.2, feet: 0.3, reads: false, show: 0, iq: 0.2 },
  2: { read: 0.55, answers: [['parry', 0.1], ['guard', 0.4], ['slip', 0.5]], counter: 0.35, power: 0.4, combo: 0.45, attack: 1, head: 0.15, cover: 0.18, feet: 0.32, reads: false, show: 0, iq: 0.35 },
  3: { read: 0.7, answers: [['parry', 0.18], ['guard', 0.24], ['slip', 0.58]], counter: 0.55, power: 0.42, combo: 0.55, attack: 1, head: 0.2, cover: 0.14, feet: 0.36, reads: true, show: 0, iq: 0.5 },
  '4m': { read: 0.8, answers: [['parry', 0.2], ['guard', 0.16], ['slip', 0.64]], counter: 0.7, power: 0.42, combo: 0.6, attack: 1, head: 0.25, cover: 0.12, feet: 0.42, reads: true, show: 0, iq: 0.7 },
  '4a': { read: 0.76, answers: [['parry', 0.22], ['guard', 0.22], ['slip', 0.56]], counter: 0.7, power: 0.5, combo: 0.6, attack: 1.05, head: 0.2, cover: 0.12, feet: 0.36, reads: true, show: 0.013, iq: 0.7 },
  '5m': { read: 0.88, answers: [['parry', 0.22], ['guard', 0.1], ['slip', 0.68]], counter: 0.85, power: 0.42, combo: 0.65, attack: 1, head: 0.28, cover: 0.1, feet: 0.44, reads: true, show: 0, iq: 0.9 },
  '5a': { read: 0.84, answers: [['parry', 0.25], ['guard', 0.15], ['slip', 0.6]], counter: 0.85, power: 0.52, combo: 0.65, attack: 1.05, head: 0.22, cover: 0.1, feet: 0.38, reads: true, show: 0.013, iq: 0.9 }
};
const EVADE = ['slip', 'duck', 'roll', 'pull'];
const TAUNTS = ['beckon', 'chinOut', 'wind'];
// (the edges of the bands of distance the choreographer picks by: right up close, hook range, jab range, a step out, far)
const BAND = [0.74, 0.9, 1.2, 1.5];

const rank = lv => LEVEL[lv].grade;
/* (the health both start with, for a round steered to `target` seconds: what the favoured man takes off the other in that
   time; more the further below him the other man's grade is, who then stops less of it, and more again off a beginner) */
export const hpOf = (favoured, other, target) =>
  Math.round(clamp(SPAR.hp.rate[favoured] * target * (1 + SPAR.hp.apart * Math.max(0, rank(favoured) - rank(other) - 1) + (rank(other) === 1 && rank(favoured) > 1 ? SPAR.hp.novice : 0)), ...SPAR.hp.span));


/* ---- the two men: drawn as a pair until they are no more than SPAR.gap grades apart (each draw passes 37 times in 49) */
function menOf(rng) {
  for (;;) {
    const men = [manOf(rng), manOf(rng)];
    if (Math.abs(rank(men[0].grade) - rank(men[1].grade)) <= SPAR.gap) return men;
  }
}
function manOf(rng) {
  const grade = LEVELS[Math.floor(rng() * LEVELS.length)],
    skills = { all: grade },
    standard = loadout(skills),
    // (the rest of his slots from what his grade opens, in an order the dice choose)
    more = Object.keys(TECHNIQUES).filter(id => !standard.includes(id) && opens(skills, id)),
    order = more.map(id => [rng(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]),
    asked = [...standard, ...order];
  /* (the shoulder roll only with the cross-arm guard, which goes in ahead of it: rolled by a man who does not hold that
     guard, the engine takes its shape on for the moment, and a lead hook coming as that moment ends throws in the
     animator, anim/animator.mjs ear with no shape; found by this page, not mended here) */
  if (asked.includes('rollCounter') && asked.indexOf('crossArm') > asked.indexOf('rollCounter')) asked.splice(asked.indexOf('crossArm'), 1), asked.splice(asked.indexOf('rollCounter'), 0, 'crossArm');
  const techniques = loadout(skills, asked);
  return { grade, skills, techniques: techniques.includes('rollCounter') && !techniques.includes('crossArm') ? techniques.filter(id => id !== 'rollCounter') : techniques };
}

/* A bout as the round starts: the two men as the plan has them, both with the round's health. */
export function startOf(plan) {
  const bout = createBout(plan.seed, { skills: plan.men.map(m => m.skills), techniques: plan.men.map(m => m.techniques), arena: plan.arena });
  bout.fighters.forEach(f => (f.hp = plan.hp));
  return bout;
}

/* ---- a man's choreographer: what he presses this step, from what the bout shows. It reads the bout and never writes it. */
const punching = f => !!f.action && !!MOVES[f.action.name].punch;
function createMind(i, man, rng) {
  return {
    i, grade: man.grade, lv: LEVEL[man.grade], st: STYLE[man.grade], rng,
    queue: [], // the presses he has in hand: [{ press, kind, at (not before this step), drop (given up after), serial }]
    pause: 0,
    hold: 0, holding: null, seen: null, answer: null,
    step: null, steps: 0, stepAt: 0, lastStep: null, wave: null, circle: rng() < 0.5 ? 1 : -1, range: 1.05, rangeFor: 0,
    tried: null, triedBy: null, triedKept: null, triedOpen: null, lastKind: null, threat: null, pressed: null, waiting: -9,
    // (what a technique's own reading needs of a head: game/techniques.mjs situation)
    mem: memory(), used: null, rest: 0, rests: 0, going: null, rehearse: false
  };
}

// a press of a punch by its name: the jab button, or the power button with the punch named; and for the body
const pressOf = (name, body) => {
  const id = body && TO_BODY[name] ? TO_BODY[name] : name;
  return id === 'jab' ? { jab: true } : id === 'jabBody' ? { jab: true, body: true } : { power: id };
};
// a combination's beats as presses (those of it there are punches for: game/combos.data.mjs LATER has the rest)
function beatsAs(id, grade, o) {
  const beats = beatsOf(id);
  if (!beats || beats.some(b => !MOVES[b.do] || !MOVES[b.do].punch)) return null;
  return beats.map((b, j) => ({ press: pressOf(b.do, b.to === 'body' || (o && o.body === j)) }));
}
const pick = (rng, options) => {
  const sum = options.reduce((s, o) => s + o[0], 0);
  let u = rng() * sum;
  for (const o of options) if ((u -= o[0]) < 0) return o[1];
  return options.length ? options[options.length - 1][1] : null;
};

/* What he throws, from where he stands: -> the presses, or null. band: BAND's; steer: the director's. */
function attackOf(m, me, him, far, band, steer) {
  const rng = m.rng,
    st = m.st,
    g = rank(m.grade),
    one = (name, body) => [{ press: pressOf(name, body) }],
    chain = n => Array.from({ length: n }, (_, j) => ({ press: { power: true } })),
    tricks = m.lv.vary ? new Set([...(m.lv.vary.jab || []), ...(m.lv.vary.power || [])].map(x => x[0])) : new Set(),
    opts = [],
    add = (w, beats) => beats && w > 0 && opts.push([w, beats]),
    i = m.i;
  // (the finish: power punches only, so that the blow that puts him down is one; past the target time, the liver)
  if (steer.finish[i]) {
    /* (each from where it lands with all of him behind it, so that the last blow is a real one: the hook and the uppercut
       from their own range, the straight from the end of its reach; from anywhere else he waits for his feet) */
    if (far >= 0.76 && far < 0.9) (add(1, one('hook')), add(1, one('upper')), add(g >= 3 ? 0.6 : 0, one('hookR')), add(steer.liver[i] ? 4 : 0, one('hookBody')));
    else if (far >= 0.92 && far <= 1.16) (add(1, one('cross')), add(0.8, beatsAs('2-3-2', m.grade)), add(0.6, chain(2)));
    else if (steer.liver[i] && far < 0.76) add(1, chain(2));
    return opts.length ? pick(rng, opts) : null;
  }
  const power = clamp(st.power * steer.press[i], 0.12, 0.85),
    combo = st.combo,
    knows = KNOWS[m.grade].combos,
    known = (id, o) => (knows.includes(id) ? beatsAs(id, m.grade, o) : null),
    low = g >= 2 ? 0.16 : 0.08; // (how much of it goes to the body)
  if (band === 3) {
    // (a step out: the jab that walks in, the one-two behind it)
    add(1, one('jab'));
    add(far < 1.36 ? combo : 0, known('1-2'));
    add(tricks.has('flicker') ? 0.5 : 0, [{ press: { jab: 'flicker' } }, { press: { jab: 'flicker' } }]);
  } else if (band === 2) {
    const light = 1 - power;
    add(light * (1 - combo) * 1.2, one('jab'));
    add(light * (1 - combo) * 0.5, [...one('jab'), { press: { jab: true } }]);
    add(light * low * 2, one('jab', true));
    add(light * combo, known('1-2'));
    add(light * combo * 0.6, known('1-1-2'));
    add(light * combo * 0.8, known('1-2-3'));
    add(light * combo * 0.6, known('1-2-3-2'));
    add(light * combo * 0.4, known('1-6-3-2'));
    add(light * combo * low * 2, known('1-2', { body: 1 }));
    add(power * (1 - combo), one('cross'));
    add(far < 1.02 ? power * 0.6 : 0, one('hook'));
    add(far < 1.02 ? power * 0.4 : 0, one('upper'));
    add(power * low * 2, one('cross', true));
    add(power * combo * 0.7, chain(g >= 3 ? 3 : 2));
    add(power * combo * 0.5, known('2-3-2'));
    add(tricks.has('flicker') ? 0.25 : 0, [{ press: { jab: 'flicker' } }, { press: { jab: 'flicker' } }, { press: { jab: 'flicker' } }]);
    add(tricks.has('thumb') ? 0.06 : 0, [{ press: { jab: 'thumb' } }]);
    add(tricks.has('pawDown') && him.cover && him.coverAge > 0.2 ? 0.8 : 0, [{ press: { power: 'pawDown' } }]);
    // (the Tyson shift: its body hook is to the liver, so only late in the round, or at a guard held up)
    add(has(me, 'shift') && far >= 0.9 && far <= 1.05 && me.stamina / me.k.staminaMax >= 0.45 && (steer.late || (him.cover && him.coverAge > 0.3)) ? 1.2 : 0, [{ press: { power: true, tech: 'shift' } }]);
  } else if (band === 1) {
    add(power, one('hook'));
    add(power * 0.8, one('upper'));
    add(power * 0.5, one('cross'));
    add(g >= 3 ? power * 0.5 : 0, one('hookR'));
    add(power * combo, known('2-3-2'));
    add(power * combo * 0.7, [...one('hook'), { press: pressOf('cross') }]);
    add((1 - power) * 0.9, one('jab'));
    add((1 - power) * combo, known('1-2'));
    add(low * 1.5, one('cross', true));
    add(low, one('upper', true));
    add(tricks.has('elbow') && far >= 0.75 && far <= 0.85 ? 0.3 : 0, [{ press: { power: 'elbow' } }]);
    add(tricks.has('stomp') ? 0.08 : 0, [{ press: { power: 'stomp' } }]);
    add(tricks.has('pawUp') && him.cover && him.coverAge > 0.2 ? 0.6 : 0, [{ press: { power: 'pawUp' } }]);
    // (the liver hook at a guard held up, late in the round: his elbow is in the way of it, or it is the finish)
    add(steer.late && him.cover && him.coverAge > 0.2 ? 0.5 : 0, one('hookBody'));
  } else {
    add(1, chain(1 + Math.floor(rng() * (g >= 3 ? 3 : 2))));
    add(low * 2, one('upper', true));
    add(tricks.has('collar') ? 0.4 : 0, [{ press: { power: 'collar' } }]);
  }
  return pick(rng, opts);
}

/* ---- what is coming at him, and when. The round is promised: a man knows the punch the other has in hand before it is
   pressed (the next press of his queue, in hand while he is still doing the last thing), as a sparring partner who has
   agreed the exchange does; a punch that was not in hand (a counter) he sees only once it is on its way.
   -> { key, name, land (the step it gets there, about), q (the press in hand, until it is pressed) } or null. */
const FLIGHT = new Map();
// frames from a punch's press to its landing, about, by who throws it (as far as the arm takes to go out, less a little)
function flightOf(f, name) {
  const level = levelOf(f.skills, MOVES[name].of && !(f.skills && f.skills[name]) ? MOVES[name].of : name),
    key = name + '|' + level.id + '|' + f.k.rate;
  if (!FLIGHT.has(key)) FLIGHT.set(key, Math.max(3, Math.round(arrival(createChain(MOVES[name], f.k.rate, level), MOVES[name]) * 60) - 2));
  return FLIGHT.get(key);
}
// the punch a press is, as near as can be told before the bout has made it one
const punchOf = (press, far) => {
  const v = press.jab ? (press.body ? 'jabBody' : press.jab === true || !MOVES[press.jab] ? 'jab' : press.jab) : press.power;
  if (typeof v === 'string' && MOVES[v] && MOVES[v].punch) return v;
  if (v === 'pawUp' || v === 'collar') return 'upper';
  if (v === 'stomp') return 'hook';
  return press.power ? (far < RULES.inside ? 'hookIn' : 'cross') : null;
};
function threatOf(m, his, bout, k, far) {
  const him = bout.fighters[1 - m.i],
    coming = incoming(him);
  if (coming) return { key: coming.id, name: coming.name, land: k + Math.max(0, Math.floor(arrival(coming.chain, MOVES[coming.name]) * 60 - 3.5)), q: null, coming };
  const q = his.queue[0],
    name = q && (q.at || 0) - k <= 16 ? punchOf(q.press, far) : null;
  return name ? { key: q, name, land: Math.max(q.at || 0, k) + flightOf(him, name), q, coming: null } : null;
}
/* How many frames before a punch lands each way out of its way has to be pressed, by his grade (measured against punches
   of four grades from three distances: the frames that make most of them miss). A duck and a weave go under a hook only if
   they start before it does: they are for a hook he knows is coming. A great one's slip is out and back too quickly to be
   timed by anything but his own eye (it makes one punch in three miss from here): he sways back or steps back more. */
const LEAD = {
  slip: { 1: 9, 2: 4.5, 3: 3, '4m': 2, '4a': 2, '5m': 2, '5a': 2 },
  pull: { 1: 10, 2: 6, 3: 2.5, '4m': 2, '4a': 2, '5m': 2, '5a': 2 },
  duck: { 1: 18, 2: 18, 3: 14, '4m': 16, '4a': 16, '5m': 13, '5a': 13 },
  roll: { 1: 22, 2: 21, 3: 16, '4m': 12, '4a': 12, '5m': 10, '5a': 10 },
  back: { 1: 7, 2: 7, 3: 6, '4m': 6, '4a': 6, '5m': 6, '5a': 6 }
};

/* The answer to a punch he knows is coming, decided once: the engine's own (a parry, the guard, out of the way, or a
   technique he carries taking its part of one of them), and the way out of the way that fits the punch and that there is
   still time for. */
function answerFor(m, s, threat, k) {
  const rng = m.rng,
    me = s.me,
    left = threat.land - k,
    can = kind => left >= LEAD[kind][m.grade] - 0.5;
  if (me.stun > 0) return { kind: 'guard' };
  // (the cross counter: the rear straight thrown over a jab; carried, and not yet one of the engine's own answers)
  if (has(me, 'crossCounter') && s.head && s.punch === 'jab' && s.far >= 0.9 && s.far <= 1.14 && rng() < 0.4) return { kind: 'cross' };
  const a = answerOf(s, rng(), m.st.answers),
    t = TECHNIQUES[a];
  if (t) return { kind: 'tech', id: a };
  if (a === 'guard' || s.body) return { kind: 'guard' };
  if (a === 'parry') return s.punch === 'upper' ? { kind: 'guard' } : { kind: 'parry' };
  if (a !== 'slip') return null;
  const hand = MOVES[threat.name].hand === 'L',
    r = rng(),
    great = rank(m.grade) >= 4,
    first = s.punch === 'hook' ? (r < 0.5 ? 'duck' : r < 0.68 ? 'roll' : r < 0.84 ? 'pull' : 'back') : s.punch === 'upper' ? (r < 0.6 ? 'pull' : 'back') : r < (great ? 0.18 : 0.45) ? 'slip' : r < 0.82 ? 'pull' : 'back',
    // (if there is no time left for it, the quickest that there is time for; if for none, the guard)
    kind = [first, 'back', 'pull', 'slip'].find(x => can(x) && !(x === 'slip' && s.punch !== 'jab' && s.punch !== 'straight'));
  if (!kind) return { kind: 'guard' };
  return { kind, side: kind === 'slip' ? (hand ? -1 : 1) : kind === 'roll' ? (hand ? 1 : -1) : true };
}

/* His next step, from where the two of them are: -> { kind, side, until }. The distance: 'in', 'out', 'press' (walking him
   down), 'back' (giving ground, off to a side); the axis: 'side' (a side step), 'pivot' (round him from close, turning the
   line between them), 'cut' (across the way he is going, to cut the ring off). Closing when he is out of range, out or
   round when he is right up close; in with a punch he has in hand; round and off the ropes when they are at his back;
   pressing and cutting when they are at the other man's; and not the same step twice running, mostly. */
function stepOf(m, his, me, him, far, band, at, steer) {
  const rng = m.rng,
    hisEdge = RING.half - Math.max(Math.abs(him.x), Math.abs(him.z)),
    // (which way he is going across the line between them, if he is)
    drift = (him.gx || 0) * at.across[0] + (him.gz || 0) * at.across[1],
    going = Math.abs(drift) > 0.35,
    // (a punch in hand that he is not yet near enough for: his feet take him in with it)
    name = m.queue.length ? punchOf(m.queue[0].press, far) : null,
    told = !!name && far > MOVES[name].reach - 0.12,
    tired = me.stamina / me.k.staminaMax < 0.3,
    // (by the band of distance they are at, right up close first: in, out, press, back, side, pivot, cut)
    w = [[0, 0.4, 1.6, 3.5, 5][band], [3, 2.2, 1, 0.3, 0][band], [0, 0.3, 1.2, 2.2, 3][band], [2, 1.2, 0.6, 0.15, 0][band], [1, 2, 3, 2.2, 0.8][band], [3, 3, 2, 0.8, 0][band], [0, 0.4, 0.8, 1.5, 3][band] * (going ? 1 : 0.15)],
    kinds = ['in', 'out', 'press', 'back', 'side', 'pivot', 'cut'],
    weight = (kind, j) =>
      w[j] *
      (m.lastStep === kind ? 0.3 : 1) *
      (told && kind === 'in' ? 3 : 1) *
      (told && (kind === 'out' || kind === 'back') ? 0.15 : 1) *
      (at.edge < 0.9 ? (WAY[kind] === 'axis' ? 3 : kind === 'out' || kind === 'back' ? 0.1 : 1) : 1) *
      (hisEdge < 1 ? (kind === 'cut' || kind === 'press' ? 3.5 : kind === 'out' || kind === 'back' ? 0.3 : 1) : 1) *
      (steer.finish[m.i] ? (far < 0.9 ? (kind === 'out' ? 4 : kind === 'in' || kind === 'press' ? 0.1 : 1) : far > 1.14 ? (kind === 'in' || kind === 'press' ? 3 : 1) : kind === 'side' ? 2 : 0.6) : 1) *
      (tired && (kind === 'out' || kind === 'back' || kind === 'side') ? 1.6 : 1),
    kind = pick(rng, kinds.map((x, j) => [weight(x, j), x])),
    // (the way round: back toward the picture's width if the line has gone far off it; with him, to cut him off; else the
    // way he has been going, mostly)
    keep = rng() < 0.65 ? m.circle : -m.circle,
    side = kind === 'cut' && going ? (drift > 0 ? 1 : -1) : at.tilt > SPAR.tilt * 0.75 ? at.home : keep,
    secs = { in: [0.3, 0.55], out: [0.25, 0.45], press: [0.6, 1], back: [0.3, 0.5], side: [0.4, 0.7], pivot: [0.4, 0.7], cut: [0.5, 0.85] }[kind];
  m.circle = side;
  m.lastStep = kind;
  return { kind, side, until: 0, secs: secs[0] + rng() * (secs[1] - secs[0]) };
}

function think(m, his, bout, k, steer) {
  const i = m.i,
    me = bout.fighters[i],
    him = bout.fighters[1 - i],
    c = { move: [0, 0] },
    rng = m.rng,
    st = m.st;
  observe(m.mem, bout, i);
  if (bout.over !== null || me.down || him.down) return c;
  for (const e of bout.events) {
    // (hit: whatever he meant to do is gone with what he was doing; a miss ends a combination of a man who reads them)
    if (e.type === 'hit' && e.on === i) {
      m.queue.length = 0;
      m.answer = m.step = m.wave = m.holding = null;
      m.stepAt = k;
      // (a hurt man pulls his hands up, as often as he reads a punch, and keeps them there a moment: the bout lets a stunned
      // man do that and nothing else)
      m.hold = rng() < clamp(0.15 + 0.5 * st.read * steer.guard[i], 0.05, 0.9) ? F(RULES.stun[0] + worthOf(e) * RULES.stun[1] + 0.25 + 0.35 * rng()) : 0;
    } else if (e.type === 'whiff' && e.who === i && st.reads) m.queue.length = 0;
  }
  const dx = him.x - me.x,
    dz = him.z - me.z,
    far = Math.hypot(dx, dz) || 1,
    to = [dx / far, dz / far],
    across = [to[1], -to[0]],
    band = BAND.findIndex(b => far < b) < 0 ? 4 : BAND.findIndex(b => far < b),
    threat = threatOf(m, his, bout, k, far),
    coming = threat && threat.coming,
    move = threat && MOVES[threat.name],
    // (the bout as a technique reads it; a punch he only knows is coming is read as it will be)
    s = Object.assign(situation(bout, i, m, { coming, range: m.range, side: m.circle, iq: st.iq, plan: null, roll: rng }), threat && !coming ? { punch: move.kind === 'straight' ? (move.hand === 'L' ? 'jab' : 'straight') : move.kind, body: !!move.zone, head: !move.zone, inReach: far < move.reach + 0.25 } : null),
    started = kind => (m.lastKind = kind || m.lastKind);
  m.rest = m.queue.length ? 0 : 1;
  if (k >= m.rangeFor) (m.range = 0.96 + 0.22 * rng()), (m.rangeFor = k + F(0.8 + 1.4 * rng()));

  /* ---- his feet, a stream of their own beside his techniques: one step after another (stepOf: the distance, in, out,
     pressing, giving ground; the axis, a side step, a pivot, cutting off the ring), each the stick held its way for its
     time, named in the controls (walk) for the rails; off the ropes; and never so far round that the line between them
     leaves the picture's width (the camera does not turn) */
  const feet = () => {
    /* (a taunt, pressed or under way: his feet stand for it, the stream of steps left off until it is over; the bout ends a
       taunt the moment he sets off, game/bout.mjs, so a step under it would end it on its first frame) */
    if (c.taunt || (me.action && MOVES[me.action.name].taunt)) return (m.step = null), (m.stepAt = k), c;
    const tilt = Math.atan2(Math.abs(dz), Math.abs(dx)) * (180 / Math.PI),
      // (which way round brings the line back across the picture)
      turn = d => Math.abs(dz - across[1] * d * 0.1) / (Math.abs(dx - across[0] * d * 0.1) || 1e-6),
      home = turn(1) < turn(-1) ? 1 : -1,
      edge = RING.half - Math.max(Math.abs(me.x), Math.abs(me.z));
    let w = m.step;
    if (w && (k >= w.until || ((w.kind === 'in' || w.kind === 'press') && far < 0.8) || ((w.kind === 'out' || w.kind === 'back') && far > 1.6))) (m.step = w = null), (m.stepAt = k);
    if (!w && k >= m.stepAt) (w = m.step = Object.assign(stepOf(m, his, me, him, far, band, { tilt, home, edge, across, to }, steer), { id: ++m.steps })), (w.until = k + F(w.secs));
    if (w && tilt > SPAR.tilt && w.side !== home && WAY[w.kind] === 'axis') w.side = home;
    let ahead = far > m.range + 0.1 ? 0.6 : far < m.range - 0.14 ? -0.6 : 0,
      side = 0;
    if (w) {
      c.walk = w.kind + w.id;
      until: switch (w.kind) {
        case 'in': ahead = 0.8; break until;
        case 'out': ahead = -0.75; break until;
        case 'press': (ahead = 0.55), (side = w.side * 0.12); break until;
        case 'back': (ahead = -0.6), (side = w.side * 0.35); break until;
        case 'side': (ahead *= 0.4), (side = w.side * 0.8); break until;
        case 'pivot': (ahead = far > 0.85 ? 0.3 : 0), (side = w.side * 0.95); break until;
        default: (ahead = far > 1 ? 0.45 : 0.1), (side = w.side * 0.8); // (cut: across his way, and in)
      }
    }
    let x = to[0] * ahead + across[0] * side,
      z = to[1] * ahead + across[1] * side;
    if (edge < 0.8) {
      const l = Math.hypot(me.x, me.z) || 1,
        pull = ((0.8 - edge) / 0.8) * 1.4;
      x -= (me.x / l) * pull;
      z -= (me.z / l) * pull;
    }
    const l = Math.hypot(x, z);
    c.move = l > 1 ? [x / l, z / l] : [x, z];
    return c;
  };

  // ---- a punch is coming: decide once what to do about it, as soon as he can do anything (in the middle of his own punch
  // he cannot: they trade)
  if (threat) {
    // (the punch he knew of, pressed: it is the same one)
    if (m.threat && m.threat.q && coming && his.pressed === m.threat.q) m.threat = { key: threat.key, decided: true };
    if (!m.threat || m.threat.key !== threat.key) (m.threat = { key: threat.key, q: threat.q, decided: false }), (m.answer = null);
    // (he can once his own punch has been thrown, or whatever else he is in is not a punch; stunned, his hands only)
    const able = !punching(me) || me.action.chain.phase === 'hold' || me.action.chain.phase === 'recover';
    if (!m.threat.decided && able && (coming || threat.land - k <= 24)) {
      m.threat.decided = true;
      if (s.inReach && rng() < Math.min(0.96, st.read * steer.guard[i]) * (me.stun > 0 ? 0.6 : 1)) m.answer = answerFor(m, s, threat, k);
      // (what he had in hand is put down for a guard or a way out; a parry's moment may still be some way off)
      if (m.answer && (LEAD[m.answer.kind] || m.answer.kind === 'guard')) (m.queue.length = 0), (m.wave = null);
    }
  } else if (m.answer) m.answer = null;
  if (threat && m.answer) {
    const a = m.answer,
      t = a.kind === 'tech' ? TECHNIQUES[a.id] : null;
    if (t) {
      // (a technique's own way with it: the engine's, once the punch is on its way)
      if (coming) {
        if (!m.used || m.used.of !== coming.id) m.used = { id: t.id, of: coming.id, at: bout.t, hold: t.answer.hold ? t.answer.hold(s) : 0.12 };
        m.queue.length = 0;
        Object.assign(c, t.answer.control(s));
        m.hold = F(m.used.hold);
        m.holding = t.id;
        if (t.answer.once && s.soon) m.answer = null;
        started('answer');
        return feet();
      }
    } else if (a.kind === 'guard' || a.kind === 'parry') {
      if (a.kind === 'guard' || (coming && s.soon)) c.cover = true;
      if (c.cover) {
        m.queue.length = 0;
        m.hold = F(0.12);
        m.holding = null;
        started('answer');
        return feet();
      }
    } else if (a.kind === 'cross') {
      if (coming) {
        Object.assign(c, { power: true, tech: 'crossCounter' });
        m.queue.length = 0;
        m.answer = null;
        started('answer');
        return feet();
      }
    } else if (threat.land - k <= LEAD[a.kind][m.grade]) {
      /* (out of the way: pressed as many frames before it lands as his grade's way out takes, and held until the bout has
         started it, so that it starts on the first frame it can) */
      if (a.serial !== undefined && me.serial !== a.serial) m.answer = null;
      else {
        a.serial = me.serial;
        if (a.kind === 'back') c.dash = true;
        else c[a.kind] = a.side;
        started('answer');
        return c;
      }
    }
    /* (waiting for the moment of his way out: his hands up meanwhile, so that he is never standing doing nothing. Not for
       long, and not while the other man is waiting for him: two men each waiting for the other's punch would stand there) */
    a.waited = (a.waited || 0) + 1;
    if (a.waited > 30 || (!coming && his.waiting >= k - 1)) m.answer = null;
    else if (LEAD[a.kind]) return (m.waiting = k), (c.cover = !me.action), feet();
    // (a parry's or a technique's moment: he waits for a punch that is on its way; one still in hand, he goes on meanwhile)
    else if (coming) return (m.waiting = k), feet();
  }
  if (m.hold > 0) {
    // (the guard kept up a moment after the punch has gone by, or for as long as he meant to hold it; a technique's own way)
    m.hold--;
    c.cover = !me.action;
    const t = m.holding && TECHNIQUES[m.holding];
    if (t && t.answer && t.answer.held) Object.assign(c, t.answer.held(s));
    // (not counted down while something of his is still on its way home: the guard is not up yet)
    if (me.action) m.hold++;
  }

  // ---- an opening: taken as often as his grade takes one (each rolled for once)
  const counter = clamp(st.counter * (0.6 + 0.4 * steer.press[i]), 0, 0.95),
    // (a technique's counter for the body is its liver hook: kept for late in the round, when a knockdown may come)
    late = press => (press.body && !steer.late ? Object.assign({}, press, { body: false }) : press);
  if (me.counter > 0 && far < MOVES.cross.reach) {
    const key = me.parried ? me.parried.at : -1;
    if (m.triedOpen !== key) {
      m.triedOpen = key;
      if (rng() < counter) m.queue = [{ press: late(Object.assign({ power: true }, counterOf(s))), drop: k + F(0.8) }];
    }
  }
  const made = openingOf(s);
  if (made && made.key !== m.tried) {
    m.tried = made.key;
    if (rng() < counter) {
      m.hold = 0;
      m.holding = null;
      m.queue = [{ press: late(TECHNIQUES[made.id].counter(s)), drop: k + F(0.5) }];
    }
  }
  // (his punch gone by in an evasion: the punch the evasion has wound up)
  const by = m.mem.by,
    ev = me.action && EVADE.includes(me.action.name) ? me.action : null;
  if (by && bout.t - by.at <= 0.3 && m.triedBy !== by.at && ev && !made) {
    m.triedBy = by.at;
    if (rng() < counter && far < MOVES.cross.reach + 0.1) m.queue = [{ press: { power: true }, drop: k + F(0.9) }];
  }
  // (his punch blocked: fired back at once, half as often)
  const kept = m.mem.kept;
  if (kept && bout.t - kept.at <= 0.2 && m.triedKept !== kept.at && !m.queue.length && !made) {
    m.triedKept = kept.at;
    if (rng() < counter * 0.5) {
      m.hold = 0;
      m.queue = attackOf(m, me, him, far, Math.min(band, 2), steer) || [];
    }
  }

  /* ---- the presses he has in hand: the first is pressed, and held down, from the moment it is in hand, so that the bout
     starts it on the first frame it lets him (a punch as the one before it is thrown, anything else as he comes free); once
     the bout has started it (his count of moves has gone on), the next */
  while (m.queue.length) {
    const q = m.queue[0],
      name = punchOf(q.press, far);
    if (q.serial !== undefined && me.serial !== q.serial) {
      m.queue.shift();
      m.pressed = q;
      started(q.kind || 'attack');
      continue;
    }
    if (q.drop === undefined) q.drop = k + F(0.9);
    // (given up: too late, out of reach, or a light punch at a man in the finish's zone)
    if (k > q.drop || (name && far > MOVES[name].reach + 0.42) || (him.hp <= SPAR.zone && (q.press.jab || q.press.body))) m.queue.length = 0;
    else if (k >= (q.at || 0)) (q.serial = me.serial), Object.assign(c, q.press);
    break;
  }
  if (m.queue.length) return feet();

  // ---- the wave, for as long as he means to keep it (a jab out of it on the way)
  if (m.wave) {
    if (k >= m.wave.until || band === 0 || (me.action && me.action.name !== 'wave' && !punching(me))) m.wave = null;
    else {
      Object.assign(c, { away: 'wave', side: m.wave.side });
      if (k === m.wave.jab && far < MOVES.jab.reach + 0.5) c.jab = true;
      return c;
    }
  }

  /* ---- nothing in hand: the next thing, chosen at once and pressed at once (held: it starts on the first frame the bout
     lets him, with nothing between it and what he is doing now) */
  if (m.hold <= 0 && k >= m.pause && !(me.action && MOVES[me.action.name].taunt)) {
    const breath = me.stamina / me.k.staminaMax,
      tired = breath < 0.3,
      press = steer.press[i],
      edge = RING.half - Math.max(Math.abs(me.x), Math.abs(me.z)),
      fin = steer.finish[i],
      again = kind => (m.lastKind === kind ? 0.35 : 1), // (not the same thing twice running, mostly)
      what = pick(rng, [
        // (pressing less, he throws less: a man well ahead of where the round wants him boxes, moves and waits)
        [(band <= 2 ? st.attack * (tired ? 0.35 : 1) * (fin ? 3 : 1) : band === 3 ? st.attack * 0.9 : 0) * press * Math.min(1, press), 'attack'],
        [band <= 3 && !fin ? st.head * again('head') * (band === 3 ? 0.6 : 1) : 0, 'head'],
        [band <= 3 && !fin ? (st.cover * (tired ? 2 : 1) * again('cover') * (band === 3 ? 0.7 : 1)) / press : band === 4 ? 0.05 : 0, 'cover'],
        // (the engine's own footwork takes all of him for its time: less of it, and not while the other man is in his)
        [band <= 3 ? st.feet * 0.6 * (band === 0 ? 2 : 1) * (tired ? 1.5 : 1) * again('feet') * (fin ? 0.3 : 1) * (him.action && !punching(him) ? 0.15 : 1) : 0, 'feet'],
        [st.show && band >= 2 && !fin ? st.show * (band >= 3 ? 2 : 1) * again('show') : 0, 'show'],
        [has(me, 'wave') && band >= 2 && band <= 3 && edge > 0.9 && !fin ? 0.07 * again('feet') : 0, 'wave']
      ]);
    if (what === 'attack') {
      const beats = attackOf(m, me, him, far, band, steer);
      if (beats) m.queue = beats;
      // (nothing to throw from here, in the finish: his hands up while his feet take him to where there is)
      else (m.hold = 8), (m.holding = null);
    } else if (what === 'head') {
      // (his head moved with nothing coming, and sometimes the punch it winds up after it)
      const r = rng(),
        side = rng() < 0.5 ? 1 : -1;
      m.queue = [{ press: r < 0.45 ? { slip: side } : r < 0.7 ? { duck: true } : r < 0.88 ? { roll: side } : { pull: true }, kind: 'head' }];
      if (rng() < st.counter * 0.5) m.queue.push({ press: { power: true }, drop: undefined });
    } else if (what === 'cover') {
      m.hold = F(0.28 + 0.3 * rng());
      m.holding = has(me, 'shell') && breath >= 0.5 && rng() < 0.3 ? 'shell' : null;
      m.lastKind = 'cover';
    } else if (what === 'feet') {
      // (the engine's own footwork, which takes all of him: a dash, the duck in, the pivot and the circle out)
      const r = rng(),
        side = rng() < 0.5 ? 1 : -1,
        q = press => (m.queue = [{ press, kind: 'feet' }]);
      m.step = null;
      if (band >= 2) {
        if (r < 0.35) q({ dash: [across[0] * side - to[0] * 0.3, across[1] * side - to[1] * 0.3] });
        else if (r < 0.7 && band === 2) {
          // (the duck in, and the inside punches out of it)
          q({ duck: true, dash: [to[0], to[1]] });
          if (rng() < 0.75) m.queue.push({ press: { power: true } }, { press: { power: true } });
        } else q({ away: rng() < 0.5 ? 'pivot' : 'circle', side });
      } else if (r < 0.45) q({ away: 'pivot', side });
      else if (r < 0.8) q({ away: 'circle', side });
      else q({ dash: true });
    } else if (what === 'show') {
      // (a taunt is over the moment he does anything else: nothing else for as long as it takes)
      m.queue = [{ press: { taunt: TAUNTS[Math.floor(rng() * TAUNTS.length)] }, kind: 'show' }];
      m.pause = k + 8;
    } else if (what === 'wave') {
      m.wave = { side: m.circle || 1, until: k + F(0.8 + 0.7 * rng()), jab: rng() < 0.6 ? k + F(0.4 + 0.3 * rng()) : -1 };
      Object.assign(c, { away: 'wave', side: m.wave.side });
      started('feet');
      return c;
    }
    // (in hand: pressed this very step)
    if (m.queue.length && k >= (m.queue[0].at || 0)) (m.queue[0].serial = me.serial), (m.queue[0].drop = k + F(0.9)), Object.assign(c, m.queue[0].press);
    if (m.hold > 0) c.cover = true;
  }
  return feet();
}

/* ---- the director: how hard each man presses and how often each is defended, from where their health is against where
   the round wants it by now. Read by the choreographers; the bout is not touched. */
function direct(steer, bout, k, plan) {
  const t = k / 60,
    T = plan.target,
    H = plan.hp,
    x = Math.min(1, t / T);
  steer.late = t > T * 0.9;
  for (const X of [0, 1]) {
    const Y = 1 - X,
      f = bout.fighters[X],
      // (where his health should be by now: the unfavoured man's at nothing by the target time, the favoured man's at his share)
      line = H * (X === plan.favoured ? 1 - plan.loss * x : 1 - x),
      over = (f.hp - line) / H;
    steer.guard[X] = clamp(1 - 4.5 * over, 0.12, 1.5);
    steer.press[Y] = clamp(1 + 3.5 * over, 0.4, 1.75);
    steer.finish[Y] = f.hp <= SPAR.zone || (X !== plan.favoured && t > T + SPAR.late);
    steer.liver[Y] = X !== plan.favoured && t > T + SPAR.late;
    if (steer.finish[Y] && X !== plan.favoured) steer.guard[X] = Math.min(steer.guard[X], t > T ? 0.12 : 0.5);
  }
}

/* ---- the round, made a piece at a time */
function arrangement(seed, attempt, o) {
  o = o || {};
  const rng = dice(seed * 7919 + 13),
    // (o.grades: the two men's grades given, for measuring; o.neutral: nothing steered, full health, o.neutral seconds)
    men = menOf(rng).map((m, i) => (o.grades ? { grade: o.grades[i], skills: { all: o.grades[i] }, techniques: loadout({ all: o.grades[i] }) } : m)),
    /* (who is favoured: the better grade; the dice between two of the same. The round is steered toward him, and the health
       both start with is what he takes off the other man in the target time: a round steered toward the weaker man ended
       with him down early, or never) */
    even = rng() < 0.5 ? 0 : 1,
    favoured = rank(men[0].grade) === rank(men[1].grade) ? even : rank(men[0].grade) > rank(men[1].grade) ? 0 : 1,
    target = SPAR.target[0] + rng() * (SPAR.target[1] - SPAR.target[0]),
    // (how much of his health the favoured man is to lose: more the nearer their grades)
    loss = clamp(0.62 - 0.1 * (rank(men[favoured].grade) - rank(men[1 - favoured].grade)) + 0.2 * (rng() - 0.5), 0.25, 0.8),
    plan = { seed, arena: arenaOf(o.arena), attempt, men, hp: hpOf(men[favoured].grade, men[1 - favoured].grade, target), favoured, target: +target.toFixed(1), loss: +loss.toFixed(2), inputs: [], rails: null, feet: null, events: [], ko: null, done: false, steps: 0, time: 0, stats: null },
    bout = startOf(plan),
    minds = [0, 1].map(i => createMind(i, men[i], dice(seed * 104729 + 31 + i * 7919 + attempt * 15485863))),
    steer = { press: [1, 1], guard: [1, 1], finish: [false, false], liver: [false, false], late: false },
    w = watcher();
  plan.rails = w.rails;
  plan.feet = w.feet;
  if (o.neutral) (plan.hp = RULES.hp), bout.fighters.forEach(f => (f.hp = plan.hp));
  return { plan, bout, minds, steer, w, k: 0, tail: 0, failed: null, neutral: o.neutral || 0 };
}
const NONE = [{}, {}];
const OUTCOME = ['hit', 'block', 'graze', 'whiff', 'parry'];
// one step of it -> true once it is over (done, or to be arranged again: a.failed says why)
function advance(a) {
  const { plan, bout, minds, steer, w } = a;
  // (the finish's zone is read every step: no light punch is pressed at a man in it)
  for (const X of [0, 1]) if (bout.fighters[X].hp <= SPAR.zone) steer.finish[1 - X] = true;
  if (a.neutral) {
    // (measuring: nothing steered; over after so many seconds, the health each has lost kept)
    if (a.k >= a.neutral * 60 || bout.over !== null) return w.end(), (plan.lost = bout.fighters.map(f => (RULES.hp - f.hp) / (a.k / 60))), (plan.stats = Object.assign(measure(plan.rails, plan.feet, a.k), { gaps: gapsOf(w.gaps) })), (a.failed = null), true;
  } else if (a.k % 15 === 0) direct(steer, bout, a.k, plan);
  const inputs = plan.ko ? NONE : [think(minds[0], minds[1], bout, a.k, steer), think(minds[1], minds[0], bout, a.k, steer)];
  step(bout, inputs, DT);
  plan.inputs.push(inputs);
  w.see(bout, inputs);
  a.k++;
  // (what became of every punch, as the bout said it: the round's own record, which a playing of it is held to)
  for (const e of bout.events) if (OUTCOME.includes(e.type)) plan.events.push([a.k, e.type, e.who, e.name, e.J]);
  if (!plan.ko) {
    const e = bout.events.find(e => e.type === 'hit' && e.down);
    if (e) plan.ko = { step: a.k, t: +bout.t.toFixed(2), at: +(a.k / 60).toFixed(2), by: e.who, on: e.on, name: e.name, J: e.J, worth: +worthOf(e).toFixed(1), counter: !!e.counter, out: e.out || null, liver: !!e.liver, power: !(MOVES[e.name].kind === 'straight' && MOVES[e.name].hand === 'L'), trick: e.variant || null };
    else if (a.k > SPAR.most * 60) return (a.failed = 'no knockdown'), true;
    return false;
  }
  if (++a.tail < SPAR.tail * 60) return false;
  w.end();
  plan.steps = plan.ko.step;
  plan.time = plan.ko.at;
  plan.winner = plan.ko.by;
  plan.stats = Object.assign(measure(plan.rails, plan.feet, plan.ko.step), { stepped: a.k, gaps: gapsOf(w.gaps), runs: w.gaps });
  return true;
}

export function planner(seed, o) {
  let a = arrangement(seed, 0, o),
    done = false;
  const tried = [];
  return {
    get plan() {
      return a.plan;
    },
    get done() {
      return done;
    },
    run(ms) {
      const until = Date.now() + (ms ?? 1e9);
      while (!done) {
        if (advance(a)) {
          if (a.failed && a.plan.attempt + 1 < SPAR.tries) (tried.push(a.failed), (a = arrangement(seed, a.plan.attempt + 1, o)));
          else if (a.failed) throw new Error(`round #${seed}: ${a.failed}`);
          else a.plan.done = done = true;
        }
        if (Date.now() >= until) break;
      }
      return { done, steps: a.k };
    }
  };
}
export function planOf(seed, o) {
  const p = planner(seed, o);
  p.run();
  return p.plan;
}

/* The round played again from its controls, as the page plays it: -> { bout, events: [{ k, t, e }], rails } (each(bout, k)
   after each step). */
export function replayOf(plan, each) {
  const bout = startOf(plan),
    events = [],
    w = watcher();
  plan.inputs.forEach((inp, k) => {
    step(bout, inp, DT);
    w.see(bout, inp);
    for (const e of bout.events) events.push({ k: k + 1, t: bout.t, e });
    /* (a weave and a shoulder roll both say { type: 'roll' }: the shoulder roll is the one that leaves him in f.roll, the
       technique's: kept apart as { type: 'shoulderRoll' } for gradedOf) */
    bout.fighters.forEach((f, who) => f.roll && f.roll.t === 0 && f.roll.at === bout.t && events.push({ k: k + 1, t: bout.t, e: { type: 'shoulderRoll', who } }));
    if (each) each(bout, k);
  });
  w.end();
  return { bout, events, rails: w.rails, feet: w.feet };
}

/* What each man did that his grade or his loadout does not have (none, as it should be): a technique's own event (the shell,
   the shift, the wave, the shoulder roll, the down parry), a show-off's trick or taunt, a foul, a punch meant as a technique. */
export function gradedOf(plan, events) {
  const out = [],
    man = i => plan.men[i],
    carries = (i, id) => man(i).techniques.includes(id) && opens(man(i).skills, id),
    tricks = i => {
      const v = LEVEL[man(i).grade].vary;
      return new Set(v ? [...(v.jab || []), ...(v.power || [])].map(x => x[0]) : []);
    },
    own = { shell: 'shell', shift: 'shift', wave: 'wave', shoulderRoll: 'rollCounter' };
  for (const { e, t } of events) {
    if (own[e.type] && !carries(e.who, own[e.type])) out.push({ t, who: e.who, what: e.type });
    if (e.type === 'parry' && e.down && !carries(e.who, 'parryDown')) out.push({ t, who: e.who, what: 'parryDown' });
    if (e.type === 'taunt' && !LEVEL[man(e.who).grade].stance.show) out.push({ t, who: e.who, what: 'taunt ' + e.name });
    if ((e.type === 'paw' || e.type === 'collar') && !tricks(e.who).has(e.type === 'paw' ? e.name : 'collar')) out.push({ t, who: e.who, what: e.type });
    if (e.type === 'foul' && !LEVEL[man(e.who).grade].form.dirty) out.push({ t, who: e.who, what: 'foul ' + e.name });
    if (['hit', 'block', 'whiff', 'graze'].includes(e.type) && e.variant && !tricks(e.who).has(e.variant)) out.push({ t, who: e.who, what: e.variant });
    if (e.type === 'punch' && e.name === 'flicker' && !tricks(e.who).has('flicker')) out.push({ t, who: e.who, what: 'flicker' });
    if (e.type === 'punch' && e.name === 'crossOver' && !carries(e.who, 'crossCounter')) out.push({ t, who: e.who, what: 'crossCounter' });
    if (e.type === 'punch' && e.name === 'shiftHook' && !carries(e.who, 'shift')) out.push({ t, who: e.who, what: 'shiftHook' });
  }
  return out;
}
/* Does the round as played come out as the plan says? -> { rails: true if the four lanes read off the played bout are the
   plan's, block for block; events: true if what became of every punch is the plan's, event for event; downs; ko: true if the first knockdown is the plan's; graded: what a man did that he does not have } */
export function checkOf(plan, played) {
  played = played || replayOf(plan);
  const downs = played.events.filter(x => x.e.type === 'hit' && x.e.down),
    d = downs[0];
  return {
    rails: JSON.stringify(played.rails) === JSON.stringify(plan.rails) && JSON.stringify(played.feet) === JSON.stringify(plan.feet),
    events: JSON.stringify(played.events.filter(x => OUTCOME.includes(x.e.type)).map(x => [x.k, x.e.type, x.e.who, x.e.name, x.e.J])) === JSON.stringify(plan.events),
    downs: downs.length,
    ko: !!plan.ko && !!d && d.k === plan.ko.step && d.e.who === plan.ko.by && d.e.name === plan.ko.name && d.e.J === plan.ko.J,
    graded: gradedOf(plan, played.events)
  };
}
export { COMBOS, measure };
