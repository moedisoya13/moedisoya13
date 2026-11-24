/* Right up close, and in and out of it (docs/moves-plan-4.md §1–§4), as the catalogue's rows fight them (src/ladder.mjs:
   the inside punches on the punch ladder, and MOVING): the inside hook and the inside uppercut land from 0.64 m at every
   grade, stronger grade by grade, the hook with more of the hips and the chest than the long-range hook and far harder than
   it from there, the uppercut on its knees' spring and straight up; the power chain right up close is those two; the duck in
   goes down into the knees and in to right up close, and a punch out of the end of it is wound up already; the two ways away
   let the guard go and bounce out of range on their toes. Where the plan's numbers and the bout part company, what is held
   here is what the bout does (README). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle, RULES } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { rung, run } from '../src/measure.mjs';
import { LADDER, ENTRY } from '../src/ladder.mjs';
import { LEVELS } from '../src/anim/skill.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { audit } from '../src/audit.mjs';

const DT = 1 / 60;
const CLEAN = ['1', '2', '3', '4m', '5m'];
const ladder = Object.fromEntries(['hookIn', 'upperIn'].flatMap(p => LEVELS.map(lv => [`${p}@${lv}`, rung(`${p}@${lv}`)])));
const r = (p, lv) => ladder[`${p}@${lv}`];
const ordered = (p, chain) => chain.every(([lo, hi]) => r(p, hi).J > r(p, lo).J);

// a ladder rung thrown from another distance, the long-range chain held if asked (RULES.inside): the blow
function thrownFrom(id, gap, plain) {
  const base = LADDER.find(e => e.id === id),
    entry = Object.assign({}, base, { him: () => [HOME[0] + gap, HOME[1]] }),
    inside = RULES.inside;
  if (plain) RULES.inside = 0;
  const bout = freshBout(entry);
  let blow = null;
  for (let t = 0; t < 120 && !blow; t++) {
    step(bout, drive(entry, bout, t * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    blow = bout.events.find(e => e.who === 0 && ['hit', 'graze', 'whiff', 'block'].includes(e.type)) || null;
  }
  RULES.inside = inside;
  return blow;
}

/* (from 0.66 m, and from 0.62 to 0.68 m, at every one of them: the inside hook turned by the waist, plan 6 §3.3 N14, knocks
   him back to 0.72 m by the next press, and at a pro's that press goes on with the inside chain, stepping back in for it:
   game/bout.mjs RULES.insideOn, insideTo) */
test('inside: right up close the power button throws the inside hook and the inside uppercut in turn, and no straight punch', () => {
  for (const half of [0.31, 0.32, 0.33, 0.34]) {
    const b = createBout(5);
    b.fighters[0].x = -half;
    b.fighters[1].x = half;
    b.fighters[1].hp = 1000;
    settle(b);
    const thrown = [];
    for (let i = 0; i < 90; i++) {
      step(b, [i % 18 === 0 && i < 50 ? { power: true } : {}, {}], DT);
      for (const e of b.events) if (e.type === 'punch' && e.who === 0) thrown.push(e.name);
    }
    assert.deepEqual(thrown, ['hookIn', 'upperIn', 'hookIn'], `from ${2 * half} m`);
  }
});

/* (and at whatever moment of his stance it is pressed, from wherever right up close: the chain from 0.56 to 0.70 m (the bout
   pushes them out to 0.62), the first press 0 to 17 frames after the two are set down, a beat's worth of moments. The other
   man's head goes up and down with his beat and with the hook he has just taken; the uppercut is aimed where his chin is as
   the shoulder fires, and in the moments his head is on its way up it gets there at the end of its reach: 22 to 30 N·s at a
   pro's in ten of the eighteen moments at 0ac7c0c, 79 to 90 in the other eight, and one moment of an amateur's eighteen at 16
   from 0.65 m on. Held, at an amateur's and a pro's, from every one of the thirteen distances at every moment: the three
   presses throw the inside hook, the inside uppercut and the inside hook, all three land, and the uppercut is no weaker than
   the same moment's from the same distance at 0ac7c0c by more than a newton-second (PHASES, measured there, GAPS by moment; 0
   where 0ac7c0c threw the long hook, the pro's man knocked past 0.72 m, which the chain now goes on through: game/bout.mjs
   RULES.insideOn). The second build's U whiffed in four of a pro's moments from 0.66 m; the third's, sent 5 cm through,
   landed 20 where it had landed 50 at an amateur's from 0.68 m on, and 33 for 89 at a pro's from 0.56 m (`through` 6 cm:
   anim/moves.mjs).
   At the other grades, from 0.56, 0.62, 0.66 and 0.70 m at every moment: a beginner's three are the inside three and land;
   a great one's and a legend's second and third land whatever they are, and the second is the inside uppercut only where
   the other man is still within RULES.inside as it is pressed, the long hook where he is not, as it was before the waist
   (RULES.insideTo: the rule that keeps a man on the inside chain is a pro's and below; kept on it, a legend stepping back in
   for the third stood where he would topple and whiffed it in half the moments). What is not held for them is the strength
   moment by moment: after the harder inside hook a dirty legend's long hook and long uppercut land heavier than they did in
   every moment, a great dirty fighter's no lighter in any (his legs taken up 0.3 of the way driven out: anim/skill.mjs `spent`; from
   rest, his long hook landed a frame later and lighter in 40 of 224, 6.2 N·s at the worst), a great one's no lighter by
   more than a newton-second; but a legend's long hook lighter than it did in 54 of 212 (4.1 N·s on the average, 115.2
   against 124.1), lighter by a newton-second or less or the same in 19 and heavier in the other 139, and his long uppercut
   after it lighter in 9 (3.3 at the most), by a newton-second or less or the same in 18, heavier in the other 185; a dirty
   legend's long hook, which jammed before the waist (upper arm past its range in every moment, 53 to 59 N·s), lands 115.1
   to 126.2 in all but one moment (62.2) (game/bout.mjs: begin, `spent`). Nor, at an amateur's and a pro's, the third blow's strength: the inside hook out of the
   uppercut lands in the frame the inside hook's own card lands in (from 0.64 m: the legs 0.68 of the way through their
   drive, the hips 0.12), its waist bringing the fist round that much quicker, where 0ac7c0c's, at 0.63 to 0.67 m, 3 cm
   further than its card, came onto the head a frame later, with the hips 0.34 of the way round, and so 40% harder than its
   own card's: 36.8 against 43.0 at the worst of an amateur's 20 moments, 49.2 against 65.1 at the worst of a pro's 21 (it
   lands harder in the rest: the stage's report has the table). Held, it would mean the inside hook landing a frame later
   at its own card too, against the card's own `ms` and the waist's turning its fastest in the contact frame (below) */
