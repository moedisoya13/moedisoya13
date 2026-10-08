// ── 게임 상태와 시뮬레이션 ─────────────────────────────────────────
const G = {
  state: 'title',
  t: 0, stage: 0,
  passive: {},
  weapons: [],
  enemies: [], arrows: [], ebullets: [], gems: [], items: [], parts: [], fx: [], nums: [],
  traps: [], falcons: [], uiParts: [], timers: [],
  grid: new Grid(24),
};

const Stat = {
  might: () => 1 + 0.1 * (G.passive.might || 0),
  cd: () => Math.pow(0.93, G.passive.haste || 0),
  amount: () => G.passive.multishot || 0,
  area: () => 1 + 0.1 * (G.passive.area || 0),
  pierce: () => G.passive.fletch || 0,
  pspeed: () => 1 + 0.15 * (G.passive.fletch || 0),
  magnet: () => 30 * (1 + 0.35 * (G.passive.magnet || 0)),
  speed: () => 64 * (1 + 0.08 * (G.passive.swift || 0)),
  armor: () => G.passive.armor || 0,
  regen: () => 0.3 * (G.passive.regen || 0),
};

const xpNeed = L => Math.round(5 + (L - 1) * 5.5 + Math.pow(L - 1, 1.6) * 0.45);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function newRun() {
  Object.assign(G, {
    t: 0, stage: 0, passive: {}, weapons: [],
    enemies: [], arrows: [], ebullets: [], gems: [], items: [], parts: [], fx: [], nums: [],
    traps: [], falcons: [], uiParts: [], timers: [],
    level: 1, xp: 0, xpShown: 0, xpNext: xpNeed(1), kills: 0,
    pendingLv: 0, pendingChest: 0, lvDelay: 0,
    hitstop: 0, slowmo: null, shake: 0, invert: 0, flashW: 0, kickX: 0, kickY: 0, lastStop: 0,
    boss: null, banner: null,
    deathT: 0, endT: 0, dmgDealt: 0, xpEarned: 0, nextId: 1,
    featherT: 0, featherOn: false, featherR: 0, featherA: 0,
    bossOrder: shuffle(Object.keys(BOSSES)), bossKills: 0,
  });
  const forced = QS.get('boss');
  if (forced && BOSSES[forced]) G.bossOrder = [forced, ...G.bossOrder.filter(k => k !== forced)];
  G.p = {
    x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, r: 4, face: 1, aim: 0,
    draw: 0, recoil: 0, invuln: 0, hurtT: 0, animT: 0, sq: new Spring(1, 420, 20),
    slowT: 0, moving: false, stepT: 0, wasMoving: false,
  };
  G.cam = { x: 0, y: 0 };
  Market.reset();
  Director.reset();
  addWeapon('bow');
  G.state = 'play';
  showBanner('STAGE ' + STAGES[0].roman, STAGES[0].name + ' · ' + STAGES[0].sub);
}

function later(t, fn) { G.timers.push({ t, fn }); }

function showBanner(title, sub, kind = 'stage') {
  G.banner = { title, sub, kind, t: 0, dur: kind === 'boss' ? 2.4 : 2.8 };
}

function addShake(v) { G.shake = Math.min(1, G.shake + v * (REDUCED ? 0.3 : 1)); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }
function slowmo(dur, min) { G.slowmo = { t: dur, dur, min }; }

// ── 시간 진행 ──
function simStep(dt) {
  const p = G.p;
  G.t += dt;

  // 스테이지 전환
  const st = Math.min(STAGES.length - 1, Math.floor(G.t / STAGE_LEN));
  if (st !== G.stage) stageChange(st);
  if (G.t >= RUN_LEN && G.state === 'play') { winRun(); }

  for (let i = G.timers.length - 1; i >= 0; i--) {
    const tm = G.timers[i];
    tm.t -= dt;
    if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); }
  }

  if (G.state === 'play') {
    updatePlayer(dt);
    Market.update(dt);
    Director.update(dt);
    updateWeapons(dt);
  }
  updateEnemies(dt);
  updateArrows(dt);
  updateBullets(dt);
  updateGems(dt);
  updateItems(dt);
  updateTraps(dt);
  updateParts(dt);
  updateFx(dt);
  updateNums(dt);

  // 카메라: 살짝 앞을 내다보며 따라간다
  const lx = p.vx * 0.22, ly = p.vy * 0.22;
  G.cam.x = damp(G.cam.x, p.x + lx, 6, dt);
  G.cam.y = damp(G.cam.y, p.y + ly, 6, dt);

  // 레벨업 대기열
  if (G.state === 'play' && (G.pendingLv > 0 || G.pendingChest > 0)) {
    G.lvDelay += dt;
    if (G.lvDelay > 0.22) { G.lvDelay = 0; openLevelUp(); }
  }
}

