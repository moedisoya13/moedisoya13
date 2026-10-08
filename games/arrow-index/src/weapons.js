// ── 무기 ────────────────────────────────────────────────────────
const W = (w, key) => WEAPONS[w.id][key][w.L - 1];

function addWeapon(id) {
  const w = { id, L: 1, cd: 0.4, phase: 'idle', t: 0 };
  G.weapons.push(w);
  if (id === 'falcon') syncFalcons(w);
  return w;
}

function levelWeapon(w) {
  w.L = Math.min(WEAPON_MAX, w.L + 1);
  if (w.id === 'falcon') syncFalcons(w);
}

function updateWeapons(dt) {
  for (const w of G.weapons) {
    const fn = WEAPON_UPDATE[w.id];
    if (fn) fn(w, dt);
  }
  updateFalcons(dt);
  updateFeathers(dt);
}

// 사거리 안 가까운 적 n 마리
function nearestEnemies(x, y, range, n) {
  const r2 = range * range;
  const arr = [];
  for (const e of G.enemies) {
    if (e.dead || e.spawnT < 0.5) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < r2) arr.push([d, e]);
  }
  arr.sort((a, b) => a[0] - b[0]);
  return arr.slice(0, n).map(a => a[1]);
}

function onScreen(e, margin = 0) {
  return Math.abs(e.x - G.cam.x) < View.vw / 2 + margin && Math.abs(e.y - G.cam.y) < View.vh / 2 + margin;
}

// 적이 가장 빽빽한 지점 (화면 안 표본 중)
function densestPoint() {
  const cands = G.enemies.filter(e => !e.dead && onScreen(e, -8));
  if (!cands.length) return null;
  let best = null, bestN = -1;
  for (let i = 0; i < 12; i++) {
    const e = pick(cands);
    let n = 0;
    G.grid.query(e.x, e.y, 24, o => { if (!o.dead) n++; });
    if (n > bestN) { bestN = n; best = e; }
  }
  return best;
}

function fireArrow(x, y, a, opt) {
  const spd = (opt.spd || 330) * Stat.pspeed();
  G.arrows.push({
    x, y, px: x, py: y, a, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
    dmg: opt.dmg, pierce: opt.pierce + Stat.pierce(), kind: opt.kind || 'arrow',
    life: opt.life || 0.85, hits: [], kb: opt.kb || 45, blast: opt.blast || 0, t: 0,
  });
}

function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t - cx, y = ay + dy * t - cy;
  return x * x + y * y < r * r;
}

function updateArrows(dt) {
  for (const a of G.arrows) {
    a.t += dt;
    a.px = a.x; a.py = a.y;
    a.x += a.vx * dt; a.y += a.vy * dt;
    a.life -= dt;
    if (a.life <= 0) {
      if (a.blast) explode(a.x, a.y, a.blast, a.dmg);
      continue;
    }
    const mx = (a.x + a.px) / 2, my = (a.y + a.py) / 2;
    const half = Math.hypot(a.x - a.px, a.y - a.py) / 2;
    const nx = Math.cos(a.a), ny = Math.sin(a.a);
    G.grid.query(mx, my, half + 16, e => {
      if (a.life <= 0) return true;
      if (e.dead || e.spawnT < 0.5 || a.hits.includes(e.id)) return false;
      const ey = e.y - e.z;
      if (!segCircle(a.px, a.py, a.x, a.y, e.x, ey, e.r + 1.5)) return false;
      a.hits.push(e.id);
      if (a.blast) { explode(e.x, ey, a.blast, a.dmg); a.life = 0; return true; }
      hurtEnemy(e, a.dmg, nx, ny, a.kb);
      if (--a.pierce <= 0) {
        a.life = 0;
        // 꽂힌 화살 잔상
        G.fx.push({ type: 'stuck', x: a.x - nx * 3, y: a.y - ny * 3, a: a.a, kind: a.kind, t: 0, dur: 0.18 });
        return true;
      }
      return false;
    });
  }
  G.arrows = G.arrows.filter(a => a.life > 0);
}

