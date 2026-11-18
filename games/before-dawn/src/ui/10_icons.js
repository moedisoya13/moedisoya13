// Icons drawn in code: the 18 card icons of GDD §5 keyed by card id, scalable type icons, and the
// small glyphs of the screens (lock, stamp, crown, dash, pause, rotate …). Card icons are looked
// up by card id, then by the card's free `icon` string, and fall back to the card's name in an
// ink seal, so cards that arrive later always get something readable.
//
// Every icon draws in a 64-unit box centred on the origin: ink outline, flat colour, two tones.

const K = BD.ui.K;
const M = BD.math;
const IC = BD.ui.icons = {};
const P = K.poly;

function fillInk(g, color, lw) { g.fillStyle = color; g.fill(); K.ink(g, lw || 4); }
// fill a path with a light tone, then the lower-right part (clipped by a diagonal) with a dark tone
function twoTone(g, path, light, dark, cut) {
  path(); g.fillStyle = light; g.fill();
  g.save(); path(); g.clip();
  P(g, cut || [[-40, 6], [40, -10], [40, 40], [-40, 40]]); g.fillStyle = dark; g.fill();
  g.restore();
  path(); K.ink(g, 4);
}
function star(n, r0, r1, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r0, a = (rot || -Math.PI / 2) + (i * Math.PI) / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return pts;
}
function flamePath(g, s, ox, oy) {
  s = s || 1; ox = ox || 0; oy = oy || 0;
  g.beginPath();
  g.moveTo(ox + 0 * s, oy - 28 * s);
  g.bezierCurveTo(ox + 6 * s, oy - 14 * s, ox + 20 * s, oy - 8 * s, ox + 18 * s, oy + 8 * s);
  g.bezierCurveTo(ox + 17 * s, oy + 22 * s, ox + 6 * s, oy + 28 * s, ox + 0 * s, oy + 28 * s);
  g.bezierCurveTo(ox - 10 * s, oy + 28 * s, ox - 19 * s, oy + 20 * s, ox - 18 * s, oy + 8 * s);
  g.bezierCurveTo(ox - 17 * s, oy - 4 * s, ox - 8 * s, oy - 6 * s, ox - 10 * s, oy - 18 * s);
  g.bezierCurveTo(ox - 4 * s, oy - 14 * s, ox - 2 * s, oy - 18 * s, ox + 0 * s, oy - 28 * s);
  g.closePath();
}
function blade(g, len, wdt) {
  // a straight sword along +x from the origin: grip, crossguard, white blade
  P(g, [[-14, -3], [0, -3], [0, 3], [-14, 3]]); fillInk(g, '#4a3a2e', 3);
  P(g, [[0, -9], [4, -9], [4, 9], [0, 9]]); fillInk(g, K.GOLD, 3);
  P(g, [[4, -wdt], [len - 6, -wdt], [len, 0], [len - 6, wdt], [4, wdt]]); g.fillStyle = '#f5f3ee'; g.fill();
  P(g, [[4, 0], [len, 0], [len - 6, wdt], [4, wdt]]); g.fillStyle = '#c9c4ba'; g.fill();
  P(g, [[4, -wdt], [len - 6, -wdt], [len, 0], [len - 6, wdt], [4, wdt]]); K.ink(g, 3);
}