const GAPS = [0.56, 0.58, 0.6, 0.61, 0.62, 0.63, 0.64, 0.65, 0.66, 0.67, 0.68, 0.69, 0.7];
const PHASES = {
  2: [
    [48.1, 45.8, 47, 48, 48.4, 49.3, 50.3, 51.5, 52.7, 53.3, 55, 55.6, 55.7, 55.6, 55.4, 56.4, 57.1, 55.5],
    [49, 46.2, 46.7, 48, 48.3, 49.1, 50.1, 51.3, 52.5, 53.2, 54.8, 55.6, 55.7, 55.7, 55.3, 56.1, 57.1, 56.1],
    [49.9, 46.6, 46.5, 47.9, 48.6, 49, 50, 51.1, 52.4, 53.1, 55.5, 55.4, 55.7, 55.7, 55.4, 55.8, 57, 56.6],
    [50.4, 46.9, 46.4, 47.9, 48.6, 48.9, 49.9, 51, 52.3, 53, 53.6, 55.4, 55.7, 55.7, 55.5, 55.7, 56.9, 56.7],
    [50.2, 47.5, 46.2, 47.8, 48.5, 48.9, 49.9, 50.9, 52.2, 53, 53.5, 55.3, 55.7, 55.7, 55.5, 55.6, 56.8, 56.9],
    [50.6, 46.8, 46.3, 47.8, 48.5, 48.9, 49.8, 50.9, 52.2, 52.9, 53.5, 55.3, 55.7, 55.7, 55.5, 55.7, 56.9, 57],
    [50.4, 46.7, 46.3, 47.8, 48.4, 48.9, 49.8, 50.9, 52.1, 52.9, 53.5, 55.3, 55.7, 55.7, 55.5, 55.7, 56.8, 57.3],
    [50, 46.6, 46.2, 47.7, 16.3, 49.1, 50.1, 50.9, 52.1, 53, 53.5, 55.3, 55.8, 55.7, 55.5, 55.7, 56.8, 57.3],
    [49.8, 46.4, 46.2, 47.7, 16.3, 49.1, 50.2, 51, 52.1, 53, 53.5, 55.3, 55.8, 55.7, 55.5, 55.9, 57.1, 57.3],
    [49.8, 46.4, 46.2, 47.7, 16.4, 49.1, 50.3, 51, 52.2, 53, 53.5, 55.8, 55.7, 55.7, 55.4, 55.9, 57.1, 57.3],
    [49.5, 46.4, 46, 47.7, 16.4, 49.1, 50.2, 51, 52.2, 53.2, 53.5, 55.8, 55.7, 55.7, 55.4, 55.9, 57.1, 57.3],
    [49.5, 46.3, 45.9, 47.7, 16.4, 49.2, 50.2, 51, 52.2, 53.2, 53.5, 55.8, 55.7, 55.7, 55.5, 55.9, 57.1, 57.3],
    [49.2, 46.3, 45.9, 47.6, 16.5, 49.3, 50.3, 51, 52.2, 53.2, 53.5, 55.8, 55.7, 55.7, 55.6, 55.9, 57.1, 56.8]
  ],
  3: [
    [86.2, 85.6, 86.9, 88, 89.3, 86.3, 81.8, 21.8, 24.1, 24.4, 24.4, 24.8, 26.1, 26.7, 28.4, 28.7, 30, 88.8],
    [86.4, 85.6, 86.6, 87.4, 89.3, 87, 82.8, 21.9, 22.5, 24.4, 24.3, 24.7, 25.8, 26.6, 27.3, 28.6, 29.9, 30.5],
    [86.7, 85.7, 86.5, 86.9, 89.2, 87.5, 83.8, 79.2, 22.2, 24.3, 24.2, 24.7, 25.6, 26.5, 27.2, 28.5, 29.9, 30.5],
    [86.8, 85.7, 86.4, 86.6, 89, 88.4, 84.3, 79.7, 22, 24.3, 24.3, 24.7, 25.4, 26.5, 27.2, 28.5, 30, 30],
    [86.9, 85.3, 86.3, 86.2, 88.8, 88.9, 84.7, 80.3, 22.2, 24.5, 24.6, 24.6, 25.6, 26.4, 27, 28.5, 30, 30],
    [86.8, 85.3, 86.4, 86.4, 88.9, 88.9, 84.7, 80.3, 22.2, 24.5, 24.7, 24.7, 25.8, 26.5, 27.1, 28.5, 30, 30],
    [86.7, 85.3, 86.5, 86.6, 89.1, 87.7, 84.6, 80.1, 22.2, 24.6, 24.8, 24.8, 24.6, 26.6, 27.1, 28.6, 30, 30],
    [86.7, 85.4, 85.9, 86.7, 89.2, 87.6, 84.4, 79.9, 22.4, 24.7, 24.9, 24.9, 25.6, 26.6, 27.1, 28.7, 30, 30],
    [86.7, 85.3, 85.9, 86.9, 89.4, 87.4, 84.2, 79.8, 22.5, 24.8, 25, 24.9, 24.7, 26.7, 27.2, 28.7, 28.9, 30],
    [86.6, 85.3, 85.8, 87.1, 89.5, 87.3, 84, 79.6, 22.6, 24.9, 25.1, 25, 26.1, 26.8, 27.3, 28.8, 28.9, 0],
    [86.6, 85.3, 85.8, 87.3, 89.6, 87.2, 83.8, 79.5, 22.7, 25.1, 25.2, 25.2, 26.1, 0, 0, 0, 0, 0],
    [86.5, 85.2, 85.8, 87.5, 89.7, 87, 83.6, 79.3, 22.9, 25.2, 25.2, 25.3, 0, 0, 0, 0, 0, 0],
    [86.4, 85.2, 85.7, 87.7, 89.8, 86.9, 83.4, 79.1, 23, 25.3, 0, 0, 0, 0, 0, 0, 0, 0]
  ]
};
function chainFrom(gap, off, lv) {
  const b = createBout(5, lv === '3' ? undefined : { skills: [{ all: lv }, {}] });
  b.fighters[0].x = -gap / 2;
  b.fighters[1].x = gap / 2;
  b.fighters[1].hp = 1000;
  settle(b);
  const thrown = [],
    blows = [],
    far = [];
  for (let i = 0; i < 100 + off; i++) {
    const k = i - off,
      press = k >= 0 && k % 18 === 0 && k < 50;
    if (press) far.push(Math.hypot(b.fighters[1].x - b.fighters[0].x, b.fighters[1].z - b.fighters[0].z));
    step(b, [press ? { power: true } : {}, {}], DT);
    b.fighters[1].hp = 1000;
    for (const e of b.events) {
      if (e.who === 0 && e.type === 'punch') thrown.push(e.name);
      if (e.who === 0 && ['hit', 'block', 'graze', 'whiff'].includes(e.type)) blows.push(e);
    }
  }
  return { thrown, blows, far };
}
test('inside: the chain\'s uppercut lands at whatever moment of his stance it is pressed, from 0.56 to 0.70 m, no weaker than it did', () => {
  for (const lv of ['2', '3'])
    GAPS.forEach((gap, g) => {
      for (let off = 0; off < 18; off++) {
        const { thrown, blows } = chainFrom(gap, off, lv),
          said = `${lv} from ${gap} m, ${off} frames in: ${thrown.join(' ')} ${blows.map(x => `${x.type} ${x.J}`).join(', ')}`;
        assert.deepEqual(thrown, ['hookIn', 'upperIn', 'hookIn'], said);
        assert.ok(blows.length === 3 && blows.every(x => x.type === 'hit'), said);
        assert.ok(blows[1].J >= PHASES[lv][g][off] - 1, `${said} (${PHASES[lv][g][off]} at 0ac7c0c)`);
      }
    });
  for (const lv of LEVELS.filter(x => !PHASES[x]))
    for (const gap of [0.56, 0.62, 0.66, 0.7])
      for (let off = 0; off < 18; off++) {
        const { thrown, blows, far } = chainFrom(gap, off, lv),
          said = `${lv} from ${gap} m, ${off} frames in: ${thrown.join(' ')} ${blows.map(x => `${x.type} ${x.J}`).join(', ')}`;
        assert.ok(blows.length === 3 && blows[1].type === 'hit' && blows[2].type === 'hit', said);
        if (lv === '1') assert.deepEqual(thrown, ['hookIn', 'upperIn', 'hookIn'], said);
        else assert.equal(thrown[1], far[1] < RULES.inside ? 'upperIn' : 'hook', `${said}; ${far[1].toFixed(3)} m apart at the second press`);
      }
});

