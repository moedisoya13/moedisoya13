/* The sparring's library of exchanges, read from the catalogue's own scripts (src/audit.mjs SCRIPTS: every card the
   catalogue fights, which every new technique's cards join), and the runner that plays one of them between the two men of
   a round, wherever they stand. Nothing here draws, and nothing here changes the bout but through its controls.

   A card is a drill of two men: the boxer (role A, the card's fighters[0]) at his grade, and the other man (role B) who throws
   at him or stands in front of him. Each card becomes one exchange, read off its own fields:
     kind     'defence'  B throws (the card's `against`), A answers as the card does (an evasion, a guard, a parry, a counter,
                         a technique, or taking it)
              'punch'    A throws one punch (a rung of the skill ladder), B covers or takes it
              'combo'    A throws a combination (src/combos.mjs), B covers or takes it
              'trick'    a show-off's trick or a dirty fighter's foul, A's (only 4암 and 5암 have them: anim/show.mjs)
              'taunt'    a show-off's taunt
              'tech'     a technique of A's that is not an answer (the wave, the Tyson shift)
              'entry'    in or out with the guard let go of (the duck in, the pivot out, the circle out)
              'step'     footwork (the drills of src/footwork.mjs, walking round him, stepping in and out)
     grade    A's grade (the card's setup: fighters[0].skills.all); null for a card any grade fights (being hit)
     needs    the techniques the card gives A (its setup), which a man must carry to fight it
     gap      metres between them as it starts (the card's places)
   What is left out, and why: a card whose setup sets a man's health, his body's numbers or the referee's count (the
   knockdown drills, a hurt man's drills: the round's health is its own, set once at the start and shown), a card that aims a
   punch by hand each step (src/bodyshots.mjs shot: `keep` with a place on the trunk), a card that drives the stick itself
   (the pendulum), and a card kept again by grade under another id (the base footwork drills).
   The runner (runCard) plays a card in a frame of its own: the card's HOME and its other man's place carried onto where the
   two men stand, its line along the line between them. Its places, presses, guards and cues are the card's (footwork.mjs
   drive, as the catalogue plays it), the card's boxer being whichever man the round gives the part, and B's presses moved by
   so many frames (the rehearsal's search: plan.mjs). */
import { SCRIPTS } from '../audit.mjs';
import { drive, HOME, AWAY } from '../footwork.mjs';
import { LEVEL, LEVELS } from '../anim/skill.mjs';
import { MOVES } from '../anim/moves.mjs';
import { PUNCHES, BODY_PUNCHES, REAR, TRICKS, TECHNIQUES as FOULS, TAUNT_ROWS } from '../ladder.mjs';
import { COMBOS } from '../game/combos.data.mjs';

export const DT = 1 / 60;

/* ---- the names, the catalogue's own words */
const NAMED = Object.fromEntries([...PUNCHES, ...BODY_PUNCHES, ...REAR].map(p => [p.id, p.name]));
const KIND = { straight: '스트레이트', hook: '훅', upper: '어퍼컷' };
// a punch by its id (anim/moves.mjs), as the catalogue calls it: the ladder's rows, the show-off's flicker, or its kind
export const punchName = id =>
  NAMED[id] || (id === 'flicker' ? (TRICKS.find(t => t.id === 'flicker') || {}).name || '플리커' : id === 'shiftHook' ? '시프트 훅' : MOVES[id] && MOVES[id].kind ? (MOVES[id].kind === 'straight' && MOVES[id].hand === 'L' ? '잽' : KIND[MOVES[id].kind]) + (MOVES[id].zone ? ' (바디)' : '') : id);
export const SAID = { whiff: '빗나감', graze: '스침', block: '막음', parry: '패리', hit: '명중' }; // (src/catalog.mjs: SAID)
export const trickName = id => ((TRICKS.find(t => t.id === id) || FOULS.find(t => t.id === id) || TAUNT_ROWS.find(t => t.id === id) || {}).name || id);
// a card's name without its grade on the end ("다운패링 카운터 4명" -> "다운패링 카운터")
const bare = name => String(name || '').replace(/\s+(1|2|3|4명|4암|5명|5암)$/, '');

/* ---- reading a card's setup without touching any bout: what it gives each man (skills, techniques, and anything else it
   sets on them or on the bout). A setup that reads anything of a man it has not set itself throws here, and the card is left
   out: it changes the bout's own numbers (a body's power, say), which a round does not do. */
export function readSetup(card) {
  const sh = [{}, {}],
    top = {};
  if (!card.setup) return { A: sh[0], B: sh[1], top };
  const man = i => new Proxy({}, { get: (_, k) => sh[i][k], set: (_, k, v) => ((sh[i][k] = v), true) });
  const fake = new Proxy({ fighters: [man(0), man(1)] }, { get: (t, k) => (k === 'fighters' ? t.fighters : top[k]), set: (_, k, v) => ((top[k] = v), true) });
  try {
    card.setup(fake);
  } catch {
    return null;
  }
  return { A: sh[0], B: sh[1], top };
}

