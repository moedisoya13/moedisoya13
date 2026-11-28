/* The game page's match (a-screen-ai): who fights whom from a seed (game/card.mjs), and what the match sounds like through the
   one mapping the game and the sparring share (game/audio.mjs cuesOf, with c.match): a knockdown is counted, so its blow
   rings no knockout bell, the result does; a round's end and start ring once. The page itself, in a browser, is
   tests/pages.test.mjs ("the game page is a match"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardOf, matchOf, gradeShown } from '../src/game/card.mjs';
import { MATCH } from '../src/game/match.mjs';
import { SPAR } from '../src/spar/plan.mjs';
import { LEVEL, LEVELS } from '../src/anim/skill.mjs';
import { loadout } from '../src/game/profile.mjs';
import { cuesOf } from '../src/game/audio.mjs';

test('the fight card: the same seed is the same two men, never more than two grades apart, each with what his grade opens', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const a = cardOf(seed),
      b = cardOf(seed);
    assert.deepEqual(a, b, `#${seed}: the same card twice`);
    const [x, y] = a.men;
    assert.ok(Math.abs(LEVEL[x.grade].grade - LEVEL[y.grade].grade) <= SPAR.gap, `#${seed}: ${x.grade} v ${y.grade}`);
    for (const m of a.men) {
      assert.ok(LEVELS.includes(m.grade), m.grade);
      // (what he carries is a loadout his grades open: the profile's own pick of what was asked)
      assert.deepEqual(loadout(m.skills, m.techniques), m.techniques, `#${seed}: ${m.techniques.join(',')}`);
      seen.add(m.grade);
    }
  }
  assert.ok(seen.size >= 6, `grades drawn over 60 seeds: ${[...seen].join(' ')}`);
  assert.deepEqual(['1', '3', '4m', '4a', '5m', '5a'].map(gradeShown), ['1', '3', '4L', '4D', '5L', '5D']);
});

test('the match from a card: the men as the card has them, and the match\'s own length unless the page asks another', () => {
  const m = matchOf(7),
    c = cardOf(7);
  assert.equal(m.rounds, MATCH.rounds);
  assert.equal(m.roundTime, MATCH.roundTime);
  assert.deepEqual(m.card, c);
  m.bout.fighters.forEach((f, i) => {
    assert.deepEqual(f.skills, c.men[i].skills);
    assert.deepEqual(f.techniques, c.men[i].techniques);
  });
  const short = matchOf(7, { rounds: 2, roundTime: 8, arena: 'underground' });
  assert.deepEqual([short.rounds, short.roundTime, short.bout.arena], [2, 8, 'underground']);
});

test('a match\'s sounds: the knockout bell is the result\'s (not every knockdown\'s), the bell at each round\'s end and start', () => {
  const bells = (e, c) => cuesOf(e, c).filter(q => q.name === 'bell').map(q => q.o);
  const down = { type: 'hit', who: 0, on: 1, J: 120, part: 'glove', down: true };
  // (the bout alone, as the sparring has it: the knockdown is the end, its bell held for after the replay)
  assert.equal(bells(down, {}).length, 1);
  assert.equal(bells(down, {})[0].ko, true);
  // (a match's: he is counted first; his blow, his breath going out of him, but no bell)
  assert.deepEqual(bells(down, { match: true }), []);
  assert.deepEqual(cuesOf(down, { match: true }).map(q => q.name), ['impact', 'exhale']);
  // (counted out, or down again after rising too late: three, at once, nothing to wait for; the third knockdown of a round,
  // on the blow itself: three, held as the bout's own knockout's is, for after its replay)
  const ko = bells({ type: 'result', winner: 0, how: 'KO' }, { match: true }),
    tko = bells({ type: 'result', winner: 0, how: 'TKO' }, { match: true });
  assert.deepEqual([ko.length, ko[0].strikes, !!ko[0].ko], [1, 3, false]);
  assert.deepEqual([tko.length, tko[0].strikes, tko[0].ko], [1, 3, true]);
  // (a decision or a draw has had the last round's bell)
  for (const how of ['decision', 'draw']) assert.deepEqual(bells({ type: 'result', winner: null, how }, { match: true }), [], how);
  for (const type of ['bell', 'round']) {
    assert.deepEqual(bells({ type, round: 1 }, { match: true }).map(o => o.strikes), [1], type);
    // (not a bell again in a replay, and none on a page that is not a match's)
    assert.deepEqual(bells({ type, round: 1 }, { match: true, replay: true }), [], type);
    assert.deepEqual(cuesOf({ type, round: 1 }, {}), [], type);
  }
  assert.deepEqual(bells({ type: 'result', how: 'KO' }, {}), []);
  // (a man up too late going down again: his breath going out of him; his knee on the canvas is the page's floor)
  assert.deepEqual(cuesOf({ type: 'collapse', who: 1 }, { match: true }).map(q => q.name), ['exhale']);
});
