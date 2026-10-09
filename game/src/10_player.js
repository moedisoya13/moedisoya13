// ─────────────────────────────────────────────────────────────
// Grid movement (shared) + the player (도망자 / 망토 히어로)
// Entities ride tile-centre rails like Pac-Man; perpendicular turns
// snap in when within a tolerance of the centre (cornering assist).
// ─────────────────────────────────────────────────────────────

const EPS = 1e-4;

// move up to the next tile centre (or align for a turn); returns distance used
function moveSegment(e, D, d, pass, tol) {
  const dx = D[0], dy = D[1];
  const tx = Math.floor(e.x), ty = Math.floor(e.y), cx = tx + 0.5, cy = ty + 0.5;
  if (dx) {
    const off = e.y - cy;
    if (Math.abs(off) > EPS) {
      if (Math.abs(off) > tol || !pass(tx + dx, ty)) return 0;
      const a = Math.min(Math.abs(off), d); e.y -= Math.sign(off) * a; if (Math.abs(e.y - cy) < EPS) e.y = cy; return a;
    }
    e.y = cy;
    let toC = (cx - e.x) * dx;
    if (toC <= EPS) { if (!pass(tx + dx, ty)) { if (toC < -EPS) e.x = cx; return 0; } toC += 1; }
    const a = Math.min(toC, d); e.x += dx * a;
    if (Math.abs(toC - a) < EPS) e.x = Math.floor(e.x) + 0.5;
    return a;
  } else {
    const off = e.x - cx;
    if (Math.abs(off) > EPS) {
      if (Math.abs(off) > tol || !pass(tx, ty + dy)) return 0;
      const a = Math.min(Math.abs(off), d); e.x -= Math.sign(off) * a; if (Math.abs(e.x - cx) < EPS) e.x = cx; return a;
    }
    e.x = cx;
    let toC = (cy - e.y) * dy;
    if (toC <= EPS) { if (!pass(tx, ty + dy)) { if (toC < -EPS) e.y = cy; return 0; } toC += 1; }
    const a = Math.min(toC, d); e.y += dy * a;
    if (Math.abs(toC - a) < EPS) e.y = Math.floor(e.y) + 0.5;
    return a;
  }
}

function gridMove(e, cands, d, pass, tol = CFG.TURN_TOL) {
  let total = 0, guard = 0;
  while (d > EPS && guard++ < 10) {
    let m = 0;
    for (const D of cands) {
      if (!D) continue;
      m = moveSegment(e, D, d, pass, tol);
      if (m > 0) { e.dx = D[0]; e.dy = D[1]; break; }
    }
    if (m <= 0) break;
    d -= m; total += m;
  }
  return total;
}
const atCenter = (e) => Math.abs(e.x - Math.floor(e.x) - 0.5) < 1e-3 && Math.abs(e.y - Math.floor(e.y) - 0.5) < 1e-3;

// ── player ──
let P = null;

function makePlayer(tx, ty) {
  return {
    x: tx + 0.5, y: ty + 0.5, dx: 0, dy: 0, ang: -Math.PI / 2, phase: 0, amt: 0, breath: 0, headTurn: 0, idleT: 0,
    hp: CFG.HP, keys: 0, honey: 0, letters: { S: 0, H: 0, A: 0, Z: 0, M: 0 },
    state: 'free', hide: null, stunT: 0, slowT: 0, knock: null, flashT: 0, hurtT: 0, staggerT: 0,
    hero: false, heroStunT: 0, holdT: 0, holdObj: null, toilet: null, pull: null, deadT: 0, interact: null, lastStep: 0,
  };
}

function playerPass(x, y) {
  if (P.hero) { const t = tAt(x, y); if (t === T.DOOR) return true; }
  return walkable(x, y);
}

function playerSpeed() {
  if (P.hero) return G.killer.speed(true) * CFG.HERO_RATIO;
  let s = CFG.PLAYER_SPEED;
  if (G.dupT > 0) s *= CFG.DUP_SPEED;
  if (P.slowT > 0) s *= CFG.FAKE_SLOW_MULT;
  return s;
}

