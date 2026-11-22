/* How a blow is drawn (docs/moves-plan-6.md §2.7; render/blow.mjs), as geometry and counts node can check:
     the motes start 1 cm off the surface of what was struck, on the side the blow goes out of it: a line through the
     middle of the head comes out straight behind it, one off the middle or only grazing it comes out on its way, and a
     liver hook comes out of the far side of the trunk (the capsule from the waist to the chest);
     a hit throws sparks in proportion to the damage it did, as many and as thick (28 of them 2.4 cm thick for a pro's
     straight to the head, twice the damage twice of both), in the colours and at the speeds they always had, and they
     go the way the glove was going: an uppercut's up;
     the ripple carries him and is wide in proportion to the damage too (longer for a knockdown, over when it is over)
     and goes where the part it landed on goes;
     and the flash of white is gone: from the bout and from the renderer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exitOf, blow, rippleOf, rippleRow, scaleOf, FX } from '../src/render/blow.mjs';
import { createFx } from '../src/render/fx.mjs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { LADDER } from '../src/ladder.mjs';
import { BODYSHOTS } from '../src/bodyshots.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.sqrt(dot(a, a));
const unit = a => a.map(x => x / len(a));
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b))))) * DEG;
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// the first hit of a script, as the catalogue fights it, and the struck man as he was in that step
const SCRIPTS = [...DEFENSE, ...LADDER, ...BODYSHOTS];
function firstHit(id) {
  const entry = SCRIPTS.find(e => e.id === id),
    bout = freshBout(entry);
  for (let i = 0; i < Math.round(entry.loop / DT); i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    const e = bout.events.find(x => x.type === 'hit');
    if (e) return { e: JSON.parse(JSON.stringify(e)), struck: JSON.parse(JSON.stringify({ points: bout.fighters[e.on].points })) };
  }
  throw new Error(`${id}: no hit`);
}

/* The plan's two conditions for a start point: 1 cm (to a millimetre) off the part's surface, and on the side the line goes
   out of it, from the point of its core the line passes nearest (c). */
function offSurface(part, p) {
  if (!part.to) return len(sub(p, part.at)) - part.r;
  const u = sub(part.to, part.at),
    s = Math.max(0, Math.min(1, dot(sub(p, part.at), u) / dot(u, u)));
  return len(sub(p, part.at.map((x, i) => x + u[i] * s))) - part.r;
}
function nearestOnCore(part, o, d) {
  if (!part.to) return part.at;
  let best = null;
  for (let i = 0; i <= 2000; i++) {
    const q = part.at.map((x, k) => x + (part.to[k] - x) * (i / 2000)),
      m = o.map((x, k) => x + d[k] * dot(sub(q, o), d)),
      far = len(sub(m, q));
    if (!best || far < best.far) best = { q, far };
  }
  return best.q;
}
function holds(name, part, o, d) {
  const p = exitOf(part, o, d),
    c = nearestOnCore(part, o, d),
    off = offSurface(part, p);
  assert.ok(Math.abs(off - FX.out) <= 0.001 + 1e-9, `${name}: ${(off * 100).toFixed(2)} cm off the surface`);
  assert.ok(dot(sub(p, c), d) >= -1e-4, `${name}: on the side the blow goes out (${dot(sub(p, c), d).toFixed(4)})`);
  return p;
}

test('exitOf: through the middle of the head, off it, grazing it, and out of the trunk of a real liver hook', () => {
  const head = { at: [0.3, 1.55, -0.2], r: FX.head },
    d = unit([-0.9, 0.2, 0.3]),
    o = head.at.map((x, i) => x - d[i] * FX.head);
  // (straight through the middle: straight out behind it)
  const p = holds('through the middle', head, o, d);
  head.at.forEach((x, i) => assert.ok(Math.abs(p[i] - (x + d[i] * (FX.head + FX.out))) < 1e-9, 'c + d (r + 1 cm)'));
  // (5 cm off the middle, and a line that only grazes it: square to the way it goes)
  const side = unit([d[2], 0, -d[0]]);
  for (const [name, by] of [['5 cm off', 0.05], ['grazing', FX.head], ['passing by', FX.head + 0.03]]) {
    const q = holds(name, head, o.map((x, i) => x + side[i] * by), d);
    assert.ok(dot(sub(q, head.at), side) > 0, `${name}: out on the side the line passes`);
  }
  // (a real liver hook: out of his left side and back, the way it was going)
  const { e } = firstHit('body-liver');
  assert.ok(e.trunk && e.part === 'body' && e.zone === 'liver', 'body-liver lands on the liver');
  const t = holds('the liver hook', e.trunk, e.at, e.vec);
  assert.ok(dot(sub(t, e.at), e.vec) > 0.15, `the liver hook's motes start across his trunk from where it landed: ${dot(sub(t, e.at), e.vec).toFixed(3)} m on`);
});

