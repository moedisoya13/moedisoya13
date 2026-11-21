/* A boxer's head: what he decides to do, from what he can see. Either corner can have one; it reads the same state the
   picture is drawn from and works the same controls a player would.
     const brain = createBrain(sheet, plan, o?) sheet: profile.mjs; plan: one of PLANS (his corner's instruction);
                                                 o.rehearse: he picks techniques whose motion is not built yet, too
     brain.plan = PLANS.pressure                 the corner changes it between rounds
     think(brain, bout, who, dt) -> controls     for boxer `who`
   Two things shape every decision. Who he is: his defence and his ring sense decide how often he reads a punch coming,
   his ring sense how he strings punches together and whether he takes the openings he is given, and how well he paces
   himself. And what he has been told: the plan sets where he wants to stand, how eager he is, what he throws, and how much
   he gives to defence. A tired boxer with good sense backs off and breathes whatever he has been told.
   The techniques he carries (game/techniques.mjs, his bout's f.techniques) come in at the same places: a punch seen coming,
   an opening, the start of a combination, his feet; and he turns a punch of a combination to the body by his sense. Each
   adds to his controls (tech, body, away: 'wave'), and each rolls the bout's dice only when it is in its situation. */
import { MOVES } from '../anim/moves.mjs';
import { random, incoming } from './bout.mjs';
import { body, fatigue } from './profile.mjs';
import { TECHNIQUES, memory, observe, situation, answerOf, counterOf, openingOf, comboOf, goingOf, bodyOf } from './techniques.mjs';

/* The corner's instructions. range: metres, centre to centre, he wants to be at. eager: how often, given a chance, he
   starts throwing. rest: seconds he waits between his combinations. mix: how he likes to start them (jab, or power).
   guard, parry, slip: what he does with a punch he reads coming, against his habit. circle: how much he moves round. */
export const PLANS = {
  steady: {
    id: 'steady', name: '침착하게', line: '네 박자대로 가.', note: '평소대로. 거리를 잡고 기회가 오면 칩니다.',
    range: 1.0, eager: 0.6, rest: [0.55, 1.15], jab: 0.55, guard: 1, parry: 1, slip: 1, counter: 1, circle: 0.2
  },
  jab: {
    id: 'jab', name: '잽으로 거리', line: '잽, 잽. 들어오게 두지 마.', note: '잽 사거리 끝에 서서 잽을 많이 던집니다. 맞기 어렵고 점수는 꾸준합니다.',
    range: 1.12, eager: 0.72, rest: [0.35, 0.8], jab: 0.85, guard: 1.1, parry: 1, slip: 1.2, counter: 0.9, circle: 0.35
  },
  pressure: {
    id: 'pressure', name: '압박해', line: '붙어! 숨 쉴 틈 주지 마.', note: '안으로 파고들어 강타를 섞어 몰아칩니다. 지구력을 많이 씁니다.',
    range: 0.86, eager: 0.88, rest: [0.2, 0.55], jab: 0.3, guard: 0.75, parry: 0.8, slip: 0.6, counter: 1.1, circle: 0.1
  },
  counter: {
    id: 'counter', name: '받아쳐', line: '먼저 나가지 마. 던지면 받아.', note: '먼저 치지 않고 기다립니다. 패리와 카운터가 크게 늘어납니다.',
    range: 1.04, eager: 0.25, rest: [1.0, 1.8], jab: 0.6, guard: 1.3, parry: 1.7, slip: 1.2, counter: 1.4, circle: 0.25
  },
  defend: {
    id: 'defend', name: '가드 올려', line: '턱 당기고 버텨.', note: '거리를 벌리고 가드를 굳힙니다. 덜 맞지만 점수도 덜 얻습니다.',
    range: 1.3, eager: 0.2, rest: [1.1, 2.0], jab: 0.8, guard: 1.8, parry: 1.2, slip: 1.3, counter: 0.8, circle: 0.4
  },
  breathe: {
    id: 'breathe', name: '숨 골라', line: '돌아. 이번 라운드는 버티기만 해.', note: '밖으로 돌며 거의 치지 않습니다. 지구력이 회복됩니다.',
    range: 1.65, eager: 0.08, rest: [1.5, 2.6], jab: 1, guard: 1.3, parry: 1, slip: 1.5, counter: 0.6, circle: 0.6
  },
  allin: {
    id: 'allin', name: '다 쏟아부어', line: '지금이야. 끝내!', note: '수비를 버리고 강타 콤비네이션을 쏟아냅니다. 맞히면 끝나고, 못 맞히면 지칩니다.',
    range: 0.84, eager: 1, rest: [0.08, 0.3], jab: 0.15, guard: 0.4, parry: 0.5, slip: 0.4, counter: 1.2, circle: 0
  }
};

