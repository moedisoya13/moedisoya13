// 결과 (GDD §9.1 result, GDD-V2 §8 "what the build did"). Death: 쓰러졌다 / "3F · 23:10 · 구울의
// 달려들기에". Victory: 여명 / "04:12, 마왕이 쓰러졌다". Both, left: the three cards with the level each
// reached (pips), progress or best stack and contribution; the top three damage sources, kills,
// dodges, the seed. Right, 이번 밤: the level reached, each floor's task with the time the task and
// the floor took, the places visited, the boons; new unlocks under them. 다시 오른다 · 같은 밤 다시 ·
// 타이틀로. The run numbers come from app.lastResult (BD.progress.summary + unlocks); the per-floor
// times and places from the UI's own run log (the events of the run), when it is the same run.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const BG = BD.ui.backdrop;
const NAV = BD.ui.nav;

// ---- the run log: what each floor took (events of the current world) ---------------------------
const LOG = BD.ui.runLog = { seed: null, floors: [], sites: 0 };
const floorRow = (n) => { let f = LOG.floors.find((x) => x.n === n); if (!f) { f = { n, task: null, t0: null, taskT: null, clearT: null, t1: null, sites: 0 }; LOG.floors.push(f); } return f; };
BD.ui.effects.register({
  id: 'runlog',
  reset(ui, w) { LOG.seed = w ? w.seed : null; LOG.floors = []; LOG.sites = 0; },
  on: {
    floor_enter(ev, ui) { const w = ui.world, f = floorRow(ev.floor); f.t0 = w.t; f.task = (w.task && w.task.kind) || (w.floor && w.floor.task) || null; f.taskName = (w.task && w.task.name) || null; },
    task_clear(ev, ui) { const f = floorRow(ev.floor); f.taskT = ui.world.t; f.task = f.task || ev.task; },
    floor_clear(ev, ui) { floorRow(ev.floor).clearT = ui.world.t; },
    floor_exit(ev, ui) { floorRow(ev.floor).t1 = ev.t; },
    site_clear(ev, ui) { if (ev.optional) { LOG.sites++; floorRow(ui.world.floorN).sites++; } },
  },
});

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
const mmss = (s) => (s === null || s === undefined || !isFinite(s) ? '—' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));
const taskName = (id, fallback) => (id && BD.tasks.has(id) ? BD.tasks.get(id).name : fallback || id || '—');

// 이번 밤: level, floors, places, boons, unlocks (right panel)
function drawNight(ui, r, x, y, w, h) {
  const g = ui.g;
  K.panel(g, x, y, w, h, { edge: '#d9b45a', facetK: 0.1 });
  K.text(ui, '이번 밤', x + 22, y + 34, { size: 22, weight: 900, color: K.DIM });
  if (r.level) K.letter(g, 'Lv ' + r.level, x + w - 24, y + 40, { size: 34, align: 'right', fill: K.GOLD_HI, fill2: '#d6a636', stroke: 7, shadow: 2 });
  let yy = y + 74;
  const same = LOG.seed === r.seed && LOG.floors.length;
  if (same) {
    K.text(ui, '층', x + 22, yy, { size: 17, weight: 800, color: K.MUTED });
    K.text(ui, '과업', x + 74, yy, { size: 17, weight: 800, color: K.MUTED });
    K.text(ui, '과업까지', x + w - 120, yy, { size: 17, weight: 800, color: K.MUTED, align: 'right' });
    K.text(ui, '층 전체', x + w - 24, yy, { size: 17, weight: 800, color: K.MUTED, align: 'right' });
    yy += 30;
    for (const f of LOG.floors.slice().sort((a, b) => a.n - b.n).slice(0, 6)) {
      const done = f.taskT !== null, left = f.t1 !== null;
      const tName = f.n >= 6 ? '마왕' : taskName(f.task, f.taskName);
      K.text(ui, K.floorName(f.n), x + 22, yy, { size: 21, weight: 900, color: K.PAPER });
      K.text(ui, tName, x + 74, yy, { size: 21, weight: 800, color: done || left ? K.GOLD_HI : '#d9b0a8', maxW: 150 });
      K.text(ui, done ? mmss(f.taskT - f.t0) : '—', x + w - 120, yy, { size: 21, weight: 800, color: K.PAPER, align: 'right' });
      K.text(ui, left ? mmss(f.t1 - f.t0) : f.t0 !== null ? mmss((r.sec || 0) - f.t0) : '—', x + w - 24, yy, { size: 21, weight: 800, color: left ? K.PAPER : K.DIM, align: 'right' });
      yy += 30;
    }
  } else if ((r.tasks || []).length) {
    K.text(ui, '끝낸 과업: ' + r.tasks.map((t) => taskName(t)).join(' · '), x + 22, yy, { size: 20, weight: 800, color: K.GOLD_HI, maxW: w - 44 });
    yy += 32;
  }
  yy += 6;
  K.text(ui, '들른 곳 ' + (same ? LOG.sites : '—') + '  ·  빛 조각 ' + (r.shards || 0), x + 22, yy, { size: 20, weight: 800, color: K.PAPER });
  yy += 18;
  // boons as chips
  const b = r.boons || {}, ids = Object.keys(b).filter((id) => b[id] > 0).sort();
  let cx = x + 22, cy = yy;
  if (!ids.length) { K.text(ui, '단련 없음', cx, cy + 26, { size: 19, weight: 700, color: K.MUTED }); cy += 40; }
  for (const id of ids) {
    const def = BD.boons.has(id) ? BD.boons.get(id) : null, name = (def ? def.name : id) + ' ' + b[id];
    const tw = K.measure(g, name, 18, 800), cw = tw + 46;
    if (cx + cw > x + w - 16) { cx = x + 22; cy += 40; }
    if (cy > y + h - 50) break;
    K.panel(g, cx, cy + 6, cw, 32, { slant: 5, shadow: 2, facetK: 0.5, edge: '#7a5a22' });
    IC.glyph(g, 'boon:' + id, cx + 18, cy + 22, 22);
    K.text(ui, name, cx + 34, cy + 28, { size: 18, weight: 800, color: K.PAPER });
    cx += cw + 8;
  }
  return cy + 46;
}