const CARD = {
  pierce(g) { // 긴 화살
    g.rotate(-Math.PI / 4);
    for (const y of [-12, 12]) { g.beginPath(); g.moveTo(-30, y); g.lineTo(-18, y); K.ink(g, 4, K.INK); }
    P(g, [[-26, -4], [12, -4], [12, 4], [-26, 4]]); fillInk(g, K.PAPER, 3.5);
    P(g, [[-30, -4], [-36, -12], [-22, -4]]); fillInk(g, '#d9d2c3', 3);
    P(g, [[-30, 4], [-36, 12], [-22, 4]]); fillInk(g, '#d9d2c3', 3);
    twoTone(g, () => P(g, [[10, -12], [30, 0], [10, 12], [14, 0]]), '#ffffff', '#b9b2a5', [[0, 0], [40, 0], [40, 20], [0, 20]]);
  },
  whirl(g) { // 고리
    const a0 = -0.6, a1 = 4.6, r0 = 14, r1 = 25;
    const ring = () => { g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); };
    twoTone(g, ring, '#ffffff', '#c9c4ba', [[-40, 4], [40, 4], [40, 40], [-40, 40]]);
    const ax = Math.cos(a1), ay = Math.sin(a1), tx = -ay, ty = ax;
    const m = (r0 + r1) / 2;
    P(g, [[ax * (r0 - 6), ay * (r0 - 6)], [ax * (r1 + 6), ay * (r1 + 6)], [ax * m + tx * 14, ay * m + ty * 14]]); fillInk(g, '#ffffff', 3.5);
    K.circle(g, 0, 0, 5); fillInk(g, K.GOLD, 3);
  },
  sword_wave(g) { // 초승달
    for (const [y, l] of [[-14, 12], [0, 18], [14, 12]]) { g.beginPath(); g.moveTo(-30, y); g.lineTo(-30 + l, y); K.ink(g, 3.5); }
    const moon = () => { g.beginPath(); g.arc(4, 0, 26, -1.75, 1.75); g.arc(-8, 0, 22, 1.25, -1.25, true); g.closePath(); };
    twoTone(g, moon, '#eef6ff', '#9fc3e6', [[-40, 6], [40, 6], [40, 40], [-40, 40]]);
  },
  flame(g) { // 화염
    flamePath(g, 1); fillInk(g, '#ff5a2a', 4);
    flamePath(g, 0.55, 2, 10); g.fillStyle = '#ffd24a'; g.fill(); K.ink(g, 2.5);
  },
  lightning(g) { // 뇌전
    const bolt = () => P(g, [[-4, -30], [16, -30], [4, -8], [16, -8], [-12, 30], [-2, 2], [-14, 2]]);
    twoTone(g, bolt, '#ffffff', '#bfe9ff', [[-40, -4], [40, -4], [40, 40], [-40, 40]]);
  },
  tide(g) { // 해류
    const wave = () => {
      g.beginPath(); g.moveTo(-30, 26); g.lineTo(-30, 8);
      g.bezierCurveTo(-26, -14, -2, -26, 14, -20);
      g.bezierCurveTo(26, -15, 26, 0, 14, 2);
      g.bezierCurveTo(6, 3, 4, -6, 10, -8);
      g.bezierCurveTo(0, -10, -6, 4, 4, 12);
      g.bezierCurveTo(14, 18, 26, 14, 30, 8);
      g.lineTo(30, 26); g.closePath();
    };
    twoTone(g, wave, '#3aa0ff', '#1f6fc0', [[-40, 10], [40, 10], [40, 40], [-40, 40]]);
    g.beginPath(); g.moveTo(-20, -2); g.bezierCurveTo(-14, -16, 0, -21, 12, -18); g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.stroke();
  },
  leech(g) { // 흡수
    const drop = () => { g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(8, -12, 17, -2, 17, 9); g.arc(0, 9, 17, 0, Math.PI); g.bezierCurveTo(-17, -2, -8, -12, 0, -26); g.closePath(); };
    twoTone(g, drop, K.GREEN, '#3f9a3a', [[-40, 10], [40, 4], [40, 40], [-40, 40]]);
    for (const s of [-1, 1]) {
      P(g, [[s * 31, -6], [s * 22, 2], [s * 31, 10], [s * 27, 2]]); fillInk(g, K.PAPER, 2.5);
    }
    K.circle(g, -5, 6, 3.5); g.fillStyle = '#ffffff'; g.fill();
  },
  riposte(g) { // 반격
    g.save(); g.rotate(-Math.PI / 4); g.translate(-16, 0); blade(g, 46, 4); g.restore();
    g.save(); g.rotate(-3 * Math.PI / 4); g.translate(-16, 0); g.scale(1, -1); blade(g, 46, 4); g.restore();
    P(g, star(8, 14, 6, 0.2)); fillInk(g, '#ffe36a', 3);
  },
  drawcut(g) { // 발도
    g.rotate(-Math.PI / 5);
    P(g, [[-30, -6], [4, -6], [8, 0], [4, 6], [-30, 6]]); fillInk(g, '#3a2a22', 3.5);
    P(g, [[-22, -6], [-18, -6], [-18, 6], [-22, 6]]); fillInk(g, K.GOLD, 2.5);
    P(g, [[6, -4], [30, -4], [36, 0], [30, 4], [6, 4]]); fillInk(g, '#ffffff', 3);
    for (const [x, y] of [[20, -14], [30, -12], [38, -6]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y - 6); K.ink(g, 3, K.INK); }
  },
  holy_light(g) { // 성광
    for (let i = 0; i < 8; i++) { g.save(); g.rotate((i * Math.PI) / 4 + Math.PI / 8); P(g, [[-4, -22], [0, -31], [4, -22]]); fillInk(g, '#ffd24a', 2.5); g.restore(); }
    const cross = () => P(g, [[-6, -26], [6, -26], [6, -14], [18, -14], [18, -2], [6, -2], [6, 26], [-6, 26], [-6, -2], [-18, -2], [-18, -14], [-6, -14]]);
    twoTone(g, cross, '#ffffff', '#d8d2c4', [[0, -40], [40, -40], [40, 40], [0, 40]]);
  },
  armor_break(g) { // 갑옷 파쇄
    const shield = () => { g.beginPath(); g.moveTo(-20, -24); g.lineTo(20, -24); g.lineTo(20, 2); g.quadraticCurveTo(20, 20, 0, 28); g.quadraticCurveTo(-20, 20, -20, 2); g.closePath(); };
    twoTone(g, shield, '#9aa3b6', '#5a6070', [[0, -40], [40, -40], [40, 40], [0, 40]]);
    g.beginPath(); g.moveTo(-2, -24); g.lineTo(4, -10); g.lineTo(-4, -2); g.lineTo(5, 10); g.lineTo(-1, 27); K.ink(g, 4);
    P(g, [[24, -16], [32, -20], [30, -10]]); fillInk(g, '#9aa3b6', 2.5);
    P(g, [[26, 4], [34, 2], [30, 12]]); fillInk(g, '#9aa3b6', 2.5);
  },
  mana_backlash(g) { // 마력 역류
    P(g, star(5, 26, 11)); fillInk(g, '#9b59d0', 4);
    P(g, star(5, 13, 6)); g.fillStyle = '#c9a0ff'; g.fill();
    g.save(); g.rotate(-Math.PI / 5);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(i * 11, 0, 7, 4.5, 0, 0, Math.PI * 2); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#c9c4ba'; g.stroke(); }
    g.restore();
  },
  rest_of_dead(g) { // 망자의 안식
    g.beginPath(); g.ellipse(0, -24, 16, 5, 0, 0, Math.PI * 2); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#ffd24a'; g.stroke();
    const skull = () => { g.beginPath(); g.arc(0, 0, 19, Math.PI * 0.85, Math.PI * 0.15); g.lineTo(10, 18); g.lineTo(10, 26); g.lineTo(-10, 26); g.lineTo(-10, 18); g.closePath(); };
    twoTone(g, skull, '#efe9d8', '#bdb5a0', [[-40, 12], [40, 6], [40, 40], [-40, 40]]);
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 8, 2, 5, 0.1, Math.PI - 0.1); K.ink(g, 3.5); }
    for (const x of [-4, 0, 4]) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, 26); K.ink(g, 2.5); }
  },
  kings_hunt(g) { // 왕의 사냥
    K.circle(g, 0, 8, 18); g.lineWidth = 8; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = K.PAPER; g.stroke();
    for (const [x0, y0, x1, y1] of [[0, -14, 0, -4], [0, 20, 0, 30], [-22, 8, -12, 8], [12, 8, 22, 8]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); K.ink(g, 4); }
    const crown = () => P(g, [[-18, -10], [-18, -28], [-9, -19], [0, -31], [9, -19], [18, -28], [18, -10]]);
    twoTone(g, crown, '#ffd24a', '#b88a1e', [[-40, -16], [40, -16], [40, 0], [-40, 0]]);
  },
  fire_pilgrimage(g) { // 불의 순례 (torch)
    g.save(); g.rotate(Math.PI / 8);
    P(g, [[-5, -2], [5, -2], [3, 30], [-3, 30]]); fillInk(g, '#6b4a32', 3.5);
    P(g, [[-8, -6], [8, -6], [7, 2], [-7, 2]]); fillInk(g, K.GOLD, 3);
    flamePath(g, 0.62, 0, -22); fillInk(g, '#ff5a2a', 3.5);
    flamePath(g, 0.32, 1, -17); g.fillStyle = '#ffd24a'; g.fill();
    g.restore();
    for (const [x, y] of [[18, -22], [24, -10], [-18, -26]]) { K.circle(g, x, y, 2.5); fillInk(g, '#ffd24a', 1.5); }
  },
  chain_slash(g) { // 연참: three cuts in a row
    for (let i = -1; i <= 1; i++) {
      g.save(); g.translate(i * 15, i * 3);
      const slash = () => { g.beginPath(); g.moveTo(-10, 28); g.quadraticCurveTo(-6, 0, 12, -28); g.quadraticCurveTo(10, 2, -10, 28); g.closePath(); };
      slash(); fillInk(g, i === 1 ? '#ffffff' : i === 0 ? '#e6dfd0' : '#c9c1ae', 3);
      g.restore();
    }
    K.circle(g, 22, -24, 5); fillInk(g, K.VIOLET, 2.5);
  },
  flawless(g) { // 무결
    const gem = () => P(g, [[-14, -18], [14, -18], [26, -6], [0, 26], [-26, -6]]);
    twoTone(g, gem, '#e6f6ff', '#a8d0e8', [[0, -40], [40, -40], [40, 40], [0, 40]]);
    g.beginPath(); g.moveTo(-26, -6); g.lineTo(26, -6); g.moveTo(-14, -18); g.lineTo(-6, -6); g.lineTo(0, 26); g.lineTo(6, -6); g.lineTo(14, -18); K.ink(g, 2.5);
    g.save(); g.translate(20, -22); P(g, star(4, 9, 3, 0)); fillInk(g, '#ffffff', 2); g.restore();
  },
  one_flash(g) { // 일섬
    K.circle(g, 0, 0, 20); g.lineWidth = 9; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = K.VIOLET; g.stroke();
    P(g, [[-32, 1], [26, -4], [33, 0], [26, 4]]); fillInk(g, '#ffffff', 3.5);
    K.circle(g, 20, 0, 4); fillInk(g, '#ffd24a', 2.5);
  },
};
IC.CARD = CARD;

