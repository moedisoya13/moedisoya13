// Demon king (GDD §6.4): phase thresholds and roar, speeds, skill cycles and gaps, each skill's
// telegraphs, summons (entry, period, cap).
'use strict';
const { until, evs } = require('./util');

const TICK = 1 / 60;
const DEG = Math.PI / 180;

function roof(t, o) {
  o = o || {};
  const BD = t.load();
  const H = BD.harness();
  H.start({ seed: o.seed || 5, hand: [], floor: 6 });
  const w = H.world();
  w.freezeT = 0;
  const b = w.enemies.find((e) => e.boss);
  w.hero.atkTimer = 1e9;
  if (o.invuln !== false) w.hero.invuln = 1e9;
  if (o.dist !== undefined) { w.hero.x = b.x + o.dist; w.hero.y = b.y; }
  H.input({ mx: 0, my: 0 });
  return { BD, H, w, b, T: b.def.T };
}
// boss telegraphs started since n0: [{t, attack, tg}]
function bossTgs(w, b, n0) {
  return evs(w, 'telegraph', n0).filter((x) => x.ownerId === b.id);
}
function record(H, w, b, sec) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < Math.round(sec / TICK); i++) {
    H.step(1);
    for (const tg of w.telegraphs) if (tg.ownerId === b.id && !seen.has(tg.id)) { seen.add(tg.id); out.push({ t: w.t, tg }); }
  }
  return out;
}