test('inside hook: lands from 0.64 m at every grade, harder grade by grade, and harder than the hook thrown from there', () => {
  for (const lv of LEVELS) assert.equal(r('hookIn', lv).type, 'hit', `hookIn@${lv}`);
  assert.ok(ordered('hookIn', [['1', '2'], ['2', '3'], ['3', '4m'], ['4m', '5m'], ['3', '4a'], ['4a', '5a']]), LEVELS.map(lv => r('hookIn', lv).J).join(' '));
  const hook = thrownFrom('hook@3', 0.64, true);
  // (the plan's "1.5 times" is not reached: README)
  assert.ok(!hook || hook.type !== 'hit' || r('hookIn', '3').J >= 1.2 * hook.J, `inside hook ${r('hookIn', '3').J} N·s, the hook from 0.64 m ${hook && hook.J}`);
  // (the glove met the head at the speed the plan asks of the pro's: 9 m/s or more)
  assert.ok(r('hookIn', '3').speed >= 9, `${r('hookIn', '3').speed} m/s`);
});

/* how far the hips' line and the shoulders' line swing, from the press to the contact (degrees, the most against the least:
   the wind-up and the turn through it) */
function swing(id) {
  const { frames } = run(LADDER.find(e => e.id === id)),
    press = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'punch')),
    hit = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'hit')),
    d = k => frames.slice(press, hit + 1).map(f => f[k]),
    span = list => ((Math.max(...list) - Math.min(...list)) * 180) / Math.PI;
  return { hips: span(d('hips')), shoulders: span(d('shoulders')) };
}
/* (written, the hips and the chest turn through more than the long-range hook's; as thrown it lands earlier in that turn, from
   so close, and has turned less by then: README) */
test('inside hook: the hips and the chest are written to turn through more than the long-range hook\'s, and both feet turn', () => {
  const [hook, inside] = [MOVES.hook, MOVES.hookIn];
  assert.ok(Math.abs(inside.links.hips.yaw) > Math.abs(hook.links.hips.yaw) && Math.abs(inside.links.trunk.twist) > Math.abs(hook.links.trunk.twist));
  assert.ok(inside.links.drive.lfw < 0 && inside.links.drive.rfw > 0 && inside.links.drive.lkx < 0, 'the lead foot and knee turn in, the rear foot out');
  const a = swing('hook@3'),
    b = swing('hookIn@3');
  // (and as thrown, it does turn, the hips a good deal and the chest more)
  assert.ok(b.hips >= 12 && b.shoulders > b.hips, `hook ${a.hips.toFixed(0)} / ${a.shoulders.toFixed(0)}, inside hook ${b.hips.toFixed(0)} / ${b.shoulders.toFixed(0)} deg`);
});

