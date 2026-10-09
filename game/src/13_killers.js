// ─────────────────────────────────────────────────────────────
// The six killers (GDD §6) + the Doctor's machines
// ─────────────────────────────────────────────────────────────

const BASE_HAND_R = [0.6, 3.6, 7.6];

// ── 6.1 도살자 ───────────────────────────────────────────────
class Butcher extends Enemy {
  constructor(tx, ty) {
    super('butcher', tx, ty);
    this.title = 'THE BUTCHER'; this.ko = '도살자';
    this.dmg = CFG.BUTCHER_DMG; this.bashTime = CFG.BUTCHER_BASH; this.heavy = true; this.phaseRate = 3.4; this.headH = 31;
    this.knockMul = 1.2; this.breakCd = CFG.BUTCHER_BREAK_CD * 0.5; this.breaking = null; this.field = null; this.fieldKey = -1; this.fieldT = 0;
  }
  ability(dt) {
    this.breakCd -= dt; this.fieldT -= dt;
    if (this.breaking) {
      const b = this.breaking;
      b.t += dt; this.amt = approach(this.amt, 0, dt * 8);
      if (rnd() < dt * 12) FX.dust(b.x * CFG.TS + rand(2, 12), b.y * CFG.TS + rand(2, 12), 1);
      if (b.t >= CFG.BUTCHER_BREAK_WINDUP) this.breakWall();
      return true;
    }
    if (this.breakCd > 0 || !nearCenter(this)) return false;
    const [tx, ty] = this.tile();
    if (G.mode === 'revenge') {
      if (dist(this.x, this.y, P.x, P.y) > 6) return false;
      const fH = costField(Math.floor(P.x), Math.floor(P.y), { key: true, toilets: true });
      for (const [dx, dy] of DIRS) {
        const wx = tx + dx, wy = ty + dy, ox = wx + dx, oy = wy + dy;
        if (breakableWall(wx, wy) && fH[oy * M.w + ox] - fH[ty * M.w + tx] >= 5) { this.beginBreak(wx, wy, ox, oy); return true; }
      }
      return false;
    }
    if ((this.state !== 'chase' && this.state !== 'investigate') || !this.goal) return false;
    const key = this.goal[1] * M.w + this.goal[0];
    if (!this.field || this.fieldKey !== key || this.fieldT <= 0) { this.field = costField(this.goal[0], this.goal[1], {}); this.fieldKey = key; this.fieldT = 0.6; }
    const cur = this.field[ty * M.w + tx];
    for (const [dx, dy] of DIRS) {
      const wx = tx + dx, wy = ty + dy, ox = wx + dx, oy = wy + dy;
      if (!breakableWall(wx, wy)) continue;
      const beyond = this.field[oy * M.w + ox];
      if (beyond + 2 <= cur - CFG.BUTCHER_SHORTCUT) { this.beginBreak(wx, wy, ox, oy); return true; }
    }
    return false;
  }
  beginBreak(wx, wy, ox, oy) {
    snapCenter(this);
    this.breaking = { x: wx, y: wy, ox, oy, t: 0 };
    this.ang = Math.atan2(wy + 0.5 - this.y, wx + 0.5 - this.x);
    G.cracks.push(this.breaking);
    if (nearVol(wx, wy, 15) > 0) Sfx.wallCrack();
  }
  breakWall() {
    const b = this.breaking;
    this.breaking = null; this.breakCd = CFG.BUTCHER_BREAK_CD;
    G.cracks = G.cracks.filter((c) => c !== b);
    M.t[b.y * M.w + b.x] = T.RUBBLE;
    rerenderTiles(b.x, b.y); G.openTiles.push([b.x, b.y]);
    Sfx.wallBreak(); FX.debris(b.x * CFG.TS + 7, b.y * CFG.TS + 7, 28);
    G.shake = Math.max(G.shake, 7 * nearVol(b.x, b.y, 12));
    this.atk = { phase: 'strike', t: 0, f: 0, landed: false };
    if (dist(P.x, P.y, b.ox + 0.5, b.oy + 0.5) < 1.3 && P.state !== 'hidden' && P.state !== 'dead') {
      stunPlayer(CFG.BUTCHER_STUN);
      FX.debris(P.x * CFG.TS, P.y * CFG.TS - 8, 8);
    }
    repathAll();
  }
  drawBody(X, Y, st) {
    if (this.breaking) st.atk = { phase: 'windup', f: Math.min(1, this.breaking.t / CFG.BUTCHER_BREAK_WINDUP) };
    st.handR = attackHand(st, BASE_HAND_R);
    drawKillerHuman(X, Y, st, STY_BUTCHER);
  }
}