function explode(x, y, r, dmg) {
  r *= Stat.area();
  fxDisc(x, y, r, 0.32);
  fxRing(x, y, r * 0.3, r * 1.15, 0.38, 2);
  addShake(0.16);
  Sfx.play('explode', 0.8);
  G.grid.query(x, y, r + 10, e => {
    if (e.dead) return;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > r + e.r) return;
    const nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
    hurtEnemy(e, dmg * (1 - 0.4 * clamp(d / r, 0, 1)), nx, ny, 120);
  });
  for (let i = 0; i < 14; i++) {
    const a = rand(TAU), s = rand(40, 140);
    spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(40, 120), rand(0.4, 0.8), 'px');
  }
}

const WEAPON_UPDATE = {
  bow(w, dt) {
    const p = G.p;
    w.cd -= dt;
    if (w.phase === 'draw') {
      w.t += dt;
      const tg = w.targets.find(e => !e.dead);
      if (tg) p.aim = angleTo(p.x, p.y, tg.x, tg.y - tg.z);
      p.draw = Math.min(1, w.t / 0.13);
      if (w.t >= 0.13) { w.phase = 'shoot'; w.q = 0; w.qT = 0; }
    }
    if (w.phase === 'shoot') {
      w.qT -= dt;
      const n = W(w, 'count') + Stat.amount();
      while (w.q < n && w.qT <= 0) {
        const alive = w.targets.filter(e => !e.dead);
        const tg = alive[w.q % Math.max(1, alive.length)];
        let a = tg ? angleTo(p.x, p.y, tg.x + tg.vx * 0.08, tg.y - tg.z + tg.vy * 0.08) : p.aim;
        if (!tg || w.q >= alive.length) a += (w.q % 2 ? 1 : -1) * 0.1 * Math.ceil(w.q / 2);
        p.aim = a;
        const hx = p.x + Math.cos(a) * 5, hy = p.y + Math.sin(a) * 5 - 1;
        fireArrow(hx, hy, a, { dmg: W(w, 'dmg'), pierce: W(w, 'pierce'), kind: 'arrow' });
        p.recoil = 1;
        Sfx.play('shoot');
        // 활시위 섬광
        spawnPart(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, Math.cos(a) * 60, Math.sin(a) * 60, 0, 0.08, 'spark');
        w.q++; w.qT += 0.065;
        p.draw = w.q < n ? 0.7 : 0;
      }
      if (w.q >= n) { w.phase = 'idle'; p.draw = 0; }
    }
    if (w.phase === 'idle' && w.cd <= 0) {
      const n = W(w, 'count') + Stat.amount();
      const ts = nearestEnemies(p.x, p.y, 175, n);
      if (ts.length) {
        w.targets = ts; w.phase = 'draw'; w.t = 0;
        w.cd = W(w, 'cd') * Stat.cd();
      }
    }
  },

  rain(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const tg = densestPoint();
    if (!tg) return;
    w.cd = W(w, 'cd') * Stat.cd();
    const R = W(w, 'radius') * Stat.area();
    const n = W(w, 'count') + Stat.amount() * 2;
    const cx = tg.x, cy = tg.y;
    G.fx.push({ type: 'mark', x: cx, y: cy, r: R, t: 0, dur: 0.95 });
    Sfx.play('whoosh');
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), rr = Math.sqrt(Math.random()) * R;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const delay = 0.12 + (i / n) * 0.55 + rand(0, 0.05);
      G.fx.push({
        type: 'fall', x, y, t: -delay, dur: 0.2, done: false, dmg: W(w, 'dmg'),
        update(f) {
          if (!f.done && f.t >= f.dur) {
            f.done = true;
            G.grid.query(f.x, f.y, 14, e => {
              if (e.dead) return;
              if (dist2(e.x, e.y - e.z, f.x, f.y) < (e.r + 5) * (e.r + 5)) hurtEnemy(e, f.dmg, 0, 1, 25);
            });
            for (let k = 0; k < 3; k++) spawnPart(f.x, f.y, rand(-30, 30), rand(-20, 10), rand(10, 40), 0.3, 'px');
            Sfx.play('thunk');
            G.fx.push({ type: 'stuck', x: f.x, y: f.y, a: Math.PI / 2, kind: 'arrow', t: 0, dur: 0.7 });
          }
        },
      });
    }
  },

  blast(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const p = G.p;
    const n = W(w, 'count') + Stat.amount();
    const ts = nearestEnemies(p.x, p.y, 200, 12);
    if (!ts.length) return;
    w.cd = W(w, 'cd') * Stat.cd();
    for (let i = 0; i < n; i++) {
      const tg = ts[(i * 3) % ts.length];
      later(i * 0.12, () => {
        const a = angleTo(p.x, p.y, tg.x, tg.y - tg.z) + rand(-0.05, 0.05);
        fireArrow(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5, a, { dmg: W(w, 'dmg'), pierce: 1, kind: 'bolt', spd: 230, life: 1.0, blast: W(w, 'radius') });
        p.recoil = 1.4;
        Sfx.play('shoot');
      });
    }
  },

  falcon() { /* updateFalcons 가 처리 */ },
  feather() { /* updateFeathers 가 처리 */ },

  chain(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const p = G.p;
    const first = nearestEnemies(p.x, p.y, 150, 1)[0];
    if (!first) return;
    w.cd = W(w, 'cd') * Stat.cd();
    const n = W(w, 'count') + Stat.amount();
    const chainR = 58 * Stat.area();
    const seq = [first];
    const seen = new Set([first.id]);
    let cur = first;
    while (seq.length < n) {
      let best = null, bd = chainR * chainR;
      G.grid.query(cur.x, cur.y, chainR, e => {
        if (e.dead || seen.has(e.id)) return;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      });
      if (!best) break;
      seq.push(best); seen.add(best.id); cur = best;
    }
    const pts = [[p.x, p.y - 2]];
    for (const e of seq) pts.push([e.x, e.y - e.z]);
    G.fx.push({ type: 'bolt', pts, t: 0, dur: 0.22 });
    Sfx.play('zap');
    seq.forEach((e, i) => later(i * 0.035, () => {
      if (e.dead) return;
      const a = rand(TAU);
      hurtEnemy(e, W(w, 'dmg'), Math.cos(a), Math.sin(a), 20);
      e.slowT = 0.6;
    }));
  },

  nova(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    if (!G.enemies.some(e => !e.dead && onScreen(e))) return;
    w.cd = W(w, 'cd') * Stat.cd();
    const p = G.p;
    const n = W(w, 'count') + Stat.amount() * 2;
    w.off = (w.off || 0) + Math.PI / n;
    for (let i = 0; i < n; i++) {
      const a = w.off + (i / n) * TAU;
      fireArrow(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4 - 1, a, { dmg: W(w, 'dmg'), pierce: W(w, 'pierce'), kind: 'dart', spd: 230, life: 0.7, kb: 30 });
    }
    fxRing(p.x, p.y, 3, 14, 0.2, 1);
    Sfx.play('whoosh');
    Sfx.play('shoot');
  },

  trap(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const n = W(w, 'count');
    const mine = G.traps.filter(t => t.state === 'armed');
    if (mine.length >= n) return;
    w.cd = W(w, 'cd') * Stat.cd();
    const p = G.p;
    G.traps.push({ x: p.x + rand(-6, 6), y: p.y + 6 + rand(-3, 3), state: 'armed', t: 0, dmg: W(w, 'dmg') });
    Sfx.play('snap');
  },
};

