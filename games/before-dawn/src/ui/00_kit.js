// UI kit: palette, inked comic-cover primitives, lettering, wrapped text, buttons with keyboard
// focus, and a per-frame record of what was drawn (texts, buttons) that tests read through
// window.__BD.ui.debug. Everything on screen in src/ui/ draws through these helpers.
//
// Look (docs/prior/art-direction.md): ink-black panels with thick ink outlines, flat colour,
// two tones (a lighter top facet over ink), gold trim for the sword's crossguard, halftone dots
// only on shadow areas. Orange #ff9a3c is the hero's blade colour and is not used by the UI.

const C = BD.C;
const U = BD.ui;
const K = U.K = {};

K.INK = '#0a0a0c';
K.INK2 = '#1b1a21';        // the lighter facet of a two-tone ink panel
K.PAPER = '#f3ead8';
K.DIM = '#a89f8e';
K.MUTED = '#6d6a64';
K.GOLD = '#d9b45a';
K.GOLD_HI = '#f6dc8a';
K.GOLD_DK = '#7a5a22';
K.RED = '#d62828';
K.HP = '#c8283a';
K.AMBER = '#ffc46b';       // dawn light on the clock (not the hero's orange)
K.DAWN = '#ffe2a8';
K.GREEN = '#7fdc6a';
K.VIOLET = '#b07ce8';
K.SKY = '#8fd3ff';

U.FAMILY_COLORS = { shape: '#ffffff', element: '#8fd3ff', trigger: '#a6e36b', target: '#e0392f', quest: '#ffd24a', combo: '#b07ce8' };
K.FAMILY_NAMES = { shape: '형태', element: '속성', trigger: '발동', target: '표적', quest: '퀘스트', combo: '콤보' };
K.famColor = (f) => U.FAMILY_COLORS[f] || K.PAPER;
K.typeName = (t) => C.TYPE_NAMES[t] || t || '—';
K.floorName = (n) => (n >= 6 ? '옥상' : n + 'F');
K.clamp = BD.math.clamp;
K.lerp = (a, b, t) => a + (b - a) * t;
K.ease = (t) => 1 - Math.pow(1 - K.clamp(t, 0, 1), 3);

// Cosmetic randomness for the UI only (never the sim's streams).
K.rng = BD.Rng(0x5eed);

// ---- per-frame record (tests and screenshots read it) ---------------------------------------
const REC = { texts: [], last: [] };
K.frameEnd = function () { REC.last = REC.texts; REC.texts = []; };
K.attach = function (ui) {
  if (ui.debug) return;
  ui.debug = {
    texts: () => REC.last.map((t) => t.s),
    textsAt: () => REC.last.map((t) => ({ s: t.s, x: Math.round(t.x), y: Math.round(t.y), size: t.size })),
    buttons: () => ui.lastButtons.map((b) => ({ id: b.id || null, label: b.label || null, layer: b.layer, menu: !!b.menu, disabled: !!b.disabled, x: b.x, y: b.y, w: b.w, h: b.h })),
    state: () => U.S,
  };
};

// ---- geometry --------------------------------------------------------------------------------
K.poly = function (g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
};
K.ink = function (g, w, color) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w || 3; g.strokeStyle = color || K.INK; g.stroke(); };
// slanted box (parallelogram): the top edge is shifted right by `s`
K.slantPts = (x, y, w, h, s) => [[x + s, y], [x + w + s, y], [x + w - s, y + h], [x - s, y + h]];
K.circle = function (g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); };

const patCache = {};
// Halftone dots for shadow areas (cached pattern per colour/size).
K.halftone = function (g, color, step) {
  const key = color + '|' + (step || 6);
  if (patCache[key]) return patCache[key];
  const s = step || 6, c = document.createElement('canvas');
  c.width = s * 2; c.height = s * 2;
  const h = c.getContext('2d');
  h.fillStyle = color;
  for (const [x, y] of [[s / 2, s / 2], [s * 1.5, s * 1.5]]) { h.beginPath(); h.arc(x, y, s * 0.22, 0, Math.PI * 2); h.fill(); }
  return (patCache[key] = g.createPattern(c, 'repeat'));
};

