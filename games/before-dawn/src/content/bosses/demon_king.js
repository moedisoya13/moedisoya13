// 마왕 (boss, rooftop) — GDD §6.4. Three phases by HP; each phase runs its skill cycle with a
// fixed gap between skills, and phases 2 and 3 summon minions. Not knocked back (engine).
//
//   phase  HP          speed  cycle (gap)                                   summon
//   1 강림  100 → 66 %  1.6    cleave ↔ dark_bolts (2.2 s)                   —
//   2 침식  66 → 33 %   1.6    cleave → dark_bolts → thorns (2.0 s)          on entry, then every 20 s
//   3 결계  33 → 0      2.4    cleave → collapse → dark_bolts → thorns (1.6) on entry, then every 15 s
//
// cleave      front fan 140°, r 3.6, 0.9 s (0.7 s in phase 3), only when the hero is within 4u; 22.
//             When it is cleave's turn and the hero is farther, the cycle moves on to the next skill.
// dark_bolts  phase 1: three lines, each aimed at the hero when it appears, 0.35 s apart, 0.6 s each.
//             From phase 2: five lines fanned over ±30° (every 15°) around the hero's bearing at the
//             start, appearing one after another 0.35 s apart. Bolts 12u/s, 12 each, stopped by pillars.
// thorns      five circles r 1.2 (under the hero + four within 3u of the hero), 1.0 s, 18 each.
// collapse    rings 0–3, 3–6, 6–9u around the boss, inner first, 0.5 s apart, 0.8 s each, 20 each.
// summon      at the rooftop's two rifts (1.2 s warning): this run's summon type's 3F non-dominant
//             bundle (w.floor.summon, chosen by the generator). Skipped while more than 8 minions live.
// Phase change: 1.5 s roar — the hero is pushed 3u away (no damage) and the boss's own warnings in
// progress are wiped; the boss still takes damage. Minions' warnings are left alone (their
// behaviours wait for their own telegraphs to fire).
const A = BD.ai;
const M = BD.math;
const W = BD.W;

const T = {
  phaseAt: [0.66, 0.33],
  phases: [null,
    { speed: 1.6, cycle: ['cleave', 'dark_bolts'], gap: 2.2, summonEvery: 0 },
    { speed: 1.6, cycle: ['cleave', 'dark_bolts', 'thorns'], gap: 2.0, summonEvery: 20 },
    { speed: 2.4, cycle: ['cleave', 'collapse', 'dark_bolts', 'thorns'], gap: 1.6, summonEvery: 15 },
  ],
  cleave: { trigger: 4, half: 70, r: 3.6, time: 0.9, time3: 0.7, dmg: 22 },
  bolts: { n: 3, every: 0.35, time: 0.6, speed: 12, dmg: 12, width: 0.4, fanN: 5, fanHalf: 30 },
  thorns: { n: 5, r: 1.2, spread: 3, time: 1.0, dmg: 18 },
  collapse: { rings: [[0, 3], [3, 6], [6, 9]], every: 0.5, time: 0.8, dmg: 20 },
  summonCap: 8,
  roar: { time: 1.5, push: 3 },
  stop: 2.0,       // walks until edgeDist ≤ this between skills
  firstDelay: 1.5, // after the floor-entry freeze
  afterRoar: 0.6,  // first skill of a new phase this long after the roar ends
};

const dmgOf = (e, base) => Math.round(base * e.dmgMul);

// ---- skills ---------------------------------------------------------------------------------

function cleave(w, e) {
  const S = T.cleave, m = e.mem;
  const dir = A.angleToHero(w, e);
  e.face = dir; e.state = 'windup'; e.squash = 1;
  const time = m.phase === 3 ? S.time3 : S.time;
  A.telegraph(w, e, { shape: 'fan', x: e.x, y: e.y, dir, half: S.half, r: S.r, time, dmg: dmgOf(e, S.dmg), attack: 'cleave' });
  return time;
}

