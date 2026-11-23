/* How a blow is drawn (docs/moves-plan-6.md §2.7; render/blow.mjs), as geometry and counts node can check:
     the motes start 1 cm off the surface of what was struck, on the side the blow goes out of it: a line through the
     middle of the head comes out straight behind it, one off the middle or only grazing it comes out on its way, and a
     liver hook comes out of the far side of the trunk (the capsule from the waist to the chest);
     a hit throws sparks in proportion to the damage it did, as many and as thick (28 of them 2.4 cm thick for a pro's
     straight to the head, twice the damage twice of both), in the colours and at the speeds they always had, and they
     go the way the glove was going: an uppercut's up;
     the ripple carries him and is wide in proportion to the damage too (longer for a knockdown, over when it is over)
     and goes where the part it landed on goes;
     and the flash of white is gone: from the bout and from the renderer;
   and a knockdown's own (docs/moves-plan-6.md §2.4B): its motes hang (half the fall, 0.8 of the drag, 1.6 times the life);
   where the falling man first comes down (down-back, out-log: one step, a part of him within 6 cm of the canvas, none of
   him before it) a second ripple and a ring through the canvas, the ring's lift the same all round at one distance; and
   its slow motion: 0.25 s of the bout's time shown in a real second (to 0.05 s), 0.35 s for a knockout;
   every slow motion smooth (§2.4B 7): a replay at a quarter of the speed never shows the same picture twice running, turns
   no joint further in a picture than a quarter of what it turns in a step of the bout, and still starts and ends on the
   steps it always did;
   and every mote of a hit drawn hot at first (§2.4B 8): the palette's hottest yellow and orange, never its white, and from
   0.06 s on its own colours, the same mote it always was. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exitOf, blow, rippleOf, rippleRow, scaleOf, FX, fallOf, landed, landingOf, landRipple, groundOf, groundRow, groundLift, slowOf, paceOf, slowOn } from '../src/render/blow.mjs';
import { createFx } from '../src/render/fx.mjs';
import { createReplay } from '../src/replay.mjs';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { toWorld } from '../src/anim/pose.mjs';
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

test('blow: sparks by the damage (how many, how thick, how long), in their colours, 5% faster, from the far side, the way the glove went', () => {
  // (the rule itself: a pro's straight to the head is the measure; half the damage, half of each; twice, twice; a cap)
  const at = { points: { head: [0, 1.5, 0] } },
    made = damage => {
      const calls = [];
      blow({ sparks: (p, n, colours, speed, dir, width, o) => calls.push({ n, width, o }) }, { type: 'hit', damage, J: 0, at: [0.1, 1.5, 0], vec: [-1, 0, 0] }, at);
      return { n: calls.reduce((s, c) => s + c.n, 0), width: calls[0].width, life: calls[0].o.life, pace: calls[0].o.pace };
    };
  assert.deepEqual([made(3).n, made(3).width], [28, 0.024], 'the reference: 28 sparks, 2.4 cm');
  assert.ok(Math.abs(made(1.5).n - 14) <= 1 && Math.abs(made(1.5).width - 0.012) < 1e-12, 'half the damage: half as many (to a spark of each kind), half as thick');
  assert.deepEqual([made(6).n, +made(6).width.toFixed(6)], [56, 0.048], 'twice the damage: twice as many, twice as thick');
  assert.equal(made(30).n, made(3 * FX.most).n, 'no more than FX.most times the reference');
  // (how long they last: a twentieth less than they always did at the measure, in proportion to the damage, to 0.4 of that;
  // and a twentieth faster, whatever the blow)
  assert.ok(Math.abs(made(3).life - 0.95) < 1e-12 && Math.abs(made(6).life - 1.9) < 1e-12 && Math.abs(made(1.5).life - 0.475) < 1e-12, 'lives: 0.95 at the measure, twice the damage twice as long, half half');
  assert.ok(Math.abs(made(0.2).life - 0.38) < 1e-12, 'the lightest touch lasts 0.4 of the measure\'s');
  assert.ok([0.2, 1.5, 3, 6].every(d => made(d).pace === 1.05), 'all of them 5% faster');
  assert.ok(made(0.2).n >= 2 && made(0.2).width === FX.motes.thin, 'the lightest touch still shows: one of each kind, at the thinnest');
  assert.equal(scaleOf({ J: 85 }), scaleOf({ damage: 2.975 }), 'a hit with no damage on it is read off its impulse');
  const seen = {};
  for (const id of ['hit-jab', 'hit-cross', 'hit-hook', 'upperIn@3', 'body-liver', 'down-back']) {
    const { e, struck } = firstHit(id),
      calls = [],
      fake = { sparks: (at, n, colours, speed, dir, width, o) => calls.push({ at, n, colours, speed, dir, width, o }) },
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

// a script fought as the catalogue fights it, step by step: each step handed to `each(bout, tick)`, until it says stop
function fight(id, each) {
  const entry = SCRIPTS.find(e => e.id === id),
    bout = freshBout(entry);
  for (let i = 0; i < Math.round(entry.loop / DT); i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    if (each(bout, i) === false) break;
  }
}

test('a knockdown\'s motes hang: 1.6 times the life, half the fall, 0.8 of the drag; the counts, the thickness and the colours as any blow\'s', () => {
  const struck = { points: { head: [0, 1.5, 0] } },
    made = more => {
      const calls = [];
      blow({ sparks: (p, n, colours, speed, dir, width, o) => calls.push({ n, colours, width, o }) }, Object.assign({ type: 'hit', damage: 3, J: 85, at: [0.1, 1.5, 0], vec: [-1, 0, 0] }, more), struck);
      return calls;
    },
    plain = made({}),
    down = made({ down: true }),
    out = made({ down: true, out: 'outStiff' });
  for (const k of [down, out]) {
    assert.deepEqual(k.map(c => [c.n, c.width, c.colours]), plain.map(c => [c.n, c.width, c.colours]), 'as many, as thick, the same colours');
    assert.ok(k.every((c, i) => Math.abs(c.o.life - plain[i].o.life * 1.6) < 1e-12 && c.o.fall === 0.5 && c.o.drag === 0.8 && c.o.pace === plain[i].o.pace), 'life 1.6 times, fall 0.5, drag 0.8');
  }
  assert.ok(plain.every(c => c.o.fall === 1 && c.o.drag === 1), 'an ordinary blow\'s fall and drag as they were');
  // (and so they do hang: the same motes, thrown the same way, are higher off the canvas and still there later)
  const thrown = (o, t) => {
    const fx = createFx(dice(3));
    fx.sparks([0, 1.5, 0], 40, [38], 5, null, 0.02, o);
    const k = fx.update(t);
    let y = 0;
    for (let i = 0; i < k; i++) y += fx.rows[i * 12 + 1] / k;
    return { k, y };
  };
  const hang = { life: 1.6, fall: 0.5, drag: 0.8 },
    [a, b] = [{ life: 1 }, hang].map(o => thrown(o, 0.15)),
    [c, d] = [{ life: 1 }, hang].map(o => thrown(o, 0.3));
  assert.ok(a.k === 40 && b.k === 40 && b.y > a.y + 0.03, `at 0.15 s, all of them still there: ${b.y.toFixed(3)} m high on average, against ${a.y.toFixed(3)} m`);
  assert.ok(d.k > c.k, `at 0.3 s: ${d.k} of 40 left, against ${c.k}`);
});

test('where he comes down: one step in down-back and out-log, a part of him within 6 cm of the canvas, none before; a second ripple and a ring from there', () => {
  for (const id of ['down-back', 'out-log']) {
    let fall = null,
      hitAt = null,
      steps = [];
    fight(id, (bout, i) => {
      for (const e of bout.events) if (fallOf(e)) (fall = fallOf(e)), (hitAt = i);
      if (!fall) return;
      const man = bout.fighters[fall.on],
        low = landingOf(man),
        at = landed(fall, man);
      steps.push({ i, at, near: !!low, clear: Math.min(...FX.land.parts.map(([j, r]) => (man.points[j] || toWorld(man.place, man.pose.at[j], man.pose.stretch))[1] - r)), man: JSON.parse(JSON.stringify({ points: man.points, pose: { at: man.pose.at, stretch: man.pose.stretch }, place: man.place })) });
    });
    const downs = steps.filter(s => s.at);
    assert.equal(downs.length, 1, `${id}: he comes down once (${downs.length})`);
    const d = downs[0],
      before = steps.filter(s => s.i < d.i);
    assert.ok(d.clear < FX.land.near && d.at.clear < FX.land.near, `${id}: ${d.at.joint} ${(d.clear * 100).toFixed(1)} cm off the canvas`);
    assert.ok(before.length > 10 && before.every(s => s.clear >= FX.land.near), `${id}: none of him within 6 cm before (${before.length} steps from the blow)`);
    assert.ok(d.i > hitAt, `${id}: after the blow (+${d.i - hitAt} steps)`);
    // (the second ripple, from the part that came down, 0.8 of the blow's strength, 0.45 s; the ring from under it)
    const r = landRipple(fall, d.man, d.at),
      g = groundOf(fall, d.at);
    assert.deepEqual([r.joint, +r.strength.toFixed(9), r.last], [d.at.joint, +(0.8 * fall.q).toFixed(9), 0.45]);
    assert.deepEqual(rippleRow(r, d.man).slice(0, 3).map(x => +x.toFixed(9)), d.at.at.map(x => +x.toFixed(9)), `${id}: it starts at the underside of the part that came down`);
    assert.deepEqual([g.at[0], g.at[1], g.at[2]], [d.at.at[0], 0, d.at.at[2]], `${id}: the ring goes out from under it`);
    assert.equal(g.last, id === 'out-log' ? 0.75 : 0.6);
    const lift = Math.min(0.03, Math.max(0.01, 0.03 * fall.q * (id === 'out-log' ? 1.3 : 1)));
    assert.ok(Math.abs(g.lift - lift) < 1e-12, `${id}: lifts ${(g.lift * 100).toFixed(2)} cm`);
  }
});

test('the ring through the canvas: measured flat along it, the same lift all round at one distance, its front at 4 m/s, over at 0.6 s', () => {
  const g = groundOf({ q: 1, out: false }, { at: [0.4, 0.01, -0.2] }),
    k = groundOf({ q: 2.2, out: true }, { at: [0, 0, 0] });
  assert.ok(Math.abs(k.lift - 0.03) < 1e-12 && Math.abs(groundOf({ q: 0.1, out: false }, { at: [0, 0, 0] }).lift - 0.01) < 1e-12, 'at most 3 cm, at least 1');
  assert.ok(Math.abs(groundOf({ q: 0.5, out: false }, { at: [0, 0, 0] }).lift - 0.015) < 1e-12 && Math.abs(groundOf({ q: 0.5, out: true }, { at: [0, 0, 0] }).lift - 0.0195) < 1e-12, 'in proportion to the damage below the measure, a knockout 1.3 times');
  for (const age of [0, 0.15, 0.3, 0.45]) {
    g.age = age;
    const row = groundRow(g);
    assert.ok(Math.abs(row[3] - 4 * age) < 1e-12 && row[4] === 0.35, `its front at ${row[3].toFixed(2)} m`);
    for (const far of [0.2, 0.6, 1.0, 1.4, 1.8, 2.2]) {
      const h = [0, 1.1, 2.3, 3.9, 5.2].map(a => groundLift(row, [0.4 + far * Math.cos(a), 0, -0.2 + far * Math.sin(a)]));
      assert.ok(h.every(x => Math.abs(x - h[0]) < 1e-9), `at ${age} s, ${far} m out: the same lift all round (${h.map(x => (x * 1000).toFixed(2)).join(' ')} mm)`);
    }
    // (its crest is at its front, as high as the ring lifts then)
    assert.ok(Math.abs(groundLift(row, [0.4 + row[3], 0, -0.2]) - row[5]) < 1e-12, 'the crest at the front');
    assert.equal(groundLift(row, [0.4 + row[3], 0.5, -0.2]), 0, 'what stands above the canvas is not lifted');
  }
  g.age = 0.6;
  assert.equal(groundRow(g), null, 'over at 0.6 s, its front 2.4 m out');
  // (the renderer's shader works it out the same way)
  const src = readFileSync(new URL('../src/render/renderer.mjs', import.meta.url), 'utf8');
  for (const bit of ['length(world.xz - u_ground.xy) - u_ground.z', 'exp(-(x * x) / (0.09 * w * w)) : exp(-(x * x) / (w * w))', 'cos(6.2832 * x / (1.4 * w))', '(1.0 - smoothstep(0.03, 0.12, abs(world.y)))']) assert.ok(src.includes(bit), `the shader has ${bit}`);
});

test('a knockdown\'s slow motion: 0.25 s of the bout in a second (to 0.05 s), from half the speed to a quarter and back, 0.35 s for a knockout', () => {
  const run = e => {
    let s = slowOf(e),
      since = 0,
      real = 0,
      lowest = 1;
    assert.equal(paceOf(s), 1, 'the held moment of the blow goes as it always did');
    s = slowOn(s, 0.1, 0, true);
    assert.equal(paceOf(s), 1);
    s = slowOn(s, 0, 0, false);
    assert.ok(Math.abs(paceOf(s) - 0.5) < 1e-12, 'it starts from half the speed');
    const dt = 1 / 2400;
    let at = null;
    while (s) {
      const p = paceOf(s);
      lowest = Math.min(lowest, p);
      since += dt * p;
      real += dt;
      if (at === null && since >= s.span - 1e-12) at = real;
      s = slowOn(s, dt, since, false);
    }
    return { at, real, lowest };
  };
  const down = run({ type: 'hit', down: true, damage: 3 }),
    out = run({ type: 'hit', down: true, out: 'outStiff', damage: 3 });
  assert.ok(Math.abs(down.at - 1) <= 0.05, `0.25 s of the bout shown in ${down.at.toFixed(3)} s`);
  assert.ok(Math.abs(out.at - 1.4) <= 0.05, `a knockout's 0.35 s in ${out.at.toFixed(3)} s`);
  assert.ok(Math.abs(down.lowest - 0.25) < 1e-9 && Math.abs(down.real - down.at - 0.1) < 0.002, `a quarter at the slowest, back to full speed in 0.1 s (${(down.real - down.at).toFixed(3)})`);
  assert.equal(slowOf({ type: 'hit', damage: 3 }), null, 'an ordinary blow has none');
});

/* What is drawn of a man, joint by joint: where each joint is in the world, and how each is turned (its local turn). */
const drawnOf = snap => snap.men.map(m => {
  const { p } = fk(m.pose);
  return { at: NAMES.map(n => toWorld(m.place, p[n], m.pose.stretch)), rot: NAMES.map(n => (m.pose.rot && m.pose.rot[n]) || [1, 0, 0, 0, 1, 0, 0, 0, 1]), place: m.place };
});
const angleOf = (A, C) => {
  // (the angle between two turns: of A's transpose times C)
  const t = A[0] * C[0] + A[3] * C[3] + A[6] * C[6] + A[1] * C[1] + A[4] * C[4] + A[7] * C[7] + A[2] * C[2] + A[5] * C[5] + A[8] * C[8];
  return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2)));
};
const moved = (a, b) => {
  let far = 0,
    turned = 0;
  a.forEach((m, i) => {
    m.at.forEach((p, k) => (far = Math.max(far, len(sub(p, b[i].at[k])))));
    m.rot.forEach((R, k) => (turned = Math.max(turned, angleOf(R, b[i].rot[k]))));
    turned = Math.max(turned, angleOf(m.place.R, b[i].place.R));
  });
  return { far, turned };
};

