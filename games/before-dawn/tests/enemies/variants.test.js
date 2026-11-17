// Elites and guardians (GDD §6.3): scaling as applied to our enemies, elite counts and
// placement in the generated floors, guardian choice, the beast guardians' summons.
'use strict';
const { arena, pacify, evs, living } = require('./util');

const TICK = 1 / 60;
const tgOf = (w, e) => w.telegraphs.filter((t) => t.ownerId === e.id);

module.exports = {
  'elite: size ×1.3, HP ×2.5, damage ×1.25, telegraph ×1.2, drops a flask'(t) {
    const { BD, H, w } = arena(t);
    pacify(w);
    for (const kind of ['slime', 'goblin', 'skel_archer', 'ghoul', 'mage', 'dark_knight']) {
      const d = BD.enemies.get(kind);
      const e = BD.W.makeEnemy(w, kind, 1.5, 1.5, { elite: true });
      t.near(e.size, 1.3, 1e-9, kind); t.eq(e.maxHp, Math.round(d.hp * 2.5), kind); t.eq(e.dmg, Math.round(d.dmg * 1.25), kind); t.near(e.tgScale, 1.2, 1e-9, kind);
      BD.combat.kill(w, e);
    }
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.3, w.hero.y, { elite: true });
    g.mem.cd = 0;
    H.step(1);
    t.near(tgOf(w, g)[0].r, 1.3 * 1.2, 1e-9, 'stab fan ×1.2');
    const p0 = w.pickups.length;
    BD.combat.kill(w, g);
    t.eq(w.pickups.length, p0 + 1, 'flask');
  },
  'guardian: size ×1.6, damage ×1.3, telegraph ×1.4, HP by floor (GDD 160/220/280/340/400, tuned ×3), outside the attack caps'(t) {
    for (let n = 1; n <= 5; n++) {
      const { BD, w } = arena(t, { floor: n });
      for (const kind of ['slime', 'goblin', 'skel_archer', 'ghoul', 'mage', 'dark_knight']) {
        const d = BD.enemies.get(kind);
        const e = BD.W.makeEnemy(w, kind, 2, 2, { guardian: true });
        t.eq(e.maxHp, [0, 480, 660, 840, 1020, 1200][n]); t.eq(e.hp, e.maxHp); t.near(e.size, 1.6, 1e-9); t.eq(e.dmg, Math.round(d.dmg * 1.3)); t.near(e.tgScale, 1.4, 1e-9);
        t.assert(e.knockScale <= 0.33 + 1e-9, 'reduced knockback');
        t.eq(BD.ai.slot(w, e, 'melee'), true); t.eq(e.slot, null, 'takes no slot');
      }
    }
  },
  'generated floors: elites 0/0/1/1/2 from wave 2, dominant type when possible; guardian of the dominant type'(t) {
    const BD = t.load();
    for (let s = 1; s <= 120; s++) {
      const run = BD.gen.run(s, 0);
      for (let n = 1; n <= 5; n++) {
        const f = run.floors[n], sp = f.spawns;
        t.eq(sp.elites.length, [0, 0, 0, 1, 1, 2][n], `seed ${s} ${n}F elites`);
        const domIn2 = sp.w2.filter((k) => BD.enemies.get(k).type === f.domType).length;
        for (const i of sp.elites) { t.assert(i < sp.w2.length); if (domIn2 >= sp.elites.length) t.eq(BD.enemies.get(sp.w2[i]).type, f.domType); }
        t.eq(BD.enemies.get(sp.guardian).type, f.domType, `seed ${s} ${n}F guardian type`);
      }
    }
    // every kind of a type can be its guardian
    const seen = new Set();
    for (let s = 1; s <= 200; s++) { const run = BD.gen.run(s, 0); for (let n = 1; n <= 5; n++) seen.add(run.floors[n].spawns.guardian); }
    t.eq([...seen].sort(), ['dark_knight', 'ghoul', 'goblin', 'mage', 'skel_archer', 'slime']);
  },
  'beast guardians: 대왕 슬라임 drops 2 slimes every third pounce (6 at most); 고블린 족장 calls 3 goblins every 12 s'(t) {
    {
      const { BD, H, w } = arena(t, { floor: 2 });
      w.hero.invuln = 1e9; pacify(w);
      const e = BD.W.makeEnemy(w, 'slime', w.hero.x + 2.6, w.hero.y, { guardian: true });
      let pounces = 0;
      w.bus.on('telegraph_fire', (ev) => { if (ev.ownerId === e.id) pounces++; });
      const counts = [];
      for (let i = 0; i < Math.round(40 / TICK); i++) {
        H.step(1);
        for (const o of w.enemies) if (o !== e && !o.dead) o.mem.cd = 99; // the small ones stay quiet
        if (counts[pounces] === undefined) counts[pounces] = living(w, 'slime') - 1;
        w.hero.x = e.x + 2.6; w.hero.y = e.y; // stay in pounce range
        if (w.hero.x > w.grid.w - 1) { w.hero.x = e.x - 2.6; }
      }
      t.assert(pounces >= 10, 'many pounces');
      t.eq(counts[1], 0); t.eq(counts[2], 0); t.eq(counts[3], 2); t.eq(counts[6], 4); t.eq(counts[9], 6);
      t.eq(living(w, 'slime') - 1, 6, 'six at most');
    }
    {
      const { BD, H, w } = arena(t, { floor: 2, grid: false });
      w.hero.invuln = 1e9; pacify(w);
      const e = BD.W.makeEnemy(w, 'goblin', 2.5, 2.5, { guardian: true });
      e.stunT = 0;
      const n0 = w.bus.count();
      H.step(Math.round(11.9 / TICK));
      t.eq(evs(w, 'rift', n0).length, 0);
      H.step(Math.round(0.2 / TICK));
      t.eq(evs(w, 'rift', n0).length, 3);
      H.step(Math.round(12 / TICK));
      t.eq(evs(w, 'rift', n0).length, 6);
      t.assert(w.rifts.concat(w.enemies).some((x) => x.kind === 'goblin'));
    }
  },
};
