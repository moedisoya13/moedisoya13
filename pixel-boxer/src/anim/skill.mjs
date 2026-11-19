/* How well a boxer does a thing. Every move has seven grades: five levels of skill, and at the top two of them two ways of
   being that good, clean (명) or dirty (암).
     1   입문      just started: the joints go in the wrong order, the arm before the body, the timing all over the place
     2   아마추어  out of the book: the order is right, but each joint waits for the one before to finish, so the pushes
                   do not add up, and the habits of a beginner are still there to see
     3   프로      the textbook, as the moves are written (moves.mjs): each joint takes over as the one below passes its peak
     4명 일류      clean and strong: each joint is already going before the one below peaks, the peaks arrive together at
                   the contact, nothing shows before it, and the hand is home again at once
     4암 일류      the same body, and dirty with it: the elbow, the forearm, the head, the laces, used where a referee might
                   not see them
     5명 전설      a legend of another era: no wind-up at all, the whole chain one movement, relaxed until the instant it
                   snaps, and back before the other man has seen it
     5암 전설      the same, and dirty the way only a man who has done it for twenty years can be: the foul folded so far into
                   the punch that it is part of it
   None of this is a multiplier on damage. The grade changes how the joints fire and how the body is held, and the punch
   that comes out of that is whatever the physics makes it (phys/chain.mjs, game/bout.mjs): a beginner's punch is weaker
   and slower because of how it is thrown.

   chain: what it does to the kinetic chain (see chain.mjs)
     order    which joints the throw starts with, and which each one hands on to: [start, next] (left out: the legs first,
              each joint to the one above)
     early    a joint hands on once its push has dropped to this share of what it started with (0 is at its peak speed; more
              is sooner, so the next joint's push overlaps its own), a number for each joint, legs first
     lag      and then waits this many seconds more (a joint that hands on late), the same
     damp     how much each joint runs past its end and back: under the written 0.62 it snaps, over it it sags
     amp      how far each joint turns, times what is written: legs, hips, trunk, shoulder, elbow
     coil     the wind-up, times what is written (a wind-up that sets the arm, a hook's or an uppercut's, never under 0.9 of
              it: that much is mechanics, not a tell); least: seconds of wind-up even a punch written with none has
     hold     seconds the punch stays out once it has got there (a dirty one stays for its foul)
     shown    how much of the wind-up's movement shows, times what is written (what sets the arm is always all there)
     back     how fast it comes home, times; backLag: how long each joint waits to start home, times
     firm     how solid the arm and the wrist are at the instant of contact: the share of the weight behind the fist that
              stays behind it (a beginner's give; a great puncher's are a little more than solid, the whole arm set)
   form: how the rest of the body is held while the punch goes (each 0 in the textbook)
     guard    the other hand: dropped (1 is a beginner's, all the way to the chest), or kept tighter (negative)
     chin     up and out (1), or tucked (negative)
     over     leaning in after it, the weight over the front foot
     tell     the wind-up shown: the hand drawn back and the elbow out before it goes
     dirty    0 clean; 1 the punch's foul (moves.mjs: dirty), 2 that, refined, and a second one with it */
export const LEVELS = ['1', '2', '3', '4m', '4a', '5m', '5a'];

// the legs set the hips and the arm off together, and each goes its own way: the arm does not wait for the trunk, so it gets
// there before the body has turned behind it
const ARM_FIRST = [[0], { 0: [1, 3], 1: [2], 2: [], 3: [4], 4: [] }];

export const LEVEL = {
  1: {
    grade: 1, side: null, name: '입문', label: '1',
    chain: { order: ARM_FIRST, lag: [0.03, 0.03, 0, 0, 0], damp: 0.95, amp: [0.7, 0.85, 0.85, 1, 1], coil: 1.8, least: 0.08, back: 0.6, backLag: 2.4, firm: 0.75 },
    form: { guard: 1, chin: 1, over: 1, tell: 1, dirty: 0 }
  },
  2: {
    grade: 2, side: null, name: '아마추어', label: '2',
    chain: { lag: [0.01, 0, 0, 0, 0], damp: 0.66, amp: [0.85, 0.92, 0.95, 1, 1], coil: 1.3, least: 0.035, back: 0.8, backLag: 1.5, firm: 0.78 },
    form: { guard: 0.4, chin: 0.35, over: 0.35, tell: 0.4, dirty: 0 }
  },
  3: {
    grade: 3, side: null, name: '프로', label: '3',
    chain: {},
    form: { guard: 0, chin: 0, over: 0, tell: 0, dirty: 0 }
  },
  '4m': {
    grade: 4, side: 'm', name: '일류 · 명', label: '4명',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: 0.6, amp: [1.1, 1.1, 1.08, 1, 1], coil: 0.55, shown: 0.65, back: 1.12, backLag: 1, firm: 1.08 },
    form: { guard: -0.3, chin: -0.5, over: 0, tell: 0, dirty: 0 }
  },
  '4a': {
    grade: 4, side: 'a', name: '일류 · 암', label: '4암',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: 0.6, amp: [1.1, 1.1, 1.08, 1, 1], coil: 0.55, shown: 0.65, back: 1.05, backLag: 1, firm: 1.08, hold: 0.1 },
    form: { guard: -0.2, chin: -0.4, over: 0.15, tell: 0, dirty: 1 }
  },
  '5m': {
    grade: 5, side: 'm', name: '전설 · 명', label: '5명',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: 0.6, amp: [1.14, 1.12, 1.1, 1, 1], coil: 0.2, shown: 0.55, back: 1.2, backLag: 1, firm: 1.2 },
    form: { guard: -0.4, chin: -0.6, over: 0, tell: 0, dirty: 0 }
  },
  '5a': {
    grade: 5, side: 'a', name: '전설 · 암', label: '5암',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: 0.6, amp: [1.14, 1.12, 1.1, 1, 1], coil: 0.25, shown: 0.55, back: 1.12, backLag: 1, firm: 1.2, hold: 0.08 },
    form: { guard: -0.3, chin: -0.5, over: 0.1, tell: 0, dirty: 2 }
  }
};
for (const [id, level] of Object.entries(LEVEL)) level.id = id;

// the grade a boxer throws a move at: his sheet of skills names one for the move, or for everything, or he is a pro
export const levelOf = (skills, move) => LEVEL[(skills && (skills[move] || skills.all)) || '3'] || LEVEL[3];
