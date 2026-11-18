// The horde director (GDD-V2 §3.4): enemies come at a rate, not from a list. Every
// C.DIRECTOR.every s it compares how many enemies are on screen or coming (have) with how many the
// floor wants (want) and sends a pack from just outside the screen rectangle S when it is short.
// It also recycles regular enemies left far behind off screen (§3.4 재활용). Deterministic: all
// randomness is w.rng.spawn; the view is the simulation's own (BD.view, w.cam).
//
//   BD.director.row(w)        this floor's row of C.DIRECTOR.floors (null on a v1 room)
//   BD.director.start(w)      floor entry: state, the two packs already standing at the screen edge
//   BD.director.update(w, dt) every tick (tokens, surges, recycling; decides every 0.4 s)
//   BD.director.active(w)     false while stopped: the floor is cleared, the run is over, or a
//                             scenario stopped it (w.director.off, or the v1 test idiom w.wave.n = 3)
//   BD.director.mixes         registry: what each dominant type sends (src/content/floors/*.js)
//
// w.director = {tau, tokens, want, have, surge (0 | n while a surge runs), surgeN, state
// ('normal' | 'guardian' | 'clear' | 'boss'), overtime, off}. Enemy kinds join the director by
// declaring `role: 'fodder' | 'threat'` and being listed in a horde mix (docs/ARCHITECTURE.md §10.2).

const C = BD.C;
const M = BD.math;
const W = BD.W;
const D = BD.director;
const DC = C.DIRECTOR;

D.row = (w) => (w.floor && w.floor.v2 ? DC.floors[w.floorN] || null : null);
D.active = (w) => {
  const d = w.director;
  return !!(d && !d.off && d.state !== 'clear' && !BD.W.scenario(w) && !w.ending && !w.hero.dead);
};

// The weighted pick of a {kind: weight} table (keys sorted: deterministic).
function pickW(rng, table) {
  const ks = Object.keys(table).sort();
  let sum = 0;
  for (const k of ks) sum += table[k];
  let r = rng.next() * sum;
  for (const k of ks) { r -= table[k]; if (r < 0) return k; }
  return ks[ks.length - 1];
}
D.mixOf = (w) => {
  const t = w.floorN === 6 ? 'rooftop' : w.floor.domType;
  return D.mixes.has(t) ? D.mixes.get(t) : null;
};
// The elite of a floor (§3.6): its horde mix's `elite` (the dominant type's threat; undead → ghoul),
// or of the given type. One rule for the director's elites, the rift, the hold's door and the hunt's
// chiefs (BD.places.eliteKind, BD.foes.eliteKind).
D.eliteKind = (w, type) => {
  type = type || (w.floor && w.floor.domType);
  const mx = type && D.mixes.has(type) ? D.mixes.get(type) : null;
  return (mx && mx.elite) || 'slime';
};
D.threatCost = (e) => {
  const m = D.mixes.has(e.type) ? D.mixes.get(e.type) : null;
  return (m && m.threatCost && m.threatCost[e.kind]) || 1;
};

D.start = function (w) {
  const row = D.row(w);
  if (!row) { w.director = null; return; }
  const h = w.hero;
  w.director = {
    tau: 0, tokens: DC.tokensAtEntry, decideT: 0, threatT: row.threatEvery || 0, eliteT: row.eliteEvery || 0, want: 0, have: 0,
    surge: 0, surgeN: 0, surgeEnd: -1, nextSurge: DC.surge.first, state: w.floorN === 6 ? 'boss' : 'normal',
    overtime: false, off: false, trail: [[h.x, h.y]], trailT: 0, packs: 0, flip: 0,
  };
  // §3.4 입장: the first two packs already stand 2u inside the screen edge (frozen like everyone
  // else for the entry freeze), so a floor never opens on an empty screen
  if (w.floorN <= 5) {
    const rng = w.rng.spawn;
    const a0 = rng.range(0, M.TAU);
    for (let i = 0; i < DC.entryPacks; i++) {
      const ang = a0 + (i * M.TAU) / DC.entryPacks + rng.range(-0.4, 0.4);
      const p = edgePoint(w, ang, -DC.entryInset);
      if (p) spawnPack(w, p, packSize(w), null, true);
    }
  }
};

function packSize(w) {
  const row = D.row(w);
  return w.rng.spawn.int(row.pack[0], row.pack[1]);
}