BD.ui.screens.register({
  id: 'result',
  draw(g, ui) {
    const r = ui.app.lastResult;
    if (!r) { BG.draw(g, ui, { variant: 'night' }); return; }
    const win = r.result === 'win';
    BG.draw(g, ui, { variant: win ? 'dawn' : 'night', dim: win ? 0.15 : 0.35 });
    // the hero stands on the right panel's top edge (or lies across it)
    if (win) BG.hero(g, 'hero_slash', 1132, 186, 160);
    else BG.hero(g, 'hero_hurt', 1140, 180, 120, { rot: 0.42 });
    K.letter(g, win ? '여명' : '쓰러졌다', 70, 108, { size: 88, align: 'left', fill: win ? '#fff1cf' : K.PAPER, fill2: win ? '#f2b860' : '#b9b0a0', stroke: 14, shadow: 6 });
    const where = K.floorName(r.floor);
    const cause = r.cause && r.causeText === r.cause ? damageName({ key: r.cause }) + '에' : r.causeText || '';
    const sub = win ? r.clock + ', 마왕이 쓰러졌다' : where + ' · ' + r.clock + ' · ' + cause;
    K.text(ui, sub, 76, 156, { size: 27, weight: 800, color: win ? '#fff1cf' : '#e9e1cf', stroke: 5, maxW: 700 });
    // cards, with the level each reached
    K.panel(g, 60, 180, 712, 274, { edge: '#8d877c', facetK: 0.12 });
    K.text(ui, '성인', 82, 210, { size: 20, weight: 800, color: K.DIM });
    K.text(ui, '기여', 748, 210, { size: 20, weight: 800, color: K.DIM, align: 'right' });
    (r.cards || []).forEach((c, i) => {
      const def = BD.cards.has(c.id) ? BD.cards.get(c.id) : null;
      const y = 224 + i * 74;
      K.poly(g, [[80, y], [140, y], [140, y + 60], [80, y + 60]]); g.fillStyle = '#121117'; g.fill(); K.ink(g, 3);
      if (c.awakened) { K.poly(g, [[82, y + 2], [138, y + 2], [138, y + 58], [82, y + 58]]); g.lineWidth = 3; g.strokeStyle = '#ffd24a'; g.stroke(); }
      IC.card(g, def || { id: c.id, name: c.name }, 110, y + 30, 46);
      K.text(ui, c.name, 158, y + 28, { size: 26, weight: 900, color: K.PAPER });
      const max = def && def.levels ? BD.cardRt.maxLevel(def) : 0;
      if (max > 1 && c.level) {
        const nw = K.measure(g, c.name, 26, 900);
        BD.ui.levelPips(g, 158 + nw + 18 + max * 17, y + 19, c.level, max, false);
        K.text(ui, c.level + '단계', 158 + nw + 30 + max * 17, y + 27, { size: 20, weight: 900, color: c.level >= max ? '#fff1cf' : K.GOLD_HI });
      }
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
    const trials = r.trials ? '  ·  시련 ' + r.trials + '회' : '';
    K.text(ui, '처치 ' + r.kills + trials + '  ·  회피 ' + (r.dodges || 0) + '  ·  피격 ' + (r.hurts || 0), 82, 538, { size: 23, weight: 800, color: K.PAPER });
    K.text(ui, '시드 ' + r.seed + '  ·  밤의 깊이 ' + (r.tier || 0), 82, 574, { size: 20, weight: 600, color: K.DIM });
    // 이번 밤, then new unlocks
    const news = r.unlocks || [];
    const nightH = news.length ? 412 - Math.min(3, news.length) * 44 - 50 : 412;
    drawNight(ui, r, 800, 184, 428, nightH);
    if (news.length) {
      const y0 = 184 + nightH + 10, h = 596 - y0;
      K.panel(g, 800, y0, 428, h, { edge: '#ffd24a', facetK: 0.25 });
      K.letter(g, '새로 열린 것', 1014, y0 + 36, { size: 26, fill: '#ffd24a', fill2: '#d6a636', shadow: 2, stroke: 6 });
      news.slice(0, 3).forEach((u, i) => {
        const y = y0 + 74 + i * 44;
        if (u.kind === 'card' && BD.cards.has(u.id)) IC.card(g, BD.cards.get(u.id), 836, y - 8, 34);
        else IC.crown(g, 836, y - 8, 28);
        K.text(ui, unlockLine(u), 866, y, { size: 21, weight: 800, color: K.PAPER, maxW: 346 });
      });
    }
    // buttons
    K.button(ui, { id: 'again', label: '다시 오른다', kind: 'primary', x: 60, y: 620, w: 300, h: 74, menu: true, size: 29, onTap: () => NAV.again(ui) });
    K.button(ui, { id: 'same', label: '같은 밤 다시', x: 384, y: 620, w: 270, h: 74, menu: true, size: 26, onTap: () => NAV.sameNight(ui) });
    K.button(ui, { id: 'title', label: '타이틀로', kind: 'quiet', x: 678, y: 620, w: 220, h: 74, menu: true, size: 25, onTap: () => NAV.title(ui) });
  },
  key: (ev, ui) => NAV.keyTick(ev, ui),
});
