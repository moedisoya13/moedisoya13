// Animation clip choice (assets/anim/README.md): pure, DOM-free, never read by rules. The client
// component (src/client/34_anim.js) asks it which clip and frame to draw; tests call it directly.
//
// meta = the build's manifest {char: {clip: {frames, fw, fh, fps, loop, anchor, charH, strike?}}}
// (BD.animMeta in the browser). char = 'hero' or an enemy kind.
//
// Actions: idle | move | attack | hurt | die | dash (hero). Hero clips carry a direction
// (_side, _down, _up). resolve(meta, char, action, dir, moving) → {name, shows, hold, pose, code}:
//   name   the clip to play (null: the static sprite)
//   shows  what the clip shows ('attack' … or the stand-in locomotion 'idle' | 'move')
//   hold   play frame 0 only (idle standing in on a move clip: no idle frames yet)
//   pose   hero only: a dedicated static pose to draw instead ('hero_dash', 'hero_hurt')
//   code   procedural motion the client adds: 'breathe' | 'bounce' | 'lunge' | 'shake' | 'dissolve' | null
// Fallback chain (the README's, step by step):
//   1. the exact clip              (attack_up)
//   2. the same action's side clip  (attack_side)
//   3. hero dash / hurt / die: v1's dedicated static pose (hero_dash, hero_hurt) with code motion
//      — the README would substitute the run cycle here; the shoulder-charge picture reads better
//   4. the locomotion clip for how the body is moving (move when moving, else idle), plus the
//      action's code motion (lunge on attack, shake on hurt, ink dissolve on death). With no idle
//      clip a standing body uses step 5 (the static sprite breathing): move's frame 0 held is a
//      mid-stride pose and reads worse (A.IDLE_HOLDS_MOVE = true switches to it)
//   5. no clip at all: the static sprite with code motion (breathing, walking bounce, lunge, shake,
//      dissolve)

const A = BD.anim = { IDLE_HOLDS_MOVE: false };
A.HERO_CLIPS = ['idle_side', 'idle_down', 'idle_up', 'move_side', 'move_down', 'move_up', 'attack_side', 'attack_down', 'attack_up', 'dash_side', 'hurt'];
A.ENEMY_CLIPS = ['idle', 'move', 'attack', 'hurt', 'die'];
A.clipNames = (char) => (char === 'hero' ? A.HERO_CLIPS : A.ENEMY_CLIPS);
const CODE = { idle: 'breathe', move: 'bounce', attack: 'lunge', hurt: 'shake', die: 'dissolve', dash: null };

A.has = (meta, char, name) => !!(meta && meta[char] && meta[char][name]);

A.resolve = function (meta, char, action, dir, moving) {
  const hero = char === 'hero', has = (n) => A.has(meta, char, n);
  const named = (act, d) => (hero ? (act === 'hurt' ? 'hurt' : act === 'dash' ? 'dash_' + d : act + '_' + d) : act);
  const act = hero && action === 'die' ? 'hurt' : action; // the hero has no die clip: he falls hurt
  // 1, 2
  for (const d of hero ? [dir || 'side', 'side'] : [null]) {
    const n = named(act, d);
    if (has(n)) return { name: n, shows: act, hold: false, pose: null, code: null };
  }
  // 3
  if (hero && (act === 'dash' || act === 'hurt')) return { name: null, shows: act, hold: false, pose: act === 'dash' ? 'hero_dash' : 'hero_hurt', code: act === 'hurt' ? 'shake' : null };
  // 4
  const loco = act === 'move' || (act !== 'idle' && moving) ? 'move' : 'idle';
  const tryLoco = (l) => {
    for (const d of hero ? [dir || 'side', 'side'] : [null]) if (has(named(l, d))) return named(l, d);
    return null;
  };
  let name = tryLoco(loco), shows = loco, hold = false;
  if (!name && loco === 'idle' && A.IDLE_HOLDS_MOVE) { name = tryLoco('move'); shows = 'idle'; hold = !!name; }
  if (!name && loco === 'move') { name = tryLoco('idle'); shows = 'idle'; }
  if (name) {
    const code = shows === act && !hold ? null : CODE[act]; // the stand-in gets the action's code motion
    return { name, shows, hold, pose: null, code };
  }
  // 5
  return { name: null, shows: act, hold: false, pose: null, code: CODE[act] };
};

