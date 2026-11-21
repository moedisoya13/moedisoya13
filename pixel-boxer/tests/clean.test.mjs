// A clean great one's own techniques (docs/moves-plan-5.md §4, anim/clean.mjs). The wave (§4.1): circling wide at the end of
// the other man's reach, the hands let down, the head rising and falling as the feet slide apart and together; the slick back
// off a punch coming in the middle of it. Only 4명 and 5명 have it: asked of anyone else it is the circle out.
// The down parry and counter (§4.2): his guard put up fresh, meant as it, presses the jab down from above with the rear glove,
// and the counter goes from the hand that pressed it. Only 4명 and 5명 who carry it; it does not take the place of the parry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/measure.mjs';
import { WAVING, STANCES } from '../src/ladder.mjs';
import { createBout, step, settle, RULES } from '../src/game/bout.mjs';
import { audit } from '../src/audit.mjs';
import { WAVE } from '../src/anim/clean.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW, PARRY_DOWN, PARRY_DOWN_WINDOW } from '../src/defense.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import * as M from '../src/rig/m3.mjs';

const DT = 1 / 60;
const card = id => WAVING.find(e => e.id === id);
const deg = r => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* A bout of his own: him (4명 or 5명, or any grade) at `from` metres from the other man (a pro, or as `his` says), the wave's
   value given from 0.3 s for as long as `hold` says, and whatever else `inputs(t, a, b)` adds (both men's controls). A frame a
   step: where both stand, his head and gloves, what he and the bout are doing. */
function bout(lv, o = {}) {
  const b0 = createBout(7),
    [a, b] = b0.fighters,
    from = o.from ?? 1.62;
  [a.x, a.z] = o.at || [-from, 0];
  [b.x, b.z] = o.him || [0, 0];
  a.skills = { all: lv };
  // (he carries the wave, game/techniques.mjs: what his grade does with it is the question here)
  a.techniques = o.techniques || ['wave'];
  b.skills = o.his || { all: '3' };
  settle(b0);
  const frames = [],
    hold = o.hold || [0.3, Infinity];
  for (let tick = 0; tick < Math.round(o.seconds / DT); tick++) {
    const t = tick * DT,
      mine = t >= hold[0] && t < hold[1] ? { away: o.away || 'wave', side: o.side || 1 } : {},
      his = {};
    if (o.inputs) o.inputs(t, a, b, mine, his);
    step(b0, [mine, his], DT);
    a.hp = b.hp = 1000;
    const w = a.animator.wave;
    frames.push({
      t,
      at: [a.x, a.z],
      him: [b.x, b.z],
      yaw: a.yaw,
      head: a.points.head.slice(),
      L: a.points.L.slice(),
      R: a.points.R.slice(),
      feet: [a.pose.at.LeftToeBase, a.pose.at.RightToeBase].map(p => p.slice()),
      action: a.action ? a.action.name : null,
      loaded: a.action && a.action.loaded ? a.action.loaded.from : null,
      waving: !!a.wave,
      k: w ? w.k : null,
      ending: w ? w.ending : null,
      events: b0.events.map(e => ({ ...e }))
    });
  }
  return { frames, bout: b0 };
}
// his own guard, standing still in it: where his head and gloves are, and how far apart the balls of his feet are
const guards = {};
function guardOf(lv) {
  if (guards[lv]) return guards[lv];
  const { frames } = run(STANCES.find(e => e.id === `stance@${lv}`), 3),
    mean = f => frames.reduce((s, x) => s + f(x), 0) / frames.length;
  return (guards[lv] = { L: mean(f => f.gloves.L[1]), R: mean(f => f.gloves.R[1]), head: mean(f => f.headY), feet: dist(frames[0].foot.L, frames[0].foot.R) });
}
// the head's lowest moments, a wave apart: each the lowest within a fifth of a second either side
function lows(frames) {
  const out = [];
  for (let i = 12; i < frames.length - 12; i++) {
    const y = frames[i].head[1];
    if (frames.slice(i - 12, i + 13).every(f => f.head[1] >= y)) out.push(i);
  }
  return out;
}
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));