// From the hero along `ang`: the first point outside S (out > 0: that far beyond it; out < 0:
// that far inside it). Must be a reachable floor cell. Returns [x, y] or null.
function edgePoint(w, ang, out) {
  const h = w.hero, c = Math.cos(ang), s = Math.sin(ang);
  let d = 1;
  while (d < 60 && W.onScreen(w, h.x + c * d, h.y + s * d)) d += 0.5;
  d += out;
  if (d < 2) return null;
  const x = h.x + c * d, y = h.y + s * d;
  return reachable(w, x, y) ? [x, y] : null;
}
function reachable(w, x, y) {
  const g = w.grid, cx = Math.floor(x), cy = Math.floor(y);
  if (!g.walkable(cx, cy)) return false;
  if (x < 0.6 || y < 0.6 || x > g.w - 0.6 || y > g.h - 0.6) return false;
  return !w.field || w.field[cy * g.w + cx] >= 0;
}

// The way the hero walked over the last second (the trail is sampled every 0.2 s).
function walkDir(w) {
  const d = w.director, h = w.hero, p = d.trail[0];
  const dx = h.x - p[0], dy = h.y - p[1];
  if (dx * dx + dy * dy > 0.25) return Math.atan2(dy, dx);
  if (h.moveX || h.moveY) return Math.atan2(h.moveY, h.moveX);
  return null;
}

// Place up to n enemies around p (within packR, each on a reachable cell; off screen unless
// `inside`). kinds: fodder from the mix; `threat` (a kind) replaces the first member.
function spawnPack(w, p, n, threat, inside, firstOpts) {
  const rng = w.rng.spawn, mix = D.mixOf(w);
  if (!mix) return 0;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const kind = i === 0 && threat ? threat : pickW(rng, mix.fodder);
    for (let t = 0; t < 6; t++) {
      const a = rng.range(0, M.TAU), r = i === 0 && t === 0 ? 0 : rng.range(0.4, DC.packR);
      const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r;
      if (!reachable(w, x, y)) continue;
      if (!inside && W.onScreen(w, x, y)) continue;
      W.makeEnemy(w, kind, x, y, i === 0 && firstOpts ? Object.assign({ via: 'director' }, firstOpts) : { via: 'director' });
      made++;
      break;
    }
  }
  w.director.packs++;
  return made;
}

function pickThreat(w) {
  const rng = w.rng.spawn, mix = D.mixOf(w);
  let table = mix.threats;
  if (rng.chance(DC.otherThreat)) {
    const others = D.mixes.ids().filter((t) => t !== mix.id && t !== 'rooftop' && Object.keys(D.mixes.get(t).threats).length);
    if (others.length) table = D.mixes.get(rng.pick(others)).threats;
  }
  return Object.keys(table).length ? pickW(rng, table) : null;
}

function counts(w) {
  const h = w.hero;
  let have = 0, onScreen = 0, alive = 0, threats = 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    alive++;
    if (e.role === 'threat') threats += D.threatCost(e);
    if (e.role === 'guardian' || e.role === 'boss') continue;
    if (e.down) continue;
    const on = W.onScreen(w, e.x, e.y);
    if (on) { onScreen++; have++; } else if (M.dist(e.x, e.y, h.x, h.y) <= DC.near) have++;
  }
  return { have, onScreen, alive: alive + w.rifts.length, threats };
}

function wanted(w) {
  const d = w.director, row = D.row(w);
  if (d.state === 'boss') {
    const boss = w.enemies.find((e) => e.boss && !e.dead);
    if (!boss) return 0;
    const ph = (boss.mem && boss.mem.phase) || 1;
    return row.phases[Math.min(row.phases.length, ph) - 1];
  }
  let want = row.from + (row.to - row.from) * Math.min(1, d.tau / row.budget);
  if (d.state === 'guardian') want *= DC.guardianMult;
  else if (d.surge) want *= DC.surge.mult;
  if (d.overtime) want *= DC.overtimeMult;
  // a task may ask for more while its place is held (hold: × 1.4 in the brazier's ring, GDD-V2 §5.4)
  const td = d.state === 'normal' && w.task && BD.tasks.has(w.task.kind) ? BD.tasks.get(w.task.kind) : null;
  if (td && td.wantMult) want *= td.wantMult(w, w.task) || 1;
  return want;
}

// Regular enemies (fodder, threats) off screen and farther than the recycle distance for
// `after` s vanish without shards or events (§3.4). Elites, guardians, the boss and anything
// flagged e.flags.keep (task targets) stay.
function recycle(w, dt) {
  const h = w.hero, R = DC.recycle;
  for (const e of w.enemies) {
    if (e.dead || e.flags.keep || (e.role !== 'fodder' && e.role !== 'threat')) continue;
    const lim = e.role === 'fodder' ? R.fodder : R.threat;
    const far = M.dist(e.x, e.y, h.x, h.y) > lim && !W.onScreen(w, e.x, e.y);
    e.farT = far ? e.farT + dt : 0;
    if (e.farT > R.after) W.removeEnemy(w, e, 'recycle');
  }
}

