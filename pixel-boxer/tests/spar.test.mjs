// 한 라운드 스파링 (src/spar/plan.mjs, src/spar/rails.mjs): a round arranged from a seed in one pass of the real bout, both men
// acting all the time, and played back to the step: the same four lanes, the same events, the same knockdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planOf, planner, replayOf, checkOf, SPAR, hpOf } from '../src/spar/plan.mjs';
import { LEVEL, LEVELS } from '../src/anim/skill.mjs';
import { viewsOf, ACTS, WAY, VIEW } from '../src/spar/rails.mjs';
import { labelOf, shortOf } from '../src/spar/names.mjs';
import { MOVES } from '../src/anim/moves.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// the rounds the tests look at: each arranged once and played back once from its controls
const SEEDS = [101, 138, 175, 212, 249, 286, 323, 360];
const ROUNDS = SEEDS.map(seed => {
  const plan = planOf(seed),
    played = replayOf(plan);
  return { seed, plan, played, check: checkOf(plan, played) };
});
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

test('the same seed gives the same round: the same men, controls, lanes and knockdown', () => {
  const a = ROUNDS[0].plan,
    b = planOf(a.seed);
  assert.deepEqual(b.inputs, a.inputs);
  assert.deepEqual(b.rails, a.rails);
  assert.deepEqual(b.feet, a.feet);
  assert.deepEqual({ men: b.men, hp: b.hp, favoured: b.favoured, ko: b.ko, events: b.events }, { men: a.men, hp: a.hp, favoured: a.favoured, ko: a.ko, events: a.events });
});

/* The two men are never more than two grades apart (the user's rule, 2026-11-28: "최대 두 등급 차이"; 1..5, 4명 · 4암 and
   5명 · 5암 one grade each): over seeds 1-400, fixed beforehand, every pair within SPAR.gap, the same seed the same pair, and
   the pairs the rule lets through all drawn (two apart among them). */
test('the two men of a round are at most two grades apart: seeds 1-400', () => {
  assert.equal(SPAR.gap, 2);
  const apart = [0, 0, 0],
    pairs = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const men = planner(seed).plan.men.map(m => m.grade),
      d = Math.abs(LEVEL[men[0]].grade - LEVEL[men[1]].grade);
    assert.ok(d <= 2, `#${seed}: ${men.join(' / ')}, ${d} grades apart`);
    assert.deepEqual(planner(seed).plan.men.map(m => m.grade), men, `#${seed}: the same pair again`);
    apart[d]++;
    pairs.add(men.join('/'));
  }
  const allowed = LEVELS.flatMap(a => LEVELS.filter(b => Math.abs(LEVEL[a].grade - LEVEL[b].grade) <= 2).map(b => a + '/' + b));
  assert.equal(allowed.length, 37);
  assert.deepEqual([...pairs].sort(), allowed.sort(), 'every pair within two grades is drawn');
  assert.ok(apart.every(n => n > 0), `0 / 1 / 2 grades apart: ${apart.join(' / ')}`);
});

test('the round played again from its controls is the round that was arranged: the four lanes block for block, every punch event for event', () => {
  for (const { seed, plan, played, check } of ROUNDS) {
    assert.deepEqual(played.rails, plan.rails, `#${seed}: the technique lanes`);
    assert.deepEqual(played.feet, plan.feet, `#${seed}: the footwork lanes`);
    assert.ok(check.events, `#${seed}: the punches' events`);
    assert.ok(plan.events.length > 40, `#${seed}: ${plan.events.length} events`);
  }
});

test('both men act all the time: techniques and footwork at one a second or more each, and no stretch in which nobody starts anything', () => {
  for (const { seed, plan } of ROUNDS) {
    const st = plan.stats;
    for (const i of [0, 1]) {
      assert.ok(st.rate[i] >= 1 && st.rate[i] <= 3.4, `#${seed}: ${st.rate[i].toFixed(2)} techniques a second (man ${i})`);
      assert.ok(st.pace[i] >= 1 && st.pace[i] <= 3.4, `#${seed}: ${st.pace[i].toFixed(2)} steps a second (man ${i})`);
      assert.ok(st.kinds[i] >= 6, `#${seed}: ${st.kinds[i]} kinds of footwork (man ${i})`);
    }
    assert.ok(st.empty <= 1.1, `#${seed}: ${st.empty.toFixed(2)} s with nothing started`);
    assert.ok(st.lull <= 2.2, `#${seed}: ${st.lull.toFixed(2)} s with no technique started`);
    assert.ok(st.ways.distance >= 15 && st.ways.axis >= 15, `#${seed}: distance ${st.ways.distance}, axis ${st.ways.axis}`);
  }
  assert.ok(mean(ROUNDS.flatMap(r => r.plan.stats.rate)) >= 1.4);
  assert.ok(mean(ROUNDS.flatMap(r => r.plan.stats.pace)) >= 1.4);
});

