/* The showy dirty fighter (docs/moves-plan-4.md §5): at 4암 and 5암 the dirty grades are a show-off's. His stance, his guard,
   his parry, the tricks a press may turn into, and his taunts are here, as layers of numbers on the animator's channels and
   as rules the bout reads; where a thing lands (a glove on a glove, a hand behind a neck, an elbow on a chin) is the bout's to
   judge, by real contact, as a punch's is (game/bout.mjs). Grades below 4 and the clean grades have none of the show-off's
   own (skill.mjs: stance.show, vary are theirs alone), and none of that runs for them. The cross-arm guard and the shoulder
   roll are techniques a man carries (game/techniques.mjs: crossArm from 3 up, rollCounter from 4 up; docs/moves-plan-5.md
   §4A), here because the dirty great ones carry the guard by default and the hammer is theirs alone.
     stance(c, show, s)        the stance (§5.1): the lead hand let down to the waist, swinging like a pendulum, the lead
                               shoulder up, leant back, the chin out
     crossGuard(c, cross, k, up, down)   the cross-arm guard, the classic one (docs/moves-plan-5.md §4A.2), k of the way
                               up (up, down, 0..1: how much it is on its way up or down, WAY); -> metres
                               the lead shoulder is shrugged up. A technique (game/techniques.mjs: crossArm): whoever carries
                               it from 3 up holds his grade's (skill.mjs: CROSS), and by default the dirty great ones do
     ear(c, cross, k)          its rear glove taken back to the ear as a lead hook comes (§4A.3)
     shoulderRoll(c, roll, t)  the shoulder roll (§4A.4) t seconds after it started; -> { shrug, w, done }
     hammer(c, h, t)           the hammering parry (§5.5): the rear fist's stroke t seconds after the guard went up; -> whether
                               it is coming down now (what the bout judges a parry by)
     choose(table, when, forced, u)   which trick a press turns into (§5.2), or null: the plain punch
     THROWS                    the punch each trick throws in place of the one pressed (where it changes it)
     PAW, paw(trick, t, glove, tier)   the guard pushed down or up (§5.3): where the lead hand goes for his glove, and how
                               much of the way
     COLLAR, collar(t, foe)    the collar and uppercut (§5.3): the lead hand round his head to the back of his neck
     windmill(c, circles, t, size)   the windmill taunt's hands, swung round circles in front of him (§5.4)
     ROOM, spare(g, solid, clear, ahead, wary), room(left, from), least(left)   how far out a taunting hand may go before
                               the other man is in its way (§5.4)
     ELBOW                     the elbow on the angled cross (§5.3) */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = x => ((x = clamp(x, 0, 1)), x * x * (3 - 2 * x));
const bump = x => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

/* The stance. show (skill.mjs: stance.show): { drop: [x, y, z] metres the lead hand is let down from its guard (to the waist,
   a little out and in front of the hip), swing: [metres, a second, every: seconds between big ones (a legend's: hardly moving
   between them), big: times], lean: degrees the trunk lies back, chin: degrees the chin is pushed up and out, shoulder:
   degrees the lead shoulder is hunched up over the chin, roll: degrees it is turned in }. s: { clock, down (0..1: how far
   down the lead hand is let, followed by the animator: it comes up as a punch comes, as he covers up or gets out of the way,
   and as he throws anything with it but the flicker), unwind (0..1: how much of a lean is kept as a punch goes:
   animator.mjs), cover (0..1: how far up his guard is), seed }. The swing is a pendulum hung from the shoulder: forward and back, and up a touch at either end.
   (The rear hand is where a guard's is: beside the chin already.) -> [x, y, z]: what the lead hand is let down by now for each
   unit of `down` (so that what a taunt takes it up out of can be given room: ROOM). */
