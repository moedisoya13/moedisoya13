/* The technique model (docs/moves-plan-5.md §4.0, game/techniques.mjs): what a boxer carries, and when his head picks it.
   The techniques' motions are built by later stages; until one is, the head picks it only in rehearsal (createBrain(…,
   { rehearse: true })) and the bout carries its control value along and does nothing with it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle, random, incoming } from '../src/game/bout.mjs';
import { createBrain, think, PLANS } from '../src/game/brain.mjs';
import { createRival, think as rivalThinks, LEVELS as RIVALS } from '../src/game/ai.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { loadout, best, SLOTS, blank } from '../src/game/profile.mjs';
import { TECHNIQUES, BODY, define, gradeOf, opens, has, situation, comboOf, goingOf } from '../src/game/techniques.mjs';

const DT = 1 / 60;
const GRADES = ['1', '2', '3', '4m', '4a', '5m', '5a'];

// two boxers `gap` apart in their guards; o: { skills, techniques, sheets, seed }
function facing(gap, o) {
  o = o || {};
  const bout = createBout(o.seed || 7, { skills: o.skills, techniques: o.techniques, sheets: o.sheets });
  bout.fighters[0].x = -gap / 2;
  bout.fighters[1].x = gap / 2;
  settle(bout);
  return bout;
}
// the other man (boxer 1) throws: stepped until his punch is on its way, before its trunk turns (or after, `turned`)
function thrown(bout, press, turned) {
  step(bout, [{}, press], DT);
  for (let i = 0; i < 40; i++) {
    const c = incoming(bout.fighters[1]);
    if (c && !!c.chain.on[2] === !!turned) return c;
    step(bout, [{}, {}], DT);
  }
  throw new Error('no punch on its way');
}
// n fresh decisions of boxer 0's head about that one punch (each a new roll of the bout's dice): how often each answer
function answers(bout, brain, n) {
  const count = {};
  for (let i = 0; i < n; i++) {
    brain.seen = brain.answer = null;
    think(brain, bout, 0, DT);
    const a = brain.answer || 'none';
    count[a] = (count[a] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(count).map(([k, v]) => [k, v / n]));
}
// the shares of the answers a blank sheet's head gives under a plan, as brain.mjs works them out
const share = (plan, k) => ({ parry: 0.2 * k.read * plan.parry, guard: 0.32 * k.read * plan.guard, slip: 0.12 * k.read * plan.slip });
const near = (got, want, tol, what) => assert.ok(Math.abs((got || 0) - want) <= tol, `${what}: ${(got || 0).toFixed(3)} against ${want.toFixed(3)}`);
const unready = () => Object.keys(TECHNIQUES).filter(id => !TECHNIQUES[id].ready);

test('techniques: every one in the plan is registered, with the grades that open it', () => {
  const open = { pullCounter: GRADES, wave: ['4m', '5m'], parryDown: ['4m', '5m'], blockFire: ['4m', '5m'], shift: ['4m', '5m'], shell: ['4m', '5m'], crossArm: ['3', '4m', '4a', '5m', '5a'], rollCounter: ['4m', '4a', '5m', '5a'] };
  assert.deepEqual(Object.keys(TECHNIQUES).sort(), Object.keys(open).sort());
  for (const [id, grades] of Object.entries(open)) {
    assert.deepEqual([...TECHNIQUES[id].open].sort(), [...grades].sort(), id);
    for (const g of GRADES) assert.equal(opens({ all: g }, id), grades.includes(g), `${id} at ${g}`);
    assert.equal(TECHNIQUES[id].cost, 1, id);
  }
});

test('loadout: what his grades give him, his slots by his best grade, and only what his grades open', () => {
  const want = { 1: [], 2: [], 3: ['pullCounter'], '4m': ['pullCounter'], '4a': ['pullCounter', 'crossArm'], '5m': ['pullCounter'], '5a': ['pullCounter', 'crossArm'] };
  for (const g of GRADES) assert.deepEqual(loadout({ all: g }), want[g], 'default at ' + g);
  assert.deepEqual(loadout({}), ['pullCounter'], "a pro's");
  assert.deepEqual([1, 2, 3, 4, 5].map(g => SLOTS[g]), [1, 1, 2, 4, 6]);
  assert.equal(best({}), 3);
  assert.equal(best({ all: '1' }), 1);
  assert.equal(best({ all: '1', jab: '5m' }), 5);
  assert.equal(best({ stance: '4a' }), 4, 'what is not named is a pro');
  // (asked for: in its order, what fits his slots; what his grade does not open, or nobody has heard of, is left out)
  assert.deepEqual(loadout({ all: '3' }, ['shift', 'crossArm', 'pullCounter', 'wave']), ['crossArm', 'pullCounter']);
  assert.deepEqual(loadout({ all: '1' }, ['crossArm', 'pullCounter', 'pullCounter', 'nonsense']), ['pullCounter']);
  assert.deepEqual(loadout({ all: '4m' }, ['shift', 'wave', 'shell', 'parryDown', 'blockFire']), ['shift', 'wave', 'shell', 'parryDown']);
  assert.equal(loadout({ all: '5m' }, Object.keys(TECHNIQUES)).length, 6);
  // (the cross-arm guard is a form of the guard: done at the guard's grade unless his skills name it)
  assert.equal(gradeOf({ cover: '4a' }, 'crossArm').id, '4a');
  assert.deepEqual(loadout({ cover: '5a' }), ['pullCounter', 'crossArm']);
  assert.equal(gradeOf({ cover: '4a', crossArm: '3' }, 'crossArm').id, '3');
  assert.equal(gradeOf({ all: '5m', shift: '4m' }, 'shift').id, '4m');
  // (the bout gives each boxer his: asked for, or his grades')
  const bout = createBout(1, { skills: [{ all: '4a' }, { all: '2' }], techniques: [['rollCounter', 'shift']] });
  assert.deepEqual(bout.fighters.map(f => f.techniques), [['rollCounter'], []]);
  assert.ok(has(bout.fighters[0], 'rollCounter') && !has(bout.fighters[0], 'shift'));
  bout.fighters[1].techniques = ['shift'];
  assert.ok(!has(bout.fighters[1], 'shift'), 'carried by hand at a grade that does not open it');
});

/* The head's shares, a punch at a time (§4.0's table): a technique takes its part of the answer it stands in for, by the same
   roll, so the chance he does anything about the punch at all is what it was. */
