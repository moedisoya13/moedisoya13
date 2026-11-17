// 암흑기사 (heavy) — GDD §6.2 / §6.3. Walks slowly after the hero; the body turns at most
// 100°/s. Front guard: a direct hit (slash, pierce, whirl, wave, echo, riposte, dash) arriving
// within 60° of its facing (the front 120°) deals 20 % — unless the hero's stats carry
// mods.ignoreGuard (armor_break). Burn, chain, burst, steam and slam are not direct and ignore it.
// Charge: hero within 5u and inside the front 60° → a 1.4u × 5u rectangle fills over 0.9 s,
// then the knight runs it at 10u/s (20 on contact). Afterwards 1.4 s of opening (no turning,
// no moving); 2.8 s if the run ended against a wall or obstacle. Charge cooldown 3.5 s.
// Guardian 암흑기사 단장: 7u charge, then a radius-2.2 sweep around itself (0.6 s, 20 × 1.3).
// Counterplay (§6.5): lure the charge into a wall, strike its back during the opening.
const A = BD.ai;
const M = BD.math;

const T = {
  turn: 100, guardHalf: 60, guardMul: 0.2,
  range: 5, coneHalf: 30, width: 1.4, len: 5, guardianLen: 7, tgTime: 0.9, chargeSpeed: 10,
  recover: 1.4, wallRecover: 2.8, cd: 3.5,
  sweepR: 2.2, sweepTime: 0.6,
  fizzle: 0.3, // knocked this far off the announced line during the wind-up → the charge is dropped
};

// How far a charge along dir can go, capped at max: `body` = how far the centre travels before
// the body (radius r) first touches a wall, obstacle or void cell — the lunge stops and slams
// there — and `line` = the free run of the centre line itself.
function clearRun(grid, x, y, dir, max, r) {
  const cx = Math.cos(dir), cy = Math.sin(dir), step = 0.05;
  let body = -1, line = -1, d = 0;
  while (d < max && (body < 0 || line < 0)) {
    const nd = Math.min(max, d + step), px = x + cx * nd, py = y + cy * nd;
    if (line < 0 && !grid.walkable(Math.floor(px), Math.floor(py))) line = d;
    if (body < 0 && BD.nav.resolve(grid, px, py, r)[2]) body = d;
    d = nd;
  }
  return { body: body < 0 ? max : body, line: line < 0 ? max : line };
}

function startCharge(w, e) {
  const m = e.mem;
  const dir = A.angleToHero(w, e);
  e.face = dir;
  m.windup = true; e.state = 'windup'; e.squash = 1;
  // Elite / guardian telegraphs scale ×1.2 / ×1.4 (§6.3); the guardian's 7u is its own fixed
  // number (§6.3 table), so the length is set here and scaling is applied by hand.
  // The warning stops where the run will end: where the body (whose hitbox reaches half the
  // warned width ahead of it) meets a wall, obstacle or void edge — head-on or with a shoulder
  // (slam) — and never past the wall in front of the centre line.
  const k = e.tgScale, full = e.guardian ? T.guardianLen : T.len * k, hb = (T.width * k) / 2;
  const [sx, sy] = BD.nav.resolve(w.grid, e.x, e.y, e.r + 0.02);
  const run = clearRun(w.grid, sx, sy, dir, full, e.r);
  A.telegraph(w, e, {
    shape: 'line', x: e.x, y: e.y, dir, len: Math.min(full, run.body + hb, run.line), width: T.width * k,
    noScale: true, time: T.tgTime, dmg: 0, danger: true, attack: 'charge',
    onFire(w2, tg) {
      m.windup = false; m.cd = T.cd;
      if (M.dist(e.x, e.y, tg.x, tg.y) > T.fizzle) { m.recoverT = T.recover; A.release(w2, e); return; }
      // the body (hitbox radius = half the warned width) stays inside the warned rectangle; a run
      // cut short by a wall is planned to the full length so the body still reaches the wall
      const hb = tg.width / 2, run = Math.max(0, full - hb);
      e.face = tg.dir;
      // step 0.02u off any wall it stands flush against, so running along a wall is not a slam
      [e.x, e.y] = BD.nav.resolve(w2.grid, e.x, e.y, e.r + 0.02);
      A.lunge(w2, e, e.x + Math.cos(tg.dir) * run, e.y + Math.sin(tg.dir) * run, run / T.chargeSpeed,
        { hitbox: { r: hb, dmg: e.dmg, attack: 'charge', noScale: true } });
      m.charging = true;
    },
  });
}

function endCharge(w, e) {
  const m = e.mem;
  m.charging = false;
  const wall = !!(e.lastLunge && e.lastLunge.wall);
  if (wall) {
    e.stunT = Math.max(e.stunT, T.wallRecover); // engine shows the stagger; update pauses
    BD.W.emit(w, 'vfx', { kind: 'knight_slam', x: e.x + Math.cos(e.face) * e.r, y: e.y + Math.sin(e.face) * e.r, life: 0.6 });
  } else m.recoverT = T.recover;
  A.release(w, e);
  if (e.guardian) {
    A.telegraph(w, e, { shape: 'circle', x: e.x, y: e.y, r: T.sweepR, noScale: true, time: T.sweepTime, attack: 'sweep' });
  }
}

