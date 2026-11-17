// HUD (GDD §9.2 as GDD-V2 §5.7 changes it, logical 1280 × 720). Every box has an ink-black backing
// so it reads on all five floor colours and over a crowd. Layers: top (HP, radiance 0–9, kills and
// the kill streak; the floor's task / guardian / boss at the top centre; clock, pause, floors),
// messages (toasts, banners), slots (the sword's crossguard with three sockets, level pips under
// each), controls (dash, joystick). The light gauge is 63_growth.js, the minimap and edge markers
// 42_map.js. On a phone (picture below ×0.74) the words that are read in play are drawn larger.

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const CI = BD.ui.cards;
const IC = BD.ui.icons;
const M = BD.math;

const PHASE_NAMES = ['', '강림', '침식', '결계'];
const KIND_COLOR = { break: '#e05a4a', gain: '#ffd24a', hint: K.SKY, warn: K.AMBER, info: '#8d877c', unlock: '#ffd24a' };

// ---- top: portrait, HP, radiance, kills ----------------------------------------------------------
function drawHp(g, ui, w) {
  const h = w.hero, ph = K.phone(ui);
  IC.portrait(g, 16, 14, 66);
  const chip = S.hpChip;
  if (h.hp > chip.v || chip.run !== w) { chip.v = h.hp; chip.run = w; }
  else if (h.hp < chip.v && ui.time - chip.t > 0.4) chip.v = Math.max(h.hp, chip.v - ui.dt * 90);
  const low = h.hp <= 30;
  const col = low ? (Math.floor(ui.time * 4) % 2 ? '#ff4b4b' : '#c8283a') : K.HP;
  K.bar(g, 96, 20, 262, 28, h.hp / h.maxHp, { chip: chip.v / h.maxHp, color: col, slant: 9 });
  K.text(ui, h.hp + ' / ' + h.maxHp, 227, ph ? 44 : 41, { size: ph ? 26 : 20, align: 'center', stroke: 4, weight: 800 });
  // radiance pips (0..9, GDD-V2 §4.6)
  const n = C.RADIANCE_MAX, sp = n > 6 ? 19 : 22;
  for (let i = 0; i < n; i++) {
    const x = 104 + i * sp, y = 62, on = i < h.radiance;
    K.poly(g, [[x, y - 7], [x + 6, y], [x, y + 7], [x - 6, y]]);
    g.fillStyle = on ? '#ffd24a' : '#2a2830'; g.fill(); K.ink(g, 2.5);
  }
  // kills this run and the running streak (×41; gone 3 s after the last kill; display only, §5.7)
  const kills = (w.stats && w.stats.kills) || 0, ks = ph ? 27 : 21;
  const ky = ph ? 100 : 93;
  K.text(ui, '처치 ' + kills, 98, ky, { size: ks, weight: 900, color: K.PAPER, stroke: 5 });
  const st = S.streak;
  if (st && st.n >= 2 && w.t - st.t < 3) { // play time: a choice or the pause does not end it
    const kw = K.measure(g, '처치 ' + kills, ks, 900);
    const pop = st.popAt !== undefined && ui.time - st.popAt < 0.45 ? 1 + 0.55 * Math.sin(((ui.time - st.popAt) / 0.45) * Math.PI) : 1;
    const fade = w.t - st.t > 2.5 ? 1 - (w.t - st.t - 2.5) / 0.5 : 1;
    const big = st.n >= 100 ? '#ffe9a8' : st.n >= 25 ? K.GOLD_HI : K.PAPER;
    g.save(); g.globalAlpha = Math.max(0, fade); g.translate(98 + kw + 16, ky); g.scale(pop, pop);
    K.letter(g, '×' + st.n, 0, 0, { size: ph ? 34 : 27, align: 'left', fill: big, fill2: '#d6a636', stroke: 6, shadow: 2 });
    g.restore();
  }
}

