/* 한 라운드 스파링 (spar.html): each press of 시작 arranges a new round of promised sparring from a new seed (src/spar/plan.mjs:
   every exchange arranged beforehand and rehearsed in the real bout) and plays it by itself, at the true speed, to the first
   knockdown. The arranged timeline is in a corner of the picture; the camera is the game's own moving one (src/main.mjs),
   eased toward each beat's view. The round is the plan's controls played into a bout of its own, step by step: what is seen
   is the bout the rehearsal fought.
   The round is arranged in a worker (src/spar/worker.mjs), or here a piece each picture where a worker cannot be had, and
   plays once it is all arranged (on a slow device, after 8 s, on what is arranged, the rest arranged ahead of it). A knockdown is shown the way
   src/spar/knock.mjs says (the one place for it). The seed is kept in the page's address (#s-48213), so a round can be
   watched again or passed on; the outfit is remembered in this browser if it can be. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, rippleOf, rippleRow, fallOf, landed, landRipple, groundOf, groundRow, quietOf, ringsOn } from './render/blow.mjs';
import { createGuard, styleOf } from './render/guard.mjs';
import { captureBout, blend } from './replay.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { dress } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { MOVES } from './anim/moves.mjs';
import { LEVEL } from './anim/skill.mjs';
import { createBout, step, RULES } from './game/bout.mjs';
import { createAudio } from './game/audio.mjs';
import { startOf, planner } from './spar/plan.mjs';
import { punchName } from './spar/cards.mjs';
import { createKnockdown } from './spar/knock.mjs';

const DT = 1 / 60;
const $ = id => document.getElementById(id);
const HALL = [0x171a2c, 0x11131f, 0x0c0d16, 0x090a11];
const TRAIL = [38, 18, 18, 17, 16];
const CORNER = ['빨강', '파랑'];
// (a grade as the screens say it: 명 and 암 as L and D, 4명 -> 4L; the code and the docs keep 명 and 암)
const shown = lv => LEVEL[lv].label.replace('명', 'L').replace('암', 'D');
const WEARS = ['', 'training', 'training-up'];
const NONE = [{}, {}];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const reduced = (() => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();
// (what this browser remembers for the page, if it lets it: the outfit)
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // (a page that may not keep anything works without it)
    }
  }
};
const seedOfHash = () => {
  const m = /^#s-(\d{1,9})$/.exec(location.hash || '');
  return m ? Number(m[1]) : null;
};
// (a new round's seed: anything will do, the round is the seed's)
const freshSeed = () => {
  try {
    return 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 99999);
  } catch {
    return 1 + Math.floor(Math.random() * 99999);
  }
};
/* the view a beat is seen from, eased toward: how high (pitch), how close (times the game's distance), and nothing else.
   Footwork from above, work to the body lower and from the side, an exchange a little closer; the walk between them as the
   game has it. */
const VIEW = { rest: { pitch: 0.5, closer: 1 }, step: { pitch: 0.8, closer: 1.04 }, body: { pitch: 0.3, closer: 0.9 }, exchange: { pitch: 0.44, closer: 0.88 }, over: { pitch: 0.62, closer: 1, lift: 0.35 } };
const viewOf = (beat, k) => (!beat || k < beat.step ? VIEW.rest : beat.kind === 'step' || beat.kind === 'entry' ? VIEW.step : beat.body ? VIEW.body : VIEW.exchange);

async function assets() {
  const manifest = await (await fetch('assets/manifest.json')).json(),
    get = async part => unpack(fromBase64(await (await fetch('assets/' + part.file)).text()), part);
  return { manifest, get, ring: await get(manifest.ring) };
}

function start(data) {
  data = data || {};
  let wear = WEARS.includes(data.wear) ? data.wear : WEARS.includes(store.get('spar.wear')) ? store.get('spar.wear') : '',
    sound = !!data.sound;
  const want = Number(data.seed) || seedOfHash();
  assets()
    .then(a => run(a, { wear, sound, seed: want, play: !!data.seed }))
    .catch(error => {
      console.error(error);
      $('loading').textContent = '불러오지 못했습니다: ' + error.message;
    });
}

