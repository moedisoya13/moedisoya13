// ─────────────────────────────────────────────────────────────
// HUNT — 살인마 모드 (GDD §13)
// Play one of the six killers and hunt four AI victims before dawn.
// One hit kills a victim. No SHAZAM in this mode.
// While hunting, the global `P` points at the player's killer so the
// shared camera / sound / spawn helpers follow the hunter.
// ─────────────────────────────────────────────────────────────

Object.assign(CFG, {
  HUNT_VICTIMS: 4, HUNT_TIME: 300,
  HUNT_VICTIM_RATIO: 0.96,          // victims run at 96% of the hunter
  HUNT_WALK: 0.7,                   // calm victims walk
  HUNT_STAMINA: 7, HUNT_TIRED: 3, HUNT_TIRED_MULT: 0.8,
  HUNT_ATK_WINDUP: 0.12, HUNT_ATK_REACH: 1.5, HUNT_ATK_RECOVER: 0.35, HUNT_ATK_MISS: 0.5,
  HUNT_INSTINCT_AFTER: 15, HUNT_INSTINCT_EVERY: 12, HUNT_INSTINCT_SHOW: 2.2,
  HUNT_KEYS: 4, HUNT_HONEY: 2,
  HUNT_BLIND: 2.5, HUNT_BATON_STUN: 2.5, HUNT_SUMMON_CD: 15, HUNT_CANDLE_STOCK: 3,
  HUNT_TENTACLE_CD: 15, HUNT_SPEAR_WINDUP: 0.45, HUNT_WELL_GAP: 8,
});

const VICTIMS = [
  { name: '민지', coat: '#f2c230', coat2: '#c99a1a', legs: '#2d3552' },
  { name: '준호', coat: '#3fc1b0', coat2: '#2a8a7e', legs: '#3a2d4a' },
  { name: '서연', coat: '#ef6fa0', coat2: '#b84a76', legs: '#2d3552' },
  { name: '도윤', coat: '#8fd14f', coat2: '#5f9a2e', legs: '#3a3030' },
];

const HUNT_INFO = {
  butcher: { ko: '도살자', abil: '벽 뚫기', desc: '앞의 벽을 부숴 지름길 · 문을 빨리 부숨' },
  witch: { ko: '마녀', abil: '양초 설치', desc: '양초 빛 속 피해자 노출 · 6개 켜면 의식' },
  janitor: { ko: '수위', abil: '손전등', desc: '목격할수록 등급↑ · B부터 피해자 시야 공유' },
  evolver: { ko: '초진화체', abil: '촉수', desc: '멈추면 은신 · 진화 후 촉수로 낚아챔' },
  doctor: { ko: '박사', abil: '기계 소환', desc: '전기봉 1타 기절·2타 처치 · 로봇 무제한 소환' },
  samurai: { ko: '무사', abil: '창 찌르기', desc: '벽 너머 투시·관통 · 우물 두 개로 이동' },
};

// ═════════════ victims ═════════════
class Victim extends Enemy {
  constructor(tx, ty, idx) {
    super('victim', tx, ty);
    this.idx = idx; this.info = VICTIMS[idx % VICTIMS.length];
    this.main = false; this.hostile = false; this.canBash = false; this.isVictim = true;
    this.ratio = CFG.HUNT_VICTIM_RATIO; this.phaseRate = 4.1; this.headH = 22;
    this.state = 'roam'; this.calmT = 99; this.panicT = 0; this.stamina = CFG.HUNT_STAMINA; this.tiredT = 0;
    this.hideSpot = null; this.hideTarget = null; this.hideT = 0; this.boltAt = null; this.keys = 0; this.honey = 0;
    this.dead = false; this.deadT = 0; this.exposedT = 0; this.sirenT = 0; this.busyT = 0; this.busyFn = null; this.lastDoor = null;
    this.screamT = 0; this.vpts = []; this.stepIdx = 0; this.roamT = 0;
  }
  canUnlock() { return this.keys > 0; }
  speed() { let s = CFG.PLAYER_SPEED * this.ratio; if (this.tiredT > 0) s *= CFG.HUNT_TIRED_MULT; return s; }
  honeyCheck() {} // a victim never sticks to honey
  onUnlock() { huntWitness(this, 'key'); }
  onTrav(kind) { if (kind === 'toilet') huntWitness(this, 'toilet'); }
  hearNoise(x, y) { if (this.state === 'roam' && !this.dead) { this.state = 'flee'; this.calmT = 2.5; } }

  seesKiller() {
    const K = P, d = dist(this.x, this.y, K.x, K.y);
    if (d > 8.5) return false;
    if (K.kind === 'evolver' && K.stealth && d > 1.5) return false;
    if (!los(this.x, this.y, K.x, K.y)) return false;
    if (d <= 2.6) return true;
    return Math.abs(angDiff(this.ang, Math.atan2(K.y - this.y, K.x - this.x))) <= 1.35;
  }

