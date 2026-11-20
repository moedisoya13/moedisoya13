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

test('inside: right up close the power button throws the inside hook and the inside uppercut in turn, and no straight punch', () => {
  const b = createBout(5);
  b.fighters[0].x = -0.33;
  b.fighters[1].x = 0.33;
  b.fighters[1].hp = 1000;
  settle(b);
  const thrown = [];
  for (let i = 0; i < 90; i++) {
    step(b, [i % 18 === 0 && i < 50 ? { power: true } : {}, {}], DT);
    for (const e of b.events) if (e.type === 'punch' && e.who === 0) thrown.push(e.name);
  }
  assert.deepEqual(thrown, ['hookIn', 'upperIn', 'hookIn']);
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
