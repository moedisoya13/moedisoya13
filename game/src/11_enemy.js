// ─────────────────────────────────────────────────────────────
// Enemy — shared killer AI
//   patrol → (sight / noise) → chase → search → check hide spots
//   locked door on the route → bash · attack = windup/strike/recover
//   revenge mode → flee planner (stay where the hero can't get first)
// ─────────────────────────────────────────────────────────────

function centerDir(e) {
  const cx = Math.floor(e.x) + 0.5, cy = Math.floor(e.y) + 0.5;
  if (Math.abs(e.x - cx) > EPS) return [Math.sign(cx - e.x), 0];
  if (Math.abs(e.y - cy) > EPS) return [0, Math.sign(cy - e.y)];
  return null;
}
// abilities trigger near a tile centre (a moving killer rarely lands exactly on one)
function nearCenter(e, tol = 0.17) { return Math.abs(e.x - Math.floor(e.x) - 0.5) < tol && Math.abs(e.y - Math.floor(e.y) - 0.5) < tol; }
function snapCenter(e) { e.x = Math.floor(e.x) + 0.5; e.y = Math.floor(e.y) + 0.5; }
function walkGoal(x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (walkable(tx, ty)) return [tx, ty];
  for (const [dx, dy] of DIRS) if (walkable(tx + dx, ty + dy)) return [tx + dx, ty + dy];
  return null;
}
function nearVol(x, y, maxD = 14) { return P ? clamp(1 - dist(x, y, P.x, P.y) / maxD, 0, 1) : 0; }
function repathAll() { if (G && G.enemies) for (const e of G.enemies) { e.path = null; e.repathT = 0; } }
function targetable() { return P && !P.hero && (P.state === 'free' || P.state === 'knock' || P.state === 'stun' || P.state === 'pulled'); }

class Enemy {
  constructor(kind, tx, ty) {
    this.kind = kind; this.x = tx + 0.5; this.y = ty + 0.5; this.dx = 0; this.dy = 0;
    this.ang = rand(0, TAU); this.phase = 0; this.amt = 0; this.breath = 0; this.t = 0;
    this.state = 'patrol'; this.path = null; this.pathI = 0; this.goal = null; this.repathT = 0;
    this.lastSeen = null; this.sees = false; this.spotT = 0; this.unseenT = 0;
    this.hideTarget = null; this.checkQueue = []; this.searchT = 0; this.checkT = 0; this.checkSpot = null; this.noiseAt = null;
    this.atk = null; this.atkCd = 0; this.waitT = 0;
    this.stuckT = 0; this.stunT = 0; this.flashT = 0;
    this.bashDoor = null; this.bashT = 0; this.bashSnd = 0; this.bashCheck = 0;
    this.trav = null; this.fleeT = 0; this.keys = 0;
    this.hp = 3; this.main = true; this.hostile = true; this.alive = true;
    this.dmg = 1; this.knockMul = 1; this.bashTime = CFG.DOOR_BASH; this.canBash = true;
    this.useToilets = true; this.useWells = false; this.ratio = CFG.KILLER_RATIO;
    this.phaseRate = 4.0; this.heavy = false; this.headH = 26; this.lastStepIdx = 0;
    this.name = ''; this.title = ''; this.ko = '';
  }
  speed(base = false) { return CFG.PLAYER_SPEED * this.ratio; }
  tile() { return [Math.floor(this.x), Math.floor(this.y)]; }
  pathOpts() {
    return {
      bash: this.canBash && G.mode !== 'revenge' ? this.bashTime : 0, speed: this.speed(),
      toilets: this.useToilets, wells: this.useWells && M.wells.length === 2 && !M.wells[0].sealed,
      key: G.mode === 'revenge' && this.keys > 0,
    };
  }

  canSeePlayer() {
    if (!this.hostile || !P || P.hero || P.state === 'hidden' || P.state === 'dead' || P.state === 'toilet') return false;
    const d = dist(this.x, this.y, P.x, P.y);
    if (d > CFG.KILLER_SIGHT) return false;
    if (!los(this.x, this.y, P.x, P.y)) return false;
    if (d <= CFG.KILLER_NEAR) return true;
    return Math.abs(angDiff(this.ang, Math.atan2(P.y - this.y, P.x - this.x))) <= CFG.KILLER_FOV;
  }

