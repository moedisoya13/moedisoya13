// 해골 궁수 (undead) — GDD §6.2 / §6.3. Keeps 5–7u from the hero, backs off inside 3.5u,
// moves to regain line of sight when an obstacle is in the way. Shot: a 0.3u-wide line from
// the archer through the hero to the first wall/obstacle, filled over 0.8 s, then an arrow at
// 14u/s for 9 along that fixed line (blocked by obstacles, passes over void).
// Guardian 해골 명궁: three lines and arrows at −15°, 0°, +15°.
// Counterplay (§6.2): use obstacles as cover and approach along them; dash across the line.
const A = BD.ai;
const M = BD.math;

const T = {
  keepMin: 5, keepMax: 7, tooClose: 3.5,   // edgeDist band; backs off when the hero comes inside tooClose
  width: 0.3, tgTime: 0.8, arrowSpeed: 14, cd: 2.4,
  shootMax: 9,                              // never opens a line from farther than this (edgeDist)
  fan: 15,                                  // guardian spread (deg)
  repathEvery: 0.5,                         // seconds between line-of-sight searches
  stuckTime: 0.6,                           // cornered for this long → shoots instead of backing off
};

// Line of sight from (x, y) to the hero for a 0.3u-wide shot (centre ray).
function los(w, x, y) { return BD.nav.losClear(w.grid, x, y, w.hero.x, w.hero.y); }

// Back off: of 8 bearings plus straight away, take the one that ends farthest from the hero.
function backOff(w, e, dt) {
  const h = w.hero, m = e.mem;
  if (!(m.backT > 0) || !m.backDir) {
    const away = Math.atan2(e.y - h.y, e.x - h.x);
    let best = null;
    for (let i = 0; i <= 8; i++) {
      const a = i === 8 ? away : away + ((i - 4) / 8) * Math.PI * 1.5;
      const [x, y] = BD.nav.move(w.grid, e.x, e.y, Math.cos(a) * 0.8, Math.sin(a) * 0.8, e.r);
      const d = M.dist(x, y, h.x, h.y) + (i === 8 ? 0.05 : 0);
      if (!best || d > best.d) best = { d, a };
    }
    m.backDir = best.a; m.backT = 0.3;
  }
  m.backT -= dt;
  const moved = A.move(w, e, Math.cos(m.backDir) * e.speed * dt, Math.sin(m.backDir) * e.speed * dt);
  e.face = A.angleToHero(w, e);
  return moved;
}