export function stance(c, show, s) {
  const [dx, dy, dz] = show.drop,
    d = s.down,
    [A, hz, every, big] = show.swing,
    // (a legend's hardly moves, and then once in a while swings it, one big swing)
    burst = every ? bump(((s.clock + (s.seed || 0) * 1.7) % every) / (1 / hz)) : 0,
    amp = A * (1 + (big - 1) * burst),
    ph = Math.sin(TAU * hz * s.clock + (s.seed || 0));
  const per = [dx, dy + Math.abs(amp * ph) * 0.35, dz + amp * ph];
  c.lx += per[0] * d;
  c.ly += per[1] * d;
  c.lz += per[2] * d;
  c.le -= 0.25 * d;
  // (and the lean, the chin and the shoulder: given up into a punch as it goes, and when he covers up)
  const k = s.unwind * (1 - (s.cover || 0));
  c.lean -= show.lean * k;
  c.hp -= show.chin * k;
  c.side -= show.shoulder * k;
  c.hr += show.shoulder * 0.4 * k;
  c.twist -= show.roll * k;
  return per;
}

/* The way into and out of the cross-arm guard (not its shape, which is CROSS's): the lead hand goes between the guard at his
   face and his belly round the rear forearm standing up in front of his chest, not through it. On the way down into it, under
   the rear elbow: dipped `dip` metres half way (as far as the guard is on its way up: up, from the animator, which leaves
   out a dirty great one's hammer put up fresh, hammer below, whose stroke is the rear fist's and timed to the frame); on the
   way back up out of it, in front of it: `ahead` metres half way, ahead of his chest as it stands in the guard (down) */
const WAY = { dip: 0.08, ahead: 0.08 };
/* The cross-arm guard, the classic one, as the guard is up (k: 0..1; up, down: how much it is on its way). cross (skill.mjs:
   CROSS[grade]): the rear glove up at the chin, held to the face as a guard's is, its forearm stood up under it and the
   elbow down in front of the ribs; the lead forearm laid across the belly, locked to the chest (it goes where the trunk
   goes, not where the head goes), the elbow at the lead side; side on, the chest closed, bent forward on bent knees, the
   chin down and turned behind the lead shoulder, which is shrugged up (the animator's to do: not a channel; -> how far). The
   head is the rear glove's and the shoulder's to keep, the body the forearm's (game/bout.mjs: the forearms and the lead
   shoulder are in the way of a punch). */
export function crossGuard(c, cross, k, up, down) {
  for (const [side, [x, y, z, e]] of [['l', cross.L], ['r', cross.R]]) {
    c[side + 'x'] += x * k;
    c[side + 'y'] += y * k;
    c[side + 'z'] += z * k;
    c[side + 'e'] += e * k;
  }
  const half = Math.sin(Math.PI * Math.min(1, k)) ** 2;
  if (up) c.ly -= WAY.dip * up * half;
  if (down) (c.lx -= 0.6 * WAY.ahead * down * half), (c.lz += 0.8 * WAY.ahead * down * half);
  c.lc += cross.lock * k;
  c.lean += cross.lean * k;
  c.hp += cross.chin * k;
  c.hw += cross.turn * k;
  c.yaw += cross.close[0] * k;
  c.twist += cross.close[1] * k;
  c.lkf += cross.knee * k;
  c.rkf += cross.knee * k;
  return cross.shoulder * k;
}
/* Its rear glove at the chin goes up and back to the ear as a lead hook comes (k: 0..1 of the way: the animator times it from
   the hook's start, cross.ear seconds after it); back, up and out to his right by cross.to. */
export function ear(c, cross, k) {
  c.rz += cross.to[0] * k;
  c.ry += cross.to[1] * k;
  c.rx += cross.to[2] * k;
}

