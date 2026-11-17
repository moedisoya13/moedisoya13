// Hero: movement, collision, the shoulder dash (§2.4) and the auto-attack rules (§2.3).
// Changed by docs/CONTROLS-REVIEW.md: walking shoves regular enemies aside and gets corner assist
// on obstacles (§3.5); a dash press is remembered for DASH.buffer and an idle dash goes the last
// way the hero walked (§3.3); the hero faces his target while he has one (§3.6).

const C = BD.C;
const M = BD.math;
const H = BD.hero = {};

H.create = function (w) {
  return {
    x: 0, y: 0, r: C.HERO.radius, hp: C.HERO.maxHp, maxHp: C.HERO.maxHp,
    face: Math.PI * 0.75, aim: 0, aimT: 0, moveX: 0, moveY: 0, moving: false,
    atkTimer: 0, targetId: null, dashCd: 0, dashT: 0, dashDX: 0, dashDY: 0, dashInvuln: 0, dashBuf: 0, faceHold: 0,
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

// A walking hero shoves these aside; guardians, the boss and a lunging enemy stay solid.
const shoveable = (e) => BD.W.alive(e) && !e.guardian && !e.boss && !e.lunging;

// Corner assist: the grid stopped the step (dx, dy) of length L at (x, y) below CORNER.stuck.
// Probe sideways along the blocking face — the cell face the grid pushed him off, i.e. the push
// snapped to its main axis (cells are axis-aligned; the snap also ignores the slant nav.resolve
// gives at the seam of two wall cells), so a probe never steps off a flat wall and wall slides
// keep their speed — in CORNER.step up to CORNER.reach, the side the input leans to first. The
// nearest spot from which the same step walks at least CORNER.need of L wins, and the hero
// slides that way this tick. A flat face (no such spot) still stops him. Returns the new [x, y].
function cornerAssist(w, h, x, y, dx, dy, L, dt) {
  const K = C.CORNER;
  const px = x - (h.x + dx), py = y - (h.y + dy); // the push out of the obstacle
  if (Math.abs(px) + Math.abs(py) < 1e-9) return [x, y];
  const tx = Math.abs(px) >= Math.abs(py) ? 0 : 1, ty = 1 - tx; // along the face
  const lean = tx * dx + ty * dy >= 0 ? 1 : -1;
  for (let i = 1; i * K.step <= K.reach + 1e-9; i++) {
    const o = i * K.step;
    for (const s of [lean, -lean]) {
      const [qx, qy] = BD.nav.move(w.grid, h.x, h.y, tx * o * s, ty * o * s, h.r);
      if (M.dist(h.x, h.y, qx, qy) < o - 1e-6) continue; // something in the way on that side
      const [fx, fy] = BD.nav.move(w.grid, qx, qy, dx, dy, h.r);
      if (M.dist(qx, qy, fx, fy) < K.need * L) continue;
      const push = Math.min(o, C.HERO.speed * dt * K.speed);
      const [ax, ay] = BD.nav.move(w.grid, x, y, tx * push * s, ty * push * s, h.r);
      return [ax, ay];
    }
  }
  return [x, y];
}

// Move with sliding against the grid and enemy circles. Walking (`dt` given, throughEnemies
// false): corner assist on the grid, and every regular enemy the hero's circle overlaps is shoved
// sideways off his line before he is pushed out of what remains (guardians and the boss block).
// A dash passes through enemies; moveHero(w, 0, 0) only steps out of bodies.
function moveHero(w, dx, dy, throughEnemies, dt) {
  const h = w.hero;
  let [x, y] = BD.nav.move(w.grid, h.x, h.y, dx, dy, h.r);
  const L = Math.sqrt(dx * dx + dy * dy);
  if (!throughEnemies && dt && L > 1e-9) {
    if (M.dist(h.x, h.y, x, y) < C.CORNER.stuck * L) [x, y] = cornerAssist(w, h, x, y, dx, dy, L, dt);
    const ux = dx / L, uy = dy / L, cap = C.HERO.speed * dt * C.HERO.shoveSpeed;
    for (const e of w.enemies) {
      if (!shoveable(e)) continue;
      const rx = e.x - x, ry = e.y - y, depth = h.r + e.r - Math.sqrt(rx * rx + ry * ry);
      if (depth <= 0) continue;
      // which side of the hero's line the enemy is on; exactly on it: even id left, odd right
      const cross = ux * ry - uy * rx;
      const side = Math.abs(cross) > 1e-6 ? Math.sign(cross) : (e.id % 2 === 0 ? 1 : -1);
      const amt = Math.min(C.HERO.shoveShare * depth, cap);
      const [ex, ey] = BD.nav.move(w.grid, e.x, e.y, -uy * side * amt, ux * side * amt, e.r);
      // pinned against a wall, the wall would slide it into the hero: then it stays put (solid)
      if (M.dist(ex, ey, x, y) < M.dist(e.x, e.y, x, y)) continue;
      e.x = ex; e.y = ey;
    }
  }
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
  h.dashBuf = Math.max(0, h.dashBuf - dt);
  h.faceHold = Math.max(0, h.faceHold - dt);
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

  // dash buffer: a press is kept DASH.buffer s and fires on the first tick a dash is possible
  if (inp.dash) h.dashBuf = C.DASH.buffer;
  if (h.dashBuf > 1e-9 && h.dashCd <= 0 && h.dashT <= 0) { h.dashBuf = 0; H.startDash(w); }

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
    moved = moveHero(w, mx * C.HERO.speed * dt, my * C.HERO.speed * dt, false, dt);
  } else {
    moveHero(w, 0, 0, false);
  }
  // facing: the dash direction while dashing; the target while there is one (autoAttack sets it
  // after choosing the target, so walking away reads as backing off); once the target is gone the
  // face holds aimHold s, then follows the way he walks; standing still keeps it
  if (h.dashT > 0) h.face = Math.atan2(h.dashDY, h.dashDX);
  else if (h.faceHold <= 0 && h.moving) h.face = Math.atan2(my, mx);
  h.lastMoved = moved;
  return moved;
};

// Direction: this tick's movement input; without one the last way the hero walked (moveX/moveY,
// which the player chose); only before he has ever walked, the way he faces.
H.startDash = function (w) {
  const h = w.hero;
  const walked = h.moveX !== 0 || h.moveY !== 0;
  let dx = walked ? h.moveX : Math.cos(h.face), dy = walked ? h.moveY : Math.sin(h.face);
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
  // he faces his target every tick he has one; after it is gone the face holds aimHold s
  if (target) { h.face = Math.atan2(target.y - h.y, target.x - h.x); h.faceHold = C.HERO.aimHold; }
  if (h.atkTimer <= 0 && target) {
    h.atkTimer = h.stats.interval;
    BD.combat.swing(w, target);
  }
};