function bolt(w, e, gen, dir) {
  const S = T.bolts, m = e.mem;
  if (m.gen !== gen || e.dead) return;
  const len = BD.nav.rayLen(w.grid, e.x, e.y, dir, 30);
  A.telegraph(w, e, {
    shape: 'line', x: e.x, y: e.y, dir, len, width: S.width, time: S.time, dmg: 0, danger: true, attack: 'dark_bolts',
    onFire(w2, tg) {
      A.projectile(w2, e, { x: tg.x, y: tg.y, dir: tg.dir, speed: S.speed, range: tg.len, r: tg.width / 2, dmg: dmgOf(e, S.dmg), kind: 'dark_bolt', attack: 'dark_bolts' });
    },
  });
}

function darkBolts(w, e) {
  const S = T.bolts, m = e.mem, gen = m.gen;
  e.state = 'cast'; e.squash = 1;
  if (m.phase === 1) {
    for (let i = 0; i < S.n; i++) W.after(w, i * S.every, (w2) => bolt(w2, e, gen, A.angleToHero(w2, e)));
    return (S.n - 1) * S.every + S.time;
  }
  const aim = A.angleToHero(w, e);
  for (let i = 0; i < S.fanN; i++) {
    const dir = aim + (-S.fanHalf + (2 * S.fanHalf * i) / (S.fanN - 1)) * M.DEG;
    W.after(w, i * S.every, (w2) => bolt(w2, e, gen, dir));
  }
  return (S.fanN - 1) * S.every + S.time;
}

function thorns(w, e) {
  const S = T.thorns, h = w.hero, r = A.rng(w);
  e.state = 'cast'; e.squash = 1;
  const spots = [[h.x, h.y]];
  for (let tries = 0; spots.length < S.n && tries < 60; tries++) {
    const a = r.range(0, M.TAU), d = S.spread * Math.sqrt(r.next());
    const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
    if (w.grid.walkable(Math.floor(x), Math.floor(y))) spots.push([x, y]);
  }
  for (const [x, y] of spots) A.telegraph(w, e, { shape: 'circle', x, y, r: S.r, time: S.time, dmg: dmgOf(e, S.dmg), attack: 'thorns' });
  return S.time;
}

function collapse(w, e) {
  const S = T.collapse, m = e.mem, gen = m.gen, x = e.x, y = e.y;
  e.state = 'cast'; e.squash = 1;
  S.rings.forEach(([r0, r1], i) => W.after(w, i * S.every, (w2) => {
    if (m.gen !== gen || e.dead) return;
    A.telegraph(w2, e, { shape: 'ring', x, y, r0, r1, time: S.time, dmg: dmgOf(e, S.dmg), attack: 'collapse' });
  }));
  return (S.rings.length - 1) * S.every + S.time;
}

const SKILLS = { cleave, dark_bolts: darkBolts, thorns, collapse };

function minions(w) {
  let n = 0;
  for (const o of w.enemies) if (!o.dead && !o.boss) n++;
  return n + w.rifts.length + w.queue.length;
}

function summon(w, e) {
  const kinds = w.floor.summon || [];
  if (!kinds.length || minions(w) > T.summonCap) return;
  A.summon(w, kinds);
}

function roar(w, e) {
  const m = e.mem, h = w.hero;
  m.gen++;                       // staggered bolts / rings of the old phase never appear
  m.busyT = 0; m.cd = T.afterRoar;
  m.roarT = T.roar.time;
  e.state = 'roar'; e.squash = 1;
  BD.hazards.clearTelegraphs(w, (tg) => tg.ownerId === e.id);
  const [nx, ny] = M.norm(h.x - e.x, h.y - e.y);
  W.pushHero(w, nx || 1, ny, T.roar.push);
  W.emit(w, 'boss_phase', { phase: m.phase });
  W.emit(w, 'vfx', { kind: 'boss_roar', x: e.x, y: e.y, life: T.roar.time });
  W.banner(w, m.phase === 2 ? '마왕 — 침식' : '마왕 — 결계', 'boss');
  const P = T.phases[m.phase];
  if (P.summonEvery) { summon(w, e); m.summonT = P.summonEvery; }
}

