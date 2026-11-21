/* Blows to the body (docs/moves-plan-5.md §3.1, 3.2, 3.4, 3.5; the first stage of it, with no punches to the body yet: the
   punches there are, aimed at a place on the trunk, src/bodyshots.mjs):
     the trunk     where a point on it is (liver, solar, ribs, body) is read in the chest's own terms and between the joints,
                   so a man bent over reads the same; nothing below the hips is a target, and a point at the head is not on it
     judged        the same hook from the same place lands on the head aimed at the head, and on the trunk aimed at it; a
                   punch to the body is met by the elbows and forearms; nothing to the body reports a place below the hips
     folded        85 N·s in the pit of the stomach folds the chest 13 degrees and more, brings the head 5 cm and more
                   forward and down and the gloves 5 cm and more down, the trunk first, then the hips, then the head; on the
                   liver he bends down toward it, the hips going the other way
     health, breath   a blow to the body takes 55 to 65% of the health the same blow to the head takes, and breath that one
                   to the head does not, the liver most, then the pit of the stomach, then the ribs
     the liver     70 N·s and more on it: still up at 0.4 s (the hips not 8 cm below his guard's), a knee on the canvas 0.70 to
                   0.85 s after it, up again off the knee, breath cut to 30%; 69 N·s is not a knockdown, nor are two lighter
                   ones, but a third inside ten seconds is; nothing to the body knocks a man out cold, and a match counts the
                   liver down and lets him up with the health he had
     the elbow     a guard held up meets a hook aimed at the liver with an elbow or a forearm (2 and up; a beginner's is
                   hit), the other glove at his head; each grade brings the elbow down the sooner the better he is, a
                   beginner never, a man holding the cross-arm guard never; an amateur brings both down and his head is
                   open to a jab after it that a pro's guard stops
     the body      every body-shot script within the physics audit; the same script, the same result
   And the punches to the body themselves (stage two, §3.3, §3.7, src/ladder.mjs BODY_LADDER) and the rear hook (§3.8, §4A.7):
     landed        each body punch at every grade from its range on his trunk between his hips and his chest, the liver hook
                   on the liver; the same press lands on his head, and asked for the body, on his trunk
     harder        grade by grade (a great one's straight body punch as hard as a pro's give or take a tenth); the pro's liver
                   hook 80 N·s and more, 0.17 to 0.22 s after the press
     the way down  his head at the liver hook's contact as far down as his grade's table says (±3 cm), the knees' share 1 < 2 < 3
     decide        a press for the body is the body punch of the one it would have been; a press naming a punch is that punch
     the elbow     read off the way down: against the pro's liver hook a pro and better get it there, an amateur is late, a
                   beginner never, the cross-arm guard meets it; a pro who waited 0.2 s would be hit
     the rear hook every grade lands it on the head from 0.80 m, and one that puts him down lays him to his right; the shoulder
                   roll's counter presses it
     audited       every rung and card of them within the physics audit */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, settle, RULES } from '../src/game/bout.mjs';
import { createMatch, stepMatch } from '../src/game/match.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { BODYSHOTS, shot, aimAt } from '../src/bodyshots.mjs';
import { audit, measure } from '../src/audit.mjs';
import { createAnimator } from '../src/anim/animator.mjs';
import { LEVEL, LEVELS, CROSS } from '../src/anim/skill.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import { where, middle, aimed, balls, TRUNK } from '../src/game/trunk.mjs';
import { BODY_LADDER, REAR_LADDER } from '../src/ladder.mjs';
import { LIVER_BLOCK } from '../src/bodyshots.mjs';
import { guardOf } from '../src/measure.mjs';
import { createBout, local } from '../src/game/bout.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';

const DT = 1 / 60,
  DEG = 180 / Math.PI,
  card = id => BODYSHOTS.find(e => e.id === id);

