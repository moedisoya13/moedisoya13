// The old catalogue's cards as the open-questions catalogue plays them (src/open.old.mjs, src/open.old.data.mjs; moved
// 2026-11-28 from the old catalogue's own page and its test when those were deleted, del-code-pending-old): the scoped
// override its variant cards run under (src/tune.mjs) leaves the game's tables as they were, whatever happens inside it, and a
// card stepped between two steps of a variant fights exactly as it does alone; its data names only fields that are there and
// scripts the catalogue has; and what the variant cards show is what was measured (src/open.old.data.mjs NUMBERS).
// The recorded cards (src/clips.data.mjs, tools/clips.mjs): every clip of the manifest is there, as long as its window says,
// whole, and named by a card; a card that is one option of a decision names an option its item has, and carries its words;
// a clip recorded from this checkout, or from this checkout with a root's edits made in a copy of it, is recorded again the
// same; and a root's edit that is not in its file exactly once fails, the copy taken away. What was deleted with the old page
// is named nowhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withTune, patchesOf, guardAt } from '../src/tune.mjs';
import { ITEMS, TUNES, NUMBERS } from '../src/open.old.data.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { step, RULES } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { CROSS, LEVEL } from '../src/anim/skill.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';
import { CLIPS, ROOTS } from '../src/clips.data.mjs';
import { CLIPS_MADE, LOAD } from '../src/clips/index.mjs';
import { record, encode, FIELDS, derive } from '../tools/clips.mjs';

const DT = 1 / 60;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = { MOVES, CROSS, LEVEL, RULES, TECHNIQUES };
const byId = Object.fromEntries(SCRIPTS.map(e => [e.id, e]));
const cardsOf = item => [...(item.groups || []).flatMap(g => g.rows.flat()), ...(item.card ? [item.card] : [])];
const allCards = ITEMS.flatMap(cardsOf);
// the tables as they are before any test runs: what they must be after every one
const snapshot = () => JSON.stringify({ land: MOVES.hookBody.land, hookBody: MOVES.hookBody, CROSS, control: String(TECHNIQUES.parryDown.answer.control) });
const before = snapshot();

/* A card as the page fights it: its bout made with its override in force, and each step taken with it in force. */
const cell = card => {
  const entry = card.guard !== undefined ? guardAt(byId[card.entry], card.guard, card.gap) : byId[card.entry],
    patches = patchesOf(card.tune, TABLES);
  return { entry, patches, bout: withTune(patches, () => freshBout(entry)), t: 0, events: [] };
};
const tick = c =>
  withTune(c.patches, () => {
    step(c.bout, drive(c.entry, c.bout, c.t, DT), DT);
    c.t += DT;
    c.bout.fighters[1].hp = 1000;
    if (!c.entry.hurt) c.bout.fighters[0].hp = 1000;
    for (const e of c.bout.events) c.events.push(JSON.parse(JSON.stringify(e)));
  });

test('withTune: the values are in force inside, put back after, even when it throws; a field that was not there is taken away again', () => {
  const o = { a: 1, inner: { x: [1, 2] } },
    inner = o.inner;
  assert.equal(withTune([[o, 'a', 2], [o, 'b', 3]], () => o.a + o.b), 5);
  assert.deepEqual(o, { a: 1, inner: { x: [1, 2] } });
  assert.ok(!('b' in o));
  assert.throws(() => withTune([[o, 'a', 9], [o, 'inner', { x: [] }], [o, 'c', 1]], () => {
    assert.equal(o.a, 9);
    throw new Error('inside');
  }), /inside/);
  assert.equal(o.a, 1);
  assert.equal(o.inner, inner, 'the very object put back, not a copy');
  assert.ok(!('c' in o));
  // (the same field twice: put back to what it was before either)
  withTune([[o, 'a', 5], [o, 'a', 6]], () => assert.equal(o.a, 6));
  assert.equal(o.a, 1);
});