// ---- top centre: the floor's task (GDD-V2 §5.7) / guardian / boss ---------------------------------
// What the top centre says, read from the world. Tasks this branch has never seen show their label
// (the def's, else name value/goal) and a bar; goals of 2–6 draw as segments (봉인 1/3).
function taskState(w) {
  const t = w.task;
  if (w.stairs && w.stairs.open) return { label: '계단이 열렸다', color: K.GOLD_HI, glyph: 'stairs' };
  if (w.trial && w.trial.state === 'active') {
    const n = w.enemies.filter((e) => !e.dead && e.trial).length + w.rifts.filter((r) => r.opts.trial).length + w.queue.filter((q) => q.opts.trial).length;
    return { label: '시련 — 남은 적 ' + n, color: '#c9a0ff' };
  }
  if (t && t.done) return { label: '수호자가 계단을 지킨다', color: K.GOLD_HI, glyph: 'crown' };
  if (t) {
    const goal = Number(t.goal) || 0, value = Math.max(0, Number(t.value) || 0);
    return { label: BD.ui.taskLabel(w), color: K.PAPER, glyph: 'task:' + t.kind, k: goal > 0 ? Math.min(1, value / goal) : 0, segs: goal >= 2 && goal <= 6 && Number.isInteger(goal) ? goal : 0, value, goal };
  }
  if (w.wave && !(w.run && w.run.v2)) { const n = Math.min(3, w.wave.n || 1); return { label: '무리 ' + n + '/3', color: K.PAPER, segs: 3, value: n, k: n / 3 }; }
  return null;
}
BD.ui.taskState = taskState;
function drawProgress(g, ui, w) {
  const ph = K.phone(ui);
  const boss = w.enemies.find((e) => !e.dead && e.boss);
  const guard = boss ? null : w.enemies.find((e) => !e.dead && e.guardian);
  if (boss) {
    // GDD §9.2: a 560-wide bar with the two phase ticks. The bar carries its own ink frame;
    // only the name sits on a panel, so the bar never runs into the HP bar on the left.
    const bw = 560, bx = 640 - bw / 2;
    const phase = (boss.mem && boss.mem.phase) || 1;
    const ticks = boss.def.phaseAt || [0.66, 0.33]; // HP fractions where the phases change (GDD §6.4)
    const label = boss.def.name + '  ' + phase + '단계 ' + (PHASE_NAMES[phase] || '');
    const fs = ph ? 27 : 21;
    const lw = K.measure(g, label, fs, 800) + 56;
    K.panel(g, 640 - lw / 2, 8, lw, ph ? 40 : 34, { slant: 8, edge: '#7a2a8a', shadow: 3, facetK: 0.5 });
    K.text(ui, label, 640, ph ? 38 : 32, { size: fs, align: 'center', color: '#efe2ff', weight: 800 });
    K.bar(g, bx, ph ? 52 : 48, bw, ph ? 24 : 20, Math.max(0, boss.hp) / boss.maxHp, { color: '#9b2fd0', ticks, slant: 6 });
    return;
  }
  if (guard) {
    const bw = 380, bx = 450;
    const name = (guard.def.guardian && guard.def.guardian.name) || guard.def.name;
    K.panel(g, bx - 16, 8, bw + 32, ph ? 74 : 64, { slant: 8, edge: K.GOLD });
    IC.crown(g, bx + 8, ph ? 30 : 28, ph ? 26 : 22);
    K.text(ui, '수호자 — ' + name, 652, ph ? 39 : 35, { size: ph ? 27 : 21, align: 'center', color: K.GOLD_HI, weight: 800, maxW: 330 });
    K.bar(g, bx, ph ? 50 : 44, bw, ph ? 22 : 18, Math.max(0, guard.hp) / guard.maxHp, { color: '#e2b23a', slant: 6 });
    return;
  }
  if (w.floorN >= 6) return;
  const T = taskState(w);
  if (!T) return;
  const fs = ph ? 29 : 22, hasBar = T.k !== undefined;
  const pw = ph ? 390 : 340, px = 640 - pw / 2, phh = hasBar ? (ph ? 74 : 60) : (ph ? 52 : 44);
  const pop = S.taskPop !== undefined && ui.time - S.taskPop < 0.3 ? 1 + 0.12 * Math.sin(((ui.time - S.taskPop) / 0.3) * Math.PI) : 1;
  K.panel(g, px, 8, pw, phh, { slant: 8, edge: T.color === K.PAPER ? '#8d877c' : T.color });
  if (T.glyph) IC.glyph(g, T.glyph, px + (ph ? 32 : 28), ph ? 32 : 29, ph ? 32 : 26);
  g.save(); g.translate(640 + (T.glyph ? 12 : 0), ph ? 41 : 36); g.scale(pop, pop);
  K.text(ui, T.label, 0, 0, { size: fs, align: 'center', color: T.color, weight: 900, maxW: pw - 76 });
  g.restore();
  if (!hasBar) return;
  const bx = px + 24, bw = pw - 48, by = ph ? 55 : 46, bh = ph ? 12 : 9;
  if (T.segs) {
    const sw = (bw - (T.segs - 1) * 6) / T.segs;
    for (let i = 0; i < T.segs; i++) {
      K.poly(g, K.slantPts(bx + i * (sw + 6), by, sw, bh, 3));
      g.fillStyle = i < T.value ? K.GOLD_HI : '#2a2830'; g.fill(); K.ink(g, 2);
    }
  } else {
    g.fillStyle = K.INK; g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    g.fillStyle = '#2a2830'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#e8dcc0'; g.fillRect(bx, by, bw * T.k, bh);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(bx, by + bh * 0.6, bw * T.k, bh * 0.4);
  }
}

