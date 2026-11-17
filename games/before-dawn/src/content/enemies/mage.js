// 마도사 (magic) — GDD §6.2 / §6.3. Walks to keep 4–7u from the hero. When the hero stays
// within 2.0u for 0.5 s it teleports to a free cell at least 6u from the hero (the arrival
// point is marked for 0.4 s; teleport cooldown 5 s; not while bound — mana_backlash's `bind`).
// Fire circle: a radius-1.3 circle where the hero stood fills over 1.1 s, hits for 12 and
// leaves a 2.5 s fire zone (3 every 0.5 s to the hero inside; enemies inside catch fire).
// No line of sight needed. Guardian 대마도사: three circles at once (the hero's spot and 2.2u to
// either side, across the mage→hero line); teleport cooldown 4 s.
// Counterplay (§6.5): lure the circle onto other enemies; strike in the 5 s after a teleport.
const A = BD.ai;
const M = BD.math;

const T = {
  keepMin: 4, keepMax: 7, castMax: 9,          // edgeDist band; no cast from farther than castMax
  near: 2.0, nearTime: 0.5, blinkMin: 6, blinkTg: 0.4, blinkCd: 5, guardianBlinkCd: 4,
  tgR: 1.3, tgTime: 1.1, cd: 3.0, side: 2.2, // tgTime 1.1: docs/CONTROLS-REVIEW.md §3.1
  zoneLife: 2.5, zoneTick: 0.5, zoneDmg: 3,
  strafe: 0.45,                                // fraction of speed used to drift sideways in band
};

function startBlink(w, e) {
  const m = e.mem, h = w.hero;
  const cells = [];
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
    if (!w.grid.walkable(x, y)) continue;
    const cx = x + 0.5, cy = y + 0.5;
    if (M.dist(cx, cy, h.x, h.y) < T.blinkMin) continue;
    if (w.field && w.field[y * w.grid.w + x] < 0) continue;
    let free = true;
    for (const o of w.enemies) if (o !== e && !o.dead && M.dist(o.x, o.y, cx, cy) < o.r + e.r + 0.3) { free = false; break; }
    if (free) cells.push([cx, cy]);
  }
  if (!cells.length) { m.blinkCdT = 1; return; }
  const [tx, ty] = A.rng(w).pick(cells);
  m.blinking = true; e.state = 'cast';
  A.telegraph(w, e, {
    shape: 'circle', x: tx, y: ty, r: e.r + 0.25, time: T.blinkTg, dmg: 0, danger: false,
    attack: 'blink', style: 'blink', noScale: true,
    onFire(w2) {
      m.blinking = false; m.nearT = 0;
      m.blinkCdT = e.guardian ? T.guardianBlinkCd : T.blinkCd;
      if (e.statuses.bind) return; // bound while channelling: the teleport fizzles
      const fx = e.x, fy = e.y;
      const [x, y] = BD.nav.resolve(w2.grid, tx, ty, e.r);
      e.x = x; e.y = y; e.face = A.angleToHero(w2, e);
      BD.W.emit(w2, 'vfx', { kind: 'mage_blink', from: [fx, fy], to: [x, y], life: 0.45 });
    },
  });
}

function castFire(w, e) {
  const m = e.mem, h = w.hero;
  m.cd = T.cd;
  e.squash = 1;
  const spots = [[h.x, h.y]];
  if (e.guardian) {
    const a = A.angleToHero(w, e), px = -Math.sin(a), py = Math.cos(a);
    spots.push([h.x + px * T.side, h.y + py * T.side], [h.x - px * T.side, h.y - py * T.side]);
  }
  let left = spots.length;
  for (const [x, y] of spots) {
    A.telegraph(w, e, {
      shape: 'circle', x, y, r: T.tgR, time: T.tgTime, attack: 'fire_circle',
      onFire(w2, tg) {
        A.zone(w2, e, {
          kind: 'mage_fire', x: tg.x, y: tg.y, r: tg.r, life: T.zoneLife, tick: T.zoneTick,
          dmg: Math.round(T.zoneDmg * e.dmgMul), attack: 'fire_zone', igniteEnemies: true,
        });
        if (--left <= 0) A.release(w2, e);
      },
    });
  }
}