test('techniques: a punch coming is answered by a technique at its share of the answer it stands in for', () => {
  const N = 1000,
    plan = PLANS.steady,
    head = (bout, rehearse) => createBrain(blank(), plan, { rehearse }),
    k = createBrain(blank(), plan).k,
    sh = share(plan, k);
  // a jab at 1 m, to a 4명 who carries the down parry and the pull counter
  {
    const bout = facing(1.0, { skills: [{ all: '4m' }, {}], techniques: [['parryDown', 'pullCounter']] });
    thrown(bout, { jab: true });
    const got = answers(bout, head(bout, true), N);
    near(got.parryDown, 0.6 * sh.parry, 0.05, 'down parry');
    near(got.parry, 0.4 * sh.parry, 0.05, 'parry');
    near(got.pullCounter, 0.5 * sh.slip, 0.05, 'pull counter');
    near(got.slip, 0.5 * sh.slip, 0.05, 'slip');
    near(got.guard, sh.guard, 0.05, 'guard');
    // (the same punch to a man without them: what he does about it at all is the same)
    const b2 = facing(1.0, { skills: [{ all: '4m' }, {}], techniques: [[]] });
    thrown(b2, { jab: true });
    const without = answers(b2, head(true), N),
      any = a => 1 - (a.none || 0);
    near(any(got), any(without), 0.03, 'defending at all, with and without');
  }
  // a straight at 1 m: the shoulder roll for a 4암; for a 5명, the down parry too, the two sharing the parries between them
  {
    const bout = facing(1.0, { skills: [{ all: '4a' }, {}], techniques: [['rollCounter']] });
    thrown(bout, { power: true });
    const got = answers(bout, head(bout, true), N);
    near(got.rollCounter, 0.6 * sh.parry, 0.05, 'roll');
    const b5 = facing(1.0, { skills: [{ all: '5m' }, {}], techniques: [['parryDown', 'rollCounter']] });
    thrown(b5, { power: true });
    const g5 = answers(b5, head(b5, true), N);
    near(g5.parryDown, 0.5 * sh.parry, 0.05, "a legend's down parry of a straight");
    near(g5.rollCounter, 0.5 * sh.parry, 0.05, 'and his roll');
    const b4 = facing(1.0, { skills: [{ all: '4m' }, {}], techniques: [['parryDown']] });
    thrown(b4, { power: true });
    assert.equal(answers(b4, head(b4, true), N).parryDown, undefined, 'a 4명 does not press a straight down');
  }
  // the shell, out of his guards, while he has the breath for it
  {
    const bout = facing(1.0, { skills: [{ all: '5m' }, {}], techniques: [['shell']] });
    thrown(bout, { jab: true });
    near(answers(bout, head(bout, true), N).shell, 0.3 * sh.guard, 0.05, 'shell');
    bout.fighters[0].stamina = 0.4 * bout.fighters[0].k.staminaMax;
    assert.equal(answers(bout, head(bout, true), N).shell, undefined, 'out of breath');
  }
  // not their situation: a hook; a jab from closer than the pull counter wants; a grade that does not open it; not built
  {
    const hook = facing(0.68, { skills: [{ all: '4m' }, {}], techniques: [['parryDown', 'pullCounter']] });
    assert.equal(thrown(hook, { power: true }).name, 'hookIn');
    const a = answers(hook, head(hook, true), N);
    assert.ok(!a.parryDown && !a.pullCounter, JSON.stringify(a));
    const close = facing(0.85, { skills: [{ all: '4m' }, {}], techniques: [['parryDown', 'pullCounter']] });
    thrown(close, { jab: true });
    const c = answers(close, head(close, true), N);
    assert.ok(c.parryDown > 0 && !c.pullCounter, JSON.stringify(c));
    const pro = facing(1.0, { skills: [{ all: '3' }, {}] });
    pro.fighters[0].techniques = ['parryDown'];
    thrown(pro, { jab: true });
    assert.equal(answers(pro, head(pro, true), N).parryDown, undefined, 'at 3');
    const built = facing(1.0, { skills: [{ all: '4m' }, {}], techniques: [['parryDown', 'pullCounter', 'shell']] });
    thrown(built, { jab: true });
    const b = answers(built, head(built, false), N);
    // (the down parry, the pull counter and the shell are built, stages F, D and G1: picked without rehearsal)
    assert.ok(b.parryDown > 0 && b.pullCounter > 0 && b.shell > 0, 'built, not rehearsed: ' + JSON.stringify(b));
    // (and one not built is not: a stand-in answer, put back as it was)
    define('unbuilt', { open: ['4m'], answer: { of: 'parry', share: 0.5, when: s => s.punch === 'jab', control: () => ({ cover: true, tech: 'unbuilt' }) } });
    built.fighters[0].techniques = ['unbuilt'];
    assert.equal(answers(built, head(built, false), N).unbuilt, undefined, 'not built, not rehearsed');
    delete TECHNIQUES.unbuilt;
  }
});