// ── 6.2 마녀 ─────────────────────────────────────────────────
class Witch extends Enemy {
  constructor(tx, ty) {
    super('witch', tx, ty);
    this.title = 'THE WITCH'; this.ko = '마녀';
    this.phaseRate = 5.2; this.headH = 23; this.candleT = 0; this.placeT = 0; this.fakeT = 0; this.eyeT = 0;
  }
  canSeePlayer() {
    if (super.canSeePlayer()) return true;
    if (!P || P.hero || P.state === 'hidden' || P.state === 'dead' || P.state === 'toilet') return false;
    return G.candles.some((c) => !c.fake && dist(c.x + 0.5, c.y + 0.5, P.x, P.y) <= CFG.CANDLE_RADIUS);
  }
  litCount() { return G.candles.reduce((n, c) => n + (c.fake ? 0 : 1), 0); }
  globalUpdate(dt) {
    if (G.mode !== 'normal') return;
    this.candleT += dt;
    const lit = this.litCount();
    if (lit >= 2) {
      this.fakeT += dt;
      if (this.fakeT >= CFG.WITCH_FAKE_EVERY) {
        this.fakeT = 0;
        if (G.candles.filter((c) => c.fake).length < CFG.WITCH_FAKE_MAX) {
          const [x, y] = spawnTile(5, { maxD: 16, hidden: true, clear: true });
          G.candles.push({ x, y, fake: true, t: 0 });
        }
      }
    }
    if (lit >= 4) {
      this.eyeT += dt;
      if (this.eyeT >= CFG.WITCH_EYE_EVERY) { this.eyeT = 0; G.eyeT = CFG.WITCH_EYE_SHOW; G.exposeT = Math.max(G.exposeT, CFG.WITCH_EYE_SHOW); Sfx.eye(); }
    }
    if (lit >= 6 && G.phase === 'play') startPhase('hellgate');
  }
  ability(dt) {
    if (this.placeT > 0) { this.placeT -= dt; this.amt = approach(this.amt, 0, dt * 8); return true; }
    if (G.mode === 'normal' && this.candleT >= CFG.WITCH_CANDLE_EVERY && nearCenter(this)) {
      const [tx, ty] = this.tile();
      if (openTile(tx, ty) && candleSpotClear(tx, ty) && !G.candles.some((c) => c.x === tx && c.y === ty)) {
        snapCenter(this);
        G.candles.push({ x: tx, y: ty, fake: false, t: 0 });
        this.candleT = 0; this.placeT = CFG.WITCH_PLACE_PAUSE;
        if (nearVol(tx, ty, 16) > 0) Sfx.candlePlace();
        FX.sparks(tx * CFG.TS + 7, ty * CFG.TS + 2, 6, ['#ffb347', '#fff2c0']);
        G.hudPop.candles = 1;
        return true;
      }
    }
    return false;
  }
  drawBody(X, Y, st) {
    Y -= Math.round(Math.sin(this.t * 2.2) * 0.6);
    if (this.placeT > 0) st.handR = [3, 2.5, 3], st.handL = [3, -2.5, 3.5];
    else st.handR = attackHand(st, BASE_HAND_R);
    drawKillerHuman(X, Y, st, STY_WITCH);
  }
}
function extinguishCandle(c) {
  const i = G.candles.indexOf(c);
  if (i < 0) return;
  G.candles.splice(i, 1);
  const x = c.x * CFG.TS + 7, y = c.y * CFG.TS + 2;
  Sfx.candleOut();
  if (!c.fake) {
    G.exposeT = Math.max(G.exposeT, CFG.CANDLE_EXPOSE);
    FX.smoke(x, y, 6);
  } else {
    FX.smoke(x, y, 10, ['#5a2a6a', '#3a1a4a', '#7a3a8a']);
    Sfx.cackle();
    hurtPlayer(1, c.x + 0.5, c.y + 0.5, { noKnock: true });
    P.slowT = CFG.FAKE_SLOW;
  }
}