/* The sparks of a hit of q times the reference damage and J newton-seconds: [count, speed] of its two kinds (how many by
   the damage, how fast by the impulse as before), and how thick. */
const sparksOf = (q, J) => {
  const k = Math.min(1.6, Math.max(q, J / 85));
  return { kinds: [[Math.max(1, Math.round(17 * q)), 2.5 + 3 * k], [Math.max(1, Math.round(11 * q)), 2.5 + 2 * k]], width: Math.max(0.01, 0.024 * q) };
};
/* The motes' mean velocity as they leave: thrown many times over from the same start, and read off where each is drawn a
   moment later (a spark is drawn as the stretch it flew in its last 0.03 s: its middle is 0.015 s behind where it is). */
function meanWay(e, struck) {
  const fx = createFx(dice(11)),
    from = exitOf(e.trunk || { at: struck.points.head, r: FX.head }, e.at, e.vec);
  let n = 0;
  for (let i = 0; i < 20; i++) n += blow(fx, e, struck);
  const dt = 1e-4,
    k = fx.update(dt),
    sum = [0, 0, 0];
  assert.equal(k, n);
  for (let i = 0; i < k; i++) for (let j = 0; j < 3; j++) sum[j] += (fx.rows[i * 12 + j] - from[j]) / (dt - 0.015);
  return sum.map(x => x / k);
}

test('blow: sparks by the damage (how many, how thick), in their colours and speeds, from the far side, the way the glove went', () => {
  // (the rule itself: a pro's straight to the head is the measure; half the damage, half of each; twice, twice; a cap)
  const at = { points: { head: [0, 1.5, 0] } },
    made = damage => {
      const calls = [];
      blow({ sparks: (p, n, colours, speed, dir, width) => calls.push({ n, width }) }, { type: 'hit', damage, J: 0, at: [0.1, 1.5, 0], vec: [-1, 0, 0] }, at);
      return { n: calls.reduce((s, c) => s + c.n, 0), width: calls[0].width };
    };
  assert.deepEqual(made(3), { n: 28, width: 0.024 }, 'the reference: 28 sparks, 2.4 cm');
  assert.ok(Math.abs(made(1.5).n - 14) <= 1 && Math.abs(made(1.5).width - 0.012) < 1e-12, 'half the damage: half as many (to a spark of each kind), half as thick');
  assert.deepEqual([made(6).n, +made(6).width.toFixed(6)], [56, 0.048], 'twice the damage: twice as many, twice as thick');
  assert.equal(made(30).n, made(3 * FX.most).n, 'no more than FX.most times the reference');
  assert.ok(made(0.2).n >= 2 && made(0.2).width === FX.motes.thin, 'the lightest touch still shows: one of each kind, at the thinnest');
  assert.equal(scaleOf({ J: 85 }), scaleOf({ damage: 2.975 }), 'a hit with no damage on it is read off its impulse');
  const seen = {};
  for (const id of ['hit-jab', 'hit-cross', 'hit-hook', 'upperIn@3', 'body-liver', 'down-back']) {
    const { e, struck } = firstHit(id),
      calls = [],
      fake = { sparks: (at, n, colours, speed, dir, width) => calls.push({ at, n, colours, speed, dir, width }) },
      n = blow(fake, e, struck),
      q = scaleOf(e),
      was = sparksOf(q, e.J);
    seen[id] = { n, q };
    assert.ok(Math.abs(q - e.damage / FX.ref) < 1e-12 || q === FX.most, `${id}: measured by its damage (${e.damage})`);
    assert.equal(n, was.kinds[0][0] + was.kinds[1][0], `${id}: ${n} sparks for ${e.damage} of damage`);
    assert.deepEqual(calls.map(c => [c.n, +c.speed.toFixed(6)]), was.kinds.map(([m, s]) => [m, +s.toFixed(6)]), `${id}: counts and speeds`);
    assert.ok(calls.every(c => Math.abs(c.width - was.width) < 1e-12), `${id}: ${(was.width * 100).toFixed(1)} cm thick`);
    assert.deepEqual(calls.map(c => c.colours), [[38, 39, 40, 41], [41, 41, 25]], `${id}: colours`);
    assert.deepEqual(calls.map(c => c.dir), [0, 1].map(() => [e.vec[0], e.vec[2], e.vec[1]]), `${id}: carried the way the glove went, up and down too`);
    const way = meanWay(e, struck),
      flat = [way[0], 0, way[2]],
      vflat = [e.vec[0], 0, e.vec[2]];
    // (across, they go the blow's way; with the fan's lift, kept as it was, their mean is at most 30 degrees off its line)
    if (len(vflat) > 0.3) assert.ok(angle(flat, vflat) <= 20, `${id}: across, ${angle(flat, vflat).toFixed(1)} degrees off the blow's way`);
    assert.ok(angle(way, e.vec) <= 30, `${id}: ${angle(way, e.vec).toFixed(1)} degrees off the blow's line`);
    if (id === 'upperIn@3') assert.ok(way[1] > 1.4 + 2, `the uppercut's sparks go up, well over the fan's own lift: ${way[1].toFixed(2)} m/s`);
  }
  // (the light blow throws fewer than the heavy one, and a body shot of the same impulse fewer than one to the head)
  assert.ok(seen['hit-jab'].n < seen['hit-cross'].n, `a jab ${seen['hit-jab'].n} < a cross ${seen['hit-cross'].n}`);
});

