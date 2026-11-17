// The v2 proof slice (docs/GDD-V2.md §11.1): big floors, the simulation camera's rules, the horde
// director, shards / levels / the growth choice, boons, the purge task and the floor's end, the
// site hook, the state dump, and the §10.4 V9 scenarios that the slice covers.
'use strict';

const M = (BD) => BD.math;
// A v2 run on `floor` (level 1 unless given), the director running unless `calm`.
function run(t, o) {
  o = o || {};
  const BD = t.load(o.extraFiles ? { extraFiles: o.extraFiles } : undefined);
  const H = BD.harness();
  H.start({ seed: o.seed || 3, hand: o.hand || [], floor: o.floor || 1, level: o.level || 1, task: o.task });
  const w = H.world();
  if (o.calm) { // a staged scene: the entry packs removed without kills, no director, no choice overlay
    for (const e of w.enemies.slice()) BD.W.removeEnemy(w, e, 'recycle');
    w.enemies = []; w.shards = []; w.stats.recycled = 0; w.scenario = true; w.freezeT = 0;
  }
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
}
const evs = (w, name) => w.bus.recent(4000).filter((x) => x.event === name);

module.exports = {
  // ---- generation (§5.1, §5.3, §5.8, §3.3) -------------------------------------------------------
  // (each layout's own guarantees over 200 seeds: tests/floors/gen.test.js)
  'v2 floors: 48 × 48 in the task’s layout, start (40, 40), stairs on a back wall of zone (0, 0), §5.8, 1F beast, every type on 2F–5F, neighbours differ': (t) => {
    const BD = t.load(), F = BD.C.V2.floor;
    const seen = new Set();
    for (let s = 1; s <= 200; s++) {
      const r = BD.gen.run(s, 0);
      t.assert(r.v2, 'v2 run');
      t.eq(r.domOrder[0], 'beast', `seed ${s} 1F`);
      for (const ty of ['undead', 'magic', 'heavy']) t.assert(r.domOrder.slice(1).includes(ty), `seed ${s}: ${ty} on 2F–5F`);
      for (let n = 1; n <= 5; n++) {
        const f = r.floors[n], L = f.layout, tag = `seed ${s} ${n}F`;
        if (n > 1) t.assert(r.domOrder[n - 1] !== r.domOrder[n - 2], tag + ' neighbours differ');
        t.eq([f.w, f.h, f.floorKind], [48, 48, BD.tasks.get(f.task).layout], tag);
        t.eq(L.start, F.start, tag);
        const st = L.stairs;
        t.assert(st.side === 'y0' ? st.y === 0 && st.x >= 4 && st.x <= 12 : st.x === 0 && st.y >= 4 && st.y <= 12, tag + ' stairs door');
        t.eq(BD.gen.checkV2(BD.Grid.fromString(f.w, f.h, f.cells), L), null, tag);
        t.eq(BD.enemies.get(f.guardian).type, f.domType, tag + ' guardian type');
        t.assert(L.zones[8] === 'open' && L.zones[0] === 'open' && L.zones[4] === BD.gen.layouts.get(f.floorKind).centre, tag + ' zones');
        seen.add(f.guardian);
      }
      const roof = r.floors[6];
      t.eq([roof.w, roof.h, roof.layout.bossPos, roof.layout.start, roof.layout.flasks, roof.summon], [28, 28, [14, 14], [24, 24], [[4, 22], [22, 4]], []]);
    }
    t.assert(seen.size >= 5, 'guardians of many kinds: ' + [...seen]);
    t.eq(JSON.stringify(BD.gen.run(7, 0)), JSON.stringify(BD.gen.run(7, 0)), 'pure');
    t.eq(BD.gen.run(7, 0, { task: 'purge' }).floors[1].task, 'purge');
    t.eq(BD.gen.run(7, 0, { task: 'seals' }).floors[1].floorKind, 'office');
  },

  // ---- the simulation's view rules (§5.6) ----------------------------------------------------------
  'an enemy starts an attack only after 0.5 s inside the combat window; fodder also 0.5 s next to the hero': (t) => {
    const { BD, H, w } = run(t, { calm: true });
    w.hero.atkTimer = 1e9; BD.view.snapCam(w);
    const far = BD.W.makeEnemy(w, 'slime', w.hero.x - 12, w.hero.y - 12, {}); // off screen when made
    t.eq(far.viewT, 0);
    t.assert(!BD.ai.canAttack(w, far));
    far.x = w.hero.x + 2; far.y = w.hero.y; // walked in
    H.step(29); t.assert(!BD.ai.canAttack(w, far), 'not yet');
    H.step(2); t.assert(BD.ai.canAttack(w, far), 'after 0.5 s in view');
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 4, w.hero.y, {});
    t.eq(g.viewT, BD.C.V2.seenFor, 'made in view counts as seen');
    H.step(40); t.assert(!BD.ai.canAttack(w, g) || g.nearT >= 0.5, 'fodder far from the hero waits');
    g.x = w.hero.x + 1.2; g.nearT = 0; g.stunT = 99; H.step(31);
    t.assert(BD.ai.canAttack(w, g), 'fodder after 0.5 s near the hero');
  },
  'a warning that starts outside the combat window counts as unseen; hostile shots vanish 2u outside the screen': (t) => {
    const { BD, H, w } = run(t, { calm: true });
    BD.view.snapCam(w);
    const e = BD.W.makeEnemy(w, 'goblin', w.hero.x - 14, w.hero.y - 14, {}); e.stunT = 1e9;
    BD.ai.telegraph(w, e, { shape: 'circle', x: w.hero.x, y: w.hero.y, r: 1, time: 0.5, attack: 'stab' });
    H.step(31);
    t.eq(w.stats.unseenHits, 1, 'the hit is counted (V7 would fail)');
    const p = BD.hazards.projectile(w, { x: w.hero.x, y: w.hero.y - 1, dir: -Math.PI / 2, speed: 20, range: 40, r: 0.15, dmg: 1, kind: 'arrow', attack: 'shot', ownerKind: 'skel_archer' });
    let k = 0; while (!p.dead && k++ < 200) H.step(1);
    t.assert(p.dead && p.travelled < 30, 'gone well before its range: ' + p.travelled.toFixed(1));
    t.assert(!BD.view.onScreen(w, p.x, p.y, -2) && BD.view.onScreen(w, p.x, p.y + 0.5, -2), 'vanished as it crossed 2u outside S');
  },

  // ---- the director (§3.4) ----------------------------------------------------------------------
  'director: two packs stand in view at entry; packs come from outside the screen; tokens, caps, surge at 25 s': (t) => {
    const { BD, H, w } = run(t, { hand: ['whirl'] });
    const at0 = w.enemies.filter((e) => BD.W.onScreen(w, e.x, e.y)).length;
    t.assert(at0 >= 6, 'two entry packs on screen: ' + at0);
    const spawned = [];
    w.bus.on('spawn', (ev) => { if (ev.via === 'director') spawned.push(BD.W.onScreen(w, ev.x, ev.y)); });
    H.bot(true);
    let maxTok = 0, maxAlive = 0;
    for (let i = 0; i < 60 * 30; i++) {
      H.step(1);
      if (w.choiceOpen) H.step(1);
      maxTok = Math.max(maxTok, w.director.tokens);
      maxAlive = Math.max(maxAlive, w.enemies.filter((e) => !e.dead).length);
    }
    t.assert(spawned.length >= 40, 'packs arrive: ' + spawned.length);
    t.eq(spawned.filter(Boolean).length, 0, 'every director spawn is off screen');
    t.assert(maxTok <= BD.C.DIRECTOR.tokenMax + 1e-9 && maxAlive <= BD.C.CAP.enemies);
    t.eq(evs(w, 'surge').map((x) => [x.floor, x.n]), [[1, 1]]);
    t.assert(evs(w, 'banner').some((x) => x.text === '몰려온다'));
    t.assert(w.director.want > 0 && w.director.have > 0);
  },
  'director: regular enemies left 24u (threats 30u) behind off screen for 3 s vanish without a kill or shards; guardians stay': (t) => {
    const { BD, H, w } = run(t, { calm: true });
    w.hero.x = 40; w.hero.y = 40; BD.view.snapCam(w); w.hero.atkTimer = 1e9;
    w.director.off = false;
    const f = BD.W.makeEnemy(w, 'goblin', 10, 10, {}); f.stunT = 1e9;
    const th = BD.W.makeEnemy(w, 'slime', 22, 13, {}); th.stunT = 1e9;   // ~32u: beyond 30
    const near = BD.W.makeEnemy(w, 'slime', 25, 25, {}); near.stunT = 1e9; // ~21u: stays
    const g = BD.W.makeEnemy(w, 'goblin', 9, 12, { guardian: true }); g.stunT = 1e9;
    H.step(60 * 3 - 5);
    t.assert(!f.dead && !th.dead, 'not before 3 s');
    H.step(10);
    t.assert(f.dead && th.dead && !near.dead && !g.dead, 'recycled');
    t.eq(evs(w, 'kill').length, 0); t.eq(w.shards.length, 0); t.eq(w.stats.recycled, 2);
  },

  // ---- shards, levels, the choice (§4.1–4.3) -----------------------------------------------------
  'V9: a 1F goblin dies to one swing at radiance 0; its shard is drawn in only inside the pick-up radius and gives a pickup with its value': (t) => {
    const { BD, H, w } = run(t, { calm: true });
    t.eq(w.hero.radiance, 0);
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.5, w.hero.y, {}); g.stunT = 99;
    w.hero.atkTimer = 0; H.step(1);
    t.assert(g.dead, 'one swing');
    t.eq(w.shards.length, 1);
    const s = w.shards[0];
    H.step(30);
    t.eq(w.shards.length, 1, 'the shard 1.5u away stays (pick-up 1.2u)');
    t.near(s.x, g.x, 0.2);
    w.hero.x += 0.5; H.step(30);
    t.eq(w.shards.length, 0, 'inside 1.2u it flies in');
    t.eq(evs(w, 'pickup').map((x) => [x.kind, x.value]), [['shard', 1]]);
    t.eq([w.hero.xp, w.hero.level], [1, 1]);
  },
  'V9: a full gauge → level_up → choice_open; the world holds until a pick (600 ticks, same hash); the pick levels the card': (t) => {
    const { BD, H, w } = run(t, { hand: ['pierce', 'flame'], calm: true });
    w.scenario = false; w.director.off = true;
    BD.growth.drop(w, w.hero.x, w.hero.y, 12);
    H.step(20); // 0.2 s pop, then it flies in
    t.eq(evs(w, 'level_up').map((x) => x.level), [2]);
    t.assert(w.choiceOpen && H.app.overlay() === 'choice');
    const open = evs(w, 'choice_open')[0];
    t.eq(open.kind, 'level'); t.eq(open.options.length, 3);
    t.eq(open.options.filter((p) => p.startsWith('card:')).length, 2, 'two equipped cards can grow: 2 cards + 1 boon');
    const h0 = H.hash();
    H.step(600);
    t.eq(H.hash(), h0, 'nothing moves while it is open');
    const i = w.choice.options.findIndex((o) => o.id === 'pierce');
    H.cmd('choice', 'pick', i);
    t.assert(!w.choiceOpen);
    t.eq(BD.cardRt.get(w, 'pierce').level, 2);
    t.eq(evs(w, 'choice_pick').slice(-1)[0].pick, 'card:pierce');
    t.eq(evs(w, 'card_level').map((x) => [x.cardId, x.level]), [['pierce', 2]]);
    t.near(w.hero.invuln, 0.5, 1e-9);
    t.eq(H.state().cards.find((c) => c.id === 'pierce').level, 2, 'dumped');
  },
  'choice: 1 growable card → 1 card + 2 boons; none → 3 boons; maxed things never offered; cards not offered last time first; breath fills': (t) => {
    const { BD, H, w } = run(t, { hand: ['pierce', 'whirl', 'flame'], calm: true });
    const open = () => { const c = BD.growth.open(w, 'level'); return c.options.map((o) => o.kind + ':' + o.id); };
    const close = () => { w.choiceOpen = false; w.lastCards = w.choice.lastCards; };
    const a = open(); close(); const b = open(); close();
    t.eq(a.filter((x) => x.startsWith('card')).length, 2);
    const inA = a.filter((x) => x.startsWith('card')), inB = b.filter((x) => x.startsWith('card'));
    t.assert(inB.includes(['card:pierce', 'card:whirl', 'card:flame'].find((x) => !inA.includes(x))), 'the card left out last time comes first');
    for (const c of w.cards) if (c.id !== 'flame') while (c.level < 5) BD.cardRt.levelUp(w, c);
    const c1 = open(); close();
    t.eq(c1.filter((x) => x.startsWith('card')), ['card:flame']); t.eq(c1.filter((x) => x.startsWith('boon')).length, 2);
    while (BD.cardRt.get(w, 'flame').level < 5) BD.cardRt.levelUp(w, BD.cardRt.get(w, 'flame'));
    const c0 = open(); close();
    t.eq(c0.filter((x) => x.startsWith('boon')).length, 3);
    for (const id of BD.boons.ids()) while ((w.hero.boons[id] || 0) < 3) BD.growth.giveBoon(w, id);
    t.eq(open(), ['breath:breath', 'breath:breath', 'breath:breath'], 'nothing left: 여명의 숨');
    w.hero.hp = 50; H.cmd('choice', 'pick', 0); t.eq(w.hero.hp, 70);
  },
  'two levels at once open two choices one after the other; the pick shoves fodder within 3u out by 1.5u': (t) => {
    const { BD, H, w } = run(t, { hand: ['pierce'], calm: true });
    w.scenario = false; w.director.off = true;
    const g = BD.W.makeEnemy(w, 'goblin', w.hero.x + 1.5, w.hero.y, {}); g.stunT = 1e9; g.hp = 1e6; w.hero.atkTimer = 1e9;
    BD.growth.addXp(w, 12 + 24);
    t.eq(w.hero.level, 3);
    H.step(1); t.assert(w.choiceOpen);
    H.cmd('choice', 'pick', 0);
    H.step(3);
    t.assert(w.choiceOpen, 'the second choice opens on the next tick');
    H.cmd('choice', 'pick', 0);
    H.step(12); t.assert(!w.choiceOpen);
    t.near(BD.math.dist(g.x, g.y, w.hero.x, w.hero.y), 1.5 + 1.5 + 1.5 * (1 / 9), 0.1, 'shoved out by 1.5u (the second shove lands on a goblin already moving out)');
    t.eq(evs(w, 'choice_pick').length, 2);
  },
  'level curve 12, 24, then round(30 + 7L); boons edge / quick / draw change the stats each tick': (t) => {
    const { BD, w } = run(t, { calm: true });
    t.eq([1, 2, 3, 4, 5, 6, 8, 10, 23].map(BD.growth.need), [12, 24, 51, 58, 65, 72, 86, 100, 191]);
    for (let i = 0; i < 3; i++) { BD.growth.giveBoon(w, 'edge'); BD.growth.giveBoon(w, 'quick'); BD.growth.giveBoon(w, 'draw'); }
    const s = BD.hero.computeStats(w);
    t.eq(s.dmgBase, 10 + 6); t.near(s.interval, 0.6 * 0.79, 1e-9); t.near(w.hero.pickupR, 3.6, 1e-9);
    t.eq(evs(w, 'boon').map((x) => x.rank).slice(-3), [3, 3, 3]);
  },
  'shards on the floor are capped at 200: the farthest joins its nearest, values add': (t) => {
    const { BD, w } = run(t, { calm: true });
    for (let i = 0; i < 205; i++) BD.growth.drop(w, 2 + (i % 20) * 2, 2 + Math.floor(i / 20) * 2, 1);
    t.eq(w.shards.length, 200);
    t.eq(w.shards.reduce((a, s) => a + s.v, 0), 205);
  },

  // ---- the task and the floor's end (§5.4, §5.5) ------------------------------------------------------
  'purge: every kill counts to 200; then the guardian appears at (8, 8) after 2 s and waits for the hero within 10u; its fall clears the floor': (t) => {
    const { BD, H, w } = run(t, { calm: true });
    t.eq([w.task.kind, w.task.goal], ['purge', 200]);
    for (let i = 0; i < 199; i++) { const e = BD.W.makeEnemy(w, 'goblin', w.hero.x + 2, w.hero.y, {}); BD.combat.kill(w, e); }
    t.eq(w.task.value, 199); t.assert(!w.task.done);
    BD.combat.kill(w, BD.W.makeEnemy(w, 'goblin', w.hero.x + 2, w.hero.y, {}));
    t.assert(w.task.done);
    t.eq(evs(w, 'task_clear').map((x) => [x.floor, x.task]), [[1, 'purge']]);
    t.eq(evs(w, 'task_progress').length, 200);
    H.step(119); t.eq(w.enemies.filter((e) => e.guardian).length, 0);
    H.step(3);
    const g = w.enemies.find((e) => e.guardian);
    t.assert(g && BD.math.dist(g.x, g.y, 8, 8) < 1, 'at the stairs zone centre');
    t.assert(g.dormant, 'waits');
    const x0 = g.x; H.step(60); t.eq(g.x, x0);
    w.hero.x = 15; w.hero.y = 12; H.step(2);
    t.assert(!g.dormant, 'wakes within 10u');
    // floor clear: the horde scatters (dissolve, no shards), all shards fly in, stairs open
    for (let i = 0; i < 5; i++) BD.W.makeEnemy(w, 'goblin', w.hero.x + 3 + i, w.hero.y, {}).stunT = 99;
    BD.growth.drop(w, 40, 40, 5);
    const n0 = w.bus.count(), v0 = w.shards.reduce((a, x) => a + x.v, 0);
    BD.combat.kill(w, g);
    t.eq(evs(w, 'floor_clear').map((x) => x.floor), [1]);
    t.eq(w.enemies.filter((e) => !e.dead).length, 0);
    t.eq(evs(w, 'dissolve').length, 5);
    t.assert(w.stairs.open && w.hero.radiance === 1);
    t.eq(w.shards.reduce((a, x) => a + x.v, 0), v0 + 60, 'the guardian drops 10 × 6');
    t.assert(w.shards.every((x) => x.pull), 'every shard on the floor flies in');
    H.step(240);
    t.eq(w.shards.length, 0, 'V9: all picked up');
    t.assert(w.bus.count() > n0);
  },
  'the director halves while the guardian is up and stops after the floor clear': (t) => {
    const { BD, H, w } = run(t, {});
    H.bot(true);
    H.step(600);
    const want0 = w.director.want;
    BD.taskRt.set(w, w.task.goal);
    H.step(30);
    t.eq(w.director.state, 'guardian');
    t.assert(w.director.want < want0 * 0.6, `want ${w.director.want} vs ${want0}`);
    H.step(130);
    const g = w.enemies.find((e) => e.guardian);
    BD.combat.kill(w, g);
    H.step(60);
    t.eq(w.director.state, 'clear');
    t.eq(w.enemies.filter((e) => !e.dead).length, 0);
  },

  // ---- sites (the hook for the next agents) --------------------------------------------------------
  'site hook: a stay ring uses a site (site_start, site_clear); a total-time site keeps its progress when left': (t) => {
    const { BD, H, w } = run(t, { calm: true, extraFiles: [t.fixture('test_site.js')] });
    w.floor.layout.sites = [{ kind: 'test_spring', x: w.hero.x, y: w.hero.y }, { kind: 'test_seal', x: w.hero.x - 6, y: w.hero.y }];
    BD.siteRt.start(w);
    w.hero.hp = 30;
    H.step(75); // 1.2 s
    t.eq(w.hero.hp, 70); t.eq(w.sites[0].phase, 'used');
    t.eq(evs(w, 'site_start').map((x) => [x.kind, x.optional]), [['test_spring', true]]);
    w.hero.x -= 6; H.step(60 * 3);
    w.hero.x += 6; H.step(60);
    t.near(w.sites[1].progress, 3, 0.05, 'progress kept outside the ring');
    w.hero.x -= 6; H.step(60 * 2 + 2);
    t.eq(w.sites[1].phase, 'active');
    H.step(61);
    t.eq(w.sites[1].phase, 'used');
    t.eq(evs(w, 'site_clear').map((x) => x.kind), ['test_spring', 'test_seal']);
    t.eq(H.state().sites.map((x) => x.phase), ['used', 'used']);
  },

  // ---- starts, the dump, the bot -----------------------------------------------------------------------
  '&floor=N starts at the floor’s level (choices by the bot), &level and &task work; the dump has the v2 fields': (t) => {
    const BD = t.load(), H = BD.harness();
    H.start({ seed: 4, floor: 3 });
    let s = H.state();
    t.eq([s.floor, s.hero.level, s.hero.radiance], [3, 10, 2]);
    t.eq(s.cards.reduce((a, c) => a + c.level - 1, 0) + Object.values(s.hero.boons).reduce((a, b) => a + b, 0), 9, 'nine picks taken');
    H.start({ seed: 4, level: 5, task: 'purge' });
    s = H.state();
    t.eq([s.floor, s.hero.level, s.task.kind, s.task.goal, s.floorKind], [1, 5, 'purge', 200, 'plaza']);
    for (const k of ['cam', 'shards', 'task', 'sites', 'director', 'choice', 'unseenHits']) t.assert(k in s, 'dump field ' + k);
    for (const k of ['level', 'xp', 'xpNeed', 'boons', 'pickupR']) t.assert(k in s.hero, 'hero field ' + k);
    t.assert(s.enemies.length && s.enemies.every((e) => ['fodder', 'threat'].includes(e.role) && typeof e.inView === 'boolean'));
  },
  'a v2 bot run is deterministic and its choices come from BD.bot.choose': (t) => {
    const BD = t.load();
    const a = BD.simRun({ seed: 12, maxSec: 70, hashAt: [30, 60] }), b = BD.simRun({ seed: 12, maxSec: 70, hashAt: [30, 60] });
    t.eq(a.hashes, b.hashes);
    t.assert(a.app.world.bus.counts().choice_pick >= 2, 'choices in the first 70 s');
    t.assert(a.kills > 100, 'kills: ' + a.kills);
  },
};