function updateTraps(dt) {
  for (const t of G.traps) {
    t.t += dt;
    if (t.state === 'armed') {
      let hit = null;
      G.grid.query(t.x, t.y, 12, e => {
        if (e.dead || e.z > 2 || (e.d && e.d.fly)) return false;
        if (dist2(e.x, e.y, t.x, t.y) < (e.r + 4) * (e.r + 4)) { hit = e; return true; }
        return false;
      });
      if (hit) {
        t.state = 'shut'; t.t = 0;
        const R = 14 * Stat.area();
        G.grid.query(t.x, t.y, R + 8, e => {
          if (e.dead) return;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d > R + e.r) return;
          hurtEnemy(e, e === hit ? t.dmg : t.dmg * 0.5, 0, -1, 10);
          e.rootT = 1.3;
        });
        fxRing(t.x, t.y, 2, R, 0.3, 1);
        Sfx.play('snap');
        addShake(0.06);
      }
      if (t.t > 40) t.state = 'gone';
    } else if (t.state === 'shut' && t.t > 0.7) t.state = 'gone';
  }
  G.traps = G.traps.filter(t => t.state !== 'gone');
}

// ── 매 ──
function syncFalcons(w) {
  const n = W(w, 'count');
  while (G.falcons.length < n) {
    const p = G.p;
    G.falcons.push({ x: p.x, y: p.y - 20, vx: 0, vy: 0, st: 'orbit', ang: rand(TAU), t: 0, cd: rand(0.3, 1), target: null, trail: [] });
  }
}
function updateFalcons(dt) {
  const w = G.weapons.find(x => x.id === 'falcon');
  if (!w) return;
  const p = G.p;
  const n = G.falcons.length;
  G.falcons.forEach((f, i) => {
    f.t += dt;
    f.trail.unshift([f.x, f.y]);
    if (f.trail.length > 5) f.trail.pop();
    if (f.st === 'orbit') {
      f.ang += dt * 2.3;
      const a = f.ang + (i / n) * TAU;
      const tx = p.x + Math.cos(a) * 22, ty = p.y + Math.sin(a) * 14 - 10;
      f.vx = damp(f.vx, (tx - f.x) * 6, 8, dt);
      f.vy = damp(f.vy, (ty - f.y) * 6, 8, dt);
      f.cd -= dt;
      if (f.cd <= 0) {
        const tg = nearestEnemies(f.x, f.y, 130, 4)[i % 4] || nearestEnemies(f.x, f.y, 130, 1)[0];
        if (tg) { f.st = 'dive'; f.target = tg; f.t = 0; Sfx.play('whoosh'); }
        else f.cd = 0.3;
      }
    } else if (f.st === 'dive') {
      const tg = f.target;
      if (!tg || tg.dead || f.t > 1.4) { f.st = 'return'; f.t = 0; }
      else {
        const spd = W(w, 'speed') * Stat.pspeed();
        const want = angleTo(f.x, f.y, tg.x, tg.y - tg.z);
        const cur = Math.atan2(f.vy, f.vx);
        const na = cur + clamp(angDiff(cur, want), -9 * dt, 9 * dt);
        const s = Math.max(Math.hypot(f.vx, f.vy), spd * 0.6);
        const ns = Math.min(spd, s + spd * 3 * dt);
        f.vx = Math.cos(na) * ns; f.vy = Math.sin(na) * ns;
        if (dist2(f.x, f.y, tg.x, tg.y - tg.z) < (tg.r + 4) * (tg.r + 4)) {
          hurtEnemy(tg, W(w, 'dmg'), Math.cos(na), Math.sin(na), 70);
          f.st = 'return'; f.t = 0;
          f.vx *= -0.4; f.vy = -Math.abs(f.vy) * 0.5 - 40;
        }
      }
    } else {
      const want = angleTo(f.x, f.y, p.x, p.y - 12);
      f.vx = damp(f.vx, Math.cos(want) * 150, 5, dt);
      f.vy = damp(f.vy, Math.sin(want) * 150, 5, dt);
      if (dist2(f.x, f.y, p.x, p.y - 12) < 26 * 26 || f.t > 1.5) { f.st = 'orbit'; f.cd = W(w, 'cd') * Stat.cd(); }
    }
    f.x += f.vx * dt; f.y += f.vy * dt;
  });
}