function updatePlayer(dt) {
  P.flashT = Math.max(0, P.flashT - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.slowT = Math.max(0, P.slowT - dt);
  P.breath = Math.sin(G.time * 2.4) * 0.35;

  if (P.state === 'dead') { P.deadT += dt; P.amt = approach(P.amt, 0, dt * 6); return; }
  if (P.state === 'hidden') { P.amt = 0; handleInteract(dt); return; }
  if (P.state === 'toilet') { updateToiletTravel(dt); return; }
  if (P.state === 'pulled') { updatePull(dt); return; }
  if (P.state === 'stun') {
    P.stunT -= dt; P.amt = approach(P.amt, 0, dt * 6);
    if (P.stunT <= 0) P.state = 'free';
    return;
  }
  if (P.state === 'knock') { updateKnock(dt); return; }
  if (P.heroStunT > 0) { P.heroStunT -= dt; P.amt = approach(P.amt, 0, dt * 8); return; }
  if (P.staggerT > 0) { P.staggerT -= dt; }

  // movement
  const v = Input.vector();
  let moved = 0;
  if (v.mag > 0 && P.staggerT <= 0) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y);
    const prim = ax >= ay ? [Math.sign(v.x), 0] : [0, Math.sign(v.y)];
    const sec = ax >= ay ? (ay > 0.22 ? [0, Math.sign(v.y)] : null) : (ax > 0.22 ? [Math.sign(v.x), 0] : null);
    const cands = [prim, sec];
    if ((P.dx || P.dy) && P.amt > 0.2 && !(P.dx === -prim[0] && P.dy === -prim[1])) cands.push([P.dx, P.dy]);
    moved = gridMove(P, cands, playerSpeed() * dt, playerPass);
    const want = moved > 0 ? Math.atan2(P.dy, P.dx) : Math.atan2(v.y, v.x);
    P.ang = angApproach(P.ang, want, dt * 16);
    if (P.hero) heroSmashDoors();
  }
  const tAmt = moved > 0 ? 1 : 0;
  P.amt = approach(P.amt, tAmt, dt * (tAmt ? 7 : 9));
  if (moved > 0) {
    const before = Math.floor(P.phase / Math.PI);
    P.phase += moved * (P.hero ? 3.3 : 4.1);
    if (Math.floor(P.phase / Math.PI) !== before) Sfx.step(P.hero ? 0.06 : 0.02, P.hero);
    P.idleT = 0;
  } else {
    const k = Math.round(P.phase / Math.PI) * Math.PI;
    P.phase = approach(P.phase, k, dt * 7);
    P.idleT += dt;
  }
  // head: glance at a visible killer, otherwise nervous look-around when idle
  let look = 0;
  const k = G.killer;
  if (k && k.alive && !P.hero && Vision.visible(k.x, k.y) && dist(P.x, P.y, k.x, k.y) < 7) {
    look = clamp(angDiff(P.ang, Math.atan2(k.y - P.y, k.x - P.x)), -1.2, 1.2);
  } else if (P.idleT > 1.4) look = Math.sin(G.time * 1.1) * 0.8;
  P.headTurn = lerp(P.headTurn, look, Math.min(1, dt * 6));

  pickupItems();
  if (!P.hero) { handleInteract(dt); handleHoneyButton(); }
}

function heroSmashDoors() {
  const tx = Math.floor(P.x + P.dx * 0.6), ty = Math.floor(P.y + P.dy * 0.6);
  const d = doorAt(tx, ty);
  if (d && d.state === 'locked') {
    d.state = 'broken';
    Sfx.doorBreak(); G.shake = 5;
    FX.debris(tx * CFG.TS + 7, ty * CFG.TS + 7, 18);
    repathAll();
  }
}

