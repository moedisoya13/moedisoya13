// Character animation (browser only): per hero/enemy, picks a clip from simulation state through
// BD.anim (src/core/07_anim.js: actions, fallback chain, frame math), advances it, and draws the
// frame — or the static sprite with procedural motion when there is no clip. Never touches the
// simulation.
//
// Timing
//   locomotion (idle/move loops, hurt, die): an animation clock = wall-clock dt while the world runs
//     (not paused, not in hit-stop) × the ?speed= factor; a move cycle runs at its fps × (measured
//     speed / the character's walking speed), clamped 0.55–1.5, so feet roughly keep to the ground
//   attack: from simulation timers — an enemy's wind-up frames (0..strike) follow its telegraph's
//     fill (1 − remain/total), the rest plays after telegraph_fire; the hero's follow his
//     auto-attack timer (BD.anim.heroAttackTiming), so the strike frame lands on the swing
// Scale: a frame is scaled so clip.charH equals the static sprite's on-screen height (× size).
// Code motion (no clip for the action): breathing (idle), walking bounce (move), lean-and-lunge
// (attack), shake (hurt), ink dissolve (death). Deaths leave a ghost — a client copy of the enemy
// at the moment it died — for its die clip's length or the 0.7 s dissolve; the simulation removed
// it already.
//
//   R.anim.drawEnemy(g, v, e, w, t, o) → box     R.anim.drawHero(g, v, w, t, pose, o, drawStatic)
//   R.anim.update(ui, dt) (drawWorld)            R.anim.onWorld(w) (subscribes to the bus)
//   R.anim.clip(char, name) → {def, img} | null  R.anim.drawFrame(g, v, def, img, f, x, y, o, scale)

const C = BD.C;
const M = BD.math;
const U = BD.ui;
const AS = BD.client.assets;
const R = BD.client.render;
const S = BD.anim;
const K = C.HERO.spriteH / 256;
const DISSOLVE = 0.7, HURT = 0.22, GHOST_FADE = 0.15;
// fodder (GDD-V2 §5.9 ②⑥, §7.1): a hit is the white flash and a 0.1u (≈ 6 px) recoil for 0.12 s; a death
// is a 0.18 s ink scatter in four bands with three motes (a die clip is sped up to end within 0.3 s)
const HURT_FODDER = 0.12, RECOIL = 6, DISSOLVE_FODDER = 0.18, DIE_FODDER = 0.3, MOTES = 9, MOTES_FODDER = 3;
const AN = R.anim = { clock: 0, st: new Map(), ghosts: [], fireT: new Map(), hurtT: new Map(), tgBy: new Map(), frame: 0 };
const meta = () => BD.animMeta || {};

AN.clip = function (char, name, tint) {
  const def = meta()[char] && meta()[char][name];
  const img = def && AS.anim[def.file];
  if (!img) return null;
  const tinted = tint ? baked.get(def.file + ':' + tint) : null; // baked once (below); until then as drawn
  return { def, img: tinted || img };
};

// ---- tint variants (GDD-V2 §5.9 ④, v2-enemies) --------------------------------------------------
// A variant with def.tint (squire 'steel', husk 'pale', mana_slime 'violet') is drawn from copies of its
// original's sprite and strips recoloured ONCE, when they have decoded — never per frame. The recipe
// is content's BD.render.tints[name] = {h, s, l0, l1, ink}: a pixel darker than `ink` (the ink line)
// keeps its colour; any other takes hue h, saturation s and lightness l0 + l1 × its own luminance.
// Static sprites get their own asset id `<sprite>@<tint>` (with the original's white silhouette and the
// tint's hue for the same-hue floor border); strips are keyed `<file>:<tint>`.
const baked = new Map();
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
function recolour(src, spec) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  try {
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (L < spec.ink) continue;
      const p = hsl(spec.h, spec.s, Math.min(0.97, spec.l0 + spec.l1 * L));
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
    }
    g.putImageData(im, 0, 0);
  } catch (err) { /* unreadable pixels: the copy keeps the original colours */ }
  return c;
}
AN.recolour = recolour;
let bakedSprites = false, bakedN = -1;
function bakeTints() {
  const T = BD.render.tints || {};
  const vars = BD.enemies.all().filter((d) => d.tint && T[d.tint]);
  if (!bakedSprites && AS.ready) {
    bakedSprites = true;
    for (const d of vars) {
      const id = d.sprite + '@' + d.tint;
      if (AS.img[id] || !AS.img[d.sprite]) continue;
      AS.img[id] = recolour(AS.img[d.sprite], T[d.tint]); AS.white[id] = AS.white[d.sprite]; AS.hue[id] = T[d.tint].h;
    }
  }
  const n = Object.keys(AS.anim).length;
  if (n === bakedN) return;
  bakedN = n;
  for (const d of vars) for (const clip of Object.values(meta()[d.variantOf] || {})) {
    const key = clip.file + ':' + d.tint;
    if (!baked.has(key) && AS.anim[clip.file]) baked.set(key, recolour(AS.anim[clip.file], T[d.tint]));
  }
}
// the sprite id an enemy is drawn with (its tinted copy once baked)
AN.lookOf = (e) => { const d = e.def; if (!d.tint) return d.sprite; const id = d.sprite + '@' + d.tint; return AS.img[id] ? id : d.sprite; };
// meta minus clips whose strip has not decoded yet (they fall back until it has)
let liveMeta = null, liveN = -1;
function live() {
  const n = Object.keys(AS.anim).length;
  if (n !== liveN) {
    liveN = n; liveMeta = {};
    for (const [c, clips] of Object.entries(meta())) for (const [k, d] of Object.entries(clips)) if (AS.anim[d.file]) (liveMeta[c] = liveMeta[c] || {})[k] = d;
  }
  return liveMeta;
}
AN.live = live;

