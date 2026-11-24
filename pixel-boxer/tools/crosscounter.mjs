#!/usr/bin/env node
/* The cross counter, measured (docs/cross-counter-plan.md; stage Y). A pro's jab is thrown at 0.8 s from 1.0 m (the slip and
   counter cards' jab, src/defense.mjs) and the boxer presses his power punch, meant as the cross counter (the technique carried),
   `k` frames after the jab's press (`+k`: frames after the step the jab is pressed on; distances centre to centre).
     node tools/crosscounter.mjs                 the cards' table, grade by grade (§0.2): the window, the jab's miss, when the
                                                 punch lands and how far out the jab's arm is then, the impulse against the
                                                 grade's straight (src/measure.mjs rung), the head off the line at +6 and at the
                                                 contact, the elbow's height, and the arm against his (§3.5, §8.2)
     node tools/crosscounter.mjs --now           what the engine does at a jab without the cross counter, as the plan measured it
                                                 (§0.4, §2): the plain cross pressed at the jab (60 moments), the plain cross's
                                                 head frame by frame, the inside slip's head and window, the jab frame by frame,
                                                 the slip counter's landing, and which counter cards take the counter's gain
     node tools/crosscounter.mjs --trace lv k [gap foe corner]   one bout, frame by frame
     node tools/crosscounter.mjs --sweep [--root dir] [--out file] [--set grid|narrow]   §9.2's sweep, every bout held to the
                                                 audit's checks (src/audit.mjs auditor) and to §8.2's, fought by the checkout at
                                                 dir (by default this one: a checkout from before stage Y throws the plain cross)
     node tools/crosscounter.mjs --compare base.json new.json   the sweep against the base, case by case, by kind
   The arm against his (§8.2, held by tests/crosscounter.test.mjs and nothing else): his lead arm as his own other glove would
   meet it (rig/body.mjs gloveInArm: the upper arm, the elbow and the elbow's 80% of the forearm), the axes of the arms (from
   the shoulder to the elbow, and from the elbow to the wrist), the head's ball and the rear shoulder's (src/audit.mjs SOLID),
   over the frames the checks look at (not the frames held at a blow, nor the three after one). */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';

const DT = 1 / 60,
  AT = 0.8,
  P0 = Math.round(AT / DT) - 1, // (the step the jab's press is read on: +0)
  args = process.argv.slice(2),
  opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
export const GRADES = ['3', '4m', '4a', '5m', '5a'];

// ---- the engine of a checkout (this one by default)
export async function engine(root) {
  const src = f => import(pathToFileURL(resolve(root || new URL('..', import.meta.url).pathname, 'src', f)).href);
  const [bout, foot, audit, body, moves, measure] = await Promise.all(['game/bout.mjs', 'footwork.mjs', 'audit.mjs', 'rig/body.mjs', 'anim/moves.mjs', 'measure.mjs'].map(src));
  return { step: bout.step, freshBout: foot.freshBout, drive: foot.drive, HOME: foot.HOME, auditor: audit.auditor, measure: audit.measure, gloveInArm: body.gloveInArm, MOVES: moves.MOVES, rung: measure.rung, run: measure.run };
}

// ---- geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len = a => Math.hypot(a[0], a[1], a[2]);
// the closest two points of two segments: { d, s, t, a, b }
export function segseg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1),
    d2 = sub(q2, p2),
    r = sub(p1, p2),
    a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r),
    c = dot(d1, r),
    b = dot(d1, d2),
    den = a * e - b * b;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0,
    t = e > 1e-12 ? (b * s + f) / e : 0;
  if (t < 0) (t = 0), (s = a > 1e-12 ? Math.min(1, Math.max(0, -c / a)) : 0);
  else if (t > 1) (t = 1), (s = a > 1e-12 ? Math.min(1, Math.max(0, (b - c) / a)) : 0);
  const A = add(p1, scale(d1, s)),
    B = add(p2, scale(d2, t));
  return { d: len(sub(A, B)), s, t, a: A, b: B };
}
const segPoint = (p, a, b) => segseg(p, p, a, b);
const R = { glove: 0.1, head: 0.11, Arm: 0.06, ForeArm: 0.04 };

/* One bout: the other man's jab (or `punch`, by name) at AT from `gap`, and the boxer's power press at +k (null: none), meant as
   the cross counter ('over') or plain ('plain'). corner: the boxer's place in the bout (0 or 1). lv, foe: their grades (`all`).
   Both are walked to their spots until 0.3 s after the jab, and left where they are after. */