// def.icon strings → a drawer (cards name their icon freely; ARCHITECTURE §3.1)
const ALIAS = {
  arrow: 'pierce', ring: 'whirl', circle: 'whirl', crescent: 'sword_wave', moon: 'sword_wave', wave: 'sword_wave',
  fire: 'flame', flame: 'flame', bolt: 'lightning', lightning: 'lightning', water: 'tide', tide: 'tide',
  drop: 'leech', leech: 'leech', swords: 'riposte', counter: 'riposte', sheath: 'drawcut', draw: 'drawcut',
  cross: 'holy_light', holy: 'holy_light', shield: 'armor_break', crack: 'armor_break', star: 'mana_backlash', chains: 'mana_backlash',
  skull: 'rest_of_dead', crown: 'kings_hunt', torch: 'fire_pilgrimage', chain: 'chain_slash', slashes: 'chain_slash',
  gem: 'flawless', diamond: 'flawless', flash: 'one_flash',
};
IC.cardDrawer = function (def) {
  if (!def) return null;
  if (CARD[def.id]) return CARD[def.id];
  if (def.icon && CARD[def.icon]) return CARD[def.icon];
  if (def.icon && ALIAS[def.icon]) return CARD[ALIAS[def.icon]];
  return null;
};

// Draw a card icon centred at (x, y), `size` px. def: a card def (or {id, name}).
IC.card = function (g, def, x, y, size, o) {
  o = o || {};
  const fn = IC.cardDrawer(def);
  g.save();
  g.translate(x, y);
  g.scale(size / 64, size / 64);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (fn) fn(g);
  else {
    // name seal: ink square with the first two letters of the card's name
    P(g, [[-26, -26], [26, -26], [26, 26], [-26, 26]]); fillInk(g, '#2a2830', 4);
    const name = (def && def.name) || '?';
    const s = [...name].slice(0, 2).join('');
    g.font = '900 ' + (s.length > 1 ? 24 : 34) + 'px ' + BD.ui.FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = K.famColor(def && def.family);
    g.fillText(s, 0, 2);
  }
  g.restore();
};