// ── 바람깃 ──
function updateFeathers(dt) {
  const w = G.weapons.find(x => x.id === 'feather');
  if (!w) return;
  const p = G.p;
  const R = W(w, 'radius') * Stat.area();
  G.featherT -= dt;
  if (G.featherOn) {
    G.featherR = damp(G.featherR, R, 9, dt);
    if (G.featherT <= 0) { G.featherOn = false; G.featherT = 2.2 * Stat.cd(); }
  } else {
    G.featherR = damp(G.featherR, 0, 12, dt);
    if (G.featherT <= 0) { G.featherOn = true; G.featherT = W(w, 'dur'); Sfx.play('whoosh'); }
  }
  G.featherA += dt * 3.6;
  if (G.featherR < 3) return;
  const n = W(w, 'count') + Stat.amount();
  for (let i = 0; i < n; i++) {
    const a = G.featherA + (i / n) * TAU;
    const fx = p.x + Math.cos(a) * G.featherR, fy = p.y + Math.sin(a) * G.featherR;
    G.grid.query(fx, fy, 12, e => {
      if (e.dead) return;
      if ((e.hitCd.feather || 0) > G.t) return;
      if (dist2(e.x, e.y - e.z, fx, fy) < (e.r + 4) * (e.r + 4)) {
        e.hitCd.feather = G.t + 0.45;
        hurtEnemy(e, W(w, 'dmg'), Math.cos(a), Math.sin(a), 80);
      }
    });
  }
}

