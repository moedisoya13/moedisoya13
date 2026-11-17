// GDD §5.3 element cards: 화염, 뇌전, 해류 — numbers, chain rules, knockback scaling, slam.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

module.exports = {
  'flame: the blade ignites: 3 every 0.5 s for 3 s (18 in all); burning spreads 0.6u'(t) {
    const { BD, H, w } = world(t, { hand: ['flame'] });
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const nb = place(BD, w, 'goblin', 1.95, 0.9, { hp: 999 }); // outside the fan, edge-to-edge ≤ 0.6
    swingOnce(BD, H, w);
    t.assert(e.statuses.burn, 'ignited');
    t.eq(evs(w, 'vfx', (x) => x.kind === 'ignite').length >= 1, true);
    H.step(200);
    const burns = hitsOn(w, e, 'burn');
    t.eq(burns.length, 6);
    t.eq(burns.reduce((a, b) => a + b.dmg, 0), 18);
    t.eq(burns.every((b) => b.direct === false), true);
    t.assert(!e.statuses.burn, 'burnt out after 3 s');
    t.assert(hitsOn(w, nb, 'burn').length >= 1, 'spread to the neighbour');
  },
  // layout: hero in the corner aiming +x; the primary in front; a column of links 2.0u apart
  // (1.65u edge to edge) running away from the blade, then one more to the side.
  'lightning: 3 jumps from the primary to unhit enemies within 3.0u, 60 % of the swing damage'(t) {
    const { BD, H, w } = world(t, { hand: ['lightning'] });
    w.hero.x = 0.9; w.hero.y = 0.9;
    const p = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const inFan = place(BD, w, 'goblin', 0.9, 0.9, { hp: 999 });   // hit by the blade → not chained
    const n = [[1.2, 2], [1.2, 4], [1.2, 6], [1.2, 8]].map(([dx, dy]) => place(BD, w, 'goblin', dx, dy, { hp: 999 }));
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, p).map((x) => [x.source, x.dmg]), [['slash', 10]]);
    t.eq(hitsOn(w, inFan).map((x) => x.source), ['slash']);
    t.eq(n.map((e) => hitsOn(w, e, 'chain').map((x) => [x.dmg, x.direct])), [[[6, false]], [[6, false]], [[6, false]], []]);
    const bolt = evs(w, 'vfx', (x) => x.kind === 'chain_bolt')[0];
    t.eq(bolt.points.length, 4);
  },
  'lightning: a wet link makes the chain 100 % and up to 5 jumps; out of 3.0u breaks the chain'(t) {
    const { BD, H, w } = world(t, { hand: ['lightning'] });
    w.hero.x = 0.9; w.hero.y = 0.9;
    place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const n = [[1.2, 2], [1.2, 4], [1.2, 6], [1.2, 8], [1.2, 10], [3.2, 10]].map(([dx, dy]) => place(BD, w, 'goblin', dx, dy, { hp: 999 }));
    BD.status.apply(w, n[1], 'wet', {});
    swingOnce(BD, H, w);
    t.eq(n.map((e) => hitsOn(w, e, 'chain').map((x) => x.dmg)), [[10], [10], [10], [10], [10], []]);
    const { BD: B2, H: H2, w: w2 } = world(t, { hand: ['lightning'] });
    place(B2, w2, 'goblin', 1.2, 0, { hp: 999 });
    const gap = place(B2, w2, 'goblin', 1.2, 3.5, { hp: 999 });   // edge 3.15 from the primary
    swingOnce(B2, H2, w2);
    t.eq(hitsOn(w2, gap).length, 0);
  },
  'lightning: an always-wet primary (slime) chains at 100 %'(t) {
    const { BD, H, w } = world(t, { hand: ['lightning'] });
    const s = place(BD, w, 'slime', 1.3, 0, { hp: 999 });
    const o = place(BD, w, 'goblin', 1.3, 2.4, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, s).map((x) => x.dmg), [10]);
    t.eq(hitsOn(w, o, 'chain').map((x) => x.dmg), [10]);
  },
  'tide: unlock at 150 kills; push 1.2u away from the hero, wet 4 s'(t) {
    const { BD, H, w } = world(t, { hand: ['tide'] });
    const d = BD.cards.get('tide'), s = BD.progress.fresh();
    s.counters.kills = 149; t.eq(d.unlock(s), false); s.counters.kills = 150; t.eq(d.unlock(s), true);
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const x0 = e.x;
    swingOnce(BD, H, w);
    H.step(12);
    t.near(e.x - x0, 1.2, 0.01, 'pushed');
    t.assert(e.statuses.wet && Math.abs(e.statuses.wet.t - (4 - 13 / 60)) < 0.02, 'wet ≈ 4 s');
    t.eq(evs(w, 'vfx', (x) => x.kind === 'splash').length, 1);
    H.step(4 * 60);
    t.assert(!e.statuses.wet, 'dry after 4 s');
  },
  'tide: heavy and guardian are pushed 0.4u, the boss not at all'(t) {
    const { BD, H, w } = world(t, { hand: ['tide'] });
    const k = place(BD, w, 'dark_knight', 1.4, 0, { hp: 999 });
    k.face = Math.PI + 2; // back to the hero: no guard
    const kx = k.x;
    swingOnce(BD, H, w); H.step(12);
    t.near(k.x - kx, 0.4, 0.01, 'heavy');
    const { BD: B2, H: H2, w: w2 } = world(t, { hand: ['tide'] });
    const g = place(B2, w2, 'goblin', 1.2, 0, { hp: 999, guardian: true });
    const gx = g.x;
    swingOnce(B2, H2, w2); H2.step(12);
    t.near(g.x - gx, 0.4, 0.01, 'guardian');
    const { BD: B3, H: H3, w: w3 } = world(t, { hand: ['tide'] });
    const boss = place(B3, w3, B3.enemies.all().find((d) => d.type === 'boss').id, 2.0, 0, { hp: 9999 });
    const bx = boss.x;
    swingOnce(B3, H3, w3); H3.step(12);
    t.eq(boss.x, bx);
    t.assert(boss.statuses.wet, 'still wet');
  },
  'tide: pushed into a wall → 8 damage (slam, indirect) and 0.5 s stun'(t) {
    const { BD, H, w } = world(t, { hand: ['tide'] });
    w.hero.x = 2.6;
    const e = place(BD, w, 'goblin', -1.4, 0, { hp: 999 });
    e.stunT = 0; w.hero.face = Math.PI;
    let stunAt = null;
    w.bus.on('hit', (ev) => { if (ev.source === 'slam') stunAt = e.stunT; });
    swingOnce(BD, H, w); H.step(12);
    t.eq(hitsOn(w, e, 'slam').map((x) => [x.dmg, x.direct]), [[8, false]]);
    t.near(stunAt, 0.5, 1e-9, 'stunned');
  },
};