// ---- type icons (scalable) --------------------------------------------------------------------
IC.type = function (g, type, x, y, size, o) {
  o = o || {};
  g.save(); g.translate(x, y); g.scale(size / 32, size / 32);
  if (o.disc) { K.circle(g, 0, 0, 15); fillInk(g, o.disc, 3); }
  g.fillStyle = '#ffffff';
  const sw = 2.5;
  if (type === 'beast') {
    P(g, [[-9, -7], [-3, -7], [-6, 9]]); fillInk(g, '#ffffff', sw);
    P(g, [[3, -7], [9, -7], [6, 9]]); fillInk(g, '#ffffff', sw);
  } else if (type === 'undead') {
    g.beginPath(); g.arc(0, -2, 9, Math.PI * 0.8, Math.PI * 0.2); g.lineTo(5, 9); g.lineTo(-5, 9); g.closePath(); fillInk(g, '#ffffff', sw);
    g.fillStyle = K.INK; g.fillRect(-6, -3, 4, 4); g.fillRect(2, -3, 4, 4);
  } else if (type === 'magic') {
    P(g, star(5, 11, 4.5)); fillInk(g, '#ffffff', sw);
  } else if (type === 'heavy') {
    P(g, [[-9, -10], [9, -10], [9, 1], [0, 11], [-9, 1]]); fillInk(g, '#ffffff', sw);
  } else if (type === 'boss' || type === 'rooftop') {
    P(g, [[-11, 8], [-11, -6], [-5, 1], [0, -11], [5, 1], [11, -6], [11, 8]]); fillInk(g, '#ffd24a', sw);
  } else { K.circle(g, 0, 0, 5); fillInk(g, '#ffffff', sw); }
  g.restore();
};

