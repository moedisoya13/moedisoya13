// 기록 (GDD §9.1 codex): left, the run statistics; right, the card grid (locked cards show a
// lock and their unlock condition with progress; unlocked cards their effect and a 이 카드로
// 승리 stamp); below, the last ten runs. The grid lists the registered cards in GDD order;
// the tile under the focus or the last tap is described in the panel under the grid.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const CI = BD.ui.cards;
const BG = BD.ui.backdrop;
const NAV = BD.ui.nav;

function statRows(s) {
  const upto = Math.max(1, (s.tierUnlocked || 0) + 1);
  const tierWins = (s.tierWins || []).slice(0, upto).map((n, i) => (i ? '깊이' + i : '보통') + ' ' + n).join(' · ');
  return [
    ['판 수', String(s.runs)],
    ['승리', s.wins + '회'],
    ['최고 층', s.bestFloor ? K.floorName(s.bestFloor) : '—'],
    ['최단 승리', s.bestWinSec === null || s.bestWinSec === undefined ? '—' : K.clockOf(s.bestWinSec) + ' (' + K.mmss(s.bestWinSec) + ')'],
    ['깊이별 승리', tierWins || '—'],
    ['최고 레벨', s.bestLevel ? 'Lv ' + s.bestLevel : '—'],          // GDD-V2 §8
    ['한 판 최다 처치', s.bestKills ? String(s.bestKills) : '—'],
    ['누적 처치', String(s.counters.kills)],
  ];
}

