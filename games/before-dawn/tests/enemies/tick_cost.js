// Simulation tick cost at the caps (GDD-V2 §3.7, §10.4 V4), with the horde fighting: 110 live enemies
// of every kind (some elites) packed within 2–11u of the hero on a 48 × 48 floor (so most are inside
// the combat window, winding up, taking slots, splitting, charging through each other), 60 hostile
// shots, 200 shards, the hero swinging at level 15 with three cards. Kills are refilled every tick.
// Not a test (tools/test.js runs *.test.js only).
//
//   node tests/enemies/tick_cost.js [ticks=1200] [floor=4]
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '../../tools/load'));
const BD = load();
const TICKS = Number(process.argv[2] || 1200), FLOOR = Number(process.argv[3] || 4);

function scene(packed) {
  const H = BD.harness();
  H.start({ seed: 6, floor: FLOOR, hand: ['whirl', 'flame', 'lightning'], level: 15 });
  const w = H.world();
  for (const e of w.enemies.slice()) BD.W.removeEnemy(w, e, 'recycle');
  H.calm(); w.freezeT = 0;
  w.hero.x = 24.5; w.hero.y = 24.5; BD.view.snapCam(w);
  w.hero.hp = w.hero.maxHp = 1e9;
  const kinds = BD.enemies.all().filter((d) => d.type !== 'boss').map((d) => d.id);
  const rng = BD.sub(1, 'cost', 'place');
  let i = 0;
  const add = () => {
    for (let t = 0; t < 20; t++) {
      const a = rng.range(0, Math.PI * 2), d = packed ? rng.range(2, 11) : rng.range(2, 22);
      const x = w.hero.x + Math.cos(a) * d, y = w.hero.y + Math.sin(a) * d;
      if (!w.grid.walkable(Math.floor(x), Math.floor(y))) continue;
      const k = kinds[i % kinds.length];
      BD.W.makeEnemy(w, k, x, y, { elite: i % 23 === 0 && BD.enemies.get(k).role !== 'fodder' });
      i++;
      return;
    }
  };
  const alive = () => { let n = 0; for (const e of w.enemies) if (!e.dead) n++; return n; };
  const fill = () => {
    while (alive() + w.rifts.length + w.queue.length < BD.C.CAP.enemies) add();
    while (w.projectiles.filter((p) => p.hostile && !p.dead).length < BD.C.CAP.projectiles) BD.hazards.projectile(w, { x: 24, y: 10, dir: w.projectiles.length * 0.7, speed: 0.5, range: 99, dmg: 1, ownerKind: 'skel_archer', attack: 'shot' });
    while (w.shards.length < BD.C.CAP.shards) BD.growth.drop(w, 2 + (w.shards.length * 3) % 44, 2 + Math.floor(w.shards.length / 15) * 3 % 44, 1);
  };
  return { w, fill };
}

for (const packed of [true, false]) {
  const { w, fill } = scene(packed);
  for (let k = 0; k < 120; k++) { fill(); BD.tick(w); }
  const times = [];
  let tgMax = 0, inView = 0, slots = 0;
  for (let k = 0; k < TICKS; k++) {
    fill();
    const t0 = process.hrtime.bigint();
    BD.tick(w);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    tgMax = Math.max(tgMax, w.telegraphs.length);
    let v = 0, s = 0; for (const e of w.enemies) if (!e.dead) { if (BD.W.inView(w, e.x, e.y)) v++; if (e.slot) s++; }
    inView += v; slots = Math.max(slots, s);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  console.log(`${packed ? 'packed within 11u' : 'spread within 22u'} on ${FLOOR}F: ${BD.C.CAP.enemies} enemies, 60 shots, ${w.shards.length} shards — ` +
    `avg ${avg.toFixed(3)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms, max ${times[times.length - 1].toFixed(3)} ms per tick ` +
    `(${TICKS} ticks; in the combat window ${(inView / TICKS).toFixed(0)} on average; warnings ≤ ${tgMax}; slots ≤ ${slots}; kills ${w.stats.kills})`);
}