export function entryOf(E, o) {
  const bi = o.corner || 0,
    ji = 1 - bi,
    gap = o.gap ?? 1.0,
    at = o.at ?? AT,
    spots = [E.HOME, [E.HOME[0] + gap, E.HOME[1]]],
    mine = o.k === null || o.k === undefined ? [] : o.press === 'plain' ? [[at + o.k * DT, 'power', true]] : [[at + o.k * DT, 'power', true], [at + o.k * DT, 'tech', 'crossCounter']],
    his = o.throws || [[at, 'jab', o.punch && o.punch !== 'jab' ? o.punch : true]],
    presses = bi === 0 ? [mine, his] : [his, mine];
  return {
    id: o.id || `x@${o.lv}+${o.k}`,
    loop: o.loop || at + 1.0,
    me: t => (t > at + 0.3 ? null : spots[0]),
    him: t => (t > at + 0.3 ? null : spots[1]),
    press: presses[0],
    against: presses[1],
    setup: b => {
      b.fighters[bi].skills = { all: o.lv };
      b.fighters[bi].techniques = o.techniques || ['crossCounter'];
      b.fighters[ji].skills = { all: o.foe || '3' };
      if (o.setup) o.setup(b, bi, ji);
    }
  };
}

/* Fight it, frame by frame: what each man's joints are (src/audit.mjs measure), the events, what each is doing. */
export function trace(E, o) {
  const entry = entryOf(E, o),
    bout = E.freshBout(entry),
    bi = o.corner || 0,
    ji = 1 - bi,
    B = bout.fighters[bi],
    J = bout.fighters[ji],
    frames = [],
    au = o.audit ? E.auditor() : null,
    n = Math.round(entry.loop / DT);
  if (au) au.begin(entry);
  for (let tick = 0; tick < n; tick++) {
    const held = bout.stop > 0;
    E.step(bout, E.drive(entry, bout, tick * DT, DT), DT);
    if (!o.hurt) B.hp = Math.max(B.hp, 1000);
    J.hp = Math.max(J.hp, o.keep ? 0 : 1000);
    if (au) au.frame(bout, tick);
    frames.push({
      n: tick - P0,
      held,
      ev: bout.events.map(e => Object.assign({}, e, { mine: e.type === 'parry' ? e.on === bi : e.who === bi })),
      B: E.measure(B),
      J: E.measure(J),
      bp: JSON.parse(JSON.stringify(B.points)),
      jp: JSON.parse(JSON.stringify(J.points)),
      ba: B.action ? { name: B.action.name, id: B.action.id, phase: B.action.chain && B.action.chain.phase, q: B.action.chain && B.action.chain.q.slice(), peakAt: B.action.chain && B.action.chain.peakAt.slice(), crossing: B.action.crossing ? Object.assign({}, B.action.crossing) : null, cap: B.action.cap } : null,
      ja: J.action ? { name: J.action.name, id: J.action.id, phase: J.action.chain && J.action.chain.phase, q: J.action.chain && J.action.chain.q.slice(), aim: !!J.action.aim } : null,
      yaw: B.yaw,
      bx: [B.x, B.z],
      down: !!J.down
    });
  }
  return { frames, audit: au ? au.result() : null, bout };
}

// (a point in the boxer's own terms, from his place in the frame of the press: [to his left, up, ahead])
const localTo = (f0, p, yaw, at) => {
  const d = sub(p, at),
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [c * d[0] - s * d[2], d[1], s * d[0] + c * d[2]];
};

