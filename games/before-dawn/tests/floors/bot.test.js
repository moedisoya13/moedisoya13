// The bot on the v2 floors (GDD-V2 §10.3 rules 2, 3, 4, 7 for tasks and sites): it completes every
// task type (one run each here; V10's ten seeds per task are tools/fun/measure.js --task and
// tools/accept.js), holds a ring, takes a nest as its target, fetches a halo, keeps a holy stone for
// a crowd, and goes to the spring when low.
'use strict';
const K = require('./_kit');

// One bot run on 1F with `task` until the guardian falls (or budget × 1.5 has passed).
function botFloor(t, task, seed) {
  const BD = t.load();
  const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  app.botOn = true;
  app.startRun({ seed, task });
  const w = app.world, budget = BD.C.DIRECTOR.floors[1].budget;
  let clear = null, guard = null;
  w.bus.on('task_clear', () => { if (clear === null) clear = w.t; });
  w.bus.on('floor_clear', () => { if (guard === null) guard = w.t; });
  while (app.mode === 'play' && guard === null && w.t < budget * 1.5) app.step();
  return { BD, w, clear, guard, budget };
}

const ONE = { seals: 2, nests: 2, hold: 2, hunt: 2 };
module.exports = {};
for (const task of Object.keys(ONE)) {
  module.exports[`the bot finishes ${task} and brings the guardian down within the floor budget × 1.5 (seed ${ONE[task]})`] = (t) => {
    const r = botFloor(t, task, ONE[task]);
    t.assert(r.clear !== null, task + ': task done, ' + JSON.stringify(r.w.task));
    t.assert(r.guard !== null && r.guard <= r.budget * 1.5, task + ': guardian down at ' + r.guard);
    t.eq(r.w.stats.unseenHits, 0);
  };
}

Object.assign(module.exports, {
  'rule ⑦: in reach of a seal the bot stays inside its ring while it fights; a nest is its target': (t) => {
    const { BD, H, w } = K.start(t, { task: 'seals', keepGuards: false });
    const s = K.site(w, 'seal'); w.hero.invuln = 1e9;
    K.place(BD, w, s.x + 2.5, s.y, { fight: true });
    for (let i = 0; i < 6; i++) BD.W.makeEnemy(w, 'goblin', s.x - 2 + i * 0.6, s.y + 2.5, {});
    H.bot(true);
    let inside = 0;
    for (let i = 0; i < 240; i++) { H.step(1); if (BD.math.dist(w.hero.x, w.hero.y, s.x, s.y) <= 2.2) inside++; }
    t.assert(inside > 200, 'inside the 2.2u ring ' + inside + '/240 ticks');
    const n = K.start(t, { task: 'nests', keepGuards: false }), ns = K.site(n.w, 'nest'), obj = n.BD.W.enemyById(n.w, ns.mem.enemyId);
    n.w.hero.invuln = 1e9;
    K.place(n.BD, n.w, ns.x + 4, ns.y, { fight: true }); n.H.bot(true);
    n.H.step(240);
    t.assert(obj.hp < obj.maxHp, 'the nest is being cut: ' + obj.hp);
  },
  'rule ③: a halo within 8u is fetched; a holy stone only with 8 enemies within 3u; rule ②: the spring at HP ≤ 45': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', seed: 2, keepGuards: false });
    K.place(BD, w, 30, 36); w.hero.invuln = 1e9;
    w.botGoal = { kind: null, x: null, y: null, until: 1e9 };
    const halo = BD.pickupRt.drop(w, 'halo', 36, 36);
    t.assert(BD.bot.think(w, {}).mx > 0.9, 'toward the halo');
    w.pickups = [];
    const stone = BD.pickupRt.drop(w, 'holy_stone', 36, 36);
    t.assert(BD.bot.think(w, {}).mx < 0.9, 'a stone is kept for later');
    for (let i = 0; i < 8; i++) BD.W.makeEnemy(w, 'goblin', 30 + Math.cos(i) * 1.8, 36 + Math.sin(i) * 1.8, {}).stunT = 1e9;
    t.assert(BD.bot.think(w, {}).mx > 0.5, 'surrounded: to the stone');
    t.assert(halo && stone);
    for (const e of K.live(w)) BD.W.removeEnemy(w, e, 'recycle');
    w.pickups = [];
    const sp = K.site(w, 'spring');
    w.hero.hp = 40;
    const d = BD.bot.think(w, {});
    const to = BD.math.norm(sp.x - w.hero.x, sp.y - w.hero.y);
    t.assert(d.mx * to[0] + d.my * to[1] > 0.5, 'low: toward the spring');
  },
});
