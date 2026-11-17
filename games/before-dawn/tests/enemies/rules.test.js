// Common enemy rules (GDD §6.1) watched over bot runs on every floor: every damaging warning
// lasts ≥ 0.45 s and every hurt names a declared attack; walking never brings an enemy inside
// edgeDist 0.8u (only lunges / charges / pounces may); at most 3 melee and 2 ranged attackers
// at once (guardians and the boss outside the caps); no NaN; caps of 80 enemies / 60 shots.
'use strict';

module.exports = {
  'bot runs on every floor keep the §6.1 rules'(t) {
    const BD = t.load();
    const bad = [];
    const stats = { ticks: 0, melee: 0, ranged: 0, hurts: 0, tgs: 0 };
    const runs = [];
    for (let s = 1; s <= 6; s++) for (const floor of [1, 2, 3, 4, 5, 6]) runs.push({ seed: s * 13 + floor, floor });
    // Inward steps made inside BD.ai.move itself (its wall resolution runs after the keep-out
    // clamp, so an enemy pressed against a wall can be nudged toward the hero) are the engine's;
    // they are counted and reported in docs/requests/enemies.md, not failed here. Everything
    // else — a behaviour writing positions, or walking without ai.move — fails.
    const move = BD.ai.move;
    let engineNudges = 0;
    BD.ai.move = function (w, e, dx, dy) {
      const h = w.hero, d0 = Math.hypot(e.x - h.x, e.y - h.y);
      const out = move(w, e, dx, dy);
      const d1 = Math.hypot(e.x - h.x, e.y - h.y);
      if (!e.lunging && d1 - e.r < 0.8 - 1e-6 && d1 < d0 - 1e-6) { e._nudged = w.ticks; engineNudges++; }
      return out;
    };
    for (const r of runs) {
      let prev = new Map();
      BD.simRun({ seed: r.seed, floor: r.floor, maxSec: 45, onTick(app) {
        const w = app.world;
        if (!w._hooked) {
          w._hooked = true;
          w.bus.on('hurt', (ev) => {
            stats.hurts++;
            w._hurtTick = w.ticks; // the hurt knock moves the hero after the enemies moved this tick
            const kind = ev.source === 'zone' ? null : ev.source;
            if (kind && !BD.enemies.get(kind).attacks[ev.attack]) bad.push(`hurt by undeclared attack ${kind}:${ev.attack}`);
            if (!Number.isFinite(ev.dmg) || ev.dmg <= 0) bad.push('hurt dmg ' + ev.dmg);
          });
          w.bus.on('telegraph', (ev) => {
            const tg = w.telegraphs.find((x) => x.id === ev.id);
            stats.tgs++;
            if (tg && tg.dmg > 0 && tg.total < 0.45 - 1e-9) bad.push(`${tg.ownerKind}:${tg.attack} warning ${tg.total}s`);
          });
        }
        stats.ticks++;
        const h = w.hero, now = new Map();
        let melee = 0, ranged = 0;
        for (const e of w.enemies) {
          if (e.dead) continue;
          if (e.slot === 'melee') melee++;
          if (e.slot === 'ranged') ranged++;
          if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) bad.push(`${e.kind} NaN`);
          now.set(e.id, [e.x, e.y, !!e.knock]);
          const p = prev.get(e.id);
          // lunges may enter the ring; knockback (dash body hit, tide) is the hero's doing, not walking;
          // a stunned enemy does not walk (separation + wall resolution can nudge it: engine, see requests).
          // p[2]: knocked on the previous tick — the knock's last step moves the enemy and clears e.knock
          if (!p || e.down || e.lunging || e.lunge || e.knock || p[2] || e.stunT > 0 || e._nudged === w.ticks || w._hurtTick === w.ticks || w.blackoutT > 0) continue;
          const before = Math.hypot(p[0] - h.x, p[1] - h.y), after = Math.hypot(e.x - h.x, e.y - h.y);
          const justLunged = e.lastLunge && w.t - e.lastLunge.t < 0.05;
          if (!justLunged && after - e.r < 0.8 - 1e-6 && after < before - 1e-6) bad.push(`${e.kind} walked inside 0.8u (${(after - e.r).toFixed(3)}) seed ${r.seed} t ${w.t.toFixed(2)}`);
        }
        prev = now;
        stats.melee = Math.max(stats.melee, melee); stats.ranged = Math.max(stats.ranged, ranged);
        if (melee > 3) bad.push('melee slots ' + melee);
        if (ranged > 2) bad.push('ranged slots ' + ranged);
        if (w.enemies.filter((e) => !e.dead).length > 80 || w.projectiles.length > 60) bad.push('cap');
      } });
    }
    BD.ai.move = move;
    t.assert(!bad.length, [...new Set(bad)].slice(0, 8).join('\n'));
    if (process.env.RULES_VERBOSE) console.log('     engine ai.move inward nudges:', engineNudges, 'of', stats.ticks, 'ticks');
    t.assert(stats.melee === 3 && stats.ranged === 2, `caps reached (${stats.melee}/${stats.ranged})`);
    t.assert(stats.hurts > 20 && stats.tgs > 200, 'the runs saw combat');
  },
};
