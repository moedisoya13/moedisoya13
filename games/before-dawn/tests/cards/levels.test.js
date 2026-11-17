// GDD-V2 §4.4: the six levelled cards of the proof slice — each level's numbers through ctx.lv and
// the shape-changing levels (3 and 5) on the field.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

const up = (BD, w, id, to) => { const c = BD.cardRt.get(w, id); while (c.level < to) BD.cardRt.levelUp(w, c); return c; };
const lv = (BD, w, id) => { const c = BD.cardRt.get(w, id); return BD.cardRt.ctx(w, c).lv; };

module.exports = {
  'every slice card has five levels with a line each; levels are cumulative and announced (card_level)'(t) {
    const { BD, w } = world(t, { hand: ['pierce', 'whirl', 'flame'] });
    for (const id of ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'chain_slash']) {
      const d = BD.cards.get(id);
      t.eq(d.levels.length, 6, id); t.eq(BD.cardRt.maxLevel(d), 5, id);
      for (let i = 1; i <= 5; i++) t.assert(typeof d.levels[i].text === 'string' && d.levels[i].text.length > 4, id + ' ' + i);
    }
    up(BD, w, 'pierce', 4);
    t.eq([lv(BD, w, 'pierce').len, lv(BD, w, 'pierce').width, lv(BD, w, 'pierce').push, lv(BD, w, 'pierce').factor], [6.6, 1.3, 0.6, 1.2]);
    t.eq(evs(w, 'card_level').map((x) => x.level), [2, 3, 4]);
    let threw = false; try { up(BD, w, 'pierce', 6); } catch (e) { threw = true; }
    t.assert(threw, 'no level 6');
  },
  'pierce 3: hit enemies are pushed 0.6u along the thrust; 5: a second thrust behind at 0.7'(t) {
    const { BD, H, w } = world(t, { hand: ['pierce'] });
    up(BD, w, 'pierce', 5);
    const p = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const ahead = place(BD, w, 'goblin', 3.5, 0, { hp: 999 });
    const behind = place(BD, w, 'goblin', -3.5, 0, { hp: 999 });
    const x0 = ahead.x;
    swingOnce(BD, H, w); H.step(12);
    t.eq(hitsOn(w, behind).map((x) => [x.source, x.dmg]), [['pierce', Math.round(10 * 0.7)]]);
    t.near(ahead.x - x0, 0.6, 0.05, 'pushed');
    t.eq(hitsOn(w, p).map((x) => x.source), ['pierce'], 'at level 4 the thrust (× 1.2) beats the fan (× 1.0): one hit at its best factor');
  },
  'whirl: factor 0.7 → 0.85 → radius +0.4 → 1.0; level 5 adds the aftershock ring on every third hitting swing'(t) {
    const { BD, H, w } = world(t, { hand: ['whirl'] });
    const fac = () => { const ctx = BD.cardRt.ctx(w, BD.cardRt.get(w, 'whirl'), { reach: 1.9 }); return BD.cards.get('whirl').shapes(ctx); };
    t.eq(fac().map((s) => [s.r, s.factor]), [[1.9, 0.7]]);
    up(BD, w, 'whirl', 2); t.eq(fac()[0].factor, 0.85);
    up(BD, w, 'whirl', 3); t.near(fac()[0].r, 2.3, 1e-9);
    up(BD, w, 'whirl', 4); t.eq(fac()[0].factor, 1.0);
    up(BD, w, 'whirl', 5);
    place(BD, w, 'goblin', 1.0, 0, { hp: 9999 });
    const rings = [];
    for (let i = 0; i < 6; i++) { swingOnce(BD, H, w); rings.push(w.lastSwing.shapes.filter((s) => s.kind === 'ring').length); }
    t.eq(rings, [0, 0, 1, 0, 0, 1]);
    const ring = w.lastSwing.shapes.find((s) => s.kind === 'ring');
    t.eq([ring.r0, ring.r1, ring.factor], [1.9, 3.5, 0.6]);
  },
  'flame: tick 3 → 4 → spread 1.0u → 5 for 4 s; level 5 leaves a fire scar that burns enemies only'(t) {
    const { BD, H, w } = world(t, { hand: ['flame'] });
    up(BD, w, 'flame', 4);
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq([e.statuses.burn.dmg, e.statuses.burn.spread], [5, 1.0]);
    t.near(e.statuses.burn.t, 4 - 1 / 60, 1e-6);
    H.step(31);
    t.eq(hitsOn(w, e, 'burn').map((x) => x.dmg), [5]);
    up(BD, w, 'flame', 5);
    w.hero.hp = 50;
    const v = place(BD, w, 'goblin', 3, 3, { hp: 3 }); v.statuses.burn = { t: 3, acc: 0, dmg: 3, spread: 0.6 };
    BD.combat.damage(w, v, 5, { source: 'chain', direct: false });
    t.assert(v.dead && w.zones.some((z) => z.kind === 'scar'), 'scar where it fell');
    const in1 = place(BD, w, 'goblin', 3, 3.3, { hp: 999 });
    H.step(32);
    t.assert(hitsOn(w, in1, 'burn').some((x) => x.dmg === 5), 'the scar burns an enemy standing in it');
    t.eq(w.hero.hp, 50, 'not the hero');
  },
  'one burning enemy lights at most two others per tick (GDD-V2 §4.4)'(t) {
    const { BD, H, w } = world(t, { hand: [] });
    const src = place(BD, w, 'goblin', 3, 0, { hp: 999 });
    const ring = [0, 1, 2, 3, 4].map((i) => place(BD, w, 'goblin', 3 + 0.7 * Math.cos(i * 1.25), 0.7 * Math.sin(i * 1.25), { hp: 999 }));
    BD.status.apply(w, src, 'burn', { direct: true });
    H.step(1);
    t.eq(ring.filter((e) => e.statuses.burn).length, 2);
  },
  'lightning: 3 → 4 jumps → 80 % → 6 jumps in 3.5u; level 5 strikes the target every fifth hitting swing (r 1.6, × 1.5, 0.5 s stun)'(t) {
    const { BD, H, w } = world(t, { hand: ['lightning'] });
    t.eq([lv(BD, w, 'lightning').jumps, lv(BD, w, 'lightning').pct], [3, 0.6]);
    up(BD, w, 'lightning', 2); t.eq([lv(BD, w, 'lightning').jumps, lv(BD, w, 'lightning').jumpsWet], [4, 6]);
    up(BD, w, 'lightning', 3); t.eq(lv(BD, w, 'lightning').pct, 0.8);
    up(BD, w, 'lightning', 4); t.eq([lv(BD, w, 'lightning').jumps, lv(BD, w, 'lightning').range], [6, 3.5]);
    const p = place(BD, w, 'goblin', 1.2, 0, { hp: 9999 });
    const chainTo = [1, 2, 3, 4, 5, 6, 7].map((i) => place(BD, w, 'goblin', 1.2 + i * 2.5, 0, { hp: 9999 }));
    swingOnce(BD, H, w);
    t.eq(chainTo.filter((e) => hitsOn(w, e, 'chain').length).length, 6, 'six jumps');
    t.eq(hitsOn(w, chainTo[0], 'chain')[0].dmg, Math.round(10 * 0.8));
    up(BD, w, 'lightning', 5);
    const side = place(BD, w, 'goblin', 1.2, 1.2, { hp: 9999 });
    const n = [];
    for (let i = 0; i < 5; i++) { swingOnce(BD, H, w); n.push(evs(w, 'vfx', (x) => x.kind === 'thunder').length); }
    t.eq(n, [0, 0, 0, 1, 1], 'the fifth hitting swing (one already counted above) calls the bolt');
    t.assert(side.stunT > 0.3, 'stunned');
  },
  'leech: every 80 → 70 → heals 5 / a 5-shard at full HP → 60 → each heal bursts 20 within 2.2u'(t) {
    const { BD, H, w } = world(t, { hand: ['leech'] });
    const kill = () => { const e = place(BD, w, 'goblin', 3, 3); BD.combat.kill(w, e); };
    up(BD, w, 'leech', 3);
    for (let i = 0; i < 70; i++) kill();
    t.eq(w.shards.filter((s) => s.v === 5).length, 1, 'full HP: a 5-shard instead');
    w.hero.hp = 50;
    for (let i = 0; i < 70; i++) kill();
    t.eq(w.hero.hp, 55);
    up(BD, w, 'leech', 5);
    t.eq(lv(BD, w, 'leech').every, 60);
    const near = place(BD, w, 'goblin', 1.5, 0, { hp: 999 });
    for (let i = 0; i < 60; i++) kill();
    t.eq(hitsOn(w, near, 'burst').map((x) => x.dmg), [20]);
  },
  'chain_slash: 2.5 s → haste 12 % from 5 stacks → +1.5 per stack → max 15 and bursts 5 at the top'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = up(BD, w, 'chain_slash', 2);
    t.eq(lv(BD, w, 'chain_slash').limit, 2.5);
    up(BD, w, 'chain_slash', 3);
    BD.cardRt.setStack(w, c, 5, 'gain');
    t.near(BD.hero.computeStats(w).interval, 0.6 * 0.88, 1e-9);
    up(BD, w, 'chain_slash', 4);
    t.eq(BD.cards.get('chain_slash').flat(BD.cardRt.ctx(w, c)), 7.5);
    up(BD, w, 'chain_slash', 5);
    t.eq(BD.cardRt.maxStack(c), 15);
    BD.cardRt.setStack(w, c, 15, 'gain');
    const by = place(BD, w, 'goblin', 3.5, 3, { hp: 999 });
    const v = place(BD, w, 'goblin', 3, 3); BD.combat.kill(w, v);
    t.eq(hitsOn(w, by, 'burst').map((x) => x.dmg), [5]);
  },
};
