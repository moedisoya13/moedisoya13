// 결과 (GDD §9.1 result). Death: 쓰러졌다 / "3F · 23:10 · 구울의 달려들기에". Victory: 여명 /
// "04:12, 마왕이 쓰러졌다". Both: the three cards (progress, best stack, contribution), the top
// three damage sources, kills, trials, new unlocks, the seed; 다시 오른다 · 같은 밤 다시 · 타이틀로.
// Everything comes from app.lastResult (BD.progress.summary + unlocks).

const K = BD.ui.K;
const IC = BD.ui.icons;
const BG = BD.ui.backdrop;
const NAV = BD.ui.nav;

function cardStat(c, def) {
  if (def && def.family === 'quest') return c.awakened ? '각성' : '진행 ' + (c.progress || 0) + '/' + c.goal;
  if (def && def.family === 'combo') return '최고 ×' + (c.bestStack || 0);
  return '';
}
// "ghoul:lunge" → 구울의 달려들기 (engine text); zone and dawn keys get words here
function damageName(d) {
  if (d.text && d.text !== d.key) return d.text;
  const [src, atk] = String(d.key).split(':');
  if (src === 'zone') return '불 장판';
  if (src === 'drain') return '여명 침식';
  if (BD.enemies.has(src)) { const e = BD.enemies.get(src); return e.name + (atk ? '의 ' + atk : ''); }
  return d.text || d.key;
}
BD.ui.damageName = damageName;
function unlockLine(u) {
  if (u.kind === 'card') return '새 성인: ' + (u.name || (BD.cards.has(u.id) ? BD.cards.get(u.id).name : u.id));
  if (u.kind === 'tier') return '밤의 깊이 ' + u.id + ' 「' + BD.ui.tierName(u.id) + '」';
  if (u.kind === 'reroll') return '출정 준비: 다시 뽑기';
  return String(u.kind);
}
BD.ui.unlockLine = unlockLine;

BD.ui.screens.register({
  id: 'result',
  draw(g, ui) {
    const r = ui.app.lastResult;
    if (!r) { BG.draw(g, ui, { variant: 'night' }); return; }
    const win = r.result === 'win';
    BG.draw(g, ui, { variant: win ? 'dawn' : 'night', dim: win ? 0.15 : 0.35 });
    if (win) BG.hero(g, 'hero_slash', 1092, 668, 290);
    else BG.hero(g, 'hero_hurt', 1092, 676, 250, { rot: 0.42 });
    K.letter(g, win ? '여명' : '쓰러졌다', 70, 118, { size: 92, align: 'left', fill: win ? '#fff1cf' : K.PAPER, fill2: win ? '#f2b860' : '#b9b0a0', stroke: 14, shadow: 6 });
    const where = K.floorName(r.floor);
    const cause = r.cause && r.causeText === r.cause ? damageName({ key: r.cause }) + '에' : r.causeText || '';
    const sub = win ? r.clock + ', 마왕이 쓰러졌다' : where + ' · ' + r.clock + ' · ' + cause;
    K.text(ui, sub, 76, 168, { size: 27, weight: 800, color: win ? '#fff1cf' : '#e9e1cf', stroke: 5 });
    // cards
    K.panel(g, 60, 192, 712, 262, { edge: '#8d877c', facetK: 0.12 });
    K.text(ui, '성인', 82, 222, { size: 20, weight: 800, color: K.DIM });
    K.text(ui, '기여', 748, 222, { size: 20, weight: 800, color: K.DIM, align: 'right' });
    (r.cards || []).forEach((c, i) => {
      const def = BD.cards.has(c.id) ? BD.cards.get(c.id) : null;
      const y = 236 + i * 72;
      K.poly(g, [[80, y], [140, y], [140, y + 60], [80, y + 60]]); g.fillStyle = '#121117'; g.fill(); K.ink(g, 3);
      if (c.awakened) { K.poly(g, [[82, y + 2], [138, y + 2], [138, y + 58], [82, y + 58]]); g.lineWidth = 3; g.strokeStyle = '#ffd24a'; g.stroke(); }
      IC.card(g, def || { id: c.id, name: c.name }, 110, y + 30, 46);
      K.text(ui, c.name, 158, y + 30, { size: 26, weight: 900, color: K.PAPER });
      K.text(ui, (def ? BD.ui.familyLine(def) : '') + (cardStat(c, def) ? '  ·  ' + cardStat(c, def) : ''), 158, y + 56, { size: 19, weight: 700, color: def ? K.famColor(def.family) : K.DIM, maxW: 480 });
      K.text(ui, String(c.contrib || 0), 748, y + 42, { size: 28, weight: 900, color: K.GOLD_HI, align: 'right' });
    });
    if (!(r.cards || []).length) K.text(ui, '빈 손으로 올랐다', 158, 270, { size: 22, color: K.MUTED });
    // run numbers
    K.panel(g, 60, 468, 712, 128, { edge: '#8d877c', facetK: 0.2 });
    K.text(ui, '받은 피해', 82, 500, { size: 20, weight: 800, color: K.DIM });
    const top = r.topDamage || [];
    if (!top.length) K.text(ui, '없음', 190, 500, { size: 21, weight: 700, color: K.PAPER });
    top.forEach((d, i) => K.text(ui, (i + 1) + '. ' + damageName(d) + ' ' + d.dmg, 190 + i * 196, 500, { size: 20, weight: 700, color: '#ffb0a0', maxW: 188 }));
    const trials = r.trials ? r.trials + '회 (' + Math.round(r.trialSec || 0) + '초)' : '0회';
    K.text(ui, '처치 ' + r.kills + '  ·  시련 ' + trials + '  ·  회피 ' + (r.dodges || 0), 82, 538, { size: 23, weight: 800, color: K.PAPER });
    K.text(ui, '시드 ' + r.seed + '  ·  밤의 깊이 ' + (r.tier || 0), 82, 574, { size: 20, weight: 600, color: K.DIM });
    // unlocks
    const news = r.unlocks || [];
    if (news.length) {
      const h = 58 + news.length * 50;
      K.panel(g, 808, 192, 420, h, { edge: '#ffd24a', facetK: 0.25 });
      K.letter(g, '새로 열린 것', 1018, 230, { size: 28, fill: '#ffd24a', fill2: '#d6a636', shadow: 2, stroke: 6 });
      news.forEach((u, i) => {
        const y = 270 + i * 50;
        if (u.kind === 'card' && BD.cards.has(u.id)) IC.card(g, BD.cards.get(u.id), 846, y - 8, 38);
        else IC.crown(g, 846, y - 8, 30);
        K.text(ui, unlockLine(u), 878, y, { size: 22, weight: 800, color: K.PAPER, maxW: 330 });
      });
    }
    // buttons
    K.button(ui, { id: 'again', label: '다시 오른다', kind: 'primary', x: 60, y: 620, w: 300, h: 74, menu: true, size: 29, onTap: () => NAV.again(ui) });
    K.button(ui, { id: 'same', label: '같은 밤 다시', x: 384, y: 620, w: 270, h: 74, menu: true, size: 26, onTap: () => NAV.sameNight(ui) });
    K.button(ui, { id: 'title', label: '타이틀로', kind: 'quiet', x: 678, y: 620, w: 220, h: 74, menu: true, size: 25, onTap: () => NAV.title(ui) });
  },
  key: (ev, ui) => NAV.keyTick(ev, ui),
});