// ── 6.3 수위 ─────────────────────────────────────────────────
class Janitor extends Enemy {
  constructor(tx, ty) {
    super('janitor', tx, ty);
    this.title = 'THE JANITOR'; this.ko = '수위';
    this.grade = 0; this.gradePop = 0; this.flashCd = 3; this.flashing = null; this.headH = 28; this.phaseRate = 4.3; this.knockMul = 1.6;
    if (PARAMS.grade) this.setGrade(+PARAMS.grade);
  }
  setGrade(g) { this.grade = clamp(g, 0, 3); this.dmg = this.grade === 3 ? 3 : 1; }
  onPlayerAction(kind) {
    if (G.mode !== 'normal') return;
    if (kind === 'toilet' && this.grade >= 1) this.siren();
    if (kind === 'honey' && this.grade >= 2) this.siren();
    if ((kind === 'key' || kind === 'toilet') && this.sees && this.grade < 3) {
      this.setGrade(this.grade + 1); this.gradePop = 1;
      Sfx.stamp(); Sfx.whistle();
    }
  }
  siren() { G.sirenT = CFG.JANITOR_SIREN; G.exposeT = Math.max(G.exposeT, CFG.JANITOR_SIREN); Sfx.siren(); }
  ability(dt) {
    this.flashCd -= dt; this.gradePop = Math.max(0, this.gradePop - dt * 1.5);
    if (this.flashing) {
      const f = this.flashing;
      f.t += dt; this.amt = approach(this.amt, 0, dt * 8);
      this.ang = angApproach(this.ang, Math.atan2(P.y - this.y, P.x - this.x), dt * 10);
      if (f.t >= CFG.JANITOR_FLASH_WINDUP) {
        this.flashing = null; this.flashCd = CFG.JANITOR_FLASH_CD;
        if (los(this.x, this.y, P.x, P.y) && dist(this.x, this.y, P.x, P.y) <= CFG.JANITOR_FLASH_RANGE + 1 && P.state !== 'hidden') {
          G.whiteFlash = 0.45; Sfx.flash();
          if (P.hero) stunPlayer(0); else G.blackoutT = CFG.JANITOR_BLACKOUT;
        }
      }
      return true;
    }
    if (this.flashCd > 0) return false;
    const d = dist(this.x, this.y, P.x, P.y);
    const canSee = G.mode === 'revenge' ? los(this.x, this.y, P.x, P.y) : this.sees;
    if (canSee && d <= CFG.JANITOR_FLASH_RANGE && P.state !== 'hidden') {
      const toJ = Math.atan2(this.y - P.y, this.x - P.x);
      const facing = Math.abs(angDiff(P.ang, toJ)) < 1.0;
      if (facing) { this.flashing = { t: 0 }; Sfx.flashClick(); return true; }
    }
    return false;
  }
  drawBody(X, Y, st) {
    st.beam = !!this.flashing;
    st.handR = attackHand(st, BASE_HAND_R);
    st.handL = [3.2, -2.8, 9.4];
    drawKillerHuman(X, Y, st, STY_JANITOR);
  }
  drawOverhead(camX, camY) {
    super.drawOverhead(camX, camY);
    const [X, Y] = this.feet(camX, camY);
    iconGrade(X + 9, Y - this.headH + 2, this.grade, this.gradePop);
  }
}

