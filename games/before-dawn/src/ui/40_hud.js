// HUD (GDD §9.2, logical 1280 × 720). Every box has an ink-black backing so it reads on all
// five floor colours. Layers: top (HP, progress, clock, floor), messages (toasts, banners),
// slots (the sword's crossguard with three sockets), controls (dash, pause, joystick).

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const CI = BD.ui.cards;
const IC = BD.ui.icons;
const M = BD.math;

const PHASE_NAMES = ['', '강림', '침식', '결계'];
const KIND_COLOR = { break: '#e05a4a', gain: '#ffd24a', hint: K.SKY, warn: K.AMBER, info: '#8d877c', unlock: '#ffd24a' };

// ---- top: portrait, HP, radiance --------------------------------------------------------------
function drawHp(g, ui, w) {
  const h = w.hero;
  IC.portrait(g, 16, 14, 66);
  const chip = S.hpChip;
  if (h.hp > chip.v || chip.run !== w) { chip.v = h.hp; chip.run = w; }
  else if (h.hp < chip.v && ui.time - chip.t > 0.4) chip.v = Math.max(h.hp, chip.v - ui.dt * 90);
  const low = h.hp <= 30;
  const col = low ? (Math.floor(ui.time * 4) % 2 ? '#ff4b4b' : '#c8283a') : K.HP;
  K.bar(g, 96, 20, 262, 28, h.hp / h.maxHp, { chip: chip.v / h.maxHp, color: col, slant: 9 });
  K.text(ui, h.hp + ' / ' + h.maxHp, 227, 41, { size: 20, align: 'center', stroke: 4, weight: 800 });
  // radiance pips (0..5)
  for (let i = 0; i < C.RADIANCE_MAX; i++) {
    const x = 104 + i * 22, y = 63, on = i < h.radiance;
    K.poly(g, [[x, y - 8], [x + 7, y], [x, y + 8], [x - 7, y]]);
    g.fillStyle = on ? '#ffd24a' : '#2a2830'; g.fill(); K.ink(g, 2.5);
  }
  if (h.radiance > 0) K.text(ui, '광휘 ' + h.radiance, 104 + 5 * 22 + 4, 69, { size: 17, color: '#ffd24a', stroke: 3, weight: 800 });
}

// ---- top centre: waves / trial / guardian / boss ---------------------------------------------------
function drawProgress(g, ui, w) {
  const boss = w.enemies.find((e) => !e.dead && e.boss);
  const guard = boss ? null : w.enemies.find((e) => !e.dead && e.guardian);
  if (boss) {
    const bw = 560, bx = 640 - bw / 2;
    const phase = (boss.mem && boss.mem.phase) || 1;
    const ticks = boss.def.phaseAt || [0.66, 0.33];
    K.panel(g, bx - 18, 12, bw + 36, 66, { slant: 8, edge: '#7a2a8a' });
    K.text(ui, boss.def.name + '  ' + phase + '단계 ' + (PHASE_NAMES[phase] || ''), 640, 38, { size: 21, align: 'center', color: '#efe2ff', weight: 800 });
    K.bar(g, bx, 46, bw, 20, Math.max(0, boss.hp) / boss.maxHp, { color: '#9b2fd0', ticks, slant: 6 });
    return;
  }
  if (guard) {
    const bw = 360, bx = 460;
    const name = (guard.def.guardian && guard.def.guardian.name) || guard.def.name;
    K.panel(g, bx - 16, 12, bw + 32, 62, { slant: 8, edge: K.GOLD });
    IC.crown(g, bx + 8, 34, 22);
    K.text(ui, '수호자 — ' + name, 652, 37, { size: 21, align: 'center', color: K.GOLD_HI, weight: 800, maxW: 320 });
    K.bar(g, bx, 46, bw, 18, Math.max(0, guard.hp) / guard.maxHp, { color: '#e2b23a', slant: 6 });
    return;
  }
  if (w.floorN >= 6) return;
  let label, segs = 0, segOn = 0, color = K.PAPER;
  if (w.trial && w.trial.state === 'active') {
    const n = w.enemies.filter((e) => !e.dead && e.trial).length + w.rifts.filter((r) => r.opts.trial).length + w.queue.filter((q) => q.opts.trial).length;
    label = '시련 — 남은 적 ' + n; color = '#c9a0ff';
  } else if (w.stairs && w.stairs.open) {
    label = w.trial && w.trial.state === 'available' ? '계단이 열렸다 · 시련 가능' : '계단이 열렸다'; color = K.GOLD_HI;
  } else {
    const n = Math.min(3, (w.wave && w.wave.n) || 1);
    label = '무리 ' + n + '/3'; segs = 3; segOn = n;
  }
  K.panel(g, 470, 12, 340, segs ? 58 : 44, { slant: 8, edge: color === K.PAPER ? '#8d877c' : color });
  K.text(ui, label, 640, 40, { size: 22, align: 'center', color, weight: 800 });
  for (let i = 0; i < segs; i++) {
    const x = 640 - 75 + i * 52;
    K.poly(g, K.slantPts(x, 52, 44, 9, 3));
    g.fillStyle = i < segOn ? (i === segOn - 1 ? '#e05a4a' : '#8a3a34') : '#2a2830'; g.fill(); K.ink(g, 2);
  }
}

