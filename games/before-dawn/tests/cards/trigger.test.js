// GDD §5.3 trigger cards: 흡수, 반격, 발도.
const { world, place, evs, hitsOn, swingOnce, until } = require('./_kit');

function kill(BD, w, opts) {
  const e = place(BD, w, 'goblin', 3, 3, opts);
  BD.combat.kill(w, e);
  return e;
}

module.exports = {
  // GDD-V2 §4.4 level 1 (v1: every 4th kill heals 5, pips 0–3)
  'leech: every 80th kill heals 4 (slot ring fills toward it); guardian / elite kills heal 10 at once'(t) {
    const { BD, H, w } = world(t, { hand: ['leech'] });
    const c = BD.cardRt.get(w, 'leech');
    w.hero.hp = 50;
    for (let i = 0; i < 79; i++) kill(BD, w);
    t.eq(w.hero.hp, 50);
    t.near(c.def.hud(c.state, BD.cardRt.ctx(w, c)).ring, 79 / 80, 1e-9);
    kill(BD, w);
    t.eq(w.hero.hp, 54);
    t.eq(c.def.hud(c.state, BD.cardRt.ctx(w, c)).ring, 0);
    t.eq(evs(w, 'heal').map((x) => [x.amount, x.source]), [[4, 'leech']]);
    kill(BD, w, { elite: true });
    t.eq(w.hero.hp, 64);
    t.eq(c.state.kills, 0, 'elite kill does not advance the counter');
    kill(BD, w); kill(BD, w, { guardian: true });
    t.eq(w.hero.hp, 74); t.eq(c.state.kills, 1);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'leech_ink').length, 83);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'leech_heal').map((x) => x.amount), [4, 10, 10]);
  },
  'leech: at full HP the 80th kill heals nothing and the count restarts'(t) {
    const { BD, H, w } = world(t, { hand: ['leech'] });
    for (let i = 0; i < 80; i++) kill(BD, w);
    t.eq(evs(w, 'heal').length, 0);
    t.eq(BD.cardRt.get(w, 'leech').state.kills, 0);
  },
  'riposte: hurt → 0.15 s later a 2.6u circle at ×2 (source riposte, elements apply); 2.0 s cooldown'(t) {
    const { BD, H, w } = world(t, { hand: ['riposte', 'flame'] });
    const inR = place(BD, w, 'goblin', -2.9, 0, { hp: 999 });   // edge 2.55 ≤ 2.6, out of the blade
    const outR = place(BD, w, 'goblin', 3.1, 0, { hp: 999 });   // edge 2.75
    const hurt = () => BD.W.hurtHero(w, 5, { source: 'goblin', attack: 'stab', enemyId: inR.id, attackId: 'x' + w.t });
    t.eq(hurt(), true);
    const n = until(H, () => hitsOn(w, inR, 'riposte').length > 0, 30);
    t.assert(n >= 9 && n <= 10, 'fires 0.15 s after the hurt, got ' + n + ' ticks');
    t.eq(hitsOn(w, inR, 'riposte').map((x) => [x.dmg, x.direct]), [[20, true]]);
    t.assert(inR.statuses.burn, 'flame applies to the counter');
    t.eq(hitsOn(w, outR).length, 0);
    H.step(55);                                    // ≈ 1.07 s after (past the 1.0 s post-hit invulnerability): hurt again, still cooling down
    t.eq(hurt(), true);
    H.step(20);
    t.eq(hitsOn(w, inR, 'riposte').length, 1, 'cooldown');
    H.step(70);                                    // > 2.0 s since the first counter
    t.eq(hurt(), true);
    H.step(12);
    t.eq(hitsOn(w, inR, 'riposte').length, 2);
  },
  'riposte: a dodge → ×3 counter at once and the dash cooldown is reset'(t) {
    const { BD, H, w } = world(t, { hand: ['riposte'] });
    const e = place(BD, w, 'goblin', -2.0, 0, { hp: 999 });
    w.hero.dashInvuln = 0.25; w.hero.dashCd = 2.5;
    t.eq(BD.W.hurtHero(w, 9, { source: 'goblin', attack: 'stab', enemyId: e.id, attackId: 'd1' }), false);
    t.eq(evs(w, 'dodge').length, 1);
    t.eq(hitsOn(w, e, 'riposte').map((x) => x.dmg), [30]);
    t.eq(w.hero.dashCd, 0);
    const c = BD.cardRt.get(w, 'riposte');
    t.near(c.def.hud(c.state, BD.cardRt.ctx(w, c)).ring, 1, 1e-9, 'slot shows the full cooldown');
  },
  // GDD-V2 §4.4 level 1 (v1: 3.0u without swinging; any swing reset the count)
  'drawcut: unlock at 15 dodges; every 8u of movement (swings do not reset it) readies ×2.5 and +0.6u for the next swing only'(t) {
    const { BD, H, w } = world(t, { hand: ['drawcut'] });
    const d = BD.cards.get('drawcut'), s = BD.progress.fresh();
    s.counters.dodges = 14; t.eq(d.unlock(s), false); s.counters.dodges = 15; t.eq(d.unlock(s), true);
    const c = BD.cardRt.get(w, 'drawcut');
    w.hero.x = 2.5;
    H.input({ mx: 1, my: 0 });
    H.step(60);
    const g = place(BD, w, 'goblin', 1.2, 0, { hp: 999 }); // an uncharged swing on the way
    swingOnce(BD, H, w);
    t.eq(evs(w, 'swing').map((x) => x.charged), [false]);
    t.assert(c.state.dist > 4, 'the swing kept the distance: ' + c.state.dist);
    g.x += 30; w.hero.atkTimer = 99;
    H.step(114 - 61 - 1);
    t.eq(c.state.ready, false, 'not yet: 113 ticks × 0.07u < 8u');
    H.step(2);
    t.eq(c.state.ready, true);
    H.input({ mx: 0, my: 0 });
    H.step(1);
    t.eq([w.hero.stats.reach, w.hero.stats.charged], [2.5, true]);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'drawcut_ready').length, 1);
    const e = place(BD, w, 'goblin', 2.65, 0, { hp: 999 });     // edge 2.33: only the charged blade reaches
    swingOnce(BD, H, w);
    t.eq(evs(w, 'swing').map((x) => x.charged), [false, true]);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [25]);
    t.eq([c.state.ready, c.state.dist], [false, 0]);
    H.step(1);
    t.eq(w.hero.stats.reach, 1.9);
    e.x = w.hero.x + 1.2;
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [25, 10]);
  },
  'drawcut: the dash distance counts; a charged wave flies 0.6u further and keeps ×2.5'(t) {
    const { BD, H, w } = world(t, { hand: ['drawcut', 'sword_wave'] });
    const c = BD.cardRt.get(w, 'drawcut');
    w.hero.x = 1.5;
    c.state.dist = 4.9;
    H.input({ mx: 1, my: 0, dash: true }); H.step(1);
    H.input({ mx: 0, my: 0 }); H.step(14);
    t.eq(c.state.ready, true, '4.9 + dash 3.2u ≥ 8');
    w.hero.x = 1.5; w.hero.y = 6.5;
    const e = place(BD, w, 'goblin', 5.0, 0, { hp: 999 });
    swingOnce(BD, H, w);
    const p = w.projectiles.find((x) => !x.hostile);
    t.eq([p.range, p.charged], [7.1, true]);
    H.step(40);
    t.eq(hitsOn(w, e, 'wave').map((x) => x.dmg), [15]);
  },
};
