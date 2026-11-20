import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, HOME, AWAY, drive, freshBout } from '../src/footwork.mjs';
import { FOOTWORK } from '../src/ladder.mjs';
import { createBout, step, settle } from '../src/game/bout.mjs';
import { sole, UP, DOWN } from '../src/measure.mjs';

const DT = 1 / 60;
// play an entry for `loops` of its script; -> what the lead boxer's feet did
function play(entry, loops) {
  const bout = createBout(7),
    [a, b] = bout.fighters,
    up = { Left: false, Right: false },
    plants = [],
    ends = [];
  let far = 0,
    near = 9;
  [a.x, a.z] = HOME;
  [b.x, b.z] = AWAY;
  settle(bout);
  const ticks = Math.round((entry.loop * loops) / DT);
  for (let i = 0; i < ticks; i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    b.hp = 1000;
    for (const joint of ['Left', 'Right']) {
      const y = sole(a.pose.at, joint);
      if (y > UP) up[joint] = true;
      else if (up[joint] && y < DOWN) (up[joint] = false), plants.push({ t: i * DT, joint });
    }
    if ((i + 1) % Math.round(entry.loop / DT) === 0) ends.push([a.x, a.z]);
    const off = Math.hypot(a.x - HOME[0], a.z - HOME[1]);
    if (i > 60) (far = Math.max(far, off)), (near = Math.min(near, off));
  }
  const gaps = plants.slice(1).map((p, i) => p.t - plants[i].t);
  return { plants, ends, far, near, pace: plants.length > 1 ? Math.round((60 * (plants.length - 1)) / (plants[plants.length - 1].t - plants[0].t)) : 0, alternate: plants.slice(1).filter((p, i) => p.joint !== plants[i].joint).length / Math.max(1, plants.length - 1), gaps, bout };
}

for (const entry of ENTRIES)
  test(`footwork: ${entry.en} keeps its feet coming down, mostly in turn, and comes back to where it started`, () => {
    const run = play(entry, 3);
    assert.ok(run.plants.length >= 6, `${run.plants.length} feet came down`);
    // (mostly: setting off, the foot on the side he is going may step twice: see gait.test.mjs)
    assert.ok(run.alternate >= 0.7, 'lead and rear take turns: ' + run.alternate.toFixed(2));
    // (footwork that keeps his own time, the pendulum, has no loop in seconds: it is only asked to stay in its lane)
    if (entry.stick) assert.ok(run.far < 0.36 && run.near < 0.05, `in and out between ${run.near.toFixed(2)} and ${run.far.toFixed(2)} m`);
    else for (const [x, z] of run.ends) assert.ok(Math.hypot(x - entry.me(0)[0], z - entry.me(0)[1]) < 0.2, `ends a loop at ${x.toFixed(2)}, ${z.toFixed(2)}`);
  });

test('footwork: the beat is slowest bouncing on the spot and quickens when he travels', () => {
  const bounce = play(ENTRIES.find(e => e.id === 'bounce'), 2),
    circle = play(ENTRIES.find(e => e.id === 'circle'), 2);
  assert.ok(bounce.pace > 150 && bounce.pace < 230, 'bouncing: ' + bounce.pace + ' feet a minute');
  assert.ok(Math.max(...bounce.gaps) - Math.min(...bounce.gaps) < 0.05, 'and even');
  assert.ok(Math.min(...circle.gaps) < Math.min(...bounce.gaps) - 0.03, 'steps come quicker than the bounce');
});

test('footwork: the step jab and the one-two land', () => {
  for (const id of ['stepjab', 'onetwo']) {
    const entry = ENTRIES.find(e => e.id === id),
      bout = createBout(7),
      hits = [];
    [bout.fighters[0].x, bout.fighters[0].z] = HOME;
    [bout.fighters[1].x, bout.fighters[1].z] = AWAY;
    settle(bout);
    for (let i = 0; i < Math.round((entry.loop * 2) / DT); i++) {
      step(bout, drive(entry, bout, i * DT, DT), DT);
      bout.fighters[1].hp = 1000;
      hits.push(...bout.events.filter(e => e.type === 'hit').map(e => e.name));
    }
    assert.deepEqual(hits, id === 'stepjab' ? ['jab', 'jab'] : ['jab', 'cross', 'jab', 'cross'], id);
  }
});
/* Every grade of the step jab and the step one-two throws and lands in every loop, not only the first: the drills are not
   started afresh each loop (catalogue, footwork.mjs: drive), and a grade that is cued off his own beat presses again. */
test('footwork: every grade lands the step jab and the one-two in every loop', () => {
  for (const id of ['stepjab', 'onetwo'])
    for (const entry of FOOTWORK.filter(e => e.item === id)) {
      const bout = freshBout(entry),
        n = Math.round(entry.loop / DT),
        loops = [];
      for (let i = 0; i < n * 3; i++) {
        step(bout, drive(entry, bout, i * DT, DT), DT);
        bout.fighters[1].hp = 1000;
        for (const e of bout.events) if (e.type === 'hit' && e.who === 0) (loops[Math.floor(i / n)] = loops[Math.floor(i / n)] || []).push(e.name);
      }
      for (let k = 0; k < 3; k++) assert.deepEqual(loops[k], id === 'stepjab' ? ['jab'] : ['jab', 'cross'], `${entry.id}, loop ${k + 1}: ${JSON.stringify(loops)}`);
    }
});
export { play };