  update(dt) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt); this.exposedT = Math.max(0, this.exposedT - dt); this.sirenT = Math.max(0, this.sirenT - dt);
    this.spotT = Math.max(0, this.spotT - dt); this.screamT -= dt;
    if (this.dead) { this.deadT += dt; return; }
    if (this.state === 'hidden') { this.updateHidden(dt); return; }
    if (this.pull) { this.updatePull(dt); return; }
    if (this.stunT > 0) { this.stunT -= dt; this.amt = approach(this.amt, 0, dt * 8); return; }
    if (this.trav) { this.updateTrav(dt); return; }
    if (this.busyT > 0) {
      this.busyT -= dt; this.amt = approach(this.amt, 0, dt * 8);
      if (this.busyT <= 0 && this.busyFn) { const f = this.busyFn; this.busyFn = null; f(); }
      return;
    }
    const sees = this.seesKiller();
    if (sees) {
      if (this.state !== 'flee' || this.calmT > 3) {
        this.panicT = 0.35; this.spotT = 0.9;
        if (this.screamT <= 0) { if (nearVol(this.x, this.y, 16) > 0) Sfx.victimScream(this.idx); this.screamT = 4; }
      }
      if (this.state === 'gohide') { this.hideTarget = null; this.path = null; }
      this.state = 'flee'; this.calmT = 0;
    } else if (this.state === 'flee') { this.calmT += dt; if (this.calmT > 6) { this.state = 'roam'; this.goal = null; this.path = null; } }
    // stamina: a long sprint leaves them winded for a moment
    if (this.state === 'flee' || this.state === 'gohide') {
      this.stamina -= dt;
      if (this.stamina <= 0 && this.tiredT <= 0) this.tiredT = CFG.HUNT_TIRED;
    } else this.stamina = Math.min(CFG.HUNT_STAMINA, this.stamina + dt * 1.5);
    if (this.tiredT > 0) { this.tiredT -= dt; if (this.tiredT <= 0) this.stamina = CFG.HUNT_STAMINA * 0.6; }
    if (this.panicT > 0) {
      this.panicT -= dt;
      this.ang = angApproach(this.ang, Math.atan2(P.y - this.y, P.x - this.x), dt * 14);
      this.amt = approach(this.amt, 0, dt * 8);
      return;
    }
    if (this.state === 'flee') this.fleeStep(dt, sees);
    else if (this.state === 'gohide') this.goHideStep(dt);
    else this.roamStep(dt);
    this.lockBehind();
    this.pickupItems();
  }

  // shut the door they just ran through
  lockBehind() {
    const d = doorAt(Math.floor(this.x), Math.floor(this.y));
    if (d) { this.lastDoor = d; return; }
    const ld = this.lastDoor;
    if (!ld) return;
    this.lastDoor = null;
    const dk = dist(P.x, P.y, ld.x + 0.5, ld.y + 0.5);
    if (this.state !== 'flee' || ld.state !== 'open' || dk > 9 || dk < 1.4 || rnd() > 0.85) return;
    this.busyT = 0.25;
    this.busyFn = () => {
      if (ld.state !== 'open' || huntTileTaken(ld.x, ld.y)) return;
      ld.state = 'locked'; ld.bash = 0;
      if (nearVol(ld.x, ld.y, 14) > 0) Sfx.lock();
      repathAll();
    };
  }

  fleeStep(dt, sees) {
    const dk = dist(this.x, this.y, P.x, P.y);
    if (this.honey > 0 && sees && dk < 3.6) {
      const tx = Math.floor(this.x), ty = Math.floor(this.y);
      if (!G.honeyTraps.some((h) => h.x === tx && h.y === ty)) {
        this.honey--; G.honeyTraps.push({ x: tx, y: ty, t: 0 });
        if (nearVol(this.x, this.y, 12) > 0) Sfx.honeyPlace();
        huntWitness(this, 'honey');
      }
    }
    if (!sees && this.calmT > 0.6 && dk > 4.5) {
      const spot = this.findHideSpot();
      if (spot) { this.state = 'gohide'; this.hideTarget = spot; this.goal = null; this.path = null; return; }
    }
    this.updateFlee(dt); // Enemy's flee planner — flees from P (the hunter)
    this.footsteps();
  }
  findHideSpot() {
    let best = null, bd = 5.5;
    for (const f of M.hideSpots) {
      if (f.occupied || inLockedRoom(f.ax, f.ay)) continue;
      if (G.victims.some((v) => v !== this && !v.dead && v.hideTarget === f)) continue;
      if (dist(f.ax + 0.5, f.ay + 0.5, P.x, P.y) < 4) continue;
      const d = dist(f.ax + 0.5, f.ay + 0.5, this.x, this.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  goHideStep(dt) {
    const f = this.hideTarget;
    if (!f || f.occupied) { this.state = 'flee'; this.hideTarget = null; return; }
    this.setGoal([f.ax, f.ay]);
    if (!this.goal) { this.state = 'flee'; this.hideTarget = null; return; }
    const m = this.moveAlong(dt);
    this.animate(m, dt);
    if (this.reached([f.ax, f.ay]) && atCenter(this)) {
      this.state = 'hidden'; this.hideSpot = f; this.hideTarget = null; f.occupied = true; f.shake = 0.3;
      this.hideT = 0; this.boltAt = null; this.x = f.x + 0.5; this.y = f.y + 0.5; this.amt = 0;
      if (nearVol(this.x, this.y, 10) > 0) Sfx.hide();
    }
  }
  updateHidden(dt) {
    const f = this.hideSpot;
    this.hideT += dt;
    if (f.check > 0) {
      // some victims panic and burst out mid-check — strike fast
      if (this.boltAt === null) this.boltAt = rnd() < 0.55 ? rand(0.3, 0.85) : 2;
      if (f.check >= this.boltAt) { this.exitHide(true); return; }
    } else this.boltAt = null;
    const dk = dist(P.x, P.y, this.x, this.y);
    if ((this.hideT > 9 && dk > 9) || this.hideT > 28) this.exitHide(false);
  }
  exitHide(bolt) {
    const f = this.hideSpot;
    f.occupied = false; f.shake = 0.35; this.hideSpot = null;
    if (P.check && P.check.f === f) P.check = null; // the search ends the moment they burst out
    f.check = 0;
    let ex = f.ax, ey = f.ay, best = -Infinity;
    for (const [dx, dy] of DIRS) {
      const x = f.x + dx, y = f.y + dy;
      if (!walkable(x, y)) continue;
      const s = Math.min(6, dist(x + 0.5, y + 0.5, P.x, P.y)) - (dist(x + 0.5, y + 0.5, P.x, P.y) < 0.8 ? 10 : 0);
      if (s > best) { best = s; ex = x; ey = y; }
    }
    this.x = ex + 0.5; this.y = ey + 0.5; this.path = null; this.goal = null;
    this.ang = Math.atan2(ey - f.y, ex - f.x);
    if (bolt) { this.state = 'flee'; this.calmT = 0; this.spotT = 0.9; Sfx.victimScream(this.idx); this.screamT = 4; }
    else { this.state = 'roam'; this.calmT = 99; }
    if (nearVol(this.x, this.y, 10) > 0) Sfx.hide();
  }
  roamStep(dt) {
    this.roamT -= dt;
    // snuff a candle right next to them
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    const c = G.candles.find((q) => Math.abs(q.x - tx) + Math.abs(q.y - ty) <= 1);
    if (c) {
      this.busyT = 0.5;
      this.busyFn = () => huntSnuff(this, c);
      return;
    }
    if (!this.goal || this.reached(this.goal) || this.roamT <= 0) { this.goal = this.pickRoamGoal(); this.path = null; this.roamT = 9; }
    if (this.goal) this.setGoal(this.goal);
    const m = this.moveAlong(dt, CFG.HUNT_WALK);
    this.animate(m, dt);
  }
  pickRoamGoal() {
    const near = (list, maxD) => { let b = null, bd = maxD; for (const o of list) { const d = dist(o.x + 0.5, o.y + 0.5, this.x, this.y); if (d < bd && dist(o.x + 0.5, o.y + 0.5, P.x, P.y) > 5) { bd = d; b = o; } } return b; };
    let t = null;
    if (this.keys < 2) t = near(G.keyItems, 12);
    if (!t && this.honey < 1) t = near(G.honeyItems, 12);
    if (!t) t = near(G.candles, 9);
    if (t) { const g = walkGoal(t.x + 0.5, t.y + 0.5); if (g) return g; }
    for (let i = 0; i < 30; i++) { const o = pick(G.openTiles); if (walkable(o[0], o[1]) && dist(o[0], o[1], P.x, P.y) > 9) return [o[0], o[1]]; }
    const o = pick(G.openTiles); return [o[0], o[1]];
  }
  pickupItems() {
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    let i = G.keyItems.findIndex((k) => k.x === tx && k.y === ty);
    if (i >= 0 && this.keys < 3) { G.keyItems.splice(i, 1); this.keys++; G.keyRespawn.push(CFG.KEY_RESPAWN); }
    i = G.honeyItems.findIndex((k) => k.x === tx && k.y === ty);
    if (i >= 0 && this.honey < 1) { G.honeyItems.splice(i, 1); this.honey++; G.honeyRespawn.push(CFG.KEY_RESPAWN * 2); }
  }
  footsteps() {
    const idx = Math.floor(this.phase / Math.PI);
    if (idx !== this.stepIdx) { this.stepIdx = idx; const v = nearVol(this.x, this.y, 8); if (v > 0.1) Sfx.step(0.035 * v); }
  }
  updatePull(dt) {
    const p = this.pull;
    p.t += dt;
    const e = Ease.inCubic(Math.min(1, p.t / p.dur));
    this.x = lerp(p.sx, p.tx, e); this.y = lerp(p.sy, p.ty, e);
    if (p.t >= p.dur) { this.pull = null; killVictim(this, 'tentacle'); }
  }

  drawBody(X, Y, st) { st.pal = this.info; drawRunner(X, Y, st); }
  draw(camX, camY, silhouette) {
    if (this.state === 'hidden') return;
    const [X, Y] = this.feet(camX, camY);
    if (this.dead) {
      const f = Math.min(1, this.deadT / 0.5);
      groundShadow(X, Y, 5, 2);
      drawRunner(X, Y, { ang: this.ang, phase: 0, amt: 0, breath: 0, tilt: -Ease.outBack(f) * 1.45, pal: this.info, dead: true, flash: silhouette });
      return;
    }
    super.draw(camX, camY, silhouette);
  }
  drawOverhead(camX, camY) {
    if (this.dead || this.state === 'hidden') return;
    const [X, Y] = this.feet(camX, camY);
    const top = Y - this.headH;
    if (this.spotT > 0) text3('!', X + 0.5, top - 6, C.white, 1, 'center');
    if (this.stunT > 0) iconStars(X, top + 2, this.t);
    if (this.sirenT > 0) iconSiren(X, top - 6, this.t);
    if (this.tiredT > 0 && ((this.t * 4) | 0) % 2) { px(X + 4, top + 1, '#9fd8ff'); px(X + 5, top + 2, '#9fd8ff'); }
  }
}

// ═════════════ the Doctor's machines (hunt version) ═════════════
class HuntMachine extends Machine {
  constructor(kind, tx, ty, doc) { super(kind, tx, ty, doc); this.ratio = 1.0; this.stunT = 0.5; this.roamGoal = null; }
  update(dt) {
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt); this.dashCd -= dt; this.sndT -= dt;
    if (this.stunT > 0) { this.stunT -= dt; return; }
    if (this.stuckT > 0) { this.stuckT -= dt; this.amt = approach(this.amt, 0, dt * 8); return; }
    this.dormant = dist(this.x, this.y, this.doc.x, this.doc.y) > CFG.MACHINE_LEASH;
    if (this.dormant) { this.amt = approach(this.amt, 0, dt * 6); return; }
    if (this.sndT <= 0 && nearVol(this.x, this.y, 9) > 0.1) { this.sndT = rand(1.4, 2.4); this.kind === 'saw' ? Sfx.saw() : Sfx.drill(); }
    this.sees = false;
    if (this.state === 'bash') { this.updateBash(dt); return; }
    if (this.dash) {
      const s = this.dash;
      s.t += dt;
      if (s.phase === 'rev') { if (s.t >= CFG.SAW_DASH_WINDUP) { s.phase = 'go'; s.t = 0; Sfx.saw(); } }
      else {
        const m = gridMove(this, [s.dir], this.speed() * CFG.SAW_DASH_MULT * dt, walkable, 0.51);
        this.phase += m * 6; this.amt = 1;
        if (s.t >= CFG.SAW_DASH_TIME || m <= 0) { this.dash = null; this.dashCd = 5; this.path = null; }
      }
      this.killTouch();
      return;
    }
    let tgt = null, bd = 9;
    for (const v of G.victims) {
      if (v.dead || v.state === 'hidden') continue;
      const d = dist(this.x, this.y, v.x, v.y);
      if (d < bd && (v.exposedT > 0 || los(this.x, this.y, v.x, v.y))) { bd = d; tgt = v; }
    }
    if (tgt) {
      this.lastSeen = { x: tgt.x, y: tgt.y };
      const g = walkGoal(tgt.x, tgt.y); if (g) this.setGoal(g);
      if (this.kind === 'saw' && this.dashCd <= 0 && nearCenter(this)) {
        const [tx, ty] = this.tile(), px2 = Math.floor(tgt.x), py2 = Math.floor(tgt.y);
        if ((px2 === tx && Math.abs(py2 - ty) <= 4 && py2 !== ty) || (py2 === ty && Math.abs(px2 - tx) <= 4 && px2 !== tx)) {
          if (los(this.x, this.y, tgt.x, tgt.y)) { snapCenter(this); this.dash = { phase: 'rev', t: 0, dir: [Math.sign(px2 - tx), Math.sign(py2 - ty)] }; this.ang = Math.atan2(this.dash.dir[1], this.dash.dir[0]); Sfx.saw(); return; }
        }
      }
    } else {
      if (!this.roamGoal || this.reached(this.roamGoal)) {
        for (let i = 0; i < 20; i++) { const x = Math.floor(this.doc.x) + randi(-5, 5), y = Math.floor(this.doc.y) + randi(-5, 5); if (inB(x, y) && walkable(x, y)) { this.roamGoal = [x, y]; break; } }
      }
      if (this.roamGoal) this.setGoal(this.roamGoal);
    }
    const m = this.moveAlong(dt);
    this.animate(m, dt);
    this.killTouch();
  }
  killTouch() {
    for (const v of G.victims) if (!v.dead && v.state !== 'hidden' && !v.trav && dist(this.x, this.y, v.x, v.y) < 0.8) killVictim(v, 'machine');
  }
}

// ═════════════ setup ═════════════
function newHunt(kind) {
  G = makeG('hunt');
  G.victims = []; G.machines = []; G.honeyItems = []; G.honeyRespawn = [];
  G.huntT = CFG.HUNT_TIME; G.kills = 0; G.huntKind = kind; G.sinceSeen = 0; G.instinctCd = 0; G.instinctT = 0; G.exposeAllT = 0;
  G.fakeT = 0; G.eyeCycleT = 0; G.huntWin = false;
  G.noise = function (x, y, r) { for (const v of this.victims) if (!v.dead && dist(v.x, v.y, x, y) <= r) v.hearNoise(x, y); };
  const st = startTile();
  const K = new KILLER_TYPES[kind](st[0], st[1]);
  K.player = true; K.state = 'player'; K.ang = -Math.PI / 2; K.ratio = 1.0;
  K.check = null; K.bashP = null; K.abilCd = 0; K.atkCd = 0; K.stock = 1; K.stockT = 0; K.stillT = 0; K.trail = K.trail || [];
  if (kind === 'evolver') { K.stage = 'larva'; K.hostile = true; K.headH = 14; K.evoT = 0; }
  if (kind === 'samurai') K.useWells = true;
  P = K; G.killer = K;
  // victims spread far from the killer and from each other
  const f = costField(st[0], st[1], {});
  const cands = shuffle(G.openTiles.filter(([x, y]) => f[y * M.w + x] !== Infinity && f[y * M.w + x] >= 12 && walkable(x, y)));
  const spots = [];
  for (const c of cands) { if (spots.every((s) => dist(s[0], s[1], c[0], c[1]) >= 8)) spots.push(c); if (spots.length >= CFG.HUNT_VICTIMS) break; }
  while (spots.length < CFG.HUNT_VICTIMS) spots.push(pick(cands));
  spots.forEach((s, i) => G.victims.push(new Victim(s[0], s[1], i)));
  for (let i = 0; i < CFG.HUNT_KEYS; i++) { const [x, y] = spawnTile(6); G.keyItems.push({ x, y, t: rand(0, 5) }); }
  for (let i = 0; i < CFG.HUNT_HONEY; i++) { const [x, y] = spawnTile(6); G.honeyItems.push({ x, y, t: rand(0, 5) }); }
  updateCamera(0, true);
  G.phase = 'hintro'; G.phaseT = 0;
  Sfx.huntStart();
}

function huntTileTaken(x, y) {
  if (Math.floor(P.x) === x && Math.floor(P.y) === y) return true;
  for (const v of G.victims) if (!v.dead && Math.floor(v.x) === x && Math.floor(v.y) === y) return true;
  for (const m of G.machines) if (Math.floor(m.x) === x && Math.floor(m.y) === y) return true;
  return false;
}

function killVictim(v, cause) {
  if (v.dead) return;
  if (v.state === 'hidden' && v.hideSpot) {
    const f = v.hideSpot; f.occupied = false; f.check = 0; f.shake = 0.4; v.hideSpot = null;
    v.x = f.ax + 0.5; v.y = f.ay + 0.5;
  }
  v.dead = true; v.alive = false; v.deadT = 0; v.state = 'dead'; v.path = null; v.trav = null; v.pull = null; v.busyT = 0;
  if (v.hideTarget) v.hideTarget = null;
  G.kills++;
  const TS = CFG.TS, ang = Math.atan2(v.y - P.y, v.x - P.x);
  FX.blood(v.x * TS, v.y * TS - 7, 20, ang);
  for (let i = 0; i < 5; i++) FX.decal('blood', v.x * TS + rand(-5, 5), v.y * TS + rand(-2, 4), rand(1.5, 3), C.blood);
  Sfx.kill(); Sfx.victimScream(v.idx);
  G.shake = 7; G.hitStop = 0.09; G.redFlash = 0.18; G.hudPop['v' + v.idx] = 1; G.sinceSeen = 0;
  if (cause === 'hellgate') { FX.burst(v.x * TS, v.y * TS, 20, { c: ['#ff2a3a', '#ff8a3a', '#ffd23f'], sp0: 10, sp1: 40, l0: 0.4, l1: 1, glow: true, ang: -Math.PI / 2, spread: 0.6 }); }
  if (G.victims.every((q) => q.dead)) { G.huntWin = true; startHuntPhase('hwin'); }
}

// janitor: witnessing victims raises the grade; banned acts trigger the siren
function huntWitness(v, kind) {
  const K = P;
  if (!K || K.kind !== 'janitor' || v.dead) return;
  if (kind === 'toilet' && K.grade >= 1) { v.exposedT = CFG.JANITOR_SIREN; v.sirenT = CFG.JANITOR_SIREN; Sfx.siren(); }
  if (kind === 'honey' && K.grade >= 2) { v.exposedT = CFG.JANITOR_SIREN; v.sirenT = CFG.JANITOR_SIREN; Sfx.siren(); }
  if ((kind === 'key' || kind === 'toilet') && Vision.visible(v.x, v.y) && K.grade < 3) {
    K.setGrade(K.grade + 1); K.gradePop = 1; Sfx.stamp(); Sfx.whistle();
  }
}

// a victim blows out a candle: real → exposed, fake → stunned and exposed
function huntSnuff(v, c) {
  const i = G.candles.indexOf(c);
  if (i < 0 || v.dead) return;
  G.candles.splice(i, 1);
  const x = c.x * CFG.TS + 7, y = c.y * CFG.TS + 2;
  if (nearVol(c.x, c.y, 14) > 0) Sfx.candleOut();
  if (!c.fake) { v.exposedT = Math.max(v.exposedT, CFG.CANDLE_EXPOSE); FX.smoke(x, y, 6); }
  else { v.stunT = CFG.FAKE_SLOW; v.exposedT = Math.max(v.exposedT, CFG.FAKE_SLOW); FX.smoke(x, y, 10, ['#5a2a6a', '#3a1a4a', '#7a3a8a']); Sfx.cackle(); }
}

// ═════════════ phases ═════════════
function startHuntPhase(name) {
  G.phase = name; G.phaseT = 0;
  if (name === 'hunt') { Sfx.startDrone(); G.startT = G.rt; }
  if (name === 'hwin') { Sfx.stopDrone(); }
  if (name === 'hdawn') { Sfx.stopDrone(); Sfx.dawn(); }
  if (name === 'hend') { if (G.huntWin) Sfx.victory(); }
}

function updateHuntGame(dt) {
  const ph = G.phase;
  if (ph === 'hintro') {
    if (!G.introScream && G.phaseT > 1.2) { G.introScream = true; Sfx.scream(G.huntKind); }
    if (G.phaseT > 3.6 || (G.phaseT > 1.4 && Input.tapped())) startHuntPhase('hunt');
    return;
  }
  if (ph === 'hunt') { updateHunt(dt); return; }
  if (ph === 'hwin') { FX.update(dt); for (const v of G.victims) v.update(dt); if (G.phaseT > 1.8) startHuntPhase('hend'); return; }
  if (ph === 'hdawn') { FX.update(dt); if (G.phaseT > 2.6) startHuntPhase('hend'); return; }
  if (ph === 'hend') {
    FX.update(dt);
    if (G.phaseT > 1.2 && Input.tapped()) { Sfx.tap(); newGame(); G.phase = 'title'; }
  }
}

function updateHunt(dt) {
  if (G.hitStop > 0) { G.hitStop -= dt; return; }
  G.time += dt; G.huntT -= dt;
  const dec = (k, r = 1) => { G[k] = Math.max(0, G[k] - dt * r); };
  dec('whiteFlash', 1.6); dec('redFlash', 1.4); dec('toiletCd'); dec('exposeAllT'); dec('instinctT');
  G.shake = Math.max(0, G.shake - dt * 22);
  for (const k in G.hudPop) G.hudPop[k] = Math.max(0, G.hudPop[k] - dt * 3);

  updateHunter(dt);
  if (G.phase !== 'hunt') return;
  for (const v of G.victims) v.update(dt);
  for (const m of G.machines) m.update(dt);
  if (G.phase !== 'hunt') return;
  huntKillerRules(dt);
  if (G.phase !== 'hunt') return;
  // items for the victims
  const tick = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { arr[i] -= dt; if (arr[i] <= 0) { arr.splice(i, 1); return true; } } return false; };
  if (tick(G.keyRespawn)) { const [x, y] = spawnTile(6); G.keyItems.push({ x, y, t: 0 }); }
  if (G.keyItems.length + G.keyRespawn.length < CFG.HUNT_KEYS) G.keyRespawn.push(CFG.KEY_RESPAWN);
  if (tick(G.honeyRespawn)) { const [x, y] = spawnTile(6); G.honeyItems.push({ x, y, t: 0 }); }
  if (G.honeyItems.length + G.honeyRespawn.length < CFG.HUNT_HONEY) G.honeyRespawn.push(CFG.KEY_RESPAWN * 2);
  for (const k of G.keyItems) k.t += dt;
  for (const h of G.honeyItems) h.t += dt;
  for (const c of G.candles) c.t += dt;
  for (const f of M.furn) f.shake = Math.max(0, f.shake - dt);
  for (const d of M.doors) d.shake = Math.max(0, d.shake - dt);
  FX.update(dt);
  // hunting instinct: after a long dry spell, sense the nearest victim
  const seenNow = G.victims.some((v) => !v.dead && v.state !== 'hidden' && Vision.visible(v.x, v.y));
  G.sinceSeen = seenNow ? 0 : G.sinceSeen + dt;
  if (G.sinceSeen > CFG.HUNT_INSTINCT_AFTER) {
    G.instinctCd -= dt;
    if (G.instinctCd <= 0) { G.instinctCd = CFG.HUNT_INSTINCT_EVERY; G.instinctT = CFG.HUNT_INSTINCT_SHOW; Sfx.tone(70, 50, 0.8, { type: 'sawtooth', vol: 0.08, filter: ['lowpass', 300] }); }
  } else G.instinctCd = 0;
  // their heartbeat gets louder as you close in
  let inten = 0;
  for (const v of G.victims) if (!v.dead) inten = Math.max(inten, clamp(1 - dist(P.x, P.y, v.x, v.y) / 8, 0, 1));
  G.hbT -= dt;
  if (inten > 0.05 && G.hbT <= 0) { Sfx.heartbeat(0.2 + inten * 0.5); G.hbT = lerp(1.1, 0.45, inten); }
  G.creakT -= dt;
  if (G.creakT <= 0) { G.creakT = rand(7, 15); Sfx.creak(); }
  updateCamera(dt);
  if (G.huntT <= 0) { G.huntT = 0; startHuntPhase('hdawn'); }
}