// ---- top right: clock, pause, floors ------------------------------------------------------------------
// GDD-V2 §9.1: the clock box warms (amber — the hero's orange is his blade's alone) once the run is
// more than 30 s behind the summed time budgets of the floors so far.
function behind(w) {
  const D = C.DIRECTOR && C.DIRECTOR.floors;
  if (!D || !w.run || !w.run.v2) return false;
  let sum = 0;
  for (let n = 1; n <= Math.min(6, w.floorN); n++) sum += (D[n] && D[n].budget) || 0;
  return w.t > sum + 30;
}
BD.ui.behind = behind;
function drawClock(g, ui, w) {
  const cm = BD.flow.clockMin(w), late = w.t >= w.mods.runSec, slow = !late && behind(w);
  const k = K.clamp(cm / 720, 0, 1);
  const dawnK = K.clamp((cm - 540) / 180, 0, 1);
  const edge = late ? '#ff4b4b' : cm >= 660 || slow ? K.AMBER : dawnK > 0 ? '#c99a6a' : '#8d877c';
  K.panel(g, 1046, 14, 152, 44, { slant: 9, edge, edgeW: slow ? 3 : 2, facet: slow ? '#3a2a14' : dawnK > 0 ? 'rgb(' + Math.round(27 + 40 * dawnK) + ',' + Math.round(26 + 18 * dawnK) + ',' + Math.round(33 + 4 * dawnK) + ')' : K.INK2 });
  // night elapsed: a strip along the bottom of the box, warming toward 06:00
  const sx = 1056, sw = 132;
  g.fillStyle = '#2a2830'; g.fillRect(sx, 50, sw, 4);
  g.fillStyle = late ? '#ff4b4b' : dawnK > 0 || slow ? K.AMBER : '#6f7aa8'; g.fillRect(sx, 50, sw * k, 4);
  let col = K.PAPER;
  if (late) col = Math.floor(ui.time * 3) % 2 ? '#ff4b4b' : K.PAPER;
  else if (cm >= 660 || slow) col = K.AMBER;
  K.text(ui, BD.flow.clockStr(w), 1122, 46, { size: 31, align: 'center', color: col, weight: 900 });
  // pause button (visual 44; hit area 72 × 66, and at least 44 CSS px on a phone — docs/CONTROLS-REVIEW.md
  // §3.7), kept inside the picture's top-right corner
  K.panel(g, 1212, 14, 44, 44, { shadow: 3, edge: '#8d877c' });
  IC.pause(g, 1234, 36, 26);
  const pmin = 44 / ui.view.scale, pw = Math.max(72, pmin), ph = Math.max(66, pmin);
  ui.button({ id: 'hud_pause', label: 'Ⅱ', x: Math.min(1202, C.VIEW_W - pw), y: 4, w: pw, h: ph, style: 'none', onTap: () => ui.app.pause() });
}
// One row under the clock: the six floors (past ones in their colour, this one large), 3F, and the
// next floor's type as its coloured disc after an arrow (the minimap sits under it, 42_map.js).
function drawFloors(g, ui, w) {
  const ph = K.phone(ui);
  K.panel(g, 1046, 64, 210, 36, { slant: 6, shadow: 3, facetK: 0.5 });
  for (let n = 1; n <= 6; n++) {
    const f = w.run.floors[n], x = 1062 + (n - 1) * 15, y = 82;
    const cur = n === w.floorN, past = n < w.floorN;
    const col = n === 6 ? C.FLOOR_COLORS.rooftop : C.FLOOR_COLORS[f.domType];
    K.circle(g, x, y, cur ? 7 : 4.5);
    g.fillStyle = past || cur ? col : '#2a2830'; g.fill(); K.ink(g, 2.2);
    if (cur) { K.circle(g, x, y, 10); g.lineWidth = 2; g.strokeStyle = K.GOLD_HI; g.stroke(); }
  }
  K.text(ui, K.floorName(w.floorN), 1176, 92, { size: ph ? 28 : 25, align: 'center', weight: 900, color: K.PAPER });
  const next = w.floorN >= 6 ? null : w.floorN === 5 ? 'rooftop' : w.floor.nextDomType;
  if (next) {
    K.text(ui, '→', 1210, 91, { size: 20, align: 'center', weight: 900, color: K.DIM });
    IC.type(g, next, 1236, 82, 24, { disc: C.FLOOR_COLORS[next] || '#7d8597' });
  } else IC.crown(g, 1230, 82, 22);
}

