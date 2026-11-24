/* A punch as a kinetic chain. Five joints turn one after another, from the canvas up: the legs drive, the hips turn, the
   trunk turns on the hips, the shoulder swings the arm, the elbow straightens it. None is told when to move. Each is a rotor
   pulled toward its end position by its own muscle, and each is switched on by the one below it passing its peak speed, so
   the order and the timing are what the dynamics make them. The fist's speed is the sum of what every joint is doing at that
   moment, and what a punch does when it lands is worked out from that state (see impulse()).
   A sixth joint, the waist (the belt and the belly turning on the pelvis, under the chest), is a branch off the chain, not a
   link in it: the joint that sets the trunk off sets the waist off with it ('hips'; or 'drive': the legs set it off with
   the hips as they hand on; or 'legs': it goes with the legs themselves, as the throw starts), and the waist hands on to
   nothing. Its muscle is quicker than the trunk's, so it peaks between the hips and the trunk (set off with the hips or the
   legs, before the hips), and the five joints of the chain fire when they did without it (a waist put in line would hand on
   once more, and every punch would land later). It is number 5, at the end, so that the numbers of the other five are what
   they were; ORDER is the six as they are shown, from the canvas up. A punch whose move has no chain.waist holds the waist
   still (as if it were in skip). How much of a punch's waist a man turns on its own, ahead of his chest, is his grade's
   (anim/skill.mjs chain.waist, c.own here: a beginner none of it, the chest turning it with itself, all of a piece; an
   amateur most of it).

     const chain = createChain(move, quick, skill)
                                              move.chain: { coil (seconds), rate: [5] natural frequencies in rad/s, skip,
                                              waist: { rate (rad/s), from: 'hips' | 'drive' | 'legs', damp } }
                                              quick: his muscles' speed; skill: how well he throws it (anim/skill.mjs:
                                              the order the joints go in, when each hands on, how far each turns, how
                                              each springs)
     stepChain(chain, move, dt)               -> the phase it is in: coil, throw, hold, recover, done
     chain.q[i], chain.v[i]                   each link's position 0..1 toward its end, and speed (1/s) (i: LINKS)
                                              (a punch thrown by the same hand as the one before starts from that one's: bout.mjs)
     chain.coil.q                             the wind-up before it: 0..1, let go as the chain fires (after chain.wait seconds
                                              of waiting for a foot to come down, and held chain.pause seconds at the bottom)
     preload(chain, move, load, shoulder)     a punch thrown out of the end of an evasion (or a parry), whose wind-up and
                                              leg drive that end has already done (load 0..1), and whose shoulder is
                                              already part of the way out (a parrying hand going straight on) */
export const LINKS = ['drive', 'hips', 'trunk', 'shoulder', 'elbow', 'waist'];
export const ORDER = ['drive', 'hips', 'waist', 'trunk', 'shoulder', 'elbow']; // (the same, as they are shown: from the canvas up)
const N = LINKS.length;
const WAIST = LINKS.indexOf('waist');
const DAMP = 0.62; // a little under critical: each joint runs a few percent past its end and comes back, which is the snap
const RECOVER = [22, 23, 25, 30, 34, 24]; // rad/s: coming back, the hand leads and the legs follow
const RECOVER_LAG = [0.06, 0.045, 0.03, 0.01, 0, 0.04]; // seconds each link waits before it starts back (the waist after the trunk)
const HOLD = 0.03;

// the legs first, each joint handing on to the one above; the hips set the waist off with the trunk, and it hands on to nothing
const NATURAL = [[0], { 0: [1], 1: [5, 2], 2: [3], 3: [4], 4: [], 5: [] }];
// a number for every joint, or one for all of them (a list of the five of the chain: the waist's is the trunk's)
const each = x => (Array.isArray(x) ? (x.length < N ? [...x, x[2]] : x) : new Array(N).fill(x || 0));
/* The order a punch's joints go in, with its waist put where it goes off: with the trunk (whoever sets the trunk off sets the
   waist off too), or, from the legs ('drive'), with the hips, or with the legs themselves ('legs'). A grade's own order
   (anim/skill.mjs: ARM_FIRST) is written for the five; this is where the waist is put into it. */
