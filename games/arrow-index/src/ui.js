// ── DOM 오버레이: 타이틀, 레벨업, 일시정지, 결과 ────────────────────
const $ = id => document.getElementById(id);

const UI = {
  choices: [],
  openedAt: 0,

  init() {
    this.icons = {};
    const tap = (el, fn) => el.addEventListener('click', e => { e.preventDefault(); Sfx.unlock(); Sfx.play('ui'); fn(e); });
    tap($('btnStart'), () => this.start());
    tap($('btnSound'), () => { Sfx.setOn(!Sfx.on); this.syncSound(); });
    tap($('btnSound2'), () => { Sfx.setOn(!Sfx.on); this.syncSound(); });
    tap($('btnResume'), () => this.resume());
    tap($('btnQuit'), () => {
      const b = $('btnQuit');
      if (b.dataset.armed) { this.toTitle(); return; }
      b.dataset.armed = '1';
      b.textContent = '한 번 더 누르면 포기';
      setTimeout(() => { delete b.dataset.armed; b.textContent = '포기하고 타이틀로'; }, 2500);
    });
    tap($('btnRetry'), () => this.start());
    tap($('btnTitle'), () => this.toTitle());
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') this.pause(); });
    this.syncSound();
  },

  icon(name) {
    if (!this.icons[name]) this.icons[name] = Gfx.iconURL(name);
    return this.icons[name];
  },

  show(id) {
    for (const s of ['title', 'lv', 'pause', 'over']) $(s).hidden = s !== id;
  },
  hideAll() { this.show(null); },

  syncSound() {
    for (const id of ['btnSound', 'btnSound2']) {
      $(id).textContent = Sfx.on ? '소리 켜짐' : '소리 꺼짐';
      $(id).setAttribute('aria-pressed', Sfx.on ? 'true' : 'false');
    }
  },

  showTitle() {
    this.show('title');
    const recs = Store.get('records', []);
    const ol = $('records');
    ol.innerHTML = '';
    if (!recs.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 기록이 없습니다. 첫 출정이 1위가 됩니다.';
      ol.appendChild(li);
    } else {
      recs.slice(0, 5).forEach((r, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<b>${i + 1}</b><span class="t">${fmtTime(r.time)}</span><span>LV ${r.level}</span><span>처치 ${fmtInt(r.kills)}</span>${r.win ? '<em>완주</em>' : ''}`;
        ol.appendChild(li);
      });
    }
  },

  start() {
    Sfx.unlock();
    this.hideAll();
    Input.reset();
    newRun();
    if (QS.has('t')) Debug.warp(+QS.get('t'));
  },

  toTitle() {
    Input.reset();
    newRun();
    G.state = 'title';
    this.showTitle();
  },

  pause() {
    if (G.state !== 'play') return;
    Input.reset();
    G.state = 'paused';
    this.renderBuild($('pauseBuild'));
    const S = STAGES[G.stage];
    $('pauseInfo').textContent = `${fmtTime(G.t)} · STAGE ${S.roman} ${S.name} · LV ${G.level} · 처치 ${fmtInt(G.kills)}`;
    $('btnQuit').textContent = '포기하고 타이틀로';
    delete $('btnQuit').dataset.armed;
    this.show('pause');
  },
  resume() {
    if (G.state !== 'paused') return;
    this.hideAll();
    G.state = 'play';
    slowmo(0.35, 0.3);
  },

  renderBuild(el) {
    el.innerHTML = '';
    const add = (icon, name, L, max) => {
      const d = document.createElement('div');
      d.className = 'chip';
      d.innerHTML = `<img alt="" src="${this.icon(icon)}"><span>${name}</span><i>${L}/${max}</i>`;
      el.appendChild(d);
    };
    for (const w of G.weapons) add(WEAPONS[w.id].icon, WEAPONS[w.id].name, w.L, WEAPON_MAX);
    for (const id in G.passive) add(PASSIVES[id].icon, PASSIVES[id].name, G.passive[id], PASSIVES[id].max);
  },

  openLevelUp() {
    const chest = G.pendingLv <= 0 && G.pendingChest > 0;
    if (chest) G.pendingChest--; else G.pendingLv--;
    G.state = 'levelup';
    Input.reset();
    Sfx.play(chest ? 'open' : 'level');
    fxRing(G.p.x, G.p.y, 3, 60, 0.5, 2);
    this.choices = upgradeChoices(3);
    $('lvTitle').textContent = chest ? '보물 상자' : 'LEVEL UP';
    $('lvSub').textContent = chest ? '신의 유물을 하나 고르세요' : 'LV ' + (G.level - G.pendingLv) + ' · 하나를 고르세요';
    const box = $('cards');
    box.innerHTML = '';
    this.choices.forEach((c, i) => {
      const info = choiceInfo(c);
      const b = document.createElement('button');
      b.className = 'card';
      b.style.animationDelay = i * 60 + 'ms';
      let pips = '';
      if (info.max) for (let k = 1; k <= info.max; k++) pips += `<i class="${k < info.lv ? 'on' : k === info.lv ? 'new' : ''}"></i>`;
      b.innerHTML = `<img alt="" src="${this.icon(info.icon)}">` +
        `<span class="body"><span class="row"><b>${info.name}</b>${info.isNew ? '<em>NEW</em>' : ''}<small class="tag ${info.tag === '시장' ? 'mkt' : ''}">${info.tag}</small></span>` +
        `<span class="desc">${info.desc}</span>${pips ? `<span class="pips">${pips}</span>` : ''}</span>` +
        `<kbd>${i + 1}</kbd>`;
      b.addEventListener('click', e => { e.preventDefault(); this.pickCard(i); });
      box.appendChild(b);
    });
    this.renderBuild($('lvBuild'));
    this.openedAt = performance.now();
    this.show('lv');
  },

  pickCard(i) {
    if (G.state !== 'levelup') return;
    // 조이스틱을 떼는 손가락이 카드를 잘못 누르지 않도록 잠깐 잠근다
    if (performance.now() - this.openedAt < 320) return;
    const c = this.choices[i];
    if (!c) return;
    const btn = $('cards').children[i];
    if (btn) btn.classList.add('picked');
    applyChoice(c);
    Sfx.play('pick');
    G.state = 'pickwait';
    setTimeout(() => {
      this.hideAll();
      G.state = 'play';
      if (G.pendingLv > 0 || G.pendingChest > 0) { G.lvDelay = 0.1; }
      else slowmo(0.4, 0.25);
      fxRing(G.p.x, G.p.y, 4, 90, 0.5, 1);
      // 레벨업 충격파: 주변 적을 밀어낸다
      for (const e of G.enemies) {
        if (e.dead || e.boss || e.seg) continue;
        const d = Math.hypot(e.x - G.p.x, e.y - G.p.y);
        if (d < 70) { const f = (1 - d / 70) * 180 / (d || 1); e.kx += (e.x - G.p.x) * f; e.ky += (e.y - G.p.y) * f; }
      }
    }, 170);
  },

  showOver(win) {
    if (G.state === 'over') return;
    G.state = 'over';
    const rec = { time: Math.min(RUN_LEN, G.t), level: G.level, kills: G.kills, win, trades: Market.trades, best: Market.bestRatio, net: Math.round(Market.netGain), date: new Date().toISOString().slice(0, 10) };
    const recs = Store.get('records', []);
    recs.push(rec);
    recs.sort((a, b) => b.time - a.time || b.kills - a.kills);
    const rank = recs.indexOf(rec) + 1;
    Store.set('records', recs.slice(0, 10));
    $('overTitle').textContent = win ? '신화를 넘어섰다' : '쓰러졌다';
    $('overTime').textContent = fmtTime(rec.time);
    $('overRank').textContent = rank === 1 ? '신기록' : rank <= 10 ? rank + '위' : '순위 밖';
    $('overRank').className = rank === 1 ? 'rank best' : 'rank';
    const S = STAGES[G.stage];
    const rows = [
      ['도달', `STAGE ${S.roman} ${S.name}`],
      ['레벨', 'LV ' + G.level],
      ['처치', fmtInt(G.kills) + ' (보스 ' + G.bossKills + ')'],
      ['거래', Market.trades + '회'],
      ['최고 매도 배율', Market.trades ? '×' + Market.bestRatio.toFixed(2) : '—'],
      ['거래 손익', (Market.netGain >= 0 ? '+' : '') + fmtInt(Market.netGain) + ' EXP'],
    ];
    $('overStats').innerHTML = rows.map(([k, v], i) => `<dt>${k}</dt><dd class="${i === 5 ? (Market.netGain >= 0 ? 'up' : 'down') : ''}">${v}</dd>`).join('');
    this.show('over');
    if (Bot.on) console.log('BOT_RESULT ' + JSON.stringify(rec));
  },
};

function openLevelUp() { UI.openLevelUp(); }

// 테스트용 시간 점프 (?t=초)
const Debug = {
  warp(t) {
    G.t = t;
    G.stage = Math.min(STAGES.length - 1, Math.floor(t / STAGE_LEN));
    Director.rotatePool();
    for (let s = 0; s < G.stage; s++) Director.bossDone[s] = true;
    const ids = Object.keys(WEAPONS);
    for (let i = 0; i < Math.min(5, 1 + G.stage); i++) {
      const w = G.weapons.find(x => x.id === ids[i]) || addWeapon(ids[i]);
      w.L = Math.min(WEAPON_MAX, 1 + G.stage * 2);
      if (w.id === 'falcon') syncFalcons(w);
    }
    for (const id of ['might', 'haste', 'vital', 'armor']) G.passive[id] = Math.min(PASSIVES[id].max, G.stage);
    G.p.maxHp = 100 + 20 * (G.passive.vital || 0); G.p.hp = G.p.maxHp;
    G.level = 1 + G.stage * 10;
    G.xpNext = xpNeed(G.level);
  },
};
