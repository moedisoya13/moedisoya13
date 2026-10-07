// 주가 차트 바. 엄지가 닿지 않는 쪽(위/아래)에 붙어서 시세·보유·타이머·코인·뉴스를 보여준다.

import { BAR_CSS_H, RUN_SECONDS } from '../config.js';
import { formatPrice, changePct } from '../market.js';
import { avgCost, unrealizedPct } from '../portfolio.js';
import { fmtTime, fmtPct } from '../util.js';

export const UP = '#ff4d5e';
export const DOWN = '#4d8dff';
const FLAT = '#a9a3b8';
const FONT = 'Galmuri11, sans-serif';

const TIPS = [
  '팁: 매매는 왕씨 포장마차에서만! 노란 화살표를 따라가세요',
  '팁: 빨강은 상승, 파랑은 하락 (한국식)',
  '팁: 노란 점선은 내 평단가',
  '팁: XP 로도 주식을 살 수 있지만 레벨업이 늦어집니다',
  '팁: 상자·통·항아리를 부수면 코인이 나와요',
  '팁: 런이 끝나면 보유 주식은 그 시세로 강제청산',
  '팁: 삐삐가 있으면 어디서든 왕씨를 부를 수 있어요',
];

export class ChartBar {
  constructor(root, { onPause, onPager }) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.side = 'top';
    this.ticker = [];
    this.cur = null;
    this.curX = 0;
    this.tipIdx = 0;
    this.pauseBtn = root.querySelector('[data-act=pause]');
    this.pagerBtn = root.querySelector('[data-act=pager]');
    this.pauseBtn.addEventListener('click', onPause);
    this.pagerBtn.addEventListener('click', onPager);
    this.switching = false;
    this.layout();
  }

  layout() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.root.clientWidth || window.innerWidth;
    this.w = w;
    this.h = BAR_CSS_H;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(BAR_CSS_H * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = BAR_CSS_H + 'px';
  }

  // 바 전체 높이 (safe-area 포함, CSS px)
  outerHeight() {
    return this.root.offsetHeight || BAR_CSS_H;
  }

  setSide(side, animate = true) {
    if (side === this.side && !this.pendingSide) return;
    if (this.switching) {
      this.pendingSide = side;
      return;
    }
    if (side === this.side) return;
    if (!animate) {
      this.root.classList.remove('top', 'bottom');
      this.root.classList.add(side);
      this.side = side;
      return;
    }
    this.switching = true;
    this.root.classList.add('hide');
    setTimeout(() => {
      this.root.classList.remove('top', 'bottom');
      this.root.classList.add(side);
      this.side = side;
      void this.root.offsetHeight; // reflow 후 다시 슬라이드 인
      this.root.classList.remove('hide');
      setTimeout(() => {
        this.switching = false;
        const p = this.pendingSide;
        this.pendingSide = null;
        if (p && p !== this.side) this.setSide(p);
      }, 140);
    }, 130);
  }

  pushTicker(text, color = '#fff') {
    if (this.ticker.length > 6) this.ticker.shift();
    this.ticker.push({ text, color });
  }

  show(on) {
    this.root.style.display = on ? '' : 'none';
  }

  draw(run, dt) {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';

    const pl = run.player;
    // --- 1행: 타이머 · 레벨/XP · 코인 ---
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    const remain = RUN_SECONDS - run.t;
    ctx.fillText(fmtTime(run.t), 40, 12);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = remain < 60 ? UP : '#8a839a';
    ctx.fillText('/15:00', 84, 12);

    const xpX = 132;
    const xpW = Math.max(60, w - xpX - 150);
    ctx.fillStyle = '#ffd34d';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`Lv${pl.level}`, xpX, 12);
    const barX = xpX + 34;
    const barW = xpW - 34;
    ctx.fillStyle = '#2a2433';
    ctx.fillRect(barX, 8, barW, 8);
    ctx.fillStyle = '#5fd0ff';
    ctx.fillRect(barX, 8, barW * Math.min(1, pl.xp / pl.xpNext), 8);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd34d';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`${pl.coins}`, w - 92, 12);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(w - 92 - ctx.measureText(`${pl.coins}`).width - 9, 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a10';
    ctx.fillRect(w - 92 - ctx.measureText(`${pl.coins}`).width - 10, 11, 2, 2);

    // --- 2행: 종목 패널 2개 ---
    const pad = 8;
    const gap = 8;
    const pw = (w - pad * 2 - gap) / 2;
    run.market.stocks.forEach((s, i) => this.drawStock(run, s, pad + i * (pw + gap), 24, pw, 56));

    // --- 3행: 뉴스 티커 ---
    this.drawTicker(run, dt, 88);

    // 삐삐 버튼 상태
    const n = run.pager;
    if (this._pager !== n) {
      this._pager = n;
      this.pagerBtn.textContent = `삐삐 ${n}`;
      this.pagerBtn.disabled = n <= 0;
    }
  }

  drawStock(run, s, x, y, w, h) {
    const ctx = this.ctx;
    const pf = run.portfolio;
    const chg = changePct(s);
    const col = chg > 0.0005 ? UP : chg < -0.0005 ? DOWN : FLAT;

    ctx.fillStyle = '#1d1824';
    ctx.fillRect(x, y, w, h);

    // 이름 / 가격 / 등락
    ctx.textAlign = 'left';
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = '#d8d2e6';
    ctx.fillText(s.def.short, x + 4, y + 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = col;
    ctx.font = `12px ${FONT}`;
    const arrow = chg > 0.0005 ? '▲' : chg < -0.0005 ? '▼' : '-';
    ctx.fillText(`${formatPrice(s.price)} ${arrow}${Math.abs(chg * 100).toFixed(1)}%`, x + w - 4, y + 7);

    // 스파크라인
    const cx = x + 3;
    const cy = y + 15;
    const cw = w - 6;
    const ch = 26;
    const hist = s.history;
    const h0 = run.portfolio.holdings[s.id];
    const avg = avgCost(pf, s.id);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of hist) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    lo = Math.min(lo, s.open);
    hi = Math.max(hi, s.open);
    if (h0.qty > 0) {
      lo = Math.min(lo, avg);
      hi = Math.max(hi, avg);
    }
    const span = Math.max(hi - lo, s.open * 0.02);
    const mid = (hi + lo) / 2;
    lo = mid - span * 0.55;
    hi = mid + span * 0.55;
    const Y = (v) => cy + ch - ((v - lo) / (hi - lo)) * ch;
    const N = 180;
    const X = (i) => cx + cw - (hist.length - 1 - i) * (cw / (N - 1));

    // 시작가 기준선
    ctx.strokeStyle = 'rgba(169,163,184,0.35)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, Math.round(Y(s.open)) + 0.5);
    ctx.lineTo(cx + cw, Math.round(Y(s.open)) + 0.5);
    ctx.stroke();
    // 평단가
    if (h0.qty > 0) {
      ctx.strokeStyle = '#ffd34d';
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, Math.round(Y(avg)) + 0.5);
      ctx.lineTo(cx + cw, Math.round(Y(avg)) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 가격선: 시작가 위는 빨강, 아래는 파랑
    ctx.lineWidth = 1.5;
    for (let i = 1; i < hist.length; i++) {
      const a = hist[i - 1];
      const b = hist[i];
      ctx.strokeStyle = (a + b) / 2 >= s.open ? UP : DOWN;
      ctx.beginPath();
      ctx.moveTo(X(i - 1), Y(a));
      ctx.lineTo(X(i), Y(b));
      ctx.stroke();
    }
    const lx = X(hist.length - 1);
    const ly = Y(s.price);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fill();

    // 보유 / 손익 / 의견
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'left';
    if (h0.qty > 0) {
      const u = unrealizedPct(pf, s.id, s.price);
      ctx.fillStyle = '#d8d2e6';
      ctx.fillText(`${h0.qty}주`, x + 4, y + h - 7);
      ctx.fillStyle = u >= 0 ? UP : DOWN;
      ctx.textAlign = 'right';
      ctx.fillText(fmtPct(u), x + w - 4, y + h - 7);
    } else {
      ctx.fillStyle = '#6f6880';
      ctx.fillText(s.def.kind, x + 4, y + h - 7);
    }
    if ((run.meta.sense || 0) >= 3) {
      ctx.textAlign = 'center';
      ctx.fillStyle = s.analyst === '매수' ? UP : s.analyst === '매도' ? DOWN : FLAT;
      ctx.fillText(`의견:${s.analyst}`, x + w / 2, y + h - 7);
    }
  }

  drawTicker(run, dt, y) {
    const ctx = this.ctx;
    const w = this.w;
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(0, y - 7, w, 15);
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'left';
    if (!this.cur) {
      const next = this.ticker.shift();
      this.cur = next || { text: TIPS[this.tipIdx++ % TIPS.length], color: '#8a839a' };
      this.curX = w;
      this.curW = ctx.measureText(this.cur.text).width;
    }
    this.curX -= dt * (this.ticker.length > 1 ? 110 : 70);
    ctx.fillStyle = this.cur.color;
    ctx.fillText(this.cur.text, Math.round(this.curX), y);
    if (this.curX + this.curW < 0) this.cur = null;
    // 대기 중인 뉴스가 있으면 지금 지나가는 팁은 바로 치운다
    if (this.cur && this.cur.color === '#8a839a' && this.ticker.length) this.cur = null;
  }
}

export function newsColor(pct) {
  return pct >= 0 ? UP : DOWN;
}
