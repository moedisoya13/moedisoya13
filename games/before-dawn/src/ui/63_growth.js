// Growth on screen (GDD-V2 §4.3, §5.7, §7.2): the choice overlay (셋 중 하나), the light gauge
// with the level, the pick's flight to its slot, the shockwave ring, the white outline on a card's
// strike after a shape-changing level, the shards and the pick-up ring on the floor.
// Everything is read from the world (w.choice, w.hero.level/xp/xpNeed, w.shards, events); nothing
// here changes a rule.
//
// The overlay opens every 15–40 s, so it is built to be read and answered in a second or two:
//  - three tall cards rise from below (0.2 s); each shows the icon in a gold socket, the name, the
//    kind (성인 · family / 단련 / 회복), level pips (what it has, what this adds) with 2단계 → 3단계,
//    a 모양이 바뀐다 tag on the shape-changing card levels (3 and 5), and the line the level adds in
//    the card's own words (the def's levels[n].text, as w.choice gives it) set large;
//  - keys 1 · 2 · 3, ←/→ + Enter (Space never picks: it is the dash), mouse click (hover focuses),
//    touch tap — a tap picks only when it went down AND up on the same card, started after the
//    0.35 s lock (§4.3: the borders stay dark while it runs) and did not travel (a drag is the
//    thumb steering, not a choice). The thumb already holding the stick when the overlay opens is
//    the joystick's pointer and never reaches the overlay;
//  - on a phone (picture below ×0.74) the cards fill the height and the type is ~35 % larger.
// Option kinds other branches may add (chest, altar, unknown) draw by name and text with a
// lettered seal; a card without level text shows its level number.

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const IC = BD.ui.icons;
const NAV = BD.ui.nav;
const M = BD.math;
const LOCK = 0.35;  // s: no input right after the overlay opens (§4.3)
const RISE = 0.2;   // s: the cards come up from below (§7.2)
const SHARD = '#ffe9a8';
const BOON_COLOR = '#e8c47a';
const CH = BD.ui.choice = { LOCK, openAt: -9, key: null, focus: 0, kbd: false, hover: -1, press: null, rects: [], exit: null, wave: null, outline: {}, picks: 0 };
const GR = BD.ui.growth = { gaugeFlash: 0, tipFlash: 0, shown: 0, lastShard: -9, shardStep: 0 }; // gauge animation state

// ---- what an option is ---------------------------------------------------------------------------
const cardDef = (id) => (id && BD.cards.has(id) ? BD.cards.get(id) : null);
const boonDef = (id) => (id && BD.boons.has(id) ? BD.boons.get(id) : null);
function optionInfo(o) {
  const def = o.kind === 'card' ? cardDef(o.id) : null;
  if (o.kind === 'card') {
    const max = def ? BD.cardRt.maxLevel(def) : C.V2.maxCardLevel;
    const fam = def ? def.family : null;
    const text = o.text && (!def || o.text !== def.desc || !def.levels) ? o.text : o.to ? o.to + '단계로 오른다' : '';
    return { def, color: K.famColor(fam), tag: (K.FAMILY_NAMES[fam] ? K.FAMILY_NAMES[fam] + ' 성인' : '성인'), max: Math.max(max, o.to || 1), from: o.from || 0, to: o.to || 0, text, shape: o.to === 3 || o.to === 5, glyph: null };
  }
  if (o.kind === 'boon') {
    const b = boonDef(o.id);
    return { def: null, color: BOON_COLOR, tag: '단련', max: Math.max(b ? b.max : 3, o.to || 1), from: o.from || 0, to: o.to || 0, text: o.text || '', shape: false, glyph: 'boon:' + o.id };
  }
  if (o.kind === 'breath') return { def: null, color: '#ffe2a8', tag: '회복', max: 0, from: 0, to: 0, text: o.text || '', shape: false, glyph: 'breath' };
  return { def: null, color: '#c9c2b4', tag: o.tag || '선택', max: 0, from: 0, to: 0, text: o.text || '', shape: false, glyph: o.glyph || o.kind + ':' + (o.id || '') };
}
const TITLES = { level: (w) => '성장 — Lv ' + ((w.choice && w.choice.level) || w.hero.level), chest: () => '상자 — 성인 하나를 올린다', altar: () => '제단' };
function titleOf(w) { const k = w.choice && w.choice.kind; return (TITLES[k] || (() => '셋 중 하나'))(w); }

