// GDD §5.4 quest cards: 망자의 안식, 왕의 사냥, 불의 순례 — before / quest / awakened, altar
// feasibility, progress events, toasts. Numbers are GDD-V2 §4.4 level 1 (goals 150 / 5 / 150; v1
// 12 / 3 / 12); the other levels are in levels.test.js.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

const killAt = (BD, w, kind, x, y, opts) => { const e = place(BD, w, kind, x, y, opts); BD.combat.kill(w, e); return e; };

module.exports = {
  'rest_of_dead: +4 to undead before awakening; offerable only while an undead floor is left above'(t) {
    const { BD, H, w } = world(t, { hand: ['rest_of_dead'] });
    const u = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [14]);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'rod_glow').length, 1);
    const d = BD.cards.get('rest_of_dead');
    t.eq(d.offerable({ floor: 2, floorsLeft: 3, domTypes: ['magic', 'heavy', 'beast'] }), false);
    t.eq(d.offerable({ floor: 4, floorsLeft: 1, domTypes: ['undead'] }), true);
    t.eq(d.offerable({ floor: 5, floorsLeft: 0, domTypes: [] }), false);
  },
  'rest_of_dead: 150 undead kills awaken it; progress events, toasts from 2 before the goal'(t) {
    const { BD, H, w } = world(t, { hand: ['rest_of_dead'] });
    killAt(BD, w, 'goblin', 3, 3);                     // not undead: no progress
    for (let i = 0; i < 150; i++) killAt(BD, w, i % 2 ? 'ghoul' : 'skel_archer', 3, 3, { hp: 1 });
    t.eq(evs(w, 'quest_progress').map((x) => x.value), Array.from({ length: 150 }, (_, i) => i + 1));
    t.eq(evs(w, 'quest_awaken').map((x) => x.cardId), ['rest_of_dead']);
    const toasts = evs(w, 'toast').map((x) => x.text);
    t.eq(toasts, ['망자의 안식: 앞으로 2', '망자의 안식: 앞으로 1', '각성: 망자의 안식']);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'quest_mote').length, 150);
    const c = BD.cardRt.get(w, 'rest_of_dead');
    t.eq(c.def.hud(c.state, BD.cardRt.ctx(w, c)).text, '각성');
  },
  'rest_of_dead awakened: +3 to all, +10 to undead; undead deaths burst 20 within 1.8u; no ghoul revival'(t) {
    const { BD, H, w } = world(t, { hand: ['rest_of_dead'] });
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'rest_of_dead'));
    const g = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [13]);
    g.x += 6;
    const u = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [20]);
    const near = place(BD, w, 'goblin', -3, 1.5, { hp: 999 }), far = place(BD, w, 'goblin', -3, 2.4, { hp: 999 });
    const dying = place(BD, w, 'skel_archer', -3, 0, { hp: 1 });
    BD.combat.damage(w, dying, 5, { source: 'chain', direct: false });
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg]), [['burst', 20]]);   // edge 1.15
    t.eq(hitsOn(w, far).length, 0);                                        // edge 2.05
    const gh = place(BD, w, 'ghoul', 3, -2, { hp: 5 });
    BD.combat.damage(w, gh, 10, { source: 'chain', direct: false });
    t.assert(gh.dead && !gh.down, 'no revival');
  },
  'kings_hunt: +3 to guardians, elites and the boss; 5 elite or guardian kills awaken; offerable with ≥ 2 floors left'(t) {
    const { BD, H, w } = world(t, { hand: ['kings_hunt'] });
    const el = place(BD, w, 'goblin', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, el).map((x) => x.dmg), [13]);
    el.x += 6;
    const n = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, n).map((x) => x.dmg), [10]);
    const d = BD.cards.get('kings_hunt');
    t.eq(d.offerable({ floor: 4, floorsLeft: 1, domTypes: ['heavy'] }), false);
    t.eq(d.offerable({ floor: 3, floorsLeft: 2, domTypes: ['magic', 'heavy'] }), true);
    killAt(BD, w, 'goblin', 3, 3);                     // not a target: no progress
    for (let i = 0; i < 5; i++) killAt(BD, w, 'goblin', 3, 3, i % 2 ? { elite: true } : { guardian: true });
    t.eq(evs(w, 'quest_progress').map((x) => x.value), [1, 2, 3, 4, 5]);
    t.eq(evs(w, 'quest_awaken').map((x) => x.cardId), ['kings_hunt']);
    t.eq(evs(w, 'toast').map((x) => x.text).filter((x) => x.startsWith('왕의') || x.startsWith('각성')), ['왕의 사냥: 앞으로 2', '왕의 사냥: 앞으로 1', '각성: 왕의 사냥']);
  },
  'kings_hunt awakened: ×1.6 instead of +3; a guardian kill heals fully, an elite kill heals 15'(t) {
    const { BD, H, w } = world(t, { hand: ['kings_hunt'] });
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'kings_hunt'));
    const el = place(BD, w, 'goblin', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, el).map((x) => x.dmg), [16]);
    const boss = place(BD, w, BD.enemies.all().find((x) => x.type === 'boss').id, -2.0, 0, { hp: 9999 });
    el.x += 6; swingOnce(BD, H, w);
    t.eq(hitsOn(w, boss).map((x) => x.dmg), [16]);
    w.hero.hp = 40;
    killAt(BD, w, 'goblin', 3, 3, { guardian: true });
    t.eq(w.hero.hp, 100);
    w.hero.hp = 40;
    killAt(BD, w, 'goblin', 3, 3, { elite: true });
    t.eq(w.hero.hp, 55);
    t.eq(evs(w, 'heal').map((x) => [x.amount, x.source]), [[60, 'kings_hunt'], [15, 'kings_hunt']]);
  },
  'fire_pilgrimage: unlock after a quest awakening; every 4th hitting swing ignites what it hit'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage'] });
    const d = BD.cards.get('fire_pilgrimage'), s = BD.progress.fresh();
    t.eq(d.unlock(s), false); s.counters.questAwakened = 1; t.eq(d.unlock(s), true);
    const c = BD.cardRt.get(w, 'fire_pilgrimage');
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const pips = [], lit = [];
    for (let i = 0; i < 8; i++) {
      swingOnce(BD, H, w);
      pips.push(c.def.hud(c.state, BD.cardRt.ctx(w, c)).pips);
      lit.push(!!e.statuses.burn);
      if (e.statuses.burn) BD.status.remove(w, e, 'burn');
    }
    t.eq(pips, [1, 2, 3, 0, 1, 2, 3, 0]);
    t.eq(lit, [false, false, false, true, false, false, false, true]);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'pilgrim_flare').length, 2);
  },
  'fire_pilgrimage: swings that hit nothing do not count'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage', 'sword_wave'] });
    w.hero.x = 1.5;
    place(BD, w, 'goblin', 5.0, 0, { hp: 999 });       // only the wave can reach it
    for (let i = 0; i < 5; i++) swingOnce(BD, H, w);
    t.eq(evs(w, 'swing_end').map((x) => x.hitCount), [0, 0, 0, 0, 0]);
    t.eq(BD.cardRt.get(w, 'fire_pilgrimage').state.embers, 0);
  },
  'fire_pilgrimage: 150 kills of burning enemies (any fire) awaken it; offerable while a floor is left'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage'] });
    const d = BD.cards.get('fire_pilgrimage');
    t.eq([d.offerable({ floor: 4, floorsLeft: 1, domTypes: ['beast'] }), d.offerable({ floor: 5, floorsLeft: 0, domTypes: [] })], [true, false]);
    killAt(BD, w, 'goblin', 3, 3);                    // not burning: no progress
    for (let i = 0; i < 150; i++) {
      const e = place(BD, w, 'goblin', 3, 3, { hp: 1 });
      BD.status.apply(w, e, 'burn', { direct: true }); // as from a mage's fire zone
      BD.combat.kill(w, e);
    }
    t.eq(evs(w, 'quest_progress').map((x) => x.value), Array.from({ length: 150 }, (_, i) => i + 1));
    t.eq(evs(w, 'quest_awaken').map((x) => x.cardId), ['fire_pilgrimage']);
  },
  'fire_pilgrimage awakened: every swing ignites; burning deaths burst 12 within 1.5u and ignite; no fire-zone damage'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage'] });
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'fire_pilgrimage'));
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.assert(e.statuses.burn, 'first swing ignites');
    const near = place(BD, w, 'goblin', -3, 1.6, { hp: 999 }), far = place(BD, w, 'goblin', -3, 2.4, { hp: 999 });
    const dying = place(BD, w, 'goblin', -3, 0, { hp: 1 });
    BD.status.apply(w, dying, 'burn', { direct: true });
    near.burnImmuneT = 5; // would not catch by spread: the burst itself must ignite
    BD.combat.damage(w, dying, 5, { source: 'chain', direct: false });
    t.eq(hitsOn(w, near, 'burst').map((x) => x.dmg), [12]);
    t.assert(near.statuses.burn, 'burst ignites');
    t.eq(hitsOn(w, far).length, 0);
    BD.hero.computeStats(w);
    t.eq(BD.W.hurtHero(w, 3, { source: 'zone', attack: 'fire_zone', enemyId: null }), false);
    t.eq(w.hero.hp, 100);
  },
};
