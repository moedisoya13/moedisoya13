// 출정 준비 (GDD §9.1 prep): 이번 밤의 성인 — the three dealt cards large with their full
// effect; 다시 뽑기 (1) once rerolls are unlocked; 밤의 깊이 ◀ n ▶ once a depth is unlocked;
// the seed in small type; the big 오른다 button. The hand is dealt by the engine's §5.6 rule
// (BD.cardRt.dealHand) from the seed picked when the screen opens.

const C = BD.C;
const K = BD.ui.K;
const BG = BD.ui.backdrop;
const NAV = BD.ui.nav;
const PREP = BD.ui.prep;

const TIER_NAMES = ['보통 밤', '깊은 밤', '그믐', '새벽 없는 밤'];
BD.ui.tierName = (n) => TIER_NAMES[n] || '깊이 ' + n;
function tierMods(n) {
  if (!n) return '기본 규칙';
  const m = BD.tierMods(n), out = [];
  if (m.enemyHp !== 1) out.push('적 HP ×' + Math.round(m.enemyHp * 100) / 100);
  if (m.elitePlus) out.push('층마다 정예 +' + m.elitePlus);
  if (m.runSec !== C.RUN_SEC) out.push('시계 ' + m.runSec + '초');
  if (m.guardianDmg !== 1) out.push('수호자 피해 ×' + Math.round(m.guardianDmg * 100) / 100);
  if (m.flask !== C.FLASK) out.push('성수 +' + m.flask);
  if (m.enemySpeed !== 1) out.push('적 속도 ×' + Math.round(m.enemySpeed * 100) / 100);
  return out.join(' · ');
}
BD.ui.tierMods = tierMods;

BD.ui.screens.register({
  id: 'prep',
  draw(g, ui) {
    const app = ui.app, s = app.save;
    BG.draw(g, ui, { variant: 'night', dim: 0.6 });
    K.letter(g, '이번 밤의 성인', 640, 76, { size: 50, fill: K.PAPER, fill2: '#e8c47a' });
    const hand = NAV.hand();
    for (let i = 0; i < 3; i++) {
      const id = hand[i], def = id ? BD.cards.get(id) : null;
      BD.ui.cardFace(ui, def, 58 + i * 396, 104, 372, 334, { sizes: [23, 21, 19, 17] });
    }
    // big 오른다 first, so Enter starts the night
    K.button(ui, { id: 'ascend', label: '오른다', kind: 'primary', size: 38, x: 470, y: 578, w: 340, h: 84, menu: true, onTap: () => NAV.ascend(ui) });
    if (s.rerollUnlocked) {
      const left = 1 - PREP.rerolls;
      K.button(ui, { id: 'reroll', label: '다시 뽑기 (' + left + ')', x: 58, y: 462, w: 290, h: 64, menu: true, size: 25, disabled: left <= 0, onTap: () => { PREP.rerolls++; } });
    }
    if ((s.tierUnlocked || 0) > 0) {
      K.button(ui, { id: 'tier', label: '밤의 깊이  ◀  ' + PREP.tier + '  ▶', sub: '「' + BD.ui.tierName(PREP.tier) + '」 ' + tierMods(PREP.tier), x: 392, y: 452, w: 496, h: 90, menu: true, size: 26, subSize: 20, onTap: () => NAV.setTier(ui, PREP.tier >= s.tierUnlocked ? 0 : PREP.tier + 1) });
      // the arrows are their own tap targets (declared after, so they win the hit test)
      K.hit(ui, { id: 'tier_dec', label: '◀', x: 392, y: 452, w: 150, h: 90, onTap: () => NAV.setTier(ui, PREP.tier - 1) });
      K.hit(ui, { id: 'tier_inc', label: '▶', x: 738, y: 452, w: 150, h: 90, onTap: () => NAV.setTier(ui, PREP.tier + 1) });
    }
    K.button(ui, { id: 'back', label: '돌아가기', kind: 'quiet', x: 58, y: 590, w: 220, h: 62, menu: true, size: 23, onTap: () => NAV.title(ui) });
    K.text(ui, '시드 ' + PREP.seed, 1222, 640, { size: 20, align: 'right', color: K.DIM, weight: 600 });
  },
  key(ev, ui) {
    const f = K.focusedButton(ui);
    if (f && f.id === 'tier' && (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight')) {
      NAV.setTier(ui, PREP.tier + (ev.code === 'ArrowLeft' ? -1 : 1));
      ui.sfxSafe('ui_move');
      return true;
    }
    if (ev.code === 'Escape') { NAV.title(ui); return true; }
    return NAV.keyTick(ev, ui);
  },
});
