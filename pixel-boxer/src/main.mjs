/* The page: a match (game/match.mjs: rounds, the break between them, the referee's count over a man down, a man up too late
   going down again, three judges), both corners boxed by their heads (game/brain.mjs) and nobody at the controls: an auto
   battler (a-screen-ai, the user's answer of 2026-11-28). Who fights whom is the seed's (game/card.mjs: the two men the
   sparring round of the same seed draws, never more than two grades apart, each with his loadout): the same seed is the same
   match, to the step. It loads the baked splats, steps the match sixty times a second (the bout solves the boxers' bodies
   itself: they are part of its physics), and draws it at whatever rate the screen runs, each boxer placed between his last
   two steps. A knockdown (docs/moves-plan-6.md §2.4D) is shown live at the true speed from the ordinary camera, all the way
   down; then, once everything the blow and the landing threw has gone out and he lies all but still, the picture cuts to a
   closer camera, from above or from the side the blow is seen best from, and replays it slowly and briefly, from the press of
   the punch that did it to him falling away, ending before he comes down (src/replay.mjs), the tag "리플레이" in the corner;
   the match is not stepped meanwhile (the count waits), any key or tap skips it, and it cuts back. A man up too late who
   goes down again (match.mjs collapse) is shown as he comes down, with his ripple, the ring through the canvas and the
   sound of it, and is not replayed. The result comes once the last fall and its replay have been shown.
   ?seed= the match (else a new one each time), ?speed= how fast the picture runs (1, or ½ with the speed button),
   ?rounds= and ?round= (seconds) the match's length (the match's own, MATCH, if not given), ?rest= the seconds the page
   holds the break for. ?arena=underground fights it in the underground pit, walled round with bricks and paint drums, its
   crowd reacting (world/pit.mjs); otherwise in the ring, whose ropes give and are leaned on (world/ropes.mjs). */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow, quietOf, ringsOn, FX } from './render/blow.mjs';
import { createGuard, styleOf } from './render/guard.mjs';
import { captureBout, blend, createReplay, distOf, backOf, FALL } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { dress } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { MOVES } from './anim/moves.mjs';
import { RULES } from './game/bout.mjs';
import { stepMatch, nextRound, cornerAdvice, MATCH } from './game/match.mjs';
import { matchOf, gradeShown } from './game/card.mjs';
import { arenaOf, loadArena, createArena } from './world/stage.mjs';
import { createAudio } from './game/audio.mjs';
import { watchLost } from './lost.mjs';
import { muteButton } from './mute.mjs';

const DT = 1 / 60;
const query = new URLSearchParams(location.search);
const SPEED = Number(query.get('speed')) || 1; // (?speed=0.25 for slow motion, ?speed=4 to see a match through quickly)
// (the match's length: ?rounds= rounds of ?round= seconds, the match's own if not asked; ?rest= seconds the break is held for)
const ROUNDS = Math.max(1, Math.round(Number(query.get('rounds')) || MATCH.rounds)),
  ROUND = Number(query.get('round')) > 0 ? Number(query.get('round')) : MATCH.roundTime,
  /* (the break between rounds, as the page holds it: a few seconds of the picture, not a minute; the match itself does not
     count it, its corners' minute is nextRound's) */
  REST = Number(query.get('rest')) >= 0 && query.get('rest') !== null && query.get('rest') !== '' ? Number(query.get('rest')) : 5;
const WEARS = (() => {
  const w = (query.get('wear') || '').split(',').map(x => (x.trim() === 'none' ? '' : x.trim()));
  return [w[0], w.length > 1 ? w[1] : w[0]];
})();
const ARENA = arenaOf(query.get('arena'));
const $ = id => document.getElementById(id);
const canvas = $('view');
const CORNER = ['홍코너', '청코너'];
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// (a new match's seed: anything will do, the match is the seed's)
const freshSeed = () => {
  try {
    return 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 99999);
  } catch {
    return 1 + Math.floor(Math.random() * 99999);
  }
};
// a glove's streak cools from white through its own colours; drawn with each corner's palette, so it matches his gloves
const TRAIL = [38, 18, 18, 17, 16];
/* A knockdown's replay camera is not to look at them through the ropes (src/replay.mjs viewOf, distOf): it has room where,
   as far off as it is drawn, it is inside them, or high enough over them (EYE metres up) that they lie under the picture;
   and if none has, it comes in no further off what it frames than a little inside them (inside). In the pit, its edge
   instead (world/stage.mjs: the arena's edge). */
