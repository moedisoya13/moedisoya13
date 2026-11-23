/* The combinations (docs/combos-plan.md §3, §9.1, §9.3; stage C0): the tables are well formed (game/combos.data.mjs), the
   article's four variations come out as the plan writes them, and the catalogue's cards (src/combos.mjs) throw each
   combination's beats in order at the tempo of each grade that knows it. Nothing in the bout reads the tables yet: the head's
   own bouts, and every card that was there before, are what they were (node tools/events.mjs --diff). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS, VARIATIONS, KNOWS, TEMPO, SITUATIONS, LATER, CONTROLS, NUM, BANDS, about, beatsOf, vary, gapOf, problems } from '../src/game/combos.data.mjs';
import { COMBO_ROWS, COMBINATIONS, COMBO_LEVELS, comboScript, tally, pressOf } from '../src/combos.mjs';
import { FLIGHTS } from '../src/combos.numbers.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { step } from '../src/game/bout.mjs';

const DT = 1 / 60;
const said = b => `${b.fake ? '~' : ''}${b.do}${b.to === 'body' ? 'b' : ''}${b.w && b.w !== 'hard' ? '/' + b.w : ''}${b.link ? ':' + b.link : ''}`;

test('combinations: the tables are well formed (every beat a punch there is or is to come, links on the right hands, grades knowing what there is)', () => {
  assert.deepEqual(problems(), []);
  // (every punch named is one there is, or one a stage still to come brings, with the stage named)
  for (const [id, c] of Object.entries(COMBOS))
    for (const b of beatsOf(id)) {
      const a = about(b.do);
      assert.ok(a, `${id}: ${b.do}`);
      if (a.punch && !MOVES[b.do]) assert.ok(LATER[b.do] && /^C\d$/.test(LATER[b.do].stage), `${id}: ${b.do} is neither a move nor one to come`);
      if (!a.punch) assert.ok(CONTROLS.includes(b.do));
    }
  assert.deepEqual(Object.values(NUM), ['jab', 'cross', 'hook', 'hookR', 'upperL', 'upper']);
  assert.ok(BANDS.every((x, i) => !i || x > BANDS[i - 1]));
  // (each grade knows what the grades below it on its side know, and the grades are the game's)
  assert.deepEqual(Object.keys(KNOWS).sort(), [...LEVELS].sort());
  assert.deepEqual(KNOWS[1].combos, ['1-2', 'chain']);
  for (const [a, b] of [['1', '2'], ['2', '3'], ['3', '4m'], ['3', '4a'], ['4m', '5m'], ['4a', '5a']]) for (const id of KNOWS[a].combos) assert.ok(KNOWS[b].combos.includes(id), `${b} knows ${id}, as ${a} does`);
  for (const lv of LEVELS) for (const id of Object.keys(KNOWS[lv].vary)) assert.ok(id === 'as' || VARIATIONS[id], `${lv}: ${id}`);
  for (const [id, c] of Object.entries(COMBOS)) for (const r of [...(c.when || []), ...(c.unless || [])]) assert.ok(SITUATIONS[r], `${id}: ${r}`);
  for (const by of Object.values(TEMPO)) assert.deepEqual(Object.keys(by).sort(), [...LEVELS].sort());
});

test('combinations: the article\'s four variations are the plan\'s, and a variation done twice is what it was done once', () => {
  assert.deepEqual(beatsOf('feint-cross').map(said), ['~jab/light', 'cross:coil']);
  assert.deepEqual(beatsOf('feint-hook').map(said), ['jab/light', '~cross:coil', 'hook:coil']);
  assert.deepEqual(beatsOf('double-hook').map(said), ['jab/light', 'cross:coil', 'hook/light:coil', 'hook:double', 'cross:coil']);
  assert.deepEqual(beatsOf('up-down').map(said), ['jab/light', 'crossb:coil', 'hook:coil', 'crossb:coil']);
  // (the hook-under as a tail: 1-2-3 is 1-2-3-5b)
  assert.deepEqual(vary(beatsOf('1-2-3'), 'under').map(said), ['jab/light', 'cross:coil', 'hook/full:coil', 'upperLb:lean']);
  // (and fastHard: all light but the last)
  assert.deepEqual(vary(beatsOf('1-2-3-2'), 'fastHard').map(b => b.w || 'hard'), ['light', 'light', 'light', 'hard']);
  for (const id of Object.keys(COMBOS).filter(id => COMBOS[id].beats))
    for (const v of Object.keys(VARIATIONS)) {
      const once = vary(beatsOf(id), v);
      assert.deepEqual(vary(once, v), once, `${id} ${v}`);
      // (and the combination itself is not changed by it)
      assert.deepEqual(beatsOf(id), COMBOS[id].beats.map(b => Object.assign({}, b)));
    }
});

test('combinations: the tempo is the plan\'s (§7.4), a beat to a light one, a hard one, an uppercut, a feint', () => {
  const b = id => beatsOf(id);
  assert.equal(gapOf(b('1-2')[0], b('1-2')[1], '3'), 0.233);
  assert.equal(gapOf(b('1-1-2')[0], b('1-1-2')[1], '4m'), 0.2); // (a jab after a jab: after a light one)
  assert.equal(gapOf(b('1-2-3')[1], b('1-2-3')[2], '5a'), 0.2);
  assert.equal(gapOf(b('chain')[1], b('chain')[2], '1'), 0.55);
  assert.equal(gapOf(b('1-6-3-2')[0], b('1-6-3-2')[1], '3'), 0.283); // (to an uppercut, after the jab all the same)
  assert.equal(gapOf(b('feint-cross')[0], b('feint-cross')[1], '5m'), 0.133);
  const fh = vary(b('1-2-3-2'), 'fastHard');
  assert.equal(gapOf(fh[1], fh[2], '4a'), 0.167);
  assert.equal(gapOf(b('1-S-5-2-3-2')[1], b('1-S-5-2-3-2')[2], '3'), 0.22); // (a beat's own)
});

test('combinations: the catalogue has the seven rows of stage C0, each a card for every grade that knows it, and each card is audited and logged', () => {
  assert.deepEqual(COMBO_ROWS.map(r => r.id), ['1-2', '1-1-2', '1-2-3', '1-2-3-2', '1-6-3-2', '2-3-2', 'chain']);
  assert.deepEqual(COMBO_ROWS.map(r => r.levels.length), [7, 6, 6, 5, 5, 5, 7]);
  for (const r of COMBO_ROWS) {
    assert.ok(COMBOS[r.id] && r.name && r.en && r.note, r.id);
    assert.deepEqual(r.levels, COMBO_LEVELS.filter(lv => KNOWS[lv].combos.includes(r.id)));
  }
  // (their beats are punches there are now: what waits for the lead uppercut is not here)
  for (const e of COMBINATIONS) for (const b of e.beats) assert.ok(MOVES[b.do], `${e.id}: ${b.do}`);
  const ids = COMBINATIONS.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  // (no other script of the catalogue has an id of theirs, and the audit has them all)
  const others = SCRIPTS.filter(e => !COMBINATIONS.includes(e)).map(e => e.id);
  for (const id of ids) assert.ok(!others.includes(id), id);
  for (const e of COMBINATIONS) assert.ok(SCRIPTS.includes(e), e.id);
  // (and each card has its flights, measured: tools/combos.mjs --write)
  for (const e of COMBINATIONS) assert.equal((FLIGHTS[e.id] || []).length, e.beats.length, `${e.id}: run node tools/combos.mjs --write`);
});

// a card fought once, as the catalogue fights it
function fight(e) {
  const bout = freshBout(e),
    m = { want: e.beats.length },
    events = [];
  for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    bout.fighters[0].hp = 1000;
    tally(m, bout, (tick + 1) * DT);
    for (const x of bout.events) if (x.type !== 'cover') events.push(`${tick} ${x.type} ${x.who} ${x.name || ''} ${x.J === undefined ? '' : Math.round(x.J)}`);
  }
  return { m, events, bout };
}
const cards = new Map();
const fought = e => cards.get(e.id) || (cards.set(e.id, fight(e)), cards.get(e.id));

test('combinations: every card throws its beats in order, each pressed once the one before has landed, and every one of them lands or goes by', () => {
  for (const e of COMBINATIONS) {
    const { m } = fought(e);
    // (the chain's row presses the power button, and the bout chains the punches: cross, hook, uppercut)
    assert.deepEqual(m.beats.map(x => x.name), e.beats.map(b => pressOf(b).power || 'jab'), e.id);
    m.beats.forEach((x, i) => {
      assert.ok(x.type, `${e.id} beat ${i + 1}: no outcome`);
      if (i) assert.ok(x.at >= m.beats[i - 1].t - 1e-9, `${e.id} beat ${i + 1} pressed before the one before landed`);
    });
    assert.ok(m.breath > 0 && m.apart > 0.62, e.id);
  }
});

test('combinations: at the tempo of his grade (§7.4), to the frame, but where the beat before keeps the chain or the same hand starts out of its guard', () => {
  const off = [];
  for (const e of COMBINATIONS) {
    const { m } = fought(e);
    for (let i = 1; i < m.beats.length; i++) {
      const want = gapOf(e.beats[i - 1], e.beats[i], e.level),
        got = m.beats[i].t - m.beats[i - 1].t;
      // (never later than a frame after it: pressed as it is due, or as soon as the chain takes it)
      if (Math.abs(got - want) > DT + 1e-6) off.push(`${e.id} ${i}: ${Math.round(got * 1000)} for ${Math.round(want * 1000)}`);
    }
  }
  // (the jab after a jab: the second starts where the first stopped, at his guard, and lands at once: same hand, stage C3)
  const allowed = off.filter(s => !/^1-1-2@/.test(s) || !/ 1: /.test(s)),
    late = off.filter(s => /^1-1-2@/.test(s) && / 1: /.test(s));
  assert.deepEqual(allowed, []);
  assert.ok(late.length <= 4, late.join('; '));
});

test('combinations: the same card is the same bout every time', () => {
  for (const id of ['1-2@4m', '1-6-3-2@5a', 'chain@1']) {
    const e = COMBINATIONS.find(x => x.id === id),
      again = fight(comboScript(COMBO_ROWS.find(r => r.id === e.combo), e.level));
    assert.deepEqual(again.events, fought(e).events, id);
  }
});