test('a card stepped between the steps of a variant fights as it does alone (liver hook land 0.76, the cross-arm guard upright)', () => {
  for (const [id, tune] of [['hookBody@4m', TUNES.land], ['crossArm@4a', TUNES.upright]]) {
    const alone = cell({ entry: id }),
      loop = Math.round(alone.entry.loop / DT);
    for (let i = 0; i < loop; i++) tick(alone);
    const base = cell({ entry: id }),
      variant = cell({ entry: id, tune });
    for (let i = 0; i < loop; i++) (tick(variant), tick(base));
    assert.deepEqual(base.events, alone.events, `${id}: the events alone and between a variant's steps`);
    // (and the variant is not the same bout: the override is in force when it fights)
    const blow = c => c.events.find(e => (e.type === 'hit' && e.who === 0) || (e.type === 'block' && e.who === 1));
    assert.ok(blow(variant) && blow(base) && Math.abs(blow(variant).J - blow(base).J) > 5, `${id}: ${blow(base) && blow(base).J} as it is, ${blow(variant) && blow(variant).J} with the override`);
  }
});

test('the data: every override names a field that is there, every card a catalogue script, every id fit to save under', () => {
  assert.equal(ITEMS.length, 84);
  // (in the old page's order: what the work of 2026-11-23 left open first, then the four parts)
  assert.deepEqual([5, 1, 2, 3, 4].map(n => ITEMS.filter(i => i.part === n).length), [56, 2, 7, 13, 6]);
  assert.deepEqual([...new Set(ITEMS.map(i => i.part))], [5, 1, 2, 3, 4]);
  const ids = new Set();
  for (const item of ITEMS) {
    assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, item.id);
    assert.ok(!ids.has(item.id), `${item.id} twice`);
    ids.add(item.id);
    const options = item.options.map(o => o.id);
    assert.equal(new Set(options).size, options.length, `${item.id}: a choice id twice`);
    for (const o of options) assert.match(o, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${item.id}: ${o}`);
    // (an item decided before is kept as it was decided: one of its own choices, the day, how; one still open has its ★)
    if (item.decided) assert.ok(options.includes(item.decided.choice) && /^\d{4}-\d\d-\d\d$/.test(item.decided.at) && ['chat', 'built'].includes(item.decided.how), `${item.id}: decided ${JSON.stringify(item.decided)}`);
    else if (item.state) assert.ok(options.includes(item.recommend), `${item.id}: the recommended choice ${item.recommend} is not one of them`);
    // (two items sharing a row of cards: the second follows the first, and each has its one card)
    if (item.pair) {
      const next = ITEMS[ITEMS.indexOf(item) + 1];
      assert.ok(next && next.id === item.pair && item.card && next.card, `${item.id}: its pair ${item.pair}`);
    }
    for (const g of item.groups || []) for (const row of g.rows) assert.equal(row.length, 2, `${item.id}: two cards to a row`);
  }
  for (const card of allCards) {
    if (card.image) assert.ok(existsSync(path.join(root, card.image)), card.image);
    if (card.video) assert.ok(card.image && existsSync(path.join(root, card.video)), card.video);
    if (card.image || card.fill) continue;
    // (a recorded card: a clip of the manifest, which has been recorded)
    if (card.clip) {
      assert.ok(CLIPS.some(c => c.id === card.clip) && CLIPS_MADE[card.clip], `${card.clip}: not a recorded clip`);
      assert.ok(typeof card.line === 'string' && card.say, `${card.clip}: what it is and its line`);
      continue;
    }
    assert.ok(byId[card.entry], `${card.entry}: not a catalogue script`);
    for (const p of card.tune || []) {
      const [o, k] = patchesOf([p], TABLES)[0];
      assert.ok(Object.prototype.hasOwnProperty.call(o, k), `${p.slice(0, -1).join('.')}: not a field of its own`);
    }
    // (the hit effect's versions went with the old page: cleanup-fx-versions)
    assert.equal(card.version, undefined, `${card.entry}: an effect version card`);
  }
  for (const item of ITEMS) for (const r of [...(item.refs || []).map(x => x.href), ...(item.banner ? [item.banner.image] : [])]) assert.ok(existsSync(path.join(root, r)), r);
  // (the two cards of a comparison see it from the same place)
  for (const item of ITEMS.filter(i => i.pairNo))
    for (const g of item.groups)
      for (const [a, b] of g.rows) assert.deepEqual(a.view || byId[a.entry].view, b.view || byId[b.entry].view, `${item.id}: the two cards' camera`);
});

test('what the variant cards show is what was measured for them: the blow, and what became of the punch', () => {
  for (const card of allCards.filter(c => c.key)) {
    const c = cell(card),
      want = NUMBERS.cards && NUMBERS.cards[card.key];
    assert.ok(want, `${card.key}: not measured (src/open.old.data.mjs NUMBERS)`);
    for (let i = 0; i < Math.round(c.entry.loop / DT); i++) tick(c);
    const landed = c.events.find(e => e.type === 'hit' && e.who === 0),
      met = c.events.filter(e => (e.type === 'parry' ? e.on : e.who) === 1 && ['hit', 'block', 'whiff', 'graze', 'parry'].includes(e.type)).pop();
    if (card.kind === 'liver') assert.equal(+landed.J.toFixed(1), want.J, card.key);
    else {
      assert.equal(met ? (met.type === 'parry' ? (met.down ? 'down' : 'parry') : met.type) : null, want.met, card.key);
      assert.equal(landed ? +landed.J.toFixed(1) : null, want.counter, `${card.key}: his own blow`);
    }
  }
});

test('the recorded clips: each of the manifest written, as many frames as its window, whole; each named by a card, and each card\'s a clip', async () => {
  const ids = new Set();
  for (const clip of CLIPS) {
    assert.ok(!ids.has(clip.id) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(clip.id), `${clip.id}: an id once, fit for a file`);
    ids.add(clip.id);
    assert.ok(ROOTS[clip.root], `${clip.id}: no root ${clip.root}`);
    const made = CLIPS_MADE[clip.id];
    assert.ok(made && LOAD[clip.id], `${clip.id}: not recorded (node tools/clips.mjs --write --root ...)`);
    assert.deepEqual([made.root, made.script, made.window], [clip.root, clip.script, clip.window], `${clip.id}: recorded as the manifest says`);
    const frames = Math.round((clip.window[1] - clip.window[0]) * 60),
      mod = await LOAD[clip.id]();
    assert.equal(mod.FRAMES, frames, `${clip.id}: ${mod.FRAMES} frames for ${clip.window.join('-')} s`);
    assert.equal(made.frames, frames, clip.id);
    assert.equal(Buffer.from(mod.MEN, 'base64').length, frames * 2 * FIELDS * 2, `${clip.id}: the frames whole`);
    for (const [k, e] of mod.EVENTS) assert.ok(k >= 0 && k < frames && e.type, `${clip.id}: an event at ${k}`);
    // (and a clip as big as the page can bear: 150 KB)
    assert.ok(mod.MEN.length < 150e3, `${clip.id}: ${mod.MEN.length} bytes`);
  }
  // (every clip shown, and nothing shown that is not one)
  const named = new Set(allCards.filter(c => c.clip).map(c => c.clip));
  assert.deepEqual([...named].sort(), [...ids].sort());
  assert.deepEqual(Object.keys(CLIPS_MADE).sort(), [...ids].sort());
});

test('the options\' cards: each names an option of its item and carries its words; a comparison\'s third card has the blank beside it', () => {
  let n = 0;
  for (const item of ITEMS)
    for (const g of item.groups || [])
      for (const card of g.rows.flat().filter(c => c.option !== undefined)) {
        const o = item.options.find(x => x.id === card.option);
        assert.ok(o && card.clip, `${item.id}: ${card.option} is no option of it, or the card no clip`);
        assert.equal(card.choice, o.name, `${item.id}: ${card.option}: the option's own words on its card`);
        n++;
      }
  // (the cards of the options of seven items, and the clips of the manifest: what the work of 2026-11-24 added; and the defence
  // effects' samples, 19 cards of options of three items more and six clips; and the samples of two options not recorded before
  // (downside-front's from04, rocked-slow's mid) and of the cross counter's first round, 12 cards of options and 12 clips more:
  // 67 cards and 66 clips. 2026-11-28: the decided items' cards and clips went with the old page (del-code-pending-old):
  // downside-front 9, rocked-slow 6 and the cross counter's 7 cards of options, and the 29 clips only decided items showed)
  assert.equal(n, 45, 'cards of options');
  assert.equal(CLIPS.length, 37, 'clips');
  // (a row of two whose second is the blank: its first is a card, as beckon-room's)
  for (const item of ITEMS) for (const g of item.groups || []) for (const [a, b] of g.rows) if (b.fill) assert.ok(!a.fill && (a.clip || a.entry || a.image), `${item.id}: a blank row`);
});

/* (what was taken away for good: the ground ring's light-or-darker question, and the order of the stages; and what only they
   used, their clips: nothing of them is left in the data, the clips or the groups, and the recorded files are gone. And
   2026-11-28, with the old page: the clips only decided items showed, and the ground ring's comparison videos, del-ref-video) */
test('no deleted item is named anywhere: the data, the clips, the groups', () => {
  const GONE = ['fx-ground-ring-game', 'order-memo-first'],
    CLIPS_GONE = ['front-now', 'front-v1', 'collar-now', 'collar-u2', 'hookin-pren', 'hookin-now',
      ...'beckon10-now beckon10-u1 beckon10-u2 beckon12-now beckon12-u2 hookr-pren hookr-now rollc-pren weak-pren weak-now ds-revert db-revert ds-accept db-accept ds-from04 db-from04 rk-before rk-keep rk-mid rk-shorter xc-3 xc-4m xc-4a xc-5m xc-5a xc-3-never xc-early xc-late xc-out'.split(' ')];
  for (const id of GONE) assert.ok(!ITEMS.some(i => i.id === id), `${id}: still an item`);
  for (const id of CLIPS_GONE) {
    assert.ok(!CLIPS.some(c => c.id === id) && !CLIPS_MADE[id] && !LOAD[id], `${id}: still a clip`);
    assert.ok(!existsSync(path.join(root, 'src', 'clips', `${id}.mjs`)), `${id}: its file`);
  }
  for (const card of allCards) assert.ok(!(card.image || '').includes('ground-ring-game') && !CLIPS_GONE.includes(card.clip), JSON.stringify(card));
  for (const file of ['src/open.old.data.mjs', 'src/clips.data.mjs', 'src/clips/index.mjs']) {
    const text = readFileSync(path.join(root, file), 'utf8');
    // (the ground ring's item and its two pictures, docs/ref/ground-ring-game-*.jpg; the order's item; their clips)
    for (const name of ['ground-ring-game', 'ground-shake-', ...GONE]) assert.ok(!text.includes(name), `${file} names ${name}`);
    for (const id of CLIPS_GONE) assert.ok(!text.includes(`'${id}'`), `${file} names ${id}`);
    for (const id of ['front', 'collar', 'hookin']) assert.ok(!text.includes(`pair('${id}'`), `${file} makes the clips ${id}-*`);
  }
  // (the two pictures stay in the repository, out of the page; the ground ring's comparison videos and stills are gone)
  for (const n of [1, 2]) assert.ok(existsSync(path.join(root, 'docs', 'ref', `ground-ring-game-${n}.jpg`)));
  assert.deepEqual(readdirSync(path.join(root, 'docs', 'ref')).filter(f => f.startsWith('ground-shake-')), []);
  // (and the old page and every file only it used)
  for (const f of ['pending.html', 'src/pending.mjs', 'src/pending.data.mjs', 'src/pending.numbers.mjs', 'tools/pending.mjs', 'tests/pending.test.mjs', 'docs/pending-catalog.md'])
    assert.ok(!existsSync(path.join(root, f)), `${f} is still there`);
});

test('a clip recorded from this checkout is recorded again the same: the frames, the blows and what it measured', async () => {
  for (const clip of CLIPS.filter(c => c.root === 'now')) {
    const mod = await LOAD[clip.id](),
      again = await record(clip, root);
    assert.equal(encode(again.data), mod.MEN, `${clip.id}: the frames`);
    assert.deepEqual(again.events, mod.EVENTS, `${clip.id}: the blows`);
    assert.deepEqual(again.measured, CLIPS_MADE[clip.id].measured, `${clip.id}: what it measured`);
  }
});

/* (a root made from this checkout by edits: its src copied away and the edits made in the copy; recorded from there, each of
   its clips is what was written, and the copy is gone again after) */
test('a clip of a root made from this checkout by edits is recorded again the same, from a copy that is taken away', async () => {
  const derived = Object.keys(ROOTS).filter(k => ROOTS[k].from === 'now');
  assert.ok(derived.length >= 3, derived.join(' '));
  for (const key of derived) {
    const clips = CLIPS.filter(c => c.root === key);
    assert.ok(clips.length, `${key}: no clip`);
    const made = derive(key, { now: root });
    try {
      assert.ok(made.dir.startsWith(tmpdir()) && !made.dir.startsWith(root), `${key}: copied to ${made.dir}`);
      for (const clip of clips) {
        const mod = await LOAD[clip.id](),
          again = await record(clip, made.dir);
        assert.equal(encode(again.data), mod.MEN, `${clip.id}: the frames`);
        assert.deepEqual(again.events, mod.EVENTS, `${clip.id}: the blows`);
        assert.deepEqual(again.measured, CLIPS_MADE[clip.id].measured, `${clip.id}: what it measured`);
        assert.equal(CLIPS_MADE[clip.id].from.edits, ROOTS[key].edits.length, `${clip.id}: written as made by its edits`);
      }
    } finally {
      made.done();
    }
    assert.ok(!existsSync(made.dir), `${key}: the copy left behind`);
  }
  // (and every root made by edits names one that is a folder, edits of its src only)
  for (const [key, R] of Object.entries(ROOTS).filter(([, R]) => R.from))
    for (const e of R.edits) assert.ok(ROOTS[R.from] && !ROOTS[R.from].from && /^src\/[\w./-]+\.mjs$/.test(e.file) && typeof e.find === 'string' && e.find && typeof e.replace === 'string', `${key}: ${e.file}`);
});

test('a root\'s edit that is not in its file exactly once fails, and leaves no copy behind', () => {
  const left = () => readdirSync(tmpdir()).filter(n => n.startsWith('clips-__try-'));
  for (const [find, said] of [['insideTo: 99', 'nowhere'], ['RULES', 'many times']]) {
    ROOTS.__try = { say: 'try', from: 'now', edits: [{ file: 'src/game/bout.mjs', find, replace: 'x' }] };
    try {
      assert.throws(() => derive('__try', { now: root }), /not once/, `${find}: ${said}`);
    } finally {
      delete ROOTS.__try;
    }
  }
  assert.deepEqual(left(), []);
});

test('the game\'s tables are their defaults after all of it', () => {
  assert.equal(MOVES.hookBody.land, 0.7);
  assert.equal(CROSS['4a'].lean, 6);
  assert.deepEqual(CROSS['4a'].R, [0.05, -0.065, -0.005, -0.3]);
  assert.equal(snapshot(), before);
});
