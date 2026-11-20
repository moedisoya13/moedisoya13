/* The skill ladder in the catalogue: every punch thrown at each of its seven grades (anim/skill.mjs), by a boxer at the
   range it is thrown from, at a man who stands there and takes it, and the footwork of each grade on its own. The scripts are
   in the footwork's form (footwork.mjs), so the page, the review sheet and the tests all fight the same bouts.

   The boxer on a rung is that grade at everything (`all`), so his feet are that grade's too, and he throws the way that
   grade throws (§2.1 of the plan): a beginner and an amateur whenever they are told to, and so does a dirty fighter, who
   keeps no beat; a pro on his own beat, a lead-hand punch as his lead foot comes down and a rear-hand one on the rear; a
   clean great one early enough that the punch lands on a foot coming down, and a clean legend so that it lands halfway
   between two. The scripts read his rhythm to do it (animator.rhythm), and how long the punch will take from how it is
   thrown (animator.arrival); his own feet do the rest (the animator times his beat to the punch). */
import { HOME, ENTRIES } from './footwork.mjs';
import { LEVELS, LEVEL } from './anim/skill.mjs';
import { MOVES } from './anim/moves.mjs';
import { arrival } from './anim/animator.mjs';
import { createChain } from './phys/chain.mjs';
import { fatigue } from './game/profile.mjs';

/* Where the other man stands for each punch. His head is held a centimetre and a half further back in an amateur's upright
   stance than a pro's is on average, so he stands that much closer than the ranges the punches are written for (1.0 m for the
   straight punches, 0.92 for the hook, 0.85 for the uppercut): his head is where a pro's would be. (A hook from any closer
   meets the head early in its swing, before the body is behind it: see README, known limits.) */
/* (the inside hook and the inside uppercut are thrown from right up close, 0.64 m, where the power chain is those two: bout.mjs,
   RULES.inside) */
export const RANGE = { jab: 0.985, cross: 0.985, hook: 0.905, upper: 0.835, hookIn: 0.64, upperIn: 0.64 };
export const PUNCHES = [
  { id: 'jab', name: '잽', en: 'Jab' },
  { id: 'cross', name: '스트레이트', en: 'Cross' },
  { id: 'hook', name: '훅', en: 'Hook' },
  { id: 'upper', name: '어퍼컷', en: 'Uppercut' },
  { id: 'hookIn', name: '숏 훅', en: 'Inside hook', inside: true },
  { id: 'upperIn', name: '숏 어퍼', en: 'Inside uppercut', inside: true }
];
// (the second of a chain: what is pressed for it follows a power punch just thrown)
const SECOND = { hook: 0, upper: 1, upperIn: 0 };
export const AT = 0.5; // when in the loop he is told to throw it (and, if he keeps a beat, starts waiting for his moment)

/* When to press, by how he keeps time. -> the button to press this step, or nothing. The moment it is pressed is kept on
   him (f.cues.pressed, or under `key`), for the card. from: the moment of the loop he is told to throw it. */
export function cue(punch, level, from, key) {
  const move = MOVES[punch],
    button = punch === 'jab' ? 'jab' : 'power',
    foot = move.hand,
    at = from ?? AT,
    k = key || 'pressed';
  return (bout, t) => {
    const f = bout.fighters[0],
      own = (f.cues = f.cues || {}),
      r = f.animator.rhythm;
    const start = typeof at === 'function' ? at(own) : at;
    if (own[k] !== undefined || start === null || t < start - 1e-9) return null;
    const seen = own['seen' + k];
    own['seen' + k] = r.halves;
    let go = false;
    if (level.form.beat) {
      // how long it will take, as he throws it now (his speed, how tired he is), against how long his feet will take
      const lead = arrival(createChain(move, f.k.rate * (0.75 + 0.25 * fatigue(f)), level), move),
        until = level.form.beat === 'on' ? (r.stepping === foot ? r.left : Infinity) : r.u < 0.5 ? (0.5 - r.u) * r.half : r.left + r.cycle / 4;
      go = until <= lead;
    } else if (level.grade === 3) go = seen !== undefined && r.halves !== seen && r.landed === foot;
    else go = true;
    if (go) own[k] = t;
    return go ? button : null;
  };
}