// per-killer rules that tick on their own
function huntKillerRules(dt) {
  const K = P;
  if (K.kind === 'witch') {
    K.stockT += dt;
    if (K.stockT >= CFG.WITCH_CANDLE_EVERY) { K.stockT = 0; if (K.stock < CFG.HUNT_CANDLE_STOCK) { K.stock++; G.hudPop.stock = 1; } }
    const lit = G.candles.reduce((n, c) => n + (c.fake ? 0 : 1), 0);
    if (lit >= 2) {
      G.fakeT += dt;
      if (G.fakeT >= CFG.WITCH_FAKE_EVERY) { G.fakeT = 0; if (G.candles.filter((c) => c.fake).length < CFG.WITCH_FAKE_MAX) { const [x, y] = spawnTile(5); G.candles.push({ x, y, fake: true, t: 0 }); } }
    }
    if (lit >= 4) {
      G.eyeCycleT += dt;
      if (G.eyeCycleT >= CFG.WITCH_EYE_EVERY) { G.eyeCycleT = 0; G.exposeAllT = CFG.WITCH_EYE_SHOW; Sfx.eye(); }
    }
    if (lit >= 6) {
      // the ritual drags one victim into the hellgate and consumes every candle
      const alive = G.victims.filter((v) => !v.dead);
      for (const c of G.candles) FX.smoke(c.x * CFG.TS + 7, c.y * CFG.TS + 2, 5, ['#5a0a14', '#2a0508']);
      G.candles.length = 0; G.whiteFlash = 0.5; Sfx.hellgate();
      if (alive.length) killVictim(pick(alive), 'hellgate');
    }
  } else if (K.kind === 'evolver') {
    K.evoT += dt;
    if (K.stage === 'larva' && K.evoT >= CFG.EVOLVE_ADULT) K.evolve('adult');
    else if (K.stage === 'adult' && K.evoT >= CFG.EVOLVE_PERFECT) K.evolve('perfect');
    else if (K.stage === 'perfect') {
      K.upgT += dt;
      if (K.upgT >= CFG.PERFECT_UPGRADE_EVERY) { K.upgT = 0; if (rnd() < 0.5) K.ratio += CFG.PERFECT_SPEED_STEP; else K.tentRange += CFG.PERFECT_RANGE_STEP; K.flashT = 0.3; Sfx.evolve(); }
    }
  }
}