module.exports = {
  'phase 1: cleave (140°, r 3.6, 0.9 s, 22) ↔ dark bolts (3 aimed lines 0.35 s apart, 0.6 s each), 2.2 s gaps'(t) {
    const { H, w, b, T } = roof(t, { dist: 2.4 });
    b.mem.cd = 0;
    const L = record(H, w, b, 8);
    const first = L[0].tg;
    t.eq(first.attack, 'cleave'); t.eq(first.shape, 'fan'); t.near(first.half, 70); t.near(first.r, 3.6); t.near(first.total, 0.9); t.eq(first.dmg, 22);
    const bolts = L.filter((x) => x.tg.attack === 'dark_bolts');
    t.assert(bolts.length >= 3, 'three bolt lines');
    const b3 = bolts.slice(0, 3);
    t.near(b3[0].t - L[0].t, 0.9 + T.phases[1].gap, 3 * TICK, 'bolts 2.2 s after the cleave lands');
    t.near(b3[1].t - b3[0].t, 0.35, 2 * TICK); t.near(b3[2].t - b3[1].t, 0.35, 2 * TICK);
    for (const x of b3) { t.eq(x.tg.shape, 'line'); t.near(x.tg.total, 0.6); t.eq(x.tg.dmg, 0); t.eq(x.tg.danger, true); }
    const next = L.find((x) => x.t > b3[2].t + 0.01);
    t.eq(next.tg.attack, 'cleave');
    t.near(next.t - (b3[2].t + 0.6), 2.2, 3 * TICK, 'cleave 2.2 s after the last bolt line');
  },
  'dark bolts fly at 12u/s for 12 each and stop at the rooftop pillars'(t) {
    const { BD, H, w, b } = roof(t, { dist: 3, invuln: false });
    b.mem.cd = 0; b.mem.cycleI = 1; // dark bolts next
    w.hero.hp = 100;
    const n0 = w.bus.count();
    until(H, () => w.projectiles.some((p) => p.kind === 'dark_bolt'), 120);
    const p = w.projectiles.find((x) => x.kind === 'dark_bolt');
    t.near(p.speed, 12); t.eq(p.dmg, 12); t.eq(p.attack, 'dark_bolts');
    until(H, () => evs(w, 'hurt', n0).length > 0, 120);
    t.eq(evs(w, 'hurt', n0)[0].dmg, 12);
    // a bolt aimed at a pillar dies there
    const q = BD.hazards.projectile(w, { owner: b, x: 6.5, y: 6.5, dir: Math.atan2(3.5 - 6.5, 3.5 - 6.5), speed: 12, range: 30, dmg: 12, hostile: true, kind: 'dark_bolt', attack: 'dark_bolts' });
    w.hero.x = 11.5; w.hero.y = 1.5;
    H.step(60);
    t.assert(q.dead && q.blocked, 'blocked by the pillar at (3,3)');
  },
  'cleave only within 4u: farther away the cycle moves on to the bolts'(t) {
    const { H, w, b } = roof(t, { dist: 5.5 });
    b.mem.cd = 0;
    const L = record(H, w, b, 0.2);
    t.eq(L[0].tg.attack, 'dark_bolts');
  },
  'phase 2 at 66 %: roar 1.5 s (boss_phase 2, hero pushed 3u, own warnings wiped, minions kept), summon on entry'(t) {
    const { BD, H, w, b } = roof(t, { dist: 2.4 });
    b.mem.cd = 0;
    H.step(2);
    t.assert(w.telegraphs.some((x) => x.ownerId === b.id), 'cleave in progress');
    const g = BD.W.makeEnemy(w, 'goblin', 2.5, 2.5, {});
    g.stunT = 1e9;
    BD.ai.telegraph(w, g, { shape: 'circle', x: 2.5, y: 2.5, r: 0.5, time: 3, attack: 'stab' });
    const d0 = BD.math.dist(w.hero.x, w.hero.y, b.x, b.y);
    b.hp = Math.floor(b.maxHp * 0.66);
    const n0 = w.bus.count();
    H.step(1);
    t.eq(evs(w, 'boss_phase', n0).map((x) => x.phase), [2]);
    t.eq(b.mem.phase, 2);
    t.near(BD.math.dist(w.hero.x, w.hero.y, b.x, b.y) - d0, 3, 0.05, 'pushed 3u');
    t.eq(w.telegraphs.filter((x) => x.ownerId === b.id).length, 0, 'boss warnings wiped');
    t.eq(w.telegraphs.filter((x) => x.ownerId === g.id).length, 1, 'minion warning kept');
    t.eq(evs(w, 'hurt', n0).length, 0, 'roar deals no damage');
    t.eq(evs(w, 'rift', n0).length, w.floor.summon.length, 'summon on entry');
    const L = record(H, w, b, 1.45);
    t.eq(L.length, 0, 'nothing during the roar');
    const hp = b.hp; w.hero.atkTimer = 0; w.hero.x = b.x + 1.5; w.hero.y = b.y;
    H.step(2);
    t.assert(b.hp < hp, 'takes damage during the roar');
  },
  'phase 2: bolts are five lines over ±30°, one every 0.35 s; thorns: five r 1.2 circles (one under the hero), 1.0 s, 18'(t) {
    const { H, w, b, T } = roof(t, { dist: 3 });
    b.hp = Math.floor(b.maxHp * 0.6);
    H.step(1);
    until(H, () => b.mem.roarT <= 0, 200);
    b.mem.cd = 0; b.mem.cycleI = 1; b.mem.summonT = 99;
    const L = record(H, w, b, 4.5);
    const bolts = L.filter((x) => x.tg.attack === 'dark_bolts');
    t.eq(bolts.length, 5);
    const aim = bolts[2].tg.dir;
    bolts.forEach((x, i) => {
      t.near(BD_angle(x.tg.dir - aim), (i - 2) * 15 * DEG, 1e-6, 'fan step ' + i);
      if (i) t.near(x.t - bolts[i - 1].t, 0.35, 2 * TICK);
    });
    const th = L.filter((x) => x.tg.attack === 'thorns');
    t.eq(th.length, 5);
    t.near(th[0].t - (bolts[4].t + 0.6), T.phases[2].gap, 3 * TICK, '2.0 s gap');
    const hx = w.hero.x, hy = w.hero.y;
    t.assert(th.some((x) => Math.hypot(x.tg.x - hx, x.tg.y - hy) < 1e-6), 'one under the hero');
    for (const x of th) { t.near(x.tg.r, 1.2); t.near(x.tg.total, 1.0); t.eq(x.tg.dmg, 18); t.assert(Math.hypot(x.tg.x - hx, x.tg.y - hy) <= 3 + 1e-6); }
  },
  'phase 3 at 33 %: speed 2.4, cleave 0.7 s, collapse rings 0–3 / 3–6 / 6–9u inner first 0.5 s apart, 0.8 s each, 20'(t) {
    const { H, w, b } = roof(t, { dist: 2.4 });
    // phase-1 speed first
    b.mem.cd = 99; w.hero.x = 1.5; w.hero.y = 1.5;
    H.step(1);
    let x0 = b.x, y0 = b.y; H.step(30);
    t.near(Math.hypot(b.x - x0, b.y - y0) / 0.5, 1.6, 0.05, 'phase 1 walks 1.6u/s');
    b.hp = Math.floor(b.maxHp * 0.6); H.step(1); until(H, () => b.mem.roarT <= 0, 200);
    b.hp = Math.floor(b.maxHp * 0.33); H.step(1);
    t.eq(b.mem.phase, 3);
    until(H, () => b.mem.roarT <= 0, 200);
    b.mem.cd = 99; b.mem.summonT = 99; b.x = 9.5; b.y = 9.5; w.hero.x = 2.5; w.hero.y = 6.5;
    H.step(1);
    x0 = b.x; y0 = b.y; H.step(30);
    t.near(Math.hypot(b.x - x0, b.y - y0) / 0.5, 2.4, 0.08, 'phase 3 walks 2.4u/s');
    w.hero.x = b.x + 2.2; w.hero.y = b.y;
    b.mem.cd = 0; b.mem.cycleI = 0;
    const L = record(H, w, b, 6.5);
    t.eq(L[0].tg.attack, 'cleave'); t.near(L[0].tg.total, 0.7);
    const rings = L.filter((x) => x.tg.attack === 'collapse');
    t.eq(rings.length, 3);
    t.eq(rings.map((x) => [x.tg.r0, x.tg.r1]), [[0, 3], [3, 6], [6, 9]]);
    t.near(rings[1].t - rings[0].t, 0.5, 2 * TICK); t.near(rings[2].t - rings[1].t, 0.5, 2 * TICK);
    for (const x of rings) { t.eq(x.tg.shape, 'ring'); t.near(x.tg.total, 0.8); t.eq(x.tg.dmg, 20); }
    t.near(rings[0].t - (L[0].t + 0.7), 1.6, 3 * TICK, '1.6 s gap');
    const after = L.find((x) => x.t > rings[2].t + 0.01);
    t.eq(after.tg.attack, 'dark_bolts', 'cycle: cleave → collapse → bolts → thorns');
  },
  'summons: every 20 s in phase 2, every 15 s in phase 3, skipped above 8 living minions'(t) {
    const { BD, H, w, b } = roof(t, { dist: 6 });
    b.hp = Math.floor(b.maxHp * 0.6);
    const n0 = w.bus.count();
    H.step(1);
    const per = w.floor.summon.length;
    t.eq(evs(w, 'rift', n0).length, per);
    // keep the room clear so the cap never bites; count rifts over 41 s
    for (let i = 0; i < Math.round(41 / TICK); i++) {
      H.step(1);
      for (const e of w.enemies) if (!e.boss && !e.dead) BD.combat.kill(w, e);
    }
    t.eq(evs(w, 'rift', n0).length, 3 * per, 'entry + two 20 s summons');
    // phase 3 entry with 9 minions alive: skipped
    for (let i = 0; i < 9; i++) { const g = BD.W.makeEnemy(w, 'goblin', 1.5 + (i % 3), 4.5 + Math.floor(i / 3), {}); g.stunT = 1e9; }
    const n1 = w.bus.count();
    b.hp = Math.floor(b.maxHp * 0.3);
    H.step(1);
    t.eq(b.mem.phase, 3);
    t.eq(evs(w, 'rift', n1).length, 0, 'skipped above 8');
    for (const e of w.enemies) if (!e.boss && !e.dead) BD.combat.kill(w, e);
    const n2 = w.bus.count();
    for (let i = 0; i < Math.round(15.2 / TICK); i++) { H.step(1); for (const e of w.enemies) if (!e.boss && !e.dead) BD.combat.kill(w, e); }
    t.eq(evs(w, 'rift', n2).length, per, 'phase 3 summons after 15 s');
    t.assert(w.floor.summon.every((k) => BD.enemies.get(k).type === w.floor.summonType));
  },
};

function BD_angle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