BD.enemies.register({
  id: 'demon_king', name: '마왕', type: 'boss', sprite: 'demon_king',
  hp: 3600, speed: 1.6, dmg: 22, radius: 0.9, // tuned: GDD HP 1500
  phaseAt: T.phaseAt, // the UI draws the boss bar's two ticks from this (ARCHITECTURE §4.5)
  attacks: {
    cleave: { name: '휩쓸기' }, dark_bolts: { name: '암흑탄' }, thorns: { name: '가시' }, collapse: { name: '붕괴' },
  },
  T,
  create(e) {
    const m = e.mem;
    m.phase = 1; m.cycleI = 0; m.cd = T.firstDelay; m.busyT = 0; m.gen = 0; m.summonT = 0; m.roarT = 0;
  },
  update(e, w, dt) {
    const m = e.mem, P = T.phases[m.phase];
    if (P.summonEvery) { // counts from the phase entry, roar included
      m.summonT -= dt;
      if (m.summonT <= 0) { m.summonT = P.summonEvery; summon(w, e); }
    }
    if (m.roarT > 0) { m.roarT -= dt; e.state = 'roar'; return; }
    const frac = e.hp / e.maxHp;
    const want = frac <= T.phaseAt[1] ? 3 : frac <= T.phaseAt[0] ? 2 : 1;
    if (want > m.phase) { m.phase++; roar(w, e); return; }
    if (m.busyT > 0) { m.busyT -= dt; if (m.busyT <= 0) e.state = 'idle'; return; }
    m.cd -= dt;
    const scale = e.speed / e.def.speed; // tier speed modifier
    if (m.cd <= 0 && A.canAttack(w, e)) {
      let skill = P.cycle[m.cycleI % P.cycle.length];
      if (skill === 'cleave' && A.edgeDist(w, e) > T.cleave.trigger) { m.cycleI++; skill = P.cycle[m.cycleI % P.cycle.length]; }
      m.cycleI++;
      m.busyT = SKILLS[skill](w, e);
      m.cd = P.gap;
      return;
    }
    e.state = A.chase(w, e, P.speed * scale, dt, T.stop) ? 'idle' : 'move';
  },
});

// Dark bolt: ink rim, red body, white core (§6.1 shot colours; the rooftop floor is grey).
BD.render.projectiles.register({
  id: 'dark_bolt',
  draw(g, v, p) {
    const a = v.proj(p.x, p.y, 26), b = v.proj(p.x - Math.cos(p.dir) * 0.7, p.y - Math.sin(p.dir) * 0.7, 26);
    g.lineCap = 'round';
    g.strokeStyle = BD.ui.INK; g.lineWidth = 12; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(a[0], a[1]); g.stroke();
    g.strokeStyle = '#d62828'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.lineCap = 'butt';
    g.beginPath(); g.arc(a[0], a[1], 6, 0, M.TAU); g.fillStyle = '#ffffff'; g.fill();
    g.strokeStyle = BD.ui.INK; g.lineWidth = 2; g.stroke();
  },
});

// Roar: two expanding ink rings and a wash of violet, for the 1.5 s the roar lasts.
BD.render.vfx.register({
  id: 'boss_roar',
  draw(g, v, ev, k) {
    const R = BD.client.render;
    for (const off of [0, 0.25]) {
      const kk = Math.min(1, (k * 1.5 + off) % 1);
      g.globalAlpha = 1 - kk;
      R.ellipse(g, v, ev.x, ev.y, 0.9 + 4.5 * kk, null, BD.ui.INK, 6);
      R.ellipse(g, v, ev.x, ev.y, 0.9 + 4.5 * kk, null, '#c9a0ff', 3);
    }
    g.globalAlpha = 1;
  },
});