function branch(order, from) {
  const by = from === 'legs' ? 0 : from === 'drive' ? 1 : 2,
    put = list => list.filter(j => j !== WAIST).flatMap(j => (j === by ? [WAIST, j] : [j])),
    next = {};
  for (let i = 0; i < N; i++) next[i] = i === WAIST ? [] : put(order[1][i] || []);
  return [put(order[0]), next];
}
// the joints a punch holds still: its skip, and the waist, if it does not turn it
const held = new WeakMap();
export function skipped(spec) {
  if (!held.has(spec)) held.set(spec, spec.waist ? spec.skip || [] : [...(spec.skip || []), 'waist']);
  return held.get(spec);
}
const rateOf = (spec, i) => (i === WAIST ? spec.waist.rate : spec.rate[i]);

export function createChain(move, quick, skill, variant) {
  // quick: how much faster than written this boxer's muscles are (his speed, and how tired he is): every rate, times this
  const k = (skill && skill.chain) || {},
    /* (a wind-up that sets the arm, as a hook's and an uppercut's does, is mechanics: only so much of it can go, `set` of it,
       0.9 if the move does not say; and a punch that comes up out of the knees goes down into them as the grade's spring
       says: chain.spring) */
    spring = move.chain.spring ? Object.assign({ down: 1, pause: 0, wait: false }, k.spring) : null,
    // (and a punch to the body goes down to it in its wind-up: `set` of that, too, is the way down, and no grade leaves it out)
    coil = Math.max(move.chain.coil * (spring ? spring.down : move.chain.locked || move.chain.set !== undefined ? Math.max(move.chain.set ?? 0.9, k.coil ?? 1) : k.coil ?? 1), k.least || 0);
  const waist = move.chain.waist,
    damp = each(k.damp || DAMP).slice();
  if (waist && waist.damp) damp[WAIST] = waist.damp;
  return {
    quick: quick || 1,
    // how he throws it (the textbook if nothing is said), the waist put in where this punch sets it off
    order: (k.order || (waist && (waist.from === 'drive' || waist.from === 'legs'))) ? branch(k.order || NATURAL, waist && waist.from) : NATURAL,
    natural: !k.order,
    early: each(k.early),
    lag: each(k.lag),
    thrownAt: -1, // when the throw ended (it arrived, or it landed)
    damp, // (a joint each: the trunk's is how the body springs back off its turn; the waist's is the trunk's unless it says)
    own: k.waist ?? 1, // the share of the punch's waist turned by the waist on its own; the chest turns the rest with itself
    // (and how much of its waist the punch turns at his grade at all, where it says: move.whip, [4암, 5암], the flicker's)
    whip: move.whip ? move.whip[Math.max(0, ((skill && skill.form && skill.form.dirty) || 1) - 1)] : 1,
    // (a punch swung by the body, a hook, can use only so much of a better man's turn: past the target is past the target)
    amp: each((k.amp || [1, 1, 1, 1, 1]).map(a => (a > 1 ? 1 + (a - 1) * ((move.body && move.body.turn) ?? 1) : a))),
    back: k.back || 1,
    firm: (k.firm || 1) * (move.chain.firm ?? 1), // how solid the arm and wrist are at the instant it lands (a whip's, loose)
    // how long it stays out once it has got there (a dirty one stays for its foul, a thumb in his eye as long as it takes)
    // (a foul is a trick a dirty grade's press may turn into: variant, game/bout.mjs)
    hold: skill && skill.form && skill.form.dirty && move.foul && move.foul.hold && variant === move.foul.name ? move.foul.hold[skill.form.dirty - 1] : k.hold || HOLD,
    shown: k.shown ?? 1, // how much of the wind-up's movement shows (its setting of the arm always does)
    backLag: k.backLag ?? 1,
    coilTime: coil,
    // (a spring: seconds the knees are held at the bottom before they let go, and whether he waits for a foot to come down
    // before he goes down into them; the bout says how long that is: wait)
    pause: spring ? spring.pause : 0,
    springWait: spring ? !!spring.wait : false,
    wait: 0,
    phase: coil > 0 ? 'coil' : 'throw',
    t: 0,
    since: 0,
    coil: { q: 0, v: 0 },
    q: new Array(N).fill(0),
    v: new Array(N).fill(0),
    a: new Array(N).fill(0),
    push: new Array(N).fill(0), // each joint's push as it fired
    ready: new Array(N).fill(-1), // when each was ready to hand on
    handed: new Array(N).fill(false),
    on: new Array(N).fill(false),
    fired: new Array(N).fill(-1),
    peak: new Array(N).fill(0),
    peakAt: new Array(N).fill(-1),
    landed: false
  };
}
/* Thrown out of the end of an evasion: the wind-up is already that far in (only the rest of its time is used), and the legs
   are already that far into their push, coming up out of the knees the evasion bent (as far toward their peak speed as the
   load says), so they hand on to the hips sooner. Nothing else: the hips, trunk and arm still have all of their work to do,
   so the punch is no weaker for it. `shoulder`: how far the shoulder is already out, at rest (a parrying hand going on). */
