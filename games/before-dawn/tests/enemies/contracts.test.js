// The contracts the real cards rely on from the enemy side (docs/requests/cards.md, "Criterion
// 15 and the enemies agent"), checked with the real cards against the real enemies:
//   armor_break → the dark knight's guard reads stats.mods.ignoreGuard
//   tide        → the push scales by knockScale (heavy 0.33, guardian ≤ 0.33, boss 0)
//   mana_backlash → the mage's teleport reads statuses.bind
//   holy_light / rest_of_dead → the ghoul's revive goes through def.revive and honours flags.noRevive
//   fire_pilgrimage → the mage zone ignites enemies (igniteEnemies) and hurts as source 'zone'
'use strict';
const { arena, pacify, until, evs } = require('./util');

const TICK = 1 / 60;
const firstHit = (w, id, n0, source) => evs(w, 'hit', n0).find((h) => h.enemyId === id && (!source || h.source === source));

module.exports = {
  'armor_break: a front slash on the dark knight deals 100 % (no guard event) and cracks it; without it 20 %'(t) {
    for (const withCard of [false, true]) {
      const { BD, H, w } = arena(t, { hand: withCard ? ['armor_break'] : [] });
      const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + 1.4, w.hero.y, {});
      e.face = Math.PI; e.stunT = 1e9; // facing the hero
      const n0 = w.bus.count();
      until(H, () => firstHit(w, e.id, n0, 'slash'), 60);
      pacify(w);
      const hit = firstHit(w, e.id, n0, 'slash'), base = BD.C.HERO.dmg + w.hero.radiance;
      if (withCard) {
        t.eq(hit.dmg, base, 'full damage through the guard');
        t.eq(evs(w, 'guard', n0).length, 0, 'no guard spark');
        t.eq(e.statuses.sunder && e.statuses.sunder.n, 1, 'one crack');
      } else {
        t.eq(hit.dmg, Math.max(1, Math.round(base * BD.enemies.get('dark_knight').T.guardMul)), '20 % from the front');
        t.assert(evs(w, 'guard', n0).length >= 1, 'guard event');
      }
    }
  },
  'tide: the push follows knockScale — goblin 1.2u, dark knight 0.4u, any guardian 0.4u, demon king 0'(t) {
    const cases = [['goblin', {}, 1.2], ['dark_knight', {}, 1.2 * 0.33], ['goblin', { guardian: true }, 1.2 * 0.33], ['ghoul', { guardian: true }, 1.2 * 0.33], ['demon_king', {}, 0]];
    for (const [kind, opts, want] of cases) {
      const { BD, H, w } = arena(t, { hand: ['tide'], w: 20, h: 20 });
      const r = BD.enemies.get(kind).radius * (opts.guardian ? BD.C.GUARDIAN.size : 1);
      const e = BD.W.makeEnemy(w, kind, w.hero.x + 1.0 + r, w.hero.y, opts);
      e.stunT = 1e9; // behaviour off; the engine still applies knockback to a stunned enemy
      const x0 = e.x, n0 = w.bus.count();
      until(H, () => firstHit(w, e.id, n0, 'slash'), 60);
      pacify(w);
      H.step(Math.ceil(BD.C.STATUS.knockTime / TICK) + 3);
      t.near(e.x - x0, want, 0.02, `${kind}${opts.guardian ? ' guardian' : ''} pushed ${(e.x - x0).toFixed(3)}u`);
      t.assert(e.statuses.wet, kind + ' wet');
    }
  },
  'mana_backlash: a mage the blade hits is bound — no teleport while bound, it teleports once the bind ends'(t) {
    const { BD, H, w } = arena(t, { hand: ['mana_backlash'], hx: 1.75, hy: 1.75 });
    const T = BD.enemies.get('mage').T;
    const e = BD.W.makeEnemy(w, 'mage', 0.6, 0.6, {}); // cornered: it cannot walk out of 2u
    e.mem.cd = 1e9; // no fire circles
    const n0 = w.bus.count();
    until(H, () => firstHit(w, e.id, n0, 'slash'), 30);
    pacify(w);
    t.assert(e.statuses.bind, 'bound by the hit');
    const bindLeft = e.statuses.bind.t;
    t.near(bindLeft, BD.cards.get('mana_backlash').T.bind, 3 * TICK, 'bind 2.5 s');
    // GDD-V2 §3.2: the mage's one teleport comes at half HP; bound, it waits
    if (e.hp > e.maxHp / 2) BD.combat.damage(w, e, e.hp - Math.floor(e.maxHp / 2), { source: 'burn', direct: false });
    H.step(Math.floor((e.statuses.bind.t - 0.05) / TICK));
    const blinks = () => w.bus.recent(4000).filter((x) => x.event === 'telegraph' && x.ownerId === e.id && x.attack === 'blink');
    t.eq(blinks().length, 0, 'no teleport warning while bound (at half HP all along)');
    until(H, () => !e.statuses.bind, 30);
    const k = until(H, () => blinks().length > 0, 60);
    t.assert(k >= 0, 'teleport warning once the bind is gone');
    until(H, () => BD.math.dist(e.x, e.y, w.hero.x, w.hero.y) >= T.blinkMin - 0.6, Math.ceil(T.blinkTg / TICK) + 5);
    t.assert(BD.math.dist(e.x, e.y, w.hero.x, w.hero.y) >= T.blinkMin - 0.6, 'teleported away');
  },
  'holy_light: a ghoul cut to 0 dies with kill and no down; a chain-killed ghoul stays down too'(t) {
    for (const hand of [['holy_light'], ['holy_light', 'lightning']]) {
      const { BD, H, w } = arena(t, { hand });
      const a = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
      a.stunT = 1e9;
      let b = null;
      if (hand.length === 2) { b = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y + 2.5, {}); b.stunT = 1e9; b.hp = 1; a.hp = 500; }
      else a.hp = 1;
      const n0 = w.bus.count();
      const v = b || a;
      until(H, () => v.dead, 120);
      t.assert(v.dead, 'dead');
      t.eq(evs(w, 'down', n0).filter((x) => x.enemyId === v.id).length, 0, 'no down');
      const kill = evs(w, 'kill', n0).find((x) => x.enemyId === v.id);
      t.assert(kill, 'kill event');
      if (b) t.eq(kill.source, 'chain', 'killed by the chain');
    }
  },
  'rest_of_dead (awakened): ghouls no longer rise; before awakening they still do'(t) {
    for (const awakened of [false, true]) {
      const { BD, H, w } = arena(t, { hand: ['rest_of_dead'] });
      if (awakened) { const c = BD.cardRt.get(w, 'rest_of_dead'); c.state.awakened = true; c.state.progress = c.state.goal; }
      const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
      e.hp = 1; e.stunT = 1e9;
      const n0 = w.bus.count();
      H.step(2);
      pacify(w);
      const down = evs(w, 'down', n0).some((x) => x.enemyId === e.id);
      if (awakened) { t.assert(e.dead && !down, 'killed without down'); }
      else { t.assert(down && !e.dead, 'down, will rise'); until(H, () => !e.down, 200); t.eq(e.revives, 1, 'rose'); }
    }
  },
  'fire_pilgrimage: a kill burnt by the mage fire zone counts; awakened, the zone (source zone) no longer hurts but the circle does'(t) {
    // (a) the zone sets an enemy inside alight; its burning death advances the quest
    {
      const { BD, H, w } = arena(t, { hand: ['fire_pilgrimage'], w: 16, h: 16, hx: 4, hy: 8 });
      pacify(w);
      const m = BD.W.makeEnemy(w, 'mage', 9.5, 8, {});
      m.mem.cd = 0; m.mem.blinkCdT = 1e9;
      until(H, () => w.telegraphs.some((x) => x.ownerId === m.id && x.attack === 'fire_circle'), 60);
      const tg = w.telegraphs.find((x) => x.ownerId === m.id && x.attack === 'fire_circle');
      m.mem.cd = 1e9; m.stunT = 1e9;
      H.input({ mx: 0, my: 1 }); H.step(24); H.input({ mx: 0, my: 0 }); // step out of the circle
      const g = BD.W.makeEnemy(w, 'goblin', tg.x, tg.y, {});
      g.stunT = 1e9; g.hp = 3;
      until(H, () => g.dead, 240);
      t.assert(g.dead, 'goblin died');
      const kill = w.bus.recent(4000).find((x) => x.event === 'kill' && x.enemyId === g.id);
      t.eq(kill.burning, true, 'died burning');
      t.eq(BD.cardRt.get(w, 'fire_pilgrimage').state.progress, 1, 'quest +1');
    }
    // (b) awakened: standing in the circle and the zone → the circle's hit lands, zone ticks do not
    for (const awakened of [false, true]) {
      const { BD, H, w } = arena(t, { hand: ['fire_pilgrimage'], w: 16, h: 16, hx: 4, hy: 8 });
      pacify(w);
      if (awakened) { const c = BD.cardRt.get(w, 'fire_pilgrimage'); c.state.awakened = true; c.state.progress = c.state.goal; }
      const m = BD.W.makeEnemy(w, 'mage', 9.5, 8, {});
      m.mem.cd = 0; m.mem.blinkCdT = 1e9;
      const n0 = w.bus.count();
      until(H, () => w.zones.some((z) => z.ownerId === m.id), 120);
      m.stunT = 1e9;
      until(H, () => !w.zones.some((z) => z.ownerId === m.id), 200);
      const hurts = evs(w, 'hurt', n0).filter((x) => x.enemyId === m.id);
      const circle = hurts.filter((x) => x.attack === 'fire_circle'), zone = hurts.filter((x) => x.attack === 'fire_zone');
      t.eq(circle.length, 1, 'circle hit'); t.eq(circle[0].source, 'mage');
      if (awakened) t.eq(zone.length, 0, 'no zone damage when immune');
      else { t.assert(zone.length >= 2, 'zone ticks hurt'); for (const z of zone) t.eq(z.source, 'zone'); }
    }
  },
};
