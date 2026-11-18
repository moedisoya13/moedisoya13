// TEST-ONLY stand-ins for the enemies the cards interact with but that the enemies agent
// ships (ghoul, dark_knight, mage, skel_archer). Loaded by tests/cards via t.load({extraFiles}).
// Each registers only when the real enemy is absent, so after the merge the card tests run
// against the real enemies. They implement just the contract the cards rely on
// (ARCHITECTURE §3.3 / §4.1, GDD §6.2) and have no behaviour (tests stun them anyway).
const M = BD.math;

if (!BD.enemies.has('ghoul')) BD.enemies.register({
  id: 'ghoul', name: '구울', type: 'undead', sprite: 'ghoul',
  hp: 60, speed: 2.4, dmg: 14, radius: 0.45, cost: 3,
  attacks: { lunge: { name: '달려들기' } },
  revive(e) { return { delay: 2.5, hp: 30, corpseHp: 20 }; },
  update() {},
});

if (!BD.enemies.has('skel_archer')) BD.enemies.register({
  id: 'skel_archer', name: '해골 궁수', type: 'undead', sprite: 'skeleton_archer',
  hp: 25, speed: 2.6, dmg: 9, radius: 0.35, cost: 1.5,
  attacks: { shot: { name: '사격' } },
  update() {},
});

if (!BD.enemies.has('mage')) BD.enemies.register({
  id: 'mage', name: '마도사', type: 'magic', sprite: 'mage',
  hp: 40, speed: 2.0, dmg: 12, radius: 0.35, cost: 2.5,
  attacks: { fire_circle: { name: '불 원' }, fire_zone: { name: '불 장판' } },
  update() {},
});

// front guard: direct hits from the front 120° take 20 % unless a card sets mods.ignoreGuard
if (!BD.enemies.has('dark_knight')) BD.enemies.register({
  id: 'dark_knight', name: '암흑기사', type: 'heavy', sprite: 'dark_knight',
  hp: 120, speed: 2.0, dmg: 20, radius: 0.55, cost: 6, knockScale: 0.33,
  attacks: { charge: { name: '돌격' } },
  defense(e, w, info) {
    if (!info.direct || w.hero.stats.mods.ignoreGuard) return 1;
    const from = Math.atan2(info.fromY - e.y, info.fromX - e.x);
    return M.angDiff(from, e.face) <= 60 * M.DEG ? 0.2 : 1;
  },
  update() {},
});
