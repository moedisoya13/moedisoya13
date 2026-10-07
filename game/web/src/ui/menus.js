// DOM 오버레이 화면들: 타이틀, 레벨업, 왕씨 증권, 일시정지, NG/클리어, 금고, 설정.

import { spriteURL } from '../sprites.js';
import { describeChoice } from '../upgrades.js';
import { META, SHOP, TRADE } from '../config.js';
import { formatPrice, changePct } from '../market.js';
import { avgCost, unrealized, unrealizedPct, buyCost, sellProceeds, maxBuyQty } from '../portfolio.js';
import { feeRate, spendableXp, shopPrice, hasAnalyst } from '../game.js';
import { fmtTime, fmtPct } from '../util.js';
import { UP, DOWN } from './chartbar.js';

const root = () => document.getElementById('ui');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function open(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'screen ' + cls;
  el.setAttribute('data-ui', '');
  el.innerHTML = html;
  root().replaceChildren(el);
  return el;
}

export function closeAll() {
  root().replaceChildren();
}

function on(el, sel, fn) {
  el.querySelectorAll(sel).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn(b, e);
    }),
  );
}

const coin = (n) => `<span class="coin">●</span>${esc(n)}`;
const signed = (n) => (n > 0 ? '+' : '') + Math.round(n);

// ---------------- 타이틀 ----------------
export function showTitle(save, { onStart, onVault, onSettings }) {
  const b = save.best;
  const el = open(
    `<div class="title">
      <div class="logo">재키<br>서바이버즈</div>
      <div class="sub">맨손 액션 × 주식 투자</div>
      <img class="hero" src="${spriteURL('jacky_pose', 6)}" alt="">
      <div class="col">
        <button class="btn big primary" data-act="start">촬영 시작</button>
        <button class="btn" data-act="vault">금고 ${coin(save.vault)}</button>
        <button class="btn" data-act="settings">설정</button>
      </div>
      <div class="best">최고 기록 ${fmtTime(b.time)} · ${b.kills}킬 · 투자 ${signed(b.profit)}${b.clears ? ` · 클리어 ${b.clears}회` : ''}</div>
      <div class="hint">화면 아무 곳이나 드래그해서 이동 · 공격은 자동</div>
    </div>`,
    'dim',
  );
  on(el, '[data-act=start]', onStart);
  on(el, '[data-act=vault]', onVault);
  on(el, '[data-act=settings]', onSettings);
}

// ---------------- 레벨업 ----------------
export function showLevelUp(run, choices, onPick) {
  const cards = choices
    .map((c, i) => {
      const d = describeChoice(c);
      const lvl = d.level ? (d.isNew ? '<span class="new">NEW</span>' : `Lv${d.level}`) : '';
      return `<button class="card" data-i="${i}">
        <img src="${spriteURL(d.icon, 3)}" alt="">
        <div class="ctext"><div class="cname">${esc(d.name)} ${lvl}</div><div class="cdesc">${esc(d.desc)}</div></div>
        <div class="ctag">${esc(d.tag)}</div>
      </button>`;
    })
    .join('');
  const el = open(`<div class="panel"><h2>레벨 업! <small>Lv${run.player.level - run.player.pendingLevels + 1}</small></h2><div class="cards">${cards}</div></div>`, 'dim');
  // 실수로 연타해서 고르는 걸 막는다
  let ready = false;
  setTimeout(() => (ready = true), 250);
  on(el, '.card', (b) => {
    if (!ready) return;
    onPick(choices[Number(b.dataset.i)]);
  });
}

// ---------------- 보물상자 ----------------
export function showChest(ev, onClose) {
  const items = ev.items.length ? ev.items.map((s) => `<li>${esc(s)}</li>`).join('') : '<li>강화할 게 없다… 대신 코인!</li>';
  const el = open(
    `<div class="panel center">
      <img src="${spriteURL('chest', 5)}" alt="">
      <h2>보물상자!</h2>
      <ul class="list">${items}<li>${coin('+' + ev.coins)}</li></ul>
      <button class="btn primary" data-act="ok">좋아!</button>
    </div>`,
    'dim',
  );
  on(el, '[data-act=ok]', onClose);
}