/* What a bout's frames say, the plan's numbers (cm, N·s, frames after the jab's press). */
export function summary(frames, o) {
  const out = { o: { lv: o.lv, k: o.k, gap: o.gap ?? 1, foe: o.foe || '3', corner: o.corner || 0 } },
    mineHit = (f, e) => e.mine && ['hit', 'graze', 'block'].includes(e.type),
    his = (f, e) => !e.mine && ['hit', 'graze', 'whiff', 'block', 'parry'].includes(e.type);
  let struck = 99;
  const f0 = frames.find(f => f.n === -1) || frames[0],
    head0 = f0.B.at.head,
    yaw = f0.yaw;
  // the jab: what became of it, and by how much it missed
  for (const f of frames)
    for (const e of f.ev) {
      if (his(f, e) && !out.jab) out.jab = { type: e.type, n: f.n, J: e.J, margin: e.margin != null ? +(e.margin * 100).toFixed(1) : null, brilliant: !!e.brilliant };
      if (mineHit(f, e) && !out.blow) out.blow = { type: e.type, n: f.n, name: e.name, J: e.J, speed: e.speed, mass: e.mass, counter: !!e.counter, damage: e.damage, part: e.part, zone: e.zone, vec: e.vec, down: !!e.down, out: e.out };
      if (e.type === 'whiff' && e.mine && !out.missed) out.missed = { n: f.n, name: e.name, margin: e.margin != null ? +(e.margin * 100).toFixed(1) : null };
      if (e.type === 'punch' && e.mine && !out.thrown) out.thrown = { n: f.n, name: e.name };
      if (e.type === 'brilliant' && e.who === (o.corner || 0)) out.brilliant = true;
    }
  // the punch he threw, and when it went (the cross counter waits for the jab's aim at 4 and 5)
  const went = frames.find(f => f.ba && f.ba.crossing && f.ba.crossing.go !== null);
  out.go = went ? went.n : null;
  const cf = out.blow ? frames.find(f => f.n === out.blow.n) : null;
  if (cf) {
    // (the jab's arm as it lands: glove from his shoulder; the elbow's height; which way the glove was going, up or down)
    out.blow.arm = +(len(sub(cf.J.at.gloveLeft, cf.J.at.LeftArm)) * 100).toFixed(1);
    out.blow.elbowY = +cf.B.at.RightForeArm[1].toFixed(3);
    out.blow.down = cf.ba === null ? null : undefined;
    out.blow.descends = out.blow.vec ? +out.blow.vec[1].toFixed(3) : null;
    const h = localTo(f0, cf.B.at.head, yaw, head0);
    out.blow.head = h.map(v => +(v * 100).toFixed(1)); // [left, up, ahead]
  }
  // the head: off the jab's way at +6 (the glove's path from the jab's press to its reach), left before ahead
  const path = frames.filter(f => f.n >= 0 && f.n <= 12 && f.ja && f.ja.name === (o.punch || 'jab')).map(f => f.J.at.gloveLeft),
    at6 = frames.find(f => f.n === 6);
  if (path.length > 1 && at6) {
    let d = Infinity;
    for (let i = 1; i < path.length; i++) d = Math.min(d, segPoint(at6.B.at.head, path[i - 1], path[i]).d);
    out.off6 = +(d * 100).toFixed(1);
  }
  const rows = frames.filter(f => f.n >= 0 && f.n <= 14).map(f => ({ n: f.n, h: localTo(f0, f.B.at.head, yaw, head0) }));
  const leftAt = rows.find(r => r.h[0] >= 0.2),
    aheadAt = rows.find(r => r.h[2] >= 0.1);
  out.leftFirst = { left20: leftAt ? leftAt.n : null, ahead10: aheadAt ? aheadAt.n : null };
  let step = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i].n >= 0 && frames[i].n <= 14 && !frames[i].held) step = Math.max(step, len(sub(frames[i].B.at.head, frames[i - 1].B.at.head)));
  out.headStep = +(step * 100).toFixed(1);
  // ---- the arm against his (§8.2): over the frames the checks look at
  const lim = { glove: -9, fore: 9, foreUp: 9, upper: 9, head: -9, shoulder: -9, gg: -9, ggFrames: 0, over: 9 };
  const goes = frames.filter(f => f.ba && (f.ba.name === 'crossOver' || f.ba.name === 'cross')),
    from = goes.length ? goes[0].n : null,
    to = goes.length ? goes[goes.length - 1].n : null;
  let jabDone = null;
  for (const f of frames) {
    for (const e of f.ev) if (['hit', 'block', 'parry'].includes(e.type)) struck = -1;
    struck++;
    const counted = !f.held && struck > 3;
    if (f.ja && f.ja.name === (o.punch || 'jab') && f.ja.phase !== 'throw' && f.ja.phase !== 'coil' && jabDone === null) jabDone = f.n;
    if (!f.ja && jabDone === null && f.n > 0 && frames.some(g => g.n < f.n && g.ja)) jabDone = f.n;
    const B = f.B.at,
      J = f.J.at;
    if (from !== null && f.n >= from && f.n <= to && counted) {
      const g = E_glove(B.gloveRight, J);
      lim.glove = Math.max(lim.glove, g.depth);
      lim.fore = Math.min(lim.fore, segseg(B.RightForeArm, B.RightHand, J.LeftForeArm, J.LeftHand).d);
      lim.foreUp = Math.min(lim.foreUp, segseg(B.RightForeArm, B.RightHand, J.LeftArm, J.LeftForeArm).d);
      lim.upper = Math.min(lim.upper, segseg(B.RightArm, B.RightForeArm, J.LeftForeArm, J.LeftHand).d);
      // (over his arm, seen from above: the glove's height over the axis where it is over it)
      for (const [a, b, most, need] of [[J.LeftForeArm, J.LeftHand, 0.8, 0.13], [J.LeftArm, J.LeftForeArm, 1, 0.15]]) {
        const bb = add(a, scale(sub(b, a), most)),
          flat = segseg([B.gloveRight[0], 0, B.gloveRight[2]], [B.gloveRight[0], 0, B.gloveRight[2]], [a[0], 0, a[2]], [bb[0], 0, bb[2]]);
        if (flat.d < R.glove + 0.04) {
          const y = a[1] + (bb[1] - a[1]) * flat.t;
          lim.over = Math.min(lim.over, B.gloveRight[1] - y - need);
        }
      }
      if (f.n >= 4 && f.n <= 7) {
        const gg = 2 * R.glove - len(sub(B.gloveRight, J.gloveLeft));
        lim.gg = Math.max(lim.gg, gg);
        if (gg > 0) lim.ggFrames++;
      }
    }
    // (his glove and forearm, the jab's throw over, until it is home)
    if (jabDone !== null && f.n >= jabDone && f.n <= jabDone + 24 && counted && len(sub(J.gloveLeft, J.LeftArm)) > 0.32) {
      lim.head = Math.max(lim.head, R.glove + R.head - len(sub(J.gloveLeft, B.head)), R.ForeArm + R.head - segPoint(B.head, J.LeftForeArm, J.LeftHand).d);
      lim.shoulder = Math.max(lim.shoulder, R.glove + R.Arm - len(sub(J.gloveLeft, B.RightArm)), R.ForeArm + R.Arm - segPoint(B.RightArm, J.LeftForeArm, J.LeftHand).d);
    }
  }
  out.arm = Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, k === 'ggFrames' ? v : Math.abs(v) >= 9 ? null : +(v * 100).toFixed(1)]));
  return out;
}
let gloveInArm = null;
export const setGlove = g => (gloveInArm = g);
// (one frame of the arm against his, cm: for the trace)
export function armFrame(f) {
  const B = f.B.at,
    J = f.J.at,
    g = gloveInArm(B.gloveRight, J.LeftArm, J.LeftForeArm, J.LeftHand);
  let over = 9;
  for (const [a, b, most, need] of [[J.LeftForeArm, J.LeftHand, 0.8, 0.13], [J.LeftArm, J.LeftForeArm, 1, 0.15]]) {
    const bb = add(a, scale(sub(b, a), most)),
      flat = segseg([B.gloveRight[0], 0, B.gloveRight[2]], [B.gloveRight[0], 0, B.gloveRight[2]], [a[0], 0, a[2]], [bb[0], 0, bb[2]]);
    if (flat.d < R.glove + 0.04) over = Math.min(over, B.gloveRight[1] - (a[1] + (bb[1] - a[1]) * flat.t) - need);
  }
  const c = v => (Math.abs(v) >= 9 ? '-' : (v * 100).toFixed(1));
  return `in ${c(g.depth)}${g.part[0]} fore ${c(segseg(B.RightForeArm, B.RightHand, J.LeftForeArm, J.LeftHand).d)} f-up ${c(segseg(B.RightForeArm, B.RightHand, J.LeftArm, J.LeftForeArm).d)} upper ${c(segseg(B.RightArm, B.RightForeArm, J.LeftForeArm, J.LeftHand).d)} over ${c(over)} gg ${c(2 * R.glove - len(sub(B.gloveRight, J.gloveLeft)))}`;
}
const E_glove = (g, J) => gloveInArm(g, J.LeftArm, J.LeftForeArm, J.LeftHand);