test('wave: four seconds round him in the band, square to him all the way, going round as fast as his feet allow', () => {
  for (const lv of ['4m', '5m']) {
    const { frames } = bout(lv, { seconds: 5 }),
      first = frames.findIndex(f => f.k === 0),
      span = frames.slice(first, first + 240);
    assert.ok(first > 0 && first < 40, `${lv}: his first wave starts ${first} frames in`);
    let round = 0;
    for (let i = 1; i < span.length; i++) {
      const [p, q] = [span[i - 1], span[i]].map(f => Math.atan2(f.at[1] - f.him[1], f.at[0] - f.him[0]));
      round += Math.atan2(Math.sin(q - p), Math.cos(q - p));
      const d = Math.hypot(span[i].at[0] - span[i].him[0], span[i].at[1] - span[i].him[1]),
        face = Math.atan2(span[i].him[0] - span[i].at[0], span[i].him[1] - span[i].at[1]) - span[i].yaw;
      assert.ok(d >= 1.5 && d <= 1.9, `${lv} @ ${span[i].t.toFixed(2)}: ${d.toFixed(2)} m apart`);
      assert.ok(Math.abs(deg(Math.atan2(Math.sin(face), Math.cos(face)))) <= 5, `${lv} @ ${span[i].t.toFixed(2)}: ${deg(face).toFixed(1)}° off square`);
    }
    /* (the plan asks 200°: 1.9 m/s round him. One slide a wave, each foot steps once a wave, so a wave goes round as far as
       the feet go apart less how far together (0.75 m, the feet 1.6 times the stance apart and 0.85 together): 0.86 m/s at
       0.87 s a wave, about 30° a second at 1.62 m. The rest would take feet that slide on the canvas: README, the wave.) */
    assert.ok(Math.abs(deg(round)) >= 110, `${lv}: ${deg(round).toFixed(0)}° round him in four seconds`);
  }
});

test('wave: the head rises and falls once a wave, 0.87 s at 4명 and 13 cm or more; a legend\'s waves are never the same length', () => {
  const four = bout('4m', { seconds: 6 }).frames,
    five = bout('5m', { seconds: 12 }).frames,
    from = f => f.findIndex(x => x.k === 1),
    periods = (f, i) => {
      const at = lows(f.slice(i));
      return at.slice(1).map((x, j) => (x - at[j]) * DT);
    },
    p4 = periods(four, from(four)),
    p5 = periods(five, from(five));
  assert.ok(p4.length >= 4, `${p4.length} waves at 4명`);
  assert.ok(Math.abs(mean(p4) - 0.87) <= 0.087, `4명: a wave every ${mean(p4).toFixed(3)} s`);
  for (const p of p4) assert.ok(Math.abs(p - 0.87) <= 0.087, `4명: a wave of ${p.toFixed(3)} s`);
  // (from the top of each wave to its bottom)
  const at = lows(four.slice(from(four))).map(i => i + from(four));
  for (let j = 1; j < at.length; j++) {
    const ys = four.slice(at[j - 1], at[j] + 1).map(f => f.head[1]);
    assert.ok(Math.max(...ys) - four[at[j]].head[1] >= 0.1, `4명: a wave ${((Math.max(...ys) - four[at[j]].head[1]) * 100).toFixed(1)} cm deep`);
  }
  assert.ok(p5.length >= 8, `${p5.length} waves at 5명`);
  assert.ok(sd(p5) / mean(p5) >= 0.15, `5명: the waves' lengths vary by ${(sd(p5) / mean(p5)).toFixed(2)} of their mean`);
});

