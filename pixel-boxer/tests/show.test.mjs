/* The showy dirty fighter (docs/moves-plan-4.md §5, anim/show.mjs): at 4암 and 5암 only, and nothing of it at any other grade.
   Each technique is held to showing at the right grades, to being the same for the same seed, and to doing what the plan
   says it does, measured on the bout. The cross-arm guard and the shoulder roll (docs/moves-plan-5.md §4A) are techniques a
   man carries (game/techniques.mjs: crossArm from 3 up, by default the dirty great ones'; rollCounter from 4 up), held to
   the plan's §4A.10, and the roll & counter to §4A.7. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, crossOf, RULES } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW, CROSS_BODY, CROSS_BODY_ROWS, ROLLING } from '../src/defense.mjs';
import { LEVELS, LEVEL, CROSS, ROLL } from '../src/anim/skill.mjs';
import { aimAt } from '../src/bodyshots.mjs';
import { where, balls } from '../src/game/trunk.mjs';
import { local } from '../src/game/bout.mjs';
import { audit, measure, JUMP } from '../src/audit.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import { run, rung } from '../src/measure.mjs';
import { STANCES, SHOWOFF, TAUNTING, AT } from '../src/ladder.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import * as M from '../src/rig/m3.mjs';
import { createBout, settle } from '../src/game/bout.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { choose, COLLAR } from '../src/anim/show.mjs';
import { GLOVE, HEAD } from '../src/rig/body.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { createChain, stepChain } from '../src/phys/chain.mjs';
import { dice } from '../src/anim/stance.mjs';

const DT = 1 / 60;
const SHOW = ['4a', '5a'];
const others = LEVELS.filter(lv => !SHOW.includes(lv));

// a bout from a script, stepped through, with what happened each step and both men as they were
function fight(e, each) {
  const bout = freshBout(e),
    out = [];
  for (let t = 0; t < Math.round(e.loop / DT); t++) {
    step(bout, drive(e, bout, t * DT, DT), DT);
    bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 50);
    bout.fighters[1].hp = 1000;
    if (each) each(bout, t);
    for (const ev of bout.events) out.push(Object.assign({ tick: t }, ev));
  }
  return out;
}
/* the other man throws `punch` (as the defence cards throw it) into his guard, held from early on (or put up k frames after
   the press; or, roll: put up k frames after it meant as a shoulder roll, game/techniques.mjs rollCounter). tech: what he
   carries (left out: what his grade gives him) */
const into = (lv, punch, o = {}) => {
  const at = { jab: 0.8, cross: 0.8, hook: 1.1, upper: 1.3 }[punch],
    from = o.roll !== undefined ? o.roll : o.k;
  return {
    id: `into-${punch}@${lv}${o.roll !== undefined ? ' roll ' + o.roll : o.k !== undefined ? ' k ' + o.k : ''}${o.tech ? ' ' + o.tech.join('+') : ''}`,
    loop: at + 0.8,
    me: () => HOME,
    him: () => [HOME[0] + (o.range || RANGE[punch]), HOME[1]],
    against: THROW[punch].map(([dt, b]) => [at + dt, b]),
    press: o.roll !== undefined ? [[at + o.roll * DT, 'tech', 'rollCounter']] : [],
    // (a roll's guard is kept up as long as the arm it rolled is held out there: half a second)
    cover: from !== undefined ? t => t >= at + from * DT - 1e-9 && t < at + (o.roll !== undefined ? 0.5 : 0.4) : t => t > 0.2,
    setup: b => {
      b.fighters[0].skills = { all: lv };
      if (o.tech) b.fighters[0].techniques = o.tech;
    }
  };
};
const last = (events, name) => events.filter(e => e.who === 1 && e.name === name && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)).concat(events.filter(e => e.type === 'parry' && e.on === 1 && e.name === name)).pop();

test('show: the show-off\'s stance and the hammer are the dirty great ones\' alone; the cross-arm guard is carried', () => {
  for (const lv of SHOW) assert.ok(LEVEL[lv].stance.show && CROSS[lv].hammer, lv);
  for (const lv of others) assert.ok(!LEVEL[lv].stance.show && !(CROSS[lv] && CROSS[lv].hammer), lv);
  // (what his grade gives him: the dirty great ones carry the cross-arm guard, nobody else)
  const holds = (lv, tech) => {
    const b = createBout(1, { skills: [{ all: lv }, {}], techniques: [tech] });
    return crossOf(b.fighters[0]);
  };
  for (const lv of LEVELS) assert.equal(holds(lv), SHOW.includes(lv) ? CROSS[lv] : null, lv);
  // (given it, a pro and the clean great ones hold their grade's; a beginner and an amateur cannot; taken off a dirty one, none)
  for (const lv of LEVELS) assert.equal(holds(lv, ['crossArm']), lv === '1' || lv === '2' ? null : CROSS[lv], lv);
  for (const lv of SHOW) assert.equal(holds(lv, []), null, lv);
});

test('show: the stance lets the lead hand down to the waist (it swings), the rear hand stays at the chin', () => {
  const at = lv => {
    const { frames } = run(STANCES.find(e => e.id === `stance@${lv}`), 4),
      live = frames.slice(60),
      mean = k => live.reduce((s, f) => s + f.gloves[k][1], 0) / live.length,
      z = live.map(f => f.gloves.L[2]);
    return { lead: mean('L'), rear: mean('R'), head: live.reduce((s, f) => s + f.headY, 0) / live.length, swing: Math.max(...z) - Math.min(...z) };
  };
  const pro = at('3');
  for (const lv of SHOW) {
    const s = at(lv);
    assert.ok(pro.lead - s.lead >= 0.2, `${lv}: the lead glove ${((pro.lead - s.lead) * 100).toFixed(1)} cm under a pro's`);
    assert.ok(s.head - s.rear < 0.25 && s.head - s.rear > 0, `${lv}: the rear glove ${((s.head - s.rear) * 100).toFixed(1)} cm under the head`);
    assert.ok(s.swing > 0.02, `${lv}: the lead hand swings ${(s.swing * 100).toFixed(1)} cm`);
  }
});

test('show: the stance is the same for the same seed', () => {
  const once = () => run(STANCES.find(e => e.id === 'stance@4a'), 3).frames.map(f => f.gloves.L.map(v => +v.toFixed(6)));
  assert.deepEqual(once(), once());
});

/* ---- the cross-arm guard (docs/moves-plan-5.md §4A.2): the classic one. Measured on a guard held up a second, in his own
   body's terms (the pose's), against the same man standing as he does without it. */
const GUARDS = ['3', '4m', '4a', '5m', '5a'];
const shapes = {};
function shape(lv, cover, tech) {
  const key = `${lv} ${cover} ${tech}`;
  if (shapes[key]) return shapes[key];
  const bout = freshBout({ me: () => HOME, him: () => [HOME[0] + 1.0, HOME[1]], setup: b => ((b.fighters[0].skills = { all: lv }), tech && (b.fighters[0].techniques = tech)) }),
    a = bout.fighters[0],
    seen = [];
  for (let i = 0; i < 90; i++) {
    step(bout, [{ cover: cover && i > 10 }, {}], DT);
    if (i < 60) continue;
    const { R, p } = fk(a.pose),
      head = M.add(p.Head, M.app(R.Head, [0, 0.1, 0.02])),
      glove = S => M.add(p[S + 'Hand'], M.scale(M.sub(p[S + 'Hand'], p[S + 'ForeArm']), 0.075 / Math.hypot(...M.sub(p[S + 'Hand'], p[S + 'ForeArm'])))),
      L = glove('Left'),
      fore = M.sub(L, p.LeftForeArm),
      angles = measure(a).angles;
    seen.push({
      rear: M.sub(glove('Right'), head),
      level: (Math.atan2(fore[1], Math.hypot(fore[0], fore[2])) * 180) / Math.PI,
      lead: [L[1], p.LeftForeArm[1]],
      waist: p.Spine1[1],
      chest: p.Chest[1],
      shoulder: p.LeftArm[1] - head[1],
      line: (Math.atan2(p.LeftArm[2] - p.RightArm[2], p.LeftArm[0] - p.RightArm[0]) * 180) / Math.PI,
      zone: ['Left', 'Right'].map(S => angles[S + 'ShoulderZone'] + angles[S + 'ShoulderTurned'])
    });
  }
  const mean = k => (Array.isArray(seen[0][k]) ? seen[0][k].map((_, i) => seen.reduce((t, f) => t + f[k][i], 0) / seen.length) : seen.reduce((t, f) => t + f[k], 0) / seen.length);
  return (shapes[key] = Object.fromEntries(Object.keys(seen[0]).map(k => [k, mean(k)])));
}
test('cross-arm guard: the rear glove at the chin, the lead forearm level across the belly, side on behind a raised lead shoulder', () => {
  for (const lv of GUARDS) {
    const tech = SHOW.includes(lv) ? null : ['crossArm'],
      up = shape(lv, true, tech),
      bare = shape(lv, false, tech),
      cm = x => (x * 100).toFixed(1);
    // the rear glove within 23 cm of the middle of his head, at his chin (5 to 13 cm under the middle)
    assert.ok(Math.hypot(...up.rear) <= 0.23, `${lv}: the rear glove ${cm(Math.hypot(...up.rear))} cm from his head`);
    assert.ok(up.rear[1] <= -0.05 && up.rear[1] >= -0.13, `${lv}: the rear glove ${cm(up.rear[1])} cm under it`);
    // the lead forearm level (12 degrees), the glove and the elbow between his waist and his chest
    assert.ok(Math.abs(up.level) <= 12, `${lv}: the lead forearm ${up.level.toFixed(1)}° off level`);
    for (const y of up.lead) assert.ok(y > up.waist && y < up.chest, `${lv}: ${cm(y)} cm high, the waist ${cm(up.waist)}, the chest ${cm(up.chest)}`);
    // the lead shoulder up toward his chin: 3 cm nearer his head than as he stands without it (a dirty great one's show stance)
    assert.ok(up.shoulder - bare.shoulder >= 0.03, `${lv}: the lead shoulder ${cm(up.shoulder - bare.shoulder)} cm up`);
    // side on: the shoulders 9 degrees and more further round than without it
    assert.ok(up.line - bare.line >= 9, `${lv}: closed ${(up.line - bare.line).toFixed(1)}°`);
    // (and no arm anywhere the shoulder cannot put it)
    assert.ok(Math.max(...up.zone) <= 0, `${lv}: ${up.zone}`);
  }
  // a great dirty fighter's lead forearm is the higher, 4 cm and more (its middle: the glove and the elbow)
  const mid = lv => (shape(lv, true, null).lead[0] + shape(lv, true, null).lead[1]) / 2,
    four = mid('4a'),
    five = mid('5a');
  assert.ok(four - five >= 0.04, `4a ${(four * 100).toFixed(1)}, 5a ${(five * 100).toFixed(1)} cm`);
});

/* How it meets each punch (§4A.3): a jab, a cross, a lead hook and an uppercut into it held up, all blocked; the uppercut
   by the rear glove (the plan's fourth edition had it come up under the crossed forearms and land: the classic guard is
   closed in the middle). And a dirty great one who does not carry it holds the guard a clean great one does. */
