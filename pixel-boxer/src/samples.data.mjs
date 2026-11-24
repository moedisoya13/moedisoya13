/* The motion catalogue's new samples (src/catalog.mjs: the part "새 샘플" above the others): what is shown to the user that is
   no change to a row's motion, a row each, until it is taken out of the list once the user has seen it. Nothing here knows
   the page: node reads it too (tests/wear.test.mjs).
     SAMPLES   { id, group (the heading it is under), name, en, note (what it is), say (what is new, the row's mark), at (the day it was made), script (a
               catalogue script id: the row's cards are that script's card, as the row it is in has it), wear (one card each:
               what the men wear, as the game's ?wear= says it: '' as they are, 'training' both men in the suit with the hood
               down, 'training-up' the hood up, 'training,none' the first man only) }. An entry with no script is a line of
               words alone.
     WEAR_SAID what a card's caption says it is dressed in (the row's name says in what) */
export const WEAR_SAID = { '': '맨몸', training: '후드 내림', 'training-up': '후드 씀' };

// (the training suit, made 2026-11-24: rig/boxer.mjs WEAR; each dressed card beside the same moment of the bare fighter)
const SUIT = ['', 'training', '', 'training-up'];
const SUIT_SAY = '트레이닝복(회색 후드 티와 운동 바지, 후드 내림 · 후드 씀): 두 선수 모두 입음(게임의 ?wear=training). 겉모습만 바뀌고 시합·물리는 그대로';
export const SAMPLES = [
  { id: 'training-guard', group: '트레이닝복', name: '트레이닝복 · 가드', en: 'The training suit: covering up', at: '2026-11-24', script: 'guard@3', wear: SUIT, say: SUIT_SAY, note: '프로(3단계)의 가드 카드 그대로입니다. 왼쪽은 맨몸, 오른쪽은 같은 순간의 트레이닝복(위 줄은 후드 내림, 아래 줄은 후드 씀). 상대는 한 단계 어두운 회색입니다.' },
  { id: 'training-hook', group: '트레이닝복', name: '트레이닝복 · 훅', en: 'The training suit: the hook', at: '2026-11-24', script: 'hook@3', wear: SUIT, say: SUIT_SAY, note: '프로(3단계)의 앞손 훅 카드 그대로입니다. 왼쪽은 맨몸, 오른쪽은 같은 순간의 트레이닝복(위 줄은 후드 내림, 아래 줄은 후드 씀).' }
];
