/* The game page's fight card (index.html, src/main.mjs; a-screen-ai, the user's answer of 2026-11-28: "고친 시합 엔진을 화면에서
   보게"): who fights whom, from a seed, and the match they fight (game/match.mjs: rounds, the breaks, the count, the judges),
   both corners boxed by their heads (game/brain.mjs), nobody at the controls. The same seed is the same match, to the step:
   the page steps it one sixtieth of a second at a time as finish() would (tests/pages.test.mjs holds the two equal;
   tests/card.test.mjs the card).
     cardOf(seed)            -> { seed, men: [{ grade, skills, techniques }, ...] }: the two men the sparring round of the
                                same seed draws (src/spar/plan.mjs pairOf: each of the seven grades as likely, never more than
                                two grades apart, the user's rule of 2026-11-28; his loadout from what his grade opens)
     matchOf(seed, o)        -> createMatch for that card. o: { rounds, roundTime (seconds), arena }; the match's own
                                (MATCH.rounds of MATCH.roundTime) if left out
   Nothing here draws. */
import { createMatch, MATCH } from './match.mjs';
import { pairOf } from '../spar/plan.mjs';
import { LEVEL } from '../anim/skill.mjs';

export const cardOf = seed => ({ seed, men: pairOf(seed) });

export function matchOf(seed, o) {
  o = o || {};
  const card = cardOf(seed),
    match = createMatch({ seed, skills: card.men.map(m => m.skills), techniques: card.men.map(m => m.techniques), rounds: o.rounds || MATCH.rounds, roundTime: o.roundTime || MATCH.roundTime, arena: o.arena });
  match.card = card;
  return match;
}

// (a grade as the screens say it: 명 and 암 as L and D, 4명 -> 4L; the code and the docs keep 명 and 암)
export const gradeShown = lv => LEVEL[lv].label.replace('명', 'L').replace('암', 'D');
