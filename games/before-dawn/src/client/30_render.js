// Base isometric renderer. Draw order:
//   sky → cached static layer (skyline, tower, floor slab, back walls, wall props) → baked
//   floor decals (BD.client.render.bake) → floor marks (rifts, rings, telegraphs, zones,
//   shadows, the blade's reach ring, target chevron) → effects 'floor' → depth-sorted obstacles/actors/pickups →
//   projectiles → slash trails → effects 'world' → blackout/ending fade.
// Content can add drawers via BD.render.{trails, projectiles, zones, telegraphs, decor,
// obstacles, vfx}. ui.camera {x, y} offsets the world (screen shake).

const C = BD.C;
const M = BD.math;
const U = BD.ui;
const AS = BD.client.assets;
const R = BD.client.render = { trails: [], vfx: [], cache: null, bakeCanvas: null, floorKey: null, cacheGrid: null };
const K = C.HERO.spriteH / 256; // sprite pixels → logical px

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
R.shade = shade;
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
R.poly = poly;
function ink(g, wdt) { g.lineJoin = 'round'; g.lineWidth = wdt || 2; g.strokeStyle = U.INK; g.stroke(); }
R.ink = ink;

R.floorColor = (w) => C.FLOOR_COLORS[w.floor.domType] || '#888888';
const hueOf = {};
R.floorHue = (w) => { const c = R.floorColor(w); return hueOf[c] === undefined ? (hueOf[c] = AS.hexHue(c)) : hueOf[c]; };

// ---- events → trails ----------------------------------------------------------------------
R.onWorld = function (w) {
  R.anim.onWorld(w);
  BD.client.camera.snap();
  R.trails = [];
  R.vfx = [];
  R.floorKey = null;
  w.bus.on('vfx', (ev) => {
    BD.render.vfx.get(ev.kind); // unknown kinds fail loudly
    R.vfx.push({ ev, age: 0, life: ev.life || 0.3 });
  });
  w.bus.on('strike', (ev) => {
    R.trails.push({ shapes: ev.shapes.map((s) => Object.assign({}, s)), age: 0, life: C.HERO.trail + 0.05, elements: ev.elements.slice(), source: ev.source });
  });
};

// ---- static layers ----------------------------------------------------------------------------
// The stage (floor, facade, back walls, wall furniture, growths) is painted by R.paint
// (37_paint.js) from the stage model (36_stage.js); the far sky by R.sky (38_sky.js). A v1 room
// (fits the screen) is painted once into one screen-sized canvas; a big floor in chunks (32_bigfloor.js).
function layerCanvas(v) {
  const s = Math.min(2, v.dpr * v.scale * 1.0) || 1;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(C.VIEW_W * s); cv.height = Math.ceil(C.VIEW_H * s);
  const g = cv.getContext('2d');
  g.scale(s, s);
  return { cv, g };
}
R.layerCanvas = layerCanvas;

function buildStatic(w, v) {
  const { cv, g } = layerCanvas(v);
  R.sky.prepare(w, v);
  const bottom = C.VIEW_H + 40;
  R.paint.region(g, v.proj, w, R.stageCells(w, bottom).map((it) => it.c), null, bottom);
  return cv;
}

// Inked low-poly box. (x, y) world corner, size dw × dh, height hpx.
R.prism = function (g, v, x, y, dw, dh, hpx, top, left, right) {
  const P = v.proj;
  const a = P(x, y + dh), b = P(x + dw, y + dh), c = P(x + dw, y), d = P(x, y);
  // left face (+y side), right face (+x side), then top
  poly(g, [a, b, [b[0], b[1] - hpx], [a[0], a[1] - hpx]]); g.fillStyle = left; g.fill(); ink(g, 1.5);
  poly(g, [b, c, [c[0], c[1] - hpx], [b[0], b[1] - hpx]]); g.fillStyle = right; g.fill(); ink(g, 1.5);
  poly(g, [[a[0], a[1] - hpx], [b[0], b[1] - hpx], [c[0], c[1] - hpx], [d[0], d[1] - hpx]]); g.fillStyle = top; g.fill(); ink(g, 2);
};

// Bake a permanent mark onto this floor (ink splats …): fn(g, view) draws in logical coords.
R.bake = function (fn) {
  if (!R.bakeCanvas) return;
  const g = R.bakeCanvas.getContext('2d');
  fn(g, R.bakeView);
};

function ensureStatic(w, v) {
  const key = w.seed + ':' + w.floorN + ':' + v.dpr + ':' + v.scale.toFixed(3) + ':' + R.stage.of(w).key;
  if (R.floorKey === key && R.cache && R.cacheGrid === w.grid) return;
  const floorChanged = !R.floorKey || R.cacheGrid !== w.grid || R.floorKey.split(':').slice(0, 2).join(':') !== key.split(':').slice(0, 2).join(':');
  R.cacheGrid = w.grid;
  R.floorKey = key;
  R.cache = buildStatic(w, v);
  if (floorChanged || !R.bakeCanvas) {
    const s = R.cache.width / C.VIEW_W;
    R.bakeCanvas = document.createElement('canvas');
    R.bakeCanvas.width = R.cache.width; R.bakeCanvas.height = R.cache.height;
    R.bakeCanvas.getContext('2d').scale(s, s);
    R.bakeView = v;
  }
}

