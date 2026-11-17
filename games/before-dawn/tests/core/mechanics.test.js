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
  'hurt: 0.6 s invulnerability and knock'(t) {
    const { BD, H, w } = world(t);
    const hit1 = BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab', x: w.hero.x - 1, y: w.hero.y });
    const hit2 = BD.W.hurtHero(w, 10, { source: 'goblin', attack: 'stab', x: w.hero.x - 1, y: w.hero.y });
    t.eq([hit1, hit2], [true, false]);
    H.step(37);
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
    H.start({ seed: 3, hand: [] });
    H.input({ mx: 0, my: 0 });
    const w = H.world();
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
  'chain_slash: stack per kill, +2 per stack, timeout reset after 4 s without a direct hit'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = BD.cardRt.get(w, 'chain_slash');
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.0, w.hero.y, {}); e.hp = 1; e.stunT = 99;
    H.step(2);
    t.eq(c.state.stack, 1);
    const far = BD.W.makeEnemy(w, 'goblin', 1.5, 1.5, {}); far.stunT = 99;
    H.step(60 * 4 + 2);
    t.eq(c.state.stack, 0);
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
  'altar: bot picks an offered card into a non-conditional slot (card_swap), offers obey the pool'(t) {
    const BD = t.load({ extraFiles: [t.fixture('test_cards.js')] });
    const r = BD.simRun({ seed: 4, unlocked: ['test_flame', 'test_tide'], hand: ['chain_slash', 'pierce'] });
    const ev = r.app.world.bus.recent(4000);
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
};

