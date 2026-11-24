/* The recorded clips of the pending catalogue: which script of which checkout each is, over which seconds of its run, and
   what it is measured to show. tools/clips.mjs records them (src/clips/), src/pending.mjs plays them, and the items of
   src/pending.data.mjs name them in their rows. Nothing here knows the page or the renderer.
     ROOTS   the checkouts the clips come from, by key: what the page calls each (say), and where it was when the clips were
             recorded (where: for the person recording them again; the command takes the folder as --root key=dir). Or a
             root made from another by edits: from (the key of a root that is a folder: `now`, this checkout, or a frozen
             one), edits ([{ file (a module of its src), find (text that is in that file exactly once), replace }]): the
             recorder copies the source root's src to a temporary folder, makes the edits there, records, and takes the
             folder away; this checkout's own files never change. Such a root is recorded whenever its source is given.
     CLIPS   { id, root (a key of ROOTS), script (a catalogue script id of that checkout, or a scene built by the recorder:
             tools/clips.mjs SCENES), change (tools/clips.mjs scriptOf: him, against, also, press, loop), window: [from, to]
             seconds of the run, measure (tools/clips.mjs MEASURES), of (what the measure is told: move, the punch whose
             waist is timed) }
   Record them all again, when the stages change (every root made by edits with it):
     node tools/clips.mjs --write --root prem=<before M> --root pren=<before N> --root u1=<U, first round> --root u2=<U, last round> --root v1=<V, last round>
   (`now` is this checkout.) */