// ---- sky -------------------------------------------------------------------------------------
// 0 until 03:00 (75 % of the night), 1 at 06:00
// The bands, stars and moon (R.drawSky) and the parallax skyline (R.drawSkyline) are R.sky's
// (src/client/38_sky.js).
R.dawnK = (w) => (w ? M.clamp((BD.flow.clockMin(w) - 540) / 180, 0, 1) : 0);

// Floor cells as one path: warnings and baked decals are clipped to it, so nothing lies on the
// facade below the floor edge. Built once per floor in map px (one parallelogram per run of
// non-void cells in a row) and placed through the view's camera origin, so the same path serves
// the screen at any camera position and the floor-wide decal canvas (R.bake's view).
const floorPaths = new WeakMap();
R.floorPath = function (w) {
  let p = floorPaths.get(w.grid);
  if (!p) {
    p = new Path2D();
    const g = w.grid, P = BD.view.map;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w;) {
      if (g.get(x, y) === BD.CELL.VOID) { x++; continue; }
      let x1 = x;
      while (x1 < g.w && g.get(x1, y) !== BD.CELL.VOID) x1++;
      const a = P(x, y), b = P(x1, y), c = P(x1, y + 1), d = P(x, y + 1);
      p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(c[0], c[1]); p.lineTo(d[0], d[1]); p.closePath();
      x = x1;
    }
    floorPaths.set(w.grid, p);
  }
  return p;
};
R.clipFloor = function (g, v, w) {
  g.translate(v.rox, v.roy); g.clip(R.floorPath(w)); g.translate(-v.rox, -v.roy);
};

// ---- floor marks -------------------------------------------------------------------------------
function ellipse(g, v, x, y, r, fill, stroke, lw) {
  const c = v.proj(x, y);
  g.beginPath(); g.ellipse(c[0], c[1], r * C.ISO_X * 1.414, r * C.ISO_Y * 1.414, 0, 0, M.TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); }
}
R.ellipse = ellipse;
// An actor's ground shadow: the same ellipse as ellipse(…, 'rgba(0,0,0,0.38)'), pre-rendered per
// radius and pixel density and blitted (a path fill per actor per frame is the dearest thing in a crowd).
const shadowCache = new Map();
R.shadow = function (g, v, x, y, r, alpha) {
  const s = Math.min(2, v.dpr * v.scale) || 1, key = Math.round(r * 100) + ':' + s;
  let c = shadowCache.get(key);
  const rx = r * C.ISO_X * 1.414, ry = r * C.ISO_Y * 1.414;
  if (!c) {
    c = document.createElement('canvas'); c.width = Math.ceil((2 * rx + 4) * s); c.height = Math.ceil((2 * ry + 4) * s);
    const cg = c.getContext('2d'); cg.scale(s, s);
    cg.beginPath(); cg.ellipse(rx + 2, ry + 2, rx, ry, 0, 0, M.TAU); cg.fillStyle = 'rgba(0,0,0,0.38)'; cg.fill();
    shadowCache.set(key, c);
  }
  const p = v.proj(x, y);
  if (alpha !== undefined) g.globalAlpha = alpha;
  g.drawImage(c, p[0] - rx - 2, p[1] - ry - 2, c.width / s, c.height / s);
  if (alpha !== undefined) g.globalAlpha = 1;
};
function ringProgress(g, v, x, y, r, p, color) {
  ellipse(g, v, x, y, r, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.55)', 2);
  if (p > 0) {
    const pts = [];
    for (let i = 0; i <= 40 * p; i++) { const a = -Math.PI / 2 + (i / 40) * M.TAU; pts.push(v.proj(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]);
    g.strokeStyle = color || '#ffd56a'; g.lineWidth = 4; g.stroke();
  }
}
R.ringProgress = ringProgress;

const hatchCache = {};
function hatch(g, color) {
  if (hatchCache[color]) return hatchCache[color];
  const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const h = c.getContext('2d');
  h.strokeStyle = color; h.lineWidth = 3;
  h.beginPath(); h.moveTo(-3, 15); h.lineTo(15, -3); h.moveTo(-3, 3); h.lineTo(3, -3); h.moveTo(9, 15); h.lineTo(15, 9); h.stroke();
  return (hatchCache[color] = g.createPattern(c, 'repeat'));
}
function projPolys(v, polys) { return polys.map((p) => p.map((q) => v.proj(q[0], q[1]))); }
function pathPolys(g, pp) { g.beginPath(); for (const p of pp) { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); } }

