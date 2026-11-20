// The defence catalogue's exchanges are real bouts: each must end the way its card says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { RISE, LIE } from '../src/anim/moves.mjs';

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

for (const entry of DEFENSE.filter(e => e.punch))
  test(`defence catalogue: ${entry.id} (${entry.name}) ends in a ${entry.outcome}`, () => {
    const out = exchange(entry),
      last = out[out.length - 1];
    assert.ok(last, 'the other man threw something that arrived');
    assert.equal(last.name, entry.punch[0], 'the last thing to arrive is the punch the card is about');
    assert.equal(last.type, entry.outcome, JSON.stringify(out));
    // the punches before it in his chain are met, not taken, unless the card says they land too
    for (const before of out.slice(0, -1))
      if (entry.before === 'hit') assert.equal(before.type, 'hit', JSON.stringify(out));
      else assert.notEqual(before.type, 'hit', 'an earlier punch landed: ' + JSON.stringify(out));
  });

/* Going down: laid out, he is a body that comes to rest however it lands, and gets up the way that fits how it lies (off his
   back, front or side: moves.mjs LIE); dropped to a knee, he gets up off the knee. */
for (const entry of DEFENSE.filter(e => e.fall))
  test(`defence catalogue: ${entry.id} goes down as ${entry.fall}, gets up the way that goes with how he lies, and is back in his guard`, () => {
    const bout = freshBout(entry),
      done = [];
    let from = null;
    for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
      step(bout, drive(entry, bout, tick * DT, DT), DT);
      const a = bout.fighters[0].action,
        name = a ? a.name : 'guard';
      if (done[done.length - 1] !== name) (done.push(name), a && a.from && (from = a.from));
    }
    const moves = done.filter(n => n !== 'guard');
    assert.equal(moves[0], entry.fall, JSON.stringify(done));
    assert.equal(moves[1], entry.fall === 'drop' ? RISE.drop : LIE[from], `${JSON.stringify(done)} (lying on his ${from})`);
    assert.equal(moves.length, 2, JSON.stringify(done));
    assert.equal(done[done.length - 1], 'guard');
    assert.equal(bout.fighters[0].down, 0);
  });

test('every way of getting out of the way works against something, from a moment after the punch starts', () => {
  for (const move of ['slip', 'duck', 'roll', 'pull']) assert.ok(DEFENSE.some(e => e.outcome === 'whiff' && (e.press || []).some(p => p[1] === move)), move);
});
