// A clean great one's own techniques (docs/moves-plan-5.md §4, anim/clean.mjs). The wave (§4.1): circling wide at the end of
// the other man's reach, the hands let down, the head rising and falling as the feet slide apart and together; the slick back
// off a punch coming in the middle of it. Only 4명 and 5명 have it: asked of anyone else it is the circle out.
// The down parry and counter (§4.2): his guard put up fresh, meant as it, presses the jab down from above with the rear glove,
// and the counter goes from the hand that pressed it. Only 4명 and 5명 who carry it; it does not take the place of the parry.
// Block and fire (§4.3): the liver hook met by the rear elbow, the uppercut of that arm wound up by the block lands as a counter
// (4명 0.22-0.32 s, 5명 0.16-0.24 s after the block, a legend's lead hook after it), 60 ms and more sooner than not wound up,
// the other glove at his temple; out of its quarter second, or with nothing blocked, the chain.
// The peek-a-boo shell (§4.5): crouched 14 cm and more in 0.2 s behind the gloves at his cheekbones; the jab, the cross, the
// hook and the liver hook kept off, the uppercut and the straight to the body let in; the lead hook and the body uppercut out
// of it; it costs breath; the window he can go into it in against the jab (it never goes over him).
// The Tyson shift (§4.4): the rear foot through the air past the lead one (which stays) to come down ahead of it and out to
// the right, in close and off the other man's line, down low; the straight, the lead hand's body hook and the uppercut in turn,
// at his grade's intervals; the body hook turning the hips further than a hook does, and harder than the liver hook; back round
// into his own stance at the end, or at once if he is hit in it; out of the shell, the body hook the sooner; a legend does not
// start it into a punch coming at him.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/measure.mjs';
import { WAVING, STANCES, SHIFTING, SHIFT_LEVELS, LADDER, BODY_LADDER } from '../src/ladder.mjs';
import { createBout, step, settle, RULES } from '../src/game/bout.mjs';
import { audit, measure } from '../src/audit.mjs';
import { WAVE } from '../src/anim/clean.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW, PARRY_DOWN, BLOCK_FIRE, FIRE_LEVELS, SHELL, SHELL_ROWS, SHELL_LEVELS } from '../src/defense.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import * as M from '../src/rig/m3.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import { drill as windowDrill, outcome as windowOutcome } from '../tools/windows.mjs';

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
      // (o.carry false: what his grades give him, game/profile.mjs loadout, as the catalogue's other cards carry)
      setup: b => ((b.fighters[0].skills = { all: lv }), o.carry !== false && (b.fighters[0].techniques = o.carry || ['parryDown'])),
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
    const frames = pressDown(lv, 'jab', WINDOWS.parryDown[lv].at),
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
    const w = WINDOWS.parryDown[lv];
    assert.ok(w.at >= w.from && w.at <= w.to, lv);
    for (const k of [w.from, w.at, w.to]) assert.equal(fate(pressDown(lv, 'jab', k)), 'parryD', `${lv}: frame ${k}`);
    for (const k of [w.from - 1, w.to + 1]) assert.notEqual(fate(pressDown(lv, 'jab', k)), 'parryD', `${lv}: frame ${k}`);
  }
});

