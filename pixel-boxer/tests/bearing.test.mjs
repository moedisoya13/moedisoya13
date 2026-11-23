/* The eight bearings (docs/bearing-system-plan.md §1, §9.3, stage O): what a bearing, a cell and a band are, that the cells
   only change past their margin, what every move that takes a man round the other does today (the plan's "지금" numbers,
   measured again by tools/bearing.mjs), what a bearing is worth with nobody turning, and that none of it changes a bout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearingOf, cellOf, bandOf, positionOf, createTracker, track, begin, turnOf, CELLS, BANDS, HOLD } from '../src/game/bearing.mjs';
import { step, createBout, settle } from '../src/game/bout.mjs';
import { freshBout, drive, HOME, AWAY } from '../src/footwork.mjs';
import { FOOTWORK, SHIFTING, WALKING } from '../src/ladder.mjs';
import { run } from '../src/measure.mjs';
import { ROWS, measure, reface, worth } from '../tools/bearing.mjs';
import { BEARING } from '../src/bearing.data.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI;
const row = id => ROWS.find(r => r.id === id);
const near = (x, want, by, what) => assert.ok(Math.abs(x - want) <= by, `${what}: ${x}, not ${want} ± ${by}`);
const within = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x}, not between ${lo} and ${hi}`);

test('bearing: two men face to face are each in front of the other, in the jab or the doorstep band', () => {
  const bout = freshBout({ me: () => HOME });
  for (const who of [0, 1]) {
    const p = positionOf(bout, who);
    assert.equal(p.cell, 0);
    assert.equal(p.his.cell, 0);
    assert.ok(Math.abs(p.beta) < 1 && Math.abs(p.his.beta) < 1, `${p.beta}, ${p.his.beta}`);
    assert.equal(p.band, bandOf(Math.hypot(AWAY[0] - HOME[0], AWAY[1] - HOME[1])));
    assert.equal(BANDS[p.band].name, '문턱');
  }
});

test("bearing: where a man is in the other's frame is the other's facing error, and going round him is its own angle (+ to his lead hand)", () => {
  // (measure.mjs: the boxer's facing error, frame by frame, is the other man's bearing in his frame)
  const { frames } = run(FOOTWORK.find(e => e.id === 'circle@1'), 3);
  for (const f of frames) near(bearingOf({ x: f.him[0], z: f.him[1] }, { x: f.at[0], z: f.at[1], yaw: f.yaw }), f.face * DEG, 1e-9, `tick ${f.tick}`);
  // (put round him at any angle, he is at that angle; going to his own right, he goes round to the other man's lead hand)
  const b = { x: 0.3, z: -0.2, yaw: 2.1 };
  for (let th = -175; th <= 180; th += 5) near(bearingOf({ x: b.x + 1.1 * Math.sin(b.yaw + th / DEG), z: b.z + 1.1 * Math.cos(b.yaw + th / DEG) }, b), th, 1e-9, `${th} degrees round`);
  const bout = freshBout({ me: () => HOME }),
    [a, him] = bout.fighters;
  a.z += 0.6; // (he faces +x, down the canvas at the other man: his right is +z)
  assert.ok(bearingOf(a, him) > 20, `${bearingOf(a, him)}`);
  assert.equal(positionOf(bout, 0).cell, 1);
});

test('bearing: eight cells, the same on both sides, a cell changing only HOLD degrees past its edge; a band only 0.03 m past its', () => {
  assert.equal(CELLS.length, 8);
  assert.deepEqual(CELLS.map(c => c.k).sort((x, y) => x - y), [-3, -2, -1, 0, 1, 2, 3, 4]);
  for (const c of CELLS) assert.equal(cellOf(c.at), c.k, c.name);
  for (let d = 0; d < 157.5; d += 0.5) assert.equal(cellOf(-d), -cellOf(d) || 0, `${d}`);
  for (const d of [157.5, -157.5, 180, -180, 200]) assert.equal(cellOf(d), 4, `${d}`);
  assert.equal(HOLD, 4);
  // (from in front: it stays in front between the edge and 26.5, goes over at 26.5, and comes back at 18.5)
  let k = 0;
  for (const d of [22.5, 24, 26.4, 23, 26.4, 22.6]) assert.equal((k = cellOf(d, k)), 0, `${d} from in front`);
  assert.equal((k = cellOf(26.5, k)), 1);
  for (const d of [22.5, 20, 18.6, 25]) assert.equal((k = cellOf(d, k)), 1, `${d} from the diagonal`);
  assert.equal((k = cellOf(18.5, k)), 0);
  // (and the same on the rear hand's side, and between the diagonal and the side)
  assert.equal(cellOf(-26.4, 0), 0);
  assert.equal(cellOf(-26.5, 0), -1);
  assert.equal(cellOf(-18.6, -1), -1);
  assert.equal(cellOf(-18.5, -1), 0);
  assert.equal(cellOf(71.4, 1), 1);
  assert.equal(cellOf(71.5, 1), 2);
  assert.equal(cellOf(63.6, 2), 2);
  assert.equal(cellOf(63.5, 2), 1);
  // (a jump of two cells is not held back)
  assert.equal(cellOf(95, 0), 2);
  // bands: 0.03 m past the edge
  assert.deepEqual(BANDS.map(b => b.name), ['붙음', '훅', '잽', '문턱', '밖', '먼']);
  assert.equal(bandOf(1.0), 2);
  assert.equal(bandOf(1.17, 2), 2);
  assert.equal(bandOf(1.18, 2), 3);
  assert.equal(bandOf(1.13, 3), 3);
  assert.equal(bandOf(1.11, 3), 2);
  assert.equal(bandOf(0.6), 0);
  assert.equal(bandOf(2.4), 5);
});

test("bearing: the tracker reads both men's places step by step and changes nothing in the bout", () => {
  const e = SHIFTING.find(x => x.id === 'shift@4m'),
    fight = tracked => {
      const bout = freshBout(e),
        tr = createTracker(),
        log = [];
      for (let i = 0; i < Math.round(e.loop / DT); i++) {
        step(bout, drive(e, bout, i * DT, DT), DT);
        if (tracked) track(tr, bout), i === 30 && begin(tr, bout, 0);
        log.push(bout.fighters.map(f => [f.x, f.z, f.yaw].join()).join('|') + bout.events.map(x => x.type + x.who).join());
      }
      return { log, tr };
    },
    plain = fight(false),
    seen = fight(true);
  assert.deepEqual(seen.log, plain.log);
  // (he got round him as far as the other man let him, and came back round in front of him as it ended)
  const m = seen.tr.men[0];
  assert.ok(m.move && m.move.peak > 15, `the shift got ${m.move && m.move.peak} degrees round him`);
  assert.equal(m.cell, cellOf(m.beta, m.cell));
});

test("bearing: turnOf is the bout's own turn, step by step, at every grade's footwork, punching and stunned", () => {
  // (the man who turns is the first: before his step, as the bout turns him (bout.mjs face), the other man is where he stood
  // at the end of the step before, and he is where his own feet have taken him this step)
  const check = (e, setup) => {
    const bout = freshBout(e),
      [f, other] = bout.fighters;
    let same = 0,
      seen = 0;
    for (let i = 0; i < Math.round(e.loop / DT); i++) {
      const before = { yaw: f.yaw, faceTo: f.faceTo, pivoting: f.pivoting, action: f.action && f.action.id, stun: f.stun > 0 },
        c = drive(e, bout, i * DT, DT);
      if (setup) setup(bout, i, c);
      const ox = other.x,
        oz = other.z,
        held = bout.stop > 0;
      step(bout, c, DT);
      // (a step held at a blow turns nobody; and a step on which his action started or ended, or a stun ran out, is left out:
      // what was on him as he turned is not what is on him now)
      if (held || (f.action && f.action.id) !== before.action || (f.stun > 0) !== before.stun) continue;
      seen++;
      const t = turnOf(Object.assign({}, f, { yaw: before.yaw, faceTo: before.faceTo, pivoting: before.pivoting }), { x: ox, z: oz }, { dt: DT });
      if (Math.abs(t.turn - f.turn) < 1e-12) same++;
      else assert.fail(`${e.id} tick ${i}: turnOf ${t.turn}, the bout ${f.turn}`);
    }
    assert.ok(seen > 0.8 * Math.round(e.loop / DT), `${e.id}: only ${seen} steps compared`);
    return same;
  };
  for (const lv of ['1', '2', '3', '4a', '5m']) check(FOOTWORK.find(e => e.id === `turn@${lv}`));
  // (throwing a cross at a man off to his side, and stunned there)
  const off = { id: 'off', loop: 1.2, me: () => HOME, him: () => [HOME[0] + 0.9, HOME[1] + 0.6] };
  check(Object.assign({}, off, { press: [[0.3, 'power']] }));
  check(off, (bout, i) => i === 20 && (bout.fighters[0].stun = 0.5));
});

/* What every move does today (the plan's §2.1, measured at 4c726b9), fought as the catalogue fights its card: the degrees
   round from the line the other man faced him on, within the margins the plan gives where it gives one, and otherwise
   within a degree and a half of what it measured. */