D.update = function (w, dt) {
  const d = w.director;
  if (!d) return;
  const row = D.row(w), h = w.hero;
  if (w.freezeT <= 0) d.tau += dt;
  // where the hero has been walking (for the 60 % of packs that come from ahead)
  d.trailT += dt;
  if (d.trailT >= 0.2) { d.trailT = 0; d.trail.push([h.x, h.y]); if (d.trail.length > 6) d.trail.shift(); }
  recycle(w, dt);
  if (!D.active(w)) { d.want = 0; return; }
  // guardian fight: the task is done and the floor's guardian stands (§5.5-3)
  if (d.state === 'normal' && w.task && w.task.done) d.state = 'guardian';
  const slow = d.state === 'guardian' ? DC.guardianMult : 1;
  d.tokens = Math.min(DC.tokenMax, d.tokens + row.rate * slow * dt);
  if (row.threatEvery) d.threatT -= dt;
  if (row.eliteEvery) d.eliteT -= dt * (d.overtime ? 2 : 1); // §3.4 overtime: elites twice as often
  // surges (몰려온다) and overtime (밤이 깊어진다), floors 1–5 before the guardian
  if (d.state === 'normal') {
    if (d.tau >= d.nextSurge) {
      d.surgeN++; d.surge = d.surgeN; d.surgeEnd = d.tau + DC.surge.dur; d.nextSurge += DC.surge.every;
      W.emit(w, 'surge', { floor: w.floorN, n: d.surgeN });
      W.banner(w, '몰려온다', 'surge');
    }
    if (d.surge && d.tau >= d.surgeEnd) d.surge = 0;
    if (!d.overtime && d.tau > row.budget) {
      d.overtime = true;
      W.banner(w, '밤이 깊어진다', 'overtime');
    }
  } else d.surge = 0;
  d.decideT -= dt;
  if (d.decideT > 0) return;
  d.decideT = DC.every;
  const n = counts(w);
  d.want = wanted(w); d.have = n.have;
  if (n.have >= d.want || n.alive >= C.CAP.enemies || n.onScreen >= C.CAP.onScreen) return;
  const size = Math.min(packSize(w), Math.floor(d.tokens), C.CAP.enemies - n.alive);
  if (size < row.pack[0] && !(size >= 1 && d.tokens >= DC.tokenMax - 1e-9)) return;
  let threat = null;
  if (d.state === 'normal' && row.threatEvery && d.threatT <= 0 && n.threats < row.threatCap) threat = pickThreat(w);
  // GDD-V2 §3.6 (v2-enemies): every eliteEvery s, while no elite the director sent lives, the next pack
  // brings one — the mix's `elite` kind — in place of its threat
  const mixE = D.mixOf(w), elite = d.state === 'normal' && row.eliteEvery && d.eliteT <= 0 && mixE && mixE.elite &&
    !w.enemies.some((e) => !e.dead && e.flags.directorElite) ? D.eliteKind(w) : null;
  if (elite) threat = null;
  // direction: 60 % within ±60° of the way he walks, else anywhere; a surge comes from two sides
  const rng = w.rng.spawn, walk = walkDir(w);
  let ang = walk !== null && rng.chance(DC.ahead) ? walk + rng.range(-1, 1) * DC.aheadHalf * M.DEG : rng.range(0, M.TAU);
  if (d.surge) { d.flip ^= 1; if (d.flip) ang += Math.PI; }
  for (let tries = 0; tries < 12; tries++, ang += (tries % 2 ? 1 : -1) * tries * 0.45) {
    const p = edgePoint(w, ang, rng.range(DC.spawnOut[0], DC.spawnOut[1]));
    if (!p) continue;
    const made = spawnPack(w, p, size, elite || threat, false, elite ? { elite: true, flags: { directorElite: true } } : null);
    d.tokens -= made;
    if (threat && made) d.threatT = row.threatEvery;
    if (elite && w.enemies.some((e) => !e.dead && e.flags.directorElite)) d.eliteT = row.eliteEvery;
    return;
  }
};

// Floor clear (§5.5-4): the director stops and every regular enemy left scatters as ink (no shards).
D.clear = function (w) {
  if (w.director) { w.director.state = 'clear'; w.director.want = 0; w.director.surge = 0; }
  for (const e of w.enemies.slice()) if (!e.dead && !e.boss && !e.guardian && !e.flags.keep) W.removeEnemy(w, e, 'clear');
  w.rifts = []; w.queue = [];
};