export function preload(c, move, load, shoulder) {
  if (!(load > 0) && !(shoulder > 0)) return c;
  const k = c.quick || 1;
  c.load = load || 0;
  if (load > 0) {
    c.coil.q = Math.min(1, load);
    c.coilTime *= 1 - Math.min(1, load);
    c.pause *= 1 - Math.min(1, load);
    if (c.coilTime < 1e-4) (c.coilTime = 0), (c.phase = 'throw');
    // the legs on their own, from rest, to their peak speed: and the state `load` of the way there
    const w = move.chain.rate[0] * k,
      s = { q: 0, v: 0 },
      h = 1 / 960;
    let peak = 0,
      at = 0;
    for (let t = 0; t < 0.3; t += h) {
      pull(s, 0, 1, w, c.damp[0], h);
      if (s.v > peak) (peak = s.v), (at = t + h);
      else break;
    }
    const r = { q: 0, v: 0 };
    for (let t = 0; t < load * at - 1e-9; t += h) pull(r, 0, 1, w, c.damp[0], h);
    c.q[0] = r.q;
    c.v[0] = r.v;
    c.on[0] = true;
    c.fired[0] = 0;
    c.push[0] = w * w; // (what its push was as it started)
    c.peak[0] = r.v;
    c.peakAt[0] = 0;
  }
  if (shoulder > 0) c.q[3] = shoulder;
  return c;
}
// one rotor, pulled toward `goal` at natural frequency w: semi-implicit, in steps short enough for the stiffest muscle
function pull(s, key, goal, w, damp, dt) {
  const n = Math.max(1, Math.ceil(w * dt * 5));
  let q = s.q,
    v = s.v,
    a = 0;
  for (let i = 0, h = dt / n; i < n; i++) {
    a = w * w * (goal - q) - 2 * damp * w * v;
    v += a * h;
    q += v * h;
  }
  s.q = q;
  s.v = v;
  return a;
}
const cell = (c, i) => ({ get q() { return c.q[i]; }, set q(x) { c.q[i] = x; }, get v() { return c.v[i]; }, set v(x) { c.v[i] = x; } });

