// Shared kit for the 18 cards (GDD §5): rule helpers several cards need and the drawing
// helpers their trail / vfx / decor drawers share. Defines BD.cardKit; registers nothing.
// Sorted before the card files ('_' < 'a'), so card files may read BD.cardKit at load time.
//
// Rule helpers run in the simulation (deterministic, DOM-free). The drawing helpers under
// K.draw take a canvas context and are only ever called by the browser renderer.

const M = BD.math;
const K = BD.cardKit = {};

K.ELEMENT_COLORS = { tide: '#3aa0ff', lightning: '#bfe9ff', flame: '#ff5a2a' };
K.ORANGE = '#ff9a3c';   // the hero's blade and trails (LEAD §4)
K.INK = '#0a0a0c';
K.GOLD = '#ffd24a';
K.PURPLE = '#9b59d0';

// ---- rule helpers ------------------------------------------------------------------------

K.card = (w, id) => BD.cardRt.get(w, id);
K.has = (w, id) => BD.cardRt.has(w, id);
K.stack = (w, id) => { const c = BD.cardRt.get(w, id); return c ? c.state.stack || 0 : 0; };
K.awakened = (w, id) => { const c = BD.cardRt.get(w, id); return !!(c && c.state.awakened); };
// the merged level numbers (ctx.lv) of an equipped card, or null
K.lvOf = (w, id) => { const c = BD.cardRt.get(w, id); return c ? BD.cardRt.lv(c.def, c.level || 1) : null; };

// 관통 geometry (GDD §5.3) and 일섬's stages (§5.5, GDD-V2 §4.4): from its pierce stack (4, or 3 at
// 일섬 4단계) the swing has a pierce line, at 8 the pierce line (the card's or 일섬's) is 6.0u × 1.4u.
K.PIERCE = { len: 4.2, width: 0.9 };
K.PIERCE_BIG = { len: 6.0, width: 1.4 };
K.flashPierce = (w) => { const lv = K.lvOf(w, 'one_flash'); return !!lv && K.stack(w, 'one_flash') >= lv.pierceAt; };
K.hasPierce = (w) => K.has(w, 'pierce') || K.flashPierce(w);
K.pierceSize = (w) => (K.stack(w, 'one_flash') >= 8 ? K.PIERCE_BIG : K.PIERCE);

// Quest feasibility at the altar (GDD-V2 §4.4): info from BD.cardAltar.remaining — {floor,
// floorsLeft, domTypes} for the floors after this one (up to 5F). The v1 runtime's offers pass
// {byType, guardians, floor}: read as "floors left = guardians left".
K.floorsLeft = (info) => (info.floorsLeft !== undefined ? info.floorsLeft : info.guardians || 0);
K.typesLeft = (info) => info.domTypes || Object.keys(info.byType || {}).filter((k) => info.byType[k] > 0);

// Every Nth hitting swing (GDD-V2 §4.4 "베기 N번째마다", only swings that hit count): a card keeps
// state.n += 1 on each swing_end with hits; the swing whose earlier count is ≡ N − 1 (mod N) is it.
K.nthSwing = (state, every) => every > 0 && (state.n || 0) % every === every - 1;

// Enemy type of a `hit` / `kill` payload. The bus overwrites the payload's GDD `type` field with
// the event name (docs/requests/cards.md #1), so read it from the kind instead.
K.etype = (ev) => (ev.kind && BD.enemies.has(ev.kind) ? BD.enemies.get(ev.kind).type : null);

// GDD §0 distance: from a point to the enemy's edge.
K.edgeFrom = (x, y, e) => M.dist(x, y, e.x, e.y) - e.r;

// Fixed-damage explosion (source 'burst', indirect: ignores the front guard) on every enemy
// whose edge is within r of (x, y), except skipId and enemies already at HP ≤ 0. Corpses (a
// downed ghoul) are hit. `before(e)` runs first on each victim (ignition). Returns the victims.
K.burst = function (ctx, x, y, r, dmg, skipId, before) {
  const out = [];
  let total = 0;
  for (const e of ctx.w.enemies.slice()) {
    if (e.dead || e.id === skipId || e.hp <= 0) continue;
    if (K.edgeFrom(x, y, e) > r + 1e-9) continue;
    if (before) before(e);
    total += ctx.damage(e, dmg, { source: 'burst', direct: false });
    out.push(e);
  }
  if (total) ctx.credit(total);
  return out;
};