// Ink panel: comic print shadow, ink body, lighter top facet (two tones), accent hairline, ink edge.
// o: {slant, fill, facet, edge, edgeW, shadow, alpha, facetK (0..1 of the height)}
K.panel = function (g, x, y, w, h, o) {
  o = o || {};
  const s = o.slant || 0;
  const pts = K.slantPts(x, y, w, h, s);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.shadow !== false) {
    const d = o.shadow || 4;
    K.poly(g, pts.map((p) => [p[0] + d, p[1] + d])); g.fillStyle = K.INK; g.fill();
  }
  K.poly(g, pts); g.fillStyle = o.fill || K.INK; g.fill();
  if (o.facet !== false) {
    const fk = o.facetK || 0.42, fh = h * fk;
    g.save(); K.poly(g, pts); g.clip();
    K.poly(g, [[x - s - 4, y - 2], [x + w + s + 4, y - 2], [x + w + s + 4, y + fh], [x - s - 4, y + fh + (o.facetTilt || 0)]]);
    g.fillStyle = o.facet || K.INK2; g.fill();
    g.restore();
  }
  K.poly(g, pts);
  K.ink(g, (o.edgeW || 2) + 3);
  if (o.edge) {
    const i = 3.5;
    K.poly(g, K.slantPts(x + i, y + i, w - 2 * i, h - 2 * i, s * (h - 2 * i) / h));
    g.lineWidth = o.edgeW || 2; g.strokeStyle = o.edge; g.stroke();
  }
  g.globalAlpha = 1;
};

// Full-screen dim behind overlays: ink wash + halftone.
K.dim = function (g, a) {
  g.fillStyle = 'rgba(6,6,10,' + (a === undefined ? 0.78 : a) + ')';
  g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  g.globalAlpha = 0.35; g.fillStyle = K.halftone(g, '#000000', 7); g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); g.globalAlpha = 1;
};

// ---- text ------------------------------------------------------------------------------------
// ui.text wrapper that records what was drawn. o as ui.text: {size, color, align, base, weight, stroke, maxW}
K.text = function (ui, s, x, y, o) {
  s = String(s);
  o = o || {};
  ui.text(s, x, y, o);
  REC.texts.push({ s, x, y, size: o.size || 18 });
};
K.measure = function (g, s, size, weight) { g.font = U.font(size, weight || 700); return g.measureText(s).width; };

// Word-aware wrap for Korean (break at spaces when possible, else anywhere). Cached.
const wrapCache = new Map();
K.wrap = function (g, text, maxW, size, weight) {
  const key = text + '|' + maxW + '|' + size + '|' + (weight || 500);
  const hit = wrapCache.get(key);
  if (hit) return hit;
  g.font = U.font(size, weight || 500);
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    const words = para.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      const tryLine = line + word;
      if (g.measureText(tryLine).width <= maxW) { line = tryLine; continue; }
      if (line.trim() && g.measureText(word.trim()).width <= maxW) { lines.push(line.trimEnd()); line = word.trimStart(); continue; }
      for (const ch of word) {
        if (g.measureText(line + ch).width > maxW && line) { lines.push(line.trimEnd()); line = ch.trim() ? ch : ''; } else line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  if (wrapCache.size > 400) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
};
// Draw wrapped text; returns the height used. o: {size, lh, color, weight, maxLines, align}
K.para = function (ui, text, x, y, maxW, o) {
  o = o || {};
  const size = o.size || 20, lh = o.lh || Math.round(size * 1.38);
  let lines = K.wrap(ui.g, text, maxW, size, o.weight || 500);
  if (o.maxLines && lines.length > o.maxLines) { lines = lines.slice(0, o.maxLines); lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, '…'); }
  lines.forEach((ln, i) => K.text(ui, ln, x, y + i * lh, { size, color: o.color || K.PAPER, weight: o.weight || 500, align: o.align || 'left', stroke: o.stroke }));
  return lines.length * lh;
};