/* The shoulder roll, t seconds after it started. roll (skill.mjs: ROLL[grade]): in its first `set` seconds he is laid back
   `lean` degrees and bent away to his right `side` (the lead shoulder up, the head away from the punch), sat on the rear leg
   (`knee`: [lead, rear] degrees, the lead knee straightened and the rear one bent, the weight going back over the rear foot;
   the hips `back` metres back), the chin `chin` degrees down behind the lead shoulder as it is shrugged `shoulder` metres more
   into the punch's way, the rear glove tucked in under the chin behind it (`tuck`: [x, z] metres), and a great one's lead
   forearm lifted `lift` off his belly; and from `lag` seconds in, over `go`, the chest is turned further away from him, to his
   right (the hips `turn[0]` degrees and the chest `turn[1]` more), turning hardest as the punch gets there. Held `hold`, and
   unwound over `home`. -> { shrug: metres more the lead shoulder is up, w: how much of the roll there is (0..1), done }. The
   bout judges it: a punch that meets the lead shoulder while the chest is turning away is rolled off it (game/bout.mjs).
   out: seconds since the roll & counter went out of it (§4A.7; the roll held where it was, t): the roll let go of over
   roll.counter.unwind as the rear hand's wind-up (the punch's own, loaded: moves.mjs hookR) takes over from it, the weight
   coming forward off the rear leg, and a dirty one going in after it (roll.counter.in, metres, kept while he throws it). */
export function shoulderRoll(c, roll, t, out) {
  const going = out === undefined || out === null ? 1 : 1 - smooth(out / roll.counter.unwind),
    home = smooth((t - roll.lag - roll.go - roll.hold) / roll.home),
    turn = smooth((t - roll.lag) / roll.go) * (1 - home) * going,
    w = smooth(t / roll.set) * (1 - home) * going;
  if (going < 1 && roll.counter.in) c.hz += roll.counter.in * smooth(out / (roll.counter.wait + 0.1));
  c.yaw += roll.turn[0] * turn;
  c.twist += roll.turn[1] * turn;
  c.lean -= roll.lean * w;
  c.side += roll.side * w;
  c.lkf += roll.knee[0] * w;
  c.rkf += roll.knee[1] * w;
  c.hz -= roll.back * w;
  c.hp += roll.chin * w;
  c.ly += roll.lift * w;
  c.rx += roll.tuck[0] * w;
  c.rz += roll.tuck[1] * w;
  return { shrug: roll.shoulder * w, w, done: t >= roll.lag + roll.go + roll.hold + roll.home };
}

/* The hammering parry: the guard put up fresh is a stroke of the rear fist, its underside brought down on the glove coming in.
   h (skill.mjs: cover.hammer): { up: metres it goes up first, to the ear, over `rise` seconds; down: metres it comes down
   after, over `fall`, and out in front of the face by `out` metres and `across` to his left as it does, onto the line a
   punch comes in on (the elbow the pivot, the wrist set); back:
   seconds it takes to go on into the guard }. t: seconds since the guard went up. -> true while it is coming down. */
export function hammer(c, h, t) {
  if (t < 0 || t > h.rise + h.fall + h.back) return false;
  const up = smooth(t / h.rise),
    down = smooth((t - h.rise) / h.fall),
    home = smooth((t - h.rise - h.fall) / h.back),
    w = 1 - home;
  c.ry += (h.up * up - (h.up + h.down) * down) * w;
  c.rz += (h.out * down - 0.03 * up * (1 - down)) * w;
  c.rx += (h.across * down + 0.03 * up * (1 - down)) * w;
  c.re += (0.35 * up - 0.2 * down) * w;
  return t >= h.rise - 1 / 120 && t <= h.rise + h.fall + 1 / 60;
}

/* The tricks a press may turn into (§5.2). table (skill.mjs: vary[button]): [[trick, chance], ...], the table's bottom row
   first (the one that fits the moment better comes first). when(trick): whether it can be done now (the bout's: how far
   apart they are, whether his guard has been up a while, whether a foot will reach). forced: a trick a script names (the
   catalogue and the tests name it; it is done if the grade has it and it can be done now), or 'plain'; otherwise one throw u
   of his dice (0..1) decides it, each trick that can be done now taking its chance's share of the throw in turn, so that each
   comes up as often as its chance says (the rest of the throw is the plain punch's). The tricks a power press can be are
   never all possible at once (the elbow is a cross's, the collar an uppercut's, the stomp a hook's), and those that can
   be add up to less than the whole throw. */