test('a replay at a quarter of the speed is smooth: no picture twice running, no joint turned further in one than a quarter of a step\'s, the steps it starts and ends on as before', () => {
  for (const id of ['down-back', 'down-side', 'out-log', 'down-liver', 'counter@4m']) {
    const r = createReplay(),
      steps = [];
    let started = null,
      blowAt = null,
      cameDown = null,
      counterAt = null,
      fall = null;
    fight(id, (bout, i) => {
      steps.push({ i, t: bout.t });
      for (const e of bout.events) {
        if (fallOf(e)) (fall = fallOf(e)), (blowAt = bout.t);
        if (e.type === 'hit' && e.who === 0) counterAt = i;
      }
      if (fall && landed(fall, bout.fighters[fall.on])) cameDown = i;
      if (r.watch(bout, DT)) return (started = i), false;
    });
    assert.ok(started !== null, `${id}: it replays`);
    // (it starts as it always did: a knockdown's 0.3 s after he comes down, a brilliant defence's 0.25 s after the counter lands)
    if (fall) assert.equal(started - cameDown, 18, `${id}: 0.3 s after he comes down`);
    else assert.equal(started - counterAt, 15, `${id}: 0.25 s after the counter lands`);
    const drawn = [],
      kept = [];
    while (r.playing) {
      const snap = r.next(DT);
      kept.push(...r.crossed);
      drawn.push(drawnOf(snap));
      if (drawn.length === 1) assert.ok(Math.abs(snap.t - (fall ? blowAt - 0.2 : snap.t)) <= DT + 1e-9, `${id}: from 0.2 s before the blow (${snap.t.toFixed(3)})`);
    }
    // (from the first step it kept to the last, which is the step it started on, each once: the held moment of a blow left out)
    const all = steps.filter(s => s.t >= kept[0].t - 1e-9 && s.i <= started),
      times = [...new Set(all.map(s => +s.t.toFixed(9)))];
    assert.equal(kept.length, times.length, `${id}: every step of it is come to, once`);
    assert.ok(kept.every((k, n) => Math.abs(k.t - times[n]) < 1e-9), `${id}: in order`);
    assert.ok(Math.abs(steps.find(s => s.i === started).t - times[times.length - 1]) < 1e-9, `${id}: it ends on the step it started on`);
    assert.deepEqual(drawn[drawn.length - 1], drawnOf(kept[kept.length - 1]), `${id}: its last picture is that step`);
    assert.equal(drawn.length, Math.ceil(times.length / 0.25), `${id}: four pictures a step, its last as it is over`);
    // (smooth: every picture moves on from the one before, by no more than a quarter of what that step of the bout turned)
    const live = kept.map(drawnOf);
    let most = 0,
      mostFar = 0,
      least = Infinity,
      worst = 0;
    for (let n = 1; n < live.length; n++) (most = Math.max(most, moved(live[n - 1], live[n]).turned)), (mostFar = Math.max(mostFar, moved(live[n - 1], live[n]).far));
    let far = 0;
    for (let n = 1; n < drawn.length; n++) {
      const m = moved(drawn[n - 1], drawn[n]);
      least = Math.min(least, m.far);
      worst = Math.max(worst, m.turned);
      far = Math.max(far, m.far);
    }
    assert.ok(least > 1e-5, `${id}: no picture is the one before it again (the least a joint moved: ${(least * 1000).toFixed(2)} mm)`);
    assert.ok(worst <= most / 4 + 1e-6, `${id}: a joint turns at most ${((worst * 180) / Math.PI).toFixed(2)}° in a picture, a quarter of a step's ${((most * 180) / Math.PI).toFixed(2)}° being ${((most * 45) / Math.PI).toFixed(2)}°`);
    // (and so moves: as far as a quarter of a step's, or along the arc a joint turned through goes, a little more)
    assert.ok(far <= (mostFar / 4) * 1.15 + 0.001, `${id}: a joint moves at most ${(far * 100).toFixed(2)} cm in a picture (a quarter of a step's ${(mostFar * 25).toFixed(2)} cm)`);
  }
});

