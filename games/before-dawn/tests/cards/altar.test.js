// The v2 altar (GDD-V2 §4.6, §5.5, §10.3, §10.4 V9): standing on the site opens a choice of kind
// 'altar' with three offered cards; a card goes into the slot the player empties and takes that
// slot's level (quest progress and combo stacks go with the old card); or a prayer, HP +30; once a
// floor; 나중에 keeps it for later. Through app.cmd('choice', …) and the bot.
const { world, place, evs } = require('./_kit');
const SITE = 'tests/cards/altar_site.js';

function altarWorld(t, hand) {
  const o = world(t, { hand, extraFiles: [SITE] });
  const { BD, w } = o;
  w.unlocked = BD.cards.ids();
  const site = { id: BD.W.id(w), kind: 'test_altar', x: w.hero.x + 3, y: w.hero.y, state: 'idle', known: true, optional: true, progress: 0, need: 0.8 };
  w.sites.push(site);
  return Object.assign(o, { site });
}
const stand = (H, w, site) => { w.hero.x = site.x; w.hero.y = site.y; w.hero.atkTimer = 99; };

module.exports = {
  'standing 0.8 s on the altar opens it: three offers, the world stands still, altar_open + choice_open'(t) {
    const { BD, H, w, site } = altarWorld(t, ['pierce', 'flame', 'leech']);
    stand(H, w, site);
    H.step(47);
    t.eq(w.choiceOpen, false);
    H.step(2);
    t.eq([w.choiceOpen, w.choice.kind, w.choice.step, site.state], [true, 'altar', 'choose', 'active']);
    t.eq(w.choice.offers.length, 3);
    t.assert(w.choice.offers.every((id) => !['pierce', 'flame', 'leech'].includes(id)));
    t.eq(w.choice.options.map((o) => o.pick), w.choice.offers.map((id) => 'card:' + id));
    t.eq([w.choice.pray, BD.cardAltar.PRAY], [30, 30]);
    t.eq(evs(w, 'site_start').map((x) => [x.kind, x.optional]), [['test_altar', true]]);
    t.eq(evs(w, 'altar_open').length, 1);
    t.eq(evs(w, 'choice_open').map((x) => [x.kind, x.options.length]), [['altar', 3]]);
    t.eq(H.app.overlay(), 'choice');
    t.eq(H.state().choice, { kind: 'altar', options: w.choice.offers.map((id) => 'card:' + id) });
    const h = H.hash(), t0 = w.t;
    H.step(600);
    t.eq([H.hash(), w.t], [h, t0], 'the world waits for the answer');
  },
  'swap (V9): the new card takes the emptied slot\'s level; quest progress and stacks go; the site is used'(t) {
    const { BD, H, w, site } = altarWorld(t, ['pierce', 'chain_slash', 'rest_of_dead']);
    const up = (id, L) => { const c = BD.cardRt.get(w, id); while (c.level < L) BD.cardRt.levelUp(w, c); };
    up('pierce', 2); up('chain_slash', 4); up('rest_of_dead', 3);
    BD.cardRt.setStack(w, BD.cardRt.get(w, 'chain_slash'), 6, 'gain');
    BD.cardRt.get(w, 'rest_of_dead').state.progress = 40;
    stand(H, w, site); H.step(49);
    const offers = w.choice.offers.slice();
    H.cmd('choice', 'pick', 1);
    t.eq([w.choice.step, w.choice.pick], ['slot', 1]);
    t.eq(w.choice.options.map((o) => [o.slot, o.from]), [[0, 2], [1, 4], [2, 3]]);
    t.eq(w.choice.options[1].pick, 'swap:chain_slash>' + offers[1]);
    H.cmd('choice', 'back');
    t.eq(w.choice.step, 'choose');
    H.cmd('choice', 'pick', 0);
    H.cmd('choice', 'slot', 1);
    const c = w.cards[1];
    t.eq([c.id, c.level, c.state.level], [offers[0], 4, 4]);
    t.eq(BD.cardRt.has(w, 'chain_slash'), false);
    t.eq(evs(w, 'combo_change').slice(-1)[0].reason, 'swap');
    t.eq(evs(w, 'card_swap').map((x) => [x.slot, x.outId, x.inId]), [[1, 'chain_slash', offers[0]]]);
    t.eq(evs(w, 'choice_pick').map((x) => [x.kind, x.pick]), [['altar', 'swap:chain_slash>' + offers[0]]]);
    t.eq(evs(w, 'altar_close').map((x) => x.choice), ['card']);
    t.eq([w.choiceOpen, site.state, w.hero.invuln >= 0.5, w.botAltarUsed], [false, 'used', true, true]);
    t.eq(evs(w, 'site_clear').map((x) => x.kind), ['test_altar']);
    t.assert(evs(w, 'toast').some((x) => x.text === '성인을 새겼다: ' + BD.cards.get(offers[0]).name + ' 4단계'));
    // the quest card's progress goes with it too
    BD.cardAltar.open(w, null);
    const qOffer = w.choice.offers[2];
    H.cmd('choice', 'pick', 2); H.cmd('choice', 'pick', 2); // in step 'slot' a pick is the slot
    t.eq([w.cards[2].id, w.cards[2].level], [qOffer, 3]);
    t.eq(BD.cardRt.has(w, 'rest_of_dead'), false);
    H.step(120);
    t.eq(site.state, 'used', 'once a floor');
  },
  'pray: HP +30, the site is used; 나중에: the site waits until the hero steps off, then the same offers again'(t) {
    const { BD, H, w, site } = altarWorld(t, ['pierce', 'flame', 'leech']);
    w.hero.hp = 50;
    stand(H, w, site); H.step(49);
    const offers = w.choice.offers.slice();
    H.cmd('choice', 'later');
    t.eq([w.choiceOpen, site.state], [false, 'active']);
    t.eq(evs(w, 'choice_pick').length, 0, '나중에 is no pick');
    t.eq(evs(w, 'altar_close').map((x) => x.choice), ['later']);
    H.step(120);
    t.eq([w.choiceOpen, site.state], [false, 'active'], 'standing on it does not reopen it');
    w.hero.x += 3; H.step(1);
    t.eq(site.state, 'idle');
    stand(H, w, site); H.step(50);
    t.eq([w.choiceOpen, w.choice.offers], [true, offers]);
    H.cmd('choice', 'pray');
    t.eq([w.hero.hp, w.choiceOpen, site.state], [80, false, 'used']);
    t.eq(evs(w, 'heal').map((x) => [x.amount, x.source]), [[30, 'altar']]);
    t.eq(evs(w, 'altar_pray').length, 1);
    t.eq(evs(w, 'choice_pick').map((x) => [x.kind, x.pick]), [['altar', 'pray']]);
    let threw = false; try { H.cmd('choice', 'pray'); } catch (e) { threw = true; }
    t.assert(threw, 'a closed altar takes no command');
  },
  'commands out of turn throw; a level choice is not answered by altar commands'(t) {
    const { BD, H, w } = altarWorld(t, ['pierce', 'flame', 'leech']);
    BD.cardAltar.open(w, null);
    for (const [c, a] of [['slot', 0], ['pick', 3], ['dance', 0]]) {
      let threw = false; try { H.cmd('choice', c, a); } catch (e) { threw = true; }
      t.assert(threw, c + ' ' + a);
    }
    H.cmd('choice', 'pray');
    BD.growth.open(w, 'level');
    let threw = false; try { H.cmd('choice', 'pray'); } catch (e) { threw = true; }
    t.assert(threw, 'pray is not a growth answer');
  },
  'the bot: mixed prays below 60 HP, else takes the first offer into the lowest non-conditional slot; pray always prays'(t) {
    const { BD, H, w } = altarWorld(t, ['chain_slash', 'pierce', 'flame']);
    const up = (id, L) => { const c = BD.cardRt.get(w, id); while (c.level < L) BD.cardRt.levelUp(w, c); };
    up('pierce', 3); up('flame', 2);
    w.hero.hp = 55;
    BD.cardAltar.open(w, null);
    t.eq(BD.bot.choose(w, { policy: 'mixed' }), ['choice', 'pray']);
    w.hero.hp = 100;
    t.eq(BD.bot.choose(w, { policy: 'pray' }), ['choice', 'pray']);
    t.eq(BD.bot.choose(w, { policy: 'mixed' }), ['choice', 'pick', 0]);
    H.cmd.apply(null, BD.bot.choose(w, { policy: 'card' }));
    t.eq(BD.bot.choose(w, { policy: 'card' }), ['choice', 'slot', 2], 'flame (level 2) — the combo card is kept');
    const offer = w.choice.offers[0];
    H.app.botOn = true;
    H.step(1); // app.step answers through the bot
    t.eq([w.choiceOpen, w.cards[2].id, w.cards[2].level], [false, offer, 2]);
  },
  'a bot run with an altar on floors 1–5: every one is answered through app.step, no exception, levels kept'(t) {
    const { load } = require('../../tools/load');
    const BD = load({ extraFiles: [SITE] });
    const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
    app.save.unlocked = BD.cards.ids();
    app.botOn = true; app.botOpts = { trial: false };
    const n = { card_swap: 0, altar_pray: 0, altar: 0 };
    app.onWorld((w2) => {
      w2.bus.on('card_swap', () => n.card_swap++); w2.bus.on('altar_pray', () => n.altar_pray++);
      w2.bus.on('choice_open', (x) => { if (x.kind === 'altar') n.altar++; });
    });
    const w = app.startRun({ seed: 21, hand: ['pierce', 'flame', 'leech'], level: 1 });
    let site = null;
    for (let i = 0; i < 60 * 900 && app.mode === 'play'; i++) {
      if (w.floorN <= 5 && (!site || !w.sites.includes(site))) { // a new floor: its altar
        site = { id: BD.W.id(w), kind: 'test_altar', x: w.hero.x, y: w.hero.y, state: 'idle', known: true, optional: true, progress: 0, need: 0.8 };
        w.sites.push(site);
      }
      if (site && site.state === 'idle') { site.x = w.hero.x; site.y = w.hero.y; } // the hero stands on it
      app.step();
    }
    const used = n.card_swap + n.altar_pray;
    t.eq(used, Math.min(5, w.floorN), 'one use on each floor reached (to 5F): ' + n.card_swap + ' swaps, ' + n.altar_pray + ' prayers');
    t.eq(n.altar, used);
    for (const c of w.cards.filter(Boolean)) t.assert(c.level >= 1 && c.level <= 5);
  },
};