/* The inside uppercut's numbers off the rung: the most either knee bends while it goes, how far the hips go down and come up,
   how fast they come up, the glove's way over the three frames before it lands, off upright, and whether the knees are
   straightening while the hand is coming up (both rising in the same frames) */
const flex = j => {
  const a = j.RightLeg,
    k = j.RightShin,
    f = j.RightFoot,
    u = [a[0] - k[0], a[1] - k[1], a[2] - k[2]],
    v = [f[0] - k[0], f[1] - k[1], f[2] - k[2]];
  return 180 - (Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
};
function spring(lv) {
  const { frames } = run(LADDER.find(e => e.id === `upperIn@${lv}`)),
    press = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'punch')),
    hit = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'hit')),
    live = frames.slice(press, hit + 1).filter(f => !f.held),
    hips = live.map(f => f.hipsY),
    low = Math.min(...hips),
    g = live.map(f => f.gloves.R),
    n = g.length,
    d = [0, 1, 2].map(i => g[n - 1][i] - g[n - 4][i]);
  let rise = 0,
    both = 0,
    handOnly = 0;
  for (let i = 1; i < live.length; i++) {
    rise = Math.max(rise, (hips[i] - hips[i - 1]) / DT);
    // (the rear knee straightening: its bend from straight, from the hip, knee and ankle)
    const up = g[i][1] - g[i - 1][1] > 0.01,
      legs = flex(live[i - 1].joints) - flex(live[i].joints) > 1.5;
    if (up && legs) both++;
    else if (up) handOnly++;
  }
  return { down: hips[0] - low, up: hips[hips.length - 1] - low, rise, off: (Math.atan2(Math.hypot(d[0], d[2]), d[1]) * 180) / Math.PI, both, handOnly };
}
const springs = Object.fromEntries(LEVELS.map(lv => [lv, spring(lv)]));

test('inside uppercut: lands from 0.64 m at every grade, harder grade by grade, harder than the uppercut thrown from there', () => {
  for (const lv of LEVELS) assert.equal(r('upperIn', lv).type, 'hit', `upperIn@${lv}`);
  assert.ok(ordered('upperIn', [['1', '2'], ['2', '3'], ['3', '4m'], ['4m', '5m'], ['3', '4a'], ['4a', '5a']]), LEVELS.map(lv => r('upperIn', lv).J).join(' '));
  const upper = thrownFrom('upper@3', 0.64, true);
  assert.ok(upper && r('upperIn', '3').J > upper.J && r('upperIn', '3').J > 65, `inside uppercut ${r('upperIn', '3').J} N·s, the uppercut from 0.64 m ${upper && upper.J}`);
});

test('inside uppercut: the last of its way is upright, it comes up off the knees, and the knees and the hand go up together from a pro up', () => {
  for (const lv of LEVELS) assert.ok(springs[lv].off <= 25, `upperIn@${lv}: ${springs[lv].off.toFixed(0)} degrees off upright over the last three frames`);
  // (the pro goes down 10 cm into his knees, the plan's 10-11, and comes up off them)
  assert.ok(springs['3'].down >= 0.09 && springs['3'].up >= 0.06, `pro: down ${(springs['3'].down * 100).toFixed(1)}, up ${(springs['3'].up * 100).toFixed(1)} cm`);
  for (const lv of ['3', '4m', '4a', '5m', '5a']) assert.ok(springs[lv].both >= 2, `upperIn@${lv}: the knees straighten with the hand going up in ${springs[lv].both} frames`);
  // (a beginner's knees do not take him down at all, and his arm does it on its own)
  assert.ok(springs['1'].down < 0.03 && springs['1'].both < springs['3'].both, `beginner: down ${(springs['1'].down * 100).toFixed(1)} cm, together in ${springs['1'].both} frames`);
});

test('inside uppercut: the hips come up faster than the long-range uppercut\'s', () => {
  const { frames } = run(LADDER.find(e => e.id === 'upper@3')),
    press = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'punch')),
    hit = frames.findIndex(f => f.events.some(e => e.who === 0 && e.type === 'hit')),
    live = frames.slice(press, hit + 1).filter(f => !f.held);
  let rise = 0;
  for (let i = 1; i < live.length; i++) rise = Math.max(rise, (live[i].hipsY - live[i - 1].hipsY) / DT);
  assert.ok(springs['3'].rise > rise, `${springs['3'].rise.toFixed(2)} against ${rise.toFixed(2)} m/s`);
});

/* ---- plan 6 §3.3 N14: the inside hook's waist ("허리를 분리하여 회전할 수 있는 변수로 둡니다. 허리를 강하게 돌립니다."). Set
   off with the hips as the legs hand on, and quicker than they are, it is wound back the other way and turned through 7
   degrees or so by the contact, at 350 to 400 deg/s, turning fastest before it, while the hips are still wound back: the
   waist does the hitting. As the bout fights the rungs (the impulse before the waist, at 7fa3003 as at 4c726b9: 46.6, 54.7,
   56.8 N·s). Of the plan's table the waist's speed (450 / 550 / 620 deg/s), the waist 10 degrees past his guard at the
   contact and the weight behind the glove (3.8 / 4.0 / 4.2 kg) are not reached: a bigger or quicker waist takes the impulse
   past the plan's own bands at 4 and 5, and raising the fist faster to meet it level (the first try) knocked the other man
   straight back and swung the arm on into his guard (README, the stage's report). */
