#!/usr/bin/env node
/* A legend's movement (docs/moves-plan-4.md §12, anim/legend.mjs), measured on the catalogue's footwork cards at every grade:
     going round and side to side   each step taken faster than 0.6 m/s: how far the head goes across his hips, up and down
                                    (its height), and how many frames from the foot landing it is lowest (measure.mjs: steps);
                                    and the half beat while he goes (seconds)
     stepping in and out            the most the head goes across (to his right) going in, and back coming out, against the
                                    quarter second before, in each of three loops
     dashing back, in, to the side  the lowest the head goes under his guard's height, and the most it goes across and ahead
                                    of his hips, against the frame before the dash
     node tools/legend.mjs          the table
     node tools/legend.mjs --json */
import { LEVELS } from '../src/anim/skill.mjs';
import { FOOTWORK } from '../src/ladder.mjs';
import { run, steps, guardOf, landings } from '../src/measure.mjs';

const DT = 1 / 60;
const card = id => FOOTWORK.find(e => e.id === id);
const rel = f => {
  const h = f.gloves.head,
    p = f.joints.Hips,
    d = [h[0] - p[0], h[2] - p[2]];
  return [d[0] * Math.cos(f.yaw) - d[1] * Math.sin(f.yaw), d[0] * Math.sin(f.yaw) + d[1] * Math.cos(f.yaw)];
};
const r1 = x => +x.toFixed(1);
const span = a => (a.length ? [r1(Math.min(...a)), r1(Math.max(...a))] : null);

function going(id) {
  const e = card(id),
    { frames } = run(e, e.loop * 2),
    s = steps(frames, 0.6),
    land = landings(frames),
    halves = s.map(x => {
      const k = land.findIndex(l => l.tick === x.tick);
      return k > 0 ? (land[k].tick - land[k - 1].tick) * DT : null;
    }).filter(Boolean);
  return { steps: s.length, side: span(s.map(x => x.side)), up: span(s.map(x => x.up)), low: span(s.map(x => x.low)), half: halves.length ? +(halves.reduce((a, b) => a + b, 0) / halves.length).toFixed(3) : null };
}
function inout(id) {
  const e = card(id),
    { frames } = run(e, e.loop * 3),
    L = Math.round(e.loop / DT),
    mean = (fr, k) => fr.reduce((s, f) => s + rel(f)[k], 0) / fr.length,
    out = { slip: [], sway: [] };
  for (let k = 0; k < 3; k++) {
    const seg = (a, b) => frames.slice(k * L + Math.round(a / DT), k * L + Math.round(b / DT));
    out.slip.push(r1((Math.min(...seg(0.3, 0.95).map(f => rel(f)[0])) - mean(seg(0.05, 0.3), 0)) * 100));
    out.sway.push(r1((Math.min(...seg(1.5, 2.2).map(f => rel(f)[1])) - mean(seg(1.25, 1.5), 1)) * 100));
  }
  return out;
}
function dash(id, level) {
  const { frames } = run(card(id)),
    i = frames.findIndex(f => f.events.some(e => e.type === 'dash' && e.who === 0)),
    win = frames.slice(i, i + 40),
    r0 = rel(frames[i - 1]),
    low = Math.min(...win.map(f => f.headY));
  return { under: r1((guardOf(level).headY - low) * 100), at: win.findIndex(f => f.headY === low), across: span(win.map(f => (rel(f)[0] - r0[0]) * 100)), ahead: span(win.map(f => (rel(f)[1] - r0[1]) * 100)) };
}

const rows = LEVELS.map(lv => ({
  level: lv,
  circle: going(`circle@${lv}`),
  side: going(`side@${lv}`),
  inout: inout(`inout@${lv}`),
  dash: dash(`dash@${lv}`, lv),
  dashIn: dash(`dashIn@${lv}`, lv),
  dashSide: dash(`dashSide@${lv}`, lv)
}));
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else
  for (const r of rows) {
    const g = x => `${x.steps} steps, across ${x.side ? x.side.join('–') : '–'}, up ${x.up ? x.up.join('–') : '–'} cm, lowest ${x.low ? x.low.join('..') : '–'} f, half beat ${x.half} s`,
      d = x => `under ${x.under} cm (+${x.at} f), across ${x.across.join('..')}, ahead ${x.ahead.join('..')}`;
    console.log(`${r.level}\n  circle   ${g(r.circle)}\n  side     ${g(r.side)}\n  in/out   slip ${r.inout.slip.join(' ')} cm, sway ${r.inout.sway.join(' ')} cm\n  dash     ${d(r.dash)}\n  dashIn   ${d(r.dashIn)}\n  dashSide ${d(r.dashSide)}`);
  }