// ═════════════ the player's killer ═════════════
function updateHunter(dt) {
  const K = P;
  K.t += dt; K.flashT = Math.max(0, K.flashT - dt); K.breath = Math.sin(K.t * 2) * 0.3;
  K.abilCd = Math.max(0, K.abilCd - dt); K.atkCd = Math.max(0, K.atkCd - dt);
  if (K.gradePop !== undefined) K.gradePop = Math.max(0, K.gradePop - dt * 1.5);
  K.trail.unshift([K.x, K.y]); if (K.trail.length > 16) K.trail.pop();
  // buffer presses so a tap during a swing / ability still goes through
  if (Input.btn.act.pressed) K.atkQ = 0.25;
  if (Input.btn.abil.pressed) K.abilQ = 0.3;
  K.atkQ = Math.max(0, (K.atkQ || 0) - dt); K.abilQ = Math.max(0, (K.abilQ || 0) - dt);
  if (K.stuckT > 0) { K.stuckT -= dt; K.amt = approach(K.amt, 0, dt * 8); return; }
  if (K.trav) { K.updateTrav(dt); return; }
  if (huntAbilityTick(K, dt)) return;
  const v = Input.vector();
  if (K.check) {
    if (v.mag > 0) { K.check.f.check = 0; K.check = null; }
    else { updateHuntCheck(dt); K.amt = approach(K.amt, 0, dt * 8); return; }
  }
  if (K.bashP) {
    if (v.mag > 0) { K.bashP = null; K.state = 'player'; K.bashDoor = null; }
    else { updateHuntBash(dt); return; }
  }
  // movement (slowed while swinging)
  let moved = 0;
  if (v.mag > 0) {
    const moving = K.amt > 0.2;
    moved = gridMove(K, railCands(K, v, moving), K.speed() * (K.atk ? 0.6 : 1) * dt, walkable, CFG.TURN_TOL, moving);
    if (!K.atk) K.ang = angApproach(K.ang, moved > 0 ? Math.atan2(K.dy, K.dx) : Math.atan2(v.y, v.x), dt * 16);
  }
  K.amt = approach(K.amt, moved > 0 ? 1 : 0, dt * (moved > 0 ? 7 : 9));
  if (moved > 0) {
    const before = Math.floor(K.phase / Math.PI);
    K.phase += moved * K.phaseRate;
    if (Math.floor(K.phase / Math.PI) !== before) Sfx.step(K.heavy ? 0.06 : 0.03, K.heavy);
    K.stillT = 0;
  } else { K.phase = approach(K.phase, Math.round(K.phase / Math.PI) * Math.PI, dt * 6); if (!K.atk) K.stillT += dt; }
  // honey traps laid by victims
  const tx = Math.floor(K.x), ty = Math.floor(K.y);
  const hi = G.honeyTraps.findIndex((h) => h.x === tx && h.y === ty);
  if (hi >= 0) { G.honeyTraps.splice(hi, 1); K.stuckT = CFG.HONEY_STICK; Sfx.honeyStick(); FX.burst(K.x * CFG.TS, K.y * CFG.TS, 10, { c: [C.honey, C.honey2], sp0: 10, sp1: 30, l0: 0.3, l1: 0.6 }); return; }
  if (K.atk) updateHuntAttack(dt);
  else if (K.atkQ > 0 && K.atkCd <= 0) { K.atkQ = 0; startHuntAttack(); }
  if (K.abilQ > 0 && !K.atk) { K.abilQ = 0; tryHuntAbility(); }
  K.ctx = findHuntContext();
  if (Input.btn.ctx.pressed && K.ctx) doHuntContext(K.ctx);
}

function liveVictims() { return G.victims.filter((v) => !v.dead && v.state !== 'hidden'); }

function startHuntAttack() {
  const K = P;
  // auto-aim at the closest victim within reach
  let best = null, bd = 1.9;
  for (const v of liveVictims()) { const d = dist(K.x, K.y, v.x, v.y); if (d < bd && los(K.x, K.y, v.x, v.y)) { bd = d; best = v; } }
  if (best) K.ang = Math.atan2(best.y - K.y, best.x - K.x);
  K.atk = { phase: 'windup', t: 0, f: 0, landed: false };
  Sfx.whoosh();
}
function updateHuntAttack(dt) {
  const K = P, a = K.atk;
  a.t += dt;
  if (a.phase === 'windup') {
    a.f = Math.min(1, a.t / CFG.HUNT_ATK_WINDUP);
    if (a.t >= CFG.HUNT_ATK_WINDUP) {
      a.phase = 'strike'; a.t = 0;
      let hit = null, bd = Infinity;
      for (const v of liveVictims()) {
        if (v.trav) continue;
        const d = dist(K.x, K.y, v.x, v.y);
        if (d > CFG.HUNT_ATK_REACH || d >= bd) continue;
        if (d > 0.5 && Math.abs(angDiff(K.ang, Math.atan2(v.y - K.y, v.x - K.x))) > 1.3) continue;
        if (!los(K.x, K.y, v.x, v.y)) continue;
        hit = v; bd = d;
      }
      if (hit) {
        a.landed = true;
        if (K.kind === 'doctor' && hit.stunT > 0) { Sfx.baton(); FX.sparks(hit.x * CFG.TS, hit.y * CFG.TS - 8, 18, ['#9fe8ff', '#ffffff']); killVictim(hit, 'shock'); } // second jolt kills
        else if (K.kind === 'doctor') { hit.stunT = CFG.HUNT_BATON_STUN; hit.exposedT = CFG.HUNT_BATON_STUN; Sfx.baton(); FX.sparks(hit.x * CFG.TS, hit.y * CFG.TS - 8, 12, ['#9fe8ff', '#ffffff']); }
        else killVictim(hit, 'melee');
      } else Sfx.whiff();
    }
  } else if (a.phase === 'strike') {
    a.f = Math.min(1, a.t / 0.12);
    if (a.t >= 0.12) { a.phase = 'recover'; a.t = 0; }
  } else {
    const dur = a.landed ? CFG.HUNT_ATK_RECOVER : CFG.HUNT_ATK_MISS;
    a.f = Math.min(1, a.t / dur);
    if (a.t >= dur) { K.atk = null; K.atkCd = 0.1; }
  }
}

function facingDir(K) {
  const c = Math.cos(K.ang), s = Math.sin(K.ang);
  return Math.abs(c) >= Math.abs(s) ? [Math.sign(c), 0] : [0, Math.sign(s)];
}

// can the ability fire right now? (also drives the button's look)
function huntAbilityReady() {
  const K = P;
  if (K.abilCd > 0) return false;
  switch (K.kind) {
    case 'butcher': { const [dx, dy] = facingDir(K), [tx, ty] = K.tile(); return breakableWall(tx + dx, ty + dy); }
    case 'witch': { const [tx, ty] = K.tile(); return K.stock > 0 && openTile(tx, ty) && !G.candles.some((c) => c.x === tx && c.y === ty); }
    case 'evolver': return K.stage !== 'larva';
    default: return true;
  }
}
function tryHuntAbility() {
  const K = P;
  if (K.atk || K.check || K.bashP) return;
  if (!huntAbilityReady()) { Sfx.tone(160, 120, 0.1, { type: 'square', vol: 0.05 }); return; }
  const [tx, ty] = K.tile(), [dx, dy] = facingDir(K);
  switch (K.kind) {
    case 'butcher':
      snapCenter(K); K.ang = Math.atan2(dy, dx);
      K.breaking = { x: tx + dx, y: ty + dy, ox: tx + 2 * dx, oy: ty + 2 * dy, t: 0 };
      G.cracks.push(K.breaking); Sfx.wallCrack();
      break;
    case 'witch':
      G.candles.push({ x: tx, y: ty, fake: false, t: 0 }); K.stock--; K.placeT = CFG.WITCH_PLACE_PAUSE * 0.6;
      Sfx.candlePlace(); FX.sparks(tx * CFG.TS + 7, ty * CFG.TS + 2, 6, ['#ffb347', '#fff2c0']);
      break;
    case 'janitor':
      K.flashing = { t: 0 }; Sfx.flashClick();
      break;
    case 'evolver':
      snapCenter(K); K.ang = Math.atan2(dy, dx);
      K.tent = { phase: 'windup', t: 0, dir: [dx, dy] };
      break;
    case 'doctor': {
      const kind = machineKind(G.machines);
      const spot = DIRS.map(([a, b]) => [tx + a, ty + b]).find(([x, y]) => walkable(x, y)) || [tx, ty];
      G.machines.push(new HuntMachine(kind, spot[0], spot[1], K));
      Sfx.summon(); FX.ring(spot[0] * CFG.TS + 7, spot[1] * CFG.TS + 7, '#7dff9a', 18);
      K.abilCd = CFG.HUNT_SUMMON_CD;
      break;
    }
    case 'samurai':
      snapCenter(K); K.ang = Math.atan2(dy, dx);
      K.thrust = { phase: 'aim', t: 0, dir: [dx, dy], tx, ty, ang: Math.atan2(dy, dx) };
      Sfx.spearWindup();
      break;
  }
}

