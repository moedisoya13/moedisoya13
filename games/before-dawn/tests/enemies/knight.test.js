// Dark knight: front guard (20 % on direct hits within ±60°, `guard` event; indirect sources and
// mods.ignoreGuard pass), 100°/s turning, the charge (trigger, rectangle, speed, damage, opening,
// wall stun, cooldown) and the guardian's 7u charge + sweep (GDD §6.2–6.3).
'use strict';
const { arena, pacify, until, evs, dmgOf } = require('./util');

const TICK = 1 / 60;
const DEG = Math.PI / 180;
const tgOf = (w, e) => w.telegraphs.filter((t) => t.ownerId === e.id);

function slashOn(t, opts) {
  const { BD, H, w } = arena(t, { hand: opts.hand || [] });
  const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + 1.4, w.hero.y, {});
  e.face = opts.face; e.stunT = 1e9;
  const n0 = w.bus.count();
  H.step(1);
  const hit = evs(w, 'hit', n0).find((x) => x.enemyId === e.id && x.source === 'slash');
  return { BD, w, e, hit, guards: evs(w, 'guard', n0) };
}

module.exports = {
  'front guard: a slash from the front deals 20 % with a guard event; from behind 100 %'(t) {
    const base = 10 + 1; // floor 2: radiance 1
    const f = slashOn(t, { face: Math.PI });
    t.eq(f.hit.dmg, Math.round(base * 0.2));
    t.eq(f.guards.length, 1); t.eq(f.guards[0].enemyId, f.e.id);
    const b = slashOn(t, { face: 0 });
    t.eq(b.hit.dmg, base); t.eq(b.guards.length, 0);
    // edge of the guard: 59° off the facing still guarded, 61° not
    t.eq(slashOn(t, { face: Math.PI - 59 * DEG }).hit.dmg, Math.round(base * 0.2));
    t.eq(slashOn(t, { face: Math.PI - 61 * DEG }).hit.dmg, base);
  },
  'front guard: mods.ignoreGuard (armor_break) gets full damage from the front'(t) {
    const f = slashOn(t, { face: Math.PI, hand: ['armor_break'] });
    t.eq(f.hit.dmg, 11); t.eq(f.guards.length, 0);
  },
  'front guard: burn, chain, burst, steam, slam ignore it; dash is direct and guarded'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + 1.4, w.hero.y, {});
    e.face = Math.PI; e.stunT = 1e9;
    for (const src of ['burn', 'chain', 'burst', 'steam', 'slam']) t.eq(BD.combat.damage(w, e, 10, { source: src, direct: false }), 10, src);
    t.eq(BD.combat.damage(w, e, 5, { source: 'dash', direct: true, fromX: w.hero.x, fromY: w.hero.y }), 1, 'dash from the front');
    t.eq(BD.combat.damage(w, e, 5, { source: 'dash', direct: true, fromX: e.x + 1, fromY: e.y }), 5, 'dash from behind');
    void H;
  },
  'turns at 100°/s toward the hero'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + 3, w.hero.y, {});
    e.face = 0; e.mem.cd = 99;
    H.step(30);
    t.near(Math.abs(BD.math.wrap(e.face)) / DEG, 50, 1.0, '50° in 0.5 s');
  },
  'charge: only within 5u and inside the front 60°'(t) {
    {
      const { BD, H, w } = arena(t, { w: 20, h: 20 });
      pacify(w);
      const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + Math.cos(45 * DEG) * 3.5, w.hero.y + Math.sin(45 * DEG) * 3.5, {});
      e.face = Math.PI; e.mem.cd = 0; // hero is 45° off the facing
      H.step(1);
      t.eq(tgOf(w, e).length, 0, 'not outside ±30°');
    }
    {
      const { BD, H, w } = arena(t, { w: 20, h: 20 });
      pacify(w);
      const e = BD.W.makeEnemy(w, 'dark_knight', w.hero.x + 5.55 + 0.6, w.hero.y, {});
      e.face = Math.PI; e.mem.cd = 0;
      H.step(1);
      t.eq(tgOf(w, e).length, 0, 'not beyond 5u');
    }
  },
  'charge: 1.4 × 5u rectangle, 0.9 s, runs at 10u/s for its damage (GDD-V2 18), 1.4 s opening (no turn, no move), 3.5 s cooldown'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 6, hy: 10, floor: 1 });
    pacify(w);
    const T = BD.enemies.get('dark_knight').T;
    const e = BD.W.makeEnemy(w, 'dark_knight', 9.5, 10, {});
    e.face = Math.PI; e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.eq(tg.shape, 'line'); t.near(tg.width, 1.4); t.near(tg.len, 5); t.near(tg.total, 0.9); t.eq(tg.dmg, 0); t.eq(tg.danger, true); t.eq(tg.attack, 'charge');
    const n0 = w.bus.count();
    until(H, () => e.lunge, 80);
    const x0 = e.x; H.step(1); const x1 = e.x; H.step(1);
    t.near((x0 - e.x) / (2 * TICK), 10, 0.3, '10u/s'); void x1;
    until(H, () => !e.lunge, 60);
    t.near(9.5 - e.x, 5 - 0.7, 0.05, 'ran 5u minus the body radius (stays inside the warning)');
    const hurt = evs(w, 'hurt', n0)[0];
    t.eq(hurt.dmg, dmgOf(BD, w, 'dark_knight')); t.eq(hurt.attack, 'charge'); t.eq(hurt.source, 'dark_knight');
    const fire = w.t - (5 - 0.7) / 10;
    H.step(1);
    const xs = e.x, fs = e.face;
    w.hero.x = 15; w.hero.y = 15; // walk behind it: it cannot turn during the opening
    H.step(Math.round((T.recover - 0.1) / TICK));
    t.eq(e.state, 'recover'); t.near(e.x, xs, 1e-9); t.near(e.face, fs, 1e-9);
    H.step(12);
    t.assert(e.state !== 'recover', 'opening over after 1.4 s');
    w.hero.x = e.x - 3; w.hero.y = e.y; e.face = Math.PI;
    until(H, () => tgOf(w, e).length > 0, 400);
    t.near(w.t - fire, T.cd, 0.1, 'next charge 3.5 s after the last');
  },
  'charge into a wall: 2.8 s opening'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 2.2, hy: 10 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'dark_knight', 4.6, 10, {});
    e.face = Math.PI; e.mem.cd = 0;
    H.step(1);
    t.eq(tgOf(w, e).length, 1);
    t.near(tgOf(w, e)[0].len, 4.6, 0.06, 'the warning stops at the wall');
    H.input({ mx: 0, my: 1 }); H.step(30); H.input({ mx: 0, my: 0 }); // step out of the lane
    const n0 = w.bus.count();
    until(H, () => e.stunT > 0, 120);
    t.near(e.stunT, 2.8, 2 * TICK, 'stunned 2.8 s');
    t.near(e.x, e.r, 0.05, 'stopped at the wall');
    t.assert(evs(w, 'vfx', n0).some((x) => x.kind === 'knight_slam'));
  },
  'charge whose shoulder meets an obstacle: the warning ends where the body stops; slam, 2.8 s'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 6.0, hy: 10.5 });
    pacify(w);
    w.grid.set(5, 8, BD.CELL.SOLID); w.field = null; w.fieldCell = -1; // one desk cell left of the lane
    const e = BD.W.makeEnemy(w, 'dark_knight', 6.2, 5.0, { guardian: true });
    e.face = Math.PI / 2; e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.assert(tg && tg.attack === 'charge', 'charge warning');
    const hb = tg.width / 2;
    t.assert(tg.len < 7 - 2, `warning cut short by the desk (len ${tg.len.toFixed(2)})`);
    // the centre line itself is clear: only the 0.88u-wide body meets the desk
    t.assert(BD.nav.rayLen(w.grid, tg.x, tg.y, tg.dir, 7) >= 7 - 1e-6, 'centre line clear');
    H.input({ mx: 1, my: 0 }); H.step(24); H.input({ mx: 0, my: 0 }); // step out of the lane
    until(H, () => e.stunT > 0, 120);
    t.near(e.stunT, 2.8, 2 * TICK, 'slammed: 2.8 s opening');
    const along = (e.x - tg.x) * Math.cos(tg.dir) + (e.y - tg.y) * Math.sin(tg.dir);
    t.assert(along + hb <= tg.len + 0.1 && along + hb >= tg.len - 0.15, `stopped at the end of the warning (front ${(along + hb).toFixed(2)} vs len ${tg.len.toFixed(2)})`);
  },
  'guardian (암흑기사 단장): 7u charge, then a radius-2.2 sweep (0.6 s, its damage × 1.3)'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 8, hy: 10 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'dark_knight', 12, 10, { guardian: true });
    e.face = Math.PI; e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.near(tg.len, 7); t.near(tg.width, 1.4 * BD.C.GUARDIAN.tg, 1e-9);
    until(H, () => e.lunge, 80);
    until(H, () => !e.lunge, 80);
    H.step(1);
    const sw = tgOf(w, e).find((x) => x.attack === 'sweep');
    t.assert(sw, 'sweep after the charge');
    t.eq(sw.shape, 'circle'); t.near(sw.r, 2.2); t.near(sw.total, 0.6); t.eq(sw.dmg, Math.round(BD.enemies.get('dark_knight').dmg * 1.3));
    t.near(sw.x, e.x, 1e-9);
  },
};