const nearer = (bout, hand) => {
  const [a, b] = bout.fighters,
    g = b.points[hand];
  return Math.hypot(...M.sub(g, a.points.R)) < Math.hypot(...M.sub(g, a.points.L)) ? 'R' : 'L';
};
test('cross-arm guard: a jab, a cross, a lead hook and an uppercut are blocked, the uppercut by the rear glove', () => {
  for (const lv of GUARDS)
    for (const p of ['jab', 'cross', 'hook', 'upper']) {
      let by = null;
      const tech = SHOW.includes(lv) ? null : ['crossArm'],
        ev = fight(into(lv, p, { tech }), bout => {
          const e = bout.events.find(x => x.type === 'block' && x.who === 1);
          if (e && e.name === p) by = nearer(bout, MOVES[p].hand);
        }),
        e = last(ev, p);
      assert.equal(e && e.type, 'block', `${p}@${lv}: ${JSON.stringify(e)}`);
      assert.ok(['glove', 'forearm', 'shoulder'].includes(e.part), `${p}@${lv}: met by the ${e.part}`);
      if (p === 'upper') assert.equal(by, 'R', `upper@${lv}: met nearer his ${by} glove`);
    }
  // (the same man without it: a dirty great one holds a clean great one's high guard, and turns the jab aside as one does)
  for (const lv of SHOW) {
    const e = fight(into(lv, 'jab', { range: 1.0, k: WINDOWS.parry[lv[0] + 'm'].at, tech: [] })).find(x => x.type === 'parry');
    assert.ok(e && !e.hammer, `${lv} without it: ${JSON.stringify(e)}`);
  }
});

/* ---- the shoulder roll (§4A.4): the guard put up meant as rollCounter, k frames after the cross is pressed. A cross that
   meets the lead shoulder while his chest is turning away is rolled off it (part 'shoulder', roll: true); the frames either
   side of the window are not; the roll lets less through than the same guard put up at the same moment and not rolled, a
   legend's roll leaves less room than a great one's, and the cross is held out where it was stopped, tied up. */
const ROLLERS = ['4m', '4a', '5m', '5a'];
const rolls = {};
function rollAt(lv, k, tech = ['crossArm', 'rollCounter']) {
  const key = `${lv} ${k} ${tech}`;
  if (rolls[key]) return rolls[key];
  let tied = null;
  const ev = fight(into(lv, 'cross', { roll: k, tech }), bout => {
    const b = bout.fighters[1];
    if (b.action && b.action.rolled && b.action.chain.phase !== 'recover' && b.action.chain.phase !== 'done') tied = (tied || 0) + DT;
  });
  return (rolls[key] = { e: last(ev, 'cross'), tied, rolled: ev.some(x => x.type === 'roll' && x.who === 0) });
}
const rolled = r => !!(r.e && r.e.type === 'block' && r.e.part === 'shoulder' && r.e.roll === true);
function rollWindow(lv) {
  const ks = [];
  for (let k = -4; k <= 9; k++) if (rolled(rollAt(lv, k))) ks.push(k);
  return ks;
}
test('shoulder roll: a cross rolled off the lead shoulder, in a window of frames; tied up; softer than the same guard unrolled', () => {
  const at = {};
  for (const lv of ROLLERS) {
    const ks = rollWindow(lv);
    assert.ok(ks.length >= 1, `${lv}: no frame rolls it`);
    assert.ok(!rolled(rollAt(lv, ks[0] - 1)) && !rolled(rollAt(lv, ks[ks.length - 1] + 1)), `${lv}: ${ks}`);
    const mid = ks[Math.floor((ks.length - 1) / 2)],
      r = rollAt(lv, mid);
    at[lv] = r.e;
    // (the cross held out where it was stopped, and the rest of him carried on after it: tied up 0.3 s)
    assert.ok(r.tied >= 0.25, `${lv}: tied up ${r.tied}`);
    // (the same frame, the same guard put up without meaning it as a roll: no roll)
    const plain = last(fight(into(lv, 'cross', { k: mid, tech: ['crossArm', 'rollCounter'] })), 'cross');
    assert.ok(!rolled({ e: plain }), `${lv}: rolled without rolling: ${JSON.stringify(plain)}`);
  }
  /* (rolled as late as it can be, the chest turning away the fastest as it gets there, the cross lets less through than the
     same cross taken on the rear glove of his guard held up, a dirty great one's and a dirty legend's: the shoulder going
     away from it. Earlier in the window it can be more: README, the numbers) */
  for (const lv of SHOW) {
    const ks = rollWindow(lv),
      late = rollAt(lv, ks[ks.length - 1]).e,
      held = last(fight(into(lv, 'cross')), 'cross');
    assert.ok(held && held.type === 'block' && late.J < held.J, `${lv}: rolled ${late.J} N·s, on the guard ${held && held.J}`);
  }
  // (a legend goes as far as he has to: less room between the glove and his head than a great one leaves)
  assert.ok(at['5a'].margin < at['4a'].margin, `margin 4a ${at['4a'].margin}, 5a ${at['5a'].margin}`);
  // a pro's grade does not open it: meant as a roll, his guard does not roll
  for (let k = 0; k <= 6; k++) assert.ok(!rolled(rollAt('3', k)) && !rollAt('3', k).rolled, `3: frame ${k}`);
});
test('shoulder roll: a shoulder standing still takes it unrolled; and the rolls are within the physics audit', () => {
  // (rolled too early, the chest has finished turning by the time the cross gets there: on the shoulder, not rolled)
  const early = rollAt('4a', -1).e;
  assert.ok(early && early.type === 'block' && early.part === 'shoulder' && early.roll === false, JSON.stringify(early));
  const scripts = [
    ...GUARDS.flatMap(lv => ['jab', 'cross', 'hook', 'upper'].map(p => into(lv, p, { tech: SHOW.includes(lv) ? null : ['crossArm'] }))),
    ...ROLLERS.flatMap(lv => rollWindow(lv).map(k => into(lv, 'cross', { roll: k, tech: ['crossArm', 'rollCounter'] }))),
    ...ROLLERS.map(lv => into(lv, 'cross', { roll: 3, tech: ['rollCounter'] }))
  ];
  const { found } = audit(scripts),
    broken = Object.entries(found)
      .filter(([, c]) => c.bad)
      .map(([check, c]) => `${check}: ${c.bad} (${JSON.stringify(c.cases.slice(0, 2))})`);
  assert.deepEqual(broken, []);
});
test('cross-arm guard and roll: the same script goes the same way', () => {
  const once = () => fight(into('5a', 'cross', { roll: rollWindow('5a')[0], tech: ['crossArm', 'rollCounter'] })).map(e => `${e.tick} ${e.type} ${e.J ?? ''} ${e.part ?? ''}`);
  assert.deepEqual(once(), once());
});

/* ---- the roll & counter (§4A.7, stage H2): out of a roll that has rolled the cross off his shoulder, a power press meant as
   rollCounter (the head presses it on the step after: game/techniques.mjs) is the rear hook, the roll its wind-up (skill.mjs
   ROLL counter: 4 0.7, 5 all of it, after the weight has come forward off the rear leg); it lands on his head as a counter
   while the arm he rolled is still held out there, 0.18-0.26 s (4) and 0.13-0.20 s (5) after the shoulder met the cross (on
   the bout's clock), with the cross-arm guard or without it, and 40 ms and more sooner than the same counter with nothing of
   it wound up. Out of a roll that rolled nothing, the same press is the plain rear hook. */
const COUNTER_TIME = { 4: [0.18, 0.26], 5: [0.13, 0.2] };
function rollCounter(lv, k, tech, o = {}) {
  const e = into(lv, 'cross', { roll: k, tech });
  e.loop = 2;
  // (the counter, once, on the step after the cross has met him: as the head presses it, or o.press in its place)
  e.cue = bout => {
    const f = bout.fighters[0],
      own = (f.cues = f.cues || {});
    if (own.pressed) return null;
    if (own.seen) return (own.pressed = true), o.press || { power: true, tech: 'rollCounter' };
    if (bout.events.some(x => x.who === 1 && x.name === 'cross' && ['block', 'hit', 'whiff', 'graze'].includes(x.type))) own.seen = true;
    return null;
  };
  let met = null,
    landed = null,
    action = null,
    far = null;
  const ev = fight(e, bout => {
    const [a, b] = bout.fighters;
    for (const x of bout.events) {
      if (x.who === 1 && x.name === 'cross' && !met && ['block', 'hit', 'whiff', 'graze'].includes(x.type)) met = Object.assign({ t: bout.t }, x);
      if (x.type === 'punch' && x.who === 0 && !action) (action = a.action), (far = Math.hypot(b.x - a.x, b.z - a.z));
      if (x.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(x.type) && !landed) landed = Object.assign({ t: bout.t }, x);
    }
  });
  return { ev, met, landed, action, far, dt: met && landed ? landed.t - met.t : null };
}
test('roll & counter: the rear hook out of the roll lands as a counter, as soon after the roll as the plan has it, the cross-arm guard held or not', () => {
  for (const lv of ROLLERS)
    for (const tech of [['crossArm', 'rollCounter'], ['rollCounter']]) {
      const k = WINDOWS.rollCounter[lv].at,
        r = rollCounter(lv, k, tech),
        [lo, hi] = COUNTER_TIME[lv[0]],
        say = `${lv} ${tech}: ${JSON.stringify({ met: r.met && [r.met.part, r.met.roll], landed: r.landed && [r.landed.type, r.landed.name, r.landed.J, r.landed.counter], dt: r.dt })}`;
      assert.ok(r.met && r.met.part === 'shoulder' && r.met.roll === true, say);
      // (wound up by the roll, his grade's share of it)
      assert.equal(r.action.name, 'hookR', say);
      assert.ok(r.action.loaded && r.action.loaded.from === 'roll' && r.action.loaded.load === ROLL[lv].counter.load, say);
      // (on his head, as a counter, in the plan's time)
      assert.ok(r.landed && r.landed.type === 'hit' && r.landed.name === 'hookR' && r.landed.counter === true && !r.landed.zone, say);
      assert.ok(r.dt >= lo - 1e-9 && r.dt <= hi + 1e-9, say);
    }
  // (the same counter, waiting as long for his weight, with nothing of it wound up by the roll: 40 ms and more later)
  for (const lv of ROLLERS) {
    const k = WINDOWS.rollCounter[lv].at,
      wound = rollCounter(lv, k, ['crossArm', 'rollCounter']),
      c = ROLL[lv].counter,
      load = c.load;
    let bare;
    try {
      c.load = 0;
      bare = rollCounter(lv, k, ['crossArm', 'rollCounter']);
    } finally {
      c.load = load;
    }
    assert.ok(bare.landed && bare.landed.type === 'hit' && bare.dt - wound.dt >= 0.04 - 1e-9, `${lv}: wound up ${wound.dt}, not ${bare.dt}`);
  }
  // (and the catalogue's cards: the counter out of the roll wound further by the waist, plan 6 §3.3 N15, 80 N·s and more at 4;
  // 68 at 4c726b9, weaker than the rear hook thrown on its own)
  for (const e of ROLLING.filter(x => x.level[0] === '4')) {
    const hook = fight(e).find(x => x.who === 0 && x.type === 'hit' && x.name === 'hookR');
    assert.ok(hook && hook.counter && hook.J >= 80, `${e.id}: ${hook && hook.J} N·s`);
  }
});
test('roll & counter: no roll, no counter wound up; the press (the head names the rear hook) is the plain rear hook', () => {
  for (const lv of ROLLERS) {
    const w = WINDOWS.rollCounter[lv];
    // (rolled too early: the cross is not rolled off the shoulder: it meets one that has stopped turning, or goes by)
    const early = rollCounter(lv, w.from - 1, ['crossArm', 'rollCounter'], { press: { power: 'hookR', tech: 'rollCounter' } });
    assert.ok(early.met && !(early.met.part === 'shoulder' && early.met.roll), `${lv}: ${JSON.stringify(early.met)}`);
    assert.ok(early.action && early.action.name === 'hookR' && !early.action.loaded, `${lv}: ${early.action && JSON.stringify(early.action.loaded)}`);
    // (and with no roll at all, his guard held: the same)
    const held = rollCounter(lv, undefined, ['crossArm', 'rollCounter'], { press: { power: 'hookR', tech: 'rollCounter' } });
    assert.ok(held.action && held.action.name === 'hookR' && !held.action.loaded && !(held.landed && held.landed.counter), `${lv}: ${JSON.stringify(held.landed)}`);
  }
  // (the catalogue's cards are the roll & counter: rolled, and the hook on his head as a counter)
  for (const e of ROLLING) {
    const ev = fight(e),
      hook = ev.find(x => x.who === 0 && x.type === 'hit');
    assert.ok(ev.some(x => x.type === 'block' && x.part === 'shoulder' && x.roll) && hook && hook.name === 'hookR' && hook.counter, e.id);
  }
});
test('roll & counter: a counter that puts him down puts him down to his own right, the way the rear hook goes on', () => {
  for (const lv of ['4a', '5a']) {
    const e = Object.assign({}, ROLLING.find(x => x.level === lv), { loop: 3.5 }),
      bout = freshBout(e);
    let from = null,
      fell = null;
    for (let t = 0; t < Math.round(e.loop / DT); t++) {
      const b = bout.fighters[1];
      // (one blow from going down: the counter finishes him)
      if (!from) b.hp = 2;
      step(bout, drive(e, bout, t * DT, DT), DT);
      bout.fighters[0].hp = 100;
      if (!from && bout.events.some(x => x.type === 'hit' && x.who === 0 && x.down)) from = b.points.hips.slice();
      if (from) fell = b.points.hips.slice();
    }
    assert.ok(from, `${lv}: not put down`);
    // (where his hips went, in his own terms as he stood: [to his left, ahead])
    const [left] = local(bout.fighters[1], fell[0] - from[0], fell[2] - from[2]);
    assert.ok(left <= -0.3, `${lv}: his hips went ${(left * 100).toFixed(0)} cm to his left`);
  }
});