// ── 플레이어 ──
function updatePlayer(dt) {
  const p = G.p;
  const mv = Input.move();
  const spd = Stat.speed() * (p.slowT > 0 ? 0.45 : 1);
  p.vx = damp(p.vx, mv.x * spd, 14, dt);
  p.vy = damp(p.vy, mv.y * spd, 14, dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const sp = Math.hypot(p.vx, p.vy);
  p.moving = sp > 8;
  if (p.moving && !p.wasMoving) { p.sq.v = 0.82; } // 출발 스쿼시
  if (!p.moving && p.wasMoving) { p.sq.v = 1.12; }
  p.wasMoving = p.moving;
  if (p.draw > 0.05) p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
  else if (Math.abs(p.vx) > 6) p.face = p.vx > 0 ? 1 : -1;
  p.animT += dt * (p.moving ? 4 + sp / 9 : 1.6);
  p.sq.t = 1 - 0.08 * p.draw;
  p.sq.step(dt);
  p.recoil = damp(p.recoil, 0, 11, dt);
  p.invuln -= dt;
  p.hurtT -= dt;
  p.slowT -= dt;
  if (p.moving) {
    p.stepT -= dt * sp / 60;
    if (p.stepT <= 0) {
      p.stepT = 0.28;
      // 발밑 먼지
      for (let i = 0; i < 2; i++) spawnPart(p.x - p.face * 2 + rand(-1, 1), p.y + 7, -p.vx * 0.1 + rand(-6, 6), rand(-4, 4), rand(8, 20), 0.35, 'dust');
    }
  }
  const rg = Stat.regen();
  if (rg) p.hp = Math.min(p.maxHp, p.hp + rg * dt);
}

function hurtPlayer(dmg, sx, sy) {
  const p = G.p;
  if (p.invuln > 0 || G.state !== 'play') return;
  dmg = Math.max(1, dmg - Stat.armor());
  p.hp -= dmg;
  p.invuln = 0.6;
  p.hurtT = 0.25;
  p.sq.v = 0.7;
  addShake(0.42);
  hitstop(0.06);
  G.invert = Math.max(G.invert, 0.06);
  Sfx.play('hurt');
  // 주변 적을 살짝 밀어낸다
  G.grid.query(p.x, p.y, 22, e => {
    if (e.dead || e.boss || e.seg) return;
    const a = angleTo(p.x, p.y, e.x, e.y);
    e.kx += Math.cos(a) * 70; e.ky += Math.sin(a) * 70;
  });
  for (let i = 0; i < 10; i++) {
    const a = rand(TAU);
    spawnPart(p.x, p.y, Math.cos(a) * rand(40, 90), Math.sin(a) * rand(40, 90), rand(20, 70), rand(0.3, 0.6), 'px');
  }
  if (p.hp <= 0) { p.hp = 0; die(); }
}

function healPlayer(v) {
  const p = G.p;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + v);
  const got = Math.round(p.hp - before);
  if (got > 0) floatText(p.x, p.y - 12, '+' + got + ' HP');
}

function die() {
  G.state = 'dying';
  G.deathT = 0;
  Input.reset();
  Market.buyEnd();
  slowmo(1.6, 0.12);
  addShake(1);
  G.invert = 0.12;
  Sfx.play('die');
  shatterBitmap('archer', 0, G.p.x, G.p.y, G.p.face, 0, -1, 1.4, 'n');
  G.p.dead = true;
}

function winRun() {
  G.state = 'winning';
  G.endT = 0;
  Input.reset();
  Market.buyEnd();
  Sfx.play('win');
  G.invert = 0.1;
  let i = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - G.p.x, e.y - G.p.y);
    later(Math.min(2.2, d / 160) + (i++ % 7) * 0.01, () => { if (!e.dead) killEnemy(e, 0, -1, true); });
  }
  G.ebullets.length = 0;
}

// ── 경험치 ──
function addXP(v) {
  G.xp += v;
  G.xpEarned += v;
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = xpNeed(G.level);
    G.pendingLv++;
  }
}