let ROPES = 2.62;
const EYE = 2.4;
// (how far from `at` the way Z the ropes are, less a little)
function inside(at, Z) {
  let far = Infinity;
  for (const i of [0, 2]) if (Math.abs(Z[i]) > 1e-6) far = Math.min(far, ((Math.sign(Z[i]) * ROPES - at[i]) / Z[i]));
  return far - 0.2;
}
const roomFor = (at, Z, d) => {
  const eye = [0, 1, 2].map(i => at[i] + Z[i] * d);
  return (Math.abs(eye[0]) < ROPES && Math.abs(eye[2]) < ROPES) || eye[1] >= EYE;
};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const splats = async part => unpack(fromBase64(await (await fetch('assets/' + part.file)).text()), part);
  // (the boxer as he is, or in an outfit: '' is as he is)
  const worn = [...new Set(WEARS)],
    partOf = w => (!w ? manifest.boxer : manifest.wear && Object.hasOwn(manifest.wear, w) ? manifest.wear[w] : null);
  for (const w of worn) if (!partOf(w)) throw new Error(`no outfit called ${w}`);
  const [arena, ...boxers] = await Promise.all([loadArena(manifest, ARENA, splats), ...worn.map(w => splats(partOf(w)))]);
  return { manifest, arena, boxers: Object.fromEntries(worn.map((w, i) => [w, { rows: boxers[i], count: partOf(w).count }])) };
}