// Comic lettering: heavy italic, two-tone fill (hard split), thick ink outline, print offset.
// o: {size, fill, fill2, align, rot, skew, stroke, shadow, alpha, scale, weight}
K.letter = function (g, text, x, y, o) {
  o = o || {};
  const size = o.size || 48;
  REC.texts.push({ s: String(text), x, y, size });
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  const sc = o.scale || 1;
  g.scale(sc, sc);
  g.transform(1, 0, o.skew === undefined ? -0.18 : o.skew, 1, 0, 0);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  g.font = (o.italic === false ? '' : 'italic ') + (o.weight || 900) + ' ' + size + 'px ' + U.FONT;
  g.textAlign = o.align || 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.miterLimit = 2;
  const sw = o.stroke === undefined ? Math.max(4, size * 0.16) : o.stroke;
  const sh = o.shadow === undefined ? Math.max(3, size * 0.07) : o.shadow;
  if (sh) { g.lineWidth = sw; g.strokeStyle = K.INK; g.strokeText(text, sh, sh); g.fillStyle = K.INK; g.fillText(text, sh, sh); }
  if (sw) { g.lineWidth = sw; g.strokeStyle = K.INK; g.strokeText(text, 0, 0); }
  if (o.fill2) {
    // two tones with a hard split: light top, darker lower third (no smooth gradient)
    const gr = g.createLinearGradient(0, -size * 0.8, 0, size * 0.1);
    gr.addColorStop(0, o.fill || K.PAPER); gr.addColorStop(0.58, o.fill || K.PAPER);
    gr.addColorStop(0.58, o.fill2); gr.addColorStop(1, o.fill2);
    g.fillStyle = gr;
  } else g.fillStyle = o.fill || K.PAPER;
  g.fillText(text, 0, 0);
  g.restore();
};

// ---- buttons ---------------------------------------------------------------------------------
// Which menu button of the active layer has keyboard focus (uses last frame's menu list, as
// the shell's Enter handler does).
K.menuIndex = function (ui, layer) {
  const menu = ui.lastButtons.filter((b) => b.menu && b.layer === layer);
  return menu.length ? ui.focus % menu.length : -1;
};
K.focusedButton = function (ui) {
  const L = ui.activeLayer() === 'hud' ? 'screen' : ui.activeLayer();
  const menu = ui.lastButtons.filter((b) => b.menu && b.layer === L);
  return menu.length ? menu[ui.focus % menu.length] : null;
};

// Declares a hit area (shell button, style 'none') and draws a slanted ink button.
// spec: {id, x, y, w, h, label, sub, onTap, onPress, menu, kind: 'primary'|'plain'|'quiet'|'danger',
//        size, disabled, slant, icon(g, cx, cy), selected, hitPad}
K.button = function (ui, spec) {
  const pad = spec.hitPad || 0;
  const layer = ui.layer;
  const idx = spec.menu ? ui.buttons.filter((b) => b.menu && b.layer === layer).length : -1;
  const b = ui.button({
    id: spec.id, label: spec.label, menu: !!spec.menu, style: 'none', disabled: !!spec.disabled,
    x: spec.x - pad, y: spec.y - pad, w: spec.w + 2 * pad, h: spec.h + 2 * pad,
    onTap: spec.disabled ? null : spec.onTap, onPress: spec.disabled ? null : spec.onPress,
  });
  const g = ui.g;
  const focused = spec.menu && ui.activeLayer() === layer && idx === K.menuIndex(ui, layer);
  b.focused = focused;
  if (spec.bare) return b; // hit area + focus only; the caller draws
  const kind = spec.kind || 'plain';
  const s = spec.slant === undefined ? Math.min(10, spec.h * 0.16) : spec.slant;
  const edge = spec.disabled ? '#3a3a40' : kind === 'primary' ? K.GOLD : kind === 'danger' ? '#e05a4a' : kind === 'quiet' ? '#4a4850' : '#8d877c';
  K.panel(g, spec.x, spec.y, spec.w, spec.h, {
    slant: s, edge: focused || spec.selected ? K.PAPER : edge, edgeW: focused ? 3 : 2,
    facet: kind === 'primary' ? '#2a2418' : K.INK2, shadow: spec.disabled ? 2 : 4,
  });
  if (focused) {
    // a small gold pointer on the left edge
    const cy = spec.y + spec.h / 2, lx = spec.x - s - 14;
    K.poly(g, [[lx - 10, cy - 9], [lx + 2, cy], [lx - 10, cy + 9]]); g.fillStyle = K.GOLD_HI; g.fill(); K.ink(g, 2);
  }
  const col = spec.disabled ? '#5c5a58' : kind === 'primary' ? K.GOLD_HI : K.PAPER;
  const size = spec.size || 24;
  let cx = spec.x + spec.w / 2;
  if (spec.icon) { spec.icon(g, spec.x + 34, spec.y + spec.h / 2); cx += 16; }
  if (spec.label) {
    const ly = spec.sub ? spec.y + spec.h / 2 - 4 : spec.y + spec.h / 2 + 1;
    K.text(ui, spec.label, cx, ly, { size, color: col, align: 'center', base: 'middle', weight: 800, maxW: spec.w - 20 });
  }
  if (spec.sub) K.text(ui, spec.sub, cx, spec.y + spec.h / 2 + size * 0.7, { size: spec.subSize || Math.round(size * 0.66), color: spec.disabled ? '#4a4846' : K.DIM, align: 'center', base: 'middle', weight: 600, maxW: spec.w - 20 });
  b.focused = focused;
  return b;
};