// ── 스테이지 ──
function stageChange(st) {
  G.stage = st;
  const S = STAGES[st];
  showBanner('STAGE ' + S.roman, S.name + ' · ' + S.sub);
  Sfx.play('stage');
  addShake(0.35);
  fxRing(G.p.x, G.p.y, 4, 160, 0.8, 2);
  // 차원 전환 충격파: 가까운 적을 밀어내고 깎는다
  for (const e of G.enemies) {
    if (e.dead || e.boss || e.seg) continue;
    const d = Math.hypot(e.x - G.p.x, e.y - G.p.y) || 1;
    if (d < 140) {
      const f = (1 - d / 140) * 260;
      e.kx += ((e.x - G.p.x) / d) * f; e.ky += ((e.y - G.p.y) / d) * f;
      later(d / 300, () => { if (!e.dead) hurtEnemy(e, e.maxHp * 0.3, (e.x - G.p.x) / d, (e.y - G.p.y) / d, 0, { nocrit: true, raw: true, silent: true }); });
    }
  }
  G.ebullets.length = 0;
  healPlayer(15);
  Director.rotatePool();
}

// ── 적 ──
function spawnEnemy(type, x, y, opts = {}) {
  const d = ENEMIES[type];
  const tm = G.t / 60;
  const hpMul = (1 + tm * 0.1 + G.stage * 0.1) * (opts.elite ? 10 : 1);
  const bm = Gfx.bitmaps[type][0];
  const e = {
    id: G.nextId++, type, d, x, y, vx: 0, vy: 0, kx: 0, ky: 0, z: 0,
    hp: d.hp * hpMul, maxHp: d.hp * hpMul, r: d.r * (opts.elite ? 1.15 : 1),
    spd: d.spd * (1 + tm * 0.006) * (opts.elite ? 1.08 : 1) * rand(0.9, 1.1),
    dmg: d.dmg * (1 + tm * 0.035) * (opts.elite ? 1.5 : 1),
    xp: d.xp * (opts.elite ? 14 : 1),
    elite: !!opts.elite, flash: 0, sq: new Spring(1, 300, 13), animT: rand(10), seed: rand(1000),
    spawnT: opts.fade ? 0 : 1, face: 1, st: 0, t: 0, next: rand(1, 3), hitCd: {}, rootT: 0, slowT: 0,
    w: bm.w, h: bm.h,
  };
  if (opts.kx) { e.kx = opts.kx; e.ky = opts.ky; }
  G.enemies.push(e);
  return e;
}

// 시야 사각형 바깥 둘레의 임의 점
function edgePoint(margin = 18) {
  const hw = View.vw / 2 + margin, hh = View.vh / 2 + margin;
  const per = 4 * (hw + hh);
  let u = rand(per);
  let x, y;
  if (u < 2 * hw) { x = -hw + u; y = -hh; }
  else if ((u -= 2 * hw) < 2 * hh) { x = hw; y = -hh + u; }
  else if ((u -= 2 * hh) < 2 * hw) { x = hw - u; y = hh; }
  else { u -= 2 * hw; x = -hw; y = hh - u; }
  // 이동 방향 쪽에 조금 더 자주
  const p = G.p;
  if (Math.hypot(p.vx, p.vy) > 20 && chance(0.35)) {
    const a = Math.atan2(p.vy, p.vx) + rand(-0.6, 0.6);
    const R = Math.hypot(hw, hh);
    x = Math.cos(a) * R; y = Math.sin(a) * R;
  }
  return [G.cam.x + x, G.cam.y + y];
}