BD.enemies.register({
  id: 'dark_knight', name: '암흑기사', type: 'heavy', sprite: 'dark_knight',
  hp: 360, speed: 2.0, dmg: 20, radius: 0.55, cost: 6, // tuned: GDD HP 120
  knockScale: 0.33,
  attacks: { charge: { name: '돌격', sfx: 'charge' }, sweep: { name: '휩쓸기', sfx: 'boss_cleave' } },
  T,
  guardian: { name: '암흑기사 단장' }, // 7u charge and the sweep are read from e.guardian
  // Front guard (§6.2). info = {source, direct, fromX, fromY}
  defense(e, w, info) {
    if (!info.direct) return 1;
    const h = w.hero;
    if (h.stats && h.stats.mods && h.stats.mods.ignoreGuard) return 1;
    const fx = info.fromX !== undefined ? info.fromX : h.x, fy = info.fromY !== undefined ? info.fromY : h.y;
    const a = Math.atan2(fy - e.y, fx - e.x);
    if (M.angDiff(a, e.face) > T.guardHalf * M.DEG) return 1;
    const sx = M.round(e.x + Math.cos(a) * e.r, 3), sy = M.round(e.y + Math.sin(a) * e.r, 3);
    BD.W.emit(w, 'guard', { enemyId: e.id, x: sx, y: sy });
    BD.W.emit(w, 'vfx', { kind: 'guard_spark', x: sx, y: sy, dir: a, life: 0.3 });
    return T.guardMul;
  },
  create(e, w) { e.mem.cd = A.rng(w).range(0.8, 2.0); e.mem.recoverT = 0; },
  update(e, w, dt) {
    const m = e.mem;
    m.cd -= dt;
    if (m.charging) {
      if (e.lunge) { e.state = 'charge'; return; }
      endCharge(w, e);
      return;
    }
    if (m.windup) { e.state = 'windup'; return; }
    if (m.recoverT > 0) { m.recoverT -= dt; e.state = 'recover'; return; }
    const want = A.angleToHero(w, e);
    A.turn(e, want, T.turn * M.DEG, dt);
    const ed = A.edgeDist(w, e);
    if (A.canAttack(w, e) && m.cd <= 0 && ed <= T.range && M.angDiff(want, e.face) <= T.coneHalf * M.DEG && A.slot(w, e, 'melee')) {
      startCharge(w, e);
      return;
    }
    if (ed > BD.C.ENEMY.keepOut + 0.02) {
      const [dx, dy] = A.dirToHero(w, e);
      A.move(w, e, dx * e.speed * dt, dy * e.speed * dt);
      e.state = 'move';
    } else e.state = 'idle';
  },
});

// Front-guard arc on the floor: the 120° the guard covers, steel blue, brighter when it just blocked.
BD.render.decor.register({
  id: 'dark_knight_guard',
  target: 'dark_knight',
  draw(g, v, e) {
    if (e.state === 'charge') return;
    const r = e.r + 0.25, h = T.guardHalf * M.DEG, pts = [];
    for (let i = 0; i <= 16; i++) { const a = e.face - h + (2 * h * i) / 16; pts.push(v.proj(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 4)); }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]);
    g.lineCap = 'round';
    g.strokeStyle = BD.ui.INK; g.lineWidth = 6; g.stroke();
    g.strokeStyle = e.state === 'recover' || e.stunT > 0 ? '#5d6475' : '#9fb4d8'; g.lineWidth = 3; g.stroke();
    g.lineCap = 'butt';
  },
});

// Guard spark: white star burst where the blow glanced off (no orange).
BD.render.vfx.register({
  id: 'guard_spark',
  draw(g, v, ev, k) {
    const c = v.proj(ev.x, ev.y, 34);
    g.save(); g.translate(c[0], c[1]);
    g.globalAlpha = 1 - k;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * M.TAU + 0.4, L = 6 + 16 * k;
      g.beginPath(); g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3); g.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      g.strokeStyle = BD.ui.INK; g.lineWidth = 4; g.stroke();
      g.strokeStyle = i % 2 ? '#ffffff' : '#bfe0ff'; g.lineWidth = 2; g.stroke();
    }
    g.font = BD.ui.font(18, 900); g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = BD.ui.INK; g.strokeText('팅!', 0, -18 - 10 * k);
    g.fillStyle = '#ffffff'; g.fillText('팅!', 0, -18 - 10 * k);
    g.restore();
  },
});

// Wall slam: dust ring and a heavy "쾅" where the charge hit the wall.
BD.render.vfx.register({
  id: 'knight_slam',
  draw(g, v, ev, k) {
    const R = BD.client.render;
    g.globalAlpha = 1 - k;
    R.ellipse(g, v, ev.x, ev.y, 0.3 + 1.1 * k, null, '#d9d2c3', 4);
    const c = v.proj(ev.x, ev.y, 50 + 14 * k);
    g.font = BD.ui.font(24, 900); g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = BD.ui.INK; g.strokeText('쾅!', c[0], c[1]);
    g.fillStyle = '#ffffff'; g.fillText('쾅!', c[0], c[1]);
    g.globalAlpha = 1;
  },
});
