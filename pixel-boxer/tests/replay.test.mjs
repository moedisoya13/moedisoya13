/* How a knockdown is shown (docs/moves-plan-6.md §2.4D, the user's instruction of 2026-11-24; src/replay.mjs): live at the
   true speed, all the way down, and then a brief slow replay from a closer camera. Held on the eight knockdown cards of the
   motion catalogue, fought as the catalogue fights them, with the effects the catalogue draws run beside them a step at a
   time (render/blow.mjs, render/fx.mjs) so that the replay can wait for them:
     it starts only once everything the blow and the landing threw has gone out (no mote, glob or ember of it, no ripple on
     either man, the ring through the canvas over), a beat (FALL.beat) after that, and once he is all but still; at the
     latest FALL.most after the blow (no card waits that long); at the times the table says;
     it plays from the press of the punch that put him down (or FALL.windup before the blow, if that was longer ago) to
     FALL.end after the blow, or FALL.clear steps before he comes down if that is sooner: it ends before any part of him is
     near the canvas, on every card, so it throws again the blow's motes and ripple but never the landing's;
     at half the speed to FALL.pace.ease before the blow, easing to a quarter by the blow, and a quarter on, in about two
     seconds of real time (the table), every step it keeps come to once and in order, no picture twice running, no joint
     turned further in a picture than the pace times what that step of the bout turned it;
     from the camera the stated rule picks (viewOf): from above for a blow whose way as it lands is across the line between
     them (the hooks, the liver hook among them), from the side the punching arm does not cover for one along it (the
     straights, the jab, the uppercut), the other side if the blow cannot be seen from there; the glove that landed and the
     part of him it landed on seen in it, past both men's bodies;
     a key, a tap or a button skips it (skip): it is over at once, and the bout goes on from where it stood;
     and one switch (FALL.of) narrows it to the knockdowns that end the match (out cold, here). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplay, FALL, paceOf } from '../src/replay.mjs';
import { blow, rippleOf, fallOf, landed, landRipple, groundOf, landingOf, quietOf, FX } from '../src/render/blow.mjs';
import { createFx } from '../src/render/fx.mjs';
import { fk, NAMES } from '../src/rig/skeleton.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { BODYSHOTS } from '../src/bodyshots.mjs';

const DT = 1 / 60,
  CARDS = ['down-back', 'down-front', 'down-side', 'down-knee', 'down-liver', 'out-twist', 'out-log', 'out-limp'];
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* A knockdown card fought as the catalogue fights it, with the effects the catalogue draws (each man's motes, the ripples,
   the ring) moved on a step at a time beside it, and watched by a replay (o: its options) until it starts: the times of the
   press, the blow, the landing, the effects going out, his being all but still and the start (the bout's), the steps of the
   bout (t, and the struck man as he was), and the replay, playing. */