test('wave: the gloves let down (4명 20 cm, 5명 30 cm under his guard), the feet 1.35 times the stance apart and 0.9 together', () => {
  for (const [lv, under] of [['4m', 0.2], ['5m', 0.3]]) {
    const g = guardOf(lv),
      { frames } = bout(lv, { seconds: 5 }),
      span = frames.filter(f => f.k >= 1 && !f.ending);
    assert.ok(span.length > 150, `${lv}: ${span.length} frames in the wave`);
    for (const f of span) {
      assert.ok(g.L - f.L[1] >= under && g.R - f.R[1] >= under, `${lv} @ ${f.t.toFixed(2)}: gloves ${((g.L - f.L[1]) * 100).toFixed(1)} / ${((g.R - f.R[1]) * 100).toFixed(1)} cm under his guard`);
    }
    const apart = span.map(f => dist(f.feet[0], f.feet[1]) / g.feet);
    assert.ok(Math.max(...apart) >= 1.35, `${lv}: the feet at most ${Math.max(...apart).toFixed(2)} of the stance apart`);
    assert.ok(Math.min(...apart) <= 0.9, `${lv}: the feet at least ${Math.min(...apart).toFixed(2)} of the stance apart`);
  }
});

/* A pro in front of him: a jab from where he stands, or a step jab (walking in at him for 0.3 s, the jab 0.2 s after he sets
   off), or a cross started 1.2 m from him (walking in until they are that close, the cross from there). At eight moments
   across a wave of his, the third. -> what came of each: hit, graze, whiff (or nothing). */
function punches(lv, kind, wave = true) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const at = 2.0 + (0.87 * i) / 8;
    let crossed = false;
    const { frames } = bout(lv, {
      seconds: at + 1,
      hold: wave ? [0.3, Infinity] : [Infinity, Infinity],
      inputs: (t, a, b, mine, his) => {
        const d = Math.hypot(a.x - b.x, a.z - b.z) || 1,
          toward = [(a.x - b.x) / d, (a.z - b.z) / d];
        if (kind === 'jab' && Math.abs(t - at) < DT / 2) his.jab = true;
        if (kind === 'step') {
          if (t >= at && t < at + 0.3) his.move = toward;
          if (Math.abs(t - at - 0.2) < DT / 2) his.jab = true;
        }
        if (kind === 'cross' && t >= at && !crossed) {
          his.move = toward;
          if (d <= 1.2) (his.power = true), (crossed = true);
        }
      }
    });
    const e = frames.flatMap(f => f.events).find(e => e.who === 1 && ['hit', 'graze', 'whiff', 'block'].includes(e.type));
    out.push(e ? { type: e.type, J: e.J, margin: e.margin } : { type: 'none' });
  }
  return out;
}

test('wave: a jab from where the pro stands never lands; a step jab is slicked back off (4명 60%, 5명 80% of the wave), and lands on him standing', () => {
  for (const [lv, most] of [['4m', 0.6], ['5m', 0.8]]) {
    const jabs = punches(lv, 'jab');
    assert.ok(jabs.every(x => x.type === 'whiff' || x.type === 'none'), `${lv}: ${JSON.stringify(jabs)}`);
    const steps = punches(lv, 'step'),
      missed = steps.filter(x => x.type === 'whiff' || x.type === 'none').length;
    assert.ok(missed / steps.length >= most, `${lv}: the step jab missed ${missed} of ${steps.length}: ${JSON.stringify(steps)}`);
    // (and it is the slick back that does it: the same step jab at him standing in his guard where he started lands)
    const standing = punches(lv, 'step', false);
    assert.ok(standing.every(x => x.type === 'hit'), `${lv} standing: ${JSON.stringify(standing)}`);
  }
});

test('wave: a cross started 1.2 m from him follows his head back and lands (what the wave leaves open)', () => {
  for (const lv of ['4m', '5m']) {
    const crosses = punches(lv, 'cross');
    assert.ok(crosses.every(x => x.type === 'hit' && x.J >= RULES.graze), `${lv}: ${JSON.stringify(crosses)}`);
  }
});

