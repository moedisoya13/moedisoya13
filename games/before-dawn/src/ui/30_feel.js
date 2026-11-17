// Combat feel (docs/prior/art-direction.md §3, GDD §9.2 "월드의 연출"):
//  - hit-stop on kills, heavy hits and hurts (the world holds for a few frames)
//  - ink splats baked onto the floor where enemies fall (they stay for the whole floor)
//  - hand-lettered sound words on kills and heavy hits only (촤악! 쾅! 팅! …)
//  - hurt: red halftone edge, 0.1 s shake (settings.shake), damage number
//  - the night brightening toward 06:00, and the screen edges burning after dawn
//  - the endings: speed lines on the win, ink closing in on the death
// The washes are drawn as the lowest HUD layer (under the HUD boxes, over the world).
// Particles go through the engine's pool (cap 300); letterings keep their own list (cap 10).

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const M = BD.math;
const FEEL = BD.ui.feel = {};
const rng = K.rng;

const typeOf = (kind) => (BD.enemies.has(kind) ? BD.enemies.get(kind).type : null);
const settings = (ui) => ui.app.save.settings;

// ---- hit-stop ---------------------------------------------------------------------------------
// The shell holds the world while ui.hold > 0 (real seconds; no ticks are skipped or added).
// Only at speed 1: test runs at higher speeds are left alone. A short cooldown after each hold
// keeps chains of kills from freezing the game.
const HS = { active: false, cool: 0 };
const shellUi = () => (BD.client && BD.client.shell && BD.client.shell.ui) || null;
FEEL.hitstop = function (sec, force) {
  const ui = shellUi(), p = typeof window !== 'undefined' && window.__BD && window.__BD.params;
  if (!ui || !p) return;
  if (!(ui.hold > 0) && (p.speed !== 1 || (!force && HS.cool > 0))) return;
  ui.hold = Math.max(ui.hold, sec); HS.active = true;
};
function updateHitstop(dt) {
  if (HS.cool > 0) HS.cool -= dt;
  const ui = shellUi();
  if (HS.active && !(ui && ui.hold > 0)) { HS.active = false; HS.cool = 0.12; }
}
FEEL.releaseHitstop = function () { const ui = shellUi(); if (ui) ui.hold = 0; HS.active = false; };

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