test('techniques: what the head does with the one it picked, as the punch comes', () => {
  const bout = facing(1.0, { skills: [{ all: '4m' }, {}], techniques: [['parryDown', 'pullCounter']] }),
    brain = createBrain(blank(), PLANS.steady, { rehearse: true });
  thrown(bout, { jab: true }, true);
  const seen = {};
  for (let i = 0; i < 400; i++) {
    brain.seen = brain.answer = null;
    const c = think(brain, bout, 0, DT);
    if (brain.used && brain.used.at === bout.t && c.tech) seen[c.tech] = c;
    brain.used = null;
  }
  assert.deepEqual(seen.parryDown, { move: [0, 0], cover: true, tech: 'parryDown' });
  assert.deepEqual(seen.pullCounter, { move: [0, 0], pull: true, tech: 'pullCounter' });
});

// an opening a technique has made: rolled for once, at his eye for an opening, and the counter carries the technique
test('techniques: the counter out of a technique, once for each opening', () => {
  const bout = facing(1.0, { skills: [{ all: '4a' }, {}], techniques: [['pullCounter', 'rollCounter']] }),
    brain = createBrain(blank(), PLANS.steady, { rehearse: true }),
    chance = brain.k.counter * PLANS.steady.counter,
    N = 1000;
  const counters = (prepare, fresh) => {
    let n = 0,
      last = null;
    for (let i = 0; i < N; i++) {
      prepare();
      // (resting between combinations: a punch now is the counter's)
      brain.burst = [];
      brain.rest = 9;
      if (fresh) brain.tried = null;
      const c = think(brain, bout, 0, DT);
      if (c.power) (n++, (last = c));
    }
    return { rate: n / N, last };
  };
  const t = () => bout.t;
  // the pull: the jab gone by him in the sway (he has just come out of it); and not once he is out of it
  bout.fighters[0].lastEvade = { name: 'pull', endedAt: t() };
  let r = counters(() => ((brain.used = { id: 'pullCounter', at: t() - 0.2 }), (brain.mem.by = { at: t() - 0.05, name: 'jab' })), true);
  near(r.rate, chance, 0.05, 'pull counter');
  assert.equal(r.last.tech, 'pullCounter');
  bout.fighters[0].lastEvade = { name: 'pull', endedAt: t() - 0.2 };
  r = counters(() => ((brain.used = { id: 'pullCounter', at: t() - 0.2 }), (brain.mem.by = { at: t() - 0.05, name: 'jab' })), true);
  assert.equal(r.rate, 0, 'out of the sway');
  bout.fighters[0].lastEvade = { name: 'pull', endedAt: t() };
  r = counters(() => ((brain.used = { id: 'pullCounter', at: t() - 0.2 }), (brain.mem.by = { at: t() - 0.05, name: 'jab' })), false);
  assert.ok(r.rate <= 1 / N, 'rolled for once: ' + r.rate);
  r = counters(() => ((brain.used = { id: 'pullCounter', at: t() - 0.6 }), (brain.mem.by = { at: t() - 0.5, name: 'jab' })), true);
  assert.equal(r.rate, 0, 'too late');
  // the roll: the straight met his shoulder rolling (and not if it met it standing)
  r = counters(() => ((brain.used = { id: 'rollCounter', at: t() - 0.2 }), (brain.mem.kept = { at: t() - 0.05, name: 'cross', part: 'shoulder', roll: true }), (brain.mem.by = null)), true);
  near(r.rate, chance, 0.05, 'roll counter');
  assert.equal(r.last.tech, 'rollCounter');
  r = counters(() => (brain.mem.kept = { at: t() - 0.05, name: 'cross', part: 'shoulder', roll: false }), true);
  assert.equal(r.rate, 0, 'not rolled');
  // the down parry: the bout's own opening, the counter carrying it; without it, the counter he always threw
  brain.mem.kept = null;
  r = counters(() => ((bout.fighters[0].counter = 0.5), (brain.used = { id: 'parryDown', at: t() - 0.1 })), false);
  near(r.rate, chance, 0.05, 'down parry counter');
  assert.equal(r.last.tech, 'parryDown');
  r = counters(() => ((bout.fighters[0].counter = 0.5), (brain.used = null)), false);
  assert.ok(r.rate > 0 && r.last.tech === undefined, 'a plain counter');
  bout.fighters[0].counter = 0;
  // block and fire: a hook to his body blocked, within 0.25 s (a 5명 who carries it)
  const b5 = facing(0.8, { skills: [{ all: '5m' }, {}], techniques: [['blockFire']] }),
    h5 = createBrain(blank(), PLANS.steady, { rehearse: true });
  let fired = 0;
  for (let i = 0; i < N; i++) {
    h5.tried = null;
    h5.mem.kept = { at: b5.t - 0.1, name: 'hookBody', part: 'elbow', roll: false };
    if (think(h5, b5, 0, DT).tech === 'blockFire') fired++;
  }
  near(fired / N, chance, 0.05, 'block and fire');
  h5.mem.kept = { at: b5.t - 0.1, name: 'jab', part: 'glove', roll: false };
  h5.tried = null;
  assert.equal(think(h5, b5, 0, DT).tech, undefined, 'a jab blocked is not a body hook');
});

