// What a choice may offer, and when (GDD-V2 §4.3, §4.6, §10.4 V11): the growth choice (two cards +
// one boon, one card + two boons, three boons), the rotation that brings every card within two
// choices, the chest (my three cards; a top-level card's place goes to a boon), and no dead offer:
// never a card at level 5 or a boon at rank 3, never the same thing twice, 여명의 숨 only when
// nothing else can grow. Also the start hand under v2 (every card is dealt again).
const { world } = require('./_kit');

const kinds = (opts) => opts.map((o) => o.kind);
const maxCard = (BD, w, id) => { const c = BD.cardRt.get(w, id); while (c.level < 5) BD.cardRt.levelUp(w, c); };
const maxBoons = (BD, w, except) => { for (const id of BD.boons.ids()) if (id !== except) while ((w.hero.boons[id] || 0) < 3) BD.growth.giveBoon(w, id); };

function valid(t, BD, w, opts, what) {
  t.eq(opts.length, 3, what);
  for (const o of opts) {
    if (o.kind === 'card') { t.assert(o.from < 5 && o.to === o.from + 1, what + ': card ' + o.id + ' ' + o.from); t.assert(BD.cardRt.has(w, o.id)); }
    if (o.kind === 'boon') t.assert(o.from < BD.boons.get(o.id).max && o.to === o.from + 1, what + ': boon ' + o.id);
  }
  const real = opts.filter((o) => o.kind !== 'breath').map((o) => o.pick);
  t.eq(new Set(real).size, real.length, what + ': repeated ' + real);
}