// when, in the card's own loop, anything of it is first done: its first press, the first moment of a guard it holds
function firstOf(card) {
  const times = [...(card.press || []), ...(card.against || [])].map(p => p[0]);
  for (const f of [card.cover, card.hisCover])
    if (f) for (let t = 0; t < card.loop; t += DT) if (f(t)) (times.push(t), (t = card.loop));
  return times.length ? Math.min(...times) : null;
}

/* What kind of exchange a card is, from its fields (the few names here are the catalogue's own fields). */
function kindOf(card, set) {
  if (card.taunt) return 'taunt';
  if (card.combo) return 'combo';
  if (card.trick || card.foul) return 'trick';
  if (typeof card.punch === 'string') return 'punch';
  if (card.against && card.against.length) return 'defence';
  if (card.move) return 'entry';
  if (set.A.techniques && set.A.techniques.length) return 'tech';
  return 'step';
}

/* The chain a press is meant to come out of (the second or third of the power chain: a hook, an uppercut), which a card's
   setup starts by hand (fighters[0].link): in a round he throws the punches before it, a third of a second apart, as the
   defence cards' other man does (src/defense.mjs THROW). */
const CHAIN = 0.32;

/* ---- the library: every card that can be one exchange of a round, read once */
let LIB = null;
const LEFT = []; // the cards left out, and why: [{ id, why }]
export const leftOut = () => (library(), LEFT);
export function library() {
  if (LIB) return LIB;
  const out = [],
    byItem = new Set(SCRIPTS.filter(c => c.level && c.item).map(c => c.item)),
    skip = (card, why) => LEFT.push({ id: card.id, why });
  for (const card of SCRIPTS) {
    if (!card.loop || card.stick) {
      skip(card, 'drives the stick itself');
      continue;
    }
    // (the base footwork drill, kept again by grade under its own id)
    if (!card.level && byItem.has(card.id)) {
      skip(card, 'kept again by grade');
      continue;
    }
    const set = readSetup(card);
    if (!set) {
      skip(card, "its setup changes a man's own numbers");
      continue;
    }
    // (health, the referee's count, or a man's body numbers set by hand: a knockdown drill, a hurt man's)
    if (set.top.knockdowns || 'hp' in set.A || 'hp' in set.B || 'k' in set.A || 'k' in set.B || card.fall || card.status) {
      skip(card, 'sets health or the count by hand');
      continue;
    }
    // (a punch aimed by hand at his trunk each step: src/bodyshots.mjs shot)
    if (card.keep && (card.zone || card.aim)) {
      skip(card, 'aims a punch by hand each step');
      continue;
    }
    const kind = kindOf(card, set),
      grade = (set.A.skills && set.A.skills.all) || card.level || null,
      // (a place the card gives, if it gives a real one: a card that reads where a man is from the bout its setup was given
      // reads nothing here)
      place = (f, t) => {
        const p = f ? f(t) : null;
        return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
      },
      t0 = firstOf(card),
      /* where in its loop its beat starts: a moment before the first thing it does; or at its start, for a card that puts him
         somewhere only at its start and lets him go from there (the wave, the shift, a combination) */
      lead = Math.max(0, (t0 ?? 0.35) - 0.35),
      from = card.me && place(card.me, 0) && !place(card.me, lead) ? 0 : lead,
      me = place(card.me, from) || HOME,
      him = card.him ? place(card.him, from) || AWAY : AWAY,
      chain = set.A.lastPower && (kind === 'trick') ? (set.A.link || 0) + 1 : 0;
    if (grade && !LEVEL[grade]) continue;
    out.push({
      id: card.id,
      card,
      kind,
      grade,
      needs: set.A.techniques ? [...set.A.techniques] : [],
      gap: Math.hypot(him[0] - me[0], him[1] - me[1]),
      me,
      him,
      first: t0,
      from,
      chain,
      item: card.item || card.id,
      group: card.group || '',
      name: bare(card.name),
      covered: !!card.hisCover,
      // (footwork that goes anywhere: standing on the spot is the rest between beats already)
      moves: kind !== 'step' || !!(card.press && card.press.length) || !!card.cue || [0.5, 1, 1.5, 2].some(t => {
        const p = card.me ? card.me(t) : HOME,
          q = card.him ? card.him(t) : AWAY;
        return !p || !q || Math.hypot(p[0] - me[0], p[1] - me[1]) > 0.05 || Math.hypot(q[0] - him[0], q[1] - him[1]) > 0.05;
      }),
      counter: /counter|roll|fire|parry/.test(card.kind || '') || !!card.way
    });
  }
  return (LIB = out);
}

