// Title (GDD §9.1): 여명 전야 / Before Dawn over the night city and the crowned skyscraper,
// buttons 출정 기록 설정 도움말, and one line of the best record at the bottom.

const K = BD.ui.K;
const BG = BD.ui.backdrop;
const NAV = BD.ui.nav;

function recordLine(s) {
  const best = s.bestFloor ? K.floorName(s.bestFloor) : '—';
  return '최고 기록: ' + best + ' · 승리 ' + s.wins + '회';
}
BD.ui.recordLine = recordLine;

BD.ui.screens.register({
  id: 'title',
  draw(g, ui) {
    BG.draw(g, ui, { variant: 'night' });
    BG.hero(g, 'hero_slash', 1086, 668, 290);
    // title lettering
    K.letter(g, '여명 전야', 300, 200, { size: 112, fill: K.PAPER, fill2: '#e8c47a', shadow: 7, stroke: 16 });
    K.letter(g, 'Before Dawn', 300, 252, { size: 32, fill: K.AMBER, fill2: '#d8954a', shadow: 3, stroke: 7 });
    // crossguard rule
    g.fillStyle = K.GOLD; K.poly(g, [[150, 278], [290, 274], [300, 266], [310, 274], [450, 278], [310, 282], [300, 290], [290, 282]]); g.fill(); K.ink(g, 2.5);
    const s = ui.app.save;
    const items = [
      { id: 'sortie', label: '출정', kind: 'primary', size: 32, onTap: () => NAV.sortie(ui) },
      { id: 'codex', label: '기록', onTap: () => NAV.codex(ui) },
      { id: 'settings', label: '설정', onTap: () => NAV.openSettings(ui) },
      { id: 'help', label: '도움말', onTap: () => NAV.openHelp(ui) },
    ];
    items.forEach((it, i) => K.button(ui, Object.assign({ x: 150, y: 312 + i * 80, w: 300, h: 66, menu: true, size: it.size || 27 }, it)));
    // best record
    const line = recordLine(s);
    const tw = K.measure(g, line, 22, 700);
    K.panel(g, 300 - tw / 2 - 22, 642, tw + 44, 42, { slant: 8, shadow: 3 });
    K.text(ui, line, 300, 670, { size: 22, align: 'center', color: K.DIM, weight: 700 });
  },
  key: (ev, ui) => NAV.keyTick(ev, ui),
});