module.exports = {
  'level choice: 2 cards + 1 boon, 1 card + 2 boons, 3 boons; the card lines are the next level\'s'(t) {
    const { BD, w } = world(t, { hand: ['pierce', 'flame', 'leech'] });
    let o = BD.growth.options(w);
    t.eq(kinds(o), ['card', 'card', 'boon']);
    valid(t, BD, w, o, 'three growable');
    for (const x of o.filter((y) => y.kind === 'card')) t.eq(x.text, BD.cards.get(x.id).levels[2].text);
    maxCard(BD, w, 'pierce'); maxCard(BD, w, 'flame');
    o = BD.growth.options(w);
    t.eq(kinds(o), ['card', 'boon', 'boon']);
    t.eq(o[0].id, 'leech');
    maxCard(BD, w, 'leech');
    o = BD.growth.options(w);
    t.eq(kinds(o), ['boon', 'boon', 'boon']);
    valid(t, BD, w, o, 'no card');
  },
  'no dead offer: once the boons run out the third growable card comes before 여명의 숨, which only fills what nothing else can'(t) {
    const { BD, w } = world(t, { hand: ['pierce', 'flame', 'leech'] });
    maxBoons(BD, w);
    let o = BD.growth.options(w);
    t.eq(kinds(o), ['card', 'card', 'card'], 'three cards, not a breath');
    valid(t, BD, w, o, 'boons maxed');
    maxCard(BD, w, 'pierce');
    o = BD.growth.options(w);
    t.eq(kinds(o), ['card', 'card', 'breath']);
    maxCard(BD, w, 'flame'); maxCard(BD, w, 'leech');
    t.eq(kinds(BD.growth.options(w)), ['breath', 'breath', 'breath']);
    const { BD: B2, w: w2 } = world(t, { hand: ['pierce'] }); // one card in hand
    maxBoons(B2, w2, 'edge');
    t.eq(kinds(B2.growth.options(w2)), ['card', 'boon', 'breath']);
  },
  'rotation: a card left out of one choice is in the next (any card within two choices)'(t) {
    const { BD, w } = world(t, { hand: ['pierce', 'whirl', 'flame'] });
    for (let i = 0; i < 40; i++) {
      const a = BD.growth.open(w, 'level'), first = a.options.filter((o) => o.kind === 'card').map((o) => o.id);
      const left = ['pierce', 'whirl', 'flame'].filter((id) => !first.includes(id));
      t.eq(left.length, 1);
      w.choiceOpen = false; w.lastCards = a.lastCards; // answered with the boon: no card grows
      const b = BD.growth.open(w, 'level');
      t.assert(b.options.some((o) => o.id === left[0]), 'round ' + i + ': ' + left[0] + ' comes back');
      w.choiceOpen = false; w.lastCards = b.lastCards;
    }
  },
  'chest: my three cards in slot order; a card at level 5 (or an empty slot) gives its place to a boon; then 여명의 숨'(t) {
    const { BD, w } = world(t, { hand: ['pierce', 'flame', 'leech'] });
    let o = BD.growth.options(w, 'chest');
    t.eq(o.map((x) => [x.kind, x.id, x.from, x.to]), [['card', 'pierce', 1, 2], ['card', 'flame', 1, 2], ['card', 'leech', 1, 2]]);
    maxCard(BD, w, 'flame');
    o = BD.growth.options(w, 'chest');
    t.eq(kinds(o), ['card', 'boon', 'card'], 'the boon takes flame\'s place (GDD-V2 §4.6 "5단계인 카드 자리")');
    t.eq([o[0].id, o[2].id], ['pierce', 'leech']);
    maxBoons(BD, w);
    t.eq(kinds(BD.growth.options(w, 'chest')), ['card', 'breath', 'card']);
    const { BD: B2, w: w2 } = world(t, { hand: ['whirl'] });
    t.eq(kinds(B2.growth.options(w2, 'chest')), ['card', 'boon', 'boon'], 'empty slots: boons');
    // a chest is a choice of its own kind; picking a card raises it; it leaves the rotation alone
    const lastBefore = BD.growth.open(w, 'level').lastCards; BD.growth.pick(w, 0);
    const ch = BD.growth.open(w, 'chest');
    t.eq(ch.kind, 'chest');
    t.eq(ch.lastCards, lastBefore);
    t.eq(w.bus.recent(50).filter((x) => x.event === 'choice_open').slice(-1)[0].kind, 'chest');
    const lv = BD.cardRt.get(w, 'pierce').level;
    BD.growth.pick(w, 0);
    t.eq(BD.cardRt.get(w, 'pierce').level, lv + 1);
    const cp = w.bus.recent(50).filter((x) => x.event === 'choice_pick').slice(-1)[0];
    t.eq([cp.kind, cp.pick], ['chest', 'card:pierce']);
  },
  'a whole run of choices (V11): three different options every time, never a top card or boon, 33 growths then only 여명의 숨'(t) {
    for (const hand of [['pierce', 'flame', 'leech'], ['sword_wave', 'tide', 'flawless'], ['kings_hunt', 'one_flash', 'riposte']]) {
      const { BD, w } = world(t, { hand });
      let grown = 0;
      for (let i = 0; i < 40; i++) {
        const ch = BD.growth.open(w, i % 6 === 5 ? 'chest' : 'level');
        valid(t, BD, w, ch.options, hand + ' #' + i);
        const growable = ch.options.map((o, k) => (o.kind !== 'breath' ? k : -1)).filter((k) => k >= 0);
        if (growable.length) grown++;
        BD.growth.pick(w, growable.length ? growable[i % growable.length] : 0);
      }
      t.eq(grown, 33, hand + ': 12 card levels + 21 boon ranks');
      t.eq(w.cards.map((c) => c.level), [5, 5, 5]);
      t.eq(BD.boons.ids().map((id) => w.hero.boons[id]), [3, 3, 3, 3, 3, 3, 3]);
    }
  },
  'start hand under v2: the §5.6 rule over every card; a fresh save deals the 12 base cards, a full one all 18'(t) {
    const { BD } = world(t);
    const base = BD.progress.fresh().unlocked, full = BD.cards.ids();
    const seenBase = new Set(), seenFull = new Set();
    for (let s = 1; s <= 400; s++) {
      for (const id of BD.cardRt.dealHand(s, base, 0)) seenBase.add(id);
      for (const id of BD.cardRt.dealHand(s, full, 0)) seenFull.add(id);
    }
    t.eq([...seenBase].sort(), base.slice().sort());
    t.eq([...seenFull].sort(), full.slice().sort());
  },
};
