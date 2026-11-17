// Hero: movement, collision, the shoulder dash (§2.4) and the auto-attack rules (§2.3).

const C = BD.C;
const M = BD.math;
const H = BD.hero = {};

H.create = function (w) {
  return {
    x: 0, y: 0, r: C.HERO.radius, hp: C.HERO.maxHp, maxHp: C.HERO.maxHp,
    face: Math.PI * 0.75, aim: 0, aimT: 0, moveX: 0, moveY: 0, moving: false,
    atkTimer: 0, targetId: null, dashCd: 0, dashT: 0, dashDX: 0, dashDY: 0, dashInvuln: 0,
    dashHit: new Set(), dodged: new Set(), invuln: 0, radiance: 0, dead: false,
    pose: 'idle', poseT: 0, swingT: 0, lastMoved: 0,
    stats: H.baseStats(0),
  };
};

// Per-tick attack stats. Cards adjust them in their stats(ctx, s) hook.
H.baseStats = function (radiance) {
  return {
    reach: C.HERO.reach, interval: C.HERO.interval, halfArc: C.HERO.halfArc,
    acquireRange: 0, dmgBase: C.HERO.dmg + radiance, charged: false, mods: {},
  };
};

H.computeStats = function (w) {
  const s = H.baseStats(w.hero.radiance);
  BD.cardRt.each(w, (card, ctx) => { if (card.def.stats) card.def.stats(ctx, s); });
  s.acquire = Math.max(s.reach, s.acquireRange || 0);
  w.hero.stats = s;
  return s;
};

// Move with sliding against the grid and enemy circles (the hero never pushes enemies).
function moveHero(w, dx, dy, throughEnemies) {
  const h = w.hero;
  let [x, y] = BD.nav.move(w.grid, h.x, h.y, dx, dy, h.r);
  if (!throughEnemies) {
    for (let it = 0; it < 2; it++) for (const e of w.enemies) {
      if (!BD.W.alive(e)) continue;
      const rr = h.r + e.r, ddx = x - e.x, ddy = y - e.y, d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < rr && d > 1e-6) { x = e.x + (ddx / d) * rr; y = e.y + (ddy / d) * rr; }
    }
    [x, y] = BD.nav.resolve(w.grid, x, y, h.r);
  }
  const moved = M.dist(h.x, h.y, x, y);
  h.x = x; h.y = y;
  return moved;
}

H.update = function (w, dt) {
  const h = w.hero;
  if (h.dead) return 0;
  h.invuln = Math.max(0, h.invuln - dt);
  h.dashInvuln = Math.max(0, h.dashInvuln - dt);
  h.dashCd = Math.max(0, h.dashCd - dt);
  h.aimT = Math.max(0, h.aimT - dt);
  h.swingT = Math.max(0, h.swingT - dt);
  if (h.poseT > 0) { h.poseT -= dt; if (h.poseT <= 0) h.pose = 'idle'; }
  const inp = w.input;
  let mx = inp.mx || 0, my = inp.my || 0;
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  h.moving = ml > 0.01;
  if (h.moving) { h.moveX = mx; h.moveY = my; }
  let moved = 0;

  if (inp.dash && h.dashCd <= 0 && h.dashT <= 0) H.startDash(w);

  if (h.dashT > 0) {
    const step = Math.min(dt, h.dashT);
    const sp = C.DASH.dist / C.DASH.dur;
    moved = moveHero(w, h.dashDX * sp * step, h.dashDY * sp * step, true);
    h.dashT -= dt;
    // body hits
    for (const e of w.enemies) {
      if (!BD.W.alive(e) || h.dashHit.has(e.id)) continue;
      if (M.dist(h.x, h.y, e.x, e.y) <= h.r + e.r) {
        h.dashHit.add(e.id);
        BD.combat.damage(w, e, C.DASH.dmg, { source: 'dash', direct: true, fromX: h.x, fromY: h.y });
        const [nx, ny] = M.norm(e.x - h.x, e.y - h.y);
        BD.combat.knock(w, e, nx || h.dashDX, ny || h.dashDY, C.DASH.knock, {});
      }
    }
    if (h.dashT <= 0) {
      // end of dash: step out of any enemy we stopped inside
      moveHero(w, 0, 0, false);
      h.pose = 'idle';
    }
  } else if (h.moving) {
    moved = moveHero(w, mx * C.HERO.speed * dt, my * C.HERO.speed * dt, false);
  } else {
    moveHero(w, 0, 0, false);
  }
  if (h.aimT > 0) h.face = h.aim;
  else if (h.dashT > 0) h.face = Math.atan2(h.dashDY, h.dashDX);
  else if (h.moving) h.face = Math.atan2(my, mx);
  h.lastMoved = moved;
  return moved;
};

H.startDash = function (w) {
  const h = w.hero;
  let dx = h.moving ? h.moveX : Math.cos(h.face), dy = h.moving ? h.moveY : Math.sin(h.face);
  [dx, dy] = M.norm(dx, dy);
  h.dashDX = dx; h.dashDY = dy;
  h.dashT = C.DASH.dur; h.dashInvuln = C.DASH.invuln; h.dashCd = C.DASH.cd;
  h.dashHit = new Set(); h.dodged = new Set();
  h.pose = 'dash'; h.poseT = C.DASH.dur + 0.05;
  const end = BD.nav.move(w.grid, h.x, h.y, dx * C.DASH.dist, dy * C.DASH.dist, h.r);
  BD.W.emit(w, 'dash', { fromX: h.x, fromY: h.y, toX: end[0], toY: end[1] });
};

// §2.3 targeting. Returns the target enemy or null.
H.selectTarget = function (w) {
  const h = w.hero, s = h.stats;
  const cand = [];
  let corpses = [];
  for (const e of w.enemies) {
    if (e.dead) continue;
    const ed = BD.W.edgeDist(w, e);
    if (ed > s.acquire) continue;
    if (ed > s.reach && !BD.nav.losClear(w.grid, h.x, h.y, e.x, e.y)) continue;
    if (e.down) corpses.push([e, ed]); else cand.push([e, ed]);
  }
  const list = cand.length ? cand : corpses;
  if (!list.length) { h.targetId = null; return null; }
  list.sort((a, b) => a[1] - b[1] || a[0].hp - b[0].hp || a[0].id - b[0].id);
  let best = list[0];
  const cur = list.find((c) => c[0].id === h.targetId);
  if (cur && cur !== best && !(best[1] <= cur[1] - C.HERO.switchMargin)) best = cur;
  h.targetId = best[0].id;
  return best[0];
};

H.autoAttack = function (w, dt) {
  const h = w.hero;
  if (h.dead || h.dashT > 0) return;
  h.atkTimer = Math.max(0, h.atkTimer - dt);
  const target = H.selectTarget(w);
  if (h.atkTimer <= 0 && target) {
    h.atkTimer = h.stats.interval;
    BD.combat.swing(w, target);
  }
};
