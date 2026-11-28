/* A man who gets up too late (the user's answer of 2026-11-28 to a-count-ten, docs/audit-2026-11-25.md: "일어선 후 비틀대며 다시
   쓰러집니다"): one whose rise would end after ten would have counted him out gets up, staggers with his legs going, goes
   down again, and it is the knockout (game/match.mjs: MATCH.late; game/bout.mjs: legsGo, collapse). One who gets up in
   time fights on. Scripted: red walks in throwing crosses at blue, left on 1 health and doing nothing, until one puts him
   down; the referee is then told the count blue rises at. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, MATCH } from '../src/game/match.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { cuesOf } from '../src/game/audio.mjs';
import { auditor } from '../src/audit.mjs';

const DT = 1 / 60;

// the script, to `after` seconds past the end (the result, or his first moment back in the fight): the match's own events
// in order, blue's state frame by frame from the knockdown on, and every frame from his rise on audited
function knockedDown(up, after) {
  const m = createMatch({ seed: 1, rounds: 1, roundTime: 60 }),
    blue = m.bout.fighters[1],
    a = auditor(),
    seen = [],
    frames = [];
  blue.hp = 1;
  a.begin({ id: `late rise: up at ${up}` });
  let rose = false,
    ended = null;
  for (let k = 0; k < 60 * 30; k++) {
    const red = m.bout.fighters[0],
      far = Math.hypot(blue.x - red.x, blue.z - red.z);
    stepMatch(m, DT, [{ move: far > 0.95 ? [(blue.x - red.x) / far, (blue.z - red.z) / far] : [0, 0], power: far < 1.05 && k % 20 === 0 ? 'cross' : false }, {}]);
    for (const e of m.events) {
      if (e.type === 'down') m.count.up = up;
      if (['down', 'count', 'up', 'stagger', 'collapse', 'result'].includes(e.type)) seen.push({ ...e, t: m.bout.t });
      if (e.type === 'up') rose = true;
    }
    if (seen.length) frames.push({ t: m.bout.t, phase: m.phase, down: blue.down, doing: blue.action ? blue.action.name : null, x: blue.x, z: blue.z, legs: !!blue.legsGone });
    if (rose) a.frame(m.bout, k);
    if (ended === null && seen.length && (m.phase === 'over' || m.phase === 'fight')) ended = m.bout.t;
    if (ended !== null && m.bout.t - ended >= after) break;
  }
  return { m, seen, frames, audit: a.result() };
}
const types = seen => seen.filter(e => e.type !== 'count').map(e => e.type);

test('late: up at eight off his back, he staggers, goes down again, and it is a knockout', () => {
  const { m, seen, frames, audit } = knockedDown(8, 2);
  assert.deepEqual(types(seen), ['down', 'up', 'stagger', 'collapse', 'result'], JSON.stringify(seen));
  const at = type => seen.find(e => e.type === type),
    up = at('up'),
    stagger = at('stagger'),
    collapse = at('collapse'),
    result = at('result');
  assert.equal(up.n, 8);
  // (late: his rise ends after the moment ten counts out a man still lying there)
  assert.ok(stagger.t - up.t > 10 * MATCH.count - 8 * MATCH.count + 0.1, `up ${up.t.toFixed(2)}, on his feet ${stagger.t.toFixed(2)}`);
  // (no number called after he started up, ten least of all)
  assert.ok(Math.max(...seen.filter(e => e.type === 'count').map(e => e.n)) <= 8);
  // on his feet, his legs going, for MATCH.late.reel; a few steps' way; not counted as fighting
  const reel = frames.filter(f => f.t >= stagger.t && f.t < collapse.t);
  assert.ok(Math.abs(collapse.t - stagger.t - MATCH.late.reel) < 2 * DT, (collapse.t - stagger.t).toFixed(3));
  assert.ok(reel.every(f => !f.down && f.doing === null && f.legs && f.phase === 'count'), JSON.stringify(reel.find(f => f.down || f.doing || f.phase !== 'count')));
  const went = Math.hypot(reel[reel.length - 1].x - reel[0].x, reel[reel.length - 1].z - reel[0].z);
  assert.ok(went > 0.2 && went < 1, `went ${went.toFixed(2)} m`);
  // down again: onto a knee where he stands (the knee knockdown's own move), and he stays down
  const fell = frames.filter(f => f.t >= collapse.t);
  assert.ok(fell.every(f => f.down && f.doing === 'drop'), JSON.stringify(fell.find(f => !f.down || f.doing !== 'drop')));
  // (and not slid across the canvas on the way down: a centimetre or two a frame at the most)
  for (let i = 1; i < fell.length; i++) assert.ok(Math.hypot(fell[i].x - fell[i - 1].x, fell[i].z - fell[i - 1].z) < 0.025, `frame ${i} after the collapse`);
  // the knockout, once he is down
  assert.deepEqual([result.how, result.winner], ['KO', 0]);
  assert.ok(Math.abs(result.t - collapse.t - MATCH.late.settle) < 2 * DT);
  assert.equal(m.phase, 'over');
  assert.equal(m.bout.over, 0, 'the winner is the one who cheers');
  // the physics audit's held checks, in every frame from his rise to two seconds after it is over
  const broken = Object.entries(audit.found).filter(([, c]) => c.bad);
  assert.ok(audit.seen > 2 * 60 * 5, `${audit.seen} frames`);
  assert.deepEqual(broken.map(([n, c]) => `${n}: ${JSON.stringify(c.cases.slice(0, 3))}`), []);
});

test('late: up in time (at six, off his back), he is on his feet by ten and fights on', () => {
  const { m, seen, frames } = knockedDown(6, 2);
  assert.deepEqual(types(seen), ['down', 'up'], JSON.stringify(seen));
  assert.equal(m.phase, 'fight');
  assert.equal(m.result, null);
  const back = frames.find(f => f.phase === 'fight');
  assert.ok(back && back.t - seen.find(e => e.type === 'up').t < 10 * MATCH.count - 6 * MATCH.count + 1e-6, 'back in the fight before ten');
  assert.ok(frames.every(f => !f.legs), 'his legs are his own');
  // (and he fights on: not down again, for the two seconds after)
  const after = frames.filter(f => f.t > back.t);
  assert.ok(after.every(f => !f.down), 'not down again');
});

test('late: the rule is the rise\'s own length against ten, the same for every way up', () => {
  // (off his back or front the rise is 2.3 s, off his side 2.4: begun on eight, it is always too late, on seven never (off his
  // side it ends just as ten would be out); off a knee, 1.15 s, never)
  const lateAt = (n, rise) => (n - 1) * MATCH.count + MOVES[rise].dur > 10 * MATCH.count + 1e-9;
  assert.deepEqual(['rise', 'riseFront', 'riseSide', 'riseKnee', 'riseLiver'].map(r => [7, 8].map(n => lateAt(n, r))), [[false, true], [false, true], [false, true], [false, false], [false, false]]);
});

test('late: a man going down again is heard as a knockdown\'s breath going out of him', () => {
  assert.deepEqual(cuesOf({ type: 'collapse', who: 1 }, {}).map(q => q.name), ['exhale']);
  assert.deepEqual(cuesOf({ type: 'stagger', who: 1 }, {}), []);
});
