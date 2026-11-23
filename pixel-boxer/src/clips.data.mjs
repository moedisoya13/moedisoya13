/* The recorded clips of the pending catalogue: which script of which checkout each is, over which seconds of its run, and
   what it is measured to show. tools/clips.mjs records them (src/clips/), src/pending.mjs plays them, and the items of
   src/pending.data.mjs name them in their rows. Nothing here knows the page or the renderer.
     ROOTS   the checkouts the clips come from, by key: what the page calls each (say), and where it was when the clips were
             recorded (where: for the person recording them again; the command takes the folder as --root key=dir)
     CLIPS   { id, root (a key of ROOTS), script (a catalogue script id of that checkout), change (tools/clips.mjs scriptOf: him,
             against, also, press, loop), window: [from, to] seconds of the run, measure (tools/clips.mjs MEASURES), of
             (what the measure is told: move, the punch whose waist is timed) }
   Record them all again, when the stages change:
     node tools/clips.mjs --write --root prem=<before M> --root n1=<N> --root u1=<U> --root u2=<U fixed> --root v1=<V> --root vchin=<V, chin 32>
   (`now` is this checkout.) */
export const ROOTS = {
  now: { say: '지금 (게시된 동작)', where: 'this checkout' },
  prem: { say: 'M 전 (합치기 전의 동작)', where: 'before stage M was merged: git archive 8b17869 src tools' },
  n1: { say: 'N 1차 구현 (합치기 전, 고치는 중)', where: 'stage N, first round: scratchpad/wt-n/pixel-boxer (4c726b9 + its changes)' },
  u1: { say: 'U 1차 구현 (합치기 전, 고치는 중)', where: 'stage U, first round: scratchpad/wt-u/pixel-boxer (4c726b9 + its changes)' },
  u2: { say: 'U 고침 (점검 중)', where: "stage U's fix round: scratchpad/r-u/pixel-boxer (7fa3003, M, + its changes)" },
  v1: { say: 'V 1차 구현 (합치기 전, 고치는 중)', where: 'stage V, first round: scratchpad/wt-v/pixel-boxer (4c726b9 + its changes)' },
  vchin: { say: 'V 1차 + 기획의 턱 32° (점검 쪽의 시험판)', where: "the checker's variant: scratchpad/st-v/check/x-chin32 (V's first round, TWIST.down 22 -> 32)" }
};

// (each pair is the same script, the same window, of two checkouts: what differs between them is the motion)
const pair = (id, roots, rest) => roots.map(root => Object.assign({ id: `${id}-${root}`, root }, rest));
// the rear hook aimed low at his left side, a legend rolling as late as it is pressed (tests/show.test.mjs, stage N)
const WEAK = { scene: 'aimed', level: '5a', punch: 'hookR', aim: [1.2, -60], roll: 0 };
export const CLIPS = [
  // low2-block: the grade-2 two-arm block's guard coming down after the elbow has met the body hook (close, slow), and the
  // drill with an uppercut pressed at 1.133 s (stage M's timing sweep: 0.8 s + 20 frames)
  ...pair('low2', ['prem', 'now'], { script: 'block-elbow@2', window: [0.8, 1.2], measure: 'block' }),
  ...pair('low2up', ['prem', 'now'], { script: 'block-elbow@2', change: { also: [[0.8 + 20 / 60, 'power']] }, window: [0.45, 1.6], measure: 'block' }),
  // beckon-room: the beckon of 4암 at 1.0 m between centres (the distance of a real bout), and at the card's 1.2 m
  ...pair('beckon10', ['now', 'u1', 'u2'], { script: 'beckon@4a', change: { him: 1.0 }, window: [0.4, 2.2], measure: 'reach' }),
  ...pair('beckon12', ['now', 'u2'], { script: 'beckon@4a', change: { him: 1.2 }, window: [0.4, 2.2], measure: 'reach' }),
  // hookr-bound: the rear hook of grade 3 and the counter out of 4명's shoulder roll, with the waist and before it
  ...pair('hookr', ['now', 'n1'], { script: 'hookR@3', window: [0.45, 1.3], measure: 'turning', of: { move: 'hookR' } }),
  ...pair('rollc', ['now', 'n1'], { script: 'rollCounter@4m', window: [0.75, 1.55], measure: 'thrown' }),
  // twist-chin: the twisted knockout, its first moments (the neck locked turned and tucked) and the whole fall
  ...pair('twistc', ['now', 'vchin'], { script: 'out-twist', window: [1.1, 1.45], measure: 'fall' }),
  ...pair('twist', ['now', 'vchin'], { script: 'out-twist', window: [1.0, 2.4], measure: 'fall' }),
  // shrug-view: 4암's shrug as stage U made it (played from two cameras)
  { id: 'shrug-u1', root: 'u1', script: 'shrug@4a', window: [1.15, 2.2], measure: 'spread' },
  // jump-watch: three frames of the engine as it is that stage M's watched check counts (each played at full speed and slow)
  { id: 'jump-guard', root: 'now', script: 'guard@5a', window: [2.05, 2.4], measure: 'jump' },
  { id: 'jump-onetwo', root: 'now', script: 'onetwo@5a', window: [0.9, 1.3], measure: 'jump', of: { who: 1 } },
  { id: 'jump-cross', root: 'now', script: 'crossArm@5m', window: [1.05, 1.45], measure: 'jump' },
  // crossarm-weak: the rear hook at a legend's cross-arm guard, rolled as it is pressed
  ...pair('weak', ['now', 'n1'], { script: WEAK, window: [0.6, 1.3], measure: 'taken' }),
  // order-memo-first: what three of the first rounds look like so far (V's legs in the fall forward, U's collar tie, N's hook
  // in close)
  ...pair('front', ['now', 'v1'], { script: 'down-front', window: [0.6, 2.8], measure: 'legs', of: { at: 2.6 } }),
  ...pair('collar', ['now', 'u1'], { script: 'collar@4a', window: [0.2, 1.1], measure: 'pull' }),
  ...pair('hookin', ['now', 'n1'], { script: 'hookIn@3', window: [0.7, 1.4], measure: 'turning', of: { move: 'hookIn' } })
];