K.vfx = (ctx, kind, o) => ctx.emit('vfx', Object.assign({ kind }, o || {}));
K.r3 = (v) => Math.round(v * 1000) / 1000;

// "구울의 달려들기" from a hurt payload (source = enemy kind | 'zone', attack = attack id).
K.attackName = function (w, ev) {
  let def = ev.source && BD.enemies.has(ev.source) ? BD.enemies.get(ev.source) : null;
  if (!def && ev.enemyId !== null && ev.enemyId !== undefined) { const e = BD.W.enemyById(w, ev.enemyId); if (e) def = e.def; }
  if (!def && ev.attack) def = BD.enemies.all().find((d) => d.attacks && d.attacks[ev.attack]) || null;
  if (!def) return '피격';
  const a = def.attacks && def.attacks[ev.attack];
  return def.name + '의 ' + (a ? a.name : ev.attack || '공격');
};

// Once per world (first steam toast …). Presentation bookkeeping only; not part of the state.
const onceSeen = new WeakMap();
K.once = function (w, key) {
  let s = onceSeen.get(w);
  if (!s) { s = new Set(); onceSeen.set(w, s); }
  if (s.has(key)) return false;
  s.add(key);
  return true;
};

// Quest toast "망자의 안식: 앞으로 2" from two before the goal (GDD §9.3).
K.questToast = function (ctx) {
  const st = ctx.state, left = st.goal - st.progress;
  if (!st.awakened && left > 0 && left <= 2) ctx.toast(ctx.def.name + ': 앞으로 ' + left);
};

// Steam feedback belongs to whichever of 해류 / 화염 sits in the lower slot (one puff each).
K.steamFeedback = function (ctx, ev) {
  const w = ctx.w;
  const owner = BD.cardRt.list(w).filter((c) => c.id === 'tide' || c.id === 'flame').sort((a, b) => a.slot - b.slot)[0];
  if (!owner || owner !== ctx.card) return;
  K.vfx(ctx, 'steam_puff', { x: ev.x, y: ev.y, life: 0.6 });
  if (K.once(w, 'steam_toast')) ctx.toast('증기: 젖은 적에 불이 닿았다');
};

// Target cards: slot glow when the floor's dominant type matches (GDD §9.2), and a short
// flash on a hit, at most twice a second (§9.3).
K.targetHud = function (state, ctx, type) {
  const w = ctx && ctx.w;
  return { glow: !!(w && w.floor && w.floor.domType === type), flash: !!(w && w.t - (state.flashT === undefined ? -9 : state.flashT) < 0.15) };
};
K.targetFlash = function (ctx) {
  const st = ctx.state, t = ctx.w.t;
  if (st.flashT === undefined || t - st.flashT >= 0.5) st.flashT = t;
};

// Combo stage label over the hero's head (GDD §9.3 "간격↑ 칼 길이↑ 잔영 관통").
// Labels that come within a second of each other stack upward instead of overlapping.
const labelSeen = new WeakMap();
K.label = function (ctx, text) {
  const w = ctx.w, last = labelSeen.get(w);
  const row = last && w.t - last.t < 1.0 ? (last.row + 1) % 3 : 0;
  labelSeen.set(w, { t: w.t, row });
  K.vfx(ctx, 'combo_label', { text, row, life: 1.0 });
};

// Card slot centre on the HUD (engine geometry, BD.slotRect; GDD §9.2).
K.slotCenter = (slot) => BD.slotCenter(slot);

// ---- drawing kit (browser only) -------------------------------------------------------------