export const LADDER = PUNCHES.flatMap(p =>
  LEVELS.map(lv => ({
    id: `${p.id}@${lv}`,
    punch: p.id,
    level: lv,
    name: `${p.name} ${LEVEL[lv].label}`,
    en: `${p.en} · ${LEVEL[lv].name}`,
    group: p.name,
    loop: 2,
    view: { yaw: 0.12, pitch: 0.2 },
    // (right up close, he steps back out once the punch is home: two men standing in their guards at 0.64 m have their arms
    // in each other's)
    me: p.inside ? t => (t < AT + 0.7 ? HOME : [HOME[0] - 0.3, HOME[1]]) : () => HOME,
    him: () => [HOME[0] + RANGE[p.id], HOME[1]],
    // a hook and an uppercut are the second and third of the power chain: he is set up as if he had just thrown what comes
    // before (bout.mjs), so that the one punch is the whole of the card, and kept so until he throws it
    setup: b => {
      b.fighters[0].skills = { all: lv };
      // (the man in front of him keeps his head where it is, an amateur's stance, so that every grade hits the same target)
      b.fighters[1].skills = { stance: '2' };
      if (p.id in SECOND) Object.assign(b.fighters[0], { lastPower: true, sinceLast: 0, link: SECOND[p.id] });
    },
    keep: b => {
      const f = b.fighters[0];
      if (p.id in SECOND && !(f.cues && f.cues.pressed !== undefined)) f.sinceLast = 0;
    },
    cue: cue(p.id, LEVEL[lv])
  }))
);

/* The dirty fighter's techniques (moves.mjs: foul), at every grade side by side: thrown from where the foul can reach (a foot
   on his instep, from closer than the punch alone is thrown from), at a man who stands in his own guard, a pro's. Only a
   dirty grade (4암, 5암) has the foul in it; every other grade throws the same punch from the same spot, clean, so that the
   foul is what the row compares. The card shows what the bout said of the foul. (Only these two are kept; the rest of the
   plan's dirty techniques were set aside, to be planned again.) */
export const TECHNIQUES = [
  { id: 'stomp', punch: 'hook', range: 0.8, name: '발등 밟고 훅', en: 'Stomp and hook' },
  { id: 'thumb', punch: 'jab', range: 0.985, name: '안면 잽', en: 'Face jab' }
];
export const DIRTY = TECHNIQUES.flatMap(tq =>
  LEVELS.map(lv => ({
    id: `${tq.id}@${lv}`,
    punch: tq.punch,
    level: lv,
    foul: tq.id,
    name: `${tq.name} ${LEVEL[lv].label}`,
    en: `${tq.en} · ${LEVEL[lv].name}`,
    group: tq.name,
    item: tq.id,
    loop: 2.2,
    view: { yaw: 0.25, pitch: 0.25 },
    me: () => HOME,
    // (once it is thrown he is left where it puts him: walking back in off a hard hook, the gait lifts a foot with his weight
    // still out past the other one)
    him: t => (t < AT + 0.25 ? [HOME[0] + tq.range, HOME[1]] : null),
    setup: b => {
      b.fighters[0].skills = { all: lv };
      if (tq.punch === 'hook' || tq.punch === 'upper') Object.assign(b.fighters[0], { lastPower: true, sinceLast: 0, link: tq.punch === 'hook' ? 0 : 1 });
    },
    press: [[AT, tq.punch === 'jab' ? 'jab' : 'power']]
  }))
);

/* The footwork of each grade on its own: standing in front of him, and stepping in and out. */
export const STANCES = LEVELS.flatMap(lv => [
  {
    id: `stance@${lv}`,
    level: lv,
    kind: 'stance',
    name: `기본 풋워크 ${LEVEL[lv].label}`,
    en: `Stance · ${LEVEL[lv].name}`,
    group: '기본 풋워크',
    loop: 6,
    view: { yaw: 0.35, pitch: 0.3 },
    me: () => HOME,
    setup: b => (b.fighters[0].skills = { all: lv })
  },
  {
    id: `inout@${lv}`,
    level: lv,
    kind: 'inout',
    name: `스텝 인 · 아웃 ${LEVEL[lv].label}`,
    en: `Step in and out · ${LEVEL[lv].name}`,
    group: '스텝 인 · 아웃',
    loop: 2.6,
    view: { yaw: 0, pitch: 0.4 },
    me: t => [t >= 0.3 && t < 1.5 ? 0.3 : 0, 0],
    setup: b => (b.fighters[0].skills = { all: lv })
  }
]);

/* The footwork drills (footwork.mjs), each at every grade: the same script and the same places to be, and the body that gets
   him there is his grade's (anim/skill.mjs: stance, its travel; dash). A step jab and a step one-two are pressed the way the
   grade throws (as the ladder's cue does): a beginner stops and then punches, late; an amateur on the lead foot coming down
   (foot, then fist); a pro, and a dirty man who keeps no beat, when the script says; a clean great one so that it lands on a
   foot coming down, a clean legend between two. */
const STEP = { stepjab: [['jab', 0.55]], onetwo: [['jab', 0.55], ['cross', 0.78]] };
/* He stays in until his punches are done. The script's own moment to step out is the pro's; a man who throws later than
   that (a beginner who stops first, an amateur or a great one waiting for a foot to come down, which in a loop that is no
   whole number of beats falls at a different moment each time round) would otherwise be walking out as his punch arrives,
   and it would land as a touch, or not at all. So he holds the place he stepped in to while a punch of the drill is still
   owed (a cue that has not pressed it yet, or a press still to come) or still on its way. */
