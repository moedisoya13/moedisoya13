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
import { WINDOWS } from './windows.data.mjs';
const slipAt = lv => (WINDOWS.slip && WINDOWS.slip[lv] && WINDOWS.slip[lv].at !== null ? WINDOWS.slip[lv].at : 3);

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
    // (the lead hand's straight punch is the jab button's, the body jab with it; the rest are the power button's)
    button = move.kind === 'straight' && move.hand === 'L' && !move.low ? 'jab' : 'power',
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

/* The punches to the body (moves.mjs, docs/moves-plan-5.md §3.3, §3.7), each at its seven grades, as the head punches are: from
   the range each is thrown from (the plan's), at the same man, his head kept still in an amateur's stance and his guard where
   a guard is. The press names the punch (game/bout.mjs: a press that names a punch is that punch), at the moment his grade
   presses at (cue). The rear hook (§3.8, §4A.7) is not in the power chain and has no row of its own in the catalogue; its
   rungs are here for the review sheets, the audit and the tests. */
export const BODY_RANGE = { jabBody: 1.0, crossBody: 0.98, hookBody: 0.74, upperBody: 0.64, hookR: 0.8 };
export const BODY_PUNCHES = [
  { id: 'jabBody', name: '바디 잽', en: 'Body jab' },
  { id: 'crossBody', name: '바디 스트레이트', en: 'Body cross' },
  { id: 'hookBody', name: '리버 훅', en: 'Liver hook' },
  { id: 'upperBody', name: '바디 어퍼', en: 'Body uppercut', inside: true }
];
export const REAR = [{ id: 'hookR', name: '뒷손 훅', en: 'Rear hook' }];
// (a cue that presses the punch by name: [button, its name])
const named = (punch, level) => {
  const c = cue(punch, level);
  return (bout, t) => {
    const b = c(bout, t);
    return b ? [b, punch] : null;
  };
};
const rungsOf = rows =>
  rows.flatMap(p =>
    LEVELS.map(lv => ({
      id: `${p.id}@${lv}`,
      punch: p.id,
      level: lv,
      name: `${p.name} ${LEVEL[lv].label}`,
      en: `${p.en} · ${LEVEL[lv].name}`,
      group: p.name,
      loop: 2,
      view: { yaw: 0.6, pitch: 0.2 },
      me: p.inside ? t => (t < AT + 0.7 ? HOME : [HOME[0] - 0.3, HOME[1]]) : () => HOME,
      him: () => [HOME[0] + BODY_RANGE[p.id], HOME[1]],
      // (and the man in front of him only takes it: a liver hook does not put him down here, game/bout.mjs f.stands)
      setup: b => {
        b.fighters[0].skills = { all: lv };
        b.fighters[1].skills = { stance: '2' };
        b.fighters[1].stands = true;
      },
      cue: named(p.id, LEVEL[lv])
    }))
  );
export const BODY_LADDER = rungsOf(BODY_PUNCHES);
export const REAR_LADDER = rungsOf(REAR);

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
    // (the trick named: a dirty grade throws it, the rest throw the punch: anim/show.mjs)
    press: [[AT, tq.punch === 'jab' ? 'jab' : 'power', tq.id]]
  }))
);

/* The show-off's tricks (anim/show.mjs, docs/moves-plan-4.md §5.3), at every grade side by side as the fouls are: the press
   names the trick, and only 4암 and 5암 have it; every other grade throws the punch pressed from the same spot. The man in
   front of him is a pro; for the tricks on a guard he holds his guard up all through (hisCover). `press`: the button, and
   `again`: more presses of it (the flicker's, each within a quarter of a second of the last arriving). */
