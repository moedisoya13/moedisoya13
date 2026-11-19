/* The other corner. He reads the same state the picture is drawn from and works the same controls: closes to range, circles,
   throws in bursts, and answers what he sees coming some of the time. */
import { MOVES } from '../anim/moves.mjs';
import { random } from './bout.mjs';

export const LEVELS = {
  novice: { guard: 0.25, parry: 0.1, slip: 0.1, eager: 0.45, counter: 0.5, rest: [0.9, 1.7], bursts: [['jab'], ['jab', 'jab'], ['power'], ['jab', 'power']] },
  contender: { guard: 0.45, parry: 0.25, slip: 0.18, eager: 0.6, counter: 0.8, rest: [0.6, 1.3], bursts: [['jab'], ['jab', 'jab'], ['jab', 'power'], ['power', 'power'], ['jab', 'jab', 'power']] },
  champion: { guard: 0.6, parry: 0.45, slip: 0.22, eager: 0.75, counter: 1, rest: [0.35, 0.9], bursts: [['jab', 'jab'], ['jab', 'power'], ['power', 'power'], ['jab', 'power', 'power'], ['jab', 'jab', 'power', 'power']] }
};
const RANGE = 0.96;

export function createRival(level) {
  return { level: LEVELS[level] || LEVELS.contender, rest: 1, burst: [], next: 0, circle: 1, circleFor: 1.5, answer: null, seen: null, hold: 0 };
}

export function think(rival, bout, dt) {
  const [him, me] = bout.fighters,
    L = rival.level,
    input = { move: [0, 0] };
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
  const coming = him.action && MOVES[him.action.name].punch && !him.action.struck ? him.action : null;
  if (coming && rival.seen !== coming.id) {
    rival.seen = coming.id;
    const roll = random(bout),
      inReach = far < MOVES[coming.name].reach + 0.15;
    rival.answer = !inReach ? null : roll < L.parry ? 'parry' : roll < L.parry + L.guard ? 'guard' : roll < L.parry + L.guard + L.slip ? 'slip' : null;
  }
  if (!coming) rival.answer = null;
  if (coming && rival.answer) {
    const until = MOVES[coming.name].contact - coming.t;
    if (rival.answer === 'guard') input.cover = true;
    else if (rival.answer === 'parry') input.cover = until < 0.1;
    else if (rival.answer === 'slip' && until < 0.1) (input.dash = [-to[0] * 0.6 + across[0] * rival.circle, -to[1] * 0.6 + across[1] * rival.circle]), (rival.answer = null);
    rival.hold = 0.12;
    return input;
  }
  if (rival.hold > 0) {
    // keep the guard up a moment after the punch has gone by
    rival.hold -= dt;
    input.cover = !me.action;
  }

  if (me.counter > 0 && far < MOVES.cross.reach - 0.05) {
    if (random(bout) < L.counter) input.power = true;
    else me.counter = 0;
    return input;
  }
  // in the middle of a burst: throw the next one as soon as the last allows
  if (rival.burst.length && rival.next <= 0 && far < MOVES.jab.reach + 0.1) {
    const what = rival.burst.shift();
    input[what] = true;
    rival.next = what === 'jab' ? 0.2 : 0.3;
    if (!rival.burst.length) rival.rest = L.rest[0] + random(bout) * (L.rest[1] - L.rest[0]);
    return input;
  }
  // footwork: close to range, hold it, circle
  const drift = far > RANGE + 0.12 ? 1 : far < RANGE - 0.14 ? -0.8 : 0;
  // (he circles slowly: the camera swings with the pair of them, and the player's stick is the camera's)
  input.move = [to[0] * drift + across[0] * rival.circle * 0.2, to[1] * drift + across[1] * rival.circle * 0.2];
  if (!rival.burst.length && rival.rest <= 0 && far < MOVES.jab.reach - 0.02 && !me.action && me.stun <= 0) {
    if (random(bout) < L.eager) {
      rival.burst = L.bursts[Math.floor(random(bout) * L.bursts.length)].slice();
      rival.next = 0;
    } else rival.rest = 0.3 + random(bout) * 0.5;
  }
  return input;
}
