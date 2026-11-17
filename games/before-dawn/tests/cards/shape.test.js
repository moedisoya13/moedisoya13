// GDD §5.3 shape cards: 관통, 회전베기, 검기 — geometry, factors, sources, unlock.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

module.exports = {
  'pierce: 4.2u × 0.9u line along the aim at factor 1.0 (source pierce)'(t) {
    const { BD, H, w } = world(t, { hand: ['pierce'] });
    w.hero.x = 1.5;
    const p = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });          // primary (blade)
    const inLine = place(BD, w, 'goblin', 3.5, 0, { hp: 999 });     // beyond reach, on the line
    // goblin radius 0.32 (GDD-V2 §3.2; v1 0.35, so v1 tested 0.78 in / 0.84 out)
    const tooFar = place(BD, w, 'goblin', 4.8, 0, { hp: 999 });     // 4.8 − 0.32 > 4.2
    const edgeIn = place(BD, w, 'goblin', 3.0, 0.76, { hp: 999 });  // |off| 0.76 ≤ 0.45 + 0.32
    const edgeOut = place(BD, w, 'goblin', 3.0, -0.8, { hp: 999 }); // 0.8 > 0.77
    t.eq(swingOnce(BD, H, w), 1);
    t.eq(hitsOn(w, p).map((x) => [x.source, x.dmg]), [['slash', 10]]);
    t.eq(hitsOn(w, inLine).map((x) => [x.source, x.dmg]), [['pierce', 10]]);
    t.eq(hitsOn(w, edgeIn).map((x) => x.source), ['pierce']);
    t.eq(hitsOn(w, tooFar).length, 0);
    t.eq(hitsOn(w, edgeOut).length, 0);
    const line = w.lastSwing.shapes.find((s) => s.card === 'pierce');
    t.eq([line.kind, line.len, line.width, line.factor, line.source], ['line', 4.2, 0.9, 1, 'pierce']);
  },
  'whirl: circle of radius = reach at 0.7 outside the fan; fan hits keep 1.0; each enemy once'(t) {
    const { BD, H, w } = world(t, { hand: ['whirl'] });
    const front = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const back = place(BD, w, 'goblin', -1.4, 0, { hp: 999 });   // edge 1.05 ≤ 1.9, behind
    const out = place(BD, w, 'goblin', -2.4, 0, { hp: 999 });    // edge 2.05 > 1.9
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, front).map((x) => [x.source, x.dmg]), [['slash', 10]]);
    t.eq(hitsOn(w, back).map((x) => [x.source, x.dmg]), [['whirl', 7]]);
    t.eq(hitsOn(w, out).length, 0);
    const c = w.lastSwing.shapes.find((s) => s.card === 'whirl');
    t.eq([c.kind, c.r, c.factor], ['circle', 1.9, 0.7]);
  },
  'whirl follows the blade length (drawcut / flawless reach bonuses)'(t) {
    const { BD, H, w } = world(t, { hand: ['whirl', 'flawless'] });
    BD.cardRt.get(w, 'flawless').state.stack = 4; // ≥ 4: reach +0.4
    const back = place(BD, w, 'goblin', -2.5, 0, { hp: 999 });   // edge 2.15 ≤ 2.3
    place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(w.lastSwing.shapes.find((s) => s.card === 'whirl').r, 2.3);
    t.eq(hitsOn(w, back).map((x) => x.source), ['whirl']);
  },
  'sword_wave: unlock when 3F is first reached'(t) {
    const { BD } = world(t);
    const d = BD.cards.get('sword_wave');
    const s = BD.progress.fresh();
    t.assert(!s.unlocked.includes('sword_wave'));
    s.bestFloor = 2; t.eq(d.unlock(s), false);
    s.bestFloor = 3; t.eq(d.unlock(s), true);
  },
  'sword_wave: 6.5u aim range with line of sight, crescent at 13u/s, factor 0.6, gone at the first enemy'(t) {
    const { BD, H, w } = world(t, { hand: ['sword_wave'] });
    w.hero.x = 1.5;
    t.eq(BD.hero.computeStats(w).acquire, 6.5);
    const a = place(BD, w, 'goblin', 5.0, 0, { hp: 999 });   // edge 4.65: beyond the blade, in aim range
    const b = place(BD, w, 'goblin', 5.8, 0, { hp: 999 });   // behind a
    t.eq(swingOnce(BD, H, w), 1);
    const p = w.projectiles.find((x) => !x.hostile);
    t.eq([p.kind, p.speed, p.range, p.r * 2, p.factor, p.pierce], ['wave', 13, 6.5, 1, 0.6, 1]);
    H.step(40);
    t.eq(hitsOn(w, a).map((x) => [x.source, x.dmg, x.direct]), [['wave', 6, true]]);
    t.eq(hitsOn(w, b).length, 0, 'the wave stops at the first enemy');
  },
  'sword_wave: no target beyond 6.5u; a wall blocks the aim'(t) {
    const { BD, H, w } = world(t, { hand: ['sword_wave'] });
    w.hero.x = 1.5;
    place(BD, w, 'goblin', 7.2, 0, { hp: 999 });             // edge 6.85 > 6.5
    H.step(30);
    t.eq(w.bus.counts().swing || 0, 0);
    const near = place(BD, w, 'goblin', 4.0, 0, { hp: 999 });
    w.grid.set(Math.floor(w.hero.x + 2), Math.floor(w.hero.y), BD.CELL.SOLID); w.field = null;
    H.step(30);
    t.eq(w.bus.counts().swing || 0, 0, 'no line of sight → no target beyond the blade');
    t.eq(hitsOn(w, near).length, 0);
  },
  'sword_wave: the blade\'s own hits are skipped; range 6.5u'(t) {
    const { BD, H, w } = world(t, { hand: ['sword_wave'] });
    w.hero.x = 1.5;
    const p = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const behind = place(BD, w, 'goblin', 3.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    H.step(40);
    t.eq(hitsOn(w, p).map((x) => x.source), ['slash']);
    t.eq(hitsOn(w, behind).map((x) => x.source), ['wave']);
    const { BD: BD2, H: H2, w: w2 } = world(t, { hand: ['sword_wave'] });
    w2.hero.x = 1.5;
    place(BD2, w2, 'goblin', 1.2, 0, { hp: 999 });
    const far = place(BD2, w2, 'goblin', 7.6, 0, { hp: 999 });
    swingOnce(BD2, H2, w2);
    H2.step(60);
    t.eq(hitsOn(w2, far).length, 0, 'beyond 6.5u + radii');
  },
};