// default telegraph style (GDD §6.1 as changed by docs/CONTROLS-REVIEW.md §3.4): the whole shape
// reads from its first frame — a red tint (white on the red heavy floor) and the hatch at 0.6 over
// all of it — and the fill grows from the inside out as an opaque hatch on a deeper tint, so "full
// = it lands" still reads. For its first 0.12 s the outline starts 6 px white (ink on the heavy
// floor) and narrows to the usual ink 3.5 + colour 1.5, to pull the eye to the new shape.
const TG_LOOK = {
  red: { col: '#d62828', base: 'rgba(214,40,40,0.40)', fill: 'rgba(214,40,40,0.55)', flash: [255, 255, 255] },
  heavy: { col: '#ffffff', base: 'rgba(255,255,255,0.30)', fill: 'rgba(255,255,255,0.45)', flash: [10, 10, 12] },
  flashT: 0.12, flashW: 6,
};
BD.render.telegraphs.register({
  id: 'hatch',
  draw(g, v, tg, w) {
    const L = w.floor.domType === 'heavy' ? TG_LOOK.heavy : TG_LOOK.red;
    const p = M.clamp(1 - tg.remain / tg.total, 0, 1);
    const full = projPolys(v, M.shapePoly(tg, 1));
    pathPolys(g, full);
    g.fillStyle = L.base; g.fill('evenodd');
    g.globalAlpha = 0.6; g.fillStyle = hatch(g, L.col); g.fill('evenodd'); g.globalAlpha = 1;
    const part = projPolys(v, M.shapePoly(tg, Math.max(0.02, p)));
    pathPolys(g, part);
    g.fillStyle = L.fill; g.fill('evenodd');
    g.fillStyle = hatch(g, L.col); g.fill('evenodd');
    pathPolys(g, full);
    const k = M.clamp((tg.total - tg.remain) / TG_LOOK.flashT, 0, 1);
    if (k < 1) {
      const lw = TG_LOOK.flashW + (1.5 - TG_LOOK.flashW) * k;
      const c = L.flash, to = L === TG_LOOK.heavy ? [255, 255, 255] : [214, 40, 40];
      g.lineWidth = Math.max(3.5, lw + 2); g.strokeStyle = U.INK; g.stroke();
      g.lineWidth = lw; g.strokeStyle = 'rgb(' + c.map((q, i) => Math.round(q + (to[i] - q) * k)).join(',') + ')'; g.stroke();
    } else {
      g.lineWidth = 3.5; g.strokeStyle = U.INK; g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = L.col; g.stroke();
    }
  },
});
BD.render.telegraphs.register({
  id: 'blink',
  draw(g, v, tg) {
    const p = M.clamp(1 - tg.remain / tg.total, 0, 1);
    pathPolys(g, projPolys(v, M.shapePoly(tg, 1)));
    g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeStyle = 'rgba(190,140,255,' + (0.4 + 0.5 * p) + ')'; g.stroke(); g.setLineDash([]);
  },
});
BD.render.zones.register({
  id: 'fire',
  draw(g, v, z, w, t) {
    const a = 0.25 + 0.08 * Math.sin(t * 20 + z.id);
    ellipse(g, v, z.x, z.y, z.r, 'rgba(214,40,40,' + a + ')', U.INK, 2.5);
    ellipse(g, v, z.x, z.y, z.r * 0.6, 'rgba(255,255,255,' + a * 0.6 + ')', null);
  },
});
BD.render.projectiles.register({
  id: 'default',
  draw(g, v, p) {
    const a = v.proj(p.x, p.y, 18), b = v.proj(p.x - Math.cos(p.dir) * 0.6, p.y - Math.sin(p.dir) * 0.6, 18);
    if (!p.hostile) {
      g.strokeStyle = U.ORANGE; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(a[0], a[1]); g.stroke(); g.lineCap = 'butt';
      return;
    }
    g.lineCap = 'round';
    g.strokeStyle = U.INK; g.lineWidth = 7; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(a[0], a[1]); g.stroke();
    g.strokeStyle = '#d62828'; g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke();
    g.lineCap = 'butt';
  },
});
// default trails per strike shape kind (orange #ff9a3c is the hero's colour)
const ELEMENT_COLORS = { tide: '#3aa0ff', lightning: '#bfe9ff', flame: '#ff5a2a' };
R.ELEMENT_COLORS = ELEMENT_COLORS;
function trailStroke(g, pts, a, width, elements) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = width + 4; g.stroke();
  elements.forEach((el, i) => { g.strokeStyle = ELEMENT_COLORS[el]; g.globalAlpha = a; g.lineWidth = width + 2 - i * 0; g.setLineDash([10, 8]); g.lineDashOffset = i * 9; g.stroke(); });
  g.setLineDash([]); g.globalAlpha = a;
  g.strokeStyle = U.ORANGE; g.lineWidth = width; g.stroke();
  g.strokeStyle = '#fff3d6'; g.lineWidth = Math.max(1, width * 0.3); g.stroke();
  g.globalAlpha = 1; g.lineCap = 'butt';
}
BD.render.trails.register({
  id: 'fan',
  draw(g, v, s, k, tr) {
    const a = 1 - k, h = s.half * M.DEG, pts = [], n = 18;
    const sweep = Math.min(1, k * 3 + 0.35);
    for (let i = 0; i <= n * sweep; i++) { const an = s.dir - h + (2 * h * i) / n; pts.push(v.proj(s.x + Math.cos(an) * s.r * 0.92, s.y + Math.sin(an) * s.r * 0.92, 14)); }
    if (pts.length > 1) trailStroke(g, pts, a, 7, tr.elements);
  },
});
BD.render.trails.register({
  id: 'line',
  draw(g, v, s, k, tr) {
    const L = s.len * Math.min(1, 0.3 + k * 3);
    const pts = [v.proj(s.x + Math.cos(s.dir) * 0.4, s.y + Math.sin(s.dir) * 0.4, 14), v.proj(s.x + Math.cos(s.dir) * L, s.y + Math.sin(s.dir) * L, 14)];
    trailStroke(g, pts, 1 - k, Math.max(3, s.width * 6), tr.elements);
  },
});
BD.render.trails.register({
  id: 'circle',
  draw(g, v, s, k, tr) {
    const pts = [];
    for (let i = 0; i <= 36; i++) { const an = (i / 36) * M.TAU; pts.push(v.proj(s.x + Math.cos(an) * s.r * 0.95, s.y + Math.sin(an) * s.r * 0.95, 10)); }
    trailStroke(g, pts, 1 - k, 6, tr.elements);
  },
});
BD.render.trails.register({
  id: 'ring',
  draw(g, v, s, k, tr) {
    const pts = [];
    for (let i = 0; i <= 36; i++) { const an = (i / 36) * M.TAU; pts.push(v.proj(s.x + Math.cos(an) * s.r1, s.y + Math.sin(an) * s.r1, 6)); }
    trailStroke(g, pts, 1 - k, 5, tr.elements);
  },
});