// one loop of a script: every event (with the step it came on and where on his trunk it met him), and what each step had
function run(entry, each) {
  const bout = freshBout(entry),
    events = [];
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    for (const e of bout.events) {
      const spot = e.at && (e.part === 'body' || e.type === 'block') ? where(bout.fighters[0].points, e.at) : null;
      events.push(Object.assign({ tick, t: (tick + 1) * DT, spot }, e));
    }
    if (each) each(bout, tick);
  }
  return { bout, events };
}
const blows = r => r.events.filter(e => e.who === 1 && ['hit', 'block', 'graze', 'whiff'].includes(e.type));
const M_sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/* ---- the trunk */
test('trunk: each place\'s middle reads as that place, standing or bent over; below the hips is nothing, the head is not on it', () => {
  for (const bent of [false, true]) {
    const bout = freshBout({ me: () => HOME });
    // (bent over: down under a punch, half way into a duck)
    if (bent) for (let i = 0; i < 18; i++) step(bout, [i ? {} : { duck: true }, {}], DT);
    const p = bout.fighters[0].points;
    for (const zone of ['liver', 'solar', 'ribs']) {
      assert.equal(where(p, middle(p, zone)).zone, zone, `${zone}${bent ? ' (bent)' : ''}`);
      assert.equal(aimed(p, middle(p, zone, 0.05)), zone);
    }
    assert.equal(where(p, middle(p, [1.5, 0])).zone, 'body');
    assert.equal(where(p, middle(p, [1.5, 160])).zone, 'body');
    assert.equal(where(p, M_sub(p.hips, [0, 0.08, 0])), null, 'below the hips');
    assert.equal(aimed(p, bout.fighters[0].points.head), null, 'the head');
    assert.equal(balls(p).length, TRUNK.balls);
  }
});

/* ---- judged */
test('judged: the same hook from the same place lands on his head aimed at it, and on his trunk aimed at the pit of his stomach', () => {
  const body = card('body-solar'),
    head = Object.assign({}, body, { keep: () => {} }),
    // (his chain started at the hook, as the script does it, but the aim left to the bout: at his head)
    plain = shot({ id: 'plain', punch: body.punch, gap: body.gap, loop: body.loop, zone: 'solar', keep: b => b.fighters[1].action && MOVES[b.fighters[1].action.name].punch && (b.fighters[1].action.aim = null) }),
    h = blows(run(plain))[0],
    b = blows(run(body))[0];
  assert.ok(h && h.type === 'hit' && h.part === 'glove' && !h.zone, JSON.stringify(h));
  assert.ok(b && b.type === 'hit' && b.part === 'body' && b.zone === 'solar', JSON.stringify(b));
  assert.ok(head);
});

test('judged: each place is reached (pit of the stomach, liver, ribs) and the event carries the trunk for the effects', () => {
  for (const [id, zone] of [['body-solar', 'solar'], ['body-liver', 'liver'], ['body-ribs', 'ribs']]) {
    const e = blows(run(card(id))).find(e => e.type === 'hit');
    assert.ok(e && e.part === 'body' && e.zone === zone, `${id}: ${JSON.stringify(e)}`);
    assert.ok(e.trunk && e.trunk.at.length === 3 && e.trunk.to.length === 3 && e.trunk.r === TRUNK.spray, 'the part to spray off');
    assert.ok(e.trunk.to[1] > e.trunk.at[1] + 0.1, 'from the waist up to the chest');
    assert.ok(e.at && e.vec && e.J > 30, `${id}: ${e.J} N·s`);
  }
});

test('judged: nothing to the body says it met him below his hips, aimed there or anywhere', () => {
  const low = shot({ id: 'low', punch: ['hook', 0.6], gap: 0.85, loop: 2, aim: [-0.6, 0] }),
    all = [...BODYSHOTS, low].flatMap(e => blows(run(e)));
  for (const e of all) if (e.part === 'body' || e.part === 'elbow' || e.part === 'forearm') assert.ok(e.spot && e.spot.k >= 0, JSON.stringify(e));
});

