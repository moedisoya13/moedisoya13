#!/usr/bin/env node
/* What happens in every card of the catalogue, as a log of the bout's events: each script fought the way the catalogue's
   page fights it (src/catalog.mjs: tick), once round its loop (footwork twice round), and every event of either man written
   down with its frame and what it carries (who, the punch, the part met, the impulse rounded to a newton-second, a knockdown,
   out cold, a roll, a hammer, a down parry); and his guard, where he holds it: each glove from his head, in centimetres, over
   the frames his guard is up and he is doing nothing else (a guard 3 cm or more somewhere else is a change). Two logs, one of an older checkout's scripts, can be compared: that is how the
   catalogue's rows are marked new or changed since the catalogue was last published (src/catalog.mjs: SINCE).
     node tools/events.mjs [--root dir] [--only id,id] > log.json   the log of the scripts of the checkout at dir (by default
                                                                     this one), read from its own src
     node tools/events.mjs --diff old.json new.json                 the cards whose logs differ, and how */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2),
  opt = n => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null);
const DT = 1 / 60;
// what of an event is written down (the rest moves with every frame and says nothing about what happened)
const KEEP = ['who', 'on', 'name', 'part', 'hand', 'down', 'out', 'roll', 'hammer', 'of', 'foul', 'tech'];
const TYPES = ['hit', 'graze', 'block', 'parry', 'whiff', 'brilliant', 'foul', 'paw', 'collar', 'buckle', 'roll', 'taunt', 'punch', 'dash', 'wave', 'follow', 'pull'];

// every script the catalogue of that checkout can show, by id (what its page shows, and what this one's shows)
async function scripts(root) {
  const src = f => import(pathToFileURL(resolve(root, 'src', f)).href),
    mods = await Promise.all(['footwork.mjs', 'defense.mjs', 'ladder.mjs', 'bodyshots.mjs', 'combos.mjs'].map(f => src(f).catch(() => ({})))),
    [foot, defense, ladder, body, combos] = mods,
    lists = [
      foot.ENTRIES,
      // (every list of cards the page shows: the counters out of a pull, a cross-arm, a block and a shell, and the shift, with the rest)
      ...['DEFENSE', 'PARRY_DOWN', 'CROSS_ARM', 'CROSS_BODY', 'ROLLING', 'PULL_COUNTER', 'BLOCK_FIRE', 'SHELL'].map(k => defense[k]),
      ...['STANCES', 'LADDER', 'DIRTY', 'FOOTWORK', 'ENTRY', 'SHOWOFF', 'TAUNTING', 'BODY_LADDER', 'REAR_LADDER', 'WAVING', 'SHIFTING', 'WALKING'].map(k => ladder[k]),
      body.BODYSHOTS,
      body.LIVER_BLOCK,
      // (the combinations, each a row of its own: src/combos.mjs, docs/combos-plan.md §9.1)
      combos.COMBINATIONS
    ];
  const { step } = await src('game/bout.mjs');
  return { all: lists.filter(Boolean).flat(), step, freshBout: foot.freshBout, drive: foot.drive };
}
// one card, fought as the page fights it: the other man kept standing, the boxer too unless the card is about being hurt
function fight(e, { step, freshBout, drive }) {
  const bout = freshBout(e),
    [a, b] = bout.fighters,
    exchange = e.punch !== undefined || !!e.fresh,
    n = Math.round((exchange ? e.loop : 2 * e.loop) / DT),
    out = [],
    held = { n: 0, at: [0, 0, 0, 0, 0, 0] };
  for (let tick = 0; tick < n; tick++) {
    step(bout, drive(e, bout, tick * DT, DT), DT);
    b.hp = 1000;
    if (!e.hurt) a.hp = 1000;
    // (his guard as he holds it, in his own terms: each glove from his head, across, up, ahead)
    if (a.cover && !a.action && a.points && a.points.head) {
      const c = Math.cos(a.yaw),
        s = Math.sin(a.yaw);
      ['L', 'R'].forEach((k, i) => {
        const d = a.points[k].map((v, j) => v - a.points.head[j]);
        held.at[3 * i] += c * d[0] - s * d[2];
        held.at[3 * i + 1] += d[1];
        held.at[3 * i + 2] += s * d[0] + c * d[2];
      });
      held.n++;
    }
    for (const ev of bout.events) {
      if (!TYPES.includes(ev.type)) continue;
      const x = { f: tick, type: ev.type };
      for (const k of KEEP) if (ev[k] !== undefined && ev[k] !== null && ev[k] !== false) x[k] = ev[k];
      if (typeof ev.J === 'number') x.J = Math.round(ev.J);
      out.push(x);
    }
  }
  if (held.n >= 10) out.push({ guard: held.at.map(v => Math.round((v / held.n) * 100)) });
  return out;
}
const said = x =>
  x.guard ? `guard ${x.guard.join(' ')}` : `${x.f} ${x.type}${x.who !== undefined ? ' ' + x.who : ''}${x.on !== undefined ? ' on ' + x.on : ''}${x.name ? ' ' + x.name : ''}${x.part ? ' ' + x.part : ''}${x.J !== undefined ? ' ' + x.J + 'Ns' : ''}${['down', 'out', 'roll', 'hammer'].filter(k => x[k]).map(k => ' ' + k).join('')}`;

if (opt('diff') || args[0] === '--diff') {
  const [older, newer] = args.filter(a => a !== '--diff').map(f => JSON.parse(readFileSync(f, 'utf8'))),
    report = { new: [], changed: {}, gone: [] };
  for (const id of Object.keys(newer)) {
    if (!(id in older)) {
      report.new.push(id);
      continue;
    }
    // (the events, as they are written; and his guard, if it moved 3 cm or more anywhere)
    const a = older[id].filter(x => !x.guard).map(said),
      b = newer[id].filter(x => !x.guard).map(said),
      [ga, gb] = [older[id], newer[id]].map(l => (l.find(x => x.guard) || {}).guard),
      moved = ga && gb && ga.some((v, i) => Math.abs(v - gb[i]) >= 3);
    if (a.join('\n') !== b.join('\n') || moved)
      report.changed[id] = Object.assign({ was: a.filter(x => !b.includes(x)), now: b.filter(x => !a.includes(x)) }, moved ? { guard: { was: ga, now: gb } } : {});
  }
  for (const id of Object.keys(older)) if (!(id in newer)) report.gone.push(id);
  console.log(JSON.stringify(report, null, 1));
} else {
  const root = resolve(opt('root') || new URL('..', import.meta.url).pathname),
    only = opt('only') ? opt('only').split(',') : null,
    s = await scripts(root),
    log = {};
  for (const e of s.all) if (!only || only.includes(e.id)) log[e.id] = fight(e, s);
  console.log(JSON.stringify(log));
}