test('bearing: what each move does today, in degrees round him (the plan\'s numbers)', () => {
  const shift = { '4m': measure(row('shift'), '4m'), '5m': measure(row('shift'), '5m') };
  within(shift['4m'].turned, 21, 23, 'the shift, 4명, as the step comes down');
  within(shift['5m'].turned, 22.5, 24.5, 'the shift, 5명, as the step comes down');
  near(shift['4m'].d[1], 0.72, 0.02, 'the shift, 4명, ends');
  for (const lv of ['4m', '5m']) within(Math.abs(measure(row('wave'), lv).rate), 28, 32, `the wave, ${lv}, degrees a second`);
  const dash = measure(row('dashSide'), '3');
  within(Math.abs(dash.turned), 42, 46, 'the dash to the side');
  assert.ok(dash.turned < 0, 'the dash to his own left goes round to the other man\'s rear hand');
  assert.deepEqual(dash.band, [3, 4], 'and out one band');
  const pivot = measure(row('hopPivot'), '3');
  within(Math.abs(pivot.most), 23.5, 25.5, 'the pivot out');
  // (the pivot on the spot, from the plan's §3.2: round the lead foot's ball 0.34 m out, 75 degrees, from 1.0 m)
  const rho = 0.34,
    phi = 75 / DEG;
  near(Math.abs(pivot.most), Math.atan((rho * Math.sin(phi)) / (1 - rho + rho * Math.cos(phi))) * DEG, 1, 'the pivot out against the geometry');
  near(measure(row('side'), '3').turned, 20.8, 1.5, 'the side step');
  near(Math.abs(measure(row('circle'), '3').turned), 41.8, 1.5, 'circling');
  near(Math.abs(measure(row('hopCircle'), '3').turned), 29, 1.5, 'the circle out');
  near(measure(row('duckIn'), '4m').turned, 10.5, 1.5, 'the duck in, 4명');
  near(measure(row('duckIn'), '5m').turned, -6.3, 1.5, 'the duck in, 5명');
  near(measure(row('walk'), '3').rate, 131, 5, 'walking round him at 1.0 m, degrees a second');
});