// ---------------- 왕씨 포장마차 증권 ----------------
export function showBroker(run, { source, onBuy, onSell, onShop, onClose }) {
  const state = { tab: 'trade', qty: { LTS: 1, DGN: 1 }, useXp: false };
  const el = open('<div class="panel broker"></div>', 'dim');
  const panel = el.firstElementChild;

  function render() {
    const pl = run.player;
    const fee = feeRate(run);
    const xp = spendableXp(run);
    const head = `
      <div class="bhead">
        <img src="${spriteURL('cart0', 2)}" alt="">
        <div><h2>왕씨 포장마차 증권</h2><div class="muted">${source === 'pager' ? '삐삐 전화 주문' : '"뭐 살 텐가?"'}</div></div>
        <button class="btn small" data-act="close">나가기</button>
      </div>
      <div class="wallet">${coin(pl.coins)} <span class="muted">XP ${xp} (=${Math.floor(xp * TRADE.xpRate)}코인)</span> <span class="muted">수수료 ${(fee * 100).toFixed(2)}%</span></div>
      <div class="tabs">
        <button class="tab ${state.tab === 'trade' ? 'on' : ''}" data-tab="trade">매매</button>
        <button class="tab ${state.tab === 'shop' ? 'on' : ''}" data-tab="shop">상점</button>
      </div>`;
    let body = '';
    if (state.tab === 'trade') {
      body = run.market.stocks.map((s) => stockCard(run, s, state, fee, xp)).join('');
      body += `<label class="check"><input type="checkbox" data-act="xp" ${state.useXp ? 'checked' : ''}> 코인이 모자라면 XP 로 충당 (XP 1 = ${TRADE.xpRate}코인, 레벨업이 늦어짐)</label>`;
    } else {
      body = SHOP.map((it) => {
        const price = shopPrice(run, it);
        const maxed = it.id === 'pager' && run.pager >= it.max;
        const dis = pl.coins < price || maxed;
        const icon = it.id === 'noodle' ? 'food' : it.id === 'scroll' ? 'i_qi' : 'pager';
        return `<div class="item">
          <img src="${spriteURL(icon, 3)}" alt="">
          <div class="ctext"><div class="cname">${esc(it.name)}</div><div class="cdesc">${esc(it.desc)}${it.id === 'pager' ? ` · 보유 ${run.pager}/${it.max}` : ''}</div></div>
          <button class="btn small ${dis ? '' : 'primary'}" data-shop="${it.id}" ${dis ? 'disabled' : ''}>${coin(price)}</button>
        </div>`;
      }).join('');
      body += `<div class="muted small">HP ${Math.ceil(pl.hp)}/${pl.stats.maxHp}</div>`;
    }
    panel.innerHTML = head + `<div class="bbody">${body}</div>`;

    on(panel, '[data-act=close]', onClose);
    on(panel, '[data-tab]', (b) => {
      state.tab = b.dataset.tab;
      render();
    });
    on(panel, '[data-q]', (b) => {
      const [id, op] = b.dataset.q.split(':');
      const s = run.market.stocks.find((x) => x.id === id);
      const h = run.portfolio.holdings[id];
      const maxB = maxBuyQty(s.price, fee, pl.coins, xp, TRADE.xpRate, state.useXp);
      let q = state.qty[id];
      if (op === '-') q = Math.max(1, q - 1);
      else if (op === '+') q = q + 1;
      else if (op === 'max') q = Math.max(1, maxB);
      else if (op === 'all') q = Math.max(1, h.qty);
      state.qty[id] = q;
      render();
    });
    on(panel, '[data-buy]', (b) => {
      const id = b.dataset.buy;
      if (onBuy(id, state.qty[id], state.useXp)) flash(b);
      render();
    });
    on(panel, '[data-sell]', (b) => {
      const id = b.dataset.sell;
      const r = onSell(id, state.qty[id]);
      if (r) toast(`${r.pnl >= 0 ? '익절' : '손절'} ${signed(r.pnl)}코인`, r.pnl >= 0 ? UP : DOWN);
      render();
    });
    on(panel, '[data-shop]', (b) => {
      onShop(b.dataset.shop);
      render();
    });
    const cb = panel.querySelector('[data-act=xp]');
    if (cb)
      cb.addEventListener('change', () => {
        state.useXp = cb.checked;
        render();
      });
    panel.querySelectorAll('canvas[data-chart]').forEach((c) => {
      const s = run.market.stocks.find((x) => x.id === c.dataset.chart);
      drawMiniChart(c, s.history, s.open, avgCost(run.portfolio, s.id), run.portfolio.holdings[s.id].qty > 0);
    });
  }
  render();
}