BD.ui.hud.register({
  id: 'top',
  order: 10,
  draw(g, ui) {
    const w = ui.world;
    drawHp(g, ui, w);
    drawProgress(g, ui, w);
    drawClock(g, ui, w);
    drawFloors(g, ui, w);
  },
});
// chip timing: the white trailing part of the HP bar waits 0.4 s after damage
BD.ui.effects.register({
  id: 'hud_chip',
  on: { hurt(ev, ui) { S.hpChip.t = ui.time; }, drain(ev, ui) { S.hpChip.t = ui.time; } },
});

// ---- messages: toasts (left middle) and banners (top centre) ------------------------------------------
function drawToasts(g, ui) {
  S.toasts.forEach((t, i) => {
    const age = ui.time - t.t, life = BD.ui.msg.TOAST_LIFE;
    const a = age > life - 0.4 ? (life - age) / 0.4 : 1;
    const slide = age < 0.15 ? (1 - age / 0.15) * -30 : 0;
    // on a phone the lines are larger (K.big) and start a little higher, clear of the tray
    const ph = K.phone(ui), size = K.big(ui, 22, 1.3), lh = ph ? 54 : 44, bh = ph ? 46 : 36;
    const y = (ph ? 372 : 400) + i * lh;
    const tag = t.kind === 'hint' ? '안내' : null, tagW = ph ? 64 : 50;
    const maxW = ph ? 700 : 560;
    const tw = Math.min(maxW - 34, K.measure(g, t.text, size, 700) + (tag ? tagW + 6 : 0));
    const x = 16 + slide;
    K.panel(g, x, y, tw + 34, bh, { slant: 6, shadow: 3, alpha: Math.max(0, a) });
    g.globalAlpha = Math.max(0, a);
    g.fillStyle = KIND_COLOR[t.kind] || KIND_COLOR.info; g.fillRect(x + 6, y + 6, 5, bh - 12);
    let tx = x + 20;
    if (tag) { K.text(ui, tag, tx, y + bh - 10, { size: ph ? 23 : 18, color: K.SKY, weight: 900 }); tx += tagW; }
    K.text(ui, t.text, tx, y + bh - 10, { size, color: K.PAPER, weight: 700, maxW: maxW - (tx - x) - 10 });
    g.globalAlpha = 1;
  });
}
function drawBanner(g, ui, w) {
  const b = S.banner;
  if (!b) return;
  const age = ui.time - b.t, k = age / b.life;
  if (k >= 1) return;
  const inK = Math.min(1, age / 0.15), a = k > 0.78 ? (1 - k) / 0.22 : 1;
  const col = b.kind === 'awaken' ? '#ffd24a' : b.kind === 'guardian' ? '#ffd24a' : b.kind === 'stairs' ? K.GOLD_HI : K.PAPER;
  const stripe = b.kind === 'floor' ? (w.floorN >= 6 ? C.FLOOR_COLORS.rooftop : C.FLOOR_COLORS[w.floor.domType]) : b.kind === 'guardian' ? '#c0392b' : b.kind === 'awaken' ? '#ffd24a' : K.GOLD;
  g.save(); g.globalAlpha = a;
  const wdt = 560 * inK + 40;
  K.panel(g, 640 - wdt / 2, 96, wdt, 62, { slant: 22, shadow: 5, facet: '#1e1c24' });
  g.fillStyle = stripe; K.poly(g, K.slantPts(640 - wdt / 2 + 18, 148, wdt - 36, 5, 2)); g.fill();
  g.restore();
  if (inK >= 1) K.letter(g, b.text, 640, 142, { size: 40, fill: col, fill2: b.kind === 'floor' ? '#d8cdb6' : '#d6a636', alpha: a, shadow: 3 });
}
BD.ui.hud.register({
  id: 'messages',
  order: 40,
  draw(g, ui) { drawToasts(g, ui); drawBanner(g, ui, ui.world); },
});

