// BARE overlays (engine placeholder): pause, altar, rotate. The UI agent replaces these.

const C = BD.C;
function dim(g, a) { g.fillStyle = 'rgba(5,6,10,' + (a || 0.72) + ')'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H); }

let confirmGiveUp = false;
BD.ui.overlays.register({
  id: 'pause',
  draw(g, ui) {
    dim(g);
    ui.text('일시정지', 640, 170, { size: 48, align: 'center', stroke: 5 });
    const w = ui.world;
    let y = 230;
    for (const c of w.cards.filter(Boolean)) { ui.text(c.def.name + ' — ' + c.def.desc, 640, y, { size: 16, align: 'center', maxW: 1100 }); y += 26; }
    ui.button({ x: 540, y: 400, w: 200, h: 52, label: '계속', menu: true, style: 'primary', onTap: () => { confirmGiveUp = false; ui.app.resume(); } });
    ui.button({
      x: 490, y: 470, w: 300, h: 52, label: confirmGiveUp ? '정말 포기한다' : '포기하고 내려간다', menu: true,
      onTap: () => { if (confirmGiveUp) { confirmGiveUp = false; ui.app.giveUp(); } else confirmGiveUp = true; },
    });
  },
});

BD.ui.overlays.register({
  id: 'altar',
  draw(g, ui) {
    const w = ui.world, a = w.altar;
    dim(g);
    const next = w.floor.nextDomType ? C.TYPE_NAMES[w.floor.nextDomType] : '옥상';
    ui.text('제단 — 다음 층: ' + next, 640, 110, { size: 34, align: 'center', stroke: 4 });
    const cmd = (c, arg) => ui.app.cmd('altar', c, arg);
    if (a.step === 'choose') {
      a.offers.forEach((id, i) => {
        const d = BD.cards.get(id);
        const x = 330 + i * 330;
        ui.button({ x, y: 170, w: 290, h: 220, style: 'plain', menu: true, onTap: () => cmd('pick', i) });
        ui.text(d.name, x + 145, 215, { size: 28, align: 'center', color: BD.ui.FAMILY_COLORS[d.family] });
        wrap(ui, d.desc, x + 20, 260, 250, 20);
      });
      ui.button({ x: 490, y: 420, w: 300, h: 54, label: '기도한다 (HP +' + C.PRAY + ')', menu: true, onTap: () => cmd('pray') });
      ui.button({ x: 540, y: 490, w: 200, h: 48, label: '나중에', menu: true, onTap: () => cmd('later') });
    } else {
      ui.text('어느 홈을 비우겠습니까?', 640, 170, { size: 26, align: 'center' });
      for (let i = 0; i < 3; i++) {
        const c = w.cards[i];
        ui.button({ x: 340 + i * 210, y: 220, w: 190, h: 120, label: c ? c.def.name : '(빈 홈)', menu: true, onTap: () => cmd('slot', i) });
      }
      ui.button({ x: 540, y: 380, w: 200, h: 48, label: '돌아가기', menu: true, onTap: () => cmd('back') });
    }
  },
});

function wrap(ui, text, x, y, maxW, lh) {
  const g = ui.g;
  g.font = BD.ui.font(16, 500);
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { ui.text(line, x, y, { size: 16, weight: 500 }); y += lh; line = ch; } else line += ch;
  }
  if (line) ui.text(line, x, y, { size: 16, weight: 500 });
}

BD.ui.overlays.register({
  id: 'rotate',
  draw(g, ui) {
    dim(g, 0.9);
    ui.text('화면을 가로로 돌려 주세요', 640, 360, { size: 40, align: 'center', stroke: 5 });
  },
});
