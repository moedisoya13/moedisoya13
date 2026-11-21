/* How well a boxer does a thing. Every move has seven grades: five levels of skill, and at the top two of them two ways of
   being that good, clean (명) or dirty (암).
     1   입문      just started: the joints go in the wrong order, the arm before the body, the timing all over the place
     2   아마추어  out of the book: the order is right, but each joint waits for the one before to finish, so the pushes
                   do not add up, and the habits of a beginner are still there to see
     3   프로      the textbook, as the moves are written (moves.mjs): each joint takes over as the one below passes its peak
     4명 일류      clean and strong: each joint is already going before the one below peaks, the peaks arrive together at
                   the contact, nothing shows before it, and the hand is home again at once
     4암 일류      the same body, and dirty with it: a glove left over the face, a foot on the instep, where a referee
                   might not see them
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
     spring   a punch that comes up out of the knees (moves.mjs: chain.spring, the inside uppercut): { down: its wind-up, the
              way down into the knees, times what is written, in place of coil; pause: seconds held at the bottom before
              the legs let go (the spring broken); wait: he waits for his next foot to come down (half a beat at most) and
              goes down with the landing, the squash of it and the knees one movement }
   form: how the rest of the body is held while the punch goes (each 0 in the textbook unless said)
     guard    the other hand: dropped (1 is a beginner's, all the way to the chest), or kept tighter (negative)
     chin     up and out (1), or tucked (negative)
     over     leaning in after it, the weight over the front foot
     tell     the wind-up shown: the hand drawn back and the elbow out before it goes
     dirty    0 clean; 1 the punch's foul, done in the open (moves.mjs: foul), 2 the same, small, passed off as an accident
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
     knee     degrees the knees bend through, either way, bouncing on the spot (the textbook's 5.4: the hips go up and down
              with them; a beginner's are stiff, a legend's the most supple)
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
     flourish 'nervous' (shifting his feet), 'clean' (the five), 'dirty' (the two) | null
     paw      metres the lead hand reaches out, now and then, to find the range (a heavy, dirty man's)
     travel also: order (the chance the wrong foot steps first), width (the share of his stance kept in the middle of a
              step: under 1, the feet come together), face (seconds his chest is behind the other man going round him),
              pivot (degrees he lets him get round before he turns, all at once)
     legend   a legend's movement (anim/legend.mjs, docs/moves-plan-4.md §12): the head and the knees part of the shape of
              going anywhere. null below 5. { beat: the bottom of each U, and the slip, on a foot coming down (clean) or
              not (dirty: loose); weave: [metres the head goes to either side of the middle as each foot comes down (a third
              of it the hips over the feet), metres it goes down under it on the knees]; deep: [every so many landings,
              metres down] (clean), deepLean: degrees of waist in a deep one; slip: metres the head goes outside as the
              lead foot lands stepping in; knee: degrees the knees stay bent going in; sway: degrees the trunk lies back as
              the rear foot lands stepping out; dash: { in: [knees, degrees, at the bottom; metres off to his right; knees
              left bent at the end], back: [degrees of sway, metres of the slip on landing], side: [metres down, seconds
              the U takes, metres across] }; loose (dirty): { off: half beats a U is off its landing, at most; size:
              [least, most] times; flip: the chance it goes the other way; skip: the chance a landing brings nothing; feint:
              the chance of a feint of the lead shoulder; shoulder: degrees of it } }
     show     a show-off's stance (anim/show.mjs, docs/moves-plan-4.md §5.1): null but at 4암 and 5암. { drop: [x, y, z] metres
              the lead hand is let down to the waist, swing: [metres it swings, a second, every: seconds between big swings (0:
              it never stops), big: times] (the rear hand stays where a guard's is, at the chin), lean: degrees leant back, chin: degrees
              the chin is pushed out, shoulder: degrees the lead shoulder is hunched up, roll: degrees it is turned in; taunt:
              the chance of a taunt { idle: every 16 half beats standing, evade: just after a punch has missed him, hit: just
              after one under 30 N·s has landed, hop: on the last hop moving away }, and long: how long a taunt lasts, times
              the plan's, size: how big }
   evade: how he gets his head out of the way (anim/evade.mjs; each 0 or 1 in the textbook unless said)
     flinch   seconds he flinches before anything of the evasion starts; wince: how much of a beginner's flinch shows (the
              gloves up in front of his own eyes, the head jerked back and turned away)
     out hold back   the going, the time out there and the way back, times what is written
     move     how far the head is taken, times what is written (the hips, trunk and head; the hands and feet are their own)
     delay    { head, trunk, hips, feet, hands }: seconds after the press each group of joints starts reading the curve
     scale    the same groups: how much of what is written each does
     pause    seconds held at each corner of a weave (a beginner's and an amateur's go in pieces)
     cut      when a punch may start out of it: 'end' (once it is over), 'return' (four fifths of the way back), 'clear' (from
              the moment the head is off the line)
     load     how much of the next punch's wind-up the evasion's end has done already (the hand it leaves wound up:
              evade.mjs LOADED), 0..1
     look lively   as in form, while it goes
     exit     how he comes out of it: 'stumble' (a foot put out to catch himself, the hands late), 'flat' (stands flat a
              beat), null, 'angle' (stepped off to the side and turned back in)
     beat     'on': the way back is over on a foot coming down (the animator times his beat to it)
     follow   seconds after the press he waits out there at most for the other man's arm to start home (0: he does not)
     cross    degrees the way back carries the head over to the other side, under a shallow U
     in low   metres a dirty man goes in toward him as he goes off the line, and stays down
     knee     a duck's and a weave's way down: { share: how much of the knees he uses, times the pro's (evade.mjs: WRITTEN,
              knee: the knees' share of the head going down in the pro's), depth: how far down the head goes, times the
              pro's }. A beginner's knees are stiff and he bows; a legend goes down on knees that were bent already
     just     metres: a great one's head goes no further than this clear of where the committed punch is going (0: as far
              as the move goes)
   cover: how he covers up (the guard, the block, the parry)
     arrive   seconds the gloves take to get most of the way into the guard (63%)
     hands body   channels added to the written guard (moves.mjs: cover) when it is up
     lively head look   the bounce, the head's own movement and the eyes, behind it
     meet     { scale, add }: the gloves put out to meet a punch (a parry), times what is written, and what is added
     block    { brace (how far a blocked punch drives the gloves in and the body back, times), open (metres the hands are
              knocked apart), settle (how quickly the guard is back, times), go (degrees the trunk turns away with the punch,
              and metres the head goes back, the instant before it lands: riding it), lean (degrees leant into it, braced),
              meet (metres the glove goes out to take it early, and degrees the shoulder rolls it off) }
     back     how quickly the parrying hand comes home, times; load, hand: the punch a parry leaves wound up, and which hand
              ('other', 'same'), q: how far the shoulder of that punch is already out
     cross    a show-off's cross-arm guard (anim/show.mjs, docs/moves-plan-4.md §5.5): null but at 4암 and 5암. { L, R: [x, y,
              z, elbow] each hand moved from the covered guard, lean: degrees further forward, chin: degrees buried }. The
              forearms stop a punch as the gloves do (game/bout.mjs)
     hammer   and his parry, the rear fist hammered down on the glove coming in: { up, rise: metres up to the ear and seconds,
              down, fall: metres down and seconds, out: metres out in front as it comes down, back: seconds into the guard }
              (block.push: metres the arm that took it drives on in, a legend's)
   dash: how he dashes (each 0 in the textbook unless said)
     upright  he does not sink into it (nor lean into it): stood up, the hands thrown open; rise: metres more he comes up
     prep     metres he stands up first, before he pushes
     drag     how much of it is a slide along the canvas; low: metres he stays down after it
     land     'stumble' | 'flat' | null | 'angle'; turn: degrees he lands turned; bend: metres the rear knee is bent on landing
     extra    seconds after it before he can do anything else
   entry: how he ducks in under the punches (moves.mjs: duckIn; each the textbook's unless said)
     waist    how much of the way down is the waist and not the knees (1: a bow, the knees all but stiff); look: degrees
              the eyes go down (to the canvas)
     seam     seconds he stops between going down and going in (two movements)
     step     metres the lead foot is lifted as it goes; stop: metres short of where it was going he stops (centre to
              centre, more than the textbook's); rise: seconds at which the head is up again (null: as written)
     angle    degrees he turns out to the side as he lands, on the way in (an angle taken off his line); pivot: degrees he
              turns on the ball of the lead foot at the end, round to the other man's side, and the metres he goes round
     load     how much of the wind-up of a punch thrown out of the end of it is done already (the knees left bent): 0..1
   away: how he gets out of range with the guard let go of (moves.mjs: hopPivot, hopCircle)
     hop      how much he bounces off his ankles (times the textbook's, which is 1.4 times his bounce on the spot); 0: he
              walks back flat on his heels
     drop     how far the hands are let down, times the textbook's (28 cm the lead, 24 the rear); 0: they stay up at his
              face; slide: they slide down without his meaning it
     pivot    degrees he pivots off the line (hopPivot)
     accent   a strong beat and a weak one in the hops (a clean great one's)
     shuffle  his feet change over once in the air in the middle hop (a legend's)
     jitter   the hops keep no beat, each this much longer or shorter (a dirty one's)
     upright  degrees further back the trunk is held than the textbook's; together: how far the feet come together, 0..1 */
