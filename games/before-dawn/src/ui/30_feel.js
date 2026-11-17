// Combat feel (docs/prior/art-direction.md §3, GDD §9.2 "월드의 연출", GDD-V2 §7): the more often a
// thing happens, the cheaper and shorter its feedback; the rarer, the bigger. 150–330 kills a minute
// must not turn into noise, and a phone must hold 60 fps with a hundred enemies on the floor.
//  - kills by role (§7.1): fodder — ≤ 3 ink motes for 0.15 s and a small ink mark, no word, no stop;
//    four or more by one swing or one blast in one tick — one 촤악! at their centre, 2 px shake,
//    30 ms stop; a threat — a sound word (쾅! 서걱!) and a bigger mark; an elite — 0.2 s slow motion
//    (×0.5) and a 60 ms stop; a guardian — 120 ms stop, 0.6 s slow motion (×0.4); the boss as before
//  - ink marks on the floor: a pool of at most 150 pre-drawn splats, the oldest fading out as new
//    ones come (§3.7: not baked into a floor-wide canvas — the floors are big); only guardians and
//    the boss leave a permanent baked splat
//  - hit-stop and slow motion are the shell holding frames (ui.hold): no tick is skipped or added
//  - hurt: red halftone edge, 0.1 s shake (settings.shake), damage number; HP ≤ 30: the edges pulse
//    red slowly; the screen edges burning after dawn; the endings (speed lines / ink closing in)
//  - a particle budget on top of the engine's 300 cap: kill and hit motes thin out past 180 alive
// The washes are drawn as the lowest HUD layer (under the HUD boxes, over the world).
// Letterings keep their own list (cap 10, one new word per 0.12 s unless it must show).

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const M = BD.math;
const FEEL = BD.ui.feel = {};
const rng = K.rng;

const settings = (ui) => ui.app.save.settings;
const params = () => (typeof window !== 'undefined' && window.__BD && window.__BD.params) || null;

// ---- hit-stop and slow motion ------------------------------------------------------------------
// The shell holds the world while ui.hold > 0 (real seconds; no ticks are skipped or added).
// Only at speed 1: test runs at higher speeds are left alone. A short cooldown after each hold
// keeps chains of kills from freezing the game. Slow motion (×k for sec) lets the world step on a
// share k of the frames and holds the others for one frame each.
const HS = { active: false, cool: 0 };
const SLOW = { k: 1, until: -1, credit: 0 };
const shellUi = () => (BD.client && BD.client.shell && BD.client.shell.ui) || null;
FEEL.hitstop = function (sec, force) {
  const ui = shellUi(), p = params();
  if (!ui || !p) return;
  if (!(ui.hold > 0) && (p.speed !== 1 || (!force && HS.cool > 0))) return;
  ui.hold = Math.max(ui.hold, sec); HS.active = true;
};
FEEL.slowmo = function (k, sec) {
  const ui = shellUi(), p = params();
  if (!ui || !p || p.speed !== 1) return;
  const until = ui.time + Math.max(0, ui.hold) + sec;
  if (until > SLOW.until || k < SLOW.k) { SLOW.k = Math.min(k, SLOW.until > ui.time ? SLOW.k : 1); SLOW.until = Math.max(until, SLOW.until); SLOW.credit = 0; }
};
FEEL.slowActive = (ui) => SLOW.until > ui.time;
function updateHitstop(dt, ui) {
  if (HS.cool > 0) HS.cool -= dt;
  if (HS.active && !(ui && ui.hold > 0)) { HS.active = false; HS.cool = 0.12; }
  // slow motion decides whether the next frame steps the world
  if (SLOW.until > ui.time && ui.app.mode === 'play' && !ui.app.overlay()) {
    SLOW.credit += SLOW.k;
    if (SLOW.credit >= 1) SLOW.credit -= 1;
    else if (!(ui.hold > 0)) ui.hold = 1e-6; // held for exactly one frame
  } else if (SLOW.until <= ui.time) { SLOW.k = 1; SLOW.credit = 0; }
}
FEEL.releaseHitstop = function () { const ui = shellUi(); if (ui) ui.hold = 0; HS.active = false; SLOW.until = -1; SLOW.k = 1; };