// ---- per-frame bookkeeping ---------------------------------------------------------------------
AN.onWorld = function (w) {
  AN.st = new Map(); AN.ghosts = []; AN.fireT = new Map(); AN.hurtT = new Map();
  w.bus.on('telegraph_fire', (ev) => { if (ev.ownerId !== null) AN.fireT.set(ev.ownerId, w.t); });
  w.bus.on('hit', (ev) => { AN.hurtT.set(ev.enemyId, AN.clock); });
  w.bus.on('kill', (ev) => addGhost(w, ev));
  w.bus.on('floor_enter', () => { AN.ghosts = []; AN.st = new Map(); AN.fireT = new Map(); AN.hurtT = new Map(); });
};

function state(id, x, y) {
  let s = AN.st.get(id);
  // walkT starts at a different point of the cycle for every enemy, so a horde does not step in time
  // (GDD-V2 §5.9 ③)
  if (!s) { s = { x, y, speed: 0, moving: false, walkT: typeof id === 'number' ? (id * 0.6180339887) % 1 : 0, seen: AN.frame, last: null }; AN.st.set(id, s); }
  s.seen = AN.frame;
  return s;
}
function track(id, x, y, nominal, adt) {
  const s = state(id, x, y);
  if (adt > 0) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d > 3) s.speed = 0; // teleport, floor change
    else s.speed += (d / adt - s.speed) * (1 - Math.exp(-adt / 0.12));
    s.moving = s.moving ? s.speed > 0.25 : s.speed > 0.45;
    if (s.moving) s.walkT += adt * M.clamp(s.speed / Math.max(0.5, nominal), 0.55, 1.5);
  }
  s.x = x; s.y = y;
  return s;
}

AN.update = function (ui, dt) {
  const w = ui.app.world;
  const run = !ui.app.overlay() && !(ui.hold > 0) && !w.over;
  const adt = run ? dt * ((ui.app.params && ui.app.params.speed) || 1) : 0;
  AN.clock += adt; AN.adt = adt; AN.frame++;
  bakeTints();
  AN.tgBy = new Map();
  for (const tg of w.telegraphs) if (tg.ownerId !== null) { const c = AN.tgBy.get(tg.ownerId); if (!c || tg.remain < c.remain) AN.tgBy.set(tg.ownerId, tg); }
  track('hero', w.hero.x, w.hero.y, C.HERO.speed, adt);
  for (const e of w.enemies) if (!e.dead) track(e.id, e.x, e.y, e.speed, adt);
  if (AN.frame % 60 === 0) for (const [id, s] of AN.st) if (AN.frame - s.seen > 120) AN.st.delete(id);
  AN.ghosts = AN.ghosts.filter((gh) => AN.clock - gh.t0 < gh.dur);
};