export const LEVELS = ['1', '2', '3', '4m', '4a', '5m', '5a'];

// the legs set the hips and the arm off together, and each goes its own way: the arm does not wait for the trunk, so it gets
// there before the body has turned behind it
const ARM_FIRST = [[0], { 0: [1, 3], 1: [2], 2: [], 3: [4], 4: [] }];

const TEXTBOOK_TRAVEL = { cycle: 1, lean: 0, lurch: 0, halting: 0, order: 0, width: 1, face: 0, pivot: 0 };
const TEXTBOOK_STANCE = {
  bounce: 1, knee: 5.4, hop: 1, rock: 1, lag: 1, accent: [1, 1], swing: 0.5, jitter: 0, tempo: null, drag: 0, flat: false,
  hips: 0, lean: 0, yaw: 0, gap: 0, shoulder: 0,
  guard: { y: 0, apart: 0, elbow: 0, chin: 0, lead: [0, 0, 0], loose: 0 },
  look: 0.9,
  head: { A: 0.022, D: 0, T: 4, beat: 'free' },
  travel: TEXTBOOK_TRAVEL,
  flourish: null,
  paw: 0,
  legend: null,
  show: null
};
const stance = more => Object.assign({}, TEXTBOOK_STANCE, more, { guard: Object.assign({}, TEXTBOOK_STANCE.guard, more.guard), travel: Object.assign({}, TEXTBOOK_STANCE.travel, more.travel) });
const TEXTBOOK_FORM = { guard: 0, chin: 0, over: 0, tell: 0, dirty: 0, lively: 0.35, dip: -0.015, late: 0, drop: false, sep: 3, off: 0.03, with: 'trunk', tuck: 0, look: 0.9, bend: 0, exit: null, beat: null };
const form = more => Object.assign({}, TEXTBOOK_FORM, more);
// (the pro's evasion is the curve as written: textbook marks it so that nothing re-times it at all)
const GROUPS0 = { head: 0, trunk: 0, hips: 0, feet: 0, hands: 0 },
  GROUPS1 = { head: 1, trunk: 1, hips: 1, feet: 1, hands: 1 };