test('techniques: the shift in place of a combination, and the wave for his feet', () => {
  const bout = facing(0.95, { skills: [{ all: '5m' }, {}], techniques: [['shift', 'wave']] }),
    [me, him] = bout.fighters,
    mind = createBrain(blank(), PLANS.steady, { rehearse: true }),
    at = (o, n) => {
      let k = 0;
      for (let i = 0; i < n; i++) k += comboOf(situation(bout, 0, mind, Object.assign({ range: 1, side: 1, iq: 0.5, plan: 'steady', roll: () => random(bout) }, o))) ? 1 : 0;
      return k / n;
    };
  him.cover = true;
  him.coverAge = 0.5;
  near(at({}, 1000), 0.15 + 0.35 * 0.5, 0.05, 'shift at a guard held up');
  near(at({ plan: 'pressure' }, 1000), (0.15 + 0.35 * 0.5) * 1.5, 0.05, 'shift under pressure');
  near(at({ iq: 0.9 }, 1000), 0.15 + 0.35 * 0.9, 0.05, 'shift, a clever head');
  him.coverAge = 0.1;
  assert.equal(at({}, 200), 0, 'nothing to shift onto');
  him.coverAge = 0.5;
  me.stamina = 0.3 * me.k.staminaMax;
  assert.equal(at({}, 200), 0, 'no breath for it');
  me.stamina = me.k.staminaMax;
  const s = situation(bout, 0, mind, { range: 1, side: 1, iq: 0.5, plan: 'steady', roll: () => 0 });
  assert.deepEqual(comboOf(s), [{ power: true, tech: 'shift', next: 0.3 }]);
  // the wave: wanting to be off at 1.3 m or more, every rest; the jab plan, half of them; never with the ropes at his back
  const wave = (o, n) => {
    let k = 0;
    for (let i = 0; i < n; i++) {
      mind.rests++;
      const c = goingOf(situation(bout, 0, mind, Object.assign({ range: 1.4, side: -1, iq: 0.5, plan: 'defend', roll: () => random(bout) }, o)));
      if (c) (k++, assert.deepEqual(c, { away: 'wave', side: -1 }));
    }
    return k / n;
  };
  assert.equal(wave({}, 200), 1);
  near(wave({ range: 1.12, plan: 'jab' }, 1000), 0.5, 0.05, 'the jab plan');
  mind.rest = 0;
  assert.equal(wave({ range: 1.12, plan: 'jab' }, 200), 0, 'the jab plan, his rest over');
  mind.rest = 1;
  assert.equal(wave({ range: 1.0, plan: 'steady' }, 200), 0);
  me.x = -2.1;
  assert.equal(wave({}, 200), 0, 'the ropes');
});