// ---- shake -------------------------------------------------------------------------------------
const SHK = { t: 0, dur: 0, amp: 0 };
FEEL.shake = function (amp, dur) { if (amp >= SHK.amp * (SHK.t / Math.max(0.001, SHK.dur))) { SHK.amp = amp; SHK.dur = dur; SHK.t = dur; } };
function updateShake(dt, ui) {
  const cam = ui.camera;
  if (SHK.t > 0 && settings(ui).shake) {
    SHK.t -= dt;
    const k = Math.max(0, SHK.t / SHK.dur);
    cam.x = (rng.next() * 2 - 1) * SHK.amp * k;
    cam.y = (rng.next() * 2 - 1) * SHK.amp * k * 0.7;
  } else { SHK.t = 0; cam.x = 0; cam.y = 0; }
}

// ---- particles: the engine's pool (cap 300) with a budget so kills never crowd out the rest -----
FEEL.budget = function (n) {
  const live = BD.client.fx.list.length;
  if (live > 240) return 0;
  if (live > 180) return Math.min(n, 1);
  return n;
};

// ---- ink marks ---------------------------------------------------------------------------------------
// Splat sprites: 3 shapes × 8 screen directions, drawn once (ink blob, streaks thrown along the cut,
// droplets; flattened 2:1 for the floor). A mark is {x, y, size, sprite, a}; drawn under the actors.
const MARK_CAP = 150, FADE_N = 30;
const MARKS = [];
let sprites = null;
function makeSprites() {
  const out = [], R = 20, SC = 2; // base radius 20 px, drawn at ×2 for crispness
  for (let shape = 0; shape < 3; shape++) {
    for (let d = 0; d < 8; d++) {
      const a = (d / 8) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a) * 0.5;
      const cv = document.createElement('canvas');
      cv.width = R * 7 * SC; cv.height = R * 4 * SC;
      const g = cv.getContext('2d'), cx = cv.width / 2, cy = cv.height / 2;
      g.scale(SC, SC);
      const x0 = cx / SC, y0 = cy / SC, r = BD.Rng(1000 + shape * 31 + d);
      g.fillStyle = '#0a0a0c';
      g.beginPath();
      for (let i = 0; i <= 11; i++) {
        const t = (i / 11) * Math.PI * 2, rr = R * r.range(0.55, 1.0);
        const px = x0 + Math.cos(t) * rr + ux * R * 0.25, py = y0 + Math.sin(t) * rr * 0.5 + uy * R * 0.25;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      for (let i = 0; i < 3; i++) {
        const t = Math.atan2(uy, ux) + r.range(-0.5, 0.5), L = R * r.range(1.2, 2.3), wd = R * r.range(0.12, 0.22);
        const ex = x0 + Math.cos(t) * L, ey = y0 + Math.sin(t) * L * 0.5, nx = -Math.sin(t) * wd, ny = Math.cos(t) * wd * 0.5;
        g.beginPath(); g.moveTo(x0 + nx, y0 + ny); g.lineTo(ex, ey); g.lineTo(x0 - nx, y0 - ny); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(ex + Math.cos(t) * 4, ey + Math.sin(t) * 2, wd * 0.7, wd * 0.4, 0, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 6; i++) {
        const t = Math.atan2(uy, ux) + r.range(-1.6, 1.6), L = R * r.range(1.1, 2.6), rr = r.range(1.3, 3.4);
        g.beginPath(); g.ellipse(x0 + Math.cos(t) * L, y0 + Math.sin(t) * L * 0.5, rr, rr * 0.6, 0, 0, Math.PI * 2); g.fill();
      }
      out.push({ cv, w: cv.width / SC, h: cv.height / SC, R });
    }
  }
  return out;
}
// size in px (radius); (dx, dy) world direction the ink flies (away from the blade)
FEEL.mark = function (ui, x, y, size, dx, dy, alpha) {
  const v = ui.view;
  const [vx, vy] = v.worldDirToScreen(dx || 0, dy || 0);
  const d = (Math.round((Math.atan2(vy * 2, vx) / (Math.PI * 2)) * 8) + 8) % 8;
  MARKS.push({ x, y, size, sprite: Math.floor(rng.next() * 3) * 8 + d, a: alpha || 0.8 });
  if (MARKS.length > MARK_CAP) MARKS.splice(0, MARKS.length - MARK_CAP);
};
FEEL.marks = MARKS;
function drawMarks(g, ui, w) {
  if (!MARKS.length) return;
  if (!sprites) sprites = makeSprites();
  const v = ui.view, R = BD.client.render;
  g.save();
  R.clipFloor(g, v, w);
  const n = MARKS.length;
  for (let i = 0; i < n; i++) {
    const m = MARKS[i];
    if (!R.flatOn(v, m.x, m.y, 1.5)) continue;
    const s = sprites[m.sprite], k = m.size / s.R, [px, py] = v.proj(m.x, m.y);
    const fade = n > MARK_CAP - FADE_N ? Math.min(1, (i + 1) / FADE_N) : 1; // the oldest thin out
    g.globalAlpha = m.a * fade;
    g.drawImage(s.cv, px - (s.w * k) / 2, py - (s.h * k) / 2, s.w * k, s.h * k);
  }
  g.restore();
  g.globalAlpha = 1;
}

// A permanent splat baked into this floor's decal layer (guardian, boss: rare, worth keeping).
function clipToFloor(g, v, w) { BD.client.render.clipFloor(g, v, w); }
FEEL.splat = function (ui, x, y, size, dx, dy, alpha) {
  const w = ui.world;
  if (!w || !w.grid) return;
  const seed = rng.next();
  ui.render.bake((g, v) => {
    const [sx, sy] = v.proj(x, y);
    const [vx, vy0] = v.worldDirToScreen(dx || 0, dy || 0);
    const vl = Math.hypot(vx, vy0) || 1, ux = vx / vl, uy = vy0 / vl;
    const r = BD.Rng(Math.floor(seed * 1e9));
    g.save();
    clipToFloor(g, v, w);
    g.fillStyle = 'rgba(10,10,12,' + (alpha || 0.86) + ')';
    g.beginPath();
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = size * r.range(0.55, 1.0);
      const px = sx + Math.cos(a) * rr + ux * size * 0.25, py = sy + Math.sin(a) * rr * 0.5 + uy * size * 0.12;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(uy, ux) + r.range(-0.5, 0.5), L = size * r.range(1.2, 2.4), wdt = size * r.range(0.12, 0.22);
      const ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L * 0.5;
      const nx = -Math.sin(a) * wdt, ny = Math.cos(a) * wdt * 0.5;
      g.beginPath(); g.moveTo(sx + nx, sy + ny); g.lineTo(ex, ey); g.lineTo(sx - nx, sy - ny); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(ex + Math.cos(a) * 4, ey + Math.sin(a) * 2, wdt * 0.7, wdt * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    const drops = 5 + Math.floor(r.next() * 5);
    for (let i = 0; i < drops; i++) {
      const a = Math.atan2(uy, ux) + r.range(-1.6, 1.6), L = size * r.range(1.1, 2.8), rr = r.range(1.3, 3.6) * (size / 16);
      g.beginPath(); g.ellipse(sx + Math.cos(a) * L, sy + Math.sin(a) * L * 0.5, rr, rr * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  });
};

// ---- letterings (sound words) ------------------------------------------------------------------
FEEL.letter = function (ui, text, x, y, o) {
  o = o || {};
  const L = S.letters;
  if (!o.always && L.length && ui.time - L[L.length - 1].born < 0.12) return;
  L.push({ text, x, y, z: o.z || 70, born: ui.time, life: o.life || 0.75, size: o.size || 40, rot: (rng.next() - 0.5) * 0.35, fill: o.fill || K.PAPER, fill2: o.fill2 || '#ffd24a', screen: !!o.screen });
  if (L.length > 10) L.splice(0, L.length - 10);
};
function drawLetters(g, ui) {
  const v = ui.view;
  for (const l of S.letters) {
    const age = ui.time - l.born, k = age / l.life;
    if (k >= 1) continue;
    const pop = age < 0.08 ? 1.45 - (age / 0.08) * 0.45 : 1;
    const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const [x, y] = l.screen ? [l.x, l.y] : v.proj(l.x, l.y, l.z + age * 30);
    K.letter(g, l.text, x, y, { size: l.size, fill: l.fill, fill2: l.fill2, rot: l.rot, scale: pop, alpha: a });
  }
  S.letters = S.letters.filter((l) => ui.time - l.born < l.life);
}
const THREAT_WORDS = ['쾅!', '서걱!'];

// ---- kills grouped by tick: four or more by one swing or one blast is a multi-kill (§7.1) --------
const GROUP = { t: -1, by: {} };
const groupKey = (src) => (BD.combat.isDirect(src) ? 'strike' : src === 'burn' || src === 'steam' ? null : src);
function groupKill(w, ev) {
  if (GROUP.t !== w.t) { GROUP.t = w.t; GROUP.by = {}; }
  const key = groupKey(ev.source || 'slash');
  if (!key) return;
  const gr = GROUP.by[key] || (GROUP.by[key] = { n: 0, x: 0, y: 0 });
  gr.n++; gr.x += ev.x; gr.y += ev.y;
}
const MK = { last: -9 };
function closeGroups(ui) {
  let best = null;
  for (const k of Object.keys(GROUP.by)) { const gr = GROUP.by[k]; if (gr.n >= 4 && (!best || gr.n > best.n)) best = gr; }
  GROUP.by = {};
  if (!best || ui.time - MK.last < 0.45) return; // one word at a time
  MK.last = ui.time;
  FEEL.letter(ui, '촤악!', best.x / best.n, best.y / best.n, { size: 54 + Math.min(16, (best.n - 4) * 2), z: 90, always: true, life: 0.8 });
  FEEL.shake(2, 0.08); FEEL.hitstop(0.03, true); ui.sfxSafe('multi_kill');
  FEEL.multiKills = (FEEL.multiKills || 0) + 1;
}

// ---- screen washes ------------------------------------------------------------------------------
const WASH = { hurt: 0, flash: 0, flashColor: '#ffffff', ending: 0 };
FEEL.wash = WASH;
const HEALQ = [];
function edgeBand(g, color, wdt, alpha) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, C.VIEW_W, wdt); g.fillRect(0, C.VIEW_H - wdt, C.VIEW_W, wdt);
  g.fillRect(0, wdt, wdt, C.VIEW_H - 2 * wdt); g.fillRect(C.VIEW_W - wdt, wdt, wdt, C.VIEW_H - 2 * wdt);
  g.globalAlpha = 1;
}
function halftoneEdge(g, color, wdt, alpha) {
  g.save();
  g.beginPath(); g.rect(0, 0, C.VIEW_W, C.VIEW_H); g.rect(wdt, wdt, C.VIEW_W - 2 * wdt, C.VIEW_H - 2 * wdt);
  g.clip('evenodd');
  g.globalAlpha = alpha; g.fillStyle = K.halftone(g, color, 8); g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  g.restore();
}
FEEL.edgeBand = edgeBand; FEEL.halftoneEdge = halftoneEdge;
// The edges burn after dawn (GDD §3.6). The night lightening toward 06:00 is the engine's sky
// and skyline (src/client/30_render.js).
function drawDawn(g, ui, w) {
  const over = w.t - w.mods.runSec;
  if (over >= 0) {
    const pulse = 0.5 + 0.5 * Math.sin(ui.time * 3);
    const s = Math.min(1, 0.45 + over / 90);
    edgeBand(g, '#fff1cf', 10 + 8 * s, (0.35 + 0.25 * pulse) * s);
    halftoneEdge(g, '#ffe2a8', 40 + 30 * s, 0.55 * s);
  }
}

// ---- the effect ---------------------------------------------------------------------------------------
BD.ui.effects.register({
  id: 'feel',
  reset(ui) {
    S.letters = []; WASH.hurt = 0; WASH.flash = 0; WASH.ending = 0; SHK.t = 0;
    MARKS.length = 0; GROUP.t = -1; GROUP.by = {}; FEEL.multiKills = 0;
    FEEL.releaseHitstop();
  },
  on: {
    hit(ev, ui) {
      const big = ev.direct && ev.dmg >= 25;
      const w = ui.world;
      if (ev.direct) {
        const n = FEEL.budget(big ? 6 : 2);
        for (let i = 0; i < n; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 22, vx: rng.range(-2.4, 2.4), vy: rng.range(-2.4, 2.4), vz: rng.range(60, 150), g: 420, life: 0.3, color: K.INK, size: big ? 4 : 3 });
        if (ev.dmg >= 14 && rng.next() < 0.3) { const h = w.hero; FEEL.mark(ui, ev.x, ev.y, 6 + Math.min(10, ev.dmg * 0.2), ev.x - h.x, ev.y - h.y, 0.7); }
      }
      if (big) {
        FEEL.letter(ui, '쾅!', ev.x, ev.y, { size: 44, z: 80 });
        FEEL.hitstop(0.05);
        FEEL.shake(4, 0.08);
      }
    },
    tick(ev, ui) { if (Object.keys(GROUP.by).length) closeGroups(ui); },
    kill(ev, ui) {
      const w = ui.world, h = w.hero;
      const e = BD.W.enemyById(w, ev.enemyId);
      const r = e ? e.r : 0.4, role = ev.boss ? 'boss' : ev.guardian ? 'guardian' : ev.elite ? 'elite' : e && e.role === 'fodder' ? 'fodder' : 'threat';
      groupKill(w, ev);
      const dx = ev.x - h.x, dy = ev.y - h.y;
      if (role === 'fodder') {
        // §7.1 fodder: the hit's white flash (engine), ≤ 3 ink motes for 0.15 s, a small mark; no word, no stop
        FEEL.mark(ui, ev.x, ev.y, 5 + r * 6, dx, dy, 0.42);
        const n = FEEL.budget(3);
        for (let i = 0; i < n; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 22, vx: rng.range(-3, 3), vy: rng.range(-3, 3), vz: rng.range(60, 140), g: 520, life: 0.15, color: K.INK, size: rng.range(3, 4.5) });
        return;
      }
      if (role === 'threat') {
        FEEL.mark(ui, ev.x, ev.y, 13 + r * 12, dx, dy, 0.85);
        const n = FEEL.budget(8);
        for (let i = 0; i < n; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 26, vx: rng.range(-3, 3), vy: rng.range(-3, 3), vz: rng.range(80, 200), g: 480, life: 0.45, color: K.INK, size: rng.range(3, 5.5) });
        FEEL.letter(ui, THREAT_WORDS[Math.floor(rng.next() * THREAT_WORDS.length)], ev.x, ev.y, { size: 42 });
        return;
      }
      // elite / guardian / boss: the big ones
      if (role === 'elite') FEEL.mark(ui, ev.x, ev.y, 28 + r * 14, dx, dy, 0.9);
      else FEEL.splat(ui, ev.x, ev.y, 28 + r * 14, dx, dy);
      for (let i = 0; i < 14; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 26, vx: rng.range(-3, 3), vy: rng.range(-3, 3), vz: rng.range(80, 200), g: 480, life: 0.5, color: K.INK, size: rng.range(3, 5.5) });
      FEEL.letter(ui, role === 'boss' ? '촤아악!' : '촤악!', ev.x, ev.y, { size: role === 'boss' ? 76 : role === 'guardian' ? 66 : 58, z: 100, always: true, life: 1.0 });
      if (role === 'elite') { FEEL.hitstop(0.06, true); FEEL.slowmo(0.5, 0.2); FEEL.shake(6, 0.16); }
      else if (role === 'guardian') { FEEL.hitstop(0.12, true); FEEL.slowmo(0.4, 0.6); FEEL.shake(9, 0.2); }
      else { FEEL.hitstop(0.2, true); FEEL.shake(12, 0.2); }
    },
    guard(ev, ui) {
      FEEL.letter(ui, '팅!', ev.x, ev.y, { size: 36, fill: '#e6f2ff', fill2: '#9fc3e6', z: 76 });
      const n = FEEL.budget(6);
      for (let i = 0; i < n; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 40, vx: rng.range(-4, 4), vy: rng.range(-4, 4), vz: rng.range(40, 140), g: 300, life: 0.3, color: '#ffffff', size: 2.5 });
    },
    slam(ev, ui) {
      FEEL.letter(ui, '쿵!', ev.x, ev.y, { size: 42, always: true });
      FEEL.shake(5, 0.12); FEEL.hitstop(0.05);
    },
    steam(ev, ui) {
      FEEL.letter(ui, '치익!', ev.x, ev.y, { size: 32, fill: '#ffffff', fill2: '#cfd8e0', z: 60 });
      const n = FEEL.budget(10);
      for (let i = 0; i < n; i++) ui.fx.emit({ x: ev.x + rng.range(-0.6, 0.6), y: ev.y + rng.range(-0.6, 0.6), z: 10, vx: rng.range(-0.6, 0.6), vy: rng.range(-0.6, 0.6), vz: rng.range(40, 90), g: -20, life: 0.7, color: 'rgba(245,245,245,0.85)', size: rng.range(7, 12) });
    },
    hurt(ev, ui) {
      const h = ui.world.hero;
      WASH.hurt = 0.32;
      FEEL.shake(7, 0.1);
      FEEL.hitstop(0.075, true);
      ui.fx.emit({ x: h.x, y: h.y, z: 105, vz: 50, life: 0.8, shape: 'text', text: '-' + ev.dmg, color: '#ff5050', size: 26 });
      for (let i = 0; i < 6; i++) ui.fx.emit({ x: h.x, y: h.y, z: 50, vx: rng.range(-2, 2), vy: rng.range(-2, 2), vz: rng.range(60, 140), g: 420, life: 0.4, color: K.INK, size: 3.5 });
    },
    heal(ev, ui) {
      const h = ui.world.hero;
      const col = ev.source === 'leech' || ev.source === 'kings_hunt' ? K.GREEN : ev.source === 'flask' || ev.source === 'spring' ? '#8fd3ff' : K.DAWN;
      const show = () => ui.fx.emit({ x: h.x, y: h.y, z: 110, vz: 40, life: 0.9, shape: 'text', text: '+' + ev.amount, color: col, size: 26 });
      // card heals: the card usually draws its own green number (vfx leech_heal / royal_heal);
      // ours waits for the end of the tick and is dropped if the card's arrived
      if (ev.source === 'leech' || ev.source === 'kings_hunt') HEALQ.push(show); else show();
    },
    vfx(ev) { if (/heal/.test(ev.kind)) HEALQ.length = 0; },
    pickup(ev, ui) {
      if (ev.kind === 'shard' || ev.kind === 'halo' || ev.kind === 'holy_stone') return; // 63_growth.js, 31_feedback.js; flasks and kinds this branch does not know sparkle
      for (let i = 0; i < 10; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 14, vx: rng.range(-1.2, 1.2), vy: rng.range(-1.2, 1.2), vz: rng.range(60, 140), g: 200, life: 0.5, color: i % 2 ? '#8fd3ff' : '#ffffff', size: 3 });
    },
    dash(ev, ui) {
      for (let i = 0; i < 8; i++) {
        const k = i / 8;
        ui.fx.emit({ x: ev.fromX + (ev.toX - ev.fromX) * k, y: ev.fromY + (ev.toY - ev.fromY) * k, z: 4, vz: rng.range(10, 40), g: 60, life: 0.35, color: 'rgba(10,10,12,0.55)', size: rng.range(4, 7), layer: 'floor' });
      }
    },
    dodge(ev, ui) {
      const h = ui.world.hero;
      FEEL.letter(ui, '스윽', h.x, h.y, { size: 28, fill: '#e6f2ff', fill2: '#bcd2e6', z: 100, always: true, life: 0.5 });
    },
    rift(ev, ui) {
      for (let i = 0; i < 6; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 4, vx: rng.range(-0.8, 0.8), vy: rng.range(-0.8, 0.8), vz: rng.range(30, 90), g: 40, life: 0.8, color: ev.guardian ? '#ffd24a' : '#9b59d0', size: 3 });
    },
    floor_enter() { MARKS.length = 0; },
    boss_phase(ev, ui) { FEEL.shake(10, 0.4); WASH.flash = 0.25; WASH.flashColor = '#e6d6ff'; },
    dawn(ev, ui) { WASH.flash = 0.45; WASH.flashColor = '#fff1cf'; },
    death(ev, ui) { FEEL.releaseHitstop(); },
    win(ev, ui) { FEEL.releaseHitstop(); WASH.flash = 0.4; WASH.flashColor = '#fff6e0'; },
  },
  update(dt, ui) {
    for (const f of HEALQ) f();
    HEALQ.length = 0;
    updateHitstop(dt, ui);
    if (ui.app.mode !== 'play') { FEEL.releaseHitstop(); SHK.t = 0; }
    updateShake(dt, ui);
    if (WASH.hurt > 0) WASH.hurt -= dt;
    if (WASH.flash > 0) WASH.flash -= dt;
  },
  draw(g, ui, layer) {
    if (ui.app.mode !== 'play' || !ui.world) return;
    if (layer === 'floor') drawMarks(g, ui, ui.world);
    if (layer === 'world') drawLetters(g, ui);
  },
});