function start({ manifest, arena: parts, boxers }) {
  // (the graphics context lost: a notice and a reload button over the canvas, not a blank white picture: src/lost.mjs)
  watchLost(canvas, { note: '다시 불러오면 시합을 처음부터 엽니다.' });
  const R = createRenderer(canvas),
    arena = createArena(R, manifest, parts),
    audio = createAudio(),
    // (the mute button every page that sounds has, src/mute.mjs: top right, under blue's health; over the title and the result)
    mute = muteButton(audio, { place: 'position:fixed;right:max(16px, env(safe-area-inset-right, 0px));top:calc(62px + env(safe-area-inset-top, 0px));z-index:6;' }),
    bind = fk(guardPose());
  /* three sets of loose splats: sparks and shadows in the ring's colours, and each boxer's glove streaks in his own; and what
     a blow throws off each of them, apart from the rest, to be kept off his own silhouette (render/blow.mjs) */
  const fx = [createFx(), createFx(), createFx()],
    motes = [createFx(), createFx()];
  /* what a defence draws (a block, a parry, a miss, a brilliant defence), in the style ?defence= asks for (render/guard.mjs
     styleOf: ?defence=lines-sparks,wind-line,line), today's if it asks for none. (Not the brilliant defence's slow motion:
     the picture here plays at the true speed, as tests/fx.test.mjs holds it; the pending catalogue's cards show it.) */
  let guard = createGuard(styleOf(query.get('defence')));
  ROPES = arena.edge;
  const meshes = { fx: fx.map(f => R.mesh(f.rows, 0, true)), motes: motes.map(f => R.mesh(f.rows, 0, true)) };
  for (const w in boxers) meshes[w ? 'boxer-' + w : 'boxer'] = R.mesh(boxers[w].rows, boxers[w].count);
  const palettes = [0, 1].map(i => paletteArray(dress(manifest.palette, i)));
  // (each man as he is dressed: his mesh, and his colours with the suit's in place of the trunks'; a glove's streak is in his own colours either way)
  const men = WEARS.map(w => meshes[w ? 'boxer-' + w : 'boxer']),
    worn = WEARS.map((w, i) => (w ? paletteArray(dress(manifest.palette, i, w)) : palettes[i]));
  const hall = arena.hall,
    ink = new Float32Array(rgb(manifest.palette[0]));
  const bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    mats = new Float32Array(NAMES.length * 12);
  // both boxers as they were at the last step and the one before (src/replay.mjs captureBout): what is drawn lies between them
  let posed = null;

  let seed = Number(query.get('seed')) || freshSeed(),
    match,
    bout,
    started = false, // (the title is up until the first press; after it, the match runs)
    speed = SPEED,
    acc = 0,
    last = 0,
    time = 0,
    stopped = 0,
    white = 0,
    dim = 0,
    restLeft = 0, // seconds of the break the page still holds
    overAt = null, // the bout's time the match's result came at
    shownAt = null, // and the result was shown at
    ripples = [null, null], // the ripple going through each man, if one is (render/blow.mjs)
    falls = [null, null], // a man knocked down, until he comes down on the canvas (render/blow.mjs: fallOf)
    ground = null, // the ring through the canvas from where he came down
    again = null, // what a knockdown's replay throws again, in its own time, apart from what the live bout threw
    replayEnd = -Infinity; // the bout's time when the last replay was over (or skipped)
  const cam = { target: [0, 0.8, 0], yaw: 0, pitch: 0.5, dist: 8 },
    shake = { amp: 0 },
    /* (the frame-time readout, ?fps=1 or #fps: ms is the time between pictures, the middle of the last 30 intervals of
       requestAnimationFrame, which takes in the drawing the GPU does; js is the JavaScript of a picture alone, the queuing of
       it, as the readout measured before, which leaves the GPU's work out) */
    stats = { frames: 0, ms: 0, js: 0, drawn: 0, gaps: [] },
    // (a knockdown's replay, and no other: every step kept, src/replay.mjs; the side the men are seen from, the live camera's)
    replay = createReplay({ brilliant: false, yaw: () => cam.yaw, room: (at, Z, size) => roomFor(at, Z, distOf({ size, closer: FALL.view.closer, push: 0 }, cam.dist, R.target.w / R.target.h, 0)) });
  // (the page's phase: the title, then the match's own: 'fight' | 'count' | 'break' | 'over')
  const phaseOf = () => (started ? match.phase : 'title');

  // a match from the seed, the men in their corners, nothing drawn of the last one left
  function reset() {
    match = matchOf(seed, { rounds: ROUNDS, roundTime: ROUND, arena: ARENA });
    bout = match.bout;
    pose(true);
    dim = white = 0;
    acc = 0;
    restLeft = 0;
    overAt = shownAt = null;
    ripples = [null, null];
    falls = [null, null];
    ground = again = null;
    guard = createGuard(guard.style);
    replayEnd = -Infinity;
    replay.reset();
    audio.reset();
    for (const id of ['replay', 'result', 'rest', 'count']) show(id, false);
    const men = match.card.men;
    [0, 1].forEach(i => ($('name' + i).innerHTML = `<b>${CORNER[i]}</b> · ${gradeShown(men[i].grade)}`));
    $('seed').textContent = `시합 #${seed}`;
    $('titlecard').textContent = `${CORNER[0]} ${gradeShown(men[0].grade)} 대 ${CORNER[1]} ${gradeShown(men[1].grade)} · ${match.rounds}라운드 × ${clock(match.roundTime)} · 시합 #${seed}`;
    hud();
  }
  const show = (id, on) => $(id).classList.toggle('on', on);
  function hud() {
    const ph = phaseOf();
    bout.fighters.forEach((f, i) => {
      $('hp' + i).style.transform = `scaleX(${Math.max(0, f.hp) / RULES.hp})`;
      $('hpn' + i).textContent = String(Math.max(0, Math.ceil(f.hp)));
    });
    // (the round's time left, standing still in the moment of a blow and through a count, as the match's clock does)
    $('time').textContent = clock(Math.max(0, Math.ceil(match.roundTime - match.clock - 1e-6)));
    const r = match.result;
    $('stage').textContent = ph === 'break' ? `${match.round}라운드 끝 · 휴식` : ph === 'over' && r ? `${r.round}라운드 · 끝` : `${match.round}/${match.rounds}라운드`;
    // (the referee's count, its number, over a man down: not while his knockdown is being replayed)
    const c = match.count;
    show('count', ph === 'count' && !!c && c.n > 0 && !replay.playing);
    if (c && c.n > 0) $('count').textContent = String(c.n);
  }
  // the match from its start: the bell, and the pit's crowd murmuring under it
  function begin() {
    audio.unlock();
    started = true;
    audio.play('bell', { strikes: 1 });
    audio.ambience(arena.crowd ? 'pit' : null);
    show('title', false);
    show('result', false);
  }
  // (another match, or this one again: 다음 시합, 다시)
  function fresh(s) {
    audio.unlock();
    seed = s;
    reset();
    begin();
  }
  // (a knockdown's replay is skipped by any key or tap on the picture: and that is all the press does)
  const skip = () => replay.playing && (replay.skip(), (replayEnd = bout.t), show('replay', false), true);
  addEventListener('pointerdown', e => {
    if (skip()) return;
    if (!started && !(e.target.closest && e.target.closest('button'))) begin();
  });
  addEventListener('keydown', e => skip() || (!started && (e.code === 'Enter' || e.code === 'Space') && begin()));
  function act(what) {
    if (what === 'next') fresh(freshSeed());
    else if (what === 'again') fresh(seed);
    else if (what === 'speed') {
      speed = speed === 0.5 ? SPEED : 0.5;
      $('speedbtn').textContent = speed === 0.5 ? '½×' : `${speed}×`;
      $('speedbtn').setAttribute('aria-pressed', String(speed === 0.5));
    }
  }
  for (const el of document.querySelectorAll('[data-act]')) el.addEventListener('click', () => act(el.dataset.act));
  $('speedbtn').textContent = `${speed}×`;

  // after a step: both boxers as they are now for the picture, and the streak of a glove that is travelling
  function pose(fresh) {
    const now = captureBout(bout);
    posed = { was: fresh ? now : posed.now, now };
    bout.fighters.forEach((f, i) => {
      const hand = f.action && MOVES[f.action.name].punch ? MOVES[f.action.name].hand : null;
      if (!fresh && hand && f.before) {
        const a = f.before[hand],
          b = f.points[hand],
          far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (far * 60 > 5.5 && far < 0.6) fx[1 + i].trail(a, b, 0.105, TRAIL, 0.1);
      }
    });
  }
  // (a defence drawn: its ripple, if it has one, put through the man defending as a hit's is) -> what it asks for
  const defend = e => {
    const d = guard.meet(e, bout.fighters, fx[0], motes);
    if (d.ripple) ripples[d.ripple.on] = d.ripple.ripple;
    return d;
  };
  // (what the sound is told with each event, and each step: where the men are and the camera, the place; nobody is the
  // player's man; a match's, so the knockout's bell is its result's. The mapping from an event to its sounds is
  // game/audio.mjs cuesOf, the sparring's too)
  const heard = (men, more) => Object.assign({ men: men || bout.fighters, yaw: cam.yaw, target: cam.target, pit: !!arena.crowd, you: null, match: true }, more);
  function react(e) {
    const f = bout.fighters;
    arena.hear(e);
    audio.hear(e, heard());
    if (e.type === 'dash') {
      fx[0].dust([f[e.who].x, 0, f[e.who].z], 6, [25, 24, 23]);
    } else if (e.type === 'hit') {
      // everything about a blow is sized by its impulse: a clean cross is about 85 newton-seconds
      const k = Math.min(1.6, (e.J * (e.counter ? RULES.counterGain : 1)) / 85);
      // (sparks off the far side of what it struck, never seen over him, and a ripple through him from where it landed)
      blow(motes[e.on], e, f[e.on]);
      ripples[e.on] = rippleOf(e, f[e.on]);
      // (a knockdown: watched until he comes down on the canvas)
      if (fallOf(e)) falls[e.on] = fallOf(e);
      shake.amp = e.down ? 7 : 1.5 + 3.5 * k;
      $('blow').textContent = `${Math.round(e.J * (e.counter ? RULES.counterGain : 1))} N·s${e.counter ? ' 카운터' : ''}`;
      $('blow').classList.remove('on');
      void $('blow').offsetWidth;
      $('blow').classList.add('on');
    } else if (e.type === 'collapse') {
      // (a man up too late going down again, match.mjs: watched until his knee is on the canvas, as a knockdown is; no blow)
      falls[e.who] = { on: e.who, q: 1, out: false, landed: null };
      shake.amp = 3;
    } else if (e.type === 'block') {
      defend(e);
      shake.amp = 1.2;
    } else if (e.type === 'parry') {
      white = defend(e).white;
      shake.amp = 2.5;
    } else if (e.type === 'whiff' || e.type === 'graze' || e.type === 'brilliant') defend(e);
    // ---- the match's own
    else if (e.type === 'bell' && match.phase === 'break') rest();
    else if (e.type === 'result') overAt = bout.t;
  }
  // the break: what the judges gave the round, and what each corner will tell its man (cornerAdvice, as finish() has it)
  let advice = null;
  function rest() {
    restLeft = REST;
    advice = [cornerAdvice(match, 0), cornerAdvice(match, 1)];
    const cards = match.cards[match.cards.length - 1];
    $('resthead').textContent = `${match.round}라운드 끝 · 휴식`;
    $('restcards').textContent = '심판 ' + cards.map(c => `${c[0]}-${c[1]}`).join(' · ');
    $('restcorner').textContent = advice.map((p, i) => `${CORNER[i]}: ${p.name}`).join(' · ');
    show('rest', true);
  }
  // (the result, once the last fall and its replay have been shown, and a moment after it)
  function result() {
    const r = match.result,
      men = match.card.men,
      who = i => `${CORNER[i]} ${gradeShown(men[i].grade)}`;
    shownAt = time;
    $('verdict').textContent = r.how === 'draw' ? '무승부' : r.how === 'decision' ? `판정 · ${CORNER[r.winner]} 승` : `${r.how} · ${CORNER[r.winner]} 승`;
    $('detail').textContent = `${who(0)} 대 ${who(1)} · ${r.how === 'decision' || r.how === 'draw' ? `${r.round}라운드 끝까지` : `${r.round}라운드 ${clock(r.time)}`} · 시합 #${seed}`;
    // (the three judges' totals, red's first, for a decision or a draw)
    $('cards').textContent = match.totals && (r.how === 'decision' || r.how === 'draw') ? '심판 ' + match.totals.map(t => `${t[0]}-${t[1]}`).join(' · ') : '';
    if (r.winner !== null) audio.play('win');
    audio.ambience(null, 2.5);
    show('count', false);
    show('result', true);
  }

  // one step of the match, and what the picture makes of it -> true if a knockdown's replay starts on it
  function stepOnce() {
    if (match.phase === 'break') {
      // (the break, as the page holds it; then out again from their corners, as each was told)
      if ((restLeft -= DT) > 1e-9) return false;
      nextRound(match, advice || [cornerAdvice(match, 0), cornerAdvice(match, 1)]);
      advice = null;
      show('rest', false);
      pose(true);
      for (const e of match.events) react(e);
      return false;
    }
    stepMatch(match, DT);
    guard.see(bout.fighters);
    // (the bout's events, and the match's own: a count, a man up, his legs going, going down again, the bell, the result)
    for (const e of bout.events) react(e);
    for (const e of match.events) if (!bout.events.includes(e)) react(e);
    audio.watch(bout.fighters, DT, heard());
    // (where a knocked-down man first comes down on the canvas: a second ripple through him, and a ring through the canvas)
    falls.forEach((fall, i) => {
      const at = landed(fall, bout.fighters[i]);
      if (at) (ripples[i] = landRipple(fall, bout.fighters[i], at)), (ground = groundOf(fall, at)), audio.hear({ type: 'floor', who: i }, heard());
      ringsOn(ground, fall, bout.fighters[i]); // (the ring of shaken pixels: his trunk's and his head's, each as it comes down)
    });
    if (bout.stop <= 0 || bout.events.length) pose();
    // (the step kept for a replay; a knockdown's starts once all of what it threw has gone out, and the match stops here)
    return replay.watch(bout, DT, quietOf(motes, ripples, ground));
  }

  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    R.resize(Number(query.get('rows')) || 216);
  }

  function frame(now) {
    const t0 = performance.now(),
      elapsed = Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    time += elapsed;
    fit();
    // (a knockdown's replay, while it plays: the match stands still)
    if (started && !replay.playing) {
      acc += elapsed;
      while (acc >= DT) {
        acc -= DT;
        if (stepOnce()) {
          acc = 0;
          show('replay', true);
          break;
        }
      }
    }
    hud();
    if (started && match.phase === 'break') $('restleft').textContent = `다음 라운드까지 ${Math.max(0, Math.ceil(restLeft))}초`;
    if (started && match.phase === 'over' && shownAt === null && overAt !== null && bout.t - overAt > 1.6 && !replay.pending && !replay.playing && bout.t - replayEnd >= 0.6) result();

    // ---- a knockdown's replay: what it shows now, and what it throws again as it comes to the steps that threw it
    const played = replay.playing ? replay.next(elapsed) : null;
    if (played) {
      if (replay.started || !again) {
        const set = () => createFx();
        again = { motes: [set(), set()], trails: [set(), set()], ripples: [null, null], was: null };
      }
      // (and its sounds again, lower and longer as it plays slower: game/audio.mjs)
      const slow = { replay: true, rate: elapsed > 0 ? Math.max(0.2, Math.min(1, replay.moved / elapsed)) : 0.25, yaw: replay.view ? replay.view.yaw : cam.yaw, target: replay.view ? replay.view.target : cam.target };
      for (const k of replay.crossed) {
        for (const e of k.events) audio.hear(e, heard(k.men, slow));
        for (const e of k.events) if (e.type === 'hit') (blow(again.motes[e.on], e, k.men[e.on]), (again.ripples[e.on] = rippleOf(e, k.men[e.on])));
        // (the streak of the glove that put him down, as the live picture left it)
        const v = replay.view;
        if (again.was && k.t <= v.blow + 1e-9) {
          const a = again.was.men[v.hit.who].points[v.hit.hand],
            b = k.men[v.hit.who].points[v.hit.hand],
            far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          if (far * 60 > 5.5 && far < 0.6) again.trails[v.hit.who].trail(a, b, 0.105, TRAIL, 0.1);
        }
        again.was = k;
      }
      if (!replay.playing) (replayEnd = bout.t), show('replay', false);
    }
    // ---- each boxer, between his last two steps (and held where he is through the moment of a blow)
    const held = !played && bout.stop > 0,
      between = held ? 1 : Math.min(1, acc / DT),
      shown = played ? played.men : blend(posed.was, posed.now, between).men,
      // (what is in the air goes on slowly through the moment of a blow; in a replay, what it threw again in its time)
      fade = played ? 0 : held ? elapsed * 0.2 : elapsed,
      moved = played ? replay.moved : fade,
      waves = played ? again.ripples : ripples,
      mote = played ? again.motes : motes;
    stopped = held ? Math.max(stopped, bout.stop) : 0;
    if (ground) ground.age += fade;
    const ring = played ? null : groundRow(ground),
      shadows = [],
      layers = [arena.ground(ring)];
    bout.fighters.forEach((f, i) => {
      const m = shown[i];
      boneMatrices(m.pose, bind, m.place, mats, 0);
      if (held && f.sinceHit < 0.2) {
        // a boxer who has just been hit shudders through it
        const shudder = 0.022 * (bout.stop / stopped) * Math.sin(time * 2 * Math.PI * 27);
        for (let k = 0; k < NAMES.length; k++) (mats[k * 12 + 9] += shudder * Math.cos(f.yaw)), (mats[k * 12 + 11] -= shudder * Math.sin(f.yaw));
      }
      R.packBones(mats, bones[i]);
      layers.push({ mesh: men[i], bones: bones[i], palette: worn[i], mask: 1, wave: rippleRow(waves[i], m), silhouette: i + 1 });
      shadows.push({ x: m.x + m.pose.at.Hips[2] * Math.sin(m.yaw), z: m.z + m.pose.at.Hips[2] * Math.cos(m.yaw), yaw: m.yaw, long: f.down ? 0.5 : 0.3, wide: f.down ? 0.32 : 0.24 });
    });
    meshes.fx[0].update(fx[0].rows, fx[0].update(fade, shadows, 22));
    for (const i of [1, 2]) (played ? meshes.fx[i].update(again.trails[i - 1].rows, again.trails[i - 1].update(moved)) : meshes.fx[i].update(fx[i].rows, fx[i].update(fade)));
    mote.forEach((m, i) => meshes.motes[i].update(m.rows, m.update(moved)));
    // (a ripple goes on in the same time as the sparks)
    for (const r of waves) if (r) r.age += moved;
    // (the shadows and the dust on the canvas ride the ring through it, never lit by it)
    layers.splice(1, 0, { mesh: meshes.fx[0], palette: arena.floor, mask: 0.6, ground: ring && [...ring.slice(0, 6), 0] });
    layers.push({ mesh: meshes.fx[1], palette: palettes[0], mask: 0.6 }, { mesh: meshes.fx[2], palette: palettes[1], mask: 0.6 });
    // (what a blow threw off each man is never seen over him, in front of him or behind: it shows first at his outline)
    layers.push(...meshes.motes.map((mesh, i) => ({ mesh, palette: palettes[0], mask: 0.6, outside: i + 1 })));

    // ---- camera: above and to one side of the line between them, swinging round slowly as they circle (and, in a knockdown's
    // replay, cut to the replay's own, closer, pushed in a little as it goes: the live one waits as it was)
    const view = played && replay.view,
      [a, b] = shown,
      ease = k => 1 - Math.exp(-elapsed * k),
      axis = Math.atan2(b.x - a.x, b.z - a.z),
      sideA = axis - Math.PI / 2,
      sideB = axis + Math.PI / 2,
      want = Math.abs(wrap(sideA - cam.yaw)) <= Math.abs(wrap(sideB - cam.yaw)) ? sideA : sideB,
      apart = Math.hypot(b.x - a.x, b.z - a.z),
      over = overAt !== null ? Math.min(1, (bout.t - overAt) / 2) : 0,
      dist = Math.max(5.6, Math.min(11, R.distFor(apart + 3.6))) * (1 - 0.18 * over);
    // (it turns at most a third of a turn in four seconds, however fast they circle: the stick's directions go with it)
    if (!view) {
      cam.yaw = wrap(cam.yaw + Math.max(-0.55 * elapsed, Math.min(0.55 * elapsed, wrap(want - cam.yaw) * ease(2.2))));
      cam.dist += (dist - cam.dist) * ease(3);
      for (const [k, v] of [[0, (a.x + b.x) / 2], [2, (a.z + b.z) / 2]]) cam.target[k] += (v * 0.85 - cam.target[k]) * ease(4);
      shake.amp *= Math.exp(-elapsed * 14);
      white *= Math.exp(-elapsed * 16);
    }
    // (the picture darkens for the result only once the fall and its replay have been shown; and a little for the break)
    if (overAt !== null) dim = replay.pending || view ? 0 : Math.min(0.4, Math.max(0, Math.min(bout.t - overAt - 1.2, bout.t - replayEnd - 0.2)) * 0.4);
    else dim = started && match.phase === 'break' ? Math.min(0.3, dim + elapsed) : Math.max(0, dim - elapsed);
    // (what stands round them: the ropes, bent where the men drawn press them; or the crowd beyond the camera's side of them)
    const camera = view ? { target: view.target, yaw: view.yaw, pitch: view.pitch, dist: distOf(view, cam.dist, R.target.w / R.target.h, replay.progress, inside(view.target, backOf(view.yaw, view.pitch))) } : cam;
    layers.splice(1, 0, ...arena.over(shown, elapsed, camera));
    const drawn = R.draw({
      camera,
      shake: !view && shake.amp > 0.4 ? [(Math.random() * 2 - 1) * shake.amp, (Math.random() * 2 - 1) * shake.amp * 0.6] : null,
      white: !view && white > 0.02 ? white : 0,
      dim,
      hall,
      ink,
      layers
    });
    stats.frames++;
    stats.drawn = drawn;
    stats.js += (performance.now() - t0 - stats.js) * 0.05;
    if (stats.at !== undefined) {
      stats.gaps.push(now - stats.at);
      if (stats.gaps.length > 30) stats.gaps.shift();
      stats.ms = [...stats.gaps].sort((x, y) => x - y)[stats.gaps.length >> 1];
    }
    stats.at = now;
    if (stats.frames % 30 === 0 && (query.has('fps') || location.hash === '#fps')) $('fps').textContent = `프레임 ${stats.ms.toFixed(1)} ms (JS ${stats.js.toFixed(1)}) · ${drawn} splats · ${R.target.w}×${R.target.h}`;
    requestAnimationFrame(frame);
  }

  reset();
  if (query.has('auto')) begin();
  globalThis.__bout = { shown: [], get bout() { return bout; }, get match() { return match; }, get phase() { return phaseOf(); }, get seed() { return seed; }, get replay() { return replay; }, get ground() { return ground; }, stats, renderer: R, cam, RULES, arena, audio, mute };
  $('loading').remove();
  requestAnimationFrame(frame);
}

// (?ring=shake: the ring through the canvas as shaken pixels, the prototype beside the confirmed ring: render/blow.mjs)
if (query.get('ring') === 'shake') FX.ground.kind = 'shake';
load().then(start).catch(error => {
  console.error(error);
  $('loading').textContent = '불러오지 못했습니다: ' + error.message;
});