function run({ manifest, get, ring }, o) {
  const canvas = $('view'),
    R = createRenderer(canvas),
    audio = createAudio(),
    bind = fk(guardPose());
  const fx = [createFx(), createFx(), createFx()],
    motes = [createFx(), createFx()];
  // (what a defence draws, as the game draws it today: render/guard.mjs; not the brilliant defence's slow motion, as in the game)
  let guard = createGuard(styleOf(null));
  const meshes = { ring: R.mesh(ring, manifest.ring.count), fx: fx.map(f => R.mesh(f.rows, 0, true)), motes: motes.map(f => R.mesh(f.rows, 0, true)) },
    palettes = [0, 1].map(i => paletteArray(dress(manifest.palette, i))),
    hall = new Float32Array(HALL.flatMap(rgb)),
    ink = new Float32Array(rgb(manifest.palette[0])),
    bones = [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
    mats = new Float32Array(NAMES.length * 12),
    bodies = {}; // the boxers' meshes, as dressed: '' as they are
  let wear = o.wear,
    sound = o.sound,
    speed = 1;
  // (an outfit's mesh, loaded the first time it is worn)
  const partOf = w => (!w ? manifest.boxer : manifest.wear && Object.hasOwn(manifest.wear, w) ? manifest.wear[w] : null);
  async function dressed(w) {
    if (bodies[w]) return bodies[w];
    const part = partOf(w);
    if (!part) throw new Error(`no outfit called ${w}`);
    const rows = await get(part);
    return (bodies[w] = { mesh: R.mesh(rows, part.count), colours: [0, 1].map(i => (w ? paletteArray(dress(manifest.palette, i, w)) : palettes[i])) });
  }

  /* ---- the round: its plan as far as it is arranged, and the bout it is played into */
  let plan = null, // { seed, men, hp, winner, beats, inputs, done, ko, stats }
    job = 0,
    bout = createBout(1),
    k = 0, // steps of the plan played
    phase = 'rest', // 'rest' (nothing pressed yet: two men in their guards), 'wait' (arranging), 'play', 'over'
    posed = null,
    acc = 0,
    last = 0,
    time = 0,
    stopped = 0,
    white = 0,
    dim = 0,
    ripples = [null, null],
    falls = [null, null],
    ground = null,
    again = null, // what a knockdown's replay throws again, in its own time
    resultAt = null; // (the picture's time the result was shown at)
  const cam = { target: [0, 0.8, 0], yaw: 0, pitch: 0.5, dist: 8 },
    shake = { amp: 0, t: 0 },
    stats = { frames: 0, ms: 0 },
    // (a knockdown's showing: src/spar/knock.mjs, the game's way)
    knock = createKnockdown({ yaw: () => cam.yaw, aspect: () => R.target.w / R.target.h });

  /* ---- arranging: in a worker if there can be one, else here, a piece each picture */
  let worker = null,
    local = null;
  try {
    // (?worker=0: arranged here, a piece each picture, as where a worker cannot be had)
    if (/[?&]worker=0/.test(location.search)) throw new Error('no worker asked for');
    worker = new Worker(new URL('./spar/worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = e => took(e.data);
    worker.onerror = e => {
      // (no worker after all: arranged here instead, from the start)
      e.preventDefault && e.preventDefault();
      worker = null;
      if (plan && !plan.done) arrange(plan.seed, true);
    };
  } catch {
    worker = null;
  }
  function arrange(seed, keepJob) {
    if (!keepJob) job++;
    plan = { seed, men: null, hp: null, winner: null, beats: [], inputs: [], done: false, ko: null, stats: null, error: null, askedAt: performance.now(), readyAt: 0, doneAt: 0 };
    local = null;
    if (worker) worker.postMessage({ id: job, seed });
    else local = { id: job, p: planner(seed), beats: 0, inputs: 0 };
  }
  function took(m) {
    if (!plan || m.id !== job) return;
    // (the round arranged again from the start, with the seed's next dice: it is played again from its start)
    if (m.reset) {
      Object.assign(plan, { beats: [], inputs: [], done: false, ko: null, readyAt: 0 });
      if (phase === 'play' || phase === 'over') (phase = 'wait'), show('result', false), show('tl', false), ($('busy').textContent = '대본을 다시 짜는 중…'), show('busy', true);
    }
    if (m.head) {
      Object.assign(plan, m.head);
      // (the new men, in their guards where the round starts, while it is arranged)
      if (phase === 'wait') (bout = startOf(plan)), freshFx(), pose(true), named();
    }
    plan.beats.push(...m.beats);
    for (const inp of m.inputs) plan.inputs.push(inp);
    plan.done = m.done;
    if (m.done && !plan.doneAt) plan.doneAt = performance.now() - plan.askedAt;
    if (m.beats.length && plan.beats.length >= 3 && !plan.readyAt) plan.readyAt = performance.now() - plan.askedAt;
    plan.ko = m.ko || plan.ko;
    plan.stats = m.stats || plan.stats;
    plan.error = m.error || null;
    if (plan.error) $('busy').textContent = '대본을 짜지 못했습니다';
    else if (phase === 'wait') $('busy').textContent = `대본을 짜는 중… 공방 ${plan.beats.length}`;
    rows();
  }
  function arrangeHere(ms) {
    const j = local;
    if (!j || j.p.done) return;
    try {
      j.p.run(ms);
    } catch (err) {
      took({ id: j.id, beats: [], inputs: [], done: false, error: String(err.message || err) });
      local = null;
      return;
    }
    const p = j.p.plan,
      log = j.p.log,
      reset = !!j.plan && j.plan !== p;
    if (reset || !j.plan) (j.plan = p), (j.beats = j.inputs = 0);
    took({ id: j.id, reset, head: j.beats === 0 ? { seed: p.seed, men: p.men, hp: p.hp, winner: p.winner } : null, beats: p.beats.slice(j.beats), inputs: log.slice(j.inputs), done: j.p.done, ko: p.ko, stats: j.p.done ? p.stats : null });
    j.beats = p.beats.length;
    j.inputs = log.length;
  }
  /* (it plays once it is all arranged: a round arranged again from the start with the seed's next dice, which happens, would
     otherwise be seen to start over; on a slow device, after 8 s of waiting, it starts on what is arranged and the rest is
     arranged ahead of it) */
  const ready = () => plan && plan.men && plan.inputs.length && (plan.done || (performance.now() - plan.askedAt > 8000 && plan.beats.length >= 4));

  /* ---- what the page shows of it */
  function named() {
    const men = plan && plan.men;
    [0, 1].forEach(i => {
      $('name' + i).innerHTML = `<b>${CORNER[i]}</b>${men ? ' · ' + shown(men[i].grade) : ''}`;
    });
    $('seed').textContent = plan ? `대련 #${plan.seed}` : '대련 —';
  }
  function hud() {
    bout.fighters.forEach((f, i) => {
      $('hp' + i).style.transform = `scaleX(${Math.max(0, f.hp) / RULES.hp})`;
      $('hpn' + i).textContent = phase === 'rest' || phase === 'wait' ? '' : String(Math.max(0, Math.ceil(f.hp)));
    });
    $('time').textContent = clock(phase === 'play' || phase === 'over' ? bout.t : 0);
  }
  const show = (id, on) => $(id).classList.toggle('on', on);
  // the beat being fought (its walk to its distance and the exchange itself), by the step the bout is at
  const current = () => (plan ? plan.beats.findIndex(b => k >= b.from && k < b.to) : -1);
  // (what is thrown and how it is answered; footwork has no answer; and what came of it, short for the corner)
  const said = b => (b.answer && b.answer !== '—' ? `${b.what} → ${b.answer}` : b.what),
    // (the knockdown's beat: what it ended with, first)
    shortSaid = b => (b.said === '—' || b.said === '거리' ? '' : plan.ko && plan.ko.beat === b.i ? b.said.split(' · ').pop() : b.said.replace(/ N·s/g, '').replace(/카운터 명중/g, '카운터').replace(/ · /g, ' ')),
    doneText = b => `${b.answer && b.answer !== '—' && b.answer !== '맞음' ? `${b.what} → ${b.answer}` : b.what}`;
  const lineHtml = (b, state) => `<li class="beat ${state}${plan.ko && plan.ko.beat === b.i ? ' ko' : ''}"><span class="t">${clock(b.t)}</span><span class="who${b.lead ? ' b' : ''}"></span><span class="what">${state === 'done' ? `${doneText(b)} <span class="said">${shortSaid(b)}</span>` : said(b)}</span></li>`;
  let rowsAt = null;
  function rows(force) {
    if (!plan) return;
    const now = current(),
      key = `${now}|${plan.beats.length}|${phase}|${plan.done}`;
    if (key === rowsAt && !force) return;
    rowsAt = key;
    const n = plan.beats.length,
      from = Math.max(0, Math.min(now < 0 ? (phase === 'over' ? n - 5 : 0) : now - 1, n - 5)),
      shown = plan.beats.slice(from, from + 5);
    $('tlrows').innerHTML = shown.map(b => lineHtml(b, (phase === 'over' && b.i <= n - 1) || b.to <= k ? 'done' : b.i === now ? 'now' : 'ahead')).join('');
    $('tlcount').textContent = `${now < 0 ? (phase === 'over' ? n : 0) : now + 1}/${plan.done ? n : n + '…'}`;
    if ($('full').classList.contains('on')) full();
  }
  function full() {
    const now = current(),
      men = plan.men;
    $('fullmeta').textContent = men ? `대련 #${plan.seed} · ${CORNER[0]} ${shown(men[0].grade)} 대 ${CORNER[1]} ${shown(men[1].grade)} · 시작 체력 둘 다 ${plan.hp}${plan.done ? '' : ' · 짜는 중…'}` : '짜는 중…';
    $('fullrows').innerHTML = plan.beats
      .map(b => {
        const state = b.to <= k || phase === 'over' ? 'done' : b.i === now ? 'now' : 'ahead';
        return `<li class="${state}${plan.ko && plan.ko.beat === b.i ? ' ko' : ''}"><span class="t">${clock(b.t)}</span><span class="who${b.lead ? ' b' : ''}"></span><span>${CORNER[b.lead]} ${b.answer && b.answer !== '—' ? `${b.what} → ${CORNER[1 - b.lead]} ${b.answer}` : b.what}${b.said === '—' ? '' : `<span class="said">${state === 'done' || phase === 'over' ? b.said : '약속: ' + b.said}</span>`}</span></li>`;
      })
      .join('');
  }

  /* ---- the round's playing */
  function freshFx() {
    ripples = [null, null];
    falls = [null, null];
    ground = again = null;
    dim = white = 0;
    guard = createGuard(guard.style);
    knock.reset();
  }
  function begin() {
    bout = startOf(plan);
    k = 0;
    acc = 0;
    resultAt = null;
    freshFx();
    phase = 'play';
    pose(true);
    named();
    show('title', false);
    show('result', false);
    show('busy', false);
    show('tl', true);
    rows(true);
    $('againbtn').disabled = false;
  }
  function newRound(seed) {
    audio.unlock && sound && audio.unlock();
    arrange(seed);
    try {
      history.replaceState(null, '', '#s-' + seed);
    } catch {
      // (an address that cannot be changed: the seed is still on the HUD)
    }
    phase = 'wait';
    show('result', false);
    show('title', false);
    show('tl', false);
    show('full', false);
    $('busy').textContent = '대본을 짜는 중…';
    show('busy', true);
    named();
  }
  function replay() {
    if (!plan || !plan.men) return;
    if (ready()) begin();
  }

  function pose(fresh) {
    const now = captureBout(bout);
    posed = { was: fresh || !posed ? now : posed.now, now };
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
  const play = name => sound && audio.play(name);
  // (a defence drawn: its ripple, if it has one, put through the man defending as a hit's is) -> what it asks for (src/main.mjs)
  const defend = e => {
    const d = guard.meet(e, bout.fighters, fx[0], motes);
    if (d.ripple) ripples[d.ripple.on] = d.ripple.ripple;
    return d;
  };
  function react(e) {
    const f = bout.fighters;
    if (e.type === 'punch') play('swing');
    else if (e.type === 'dash') {
      play('dodge');
      fx[0].dust([f[e.who].x, 0, f[e.who].z], 6, [25, 24, 23]);
    } else if (e.type === 'hit') {
      const q = Math.min(1.6, (e.J * (e.counter ? RULES.counterGain : 1)) / 85),
        heavy = q > 0.75 || e.down;
      play(heavy ? 'heavy' : 'hit');
      blow(motes[e.on], e, f[e.on]);
      ripples[e.on] = rippleOf(e, f[e.on]);
      if (fallOf(e)) falls[e.on] = fallOf(e);
      shake.amp = reduced ? 0 : e.down ? 7 : 1.5 + 3.5 * q;
      $('blow').textContent = `${Math.round(e.J * (e.counter ? RULES.counterGain : 1))} N·s${e.counter ? ' 카운터' : ''}`;
      $('blow').classList.remove('on');
      void $('blow').offsetWidth;
      $('blow').classList.add('on');
    } else if (e.type === 'block') {
      play('whiff');
      defend(e);
      shake.amp = reduced ? 0 : 1.2;
    } else if (e.type === 'parry') {
      play('deflect');
      const d = defend(e);
      shake.amp = reduced ? 0 : 2.5;
      white = reduced ? 0 : d.white;
    } else if (e.type === 'whiff' || e.type === 'graze' || e.type === 'brilliant') defend(e);
  }
  function result() {
    const ko = plan.ko,
      men = plan.men;
    $('verdict').textContent = `KO ${clock(ko.t)} · ${CORNER[ko.by]} ${shown(men[ko.by].grade)} · ${punchName(ko.name)}`;
    $('detail').textContent = `${ko.out ? '실신' : ko.liver ? '리버 다운' : '다운'} · ${Math.round(ko.J * (ko.counter ? RULES.counterGain : 1))} N·s${ko.counter ? ' 카운터' : ''} · ${plan.beats.length}번째 공방 · 대련 #${plan.seed}`;
    show('result', true);
  }

  /* ---- the picture */
  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    R.resize(216);
  }
  function frame(now) {
    const t0 = performance.now(),
      elapsed = Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    time += elapsed;
    fit();
    /* (arranged here: most of each picture while nothing plays yet, a little while it plays, and more as the picture comes
       within five seconds of the end of what is arranged) */
    if (local && !local.p.done) arrangeHere(phase === 'wait' ? 120 : plan && plan.inputs.length - k < 300 ? 45 : 12);
    if (phase === 'wait' && ready()) begin();
    if (phase === 'play' || phase === 'over') {
      if (knock.playing) acc = 0;
      else {
        acc += elapsed;
        let n = 0;
        while (acc >= DT && n++ < 8) {
          // (the plan's controls; past its end, once he is down, nobody presses anything while his fall and its replay are shown)
          const inp = k < plan.inputs.length ? plan.inputs[k] : plan.done && bout.over !== null ? NONE : null;
          if (!inp) {
            acc = 0;
            break;
          }
          acc -= DT;
          k++;
          step(bout, inp, DT);
          guard.see(bout.fighters);
          for (const e of bout.events) react(e);
          falls.forEach((fall, i) => {
            const at = landed(fall, bout.fighters[i]);
            if (at) (ripples[i] = landRipple(fall, bout.fighters[i], at)), (ground = groundOf(fall, at));
            ringsOn(ground, fall, bout.fighters[i]); // (the ring of shaken pixels, if ?ring=shake were asked of the game: off here)
          });
          if (bout.stop <= 0 || bout.events.length) pose();
          // (a knockdown's replay starts once all of what it threw has gone out, and the bout stops here)
          if (knock.after(bout, quietOf(motes, ripples, ground))) {
            acc = 0;
            show('tag', true);
            break;
          }
        }
        if (n > 8) acc = 0;
      }
      if (phase === 'play' && bout.over !== null) phase = 'over';
      // (arranged no further yet: the picture waits on it)
      show('busy', phase === 'play' && k >= plan.inputs.length && !plan.done);
      if (phase === 'over' && resultAt === null && plan.ko && knock.shown(bout)) (resultAt = time), result(), rows(true);
      rows();
    } else {
      // (at rest, and while the round is arranged: two men in their guards, bouncing where they stand)
      acc += elapsed;
      while (acc >= DT) (acc -= DT), step(bout, [{}, {}], DT), pose();
    }
    hud();

    // ---- what to draw: the bout between its last two steps, or a knockdown's replay (and what it throws again as it comes to
    // the steps that threw it, in its own time)
    const played = knock.playing ? knock.picture(elapsed, bout) : null;
    if (played) {
      if (knock.started || !again) {
        const set = () => createFx();
        again = { motes: [set(), set()], trails: [set(), set()], ripples: [null, null], was: null };
      }
      for (const st of knock.crossed) {
        for (const e of st.events) if (e.type === 'hit') blow(again.motes[e.on], e, st.men[e.on]), (again.ripples[e.on] = rippleOf(e, st.men[e.on]));
        // (the streak of the glove that put him down, as the live picture left it)
        const v = knock.view;
        if (again.was && v && st.t <= v.blow + 1e-9) {
          const p0 = again.was.men[v.hit.who].points[v.hit.hand],
            p1 = st.men[v.hit.who].points[v.hit.hand],
            far = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
          if (far * 60 > 5.5 && far < 0.6) again.trails[v.hit.who].trail(p0, p1, 0.105, TRAIL, 0.1);
        }
        again.was = st;
      }
    }
    show('tag', knock.playing);
    const held = !played && bout.stop > 0,
      between = held ? 1 : Math.min(1, acc / DT),
      men = played ? played.men : blend(posed.was, posed.now, between).men,
      fade = played ? 0 : held ? elapsed * 0.2 : elapsed,
      moved = played ? knock.moved : fade,
      waves = played ? again.ripples : ripples,
      mote = played ? again.motes : motes;
    stopped = held ? Math.max(stopped, bout.stop) : 0;
    if (ground) ground.age += fade;
    const ringRow = played ? null : groundRow(ground),
      shadows = [],
      layers = [{ mesh: meshes.ring, palette: palettes[0], mask: 0.5, ground: ringRow }],
      body = bodies[wear] || bodies[''];
    men.forEach((m, i) => {
      boneMatrices(m.pose, bind, m.place, mats, 0);
      const f = bout.fighters[i];
      if (held && f.sinceHit < 0.2 && !reduced) {
        const shudder = 0.022 * (bout.stop / stopped) * Math.sin(time * 2 * Math.PI * 27);
        for (let j = 0; j < NAMES.length; j++) (mats[j * 12 + 9] += shudder * Math.cos(f.yaw)), (mats[j * 12 + 11] -= shudder * Math.sin(f.yaw));
      }
      R.packBones(mats, bones[i]);
      layers.push({ mesh: body.mesh, bones: bones[i], palette: body.colours[i], mask: 1, wave: rippleRow(waves[i], m), silhouette: i + 1 });
      shadows.push({ x: m.x + m.pose.at.Hips[2] * Math.sin(m.yaw), z: m.z + m.pose.at.Hips[2] * Math.cos(m.yaw), yaw: m.yaw, long: f.down ? 0.5 : 0.3, wide: f.down ? 0.32 : 0.24 });
    });
    meshes.fx[0].update(fx[0].rows, fx[0].update(fade, shadows, 22));
    for (const i of [1, 2]) played ? meshes.fx[i].update(again.trails[i - 1].rows, again.trails[i - 1].update(moved)) : meshes.fx[i].update(fx[i].rows, fx[i].update(fade));
    mote.forEach((m, i) => meshes.motes[i].update(m.rows, m.update(moved)));
    // (a ripple goes on in the same time as the sparks)
    for (const r of waves) if (r) r.age += moved;
    layers.splice(1, 0, { mesh: meshes.fx[0], palette: palettes[0], mask: 0.6, ground: ringRow && [...ringRow.slice(0, 6), 0] });
    layers.push({ mesh: meshes.fx[1], palette: palettes[0], mask: 0.6 }, { mesh: meshes.fx[2], palette: palettes[1], mask: 0.6 });
    layers.push(...meshes.motes.map((mesh, i) => ({ mesh, palette: palettes[0], mask: 0.6, outside: i + 1 })));

    // ---- the camera: the game's (beside the line between them, swinging round slowly as they circle, closer when they are
    // near), eased toward the beat's view; kept clear of the timeline's corner; cut for a knockdown's replay only
    const [a, b] = men,
      ease = q => 1 - Math.exp(-elapsed * q),
      axis = Math.atan2(b.x - a.x, b.z - a.z),
      sideA = axis - Math.PI / 2,
      sideB = axis + Math.PI / 2,
      yaw = Math.abs(wrap(sideA - cam.yaw)) <= Math.abs(wrap(sideB - cam.yaw)) ? sideA : sideB,
      apart = Math.hypot(b.x - a.x, b.z - a.z),
      beat = plan && phase !== 'rest' && phase !== 'wait' ? plan.beats[current()] : null,
      // (the end: both men in the picture, the one standing and the one down, under the result)
      v = phase === 'over' ? VIEW.over : viewOf(beat, k),
      narrow = R.target.w < R.target.h,
      base = Math.max(5.2, Math.min(narrow ? 12.5 : 11, R.distFor(apart + 3.6))),
      replayCam = knock.camera(cam.dist, played);
    // (the first picture is framed at once, not eased into from nowhere)
    if (!replayCam && stats.frames === 0) (cam.yaw = yaw), (cam.dist = base * v.closer), (cam.pitch = v.pitch), cam.target.splice(0, 3, ((a.x + b.x) / 2) * 0.85, 0.8, ((a.z + b.z) / 2) * 0.85);
    if (!replayCam) {
      cam.yaw = wrap(cam.yaw + Math.max(-0.55 * elapsed, Math.min(0.55 * elapsed, wrap(yaw - cam.yaw) * ease(2.2))));
      cam.dist += (base * v.closer - cam.dist) * ease(1.6);
      cam.pitch += (v.pitch - cam.pitch) * ease(1.2);
      // (the timeline's corner: the men drawn up and away from it, by as much of the picture as it covers)
      const box = $('tl').classList.contains('on') ? $('tl').getBoundingClientRect() : null,
        W = canvas.clientWidth || 1,
        H = canvas.clientHeight || 1,
        wide = W / H > 1,
        across = box ? (box.right / W) * 0.22 * R.widthAt(cam.dist) * (wide ? 1 : 0.3) : 0,
        up = box ? ((H - box.top) / H) * (wide ? 0.25 : 0.9) : 0,
        X = [Math.cos(cam.yaw), -Math.sin(cam.yaw)],
        to = [((a.x + b.x) / 2) * 0.85 - X[0] * across, 0.8 - up + (v.lift || 0), ((a.z + b.z) / 2) * 0.85 - X[1] * across];
      for (const j of [0, 1, 2]) cam.target[j] += (to[j] - cam.target[j]) * ease(j === 1 ? 2 : 4);
    }
    if (!replayCam) (shake.amp *= Math.exp(-elapsed * 14)), (white *= Math.exp(-elapsed * 16));
    shake.t += elapsed;
    // (the picture darkens for the result only once the fall and its replay have been shown)
    if (phase === 'over') dim = knock.pending || replayCam ? 0 : resultAt === null ? 0 : Math.min(0.4, (time - resultAt) * 0.4);
    R.draw({
      camera: replayCam || cam,
      shake: !replayCam && shake.amp > 0.4 ? [Math.sin(shake.t * 97) * shake.amp, Math.cos(shake.t * 83) * shake.amp * 0.6] : null,
      white: !replayCam && white > 0.02 ? white : 0,
      dim,
      hall,
      ink,
      layers
    });
    stats.frames++;
    stats.ms += (performance.now() - t0 - stats.ms) * 0.05;
    if (!capture) requestAnimationFrame(frame);
  }
  /* (?capture: the picture is moved on only when asked, so many milliseconds at a time, for recording it frame by frame:
     __spar.tick(ms)) */
  const capture = /[?&]capture\b/.test(location.search);
  let clockAt = 0;

  /* ---- the buttons */
  function act(what) {
    if (what === 'start') newRound(freshSeed());
    else if (what === 'again') replay();
    else if (what === 'speed') {
      speed = speed === 1 ? 0.5 : 1;
      $('speedbtn').textContent = speed === 1 ? '1×' : '½×';
      $('speedbtn').setAttribute('aria-pressed', String(speed !== 1));
    } else if (what === 'sound') {
      sound = !sound;
      if (sound) audio.unlock();
      $('soundbtn').textContent = sound ? '소리 켬' : '소리 끔';
      $('soundbtn').setAttribute('aria-pressed', String(sound));
    } else if (what === 'close') show('full', false);
  }
  for (const el of document.querySelectorAll('[data-act]')) el.addEventListener('click', () => act(el.dataset.act));
  // (a knockdown's replay is skipped by a tap on the picture or any key)
  canvas.addEventListener('pointerdown', () => knock.skip(bout));
  addEventListener('keydown', e => e.key !== 'Tab' && knock.skip(bout));
  const openFull = () => plan && plan.beats.length && (full(), show('full', true), document.querySelector('#full button').focus());
  $('tl').addEventListener('click', openFull);
  $('tl').addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openFull()));
  addEventListener('keydown', e => e.key === 'Escape' && $('full').classList.contains('on') && (show('full', false), $('tl').focus()));
  $('wear').value = wear;
  $('wear').addEventListener('change', () => {
    const w = $('wear').value;
    dressed(w)
      .then(() => ((wear = w), store.set('spar.wear', w)))
      .catch(err => console.error(err));
  });
  addEventListener('hashchange', () => {
    const s = seedOfHash();
    if (s && (!plan || plan.seed !== s)) newRound(s);
  });
  const stamp = document.querySelector('meta[name="build"]'),
    [commit, date] = stamp ? String(stamp.content).split(/\s+/) : [];
  $('build').textContent = stamp ? `빌드 ${commit} · ${(date || '').slice(5)}` : '빌드 로컬';
  if (sound) ($('soundbtn').textContent = '소리 켬'), $('soundbtn').setAttribute('aria-pressed', 'true');

  // (the page as it was, if the host swaps a new version in while it is open: the same round comes back)
  try {
    globalThis.claude && globalThis.claude.hot && globalThis.claude.hot.snapshot && globalThis.claude.hot.snapshot(() => ({ seed: plan ? plan.seed : null, wear, sound }));
  } catch {
    // (no host to tell)
  }
  globalThis.__spar = { get plan() { return plan; }, get bout() { return bout; }, get phase() { return phase; }, get k() { return k; }, stats, cam, newRound, replay, tick: ms => frame((clockAt += ms)) };

  Promise.all([dressed(''), wear ? dressed(wear) : null]).then(() => {
    pose(true);
    hud();
    $('loading').remove();
    if (o.seed && o.play) newRound(o.seed);
    else if (o.seed) {
      // (a link to a round: it is waiting, and 다시 보기 plays it)
      $('startbtn').textContent = '시작';
      $('againbtn').disabled = false;
      $('againbtn').textContent = `#${o.seed} 보기`;
      $('againbtn').onclick = e => {
        e.stopImmediatePropagation();
        $('againbtn').onclick = null;
        $('againbtn').textContent = '다시 보기';
        newRound(o.seed);
      };
    }
    if (!capture) requestAnimationFrame(frame);
    else frame((clockAt = 1));
  });
}

const hot = globalThis.claude && globalThis.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
