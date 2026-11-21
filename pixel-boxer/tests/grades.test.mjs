/* The grades of the defence and the footwork drills (docs/defense-footwork-grades-plan.md §4, §5.2), as the catalogue's rows
   fight them. Where the plan's numbers and the physics part company, what is held here is what the bout does (README: the
   deviations); every card is also held to the physics audit (tests/audit.test.mjs) and to its outcome (defense.test.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { WINDOWS } from '../src/windows.data.mjs';
import { outcome, drill as windowDrill, CARDS, window as windowOf, middle } from '../tools/windows.mjs';
import { defence, drill } from '../tools/grades.mjs';
import { sampleEvade, timeline } from '../src/anim/evade.mjs';
import { measure } from '../src/audit.mjs';
import { HOME } from '../src/footwork.mjs';
import { MOVES, LEFT_BEND, sampleMove, mirrorKnees } from '../src/anim/moves.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';

/* (a hook that lands on its sweep goes through where the head was at the height of the jaw, and a head has to be 23 cm under
   that line to let the glove over it. A beginner's and an amateur's weave go as deep as a pro's and deeper now, and slower:
   docs/moves-plan-5.md §2. Their windows are measured here as the bout fights them, for until node tools/windows.mjs --write
   has been run again, src/windows.data.mjs still says they have none) */
const LIVE = {};
const live = (card, lv) => {
  const key = card + '@' + lv;
  if (!LIVE[key]) {
    const c = CARDS.find(c => c.id === card),
      w = windowOf(c.punch, c.move, c.value, { all: lv }, c.guard),
      mid = middle(w.works);
    LIVE[key] = mid ? { from: mid.from, to: mid.to, at: mid.at, works: w.works } : { from: null, to: null, at: null, works: [] };
  }
  return LIVE[key];
};
const W = (card, lv) => (card === 'roll' && WINDOWS[card][lv].from === null ? live(card, lv) : WINDOWS[card][lv]);
const back = (card, lv) => W(card, lv).to;

test('grades: every grade gets out of the way of every card\'s punch, and the window written down is the bout\'s', () => {
  for (const card of CARDS) {
    for (const lv of LEVELS) {
      const w = W(card.id, lv);
      assert.ok(w && w.from !== null && w.to >= w.from && w.at >= w.from && w.at <= w.to, `${card.id}@${lv}: ${JSON.stringify(w)}`);
      // (a frame past the back end of it is too late: the window is measured, not written)
      const late = outcome(windowDrill(card.punch, card.move, card.value, w.to + 1, { all: lv }, card.guard));
      assert.notEqual(late && late.type, card.guard ? 'parry' : 'whiff', `${card.id}@${lv}: frame ${w.to + 1} still works`);
    }
    // from an amateur up, two frames or more where a pro has two (the slip at the cross is a frame for the dirty great ones)
    // (the weave under a hook that lands on its sweep: two frames for an amateur and a pro, a frame for a great one and a legend)
    for (const lv of ['2', '3', '4m', '5m']) if ((card.id !== 'slip-cross' || lv !== '4a') && (card.id !== 'roll' || lv === '2' || lv === '3')) assert.ok(W(card.id, lv).to - W(card.id, lv).from >= 1, `${card.id}@${lv}: ${W(card.id, lv).from}–${W(card.id, lv).to}`);
  }
});

