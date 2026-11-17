// GDD §5.3 target cards: 성광 (undead), 갑옷 파쇄 (heavy), 마력 역류 (magic).
// ghoul / dark_knight / mage / skel_archer come from tests/cards/standin_enemies.js until the
// enemies agent's real ones are merged (then those are used).
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

module.exports = {
  'holy_light: +8 to undead only; glow on an undead floor, flash on a hit'(t) {
    const { BD, H, w } = world(t, { hand: ['holy_light'] });
    const u = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [18]);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'holy_cross').length, 1);
    const c = BD.cardRt.get(w, 'holy_light'), hud = () => c.def.hud(c.state, BD.cardRt.ctx(w, c));
    t.eq(hud().flash, true);
    t.eq(hud().glow, w.floor.domType === 'undead');
    const g = place(BD, w, 'goblin', -1.2, 0, { hp: 999 });
    u.x += 5; swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [10]);
  },
  'holy_light: a ghoul cut down by the blade dies without going down'(t) {
    const { BD, H, w } = world(t, { hand: ['holy_light'] });
    const e = place(BD, w, 'ghoul', 1.3, 0, { hp: 1 });
    swingOnce(BD, H, w); H.step(2);
    t.eq(evs(w, 'down').length, 0);
    t.eq(evs(w, 'kill', (x) => x.enemyId === e.id).length, 1);
  },
  'holy_light: chain / burst / burn deaths do not go down either; a corpse already down is finished'(t) {
    const { BD, H, w } = world(t, { hand: ['holy_light'] });
    const a = place(BD, w, 'ghoul', 4, 4, { hp: 50 });
    BD.combat.damage(w, a, 60, { source: 'chain', direct: false });
    t.assert(a.dead && !a.down, 'chain kill → dead');
    const { BD: B2, H: H2, w: w2 } = world(t);
    const b = place(B2, w2, 'ghoul', 4, 4, { hp: 5 });
    B2.combat.damage(w2, b, 10, { source: 'chain', direct: false });
    t.assert(b.down && !b.dead, 'without the card it goes down');
    B2.cardRt.equip(w2, 0, 'holy_light');
    B2.combat.damage(w2, b, 1, { source: 'burst', direct: false });
    H2.step(1);
    t.assert(b.dead, 'the corpse is finished on the next tick');
    t.eq(w2.bus.recent(400).filter((x) => x.event === 'revive').length, 0);
  },
  'armor_break: ignores the front guard; cracks +15 % each, max 5, kept on the enemy'(t) {
    const { BD, H, w } = world(t);
    const k0 = place(BD, w, 'dark_knight', 1.4, 0, { hp: 999 });   // facing the hero
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, k0).map((x) => x.dmg), [2], 'front guard 20 % without the card');
    const { BD: B2, H: H2, w: w2 } = world(t, { hand: ['armor_break'] });
    const k = place(B2, w2, 'dark_knight', 1.4, 0, { hp: 999 });
    t.eq(B2.hero.computeStats(w2).mods.ignoreGuard, true);
    for (let i = 0; i < 7; i++) swingOnce(B2, H2, w2);
    t.eq(hitsOn(w2, k).map((x) => x.dmg), [10, 12, 13, 15, 16, 18, 18]);
    t.eq(k.statuses.sunder.n, 5);
    t.eq(w2.bus.recent(4000).filter((x) => x.event === 'vfx' && x.kind === 'armor_shards').length, 7);
    B2.cardRt.unequip(w2, 0);
    t.eq(k.statuses.sunder.n, 5, 'permanent on that enemy');
  },
  'armor_break: no cracks or multiplier on other types'(t) {
    const { BD, H, w } = world(t, { hand: ['armor_break'] });
    const g = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w); swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [10, 10]);
    t.assert(!g.statuses.sunder);
  },
  'mana_backlash: unlock at 1200 magic-type kills (GDD-V2 §8); +5 to magic; a hit mage is bound 2.5 s'(t) {
    const { BD, H, w } = world(t, { hand: ['mana_backlash'] });
    const d = BD.cards.get('mana_backlash'), s = BD.progress.fresh();
    s.counters.mageKills = 5000; s.counters.magicKills = 1199; t.eq(d.unlock(s), false); s.counters.magicKills = 1200; t.eq(d.unlock(s), true);
    const m = place(BD, w, 'mage', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, m).map((x) => x.dmg), [15]);
    t.assert(m.statuses.bind && Math.abs(m.statuses.bind.t - (2.5 - 1 / 60)) < 1e-6, 'bound 2.5 s');
    H.step(150);
    t.assert(!m.statuses.bind, 'free after 2.5 s');
    const g = place(BD, w, 'goblin', -1.2, 0, { hp: 999 });
    m.x += 6; swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [10]);
    t.assert(!g.statuses.bind);
  },
  'mana_backlash: a magic kill (any source) bursts 12 on others within 1.8u (GDD-V2 §4.4 level 1)'(t) {
    const { BD, H, w } = world(t, { hand: ['mana_backlash'] });
    const m = place(BD, w, 'mage', 3, 3, { hp: 1 });
    const near = place(BD, w, 'goblin', 3, 5.0, { hp: 999 });   // edge 1.68
    const far = place(BD, w, 'goblin', 3, 5.2, { hp: 999 });    // edge 1.88
    BD.combat.damage(w, m, 5, { source: 'burn', direct: false });
    t.assert(m.dead);
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg, x.direct]), [['burst', 12, false]]);
    t.eq(hitsOn(w, far).length, 0);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'mana_burst').length, 1);
  },
};
