// 한 라운드 스파링 (src/spar/plan.mjs): a round arranged from a seed and rehearsed in the real bout, played back to the step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planOf, replayOf, checkOf, library, SPAR, hpOf } from '../src/spar/plan.mjs';
import { leftOut } from '../src/spar/cards.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';
import { LEVEL } from '../src/anim/skill.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// the rounds the tests look at: 30 seeds, each arranged and played back once
const SEEDS = Array.from({ length: 30 }, (_, i) => 101 + i * 37);
const ROUNDS = SEEDS.map(seed => {
  const plan = planOf(seed),
    played = replayOf(plan);
  return { seed, plan, played, check: checkOf(plan, played) };
});
// (the bounds a round is held to: seconds of bout to the knockdown, and beats, the last the knockdown's)
const TIME = [30, 110],
  BEATS = [SPAR.beats[0], SPAR.beats[1] + 4];

test('the same seed gives the same round, to the step, and the same events', () => {
  const a = ROUNDS[0].plan,
    b = planOf(a.seed);
  assert.deepEqual(b.beats, a.beats);
  assert.deepEqual(b.inputs, a.inputs);
  assert.deepEqual({ men: b.men, hp: b.hp, winner: b.winner, ko: b.ko }, { men: a.men, hp: a.hp, winner: a.winner, ko: a.ko });
  const e1 = ROUNDS[0].played.events.map(x => [x.k, x.e.type, x.e.who, x.e.J]),
    e2 = replayOf(b).events.map(x => [x.k, x.e.type, x.e.who, x.e.J]);
  assert.deepEqual(e2, e1);
});

test('every round ends in exactly one knockdown, the finishing beat\'s, within the bounds', () => {
  for (const { seed, plan, check } of ROUNDS) {
    assert.equal(check.downs, 1, `#${seed}: knockdowns`);
    assert.ok(check.ko, `#${seed}: the knockdown is the plan's`);
    assert.equal(plan.ko.beat, plan.beats.length - 1, `#${seed}: on the last beat`);
    assert.equal(plan.ko.by, plan.winner, `#${seed}: by the winner`);
    assert.ok(plan.ko.J >= SPAR.power, `#${seed}: a power blow (${plan.ko.J} N·s)`);
    assert.ok(plan.ko.t >= TIME[0] && plan.ko.t <= TIME[1], `#${seed}: ${plan.ko.t} s`);
    assert.ok(plan.beats.length >= BEATS[0] && plan.beats.length <= BEATS[1], `#${seed}: ${plan.beats.length} beats`);
    // (both start with the same health, shown on the HUD, and the round's dice set it within what the winner's grade gives)
    const [lo, hi] = hpOf(plan.men[plan.winner].grade);
    assert.ok(plan.hp >= Math.round(lo) && plan.hp <= Math.round(hi), `#${seed}: health ${plan.hp}`);
  }
});

test('every arranged exchange came out as its timeline line says', () => {
  for (const { seed, plan, check } of ROUNDS) {
    assert.deepEqual(check.lines, [], `#${seed}`);
    for (const b of plan.beats) for (const k of ['t', 'lead', 'what', 'answer', 'said']) assert.ok(b[k] !== undefined && b[k] !== '', `#${seed} beat ${b.i}: ${k}`);
  }
});

test('no man does anything his grade or his loadout does not have', () => {
  for (const { seed, plan, check } of ROUNDS) {
    assert.deepEqual(check.graded, [], `#${seed}`);
    for (const b of plan.beats) {
      const lib = library().find(l => l.id === b.id),
        man = plan.men[b.A];
      assert.ok(!lib.grade || lib.grade === man.grade, `#${seed} beat ${b.i}: ${b.id} fought at ${man.grade}`);
      for (const id of lib.needs) assert.ok(man.techniques.includes(id), `#${seed} beat ${b.i}: ${b.id} needs ${id}`);
    }
  }
});

test('rounds differ: other men, other beats, other finishes', () => {
  const sequences = new Set(ROUNDS.map(r => r.plan.beats.map(b => b.id).join(' '))),
    grades = new Set(ROUNDS.flatMap(r => r.plan.men.map(m => m.grade))),
    kinds = new Set(ROUNDS.flatMap(r => r.plan.beats.map(b => b.kind))),
    finishes = new Set(ROUNDS.map(r => r.plan.ko.name));
  assert.equal(sequences.size, ROUNDS.length);
  assert.equal(grades.size, 7);
  for (const k of ['step', 'defence', 'punch', 'combo', 'entry']) assert.ok(kinds.has(k), k);
  assert.ok(finishes.size >= 3, [...finishes].join(' '));
});

test('the library is the catalogue: every card is in it or left out for a stated reason, and every technique has its cards', () => {
  const lib = library(),
    ids = new Set([...lib.map(l => l.id), ...leftOut().map(x => x.id)]);
  for (const card of SCRIPTS) assert.ok(ids.has(card.id), card.id);
  for (const x of leftOut()) assert.ok(x.why, x.id);
  // (a technique comes into the sparring by its catalogue cards: each carried technique is needed by some card)
  for (const id of Object.keys(TECHNIQUES)) assert.ok(lib.some(l => l.needs.includes(id)), id);
  for (const l of lib) assert.ok(!l.grade || LEVEL[l.grade], l.id);
});

test('the artifact tool builds the page with its worker, its outfits and a build stamp', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spar-')),
    out = path.join(dir, 'spar.out.html'),
    files = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/artifact.mjs'), 'spar.html', 'src/spar.mjs', out], { cwd: root, encoding: 'utf8' })),
    page = readFileSync(out, 'utf8');
  assert.match(page, /^<title>한 라운드 스파링<\/title>\n<meta name="claude:viewport-fit-sides" content="cover">/);
  assert.match(page, /<meta name="build" content="[0-9a-f]{7}\+? \d{4}-\d{2}-\d{2}">/);
  for (const f of ['src/spar.mjs', 'src/spar/worker.mjs', 'src/spar/plan.mjs', 'assets/boxer-training.splats.txt', 'assets/boxer-training-up.splats.txt', 'assets/ring.splats.txt']) assert.ok(files[f], f);
  // (the committed page is left as it is)
  assert.doesNotMatch(readFileSync(path.join(root, 'spar.html'), 'utf8'), /name="build"/);
});