/* ---- the cross-arm guard against the punches to the body (§4A.3, stage H2): the four from their own ranges into it held up,
   the catalogue's cards (src/defense.mjs CROSS_BODY). The liver hook and the body uppercut are met by his arms (§4A.10's
   fifth); so, in this engine, are the body jab and the body cross: the gap the plan finds at the pit of his stomach is shut
   (a glove 21 cm across, the lead elbow out in front and the rear one under the chin; README, known limits). A punch met on
   his arms opens the rear hand set at his chin (§4A.6): the rear uppercut, the short overhand from further off, wound up by
   his grade (skill.mjs CROSS counter: 4 0.3, 5 0.7), and a pro's guard opens nothing. */
test('cross-arm guard: the punches to the body are met by his arms, and open the rear hand at his chin from 4 up', () => {
  for (const e of CROSS_BODY) {
    let counter = null;
    const ev = fight(e, bout => {
        const a = bout.fighters[0].action;
        if (a && MOVES[a.name].punch && !counter) counter = a;
      }),
      met = ev.find(x => x.who === 1 && x.name === e.punch[0] && ['hit', 'block', 'whiff', 'graze'].includes(x.type));
    assert.ok(met && met.type === 'block' && ['elbow', 'forearm', 'glove'].includes(met.part), `${e.id}: ${JSON.stringify(met)}`);
    const c = CROSS[e.level].counter;
    if (!c) assert.equal(counter, null, e.id);
    else {
      assert.ok(counter && ['upper', 'upperIn', 'cross'].includes(counter.name) && counter.loaded && counter.loaded.from === 'cross' && counter.loaded.load === c.load, `${e.id}: ${counter && counter.name} ${counter && JSON.stringify(counter.loaded)}`);
      assert.ok(ev.some(x => x.who === 0 && x.type === 'hit' && x.name === counter.name), `${e.id}: the counter did not land`);
    }
  }
  // (and the body uppercut, from right up close, on his arms: not a card, the two men's arms are in each other before it starts)
  for (const lv of GUARDS) {
    const e = what(lv, 'upperBody', { gap: 0.64 });
    assert.ok(e.type === 'block' && ['elbow', 'forearm', 'glove'].includes(e.part), `upperBody@${lv}: ${JSON.stringify(e)}`);
  }
});
/* §4A.10's fourth, its weak places: (a) the rear hook, at a cross-arm guard held up and not rolling, lands on his head (there
   is no glove on that side: only the shoulder, and it has to be rolling); (c) a great dirty fighter rolling lifts his lead
   forearm, and a rear hook aimed low at his left side lands on his trunk there (in this engine on the side of his belly, not
   the ribs under it: README), where the same hook at him standing, or at a legend rolling (his forearm stays down), is met by
   the elbow. */
const aimed = (lv, name, o = {}) => {
  const e = into(lv, 'cross', { tech: ['crossArm', 'rollCounter'], roll: o.roll });
  return Object.assign(e, {
    id: `${name}@${lv}`,
    loop: 1.8,
    him: () => [HOME[0] + (o.gap || 0.85), HOME[1]],
    against: [[0.8, 'power', name]],
    press: o.roll !== undefined ? [[0.8 + o.roll * DT, 'tech', 'rollCounter']] : [],
    cover: o.roll !== undefined ? t => (t > 0.2 && t < 0.8 + o.roll * DT - 0.15) || (t >= 0.8 + o.roll * DT - 1e-9 && t < 1.3) : t => t > 0.2 && t < 1.4,
    keep: o.aim ? aimAt(o.aim, name) : undefined
  });
};
const what = (lv, name, o) => {
  let side = null;
  const ev = fight(aimed(lv, name, o), bout => {
      const x = bout.events.find(x => x.who === 1 && x.name === name && x.type === 'hit');
      if (x && x.part === 'body') side = where(bout.fighters[0].points, x.at).a;
    }),
    e = ev.find(x => x.who === 1 && x.name === name && ['hit', 'block', 'whiff', 'graze'].includes(x.type));
  return Object.assign({ side }, e);
};
test('cross-arm guard: its weak places, the rear hook to his head, and a rear hook to his left side while a great one rolls', () => {
  for (const lv of ['4m', '4a', '5m', '5a']) {
    const e = what(lv, 'hookR');
    assert.ok(e.type === 'hit' && e.part === 'glove' && e.J > 60, `${lv}: ${JSON.stringify(e)}`);
  }
  const LEFT = [1.2, -60],
    standing = what('4a', 'hookR', { aim: LEFT });
  assert.ok(standing.type === 'block' && standing.part === 'elbow', `4a standing: ${JSON.stringify(standing)}`);
  const rolling = [-4, -2, 0].map(k => what('4a', 'hookR', { aim: LEFT, roll: k }));
  for (const e of rolling) assert.ok(e.type === 'hit' && e.part === 'body' && e.side <= -60 && e.J > 50, `4a rolling: ${JSON.stringify(e)}`);
  for (const k of [-4, -2]) {
    const e = what('5a', 'hookR', { aim: LEFT, roll: k });
    assert.ok(e.type === 'block' && e.part === 'elbow', `5a rolling ${k}: ${JSON.stringify(e)}`);
  }
  /* (changed in plan 6 stage N, and approved by the user on 2026-11-24 (`crossarm-weak`). Before the rear hook's waist this
     held a legend rolling as late as the hook is pressed (k 0) to block it at the elbow too, 59.7 N·s at 0ac7c0c:
       for (const k of [-4, -2, 0]) { const e = what('5a', 'hookR', { aim: LEFT, roll: k }); assert.ok(e.type === 'block' && e.part === 'elbow') }
     With the rear hook's waist as built, §3.3 N15, it comes round a little wider and glances off his side round behind the
     elbow, 42 N·s at -85 degrees. It still blocks, 58.7, with 2 degrees of the chest's 40 moved to the waist and the wind-up
     as it was, and 58.0 with 6 of them and the waist's wind-up of 12; it goes at 12 (36 at -82), and with 2 degrees put on
     top of the chest's 40 (33 at -80): the stage's report has the table. Well under what a great one's open side takes; a
     change to the game all the same, held here as it is now so that it cannot move again unseen) */
  const late = what('5a', 'hookR', { aim: LEFT, roll: 0 });
  assert.ok(late.type === 'hit' && late.part === 'body' && late.side <= -60 && late.J < 50, `5a rolling 0: ${JSON.stringify(late)}`);
});

/* The hammering parry: the guard put up fresh is the rear fist brought down on the jab coming in, and it turns it aside only
   on the frame it meets it; the arm that threw the jab is knocked down, the glove more than 15 cm under where his guard holds
   it. */
test('hammering parry: the rear fist comes down on the glove, and turns it aside only where it meets it', () => {
  for (const lv of SHOW) {
    const w = WINDOWS.parry[lv];
    let touch = null,
      lowest = Infinity,
      parried = null;
    const ev = fight(into(lv, 'jab', { range: 1.0, k: w.at }), (bout, t) => {
      const [a, b] = bout.fighters;
      if (!parried && bout.events.some(e => e.type === 'parry')) (parried = t), (touch = Math.hypot(...M.sub(a.points.R, b.points.L)));
      if (parried !== null && t - parried <= 18) lowest = Math.min(lowest, b.points.L[1]);
    });
    const p = ev.find(e => e.type === 'parry');
    assert.ok(p && p.hammer, `${lv}: ${JSON.stringify(ev.map(e => e.type))}`);
    // (glove on glove: the two within a glove's width of each other as it turns it aside)
    assert.ok(touch <= 0.21 + 0.03, `${lv}: the fists ${(touch * 100).toFixed(1)} cm apart`);
    // his guard: his lead glove as he stands before he throws
    const before = [];
    fight(Object.assign(into(lv, 'jab', { range: 1.0, k: w.at }), { loop: 0.75 }), bout => before.push(bout.fighters[1].points.L[1]));
    const held = before.slice(-15).reduce((s, y) => s + y, 0) / 15;
    assert.ok(held - lowest >= 0.15, `${lv}: his lead glove knocked ${((held - lowest) * 100).toFixed(1)} cm under his guard`);
    // a frame either side of the window is not a parry
    for (const k of [w.from - 1, w.to + 1]) assert.ok(!fight(into(lv, 'jab', { range: 1.0, k })).some(e => e.type === 'parry'), `${lv}: frame ${k}`);
    // and a hammer's window is the narrower: it has to land on the glove
    assert.ok(w.to - w.from < WINDOWS.parry[lv[0] + 'm'].to - WINDOWS.parry[lv[0] + 'm'].from, `${lv}: ${w.from}–${w.to}`);
  }
  // the clean grades' parry is the gloves put out to meet it, as it was
  for (const lv of others) {
    const p = fight(into(lv, 'jab', { range: 1.0, k: WINDOWS.parry[lv].at })).find(e => e.type === 'parry');
    assert.ok(p && !p.hammer, lv);
  }
});

/* ---- the tricks (§5.3), off their catalogue rows (src/ladder.mjs: SHOWOFF): the press names the trick; a dirty great one
   and a dirty legend do it, every other grade throws the punch pressed */
const tricks = {};
const trick = (id, lv) => {
  const key = `${id}@${lv}`;
  if (tricks[key]) return tricks[key];
  const e = SHOWOFF.find(x => x.id === key),
    { frames, bout } = run(e),
    events = frames.flatMap((f, i) => f.events.map(ev => Object.assign({ i }, ev)));
  return (tricks[key] = { e, frames, bout, events, punches: events.filter(ev => ev.type === 'punch' && ev.who === 0), hits: events.filter(ev => ev.type === 'hit' && ev.who === 0) });
};
const msOf = (t, a, b) => Math.round(((b.i - a.i) * 1000) / 60);

