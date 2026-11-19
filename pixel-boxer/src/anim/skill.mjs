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
   Clean is rhythm: a clean boxer's feet keep a beat you could dance to, and his punches are timed on it (or, a legend's,
   just off it, where the other man's beat is not). Dirty is the back-room fight: the beat is rubbed out, the feet drag and
   lurch, the head rolls low, and every punch has something else in it.
   None of this is a multiplier on damage. The grade changes how the joints fire and how the body is held, and the punch
   that comes out of that is whatever the physics makes it (phys/chain.mjs, game/bout.mjs): a beginner's punch is weaker
   and slower because of how it is thrown.

   A boxer's sheet of skills names a grade for each move, and one for his footwork (`stance`: the guard, the bounce, the
   head, the way he travels); whatever it leaves out is `all`, or a pro's.

   chain: what it does to the kinetic chain (see chain.mjs)
     order    which joints the throw starts with, and which each one hands on to: [start, next] (left out: the legs first,
              each joint to the one above)
     early    a joint hands on once its push has dropped to this share of what it started with (0 is at its peak speed; more
              is sooner, so the next joint's push overlaps its own), a number for each joint, legs first
     lag      and then waits this many seconds more (a joint that hands on late), the same
     damp     how much each joint runs past its end and back: under the written 0.62 it snaps, over it it sags (one number
              for all of them, or one each: the trunk's is the recoil of the body, how it springs back off the turn)
     amp      how far each joint turns, times what is written: legs, hips, trunk, shoulder, elbow
     coil     the wind-up, times what is written (a wind-up that sets the arm, a hook's or an uppercut's, never under 0.9 of
              it: that much is mechanics, not a tell); least: seconds of wind-up even a punch written with none has
     hold     seconds the punch stays out once it has got there (a dirty one stays for its foul)
     shown    how much of the wind-up's movement shows, times what is written (what sets the arm is always all there)
     back     how fast it comes home, times; backLag: how long each joint waits to start home, times
     firm     how solid the arm and the wrist are at the instant of contact: the share of the weight behind the fist that
              stays behind it (a beginner's give; a great puncher's are a little more than solid, the whole arm set)
   form: how the rest of the body is held while the punch goes (each 0 in the textbook unless said)
     guard    the other hand: dropped (1 is a beginner's, all the way to the chest), or kept tighter (negative)
     chin     up and out (1), or tucked (negative)
     over     leaning in after it, the weight over the front foot
     tell     the wind-up shown: the hand drawn back and the elbow out before it goes
     dirty    0 clean; 1 the punch's foul (moves.mjs: dirty), 2 that, refined, and a second one with it
     lively   how much of the bounce goes on under the punch (the textbook's 0.35)
     dip      metres the hips sink into the knees as the hips fire (negative), on a raised cosine; late: seconds later than
              that; a beginner instead stands up out of it as the arm goes out (positive)
     drop     a foot that is in the air when the punch starts is put down at once (a drop step), and the body unfolds out of
              the dip as the trunk and shoulder go (st, a share of his height)
     sep      degrees the shoulders stay behind the hips as the hips turn (the stretch across the trunk: X-factor)
     off      metres the head is taken off the line of the punch by the time it lands (negative: it follows the fist onto the
              line); with: what moves it, 'trunk' (as the trunk turns), 'hips' (with the hips, before the glove has left
              the guard), 'legs' (first of all, with the legs and the wind-up)
     tuck     degrees the punching shoulder is turned in and the head tilted onto it, the shoulder up to the chin
     look     how much of a turn of the shoulders the eyes take back to stay on the other man (the textbook's 0.9)
     bend     degrees of side bend a hook or an uppercut is thrown with (the head going down to the side the weight goes to)
     exit     how he comes out of it: 'stumble' (off balance, the feet come together), 'flat' (back the way it went, then
              stands flat for a beat), null (back into the guard and the bounce), 'roll' (the head moved on, under, to the
              other side), 'angle' (that, and a step off to the side, turned back in)
     beat     where on his beat the punch lands: 'on' (the contact on a foot coming down), 'off' (halfway between two), or
              null (wherever it lands)
   stance: how he stands and moves when he is not doing anything else (each 1, or 0, in the textbook unless said)
     bounce, hop, rock, lag   the bounce, the foot snapped off the canvas, the weight's pendulum, how much the head and the
              gloves ride the bounce behind the hips: times what is written
     accent   [lead, rear]: how deep the landing on each foot squashes (a strong beat and a weak one)
     swing    the share of a cycle the half beat that starts on the lead foot takes (0.5 is even)
     jitter   each half beat is this much longer or shorter than the last, at random (no beat to speak of)
     tempo    'phrase': the tempo changes through a phrase of sixteen half beats (and stops, once, dead)
     drag     how much of a step is a slide along the canvas instead of a lift off it
     flat     the heels stay down (no rise onto the balls of the feet)
     hips lean yaw gap shoulder   metres up, degrees forward, degrees square to the other man, metres between the feet
              (closer, negative), degrees the lead shoulder is hunched up
     guard    { y: metres the hands are held higher, apart: metres wider, elbow: how far out, chin: degrees down, lead:
              [x, y, z] the lead hand put out, loose: the hands let go soft }
     look     the eyes' share of a turn of the shoulders, as in form
     head     the head's own movement: { A: metres to either side, D: metres it dips passing the middle, T: half beats a
              swing to one side and back takes, beat: 'free' (its own time, seconds = T x 0.32), 'locked' (an end at each
              lead foot), 'phrase' (the legend's phrase), 'roll' (low and loose, free of the beat), level: { every: half
              beats (or seconds, free), depth: metres, lean: degrees } } | null
     travel   { cycle: the travelling beat, times; lean: degrees he leans into it, the body ahead of the feet; lurch: metres
              he carries on past when he stops; halting: how nearly each step comes to a stop }
     flourish 'nervous' (shifting his feet), 'clean' (the five), 'dirty' (the four) | null
     paw      metres the lead hand reaches out, now and then, to find the range (a heavy, dirty man's) */
export const LEVELS = ['1', '2', '3', '4m', '4a', '5m', '5a'];

// the legs set the hips and the arm off together, and each goes its own way: the arm does not wait for the trunk, so it gets
// there before the body has turned behind it
const ARM_FIRST = [[0], { 0: [1, 3], 1: [2], 2: [], 3: [4], 4: [] }];

const TEXTBOOK_STANCE = {
  bounce: 1, hop: 1, rock: 1, lag: 1, accent: [1, 1], swing: 0.5, jitter: 0, tempo: null, drag: 0, flat: false,
  hips: 0, lean: 0, yaw: 0, gap: 0, shoulder: 0,
  guard: { y: 0, apart: 0, elbow: 0, chin: 0, lead: [0, 0, 0], loose: 0 },
  look: 0.9,
  head: { A: 0.022, D: 0, T: 4, beat: 'free' },
  travel: { cycle: 1, lean: 0, lurch: 0, halting: 0 },
  flourish: null,
  paw: 0
};
const stance = more => Object.assign({}, TEXTBOOK_STANCE, more, { guard: Object.assign({}, TEXTBOOK_STANCE.guard, more.guard), travel: Object.assign({}, TEXTBOOK_STANCE.travel, more.travel) });
const TEXTBOOK_FORM = { guard: 0, chin: 0, over: 0, tell: 0, dirty: 0, lively: 0.35, dip: -0.015, late: 0, drop: false, sep: 3, off: 0.03, with: 'trunk', tuck: 0, look: 0.9, bend: 0, exit: null, beat: null };
const form = more => Object.assign({}, TEXTBOOK_FORM, more);

export const LEVEL = {
  1: {
    grade: 1, side: null, name: '입문', label: '1',
    chain: { order: ARM_FIRST, lag: [0.03, 0.03, 0, 0, 0], damp: 0.95, amp: [0.3, 0.45, 0.4, 1, 1], coil: 1.8, least: 0.08, back: 0.6, backLag: 2.4, firm: 0.75 },
    form: form({ guard: 1, chin: 1, over: 2.5, tell: 1, lively: 0, dip: 0.015, sep: 0, off: -0.02, with: 'trunk', look: 0.25, exit: 'stumble' }),
    // stiff and square on, flat on his feet, the hands low and the chin up, his weight shifting about off the beat
    // (his knees locked: his hips as high as his legs will go with his feet still on the canvas)
    stance: stance({ bounce: 0, hop: 0, rock: 0.15, lag: 0, jitter: 0.12, flat: true, hips: 0.015, lean: -7, yaw: 10, gap: -0.04, guard: { y: -0.06, apart: 0.04, elbow: 0.25, chin: -6 }, look: 0.25, head: null, travel: { cycle: 1.35, lean: 6, lurch: 0.05 }, flourish: 'nervous' })
  },
  2: {
    grade: 2, side: null, name: '아마추어', label: '2',
    chain: { lag: [0.01, 0, 0, 0, 0], damp: 0.66, amp: [0.8, 0.8, 0.8, 1, 1], coil: 1.3, least: 0.035, back: 0.8, backLag: 1.5, firm: 0.86 },
    form: form({ guard: 0.4, chin: 0.35, over: 0.35, tell: 0.4, lively: 0.15, dip: -0.005, late: 0.05, sep: 0, off: 0, look: 0.6, exit: 'flat' }),
    // a small, even bounce, all of a piece: the head and the gloves go up and down with the hips
    stance: stance({ bounce: 0.45, hop: 0.4, rock: 0.4, lag: 0.3, hips: 0.01, lean: -3, yaw: 4, guard: { y: 0.01, elbow: 0.1 }, look: 0.6, head: null, travel: { cycle: 1.15, halting: 0.7 } })
  },
  3: {
    grade: 3, side: null, name: '프로', label: '3',
    chain: {},
    form: form({}),
    // the textbook's bounce, and the head starting to move: off the line and back, in its own time
    stance: stance({})
  },
  '4m': {
    grade: 4, side: 'm', name: '일류 · 명', label: '4명',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: [0.6, 0.6, 0.56, 0.6, 0.6], amp: [1.1, 1.15, 1.1, 1, 1], coil: 0.55, shown: 0.65, back: 1.12, backLag: 1, firm: 1.08 },
    form: form({ guard: -0.3, chin: -0.5, lively: 0.5, dip: -0.03, drop: true, sep: 7, off: 0.07, with: 'hips', tuck: 4, look: 1, bend: 4, exit: 'roll', beat: 'on' }),
    // strong and weak, the lead foot's landing the heavy one; the head an end on every lead foot, under in between
    stance: stance({ bounce: 1.15, lag: 1.1, accent: [1.3, 0.8], guard: { chin: 4 }, look: 1, head: { A: 0.045, D: 0.025, T: 4, beat: 'locked', level: { every: 8, depth: 0.07, lean: 5 } } })
  },
  '4a': {
    grade: 4, side: 'a', name: '일류 · 암', label: '4암',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: [0.6, 0.6, 0.56, 0.6, 0.6], amp: [1.1, 1.15, 1.1, 1, 1], coil: 0.55, shown: 0.65, back: 1.05, backLag: 1, firm: 1.08, hold: 0.1 },
    form: form({ guard: -0.2, chin: -0.4, over: 0.15, dirty: 1, lively: 0.5, dip: -0.03, drop: true, sep: 7, off: 0.07, with: 'hips', tuck: 4, look: 1, bend: 4, exit: 'roll' }),
    // the beat rubbed out: low and heavy, the feet dragged and lurching, the head rolling low in its own time
    stance: stance({ bounce: 0.45, hop: 0.6, rock: 0.8, jitter: 0.25, drag: 0.6, hips: -0.03, lean: 4, guard: { lead: [-0.01, 0, 0.03] }, look: 1, head: { A: 0.055, D: 0.04, T: 4, beat: 'roll', level: { every: 2.6, depth: 0.08, lean: 5 } }, paw: 0.06 })
  },
  '5m': {
    grade: 5, side: 'm', name: '전설 · 명', label: '5명',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: [0.6, 0.6, 0.5, 0.6, 0.6], amp: [1.15, 1.25, 1.18, 1, 1], coil: 0.2, shown: 0.55, back: 1.15, backLag: 1, firm: 1.2 },
    form: form({ guard: -0.4, chin: -0.6, lively: 0.7, dip: -0.04, drop: true, sep: 11, off: 0.1, with: 'legs', tuck: 6, look: 1, bend: 6, exit: 'angle', beat: 'off' }),
    // the lightest feet: a swung beat, a phrase that quickens, stops dead and breaks out into something
    stance: stance({ bounce: 1.1, hop: 1.3, rock: 1.1, lag: 1.25, swing: 0.58, tempo: 'phrase', guard: { y: -0.02, loose: 1 }, look: 1, head: { A: 0.045, D: 0.025, T: 4, beat: 'phrase', level: { depth: 0.07, lean: 5 } }, flourish: 'clean' })
  },
  '5a': {
    grade: 5, side: 'a', name: '전설 · 암', label: '5암',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: [0.6, 0.6, 0.5, 0.6, 0.6], amp: [1.15, 1.25, 1.18, 1, 1], coil: 0.25, shown: 0.55, back: 1.12, backLag: 1, firm: 1.2, hold: 0.08 },
    form: form({ guard: -0.3, chin: -0.5, over: 0.1, dirty: 2, lively: 0.7, dip: -0.04, drop: true, sep: 11, off: 0.1, with: 'legs', tuck: 6, look: 1, bend: 6, exit: 'angle' }),
    // lower still and always rolling, the lead shoulder up and the lead hand in his eyes, the beat nowhere
    stance: stance({ bounce: 0.35, hop: 0.5, rock: 0.8, lag: 1.1, jitter: 0.25, drag: 0.7, hips: -0.04, lean: 5, shoulder: 3, guard: { lead: [-0.03, 0.03, 0.07] }, look: 1, head: { A: 0.06, D: 0.05, T: 4, beat: 'roll', level: { every: 1.9, depth: 0.08, lean: 5 } }, flourish: 'dirty' })
  }
};
for (const [id, level] of Object.entries(LEVEL)) level.id = id;

// the grade a boxer throws a move at: his sheet of skills names one for the move, or for everything, or he is a pro (a sheet
// may hold a grade itself, as well as a grade's name: a measurement made on a grade with something held still, say)
export const levelOf = (skills, move) => {
  const named = skills && (skills[move] || skills.all);
  return (typeof named === 'object' ? named : LEVEL[named || '3']) || LEVEL[3];
};