// ---- top right: clock, pause, floors ------------------------------------------------------------------
function drawClock(g, ui, w) {
  const cm = BD.flow.clockMin(w), late = w.t >= w.mods.runSec;
  const k = K.clamp(cm / 720, 0, 1);
  const dawnK = K.clamp((cm - 540) / 180, 0, 1);
  const edge = late ? '#ff4b4b' : cm >= 660 ? K.AMBER : dawnK > 0 ? '#c99a6a' : '#8d877c';
  K.panel(g, 1046, 14, 152, 44, { slant: 9, edge, facet: dawnK > 0 ? 'rgb(' + Math.round(27 + 40 * dawnK) + ',' + Math.round(26 + 18 * dawnK) + ',' + Math.round(33 + 4 * dawnK) + ')' : K.INK2 });
  // night elapsed: a strip along the bottom of the box, warming toward 06:00
  const sx = 1056, sw = 132;
  g.fillStyle = '#2a2830'; g.fillRect(sx, 50, sw, 4);
  g.fillStyle = late ? '#ff4b4b' : dawnK > 0 ? K.AMBER : '#6f7aa8'; g.fillRect(sx, 50, sw * k, 4);
  let col = K.PAPER;
  if (late) col = Math.floor(ui.time * 3) % 2 ? '#ff4b4b' : K.PAPER;
  else if (cm >= 660) col = K.AMBER;
  K.text(ui, BD.flow.clockStr(w), 1122, 46, { size: 31, align: 'center', color: col, weight: 900 });
  // pause button (visual 44, thumb hit area 64)
  K.panel(g, 1212, 14, 44, 44, { shadow: 3, edge: '#8d877c' });
  IC.pause(g, 1234, 36, 26);
  ui.button({ id: 'hud_pause', label: 'Ⅱ', x: 1202, y: 4, w: 72, h: 66, style: 'none', onTap: () => ui.app.pause() });
}
function drawFloors(g, ui, w) {
  K.panel(g, 1046, 66, 210, 70, { slant: 7, shadow: 3 });
  for (let n = 1; n <= 6; n++) {
    const f = w.run.floors[n], x = 1062 + (n - 1) * 17, y = 84;
    const cur = n === w.floorN, past = n < w.floorN;
    const col = n === 6 ? C.FLOOR_COLORS.rooftop : C.FLOOR_COLORS[f.domType];
    K.circle(g, x, y, cur ? 8 : 5.5);
    g.fillStyle = past || cur ? col : '#2a2830'; g.fill(); K.ink(g, 2.5);
    if (cur) { K.circle(g, x, y, 11); g.lineWidth = 2; g.strokeStyle = K.GOLD_HI; g.stroke(); }
  }
  K.text(ui, K.floorName(w.floorN), 1230, 93, { size: 26, align: 'center', weight: 900, color: K.PAPER });
  const next = w.floorN >= 6 ? null : w.floorN === 5 ? 'rooftop' : w.floor.nextDomType;
  if (next) {
    K.text(ui, '다음:', 1058, 124, { size: 19, color: K.DIM, weight: 700 });
    IC.type(g, next, 1118, 117, 22, { disc: C.FLOOR_COLORS[next] || '#7d8597' });
    K.text(ui, K.typeName(next), 1134, 124, { size: 20, color: K.PAPER, weight: 800 });
  } else K.text(ui, '마왕을 쓰러뜨려라', 1058, 124, { size: 18, color: '#efe2ff', weight: 700 });
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
    const y = 402 + i * 44, size = 21;
    const tag = t.kind === 'hint' ? '안내' : null;
    const tw = K.measure(g, t.text, size, 700) + (tag ? 56 : 0);
    const x = 16 + slide;
    K.panel(g, x, y, Math.min(560, tw + 34), 36, { slant: 6, shadow: 3, alpha: Math.max(0, a) });
    g.globalAlpha = Math.max(0, a);
    g.fillStyle = KIND_COLOR[t.kind] || KIND_COLOR.info; g.fillRect(x + 6, y + 6, 5, 24);
    let tx = x + 20;
    if (tag) { K.text(ui, tag, tx, y + 25, { size: 17, color: K.SKY, weight: 900 }); tx += 50; }
    K.text(ui, t.text, tx, y + 26, { size, color: K.PAPER, weight: 700, maxW: 520 });
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
function drawGuard(g) {
  const pts = [[446, 600], [494, 614], [606, 608], [640, 584], [674, 608], [786, 614], [834, 600], [814, 646], [802, 720], [478, 720], [466, 646]];
  K.poly(g, pts.map((p) => [p[0] + 4, p[1] + 4])); g.fillStyle = K.INK; g.fill();
  K.poly(g, pts); g.fillStyle = '#c9a44a'; g.fill();
  // lower facet in a darker gold (two tones)
  g.save(); K.poly(g, pts); g.clip();
  g.fillStyle = '#8f6f2a'; g.fillRect(440, 668, 400, 60);
  K.poly(g, [[446, 600], [494, 614], [490, 624], [452, 610]]); g.fillStyle = '#f0d27a'; g.fill();
  K.poly(g, [[834, 600], [786, 614], [790, 624], [828, 610]]); g.fill();
  K.poly(g, [[606, 608], [640, 584], [674, 608], [640, 598]]); g.fill();
  g.restore();
  K.poly(g, pts); K.ink(g, 4);
  // the peak's gem
  K.poly(g, [[640, 592], [647, 601], [640, 610], [633, 601]]); g.fillStyle = '#efe2c0'; g.fill(); K.ink(g, 2);
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
  // target card on a floor of its type: halo
  if (hd.glow) { g.fillStyle = 'rgba(224,57,47,0.22)'; g.fillRect(x, y, sz, sz); }
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
    const bw2 = K.measure(g, hd.badge, 15, 800) + 14;
    const bk = s.badgeAt !== undefined && now - s.badgeAt < 0.3 ? 1.2 : 1;
    g.save(); g.translate(x + sz / 2, y - 6); g.scale(bk, bk);
    K.poly(g, K.slantPts(-bw2 / 2, -12, bw2, 22, 4)); g.fillStyle = '#3a1f5a'; g.fill(); K.ink(g, 2.5);
    K.text(ui, hd.badge, 0, 4, { size: 15, align: 'center', color: '#efe2ff', weight: 800 });
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
      ui.button({ id: 'slot' + i, label: c ? c.def.name : '빈 홈', x: r.x, y: r.y - 8, w: r.w, h: r.h + 8, style: 'none', onTap: () => ui.app.pause() });
    }
  },
});

