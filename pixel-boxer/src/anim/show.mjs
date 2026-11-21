/* The showy dirty fighter (docs/moves-plan-4.md §5): at 4암 and 5암 the dirty grades are a show-off's. His stance, his guard,
   his parry, the tricks a press may turn into, and his taunts are here, as layers of numbers on the animator's channels and
   as rules the bout reads; where a thing lands (a glove on a glove, a hand behind a neck, an elbow on a chin) is the bout's to
   judge, by real contact, as a punch's is (game/bout.mjs). Grades below 4 and the clean grades have none of it (skill.mjs:
   stance.show, cover.cross, vary are theirs alone), and nothing here runs for them.
     stance(c, show, s)        the stance (§5.1): the lead hand let down to the waist, swinging like a pendulum, the lead
                               shoulder up, leant back, the chin out
     crossGuard(c, cross, k)   the cross-arm guard (§5.5), k of the way up
     hammer(c, h, t)           the hammering parry (§5.5): the rear fist's stroke t seconds after the guard went up; -> whether
                               it is coming down now (what the bout judges a parry by)
     choose(table, when, forced, u)   which trick a press turns into (§5.2), or null: the plain punch
     THROWS                    the punch each trick throws in place of the one pressed (where it changes it)
     PAW, paw(trick, t, glove, tier)   the guard pushed down or up (§5.3): where the lead hand goes for his glove, and how
                               much of the way */

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

/* The cross-arm guard, as the guard is up (k: 0..1). cross (skill.mjs: cover.cross): { L: [x, y, z, elbow], R: [...] (each
   hand moved from where the textbook's covered guard holds it: the lead forearm laid across in front of the chin and mouth,
   its glove in front of the rear shoulder; the rear forearm stood up across it at a slant over the forehead and the temple,
   its glove by the lead temple), lean: degrees bent forward, chin: degrees the chin is buried behind the forearm }. A punch
   is stopped by the forearms here, not by the gloves alone (game/bout.mjs: the forearms are in the way). */
export function crossGuard(c, cross, k) {
  for (const [side, [x, y, z, e]] of [['l', cross.L], ['r', cross.R]]) {
    c[side + 'x'] += x * k;
    c[side + 'y'] += y * k;
    c[side + 'z'] += z * k;
    c[side + 'e'] += e * k;
  }
  c.lean += cross.lean * k;
  c.hp += cross.chin * k;
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
   of his dice (0..1) decides it, each trick taking its chance's share of the throw in turn, so that each comes up as often as
   its chance says whatever else could have (the shares of tricks that cannot be done now are the plain punch's). */
export const THROWS = { flicker: 'flicker', pawDown: 'cross', pawUp: 'upper' };
export function choose(table, when, forced, u) {
  if (!table || forced === 'plain') return null;
  if (typeof forced === 'string') return table.some(([n]) => n === forced) && when(forced) ? forced : null;
  if (u === null || u === undefined) return null;
  let at = 0;
  for (const [name, p] of table) {
    if (u >= at && u < at + p) return when(name) ? name : null;
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