test('wave: any other grade asked for it circles out, exactly as if he had been asked to; so does a 4명 who does not carry it', () => {
  for (const [lv, techniques] of [['1'], ['2'], ['3'], ['4a'], ['5a'], ['4m', []], ['5m', ['pullCounter']]]) {
    const wave = bout(lv, { seconds: 2.5, from: 1.0, techniques }).frames,
      circle = bout(lv, { seconds: 2.5, from: 1.0, away: 'circle', techniques }).frames;
    assert.ok(wave.some(f => f.action === 'hopCircle') && !wave.some(f => f.action === 'wave'), lv);
    assert.deepEqual(wave.map(f => [f.at, f.head, f.L, f.R, f.yaw]), circle.map(f => [f.at, f.head, f.L, f.R, f.yaw]), lv);
  }
});

test('wave: two waves however short the press, then the hands back up and his feet his own; the ropes in the way end it', () => {
  for (const lv of ['4m', '5m']) {
    const { frames } = bout(lv, { seconds: 3.5, hold: [0.3, 0.4] }),
      last = frames.filter(f => f.action === 'wave').pop(),
      g = guardOf(lv);
    assert.ok(Math.max(...frames.map(f => f.k ?? -1)) >= WAVE.least - 1, `${lv}: ${Math.max(...frames.map(f => f.k ?? -1)) + 1} waves`);
    assert.ok(last && last.ending, `${lv}: it ends from the top of a wave`);
    const after = frames.find(f => f.t >= last.t + 0.3);
    assert.ok(after.action === null && !after.waving, `${lv}: still ${after.action}`);
    assert.ok(Math.abs(after.L[1] - g.L) < 0.08 && Math.abs(after.R[1] - g.R) < 0.08, `${lv}: gloves ${((after.L[1] - g.L) * 100).toFixed(1)} / ${((after.R[1] - g.R) * 100).toFixed(1)} cm off his guard`);
  }
  // (going round toward the ropes, 0.9 m from them: over before two waves, though it is still asked for, and not begun again)
  const { frames } = bout('4m', { seconds: 3, at: [-1.6, RULES.half - 0.9], him: [0, RULES.half - 0.9], side: -1 }),
    over = frames.findIndex((f, i) => i > 30 && f.action !== 'wave');
  assert.ok(over > 0 && frames[over - 1].k < WAVE.least, `the wave went on to wave ${over > 0 ? frames[over - 1].k : 'the end'}`);
  assert.ok(frames.slice(over).every(f => f.action !== 'wave'), 'and was begun again');
  assert.ok(frames.every(f => RULES.half - Math.abs(f.at[1]) > 0.45), `${Math.min(...frames.map(f => RULES.half - Math.abs(f.at[1]))).toFixed(2)} m from the ropes`);
});

test('wave: a jab out of it comes up from the low hand and the wave goes on; a power punch puts an end to it; the same bout goes the same way', () => {
  const { frames } = bout('5m', {
      seconds: 3.4,
      inputs: (t, a, b, mine) => {
        if (Math.abs(t - 2.0) < DT / 2) mine.jab = true;
      }
    }),
    jab = frames.find(f => f.action === 'jab');
  assert.equal(jab.loaded, 'wave');
  assert.ok(jab.waving, 'still in the wave as he jabs');
  assert.ok(frames.some(f => f.t > jab.t + 0.2 && f.action === 'wave'), 'and back in it after');
  const power = bout('4m', { seconds: 2.5, hold: [0.3, 2.0], inputs: (t, a, b, mine) => Math.abs(t - 1.8) < DT / 2 && (mine.power = true) }).frames,
    cross = power.find(f => f.action === 'cross');
  assert.ok(cross && !cross.waving, 'a power punch ends the wave');
  const again = bout('5m', { seconds: 3 }).frames;
  assert.deepEqual(again.map(f => f.head), bout('5m', { seconds: 3 }).frames.map(f => f.head));
});

