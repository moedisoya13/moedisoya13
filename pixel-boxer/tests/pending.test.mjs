// The pending catalogue (docs/pending-catalog.md): the scoped override its variant cards run under (src/tune.mjs, §2) leaves
// the game's tables as they were, whatever happens inside it, and a card stepped between two steps of a variant fights exactly
// as it does alone; its data (src/pending.data.mjs) names only fields that are there and scripts the catalogue has, with ids
// fit to save decisions under; and what the variant cards show is what tools/pending.mjs measured (src/pending.numbers.mjs).
// The recorded cards (src/clips.data.mjs, tools/clips.mjs): every clip of the manifest is there, as long as its window says,
// whole, and named by a card; and a clip recorded from this checkout is recorded again the same from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withTune, patchesOf, guardAt } from '../src/tune.mjs';
import { ITEMS, PARTS, TUNES, VERSIONS, FX_SCENES } from '../src/pending.data.mjs';
import { NUMBERS } from '../src/pending.numbers.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { step, RULES } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { CROSS, LEVEL } from '../src/anim/skill.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';
import { CLIPS, ROOTS } from '../src/clips.data.mjs';
import { CLIPS_MADE, LOAD } from '../src/clips/index.mjs';
import { record, encode, FIELDS } from '../tools/clips.mjs';

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
  assert.equal(ITEMS.length, 68);
  // (in the page's order: what the work of 2026-11-23 left open first, then the four parts)
  assert.deepEqual(PARTS.map(P => P.n), [5, 1, 2, 3, 4]);
  assert.deepEqual(PARTS.map(P => ITEMS.filter(i => i.part === P.n).length), [40, 2, 7, 13, 6]);
  const ids = new Set();
  for (const item of ITEMS) {
    assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, item.id);
    assert.ok(!ids.has(item.id), `${item.id} twice`);
    ids.add(item.id);
    const options = item.options.map(o => o.id);
    assert.equal(new Set(options).size, options.length, `${item.id}: a choice id twice`);
    for (const o of options) assert.match(o, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${item.id}: ${o}`);
    assert.ok(options.includes(item.recommend), `${item.id}: the recommended choice ${item.recommend} is not one of them`);
    // (two items sharing a row of cards: the second follows the first, and each has its one card)
    if (item.pair) {
      const next = ITEMS[ITEMS.indexOf(item) + 1];
      assert.ok(next && next.id === item.pair && item.card && next.card, `${item.id}: its pair ${item.pair}`);
    }
    for (const g of item.groups || []) for (const row of g.rows) assert.equal(row.length, 2, `${item.id}: two cards to a row`);
  }
  for (const card of allCards) {
    if (card.image) assert.ok(existsSync(path.join(root, card.image)), card.image);
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
    if (card.version) assert.ok(VERSIONS.some(v => v.id === card.version) && FX_SCENES[card.scene].entry === card.entry, `${card.entry} ${card.version}`);
  }
  for (const item of ITEMS) for (const r of [...(item.refs || []).map(x => x.href), ...(item.banner ? [item.banner.image] : [])]) assert.ok(existsSync(path.join(root, r)), r);
  // (the two cards of a comparison see it from the same place)
  for (const item of ITEMS.filter(i => i.pairNo))
    for (const g of item.groups)
      for (const [a, b] of g.rows) assert.deepEqual(a.view || byId[a.entry].view, b.view || byId[b.entry].view, `${item.id}: the two cards' camera`);
});

test('what the variant cards show is what tools/pending.mjs measured: the blow, and what became of the punch', () => {
  for (const card of allCards.filter(c => c.key)) {
    const c = cell(card),
      want = NUMBERS.cards && NUMBERS.cards[card.key];
    assert.ok(want, `${card.key}: not measured (node tools/pending.mjs --write)`);
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

test('a clip recorded from this checkout is recorded again the same: the frames, the blows and what it measured', async () => {
  for (const clip of CLIPS.filter(c => c.root === 'now')) {
    const mod = await LOAD[clip.id](),
      again = await record(clip, root);
    assert.equal(encode(again.data), mod.MEN, `${clip.id}: the frames`);
    assert.deepEqual(again.events, mod.EVENTS, `${clip.id}: the blows`);
    assert.deepEqual(again.measured, CLIPS_MADE[clip.id].measured, `${clip.id}: what it measured`);
  }
});

test('the game\'s tables are their defaults after all of it', () => {
  assert.equal(MOVES.hookBody.land, 0.7);
  assert.equal(CROSS['4a'].lean, 6);
  assert.deepEqual(CROSS['4a'].R, [0.05, -0.065, -0.005, -0.3]);
  assert.equal(snapshot(), before);
});
