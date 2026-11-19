/* The skill ladder in the catalogue: every punch thrown at each of its seven grades (anim/skill.mjs), by a boxer at the
   range it is thrown from, at a man who stands there and takes it, and the footwork of each grade on its own. The scripts are
   in the footwork's form (footwork.mjs), so the page, the review sheet and the tests all fight the same bouts.

   The boxer on a rung is that grade at everything (`all`), so his feet are that grade's too, and he throws the way that
   grade throws (§2.1 of the plan): a beginner and an amateur whenever they are told to, and so does a dirty fighter, who
   keeps no beat; a pro on his own beat, a lead-hand punch as his lead foot comes down and a rear-hand one on the rear; a
   clean great one early enough that the punch lands on a foot coming down, and a clean legend so that it lands halfway
   between two. The scripts read his rhythm to do it (animator.rhythm), and how long the punch will take from how it is
   thrown (animator.arrival); his own feet do the rest (the animator times his beat to the punch). */
import { HOME } from './footwork.mjs';
import { LEVELS, LEVEL } from './anim/skill.mjs';
import { MOVES } from './anim/moves.mjs';
import { arrival } from './anim/animator.mjs';
import { createChain } from './phys/chain.mjs';
import { fatigue } from './game/profile.mjs';

/* Where the other man stands for each punch. His head is held a centimetre and a half further back in an amateur's upright
   stance than a pro's is on average, so he stands that much closer than the ranges the punches are written for (1.0 m for the
   straight punches, 0.92 for the hook, 0.85 for the uppercut): his head is where a pro's would be. (A hook from any closer
   meets the head early in its swing, before the body is behind it: see README, known limits.) */
const RANGE = { jab: 0.985, cross: 0.985, hook: 0.905, upper: 0.835 };
export const PUNCHES = [
  { id: 'jab', name: '잽', en: 'Jab' },
  { id: 'cross', name: '스트레이트', en: 'Cross' },
  { id: 'hook', name: '훅', en: 'Hook' },
  { id: 'upper', name: '어퍼컷', en: 'Uppercut' }
];
export const AT = 0.5; // when in the loop he is told to throw it (and, if he keeps a beat, starts waiting for his moment)

/* When to press, by how he keeps time. -> the button to press this step, or nothing. The moment it is pressed is kept on
   him (f.script.pressed), for the card. */
function cue(punch, level) {
  const move = MOVES[punch],
    button = punch === 'jab' ? 'jab' : 'power',
    foot = move.hand;
  return (bout, t) => {
    const f = bout.fighters[0],
      own = (f.script = f.script || {}),
      r = f.animator.rhythm;
    if (own.pressed !== undefined || t < AT - 1e-9) return null;
    const seen = own.seen;
    own.seen = r.halves;
    let go = false;
    if (level.form.beat) {
      // how long it will take, as he throws it now (his speed, how tired he is), against how long his feet will take
      const lead = arrival(createChain(move, f.k.rate * (0.75 + 0.25 * fatigue(f)), level), move),
        until = level.form.beat === 'on' ? (r.stepping === foot ? r.left : Infinity) : r.u < 0.5 ? (0.5 - r.u) * r.half : r.left + r.cycle / 4;
      go = until <= lead;
    } else if (level.grade === 3) go = seen !== undefined && r.halves !== seen && r.landed === foot;
    else go = true;
    if (go) own.pressed = t;
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
    me: () => HOME,
    him: () => [HOME[0] + RANGE[p.id], HOME[1]],
    // a hook and an uppercut are the second and third of the power chain: he is set up as if he had just thrown what comes
    // before (bout.mjs), so that the one punch is the whole of the card, and kept so until he throws it
    setup: b => {
      b.fighters[0].skills = { all: lv };
      // (the man in front of him keeps his head where it is, an amateur's stance, so that every grade hits the same target)
      b.fighters[1].skills = { stance: '2' };
      if (p.id === 'hook' || p.id === 'upper') Object.assign(b.fighters[0], { lastPower: true, sinceLast: 0, link: p.id === 'hook' ? 0 : 1 });
    },
    keep: b => {
      const f = b.fighters[0];
      if ((p.id === 'hook' || p.id === 'upper') && !(f.script && f.script.pressed !== undefined)) f.sinceLast = 0;
    },
    cue: cue(p.id, LEVEL[lv])
  }))
);

/* The dirty fighter's techniques (moves.mjs: foul), each at 4암 and 5암 side by side: thrown from where the foul can reach
   (a foot on his instep, a head into his, from closer than the punch alone is thrown from), at a man who stands in his own
   guard, a pro's. The card shows what the bout said of the foul. */
export const TECHNIQUES = [
  { id: 'stomp', punch: 'hook', range: 0.8, name: '발등 밟고 훅', en: 'Stomp and hook' },
  { id: 'butt', punch: 'cross', range: 0.85, name: '실수인 척 박치기', en: 'The accidental butt' },
  { id: 'thumb', punch: 'jab', range: 0.985, name: '눈 찌르는 잽', en: 'Thumbing jab' },
  { id: 'hold', punch: 'upper', range: 0.835, name: '잡고 올려치기', en: 'Hold and hit' }
];
export const DIRTY = TECHNIQUES.flatMap(tq =>
  ['4a', '5a'].map(lv => ({
    id: `${tq.id}@${lv}`,
    punch: tq.punch,
    level: lv,
    foul: tq.id,
    name: `${tq.name} ${LEVEL[lv].label}`,
    en: `${tq.en} · ${LEVEL[lv].name}`,
    group: '암의 기술',
    loop: 2.2,
    view: { yaw: 0.25, pitch: 0.25 },
    me: () => HOME,
    him: () => [HOME[0] + tq.range, HOME[1]],
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