const TEXTBOOK_EVADE = { textbook: true, knee: { share: 1, depth: 1 }, flinch: 0, wince: 0, out: 1, hold: 1, back: 1, move: 1, delay: GROUPS0, scale: GROUPS1, pause: 0, cut: 'return', load: 0.3, look: 0.9, lively: 0.35, exit: null, beat: null, follow: 0, cross: 0, in: 0, low: 0, just: 0 };
const evade = more => Object.assign({}, TEXTBOOK_EVADE, { textbook: false }, more, { delay: Object.assign({}, GROUPS0, more.delay), scale: Object.assign({}, GROUPS1, more.scale) });
const TEXTBOOK_COVER = { textbook: true, arrive: 1 / 22, hands: {}, body: {}, lively: 1, head: 1, look: null, meet: { scale: 1, add: {} }, block: { brace: 1, open: 0, settle: 1, go: null, lean: 0, meet: null }, back: 1, load: 0.3, hand: 'other', q: 0 };
const cover = more => Object.assign({}, TEXTBOOK_COVER, { textbook: false }, more, { meet: Object.assign({}, TEXTBOOK_COVER.meet, more.meet), block: Object.assign({}, TEXTBOOK_COVER.block, more.block) });
const TEXTBOOK_DASH = { upright: false, rise: 0, prep: 0, drag: 0, low: 0, land: null, turn: 0, bend: 0, extra: 0 };
const dash = more => Object.assign({}, TEXTBOOK_DASH, more);
const TEXTBOOK_ENTRY = { waist: 0, look: 0, seam: 0, step: 0.02, stop: 0, rise: null, angle: 0, pivot: [0, 0], load: 0.5 };
const entry = more => Object.assign({}, TEXTBOOK_ENTRY, more);
const TEXTBOOK_AWAY = { hop: 1, drop: 1, slide: false, pivot: 75, accent: false, shuffle: false, jitter: 0, upright: 0, together: 0 };
const away = more => Object.assign({}, TEXTBOOK_AWAY, more);