// ---- the crossguard: three sockets ---------------------------------------------------------------------
// The guard sits under the light gauge (63_growth.js, y 584–604), so its wings and peak start at 608.
function drawGuard(g) {
  const pts = [[446, 608], [494, 619], [606, 613], [640, 605], [674, 613], [786, 619], [834, 608], [814, 650], [802, 720], [478, 720], [466, 650]];
  K.poly(g, pts.map((p) => [p[0] + 4, p[1] + 4])); g.fillStyle = K.INK; g.fill();
  K.poly(g, pts); g.fillStyle = '#c9a44a'; g.fill();
  // lower facet in a darker gold (two tones)
  g.save(); K.poly(g, pts); g.clip();
  g.fillStyle = '#8f6f2a'; g.fillRect(440, 668, 400, 60);
  K.poly(g, [[446, 608], [494, 619], [490, 628], [452, 618]]); g.fillStyle = '#f0d27a'; g.fill();
  K.poly(g, [[834, 608], [786, 619], [790, 628], [828, 618]]); g.fill();
  g.restore();
  K.poly(g, pts); K.ink(g, 4);
}
// GDD-V2 §4.4 / §5.7: five level pips under each slot; the newest pops when a pick lands
function drawLevelPips(g, ui, c, r, s) {
  if (!c) return;
  const max = Math.max(1, BD.cardRt.maxLevel(c.def)), lv = Math.min(max, c.level || 1), ph = K.phone(ui);
  if (max < 2) return;
  const pr = ph ? 5.5 : 4.2, sp = Math.min(ph ? 15 : 14, (r.w - 8) / max), y = r.y + r.h + (ph ? 10 : 9);
  // an ink strip behind the pips, so pale gold reads on the gold guard
  const bw = (max - 1) * sp + 2 * pr + 8;
  K.poly(g, K.slantPts(r.x + r.w / 2 - bw / 2, y - pr - 3, bw, 2 * pr + 6, 2)); g.fillStyle = K.INK; g.fill();
  for (let k = 0; k < max; k++) {
    const x = r.x + r.w / 2 + (k - (max - 1) / 2) * sp;
    let rr = pr;
    const isNew = k === lv - 1 && s.levelAt !== undefined && ui.time - s.levelAt < 0.5 && ui.time >= s.levelAt;
    if (isNew) rr = pr * (1 + 0.8 * Math.sin(((ui.time - s.levelAt) / 0.5) * Math.PI));
    else if (k === lv - 1 && s.levelAt !== undefined && ui.time < s.levelAt) { K.circle(g, x, y, pr); g.fillStyle = '#2a2830'; g.fill(); K.ink(g, 2); continue; }
    K.circle(g, x, y, rr);
    g.fillStyle = k < lv ? (lv >= max ? '#fff1cf' : K.GOLD_HI) : '#2a2830'; g.fill(); K.ink(g, 2);
  }
}