function card(id, o = {}) {
  const entry = [...DEFENSE, ...BODYSHOTS].find(e => e.id === id),
    bout = freshBout(entry),
    rnd = dice(7),
    motes = [createFx(rnd), createFx(rnd)],
    ripples = [null, null],
    r = createReplay(Object.assign({ yaw: () => entry.view.yaw }, o)),
    out = { entry, r, steps: [], press: null, blow: null, on: null, land: null, quiet: null, start: null };
  let ground = null,
    fall = null;
  for (let i = 0; i < Math.round(entry.loop / DT) && !r.playing; i++) {
    motes.forEach(f => f.update(DT));
    ripples.forEach(x => x && (x.age += DT));
    if (ground) ground.age += DT;
    step(bout, drive(entry, bout, i * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    for (const e of bout.events) {
      if (e.type === 'punch' && e.who === 1) out.press = { t: bout.t, name: e.name };
      if (e.type === 'hit') {
        blow(motes[e.on], e, bout.fighters[e.on]);
        ripples[e.on] = rippleOf(e, bout.fighters[e.on]);
        if (fallOf(e)) (fall = fallOf(e)), (out.blow = bout.t), (out.on = e.on), (out.hit = e);
      }
    }
    if (fall) {
      const l = landed(fall, bout.fighters[fall.on]);
      if (l) (out.land = bout.t), (ripples[fall.on] = landRipple(fall, bout.fighters[fall.on], l)), (ground = groundOf(fall, l));
    }
    const quiet = quietOf(motes, ripples, ground);
    if (out.land !== null && bout.t > out.land + 1e-9 && quiet && out.quiet === null) out.quiet = bout.t;
    // (he goes on being drawn: nothing of what was thrown is quiet while any of it is left)
    if (out.quiet !== null) assert.ok(quiet, `${id}: nothing comes back once all has gone out`);
    if (r.awaiting) out.still = r.awaiting.stillAt;
    const m = bout.fighters[out.on === null ? 0 : out.on];
    out.steps.push({ t: bout.t, man: JSON.parse(JSON.stringify({ points: m.points, pose: { at: m.pose.at, stretch: m.pose.stretch }, place: m.place })) });
    if (r.watch(bout, DT, quiet)) out.start = bout.t;
  }
  return out;
}
// (the replay played out at 60 pictures a second of real time: each picture, and the steps it came to)
function play(r) {
  const pics = [],
    crossed = [];
  while (r.playing) {
    const snap = r.next(DT);
    crossed.push(...r.crossed);
    pics.push({ snap, moved: r.moved, view: r.view, progress: r.progress });
  }
  return { pics, crossed };
}

// the start, the span and the real time of each card's replay, as built (bout seconds from the blow; real seconds)
const TABLE = {
  'down-back': { start: 1.217, from: -0.133, to: 0.35, real: 1.75 },
  'down-front': { start: 1.183, from: -0.117, to: 0.35, real: 1.717 },
  'down-side': { start: 1.167, from: -0.15, to: 0.35, real: 1.783 },
  'down-knee': { start: 1.283, from: -0.133, to: 0.35, real: 1.75 },
  'down-liver': { start: 1.483, from: -0.15, to: 0.35, real: 1.783 },
  'out-twist': { start: 1.567, from: -0.15, to: 0.35, real: 1.783 },
  'out-log': { start: 1.45, from: -0.133, to: 0.35, real: 1.75 },
  'out-limp': { start: 1.883, from: -0.15, to: 0.35, real: 1.783 }
};
// the view the rule picks on each (and why: the way the blow lands, against the line between them)
const VIEWS = {
  'down-back': ['side', 'along'],
  'down-front': ['side', 'along-other'],
  'down-side': ['above', 'across'],
  'down-knee': ['side', 'along'],
  'down-liver': ['above', 'across'],
  'out-twist': ['above', 'across'],
  'out-log': ['side', 'along'],
  'out-limp': ['side', 'along']
};

const runs = Object.fromEntries(CARDS.map(id => [id, card(id)]));

test('a knockdown\'s replay starts only once everything it threw has gone out, a beat after, and he is all but still: the times on the eight cards, none at the cap', () => {
  assert.deepEqual([FALL.beat, FALL.still.speed, FALL.still.for, FALL.most], [0.15, 0.5, 0.2, 2.5]);
  for (const id of CARDS) {
    const c = runs[id];
    assert.ok(c.start !== null && c.r.playing, `${id}: it replays`);
    assert.ok(c.land !== null && c.quiet !== null, `${id}: he came down, and everything went out (+${(c.quiet - c.blow).toFixed(3)} s)`);
    assert.ok(c.start >= c.quiet + FALL.beat - 1e-9, `${id}: not before a beat after the last of it went out`);
    assert.ok(c.still !== null && c.start >= c.still - 1e-9, `${id}: not before he is all but still`);
    // (the later of the two, to the step)
    assert.ok(Math.abs(c.start - Math.max(c.quiet + FALL.beat, c.still)) < DT / 2, `${id}: at the later of the two (${(c.start - c.blow).toFixed(3)} s)`);
    assert.ok(c.start - c.blow < FALL.most - DT, `${id}: well before the cap`);
    assert.ok(Math.abs(c.start - c.blow - TABLE[id].start) < DT / 2, `${id}: ${(c.start - c.blow).toFixed(3)} s after the blow, as the table says (${TABLE[id].start})`);
  }
});

test('it shows from the press of the punch to a moment after the blow, and ends before any part of him comes down on the canvas, on every card', () => {
  assert.deepEqual([FALL.windup, FALL.end, FALL.clear], [0.5, 0.35, 3]);
  for (const id of CARDS) {
    const c = runs[id],
      { pics, crossed } = play(card(id).r),
      first = crossed[0],
      last = crossed[crossed.length - 1];
    assert.ok(c.press.name === c.hit.name && c.blow - c.press.t <= FALL.windup, `${id}: pressed ${(c.blow - c.press.t).toFixed(3)} s before the blow`);
    assert.ok(Math.abs(first.t - c.press.t) < 1e-9 && Math.abs(pics[0].snap.t - c.press.t) < 1e-9, `${id}: from the press (${(first.t - c.blow).toFixed(3)})`);
    const end = Math.min(c.blow + FALL.end, c.land - FALL.clear * DT);
    assert.ok(last.t <= end + 1e-9 && last.t > end - DT, `${id}: to ${(last.t - c.blow).toFixed(3)} s after the blow`);
    assert.deepEqual(pics[pics.length - 1].snap, last, `${id}: its last picture is that step`);
    assert.ok(last.t < c.land - 2 * DT, `${id}: ${((c.land - last.t) * 1000).toFixed(0)} ms before he comes down`);
    assert.deepEqual([+(first.t - c.blow).toFixed(3), +(last.t - c.blow).toFixed(3)], [TABLE[id].from, TABLE[id].to], `${id}: the span in the table`);
    // (nothing of him near the canvas in any of it, and so no landing kept with any step of it: no second ripple, no ring)
    for (const p of pics) assert.equal(landingOf(p.snap.men[c.on]), null, `${id}: at ${p.snap.t.toFixed(3)} nothing of him is within ${FX.land.near * 100} cm of the canvas`);
    assert.ok(crossed.every(k => !k.landed), `${id}: no landing in it`);
    // (and the blow is in it, to be thrown again: its lava and its ripple)
    assert.equal(crossed.filter(k => k.events.some(e => e.type === 'hit' && (e.down || e.out))).length, 1, `${id}: the blow is thrown again once`);
  }
});

/* What is drawn of a man, joint by joint: where each joint is in the world, and how each is turned (its local turn). */
const drawnOf = snap => snap.men.map(m => {
  const { p } = fk(m.pose);
  return { at: NAMES.map(n => toWorld(m.place, p[n], m.pose.stretch)), rot: NAMES.map(n => (m.pose.rot && m.pose.rot[n]) || [1, 0, 0, 0, 1, 0, 0, 0, 1]), place: m.place };
});
const angleOf = (A, C) => {
  const t = A[0] * C[0] + A[3] * C[3] + A[6] * C[6] + A[1] * C[1] + A[4] * C[4] + A[7] * C[7] + A[2] * C[2] + A[5] * C[5] + A[8] * C[8];
  return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2)));
};
const moved = (a, b) => {
  let far = 0,
    turned = 0;
  a.forEach((m, i) => {
    m.at.forEach((p, k) => (far = Math.max(far, Math.hypot(p[0] - b[i].at[k][0], p[1] - b[i].at[k][1], p[2] - b[i].at[k][2]))));
    m.rot.forEach((R, k) => (turned = Math.max(turned, angleOf(R, b[i].rot[k]))));
    turned = Math.max(turned, angleOf(m.place.R, b[i].place.R));
  });
  return { far, turned };
};