export const THROWS = { flicker: 'flicker', pawDown: 'cross', pawUp: 'upper' };
export function choose(table, when, forced, u) {
  if (!table || forced === 'plain') return null;
  if (typeof forced === 'string') return table.some(([n]) => n === forced) && when(forced) ? forced : null;
  if (u === null || u === undefined) return null;
  let at = 0;
  for (const [name, p] of table) {
    if (!when(name)) continue;
    if (u >= at && u < at + p) return name;
    at += p;
  }
  return null;
}

/* Pushing his guard down (pawDown) or up (pawUp) and hitting with the other hand. The lead hand goes for the other man's lead
   glove (`reach` seconds), onto the top of it to push it down or under it to lift it (`over`: metres from the middle of his
   glove to the middle of mine, a little less than the two gloves are thick, so that it meets it), stays on it `hold` and lets
   go over `back`; the rear hand's punch waits `wait` seconds before it starts (a straight over it, an uppercut under it), so
   that it lands as the glove is out of the way. How far his glove is pushed is the bout's to do when the hands meet (game/
   bout.mjs: pawed): `press` metres, [4암, 5암] (a great dirty fighter hauls it down, a legend taps it), and `aside` times
   that out to the side it is on, for `hold` seconds, and back over `free`. Which glove: the one in the way of the punch that
   follows (`glove`): his lead glove for the straight over it, his rear glove for the uppercut under it. */
export const PAW = { reach: 0.12, hold: 0.25, back: 0.15, over: 0.17, press: [0.26, 0.22], aside: 0.6, free: 0.3, glove: { pawDown: 'L', pawUp: 'R' }, elbow: { pawDown: 0.8, pawUp: 0 }, wait: { cross: 0.15, upper: 0.1, upperIn: 0.1 } };
// -> { to: where the lead glove is to be (his own space), w: how much of the way it is sent there }
export function paw(trick, t, glove) {
  const w = t < PAW.reach ? smooth(t / PAW.reach) : t < PAW.reach + PAW.hold ? 1 : 1 - smooth((t - PAW.reach - PAW.hold) / PAW.back),
    up = trick === 'pawDown' ? 1 : -1;
  return { to: [glove[0], glove[1] + up * PAW.over, glove[2] - 0.02], w };
}

/* The collar and uppercut: the lead hand goes round the outside of his head (by `side` metres out from it, his right, the
   side it is on) and onto the back of his neck (`nape`: the point the bout judges it by, behind and under the middle of his
   head), getting there in `reach` seconds; it pulls his head forward and down (game/bout.mjs: collared; his body's,
   animator.pulled: `pull`, [4암, 5암], over `time`: the amount the animator's pull is written for is 0.1) while the uppercut
   waits `wait` seconds before it starts, so that the neck is held and hauled on for a good while before the uppercut gets
   there (docs/moves-plan-6.md §3.4 N18: seen to be pulled, not just touched; hauled on any longer, the head is so far in by
   then that the uppercut meets it short of its speed and lands softer than the plain one). Hauling, not reaching: the arm
   is kept bent, the wrist no further than `hold` metres from the shoulder, its elbow raised `elbow[0]` (the animator's
   flare) as it goes round his head and let down to `elbow[1]` as the uppercut's legs drive; the man pulling sits back
   `brace` degrees against it, and does not go in after him once it lands (game/bout.mjs: he has him by the neck). The man
   hauled in draws his lead glove in across the front of his chin as his head comes down, `tuck` metres [x, y, z] for each
   0.1 of the pull (left where his guard holds it with his head hauled in, it is where the uppercutting shoulder comes up,
   and as the blow knocks his guard open it went 8 to 15 cm into that shoulder off the card's spot; drawn back toward his
   face instead, his folded arm flipped over as the guard dropped). Once the uppercut gets there the pull is let up over
   `free` seconds (the blow has his head), and the hand stays where it had him and lets go `let` seconds after, [4암, 5암].
   A hand that does not get there is an uppercut and nothing else. */