// ---- layout ------------------------------------------------------------------------------------------
function layout(ui, n) {
  const ph = K.phone(ui);
  const top = ph ? 96 : 120, h = ph ? 590 : 430, gap = ph ? 18 : 30;
  const cw = Math.min(ph ? 404 : 372, (C.VIEW_W - (ph ? 28 : 70) - (n - 1) * gap) / Math.max(1, n));
  const x0 = C.VIEW_W / 2 - (n * cw + (n - 1) * gap) / 2;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * (cw + gap), y: top, w: cw, h });
  return out;
}
CH.layout = layout;

// fit a paragraph into maxW × maxH (sizes tried in order); returns {size, lines}
function fitLines(g, text, maxW, maxH, sizes, weight) {
  for (const s of sizes) { const L = K.wrap(g, text, maxW, s, weight); if (L.length * Math.round(s * 1.3) <= maxH) return { size: s, lines: L }; }
  const s = sizes[sizes.length - 1], n = Math.max(1, Math.floor(maxH / Math.round(s * 1.3)));
  const L = K.wrap(g, text, maxW, s, weight).slice(0, n);
  return { size: s, lines: L };
}

function drawOption(ui, o, i, r, st) {
  const g = ui.g, ph = K.phone(ui), info = optionInfo(o);
  const { x, w, h } = r;
  const y = r.y + st.lift;
  const cx = x + w / 2;
  g.save();
  if (st.scale !== 1) { g.translate(cx, y + h / 2); g.scale(st.scale, st.scale); g.translate(-cx, -(y + h / 2)); }
  if (st.alpha < 1) g.globalAlpha = st.alpha;
  const edge = st.locked ? '#34323a' : st.focused ? K.PAPER : info.color;
  K.panel(g, x, y, w, h, { slant: 8, edge, edgeW: st.focused ? 5 : 3, facet: st.focused ? '#25232c' : K.INK2, facetK: 0.36, shadow: st.focused ? 8 : 5 });
  // family colour band along the top edge, dimmed while locked
  g.fillStyle = st.locked ? '#2a2830' : info.color;
  K.poly(g, K.slantPts(x + 14, y + 8, w - 28, 6, 1)); g.fill();
  const dimK = st.locked ? 0.55 : 1;
  g.globalAlpha *= dimK;
  // number key badge (1 · 2 · 3)
  const br = ph ? 22 : 17;
  K.circle(g, x + 16 + br, y + 18 + br, br); g.fillStyle = '#121117'; g.fill(); K.ink(g, 2.5, st.focused ? K.PAPER : '#5c5a62');
  K.text(ui, String(i + 1), x + 16 + br, y + 19 + br, { size: ph ? 30 : 22, align: 'center', base: 'middle', weight: 900, color: st.focused ? K.PAPER : K.DIM });
  // kind tag, top right
  K.text(ui, info.tag, x + w - 20, y + (ph ? 52 : 44), { size: ph ? 25 : 19, align: 'right', weight: 800, color: info.color, maxW: w - 90 });
  // icon in a gold socket
  const iy = y + (ph ? 128 : 104), ib = ph ? 116 : 96;
  K.poly(g, [[cx - ib / 2 - 5, iy - ib / 2 - 5], [cx + ib / 2 + 5, iy - ib / 2 - 5], [cx + ib / 2 + 5, iy + ib / 2 + 5], [cx - ib / 2 - 5, iy + ib / 2 + 5]]); g.fillStyle = '#b08a3a'; g.fill(); K.ink(g, 3);
  K.poly(g, [[cx - ib / 2, iy - ib / 2], [cx + ib / 2, iy - ib / 2], [cx + ib / 2, iy + ib / 2], [cx - ib / 2, iy + ib / 2]]); g.fillStyle = '#121117'; g.fill(); K.ink(g, 2.5);
  if (o.kind === 'card') IC.card(g, info.def || { id: o.id, name: o.name }, cx, iy, ib * 0.8);
  else IC.glyph(g, info.glyph, cx, iy, ib * 0.78, { letter: o.name ? [...o.name][0] : '?' });
  // name
  const ny = iy + ib / 2 + (ph ? 54 : 46);
  K.text(ui, o.name || o.id || '?', cx, ny, { size: ph ? 44 : 33, align: 'center', weight: 900, color: K.PAPER, maxW: w - 34, stroke: 4 });
  // level pips + 2단계 → 3단계
  let ty = ny + (ph ? 26 : 22);
  if (info.max > 0 && info.to > 0) {
    const pr = ph ? 10 : 8, sp = ph ? 32 : 26, py = ty + pr + 2;
    for (let k = 0; k < info.max; k++) {
      const px = cx + (k - (info.max - 1) / 2) * sp, isNew = k >= info.from && k < info.to;
      K.circle(g, px, py, isNew ? pr + 2 : pr);
      g.fillStyle = k < info.from ? K.GOLD : isNew ? '#ffffff' : '#2a2830'; g.fill(); K.ink(g, 2.4);
      if (isNew && !st.locked) { K.circle(g, px, py, pr + 6 + Math.sin(ui.time * 7) * 1.5); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke(); }
    }
    ty = py + pr + (ph ? 40 : 32);
    const stage = (info.from ? info.from + '단계 → ' : '') + info.to + '단계';
    K.text(ui, stage, cx, ty, { size: ph ? 32 : 25, align: 'center', weight: 900, color: K.GOLD_HI, stroke: 4 });
    if (info.shape) {
      ty += ph ? 34 : 28;
      const tag = '모양이 바뀐다', tw = K.measure(g, tag, ph ? 22 : 17, 900) + 22;
      K.poly(g, K.slantPts(cx - tw / 2, ty - (ph ? 22 : 17), tw, ph ? 30 : 24, 4)); g.fillStyle = '#f3ead8'; g.fill(); K.ink(g, 2);
      K.text(ui, tag, cx, ty - (ph ? 2 : 1), { size: ph ? 22 : 17, align: 'center', weight: 900, color: K.INK });
    }
  }
  // the line this level adds, large
  const top = ty + (ph ? 24 : 20), bottom = y + h - (ph ? 22 : 20);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 22, top - (ph ? 12 : 10), w - 44, 2);
  const f = fitLines(g, info.text, w - (ph ? 40 : 50), bottom - top, ph ? [36, 33, 30, 27] : [27, 25, 23, 21, 19], 800);
  CH.lineSize = Math.min(CH.lineSize || 99, f.size); // the smallest level line this frame (tests)
  const lh = Math.round(f.size * 1.3);
  const y0 = top + Math.max(0, (bottom - top - f.lines.length * lh) / 2 - 8) + f.size;
  f.lines.forEach((ln, k) => K.text(ui, ln, cx, y0 + k * lh, { size: f.size, align: 'center', weight: 800, color: '#fff7e6' }));
  g.restore();
}