test('flicker: thrown at 4암 and 5암 only; quick and light, out of the waist and back to it, and again without a wind-up', () => {
  for (const lv of others) assert.ok(trick('flicker', lv).punches.every(p => p.name === 'jab'), lv);
  for (const lv of SHOW) {
    const t = trick('flicker', lv),
      first = t.hits[0],
      press = t.punches[0],
      ms = msOf(t, press, first);
    assert.equal(press.name, 'flicker', lv);
    assert.ok(ms >= 83 && ms <= 100, `${lv}: lands ${ms} ms after the press`);
    assert.ok(first.J >= 15 && first.J <= 25, `${lv}: ${first.J} N·s`);
    // (from under his eyes, and home to the waist, not the guard)
    const at = t.frames[press.i - 1],
      after = t.frames[t.punches[1].i - 1];
    assert.ok(at.headY - at.gloves.L[1] >= 0.3, `${lv}: the glove goes from ${((at.headY - at.gloves.L[1]) * 100).toFixed(0)} cm under his head`);
    assert.ok(after.headY - after.gloves.L[1] >= 0.3, `${lv}: and is back ${((after.headY - after.gloves.L[1]) * 100).toFixed(0)} cm under it before the next`);
    // three in a row, each pressed within a quarter of a second of the last arriving (it has no wind-up at all)
    assert.deepEqual(t.punches.map(p => p.name), ['flicker', 'flicker', 'flicker'], lv);
    assert.equal(t.hits.length, 3, `${lv}: ${t.hits.map(h => h.J).join(' ')}`);
  }
  // (a great dirty fighter's is the bigger swing: more body behind it)
  assert.ok(trick('flicker', '4a').hits[0].J > trick('flicker', '5a').hits[0].J);
});

/* ---- plan 6 §3.3 N17: a legend's flicker cracked like a whip by the waist ("5D는 허리를 더 써서 더 채찍처럼 때립니다."): his
   waist set off with the hips, quick and loose, peaks well before his elbow does and is already coming back as the glove
   lands (the handle stopped as the tip goes fastest); the glove meets him 10 to 20% faster and harder than it did (8.87 m/s,
   20.4 N·s at 4c726b9 and 7fa3003), with a margin: 12% and more, still lighter than his jab and no later; a great dirty
   fighter's waist puts 3 degrees into his. */
test('flicker: a legend\'s waist cracks it like a whip, a great dirty fighter\'s hardly turns', () => {
  const t = trick('flicker', '5a'),
    hit = t.hits[0],
    i = hit.i,
    jab = rung('jab@5a');
  assert.ok(hit.speed >= 8.87 * 1.12 && hit.speed <= 8.87 * 1.2 && hit.J >= 20.4 * 1.12 && hit.J <= 20.4 * 1.2 && hit.J < jab.J, `5a: ${hit.speed} m/s, ${hit.J} N·s (his jab ${jab.J})`);
  assert.ok(msOf(t, t.punches[0], hit) <= 83, `5a: ${msOf(t, t.punches[0], hit)} ms`);
  // (the waist on the pelvis as the glove lands: turned back to his left, against the flicker's way, since the frame before)
  const live = t.frames.slice(0, i + 1).filter(f => !f.held);
  assert.ok(live[live.length - 1].waist - live[live.length - 2].waist > 0, `5a: the waist ${live[live.length - 2].waist.toFixed(2)} -> ${live[live.length - 1].waist.toFixed(2)} deg as it lands`);
  // (its peak, as the chain throws it, at least 20 ms before the elbow's)
  const c = createChain(MOVES.flicker, 1, LEVEL['5a']);
  for (let k = 0; k < 480 && c.phase !== 'done'; k++) stepChain(c, MOVES.flicker, 1 / 240);
  assert.ok(c.peakAt[4] - c.peakAt[5] >= 0.02, `5a: the waist peaks at ${c.peakAt[5].toFixed(3)} s, the elbow at ${c.peakAt[4].toFixed(3)}`);
  // (and a great dirty fighter's: 3 degrees of waist, the furthest it is turned his right on the pelvis from the press to the
  // contact; the beat's sway is the chest's, and not in it)
  const g = trick('flicker', '4a'),
    p = g.punches[0].i,
    turned = Math.max(...g.frames.slice(p, g.hits[0].i + 1).map(f => -f.waist));
  assert.ok(turned >= 2 && turned <= 4.5, `4a: the waist turned ${turned.toFixed(1)} deg`);
});
/* (and the three of them, the frame each lands in and how hard, as the cards throw them. The legend's second, pressed with no
   wind-up while the first comes home, meets the head with the waist's whip in it as well, a frame sooner and as hard as a
   first one (it came at the end of its reach before, 8.6 N·s); his third, later in its whip, is about what it was. A great
   dirty fighter's, his swing with only 3 degrees of waist, are each about a newton-second harder. At 7fa3003: 4암 22.9, 18.9,
   16.3 N·s in frames 34, 56, 78; 5암 20.4, 8.6, 8.0 in frames 34, 54, 74.) */
const FLICKS = { '4a': [[34, 23.7], [56, 19.4], [78, 17.3]], '5a': [[34, 23.0], [53, 21.7], [73, 9.3]] };
test('flicker: the three hits, where each lands and how hard', () => {
  for (const [lv, hits] of Object.entries(FLICKS)) {
    const t = trick('flicker', lv);
    assert.deepEqual(t.hits.map(h => h.i), hits.map(h => h[0]), `${lv}: ${t.hits.map(h => `${h.i}: ${h.J}`).join(', ')}`);
    for (const [k, [, J]] of hits.entries()) assert.ok(Math.abs(t.hits[k].J - J) <= 1, `${lv}, hit ${k + 1}: ${t.hits[k].J} N·s, ${J} measured`);
  }
});

/* Pushing his guard out of the way: the lead hand meets his glove (a 'paw' event: only when the gloves touch) and pushes it
   down or up, and the rear hand's punch that follows lands; the same punch pressed plain, into the same guard, is blocked. */
test('paw down / paw up: the lead hand moves his glove first, and the punch that follows gets through where the plain one is blocked', () => {
  for (const id of ['pawDown', 'pawUp'])
    for (const lv of LEVELS) {
      const t = trick(id, lv),
        last = t.events.filter(ev => ev.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(ev.type)).pop(),
        paw = t.events.find(ev => ev.type === 'paw' && ev.who === 0);
      if (!SHOW.includes(lv)) {
        assert.ok(!paw && last.type === 'block', `${id}@${lv}: ${last.type}`);
        continue;
      }
      assert.ok(paw && paw.name === id, `${id}@${lv}: ${JSON.stringify(t.events.map(e => e.type))}`);
      assert.equal(last.type, 'hit', `${id}@${lv}`);
      assert.ok(paw.i < last.i, `${id}@${lv}: the glove is out of the way first`);
      const ms = msOf(t, t.punches[0], last);
      assert.ok(ms >= 233 && ms <= 300, `${id}@${lv}: lands ${ms} ms after the press`);
      // (the same man, the same punch pressed plain: blocked)
      const plain = Object.assign({}, t.e, { press: t.e.press.map(([at, b]) => [at, b, 'plain']) }),
        { frames } = run(plain),
        out = frames.flatMap(f => f.events).filter(ev => ev.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(ev.type)).pop();
      assert.equal(out.type, 'block', `${id}@${lv} plain`);
    }
});

/* The collar: the lead hand round his head to the back of his neck (a 'collar' event: only when it gets there), his head
   coming down toward the uppercut as it goes up, and the uppercut harder for it than the same one pressed plain. And, seen
   to be hauled on (docs/moves-plan-6.md §3.4 N18): from the catch to the landing, a tenth of a second and more, his head comes
   toward the man pulling and down by 14 cm (4암) and 10 cm (5암) and more, the glove is on the back of his neck (its surface
   within 6 cm of the point the bout judges it by) 7 and 5 frames and more, the pulling arm is bent (its elbow, catch to
   landing, 135 degrees or less: the arm held out straight to the neck was at 160), his neck goes down no further than 35
   degrees, and the uppercut is no more than 1.25 times what it was before it was hauled on like this (93.7 and 105.0
   newton-seconds, measured at 4c726b9). */
const HAULED = { '4a': { head: 0.14, frames: 7, was: 93.7 }, '5a': { head: 0.1, frames: 5, was: 105.0 } };
function hauled(lv) {
  const e = SHOWOFF.find(x => x.id === `collar@${lv}`),
    bout = freshBout(e),
    [a, b] = bout.fighters,
    out = { near: 0, elbows: [], neck: -Infinity };
  let caught = null;
  for (let i = 0; i < Math.round(e.loop / DT); i++) {
    step(bout, drive(e, bout, i * DT, DT), DT);
    b.hp = 1000;
    a.hp = Math.max(a.hp, 1000);
    const h = b.points.head,
      nape = [h[0] - Math.sin(b.yaw) * COLLAR.nape[0], h[1] - COLLAR.nape[1], h[2] - Math.cos(b.yaw) * COLLAR.nape[0]];
    if (Math.hypot(...M.sub(a.points.L, nape)) - GLOVE.r <= 0.06) out.near++;
    out.neck = Math.max(out.neck, measure(b).angles.NeckForward);
    for (const ev of bout.events) {
      if (ev.type === 'collar' && ev.who === 0) (caught = i), (out.from = h.slice()), (out.me = [a.x, a.z]);
      if (ev.type === 'hit' && ev.who === 0 && !out.hit) (out.hit = ev), (out.dt = caught === null ? null : (i - caught) * DT);
    }
    if (caught !== null && !out.hit) (out.elbows.push(measure(a).angles.LeftElbow), (out.to = h.slice()));
  }
  if (out.from && out.to) {
    const toMe = [out.me[0] - out.from[0], out.me[1] - out.from[2]],
      l = Math.hypot(...toMe),
      ahead = ((out.to[0] - out.from[0]) * toMe[0] + (out.to[2] - out.from[2]) * toMe[1]) / l;
    out.came = Math.hypot(Math.max(0, ahead), Math.max(0, out.from[1] - out.to[1]));
  }
  return out;
}
test('collar: the neck is seen to be hauled on: his head comes in and down, the hand stays on it, the arm bends; no more than 1.25 times the uppercut', () => {
  for (const lv of SHOW) {
    const h = hauled(lv),
      want = HAULED[lv],
      elbow = h.elbows.reduce((s, x) => s + x, 0) / h.elbows.length,
      say = `collar@${lv}: ${JSON.stringify({ came: h.came, near: h.near, elbow, neck: h.neck, J: h.hit && h.hit.J, dt: h.dt })}`;
    assert.ok(h.dt >= 0.1 - 1e-9, say);
    assert.ok(h.came >= want.head, say);
    assert.ok(h.near >= want.frames, say);
    assert.ok(elbow <= 135, say);
    assert.ok(h.neck <= 35, say);
    assert.ok(h.hit && h.hit.J <= want.was * 1.25, say);
  }
});
test('collar: the lead hand catches the back of his neck, pulls his head down into the uppercut, and it lands harder', () => {
  for (const lv of LEVELS) {
    const t = trick('collar', lv),
      hit = t.hits[0],
      c = t.events.find(ev => ev.type === 'collar' && ev.who === 0);
    assert.ok(hit && hit.name === 'upper', `collar@${lv}`);
    if (!SHOW.includes(lv)) {
      assert.ok(!c, lv);
      continue;
    }
    assert.ok(c && c.i < hit.i, `collar@${lv}: ${JSON.stringify(t.events.map(e => e.type))}`);
    // (caught at about the moment the uppercut's legs drive: within the first tenth and a half of a second)
    assert.ok(msOf(t, t.punches[0], c) <= 150, `collar@${lv}: caught ${msOf(t, t.punches[0], c)} ms after the press`);
    // his head on its way down as the uppercut meets it (the frame before it lands, against the frame it was caught)
    const down = t.frames[c.i].foe.head[1] - t.frames[hit.i - 1].foe.head[1];
    assert.ok(down >= 0.01, `collar@${lv}: his head came down ${(down * 100).toFixed(1)} cm`);
    const plain = Object.assign({}, t.e, { press: t.e.press.map(([at, b]) => [at, b, 'plain']) }),
      p = run(plain).frames.flatMap(f => f.events).find(ev => ev.who === 0 && ev.type === 'hit');
    assert.ok(hit.J > p.J, `collar@${lv}: ${hit.J} N·s against ${p.J} plain`);
  }
});

