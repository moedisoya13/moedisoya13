// The defence catalogue's exchanges are real bouts: each must end the way its card says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';

const DT = 1 / 60;
const OUTCOMES = ['hit', 'block', 'parry', 'whiff', 'graze'];

// what became of each punch the other man threw in one loop of the script, in order
function exchange(entry) {
  const bout = freshBout(entry),
    out = [];
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 50);
    for (const e of bout.events) {
      // (a parry is the defender's event: the punch it turned aside is the other man's)
      const by = e.type === 'parry' ? e.on : e.who;
      if (by === 1 && OUTCOMES.includes(e.type)) out.push({ name: e.name, type: e.type });
    }
  }
  return out;
}

for (const entry of DEFENSE)
  test(`defence catalogue: ${entry.id} (${entry.name}) ends in a ${entry.outcome}`, () => {
    const out = exchange(entry),
      last = out[out.length - 1];
    assert.ok(last, 'the other man threw something that arrived');
    assert.equal(last.name, entry.punch[0], 'the last thing to arrive is the punch the card is about');
    assert.equal(last.type, entry.outcome, JSON.stringify(out));
    // the punches before it in his chain are met, not taken, unless that is what the card is about
    for (const before of out.slice(0, -1)) assert.notEqual(before.type, 'hit', 'an earlier punch landed: ' + JSON.stringify(out));
  });

test('every way of getting out of the way works against something, from a moment after the punch starts', () => {
  for (const move of ['slip', 'duck', 'roll', 'pull']) assert.ok(DEFENSE.some(e => e.outcome === 'whiff' && (e.press || []).some(p => p[1] === move)), move);
});
