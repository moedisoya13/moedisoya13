/* A match: rounds of a bout, a referee who counts a man who goes down, a break between rounds when the corners talk to
   their boxers, and three judges. The fighting itself is the bout (bout.mjs); both corners are boxed by brains
   (brain.mjs) unless a player's controls are handed in. Nothing here draws.
     const match = createMatch({ seed, sheets: [a, b], plans: [planA, planB], rounds, roundTime,
                                 skills: [a, b] (anim/skill.mjs: each one's grades; a pro's if left out),
                                 techniques: [a, b] (game/techniques.mjs: what each carries; what his grades give him if
                                 left out: profile.mjs loadout), rehearse (the brains pick techniques not built yet, too) })
     stepMatch(match, dt, inputs?)     advance; inputs[i] (controls) replaces boxer i's brain for this step
     match.phase                       'fight' | 'count' | 'break' (waiting for the corners) | 'over'
     nextRound(match, plans?)          after a break: the plans the corners chose (each may be left as it was)
     match.events                      what happened this step: the bout's, and the match's own (round, down, count, up,
                                       stagger, collapse, result)
     match.result                      { winner, how: 'KO' | 'TKO' | 'decision' | 'draw', round, time, cards }
   Fight to the end without a screen: finish(match). */
import { createBout, step, settle, random, getUp, legsGo, collapse, RULES } from './bout.mjs';
import { createBrain, think, PLANS } from './brain.mjs';
import { fatigue } from './profile.mjs';
import { MOVES } from '../anim/moves.mjs';

export const MATCH = {
  rounds: 3,
  roundTime: 60, // seconds of a round (a boxing round is three minutes; a phone's is one)
  count: 0.6, // seconds of the match a count of one takes
  rise: { health: [18, 48] }, // what a boxer who beats the count has left, from little will to a lot
  between: { stamina: [0.5, 0.8], health: [5, 14] }, // what a minute in the corner gives back, from the least to the most
  tko: 3, // knockdowns in a round that stop it
  /* a man who gets up too late, not on his feet by the time ten would have counted him out (the user's answer of 2026-11-28,
     a-count-ten: he staggers, goes down again, and that is the knockout): `reel` seconds on his feet, his legs going, as
     he goes where they take him at `pace` of a walk; then down onto a knee, and the fight waved off `settle` seconds after */
  late: { reel: 0.8, pace: 0.3, settle: 0.9, reach: 0.6, room: 0.5 } // (reach: about how far that takes him, metres; room: kept off the ropes by)
};

const DT = 1 / 60;
const tally = () => ({ thrown: 0, landed: 0, power: 0, J: 0, blocked: 0, downs: 0 });

export function createMatch(o) {
  o = o || {};
  const bout = createBout(o.seed || 1, { sheets: o.sheets, skills: o.skills, techniques: o.techniques, knockdowns: true, vary: true }),
    plans = o.plans || [PLANS.steady, PLANS.steady];
  return {
    bout,
    brains: [0, 1].map(i => createBrain(bout.fighters[i].sheet, plans[i], { rehearse: o.rehearse })),
    rounds: o.rounds || MATCH.rounds,
    roundTime: o.roundTime || MATCH.roundTime,
    round: 1,
    clock: 0, // seconds into the round
    phase: 'fight',
    count: null, // { who, n, up (the count he will rise at, or none), t, rising (he has beaten it and is getting up), late (he
    //               gets up too late: he will not be on his feet by ten), reel (his legs going: { t, go }), fell (seconds since
    //               he went down again) }
    stats: [[tally(), tally()]], // a tally a round, a boxer
    cards: [], // [round][judge] = [points for 0, points for 1]
    result: null,
    events: []
  };
}

// the bout's events, counted for the judges and the screen
function count(match, e) {
  const t = match.stats[match.round - 1];
  if (e.type === 'punch') t[e.who].thrown++;
  if (e.type === 'hit') {
    t[e.who].landed++;
    t[e.who].J += e.J;
    if (e.name !== 'jab') t[e.who].power++;
  }
  if (e.type === 'block') t[e.who].blocked++;
}

/* The round, as each of three judges saw it: clean punches by how hard they landed, a little for punches that were
   blocked, and a point off for every knockdown. Each judge sees it a little differently. */
function score(match) {
  const t = match.stats[match.round - 1],
    work = i => t[i].J + 0.25 * t[1 - i].blocked * 12 + 6 * t[i].landed,
    cards = [];
  for (let j = 0; j < 3; j++) {
    const a = work(0) * (0.9 + 0.2 * random(match.bout)),
      b = work(1) * (0.9 + 0.2 * random(match.bout)),
      even = Math.abs(a - b) < 0.04 * (a + b + 1),
      card = even ? [10, 10] : a > b ? [10, 9] : [9, 10];
    card[0] -= t[0].downs;
    card[1] -= t[1].downs;
    cards.push(card);
  }
  match.cards.push(cards);
}

