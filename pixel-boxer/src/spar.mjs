/* 한 라운드 스파링 (spar.html): each press of 시작 arranges a new round of promised sparring from a new seed (src/spar/plan.mjs:
   the whole round arranged beforehand, in one pass of the real bout, both men acting all the time) and plays it by itself,
   at the true speed, to the first knockdown. What each man does is on four lanes along the bottom (src/spar/rails.mjs: his
   techniques and his footwork, a block an action, coloured by its kind, with what came of it; the present at the playhead,
   what is promised to its right).
   The round is the plan's controls played into a bout of its own, step by step: what is seen is the bout that was arranged.
   The camera is one fixed angle that only follows the two men; where what happens calls for it (rails.mjs viewsOf) it goes
   up to a bird's-eye view or in to a zoom, eased; the only cut is a knockdown's replay.
   The round is arranged in a worker (src/spar/worker.mjs), or here a piece each picture where a worker cannot be had, and
   plays once it is all arranged (on a slow device, after 4 s, on what is arranged, the rest arranged ahead of it). A
   knockdown is shown the way src/spar/knock.mjs says (the one place for it). The seed is kept in the page's address
   (#s-48213), so a round can be watched again or passed on; the outfit is remembered in this browser if it can be. */
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
import { viewsOf, ACTS } from './spar/rails.mjs';
import { punchName, labelOf, saidOf, shortOf } from './spar/names.mjs';
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
/* The camera (the user's rule, 2026-11-25): one fixed angle that only follows the two men, ANGLE (from the side the round
   starts side on to, yaw 0; `pitch` radians above the canvas; as far off as frames them); and on top of it, where what
   happens calls for it (rails.mjs viewsOf: a bird's-eye view for the big footwork, a zoom in for a power blow that lands as
   a counter, cuts a punch, is thrown right up close or puts him down), the same angle from higher (`bird`) or nearer
   (`zoom`), eased in and out at `ease` a second. It never goes round them, and never low. */