// ── 6.4 초진화체 ─────────────────────────────────────────────
class Evolver extends Enemy {
  constructor(tx, ty) {
    super('evolver', tx, ty);
    this.title = 'THE EVOLVER'; this.ko = '초진화체';
    this.stage = 'egg'; this.hostile = false; this.eggT = 0; this.evoT = 0; this.stillT = 0;
    this.tentCd = 6; this.tentRange = CFG.TENTACLE_RANGE; this.tent = null; this.upgT = 0; this.trail = []; this.headH = 14;
    this.phaseRate = 5.5;
  }
  canSeePlayer() { return this.stage !== 'egg' && super.canSeePlayer(); }
  get stealth() { return this.stage === 'larva' && this.stillT >= CFG.LARVA_STEALTH; }
  globalUpdate(dt) {
    if (this.stage === 'egg') {
      this.eggT += dt;
      const d = dist(this.x, this.y, P.x, P.y);
      if ((Vision.visible(this.x, this.y) && d <= 6) || d <= 2) this.hatch();
      else if (this.eggT >= CFG.EGG_TELEPORT) this.teleportEggNearPlayer();
      return;
    }
    if (G.mode !== 'normal') return;
    this.evoT += dt;
    if (this.stage === 'larva' && this.evoT >= CFG.EVOLVE_ADULT) this.evolve('adult');
    else if (this.stage === 'adult' && this.evoT >= CFG.EVOLVE_PERFECT) this.evolve('perfect');
    else if (this.stage === 'perfect') {
      this.upgT += dt;
      if (this.upgT >= CFG.PERFECT_UPGRADE_EVERY) {
        this.upgT = 0;
        if (rnd() < 0.5) this.ratio += CFG.PERFECT_SPEED_STEP; else this.tentRange += CFG.PERFECT_RANGE_STEP;
        this.flashT = 0.3; FX.ring(this.x * CFG.TS, this.y * CFG.TS - 8, '#c1263a', 16);
        if (nearVol(this.x, this.y, 12) > 0) Sfx.evolve();
      }
    }
  }
  get wings() { return this.stage === 'perfect' && this.speed() > CFG.PLAYER_SPEED; }
  teleportEggNearPlayer() {
    const f = costField(Math.floor(P.x), Math.floor(P.y), {});
    const cands = [];
    for (let i = 0; i < f.length; i++) if (f[i] >= 2 && f[i] <= 4 && openTile(i % M.w, (i / M.w) | 0)) cands.push(i);
    const vis = cands.filter((i) => Vision.visibleTile(i % M.w, (i / M.w) | 0));
    const i = pick(vis.length ? vis : cands.length ? cands : [Math.floor(P.y) * M.w + Math.floor(P.x)]);
    FX.smoke(this.x * CFG.TS, this.y * CFG.TS, 6);
    this.x = (i % M.w) + 0.5; this.y = ((i / M.w) | 0) + 0.5;
    Sfx.teleport();
    this.hatch();
  }
  hatch() {
    this.stage = 'larva'; this.hostile = true; this.state = 'chase'; this.lastSeen = { x: P.x, y: P.y }; this.evoT = 0;
    this.headH = 14;
    Sfx.hatch(); Sfx.scream('evolver');
    FX.burst(this.x * CFG.TS, this.y * CFG.TS - 6, 16, { c: ['#d6cfb2', '#ece6cf', '#9c6a6a'], sp0: 20, sp1: 60, l0: 0.4, l1: 0.8, size: 2, decal: 'debris' });
    G.shake = 3;
  }
  evolve(stage) {
    this.stage = stage; this.flashT = 0.6; this.headH = stage === 'perfect' ? 26 : 22;
    Sfx.evolve();
    FX.ring(this.x * CFG.TS, this.y * CFG.TS - 8, stage === 'perfect' ? '#c1263a' : '#8fbf6a', 26);
    FX.smoke(this.x * CFG.TS, this.y * CFG.TS - 6, 10, ['#3e5a3a', '#253a24', '#6f9a5a']);
    if (nearVol(this.x, this.y, 12) > 0.2) G.shake = 3;
  }
  update(dt) {
    if (this.stage === 'egg') { this.t += dt; return; }
    super.update(dt);
    this.trail.unshift([this.x, this.y]);
    if (this.trail.length > 16) this.trail.pop();
  }
  waitAmbush() { return this.stage === 'larva'; }
  decide(dt) {
    // larvae lie in ambush: when a patrol leg ends they wait long enough to go invisible
    if (this.stage === 'larva' && this.state === 'patrol' && this.goal && this.reached(this.goal) && atCenter(this)) {
      this.state = 'wait'; this.waitT = rand(4.5, 8); this.goal = null; return;
    }
    super.decide(dt);
  }
  ability(dt) {
    this.tentCd -= dt;
    if (this.stage === 'larva') { if (this.amt < 0.05 && !this.atk) this.stillT += dt; else this.stillT = 0; }
    if (this.tent) {
      const tn = this.tent;
      tn.t += dt; this.amt = approach(this.amt, 0, dt * 8);
      if (tn.phase === 'windup' && tn.t >= CFG.TENTACLE_WINDUP) {
        tn.phase = 'shoot'; tn.t = 0; Sfx.tentacle();
        const [tx, ty] = this.tile(), px = Math.floor(P.x), py = Math.floor(P.y);
        const along = tn.dir[0] ? py === ty && Math.sign(px - tx) === tn.dir[0] && Math.abs(px - tx) <= this.tentRange
          : px === tx && Math.sign(py - ty) === tn.dir[1] && Math.abs(py - ty) <= this.tentRange;
        tn.hit = along && los(this.x, this.y, P.x, P.y) && (targetable() || P.hero);
        tn.len = tn.hit ? dist(this.x, this.y, P.x, P.y) : this.tentRange;
        if (tn.hit) {
          if (P.hero) stunPlayer(0);
          else {
            P.state = 'pulled';
            P.pull = { sx: P.x, sy: P.y, tx: tx + tn.dir[0] + 0.5, ty: ty + tn.dir[1] + 0.5, t: 0, dur: 0.25, done: () => { this.atk = { phase: 'strike', t: 0, f: 0, landed: true }; hurtPlayer(this.dmg, this.x, this.y); } };
          }
        }
      } else if (tn.phase === 'shoot' && tn.t >= 0.35) { this.tent = null; this.tentCd = CFG.TENTACLE_CD; }
      return true;
    }
    if (this.stage !== 'larva' && this.tentCd <= 0) {
      const canSee = G.mode === 'revenge' ? los(this.x, this.y, P.x, P.y) : this.sees;
      const [tx, ty] = this.tile(), px = Math.floor(P.x), py = Math.floor(P.y);
      const aligned = (px === tx && Math.abs(py - ty) <= this.tentRange && py !== ty) || (py === ty && Math.abs(px - tx) <= this.tentRange && px !== tx);
      if (canSee && aligned && nearCenter(this) && P.state !== 'hidden') {
        snapCenter(this);
        this.tent = { phase: 'windup', t: 0, dir: [Math.sign(px - tx), Math.sign(py - ty)] };
        this.ang = Math.atan2(this.tent.dir[1], this.tent.dir[0]);
        return true;
      }
    }
    return false;
  }
  draw(camX, camY, silhouette) {
    const [X, Y] = this.feet(camX, camY);
    if (this.stage === 'egg') { drawEgg(X, Y, this.t, this.eggT > CFG.EGG_TELEPORT - 5 ? 0.6 : 0.1); return; }
    if (this.stealth && !silhouette) {
      if (dist(this.x, this.y, P.x, P.y) <= 2.2) {
        for (let i = 0; i < 5; i++) { const a = this.t * 3 + i * 1.3; px(X + Math.cos(a) * 3, Y - 3 + Math.sin(a * 1.3) * 2, rgba('#c8d8ff', 0.5)); }
      }
      return;
    }
    super.draw(camX, camY, silhouette);
  }
  drawBody(X, Y, st) {
    if (this.stage === 'larva') { drawLarva(X, Y, this, this.t, st.flash); return; }
    if (this.tent) st.tentacleOut = this.tent.phase === 'shoot' ? this.tent.len * 3 : Math.sin(this.tent.t * 40) * 0.8;
    st.wings = this.wings;
    drawMantis(X, Y, st, this.stage === 'perfect');
  }
  drawWorldUI(camX, camY) {
    if (!this.tent) return;
    const tn = this.tent, TS = CFG.TS;
    const X = this.x * TS - camX, Y = this.y * TS - camY - 6;
    if (tn.phase === 'windup') {
      L.globalAlpha = 0.35 + 0.35 * Math.sin(tn.t * 30);
      line(X, Y, X + tn.dir[0] * this.tentRange * TS, Y + tn.dir[1] * this.tentRange * TS, '#9fd86a');
      L.globalAlpha = 1;
    } else {
      const len = tn.len * TS * Math.min(1, tn.t / 0.08);
      thickLine(X, Y, X + tn.dir[0] * len, Y + tn.dir[1] * len, 2, this.stage === 'perfect' ? '#c1263a' : '#8fbf6a');
    }
  }
}