function end(match, winner, how) {
  match.phase = 'over';
  match.result = { winner, how, round: match.round, time: +match.clock.toFixed(1), cards: match.cards };
  const bout = match.bout;
  if (winner !== null) (bout.over = winner), (bout.overAt = bout.t);
  match.events.push({ type: 'result', ...match.result });
}

function decision(match) {
  const totals = [0, 1, 2].map(j => match.cards.reduce((s, r) => [s[0] + r[j][0], s[1] + r[j][1]], [0, 0])),
    votes = totals.map(([a, b]) => (a > b ? 0 : b > a ? 1 : null)),
    zero = votes.filter(v => v === 0).length,
    one = votes.filter(v => v === 1).length;
  match.totals = totals;
  // (two of the three cards for the same man win it; anything else is a draw, and a draw has no winner: one judge for him and
  // two level is a majority draw, not a win)
  end(match, zero >= 2 ? 0 : one >= 2 ? 1 : null, zero >= 2 || one >= 2 ? 'decision' : 'draw');
}

export function stepMatch(match, dt, inputs) {
  dt = dt || DT;
  match.events = [];
  if (match.phase === 'over' || match.phase === 'break') {
    // the bout still breathes (the winner cheers, the beaten man lies there), but nothing is decided
    if (match.phase === 'over') step(match.bout, [{}, {}], dt);
    return match;
  }
  const bout = match.bout,
    t0 = bout.t;
  if (match.phase === 'count') {
    // the referee counts; the man still standing waits away from him
    const c = match.count,
      f = bout.fighters[c.who],
      other = bout.fighters[1 - c.who],
      away = [other.x - f.x, other.z - f.z],
      far = Math.hypot(...away) || 1,
      stand = far < 2.1 ? { move: [away[0] / far, away[1] / far] } : {},
      // (a man up too late, his legs going: where they take him, a little way)
      legs = c.reel && !f.down ? { move: [c.reel.go[0] * MATCH.late.pace, c.reel.go[1] * MATCH.late.pace] } : {};
    step(bout, c.who === 0 ? [legs, stand] : [stand, legs], dt);
    // (once he has beaten the count and is getting up, the referee counts no further: he watches him up onto his feet, and
    // no number is called over a man on his way up, ten least of all)
    if (!c.rising) c.t += dt;
    const n = Math.min(10, Math.floor(c.t / MATCH.count) + 1);
    if (n !== c.n) (c.n = n), match.events.push({ type: 'count', who: c.who, n });
    if (c.up && !c.rising && n >= c.up && f.down) {
      // up, at the count he had in him (a man doubled up by a body shot keeps what health he still had)
      f.hp = Math.max(f.hp, c.health);
      const rise = getUp(bout, f);
      if (rise) {
        c.rising = true;
        // (too late if the rise, begun on this number, would end after the moment ten counts out a man still lying there)
        c.late = (n - 1) * MATCH.count + MOVES[rise.name].dur > 10 * MATCH.count + 1e-9;
      }
      match.events.push({ type: 'up', who: c.who, n });
    }
    const L = MATCH.late,
      standing = !f.down && (!f.action || !MOVES[f.action.name].floor);
    if (standing && c.late && !c.reel) {
      /* up, too late: his legs go under him, a little way back and to one side of the other man; not into the ropes (a man
         who goes down with them pressed is slid in off them under him, 17 cm: bout.mjs EDGE_SLIDE), but toward the middle
         of the ring instead if that side would put him within L.room of them */
      const turn = 0.35 + 0.6 * random(bout),
        side = random(bout) < 0.5 ? -1 : 1,
        unit = v => (Math.hypot(...v) > 1e-6 ? [v[0] / Math.hypot(...v), v[1] / Math.hypot(...v)] : [-away[0] / far, -away[1] / far]),
        turned = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)],
        roomOf = v => RULES.half - Math.max(Math.abs(f.x + v[0] * L.reach), Math.abs(f.z + v[1] * L.reach)),
        back = [-away[0] / far, -away[1] / far],
        middle = unit([-f.x, -f.z]),
        ways = [turned(back, side * turn), turned(back, -side * turn)],
        best = ways.find(v => roomOf(v) >= L.room) || [turned(middle, side * turn * 0.5), turned(middle, -side * turn * 0.5), middle].reduce((a, v) => (roomOf(v) > roomOf(a) ? v : a));
      c.reel = { t: 0, go: best };
      legsGo(f);
      match.events.push({ type: 'stagger', who: c.who });
    } else if (c.reel && c.fell === undefined && (c.reel.t += dt) >= L.reel - 1e-9) {
      collapse(bout, f);
      c.fell = 0;
      match.events.push({ type: 'collapse', who: c.who });
    } else if (c.fell !== undefined) {
      if ((c.fell += dt) >= L.settle - 1e-9) end(match, 1 - c.who, 'KO');
    } else if (standing && !c.late) {
      match.phase = 'fight';
      match.count = null;
    } else if (f.down && n >= 10 && c.t >= 10 * MATCH.count) end(match, 1 - c.who, 'KO');
    return match;
  }

  // ---- fighting
  const controls = [0, 1].map(i => (inputs && inputs[i]) || think(match.brains[i], bout, i, dt));
  step(bout, controls, dt);
  match.clock += bout.t - t0; // (the clock stops in the moment of a blow)
  for (const e of bout.events) {
    count(match, e);
    match.events.push(e);
    if (e.type === 'hit' && e.down) {
      const who = e.on,
        f = bout.fighters[who],
        t = match.stats[match.round - 1];
      t[who].downs++;
      if (t[who].downs >= MATCH.tko) return end(match, 1 - who, 'TKO'), match;
      // whether he beats the count is settled now, by how much he has in him: less each time he has been down
      // (and a man knocked out cold does not: the count goes to ten; one doubled up by a body shot is awake, and does, by eight)
      const will = f.k.will * Math.pow(0.8, (f.downs || 1) - 1) * (0.6 + 0.4 * fatigue(f)),
        rises = random(bout) < will ? 4 + Math.floor(random(bout) * 5) : null,
        up = e.out ? null : e.part === 'body' ? rises || 8 : rises;
      match.count = { who, n: 0, t: 0, up, health: MATCH.rise.health[0] + (MATCH.rise.health[1] - MATCH.rise.health[0]) * will };
      match.phase = 'count';
      match.events.push({ type: 'down', who, round: match.round });
      return match;
    }
  }
  if (match.clock >= match.roundTime) {
    score(match);
    match.events.push({ type: 'bell', round: match.round, cards: match.cards[match.round - 1] });
    if (match.round >= match.rounds) decision(match);
    else match.phase = 'break';
  }
  return match;
}

