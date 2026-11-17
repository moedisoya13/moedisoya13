// GDD §5.6 "같은 계열이 여러 장일 때": shapes union at best factor, 관통 + 검기 pierces 3,
// element order tide → lightning → flame with steam and the wet chain, independent flat / mult.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

module.exports = {
  'pierce + sword_wave: the wave passes through up to 3 enemies (also with 일섬 ≥ 4)'(t) {
    for (const hand of [['pierce', 'sword_wave'], ['one_flash', 'sword_wave']]) {
      const { BD, H, w } = world(t, { hand });
      if (hand[0] === 'one_flash') BD.cardRt.get(w, 'one_flash').state.stack = 4;
      w.hero.x = 1.5;
      const es = [4.9, 5.5, 6.1, 6.7].map((dx) => place(BD, w, 'goblin', dx, 0, { hp: 999 }));
      swingOnce(BD, H, w);
      t.eq(w.projectiles.find((x) => !x.hostile).pierce, 3, hand.join('+'));
      H.step(40);
      t.eq(es.map((e) => hitsOn(w, e, 'wave').length), [1, 1, 1, 0], hand.join('+'));
    }
  },
  'shapes: union, each enemy once at its best factor (pierce + whirl + fan)'(t) {
    const { BD, H, w } = world(t, { hand: ['whirl', 'pierce'] });
    const front = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });     // fan 1.0, pierce 1.0, whirl 0.7
    const back = place(BD, w, 'goblin', -1.2, 0, { hp: 999 });     // whirl 0.7 only
    const line = place(BD, w, 'goblin', 3.0, 0, { hp: 999 });      // pierce only
    swingOnce(BD, H, w);
    t.eq([front, back, line].map((e) => hitsOn(w, e).map((x) => x.dmg)), [[10], [7], [10]]);
  },
  'tide + flame: the wet target turns fire into steam (8 to all within 1.2u) instead of a burn'(t) {
    const { BD, H, w } = world(t, { hand: ['flame', 'tide'] });     // slot order does not matter
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.assert(!e.statuses.burn && !e.statuses.wet, 'steam took both');
    t.eq(hitsOn(w, e, 'steam').map((x) => [x.dmg, x.direct]), [[8, false]]);
    t.eq(evs(w, 'strike')[0].elements, ['tide', 'flame']);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'steam_puff').length, 1);
    t.eq(evs(w, 'toast').map((x) => x.text), ['증기: 젖은 적에 불이 닿았다']);
  },
  'tide + lightning: tide wets the primary first, so the chain deals 100 % and may run 5'(t) {
    const { BD, H, w } = world(t, { hand: ['lightning', 'tide'] });
    w.hero.x = 0.9; w.hero.y = 0.9;
    place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const n = [[1.2, 2], [1.2, 4], [1.2, 6], [1.2, 8], [1.2, 10]].map(([dx, dy]) => place(BD, w, 'goblin', dx, dy, { hp: 999 }));
    swingOnce(BD, H, w);
    t.eq(n.map((e) => hitsOn(w, e, 'chain').map((x) => x.dmg)), [[10], [10], [10], [10], [10]]);
    t.eq(evs(w, 'strike')[0].elements, ['tide', 'lightning']);
  },
  'all three elements: order tide → lightning → flame on every trail'(t) {
    const { BD, H, w } = world(t, { hand: ['flame', 'lightning', 'tide'] });
    place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(evs(w, 'strike')[0].elements, ['tide', 'lightning', 'flame']);
    t.eq(BD.cardRt.onHitOrder(w).map((c) => c.id), ['tide', 'lightning', 'flame']);
  },
  'flat bonuses add, multipliers multiply: (10 + 연참 4 + 성광 8) × 왕의 사냥 1.6 on an elite undead'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash', 'holy_light', 'kings_hunt'] });
    BD.cardRt.setStack(w, BD.cardRt.get(w, 'chain_slash'), 2, 'gain');
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'kings_hunt'));
    const e = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [35]);
  },
  'mult × enemy defense: armor_break cracks and drawcut ×2.5 on a dark knight from behind'(t) {
    const { BD, H, w } = world(t, { hand: ['armor_break', 'drawcut'] });
    const k = place(BD, w, 'dark_knight', 1.4, 0, { hp: 999 });
    BD.status.apply(w, k, 'sunder', { n: 2, max: 5 });
    const c = BD.cardRt.get(w, 'drawcut'); c.state.ready = true;
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, k).map((x) => x.dmg), [Math.round(10 * 1.3 * 2.5)]);
  },
  'riposte applies elements and lightning chains from the nearest hit'(t) {
    const { BD, H, w } = world(t, { hand: ['riposte', 'lightning'] });
    const a = place(BD, w, 'goblin', -2.0, 0, { hp: 999 });
    const b = place(BD, w, 'goblin', -2.0, 2.6, { hp: 999 });     // out of the counter, 2.15 edge from a
    w.hero.dashInvuln = 0.25;
    BD.W.hurtHero(w, 9, { source: 'goblin', attack: 'stab', enemyId: a.id, attackId: 'd' });
    t.eq(hitsOn(w, a, 'riposte').map((x) => x.dmg), [30]);
    t.eq(hitsOn(w, b, 'chain').map((x) => x.dmg), [18]);
  },
};