function updateEnemies(dt) {
  const p = G.p;
  const grid = G.grid;
  grid.clear();
  for (const e of G.enemies) if (!e.dead) grid.insert(e);
  const farR = Math.max(View.vw, View.vh) * 0.85 + 60;

  for (const e of G.enemies) {
    if (e.dead) continue;
    e.t += dt; e.animT += dt;
    e.flash -= dt;
    e.sq.step(dt);
    if (e.spawnT < 1) e.spawnT = Math.min(1, e.spawnT + dt * 2.6);
    e.rootT -= dt; e.slowT -= dt;

    if (e.freezeT > 0) {
      // 피격 경직: 제자리에서 떨다가 끝나는 순간 넉백이 한꺼번에 들어간다
      e.freezeT -= dt;
      e.jit = rand(-0.9, 0.9);
      if (e.freezeT <= 0) { e.kx += e.pkx; e.ky += e.pky; e.pkx = e.pky = 0; e.jit = 0; }
      continue;
    }
    if (e.boss) updateBoss(e, dt);
    else if (!e.seg) moveEnemy(e, dt);

    // 넉백
    if (!e.seg) {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const kd = 1 - Math.exp(-9 * dt);
      e.kx -= e.kx * kd; e.ky -= e.ky * kd;
    }

    // 분리 (겹침 해소)
    if (!e.seg && !e.boss && !(e.d.ghost)) {
      let n = 0;
      grid.query(e.x, e.y, e.r + 8, o => {
        if (o === e || o.dead || o.seg || (o.d && o.d.ghost)) return false;
        const dx = e.x - o.x, dy = e.y - o.y;
        const rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * (o.boss ? 0.9 : 0.5);
          e.x += (dx / d) * push; e.y += (dy / d) * push;
        }
        return ++n > 8;
      });
    }

    // 플레이어 접촉
    if (G.state === 'play' && e.spawnT > 0.6 && !(e.boss && e.z > 4)) {
      const rr = e.r + p.r;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) hurtPlayer(e.dmg, e.x, e.y);
    }

    // 너무 멀어진 적은 앞쪽 가장자리로 재배치
    if (!e.boss && !e.seg && (Math.abs(e.x - p.x) > farR || Math.abs(e.y - p.y) > farR)) {
      const [x, y] = edgePoint(14);
      e.x = x; e.y = y; e.kx = e.ky = 0;
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function moveEnemy(e, dt) {
  const p = G.p;
  const dx = p.x - e.x, dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  let ang = Math.atan2(dy, dx);
  let spd = e.spd;
  if (e.slowT > 0) spd *= 0.5;
  const beh = e.d.beh;
  switch (beh) {
    case 'scurry': ang += Math.sin(e.t * 9 + e.seed) * 0.75; break;
    case 'waddle': spd *= 0.6 + 0.6 * Math.abs(Math.sin(e.t * 5 + e.seed)); break;
    case 'float': ang += Math.sin(e.t * 1.7 + e.seed) * 0.6; break;
    case 'flutter':
      ang += Math.sin(e.t * 3.1 + e.seed) * 1.0;
      spd *= 0.75 + 0.45 * Math.sin(e.t * 6 + e.seed);
      break;
    case 'hop': {
      const ph = (e.t + e.seed) % 0.85;
      if (ph < 0.5) {
        e.z = Math.sin((ph / 0.5) * Math.PI) * 7;
        spd *= 1.5; e.landed = false;
      } else {
        if (!e.landed) { e.landed = true; e.sq.v = 0.72; }
        e.z = 0; spd = 0;
      }
      break;
    }
    case 'rush':
      if (e.st === 0) {
        if (dist < 110 && e.t > e.next) { e.st = 1; e.t0 = 0; e.lock = ang; }
      } else if (e.st === 1) {
        e.t0 += dt; spd = 0; ang = e.lock;
        e.jit = Math.sin(e.t0 * 80) * 0.6;
        if (e.t0 > 0.45) { e.st = 2; e.t0 = 0; e.sq.v = 1.25; }
      } else {
        e.t0 += dt; ang = e.lock; spd *= 3.6; e.jit = 0;
        if (chance(0.5)) spawnPart(e.x, e.y + e.h / 2 - 2, rand(-8, 8), rand(-8, 8), 0, 0.3, 'dust');
        if (e.t0 > 0.42) { e.st = 0; e.next = e.t + rand(2.6, 4.2); }
      }
      break;
    case 'pack': ang += (e.seed % 2 < 1 ? 1 : -1) * 0.55 * clamp(dist / 140, 0, 1); break;
    case 'ranged':
      if (dist < 58) ang += Math.PI;
      else if (dist < 92) { ang += Math.PI / 2 * (e.seed % 2 < 1 ? 1 : -1); spd *= 0.55; }
      if (e.st === 0 && e.t > e.next && dist < 150) { e.st = 1; e.t0 = 0; }
      if (e.st === 1) {
        e.t0 += dt; spd *= 0.2;
        if (e.t0 > 0.35) {
          e.st = 0; e.next = e.t + rand(2.4, 3.4);
          const a = Math.atan2(dy, dx);
          enemyShot(e.x, e.y - 2, a, 72, e.dmg * 0.8, 'quill');
        }
      }
      break;
  }
  if (e.rootT > 0) spd = 0;
  const tx = Math.cos(ang) * spd, ty = Math.sin(ang) * spd;
  const k = beh === 'rush' && e.st === 2 ? 30 : 7;
  e.vx = damp(e.vx, tx, k, dt);
  e.vy = damp(e.vy, ty, k, dt);
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (Math.abs(e.vx) > 3) e.face = e.vx > 0 ? 1 : -1;
}

function enemyShot(x, y, a, spd, dmg, kind = 'orb', life = 5) {
  G.ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, a, dmg, kind, life, t: 0, r: kind === 'orb' ? 2.6 : 2 });
}

function updateBullets(dt) {
  const p = G.p;
  for (const b of G.ebullets) {
    b.t += dt; b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (G.state === 'play' && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
      hurtPlayer(b.dmg, b.x, b.y);
      b.life = 0;
      for (let i = 0; i < 5; i++) spawnPart(b.x, b.y, rand(-50, 50), rand(-50, 50), rand(10, 30), 0.3, 'px');
    }
  }
  G.ebullets = G.ebullets.filter(b => b.life > 0);
}