// a legend's movement (anim/legend.mjs): clean, on his beat; dirty, off it, never the same twice, a shoulder feinted in it
const LEGEND_CLEAN = { beat: true, weave: [0.07, 0.05], deep: [4, 0.085], deepLean: 4, slip: 0.07, knee: 10, sway: 5, dash: { in: [24, 0.04, 15], back: [8, 0.06], side: [0.11, 0.38, 0.05] }, loose: null };
const LEGEND_DIRTY = Object.assign({}, LEGEND_CLEAN, { beat: false, weave: [0.065, 0.055], deepLean: 0, loose: { off: 0.4, size: [0.5, 1.3], flip: 0.3, skip: 0.15, feint: 0.2, shoulder: 9 } });

/* a show-off's stance (anim/show.mjs, docs/moves-plan-4.md §5.1): the lead hand let down to the waist, swinging, leant back with
   the chin out and the lead shoulder up; a great dirty fighter big and blatant about it, a legend all but still and then one big
   swing, and his taunts the shorter and smaller (§5.4) */
const SHOW_4A = { drop: [0.03, -0.33, 0], swing: [0.06, 1.1, 0, 1], lean: 6, chin: 6, shoulder: 5, roll: 3, taunt: { idle: 0.3, evade: 0.25, hit: 0.2, hop: 0.6 }, long: 1.25, size: 1 };
const SHOW_5A = { drop: [0.02, -0.31, 0.01], swing: [0.012, 0.8, 2.6, 4], lean: 6, chin: 4, shoulder: 4, roll: 2, taunt: { idle: 0.15, evade: 0.4, hit: 0.3, hop: 0.4 }, long: 1, size: 0.6 };

/* a show-off's guard (anim/show.mjs, §5.5): the arms crossed, the lead forearm across the chin and the rear one up over the
   forehead, a great dirty fighter's high and wide open between them, a legend's low and tight; and the guard put up fresh is a
   hammer of the rear fist on the glove coming in, a great dirty fighter's swung, a legend's the wrist let fall */
const CROSS_4A = { L: [-0.11, 0.21, 0.012, 1.2], R: [-0.061, 0.186, -0.021, 0.8], lean: 6, chin: 6, pole: { L: [1, 0.8, 0], R: [-0.4, -0.2, 1] } };
const CROSS_5A = { L: [-0.08, 0.24, 0.02, 1.2], R: [-0.07, 0.17, -0.04, 0.8], lean: 6, chin: 8, pole: { L: [1, 0.8, 0], R: [-0.4, -0.2, 1] } };
const HAMMER_4A = { up: 0.06, rise: 0.05, down: 0.25, fall: 0.07, out: 0.16, across: 0.12, back: 0.15 };
const HAMMER_5A = { up: 0.04, rise: 0.04, down: 0.1, fall: 0.06, out: 0.12, across: 0.1, back: 0.12 };

