/* The showy dirty fighter (docs/moves-plan-4.md §5, anim/show.mjs): at 4암 and 5암 only, and nothing of it at any other grade.
   Each technique is held to showing at the right grades, to being the same for the same seed, and to doing what the plan
   says it does, measured on the bout. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW } from '../src/defense.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { run } from '../src/measure.mjs';
import { STANCES, SHOWOFF, TAUNTING } from '../src/ladder.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import * as M from '../src/rig/m3.mjs';
import { createBout, settle } from '../src/game/bout.mjs';
import { choose } from '../src/anim/show.mjs';
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
// the other man throws `punch` (as the defence cards throw it) into his guard, held from `from` (or put up k frames after the press)
const into = (lv, punch, o = {}) => {
  const at = { jab: 0.8, cross: 0.8, hook: 1.1, upper: 1.3 }[punch];
  return {
    id: `into-${punch}@${lv}`,
    loop: at + 0.8,
    me: () => HOME,
    him: () => [HOME[0] + (o.range || RANGE[punch]), HOME[1]],
    against: THROW[punch].map(([dt, b]) => [at + dt, b]),
    cover: o.k !== undefined ? t => t >= at + o.k * DT - 1e-9 && t < at + 0.4 : t => t > 0.2,
    setup: b => (b.fighters[0].skills = { all: lv })
  };
};
const last = (events, name) => events.filter(e => e.who === 1 && e.name === name && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)).concat(events.filter(e => e.type === 'parry' && e.on === 1 && e.name === name)).pop();

test('show: the show-off\'s stance, guard and parry are the dirty great ones\' alone', () => {
  for (const lv of SHOW) assert.ok(LEVEL[lv].stance.show && LEVEL[lv].cover.cross && LEVEL[lv].cover.hammer, lv);
  for (const lv of others) assert.ok(!LEVEL[lv].stance.show && !LEVEL[lv].cover.cross && !LEVEL[lv].cover.hammer, lv);
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

test('cross-arm guard: the forearms stop a jab and a cross; an uppercut comes up under them and lands', () => {
  for (const lv of SHOW) {
    for (const p of ['jab', 'cross']) {
      const e = last(fight(into(lv, p)), p);
      assert.equal(e && e.type, 'block', `${p}@${lv}: ${JSON.stringify(e)}`);
      assert.equal(e.part, 'forearm', `${p}@${lv}: met by the ${e.part}`);
    }
    const up = last(fight(into(lv, 'upper')), 'upper');
    assert.equal(up && up.type, 'hit', `upper@${lv}: ${JSON.stringify(up)}`);
  }
  // (a clean great one's two gloves in front of his face take the same uppercut)
  for (const lv of ['3', '4m']) assert.equal(last(fight(into(lv, 'upper')), 'upper').type, 'block', lv);
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