// ---- frames ------------------------------------------------------------------------------------
// silhouettes of single frames (outline, hit flash, ink), cached, bounded by pixel count
const tints = new Map();
let tintPx = 0;
const TINT_BUDGET = 6e6;
function tintFrame(def, img, f, color) {
  const key = def.file + ':' + f + ':' + color;
  let c = tints.get(key);
  if (c) { tints.delete(key); tints.set(key, c); return c; }
  c = document.createElement('canvas'); c.width = def.fw; c.height = def.fh;
  const g = c.getContext('2d');
  g.drawImage(img, f * def.fw, 0, def.fw, def.fh, 0, 0, def.fw, def.fh);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, def.fw, def.fh);
  tints.set(key, c); tintPx += def.fw * def.fh;
  while (tintPx > TINT_BUDGET && tints.size > 1) { const [k0, c0] = tints.entries().next().value; tints.delete(k0); tintPx -= c0.width * c0.height; }
  return c;
}
AN.tintFrame = tintFrame;

// The static sprite's on-screen height for this character (frames are scaled to it).
const staticId = (char) => (char === 'hero' ? 'hero_side' : BD.enemies.has(char) ? BD.enemies.get(char).sprite : char);
AN.frameScale = (char, def, size) => { const im = AS.img[staticId(char)]; return im ? (im.height * K * (size || 1)) / def.charH : 0.5; };

// Draw frame f of a clip with its anchor at world (x, y). o as R.sprite: {flip, alpha, rot, sx, sy,
// lift, dx, dy, white, outline, outlinePx}. Returns a box like R.sprite's.
AN.drawFrame = function (g, v, def, img, f, x, y, o, s) {
  const p = v.proj(x, y, o.lift || 0);
  const dw = def.fw * s, dh = def.fh * s, ax = def.anchor[0] * s, ay = def.anchor[1] * s;
  g.save();
  g.translate(p[0] + (o.dx || 0), p[1] + (o.dy || 0));
  if (o.rot) g.rotate(o.rot);
  g.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.outline) {
    const d = o.outlinePx || 2, ol = R.outlineOf(tintFrame(def, img, f, o.outline), def.file + ':' + f + o.outline, s, d);
    g.drawImage(ol, -ax - d, -ay - d, dw + 2 * d, dh + 2 * d);
  }
  g.drawImage(img, f * def.fw, 0, def.fw, def.fh, -ax, -ay, dw, dh);
  if (o.white > 0) { g.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * o.white; g.drawImage(tintFrame(def, img, f, '#ffffff'), -ax, -ay, dw, dh); }
  g.restore();
  return { x: p[0], y: p[1], top: p[1] - def.charH * s * (o.sy || 1), w: def.charH * s * 0.75 };
};

