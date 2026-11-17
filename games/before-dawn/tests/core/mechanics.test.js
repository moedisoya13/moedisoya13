// Engine mechanics. Content-independent: uses the reference content and test fixtures.
function world(t, o) {
  const BD = t.load({ extraFiles: [t.fixture('test_cards.js')] });
  const H = BD.harness();
  H.start({ seed: 5, hand: [] });
  const w = H.world();
  H.killAll(); w.wave.n = 3; w.freezeT = 0;
  ((o && o.hand) || []).forEach((id, i) => H.give(id, i));
  w.hero.x = w.grid.w / 2 + 0.5; w.hero.y = w.grid.h / 2 + 0.5;
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
}
const types = (w, from) => w.bus.recent(4000).slice(from || 0).map((e) => e.event);

module.exports = {
  'swing processing order ①…⑧'(t) {
    const { BD, H, w } = world(t);
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.0, w.hero.y, {});
    e.hp = 1; e.stunT = 99;
    const n0 = w.bus.count();
    H.step(2);
    const seq = w.bus.recent(w.bus.count() - n0).map((x) => x.event).filter((x) => ['swing', 'strike', 'hit', 'kill', 'swing_end'].includes(x));
    t.eq(seq, ['swing', 'strike', 'hit', 'kill', 'swing_end']);
  },
  'first enemy in reach is cut at once; no swing without a target'(t) {
    const { BD, H, w } = world(t);
    H.step(120);
    t.eq(w.bus.counts().swing || 0, 0);
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.2, w.hero.y, {});
    e.stunT = 99;
    H.step(1);
    t.eq(w.bus.counts().swing, 1);
  },
  'unknown ids fail loudly'(t) {
    const BD = t.load();
    const H = BD.harness();
    t.assert.throws(() => H.start({ seed: 1, hand: ['no_such_card'] }), /unknown card id/);
    t.assert.throws(() => BD.enemies.get('nope'), /unknown enemy id/);
    t.assert.throws(() => BD.Bus().emit('nope', {}), /undeclared event/);
    t.assert.throws(() => BD.Bus().emit('hit', { enemyId: 1 }), /missing field/);
  },
  'wet enemy + fire → steam hit (fixed 8, indirect)'(t) {
    const { BD, H, w } = world(t, { hand: ['test_flame'] });
    const e = BD.W.makeEnemy(w, 'slime', w.hero.x + 1.2, w.hero.y, {});
    e.hp = 500; e.stunT = 99;
    H.step(2);
    const steam = w.bus.recent(200).filter((x) => x.event === 'hit' && x.source === 'steam');
    t.assert(steam.length >= 1, 'steam hit');
    t.eq(steam[0].dmg, 8); t.eq(steam[0].direct, false);
    t.assert(e.statuses.wet, 'slime stays wet');
    t.assert(!e.statuses.burn, 'no burn after steam');
  },
  'burn ticks 3 every 0.5 s and spreads'(t) {
    const { BD, H, w } = world(t);
    const a = BD.W.makeEnemy(w, 'goblin', 2.5, 2.5, {}), b = BD.W.makeEnemy(w, 'goblin', 3.3, 2.5, {});
    a.hp = b.hp = 500; a.stunT = b.stunT = 99;
    BD.status.apply(w, a, 'burn', { direct: true });
    H.step(31);
    const burns = w.bus.recent(400).filter((x) => x.event === 'hit' && x.source === 'burn' && x.enemyId === a.id);
    t.eq(burns.length, 1); t.eq(burns[0].dmg, 3);
    t.assert(b.statuses.burn, 'spread to the neighbour');
  },
  'knockback into a wall slams (8 dmg, stun) with tide-like knock'(t) {
    const { BD, H, w } = world(t, { hand: ['test_tide'] });
    w.hero.x = 2.6; w.hero.y = w.grid.h / 2 + 0.5;
    const e = BD.W.makeEnemy(w, 'goblin', 1.1, w.hero.y, {});
    e.hp = 500; e.stunT = 0;
    H.step(20);
    const slam = w.bus.recent(400).filter((x) => x.event === 'hit' && x.source === 'slam');
    t.assert(slam.length >= 1, 'slam hit'); t.eq(slam[0].dmg, 8);
  },
  'dash: passes enemies, 5 dmg body hit, dodge once per attack'(t) {
    const { BD, H, w } = world(t);
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.0, w.hero.y + 1.0, {});
    e.hp = 500; e.stunT = 99;
    w.hero.atkTimer = 99; w.hero.stats.interval = 99;
    BD.hazards.telegraph(w, { shape: 'circle', x: w.hero.x, y: w.hero.y, r: 5, time: 0.45, dmg: 10, attack: 'stab', owner: e });
    H.step(20);
    H.input({ mx: 0.7071, my: 0.7071, dash: true });
    H.step(1);
    H.input({ mx: 0, my: 0 });
    H.step(12);
    const ev = w.bus.recent(400);
    const dashHit = ev.find((x) => x.event === 'hit' && x.source === 'dash');
    t.assert(dashHit && dashHit.dmg === 5 && dashHit.direct, 'dash body hit');
    t.eq(ev.filter((x) => x.event === 'dodge').length, 1);
    t.eq(w.hero.hp, 100);
    t.assert(Math.hypot(w.hero.x - e.x, w.hero.y - e.y) > 0.5, 'went through');
  },
  'hurt: 1.0 s invulnerability and knock'(t) {
    const { BD, H, w } = world(t);
    const hit1 = BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab', x: w.hero.x - 1, y: w.hero.y });
    const hit2 = BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab', x: w.hero.x - 1, y: w.hero.y });
    t.eq([hit1, hit2], [true, false]);
    H.step(58);
    t.eq(BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab' }), false, 'still invulnerable at 0.97 s');
    H.step(3);
    t.eq(BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab' }), true);
    t.eq(w.hero.hp, 80);
  },
  'revive rule: down then up; burning prevents it'(t) {
    const { BD, H, w } = world(t);
    w.hero.atkTimer = 99; w.hero.stats.interval = 99;
    const a = BD.W.makeEnemy(w, 'test_reviver', 2.5, 2.5, {});
    BD.combat.damage(w, a, 50, { source: 'chain', direct: false });
    t.assert(a.down && !a.dead, 'down');
    H.step(160);
    t.assert(!a.down && !a.dead && a.hp === 30, 'revived with 30');
    const b = BD.W.makeEnemy(w, 'test_reviver', 4.5, 2.5, {});
    BD.status.apply(w, b, 'burn', { direct: true });
    BD.combat.damage(w, b, 50, { source: 'chain', direct: false });
    t.assert(b.dead, 'burning → dies');
  },
  'enemies never walk into the 0.8u keep-out ring (idle hero)'(t) {
    const BD = t.load();
    const H = BD.harness();
    // seed 2: a crowd can still push an idle hero into the ring (moveHero steps him out of bodies;
    // seeds 1 and 7 show it on the base commit too) — this test is about enemies walking in, and the
    // v2 floors' sites changed seed 3's run (docs/requests/v2-floors.md)
    H.start({ seed: 2, hand: [] });
    H.input({ mx: 0, my: 0 });
    const w = H.world();
    w.hero.invuln = 1e9; // a hit knocks the hero 0.5u (W.hurtHero) — that is him moving, not an enemy walking in
    let worst = 9;
    for (let i = 0; i < 60 * 60 && H.app.mode === 'play'; i++) {
      H.step(1);
      for (const e of w.enemies) if (!e.dead && !e.down && !e.lunging && !e.lastLunge && !e.knock) worst = Math.min(worst, BD.W.edgeDist(w, e));
    }
    t.assert(worst >= 0.8 - 0.02, 'min edgeDist ' + worst);
  },
  'altar offers exclude equipped and already offered cards'(t) {
    const BD = t.load({ extraFiles: [t.fixture('test_cards.js')] });
    const run = BD.gen.run(8, 0);
    const pool = ['pierce', 'chain_slash', 'test_flame', 'test_tide'];
    const o1 = BD.cardRt.offers(run, 1, 0, ['pierce'], [], pool);
    t.assert(!o1.includes('pierce'));
    const o2 = BD.cardRt.offers(run, 1, 1, ['pierce'], o1, pool);
    for (const id of o2) t.assert(!o1.includes(id) && id !== 'pierce');
  },
  'gen is a pure function of (seed, tier)'(t) {
    const BD = t.load();
    t.eq(JSON.stringify(BD.gen.run(77, 1)), JSON.stringify(BD.gen.run(77, 1)));
    t.assert(JSON.stringify(BD.gen.run(77, 0).floors[2]) !== JSON.stringify(BD.gen.run(78, 0).floors[2]));
  },
  'tier modifiers accumulate'(t) {
    const BD = t.load();
    const m = BD.tierMods(3);
    t.eq([m.enemyHp, m.elitePlus, m.runSec, m.guardianDmg, m.flask, m.enemySpeed], [1.2, 1, 780, 1.25, 20, 1.1]);
  },
  'save holds only §11 fields and unlocks are evaluated at run end'(t) {
    const BD = t.load({ extraFiles: [t.fixture('test_cards.js')] });
    const s = BD.progress.fresh();
    t.eq(Object.keys(s).sort(), BD.progress.FIELDS.slice().sort());
    t.assert(!s.unlocked.includes('test_flame'));
  },
  // GDD-V2 §4.4 level 1 (v1 was: +1 per kill, +2 per stack, 4 s without a direct hit)
  'chain_slash: every 10th kill +1 stack, +1 per stack, timeout reset after 2 s without a kill'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = BD.cardRt.get(w, 'chain_slash');
    for (let i = 0; i < 10; i++) {
      const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.0, w.hero.y, {}); e.hp = 1; e.stunT = 99;
      w.hero.atkTimer = 0; H.step(2);
      t.assert(e.dead, 'kill ' + i);
    }
    t.eq(c.state.stack, 1);
    const tough = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.0, w.hero.y, {}); tough.hp = 500; tough.stunT = 99;
    w.hero.atkTimer = 0; H.step(1);
    t.eq(w.bus.recent(50).filter((x) => x.event === 'hit' && x.enemyId === tough.id)[0].dmg, 10 + 1);
    tough.hp = 0; BD.combat.resolveDeaths(w); // the 11th kill refills the timer
    const far = BD.W.makeEnemy(w, 'goblin', w.hero.x + 5, w.hero.y, {}); far.stunT = 99; // on screen, out of reach
    w.hero.atkTimer = 99;
    H.step(60 * 2 - 10); t.eq(c.state.stack, 1, 'still up just before 2 s');
    H.step(12); t.eq(c.state.stack, 0);
    const ev = w.bus.recent(400).filter((x) => x.event === 'combo_change');
    t.eq(ev.map((x) => x.reason), ['gain', 'timeout']);
  },
  'hero projectile (wave): ranged acquire with LOS, hits at 0.6 factor, skips blade hits'(t) {
    const { BD, H, w } = world(t, { hand: ['test_wave'] });
    w.hero.x = 2.5; w.hero.y = 2.5;
    const e = BD.W.makeEnemy(w, 'slime', 7.5, 2.5, {}); e.hp = 500; e.stunT = 99;
    H.step(40);
    const hits = w.bus.recent(400).filter((x) => x.event === 'hit' && x.source === 'wave');
    t.assert(hits.length >= 1, 'wave hit');
    t.eq(hits[0].dmg, Math.round(10 * 0.6));
  },
  'echo strike via ctx.after + ctx.strike: source echo at half damage, no extra swing events'(t) {
    const { BD, H, w } = world(t, { hand: ['test_echo'] });
    const e = BD.W.makeEnemy(w, 'slime', w.hero.x + 1.2, w.hero.y, {}); e.hp = 500; e.stunT = 99;
    H.step(1);
    const swings = w.bus.counts().swing;
    H.step(13);
    const echo = w.bus.recent(400).filter((x) => x.event === 'hit' && x.source === 'echo');
    t.eq(echo.length, 1); t.eq(echo[0].dmg, 5);
    t.eq(w.bus.counts().swing, swings);
    t.eq(w.bus.counts().vfx, swings);
  },
  // v2 floors have no altar yet (it returns as a site, GDD-V2 §4.6); the altar rules and the bot's
  // answer still hold when one is lit
  'altar: bot picks an offered card into a non-conditional slot (card_swap), offers obey the pool'(t) {
    const BD = t.load({ extraFiles: [t.fixture('test_cards.js')] });
    const H = BD.harness();
    H.start({ seed: 4, hand: ['chain_slash', 'pierce'] });
    const w = H.world();
    H.killAll(); w.wave.n = 3; w.freezeT = 0;
    w.unlocked = ['test_flame', 'test_tide'];
    w.altar = { state: 'off', x: w.hero.x, y: w.hero.y, offers: [], offered: [], round: 0, step: 'choose', pick: null, needExit: false };
    BD.flow.lightAltar(w);
    t.assert(w.altar.offers.length >= 1, 'offers');
    BD.flow.openAltar(w);
    H.bot(true); H.step(3);
    const ev = w.bus.recent(4000);
    const swaps = ev.filter((x) => x.event === 'card_swap');
    t.assert(swaps.length >= 1, 'a swap happened');
    t.assert(swaps.every((x) => BD.cardRt.pool(['test_flame', 'test_tide']).includes(x.inId)));
    t.eq(swaps[0].slot, 1); // slot 0 holds the combo card (conditional) → leftmost non-conditional
  },
  'bot: steps out of the path of a hostile arrow already in flight (no telegraph left)'(t) {
    const run = (botOn) => {
      const { BD, H, w } = world(t);
      const h = w.hero;
      BD.hazards.projectile(w, { x: h.x - 6, y: h.y, dir: 0, speed: 12, range: 12, r: 0.15, dmg: 9, kind: 'arrow', attack: 'shot', ownerKind: 'skel_archer' });
      H.bot(botOn);
      const hp0 = h.hp, y0 = h.y;
      H.step(60);
      return { hurt: h.hp < hp0, moved: Math.abs(h.y - y0), hash: H.hash() };
    };
    const idle = run(false), bot = run(true), again = run(true);
    t.assert(idle.hurt, 'the arrow hits a hero who stands still');
    t.assert(!bot.hurt, 'the bot is not hit');
    t.assert(bot.moved > 0.2, 'the bot stepped sideways out of the line');
    t.eq(bot.hash, again.hash, 'deterministic');
  },

  // ---- docs/CONTROLS-REVIEW.md §3.3 (a, b), §3.5, §3.6 (a) ----
  'dash buffer: a press up to 0.2 s before the cooldown ends fires when it ends; earlier presses are dropped; floor entry and the altar clear it'(t) {
    // press for one tick `early` ticks before the cooldown ends (hold = keep pressing every tick);
    // returns the tick after the press on which the second dash starts, or -1
    const press = (early, hold) => {
      const { BD, H, w } = world(t);
      const h = w.hero;
      w.hero.atkTimer = 1e9;
      H.input({ mx: 1, my: 0, dash: true }); H.step(1); H.input({ mx: 1, my: 0 });
      while (h.dashCd > early / 60 + 1e-9) H.step(1);
      const n0 = types(w).filter((x) => x === 'dash').length;
      H.input({ mx: 1, my: 0, dash: true }); H.step(1); if (!hold) H.input({ mx: 1, my: 0 });
      let at = -1;
      for (let i = 1; i <= 30 && at < 0; i++) { H.step(1); if (types(w).filter((x) => x === 'dash').length > n0) at = i; }
      return at;
    };
    const ready = press(6, true);
    t.assert(ready >= 4 && ready <= 6, 'held: fires when the cooldown ends (' + ready + ')');
    t.eq(press(6), ready, '0.1 s early, one tick: fires on the same tick as a held press');
    t.eq(press(10), press(10, true), '0.17 s early: fires when it ends');
    t.eq(press(18), -1, '0.3 s early: not remembered');
    const { BD, H, w } = world(t);
    w.hero.dashCd = 0.1; H.input({ mx: 0, my: 0, dash: true }); H.step(1); H.input({ mx: 0, my: 0 });
    t.assert(w.hero.dashBuf > 0, 'buffered');
    BD.flow.enterFloor(w, 2);
    t.eq(w.hero.dashBuf, 0, 'a new floor drops the press');
    w.hero.dashBuf = 0.2; w.altar = w.altar || { x: 0, y: 0, offers: [], offered: [], round: 0 };
    BD.flow.openAltar(w);
    t.eq(w.hero.dashBuf, 0, 'opening the altar drops the press');
  },
  'idle dash: the last way the hero walked, not the way he faces his target; before any walking, the facing'(t) {
    const { BD, H, w } = world(t);
    const h = w.hero;
    w.hero.atkTimer = 1e9;
    H.input({ mx: 0, my: 1 }); H.step(10); H.input({ mx: 0, my: 0 });
    const e = BD.W.makeEnemy(w, 'goblin', h.x + 1.5, h.y, {}); e.stunT = 1e9; e.hp = e.maxHp = 1e6;
    H.step(5);
    t.near(h.face, 0, 1e-6, 'standing, he faces the target at +x');
    const x0 = h.x, y0 = h.y;
    H.input({ mx: 0, my: 0, dash: true }); H.step(1); H.input({ mx: 0, my: 0 }); H.step(15);
    t.near(h.x - x0, 0, 1e-6, 'no sideways part');
    t.assert(h.y - y0 > 3.1, 'dashed the last walked way (+y): ' + (h.y - y0));
    const fresh = world(t);
    fresh.w.hero.face = Math.PI; const fx = fresh.w.hero.x;
    fresh.H.input({ mx: 0, my: 0, dash: true }); fresh.H.step(1); fresh.H.input({ mx: 0, my: 0 }); fresh.H.step(15);
    t.assert(fx - fresh.w.hero.x > 3.1, 'never walked: along the facing');
  },
  'facing: the target every tick while there is one (backing off looks like backing off); 0.25 s after it is gone, the way he walks'(t) {
    const { BD, H, w } = world(t);
    const h = w.hero;
    const e = BD.W.makeEnemy(w, 'goblin', h.x + 1.2, h.y, {}); e.stunT = 1e9; e.hp = e.maxHp = 1e6;
    let off = 0;
    H.input({ mx: -1, my: 0 }); // walking away from it, still inside reach
    for (let i = 0; i < 10; i++) { H.step(1); if (h.targetId !== null && BD.math.angDiff(h.face, Math.atan2(e.y - h.y, e.x - h.x)) > 0.05) off++; }
    t.eq(off, 0, 'faces the target while walking away');
    t.assert(h.targetId === e.id, 'still the target');
    BD.combat.kill(w, e); H.step(1);
    const faceAtLoss = h.face;
    H.input({ mx: 0, my: 1 });
    H.step(13);
    t.near(h.face, faceAtLoss, 1e-9, 'holds the last face for 0.25 s');
    H.step(3);
    t.near(h.face, Math.PI / 2, 1e-9, 'then the way he walks');
  },
  'walking shoves regular enemies aside (not guardians, the boss or a lunging enemy); no shove when standing'(t) {
    const shoved = (opts, setup) => {
      const { BD, H, w } = world(t);
      const h = w.hero;
      h.x = 3; h.y = 4.5; w.hero.atkTimer = 1e9;
      const e = BD.W.makeEnemy(w, opts.kind || 'goblin', 4.2, 4.55, opts.make || {}); e.stunT = 1e9;
      if (setup) setup(e);
      const ex = e.x, ey = e.y;
      H.input(opts.input || { mx: 1, my: 0 }); H.step(opts.ticks || 45);
      return { dy: e.y - ey, dx: e.x - ex, heroX: h.x };
    };
    const g = shoved({});
    t.assert(g.dy > 0.3, 'goblin pushed off the line, to its own side (+y): ' + g.dy);
    t.assert(Math.abs(g.dx) < 1e-6, 'sideways only');
    t.assert(g.heroX > 5.2, 'the hero got past it: ' + g.heroX);
    t.assert(shoved({ make: { guardian: true }, kind: 'ghoul' }).dy === 0, 'a guardian is a wall');
    t.assert(shoved({ input: { mx: 0, my: 0 } }).dy === 0, 'no input, no shove');
    t.assert(shoved({}, (e) => { e.lunging = true; }).dy === 0, 'a lunging enemy is not shoved');
  },
  'corner assist: a pillar corner within reach slides round, a flat face stops; wall slide speed unchanged'(t) {
    const run = (hy, mx, my, ticks) => {
      const { BD, H, w } = world(t);
      let cells = '';
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) cells += x === 6 && y === 6 ? '#' : '.';
      w.grid = BD.Grid.fromString(12, 12, cells); w.field = null; w.hero.atkTimer = 1e9;
      w.hero.x = 4; w.hero.y = hy;
      H.input({ mx, my }); H.step(ticks);
      return [w.hero.x, w.hero.y];
    };
    t.assert(run(6.9, 1, 0, 90)[0] > 7, 'corner 0.1u off the line: round it');
    t.assert(run(6.75, 1, 0, 90)[0] > 7, 'corner 0.25u off the line: round it');
    t.near(run(6.6, 1, 0, 90)[0], 5.65, 1e-3, 'corner 0.4u off the line: stops at the face');
    t.near(run(6.5, 1, 0, 90)[0], 5.65, 1e-3, 'dead centre: stops at the face');
    // pushing into the outer wall at 60°–89°: the slide along it is what it was without the assist
    // (the probe runs along the wall, so it never steps off a flat wall)
    const slide = (deg, noAssist) => {
      const { BD, H, w } = world(t);
      if (noAssist) BD.C.CORNER.reach = 0;
      w.grid = BD.Grid(12, 12); w.field = null; // empty room: x = 0 is a flat wall
      w.hero.atkTimer = 1e9; w.hero.x = 0.36; w.hero.y = 4;
      const a = deg * Math.PI / 180;
      H.input({ mx: -Math.sin(a), my: Math.cos(a) }); H.step(60);
      return w.hero.y - 4;
    };
    for (const deg of [60, 75, 80, 89]) t.near(slide(deg), slide(deg, true), 1e-9, 'wall slide at ' + deg + '°');
  },
};

