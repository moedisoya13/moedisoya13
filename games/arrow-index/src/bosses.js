// ── 보스 ────────────────────────────────────────────────────────
function spawnBoss(kind, st) {
  const d = BOSSES[kind];
  const [x, y] = edgePoint(26);
  const hp = d.hp * (1 + st * 0.75);
  const sprite = kind;
  const bm = Gfx.bitmaps[sprite][0];
  const b = {
    id: G.nextId++, type: sprite, kind, d, boss: true, x, y, vx: 0, vy: 0, kx: 0, ky: 0, z: 0,
    hp, maxHp: hp, r: d.r, spd: d.spd * (1 + st * 0.05), dmg: d.dmg * (1 + st * 0.22),
    flash: 0, sq: new Spring(1, 200, 11), animT: 0, seed: rand(1000), spawnT: 0, face: 1,
    st: 'idle', t: 0, t0: 0, ta: 2.5, tb: 5, tc: 3, hitCd: {}, rootT: 0, slowT: 0,
    w: bm.w, h: bm.h, stage: st,
  };
  G.enemies.push(b);
  G.boss = b;
  if (kind === 'quetzal') {
    b.path = [];
    b.heading = angleTo(x, y, G.p.x, G.p.y);
    b.segs = [];
    const sb = Gfx.bitmaps.quetzalBody[0];
    for (let i = 0; i < 16; i++) {
      const s = {
        id: G.nextId++, type: 'quetzalBody', seg: true, parent: b, d: { beh: 'seg' }, x, y, vx: 0, vy: 0, kx: 0, ky: 0, z: 0,
        hp: 1, maxHp: 1, r: 4.5, dmg: b.dmg * 0.7, flash: 0, sq: new Spring(1, 300, 12), animT: i * 0.3, spawnT: 0, face: 1,
        hitCd: {}, rootT: 0, slowT: 0, w: sb.w, h: sb.h, t: 0, idx: i,
      };
      b.segs.push(s);
      G.enemies.push(s);
    }
  }
  showBanner(d.name, d.myth, 'boss');
  Sfx.play('boss');
  addShake(0.5);
}

function telegraph(x, y, ang, len, w, dur) {
  G.fx.push({ type: 'tele', x, y, ang, len, w, t: 0, dur });
}

function bossShootRing(b, n, spd, off = 0) {
  for (let i = 0; i < n; i++) enemyShot(b.x, b.y - 2, off + (i / n) * TAU, spd, b.dmg * 0.6, 'orb', 6);
}

function updateBoss(b, dt) {
  const p = G.p;
  b.t += dt;
  const dx = p.x - b.x, dy = p.y - b.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toP = Math.atan2(dy, dx);
  let mvA = toP, spd = b.spd;
  if (b.slowT > 0) spd *= 0.7;
  const B = BOSS_AI[b.kind];
  const r = B ? B(b, dt, { dist, toP }) : null;
  if (r) { if (r.a !== undefined) mvA = r.a; if (r.spd !== undefined) spd = r.spd; }
  if (r && r.manual) return;
  b.vx = damp(b.vx, Math.cos(mvA) * spd, 5, dt);
  b.vy = damp(b.vy, Math.sin(mvA) * spd, 5, dt);
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (Math.abs(b.vx) > 3) b.face = b.vx > 0 ? 1 : -1;
}