// the wave is built (stage E): a head that carries it takes it, and the bout puts him in it; not carried, never
test('techniques: a defending 4명 who carries the wave goes round in it; one who does not, never', () => {
  const go = techniques => {
    const match = createMatch({ seed: 9, skills: [{ all: '4m' }, { all: '3' }], techniques: [techniques, []], plans: [PLANS.defend, PLANS.steady], rounds: 1, roundTime: 60 }),
      seen = { asked: 0, waving: 0, circling: 0 };
    for (let i = 0; i < 360; i++) {
      const controls = [0, 1].map(w => think(match.brains[w], match.bout, w, DT));
      if (controls[0].away === 'wave') seen.asked++;
      stepMatch(match, DT, controls);
      const a = match.bout.fighters[0].action;
      if (a && a.name === 'wave') seen.waving++;
      if (a && a.name === 'hopCircle') seen.circling++;
    }
    return seen;
  };
  const carried = go(['wave']),
    not = go([]);
  assert.ok(carried.asked > 100 && carried.waving > 100 && carried.circling === 0, JSON.stringify(carried));
  assert.deepEqual(not, { asked: 0, waving: 0, circling: 0 });
});

/* Body punches are a basic move, and his sense turns a punch of a combination into one (§4.0): 0.10 + 0.30 × iq, nothing under
   iq 30, 60% after a head punch of his was blocked, never just after one has landed to the body. */