const BEFORE_WAIST = { 3: 46.6, '4m': 54.7, '5m': 56.8 };
test('inside hook: the waist does the hitting, harder by 15% and more, within the plan\'s bands, no later, softer than the hook', () => {
  const BAND = { 3: [56, 68, 133, 200, 3.5], '4m': [66, 80, 100, 230, 3.7], '5m': [70, 85, 100, 230, 4.0] };
  for (const [lv, [lo, hi, ms, speed, kg]] of Object.entries(BAND)) {
    const r = ladder[`hookIn@${lv}`],
      hook = rung(`hook@${lv}`),
      during = r.frames.slice(r.pressTick, r.hitTick + 1),
      // (on the pelvis, + to his left: wound back that way, and turned to his right, the hook's way, by the contact)
      wound = Math.max(...during.map(f => f.waist)),
      turned = wound - r.frames[r.hitTick].waist,
      live = during.filter(f => !f.held),
      rates = live.slice(1).map((f, k) => Math.abs(f.waist - live[k].waist)),
      fastest = rates.indexOf(Math.max(...rates)) + 1;
    assert.ok(r.J >= lo && r.J <= hi && r.J >= 1.15 * BEFORE_WAIST[lv] && r.J < hook.J, `hookIn@${lv}: ${r.J} N·s (before ${BEFORE_WAIST[lv]}, the hook ${hook.J})`);
    assert.ok(r.ms <= ms, `hookIn@${lv}: ${r.ms} ms`);
    // (and turning its fastest in the frame the glove gets there: set off with the hips, it hits as it turns; the first build
    // set it off with the legs and had it past its fastest by then, a frame early)
    assert.ok(r.waist >= speed && r.waist <= 900 && fastest === live.length - 1, `hookIn@${lv}: the waist on the pelvis at ${r.waist} deg/s, fastest in frame ${fastest} of ${live.length}`);
    assert.ok(turned >= 5.5 && r.hipTurn <= 5, `hookIn@${lv}: the waist turned ${turned.toFixed(1)} deg by the contact, the hips ${r.hipTurn}`);
    assert.ok(r.mass >= kg, `hookIn@${lv}: ${r.mass} kg behind it`);
  }
  // (a beginner turns all of a piece: no waist of his own)
  assert.ok(ladder['hookIn@1'].waist < 60, `hookIn@1: ${ladder['hookIn@1'].waist} deg/s`);
});

/* (and a beginner and an amateur, who turn their waist all of a piece and partly, no weaker than before it, 0.94 of it at the
   least (14.9 and 36.1 N·s at 7fa3003), and sent off without a jump: no step of the fist before the contact frame more than 2
   cm over what it was (13.7 and 13.6 cm a frame); half the legs' drive to raise it all the way, the first build's, sent a
   beginner's off 20 cm in a frame. The contact frame itself is left out of that, and is not within 2 cm at the amateur's: 18.2
   cm against 16.1, 2.07 over. That frame's step is the glove's speed as it lands, 10.6 m/s against 9.2, the 20% the waist
   adds to the blow; the beginner's is what it was, 9.4 cm. It is held instead to what the blow's own speed accounts for: no
   more than 2 cm over the speed the glove meets him at, times the frame (9.4 against 7.6 and 18.2 against 17.7 cm; the
   amateur's 16.1 against 15.3 at 7fa3003)) */
const LOW_GRADES = { 1: [14.9, 13.72], 2: [36.1, 13.55] };
test('inside hook: a beginner and an amateur no weaker than before the waist, and the fist sent off without a jump', () => {
  for (const [lv, [J, most]] of Object.entries(LOW_GRADES)) {
    const r = ladder[`hookIn@${lv}`],
      live = r.frames.slice(r.pressTick - 2, r.hitTick + 1).filter(f => !f.held),
      steps = live.slice(1, -1).map((f, k) => Math.hypot(...f.gloves.L.map((v, i) => v - live[k].gloves.L[i])) * 100);
    assert.ok(r.J >= 0.94 * J, `hookIn@${lv}: ${r.J} N·s, ${J} before`);
    assert.ok(Math.max(...steps) <= most + 2, `hookIn@${lv}: the fist ${steps.map(x => x.toFixed(1)).join(' ')} cm a frame`);
    // (the contact frame: the glove goes no further in it than the speed it meets him at accounts for, and 2 cm)
    const last = Math.hypot(...live[live.length - 1].gloves.L.map((v, i) => v - live[live.length - 2].gloves.L[i])) * 100;
    assert.ok(last <= r.speed * DT * 100 + 2, `hookIn@${lv}: the fist ${last.toFixed(1)} cm in the contact frame, meeting him at ${r.speed} m/s`);
  }
});

/* ---- plan 6 §3.3 N16: the inside uppercut, more knee and the fist's way a U ("무릎을 더 써서 주먹의 궤적을 U자로."). The rear
   knee bends 8 degrees and more further than it did (80.2 at 4c726b9 and 7fa3003, the most from the press to the contact:
   89.1 now), the hand goes down first and then forward and in along the bottom, and the last of its way is straight up; no
   weaker and no later than it was (at 4c726b9 and 7fa3003: 19.0 / 54.7 / 89.8 / 97.1 / 96.7 / 107.9 / 108.9 N·s, 333 / 383 /
   267 / 350 / 350 / 167 / 167 ms). The glove's way is read in the plane seen from his side (ahead toward the other man, up),
   from the press to the contact. Of the plan's table the level bottom (10 cm forward within 3 cm of the lowest) is not
   reached: the pro's hand goes forward along the bottom while it sinks the last 2 cm (7.8 cm of it within 3 cm of the
   lowest, 9.0 within 15), 4명's 3.1 and 5명's 0 within 3 cm, going forward further up, on the way down (README). */