const show = s =>
  `${String(s.o.lv).padEnd(3)} +${String(s.o.k).padEnd(3)} ${s.o.gap.toFixed(2)} ${s.o.foe}${s.o.corner ? ' c1' : ''} | jab ${s.jab ? `${s.jab.type}${s.jab.margin !== null ? ' ' + s.jab.margin + 'cm' : ''}${s.jab.J !== undefined ? ' ' + s.jab.J + 'Ns' : ''} @${s.jab.n}` : '-'}${s.brilliant ? ' brilliant' : ''} | went ${s.go} | ${s.blow ? `${s.blow.name} ${s.blow.type} ${s.blow.J} (${s.blow.speed} m/s ${s.blow.mass} kg)${s.blow.counter ? ' C' : ''} @${s.blow.n} arm ${s.blow.arm} elbow ${s.blow.elbowY} vy ${s.blow.descends} head ${s.blow.head}` : s.missed ? `${s.missed.name} whiff ${s.missed.margin}` : '-'} | off6 ${s.off6} step ${s.headStep} L20@${s.leftFirst.left20} A10@${s.leftFirst.ahead10} | arm ${JSON.stringify(s.arm)}`;

// ---- the sweep (§9.2): every bout of the grid fought by the checkout's engine, held to every check, one line each
export const GRID = {
  k: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
  gap: Array.from({ length: 16 }, (_, i) => +(0.86 + 0.02 * i).toFixed(2)),
  lv: GRADES,
  foe: ['1', '2', '3', '4m', '4a', '5m', '5a'],
  corner: [0, 1]
};
/* the narrow sets (§9.2), 5 grades x 5 moments x 3 distances each: the jab pressed at another moment of his beat; the face jab
   and the flicker; the other man coming in, stepping back, side-stepping; the boxer hurt, tired, holding the cross-arm guard,
   a show-off; and finishing him (knocked out) */
const NARROW_K = [1, 2, 3, 4, 5],
  NARROW_GAP = [0.94, 1.0, 1.08];