/* The minute in the corner: breath and a little health back, a new instruction, and out again from their corners. */
export function nextRound(match, plans) {
  if (match.phase !== 'break') return match;
  const bout = match.bout,
    B = MATCH.between;
  bout.fighters.forEach((f, i) => {
    const st = (f.sheet.stamina ?? 50) / 100,
      ch = (f.sheet.chin ?? 50) / 100;
    f.stamina += (f.k.staminaMax - f.stamina) * (B.stamina[0] + (B.stamina[1] - B.stamina[0]) * st);
    f.hp = Math.min(RULES.hp, f.hp + B.health[0] + (B.health[1] - B.health[0]) * ch);
    f.action = null;
    f.cover = false;
    f.stun = f.counter = 0;
    f.vx = f.vz = f.kx = f.kz = f.ix = f.iz = 0;
    f.x = (i ? 1 : -1) * (RULES.startGap / 2);
    f.z = 0;
    f.yaw = i ? -Math.PI / 2 : Math.PI / 2;
    if (plans && plans[i]) match.brains[i].plan = plans[i];
  });
  settle(bout);
  match.round++;
  match.clock = 0;
  match.stats.push([tally(), tally()]);
  match.phase = 'fight';
  match.events = [{ type: 'round', round: match.round }];
  return match;
}

/* What a corner that knows its business tells its boxer between rounds: breathe if he is spent, finish if the other man
   is hurt, press if the round went against him, and otherwise let him box. */
export function cornerAdvice(match, who) {
  const f = match.bout.fighters[who],
    other = match.bout.fighters[1 - who],
    last = match.cards[match.cards.length - 1],
    lost = last && last.filter(c => c[who] < c[1 - who]).length >= 2;
  if (fatigue(f) < 0.5) return PLANS.breathe;
  if (other.hp < 35 && fatigue(f) > 0.7) return PLANS.allin;
  if (f.hp < 35) return PLANS.defend;
  if (lost) return PLANS.pressure;
  return match.brains[who].plan;
}

// to the end, unwatched: each corner takes its own advice between rounds (or `plans(match)` decides)
export function finish(match, plans) {
  let guard = 0;
  while (match.phase !== 'over' && guard++ < 60 * 60 * 60) {
    if (match.phase === 'break') nextRound(match, plans ? plans(match) : [cornerAdvice(match, 0), cornerAdvice(match, 1)]);
    else stepMatch(match, DT);
  }
  return match.result;
}
export { MOVES };
