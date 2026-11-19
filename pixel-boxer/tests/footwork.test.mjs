import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, HOME, AWAY, drive } from '../src/footwork.mjs';
import { createBout, step, settle } from '../src/game/bout.mjs';

const DT = 1 / 60;
// play an entry for `loops` of its script; -> what the lead boxer's feet did
function play(entry, loops) {
  const bout = createBout(7),
    [a, b] = bout.fighters,
    up = { LeftFoot: false, RightFoot: false },
    plants = [],
    ends = [];
  [a.x, a.z] = HOME;
  [b.x, b.z] = AWAY;
  settle(bout);
  const ticks = Math.round((entry.loop * loops) / DT);
  for (let i = 0; i < ticks; i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    b.hp = 1000;
    for (const joint of ['LeftFoot', 'RightFoot']) {
      const y = a.pose.at[joint][1];
      if (y > 0.099) up[joint] = true;
      else if (up[joint] && y < 0.094) (up[joint] = false), plants.push({ t: i * DT, joint });
    }
    if ((i + 1) % Math.round(entry.loop / DT) === 0) ends.push([a.x, a.z]);
  }
  const gaps = plants.slice(1).map((p, i) => p.t - plants[i].t);
  return { plants, ends, pace: plants.length > 1 ? Math.round((60 * (plants.length - 1)) / (plants[plants.length - 1].t - plants[0].t)) : 0, alternate: plants.slice(1).filter((p, i) => p.joint !== plants[i].joint).length / Math.max(1, plants.length - 1), gaps, bout };
}

for (const entry of ENTRIES)
  test(`footwork: ${entry.en} keeps its feet coming down, in turn, and comes back to where it started`, () => {
    const run = play(entry, 3);
    assert.ok(run.plants.length >= 6, `${run.plants.length} feet came down`);
    assert.ok(run.alternate >= 0.85, 'lead and rear take turns: ' + run.alternate.toFixed(2));
    for (const [x, z] of run.ends) assert.ok(Math.hypot(x - entry.me(0)[0], z - entry.me(0)[1]) < 0.2, `ends a loop at ${x.toFixed(2)}, ${z.toFixed(2)}`);
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
export { play };