// Screen washes (dawn light, hurt edge, low HP, surge, flashes, the endings) sit between the world
// and the HUD, so the HP bar, the clock and the card slots stay readable through them. Nothing here
// covers the middle of the screen, where the enemies and their warnings are.
BD.ui.hud.register({
  id: 'washes',
  order: 1,
  draw(g, ui) {
    const w = ui.world;
    if (!w || ui.app.overlay()) return;
    drawDawn(g, ui, w);
    // §7.3: HP ≤ 30 — the edges pulse red, slowly
    if (w.hero.hp <= 30 && !w.hero.dead && !w.ending) {
      const p = 0.5 + 0.5 * Math.sin(ui.time * 3.2);
      halftoneEdge(g, '#d62828', 46 + 12 * p, 0.28 + 0.22 * p);
    }
    if (WASH.hurt > 0) {
      const k = WASH.hurt / 0.32;
      edgeBand(g, '#d62828', 14, 0.55 * k);
      halftoneEdge(g, '#d62828', 70, 0.7 * k);
    }
    if (BD.ui.fb && BD.ui.fb.drawWash) BD.ui.fb.drawWash(g, ui, w);
    if (WASH.flash > 0) { g.globalAlpha = Math.min(0.3, WASH.flash * 0.7); g.fillStyle = WASH.flashColor; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); g.globalAlpha = 1; }
    if (w.ending) {
      const tot = w.ending.kind === 'win' ? C.ENDING.win : C.ENDING.death;
      const k = 1 - w.ending.t / tot;
      if (w.ending.kind === 'win') {
        // radial ink speed lines toward the fallen king
        const boss = w.enemies.find((e) => e.boss) || w.hero;
        const [cx, cy] = ui.view.proj(boss.x, boss.y, 60);
        g.save(); g.globalAlpha = 0.55 * Math.min(1, k * 2);
        const r2 = BD.Rng(Math.floor(ui.time * 12));
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * M.TAU + r2.range(-0.05, 0.05), r0 = 160 + r2.range(0, 120), r1 = 900;
          const wd = r2.range(0.006, 0.018);
          K.poly(g, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a - wd) * r1, cy + Math.sin(a - wd) * r1], [cx + Math.cos(a + wd) * r1, cy + Math.sin(a + wd) * r1]]);
          g.fillStyle = K.INK; g.fill();
        }
        g.restore();
      } else {
        halftoneEdge(g, '#000000', 60 + 220 * k, 0.9 * k);
      }
    }
  },
});

// Last effect of every frame: closes the per-frame record of drawn text and buttons, and puts
// the keyboard focus on the first menu item whenever a screen or overlay opens.
let layerKey = null;
BD.ui.effects.register({
  id: 'zz_frame',
  draw(g, ui, layer) {
    if (layer !== 'screen') return;
    K.attach(ui); K.frameEnd();
    const key = ui.app.mode + '/' + (ui.app.overlay() || '');
    if (key !== layerKey) { layerKey = key; ui.focus = 0; }
  },
});