test('its speed: half to 0.1 s before the blow, easing to a quarter there, a quarter on; about two seconds of real time; smooth, no picture twice running', () => {
  assert.deepEqual(FALL.pace, { windup: 0.5, blow: 0.25, ease: 0.1 });
  // (the curve)
  assert.equal(paceOf(-1, 0), 0.5);
  assert.equal(paceOf(-0.1, 0), 0.5);
  assert.ok(Math.abs(paceOf(-0.05, 0) - 0.375) < 1e-12, 'halfway down the ease, halfway between');
  assert.equal(paceOf(0, 0), 0.25);
  assert.equal(paceOf(0.3, 0), 0.25);
  for (const id of CARDS) {
    const c = card(id),
      { pics, crossed } = play(c.r),
      real = (pics.length - 1) * DT;
    assert.ok(Math.abs(real - TABLE[id].real) < DT / 2, `${id}: ${real.toFixed(3)} s of real time, as the table says`);
    assert.ok(real >= 1.6 && real <= 2.5, `${id}: brief: ${real.toFixed(3)} s, 2.5 at most`);
    // (each picture moves the bout's time on by the pace at the one before it, times a sixtieth of a second; the last lands on the end)
    for (let n = 1; n < pics.length - 1; n++) assert.ok(Math.abs(pics[n].moved - DT * paceOf(pics[n - 1].snap.t, c.blow)) < 1e-9, `${id}: picture ${n} moved on at its pace`);
    assert.ok(pics[pics.length - 1].moved > 0 && pics[pics.length - 1].moved <= DT * 0.25 + 1e-9, `${id}: the last picture a little on from the one before`);
    // (every step from the first to the last come to once, in order: the held moment of the blow left out)
    const times = c.steps.map(s => +s.t.toFixed(9)).filter((t, k, all) => t >= crossed[0].t - 1e-9 && t <= crossed[crossed.length - 1].t + 1e-9 && all.indexOf(t) === k);
    assert.equal(crossed.length, times.length, `${id}: every step of it come to, once`);
    assert.ok(crossed.every((k, n) => Math.abs(k.t - times[n]) < 1e-9), `${id}: in order`);
    // (smooth: every picture on from the one before; a joint turned no further than the pace times what that step turned it)
    const drawn = pics.map(p => drawnOf(p.snap)),
      live = crossed.map(drawnOf);
    let least = Infinity;
    for (let n = 1; n < drawn.length; n++) {
      const m = moved(drawn[n - 1], drawn[n]),
        u = pics[n - 1].snap.t,
        // (the steps round the one picture and the next: what the bout turned in them, at most)
        k = crossed.findIndex((s, j) => j + 1 < crossed.length && crossed[j + 1].t > u + 1e-9),
        stepTurn = Math.max(...[k, k + 1].filter(j => j >= 0 && j + 1 < live.length).map(j => moved(live[j], live[j + 1]).turned));
      least = Math.min(least, m.far);
      assert.ok(m.turned <= stepTurn * paceOf(u, c.blow) * 1.0001 + 1e-6, `${id}: at ${u.toFixed(3)} a joint turns ${((m.turned * 180) / Math.PI).toFixed(2)}°, the step's ${((stepTurn * 180) / Math.PI).toFixed(2)}° at ${paceOf(u, c.blow)}`);
    }
    assert.ok(least > 1e-5, `${id}: no picture is the one before it again (the least a joint moved: ${(least * 1000).toFixed(2)} mm)`);
  }
});

