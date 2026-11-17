// 일시정지 (GDD §9.1 pause): the three equipped cards with their full effect and live state;
// 계속 · 도움말 · 소리 ◀▶ · 화면 흔들림 켬/끔 · 포기하고 내려간다 (asks once more).
// Opened by Esc/P, the Ⅱ button, a card slot tap, or losing focus. Also the play screen's
// keys: M toggles the sound.

const K = BD.ui.K;
const NAV = BD.ui.nav;
const MSG = BD.ui.msg;
const P = { confirm: false };

// A value control: the button is focusable (Enter / ←→ when focused), the arrows are tap targets.
function stepper(ui, spec) {
  K.button(ui, { id: spec.id, label: spec.label, x: spec.x, y: spec.y, w: spec.w, h: spec.h, menu: true, size: spec.size || 24, onTap: spec.onEnter });
  const g = ui.g, cy = spec.y + spec.h / 2;
  for (const [sx, dir] of [[spec.x + 34, -1], [spec.x + spec.w - 34, 1]]) {
    K.poly(g, [[sx - 10 * dir, cy - 13], [sx + 10 * dir, cy], [sx - 10 * dir, cy + 13]]); g.fillStyle = K.GOLD_HI; g.fill(); K.ink(g, 2.5);
  }
  K.hit(ui, { id: spec.id + '_dec', label: '◀', x: spec.x - 8, y: spec.y - 6, w: 84, h: spec.h + 12, onTap: () => spec.step(-1) });
  K.hit(ui, { id: spec.id + '_inc', label: '▶', x: spec.x + spec.w - 76, y: spec.y - 6, w: 84, h: spec.h + 12, onTap: () => spec.step(1) });
}
BD.ui.stepper = stepper;
// ←/→ on a focused stepper
BD.ui.stepperKey = function (ev, ui, map) {
  const f = K.focusedButton(ui);
  if (!f || !map[f.id] || (ev.code !== 'ArrowLeft' && ev.code !== 'ArrowRight')) return false;
  map[f.id](ev.code === 'ArrowLeft' ? -1 : 1);
  ui.sfxSafe('ui_move');
  return true;
};