BD.ui.screens.register({
  id: 'codex',
  draw(g, ui) {
    const s = ui.app.save;
    BG.draw(g, ui, { variant: 'night', dim: 0.72 });
    K.letter(g, '기록', 96, 66, { size: 50, fill: K.PAPER, fill2: '#e8c47a' });
    // stats
    K.panel(g, 24, 92, 324, 488, { edge: '#8d877c', facetK: 0.1 });
    statRows(s).forEach(([k, v], i) => {
      const y = 124 + i * 58;
      K.text(ui, k, 44, y, { size: 21, color: K.DIM, weight: 700 });
      const vs = v.length > 12 ? 20 : 27;
      K.text(ui, v, 44, y + 30, { size: vs, color: K.PAPER, weight: 900, maxW: 290 });
    });
    // card grid
    const cards = CI.all();
    const cols = 6, tw = 141, th = 126, gx = 368, gy = 92;
    let sel = BD.ui.codexSel || (cards[0] && cards[0].id);
    const f = K.focusedButton(ui);
    if (f && f.id && f.id.indexOf('card:') === 0 && ui.activeLayer() === 'screen' && BD.ui.S.lastInput === 'key') sel = f.id.slice(5);
    cards.forEach((def, i) => {
      const x = gx + (i % cols) * (tw + 8), y = gy + Math.floor(i / cols) * (th + 8);
      const unlocked = CI.isUnlocked(def, s);
      const cx = s.codex[def.id] || { held: 0, wins: 0, best: 0 };
      const b = K.button(ui, { id: 'card:' + def.id, x, y, w: tw, h: th, menu: true, slant: 0, kind: 'quiet', selected: sel === def.id, onTap: () => { BD.ui.codexSel = def.id; } });
      if (unlocked) IC.card(g, def, x + tw / 2, y + 50, 56);
      else { IC.card(g, def, x + tw / 2, y + 50, 56, { alpha: 0.12 }); IC.lock(g, x + tw / 2, y + 50, 40); }
      K.text(ui, def.name, x + tw / 2, y + th - 26, { size: 21, align: 'center', weight: 800, color: unlocked ? K.famColor(def.family) : K.MUTED, maxW: tw - 12 });
      if (cx.wins > 0) IC.stamp(g, x + tw - 30, y + 30, 44, '승리');
      // GDD-V2 §8: the best level this card reached, as five pips under its name
      const max = def.levels ? BD.cardRt.maxLevel(def) : 0;
      if (unlocked && max > 1) {
        const best = Math.min(max, cx.bestLevel || 0);
        for (let k = 0; k < max; k++) { const px = x + tw / 2 + (k - (max - 1) / 2) * 13; K.circle(g, px, y + th - 11, 4.2); g.fillStyle = k < best ? (best >= max ? '#fff1cf' : K.GOLD_HI) : '#2a2830'; g.fill(); K.ink(g, 1.8); }
      }
      b.card = def;
    });
    // details of the selected card
    const def = sel && BD.cards.has(sel) ? BD.cards.get(sel) : null;
    K.panel(g, gx, 500, 888, 104, { edge: def ? K.famColor(def.family) : '#3a3a40', facetK: 0.3 });
    if (def) {
      const unlocked = CI.isUnlocked(def, s), cx = s.codex[def.id] || { held: 0, wins: 0, best: 0 };
      IC.card(g, def, gx + 52, 552, 64, { alpha: unlocked ? 1 : 0.3 });
      K.text(ui, def.name, gx + 100, 532, { size: 25, weight: 900, color: K.PAPER });
      const head = BD.ui.familyLine(def) + (unlocked ? '  ·  사용 ' + cx.held + '판 · 승리 ' + cx.wins + '회' + (cx.bestLevel ? ' · 최고 ' + cx.bestLevel + '단계' : '') + (cx.best ? ' · 최고 ' + (def.family === 'quest' ? '각성' : '×' + cx.best) : '') : '');
      K.text(ui, head, gx + 100 + K.measure(g, def.name, 25, 900) + 16, 532, { size: 18, weight: 700, color: K.famColor(def.family), maxW: 640 });
      if (unlocked) K.para(ui, def.desc || '', gx + 100, 562, 770, { size: 19, maxLines: 2, color: '#e9e1cf' });
      else {
        const p = CI.unlockProgress(def.id, s);
        K.text(ui, '해금: ' + CI.unlockText(def.id) + (p ? '  (' + p[0] + '/' + p[1] + ')' : ''), gx + 100, 568, { size: 21, weight: 800, color: K.GOLD_HI });
        if (p) { K.bar(g, gx + 100, 578, 420, 14, p[0] / p[1], { color: K.GOLD, slant: 4 }); }
      }
    }
    // the last ten runs
    const hist = s.history || [];
    K.text(ui, '최근 ' + Math.min(10, hist.length) + '판', 30, 607, { size: 19, weight: 800, color: K.DIM });
    if (!hist.length) K.text(ui, '아직 오른 밤이 없다', 140, 607, { size: 19, color: K.MUTED, weight: 700 });
    hist.slice(0, 10).forEach((h, i) => {
      const x = 24 + (i % 5) * 248, y = 616 + Math.floor(i / 5) * 50;
      const win = h.result === 'win';
      K.panel(g, x, y, 236, 42, { slant: 5, shadow: 2, edge: win ? K.GOLD : '#5a3a3a', facetK: 0.45 });
      K.text(ui, (win ? '승리' : '쓰러짐') + ' ' + K.floorName(h.floor) + ' · ' + K.clockOf(h.sec), x + 12, y + 29, { size: 18, weight: 800, color: win ? K.GOLD_HI : '#d9b0a8', maxW: 150 });
      (h.cards || []).slice(0, 3).forEach((id, k) => IC.card(g, BD.cards.has(id) ? BD.cards.get(id) : { id, name: id }, x + 176 + k * 22, y + 21, 22));
    });
    K.button(ui, { id: 'back', label: '돌아가기', kind: 'quiet', x: 1034, y: 20, w: 220, h: 60, menu: true, size: 23, onTap: () => NAV.title(ui) });
  },
  key(ev, ui) {
    if (ev.code === 'Escape') { NAV.title(ui); return true; }
    return NAV.keyTick(ev, ui);
  },
});
