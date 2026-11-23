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
   and a knockdown's own (docs/moves-plan-6.md §2.4B): where the falling man first comes down (down-back, out-log: one step, a part of him within 6 cm of the canvas, none of
   him before it) a second ripple and a ring through the canvas, the ring's lift the same all round at one distance; and
   its slow motion: 0.25 s of the bout's time shown in a real second (to 0.05 s), 0.35 s for a knockout;
   every slow motion smooth (§2.4B 7): a replay at a quarter of the speed never shows the same picture twice running, turns
   no joint further in a picture than a quarter of what it turns in a step of the bout, and still starts and ends on the
   steps it always did;
   and its motes are lava (§2.4C), every other hit's the coloured motes they always were, with nothing hot about them: a
   knockdown throws globs and embers in their place, as many as the damage says, in the colours of heat and charcoal alone;
   a hot glob shows two colours or three, its head the hottest, from whichever side it is seen; cooling, it crusts over,
   its glow then inside its crust, never red, and a cold one is a cinder with at most a small glow; it is at its hottest while it
   rises and only ever cools; it does not bounce off the canvas but lies there going dark; an ember flickers the same at the
   same moment however often it is drawn, and goes out from orange by winking, never red; and the most that is ever thrown
   stays within what an fx can draw. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exitOf, blow, lavaOf, rippleOf, rippleRow, scaleOf, FX, fallOf, landed, landingOf, landRipple, groundOf, groundRow, groundLift, slowOf, paceOf, slowOn } from '../src/render/blow.mjs';