// what he can do with a punch he sees coming, at full reading (read = 1)
const ANSWER = { parry: 0.2, guard: 0.32, slip: 0.12 };

/* The combinations a boxer knows, by how much sense he has. A novice throws one punch at a time; a clever boxer doubles his
   jab, follows it with the cross, and runs the whole chain. One he would start with a power punch may be a technique's
   instead (techniques.mjs: combination). */
function combination(brain, bout, s) {
  const iq = (brain.sheet.iq ?? 50) / 100,
    jabFirst = random(bout) < brain.plan.jab,
    long = random(bout) < 0.2 + 0.7 * iq,
    longer = random(bout) < 0.1 + 0.55 * iq * iq;
  if (jabFirst) return long ? (longer ? ['jab', 'jab', 'power'] : random(bout) < 0.5 ? ['jab', 'power'] : ['jab', 'jab']) : ['jab'];
  return comboOf(s) || (long ? (longer ? ['power', 'power', 'power'] : ['power', 'power']) : ['power']);
}

/* (for the techniques, techniques.mjs: mem, what his head keeps of what has happened; used, the technique he answered the last
   punch with ({ id, of, at, hold }); holding, the one he keeps at after the punch has gone by; tried, the last opening he
   rolled for; rests, the rests between combinations he has had; going, how he goes round in this one) */
export function createBrain(sheet, plan, o) {
  return { sheet, k: body(sheet), plan: plan || PLANS.steady, rest: 1, burst: [], next: 0, circle: 1, circleFor: 1.5, answer: null, seen: null, hold: 0, mem: memory(), used: null, holding: null, tried: null, rests: 0, going: null, rehearse: !!(o && o.rehearse) };
}

