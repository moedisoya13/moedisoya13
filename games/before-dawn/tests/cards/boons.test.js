// GDD-V2 §4.5: the seven boons (단련), three ranks each, applied with the cards' stats every tick.
const { world } = require('./_kit');

const give = (BD, w, id, n) => { for (let i = 0; i < n; i++) BD.growth.giveBoon(w, id); return BD.hero.computeStats(w); };

module.exports = {
  'seven boons, three ranks each, a line per rank'(t) {
    const { BD } = world(t);
    t.eq(BD.boons.ids(), ['body', 'draw', 'edge', 'long', 'quick', 'step', 'wide']);
    for (const id of BD.boons.ids()) {
      const b = BD.boons.get(id);
      t.eq(b.max, 3, id);
      for (let r = 1; r <= 3; r++) t.assert(typeof b.text(r) === 'string' && b.text(r).length > 3, id + ' ' + r);
      t.assert(b.text(1) !== b.text(3), id + ': the line follows the rank');
    }
  },
  'edge +2 · long +0.25u · quick −7 % · wide +20° · draw +0.8u per rank (rank 3: +6, +0.75u, 0.47 s, 160°, 3.6u)'(t) {
    const { BD, w } = world(t);
    const s0 = BD.hero.computeStats(w);
    t.eq([s0.dmgBase, s0.reach, s0.interval, s0.halfArc, s0.pickupR], [10, 1.9, 0.6, 50, 1.2]);
    const s1 = give(BD, w, 'edge', 1);
    t.eq(s1.dmgBase, 12);
    give(BD, w, 'edge', 2); give(BD, w, 'long', 3); give(BD, w, 'quick', 3); give(BD, w, 'wide', 3);
    const s3 = give(BD, w, 'draw', 3);
    t.eq(s3.dmgBase, 16);
    t.near(s3.reach, 2.65, 1e-9);
    t.near(s3.interval, 0.6 * 0.79, 1e-9);
    t.eq(Math.round(s3.interval * 100) / 100, 0.47);
    t.eq(s3.halfArc * 2, 160);
    t.near(s3.pickupR, 3.6, 1e-9);
    t.near(w.hero.pickupR, 3.6, 1e-9);
    let threw = false; try { BD.growth.giveBoon(w, 'edge'); } catch (e) { threw = true; }
    t.assert(threw, 'no rank 4');
  },
  'body: max HP +15 and HP +15 per rank (145 at rank 3)'(t) {
    const { BD, w } = world(t);
    w.hero.hp = 50;
    give(BD, w, 'body', 1);
    t.eq([w.hero.maxHp, w.hero.hp], [115, 65]);
    w.hero.hp = w.hero.maxHp;
    give(BD, w, 'body', 2);
    t.eq([w.hero.maxHp, w.hero.hp], [145, 145]);
    t.eq(w.bus.recent(400).filter((x) => x.event === 'heal' && x.source === 'body').map((x) => x.amount), [15, 15, 15]);
  },
  'step: dash cooldown −0.4 s and walking +3 % per rank (1.3 s, +9 %); a dash starts that cooldown'(t) {
    const { BD, H, w } = world(t);
    const s = give(BD, w, 'step', 3);
    t.near(s.dashCd, 1.3, 1e-9);
    t.near(s.speedMul, 1.09, 1e-9);
    const x0 = w.hero.x;
    H.input({ mx: 1, my: 0 }); H.step(60);
    t.near(w.hero.x - x0, 4.2 * 1.09, 0.02, 'walks 9 % faster');
    H.input({ mx: 1, my: 0, dash: true }); H.step(1);
    t.near(w.hero.dashCd, 1.3, 1e-6);
    const { BD: B2, H: H2, w: w2 } = world(t);
    H2.input({ mx: 1, my: 0, dash: true }); H2.step(1);
    t.near(w2.hero.dashCd, 2.5, 1e-6, 'without the boon: 2.5 s');
  },
  'boons are announced (boon event) and dumped with their ranks'(t) {
    const { BD, H, w } = world(t);
    give(BD, w, 'wide', 2);
    t.eq(w.bus.recent(100).filter((x) => x.event === 'boon').map((x) => [x.id, x.rank]), [['wide', 1], ['wide', 2]]);
    t.eq(H.state().hero.boons, { wide: 2 });
  },
};
