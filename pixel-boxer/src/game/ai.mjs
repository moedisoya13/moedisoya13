/* The other corner. He reads the same state the picture is drawn from and works the same controls: closes to range, circles,
   throws in bursts, and answers what he sees coming some of the time. The techniques his fighter carries (game/techniques.mjs)
   come in where they do for a boxer's head (brain.mjs), with his level's numbers where a head has a sheet and a plan: his
   parry, guard and slip for the shares of his answers, his counter for his eye for an opening, his iq for his sense.
     const rival = createRival(level, o?)        level: one of LEVELS; o.rehearse: as brain.mjs createBrain
     think(rival, bout, dt) -> controls          for boxer 1 */
import { MOVES } from '../anim/moves.mjs';
import { random, incoming } from './bout.mjs';
import { TECHNIQUES, memory, observe, situation, answerOf, counterOf, openingOf, comboOf, goingOf, bodyOf } from './techniques.mjs';

export const LEVELS = {
  novice: { guard: 0.25, parry: 0.1, slip: 0.1, eager: 0.45, counter: 0.5, iq: 0.25, rest: [0.9, 1.7], bursts: [['jab'], ['jab', 'jab'], ['power'], ['jab', 'power']] },
  contender: { guard: 0.45, parry: 0.25, slip: 0.18, eager: 0.6, counter: 0.8, iq: 0.5, rest: [0.6, 1.3], bursts: [['jab'], ['jab', 'jab'], ['jab', 'power'], ['power', 'power'], ['jab', 'jab', 'power']] },
  champion: { guard: 0.6, parry: 0.45, slip: 0.22, eager: 0.75, counter: 1, iq: 0.8, rest: [0.35, 0.9], bursts: [['jab', 'jab'], ['jab', 'power'], ['power', 'power'], ['jab', 'power', 'power'], ['jab', 'jab', 'power', 'power']] }
};
const RANGE = 1.0;

export function createRival(level, o) {
  return { level: LEVELS[level] || LEVELS.contender, rest: 1, burst: [], next: 0, circle: 1, circleFor: 1.5, answer: null, seen: null, hold: 0, mem: memory(), used: null, holding: null, tried: null, rests: 0, going: null, rehearse: !!(o && o.rehearse) };
}

export function think(rival, bout, dt) {
  const [him, me] = bout.fighters,
    L = rival.level,
    input = { move: [0, 0] };
  observe(rival.mem, bout, 1);
  if (bout.over !== null || me.down) return input;
  const dx = him.x - me.x,
    dz = him.z - me.z,
    far = Math.hypot(dx, dz) || 1,
    to = [dx / far, dz / far],
    across = [to[1], -to[0]];
  rival.rest -= dt;
  rival.next -= dt;
  rival.circleFor -= dt;
  if (rival.circleFor <= 0) {
    rival.circle = [-1, 0, 0, 1][Math.floor(random(bout) * 4)];
    rival.circleFor = 0.8 + random(bout) * 1.6;
  }

  // a punch is on its way: decide once what to do about it
  const coming = incoming(him),
    s = situation(bout, 1, rival, { coming, range: RANGE, side: rival.circle, iq: L.iq, plan: null, roll: () => random(bout) });
  if (coming && rival.seen !== coming.id) {
    rival.seen = coming.id;
    const roll = random(bout),
      inReach = far < MOVES[coming.name].reach + 0.25;
    rival.answer = !inReach ? null : answerOf(s, roll, [['parry', L.parry], ['guard', L.guard], ['slip', L.slip]]);
    const t = TECHNIQUES[rival.answer];
    if (t) rival.used = { id: t.id, of: coming.id, at: bout.t, hold: t.answer.hold ? t.answer.hold(s) : 0.12 };
  }
  if (!coming) rival.answer = null;
  if (coming && rival.answer) {
    // he reads the punch off the body: once the trunk has started to turn, the fist is a few hundredths of a second away
    const soon = coming.chain.on[2],
      t = TECHNIQUES[rival.answer];
    if (t) {
      Object.assign(input, t.answer.control(s));
      if (t.answer.once && soon) rival.answer = null;
    } else if (rival.answer === 'guard') input.cover = true;
    else if (rival.answer === 'parry') input.cover = soon;
    else if (rival.answer === 'slip' && soon) (input.dash = [-to[0] * 0.6 + across[0] * (rival.circle || 1), -to[1] * 0.6 + across[1] * (rival.circle || 1)]), (rival.answer = null);
    rival.hold = t ? rival.used.hold : 0.12;
    rival.holding = t ? t.id : null;
    return input;
  }
  if (rival.hold > 0) {
    // keep the guard up a moment after the punch has gone by
    rival.hold -= dt;
    input.cover = !me.action;
    const t = rival.holding && TECHNIQUES[rival.holding];
    if (t && t.answer.held) Object.assign(input, t.answer.held(s));
  }

  if (me.counter > 0 && far < MOVES.cross.reach) {
    if (random(bout) < L.counter) (input.power = true), Object.assign(input, counterOf(s));
    else me.counter = 0;
    return input;
  }
  // (an opening a technique of his has made that the bout does not mark as one: once for each)
  const made = openingOf(s);
  if (made && made.key !== rival.tried) {
    rival.tried = made.key;
    if (random(bout) < L.counter) {
      if (rival.holding) (rival.hold = 0), (rival.holding = null);
      return Object.assign(input, TECHNIQUES[made.id].counter(s));
    }
  }
  // in the middle of a burst: throw the next one as soon as the last allows
  if (rival.burst.length && rival.next <= 0 && far < MOVES.jab.reach + 0.1) {
    const what = rival.burst.shift();
    if (typeof what === 'string') {
      input[what] = true;
      if (bodyOf(s)) input.body = true;
      rival.next = what === 'jab' ? 0.2 : 0.3;
    } else {
      const { next, ...press } = what;
      Object.assign(input, press);
      rival.next = next ?? 0.3;
    }
    if (!rival.burst.length) (rival.rest = L.rest[0] + random(bout) * (L.rest[1] - L.rest[0])), rival.rests++;
    return input;
  }
  // footwork: close to range, hold it, circle
  const drift = far > RANGE + 0.1 ? 1 : far < RANGE - 0.16 ? -0.8 : 0;
  // (he circles slowly: the camera swings with the pair of them, and the player's stick is the camera's)
  input.move = [to[0] * drift + across[0] * rival.circle * 0.2, to[1] * drift + across[1] * rival.circle * 0.2];
  const going = rival.burst.length ? null : goingOf(s);
  if (going) Object.assign(input, going, { cover: false });
  if (!rival.burst.length && rival.rest <= 0 && far < MOVES.jab.reach - 0.05 && !me.action && me.stun <= 0) {
    if (random(bout) < L.eager) {
      rival.burst = L.bursts[Math.floor(random(bout) * L.bursts.length)].slice();
      // (one he would start with a power punch may be a technique's instead: techniques.mjs, combination)
      const tech = rival.burst[0] === 'power' ? comboOf(s) : null;
      if (tech) rival.burst = tech;
      rival.next = 0;
    } else rival.rest = 0.3 + random(bout) * 0.5;
  }
  return input;
}
