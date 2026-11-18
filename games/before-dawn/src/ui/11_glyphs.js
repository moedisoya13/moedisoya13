// v2 glyphs (GDD-V2 §4.5, §5.4–5.7, §6): the seven boons, sites, task kinds, stairs, the elite
// skull, flask, halo and holy stone — for the choice overlay, the HUD, the edge markers and the
// minimap. Every glyph draws in a 32-unit box centred on (x, y), scaled to `size` px: flat colour,
// ink outline. Ids nobody drew yet fall back to a lettered seal (the id's or name's first letter),
// so a boon, site or task from another branch is always drawn as something.
//
//   IC.glyph(g, id, x, y, size, o)   id: 'boon:edge' … 'site:seal' … 'task:purge' … 'stairs' …
//   IC.hasGlyph(id)                  o: {fill (disc colour), ring (disc edge), alpha, letter}

const K = BD.ui.K;
const IC = BD.ui.icons;
const P = K.poly;
const GOLD = '#ffd24a', SHARD = '#ffe9a8', BLUE = '#8fd3ff', RED = '#e8342c', WHITE = '#f6f1e6';

function fi(g, color, lw) { g.fillStyle = color; g.fill(); K.ink(g, lw || 2.4); }
function line(g, pts, color, lw) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = (lw || 3) + 2.4; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = lw || 3; g.strokeStyle = color; g.stroke(); }
function flameShape(g, s, oy) {
  g.beginPath(); g.moveTo(0, oy - 11 * s); g.bezierCurveTo(7 * s, oy - 4 * s, 8 * s, oy + 2 * s, 0, oy + 7 * s);
  g.bezierCurveTo(-8 * s, oy + 2 * s, -6 * s, oy - 4 * s, 0, oy - 11 * s); g.closePath();
}