// ── knockback / stun / pull ──
function knockPlayer(fromX, fromY, tiles = CFG.KNOCKBACK) {
  const ax = P.x - fromX, ay = P.y - fromY;
  let best = null, bs = -Infinity;
  for (const D of DIRS) {
    const probe = { x: P.x, y: P.y, dx: 0, dy: 0 };
    if (moveSegment(probe, D, 0.6, walkable, 0.5) <= 0) continue;
    const s = D[0] * ax + D[1] * ay;
    if (s > bs) { bs = s; best = D; }
  }
  if (!best) return;
  P.state = 'knock';
  P.knock = { dir: best, rem: tiles, t: 0 };
  P.ang = Math.atan2(fromY - P.y, fromX - P.x);
}
function updateKnock(dt) {
  const k = P.knock;
  k.t += dt;
  const sp = lerp(11, 4, Math.min(1, k.t / 0.3));
  const d = Math.min(k.rem, sp * dt);
  const m = gridMove(P, [k.dir], d, walkable, 0.5);
  k.rem -= d;
  P.amt = approach(P.amt, 0.6, dt * 6);
  P.phase += m * 6;
  if (k.rem <= 0.001 || m < d * 0.5) { P.state = 'free'; P.knock = null; P.staggerT = 0.12; }
}
function stunPlayer(t) {
  if (P.hero) { P.heroStunT = CFG.HERO_HIT_STUN; FX.sparks(P.x * CFG.TS, P.y * CFG.TS - 10, 8); return; }
  if (P.state === 'dead' || P.state === 'hidden') return;
  P.state = 'stun'; P.stunT = t;
}
function updatePull(dt) {
  const p = P.pull;
  p.t += dt;
  const f = Math.min(1, p.t / p.dur);
  const e = Ease.inCubic(f);
  P.x = lerp(p.sx, p.tx, e); P.y = lerp(p.sy, p.ty, e);
  P.amt = 0.4;
  if (f >= 1) { P.state = 'free'; P.pull = null; if (p.done) p.done(); }
}

function hurtPlayer(dmg, fromX, fromY, o = {}) {
  if (P.state === 'dead') return;
  if (P.hero) { P.heroStunT = CFG.HERO_HIT_STUN; P.flashT = 0.15; Sfx.hit(false); return; }
  if (G.god) dmg = 0;
  if (P.state === 'hidden') forceExitHide();
  if (P.state === 'toilet') return;
  P.hp = Math.max(0, P.hp - dmg);
  P.flashT = 0.3; P.hurtT = 0.45;
  G.shake = 4 + dmg * 2; G.hitStop = 0.07; G.redFlash = 0.35;
  Sfx.hit(dmg >= 2);
  FX.blood(P.x * CFG.TS, P.y * CFG.TS - 7, 8 + dmg * 6, Math.atan2(P.y - fromY, P.x - fromX));
  if (P.hp <= 0) { killPlayer('killed'); return; }
  if (!o.noKnock) knockPlayer(fromX, fromY, CFG.KNOCKBACK * (o.knockMul || 1));
}

function killPlayer(cause) {
  if (P.state === 'dead') return;
  if (P.state === 'hidden') forceExitHide();
  P.state = 'dead'; P.deadT = 0; P.hp = 0;
  G.deathCause = cause;
  startPhase('dying');
}