// ---- ink splats (baked into this floor's decal layer) -------------------------------------------
const floorClip = { key: null, path: null };
function clipToFloor(g, v, w) {
  const key = w.seed + ':' + w.floorN + ':' + v.rox + ':' + v.roy;
  if (floorClip.key !== key && typeof Path2D !== 'undefined') {
    const p = new Path2D();
    for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
      if (w.grid.get(x, y) === BD.CELL.VOID) continue;
      const a = v.proj(x, y), b = v.proj(x + 1, y), c = v.proj(x + 1, y + 1), d = v.proj(x, y + 1);
      p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath();
    }
    floorClip.key = key; floorClip.path = p;
  }
  if (floorClip.key === key && floorClip.path) g.clip(floorClip.path);
}
// size in px; (dx, dy) world direction the ink flies (away from the blade)
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
    // main blob: an irregular flattened polygon
    g.beginPath();
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = size * r.range(0.55, 1.0);
      const px = sx + Math.cos(a) * rr + ux * size * 0.25, py = sy + Math.sin(a) * rr * 0.5 + uy * size * 0.12;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    // streaks thrown along the cut
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(uy, ux) + r.range(-0.5, 0.5), L = size * r.range(1.2, 2.4), wdt = size * r.range(0.12, 0.22);
      const ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L * 0.5;
      const nx = -Math.sin(a) * wdt, ny = Math.cos(a) * wdt * 0.5;
      g.beginPath(); g.moveTo(sx + nx, sy + ny); g.lineTo(ex, ey); g.lineTo(sx - nx, sy - ny); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(ex + Math.cos(a) * 4, ey + Math.sin(a) * 2, wdt * 0.7, wdt * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    // droplets
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
const KILL_WORDS = ['촤악!', '서걱!', '콰직!'];

// ---- screen washes ------------------------------------------------------------------------------
const WASH = { hurt: 0, flash: 0, flashColor: '#ffffff', ending: 0 };
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
// The night lightens toward 06:00 (from 03:00) and the edges burn after dawn (GDD §3.6).
function drawDawn(g, ui, w) {
  const cm = BD.flow.clockMin(w);
  const k = K.clamp((cm - 540) / 180, 0, 1);
  if (k > 0) {
    for (const cx of [0, C.VIEW_W]) {
      const gr = g.createRadialGradient(cx, C.VIEW_H + 40, 20, cx, C.VIEW_H + 40, 520);
      gr.addColorStop(0, 'rgba(255,190,120,' + (0.34 * k) + ')');
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = gr; g.fillRect(cx ? C.VIEW_W - 560 : 0, C.VIEW_H - 520, 560, 520);
    }
    g.fillStyle = 'rgba(255,214,170,' + (0.07 * k) + ')'; g.fillRect(0, 0, C.VIEW_W, 64);
  }
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
    FEEL.releaseHitstop();
  },
  on: {
    hit(ev, ui) {
      const big = ev.direct && ev.dmg >= 25;
      const w = ui.world;
      if (ev.direct) {
        for (let i = 0; i < (big ? 7 : 3); i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 22, vx: rng.range(-2.4, 2.4), vy: rng.range(-2.4, 2.4), vz: rng.range(60, 150), g: 420, life: 0.4, color: K.INK, size: big ? 4 : 3 });
        if (ev.dmg >= 14 && rng.next() < 0.35) {
          const h = w.hero;
          FEEL.splat(ui, ev.x, ev.y, 6 + Math.min(10, ev.dmg * 0.2), ev.x - h.x, ev.y - h.y, 0.75);
        }
      }
      if (big) {
        FEEL.letter(ui, '쾅!', ev.x, ev.y, { size: 44, z: 80 });
        FEEL.hitstop(0.06);
        FEEL.shake(4, 0.08);
      }
    },
    kill(ev, ui) {
      const w = ui.world, h = w.hero;
      const e = BD.W.enemyById(w, ev.enemyId);
      const r = e ? e.r : 0.4;
      const heavy = ev.guardian || ev.boss || ev.elite;
      FEEL.splat(ui, ev.x, ev.y, 14 + r * 14 + (heavy ? 14 : 0), ev.x - h.x, ev.y - h.y);
      for (let i = 0; i < (heavy ? 14 : 8); i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 26, vx: rng.range(-3, 3), vy: rng.range(-3, 3), vz: rng.range(80, 200), g: 480, life: 0.5, color: K.INK, size: rng.range(3, 5.5) });
      if (heavy) {
        FEEL.letter(ui, ev.boss ? '촤아악!' : '촤악!', ev.x, ev.y, { size: ev.boss ? 76 : 60, z: 100, always: true, life: 1.0 });
        FEEL.hitstop(ev.boss ? 0.2 : 0.14, true);
        FEEL.shake(ev.boss ? 12 : 7, 0.2);
      } else {
        FEEL.letter(ui, KILL_WORDS[Math.floor(rng.next() * KILL_WORDS.length)], ev.x, ev.y, { size: 40 });
        FEEL.hitstop(0.045);
      }
    },
    guard(ev, ui) {
      FEEL.letter(ui, '팅!', ev.x, ev.y, { size: 36, fill: '#e6f2ff', fill2: '#9fc3e6', z: 76 });
      for (let i = 0; i < 6; i++) ui.fx.emit({ x: ev.x, y: ev.y, z: 40, vx: rng.range(-4, 4), vy: rng.range(-4, 4), vz: rng.range(40, 140), g: 300, life: 0.3, color: '#ffffff', size: 2.5 });
    },
    slam(ev, ui) {
      FEEL.letter(ui, '쿵!', ev.x, ev.y, { size: 42, always: true });
      FEEL.shake(5, 0.12); FEEL.hitstop(0.05);
    },
    steam(ev, ui) {
      FEEL.letter(ui, '치익!', ev.x, ev.y, { size: 32, fill: '#ffffff', fill2: '#cfd8e0', z: 60 });
      for (let i = 0; i < 10; i++) ui.fx.emit({ x: ev.x + rng.range(-0.6, 0.6), y: ev.y + rng.range(-0.6, 0.6), z: 10, vx: rng.range(-0.6, 0.6), vy: rng.range(-0.6, 0.6), vz: rng.range(40, 90), g: -20, life: 0.7, color: 'rgba(245,245,245,0.85)', size: rng.range(7, 12) });
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
      const col = ev.source === 'leech' || ev.source === 'kings_hunt' ? K.GREEN : ev.source === 'flask' ? '#8fd3ff' : K.DAWN;
      const show = () => ui.fx.emit({ x: h.x, y: h.y, z: 110, vz: 40, life: 0.9, shape: 'text', text: '+' + ev.amount, color: col, size: 26 });
      // card heals: the card usually draws its own green number (vfx leech_heal / royal_heal);
      // ours waits for the end of the tick and is dropped if the card's arrived
      if (ev.source === 'leech' || ev.source === 'kings_hunt') HEALQ.push(show); else show();
    },
    vfx(ev) { if (/heal/.test(ev.kind)) HEALQ.length = 0; },
    pickup(ev, ui) {
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
    boss_phase(ev, ui) { FEEL.shake(10, 0.4); WASH.flash = 0.25; WASH.flashColor = '#e6d6ff'; },
    dawn(ev, ui) { WASH.flash = 0.45; WASH.flashColor = '#fff1cf'; },
    death(ev, ui) { FEEL.releaseHitstop(); },
    win(ev, ui) { FEEL.releaseHitstop(); WASH.flash = 0.4; WASH.flashColor = '#fff6e0'; },
  },
  update(dt, ui) {
    for (const f of HEALQ) f();
    HEALQ.length = 0;
    updateHitstop(dt);
    if (ui.app.mode !== 'play') { FEEL.releaseHitstop(); SHK.t = 0; }
    updateShake(dt, ui);
    if (WASH.hurt > 0) WASH.hurt -= dt;
    if (WASH.flash > 0) WASH.flash -= dt;
  },
  draw(g, ui, layer) {
    if (ui.app.mode !== 'play' || !ui.world) return;
    if (layer === 'world') drawLetters(g, ui);
  },
});

// Screen washes (dawn light, hurt edge, flashes, the endings) sit between the world and the HUD,
// so the HP bar, the clock and the card slots stay readable through them.
BD.ui.hud.register({
  id: 'washes',
  order: 1,
  draw(g, ui) {
    const w = ui.world;
    if (!w || ui.app.overlay()) return;
    drawDawn(g, ui, w);
    if (WASH.hurt > 0) {
      const k = WASH.hurt / 0.32;
      edgeBand(g, '#d62828', 14, 0.55 * k);
      halftoneEdge(g, '#d62828', 70, 0.7 * k);
    }
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