// GDD-V2 §5.7 pause: the build — each card with its level (pips), its effect and what every level
// adds (the levels it has in gold, the next one marked), the boons with their ranks, the task.
const IC = BD.ui.icons;
const CI = BD.ui.cards;
function buildCard(ui, c, x, y, w, h) {
  const g = ui.g, ph = K.phone(ui);
  if (!c) { BD.ui.cardFace(ui, null, x, y, w, h, {}); return; }
  const def = c.def, fam = K.famColor(def.family), max = def.levels ? BD.cardRt.maxLevel(def) : 1, lv = c.level || 1;
  K.panel(g, x, y, w, h, { slant: 0, edge: fam, edgeW: 2, facetK: 0.3, shadow: 5 });
  g.fillStyle = fam; g.fillRect(x + 6, y + 6, 6, h - 12);
  const ib = 76, ix = x + 22, iy = y + 14;
  K.poly(g, [[ix - 4, iy - 4], [ix + ib + 4, iy - 4], [ix + ib + 4, iy + ib + 4], [ix - 4, iy + ib + 4]]); g.fillStyle = '#b08a3a'; g.fill(); K.ink(g, 3);
  K.poly(g, [[ix, iy], [ix + ib, iy], [ix + ib, iy + ib], [ix, iy + ib]]); g.fillStyle = '#121117'; g.fill(); K.ink(g, 2.5);
  if (c.state.awakened) { K.poly(g, [[ix + 2, iy + 2], [ix + ib - 2, iy + 2], [ix + ib - 2, iy + ib - 2], [ix + 2, iy + ib - 2]]); g.lineWidth = 4; g.strokeStyle = '#ffd24a'; g.stroke(); }
  IC.card(g, def, ix + ib / 2, iy + ib / 2, ib * 0.72);
  if (max > 1) K.text(ui, lv + '단계', ix + ib / 2, iy + ib + (ph ? 30 : 26), { size: ph ? 24 : 20, align: 'center', weight: 900, color: lv >= max ? '#fff1cf' : K.GOLD_HI, stroke: 4 });
  const tx = ix + ib + 18, split = max > 1 ? x + Math.round(w * 0.47) : x + w - 16;
  const ns = ph ? 30 : 27;
  K.text(ui, def.name, tx, y + 14 + ns, { size: ns, weight: 900, color: K.PAPER, maxW: split - tx - 10 });
  const fl = BD.ui.familyLine(def), state = CI.stateLine(c);
  K.text(ui, fl + (state ? '  ·  ' + state : ''), tx, y + 14 + ns + (ph ? 28 : 24), { size: ph ? 21 : 18, weight: 800, color: state && c.state.awakened ? '#ffd24a' : fam, maxW: split - tx - 10 });
  // the effect (its own level-1 line if the long description does not fit)
  const top = y + 14 + ns + (ph ? 40 : 34), sizes = ph ? [22, 21, 20] : [19, 18, 17];
  let f = BD.ui.fitText(g, def.desc || '', split - tx - 12, y + h - 10 - top, sizes);
  if (def.levels && def.levels[1] && /…$/.test(f.lines[f.lines.length - 1] || '')) f = BD.ui.fitText(g, def.levels[1].text, split - tx - 12, y + h - 10 - top, sizes);
  const lh = Math.round(f.size * 1.36);
  f.lines.forEach((ln, i) => K.text(ui, ln, tx, top + f.size + i * lh, { size: f.size, weight: 500, color: '#e9e1cf' }));
  if (max < 2) return;
  // right column: the pips and levels 2..max
  BD.ui.levelPips(g, x + w - 16, y + 20, lv, max, false);
  const rx = split + 10, rw = x + w - 16 - rx, y0 = y + (ph ? 54 : 50), room = y + h - 8 - y0;
  // the largest size at which levels 2..max all fit, else the smallest with the overflow cut
  let ls = 0, wraps = null;
  for (const s of ph ? [21, 20, 19, 18] : [17, 16, 15]) {
    wraps = []; for (let k = 2; k <= max; k++) wraps.push(K.wrap(g, BD.cardRt.levelText(def, k) || '', rw - 28, s, 600));
    ls = s;
    if (wraps.reduce((n, L) => n + L.length, 0) * Math.round(s * 1.26) + (max - 2) * 2 <= room + ls) break;
  }
  const llh = Math.round(ls * 1.26);
  let yy = y0;
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(split - 4, y + 12, 1.5, h - 24);
  for (let k = 2; k <= max; k++) {
    const have = lv >= k, next = lv + 1 === k;
    const L = wraps[k - 2];
    const fitN = Math.max(1, Math.floor((y + h - 4 - yy) / llh) + 0);
    const rows = L.slice(0, fitN);
    if (rows.length < L.length) rows[rows.length - 1] = rows[rows.length - 1].replace(/.$/, '…');
    if (!rows.length || yy > y + h - 6) break;
    K.circle(g, rx + 10, yy - ls * 0.36, ph ? 11 : 9); g.fillStyle = have ? K.GOLD : next ? '#3a3420' : '#24222a'; g.fill(); K.ink(g, 2, next ? K.GOLD : K.INK);
    K.text(ui, String(k), rx + 10, yy - ls * 0.36 + 1, { size: ph ? 15 : 13, align: 'center', base: 'middle', weight: 900, color: have ? K.INK : K.DIM });
    rows.forEach((ln, i) => K.text(ui, ln, rx + 28, yy + i * llh, { size: ls, weight: have || next ? 700 : 600, color: have ? K.GOLD_HI : next ? '#f3ead8' : '#8f887c' }));
    yy += rows.length * llh + 2;
  }
}
// the boons as chips: glyph, name, rank pips
function drawBoons(ui, w, x, y, maxW) {
  const g = ui.g, ph = K.phone(ui), b = w.hero.boons || {};
  const ids = Object.keys(b).filter((id) => b[id] > 0).sort();
  const fs = ph ? 22 : 18;
  K.text(ui, '단련', x, y + 26, { size: ph ? 24 : 20, weight: 900, color: K.DIM });
  let cx = x + (ph ? 70 : 60);
  if (!ids.length) { K.text(ui, '아직 없다', cx, y + 26, { size: fs, weight: 700, color: K.MUTED }); return; }
  for (const id of ids) {
    const def = BD.boons.has(id) ? BD.boons.get(id) : null, name = def ? def.name : id, max = def ? def.max : 3;
    const tw = K.measure(g, name, fs, 800), cw = 50 + tw + max * 13 + 10;
    if (cx + cw > x + maxW) break;
    K.panel(g, cx, y + 4, cw, 34, { slant: 5, shadow: 2, facetK: 0.5, edge: '#7a5a22' });
    IC.glyph(g, 'boon:' + id, cx + 19, y + 21, 24);
    K.text(ui, name, cx + 34, y + 27, { size: fs, weight: 800, color: K.PAPER });
    for (let k = 0; k < max; k++) { K.circle(g, cx + 48 + tw + k * 13, y + 21, 4.5); g.fillStyle = k < b[id] ? K.GOLD_HI : '#2a2830'; g.fill(); K.ink(g, 1.8); }
    cx += cw + 10;
  }
}