export const LEVEL = {
  1: {
    grade: 1, side: null, name: '입문', label: '1',
    chain: { order: ARM_FIRST, lag: [0.03, 0.03, 0, 0, 0], damp: 0.95, amp: [0.3, 0.45, 0.4, 1, 1], coil: 1.8, least: 0.08, back: 0.6, backLag: 2.4, firm: 0.75, spring: { down: 1.3 } },
    form: form({ guard: 1, chin: 1, over: 2.5, tell: 1, lively: 0, dip: 0.015, sep: 0, off: -0.02, with: 'trunk', look: 0.25, exit: 'stumble' }),
    // stiff and square on, flat on his feet, the hands low and the chin up, his weight shifting about off the beat
    // (his knees locked: his hips as high as his legs will go with his feet still on the canvas)
    stance: stance({ bounce: 0, knee: 0, hop: 0, rock: 0.15, lag: 0, jitter: 0.12, flat: true, hips: 0.015, lean: -7, yaw: 10, gap: -0.04, guard: { y: -0.06, apart: 0.04, elbow: 0.25, chin: -6 }, look: 0.25, head: null, travel: { cycle: 1.35, lean: 6, lurch: 0.05, order: 0.5, width: 0.45, face: 0.3, pivot: 6 }, flourish: 'nervous' }),
    evade: evade({ knee: { share: 0.2, depth: 0.8 }, flinch: 0.07, wince: 1, out: 1.45, hold: 2, back: 1.6, move: 1.25, delay: { trunk: 0.05, hips: 0.05, feet: 0.05 }, pause: 0.12, cut: 'end', load: 0, look: 0.25, lively: 0, exit: 'stumble' }),
    cover: cover({ arrive: 0.11, hands: { ly: 0.075, lz: 0.01, lx: 0.02, rx: -0.02, le: 0.4, re: 0.4 }, body: { lean: -6, hw: 20, yaw: 15 }, lively: 0, head: 0, look: 0.25, meet: { add: { lz: 0.13, rz: 0.1, lx: 0.06, rx: -0.06, le: 0.5, re: 0.35, lean: -8, hw: 15 } }, block: { brace: 1.5, open: 0.06, settle: 0.4 }, back: 0.45, load: 0 }),
    dash: dash({ upright: true, land: 'stumble', extra: 0.35 }),
    // (a bow, the foot up high, short of where he meant to be, and up again at once; he walks back flat and upright, the
    // hands sliding down, the feet coming together)
    entry: entry({ waist: 0.75, look: 20, step: 0.08, stop: 0.12, rise: 0.2, load: 0 }),
    away: away({ hop: 0, drop: 0.45, slide: true, pivot: 0, upright: 6, together: 0.5 })
  },
  2: {
    grade: 2, side: null, name: '아마추어', label: '2',
    chain: { lag: [0.01, 0, 0, 0, 0], damp: 0.66, amp: [0.8, 0.8, 0.8, 1, 1], coil: 1.3, least: 0.035, back: 0.8, backLag: 1.5, firm: 0.86, spring: { down: 1.22, pause: 0.05 } },
    form: form({ guard: 0.4, chin: 0.35, over: 0.35, tell: 0.4, lively: 0.15, dip: -0.005, late: 0.05, sep: 0, off: 0, look: 0.6, exit: 'flat' }),
    // a small, even bounce, all of a piece: the head and the gloves go up and down with the hips
    stance: stance({ bounce: 0.45, knee: 4, hop: 0.4, rock: 0.4, lag: 0.3, hips: 0.01, lean: -3, yaw: 4, guard: { y: 0.01, elbow: 0.1 }, look: 0.6, head: null, travel: { cycle: 1.15, halting: 0.7, width: 0.75, face: 0.08, pivot: 9 } }),
    evade: evade({ knee: { share: 0.55, depth: 0.85 }, flinch: 0.03, out: 1.3, hold: 1.2, back: 0.9, move: 1.15, delay: { head: 0.06, hips: 0.05, feet: 0.05 }, pause: 0.04, cut: 'end', load: 0, look: 0.6, lively: 0, exit: 'flat' }),
    cover: cover({ arrive: 0.07, hands: { ly: 0.025, lx: -0.012, rx: 0.012, le: 0.15, re: 0.15 }, body: { lean: -3 }, lively: 0.45, head: 0, look: 0.6, meet: { add: { ry: -0.08, rz: 0.04, re: 0.2 } }, block: { brace: 1.2, settle: 0.6 }, back: 0.65, load: 0 }),
    dash: dash({ prep: 0.02, land: 'flat', extra: 0.32 }),
    // (down, and then in: two movements; small hops with the hands stuck at his face, and half a pivot)
    entry: entry({ waist: 0.3, seam: 0.05, step: 0.04, load: 0 }),
    away: away({ hop: 0.5, drop: 0, pivot: 45 })
  },
  3: {
    grade: 3, side: null, name: '프로', label: '3',
    chain: {},
    form: form({}),
    // the textbook's bounce, and the head starting to move: off the line and back, in its own time
    stance: stance({}),
    evade: TEXTBOOK_EVADE,
    cover: TEXTBOOK_COVER,
    dash: TEXTBOOK_DASH,
    entry: TEXTBOOK_ENTRY,
    away: TEXTBOOK_AWAY
  },
  '4m': {
    grade: 4, side: 'm', name: '일류 · 명', label: '4명',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: [0.6, 0.6, 0.56, 0.6, 0.6], amp: [1.1, 1.15, 1.1, 1, 1], coil: 0.55, shown: 0.65, back: 1.12, backLag: 1, firm: 1.08, spring: { down: 0.6, wait: true } },
    form: form({ guard: -0.3, chin: -0.5, lively: 0.5, dip: -0.03, drop: true, sep: 7, off: 0.07, with: 'hips', tuck: 4, look: 1, bend: 4, exit: 'roll', beat: 'on' }),
    // strong and weak, the lead foot's landing the heavy one; the head an end on every lead foot, under in between
    stance: stance({ bounce: 1.15, knee: 6.2, lag: 1.1, accent: [1.3, 0.8], guard: { chin: 4 }, look: 1, head: { A: 0.045, D: 0.025, T: 4, beat: 'locked', level: { every: 8, depth: 0.07, lean: 5 } } }),
    evade: evade({ knee: { share: 1.1, depth: 1.05 }, out: 0.7, hold: 0.8, back: 0.6, move: 0.93, delay: { feet: 0.017, trunk: 0.017, head: 0.033 }, cut: 'clear', load: 0.7, look: 1, lively: 0.5, beat: 'on', cross: 5, just: 0.006 }),
    cover: cover({ arrive: 0.04, hands: { lx: -0.012, rx: 0.012, le: -0.08, re: -0.08 }, body: { hp: 3 }, look: 1, meet: { scale: 0.7, add: { hx: 0.03, twist: -5 } }, block: { brace: 0.8, go: [6, 0.04] }, back: 1.5, load: 0.7, hand: 'other' }),
    dash: dash({}),
    // (in at an angle, the eyes on him; the hops on the beat, strong and weak, the hands down to the waist)
    entry: entry({ angle: 15, load: 1 }),
    away: away({ accent: true, drop: 1.3 })
  },
  '4a': {
    grade: 4, side: 'a', name: '일류 · 암', label: '4암',
    chain: { early: [0.25, 0.25, 0, 0, 0], damp: [0.6, 0.6, 0.56, 0.6, 0.6], amp: [1.1, 1.15, 1.1, 1, 1], coil: 0.55, shown: 0.65, back: 1.05, backLag: 1, firm: 1.08, hold: 0.1, spring: { down: 0.6, wait: true } },
    form: form({ guard: -0.2, chin: -0.4, over: 0.15, dirty: 1, lively: 0.5, dip: -0.03, drop: true, sep: 7, off: 0.07, with: 'hips', tuck: 4, look: 1, bend: 4, exit: 'roll' }),
    // the beat rubbed out: low and heavy, the feet dragged and lurching, the head rolling low in its own time
    stance: stance({ bounce: 0.45, knee: 2.4, hop: 0.6, rock: 0.8, jitter: 0.25, drag: 0.6, hips: -0.03, travel: { width: 0.95, face: 0.1, pivot: 8 }, look: 1, head: { A: 0.055, D: 0.04, T: 4, beat: 'roll', level: { every: 2.6, depth: 0.08, lean: 5 } }, show: SHOW_4A }),
    evade: evade({ knee: { share: 1.1, depth: 1.05 }, out: 0.75, hold: 0.8, back: 0.8, move: 0.95, delay: { feet: 0.017, trunk: 0.017, head: 0.033 }, cut: 'clear', load: 0.7, look: 1, lively: 0.3, in: 0.04, low: 0.02, just: 0.008 }),
    cover: cover({ arrive: 0.045, cross: CROSS_4A, hammer: HAMMER_4A, look: 1, meet: { scale: 0.7, add: { hx: 0.03, twist: -5 } }, block: { brace: 0.6, settle: 1.2 }, back: 1.5, load: 0.7, hand: 'other' }),
    dash: dash({ drag: 1, low: 0.02, extra: 0.16 }),
    entry: entry({ angle: 15, load: 1 }),
    away: away({ jitter: 0.25, drop: 1.2 })
  },
  '5m': {
    grade: 5, side: 'm', name: '전설 · 명', label: '5명',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: [0.6, 0.6, 0.5, 0.6, 0.6], amp: [1.15, 1.25, 1.18, 1, 1], coil: 0.2, shown: 0.55, back: 1.15, backLag: 1, firm: 1.2, spring: { down: 0.4 } },
    form: form({ guard: -0.4, chin: -0.6, lively: 0.7, dip: -0.04, drop: true, sep: 11, off: 0.1, with: 'legs', tuck: 6, look: 1, bend: 6, exit: 'angle', beat: 'off' }),
    // the lightest feet: a swung beat, a phrase that quickens, stops dead and breaks out into something
    // (and going anywhere, the head and the knees are the shape of it, on his beat: a slower travelling beat, room for a U)
    stance: stance({ bounce: 1.1, knee: 7.7, hop: 1.3, rock: 1.1, lag: 1.25, swing: 0.58, tempo: 'phrase', guard: { y: -0.02, loose: 1 }, look: 1, head: { A: 0.045, D: 0.025, T: 4, beat: 'phrase', level: { depth: 0.07, lean: 5 } }, flourish: 'clean', travel: { cycle: 1.9 }, legend: LEGEND_CLEAN }),
    evade: evade({ knee: { share: 1.15, depth: 1.1 }, out: 0.55, hold: 0, back: 0.6, move: 0.9, delay: { trunk: 0.017, head: 0.033 }, cut: 'clear', load: 1, look: 1, lively: 0.7, follow: 0.3, exit: 'angle', just: -0.008 }),
    cover: cover({ arrive: 0.03, hands: { ly: -0.02, lx: 0.015, rx: -0.015 }, look: 1, meet: { scale: 0.45, add: { hx: 0.04, twist: -8 } }, block: { brace: 0.7, settle: 1.5, meet: [0.04, 12] }, back: 1.8, load: 1, hand: 'same', q: 0.3 }),
    dash: dash({ land: 'angle', turn: 9, bend: 0.04 }),
    // (round on the ball of the lead foot at the end, at his side, wound up; a shuffle in the middle hop, the pivot one with
    // the hop)
    entry: entry({ pivot: [30, 0.12], load: 1 }),
    away: away({ shuffle: true, drop: 1.2 })
  },
  '5a': {
    grade: 5, side: 'a', name: '전설 · 암', label: '5암',
    chain: { early: [0.4, 0.4, 0, 0, 0], damp: [0.6, 0.6, 0.5, 0.6, 0.6], amp: [1.15, 1.25, 1.18, 1, 1], coil: 0.25, shown: 0.55, back: 1.12, backLag: 1, firm: 1.2, hold: 0.08, spring: { down: 0.4 } },
    form: form({ guard: -0.3, chin: -0.5, over: 0.1, dirty: 2, lively: 0.7, dip: -0.04, drop: true, sep: 11, off: 0.1, with: 'legs', tuck: 6, look: 1, bend: 6, exit: 'angle' }),
    // lower still and always rolling, the lead shoulder up and the lead hand in his eyes, the beat nowhere
    stance: stance({ bounce: 0.35, knee: 1.9, hop: 0.5, rock: 0.8, lag: 1.1, jitter: 0.25, drag: 0.7, hips: -0.04, show: SHOW_5A, travel: { width: 0.95, face: 0.1, pivot: 8, cycle: 1.9 }, look: 1, head: { A: 0.06, D: 0.05, T: 4, beat: 'roll', level: { every: 1.9, depth: 0.08, lean: 5 } }, flourish: 'dirty', legend: LEGEND_DIRTY }),
    evade: evade({ knee: { share: 1.15, depth: 1.1 }, out: 0.62, hold: 0, back: 0.73, move: 0.92, delay: { trunk: 0.017, head: 0.033 }, cut: 'clear', load: 1, look: 1, lively: 0.3, follow: 0.3, in: 0.06, low: 0.02, just: 0.015 }),
    cover: cover({ arrive: 0.035, cross: CROSS_5A, hammer: HAMMER_5A, look: 1, meet: { scale: 0.45, add: { hx: 0.04, twist: -8 } }, block: { brace: 0.6, lean: 4, settle: 1.2, push: 0.04 }, back: 1.8, load: 1, hand: 'other' }),
    dash: dash({ drag: 1, low: 0.02 }),
    entry: entry({ pivot: [30, 0.12], load: 1 }),
    away: away({ jitter: 0.25, drop: 1.2 })
  }
};
for (const [id, level] of Object.entries(LEVEL)) level.id = id;

// the grade a boxer throws a move at: his sheet of skills names one for the move, or for everything, or he is a pro (a sheet
// may hold a grade itself, as well as a grade's name: a measurement made on a grade with something held still, say)
export const levelOf = (skills, move) => {
  const named = skills && (skills[move] || skills.all);
  return (typeof named === 'object' ? named : LEVEL[named || '3']) || LEVEL[3];
};