test('no standing between two motions: the next starts on the first frame the bout lets him, on both lanes', () => {
  for (const { seed, plan } of ROUNDS) {
    const g = plan.stats.gaps;
    for (const lane of ['tech', 'feet'])
      for (const i of [0, 1]) {
        assert.ok(g[lane][i].n > 20, `#${seed} ${lane} ${i}: ${g[lane][i].n} starts`);
        assert.ok(g[lane][i].mean <= 1.5, `#${seed} ${lane} ${i}: ${g[lane][i].mean} frames on the average`);
        assert.ok(g[lane][i].p90 <= 3, `#${seed} ${lane} ${i}: ${g[lane][i].p90} frames at the 90th percentile`);
      }
  }
});

test('the lanes are well made: each lane in order with no two blocks at once, footwork beside techniques, every block named', () => {
  for (const { seed, plan } of ROUNDS) {
    for (const [what, lanes] of [['rails', plan.rails], ['feet', plan.feet]])
      lanes.forEach((lane, i) => {
        lane.forEach((b, j) => {
          assert.equal(b.who, i);
          assert.ok(b.to > b.from, `#${seed} ${what} ${i} ${j}: ${b.from}..${b.to}`);
          if (j) assert.ok(b.from >= lane[j - 1].to, `#${seed} ${what} ${i} ${j}: starts before the one before it ends`);
          assert.ok(what === 'feet' ? b.kind === 'step' && WAY[b.name] === b.way : [...ACTS, 'hurt', 'down'].includes(b.kind), `#${seed} ${what} ${i} ${j}: ${b.kind} ${b.name}`);
          assert.ok(labelOf(b) && shortOf(b), `#${seed}: a name for ${b.kind} ${b.name}`);
          if (b.kind === 'attack') assert.ok(MOVES[b.name] && MOVES[b.name].punch, b.name);
        });
        // (he steps while he punches: some step of his overlaps a punch of his)
        if (what === 'feet') assert.ok(lane.some(s => plan.rails[i].some(b => b.kind === 'attack' && b.from < s.to && s.from < b.to)), `#${seed}: no step of man ${i} during a punch of his`);
      });
    for (const kind of ['attack', 'evade', 'guard']) assert.ok(plan.rails.some(r => r.some(b => b.kind === kind)), `#${seed}: no ${kind}`);
  }
});

test('a blow that lands ends what the other man was doing: his block is cut there and his hit reaction follows, a power blow\'s marked', () => {
  let power = 0,
    early = 0;
  for (const { seed, plan } of ROUNDS) {
    plan.rails.forEach((lane, i) =>
      lane.forEach((b, j) => {
        if (!b.cut) return;
        const next = lane[j + 1];
        // (cut at the step the blow landed, and the next thing on his lane is his reaction to that blow, or his fall)
        assert.equal(b.to, b.cut.at, `#${seed}: cut at ${b.cut.at}, ended at ${b.to}`);
        assert.ok(next && (next.kind === 'down' || (next.kind === 'hurt' && next.from === b.cut.at && next.by.name === b.cut.name && next.by.J === b.cut.J)), `#${seed}: after the cut, ${next && next.kind}`);
        // (and the blow is on the other man's lane, landed at that step)
        const blow = plan.rails[1 - i].find(x => x.kind === 'attack' && x.out === 'hit' && x.at === b.cut.at && x.name === b.cut.name);
        assert.ok(blow, `#${seed}: the blow that cut it`);
        if (b.cut.power) (power++, assert.ok(blow.power && b.cut.worth >= SPAR.power && blow.cuts));
        if (b.cut.power && (b.kind !== 'attack' || !b.out)) early++;
      })
    );
    // (and every hit reaction is a blow that landed)
    for (const lane of plan.rails) for (const b of lane) if (b.kind === 'hurt' && b.name === 'hurt' && b.by) assert.ok(plan.events.some(e => e[1] === 'hit' && e[0] - 1 === b.from && e[3] === b.by.name), `#${seed}: a hit reaction at ${b.from} with no blow`);
    assert.equal(plan.stats.power, plan.rails.flat().filter(b => b.cut && b.cut.power && ACTS.includes(b.kind) && b.from < plan.steps).length);
  }
  assert.ok(power >= ROUNDS.length, `${power} actions cut by a power blow in ${ROUNDS.length} rounds`);
  assert.ok(early >= 1, 'none cut before it had done anything');
});

