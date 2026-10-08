// ── HUD: 경험치 바, 매수/매도 버튼, 주가 바, 타이머, 보스 바, 배너 ─────────
const HUD = {
  barY: null,
  dock: 'bottom',
  buyS: new Spring(1, 520, 20),
  sellS: new Spring(1, 520, 20),
  sellFlash: 0, sellShake: 0, sellColor: UP,
  pops: [],
  joyGhost: null,
  tickPulse: 0, lastHist: 0,

  get U() { return View.U; },
  m() { return 10 * View.U; },
  btnW() { return 86 * View.U; },
  btnH() { return 46 * View.U; },
  rowY() { return View.safe.t + 16 * View.U; },
  buyRect() { return { x: View.safe.l + this.m(), y: this.rowY(), w: this.btnW(), h: this.btnH() }; },
  sellRect() { return { x: View.W - View.safe.r - this.m() - this.btnW(), y: this.rowY(), w: this.btnW(), h: this.btnH() }; },
  pauseRect() {
    const b = this.buyRect(), s = this.sellRect();
    return { x: b.x + b.w + 6 * View.U, y: b.y, w: s.x - (b.x + b.w) - 12 * View.U, h: 30 * View.U };
  },
  xpBarRect() {
    const m = this.m();
    return { x: View.safe.l + m, y: View.safe.t + 5 * View.U, w: View.W - View.safe.l - View.safe.r - 2 * m, h: 5 * View.U };
  },
  bossRect() {
    const m = this.m(), b = this.buyRect();
    return { x: View.safe.l + m, y: b.y + b.h + 8 * View.U, w: View.W - View.safe.l - View.safe.r - 2 * m, h: 22 * View.U };
  },
  barH() { return 32 * View.U; },
  barTarget(dock) {
    if (dock === 'top') {
      const b = this.buyRect();
      return b.y + b.h + 8 * View.U + (G.boss ? 30 * View.U : 0);
    }
    return View.H - View.safe.b - this.m() - this.barH();
  },
  barRect() {
    const m = this.m();
    return { x: View.safe.l + m, y: this.barY, w: View.W - View.safe.l - View.safe.r - 2 * m, h: this.barH() };
  },

  onResize() { this.barY = this.barTarget(this.dock); },

  buyDown() {
    if (G.state !== 'play') return;
    Market.buyStart();
    this.buyS.v = 0.86;
  },
  buyUp() {
    Market.buyEnd();
    this.buyS.v = 1.08;
  },
  sellDown() {
    if (G.state !== 'play') return;
    this.sellS.v = 0.84;
    const res = Market.sell();
    if (!res) { this.sellShake = 1; return; }
    const up = res.ratio >= 1;
    this.sellColor = up ? UP : DOWN;
    this.sellFlash = 1;
    const r = this.sellRect(), xb = this.xpBarRect();
    const n = clamp(Math.round(res.gain / 3), 6, 40);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      uiStream(r.x + r.w / 2 + rand(-1, 1) * r.w * 0.3, r.y + r.h / 2, xb.x + rand(0.05, 0.95) * xb.w, xb.y + xb.h / 2,
        this.sellColor, up ? 3 : 2, 0.45 + i * 0.012,
        last ? () => { addXP(res.gain); Sfx.play('level'); } : null);
    }
    const pct = (res.ratio - 1) * 100;
    this.pop((up ? '+' : '') + pct.toFixed(1) + '%  →  ' + fmtInt(res.gain) + ' EXP', r.x + r.w, r.y + r.h + 18 * View.U, this.sellColor, 'right');
    addShake(up ? 0.1 + Math.min(0.4, (res.ratio - 1) * 0.6) : 0.12);
  },
  joyRelease(j) { this.joyGhost = { bx: j.bx, by: j.by, x: j.x, y: j.y, t: 0 }; },

  pop(text, x, y, color, align = 'center') { this.pops.push({ text, x, y, color, align, t: 0, dur: 1.6 }); },

  update(rdt) {
    this.buyS.step(rdt); this.sellS.step(rdt);
    this.sellFlash = Math.max(0, this.sellFlash - rdt * 3);
    this.sellShake = Math.max(0, this.sellShake - rdt * 4);
    // 주가 바: 조이스틱 손가락이 아래쪽에 있으면 위로 피한다
    const j = Input.joy;
    if (j) {
      const y = Math.max(j.by, j.y);
      const want = y > View.H * 0.5 ? 'top' : 'bottom';
      // 반대편으로 갈 때만 바꾼다 (손가락이 바 근처일 때)
      this.dock = want;
    }
    const tgt = this.barTarget(this.dock);
    if (this.barY == null) this.barY = tgt;
    this.barY = damp(this.barY, tgt, 11, rdt);
    if (this.joyGhost) { this.joyGhost.t += rdt; if (this.joyGhost.t > 0.25) this.joyGhost = null; }
    for (const p of this.pops) p.t += rdt;
    this.pops = this.pops.filter(p => p.t < p.dur);
    G.xpShown = damp(G.xpShown || 0, G.xp, 10, rdt);
    if (Market.ticked) { Market.ticked = false; this.tickPulse = 1; }
    this.tickPulse = Math.max(0, this.tickPulse - rdt * 2.2);
    updateUiParts(rdt);
  },

  draw() {
    const U = View.U;
    ctx.save();
    this.drawVignette();
    this.drawJoystick();
    this.drawXpBar();
    this.drawCenter();
    this.drawButton('buy');
    this.drawButton('sell');
    if (G.boss) this.drawBossBar();
    this.drawStockBar();
    this.drawOffscreen();
    this.drawUiParts();
    for (const p of this.pops) {
      const u = p.t / p.dur;
      if (u > 0.75 && (View.frame >> 1) & 1) continue;
      drawText(p.text, p.x, p.y - easeOutCubic(u) * 14 * U, 12, p.color, p.align, true, true);
    }
    this.drawBanner();
    ctx.restore();
  },

  drawVignette() {
    const p = G.p;
    if (!p || G.state === 'title') return;
    const ratio = p.hp / p.maxHp;
    if (ratio > 0.3) return;
    const k = (0.3 - ratio) / 0.3;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 1000 * 7);
    const P = View.P, band = 6 * P;
    for (let i = 0; i < 3; i++) {
      const lvl = Math.round((5 - i * 2) * k * pulse);
      if (lvl <= 0) continue;
      ctx.fillStyle = Gfx.pattern(ctx, lvl);
      const o = i * band;
      ctx.fillRect(o, o, View.W - 2 * o, band);
      ctx.fillRect(o, View.H - o - band, View.W - 2 * o, band);
      ctx.fillRect(o, o + band, band, View.H - 2 * o - 2 * band);
      ctx.fillRect(View.W - o - band, o + band, band, View.H - 2 * o - 2 * band);
    }
  },

  drawJoystick() {
    const U = View.U;
    const j = Input.joy || this.joyGhost;
    if (!j || G.state !== 'play') return;
    let a = 1, kx = j.x, ky = j.y;
    if (!Input.joy) {
      const u = this.joyGhost.t / 0.25;
      a = 1 - u;
      kx = lerp(j.x, j.bx, easeOutCubic(u)); ky = lerp(j.y, j.by, easeOutCubic(u));
    }
    const R = Input.radius();
    ctx.globalAlpha = 0.45 * a;
    ctx.fillStyle = INK;
    const n = 28;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      ctx.fillRect(Math.round(j.bx + Math.cos(t) * R - U), Math.round(j.by + Math.sin(t) * R - U), 2 * U, 2 * U);
    }
    ctx.globalAlpha = 0.6 * a;
    ctx.beginPath();
    ctx.arc(kx, ky, 15 * U, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  drawXpBar() {
    const U = View.U, r = this.xpBarRect();
    ctx.fillStyle = INK;
    ctx.fillRect(r.x - U, r.y - U, r.w + 2 * U, r.h + 2 * U);
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const f = clamp((G.xpShown || 0) / (G.xpNext || 1), 0, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(r.x, r.y, Math.round(r.w * f), r.h);
    // 매수 중: 경험치가 바 대신 주식으로 간다는 표시
    if (Market.frozen) {
      ctx.fillStyle = UP;
      for (let x = r.x; x < r.x + r.w; x += 8 * U) ctx.fillRect(x + ((performance.now() / 40) % (8 * U)), r.y + r.h + 2 * U, 3 * U, U);
    }
  },

  drawCenter() {
    const U = View.U;
    const pr = this.pauseRect();
    const cx = pr.x + pr.w / 2;
    const y0 = pr.y + 8 * U;
    const clock = fmtTime(Math.min(G.t, RUN_LEN));
    drawText(clock, cx, y0, 24, INK, 'center', true, true);
    // 일시정지 표시
    const tw = ctx.measureText(clock).width;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(cx + tw / 2 + 5 * U), Math.round(y0 - 5 * U), 2 * U, 9 * U);
    ctx.fillRect(Math.round(cx + tw / 2 + 9 * U), Math.round(y0 - 5 * U), 2 * U, 9 * U);
    ctx.globalAlpha = 1;
    const S = STAGES[G.stage];
    drawText(S.roman + ' ' + S.name + ' · LV ' + G.level + ' · 처치 ' + fmtInt(G.kills), cx, y0 + 20 * U, 12, INK, 'center', true);
    // 30분 진행 막대 (5분 x 6칸)
    const bw = Math.min(pr.w - 8 * U, 132 * U), bx = cx - bw / 2, by = y0 + 31 * U;
    const seg = bw / 6;
    for (let i = 0; i < 6; i++) {
      const f = clamp((G.t - i * STAGE_LEN) / STAGE_LEN, 0, 1);
      const x = Math.round(bx + i * seg + U), w = Math.round(seg - 2 * U);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, by, w, 2 * U);
      ctx.globalAlpha = 1;
      if (f > 0) ctx.fillRect(x, by, Math.round(w * f), 2 * U);
    }
  },

  drawButton(which) {
    const U = View.U;
    const isBuy = which === 'buy';
    const r = isBuy ? this.buyRect() : this.sellRect();
    const s = isBuy ? this.buyS.v : this.sellS.v;
    const has = Market.shares > 0;
    const pressed = isBuy && Market.frozen;
    let color = isBuy ? UP : DOWN;
    const enabled = isBuy || has;
    ctx.save();
    const shake = !isBuy ? Math.sin(this.sellShake * 40) * this.sellShake * 4 * U : 0;
    ctx.translate(r.x + r.w / 2 + shake, r.y + r.h / 2);
    ctx.scale(s, s);
    const x = -r.w / 2, y = -r.h / 2;
    // 눌린 매수: 붉은 맥동
    if (pressed) {
      const pulse = (performance.now() / 600) % 1;
      ctx.strokeStyle = UP;
      ctx.globalAlpha = 1 - pulse;
      ctx.lineWidth = 2 * U;
      const g = pulse * 10 * U;
      ctx.strokeRect(x - g, y - g, r.w + 2 * g, r.h + 2 * g);
      ctx.globalAlpha = 1;
    }
    const flash = !isBuy && this.sellFlash > 0;
    ctx.fillStyle = pressed ? UP : flash ? this.sellColor : PAPER;
    if (flash) ctx.globalAlpha = 0.35 + 0.65 * this.sellFlash;
    ctx.fillRect(x, y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = enabled ? color : '#55534c';
    ctx.lineWidth = 2 * U;
    ctx.strokeRect(x + U, y + U, r.w - 2 * U, r.h - 2 * U);
    // 모서리 눈금 (단말기 느낌)
    ctx.fillStyle = enabled ? color : '#55534c';
    const c = 4 * U;
    ctx.fillRect(x, y, c, U); ctx.fillRect(x, y, U, c);
    ctx.fillRect(x + r.w - c, y + r.h - U, c, U); ctx.fillRect(x + r.w - U, y + r.h - c, U, c);
    const fg = pressed || flash ? PAPER : enabled ? color : '#55534c';
    let label, sub, subColor = fg;
    if (isBuy) {
      label = pressed ? '매수 중' : '매수';
      sub = has ? '보유 ' + fmtInt(Market.cost) : pressed ? '줍는 대로' : '꾹 누르기';
      if (!pressed && !has) subColor = '#8d8a80';
    } else {
      label = '매도';
      if (has) {
        const ratio = Market.ratioNow();
        const pct = (ratio - 1) * 100;
        sub = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
        if (!flash) subColor = ratio >= 1 ? UP : DOWN;
      } else { sub = '보유 없음'; subColor = '#55534c'; }
    }
    drawText(label, 0, y + 15 * U, 12, fg, 'center', false, true);
    drawText(sub, 0, y + 32 * U, 12, subColor, 'center', false, false);
    ctx.restore();
  },

  drawBossBar() {
    const U = View.U, r = this.bossRect(), b = G.boss;
    b.hpShown = b.hpShown === undefined ? b.hp : damp(b.hpShown, b.hp, 4, 1 / 60);
    drawText(b.d.name, r.x, r.y + 6 * U, 12, INK, 'left', true, true);
    drawText(b.d.myth, r.x + r.w, r.y + 6 * U, 12, INK, 'right', true);
    const y = r.y + 14 * U, h = 5 * U;
    ctx.fillStyle = INK;
    ctx.fillRect(r.x - U, y - U, r.w + 2 * U, h + 2 * U);
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x, y, r.w, h);
    const f = clamp(b.hp / b.maxHp, 0, 1), fs = clamp(b.hpShown / b.maxHp, 0, 1);
    ctx.fillStyle = Gfx.pattern(ctx, 8);
    ctx.fillRect(r.x, y, Math.round(r.w * fs), h);
    ctx.fillStyle = b.flash > 0 ? PAPER : INK;
    ctx.fillRect(r.x, y, Math.round(r.w * f), h);
    ctx.fillStyle = PAPER;
    for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(r.x + (r.w * i) / 10), y, U, h);
  },

  drawStockBar() {
    const U = View.U, r = this.barRect(), M = Market;
    if (!M.hist) return;
    // 바탕
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = M.frozen ? UP : '#4a4840';
    ctx.lineWidth = U;
    ctx.strokeRect(r.x + U / 2, r.y + U / 2, r.w - U, r.h - U);
    const boxW = 84 * U;
    const gx = r.x + 6 * U, gw = r.w - boxW - 10 * U, gy = r.y + 5 * U, gh = r.h - 10 * U;
    const n = M.hist.length;
    const step = gw / (HIST_LEN - 1);
    const scroll = M.frozen ? M.tickT : M.tickT;
    const lo = M.lo, hi = M.hi;
    const Y = v => gy + gh - ((v - lo) / (hi - lo || 1)) * gh;
    // 마지막 점은 새 값으로 미끄러진다
    const lastV = lerp(M.prev, M.price, easeOutCubic(M.anim));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? lastV : M.hist[i];
      const x = gx + gw - (n - 1 - i + scroll) * step;
      pts.push([x, Y(v), v]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, r.y + U, gw, r.h - 2 * U);
    ctx.clip();
    // 기준선 1,000
    if (BASE_PRICE > lo && BASE_PRICE < hi) {
      ctx.fillStyle = '#34322c';
      const by = Math.round(Y(BASE_PRICE));
      for (let x = gx; x < gx + gw; x += 4 * U) ctx.fillRect(x, by, 2 * U, U);
    }
    // 채움
    const trendUp = M.price >= M.hist[0];
    const col = trendUp ? UP : DOWN;
    const last = pts[pts.length - 1];
    const nowX = gx + gw;
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, trendUp ? 'rgba(255,59,85,0.28)' : 'rgba(45,125,255,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], gy + gh);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(nowX, last[1]);
    ctx.lineTo(nowX, gy + gh);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // 선: 구간별 색 (상승 빨강 / 하락 파랑)
    ctx.lineWidth = 1.5 * U;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.strokeStyle = b[2] > a[2] ? UP : b[2] < a[2] ? DOWN : '#8d8a80';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // 현재가 연장선
    ctx.strokeStyle = M.price >= M.prev ? UP : DOWN;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([2 * U, 2 * U]);
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(nowX, last[1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // 평단
    if (M.shares > 0) {
      const ay = Math.round(Y(M.avg));
      ctx.fillStyle = INK;
      for (let x = gx; x < gx + gw; x += 6 * U) ctx.fillRect(x, ay, 3 * U, U);
      drawText('평단', gx + gw - 2 * U, ay - 6 * U, 12, INK, 'right', true);
    }
    // 내부자 정보: 다음 틱
    if (G.passive.insider && !M.frozen) {
      const ny = Y(M.next);
      ctx.strokeStyle = M.next >= M.price ? UP : DOWN;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 120);
      ctx.setLineDash([U, 2 * U]);
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(last[0] + step, ny); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 현재 점 + 틱 맥동
    const dotC = M.price >= M.prev ? UP : DOWN;
    ctx.fillStyle = dotC;
    ctx.beginPath(); ctx.arc(last[0], last[1], 2.5 * U, 0, TAU); ctx.fill();
    if (this.tickPulse > 0 && !M.frozen) {
      ctx.strokeStyle = dotC;
      ctx.globalAlpha = this.tickPulse;
      ctx.lineWidth = U;
      ctx.beginPath(); ctx.arc(last[0], last[1], (2.5 + (1 - this.tickPulse) * 9) * U, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (M.frozen) {
      ctx.fillStyle = UP;
      for (let y = r.y + 3 * U; y < r.y + r.h - 3 * U; y += 4 * U) ctx.fillRect(Math.round(last[0]), y, U, 2 * U);
      ctx.fillStyle = UP;
      ctx.fillRect(gx + 3 * U, r.y + 4 * U, 2 * U, 8 * U);
      ctx.fillRect(gx + 7 * U, r.y + 4 * U, 2 * U, 8 * U);
      drawText('정지', gx + 12 * U, r.y + 8 * U, 12, UP, 'left', true, true);
    }
    // 가격 상자
    const bx = r.x + r.w - boxW - 2 * U;
    ctx.fillStyle = '#4a4840';
    ctx.fillRect(bx, r.y + 5 * U, U, r.h - 10 * U);
    const chg = (M.price / M.prev - 1) * 100;
    const pc = chg > 0 ? UP : chg < 0 ? DOWN : INK;
    const cxp = bx + boxW / 2 + 2 * U;
    drawText(fmtInt(M.price), cxp, r.y + 10 * U, 12, pc, 'center', false, true);
    drawText((chg > 0 ? '▲' : chg < 0 ? '▼' : '–') + Math.abs(chg).toFixed(1) + '%', cxp, r.y + 21 * U, 12, pc, 'center');
    // 다음 틱까지 남은 시간
    const tw = boxW - 22 * U;
    ctx.fillStyle = '#34322c';
    ctx.fillRect(Math.round(cxp - tw / 2), r.y + r.h - 3 * U, Math.round(tw), U);
    ctx.fillStyle = M.frozen ? UP : INK;
    ctx.fillRect(Math.round(cxp - tw / 2), r.y + r.h - 3 * U, Math.round(tw * (M.frozen ? 1 : M.tickT)), U);
    // 매도 섬광
    if (M.flash > 0) {
      ctx.globalAlpha = M.flash * 0.5;
      ctx.fillStyle = this.sellColor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }
  },

  // 화면 밖 보스·보물 상자: 가장자리에 방향 표시
  drawOffscreen() {
    const U = View.U;
    const marks = [];
    if (G.boss && !G.boss.dead) marks.push([G.boss, 'BOSS', 1]);
    for (const it of G.items) if (it.kind === 'chest') marks.push([it, '상자', 0]);
    for (const [o, label, big] of marks) {
      const [sx, sy] = worldToScreen(o.x, o.y);
      const m = 26 * U;
      const top = this.buyRect().y + this.btnH() + 10 * U, bot = Math.min(this.barY, View.H) - 8 * U;
      if (sx > m && sx < View.W - m && sy > top && sy < bot) continue;
      const cx = View.W / 2, cy = (top + bot) / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const hw = View.W / 2 - m, hh = (bot - top) / 2 - 10 * U;
      const k = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      const blink = big && (View.frame >> 3) & 1;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(a);
      ctx.fillStyle = INK;
      const s = (big ? 9 : 6) * U;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.8); ctx.lineTo(-s * 0.6, s * 0.8); ctx.closePath(); ctx.fill();
      ctx.restore();
      const tx = x - Math.cos(a) * 20 * U, ty = y - Math.sin(a) * 14 * U;
      if (!blink) drawText(label, tx, ty, 12, INK, 'center', true, true);
    }
  },

  drawUiParts() {
    const U = View.U;
    for (const q of G.uiParts) {
      const u = clamp(q.t / q.dur, 0, 1);
      const e = easeInCubic(u) * 0.7 + u * 0.3;
      const bez = (t) => {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        return [a * q.x0 + b * q.cx + c * q.x1, a * q.y0 + b * q.cy + c * q.y1];
      };
      const [x, y] = bez(e);
      const s = q.size * U;
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      const [x2, y2] = bez(Math.max(0, e - 0.06));
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(x2 - s / 4), Math.round(y2 - s / 4), Math.ceil(s / 2), Math.ceil(s / 2));
      ctx.globalAlpha = 1;
    }
  },

  drawBanner() {
    const bn = G.banner;
    if (!bn) return;
    const U = View.U;
    const u = bn.t / bn.dur;
    const cx = View.W / 2, cy = View.H * 0.34;
    const inU = clamp(bn.t / 0.35, 0, 1);
    const outU = clamp((u - 0.82) / 0.18, 0, 1);
    if (outU > 0 && hash2(View.frame, 7) < outU) return;
    const wide = easeOutBack(inU);
    if (bn.kind === 'boss') {
      const h = 64 * U, w = View.W * wide;
      ctx.fillStyle = INK;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      // 경고 줄무늬
      ctx.fillStyle = PAPER;
      const off = (performance.now() / 20) % (12 * U);
      for (let x = cx - w / 2 - 12 * U + off; x < cx + w / 2; x += 12 * U) {
        ctx.fillRect(x, cy - h / 2 + 2 * U, 6 * U, 3 * U);
        ctx.fillRect(x, cy + h / 2 - 5 * U, 6 * U, 3 * U);
      }
      if (inU > 0.5) {
        const jit = Math.sin(bn.t * 60) * U * (1 - inU);
        drawText(bn.title, cx + jit, cy - 6 * U, 36, PAPER, 'center', false, true);
        drawText(bn.sub, cx, cy + 20 * U, 12, PAPER, 'center');
      }
      return;
    }
    const lineW = Math.min(View.W * 0.4, 150 * U) * wide;
    ctx.fillStyle = INK;
    ctx.fillRect(cx - lineW - 20 * U, cy - 4 * U, lineW, U);
    ctx.fillRect(cx + 20 * U, cy - 4 * U, lineW, U);
    if (inU > 0.3) {
      drawText(bn.title, cx, cy - 4 * U, 36, INK, 'center', true, true);
      drawText(bn.sub, cx, cy + 22 * U, 12, INK, 'center', true);
    }
  },
};
