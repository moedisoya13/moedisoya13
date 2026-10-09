// ─────────────────────────────────────────────────────────────
// Items — keys, glowing laurels + slot reel (S·H·A·Z·A·M / honey),
// the A-only phase after a revenge ends, honey traps
// ─────────────────────────────────────────────────────────────

const SLOT_SYMS = ['S', 'H', 'A', 'Z', 'M', 'honey'];

function itemOccupancy() {
  const s = new Set();
  const add = (o) => s.add(o.y * M.w + o.x);
  G.keyItems.forEach(add); G.laurels.forEach(add); G.aItems.forEach(add); G.candles.forEach(add); G.honeyTraps.forEach(add);
  for (const w of M.wells) add(w);
  return s;
}

function spawnTile(minD = 6, o = {}) {
  const occ = itemOccupancy();
  const locked = o.lockedP ? G.openTiles.filter(([x, y]) => inLockedRoom(x, y)) : null;
  for (let i = 0; i < 80; i++) {
    let t = null;
    if (locked && locked.length && rnd() < o.lockedP) t = pick(locked);
    if (!t) t = pick(G.openTiles);
    const [x, y] = t;
    if (!openTile(x, y) || occ.has(y * M.w + x)) continue;
    if (P && dist(x + 0.5, y + 0.5, P.x, P.y) < minD) continue;
    if (o.maxD && P && dist(x + 0.5, y + 0.5, P.x, P.y) > o.maxD) continue;
    if (o.noLocked && inLockedRoom(x, y)) continue;
    if (o.hidden && Vision.visibleTile(x, y)) continue;
    if (o.clear && !candleSpotClear(x, y)) continue;
    return [x, y];
  }
  return pick(G.openTiles);
}

function initItems() {
  for (let i = 0; i < CFG.KEYS; i++) { const [x, y] = spawnTile(3, { noLocked: true }); G.keyItems.push({ x, y, t: rand(0, 5) }); }
  for (let i = 0; i < CFG.LAURELS; i++) { const [x, y] = spawnTile(4, { lockedP: 0.3 }); G.laurels.push({ x, y, t: rand(0, 5) }); }
  // a starter key close by so the first locked door is meaningful
  if (P) { const [x, y] = spawnTile(2, { maxD: 6, noLocked: true }); G.keyItems.push({ x, y, t: 0 }); }
}

function updateItems(dt) {
  for (const k of G.keyItems) k.t += dt;
  for (const l of G.laurels) l.t += dt;
  for (const a of G.aItems) a.t += dt;
  for (const c of G.candles) c.t += dt;
  // respawns
  const tick = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { arr[i] -= dt; if (arr[i] <= 0) { arr.splice(i, 1); return true; } } return false; };
  if (tick(G.keyRespawn)) { const [x, y] = spawnTile(6); G.keyItems.push({ x, y, t: 0 }); }
  if (G.keyItems.length + G.keyRespawn.length < CFG.KEYS) G.keyRespawn.push(CFG.KEY_RESPAWN);
  if (!G.aPhase) {
    if (tick(G.laurelRespawn)) { const [x, y] = spawnTile(7, { lockedP: 0.3 }); G.laurels.push({ x, y, t: 0 }); FX.sparks(x * CFG.TS + 7, y * CFG.TS + 7, 10); }
    if (G.laurels.length + G.laurelRespawn.length < CFG.LAURELS && G.mode === 'normal') G.laurelRespawn.push(CFG.LAUREL_RESPAWN);
  } else if (G.mode === 'normal') {
    const need = 2 - P.letters.A;
    if (tick(G.aRespawn)) { const [x, y] = spawnTile(7, { lockedP: 0.25 }); G.aItems.push({ x, y, t: 0 }); }
    if (G.aItems.length + G.aRespawn.length < need) G.aRespawn.push(CFG.LAUREL_RESPAWN);
  }
}