/* ---- folded. A struck body against the same man not struck (as tests/hits.test.mjs measures a blow to the head). */
const col = (m, i) => [m[i], m[3 + i], m[6 + i]];
function folded(hit) {
  const a = createAnimator(0),
    b = createAnimator(0),
    view = { move: [0, 0], turn: 0, cover: 0, action: null };
  for (let i = 0; i < 90; i++) a.update(view, DT), b.update(view, DT);
  a.strike(Object.assign({ stun: 0.2, hp: 100 }, hit));
  const out = { fold: 0, side: 0, head: 0, gloves: 0, hipsBack: 0, hipsAcross: 0, onset: {} },
    first = (k, t, v, at) => out.onset[k] === undefined && v > at && (out.onset[k] = t);
  for (let i = 1; i <= 60; i++) {
    const pa = a.update(view, DT),
      pb = b.update(view, DT),
      A = fk(pa),
      B = fk(pb),
      t = i * DT,
      up = [col(A.R.Chest, 1), col(B.R.Chest, 1)],
      fold = (Math.atan2(up[0][2], up[0][1]) - Math.atan2(up[1][2], up[1][1])) * DEG,
      side = (Math.atan2(up[0][0], up[0][1]) - Math.atan2(up[1][0], up[1][1])) * DEG,
      // (the head's own nod on the chest: what of the head's going is the head's)
      nod = (Math.atan2(col(A.R.Head, 2)[1], col(A.R.Head, 2)[2]) - Math.atan2(col(A.R.Chest, 2)[1], col(A.R.Chest, 2)[2]) - Math.atan2(col(B.R.Head, 2)[1], col(B.R.Head, 2)[2]) + Math.atan2(col(B.R.Chest, 2)[1], col(B.R.Chest, 2)[2])) * DEG,
      dh = M_sub(pa.head, pb.head),
      gloves = Math.min(pb.at.LeftHand[1] - pa.at.LeftHand[1], pb.at.RightHand[1] - pa.at.RightHand[1]);
    out.fold = Math.max(out.fold, fold);
    out.side = Math.max(out.side, Math.abs(side) * Math.sign(-side * (hit.a || 0) || 1));
    out.head = Math.max(out.head, Math.hypot(Math.max(0, dh[2]), Math.max(0, -dh[1])) * 100);
    out.gloves = Math.max(out.gloves, gloves * 100);
    out.hipsBack = Math.max(out.hipsBack, (pb.at.Hips[2] - pa.at.Hips[2]) * 100);
    out.hipsAcross = Math.max(out.hipsAcross, (pa.at.Hips[0] - pb.at.Hips[0]) * 100 * Math.sign(hit.a || 1));
    first('trunk', t, Math.abs(fold) + Math.abs(side), 0.3);
    first('hips', t, Math.hypot(pa.at.Hips[0] - pb.at.Hips[0], pa.at.Hips[2] - pb.at.Hips[2]) * 100, 0.2);
    /* (the head's own nod, chin down: the trunk's fold tips the neck back at first, to keep his eyes level, and the head
       going on down after it is the head's own: from the furthest back it has been) */
    out.back = Math.min(out.back ?? 0, -nod);
    first('head', t, -nod - out.back, 0.3);
  }
  return out;
}
test('folded: 85 N·s in the pit of the stomach folds him forward round it, the trunk first, the hips and the head after it', () => {
  const r = folded({ J: 85, dir: [0, 0, -1], zone: 'solar', a: 0, k: 2.5 });
  assert.ok(r.fold >= 13, `the chest folded ${r.fold.toFixed(1)} degrees`);
  assert.ok(r.head >= 5, `the head ${r.head.toFixed(1)} cm forward and down`);
  assert.ok(r.gloves >= 5, `the gloves ${r.gloves.toFixed(1)} cm down`);
  assert.ok(r.hipsBack >= 3, `the hips ${r.hipsBack.toFixed(1)} cm back`);
  assert.ok(r.onset.trunk < r.onset.hips && r.onset.hips < r.onset.head, JSON.stringify(r.onset));
});
test('folded: on the liver he bends down toward it, the hips going the other way; harder is further', () => {
  const r = folded({ J: 85, dir: [-1, 0, 0], zone: 'liver', a: 75, k: 1.5 }),
    soft = folded({ J: 40, dir: [-1, 0, 0], zone: 'liver', a: 75, k: 1.5 });
  assert.ok(r.side >= 10, `bent ${r.side.toFixed(1)} degrees toward it`);
  assert.ok(r.hipsAcross >= 2, `the hips ${r.hipsAcross.toFixed(1)} cm the other way`);
  assert.ok(soft.side < r.side && soft.fold < r.fold, `${soft.side.toFixed(1)} < ${r.side.toFixed(1)}`);
});

/* ---- health and breath */
test('health and breath: the body takes 55 to 65% of the health the head does, and breath, the liver most', () => {
  const head = run(DEFENSE.find(e => e.id === 'hit-hook')).events.find(e => e.type === 'hit' && e.who === 1),
    of = id => blows(run(card(id))).find(e => e.type === 'hit'),
    [liver, solar, ribs] = ['body-liver', 'body-solar', 'body-ribs'].map(of),
    ratio = solar.damage / solar.J / (head.damage / head.J);
  assert.ok(ratio >= 0.55 && ratio <= 0.65, `health a newton-second, body against head: ${ratio.toFixed(2)}`);
  assert.equal(head.breath, undefined);
  const per = e => e.breath / e.J;
  assert.ok(per(liver) > per(solar) && per(solar) > per(ribs), `breath a newton-second: liver ${per(liver).toFixed(5)}, solar ${per(solar).toFixed(5)}, ribs ${per(ribs).toFixed(5)}`);
  // (85 N·s in the pit of the stomach: 12% of his breath, times 1.3)
  assert.ok(Math.abs((solar.breath * 85) / solar.J - RULES.body.breath * 1.3) < 0.002, String(solar.breath));
});