// in-progress ability animations; true = the killer is committed (can't move)
function huntAbilityTick(K, dt) {
  if (K.placeT > 0) { K.placeT -= dt; K.amt = approach(K.amt, 0, dt * 8); return true; }
  if (K.breaking) {
    const b = K.breaking;
    b.t += dt; K.amt = approach(K.amt, 0, dt * 8);
    if (rnd() < dt * 12) FX.dust(b.x * CFG.TS + rand(2, 12), b.y * CFG.TS + rand(2, 12), 1);
    if (b.t >= CFG.BUTCHER_BREAK_WINDUP) {
      K.breaking = null; G.cracks = G.cracks.filter((c) => c !== b);
      M.t[b.y * M.w + b.x] = T.RUBBLE; rerenderTiles(b.x, b.y); G.openTiles.push([b.x, b.y]);
      Sfx.wallBreak(); FX.debris(b.x * CFG.TS + 7, b.y * CFG.TS + 7, 28); G.shake = 6;
      K.atk = { phase: 'strike', t: 0, f: 0, landed: true };
      for (const v of liveVictims()) if (dist(v.x, v.y, b.ox + 0.5, b.oy + 0.5) < 1.3) { v.stunT = CFG.BUTCHER_STUN; v.exposedT = CFG.BUTCHER_STUN; }
      K.abilCd = CFG.BUTCHER_BREAK_CD;
      repathAll();
    }
    return true;
  }
  if (K.flashing) {
    K.flashing.t += dt; K.amt = approach(K.amt, 0, dt * 8);
    if (K.flashing.t >= CFG.JANITOR_FLASH_WINDUP) {
      K.flashing = null; K.abilCd = CFG.JANITOR_FLASH_CD * (K.grade >= 3 ? 0.5 : 1); Sfx.flash(); // S: twice as often
      for (const v of liveVictims()) {
        const d = dist(K.x, K.y, v.x, v.y);
        if (d > CFG.JANITOR_FLASH_RANGE || !los(K.x, K.y, v.x, v.y)) continue;
        if (d > 1 && Math.abs(angDiff(K.ang, Math.atan2(v.y - K.y, v.x - K.x))) > 0.6) continue;
        v.stunT = CFG.HUNT_BLIND; v.exposedT = CFG.HUNT_BLIND; v.flashT = 0.3;
      }
    }
    return true;
  }
  if (K.tent) {
    const tn = K.tent;
    tn.t += dt; K.amt = approach(K.amt, 0, dt * 8);
    if (tn.phase === 'windup' && tn.t >= 0.35) {
      tn.phase = 'shoot'; tn.t = 0; Sfx.tentacle();
      const [tx, ty] = K.tile();
      let hit = null, bd = Infinity;
      for (const v of liveVictims()) {
        const vx = Math.floor(v.x), vy = Math.floor(v.y);
        const on = tn.dir[0] ? vy === ty && Math.sign(vx - tx) === tn.dir[0] && Math.abs(vx - tx) <= K.tentRange : vx === tx && Math.sign(vy - ty) === tn.dir[1] && Math.abs(vy - ty) <= K.tentRange;
        const d = dist(K.x, K.y, v.x, v.y);
        if (on && d < bd && los(K.x, K.y, v.x, v.y)) { bd = d; hit = v; }
      }
      tn.hit = !!hit; tn.len = hit ? bd : K.tentRange;
      if (hit) { hit.path = null; hit.trav = null; hit.pull = { sx: hit.x, sy: hit.y, tx: tx + tn.dir[0] + 0.5, ty: ty + tn.dir[1] + 0.5, t: 0, dur: 0.25 }; }
    } else if (tn.phase === 'shoot' && tn.t >= 0.35) { K.tent = null; K.abilCd = CFG.HUNT_TENTACLE_CD; }
    return true;
  }
  if (K.thrust) {
    const s = K.thrust;
    s.t += dt; K.amt = approach(K.amt, 0, dt * 10);
    if (s.phase === 'aim' && s.t >= CFG.HUNT_SPEAR_WINDUP) {
      s.phase = 'strike'; s.t = 0; Sfx.spear();
      for (const v of liveVictims()) {
        const vx = Math.floor(v.x), vy = Math.floor(v.y);
        const on = s.dir[0] ? vy === s.ty && Math.sign(vx - s.tx) === s.dir[0] && Math.abs(vx - s.tx) <= CFG.SPEAR_RANGE : vx === s.tx && Math.sign(vy - s.ty) === s.dir[1] && Math.abs(vy - s.ty) <= CFG.SPEAR_RANGE;
        if (on) killVictim(v, 'spear');
      }
    } else if (s.phase === 'strike' && s.t >= 0.4) { K.thrust = null; K.abilCd = CFG.SPEAR_CD; }
    return true;
  }
  return false;
}

// ── context actions: check a hiding spot, bash a door, toilets, wells ──
function findHuntContext() {
  const K = P;
  if (K.atk) return null;
  const [tx, ty] = K.tile();
  const fx = Math.round(Math.cos(K.ang)), fy = Math.round(Math.sin(K.ang));
  let best = null;
  const offer = (o) => { if (!best || o.score > best.score) best = o; };
  for (const f of M.hideSpots) if (Math.abs(f.x - tx) + Math.abs(f.y - ty) === 1) offer({ kind: 'check', obj: f, score: 4 + (f.x - tx === fx && f.y - ty === fy ? 1.5 : 0) });
  for (const [dx, dy] of DIRS) { const d = doorAt(tx + dx, ty + dy); if (d && d.state === 'locked') offer({ kind: 'bash', obj: d, score: 3.5 + (dx === fx && dy === fy ? 1.5 : 0) }); }
  if (G.toiletCd <= 0) for (const f of M.toilets) if (Math.abs(f.x - tx) + Math.abs(f.y - ty) === 1) offer({ kind: 'toilet', obj: f, score: 3 + (f.x - tx === fx && f.y - ty === fy ? 1.8 : 0) });
  if (K.kind === 'samurai') {
    const here = M.wells.findIndex((w) => w.x === tx && w.y === ty);
    if (here >= 0 && M.wells.length === 2) offer({ kind: 'well', obj: M.wells[1 - here], score: 5 });
    else if (here < 0 && M.wells.length < 2 && openTile(tx, ty) && !G.candles.some((c) => c.x === tx && c.y === ty) && (M.wells.length === 0 || dist(M.wells[0].x, M.wells[0].y, tx, ty) >= CFG.HUNT_WELL_GAP)) offer({ kind: 'wellPlace', obj: null, score: 1 });
  }
  return best;
}
function doHuntContext(c) {
  const K = P;
  switch (c.kind) {
    case 'check': K.check = { f: c.obj, t: 0 }; K.ang = Math.atan2(c.obj.y - Math.floor(K.y), c.obj.x - Math.floor(K.x)); snapCenter(K); break;
    case 'bash': K.bashP = { d: c.obj }; K.state = 'bash'; K.bashDoor = c.obj; K.bashT = c.obj.bash * K.bashTime; K.bashSnd = 0; snapCenter(K); K.ang = Math.atan2(c.obj.y - Math.floor(K.y), c.obj.x - Math.floor(K.x)); break;
    case 'toilet': {
      const to = M.toilets[0] === c.obj ? M.toilets[1] : M.toilets[0];
      G.toiletCd = CFG.TOILET_CD; snapCenter(K);
      K.beginTrav({ via: VIA.TOILET, i: to.ay * M.w + to.ax });
      G.noise(K.x, K.y, CFG.NOISE_TOILET);
      break;
    }
    case 'well': snapCenter(K); K.beginTrav({ via: VIA.WELL, i: c.obj.y * M.w + c.obj.x }); break;
    case 'wellPlace': { const [tx, ty] = K.tile(); M.wells.push({ x: tx, y: ty, sealed: false }); Sfx.well(); FX.dust(tx * CFG.TS + 7, ty * CFG.TS + 7, 10); break; }
  }
}
function updateHuntCheck(dt) {
  const K = P, c = K.check, f = c.f;
  c.t += dt; f.check = c.t / CFG.HIDE_CHECK; f.shake = 0.06;
  if (c.t >= CFG.HIDE_CHECK) {
    f.check = 0; K.check = null;
    const v = G.victims.find((q) => !q.dead && q.state === 'hidden' && q.hideSpot === f);
    if (v) { K.atk = { phase: 'strike', t: 0, f: 0, landed: true }; killVictim(v, 'found'); }
    else Sfx.creak();
  }
}
function updateHuntBash(dt) {
  const K = P, d = K.bashP.d;
  K.amt = approach(K.amt, 0, dt * 6);
  if (d.state !== 'locked') { K.bashP = null; K.state = 'player'; K.bashDoor = null; return; }
  K.bashT += dt; d.bash = K.bashT / K.bashTime; d.shake = 0.12;
  K.bashSnd -= dt;
  if (K.bashSnd <= 0) { K.bashSnd = 0.55; Sfx.bash(); FX.dust(d.x * CFG.TS + 7, d.y * CFG.TS + 7, 3); G.noise(d.x + 0.5, d.y + 0.5, 9); }
  if (K.bashT >= K.bashTime) {
    d.state = 'broken'; d.bash = 0; Sfx.doorBreak(); FX.debris(d.x * CFG.TS + 7, d.y * CFG.TS + 7, 16); G.shake = 3;
    K.bashP = null; K.state = 'player'; K.bashDoor = null;
    repathAll();
  }
}