/* The collar off its card's spot: the other man stood anywhere about the distance the hand catches the back of his neck
   from (the card's 0.74 m, 0.715 to 0.745 centre to centre: not much nearer and it is an uppercut alone, a little further
   and the hand does not get there) and up to 12 cm to either side, at either grade: wherever it catches, and wherever it
   does not, the whole of it is within the physics audit, with no exception (hauled in, the other man's guard is where the
   uppercutting shoulder comes up and the blow knocks it open: anim/show.mjs COLLAR, tuck; that went 8 to 15 cm into the
   shoulder, the audit's 8 the limit). And it catches over all of that band but straight in front at its nearest (an
   uppercut alone) and at its furthest corners. And a hand that never gets there, the other man stepping back from it to
   0.9 or 1.0 m as it goes (as he may in a bout, game/match.mjs): an uppercut and nothing else, within the audit too. */
test('collar: off the card\'s spot, nearer, further and to either side, it is within the audit wherever it catches', () => {
  const broken = [],
    missed = [];
  for (const lv of SHOW)
    for (const gap of [0.715, 0.725, 0.735, 0.745])
      for (const side of [-0.12, -0.06, 0, 0.06, 0.12]) {
        const e = Object.assign({}, SHOWOFF.find(x => x.id === `collar@${lv}`), { id: `collar@${lv} ${gap} ${side}`, him: t => (t < 0.75 ? [HOME[0] + gap, HOME[1] + side] : null) }),
          { found } = audit([e]);
        for (const [check, c] of Object.entries(found)) if (c.bad) broken.push(`${e.id}: ${check} ${c.worst.value.toFixed(1)} at ${c.worst.t}, ${c.worst.who}`);
        if (!fight(e).some(ev => ev.type === 'collar' && ev.who === 0) && !(gap < 0.72 && Math.abs(side) < 0.1) && !(gap > 0.74 && Math.abs(side) > 0.1)) missed.push(e.id);
      }
  const away = [];
  for (const lv of SHOW)
    for (const back of [0.9, 1.0]) {
      const e = Object.assign({}, SHOWOFF.find(x => x.id === `collar@${lv}`), { id: `collar@${lv} stepped back to ${back}`, him: t => (t < AT ? [HOME[0] + 0.74, HOME[1]] : t < AT + 0.4 ? [HOME[0] + back, HOME[1]] : null) }),
        events = fight(e),
        { found } = audit([e]);
      for (const [check, c] of Object.entries(found)) if (c.bad) broken.push(`${e.id}: ${check} ${c.worst.value.toFixed(1)} at ${c.worst.t}, ${c.worst.who}`);
      if (events.some(ev => ev.type === 'collar') || !events.some(ev => ev.type === 'punch' && ev.who === 0)) away.push(`${e.id}: ${events.map(ev => ev.type).join(' ')}`);
    }
  assert.deepEqual(broken, []);
  assert.deepEqual(missed, []);
  assert.deepEqual(away, []);
});

/* The elbow: the cross thrown past the side of his head, and what lands is the elbow coming on behind it, inside the cross's
   contact window (before the arm starts home: the hold a punch stays out for), and harder than the fist of the same cross
   pressed plain from there. */
test('elbow: the angled cross\'s elbow lands, inside the punch\'s contact window', () => {
  for (const lv of LEVELS) {
    const t = trick('elbow', lv),
      hit = t.hits[0];
    assert.ok(hit && hit.name === 'cross', `elbow@${lv}`);
    if (!SHOW.includes(lv)) {
      assert.ok(hit.part !== 'elbow', lv);
      continue;
    }
    assert.equal(hit.part, 'elbow', `elbow@${lv}: ${JSON.stringify(hit)}`);
    const plain = Object.assign({}, t.e, { press: t.e.press.map(([at, b]) => [at, b, 'plain']) }),
      pf = run(plain).frames.flatMap((f, i) => f.events.map(ev => Object.assign({ i }, ev))),
      p = pf.find(ev => ev.who === 0 && ev.type === 'hit'),
      pms = msOf(null, pf.find(ev => ev.who === 0 && ev.type === 'punch'), p),
      ms = msOf(t, t.punches[0], hit);
    // (no sooner than the plain cross lands, and before the arm starts home: the hold a punch stays out for after it gets there)
    assert.ok(ms >= pms && ms <= pms + LEVEL[lv].chain.hold * 1000 + 17, `elbow@${lv}: lands ${ms} ms after the press, the fist ${pms}`);
    assert.ok(hit.J > p.J, `elbow@${lv}: ${hit.J} N·s against the fist's ${p.J}`);
  }
});

/* ---- the taunts (§5.4), off their catalogue rows (src/ladder.mjs: TAUNTING) */
const taunts = {};
const taunted = (id, lv) => {
  const key = `${id}@${lv}`;
  if (taunts[key]) return taunts[key];
  const { frames } = run(TAUNTING.find(x => x.id === key)),
    events = frames.flatMap((f, i) => f.events.map(ev => Object.assign({ i }, ev)));
  return (taunts[key] = { frames, events, on: frames.filter(f => f.action === id).length, said: events.filter(ev => ev.type === 'taunt' && ev.who === 0) });
};
test('taunts: the five are a show-off\'s alone, a great dirty fighter\'s the longer, and each has his hands off his guard', () => {
  const LONG = { beckon: 0.85, chinOut: 0.9, shrug: 0.6, wind: 1.0, tapChin: 0.7 };
  for (const id of Object.keys(LONG)) {
    for (const lv of others) assert.equal(taunted(id, lv).said.length, 0, `${id}@${lv}`);
    for (const lv of SHOW) {
      const t = taunted(id, lv);
      assert.equal(t.said.length, 1, `${id}@${lv}`);
      // (as long as the plan says, times his grade's: skill.mjs stance.show.long)
      assert.ok(Math.abs(t.on / 60 - LONG[id] * LEVEL[lv].stance.show.long) <= 2 / 60, `${id}@${lv}: ${t.on} frames`);
      // (no guard in it: not covering, and a glove away from where his guard holds it)
      const during = t.frames.filter(f => f.action === id);
      assert.ok(during.every(f => !f.cover), `${id}@${lv}`);
    }
  }
  // the shrug comes once the jab has missed him, the tap of the chin once one has landed
  for (const lv of SHOW) {
    const s = taunted('shrug', lv), c = taunted('tapChin', lv);
    assert.ok(s.events.find(ev => ev.type === 'whiff' && ev.who === 1).i < s.said[0].i, lv);
    assert.ok(c.events.find(ev => ev.type === 'hit' && ev.who === 1).i < c.said[0].i, lv);
  }
});

test('taunts: anything he does puts an end to one, and the last hop moving away may be one', () => {
  const bout = freshBout({ me: () => HOME, him: () => [HOME[0] + 1.0, HOME[1]], setup: b => (b.fighters[0].skills = { all: '4a' }) }),
    a = bout.fighters[0];
  let seen = [];
  for (let i = 0; i < 40; i++) {
    step(bout, [i === 1 ? { taunt: 'beckon' } : i === 20 ? { jab: true } : {}, {}], DT);
    seen.push(a.action ? a.action.name : '-');
  }
  assert.equal(seen[5], 'beckon');
  assert.equal(seen[20], 'jab', seen.slice(15, 25).join(' '));
  // the hop: named while he goes
  const b2 = freshBout({ me: () => HOME, him: () => [HOME[0] + 1.0, HOME[1]], setup: b => (b.fighters[0].skills = { all: '5a' }) }),
    names = [];
  for (let i = 0; i < 120; i++) {
    step(b2, [i === 1 ? { away: 'pivot', side: 1 } : i === 10 ? { taunt: 'wind' } : {}, {}], DT);
    for (const ev of b2.events) if (ev.type === 'taunt' || ev.type === 'hopPivot') names.push(`${i} ${ev.type}`);
  }
  assert.ok(names.length === 2 && names[1].endsWith('taunt') && +names[1].split(' ')[0] >= 40, names.join(', '));
});

/* ---- the taunts made showier (docs/moves-plan-6.md §3.4, N19-N23: the catalogue's memos), measured on his own body (the
   pose's terms: x to his left, y up, z ahead) frame by frame through the catalogue's rows. The numbers are the plan's, which
   are a great dirty fighter's (4암: size 1); a legend's taunts are 0.75 the size (skill.mjs SHOW_5A), so where a number is
   an amount of the taunt's own (a reach, a swing, a spread) his is held to 0.75 of it; where it is where a hand has to get
   to (his chin, all the way down) it is the same. */
const posed = {};
function poseOf(id, lv) {
  const key = `${id}@${lv}`;
  if (posed[key]) return posed[key];
  const e = TAUNTING.find(x => x.id === key),
    bout = freshBout(e),
    a = bout.fighters[0],
    frames = [];
  for (let i = 0; i < Math.round(e.loop / DT); i++) {
    step(bout, drive(e, bout, i * DT, DT), DT);
    a.hp = Math.max(a.hp, 60);
    const { R, p } = fk(a.pose),
      glove = S => M.add(p[S + 'Hand'], M.scale(M.sub(p[S + 'Hand'], p[S + 'ForeArm']), GLOVE.ahead / Math.hypot(...M.sub(p[S + 'Hand'], p[S + 'ForeArm'])))),
      chest = q => M.app(M.tr(R.Chest), M.sub(q, p.Chest)),
      m = measure(a),
      fwd = [R.Head[2], R.Head[5], R.Head[8]];
    frames.push({
      on: !!a.action && a.action.name === id,
      L: glove('Left'),
      R: glove('Right'),
      // (the room's: what is seen to jump)
      at: { L: a.points.L.slice(), R: a.points.R.slice(), head: a.points.head.slice() },
      // (the chin: 8 cm under the middle of his head and 9 cm ahead of it, as his head is turned)
      chin: M.add(p.Head, M.app(R.Head, M.add(HEAD, [0, -0.08, 0.09]))),
      // (the head's nod: + down)
      nod: (-Math.atan2(fwd[1], Math.hypot(fwd[0], fwd[2])) * 180) / Math.PI,
      shoulders: [chest(p.LeftArm)[1], chest(p.RightArm)[1]],
      elbows: [m.angles.LeftElbow, m.angles.RightElbow],
      // (how far either glove is into his other arm, past the padding's give: the audit's own, rig/body.mjs gloveInArm)
      self: Math.max(...m.arms.map(g => g.depth))
    });
  }
  const on = frames.map((f, i) => (f.on ? i : -1)).filter(i => i >= 0);
  return (posed[key] = { frames, during: on.map(i => frames[i]), first: on[0], last: on[on.length - 1], long: LEVEL[lv].stance.show.long });
}
const TAUNT_IDS = ['beckon', 'chinOut', 'wind', 'shrug', 'tapChin'];
const sized = (lv, x) => x * LEVEL[lv].stance.show.size;
const hyp = v => Math.hypot(v[0], v[1], v[2]);

/* As a taunt begins and as it ends no glove jumps (the frame it starts on and the next, the frame it ends on and the two
   after), and neither glove is in his other arm more than the audit's 2 cm in any frame of it (its own check: src/audit.mjs
   measure, arms). */
