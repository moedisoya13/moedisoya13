/* Knocked out cold (docs/moves-plan-4.md §6): the knockdown's body (phys/fall.mjs) let go of another way, and a man who does
   not get up.
     limp (out)        every joint's hold is gone 0.05 s in, and his head is on the canvas sooner than an ordinary
                       knockdown's from the same blow
     log (outStiff)    his knees and hips (and spine) within 10 degrees of how they were until 0.5 s, let go once he is down
                       on the canvas; he goes over like a tree, the foot he turns on on the canvas until his trunk is 45
                       degrees over; his head on the canvas sooner than an ordinary knockdown's, and the back of it comes
                       up off the canvas once, a little
     lying             for 3 s nothing of him but the raised forearm (and his breathing, left out here) moves more than a
                       centimetre; the forearm is up for 1.5 s and comes down slowly
     never up          no way up starts, getUp does nothing, and a match counts him out
     the same          the same blow is the same fall
     the rule          a finishing blow RULES.out or more past his health, or one that catches him throwing, knocks him out
                       cold, limp from a hook or an uppercut and stiff from a jab or a cross; less is the ordinary knockdown */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBout, step, settle, getUp, RULES } from '../src/game/bout.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { measure } from '../src/audit.mjs';
import { createFall, stepFall, poseOf, muscles } from '../src/phys/fall.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import { HEAD } from '../src/rig/body.mjs';
import * as M from '../src/rig/m3.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI,
  card = id => DEFENSE.find(e => e.id === id),
  LIMP = card('out-limp'),
  LOG = card('out-log'),
  FAINT = [LIMP, LOG];

// (the turn of one piece of the fallen body on another, and the angle between two such turns, degrees)
const piece = (body, name) => body.bodies.find(b => b.name === name);
const rel = (body, parent, child) => {
  const p = piece(body, parent).q,
    c = piece(body, child).q;
  // conj(p) * c
  return [p[3] * c[0] - p[0] * c[3] - p[1] * c[2] + p[2] * c[1], p[3] * c[1] + p[0] * c[2] - p[1] * c[3] - p[2] * c[0], p[3] * c[2] - p[0] * c[1] + p[1] * c[0] - p[2] * c[3], p[3] * c[3] + p[0] * c[0] + p[1] * c[1] + p[2] * c[2]];
};
const between = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * DEG;
const PAIRS = { knee: [['Lthigh', 'Lshin'], ['Rthigh', 'Rshin']], hip: [['pelvis', 'Lthigh'], ['pelvis', 'Rthigh']], spine: [['pelvis', 'belly'], ['belly', 'chest']] };

/* One knockdown card, frame by frame (the frames held at the blow left out): what he was doing, the fall's own clock, what is
   left of his muscles, how his joints are turned, where every joint is on the canvas without his breathing, and his head's
   height as he is drawn. */
function run(entry) {
  const bout = freshBout(entry),
    f = bout.fighters[0],
    frames = [];
  let hit = null,
    taken = 0;
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    const had = f.hp;
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    if (bout.events.some(e => e.type === 'hit' && e.on === 0)) taken = had - f.hp;
    bout.fighters[1].hp = 1000;
    const e = bout.events.find(e => e.type === 'hit' && e.on === 0 && e.down);
    if (e && !hit) hit = { t: tick * DT, e };
    if (bout.stop > 0) continue;
    const body = f.animator.fallen,
      down = body && f.action && MOVES[f.action.name].fall,
      k = { t: tick * DT, doing: f.action ? f.action.name : 'guard', head: measure(f).at.head[1] };
    if (down) {
      const F = fk(poseOf(body, 0, 0));
      k.body = { t: body.t, lay: body.lay, freed: body.freed, bounced: body.bounced, post: body.post && body.post.s, tone: muscles(body).map(m => m.tone) };
      k.turn = Object.fromEntries(Object.entries(PAIRS).map(([kind, pairs]) => [kind, pairs.map(([a, b]) => rel(body, a, b))]));
      k.at = Object.fromEntries(Object.keys(F.p).map(n => [n, toWorld(f.place, F.p[n], 1)]));
      k.at.head = toWorld(f.place, M.add(F.p.Head, M.app(F.R.Head, HEAD)), 1);
    }
    frames.push(k);
  }
  return { bout, f, frames, hit, taken, body: f.animator.fallen };
}
const RUNS = new Map();
const ran = entry => RUNS.get(entry) || (RUNS.set(entry, run(entry)), RUNS.get(entry));
// (how long after the blow his head is down on the canvas: its middle within a few centimetres of a head's radius off it)
const headDown = r => {
  const k = r.frames.find(k => k.t > r.hit.t && k.head < 0.16);
  return k ? k.t - r.hit.t : Infinity;
};