test('grades: the better he is, the later he can leave it (the back end of the window)', () => {
  const order = (card, chain) => chain.every(([lo, hi, strict]) => (strict ? back(card, lo) < back(card, hi) : back(card, lo) <= back(card, hi)));
  assert.ok(order('slip', [['1', '2', true], ['2', '3'], ['3', '4m', true], ['4m', '5m']]), JSON.stringify(LEVELS.map(lv => back('slip', lv))));
  for (const card of ['slip-cross', 'pull']) assert.ok(order(card, [['1', '2', true], ['2', '3'], ['3', '4m'], ['4m', '5m']]), `${card}: ${LEVELS.map(lv => back(card, lv))}`);
  // (the weave: a beginner has to start it before an amateur, an amateur before a pro: docs/moves-plan-5.md §2.3)
  assert.ok(order('roll', [['1', '2', true], ['2', '3', true], ['3', '4m'], ['4m', '5m']]), `roll: ${LEVELS.map(lv => back('roll', lv))}`);
  /* (the duck: a beginner and an amateur both bow from the waist, and since the body takes the blow it blocks before the hook
     by its vector, an amateur's window ends on frames that clear the hook by under a millimetre: which of the two leaves it a
     frame or two later is not his grade. The textbook leaves it later than either.) */
  assert.ok(order('duck', [['1', '3'], ['2', '3']]) && Math.abs(back('duck', '1') - back('duck', '2')) <= 2, `duck: ${LEVELS.map(lv => back('duck', lv))}`);
  // a dirty great one leaves it no later than the clean one of his grade, by a frame at most (slips and the sway)
  for (const card of ['slip', 'slip-cross', 'pull']) for (const g of ['4', '5']) assert.ok(back(card, g + 'a') <= back(card, g + 'm') && back(card, g + 'm') - back(card, g + 'a') <= 1, `${card}@${g}`);
});

test('grades: a parry is a guard up in time, and how quickly the gloves get there is the grade', () => {
  const p = lv => W('parry', lv);
  assert.ok(p('1').to < p('2').to && p('2').to < p('3').to && p('3').to <= p('4m').to && p('4m').to <= p('5m').to, LEVELS.map(lv => p(lv).to).join(' '));
  // (a show-off's parry is a hammer of the rear fist that has to come down on the glove: his window is his own, and narrower,
  // docs/moves-plan-4.md §5.5; tests/show.test.mjs)
  const clean = LEVELS.filter(lv => !LEVEL[lv].cover.hammer);
  assert.ok(Math.max(...clean.map(lv => p(lv).from)) - Math.min(...clean.map(lv => p(lv).from)) <= 1, 'the front of the window is the rule\'s, not the grade\'s');
  const arrive = lv => LEVEL[lv].cover.arrive;
  assert.ok(arrive('1') > arrive('2') && arrive('2') > arrive('3') && arrive('3') >= arrive('4m') && arrive('4m') > arrive('5m'));
});

const cards = Object.fromEntries(['slip', 'pull', 'counter'].flatMap(item => LEVELS.map(lv => [`${item}@${lv}`, defence(`${item}@${lv}`)])));
test('grades: on the slip card the miss gets closer grade by grade, a legend\'s by a whisker', () => {
  const m = lv => cards[`slip@${lv}`].margin;
  assert.ok(m('2') > m('3') && m('3') > m('4m') && m('4m') > m('5m'), LEVELS.map(m).join(' '));
  assert.ok(m('5m') >= 0.5 && m('5m') <= 3, `5m: ${m('5m')} cm`);
  assert.ok(m('3') >= 3 && m('3') <= 7, `3: ${m('3')} cm`);
});

test('grades: the better he is, the less time an evasion ties him up', () => {
  for (const item of ['slip', 'pull']) {
    const t = lv => cards[`${item}@${lv}`].tied;
    assert.ok(t('1') > t('2') && t('2') > t('3') && t('3') > t('4m') && t('4m') > t('5m'), `${item}: ${LEVELS.map(t)}`);
  }
});