test('taunts: no glove jumps more than 2.5 cm as a taunt begins or as it ends; no glove in his other arm', () => {
  for (const id of TAUNT_IDS)
    for (const lv of SHOW) {
      const { frames, during, first, last } = poseOf(id, lv),
        step1 = (i, k) => hyp(M.sub(frames[i].at[k], frames[i - 1].at[k]));
      // (the frame it starts on and the next, the frame it ends on and the next: the pose follows what he does a frame late)
      for (const i of [first, first + 1, last, last + 1, last + 2])
        for (const k of ['L', 'R']) assert.ok(step1(i, k) <= 0.025, `${id}@${lv}: the ${k} glove moves ${(step1(i, k) * 100).toFixed(1)} cm into frame ${i} (${first}-${last})`);
      const worst = Math.max(...during.map(f => f.self));
      assert.ok(worst <= 0.02, `${id}@${lv}: a glove ${(worst * 100).toFixed(1)} cm into his other arm`);
    }
});

/* A taunting hand reaches only as far as there is room (docs/moves-plan-6.md §3.4 N19; anim/show.mjs ROOM). Each taunt at
   either grade, done from 0.9, 1.0 and 1.05 m (centre to centre: the ordinary fighting distance; the beckon's card stands
   at 1.2 to show the whole of its reach) and from right up close, 0.70, 0.72 and 0.75 m (where a guard would hold the lead
   hand is at the other man's face there: the arm, asked for a hand close in front of its own shoulder, puts it out ahead);
   with the other man stepping in on him during it, from the card's distance to 0.82 and to 0.70 m; and with a punch
   thrown at him during it: a cross a third of the way into it (stepping in to 0.85 m, and standing at 1.0 and at 0.9 m)
   and 0.4 of the way (stepping in to 0.8 m), an uppercut from 0.9 m early in it and half way (his head dips and comes
   up where the hand is), and a hook to the body from 0.75 m at its start and a quarter of the way in (his head comes in
   low, where a shrug's lead hand is on its way up). In every frame of the taunt each glove's surface is 5 cm and more
   off his head and his trunk as a glove lands on them (game/bout.mjs RULES, game/trunk.mjs balls). A hand given way so is
   not knocked: as his chest sees it, neither glove's velocity changes by more than the audit's JUMP in a frame of the
   taunt (src/audit.mjs), and one that is let finish moves no more than 2.5 cm in its first and last frames. */
const ROOMS = [
  { tag: '0.70 m', at: 0.7 },
  { tag: '0.72 m', at: 0.72 },
  { tag: '0.75 m', at: 0.75 },
  { tag: '0.9 m', at: 0.9 },
  { tag: '1.0 m', at: 1.0 },
  { tag: '1.05 m', at: 1.05 },
  { tag: 'stepping in', to: 0.82 },
  { tag: 'stepping in to 0.70 m', to: 0.7 },
  { tag: 'stepping in and a cross', to: 0.85, hit: true },
  { tag: 'stepping in to 0.8 m and a cross 0.4 of the way in', to: 0.8, hit: true, when: 0.4 },
  { tag: 'a cross at 1.0 m', at: 1.0, hit: true },
  { tag: 'a cross at 0.9 m', at: 0.9, hit: true },
  { tag: 'an uppercut at 0.9 m, early', at: 0.9, hit: 'upper', when: 0.15 },
  { tag: 'an uppercut at 0.9 m, half way', at: 0.9, hit: 'upper', when: 0.5 },
  { tag: 'a hook to the body at 0.75 m, at the start', at: 0.75, hit: 'hookBody', when: 0.05 },
  { tag: 'a hook to the body at 0.75 m, a quarter of the way in', at: 0.75, hit: 'hookBody', when: 0.25 }
];
function roomOf(id, lv, r) {
  const card = TAUNTING.find(x => x.id === `${id}@${lv}`),
    gap = card.him(0)[0] - HOME[0],
    from = 0.5,
    long = MOVES[id].dur * LEVEL[lv].stance.show.long,
    e = Object.assign({}, card, {
      hurt: false,
      // (standing; or stepping back from some way into the taunt, which ends it)
      me: t => (r.back !== undefined && t > from + long * r.back ? [HOME[0] - 0.3, HOME[1]] : HOME),
      // (where he stands, or walks to, or slides to one side from; from a dash on, wherever it takes him)
      him: t =>
        r.dash !== undefined && t > from + long * r.dash
          ? null
          : r.side
            ? [HOME[0] + r.side[0], HOME[1] + (t < from ? 0 : r.side[1] * Math.min(1, (t - from) / 0.5))]
            : [HOME[0] + (r.at ?? (r.to === undefined || t < from + 0.05 ? gap : r.to)), HOME[1]],
      // (a button of his own, some way into the taunt: it ends it)
      press: r.press ? [[from + long * r.press[0], r.press[1], r.press[2]]] : [],
      // (the power button, or the punch it is to be: a cross, by default, from there; or a dash straight at him)
      against: r.hit ? [[from + long * (r.when ?? 1 / 3), 'power', r.hit]] : r.dash !== undefined ? [[from + long * r.dash, 'dash', [-1, 0]]] : [],
      // (named at half a second, standing: the shrug's slip and the tap's jab left out)
      cue: (bout, t) => {
        const own = (bout.fighters[0].cues = bout.fighters[0].cues || {});
        if (own.taunted || t < from) return null;
        own.taunted = t;
        return ['taunt', id];
      }
    });
  // (the other man's grade, where it is not the card's)
  if (r.his) {
    const setup = card.setup;
    e.setup = bout => {
      if (setup) setup(bout);
      bout.fighters[1].skills = { all: r.his };
    };
  }
  const bout = freshBout(e),
    [a, b] = bout.fighters,
    frames = [];
  for (let i = 0; i < Math.round(e.loop / DT); i++) {
    step(bout, drive(e, bout, i * DT, DT), DT);
    a.hp = Math.max(a.hp, 60);
    b.hp = 1000;
    const solid = [[b.points.head, RULES.head], ...balls(b.points)],
      m = measure(a);
    frames.push({
      on: !!a.action && a.action.name === id,
      idle: !a.action,
      gap: Math.hypot(a.x - b.x, a.z - b.z),
      clear: Math.min(...['L', 'R'].flatMap(k => solid.map(([c, rr]) => hyp(M.sub(a.points[k], c)) - rr - RULES.glove))),
      at: { L: a.points.L.slice(), R: a.points.R.slice() },
      chest: { L: m.gloves.Left, R: m.gloves.Right }
    });
  }
  const on = frames.map((f, i) => (f.on ? i : -1)).filter(i => i >= 0);
  return { frames, first: on[0], last: on[on.length - 1], hit: !!r.hit || r.dash !== undefined, entry: e };
}
test('taunts: a taunting hand reaches only as far as there is room, wherever they stand and however he comes in', () => {
  const bad = [];
  let seen = 0;
  for (const id of TAUNT_IDS)
    for (const lv of SHOW)
      for (const r of ROOMS) {
        const { frames, first, last, hit } = roomOf(id, lv, r),
          say = `${id}@${lv}, ${r.tag}`;
        if (first === undefined) {
          bad.push(`${say}: no taunt`);
          continue;
        }
        seen++;
        const clear = Math.min(...frames.slice(first, last + 1).map(f => f.clear));
        if (clear < 0.05) bad.push(`${say}: a glove ${(clear * 100).toFixed(1)} cm off him`);
        for (let i = Math.max(first, 2); i <= last; i++)
          for (const k of ['L', 'R']) {
            const jump = hyp(M.add(M.sub(frames[i].chest[k], M.scale(frames[i - 1].chest[k], 2)), frames[i - 2].chest[k])) / DT;
            if (jump > JUMP) bad.push(`${say}: the ${k} glove's velocity changes ${jump.toFixed(1)} m/s in frame ${i}`);
          }
        if (!hit)
          for (const i of [first, first + 1, last, last + 1, last + 2])
            for (const k of ['L', 'R']) {
              const d = hyp(M.sub(frames[i].at[k], frames[i - 1].at[k]));
              if (d > 0.025) bad.push(`${say}: the ${k} glove moves ${(d * 100).toFixed(1)} cm into frame ${i} (${first}-${last})`);
            }
      }
  assert.deepEqual(bad, []);
  assert.equal(seen, TAUNT_IDS.length * SHOW.length * ROOMS.length);
});

/* The other man dashing in at him during a taunt (game/bout.mjs: 0.58 m in seven frames from 1.2 m, and thrown forward over
   his feet as he lands; where the dash ends is known from its first frame: dashLeft). Each taunt at either grade, he
   dashing straight in from 1.2 m 0.3 of the way into it and from 1.0 m half way, and from 1.2 m 0.85 of the way in (he
   lands in the taunt's last moments, as the hands are let back out for its end): the hands are hurried out of his way as
   a guard is taken up (anim/show.mjs ROOM.rush) and give way where he ends right up against them, and in every frame of
   the taunt each glove's surface is 5 cm and more off his head and trunk. (How hard a hand so hurried is thrown is not
   held here: its glove's velocity changes by more than the audit's JUMP in a frame in three of the thirty, 4.1 m/s at
   most, the beckon@4a's from 1.2 m; the punch-quick fold of the arm does that. Measured 2026-11-23.) */
test('taunts: no taunting glove is in the way of a man who dashes in', () => {
  const bad = [];
  for (const id of TAUNT_IDS)
    for (const lv of SHOW)
      for (const r of [
        { tag: 'a dash in from 1.2 m, 0.3 of the way in', at: 1.2, dash: 0.3, lands: true },
        { tag: 'a dash in from 1.0 m, half way', at: 1.0, dash: 0.5, lands: true },
        { tag: 'a dash in from 1.2 m, 0.85 of the way in', at: 1.2, dash: 0.85 }
      ]) {
        const { frames, first, last } = roomOf(id, lv, r);
        assert.ok(first !== undefined, `${id}@${lv}, ${r.tag}: no taunt`);
        // (and he did come: the two of them right up close before the taunt was over; the late one, on his way)
        assert.ok(frames.slice(first, last + 1).some(f => f.gap < (r.lands ? 0.7 : 1.15)), `${id}@${lv}, ${r.tag}: he never came`);
        const clear = Math.min(...frames.slice(first, last + 1).map(f => f.clear));
        if (clear < 0.05) bad.push(`${id}@${lv}, ${r.tag}: a glove ${(clear * 100).toFixed(1)} cm off him`);
      }
  assert.deepEqual(bad, []);
});
/* And a legend's cross, as he steps in to 0.8 m, 0.2 and 0.45 of the way into the taunt: his head is where a guard would
   hold the lead hand three frames after the punch starts. No taunting glove goes into him (the lead hand goes down to
   where it hung, where there is room, and the reach is hurried in). */
test("taunts: no taunting glove goes into a legend throwing his cross", () => {
  const bad = [];
  for (const id of TAUNT_IDS)
    for (const lv of SHOW)
      for (const when of [0.2, 0.45]) {
        const { frames, first, last } = roomOf(id, lv, { to: 0.8, hit: true, when, his: '5a' }),
          say = `${id}@${lv}, a legend's cross ${when} of the way in`;
        assert.ok(first !== undefined, `${say}: no taunt`);
        const clear = Math.min(...frames.slice(first, last + 1).map(f => f.clear));
        if (clear < 0) bad.push(`${say}: a glove ${(-clear * 100).toFixed(1)} cm into him`);
      }
  assert.deepEqual(bad, []);
});
/* Hands the room has moved are not thrown about by it: what round 4 of this stage mended, each a room that broke before,
   run for every taunt. A great man stepping in to 0.70 m, and he sliding 15 cm to one side from 0.8 m (the shrug's lead
   arm ran along the edge of the shoulder's range and was let go 11 cm in a frame, 6.6 and 6.4 m/s), and a legend's cross
   0.2 of the way in as he steps in to 0.8 m (the beckon's reach was set back at once, 8.6 m/s): no glove's velocity
   changes by more than the audit's JUMP in a frame of the taunt, as his chest sees it. One room is watched, not held: the
   windmill at 5a under the legend's cross (its lead glove 4.1 m/s in a frame as the cross begins), which the engine before
   this stage breaks too (5.59 m/s in the same room), and whose mend cost clearance in other rooms: measured and printed
   here, JUMP left as it is (the user's decision of 2026-11-24, src/open.old.data.mjs u-wind-room). */