export function narrow() {
  const sets = [];
  for (const at of [0.88, 0.96, 1.04]) sets.push({ set: 'beat@' + at, at });
  sets.push({ set: 'thumb', punch: 'thumb' }, { set: 'flicker', punch: 'flicker', foe: '4a' });
  sets.push({ set: 'coming', walk: 'in' }, { set: 'going', walk: 'out' }, { set: 'side+', walk: 'left' }, { set: 'side-', walk: 'right' });
  sets.push({ set: 'hurt', hp: 30 }, { set: 'tired', breath: 0.3 }, { set: 'crossArm', techniques: ['crossCounter', 'crossArm'] });
  sets.push({ set: 'finish', finish: true });
  const out = [];
  for (const n of sets) for (const lv of GRADES) for (const k of NARROW_K) for (const gap of NARROW_GAP) out.push(Object.assign({ lv, k, gap, foe: '3', corner: 0 }, n));
  return out;
}
function narrowed(E, o) {
  const at = o.at ?? AT,
    more = {};
  if (o.punch === 'thumb') more.throws = [[at, 'jab', 'thumb']];
  if (o.punch === 'flicker') more.throws = [[at, 'jab', 'flicker']];
  const walk = { in: [-1, 0], out: [1, 0], left: [0, 1], right: [0, -1] }[o.walk];
  return Object.assign({}, o, more, {
    setup: (b, bi, ji) => {
      if (o.hp) b.fighters[bi].hp = o.hp;
      if (o.breath) b.fighters[bi].stamina = o.breath * b.fighters[bi].k.staminaMax;
      if (o.punch === 'flicker' || o.punch === 'thumb') b.fighters[ji].skills = { all: o.punch === 'flicker' ? '4a' : '4a' };
      if (o.finish) b.knockdowns = true;
    },
    walk
  });
}
// one bout of the sweep: what came of it, every check it broke (held and watched) and how deep, and the arm against his
export function bout1(E, o) {
  const entry = entryOf(E, o),
    at = o.at ?? AT,
    p0 = Math.round(at / DT) - 1,
    bout = E.freshBout(entry),
    bi = o.corner || 0,
    ji = 1 - bi,
    B = bout.fighters[bi],
    J = bout.fighters[ji],
    au = E.auditor(),
    n = Math.round(entry.loop / DT),
    res = { o: [o.set || 'grid', o.lv, o.k, o.gap, o.foe, bi], jab: null, mine: null, thrown: null, arm: null };
  au.begin(entry);
  const lim = { glove: -9, fore: 9, foreUp: 9, upper: 9, head: -9, shoulder: -9, over: 9 };
  let struck = 99,
    jabDone = null;
  for (let tick = 0; tick < n; tick++) {
    const held = bout.stop > 0,
      ctl = E.drive(entry, bout, tick * DT, DT);
    // (the other man walking as he jabs: in, out, or round)
    if (o.walk && tick >= p0 - 18 && tick <= p0 + 14) ctl[ji].move = o.walk;
    E.step(bout, ctl, DT);
    if (!(o.hp || o.finish)) B.hp = Math.max(B.hp, 1000);
    if (o.finish) {
      if (tick < p0) J.hp = 100;
      else if (tick === p0) J.hp = 0.05;
    } else J.hp = Math.max(J.hp, 1000);
    if (tick >= p0 - 8) au.frame(bout, tick);
    for (const e of bout.events) {
      if (e.type === 'punch' && e.who === bi && !res.thrown) res.thrown = e.name;
      if (e.who === ji && !res.jab && ['hit', 'graze', 'whiff', 'block', 'parry'].includes(e.type)) res.jab = [e.type, e.J !== undefined ? Math.round(e.J * 10) / 10 : null, e.margin != null ? Math.round(e.margin * 1000) / 10 : null];
      if (e.who === bi && !res.mine && ['hit', 'graze', 'whiff', 'block'].includes(e.type)) res.mine = [e.type, e.name, e.J !== undefined ? Math.round(e.J * 10) / 10 : null, tick - p0, !!e.counter, e.part === 'body' ? 'body' : e.out || (e.down ? 'down' : '')];
      if (['hit', 'block', 'parry'].includes(e.type)) struck = -1;
    }
    struck++;
    if (tick < p0 - 1 || held || struck <= 3) continue;
    const mineOut = B.action && (B.action.name === 'crossOver' || B.action.name === 'cross');
    const jab = J.action && MOVES_[J.action.name] && J.action.chain ? J.action : null;
    if (jab && jabDone === null && jab.chain.phase !== 'coil' && jab.chain.phase !== 'throw') jabDone = tick;
    if (!jab && jabDone === null && tick > p0 + 2) jabDone = tick;
    if (!mineOut && !(jabDone !== null && tick <= jabDone + 24)) continue;
    const mb = E.measure(B).at,
      mj = E.measure(J).at;
    if (mineOut) {
      lim.glove = Math.max(lim.glove, gloveInArm(mb.gloveRight, mj.LeftArm, mj.LeftForeArm, mj.LeftHand).depth);
      lim.fore = Math.min(lim.fore, segseg(mb.RightForeArm, mb.RightHand, mj.LeftForeArm, mj.LeftHand).d);
      lim.foreUp = Math.min(lim.foreUp, segseg(mb.RightForeArm, mb.RightHand, mj.LeftArm, mj.LeftForeArm).d);
      lim.upper = Math.min(lim.upper, segseg(mb.RightArm, mb.RightForeArm, mj.LeftForeArm, mj.LeftHand).d);
    }
    if (jabDone !== null && tick >= jabDone && tick <= jabDone + 24 && len(sub(mj.gloveLeft, mj.LeftArm)) > 0.32) {
      lim.head = Math.max(lim.head, R.glove + R.head - len(sub(mj.gloveLeft, mb.head)), R.ForeArm + R.head - segPoint(mb.head, mj.LeftForeArm, mj.LeftHand).d);
      lim.shoulder = Math.max(lim.shoulder, R.glove + R.Arm - len(sub(mj.gloveLeft, mb.RightArm)), R.ForeArm + R.Arm - segPoint(mb.RightArm, mj.LeftForeArm, mj.LeftHand).d);
    }
  }
  res.arm = Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, Math.abs(v) >= 9 ? null : Math.round(v * 1000) / 10]));
  const r = au.result();
  res.found = Object.fromEntries(Object.entries(r.found).filter(([, c]) => c.bad).map(([k, c]) => [k, [c.bad, Math.round(Math.abs(c.worst.value) * 100) / 100, c.worst.who, c.worst.doing]]));
  res.watched = Object.fromEntries(Object.entries(r.watched).filter(([, c]) => c.bad).map(([k, c]) => [k, [c.bad, Math.round(Math.abs(c.worst.value) * 100) / 100]]));
  return res;
}
let MOVES_ = null;
export const setMoves = m => (MOVES_ = m);
async function sweep(E, set, file) {
  MOVES_ = E.MOVES;
  const cases = [];
  if (set === 'grid') for (const lv of GRID.lv) for (const foe of GRID.foe) for (const gap of GRID.gap) for (const k of GRID.k) for (const corner of GRID.corner) cases.push({ lv, foe, gap, k, corner });
  else for (const o of narrow()) cases.push(narrowed(E, o));
  const out = [],
    t0 = Date.now();
  for (const [i, o] of cases.entries()) {
    out.push(bout1(E, o));
    if (i % 500 === 499) process.stderr.write(`${i + 1}/${cases.length} ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  }
  const text = JSON.stringify(out);
  if (file) writeFileSync(file, text);
  else console.log(text);
}
// what kind of case it is: by what came of his punch and of the jab
export const kindOf = r => {
  const jab = r.jab ? r.jab[0] : 'none',
    mine = r.mine ? r.mine[0] : 'none',
    name = r.thrown;
  if (name !== 'crossOver') return 'plain ' + (name || 'none');
  if (jab === 'hit') return 'jab lands';
  if (mine === 'hit') return jab === 'graze' ? 'jab grazes, it lands' : 'jab misses, it lands';
  return 'both miss';
};
const NOISE = 0.2;
function compare(base, now) {
  const key = r => r.o.join(' ');
  const was = new Map(base.map(r => [key(r), r])),
    table = {},
    cases = [];
  for (const r of now) {
    const b = was.get(key(r)),
      kind = kindOf(r),
      row = (table[kind] = table[kind] || { n: 0, worse: 0, noise: 0, weaker: 0, harder: 0, checks: {}, arm: { glove: 0, fore: 0, foreUp: 0, upper: 0, head: 0, shoulder: 0 } });
    row.n++;
    if (!b) continue;
    const worse = [];
    for (const [check, [bad, worst, who, doing]] of Object.entries(r.found)) {
      const old = b.found[check];
      if (!old || worst > old[1] + NOISE) worse.push({ check, now: worst, was: old ? old[1] : null, who, doing, noise: false });
      else if (worst > old[1]) worse.push({ check, now: worst, was: old[1], who, doing, noise: true });
    }
    // (his own punch: landed in base, and here lighter or not at all)
    if (b.mine && b.mine[0] === 'hit' && (!r.mine || r.mine[0] !== 'hit' || r.mine[2] < b.mine[2] - 1)) worse.push({ check: 'his punch weaker', now: r.mine ? r.mine[2] : 0, was: b.mine[2], noise: false }), row.weaker++;
    // (the jab: landed on him harder than in base)
    if (r.jab && r.jab[0] === 'hit' && (!b.jab || b.jab[0] !== 'hit' || r.jab[1] > b.jab[1] + 1)) row.harder++;
    const real = worse.filter(w => !w.noise);
    if (real.length) row.worse++, cases.push({ case: key(r), kind, worse: real });
    else if (worse.length) row.noise++;
    for (const w of real) row.checks[w.check] = (row.checks[w.check] || 0) + 1;
    // (the arm against his, §8.2: within the plan's limits, whatever the base did)
    if (r.thrown === 'crossOver' && r.arm) {
      const a = r.arm;
      if (a.glove !== null && a.glove > 2) row.arm.glove++;
      if (a.fore !== null && a.fore < 6) row.arm.fore++;
      if (a.foreUp !== null && a.foreUp < 8) row.arm.foreUp++;
      if (a.upper !== null && a.upper < 5) row.arm.upper++;
      if (a.head !== null && a.head > 2) row.arm.head++;
      if (a.shoulder !== null && a.shoulder > 5) row.arm.shoulder++;
    }
  }
  console.log(JSON.stringify({ table, cases }, null, 1));
}

// ---- the plan's "now" (§0.4, §2), measured again: what the engine does at a jab without the cross counter
async function now(E) {
  MOVES_ = E.MOVES;
  // (1) the plain cross pressed at the jab, +0..+4, at 0.92, 1.0 and 1.1 m, by 3, 4명, 5명, 5암: who lands first, how hard
  const rows = [];
  for (const gap of [0.92, 1.0, 1.1]) for (const lv of ['3', '4m', '5m', '5a']) for (const k of [0, 1, 2, 3, 4]) {
    const o = { lv, k, gap, press: 'plain' },
      s = summary(trace(E, o).frames, o);
    rows.push({ gap, lv, k, jab: s.jab, blow: s.blow });
  }
  const first = rows.filter(r => r.jab && r.jab.type === 'hit').length,
    mid = rows.filter(r => r.k >= 1 && r.jab && r.jab.type === 'hit'),
    Js = mid.map(r => r.jab.J);
  console.log(`(1) the plain cross at the jab, 60 moments: the jab lands first in ${first}; at +1..+4 (${mid.length}) the jab ${Math.min(...Js)}-${Math.max(...Js)} N·s, over 52 in ${Js.filter(j => j > 52).length}; the rest: ${rows.filter(r => !(r.jab && r.jab.type === 'hit')).map(r => `${r.lv} ${r.gap} +${r.k} jab ${r.jab && r.jab.type} ${r.jab && r.jab.J} cross ${r.blow && r.blow.J}`).join('; ')}`);
  for (const lv of ['3']) for (const k of [5, 6]) {
    const o = { lv, k, press: 'plain' },
      s = summary(trace(E, o).frames, o);
    console.log(`    ${lv} +${k}: the jab ${s.jab.type} ${s.jab.J} N·s`);
  }
  // (2) the plain cross's head, frame by frame from its press, no jab: across / ahead / up cm, by grade
  for (const lv of ['3', '4m', '5m', '5a']) {
    const o = { lv, k: 0, press: 'plain', throws: [] },
      { frames } = trace(E, o),
      f0 = frames.find(f => f.n === -1),
      s = summary(frames, o);
    console.log(`(2) the cross@${lv}: lands +${s.blow.n} ${s.blow.J} N·s; head (left/ahead/up) ${frames.filter(f => f.n >= 0 && f.n <= 8).map(f => localTo(f0, f.B.at.head, f0.yaw, f0.B.at.head)).map((h, i) => `${i}:${(h[0] * 100).toFixed(1)}/${(h[2] * 100).toFixed(1)}/${(h[1] * 100).toFixed(1)}`).join(' ')}`);
  }
  // (5) the jab frame by frame: its phase, trunk and shoulder on, the aim set, the glove from his shoulder
  {
    const o = { lv: '5m', k: null },
      { frames } = trace(E, o);
    console.log(`(5) the pro's jab: ${frames.filter(f => f.n >= 0 && f.n <= 15).map(f => `${f.n}:${f.ja ? f.ja.phase + (f.ja.aim ? 'A' : '') : '-'} ${Math.round(len(sub(f.J.at.gloveLeft, f.J.at.LeftArm)) * 100)}`).join('  ')}`);
  }
  // (6) the slip counter's landing, frames after the jab's press, by grade (src/defense.mjs counter)
  const D = await import(pathToFileURL(resolve(new URL('..', import.meta.url).pathname, 'src/defense.mjs')).href);
  console.log(`(6) the slip and counter lands: ${['2', '3', '4m', '4a', '5m', '5a'].map(lv => {
    const e = D.DEFENSE.find(x => x.id === `counter@${lv}`),
      { frames } = E.run(e, e.loop),
      p = frames.findIndex(f => f.events.some(v => v.type === 'punch' && v.who === 1)),
      h = frames.findIndex(f => f.events.some(v => v.type === 'hit' && v.who === 0));
    return `${lv} +${h - p}`;
  }).join(', ')}`);
  // (7) which counter cards take the counter's gain
  console.log(`(7) the counter's gain: ${['counter@3', 'counter@5m', 'pullCross@4m', 'pullHook@5m', 'rollCounter@4m', 'parryDown@4m', 'blockFire@4m'].map(id => {
    const e = [...D.DEFENSE, ...D.PULL_COUNTER, ...D.ROLLING, ...D.PARRY_DOWN, ...D.BLOCK_FIRE].find(x => x.id === id),
      { frames } = E.run(e, e.loop),
      h = frames.flatMap(f => f.events).find(v => v.type === 'hit' && v.who === 0);
    return `${id} ${h ? h.name + ' ' + h.J + (h.counter ? ' counter' : '') : '-'}`;
  }).join('; ')}`);
  // (8) the ladder's straight
  console.log(`(8) the straight's rungs: ${['1', '2', '3', '4m', '4a', '5m', '5a'].map(lv => `${lv} ${E.rung('cross@' + lv).J}`).join(', ')}`);
}

// ---- the cards' table (§0.2, §3.5, §8.2): each grade's card, and its window's frames
async function cards(E) {
  MOVES_ = E.MOVES;
  const W = (await import(pathToFileURL(resolve(new URL('..', import.meta.url).pathname, 'src/windows.data.mjs')).href)).WINDOWS.crossCounter;
  for (const lv of GRADES) {
    const w = W && W[lv];
    console.log(`${lv}: window +${w ? w.from : '?'}..+${w ? w.to : '?'} (card +${w ? w.at : '?'}), the straight ${E.rung('cross@' + lv).J} N·s`);
    for (let k = (w ? w.from : 1) - 1; k <= (w ? w.to : 4) + 1; k++) {
      const o = { lv, k },
        s = summary(trace(E, o).frames, o);
      console.log('  ' + show(s));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const E = await engine(opt('root', null));
  gloveInArm = E.gloveInArm;
  if (args[0] === '--trace') {
    const [lv, k, gap, foe, corner] = args.slice(1).filter((a, i, l) => !a.startsWith('--') && !(l[i - 1] || '').startsWith('--'));
    const o = { lv, k: k === 'none' ? null : +k, gap: gap ? +gap : 1, foe: foe || '3', corner: +(corner || 0), press: opt('press', 'over') },
      { frames } = trace(E, o);
    const f0 = frames.find(f => f.n === -1);
    for (const f of frames.filter(f => f.n >= -2 && f.n <= 22)) {
      const h = localTo(f0, f.B.at.head, f0.yaw, f0.B.at.head).map(v => (v * 100).toFixed(1)),
        g = localTo(f0, f.B.at.gloveRight, f0.yaw, f0.B.at.head).map(v => (v * 100).toFixed(1)),
        e = localTo(f0, f.B.at.RightForeArm, f0.yaw, f0.B.at.head).map(v => (v * 100).toFixed(1));
      if (args.includes('--arm')) {
        console.log(`${String(f.n).padStart(3)}${f.held ? 'H' : ' '} ${f.ba ? f.ba.name + '/' + f.ba.phase : '-'} | glove ${f.B.at.gloveRight.map(v => v.toFixed(3))} elbow ${f.B.at.RightForeArm.map(v => v.toFixed(2))} | his glove ${f.J.at.gloveLeft.map(v => v.toFixed(2))} elbow ${f.J.at.LeftForeArm.map(v => v.toFixed(2))} head ${f.J.at.head.map(v => v.toFixed(2))} sh ${f.J.at.LeftArm.map(v => v.toFixed(2))} | ${armFrame(f)}`);
        continue;
      }
      console.log(`${String(f.n).padStart(3)}${f.held ? 'H' : ' '} me ${f.ba ? f.ba.name + '/' + f.ba.phase : '-'} him ${f.ja ? f.ja.name + '/' + f.ja.phase + (f.ja.aim ? 'A' : '') : '-'} head[L,U,A] ${h} gloveR ${g} (y ${f.B.at.gloveRight[1].toFixed(2)}) elbow ${e} (y ${f.B.at.RightForeArm[1].toFixed(2)}) hisGlove ${f.J.at.gloveLeft.map(v => v.toFixed(2))} hisElbow ${f.J.at.LeftForeArm.map(v => v.toFixed(2))} gap ${((len(sub(f.bp.head, f.jp.L)) - 0.23) * 100).toFixed(1)} q ${f.ba && f.ba.q ? f.ba.q.map(v => v.toFixed(2)).join(',') : ''} ${f.ev.filter(x => !['punch'].includes(x.type)).map(x => x.type + ':' + (x.mine ? 'me' : 'him') + (x.J !== undefined ? ' ' + x.J : '') + (x.margin != null ? ' m' + (x.margin * 100).toFixed(1) : '')).join(' ')}`);
    }
    console.log(show(summary(frames, o)));
  } else if (args[0] === '--now') {
    await now(E);
  } else if (args[0] === '--one') {
    MOVES_ = E.MOVES;
    console.log(JSON.stringify(bout1(E, JSON.parse(args[1]))));
  } else if (args[0] === '--sweep') {
    await sweep(E, opt('set', 'grid'), opt('out', null));
  } else if (args[0] === '--compare') {
    compare(JSON.parse(readFileSync(args[1], 'utf8')), JSON.parse(readFileSync(args[2], 'utf8')));
  } else {
    await cards(E);
  }
}