const D = K.draw = {};
D.rgba = function (hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};
D.path = function (g, pts, close) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
};
// deterministic jitter in [0, 1) for flicker without touching any rng
D.hash = function (a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
D.arcPts = function (v, x, y, r, a0, a1, n, z) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(v.proj(x + Math.cos(a) * r, y + Math.sin(a) * r, z || 0)); }
  return pts;
};
D.ellipse = function (g, v, x, y, r, fill, stroke, lw, z) {
  const c = v.proj(x, y, z || 0);
  g.beginPath(); g.ellipse(c[0], c[1], Math.max(0.1, r * 40 * 1.414), Math.max(0.1, r * 20 * 1.414), 0, 0, M.TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); }
};
D.annulus = function (g, v, x, y, r0, r1, fill) {
  const c = v.proj(x, y);
  g.beginPath();
  g.ellipse(c[0], c[1], r1 * 56.57, r1 * 28.28, 0, 0, M.TAU);
  g.ellipse(c[0], c[1], Math.max(0.1, r0 * 56.57), Math.max(0.1, r0 * 28.28), 0, M.TAU, 0, true);
  g.fillStyle = fill; g.fill('evenodd');
};
D.text = function (g, s, x, y, size, color, alpha) {
  g.save();
  g.globalAlpha = alpha === undefined ? 1 : alpha;
  g.font = BD.ui && BD.ui.font ? BD.ui.font(size, 900) : '900 ' + size + 'px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.lineWidth = Math.max(3, size / 5); g.strokeStyle = K.INK; g.strokeText(s, x, y);
  g.fillStyle = color; g.fillText(s, x, y);
  g.restore();
};
// 망자의 안식 각성: every trail gets a white rim (GDD §5.4)
D.rim = (w) => !!w && K.awakened(w, 'rest_of_dead');

// The hero-trail stroke: ink under-stroke, element stripes (tide → lightning → flame, dashed),
// an orange core and a light highlight. o: {core, rim, alpha, highlight}
D.stroke = function (g, pts, a, width, elements, o) {
  o = o || {};
  if (pts.length < 2 || a <= 0) return;
  D.path(g, pts);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (o.rim) { g.strokeStyle = 'rgba(255,255,255,' + 0.95 * a + ')'; g.lineWidth = width + 10; g.stroke(); }
  g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = width + 4; g.stroke();
  (elements || []).forEach((el, i) => {
    g.strokeStyle = K.ELEMENT_COLORS[el]; g.globalAlpha = a; g.lineWidth = width + 2;
    g.setLineDash([10, 8]); g.lineDashOffset = i * 9; g.stroke();
  });
  g.setLineDash([]); g.globalAlpha = a;
  g.strokeStyle = o.core || K.ORANGE; g.lineWidth = width; g.stroke();
  if (o.highlight !== false) { g.strokeStyle = o.highlight || '#fff3d6'; g.lineWidth = Math.max(1, width * 0.3); g.stroke(); }
  g.globalAlpha = 1; g.lineCap = 'butt';
};

// Points of a placed strike shape the way a trail draws it (k = trail age 0 → 1).
D.shapePts = function (v, s, k) {
  if (s.kind === 'fan') {
    const h = s.half * M.DEG, sweep = Math.min(1, k * 3 + 0.35), n = 18, pts = [];
    for (let i = 0; i <= n * sweep; i++) { const an = s.dir - h + (2 * h * i) / n; pts.push(v.proj(s.x + Math.cos(an) * s.r * 0.92, s.y + Math.sin(an) * s.r * 0.92, 14)); }
    return pts;
  }
  if (s.kind === 'line') {
    const L = s.len * Math.min(1, 0.3 + k * 3);
    return [v.proj(s.x + Math.cos(s.dir) * 0.4, s.y + Math.sin(s.dir) * 0.4, 14), v.proj(s.x + Math.cos(s.dir) * L, s.y + Math.sin(s.dir) * L, 14)];
  }
  if (s.kind === 'circle') return D.arcPts(v, s.x, s.y, s.r * 0.95, 0, M.TAU, 36, 10);
  if (s.kind === 'ring') return D.arcPts(v, s.x, s.y, s.r1, 0, M.TAU, 36, 6);
  return [];
};
D.shapeWidth = (s) => (s.kind === 'line' ? Math.max(3, s.width * 6) : s.kind === 'fan' ? 7 : 6);