/* ---- the liver */
function liverDown(entry) {
  const out = { hit: null, standing: null, knee: null, up: false, guard: null, events: [], stamina: null, rose: null };
  let hipsGuard = null;
  const r = run(entry, (bout, tick) => {
    const f = bout.fighters[0],
      m = measure(f),
      t = (tick + 1) * DT;
    if (t < 0.5) hipsGuard = m.at.Hips[1];
    const e = bout.events.find(e => e.type === 'hit' && e.who === 1);
    if (e) (out.hit = e), (out.at = 0), (out.stamina = f.stamina / f.k.staminaMax);
    if (!out.hit || bout.stop > 0) return;
    out.at += DT;
    if (Math.abs(out.at - RULES.body.late) < DT / 2) out.standing = m.at.Hips[1] - hipsGuard;
    if (out.knee === null && f.action && f.action.name === 'dropLiver' && m.at.RightShin[1] < 0.065) out.knee = out.at;
    if (f.action && f.action.name === 'riseLiver') out.rose = true;
    if (out.rose && !f.action && !f.down) out.up = true;
  });
  out.events = r.events;
  return out;
}
test('the liver: 70 N·s and more on it, still up at 0.4 s, a knee down 0.70 to 0.85 s after it, up again; never out cold', () => {
  const r = liverDown(card('down-liver')),
    e = r.hit;
  assert.ok(e.zone === 'liver' && e.J >= RULES.body.liver && e.liver && e.down && !e.out, JSON.stringify(e));
  assert.ok(r.standing > -0.08, `the hips ${(r.standing * 100).toFixed(1)} cm from his guard's at 0.4 s`);
  assert.ok(r.knee >= 0.7 && r.knee <= 0.85, `a knee on the canvas ${r.knee && r.knee.toFixed(3)} s after it`);
  assert.ok(r.stamina <= RULES.body.spent + 1e-9, `breath ${r.stamina.toFixed(2)}`);
  assert.ok(r.events.some(e => e.type === 'buckle' && e.who === 0), 'his legs went');
  assert.ok(r.rose && r.up, 'he got up off the knee and back into his guard');
});
test('the liver: 69 N·s is not a knockdown; two lighter ones are not, and a third inside ten seconds is', () => {
  const just = shot(Object.assign({}, card('down-liver'), { id: 'liver-69', keep: null, setup: b => ((b.knockdowns = true), (b.fighters[1].k.power = 0.87)) })),
    e = blows(run(just)).find(e => e.type === 'hit');
  assert.ok(e.zone === 'liver' && e.J < RULES.body.liver && e.J > 60 && !e.down, JSON.stringify(e));
  // (the same light liver hook three times, two seconds apart, his own cross opening him each time)
  const at = [0.6, 2.6, 4.6],
    three = Object.assign({}, card('body-liver'), {
      id: 'liver-three', loop: 6, setup: b => ((b.knockdowns = true), (b.fighters[1].k.power = 0.66)),
      press: at.map(t => [t + 2 * DT, 'power']), against: at.map(t => [t, 'power']),
      keep: (bout, t) => {
        const b = bout.fighters[1];
        if (at.some(a => Math.abs(t - a) < DT / 2)) (b.link = 0), (b.lastPower = true), (b.sinceLast = 0);
        aimAt(card('body-liver').aim, 'hook')(bout, t);
      }
    }),
    hits = blows(run(three)).filter(e => e.type === 'hit');
  assert.equal(hits.length, 3, JSON.stringify(hits));
  assert.ok(hits.every(e => e.zone === 'liver' && e.J < RULES.body.liver), hits.map(e => e.J).join(', '));
  assert.ok(!hits[0].down && !hits[1].down && hits[2].down && hits[2].liver, hits.map(e => `${e.J}${e.down ? ' down' : ''}`).join(', '));
});
test('the body: a blow there that empties his health puts him on a knee, never out cold', () => {
  // (his health all but gone just before it lands: as the knockdown scripts do it, src/defense.mjs)
  const finish = shot(Object.assign({}, card('body-ribs'), { id: 'ribs-finish', setup: b => (b.knockdowns = true), keep: (b, t) => Math.abs(t - 0.733) < DT / 2 && (b.fighters[0].hp = 0.05) })),
    r = run(finish),
    e = r.events.find(e => e.type === 'hit' && e.who === 1);
  assert.ok(e.down && e.part === 'body' && !e.out, JSON.stringify(e));
  assert.ok(r.events.every(e => !e.out));
});
test('the liver: a match counts it as a knockdown, and he gets up with the health he had', () => {
  const entry = shot(Object.assign({}, card('down-liver'), { id: 'liver-match', keep: null, setup: null })),
    match = createMatch({ seed: 5 }),
    bout = match.bout,
    [a, b] = bout.fighters;
  [a.x, a.z] = HOME;
  [b.x, b.z] = [HOME[0] + entry.gap, HOME[1]];
  settle(bout);
  const seen = [];
  let before = null;
  for (let tick = 0; tick < 60 * 10 && match.phase !== 'over'; tick++) {
    const inputs = drive(entry, bout, tick * DT, DT);
    if (match.phase === 'fight' && !before) before = a.hp;
    stepMatch(match, DT, inputs);
    seen.push(...match.events);
    if (seen.some(e => e.type === 'up') && match.phase === 'fight') break;
  }
  const hit = seen.find(e => e.type === 'hit' && e.down);
  assert.ok(hit && hit.liver && hit.on === 0, JSON.stringify(hit));
  assert.ok(seen.some(e => e.type === 'down' && e.who === 0) && seen.some(e => e.type === 'up' && e.who === 0), seen.map(e => e.type).join(' '));
  assert.ok(a.hp >= before - hit.damage - 1e-6 && a.hp > 0, `health ${a.hp.toFixed(1)}, had ${before}`);
  assert.notEqual(match.phase, 'over');
});