// ── 피해 처리 ──
function hurtEnemy(e, dmg, dx, dy, kb = 40, opt = {}) {
  if (e.dead) return;
  const tgt = e.parent || e;
  if (tgt.dead) return;
  const crit = !opt.nocrit && chance(0.08);
  if (!opt.raw) dmg *= Stat.might();
  if (crit) dmg *= 2;
  tgt.hp -= dmg;
  G.dmgDealt += dmg;
  e.flash = 0.1;
  if (tgt !== e) tgt.flash = 0.06;
  const mass = e.boss || e.seg ? 0.06 : e.d.heavy ? 0.3 : e.elite ? 0.45 : 1;
  if (opt.heavy && !e.boss && !e.seg) {
    e.freezeT = crit ? 0.11 : 0.075;
    e.pkx = (e.pkx || 0) + dx * kb * mass; e.pky = (e.pky || 0) + dy * kb * mass;
  } else { e.kx += dx * kb * mass; e.ky += dy * kb * mass; }
  e.sq.v = opt.heavy ? (crit ? 0.5 : 0.58) : crit ? 0.6 : 0.76;
  if (opt.heavy) { e.flash = 0.14; tgt.killPow = 1.8; }
  if (!opt.silent) {
    addNum(e.x + rand(-2, 2), e.y - e.h / 2 - 2, dmg, crit);
    if (opt.heavy) {
      // 관통: 파편이 화살 진행 방향으로 뿜어져 나간다
      const ang = Math.atan2(dy, dx);
      for (let i = 0; i < (crit ? 8 : 5); i++) {
        const a = ang + rand(-0.45, 0.45);
        spawnPart(e.x + dx * e.r * 0.5, e.y - e.z + dy * e.r * 0.5, Math.cos(a) * rand(110, 230), Math.sin(a) * rand(110, 230), rand(10, 40), rand(0.15, 0.3), 'spark');
      }
      if (G.fx.length < 160) {
        fxRing(e.x, e.y - e.z, 1, crit ? 15 : 11, crit ? 0.3 : 0.22, 2);
        G.fx.push({ type: 'pierce', x: e.x, y: e.y - e.z, a: ang, t: 0, dur: 0.14 });
      }
      Sfx.play('bowHit');
      if (crit) Sfx.play('crit');
      // 화면 전체 멈칫은 치명타에만, 그것도 간격을 둔다 (평타는 맞은 적만 굳는다)
      const now = performance.now();
      if (crit && now - (G.lastStop || 0) > 250) { G.lastStop = now; hitstop(0.05); }
      addShake(crit ? 0.12 : 0.035);
    } else {
      for (let i = 0; i < (crit ? 5 : 2); i++) {
        const a = Math.atan2(dy, dx) + rand(-0.9, 0.9);
        spawnPart(e.x - dx * e.r * 0.5, e.y - dy * e.r * 0.5, Math.cos(a) * rand(60, 140), Math.sin(a) * rand(60, 140), rand(5, 25), rand(0.12, 0.25), 'spark');
      }
      Sfx.play(crit ? 'crit' : 'hit');
      if (G.fx.length < 140) fxRing(e.x - dx * e.r * 0.6, e.y - e.z - e.h * 0.1 - dy * e.r * 0.6, 1, crit ? 9 : 5, crit ? 0.22 : 0.14, 1);
    }
  }
  if (crit) addShake(0.05);
  if (tgt.hp <= 0) killEnemy(tgt, dx, dy);
}

function killEnemy(e, dx, dy, quiet) {
  if (e.dead) return;
  e.dead = true;
  if (e.seg) return;
  if (!e.boss) G.kills++;
  const fr = Math.floor(e.animT * 4) % Gfx.frames(e.type);
  shatterBitmap(e.type, fr, e.x, e.y - e.z, e.face, dx, dy, e.boss ? 1.6 : (e.killPow || 1), e.elite ? 'i' : 'n', e.boss ? 220 : 40);
  if (e.boss) { if (quiet) G.boss = null; else bossDefeated(e); return; }
  if (quiet) return;
  dropGem(e.x, e.y, e.xp * (1 + G.stage * 0.15));
  if (e.elite) {
    dropItem('chest', e.x, e.y);
    hitstop(0.09);
    addShake(0.35);
    fxRing(e.x, e.y, 3, 40, 0.45, 2);
    Sfx.play('bigkill');
  } else {
    Sfx.play('kill');
    if (e.d.heavy) { addShake(0.18); hitstop(0.04); fxRing(e.x, e.y, 2, 26, 0.35, 1); }
  }
  if (e.d.split) {
    for (let i = 0; i < 2; i++) {
      const a = Math.atan2(dy, dx) + (i ? 1.2 : -1.2);
      spawnEnemy(e.d.split, e.x, e.y, { kx: Math.cos(a) * 120, ky: Math.sin(a) * 120 });
    }
  }
  const lowHp = G.p.hp < G.p.maxHp * 0.35;
  if (chance(lowHp ? 0.016 : 0.006)) dropItem('potion', e.x, e.y);
  else if (chance(0.0015)) dropItem('scroll', e.x, e.y);
}