/* ---- the frame a card is played in: the card's places carried onto the canvas. o: where the card's origin lies, and c, s the
   cosine and sine of the turn from the card's x axis to the canvas's. */
export function frameOf(o, angle) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    o, angle, c, s,
    toCard: (x, z) => [(x - o[0]) * c + (z - o[1]) * s, -(x - o[0]) * s + (z - o[1]) * c],
    toWorld: p => [o[0] + p[0] * c - p[1] * s, o[1] + p[0] * s + p[1] * c],
    turn: v => [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
  };
}

// the parts of a man a script keeps on him (its cues): kept apart from the man himself, the beat's own
const OWN = new Set(['cues', 'script', 'footWas']);
const swap = e => {
  const o = Object.assign({}, e);
  if ('who' in o) o.who = 1 - o.who;
  if ('on' in o) o.on = 1 - o.on;
  return o;
};

/* A card made ready to play: shifted in time (off: seconds, for the chain's punches before a trick), B's presses moved by
   `db` frames, B's guard as the variant wants it (cover: true up all through, false never, undefined the card's). */
function prepared(lib, o) {
  const card = lib.card,
    off = o.off ?? CHAIN * lib.chain,
    db = (o.db || 0) * DT,
    at = t => t - off,
    named = lib.kind === 'punch' ? v => (typeof v === 'string' ? [v, card.punch] : v) : v => v,
    prefix = [];
  for (let k = lib.chain; k >= 1 && lib.kind === 'trick'; k--) prefix.push([(lib.first ?? 0.5) - CHAIN * k + off, 'power']);
  const hisCover = o.cover === true ? () => true : o.cover === false ? undefined : card.hisCover && (t => card.hisCover(at(t)));
  return {
    loop: card.loop + off,
    me: card.me && ((t, f) => card.me(at(t), f)),
    him: card.him && (t => card.him(at(t))),
    press: [...prefix, ...(card.press || []).map(([t, b, v]) => [t + off, b, v])],
    against: (card.against || []).map(([t, b, v]) => [t + off + db, b, v]),
    cover: card.cover && (t => card.cover(at(t))),
    hisCover,
    cue: card.cue && ((bout, t) => named(card.cue(bout, at(t))))
  };
}

/* Play a card: -> { step(bout, k): the controls for both men for the k-th step of the card, from `from` (seconds of the
   card's own loop) on; place: where each man is to stand as it starts (the canvas) }. A: which man of the round is the card's
   boxer. frame: frameOf. o: as prepared, and from. */
export function runCard(lib, A, frame, o) {
  o = o || {};
  const entry = prepared(lib, o),
    shadows = [{}, {}],
    live = { bout: null, events: [] },
    // (the man of the round who plays each part, as a script sees him: his place in the card's frame, his cues its own)
    man = (r, full) =>
      new Proxy({}, {
        get(_, k) {
          const f = live.bout.fighters[r === 0 ? A : 1 - A];
          if (k === 'x' || k === 'z') return frame.toCard(f.x, f.z)[k === 'x' ? 0 : 1];
          if (OWN.has(k) || !full) return shadows[r][k];
          return f[k];
        },
        set: (_, k, v) => ((shadows[r][k] = v), true),
        has: (_, k) => k in shadows[r] || (full && k in live.bout.fighters[r === 0 ? A : 1 - A])
      }),
    view = { fighters: [man(0, true), man(1, true)], get events() { return live.events; }, get t() { return live.bout.t; }, get over() { return live.bout.over; } },
    // (a setup is run once more on a view of its own, for a card that keeps the bout it is given to read where a man is: the
    // wave's slick back; anything it sets on the men is the card's, not theirs)
    held = { fighters: [man(0, false), man(1, false)] },
    from = o.from ?? 0;
  if (lib.card.setup) lib.card.setup(held);
  const placeOf = (f, t) => (f ? f(t) : null);
  return {
    entry,
    from,
    place: [frame.toWorld(placeOf(entry.me, from) || HOME), frame.toWorld(placeOf(entry.him, from) || AWAY)],
    step(bout, k) {
      live.bout = bout;
      live.events = A === 0 ? bout.events.slice() : bout.events.map(swap);
      const [mine, his] = drive(entry, view, from + k * DT, DT),
        world = c => {
          if (c.move) c.move = frame.turn(c.move);
          if (Array.isArray(c.dash)) c.dash = frame.turn(c.dash);
          return c;
        };
      return A === 0 ? [world(mine), world(his)] : [world(his), world(mine)];
    }
  };
}

export const gradeLabel = lv => LEVEL[lv].label;
export { LEVELS, COMBOS };