BD.ui.overlays.register({
  id: 'pause',
  draw(g, ui) {
    const w = ui.world, app = ui.app, st = app.save.settings, ph = K.phone(ui);
    if (ui.time - (P.seen || -9) > 0.2) P.confirm = false; // a fresh opening never starts armed
    P.seen = ui.time;
    K.dim(g, 0.84);
    K.letter(g, '일시정지', 200, 74, { size: 54 });
    const lvl = w.hero.level ? 'Lv ' + w.hero.level + ' · ' : '';
    K.text(ui, lvl + K.floorName(w.floorN) + ' · ' + BD.flow.clockStr(w) + ' · HP ' + w.hero.hp + '/' + w.hero.maxHp, 1230, 66, { size: ph ? 28 : 23, align: 'right', weight: 800, color: K.DIM });
    const T = BD.ui.taskState ? BD.ui.taskState(w) : null;
    if (T) K.text(ui, '과업 — ' + T.label, 384, 66, { size: ph ? 28 : 23, weight: 900, color: T.color === K.PAPER ? K.GOLD_HI : T.color, maxW: 420 });
    for (let i = 0; i < 3; i++) buildCard(ui, w.cards[i], 40, 96 + i * 160, 776, 150);
    drawBoons(ui, w, 40, 576, 776);
    const x = 850, bw = 380;
    K.button(ui, { id: 'resume', label: '계속', kind: 'primary', x, y: 100, w: bw, h: 76, hitPad: 8, menu: true, size: 32, onTap: () => { P.confirm = false; app.resume(); } });
    K.button(ui, { id: 'help', label: '도움말', x, y: 194, w: bw, h: 66, hitPad: 8, menu: true, onTap: () => { P.confirm = false; NAV.openHelp(ui); } });
    stepper(ui, { id: 'volume', label: '소리 ' + NAV.volumeLabel(st), x, y: 278, w: bw, h: 66, onEnter: () => NAV.toggleMute(ui), step: (d) => NAV.volume(ui, d * 0.1) });
    K.button(ui, { id: 'shake', label: '화면 흔들림 ' + (st.shake ? '켬' : '끔'), x, y: 362, w: bw, h: 66, hitPad: 8, menu: true, onTap: () => app.setSettings({ shake: !st.shake }) });
    K.button(ui, {
      id: 'giveup', label: P.confirm ? '정말 포기한다' : '포기하고 내려간다', sub: P.confirm ? '한 번 더 누르면 판이 끝난다' : null, kind: 'danger',
      x, y: 518, w: bw, h: P.confirm ? 82 : 66, hitPad: 8, menu: true, size: 25,
      onTap: () => { if (P.confirm) { P.confirm = false; app.giveUp(); NAV.focus0(ui); } else P.confirm = true; },
    });
  },
  key(ev, ui) {
    if (BD.ui.stepperKey(ev, ui, { volume: (d) => NAV.volume(ui, d * 0.1) })) return true;
    if (ev.code === 'Escape' || ev.code === 'KeyP') P.confirm = false;
    return NAV.keyTick(ev, ui);
  },
});

// the play mode's screen: nothing to draw over the HUD; M mutes / unmutes
BD.ui.screens.register({
  id: 'play',
  draw() {},
  key(ev, ui) {
    if (ev.code === 'KeyM') {
      const v = NAV.toggleMute(ui);
      MSG.toast(v > 0 ? '소리 ' + Math.round(v * 100) + '%' : '소리 꺼짐', 'info');
      return true;
    }
    return false;
  },
});