test('techniques: a punch of a combination to the body, by his sense', () => {
  const N = 1000;
  function rate(iq, prepare, rehearse = true) {
    const bout = facing(1.0, {}),
      brain = createBrain(Object.assign(blank(), { iq }), PLANS.steady, { rehearse });
    let body = 0;
    for (let i = 0; i < N; i++) {
      brain.burst = ['jab'];
      brain.next = 0;
      if (prepare) prepare(brain, bout);
      const c = think(brain, bout, 0, DT);
      assert.ok(c.jab);
      if (c.body) body++;
    }
    return body / N;
  }
  near(rate(80), 0.1 + 0.3 * 0.8, 0.05, 'iq 80');
  near(rate(50), 0.1 + 0.3 * 0.5, 0.05, 'iq 50');
  assert.equal(rate(20), 0, 'iq 20 does one thing at a time');
  assert.ok(rate(80) > rate(50));
  near(rate(80, (b, bout) => (b.mem.blocked = { at: bout.t - 0.3, name: 'jab' })), 0.6, 0.05, 'after a head punch was blocked');
  assert.equal(rate(80, (b, bout) => (b.mem.bodyAt = bout.t - 0.2)), 0, 'just after one landed to the body');
  // (the body punches are built (stage C2): outside rehearsal his head rolls for them the same way)
  assert.equal(BODY.ready, true);
  near(rate(80, null, false), 0.1 + 0.3 * 0.8, 0.05, 'iq 80, not rehearsing');
});

// the rival uses the same model: his level's numbers in place of a sheet and a plan
test('techniques: the sparring rival picks them the same way', () => {
  const bout = createBout(5, { skills: [{}, { all: '4m' }], techniques: [[], ['parryDown']] });
  bout.fighters[0].x = -0.5;
  bout.fighters[1].x = 0.5;
  settle(bout);
  // (here the rival is boxer 1, and boxer 0 throws at him)
  step(bout, [{ jab: true }, {}], DT);
  while (!incoming(bout.fighters[0])) step(bout, [{}, {}], DT);
  const rival = createRival('champion', { rehearse: true }),
    n = 1000;
  let k = 0;
  for (let i = 0; i < n; i++) {
    rival.seen = rival.answer = null;
    rivalThinks(rival, bout, DT);
    if (rival.answer === 'parryDown') k++;
  }
  near(k / n, 0.6 * RIVALS.champion.parry, 0.05, "the rival's down parry");
});

/* A bout is the same with techniques that are not built as without them (§4.0, test 2: the default loadouts fight the match
   they fought before there were techniques); in rehearsal, a technique not carried never comes out, nor one carried at a grade
   that does not open it; the same seed is the same match, another seed another. */
function fight(seed, o, steps) {
  const match = createMatch(Object.assign({ seed, rounds: 1, roundTime: 600 }, o)),
    techs = [[], []];
  let events = '';
  // (through a count, too: a man put down on a knee, by the body punches since stage C2 as well, gets up and they go on)
  for (let i = 0; i < steps && (match.phase === 'fight' || match.phase === 'count'); i++) {
    const controls = [0, 1].map(w => think(match.brains[w], match.bout, w, DT));
    controls.forEach((c, w) => (c.tech || c.body || c.away === 'wave') && techs[w].push(c.tech || (c.body ? 'body' : 'wave')));
    stepMatch(match, DT, controls);
    events += match.events.map(e => e.type + (e.name || '') + (e.J || '') + (e.who ?? '')).join(',') + ';';
  }
  return { events, techs, match };
}