export function stepChain(c, move, dt) {
  const spec = move.chain,
    skip = skipped(spec),
    k = c.quick || 1,
    coil = c.coilTime / k,
    [start, next] = c.order,
    fire = i => {
      if (c.on[i]) return;
      c.on[i] = true;
      c.fired[i] = c.t;
      // a joint this punch holds still passes the baton straight on
      if (skip.includes(LINKS[i])) (c.handed[i] = true), next[i].forEach(fire);
    };
  c.t += dt;
  c.since += dt;
  if (c.phase === 'coil') {
    // (waiting for a foot to come down, he has not started yet; at the bottom, a pause holds him there)
    if (c.t <= (c.wait || 0) + 1e-9) return c.phase;
    if (!(c.pause && c.t - (c.wait || 0) >= coil)) pull(c.coil, 0, 1, 6 / coil, 1, dt); // all the way in, and all but still, in the time it is given (so it is let go of from rest)
    if (c.t - (c.wait || 0) >= coil + (c.pause || 0) - 1e-9) (c.phase = 'throw'), (c.since = 0);
    return c.phase;
  }
  if (c.phase === 'throw') {
    pull(c.coil, 0, 0, 30, 1, dt); // the wind-up is let go as the chain fires
    start.forEach(fire);
    // the joint that goes last: when it has arrived, the punch has been thrown
    let last = -1;
    // (the waist is a branch: it is not what the punch waits for)
    for (let i = 0; i < N; i++) if (i !== WAIST && !skip.includes(LINKS[i]) && (last < 0 || order(c, i) > order(c, last))) last = i;
    for (let i = 0; i < N; i++) {
      if (skip.includes(LINKS[i])) continue;
      if (!c.on[i]) {
        // a joint still on its way back from the punch before goes on coming back until its turn comes
        if (c.q[i] || c.v[i]) pull(cell(c, i), 0, 0, RECOVER[i] * k, 1, dt);
        continue;
      }
      const a = pull(cell(c, i), 0, 1, rateOf(spec, i) * k, c.damp[i], dt);
      if (!c.push[i]) c.push[i] = Math.max(1e-6, a);
      c.a[i] = a;
      if (c.v[i] > c.peak[i]) (c.peak[i] = c.v[i]), (c.peakAt[i] = c.t);
      /* Its push spent (past its peak speed, in the textbook; before it, the better he is; and then late, the worse he is):
         the next joint takes over. */
      if (!c.handed[i]) {
        if (c.ready[i] < 0 && a <= c.early[i] * c.push[i]) c.ready[i] = c.t;
        if (c.ready[i] >= 0 && c.t - c.ready[i] >= c.lag[i] - 1e-9) (c.handed[i] = true), next[i].forEach(fire);
      }
    }
    if (c.landed || (c.on[last] && c.q[last] >= 0.97 && c.v[last] < 1.5) || c.since > 0.6) (c.phase = 'hold'), (c.since = 0), (c.thrownAt = c.t);
    return c.phase;
  }
  if (c.phase === 'hold') {
    // a punch that missed finishes its reach; one that landed has been stopped, and stays where it was stopped
    for (let i = 0; i < N; i++) {
      if (skip.includes(LINKS[i])) continue;
      if (c.on[i]) pull(cell(c, i), 0, c.landed ? c.q[i] : 1, rateOf(spec, i) * 0.6 * k, 1, dt);
      // (thrown arm first, the body is still to come when the fist gets there: it turns after it, for nothing)
      else if (!c.natural) pull(cell(c, i), 0, 1, rateOf(spec, i) * 0.6 * k, 1, dt);
    }
    pull(c.coil, 0, 0, 30, 1, dt);
    if (c.since >= c.hold) (c.phase = 'recover'), (c.since = 0);
    return c.phase;
  }
  if (c.phase === 'recover') {
    let rest = true;
    pull(c.coil, 0, 0, 30, 1, dt);
    for (let i = 0; i < N; i++) {
      if (c.since >= (RECOVER_LAG[i] * c.backLag) / k) pull(cell(c, i), 0, 0, RECOVER[i] * c.back * k, 1, dt);
      else pull(cell(c, i), 0, c.q[i], 40, 1, dt); // waiting its turn: it stops where it is
      if (Math.abs(c.q[i]) > 0.03 || Math.abs(c.v[i]) > 0.5) rest = false;
    }
    if (rest) c.phase = 'done';
  }
  return c.phase;
}