test('its camera: from above for a blow that lands across the line between them, from the side its arm does not cover for one along it; the glove and what it met seen; cut to, closer, and cut back', () => {
  for (const id of CARDS) {
    const c = card(id),
      first = c.r.next(DT),
      v = c.r.view,
      steps = [...c.r.crossed, ...play(c.r).crossed];
    assert.ok(first && v, `${id}: its first picture has the camera`);
    assert.deepEqual([v.name, v.why], VIEWS[id], `${id}: ${v.name} (${v.why})`);
    assert.ok(v.seen && v.parts.contact > 0, `${id}: the glove that landed and the part of him it met seen at the blow`);
    assert.ok(Math.abs(v.pitch - (v.name === 'above' ? FALL.view.above : Math.min(...FALL.view.heights))) < 1e-12, `${id}: from ${v.name === 'above' ? 'above' : 'low at the side'}`);
    // (side on to the line between them)
    const at = steps.find(k => Math.abs(k.t - v.blow) < 1e-9),
      [a, b] = [at.men[v.hit.on], at.men[v.hit.who]],
      across = Math.sin(v.yaw) * (a.x - b.x) + Math.cos(v.yaw) * (a.z - b.z);
    assert.ok(Math.abs(across) < 1e-6 * Math.hypot(a.x - b.x, a.z - b.z) + 1e-9, `${id}: side on to the line between them`);
    // (from the side the punching arm does not cover: the side of his other hand, unless the blow cannot be seen from there)
    if (v.name === 'side') {
      const p = b.points,
        other = v.hit.hand === 'R' ? [p.LS[0] - p.RS[0], p.LS[2] - p.RS[2]] : [p.RS[0] - p.LS[0], p.RS[2] - p.LS[2]],
        toward = Math.sin(v.yaw) * other[0] + Math.cos(v.yaw) * other[1];
      assert.ok(v.why.endsWith('-other') ? toward < 0 : toward > 0, `${id}: on the side of his other hand${v.why.endsWith('-other') ? "'s other (the blow is not seen from there)" : ''}`);
    }
  }
  // (closer than the live camera, pushed in a little over it)
  assert.deepEqual([FALL.view.closer, FALL.view.push], [1.5, 0.05]);
});

test('a key, a tap or a button skips it: over at once, the bout going on from where it stood', () => {
  const c = card('down-back'),
    r = c.r;
  r.next(DT);
  r.next(DT);
  assert.ok(r.playing);
  r.skip();
  assert.ok(!r.playing && r.view === null && r.next(DT) === null, 'over at once');
  // (it watches the bout again as it goes on)
  const bout = freshBout(c.entry);
  step(bout, drive(c.entry, bout, 0, DT), DT);
  assert.equal(r.watch(bout, DT), false);
  assert.ok(!r.playing && !r.pending);
});

test('one switch narrows it to the knockdowns that end the match', () => {
  assert.equal(FALL.of, 'every');
  // (the catalogue's knockdowns are counted: one he gets up from does not end it, one out cold does)
  assert.equal(card('down-back', { fall: { of: 'ending' } }).start, null, 'down-back: none');
  assert.ok(card('out-log', { fall: { of: 'ending' } }).start !== null, 'out-log: replayed');
});