test('every round ends in its first knockdown, by a power punch, within the round', () => {
  for (const { seed, plan, check } of ROUNDS) {
    assert.equal(check.downs, 1, `#${seed}: knockdowns`);
    assert.ok(check.ko, `#${seed}: the knockdown is the plan's`);
    assert.ok(plan.ko.power && !(MOVES[plan.ko.name].kind === 'straight' && MOVES[plan.ko.name].hand === 'L'), `#${seed}: ${plan.ko.name}`);
    assert.ok(plan.ko.at >= 20 && plan.ko.at <= SPAR.most, `#${seed}: ${plan.ko.at} s`);
    assert.equal(plan.steps, plan.ko.step);
    assert.ok(plan.inputs.length >= plan.ko.step + SPAR.tail * 60 - 1, `#${seed}: the fall is in the round`);
    assert.equal(plan.winner, plan.ko.by);
    assert.equal(plan.attempt, 0, `#${seed}: arranged in one pass`);
    // (both start with the same health, on the HUD, what the favoured man's grade takes off a man in the target time)
    assert.ok(Math.abs(plan.hp - hpOf(plan.men[plan.favoured].grade, plan.men[1 - plan.favoured].grade, plan.target)) <= 1, `#${seed}: health ${plan.hp}`);
    assert.ok(plan.hp >= SPAR.hp.span[0] && plan.hp <= SPAR.hp.span[1]);
    // (the last block of the man who went down is his fall, and nothing of his starts after it)
    const lane = plan.rails[plan.ko.on];
    assert.equal(lane[lane.length - 1].kind, 'down');
  }
  assert.ok(ROUNDS.filter(r => r.plan.ko.at >= 35 && r.plan.ko.at <= 75).length >= ROUNDS.length - 2, ROUNDS.map(r => r.plan.ko.at).join(' '));
});

test('no man does anything his grade or his loadout does not have', () => {
  for (const { seed, plan, check } of ROUNDS) {
    assert.deepEqual(check.graded, [], `#${seed}`);
    for (const m of plan.men) assert.ok(!m.techniques.includes('rollCounter') || m.techniques.includes('crossArm'), `#${seed}: the shoulder roll without the cross-arm guard`);
  }
});

test('the camera\'s views come off the lanes: one at a time, held, a zoom on the knockdown', () => {
  for (const { seed, plan } of ROUNDS) {
    const views = viewsOf(plan.rails, plan.feet, plan.steps);
    assert.deepEqual(viewsOf(plan.rails, plan.feet, plan.steps), views);
    views.forEach((v, j) => {
      assert.ok(v.kind === 'bird' || v.kind === 'zoom');
      assert.ok(v.to - v.from >= 60, `#${seed}: a view of ${v.to - v.from} steps`);
      if (j) assert.ok(v.from >= views[j - 1].to, `#${seed}: two views at once`);
    });
    const last = views[views.length - 1];
    assert.ok(last && last.kind === 'zoom' && /down/.test(last.why) && last.from <= plan.ko.step && plan.ko.step < last.to, `#${seed}: the knockdown is not zoomed on`);
    assert.ok(views.reduce((s, v) => s + v.to - v.from, 0) / plan.steps <= 0.5, `#${seed}: more than half the round in a view`);
    assert.ok(VIEW.hold >= 1.5);
  }
});