function stockCard(run, s, state, fee, xp) {
  const pl = run.player;
  const h = run.portfolio.holdings[s.id];
  const q = state.qty[s.id];
  const chg = changePct(s);
  const col = chg >= 0 ? UP : DOWN;
  const cost = buyCost(s.price, q, fee);
  const canBuy = maxBuyQty(s.price, fee, pl.coins, xp, TRADE.xpRate, state.useXp) >= q;
  const sellQ = Math.min(q, h.qty);
  const proceeds = sellQ > 0 ? sellProceeds(s.price, sellQ, fee) : 0;
  let hold = `<span class="muted">미보유 · ${esc(s.def.kind)}</span>`;
  if (h.qty > 0) {
    const u = unrealized(run.portfolio, s.id, s.price);
    const up = unrealizedPct(run.portfolio, s.id, s.price);
    hold = `${h.qty}주 · 평단 ${formatPrice(avgCost(run.portfolio, s.id))} · <b style="color:${u >= 0 ? UP : DOWN}">${fmtPct(up)} (${signed(u)})</b>`;
  }
  const analyst = hasAnalyst(run) ? ` <span class="pill" style="color:${s.analyst === '매수' ? UP : s.analyst === '매도' ? DOWN : '#aaa'}">의견 ${esc(s.analyst)}</span>` : '';
  return `<div class="stock">
    <div class="srow"><b>${esc(s.def.name)}</b> <span class="muted">${s.id}</span>${analyst}
      <span class="price" style="color:${col}">${formatPrice(s.price)} ${chg >= 0 ? '▲' : '▼'}${Math.abs(chg * 100).toFixed(1)}%</span></div>
    <canvas data-chart="${s.id}" width="600" height="120"></canvas>
    <div class="srow small">${hold}</div>
    <div class="srow qty">
      <button class="btn tiny" data-q="${s.id}:-">−</button><span class="q">${q}주</span><button class="btn tiny" data-q="${s.id}:+">+</button>
      <button class="btn tiny" data-q="${s.id}:max">최대</button><button class="btn tiny" data-q="${s.id}:all">보유전량</button>
    </div>
    <div class="srow act">
      <button class="btn buy" data-buy="${s.id}" ${canBuy ? '' : 'disabled'}>매수 ${coin(cost)}</button>
      <button class="btn sell" data-sell="${s.id}" ${sellQ > 0 ? '' : 'disabled'}>매도 ${sellQ > 0 ? coin('+' + proceeds) : ''}</button>
    </div>
  </div>`;
}

function drawMiniChart(c, hist, open, avg, holding) {
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = '#16121c';
  ctx.fillRect(0, 0, W, H);
  let lo = Math.min(open, ...hist);
  let hi = Math.max(open, ...hist);
  if (holding) {
    lo = Math.min(lo, avg);
    hi = Math.max(hi, avg);
  }
  const span = Math.max(hi - lo, open * 0.02);
  const mid = (hi + lo) / 2;
  lo = mid - span * 0.6;
  hi = mid + span * 0.6;
  const Y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const X = (i) => (i / Math.max(1, hist.length - 1)) * W;
  const hline = (v, color, dash) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, Y(v));
    ctx.lineTo(W, Y(v));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  hline(open, 'rgba(170,165,185,0.4)', [6, 8]);
  if (holding) hline(avg, '#ffd34d', [12, 6]);
  ctx.lineWidth = 4;
  for (let i = 1; i < hist.length; i++) {
    ctx.strokeStyle = (hist[i] + hist[i - 1]) / 2 >= open ? UP : DOWN;
    ctx.beginPath();
    ctx.moveTo(X(i - 1), Y(hist[i - 1]));
    ctx.lineTo(X(i), Y(hist[i]));
    ctx.stroke();
  }
}

function flash(b) {
  b.classList.add('flash');
}

// ---------------- 일시정지 ----------------
export function showPause(run, save, { onResume, onQuit, onSettingsChange }) {
  const el = open(
    `<div class="panel">
      <h2>일시정지</h2>
      <div class="muted">${fmtTime(run.t)} · Lv${run.player.level} · ${run.kills}킬 · ${coin(run.player.coins)}</div>
      ${weaponList(run)}
      ${settingsHtml(save)}
      <div class="col">
        <button class="btn big primary" data-act="resume">계속</button>
        <button class="btn danger" data-act="quit">촬영 포기 (보유주 청산)</button>
      </div>
    </div>`,
    'dim',
  );
  on(el, '[data-act=resume]', onResume);
  let armed = false;
  on(el, '[data-act=quit]', (b) => {
    if (!armed) {
      armed = true;
      b.textContent = '정말 포기? 한 번 더 누르세요';
      return;
    }
    onQuit();
  });
  bindSettings(el, save, onSettingsChange);
}