export const TRICKS = [
  { id: 'flicker', punch: 'jab', button: 'jab', range: 0.985, name: '플리커', en: 'Flicker', again: [0.3, 0.6] },
  { id: 'pawDown', punch: 'cross', button: 'power', range: 0.985, name: '가드 내리고 치기', en: 'Paw down and cross', guarded: true },
  { id: 'pawUp', punch: 'upper', button: 'power', range: 0.835, name: '가드 올리고 치기', en: 'Lift the guard and uppercut', guarded: true, second: 1 },
  { id: 'collar', punch: 'upper', button: 'power', range: 0.74, name: '뒷목 잡고 어퍼', en: 'Collar and uppercut', second: 1 },
  { id: 'elbow', punch: 'cross', button: 'power', range: 0.8, name: '엘보 스트레이트', en: 'Elbow on the cross' }
];
export const SHOWOFF = TRICKS.flatMap(tq =>
  LEVELS.map(lv => ({
    id: `${tq.id}@${lv}`,
    punch: tq.punch,
    level: lv,
    trick: tq.id,
    name: `${tq.name} ${LEVEL[lv].label}`,
    en: `${tq.en} · ${LEVEL[lv].name}`,
    group: tq.name,
    item: tq.id,
    loop: tq.loop || 2.2,
    view: { yaw: 0.25, pitch: 0.25 },
    me: () => HOME,
    him: t => (t < AT + 0.25 ? [HOME[0] + tq.range, HOME[1]] : null),
    hisCover: tq.guarded ? t => t > 0.1 : undefined,
    setup: b => {
      b.fighters[0].skills = { all: lv };
      b.fighters[1].skills = { stance: '2' };
      if (tq.second !== undefined) Object.assign(b.fighters[0], { lastPower: true, sinceLast: 0, link: tq.second });
    },
    keep: b => {
      const f = b.fighters[0];
      if (tq.second !== undefined && !(f.cues && f.cues.pressed !== undefined)) f.sinceLast = 0;
    },
    press: [AT, ...(tq.again || []).map(dt => AT + dt)].map(t => [t, tq.button, tq.id])
  }))
);

/* The show-off's taunts (anim/show.mjs, docs/moves-plan-4.md §5.4), at every grade side by side: the script names the taunt
   (in a real bout his dice do), and only 4암 and 5암 have them; the rest stand there. Standing ones are named at a moment of
   the loop; the shrug once he has slipped the other man's jab and is out of it, and the tap of the chin once a jab from long
   range has landed and he has got over it. The beckon is done from 1.2 m (centre to centre), where there is room for the
   whole of its long arm at the height of his face (docs/moves-plan-6.md §3.4 N19): nearer, it reaches only as far as there
   is room (anim/show.mjs ROOM; from 1.0 m some 19 cm ahead of his guard instead of 29, from 0.9 m some 9). */