export function think(brain, bout, who, dt) {
  const me = bout.fighters[who],
    him = bout.fighters[1 - who],
    plan = brain.plan,
    k = brain.k,
    input = { move: [0, 0] };
  observe(brain.mem, bout, who);
  if (bout.over !== null || me.down || him.down) return input;
  const dx = him.x - me.x,
    dz = him.z - me.z,
    far = Math.hypot(dx, dz) || 1,
    to = [dx / far, dz / far],
    across = [to[1], -to[0]],
    fresh = fatigue(me),
    // a tired boxer who knows himself backs off and throws less, whatever he has been told
    sense = Math.min(1, k.patience),
    eager = plan.eager * (1 - sense * 0.6 * (1 - fresh)),
    range = plan.range + sense * 0.35 * (1 - fresh);
  brain.rest -= dt;
  brain.next -= dt;
  brain.circleFor -= dt;
  if (brain.circleFor <= 0) {
    brain.circle = [-1, 0, 0, 1][Math.floor(random(bout) * 4)];
    brain.circleFor = 0.8 + random(bout) * 1.6;
  }

  // ---- a punch is on its way: decide once what to do about it
  const coming = incoming(him),
    s = situation(bout, who, brain, { coming, range, side: brain.circle, iq: (brain.sheet.iq ?? 50) / 100, plan: plan.id, roll: () => random(bout) });
  if (coming && brain.seen !== coming.id) {
    brain.seen = coming.id;
    const roll = random(bout),
      inReach = far < MOVES[coming.name].reach + 0.25,
      parry = ANSWER.parry * k.read * plan.parry,
      guard = ANSWER.guard * k.read * plan.guard,
      slip = ANSWER.slip * k.read * plan.slip;
    // (a technique he carries for it takes its part of one of these, by the same roll: techniques.mjs, answer)
    brain.answer = !inReach ? null : answerOf(s, roll, [['parry', parry], ['guard', guard], ['slip', slip]]);
    const t = TECHNIQUES[brain.answer];
    if (t) brain.used = { id: t.id, of: coming.id, at: bout.t, hold: t.answer.hold ? t.answer.hold(s) : 0.12 };
  }
  if (!coming) brain.answer = null;
  if (coming && brain.answer) {
    // he reads the punch off the body: once the trunk has started to turn, the fist is a few hundredths of a second away
    const soon = coming.chain.on[2],
      t = TECHNIQUES[brain.answer];
    if (t) {
      // (the technique's own way with it)
      Object.assign(input, t.answer.control(s));
      if (t.answer.once && soon) brain.answer = null;
    } else if (brain.answer === 'guard') input.cover = true;
    else if (brain.answer === 'parry') input.cover = soon;
    else if (brain.answer === 'slip' && soon) {
      /* the head goes off the line, to the outside of the punching hand: a straight from his left is slipped to his own
         right, and the other way round; a hook is ducked under (to the side it comes from is where the fist goes) */
      const left = MOVES[coming.name].hand === 'L';
      input.slip = MOVES[coming.name].kind === 'hook' ? (left ? 1 : -1) : left ? -1 : 1;
      brain.answer = null;
    }
    brain.hold = t ? brain.used.hold : 0.12;
    brain.holding = t ? t.id : null;
    return input;
  }
  if (brain.hold > 0) {
    // keep the guard up a moment after the punch has gone by (or keep at the technique he answered it with, its own way)
    brain.hold -= dt;
    input.cover = !me.action;
    const t = brain.holding && TECHNIQUES[brain.holding];
    if (t && t.answer.held) Object.assign(input, t.answer.held(s));
  }

  // ---- an opening: take it (with the technique that made it, if one did)
  if (me.counter > 0 && far < MOVES.cross.reach) {
    if (random(bout) < k.counter * plan.counter) (input.power = true), Object.assign(input, counterOf(s));
    else me.counter = 0;
    return input;
  }
  // (an opening a technique of his has made that the bout does not mark as one: once for each)
  const made = openingOf(s);
  if (made && made.key !== brain.tried) {
    brain.tried = made.key;
    if (random(bout) < k.counter * plan.counter) {
      if (brain.holding) (brain.hold = 0), (brain.holding = null);
      return Object.assign(input, TECHNIQUES[made.id].counter(s));
    }
  }
  // ---- in the middle of a combination: the next punch as soon as the last allows (to the body, by his sense)
  if (brain.burst.length && brain.next <= 0 && far < MOVES.jab.reach + 0.1) {
    const what = brain.burst.shift();
    if (typeof what === 'string') {
      input[what] = true;
      if (bodyOf(s)) input.body = true;
      brain.next = what === 'jab' ? 0.2 : 0.3;
    } else {
      const { next, ...press } = what;
      Object.assign(input, press);
      brain.next = next ?? 0.3;
    }
    if (!brain.burst.length) (brain.rest = (plan.rest[0] + random(bout) * (plan.rest[1] - plan.rest[0])) * (1 + (1 - fresh) * sense)), brain.rests++;
    return input;
  }
  // ---- footwork: to his range, and round
  const drift = far > range + 0.1 ? 1 : far < range - 0.16 ? -0.8 : 0;
  input.move = [to[0] * drift + across[0] * brain.circle * plan.circle, to[1] * drift + across[1] * brain.circle * plan.circle];
  // a boxer who has been told to defend, or is getting his breath, keeps his hands up while he waits
  if (plan.guard > 1.25 && !brain.burst.length && random(bout) < 0.5) input.cover = true;
  // (or goes round the way a technique of his does it, the hands let down: techniques.mjs, move)
  const going = brain.burst.length ? null : goingOf(s);
  if (going) Object.assign(input, going, { cover: false });
  if (!brain.burst.length && brain.rest <= 0 && far < MOVES.jab.reach - 0.05 && !me.action && me.stun <= 0) {
    if (random(bout) < eager) {
      brain.burst = combination(brain, bout, s);
      brain.next = 0;
    } else brain.rest = 0.3 + random(bout) * 0.5;
  }
  return input;
}