// ---- code motion -------------------------------------------------------------------------------
function codeMotion(o, code, ph, st, seed, ux, uy) {
  const sx = o.sx || 1, sy = o.sy || 1;
  if (code === 'breathe') {
    const k = Math.sin(AN.clock * (M.TAU / 1.7) + seed * 1.37);
    o.sy = sy * (1 + 0.028 * k); o.sx = sx * (1 - 0.014 * k);
  } else if (code === 'bounce') {
    const a = st.walkT * Math.PI * 2.6, b = Math.abs(Math.sin(a));
    o.lift = (o.lift || 0) + 5 * b; o.rot = (o.rot || 0) + 0.05 * Math.sin(a); o.sy = sy * (1 - 0.035 * (1 - b));
  } else if (code === 'lunge' && ph) {
    if (ph.q !== undefined) { const k = (1 - M.clamp(ph.q, 0, 1)) ** 2; o.dx = (o.dx || 0) + ux * 12 * k; o.dy = (o.dy || 0) + uy * 6 * k; }
    else if (ph.p !== undefined) { const k = M.clamp(ph.p, 0, 1); o.dx = (o.dx || 0) - ux * 4 * k; o.sy = sy * (1 - 0.05 * k); }
  } else if (code === 'shake' && ph) {
    const amp = 3.5 * Math.max(0, 1 - (ph.t || 0) / HURT);
    o.dx = (o.dx || 0) + Math.sin(AN.clock * 95 + seed) * amp;
  }
}
AN.codeMotion = codeMotion;
const screenDir = (v, a) => { const [x, y] = v.worldDirToScreen(Math.cos(a), Math.sin(a)); const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// ---- enemies -----------------------------------------------------------------------------------
AN.drawEnemy = function (g, v, e, w, t, o) {
  const st = AN.st.get(e.id) || state(e.id, e.x, e.y), m = live();
  const fireAge = AN.fireT.has(e.id) ? w.t - AN.fireT.get(e.id) : Infinity;
  const hurtAge = AN.hurtT.has(e.id) ? AN.clock - AN.hurtT.get(e.id) : Infinity;
  const ch = S.charOf(e); // a variant plays its original's clips (in its own tint)
  const act = S.enemyAction(e, m, AN.tgBy.get(e.id) || null, fireAge, st.moving, hurtAge);
  const r = S.resolve(m, ch, act.action, null, st.moving);
  const [ux, uy] = screenDir(v, e.face);
  if (!e.down) codeMotion(o, r.code, act.phase, st, e.id, ux, uy);
  // fodder hit (GDD-V2 §7.1): the white flash and a 0.1u recoil away from the hero, nothing else
  if (e.role === 'fodder' && hurtAge < HURT_FODDER) {
    const [rx, ry] = v.worldDirToScreen(e.x - w.hero.x, e.y - w.hero.y), l = Math.hypot(rx, ry) || 1, k = 1 - hurtAge / HURT_FODDER;
    o.dx = (o.dx || 0) + (rx / l) * RECOIL * k; o.dy = (o.dy || 0) + (ry / l) * RECOIL * 0.5 * k;
  }
  const c = r.name ? AN.clip(ch, r.name, e.def.tint) : null;
  if (c) {
    const ph = r.hold ? { hold: true } : r.shows === act.action && act.phase ? act.phase : { t: st.walkT };
    const f = S.frame(c.def, ph);
    st.last = { def: c.def, img: c.img, f };
    return AN.drawFrame(g, v, c.def, c.img, f, e.x, e.y, o, AN.frameScale(e.kind, c.def, e.size));
  }
  st.last = null;
  return R.sprite(g, v, AN.lookOf(e), e.x, e.y, o);
};

// ---- hero --------------------------------------------------------------------------------------
// pose: the static pose drawWorld chose ({id, flip}); drawStatic(pose, o): the v1 static drawer
// (invulnerability blink, swing tilt, fall). Clips get the same blink.
AN.drawHero = function (g, v, w, t, pose, o, drawStatic) {
  const h = w.hero, st = AN.st.get('hero') || state('hero', h.x, h.y), m = live();
  const d = S.dirOf(h.face);
  const act = S.heroAction(h, m, d.dir, st.moving);
  const r = S.resolve(m, 'hero', act.action, d.dir, st.moving);
  const c = r.name ? AN.clip('hero', r.name) : null;
  if (!c) {
    const p = r.pose ? { id: r.pose, flip: pose.flip } : pose;
    if (!h.dead && act.action !== 'attack') codeMotion(o, r.code, act.action === 'hurt' ? { t: 0.3 - Math.max(0, h.poseT) } : act.phase, st, 7, 0, 0);
    return drawStatic(p, o);
  }
  const [ux, uy] = screenDir(v, h.face);
  if (!h.dead) codeMotion(o, r.code, act.phase, st, 7, ux, uy);
  o.flip = d.flip;
  if (h.invuln > 0 && !h.dead && Math.floor(t * 14) % 2 === 0) o.alpha = 0.45;
  const ph = r.hold ? { hold: true } : r.shows === act.action && act.phase ? act.phase : { t: st.walkT };
  const f = S.frame(c.def, ph);
  return AN.drawFrame(g, v, c.def, c.img, f, h.x, h.y, o, AN.frameScale('hero', c.def, 1));
};

// ---- deaths ------------------------------------------------------------------------------------
function addGhost(w, ev) {
  const e = BD.W.enemyById(w, ev.enemyId);
  if (!e || e.role === 'object') return; // a task object (nest) has no body to dissolve: its site turns dead
  const st = AN.st.get(e.id), ch = S.charOf(e), fod = e.role === 'fodder';
  const die = live()[ch] && live()[ch].die ? AN.clip(ch, 'die', e.def.tint) : null;
  const dieRate = die && fod ? Math.max(1, S.duration(die.def) / DIE_FODDER) : 1;
  const gh = {
    id: e.id, kind: e.kind, sprite: AN.lookOf(e), x: e.x, y: e.y, face: e.face, size: e.size, r: e.r,
    outline: e.guardian || e.boss ? '#ffd24a' : e.elite ? '#ffffff' : null, t0: AN.clock,
    die, dieRate, src: die ? null : st && st.last ? st.last : null, bands: fod ? 4 : 8,
    dur: die ? S.duration(die.def) / dieRate + GHOST_FADE : fod ? DISSOLVE_FODDER : DISSOLVE, seed: e.id * 7.31,
  };
  AN.ghosts.push(gh);
  if (AN.ghosts.length > 80) AN.ghosts.shift();
  if (!die && BD.client.fx) { // ink motes rising off the body
    for (let i = 0; i < (fod ? MOTES_FODDER : MOTES); i++) {
      const a = Math.random() * M.TAU, sp = 0.4 + Math.random() * 0.9;
      BD.client.fx.emit({ x: e.x, y: e.y, z: 20 + Math.random() * 40 * e.size, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 30 + Math.random() * 50, g: 60, life: 0.5 + Math.random() * 0.35, color: U.INK, size: 2.5 + Math.random() * 2.5, layer: 'world' });
    }
  }
}
AN.addGhost = addGhost;
AN.drawGhost = (g, v, gh, age) => drawGhost(g, v, gh, age);
AN.DISSOLVE = DISSOLVE;

AN.drawGhostShadows = function (g, v) {
  for (const gh of AN.ghosts) {
    const k = (AN.clock - gh.t0) / gh.dur;
    if (R.flatOn(v, gh.x, gh.y, gh.r)) R.shadow(g, v, gh.x, gh.y, gh.r * 1.05, 1 - k);
  }
};
AN.ghostItems = function (items, g, v, w, t) {
  for (const gh of AN.ghosts) if (R.actorOn(v, gh.x, gh.y, gh.size)) items.push({ k: gh.x + gh.y - 0.05, f: () => drawGhost(g, v, gh, AN.clock - gh.t0) });
};

// The ink dissolve: the body turns to ink at once and comes apart in bands from the head down,
// each band drifting sideways and up as it fades.
function dissolve(g, img, ink, sx0, sy0, sw, sh, dx0, dy0, dw, dh, k, seed, bands) {
  const N = bands || 8, inkA = Math.min(1, k * 3.2);
  for (let i = 0; i < N; i++) {
    const kb = M.clamp(k * 1.7 - (i / N) * 0.7, 0, 1);
    if (kb >= 1) continue;
    const j = Math.sin(seed + i * 12.9898) * 43758.5453, rnd = j - Math.floor(j);
    const ox = (rnd - 0.5) * 34 * kb + (i % 2 ? 1 : -1) * 4 * kb, oy = -22 * kb * kb;
    const a = 1 - kb, ys = sy0 + (sh * i) / N, yd = dy0 + (dh * i) / N, hs = Math.min(sh / N + 2, sy0 + sh - ys), hd = (hs * dh) / sh; // bands overlap: no seams
    if (inkA < 1) { g.globalAlpha = a * (1 - inkA); g.drawImage(img, sx0, ys, sw, hs, dx0 + ox, yd + oy, dw, hd); }
    g.globalAlpha = a * inkA; g.drawImage(ink, 0, ys - sy0, sw, hs, dx0 + ox, yd + oy, dw, hd); // ink: one frame/sprite, origin 0
  }
  g.globalAlpha = 1;
}
// gh: {kind, sprite, x, y, face, size, outline, die ({def, img} | null), src ({def, img, f} | null), dur, seed}
function drawGhost(g, v, gh, age) {
  const k = Math.min(1, age / gh.dur);
  const [fx] = v.worldDirToScreen(Math.cos(gh.face), Math.sin(gh.face));
  const flip = fx < 0;
  if (gh.die) {
    const f = S.frame(gh.die.def, { t: age * (gh.dieRate || 1) }), fade = Math.max(0, (age - (gh.dur - GHOST_FADE)) / GHOST_FADE);
    AN.drawFrame(g, v, gh.die.def, gh.die.img, f, gh.x, gh.y, { flip, alpha: 1 - fade, outline: gh.outline }, AN.frameScale(gh.kind, gh.die.def, gh.size));
    return;
  }
  const p = v.proj(gh.x, gh.y);
  g.save(); g.translate(p[0], p[1]); if (flip) g.scale(-1, 1);
  if (gh.src) { // the frame it died on
    const { def, img, f } = gh.src, s = AN.frameScale(gh.kind, def, gh.size);
    dissolve(g, img, tintFrame(def, img, f, U.INK), f * def.fw, 0, def.fw, def.fh, -def.anchor[0] * s, -def.anchor[1] * s, def.fw * s, def.fh * s, k, gh.seed, gh.bands);
  } else if (AS.img[gh.sprite]) {
    const img = AS.img[gh.sprite], s = K * gh.size;
    dissolve(g, img, R.tinted(gh.sprite, U.INK), 0, 0, img.width, img.height, -img.width * s / 2, -img.height * s, img.width * s, img.height * s, k, gh.seed, gh.bands);
  }
  g.restore();
}