  // subclasses: return true to take over this frame
  ability(dt) { return false; }
  onHit() {}

  update(dt) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.spotT = Math.max(0, this.spotT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.breath = Math.sin(this.t * 2) * 0.3;
    if (this.stuckT > 0) {
      this.stuckT -= dt; this.amt = approach(this.amt, 0, dt * 8);
      this.sees = this.canSeePlayer(); if (this.sees) this.lastSeen = { x: P.x, y: P.y };
      return;
    }
    if (this.stunT > 0) { this.stunT -= dt; this.amt = approach(this.amt, 0, dt * 8); return; }
    if (this.trav) { this.updateTrav(dt); return; }
    if (this.atk) { this.updateAttack(dt); return; }
    if (this.ability(dt)) return;
    if (G.mode === 'revenge') { if (this.main) this.updateFlee(dt); else this.amt = approach(this.amt, 0, dt * 6); return; }
    this.perceive(dt);
    if (this.state === 'bash') { this.updateBash(dt); return; }
    if (this.state === 'check') { this.updateCheck(dt); return; }
    if (this.state === 'wait') {
      this.waitT -= dt; this.amt = approach(this.amt, 0, dt * 6);
      this.ang += Math.sin(this.t * 1.7) * dt * 1.2; // look around
      if (this.waitT <= 0) this.state = 'patrol';
      return;
    }
    this.decide(dt);
    const moved = this.moveAlong(dt);
    this.animate(moved, dt);
    this.honeyCheck();
    if (this.hostile && this.sees && this.atkCd <= 0 && targetable() && dist(this.x, this.y, P.x, P.y) < CFG.ATTACK_RANGE) this.startAttack();
  }

  perceive(dt) {
    const was = this.sees;
    this.sees = this.canSeePlayer();
    if (this.hostile && G.exposeT > 0 && P.state !== 'hidden' && P.state !== 'dead' && !P.hero) {
      this.lastSeen = { x: P.x, y: P.y };
      if (this.state !== 'chase' && this.state !== 'bash') this.state = 'chase';
    }
    if (this.sees) {
      this.lastSeen = { x: P.x, y: P.y };
      if (!was) this.onSpot();
      if (this.state !== 'bash' || dist(this.x, this.y, P.x, P.y) < 3) this.state = 'chase';
      this.unseenT = 0;
    } else this.unseenT += dt;
  }
  onSpot() {
    this.spotT = 0.9;
    if (this.main && G.time - G.lastStab > 7) { G.lastStab = G.time; Sfx.stab(); }
  }
  hearNoise(x, y) {
    if (!this.hostile || this.state === 'chase' || this.state === 'bash' || this.state === 'check') return;
    this.state = 'investigate'; this.noiseAt = { x, y }; this.goal = null;
  }