test('every mote of a hit is drawn hot at first, the hottest yellow and orange of the palette and never its white, and from 0.06 s on is the mote it always was', () => {
  const palette = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')).palette,
    rgbOf = i => [(palette[i] >> 16) & 255, (palette[i] >> 8) & 255, palette[i] & 255];
  assert.deepEqual(FX.motes.hot.colours, [39, 40, 18]);
  for (const i of FX.motes.hot.colours) {
    const [r, g, b] = rgbOf(i);
    assert.ok(r === 255 && r >= g && g > b && palette[i] !== 0xffffff, `${i} (#${palette[i].toString(16)}) is hot, not white`);
  }
  for (const id of ['hit-jab', 'hit-cross', 'body-liver', 'down-back']) {
    const { e, struck } = firstHit(id),
      calls = [];
    blow({ sparks: (...a) => calls.push(a) }, e, struck);
    // (the same motes thrown twice, the same dice: as blow throws them, and without the heat, as they were thrown before)
    const hot = createFx(dice(9)),
      cold = createFx(dice(9));
    for (const a of calls) hot.sparks(...a), cold.sparks(...a.slice(0, 6), Object.assign({}, a[6], { hot: null }));
    const n = calls.reduce((s, a) => s + a[1], 0);
    for (let t = 0, frame = 0; t < 0.2; t += DT, frame++) {
      const k = hot.update(frame ? DT : 0),
        c = cold.update(frame ? DT : 0);
      assert.equal(k, c);
      if (frame === 0) assert.equal(k, n);
      const pal = f => Array.from({ length: k }, (_, i) => f.rows[i * 12 + 9]);
      if (t < 0.06 - 1e-9) {
        const want = FX.motes.hot.colours[Math.min(2, Math.floor((t / 0.06) * 3))];
        assert.ok(pal(hot).every(p => p === want), `${id}: at ${t.toFixed(3)} s every mote is ${want}`);
      } else {
        assert.deepEqual(pal(hot), pal(cold), `${id}: at ${t.toFixed(3)} s its own colours`);
        assert.deepEqual(Array.from(hot.rows.slice(0, k * 12)), Array.from(cold.rows.slice(0, k * 12)), `${id}: and the same mote, where it always was`);
      }
    }
  }
});