test('out cold: the cards are knocked out cold the way the card says, limp from the hook, stiff from the cross', () => {
  for (const [entry, name, punch] of [[LIMP, 'out', 'hook'], [LOG, 'outStiff', 'cross']]) {
    const r = ran(entry);
    assert.ok(r.hit, entry.id + ': went down');
    assert.equal(r.hit.e.name, punch);
    assert.equal(r.hit.e.out, name);
    assert.equal(entry.fall, name);
    assert.equal(r.body.out, MOVES[name].faint);
  }
});

test('limp: every joint has let go 0.05 s after the blow, and stays let go until he lies there', () => {
  const r = ran(LIMP),
    falling = r.frames.filter(k => k.body && k.body.t >= 0.05 - 1e-9 && (k.body.lay === undefined || k.body.t < k.body.lay));
  assert.ok(falling.length > 20, `${falling.length} frames of the fall`);
  for (const k of falling) assert.ok(k.body.tone.every(w => w === 0), `at ${k.body.t.toFixed(3)} s: ${k.body.tone.map(w => w.toFixed(2))}`);
});

test('log: his knees, hips and spine stay within 10 degrees of how they were until 0.5 s, and let go once he is down', () => {
  const r = ran(LOG),
    first = r.frames.find(k => k.body);
  let most = { knee: 0, hip: 0, spine: 0 };
  for (const k of r.frames.filter(k => k.body && k.body.t <= 0.5 + 1e-9))
    for (const kind in most) k.turn[kind].forEach((q, i) => (most[kind] = Math.max(most[kind], between(q, first.turn[kind][i]))));
  for (const kind in most) assert.ok(most[kind] <= 10, `${kind}: ${most[kind].toFixed(1)} degrees`);
  const freed = r.body.freed;
  assert.ok(freed >= 0.5 - 1e-9 && freed < 1.5, `let go at ${freed} s`);
  // (and once let go, nothing holds him but the arm he keeps up)
  const after = r.frames.find(k => k.body && k.body.t > freed + 0.1);
  assert.ok(after.body.tone.filter(w => w > 0).length <= 2, after.body.tone.map(w => w.toFixed(2)).join(' '));
});

test('log: the back of his head meets the canvas and comes up off it once, a little', () => {
  const r = ran(LOG),
    hit = r.body.bounced;
  assert.ok(hit !== undefined, 'his head met the canvas hard enough to come up off it');
  // (its height, measured from the physics without his breathing, from the moment it met the canvas)
  const heads = r.frames.filter(k => k.body && k.body.t >= hit - 1e-9 && k.body.t < hit + 0.6).map(k => k.at.head[1]),
    low = heads[0],
    top = Math.max(...heads);
  assert.ok(top - low > 0.005 && top - low < 0.06, `up ${((top - low) * 100).toFixed(1)} cm off the canvas`);
  // (once: after it, his head comes down onto the canvas and stays)
  const later = r.frames.filter(k => k.body && k.body.t >= hit + 0.6 && k.body.t < hit + 1.5).map(k => k.at.head[1]);
  assert.ok(Math.max(...later) - Math.min(...later) < 0.01, `still moving ${((Math.max(...later) - Math.min(...later)) * 100).toFixed(1)} cm`);
});

for (const [entry, kind, ordinary] of [[LIMP, 'limp', 'down-side'], [LOG, 'log', 'down-back']])
  test(`${entry.id}: the head reaches the canvas sooner than an ordinary knockdown from the same blow`, () => {
    // (the very pose and blow he went down from, let go of the ordinary way and his way)
    const made = ran(entry).body.made,
      downAt = out => {
        const body = createFall(made.pose, made.before, made.dt, made.blow, out);
        for (let i = 1; i <= 180; i++) {
          stepFall(body, DT);
          const F = fk(poseOf(body, 0, 0));
          if (M.add(F.p.Head, M.app(F.R.Head, HEAD))[1] < 0.16) return i * DT;
        }
        return Infinity;
      };
    assert.ok(downAt(kind) < downAt(null), `${kind} ${downAt(kind).toFixed(3)} s, ordinary ${downAt(null).toFixed(3)} s`);
    // and in the catalogue: before the ordinary knockdown card's with the same punch
    const mine = headDown(ran(entry)),
      theirs = headDown(ran(card(ordinary)));
    assert.ok(mine < theirs, `card: ${entry.id} ${mine.toFixed(3)} s, ${ordinary} ${theirs.toFixed(3)} s`);
  });