  enterSearch() {
    this.state = 'search'; this.searchT = 7; this.goal = null;
    const ls = this.lastSeen || { x: this.x, y: this.y };
    const spots = M.hideSpots.filter((f) => dist(f.x + 0.5, f.y + 0.5, ls.x, ls.y) < 5.5 && !inLockedRoom(f.ax, f.ay));
    spots.sort((a, b) => dist(a.x, a.y, ls.x, ls.y) - dist(b.x, b.y, ls.x, ls.y));
    this.checkQueue = spots.slice(0, 2);
    if (this.hideTarget) { this.checkQueue = [this.hideTarget, ...this.checkQueue.filter((f) => f !== this.hideTarget)]; this.hideTarget = null; }
  }
  patrolGoal() {
    // the house "guides" the killer toward the player's area — keeps chases frequent
    const rad = this.unseenT > 20 ? 4 : 7;
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(P.x) + randi(-rad, rad), y = Math.floor(P.y) + randi(-rad, rad);
      if (inB(x, y) && walkable(x, y) && dist(x, y, this.x, this.y) > 3) return [x, y];
    }
    const t = pick(G.openTiles);
    return [t[0], t[1]];
  }
  reached(g) { return g && Math.floor(this.x) === g[0] && Math.floor(this.y) === g[1]; }

  decide(dt) {
    this.repathT -= dt;
    let goal = null;
    switch (this.state) {
      case 'chase': {
        const tgt = this.sees ? [P.x, P.y] : this.lastSeen ? [this.lastSeen.x, this.lastSeen.y] : null;
        if (!tgt) { this.state = 'patrol'; break; }
        goal = walkGoal(tgt[0], tgt[1]);
        if (!this.sees && goal && this.reached(goal) && atCenter(this)) { this.enterSearch(); goal = null; }
        break;
      }
      case 'investigate': {
        goal = this.noiseAt ? walkGoal(this.noiseAt.x, this.noiseAt.y) : null;
        if (!goal || (this.reached(goal) && atCenter(this))) { this.lastSeen = this.noiseAt; this.enterSearch(); goal = null; }
        break;
      }
      case 'search': {
        this.searchT -= dt;
        if (this.checkQueue.length) {
          const f = this.checkQueue[0];
          goal = [f.ax, f.ay];
          if (this.reached(goal) && atCenter(this)) { this.state = 'check'; this.checkT = 0; this.checkSpot = f; return; }
        } else if (this.searchT <= 0) { this.state = 'patrol'; this.goal = null; }
        else if (!this.goal || this.reached(this.goal)) {
          const ls = this.lastSeen || { x: this.x, y: this.y };
          for (let i = 0; i < 20; i++) { const x = Math.floor(ls.x) + randi(-4, 4), y = Math.floor(ls.y) + randi(-4, 4); if (inB(x, y) && walkable(x, y)) { goal = [x, y]; break; } }
        } else goal = this.goal;
        break;
      }
      default: { // patrol
        if (!this.goal || this.reached(this.goal)) {
          if (this.goal && rnd() < 0.35) { this.state = 'wait'; this.waitT = rand(0.6, 1.6); this.goal = null; return; }
          goal = this.patrolGoal();
        } else goal = this.goal;
      }
    }
    if (goal) this.setGoal(goal);
  }
  setGoal(g) {
    const changed = !this.goal || this.goal[0] !== g[0] || this.goal[1] !== g[1];
    this.goal = g;
    if (changed || this.repathT <= 0 || !this.path) this.repath();
  }
  repath() {
    this.repathT = 0.3 + rnd() * 0.15;
    if (!this.goal) return;
    const [tx, ty] = this.tile();
    this.path = findPath(tx, ty, this.goal[0], this.goal[1], this.pathOpts());
    this.pathI = 0;
    if (!this.path) {
      this.goal = null;
      if (this.state === 'chase' && !this.sees) this.enterSearch();
      else if (this.state === 'search' && this.checkQueue.length) this.checkQueue.shift();
    }
  }

  moveAlong(dt, mult = 1) {
    if (!this.path) return 0;
    let d = this.speed() * mult * dt, total = 0, guard = 0;
    // step onto the current tile's centre — never past it
    const toCenter = () => {
      const cd = centerDir(this);
      if (!cd) return 0;
      const off = cd[0] ? Math.abs(Math.floor(this.x) + 0.5 - this.x) : Math.abs(Math.floor(this.y) + 0.5 - this.y);
      return gridMove(this, [cd], Math.min(d, off), walkable, 0.51);
    };
    while (d > EPS && guard++ < 10) {
      if (this.pathI >= this.path.length) { const m = toCenter(); if (m <= 0) break; d -= m; total += m; continue; }
      const st = this.path[this.pathI];
      const sx = st.i % M.w, sy = (st.i / M.w) | 0;
      const tx = Math.floor(this.x), ty = Math.floor(this.y);
      if (tx === sx && ty === sy) {
        if (atCenter(this)) { this.pathI++; continue; }
        const m = toCenter(); if (m <= 0) break; d -= m; total += m; continue;
      }
      if (st.via === VIA.TOILET || st.via === VIA.WELL) {
        if (!atCenter(this)) { const m = toCenter(); if (m <= 0) break; d -= m; total += m; continue; }
        if (st.via === VIA.TOILET && G.toiletCd > 0) break;
        this.beginTrav(st); break;
      }
      const dir = [sx - tx, sy - ty];
      if (Math.abs(dir[0]) + Math.abs(dir[1]) !== 1) { this.path = null; this.repathT = 0; break; }
      const door = doorAt(sx, sy);
      if (door && door.state === 'locked') {
        if (!atCenter(this)) { const m = toCenter(); if (m <= 0) break; d -= m; total += m; continue; }
        if (G.mode === 'revenge' && this.keys > 0) { this.keys--; door.state = 'open'; Sfx.unlock(); FX.sparks(door.x * CFG.TS + 7, door.y * CFG.TS + 5, 6); repathAll(); continue; }
        if (this.canBash && G.mode !== 'revenge') this.startBash(door);
        else { this.path = null; this.repathT = 0; }
        break;
      }
      const m = gridMove(this, [dir], d, walkable, 0.51);
      if (m <= 0) { this.path = null; this.repathT = 0; break; }
      d -= m; total += m;
    }
    return total;
  }

  animate(moved, dt) {
    this.amt = approach(this.amt, moved > 0 ? 1 : 0, dt * (moved > 0 ? 7 : 8));
    if (moved > 0) {
      this.ang = angApproach(this.ang, Math.atan2(this.dy, this.dx), dt * 10);
      this.phase += moved * this.phaseRate;
      const idx = Math.floor(this.phase / Math.PI);
      if (idx !== this.lastStepIdx) {
        this.lastStepIdx = idx;
        const v = nearVol(this.x, this.y, 10);
        if (v > 0.05 && this.main) Sfx.step((this.heavy ? 0.12 : 0.06) * v, this.heavy);
      }
    } else this.phase = approach(this.phase, Math.round(this.phase / Math.PI) * Math.PI, dt * 6);
  }

  honeyCheck() {
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    const i = G.honeyTraps.findIndex((h) => h.x === tx && h.y === ty);
    if (i < 0) return;
    G.honeyTraps.splice(i, 1);
    this.stuckT = CFG.HONEY_STICK;
    Sfx.honeyStick();
    FX.burst(this.x * CFG.TS, this.y * CFG.TS, 10, { c: [C.honey, C.honey2, '#ffd27a'], sp0: 10, sp1: 30, l0: 0.3, l1: 0.6 });
  }

  // ── doors ──
  startBash(door) {
    this.state = 'bash'; this.bashDoor = door; this.bashT = door.bash * this.bashTime; this.bashSnd = 0; this.bashCheck = 1.2;
    this.ang = Math.atan2(door.y + 0.5 - this.y, door.x + 0.5 - this.x);
  }
  updateBash(dt) {
    const d = this.bashDoor;
    this.amt = approach(this.amt, 0, dt * 6);
    if (!d || d.state !== 'locked') { this.state = 'chase'; this.path = null; this.repathT = 0; return; }
    this.bashT += dt; d.bash = this.bashT / this.bashTime; d.shake = 0.12;
    this.bashSnd -= dt;
    if (this.bashSnd <= 0) {
      this.bashSnd = 0.55;
      const v = nearVol(d.x, d.y, 16);
      if (v > 0) Sfx.bash();
      FX.dust(d.x * CFG.TS + 7, d.y * CFG.TS + 7, 3);
    }
    this.bashCheck -= dt;
    if (this.bashCheck <= 0) { // abandon if the door is no longer worth it
      this.bashCheck = 1.2;
      if (this.sees || this.lastSeen) {
        const tgt = this.sees ? walkGoal(P.x, P.y) : walkGoal(this.lastSeen.x, this.lastSeen.y);
        if (tgt) {
          const [tx, ty] = this.tile();
          const p = findPath(tx, ty, tgt[0], tgt[1], this.pathOpts());
          if (p && !p.some((s) => s.i === d.y * M.w + d.x)) { this.state = 'chase'; this.path = p; this.pathI = 0; return; }
        }
      }
    }
    if (this.bashT >= this.bashTime) {
      d.state = 'broken'; d.bash = 0;
      Sfx.doorBreak(); FX.debris(d.x * CFG.TS + 7, d.y * CFG.TS + 7, 16);
      if (nearVol(d.x, d.y, 10) > 0.3) G.shake = 3;
      this.state = 'chase'; this.bashDoor = null;
      repathAll();
    }
  }

  // ── hide-spot check (5 s gauge) ──
  updateCheck(dt) {
    const f = this.checkSpot;
    this.amt = approach(this.amt, 0, dt * 6);
    this.ang = angApproach(this.ang, Math.atan2(f.y - this.y, f.x - this.x), dt * 8);
    if (this.sees) { this.state = 'chase'; f.check = 0; return; }
    this.checkT += dt; f.check = this.checkT / CFG.HIDE_CHECK; f.shake = 0.06;
    if (this.checkT >= CFG.HIDE_CHECK) {
      f.check = 0;
      this.checkQueue.shift();
      if (P.state === 'hidden' && P.hide === f) {
        forceExitHide();
        this.lastSeen = { x: P.x, y: P.y }; this.state = 'chase';
        this.atk = { phase: 'strike', t: 0, f: 0, landed: true };
        hurtPlayer(this.dmg, this.x, this.y, { knockMul: this.knockMul });
        this.onHit();
      } else { this.state = 'search'; this.goal = null; }
    }
  }

  // ── attack ──
  startAttack() { this.atk = { phase: 'windup', t: 0, f: 0, landed: false }; }
  updateAttack(dt) {
    const a = this.atk;
    a.t += dt;
    if (a.phase === 'windup') {
      a.f = Math.min(1, a.t / CFG.ATTACK_WINDUP);
      this.ang = angApproach(this.ang, Math.atan2(P.y - this.y, P.x - this.x), dt * 12);
      if (this.sees) { const g = walkGoal(P.x, P.y); if (g) this.setGoal(g); }
      if (this.path) { const m = this.moveAlong(dt, 0.4); this.phase += m * this.phaseRate; }
      if (a.t >= CFG.ATTACK_WINDUP) {
        a.phase = 'strike'; a.t = 0;
        if (targetable() && dist(this.x, this.y, P.x, P.y) <= CFG.ATTACK_REACH && los(this.x, this.y, P.x, P.y)) {
          a.landed = true;
          hurtPlayer(this.dmg, this.x, this.y, { knockMul: this.knockMul });
          this.onHit();
        } else Sfx.whiff();
      }
    } else if (a.phase === 'strike') {
      a.f = Math.min(1, a.t / 0.14);
      if (a.t >= 0.14) { a.phase = 'recover'; a.t = 0; }
    } else {
      const dur = a.landed ? CFG.ATTACK_RECOVER : 0.5;
      a.f = Math.min(1, a.t / dur);
      if (a.t >= dur) { this.atk = null; this.atkCd = 0.25; }
    }
    this.amt = approach(this.amt, a.phase === 'windup' ? 0.3 : 0, dt * 6);
  }

  // ── toilets / wells ──
  beginTrav(st) {
    const kind = st.via === VIA.TOILET ? 'toilet' : 'well';
    this.trav = { kind, t: 0, to: st.i, moved: false };
    if (kind === 'toilet') { G.toiletCd = CFG.TOILET_CD; if (nearVol(this.x, this.y, 14) > 0) Sfx.flush(); }
    else Sfx.well();
  }
  updateTrav(dt) {
    const tr = this.trav;
    tr.t += dt;
    const mid = tr.kind === 'toilet' ? 0.4 : 0.9;
    if (!tr.moved && tr.t >= mid) {
      tr.moved = true;
      this.x = (tr.to % M.w) + 0.5; this.y = ((tr.to / M.w) | 0) + 0.5;
      FX.splash(this.x * CFG.TS, this.y * CFG.TS, 10);
      this.pathI++;
      if (nearVol(this.x, this.y, 12) > 0) (tr.kind === 'toilet' ? Sfx.flush() : Sfx.well());
    }
    if (tr.t >= mid + 0.35) this.trav = null;
  }
  travScale() {
    if (!this.trav) return 1;
    const tr = this.trav, mid = tr.kind === 'toilet' ? 0.4 : 0.9;
    return tr.t < mid ? Math.max(0, 1 - tr.t / Math.min(mid, 0.4)) : Math.min(1, (tr.t - mid) / 0.35);
  }

  // ── revenge: flee from the hero ──
  updateFlee(dt) {
    this.fleeT -= dt;
    const [tx, ty] = this.tile();
    const near = dist(this.x, this.y, P.x, P.y) < 5;
    if (this.fleeT <= 0 || !this.path || this.pathI >= this.path.length) {
      this.fleeT = near ? 0.25 : 0.5;
      const opts = this.pathOpts();
      const fH = costField(Math.floor(P.x), Math.floor(P.y), { key: true, toilets: true });
      const fK = costField(tx, ty, opts);
      let best = -1, bs = -Infinity;
      for (let i = 0; i < fK.length; i++) {
        const k = fK[i], h = fH[i];
        if (k === Infinity || h === Infinity || k >= h - 0.5) continue;
        const s = h - 0.55 * k + rnd() * 1.2;
        if (s > bs) { bs = s; best = i; }
      }
      if (best >= 0) { this.goal = [best % M.w, (best / M.w) | 0]; this.path = findPath(tx, ty, this.goal[0], this.goal[1], opts); this.pathI = 0; }
    }
    const moved = this.moveAlong(dt);
    this.animate(moved, dt);
    this.honeyCheck();
    // pick up keys while fleeing
    const ki = G.keyItems.findIndex((k) => k.x === tx && k.y === ty);
    if (ki >= 0) { G.keyItems.splice(ki, 1); this.keys++; Sfx.key(); G.keyRespawn.push(CFG.KEY_RESPAWN); }
  }

  // ── drawing ──
  feet(camX, camY) { return [this.x * CFG.TS - camX, this.y * CFG.TS - camY + 4]; }
  pose() {
    const st = { ang: this.ang, phase: this.phase, amt: this.amt, breath: this.breath, t: this.t, scale: this.travScale() };
    if (this.atk) st.atk = this.atk;
    if (this.state === 'bash' && this.bashDoor) {
      const c = (this.bashT * 1.8) % 1;
      st.atk = c < 0.6 ? { phase: 'windup', f: c / 0.6 } : { phase: 'strike', f: (c - 0.6) / 0.4 };
    }
    if (this.flashT > 0 && ((this.flashT * 30) | 0) % 2) st.flash = '#ffffff';
    if (this.stuckT > 0) st.amt = 0.15 + Math.abs(Math.sin(this.t * 9)) * 0.2;
    return st;
  }
  drawBody(X, Y, st) {}
  draw(camX, camY, silhouette) {
    const [X, Y] = this.feet(camX, camY);
    const st = this.pose();
    if (st.scale <= 0.04) return;
    if (silhouette) st.flash = silhouette;
    if (this.stuckT > 0) drawHoney(X, Y, this.t, true);
    groundShadow(X, Y, 5.5 * st.scale, 2 * st.scale);
    this.drawBody(X, Y, st);
    if (this.stuckT > 0) { for (let i = -1; i <= 1; i++) line(X + i * 3, Y, X + i * 2, Y - 6 - Math.sin(this.t * 6 + i) * 2, C.honey); }
  }
  drawOverhead(camX, camY) {
    const [X, Y] = this.feet(camX, camY);
    const top = Y - this.headH;
    if (this.stunT > 0 || this.stuckT > 0) iconStars(X, top + 2, this.t);
    if (this.spotT > 0 && this.hostile) { text3('!', X + 0.5, top - 6 - (this.spotT > 0.7 ? (this.spotT - 0.7) * 20 : 0), C.red, 1, 'center'); }
    if (G.heartsShown && this.main) for (let i = 0; i < 3; i++) iconHeart(X - 9 + i * 7, top - 12, i < this.hp);
  }
}