const WATCHED_ROOM = (id, lv, r) => id === 'wind' && lv === '5a' && r.hit;
test('taunts: a hand the room moves is not thrown about', t => {
  const bad = [],
    watched = { most: 0, frames: 0 };
  for (const id of TAUNT_IDS)
    for (const r of [
      { tag: 'a great man stepping in to 0.70 m', to: 0.7, his: '5m' },
      { tag: 'he slides 15 cm aside at 0.8 m', side: [0.8, -0.15] },
      { tag: "a legend's cross 0.2 of the way in", to: 0.8, hit: true, when: 0.2, his: '5a' }
    ])
    for (const lv of SHOW) {
      const { frames, first, last } = roomOf(id, lv, r);
      assert.ok(first !== undefined, `${id}@${lv}, ${r.tag}: no taunt`);
      for (let i = Math.max(first, 2); i <= last; i++)
        for (const k of ['L', 'R']) {
          const jump = hyp(M.add(M.sub(frames[i].chest[k], M.scale(frames[i - 1].chest[k], 2)), frames[i - 2].chest[k])) / DT;
          if (WATCHED_ROOM(id, lv, r)) (watched.most = Math.max(watched.most, jump)), (watched.frames += jump > JUMP ? 1 : 0);
          else if (jump > JUMP) bad.push(`${id}@${lv}, ${r.tag}: the ${k} glove's velocity changes ${jump.toFixed(1)} m/s in frame ${i}`);
        }
    }
  t.diagnostic(`watched, not held: wind@5a under a legend's cross 0.2 of the way in, a glove's velocity changes ${watched.most.toFixed(2)} m/s in a frame at most (JUMP ${JUMP}), past JUMP in ${watched.frames} frame(s)`);
  assert.deepEqual(bad, []);
});
/* A taunt cut short leaves his hands where it had them, and they come home no harder than a hand is moved (anim/animator.mjs
   HOME): the chin-out's, hung all the way down by his thighs, above all. Cut half way by his own step back, and by the
   other man's dash landing on him from 1.2 m, a fifth of the way in: over the twenty frames after it in which he does
   nothing else, no glove's velocity changes by more than the audit's JUMP in a frame. (At the rate everything else is let
   go of, a hand 60 cm from his guard starts home at 9 m/s in a frame; and an arm hanging straight, its elbow nowhere in
   particular round it, was held back and let go 30 cm at once.) */
test('taunts: a chin-out cut short comes back to his guard without a pop', () => {
  const bad = [];
  for (const lv of SHOW)
    for (const r of [
      { tag: 'cut half way by his own step back', back: 0.5 },
      { tag: 'cut by a dash landing, begun a fifth of the way in', at: 1.2, dash: 0.2 }
    ]) {
      const { frames, first, last } = roomOf('chinOut', lv, r);
      assert.ok(first !== undefined, `chinOut@${lv}, ${r.tag}: no taunt`);
      assert.ok((last - first) * DT < 0.9 * MOVES.chinOut.dur * LEVEL[lv].stance.show.long, `chinOut@${lv}, ${r.tag}: not cut`);
      for (let i = last + 1; i <= last + 20 && i < frames.length; i++)
        if (frames[i].idle && frames[i - 1].idle)
          for (const k of ['L', 'R']) {
            const jump = hyp(M.add(M.sub(frames[i].chest[k], M.scale(frames[i - 1].chest[k], 2)), frames[i - 2].chest[k])) / DT;
            if (jump > JUMP) bad.push(`chinOut@${lv}, ${r.tag}: the ${k} glove's velocity changes ${jump.toFixed(1)} m/s ${i - last} frames after`);
          }
    }
  assert.deepEqual(bad, []);
});
/* And his own jab out of a taunt begun right up close, 0.66 m, where the room has his lead hand drawn in or given way: the
   punching hand is let go of where the room had it fast enough (HOME.punch) that the arm it is thrown with is one the
   shoulder allows. Each taunt at either grade, the jab pressed 0.7 of the way in: the audit finds no upper arm turned
   past its range, none where the shoulder cannot put it, and no elbow flipping round. */
test('taunts: a jab out of a taunt begun right up close is thrown with an arm the shoulder allows', () => {
  const bad = [];
  for (const id of TAUNT_IDS)
    for (const lv of SHOW) {
      const { first, entry } = roomOf(id, lv, { at: 0.66, press: [0.7, 'jab', true] });
      assert.ok(first !== undefined, `${id}@${lv}: no taunt`);
      const { found } = audit([entry]);
      for (const check of ['upper arm turned past its range (degrees past)', 'upper arm in a place the shoulder cannot put it (degrees past)', 'elbow flipping round'])
        for (const [name, c] of Object.entries(found))
          if (name.startsWith(check) && c.bad) bad.push(`${id}@${lv}: ${name}, ${c.bad} frames, the worst ${c.worst.value.toFixed(1)} (${c.worst.doing})`);
    }
  assert.deepEqual(bad, []);
});
/* And in real bouts, the dice choosing when, where and which (game/match.mjs: eight seeds, a great dirty fighter against
   a legend, a minute each; every taunt a glove went into the other man in, before it was given room, was in this
   pairing): no taunting glove is inside the other man's head or trunk in any frame; and past a taunt's first 0.07 s (a
   taunt begins from wherever his hands were: its first four frames are the way out of that), away from a blow (a frame
   held at one, and the four after it), no glove's velocity changes by more than the audit's JUMP in a frame, as his
   chest sees it: a hand is not thrown about in the middle of a taunt. (Only this pairing is fought here: it takes some
   25 seconds, and the other two, 4암 against 4암 and 5암 against 5암, as long again each. They were fought by hand over
   the same eight seeds on 2026-11-23, as the taunts stand in this file's tree: 193 taunts in the 24 bouts, none inside
   him, the nearest a beckon's glove 7.0 cm off him and a chin-out's 9.4 in its first frame, a shrug's 13.7; and no
   glove thrown past JUMP in the middle of one.) */