// ── 업그레이드 선택지 ──
function upgradeChoices(n = 3) {
  const cands = [];
  const wIds = G.weapons.map(w => w.id);
  const pIds = Object.keys(G.passive);
  for (const w of G.weapons) if (w.L < WEAPON_MAX) cands.push({ kind: 'w', id: w.id, wt: 1.3 });
  if (G.weapons.length < SLOT_MAX) for (const id in WEAPONS) if (!wIds.includes(id)) cands.push({ kind: 'w', id, wt: G.weapons.length < 3 ? 1.4 : 0.9 });
  for (const id of pIds) if (G.passive[id] < PASSIVES[id].max) cands.push({ kind: 'p', id, wt: 1.0 });
  if (pIds.length < SLOT_MAX) for (const id in PASSIVES) if (!pIds.includes(id)) cands.push({ kind: 'p', id, wt: PASSIVES[id].market ? 0.7 : 0.8 });
  const out = [];
  while (out.length < n && cands.length) {
    const tot = cands.reduce((s, c) => s + c.wt, 0);
    let r = rand(tot), i = 0;
    for (; i < cands.length; i++) { r -= cands[i].wt; if (r <= 0) break; }
    i = Math.min(i, cands.length - 1);
    out.push(cands[i]); cands.splice(i, 1);
  }
  if (out.length < n) out.push({ kind: 'x', id: 'heal' });
  if (out.length < n) out.push({ kind: 'x', id: 'bonus' });
  return out;
}

function applyChoice(c) {
  if (c.kind === 'w') {
    const w = G.weapons.find(x => x.id === c.id);
    if (w) levelWeapon(w); else addWeapon(c.id);
  } else if (c.kind === 'p') {
    G.passive[c.id] = (G.passive[c.id] || 0) + 1;
    if (c.id === 'vital') { G.p.maxHp += 20; G.p.hp += 20; }
  } else if (c.id === 'heal') {
    healPlayer(40);
  } else if (c.id === 'bonus') {
    addXP(Math.round(G.xpNext * 0.4));
  }
}

function choiceInfo(c) {
  if (c.kind === 'w') {
    const d = WEAPONS[c.id];
    const w = G.weapons.find(x => x.id === c.id);
    const L = w ? w.L : 0;
    return { name: d.name, icon: d.icon, isNew: !w, lv: L + 1, max: WEAPON_MAX, desc: w ? d.lv[L] : d.desc, tag: '무기' };
  }
  if (c.kind === 'p') {
    const d = PASSIVES[c.id];
    const L = G.passive[c.id] || 0;
    return { name: d.name, icon: d.icon, isNew: !L, lv: L + 1, max: d.max, desc: d.desc, tag: d.market ? '시장' : '능력' };
  }
  if (c.id === 'heal') return { name: '응급 처치', icon: 'heal', isNew: false, lv: 0, max: 0, desc: '체력 40 회복', tag: '보너스' };
  return { name: '성과급', icon: 'bonus', isNew: false, lv: 0, max: 0, desc: '경험치 즉시 지급', tag: '보너스' };
}
