// The floor tasks beyond purge (GDD-V2 §5.4): what finishes each one, what it calls in, what it
// does to the horde. (purge: tests/core/v2.test.js.)
'use strict';
const K = require('./_kit');

module.exports = {
  'seals: 5 s in a stone’s 2.2u ring in all breaks it (leaving keeps the count); the first step in calls its garrison; a break kills fodder within 5u (shards drop); three → the guardian': (t) => {
    const { BD, H, w } = K.start(t, { task: 'seals' });
    t.eq([w.task.kind, w.task.goal, w.floor.floorKind], ['seals', 3, 'office']);
    const seals = w.sites.filter((s) => s.kind === 'seal');
    t.eq(seals.map((s) => [s.state, s.known, s.optional, s.phase]), [0, 1, 2].map(() => ['intact', true, false, 'idle']));
    w.hero.invuln = 1e9;
    const s0 = seals[0];
    K.place(BD, w, s0.x + 1.8, s0.y);
    H.step(1);
    const garrison = w.rifts.filter((r) => r.opts.flags.garrison === s0.id);
    t.assert(garrison.length >= 9, 'garrison: a threat and two packs out of warnings, ' + garrison.length);
    t.assert(garrison.every((r) => BD.math.dist(r.x, r.y, s0.x, s0.y) <= 6), 'round the stone');
    H.step(119);
    t.near(s0.progress, 2.0, 0.02);
    K.place(BD, w, s0.x + 3, s0.y); H.step(90);
    t.near(s0.progress, 2.0, 0.02, 'kept while away');
    t.eq(w.rifts.filter((r) => r.opts.flags.garrison === s0.id).length + w.enemies.filter((e) => e.flags.garrison === s0.id).length >= 9, true);
    K.place(BD, w, s0.x, s0.y + 1.5); H.step(40);
    t.eq(s0.state, 'cracked', 'cracked past half');
    // what the shockwave reaches: fodder within 5u die with shards, a threat stays, fodder at 6.5u stays
    for (const e of K.live(w)) BD.W.removeEnemy(w, e, 'recycle');
    const near = [1, 2, 3].map((i) => BD.W.makeEnemy(w, 'goblin', s0.x - 1 - i, s0.y + 1, {}));
    const far = BD.W.makeEnemy(w, 'goblin', s0.x - 6.5, s0.y - 0.5, {});
    const th = BD.W.makeEnemy(w, 'slime', s0.x + 2, s0.y - 2, {});
    K.freeze(w);
    const shards0 = K.evs(w, 'shard_drop').length;
    H.step(145); // 2.67 s so far + 2.33 s
    t.eq([s0.phase, s0.state], ['used', 'broken']);
    t.assert(near.every((e) => e.dead) && !far.dead && !th.dead, 'shock: fodder within 5u');
    t.eq(K.evs(w, 'shard_drop').length - shards0, 3, 'their shards drop');
    t.eq([w.task.value, w.task.done], [1, false]);
    t.eq(K.evs(w, 'site_clear').map((x) => [x.kind, x.optional]), [['seal', false]]);
    for (const s of seals.slice(1)) { K.place(BD, w, s.x, s.y); H.step(60 * 5 + 2); }
    t.eq(seals.map((s) => s.state), ['broken', 'broken', 'broken']);
    t.assert(w.task.done);
    t.eq(K.evs(w, 'task_clear').map((x) => x.task), ['seals']);
    H.step(130);
    t.assert(w.enemies.some((e) => e.guardian && !e.dead), 'the guardian at the stairs');
  },

  'nests: three immobile targets of 150 × the floor’s HP (role object) the auto-attack takes; within 14u each hatches 4 every 4 s, at most 12; broken: 10 shards, its brood dies; three → the guardian': (t) => {
    const { BD, H, w } = K.start(t, { task: 'nests', keepGuards: false });
    t.eq([w.task.kind, w.task.goal, w.floor.floorKind], ['nests', 3, 'atrium']);
    const sites = w.sites.filter((s) => s.kind === 'nest');
    const nests = sites.map((s) => BD.W.enemyById(w, s.mem.enemyId));
    t.eq(nests.map((e) => [e.role, e.kind, e.hp, e.maxHp, e.x, e.y]), sites.map((s) => ['object', 'nest', 150, 150, s.x, s.y]));
    t.assert(nests.every((e) => e.type === w.floor.domType && e.flags.keep), 'the floor’s type, never recycled');
    t.assert(!BD.enemies.has('nest'), 'not an enemy kind (codex, horde, staging leave it out)');
    w.hero.invuln = 1e9;
    const s = sites[0], n0 = nests[0];
    // out of 14u: nothing hatches
    K.place(BD, w, s.x + 15, s.y); H.step(60 * 5);
    t.eq(BD.places.count(w, (f) => f.brood === s.id), 0, 'beyond 14u');
    // near: 4 every 4 s, at most 12 alive or coming
    K.place(BD, w, s.x + 9, s.y); s.mem.t = 0;
    H.step(60 * 4 + 2);
    t.eq(BD.places.count(w, (f) => f.brood === s.id), 4);
    H.step(60 * 4);
    t.eq(BD.places.count(w, (f) => f.brood === s.id), 8);
    for (const e of K.live(w, (e) => e.flags.brood)) e.stunT = 1e9;
    H.step(60 * 12);
    t.eq(BD.places.count(w, (f) => f.brood === s.id), 12, 'capped at 12');
    // it holds its place
    BD.combat.knock(w, n0, 1, 0, 3, {}); n0.x += 0.3; H.step(10);
    t.eq([n0.x, n0.y], [s.x, s.y]);
    // the hero's blade takes it like any enemy when it is the nearest
    for (const e of K.live(w, (e) => e.flags.brood)) BD.W.removeEnemy(w, e, 'recycle');
    w.rifts = []; s.mem.t = -1e9;
    K.place(BD, w, s.x + 1.6, s.y, { fight: true }); w.hero.atkTimer = 0;
    H.step(1);
    t.eq(K.evs(w, 'hit').slice(-1)[0].enemyId, n0.id, 'the swing hits the nest');
    // broken: its brood dies with it (shards drop), 10 shards of its own
    s.mem.t = 3.99; H.step(2); H.step(75);
    const brood = K.live(w, (e) => e.flags.brood === s.id);
    t.eq(brood.length, 4);
    const drops0 = K.evs(w, 'shard_drop').length;
    BD.combat.kill(w, n0);
    t.assert(brood.every((e) => e.dead), 'the brood dies with it');
    t.eq(K.evs(w, 'shard_drop').length - drops0, 5);
    t.eq(K.evs(w, 'shard_drop').filter((x) => x.value === 10).length, 1, 'the nest’s 10');
    t.eq([s.phase, s.state, w.task.value], ['used', 'dead', 1]);
    for (const e of nests.slice(1)) BD.combat.kill(w, e);
    t.eq(sites.map((x) => x.state), ['dead', 'dead', 'dead']);
    t.assert(w.task.done);
    H.step(130);
    t.assert(w.enemies.some((e) => e.guardian && !e.dead));
  },

  'hold: 40 s in the brazier’s 3.5u ring in all (kept when he leaves); the director wants × 1.4 while he holds it; an elite at 20 s at a door; the beacon kills fodder on screen': (t) => {
    const { BD, H, w } = K.start(t, { task: 'hold' });
    t.eq([w.task.kind, w.task.goal, w.floor.floorKind], ['hold', 40, 'hall']);
    const b = K.site(w, 'brazier'), def = BD.tasks.get('hold');
    t.eq([b.x, b.y, b.state, BD.siteRt.ring(b)], [24, 24, 'cold', 3.5]);
    w.hero.invuln = 1e9;
    K.place(BD, w, b.x + 5, b.y);
    t.eq(def.wantMult(w), 1);
    K.place(BD, w, b.x + 3, b.y);
    t.eq(def.wantMult(w), 1.4);
    H.step(60 * 10 + 1);
    t.eq([b.state, w.task.value], ['lit', 10]);
    t.eq(def.label(w.task), '수성 10/40초');
    K.place(BD, w, b.x + 6, b.y); H.step(120);
    t.eq(w.task.value, 10, 'kept while away');
    K.place(BD, w, b.x - 2, b.y + 1);
    H.step(60 * 10 + 2);
    const elite = w.rifts.filter((r) => r.opts.elite);
    t.eq(elite.length, 1, 'an elite at 20 s');
    t.near(BD.math.dist(elite[0].x, elite[0].y, b.x, b.y), 6, 0.9, 'at a door of the room');
    t.eq(BD.places.eliteKind(w), elite[0].kind);
    for (const r of w.rifts.slice()) w.rifts.splice(w.rifts.indexOf(r), 1);
    const on = [1, 2, 3].map((i) => BD.W.makeEnemy(w, 'goblin', b.x + i, b.y + 2, {}));
    const op = BD.nav.resolve(w.grid, b.x + 9, b.y - 10, 0.4), off = BD.W.makeEnemy(w, 'goblin', op[0], op[1], {});
    t.assert(!BD.W.onScreen(w, off.x, off.y), 'off screen (and near enough not to be recycled)');
    const th = BD.W.makeEnemy(w, 'slime', b.x + 2, b.y - 2, {});
    K.freeze(w);
    H.step(60 * 20);
    t.eq([b.phase, w.task.value, w.task.done], ['used', 40, true]);
    t.assert(on.every((e) => e.dead) && !off.dead && !th.dead, 'beacon: fodder on screen');
    t.eq(K.evs(w, 'vfx').filter((x) => x.kind === 'beacon').length, 1);
    t.eq(K.evs(w, 'task_clear').map((x) => x.task), ['hold']);
  },
  'hold: with the director running, its want is 1.4 × in the ring and plain outside it': (t) => {
    const { BD, H, w } = K.start(t, { task: 'hold', calm: false });
    const b = K.site(w, 'brazier');
    w.hero.invuln = 1e9; w.freezeT = 0;
    K.place(BD, w, b.x + 2, b.y); H.step(60);
    const inside = w.director.want;
    K.place(BD, w, b.x + 5, b.y); H.step(30);
    const outside = w.director.want;
    t.near(inside / outside, 1.4, 0.05, `want ${inside} vs ${outside}`);
  },

  'hunt: three chiefs (elites of the floor’s type) with six each, dormant, waking as a group when one is in view; never recycled; three down → the guardian': (t) => {
    const { BD, H, w } = K.start(t, { task: 'hunt', keepGuards: false });
    t.eq([w.task.kind, w.task.goal, w.floor.floorKind], ['hunt', 3, 'ruin']);
    const chiefs = K.live(w, (e) => e.flags.chief);
    t.eq(chiefs.length, 3);
    t.assert(chiefs.every((e) => e.elite && e.dormant && e.kind === BD.places.eliteKind(w)), 'dormant elites');
    t.eq(chiefs.map((e) => [e.x, e.y]), w.floor.layout.targets.map((p) => [p.x, p.y]));
    const groups = chiefs.map((c) => K.live(w, (e) => e.flags.wake === c.flags.wake && e !== c));
    t.eq(groups.map((g) => g.length), [6, 6, 6]);
    t.assert(groups.flat().every((e) => e.role === 'fodder' && e.dormant && e.flags.keep));
    w.hero.invuln = 1e9;
    // far away for 4 s: nothing is recycled
    K.place(BD, w, 40, 40); H.step(240);
    t.assert(chiefs.every((e) => !e.dead) && groups.flat().every((e) => !e.dead), 'kept');
    // one chief in view: his group wakes, the others wait
    const c0 = chiefs[0];
    K.place(BD, w, c0.x + 6, c0.y - 4); H.step(2);
    t.assert(!c0.dormant && groups[0].every((e) => !e.dormant && !e.flags.keep), 'group 0 awake, no longer kept');
    t.assert(chiefs.slice(1).every((e) => e.dormant), 'the rest wait');
    t.eq(K.evs(w, 'wake').length, 7);
    for (const c of chiefs) BD.combat.kill(w, c);
    t.assert(w.task.done);
    t.eq(K.evs(w, 'task_progress').map((x) => x.value), [1, 2, 3]);
    H.step(130);
    t.assert(w.enemies.some((e) => e.guardian && !e.dead));
  },
};