// decor drawers by target, rebuilt when the registry grows (all() sorts on every call)
const decorBy = { n: -1, map: new Map() };
R.decor = function (target, g, v, obj, w, box, t) {
  const ids = BD.render.decor.ids();
  if (ids.length !== decorBy.n) {
    decorBy.n = ids.length; decorBy.map = new Map();
    for (const d of BD.render.decor.all()) { if (!decorBy.map.has(d.target)) decorBy.map.set(d.target, []); decorBy.map.get(d.target).push(d); }
  }
  const list = decorBy.map.get(target);
  if (list) for (const d of list) d.draw(g, v, obj, w, box, t);
};

// ---- sprites ---------------------------------------------------------------------------------
const tintCache = {};
function tinted(id, color) {
  const key = id + color;
  if (tintCache[key]) return tintCache[key];
  const src = AS.white[id], c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return (tintCache[key] = c);
}
R.tinted = tinted;
// The eight offset copies of a silhouette (the ink/gold/white outline) baked into one image.
// sil: tinted source (image px); sc: image px → logical px; d: outline width (logical px).
const outlineCache = new Map();
R.outlineOf = function (sil, key, sc, d) {
  const k = key + ':' + sc.toFixed(4) + ':' + d;
  let c = outlineCache.get(k);
  if (c) return c;
  const pd = d / sc; // outline in source px
  c = document.createElement('canvas'); c.width = Math.ceil(sil.width + 2 * pd); c.height = Math.ceil(sil.height + 2 * pd);
  const cg = c.getContext('2d');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) cg.drawImage(sil, pd + dx * pd, pd + dy * pd);
  if (outlineCache.size > 400) outlineCache.delete(outlineCache.keys().next().value);
  outlineCache.set(k, c);
  return c;
};
// opts: {scale, flip, alpha, rot, sx, sy (squash), lift, dx, dy (screen offset px), white (0..1), outline: color, outlinePx}
R.sprite = function (g, v, id, x, y, o) {
  o = o || {};
  const img = AS.img[id];
  if (!img) return;
  const sc = K * (o.scale || 1);
  const wpx = img.width * sc, hpx = img.height * sc;
  const p = v.proj(x, y, o.lift || 0);
  g.save();
  g.translate(p[0] + (o.dx || 0), p[1] + (o.dy || 0));
  if (o.rot) g.rotate(o.rot);
  g.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.outline) {
    const d = o.outlinePx || 2, ol = R.outlineOf(tinted(id, o.outline), id + o.outline, sc, d);
    g.drawImage(ol, -wpx / 2 - d, -hpx - d, wpx + 2 * d, hpx + 2 * d);
  }
  g.drawImage(img, -wpx / 2, -hpx, wpx, hpx);
  if (o.white > 0) { g.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * o.white; g.drawImage(AS.white[id], -wpx / 2, -hpx, wpx, hpx); }
  g.restore();
  return { x: p[0], y: p[1], top: p[1] - hpx * (o.sy || 1), w: wpx };
};
R.spriteHeight = (id, scale) => (AS.img[id] ? AS.img[id].height * K * (scale || 1) : 0);

