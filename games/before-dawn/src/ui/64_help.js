// 도움말 (GDD §9.1 help): the four lines and a picture of the controls (keys and touch).
// From the title it closes back to the title; from the pause menu, back to the pause menu.
// (The rotate prompt lives in 65_rotate.js.)

const K = BD.ui.K;
const IC = BD.ui.icons;
const NAV = BD.ui.nav;

const LINES = [
  '움직이면 용사가 알아서 벱니다.',
  '가장 가까운 적이 표적입니다. 주황 꺾쇠를 보세요.',
  '빨간 빗금은 곧 맞는 자리입니다. 비키거나 돌진하세요.',
  '수호자를 베어야 계단이 열립니다. 06:00 전에 옥상으로.',
];

function bulletArt(g, i, x, y) {
  if (i === 0) { IC.dash(g, x, y, 30, K.PAPER); return; }
  if (i === 1) { // the target chevron as the game draws it (the hero's orange)
    for (const s of [-1, 1]) { K.poly(g, [[x + s * 16, y - 6], [x + s * 6, y], [x + s * 16, y + 6], [x + s * 12, y]]); g.fillStyle = BD.ui.ORANGE; g.fill(); K.ink(g, 1.5); }
    return;
  }
  if (i === 2) { // red hatch swatch
    g.save(); K.poly(g, [[x - 16, y - 12], [x + 16, y - 12], [x + 16, y + 12], [x - 16, y + 12]]); g.clip();
    g.fillStyle = 'rgba(214,40,40,0.2)'; g.fillRect(x - 16, y - 12, 32, 24);
    g.strokeStyle = '#d62828'; g.lineWidth = 3;
    for (let k = -32; k < 32; k += 8) { g.beginPath(); g.moveTo(x + k, y + 12); g.lineTo(x + k + 24, y - 12); g.stroke(); }
    g.restore(); K.poly(g, [[x - 16, y - 12], [x + 16, y - 12], [x + 16, y + 12], [x - 16, y + 12]]); K.ink(g, 3);
    return;
  }
  IC.crown(g, x, y + 2, 30);
}

BD.ui.overlays.register({
  id: 'help',
  draw(g, ui) {
    K.dim(g, 0.9);
    K.letter(g, '도움말', 640, 74, { size: 52 });
    LINES.forEach((ln, i) => {
      const y = 140 + i * 58;
      bulletArt(g, i, 150, y - 9);
      K.text(ui, ln, 190, y, { size: 27, weight: 800, color: K.PAPER, maxW: 1000 });
    });
    // keys
    K.panel(g, 90, 376, 520, 228, { edge: '#8d877c', facetK: 0.18 });
    K.text(ui, '키보드', 112, 410, { size: 22, weight: 900, color: K.GOLD_HI });
    IC.key(g, ui, 162, 426, 44, 'W');
    IC.key(g, ui, 112, 472, 44, 'A'); IC.key(g, ui, 162, 472, 44, 'S'); IC.key(g, ui, 212, 472, 44, 'D');
    K.text(ui, '이동 (방향키도)', 112, 540, { size: 20, weight: 700, color: K.DIM });
    IC.key(g, ui, 300, 426, 100, 'Space'); IC.key(g, ui, 410, 426, 80, 'Shift');
    K.text(ui, '어깨 돌진', 500, 452, { size: 20, weight: 700, color: K.PAPER });
    IC.key(g, ui, 300, 476, 60, 'Esc'); IC.key(g, ui, 370, 476, 44, 'P');
    K.text(ui, '일시정지', 424, 502, { size: 20, weight: 700, color: K.PAPER });
    IC.key(g, ui, 300, 526, 80, 'Enter'); IC.key(g, ui, 390, 526, 60, '1~4');
    K.text(ui, '메뉴 · M 소리', 460, 552, { size: 20, weight: 700, color: K.PAPER });
    // touch
    K.panel(g, 670, 376, 520, 228, { edge: '#8d877c', facetK: 0.18 });
    K.text(ui, '터치 (한 손 엄지)', 692, 410, { size: 22, weight: 900, color: K.GOLD_HI });
    g.globalAlpha = 0.8; K.circle(g, 740, 486, 38); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = K.PAPER; g.stroke(); g.globalAlpha = 1;
    K.circle(g, 764, 472, 15); g.fillStyle = K.PAPER; g.fill(); K.ink(g, 3);
    IC.finger(g, 772, 490, 34);
    K.text(ui, '아무 곳이나 누르고 끌기 = 이동', 800, 470, { size: 20, weight: 700, color: K.PAPER });
    K.text(ui, '두 번 두드리기 = 돌진', 800, 500, { size: 20, weight: 700, color: K.PAPER });
    K.circle(g, 740, 562, 26); g.fillStyle = '#1e1b16'; g.fill(); K.ink(g, 3); IC.dash(g, 740, 562, 26, K.PAPER);
    K.text(ui, '돌진 버튼', 778, 556, { size: 20, weight: 700, color: K.PAPER });
    K.text(ui, '카드 홈 · Ⅱ = 일시정지', 778, 584, { size: 20, weight: 700, color: K.DIM });
    K.button(ui, { id: 'close', label: '닫기', kind: 'primary', x: 530, y: 626, w: 220, h: 66, menu: true, size: 27, onTap: () => NAV.closeHelp(ui) });
  },
  key(ev, ui) {
    if (ev.code === 'Escape') { NAV.closeHelp(ui); return true; }
    return NAV.keyTick(ev, ui);
  },
});