// Thrust: a long blade line with a tapered head (관통, 일섬's pierce).
D.thrust = function (g, v, s, k, elements, w, o) {
  o = o || {};
  const a = (1 - k) * (o.alpha === undefined ? 1 : o.alpha);
  const ext = Math.min(1, 0.25 + k * 4);
  const L = s.len * ext, cx = Math.cos(s.dir), cy = Math.sin(s.dir);
  const p0 = v.proj(s.x + cx * 0.35, s.y + cy * 0.35, 14), p1 = v.proj(s.x + cx * L, s.y + cy * L, 14);
  const wid = Math.max(4, s.width * 7);
  D.stroke(g, [p0, p1], a, wid, elements, { rim: D.rim(w), core: o.core });
  // head: an inked wedge at the tip
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], ul = Math.sqrt(ux * ux + uy * uy) || 1;
  const nx = ux / ul, ny = uy / ul, hw = wid * 1.3, hl = wid * 2.6;
  const tip = [p1[0] + nx * hl, p1[1] + ny * hl];
  g.globalAlpha = a;
  D.path(g, [tip, [p1[0] - ny * hw, p1[1] + nx * hw], [p1[0] + ny * hw, p1[1] - nx * hw]], true);
  g.fillStyle = o.core || K.ORANGE; g.fill();
  g.lineWidth = 2; g.strokeStyle = K.INK; g.stroke();
  // speed lines along the shaft
  g.strokeStyle = 'rgba(255,243,214,' + 0.8 * a + ')'; g.lineWidth = 1.5;
  for (const off of [-1, 1]) {
    g.beginPath();
    g.moveTo(p0[0] + (p1[0] - p0[0]) * 0.3 - ny * off * wid, p0[1] + (p1[1] - p0[1]) * 0.3 + nx * off * wid);
    g.lineTo(p0[0] + (p1[0] - p0[0]) * 0.8 - ny * off * wid, p0[1] + (p1[1] - p0[1]) * 0.8 + nx * off * wid);
    g.stroke();
  }
  g.globalAlpha = 1;
};

// Generic trail of any shape kind, used by echo copies and the 각성 rim on the base fan.
D.shapeTrail = function (g, v, s, k, elements, o) {
  const pts = D.shapePts(v, s, k);
  D.stroke(g, pts, (1 - k) * (o && o.alpha !== undefined ? o.alpha : 1), D.shapeWidth(s), elements, o);
};

// Expanding inked burst ring (explosions).
D.burst = function (g, v, x, y, r, k, color, fillA) {
  const rr = r * (0.35 + 0.65 * Math.min(1, k * 2.2));
  const a = 1 - k;
  D.ellipse(g, v, x, y, rr, D.rgba(color, (fillA === undefined ? 0.35 : fillA) * a), null);
  D.ellipse(g, v, x, y, rr, null, 'rgba(10,10,12,' + 0.85 * a + ')', 5);
  D.ellipse(g, v, x, y, rr, null, D.rgba(color, a), 2.5);
  // spokes
  const c = v.proj(x, y, 6);
  g.strokeStyle = D.rgba(color, a); g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * M.TAU + 0.3;
    const r0 = rr * 0.45, r1 = rr * 0.95;
    g.beginPath();
    g.moveTo(c[0] + Math.cos(an) * r0 * 56.57, c[1] + Math.sin(an) * r0 * 28.28);
    g.lineTo(c[0] + Math.cos(an) * r1 * 56.57, c[1] + Math.sin(an) * r1 * 28.28);
    g.stroke();
  }
};

// A glow streak along the hero's facing at blade height (blade glow / afterglow / flames).
D.bladePts = function (v, h, t) {
  const f = h.face, cx = Math.cos(f), cy = Math.sin(f);
  return [v.proj(h.x + cx * 0.22, h.y + cy * 0.22, 30), v.proj(h.x + cx * 0.85, h.y + cy * 0.85, 40)];
};
D.bladeGlow = function (g, v, h, color, a, width) {
  const [p0, p1] = D.bladePts(v, h);
  g.lineCap = 'round';
  g.strokeStyle = D.rgba(color, 0.35 * a); g.lineWidth = width * 2.4; D.path(g, [p0, p1]); g.stroke();
  g.strokeStyle = D.rgba(color, 0.9 * a); g.lineWidth = width; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = Math.max(1, width * 0.35); g.stroke();
  g.lineCap = 'butt';
};
