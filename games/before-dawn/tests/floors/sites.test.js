// The places to visit (들를 곳, GDD-V2 §4.6, §5.5): spring, chest, rift, altar — their use, their
// looks for the art (state), the '?' until near, the markers the minimap and the screen edge get.
'use strict';
const K = require('./_kit');

module.exports = {
  'spring: not used at full HP; 1.2 s in its ring at HP 30 → +40, once; full → dry (site_start / site_clear, optional)': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', seed: 2, keepGuards: false });
    const s = K.site(w, 'spring');
    t.eq([s.phase, s.state, s.optional, s.need], ['idle', 'full', true, 1.2]);
    K.place(BD, w, s.x, s.y); H.step(60 * 3);
    t.eq([s.phase, s.progress, w.hero.hp], ['idle', 0, 100], 'left for later at full HP');
    w.hero.hp = 30; H.step(71);
    t.eq([s.phase, s.state, w.hero.hp], ['idle', 'full', 30]);
    H.step(2);
    t.eq([s.phase, s.state, w.hero.hp], ['used', 'dry', 70]);
    t.eq(K.evs(w, 'site_start').concat(K.evs(w, 'site_clear')).map((x) => [x.event, x.kind, x.optional]), [['site_start', 'spring', true], ['site_clear', 'spring', true]]);
    w.hero.hp = 30; K.place(BD, w, s.x + 3, s.y); K.place(BD, w, s.x, s.y); H.step(120);
    t.eq(w.hero.hp, 30, 'once');
  },

  'chest: two threats and six fodder wait round it and wake together in view; 0.8 s → choose one of your cards (+1 level; a maxed card gives its place to a boon), a halo drops; closed → open; waiting guards scatter at the floor clear': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', seed: 2, hand: ['pierce', 'flame', 'leech'] });
    const chests = w.sites.filter((s) => s.kind === 'chest');
    t.eq(chests.length, 2, '1F has two chests');
    const c = chests[0], group = 'chest:' + c.id;
    const guards = K.live(w, (e) => e.flags.wake === group), wait = K.live(w, (e) => e.flags.wake === 'chest:' + chests[1].id);
    t.eq([guards.filter((e) => e.role === 'threat').length, guards.filter((e) => e.role === 'fodder').length], [2, 6]);
    t.assert(guards.every((e) => e.dormant && e.flags.keep && BD.math.dist(e.x, e.y, c.x, c.y) <= 4.6), 'standing round it');
    w.hero.invuln = 1e9;
    K.place(BD, w, c.x + 7, c.y + 5); H.step(2);
    t.assert(guards.every((e) => !e.dormant && !e.flags.keep), 'awake together, recyclable again');
    for (const e of guards) BD.W.removeEnemy(w, e, 'recycle');
    BD.cardRt.get(w, 'flame').level = BD.cardRt.maxLevel(BD.cardRt.get(w, 'flame').def);
    K.place(BD, w, c.x, c.y); H.step(47);
    t.eq(c.phase, 'idle'); H.step(2);
    t.assert(w.choiceOpen && H.app.overlay() === 'choice', 'the overlay is open');
    t.eq(w.choice.kind, 'chest');
    t.eq(w.choice.options.map((o) => o.kind + ':' + o.id + ':' + o.from + '>' + o.to).slice(0, 1).concat(w.choice.options.map((o) => o.kind)), ['card:pierce:1>2', 'card', 'boon', 'card']);
    t.eq(K.evs(w, 'choice_open').slice(-1)[0].kind, 'chest');
    t.eq([c.phase, c.state], ['used', 'open']);
    t.eq(w.pickups.filter((p) => p.kind === 'halo').length, 1, 'a halo beside it');
    t.assert(BD.math.dist(w.pickups.find((p) => p.kind === 'halo').x, w.pickups.find((p) => p.kind === 'halo').y, c.x, c.y) < 2);
    H.cmd('choice', 'pick', 2);
    t.eq(BD.cardRt.get(w, 'leech').level, 2, 'the card picked grows');
    t.eq(K.evs(w, 'choice_pick').slice(-1)[0], Object.assign({}, K.evs(w, 'choice_pick').slice(-1)[0], { kind: 'chest', pick: 'card:leech' }));
    // the other chest's guards (waiting, or woken and no longer kept) go with the floor clear
    t.eq(wait.length, 8);
    t.assert(wait.every((e) => !e.dead));
    BD.taskRt.floorClear(w);
    t.assert(wait.every((e) => e.dead), 'scattered');
  },

  'rift (2F+): 1.5 s → an elite and two packs out of warnings; the elite down → radiance +1, two big shards, a holy stone; available → active → spent': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', seed: 2, floor: 2, keepGuards: false });
    const r = K.site(w, 'rift');
    t.assert(r && r.optional, '2F has its rift');
    t.eq(r.state, 'available');
    w.hero.invuln = 1e9;
    K.place(BD, w, r.x, r.y); H.step(91);
    t.eq([r.phase, r.state], ['active', 'active']);
    const elite = w.rifts.filter((x) => x.opts.elite), packs = w.rifts.filter((x) => !x.opts.elite && x.opts.flags.rift === r.id);
    t.eq(elite.length, 1); t.assert(packs.length >= 8, 'two packs: ' + packs.length);
    t.eq(elite[0].kind, BD.places.eliteKind(w));
    H.step(75);
    const e = K.live(w, (x) => x.flags.riftElite)[0];
    t.assert(e && e.elite && e.flags.keep, 'the elite came, kept through a floor clear');
    const rad = w.hero.radiance, d0 = K.evs(w, 'shard_drop').length;
    BD.combat.kill(w, e);
    t.eq(w.hero.radiance, rad + 1);
    t.eq(K.evs(w, 'shard_drop').slice(d0).map((x) => x.value).sort((a, b) => a - b), [25, 25, 25], 'its own 25 and the rift’s two');
    t.eq(w.pickups.filter((p) => p.kind === 'holy_stone').length, 1);
    t.eq([r.phase, r.state], ['used', 'spent']);
    t.eq(K.evs(w, 'site_clear').map((x) => [x.kind, x.optional]), [['rift', true]]);
    t.eq(w.stats.trials, 1);
    const f1 = BD.gen.run(2, 0).floors[1];
    t.assert(!f1.layout.sites.some((s) => s.kind === 'rift'), '1F: no rift');
  },

  'altar: known and lit from the start; 0.8 s opens the cards side’s altar choice; 나중에 re-arms once he has left the ring; a prayer uses it': (t) => {
    const { BD, H, w } = K.start(t, { task: 'purge', seed: 2, keepGuards: false, hand: ['pierce'] });
    const a = K.site(w, 'altar');
    t.eq([a.known, a.state, a.phase], [true, 'lit', 'idle']);
    K.place(BD, w, a.x, a.y); H.step(50);
    t.assert(w.choiceOpen && w.choice.kind === 'altar' && H.app.overlay() === 'choice', 'open');
    t.eq([a.phase, w.altar], ['active', null], 'no v1 altar on a v2 floor');
    t.assert(w.choice.offers.length > 0, 'offers from the cards side');
    const offers = w.choice.offers.slice();
    H.cmd('choice', 'later');
    t.eq([a.phase, a.needExit, w.choiceOpen], ['idle', true, false]);
    H.step(120);
    t.assert(!w.choiceOpen, 'not again while he stands there');
    K.place(BD, w, a.x + 3, a.y); H.step(2);
    t.eq(a.needExit, false);
    K.place(BD, w, a.x, a.y); H.step(50);
    t.assert(w.choiceOpen && w.choice.kind === 'altar', 'again after stepping out and back');
    t.eq(w.choice.offers, offers, 'the same offers');
    w.hero.hp = 40;
    H.cmd('choice', 'pray');
    t.eq([a.phase, a.state, w.choiceOpen], ['used', 'used', false]);
    t.assert(w.hero.hp > 40, 'prayer heals');
    t.eq(K.evs(w, 'altar_open').length, 2);
    t.eq(K.evs(w, 'site_clear').map((x) => x.kind), ['altar']);
  },

  'unknown until near: an optional site shows its kind within 16u (the altar from the start); the dump carries phase, state, known': (t) => {
    const { BD, H, w } = K.start(t, { task: 'seals', seed: 6, keepGuards: false });
    const far = w.sites.filter((s) => s.optional && s.kind !== 'altar' && BD.math.dist(s.x, s.y, w.hero.x, w.hero.y) > 16);
    t.assert(far.length >= 1);
    t.assert(far.every((s) => !s.known), 'unknown');
    t.assert(w.sites.filter((s) => !s.optional).every((s) => s.known), 'task places known');
    const s = far[0];
    K.place(BD, w, s.x + 15.5, s.y); H.step(1);
    t.assert(s.known, 'known within 16u');
    const d = H.state().sites.find((x) => x.id === s.id);
    t.eq([d.kind, d.phase, d.state, d.known, d.optional], [s.kind, 'idle', s.state, true, true]);
  },

  'markers: task places on the edge and the minimap, optional sites on the minimap only, the spring and flasks on the edge at HP ≤ 50; used places turn grey': (t) => {
    const { BD, H, w } = K.start(t, { task: 'seals', seed: 6, keepGuards: false });
    const collect = () => { const out = []; BD.render.markers.get('places').collect(w, out); return out; };
    let m = collect();
    const bySite = (s) => m.find((x) => x.id === 's' + s.id);
    for (const s of w.sites) t.assert(bySite(s), 'a marker for ' + s.kind);
    t.assert(w.sites.filter((s) => !s.optional).every((s) => bySite(s).edge !== false && bySite(s).color === '#ffd24a'), 'task places: edge, gold');
    t.assert(w.sites.filter((s) => s.optional).every((s) => bySite(s).edge === false || s.kind === 'spring'), 'optional: minimap only');
    t.eq(m.filter((x) => x.edge !== false && x.kind === 'objective').length, 3);
    w.hero.hp = 40; BD.pickupRt.drop(w, 'flask', 30, 30);
    for (const s of w.sites) s.known = true;
    m = collect();
    const sp = w.sites.find((s) => s.kind === 'spring');
    if (sp) t.assert(bySite(sp).edge === true, 'spring on the edge at low HP');
    t.eq(m.filter((x) => x.id.startsWith('f')).map((x) => [x.mini, x.color]), [[false, '#3aa0ff']], 'flask: edge only');
    const seal = w.sites.find((s) => s.kind === 'seal');
    BD.siteRt.clear(w, seal);
    m = collect();
    t.eq([bySite(seal).edge, bySite(seal).color], [false, '#8a8790'], 'a broken seal is grey, minimap only');
    // the hunt's chiefs are marked from the start
    const h = K.start(t, { task: 'hunt', seed: 6, keepGuards: false });
    const out = []; h.BD.render.markers.get('places').collect(h.w, out);
    t.eq(out.filter((x) => x.id.startsWith('c')).length, 3);
  },
};