function weaponList(run) {
  const pl = run.player;
  const ws = pl.weapons.map((w) => `<span class="chip"><img src="${spriteURL(describeChoice({ kind: 'weapon', id: w.id, level: w.level }).icon, 2)}" alt="">Lv${w.level}</span>`);
  const ps = Object.entries(pl.passives).map(([id, lv]) => `<span class="chip"><img src="${spriteURL(describeChoice({ kind: 'passive', id, level: lv }).icon, 2)}" alt="">Lv${lv}</span>`);
  return `<div class="chips">${ws.join('')}${ps.join('')}</div>`;
}

function settingsHtml(save) {
  const s = save.settings;
  const seg = (key, val, label) => `<button class="seg ${s[key] === val ? 'on' : ''}" data-set="${key}:${val}">${label}</button>`;
  return `<div class="settings">
    <div class="srow"><span>효과음</span><span>${seg('sound', true, '켜기')}${seg('sound', false, '끄기')}</span></div>
    <div class="srow"><span>음악</span><span>${seg('music', true, '켜기')}${seg('music', false, '끄기')}</span></div>
    <div class="srow"><span>차트 위치</span><span>${seg('chart', 'auto', '자동')}${seg('chart', 'top', '위')}${seg('chart', 'bottom', '아래')}</span></div>
  </div>`;
}

function bindSettings(el, save, onChange) {
  on(el, '[data-set]', (b) => {
    const [key, raw] = b.dataset.set.split(':');
    const val = raw === 'true' ? true : raw === 'false' ? false : raw;
    save.settings[key] = val;
    onChange(key, val);
    el.querySelectorAll(`[data-set^="${key}:"]`).forEach((x) => x.classList.toggle('on', x === b));
  });
}

export function showSettings(save, { onBack, onChange, onReset }) {
  const el = open(
    `<div class="panel">
      <h2>설정</h2>
      ${settingsHtml(save)}
      <div class="muted small">차트 위치 '자동' = 엄지가 닿는 반대쪽으로 바가 이동</div>
      <div class="col">
        <button class="btn primary" data-act="back">돌아가기</button>
        <button class="btn danger" data-act="reset">기록·금고 초기화</button>
      </div>
    </div>`,
    'dim',
  );
  bindSettings(el, save, onChange);
  on(el, '[data-act=back]', onBack);
  let armed = false;
  on(el, '[data-act=reset]', (b) => {
    if (!armed) {
      armed = true;
      b.textContent = '정말 초기화? 한 번 더 누르세요';
      return;
    }
    onReset();
  });
}

// ---------------- NG / 클리어 ----------------
const NG = [
  '재키가 바나나 껍질을 밟았다',
  '사다리에 걸려 넘어졌다',
  '스턴트 실패! 병원 직행',
  '대사를 까먹었다',
  '의자가 너무 무거웠다',
  '국수를 먹다 사레들렸다',
  '감독: "컷! 다시 갑시다"',
];

export function showResult(res, save, { onRetry, onVault, onTitle }) {
  const clear = res.outcome === 'clear';
  const title = clear ? '컷! 오케이!' : 'NG!';
  const sub = clear ? '완벽한 한 테이크. 경찰이 도착했다' : res.outcome === 'quit' ? '촬영 중단' : NG[Math.floor(Math.random() * NG.length)];
  const best = res.bestTrade ? `${res.bestTrade.id} ${res.bestTrade.qty}주 ${signed(res.bestTrade.pnl)}` : '-';
  const el = open(
    `<div class="panel result">
      <div class="ng ${clear ? 'ok' : ''}">${title}</div>
      <div class="muted">${esc(sub)}</div>
      <img class="hero small" src="${spriteURL(clear ? 'jacky_pose' : 'jacky_hurt', 5)}" alt="">
      <canvas class="runchart" width="660" height="220"></canvas>
      <div class="legend"><span style="color:#ff9a3d">━ 연꽃전자</span> <span style="color:#c77dff">━ 드래곤국수</span> <span class="muted">▲매수 ▼매도</span></div>
      <table class="stats">
        <tr><td>생존</td><td>${fmtTime(res.time)}</td><td>레벨</td><td>${res.level}</td></tr>
        <tr><td>처치</td><td>${res.kills}</td><td>보스</td><td>${res.bosses}</td></tr>
        <tr><td>투자 손익</td><td style="color:${res.tradePnl >= 0 ? UP : DOWN}">${signed(res.tradePnl)}</td><td>최고 거래</td><td>${esc(best)}</td></tr>
        <tr><td>강제청산</td><td>${coin(res.liquidation)}</td><td>매매 횟수</td><td>${res.trades.length}</td></tr>
        ${res.seedBack ? `<tr><td>시드머니 반납</td><td>-${res.seedBack}</td><td></td><td></td></tr>` : ''}
      </table>
      <div class="deposit">금고 입금 ${coin('+' + res.deposit)} <span class="muted">→ ${coin(save.vault)}</span></div>
      <div class="col">
        <button class="btn big primary" data-act="retry">다시 촬영</button>
        <div class="row"><button class="btn" data-act="vault">금고</button><button class="btn" data-act="title">타이틀</button></div>
      </div>
    </div>`,
    'dim',
  );
  drawRunChart(el.querySelector('.runchart'), res);
  on(el, '[data-act=retry]', onRetry);
  on(el, '[data-act=vault]', onVault);
  on(el, '[data-act=title]', onTitle);
}