function heroPose(w, v) {
  const h = w.hero;
  const [sx, sy] = v.worldDirToScreen(Math.cos(h.face), Math.sin(h.face));
  const ang = Math.atan2(sy, sx) / M.DEG;
  let id = 'hero_side';
  if (ang > 50 && ang < 130) id = 'hero_front';
  else if (ang < -50 && ang > -130) id = 'hero_back';
  if (h.pose === 'dash') id = 'hero_dash';
  if (h.pose === 'hurt' || h.dead) id = 'hero_hurt';
  return { id, flip: sx < 0, sx, sy };
}

// the icon over an enemy's head, pre-rendered per type at the screen's pixel density
const iconCache = {};
function typeIconCached(g, v, type, x, y) {
  const s = Math.min(3, v.dpr * v.scale) || 1, key = type + ':' + s.toFixed(2);
  let c = iconCache[key];
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = Math.ceil(20 * s);
    const cg = c.getContext('2d'); cg.scale(s, s); typeIcon(cg, type, 10, 10);
    iconCache[key] = c;
  }
  g.drawImage(c, x - 10, y - 10, 20, 20);
}
function typeIcon(g, type, x, y) {
  g.save(); g.translate(x, y);
  g.lineWidth = 2; g.strokeStyle = U.INK; g.fillStyle = '#ffffff';
  if (type === 'beast') { poly(g, [[-6, -4], [-2, -4], [-4, 5]]); g.fill(); g.stroke(); poly(g, [[2, -4], [6, -4], [4, 5]]); g.fill(); g.stroke(); }
  else if (type === 'undead') { g.beginPath(); g.arc(0, -1, 5, 0, M.TAU); g.fill(); g.stroke(); g.fillStyle = U.INK; g.fillRect(-3, -2, 2, 2); g.fillRect(1, -2, 2, 2); }
  else if (type === 'magic') { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.6 : 6.5, a = -Math.PI / 2 + (i * Math.PI) / 5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(g, pts); g.fill(); g.stroke(); }
  else if (type === 'heavy') { poly(g, [[-5, -6], [5, -6], [5, 0], [0, 6], [-5, 0]]); g.fill(); g.stroke(); }
  g.restore();
}
R.typeIcon = typeIcon;
function crown(g, x, y) {
  poly(g, [[x - 9, y], [x - 9, y - 9], [x - 4, y - 4], [x, y - 11], [x + 4, y - 4], [x + 9, y - 9], [x + 9, y]]);
  g.fillStyle = '#ffd24a'; g.fill(); ink(g, 2);
}

function drawEnemy(g, v, e, w, t) {
  const def = e.def;
  const id = def.sprite;
  const [fx] = v.worldDirToScreen(Math.cos(e.face), Math.sin(e.face));
  const o = { scale: e.size, flip: fx < 0 };
  if (e.down) { o.rot = o.flip ? -1.35 : 1.35; o.alpha = 0.7; o.sy = 0.9; }
  else if (e.state === 'windup') { o.sy = 0.9; o.sx = 1.06; }
  else if (e.state === 'flat') { o.sy = 0.6; o.sx = 1.3; }
  else if (e.state === 'jump' || e.lunging) o.lift = 16;
  else if (e.state === 'stunned') o.rot = Math.sin(t * 30) * 0.06;
  if (e.hitT > 0) o.white = Math.min(1, e.hitT / 0.12);
  const floorHue = R.floorHue(w);
  const hue = AS.hue[id];
  if (e.guardian || e.boss) o.outline = '#ffd24a';
  else if (e.elite) o.outline = '#ffffff';
  else if (hue !== null && hue !== undefined && Math.abs(((hue - floorHue + 540) % 360) - 180) <= 40) { o.outline = '#ffffff'; o.outlinePx = 1.5; }
  if (e.statuses.wet) ellipse(g, v, e.x, e.y, e.r * 1.25, 'rgba(58,160,255,0.35)', null);
  const box = R.anim.drawEnemy(g, v, e, w, t, o); // clip frame or static sprite + code motion
  if (!box || e.down) return;
  if (e.statuses.burn) {
    for (let i = 0; i < 3; i++) {
      const fx2 = box.x + (i - 1) * box.w * 0.22, fy = box.top + (box.y - box.top) * (0.35 + 0.2 * (i % 2));
      const fl = 8 + 4 * Math.sin(t * 25 + i * 2 + e.id);
      poly(g, [[fx2 - 4, fy], [fx2, fy - fl], [fx2 + 4, fy]]); g.fillStyle = '#ff5a2a'; g.fill(); ink(g, 1);
    }
  }
  if (e.statuses.bind) { g.strokeStyle = '#9b59d0'; g.lineWidth = 2.5; g.setLineDash([5, 3]); ellipse(g, v, e.x, e.y, e.r * 1.4, null, '#9b59d0', 2.5); g.setLineDash([]); }
  if (e.statuses.sunder) {
    g.strokeStyle = U.INK; g.lineWidth = 1.5;
    for (let i = 0; i < e.statuses.sunder.n; i++) { const yy = box.top + 12 + i * 7; g.beginPath(); g.moveTo(box.x - 8, yy); g.lineTo(box.x - 2, yy + 3); g.lineTo(box.x + 6, yy - 1); g.stroke(); }
  }
  R.decor(e.kind, g, v, e, w, box, t);
  R.decor('enemy', g, v, e, w, box, t);
  if (e.type !== 'boss') typeIconCached(g, v, e.type, box.x, box.top - 9);
  if (e.guardian) crown(g, box.x, box.top - 18);
}