// (a point of a piece of the fallen body, from its own frame)
const pointOf = (b, l) => {
  const q = b.q,
    v = l.map((x, i) => x - b.com[i]),
    t = [q[1] * v[2] - q[2] * v[1], q[2] * v[0] - q[0] * v[2], q[0] * v[1] - q[1] * v[0]].map(x => 2 * x),
    u = [q[1] * t[2] - q[2] * t[1], q[2] * t[0] - q[0] * t[2], q[0] * t[1] - q[1] * t[0]];
  return [0, 1, 2].map(i => b.x[i] + v[i] + q[3] * t[i] + u[i]);
};
test('log: he goes over like a tree, on his planted heel: the foot he turns on stays on the canvas until his trunk is 45 degrees over', () => {
  const entry = LOG,
    bout = freshBout(entry),
    f = bout.fighters[0];
  let most = 0,
    over = false;
  for (let tick = 0; tick < Math.round(2 / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    const body = f.animator.fallen;
    if (!body) continue;
    const lo = pointOf(piece(body, 'pelvis'), [0, 0, 0]),
      hi = pointOf(piece(body, 'chest'), [0, 0, 0]),
      d = hi.map((x, i) => x - lo[i]),
      tilt = Math.acos(d[1] / Math.hypot(...d)) * DEG,
      feet = ['L', 'R'].map(s => {
        const b = piece(body, s + 'foot');
        return Math.min(...b.balls.map(([l, r]) => pointOf(b, l)[1] - r));
      });
    if (tilt >= 45) over = true;
    if (!over) most = Math.max(most, Math.min(...feet));
  }
  assert.ok(over, 'he went over');
  assert.ok(most <= 0.03, `the lower foot ${(most * 100).toFixed(1)} cm off the canvas before he was 45 degrees over`);
});

for (const entry of FAINT)
  test(`${entry.id}: for 3 s after he comes to lie, nothing but the raised forearm moves more than 1 cm; it is up 1.5 s and comes down slowly`, () => {
    const r = ran(entry),
      lay = r.body.lay,
      side = r.body.post === undefined ? null : r.body.post.s === 'L' ? 'Left' : 'Right';
    assert.ok(lay !== undefined, 'he came to lie');
    assert.ok(side, 'a forearm is up');
    const lying = r.frames.filter(k => k.body && k.body.t >= lay - 1e-9 && k.body.t <= lay + 3 + 1e-9);
    assert.ok(lying.length >= 175, `${lying.length} frames of lying in the card (it must show 3 s of it)`);
    const from = lying[0].at,
      moved = {};
    for (const k of lying) for (const n in k.at) moved[n] = Math.max(moved[n] || 0, Math.hypot(...k.at[n].map((v, i) => v - from[n][i])));
    // (the raised forearm: from its elbow to its wrist)
    const others = Object.entries(moved).filter(([n, d]) => n !== side + 'Hand' && n !== side + 'ForeArm' && d > 0.01);
    assert.deepEqual(others.map(([n, d]) => `${n} ${(d * 100).toFixed(1)} cm`), []);
    // the forearm: up off the canvas (its wrist 18 cm and more) for 1.5 s, then coming down no faster than 1.2 m/s, to the
    // canvas by the end of the card
    const wrist = r.frames.filter(k => k.body && k.body.t >= lay - 1e-9).map(k => ({ t: k.body.t - lay, y: k.at[side + 'Hand'][1] })),
      up = wrist.filter(w => w.y >= 0.18);
    assert.ok(up.length && up[up.length - 1].t - up[0].t >= 1.5, `up from ${up.length && up[0].t.toFixed(2)} to ${up.length && up[up.length - 1].t.toFixed(2)} s`);
    for (let i = 1; i < wrist.length; i++) assert.ok(wrist[i - 1].y - wrist[i].y <= 1.2 * DT, `came down ${((wrist[i - 1].y - wrist[i].y) * 100).toFixed(1)} cm in a frame at ${wrist[i].t.toFixed(2)} s`);
    const last = wrist[wrist.length - 1];
    assert.ok(last.y < 0.15, `still ${(last.y * 100).toFixed(0)} cm up at the end`);
    // (slowly: from a centimetre below where it was held to a centimetre above where it ends, 0.6 s or more)
    const held = Math.max(...up.map(w => w.y)),
      start = wrist.find(w => w.t > up[0].t && w.y < held - 0.01),
      end = wrist.find(w => start && w.t > start.t && w.y < last.y + 0.01);
    assert.ok(start && end && end.t - start.t >= 0.6, `it came down in ${start && end ? (end.t - start.t).toFixed(2) : '?'} s`);
  });

for (const entry of FAINT)
  test(`${entry.id}: he does not get up; getUp does nothing; the same blow is the same fall`, () => {
    const r = ran(entry);
    assert.ok(!r.frames.some(k => k.doing.startsWith('rise')), 'a way up started');
    assert.equal(r.f.down, 1);
    assert.equal(r.f.action.name, entry.fall);
    const was = { action: r.f.action, x: r.f.x, z: r.f.z, yaw: r.f.yaw };
    assert.equal(getUp(r.bout, r.f), null);
    assert.deepEqual({ action: r.f.action, x: r.f.x, z: r.f.z, yaw: r.f.yaw }, was);
    assert.equal(r.f.down, 1);
    // (fought again from the start: the same, frame for frame)
    const again = run(entry);
    assert.deepEqual(again.frames.map(k => [k.doing, k.head, k.at && k.at.Hips]), r.frames.map(k => [k.doing, k.head, k.at && k.at.Hips]));
  });

test('a match counts a man knocked out cold to ten: he does not get up', () => {
  const match = createMatch({ seed: 5 }),
    bout = match.bout,
    [a, b] = bout.fighters;
  a.x = -0.5;
  b.x = 0.5;
  settle(bout);
  b.hp = 0.05;
  const seen = [];
  for (let i = 0; i < 60 * 12 && match.phase !== 'over'; i++) {
    stepMatch(match, DT, [i === 0 ? { power: true } : {}, {}]);
    seen.push(...match.events);
  }
  const down = seen.find(e => e.type === 'hit' && e.down);
  assert.ok(down && down.out === 'outStiff', JSON.stringify(down));
  assert.ok(!seen.some(e => e.type === 'up'), 'he got up');
  assert.equal(match.result && match.result.how, 'KO');
  assert.equal(Math.max(...seen.filter(e => e.type === 'count').map(e => e.n)), 10);
});

/* ---- the rule. Two men a metre apart; the one hit has as much health as leaves the finishing blow so much to spare. */
function exchange(hp, inputs, secs) {
  const bout = createBout(3);
  bout.fighters[0].x = -0.5;
  bout.fighters[1].x = 0.5;
  settle(bout);
  bout.knockdowns = true;
  bout.fighters[1].hp = hp;
  const seen = [];
  for (let i = 0; i < Math.round((secs || 0.6) / DT); i++) {
    step(bout, inputs(i), DT);
    seen.push(...bout.events);
    bout.fighters[0].hp = 1000;
  }
  return { bout, hit: seen.find(e => e.type === 'hit' && e.on === 1), seen };
}
// (what the blow takes off him: his health before it, less after, with all the health in the world)
const takes = inputs => {
  const r = exchange(1000, inputs);
  return 1000 - r.bout.fighters[1].hp;
};

test('the rule: a finishing cross RULES.out or more past his health knocks him out cold, stiff; less is the ordinary knockdown', () => {
  const cross = i => [i === 0 ? { power: true } : {}, {}],
    d = takes(cross);
  assert.ok(d > RULES.out + 0.2, `the cross takes ${d.toFixed(2)}`);
  const under = exchange(d - (RULES.out - 0.1), cross),
    over = exchange(d - (RULES.out + 0.1), cross);
  assert.ok(under.hit.down && !under.hit.out, JSON.stringify(under.hit));
  assert.equal(under.bout.fighters[1].action.name, 'ko');
  assert.equal(over.hit.out, 'outStiff');
  assert.equal(over.bout.fighters[1].action.name, 'outStiff');
  // and with little to spare, a knee, as before
  assert.equal(exchange(d - 0.5, cross).bout.fighters[1].action.name, 'drop');
});

test('the rule: a hook RULES.out or more past his health knocks him out cold, limp; less is the ordinary knockdown', () => {
  const hook = LIMP,
    at = hp =>
      Object.assign({}, hook, {
        keep: (b, t) => {
          const f = b.fighters[0];
          if (t < 1.02) f.hp = 100;
          else if (t < 1.02 + DT + 1e-9) f.hp = hp;
        },
        loop: 1.7
      }),
    r = run(at(100)),
    d = r.taken;
  // (it did not put him down with all his health: what it took off him)
  assert.ok(d > RULES.out + 0.2, `the hook takes ${d}`);
  const under = run(at(d - (RULES.out - 0.1))),
    over = run(at(d - (RULES.out + 0.1)));
  assert.equal(under.f.action.name, 'slump');
  assert.equal(over.f.action.name, 'out');
});

test('the rule: a finisher that catches him throwing knocks him out cold, however little it has to spare; one he walks onto does not', () => {
  // he throws a cross, and the other man's jab, thrown after it, meets him with it on its way: a counter
  const counter = i => [i === 1 ? { jab: true } : {}, i === 0 ? { power: true } : {}],
    // the jab first, and his cross after it: he walks onto it
    walked = i => [i === 0 ? { jab: true } : {}, i === 1 ? { power: true } : {}];
  for (const [inputs, want] of [[counter, 'outStiff'], [walked, 'ko']]) {
    const d = takes(inputs),
      r = exchange(d - 1.5, inputs);
    assert.ok(r.hit && r.hit.name === 'jab' && r.hit.down, JSON.stringify(r.hit));
    assert.equal(r.bout.fighters[1].action.name, want, `${want}: ${JSON.stringify(r.hit)}`);
  }
});