// 스프라이트의 잉크 픽셀이 그대로 흩어진다
function shatterBitmap(name, frame, x, y, face, dx, dy, power = 1, variant = 'n', cap = 40) {
  const bm = Gfx.bitmaps[name][frame % Gfx.bitmaps[name].length];
  const pts = [];
  for (let j = 0; j < bm.h; j++) for (let i = 0; i < bm.w; i++) {
    const v = bm.d[j * bm.w + i];
    if (variant === 'i' ? v >= 2 : v === 1) pts.push(i, j);
  }
  const n = pts.length / 2;
  const step = Math.max(1, n / cap);
  for (let k = 0; k < n; k += step) {
    const idx = (k | 0) * 2;
    let i = pts[idx], j = pts[idx + 1];
    if (face < 0) i = bm.w - 1 - i;
    const ox = i - bm.w / 2 + 0.5, oy = j - bm.h / 2 + 0.5;
    const sp = rand(25, 95) * power;
    spawnPart(x + ox, y + oy,
      dx * sp + ox * rand(4, 10) * power + rand(-12, 12),
      dy * sp + oy * rand(2, 6) * power + rand(-12, 12),
      rand(30, 110) * power, rand(0.45, 1.0) * (power > 1 ? 1.3 : 1), 'px');
  }
}

// ── 파티클 ──
const PART_MAX = 1600;
function spawnPart(x, y, vx, vy, vz, life, kind) {
  if (G.parts.length >= PART_MAX) G.parts.shift();
  G.parts.push({ x, y, z: 0, vx, vy, vz, life, max: life, kind, seed: (Math.random() * 1e4) | 0 });
}
function updateParts(dt) {
  const fr = 1 - Math.exp(-2.6 * dt);
  for (const q of G.parts) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx -= q.vx * fr; q.vy -= q.vy * fr;
    if (q.kind === 'px' || q.kind === 'dust') {
      q.z += q.vz * dt;
      q.vz -= (q.kind === 'dust' ? 60 : 420) * dt;
      if (q.z < 0) {
        q.z = 0;
        if (q.kind === 'px') {
          q.vz = Math.abs(q.vz) > 25 ? -q.vz * 0.38 : 0;
          q.vx *= 0.55; q.vy *= 0.55;
        } else q.vz = 0;
      }
    }
  }
  G.parts = G.parts.filter(q => q.life > 0);
}

// ── 효과 ──
function fxRing(x, y, r0, r1, dur, thick = 1) { G.fx.push({ type: 'ring', x, y, r0, r1, dur, t: 0, thick }); }
function fxDisc(x, y, r, dur) { G.fx.push({ type: 'disc', x, y, r, dur, t: 0 }); }
function floatText(x, y, text, color) { G.fx.push({ type: 'text', x, y, text, color, dur: 1.1, t: 0 }); }
function updateFx(dt) {
  for (const f of G.fx) {
    f.t += dt;
    if (f.update) f.update(f, dt);
  }
  G.fx = G.fx.filter(f => f.t < f.dur);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
}

function addNum(x, y, v, crit) {
  if (G.nums.length > 70 && !crit) return;
  G.nums.push({ x, y, v: Math.max(1, Math.round(v)), crit, t: 0, vx: rand(-14, 14), vy: -rand(38, 55) });
}
function updateNums(dt) {
  for (const n of G.nums) {
    n.t += dt;
    n.x += n.vx * dt; n.y += n.vy * dt;
    n.vy += 140 * dt;
    n.vx *= 0.96;
  }
  G.nums = G.nums.filter(n => n.t < 0.7);
}

// ── 경험치 보석 / 아이템 ──
function dropGem(x, y, v) {
  // 큰 경험치는 큰 보석 하나로
  const k = v >= 20 ? 2 : v >= 4 ? 1 : 0;
  G.gems.push({ x, y, v, k, z: 0, vz: rand(40, 75), vx: rand(-22, 22), vy: rand(-22, 22), mag: false, mt: 0, t: rand(10) });
}