test('bearing: against a man standing there and turning, no move today gets a cell round him (§0.4)', () => {
  for (const [id, lv] of [['side', '3'], ['circle', '3'], ['walk', '3'], ['dashSide', '3'], ['hopPivot', '3'], ['hopCircle', '3'], ['duckIn', '4m'], ['shift', '4m'], ['shift', '5m'], ['wave', '4m']]) {
    const m = measure(row(id), lv);
    assert.ok(Math.abs(m.peak) < 22.5 && m.window === 0, `${id}@${lv}: got to ${m.peak} degrees, ${m.window} s past a cell`);
  }
});

test('bearing: a pro standing faces a man put down 90 degrees round him again within a cell in 0.17 s', () => {
  near(reface('3', 'stand', 90).cell, 0.17, 0.02, 'standing');
  near(reface('3', 'guard', 90).cell, 0.17, 0.02, 'his guard up (the same)');
  assert.ok(reface('3', 'stun', 90).cell > 0.4, 'stunned, he is slower');
  assert.ok(reface('1', 'stand', 90).cell > 0.4, 'a beginner is slower');
});

test('bearing: what a bearing is worth with nobody turning (§5)', () => {
  // (his straight misses a man 45 degrees round to his lead hand and lands on one 45 degrees round to his rear)
  assert.equal(worth('cross', 'him', 45).type, 'whiff');
  assert.equal(worth('cross', 'him', -45).type, 'hit');
  // (and with his guard up: a straight from his lead-hand side and a body hook from 67.5 degrees get past it; from in front not)
  assert.equal(worth('cross', 'me', 90).type, 'hit');
  assert.equal(worth('hookBody', 'me', 67.5).type, 'hit');
  assert.equal(worth('cross', 'me', 0).type, 'block');
  assert.equal(worth('hookBody', 'me', 0).type, 'block');
});

test('bearing: the same script is the same table, and nothing here rolls dice or reads the clock', () => {
  const strip = m => JSON.stringify(m);
  assert.equal(strip(measure(row('shift'), '4m')), strip(measure(row('shift'), '4m')));
  for (const f of ['../src/game/bearing.mjs', '../tools/bearing.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const bad of ['Math.random', 'Date.now', 'performance.now', 'new Date']) assert.ok(!src.includes(bad), `${f} uses ${bad}`);
  }
});

test('bearing: what the catalogue draws (src/bearing.data.mjs) is what the tool measures now', () => {
  for (const [id, lv] of [['shift', '4m'], ['dashSide', '3'], ['wave', '5m'], ['walk', '3']]) {
    const { seen, feet, ...now } = measure(row(id), lv),
      kept = BEARING.moves[id].levels[lv];
    for (const k of ['turned', 'cells', 'time', 'over', 'peak', 'window', 'error', 'rate']) assert.deepEqual(kept[k], now[k], `${id}@${lv} ${k}`);
    assert.deepEqual(kept.d, now.d, `${id}@${lv} d`);
  }
  assert.deepEqual(BEARING.reface.stand['3'][90], reface('3', 'stand', 90));
  assert.deepEqual(BEARING.worth['3'].me.cross[BEARING.worth['3'].angles.indexOf(90)], worth('cross', 'me', 90));
});

test('bearing: walking round him is a card of every grade, round to his lead hand, and stays at its distance', () => {
  assert.equal(WALKING.length, 7);
  for (const lv of ['1', '3', '5m']) {
    const m = measure(Object.assign({}, row('walk'), { entry: () => WALKING.find(e => e.id === `walk@${lv}`) }), lv);
    assert.ok(m.turned > 200, `walk@${lv}: ${m.turned} degrees round in two seconds`);
    near(m.d[1], 1.0, 0.05, `walk@${lv}: ends`);
  }
});