// ---- input -----------------------------------------------------------------------------------------
const openFor = (ui) => ui.time - CH.openAt;
const locked = (ui) => openFor(ui) < LOCK;
function at(x, y) { for (let i = 0; i < CH.rects.length; i++) { const r = CH.rects[i]; if (x >= r.x - 8 && x <= r.x + r.w + 8 && y >= r.y && y <= r.y + r.h) return i; } return -1; }
CH.pick = function (ui, i) {
  const w = ui.world;
  if (!w || !w.choiceOpen || !w.choice || !w.choice.options[i]) return false;
  CH.exitFrom = { rects: CH.rects.map((r) => Object.assign({}, r)), options: w.choice.options.slice(), i, kind: w.choice.kind };
  ui.app.cmd('choice', 'pick', i);
  CH.picks++;
  return true;
};

BD.ui.overlays.register({
  id: 'choice',
  draw(g, ui) {
    const w = ui.world, ch = w && w.choice;
    if (!ch) return;
    if (CH.key !== ch) { CH.key = ch; CH.openAt = ui.time; CH.focus = 0; CH.press = null; CH.exit = null; NAV.focus0(ui); }
    const age = openFor(ui), lk = age < LOCK, ph = K.phone(ui);
    K.dim(g, 0.72);
    const n = ch.options.length;
    CH.rects = layout(ui, n);
    CH.lineSize = 99;
    const rise = (1 - K.ease(Math.min(1, age / RISE))) * 90;
    // the title on its own ink ribbon, over the HUD's top bar
    const title = titleOf(w), tsz = ph ? 54 : 44, tw = K.measure(g, title, tsz, 900) + 90;
    K.panel(g, 640 - tw / 2, ph ? 24 : 40, tw, ph ? 64 : 58, { slant: 16, shadow: 4, facet: '#1e1c24', edge: '#7a5a22' });
    K.letter(g, title, 640, ph ? 76 : 84, { size: tsz, fill: K.PAPER, fill2: '#e8c47a', alpha: Math.min(1, age / 0.12) });
    ch.options.forEach((o, i) => {
      const r = CH.rects[i];
      // the keyboard focus shows once a key moved it, or from the start for a keyboard player
      const keyFocus = CH.kbd || (S.lastInput === 'key' && CH.hover < 0);
      const focused = !lk && (keyFocus ? CH.focus === i : CH.hover === i);
      const pressed = CH.press && CH.press.i === i && !CH.press.moved && !lk;
      drawOption(ui, o, i, r, { lift: rise + (focused && !pressed ? -6 : 0), scale: pressed ? 0.97 : 1, alpha: Math.min(1, age / RISE + 0.2), locked: lk, focused: focused || pressed });
    });
    // the 0.35 s lock as a thin bar under the title (the borders are dark until it ends)
    if (lk) { const k = age / LOCK; g.fillStyle = '#8d877c'; g.fillRect(640 - 120, (ph ? 86 : 96), 240 * k, 3); }
    const hint = S.lastInput === 'touch' ? '카드를 두드려 고른다' : '1 · 2 · 3   또는   ← → + Enter';
    if (!ph) K.text(ui, hint, 640, 576, { size: 19, align: 'center', color: K.DIM, weight: 700, stroke: 4 });
  },
  key(ev, ui) {
    const w = ui.world, ch = w && w.choice;
    if (!ch || !w.choiceOpen) return false;
    if (locked(ui) || ev.repeat) return true; // swallow keys during the lock and key repeats
    const n = ch.options.length;
    const d = /^Digit([1-9])$/.exec(ev.code) || /^Numpad([1-9])$/.exec(ev.code);
    if (d) { if (+d[1] <= n) CH.pick(ui, +d[1] - 1); return true; }
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowUp' || ev.code === 'KeyA' || ev.code === 'KeyW') { if (CH.kbd) CH.focus = (CH.focus + n - 1) % n; CH.kbd = true; ui.sfxSafe('ui_move'); return true; }
    if (ev.code === 'ArrowRight' || ev.code === 'ArrowDown' || ev.code === 'KeyD' || ev.code === 'KeyS') { if (CH.kbd) CH.focus = (CH.focus + 1) % n; CH.kbd = true; ui.sfxSafe('ui_move'); return true; }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { CH.pick(ui, Math.min(n - 1, CH.focus)); return true; }
    return true; // nothing else (Space, Esc) does anything here
  },
  // presses no button took: the overlay declares no buttons, so every press on it comes here
  pointer(ev, ui) {
    const w = ui.world;
    if (!w || !w.choiceOpen) return false;
    const slop = 24 / ui.view.scale; // a tap may wander this far (CSS px) and still be a tap
    if (ev.type === 'down') {
      CH.kbd = false;
      // a press where the dash button sits is the dash thumb (on a phone the third card reaches
      // over it): it never picks
      const [dx, dy] = BD.ui.dashCenter(ui), dh = BD.ui.dashSize(ui).hit / 2;
      const onDash = Math.abs(ev.x - dx) <= dh && Math.abs(ev.y - dy) <= dh;
      CH.press = { id: ev.id, i: locked(ui) || onDash ? -1 : at(ev.x, ev.y), x: ev.x, y: ev.y, moved: false };
      return true;
    }
    const p = CH.press;
    if (!p || p.id !== ev.id) return true;
    if (Math.hypot(ev.x - p.x, ev.y - p.y) > slop) p.moved = true;
    if (ev.type === 'up') {
      CH.press = null;
      if (p.i >= 0 && !p.moved && at(ev.x, ev.y) === p.i) { ui.sfxSafe('ui_ok'); CH.pick(ui, p.i); }
    }
    return true;
  },
});