// ── 6.5 박사 ─────────────────────────────────────────────────
// keep the saw / drill mix even as the swarm grows
function machineKind(ms) {
  const saws = ms.filter((m) => m.kind === 'saw').length, drills = ms.length - saws;
  return saws < drills ? 'saw' : drills < saws ? 'drill' : pick(['saw', 'drill']);
}

class Doctor extends Enemy {
  constructor(tx, ty) {
    super('doctor', tx, ty);
    this.title = 'THE DOCTOR'; this.ko = '박사';
    this.hostile = false; this.canBash = false; this.actT = 0; this.headH = 26; this.phaseRate = 4.6; this.beepT = 0;
    G.docT = CFG.DOCTOR_COUNTDOWN;
  }
  globalUpdate(dt) {
    if (G.mode !== 'normal') return;
    G.docT -= dt;
    if (G.docT <= 10) { this.beepT -= dt; if (this.beepT <= 0) { this.beepT = G.docT <= 3 ? 0.33 : 1; Sfx.beep(); } }
    if (G.docT <= 0 && G.phase === 'play') { G.docT = 0; startPhase('explode'); return; }
    this.actT += dt;
    if (this.actT >= CFG.DOCTOR_ACT_EVERY) { this.actT = 0; this.act(); }
  }
  machines() { return G.enemies.filter((e) => e.machine && e.alive); }
  act() {
    const ms = this.machines();
    if (rnd() < 0.55) this.summon(); else this.teleport(10); // no cap on machines
  }
  summon() {
    const ms = this.machines();
    const kind = machineKind(ms);
    const [tx, ty] = this.tile();
    const spot = DIRS.map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => walkable(x, y)) || [tx, ty];
    G.enemies.push(new Machine(kind, spot[0], spot[1], this));
    Sfx.summon();
    FX.ring(spot[0] * CFG.TS + 7, spot[1] * CFG.TS + 7, '#7dff9a', 18); FX.sparks(spot[0] * CFG.TS + 7, spot[1] * CFG.TS + 7, 12, ['#7dff9a', '#ffffff']);
  }
  teleport(minD) {
    FX.ring(this.x * CFG.TS, this.y * CFG.TS - 8, '#7dff9a', 16);
    let t = null;
    for (let i = 0; i < 60; i++) { const c = pick(G.openTiles); if (dist(c[0] + 0.5, c[1] + 0.5, P.x, P.y) >= minD && walkable(c[0], c[1])) { t = c; break; } }
    if (!t) return;
    this.x = t[0] + 0.5; this.y = t[1] + 0.5; this.path = null; this.goal = null; this.state = 'patrol';
    if (nearVol(this.x, this.y, 18) > 0) Sfx.teleport();
    FX.ring(this.x * CFG.TS, this.y * CFG.TS - 8, '#7dff9a', 16);
  }
  patrolGoal() { const t = pick(G.openTiles); return [t[0], t[1]]; }
  ability(dt) {
    if (G.mode === 'revenge') return false;
    const d = dist(this.x, this.y, P.x, P.y);
    if (d < 0.85 && !P.hero && (P.state === 'free' || P.state === 'knock')) {
      G.docT = CFG.DOCTOR_COUNTDOWN; G.hudPop.timer = 1;
      Sfx.scream('doctor'); FX.sparks(this.x * CFG.TS, this.y * CFG.TS - 10, 14, ['#7dff9a', '#ffffff']);
      this.teleport(12);
      return true;
    }
    if (d < 7 && los(this.x, this.y, P.x, P.y) && P.state !== 'hidden') {
      if (this.state !== 'flee') { this.state = 'flee'; this.fleeT = 0; this.path = null; }
      this.updateFlee(dt);
      return true;
    }
    if (this.state === 'flee') { this.state = 'patrol'; this.goal = null; }
    return false;
  }
  drawBody(X, Y, st) { drawKillerHuman(X, Y, st, STY_DOCTOR); }
  drawOverhead(camX, camY) {
    super.drawOverhead(camX, camY);
    const [X, Y] = this.feet(camX, camY);
    drawTimerPlate(X, Y - this.headH - 4, G.docT);
  }
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function drawTimerPlate(X, Y, s) {
  const str = fmtTime(s), w = textW3(str) + 4;
  const urgent = s <= 10 && ((G.time * 4) | 0) % 2;
  rect(X - w / 2 - 1, Y - 1, w + 2, 9, C.ink);
  rect(X - w / 2, Y, w, 7, urgent ? '#7a1010' : '#1d2a1d');
  text3(str, X + 0.5, Y + 1, urgent ? '#ffffff' : '#7dff9a', 1, 'center');
}

