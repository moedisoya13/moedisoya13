// ── 자동 플레이 (밸런스 점검용: ?bot&speed=8) ──────────────────────────
const Bot = {
  on: QS.has('bot'),
  speed: Math.max(1, +(QS.get('speed') || 1)),
  holdT: 0, heldFor: 0,
  last: [1, 0],
  move() {
    // 16방향 표본: 22px 앞의 위험도(적·탄)와 보석 끌림, 관성을 합산해 가장 나은 쪽으로
    const p = G.p;
    let gem = null, gd = 1e9;
    for (const g of G.gems) { const d = dist2(g.x, g.y, p.x, p.y); if (d < gd) { gd = d; gem = g; } }
    for (const it of G.items) { const d = dist2(it.x, it.y, p.x, p.y) * 0.25; if (d < gd) { gd = d; gem = it; } }
    let best = null, bs = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      const nx = p.x + dx * 22, ny = p.y + dy * 22;
      let s = 0;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d2 = dist2(nx, ny, e.x, e.y);
        if (d2 < 70 * 70) s -= ((e.boss || e.seg) ? 5 : e.elite ? 2 : 1) * 500 / (d2 + 25);
      }
      for (const b of G.ebullets) {
        const d2 = dist2(nx, ny, b.x + b.vx * 0.3, b.y + b.vy * 0.3);
        if (d2 < 40 * 40) s -= 900 / (d2 + 10);
      }
      if (gem) s += 1.2 * (1 - Math.min(1, Math.hypot(gem.x - nx, gem.y - ny) / 260));
      s += 0.35 * (dx * this.last[0] + dy * this.last[1]);
      if (s > bs) { bs = s; best = [dx, dy]; }
    }
    this.last = best;
    return { x: best[0], y: best[1] };
  },
  update(rdt) {
    if (G.state === 'levelup' && performance.now() - UI.openedAt > 350) {
      const score = c => c.kind === 'w' ? (G.weapons.some(w => w.id === c.id) ? 3 : G.weapons.length < 4 ? 2.5 : 1) : c.kind === 'p' ? (['might', 'haste', 'vital', 'armor', 'magnet', 'area', 'multishot'].includes(c.id) ? 2 : 0.5) : 0;
      let bi = 0;
      UI.choices.forEach((c, i) => { if (score(c) + Math.random() * 0.3 > score(UI.choices[bi])) bi = i; });
      UI.pickCard(bi);
    }
    if (G.state !== 'play') return;
    const M = Market;
    if (M.frozen) {
      this.holdT -= rdt * this.speed;
      if (this.holdT <= 0) HUD.buyUp();
    } else if (M.shares > 0) {
      this.heldFor += rdt * this.speed;
      const r = M.ratioNow();
      if (r > 1.14 || r < 0.86 || this.heldFor > 45) { HUD.sellDown(); this.heldFor = 0; }
    } else if (M.price < 940) {
      HUD.buyDown();
      this.holdT = rand(4, 9);
    }
  },
};

// ── 부팅 & 루프 ────────────────────────────────────────────────
let lastT = 0;

function boot() {
  cv = $('cv');
  ctx = cv.getContext('2d', { alpha: false });
  Gfx.init();
  Sfx.on = Store.get('sound', true);
  Haptic.init();
  Input.init(cv);
  UI.init();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  newRun();
  G.state = 'title';
  UI.showTitle();
  if (Bot.on) setTimeout(() => UI.start(), 300);
  const go = () => requestAnimationFrame(loop);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('700 12px Galmuri11')]).then(go, go);
  } else go();
}

function loop(now) {
  const rdt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
  lastT = now;
  View.frame++;
  const t0 = performance.now();
  try {
    step(rdt);
    draw();
  } catch (err) {
    console.error(err);
  }
  const pf = window.__perf;
  if (pf) { const d = performance.now() - t0; pf.n++; pf.sum += d; pf.max = Math.max(pf.max, d); }
  requestAnimationFrame(loop);
}

function step(rdt) {
  Sfx.update(rdt);
  let ts = 1;
  if (G.hitstop > 0) { G.hitstop -= rdt; ts = 0.05; }
  else if (G.slowmo) {
    G.slowmo.t -= rdt;
    const k = clamp(G.slowmo.t / G.slowmo.dur, 0, 1);
    ts = lerp(1, G.slowmo.min, easeInCubic(k));
    if (G.slowmo.t <= 0) G.slowmo = null;
  }
  G.shake = Math.max(0, G.shake - rdt * 1.8);
  G.kickX = damp(G.kickX || 0, 0, 16, rdt);
  G.kickY = damp(G.kickY || 0, 0, 16, rdt);
  G.invert = Math.max(0, G.invert - rdt);
  const live = G.state === 'play' || G.state === 'dying' || G.state === 'winning';
  if (live) {
    const n = Bot.on ? Bot.speed : 1;
    for (let i = 0; i < n && (G.state === 'play' || G.state === 'dying' || G.state === 'winning'); i++) simStep(rdt * ts);
    if (G.state === 'dying') { G.deathT += rdt; if (G.deathT > 1.9) UI.showOver(false); }
    if (G.state === 'winning') { G.endT += rdt; if (G.endT > 3.2) UI.showOver(true); }
  } else if (G.state === 'title') {
    // 타이틀 뒤 배경: 궁수가 숨 쉬고 땅이 천천히 흐른다
    G.cam.x += rdt * 6; G.cam.y += rdt * 2;
    G.p.x = G.cam.x; G.p.y = G.cam.y;
    G.p.animT += rdt * 1.6;
    updateParts(rdt);
  }
  HUD.update(rdt);
  if (Bot.on) Bot.update(rdt);
}

function draw() {
  drawWorld();
  if (G.state !== 'title') HUD.draw();
  if (G.invert > 0 && !REDUCED) {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, View.W, View.H);
    ctx.globalCompositeOperation = 'source-over';
  }
}

window.__AI = { G, Market, Bot, UI };
boot();