function drawRunChart(c, res) {
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = '#16121c';
  ctx.fillRect(0, 0, W, H);
  const colors = { LTS: '#ff9a3d', DGN: '#c77dff' };
  const series = res.history.map((s) => ({ ...s, pct: s.runHistory.map((p) => p / s.open - 1) }));
  let lo = 0;
  let hi = 0;
  for (const s of series) for (const v of s.pct) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = Math.max(0.1, hi - lo);
  lo -= span * 0.08;
  hi += span * 0.08;
  const dur = Math.max(1, res.time);
  const Y = (v) => H - 14 - ((v - lo) / (hi - lo)) * (H - 28);
  const X = (t) => 10 + (t / dur) * (W - 20);
  ctx.strokeStyle = 'rgba(170,165,185,0.4)';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, Y(0));
  ctx.lineTo(W, Y(0));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  for (const s of series) {
    ctx.strokeStyle = colors[s.id] || '#fff';
    ctx.beginPath();
    s.pct.forEach((v, i) => {
      const x = X(i * 2);
      if (i === 0) ctx.moveTo(x, Y(v));
      else ctx.lineTo(x, Y(v));
    });
    ctx.stroke();
  }
  // 매매 표시
  for (const tr of res.trades) {
    const s = series.find((x) => x.id === tr.id);
    if (!s) continue;
    const x = X(tr.t);
    const y = Y(tr.price / s.open - 1);
    ctx.fillStyle = tr.side === 'buy' ? UP : DOWN;
    ctx.beginPath();
    if (tr.side === 'buy') {
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x - 7, y + 16);
      ctx.lineTo(x + 7, y + 16);
    } else {
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x - 7, y - 16);
      ctx.lineTo(x + 7, y - 16);
    }
    ctx.fill();
  }
  ctx.fillStyle = '#8a839a';
  ctx.font = '20px Galmuri11, sans-serif';
  ctx.fillText(`${(hi * 100).toFixed(0)}%`, 12, 22);
  ctx.fillText(`${(lo * 100).toFixed(0)}%`, 12, H - 8);
}

// ---------------- 금고 (영구 업그레이드) ----------------
export function showVault(save, { onBuy, onBack }) {
  const el = open('<div class="panel vault"></div>', 'dim');
  const panel = el.firstElementChild;
  function render() {
    const rows = META.map((m) => {
      const lv = save.upgrades[m.id] || 0;
      const maxed = lv >= m.max;
      const cost = maxed ? 0 : m.cost(lv);
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="item">
        <div class="ctext"><div class="cname">${esc(m.name)} <span class="pips">${pips}</span></div>
        <div class="cdesc">${esc(lv ? m.desc(lv) : '미습득')}${maxed ? '' : ` → <b>${esc(m.desc(lv + 1))}</b>`}</div></div>
        <button class="btn small ${!maxed && save.vault >= cost ? 'primary' : ''}" data-buy="${m.id}" ${maxed || save.vault < cost ? 'disabled' : ''}>${maxed ? 'MAX' : coin(cost)}</button>
      </div>`;
    }).join('');
    panel.innerHTML = `<h2>금고</h2><div class="wallet">${coin(save.vault)}</div><div class="bbody">${rows}</div>
      <button class="btn primary" data-act="back">돌아가기</button>`;
    on(panel, '[data-buy]', (b) => {
      onBuy(b.dataset.buy);
      render();
    });
    on(panel, '[data-act=back]', onBack);
  }
  render();
}

// ---------------- 토스트 ----------------
export function toast(text, color = '#ffd34d') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.color = color;
  t.textContent = text;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