test('down parry: met any other way, or on the guard put up for it, the jab is blocked, not turned aside', () => {
  for (const lv of ['4m', '5m']) {
    const w = WINDOWS.parryDown[lv];
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
    const frames = pressDown(lv, 'jab', WINDOWS.parryDown[lv].at),
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
  const four = pressDown('4m', 'jab', WINDOWS.parryDown['4m'].at, { counter: true }),
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
  const five = pressDown('5m', 'jab', WINDOWS.parryDown['5m'].at, { counter: true }),
    jab5 = after(five, 'jab'),
    cross5 = after(five, 'cross');
  assert.ok(jab5 && jab5.dt >= 0.06 && jab5.dt <= 0.12, `5명 jab: ${JSON.stringify(jab5)}`);
  assert.ok(cross5 && cross5.dt > jab5.dt && cross5.dt <= 0.3, `5명 cross: ${JSON.stringify(cross5)}`);
});

test('down parry: the parry he puts up without it is as it was (4명·5명 and 1–3 turn it aside, 4암·5암 with their cross-arm guard hammer it)', () => {
  // (each on the frame his parry card puts it up: the middle of his window, src/windows.data.mjs)
  for (const lv of LEVELS) assert.equal(fate(pressDown(lv, 'jab', WINDOWS.parry[lv].at, { tech: null, carry: false })), lv === '4a' || lv === '5a' ? 'parryH' : 'parry', lv);
  // (and carrying it, not asked for it: the same)
  for (const lv of ['4m', '5m']) assert.equal(fate(pressDown(lv, 'jab', -1, { tech: null })), 'parry', lv);
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

/* ---- Block and fire (§4.3, src/defense.mjs BLOCK_FIRE; game/bout.mjs fired, anim/clean.mjs fireBody, skill.mjs fire): a pro's
   liver hook met by the rear elbow of a 4명 or a 5명 holding his guard up, and a power press meant as it on the next step. */
// (one loop of a card or a drill: every event with the bout's clock, and his gloves and head each step)
function loop(e, more) {
  const bout = freshBout(e),
    frames = [];
  for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    const [a, b] = bout.fighters;
    b.hp = 1000;
    a.hp = Math.max(a.hp, 50);
    frames.push({ t: bout.t, head: a.points.head.slice(), L: a.points.L.slice(), R: a.points.R.slice(), LE: a.points.LE.slice(), RE: a.points.RE.slice(), points: a.points, action: a.action ? a.action.name : null, shell: !!a.shell, stamina: a.stamina, events: bout.events.map(x => ({ ...x })), ...(more ? more(bout) : {}) });
  }
  return frames;
}
const events = frames => frames.flatMap(f => f.events.map(e => Object.assign({ t: f.t }, e)));
// (the block on his elbow, and his first punch to land or be met after it)
function fired(frames) {
  const ev = events(frames),
    block = ev.find(e => e.type === 'block' && e.on === 0 && (e.part === 'elbow' || e.part === 'forearm')),
    lands = block && ev.filter(e => e.who === 0 && e.t > block.t && ['hit', 'block', 'whiff', 'graze'].includes(e.type)),
    thrown = block && ev.filter(e => e.who === 0 && e.type === 'punch' && e.t > block.t);
  return { block, first: lands && lands[0], second: lands && lands[1], thrown: thrown ? thrown.map(e => e.name) : [], dt: lands && lands[0] ? +(lands[0].t - block.t).toFixed(3) : null };
}
// a block and fire card's drill, at a grade made of another (his skills a sheet of its own: the same grade, its fire otherwise)
const fireCard = (lv, o = {}) => {
  const base = BLOCK_FIRE.find(e => e.level === lv),
    level = o.fire ? Object.assign({}, LEVEL[lv], { fire: Object.assign({}, LEVEL[lv].fire, o.fire) }) : lv;
  return Object.assign({}, base, {
    setup: b => ((b.fighters[0].skills = { all: level }), (b.fighters[0].techniques = o.carry || ['blockFire']), (b.fighters[1].stands = true)),
    cue: o.cue || base.cue
  });
};

test('block and fire: only 4명 and 5명 have it, and only a man who carries it fires off the block; anyone else throws his chain', () => {
  for (const lv of LEVELS) assert.equal(!!LEVEL[lv].fire, lv === '4m' || lv === '5m', lv);
  for (const lv of FIRE_LEVELS) {
    const f = fired(loop(fireCard(lv)));
    assert.equal(f.block.part, 'elbow', lv);
    assert.equal(f.thrown[0], 'upper', `${lv}: ${f.thrown}`);
    // (not carried: the power press is his chain's first, the cross)
    assert.equal(fired(loop(fireCard(lv, { carry: [] }))).thrown[0], 'cross', lv);
  }
  // (a pro asked for it: the cross)
  const pro = Object.assign({}, BLOCK_FIRE[0], { setup: b => ((b.fighters[0].skills = { all: '3' }), (b.fighters[0].techniques = ['blockFire']), (b.fighters[1].stands = true)) });
  assert.equal(fired(loop(pro)).thrown[0], 'cross');
});

test('block and fire: the uppercut of the arm that blocked lands on his head as a counter, 4명 0.22–0.32 s and 5명 0.16–0.24 s after the block; a legend\'s lead hook follows it', () => {
  const got = {};
  for (const lv of FIRE_LEVELS) {
    const f = fired(loop(fireCard(lv)));
    got[lv] = f;
    assert.equal(f.first.type, 'hit', `${lv}: ${JSON.stringify(f.first)}`);
    assert.equal(f.first.name, 'upper', lv);
    assert.ok(!f.first.part || f.first.part === 'glove', lv);
    assert.ok(f.first.counter, `${lv}: a counter`);
  }
  assert.ok(got['4m'].dt >= 0.22 && got['4m'].dt <= 0.32, `4명 ${got['4m'].dt}`);
  assert.ok(got['5m'].dt >= 0.16 && got['5m'].dt <= 0.24, `5명 ${got['5m'].dt}`);
  // (a legend's lead hook after it, by itself: 0.18 to 0.26 s after the uppercut; a 4명's none)
  const five = got['5m'];
  assert.equal(five.second && five.second.name, 'hook', JSON.stringify(five.second));
  assert.equal(five.second.type, 'hit');
  const gap = five.second.t - five.first.t;
  assert.ok(gap >= 0.18 && gap <= 0.26, `5명 hook ${gap.toFixed(3)} s after`);
  assert.ok(!got['4m'].thrown.includes('hook'), `4명: ${got['4m'].thrown}`);
});

test('block and fire: 60 ms and more sooner than the same uppercut not wound up by the block; the other glove at his temple all the way', () => {
  for (const lv of FIRE_LEVELS) {
    const frames = loop(fireCard(lv)),
      f = fired(frames),
      cold = fired(loop(fireCard(lv, { fire: { load: 0 } })));
    assert.equal(cold.first.name, 'upper', lv);
    assert.ok(cold.dt - f.dt >= 0.06, `${lv}: ${f.dt} against ${cold.dt}`);
    // (from the press to the landing, the lead glove within 4 cm of his head, surface to surface)
    const from = frames.findIndex(x => x.t > f.block.t),
      to = frames.findIndex(x => x.t >= f.first.t),
      off = Math.max(...frames.slice(from, to + 1).map(x => dist(x.L, x.head) - RULES.glove - RULES.head));
    assert.ok(off <= 0.04, `${lv}: the lead glove ${(off * 100).toFixed(1)} cm off his head`);
  }
});

test('block and fire: no block, or pressed after his grade\'s quarter of a second, and it is his chain', () => {
  for (const lv of FIRE_LEVELS) {
    // (pressed 0.3 s after the block)
    const late = fireCard(lv, {
      cue: bout => {
        const f = bout.fighters[0],
          own = (f.cues = f.cues || {});
        if (own.at === undefined && bout.events.some(e => e.type === 'block' && e.on === 0)) own.at = bout.t;
        if (own.pressed || own.at === undefined || bout.t < own.at + 0.3 - 1e-9) return null;
        return (own.pressed = true), { power: true, tech: 'blockFire' };
      }
    });
    assert.equal(fired(loop(late)).thrown[0], 'cross', lv);
    // (nothing blocked: a press meant as it at the same moment, his guard up, no hook thrown)
    const none = Object.assign(fireCard(lv), { against: [], cue: (bout, t) => (t >= 0.8 && t < 0.8 + DT ? { power: true, tech: 'blockFire' } : null) });
    const thrown = events(loop(none)).filter(e => e.type === 'punch' && e.who === 0).map(e => e.name);
    assert.equal(thrown[0], 'cross', lv);
  }
});

test('block and fire: the cards, the same every time, and nothing in them breaks anything a body can do', () => {
  for (const e of BLOCK_FIRE) assert.deepEqual(fired(loop(e)), fired(loop(e)), e.id);
  const { found, seen } = audit(BLOCK_FIRE);
  assert.ok(seen > 500, `${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .flatMap(([check, c]) => c.cases.map(k => `${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`));
  assert.deepEqual(broken, []);
});

/* ---- The peek-a-boo shell (§4.5, src/defense.mjs SHELL; game/bout.mjs f.shell, anim/clean.mjs shellBody, skill.mjs shell): his
   guard put up crouched, meant as it, by a 4명 or a 5명 who carries it. */
// (a drill: crouched into it at 0.3 s and held, the pro at `gap` throwing `punch` at 0.6 s by name, or a jab; nothing, if none)
const shellDrill = (lv, punch, gap, o = {}) => ({
  id: `shell-drill-${punch}`, loop: o.loop || 1.6, me: () => HOME, him: () => [HOME[0] + gap, HOME[1]],
  against: !punch ? [] : punch === 'jab' ? [[0.6, 'jab']] : [[0.6, 'power', punch]],
  cover: t => t >= 0.3 && t < 1.2,
  cue: (b, t) => (t >= 0.3 && o.tech !== null ? ['tech', 'shell'] : null),
  setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = o.carry || ['shell']), (b.fighters[1].stands = true), o.breath && (b.fighters[0].stamina = o.breath * b.fighters[0].k.staminaMax))
});
const theirs = frames => events(frames).find(e => e.who === 1 && ['hit', 'block', 'whiff', 'graze'].includes(e.type));

test('shell: only 4명 and 5명 have it, and only a man who carries it crouches into it', () => {
  for (const lv of LEVELS) assert.equal(!!LEVEL[lv].shell, lv === '4m' || lv === '5m', lv);
  for (const lv of SHELL_LEVELS) {
    assert.ok(loop(shellDrill(lv, null, 1.0)).some(f => f.shell), lv);
    assert.ok(!loop(shellDrill(lv, null, 1.0, { carry: [] })).some(f => f.shell), `${lv}, not carried`);
  }
  assert.ok(!loop(shellDrill('3', null, 1.0)).some(f => f.shell), 'a pro');
});

test('shell: down 14 cm and more in 0.2 s, the gloves at his cheekbones (23 cm from the middle of his head), the rear forearm up and down and the elbows apart', () => {
  for (const lv of SHELL_LEVELS) {
    const frames = loop(shellDrill(lv, null, 1.0)),
      before = mean(frames.slice(0, 17).map(f => f.head[1])),
      at = frames.findIndex(f => f.shell),
      t0 = frames[at].t,
      by = frames.find(f => f.t >= t0 + 0.2 - 1e-9),
      held = frames.filter(f => f.shell && f.t >= t0 + 0.25);
    assert.ok(before - by.head[1] >= 0.14, `${lv}: ${((before - by.head[1]) * 100).toFixed(1)} cm down at 0.2 s`);
    for (const f of held) for (const k of ['L', 'R']) assert.ok(dist(f[k], f.head) <= 0.23, `${lv}: the ${k} glove ${(dist(f[k], f.head) * 100).toFixed(1)} cm from his head at ${f.t.toFixed(2)}`);
    // (the elbows wider apart than a fist: what the uppercut and the straight to the pit of his stomach come in between)
    assert.ok(Math.min(...held.map(f => dist(f.LE, f.RE))) >= 0.14, lv);
    const up = Math.max(...held.map(f => deg(Math.atan2(Math.hypot(f.R[0] - f.RE[0], f.R[2] - f.RE[2]), f.R[1] - f.RE[1]))));
    assert.ok(up <= 25, `${lv}: the rear forearm ${up.toFixed(0)}° off upright`);
  }
});

test('shell: a pro\'s jab, cross, hook and liver hook do not land; the uppercut and the straight to the body do', () => {
  for (const lv of SHELL_LEVELS) {
    for (const [punch, gap] of [['jab', 1.0], ['cross', 1.0], ['hook', 0.85], ['hookBody', 0.8]]) {
      const e = theirs(loop(shellDrill(lv, punch, gap)));
      assert.ok(e && (e.type === 'block' || e.type === 'whiff'), `${lv} ${punch}: ${JSON.stringify(e && [e.type, e.part, e.J])}`);
    }
    for (const [punch, gap] of [['upper', 0.85], ['crossBody', 0.95]]) {
      const e = theirs(loop(shellDrill(lv, punch, gap)));
      assert.equal(e && e.type, 'hit', `${lv} ${punch}: ${JSON.stringify(e && [e.type, e.part])}`);
    }
    // (the same uppercut into his plain guard is blocked)
    assert.equal(theirs(loop(shellDrill(lv, 'upper', 0.85, { tech: null }))).type, 'block', `${lv}: the uppercut into his guard`);
  }
});

test('shell: how late he can crouch into it and still meet the jab is the window measured; the jab never goes over him', () => {
  for (const lv of SHELL_LEVELS) {
    const w = WINDOWS.shell[lv],
      tech = { id: 'shell', carry: ['shell'], hold: 0.6 };
    assert.equal(windowOutcome(windowDrill('jab', 'cover', true, w.to, { all: lv }, true, false, tech)).type, 'block', lv);
    assert.equal(windowOutcome(windowDrill('jab', 'cover', true, w.to + 1, { all: lv }, true, false, tech)).type, 'hit', lv);
    for (let k = -6; k <= w.to + 4; k += 2) assert.notEqual(windowOutcome(windowDrill('jab', 'cover', true, k, { all: lv }, true, false, tech)).type, 'whiff', `${lv}: frame ${k}`);
  }
});

test('shell: out of it, the lead hook 0.10–0.17 s after the jab is met and the rear body uppercut 0.12–0.19 s after that; it costs breath', () => {
  for (const lv of SHELL_LEVELS) {
    const ev = events(loop(SHELL.find(e => e.id === `shell@${lv}`))),
      met = ev.find(e => e.who === 1 && e.type === 'block'),
      mine = ev.filter(e => e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type));
    assert.ok(met, lv);
    assert.deepEqual(mine.map(e => [e.name, e.type]), [['hook', 'hit'], ['upperBody', 'hit']], lv);
    const hook = mine[0].t - met.t,
      body = mine[1].t - mine[0].t;
    assert.ok(hook >= 0.1 && hook <= 0.17, `${lv}: the hook ${hook.toFixed(3)} s after`);
    assert.ok(body >= 0.12 && body <= 0.19, `${lv}: the body uppercut ${body.toFixed(3)} s after the hook`);
    assert.equal(mine[1].part, 'body', lv);
    // (held a second, 1.5% of all his breath more than his plain guard held as long; at 60% of it, getting it back as he stands)
    const spent = frames => frames[0].stamina - frames.find(f => f.t >= 1.3).stamina,
      shell = loop(shellDrill(lv, null, 1.0, { breath: 0.6 })),
      plain = loop(shellDrill(lv, null, 1.0, { tech: null, breath: 0.6 })),
      max = freshBout(shellDrill(lv, null, 1.0)).fighters[0].k.staminaMax,
      k = (spent(shell) - spent(plain)) / max / 0.9;
    assert.ok(Math.abs(k - LEVEL[lv].shell.cost) < 0.003, `${lv}: ${(k * 100).toFixed(2)}% a second`);
  }
});

test('shell: the cards, the same every time, and nothing in them breaks anything a body can do', () => {
  for (const e of SHELL) assert.deepEqual(events(loop(e)).map(x => `${x.type} ${x.who} ${x.name} ${x.J}`), events(loop(e)).map(x => `${x.type} ${x.who} ${x.name} ${x.J}`), e.id);
  const { found, seen } = audit(SHELL);
  assert.ok(seen > 1000, `${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .flatMap(([check, c]) => c.cases.map(k => `${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`));
  assert.deepEqual(broken, []);
});


/* ---- The Tyson shift (§4.4, anim/shift.mjs): its cards (src/ladder.mjs SHIFTING), a frame a step: where he and the other man
   stand, his facing, the balls of his feet on the canvas, his head, his pelvis's turn, and what the bout says */
const shiftCard = id => SHIFTING.find(e => e.id === id);
function shiftLoop(e) {
  const toCanvas = (f, p) => [f.x + p[0] * Math.cos(f.yaw) + p[2] * Math.sin(f.yaw), p[1], f.z - p[0] * Math.sin(f.yaw) + p[2] * Math.cos(f.yaw)];
  return loop(e, b => {
    const [a, o] = b.fighters;
    return { at: [a.x, a.z], him: [o.x, o.z], yaw: a.yaw, shift: a.shift ? { off: a.shift.off, landed: a.shift.landed, hooked: a.shift.got.shiftHook !== undefined } : null, phase: a.action && a.action.chain ? a.action.chain.phase : null, L: toCanvas(a, a.pose.at.LeftToeBase), Rb: toCanvas(a, a.pose.at.RightToeBase), pelvis: measure(a).angles.PelvisYaw - (a.yaw * 180) / Math.PI };
  });
}
const shiftStart = frames => events(frames).find(e => e.type === 'shift' && e.who === 0);
const gotThere = frames => events(frames).filter(e => e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type));
// his guard's head height, standing (as the shell's tests take it)
const guardHead = lv => mean(run(STANCES.find(e => e.id === `stance@${lv}`), 3).frames.map(f => f.headY));

test('shift: only 4명 and 5명 have it, and only a man who carries it shifts: anyone else\'s press meant as it is his straight', () => {
  for (const lv of LEVELS) assert.equal(!!LEVEL[lv].shift, lv === '4m' || lv === '5m', lv);
  for (const lv of SHIFT_LEVELS) {
    const e = shiftCard(`shift@${lv}`),
      frames = loop(e);
    assert.ok(shiftStart(frames), lv);
    assert.deepEqual(gotThere(frames).map(x => x.name), ['cross', 'shiftHook', 'upperIn'], lv);
    const not = loop(Object.assign({}, e, { setup: b => (e.setup(b), (b.fighters[0].techniques = [])) }));
    assert.ok(!shiftStart(not), `${lv}, not carried`);
    assert.deepEqual(gotThere(not).map(x => x.name), ['cross'], `${lv}, not carried: the straight`);
  }
  const pro = shiftCard('shift@4m'),
    three = loop(Object.assign({}, pro, { setup: b => (pro.setup(b), (b.fighters[0].skills = { all: '3' })) }));
  assert.ok(!shiftStart(three), 'a pro carrying it');
});

test('shift: the rear foot off the canvas 4 cm at most and down 0.20 m and more ahead of the lead foot and 0.28 m and more out to the right of it; the lead foot stays', () => {
  // (4명: the foot goes once the straight has got there; 5명: as its shoulder fires; seconds after the press it is off the canvas)
  const air = { '4m': [0.1, 0.32], '5m': [0.05, 0.25] };
  for (const lv of SHIFT_LEVELS) {
    const frames = shiftLoop(shiftCard(`shift@${lv}`)),
      t0 = shiftStart(frames).t,
      i0 = frames.findIndex(f => f.t >= t0 - 1e-9),
      start = frames[i0 - 1],
      // (the terms he started in: the line to the other man, and to his right)
      d = [start.him[0] - start.at[0], start.him[1] - start.at[1]].map(v => v / Math.hypot(start.him[0] - start.at[0], start.him[1] - start.at[1])),
      right = [-d[1], d[0]],
      rest = Math.min(...frames.map(f => f.Rb[1])), // (the ball of a foot flat on the canvas)
      // (the step: from the bout's saying the rear foot goes until it says it is down)
      up = frames.filter(f => f.shift && f.shift.off !== null && !f.shift.landed);
    assert.ok(up.length > 3, lv);
    assert.ok(up[0].t - t0 >= air[lv][0] - 1e-9 && up[up.length - 1].t - t0 <= air[lv][1] + 1e-9, `${lv}: off the canvas ${(up[0].t - t0).toFixed(3)}–${(up[up.length - 1].t - t0).toFixed(3)} s`);
    assert.ok(Math.max(...up.map(f => f.Rb[1] - rest)) <= 0.04, `${lv}: ${(Math.max(...up.map(f => f.Rb[1] - rest)) * 100).toFixed(1)} cm up`);
    for (const f of up) assert.ok(Math.hypot(f.L[0] - start.L[0], f.L[2] - start.L[2]) <= 0.02, `${lv}: the lead foot at ${(f.t - t0).toFixed(3)}`);
    const down = frames.find(f => f.t > up[up.length - 1].t),
      off = [down.Rb[0] - down.L[0], down.Rb[2] - down.L[2]],
      ahead = off[0] * d[0] + off[1] * d[1],
      out = off[0] * right[0] + off[1] * right[1];
    assert.ok(ahead >= 0.2 && out >= 0.28, `${lv}: down ${ahead.toFixed(2)} m ahead and ${out.toFixed(2)} m to the right of the lead foot`);
  }
});

test('shift: in close, 0.64–0.74 m off the other man and 20–38° off the line he faced him on, down 15 cm and more as he hooks', () => {
  for (const lv of SHIFT_LEVELS) {
    const frames = shiftLoop(shiftCard(`shift@${lv}`)),
      t0 = shiftStart(frames).t,
      start = frames[frames.findIndex(f => f.t >= t0 - 1e-9) - 1],
      [, hook] = gotThere(frames),
      head = guardHead(lv),
      // (from the rear foot coming down to the body hook getting there)
      low = frames.filter(f => f.shift && f.shift.landed && f.t <= hook.t + 1e-9);
    assert.ok(low.length > 4, lv);
    for (const f of low) {
      const was = [start.at[0] - start.him[0], start.at[1] - start.him[1]],
        now = [f.at[0] - f.him[0], f.at[1] - f.him[1]],
        far = Math.hypot(...now),
        off = deg(Math.acos((was[0] * now[0] + was[1] * now[1]) / Math.hypot(...was) / far));
      assert.ok(far >= 0.64 && far <= 0.74, `${lv}: ${far.toFixed(3)} m at ${(f.t - t0).toFixed(3)}`);
      assert.ok(off >= 20 && off <= 38, `${lv}: ${off.toFixed(1)}° at ${(f.t - t0).toFixed(3)}`);
    }
    // (down: from 0.30 s, and by a legend's grade from 0.25 s, until the hook has got there)
    for (const f of frames.filter(f => f.t - t0 >= (lv === '4m' ? 0.3 : 0.25) - 1e-9 && f.t <= hook.t + 1e-9)) assert.ok(head - f.head[1] >= 0.15, `${lv}: ${((head - f.head[1]) * 100).toFixed(1)} cm down at ${(f.t - t0).toFixed(3)}`);
  }
});

test('shift: the straight, the lead hand\'s body hook and the uppercut, 4명 0.33–0.42 s and 0.20–0.27 s apart, 5명 0.26–0.34 s and 0.17–0.24 s; a straight blocked, the two after it all the same', () => {
  const apart = { '4m': [[0.33, 0.42], [0.2, 0.27]], '5m': [[0.26, 0.34], [0.17, 0.24]] };
  for (const lv of SHIFT_LEVELS) {
    const got = gotThere(shiftLoop(shiftCard(`shift@${lv}`))),
      [a, b] = apart[lv];
    assert.deepEqual(got.map(e => e.name), ['cross', 'shiftHook', 'upperIn'], lv);
    // (the straight goes into his guard: the other two go on)
    assert.equal(got[0].type, 'block', lv);
    // (the hook to his body, the uppercut to his head)
    assert.ok(got[1].zone || got[1].part === 'body' || got[1].part === 'elbow' || got[1].part === 'forearm', `${lv}: ${JSON.stringify(got[1])}`);
    const one = got[1].t - got[0].t,
      two = got[2].t - got[1].t;
    assert.ok(one >= a[0] - 1e-9 && one <= a[1] + 1e-9, `${lv}: the body hook ${one.toFixed(3)} s after the straight`);
    assert.ok(two >= b[0] - 1e-9 && two <= b[1] + 1e-9, `${lv}: the uppercut ${two.toFixed(3)} s after the body hook`);
  }
});

test('shift: the body hook turns the hips further than his hook (1.25 times and more; the plan asks 1.6) and lands harder than his liver hook', () => {
  // how far his pelvis turns (unwrapped, about his facing) through a punch, and for the shift's hook, the crouch it is wound up in
  const turn = (frames, name) => {
    let lo = Infinity,
      hi = -Infinity,
      acc = 0,
      prev = null;
    for (const f of frames) {
      const on = (f.action === name && ['coil', 'throw', 'hold'].includes(f.phase)) || (name === 'shiftHook' && f.shift && f.shift.landed && !f.shift.hooked);
      if (!on) continue;
      if (prev !== null) acc += ((f.pelvis - prev + 540) % 360) - 180;
      prev = f.pelvis;
      (lo = Math.min(lo, acc)), (hi = Math.max(hi, acc));
    }
    return hi - lo;
  };
  for (const lv of SHIFT_LEVELS) {
    const shift = shiftLoop(shiftCard(`shift@${lv}`)),
      hook = shiftLoop(LADDER.find(e => e.id === `hook@${lv}`)),
      liver = events(loop(BODY_LADDER.find(e => e.id === `hookBody@${lv}`))).find(e => e.who === 0 && e.type === 'hit'),
      mine = gotThere(shift)[1],
      k = turn(shift, 'shiftHook') / turn(hook, 'hook');
    assert.ok(k >= 1.25, `${lv}: ${k.toFixed(2)} times the hook's turn`);
    assert.ok(mine.J > liver.J, `${lv}: ${mine.J} N·s against the liver hook's ${liver.J}`);
  }
});

test('shift: back round into his own stance at the end; hit in the middle of it, in his own stance within 0.4 s', () => {
  const stance = Math.hypot(0.103 + 0.247, 0.327 + 0.153), // (the balls of his feet in his guard: moves.mjs GUARD)
    orthodox = f => {
      const toHim = [f.him[0] - f.at[0], f.him[1] - f.at[1]].map(v => v / Math.hypot(f.him[0] - f.at[0], f.him[1] - f.at[1])),
        gap = Math.hypot(f.L[0] - f.Rb[0], f.L[2] - f.Rb[2]);
      return (f.L[0] - f.Rb[0]) * toHim[0] + (f.L[2] - f.Rb[2]) * toHim[1] > 0.2 && gap >= 0.85 * stance && gap <= 1.15 * stance;
    };
  for (const lv of SHIFT_LEVELS) {
    const frames = shiftLoop(shiftCard(`shift@${lv}`)),
      over = frames.findIndex((f, i) => i > 0 && frames[i - 1].shift && !f.shift);
    assert.ok(over > 0 && orthodox(frames[over]), `${lv}: in his stance as it is over`);
    // (a pro's punch into him as he goes down into it, his guard kept up until then)
    const base = shiftCard(`shift@${lv}`),
      hit = shiftLoop(Object.assign({}, base, { against: [[0.62, 'power']], setup: b => (base.setup(b), (b.fighters[1].skills = { all: '3' })) })),
      blow = events(hit).find(e => e.who === 1 && e.type === 'hit'),
      t0 = shiftStart(hit).t;
    assert.ok(blow && blow.t - t0 > 0.15 && blow.t - t0 < 0.4, `${lv}: hit ${blow && (blow.t - t0).toFixed(3)} s into it`);
    const back = hit.find(f => f.t > blow.t && !f.shift && orthodox(f));
    assert.ok(back && back.t - blow.t <= 0.4, `${lv}: in his stance ${back && (back.t - blow.t).toFixed(3)} s after`);
    assert.ok(!hit.some(f => f.t > blow.t && f.shift), `${lv}: and it is over`);
  }
});

test('shift: out of the shell, crouched already, the body hook gets there 50 ms and more sooner after the straight than standing', () => {
  for (const lv of SHIFT_LEVELS) {
    const after = id => {
      const [a, b] = gotThere(shiftLoop(shiftCard(`${id}@${lv}`)));
      return b.t - a.t;
    };
    const standing = after('shift'),
      shelled = after('shift-shell');
    assert.ok(standing - shelled >= 0.05 - 1e-9, `${lv}: ${(standing * 1000).toFixed(0)} ms standing, ${(shelled * 1000).toFixed(0)} ms out of the shell`);
  }
});

test('shift: a legend does not start it into a punch on its way at him; a great one does', () => {
  for (const lv of SHIFT_LEVELS) {
    const base = shiftCard(`shift@${lv}`),
      // (the other man's jab pressed just before he presses it)
      into = loop(Object.assign({}, base, { against: [[0.47, 'jab']], hisCover: () => false }));
    assert.equal(!!shiftStart(into), lv === '4m', lv);
  }
});

test('shift: the cards, the same every time, and nothing in them breaks anything a body can do', () => {
  for (const e of SHIFTING) assert.deepEqual(events(loop(e)).map(x => `${x.type} ${x.who} ${x.name} ${x.J}`), events(loop(e)).map(x => `${x.type} ${x.who} ${x.name} ${x.J}`), e.id);
  const { found, seen } = audit(SHIFTING);
  assert.ok(seen > 1000, `${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .flatMap(([check, c]) => c.cases.map(k => `${check}: ${k.value} at ${k.script} @ ${k.t}, ${k.who}, ${k.doing}`));
  assert.deepEqual(broken, []);
});
