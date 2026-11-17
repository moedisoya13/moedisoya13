// GDD-V2 §3 rules that span enemy kinds: the 1F goblin's one swing, the on-screen rule (§5.6-1),
// friendly fire from enemy area attacks (§3.2), the slime's split, the caps (§3.7), threats first in
// the attack slots (§3.5), the director's elites (§3.6), the guardian's box, the horde mixes on real
// floors, and the API the floor tasks use (BD.foes).
'use strict';
const { arena, pacify, until, evs, living } = require('./util');

const TICK = 1 / 60;
const tgOf = (w, e) => w.telegraphs.filter((t) => t.ownerId === e.id);

// A v2 run on floor n (its real 48 × 48 floor), level 1, every enemy removed, the hero at (x, y).
function bigFloor(t, o) {
  const BD = t.load(), H = BD.harness();
  H.start({ seed: o.seed || 1, hand: [], floor: o.floor || 2, level: 1 });
  const w = H.world();
  for (const e of w.enemies.slice()) BD.W.removeEnemy(w, e, 'recycle');
  w.freezeT = 0;
  if (o.calm !== false) H.calm();
  if (o.x !== undefined) { w.hero.x = o.x; w.hero.y = o.y; BD.view.snapCam(w); }
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
}
// seed whose floor n has domType `type`
function seedFor(BD, n, type) { for (let s = 1; s < 200; s++) if (BD.gen.run(s, 0).floors[n].domType === type) return s; return null; }