import { createFx, heatOf } from '../src/render/fx.mjs';
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
const wayOf = a => (len(a) > 1e-9 ? unit(a) : [1, 0, 0]);
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
  for (const id of ['hit-jab', 'hit-cross', 'hit-hook', 'upperIn@3', 'body-liver']) {
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
    assert.ok(calls.every(c => Object.keys(c.o).sort().join() === 'life,pace'), `${id}: nothing else asked of them (nothing hot, no hang): ${Object.keys(calls[0].o)}`);
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

test('a knockdown\'s blow throws lava in place of the motes: globs and embers as many as the damage says (11 and 18 at the measure), as fast, thick and long-lived as the plan says', () => {
  const struck = { points: { head: [0, 1.5, 0] } },
    made = more => {
      const calls = { sparks: [], globs: [], embers: [] },
        fake = {
          sparks: (...a) => calls.sparks.push(a),
          globs: (at, n, speed, dir, width, o) => calls.globs.push({ at, n, speed, dir, width, o }),
          embers: (at, n, speed, dir, width, o) => calls.embers.push({ at, n, speed, dir, width, o })
        },
        e = Object.assign({ type: 'hit', damage: 3, J: 85, at: [0.1, 1.5, 0], vec: [-1, 0, 0] }, more),
        n = blow(fake, e, struck);
      return { n, calls, e };
    },
    G = FX.lava.globs,
    E = FX.lava.embers;
  assert.deepEqual([FX.lava.glow, FX.lava.crust], [[39, 40, 18], [7, 6, 5]], 'the glow, hottest first: pale yellow, amber, orange; the crust, charcoal, lightest first');
  assert.ok(Math.abs(lavaOf({ type: 'hit', damage: 3, down: true }).width - 0.0408) < 1e-12, 'a glob at the measure 1.7 times the motes\' 2.4 cm');
  for (const q of [0.1, 0.5, 1, 1.5, 2.2, 3]) {
    for (const more of [{ down: true }, { down: true, out: 'outStiff' }, { out: 'outLog' }]) {
      const { n, calls, e } = made(Object.assign({ damage: 3 * q }, more)),
        m = Math.min(q, FX.most),
        k = Math.min(1.6, Math.max(m, 85 / 85)),
        life = 0.95 * Math.max(0.4, m),
        [g, b] = [calls.globs[0], calls.embers[0]];
      assert.equal(calls.sparks.length, 0, 'none of the ordinary motes');
      assert.deepEqual([g.n, b.n], [Math.max(1, Math.round(11 * m)), Math.max(1, Math.round(18 * m))], `q ${q}: ${g.n} globs and ${b.n} embers`);
      assert.equal(n, g.n + b.n);
      assert.deepEqual(lavaOf(e), { globs: g.n, embers: b.n, width: g.width }, 'lavaOf says what blow throws');
      assert.ok(Math.abs(g.width - Math.min(G.most, Math.max(G.least, 1.7 * Math.max(0.01, 0.024 * m)))) < 1e-12 && b.width === FX.motes.thin, `q ${q}: a glob ${(g.width * 100).toFixed(1)} cm thick (1.7 times a mote, ${G.least * 100} to ${G.most * 100} cm), an ember the thinnest`);
      assert.ok(Math.abs(g.speed - (2.5 + 3 * k)) < 1e-12 && Math.abs(b.speed - 1.2 * g.speed) < 1e-12 && b.o.wide === 1.2, 'globs as fast as the first kind of mote, embers 1.2 times faster and wider');
      assert.ok(Math.abs(g.o.life - 1.6 * life) < 1e-12 && Math.abs(b.o.life - 2 * life) < 1e-12, 'a glob lives 1.6 times a mote\'s life, an ember twice');
      assert.deepEqual([g.o.fall, g.o.drag, b.o.fall, b.o.drag, g.o.cool, g.o.spot], [0.8, 0.8, 0.2, 1.6, 2.5, 0.35], 'a glob\'s weight; an ember\'s float');
      assert.deepEqual([g.o.shed.every, g.o.shed.pace, g.o.shed.most], [0.05, 0.3, 4], 'a glob sheds an ember every 0.05 s at 0.3 of its velocity, four at most');
      assert.deepEqual([g.at, b.at], [0, 1].map(() => exitOf({ at: struck.points.head, r: FX.head }, e.at, e.vec)), 'from the far side of his head, as any blow\'s');
      assert.deepEqual([g.dir, b.dir], [0, 1].map(() => [e.vec[0], e.vec[2], e.vec[1]]), 'the way the glove went');
    }
  }
  assert.equal(lavaOf({ type: 'hit', damage: 3 }), null, 'an ordinary hit has none');
  // (and the real ones: down-back, out-log and the liver's knockdown, 11, 11 and 6 globs)
  for (const [id, globs] of [['down-back', 11], ['out-log', 11], ['down-liver', 6]]) {
    const { e, struck: man } = firstHit(id),
      fx = createFx(dice(5)),
      n = blow(fx, e, man);
    assert.ok(e.down || e.out, `${id} is a knockdown`);
    assert.equal(fx.items.filter(it => it.kind === 'glob').length, globs, `${id}: ${globs} globs`);
    assert.equal(fx.items.length, n, `${id}: ${n} thrown, all of them globs and embers`);
    assert.ok(fx.items.every(it => it.kind === 'glob' || it.kind === 'ember'));
    // (on the way the glove went: their mean velocity as they leave within 30 degrees of the blow's line, as the motes')
    const mean = [0, 1, 2].map(j => fx.items.reduce((s, it) => s + it.v[j], 0) / n);
    assert.ok(angle(mean, e.vec) <= 30, `${id}: ${angle(mean, e.vec).toFixed(1)} degrees off the blow's line`);
  }
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

test('an ordinary hit\'s motes are as they always were: nothing hot about them, each going through its own colours over its life, the white of the first kind with them', () => {
  for (const id of ['hit-jab', 'hit-cross', 'hit-upper', 'upperIn@3', 'body-liver']) {
    const { e, struck } = firstHit(id),
      fx = createFx(dice(9)),
      n = blow(fx, e, struck);
    assert.ok(!e.down && !e.out, `${id} is not a knockdown`);
    assert.equal(fx.update(0), n);
    const kinds = fx.items.map(it => it.pal);
    assert.ok(fx.items.every(it => !it.kind && !('hot' in it)), `${id}: plain motes, none of them hot`);
    assert.ok(kinds.every(c => c.join() === '38,39,40,41' || c.join() === '41,41,25'), `${id}: the two kinds' colours`);
    const seen = new Set();
    for (let t = 0; t < 0.8; t += DT) {
      const m = fx.update(DT);
      assert.equal(m, fx.items.length, 'one row a mote');
      fx.items.forEach((it, i) => {
        const own = it.pal[Math.min(it.pal.length - 1, Math.floor((it.age / it.life) * it.pal.length))];
        assert.equal(fx.rows[i * 12 + 9], own, `${id}: a mote ${it.age.toFixed(3)} s into its ${it.life.toFixed(3)} s in its own colour`);
        assert.equal(fx.rows[i * 12 + 10], 0, 'with no light and drawn where it is');
        seen.add(own);
      });
    }
    assert.ok(seen.has(38) && seen.has(25), `${id}: white and blue among them (${[...seen]})`);
  }
});

/* The rows of what is live, and the colours that one glob or ember is drawn in now: its rows are the ones it writes, in the
   order of the items (a glob three, or two once it lies on the canvas; an ember one, or two while it is fast). */
const rowsOf = fx => {
  const n = fx.update(0);
  return Array.from({ length: n }, (_, i) => Array.from(fx.rows.slice(i * 12, i * 12 + 12)));
};
const knockdown = (damage, vec) => ({ type: 'hit', damage, J: 85, down: true, at: [0.1, 1.5, 0], vec: vec || [-0.95, 0.29, -0.08] });
const HEAD = { points: { head: [0, 1.5, 0] } };

test('a knockdown\'s lava is drawn in the colours of heat and charcoal alone: never the white or the blues, never the dark reds, no light; an ember never red', () => {
  const heat = new Set([39, 40, 18, 17, 7, 6, 5]); // (the glow, the red a glob might show inside its crust, and the crust)
  for (const [id, seed] of [['down-back', 1], ['out-log', 2], ['down-liver', 3], ['most', 4], ['down', 5]]) {
    const real = ['down-back', 'out-log', 'down-liver'].includes(id),
      { e, struck } = real ? firstHit(id) : { e: knockdown(id === 'most' ? 6.6 : 3, id === 'down' ? [-0.3, -0.9, 0.2] : null), struck: HEAD },
      fx = createFx(dice(seed));
    blow(fx, e, struck);
    const seen = new Set();
    for (let t = 0; fx.items.length && t < 4; t += DT, fx.update(DT))
      for (const r of rowsOf(fx)) {
        seen.add(r[9]);
        assert.ok(r[10] <= 0, `${id}: no light`);
        for (const it of fx.items) if (it.kind === 'ember') assert.ok(!heatOf(it).includes(17), `${id}: an ember is never red`);
        assert.notEqual(r[9], 17, `${id}: nothing red at all`);
      }
    assert.ok([...seen].every(c => heat.has(c)), `${id}: only the glow's and the crust's colours (${[...seen].sort((a, b) => a - b)})`);
    assert.ok(![38, 41, 25, 16, 15].some(c => seen.has(c)), `${id}: never the white, the blues or the dark reds`);
    assert.ok(seen.has(39) && FX.lava.crust.some(c => seen.has(c)), `${id}: from the hottest down to charcoal (${[...seen]})`);
    assert.equal(fx.items.length, 0, `${id}: all of it gone in the end`);
  }
});

/* Drawn as the renderer draws them, from the side `Z` (unit, toward the eye), looked at straight: each row an ellipse in the
   picture's plane, solid where its density falls no lower than a half, and at each point the one nearest the eye (less how
   far it is pulled toward it) wins. -> how much of the picture each colour has, and (as `bare`) how many points show the
   second row, a glob's body, with the first, its crust, not round them */
function picture(rows, Z) {
  const up = Math.abs(Z[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0],
    X = unit([up[1] * Z[2] - up[2] * Z[1], up[2] * Z[0] - up[0] * Z[2], up[0] * Z[1] - up[1] * Z[0]]),
    Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  const els = rows.map(r => {
    const S = [[r[3], r[4], r[5]], [r[4], r[6], r[7]], [r[5], r[7], r[8]]],
      quad = (u, v) => [0, 1, 2].reduce((s, a) => s + u[a] * [0, 1, 2].reduce((t, b) => t + S[a][b] * v[b], 0), 0),
      a = quad(X, X) + 1e-7,
      b = quad(X, Y),
      d = quad(Y, Y) + 1e-7,
      det = a * d - b * b;
    return { x: dot(r, X), y: dot(r, Y), depth: -dot(r, Z) - Math.max(0, -r[10]), ia: d / det, ib: -b / det, id: a / det, pal: r[9], dense: r[11] };
  });
  const seen = new Map();
  seen.bare = 0;
  for (let gx = -0.25; gx <= 0.25; gx += 0.004)
    for (let gy = -0.25; gy <= 0.25; gy += 0.004) {
      let best = null,
        crust = false;
      for (const e of els) {
        const x = gx + els[0].x - e.x,
          y = gy + els[0].y - e.y,
          on = e.dense * Math.exp(-0.5 * (e.ia * x * x + 2 * e.ib * x * y + e.id * y * y)) >= 0.5;
        if (on && e === els[0]) crust = true;
        if (on && (!best || e.depth < best.depth)) best = e;
      }
      if (best) seen.set(best.pal, (seen.get(best.pal) || 0) + 1);
      if (best && best === els[1] && !crust) seen.bare++;
    }
  return seen;
}

test('a hot glob is never one colour: from any side, two or three of the heat\'s colours at once, its head the hottest of them and always to be seen', () => {
  const L = FX.lava,
    sides = Array.from({ length: 300 }, (_, i) => {
      const z = 1 - (2 * (i + 0.5)) / 300,
        r = Math.sqrt(1 - z * z);
      return [r * Math.cos(i * 2.399963), z, r * Math.sin(i * 2.399963)];
    });
  let views = 0,
    three = 0;
  for (const [seed, dir, t] of [[4, [-1, 0, 0.3], 0.02], [7, [0.2, 0.5, -1], 0.1], [8, [0, 1, 0], 0.15]]) {
    const fx = createFx(dice(seed));
    fx.globs([0, 1.5, 0], 1, 6, dir, 0.04, { glow: L.glow, crust: L.crust, life: 1.6, pace: 1.05, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35 });
    for (let k = 0; k < Math.round(t / DT); k++) fx.update(DT);
    const it = fx.items[0],
      rows = rowsOf(fx);
    assert.ok(it && it.T > 0.75 && rows.length === 3, `glob ${seed}: hot (T ${it && it.T.toFixed(2)}), three parts`);
    assert.deepEqual(rows.map(r => r[9]), heatOf(it), 'tail, body, head');
    assert.deepEqual(heatOf(it), [18, 40, 39], 'hot: the head pale yellow, the body amber, the tail orange');
    // (and from straight ahead of it and straight behind it, where its parts are one behind another)
    for (const Z of [...sides, it.way, it.way.map(x => -x)]) {
      const seen = picture(rows, Z),
        all = [...seen.values()].reduce((s, x) => s + x, 0),
        shown = [...seen].filter(([, c]) => c >= all * 0.03);
      assert.ok(shown.length >= 2, `glob ${seed} seen from ${Z.map(x => x.toFixed(2))}: ${shown.length} colour`);
      assert.ok(seen.has(39), `glob ${seed}: its head to be seen from ${Z.map(x => x.toFixed(2))}`);
      views++;
      if (shown.length === 3) three++;
    }
  }
  assert.ok(three / views > 0.85, `three colours from most sides: ${three} of ${views}`);
});

test('a cooling glob crusts over: once the crust has closed its glow is only ever inside it, from any side and at any speed, and nothing is red; a cold one a charcoal cinder with at most a small orange point', () => {
  const L = FX.lava,
    sides = Array.from({ length: 200 }, (_, i) => {
      const z = 1 - (2 * (i + 0.5)) / 200,
        r = Math.sqrt(1 - z * z);
      return [r * Math.cos(i * 2.399963), z, r * Math.sin(i * 2.399963)];
    });
  let looks = 0;
  for (const [T, speed] of [[0.5, 0], [0.4, 1.5], [0.3, 4], [0.26, 8], [0.2, 0.5], [0.1, 3], [0.02, 6]]) {
    const fx = createFx(dice(21));
    fx.globs([0, 1.5, 0], 1, 6, [-1, 0.3, 0.2], 0.04, { glow: L.glow, crust: L.crust, life: 1.6, pace: 1.05, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35 });
    fx.update(DT);
    const g = fx.items[0];
    g.T = T;
    g.v = wayOf(g.v).map(x => x * speed);
    const rows = rowsOf(fx),
      colours = heatOf(g),
      crust = new Set(L.crust);
    assert.ok(crust.has(colours[0]), `T ${T}: its tail is crust (${colours})`);
    for (const Z of [...sides, g.way, g.way.map(x => -x)]) {
      const seen = picture(rows, Z),
        all = [...seen.values()].reduce((a, b) => a + b, 0),
        dark = L.crust.reduce((a, c) => a + (seen.get(c) || 0), 0),
        glow = all - dark;
      assert.equal(seen.bare, 0, `T ${T} at ${speed} m/s, seen from ${Z.map(x => x.toFixed(2))}: its body's glow inside its crust`);
      assert.ok(!seen.has(17), `T ${T}: no red`);
      if (T <= 0.25) {
        assert.ok(glow <= all * 0.3 && dark >= all * 0.7, `T ${T} seen from ${Z.map(x => x.toFixed(2))}: charcoal ${dark} of ${all}, glow ${glow}`);
      }
      looks++;
    }
  }
  assert.ok(looks > 1000);
});

test('a glob is at its hottest while it rises, and only cools: by how fast it falls from the top of its flight, and by its age', () => {
  for (const [seed, dir] of [[1, [-1, 0, 0.3]], [2, [0, 0, 1]], [3, [0.3, -0.2, -1]], [4, [0, 0, -1]]]) {
    const fx = createFx(dice(seed));
    fx.globs([0, 1.5, 0], 12, 5.5, dir, 0.04, { glow: FX.lava.glow, crust: FX.lava.crust, life: 1.52, pace: 1.05, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35 });
    const globs = fx.items.slice(),
      last = new Map(globs.map(g => [g, { T: 1, rose: g.v[1] >= 0 }]));
    let rising = 0,
      cooled = 0;
    for (let t = 0; t < 2; t += 1 / 240) {
      fx.update(1 / 240);
      for (const g of globs) {
        if (!fx.items.includes(g) || g.stuck) continue;
        const was = last.get(g);
        if (g.top === null) (assert.ok(g.v[1] >= 0 && g.T === 1, `a glob still rising at ${g.v[1].toFixed(2)} m/s is at its hottest (T ${g.T})`), rising++);
        assert.ok(g.T <= was.T + 1e-12, `never back: ${was.T.toFixed(3)} -> ${g.T.toFixed(3)}`);
        // (from the top: no hotter than its fall says, and no hotter than its age says)
        if (g.top !== null) assert.ok(g.T <= 1 - Math.min(1, Math.max(0, (-g.v[1] - g.thrown) / 2.5)) + 1e-12 && g.T <= 1 - Math.min(1, (g.age - g.top) / (g.cools - g.top)) + 1e-12);
        if (g.T < was.T) cooled++;
        was.T = g.T;
      }
    }
    assert.ok(cooled > 0, `dir ${dir}: they cool`);
    if (dir[2] === 1) assert.ok(rising > 20, `dir ${dir}: and rise hot first (${rising} looks)`);
  }
  // (its stages [tail, body, head]: hot; a crust behind; the crust round an orange glow; a cinder with an orange point; gone out)
  const it = { kind: 'glob', glow: FX.lava.glow, crust: FX.lava.crust, age: 0.1, cools: 1 };
  assert.deepEqual([1, 0.7, 0.4, 0.1].map(T => heatOf(Object.assign(it, { T }))), [[18, 40, 39], [7, 18, 40], [7, 18, 18], [5, 6, 18]]);
  assert.deepEqual(heatOf(Object.assign(it, { T: 0.1, age: 0.9 })), [5, 6, 6], 'the point gone out in the last of its life');
});

test('a glob that comes down on the canvas does not bounce: it lies there flat, an orange core over a charcoal rim going dark over 0.35 s, and is gone', () => {
  const fx = createFx(dice(6));
  fx.globs([0, 0.5, 0], 8, 4, [0.3, 0.2, -1], 0.04, { glow: FX.lava.glow, crust: FX.lava.crust, life: 3, pace: 1, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35 });
  const globs = fx.items.slice(),
    down = new Map();
  for (let t = 0; t < 2; t += DT) {
    fx.update(DT);
    for (const g of globs) {
      if (!fx.items.includes(g)) continue;
      if (g.stuck && !down.has(g)) down.set(g, { y: g.b[1], at: g.age, colours: [] });
      if (!down.has(g)) continue;
      const d = down.get(g);
      assert.equal(g.b[1], d.y, 'it stays where it came down');
      assert.ok(g.b[1] <= 0.02 + g.width, 'on the canvas');
      d.colours.push(heatOf(g)[1]);
      (d.rims = d.rims || []).push(heatOf(g)[0]);
      d.last = g.age;
    }
  }
  assert.ok(down.size === globs.length, `all ${globs.length} came down`);
  for (const d of down.values()) {
    assert.deepEqual([...new Set(d.colours)], [18, 6], 'its core orange, then charcoal');
    assert.deepEqual([...new Set(d.rims)], [7, 6, 5], 'its rim charcoal, darkening');
    assert.ok(d.last - d.at < 0.35 + 1e-9 && d.last - d.at > 0.3, `gone 0.35 s after it came down (${(d.last - d.at).toFixed(3)})`);
  }
  // (drawn flat on the canvas: its rim and its core, no height to them, the core over the rim)
  const fresh = createFx(dice(6));
  fresh.globs([0, 0.3, 0], 1, 2, [0, -1, 0], 0.04, { glow: FX.lava.glow, crust: FX.lava.crust, life: 3, pace: 1, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35 });
  while (!fresh.items[0].stuck) fresh.update(DT);
  const rows = rowsOf(fresh);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r[6] < 1e-5 && Math.abs(r[1] - 0.014) < 1e-9), 'flat, on the canvas');
  assert.ok(-rows[1][10] > -rows[0][10], 'the core over the rim');
});

test('an ember flickers by its own age and seed: the same colours at the same moment of the bout, however often it is drawn; and it is caught by the air within half a metre', () => {
  const thrown = () => {
    const fx = createFx(dice(12));
    blow(fx, knockdown(3), HEAD);
    return { fx, embers: fx.items.filter(it => it.kind === 'ember') };
  };
  const [a, b, c] = [thrown(), thrown(), thrown()];
  assert.equal(a.embers.length, 18);
  let changes = 0,
    looks = 0;
  const last = new Map();
  for (let n = 1; n <= 50; n++) {
    a.fx.update(DT);
    for (let k = 0; k < 4; k++) b.fx.update(DT / 4);
    // (and in uneven steps: a third and two thirds of a sixtieth)
    c.fx.update(DT / 3), c.fx.update((2 * DT) / 3);
    a.embers.forEach((ea, i) => {
      if (!a.fx.items.includes(ea)) return;
      const [eb, ec] = [b.embers[i], c.embers[i]];
      assert.ok(b.fx.items.includes(eb) && c.fx.items.includes(ec), 'as long-lived');
      assert.deepEqual(heatOf(eb), heatOf(ea), `ember ${i} at ${(n * DT).toFixed(3)} s: the same in quarter steps`);
      assert.deepEqual(heatOf(ec), heatOf(ea), `ember ${i} at ${(n * DT).toFixed(3)} s: the same in uneven steps`);
      if (last.has(i) && last.get(i) !== heatOf(ea)[0]) changes++;
      last.set(i, heatOf(ea)[0]);
      looks++;
    });
  }
  assert.ok(changes > looks / 8, `they flicker: ${changes} changes of colour in ${looks} looks`);
  /* (it never stays hotter than it is: every 0.04 s either the step it is at or the next one, its tail a step cooler; at
     the last, orange, on or off, more often off toward its end) */
  const H = FX.lava.glow,
    e = { kind: 'ember', heat: H, from: 0, life: 0.5, seed: 77, flicker: 0.04 },
    stepAt = age => Math.min(2, Math.floor((age / 0.5) ** 3 * 3)),
    off = [0, 0];
  for (let age = 0; age < 0.5; age += 0.001) {
    const [head, tail] = heatOf(Object.assign(e, { age })),
      step = stepAt(age);
    if (step < 2) assert.ok([step, step + 1].includes(H.indexOf(head)) && H.indexOf(tail) === Math.min(2, H.indexOf(head) + 1), `at ${age.toFixed(3)} s: ${head}/${tail}`);
    else {
      assert.ok(head === null ? tail === null : head === 18 && tail === 18, `at ${age.toFixed(3)} s, the last step: ${head}/${tail}`);
      off[age < 0.5 * Math.cbrt(2.5 / 3) ? 0 : 1] += head === null ? 1 : 0;
    }
  }
  assert.ok(off[0] > 0 && off[1] > 0, `it winks out at its last step (${off})`);
  for (let k = 0; k < 12; k++) {
    const first = k * 0.04 + 0.0005,
      same = [];
    for (let age = first; age < (k + 1) * 0.04 - 1e-4; age += 0.002) if (stepAt(age) === stepAt(first)) same.push(heatOf(Object.assign({}, e, { age })).join());
    assert.equal(new Set(same).size, 1, `between ${(k * 0.04).toFixed(2)} and ${((k + 1) * 0.04).toFixed(2)} s: ${[...new Set(same)]}`);
  }
  // (thrown out fast, the air has them within half a metre)
  for (const ea of a.embers) assert.ok(len(sub(ea.b, a.embers[0].a)) < 0.6, `an ember ${len(sub(ea.b, a.embers[0].a)).toFixed(2)} m from where it started`);
});

test('a glob sheds an ember every 0.05 s of its flight, at 0.3 of its velocity, four at most, as hot as its head', () => {
  const fx = createFx(dice(3));
  fx.globs([0, 1.5, 0], 1, 5, [0, 0, 1], 0.04, { glow: FX.lava.glow, crust: FX.lava.crust, life: 1.5, pace: 1, fall: 0.8, drag: 0.8, cool: 2.5, land: 0, spot: 0.35, shed: { every: 0.05, pace: 0.3, most: 4, ember: { glow: FX.lava.glow, width: 0.01, life: 2, fall: 0.2, drag: 1.6, brake: 4, wander: [0.1, 0.2], flicker: 0.04, trail: 1.5 } } });
  const glob = fx.items[0],
    shed = [];
  for (let t = 0; t < 0.4; t += 1 / 120) {
    const v = glob.v.slice(),
      had = new Set(fx.items);
    fx.update(1 / 120);
    for (const it of fx.items) if (!had.has(it)) shed.push({ it, age: it.age, ev: it.v.slice(), v: glob.v.map(x => x * 0.3), at: glob.age, T: glob.T });
  }
  assert.equal(shed.length, 4, 'four of them');
  shed.forEach((s, i) => {
    assert.ok(Math.abs(s.at - s.age - 0.05 * (i + 1)) < 1e-9, `the ${i + 1}st on the beat: ${(s.at - s.age).toFixed(4)} s`);
    assert.equal(s.it.kind, 'ember');
    assert.ok(len(sub(s.ev, s.v)) < 1e-12, 'at 0.3 of the glob\'s velocity');
    assert.equal(s.it.from, Math.min(2, s.T > 0.75 ? 0 : s.T > 0.5 ? 1 : 2), 'as hot as its head (an ember no cooler than orange)');
  });
});

test('the most a knockdown throws stays within what an fx draws: rows at a blow of 0.5, 1 and 2.2 times the measure', () => {
  const most = {};
  for (const q of [0.5, 1, 2.2]) {
    let top = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const fx = createFx(dice(seed));
      blow(fx, knockdown(3 * q), HEAD);
      for (let t = 0; t < 3; t += DT) top = Math.max(top, fx.update(DT));
      assert.equal(fx.items.length, 0);
    }
    most[q] = top;
  }
  assert.ok(most[2.2] < 960 / 3, `at most ${most[0.5]}, ${most[1]} and ${most[2.2]} rows: well within the 960 an fx draws, even for three such blows at once`);
  assert.ok(most[0.5] < most[1] && most[1] < most[2.2], 'more for the harder blow');
});