/* ---- the elbow */
test('the elbow: a guard held up meets a hook aimed at the liver with an elbow or a forearm, the other glove at his head', () => {
  for (const lv of ['2', '3', '4m', '5m']) {
    let gap = null;
    const r = run(card(`block-elbow@${lv}`), bout => {
        const f = bout.fighters[0];
        if (bout.events.some(e => e.type === 'block')) gap = Math.hypot(...M_sub(f.points.L, f.points.head)) - RULES.glove - RULES.head;
      }),
      e = blows(r)[0];
    assert.ok(e.type === 'block' && (e.part === 'elbow' || e.part === 'forearm') && e.zone === 'liver', `${lv}: ${JSON.stringify(e)}`);
    assert.ok(gap <= 0.04, `${lv}: the other glove ${(gap * 100).toFixed(1)} cm off his head`);
  }
  const e = blows(run(card('block-elbow@1')))[0];
  assert.ok(e.type === 'hit' && e.part === 'body', `1: ${JSON.stringify(e)}`);
});

/* his guard up and a punch at his liver seen so many seconds ago: when his rear elbow has come 5 cm down, and how far it goes
   (cross: the cross-arm guard he holds, if he carries it, as the bout tells his body: game/bout.mjs crossOf; by default the
   dirty great ones carry it) */
const carried = lv => (lv === '4a' || lv === '5a' ? CROSS[lv] : null);
function lowered(level, zone, cross = null) {
  const a = createAnimator(0),
    b = createAnimator(0),
    view = { move: [0, 0], turn: 0, cover: 1, action: null, guard: level, stance: level, cross };
  for (let i = 0; i < 90; i++) a.update(view, DT), b.update(view, DT);
  const out = { at: null, most: 0, gap: -1 };
  for (let i = 1; i <= 45; i++) {
    const pa = a.update(Object.assign({}, view, i <= 8 ? { low: { zone, t: i * DT, id: 'p' } } : {}), DT),
      pb = b.update(view, DT),
      drop = pb.at.RightForeArm[1] - pa.at.RightForeArm[1];
    if (out.at === null && drop > 0.05) out.at = i * DT;
    if (drop > out.most) (out.most = drop), (out.y = pa.at.RightForeArm[1]);
  }
  return out;
}
test('the elbow: brought down the sooner the better he is; a beginner never, nor a man holding the cross-arm guard', () => {
  const at = Object.fromEntries(LEVELS.map(lv => [lv, lowered(LEVEL[lv], 'liver', carried(lv))]));
  assert.equal(at['1'].at, null, 'a beginner');
  assert.ok(at['2'].at > at['3'].at && at['3'].at > at['4m'].at && at['4m'].at > at['5m'].at, LEVELS.map(lv => `${lv} ${at[lv].at}`).join(', '));
  for (const lv of ['4a', '5a']) assert.equal(at[lv].at, null, `${lv}: his cross-arm guard`);
  // (a dirty great one without the cross-arm guard brings it down as the clean one does)
  for (const [d, m] of [['4a', '4m'], ['5a', '5m']]) {
    const got = lowered(LEVEL[d], 'liver', null).at;
    assert.ok(got !== null && Math.abs(got - at[m].at) <= 2 * DT + 1e-9, `${d} without the cross-arm guard: ${got} against ${at[m].at}`);
  }
  // (a pro's: down to his side over the liver, ten centimetres and more)
  assert.ok(at['3'].most >= 0.1, `${(at['3'].most * 100).toFixed(1)} cm`);
});
test('the elbow: an amateur brings both arms down, and a jab after it finds his head; a pro\'s guard stops the same jab', () => {
  const jab = lv => {
    const base = card(`block-elbow@${lv}`);
    return blows(run(Object.assign({}, base, { against: base.against.concat([[1.12, 'jab']]) }))).filter(e => e.name === 'jab')[0];
  };
  const two = jab('2'),
    three = jab('3');
  assert.ok(two && two.type === 'hit' && two.part === 'glove', `2: ${JSON.stringify(two)}`);
  assert.ok(three && three.type === 'block', `3: ${JSON.stringify(three)}`);
});