test('techniques: not built, they change nothing; rehearsed, only what he carries and can do comes out', () => {
  const sheets = [Object.assign(blank(), { defense: 90, iq: 90 }), blank()],
    skills = [{ all: '5m' }, { all: '4a' }],
    ready = list => list.filter(id => TECHNIQUES[id].ready);
  // (a brain called twice in a step would think twice: the match's own brains are the ones asked here, through stepMatch's inputs)
  const all = [loadout(skills[0], Object.keys(TECHNIQUES)), loadout(skills[1], Object.keys(TECHNIQUES))];
  const a = fight(21, { sheets, skills, techniques: all, plans: [PLANS.counter, PLANS.pressure] }, 2000),
    b = fight(21, { sheets, skills, techniques: all.map(ready), plans: [PLANS.counter, PLANS.pressure] }, 2000),
    c = fight(21, { sheets, skills, plans: [PLANS.counter, PLANS.pressure] }, 2000),
    d = fight(21, { sheets, skills, techniques: [ready(loadout(skills[0])), ready(loadout(skills[1]))], plans: [PLANS.counter, PLANS.pressure] }, 2000);
  assert.ok(a.events.length > 2000);
  assert.equal(a.events, b.events, 'all of them carried, none built, against only the built ones');
  assert.equal(c.events, d.events, 'the loadouts their grades give them, against only the built ones of those');
  // (the body punches are built and are no technique: everyone throws them, stage C2)
  assert.deepEqual(a.techs.map(l => l.filter(t => t !== 'body' && !(TECHNIQUES[t] && TECHNIQUES[t].ready))), [[], []], 'nothing not built comes out');
  /* rehearsed: a 4명 who carries three (the shift not built yet; pressing a pro who keeps his guard up, where it comes out),
     against a pro who asked for three his grade does not open */
  const LOAD = [['parryDown', 'pullCounter', 'shift'], ['shift', 'parryDown', 'shell']];
  const r = fight(33, { sheets, skills: [{ all: '4m' }, { all: '3' }], techniques: LOAD, plans: [PLANS.pressure, PLANS.defend], rehearse: true }, 2000),
    carried = new Set(r.techs[0]);
  assert.deepEqual(r.match.bout.fighters[1].techniques, []);
  assert.deepEqual(r.techs[1].filter(t => t !== 'body'), [], 'nothing his grade does not open');
  /* (one he carries whose motion is not built came out: the rehearsal is what let it. Which one depends on the course of the
     match, and the body punches, built since, change that course: stage C2) */
  assert.ok([...carried].some(t => TECHNIQUES[t] && !TECHNIQUES[t].ready), 'he did use one: ' + [...carried]);
  for (const t of carried) assert.ok(['parryDown', 'pullCounter', 'shift', 'body'].includes(t), t);
  // (the same seed: the same match; another seed: another)
  const again = fight(33, { sheets, skills: [{ all: '4m' }, { all: '3' }], techniques: LOAD, plans: [PLANS.pressure, PLANS.defend], rehearse: true }, 2000),
    other = fight(34, { sheets, skills: [{ all: '4m' }, { all: '3' }], techniques: LOAD, plans: [PLANS.pressure, PLANS.defend], rehearse: true }, 2000);
  assert.equal(again.events, r.events);
  assert.deepEqual(again.techs, r.techs);
  assert.notEqual(other.events, r.events);
});

// a later stage adds its technique as one entry, and the head picks it where the entry says
test('techniques: a stage adds one entry, and the head picks it', () => {
  define('feint', { name: 'test', open: ['3'], ready: true, answer: { of: 'guard', share: 1, when: s => s.punch === 'jab', control: () => ({ cover: true, tech: 'feint' }) } });
  try {
    const bout = facing(1.0, { techniques: [['feint']] }),
      brain = createBrain(blank(), PLANS.steady),
      sh = share(PLANS.steady, brain.k);
    assert.deepEqual(bout.fighters[0].techniques, ['feint']);
    thrown(bout, { jab: true });
    const got = answers(bout, brain, 1000);
    near(got.feint, sh.guard, 0.05, 'all of his guards');
    assert.equal(got.guard, undefined);
  } finally {
    delete TECHNIQUES.feint;
  }
});
