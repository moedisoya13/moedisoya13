// Slime, goblin and ghoul: movement, attack telegraph shape and timing, damage, recovery,
// cooldown, the ghoul's fall / rise and the ways to stop it (GDD §6.2).
'use strict';
const { arena, pacify, until, evs } = require('./util');

const TICK = 1 / 60;
const tgOf = (w, e) => w.telegraphs.filter((t) => t.ownerId === e.id);

module.exports = {
  'slime: pounce circle r 0.9 at the hero spot, 0.7 s, lands there for its damage (GDD 10, tuned 12), flat 0.8 s, next pounce ≥ 2.2 s later'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    const T = BD.enemies.get('slime').T;
    const e = BD.W.makeEnemy(w, 'slime', w.hero.x + 2.4, w.hero.y, {});
    H.step(1);
    const [tg] = tgOf(w, e);
    t.assert(tg, 'pounce telegraph');
    t.eq(tg.shape, 'circle'); t.near(tg.r, T.tgR); t.near(tg.total, T.tgTime); t.eq(tg.dmg, BD.enemies.get('slime').dmg); t.eq(tg.attack, 'pounce');
    t.near(tg.x, w.hero.x, 1e-9); t.near(tg.y, w.hero.y, 1e-9);
    const n0 = w.bus.count();
    const k = until(H, () => evs(w, 'hurt', n0).length > 0, 120);
    t.near(k * TICK, T.tgTime - TICK, 2 * TICK, 'hit when the fill completes');
    const hurt = evs(w, 'hurt', n0)[0];
    t.eq(hurt.dmg, BD.enemies.get('slime').dmg); t.eq(hurt.attack, 'pounce'); t.eq(hurt.source, 'slime');
    t.assert(BD.math.dist(e.x, e.y, tg.x, tg.y) < 0.6, 'landed on the warned spot');
    H.step(2);
    t.eq(e.state, 'flat');
    const x0 = e.x, y0 = e.y;
    H.step(Math.round((T.flat - 0.1) / TICK));
    t.eq(e.state, 'flat'); t.near(e.x, x0, 1e-9); t.near(e.y, y0, 1e-9);
    const fired = w.t;
    until(H, () => tgOf(w, e).length > 0, 600);
    t.assert(w.t - fired >= T.cd - T.flat - 0.1 - 1e-6, `next pounce after the 2.2 s wait (gap ${(w.t - fired).toFixed(2)} after flat)`);
  },
  'slime: hops 1.6u every 1.1 s and stands still between hops'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 2, hy: 10 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'slime', 17, 10, {});
    e.mem.hopT = 0;
    H.step(1);
    const x0 = e.x;
    H.step(Math.round(1.1 / TICK) - 1);
    t.near(x0 - e.x, 1.6, 0.15, 'one hop');
    // standing still in the second half of the cycle
    H.step(Math.round(0.5 / TICK));
    const x1 = e.x; H.step(Math.round(0.2 / TICK));
    t.near(e.x, x1, 1e-9, 'still between hops');
  },
  'goblin: stab fan 60° r 1.3, 0.45 s, its damage (GDD 6, tuned 7), backs off 1.2u in 0.3 s, waits 1.6 s'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    const T = BD.enemies.get('goblin').T;
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.25, w.hero.y, {});
    e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.eq(tg.shape, 'fan'); t.near(tg.half, 30); t.near(tg.r, 1.3); t.near(tg.total, 0.45); t.eq(tg.dmg, BD.enemies.get('goblin').dmg); t.eq(tg.attack, 'stab');
    const n0 = w.bus.count();
    until(H, () => evs(w, 'hurt', n0).length > 0, 60);
    t.eq(evs(w, 'hurt', n0)[0].dmg, BD.enemies.get('goblin').dmg);
    const d0 = BD.math.dist(e.x, e.y, w.hero.x, w.hero.y);
    H.step(Math.round(T.backTime / TICK) + 1);
    t.near(BD.math.dist(e.x, e.y, w.hero.x, w.hero.y) - d0, 1.2, 0.15, 'backed off 1.2u');
    const fire = w.t;
    until(H, () => tgOf(w, e).length > 0, 300);
    t.assert(w.t - fire >= T.cd - 0.31 - 1e-6, 'cooldown 1.6 s');
  },
  'goblins spread around the hero instead of lining up'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const gs = [];
    for (let i = 0; i < 4; i++) { const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 5 + i * 0.4, w.hero.y + (i - 1.5) * 0.3, {}); g.mem.cd = 99; gs.push(g); }
    H.step(240);
    const b = gs.map((g) => Math.atan2(g.y - w.hero.y, g.x - w.hero.x)).sort((a, c) => a - c);
    let minGap = Infinity;
    for (let i = 0; i < b.length; i++) minGap = Math.min(minGap, BD.math.angDiff(b[i], b[(i + 1) % b.length]));
    t.assert(minGap > 0.5, `bearings spread (min gap ${(minGap / BD.math.DEG).toFixed(0)}°)`);
    for (const g of gs) t.assert(BD.W.edgeDist(w, g) >= 0.8 - 1e-6, 'keep-out');
  },
  'ghoul: lunge fan 90° r 2.0, 0.6 s, 14 dmg, leaps 1.5u forward, waits 2.0 s'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    const T = BD.enemies.get('ghoul').T;
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 2.3, w.hero.y, {});
    e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.eq(tg.shape, 'fan'); t.near(tg.half, 45); t.near(tg.r, 2.0); t.near(tg.total, 0.6); t.eq(tg.dmg, 14); t.eq(tg.attack, 'lunge');
    const x0 = e.x, hx = w.hero.x, n0 = w.bus.count();
    until(H, () => evs(w, 'hurt', n0).length > 0, 60);
    t.eq(evs(w, 'hurt', n0)[0].dmg, 14);
    H.step(Math.round(T.leapTime / TICK) + 2);
    t.near(x0 - e.x, 1.5, 0.05, 'leapt 1.5u toward the hero');
    t.assert(e.x - e.r - hx < 0.8, 'the leap lands inside the 0.8u ring around where the hero stood (walking never does)');
    const fire = w.t - T.leapTime;
    until(H, () => tgOf(w, e).length > 0, 400);
    t.assert(w.t - fire >= T.cd - 2 * TICK, 'cooldown 2.0 s');
  },
  'ghoul: falls (down), corpse HP 20, rises after 2.5 s with T.reviveHp (GDD 30, tuned 60), the second death is final'(t) {
    const { BD, H, w } = arena(t);
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
    e.hp = 1; e.stunT = 1e9;
    const n0 = w.bus.count();
    H.step(2);
    t.eq(evs(w, 'down', n0).map((x) => x.enemyId), [e.id]);
    t.eq(evs(w, 'kill', n0).length, 0);
    t.assert(e.down && !e.dead); t.eq(e.hp, 20);
    pacify(w);
    const k = until(H, () => !e.down, 400);
    t.near(k * TICK, 2.5, 2 * TICK, 'rises 2.5 s after falling');
    t.eq(e.hp, BD.enemies.get('ghoul').T.reviveHp); t.eq(evs(w, 'revive', n0).length, 1);
    e.hp = 1; w.hero.atkTimer = 0;
    H.step(2);
    t.assert(e.dead, 'second death');
    t.eq(evs(w, 'down', n0).length, 1); t.eq(evs(w, 'kill', n0).length, 1);
  },
  'ghoul: cutting the corpse to 0 kills it for good'(t) {
    const { BD, H, w } = arena(t);
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
    e.hp = 1; e.stunT = 1e9;
    const n0 = w.bus.count();
    until(H, () => e.dead, 200); // the corpse is the only target: the hero keeps cutting it
    t.assert(e.dead); t.eq(e.revives, 0);
    t.eq(evs(w, 'down', n0).length, 1); t.eq(evs(w, 'kill', n0).length, 1); t.eq(evs(w, 'revive', n0).length, 0);
    t.assert(w.t < 2.5, 'finished before it could rise');
  },
  'ghoul: burning when it falls → killed without down; noRevive flag → killed without down'(t) {
    for (const how of ['burn', 'flag']) {
      const { BD, H, w } = arena(t);
      const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
      e.hp = 1; e.stunT = 1e9;
      if (how === 'burn') BD.status.apply(w, e, 'burn', { direct: true }); else e.flags.noRevive = true;
      const n0 = w.bus.count();
      H.step(2);
      t.assert(e.dead, how);
      t.eq(evs(w, 'down', n0).length, 0, how);
      const kill = evs(w, 'kill', n0)[0];
      t.eq(kill.enemyId, e.id);
      if (how === 'burn') t.eq(kill.burning, true);
    }
  },
  'ghoul: noRevive set on a corpse (holy light on the body) kills it the next tick'(t) {
    const { BD, H, w } = arena(t);
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.2, w.hero.y, {});
    e.hp = 1; e.stunT = 1e9;
    H.step(2);
    pacify(w);
    t.assert(e.down);
    e.flags.noRevive = true;
    H.step(1);
    t.assert(e.dead);
  },
  'ghoul guardian (구울 폭군): rises once with 50 % of its maximum HP'(t) {
    const { BD, H, w } = arena(t, { floor: 3 });
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x + 1.6, w.hero.y, { guardian: true });
    t.eq(e.maxHp, BD.C.GUARDIAN.hp[3]);
    e.hp = 1; e.stunT = 1e9;
    H.step(2);
    t.assert(e.down);
    pacify(w);
    until(H, () => !e.down, 400);
    t.eq(e.hp, Math.round(e.maxHp * 0.5));
    t.eq(BD.enemies.get('ghoul').revive(Object.assign({}, e, { revives: 1 }), w), null, 'only once');
  },
};