// mouse hover focuses a card (no press needed); touch never hovers
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const ui = BD.client.shell && BD.client.shell.ui;
    if (!ui || ui.app.overlay() !== 'choice') return;
    const cv = document.getElementById('bd');
    if (!cv) return;
    const r = cv.getBoundingClientRect(), [x, y] = ui.view.toLogical(ev.clientX - r.left, ev.clientY - r.top);
    CH.hover = at(x, y);
    if (CH.hover >= 0) { CH.kbd = false; CH.focus = CH.hover; }
  });
}

// ---- after the pick: the card flies to its slot (or the gauge), the others drop away, a ring
// pushes out from the hero; a shape-changing level outlines that card's strikes for a second ------
const FLY = 0.38;
function flightTarget(w, o) {
  if (o.kind === 'card') { const i = w.cards.findIndex((c) => c && c.id === o.id); if (i >= 0) return BD.slotCenter(i); }
  if (o.kind === 'breath') return [227, 34];
  return [404, 592]; // the Lv label of the gauge
}
function drawExit(g, ui) {
  const X = CH.exit, w = ui.world;
  if (!X || !w) return;
  const age = ui.time - X.t0;
  if (age > FLY + 0.1) { CH.exit = null; return; }
  X.rects.forEach((r, i) => {
    const o = X.options[i];
    if (i === X.i) return;
    const k = Math.min(1, age / 0.16);
    drawOption(ui, o, i, r, { lift: k * 120, scale: 1, alpha: 1 - k, locked: false, focused: false });
  });
  const r = X.rects[X.i], o = X.options[X.i], [tx, ty] = flightTarget(w, o);
  const k = K.ease(Math.min(1, age / FLY)), sx = r.x + r.w / 2, sy = r.y + (K.phone(ui) ? 128 : 104);
  const x = K.lerp(sx, tx, k), y = K.lerp(sy, ty, k) - Math.sin(k * Math.PI) * 60, s = K.lerp(96, 46, k);
  if (age < 0.12) drawOption(ui, o, X.i, r, { lift: -age * 80, scale: 1 + age * 0.5, alpha: 1 - age / 0.12, locked: false, focused: true });
  g.save(); g.globalAlpha = age > FLY ? Math.max(0, 1 - (age - FLY) / 0.1) : 1;
  K.circle(g, x, y, s * 0.62); g.fillStyle = 'rgba(255,240,200,0.25)'; g.fill();
  if (o.kind === 'card') IC.card(g, cardDef(o.id) || { id: o.id, name: o.name }, x, y, s);
  else IC.glyph(g, o.kind === 'boon' ? 'boon:' + o.id : 'breath', x, y, s);
  g.restore();
}