test('taunts: in seeded bouts no taunting glove goes into the other man, nor is thrown about in the middle of a taunt', () => {
  const bad = [],
    seen = {},
    was = [null, null];
  for (const seed of [11, 23, 37, 41, 53, 67, 79, 97]) {
    const m = createMatch({ seed, skills: [{ all: '4a' }, { all: '5a' }], rounds: 1, roundTime: 60 });
    let prev = [null, null],
      prev2 = [null, null],
      blow = [-99, -99];
    for (let i = 0; m.phase === 'fight' && i < 70 * 60; i++) {
      stepMatch(m, DT);
      for (const e of m.bout.events) if (e.type === 'hit' || e.type === 'block' || e.type === 'parry') (blow[e.on] = i), (blow[e.who] = i);
      const held = m.bout.stop > 0,
        now = m.bout.fighters.map(f => (f.pose && f.points ? measure(f).gloves : null));
      m.bout.fighters.forEach((f, w) => {
        if (!f.action || !MOVES[f.action.name].taunt || !f.points) return;
        const o = m.bout.fighters[1 - w],
          solid = [[o.points.head, RULES.head], ...balls(o.points)],
          clear = Math.min(...['L', 'R'].flatMap(k => solid.map(([c, r]) => hyp(M.sub(f.points[k], c)) - r - RULES.glove))),
          say = `seed ${seed}, frame ${i}, ${w ? '5a' : '4a'} ${f.action.name}`;
        if (was[w] !== f.action) seen[f.action.name] = (seen[f.action.name] || 0) + 1;
        was[w] = f.action;
        if (clear < 0) bad.push(`${say}: a glove ${(clear * 100).toFixed(1)} cm into him`);
        if (f.action.t > 0.07 && !held && !f.down && Math.abs(i - blow[w]) > 4 && now[w] && prev[w] && prev2[w])
          for (const k of ['Left', 'Right']) {
            const jump = hyp(M.add(M.sub(now[w][k], M.scale(prev[w][k], 2)), prev2[w][k])) / DT;
            if (jump > JUMP) bad.push(`${say}, ${f.action.t.toFixed(2)} s in: the ${k.toLowerCase()} glove's velocity changes ${jump.toFixed(1)} m/s`);
          }
      });
      if (!held) (prev2 = prev), (prev = now);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok((seen.beckon || 0) >= 5 && Object.values(seen).reduce((s, n) => s + n, 0) >= 30, JSON.stringify(seen));
});
/* A paw (pawDown, pawUp: game/bout.mjs paws) pushes a glove held up as a guard; it does not push a taunting man's hands.
   The paw is chosen against his guard, and he begins a taunt a frame or three later, before the lead hand gets there (as
   in seed 53 above, frame 2926): pushed all the same, on top of what the taunt does with them, his gloves were thrown
   4.3 to 6.7 m/s a frame past the taunt's first 0.07 s in each of these that met one (30 of the 40; seed 53's tap of the
   chin, 12-13 m/s). Each paw, either grade, each taunt begun one and three frames after the press: no paw meets
   a taunting man, and away from a blow no glove of his changes velocity by more than JUMP in a frame. */
test('taunts: a paw does not push a taunting man\'s gloves, nor throw them', () => {
  const bad = [];
  for (const id of ['pawDown', 'pawUp'])
    for (const lv of SHOW)
      for (const taunt of TAUNT_IDS)
        for (const after of [1, 3]) {
          const card = SHOWOFF.find(x => x.id === `${id}@${lv}`),
            e = Object.assign({}, card, {
              hisCover: t => t > 0.1 && t < AT + after * DT,
              against: [[AT + after * DT, 'taunt', taunt]],
              setup: b => (card.setup(b), (b.fighters[1].skills = { all: '4a' }))
            }),
            bout = freshBout(e),
            [a, b] = bout.fighters,
            say = `${id}@${lv}, ${taunt} ${after} frame${after > 1 ? 's' : ''} after`;
          let prev = null,
            prev2 = null,
            taunted = false;
          for (let i = 0; i < Math.round(e.loop / DT); i++) {
            step(bout, drive(e, bout, i * DT, DT), DT);
            a.hp = b.hp = 1000;
            const on = b.action && MOVES[b.action.name].taunt,
              held = bout.stop > 0,
              g = b.points ? measure(b).gloves : null;
            taunted = taunted || !!on;
            for (const ev of bout.events) if (ev.type === 'paw' && on) bad.push(`${say}: pawed ${b.action.t.toFixed(2)} s into the taunt`);
            if (on && b.action.t > 0.07 && !held && g && prev && prev2 && !bout.events.some(ev => ['hit', 'block', 'parry'].includes(ev.type)))
              for (const k of ['Left', 'Right']) {
                const jump = hyp(M.add(M.sub(g[k], M.scale(prev[k], 2)), prev2[k])) / DT;
                if (jump > JUMP) bad.push(`${say}, ${b.action.t.toFixed(2)} s in: the ${k.toLowerCase()} glove's velocity changes ${jump.toFixed(1)} m/s`);
              }
            if (!held) (prev2 = prev), (prev = g);
          }
          assert.ok(taunted, `${say}: no taunt`);
        }
  assert.deepEqual(bad, []);
});

/* N19, beckon: held out long at the height of his face, 28 cm and more ahead of where his guard holds the lead glove (the
   same man's guard without the show-off's hand let down); beckoned three times, each pull back toward him 12 cm and more. */
test('beckon: the lead glove out far ahead of his guard and beckoned three times, 12 cm each', () => {
  for (const lv of SHOW) {
    const still = Object.assign({}, LEVEL[lv], { stance: Object.assign({}, LEVEL[lv].stance, { show: null, head: null, flourish: null }) }),
      guardRun = [];
    const g = freshBout(Object.assign({}, STANCES.find(e => e.id === `stance@${lv}`), { setup: b => (b.fighters[0].skills = { all: still }) }));
    for (let i = 0; i < 120; i++) {
      step(g, [{}, {}], DT);
      if (i >= 60) {
        const { p } = fk(g.fighters[0].pose);
        guardRun.push(M.add(p.LeftHand, M.scale(M.sub(p.LeftHand, p.LeftForeArm), GLOVE.ahead / Math.hypot(...M.sub(p.LeftHand, p.LeftForeArm))))[2]);
      }
    }
    const guard = guardRun.reduce((s, z) => s + z, 0) / guardRun.length,
      { during } = poseOf('beckon', lv),
      z = during.map(f => f.L[2]),
      ahead = Math.max(...z) - guard;
    assert.ok(ahead >= sized(lv, 0.28), `beckon@${lv}: ${(ahead * 100).toFixed(1)} cm ahead of his guard`);
    // (each beckon: from out at its furthest to back in at its nearest, before it goes out again or he puts it down)
    const outs = [];
    for (let i = 1; i < z.length - 1; i++) if (z[i] >= z[i - 1] && z[i] > z[i + 1] && z[i] - Math.min(...z.slice(i, i + 9)) > 0.05 && z[i] - Math.min(...z.slice(Math.max(0, i - 9), i)) > 0.05) outs.push(i);
    const pulls = outs.map(i => Math.max(...during.slice(i, i + 9).map(f => hyp(M.sub(f.L, during[i].L)))));
    assert.equal(outs.length, 3, `beckon@${lv}: ${outs.length} beckons`);
    for (const d of pulls) assert.ok(d >= sized(lv, 0.12), `beckon@${lv}: beckoned ${pulls.map(x => (x * 100).toFixed(1))} cm`);
  }
});

/* N20, chin out: no guard at all, the hands hanging all the way down at his sides (the same at either grade: hanging is
   hanging), for half a second and more neither glove within 30 cm of his head, and while they hang, both gloves 0.95 m or
   less off the canvas and both arms straight to 155 degrees and more. */
test('chin out: both hands hang all the way down, the arms straight, nowhere near his head for half a second', () => {
  for (const lv of SHOW) {
    const { during } = poseOf('chinOut', lv);
    let run0 = 0,
      best = [0, 0];
    during.forEach((f, i) => {
      const clear = Math.min(hyp(M.sub(f.at.L, f.at.head)), hyp(M.sub(f.at.R, f.at.head))) > 0.3;
      run0 = clear ? run0 + 1 : 0;
      if (run0 > best[1] - best[0]) best = [i - run0 + 1, i + 1];
    });
    assert.ok((best[1] - best[0]) * DT > 0.5, `chinOut@${lv}: clear of his head ${((best[1] - best[0]) * DT).toFixed(3)} s`);
    // (while they hang: the middle half of that)
    const n = best[1] - best[0],
      hanging = during.slice(best[0] + Math.floor(n / 4), best[1] - Math.floor(n / 4)),
      high = Math.max(...hanging.map(f => Math.max(f.at.L[1], f.at.R[1]))),
      bent = Math.min(...hanging.map(f => Math.min(...f.elbows)));
    assert.ok(high <= 0.95, `chinOut@${lv}: a glove ${(high * 100).toFixed(1)} cm off the canvas`);
    assert.ok(bent >= 155, `chinOut@${lv}: an elbow at ${bent.toFixed(1)}°`);
  }
});

/* N21, the windmill: both fists round circles in front of him, each 630 degrees and more round the middle of its own path
   (as he sees it from in front), the gloves never touching (20 cm, two gloves' radii, apart and more), and within the
   physics audit, the shoulder's table among it. (The glove in his other arm: the test above.) */
test('windmill: both fists round and round, each 630 degrees and more, never touching, within the audit', () => {
  for (const lv of SHOW) {
    const { during } = poseOf('wind', lv);
    for (const k of ['L', 'R']) {
      const xs = during.map(f => f[k][0]),
        ys = during.map(f => f[k][1]),
        mid = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
      let turned = 0;
      for (let i = 1; i < during.length; i++) {
        let d = Math.atan2(during[i][k][0] - mid[0], during[i][k][1] - mid[1]) - Math.atan2(during[i - 1][k][0] - mid[0], during[i - 1][k][1] - mid[1]);
        d = Math.atan2(Math.sin(d), Math.cos(d));
        turned += d;
      }
      assert.ok(Math.abs((turned * 180) / Math.PI) >= 630, `wind@${lv}: the ${k} glove went ${((turned * 180) / Math.PI).toFixed(0)}° round`);
    }
    const apart = Math.min(...during.map(f => hyp(M.sub(f.at.L, f.at.R))));
    assert.ok(apart >= 0.2, `wind@${lv}: the gloves ${(apart * 100).toFixed(1)} cm apart`);
  }
  const { found } = audit(SHOW.map(lv => TAUNTING.find(x => x.id === `wind@${lv}`))),
    broken = Object.entries(found)
      .filter(([, c]) => c.bad)
      .map(([check, c]) => `${check}: ${c.bad}`);
  assert.deepEqual(broken, []);
});

/* N22, the shrug: the hands thrown open out to his sides, the gloves 75 cm and more apart (the 20 cm his guard holds them
   apart and 55 more; a legend's 0.75 of the 55: 61), and both shoulders up 3 cm and more (as his chest sees them). */
test('shrug: the hands out to his sides, both shoulders up', () => {
  for (const lv of SHOW) {
    const { frames, during, first } = poseOf('shrug', lv),
      apart = Math.max(...during.map(f => hyp(M.sub(f.at.L, f.at.R)))),
      before = frames[first - 1].shoulders,
      up = [0, 1].map(i => Math.max(...during.map(f => f.shoulders[i] - before[i])));
    assert.ok(apart >= 0.2 + sized(lv, 0.55), `shrug@${lv}: the gloves ${(apart * 100).toFixed(1)} cm apart`);
    for (const u of up) assert.ok(u >= 0.03, `shrug@${lv}: the shoulders up ${up.map(x => (x * 100).toFixed(1))} cm`);
  }
});

/* N23, tapping the chin: three taps, at each the glove's surface within 1 cm of his chin, drawn back 9 cm and more between
   them (a legend's 0.75 of it), coming onto it at 1.5 m/s and more, and the head nodding 3 degrees and more with each. */
test('tap the chin: three hard taps right on the chin, drawn well back between, the head nodding to each', () => {
  for (const lv of SHOW) {
    const { during } = poseOf('tapChin', lv),
      off = during.map(f => hyp(M.sub(f.R, f.chin)) - GLOVE.r),
      taps = [];
    for (let i = 2; i < off.length - 1; i++) if (off[i] < off[i - 1] && off[i] <= off[i + 1] && Math.max(...off.slice(Math.max(0, i - 12), i)) - off[i] > 0.05) taps.push(i);
    const say = `tapChin@${lv}: ${JSON.stringify(taps.map(i => ({ off: +(off[i] * 100).toFixed(1), back: +((Math.max(...off.slice(Math.max(0, i - 12), i)) - off[i]) * 100).toFixed(1), speed: +((Math.max(off[i - 1] - off[i], off[i - 2] - off[i - 1]) / DT).toFixed(2)), nod: +(during[i].nod - Math.min(...during.slice(Math.max(0, i - 12), i).map(f => f.nod))).toFixed(1) })))}`;
    assert.equal(taps.length, 3, say);
    for (const i of taps) {
      assert.ok(Math.abs(off[i]) <= 0.01, say);
      assert.ok(Math.max(...off.slice(Math.max(0, i - 12), i)) - off[i] >= sized(lv, 0.09), say);
      assert.ok(Math.max(off[i - 1] - off[i], off[i - 2] - off[i - 1]) / DT >= 1.5, say);
      assert.ok(during[i].nod - Math.min(...during.slice(Math.max(0, i - 12), i).map(f => f.nod)) >= 3, say);
    }
  }
});

test('flicker: the same bout goes the same way', () => {
  const once = () => run(SHOWOFF.find(x => x.id === 'flicker@5a')).frames.map(f => f.gloves.L.map(v => +v.toFixed(6)));
  assert.deepEqual(once(), once());
});

/* ---- the chances (§5.2, §5.4): a thousand throws of his dice come out as the table says, within five points */
test('chances: a thousand throws turn up each trick and each taunt as often as the table says', () => {
  for (const lv of SHOW)
    for (const button of ['jab', 'power']) {
      const table = LEVEL[lv].vary[button],
        roll = dice(11),
        n = 1000;
      // (what can be done at once: a jab's two; a power press's, by the punch it is, with his guard up and without)
      const sets = button === 'jab' ? [['thumb', 'flicker']] : [['pawUp', 'pawDown', 'elbow'], ['pawUp', 'pawDown', 'collar'], ['pawUp', 'pawDown', 'stomp'], ['elbow'], ['collar'], ['stomp']];
      for (const set of sets) {
        const count = {};
        for (let i = 0; i < n; i++) {
          const t = choose(table, x => set.includes(x), null, roll());
          count[t] = (count[t] || 0) + 1;
        }
        for (const [name, p] of table) assert.ok(Math.abs((count[name] || 0) / n - (set.includes(name) ? p : 0)) <= 0.05, `${lv} ${button} ${set} ${name}: ${count[name] || 0} of ${n}, the table ${p}`);
      }
    }
  for (const lv of SHOW)
    for (const [when, p] of Object.entries(LEVEL[lv].stance.show.taunt)) {
      const roll = dice(23);
      let k = 0;
      for (let i = 0; i < 1000; i++) if (roll() < p) k++;
      assert.ok(Math.abs(k / 1000 - p) <= 0.05, `${lv} taunt ${when}: ${k}`);
    }
});

/* In a real bout (vary) the dice throw for every press: the same seed throws the same, another seed another mix, and at the
   clean grades and below nothing comes up at all, trick or taunt. */
function real(seed, lv, seconds = 12) {
  const bout = createBout(seed, { vary: true, skills: [{ all: lv }, { stance: '2' }] }),
    [a, b] = bout.fighters,
    out = [];
  [a.x, b.x] = [-0.4, 0.4];
  settle(bout);
  for (let i = 0; i < seconds * 60; i++) {
    const k = i % 60;
    // (a jab and a power punch every second, from 0.8 m, his guard up half the time; and a while standing doing nothing)
    step(bout, [i < seconds * 30 ? (k === 0 ? { jab: true } : k === 30 ? { power: true } : {}) : {}, { cover: i % 120 < 60 }], DT);
    b.hp = 1000;
    a.hp = 1000;
    a.x = Math.min(a.x, b.x - 0.8);
    for (const ev of bout.events) if (ev.who === 0 && (ev.type === 'punch' || ev.type === 'taunt')) out.push(ev.type === 'taunt' ? 'taunt ' + ev.name : (a.action && a.action.variant) || ev.name);
  }
  return out;
}
test('chances: the same seed throws the same, another seed another mix; the clean grades and below throw nothing', () => {
  for (const lv of SHOW) {
    const one = real(3, lv),
      again = real(3, lv),
      other = real(8, lv);
    assert.deepEqual(one, again, lv);
    assert.notDeepEqual(one, other, lv);
    assert.ok(one.some(x => ['flicker', 'thumb', 'pawDown', 'pawUp', 'collar', 'elbow', 'stomp'].includes(x)), `${lv}: ${one.join(' ')}`);
  }
  for (const lv of others) assert.ok(real(3, lv, 8).every(x => ['jab', 'cross', 'hook', 'upper', 'hookIn', 'upperIn'].includes(x)), lv);
});