// ---- controls: dash button, joystick ----------------------------------------------------------------------
BD.ui.dashCenter = (ui) => (ui.app.save.settings.dashSide === 'left' ? [86, 624] : [1194, 624]);
BD.ui.hud.register({
  id: 'controls',
  order: 50,
  draw(g, ui) {
    const w = ui.world, h = w.hero;
    const [cx, cy] = BD.ui.dashCenter(ui), r = 46;
    const cd = K.clamp(h.dashCd / C.DASH.cd, 0, 1), ready = cd <= 0;
    K.circle(g, cx + 3, cy + 4, r); g.fillStyle = K.INK; g.fill();
    K.circle(g, cx, cy, r); g.fillStyle = ready ? '#1e1b16' : '#0f0f13'; g.fill();
    g.save(); K.circle(g, cx, cy, r); g.clip(); g.fillStyle = ready ? '#2c271d' : '#17161c'; g.fillRect(cx - r, cy - r, 2 * r, r * 0.85); g.restore();
    K.circle(g, cx, cy, r); K.ink(g, 4);
    if (!ready) {
      g.beginPath(); g.arc(cx, cy, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd));
      g.lineWidth = 6; g.strokeStyle = '#8d877c'; g.stroke();
    } else {
      K.circle(g, cx, cy, r - 6); g.lineWidth = 4; g.strokeStyle = K.GOLD_HI; g.stroke();
    }
    IC.dash(g, cx, cy - 9, 34, ready ? K.PAPER : '#6d6a64');
    K.text(ui, '돌진', cx, cy + 27, { size: 18, align: 'center', color: ready ? K.PAPER : '#6d6a64', weight: 800 });
    if (S.lastInput === 'key') K.text(ui, 'Space', cx, cy - r - 8, { size: 15, align: 'center', color: K.DIM, stroke: 3, weight: 700 });
    ui.button({ id: 'hud_dash', label: '돌진', x: cx - r - 6, y: cy - r - 6, w: 2 * r + 12, h: 2 * r + 12, style: 'none', onPress: () => { BD.client.input.st.dashReq = true; } });
    // floating joystick (touch / mouse drag)
    const st = BD.client.input.stick && BD.client.input.stick();
    if (st && !ui.app.overlay()) {
      g.globalAlpha = 0.55;
      K.circle(g, st.ox, st.oy, 40); g.lineWidth = 7; g.strokeStyle = K.INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = K.PAPER; g.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), k = d > 40 ? 40 / d : 1;
      K.circle(g, st.ox + dx * k, st.oy + dy * k, 17); g.fillStyle = K.PAPER; g.fill(); K.ink(g, 3);
      g.globalAlpha = 1;
    }
  },
});

// Remember whether the player is on keys or touch (hints and the Space label use it).
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { S.lastInput = 'key'; });
  window.addEventListener('pointerdown', (ev) => { S.lastInput = ev.pointerType === 'mouse' ? 'mouse' : 'touch'; });
}
