// 제단 (GDD §9.1 altar, §3.5): the world is frozen behind a dark wash. Step 1: 제단 — 다음 층:
// 중갑, two offered cards with their full effect, 기도한다 (HP +25), 나중에. Step 2 (a card was
// picked): 어느 홈을 비우겠습니까? — the three current cards with their progress and stacks
// (and what will be lost), 새긴다 / 돌아가기. Commands go through app.cmd('altar', …).

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const NAV = BD.ui.nav;
const A = { sel: null, key: null };

function lossLine(card) {
  if (!card) return null;
  const st = card.state;
  if (card.def.family === 'quest' && !st.awakened && st.progress > 0) return '진행 ' + st.progress + '/' + st.goal + '이 사라진다';
  if (card.def.family === 'quest' && st.awakened) return '각성한 성인이 사라진다';
  if (card.def.family === 'combo' && st.stack > 0) return '스택 ×' + st.stack + '이 사라진다';
  return null;
}

BD.ui.overlays.register({
  id: 'altar',
  draw(g, ui) {
    const app = ui.app, w = ui.world, a = w.altar;
    const cmd = (c, arg) => { app.cmd('altar', c, arg); NAV.focus0(ui); };
    // a fresh opening or a new step clears the slot choice
    const key = a.round + ':' + a.step + ':' + a.pick;
    if (A.key !== key) { A.key = key; A.sel = null; }
    K.dim(g, 0.82);
    const next = w.floorN >= 5 ? 'rooftop' : w.floor.nextDomType;
    const title = '제단 — 다음 층: ' + K.typeName(next);
    K.letter(g, title, 640, 66, { size: 42, fill: K.PAPER, fill2: '#e8c47a' });
    const tw = K.measure(g, title, 42, 900);
    IC.type(g, next, 640 + tw / 2 + 34, 52, 34, { disc: C.FLOOR_COLORS[next] || '#7d8597' });
    K.text(ui, 'HP ' + w.hero.hp + ' / ' + w.hero.maxHp, 640, 102, { size: 22, align: 'center', weight: 800, color: w.hero.hp < 50 ? '#ff8a7a' : K.DIM });
    if (a.step === 'choose') {
      const n = a.offers.length, cw = 420, gap = 40;
      const x0 = 640 - (n * cw + (n - 1) * gap) / 2;
      a.offers.forEach((id, i) => {
        const def = BD.cards.get(id), x = x0 + i * (cw + gap);
        const b = K.button(ui, { id: 'offer' + i, label: def.name, x, y: 120, w: cw, h: 336, menu: true, bare: true, onTap: () => cmd('pick', i) });
        BD.ui.cardFace(ui, def, x, 120, cw, 336, { focused: b.focused, iconSize: 92, sizes: [26, 24, 22, 20, 18] });
      });
      if (!n) K.text(ui, '이번 제단에는 새길 성인이 없다', 640, 290, { size: 26, align: 'center', color: K.DIM, weight: 700 });
      K.button(ui, { id: 'pray', label: '기도한다 (HP +' + C.PRAY + ')', kind: 'primary', x: 360, y: 478, w: 560, h: 74, menu: true, size: 29, onTap: () => cmd('pray') });
      K.button(ui, { id: 'later', label: '나중에', kind: 'quiet', x: 520, y: 572, w: 240, h: 62, menu: true, size: 24, onTap: () => cmd('later') });
      K.text(ui, '카드 한 장 또는 기도, 하나만 고를 수 있다', 640, 670, { size: 20, align: 'center', color: K.DIM, weight: 600 });
    } else {
      const inDef = BD.cards.get(a.offers[a.pick]);
      K.letter(g, '어느 홈을 비우겠습니까?', 640, 146, { size: 34, fill: K.GOLD_HI, fill2: '#d6a636', shadow: 3, stroke: 7 });
      IC.card(g, inDef, 520, 182, 34);
      K.text(ui, '새길 성인: ' + inDef.name + ' (' + (K.FAMILY_NAMES[inDef.family] || '') + ')', 546, 190, { size: 22, weight: 800, color: K.famColor(inDef.family) });
      for (let i = 0; i < 3; i++) {
        const c = w.cards[i], x = 70 + i * 386;
        const b = K.button(ui, {
          id: 'slot' + i, label: c ? c.def.name : '빈 홈', x, y: 206, w: 366, h: 286, menu: true, bare: true,
          onTap: () => { A.sel = i; if (BD.ui.S.lastInput === 'key') ui.focus = 3; },
        });
        BD.ui.cardFace(ui, c ? c.def : null, x, 206, 366, 286, { card: c, focused: b.focused, selected: A.sel === i, iconSize: 76, sizes: [22, 20, 19, 17], warn: A.sel === i ? lossLine(c) : null });
        // the seal that goes: a red stamp across its icon socket
        if (A.sel === i) K.letter(g, '비운다', x + 22 + 38, 206 + 16 + 50, { size: 30, fill: '#ff8a7a', fill2: '#d04a3a', rot: -0.22, stroke: 7, shadow: 2 });
      }
      K.button(ui, { id: 'engrave', label: '새긴다', kind: 'primary', x: 400, y: 518, w: 260, h: 76, menu: true, size: 31, disabled: A.sel === null, onTap: () => { const s = A.sel; A.sel = null; cmd('slot', s); } });
      K.button(ui, { id: 'back', label: '돌아가기', kind: 'quiet', x: 684, y: 518, w: 220, h: 76, menu: true, size: 25, onTap: () => cmd('back') });
    }
  },
  key(ev, ui) {
    const a = ui.world && ui.world.altar;
    if (a && a.state === 'open' && ev.code === 'Escape') {
      ui.app.cmd('altar', a.step === 'slot' ? 'back' : 'later');
      NAV.focus0(ui);
      return true;
    }
    return NAV.keyTick(ev, ui);
  },
});