const quiet = id => (bout, t) => {
  const f = bout.fighters[0],
    own = (f.cues = f.cues || {});
  if (own.taunted) return null;
  const ready = id === 'shrug' ? f.lastEvade && f.lastEvade.endedAt !== null && !f.action : id === 'tapChin' ? f.sinceHit < 2 && f.stun <= 0 && !f.action : t >= AT;
  if (!ready) return null;
  own.taunted = t;
  return ['taunt', id];
};
export const TAUNT_ROWS = [
  { id: 'beckon', name: '손짓', en: 'Beckon', gap: 1.2 },
  { id: 'chinOut', name: '턱 내밀기', en: 'Chin out' },
  { id: 'wind', name: '풍차', en: 'Windmill' },
  { id: 'shrug', name: '어깨 으쓱', en: 'Shrug', punch: ['jab', 0.8], slip: true },
  { id: 'tapChin', name: '턱 두드리기', en: 'Tap the chin', punch: ['jab', 0.6], gap: 1.13 }
];
export const TAUNTING = TAUNT_ROWS.flatMap(tq =>
  LEVELS.map(lv => ({
    id: `${tq.id}@${lv}`,
    level: lv,
    taunt: tq.id,
    fresh: true,
    name: `${tq.name} ${LEVEL[lv].label}`,
    en: `${tq.en} · ${LEVEL[lv].name}`,
    group: tq.name,
    item: tq.id,
    loop: 2.2,
    hurt: !!tq.punch,
    view: { yaw: 0.6, pitch: 0.25 },
    // (hit, he is left where the jab puts him: walking back would put an end to the taunt)
    me: t => (tq.punch && t > tq.punch[1] ? null : HOME),
    him: () => [HOME[0] + (tq.gap || 1.0), HOME[1]],
    setup: b => {
      b.fighters[0].skills = { all: lv };
      b.fighters[1].skills = { stance: '2' };
    },
    keep: b => (b.fighters[0].hp = Math.max(b.fighters[0].hp, 60)),
    // (the shrug: the jab slipped, on the frame the slip card answers on, his grade's)
    press: tq.slip ? [[tq.punch[1] + slipAt(lv) / 60, 'slip', -1]] : [],
    against: tq.punch ? [[tq.punch[1], 'jab']] : [],
    cue: quiet(tq.id)
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
/* The wave (anim/clean.mjs, docs/moves-plan-5.md §4.1), a clean great one's own: 4명 and 5명 only, a card each. He starts at
   the far end of the other man's reach and is given the wave's value (`away: 'wave'`, round to his left) for WAVE_HOLD of the
   loop, and then not; the other man stands where he is in an amateur's stance (his head still) and turns to keep him in front
   of him. The slick back: the same, and the other man, a pro, steps in at him with a jab once he is going (straight at the man going round him for 0.3 s from
   the moment `jabAt` of the loop, the jab 0.2 s after he sets off: the step jab of tests/clean.test.mjs), and goes back to
   his spot. Each loop is a fresh bout. */
export const WAVE_HOLD = [0.3, 5.0];
const WAVE_FROM = 1.62;
export const WAVE_ROWS = [
  { id: 'wave', name: '파도', en: 'The wave', loop: 6 },
  { id: 'slick', name: '파도 · 슬릭백', en: 'The wave, slick back', loop: 3.2, jabAt: 2.0 }
];
// (a card of its own each time it is asked for: the slick back's step in reads the bout the card is fighting, kept with it)
export function waveCard(row, lv) {
  let bout = null;
  return {
    id: `${row.id}@${lv}`,
    level: lv,
    item: row.id,
    name: `${row.name} ${LEVEL[lv].label}`,
    en: `${row.en} · ${LEVEL[lv].name}`,
    group: '명의 기술',
    fresh: true,
    loop: row.loop,
    view: { yaw: 0.6, pitch: 0.7 },
    me: t => (t === 0 ? [-WAVE_FROM, 0] : null),
    // (a step jab: straight in at him for 0.3 s, the jab 0.2 s after he sets off, and back to his spot)
    him: t => (row.jabAt && bout && t >= row.jabAt && t < row.jabAt + 0.3 ? [bout.fighters[0].x, bout.fighters[0].z] : [0, 0]),
    setup: b => {
      bout = b;
      b.fighters[0].skills = { all: lv };
      // (he carries the wave: game/techniques.mjs; without it, asked for it, he would circle out)
      b.fighters[0].techniques = ['wave'];
      b.fighters[1].skills = row.jabAt ? { all: '3' } : { stance: '2' };
    },
    cue: (b, t) => (t >= WAVE_HOLD[0] && t < Math.min(WAVE_HOLD[1], row.loop - 0.9) ? ['away', 'wave'] : null),
    against: row.jabAt ? [[row.jabAt + 0.2, 'jab']] : []
  };
}
export const WAVING = WAVE_ROWS.flatMap(row => ['4m', '5m'].map(lv => waveCard(row, lv)));
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

/* The Tyson shift (anim/shift.mjs, docs/moves-plan-5.md §4.4), a clean great one's and a clean legend's own: 4명 and 5명, a card
   each, in two rows. He carries it and presses his power punch meant as it once, as his head does (in place of a combination
   started with a power punch), at `at` of the loop, from 1.0 m at an amateur who keeps his guard up and only takes it (no blow
   to his liver puts him down: f.stands). Out of the shell: the same (the other man with a pro's guard: `his`), crouched in his
   peek-a-boo shell (he carries it too) from `shell` of the loop until he presses it, as his head may pick it there
   (game/techniques.mjs shell). Each loop is a fresh bout (he ends somewhere else). The card's numbers: the three punches' impulses, how long from the first getting there to the body
   hook getting there (on the bout's clock), and where he ends: metres from the other man and degrees off the line the other
   man faced him on. */
export const SHIFT_FROM = 1.0;
export const SHIFT_ROWS = [
  { id: 'shift', name: '타이슨 시프트', en: 'The Tyson shift', at: 0.5, loop: 2.4, his: { all: '2' } },
  { id: 'shift-shell', name: '타이슨 시프트 · 셸에서', en: 'The Tyson shift, out of the shell', shell: 0.3, at: 0.62, loop: 2.5, his: { all: '2', cover: '3' } }
];
export const SHIFT_LEVELS = ['4m', '5m'];
export const shiftCue = row => (bout, t) => {
  const f = bout.fighters[0],
    own = (f.cues = f.cues || {});
  if (own.pressed) return null;
  if (t >= row.at - 1e-9) return (own.pressed = true), { power: true, tech: 'shift' };
  // (crouched in the shell until then)
  return row.shell !== undefined && t >= row.shell - 1e-9 ? { cover: true, tech: 'shell' } : null;
};
export const SHIFTING = SHIFT_ROWS.flatMap(row =>
  SHIFT_LEVELS.map(lv => ({
    id: `${row.id}@${lv}`,
    item: row.id,
    level: lv,
    name: `${row.name} ${LEVEL[lv].label}`,
    en: `${row.en} · ${LEVEL[lv].name}`,
    group: '명의 기술',
    fresh: true,
    loop: row.loop,
    view: { yaw: 0.9, pitch: 0.35 },
    me: t => (t === 0 ? HOME : null),
    him: t => (t === 0 ? [HOME[0] + SHIFT_FROM, HOME[1]] : null),
    hisCover: () => true,
    setup: b => {
      b.fighters[0].skills = { all: lv };
      b.fighters[0].techniques = row.shell !== undefined ? ['shift', 'shell'] : ['shift'];
      b.fighters[1].skills = row.his;
      b.fighters[1].stands = true;
    },
    cue: shiftCue(row)
  }))
);

/* Walking round him (docs/bearing-system-plan.md §2.1, §8.1), at every grade: no move of its own, only the stick pushed all
   the way, round the other man and no nearer or further from him, for WALK_HOLD of the loop, at walking speed (his sheet's,
   2.3 m/s at 50) or behind his guard (1.1 m/s). The other man, a pro, stands where he is and turns to keep him in front of
   him. How far round it takes him in a second, and how far round the other man lets him get, is the bearing's measure of
   what the feet alone do (tools/bearing.mjs --walk). Each loop is a fresh bout.
     walkRound(lv, { r, cover, way })   the script: r metres from him (1.0 by default, the jab's range), cover: the guard held
                                        up all the while, way: +1 round to the other man's lead hand (to his own right; the
                                        default), -1 the other way
     WALKING                            the catalogue's: every grade at 1.0 m, the guard down, round to the lead hand */
export const WALK_HOLD = [0.3, 2.3];
export function walkRound(lv, o = {}) {
  const r = o.r ?? 1.0,
    way = o.way ?? 1,
    centre = [HOME[0] + r, HOME[1]];
  return {
    id: `walk@${lv}` + (r !== 1.0 ? `-${r}` : '') + (o.cover ? '-cover' : '') + (way < 0 ? '-in' : ''),
    item: 'walk',
    level: lv,
    name: `걸어서 돌기 ${LEVEL[lv].label}`,
    en: `Walking round him · ${LEVEL[lv].name}`,
    group: '팔방',
    fresh: true,
    loop: 3,
    view: { yaw: Math.PI / 2, pitch: 1.1 },
    // (he stays wherever the walk takes him: the script does not walk him back)
    me: () => null,
    him: () => centre,
    cover: o.cover ? t => t >= WALK_HOLD[0] - 0.2 && t < WALK_HOLD[1] : undefined,
    setup: b => {
      b.fighters[0].skills = { all: lv };
    },
    // (the stick: along the circle round the other man, his own right being round to the other man's lead hand, and back onto it)
    cue: (b, t) => {
      if (t < WALK_HOLD[0] || t >= WALK_HOLD[1]) return null;
      const [f, him] = b.fighters,
        dx = f.x - him.x,
        dz = f.z - him.z,
        d = Math.hypot(dx, dz) || 1,
        out = [dx / d, dz / d],
        round = [out[1] * way, -out[0] * way],
        k = Math.max(-1, Math.min(1, (r - d) * 6)),
        v = [round[0] + out[0] * k, round[1] + out[1] * k],
        l = Math.hypot(v[0], v[1]);
      return { move: [v[0] / l, v[1] / l] };
    }
  };
}
export const WALKING = LEVELS.map(lv => walkRound(lv));