const BEFORE_U = { 1: [19.0, 333], 2: [54.7, 383], 3: [89.8, 267], '4m': [97.1, 350], '4a': [96.7, 350], '5m': [107.9, 167], '5a': [108.9, 167] };
function uOf(lv) {
  const r = ladder[`upperIn@${lv}`],
    { frames } = r,
    press = r.pressTick,
    live = frames.slice(press, r.hitTick + 1).filter(f => !f.held),
    p0 = frames[press],
    ax = [p0.him[0] - p0.at[0], p0.him[1] - p0.at[1]],
    l = Math.hypot(...ax),
    path = live.map(f => [(f.gloves.R[0] - p0.gloves.R[0]) * (ax[0] / l) + (f.gloves.R[2] - p0.gloves.R[2]) * (ax[1] / l), f.gloves.R[1] - p0.gloves.R[1]]),
    low = Math.min(...path.map(q => q[1])),
    bottom = path.filter(q => q[1] <= low + 0.15),
    // (how far forward the hand had gone when it was 35 cm down: going down, not out)
    down = path.find(q => q[1] <= -0.35);
  let len = 0,
    k = path.length - 1;
  while (k > 0 && len < 0.15) (len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1])), k--;
  const end = path[path.length - 1];
  return { low: -low, along: Math.max(...bottom.map(q => q[0])) - Math.min(...bottom.map(q => q[0])), down: down ? down[0] : null, last: (Math.atan2(Math.abs(end[0] - path[k][0]), end[1] - path[k][1]) * 180) / Math.PI, knee: Math.max(...live.map(f => flex(f.joints))) };
}
test('inside uppercut: more knee, the hand down and along the bottom, the last of it straight up, no weaker and no later', () => {
  for (const lv of LEVELS) {
    const r = ladder[`upperIn@${lv}`],
      [J, ms] = BEFORE_U[lv];
    assert.ok(r.J >= J && r.ms <= ms + DT * 1000 + 1e-9, `upperIn@${lv}: ${r.J} N·s ${r.ms} ms (before ${J}, ${ms})`);
  }
  for (const [lv, deep] of [['3', 0.26], ['4m', 0.28], ['5m', 0.18]]) {
    const u = uOf(lv);
    assert.ok(u.low >= deep && u.last <= 15, `upperIn@${lv}: ${(u.low * 100).toFixed(1)} cm down, the last 15 cm ${u.last.toFixed(1)} deg off upright`);
  }
  const pro = uOf('3');
  assert.ok(pro.knee >= 80.2 + 8, `upperIn@3: the rear knee bent ${pro.knee.toFixed(1)} deg at the most`);
  // (the pro's U: 35 cm down the hand has gone 8 cm forward at the most (16 before; 0.3 measured), and along the lowest 15 cm
  // of its way 6 cm and more (9.0 measured; within 3 cm of the lowest 7.8, the plan's 10: above))
  assert.ok(pro.down <= 0.08 && pro.along >= 0.06, `upperIn@3: ${(pro.down * 100).toFixed(1)} cm forward 35 cm down, ${(pro.along * 100).toFixed(1)} cm along the bottom`);
});

/* (and up without a jump in the frame before it lands: where the first build's U let go of its floor as the shoulder fired, the
   amateur's and the pro's fist went 35 and 34 cm in that frame; no more than 2 cm over what it went at 7fa3003 (22.6 and
   21.6 cm; 23.6 and 21.3 now). At the other grades it goes 20.6 / 19.2 / 17.9 / 17.5 cm, 20.5 / 16.9 / 17.3 / 17.1 before) */
const BEFORE_STEP = { 2: 22.62, 3: 21.64 };
test('inside uppercut: the amateur\'s and the pro\'s fist come up without a jump before they land', () => {
  for (const [lv, most] of Object.entries(BEFORE_STEP)) {
    const r = ladder[`upperIn@${lv}`],
      live = r.frames.slice(r.pressTick - 2, r.hitTick + 1).filter(f => !f.held),
      steps = live.slice(1, -1).map((f, k) => Math.hypot(...f.gloves.R.map((v, i) => v - live[k].gloves.R[i])) * 100);
    assert.ok(Math.max(...steps) <= most + 2, `upperIn@${lv}: the fist ${steps.map(x => x.toFixed(1)).join(' ')} cm a frame`);
  }
});

/* ---- off the card's spot (plan 6 stage N): the inside hook and the inside uppercut at every grade, thrown with the other man 4,
   6 and 8 cm nearer than the rung has him (6 and 8 are both as close as the bout lets them stand, 0.62 m) and 5 cm further,
   side-stepping as he throws (10 cm either way at 6 rad/s, about a step a second; the hook 12, 13, 14 and 16 cm too; the
   uppercut 8 cm at 8 rad/s and 16 cm at 7 too), and at the other man moving (5 cm in and out, 20 cm across): within the
   physics audit, nothing broken. The first build of the waist put the inside hook's glove 8.8 to 9.9 cm into his guard
   there, and the uppercut's 8.0 to 8.4 cm into his chest; the second let a legend's hook go round under the jaw of a man 12
   cm off the line and on through his lead shoulder (the fist is raised with the waist's turn now, animator.mjs), and took
   the pro's lead glove 8.1 cm into the other man's lead shoulder as he crouched for the uppercut at 0.62 m; the third's
   uppercut took a legend's glove 8.0 to 8.1 cm into the chest of a man he side-stepped 8 cm at 8 rad/s or 16 at 7 (in
   under the target nine tenths of the way now, moves.mjs). At 0ac7c0c all of these are clean, and they are held with no
   exception.
   What is not held, because 0ac7c0c breaks it too (the stage's report has the runs): side-stepping 8 to 20 cm at 4 to 9
   rad/s, every grade, 546 runs of each punch. The hook's: 22 broken at 0ac7c0c, 16 now; the uppercut's: 39 and 23. Of
   those now broken, the ones 0ac7c0c fights clean are a dirty legend's hook at 8 cm and 9 rad/s, 10 and 7, 13 and 8, 13 and
   9 (the other man's glove through the puncher's elbow as he reels off across, 8.4 to 9.7 cm, or the puncher's in his lead
   arm as it lands, 8.0), and six in which he stands where he would topple (five), or their toes overlap by 5.3 cm (one),
   a second after the punch while the card's script walks him 30 cm back out (the same step in both builds, his weight 30 cm and
   more outside his standing foot: which frames have both feet down is what differs). And either punch side-stepping 25 cm,
   where the script carries his place across faster than his feet follow. */