function pickupItems() {
  const tx = Math.floor(P.x), ty = Math.floor(P.y), TS = CFG.TS;
  if (P.hero) return;
  let i = G.keyItems.findIndex((k) => k.x === tx && k.y === ty);
  if (i >= 0 && P.keys < CFG.KEY_MAX) {
    G.keyItems.splice(i, 1); P.keys++;
    Sfx.key(); FX.sparks(tx * TS + 7, ty * TS + 6, 8, [C.key, '#ffffff']);
    G.keyRespawn.push(CFG.KEY_RESPAWN); G.hudPop.keys = 1;
  }
  i = G.laurels.findIndex((l) => l.x === tx && l.y === ty);
  if (i >= 0) {
    G.laurels.splice(i, 1);
    Sfx.laurel(); FX.ring(tx * TS + 7, ty * TS + 6, C.gold, 16); FX.sparks(tx * TS + 7, ty * TS + 6, 14);
    G.slot.queue.push(rollSlot());
    G.laurelRespawn.push(CFG.LAUREL_RESPAWN);
  }
  i = G.aItems.findIndex((a) => a.x === tx && a.y === ty);
  if (i >= 0) {
    G.aItems.splice(i, 1);
    if (P.letters.A < 2) { P.letters.A++; G.letterPop.A = 1; Sfx.letter(); }
    FX.ring(tx * TS + 7, ty * TS + 6, C.gold, 18); FX.sparks(tx * TS + 7, ty * TS + 6, 16);
    checkShazam();
  }
}

function rollSlot() {
  if (PARAMS.slot) return PARAMS.slot;
  if (rnd() < CFG.SLOT_LETTER_P) return LETTERS[randi(0, LETTERS.length - 1)];
  return 'honey';
}

function updateSlot(dt) {
  const S = G.slot;
  if (!S.active && S.queue.length) {
    const res = S.queue.shift();
    S.active = { res, t: 0, dur: CFG.SLOT_SPIN, idx: -1, landed: false, holdT: 0, total: 3 * SLOT_SYMS.length + SLOT_SYMS.indexOf(res) };
  }
  const s = S.active;
  if (!s) return;
  s.t += dt;
  const pos = s.total * Ease.outCubic(Math.min(1, s.t / s.dur));
  const idx = Math.floor(pos);
  if (idx !== s.idx) { s.idx = idx; if (!s.landed) Sfx.slotTick(); }
  s.pos = pos;
  if (s.t >= s.dur && !s.landed) { s.landed = true; applySlot(s.res); }
  if (s.landed) { s.holdT += dt; if (s.holdT > 0.6) S.active = null; }
}

function applySlot(res) {
  if (res === 'honey') {
    if (P.honey < CFG.HONEY_MAX) { P.honey++; G.hudPop.honey = 1; }
    Sfx.honeyGet(); Sfx.slotLand(true);
    return;
  }
  let got = false;
  if (res === 'A') { if (P.letters.A < 2) { P.letters.A++; got = true; } }
  else if (!P.letters[res]) { P.letters[res] = 1; got = true; }
  if (got) { G.letterPop[res] = 1; Sfx.slotLand(true); Sfx.letter(); checkShazam(); }
  else {
    // duplicate: 5 s of reveal + a little speed
    G.dupT = CFG.DUP_BUFF; Sfx.slotLand(false); Sfx.dup();
    FX.ring(P.x * CFG.TS, P.y * CFG.TS - 6, '#7ad0ff', 22);
  }
}

function lettersComplete() { const l = P.letters; return l.S && l.H && l.Z && l.M && l.A >= 2; }
function checkShazam() { if (lettersComplete() && G.mode === 'normal') G.pendingShazam = true; }

function drawItems(camX, camY, t) {
  const TS = CFG.TS;
  for (const h of G.honeyTraps) if (Vision.visibleTile(h.x, h.y)) drawHoney(h.x * TS + 7 - camX, h.y * TS + 8 - camY, t);
  for (const k of G.keyItems) {
    if (!Vision.visibleTile(k.x, k.y)) continue;
    // the Janitor's flashlight blinds you: keys only show up close
    if (G.blackoutT > 0 && dist(k.x + 0.5, k.y + 0.5, P.x, P.y) > CFG.JANITOR_KEY_SEE) continue;
    drawKey(k.x * TS + 7 - camX, k.y * TS + 7 - camY, k.t);
  }
  for (const l of G.laurels) drawLaurel(l.x * TS + 7 - camX, l.y * TS + 5 - camY, l.t);
  for (const a of G.aItems) drawAItem(a.x * TS + 7 - camX, a.y * TS + 5 - camY, a.t);
}