// ── interactions ──
function findInteract() {
  if (P.state === 'hidden') return { kind: 'exit' };
  if (P.state !== 'free' || P.hero) return null;
  const tx = Math.floor(P.x), ty = Math.floor(P.y);
  const fx = Math.round(Math.cos(P.ang)), fy = Math.round(Math.sin(P.ang));
  const facing = (x, y) => (x - tx === fx && y - ty === fy ? 1.5 : 0);
  let best = null;
  const offer = (o) => { if (!best || o.score > best.score) best = o; };
  for (const c of G.candles) {
    const d = Math.abs(c.x - tx) + Math.abs(c.y - ty);
    if (d <= 1) offer({ kind: 'candle', obj: c, score: 6 + facing(c.x, c.y) - d });
  }
  for (const [dx, dy] of DIRS) {
    const d = doorAt(tx + dx, ty + dy);
    if (!d) continue;
    if (d.state === 'locked') offer({ kind: P.keys > 0 ? 'unlock' : 'locked', obj: d, score: (P.keys > 0 ? 4 : 0.5) + facing(d.x, d.y) });
    else if (d.state === 'open' && !entityOnTile(d.x, d.y)) offer({ kind: 'lock', obj: d, score: 2 + facing(d.x, d.y) });
  }
  for (const f of M.hideSpots) {
    if (f.occupied) continue;
    const adj = Math.abs(f.x - tx) + Math.abs(f.y - ty) === 1;
    if (adj) offer({ kind: 'hide', obj: f, score: 3.5 + facing(f.x, f.y) + (f.ax === tx && f.ay === ty ? 0.5 : 0) });
  }
  for (const f of M.toilets) {
    if (Math.abs(f.x - tx) + Math.abs(f.y - ty) === 1) offer({ kind: G.toiletCd > 0 ? 'toiletWait' : 'toilet', obj: f, score: (G.toiletCd > 0 ? 1 : 3.6) + facing(f.x, f.y) });
  }
  return best;
}
function entityOnTile(x, y) {
  if (Math.floor(P.x) === x && Math.floor(P.y) === y) return true;
  for (const e of G.enemies) if (e.alive && Math.floor(e.x) === x && Math.floor(e.y) === y) return true;
  return false;
}

function handleInteract(dt) {
  const it = findInteract();
  P.interact = it;
  const b = Input.btn.act;
  if (!it) { P.holdT = 0; P.holdObj = null; return; }
  if (it.kind === 'candle') {
    if (b.down) {
      if (P.holdObj !== it.obj) { P.holdObj = it.obj; P.holdT = 0; }
      P.holdT += dt;
      if (P.holdT >= CFG.CANDLE_HOLD) { extinguishCandle(it.obj); P.holdT = 0; P.holdObj = null; }
    } else { P.holdT = 0; P.holdObj = null; }
    return;
  }
  if (!b.pressed) return;
  switch (it.kind) {
    case 'unlock': doUnlock(it.obj); break;
    case 'lock': doLock(it.obj); break;
    case 'hide': doHide(it.obj); break;
    case 'exit': doExitHide(); break;
    case 'toilet': doToilet(it.obj); break;
    case 'locked': Sfx.tone(180, 140, 0.08, { type: 'square', vol: 0.05 }); it.obj.shake = 0.15; break;
  }
}

function doUnlock(d) {
  P.keys--; d.state = 'open'; d.bash = 0;
  Sfx.unlock(); FX.sparks(d.x * CFG.TS + 7, d.y * CFG.TS + 4, 6);
  G.noise(d.x + 0.5, d.y + 0.5, CFG.NOISE_DOOR);
  G.playerAction('key');
  repathAll();
}
function doLock(d) {
  d.state = 'locked'; d.bash = 0;
  Sfx.lock(); FX.dust(d.x * CFG.TS + 7, d.y * CFG.TS + 7, 4);
  G.noise(d.x + 0.5, d.y + 0.5, CFG.NOISE_DOOR * 0.6);
  repathAll();
}
function doHide(f) {
  for (const e of G.enemies) if (e.alive && e.sees) { e.hideTarget = f; e.lastSeen = { x: f.ax + 0.5, y: f.ay + 0.5 }; }
  P.state = 'hidden'; P.hide = f; f.occupied = true; f.shake = 0.35;
  P.x = f.x + 0.5; P.y = f.y + 0.5; P.amt = 0;
  Sfx.hide();
}
function doExitHide() {
  const f = P.hide;
  if (!f) { P.state = 'free'; return; }
  P.state = 'free'; P.hide = null; f.occupied = false; f.shake = 0.35;
  // step out on a free side, away from any killer standing at the spot
  let ex = f.ax, ey = f.ay, best = -Infinity;
  for (const [dx, dy] of DIRS) {
    const x = f.x + dx, y = f.y + dy;
    if (!walkable(x, y)) continue;
    let s = x === f.ax && y === f.ay ? 0.5 : 0;
    for (const e of G.enemies) if (e.alive && e.hostile) { const d = dist(x + 0.5, y + 0.5, e.x, e.y); s += Math.min(d, 6) - (d < 0.8 ? 10 : 0); }
    if (s > best) { best = s; ex = x; ey = y; }
  }
  P.x = ex + 0.5; P.y = ey + 0.5;
  P.ang = Math.atan2(ey - f.y, ex - f.x);
  Sfx.hide();
}
function forceExitHide() { if (P.state === 'hidden') doExitHide(); }

