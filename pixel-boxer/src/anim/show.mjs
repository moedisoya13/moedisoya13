/* The showy dirty fighter (docs/moves-plan-4.md §5): at 4암 and 5암 the dirty grades are a show-off's. His stance, his guard,
   his parry, the tricks a press may turn into, and his taunts are here, as layers of numbers on the animator's channels and
   as rules the bout reads; where a thing lands (a glove on a glove, a hand behind a neck, an elbow on a chin) is the bout's to
   judge, by real contact, as a punch's is (game/bout.mjs). Grades below 4 and the clean grades have none of the show-off's
   own (skill.mjs: stance.show, vary are theirs alone), and none of that runs for them. The cross-arm guard and the shoulder
   roll are techniques a man carries (game/techniques.mjs: crossArm from 3 up, rollCounter from 4 up; docs/moves-plan-5.md
   §4A), here because the dirty great ones carry the guard by default and the hammer is theirs alone.
     stance(c, show, s)        the stance (§5.1): the lead hand let down to the waist, swinging like a pendulum, the lead
                               shoulder up, leant back, the chin out
     crossGuard(c, cross, k)   the cross-arm guard, the classic one (docs/moves-plan-5.md §4A.2), k of the way up; -> metres
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
   (The rear hand is where a guard's is: beside the chin already.) */
export function stance(c, show, s) {
  const [dx, dy, dz] = show.drop,
    d = s.down,
    [A, hz, every, big] = show.swing,
    // (a legend's hardly moves, and then once in a while swings it, one big swing)
    burst = every ? bump(((s.clock + (s.seed || 0) * 1.7) % every) / (1 / hz)) : 0,
    amp = A * (1 + (big - 1) * burst),
    ph = Math.sin(TAU * hz * s.clock + (s.seed || 0));
  c.lx += dx * d;
  c.ly += dy * d + Math.abs(amp * ph) * 0.35 * d;
  c.lz += dz * d + amp * ph * d;
  c.le -= 0.25 * d;
  // (and the lean, the chin and the shoulder: given up into a punch as it goes, and when he covers up)
  const k = s.unwind * (1 - (s.cover || 0));
  c.lean -= show.lean * k;
  c.hp -= show.chin * k;
  c.side -= show.shoulder * k;
  c.hr += show.shoulder * 0.4 * k;
  c.twist -= show.roll * k;
}

/* The cross-arm guard, the classic one, as the guard is up (k: 0..1). cross (skill.mjs: CROSS[grade]): the rear glove up at
   the chin, held to the face as a guard's is, its forearm stood up under it and the elbow down in front of the ribs; the lead
   forearm laid across the belly, locked to the chest (it goes where the trunk goes, not where the head goes), the elbow at
   the lead side; side on, the chest closed, bent forward on bent knees, the chin down and turned behind the lead shoulder,
   which is shrugged up (the animator's to do: not a channel; -> how far). The head is the rear glove's and the shoulder's to
   keep, the body the forearm's (game/bout.mjs: the forearms and the lead shoulder are in the way of a punch). */
export function crossGuard(c, cross, k) {
  for (const [side, [x, y, z, e]] of [['l', cross.L], ['r', cross.R]]) {
    c[side + 'x'] += x * k;
    c[side + 'y'] += y * k;
    c[side + 'z'] += z * k;
    c[side + 'e'] += e * k;
  }
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

/* The shoulder roll, t seconds after it started. roll (skill.mjs: ROLL[grade]): the chest turned further away from him, to his
   right, in `go` seconds (the hips `turn[0]` degrees and the chest `turn[1]` more), laid back `lean` degrees and bent away to
   his right `side` (the lead shoulder up, the head away from the punch), sat on the rear leg (`knee`: [lead, rear] degrees, the
   lead knee straightened and the rear one bent, the weight going back over the rear foot; the hips `back` metres back), the chin `chin` degrees down behind the lead shoulder as it is shrugged `shoulder` metres more into the
   punch's way, the rear glove tucked in under the chin behind it (`tuck`: [x, z] metres), and a great one's lead forearm
   lifted `lift` off his belly; held `hold` and
   unwound over `home`. -> { shrug: metres more the lead shoulder is up, w: how much of the roll there is (0..1), done }. The
   bout judges it: a punch that meets the lead shoulder while the chest is turning away is rolled off it (game/bout.mjs). */
export function shoulderRoll(c, roll, t) {
  const go = smooth(t / roll.go),
    home = smooth((t - roll.go - roll.hold) / roll.home),
    w = go * (1 - home);
  c.yaw += roll.turn[0] * w;
  c.twist += roll.turn[1] * w;
  c.lean -= roll.lean * w;
  c.side += roll.side * w;
  c.lkf += roll.knee[0] * w;
  c.rkf += roll.knee[1] * w;
  c.hz -= roll.back * w;
  c.hp += roll.chin * w;
  c.ly += roll.lift * w;
  c.rx += roll.tuck[0] * w;
  c.rz += roll.tuck[1] * w;
  return { shrug: roll.shoulder * w, w, done: t >= roll.go + roll.hold + roll.home };
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
   head), getting there in `reach` seconds, which is about when the uppercut's legs drive; it pulls his head forward and down
   (game/bout.mjs: collared; his body's, animator.pulled: `pull` metres over `time`), and lets go `let` seconds after the
   uppercut lands, [4암, 5암]. A hand that does not get there is an uppercut and nothing else. */
export const COLLAR = { reach: 0.1, side: 0.2, nape: [0.1, 0.06], pull: 0.1, time: 0.3, let: [0.1, 0.05] };
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

/* The elbow on the angled cross: the cross thrown `wide` metres to his left of the middle of the other man's head (12 cm past
   its side, the glove going by it), the elbow straightening only `extend` of the way, and the bent elbow coming on behind it
   onto the chin: what lands is the root of the forearm (`r` metres thick, a ball `root` of the way from the elbow to the
   wrist), judged as a glove is (game/bout.mjs), and the weight behind it is the arm's and the body's with no wrist to give
   (phys/chain.mjs: effectiveMass, part 'elbow'). He steps in to `close` metres from the head as he throws it (from 0.75-0.85
   centre to centre). A great dirty fighter lifts the elbow for it in the open (`raise`, [4암, 5암], the elbow channel); a
   legend's is hardly lifted, the fist drawn back across as if from a miss (`draw`, metres). */
export const ELBOW = { wide: 0.21, extend: [0.55, 0.5], r: 0.05, root: 0.2, close: 0.6, raise: [0.9, 0.3], draw: [0, 0.04] };