/* ---- the body shots as a whole */
test('the body: every body-shot script within the physics audit', () => {
  const { found, seen } = audit(BODYSHOTS);
  assert.ok(seen > 2000, `only ${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .map(([check, c]) => `${check}: ${c.bad} (${JSON.stringify(c.cases.slice(0, 3))})`);
  assert.deepEqual(broken, []);
});
test('the body: the same script is the same blow and the same fall', () => {
  const once = () => run(card('down-liver')).events.map(e => `${e.tick} ${e.type} ${e.J ?? ''} ${e.zone ?? ''}`);
  assert.deepEqual(once(), once());
});

/* ---- the punches to the body (stage two: docs/moves-plan-5.md §3.3, §3.7) and the rear hook (§3.8, §4A.7), on the body
   ladder (src/ladder.mjs: BODY_LADDER, REAR_LADDER): each punch at each grade from its range, at a man standing in his guard. */
// a rung: the blow (and when after the press), where on his trunk it met him, and his own head and hips against his guard's
const rungs = {};
function rungOf(id) {
  if (rungs[id]) return rungs[id];
  const entry = [...BODY_LADDER, ...REAR_LADDER].find(e => e.id === id),
    bout = freshBout(entry),
    [a, b] = bout.fighters,
    guard = guardOf(entry.level),
    out = { blow: null, spot: null, head: null, hips: null };
  let press = -1;
  for (let tick = 0; tick < Math.round(entry.loop / DT) && !out.blow; tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    b.hp = 1000;
    for (const e of bout.events) {
      if (e.type === 'punch' && e.who === 0 && press < 0) press = tick;
      if (e.who === 0 && ['hit', 'block', 'graze', 'whiff'].includes(e.type) && !out.blow) {
        out.blow = Object.assign({ s: (tick - press) * DT }, e);
        out.spot = e.at ? where(b.points, e.at) : null;
        out.head = guard.headY - a.points.head[1];
        out.hips = guard.hipsY - a.pose.at.Hips[1] * a.pose.stretch;
      }
    }
  }
  return (rungs[id] = out);
}
const LOWS = ['jabBody', 'crossBody', 'hookBody', 'upperBody'];

test('body punches: every grade lands each from its range on his trunk, between his hips and the top of his chest; the liver hook on his liver', () => {
  for (const p of LOWS)
    for (const lv of LEVELS) {
      const { blow, spot } = rungOf(`${p}@${lv}`);
      assert.ok(blow && blow.type === 'hit' && blow.part === 'body' && blow.name === p, `${p}@${lv}: ${JSON.stringify(blow)}`);
      assert.ok(spot && spot.k >= 0 && spot.k <= 3.25, `${p}@${lv}: met him at ${JSON.stringify(spot)}`);
      // (the liver hook on the liver at every grade; the rest where his guard leaves his trunk open: measured, README)
      if (p === 'hookBody') assert.equal(blow.zone, 'liver', `${p}@${lv}`);
      else assert.ok(['solar', 'body', 'ribs'].includes(blow.zone), `${p}@${lv}: ${blow.zone}`);
    }
});

test('body punches: the same press from the same place lands on his head, and asked for the body, on his trunk', () => {
  for (const [press, gap, name] of [[{ jab: true }, 1.0, 'jabBody'], [{ power: true }, 0.98, 'crossBody']]) {
    const blow = body => {
      const bout = createBout(5, { skills: [{}, { stance: '2' }] });
      bout.fighters[0].x = -gap / 2;
      bout.fighters[1].x = gap / 2;
      bout.fighters[1].hp = 1000;
      settle(bout);
      for (let i = 0; i < 60; i++) {
        step(bout, [i === 0 ? Object.assign({ body }, press) : {}, {}], DT);
        const e = bout.events.find(e => e.who === 0 && ['hit', 'block', 'graze', 'whiff'].includes(e.type));
        if (e) return e;
      }
      return null;
    };
    const head = blow(false),
      body = blow(true);
    assert.ok(head && head.type === 'hit' && head.part === 'glove' && !head.zone, `${JSON.stringify(press)}: ${JSON.stringify(head)}`);
    assert.ok(body && body.type === 'hit' && body.part === 'body' && body.name === name, `${JSON.stringify(press)} for the body: ${JSON.stringify(body)}`);
  }
});

test("body punches: harder grade by grade; the pro's liver hook 80 N·s and more, landing 0.17 to 0.22 s after the press", () => {
  for (const p of [...LOWS, 'hookR']) {
    const J = lv => rungOf(`${p}@${lv}`).blow.J;
    for (const [lo, hi] of [['1', '2'], ['2', '3']]) assert.ok(J(hi) > J(lo), `${p}: ${lo} ${J(lo)} < ${hi} ${J(hi)}`);
    /* (a great one's swung or lifted punch to the body is harder again; his straight one, thrown down at a trunk a little
       closer than a head, comes out as hard as a pro's give or take a tenth: README, known limits) */
    if (p === 'jabBody' || p === 'crossBody') for (const lv of ['4m', '4a', '5m', '5a']) assert.ok(J(lv) >= 0.9 * J('3'), `${p}: ${lv} ${J(lv)} against a pro's ${J('3')}`);
    else for (const [lo, hi] of [['3', '4m'], ['4m', '5m'], ['3', '4a'], ['4a', '5a']]) assert.ok(J(hi) > J(lo), `${p}: ${lo} ${J(lo)} < ${hi} ${J(hi)}`);
  }
  const pro = rungOf('hookBody@3').blow;
  assert.ok(pro.J >= 80, `${pro.J} N·s`);
  assert.ok(pro.s >= 0.17 - 1e-9 && pro.s <= 0.22 + 1e-9, `${pro.s.toFixed(3)} s`);
});

