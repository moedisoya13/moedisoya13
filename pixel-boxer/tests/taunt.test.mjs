// A show-off's taunts in a sparring round (src/spar/plan.mjs, STYLE show): about 5% of the round, grade by grade (the user,
// 2026-11-28: "도발은 5% 수준으로"; before, 4암 and 5암 taunted 17% and 16% of these rounds, 18% and 18% over seeds 1-50).
// The rounds were fixed before the change, not chosen after it: seeds 1-10, the show-off as the red corner (4암, then 5암)
// against LEVELS[seed % 7], each round counted up to its knockdown, his frames in a taunt over the round's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, replayOf } from '../src/spar/plan.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { MOVES } from '../src/anim/moves.mjs';

test('sparring: a show-off taunts about 5% of the round, at each of his grades', () => {
  const out = {};
  for (const grade of ['4a', '5a']) {
    let frames = 0,
      taunting = 0,
      taunts = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const plan = planOf(seed, { grades: [grade, LEVELS[seed % 7]] });
      replayOf(plan, (bout, k) => {
        if (k >= plan.ko.step) return;
        frames++;
        const f = bout.fighters[0];
        if (f.action && MOVES[f.action.name].taunt) taunting++;
        for (const e of bout.events) if (e.type === 'taunt' && e.who === 0) taunts++;
      });
    }
    out[grade] = { share: taunting / frames, taunts };
  }
  for (const [grade, r] of Object.entries(out)) {
    assert.ok(r.share >= 0.025 && r.share <= 0.075, `${grade}: ${(100 * r.share).toFixed(1)}% of the round taunting (${r.taunts} taunts in ten rounds)`);
    assert.ok(r.taunts >= 10, `${grade}: he still taunts (${r.taunts} in ten rounds)`);
  }
});