const G = {
  // ---- boons (§4.5): what each one changes, as you see it on the hero
  'boon:edge'(g) { P(g, [[-10, 10], [7, -7], [11, -11], [9, -5], [-8, 12]]); fi(g, WHITE); line(g, [[-12, 3], [-3, 12]], GOLD, 3); },
  'boon:long'(g) { line(g, [[-12, 9], [12, -9]], WHITE, 3.5); line(g, [[-12, 3], [-12, 12], [-4, 12]], GOLD, 2.4); line(g, [[12, -3], [12, -12], [4, -12]], GOLD, 2.4); },
  'boon:quick'(g) { for (const y of [-7, 0, 7]) line(g, [[-12, y], [2 - Math.abs(y) * 0.6, y]], SHARD, 2.6); P(g, [[4, -9], [12, 0], [4, 9]]); fi(g, GOLD); },
  'boon:wide'(g) { g.beginPath(); g.moveTo(0, 9); g.arc(0, 9, 18, -Math.PI * 0.86, -Math.PI * 0.14); g.closePath(); fi(g, 'rgba(255,233,168,0.9)'); K.circle(g, 0, 9, 3); fi(g, WHITE); },
  'boon:draw'(g) { K.circle(g, 0, 0, 12); g.lineWidth = 5; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 2.5; g.strokeStyle = SHARD; g.stroke(); P(g, [[0, -6], [4, 0], [0, 6], [-4, 0]]); fi(g, SHARD); },
  'boon:body'(g) { P(g, [[-10, -10], [10, -10], [10, 2], [0, 12], [-10, 2]]); fi(g, '#c8283a'); line(g, [[0, -6], [0, 4]], WHITE, 2.4); line(g, [[-5, -1], [5, -1]], WHITE, 2.4); },
  'boon:step'(g) { P(g, [[-3, 10], [-3, -2], [3, -9], [9, -9], [9, -3], [3, 3], [3, 10]]); fi(g, WHITE); for (const y of [-4, 3]) line(g, [[-13, y], [-7, y]], SHARD, 2.4); },
  breath(g) { g.beginPath(); g.arc(0, 4, 10, Math.PI, 0); g.closePath(); fi(g, '#ffe2a8'); for (let i = 0; i < 5; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 5; line(g, [[Math.cos(a) * 12, 4 + Math.sin(a) * 12], [Math.cos(a) * 15, 4 + Math.sin(a) * 15]], '#ffe2a8', 2); } },
  // ---- sites (§5.5) and task objects (§5.4)
  // a standing stone with a glowing rune ring
  'site:seal'(g) { P(g, [[-8, 13], [-9, -6], [-5, -12], [5, -12], [9, -6], [8, 13]]); fi(g, '#a9b0c2'); P(g, [[1, -12], [5, -12], [9, -6], [8, 13], [2, 13]]); g.fillStyle = '#7d8598'; g.fill(); P(g, [[-8, 13], [-9, -6], [-5, -12], [5, -12], [9, -6], [8, 13]]); K.ink(g, 2.4); K.circle(g, 0, 1, 4.6); g.lineWidth = 2.6; g.strokeStyle = GOLD; g.stroke(); K.circle(g, 0, 1, 1.4); g.fillStyle = GOLD; g.fill(); },
  'site:nest'(g) { g.beginPath(); g.ellipse(0, 4, 12, 7, 0, 0, Math.PI * 2); fi(g, '#6b4a33'); for (const x of [-5, 1, 6]) { K.circle(g, x, 1, 3.4); fi(g, '#d9cbb0', 1.8); } },
  'site:brazier'(g) { P(g, [[-11, -1], [11, -1], [7, 7], [-7, 7]]); fi(g, '#8d877c'); line(g, [[-5, 7], [-7, 12]], '#8d877c', 2.2); line(g, [[5, 7], [7, 12]], '#8d877c', 2.2); flameShape(g, 0.9, -5); fi(g, '#ffb24a'); },
  'site:altar'(g) { P(g, [[-11, 3], [11, 3], [11, 11], [-11, 11]]); fi(g, '#b9b2a5'); P(g, [[-7, -1], [7, -1], [7, 3], [-7, 3]]); fi(g, '#d9d2c5'); line(g, [[0, -12], [0, -3]], GOLD, 2.4); line(g, [[-4, -8], [4, -8]], GOLD, 2.4); },
  'site:spring'(g) { g.beginPath(); g.moveTo(0, -12); g.bezierCurveTo(8, -2, 9, 3, 0, 11); g.bezierCurveTo(-9, 3, -8, -2, 0, -12); g.closePath(); fi(g, BLUE); K.circle(g, -3, 2, 2.2); g.fillStyle = WHITE; g.fill(); },
  'site:chest'(g) { P(g, [[-11, -3], [11, -3], [11, 10], [-11, 10]]); fi(g, '#a8743a'); P(g, [[-11, -3], [-8, -10], [8, -10], [11, -3]]); fi(g, '#c98d46'); P(g, [[-2, -1], [2, -1], [2, 5], [-2, 5]]); fi(g, GOLD, 1.6); },
  'site:rift'(g) { P(g, [[0, -13], [5, -3], [2, 0], [6, 12], [-2, 3], [1, 0], [-4, -8]]); fi(g, '#b07ce8'); },
  'site:?'(g) { K.circle(g, 0, 0, 12); fi(g, '#2a2830'); g.font = '900 18px ' + BD.ui.FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = WHITE; g.fillText('?', 0, 1.5); },
  // ---- tasks (top centre label)
  'task:purge'(g) { line(g, [[-10, 10], [10, -10]], WHITE, 3); line(g, [[10, 10], [-10, -10]], WHITE, 3); },
  'task:seals'(g) { G['site:seal'](g); },
  'task:nests'(g) { G['site:nest'](g); },
  'task:hold'(g) { G['site:brazier'](g); },
  'task:hunt'(g) { G.skull(g); },
  // ---- the floor's end and threats
  stairs(g) { P(g, [[-11, 11], [-11, 5], [-5, 5], [-5, -1], [1, -1], [1, -7], [7, -7], [7, -12], [12, -12], [12, 11]]); fi(g, WHITE); },
  stairs_locked(g) { P(g, [[-11, 11], [-11, 5], [-5, 5], [-5, -1], [1, -1], [1, -7], [7, -7], [7, -12], [12, -12], [12, 11]]); fi(g, '#6d6a64'); P(g, [[-4, 2], [6, 2], [6, 11], [-4, 11]]); fi(g, '#b9b2a5', 2); },
  crown(g) { P(g, [[-12, 8], [-12, -6], [-6, 0], [0, -10], [6, 0], [12, -6], [12, 8]]); fi(g, GOLD); },
  skull(g, o) { const c = (o && o.color) || WHITE; g.beginPath(); g.arc(0, -2, 10, Math.PI * 0.82, Math.PI * 0.18); g.lineTo(5, 10); g.lineTo(-5, 10); g.closePath(); fi(g, c); g.fillStyle = K.INK; g.fillRect(-6, -4, 4.5, 4.5); g.fillRect(1.5, -4, 4.5, 4.5); },
  flask(g) { P(g, [[-3, -12], [3, -12], [3, -5], [9, 3], [9, 11], [-9, 11], [-9, 3], [-3, -5]]); fi(g, BLUE); P(g, [[-9, 4], [9, 4], [9, 11], [-9, 11]]); g.fillStyle = '#4a9fd8'; g.fill(); K.ink(g, 2); },
  halo(g) { g.beginPath(); g.ellipse(0, 0, 12, 7, -0.3, 0, Math.PI * 2); g.lineWidth = 6; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = SHARD; g.stroke(); },
  holy_stone(g) { const o = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; o.push([Math.cos(a) * 10, Math.sin(a) * 10]); } P(g, o); fi(g, WHITE); line(g, [[0, -6], [0, 6]], GOLD, 2.2); line(g, [[-6, 0], [6, 0]], GOLD, 2.2); },
  shard(g) { P(g, [[0, -12], [7, 0], [0, 12], [-7, 0]]); fi(g, SHARD); P(g, [[0, -6], [2, 0], [0, 6], [-2, 0]]); g.fillStyle = '#ffffff'; g.fill(); },
};
const ALIAS = { 'site:stone': 'site:seal', 'site:seal_stone': 'site:seal', 'site:fire': 'site:brazier', 'site:fountain': 'site:spring', 'site:trial': 'site:rift', 'task:seal': 'task:seals', 'task:nest': 'task:nests', 'task:brazier': 'task:hold', elite: 'skull', guardian: 'crown' };

IC.hasGlyph = (id) => !!(G[id] || G[ALIAS[id]]);
IC.glyph = function (g, id, x, y, size, o) {
  o = o || {};
  const fn = G[id] || G[ALIAS[id]];
  g.save();
  g.translate(x, y);
  g.scale(size / 32, size / 32);
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  if (o.fill) { K.circle(g, 0, 0, 15); g.fillStyle = o.fill; g.fill(); g.lineWidth = 2.5; g.strokeStyle = o.ring || K.INK; g.stroke(); }
  if (fn) fn(g, o);
  else {
    // a seal with the first letter of the name (or of the id after its prefix)
    const s = o.letter || [...String(id).replace(/^\w+:/, '')][0] || '?';
    P(g, [[-12, -12], [12, -12], [12, 12], [-12, 12]]); fi(g, '#2a2830');
    g.font = '900 17px ' + BD.ui.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = o.color || WHITE; g.fillText(s.toUpperCase ? s.toUpperCase() : s, 0, 1.5);
  }
  g.restore();
};