export const COLLAR = { reach: 0.1, side: 0.2, nape: [0.1, 0.06], pull: [0.25, 0.19], time: 0.2, free: 0.1, wait: 0.03, brace: 8, hold: 0.48, elbow: [0.9, 0.3], tuck: [-0.03, 0.01, 0], let: [0.14, 0.08] };
// -> { to: where the lead glove is to be (his own space), w } (foe: { head, right, back }: his head, and his right and back, unit)
export function collar(t, foe) {
  const w = smooth(t / COLLAR.reach),
    nape = foe.nape,
    beside = [foe.head[0] + foe.right[0] * COLLAR.side, foe.head[1] - 0.04, foe.head[2] + foe.right[2] * COLLAR.side],
    // (round the outside: to beside his head first, and then in behind it)
    k = smooth((t / COLLAR.reach - 0.45) / 0.55),
    to = [beside[0] + (nape[0] - beside[0]) * k, beside[1] + (nape[1] - beside[1]) * k, beside[2] + (nape[2] - beside[2]) * k];
  return { to, w };
}

/* The windmill (moves.mjs: wind): each hand swung round a circle in front of him, t seconds in (as written, before his
   grade stretches it), everything times his grade's size. circles: { R, L: { at: [x, y, z] the circle's middle off where
   his guard holds that hand, r: metres, from, to: the seconds it goes round between, turns: how many times, out: seconds it
   takes to get out onto the circle, and to come off it as it gets back round to where it started; home: seconds it takes
   instead, after `to`, to come back to the guard from wherever round the circle it got to } }. The circle stands up square
   to him, facing the other man (a hand going round it stays about as far from its shoulder all the way round: a circle
   edge on to him, through the shoulder, would have the arm folded up at one side of it and out of reach at the other), and
   it goes round the way that takes the top of it to his left; from where the guard is on it, getting up to speed over the
   first ACCEL of the way and slowing over the last: it is never at full speed from a standstill in a frame. */
const ACCEL = 0.18;
const cruise = u => (u <= 0 ? 0 : u >= 1 ? 1 : u < ACCEL ? (u * u) / (2 * ACCEL * (1 - ACCEL)) : u > 1 - ACCEL ? 1 - (1 - u) ** 2 / (2 * ACCEL * (1 - ACCEL)) : (u - ACCEL / 2) / (1 - ACCEL));
export function windmill(c, circles, t, size = 1) {
  for (const side of Object.keys(circles)) {
    const w = circles[side],
      k = side === 'L' ? 'l' : 'r',
      a = Math.atan2(-w.at[0], -w.at[1]) + TAU * w.turns * cruise((t - w.from) / (w.to - w.from)),
      on = smooth((t - w.from) / w.out) * (w.home ? 1 - smooth((t - w.to) / w.home) : 1 - smooth((t - w.to + w.out) / w.out)),
      s = size * on;
    c[k + 'x'] += (w.at[0] + w.r * Math.sin(a)) * s;
    c[k + 'y'] += (w.at[1] + w.r * Math.cos(a)) * s;
    c[k + 'z'] += w.at[2] * s;
  }
}