// Bars: slanted value bar with an ink frame. o: {chip (0..1 white trailing value), color, back}
K.bar = function (g, x, y, w, h, k, o) {
  o = o || {};
  const s = o.slant === undefined ? h * 0.45 : o.slant;
  K.poly(g, K.slantPts(x + 3, y + 3, w, h, s)); g.fillStyle = K.INK; g.fill();
  K.poly(g, K.slantPts(x, y, w, h, s)); g.fillStyle = o.back || '#24222a'; g.fill();
  const inner = (kk, color) => {
    if (kk <= 0) return;
    const iw = (w - 6) * K.clamp(kk, 0, 1);
    g.save(); K.poly(g, K.slantPts(x, y, w, h, s)); g.clip();
    K.poly(g, K.slantPts(x + 3, y + 3, iw, h - 6, s * (h - 6) / h)); g.fillStyle = color; g.fill();
    g.restore();
  };
  if (o.chip !== undefined && o.chip > k) inner(o.chip, '#ffffff');
  inner(k, o.color || K.HP);
  // two-tone: darker lower half on the fill
  if (k > 0) {
    g.save(); K.poly(g, K.slantPts(x, y, w, h, s)); g.clip();
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - s, y + h * 0.58, (w - 6) * K.clamp(k, 0, 1) + s + 4, h);
    g.restore();
  }
  if (o.ticks) for (const tk of o.ticks) {
    const tx = x + 3 + (w - 6) * tk;
    g.beginPath(); g.moveTo(tx + s, y); g.lineTo(tx - s, y + h); K.ink(g, 3);
  }
  K.poly(g, K.slantPts(x, y, w, h, s)); K.ink(g, 3);
};

// Pointer-only zone (no drawing). Returns the shell button.
K.hit = (ui, spec) => ui.button(Object.assign({ style: 'none' }, spec));

// Layout helper: safe text for clock strings from seconds (for records).
K.clockOf = function (sec, runSec) {
  const m = Math.floor(C.CLOCK_START_MIN + (sec * 720) / (runSec || C.RUN_SEC) + 1e-6) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
K.mmss = function (sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + '분 ' + String(sec % 60).padStart(2, '0') + '초';
};

// ---- shared UI state (toasts, banners, slot animations, hint memory) -----------------------
U.S = {
  toasts: [], banner: null, slots: [{}, {}, {}], flights: [], letters: [],
  hpChip: { v: 100, t: 0 }, lastInput: 'key', reset: null,
};