function drawHero(g, v, w, t) {
  const h = w.hero;
  const pose = heroPose(w, v);
  const o = { flip: pose.flip };
  const hp = v.proj(h.x, h.y), hh = R.spriteHeight(pose.id);
  const box = { x: hp[0], y: hp[1], top: hp[1] - hh, w: 0, pose: pose.id, flip: pose.flip };
  R.decor('hero_back', g, v, h, w, box, t);
  R.anim.drawHero(g, v, w, t, pose, o, (p, oo) => drawHeroSprite(g, v, w, t, h, p, oo));
  R.decor('hero_front', g, v, h, w, box, t);
}
function drawHeroSprite(g, v, w, t, h, pose, o) {
  // post-hit invulnerability blinks for all of its 1.0 s, swings included, so its end is visible
  if (h.invuln > 0 && !h.dead && Math.floor(t * 14) % 2 === 0) o.alpha = 0.45;
  if (h.swingT > 0 && !h.dead) {
    const k = h.swingT / C.HERO.trail;
    const [ax, ay] = v.worldDirToScreen(Math.cos(h.aim), Math.sin(h.aim));
    const l = Math.sqrt(ax * ax + ay * ay) || 1;
    o.rot = (ax / l) * 0.16 * k;
    o.lift = 2;
    g.save(); g.translate((ax / l) * 6 * k, (ay / l) * 3 * k);
    R.sprite(g, v, pose.id, h.x, h.y, o);
    g.restore();
    return;
  }
  if (h.dead) { o.rot = pose.flip ? -1.2 : 1.2; o.sy = 0.95; }
  R.sprite(g, v, pose.id, h.x, h.y, o);
}

function drawFlask(g, v, p, t) {
  const c = v.proj(p.x, p.y, 8 + Math.sin(t * 3 + p.id) * 2);
  g.save(); g.translate(c[0], c[1]);
  g.beginPath(); g.arc(0, 0, 8, 0, M.TAU); g.fillStyle = '#3aa0ff'; g.fill(); ink(g, 2);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-3, -3, 2.5, 0, M.TAU); g.fill();
  g.fillStyle = '#cfe6ff'; g.fillRect(-3, -15, 6, 7); g.strokeStyle = U.INK; g.lineWidth = 2; g.strokeRect(-3, -15, 6, 7);
  g.fillStyle = '#8a5a3a'; g.fillRect(-4, -19, 8, 4); g.strokeRect(-4, -19, 8, 4);
  g.restore();
}

// the altar and the stairs door are sites (src/client/39_sites.js)
function drawAltar(g, v, a, t, w) { R.sites.draw(g, v, 'altar', a.x, a.y, a.state, t, R.stage.themeOf(w)); }
function drawDoor(g, v, w, t) { R.sites.door(g, v, w, t); }

// The blade's reach (docs/CONTROLS-REVIEW.md §3.6 b): while a living enemy is in the room, a
// dashed orange circle of radius hero.stats.reach (cards included) at the hero's feet; with a
// target, the swing's arc toward it (± halfArc) solid, brighter for 0.1 s after each swing. Only
// the blade's own reach, even when a card aims farther. Orange is the hero's blade colour.
// Each line has a faint ink edge under it: orange alone vanishes on the yellow beast floor (see
// the review's 구현 메모).
const REACH = { dash: [7, 6], ring: 0.18, ringW: 1.5, ringInk: 0.22, arc: 0.45, arcSwing: 0.8, arcW: 2.5, arcInk: 0.35, swingT: 0.1 };
function inkUnder(g, width, a) { g.lineWidth = width + 2; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke(); }
function drawReach(g, v, w, target) {
  const h = w.hero;
  if (h.dead || !w.enemies.some((e) => !e.dead && !e.down)) return;
  const r = h.stats.reach, c = v.proj(h.x, h.y);
  g.beginPath(); g.ellipse(c[0], c[1], r * C.ISO_X * 1.414, r * C.ISO_Y * 1.414, 0, 0, M.TAU);
  g.setLineDash(REACH.dash); inkUnder(g, REACH.ringW, REACH.ringInk);
  g.lineWidth = REACH.ringW; g.strokeStyle = 'rgba(255,154,60,' + REACH.ring + ')'; g.stroke(); g.setLineDash([]);
  if (!target) return;
  const aim = Math.atan2(target.y - h.y, target.x - h.x), half = h.stats.halfArc * M.DEG;
  const swung = h.swingT > 0 && C.HERO.trail - h.swingT < REACH.swingT, a = swung ? REACH.arcSwing : REACH.arc;
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const an = aim - half + (2 * half * i) / 24, p = v.proj(h.x + Math.cos(an) * r, h.y + Math.sin(an) * r);
    if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
  }
  g.lineCap = 'round'; inkUnder(g, REACH.arcW, REACH.arcInk * a / REACH.arc);
  g.lineWidth = REACH.arcW; g.strokeStyle = 'rgba(255,154,60,' + a + ')'; g.stroke(); g.lineCap = 'butt';
}