// Frame of a clip. ph: {t (s since the clip started), p (wind-up 0..1), q (follow-through 0..1)}
//   attack (strike given or not): p → frames 0..strike, q → strike..last
//   hold → 0; loop → t·fps mod frames; once → t·fps clamped to the last frame
A.strikeOf = (clip) => (clip.strike !== undefined ? clip.strike : Math.round(clip.frames * 0.4));
A.frame = function (clip, ph) {
  const n = clip.frames;
  if (ph.hold) return 0;
  if (ph.p !== undefined || ph.q !== undefined) {
    const s = A.strikeOf(clip);
    if (ph.q !== undefined) return Math.min(n - 1, s + Math.floor(Math.max(0, Math.min(1, ph.q)) * (n - s)));
    return Math.min(s, Math.floor(Math.max(0, Math.min(1, ph.p)) * (s + 1)));
  }
  const f = Math.floor(Math.max(0, ph.t) * clip.fps + 1e-9);
  return clip.loop ? f % n : Math.min(n - 1, f);
};
A.duration = (clip) => clip.frames / clip.fps;

// Hero attack timing from the simulation: a swing every stats.interval s (atkTimer counts down to
// it). The wind-up (frames 0..strike) plays over the last `wind` s before the swing, the
// follow-through over `follow` s after it, both compressed to fit the interval.
A.heroAttackTiming = function (clip, interval) {
  const natW = (A.strikeOf(clip) + 1) / clip.fps, natF = (clip.frames - A.strikeOf(clip)) / clip.fps;
  const wind = Math.min(natW, interval * 0.4), follow = Math.min(natF, interval - wind);
  return { wind, follow };
};
// enemy follow-through after its telegraph fires: the clip's own speed, at most 0.8 s
A.enemyFollow = (clip) => Math.min(0.8, (clip.frames - A.strikeOf(clip)) / clip.fps);

// Screen direction class of a world facing angle: 'side' | 'down' | 'up', and whether to mirror
// (every picture faces right). Same thresholds as the static hero poses.
A.dirOf = function (face) {
  const dx = Math.cos(face), dy = Math.sin(face);
  const sx = (dx - dy) * BD.C.ISO_X, sy = (dx + dy) * BD.C.ISO_Y;
  const ang = Math.atan2(sy, sx) / BD.math.DEG;
  return { dir: ang > 50 && ang < 130 ? 'down' : ang < -50 && ang > -130 ? 'up' : 'side', flip: sx < 0 };
};

// Hero action from his state. Returns {action, phase} where phase is for A.frame.
//   dead → die · hurt pose → hurt · dashing → dash · just swung → attack (q) · swing due → attack (p)
//   · moving → move · idle
A.heroAction = function (h, meta, dir, moving) {
  if (moving === undefined) moving = h.moving;
  if (h.dead) return { action: 'die' };
  if (h.pose === 'hurt') return { action: 'hurt' };
  if (h.dashT > 0) return { action: 'dash' };
  const r = A.resolve(meta, 'hero', 'attack', dir, moving);
  const clip = r.name && r.shows === 'attack' ? meta.hero[r.name] : null;
  const interval = (h.stats && h.stats.interval) || BD.C.HERO.interval;
  const T = clip ? A.heroAttackTiming(clip, interval) : { wind: Math.min(0.2, interval * 0.35), follow: Math.min(0.25, interval * 0.45) };
  const since = interval - h.atkTimer; // s since the last swing
  if (h.swingT > 0 || (h.atkTimer > 0 && since < T.follow)) return { action: 'attack', phase: { q: since / T.follow }, timing: T };
  if (h.targetId && h.atkTimer < T.wind) return { action: 'attack', phase: { p: 1 - h.atkTimer / T.wind }, timing: T };
  return { action: moving ? 'move' : 'idle' };
};

// Enemy action. tg: its soonest telegraph or null; fireAge: sim s since its last telegraph fired
// (Infinity if none); moving: the client's measured walking. hurtAge: s since its last hit.
A.enemyAction = function (e, meta, tg, fireAge, moving, hurtAge) {
  if (e.dead) return { action: 'die' };
  if (e.down) return { action: 'die', phase: { t: 1e6 } }; // lies at the last frame until it revives
  const r = A.resolve(meta, e.kind, 'attack', null, moving);
  const clip = r.name && r.shows === 'attack' ? meta[e.kind][r.name] : null;
  if (tg) return { action: 'attack', phase: { p: 1 - tg.remain / tg.total } };
  const F = clip ? A.enemyFollow(clip) : 0.25;
  if (fireAge < F) return { action: 'attack', phase: { q: fireAge / F } };
  if (e.state === 'windup') return { action: 'attack', phase: { p: 0.5 } };
  if (hurtAge < 0.22) return { action: 'hurt', phase: { t: hurtAge } };
  return { action: moving ? 'move' : 'idle' };
};
