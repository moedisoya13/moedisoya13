// GDD-V2 §4.4: what levels 2–5 of the twelve cards outside the proof slice do on the field — the
// numeric levels (2, 4) by the damage and range they give, the shape-changing levels (3, 5) by the
// new shape or rule. Level 1 is in shape/element/trigger/target/quest/combo.test.js.
const { world, place, evs, hitsOn, swingOnce } = require('./_kit');

const up = (BD, w, id, to) => { const c = BD.cardRt.get(w, id); while (c.level < to) BD.cardRt.levelUp(w, c); return c; };
const killAt = (BD, w, kind, dx, dy, opts) => { const e = place(BD, w, kind, dx, dy, opts); BD.combat.kill(w, e); return e; };
const DEG = Math.PI / 180;
const waves = (w) => w.projectiles.filter((p) => !p.hostile);

module.exports = {
  // ---- 검기 ----------------------------------------------------------------------------------
  'sword_wave: 2 factor 0.8 · 3 three ways ±16° sharing their hits · 4 through 4, width 1.3u · 5 five ways ±32°, range 8u'(t) {
    const { BD, H, w } = world(t, { hand: ['sword_wave'] });
    w.hero.x = 6.5;
    up(BD, w, 'sword_wave', 2);
    const a = place(BD, w, 'goblin', 4.4, 0, { hp: 999 });
    swingOnce(BD, H, w); H.step(40);
    t.eq(hitsOn(w, a, 'wave').map((x) => x.dmg), [8]);
    up(BD, w, 'sword_wave', 3);
    const side = place(BD, w, 'goblin', 4.4 * Math.cos(16 * DEG), 4.4 * Math.sin(16 * DEG), { hp: 999 });
    const close = place(BD, w, 'goblin', 2.6, 0.05, { hp: 999 }); // within reach of all three crescents
    a.x += 30; close.x -= 0; swingOnce(BD, H, w);
    const ps = waves(w);
    t.eq(ps.length, 3);
    const aim = w.lastSwing.aim;
    t.eq(ps.map((p) => Math.round((p.dir - aim) / DEG)).sort((x, y) => x - y), [-16, 0, 16]);
    t.assert(ps.every((p) => p.hitIds === ps[0].hitIds), 'one hit set for the swing');
    H.step(40);
    t.eq(hitsOn(w, side, 'wave').length, 1, 'the side crescent');
    t.eq(hitsOn(w, close, 'wave').length, 1, 'an enemy in the way of all three is cut once');
    up(BD, w, 'sword_wave', 4);
    swingOnce(BD, H, w);
    t.eq(waves(w).map((p) => [p.pierce, p.r * 2]), [[4, 1.3], [4, 1.3], [4, 1.3]]);
    H.step(40);
    up(BD, w, 'sword_wave', 5);
    swingOnce(BD, H, w);
    t.eq(waves(w).map((p) => Math.round((p.dir - w.lastSwing.aim) / DEG)).sort((x, y) => x - y), [-32, -16, 0, 16, 32]);
    t.eq(waves(w)[0].range, 8);
  },
  // ---- 해류 ----------------------------------------------------------------------------------
  'tide: 2 slam 14 · 3 push 1.8u and a pushed enemy bumps the next (both 6) · 4 wet 6 s, slam 20'(t) {
    const slam = (L) => {
      const { BD, H, w } = world(t, { hand: ['tide'] });
      up(BD, w, 'tide', L);
      w.hero.x = 2.6;
      const e = place(BD, w, 'goblin', -1.4, 0, { hp: 999 });
      e.stunT = 0; w.hero.face = Math.PI;
      swingOnce(BD, H, w); H.step(12);
      return { dmg: hitsOn(w, e, 'slam').map((x) => x.dmg), wet: e.statuses.wet && e.statuses.wet.t };
    };
    t.eq(slam(2).dmg, [14]);
    const four = slam(4);
    t.eq(four.dmg, [20]);
    t.near(four.wet, 6 - 13 / 60, 0.02, 'wet 6 s');
    const { BD, H, w } = world(t, { hand: ['tide'] });
    up(BD, w, 'tide', 3);
    const lone = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const x0 = lone.x;
    swingOnce(BD, H, w); H.step(12);
    t.near(lone.x - x0, 1.8, 0.01, 'pushed 1.8u');
    t.eq(hitsOn(w, lone, 'slam').length, 0, 'nothing in the way: no bump');
    lone.x += 20;
    const first = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const behind = place(BD, w, 'goblin', 2.6, 0.2, { hp: 999 }); // edge 2.29: beyond the blade, in the push's way
    const aside = place(BD, w, 'goblin', 2.6, 1.6, { hp: 999 });  // off the path
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, first, 'slam').map((x) => [x.dmg, x.direct]), [[6, false]]);
    t.eq(hitsOn(w, behind).map((x) => [x.source, x.dmg]), [['slam', 6]]);
    t.eq(hitsOn(w, aside).length, 0);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'tide_bump').length, 1);
  },
  'tide 5: every 4th hitting swing a 5u × 2.4u wave at 0.8 that pushes 3u'(t) {
    const { BD, H, w } = world(t, { hand: ['tide'] });
    w.hero.x = 10.5;
    up(BD, w, 'tide', 5);
    const front = place(BD, w, 'goblin', 1.2, 0, { hp: 9999 });
    const far = place(BD, w, 'goblin', 4.0, 0.6, { hp: 9999 }); // only the wave reaches it
    const lines = [];
    let x0 = 0;
    for (let i = 0; i < 8; i++) {
      front.x = w.hero.x + 1.2; front.y = w.hero.y; front.knock = null;
      far.x = w.hero.x + 4.0; far.y = w.hero.y + 0.6; far.knock = null; x0 = far.x;
      swingOnce(BD, H, w);
      const ln = w.lastSwing.shapes.filter((s) => s.card === 'tide');
      lines.push(ln.length);
      if (ln.length) {
        t.eq(ln.map((s) => [s.kind, s.len, s.width, s.factor]), [['line', 5, 2.4, 0.8]]);
        H.step(12);
        t.near(far.x - x0, 3 * Math.cos(Math.atan2(0, 1)), 0.05, 'the wave pushes 3u');
      }
    }
    t.eq(lines, [0, 0, 0, 1, 0, 0, 0, 1]);
    t.eq(hitsOn(w, far).map((x) => x.dmg), [8, 8]);
  },
  // ---- 반격 ----------------------------------------------------------------------------------
  'riposte: 2 radius 3.2u · 3 cooldown 1.2 s · 4 ×3 / ×4'(t) {
    const { BD, H, w } = world(t, { hand: ['riposte'] });
    const c = up(BD, w, 'riposte', 4);
    const e = place(BD, w, 'goblin', 2.9, 0, { hp: 999 }); // edge 2.58: inside 3.2, outside 2.6
    w.hero.atkTimer = 99;
    BD.W.hurtHero(w, 5, { source: 'goblin', attack: 'stab', enemyId: e.id, attackId: 'a' });
    t.near(c.state.readyAt - w.t, 1.2, 1e-9, 'cooldown 1.2 s');
    H.step(10); w.hero.atkTimer = 99;
    t.eq(hitsOn(w, e, 'riposte').map((x) => x.dmg), [30]);
    t.eq(evs(w, 'strike', (x) => x.source === 'riposte').map((x) => x.shapes[0].r), [3.2]);
    H.step(80); w.hero.atkTimer = 99;
    w.hero.dashInvuln = 0.25;
    BD.W.hurtHero(w, 9, { source: 'goblin', attack: 'stab', enemyId: e.id, attackId: 'd1' });
    t.eq(hitsOn(w, e, 'riposte').map((x) => x.dmg), [30, 40]);
  },
  'riposte 5: every dash ends in a 2.2u counter at ×1.5 where it stops'(t) {
    const { BD, H, w } = world(t, { hand: ['riposte'] });
    up(BD, w, 'riposte', 5);
    w.hero.x = 8.5;
    const atEnd = place(BD, w, 'goblin', 3.2 + 1.8, 0, { hp: 999 }); // 1.8u past the dash's end
    const start = place(BD, w, 'goblin', -1.5, 0, { hp: 999 });       // near the start only
    atEnd.stunT = 1e9; start.stunT = 1e9;
    w.hero.atkTimer = 99;
    H.input({ mx: 1, my: 0, dash: true }); H.step(1); H.input({ mx: 0, my: 0 });
    for (let i = 0; i < 16; i++) { w.hero.atkTimer = 99; H.step(1); }
    t.eq(hitsOn(w, atEnd, 'riposte').map((x) => x.dmg), [15]);
    t.eq(hitsOn(w, start, 'riposte').length, 0);
    t.eq(evs(w, 'strike', (x) => x.source === 'riposte').map((x) => x.shapes[0].r), [2.2]);
  },
  // ---- 발도 ----------------------------------------------------------------------------------
  'drawcut: 2 ×3.0 · 3 every 6u · 4 blade +1.0u and fan +60° · 5 the charged swing cuts all round'(t) {
    const { BD, H, w } = world(t, { hand: ['drawcut'] });
    const c = up(BD, w, 'drawcut', 3);
    w.hero.x = 2.5;
    H.input({ mx: 1, my: 0 });
    H.step(85);
    t.eq(c.state.ready, false, '85 × 0.07u < 6u');
    H.step(1);
    t.eq(c.state.ready, true);
    H.input({ mx: 0, my: 0 }); H.step(1);
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [30], '×3.0');
    up(BD, w, 'drawcut', 5);
    c.state.ready = true; H.step(1);
    t.eq([w.hero.stats.reach, w.hero.stats.halfArc], [2.9, 80]);
    const back = place(BD, w, 'goblin', -2.4, 0, { hp: 999 });
    w.hero.face = 0;
    swingOnce(BD, H, w);
    t.eq(w.lastSwing.shapes.filter((s) => s.kind === 'circle').map((s) => [s.r, s.factor, s.source]), [[2.9, 1, 'slash']]);
    t.eq(hitsOn(w, back).map((x) => x.dmg), [30], 'the circle behind at ×3');
    t.eq(evs(w, 'vfx', (x) => x.kind === 'drawcut_flash').slice(-1)[0].circle, true);
  },
  // ---- 성광 ----------------------------------------------------------------------------------
  'holy_light: 2 +12 · 3 an undead kill bursts a cross 1.6u for 12 (all types) · 4 +16, 18 · 5 every 10th kill too'(t) {
    const { BD, H, w } = world(t, { hand: ['holy_light'] });
    up(BD, w, 'holy_light', 2);
    const u = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [22]);
    u.x += 20;
    up(BD, w, 'holy_light', 3);
    const near = place(BD, w, 'goblin', -3, 1.8, { hp: 999 }), far = place(BD, w, 'goblin', -3, 2.2, { hp: 999 });
    killAt(BD, w, 'skel_archer', -3, 0);
    killAt(BD, w, 'goblin', -3, 0);      // not undead: nothing at level 3
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg]), [['burst', 12]]); // edge 1.48
    t.eq(hitsOn(w, far).length, 0);                                       // edge 1.88
    t.eq(evs(w, 'vfx', (x) => x.kind === 'holy_burst').length, 1);
    up(BD, w, 'holy_light', 4);
    killAt(BD, w, 'skel_archer', -3, 0);
    t.eq(hitsOn(w, near).map((x) => x.dmg), [12, 18]);
    up(BD, w, 'holy_light', 5);
    for (let i = 0; i < 9; i++) killAt(BD, w, 'goblin', 6, 6);
    t.eq(hitsOn(w, near).length, 2, 'nine kills: no cross');
    killAt(BD, w, 'goblin', -3, 0);
    t.eq(hitsOn(w, near).map((x) => x.dmg), [12, 18, 18], 'the 10th kill (a goblin) bursts');
  },
  // ---- 갑옷 파쇄 ------------------------------------------------------------------------------
  'armor_break: 2 +20 % per crack · 3 a 5-crack death bursts 2.0u for 25 · 4 cracks on elites too (max 3) · 5 a heavy/elite kill empowers 3 swings ×1.5'(t) {
    const { BD, H, w } = world(t, { hand: ['armor_break'] });
    up(BD, w, 'armor_break', 2);
    const k = place(BD, w, 'dark_knight', 1.4, 0, { hp: 999 });
    for (let i = 0; i < 3; i++) swingOnce(BD, H, w);
    t.eq(hitsOn(w, k).map((x) => x.dmg), [10, 12, 14]);
    k.x += 20;
    up(BD, w, 'armor_break', 3);
    const sq = place(BD, w, 'squire', -3, 0, { hp: 1 });
    sq.statuses.sunder = { n: 5 };
    const near = place(BD, w, 'goblin', -3, 2.2, { hp: 999 }), far = place(BD, w, 'goblin', -3, 2.4, { hp: 999 });
    BD.combat.kill(w, sq);
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg]), [['burst', 25]]); // edge 1.88
    t.eq(hitsOn(w, far).length, 0);                                       // edge 2.08
    const sq4 = place(BD, w, 'squire', -3, 0, { hp: 1 }); sq4.statuses.sunder = { n: 4 };
    BD.combat.kill(w, sq4);
    t.eq(hitsOn(w, near).length, 1, 'four cracks: no burst');
    const el = place(BD, w, 'goblin', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w);
    t.assert(!el.statuses.sunder, 'level 3: no cracks on a beast elite');
    up(BD, w, 'armor_break', 4);
    for (let i = 0; i < 4; i++) swingOnce(BD, H, w);
    t.eq(hitsOn(w, el).map((x) => x.dmg), [10, 10, 12, 14, 16]);
    t.eq(el.statuses.sunder.n, 3);
    el.x += 20;
    up(BD, w, 'armor_break', 5);
    const g = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    killAt(BD, w, 'squire', 5, 5);
    for (let i = 0; i < 4; i++) swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [15, 15, 15, 10]);
  },
  // ---- 마력 역류 ------------------------------------------------------------------------------
  'mana_backlash: 2 +8 · 3 burst radius 2.4u · 4 burst 18 · 5 threats and elites of any type burst too'(t) {
    const { BD, H, w } = world(t, { hand: ['mana_backlash'] });
    up(BD, w, 'mana_backlash', 2);
    const m = place(BD, w, 'mage', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, m).map((x) => x.dmg), [18]);
    m.x += 20;
    up(BD, w, 'mana_backlash', 3);
    const near = place(BD, w, 'goblin', -3, 2.6, { hp: 999 }), far = place(BD, w, 'goblin', -3, 2.9, { hp: 999 });
    killAt(BD, w, 'mana_slime', -3, 0);
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg]), [['burst', 12]]); // edge 2.28
    t.eq(hitsOn(w, far).length, 0);                                       // edge 2.58
    up(BD, w, 'mana_backlash', 4);
    killAt(BD, w, 'mana_slime', -3, 0);
    killAt(BD, w, 'ghoul', -3, 0, { hp: 1 });       // undead threat: not yet
    t.eq(hitsOn(w, near).map((x) => x.dmg), [12, 18]);
    up(BD, w, 'mana_backlash', 5);
    const gh = place(BD, w, 'ghoul', -3, 0, { hp: 1 }); gh.flags.noRevive = true; BD.combat.kill(w, gh);
    killAt(BD, w, 'goblin', -3, 0);                  // fodder: no
    killAt(BD, w, 'goblin', -3, 0, { elite: true }); // elite: yes
    t.eq(hitsOn(w, near).map((x) => x.dmg), [12, 18, 18, 18]);
  },
  // ---- 망자의 안식 ----------------------------------------------------------------------------
  'rest_of_dead: 2 before +6 and goal 120 (already past it: awakens at once) · 3 burst 2.4u · 4 +5 all / +14 undead · 5 every 8th kill bursts'(t) {
    const { BD, H, w } = world(t, { hand: ['rest_of_dead'] });
    const c = BD.cardRt.get(w, 'rest_of_dead');
    for (let i = 0; i < 125; i++) killAt(BD, w, 'skel_archer', 6, 6);
    t.eq([c.state.progress, c.state.goal, c.state.awakened], [125, 150, false]);
    const u = place(BD, w, 'skel_archer', 1.2, 0, { hp: 999 });
    up(BD, w, 'rest_of_dead', 2);
    t.eq([c.state.goal, c.state.awakened], [120, true]);
    t.eq(evs(w, 'quest_awaken').length, 1);
    c.state.awakened = false; // look at the level-2 "before" number once
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [16]);
    c.state.awakened = true; u.x += 20;
    up(BD, w, 'rest_of_dead', 3);
    const near = place(BD, w, 'goblin', -3, 2.6, { hp: 999 });
    killAt(BD, w, 'skel_archer', -3, 0);
    t.eq(hitsOn(w, near).map((x) => [x.source, x.dmg]), [['burst', 20]]);
    up(BD, w, 'rest_of_dead', 4);
    const g = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, g).map((x) => x.dmg), [15]);
    g.x += 20; u.x -= 20;
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, u).map((x) => x.dmg), [16, 24]);
    u.x += 20;
    up(BD, w, 'rest_of_dead', 5);
    for (let i = 0; i < 7; i++) killAt(BD, w, 'goblin', 6, 6);
    t.eq(hitsOn(w, near).length, 1);
    killAt(BD, w, 'goblin', -3, 0);
    t.eq(hitsOn(w, near).length, 2, 'the 8th kill bursts');
    // a card brought in at level 2 starts with goal 120 (the altar's inheritance)
    BD.cardRt.equip(w, 1, 'rest_of_dead', 2);
    t.eq(BD.cardRt.get(w, 'rest_of_dead').state.goal, 120);
  },
  // ---- 왕의 사냥 ------------------------------------------------------------------------------
  'kings_hunt: 2 before +6 · 3 a target kill drops one more 25-shard · 4 after ×1.9 · 5 the first blow on each target ×3'(t) {
    const { BD, H, w } = world(t, { hand: ['kings_hunt'] });
    const c = up(BD, w, 'kings_hunt', 2);
    const el = place(BD, w, 'goblin', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, el).map((x) => x.dmg), [16]);
    up(BD, w, 'kings_hunt', 3);
    const n0 = evs(w, 'shard_drop', (x) => x.value === 25).length;
    killAt(BD, w, 'goblin', 5, 5, { elite: true });
    t.eq(evs(w, 'shard_drop', (x) => x.value === 25).length - n0, 2, 'the elite\'s own 25 and one more');
    killAt(BD, w, 'goblin', 5, 5);
    t.eq(evs(w, 'shard_drop', (x) => x.value === 25).length - n0, 2, 'not for fodder');
    up(BD, w, 'kings_hunt', 4);
    BD.cardRt.awaken(w, c);
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, el).map((x) => x.dmg), [16, 19]);
    el.x += 20;
    up(BD, w, 'kings_hunt', 5);
    const fresh = place(BD, w, 'goblin', 1.2, 0, { hp: 999, elite: true });
    swingOnce(BD, H, w); swingOnce(BD, H, w);
    t.eq(hitsOn(w, fresh).map((x) => x.dmg), [57, 19], '10 × 1.9 × 3, then × 1.9');
    t.eq(evs(w, 'vfx', (x) => x.kind === 'royal_first').length, 1);
  },
  // ---- 불의 순례 ------------------------------------------------------------------------------
  'fire_pilgrimage: 2 every 3rd swing · 3 zone-immune before awakening, burst 2.0u · 4 burst 18'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage'] });
    up(BD, w, 'fire_pilgrimage', 2);
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    const lit = [];
    for (let i = 0; i < 6; i++) { swingOnce(BD, H, w); lit.push(!!e.statuses.burn); if (e.statuses.burn) BD.status.remove(w, e, 'burn'); }
    t.eq(lit, [false, false, true, false, false, true]);
    BD.hero.computeStats(w);
    t.eq(w.hero.stats.mods.zoneImmune, undefined, 'level 2: fire zones still burn');
    up(BD, w, 'fire_pilgrimage', 3);
    BD.hero.computeStats(w);
    t.eq(BD.W.hurtHero(w, 3, { source: 'zone', attack: 'fire_zone', enemyId: null }), false, 'level 3: immune before awakening');
    e.x += 20;
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'fire_pilgrimage'));
    const near = place(BD, w, 'goblin', -3, 2.2, { hp: 999 }); near.burnImmuneT = 9;
    const dying = place(BD, w, 'goblin', -3, 0, { hp: 1 });
    BD.status.apply(w, dying, 'burn', { direct: true });
    BD.combat.damage(w, dying, 5, { source: 'chain', direct: false });
    t.eq(hitsOn(w, near, 'burst').map((x) => x.dmg), [12], 'edge 1.88 ≤ 2.0');
    up(BD, w, 'fire_pilgrimage', 4);
    const d2 = place(BD, w, 'goblin', -3, 0, { hp: 1 });
    BD.status.apply(w, d2, 'burn', { direct: true });
    BD.combat.damage(w, d2, 5, { source: 'chain', direct: false });
    t.eq(hitsOn(w, near, 'burst').map((x) => x.dmg), [12, 18]);
  },
  'fire_pilgrimage 5: awakened, the hero leaves a burning trail (0.8u wide, 1.5 s, 5 per 0.5 s to enemies)'(t) {
    const { BD, H, w } = world(t, { hand: ['fire_pilgrimage'] });
    up(BD, w, 'fire_pilgrimage', 5);
    w.hero.x = 4.5;
    H.input({ mx: 1, my: 0 }); H.step(30);
    t.eq(w.zones.filter((z) => z.kind === 'pilgrim_trail').length, 0, 'not before awakening');
    BD.cardRt.awaken(w, BD.cardRt.get(w, 'fire_pilgrimage'));
    const x0 = w.hero.x;
    H.step(30);
    const zs = w.zones.filter((z) => z.kind === 'pilgrim_trail');
    t.assert(zs.length >= 4 && zs.length <= 6, 'a patch every 0.4u: ' + zs.length);
    t.eq([zs[0].r * 2, zs[0].life <= 1.5, zs[0].enemyDmg, zs[0].dmg, zs[0].tick], [0.8, true, 5, 0, 0.5]);
    H.input({ mx: 0, my: 0 });
    const e = place(BD, w, 'goblin', -(w.hero.x - x0) / 2, 0, { hp: 999 }); // on the trail behind him
    w.hero.atkTimer = 99;
    for (let i = 0; i < 60; i++) { w.hero.atkTimer = 99; H.step(1); }
    t.assert(hitsOn(w, e, 'burn').every((x) => x.dmg === 5) && hitsOn(w, e, 'burn').length >= 1, 'burnt by the trail');
    t.eq(w.hero.hp, 100, 'never the hero');
  },
  // ---- 무결 ----------------------------------------------------------------------------------
  'flawless: 2 every 20 kills · 3 at the top one blow is blocked (no damage, stack 0) · 4 echo ×0.75, blade +0.6u'(t) {
    const { BD, H, w } = world(t, { hand: ['flawless'] });
    const c = up(BD, w, 'flawless', 2);
    for (let i = 0; i < 19; i++) killAt(BD, w, 'goblin', 5, 5);
    t.eq(c.state.stack, 0);
    killAt(BD, w, 'goblin', 5, 5);
    t.eq(c.state.stack, 1);
    up(BD, w, 'flawless', 3);
    BD.cardRt.setStack(w, c, 6, 'gain');
    t.eq(BD.W.hurtHero(w, 9, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'b1' }), false);
    t.eq([w.hero.hp, c.state.stack, w.hero.invuln], [100, 0, 1.0]);
    t.eq(evs(w, 'hurt').length, 0, 'a blocked blow is no hurt');
    t.assert(evs(w, 'toast').some((x) => x.text === '무결: 한 번을 막았다'));
    t.eq(evs(w, 'vfx', (x) => x.kind === 'flawless_block').length, 1);
    w.hero.invuln = 0;
    BD.cardRt.setStack(w, c, 5, 'gain');
    t.eq(BD.W.hurtHero(w, 9, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'b2' }), true, 'below the top: no block');
    t.eq(w.hero.hp, 91);
    up(BD, w, 'flawless', 4);
    BD.cardRt.setStack(w, c, 6, 'gain');
    t.near(BD.hero.computeStats(w).reach, 2.5, 1e-9);
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w); H.step(13);
    t.eq(hitsOn(w, e, 'echo').map((x) => x.dmg), [8], '10 × 0.75');
  },
  'flawless 5: max 8; at 8 the echo comes twice (0.2 s and 0.4 s); the block waits for 8'(t) {
    const { BD, H, w } = world(t, { hand: ['flawless'] });
    const c = up(BD, w, 'flawless', 5);
    t.eq(BD.cardRt.maxStack(c), 8);
    BD.cardRt.setStack(w, c, 6, 'gain');
    t.eq(BD.W.hurtHero(w, 1, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'x' }), true, '6 is not the top any more');
    BD.cardRt.setStack(w, c, 8, 'gain');
    w.hero.invuln = 0;
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    H.step(12); t.eq(hitsOn(w, e, 'echo').length, 1);
    H.step(12); t.eq(hitsOn(w, e, 'echo').length, 2);
    H.step(30); t.eq(hitsOn(w, e, 'echo').length, 2);
    t.eq(c.def.hud(c.state, BD.cardRt.ctx(w, c)).badge, '잔영×2');
  },
  // ---- 일섬 ----------------------------------------------------------------------------------
  'one_flash: 2 tip zone 0.9u · 3 +1.5 per stack · 4 pierce from 3 · 5 at 8 a tip swing adds 일섬 (8u × 1.0u at 1.5)'(t) {
    const { BD, H, w } = world(t, { hand: ['one_flash'] });
    const c = BD.cardRt.get(w, 'one_flash');
    const e = place(BD, w, 'goblin', 1.32 + 0.1, 0, { hp: 9999 }); // edge 1.1: R − 0.8
    swingOnce(BD, H, w);
    t.eq(c.state.stack, 0, 'level 1: 0.8 inside the tip is not the tip');
    up(BD, w, 'one_flash', 2);
    swingOnce(BD, H, w);
    t.eq(c.state.stack, 1, 'level 2: the tip zone is 0.9u');
    up(BD, w, 'one_flash', 3);
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, e).slice(-1)[0].dmg, 13, '10 + 1.5 × 2');
    up(BD, w, 'one_flash', 4);
    swingOnce(BD, H, w);
    t.eq(c.state.stack, 3);
    t.eq(w.lastSwing.shapes.filter((s) => s.kind === 'line').map((s) => [s.card, s.len]), [['one_flash', 4.2]], 'pierce from 3');
    up(BD, w, 'one_flash', 5);
    BD.cardRt.setStack(w, c, 7, 'gain');
    w.hero.x = 6.5;
    e.x = w.hero.x + 1.42;
    const far = place(BD, w, 'goblin', 7.5, 0.3, { hp: 9999 }); // beyond the 6u pierce line, inside 8u
    swingOnce(BD, H, w);
    t.eq(c.state.stack, 8);
    const ln = w.lastSwing.shapes.filter((s) => s.kind === 'line').map((s) => [s.len, s.width, s.factor]);
    t.eq(ln, [[6.0, 1.4, 1.0], [8, 1.0, 1.5]]);
    t.eq(hitsOn(w, far).map((x) => x.dmg), [33], '(10 + 1.5 × 8) × 1.5');
    e.x = w.hero.x + 1.0;                     // edge 0.68 < 0.7: too close — no 일섬 on that swing
    swingOnce(BD, H, w);
    t.eq(w.lastSwing.shapes.filter((s) => s.kind === 'line' && s.len === 8).length, 0);
  },
};