function drawChevron(g, v, e, t) {
  const c = v.proj(e.x, e.y);
  const rx = e.r * 1.414 * C.ISO_X + 6 + Math.sin(t * 8) * 1.5, ry = rx / 2;
  g.save(); g.translate(c[0], c[1]);
  for (const s of [-1, 1]) {
    poly(g, [[s * (rx + 2), -5], [s * (rx - 6), 0], [s * (rx + 2), 5], [s * (rx - 1), 0]]);
    g.fillStyle = U.ORANGE; g.fill(); ink(g, 1.5);
  }
  poly(g, [[-6, ry + 1], [0, ry + 7], [6, ry + 1], [0, ry + 4]]); g.fillStyle = U.ORANGE; g.fill(); ink(g, 1.5);
  g.restore();
}

// ---- main ---------------------------------------------------------------------------------------
// Culling margins (logical px) for things anchored at their feet: sprites rise far above them.
const CULL = { side: 110, top: 220, bottom: 60, flat: 100 };
// a flat floor mark of radius r (u) around (x, y) may touch the screen
const flatOn = (v, x, y, r) => v.worldOnScreen(x, y, CULL.flat + (r || 0) * 57);
R.flatOn = flatOn;
// an actor standing at (x, y) may touch the screen (scale: sprite size factor)
const actorOn = (v, x, y, scale) => v.worldOnScreen(x, y, CULL.side * (scale || 1), CULL.top * (scale || 1), CULL.side * (scale || 1), CULL.bottom);
R.actorOn = actorOn;