module.exports = {
  '1F goblin (§3.2): one swing of the radiance-0 blade kills it; it is slower than the hero'(t) {
    const { BD, H, w } = arena(t, { floor: 1 });
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.5, w.hero.y, {});
    g.mem.cd = 99;
    t.eq(w.hero.radiance, 0); t.eq(g.hp, 10);
    const n0 = w.bus.count();
    until(H, () => evs(w, 'swing', n0).length > 0, 120);
    H.step(1);
    t.assert(g.dead, 'dead after one swing');
    t.eq(evs(w, 'swing', n0).length, 1);
    t.assert(BD.enemies.get('goblin').speed < BD.C.HERO.speed, 'slower than the hero');
    for (const k of ['husk', 'mana_slime', 'squire', 'slimelet']) t.assert(BD.enemies.get(k).speed < BD.C.HERO.speed, k + ' slower than the hero');
  },
  'on-screen rule (§5.6-1): an enemy outside the combat window starts no attack; inside, only after 0.5 s; its warnings are never unseen'(t) {
    const { BD, H, w } = bigFloor(t, { floor: 2, x: 24.5, y: 24.5 });
    pacify(w);
    // a mage 9u away along the screen's vertical, just below the combat window (its cast range is 9u)
    const m = BD.W.makeEnemy(w, 'mage', w.hero.x + 6.4, w.hero.y + 6.4, {});
    m.mem.cd = 0;
    t.assert(!BD.W.inView(w, m.x, m.y) && BD.W.onScreen(w, m.x, m.y), 'in S, below C');
    t.assert(BD.W.edgeDist(w, m) <= m.def.T.castMax, 'within its cast range');
    let started = null;
    for (let i = 0; i < 600 && !started; i++) {
      H.step(1);
      const tg = tgOf(w, m).find((x) => x.attack === 'fire_circle');
      if (tg) started = { tg, viewT: m.viewT, inView: BD.W.inView(w, m.x, m.y) };
    }
    t.assert(started, 'it walks in and casts');
    t.assert(started.inView, 'cast from inside the combat window');
    t.assert(started.viewT >= 0.5 - 1e-9, 'after 0.5 s inside (' + started.viewT.toFixed(2) + ')');
    t.eq(started.tg.unseen, false);
    // fodder also wait 0.5 s next to the hero
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.3, w.hero.y, {});
    g.mem.cd = 0;
    const k = until(H, () => tgOf(w, g).length > 0, 120);
    t.near(k * TICK, 0.5, 3 * TICK, 'fodder: 0.5 s near the hero first');
  },
  'friendly fire: the dark knight\'s charge hits every enemy in its way once — 30 foe damage, thrown 1u aside; kills drop shards'(t) {
    const { BD, H, w } = arena(t, { w: 20, h: 12, hx: 4, hy: 6, floor: 1 });
    pacify(w); w.hero.invuln = 1e9;
    const k = BD.W.makeEnemy(w, 'dark_knight', 10, 6, {});
    k.face = Math.PI; k.mem.cd = 0;
    const gob = BD.W.makeEnemy(w, 'goblin', 7.6, 6.3, {}); gob.stunT = 1e9;
    const gh = BD.W.makeEnemy(w, 'ghoul', 6.6, 5.6, {}); gh.stunT = 1e9;
    const off = BD.W.makeEnemy(w, 'goblin', 7, 8.2, {}); off.stunT = 1e9; // beside the lane
    const hp0 = gh.hp, y0 = gh.y, n0 = w.bus.count();
    until(H, () => k.mem.charging, 80);
    until(H, () => !k.mem.charging, 80);
    H.step(12);
    t.assert(gob.dead, 'goblin in the lane killed (10 HP < 30)');
    t.eq(hp0 - gh.hp, 30, 'ghoul took 30 once');
    t.near(y0 - gh.y, 1, 0.12, 'ghoul thrown 1u to its side of the line');
    t.assert(!off.dead && off.hp === off.maxHp, 'beside the lane: untouched');
    const kill = evs(w, 'kill', n0).find((x) => x.enemyId === gob.id);
    t.eq(kill.source, 'foe');
    t.assert(evs(w, 'shard_drop', n0).some((x) => Math.abs(x.x - kill.x) < 0.5), 'the goblin dropped its shard');
    t.eq(evs(w, 'hit', n0).filter((x) => x.enemyId === gh.id).length, 1, 'once per charge');
    t.assert(evs(w, 'hit', n0).every((x) => x.source !== 'foe' || x.direct === false), 'indirect (ignores a guard)');
  },
  'the slime splits (§3.2): two slimelets where it died, still for 0.3 s, no attack for 0.6 s; slimelets and the guardian do not split; the cap holds'(t) {
    const { BD, H, w } = arena(t, { floor: 1 });
    pacify(w);
    const s = BD.W.makeEnemy(w, 'slime', w.hero.x + 1.6, w.hero.y, {});
    const n0 = w.bus.count();
    BD.combat.kill(w, s);
    const kids = w.enemies.filter((e) => !e.dead && e.kind === 'slimelet');
    t.eq(kids.length, 2);
    for (const c of kids) {
      t.assert(BD.math.dist(c.x, c.y, s.x, s.y) < 0.5, 'where it died');
      t.eq(c.noAttackT, 0.6); t.near(c.mem.holdT, 0.3, 1e-9);
      c.mem.cd = 0;
    }
    t.eq(evs(w, 'spawn', n0).filter((x) => x.kind === 'slimelet').map((x) => x.via), ['split', 'split']);
    const p0 = kids.map((c) => [c.x, c.y]);
    H.step(Math.round(0.28 / TICK));
    kids.forEach((c, i) => { t.near(c.x, p0[i][0], 0.02); t.near(c.y, p0[i][1], 0.02); });
    for (let i = 0; i < Math.round(0.3 / TICK); i++) { H.step(1); for (const c of kids) t.eq(tgOf(w, c).length, 0, 'no attack within 0.6 s'); }
    const n1 = w.bus.count();
    BD.combat.kill(w, kids[0]);
    t.eq(evs(w, 'spawn', n1).length, 0, 'a slimelet does not split');
    const gs = BD.W.makeEnemy(w, 'slime', 2, 2, { guardian: true }); gs.mem.cd = 99;
    const n2 = w.bus.count();
    BD.combat.kill(w, gs);
    t.eq(evs(w, 'spawn', n2).filter((x) => x.kind === 'slimelet').length, 0, 'the guardian does not split');
    // at the cap (110 alive): only what fits
    const b = arena(t, { floor: 1 });
    pacify(b.w);
    const s2 = b.BD.W.makeEnemy(b.w, 'slime', 3, 3, {});
    while (living(b.w) < 109) b.BD.W.makeEnemy(b.w, 'goblin', 1 + (living(b.w) % 12), 10 + Math.floor(living(b.w) / 12) % 3, {}).stunT = 1e9;
    b.BD.combat.kill(b.w, s2); // 108 left + room for 2
    t.eq(living(b.w), 110);
    b.BD.combat.kill(b.w, b.w.enemies.find((e) => !e.dead && e.kind === 'slimelet'));
    const s3 = b.BD.W.makeEnemy(b.w, 'slime', 3, 3, {});
    t.eq(living(b.w), 110);
    b.BD.combat.kill(b.w, s3);
    t.eq(living(b.w), 110, 'one slimelet fits, the other does not');
  },
  'caps (§3.7): BD.foes.spawn queues at 110; fodder start no warning when 32 are on the floor'(t) {
    const { BD, H, w } = arena(t, { floor: 1 });
    pacify(w);
    while (living(w) < 110) BD.W.makeEnemy(w, 'goblin', 1 + (living(w) % 12), 1 + Math.floor(living(w) / 12), {}).stunT = 1e9;
    t.eq(BD.foes.room(w), 0);
    t.eq(BD.foes.spawn(w, 'goblin', 5, 5, { warn: 0 }), null, 'queued');
    t.eq(w.queue.length, 1);
    BD.combat.kill(w, w.enemies.find((e) => !e.dead));
    H.step(1);
    t.eq(w.rifts.length + living(w), 110, 'the queued one comes when there is room');
    // 32 warnings on the floor: a ready goblin next to the hero waits
    const b = arena(t, { floor: 1 });
    pacify(b.w);
    for (let i = 0; i < 32; i++) b.BD.hazards.telegraph(b.w, { shape: 'circle', x: 1, y: 1, r: 0.3, time: 5, dmg: 0 });
    const g = b.BD.W.makeEnemy(b.w, 'goblin', b.w.hero.x + 1.3, b.w.hero.y, {});
    g.mem.cd = 0; g.nearT = 1;
    b.H.step(30);
    t.eq(tgOf(b.w, g).length, 0, 'no new fodder warning at 32');
  },
  'threats first (§3.5): while a threat waits for a slot, fodder leave the last one free for it; elites, guardians and the boss take none'(t) {
    const { BD, H, w } = arena(t, { floor: 1 });
    pacify(w);
    const cap = BD.director.row(w).melee;
    t.eq(cap, 4);
    const gs = [];
    for (let i = 0; i < 6; i++) { const g = BD.W.makeEnemy(w, 'goblin', 2 + i, 2, {}); g.stunT = 1e9; gs.push(g); }
    for (let i = 0; i < cap; i++) t.eq(BD.foes.slot(w, gs[i], 'melee'), true);
    const s = BD.W.makeEnemy(w, 'slime', 2, 5, {}); s.stunT = 1e9;
    t.eq(BD.foes.slot(w, s, 'melee'), false, 'full: the slime waits');
    BD.ai.release(w, gs[0]);
    t.eq(BD.foes.slot(w, gs[4], 'melee'), false, 'the freed slot is not for fodder while the slime waits');
    t.eq(BD.foes.slot(w, s, 'melee'), true, 'the slime takes it');
    BD.ai.release(w, gs[1]);
    H.step(Math.ceil(BD.foes.T.wantFor / TICK) + 1);
    t.eq(BD.foes.slot(w, gs[4], 'melee'), true, 'no threat waiting: fodder take it');
    const el = BD.W.makeEnemy(w, 'ghoul', 8, 8, { elite: true });
    t.eq(BD.foes.slot(w, el, 'melee'), true); t.eq(el.slot, null, 'an elite is outside the caps');
  },
  'director elites (§3.6): from 2F, every eliteEvery s while none it sent lives, the dominant type\'s elite comes with a pack; never on 1F; never recycled'(t) {
    const BD0 = t.load();
    for (const type of ['undead', 'heavy']) {
      const seed = seedFor(BD0, 2, type);
      const { BD, H, w } = bigFloor(t, { seed, floor: 2, calm: false });
      w.hero.invuln = 1e9; pacify(w);
      const row = BD.director.row(w), want = BD.director.mixes.get(type).elite;
      // the pacified hero kills nothing: clear the fodder every second so packs keep coming
      const tick = (i) => { H.step(1); w.hero.hp = w.hero.maxHp; if (i % 60 === 0) for (const e of w.enemies) if (!e.dead && !e.elite) BD.W.removeEnemy(w, e, 'recycle'); };
      let first = null;
      for (let i = 0; i < Math.round((row.eliteEvery + 6) / TICK) && !first; i++) {
        tick(i);
        first = w.enemies.find((e) => !e.dead && e.elite) || null;
      }
      t.assert(first, type + ': an elite came');
      t.eq(first.kind, want, type + ' elite kind');
      t.assert(first.flags.directorElite && first.flags.marker === 'threat');
      t.assert(w.t >= row.eliteEvery - 1e-6 && w.t <= row.eliteEvery + 6, `${type}: at ${w.t.toFixed(1)} s (every ${row.eliteEvery} s)`);
      t.assert(!BD.W.onScreen(w, first.x, first.y), 'from off screen');
      // it lives on: no second one; far off screen it is not recycled
      first.x = w.hero.x > 24 ? 2 : 46; first.y = w.hero.y > 24 ? 2 : 46; first.stunT = 1e9;
      for (let i = 0; i < Math.round(row.eliteEvery / TICK); i++) tick(i);
      t.assert(!first.dead, 'not recycled');
      t.eq(w.enemies.filter((e) => !e.dead && e.elite).length, 1, 'one at a time');
      BD.combat.kill(w, first);
      let second = null;
      for (let i = 0; i < Math.round(6 / TICK) && !second; i++) { tick(i); second = w.enemies.find((e) => !e.dead && e.elite) || null; }
      t.assert(second, 'the next one soon after it died (its interval had passed)');
    }
    const { w, H } = bigFloor(t, { floor: 1, calm: false });
    w.hero.invuln = 1e9; pacify(w);
    for (let i = 0; i < Math.round(80 / TICK); i++) { H.step(1); t.assert(!w.enemies.some((e) => e.elite), 'no elite on 1F'); }
  },
  'the guardian keeps to the stairs zone + 6u (archer and mage guardians to the zone); inside it, it fights'(t) {
    const { BD, H, w } = bigFloor(t, { floor: 2, x: 30, y: 9 });
    pacify(w); w.hero.invuln = 1e9;
    const g = BD.W.makeEnemy(w, 'goblin', 8, 8, { guardian: true }); g.mem.summonT = 1e9;
    const box = BD.foes.box(w, g);
    t.eq([box.x0, box.y0, box.x1, box.y1], [0, 0, 22, 22]);
    H.step(Math.round(8 / TICK));
    t.assert(g.x <= 22 - g.r + 1e-6, 'waits at the box edge (' + g.x.toFixed(2) + ')');
    t.assert(g.x > 18, 'came as far as it may');
    w.hero.x = 18; w.hero.y = 9;
    const n0 = w.bus.count();
    H.step(Math.round(3 / TICK));
    t.assert(evs(w, 'telegraph', n0).some((x) => x.ownerId === g.id), 'attacks inside the box');
    const a = BD.W.makeEnemy(w, 'skel_archer', 12, 12, { guardian: true });
    const m = BD.W.makeEnemy(w, 'mage', 12, 4, { guardian: true });
    t.eq(BD.foes.box(w, a).x1, 16); t.eq(BD.foes.box(w, m).x1, 16);
    for (const [hx, hy] of [[19, 10], [21, 3], [20, 18]]) {
      w.hero.x = hx; w.hero.y = hy;
      for (let i = 0; i < 120; i++) {
        H.step(1);
        for (const e of [a, m]) t.assert(e.x <= 16 - e.r + 1e-6 && e.y <= 16 - e.r + 1e-6, e.kind + ' stays in the zone');
      }
    }
  },
  'horde mixes on real floors (§3.3): the director sends the floor\'s fodder in its shares and its threats (one in four from another type)'(t) {
    const BD0 = t.load();
    for (const type of ['beast', 'undead', 'magic', 'heavy']) {
      const n = type === 'beast' ? 1 : 2, seed = type === 'beast' ? 1 : seedFor(BD0, 2, type);
      const { BD, H, w } = bigFloor(t, { seed, floor: n, calm: false });
      w.hero.invuln = 1e9;
      const mix = BD.director.mixes.get(type), counts = {};
      w.bus.on('spawn', (x) => { if (x.via === 'director') counts[x.kind] = (counts[x.kind] || 0) + 1; });
      for (let i = 0; i < Math.round(60 / TICK); i++) { H.step(1); w.hero.hp = w.hero.maxHp; if (w.choiceOpen) H.cmd('choice', 'pick', 0); }
      const fod = Object.keys(counts).filter((k) => BD.enemies.get(k).role === 'fodder');
      for (const k of fod) t.assert(mix.fodder[k], `${type}: fodder ${k} is the mix's`);
      const total = fod.reduce((s, k) => s + counts[k], 0);
      const main = Object.keys(mix.fodder).sort((a, b) => mix.fodder[b] - mix.fodder[a])[0];
      t.assert(counts[main] / total >= mix.fodder[main] / 100 - 0.12, `${type}: ${main} ${counts[main]}/${total}`);
      const thr = Object.keys(counts).filter((k) => BD.enemies.get(k).role === 'threat');
      t.assert(thr.some((k) => mix.threats[k]), `${type}: its own threats came (${thr.join(',')})`);
    }
  },
  'BD.foes for tasks: spawn (now off screen, behind a warning in view), flags travel through rifts, pack of the floor\'s mix'(t) {
    const { BD, H, w } = bigFloor(t, { floor: 2, x: 24.5, y: 24.5 });
    pacify(w);
    const far = BD.foes.spawn(w, 'husk', 4, 4, { flags: { keep: true, marker: 'objective' } });
    t.assert(far && far.kind === 'husk' && far.flags.keep && far.flags.marker === 'objective', 'made at once off screen, flags set');
    const r = BD.foes.spawn(w, 'skel_archer', 26, 25, { flags: { keep: true } });
    t.assert(r && r.remain > 0, 'in view: a rift warning first');
    H.step(Math.ceil(BD.C.WAVES.riftWarn / TICK) + 1);
    const a = w.enemies.find((e) => !e.dead && e.kind === 'skel_archer');
    t.assert(a && a.flags.keep, 'flags made it through the rift');
    const pack = BD.foes.pack(w, 6, 30, 6, { threats: 1, warn: 0, flags: { nest: 7 } });
    t.eq(pack.length, 7);
    const mix = BD.director.mixOf(w);
    t.assert(pack.every((e) => (mix.fodder[e.kind] || mix.threats[e.kind]) && e.flags.nest === 7), 'the floor\'s kinds, flagged');
    t.eq(pack.filter((e) => e.role === 'threat').length, 1);
    t.eq(BD.foes.eliteKind(w), mix.elite);
  },
};
