// ─────────────────────────────────────────────────────────────
// Game state, phases and the world renderer
// ─────────────────────────────────────────────────────────────

let G = null;
let ROUND = 0;

function newGame(kindOverride) {
  ROUND++;
  if (PARAMS.seed) rnd = mulberry32(+PARAMS.seed * 7919 + ROUND); else rnd = Math.random;
  M = genMap(); renderMap(); Vision.reset(); FX.clear();
  G = {
    phase: 'title', phaseT: 0, mode: 'normal', time: 0, rt: 0,
    enemies: [], killer: null,
    keyItems: [], laurels: [], aItems: [], honeyTraps: [], candles: [], cracks: [],
    keyRespawn: [], laurelRespawn: [], aRespawn: [],
    slot: { active: null, queue: [] }, letterPop: {}, hudPop: {},
    dupT: 0, exposeT: 0, blackoutT: 0, eyeT: 0, sirenT: 0, toiletCd: 0, whiteFlash: 0, redFlash: 0, shake: 0, hitStop: 0,
    aPhase: false, heartsShown: false, revengeT: 0, pendingShazam: false,
    openTiles: allOpenTiles(), lastStab: -99, hbT: 0, creakT: 6,
    cam: { x: 0, y: 0 }, lead: { x: 0, y: 0 }, docT: 0, god: !!PARAMS.god, deathCause: null,
    startT: 0, shazams: 0, jPts: [],
    noise(x, y, r) { for (const e of this.enemies) if (e.alive && dist(e.x, e.y, x, y) <= r) e.hearNoise(x, y); },
    playerAction(kind) { if (this.killer && this.killer.onPlayerAction) this.killer.onPlayerAction(kind); },
  };
  // player near the bottom-centre corridor
  let best = null, bs = -Infinity;
  for (const [x, y] of G.openTiles) {
    if (M.roomOf[y * M.w + x] >= 0) continue;
    const s = y * 2 - Math.abs(x - M.w / 2) * 1.5;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  P = makePlayer(best[0], best[1]);
  // killer far away
  const kind = kindOverride || (KILLER_TYPES[PARAMS.killer] ? PARAMS.killer : pick(KILLER_KINDS));
  const f = costField(best[0], best[1], {});
  let maxC = 0; for (const c of f) if (c !== Infinity && c > maxC) maxC = c;
  const far = [];
  for (const [x, y] of G.openTiles) { const c = f[y * M.w + x]; if (c !== Infinity && c >= maxC * (kind === 'evolver' ? 0.55 : 0.7) && walkable(x, y)) far.push([x, y]); }
  const ks = pick(far.length ? far : G.openTiles);
  const K = new KILLER_TYPES[kind](ks[0], ks[1]);
  G.killer = K; G.enemies.push(K);
  initItems();
  // debug: ?letters=SHAZAM pre-fills letters
  if (PARAMS.letters) {
    for (const ch of PARAMS.letters.toUpperCase()) { if (ch === 'A') P.letters.A = Math.min(2, P.letters.A + 1); else if (ch in P.letters) P.letters[ch] = 1; }
    if (PARAMS.hp) P.hp = +PARAMS.hp;
  }
  if (PARAMS.keys) P.keys = +PARAMS.keys;
  if (PARAMS.honey) P.honey = +PARAMS.honey;
  updateCamera(0, true);
  return G;
}

function startPhase(name) {
  G.phase = name; G.phaseT = 0;
  switch (name) {
    case 'intro': G.introScream = false; break;
    case 'play': if (!Sfx.drone) Sfx.startDrone(); break;
    case 'shazam': forceExitHide(); P.state = 'free'; P.knock = null; P.stunT = 0; P.slowT = 0; G.shz = { lit: 0 }; break;
    case 'revert': Sfx.revert(); FX.smoke(P.x * CFG.TS, P.y * CFG.TS - 10, 12, ['#d8d0c0', '#a8a090', '#efe6d2']); break;
    case 'closeup': {
      const K = G.killer;
      G.closeup = { x: ((P.x + K.x) / 2) * CFG.TS, y: ((P.y + K.y) / 2) * CFG.TS - 8 };
      G.whiteFlash = 0.3; Sfx.hit(true); G.shake = 6;
      break;
    }
    case 'punish': Comic.start(G.killer); break;
    case 'return': beginReturn(); break;
    case 'dying': Sfx.death(); Sfx.stopDrone(); break;
    case 'hellgate': Sfx.hellgate(); Sfx.stopDrone(); G.deathCause = 'hellgate'; forceExitHide(); P.state = 'dead'; P.deadT = -10; break;
    case 'explode': Sfx.explosion(); Sfx.stopDrone(); G.deathCause = 'explode'; G.shake = 14; G.whiteFlash = 1; forceExitHide(); break;
    case 'victory': Sfx.victory(); Sfx.stopDrone(); break;
    case 'gameover': break;
  }
}

function beginShazamRevenge() {
  const K = G.killer;
  if (K.stage === 'egg') K.hatch(); // the lightning wakes an unhatched Evolver
  G.mode = 'revenge'; G.revengeT = CFG.REVENGE_TIME; G.heartsShown = true; G.shazams++;
  K.stunT = CFG.REVENGE_STUN; K.atk = null; K.path = null; K.goal = null; K.state = 'flee'; K.keys = 0; K.fleeT = 0;
  if (K.breaking) { G.cracks = G.cracks.filter((c) => c !== K.breaking); K.breaking = null; }
  if (K.tent) K.tent = null;
  if (K.thrust) K.thrust = null;
  if (K.flashing) K.flashing = null;
  if (K.onShazam) K.onShazam();
  // the lightning strike blasts a nearby killer down the corridor so the revenge is a real chase
  if (dist(P.x, P.y, K.x, K.y) < 4.5) {
    const f = costField(Math.floor(P.x), Math.floor(P.y), {});
    let best = null, bd = Infinity;
    for (const [x, y] of G.openTiles) {
      const c = f[y * M.w + x];
      if (c >= 4 && c <= 6 && walkable(x, y)) { const e = dist(x + 0.5, y + 0.5, K.x, K.y); if (e < bd) { bd = e; best = [x, y]; } }
    }
    if (best) {
      FX.smoke(K.x * CFG.TS, K.y * CFG.TS - 6, 10);
      K.x = best[0] + 0.5; K.y = best[1] + 0.5;
      FX.debris(K.x * CFG.TS, K.y * CFG.TS - 4, 12); FX.ring(K.x * CFG.TS, K.y * CFG.TS - 6, C.goldHi, 16);
    }
  }
  // the Doctor's machines are wiped out
  for (const e of G.enemies) if (e.machine && e.alive) { e.alive = false; FX.debris(e.x * CFG.TS, e.y * CFG.TS - 4, 14); FX.sparks(e.x * CFG.TS, e.y * CFG.TS - 4, 10); Sfx.machineBreak(); }
  G.enemies = G.enemies.filter((e) => e.alive);
  for (const f of M.hideSpots) f.check = 0;
}
function endRevengeCommon() {
  P.hero = false; P.heroStunT = 0;
  G.mode = 'normal';
  P.letters.A = 0; G.aPhase = true;
  G.laurels.length = 0; G.laurelRespawn.length = 0; G.aItems.length = 0; G.aRespawn.length = 0;
  repathAll();
}
function beginReturn() {
  endRevengeCommon();
  const K = G.killer;
  const f = costField(Math.floor(P.x), Math.floor(P.y), {});
  let maxC = 0; for (const c of f) if (c !== Infinity && c > maxC) maxC = c;
  const far = G.openTiles.filter(([x, y]) => f[y * M.w + x] >= maxC * 0.7 && walkable(x, y));
  const t = pick(far.length ? far : G.openTiles);
  K.x = t[0] + 0.5; K.y = t[1] + 0.5; K.stunT = CFG.RETURN_STUN; K.state = 'patrol'; K.path = null; K.goal = null; K.atk = null; K.trav = null;
  P.state = 'free'; P.flashT = 0;
  updateCamera(0, true);
  Sfx.startDrone();
}

function updateGame(dt) {
  G.rt += dt; G.phaseT += dt;
  const ph = G.phase;
  if (ph === 'title') {
    G.cam.x += dt * 9; if (G.cam.x > M.w * CFG.TS - Screen.W) G.cam.x = 0;
    if (Input.tapped()) { Sfx.init(); Sfx.tap(); newGame(); startPhase('intro'); }
    return;
  }
  if (ph === 'intro') {
    if (!G.introScream && G.phaseT > 1.3) { G.introScream = true; if (G.killer.kind !== 'evolver') Sfx.scream(G.killer.kind); else Sfx.tone(60, 40, 2, { type: 'sawtooth', vol: 0.06, filter: ['lowpass', 300] }); }
    if (G.phaseT > 3.8 || (G.phaseT > 1.6 && Input.tapped())) { startPhase('play'); G.startT = G.rt; }
    return;
  }
  if (ph === 'play') { updateWorld(dt); return; }
  if (ph === 'shazam') {
    const t = G.phaseT;
    const lit = Math.min(6, Math.floor(t / 0.13));
    if (lit > G.shz.lit) { G.shz.lit = lit; Sfx.tone(523 * Math.pow(1.122, lit), 523 * Math.pow(1.122, lit), 0.18, { type: 'triangle', vol: 0.08 }); }
    if (!G.shz.bolt && t >= 0.95) {
      G.shz.bolt = true; P.hero = true;
      const X = P.x * CFG.TS, Y = P.y * CFG.TS - 6;
      FX.bolt(X, Y, G.cam.y - 10); FX.bolt(X + 2, Y, G.cam.y - 10, { life: 0.6 });
      FX.sparks(X, Y, 40, [C.gold, C.goldHi, '#ffffff']); FX.ring(X, Y, C.goldHi, 40, 0.5);
      Sfx.thunder(); Sfx.transform(); G.whiteFlash = 0.8; G.shake = 9;
    }
    FX.update(dt); G.shake = Math.max(0, G.shake - dt * 18); G.whiteFlash = Math.max(0, G.whiteFlash - dt * 1.6);
    if (t >= 2.3) { beginShazamRevenge(); startPhase('play'); }
    return;
  }
  if (ph === 'revert') {
    FX.update(dt);
    if (G.phaseT >= 0.45 && P.hero) { P.hero = false; FX.smoke(P.x * CFG.TS, P.y * CFG.TS - 8, 10, ['#d8d0c0', '#a8a090']); }
    if (G.phaseT >= 1.0) { endRevengeCommon(); G.killer.stunT = 1; G.killer.state = 'chase'; G.killer.lastSeen = { x: P.x, y: P.y }; startPhase('play'); }
    return;
  }
  if (ph === 'closeup') {
    FX.update(dt); G.shake = Math.max(0, G.shake - dt * 15); G.whiteFlash = Math.max(0, G.whiteFlash - dt * 2);
    if (G.phaseT >= 1.0) startPhase('punish');
    return;
  }
  if (ph === 'punish') {
    Comic.update(dt);
    if (Comic.done) {
      G.killer.hp = Comic.hpAfter;
      if (G.killer.hp <= 0) startPhase('victory'); else startPhase('return');
    }
    return;
  }
  if (ph === 'return') {
    FX.update(dt);
    if (G.phaseT >= 0.9) startPhase('play');
    return;
  }
  if (ph === 'dying' || ph === 'hellgate' || ph === 'explode') {
    FX.update(dt); P.deadT += dt;
    G.shake = Math.max(0, G.shake - dt * 10); G.whiteFlash = Math.max(0, G.whiteFlash - dt * 1.2); G.redFlash = Math.max(0, G.redFlash - dt);
    if (ph === 'explode' && G.phaseT < 1.2 && rnd() < 0.5) { const K = G.killer; FX.burst(K.x * CFG.TS, K.y * CFG.TS, 6, { c: ['#ff6a1a', '#ffd23f', '#ffffff', '#3a3030'], sp0: 60, sp1: 200, l0: 0.4, l1: 1, size: 2, glow: true }); }
    if (G.phaseT >= (ph === 'hellgate' ? 3.4 : 2.4)) startPhase('gameover');
    return;
  }
  if (ph === 'gameover' || ph === 'victory') {
    FX.update(dt);
    if (G.phaseT > 1.2 && Input.tapped()) { Sfx.tap(); newGame(); startPhase('intro'); }
  }
}

function updateWorld(dt) {
  if (G.hitStop > 0) { G.hitStop -= dt; return; }
  G.time += dt;
  const dec = (k, r = 1) => { G[k] = Math.max(0, G[k] - dt * r); };
  dec('dupT'); dec('exposeT'); dec('blackoutT'); dec('eyeT'); dec('sirenT'); dec('toiletCd'); dec('whiteFlash', 1.6); dec('redFlash', 1.4);
  G.shake = Math.max(0, G.shake - dt * 22);
  for (const k in G.hudPop) G.hudPop[k] = Math.max(0, G.hudPop[k] - dt * 3);
  for (const k in G.letterPop) G.letterPop[k] = Math.max(0, G.letterPop[k] - dt * 2);

  updatePlayer(dt);
  if (G.phase !== 'play') return; // player died / something started
  const K = G.killer;
  if (K && K.alive && K.globalUpdate) K.globalUpdate(dt);
  if (G.phase !== 'play') return;
  for (const e of G.enemies) if (e.alive) e.update(dt);
  if (G.phase !== 'play') return;
  updateItems(dt); updateSlot(dt);
  for (const f of M.furn) f.shake = Math.max(0, f.shake - dt);
  for (const d of M.doors) d.shake = Math.max(0, d.shake - dt);
  for (const c of G.cracks) c.vis = true;
  FX.update(dt);

  if (G.mode === 'revenge') {
    G.revengeT -= dt;
    if (rnd() < dt * 18) FX.burst(P.x * CFG.TS + rand(-6, 6), P.y * CFG.TS - rand(4, 20), 1, { c: [C.gold, '#9fe8ff', '#ffffff'], sp0: 5, sp1: 20, l0: 0.2, l1: 0.5, glow: true });
    if (K.alive && !K.trav && dist(P.x, P.y, K.x, K.y) < 0.95) { startPhase('closeup'); return; }
    if (G.revengeT <= 0) { startPhase('revert'); return; }
  }
  if (G.pendingShazam && G.mode === 'normal' && P.state !== 'dead' && P.state !== 'toilet' && P.state !== 'pulled') {
    G.pendingShazam = false; startPhase('shazam'); return;
  }
  // heartbeat: louder & faster as the killer closes in
  let inten = 0;
  if (G.mode === 'normal') for (const e of G.enemies) if (e.alive && e.hostile) inten = Math.max(inten, clamp(1 - dist(P.x, P.y, e.x, e.y) / 9, 0, 1) * (e.main ? 1 : 0.7));
  G.hbT -= dt;
  if (inten > 0.05 && G.hbT <= 0) { Sfx.heartbeat(0.3 + inten * 0.7); G.hbT = lerp(1.15, 0.4, inten); }
  G.creakT -= dt;
  if (G.creakT <= 0) { G.creakT = rand(7, 15); Sfx.creak(); }
  updateCamera(dt);
}

function updateCamera(dt, snap) {
  const TS = CFG.TS, W = Screen.W, H = Screen.H;
  const lx = Math.cos(P.ang) * 16 * P.amt, ly = Math.sin(P.ang) * 16 * P.amt;
  if (snap) { G.lead.x = lx; G.lead.y = ly; } else { const k = Math.min(1, dt * 2.5); G.lead.x = lerp(G.lead.x, lx, k); G.lead.y = lerp(G.lead.y, ly, k); }
  let tx = P.x * TS + G.lead.x - W / 2, ty = P.y * TS + G.lead.y - H * 0.47;
  const mw = M.w * TS, mh = M.h * TS;
  tx = mw <= W ? (mw - W) / 2 : clamp(tx, -10, mw - W + 10);
  ty = mh <= H ? (mh - H) / 2 : clamp(ty, -34, mh - H + 70);
  if (snap) { G.cam.x = tx; G.cam.y = ty; } else { const k = Math.min(1, dt * 7); G.cam.x = lerp(G.cam.x, tx, k); G.cam.y = lerp(G.cam.y, ty, k); }
}

// ─────────────────────────────────────────────────────────────
// World rendering (low-res)
// ─────────────────────────────────────────────────────────────
// The maze outline always shows through the fog; locked doorways get a red bar.
function drawPathOutline(camX, camY) {
  const W = Screen.W, H = Screen.H, TS = CFG.TS, mw = MapGfx.ol.width, mh = MapGfx.ol.height;
  const sx0 = Math.max(0, camX), sy0 = Math.max(0, camY), sx1 = Math.min(mw, camX + W), sy1 = Math.min(mh, camY + H);
  L.globalAlpha = G.blackoutT > 0 ? 0.4 : 0.62;
  if (sx1 > sx0 && sy1 > sy0) L.drawImage(MapGfx.ol, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - camX, sy0 - camY, sx1 - sx0, sy1 - sy0);
  L.globalAlpha = G.blackoutT > 0 ? 0.5 : 0.85;
  for (const d of M.doors) {
    if (d.state !== 'locked') continue;
    const X = d.x * TS - camX, Y = d.y * TS - camY;
    if (X < -TS || Y < -TS || X > W || Y > H) continue;
    if (d.horiz) rect(X + 6, Y + 1, 2, TS - 2, '#d0484c'); else rect(X + 1, Y + 6, TS - 2, 2, '#d0484c');
  }
  L.globalAlpha = 1;
}
function blitMap(camX, camY) {
  const W = Screen.W, H = Screen.H, mw = MapGfx.cv.width, mh = MapGfx.cv.height;
  const sx0 = Math.max(0, camX), sy0 = Math.max(0, camY), sx1 = Math.min(mw, camX + W), sy1 = Math.min(mh, camY + H);
  if (sx1 > sx0 && sy1 > sy0) L.drawImage(MapGfx.cv, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - camX, sy0 - camY, sx1 - sx0, sy1 - sy0);
}

function renderWorld() {
  const TS = CFG.TS, W = Screen.W, H = Screen.H;
  const sh = G.shake;
  const camX = Math.round(G.cam.x + (sh ? rand(-1, 1) * sh * 0.5 : 0)), camY = Math.round(G.cam.y + (sh ? rand(-1, 1) * sh * 0.5 : 0));
  G.camX = camX; G.camY = camY;
  L.fillStyle = C.void; L.fillRect(0, 0, W, H);
  blitMap(camX, camY);
  for (const c of G.cracks) drawWallCrack(c, camX, camY);

  // vision
  Vision.begin();
  let vr = P.hero ? CFG.HERO_VISION_RANGE : CFG.VISION_RANGE, vh = P.hero ? CFG.HERO_VISION_HALF : CFG.VISION_HALF, near = CFG.VISION_NEAR;
  if (P.state === 'hidden') { vr = 2.4; vh = 0.7; near = 1.3; }
  if (P.state === 'dead') { vr = 3.2; vh = 3.1; near = 3; }
  if (G.phase === 'title') { vr = 6; vh = 3.1; near = 6; }
  const flick = 1 + Math.sin(G.rt * 23) * 0.012 + (Math.sin(G.rt * 3.1) > 0.995 ? -0.1 : 0);
  const vx = G.phase === 'title' ? (camX + W / 2) / TS : P.x, vy = G.phase === 'title' ? (camY + H * 0.45) / TS : P.y - 0.15;
  Vision.cast(vx, vy, P.ang + P.headTurn * 0.5, vr * flick, vh, near);
  const K = G.killer;
  if (K && K.kind === 'janitor' && K.grade === 3 && G.mode === 'normal' && K.alive) {
    Vision.cast(K.x, K.y, K.ang, 7, 0.8, 1.2, 120, true, G.jPts);
    Vision.addLight({ poly: G.jPts, x: K.x, y: K.y, r: 7 });
  }

  FX.drawDecals(camX, camY);
  for (const w of M.wells) if (Vision.visibleTile(w.x, w.y)) drawWell(w.x * TS + 7 - camX, w.y * TS + 8 - camY, G.time, w.sealed, wellRipple(w));
  drawItems(camX, camY, G.time);
  for (const c of G.candles) drawCandle(c.x * TS + 7 - camX, c.y * TS + 10 - camY, c.t, c.fake);

  // y-sorted: furniture, doors, characters
  const list = [];
  const tx0 = Math.floor(camX / TS) - 1, tx1 = Math.ceil((camX + W) / TS) + 1, ty0 = Math.floor(camY / TS) - 1, ty1 = Math.ceil((camY + H) / TS) + 2;
  for (const f of M.furn) if (f.x >= tx0 && f.x <= tx1 && f.y >= ty0 && f.y <= ty1) list.push({ y: (f.y + 1) * TS - 0.5, d: () => drawFurniture(f, f.x * TS - camX, f.y * TS - camY, G.time) });
  for (const d of M.doors) if (d.x >= tx0 && d.x <= tx1 && d.y >= ty0 && d.y <= ty1) list.push({ y: (d.y + 1) * TS - 1, d: () => drawDoor(d, d.x * TS - camX, d.y * TS - camY, G.time) });
  if (G.phase !== 'title' && G.phase !== 'hellgate') list.push({ y: P.y * TS + 4, d: () => drawPlayer(camX, camY) });
  const reveal = G.dupT > 0 || G.mode === 'revenge';
  for (const e of G.enemies) {
    e._drawn = false;
    if (!e.alive || G.phase === 'title') continue;
    if (Vision.visible(e.x, e.y) || (e === K && K.kind === 'evolver' && K.stage === 'egg' && Vision.visible(e.x, e.y - 0.4))) { e._drawn = true; list.push({ y: e.y * TS + 4, d: () => e.draw(camX, camY) }); }
  }
  list.sort((a, b) => a.y - b.y);
  for (const o of list) o.d();
  FX.draw(camX, camY, false);

  // lighting
  for (const l of G.laurels) Vision.addLight({ x: l.x + 0.5, y: l.y + 0.4, r: 1.5, a: 0.75 });
  for (const a of G.aItems) Vision.addLight({ x: a.x + 0.5, y: a.y + 0.4, r: 1.6, a: 0.8 });
  // fake candles give a smaller, colder light — one of their tells
  for (const c of G.candles) Vision.addLight({ x: c.x + 0.5, y: c.y + 0.5, r: c.fake ? 1.5 : CFG.CANDLE_RADIUS, a: c.fake ? 0.7 : 0.95 });
  for (const f of M.furn) if (f.kind === 'lamp') Vision.addLight({ x: f.x + 0.5, y: f.y + 0.2, r: 1.7, a: 0.6 });
  if (P.hero) Vision.addLight({ x: P.x, y: P.y - 0.4, r: 3, a: 1 });
  if (K && K.kind === 'janitor' && K.flashing) Vision.addLight({ x: K.x + Math.cos(K.ang) * 1.5, y: K.y + Math.sin(K.ang) * 1.5, r: 2.2, a: 0.9 });
  let darkness = G.blackoutT > 0 ? 0.96 : 0.6;
  if (G.phase === 'title') darkness = 0.7;
  if (G.phase === 'explode') darkness *= 1 - Math.min(1, G.whiteFlash);
  Vision.drawMask(camX, camY, darkness, { x: vx, y: vy, r: vr });
  drawPathOutline(camX, camY);

  // glow layer
  L.globalCompositeOperation = 'lighter';
  for (const l of G.laurels) { L.globalAlpha = 0.22 + Math.sin(l.t * 3) * 0.08; disc(l.x * TS + 7 - camX, l.y * TS + 5 - camY, 7, '#ffcc33'); }
  for (const a of G.aItems) { L.globalAlpha = 0.3; disc(a.x * TS + 7 - camX, a.y * TS + 5 - camY, 8, '#ffcc33'); }
  for (const c of G.candles) { L.globalAlpha = 0.18 + Math.sin(c.t * 9) * 0.04; disc(c.x * TS + 7 - camX, c.y * TS + 2 - camY, c.fake ? 3 : 4, c.fake ? '#6ad040' : '#ff9a3a'); }
  L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
  for (const c of G.candles) drawCandle(c.x * TS + 7 - camX, c.y * TS + 10 - camY, c.t, c.fake);
  for (const l of G.laurels) if (!Vision.visibleTile(l.x, l.y)) { L.globalAlpha = 0.55; drawLaurel(l.x * TS + 7 - camX, l.y * TS + 5 - camY, l.t); L.globalAlpha = 1; }
  // revealed killers (duplicate-letter buff, revenge)
  if (reveal && G.phase !== 'title') {
    for (const e of G.enemies) {
      if (!e.alive || e._drawn) continue;
      if (G.mode === 'revenge' && !e.main && G.dupT <= 0) continue;
      L.globalAlpha = 0.75; e.draw(camX, camY, G.mode === 'revenge' ? '#ffd23f' : '#ff3048'); L.globalAlpha = 1;
      e._revealed = true;
    }
  }
  FX.draw(camX, camY, true);

  // world UI
  for (const e of G.enemies) if (e.alive && (e._drawn || reveal)) { if (e.drawOverhead) e.drawOverhead(camX, camY); }
  for (const e of G.enemies) if (e.alive && e.drawWorldUI) e.drawWorldUI(camX, camY);
  for (const f of M.hideSpots) if (f.check > 0) iconGauge(f.x * TS + 7 - camX, f.y * TS - 12 - camY, f.check);
  const [PX, PY] = playerScreenPos(camX, camY);
  if (G.eyeT > 0) iconEye(PX, PY - 30 - Math.sin(G.time * 3) * 1.5, G.time);
  if (G.sirenT > 0) iconSiren(PX, PY - 30, G.time);
  if (P.holdObj && P.holdT > 0) iconGauge(P.holdObj.x * TS + 7 - camX, P.holdObj.y * TS - 6 - camY, P.holdT / CFG.CANDLE_HOLD, '#ffe08a');
  if (reveal && G.phase === 'play') for (const e of G.enemies) if (e.alive && (e.main || G.dupT > 0)) edgeArrow(e.x * TS - camX, e.y * TS - 8 - camY, G.mode === 'revenge' ? C.gold : C.red);

  // phase overlays (low-res)
  if (G.phase === 'hellgate') drawHellgate(camX, camY);
  if (G.phase === 'explode') drawExplosion(camX, camY);
  if (G.redFlash > 0) { L.globalAlpha = Math.min(0.5, G.redFlash); L.fillStyle = '#a0101a'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
  if (P.hp === 1 && G.mode === 'normal' && G.phase === 'play') vignette('#6a0010', 0.25 + Math.sin(G.rt * 5) * 0.12);
  if (G.mode === 'revenge') vignette(C.gold2, 0.22 + Math.sin(G.rt * 8) * 0.06);
  if (G.whiteFlash > 0) { L.globalAlpha = Math.min(1, G.whiteFlash); L.fillStyle = '#fffaf0'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
}

function wellRipple(w) {
  const K = G.killer;
  if (!K || !K.trav || K.trav.kind !== 'well') return 0;
  const to = K.trav.to;
  if (to === w.y * M.w + w.x && K.trav.t >= 0.35 && K.trav.t < 1.1) return K.trav.t;
  return 0;
}
function drawWallCrack(c, camX, camY) {
  const TS = CFG.TS, X = c.x * TS - camX, Y = c.y * TS - camY;
  const f = Math.min(1, c.t / CFG.BUTCHER_BREAK_WINDUP);
  const n = 2 + Math.floor(f * 6);
  for (let i = 0; i < n; i++) {
    const a = hash2(c.x * 7 + i, c.y * 3) * TAU, l = 3 + f * 6;
    line(X + 7, Y + 7, X + 7 + Math.cos(a) * l, Y + 7 + Math.sin(a) * l, '#0a0507');
  }
  if (f > 0.5 && ((G.rt * 30) | 0) % 2) px(X + rand(2, 12), Y + rand(2, 12), '#8a7a70');
}
function vignette(c, a) {
  const W = Screen.W, H = Screen.H;
  L.globalAlpha = clamp(a, 0, 1);
  for (let i = 0; i < 6; i++) { L.globalAlpha = clamp(a * (1 - i / 6), 0, 1); L.fillStyle = c; L.fillRect(0, i, W, 1); L.fillRect(0, H - 1 - i, W, 1); L.fillRect(i, 0, 1, H); L.fillRect(W - 1 - i, 0, 1, H); }
  L.globalAlpha = 1;
}
function edgeArrow(x, y, c) {
  const W = Screen.W, H = Screen.H, m = 10;
  if (x >= m && y >= 26 && x <= W - m && y <= H - 60) return;
  const cx = W / 2, cy = H / 2, a = Math.atan2(y - cy, x - cx);
  const ex = clamp(x, m, W - m), ey = clamp(y, 28, H - 62);
  const pts = [ex + Math.cos(a) * 5, ey + Math.sin(a) * 5, ex + Math.cos(a + 2.4) * 4, ey + Math.sin(a + 2.4) * 4, ex + Math.cos(a - 2.4) * 4, ey + Math.sin(a - 2.4) * 4];
  if (((G.rt * 4) | 0) % 2) poly(pts, c);
}
function drawHellgate(camX, camY) {
  const TS = CFG.TS, t = G.phaseT;
  const X = P.x * TS - camX, Y = P.y * TS - camY + 2;
  const R = 10 + Math.min(1, t / 1) * 22;
  L.globalAlpha = Math.min(1, t * 2);
  for (let k = 0; k < 2; k++) {
    const pts = [];
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + k * Math.PI / 3 * 1 + (i / 3) * TAU + t * 0.4; pts.push([X + Math.cos(a) * R, Y + Math.sin(a) * R * 0.62]); }
    for (let i = 0; i < 3; i++) line(pts[i][0], pts[i][1], pts[(i + 1) % 3][0], pts[(i + 1) % 3][1], '#ff2a3a');
  }
  ring(X, Y, R + 2, '#ff2a3a');
  L.globalAlpha = 1;
  const hole = clamp((t - 1) / 0.8, 0, 1);
  if (hole > 0) { ellipse(X, Y, 3 + hole * 12, (3 + hole * 12) * 0.55, 0, '#000000'); ellipse(X, Y, 1 + hole * 9, (1 + hole * 9) * 0.5, 0, '#3a0006'); }
  const sink = clamp((t - 1.5) / 1, 0, 1);
  if (sink < 1) {
    const st = { ang: P.ang + t * 4 * sink, phase: 0, amt: 0, breath: 0, headTurn: 0, scale: 1 - sink * 0.6 };
    drawRunner(X, Y + 2 + sink * 10, st);
  }
  if (rnd() < 0.6) FX.burst(P.x * TS + rand(-12, 12), P.y * TS + rand(-6, 6), 1, { c: ['#ff2a3a', '#ff8a3a', '#ffd23f'], sp0: 4, sp1: 20, l0: 0.3, l1: 0.8, glow: true, ang: -Math.PI / 2, spread: 0.6 });
}
function drawExplosion(camX, camY) {
  const TS = CFG.TS, t = G.phaseT, K = G.killer;
  const X = K.x * TS - camX, Y = K.y * TS - camY;
  const R = Ease.outCubic(Math.min(1, t / 0.9)) * 120;
  L.globalAlpha = clamp(1.4 - t * 0.6, 0, 1);
  disc(X, Y, R, '#ff6a1a'); disc(X, Y, R * 0.75, '#ffb03a'); disc(X, Y, R * 0.45, '#fff3c0');
  L.globalAlpha = 1;
}