/* Room for a taunt (docs/moves-plan-6.md §3.4, N19): a taunting hand reaches only as far as there is room. A taunt is done
   at whatever distance the two of them stand, and the other man may step or punch in during it. What a taunt sends a hand
   out by, from where his guard would hold it (the beckon's long arm above all), is shrunk toward the guard by the one
   share that keeps its glove's surface `want` metres off the other man's head and trunk (game/bout.mjs: solidOf) wherever
   the taunt will take it: as far out as there is room from where it is, and back in where there is not; a moment of the
   taunt that has it no nearer him than not sent out at all takes no room from it (a shrug's hands, out to his sides, stay
   out while his guard is where the other man's head is coming). And where a guard would hold a show-off's lead hand is itself too near him (right
   up close, 0.75 m and nearer, it is at his face; or his head is coming there behind a punch), what the taunt takes that
   hand up by, out of where it hung as the taunt began, is shrunk too, by a share of its own: it comes up only as far as
   there is room, the more of that the further in the hand is coming, and only if down is the way off him (over a head
   coming in low behind a straight punch or a hook it stays up; under an uppercut it goes down from the start). The glove
   is where the arm will put it (rig/solve.mjs: armEnd; a hand asked for close in front of its own shoulder is put out
   ahead of it, toward him). Each share is found where he will be `look` seconds on at the pace he is coming; while he
   throws a punch, `punch` metres more off him and where he will be no more than `lunge` metres on (his head and trunk go
   in with it at a cross's 4 or 5 m/s within a few frames of its start, faster than anything seen of them yet says, and
   not far; nor is a hand sent back out while it comes). Less room is taken at once and more let out at no more than
   `back` of the share a second (his bounce does not work the hand in and out); a share is followed as a spring of `firm`
   a second that just does not overshoot, at a hand's pace (the glove given way no faster than `speed` m/s, and that
   gathered or lost at no more than `accel` m/s2: no pop). And where the reach as it stands will not keep a glove `clear`
   off him where he will be `heed` seconds on, the hand is hurried in ahead of its share, as a guard is taken up: its
   wrist in one straight line at a punch's pace (`rush`: gathered and shed at no more than its accel, a step at a time,
   so that it is still when it gets there; never set there at once, which threw the glove 12 to 16 cm in a frame). A man
   in a dash is known where it will end (bout.mjs: dashLeft) and the hand is off all of his way there from its first
   frame; and where all the way in is in him still, he right up against it as the dash lands, or stood right up close,
   the hand gives way: the lead hand down toward where it hung, and from there, or the rear hand from where it is, by
   as much of `give` as it takes (down past his own hip and back: straight back there is only his own trunk), let out
   again slowly and all of it over the taunt's last `ease` seconds, unless a dash of his is on (one landing in those last
   moments put the lead glove 9 cm into his trunk). Not under a punch to the head, whose head and chest come to where a
   guard would hold the hand anyway; under one to the body, whose head comes in low, it does. A taunt's wrists come up to the arm's fold over `fold` metres (rig/solve.mjs:
   armEnd), not stopped dead at it, nor taken in toward it faster than they can still be stopped there slowing at no more
   than `brake` m/s2; and a hand the taunt has nearer its shoulder than the fold is hurried as the arm puts it, out on
   the fold, not the more for being put out there. All of it when there is room. */
export const ROOM = { clear: 0.07, want: 0.1, look: 0.1, punch: 0.1, lunge: 0.1, back: 0.6, firm: 18, speed: 3, accel: 60, heed: 0.035, rush: { speed: 8, accel: 60 }, brake: 30, give: [0.04, -0.11, -0.07], ease: 0.15, fold: 0.03 };
/* -> how much room a glove with its middle at g has (metres to spare; negative, too near by so much) off every ball of
   solid ([middle, how near a glove's middle comes before they touch, how far that middle moved in a step, the punch he is
   throwing if he is, how far a dash he is in has still to take it]), to be `clear` metres off each where it is, where it
   will be `ahead` steps on at the pace it is coming and everywhere between (his going away gives no more room than there
   is now); and, of a man in a dash, all the way to where that ends instead. wary: of a man throwing a punch, whose head
   comes fast and not far: it is looked for no further on than ROOM.lunge metres, and the glove kept ROOM.punch metres
   further off it. */