// ---- the gauge: 420 × 10 px above the card tray (§5.7), Lv N on its left; the fill eases after a
// pick-up and its tip flashes; it pulses above 90 %; a level up sweeps it white, then it empties.
// On a phone it is 16 px tall and the label larger. -------------------------------------------------
BD.ui.gaugeRect = (ui) => { const ph = K.phone(ui); return { x: 430, y: ph ? 584 : 590, w: 420, h: ph ? 16 : 12 }; };
BD.ui.hud.register({
  id: 'gauge',
  order: 31,
  draw(g, ui) {
    const w = ui.world, h = w && w.hero;
    if (!h || h.level === undefined || !h.xpNeed) return;
    const R = BD.ui.gaugeRect(ui), ph = K.phone(ui);
    const k = K.clamp(h.xp / h.xpNeed, 0, 1);
    if (GR.shown > k || GR.gaugeFlash > 0) GR.shown = GR.gaugeFlash > 0 ? 1 : k; // a level up: full, then from 0
    GR.shown = Math.min(k, GR.shown + Math.max(0.004, (k - GR.shown) * Math.min(1, ui.dt * 14)));
    const show = GR.gaugeFlash > 0 ? 1 : GR.shown;
    K.text(ui, 'Lv ' + h.level, R.x - 12, R.y + R.h - (ph ? 0 : 1), { size: ph ? 32 : 22, align: 'right', weight: 900, color: K.GOLD_HI, stroke: 5 });
    K.poly(g, K.slantPts(R.x - 3, R.y - 3, R.w + 6, R.h + 6, 3)); g.fillStyle = K.INK; g.fill();
    g.fillStyle = '#2a2830'; g.fillRect(R.x, R.y, R.w, R.h);
    const pulse = k >= 0.9 && GR.gaugeFlash <= 0 ? 0.72 + 0.28 * Math.sin(ui.time * 8) : 1;
    g.globalAlpha = pulse; g.fillStyle = SHARD; g.fillRect(R.x, R.y, R.w * show, R.h); g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(R.x, R.y + R.h * 0.6, R.w * show, R.h * 0.4); // two tones
    // tip flash on a pick-up
    const tf = Math.max(0, GR.tipFlash);
    g.fillStyle = '#ffffff'; g.fillRect(R.x + R.w * show - 2 - tf * 6, R.y - tf * 4, 2 + tf * 12, R.h + tf * 8);
    if (GR.gaugeFlash > 0) { // level up: a white sweep over the bar
      const t = 1 - GR.gaugeFlash / 0.32;
      g.globalAlpha = Math.min(1, GR.gaugeFlash / 0.2); g.fillStyle = '#ffffff'; g.fillRect(R.x, R.y, R.w * Math.min(1, t * 2.2), R.h); g.globalAlpha = 1;
    }
    // quarter ticks
    g.fillStyle = K.INK; for (let q = 1; q < 4; q++) g.fillRect(R.x + (R.w * q) / 4 - 1, R.y, 2, R.h);
  },
});