test('rounds differ: other men, other actions, other finishes', () => {
  const sequences = new Set(ROUNDS.map(r => r.plan.rails[0].slice(0, 30).map(b => b.name).join(' '))),
    grades = new Set(ROUNDS.flatMap(r => r.plan.men.map(m => m.grade))),
    names = new Set(ROUNDS.flatMap(r => r.plan.rails.flat().map(b => b.name))),
    steps = new Set(ROUNDS.flatMap(r => r.plan.feet.flat().map(b => b.name)));
  assert.equal(sequences.size, ROUNDS.length);
  assert.ok(grades.size >= 5, [...grades].join(' '));
  for (const n of ['jab', 'cross', 'hook', 'upper', 'slip', 'pull', 'duck', 'guard', 'hurt']) assert.ok(names.has(n), n);
  for (const n of ['in', 'out', 'press', 'back', 'side', 'pivot', 'cut', 'dash']) assert.ok(steps.has(n), n);
});

test('the artifact tool builds the page with its worker, its outfits and a build stamp', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spar-')),
    out = path.join(dir, 'spar.out.html'),
    files = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/artifact.mjs'), 'spar.html', 'src/spar.mjs', out], { cwd: root, encoding: 'utf8' })),
    page = readFileSync(out, 'utf8');
  assert.match(page, /^<title>한 라운드 스파링<\/title>\n<meta name="claude:viewport-fit-sides" content="cover">/);
  assert.match(page, /<meta name="build" content="[0-9a-f]{7}\+? \d{4}-\d{2}-\d{2}">/);
  for (const f of ['src/spar.mjs', 'src/spar/worker.mjs', 'src/spar/plan.mjs', 'src/spar/rails.mjs', 'src/spar/names.mjs', 'assets/boxer-training.splats.txt', 'assets/boxer-training-up.splats.txt', 'assets/ring.splats.txt']) assert.ok(files[f], f);
  // (the committed page is left as it is)
  assert.doesNotMatch(readFileSync(path.join(root, 'spar.html'), 'utf8'), /name="build"/);
});

/* A show-off's taunts are seen (look 2026-11-26 spar-1: 43 of 44 ended on their first frame or two, his feet walking him out
   of them while the lane counted each as an action): his feet stand while he taunts, so a taunt goes on until it is over or
   something takes him out of it (a punch coming, a blow); never his own walking. On the look's two rounds (4암 in both). */
test('a taunt is not walked out of: the show-off\'s feet stand for it', () => {
  let n = 0,
    walked = 0,
    short = 0;
  for (const seed of [13, 16]) {
    const plan = planOf(seed),
      on = [null, null];
    replayOf(plan, (bout, k) => {
      if (k >= plan.ko.step) return;
      bout.fighters.forEach((f, i) => {
        const t = f.action && MOVES[f.action.name].taunt ? f.action : null;
        if (t && (!on[i] || on[i].a !== t)) (on[i] = { a: t, n: 0 }), n++;
        if (t) on[i].n++;
        else if (on[i]) {
          const inp = plan.inputs[k][i] || {};
          if (Math.hypot(...(inp.move || [0, 0])) > 0.3 && !inp.cover) walked++;
          if (on[i].n <= 2) short++;
          on[i] = null;
        }
      });
    });
  }
  assert.ok(n >= 10, `${n} taunts in the two rounds`);
  assert.equal(walked, 0, `${walked} of ${n} taunts ended by his walking`);
  assert.ok(short <= n * 0.1, `${short} of ${n} taunts over within 2 frames`);
});

// (the lanes' colours are all in the legend over them: a taunt's too)
test('the legend over the lanes names every colour they use', () => {
  const html = readFileSync(path.join(root, 'spar.html'), 'utf8'),
    js = readFileSync(path.join(root, 'src/spar.mjs'), 'utf8'),
    legend = /<div id="legend">([\s\S]*?)<\/div>/.exec(html)[1],
    named = [...legend.matchAll(/class="k (\w)">([^<]+)</g)].map(m => m[2]),
    kinds = Object.keys(Function('return ' + /const KIND = (\{[^}]+\})/.exec(js)[1])()).filter(k => k !== 'down');
  assert.deepEqual(named, ['공격', '회피', '방어', '도발', '피격', '거리', '축']);
  assert.deepEqual(kinds, ['attack', 'evade', 'guard', 'show', 'hurt', 'distance', 'axis']);
});