// ---- glyphs ---------------------------------------------------------------------------------------
IC.lock = function (g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  g.beginPath(); g.arc(0, -4, 7, Math.PI, 0); g.lineTo(7, 2); g.moveTo(-7, 2); g.lineTo(-7, -4); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#9c968a'; g.stroke();
  P(g, [[-11, 0], [11, 0], [11, 14], [-11, 14]]); fillInk(g, '#b9b2a5', 3);
  K.circle(g, 0, 6, 2.5); g.fillStyle = K.INK; g.fill();
  g.restore();
};
IC.stamp = function (g, x, y, s, text) {
  g.save(); g.translate(x, y); g.rotate(-0.22);
  K.circle(g, 0, 0, s / 2); g.fillStyle = 'rgba(179,38,30,0.18)'; g.fill();
  g.lineWidth = Math.max(2, s * 0.07); g.strokeStyle = '#c0392b'; g.stroke();
  K.circle(g, 0, 0, s / 2 - s * 0.12); g.lineWidth = Math.max(1, s * 0.035); g.stroke();
  g.font = '900 ' + Math.round(s * 0.34) + 'px ' + BD.ui.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#d0453a'; g.fillText(text || '승리', 0, 1);
  g.restore();
};
IC.crown = function (g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  P(g, [[-12, 8], [-12, -6], [-6, 0], [0, -10], [6, 0], [12, -6], [12, 8]]); fillInk(g, '#ffd24a', 3);
  g.restore();
};
IC.dash = function (g, x, y, s, color) { // shoulder charge: pauldron + speed lines
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  for (const yy of [-7, 0, 7]) { g.beginPath(); g.moveTo(-15, yy); g.lineTo(-7, yy); K.ink(g, 4, color || K.PAPER); }
  g.beginPath(); g.moveTo(-4, 10); g.quadraticCurveTo(-4, -10, 8, -10); g.quadraticCurveTo(16, -8, 14, 10); g.closePath(); fillInk(g, color || K.PAPER, 3);
  g.restore();
};
IC.pause = function (g, x, y, s, color) {
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  for (const xx of [-7, 3]) { P(g, [[xx, -10], [xx + 5, -10], [xx + 5, 10], [xx, 10]]); fillInk(g, color || K.PAPER, 2.5); }
  g.restore();
};
IC.speaker = function (g, x, y, s, on) {
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  P(g, [[-12, -4], [-6, -4], [2, -11], [2, 11], [-6, 4], [-12, 4]]); fillInk(g, K.PAPER, 2.5);
  if (on) { for (const r of [6, 11]) { g.beginPath(); g.arc(3, 0, r, -0.8, 0.8); K.ink(g, 2.5, K.PAPER); } }
  else { g.beginPath(); g.moveTo(6, -6); g.lineTo(14, 6); g.moveTo(14, -6); g.lineTo(6, 6); K.ink(g, 3, '#e05a4a'); }
  g.restore();
};
IC.phone = function (g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(s / 64, s / 64);
  P(g, [[-16, -28], [16, -28], [16, 28], [-16, 28]]); fillInk(g, '#2a2830', 4);
  P(g, [[-12, -22], [12, -22], [12, 20], [-12, 20]]); g.fillStyle = '#5c4d8e'; g.fill();
  K.circle(g, 0, 24, 2); g.fillStyle = K.PAPER; g.fill();
  g.restore();
};
IC.key = function (g, ui, x, y, w, label) {
  K.panel(g, x, y, w, 40, { shadow: 3, edge: '#8d877c', facetK: 0.5 });
  K.text(ui, label, x + w / 2, y + 21, { size: 20, align: 'center', base: 'middle', weight: 800 });
};
IC.finger = function (g, x, y, s) { // fingertip pressing
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32);
  g.beginPath(); g.moveTo(-6, 16); g.lineTo(-6, -8); g.arc(0, -8, 6, Math.PI, 0); g.lineTo(6, 16); g.closePath(); fillInk(g, '#e8d2b8', 3);
  g.restore();
};

// Hero portrait: the head of the front-facing sprite in an inked octagon.
IC.portrait = function (g, x, y, size) {
  const img = BD.client.assets.img.hero_front;
  const r = size / 2, cx = x + r, cy = y + r;
  const oct = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; oct.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  P(g, oct.map((p) => [p[0] + 3, p[1] + 4])); g.fillStyle = K.INK; g.fill();
  P(g, oct); g.fillStyle = '#2b3a80'; g.fill();
  if (img) {
    g.save(); P(g, oct); g.clip();
    // head region of hero_front (186 × 256): roughly x 60–150, y 0–90
    g.drawImage(img, 58, 0, 92, 92, x - 2, y + 4, size + 4, size + 4);
    g.restore();
  }
  P(g, oct); K.ink(g, 4);
  const inner = oct.map((p) => [cx + (p[0] - cx) * 0.9, cy + (p[1] - cy) * 0.9]);
  P(g, inner); g.lineWidth = 2; g.strokeStyle = K.GOLD; g.stroke();
};