// The task count for the top centre (40_hud.js): the def's label, else name value/goal.
BD.ui.taskLabel = function (w) {
  const t = w.task;
  if (!t) return null;
  const def = BD.tasks.has(t.kind) ? BD.tasks.get(t.kind) : null;
  try { if (def && def.label) return def.label(t); } catch (err) { /* fall through */ }
  return (t.name || (def && def.name) || t.kind) + ' ' + t.value + '/' + t.goal;
};

// ---- the floor: shards and the pick-up ring (layer 'floor', under the actors) -----------------
function diamond(g, x, y, s, fill) {
  g.beginPath(); g.moveTo(x, y - s * 1.3); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.3); g.lineTo(x - s, y); g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 1.6; g.strokeStyle = K.INK; g.stroke();
}
function outlineShape(g, v, s) {
  const pts = [];
  if (s.kind === 'fan') {
    pts.push(v.proj(s.x, s.y, 2));
    for (let i = 0; i <= 12; i++) { const a = s.dir - s.half + (2 * s.half * i) / 12; pts.push(v.proj(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, 2)); }
  } else if (s.kind === 'line') {
    const c = Math.cos(s.dir), sn = Math.sin(s.dir), hw = (s.width || 0.8) / 2;
    for (const [a, b] of [[0, -hw], [s.len, -hw], [s.len, hw], [0, hw]]) pts.push(v.proj(s.x + c * a - sn * b, s.y + sn * a + c * b, 2));
  } else if (s.kind === 'circle' || s.kind === 'ring') {
    const r = s.r || s.r1 || 1;
    for (let i = 0; i < 20; i++) { const a = (i / 20) * M.TAU; pts.push(v.proj(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 2)); }
  } else return;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(10,10,12,0.5)'; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.stroke();
}

