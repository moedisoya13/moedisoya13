// The seven grades of footwork (anim/skill.mjs: stance), as the bout moves them, and the beat a clean boxer punches on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stance, rung, run, landings } from '../src/measure.mjs';
import { LADDER, STANCES } from '../src/ladder.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';

const PUNCHES = ['jab', 'cross', 'hook', 'upper'];
const grades = Object.fromEntries(LEVELS.map(lv => [lv, stance(lv, 20)]));

test('stance: standing, the hips go up and down more grade by grade to a pro, and a beginner never leaves the canvas', () => {
  assert.ok(grades[1].hips < grades[2].hips && grades[2].hips < grades[3].hips, `${grades[1].hips} < ${grades[2].hips} < ${grades[3].hips} cm`);
  assert.ok(grades[1].lifted <= 1.5, `a beginner's foot is never more than 1.5 cm up: ${grades[1].lifted} cm`);
});

test('stance: the head stays put for a beginner and an amateur, moves for a pro, and goes from side to side and under for the great', () => {
  for (const lv of ['1', '2']) assert.ok(grades[lv].head < 1, `${lv}: ${grades[lv].head} cm across`);
  assert.ok(grades[3].head >= 3 && grades[3].head <= 7, `a pro: ${grades[3].head} cm across`);
  for (const lv of ['4m', '4a']) {
    assert.ok(grades[lv].head >= 8, `${lv}: ${grades[lv].head} cm across`);
    assert.ok(grades[lv].headY >= 4, `${lv}: ${grades[lv].headY} cm up and down`);
  }
});

test('stance: a great clean boxer has his head at one end on a lead foot coming down, and at the other end on the next', () => {
  const frames = grades['4m'].frames,
    leads = landings(frames).filter(l => l.foot === 'L'),
    at = leads.map(l => frames.find(f => f.tick === l.tick).head),
    mid = (Math.max(...frames.map(f => f.head)) + Math.min(...frames.map(f => f.head))) / 2;
  assert.ok(leads.length >= 20, `${leads.length} lead feet came down`);
  for (let i = 1; i < at.length; i++) {
    assert.ok(Math.sign(at[i] - mid) !== Math.sign(at[i - 1] - mid), `the head changes ends from one lead foot to the next: ${at.map(x => ((x - mid) * 100).toFixed(1)).join(' ')}`);
    assert.ok(Math.abs(at[i] - mid) > 0.025, `and is out at the end: ${((at[i] - mid) * 100).toFixed(1)} cm from the middle`);
  }
});

test('stance: a legend breaks into at least three different flourishes in twenty seconds, and his shuffle switches his feet', () => {
  assert.ok(grades['5m'].flourishes.length >= 3, grades['5m'].flourishes.join(', '));
  // (the shuffle comes round in its turn: he is watched until it does)
  const { frames } = run(STANCES.find(e => e.id === 'stance@5m'), 40),
    shuffle = frames.filter(f => f.flourish === 'shuffle');
  assert.ok(shuffle.length > 0, 'he shuffles');
  assert.ok(shuffle.some(f => f.foot.L[2] < f.foot.R[2]), 'and in it his lead foot is behind his rear foot');
});

test('stance: a clean boxer keeps a beat (strong and weak; swung), a dirty one has none', () => {
  assert.ok(grades['4m'].beat.strong >= 1.25, `strong against weak: ${grades['4m'].beat.strong}`);
  assert.ok(grades['5m'].beat.swing >= 0.55 && grades['5m'].beat.swing <= 0.62, `swung: ${grades['5m'].beat.swing}`);
  assert.ok(grades['4m'].beat.cv <= 0.05, `even: ${grades['4m'].beat.cv}`);
  for (const lv of ['4a', '5a']) assert.ok(grades[lv].beat.cv >= 0.15, `${lv}: no beat to speak of: ${grades[lv].beat.cv}`);
});

/* A clean great one's punch lands on a foot coming down, a clean legend's halfway between two. (Counted in the frames that
   are drawn: the moment of a blow is held, and his feet with it.) */
function beatAt(id) {
  const r = rung(id),
    live = r.frames.filter(f => !f.held),
    at = live.findIndex(f => f.tick === r.hitTick),
    downs = live.map((f, i) => (i > 0 && f.halves !== live[i - 1].halves ? i : -1)).filter(i => i >= 0),
    before = downs.filter(i => i <= at).pop(),
    after = downs.find(i => i > at);
  return { near: Math.min(at - before, after - at), half: after - before };
}
test('stance: a clean great one lands every punch on a foot coming down; a clean legend lands every one off it', () => {
  for (const p of PUNCHES) {
    const on = beatAt(`${p}@4m`),
      off = beatAt(`${p}@5m`);
    assert.ok(on.near <= 1, `${p}@4m: ${on.near} frames from a landing`);
    assert.ok(off.near >= 0.3 * off.half - 1e-9, `${p}@5m: ${off.near} frames from the nearest landing, of ${off.half}`);
  }
});

/* No frame where a joint goes one way and straight back by more than 3 cm, and no frame where he stands still, in any grade's
   footwork or in any grade of any punch. */
function check(entry, seconds) {
  const live = run(entry, seconds).frames.filter(f => !f.held),
    body = NAMES.filter(n => !['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'].includes(n));
  for (let i = 1; i < live.length; i++) {
    const mean = body.reduce((s, n) => s + Math.hypot(...live[i].joints[n].map((v, k) => v - live[i - 1].joints[n][k])), 0) / body.length;
    assert.ok(mean >= 0.0003, `${entry.id}: still at ${live[i].tick} (${(mean * 1000).toFixed(2)} mm)`);
    if (i < 2 || live[i].struck || live[i - 1].struck) continue;
    for (const n of NAMES) {
      const a = live[i - 2].joints[n],
        m = live[i - 1].joints[n],
        c = live[i].joints[n],
        was = m.map((v, k) => v - a[k]),
        now = c.map((v, k) => v - m[k]),
        lw = Math.hypot(...was),
        ln = Math.hypot(...now),
        against = -(was[0] * now[0] + was[1] * now[1] + was[2] * now[2]) / (lw * ln || 1);
      assert.ok(!(against > 0.6 && Math.min(lw, ln) > 0.03), `${entry.id}: ${n} pops ${(Math.min(lw, ln) * 100).toFixed(1)} cm at ${live[i].tick}`);
    }
  }
}
test('stance: every grade moves in every frame, standing and stepping in and out, and nothing pops', () => {
  for (const e of STANCES) check(e, e.kind === 'stance' ? 12 : undefined);
});
test('stance: every grade of every punch moves in every frame', () => {
  for (const e of LADDER) check(e);
});