class Machine extends Enemy {
  constructor(kind, tx, ty, doc) {
    super(kind, tx, ty);
    this.main = false; this.machine = true; this.doc = doc; this.useToilets = false;
    this.bashTime = kind === 'drill' ? CFG.DRILL_BASH : CFG.DOOR_BASH;
    this.dashCd = 3; this.dash = null; this.dormant = false; this.headH = 14; this.phaseRate = 6; this.sndT = 0;
    this.stunT = 0.6;
  }
  ability(dt) {
    this.dormant = dist(this.x, this.y, this.doc.x, this.doc.y) > CFG.MACHINE_LEASH;
    if (this.dormant) { this.amt = approach(this.amt, 0, dt * 6); this.sees = false; return true; }
    this.sndT -= dt;
    if (this.sndT <= 0 && nearVol(this.x, this.y, 9) > 0.1) { this.sndT = rand(1.4, 2.4); this.kind === 'saw' ? Sfx.saw() : Sfx.drill(); }
    this.dashCd -= dt;
    if (this.dash) {
      const s = this.dash;
      s.t += dt;
      if (s.phase === 'rev') {
        this.amt = approach(this.amt, 0, dt * 8);
        if (s.t >= CFG.SAW_DASH_WINDUP) { s.phase = 'go'; s.t = 0; Sfx.saw(); }
      } else {
        const m = gridMove(this, [s.dir], this.speed() * CFG.SAW_DASH_MULT * dt, walkable, 0.51);
        this.phase += m * 6; this.amt = 1;
        if (!s.hit && targetable() && dist(this.x, this.y, P.x, P.y) < 0.85) { s.hit = true; hurtPlayer(1, this.x, this.y); }
        if (s.t >= CFG.SAW_DASH_TIME || m <= 0) { this.dash = null; this.dashCd = 5; this.path = null; }
      }
      return true;
    }
    if (this.kind === 'saw' && this.dashCd <= 0 && this.sees && nearCenter(this)) {
      const [tx, ty] = this.tile(), px = Math.floor(P.x), py = Math.floor(P.y);
      const aligned = (px === tx && Math.abs(py - ty) <= 4 && py !== ty) || (py === ty && Math.abs(px - tx) <= 4 && px !== tx);
      if (aligned && los(this.x, this.y, P.x, P.y)) { snapCenter(this); this.dash = { phase: 'rev', t: 0, dir: [Math.sign(px - tx), Math.sign(py - ty)], hit: false }; this.ang = Math.atan2(this.dash.dir[1], this.dash.dir[0]); Sfx.saw(); return true; }
    }
    return false;
  }
  drawBody(X, Y, st) {
    if (this.dash && this.dash.phase === 'rev') X += Math.round(Math.sin(this.t * 80));
    drawMachine(X, Y, st, this.kind, this.dormant);
  }
}