R.drawWorld = function (g, ui, dt) {
  const w = ui.app.world, v = ui.view, t = ui.time;
  BD.client.camera.update(ui, dt);
  R.anim.update(ui, dt);
  const big = !BD.view.fits(w.grid);
  R.kit.s = Math.min(2, v.dpr * v.scale) || 1; // pixel density of cached stage sprites
  if (big) R.big.prepare(w, v); else ensureStatic(w, v);
  R.drawSky(g, w, v);
  g.save();
  if (ui.camera) g.translate(ui.camera.x || 0, ui.camera.y || 0);
  if (big) {
    R.drawSkyline(g, w, v);
    R.big.drawStatic(g, v, w);
  } else {
    R.drawSkyline(g, w, v);
    g.drawImage(R.cache, 0, 0, C.VIEW_W, C.VIEW_H);
    if (R.bakeCanvas) g.drawImage(R.bakeCanvas, 0, 0, C.VIEW_W, C.VIEW_H);
  }
  drawDoor(g, v, w, t);
  // rifts (spawn marks; the trial rift is a standing site, depth-sorted below)
  R.sites.spawnMarks(g, v, w, t);
  for (const r of w.rifts) {
    if (!flatOn(v, r.x, r.y, 0.8)) continue;
    const p = 1 - r.remain / r.time;
    ellipse(g, v, r.x, r.y, 0.35 + 0.45 * p, r.opts.guardian ? 'rgba(255,210,74,0.35)' : 'rgba(155,89,208,0.5)', '#2a0f40', 2.5);
  }
  // rings
  const I = w.interact;
  if (w.stairs) ringProgress(g, v, w.stairs.ringX, w.stairs.ringY, C.INTERACT.ring, I.target === 'stairs' && I.need ? I.progress / I.need : 0, w.stairs.open ? '#ffd56a' : '#9b59d0');
  if (w.altar && w.altar.state === 'lit') ringProgress(g, v, w.altar.x, w.altar.y, C.INTERACT.ring, I.target === 'altar' ? I.progress / I.need : 0);
  if (w.trial && w.trial.state === 'available') ringProgress(g, v, w.trial.x, w.trial.y, C.INTERACT.ring, I.target === 'trial' ? I.progress / I.need : 0, '#c9a0ff');
  // zones, telegraphs
  for (const z of w.zones) if (flatOn(v, z.x, z.y, z.r)) (BD.render.zones.has(z.kind) ? BD.render.zones.get(z.kind) : BD.render.zones.get('fire')).draw(g, v, z, w, t);
  if (w.telegraphs.length) {
    g.save(); R.clipFloor(g, v, w); // warnings stay on the floor (the boss's collapse ring reaches past the roof)
    for (const tg of w.telegraphs) if (flatOn(v, tg.x, tg.y, (tg.r || tg.len || tg.r1 || 1) + 0.5)) BD.render.telegraphs.get(tg.style).draw(g, v, tg, w, t);
    g.restore();
  }
  // shadows
  R.shadow(g, v, w.hero.x, w.hero.y, 0.38);
  for (const e of w.enemies) if (!e.dead && flatOn(v, e.x, e.y, e.r)) R.shadow(g, v, e.x, e.y, e.r * 1.05);
  R.anim.drawGhostShadows(g, v, w);
  // dash cooldown arc
  if (w.hero.dashCd > 0) {
    const p = 1 - w.hero.dashCd / C.DASH.cd, pts = [];
    for (let i = 0; i <= 30 * p; i++) { const a = Math.PI / 2 + (i / 30) * M.TAU; pts.push(v.proj(w.hero.x + Math.cos(a) * 0.55, w.hero.y + Math.sin(a) * 0.55)); }
    if (pts.length > 1) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke(); }
  }
  const target0 = w.hero.targetId ? BD.W.enemyById(w, w.hero.targetId) : null;
  const target = target0 && !target0.dead ? target0 : null;
  drawReach(g, v, w, target);
  if (target) drawChevron(g, v, target, t);
  ui.drawEffects(g, 'floor');
  // depth-sorted things
  const items = [];
  R.stage.pushItems(items, g, v, w, t, actorOn); // props cell by cell, front growths, sites
  for (const e of w.enemies) if (!e.dead && actorOn(v, e.x, e.y, e.size * (e.boss ? 1.6 : 1))) items.push({ k: e.x + e.y + (e.down ? -0.3 : 0), f: () => drawEnemy(g, v, e, w, t) });
  R.anim.ghostItems(items, g, v, w, t);
  items.push({ k: w.hero.x + w.hero.y, f: () => drawHero(g, v, w, t) });
  for (const p of w.pickups) if (actorOn(v, p.x, p.y, 0.3)) items.push({ k: p.x + p.y, f: () => drawFlask(g, v, p, t) });
  if (w.altar) items.push({ k: w.altar.x + w.altar.y, f: () => drawAltar(g, v, w.altar, t, w) });
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f();
  for (const p of w.projectiles) if (flatOn(v, p.x, p.y, 1)) (BD.render.projectiles.has(p.kind) ? BD.render.projectiles.get(p.kind) : BD.render.projectiles.get('default')).draw(g, v, p, w, t);
  // trails
  for (const tr of R.trails) {
    const k = tr.age / tr.life;
    for (const s of tr.shapes) {
      const d = s.card && BD.render.trails.has(s.card) ? BD.render.trails.get(s.card) : BD.render.trails.has(s.kind) ? BD.render.trails.get(s.kind) : null;
      if (d) d.draw(g, v, s, k, tr, w);
    }
    tr.age += dt;
  }
  R.trails = R.trails.filter((tr) => tr.age < tr.life);
  for (const x of R.vfx) { BD.render.vfx.get(x.ev.kind).draw(g, v, x.ev, x.age / x.life, w, t); x.age += dt; }
  R.vfx = R.vfx.filter((x) => x.age < x.life);
  ui.drawEffects(g, 'world');
  g.restore();
  // off-screen awareness (edge markers, minimap) when switched on for this floor
  BD.client.offscreen.draw(g, ui);
  // blackout / endings
  if (w.blackoutT > 0) { g.fillStyle = 'rgba(0,0,0,' + M.clamp(1 - w.blackoutT / C.INTERACT.blackout + 0.4, 0, 1) + ')'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); }
  if (w.ending) {
    const k = 1 - w.ending.t / (w.ending.kind === 'win' ? C.ENDING.win : C.ENDING.death);
    g.fillStyle = w.ending.kind === 'win' ? 'rgba(255,240,210,' + k * 0.6 + ')' : 'rgba(0,0,0,' + k * 0.7 + ')';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  }
};

// a simple default vfx: ev {kind:'line', points:[[x,y],…], color, width}
BD.render.vfx.register({
  id: 'line',
  draw(g, v, ev, k) {
    const pts = ev.points.map((p) => v.proj(p[0], p[1], 20));
    g.globalAlpha = 1 - k;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]);
    g.strokeStyle = BD.ui.INK; g.lineWidth = (ev.width || 3) + 3; g.stroke();
    g.strokeStyle = ev.color || '#ffffff'; g.lineWidth = ev.width || 3; g.stroke();
    g.globalAlpha = 1;
  },
});