// A standing spot 5–7u from the hero with a clear line to it, nearest to the archer.
function sightSpot(w, e) {
  const h = w.hero;
  let best = null;
  for (const rad of [T.keepMin + 0.5, (T.keepMin + T.keepMax) / 2, T.keepMax - 0.5]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * M.TAU;
      const x = h.x + Math.cos(a) * (rad + e.r), y = h.y + Math.sin(a) * (rad + e.r);
      if (!w.grid.walkable(Math.floor(x), Math.floor(y))) continue;
      if (w.field && w.field[Math.floor(y) * w.grid.w + Math.floor(x)] < 0) continue;
      if (!los(w, x, y)) continue;
      const d = M.dist(e.x, e.y, x, y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
}

function shoot(w, e) {
  const m = e.mem;
  m.aiming = true; e.state = 'windup'; e.squash = 1;
  const base = A.angleToHero(w, e);
  e.face = base;
  const dirs = e.guardian ? [base - T.fan * M.DEG, base, base + T.fan * M.DEG] : [base];
  let left = dirs.length;
  for (const dir of dirs) {
    const len = BD.nav.rayLen(w.grid, e.x, e.y, dir, 40);
    // the line ends at the wall, so only its width takes the elite/guardian scale (§6.3)
    A.telegraph(w, e, {
      shape: 'line', x: e.x, y: e.y, dir, len, width: T.width * e.tgScale, noScale: true, time: T.tgTime,
      dmg: 0, danger: true, attack: 'shot',
      onFire(w2, tg) {
        A.projectile(w2, e, { x: tg.x, y: tg.y, dir: tg.dir, speed: T.arrowSpeed, range: tg.len, r: tg.width / 2, kind: 'arrow', attack: 'shot' });
        if (--left <= 0) { m.aiming = false; m.cd = T.cd; A.release(w2, e); }
      },
    });
  }
}

BD.enemies.register({
  id: 'skel_archer', name: '해골 궁수', type: 'undead', sprite: 'skeleton_archer',
  hp: 25, speed: 2.6, dmg: 9, radius: 0.35, cost: 1.5,
  attacks: { shot: { name: '사격' } },
  T,
  guardian: { name: '해골 명궁' }, // the three-arrow fan is read from e.guardian in shoot()
  create(e, w) {
    e.mem.cd = A.rng(w).range(0.8, 1.8);
    e.mem.repT = 0; e.mem.retreat = false; e.mem.stuckT = 0;
  },
  update(e, w, dt) {
    const m = e.mem;
    m.cd -= dt;
    if (m.aiming) { e.state = 'windup'; return; } // stands still while the line fills
    const ed = A.edgeDist(w, e);
    const sight = los(w, e.x, e.y);
    if (ed < T.tooClose) m.retreat = true;
    else if (ed >= T.keepMin) { m.retreat = false; m.stuckT = 0; }
    if (m.retreat && m.stuckT < T.stuckTime) {
      const moved = backOff(w, e, dt);
      m.stuckT = moved < e.speed * dt * 0.3 ? m.stuckT + dt : 0;
      e.state = 'retreat';
      return;
    }
    if (A.canAttack(w, e) && m.cd <= 0 && sight && ed <= T.shootMax && A.slot(w, e, 'ranged')) {
      m.stuckT = 0;
      shoot(w, e);
      return;
    }
    if (!sight) {
      m.repT -= dt;
      if (m.repT <= 0 || !m.spot) { m.repT = T.repathEvery; m.spot = sightSpot(w, e); }
      if (m.spot) { e.state = A.goTo(w, e, m.spot.x, m.spot.y, e.speed, dt) ? 'idle' : 'move'; return; }
      A.chase(w, e, e.speed, dt, T.keepMin); e.state = 'move';
      return;
    }
    m.spot = null;
    if (ed > T.keepMax) { A.chase(w, e, e.speed, dt, T.keepMax); e.state = 'move'; return; }
    e.state = 'idle';
    e.face = A.angleToHero(w, e);
  },
});

// Arrow: ink outline, white shaft, red head and fletching (§6.1: no orange; white on the red floor).
BD.render.projectiles.register({
  id: 'arrow',
  draw(g, v, p, w) {
    const red = w.floor.domType === 'heavy' ? '#ffffff' : '#d62828';
    const cx = Math.cos(p.dir), cy = Math.sin(p.dir);
    const tip = v.proj(p.x + cx * 0.25, p.y + cy * 0.25, 20), tail = v.proj(p.x - cx * 0.55, p.y - cy * 0.55, 20);
    g.lineCap = 'round';
    g.strokeStyle = BD.ui.INK; g.lineWidth = 6; g.beginPath(); g.moveTo(tail[0], tail[1]); g.lineTo(tip[0], tip[1]); g.stroke();
    g.strokeStyle = '#f3ead8'; g.lineWidth = 2.5; g.stroke();
    const [sx, sy] = M.norm(tip[0] - tail[0], tip[1] - tail[1]);
    BD.client.render.poly(g, [[tip[0] + sx * 6, tip[1] + sy * 6], [tip[0] - sy * 4, tip[1] + sx * 4], [tip[0] + sy * 4, tip[1] - sx * 4]]);
    g.fillStyle = red; g.fill(); BD.client.render.ink(g, 1.5);
    BD.client.render.poly(g, [[tail[0], tail[1]], [tail[0] - sx * 6 - sy * 4, tail[1] - sy * 6 + sx * 4], [tail[0] + sx * 3, tail[1] + sy * 3], [tail[0] - sx * 6 + sy * 4, tail[1] - sy * 6 - sx * 4]]);
    g.fillStyle = red; g.fill(); BD.client.render.ink(g, 1.2);
    g.lineCap = 'butt';
  },
});