function updateGems(dt) {
  const p = G.p;
  const mr = Stat.magnet();
  const mr2 = mr * mr;
  for (const g of G.gems) {
    g.t += dt;
    if (!g.mag) {
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= Math.exp(-5 * dt); g.vy *= Math.exp(-5 * dt);
      g.z += g.vz * dt; g.vz -= 300 * dt;
      if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 20 ? -g.vz * 0.4 : 0; }
      if (G.state === 'play' && dist2(g.x, g.y, p.x, p.y) < mr2) { g.mag = true; g.mt = 0; }
    } else {
      g.mt += dt;
      const dx = p.x - g.x, dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      if (g.mt < 0.1) {
        // 빨려 들어가기 전 살짝 튕겨 나간다
        g.vx = damp(g.vx, -nx * 45, 20, dt); g.vy = damp(g.vy, -ny * 45, 20, dt);
      } else {
        const spd = Math.min(420, 60 + g.mt * 520) + Math.hypot(p.vx, p.vy);
        g.vx = damp(g.vx, nx * spd, 12, dt); g.vy = damp(g.vy, ny * spd, 12, dt);
      }
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.z = damp(g.z, 0, 10, dt);
      if (d < 5 && G.state === 'play') { g.dead = true; collectGem(g); }
    }
  }
  if (G.gems.some(g => g.dead)) G.gems = G.gems.filter(g => !g.dead);
  // 보석이 너무 많으면 멀리 있는 것들을 하나로 뭉친다
  if (G.gems.length > 320) {
    let sum = 0, at = null;
    G.gems = G.gems.filter(g => {
      if (g.mag || dist2(g.x, g.y, p.x, p.y) < 170 * 170) return true;
      sum += g.v; if (!at) at = g;
      return false;
    });
    if (at) G.gems.push({ x: at.x, y: at.y, v: sum, k: 2, z: 0, vz: 0, vx: 0, vy: 0, mag: false, mt: 0, t: 0 });
  }
}

function collectGem(g) {
  if (Market.frozen) {
    Market.stock(g.v);
    Sfx.play('stock');
    // 화면 좌표에서 매수 버튼으로 날아가는 붉은 입자
    const [sx, sy] = worldToScreen(g.x, g.y);
    const b = HUD.buyRect();
    uiStream(sx, sy, b.x + b.w / 2, b.y + b.h / 2, UP, g.k + 1, 0.42);
  } else {
    addXP(g.v);
    Sfx.play('gem');
  }
}

function dropItem(kind, x, y) {
  G.items.push({ kind, x, y, z: 0, vz: 90, t: 0, mag: false, vx: 0, vy: 0 });
}
function updateItems(dt) {
  const p = G.p;
  for (const it of G.items) {
    it.t += dt;
    it.z += it.vz * dt; it.vz -= 300 * dt;
    if (it.z < 0) { it.z = 0; it.vz = Math.abs(it.vz) > 20 ? -it.vz * 0.35 : 0; }
    const d = Math.hypot(p.x - it.x, p.y - it.y);
    if (G.state !== 'play') continue;
    if (!it.mag && d < Stat.magnet() * 0.6) it.mag = true;
    if (it.mag) {
      const spd = 140;
      it.x += ((p.x - it.x) / (d || 1)) * spd * dt;
      it.y += ((p.y - it.y) / (d || 1)) * spd * dt;
    }
    if (d < 7) { it.dead = true; useItem(it); }
  }
  if (G.items.some(i => i.dead)) G.items = G.items.filter(i => !i.dead);
}
function useItem(it) {
  Sfx.play('pick');
  if (it.kind === 'potion') healPlayer(30);
  else if (it.kind === 'scroll') {
    for (const g of G.gems) { g.mag = true; g.mt = 0.1; }
    fxRing(G.p.x, G.p.y, 4, 200, 0.7, 1);
    floatText(G.p.x, G.p.y - 12, '흡수!');
  } else if (it.kind === 'chest') {
    G.pendingChest += it.picks || 1;
    Sfx.play('open');
    G.invert = 0.05;
    fxRing(it.x, it.y, 2, 34, 0.5, 2);
  }
}

// ── 화면 UI 입자 (매수 스트림, 매도 폭발) ──
function uiStream(x0, y0, x1, y1, color, size, dur, onDone) {
  const cx = (x0 + x1) / 2 + rand(-1, 1) * View.U * 60, cy = Math.min(y0, y1) - rand(20, 80) * View.U;
  G.uiParts.push({ x0, y0, x1, y1, cx, cy, color, size, t: 0, dur: dur * rand(0.85, 1.15), onDone });
}
function updateUiParts(dt) {
  for (const q of G.uiParts) {
    q.t += dt;
    if (q.t >= q.dur && q.onDone) { q.onDone(); q.onDone = null; }
  }
  G.uiParts = G.uiParts.filter(q => q.t < q.dur);
}