// ── 6.6 무사 ─────────────────────────────────────────────────
class Samurai extends Enemy {
  constructor(tx, ty) {
    super('samurai', tx, ty);
    this.title = 'THE SAMURAI'; this.ko = '무사';
    this.heavy = true; this.phaseRate = 3.6; this.headH = 31; this.spearCd = 4; this.thrust = null; this.wellT = 0; this.sealed = false;
  }
  canSeePlayer() {
    if (super.canSeePlayer()) return true;
    if (!P || P.hero || P.state === 'hidden' || P.state === 'dead' || P.state === 'toilet') return false;
    return dist(this.x, this.y, P.x, P.y) <= CFG.SAMURAI_XRAY;
  }
  globalUpdate(dt) {
    if (G.mode !== 'normal' || this.sealed) return;
    this.wellT += dt;
    if (M.wells.length >= 2 || !nearCenter(this)) return;
    const [tx, ty] = this.tile();
    if (!openTile(tx, ty) || G.candles.some((c) => c.x === tx && c.y === ty)) return;
    if (M.wells.length === 0 && this.wellT >= CFG.WELL_FIRST) this.placeWell(tx, ty);
    else if (M.wells.length === 1 && this.wellT >= CFG.WELL_FIRST + 10) {
      const a = M.wells[0];
      const p = findPath(a.x, a.y, tx, ty, {});
      if (p && p.cost >= CFG.WELL_GAP) { this.placeWell(tx, ty); this.useWells = true; }
    }
  }
  placeWell(x, y) {
    M.wells.push({ x, y, sealed: false });
    FX.dust(x * CFG.TS + 7, y * CFG.TS + 7, 10);
    if (nearVol(x, y, 14) > 0) Sfx.well();
  }
  onShazam() { this.sealed = true; this.useWells = false; for (const w of M.wells) w.sealed = true; }
  ability(dt) {
    this.spearCd -= dt;
    if (this.thrust) {
      const s = this.thrust;
      s.t += dt; this.amt = approach(this.amt, 0, dt * 10); this.ang = s.ang;
      if (s.phase === 'aim') {
        if (s.t >= CFG.SPEAR_WINDUP) {
          s.phase = 'strike'; s.t = 0; Sfx.spear();
          const px = Math.floor(P.x), py = Math.floor(P.y);
          const on = s.dir[0] ? py === s.ty && Math.sign(px - s.tx) === s.dir[0] && Math.abs(px - s.tx) <= CFG.SPEAR_RANGE
            : px === s.tx && Math.sign(py - s.ty) === s.dir[1] && Math.abs(py - s.ty) <= CFG.SPEAR_RANGE;
          if (on && P.state !== 'hidden' && P.state !== 'dead' && P.state !== 'toilet') {
            if (P.hero) stunPlayer(0); else hurtPlayer(1, this.x, this.y);
            FX.sparks(P.x * CFG.TS, P.y * CFG.TS - 8, 10, ['#ffffff', '#e6e9ef']);
          }
        }
      } else if (s.t >= 0.4) { this.thrust = null; this.spearCd = CFG.SPEAR_CD; }
      return true;
    }
    if (this.spearCd > 0 || !nearCenter(this) || P.state === 'hidden') return false;
    const can = G.mode === 'revenge' ? dist(this.x, this.y, P.x, P.y) <= CFG.SAMURAI_XRAY : this.sees;
    if (!can) return false;
    const [tx, ty] = this.tile(), px = Math.floor(P.x), py = Math.floor(P.y);
    const R = CFG.SPEAR_RANGE;
    if ((px === tx && py !== ty && Math.abs(py - ty) <= R) || (py === ty && px !== tx && Math.abs(px - tx) <= R)) {
      const dir = [Math.sign(px - tx), Math.sign(py - ty)];
      snapCenter(this);
      this.thrust = { phase: 'aim', t: 0, dir, tx, ty, ang: Math.atan2(dir[1], dir[0]) };
      Sfx.spearWindup();
      return true;
    }
    return false;
  }
  drawBody(X, Y, st) {
    let ext = 0, pull = 0;
    if (this.thrust) {
      if (this.thrust.phase === 'aim') pull = Ease.outCubic(Math.min(1, this.thrust.t / CFG.SPEAR_WINDUP));
      else ext = Math.sin(Math.min(1, this.thrust.t / 0.4) * Math.PI) * 10;
    }
    st.handL = [3.6 - pull * 2.2 + ext * 0.3, -0.8, 9.2];
    st.handR = [-0.4 - pull * 2.2 + ext * 0.3, 1.8, 8.8];
    if (this.atk) { const a = attackHand(st, [3.6, -0.8, 9.2]); if (a) st.handL = a; }
    st.spearExt = ext;
    drawKillerHuman(X, Y, st, STY_SAMURAI);
  }
  drawWorldUI(camX, camY) {
    if (!this.thrust || this.thrust.phase !== 'aim') return;
    const s = this.thrust, TS = CFG.TS;
    const X = (s.tx + 0.5) * TS - camX, Y = (s.ty + 0.5) * TS - camY;
    const len = CFG.SPEAR_RANGE * TS + 6;
    const k = s.t / CFG.SPEAR_WINDUP;
    L.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(s.t * 18));
    const ex = X + s.dir[0] * len, ey = Y + s.dir[1] * len;
    line(X, Y, ex, ey, '#ff2a3a');
    if (k > 0.5) line(X + s.dir[1], Y + s.dir[0], ex + s.dir[1], ey + s.dir[0], '#ff6a70');
    L.globalAlpha = 1;
  }
}

const KILLER_TYPES = { butcher: Butcher, witch: Witch, janitor: Janitor, evolver: Evolver, doctor: Doctor, samurai: Samurai };
const KILLER_KINDS = Object.keys(KILLER_TYPES);
