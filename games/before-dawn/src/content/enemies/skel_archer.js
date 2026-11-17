// 해골 궁수 (undead threat) — GDD-V2 §3.2. **Holds its ground**: it walks toward the hero until it is
// within 6u of him (edge distance) with a clear line, then stops and shoots from that spot. When he
// comes within 2u it steps back 3u — at most once every 6 s — and holds again; only when he is farther
// than 9u does it walk again. (v1 kept backing off inside 3.5u, which made the player chase it.)
// Shot: a 0.3u-wide line from the archer through the hero, at most 12u long (it stops at the first
// wall or obstacle), filled over 0.8 s, then an arrow at 14u/s for 8 along that fixed line (blocked
// by obstacles, passes over void). Without a line of sight it walks to the nearest spot within 6u of
// the hero that has one. Guardian 해골 명궁: three lines and arrows at −15°, 0°, +15°; it moves only
// inside the stairs zone.
// Counterplay (§6.2): use obstacles as cover and approach along them; dash across the line.
const A = BD.ai;
const M = BD.math;

const T = {
  hold: 6, leave: 9,                        // edge distance: stops within `hold`, walks again beyond `leave`
  tooClose: 2, backDist: 3, backEvery: 6,   // the step back: 3u, at most once per 6 s
  width: 0.3, tgTime: 0.8, arrowSpeed: 14, cd: 2.4,
  lineMax: 12,                              // §3.2 / §5.6-3: a shot's line (and range) is at most 12u
  fan: 15,                                  // guardian spread (deg)
  repathEvery: 0.5,                         // seconds between line-of-sight searches
  blindFor: 0.5,                            // holding without a line of sight this long → walk to one
};

// Line of sight from (x, y) to the hero for a 0.3u-wide shot (centre ray).
function los(w, x, y) { return BD.nav.losClear(w.grid, x, y, w.hero.x, w.hero.y); }

// The way back: of 8 bearings plus straight away, the one that ends farthest from the hero.
function backDir(w, e) {
  const h = w.hero, away = Math.atan2(e.y - h.y, e.x - h.x);
  let best = null;
  for (let i = 0; i <= 8; i++) {
    const a = i === 8 ? away : away + ((i - 4) / 8) * Math.PI * 1.5;
    const [x, y] = BD.nav.move(w.grid, e.x, e.y, Math.cos(a) * 0.8, Math.sin(a) * 0.8, e.r);
    const d = M.dist(x, y, h.x, h.y) + (i === 8 ? 0.05 : 0);
    if (!best || d > best.d) best = { d, a };
  }
  return best.a;
}

// A standing spot within `hold` of the hero with a clear line to him, nearest to the archer.
function sightSpot(w, e) {
  const h = w.hero;
  let best = null;
  for (const rad of [T.hold - 2, T.hold - 0.5]) {
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
    const len = Math.min(T.lineMax, BD.nav.rayLen(w.grid, e.x, e.y, dir, T.lineMax));
    // the line ends at the wall (or 12u), so only its width takes the elite/guardian scale (§6.3)
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
  hp: 20, speed: 2.6, dmg: 8, radius: 0.35, cost: 1.5, role: 'threat', shards: 3, // GDD-V2 §3.2 (v1 tuned: 40 HP, 9)
  attacks: { shot: { name: '사격' } },
  T,
  guardian: { name: '해골 명궁', update(e, w) { BD.foes.clamp(w, e); } }, // three arrows: e.guardian in shoot()
  create(e, w) {
    e.mem.cd = A.rng(w).range(0.8, 1.8);
    e.mem.repT = 0; e.mem.mode = 'walk'; e.mem.backCd = 0; e.mem.blindT = 0;
    BD.foes.born(e, w);
  },
  update(e, w, dt) {
    const m = e.mem;
    m.cd -= dt; m.backCd -= dt;
    if (m.aiming) { e.state = 'windup'; return; } // stands still while the line fills
    const ed = A.edgeDist(w, e);
    const sight = los(w, e.x, e.y);
    if (m.mode === 'back') {
      const moved = A.move(w, e, Math.cos(m.backDir) * e.speed * dt, Math.sin(m.backDir) * e.speed * dt);
      m.backLeft -= moved;
      e.face = A.angleToHero(w, e); e.state = 'retreat';
      if (m.backLeft <= 0 || moved < e.speed * dt * 0.3) m.mode = 'hold'; // done, or cornered
      return;
    }
    if (m.mode === 'hold') {
      m.blindT = sight ? 0 : m.blindT + dt;
      if (ed > T.leave || m.blindT >= T.blindFor) m.mode = 'walk';
      else {
        if (ed < T.tooClose && m.backCd <= 0) { m.mode = 'back'; m.backCd = T.backEvery; m.backLeft = T.backDist; m.backDir = backDir(w, e); return; }
        e.face = A.angleToHero(w, e); e.state = 'idle';
        if (A.canAttack(w, e) && m.cd <= 0 && sight && BD.foes.slot(w, e, 'ranged')) shoot(w, e);
        return;
      }
    }
    // walk: to within `hold` of the hero with a line of sight
    if (sight && ed <= T.hold) { m.mode = 'hold'; m.blindT = 0; m.spot = null; e.state = 'idle'; return; }
    if (!sight) {
      m.repT -= dt;
      if (m.repT <= 0 || !m.spot) { m.repT = T.repathEvery; m.spot = sightSpot(w, e); }
      if (m.spot) { if (A.goTo(w, e, m.spot.x, m.spot.y, e.speed, dt)) m.spot = null; e.state = 'move'; return; }
    }
    A.chase(w, e, e.speed, dt, T.hold - 0.3); e.state = 'move';
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