test("the way down: at the contact of the liver hook his head is as far down as his grade goes (±3 cm), and the knees' share 1 < 2 < 3", () => {
  // (docs/moves-plan-5.md §3.7: the head's way down at the liver hook, centimetres, from his own guard)
  const TABLE = { 1: 12, 2: 13, 3: 15, '4m': 15, '4a': 9, '5m': 15, '5a': 9 },
    share = lv => rungOf(`hookBody@${lv}`).hips / rungOf(`hookBody@${lv}`).head;
  for (const lv of LEVELS) {
    const head = rungOf(`hookBody@${lv}`).head * 100;
    assert.ok(Math.abs(head - TABLE[lv]) <= 3, `${lv}: the head ${head.toFixed(1)} cm down, the table ${TABLE[lv]}`);
  }
  assert.ok(share('1') < share('2') && share('2') < share('3'), ['1', '2', '3'].map(lv => `${lv} ${(share(lv) * 100).toFixed(0)}%`).join(', '));
  // (a pro's is most of it his knees: the plan's 65%)
  assert.ok(share('3') >= 0.55, `${(share('3') * 100).toFixed(0)}%`);
});

test('decide: a press for the body is the body punch of the one it would have been; a press that names a punch is that punch', () => {
  const thrown = (gap, presses) => {
    const bout = createBout(5);
    bout.fighters[0].x = -gap / 2;
    bout.fighters[1].x = gap / 2;
    // (he only takes it: a liver hook does not put him down and end the bout, bout.mjs f.stands)
    Object.assign(bout.fighters[1], { hp: 1000, stands: true });
    settle(bout);
    const names = [];
    for (let i = 0; i < 200 && names.length < presses.length; i++) {
      // (each press as soon as the last punch has been thrown: the power chain runs on)
      const f = bout.fighters[0],
        ready = !f.action || (!!f.action.chain && ['hold', 'recover', 'done'].includes(f.action.chain.phase));
      step(bout, [ready ? presses[names.length] : {}, {}], DT);
      for (const e of bout.events) if (e.type === 'punch' && e.who === 0) names.push(e.name);
    }
    return names;
  };
  assert.deepEqual(thrown(1.0, [{ jab: true, body: true }]), ['jabBody']);
  const B = { power: true, body: true };
  assert.deepEqual(thrown(0.98, [B, B, B]), ['crossBody', 'hookBody', 'upperBody']);
  // (right up close the power chain is the inside hook and the inside uppercut: to the body, the liver hook and the body uppercut)
  assert.deepEqual(thrown(0.66, [B, B]), ['hookBody', 'upperBody']);
  // (a press that is not for the body is the press it always was)
  assert.deepEqual(thrown(0.98, [{ power: true }, { power: true }]), ['cross', 'hook']);
  assert.deepEqual(thrown(0.8, [{ power: 'hookR' }]), ['hookR']);
});