export const ROOTS = {
  now: { say: '지금 (게시된 동작)', where: 'this checkout' },
  prem: { say: 'M 전 (합치기 전의 동작)', where: 'before stage M was merged: git archive 8b17869 src tools' },
  pren: { say: 'N 전 (합치기 전의 동작)', where: 'before stage N was merged: git archive cd8dbe4 src tools' },
  u1: { say: 'U 1차 (첫 구현)', where: 'stage U, first round: scratchpad/wt-u/pixel-boxer (4c726b9 + its changes)' },
  u2: { say: 'U 5차 (합치기 전, 따로의 점검 중)', where: 'stage U, round 5 on the head: scratchpad/pcwork/u5.tmp/pixel-boxer (0ac7c0c + the staged and unstaged change of scratchpad/u3)' },
  v1: { say: 'V 5차 (합치기 전, 따로의 점검 중)', where: 'stage V, round 5 on the head: scratchpad/pcwork/v5.tmp/pixel-boxer (0ac7c0c + the staged and unstaged change of scratchpad/v3)' },
  /* (the options of the decisions, each the checkout with the one change the option is: src/pending.data.mjs, the items'
     own groups) */
  // inside-rule: the rule that keeps a pressed inside chain on it, at every grade, and off (game/bout.mjs RULES.insideTo)
  insideAll: { say: '지금 + 규칙을 모든 등급에 (RULES.insideTo 3 → 5)', from: 'now', edits: [{ file: 'src/game/bout.mjs', find: 'insideTo: 3', replace: 'insideTo: 5' }] },
  insideNone: { say: '지금 + 규칙을 끔 (RULES.insideTo 3 → 0)', from: 'now', edits: [{ file: 'src/game/bout.mjs', find: 'insideTo: 3', replace: 'insideTo: 0' }] },
  // waist-bound: the inside hook's waist sent faster, to the plan's 450 deg/s at a pro's (anim/moves.mjs hookIn chain.waist)
  waistFast: { say: '지금 + 숏 훅의 허리 근육 84 → 98 rad/s', from: 'now', edits: [{ file: 'src/anim/moves.mjs', find: "waist: { rate: 84, from: 'drive' }", replace: "waist: { rate: 98, from: 'drive' }" }] },
  // twist-chin: the twisted log's chin pulled to 28 degrees and shoved over 1.2 times, and to 32 (V's phys/fall.mjs TWIST)
  chin28: { say: 'V 5차 + 턱 28°, 밀기 1.2배 (TWIST.down 24 → 28, follow 1.03 → 1.2)', from: 'v1', edits: [{ file: 'src/phys/fall.mjs', find: 'down: [(24 * 85) / 90.1, 15, 40]', replace: 'down: [28, 15, 40]' }, { file: 'src/phys/fall.mjs', find: 'follow: 1.03,', replace: 'follow: 1.2,' }] },
  chin32: { say: 'V 5차 + 턱 32° (TWIST.down 24 → 32, 점검 쪽의 시험판과 같은 값)', from: 'v1', edits: [{ file: 'src/phys/fall.mjs', find: 'down: [(24 * 85) / 90.1, 15, 40]', replace: 'down: [32, 15, 40]' }] },
  /* combo-tempo: the combination's card pressed by the clock as the head presses now (src/combos.mjs: 'clock'), its first beat
     pressed on his beat as the card's is ('tempo'), so that the two start together and only the clock between beats differs */
  clockFirst: { say: '지금 + 둘째 주먹부터 시계로 누름 (첫 주먹은 카드처럼 그의 박자에)', from: 'now', edits: [{ file: 'src/combos.mjs', find: "first = how === 'tempo' ? cue(", replace: "first = how !== 'fast' ? cue(" }] },
  // rocked-slow: a rocked man's arms slowed only once he is rocked 0.1 and more (V's anim/animator.mjs WOBBLE.slowed)
  slowed01: { say: 'V 5차 + 느린 팔이 켜지는 정도 0.02 → 0.1 (WOBBLE.slowed)', from: 'v1', edits: [{ file: 'src/anim/animator.mjs', find: 'slowed: 0.02,', replace: 'slowed: 0.1,' }] }
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
  ...pair('hookr', ['pren', 'now'], { script: 'hookR@3', window: [0.45, 1.3], measure: 'turning', of: { move: 'hookR' } }),
  ...pair('rollc', ['pren', 'now'], { script: 'rollCounter@4m', window: [0.75, 1.55], measure: 'thrown' }),
  // shrug-view: 4암's shrug as stage U made it (played from two cameras)
  { id: 'shrug-u2', root: 'u2', script: 'shrug@4a', window: [1.15, 2.2], measure: 'spread' },
  // jump-watch: three frames of the engine as it is that stage M's watched check counts (each played at full speed and slow)
  { id: 'jump-guard', root: 'now', script: 'guard@5a', window: [2.05, 2.4], measure: 'jump' },
  { id: 'jump-onetwo', root: 'now', script: 'onetwo@5a', window: [0.9, 1.3], measure: 'jump', of: { who: 1 } },
  { id: 'jump-cross', root: 'now', script: 'crossArm@5m', window: [1.05, 1.45], measure: 'jump' },
  // crossarm-weak: the rear hook at a legend's cross-arm guard, rolled as it is pressed
  ...pair('weak', ['pren', 'now'], { script: WEAK, window: [0.6, 1.3], measure: 'taken' }),
  // order-memo-first: what three of the stages look like so far (V's legs in the fall forward, U's collar tie, N's hook
  // in close)
  ...pair('front', ['now', 'v1'], { script: 'down-front', window: [0.6, 2.8], measure: 'legs', of: { at: 2.6 } }),
  ...pair('collar', ['now', 'u2'], { script: 'collar@4a', window: [0.2, 1.1], measure: 'pull' }),
  ...pair('hookin', ['pren', 'now'], { script: 'hookIn@3', window: [0.7, 1.4], measure: 'turning', of: { move: 'hookIn' } }),

  /* ---- the options of the decisions still open, each recorded from code that does what the option says (the items' groups:
     src/pending.data.mjs OPTIONS) */
  // inside-rule: the power button pressed three times 0.3 s apart from 0.64 m, at a pro's and at a great clean one's
  ...['3', '5m'].flatMap(lv => [['low', 'now'], ['all', 'insideAll'], ['none', 'insideNone']].map(([o, root]) => ({ id: `in${lv}-${o}`, root, script: { scene: 'chain', level: lv, gap: 0.64 }, window: [0.55, 1.65], measure: 'chain' }))),
  // waist-bound: the inside hook of a pro (and a legend's flicker), as built, before stage N (no waist: the plan's bound), and
  // with the waist sent to 450 deg/s
  ...[['own', 'now'], ['plan', 'pren'], ['speed', 'waistFast']].map(([o, root]) => ({ id: `wb3-${o}`, root, script: 'hookIn@3', window: [0.7, 1.4], measure: 'waist', of: { move: 'hookIn' } })),
  ...[['own', 'now'], ['plan', 'pren']].map(([o, root]) => ({ id: `wbf-${o}`, root, script: 'flicker@5a', window: [0.45, 1.4], measure: 'waist', of: { move: 'flicker' } })),
  // twist-chin: V's twisted knockout as it is, with the chin at 28 and the shove 1.2 times, and with the chin at 32: its first
  // moments (the neck locked turned and tucked), and the whole fall
  ...[['keep', 'v1'], ['chin28', 'chin28'], ['chin32', 'chin32']].flatMap(([o, root]) => [
    { id: `twc-${o}`, root, script: 'out-twist', window: [1.1, 1.45], measure: 'fall' },
    { id: `tw-${o}`, root, script: 'out-twist', window: [1.0, 2.4], measure: 'fall' }
  ]),
  // downside-front: the hook knockdown, the fall and the getting up, and the straight's, the fall and lying: now (as before V's
  // ligament) and V's
  ...[['revert', 'now'], ['accept', 'v1']].flatMap(([o, root]) => [
    { id: `ds-${o}`, root, script: 'down-side', window: [0.95, 5.15], measure: 'lying', of: { at: 2.8 } },
    { id: `db-${o}`, root, script: 'down-back', window: [0.5, 3.0], measure: 'lying', of: { at: 2.4 } }
  ]),
  // rocked-slow: the rocked card with a third press of his 0.4 s after the hook (the checker's scene): before V, V's, and V's
  // slowed only from 0.1
  ...[['before', 'now'], ['keep', 'v1'], ['shorter', 'slowed01']].map(([o, root]) => ({ id: `rk-${o}`, root, script: 'stagger', change: { also: [[1.55, 'power']], loop: 4 }, window: [0.7, 2.0], measure: 'guard' })),
  // combo-tempo: the one-two and hook of a pro and of a great clean one, pressed on contact (the card's tempo, the plan's) and
  // by the clock (as the head presses now), the first beat on the same frame; each from four frames before it
  ...[['3', [0.9, 1.9]], ['5m', [0.5833, 1.5833]]].flatMap(([lv, window]) => [
    { id: `ct${lv}-faster`, root: 'now', script: { scene: 'combo', row: '1-2-3', level: lv, press: 'tempo' }, window, measure: 'tempo' },
    { id: `ct${lv}-keep`, root: 'clockFirst', script: { scene: 'combo', row: '1-2-3', level: lv, press: 'clock' }, window, measure: 'tempo' }
  ]),
  // fx-parry-white: a pro's parry (played twice, the screen's white flash drawn on one: src/pending.mjs)
  { id: 'pw-parry', root: 'now', script: 'parry@3', window: [0.6, 1.4], measure: 'taken' }
];