function ringPath(g, x, y, s, k) {
  // perimeter of the socket from the top-left corner, clockwise, fraction k
  const per = 4 * s; let left = per * K.clamp(k, 0, 1);
  g.beginPath(); g.moveTo(x, y);
  const legs = [[x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  let px = x, py = y;
  for (const [qx, qy] of legs) {
    const L = Math.hypot(qx - px, qy - py);
    if (left <= 0) break;
    const t = Math.min(1, left / L);
    g.lineTo(px + (qx - px) * t, py + (qy - py) * t);
    left -= L; px = qx; py = qy;
  }
}

function drawSlot(g, ui, w, i) {
  const r = BD.ui.slotRect(i), c = w.cards[i], s = S.slots[i] || {};
  const now = ui.time;
  let ox = 0;
  if (s.shakeAt !== undefined && now - s.shakeAt < 0.4) ox = Math.sin((now - s.shakeAt) * 60) * 6 * (1 - (now - s.shakeAt) / 0.4);
  const x = r.x + ox, y = r.y, sz = r.w;
  // socket
  K.poly(g, [[x - 3, y - 3], [x + sz + 3, y - 3], [x + sz + 3, y + sz + 3], [x - 3, y + sz + 3]]); g.fillStyle = K.INK; g.fill();
  K.poly(g, [[x, y], [x + sz, y], [x + sz, y + sz], [x, y + sz]]); g.fillStyle = '#121117'; g.fill();
  g.fillStyle = '#1c1b22'; g.fillRect(x, y, sz, sz * 0.4);
  if (!c) {
    // an empty socket: the engraved seal outline
    const cx = x + sz / 2, cy = y + sz / 2;
    K.poly(g, [[cx, cy - 18], [cx + 18, cy], [cx, cy + 18], [cx - 18, cy]]); g.lineWidth = 3; g.strokeStyle = '#3a3742'; g.stroke();
    K.poly(g, [[x, y], [x + sz, y], [x + sz, y + sz], [x, y + sz]]); K.ink(g, 3);
    return;
  }
  const def = c.def, hd = CI.hud(w, c);
  const fam = K.famColor(def.family);
  // glow: a target card on a floor of its type (red), a readied trigger such as 발도 (white,
  // pulsing), an awakened quest (gold)
  if (hd.glow) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 6);
    g.fillStyle = def.family === 'target' ? 'rgba(224,57,47,0.24)' : def.family === 'quest' ? 'rgba(255,210,74,0.16)' : 'rgba(255,255,255,' + (0.12 + 0.12 * pulse) + ')';
    g.fillRect(x, y, sz, sz);
  }
  // icon with stamp-in
  let sc = 1;
  if (s.setAt !== undefined) { const k = (now - s.setAt) / 0.3; if (k < 0) sc = 0; else if (k < 1) sc = 1 + (1 - K.ease(k)) * 0.6; }
  if (sc > 0) IC.card(g, def, x + sz / 2, y + sz / 2 - 5, 54 * sc, { alpha: hd.text === '×0' && def.family === 'combo' ? 0.75 : 1 });
  // family border / gold when awakened / violet flames at max
  const bw = hd.awakened ? 5 : 3;
  K.poly(g, [[x + 2, y + 2], [x + sz - 2, y + 2], [x + sz - 2, y + sz - 2], [x + 2, y + sz - 2]]);
  g.lineWidth = bw; g.strokeStyle = hd.awakened ? '#ffd24a' : fam; g.stroke();
  if (hd.maxed) {
    for (let k = 0; k < 14; k++) {
      const side = k % 4, tt = (k / 14 + now * 0.7) % 1;
      const fl = 7 + 5 * Math.sin(now * 18 + k * 1.7);
      let px, py, nx, ny;
      if (side === 0) { px = x + sz * tt; py = y; nx = 0; ny = -1; } else if (side === 1) { px = x + sz; py = y + sz * tt; nx = 1; ny = 0; } else if (side === 2) { px = x + sz * (1 - tt); py = y + sz; nx = 0; ny = 1; } else { px = x; py = y + sz * (1 - tt); nx = -1; ny = 0; }
      K.poly(g, [[px - ny * 4, py + nx * 4], [px + nx * fl, py + ny * fl], [px + ny * 4, py - nx * 4]]);
      g.fillStyle = k % 2 ? '#c99aff' : '#8a4fd0'; g.fill();
    }
    K.poly(g, [[x + 2, y + 2], [x + sz - 2, y + 2], [x + sz - 2, y + sz - 2], [x + 2, y + sz - 2]]); g.lineWidth = 3; g.strokeStyle = '#c99aff'; g.stroke();
  }
  // cooldown shade (반격 "대기 가림막", GDD §9.3): ink drawn down over the icon
  if (typeof hd.cover === 'number' && hd.cover > 0) {
    g.save(); g.globalAlpha = 0.62; g.fillStyle = K.INK; g.fillRect(x, y, sz, sz * K.clamp(hd.cover, 0, 1)); g.restore();
    g.fillStyle = '#5c5a58'; g.fillRect(x, y + sz * K.clamp(hd.cover, 0, 1) - 1, sz, 2);
  }
  // a readied trigger: white inner edge
  if (hd.glow && def.family === 'trigger') { K.poly(g, [[x + 6, y + 6], [x + sz - 6, y + 6], [x + sz - 6, y + sz - 6], [x + 6, y + sz - 6]]); g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke(); }
  // ring (timer / charge / cooldown): perimeter progress; red blinking near a combo timeout
  if (typeof hd.ring === 'number') {
    const warnBlink = hd.warn && Math.floor(now * 8) % 2 === 0;
    ringPath(g, x - 6, y - 6, sz + 12, hd.ring);
    g.lineCap = 'round'; g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke();
    ringPath(g, x - 6, y - 6, sz + 12, hd.ring);
    g.lineWidth = 3.5; g.strokeStyle = hd.warn ? (warnBlink ? '#ff3b3b' : '#8a2a2a') : fam; g.stroke(); g.lineCap = 'butt';
  }
  // pips (leech 0..3, embers 0..3)
  if (typeof hd.pips === 'number') {
    const n = Math.max(3, hd.pips);
    for (let k = 0; k < n; k++) { K.circle(g, x + 12 + k * 13, y + 12, 4.5); g.fillStyle = k < hd.pips ? (def.family === 'quest' ? '#ff7a3a' : K.GREEN) : '#2a2830'; g.fill(); K.ink(g, 2); }
  }
  // target card: type icon in the corner, lit on a floor of its type
  if (def.family === 'target' && def.targetType) IC.type(g, def.targetType, x + sz - 14, y + 14, hd.glow ? 22 : 16, { disc: hd.glow ? '#e0392f' : '#2a2830' });
  // number (7/12, ×3) with a pop
  if (hd.text) {
    let ps = 1;
    if (s.popAt !== undefined) { const k = (now - s.popAt) / 0.25; if (k >= 0 && k < 1) ps = 1 + 0.3 * Math.sin(k * Math.PI); }
    const grey = def.family === 'combo' && hd.stack === 0;
    g.save(); g.translate(x + sz - 6, y + sz - 6); g.scale(ps, ps);
    K.text(ui, hd.text, 0, 0, { size: 22, align: 'right', color: grey ? '#8a8680' : hd.awakened ? '#ffd24a' : K.PAPER, stroke: 5, weight: 900 });
    g.restore();
  }
  // stage badge (top edge)
  if (hd.badge) {
    const bw2 = K.measure(g, hd.badge, 18, 800) + 16;
    const bk = s.badgeAt !== undefined && now - s.badgeAt < 0.3 ? 1.2 : 1;
    g.save(); g.translate(x + sz / 2, y - 8); g.scale(bk, bk);
    K.poly(g, K.slantPts(-bw2 / 2, -14, bw2, 26, 4)); g.fillStyle = '#3a1f5a'; g.fill(); K.ink(g, 2.5);
    K.text(ui, hd.badge, 0, 5, { size: 18, align: 'center', color: '#efe2ff', weight: 800 });
    g.restore();
  }
  // flash (riposte, leech, target hit, drawcut ready)
  if (s.flashAt !== undefined && now - s.flashAt < 0.25) { g.globalAlpha = 0.6 * (1 - (now - s.flashAt) / 0.25); g.fillStyle = '#ffffff'; g.fillRect(x, y, sz, sz); g.globalAlpha = 1; }
  // awakening: gold rays
  if (s.burstAt !== undefined && now - s.burstAt < 0.9) {
    const k = (now - s.burstAt) / 0.9, cx = x + sz / 2, cy = y + sz / 2;
    g.globalAlpha = 1 - k;
    for (let n = 0; n < 12; n++) {
      const a = (n / 12) * Math.PI * 2, r0 = 40 + k * 20, r1 = 60 + k * 70;
      K.poly(g, [[cx + Math.cos(a - 0.08) * r0, cy + Math.sin(a - 0.08) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a + 0.08) * r0, cy + Math.sin(a + 0.08) * r0]]);
      g.fillStyle = '#ffd24a'; g.fill(); K.ink(g, 1.5);
    }
    g.globalAlpha = 1;
  }
  // stamp-in ink ring
  if (s.setAt !== undefined && now - s.setAt >= 0 && now - s.setAt < 0.3) {
    const k = (now - s.setAt) / 0.3;
    g.globalAlpha = 1 - k; K.circle(g, x + sz / 2, y + sz / 2, 30 + k * 30); K.ink(g, 4); g.globalAlpha = 1;
  }
  K.poly(g, [[x, y], [x + sz, y], [x + sz, y + sz], [x, y + sz]]); K.ink(g, 3);
}