const BOSS_AI = {
  medusa(b, dt, { dist, toP }) {
    b.ta -= dt; b.tb -= dt;
    let a = toP, spd = b.spd;
    if (dist < 64) a = toP + Math.PI;
    if (b.st === 'idle') {
      if (b.ta <= 0) { b.ta = 2.6; bossShootRing(b, 12, 52, b.t); Sfx.play('whoosh'); b.sq.v = 1.15; }
      if (b.tb <= 0) {
        b.st = 'gaze'; b.t0 = 0; b.fired = false;
        b.lock = toP;
        telegraph(b.x, b.y - 6, b.lock, 360, 9, 0.95);
        Sfx.play('warn');
      }
    } else if (b.st === 'gaze') {
      b.t0 += dt; spd = 0;
      if (b.t0 > 0.95 && !b.fired) {
        b.fired = true;
        G.fx.push({ type: 'beam', x: b.x, y: b.y - 6, ang: b.lock, len: 360, w: 6, t: 0, dur: 0.35 });
        addShake(0.3);
        Sfx.play('zap');
        const p = G.p;
        const ex = b.x + Math.cos(b.lock) * 360, ey = b.y - 6 + Math.sin(b.lock) * 360;
        if (segCircle(b.x, b.y - 6, ex, ey, p.x, p.y, 7)) {
          p.slowT = 1.6;
          hurtPlayer(b.dmg * 0.6);
          floatText(p.x, p.y - 14, '석화!');
        }
      }
      if (b.t0 > 1.35) { b.st = 'idle'; b.tb = 6.2; }
    }
    return { a, spd };
  },

  minotaur(b, dt, { toP }) {
    b.ta -= dt;
    if (b.st === 'idle') {
      if (b.ta <= 0) {
        b.st = 'wind'; b.t0 = 0; b.lock = toP;
        telegraph(b.x, b.y, b.lock, 230, 14, 0.8);
        Sfx.play('warn');
      }
      return { a: toP };
    }
    if (b.st === 'wind') {
      b.t0 += dt;
      b.jit = Math.sin(b.t0 * 70) * 0.8;
      if (b.t0 > 0.8) { b.st = 'charge'; b.t0 = 0; b.jit = 0; b.sq.v = 1.3; Sfx.play('whoosh'); }
      return { a: b.lock, spd: 0 };
    }
    if (b.st === 'charge') {
      b.t0 += dt;
      b.vx = Math.cos(b.lock) * 210; b.vy = Math.sin(b.lock) * 210;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.face = b.vx > 0 ? 1 : -1;
      if (chance(0.7)) spawnPart(b.x + rand(-6, 6), b.y + 10, rand(-20, 20), rand(-10, 10), rand(10, 30), 0.4, 'dust');
      // 짓밟기: 길 위의 몬스터도 휩쓸린다
      G.grid.query(b.x, b.y, b.r + 8, e => {
        if (e.dead || e.boss || e.seg) return;
        if ((e.hitCd.tram || 0) > G.t) return;
        e.hitCd.tram = G.t + 1;
        hurtEnemy(e, 40, Math.cos(b.lock + 1.2), Math.sin(b.lock + 1.2), 160, { nocrit: true, raw: true });
      });
      if (b.t0 > 0.95) { b.st = 'stun'; b.t0 = 0; addShake(0.3); b.sq.v = 0.7; fxRing(b.x, b.y + 6, 4, 30, 0.4, 1); }
      return { manual: true };
    }
    // 기절
    b.t0 += dt;
    if (b.t0 > 0.85) { b.st = 'idle'; b.ta = 3.8; }
    return { spd: 0 };
  },

  fenrir(b, dt, { dist, toP }) {
    b.ta -= dt; b.tb -= dt;
    if (b.st === 'idle') {
      if (b.tb <= 0) {
        b.tb = 12;
        for (let i = 0; i < 5; i++) {
          const a = rand(TAU);
          spawnEnemy('warg', b.x + Math.cos(a) * 24, b.y + Math.sin(a) * 24, { fade: true });
        }
        fxRing(b.x, b.y, 6, 60, 0.6, 2);
        Sfx.play('boss');
        b.sq.v = 1.25;
      }
      if (b.ta <= 0 && dist < 200) {
        const p = G.p;
        b.st = 'leap'; b.t0 = 0;
        b.sx = b.x; b.sy = b.y;
        b.tx = p.x + p.vx * 0.5; b.ty = p.y + p.vy * 0.5;
        G.fx.push({ type: 'shadow', x: b.tx, y: b.ty, r: 30, t: 0, dur: 0.75 });
        b.sq.v = 0.7;
        Sfx.play('whoosh');
      }
      return { a: toP };
    }
    if (b.st === 'leap') {
      b.t0 += dt;
      const u = Math.min(1, b.t0 / 0.75);
      const e = easeInOutSine(u);
      b.x = lerp(b.sx, b.tx, e); b.y = lerp(b.sy, b.ty, e);
      b.z = Math.sin(u * Math.PI) * 46;
      b.face = b.tx > b.sx ? 1 : -1;
      if (u >= 1) {
        b.z = 0; b.st = 'idle'; b.ta = 4.6; b.sq.v = 0.6;
        fxRing(b.x, b.y, 4, 42, 0.45, 2);
        fxDisc(b.x, b.y, 32, 0.25);
        addShake(0.5); hitstop(0.05);
        Sfx.play('explode', 1);
        const p = G.p;
        if (dist2(p.x, p.y, b.x, b.y) < 40 * 40) hurtPlayer(b.dmg);
        G.grid.query(b.x, b.y, 44, e => {
          if (e.dead || e.boss || e.seg) return;
          const a = angleTo(b.x, b.y, e.x, e.y);
          e.kx += Math.cos(a) * 150; e.ky += Math.sin(a) * 150;
        });
        for (let i = 0; i < 16; i++) { const a = rand(TAU); spawnPart(b.x, b.y + 6, Math.cos(a) * 80, Math.sin(a) * 50, rand(20, 60), 0.5, 'dust'); }
      }
      return { manual: true };
    }
    return { a: toP };
  },

  anubis(b, dt, { toP }) {
    b.ta -= dt; b.tb -= dt; b.tc -= dt;
    if (b.st === 'idle') {
      if (b.tc <= 0) {
        b.tc = 3;
        for (let i = -1; i <= 1; i++) enemyShot(b.x, b.y - 8, toP + i * 0.28, 62, b.dmg * 0.6, 'orb', 6);
        b.sq.v = 1.15;
      }
      if (b.tb <= 0) {
        b.tb = 9;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spawnEnemy('mummy', b.x + Math.cos(a) * 30, b.y + Math.sin(a) * 30, { fade: true });
        }
        fxRing(b.x, b.y, 4, 34, 0.5, 1);
        Sfx.play('warn');
      }
      if (b.ta <= 0) { b.st = 'out'; b.t0 = 0; Sfx.play('whoosh'); }
      return { a: toP };
    }
    if (b.st === 'out') {
      b.t0 += dt;
      b.spawnT = 1 - b.t0 / 0.35;
      if (b.t0 > 0.35) {
        const a = rand(TAU);
        b.x = G.p.x + Math.cos(a) * 72; b.y = G.p.y + Math.sin(a) * 60;
        b.st = 'in'; b.t0 = 0;
      }
      return { spd: 0 };
    }
    b.t0 += dt;
    b.spawnT = b.t0 / 0.35;
    if (b.t0 > 0.35) { b.spawnT = 1; b.st = 'idle'; b.ta = 5.5; fxRing(b.x, b.y, 2, 24, 0.35, 1); }
    return { spd: 0 };
  },

  gumiho(b, dt, { dist, toP }) {
    b.ta -= dt; b.tb -= dt;
    if (b.st === 'idle') {
      if (b.ta <= 0) { b.st = 'spiral'; b.t0 = 0; b.emit = 0; b.spin = toP; Sfx.play('warn'); }
      else if (b.tb <= 0 && dist < 160) {
        b.st = 'wind'; b.t0 = 0; b.lock = toP;
        telegraph(b.x, b.y, b.lock, 140, 10, 0.5);
      }
      return { a: toP };
    }
    if (b.st === 'spiral') {
      b.t0 += dt; b.emit -= dt;
      if (b.emit <= 0) {
        b.emit = 0.11;
        b.spin += 0.37;
        for (let k = 0; k < 3; k++) enemyShot(b.x, b.y - 4, b.spin + (k / 3) * TAU, 50, b.dmg * 0.5, 'orb', 6);
      }
      if (b.t0 > 2.4) { b.st = 'idle'; b.ta = 5.2; }
      return { a: toP, spd: b.spd * 0.25 };
    }
    if (b.st === 'wind') {
      b.t0 += dt;
      if (b.t0 > 0.5) { b.st = 'dash'; b.t0 = 0; Sfx.play('whoosh'); }
      return { a: b.lock, spd: 0 };
    }
    b.t0 += dt;
    b.vx = Math.cos(b.lock) * 230; b.vy = Math.sin(b.lock) * 230;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.face = b.vx > 0 ? 1 : -1;
    if (chance(0.6)) spawnPart(b.x, b.y, rand(-10, 10), rand(-10, 10), rand(5, 20), 0.35, 'px');
    if (b.t0 > 0.4) { b.st = 'idle'; b.tb = 6.5; }
    return { manual: true };
  },

  quetzal(b, dt, { toP }) {
    // 머리는 구불구불 다가오고, 몸통 마디는 머리가 지나간 길을 그대로 따른다
    const want = toP + Math.sin(b.t * 1.5) * 0.95;
    b.heading += clamp(angDiff(b.heading, want), -2.3 * dt, 2.3 * dt);
    const spd = b.spd * (1 + 0.25 * Math.sin(b.t * 0.7));
    b.vx = Math.cos(b.heading) * spd; b.vy = Math.sin(b.heading) * spd;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.face = b.vx > 0 ? 1 : -1;
    b.path.unshift([b.x, b.y]);
    if (b.path.length > 400) b.path.pop();
    let acc = 0, k = 1;
    const gap = 6.5;
    for (const s of b.segs) {
      if (s.dead) continue;
      const need = (s.idx + 1) * gap;
      while (k < b.path.length) {
        const [ax, ay] = b.path[k - 1], [bx, by] = b.path[k];
        const l = Math.hypot(ax - bx, ay - by);
        if (acc + l >= need) {
          const u = (need - acc) / (l || 1);
          s.x = lerp(ax, bx, u); s.y = lerp(ay, by, u);
          break;
        }
        acc += l; k++;
      }
      s.spawnT = b.spawnT;
      s.face = b.face;
    }
    b.ta -= dt;
    if (b.ta <= 0) {
      b.ta = 3.4;
      // 깃털 비늘을 사방으로
      for (const s of b.segs) if (!s.dead && s.idx % 4 === 0) {
        const a = rand(TAU);
        enemyShot(s.x, s.y, a, 48, b.dmg * 0.5, 'orb', 5);
      }
    }
    return { manual: true };
  },
};

