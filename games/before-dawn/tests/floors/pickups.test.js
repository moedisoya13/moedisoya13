// Touch pickups (GDD-V2 §6): the halo, the holy stone, the flask and where they come from — elites,
// threats (4 % / 2 % / 1.5 %), chests, rifts — with at most 4 / 2 / 2 on a floor; walked onto, never
// drawn in by the pick-up radius.
'use strict';
const K = require('./_kit');

module.exports = {
  'halo: stepped on (not drawn in by the pick-up radius), every shard on the floor flies in and is taken': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', keepGuards: false });
    K.place(BD, w, 20, 30);
    for (let i = 0; i < 6; i++) BD.growth.drop(w, 6 + i * 6, 6 + (i % 3) * 10, 2);
    const halo = BD.pickupRt.drop(w, 'halo', 21.1, 30);
    H.step(60);
    t.assert(w.pickups.includes(halo), 'not taken at 1.1u');
    t.assert(w.shards.every((s) => !s.pull), 'the shards wait');
    w.hero.x = 21; H.step(1);
    t.assert(!w.pickups.includes(halo), 'taken');
    t.eq(K.evs(w, 'pickup').filter((x) => x.kind === 'halo').length, 1);
    t.assert(w.shards.every((s) => s.pull), 'every shard flies in');
    H.step(240);
    t.eq(w.shards.length, 0);
    t.eq(w.hero.xp + (w.hero.level > 1 ? 12 : 0), 12, 'all 12 taken');
  },

  'holy stone: a 7u shockwave — fodder die (shards drop), others take 40 and are pushed 2u; beyond 7u nothing': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', keepGuards: false });
    K.place(BD, w, 24, 30);
    const fod = [2, 4, 6.5].map((d) => BD.W.makeEnemy(w, 'goblin', 26 + d, 30.5, {}));
    const far = BD.W.makeEnemy(w, 'goblin', 26 + 7.9, 30, {});
    const th = BD.W.makeEnemy(w, 'slime', 26, 33, {});
    K.freeze(w);
    for (const e of [far, th]) e.hp = e.maxHp = 500;
    const stone = BD.pickupRt.drop(w, 'holy_stone', 26, 30);
    const thx = [th.x, th.y], d0 = K.evs(w, 'shard_drop').length;
    K.place(BD, w, 25.2, 30); H.step(1);
    t.assert(!w.pickups.includes(stone), 'taken');
    t.assert(fod.every((e) => e.dead) && !far.dead, 'fodder within 7u die');
    t.eq(K.evs(w, 'shard_drop').length - d0, 3);
    t.eq([th.hp, far.hp], [460, 500]);
    t.assert(th.knock, 'pushed');
    t.near(Math.hypot(th.knock.vx, th.knock.vy) * BD.C.STATUS.knockTime, 2 * th.knockScale, 1e-6, '2u (× its knock scale)');
    t.assert(th.knock.vy > 0 && Math.abs(th.knock.vx) < 1e-6, 'away from the stone');
    H.step(12);
    t.assert(th.y > thx[1] + 0.5, 'it moved');
    t.eq(K.evs(w, 'vfx').filter((x) => x.kind === 'shock').length, 1);
  },

  'flask: left at full HP, taken below; supply: none from the generator on 1F–5F, two on the rooftop, one from every elite': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', keepGuards: false });
    t.eq(w.pickups.filter((p) => p.kind === 'flask').length, 0, 'no flask at floor entry');
    const r = BD.gen.run(3, 0);
    for (let n = 1; n <= 5; n++) t.eq(r.floors[n].layout.flasks, []);
    t.eq(r.floors[6].layout.flasks.length, 2);
    K.place(BD, w, 20, 30);
    const el = BD.W.makeEnemy(w, 'goblin', 23, 30, { elite: true });
    BD.combat.kill(w, el);
    const f = w.pickups.find((p) => p.kind === 'flask');
    t.assert(f && BD.math.dist(f.x, f.y, 23, 30) < 0.6, 'an elite always leaves one');
    K.place(BD, w, f.x, f.y); H.step(2);
    t.assert(w.pickups.includes(f), 'left at full HP');
    w.hero.hp = 50; H.step(1);
    t.assert(!w.pickups.includes(f) && w.hero.hp === 50 + w.mods.flask);
  },

  'threat drops: flask 4 %, halo 2 %, holy stone 1.5 % (w.rng.spawn); fodder none; caps 4 / 2 / 2 on a floor, elites included': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', keepGuards: false });
    K.place(BD, w, 20, 30);
    const n = { flask: 0, halo: 0, holy_stone: 0 }, N = 4000;
    for (let i = 0; i < N; i++) {
      BD.combat.kill(w, BD.W.makeEnemy(w, 'slime', 30, 30, {}));
      for (const p of w.pickups) n[p.kind]++;
      w.pickups = []; w.enemies = w.enemies.filter((e) => !e.dead); w.shards = [];
    }
    t.near(n.flask / N, 0.04, 0.012, 'flask');
    t.near(n.halo / N, 0.02, 0.008, 'halo');
    t.near(n.holy_stone / N, 0.015, 0.007, 'holy stone');
    for (let i = 0; i < 300; i++) BD.combat.kill(w, BD.W.makeEnemy(w, 'goblin', 30, 30, {}));
    t.eq(w.pickups.length, 0, 'fodder leave nothing');
    for (let i = 0; i < 3000; i++) BD.combat.kill(w, BD.W.makeEnemy(w, 'slime', 30, 30, {}));
    const cnt = (k) => w.pickups.filter((p) => p.kind === k).length;
    t.eq([cnt('flask'), cnt('halo'), cnt('holy_stone')], [4, 2, 2], 'capped');
    BD.combat.kill(w, BD.W.makeEnemy(w, 'slime', 30, 30, { elite: true }));
    t.eq(cnt('flask'), 4, 'an elite’s flask too');
    t.eq(BD.pickupRt.drop(w, 'halo', 30, 30), null);
  },
};