function stayIn(e, id, step) {
  const pressAt = step && step.press ? Math.max(...step.press.map(p => p[0])) : -1,
    owed = STEP[id].map((_, i) => (i === 0 ? 'first' : 'second')),
    inside = e.me(STEP[id][0][1]);
  return (t, f) => {
    const out = e.me(t);
    if (!f || out[0] === inside[0] || t < STEP[id][0][1]) return out;
    const busy = f.action && MOVES[f.action.name].punch,
      waiting = step && step.cue ? owed.some(k => !f.cues || f.cues[k] === undefined) : t < pressAt + 1e-9;
    return busy || waiting ? inside : out;
  };
}
function stepCue(id, lv) {
  const level = LEVEL[lv],
    [first, second] = STEP[id];
  if (lv === '3' || level.side === 'a') return null; // (the script's own presses)
  // a beginner: stood still a moment first; the second a long while after the first
  if (level.grade === 1) return { press: [[first[1] + 0.3, first[0] === 'jab' ? 'jab' : 'power'], ...(second ? [[first[1] + 0.75, 'power']] : [])] };
  const a = cue(first[0], level.grade === 2 ? { grade: 3, form: {} } : level, first[1], 'first'),
    b = second ? cue(second[0], level.grade === 2 ? { grade: 3, form: {} } : level, own => (own.first === undefined ? null : own.first + 0.2), 'second') : null;
  return { cue: (bout, t) => a(bout, t) || (b && b(bout, t)) };
}
/* A clean legend dashes on his beat (anim/legend.mjs): the dash a drill presses at a moment of its loop he presses as the
   next foot comes down after it, and he stays where he is until he has (a dash out of the top of his bounce, his body still
   on its way up, could not go under anything: only gravity takes him down), and the rest of the drill goes on from then. */
function dashOnBeat(e) {
  const [when, button, value] = e.press[0];
  return {
    press: [],
    cue: (bout, t) => {
      const f = bout.fighters[0],
        own = (f.cues = f.cues || {}),
        r = f.animator.rhythm,
        seen = own.seenDash;
      own.seenDash = r.halves;
      if (own.dash !== undefined || t < when - 1e-9 || seen === undefined || seen === r.halves) return null;
      own.dash = t;
      return [button, value === undefined ? true : value];
    },
    me: (t, f) => {
      const at = f && f.cues ? f.cues.dash : undefined;
      return t < when ? e.me(t) : at === undefined ? e.me(0) : e.me(Math.min(e.loop - 1e-6, when + t - at));
    }
  };
}
export const FOOTWORK = ENTRIES.filter(e => e.id !== 'bounce').flatMap(e =>
  LEVELS.map(lv => {
    const g = Object.assign({}, e, {
      id: `${e.id}@${lv}`,
      item: e.id,
      level: lv,
      setup: b => {
        b.fighters[0].skills = { all: lv };
        if (e.setup) e.setup(b);
      }
    });
    const step = STEP[e.id] ? stepCue(e.id, lv) : null;
    if (step && step.press) g.press = step.press;
    if (step && step.cue) (g.press = []), (g.cue = step.cue);
    if (STEP[e.id]) g.me = stayIn(e, e.id, step);
    if (lv === '5m' && /^dash/.test(e.id)) Object.assign(g, dashOnBeat(e));
    return g;
  })
);

/* In and out (docs/moves-plan-4.md §3, §4), each at every grade: the duck in from 1.0 m to right up close, under a jab the
   other man throws as he goes, and the two ways away with the guard let go of, from right up close out of range. Each loop
   is a fresh bout (fresh), so the place he gets to is the card's number: how far apart they end, and the head's lowest
   height on the way in, or the angle he ends at off the other man's line. */
export const MOVING = [
  { id: 'duckIn', name: '더킹 대시', en: 'Duck in', from: 1.0, press: t => [[t, 'duck', true], [t, 'dash', [1, 0]]], against: [] },
  { id: 'hopPivot', name: '피봇 아웃', en: 'Pivot out', from: 1.0, press: t => [[t, 'away', 'pivot'], [t, 'side', 1]] },
  { id: 'hopCircle', name: '서클 아웃', en: 'Circle out', from: 1.0, press: t => [[t, 'away', 'circle'], [t, 'side', 1]] }
];
export const ENTRY = MOVING.flatMap(m =>
  LEVELS.map(lv => ({
    id: `${m.id}@${lv}`,
    move: m.id,
    level: lv,
    item: m.id,
    name: `${m.name} ${LEVEL[lv].label}`,
    en: `${m.en} · ${LEVEL[lv].name}`,
    group: '진입 · 이탈',
    fresh: true,
    loop: 2,
    view: { yaw: 0.9, pitch: 0.35 },
    // (he stays wherever the move takes him: the script does not walk him back)
    me: () => null,
    him: () => [HOME[0] + m.from, HOME[1]],
    setup: b => {
      b.fighters[0].skills = { all: lv };
      // (the man in front of him is a pro, his feet kept still where he stands)
      b.fighters[1].skills = { stance: '2' };
    },
    press: m.press(AT),
    against: m.against
  }))
);