BD.ui.effects.register({
  id: 'shards',
  reset() { GR.gaugeFlash = 0; GR.tipFlash = 0; GR.shown = 0; GR.shardStep = 0; GR.lastShard = -9; CH.exit = null; CH.wave = null; CH.outline = {}; CH.strikes = []; CH.key = null; },
  on: {
    level_up(ev, ui) { GR.gaugeFlash = 0.32; },
    pickup(ev, ui) {
      if (ev.kind !== 'shard') return;
      GR.tipFlash = 1;
      // §7.2: picks within 0.5 s climb a semitone each (12 steps), at most 20 a second
      const t = ui.time;
      GR.shardStep = t - GR.lastShard < 0.5 ? Math.min(12, GR.shardStep + 1) : 0;
      if (t - GR.lastShard >= 0.05) { GR.lastShard = t; ui.sfxSafe('shard', { step: GR.shardStep }); }
    },
    choice_open(ev, ui) { ui.sfxSafe('choice_open'); },
    choice_pick(ev, ui) {
      ui.sfxSafe('card_set'); ui.sfxSafe('choice_pick');
      const X = CH.exitFrom;
      CH.exit = X ? Object.assign({ t0: ui.time }, X) : null;
      CH.exitFrom = null;
      const h = ui.world.hero;
      CH.wave = { t0: ui.time, x: h.x, y: h.y };
    },
    card_level(ev, ui) {
      const i = ui.world.cards.findIndex((c) => c && c.id === ev.cardId);
      if (i >= 0) { const s = S.slots[i] || (S.slots[i] = {}); s.levelAt = ui.time + FLY * 0.9; s.level = ev.level; }
      if (ev.level === 3 || ev.level === 5) CH.outline[ev.cardId] = ui.world.t + 1.0; // first second of play
    },
    strike(ev, ui) {
      const w = ui.world, ids = Object.keys(CH.outline);
      if (!ids.length) return;
      for (const id of ids) {
        if (w.t > CH.outline[id]) { delete CH.outline[id]; continue; }
        for (const s of ev.shapes) if (s.card === id) CH.strikes.push({ s, t0: ui.time });
      }
      if (CH.strikes.length > 12) CH.strikes.splice(0, CH.strikes.length - 12);
    },
  },
  update(dt) {
    if (GR.gaugeFlash > 0) GR.gaugeFlash -= dt;
    if (GR.tipFlash > 0) GR.tipFlash -= dt * 6;
  },
  draw(g, ui, layer) {
    const w = ui.world;
    if (!w || ui.app.mode !== 'play') return;
    const v = ui.view, h = w.hero, R = BD.client.render;
    if (layer === 'floor' && w.shards) {
      if (!h.dead && h.pickupR) R.ellipse(g, v, h.x, h.y, h.pickupR, 'rgba(255,233,168,0.12)', 'rgba(255,233,168,0.3)', 1.5);
      const t = ui.time;
      for (const s of w.shards) {
        if (!R.flatOn(v, s.x, s.y, 0.3)) continue;
        const z = s.popT > 0 ? Math.sin((1 - s.popT / C.V2.shard.pop) * Math.PI) * 18 : 4 + 2 * Math.sin(t * 4 + s.id);
        const [px, py] = v.proj(s.x, s.y, z);
        const sz = s.v >= 25 ? 9 : s.v >= 5 ? 6.5 : 4.5;
        if (s.pull) { const [tx, ty] = v.proj(s.x + (s.x - h.x) * 0.1, s.y + (s.y - h.y) * 0.1, z); g.strokeStyle = 'rgba(255,233,168,0.65)'; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty); g.lineTo(px, py); g.stroke(); }
        if (s.v >= 25) { g.save(); g.translate(px, py); g.rotate(t * 1.5 + s.id); diamond(g, 0, 0, sz, SHARD); g.restore(); }
        else diamond(g, px, py, sz, SHARD);
        g.fillStyle = '#ffffff'; g.fillRect(px - sz * 0.25, py - sz * 0.4, sz * 0.5, sz * 0.8);
      }
      // the pick's shockwave: a ring out to 3u (§4.3)
      if (CH.wave) {
        const k = (ui.time - CH.wave.t0) / 0.35;
        if (k >= 1) CH.wave = null;
        else { const r = 0.6 + k * (C.V2.choice.shoveR - 0.6); R.ellipse(g, v, CH.wave.x, CH.wave.y, r, null, 'rgba(255,246,220,' + (0.9 * (1 - k)) + ')', 5 * (1 - k) + 1.5); }
      }
    }
    if (layer === 'world' && CH.strikes && CH.strikes.length) {
      CH.strikes = CH.strikes.filter((x) => ui.time - x.t0 < 0.22);
      for (const x of CH.strikes) { g.globalAlpha = 1 - (ui.time - x.t0) / 0.22; outlineShape(g, v, x.s); }
      g.globalAlpha = 1;
    }
    if (layer === 'screen' && !ui.app.overlay()) drawExit(g, ui);
  },
});
