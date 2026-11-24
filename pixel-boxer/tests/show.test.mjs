/* The showy dirty fighter (docs/moves-plan-4.md §5, anim/show.mjs): at 4암 and 5암 only, and nothing of it at any other grade.
   Each technique is held to showing at the right grades, to being the same for the same seed, and to doing what the plan
   says it does, measured on the bout. The cross-arm guard and the shoulder roll (docs/moves-plan-5.md §4A) are techniques a
   man carries (game/techniques.mjs: crossArm from 3 up, by default the dirty great ones'; rollCounter from 4 up), held to
   the plan's §4A.10, and the roll & counter to §4A.7. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, crossOf } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW, CROSS_BODY, CROSS_BODY_ROWS, ROLLING } from '../src/defense.mjs';
import { LEVELS, LEVEL, CROSS, ROLL } from '../src/anim/skill.mjs';
import { aimAt } from '../src/bodyshots.mjs';
import { where } from '../src/game/trunk.mjs';
import { local } from '../src/game/bout.mjs';
import { audit, measure } from '../src/audit.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import { run, rung } from '../src/measure.mjs';
import { STANCES, SHOWOFF, TAUNTING } from '../src/ladder.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import * as M from '../src/rig/m3.mjs';
import { createBout, settle } from '../src/game/bout.mjs';
import { choose } from '../src/anim/show.mjs';
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
   coming down toward the uppercut as it goes up, and the uppercut harder for it than the same one pressed plain. */
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
  const LONG = { beckon: 0.6, chinOut: 0.7, shrug: 0.4, wind: 0.8, tapChin: 0.5 };
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
