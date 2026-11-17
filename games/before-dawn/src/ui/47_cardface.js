// Card face used by the preparation screen, the altar, the pause menu and the codex: an ink
// card with its family colour, the icon in a gold socket, the name, the family, and the full
// effect text (GDD §9.1 "효과 전문"), shrinking the type only as far as 17 px to fit.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const CI = BD.ui.cards;

function familyLine(def) {
  let s = K.FAMILY_NAMES[def.family] || def.family || '';
  if (def.family === 'target' && def.targetType) s += ' · ' + K.typeName(def.targetType);
  if (def.family === 'quest' && def.goal) s += ' · 목표 ' + def.goal;
  if (def.family === 'combo' && def.maxStack) s += ' · 최대 ×' + def.maxStack;
  return s;
}
BD.ui.familyLine = familyLine;

// Fit wrapped text into maxW × maxH; returns {size, lines}.
function fit(g, text, maxW, maxH, sizes) {
  for (const size of sizes) {
    const lines = K.wrap(g, text, maxW, size, 500);
    if (lines.length * Math.round(size * 1.36) <= maxH) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const lh = Math.round(size * 1.36), n = Math.max(1, Math.floor(maxH / lh));
  const lines = K.wrap(g, text, maxW, size, 500).slice(0, n);
  lines[n - 1] = lines[n - 1].replace(/.$/, '…');
  return { size, lines };
}
BD.ui.fitText = fit;

// o: {card (equipped instance: live state line), selected, focused, dim, sizes, iconSize, stateLine, warn}
BD.ui.cardFace = function (ui, def, x, y, w, h, o) {
  o = o || {};
  const g = ui.g;
  const fam = def ? K.famColor(def.family) : '#3a3a40';
  const edge = o.focused || o.selected ? K.PAPER : def ? fam : '#3a3a40';
  K.panel(g, x, y, w, h, { slant: 0, edge, edgeW: o.focused || o.selected ? 4 : 2, facetK: 0.3, shadow: 5, alpha: o.dim ? 0.55 : 1 });
  if (o.dim) g.globalAlpha = 0.55;
  // family stripe
  g.fillStyle = fam; g.fillRect(x + 6, y + 6, 6, h - 12);
  if (!def) {
    K.text(ui, '빈 홈', x + w / 2, y + h / 2, { size: 24, align: 'center', base: 'middle', color: K.MUTED });
    g.globalAlpha = 1;
    return;
  }
  const ib = o.iconSize || Math.min(88, Math.round(h * 0.28));
  const ix = x + 22, iy = y + 16;
  K.poly(g, [[ix - 4, iy - 4], [ix + ib + 4, iy - 4], [ix + ib + 4, iy + ib + 4], [ix - 4, iy + ib + 4]]); g.fillStyle = '#b08a3a'; g.fill(); K.ink(g, 3);
  K.poly(g, [[ix, iy], [ix + ib, iy], [ix + ib, iy + ib], [ix, iy + ib]]); g.fillStyle = '#121117'; g.fill(); K.ink(g, 2.5);
  const awakened = o.card && o.card.state.awakened;
  if (awakened) { K.poly(g, [[ix + 2, iy + 2], [ix + ib - 2, iy + 2], [ix + ib - 2, iy + ib - 2], [ix + 2, iy + ib - 2]]); g.lineWidth = 4; g.strokeStyle = '#ffd24a'; g.stroke(); }
  IC.card(g, def, ix + ib / 2, iy + ib / 2, ib * 0.72);
  const tx = ix + ib + 16, tw = x + w - tx - 14;
  const nameSize = def.name.length > 4 ? 26 : 30;
  const wide = !!o.wide;
  const state = o.stateLine !== undefined ? o.stateLine : o.card ? CI.stateLine(o.card) : '';
  const stateCol = awakened ? '#ffd24a' : K.GOLD_HI;
  K.text(ui, def.name, tx, iy + nameSize + 2, { size: nameSize, weight: 900, color: K.PAPER, maxW: tw });
  if (wide) {
    // one header line: name · family …… state
    const nw = K.measure(g, def.name, nameSize, 900);
    K.text(ui, familyLine(def), tx + nw + 16, iy + nameSize, { size: 19, weight: 700, color: fam, maxW: tw - nw - 140 });
    if (state) K.text(ui, state, x + w - 18, iy + nameSize, { size: 20, weight: 900, color: stateCol, align: 'right' });
  } else {
    K.text(ui, familyLine(def), tx, iy + nameSize + 30, { size: 19, weight: 700, color: fam, maxW: tw });
    if (state) K.text(ui, state, tx, iy + nameSize + 56, { size: 19, weight: 800, color: stateCol, maxW: tw });
  }
  // full effect text: under the icon, or (wide) to the right of it under the name
  const top = wide ? iy + nameSize + 10 : iy + ib + 16, bottom = y + h - 14 - (o.warn ? 28 : 0);
  const dx = wide ? tx : x + 24, dw = wide ? x + w - tx - 18 : w - 44;
  const f = fit(g, def.desc || '', dw, bottom - top, o.sizes || [21, 19, 17]);
  const lh = Math.round(f.size * 1.36);
  f.lines.forEach((ln, i) => K.text(ui, ln, dx, top + f.size + i * lh, { size: f.size, weight: 500, color: '#e9e1cf' }));
  if (o.warn) K.text(ui, o.warn, x + 24, y + h - 18, { size: 18, weight: 800, color: '#ff7a6a', maxW: w - 44 });
  g.globalAlpha = 1;
};