const ANGLE = { yaw: 0, pitch: 0.5, bird: { pitch: 1.02, closer: 1.12 }, zoom: { pitch: 0.46, closer: 0.78 }, ease: 2.4 };
// the colours of the rails' kinds, and of the two things footwork does (spar.html: --k-attack and the rest)
const KIND = { attack: '#ffb84a', evade: '#58d6a4', guard: '#b49cff', show: '#e8e2cf', hurt: '#ff5470', down: '#ff5470', distance: '#9aa3bd', axis: '#52c7ea' };
const hue = b => (b.kind === 'step' ? KIND[b.way] : KIND[b.kind]) || KIND.distance;
const tenth = k => `${Math.floor(k / 3600)}:${String(Math.floor(k / 60) % 60).padStart(2, '0')}.${Math.floor((k % 60) / 6)}`;

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
  let plan = null, // { seed, men, hp, favoured, inputs, rails, views, done, ko, stats }
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
    plan = { seed, men: null, hp: null, favoured: null, inputs: [], rails: [[], []], feet: [[], []], views: [], done: false, ko: null, steps: 0, stats: null, error: null, askedAt: performance.now(), doneAt: 0 };
    local = null;
    if (worker) worker.postMessage({ id: job, seed });
    else local = { id: job, p: planner(seed), inputs: 0 };
  }
  function took(m) {
    if (!plan || m.id !== job) return;
    // (the round arranged again from the start, with the seed's next dice: it is played again from its start)
    if (m.reset) {
      Object.assign(plan, { inputs: [], rails: [[], []], feet: [[], []], views: [], done: false, ko: null });
      if (phase === 'play' || phase === 'over') (phase = 'wait'), show('result', false), show('rails', false), ($('busy').textContent = '대본을 다시 짜는 중…'), show('busy', true);
    }
    if (m.head) {
      Object.assign(plan, m.head);
      // (the new men, in their guards where the round starts, while it is arranged)
      if (phase === 'wait') (bout = startOf(plan)), freshFx(), pose(true), named();
    }
    for (const inp of m.inputs) plan.inputs.push(inp);
    plan.rails = m.rails;
    plan.feet = m.feet;
    plan.done = m.done;
    if (m.done && !plan.doneAt) plan.doneAt = performance.now() - plan.askedAt;
    plan.ko = m.ko || plan.ko;
    plan.steps = m.steps || 0;
    plan.stats = m.stats || plan.stats;
    plan.error = m.error || null;
    // (the camera's views, read off the rails as far as they are arranged)
    plan.views = viewsOf(plan.rails, plan.feet, plan.ko ? plan.ko.step : Infinity);
    plan.count = plan.rails.reduce((n, r) => n + r.filter(b => ACTS.includes(b.kind)).length, 0);
    plan.walked = plan.feet[0].length + plan.feet[1].length;
    if (plan.error) $('busy').textContent = '대본을 짜지 못했습니다';
    else if (phase === 'wait') $('busy').textContent = `대본을 짜는 중… ${Math.floor(plan.inputs.length / 60)}초`;
    if ($('full').classList.contains('on')) full();
  }
  function arrangeHere(ms) {
    const j = local;
    if (!j || j.p.done) return;
    try {
      j.p.run(ms);
    } catch (err) {
      took({ id: j.id, inputs: [], rails: plan.rails, feet: plan.feet, done: false, error: String(err.message || err) });
      local = null;
      return;
    }
    const p = j.p.plan,
      reset = !!j.plan && j.plan !== p;
    if (reset || !j.plan) (j.plan = p), (j.inputs = 0);
    took({ id: j.id, reset, head: j.inputs === 0 ? { seed: p.seed, men: p.men, hp: p.hp, favoured: p.favoured, target: p.target } : null, inputs: p.inputs.slice(j.inputs), rails: p.rails, feet: p.feet, done: j.p.done, ko: p.ko, steps: p.steps, stats: j.p.done ? p.stats : null });
    j.inputs = p.inputs.length;
  }
  /* (it plays once it is all arranged: the round is promised. On a slow device, after 4 s of waiting, it starts on what is
     arranged, a third of a minute or more, and the rest is arranged ahead of it) */
  const ready = () => plan && plan.men && plan.inputs.length && (plan.done || (performance.now() - plan.askedAt > 4000 && plan.inputs.length >= 1200));

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
  /* ---- the four lanes, drawn each picture: red's techniques, red's footwork, blue's footwork, blue's techniques; time runs
     to the left under the playhead, a step of the round a sixtieth of a second. A block is its kind's colour: faint once it
     is past, bright while it is being done, and in between while it is still to come (the promise). On a punch's block,
     where it landed (a dot; a power blow's a gold one, with a line to the other man's lane where it cut what he was doing),
     was blocked (a bar), parried (a cross) or went by (a ring). */
  const rcv = $('railcv'),
    rg = rcv.getContext('2d'),
    FONT = px => `700 ${px}px ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono CJK KR", monospace`;
  function drawRails(kf) {
    const dpr = Math.min(devicePixelRatio || 1, 3),
      W = rcv.clientWidth,
      H = rcv.clientHeight;
    if (!W || !H) return;
    if (rcv.width !== Math.round(W * dpr) || rcv.height !== Math.round(H * dpr)) (rcv.width = Math.round(W * dpr)), (rcv.height = Math.round(H * dpr));
    rg.setTransform(dpr, 0, 0, dpr, 0, 0);
    rg.clearRect(0, 0, W, H);
    const secs = W < 520 ? 4.4 : W < 900 ? 6.5 : 9, // (how much of the round the lanes show at once)
      pps = W / secs,
      head = Math.round(W * 0.3),
      gap = 2,
      mid = 5,
      tall = Math.floor((H - 2 * gap - mid) * 0.3), // a technique lane
      low = Math.floor((H - 2 * gap - mid) * 0.2), // a footwork lane
      // (from the top: red's techniques, red's footwork, blue's footwork, blue's techniques)
      lanes = [
        { who: 0, of: plan.rails[0], y: 0, h: tall },
        { who: 0, of: plan.feet[0], y: tall + gap, h: low, feet: true },
        { who: 1, of: plan.feet[1], y: tall + gap + low + mid, h: low, feet: true },
        { who: 1, of: plan.rails[1], y: tall + 2 * gap + 2 * low + mid, h: tall }
      ],
      xOf = k => head + ((k - kf) / 60) * pps,
      arranged = plan.inputs.length;
    rg.textBaseline = 'middle';
    for (const L of lanes) {
      rg.fillStyle = L.feet ? 'rgba(246,243,234,.035)' : 'rgba(246,243,234,.07)';
      rg.fillRect(0, L.y, W, L.h);
      rg.fillStyle = L.who ? '#2a84ec' : '#e6382e';
      rg.fillRect(0, L.y, 3, L.h + (L.feet ? 0 : 0));
    }
    rg.fillStyle = '#e6382e';
    rg.fillRect(0, lanes[0].y, 3, lanes[1].y + lanes[1].h);
    rg.fillStyle = '#2a84ec';
    rg.fillRect(0, lanes[2].y, 3, lanes[3].y + lanes[3].h - lanes[2].y);
    for (const L of lanes) {
      const y = L.y,
        lane = L.h;
      rg.font = FONT(L.feet ? 9 : 10);
      for (const b of L.of) {
        const to = b.to ?? arranged,
          x0 = Math.max(4, xOf(b.from)),
          x1 = Math.min(W, xOf(to));
        if (x1 <= 4 || x0 >= W || x1 - x0 < 0.5) continue;
        const past = to <= kf,
          now = b.from <= kf && kf < to,
          w = Math.max(2, x1 - x0 - 1);
        rg.globalAlpha = past ? 0.34 : now ? 1 : 0.62;
        rg.fillStyle = hue(b);
        rg.fillRect(x0, y + 1, w, lane - 2);
        if (b.kind === 'hurt' || b.kind === 'down') {
          // (a hit reaction: hatched, so that it reads apart from an action he chose)
          rg.fillStyle = 'rgba(9,10,17,.35)';
          for (let x = Math.ceil(x0 / 4) * 4; x < x0 + w; x += 4) rg.fillRect(x, y + 1, 1.5, lane - 2);
        }
        if (now) (rg.strokeStyle = '#f6f3ea'), (rg.lineWidth = 1.5), rg.strokeRect(x0 + 0.75, y + 1.75, w - 1.5, lane - 3.5);
        // (cut by a blow: its end struck off)
        if (b.cut && xOf(to) <= W) (rg.fillStyle = b.cut.power ? '#ffe9a8' : '#f6f3ea'), rg.fillRect(x1 - 2.5, y, 2.5, lane);
        const word = shortOf(b);
        if (x1 - x0 >= 14 && rg.measureText(word).width <= w - 4) (rg.fillStyle = '#090a11'), (rg.globalAlpha = past ? 0.6 : 1), rg.fillText(word, x0 + 2.5, L.feet ? y + lane / 2 + 0.5 : y + 7.5);
        rg.globalAlpha = 1;
      }
    }
    // (what came of each punch, at the step it came: along the foot of his lane, under the words)
    for (const i of [0, 1]) {
      const L = lanes[i ? 3 : 0],
        y = L.y + L.h - 5,
        other = i ? lanes[0].y + lanes[0].h : lanes[3].y;
      for (const b of plan.rails[i]) {
        if (b.kind !== 'attack' || !b.out) continue;
        const x = xOf(b.at);
        if (x < 4 || x > W) continue;
        rg.globalAlpha = b.at <= kf ? 1 : 0.7;
        if (b.out === 'hit') {
          if (b.cuts || b.power) (rg.strokeStyle = b.power ? '#ffe9a8' : 'rgba(246,243,234,.7)'), (rg.lineWidth = b.power ? 2 : 1), rg.beginPath(), rg.moveTo(x, y), rg.lineTo(x, other), rg.stroke();
          rg.fillStyle = b.power ? '#ffe9a8' : '#f6f3ea';
          rg.beginPath();
          rg.arc(x, y, b.power ? 3.6 : 2.4, 0, 7);
          rg.fill();
          rg.strokeStyle = '#090a11';
          rg.lineWidth = 1;
          rg.stroke();
        } else if (b.out === 'block') (rg.fillStyle = '#090a11'), rg.fillRect(x - 2, y - 3.5, 4, 7), (rg.fillStyle = '#f6f3ea'), rg.fillRect(x - 0.75, y - 3.5, 1.5, 7);
        else if (b.out === 'parry') (rg.strokeStyle = '#090a11'), (rg.lineWidth = 2), rg.beginPath(), rg.moveTo(x - 3, y - 3), rg.lineTo(x + 3, y + 3), rg.moveTo(x + 3, y - 3), rg.lineTo(x - 3, y + 3), rg.stroke();
        else (rg.strokeStyle = '#090a11'), (rg.lineWidth = 1.5), rg.beginPath(), rg.arc(x, y, 2.6, 0, 7), rg.stroke();
        rg.globalAlpha = 1;
      }
    }
    // (the knockdown, promised)
    if (plan.ko) {
      const x = xOf(plan.ko.step);
      if (x >= 4 && x <= W) (rg.fillStyle = '#ff5470'), rg.fillRect(x - 1, 0, 2, H);
    }
    rg.fillStyle = '#ffc24a';
    rg.fillRect(head - 1, 0, 2, H);
    rg.beginPath();
    rg.moveTo(head - 5, 0);
    rg.lineTo(head + 5, 0);
    rg.lineTo(head, 6);
    rg.fill();
  }
  let noteAt = null;
  function note() {
    const done = plan.rails.reduce((n, r) => n + r.filter(b => ACTS.includes(b.kind) && b.from < k).length, 0),
      walked = plan.feet.reduce((n, r) => n + r.filter(b => b.from < k).length, 0),
      text = `약속 → 기술 ${done}/${plan.count || 0} · 발 ${walked}/${plan.walked || 0}${plan.done ? '' : '…'}`;
    if (text !== noteAt) $('railnote').textContent = noteAt = text;
  }
  // the whole of it, the two men side by side in the order things start: what, and what came of it; footwork smaller
  function full() {
    const men = plan.men,
      rowsOf = [...plan.rails[0], ...plan.rails[1], ...plan.feet[0], ...plan.feet[1]].filter(b => b.kind !== 'down').sort((a, b) => a.from - b.from || a.who - b.who);
    $('fullmeta').textContent = men ? `대련 #${plan.seed} · ${CORNER[0]} ${shown(men[0].grade)} 대 ${CORNER[1]} ${shown(men[1].grade)} · 시작 체력 둘 다 ${plan.hp} · 기술 ${plan.count || 0}개 · 풋워크 ${plan.walked || 0}개${plan.done ? '' : ' · 짜는 중…'}` : '짜는 중…';
    $('fullrows').innerHTML = rowsOf
      .map(b => {
        const to = b.to ?? plan.inputs.length,
          state = to <= k || phase === 'over' ? 'done' : b.from <= k ? 'now' : 'ahead',
          said = saidOf(b),
          cell = `<span class="c" style="--c:${hue(b)}">${b.kind === 'hurt' ? '<span class="cut">' + labelOf(b) + '</span>' : labelOf(b)}${said ? ` <span class="${b.cut && !(b.kind === 'attack' && b.out) ? 'cut' : 'said'}">${said}</span>` : ''}</span>`;
        return `<li class="${state}${b.down ? ' ko' : ''}${b.kind === 'step' ? ' f' : ''}"><span class="t">${tenth(b.from)}</span>${b.who ? '<span></span>' + cell : cell + '<span></span>'}</li>`;
      })
      .join('');
    const at = $('fullrows').querySelector('.now') || $('fullrows').querySelector('.ahead');
    if (at && at.scrollIntoView) at.scrollIntoView({ block: 'center' });
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
    show('rails', true);
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
    show('rails', false);
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
    $('detail').textContent = `${ko.out ? '실신' : ko.liver ? '리버 다운' : '다운'} · ${Math.round(ko.J * (ko.counter ? RULES.counterGain : 1))} N·s${ko.counter ? ' 카운터' : ''} · 기술 ${plan.rails.reduce((n, r) => n + r.filter(b => ACTS.includes(b.kind) && b.from < ko.step).length, 0)} · 풋워크 ${plan.feet.reduce((n, r) => n + r.filter(b => b.from < ko.step).length, 0)} · 대련 #${plan.seed}`;
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
      if (phase === 'over' && resultAt === null && plan.ko && knock.shown(bout)) (resultAt = time), result();
      // (the rails under the playhead: between two steps as the picture is, held with a held blow)
      drawRails(Math.min(plan.inputs.length, k - 1 + (knock.playing || bout.stop > 0 ? 1 : Math.min(1, acc / DT))));
      note();
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

    // ---- the camera: one fixed angle that follows the two men (ANGLE); a bird's-eye view or a zoom where the round's
    // views say (rails.mjs viewsOf), eased; kept clear of the rails; cut for a knockdown's replay only
    const [a, b] = men,
      ease = q => 1 - Math.exp(-elapsed * q),
      apart = Math.hypot(b.x - a.x, b.z - a.z),
      playing = plan && (phase === 'play' || phase === 'over'),
      view = playing && !(phase === 'over' && resultAt !== null) ? plan.views.find(v => v.from <= k && k < v.to) : null,
      v = view ? ANGLE[view.kind] : { pitch: ANGLE.pitch, closer: 1 },
      narrow = R.target.w < R.target.h,
      // (as far off as frames the two of them: the same for any two men within a step of each other, further only as they part)
      base = Math.max(5.2, Math.min(narrow ? 12.5 : 11, R.distFor(Math.max(apart, 1.4) + 3.6))),
      replayCam = knock.camera(cam.dist, played),
      box = $('rails').classList.contains('on') ? $('rails').getBoundingClientRect() : null,
      H = canvas.clientHeight || 1,
      // (the rails: the men drawn up and away from them, by as much of the picture as they cover)
      up = box ? ((H - box.top) / H) * 0.9 : 0,
      to = [((a.x + b.x) / 2) * 0.85, 0.8 - up * (view && view.kind === 'zoom' ? 0.6 : 1), ((a.z + b.z) / 2) * 0.85];
    cam.view = view ? view.kind : null;
    // (the first picture is framed at once, not eased into from nowhere)
    if (!replayCam && stats.frames === 0) (cam.dist = base * v.closer), (cam.pitch = v.pitch), cam.target.splice(0, 3, ...to);
    if (!replayCam) {
      cam.yaw = ANGLE.yaw;
      cam.dist += (base * v.closer - cam.dist) * ease(ANGLE.ease);
      cam.pitch += (v.pitch - cam.pitch) * ease(ANGLE.ease);
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
  const openFull = () => plan && plan.rails[0].length && (show('full', true), full(), document.querySelector('#full button').focus());
  $('rails').addEventListener('click', openFull);
  $('rails').addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openFull()));
  addEventListener('keydown', e => e.key === 'Escape' && $('full').classList.contains('on') && (show('full', false), $('rails').focus()));
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
