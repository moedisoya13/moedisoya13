#!/usr/bin/env node
/* The grades of the defence and the footwork drills, measured (docs/defense-footwork-grades-plan.md §4, §5.2): every card of
   the catalogue's rows (src/defense.mjs, src/ladder.mjs: FOOTWORK) fought as the page fights it, and the numbers each is
   told by taken off the bout, sixty times a second. The windows themselves are tools/windows.mjs --grades.
     node tools/grades.mjs            the tables
     node tools/grades.mjs --json */
import { LEVELS } from '../src/anim/skill.mjs';
import { DEFENSE } from '../src/defense.mjs';
import { FOOTWORK } from '../src/ladder.mjs';
import { H } from '../src/anim/stance.mjs';
import { run, landings } from '../src/measure.mjs';

const DT = 1 / 60;
const find = id => DEFENSE.find(e => e.id === id) || FOOTWORK.find(e => e.id === id);
const ev = (frames, pred) => {
  for (const f of frames) for (const e of f.events) if (pred(e)) return { e, tick: f.tick };
  return null;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// one defence card
export function defence(id) {
  const entry = find(id),
    { frames } = run(entry),
    out = { id };
  const last = frames.flatMap(f => f.events.filter(e => (e.type === 'parry' ? e.on : e.who) === 1 && ['hit', 'whiff', 'block', 'parry', 'graze'].includes(e.type)).map(e => ({ e, tick: f.tick }))).pop();
  out.outcome = last ? last.e.type : null;
  out.margin = last && last.e.type === 'whiff' && last.e.margin !== null ? +(last.e.margin * 100).toFixed(1) : null;
  out.brilliant = frames.some(f => f.events.some(e => e.type === 'brilliant' && e.who === 0));
  // tied up: how long the evasion lasted
  const name = entry.press && entry.press[0] ? entry.press[0][1] : null;
  if (name) {
    const on = frames.filter(f => f.action === name);
    out.tied = on.length ? Math.round(on.length * DT * 1000) : null;
  }
  if (entry.kind === 'block' || entry.kind === 'guard') {
    const blocks = frames.flatMap(f => f.events.filter(e => e.type === 'block' && e.who === 1).map(e => ({ e, tick: f.tick })));
    out.J = blocks.length ? +blocks[blocks.length - 1].e.J.toFixed(1) : null;
    // how long until the glove that was hit is back where it was on his face (within 1.5 cm)
    if (blocks.length) {
      const b0 = blocks[0],
        i = frames.findIndex(f => f.tick === b0.tick),
        before = frames[i - 1],
        hand = b0.e.hand === 'L' ? 'R' : 'L',
        rest = k => dist(before.gloves[k], before.gloves.head);
      let back = null;
      for (let j = i + 2; j < frames.length; j++)
        if (['L', 'R'].every(k => Math.abs(dist(frames[j].gloves[k], frames[j].gloves.head) - rest(k)) < 0.015)) {
          back = Math.round((frames[j].tick - b0.tick) * DT * 1000);
          break;
        }
      out.guardBack = back;
      out.hand = hand;
      // pushed: how far he went from the first block to the end
      out.pushed = +(Math.hypot(frames[frames.length - 1].at[0] - before.at[0], frames[frames.length - 1].at[1] - before.at[1]) * 100).toFixed(1);
    }
    const up = frames.filter(f => f.cover);
    out.gap = up.length ? +((up.reduce((s, f) => s + dist(f.gloves.L, f.gloves.R), 0) / up.length - 0.2) * 100).toFixed(1) : null;
  }
  if (entry.kind === 'counter') {
    const whiff = ev(frames, e => e.type === 'whiff' && e.who === 1),
      hit = ev(frames, e => e.type === 'hit' && e.who === 0),
      punch = ev(frames, e => e.type === 'punch' && e.who === 0);
    out.after = whiff && hit ? Math.round((hit.tick - whiff.tick) * DT * 1000) : null;
    out.counterJ = hit ? hit.e.J : null;
    out.flight = punch && hit ? Math.round((hit.tick - punch.tick) * DT * 1000) : null;
  }
  return out;
}

// one footwork card
export function drill(id) {
  const entry = find(id),
    { frames } = run(entry, entry.loop * (entry.stick ? 2 : 1)),
    out = { id },
    settled = frames.filter(f => f.tick * DT > 0.15),
    w = f => Math.hypot(f.foot.L[0] - f.foot.R[0], f.foot.L[2] - f.foot.R[2]),
    w0 = w(settled[0]);
  out.width = Math.round((Math.min(...settled.map(w)) / w0) * 100);
  // (crossed: the lead foot more than 2 cm to the right of the rear one, in his own terms; how far, cm)
  out.cross = +(Math.max(0, ...settled.map(f => f.foot.R[0] - f.foot.L[0])) * 100).toFixed(1);
  out.crossed = out.cross > 2;
  out.face = Math.round((Math.max(...frames.filter(f => f.tick * DT > 0.3).map(f => Math.abs(f.face))) * 180) / Math.PI);
  const land = landings(frames),
    gaps = land.slice(1).map((l, i) => (l.tick - land[i].tick) * DT),
    mean = gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1);
  out.cv = +(Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length || 1)) / mean).toFixed(3);
  out.cycle = +(mean * 6).toFixed(2); // (six half beats: a pendulum's swing)
  if (entry.item === 'dash') {
    const d = ev(frames, e => e.type === 'dash' && e.who === 0),
      i = frames.findIndex(f => f.tick === d.tick),
      y0 = frames.slice(Math.max(0, i - 12), i).reduce((s, f) => s + f.hipsY, 0) / Math.min(12, i),
      during = frames.slice(i, i + 40);
    out.hips = +((Math.max(...during.map(f => f.hipsY)) - y0) * 100).toFixed(1);
    out.dip = +((Math.min(...during.map(f => f.hipsY)) - y0) * 100).toFixed(1);
    const free = frames.slice(i).findIndex(f => f.action !== 'dash');
    out.free = Math.round(free * DT * 1000);
    out.travelled = +(Math.hypot(frames[i + 50].at[0] - frames[i].at[0], frames[i + 50].at[1] - frames[i].at[1]) * 100).toFixed(1);
  }
  if (entry.item === 'stepjab' || entry.item === 'onetwo') {
    const hits = frames.flatMap(f => f.events.filter(e => e.type === 'hit' && e.who === 0).map(e => ({ name: e.name, tick: f.tick }))),
      jab = hits.find(h => h.name === 'jab'),
      cross = hits.find(h => h.name === 'cross'),
      leads = land.filter(l => l.foot === 'L');
    if (jab && leads.length) {
      const near = leads.reduce((b, l) => (Math.abs(l.tick - jab.tick) < Math.abs(b.tick - jab.tick) ? l : b)),
        any = land.reduce((b, l) => (Math.abs(l.tick - jab.tick) < Math.abs(b.tick - jab.tick) ? l : b));
      out.landing = Math.round((jab.tick - near.tick) * DT * 1000);
      out.anyLanding = Math.round((jab.tick - any.tick) * DT * 1000);
    }
    if (jab && cross) out.interval = +(((cross.tick - jab.tick) * DT) / H).toFixed(2);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const defs = ['slip', 'slip-cross', 'pull', 'duck', 'roll', 'parry', 'block', 'guard', 'counter'].map(item => ({ item, rows: LEVELS.map(lv => defence(`${item}@${lv}`)) }));
  const drills = ['pendulum', 'inout', 'side', 'circle', 'turn', 'stalk', 'dash', 'stepjab', 'onetwo'].map(item => ({ item, rows: LEVELS.map(lv => drill(`${item}@${lv}`)) }));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ defs, drills }, null, 1));
  else {
    console.log('defence      ' + LEVELS.map(l => l.padEnd(22)).join(''));
    for (const { item, rows } of defs)
      console.log(item.padEnd(13) + rows.map(r => `${r.outcome}${r.brilliant ? '!' : ''} ${r.margin ?? ''}${r.tied ? ' t' + r.tied : ''}${r.J !== undefined ? ` J${r.J} g${r.guardBack} p${r.pushed} gap${r.gap}` : ''}${r.after !== undefined ? ` +${r.after} ${r.counterJ}` : ''}`.padEnd(22)).join(''));
    console.log('\ndrill        ' + LEVELS.map(l => l.padEnd(22)).join(''));
    for (const { item, rows } of drills)
      console.log(item.padEnd(13) + rows.map(r => `w${r.width} f${r.face} cv${r.cv}${r.crossed ? ' X' : ''}${r.hips !== undefined ? ` h${r.hips}/${r.dip} ${r.free}ms ${r.travelled}cm` : ''}${r.landing !== undefined ? ` L${r.landing}/${r.anyLanding}` : ''}${r.interval !== undefined ? ` i${r.interval}` : ''}`.padEnd(22)).join(''));
  }
}