test('the elbow block against the liver hook: read off the way down to it; a pro and better get the elbow there, an amateur is late, a beginner never', () => {
  for (const lv of LEVELS) {
    let gap = null;
    const r = run(LIVER_BLOCK.find(e => e.level === lv), bout => {
        const f = bout.fighters[0];
        if (bout.events.some(e => e.type === 'block' && e.who === 1)) gap = Math.hypot(...M_sub(f.points.L, f.points.head)) - RULES.glove - RULES.head;
      }),
      e = blows(r)[0];
    assert.ok(e && e.name === 'hookBody', `${lv}: ${JSON.stringify(e)}`);
    if (['3', '4m', '5m'].includes(lv)) {
      assert.ok(e.type === 'block' && (e.part === 'elbow' || e.part === 'forearm') && e.zone === 'liver', `${lv}: ${JSON.stringify(e)}`);
      assert.ok(gap <= 0.04, `${lv}: the other glove ${(gap * 100).toFixed(1)} cm off his head`);
      // (a dirty great one holds the cross-arm guard, the lead glove across his belly: the hook meets it, docs/moves-plan-5.md §4A.3)
    } else if (lv === '4a' || lv === '5a') assert.ok(e.type === 'block' && ['elbow', 'forearm', 'glove'].includes(e.part), `${lv}: ${JSON.stringify(e)}`);
    else assert.ok(e.type === 'hit' && e.part === 'body' && e.zone === 'liver', `${lv}: ${JSON.stringify(e)}`);
  }
  // (read off the way down, not off the hips firing: a pro whose elbow waited as long as that would be hit)
  const late = Object.assign({}, LEVEL['3'], { cover: Object.assign({}, LEVEL['3'].cover, { low: Object.assign({}, LEVEL['3'].cover.low, { delay: 0.2 }) }) }),
    base = LIVER_BLOCK.find(e => e.level === '3'),
    e = blows(run(Object.assign({}, base, { setup: b => (b.fighters[0].skills = { all: late }) })))[0];
  assert.ok(e.type === 'hit', `a pro's elbow 0.2 s after the way down shows: ${JSON.stringify(e)}`);
});

test('the rear hook: every grade lands it on his head from 0.80 m; down, he falls to his right', () => {
  for (const lv of LEVELS) {
    const { blow } = rungOf(`hookR@${lv}`);
    assert.ok(blow && blow.type === 'hit' && blow.part === 'glove' && blow.name === 'hookR' && blow.hand === 'R' && !blow.zone, `hookR@${lv}: ${JSON.stringify(blow)}`);
  }
  const pro = rungOf('hookR@3').blow;
  assert.ok(pro.J >= 85 && pro.s <= 0.22 + 1e-9, `${pro.J} N·s, ${pro.s.toFixed(3)} s`);
  // (his health all but gone as it lands: laid out, he goes the way the glove goes on through him, to his right)
  const entry = { id: 'down-rear', loop: 3, hurt: true, me: () => HOME, him: () => [HOME[0] + 0.8, HOME[1]], against: [[0.6, 'power', 'hookR']], setup: b => (b.knockdowns = true), keep: (b, t) => (b.fighters[0].hp = t < 0.7 ? 100 : Math.min(b.fighters[0].hp, 1.5)) },
    bout = freshBout(entry),
    f = bout.fighters[0];
  let hit = null,
    from = null,
    rest = null;
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    const e = bout.events.find(e => e.type === 'hit' && e.on === 0 && e.down);
    if (e && !hit) (hit = { e, yaw: f.yaw }), (from = measure(f).com);
    if (hit && f.action && MOVES[f.action.name].fall) rest = measure(f).com;
  }
  assert.ok(hit && hit.e.name === 'hookR' && rest, JSON.stringify(hit && hit.e));
  const moved = local({ yaw: hit.yaw }, rest[0] - from[0], rest[2] - from[2]);
  assert.ok(moved[0] < -0.3 && Math.abs(moved[0]) > Math.abs(moved[1]), `moved [${moved.map(x => x.toFixed(2))}] (+ his left, + ahead)`);
});

test('the rear hook is what a shoulder roll winds up: the roll counter presses it by name, the rear uppercut right up close', () => {
  assert.deepEqual(TECHNIQUES.rollCounter.counter({ far: 0.9 }), { power: 'hookR', tech: 'rollCounter' });
  assert.deepEqual(TECHNIQUES.rollCounter.counter({ far: 0.7 }), { power: 'upperIn', tech: 'rollCounter' });
});

test("body punches: every rung of them, the rear hook's and the elbow block against the liver hook, within the physics audit", () => {
  const { found, seen } = audit([...BODY_LADDER, ...REAR_LADDER, ...LIVER_BLOCK]);
  assert.ok(seen > 4000, `only ${seen} frames`);
  const broken = Object.entries(found)
    .filter(([, c]) => c.bad)
    .map(([check, c]) => `${check}: ${c.bad} (${JSON.stringify(c.cases.slice(0, 3))})`);
  assert.deepEqual(broken, []);
});