test('grades: out of a great one\'s slip the counter is wound up already: it gets there sooner and no weaker; a beginner\'s and an amateur\'s wait for the slip to end', () => {
  // the same card with the evasion leaving nothing wound up
  const unloaded = lv => {
    const base = DEFENSE.find(e => e.id === `counter@${lv}`),
      e = Object.assign({}, base, { setup: b => (b.fighters[0].skills = { all: Object.assign({}, LEVEL[lv], { evade: Object.assign({}, LEVEL[lv].evade, { load: 0 }) }) }) }),
      bout = freshBout(e);
    let start = null,
      hit = null;
    for (let tick = 0; tick < Math.round(e.loop * 60); tick++) {
      step(bout, drive(e, bout, tick / 60, 1 / 60), 1 / 60);
      for (const ev of bout.events) {
        if (ev.type === 'punch' && ev.who === 0) start = tick;
        if (ev.type === 'hit' && ev.who === 0) hit = { tick, J: ev.J };
      }
    }
    return { flight: Math.round((hit.tick - start) * 1000 / 60), J: hit.J };
  };
  for (const lv of ['4m', '5m']) {
    const loaded = cards[`counter@${lv}`],
      plain = unloaded(lv);
    assert.ok(plain.flight - loaded.flight >= 20, `${lv}: ${loaded.flight} ms loaded, ${plain.flight} ms not`);
    assert.ok(loaded.counterJ >= 0.95 * plain.J, `${lv}: ${loaded.counterJ} N·s loaded, ${plain.J} not`);
  }
  for (const lv of ['1', '2']) assert.ok(cards[`counter@${lv}`].after > cards[`slip@${lv}`].tied - 120, `${lv}: the counter waits for the slip`);
});

test('grades: a brilliant defence (a whisker, and a loaded counter within 0.4 s) comes from the great ones, never from a beginner or an amateur', () => {
  for (const lv of ['4m', '4a', '5m', '5a']) assert.ok(cards[`counter@${lv}`].brilliant, `counter@${lv}`);
  for (const id of DEFENSE.filter(e => e.level && (e.level === '1' || e.level === '2')).map(e => e.id)) assert.ok(!defence(id).brilliant, id);
});

test('grades: a pro\'s evasions are the curves as written', () => {
  for (const name of ['slip', 'duck', 'roll', 'pull'])
    for (const side of [1, -1])
      for (let t = 0; t <= MOVES[name].dur; t += 1 / 60) {
        const mine = {},
          written = sampleMove(MOVES[name], t, {});
        const zero = Object.fromEntries(Object.keys(written).concat(['side', 'lean', 'hx', 'hw', 'hr', 'lx', 'rx', 'twist', 'lkf', 'rkf', 'lkx', 'rkx']).map(k => [k, 0]));
        Object.assign(mine, zero);
        sampleEvade({ name, t, side, level: LEVEL[3] }, LEVEL[3], mine);
        const want = Object.assign({}, zero, written);
        if (MOVES[name].sided) {
          for (const ch of ['side', 'hx', 'hw', 'hr', 'lx', 'rx', 'twist']) want[ch] *= side;
          if (want.side > 0) (want.lean += LEFT_BEND.lean * want.side), (want.side += LEFT_BEND.side * want.side);
          // (the knees as written are for his left: to his right, each does what the other was written to)
          if (side < 0) mirrorKnees(want);
        }
        for (const ch in want) assert.ok(mine[ch] === want[ch], `${name} ${side} ${ch} at ${t}: ${mine[ch]} / ${want[ch]}`);
      }
});

/* ---- the weave at the bottom of the grades (docs/moves-plan-5.md §2): a weave with nothing thrown at him, his own head as it
   goes (how far down from where it was as he pressed, how much of that his hips, which are his knees, how far his head is
   bowed on his chest as it is lowest), and how long it ties him up */