/* What the punch is worth at this instant, from the state of the chain: the effective mass behind the glove, in kilograms.
   A fist alone is three quarters of a kilo. A straightening elbow puts the forearm and upper arm behind it. The body is
   behind that for as long as its turn is fresh: each of the legs, hips and trunk counts for how far it has turned, fading
   once it is past its peak, because a body that has finished turning and stopped is no longer pushing anything. So the
   whole of a punch's weight is there only in the moment the chain arrives together: land early and the body has not come
   yet, land late and it has gone, and either way it is an arm punch.
     move.chain.turn: degrees the hips and trunk each turn through (a small turn carries less of the body: each carries all
                      it can from 30 degrees); a punch that turns its waist turns links.waist.waist of the trunk's with the
                      waist, and that share of the trunk's weight is behind the glove for as long as the waist's turn is fresh
                      (the rest for as long as the chest's is): the same weight as without it, gone sooner (of the waist a man
                      turns on its own: c.own)
     move.chain.locked: the arm is held bent and stiff (hook, uppercut), so it carries the body from the start */
const MASS = { fist: 0.75, forearm: 1.2, upper: 2.0, trunk: 32, legs: 25 };
const FRESH = 0.11; // seconds a joint's turn stays behind the punch after its peak
export function effectiveMass(c, move, part) {
  const spec = move.chain,
    // (a beginner's wrist and elbow give at the contact, and the weight behind them leaks out; a great puncher's do not)
    stiff = (spec.locked ? 0.85 : smooth((c.q[4] - 0.25) / 0.55)) * (c.firm || 1),
    behind = i => (c.peakAt[i] < 0 ? 0 : Math.min(1, Math.max(0, c.q[i])) * Math.exp(-Math.max(0, c.t - c.peakAt[i] - 0.04) / FRESH)),
    amp = c.amp || [1, 1, 1, 1, 1, 1],
    hips = behind(1) * Math.min(1, (Math.abs(spec.turn[0]) * amp[1]) / 30),
    share = spec.waist && move.links.waist ? Math.min(1, (Math.abs(move.links.waist.waist || 0) * (c.whip ?? 1)) / (Math.abs(spec.turn[1]) || 1)) * (c.own ?? 1) : 0,
    trunk = (share > 0 ? behind(2) * (1 - share) + behind(WAIST) * share : behind(2)) * Math.min(1, (Math.abs(spec.turn[1]) * amp[2]) / 30),
    legs = behind(0) * Math.min(1, amp[0]);
  /* (an elbow, a show-off's (anim/show.mjs): no wrist or forearm to give, and the lever from the shoulder short: the upper arm
     and more of the body behind it than behind a fist) */
  if (part === 'elbow') return MASS.forearm * 0.5 + MASS.upper * 0.8 + MASS.trunk * 0.07 * (hips + trunk) + MASS.legs * 0.04 * legs;
  return MASS.fist + MASS.forearm * (0.4 + 0.6 * stiff) + stiff * (MASS.upper * 0.5 + MASS.trunk * 0.05 * (hips + trunk) + MASS.legs * 0.03 * legs);
}
// where a joint comes in the order it is thrown in (0 first)
function order(c, i) {
  const [start, next] = c.order,
    seen = new Map();
  let wave = start.map(j => [j, 0]);
  while (wave.length) {
    const more = [];
    for (const [j, n] of wave) if (!seen.has(j)) seen.set(j, n), next[j].forEach(m => more.push([m, n + 1]));
    wave = more;
  }
  return seen.has(i) ? seen.get(i) : -1;
}
function smooth(x) {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return x * x * (3 - 2 * x);
}