function bossDefeated(b) {
  G.boss = null;
  G.bossKills++;
  slowmo(1.3, 0.15);
  hitstop(0.12);
  addShake(1);
  G.invert = 0.12;
  Sfx.play('bigkill');
  later(0.15, () => Sfx.play('level'));
  for (let i = 0; i < 3; i++) later(i * 0.12, () => fxRing(b.x, b.y, 4, 70 + i * 40, 0.6, 2));
  fxDisc(b.x, b.y, 50, 0.5);
  if (b.segs) b.segs.forEach((s, i) => later(0.05 + i * 0.05, () => {
    if (s.dead) return;
    s.dead = true;
    shatterBitmap('quetzalBody', 0, s.x, s.y, 1, 0, -1, 1.1, 'n', 30);
    fxRing(s.x, s.y, 2, 14, 0.3, 1);
    Sfx.play('kill');
  }));
  const it = { kind: 'chest', x: b.x, y: b.y, z: 0, vz: 120, t: 0, mag: false, picks: 2 };
  G.items.push(it);
  dropItem('potion', b.x + 10, b.y);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    G.gems.push({ x: b.x, y: b.y, v: 8 * (1 + b.stage), k: 1, z: 0, vz: rand(60, 110), vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, mag: false, mt: 0, t: 0 });
  }
  showBanner('격파', b.d.name + ' · ' + b.d.myth, 'kill');
}