// ═════════════ rendering ═════════════
function huntVictimVisible(v) {
  if (Vision.visible(v.x, v.y)) return true;
  // a lit (real) candle shows whoever stands in its light
  return G.candles.some((c) => !c.fake && dist(c.x + 0.5, c.y + 0.5, v.x, v.y) <= CFG.CANDLE_RADIUS);
}
function huntVictimRevealed(v) {
  const K = P;
  if (v.exposedT > 0 || G.exposeAllT > 0) return true;
  if (K.kind === 'samurai' && dist(K.x, K.y, v.x, v.y) <= CFG.SAMURAI_XRAY) return true;
  return false;
}

function drawHunter(camX, camY) {
  const K = P;
  if (K.kind === 'evolver' && K.stealth) {
    const [X, Y] = K.feet(camX, camY);
    L.globalAlpha = 0.4; drawLarva(X, Y, K, K.t, null); L.globalAlpha = 1;
    return;
  }
  K.draw(camX, camY);
}

function renderHunt() {
  const TS = CFG.TS, W = Screen.W, H = Screen.H, K = P;
  const sh = G.shake;
  const camX = Math.round(G.cam.x + (sh ? rand(-1, 1) * sh * 0.5 : 0)), camY = Math.round(G.cam.y + (sh ? rand(-1, 1) * sh * 0.5 : 0));
  G.camX = camX; G.camY = camY;
  L.fillStyle = C.void; L.fillRect(0, 0, W, H);
  blitMap(camX, camY);
  for (const c of G.cracks) drawWallCrack(c, camX, camY);

  Vision.begin();
  const vr = CFG.VISION_RANGE, flick = 1 + Math.sin(G.rt * 23) * 0.012;
  Vision.cast(K.x, K.y - 0.15, K.ang, vr * flick, CFG.VISION_HALF, CFG.VISION_NEAR);
  if (K.kind === 'janitor' && K.grade >= 1) {
    // B grade and up: you see what every victim sees
    for (const v of G.victims) {
      if (v.dead || v.state === 'hidden') continue;
      Vision.cast(v.x, v.y, v.ang, 6, 0.9, 1.4, 90, true, v.vpts);
      Vision.addLight({ poly: v.vpts, x: v.x, y: v.y, r: 6 });
    }
  }
  FX.drawDecals(camX, camY);
  for (const w of M.wells) if (Vision.visibleTile(w.x, w.y)) drawWell(w.x * TS + 7 - camX, w.y * TS + 8 - camY, G.time, false, K.trav && K.trav.kind === 'well' && K.trav.to === w.y * M.w + w.x ? K.trav.t : 0);
  drawItems(camX, camY, G.time);
  for (const h of G.honeyItems) if (Vision.visibleTile(h.x, h.y)) drawJarIcon(h.x * TS + 7 - camX, h.y * TS + 8 - camY + Math.round(Math.sin(h.t * 3)));
  for (const c of G.candles) drawCandle(c.x * TS + 7 - camX, c.y * TS + 10 - camY, c.t, c.fake);

  const list = [];
  const tx0 = Math.floor(camX / TS) - 1, tx1 = Math.ceil((camX + W) / TS) + 1, ty0 = Math.floor(camY / TS) - 1, ty1 = Math.ceil((camY + H) / TS) + 2;
  for (const f of M.furn) if (f.x >= tx0 && f.x <= tx1 && f.y >= ty0 && f.y <= ty1) list.push({ y: (f.y + 1) * TS - 0.5, d: () => drawFurniture(f, f.x * TS - camX, f.y * TS - camY, G.time) });
  for (const d of M.doors) if (d.x >= tx0 && d.x <= tx1 && d.y >= ty0 && d.y <= ty1) list.push({ y: (d.y + 1) * TS - 1, d: () => drawDoor(d, d.x * TS - camX, d.y * TS - camY, G.time) });
  list.push({ y: K.y * TS + 4, d: () => drawHunter(camX, camY) });
  for (const v of G.victims) {
    v._drawn = false;
    if (v.state === 'hidden') continue;
    if (v.dead ? Vision.visible(v.x, v.y) : huntVictimVisible(v)) { v._drawn = true; list.push({ y: v.y * TS + (v.dead ? 2 : 4), d: () => v.draw(camX, camY) }); }
  }
  for (const m of G.machines) { m._drawn = Vision.visible(m.x, m.y); if (m._drawn) list.push({ y: m.y * TS + 4, d: () => m.draw(camX, camY) }); }
  list.sort((a, b) => a.y - b.y);
  for (const o of list) o.d();
  FX.draw(camX, camY, false);

  for (const c of G.candles) Vision.addLight({ x: c.x + 0.5, y: c.y + 0.5, r: c.fake ? 1.5 : CFG.CANDLE_RADIUS, a: c.fake ? 0.7 : 0.95 });
  for (const f of M.furn) if (f.kind === 'lamp') Vision.addLight({ x: f.x + 0.5, y: f.y + 0.2, r: 1.7, a: 0.6 });
  if (K.kind === 'janitor' && K.flashing) Vision.addLight({ x: K.x + Math.cos(K.ang) * 1.5, y: K.y + Math.sin(K.ang) * 1.5, r: 2.2, a: 0.9 });
  const dawn = clamp(1 - G.huntT / 40, 0, 1);
  Vision.drawMask(camX, camY, 0.6 * (1 - dawn * 0.5), { x: K.x, y: K.y - 0.15, r: vr });
  drawPathOutline(camX, camY);

  L.globalCompositeOperation = 'lighter';
  for (const c of G.candles) { L.globalAlpha = 0.18 + Math.sin(c.t * 9) * 0.04; disc(c.x * TS + 7 - camX, c.y * TS + 2 - camY, c.fake ? 3 : 4, c.fake ? '#6ad040' : '#ff9a3a'); }
  L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
  for (const c of G.candles) drawCandle(c.x * TS + 7 - camX, c.y * TS + 10 - camY, c.t, c.fake);
  // revealed victims (exposed, the Witch's eye, the Samurai's x-ray) as red silhouettes
  for (const v of G.victims) {
    if (v.dead || v._drawn || v.state === 'hidden' || !huntVictimRevealed(v)) continue;
    L.globalAlpha = 0.75; v.draw(camX, camY, '#ff3048'); L.globalAlpha = 1; v._drawn = true;
  }
  FX.draw(camX, camY, true);

  // world UI
  if (K.drawOverhead && K.kind === 'janitor') K.drawOverhead(camX, camY);
  else { const [X, Y] = K.feet(camX, camY); if (K.stuckT > 0) iconStars(X, Y - K.headH + 2, K.t); }
  if (K.drawWorldUI) K.drawWorldUI(camX, camY);
  for (const v of G.victims) if (v._drawn) v.drawOverhead(camX, camY);
  for (const f of M.hideSpots) if (f.check > 0) iconGauge(f.x * TS + 7 - camX, f.y * TS - 12 - camY, f.check);
  if (K.bashP) { const d = K.bashP.d; iconGauge(d.x * TS + 7 - camX, d.y * TS - 10 - camY, d.bash, C.gold); }
  if (G.instinctT > 0) {
    let best = null, bd = Infinity;
    for (const v of G.victims) if (!v.dead) { const d = dist(K.x, K.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
    if (best) {
      const X = best.x * TS - camX, Y = best.y * TS - 8 - camY;
      if (X >= 10 && Y >= 26 && X <= W - 10 && Y <= H - 60) { L.globalAlpha = 0.5 + 0.5 * Math.sin(G.rt * 10); ring(X, Y + 6, 7 + Math.sin(G.rt * 6) * 2, C.red); L.globalAlpha = 1; }
      else edgeArrow(X, Y, C.red);
    }
  }
  if (G.redFlash > 0) { L.globalAlpha = Math.min(0.5, G.redFlash); L.fillStyle = '#a0101a'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
  if (dawn > 0) { L.globalAlpha = dawn * 0.25; L.fillStyle = '#9fb8d8'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
  if (G.phase === 'hdawn') { L.globalAlpha = Math.min(1, G.phaseT / 2); L.fillStyle = '#dfe8f4'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
  if (G.whiteFlash > 0) { L.globalAlpha = Math.min(1, G.whiteFlash); L.fillStyle = '#fffaf0'; L.fillRect(0, 0, W, H); L.globalAlpha = 1; }
}

// ── HUD ──
function drawVictimHead(x, y, v) {
  const pop = G.hudPop['v' + v.idx] || 0;
  if (v.dead) {
    disc(x, y, 4.4, C.ink); disc(x, y, 3.6, '#4a4048'); disc(x, y + 0.6, 2, '#6a6068');
    line(x - 2, y - 2, x + 2, y + 2, C.red); line(x + 2, y - 2, x - 2, y + 2, C.red);
  } else {
    disc(x, y, 4.4, C.ink); disc(x, y, 3.6, v.info.coat); disc(x, y + 0.8, 2.1, C.skin);
    px(x - 1, y + 0.5, C.ink); px(x + 1, y + 0.5, C.ink);
  }
  if (pop > 0) { L.globalAlpha = pop; disc(x, y, 5, '#ffffff'); L.globalAlpha = 1; }
}
function drawHuntHUD() {
  const W = Screen.W, K = P;
  L.globalAlpha = 0.84; L.fillStyle = '#0a0709'; L.fillRect(0, 0, W, 20); L.globalAlpha = 1;
  rect(0, 20, W, 1, '#3a1e26');
  G.victims.forEach((v, i) => drawVictimHead(7 + i * 11, 10, v));
  const t = G.huntT, urgent = t <= 30 && ((G.rt * 4) | 0) % 2;
  text3(fmtTime(t), W / 2, 5, urgent ? C.red : t <= 60 ? '#ffb347' : C.white, 2, 'center');
  const rx = W - 4;
  switch (K.kind) {
    case 'witch': {
      for (let i = 0; i < CFG.HUNT_CANDLE_STOCK; i++) { const cx = rx - i * 6; rect(cx - 1, 6, 3, 7, C.ink); rect(cx, 7, 1, 5, i < K.stock ? '#efe9d8' : '#3a3036'); if (i < K.stock) px(cx, 5, '#ffb347'); }
      const lit = G.candles.reduce((n, c) => n + (c.fake ? 0 : 1), 0);
      text3(lit + '/6', rx - 20, 7, lit >= 4 ? C.red : C.white, 1, 'right');
      break;
    }
    case 'janitor': iconGrade(rx - 5, 10, K.grade, K.gradePop); break;
    case 'evolver': {
      const names = { larva: 'LARVA', adult: 'ADULT', perfect: 'PERFECT' };
      text3(names[K.stage], rx, 4, K.stage === 'perfect' ? C.red : '#8fbf6a', 1, 'right');
      if (K.stage !== 'perfect') {
        const next = K.stage === 'larva' ? CFG.EVOLVE_ADULT : CFG.EVOLVE_PERFECT, prev = K.stage === 'larva' ? 0 : CFG.EVOLVE_ADULT;
        rect(rx - 28, 12, 28, 2, '#2a2a20'); rect(rx - 28, 12, Math.round(28 * clamp((K.evoT - prev) / (next - prev), 0, 1)), 2, '#8fbf6a');
      }
      break;
    }
    case 'doctor': { // machine count (no cap)
      const n = G.machines.length, mx = rx - 4 - textW3('X' + n, 1) - 6;
      disc(mx, 10, 3.6, C.ink); disc(mx, 10, 2.8, n ? '#8b909a' : '#2a2a30'); if (n) px(mx, 9, '#ff2a2a');
      text3('X' + n, rx, 8, n ? C.white : '#6a5e64', 1, 'right');
      break;
    }
    case 'samurai': for (let i = 0; i < 2; i++) { const on = i < M.wells.length; ellipse(rx - 5 - i * 11, 10, 4.6, 3, 0, C.ink); ellipse(rx - 5 - i * 11, 10, 3.6, 2.2, 0, on ? '#5a5a62' : '#2a2a30'); if (on) ellipse(rx - 5 - i * 11, 9.6, 2, 1.1, 0, '#0c1418'); } break;
  }
}

// ── controls ──
function drawHuntControls() {
  const W = Screen.W, H = Screen.H, K = P;
  const act = (Input.layout.act = { x: W - 27, y: H - 32, r: 17, visible: true });
  const ab = (Input.layout.abil = { x: W - 27, y: H - 72, r: 13, visible: true });
  const cx = (Input.layout.ctx = { x: W - 62, y: H - 20, r: 12, visible: !!K.ctx });
  Input.layout.honey = null;
  // attack
  const pr = Input.btn.act.down, y = act.y + (pr ? 1 : 0);
  disc(act.x, act.y + 2, act.r + 1, C.ink); disc(act.x, y, act.r, '#8e1520'); disc(act.x, y - 1, act.r - 2, '#c8202c');
  ring(act.x, y - 1, act.r - 2, '#ff6a70', 0.35, -Math.PI * 0.95);
  if (K.kind === 'doctor') { rect(act.x - 1, y - 8, 3, 13, C.white); px(act.x, y - 9, '#9fe8ff'); px(act.x - 2, y - 7, '#9fe8ff'); px(act.x + 2, y - 6, '#9fe8ff'); }
  else for (let i = -1; i <= 1; i++) thickLine(act.x - 6 + i * 4, y + 5, act.x + 2 + i * 4, y - 6, 1.6, C.white);
  // ability
  const ready = huntAbilityReady();
  disc(ab.x, ab.y + 2, ab.r + 1, C.ink); disc(ab.x, ab.y, ab.r, ready ? '#3a2a6a' : '#2a2026'); disc(ab.x, ab.y - 1, ab.r - 2, ready ? '#5a46a0' : '#3a2e34');
  const ic = ready ? C.white : '#6a5e64';
  drawAbilityIcon(K.kind, ab.x, ab.y - 1, ic);
  if (K.abilCd > 0) {
    const tot = { butcher: CFG.BUTCHER_BREAK_CD, janitor: CFG.JANITOR_FLASH_CD * (K.grade >= 3 ? 0.5 : 1), evolver: CFG.HUNT_TENTACLE_CD, doctor: CFG.HUNT_SUMMON_CD, samurai: CFG.SPEAR_CD }[K.kind] || 1;
    for (let r = ab.r - 1; r <= ab.r; r += 0.5) ring(ab.x, ab.y - 1, r, C.gold, 1 - K.abilCd / tot);
  }
  if (K.kind === 'witch') text3(String(K.stock), ab.x + 8, ab.y + 4, C.white);
  // context
  if (cx.visible) {
    const k = K.ctx.kind, pr2 = Input.btn.ctx.down, yy = cx.y + (pr2 ? 1 : 0);
    disc(cx.x, cx.y + 2, cx.r + 1, C.ink); disc(cx.x, yy, cx.r, '#5a4a20'); disc(cx.x, yy - 1, cx.r - 2, '#8a7230');
    if (k === 'check') { ring(cx.x - 1, yy - 2, 3.5, C.white); thickLine(cx.x + 2, yy + 1, cx.x + 5, yy + 4, 1.6, C.white); }
    else if (k === 'bash') { rect(cx.x - 4, yy - 6, 8, 11, C.white); line(cx.x - 3, yy - 4, cx.x + 1, yy, C.red); line(cx.x + 1, yy, cx.x - 1, yy + 3, C.red); }
    else if (k === 'toilet') drawToiletIcon(cx.x, yy, C.white);
    else { ellipse(cx.x, yy, 5, 3.2, 0, C.white); ellipse(cx.x, yy - 0.4, 3, 1.8, 0, '#1a2a30'); if (k === 'wellPlace') { text3('+', cx.x + 5, yy - 8, C.gold); } }
  }
  const j = Input.joy;
  if (j.active) {
    L.globalAlpha = 0.35; disc(j.ox, j.oy, Input.JOY_R + 2, '#000000'); L.globalAlpha = 0.5; ring(j.ox, j.oy, Input.JOY_R, C.white);
    L.globalAlpha = 0.75; disc(j.ox + j.vx * Input.JOY_R, j.oy + j.vy * Input.JOY_R, 8, '#d8d0c8'); L.globalAlpha = 1;
  } else if (G.rt - G.startT < 7) {
    L.globalAlpha = 0.25 + Math.sin(G.rt * 4) * 0.12; ring(34, H - 40, Input.JOY_R, C.white); disc(34 + Math.sin(G.rt * 2) * 8, H - 40, 7, C.white); L.globalAlpha = 1;
  }
}
function drawAbilityIcon(kind, x, y, c) {
  switch (kind) {
    case 'butcher': for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) rect(x - 5 + i * 5 + (r % 2) * 2, y - 5 + r * 4, 4, 3, c); line(x - 1, y - 6, x + 2, y + 5, C.red); break;
    case 'witch': rect(x - 1, y - 2, 3, 8, c); px(x, y - 4, C.gold); px(x, y - 5, '#ffb347'); break;
    case 'janitor': rect(x - 6, y - 1, 4, 3, c); poly([x - 2, y - 1, x + 6, y - 5, x + 6, y + 6, x - 2, y + 2], rgba('#fff3b0', 0.9)); break;
    case 'evolver': for (let i = 0; i < 8; i++) { const t = i / 7; px(x - 6 + t * 12, y + Math.sin(t * 9) * 3, c); px(x - 6 + t * 12, y + 1 + Math.sin(t * 9) * 3, c); } break;
    case 'doctor': disc(x, y + 1, 4, c); disc(x, y + 1, 2, '#3a2e34'); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; px(x + Math.cos(a) * 5, y + 1 + Math.sin(a) * 5, c); } break;
    case 'samurai': line(x - 6, y + 5, x + 4, y - 5, c); thickLine(x + 3, y - 4, x + 6, y - 7, 1.4, c); break;
  }
}

// ═════════════ select screen (hi-res) ═════════════
const Sel = { pick: null, cache: null, cw: 0 };
function openSelect() {
  G.phase = 'select'; G.phaseT = 0;
  Sel.pick = KILLER_TYPES[PARAMS.killer] ? PARAMS.killer : null;
}
function updateSelect(dt) {
  const S = Screen.S;
  for (const t of Input.taps) {
    const x = t.x * S, y = t.y * S, U = UI.select;
    if (!U) break;
    const inR = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(U.back)) { Sfx.tap(); G.phase = 'title'; return; }
    if (inR(U.start) && Sel.pick) { Sfx.tap(); newHunt(Sel.pick); return; }
    for (const c of U.cards) if (inR(c)) { if (Sel.pick === c.kind && G.phaseT > 0.3) { newHunt(c.kind); return; } Sel.pick = c.kind; Sfx.tap(); }
  }
  if (Input.anyKeyTap) newHunt(Sel.pick || 'butcher');
}
function buildPortraits(w, h) {
  Sel.cache = {}; Sel.cw = w;
  for (const kind of KILLER_KINDS) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(w / 2, h * 0.6, 10, w / 2, h * 0.6, w * 0.75);
    gr.addColorStop(0, '#c4151f'); gr.addColorStop(1, '#2a0508');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sc = h / 780;
    g.setTransform(sc, 0, 0, sc, w / 2 - 780 * sc, h * 0.6 - 735 * sc);
    _menace = true;
    try { drawComicKillerHead(g, kind, kind === 'evolver' ? 'adult' : null, { t: 0.5, react: 0, ko: false, tremble: 0, duck: 0 }); } finally { _menace = false; }
    Sel.cache[kind] = c;
  }
}
function drawSelectHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = 'rgba(6,2,6,0.9)'; g.fillRect(0, 0, pw, ph);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff4a54'; g.font = `900 ${u * 9}px ${FONT_DISPLAY}`; g.fillText('HUNT', pw / 2, ph * 0.065);
  g.fillStyle = '#d8cfc4'; g.font = `600 ${u * 3.4}px ${FONT_KO}`; g.fillText('오늘 밤 사냥할 살인마를 고르세요', pw / 2, ph * 0.11);
  const back = { x: u * 2, y: u * 2, w: u * 18, h: u * 8 };
  g.fillStyle = '#b8aeb0'; g.font = `600 ${u * 3.4}px ${FONT_KO}`; g.textAlign = 'left'; g.fillText('‹ 모드', back.x + u * 1.5, back.y + back.h / 2);
  const m = u * 3, top = ph * 0.14, bottom = ph * 0.84, gap = u * 2.4;
  const cw = (pw - m * 3) / 2, chh = (bottom - top - gap * 2) / 3, portH = chh * 0.62;
  if (!Sel.cache || Math.abs(Sel.cw - cw) > 1) buildPortraits(cw, portH);
  const cards = [];
  KILLER_KINDS.forEach((kind, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = m + col * (cw + m), y = top + row * (chh + gap);
    const sel = Sel.pick === kind, dim = Sel.pick && !sel;
    g.globalAlpha = dim ? 0.55 : 1;
    g.fillStyle = '#140a0e'; g.fillRect(x, y, cw, chh);
    g.drawImage(Sel.cache[kind], x, y, cw, portH);
    const info = HUNT_INFO[kind], K = KILLER_TYPES[kind];
    g.textAlign = 'center';
    g.fillStyle = sel ? '#ff4a54' : '#efe8dc'; g.font = `900 ${u * 4.4}px ${FONT_DISPLAY}`;
    g.fillText(KILLER_TITLE[kind], x + cw / 2, y + portH + chh * 0.09);
    g.fillStyle = '#d8cfc4'; g.font = `700 ${u * 3}px ${FONT_KO}`;
    g.fillText(`${info.ko} · ${info.abil}`, x + cw / 2, y + portH + chh * 0.19);
    g.fillStyle = '#9a9094'; g.font = `500 ${u * 2.35}px ${FONT_KO}`;
    g.fillText(info.desc, x + cw / 2, y + portH + chh * 0.29, cw - u * 2);
    g.lineWidth = sel ? u * 0.9 : u * 0.3; g.strokeStyle = sel ? '#ff4a54' : '#3a2a30';
    g.strokeRect(x, y, cw, chh);
    g.globalAlpha = 1;
    cards.push({ kind, x, y, w: cw, h: chh });
  });
  const bw = pw * 0.8, bh = u * 11, bx = (pw - bw) / 2, by = ph * 0.865;
  const on = !!Sel.pick;
  g.fillStyle = on ? 'rgba(160,10,24,0.95)' : 'rgba(40,30,34,0.9)'; g.fillRect(bx, by, bw, bh);
  g.lineWidth = u * 0.5; g.strokeStyle = on ? '#ff6a70' : '#4a3e44'; g.strokeRect(bx, by, bw, bh);
  g.textAlign = 'center'; g.fillStyle = on ? '#ffffff' : '#6a5e64'; g.font = `800 ${u * 4.6}px ${FONT_KO}`;
  g.fillText(on ? `${HUNT_INFO[Sel.pick].ko}${josaRo(HUNT_INFO[Sel.pick].ko)} 사냥 시작` : '살인마를 고르세요', pw / 2, by + bh / 2 + u * 0.3);
  UI.select = { cards, back, start: { x: bx, y: by, w: bw, h: bh } };
  g.restore();
}
// 로 / 으로 by the last syllable's final consonant (ㄹ takes 로)
function josaRo(w) { const c = w.charCodeAt(w.length - 1) - 0xac00; if (c < 0 || c > 11171) return '로'; const j = c % 28; return j === 0 || j === 8 ? '로' : '으로'; }
const KILLER_TITLE = { butcher: 'BUTCHER', witch: 'WITCH', janitor: 'JANITOR', evolver: 'EVOLVER', doctor: 'DOCTOR', samurai: 'SAMURAI' };