// ── 감독: 스폰 ──
const Director = {
  reset() {
    this.acc = 0;
    this.pool = [];
    this.poolT = 0;
    this.eventT = 38;
    this.eliteT = 48;
    this.bossDone = {};
    this.rotatePool();
  },
  unlocked() { return Object.keys(ENEMIES).filter(k => ENEMIES[k].tier <= G.stage); },
  rotatePool() {
    const cand = this.unlocked();
    const n = Math.min(cand.length, G.stage >= 2 ? 4 : 3);
    const pool = [];
    while (pool.length < n && cand.length) {
      const tot = cand.reduce((s, k) => s + ENEMIES[k].w, 0);
      let r = rand(tot), i = 0;
      for (; i < cand.length; i++) { r -= ENEMIES[cand[i]].w; if (r <= 0) break; }
      i = Math.min(i, cand.length - 1);
      pool.push(cand[i]); cand.splice(i, 1);
    }
    this.pool = pool;
    this.poolT = rand(28, 42);
  },
  pickType() {
    const tot = this.pool.reduce((s, k) => s + ENEMIES[k].w, 0);
    let r = rand(tot);
    for (const k of this.pool) { r -= ENEMIES[k].w; if (r <= 0) return k; }
    return this.pool[0];
  },
  rate() { return 0.9 + (G.t / 60) * 0.36; },
  maxAlive() { return Math.min(360, 55 + (G.t / 60) * 11); },
  update(dt) {
    this.poolT -= dt;
    if (this.poolT <= 0) this.rotatePool();
    this.acc += this.rate() * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (G.enemies.length < this.maxAlive()) this.spawnOne();
    }
    this.eventT -= dt;
    if (this.eventT <= 0) { this.event(); this.eventT = rand(38, 60); }
    this.eliteT -= dt;
    if (this.eliteT <= 0) { this.spawnElite(); this.eliteT = rand(42, 65); }
    const st = G.stage, local = G.t - st * STAGE_LEN;
    if (local >= 240 && !this.bossDone[st]) { this.bossDone[st] = true; spawnBoss(G.bossOrder[st], st); }
  },
  spawnOne() {
    const type = this.pickType();
    const [x, y] = edgePoint();
    const g = ENEMIES[type].group;
    if (g) {
      // 무리 몬스터는 마릿수만큼 스폰 예산을 쓴다
      const n = randi(g[0], g[1]);
      for (let i = 0; i < n; i++) spawnEnemy(type, x + rand(-10, 10), y + rand(-10, 10));
      this.acc -= (n - 1) * 0.6;
    } else spawnEnemy(type, x, y);
  },
  spawnElite() {
    const cand = this.pool.filter(k => !ENEMIES[k].group);
    const type = cand.length ? pick(cand) : this.pool[0];
    const [x, y] = edgePoint();
    spawnEnemy(type, x, y, { elite: true });
  },
  event() {
    const p = G.p;
    const kinds = ['ring', 'swarm'];
    if (this.unlocked().includes('warg') || this.unlocked().includes('harpy')) kinds.push('stampede');
    const k = pick(kinds);
    if (k === 'ring') {
      const cand = this.pool.filter(t => !ENEMIES[t].heavy);
      const type = cand.length ? pick(cand) : 'spartoi';
      const n = 18 + G.stage * 5;
      const R = Math.max(View.vw, View.vh) * 0.58;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        spawnEnemy(type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
      floatText(p.x, p.y - 16, '포위!');
      Sfx.play('warn');
    } else if (k === 'swarm') {
      const [x, y] = edgePoint(10);
      const n = 18 + G.stage * 4;
      for (let i = 0; i < n; i++) spawnEnemy('scarab', x + rand(-16, 16), y + rand(-16, 16));
    } else {
      const type = this.unlocked().includes('warg') ? 'warg' : 'harpy';
      const a = rand(TAU);
      const R = Math.max(View.vw, View.vh) * 0.6;
      const n = 10 + G.stage * 3;
      for (let i = 0; i < n; i++) {
        const off = (i - n / 2) * 9;
        spawnEnemy(type, p.x + Math.cos(a) * R - Math.sin(a) * off, p.y + Math.sin(a) * R + Math.cos(a) * off);
      }
      Sfx.play('warn');
    }
  },
};