BD.enemies.register({
  id: 'mage', name: '마도사', type: 'magic', sprite: 'mage',
  hp: 30, speed: 2.0, dmg: 12, radius: 0.35, cost: 2.5, role: 'threat', shards: 4, // HP: GDD-V2 §3.2 (v1 tuned 54)
  attacks: { fire_circle: { name: '불 원', sfx: 'fire_circle' }, fire_zone: { name: '불 장판' } }, // the blink warning sounds by its style
  T,
  guardian: { name: '대마도사' }, // three circles and the 4 s teleport are read from e.guardian
  create(e, w) {
    const r = A.rng(w);
    e.mem.cd = r.range(0.6, 1.8); e.mem.blinkCdT = 0; e.mem.nearT = 0;
    e.mem.side = r.chance(0.5) ? 1 : -1; e.mem.sideT = r.range(1.5, 3);
  },
  update(e, w, dt) {
    const m = e.mem;
    m.cd -= dt; m.blinkCdT -= dt;
    if (m.blinking) { e.state = 'cast'; return; } // channels in place
    const ed = A.edgeDist(w, e);
    m.nearT = ed <= T.near ? m.nearT + dt : 0;
    if (m.nearT >= T.nearTime && m.blinkCdT <= 0 && !e.statuses.bind) { startBlink(w, e); if (m.blinking) return; }
    if (A.canAttack(w, e) && m.cd <= 0 && ed <= T.castMax && A.slot(w, e, 'ranged')) castFire(w, e);
    const st = A.keepRange(w, e, T.keepMin, T.keepMax, e.speed, dt);
    if (st === 'in') {
      m.sideT -= dt;
      if (m.sideT <= 0) { m.side = -m.side; m.sideT = A.rng(w).range(1.5, 3); }
      A.orbit(w, e, e.speed * T.strafe, dt, m.side);
      e.state = 'move';
    } else e.state = st === 'near' ? 'retreat' : 'move';
    e.face = A.angleToHero(w, e);
  },
});

// Fire zone: red flames with a white core, ink rim (white flames on the red heavy floor, §6.1).
BD.render.zones.register({
  id: 'mage_fire',
  draw(g, v, z, w, t) {
    const R = BD.client.render, heavy = w.floor.domType === 'heavy';
    const outer = heavy ? '255,255,255' : '214,40,40';
    const fade = Math.min(1, z.life / 0.4, z.age / 0.15);
    R.ellipse(g, v, z.x, z.y, z.r, 'rgba(' + outer + ',' + (0.32 * fade) + ')', BD.ui.INK, 2.5);
    R.ellipse(g, v, z.x, z.y, z.r * 0.55, 'rgba(255,255,255,' + (0.35 * fade) + ')', null);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * M.TAU + z.id, rr = z.r * (0.35 + 0.5 * ((i * 37) % 10) / 10);
      const b = v.proj(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
      const fl = (10 + 6 * Math.sin(t * 14 + i * 1.7 + z.id)) * fade;
      R.poly(g, [[b[0] - 4, b[1]], [b[0], b[1] - fl], [b[0] + 4, b[1]]]);
      g.fillStyle = heavy ? '#ffffff' : '#d62828'; g.fill(); R.ink(g, 1);
    }
  },
});

// Teleport: a violet streak from the old spot to the new one.
BD.render.vfx.register({
  id: 'mage_blink',
  draw(g, v, ev, k) {
    const a = v.proj(ev.from[0], ev.from[1], 30), b = v.proj(ev.to[0], ev.to[1], 30);
    g.globalAlpha = 1 - k;
    g.setLineDash([8, 6]); g.strokeStyle = '#b48cff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
    for (const p of [a, b]) { g.beginPath(); g.arc(p[0], p[1], 10 + 18 * k, 0, M.TAU); g.strokeStyle = '#d9c4ff'; g.stroke(); }
    g.globalAlpha = 1;
  },
});