// ═════════════ hunt intro / results (hi-res) ═════════════
function drawHuntIntroHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT, K = P;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const out = clamp((3.6 - t) / 0.5, 0, 1);
  g.fillStyle = '#000000'; g.fillRect(0, 0, pw, ph);
  g.globalAlpha = 0.06 + rnd() * 0.04; g.fillStyle = '#ffffff';
  for (let i = 0; i < 160; i++) g.fillRect(rnd() * pw, rnd() * ph, u * 0.25, u * 0.25);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = clamp((t - 0.2) / 0.5, 0, 1) * out; g.fillStyle = '#a89f96'; g.font = `400 ${u * 4}px ${FONT_SERIF}`;
  spacedText(g, 'TONIGHT, YOU ARE', pw / 2, ph * 0.38, u * 1.2);
  const a2 = clamp((t - 0.7) / 0.4, 0, 1) * out;
  const shake = t > 1.2 && t < 1.9 ? (1.9 - t) * u * 1.2 : 0;
  g.globalAlpha = a2;
  g.fillStyle = '#e8e0d4'; g.font = `400 ${u * 5}px ${FONT_SERIF}`; spacedText(g, 'THE', pw / 2, ph * 0.45, u * 1.6);
  g.font = `900 ${u * 17}px ${FONT_DISPLAY}`;
  const name = KILLER_TITLE[K.kind], w = g.measureText(name).width;
  g.save(); g.translate(pw / 2 + rand(-shake, shake), ph * 0.53 + rand(-shake, shake)); g.scale(Math.min(1, (pw * 0.88) / w), 1);
  g.fillStyle = '#5a0008'; g.fillText(name, u * 0.6, u * 0.8); g.fillStyle = '#d4192a'; g.fillText(name, 0, 0); g.restore();
  g.fillStyle = '#e8e0d4'; g.font = `700 ${u * 5}px ${FONT_KO}`; g.fillText(`오늘 밤, 당신은 ${HUNT_INFO[K.kind].ko}`, pw / 2, ph * 0.615);
  g.globalAlpha = clamp((t - 1.4) / 0.4, 0, 1) * out; g.fillStyle = '#b8aeb0'; g.font = `500 ${u * 3.6}px ${FONT_KO}`;
  g.fillText(`동트기 전까지 ${CFG.HUNT_VICTIMS}명을 사냥하라`, pw / 2, ph * 0.67);
  g.globalAlpha = 1; g.fillStyle = '#000000'; g.fillRect(0, 0, pw, ph * 0.12); g.fillRect(0, ph * 0.88, pw, ph * 0.12);
  g.restore();
}
function drawHuntEndHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT, win = G.huntWin;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const a = clamp(t / 0.6, 0, 1);
  const grd = g.createLinearGradient(0, 0, 0, ph);
  if (win) { grd.addColorStop(0, `rgba(70,0,10,${0.92 * a})`); grd.addColorStop(1, `rgba(10,0,2,${0.95 * a})`); }
  else { grd.addColorStop(0, `rgba(170,190,215,${0.92 * a})`); grd.addColorStop(1, `rgba(40,50,70,${0.95 * a})`); }
  g.fillStyle = grd; g.fillRect(0, 0, pw, ph);
  g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = win ? 'PERFECT HUNT' : 'DAWN', size = u * 15;
  g.font = `900 ${size}px ${FONT_DISPLAY}`;
  const w = g.measureText(word).width, s = Math.min(1, (pw * 0.88) / w), pop = 1 + (1 - Ease.outBack(Math.min(1, t / 0.5))) * 0.4;
  g.save(); g.translate(pw / 2, ph * 0.3); g.scale(s * pop, pop);
  g.lineWidth = size * 0.1; g.strokeStyle = '#0a0608'; g.lineJoin = 'round'; g.strokeText(word, 0, 0);
  g.fillStyle = win ? '#ff3a46' : '#fff6e0'; g.fillText(word, 0, 0); g.restore();
  g.fillStyle = win ? '#efe8dc' : '#1a2230'; g.font = `700 ${u * 4.8}px ${FONT_KO}`;
  g.fillText(win ? `${CFG.HUNT_VICTIMS}명 모두 처치 · ${fmtTime(G.huntT)} 남김` : `날이 밝았다 · 처치 ${G.kills}/${CFG.HUNT_VICTIMS}`, pw / 2, ph * 0.41);
  G.victims.forEach((v, i) => {
    const y = ph * 0.5 + i * u * 7;
    g.fillStyle = v.info.coat; g.beginPath(); g.arc(pw / 2 - u * 16, y, u * 2.2, 0, TAU); g.fill();
    g.textAlign = 'left'; g.fillStyle = win ? '#efe8dc' : '#1a2230'; g.font = `700 ${u * 4}px ${FONT_KO}`;
    g.fillText(v.info.name, pw / 2 - u * 11, y);
    g.textAlign = 'right'; g.fillStyle = v.dead ? (win ? '#ff6a70' : '#a01020') : (win ? '#9fe8ff' : '#2a6a40');
    g.fillText(v.dead ? '처치' : '생존', pw / 2 + u * 17, y);
  });
  g.textAlign = 'center';
  if (t > 1.2) {
    g.globalAlpha = 0.55 + Math.sin(G.rt * 4) * 0.45;
    g.fillStyle = win ? '#ffffff' : '#0a1018'; g.font = `900 ${u * 5.2}px ${FONT_DISPLAY}`;
    g.fillText('TAP TO CONTINUE', pw / 2, ph * 0.86);
  }
  g.restore();
}

// one frame of the hunt: low-res world + HUD, then hi-res overlays
function renderHuntFrame() {
  const ph = G.phase;
  renderHunt();
  if (ph === 'hunt') { drawHuntHUD(); drawHuntControls(); }
  else { Input.layout.act = null; Input.layout.abil = null; Input.layout.ctx = null; Input.layout.honey = null; }
  presentFrame();
  if (ph === 'hintro') drawHuntIntroHi();
  else if (ph === 'hend') drawHuntEndHi();
}