BD.ui.hud.register({
  id: 'slots',
  order: 30,
  draw(g, ui) {
    const w = ui.world;
    drawGuard(g);
    for (let i = 0; i < 3; i++) {
      drawSlot(g, ui, w, i);
      const r = BD.ui.slotRect(i), c = w.cards[i];
      drawLevelPips(g, ui, c, r, S.slots[i] || {});
      ui.button({ id: 'slot' + i, label: c ? c.def.name : '빈 홈', x: r.x, y: r.y - 8, w: r.w, h: r.h + 8, style: 'none', onTap: () => ui.app.pause() });
    }
  },
});

// ---- controls: dash button, joystick ----------------------------------------------------------------------
// Sizes follow docs/CONTROLS-REVIEW.md §3.2 / §3.7: on a phone the logical canvas is drawn at
// ×0.52, so the dash button is at least 68 CSS px across (touch square 72), and the joystick ring
// is drawn at its full-speed radius of 48 CSS px. Large screens (scale ≥ 0.74) are unchanged.
BD.ui.dashSize = (ui) => { const s = ui.view.scale; return { r: Math.max(46, 34 / s), hit: Math.max(104, 72 / s) }; };
// centre: (1194, 624) (or 86 on the left), moved in so the drawing keeps r + 16 from the edges
BD.ui.dashCenter = (ui) => {
  const r = BD.ui.dashSize(ui).r, y = Math.min(624, C.VIEW_H - r - 16);
  return ui.app.save.settings.dashSide === 'left' ? [Math.max(86, r + 16), y] : [Math.min(1194, C.VIEW_W - r - 16), y];
};
BD.ui.hud.register({
  id: 'controls',
  order: 50,
  draw(g, ui) {
    const w = ui.world, h = w.hero, sc = ui.view.scale;
    const { r, hit } = BD.ui.dashSize(ui);
    let [cx, cy] = BD.ui.dashCenter(ui);
    // a dash press the buffer cannot save (cooldown > 0.2 s): shake 3 CSS px left/right for 0.15 s
    const ra = BD.client.input.st ? ui.time - BD.client.input.st.refusedAt : 9;
    const hx = cx;
    if (ra >= 0 && ra < 0.15) cx += Math.sin(ra * Math.PI * 2 / 0.075) * 3 / sc;
    const cd = K.clamp(h.dashCd / C.DASH.cd, 0, 1), ready = cd <= 0;
    K.circle(g, cx + 3, cy + 4, r); g.fillStyle = K.INK; g.fill();
    K.circle(g, cx, cy, r); g.fillStyle = ready ? '#1e1b16' : '#0f0f13'; g.fill();
    g.save(); K.circle(g, cx, cy, r); g.clip(); g.fillStyle = ready ? '#2c271d' : '#17161c'; g.fillRect(cx - r, cy - r, 2 * r, r * 0.85); g.restore();
    K.circle(g, cx, cy, r); K.ink(g, 4);
    const k = r / 46; // the face scales with the button
    if (!ready) {
      g.beginPath(); g.arc(cx, cy, r - 6 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd));
      g.lineWidth = 6 * k; g.strokeStyle = '#8d877c'; g.stroke();
    } else {
      K.circle(g, cx, cy, r - 6 * k); g.lineWidth = 4 * k; g.strokeStyle = K.GOLD_HI; g.stroke();
    }
    IC.dash(g, cx, cy - 9 * k, 34 * k, ready ? K.PAPER : '#6d6a64');
    K.text(ui, '돌진', cx, cy + 27 * k, { size: 18 * k, align: 'center', color: ready ? K.PAPER : '#6d6a64', weight: 800 });
    if (S.lastInput === 'key') K.text(ui, 'Space', cx, cy - r - 8, { size: 15, align: 'center', color: K.DIM, stroke: 3, weight: 700 });
    ui.button({ id: 'hud_dash', label: '돌진', x: hx - hit / 2, y: cy - hit / 2, w: hit, h: hit, style: 'none', onPress: () => { BD.client.input.st.dashReq = true; } });
    // floating joystick (touch / mouse drag): the ring is the full-speed line (48 CSS px), the
    // knob (20 CSS px) moves inside it
    const st = BD.client.input.stick && BD.client.input.stick();
    if (st && !ui.app.overlay()) {
      const SZ = BD.client.input.SIZES, R = SZ.FULL / sc, kr = 20 / sc;
      g.globalAlpha = 0.55;
      K.circle(g, st.ox, st.oy, R); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = K.PAPER; g.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), q = d > R ? R / d : 1;
      K.circle(g, st.ox + dx * q, st.oy + dy * q, kr); g.fillStyle = K.PAPER; g.fill(); K.ink(g, 3);
      g.globalAlpha = 1;
    }
  },
});

// Remember whether the player is on keys or touch (hints and the Space label use it).
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { S.lastInput = 'key'; });
  window.addEventListener('pointerdown', (ev) => { S.lastInput = ev.pointerType === 'mouse' ? 'mouse' : 'touch'; });
}