const WEAVES = {};
function weave(lv) {
  if (WEAVES[lv]) return WEAVES[lv];
  const at = 1.1,
    entry = { id: 'weave', loop: 2.6, me: () => HOME, him: () => [HOME[0] + 1.6, HOME[1]], press: [[at, 'roll', 1]], setup: b => (b.fighters[0].skills = { all: lv }) },
    bout = freshBout(entry),
    f = bout.fighters[0];
  let base = null,
    low = null,
    hips = Infinity;
  for (let tick = 0; tick < Math.round(entry.loop * 60); tick++) {
    step(bout, drive(entry, bout, tick / 60, 1 / 60), 1 / 60);
    const m = measure(f);
    if (Math.abs(tick / 60 - (at - 1 / 60)) < 1e-6) base = { head: m.at.head[1], hips: m.at.Hips[1] };
    if (!base || !f.action || f.action.name !== 'roll') continue;
    if (!low || m.at.head[1] < low.head) low = { head: m.at.head[1], neck: m.angles.NeckForward };
    hips = Math.min(hips, m.at.Hips[1]);
  }
  const down = base.head - low.head;
  return (WEAVES[lv] = { down, share: (base.hips - hips) / down, bowed: low.neck, tied: timeline('roll', LEVEL[lv]).end });
}
test('weave: a beginner and an amateur get under the hook too, a beginner sooner than an amateur, an amateur sooner than a pro', () => {
  for (const lv of ['1', '2', '3']) {
    const w = live('roll', lv);
    assert.ok(w.from !== null && w.to - w.from >= (lv === '1' ? 0 : 1), `roll@${lv}: ${JSON.stringify(w.works)}`);
  }
  assert.ok(live('roll', '1').to < live('roll', '2').to && live('roll', '2').to < live('roll', '3').to, ['1', '2', '3'].map(lv => live('roll', lv).to).join(' '));
});
test('weave: as deep as a pro (25 cm and more), the knees taking more of it grade by grade (a beginner\'s a fifth at most)', () => {
  const w = ['1', '2', '3'].map(weave);
  for (const [i, r] of w.entries()) assert.ok(r.down >= 0.25, `${i + 1}: ${(r.down * 100).toFixed(1)} cm`);
  assert.ok(w[0].share < w[1].share && w[1].share < w[2].share && w[0].share <= 0.2, w.map(r => (r.share * 100).toFixed(0) + '%').join(' '));
});
test('weave: a beginner is tied up in it longest, an amateur longer than a pro; a beginner looks at the canvas', () => {
  const t = lv => weave(lv).tied;
  assert.ok(t('1') > t('2') && t('2') > t('3'), ['1', '2', '3'].map(t).join(' '));
  assert.ok(t('1') >= 0.95 && t('1') <= 1.05 + 1e-9 && t('2') >= 0.68 && t('2') <= 0.75 + 1e-9 && Math.abs(t('3') - 0.52) < 1e-9, ['1', '2', '3'].map(t).join(' '));
  assert.ok(weave('1').bowed >= 15, `his head bowed ${weave('1').bowed.toFixed(1)} degrees on his chest`);
});

const steps = Object.fromEntries(['side', 'inout', 'circle', 'turn', 'dash'].flatMap(item => LEVELS.map(lv => [`${item}@${lv}`, drill(`${item}@${lv}`)])));
const d = (item, lv) => steps[`${item}@${lv}`];
test('grades: footwork: a beginner\'s feet come together and cross, nobody else\'s cross', () => {
  assert.ok(d('inout', '1').width < 50, `inout@1: ${d('inout', '1').width}%`);
  assert.ok(d('side', '1').crossed, 'side@1 crosses');
  for (const lv of LEVELS.slice(1)) assert.ok(!d('side', lv).crossed, `side@${lv}: ${d('side', lv).cross} cm`);
});
test('grades: footwork: the chest stays on the other man more closely grade by grade, a dirty man\'s lets him get round and snaps after him', () => {
  for (const item of ['circle', 'turn']) {
    const f = lv => d(item, lv).face;
    assert.ok(f('1') > f('2') && f('2') > f('3') && f('3') >= f('4m') && f('4m') >= f('5m') && f('3') <= 6, `${item}: ${LEVELS.map(f)}`);
    for (const lv of ['4a', '5a']) assert.ok(f(lv) >= 8 && f(lv) <= 14, `${item}@${lv}: ${f(lv)}`);
  }
});
test('grades: footwork: a dash goes as far at every grade; a beginner and an amateur are stuck in it longer', () => {
  const far = LEVELS.map(lv => d('dash', lv).travelled);
  assert.ok(Math.max(...far) / Math.min(...far) <= 1.05, far.join(' '));
  const free = lv => d('dash', lv).free;
  assert.ok(free('1') > free('2') && free('2') > free('3') && free('3') === free('4m') && free('4a') > free('3'), LEVELS.map(free).join(' '));
});
