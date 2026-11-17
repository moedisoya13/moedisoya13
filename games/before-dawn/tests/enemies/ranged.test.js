// Skeleton archer and mage, GDD-V2 §3.2: the archer holds its ground (stops within 6u, steps back 3u
// at most once per 6 s when the hero comes within 2u, walks again beyond 9u), its line is at most 12u;
// the mage teleports once per life at half HP, 4–6u from the hero inside the combat window, an elite
// never; the fire circle, the zone that ignites enemies, the bind, the guardian variants.
'use strict';
const { arena, pacify, until, evs } = require('./util');

const TICK = 1 / 60;
const tgOf = (w, e) => w.telegraphs.filter((t) => t.ownerId === e.id);
const DEG = Math.PI / 180;

// 16×16 room with a 1×3 wall at x = 8, y = 6..8 (blocks line of sight across the middle)
function wallCells() {
  let s = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s += x === 8 && y >= 6 && y <= 8 ? '#' : '.';
  return s;
}

module.exports = {
  'archer: line from the archer through the hero, ≤ 12u (to the wall), 0.3u wide, 0.8 s, then a 14u/s arrow for its damage (GDD-V2 8)'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, hx: 4.5, hy: 8, floor: 1 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 10.5 + 0.35, 8, {});
    e.mem.cd = 0;
    until(H, () => tgOf(w, e).length > 0, 10);
    const [tg] = tgOf(w, e);
    t.assert(tg, 'shot telegraph');
    t.eq(tg.shape, 'line'); t.near(tg.width, 0.3); t.near(tg.total, 0.8); t.eq(tg.dmg, 0); t.eq(tg.danger, true); t.eq(tg.attack, 'shot');
    t.near(tg.dir, Math.PI, 1e-6);
    t.near(tg.len, Math.min(12, tg.x), 1e-6, 'line runs to the wall at x = 0');
    const n0 = w.bus.count();
    until(H, () => w.projectiles.length > 0, 60);
    const p = w.projectiles[0];
    t.near(p.speed, 14); t.eq(p.dmg, 8); t.eq(p.kind, 'arrow'); t.near(p.r, 0.15); t.near(p.range, tg.len, 1e-9);
    const x0 = p.x; H.step(6);
    if (!p.dead) t.near(x0 - p.x, 14 * 6 * TICK, 1e-6, '14u/s');
    until(H, () => evs(w, 'hurt', n0).length > 0, 60);
    const hurt = evs(w, 'hurt', n0)[0];
    t.eq(hurt.dmg, 8); t.eq(hurt.attack, 'shot'); t.eq(hurt.source, 'skel_archer');
    // in a long room the line stops at 12u
    const b = arena(t, { w: 30, h: 10, hx: 8.2, hy: 5, floor: 1 });
    pacify(b.w);
    const f = b.BD.W.makeEnemy(b.w, 'skel_archer', 2, 5, {});
    f.mem.cd = 0;
    until(b.H, () => tgOf(b.w, f).length > 0, 10);
    t.near(tgOf(b.w, f)[0].len, 12, 1e-9, 'at most 12u (§5.6-3)');
  },
  'archer: the arrow follows the fixed line — stepping out of it after the warning avoids the hit'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, hx: 4.5, hy: 8 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 10.85, 8, {});
    e.mem.cd = 0;
    until(H, () => tgOf(w, e).length > 0, 10);
    const n0 = w.bus.count();
    H.input({ mx: 0, my: 1 }); H.step(20); H.input({ mx: 0, my: 0 });
    H.step(90);
    t.eq(evs(w, 'hurt', n0).length, 0);
  },
  'archer holds its ground: walks to within 6u, then stands and shoots from there; walks again only beyond 9u'(t) {
    const { BD, H, w } = arena(t, { w: 24, h: 12, hx: 2.5, hy: 6 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 20, 6, {});
    e.mem.cd = 99;
    until(H, () => e.mem.mode === 'hold', 600);
    const d = BD.W.edgeDist(w, e);
    t.assert(d <= 6 + 1e-6 && d >= 5, `stopped within 6u (${d.toFixed(2)})`);
    // the hero walks around at 3–8u: it stays put
    const x0 = e.x, y0 = e.y;
    for (const [hx, hy] of [[4.5, 6], [6.5, 3], [9, 9], [5, 9]]) { w.hero.x = hx; w.hero.y = hy; H.step(30); }
    t.near(e.x, x0, 1e-9, 'held its spot'); t.near(e.y, y0, 1e-9);
    e.mem.cd = 0;
    until(H, () => tgOf(w, e).length > 0, 30);
    t.near(tgOf(w, e)[0].x, x0, 1e-9, 'shoots from where it stands');
    until(H, () => !e.mem.aiming, 80); e.mem.cd = 99;
    // the hero 9.5u away: it walks again
    w.hero.x = e.x + 9.9; w.hero.y = e.y;
    H.step(20);
    t.eq(e.mem.mode, 'walk'); t.assert(e.x > x0 + 0.2, 'walks toward him');
  },
  'archer: hero within 2u → steps back 3u, at most once every 6 s'(t) {
    const { BD, H, w } = arena(t, { w: 24, h: 12, hx: 8, hy: 6 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 13, 6, {});
    e.mem.cd = 99;
    until(H, () => e.mem.mode === 'hold', 120);
    w.hero.x = e.x - 1.9; w.hero.y = e.y;
    const x0 = e.x;
    until(H, () => e.mem.mode === 'back', 3);
    t.eq(e.mem.mode, 'back');
    const tBack = w.t;
    until(H, () => e.mem.mode === 'hold', 120);
    t.near(e.x - x0, 3, 0.15, 'stepped back 3u');
    // he follows at once: no second step back before 6 s from the first
    let again = null;
    for (let i = 0; i < Math.round(7 / TICK) && again === null; i++) {
      w.hero.x = e.x - 1.9; w.hero.y = e.y; H.step(1);
      if (e.mem.mode === 'back') again = w.t - tBack;
    }
    t.assert(again !== null, 'steps back again later');
    t.near(again, 6, 3 * TICK, `the next step back 6 s after the first (${again.toFixed(2)} s)`);
  },
  'archer: with an obstacle in the way it walks to a spot with a clear line, then shoots; arrows stop at obstacles'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, cells: wallCells(), hx: 4.5, hy: 7.5 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 11.5, 7.5, {});
    e.mem.cd = 0;
    t.assert(!BD.nav.losClear(w.grid, e.x, e.y, w.hero.x, w.hero.y));
    let firstTg = null;
    for (let i = 0; i < 600 && !firstTg; i++) { H.step(1); firstTg = tgOf(w, e)[0] || null; }
    t.assert(firstTg, 'shot after repositioning');
    t.assert(BD.nav.losClear(w.grid, firstTg.x, firstTg.y, w.hero.x, w.hero.y), 'line of sight at the shot');
    const len = BD.nav.rayLen(w.grid, 11.5, 7.5, Math.PI, 40);
    t.near(len, 11.5 - 9, 1e-6);
    const p = BD.hazards.projectile(w, { owner: e, x: 11.5, y: 7.5, dir: Math.PI, speed: 14, range: 40, dmg: 8, hostile: true, kind: 'arrow', attack: 'shot' });
    H.step(30);
    t.assert(p.dead && p.blocked, 'arrow blocked by the obstacle');
  },
  'archer guardian (해골 명궁): three lines and arrows at −15°, 0°, +15°'(t) {
    const { BD, H, w } = arena(t, { w: 18, h: 18, hx: 4, hy: 9 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 10, 9, { guardian: true });
    e.mem.cd = 0;
    until(H, () => tgOf(w, e).length > 0, 10);
    const tgs = tgOf(w, e);
    t.eq(tgs.length, 3);
    const base = Math.atan2(w.hero.y - e.y, w.hero.x - e.x);
    for (const a of [base - 15 * DEG, base, base + 15 * DEG]) t.assert(tgs.some((x) => BD.math.angDiff(x.dir, a) < 1e-6), 'line at ' + (a / DEG).toFixed(0) + '°');
    for (const x of tgs) {
      t.near(x.width, 0.3 * BD.C.GUARDIAN.tg, 1e-9, 'guardian line ×1.4');
      t.near(x.len, BD.nav.rayLen(w.grid, x.x, x.y, x.dir, 12), 1e-9, 'line still ends at the wall (≤ 12u)');
    }
    until(H, () => w.projectiles.length >= 3, 80);
    t.eq(w.projectiles.filter((p) => p.ownerId === e.id).length, 3);
  },
  'mage: fire circle r 1.3 at the hero spot, 1.1 s, its damage (GDD-V2 10), then a 2.5 s zone that burns 3 per 0.5 s'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, floor: 1 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 5, w.hero.y, {});
    e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.eq(tg.shape, 'circle'); t.near(tg.r, 1.3); t.near(tg.total, 1.1); t.eq(tg.dmg, 10); t.eq(tg.attack, 'fire_circle');
    t.near(tg.x, w.hero.x, 1e-9); t.near(tg.y, w.hero.y, 1e-9);
    const n0 = w.bus.count();
    until(H, () => w.zones.length > 0, 80);
    const z = w.zones[0];
    t.near(z.r, 1.3); t.near(z.life, 2.5, 2 * TICK); t.near(z.tick, 0.5); t.eq(z.dmg, 3); t.eq(z.igniteEnemies, true); t.eq(z.attack, 'fire_zone');
    t.eq(evs(w, 'hurt', n0)[0].dmg, 10);
    e.mem.cd = 99;
    H.step(Math.round(2.6 / TICK));
    const zh = evs(w, 'hurt', n0).filter((x) => x.attack === 'fire_zone');
    t.assert(zh.length >= 2, 'zone hurts the hero standing in it');
    for (const x of zh) { t.eq(x.dmg, 3); t.eq(x.source, 'zone'); }
    t.eq(w.zones.length, 0, 'zone gone after 2.5 s');
  },
  'mage: the fire zone burns the horde — enemies inside catch fire, and their kills drop shards'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 5, w.hero.y, {});
    e.mem.cd = 99;
    const gs = [0, 1, 2].map((i) => { const g = BD.W.makeEnemy(w, 'husk', w.hero.x - 3 + i * 0.4, w.hero.y + (i - 1) * 0.4, {}); g.stunT = 1e9; return g; });
    BD.ai.zone(w, e, { kind: 'mage_fire', x: w.hero.x - 2.6, y: w.hero.y, r: 1.3, life: 2.5, tick: 0.5, dmg: 3, attack: 'fire_zone', igniteEnemies: true });
    H.step(32);
    t.assert(gs.every((g) => g.statuses.burn || g.dead), 'all three caught fire');
    const n0 = w.bus.count(), s0 = w.shards.length;
    until(H, () => gs.every((g) => g.dead), 600);
    const kills = evs(w, 'kill', n0).filter((x) => gs.some((g) => g.id === x.enemyId));
    t.eq(kills.length, 3); t.assert(kills.every((x) => x.burning), 'killed burning');
    t.assert(evs(w, 'shard_drop', n0).length >= 3 || w.shards.length >= s0 + 3, 'shards dropped');
  },
  'mage teleports once per life: the first time its HP is at half or less, a 0.4 s mark 4–6u from the hero in view, then never again'(t) {
    const { BD, H, w } = arena(t, { w: 18, h: 18 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 1.6, w.hero.y, {});
    e.mem.cd = 99;
    // near the hero but healthy: no teleport (v1 jumped away after 0.5 s within 2u)
    for (let i = 0; i < 90; i++) { e.x = w.hero.x + 1.6; e.y = w.hero.y; H.step(1); t.eq(tgOf(w, e).length, 0, 'no teleport above half HP'); }
    BD.combat.damage(w, e, e.hp - Math.floor(e.maxHp / 2), { source: 'slash', direct: true });
    t.assert(e.hp <= e.maxHp / 2);
    H.step(1);
    const mark = tgOf(w, e).find((x) => x.attack === 'blink');
    t.assert(mark, 'arrival mark at half HP');
    t.eq(mark.style, 'blink'); t.eq(mark.dmg, 0); t.near(mark.total, 0.4);
    const d = BD.math.dist(mark.x, mark.y, w.hero.x, w.hero.y);
    t.assert(d >= 4 - 1e-9 && d <= 6 + 1e-9, `arrival 4–6u from the hero (${d.toFixed(2)})`);
    t.assert(BD.W.inView(w, mark.x, mark.y), 'inside the combat window');
    const n0 = w.bus.count();
    H.step(Math.round(0.4 / TICK) + 1);
    t.near(e.x, mark.x, 0.3); t.near(e.y, mark.y, 0.3);
    t.assert(evs(w, 'vfx', n0).some((x) => x.kind === 'mage_blink'));
    BD.combat.damage(w, e, 1, { source: 'slash', direct: true });
    for (let i = 0; i < Math.round(8 / TICK); i++) { e.x = w.hero.x + 1.6; e.y = w.hero.y; H.step(1); t.eq(tgOf(w, e).filter((x) => x.attack === 'blink').length, 0, 'once per life'); }
  },
  'mage: an elite never teleports; a bound mage waits and goes when the bind ends'(t) {
    const { BD, H, w } = arena(t, { w: 18, h: 18 });
    pacify(w);
    const el = BD.W.makeEnemy(w, 'mage', w.hero.x + 1.6, w.hero.y, { elite: true });
    el.mem.cd = 99;
    BD.combat.damage(w, el, el.hp - 5, { source: 'slash', direct: true });
    for (let i = 0; i < 120; i++) { H.step(1); t.eq(tgOf(w, el).length, 0, 'elite: no teleport'); }
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x - 1.6, w.hero.y, {});
    e.mem.cd = 99;
    BD.status.apply(w, e, 'bind', { dur: 1.0 });
    BD.combat.damage(w, e, e.hp - 5, { source: 'slash', direct: true });
    let k = 0;
    for (; k < 120 && !tgOf(w, e).some((x) => x.attack === 'blink'); k++) { t.assert(e.statuses.bind || k > 0, 'bound'); H.step(1); }
    t.assert(k < 120, 'teleports after the bind');
    t.near(k * TICK, 1.0, 3 * TICK, 'when the bind ends');
  },
  'mage: walks to 4–7u from the hero'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 3, hy: 10 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', 17, 10, {});
    e.mem.cd = 99;
    H.step(420);
    const d = BD.W.edgeDist(w, e);
    t.assert(d >= 4 - 0.1 && d <= 7 + 0.1, `in band (${d.toFixed(2)})`);
  },
  'mage guardian (대마도사): three circles (hero spot, ±2.2u across the line); within 2u for 0.5 s it teleports inside the stairs zone, cooldown 6 s'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 5, w.hero.y, { guardian: true });
    e.mem.cd = 0;
    H.step(1);
    const tgs = tgOf(w, e).filter((x) => x.attack === 'fire_circle');
    t.eq(tgs.length, 3);
    const ys = tgs.map((x) => x.y - w.hero.y).sort((a, b) => a - b);
    t.near(ys[0], -2.2, 1e-6); t.near(ys[1], 0, 1e-6); t.near(ys[2], 2.2, 1e-6);
    for (const x of tgs) { t.near(x.x, w.hero.x, 1e-6); t.near(x.r, 1.3 * BD.C.GUARDIAN.tg, 1e-9); }
    e.mem.cd = 99;
    H.step(80);
    const hasMark = () => tgOf(w, e).some((x) => x.attack === 'blink');
    let k = 0;
    for (; k < 120 && !hasMark(); k++) { e.x = w.hero.x + 1.8; e.y = w.hero.y; H.step(1); }
    t.assert(hasMark(), 'guardian teleports');
    t.near(k * TICK, 0.5, 3 * TICK, 'after 0.5 s within 2u');
    const m = tgOf(w, e).find((x) => x.attack === 'blink'), b = BD.foes.box(w, e);
    t.assert(m.x >= b.x0 && m.x <= b.x1 && m.y >= b.y0 && m.y <= b.y1, 'inside the stairs zone');
    until(H, () => !hasMark(), 60);
    const t0 = w.t;
    for (let i = 0; i < Math.round(8 / TICK) && !hasMark(); i++) { e.x = w.hero.x + 1.8; e.y = w.hero.y; H.step(1); }
    t.near(w.t - t0, 6, 4 * TICK, 'guardian teleport cooldown 6 s');
  },
};
