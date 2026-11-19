/* A punch as a kinetic chain. Five joints turn one after another, from the canvas up: the legs drive, the hips turn, the
   trunk turns on the hips, the shoulder swings the arm, the elbow straightens it. None is told when to move. Each is a rotor
   pulled toward its end position by its own muscle, and each is switched on by the one below it passing its peak speed, so
   the order and the timing are what the dynamics make them. The fist's speed is the sum of what every joint is doing at that
   moment, and what a punch does when it lands is worked out from that state (see impulse()).

     const chain = createChain(move)          move.chain: { coil (seconds), rate: [5] natural frequencies in rad/s, skip }
     stepChain(chain, move, dt)               -> the phase it is in: coil, throw, hold, recover, done
     chain.q[i], chain.v[i]                   each link's position 0..1 toward its end, and speed (1/s)
                                              (a punch thrown by the same hand as the one before starts from that one's: bout.mjs)
     chain.coil.q                             the wind-up before it: 0..1, let go as the chain fires */
export const LINKS = ['drive', 'hips', 'trunk', 'shoulder', 'elbow'];
const N = LINKS.length;
const DAMP = 0.62; // a little under critical: each joint runs a few percent past its end and comes back, which is the snap
const RECOVER = [22, 23, 25, 30, 34]; // rad/s: coming back, the hand leads and the legs follow
const RECOVER_LAG = [0.06, 0.045, 0.03, 0.01, 0]; // seconds each link waits before it starts back
const HOLD = 0.03;

export function createChain(move, quick) {
  // quick: how much faster than written this boxer's muscles are (his speed, and how tired he is): every rate, times this
  return { quick: quick || 1, phase: move.chain.coil > 0 ? 'coil' : 'throw', t: 0, since: 0, coil: { q: 0, v: 0 }, q: new Array(N).fill(0), v: new Array(N).fill(0), a: new Array(N).fill(0), on: new Array(N).fill(false), fired: new Array(N).fill(-1), peak: new Array(N).fill(0), peakAt: new Array(N).fill(-1), landed: false };
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
    skip = spec.skip || [],
    k = c.quick || 1,
    coil = spec.coil / k;
  c.t += dt;
  c.since += dt;
  if (c.phase === 'coil') {
    pull(c.coil, 0, 1, 4.2 / coil, 1, dt); // arrives in about the time it is given
    if (c.t >= coil) (c.phase = 'throw'), (c.since = 0);
    return c.phase;
  }
  if (c.phase === 'throw') {
    pull(c.coil, 0, 0, 30, 1, dt); // the wind-up is let go as the chain fires
    if (!c.on[0]) (c.on[0] = true), (c.fired[0] = c.t);
    let last = N - 1;
    while (skip.includes(LINKS[last])) last--;
    for (let i = 0; i < N; i++) {
      if (skip.includes(LINKS[i])) {
        // a joint this punch holds still: it passes the baton straight on
        if (c.on[i] && i + 1 < N && !c.on[i + 1]) (c.on[i + 1] = true), (c.fired[i + 1] = c.t);
        continue;
      }
      if (!c.on[i]) {
        // a joint still on its way back from the punch before goes on coming back until its turn comes
        if (c.q[i] || c.v[i]) pull(cell(c, i), 0, 0, RECOVER[i] * k, 1, dt);
        continue;
      }
      c.a[i] = pull(cell(c, i), 0, 1, spec.rate[i] * k, DAMP, dt);
      if (c.v[i] > c.peak[i]) (c.peak[i] = c.v[i]), (c.peakAt[i] = c.t);
      // past its peak speed: the next joint up takes over
      if (c.a[i] <= 0 && i + 1 < N && !c.on[i + 1]) (c.on[i + 1] = true), (c.fired[i + 1] = c.t);
    }
    if (c.landed || (c.q[last] >= 0.97 && c.v[last] < 1.5) || c.since > 0.6) (c.phase = 'hold'), (c.since = 0);
    return c.phase;
  }
  if (c.phase === 'hold') {
    // a punch that missed finishes its reach; one that landed has been stopped, and stays where it was stopped
    for (let i = 0; i < N; i++) if (c.on[i] && !skip.includes(LINKS[i])) pull(cell(c, i), 0, c.landed ? c.q[i] : 1, spec.rate[i] * 0.6 * k, 1, dt);
    pull(c.coil, 0, 0, 30, 1, dt);
    if (c.since >= HOLD) (c.phase = 'recover'), (c.since = 0);
    return c.phase;
  }
  if (c.phase === 'recover') {
    let rest = true;
    pull(c.coil, 0, 0, 30, 1, dt);
    for (let i = 0; i < N; i++) {
      if (c.since >= RECOVER_LAG[i] / k) pull(cell(c, i), 0, 0, RECOVER[i] * k, 1, dt);
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
     move.chain.turn: degrees the hips and trunk each turn through (a small turn carries less of the body)
     move.chain.locked: the arm is held bent and stiff (hook, uppercut), so it carries the body from the start */
const MASS = { fist: 0.75, forearm: 1.2, upper: 2.0, trunk: 32, legs: 25 };
const FRESH = 0.11; // seconds a joint's turn stays behind the punch after its peak
export function effectiveMass(c, move) {
  const spec = move.chain,
    stiff = spec.locked ? 0.85 : smooth((c.q[4] - 0.25) / 0.55),
    behind = i => (c.peakAt[i] < 0 ? 0 : Math.min(1, Math.max(0, c.q[i])) * Math.exp(-Math.max(0, c.t - c.peakAt[i] - 0.04) / FRESH)),
    hips = behind(1) * Math.min(1, Math.abs(spec.turn[0]) / 45),
    trunk = behind(2) * Math.min(1, Math.abs(spec.turn[1]) / 18),
    legs = behind(0);
  return MASS.fist + MASS.forearm * (0.4 + 0.6 * stiff) + stiff * (MASS.upper * 0.5 + MASS.trunk * 0.05 * (hips + trunk) + MASS.legs * 0.03 * legs);
}
function smooth(x) {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return x * x * (3 - 2 * x);
}