test('rippleOf, rippleRow: the plan\'s ripple, over when it is over, a knockdown\'s longer, and held to the part it landed on', () => {
  const head = [0.2, 1.55, 0.1],
    struck = { points: { head: head.slice(), belly: [0.2, 1.2, 0.1] } },
    e = { type: 'hit', J: 43, damage: 1.5, at: [0.31, 1.56, 0.12], vec: [1, 0, 0] },
    r = rippleOf(e, struck);
  assert.deepEqual([r.joint, r.age, r.last, r.sway], ['head', 0, FX.ripple.last, FX.ripple.sway]);
  for (const age of [0, 0.1, 0.25]) {
    r.age = age;
    const row = rippleRow(r, struck);
    assert.ok(Math.abs(row[5] - 0.5 * (1 - age / 0.4) ** 1.2) < 1e-12, `half the reference damage at ${age} s: half the reference ripple, decayed`);
    assert.ok(Math.abs(row[3] - 3 * age) < 1e-12 && Math.abs(row[4] - 0.07) < 1e-12 && row[6] === 0.034, 'its front at 3 m/s, half of 14 cm wide, 3.4 cm of sway at the reference');
  }
  r.age = 0.4;
  assert.equal(rippleRow(r, struck), null, 'over at 0.4 s');
  assert.equal(rippleOf({ type: 'block', J: 30, at: e.at }, struck), null, 'a block has none');
  // (a knockdown: 0.55 s, 1.3 times the sway, still going at 0.5 s)
  const d = rippleOf(Object.assign({}, e, { J: 120, damage: 6, down: true }), struck);
  assert.deepEqual([d.last, +d.sway.toFixed(6), d.strength, +d.width.toFixed(6)], [0.55, +(0.034 * 1.3).toFixed(6), 2, 0.28], 'twice the damage: twice the sway and twice as wide');
  assert.equal(rippleOf(Object.assign({}, e, { damage: 0.2 }), struck).width, FX.ripple.thin, 'the lightest still has a train of waves');
  d.age = 0.5;
  assert.ok(rippleRow(d, struck), 'a knockdown\'s ripple is still going at 0.5 s');
  // (held to his head: moved 10 cm, its middle goes 10 cm)
  r.age = 0.1;
  const a = rippleRow(r, struck);
  struck.points.head = [head[0] - 0.1, head[1], head[2]];
  const b = rippleRow(r, struck);
  assert.ok(Math.abs(len(sub(a.slice(0, 3), b.slice(0, 3))) - 0.1) < 1e-12 && Math.abs(a[0] - b[0] - 0.1) < 1e-12, 'its middle goes with his head');
  assert.deepEqual(a.slice(0, 3).map(x => +x.toFixed(9)), e.at.map(x => +x.toFixed(9)), 'and it starts where the glove met him');
  // (a body shot: held to his trunk at Spine2)
  const liver = firstHit('body-liver'),
    lr = rippleOf(liver.e, liver.struck);
  assert.equal(lr.joint, 'belly');
  assert.deepEqual(rippleRow(lr, liver.struck).slice(0, 3).map(x => +x.toFixed(9)), liver.e.at.map(x => +x.toFixed(9)));
});

test('no flash of white: the bout keeps none on a man, the renderer has none to draw', () => {
  const { struck } = firstHit('hit-cross'),
    bout = freshBout(SCRIPTS.find(e => e.id === 'hit-cross'));
  assert.ok(struck.points.head);
  for (const f of bout.fighters) assert.ok(!('flash' in f), 'a fighter has no flash');
  for (let i = 0; i < 60; i++) {
    step(bout, drive(SCRIPTS.find(e => e.id === 'hit-cross'), bout, i * DT, DT), DT);
    for (const f of bout.fighters) assert.ok(!('flash' in f), 'nor after a blow');
  }
  const src = readFileSync(new URL('../src/render/renderer.mjs', import.meta.url), 'utf8');
  assert.ok(!src.includes('u_flash'), 'the renderer has no u_flash');
});