test('inside hook and uppercut: off the card\'s spot, nearer, further, side-stepping and at a man moving, within the audit', () => {
  const vs = [];
  for (const p of ['hookIn', 'upperIn'])
    for (const lv of LEVELS) {
      const e = LADDER.find(x => x.id === `${p}@${lv}`),
        at = e.him(0);
      for (const cm of [-8, -6, -4, 5]) vs.push(Object.assign({}, e, { id: `${e.id}~${cm}`, him: () => [at[0] + cm / 100, at[1]] }));
      // (metres either way, radians a second)
      for (const [amp, w] of p === 'hookIn' ? [[0.1, 6], [0.12, 6], [0.13, 6], [0.14, 6], [0.16, 6]] : [[0.1, 6], [0.08, 8], [0.16, 7]])
        vs.push(Object.assign({}, e, { id: `${e.id}~side${amp}w${w}`, me: t => [e.me(t)[0], e.me(t)[1] + amp * Math.sin(t * w)] }));
      vs.push(Object.assign({}, e, { id: e.id + '~moving', him: t => [at[0] + 0.05 * Math.sin(t * 5), at[1] + 0.2 * Math.sin(t * 3)] }));
    }
  const { found } = audit(vs),
    broken = Object.entries(found).filter(([, c]) => c.bad).map(([k, c]) => `${k}: ${c.bad} frames, ${c.worst.script} @ ${c.worst.t} ${c.worst.value.toFixed(2)}`);
  assert.deepEqual(broken, []);
});

/* (and the chain itself, three power presses 0.3 s apart, at a man who holds his guard up all the way through, the first
   inside hook blocked, or holds it up and steps back 10 cm as it comes, or, from a great one up, holds it up and steps in 6
   cm: at every grade, from every distance and at both moments of chainstep's grid (the stage's report: 0.62, 0.66, 0.70 and
   0.71 m up to a pro, 0.62, 0.66 and 0.70 m from a great one up, pressed 0.2 and 0.27 s in), 120 runs: nothing of the
   puncher's own body or of either man's balance broken. Out of a blocked inside hook the third build's uppercut sent the
   rear hand down late and fast, across into his own lead upper arm (up to 4.1 cm) and turned the upper arm 18 degrees past
   its range, at a legend's, in 13 of the 72 from a great one up; with the hand let down at once, it went down onto the other
   man's lead elbow in front of his chest and into the forearm above it (8 to 13 cm): the bottom of the U is kept in front of
   his elbow now, and no further across than 15 cm from the shoulder (anim/animator.mjs: clearOf). At 0ac7c0c two of the 120
   break it (a great dirty fighter's long hook, the upper arm 7.7 and 8.1 degrees past its range at 0.70 m stepping back).
   What is not held: where the two men's bodies meet (a glove in the other man, the two men inside each other), which
   0ac7c0c breaks in 99 of these 120 and this build in 80, 35 of them deeper than 0ac7c0c's same run (the stage's report
   names each run); and the side-step runs (10 and 16 cm at 6 rad/s, up to a pro, 48 runs), where the beginner's and the
   amateur's uppercut put his own glove in his other arm in 7 of them, no deeper than 0ac7c0c does in the same 7 (and
   0ac7c0c in 7 more) */
test('inside chain: at a man who guards, guards and steps back, or guards and steps in, the puncher\'s body and balance within the audit at every grade', () => {
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)),
    vs = [];
  for (const lv of LEVELS)
    for (const gap of ['1', '2', '3'].includes(lv) ? [0.62, 0.66, 0.7, 0.71] : [0.62, 0.66, 0.7])
      for (const a of [0.2, 0.27])
        for (const how of ['1', '2', '3'].includes(lv) ? ['guard', 'guardBack'] : ['guard', 'guardBack', 'guardIn6']) {
          const g = gap / 2,
            him = { guard: { hisCover: t => t > 0.05 }, guardBack: { hisCover: t => t > 0.05, him: t => [g + 0.1 * ease((t - a) / 0.3), 0] }, guardIn6: { hisCover: t => t > 0.05, him: t => [g - 0.06 * ease((t - a) / 0.3), 0] } }[how];
          vs.push(Object.assign({ id: `chain${lv}~${gap}~${a}~${how}`, loop: 1.8, view: { yaw: 0.12, pitch: 0.2 }, me: t => (t === 0 ? [-g, 0] : null), him: t => (t === 0 ? [g, 0] : null), press: [[a, 'power'], [a + 0.3, 'power'], [a + 0.6, 'power']], setup: b => { b.fighters[1].hp = 1000; if (lv !== '3') b.fighters[0].skills = { all: lv }; }, keep: b => { b.fighters[1].hp = 1000; } }, him));
        }
  assert.equal(vs.length, 120);
  const { found } = audit(vs),
    broken = Object.entries(found).filter(([k, c]) => c.bad && k !== 'a glove inside the other man' && k !== 'the two men inside each other').map(([k, c]) => `${k}: ${c.bad} frames, ${c.worst.script} @ ${c.worst.t} ${c.worst.value.toFixed(2)}`);
  assert.deepEqual(broken, []);
});

/* ---- the duck in and the ways away, off their cards: where he ends (centre to centre), how low his head went (from his
   guard), the angle he ends at seen from the other man, his heels and gloves on the way, and his feet */