function doToilet(f) {
  const to = M.toilets[0] === f ? M.toilets[1] : M.toilets[0];
  G.toiletCd = CFG.TOILET_CD;
  P.state = 'toilet'; P.toilet = { from: f, to, t: 0, moved: false };
  P.x = f.ax + 0.5; P.y = f.ay + 0.5;
  Sfx.flush();
  G.noise(f.x + 0.5, f.y + 0.5, CFG.NOISE_TOILET);
  G.noise(to.x + 0.5, to.y + 0.5, CFG.NOISE_TOILET);
  G.playerAction('toilet');
}
function updateToiletTravel(dt) {
  const tr = P.toilet;
  tr.t += dt;
  if (!tr.moved && tr.t >= 0.38) {
    tr.moved = true;
    FX.splash(tr.to.x * CFG.TS + 7, tr.to.y * CFG.TS + 6, 14);
    P.x = tr.to.ax + 0.5; P.y = tr.to.ay + 0.5;
    P.ang = Math.atan2(tr.to.ay - tr.to.y, tr.to.ax - tr.to.x);
  }
  if (tr.t >= 0.7) { P.state = 'free'; P.toilet = null; }
}

function handleHoneyButton() {
  if (!Input.btn.honey.pressed || P.honey <= 0 || P.state !== 'free') return;
  const tx = Math.floor(P.x), ty = Math.floor(P.y);
  if (G.honeyTraps.some((h) => h.x === tx && h.y === ty)) return;
  P.honey--;
  G.honeyTraps.push({ x: tx, y: ty, t: 0 });
  Sfx.honeyPlace();
  G.noise(P.x, P.y, CFG.NOISE_HONEY);
  G.playerAction('honey');
}

// ── drawing ──
function playerScreenPos(camX, camY) { return [P.x * CFG.TS - camX, P.y * CFG.TS - camY + 4]; }

function drawPlayer(camX, camY) {
  if (P.state === 'hidden') return;
  let [X, Y] = playerScreenPos(camX, camY);
  const st = { ang: P.ang, phase: P.phase, amt: P.amt, breath: P.breath, headTurn: P.headTurn, lean: 0, scale: 1 };
  if (P.flashT > 0 && ((P.flashT * 30) | 0) % 2) st.flash = '#ffffff';
  if (P.hurtT > 0) { st.tilt = -0.35 * (P.hurtT / 0.45); }
  if (P.state === 'dead') {
    const f = Math.min(1, P.deadT / 0.6);
    st.tilt = -Ease.outBack(f) * 1.45; st.amt = 0;
  }
  if (P.state === 'toilet') {
    const t = P.toilet.t;
    const s = t < 0.38 ? 1 - t / 0.38 : (t - 0.38) / 0.32;
    if (s <= 0.05) return;
    st.scale = s; st.ang = P.ang + (1 - s) * 8;
  }
  if (P.state === 'stun') { st.roll = Math.sin(G.time * 7) * 0.25; }
  if (P.hero) {
    if (G.phase === 'shazam') { st.handR = [1.2, 4.4, 19.5]; st.handL = [1.2, -4.4, 19.5]; st.ang = Math.PI / 2; }
    groundShadow(X, Y, 7, 2.6);
    drawHero(X, Y, st, G.time);
  } else {
    groundShadow(X, Y, 4.6, 1.8);
    drawRunner(X, Y, st);
  }
  if (P.state === 'stun') iconStars(X, Y - 22, G.time);
}
