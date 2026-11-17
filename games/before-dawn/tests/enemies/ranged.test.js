// Skeleton archer and mage: range keeping, line of sight, shot and fire-circle telegraphs,
// arrows, the fire zone that ignites enemies, teleport, bind, the guardian variants (GDD §6.2–6.3).
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
  'archer: line from the archer through the hero to the wall, 0.3u wide, 0.8 s, then a 14u/s arrow for 9'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, hx: 4.5, hy: 8 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 10.5 + 0.35, 8, {});
    e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.assert(tg, 'shot telegraph');
    t.eq(tg.shape, 'line'); t.near(tg.width, 0.3); t.near(tg.total, 0.8); t.eq(tg.dmg, 0); t.eq(tg.danger, true); t.eq(tg.attack, 'shot');
    t.near(tg.dir, Math.PI, 1e-6);
    t.near(tg.len, tg.x, 1e-6, 'line runs to the wall at x = 0');
    const n0 = w.bus.count();
    until(H, () => w.projectiles.length > 0, 60);
    const p = w.projectiles[0];
    t.near(p.speed, 14); t.eq(p.dmg, 9); t.eq(p.kind, 'arrow'); t.near(p.r, 0.15);
    const x0 = p.x; H.step(6);
    if (!p.dead) t.near(x0 - p.x, 14 * 6 * TICK, 1e-6, '14u/s');
    until(H, () => evs(w, 'hurt', n0).length > 0, 60);
    const hurt = evs(w, 'hurt', n0)[0];
    t.eq(hurt.dmg, 9); t.eq(hurt.attack, 'shot'); t.eq(hurt.source, 'skel_archer');
  },
  'archer: the arrow follows the fixed line — stepping out of it after the warning avoids the hit'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, hx: 4.5, hy: 8 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 10.85, 8, {});
    e.mem.cd = 0;
    H.step(1);
    const n0 = w.bus.count();
    H.input({ mx: 0, my: 1 }); H.step(20); H.input({ mx: 0, my: 0 });
    H.step(90);
    t.eq(evs(w, 'hurt', n0).length, 0);
  },
  'archer: keeps 5–7u — closes from far, backs off when the hero is inside 3.5u'(t) {
    {
      const { BD, H, w } = arena(t, { w: 20, h: 20, hx: 2.5, hy: 10 });
      pacify(w);
      const e = BD.W.makeEnemy(w, 'skel_archer', 17, 10, {});
      e.mem.cd = 99;
      H.step(300);
      const d = BD.W.edgeDist(w, e);
      t.assert(d <= 7 + 0.05 && d >= 5 - 0.05, `closed to the 5–7u band (${d.toFixed(2)})`);
    }
    {
      const { BD, H, w } = arena(t, { w: 20, h: 20 });
      pacify(w);
      const e = BD.W.makeEnemy(w, 'skel_archer', w.hero.x + 2.5, w.hero.y + 0.5, {});
      e.mem.cd = 0;
      H.step(1);
      t.eq(tgOf(w, e).length, 0, 'no shot while backing off');
      H.step(150);
      t.assert(BD.W.edgeDist(w, e) >= 5 - 0.05, 'backed off to 5u');
    }
  },
  'archer: with an obstacle in the way it walks to a spot with a clear line, then shoots; arrows stop at obstacles'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16, cells: wallCells(), hx: 4.5, hy: 7.5 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 11.5, 7.5, {});
    e.mem.cd = 0;
    t.assert(!BD.nav.losClear(w.grid, e.x, e.y, w.hero.x, w.hero.y));
    let firstTg = null;
    for (let i = 0; i < 600 && !firstTg; i++) {
      H.step(1);
      const tg = tgOf(w, e)[0];
      if (tg) firstTg = tg;
      else t.assert(true);
    }
    t.assert(firstTg, 'shot after repositioning');
    t.assert(BD.nav.losClear(w.grid, firstTg.x, firstTg.y, w.hero.x, w.hero.y), 'line of sight at the shot');
    // a shot straight at the wall: the line ends at the obstacle
    const len = BD.nav.rayLen(w.grid, 11.5, 7.5, Math.PI, 40);
    t.near(len, 11.5 - 9, 1e-6);
    const p = BD.hazards.projectile(w, { owner: e, x: 11.5, y: 7.5, dir: Math.PI, speed: 14, range: 40, dmg: 9, hostile: true, kind: 'arrow', attack: 'shot' });
    H.step(30);
    t.assert(p.dead && p.blocked, 'arrow blocked by the obstacle');
  },
  'archer guardian (해골 명궁): three lines and arrows at −15°, 0°, +15°'(t) {
    const { BD, H, w } = arena(t, { w: 18, h: 18, hx: 4, hy: 9 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'skel_archer', 11, 9, { guardian: true });
    e.mem.cd = 0;
    H.step(1);
    const tgs = tgOf(w, e);
    t.eq(tgs.length, 3);
    const base = Math.atan2(w.hero.y - e.y, w.hero.x - e.x);
    for (const a of [base - 15 * DEG, base, base + 15 * DEG]) t.assert(tgs.some((x) => BD.math.angDiff(x.dir, a) < 1e-6), 'line at ' + (a / DEG).toFixed(0) + '°');
    for (const x of tgs) t.near(x.width, 0.3 * BD.C.GUARDIAN.tg, 1e-9, 'guardian line ×1.4');
    until(H, () => w.projectiles.length >= 3, 80);
    t.eq(w.projectiles.filter((p) => p.ownerId === e.id).length, 3);
  },
  'mage: fire circle r 1.3 at the hero spot, 0.9 s, 12 dmg, then a 2.5 s zone that burns 3 per 0.5 s'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 5, w.hero.y, {});
    e.mem.cd = 0;
    H.step(1);
    const [tg] = tgOf(w, e);
    t.eq(tg.shape, 'circle'); t.near(tg.r, 1.3); t.near(tg.total, 0.9); t.eq(tg.dmg, 12); t.eq(tg.attack, 'fire_circle');
    t.near(tg.x, w.hero.x, 1e-9); t.near(tg.y, w.hero.y, 1e-9);
    const n0 = w.bus.count();
    until(H, () => w.zones.length > 0, 80);
    const z = w.zones[0];
    t.near(z.r, 1.3); t.near(z.life, 2.5, 2 * TICK); t.near(z.tick, 0.5); t.eq(z.dmg, 3); t.eq(z.igniteEnemies, true); t.eq(z.attack, 'fire_zone');
    t.eq(evs(w, 'hurt', n0)[0].dmg, 12);
    e.mem.cd = 99;
    H.step(Math.round(2.6 / TICK));
    const zh = evs(w, 'hurt', n0).filter((x) => x.attack === 'fire_zone');
    t.assert(zh.length >= 2, 'zone hurts the hero standing in it');
    for (const x of zh) { t.eq(x.dmg, 3); t.eq(x.source, 'zone'); }
    t.eq(w.zones.length, 0, 'zone gone after 2.5 s');
  },
  'mage: an enemy inside the fire zone catches fire (kill reports burning)'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 5, w.hero.y, {});
    e.mem.cd = 99;
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x - 3, w.hero.y, {});
    g.stunT = 1e9;
    BD.ai.zone(w, e, { kind: 'mage_fire', x: g.x, y: g.y, r: 1.3, life: 2.5, tick: 0.5, dmg: 3, attack: 'fire_zone', igniteEnemies: true });
    H.step(32);
    t.assert(g.statuses.burn, 'goblin burning');
    g.hp = 1;
    const n0 = w.bus.count();
    until(H, () => g.dead, 120);
    t.eq(evs(w, 'kill', n0)[0].burning, true);
  },
  'mage: hero within 2u for 0.5 s → arrival mark 0.4 s ≥ 6u from the hero → teleport; 5 s before the next'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 1.6, w.hero.y, {});
    e.mem.cd = 99; e.stunT = 0;
    let k = 0, mark = null;
    for (; k < 120 && !mark; k++) { e.x = w.hero.x + 1.6; e.y = w.hero.y; H.step(1); mark = tgOf(w, e).find((x) => x.attack === 'blink'); }
    t.assert(mark, 'arrival mark');
    t.near(k * TICK, 0.5, 3 * TICK, 'after 0.5 s within 2u');
    t.eq(mark.style, 'blink'); t.eq(mark.dmg, 0); t.near(mark.total, 0.4);
    t.assert(BD.math.dist(mark.x, mark.y, w.hero.x, w.hero.y) >= 6, 'arrival ≥ 6u from the hero');
    const n0 = w.bus.count();
    H.step(Math.round(0.4 / TICK) + 1);
    t.near(e.x, mark.x, 0.3); t.near(e.y, mark.y, 0.3);
    t.assert(evs(w, 'vfx', n0).some((x) => x.kind === 'mage_blink'));
    // within 2u again at once: no teleport for 5 s
    let again = -1;
    for (let i = 0; i < Math.round(6 / TICK); i++) {
      e.x = w.hero.x + 1.6; e.y = w.hero.y; H.step(1);
      if (tgOf(w, e).some((x) => x.attack === 'blink')) { again = i; break; }
    }
    t.assert(again > 0, 'teleports again later');
    t.near(again * TICK, 5, 4 * TICK, 'teleport cooldown 5 s');
  },
  'mage: bound (mana_backlash bind) → no teleport'(t) {
    const { BD, H, w } = arena(t, { w: 16, h: 16 });
    pacify(w);
    const e = BD.W.makeEnemy(w, 'mage', w.hero.x + 1.6, w.hero.y, {});
    e.mem.cd = 99;
    BD.status.apply(w, e, 'bind', { dur: 2.5 });
    for (let i = 0; i < 120; i++) { e.x = w.hero.x + 1.6; e.y = w.hero.y; H.step(1); t.eq(tgOf(w, e).length, 0, 'no arrival mark while bound'); }
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
  'mage guardian (대마도사): three circles (hero spot, ±2.2u across the line), teleport cooldown 4 s'(t) {
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
    t.eq(BD.enemies.get('mage').T.guardianBlinkCd, 4);
    e.mem.cd = 99;
    H.step(80);
    const hasMark = () => tgOf(w, e).some((x) => x.attack === 'blink');
    for (let k = 0; k < 120 && !hasMark(); k++) { e.x = w.hero.x + 1.8; e.y = w.hero.y; H.step(1); }
    t.assert(hasMark(), 'guardian teleports');
    until(H, () => !hasMark(), 60);
    const t0 = w.t;
    for (let i = 0; i < Math.round(6 / TICK) && !hasMark(); i++) { e.x = w.hero.x + 1.8; e.y = w.hero.y; H.step(1); }
    t.near(w.t - t0, 4, 4 * TICK, 'guardian teleport cooldown 4 s');
  },
};