export function spare(g, solid, clear, ahead, wary) {
  // (how far g is off the nearest of the places a middle at p passes through going d)
  const off = (p, d) => {
    const w = [g[0] - p[0], g[1] - p[1], g[2] - p[2]],
      dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2],
      s = dd > 1e-12 ? Math.min(1, Math.max(0, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / dd)) : 0;
    return Math.hypot(w[0] - d[0] * s, w[1] - d[1] * s, w[2] - d[2] * s);
  };
  let least = Infinity;
  for (const [p, r, moved, coming, going] of solid) {
    const far = Math.hypot(moved[0], moved[1], moved[2]) * ahead,
      most = wary && coming && far > ROOM.lunge ? (ahead * ROOM.lunge) / far : ahead;
    // (in a dash, he goes where it takes him and no further)
    least = Math.min(least, going ? off(p, going) - r - clear : off(p, [moved[0] * most, moved[1] * most, moved[2] * most]) - r - clear - (wary && coming ? ROOM.punch : 0));
  }
  return least;
}
/* -> the share (0..1) of its way out a hand may go to, `from` the share it is at. left(k): the room there is with it k of
   the way out (spare, the least of it over everything looked at: not a straight line in k, a hand asked for close in
   front of its own shoulder being put out ahead of it), looked at STEPS times along the way and halved in between. With
   room where it is, as far out as there is room without a break; with none, back in as far as it takes; with none all the
   way in either (the way out is the way off him), on out as far as it takes; and null with no room anywhere. */
const STEPS = 16;
export function room(left, from = 0) {
  const at = i => left(i / STEPS),
    edge = (ok, bad) => {
      for (let n = 0; n < 6; n++) {
        const mid = (ok + bad) / 2;
        if (left(mid) >= 0) ok = mid;
        else bad = mid;
      }
      return ok;
    },
    next = Math.floor(from * STEPS + 1e-9) + 1;
  if (left(from) >= 0) {
    let ok = from;
    for (let i = next; i <= STEPS; i++) {
      if (at(i) < 0) return edge(ok, i / STEPS);
      ok = i / STEPS;
    }
    return 1;
  }
  let bad = from;
  for (let i = Math.ceil(from * STEPS - 1e-9) - 1; i >= 0; i--) {
    if (at(i) >= 0) return edge(i / STEPS, bad);
    bad = i / STEPS;
  }
  bad = from;
  for (let i = next; i <= STEPS; i++) {
    if (at(i) >= 0) return edge(i / STEPS, bad);
    bad = i / STEPS;
  }
  return null;
}
// -> the least share with room, looked at as room looks; and with room nowhere, the share with most
export function least(left) {
  let best = 0,
    bad = 0;
  for (let i = 0; i <= STEPS; i++) {
    const now = left(i / STEPS);
    if (now >= 0) {
      let ok = i / STEPS;
      for (let n = 0; n < 6 && i; n++) {
        const mid = (ok + bad) / 2;
        if (left(mid) >= 0) ok = mid;
        else bad = mid;
      }
      return ok;
    }
    bad = i / STEPS;
    if (now > left(best) + 1e-9) best = i / STEPS;
  }
  return best;
}

/* The elbow on the angled cross: the cross thrown `wide` metres to his left of the middle of the other man's head (12 cm past
   its side, the glove going by it), the elbow straightening only `extend` of the way, and the bent elbow coming on behind it
   onto the chin: what lands is the root of the forearm (`r` metres thick, a ball `root` of the way from the elbow to the
   wrist), judged as a glove is (game/bout.mjs), and the weight behind it is the arm's and the body's with no wrist to give
   (phys/chain.mjs: effectiveMass, part 'elbow'). He steps in to `close` metres from the head as he throws it (from 0.75-0.85
   centre to centre). A great dirty fighter lifts the elbow for it in the open (`raise`, [4암, 5암], the elbow channel); a
   legend's is hardly lifted, the fist drawn back across as if from a miss (`draw`, metres). */
export const ELBOW = { wide: 0.21, extend: [0.55, 0.5], r: 0.05, root: 0.2, close: 0.6, raise: [0.9, 0.3], draw: [0, 0.04] };