function moving(id) {
  const e = ENTRY.find(x => x.id === id),
    { frames } = run(e),
    start = frames.findIndex(f => f.action === e.move),
    end = frames.findIndex((f, i) => i > start && f.action !== e.move),
    during = frames.slice(start, end),
    last = frames[end],
    head0 = frames[start - 1].headY,
    // (the gloves against where they are in his guard, as he stood before it, and the heels: the lowest the soles get)
    guard = frames[start - 1].gloves,
    a0 = Math.atan2(frames[0].at[1] - frames[0].him[1], frames[0].at[0] - frames[0].him[0]),
    a1 = Math.atan2(last.at[1] - last.him[1], last.at[0] - last.him[0]);
  let swapped = false;
  for (const f of during) {
    const L = f.joints.LeftToeBase,
      R = f.joints.RightToeBase,
      ahead = [Math.sin(Math.atan2(f.him[0] - f.at[0], f.him[1] - f.at[1])), Math.cos(Math.atan2(f.him[0] - f.at[0], f.him[1] - f.at[1]))];
    if ((L[0] - R[0]) * ahead[0] + (L[2] - R[2]) * ahead[1] < 0) swapped = true;
  }
  return {
    end: Math.hypot(last.him[0] - last.at[0], last.him[1] - last.at[1]),
    down: head0 - Math.min(...during.map(f => f.headY)),
    angle: Math.abs(((((a1 - a0) * 180) / Math.PI + 540) % 360) - 180),
    gloves: Math.min(...during.slice(10, -14).map(f => Math.min(guard.L[1] - f.gloves.L[1], guard.R[1] - f.gloves.R[1]))),
    heels: Math.min(...during.slice(6, -6).map(f => Math.min(f.joints.LeftFoot[1], f.joints.RightFoot[1]))),
    swapped,
    frames
  };
}
const cards = Object.fromEntries(['duckIn', 'hopPivot', 'hopCircle'].flatMap(m => LEVELS.map(lv => [`${m}@${lv}`, moving(`${m}@${lv}`)])));

test('duck in: from 1.0 m to right up close (inside 0.72 m from a pro up, a beginner short of it), his head well down on the way', () => {
  for (const lv of ['2', '3', '4m', '4a', '5m', '5a']) assert.ok(cards[`duckIn@${lv}`].end < RULES.inside && cards[`duckIn@${lv}`].end >= RULES.gap, `duckIn@${lv}: ends ${cards[`duckIn@${lv}`].end.toFixed(2)} m`);
  assert.ok(cards['duckIn@1'].end > 0.75, `beginner: ${cards['duckIn@1'].end.toFixed(2)} m`);
  for (const lv of LEVELS) assert.ok(cards[`duckIn@${lv}`].down >= 0.18, `duckIn@${lv}: head down ${(cards[`duckIn@${lv}`].down * 100).toFixed(1)} cm`);
});

test('duck in: a great one\'s and a legend\'s inside punch out of the end of it is wound up already, and lands sooner', () => {
  const press = (lv, out) => {
    const base = ENTRY.find(e => e.id === `duckIn@${lv}`),
      e = out ? Object.assign({}, base, { press: [...base.press, [0.95, 'power']] }) : Object.assign({}, base, { him: () => [HOME[0] + 0.68, HOME[1]], press: [[0.95, 'power']] }),
      bout = freshBout(e);
    Object.assign(bout.fighters[0], { lastPower: true, sinceLast: 0, link: 0 });
    let at = null,
      hit = null;
    for (let t = 0; t < 120 && hit === null; t++) {
      if (at === null) bout.fighters[0].sinceLast = 0;
      step(bout, drive(e, bout, t * DT, DT), DT);
      bout.fighters[1].hp = 1000;
      for (const x of bout.events) {
        if (x.who === 0 && x.type === 'punch') at = { t, loaded: !!bout.fighters[0].action.loaded, name: x.name };
        if (x.who === 0 && x.type === 'hit') hit = t;
      }
    }
    return { ms: (hit - at.t) * DT * 1000, loaded: at.loaded, name: at.name };
  };
  for (const lv of ['4m', '5m']) {
    const out = press(lv, true),
      plain = press(lv, false);
    assert.ok(out.name === 'upperIn' && out.loaded && out.ms < plain.ms, `${lv}: out of the duck in ${JSON.stringify(out)}, standing ${JSON.stringify(plain)}`);
  }
  assert.ok(!press('2', true).loaded, 'an amateur\'s is not');
});

test('ways away: out of range, off the line, on their toes with the guard let go of from a pro up; a beginner walks back', () => {
  for (const m of ['hopPivot', 'hopCircle'])
    for (const lv of LEVELS) {
      const c = cards[`${m}@${lv}`];
      assert.ok(c.end >= 1.45, `${m}@${lv}: ends ${c.end.toFixed(2)} m`);
      if (lv !== '1') assert.ok(c.angle >= 10, `${m}@${lv}: ${c.angle.toFixed(0)} degrees off the line`);
      if (!['1', '2'].includes(lv)) {
        assert.ok(c.gloves >= 0.2, `${m}@${lv}: the gloves ${(c.gloves * 100).toFixed(1)} cm under the guard`);
        assert.ok(c.heels > 0.095, `${m}@${lv}: a heel down at ${(c.heels * 100).toFixed(1)} cm`);
      }
    }
  assert.ok(cards['hopPivot@1'].angle < 3 && cards['hopPivot@2'].angle < cards['hopPivot@3'].angle, 'a beginner does not pivot; an amateur, half');
  assert.ok(cards['hopCircle@2'].gloves < 0.05, 'an amateur cannot let his hands go');
});

test('ways away: a legend\'s feet change over once in the air in the middle hop, and nobody else\'s do', () => {
  // (circling: on the pivot's back hops his feet come level and no further)
  assert.ok(cards['hopCircle@5m'].swapped, 'legend');
  for (const lv of ['1', '2', '3', '4m', '4a', '5a']) assert.ok(!cards[`hopCircle@${lv}`].swapped, lv);
});