test('wave: nothing in the wave breaks anything a body can do (the cards, and a legend going round for twelve seconds)', () => {
  const long = {
    id: 'wave-long@5m',
    loop: 12,
    me: t => (t === 0 ? [-1.62, 0] : null),
    him: () => [0, 0],
    setup: b => ((b.fighters[0].skills = { all: '5m' }), (b.fighters[0].techniques = ['wave']), (b.fighters[1].skills = { stance: '2' })),
    cue: (b, t) => (t >= 0.3 && t < 11 ? ['away', 'wave'] : null)
  };
  const { found, seen } = audit([...WAVING, long]);
  assert.ok(seen > 3000, `${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .flatMap(([check, c]) => c.cases.map(k => `${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`));
  assert.deepEqual(broken, []);
});

/* ---- The down parry and counter (§4.2). A drill as the parry card's: the same pro throws `punch` from where the parry card's
   man stands, and the boxer (his grade lv) puts his guard up on frame k after the press and keeps it up 0.4 s, meant as the
   down parry (o.tech, by default), carrying it (o.carry: his loadout, by default ['parryDown']); o.counter: and takes the
   opening at once (a power press as soon as it is made). A frame a step: both men's gloves and what happened. */
function pressDown(lv, punch, k, o = {}) {
  const at = 0.8,
    tech = o.tech === undefined ? 'parryDown' : o.tech,
    e = {
      id: `pd-${punch}@${lv}+${k}`,
      loop: at + (o.counter ? 1.0 : 0.9),
      me: () => HOME,
      him: () => [HOME[0] + RANGE[punch], HOME[1]],
      against: THROW[punch].map(([dt, b]) => [at + dt, b]),
      setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = o.carry || ['parryDown'])),
      cover: t => t >= at + k * DT - 1e-9 && t < at + 0.4,
      cue: (b, t) => {
        const f = b.fighters[0],
          own = (f.cues = f.cues || {});
        if (o.counter && !own.countered && f.counter > 0) return (own.countered = true), 'power';
        return tech && t >= at + k * DT - 1e-9 && t < at + 0.4 ? ['tech', tech] : null;
      }
    },
    bout = freshBout(e),
    [a, b] = bout.fighters,
    frames = [];
  for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    a.hp = b.hp = 1000;
    frames.push({ t: bout.t, held: bout.stop > 0, R: a.points.R.slice(), his: { L: b.points.L.slice(), R: b.points.R.slice() }, at: [b.x, b.z], action: b.action ? b.action.name : null, mine: a.action ? a.action.name : null, stun: b.stun, events: bout.events.map(x => ({ ...x })) });
  }
  return frames;
}
// what became of the punch: the defender's parry (a down parry 'parryD', a hammer 'parryH'), or the other man's hit, block, whiff
const fate = frames => {
  for (const f of frames)
    for (const e of f.events)
      if ((e.type === 'parry' && e.on === 1) || (e.who === 1 && ['hit', 'block', 'whiff', 'graze'].includes(e.type))) return e.type === 'parry' ? (e.down ? 'parryD' : e.hammer ? 'parryH' : 'parry') : e.type;
  return null;
};
const downAt = frames => frames.findIndex(f => f.events.some(e => e.type === 'parry' && e.down));
// (a glove of his as he stands before anything is thrown)
const standing = (frames, get) => frames.slice(30, 45).reduce((s, f) => s + get(f), 0) / 15;

test('down parry: only 4명 and 5명 have one, and only a man who carries it presses a punch down with it', () => {
  for (const lv of LEVELS) assert.equal(!!LEVEL[lv].pat, lv === '4m' || lv === '5m', lv);
  // (asked for it, but not carried, or at a grade without one: the parry he puts up otherwise)
  assert.equal(fate(pressDown('4m', 'jab', -1, { carry: [] })), 'parry');
  assert.equal(fate(pressDown('3', 'jab', -1)), 'parry');
});

test('down parry: the rear glove comes down on the jab from above, on the frame it meets it, and presses it 15 cm or more under his guard', () => {
  for (const lv of ['4m', '5m']) {
    const frames = pressDown(lv, 'jab', PARRY_DOWN_WINDOW[lv].at),
      i = downAt(frames);
    assert.ok(i > 0, `${lv}: ${JSON.stringify(frames.flatMap(f => f.events.map(e => e.type)))}`);
    const f = frames[i],
      e = f.events.find(x => x.type === 'parry');
    assert.equal(e.name, 'jab');
    // (glove on glove as it presses it: the two within a glove's width of each other, his rear glove the higher)
    const apart = Math.hypot(...M.sub(f.R, f.his.L));
    assert.ok(apart <= 2 * RULES.glove + 0.03, `${lv}: the gloves ${(apart * 100).toFixed(1)} cm apart`);
    assert.ok(f.R[1] >= f.his.L[1] - 0.01, `${lv}: his rear glove ${((f.R[1] - f.his.L[1]) * 100).toFixed(1)} cm over the jab`);
    // (once: no other parry, and the jab neither lands nor is blocked)
    assert.equal(frames.flatMap(x => x.events).filter(x => x.type === 'parry' || (x.who === 1 && ['hit', 'block'].includes(x.type))).length, 1);
    const lowest = Math.min(...frames.slice(i, i + 25).map(x => x.his.L[1])),
      guard = standing(frames, x => x.his.L[1]);
    assert.ok(guard - lowest >= 0.15, `${lv}: his lead glove pressed ${((guard - lowest) * 100).toFixed(1)} cm under his guard`);
  }
});

test('down parry: its window is the one measured, the card on a frame inside it; a frame either side of it presses nothing down', () => {
  for (const lv of ['4m', '5m']) {
    const w = PARRY_DOWN_WINDOW[lv];
    assert.ok(w.at >= w.from && w.at <= w.to, lv);
    for (const k of [w.from, w.at, w.to]) assert.equal(fate(pressDown(lv, 'jab', k)), 'parryD', `${lv}: frame ${k}`);
    for (const k of [w.from - 1, w.to + 1]) assert.notEqual(fate(pressDown(lv, 'jab', k)), 'parryD', `${lv}: frame ${k}`);
  }
});

test('down parry: met any other way, or on the guard put up for it, the jab is blocked, not turned aside', () => {
  for (const lv of ['4m', '5m']) {
    const w = PARRY_DOWN_WINDOW[lv];
    // (up too early, his guard no longer fresh; and too late for the rear glove to get out and down: the guard is in the way)
    for (const k of [w.from - 4, w.to + 1]) assert.equal(fate(pressDown(lv, 'jab', k)), 'block', `${lv}: frame ${k}`);
  }
});

test('down parry: a legend presses a cross down too; a 4명 blocks it', () => {
  for (const k of [-2, 1, 4]) assert.equal(fate(pressDown('5m', 'cross', k)), 'parryD', `5명, frame ${k}`);
  for (const k of [-3, 0, 3]) assert.equal(fate(pressDown('4m', 'cross', k)), 'block', `4명, frame ${k}`);
});

test('down parry: the man pressed down is held 0.35 s, and not knocked back', () => {
  for (const lv of ['4m', '5m']) {
    const frames = pressDown(lv, 'jab', PARRY_DOWN_WINDOW[lv].at),
      i = downAt(frames),
      after = frames.slice(i).filter(f => !f.held);
    assert.equal(frames[i].action, 'patted');
    assert.ok(Math.abs(frames[i].stun - LEVEL[lv].pat.stun) < 1e-9, `${lv}: ${frames[i].stun}`);
    // (nothing shoves him: his place goes no further than his own feet take it, a few centimetres)
    const moved = Math.max(...after.slice(0, 20).map(f => Math.hypot(f.at[0] - frames[i].at[0], f.at[1] - frames[i].at[1])));
    assert.ok(moved < 0.04, `${lv}: moved ${(moved * 100).toFixed(1)} cm`);
  }
});

test('down parry: the counter goes from the hand that pressed it, from where it is: 4명 the cross 0.18–0.28 s after, 5명 the jab 0.06–0.12 s after and the cross behind it', () => {
  const after = (frames, name) => {
    const i = downAt(frames),
      f = frames.slice(i).find(x => x.events.some(e => e.type === 'hit' && e.who === 0 && e.name === name));
    return f ? { dt: +(f.t - frames[i].t).toFixed(3), J: f.events.find(e => e.type === 'hit').J } : null;
  };
  const four = pressDown('4m', 'jab', PARRY_DOWN_WINDOW['4m'].at, { counter: true }),
    cross4 = after(four, 'cross');
  assert.ok(cross4 && cross4.dt >= 0.18 && cross4.dt <= 0.28, `4명: ${JSON.stringify(cross4)}`);
  assert.ok(cross4.J >= 50, `4명: ${cross4.J} N·s`);
  /* (it starts low, where the pressing hand has pressed the jab down to, 10 cm or more under where it met it, and does not go
     back up into the guard first: the hand never higher than where it met the jab until the cross is on its way) */
  const i = downAt(four),
    start = four.findIndex((f, j) => j > i && f.mine === 'cross'),
    thrown = four.findIndex((f, j) => j > start && f.R[2] > four[start].R[2] + 0.03),
    before = four.slice(i + 1, thrown).filter(f => !f.held);
  assert.ok(Math.max(...before.map(f => f.R[1])) <= four[i].R[1] + 0.01, '4명: the hand went back up before the cross');
  assert.ok(four[thrown - 1].R[1] <= four[i].R[1] - 0.1, `4명: the cross goes from ${((four[i].R[1] - four[thrown - 1].R[1]) * 100).toFixed(1)} cm under where it met the jab`);
  const five = pressDown('5m', 'jab', PARRY_DOWN_WINDOW['5m'].at, { counter: true }),
    jab5 = after(five, 'jab'),
    cross5 = after(five, 'cross');
  assert.ok(jab5 && jab5.dt >= 0.06 && jab5.dt <= 0.12, `5명 jab: ${JSON.stringify(jab5)}`);
  assert.ok(cross5 && cross5.dt > jab5.dt && cross5.dt <= 0.3, `5명 cross: ${JSON.stringify(cross5)}`);
});

test('down parry: the parry he puts up without it is as it was (4명·5명 and 1–3 turn it aside, 4암·5암 hammer it)', () => {
  for (const lv of LEVELS) assert.equal(fate(pressDown(lv, 'jab', -1, { tech: null })), LEVEL[lv].cover.hammer ? 'parryH' : 'parry', lv);
});

test('down parry: the cards press the jab down and the counter lands, the same every time, and nothing in them breaks anything a body can do', () => {
  for (const e of PARRY_DOWN) {
    const once = () => {
      const bout = freshBout(e),
        out = [];
      for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
        step(bout, drive(e, bout, tick * DT, DT), DT);
        bout.fighters[0].hp = bout.fighters[1].hp = 1000;
        for (const x of bout.events) if (['hit', 'block', 'parry', 'whiff'].includes(x.type)) out.push(`${x.type}${x.down ? ' down' : ''} ${x.who} ${x.name} ${x.J}`);
      }
      return out;
    };
    const out = once();
    assert.match(out[0], /^parry down 0 jab/, `${e.id}: ${out}`);
    assert.ok(out.slice(1).some(x => /^hit 0 cross/.test(x)), `${e.id}: ${out}`);
    assert.deepEqual(once(), out, e.id);
  }
  const { found, seen } = audit(PARRY_DOWN);
  assert.ok(seen > 500, `${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .flatMap(([check, c]) => c.cases.map(k => `${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`));
  assert.deepEqual(broken, []);
});
